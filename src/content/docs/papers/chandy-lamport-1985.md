---
title: Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
来源: 'K. Mani Chandy & Leslie Lamport, "Distributed Snapshots: Determining Global States of Distributed Systems", ACM TOCS Vol. 3 No. 1, Feb 1985'
日期: 2026-05-30
子分类: 共识与复制
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Chandy-Lamport 1985 是一篇 13 页论文，它告诉我们：**多台机器组成的分布式系统，怎么不停机就拍出一张"一致的全局快照"**。日常类比：像给一支正在比赛的足球队拍合影——你没有上帝视角的快门，每个球员只能在某一刻原地站住自拍一张，球还在飞、传球还在进行中。要拼出一张"看上去合理"的合影，靠的是球员之间约定的暗号，不是同一秒按下快门。

更具体地说：系统里有 N 个进程（每个有自己的内存状态），进程之间通过 **FIFO 通道**互发消息（通道里此时可能有"在飞"的消息）。如果你想知道"现在这一刻的全局状态长什么样"，物理上做不到——因为没有全局时钟（这正是 [[lamport-1978]] 说的）。Chandy-Lamport 给出一个协议：往每条通道里塞一种叫 **marker**（标记）的特殊消息，靠它把"切"传遍全网；进程在收到第一个 marker 的瞬间记录自己的状态，并继续录"还在飞的消息"，最终拼出一张可能从未在物理时间真实存在过、但**逻辑上一致**的快照。

40 年过去，Apache Flink 的 checkpoint、Spark Streaming 的 micro-batch、分布式 GC、死锁检测、终止检测、ZooKeeper 状态导出，都是这篇论文的孩子。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 Flink 能保证 exactly-once 语义却不用全局停机——它的 barrier 就是 marker
- 为什么 [[raft]] 的快照（log compaction）那么简单，而流式系统的 checkpoint 那么麻烦
- 为什么"全局状态"这个概念在分布式系统里要单独定义，不能直接说"现在所有内存的并集"
- 为什么调试一个分布式 bug 比调试单机 bug 难一个数量级——你看到的"现场"可能根本不是真发生过的瞬间

## 核心要点

Chandy-Lamport 的协议出奇地简洁，**只有三条规则**：

1. **任意进程随时可发起快照**：选一个进程 P，它先记录自己当前状态，然后**往所有出向通道发一个 marker**。

2. **进程 P 第一次收到 marker（来自通道 C）时**：立刻记录自己当前状态；把通道 C 的状态记为"空"（marker 之前没收到任何东西需要补录）；然后向所有其他出向通道发送 marker。

3. **进程 P 此后在通道 C' 上收到 marker 之前**，把 C' 上每条到来的普通消息追加为"C' 的通道状态"；收到 C' 的 marker 时停止。

当所有进程在所有入向通道都收到 marker 后，协议结束。把每个进程的状态 + 每条通道的"在飞消息列表"拼起来，就是全局快照。

**为什么这就够了**：FIFO 通道保证了"marker 之前发送的消息一定在 marker 之前到达"，所以 marker 是一把干净的"切"——切的左边是"已被快照看到的事件"，右边是"快照之后的事件"。这把切对应 [[lamport-1978]] 因果偏序里的一条**反链**（concurrent 事件集合），物理时间不是同一瞬间也没关系。

## 实践案例

### 案例 1：协议怎么跑起来

3 个进程 P1 / P2 / P3，全互联（共 6 条单向通道）：

```
P1 想拍快照
  → P1 记录自己状态 s1
  → P1 向 P2 / P3 各发一个 marker M
P2 在通道 P1→P2 上首次收到 M
  → P2 记录自己状态 s2
  → 通道 P1→P2 状态 = 空
  → P2 向 P1 / P3 各发 marker
P3 类似
之后每个进程把"还没收到 marker 的通道"上的消息录下来
全部 marker 收齐 → 快照完成
```

**关键点**：s1、s2、s3 在物理时间上**不是同一刻**，但它们 + 通道状态拼起来逻辑一致。

### 案例 2：Flink 把它工业化（[[flink-2015]]）

