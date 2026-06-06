---
title: Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
来源: Sweazey & Smith, "A Class of Compatible Cache Consistency Protocols and their Support by the IEEE Futurebus", ISCA 1986
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

MOESI 是**多核 CPU 之间约定怎么共享同一块内存**的一套规则。

日常类比：5 个朋友共用一份在线文档。每个人手里都有一份本地副本。问题来了——

- 我刚改了，别人不知道，怎么办
- 我改了但别人也开着看，谁负责把改动同步回服务器
- 大家都打开着干净版本，没人改

**MOESI 给每份本地副本贴一张"状态卡片"**，5 种之一：

- **M**（Modified）：我刚改过，还没存回总文档，且**只有我**有副本
- **O**（Owned）：我改过，但**别人也开着看**了，由我负责写回总文档
- **E**（Exclusive）：我手里是干净副本，**没改过**，且只有我有
- **S**（Shared）：干净副本，**多人都有**
- **I**（Invalid）：我这份**过时了**，要重新拿

每次读写，按状态卡片走规则，整个系统就不会乱。

这套规则 1986 年由 Sweazey（National Semiconductor）和 Smith（UC Berkeley）在 ISCA 论文里**第一次系统整理**。

## 为什么重要

不理解 MOESI，下面这些事都解释不了：

- 为什么 Intel / AMD / ARM 的多核 CPU 在你看不见的地方一直在"对话"
- 为什么写一个变量，**几十纳秒后**别的核才看见——这中间的延迟从哪来
- 为什么 `volatile` / `std::atomic` / `synchronized` 这些关键词背后有硬件成本
- 为什么 1986 年的协议字母表 40 年后还在每颗 CPU 里跑

MOESI 是**"多核共享内存"** 这件事的物理基础。所有锁、原子操作、并发数据结构，最终都跑在它上面。

## 核心要点

### 5 个状态字母（MOESI）

每条 cache line（一般 64 字节）在每个核的 cache 里贴一张卡：

| 状态 | 改过吗 | 别人有吗 | 谁负责写回内存 |
|------|--------|----------|----------------|
| M | 是 | 没有 | 我 |
| O | 是 | 有 | 我 |
| E | 否 | 没有 | 不需要写回 |
| S | 否 | 有 | 不需要写回 |
| I | —— | —— | 数据无效 |

### 不同协议是这 5 个字母的不同子集

Sweazey & Smith 的关键洞见：当时各家厂商（Synapse / Berkeley / Illinois / Firefly / Dragon）的协议看起来五花八门，**其实是同一族协议挑不同字母组合**：

- **MSI**（最简单）：3 个状态，没有 E，每次读都得问一遍"别人有没有"
- **MESI**（Illinois）：加了 E，"只有我有"时改写不用广播
- **MOSI**（Berkeley）：加了 O，"我改过别人也读了"时不用立刻写回内存
- **MOESI**：5 个全要，最完整。AMD / ARM 多核常用
- **MESIF**（Intel 后续扩展）：加了 F（Forward），多个 S 副本里指定一份负责响应

**所有这些协议在同一条 IEEE Futurebus 上能互通**——因为它们都说同一种状态语言。

### 协议怎么跑（窥探/snooping）

每个核的 cache 都"竖着耳朵听"总线（snoop）。比如 A 核要写一个 line：

1. A 在总线上喊："我要写地址 0x1000"
2. 其他核听到，检查自己的 cache：
   - 谁有这行 → 状态从 S/E 变成 I（作废）
   - 谁是 O 或 M → 把数据传给 A，自己变 I
3. A 拿到独占权，把自己的状态变成 M，开始改

整个过程**全自动、对软件透明**——你的 C++ 代码不需要写任何东西，硬件帮你做。

## 实践案例

### 案例 1：为什么"伪共享"（false sharing）这么慢

```c
// 两个线程，各自只改自己的变量
struct { int a; int b; } data;  // a 和 b 在同一个 64 字节 cache line
// 线程 1 反复改 data.a；线程 2 反复改 data.b
```

理论上两者**不冲突**（改的是不同变量），但实际**慢 10 倍以上**。

为什么：两个变量挤在同一条 cache line 上，线程 1 写 a 让那条 line 变 M，线程 2 写 b 时发现自己是 I，得**重新拉过来**，然后把线程 1 那边变 I。两个核反复抢这条 line，叫"乒乓"（cache line ping-pong）。

修法：把 a 和 b 隔开（用 padding 填到不同 line）。这就是 Java `@Contended`、C++ `alignas(64)` 的来历。

### 案例 2：为什么写一个变量别的核不会立刻看到

```c
flag = 1;  // 核 A
while (flag != 1) {}  // 核 B 等
```

A 写完 `flag=1`，自己的 cache line 变成 M。但 B 那边可能：

- 还在用 I 状态的旧值（更新还没传过来）
- 在用 S 状态的旧值（A 的写入还在自己 cache 里、还没广播）

总线上 A 的写广播 + B 的窥探 + 状态切换需要时间——**几十到几百纳秒**。这就是"内存可见性延迟"的硬件根源。`std::atomic` / `volatile` / `memory_order` 就是告诉编译器"不要乱重排，给我老老实实走总线"。

### 案例 3：MOESI 比 MESI 省什么

A 改了 line（M），B 来读：

- **MESI**：A 必须先把数据**写回主存**，再让 B 从主存读（两次内存访问）
- **MOESI**：A 直接把数据传给 B，A 自己变 O，B 变 S，**不用写回主存**

省一次主存访问。在 NUMA 多 socket 系统里这个差别很明显。

## 踩过的坑

1. **状态字母不是越多越好**：MOESI 状态机比 MESI 复杂，硬件实现更贵。嵌入式 / 简单系统反而用 MSI 或 MESI 就够。

2. **窥探协议不扩展**：核数 > 32，每次写都全广播，总线撑不住。后来引出**目录协议**（directory-based），由一个目录记录"哪些核有这行"。NUMA 大系统都走目录。

3. **cache line 大小是双刃剑**：64 字节让顺序访问快，但伪共享更容易。某些场景下 ARM 用 128 字节，加重伪共享但提升带宽。

4. **状态名字各家不一样**：Intel 文档叫 "Modified/Exclusive/Shared/Invalid/Forward"，AMD 叫 "Modified/Owned/Exclusive/Shared/Invalid"。看文档时对照状态机本身、不要纠结名字。

## 适用 vs 不适用

**适用**：
- 中小核数（2-32）多核共享内存系统——CPU 多核、对称多处理（SMP）
- 硬件一致性是默认假设的场景（绝大多数桌面 / 服务器 CPU）
- 总线/环形互连（窥探可达）

**不适用**：
- 大规模多核（64+）→ 用目录协议（NUMA / Cray / 大型服务器）
- GPU——传统上不维护跨 SM 强一致性，软件管理（参考 [[gpu-cache-coherence-2013]]）
- 分布式系统（跨机器）——这是网络层的事，要走 [[paxos-1998]] / [[raft]] 这种共识

## 历史小故事（可跳过）

- **1983 年**：Goodman 的 "Write-Once" 协议（MSI 雏形）
- **1984 年**：Illinois 协议（加入 E 状态）= MESI
- **1985 年**：Berkeley 协议（加入 O 状态）= MOSI
- **1986 年**：Sweazey & Smith 在 ISCA 论文里指出：这些都是同一族，配合 IEEE Futurebus 能互通。**第一次给一致性协议建立分类法**。
- **1990s**：MESI 成 Intel 默认；MOESI 成 AMD K8 / Opteron 默认
- **2008 年起**：Intel QPI 引入 MESIF（加 Forward 状态优化共享读）

## 学到什么

1. **共享内存不是"想读就读"**——每条 cache line 都贴着一张状态卡，硬件后台一直在切换它
2. **协议族 vs 单一协议**：把 MSI/MESI/MOSI/MOESI 看成同一字母表的不同子集，比单独学一个协议好理解得多
3. **内存模型有成本**：`atomic` / `volatile` 的代价就是这些状态切换 + 总线广播的纳秒级延迟
4. **窥探不扩展**——超过 32 核必然走目录。这是后来 NUMA 架构的根源

## 延伸阅读

- 论文原文：[Sweazey-Smith ISCA 1986](https://dl.acm.org/doi/10.1145/17407.17404)（10 页，密度高）
- Hennessy & Patterson, Computer Architecture: A Quantitative Approach 第 5 章——教科书级讲解
- [What Every Programmer Should Know About Memory](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf)（Drepper 2007，第 3 章详解 MESI）
- [[amdahl-law-1967]] —— 多核加速的根本上限
- [[gpu-cache-coherence-2013]] —— GPU 上为什么不直接套用 MOESI

## 关联

- [[amdahl-law-1967]] —— 多核越多收益越小，一致性开销是其中一项
- [[gpu-cache-coherence-2013]] —— GPU 走另一条路，对照看更清楚
- [[paxos-1998]] —— 分布式一致性，概念名相近但解决问题不同（跨机器 vs 跨 cache）
- [[aries-1992]] —— 数据库恢复协议，也是写状态机解决一致性

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amdahl-law-1967]] —— Amdahl 定律 — 串行比例决定并行加速比的上界
- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[gpu-cache-coherence-2013]] —— GPU 缓存一致性 — 用时戳代替失效消息
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[raft]] —— Raft — 易理解的共识算法

