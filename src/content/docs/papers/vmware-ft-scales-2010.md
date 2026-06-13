---
title: "Fault-Tolerant Virtual Machines that Scale (VMware SCALEs)"
来源: https://courses.cs.washington.edu/courses/cse453/14au/papers/scales-sosp2010-vmft.pdf
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Fault-Tolerant Virtual Machines that Scale — 学习笔记

## 0. 一句话总结

VMware 提出了一套叫 **SCALEs** 的框架，让虚拟机（VM）能在物理机宕机时自动切换到备用机继续运行，而且这套框架能管理 **几千台** 服务器的大规模集群。

## 1. 从日常类比开始

想象你有一群外卖骑手：

- 每个骑手送一份外卖（跑一个 VM）
- 突然某个骑手的车坏了（物理机宕机）
- 传统做法：那份外卖作废，客户等下一份
- SCALEs 的做法：旁边另一个骑手接到指令，**把没送完的外卖继续送**

问题在于：骑手怎么知道自己"手里还拿着什么"？订单信息在哪？外卖在哪？骑手之间的交接要多久？

SCALEs 解决的就是这个问题——**在大规模数据中心里，机器坏了，它的 VM 能快速、透明地切到别的机器上继续跑。**

## 2. 为什么要做这件事

### 2.1 现实痛点

在 VMware 自己的数据中心里：

- 物理服务器有 **数千台**
- 每台服务器上跑着 **几十个 VM**
- 硬盘是直连的（DAS），不是共享存储
- 机器宕机是日常事（硬件故障、维护、升级）

传统方案有两个极端：

| 方案 | 做法 | 问题 |
|------|------|------|
| 共享存储（SAN/NAS） | 所有 VM 磁盘放在共享阵列上 | 宕机恢复要 **几十秒到几分钟**，而且 SAN 本身有单点故障 |
| 虚拟机迁移（vMotion） | 事先把 VM 热迁移走 | 只能预防性切换，**不能应对突发宕机** |

### 2.2 SCALEs 的目标

1. **快速故障切换**：宕机后几秒内恢复
2. **不需要共享存储**：直接用每台机器自己的本地磁盘
3. **水平扩展**：能管几千台机器，不是十几台
4. **对 VM 透明**：VM 里运行的操作系统完全不知道外面发生了切换

## 3. 核心概念拆解

### 3.1 问题为什么难？

一个运行中的 VM 有三样东西：

1. **CPU 状态**：寄存器、指令指针
2. **内存**：几百 GB 的运行数据
3. **磁盘 I/O**：正在写的硬盘数据

传统虚拟化（VMware ESX）把 **CPU + 内存** 的状态迁移做得很好（vMotion 几秒钟）。但 **磁盘 I/O** 是个大坑——如果 VM 正在往自己的本地磁盘写数据，那台机器突然死了，数据就丢了，别的机器不知道写到哪了。

### 3.2 SCALEs 的思路：把本地磁盘变成"伪共享存储"

SCALEs 的核心直觉是：

> 既然每台机器有自己的本地磁盘，那我们把 **所有机器上的本地磁盘组织成一个逻辑上的共享存储池**。任何 VM 的磁盘 I/O 请求，都可以被路由到任意一台物理机的本地磁盘去执行。

这样，当物理机 A 宕机时：

1. VM 的磁盘数据其实可能已经被写到了物理机 B、C、D 的本地磁盘上
2. 新的虚拟机启动在物理机 E 上
3. 物理机 E 去 B、C、D 上读回数据
4. VM 从最近的位置继续跑

**类比**：你写日记不只写在一本笔记本里，而是写在一个"分布式日记系统"里——你写一句话，系统自动帮你存在好几台朋友的笔记本上。你丢了笔记本也不怕。

### 3.3 关键设计：Storage VMotion + I/O Redirection

```
  客户端程序
      │
      ▼
  [ 虚拟机 OS ]  （完全不知道外面发生了什么）
      │
      ▼
  [ VMX Hypervisor ]
      │
      ├── CPU/内存状态 → vMotion 迁移
      │
      └── 磁盘 I/O 请求
            │
            ▼
      [ Storage Client 模块 ]
            │
            ▼
      [ 网络 ]  ——  I/O 请求被发送到 Storage Server ──▶
            │                                     │
            ▼                                     ▼
      本地磁盘操作                    Storage Server 在远程物理机上操作本地磁盘
```

