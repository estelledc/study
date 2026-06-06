---
title: Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
来源: 'Leslie Lamport, "How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs", IEEE Transactions on Computers, Vol. C-28 No. 9, Sep 1979'
日期: 2026-05-30
子分类: 共识与复制
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Sequential Consistency（顺序一致性，**SC**）是 Lamport 给"多处理器共享内存"定的第一条正确性标准：哪怕底下是多颗 CPU 各跑各的、每颗都有自己的缓存、内存请求被总线乱序仲裁，**对外看起来**也得像所有读写按某个固定顺序在一台单 CPU 上排队执行；并且每颗 CPU 自己发出的指令在这个总序里**保留它原本的程序顺序**。日常类比：超市有 10 个收银台同时结账，但购物记录最后必须能合并成一条单线时刻表，且每个顾客自己提交的几件商品在这条时刻表里前后顺序不能乱。

更具体地说，论文只有 **2 页**，给出两条充分条件：**R1**（每个处理器按程序顺序发出内存请求）+ **R2**（每个内存模块按 FIFO 队列处理来自所有处理器的请求）。满足 R1+R2 的硬件，自动满足 SC。

50 年过去，CPU 缓存一致性协议、Java/C++ 内存模型、分布式 KV 的一致性等级、x86-TSO 与 ARM 弱内存模型为什么"反例那么多"——全是站在 SC 这条基线之上或之下讨论。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 x86 / ARM 的 CPU 默认**不**给你 SC——他们只给更弱的 TSO / 弱内存模型，性能换出来的代价是程序员要自己加 fence
- 为什么 Java `volatile` / C++ `memory_order_seq_cst` 这两个名字里都有 "sequential"——它们就是把硬件拉回 SC 行为
- 为什么 [[linearizability-1990]] 说自己"比 SC 多一条 real-time 约束"——SC 是它的母亲
- 为什么分布式 KV（etcd / Consul）会标注"提供 sequential consistency"或"linearizable read"——这是用户能看懂的一致性等级语言
- 为什么 Go 的 `sync/atomic` 在 ARM 上要插额外指令、x86 上几乎免费——硬件相对 SC 的距离决定了运行时补偿成本
- 为什么 Rust 的 `Ordering` 枚举有五档（Relaxed / Acquire / Release / AcqRel / SeqCst）——`SeqCst` 那一档就是给你 SC，其余是更弱的妥协档

## 核心要点

论文短到只有四件事，**每件都是奠基性概念**：

1. **SC 的定义（一句话两条款）**：一次执行的结果，等同于把所有处理器的所有操作按某个**全序**串行执行的结果；**且**每个处理器自己的操作在该全序里保留它的程序顺序。前半条要求"看起来串行"，后半条要求"自己顺序不乱"。

2. **两条充分条件 R1+R2**：R1 = 处理器按程序顺序往外发请求；R2 = 每个内存模块用单 FIFO 队列服务所有来访请求。两条加起来硬件就 SC——简单到工程师能直接照着造。类比：每个顾客按购物清单顺序递商品，每个收银台按"先到先扫"工作。

3. **为什么默认硬件做不到**：现代 CPU 用 store buffer / 乱序执行 / 多级缓存提速，三者都违反 R1 或 R2。例如 store buffer 让 CPU"先记下要写的值再继续算"，外人看来这条写延迟了——R1 被打破。所以厂商给更弱的模型（x86-TSO 允许 store-load 重排、ARM 几乎全乱），让程序员显式加 fence 才回到 SC。

4. **SC 不是 Linearizability**：SC 不强制"真实时间上 A 完成才轮到 B"；只要每个处理器内部顺序对、整体有个全序就行。[[linearizability-1990]] 在 SC 基础上**加**了 real-time 约束，换来 locality（可组合）。SC 不可组合：两个 SC 对象拼起来整体可能违反 SC——这是 Herlihy-Wing 1990 才指出来的关键缺陷。

5. **和 [[lamport-1978]] 的关系**：1978 那篇讲"分布式异步消息系统下没有全局时钟"，给的是 partial order；1979 这篇讲"共享内存多处理器系统能不能装作有全局时钟"，给的是 total order。同一个作者一年内从两个相反方向把"时间在并发系统里到底是什么"扫了一遍。

## 实践案例

### 案例 1：经典违反 SC 的"Dekker 反例"

两个处理器执行 Dekker 互斥的核心两条：

```
P1: x = 1; r1 = y;     // 先写 x，再读 y
P2: y = 1; r2 = x;     // 先写 y，再读 x
```

**逐部分解释**：