Flink 的 **Asynchronous Barrier Snapshotting (ABS)** 就是 Chandy-Lamport 的流式变体：

- **marker → barrier**：source 算子周期性注入 barrier 到数据流
- **进程状态 → operator state**：每个算子在 barrier 通过时把状态写到持久化存储
- **通道状态 → in-flight 数据**：Flink 选择"对齐"等待所有上游 barrier 到齐再处理，把通道状态压成空（牺牲一点延迟换简单）

这就是 Flink 敢说 "exactly-once" 的根基：故障恢复时回滚到上次 barrier 对应的快照。

### 案例 3：和 [[paxos-1998]] / [[raft]] 的分工

很多人会混："这些都是分布式协议，干嘛不一样？"

| 协议 | 解决什么 | 输出 |
|------|---------|------|
| Chandy-Lamport | 一致地**观察**当前全局状态 | 一张快照 |
| [[paxos-1998]] / [[raft]] | 让多机**就一个新值达成共识** | 一个被多数派确认的值 |

Raft 的快照之所以比 Chandy-Lamport 简单——因为 Raft 已经有单 leader 和**总序 log**，直接在某个 log index 上"切"就行，不需要 marker 协议。Chandy-Lamport 适用于**没有总序、对等通信**的场景。

### 案例 4：用快照做终止检测

经典应用：N 个进程互相发任务消息，怎么判断"所有人都干完活了"？单看某个进程 idle 不够——可能它只是暂时空闲，正有消息在飞向它。

用 Chandy-Lamport 拍一张快照：

- 如果**所有进程都是 idle 状态**，且**所有通道状态都是空**——系统真的终止了
- 否则继续干活，过会儿再拍

这就是 Mattern 1989 的"快照式终止检测"，比 Dijkstra-Scholten 1980 的"父子树式"更通用，但开销略高。

## 踩过的坑

1. **快照不是某个真实的瞬时切片**：你拼出的状态可能是"P1 在 t=10 时的样子 + P2 在 t=15 时的样子 + 通道里 t=12 发的一条消息"。物理时间上从未存在过，但**因果上一致**——从初始可达，且能继续走到现在。这点很反直觉，新手常误以为是 wall-clock 同步快照。

2. **强依赖 FIFO 通道**：TCP 满足，UDP 不满足。如果通道乱序，marker 可能被普通消息超车，"切"就破了。工业实现要么自己加序列号，要么明确禁止 UDP。

3. **原版不容错**：协议假设进程不崩溃、通道不断开。真要容错（比如 Flink），还得叠加 [[paxos-1998]] 这种共识来保证 marker 的可靠传播，或者像 Flink 那样允许失败时整体回滚到上次完整 checkpoint。

4. **完成时间不可控**：取决于网络里最慢的 marker 传播路径。如果某条通道延迟极高，整个快照都得等。Flink 的"对齐"模式因此可能拖慢 stream 处理——所以 Flink 1.11 后引入了 unaligned checkpoint，让 in-flight 数据进 channel state，避免阻塞。

5. **可以并发跑多个**：每个快照用不同的 marker ID 区分。论文里专门论证了这点，但很多读者以为协议是"单次"的。

## 适用 vs 不适用场景

**适用**：

- 流式计算 checkpoint（Flink / Spark Streaming / Kafka Streams 跨 partition 协调）
- 分布式 GC（确定哪些对象全局不可达）
- 死锁检测（拍快照看 wait-for 图有没有环）
- 终止检测（所有进程是否都 idle 且通道为空）
- 分布式调试器（导出"现场"供事后回放）

**不适用**：

- **单 leader 强一致系统**：Raft / Spanner 已经有总序 log，直接在 index 上切更简单
- **非 FIFO 通道**：UDP / 可乱序队列要先补 FIFO 才能跑
- **崩溃故障频繁**：原版协议无容错，要叠加共识层
- **需要全局时钟语义**：如果业务真的要"2026-05-30 14:00:00 这一秒的全局状态"，Chandy-Lamport 给不了——它给的是"因果一致"而非"物理同时"

## 历史小故事（可跳过）

- **1980 年代初**：Lamport 在 SRI International，Chandy 在 UT Austin。两人都在研究分布式系统的"全局状态"问题。
- **灵感来源**：Lamport 自述他先想出 marker idea，Chandy 帮他把证明严谨化（这种合作模式 Lamport 很常见——他的 [[lamport-1978]]、[[paxos-1998]]、[[lamport-tla-1994]] 都是先想清楚再找人补证明）。
- **1985 年发表**：TOCS Vol. 3 No. 1，13 页。论文极其干净——3 条规则、1 个正确性证明、几个应用例子。被引用进了 ACM 25 周年最具影响力论文集。
- **2015 年再红**：Carbone 等人发表 Flink ABS 论文，明确说"我们就是 Chandy-Lamport 的流式变体"。从此每个学流处理的人都得回头读这篇 1985 年的小论文。

## 学到什么

1. **"全局状态"是一个需要被定义的概念**——不是"所有机器内存的简单并集"，而是"因果上自洽的切"。这是从分布式系统转单机程序员思维的最大坎。

2. **协议越简单越美**——Chandy-Lamport 只有 3 条规则，但能正确拍出可达一致快照。Lamport 论文都有这个特点：把复杂问题剥到只剩几条不变式。

3. **marker 是物理时钟的代用品**——它不告诉你"几点几分"，但告诉你"这一刻之前 vs 之后"，这正是因果模型需要的全部信息。延续 [[lamport-1978]] 的思想：**因果偏序 > 物理时间**。

4. **理论 → 应用要 30 年**——1985 论文，2015 才被 Flink 工业化。期间无数次被用作教学例子和形式化验证练习（[[lamport-tla-1994]] 里就有 Chandy-Lamport 的 TLA+ 规范），但真正"普通工程师每天都在用"是流处理时代到来才发生的。

## 延伸阅读

- 论文 13 页 PDF：[Chandy-Lamport 1985 TOCS](https://lamport.azurewebsites.net/pubs/chandy.pdf)（密度适中，比 Paxos 易读）
- Flink ABS 论文：[Carbone et al. 2015 — Lightweight Asynchronous Snapshots for Distributed Dataflows](https://arxiv.org/abs/1506.08603)（看现代实现怎么落地）
- Lamport 自述：[The Writings of Leslie Lamport — #84](https://lamport.azurewebsites.net/pubs/pubs.html#chandy)（Lamport 网站对每篇论文都有作者注解）
- 视频讲解：[MIT 6.824 Distributed Systems — Lecture on Snapshots](https://pdos.csail.mit.edu/6.824/)（Frans Kaashoek 用白板推一遍协议）

## 关联

- [[lamport-1978]] —— 因果偏序模型；Chandy-Lamport 的快照本质是这个偏序里的一条"切"
- [[lamport-tla-1994]] —— TLA+ 是验证 Chandy-Lamport 协议正确性的标准工具
- [[paxos-1998]] —— consensus（达成一致）；快照协议关心"观察"，共识协议关心"决定"，互补不替代
- [[raft]] —— Raft 快照因为有单 leader log 简化掉了 marker，是 Chandy-Lamport 的退化场景
- [[flink-2015]] —— Flink ABS 是 Chandy-Lamport 的工业流式变体，barrier=marker
- [[kafka-2011]] —— Kafka 单 partition 偏移量是 single-process snapshot；跨 partition 要用 Chandy-Lamport 思路协调

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[byzantine-generals-1982]] —— 拜占庭将军问题 — 节点能撒谎时怎么达成一致
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[flink-snapshots-2015]] —— Flink 异步快照 — 不停机给流处理拍一致照片
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[hlc-2014]] —— HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[linearizability-1990]] —— Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[ntp-mills-1991]] —— NTP 1991 — 用四个时间戳和一组滤波器，让全网服务器的钟差几毫秒
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[raft]] —— Raft — 易理解的共识算法
- [[sequential-consistency-1979]] —— Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
- [[sinfonia-2007]] —— Sinfonia 2007 — 把分布式协议降级成数据结构操作
- [[vogels-eventual-2009]] —— Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇

