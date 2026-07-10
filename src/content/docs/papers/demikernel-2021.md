---
title: Demikernel 2021 — 微秒级数据中心的 LibOS 架构
来源: 'Zhang et al., "The Demikernel Datapath OS Architecture", SOSP 2021'
日期: 2026-06-24
分类: 操作系统
难度: 中级
---

## 是什么

Demikernel 是一个**让应用通过统一 API 使用各种 kernel-bypass I/O 设备，同时自己不用操心底层差异**的库操作系统（LibOS）框架。日常类比：你家有三种充电器——苹果 Lightning、安卓 USB-C、老款 Micro-USB——每次充电都要翻抽屉找对的线。Demikernel 就像一个万能充电座：你只管把手机放上去，它自己识别接口、选对协议、开始充电。

传统的 kernel-bypass 方案（[[arrakis-2014]] 的理念、DPDK 的网络栈、RDMA 的 verbs 接口）各有各的 API，写了一套代码只能跑在一种硬件上。想换设备？推倒重来。Demikernel 定义了一套**统一的数据路径 API**（叫 PDPIX），底层对接不同的 LibOS 实现——论文里有基于 DPDK 的 Catnip、基于 RDMA 的 Catmint、基于 POSIX sockets 的 Catnap，以及存储侧的 Cattree（SPDK）等。应用只调 PDPIX，换硬件只需换 LibOS 后端，业务代码不用跟着重写。

论文发表于 SOSP 2021（操作系统领域的顶级会议），作者团队来自微软研究院和 University of British Columbia。论文在 Azure VM / 裸机上做了评测；它首先是可插拔 datapath 架构，而不是“云厂商已全面替换内核栈”的产品通告。

## 为什么重要

不理解 Demikernel，下面这些事都没法解释：

- 为什么 DPDK 应用写完之后换成 RDMA 硬件几乎要重写——两套 API 毫无交集，Demikernel 正是为解决这个"锁死在一种硬件上"的问题
- 为什么 [[arrakis-2014]] 和 [[ix-2014]] 证明了 kernel-bypass 可行，但十年后大部分数据中心应用仍然跑在 Linux 内核栈上——因为迁移成本太高，没有统一抽象层
- 为什么 [[snap-2019]] 选择在 Google 内部做一个中间层而非让应用直接用 DPDK——同样的"可移植性"诉求，Demikernel 给出了另一种解法
- 为什么微秒级延迟场景（内存数据库、远程过程调用）对操作系统提出了完全不同的要求——传统内核的每次系统调用就要花几微秒，而整个请求可能只需要 5-10 微秒
- 为什么 LibOS（库操作系统）这个 90 年代的概念在 2020 年代重新火起来——[[mirage-2013]] 的 unikernel 走了"编译成单一镜像"的路，Demikernel 走了"链接为用户态库"的路，两条路线都在回答"内核太重了怎么办"
- 为什么用 Rust 写系统软件越来越常见——论文主体 datapath（Catnip/Catmint/Cattree）用 Rust，并讨论所有权模型如何减少网络栈里常见的内存安全 bug；对照用的 Catnap 等仍可用 C++/POSIX 路径

## 核心要点

Demikernel 的设计可以拆成**三个关键层**：

1. **PDPIX 统一 API**：全称 Portable Datapath Interface（可移植数据路径接口），提供大约 10 个核心操作——`push`（发数据）、`pop`（收数据）、`wait`（等完成）、`accept`（接受连接）等。设计哲学是"只暴露最小公分母"：只提供所有 bypass 设备都能支持的原语，不暴露特定硬件的特殊能力。类比：万能充电座不会提供"苹果专属快充模式"，但保证所有手机都能充上电。

2. **可插拔 LibOS 后端**：PDPIX 下面是具体的 LibOS 实现。论文重点写了：Catnip（DPDK + 用户态 TCP/UDP，Rust）、Catmint（Linux RDMA，Rust）、Catnap（POSIX sockets，方便开发与对照）、Cattree（SPDK 存储）。Windows 侧还有 Catpaw（RDMA）。后来开源仓库又出现 Catpowder（Linux raw sockets）等变体——不要把它和论文里的 Catnap 搞混。每个 datapath LibOS 只有几千行量级，远比内核网络栈轻。