两个关键模块：

1. **Storage Client**：运行在每个物理机上的轻量模块，拦截 VM 的磁盘 I/O 请求，通过网络转发给真正存有数据的 Storage Server
2. **Storage Server**：在每台物理机上运行，接收其他 Storage Client 的请求，操作自己本地的磁盘

**类比**：

- Storage Client = 餐厅的点餐员（你点了一份牛排）
- Storage Server = 厨房（真正煎牛排的地方）
- 你（VM）以为自己在本地吃牛排，其实牛排是从隔壁厨房送来的

## 4. 代码示例

### 示例 1：I/O 请求被重定向的流程

这是一个简化版的 Storage Client 拦截 I/O 的逻辑：

```python
class StorageClient:
    """运行在每个物理机上的 I/O 转发模块（简化版）"""

    def __init__(self, local_disk_path, cluster_servers):
        self.local_disk = local_disk_path
        self.servers = cluster_servers  # 所有 Storage Server 的地址列表
        self.lease_manager = LeaseManager(cluster_servers)

    def write_sector(self, vm_id, lba, data):
        """
        VM 写一个扇区（逻辑块地址 LBA）时，
        这个函数决定数据存在哪里。
        """
        # 第一步：找租约 —— 这块磁盘数据目前在哪个物理机上"主理"
        lease = self.lease_manager.acquire(vm_id, lba)

        # 第二步：通过 iSCSI 协议把写请求发给 Storage Server
        response = lease.server.send_iscsi_write(
            lun=lease.lun,
            lba=lba,
            data=data
        )

        # 第三步：如果 Storage Server 说写成功了，也写一份到本地
        #       （作为缓存，下次同 VM 在这台机器上跑就不用网络了）
        if response.success:
            self._write_local_cache(vm_id, lba, data)

        return response

    def read_sector(self, vm_id, lba):
        """读一个扇区，优先走缓存，没有就找 Storage Server"""
        cached = self._read_local_cache(vm_id, lba)
        if cached:
            return cached

        lease = self.lease_manager.acquire(vm_id, lba)
        return lease.server.send_iscsi_read(lun=lease.lun, lba=lba)
```

**解释**：VM 觉得自己直接读写磁盘，但实际上每次读写可能被转发到网络上的另一台机器。VM 完全不知道。

### 示例 2：租约管理（Lease Management）

租约是 SCALEs 里最关键的概念之一。它确保 **任何时候同一块磁盘数据只有一个地方能写**，避免数据冲突。

```python
class LeaseManager:
    """
    租约管理器 —— 类似"磁盘区块的房东"。
    每个 VM 的磁盘区块（LUN）都有一个当前"主理"的 Storage Server。
    租约就是"主理权"。
    """

    def __init__(self, all_servers):
        self.servers = all_servers
        # 租约过期时间（毫秒）—— 如果 Storage Server 在这段时间内没"续租"，
        # 租约自动失效，其他 Server 可以抢过来
        self.lease_timeout_ms = 3000

    def acquire(self, vm_id, lun_id):
        """
        为某个 VM 的 LUN 获取租约。
        返回：Lease 对象，包含当前主理这个 LUN 的 Storage Server 地址。
        """
        # 第一步：尝试联系当前的主理 Server
        current_server = self._lookup_lease(vm_id, lun_id)

        if current_server and self._is_lease_valid(current_server, lun_id):
            # 租约还有效，续租
            current_server.lease_renew(vm_id, lun_id)
            return Lease(current_server, lun_id)

        # 第二步：租约过期或不存在 —— 需要选举新的主理
        # 用简单的投票机制：向其他所有 Server 申请租约
        votes = self._request_lease_votes(vm_id, lun_id)

        # 谁拿到多数票谁当主理
        winner = self._determine_winner(votes)
        winner.lease_acquire(vm_id, lun_id)
        self._update_lease_cache(vm_id, lun_id, winner)

        return Lease(winner, lun_id)

    def _is_lease_valid(self, server, lun_id):
        """检查租约是否还有效（没过期）"""
        last_renew = self._get_last_renew_time(server, lun_id)
        return (time_ms() - last_renew) < self.lease_timeout_ms
```

**类比**：租约就像会议室的预约——你在 3 分钟内不续期，别人就可以抢走这间会议室。这样如果某台 Storage Server 死了，租约会自动过期，其他 Server 接力。

### 示例 3：故障切换流程

```python
class FaultTolerantVM:
    """
    一个容错虚拟机的切换流程（简化版）。
    当监控发现主物理机宕机时触发。
    """

    def on_host_failure(self, vm_id, standby_host):
        """
        物理机宕机了，standby_host 是备用的物理机。
        """
        # 第一步：取消所有租约 —— 防止旧的主理 Server 还在写数据
        self.lease_manager.invalidate_all(vm_id)

        # 第二步：在备用物理机上启动新的虚拟机
        new_vm = self.vm_launcher.launch(
            vm_id=vm_id,
            host=standby_host
        )

        # 第三步：恢复 CPU + 内存状态（通过 vMotion 之前同步的副本）
        new_vm.restore_state(self.state_store.read(vm_id))

        # 第四步：恢复磁盘 I/O —— Storage Client 会自动从
        #         各个 Storage Server 上读取最近的数据
        new_vm.start()

        print(f"VM {vm_id} recovered on {standby_host}")
```

## 5. 技术细节深挖

### 5.1 租约锁（Lease Locking）

租约是 SCALEs 的基石。它解决了一个经典问题：**分布式系统中的写冲突**。

```
  场景：VM A 正在往磁盘写数据
       突然物理机 B（运行 VM A 的机器）死了

  问题：如果租约不过期，其他机器无法"接管"这块磁盘
  解决：租约有 TTL（生存时间），过期自动释放

  过程：
  ┌─────────────┐     租约续期       ┌──────────────┐
  │  Storage    │ ──────────────▶   │ Lease Manager │
  │  Server B   │  (每 100ms 一次)   │  (协调者)     │
  └─────────────┘                   └──────────────┘
         │                                │
         │  ✗ 续期失败（B 死了）           │
         ▼                                ▼
     租约过期                      其他 Server 抢租约
         │                                │
         ▼                                ▼
     VM 切到新机器                    Server C 获得租约
```

### 5.2 性能优化：本地缓存

每次 I/O 都走网络太慢了。SCALEs 做了两层优化：

1. **写缓存（Write Cache）**：Storage Client 会把写操作先缓存在本地，下次同一个 VM 在这台机器上运行时直接命中
2. **读预取（Readahead）**：预测 VM 接下来要读什么数据，提前从 Storage Server 拉过来

### 5.3 扩展性：为什么能管几千台机器？

SCALEs 用了分层架构：

- 每台物理机上的 Storage Client/Server 是 **轻量进程**，开销很小
- 租约管理不用中央协调器，用 **分布式投票**，没有单点瓶颈
- I/O 路径走 **iSCSI over RDMA/TOE**（TCP 卸载），减少 CPU 负担

## 6. 和 vSphere High Availability 的关系

SCALEs 论文里的技术后来被整合进了 VMware vSphere 的两个产品：

| 产品 | 功能 | 关系 |
|------|------|------|
| **vSphere HA** | 物理机宕机时自动重启 VM | 基础版，不涉及数据一致性保证 |
| **vSphere FT** | 虚拟机实时镜像，零数据丢失 | 用了 SCALEs 的思路做磁盘 I/O 一致性 |

简单说：**SCALEs 是 vSphere 容错功能的"学术版原型"。**

## 7. 关键收获

1. **本地磁盘可以模拟共享存储**：只要加一层 I/O 重定向，不需要昂贵的 SAN 阵列
2. **租约锁是分布式写的关键**：TTL + 续租 + 投票，简单但有效
3. **透明性比性能更重要**：VM 完全不知道切换发生了，这对企业级产品是必须的
4. **规模决定架构**：十几台机器和几千台机器的容错方案完全不同，SCALEs 的设计就是为大规模定制的

## 8. 思考题

- 如果两台物理机同时宕机，SCALEs 能处理吗？数据一致性如何保证？
- 租约锁的 TTL 设多少合适？太长切换慢，太短误判多
- 如果网络分区（partition），Storage Client 和 Storage Server 断开了，怎么办？

## 9. 延伸阅读

- VMware vSphere HA 官方文档
- vMotion 论文：Live Migration of Running Virtual Machines（同样来自 MIT 6.824）
- Google Borg 论文：Large-scale cluster management at Google with Borg
- Kubernetes 的 Volume Attachment 机制（现代版"租约锁"）