- 初值 `x = 0, y = 0`，问 `(r1, r2)` 可能取哪些值
- SC 下穷举所有合法交错——总序里至少有一个写排在两次读之前——`(0,0)` 不可能出现
- 但**真实 x86 CPU 上能复现** `(0,0)`：store buffer 让 P1 的 `x=1` 还没刷到主存时 `r1=y` 已经先执行，P2 同理
- 这就是"x86 不是 SC"最直观的证明，也是 Dekker / Peterson 锁在现代 CPU 上**直接照写一定错**的原因——必须加 fence

写并发原语前先在脑子里跑一遍这个反例，能避免 80% 的内存模型踩坑。

### 案例 2：Java `volatile` 把字段拉回 SC

```java
class Flag {
  volatile int x = 0, y = 0;
  // 写操作不能和后续读重排，相当于在硬件层强制 R1
}
```

JMM（Java Memory Model）把所有 volatile 读写挂到同一条**全序**上，等价于 SC。代价是性能：x86 上 volatile 写要发 `mfence` 或用 `lock` 前缀，吞吐下降。这正是论文 R1+R2 的工程化复现——硬件偷懒了，编译器/运行时给你补回来。

### 案例 3：分布式 KV 的一致性等级菜单

ZooKeeper 文档明确说自己提供 "sequential consistency" 而**不是** linearizability：

- 客户端 A 写完，客户端 B 接着读，**不**保证读到 A 的写（违反 real-time，linearizability 不允许）
- 但每个客户端**自己的**读写顺序不会被 ZK 打乱——这就是 SC 的"程序顺序保留"

要 linearizable read 必须显式调用 `sync()` 强制走一轮共识。这条菜单——"默认 SC，可选 linearizable"——在 etcd / Consul 几乎都一样。理解 SC 才能读懂这些文档。

### 案例 4：CPU 缓存一致性协议的目标

MESI / MOESI 这类协议设计的目标，不是直接给你 SC，而是给你"**单变量原子可见**"——单个 cache line 的写在所有 CPU 视角里看起来按某全序发生。SC 在此之上再加一条"跨变量也得有全序"。这就是为什么硬件 cache coherence 比内存模型简单：前者只管单变量，后者管多变量编织。

## 踩过的坑

1. **把 SC 当 Linearizability**：写完不一定读得到。ZooKeeper / 一些数据库读不到自己刚写的值，新人 debug 半天，根因是把"两者等价"。SC 的全序可以**任意延后**已写未读那段，linearizability 不允许。

2. **以为现代 CPU 默认 SC**：错。x86 是 TSO（弱于 SC，store-load 可重排），ARM / RISC-V 更弱（几乎全乱）。lock-free 代码在 x86 上跑对了不代表在 ARM 上对——M1 Mac 上 Java/Go 的并发 bug 多次源自这个。

3. **以为加一个 volatile 就完事**：volatile 只对**这个字段**强制 SC，跨字段依赖照样可能被重排。要全局 SC 行为必须配套 happens-before 关系（synchronized / Lock / final 语义）。

4. **SC 可组合的误解**：直觉是"两个对象都 SC 拼起来也 SC"，错。Herlihy-Wing 1990 给出反例：FIFO 队列 A 和 B 各自 SC，并发使用时整体可见的入队顺序可能违反 SC。这是为什么后来发明 linearizability 加 real-time——换来可组合性。

5. **混淆"内存模型 SC"和"数据库 SC"**：两个层级。CPU 层的 SC 谈的是 load/store 指令；数据库层的 SC 谈的是 read/write 操作（可能跨多台机器）。本文 1979 论文是前者，但同一套定义可以照搬到后者——这是为什么 ZooKeeper 文档敢直接挪用。但分析时要分清你在哪一层，加 fence 还是加 `sync()` 是不同操作。

## 适用 vs 不适用场景

**适用**：

- 教学场景——给学生讲"并发执行的正确性"是什么，SC 是最干净的入门定义
- 中等强度的分布式 KV（ZooKeeper / etcd 默认读 / 大多数 RDBMS 单连接行为）
- 跨语言内存模型基线——Java 5+ 的 volatile、C++11 的 `seq_cst`、Rust 的 `Ordering::SeqCst` 都明确按 SC 语义

**不适用**：

- 跨地域低延迟读写——SC 的全序意味着至少要协调，CAP 里 P 一来就要 trade off
- 高性能 lock-free 数据结构——SC 太强，性能不可接受，应该用更弱的 acquire-release / relaxed
- 需要"写完立刻读到"——必须升级到 linearizability
- 对硬件无 fence 控制权的场景（早期 x86 多核未暴露完整 fence 指令）

## 历史小故事（可跳过）

