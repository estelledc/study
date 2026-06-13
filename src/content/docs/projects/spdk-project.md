---
title: SPDK 零基础学习笔记
来源: https://spdk.io/
日期: 2026-06-13
分类_原始: 系统编程
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

# SPDK 零基础学习笔记

## 一、SPDK 是什么？

SPDK 的全称是 **Storage Performance Development Kit**（存储性能开发套件）。

它是一套由 Intel 发起、现在由 Linux 基金会托管的开源工具库，用来**写出跑得飞快的存储程序**。

## 二、先从一个类比开始

想象你有一个超级快的快递仓库（NVMe SSD），和一个小管家（Linux 内核）。

**传统的做法（内核态驱动）**：

每当你想取货时，你需要：
1. 给小管家打电话（系统调用）
2. 小管家穿过一扇门，跑到仓库去取货
3. 小管家再穿过一扇门，把货拿回来

每次"穿过门"就是一个 **context switch（上下文切换）**，每次"小管家跑去跑去"就是内核态和用户态之间的切换。这些动作本身会浪费大量时间。

**SPDK 的做法（用户态驱动）**：

SPDK 直接把仓库的门拆了——**把驱动搬到用户态**，让你的程序直接操作 SSD 硬件，不用经过内核。而且它用"轮询"的方式（不停地问"货到了吗？"），而不是"等中断"（等着收通知）。

结果就是：**省掉了内核这一层中转，性能大幅提升**。

## 三、核心概念

### 1. 用户态驱动（User-mode Drivers）

传统存储驱动运行在内核空间，每次 I/O 都要经过内核。SPDK 把 NVMe、iSCSI 等驱动直接搬到用户态，程序可以零拷贝地直接读写 SSD。

类比：以前去银行要经过大堂经理（内核）转交，现在有了 VIP 通道，直接到柜台办理。

### 2. 轮询模式（Poll-mode）

SPDK 不使用操作系统的中断机制，而是让线程不停地检查设备状态（"货到了吗？到了吗？到了吗？"）。虽然看起来"浪费 CPU"，但实际上省去了中断处理的开销，总体更快。

### 3. 线程-核心绑定（Thread-per-core）

每个线程绑定到一个 CPU 核心，每个 NVMe 队列对（queue pair）只由一个线程使用。**零锁设计**——没有锁，就没有锁竞争，性能线性扩展。

### 4. Reactor 事件循环

SPDK 使用类似 Reactor 的事件循环模型。每个核心运行一个 reactor，不断 poll 事件、处理 I/O 完成。

### 5. JSON-RPC 管理接口

SPDK 内建了一个 JSON-RPC 2.0 服务器，外部工具（如 Python 脚本 `rpc.py`）可以通过它动态配置 SPDK 的各个组件。

## 四、SPDK 包含的主要组件

- **NVMe 驱动** — 直接操作本地或远程 NVMe SSD
- **NVMe over Fabrics (NVMf) Target** — 通过网络把 NVMe 设备分享给其他机器
- **iSCSI Target** — 通过 TCP/IP 远程提供块存储
- **vhost Target** — 为虚拟机（QEMU/KVM）提供本地存储服务
- **Virtio-SCSI 驱动** — 半虚拟化 SCSI 设备驱动

## 五、代码示例

### 示例一：用 Python 的 JSON-RPC 创建虚拟块设备

SPDK 提供了一套 Python 绑定，可以通过 RPC 远程操控 SPDK。以下代码创建了一块基于内存的虚拟块设备（Malloc bdev）：

```python
from spdk.rpc import RpcClient

# 连接到运行中的 SPDK 进程
client = RpcClient()

# 创建一块 64MB 的内存块设备
# 参数：名称, 总大小(MB), 块大小(字节)
client.bdev_malloc_create(
    name="Malloc0",
    num_blocks=131072,   # 64MB / 512 bytes = 131072 个块
    block_size=512
)

# 查看已创建的所有块设备
bdevs = client.bdev_get_bdevs()
for bdev in bdevs:
    print(f"  设备名: {bdev['name']}, 大小: {bdev['blocks'] * bdev['block_size']} 字节")
```

这个类比：就像用 API 在云服务器上动态创建一块虚拟硬盘，不需要实际插拔物理设备。

### 示例二：用命令行 RPC 挂载 NVMe SSD

实际使用时，更常见的是通过 `scripts/rpc.py` 脚本操作已运行的 SPDK 目标程序（`spdk_tgt`）：

```bash
# 步骤1：启动 SPDK 目标进程（需要 root 权限和预留 hugepages）
sudo ./build/bin/spdk_tgt

# 步骤2：在另一个终端，挂载一块 NVMe SSD
sudo ./scripts/rpc.py bdev_nvme_attach_controller \
    -b Nvme0 \
    -a 0000:04:00.0 \
    -t PCIe

# 输出: Nvme0n1   ← 这就是挂载成功后生成的命名空间名

# 步骤3：查看控制器信息
sudo ./scripts/rpc.py bdev_nvme_get_controllers
```

输出类似：

```json
[
  {
    "name": "Nvme0",
    "trid": {
      "trtype": "PCIe",
      "traddr": "0000:04:00.0"
    }
  }
]
```

这个类比：`spdk_tgt` 是一个后台存储服务器，`rpc.py` 是遥控器，通过发指令把物理 SSD "挂载"到 SPDK 的管理视图下。

## 六、性能有多快？

SPDK 号称在 4K 随机读测试中，每核 IOPS 比传统 Linux 内核驱动**高 2.6 倍**。原因很简单：

- 零拷贝：数据直接从 SSD 到用户内存，不经过内核缓冲
- 无锁设计：每核一线程，没有锁竞争
- 轮询模式：避免了中断处理的开销

## 七、一句话总结

> SPDK = 把存储驱动从内核搬到用户态，用轮询代替中断，用零锁线程模型实现极致性能。

类比记忆：**SPDK 就像给 SSD 修了一条直达你程序的专用高速公路，跳过了所有红绿灯（内核）和收费站（中断处理）。**

## 八、延伸阅读

- 官方文档: https://spdk.io/doc/
- GitHub 仓库: https://github.com/spdk/spdk
- NVMe 驱动详解: https://spdk.io/doc/nvme.html
- JSON-RPC 接口文档: https://spdk.io/doc/jsonrpc.html
- NVMe over Fabrics 目标: https://spdk.io/doc/nvmf.html
- iSCSI 目标: https://spdk.io/doc/iscsi.html
- Vhost 目标: https://spdk.io/doc/vhost.html
