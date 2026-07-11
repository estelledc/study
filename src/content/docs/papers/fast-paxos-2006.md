---
title: Fast Paxos — 给 Paxos 加一条乐观快车道
来源: Leslie Lamport, "Fast Paxos", Distributed Computing (Springer), 2006（MSR-TR-2005-112）
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Fast Paxos 是 Lamport 2006 年给经典 Paxos 加的**一条乐观快路径**。日常类比：原本所有人下单都得先排队找前台收银员转交（经典 Paxos），现在如果店里没人抢，你可以**直接把单子贴在每个厨师面前，省掉前台那一步**（fast round）；只有两个客人同时来抢同一张桌时，才回头让前台来仲裁（classic round）。

经典 Paxos 一次共识大约 **2 个 RTT / 4 跳**（client → leader → acceptors → leader → client）。Fast Paxos 把没冲突的常见情况压到约 **1.5 个 RTT / 3 跳**（client → acceptors → client）。

代价：快路径要求 **更大的 quorum**——经典 Paxos 只要过半（> N/2），快路径要 > 3N/4。

## 为什么重要

不理解 Fast Paxos，下面这些事说不清：

- 为什么跨机房复制（每跳 30~80ms）时，**省一个 RTT** 就值得整个协议重写
- 为什么"quorum 大小"不是越小越好——它决定了**容错 + 恢复 + 延迟**的三角
- 为什么 Multi-Paxos / Raft 仍然主流，而 Fast Paxos 没成为默认——**冲突回退代价**抵消了乐观收益
- 为什么后来的 EPaxos / Generalized Paxos 都在沿这条"乐观执行 + 冲突回退"的思路走

## 核心要点

Fast Paxos 在经典 Paxos 上加 **三件事**：

1. **两种 round（轮次）混用**：每个 ballot number 标注是 fast 还是 classic。Fast round 由 client 直接广播提议给所有 acceptor；classic round 由 leader 提议（和经典 Paxos 一样）。同一个 acceptor 在不同 ballot 里可以扮演不同模式。

2. **fast quorum > 3N/4**：为了让任意两个 fast quorum 的交集，叠加任意一个 classic quorum 后，仍能**唯一恢复**已被选上的 value，fast quorum 必须严格大于 3N/4（更精确公式：N ≥ 2F + Q + 1，F 是容错数，Q 是 fast quorum 与 classic quorum 的交集要求）。

3. **collision recovery**：两个 client 同时发不同 value，acceptor 各收一半，谁都选不出多数。leader 介入，跑一次 classic round，从已收到的 fast 提议里挑一个或重新提议自己的，决出胜者后广播。

三件事合起来：**没冲突时省一跳；有冲突时多花一轮但仍然安全**。安全性证明的核心论点是：fast quorum 足够大，使得即便经历崩溃 + 任意网络分区，新 leader 仍能从存活 acceptor 的投票记录里**唯一推断出**之前是否已经有 value 被选上。

## 实践案例

### 案例 1：5 节点集群的 quorum 对比

| 协议 | classic quorum | fast quorum | 容错 |
|------|---------------|-------------|------|
| 经典 Paxos | 3（过半）| —— | 2 |
| Fast Paxos | 3 | 4（> 3N/4 = 3.75）| 1（fast 模式下）|

**关键观察**：5 节点用 fast paxos，fast 模式只能容 1 故障，比经典少 1 个。要保住经典的 2 故障，得扩到 N=6 甚至 7。这就是"快"的代价。

直观理解：fast quorum 必须足够大，让任意两个 fast quorum 的交集**仍然过半**，这样 leader 在恢复时通过查看交集就能"反推"value。N=5 时两个大小为 4 的集合交集 ≥ 3，过半，可恢复；如果 fast quorum 只有 3，两集合交集可能只有 1，无法可靠恢复。

### 案例 2：什么时候真的更快

跨机房 3 副本（北京 / 上海 / 深圳），单跳约 40ms：

- 经典 Paxos：client（北京）→ leader（上海）→ acceptors → leader → client = **4 跳 ≈ 160ms**
- Fast Paxos 无冲突：client（北京）→ acceptors（直接广播）→ client = **3 跳 ≈ 120ms**

