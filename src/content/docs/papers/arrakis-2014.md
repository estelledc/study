---
title: Arrakis 2014 — 让操作系统退出数据路径
来源: 'Peter et al., "Arrakis: The Operating System is the Control Plane", OSDI 2014'
日期: 2026-06-24
分类: 操作系统
难度: 中级
---

## 是什么

Arrakis 是一个**让应用直接和硬件对话、操作系统只管"谁能做什么"**的实验性操作系统。日常类比：传统操作系统像一个柜台窗口——你每次寄快递（发网络包）都要排队、填表、让工作人员转交；Arrakis 把快递分拣机直接搬到你桌上，你自己扫码发件，窗口只负责发你工牌（权限）。

核心思路：利用现代硬件（SR-IOV 网卡、IOMMU）把 I/O 设备虚拟化成多份，每个应用拿到自己的"虚拟设备"，读写数据时**不再经过内核**。操作系统退化成"控制平面"——只在建立连接、分配资源时介入，数据搬运全在用户态完成。

这个设计直接启发了后来的 DPDK（用户态网络）和 SPDK（用户态存储），也和 io_uring 的"减少系统调用"思路一脉相承。

论文名字里"Control Plane"（控制平面）这个词后来被整个云原生领域借用——Kubernetes 的架构就分控制平面和数据平面，SDN 也用同样的术语。Arrakis 是最早在操作系统语境里正式使用这对概念的工作之一。

## 为什么重要

不理解 Arrakis 和它代表的"OS bypass"思潮，下面这些事都说不清：

- 为什么 DPDK 能让网络包处理快 10 倍——因为它跳过了内核协议栈，和 Arrakis 的数据路径思路完全一样
- 为什么 SPDK 让 NVMe SSD 的延迟降了一半——同样是把存储 I/O 搬到用户态
- 为什么 io_uring 要发明"提交队列 + 完成队列"——它也在减少用户态和内核之间的切换
- 为什么云厂商（AWS Nitro、阿里云神龙）把网络和存储卸载到专用硬件——Arrakis 证明了"OS 不碰数据"这条路走得通
- 为什么 Exokernel（1995）提出的"把硬件直接给应用"到 2014 年才真正可行——因为 SR-IOV 和 IOMMU 硬件终于成熟了
- 为什么现在的高性能网络框架（如 Seastar、F-Stack）全都绕过内核——Arrakis 论文用数据证明了内核是瓶颈

简单说：如果你在做任何和高性能 I/O 相关的工作，Arrakis 是绕不过去的基础文献。

## 核心要点

Arrakis 的设计可以拆成**三层**：

1. **硬件虚拟化**：现代网卡支持 SR-IOV（Single Root I/O Virtualization），一块物理网卡可以分成几十个"虚拟网卡"，每个虚拟网卡有自己的发送/接收队列。IOMMU 保证一个应用只能访问自己那份内存，不会越界。类比：一栋公寓楼有独立信箱，每户直接取自己的信，不用找前台转交。

2. **控制平面 vs 数据平面分离**：操作系统只在"建立连接、分配资源、设置权限"时介入（控制平面）；数据实际的读写（数据平面）由应用直接操作硬件完成。类比：物业公司负责发门禁卡，但你进出大门不需要物业陪同。控制平面的操作频率很低（比如建立 TCP 连接每秒只发生几次），而数据平面操作频率极高（每秒可能收发几百万个包），所以把低频路径留给内核、高频路径给应用直接走，是最优的分工。

3. **用户态网络栈和存储栈**：Arrakis 在用户态实现了 POSIX 兼容的网络 API（基于 lwIP）和存储 API（基于 Barrelfish 的文件系统）。应用调用 `read()`/`write()` 时，不会触发系统调用，而是直接操作硬件队列。

性能数据：论文实验显示，Arrakis 跑 Redis 时，GET 操作延迟比 Linux 低 81%，吞吐高 9 倍；跑 HTTP 服务时延迟降 5 倍。这些数字说明内核开销不是小数——在高频 I/O 场景下，它是主要瓶颈。

延迟的来源可以进一步拆解：每次系统调用本身大约 200-500 纳秒（模式切换 + TLB 刷新），如果涉及 I/O 还要加上中断处理、内核锁竞争、数据在内核缓冲区和用户缓冲区之间的拷贝。Arrakis 一次性消除了所有这些开销，所以在小包高频场景下才能拉开数量级的差距。

## 实践案例

### 案例 1：DPDK 的前世今生

DPDK（Data Plane Development Kit）是 Arrakis 思想在工业界最直接的落地。思路一样：把网卡队列映射到用户态，应用在一个死循环里不断轮询（poll）网卡，收到包就处理，发包就直接写队列。整个过程零系统调用、零中断、零上下文切换。