3. **协程调度器**：Demikernel 内部用协程（coroutine）而非线程来管理并发 I/O。一个 `push` 操作在底层可能需要多步完成（分段、加头、入队、等 DMA），这些步骤被组织成一串协程，调度器在单线程内高效切换。不需要锁、不需要线程上下文切换，延迟极低。类比：一个人在厨房同时做三道菜——水烧开了切菜、菜下锅了去调酱——而非雇三个厨师抢一个灶台。

性能数据（论文评测口径）：Catnip 相对 Linux 可做到约 **5×** 延迟改善；Redis 场景里 Catnip 吞吐大约高 20%，Catmint 大约高 2×。数字随负载与对照基线变化，重点是“统一 API 下仍能逼近专用 bypass 栈”，而不是某一个绝对微秒数。

## 实践案例

### 案例 1：一套代码跑两种硬件

假设你在写一个内存键值存储。传统做法：如果部署在有 DPDK 网卡的机器上，用 DPDK API 写网络层；如果换到有 RDMA 网卡的机器上，用 ibverbs API 重写网络层。两套完全不同的代码，翻倍的维护成本。

用 Demikernel 只需要这样：

```rust
// 教学示意：统一 PDPIX 风格接口（非可直接复制的官方片段）
// 后端可换成 Catnap / Catnip / Catmint 等 LibOS
let qd = demi_socket(AF_INET, SOCK_STREAM, 0);  // 建连接
demi_bind(qd, &addr);
demi_listen(qd, backlog);
let qt = demi_accept(qd);       // 接受客户端
let qt = demi_pop(qd);          // 收数据
let qt = demi_push(qd, &buf);   // 发数据
demi_wait(qt);                  // 等完成
```

编译/配置时选择链接哪个 LibOS 后端，运行时行为就跟着变。换硬件主要改后端，不改业务调用形状。真实符号与构建方式以仓库 `man/` 与文档为准。

### 案例 2：从 Linux 渐进迁移

一个团队有跑在 Linux 内核栈上的 RPC 服务，想降延迟但不敢一步上 DPDK/RDMA。论文路线是：先用 **Catnap（POSIX sockets）** 把应用改到 PDPIX，在普通 Linux 上把接口与事件循环跑通；硬件到位后再切 **Catnip（DPDK）** 或 **Catmint（RDMA）**，业务侧仍走同一套 queue/`push`/`pop`/`wait` 形状。

### 案例 3：云环境里的可移植性诉求

论文在 Azure VM 与裸机上对比了不同 LibOS。对云厂商/平台团队，价值不只是“今天某一跳更快”，而是网卡从普通 NIC 换到 DPDK/RDMA 时，应用不必重写网络层。硬件每 2–3 年换一代；PDPIX 把“换设备”尽量收成“换 LibOS 后端”。

## 与同类方案的对比

理解 Demikernel 最好的方式是把它和同一代的几个方案放在一起看：

- **DPDK（纯用户态轮询）**：应用直接调 DPDK API 操作网卡队列，性能最极致，但代码和 DPDK 深度耦合，换硬件要重写。Demikernel 在 DPDK 上面加了一层 PDPIX，牺牲少量性能换来可移植性。
- **[[snap-2019]]（用户态微内核进程）**：Google 把网络功能放在一个独立进程里，所有应用共享。好处是多租户友好、可独立升级；代价是多了一次进程间通信。Demikernel 直接把 LibOS 链接进应用进程，省掉了这次 IPC，但失去了独立升级的能力。
- **[[io-uring]]（内核改良路线）**：不绕过内核，而是用共享内存环减少系统调用次数。兼容性最好，但通常达不到完整 kernel-bypass 的数量级收益。Demikernel 论文把它当作对照路线之一；自己的“普通 Linux 回退”主要是 Catnap（POSIX），不是把 io_uring 包装成官方 LibOS 名。
- **[[mirage-2013]]（unikernel 路线）**：把应用和 OS 编译成一个单一镜像，跑在 hypervisor 上。隔离性好但部署模型固定——改一行代码要重新编译整个镜像。Demikernel 作为普通用户态库链接，开发调试周期短得多。

一句话总结：DPDK 最快但最不灵活，Snap 最适合大规模多租户，io_uring 最稳但提升有限，MirageOS 隔离最强但最笨重。Demikernel 试图在“性能”和“可移植性”之间找平衡。

## 踩过的坑

1. **"最小公分母"API 丢失硬件特性**：PDPIX 为了通用性，不暴露 RDMA 的单边操作（one-sided RDMA read/write）或 DPDK 的批量收发（burst mode）。某些场景下这些特性能带来 2-3 倍额外性能。Demikernel 的回答是"先保证可移植，特殊优化留给特定后端"，但这意味着你用了统一 API 就必须接受"够好但不是最好"。

2. **协程调度器和 CPU 亲和性**：Demikernel 假设每个 LibOS 实例独占一个 CPU 核心（和 DPDK 一样）。在高密度部署场景（一台机器跑几十个服务），核心不够分。论文没有深入讨论多租户调度问题——这正是 [[snap-2019]] 用独立用户态进程解决的场景。

3. **TCP 协议栈不完整**：Catnip（DPDK 后端）自带的用户态 TCP 实现只覆盖了常见路径。拥塞控制只实现了基础版本，不支持 SACK（选择性确认）、ECN（显式拥塞通知）等生产环境常用的特性。真正上生产可能还需要补完大量 TCP 细节。

4. **调试噩梦**：用户态网络栈意味着 tcpdump、Wireshark 这些标准工具抓不到你的包（它们依赖内核协议栈）。出了问题只能靠 LibOS 内部的日志和自带的抓包接口，排查效率大幅下降。这个问题不是 Demikernel 独有的——所有 kernel-bypass 方案都有同样的痛苦。

## 适用 vs 不适用场景

**适用**：

- 微秒级延迟的数据中心服务（内存数据库、KV 缓存、RPC 框架）——内核开销占总延迟的大头，bypass 收益巨大
- 需要跨多种 I/O 硬件的平台型软件（云存储、网络中间件）——统一 API 省去为每种硬件写一套代码的成本
- 从 Linux 渐进迁移到 kernel-bypass 的场景——先用 Catnap 把 PDPIX 接口跑通，再切 Catnip/Catmint
- 用 Rust 写系统软件、愿意接受原型级用户态栈的团队——论文主体 datapath 用 Rust，强调所有权检查减少内存 bug

**不适用**：

- 已经深度绑定 DPDK 且不打算换硬件的项目——为了“统一 API”引入一层抽象反而增加复杂度
- 需要完整 TCP 特性的生产系统——Catnip 的用户态 TCP 仍是研究/原型取向，不如内核栈或成熟用户态栈（如 Seastar）
- 对延迟不敏感的批处理应用——内核开销占比极小，不值得折腾
- 桌面/移动应用——完全不在 Demikernel 的设计目标内

## 历史小故事（可跳过）

- **1995 年**：MIT 的 Exokernel 论文提出"让应用管理自己的硬件资源"，LibOS 的概念第一次进入操作系统研究的视野。
- **2013 年**：[[mirage-2013]] 证明 LibOS 可以编译成 unikernel 跑在云上，但走的是"全部编译进一个镜像"的路线，灵活性有限。
- **2014 年**：[[arrakis-2014]] 和 [[ix-2014]] 同时证明 kernel-bypass 在真实硬件上可行，但两者的 API 都和特定硬件绑定。
- **2019 年**：[[snap-2019]] 展示了 Google 在百万台机器规模上运行用户态网络栈的经验，但 Snap 是 Google 专有的。
- **2021 年**：Irene Zhang（微软研究院）带领团队发表 Demikernel，第一次把"kernel-bypass 的可移植性问题"作为核心研究目标。论文的 positioning 很明确——前面的工作都证明了 bypass 可以快，我们要解决的是"bypass 之后怎么不被硬件绑死"。
- **名字来源**："Demi"是法语"一半"的意思。Demikernel = 半个内核，暗示它只做了内核数据路径的那一半工作，控制路径仍然交给 Linux。

## 学到什么

1. **抽象层的位置决定了系统的可移植性**——Demikernel 把抽象层放在"应用和 I/O 设备之间"，让应用代码与硬件解耦。这和编程语言的"虚拟机层"（JVM 让 Java 跨平台）是同一个设计模式
2. **kernel-bypass 不是目标，低延迟才是目标**——Catnap 证明：即使仍走 sockets，统一 API + 轮询路径也能先把迁移成本降下来；真正的数量级收益再交给 Catnip/Catmint
3. **Rust 在系统编程中的优势不只是“不 segfault”**——论文主体 datapath LibOS 用 Rust，编译器帮你检查所有权和生命周期，减少 C 写用户态网络栈时常见的 use-after-free / double-free
4. **操作系统研究的主题正从"内核如何做"变成"内核该不该做"**——从 [[arrakis-2014]] 到 Demikernel，核心问题是划界线：哪些功能必须在内核里，哪些可以搬到用户态库里
5. **好的 API 设计比好的实现更难**——Demikernel 的 LibOS 后端每个只有几千行代码，但 PDPIX API 的设计花了最多精力：要覆盖所有后端的能力，又不能暴露任何后端的特殊性
6. **"半个内核"比"没有内核"更务实**——Demikernel 不替代整个 OS，只替代数据路径。文件系统、进程管理、安全策略仍然交给 Linux。这种"只拿走最热的路径"的策略比 unikernel 的"全部替换"更容易在现有基础设施上落地

## 延伸阅读

- 论文 PDF：[The Demikernel Datapath OS Architecture for Microsecond-scale Datacenter Systems](https://irenezhang.net/papers/demikernel-sosp21.pdf)（SOSP 2021，16 页）
- 会议演讲：[SOSP 2021 Demikernel Presentation](https://www.youtube.com/watch?v=0S5FA5c-bT4)——作者 Irene Zhang 的 20 分钟演讲
- GitHub 仓库：[microsoft/demikernel](https://github.com/microsoft/demikernel)——完整 Rust 实现，可以本地编译实验
- [[arrakis-2014]] —— Demikernel 的前辈；Arrakis 证明 bypass 可行，Demikernel 解决 bypass 的可移植性
- [[ix-2014]] —— 同一谱系的另一条路线：用硬件保护做受保护的数据面
- [[snap-2019]] —— Google 的工业级对照；Snap 用独立进程做可运维的网络层，Demikernel 用 LibOS 做极致性能的网络层
- 背景阅读：[Datacenter RPCs can be General and Fast](https://www.usenix.org/conference/nsdi19/presentation/kalia)——eRPC 论文，同样关注微秒级 RPC，和 Demikernel 场景高度重叠

## 关联

- [[arrakis-2014]] —— Demikernel 引用最多的前辈工作；Arrakis 做"OS 退出数据路径"，Demikernel 做"退出之后 API 怎么统一"
- [[ix-2014]] —— IX 用硬件保护隔离数据面，Demikernel 用 LibOS 替代数据面；两者目标相同（低延迟 I/O），手段不同
- [[snap-2019]] —— Google 的工业方案是在用户态做一个"微内核进程"管网络；Demikernel 的方案是直接把网络栈编译进应用。前者更适合多租户，后者更适合单应用极致性能
- [[io-uring]] —— 同属低延迟 I/O 路线的内核改良对照；Demikernel 走可插拔 LibOS，普通 Linux 回退主要是 Catnap 而非 io_uring 封装
- [[mirage-2013]] —— 同属 LibOS 家族；MirageOS 把 LibOS 编译成 unikernel，Demikernel 把 LibOS 链接为用户态库。前者隔离更强，后者灵活性更高
- [[dpdk]] —— Demikernel 的 Catnip 后端基于 DPDK 构建；PDPIX 让应用不必直接面对 DPDK 的底层 API
- [[arrakis-2014]] 和 [[ix-2014]] 代表第一代 kernel-bypass 研究（2014），Demikernel 代表第二代（2021）——从"证明可行"到"解决工程化"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arrakis-2014]] —— Arrakis 2014 — 让操作系统退出数据路径
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[ix-2014]] —— IX 2014 — 用硬件保护做高吞吐低延迟的数据面 OS
- [[mirage-2013]] —— MirageOS 2013 — 应用和内核合体成一个超轻虚拟机
- [[snap-2019]] —— Snap 2019 — Google 把网络栈搬到用户态微内核