省下来的 40ms，在每秒数千次共识的场景下是真的肉眼可见的尾延迟改善。

### 案例 3：什么时候反而更慢

两个 client 同时发不同写入到同一 key：

1. fast round：acceptors 各收一半，无人达多数 → **失败**
2. leader 检测到冲突，发起 classic round 仲裁 → **多一轮 2 RTT**
3. 总耗时 = 1.5 RTT（失败的 fast）+ 2 RTT（恢复）= **3.5 RTT**，比纯 classic 还慢

工业界经验：**冲突率高于约 5% 时 fast paxos 就开始净亏**。所以它适合"读多写少 + 写入分散到不同 key"的场景，不适合"多 writer 抢热 key"。这个阈值在每个系统都要自己测。

## 踩过的坑

1. **以为 fast 模式总是更快** —— 高冲突负载下，回退代价让平均延迟反而高于经典 Paxos。要先测冲突率再决定开不开 fast，不能"反正快路径在那里就开着"。

2. **quorum 算错** —— 很多实现把 fast quorum 写成 ⌈2N/3⌉，但 Lamport 论文明确给的是 > 3N/4 的下界（具体取决于容错配置）。算错会导致**选错 value 还以为安全**——这是分布式系统最危险的 bug 类，因为故障可能潜伏几个月才暴露。

3. **leader 仍然是单点** —— Fast Paxos 没去掉 leader，只是让它在无冲突时"歇着"。leader 故障切换还是和经典 Paxos 一样要选举。它**不是**多主协议，别和 EPaxos 那种真去 leader 化的方案混淆。

4. **和 Multi-Paxos 的 batching 冲突** —— Multi-Paxos 靠 leader 把多个客户端请求**合并成一次共识**来摊薄开销。Fast Paxos 让 client 直发，绕过了 batching，反而可能让总吞吐降低。延迟敏感的场景才划算，吞吐敏感的别用。

5. **冲突检测要靠 acceptor 协作** —— 单个 acceptor 收到 fast 提议时不知道别人有没有收到不同的提议，要等 leader 收齐多数票才能判定冲突。这意味着冲突恢复**至少多一个 RTT**，不能更短。

## 适用 vs 不适用场景

**适用**：

- 跨地域复制（每跳几十 ms 不可忽略）的状态机
- 写入键空间分散、冲突率低的场景（如大多数对象存储元数据）
- 对**尾延迟**敏感、能接受**平均吞吐略降**的系统
- 节点数 ≥ 5、网络相对稳定的内网集群

**不适用**：

- 高冲突写入（多 writer 抢同一 key / counter）
- 小集群（N < 5 时 fast quorum 收益太小）
- 需要顺序提交多个命令的复制状态机（Multi-Paxos / Raft 的 batching 更划算）
- 部署运维要求简单的系统（Fast Paxos 的 quorum 配置和 collision recovery 比 Raft 复杂得多）
- 网络抖动严重的场景：冲突可能不是来自真冲突，而是来自消息乱序，让快路径失败率虚高

## 历史小故事（可跳过）

- **1989 / 1998**：Lamport 用一篇虚构的"希腊议会"论文 The Part-Time Parliament 引入 Paxos。审稿人看不懂，压了 9 年才发。
- **2001**：Lamport 自己写 Paxos Made Simple，承认"原文是个失败"。从此大家才看懂。
- **2005**：Lamport 在 MSR-TR-2005-112 给出 Fast Paxos 技术报告。
- **2006**：正式发表在 Distributed Computing 期刊。
- **2012**：Lamport 因为分布式系统的工作（包含 Paxos 系列）拿到 Turing Award。
- **2013**：Diego Ongaro 的 Raft 论文出现，"为可理解性而设计"，工业界倒向 Raft。Fast Paxos 留在学术圈，影响后来的 EPaxos / Generalized Paxos / Flexible Paxos。
- **2016**：Heidi Howard 的 Flexible Paxos 重审 quorum 假设，证明 quorum 之间只要"读写交集非空"即可，进一步松开了 Fast Paxos 的限制。