```c
// DPDK 的典型收包循环（伪代码）
while (1) {
    // 直接从网卡队列拿包，不经过内核
    nb_rx = rte_eth_rx_burst(port, queue, pkts, BURST_SIZE);
    for (int i = 0; i < nb_rx; i++) {
        process_packet(pkts[i]);  // 用户态处理
    }
}
```

这和 Arrakis 论文里描述的用户态网络栈几乎一模一样——只是 DPDK 选择了轮询（polling）而非事件通知。

关键差异在于 Arrakis 保留了事件驱动模型（硬件中断通知应用），而 DPDK 走得更激进——完全放弃中断，用忙等待（busy-polling）换取最低延迟。代价是独占 CPU 核心，但对于电信级网关、金融交易系统这类场景，一个 CPU 核心换来的微秒级确定性延迟完全值得。

### 案例 2：SPDK 让 NVMe 飞起来

传统 Linux 存储路径：应用 → 系统调用 → VFS → 文件系统 → 块设备层 → NVMe 驱动 → 硬件。每一层都有锁、拷贝、调度开销。SPDK 把 NVMe 驱动搬到用户态，应用直接往 NVMe 的提交队列（Submission Queue）写命令，硬件完成后写完成队列（Completion Queue），应用轮询取结果。中间层全部消失。

具体来说，SPDK 在启动时通过 `vfio-pci` 驱动把 NVMe 设备从内核解绑，然后将设备的 BAR（Base Address Register）映射到用户态进程的地址空间。之后所有 I/O 操作都是用户态代码直接读写这些映射的寄存器和队列——和 Arrakis 论文里描述的存储栈架构如出一辙。

### 案例 3：AWS Nitro 的商业化验证

AWS 在 2017 年推出 Nitro 架构，把网络、存储、安全全部卸载到专用硬件卡上。EC2 虚拟机看到的"虚拟网卡"其实是 Nitro 卡提供的 SR-IOV 虚拟功能——和 Arrakis 论文里用的技术完全一致。这证明了"OS 退出数据路径"不只是学术梦想，而是支撑着全球最大云平台的生产架构。

Nitro 架构的演进也验证了 Arrakis 论文的另一个预判：随着硬件越来越智能，OS 内核的角色会继续缩小。Nitro 第一代只卸载了网络，后来逐步把 EBS 存储、安全芯片、管理功能全部搬到了专用硬件上，主机 CPU 100% 留给客户工作负载。

## 踩过的坑

1. **SR-IOV 不是万能钥匙**：SR-IOV 虚拟功能的数量有上限（通常 64-256 个）。如果一台物理机上跑几千个容器，每个都想要独占虚拟网卡，硬件资源不够分。这就是为什么容器场景更多用软件方案（如 eBPF/XDP）而非纯硬件直通。

2. **用户态驱动 = 自己管一切**：绕过内核意味着放弃内核的保护和调度。如果用户态驱动有 bug，可能死循环吃满 CPU（轮询模式下尤其危险），也可能因为没有内核的公平调度而饿死其他进程。DPDK 应用通常要"独占"几个 CPU 核心，这在多租户环境下是奢侈品。

3. **POSIX 兼容是半个谎言**：Arrakis 号称兼容 POSIX，但实际上只实现了常用的子集。很多应用依赖 `fork()`、`mmap()` 共享内存、信号机制等内核深度功能，这些在纯用户态栈里要么缺失、要么语义不同。真正的工业落地（DPDK/SPDK）干脆放弃了 POSIX 兼容，要求应用重写 I/O 逻辑。

4. **安全隔离依赖硬件正确**：Arrakis 的安全模型建立在 IOMMU 和 SR-IOV 硬件正确实现的前提上。但现实中 IOMMU 固件有 bug、SR-IOV 实现不完整的情况并不少见。2019 年有研究者发现某些网卡的 SR-IOV 实现存在跨虚拟功能的信息泄露。把安全边界下推到硬件，意味着硬件 bug 的后果更严重——软件可以快速打补丁，固件更新周期以月甚至年计。

## 适用 vs 不适用场景

**适用**：
- 高频网络 I/O（交易系统、DNS 服务器、负载均衡器）——微秒级延迟有真金白银的价值
- 高吞吐存储（数据库引擎、分布式存储节点）——NVMe 的性能被内核栈压到不到一半，绕过去收益巨大
- 专用设备（网络中间件、存储网关）——整台机器只跑一个任务，独占 CPU 核心可以接受
- 云基础设施（hypervisor、SmartNIC）——像 AWS Nitro 一样把 I/O 卸载到硬件

**不适用**：
- 通用桌面/移动应用——系统调用开销占比极小，绕过内核得不偿失
- 多租户容器环境——SR-IOV 资源有限，且轮询独占 CPU 与"高密度部署"矛盾
- 需要完整 POSIX 语义的遗留应用——迁移成本高于性能收益
- 安全敏感场景中硬件不可信——如果不能信任固件，把安全边界下推到硬件反而更危险

一个判断标准：如果你的应用每秒做的 I/O 操作少于 1 万次，内核开销可能只占总时间的 1% 以下，不值得折腾用户态栈。但如果每秒百万次以上（如高频交易、大规模缓存服务），Arrakis 式的架构几乎是必选项。

## 历史小故事（可跳过）

- **1995 年**：MIT 的 Dawson Engler 发表 Exokernel 论文，提出"操作系统应该把硬件保护和硬件管理分开，让应用直接管理自己的硬件资源"。想法太超前，当时没有硬件支持，停留在实验阶段。
- **2007 年**：Intel 发布支持 SR-IOV 的网卡规范。硬件终于追上了 Exokernel 的野心。
- **2014 年**：Simon Peter 等人在华盛顿大学发表 Arrakis（名字取自《沙丘》里的沙漠星球），用 SR-IOV + IOMMU 把 Exokernel 的理想变成了可测量的系统。OSDI 2014 最佳论文。
- **2014-2017 年**：DPDK 和 SPDK 在工业界爆发，Intel、Mellanox（后被 NVIDIA 收购）大力推广。Arrakis 的学术验证给了工业界信心。
- **2017 年**：AWS 推出 Nitro，把"OS 退出数据路径"变成了年收入几百亿美元的云基础设施。

从 Exokernel 到 Arrakis 再到 DPDK/Nitro，这条线索说明操作系统研究的"异端想法"往往要等硬件追上来才能变成工程现实。Arrakis 论文在这条时间线上扮演了关键的"概念验证"角色。

## 学到什么

1. **内核不是免费的**——每次系统调用、每次中断、每次上下文切换都有成本。在高频 I/O 场景下，这些成本可以占到总延迟的 80% 以上
2. **控制平面和数据平面分离**是一个通用设计模式——不只用于操作系统，也用于网络（SDN）、容器编排（Kubernetes）、数据库（计算存储分离）
3. **硬件进步可以解锁被搁置的软件架构**——Exokernel 1995 年的想法在 2014 年才落地，因为 SR-IOV 和 IOMMU 花了近 20 年成熟。
读论文时值得留意这个规律：很多"太超前"的论文，其实是在等硬件
4. **学术原型和工业落地之间总有妥协**——Arrakis 追求 POSIX 兼容，DPDK/SPDK 放弃了兼容换来更彻底的性能。两种选择都有道理
5. **性能优化的本质是减少不必要的中间层**——Arrakis 的方法论适用于任何"中间层开销占比过高"的场景，不限于操作系统。数据库跳过文件系统直接操作裸设备（Direct I/O）、RPC 框架跳过 HTTP 用自定义协议，都是同一个思路

## 延伸阅读

- 论文 PDF：[Arrakis: The Operating System is the Control Plane](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-peter_simon.pdf)（OSDI 2014，14 页，实验数据详实）
- Exokernel 论文：[Engler et al., "Exokernel: An Operating System Architecture for Application-Level Resource Management", SOSP 1995](https://pdos.csail.mit.edu/6.828/2008/readings/engler95exokernel.pdf)
- DPDK 官方文档：[DPDK Programmer's Guide](https://doc.dpdk.org/guides/)——Arrakis 思想的工业实现
- SPDK 官方文档：[SPDK Documentation](https://spdk.io/doc/)——用户态存储栈的工业实现
- [[exokernel-1995]] —— Arrakis 的精神前辈，提出"保护与管理分离"
- [[io-uring]] —— Linux 对"减少系统调用"的回应，思路互补
- 会议演讲：[OSDI 2014 Arrakis Presentation](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/peter)——作者本人 25 分钟演讲，比论文更好入门
- AWS Nitro 架构解析：[AWS re:Invent 2017 — Powering Next-Gen EC2 Instances](https://www.youtube.com/watch?v=LabltEXk0VQ)——看工业界如何把学术思想变成产品

## 关联

- [[exokernel-1995]] —— Arrakis 的直接灵感来源；Exokernel 提出理念，Arrakis 用现代硬件实现
- [[dpdk]] —— Arrakis 用户态网络栈思想的工业落地
- [[spdk]] —— Arrakis 用户态存储栈思想的工业落地
- [[xen]] —— 虚拟化先驱；Arrakis 借用了 SR-IOV 直通技术来绕过 hypervisor 的 I/O 开销
- [[docker]] —— 容器共享内核，无法像 Arrakis 那样做硬件直通；两者代表不同的隔离哲学
- [[io-uring]] —— Linux 对"系统调用太贵"的渐进式回应；Arrakis 是激进路线，io_uring 是改良路线
- [[linux-kernel]] —— Arrakis 要绕过的那个"数据路径"就是 Linux 内核的 I/O 子系统

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[demikernel-2021]] —— Demikernel 2021 — 微秒级数据中心的 LibOS 架构
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[ix-2014]] —— IX 2014 — 用硬件保护做高吞吐低延迟的数据面 OS
- [[snap-2019]] —— Snap 2019 — Google 把网络栈搬到用户态微内核

