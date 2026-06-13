---
title: Firecracker — 为 Serverless 量身定制的轻量虚拟化
来源: https://www.usenix.org/system/files/nsdi20-paper-agache.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你经营一家**按次计费的共享厨房**（这就是 AWS Lambda 一类 serverless 平台）：

- 每个顾客（租户）带自己的菜谱和食材（任意 Linux 二进制），你只负责提供灶台和水电。
- 顾客一走，灶台必须**立刻洗干净**，给下一位用；高峰时要**几百个灶台同时开火**。
- 更麻烦的是：顾客可能互相不信任——你不能让 A 顾客的酱料瓶出现在 B 顾客的柜子里。

有三种常见做法：

| 做法 | 日常类比 | 优点 | 缺点 |
|------|----------|------|------|
| **Linux 容器**（Docker） | 大家共用同一套中央供水供电，靠隔间板分开 | 开档快、占地小 | 隔间板是软件做的；中央系统（内核）一破，全场沦陷 |
| **传统虚拟机**（QEMU+KVM） | 每位顾客单独租一整间带独立水电的商铺 | 墙是砖砌的（硬件隔离） | 装修太重：BIOS、USB、声卡……启动要几秒，空铺也占几十 MB |
| **Firecracker microVM** | 只建**极简单间**：门、电、水龙头、排水口，别的不要 | 砖墙隔离 + 单间装修极简 | 不能开餐厅（无 GPU）、不能搬家（无 live migration） |

这篇 NSDI 2020 论文由 Alexandru Agache 等 AWS 工程师撰写，讲的是第三种：**保留 KVM 硬件虚拟化的安全边界，把 QEMU 那 140 万行通用 VMM 换成约 5 万行 Rust 专用 VMM**。Firecracker 自 2018 年起支撑 AWS Lambda 与 Fargate，每月处理数万亿次请求。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 会议 | 17th USENIX NSDI，2020 年 2 月，Santa Clara |
| 页码 | 419–434 |
| 作者 | Alexandru Agache, Marc Brooker, Andreea Florescu 等（Amazon Web Services） |
| 开源 | 2018 年 12 月 Apache 2.0 发布 |
| 生产部署 | AWS Lambda、AWS Fargate |

论文要回答的核心问题：

1. **多租户 serverless** 能否同时做到 VM 级隔离与容器级密度？
2. **专门为 serverless 裁剪** 的 VMM 应长什么样——砍什么、留什么、为什么？
3. 把 Lambda 从「容器 + EC2」迁到 Firecracker，工程上踩了哪些坑？

## 为什么值得读（零基础也能建立图景）

即使你从未写过 hypervisor，这篇论文也能帮你理解今天云原生里反复出现的张力：

- **安全 vs 兼容**：容器靠 seccomp 限制 syscall，syscall 越少越安全，但用户代码越容易挂；VM 把不可信代码关进 guest 内核，宿主只需信 VMM。
- **通用 vs 专用**：QEMU 能启动 Windows、模拟声卡；Lambda 只需要 Linux + virtio 网卡/磁盘——专用工具在窄场景里能快一个数量级。
- **分层借力**：CPU 虚拟化交给 KVM（见 [[kvm-2007]]），调度/内存交给 Linux，Firecracker 只做设备模拟和 API——这和 unikernel（[[mirage-unikernel-2013]]）「只带咖啡机」是同一哲学在不同层的重演。

## 核心概念一：隔离方案的三岔路

论文第 2 节系统比较了三种隔离路线。

### Linux 容器

依赖 cgroups、namespaces、seccomp-bpf、chroot 等内核机制。问题是：**所有容器共享一个内核**。安全边界是「能调用哪些 syscall」——典型 Ubuntu 需要 224 个 syscall 才能正常运行，攻击面很难缩到足够小。侧信道（Spectre、/proc 信息泄露）也持续爆出 CVE。

### 语言虚拟机隔离

JVM、V8 isolates 等在单进程内隔离，对「跑任意 Linux 二进制」的 Lambda 不适用。

### KVM 虚拟化

每个 workload 有**自己的 guest 内核 + 独立页表**，硬件（Intel VT-x / AMD-V）负责截获特权指令。代价是传统 QEMU 太重：论文引用 Tsai 等的工作，QEMU 单独就需要多达 270 个 syscall。

**Firecracker 的立场**：保留 KVM，**替换 QEMU**。

```
传统路径:  用户代码 → guest 内核 → KVM → QEMU（140万行）→ 宿主内核

Firecracker: 用户代码 → guest 内核 → KVM → Firecracker（~5万行 Rust）→ 宿主内核
```

Figure 1（论文）对比了两种安全模型：

- **容器**：不可信代码直接打宿主内核（可能带 seccomp 沙箱）
- **虚拟化**：不可信代码只打 guest 内核；VMM + KVM 限制 guest 内核

## 核心概念二：Firecracker 刻意不做什么

论文 1.1 节「Specialization」列了一张「不做清单」——这对理解 microVM 至关重要：

| 没有的功能 | 为什么砍掉 |
|------------|------------|
| BIOS、任意内核启动 | 只支持 VMM 直接加载的 Linux 内核镜像 |
| PCI、USB、声卡、显卡 | serverless 不需要；每多一个模拟设备就多一份 TCB |
| VM live migration | Lambda slot 寿命以小时计，用完即弃 |
| 编排 / 打包 | 交给 Kubernetes、containerd；Firecracker 只替代 QEMU |
| Windows guest | 设备模型太窄 |

**一个 Firecracker 进程 = 一台 microVM**。进程边界即安全边界，运维人员用 `ps`、`top`、`kill` 就能管理整机上的上千个 microVM。

## 核心概念三：极简设备模型

Firecracker 只模拟 **5 类设备**（论文 3.1 节）：

| 设备 | 用途 |
|------|------|
| `virtio-net` | 网络（经 TUN/TAP 接到宿主） |
| `virtio-block` | 块设备磁盘（**刻意不用文件系统直通**，缩小宿主攻击面） |
| `virtio-vsock` | 宿主与客户机的高效 IPC |
| serial console | 日志与调试 |
| i8042 键盘控制器 | 不到 50 行 Rust，仅用于接收关机信号 |

对比 QEMU 的 40+ 种设备。virtio 块设备整套实现约 1400 行 Rust。

## 核心概念四：REST API 与启动流水线

Firecracker 通过 **Unix socket 上的 REST API** 配置 microVM，而不是传统 QEMU 的命令行参数。好处是：

1. 可以先 `fork` 进程、配好内核/磁盘/网络，**暂不启动**（pre-configured）
2. 需要时再 `InstanceStart`，把冷启动藏进预热池
3. OpenAPI 规范，任何语言都能调

论文测得（5.1 节，单 vCPU、256MB、裁剪内核）：

| 场景 | 典型启动时间 |
|------|--------------|
| QEMU | ~2× 于 Firecracker |
| Firecracker 端到端（含 API 配置） | 中位数约 100ms 量级 |
| Firecracker 预配置后启动 | 99 分位约 146ms |
| Ubuntu 18.04 默认内核在 Firecracker 上 | **额外 +900ms**（探测不存在的 legacy 设备） |

内存开销（5.2 节）：Firecracker 每 VM 约 **3MB**，Cloud Hypervisor ~13MB，QEMU ~**131MB**。

密度：单主机可达 **150 个 microVM/秒** 创建速率；Lambda worker 上每台跑数百至数千个 slot。

## 核心概念五：Jailer 与纵深防御

安全不只靠「代码少」：

1. **Rust**：内存安全，减少 VMM 自身漏洞
2. **Jailer**（3.4.1 节）：在启动 Firecracker 前把它关进 `chroot` + pid/network namespace + 降权 + **seccomp 白名单仅 24 个 syscall**
3. **生产加固**：禁用 SMT（超线程）、KPTI、禁用 swap、避免 samepage merging 等（见官方 prod-host-setup 文档）

## 核心概念六：在 AWS Lambda 里怎么落地

论文第 4 节是全文最有「系统感」的部分。

### 控制面与数据面

```
Invoke API → Frontend → Worker Manager（粘性路由）
                              ↓
                    Placement（约 <20ms 选 worker）
                              ↓
                    Worker 上的 MicroManager
                              ↓
              Firecracker microVM（一个 slot = 一个函数沙箱）
```

### Slot 复用

同一函数的多次调用可复用已启动的 microVM。论文 Listing 1 的 Node.js 例子：

```javascript
var i = 0;
exports.handler = async (event, context) => {
  return i++;
};
```

连续 invoke 会返回递增数字，说明 **VM 与进程状态被保留**——这是「温启动」快的原因。

### 预热池与 Little 定律

125ms 启动虽快，但 Lambda 扩容路径有时要**同步**等 slot。MicroManager 维护 **pre-booted microVM 池**。论文用 Little 定律：池大小 = 创建速率 × 创建延迟；125ms 延迟下，每秒 8 次新建就需要 1 个预热实例。

### Slot 状态机

```
Init → Idle ⇄ Busy → Dead
```

空闲 slot 占内存（约等于服务器资本成本的 40%）；忙碌时还要 CPU、缓存、网络。多租户把不同客户的函数混在同一 worker，负载近似独立，统计多路复用效率随 √N 提升——这是 serverless **经济学**的数学底座。

### 无缝迁移

2018 年起，AWS 把 Lambda 从「每客户 EC2 + 容器」迁到 **裸金属 EC2 上的 Firecracker**，**对用户无感知**。技巧：slot 最长 12 小时回收，改回收逻辑即可逐步切换；先迁内部 workload，对比 metrics，DNS 缓存配置出过一回滚。

## 代码示例一：用 REST API 启动一台 microVM

下面是与论文 3.2 节 API 模型对应的最小流程（需已安装 `firecracker` 与 `curl`）。API 走 Unix socket，故用 `--unix-socket`：

```bash
API_SOCKET="/tmp/firecracker.socket"
rm -f "$API_SOCKET"

# 1. 后台启动 Firecracker 进程，监听 API
firecracker --api-sock "$API_SOCKET" &

# 2. 配置 guest 机器：1 vCPU，128 MiB 内存
curl --unix-socket "$API_SOCKET" -X PUT \
  "http://localhost/machine-config" \
  -H "Content-Type: application/json" \
  -d '{"vcpu_count": 1, "mem_size_mib": 128, "smt": false}'

# 3. 指定内核镜像与启动参数（须为 Firecracker 裁剪过的 microvm 内核）
curl --unix-socket "$API_SOCKET" -X PUT \
  "http://localhost/boot-source" \
  -H "Content-Type: application/json" \
  -d '{
    "kernel_image_path": "/path/to/vmlinux",
    "boot_args": "console=ttyS0 reboot=k panic=1 pci=off"
  }'

# 4. 挂载 rootfs 块设备
curl --unix-socket "$API_SOCKET" -X PUT \
  "http://localhost/drives/rootfs" \
  -H "Content-Type: application/json" \
  -d '{
    "drive_id": "rootfs",
    "path_on_host": "/path/to/rootfs.ext4",
    "is_root_device": true,
    "is_read_only": false
  }'

# 5. 启动 guest
curl --unix-socket "$API_SOCKET" -X PUT \
  "http://localhost/actions" \
  -H "Content-Type: application/json" \
  -d '{"action_type": "InstanceStart"}'
```

论文强调：**预配置**（步骤 2–4 提前做完，步骤 5 在请求到来时才调）能把启动时间压到接近图 5 里的「FC-pre」曲线——这正是 Lambda 预热池的做法。

## 代码示例二：Jailer 如何把 Firecracker 关进笼子

Jailer 是独立二进制，典型调用形如：

```bash
# 示意：具体路径因发行版而异
jailer --id 12345 \
  --exec-file /usr/bin/firecracker \
  --uid 1000 --gid 1000 \
  --chroot-base-dir /srv/jailer \
  -- \
  --api-sock /run/firecracker.socket
```

Jailer 在 `exec` Firecracker 之前会：

- 创建仅含必要文件（二进制、`/dev/net/tun`、该 VM 的磁盘镜像、cgroup 文件）的 chroot
- 进入独立的 pid / network namespace
- 应用 seccomp：白名单 **24 个 syscall**，KVM ioctl 另计

即使 guest 通过漏洞攻破了 VMM 进程，逃逸后看到的仍是**极简文件系统 + 几乎无 syscall**，这是论文「多层缓解」的具体实现。

## 代码示例三：用 vsock 从宿主向 guest 发命令

Lambda 的 MicroManager 与 guest 内 shim 走 TCP/IP（论文 4.1.2），但 Firecracker 更推荐 **virtio-vsock** 做宿主↔客户机控制通道：

```bash
# 宿主侧：向 CID=3（guest）端口 1024 发送一行命令
socat VSOCK-CONNECT:3:1024 -
```

```python
# guest 内极简监听（Python 3，需内核启用 vsock）
import socket
s = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
s.bind((socket.VMADDR_CID_ANY, 1024))
s.listen(1)
conn, _ = s.accept()
print(conn.recv(1024).decode())
conn.close()
```

vsock 不经过虚拟网卡栈，延迟更低，也减少「从网络面打进 microVM」的攻击面——新人常踩的坑是以为能 `ssh root@<tap-ip>`，而生产环境往往根本不给 tap 配路由。

## 论文评估：六个设计目标达标了吗？

第 2 节提出的理想方案六条标准，第 5 节用实验回应：

| 标准 | Firecracker 结论 |
|------|------------------|
| **Isolation** | 硬件 VM 边界；配合 SMT 关闭与内核缓解应对侧信道 |
| **Overhead / Density** | ~3MB/VM；远优于 QEMU 的 ~131MB |
| **Performance** | virtio 路径足够；块 IO 当时有序列化瓶颈（论文承认，后续改进） |
| **Compatibility** | 任意 Linux 二进制，无需重编译 |
| **Fast Switching** | 125ms 级启动；150 VM/s 创建 |
| **Soft Allocation** | 依赖宿主 Linux 调度与 cgroup，VMM 内建 token-bucket 限速器 |

与 **Intel Cloud Hypervisor**（同源 rust-vmm）、**QEMU 4.2 最小构建**对比，Firecracker 在启动时间与内存开销上全面领先；块设备随机读 IOPS 则不如 QEMU 优化充分——论文坦诚这是已知限制。

## 与相关工作的位置

| 项目 | 关系 |
|------|------|
| [[kvm-2007]] | Firecracker 的 CPU/内存虚拟化底座 |
| [[xen-2003]] | 另一条 hypervisor 路线；Firecracker 是 Type-2（宿主 Linux + KVM） |
| [[denali-2002]] | 千 VM 密度思想的学术先驱 |
| [[mirage-unikernel-2013]] | 更激进地砍掉 guest OS；Firecracker 选择兼容未修改 Linux |
| Kata Containers | 也用 VM 包容器，多基于 QEMU；Firecracker 更瘦 |
| gVisor | 用户态 syscall 拦截， opposite trade-off |
| crosvm / rust-vmm | Firecracker 从 crosvm fork 后删到一半行数再演进 |

## 踩坑与误解

1. **不是容器替代品**：Firecracker 替代的是 **QEMU 那一层**，不是 Docker；编排仍靠 containerd/K8s。
2. **内核必须裁剪**：直接用 Ubuntu stock kernel 会多探测 900ms；要关 serial 日志、内置驱动、禁用模块。
3. **块 IO 耐久性**：论文发表时 Firecracker 块设备未实现 flush，高性能写入以耐久性为代价——读论文要连**评测条件**一起看。
4. **侧信道无银弹**：Meltdown/Spectre 后需宿主、固件、调度策略协同；Firecracker 文档列出长清单，不是「开了 VM 就万事大吉」。
5. **与 firecracker-2020 笔记的关系**：本仓库 [[firecracker-2020]] 是更短的速读版；本篇按论文结构展开，适合零基础第一遍精读。

## 学到什么

1. **窄场景值得重写底层**：当 95% 的 QEMU 功能用不上时，重写 VMM 比优化 QEMU 更划算。
2. **借力清单要清晰**：KVM 做虚拟化、Linux 做调度、virtio 做设备、OpenAPI 做配置——每层只做一件事。
3. **安全是架构决策**：块设备而非 fs 直通、进程 per VM、Jailer seccomp——从设计第一天就写进代码。
4. **经济学驱动技术**：125ms 不是炫技，它直接决定预热池大小与多租户能否赚钱。
5. **生产迁移可以渐进**：slot 回收替换、内外部客户分批、可回滚——论文第 4.3 节是值得复制的 playbook。

## 延伸阅读

- 论文 PDF：[Firecracker: Lightweight Virtualization for Serverless Applications](https://www.usenix.org/system/files/nsdi20-paper-agache.pdf)
- 官方站点：[firecracker-microvm.github.io](https://firecracker-microvm.github.io/)
- 复现实验数据：[nsdi2020-data](https://github.com/firecracker-microvm/nsdi2020-data)
- 生产宿主加固：[prod-host-setup.md](https://github.com/firecracker-microvm/firecracker/blob/master/docs/prod-host-setup.md)
- Jeff Barr 博文：[Firecracker – Lightweight Virtualization for Serverless Computing](https://aws.amazon.com/blogs/aws/firecracker-lightweight-virtualization-for-serverless-computing/)

## 关联

- [[kvm-2007]] — Linux 内核如何变成 hypervisor
- [[xen-2003]] — 半虚拟化时代的另一条路
- [[denali-2002]] — 高密度轻量 VM 的早期实验
- [[mirage-unikernel-2013]] — 编译期裁 OS 的极端方案
- [[firecracker-2020]] — 本主题的短笔记版本
- [[on-demand-container-loading]] — Lambda 上块设备与镜像加载的后续工程

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