- **1970 年代末**：CPU 厂商（IBM 370 / DEC / Burroughs）开始上多处理器架构，bus-based cache coherence 是主流方案。"什么算 correct"没人说清楚。
- **1979 年 9 月**：Lamport 在 IEEE TOC 发表这篇 2 页论文，给出 SC 定义和 R1+R2 充分条件。它是**多处理器内存模型**领域第一篇严格定义"正确"的论文。
- **1980 年代**：DEC Alpha、SPARC 团队发现 SC 性能太差，发明 TSO / RMO 等弱模型，这些都是相对 SC 的"放松版"。
- **1990 年**：Herlihy-Wing 证 SC 不可组合，提出 [[linearizability-1990]]。SC 从此被定位为"教学清晰但工程不够"的基线。
- **1995 年**：Adve-Gharachorloo 写出经典综述《Shared Memory Consistency Models: A Tutorial》，把 SC / TSO / PSO / RMO / Release Consistency 体系化讲清楚，**至今**是入行必读。
- **2009 年**：Sewell 等人形式化 x86-TSO，给"Intel 实际给你的内存模型"一个数学规范。SC 仍是参考点。
- **2011 年**：C++11 / Java 5 之后的 JSR-133 把"程序员可见的内存模型"标准化进语言规范，`memory_order_seq_cst` 和 `volatile` 把 SC 写进 ISO 标准。
- **至今**：每一个新硬件架构（ARMv8 / RISC-V Zicsr）发布时，都会被对照 SC 讨论"放弃了哪些 SC 性质换性能"。SC 是 50 年没退役的"对照基准"。

## 学到什么

1. **正确性可以独立于硬件优化定义**——Lamport 不规定怎么造芯片，只规定"长得像什么才算对"。这种抽象给后续 40 年的硬件创新留出了所有空间。
2. **简单的两条规则能撑起整个领域**——R1+R2 五行字，催生出"内存模型"这门学科。Lamport 的论文都有这个共同点。
3. **强模型清晰但贵，弱模型快但需技巧**——SC vs TSO/ARM 的取舍，本质上和 [[linearizability-1990]] vs eventual consistency 的取舍同源：一致性强度 ↔ 性能 / 可用性，永远在权衡。
4. **可组合性是工程师的奢侈品**——SC 不可组合让模块化推理崩掉，[[linearizability-1990]] 多花一条 real-time 约束才换回这一点。这条教训值得每一个设计 API 一致性语义的人刻骨铭心。
5. **2 页论文撑起一门学科**——SC 论文短到能 5 分钟读完，但定义、充分条件、例子俱全。Lamport 反复示范：抽象选对了，文字就少。
6. **每一代硬件创新都在跟 SC 谈判**——CPU 厂商不是不想给 SC，是 SC 太贵；他们给一个"够弱的模型 + 显式 fence 指令"，让程序员按需付费。SC 是"全付"那一档。

## 延伸阅读

- 论文 PDF（**仅 2 页**）：[How to Make a Multiprocessor Computer...](https://lamport.azurewebsites.net/pubs/multi.pdf)（Lamport 自己的网站）
- 综述：[Adve & Gharachorloo 1995 — Shared Memory Consistency Models: A Tutorial](https://www.hpl.hp.com/techreports/Compaq-DEC/WRL-95-7.pdf)（45 页，把 SC / TSO / 弱模型一次讲清）
- x86 形式化：[Sewell et al. 2010 — x86-TSO](https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf)
- 教材：Herlihy & Shavit *The Art of Multiprocessor Programming* 第 3 章先讲 SC 再讲 linearizability

## 关联

- [[lamport-1978]] —— 一年前同作者给出 happens-before 偏序时间观；SC 是把这套思想搬到共享内存场景的产物
- [[linearizability-1990]] —— 直接继承者：在 SC 基础上加 real-time + 可组合性，今天"强一致"几乎都指 linearizability
- [[chandy-lamport-1985]] —— 同作者给"全局状态"的因果一致快照；SC 给"操作序列"的逻辑一致全序，二者是状态视角 vs 操作视角的互补
- [[lamport-tla-1994]] —— TLA+ 可以形式化验证一个实现是否满足 SC
- [[paxos-1998]] —— 共识协议是构造分布式 SC / linearizable 服务的工具
- [[spanner-2012]] —— TrueTime 让 linearizability 工程化到全球，而 SC 是它的"软"对照组
- [[fidge-1988]] —— vector clock 给"事件因果"以可判定结构，SC 假设的"程序顺序+全序"在分布式异步语境里需要 vector clock 才说得清
- [[hlc-2014]] —— HLC 把物理时钟和逻辑时钟揉合，工程上最接近"在分布式系统里廉价提供 SC 行为"的方案
- [[paxos-simple-2001]] —— 平直版 Paxos 讲解，是构造 SC / linearizable 复制服务的最常见工具