Lamport 一辈子在做同一件事：**把"多机器达成一致"这件事说清楚**。Fast Paxos 是他在"快"这一维度上的尝试，也是他承认"完美的协议不存在，只有合适的取舍"的一次工程化让步——他原本是个理论家，写 Fast Paxos 时已经在解工业问题了。

## 一句话总结

Fast Paxos = 经典 Paxos + 乐观快路径，**用更大的 quorum 换更短的延迟**，无冲突时省一跳，有冲突时回退到经典模式重来。

## 学到什么

1. **乐观执行 + 悲观回退** 是分布式系统加速的通用套路——CRDT、乐观锁、TM、Fast Paxos 都是这个思路
2. **quorum 大小不是越小越好**——它和延迟、容错、恢复能力**三方耦合**，调一个动三个
3. **省一跳的代价可能是放大故障窗口**——工程权衡永远是"在哪个维度让步"
4. **理论可行 ≠ 工业默认**——Raft 不一定比 Paxos 优秀，但更易懂；易懂在工程上是硬通货
5. **快路径必须有可证明的恢复路径**——光"乐观"不够，关键在于失败时**仍能安全收敛到一致状态**，这才是论文的真核心

## 和 Multi-Paxos / Raft 的对比

| 维度 | 经典 Paxos | Multi-Paxos | Fast Paxos | Raft |
|------|-----------|-------------|------------|------|
| 无冲突延迟 | 2 RTT | 1 RTT（leader 已选定后）| 1.5 RTT（fast）| 1 RTT（leader 已选定后）|
| Quorum 大小 | > N/2 | > N/2 | > 3N/4（fast）| > N/2 |
| Leader | 有 | 有 | 有 | 有 |
| 多 client 并发写 | 串行 | 串行 | 可并发，靠 collision recovery | 串行 |
| 易理解度 | 中 | 中 | 低 | 高 |

要点：Multi-Paxos 通过"省掉重复选 leader"把稳定态压到 1 RTT；Fast Paxos 走另一条路——**让 client 跳过 leader**——稳定态 1.5 RTT 但 quorum 更大。两者目标不同：Multi-Paxos 优化吞吐 + 摊薄延迟，Fast Paxos 优化"client 到提交"的端到端延迟。

## 延伸阅读

- 论文 PDF：[Fast Paxos (MSR-TR-2005-112)](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2005-112.pdf)（28 页，前 10 页够用）
- Wikipedia 速查：[Paxos § Fast Paxos](https://en.wikipedia.org/wiki/Paxos_(computer_science)#Fast_Paxos)
- 后续工作：[EPaxos (SOSP 2013)](https://www.cs.cmu.edu/~dga/papers/epaxos-sosp2013.pdf)（多 leader、依赖图仲裁）
- 实操对比：[Flexible Paxos (Heidi Howard, 2016)](https://arxiv.org/abs/1608.06696)（重新审视 quorum 假设）
- [[paxos]] —— Paxos 协议总览
- [[paxos-1998]] —— 经典 Paxos 原始论文
- [[paxos-simple-2001]] —— Lamport 自己的简化版

## 关联

- [[paxos-1998]] —— Fast Paxos 在 classic round 上完全等同于经典 Paxos
- [[paxos-simple-2001]] —— 读懂这篇是读 Fast Paxos 的前置
- [[paxos]] —— Paxos 家族总图，含 Multi/Cheap/Vertical/Fast
- [[raft]] —— 另一条路：放弃乐观、要可理解性
- [[lamport-1978]] —— 同作者，理解分布式时序是读 Paxos 的更前置
- [[bernstein-1981-cc]] —— 并发控制视角下的"冲突 + 回退"思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[barrelfish-2009]] —— Barrelfish / Multikernel — 把多核机器当成一个小型网络来设计 OS
- [[flexible-paxos-2016]] —— Flexible Paxos — 两阶段不一定都要多数派
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[mencius-2008]] —— Mencius — 让多台服务器轮流当 Paxos 的 leader
- [[skeen-3pc-1981]] —— Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁
