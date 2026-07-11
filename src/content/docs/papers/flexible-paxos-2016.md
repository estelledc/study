---
title: Flexible Paxos — 两阶段不一定都要多数派
来源: 'Heidi Howard, Dahlia Malkhi, Alexander Spiegelman, "Flexible Paxos: Quorum Intersection Revisited", arXiv 2016'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Flexible Paxos（**FPaxos**）是对 1998 年经典 Paxos 的一个**很小但很关键的放松**：它证明 Paxos 的两个阶段——选 leader 的 phase 1 和写日志的 phase 2——**不必都用多数派**，只要两阶段的 quorum 之间相交一次就够。

日常类比：像两班接力交班。原来的规则是"上一班 5 人要全到、下一班 5 人也要全到才算交接"；FPaxos 发现其实"上一班只要有一个人见过下一班任意一个人"就够了——不需要两班都凑齐。

```
经典 Paxos：phase 1 多数 ∧ phase 2 多数（两个多数当然相交）
FPaxos：phase 1 quorum ∩ phase 2 quorum ≠ ∅（只要相交一次）
```

5 个 acceptor 时，FPaxos 可以让 phase 2 只用 2 个（写入快），代价是 phase 1 要 4 个（leader 切换稍慢）。**稳态写入快很多，故障切换略慢**——这是工程上常见且划算的权衡。

## 为什么重要

不理解 FPaxos，下面这些事都没法解释：

- 为什么后来有人讨论"可调 quorum / Flexible Raft"——FPaxos 证明两阶段不必都多数
- 为什么"读写 quorum 解耦"在 Dynamo / Cassandra 之外的强一致系统也说得通
- 为什么 6 节点集群比 5 节点写入更慢却没多大可用性提升（多数派要 4 个）
- 为什么 Raft 的"过半多数"是可以放松的——只是历史选择，不是数学必然

## 核心要点

FPaxos 推翻"必须多数派"的关键点可以拆成 **三步**：

1. **Quorum intersection 是 Paxos 安全性的真正前提**：原始证明只要求"任意两个 quorum 都相交"。多数派只是**满足这个条件的最简单做法**之一。类比：要让两条街上的人能传话，不一定需要每条街都站满人，只要两条街交叉口有一个人就行。

2. **Phase 1 和 phase 2 的角色不对称**：phase 1 要"听到所有可能已经被接受的提案"（涉及历史所有 phase 2），phase 2 只要"写够能被未来 phase 1 看到"。所以 **phase 1 quorum 要能撞上所有可能的 phase 2 quorum**——但反向不必。

3. **设计旋钮：Q1 + Q2 > N**：N 个 acceptor，只要 phase 1 quorum 大小 Q1 加 phase 2 quorum 大小 Q2 严格大于 N，就保证两者相交。Q2 越小写入越快；代价是 Q1 越大、leader 切换越难。

简言之：**把"两个都得多数"换成"加起来超过 N"**。

## 实践案例

### 案例 1：5 节点把写入 quorum 砍到 2

5 个 acceptor，传统 Paxos：

```
Q1 = 3, Q2 = 3  （多数 = 3）
每次写入要等 3 个 ack
```

FPaxos 可以选：

```
Q1 = 4, Q2 = 2  （4 + 2 = 6 > 5，相交保证）
每次写入只要 2 个 ack — 延迟少一档
故障切换时要凑 4 个 — 略难，但故障是稀有事件
```

**逐部分解释**：

- Q1 + Q2 = 6 > N = 5 ⇒ 任何 Q1 quorum 必和任何 Q2 quorum 撞至少 1 个
- 稳态（leader 不变）只跑 phase 2 ⇒ 直接受益于 Q2 = 2
- 只有 leader 挂了才跑 phase 1 ⇒ Q1 = 4 的代价被摊到罕见路径

### 案例 2：偶数节点也能省一个

6 个 acceptor，传统 Paxos 多数 = 4。FPaxos：

```
Q1 = 4, Q2 = 3  （4 + 3 = 7 > 6）
写入 quorum 从 4 降到 3 — 偶数节点的"白吃亏"被修正
```

**关键点**：偶数节点常被认为"比奇数浪费"，因为多数派要凑得更多；FPaxos 让你把这一个"浪费"还回来给写入路径。

### 案例 3：跨地域 quorum

3 个机房 × 2 节点 = 6 个 acceptor。希望写入只在主机房内完成：

```
Q1 = 5（跨机房）, Q2 = 2（本机房两节点）
5 + 2 = 7 > 6 ⇒ 安全
稳态写入：本地两节点 ack，毫秒级
故障切换：得跨机房凑 5 个，秒级，但极少发生
```

这正是工业系统"近端写、跨端选主"的理论支撑。

## 踩过的坑

1. **以为 Q2 越小越好**：Q2 缩小后 Q1 必然变大，leader 选举更难凑齐 quorum；网络分区时反而可能选不出新 leader，可用性变差。

2. **Quorum 形式 vs quorum 大小搞混**：FPaxos **不是**新 quorum 形式（grid / weighted 那种），而是放松"两阶段都得多数"的约束；底层 quorum 仍可以是简单计数。

3. **忘了 Q1 要撞所有可能的 Q2**：实现时不能只让 Q1 撞"上次成功的 Q2"，必须撞**所有**可能的 Q2 集合，否则会出现两个不同的决议。

4. **错以为 Raft 用不了**：Raft 同样基于 quorum intersection，只是历史上选了"两阶段都多数"。把 Raft 的投票 / 复制 quorum 参数化，就能套用 FPaxos 思想（已有研究和实现这么做）。

## 适用 vs 不适用场景

**适用**：

- 写入频繁、故障切换稀有的强一致 KV / log 复制（可把 FPaxos 旋钮嵌进 Paxos/Raft 变体）
- 偶数节点集群想"占满"票数
- 跨地域部署，想让稳态写入本地完成、故障时才跨地协调
- 需要在延迟 / 可用性之间精细调旋钮的强一致系统

**不适用**：

- 故障非常频繁的环境——Q1 大反而是负担
- 拜占庭容错场景（FPaxos 是 crash-stop 模型，BFT 要更强 quorum 条件）
- 完全静态、不区分 phase 1/2 的协议（如 ABD 寄存器）——它们已有自己的 quorum 理论
- 节点数很少（N=3）时收益极小，不值得增加配置复杂度

## 历史小故事（可跳过）

- **1998 年**：Lamport 的 *The Part-Time Parliament* 提出 Paxos，用多数派作 quorum，从此"两阶段两多数"成为业界默认。
- **2001 年**：Lamport 写 *Paxos Made Simple*，把同一个算法换成大白话，但 quorum 要求没动。
- **2006 年**：Lamport 提出 Fast Paxos，从消息轮数减少入手，没动 quorum 形状。
- **2016 年**：Howard、Malkhi、Spiegelman 这篇短文（arXiv 上 9 页）从最朴素的角度问"两个 quorum 都得是多数吗"——证明不必，写出 FPaxos。
- **2016 年之后**：学界把它推广到 Raft 等协议（Flexible Raft 一类工作）；工业上"可调 quorum"多属实验/定制部署，etcd/TiKV 默认仍是多数派 Raft。

## 学到什么

1. **协议的安全性条件常常被实现细节掩盖**——Paxos 真正需要的是 quorum 相交，不是多数派；这是分布式协议设计里反复出现的模式。
2. **稳态 vs 故障路径的代价可以独立调**——把"罕见路径"做贵换"频繁路径"做便宜，是工程权衡的核心思路。
3. **Q1 + Q2 > N 是个极简但强力的不变式**，比"多数派"更本质。
4. **工业上的"可调 quorum"功能都不是凭空发明**，背后多有这种理论级的小放松。

## 延伸阅读

- 论文 9 页 PDF：[Flexible Paxos arXiv 1608.06696](https://arxiv.org/abs/1608.06696)（密度低，可一气读完）
- Heidi Howard 的博客 [Flexible Paxos in Practice](https://decentralizedthoughts.github.io/2020-12-29-flexible-paxos/) — 用图说明 Q1/Q2 取值
- 视频：[Heidi Howard — Distributed Consensus and the Implications of NVM on Database Management Systems](https://www.youtube.com/watch?v=Aon0ks-Yp0g)
- [[paxos-1998]] —— FPaxos 放松的原始算法
- [[paxos-simple-2001]] —— 同一个算法的"大白话"版本
- [[raft]] —— 同一类共识协议，可套用 FPaxos 思想

## 关联

- [[paxos-1998]] —— FPaxos 是它在 quorum 上的合法放松
- [[paxos-simple-2001]] —— 大白话 Paxos，读完它再看 FPaxos 最顺
- [[fast-paxos-2006]] —— 同样想"加快 Paxos"，从消息轮数入手而非 quorum
- [[epaxos-2013]] —— 进一步去掉 leader，FPaxos 提供 quorum 灵活度做基础
- [[raft]] —— 工程化共识协议，FPaxos 思想可直接迁移
- [[lamport-1978]] —— Paxos 的历史前置（逻辑时钟与状态机复制）
- [[brewer-cap-2000]] —— FPaxos 的 Q1/Q2 旋钮本质是在 CAP 平面里挪动

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[epaxos-2013]] —— EPaxos — 没有 leader 的 Paxos，让每个副本平起平坐
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[raft]] —— Raft — 易理解的共识算法

