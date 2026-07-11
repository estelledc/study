---
title: CRDT — 让多副本各改各的，最终自动合一
来源: Shapiro, Preguiça, Baquero, Zawirski, "A Comprehensive Study of Convergent and Commutative Replicated Data Types", INRIA RR-7506, 2011
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

CRDT（Conflict-free Replicated Data Type，无冲突可复制数据类型）是一套**让多个副本各自接受写入、不需要先打招呼，最后还能自动合到完全一致**的数据结构设计方法。

日常类比：三个人各拿一份购物清单，各自离线加东西、划掉东西。一周后聚到一起对一遍——不需要"谁是组长决定听谁的"，按一套**事先约好的合并规则**合一次，三人手里的清单自动一模一样。

Shapiro 等人在这篇 INRIA 长报告里做了三件事：

1. 给"无冲突合并"找到了**数学骨架**——半格（semilattice）和交换操作
2. 把这套骨架拆成两种等价表达：**状态型**（state-based / CvRDT）和**操作型**（op-based / CmRDT）
3. 拿这套骨架设计出一打具体数据结构：G-Counter、PN-Counter、OR-Set、LWW-Register、RGA 序列等

## 为什么重要

不理解 CRDT，下面这些现象都没法解释：

- 为什么多人改同一份数据可以**不弹冲突对话框**——核心是事先约定可交换的合并规则
- 为什么 **Figma** 官方说自己受 CRDT 启发（属性级 LWW），却又不是纯去中心化 CvRDT/CmRDT
- 为什么 **Riak 2.0** 直接给出 counter / set / map 这些"分布式数据类型"，让你不用自己写合并
- 为什么 **Yjs / Automerge** 底层算法名就是 OR-Set / RGA / LWW——直接来自这篇报告的设计

也是后续 CRDT 论文的母体：[[crdt-json]]（Kleppmann 2017）推广到嵌套 JSON，[[automerge-2016]] / [[yjs-2020]] 是工程落地。

## 核心要点

CRDT 的核心矛盾：**多副本各写各的，又要保证最后一致**。论文给出两条互相等价的路。

### 路一：状态型（CvRDT，convergent）

每个副本本地存一个状态。同步时把对方完整状态拉过来，本地跑一个 `merge(本地, 对方)` 函数。

数学要求 merge 必须满足三条：

- **交换律**：`merge(a, b) = merge(b, a)`（先收谁不重要）
- **结合律**：`merge(merge(a, b), c) = merge(a, merge(b, c))`（怎么分组不重要）
- **幂等律**：`merge(a, a) = a`（重复合不出新东西）

满足这三条的代数结构叫**半格（join-semilattice）**。这是关键洞见：合并问题本质是找一个半格。

### 路二：操作型（CmRDT，commutative）

不传状态，只广播操作（"加 1"、"加元素 X"）。要求**所有并发操作两两可交换**——A 先来还是 B 先来，结果相同。

代价：网络层必须保证可靠因果广播（每个操作至少送达一次，因果序保留）。

### 强最终一致（SEC）

两条路都给出比传统"最终一致"更强的保证：**只要两个副本收到了同一组更新，它们的状态就等价**——不需要等到"网络静止"，不需要等到"最后一次写完"。

## 实践案例

### 案例 1：G-Counter（只增计数器）

需求：10 台服务器各记一份点赞数，要算总和，不能丢。

设计：每个副本 i 维护一个向量 `V[1..n]`，`V[i]` 是自己加的数。加 1 时 `V[i] += 1`。读总数时返回 `sum(V)`。merge 时取**逐位最大**：

```
A: V = [3, 0, 1]    B: V = [3, 2, 0]
merge → V = [3, 2, 1]   总数 = 6
```

为什么对：`V[i]` 单调递增（你只会越加越多），逐位 max 满足半格三条。

### 案例 2：OR-Set（可删的集合）

朴素想法：集合 = G-Set 加 G-Set 减。问题：A 加 X、B 同时删 X，合起来 X 在不在？

OR-Set 的招：**每个 add 给元素打一个唯一 tag**。

```
A: add(X) → 存 (X, tag1)
B: 同时 remove(X) → 只能删它当时看到的 tag 集合 {} （没看到 tag1）
合并后：{(X, tag1)} 仍在 → X 仍在集合里
```

直觉上：**add 赢**——除非删的人确实看到了那个 add。这正符合人类对协同编辑的预期。

### 案例 3：LWW-Register（Last-Writer-Wins 寄存器）

每个写带时间戳，merge 取时间戳大的那一侧：

```
A: write("红", t=5) → ("红", 5)
B: 同时 write("蓝", t=7) → ("蓝", 7)
merge → ("蓝", 7)   // t 更大的赢；"红"被丢
```

**逐步解释**：① 本地写只改自己副本；② 同步时比时间戳；③ 相等时用副本 ID 破平。代价：时钟必须可比（Lamport 或物理时钟+副本 ID），并发写会丢一边。Cassandra / DynamoDB 单字段冲突常用这招。

## 踩过的坑

1. **OR-Set 墓碑膨胀**：每次 add 留一个 tag，删了也得留 tag 防"复活"，长期跑下来元数据爆炸。论文已指出但 GC 做不动——直到 [[delta-crdt-2016]] 才有较好答案。

2. **op-based 对网络层有强假设**：要求可靠因果广播。生产里 TCP + 应用层重发 + 因果序号才能凑齐，自己写极容易漏。

3. **不是所有结构都有 CRDT 形式**：银行余额必须 ≥0 这种**全局约束**，CRDT 自己保证不了——因为它假设并发操作可交换，而"先扣 100 还是先存 50"对"够不够 100"答案不同。需要外加协调。

4. **状态型 vs 操作型不是二选一**：实践常混用——本地操作型省带宽，跨数据中心状态型抗丢失。Riak 选状态型为主，Automerge 偏操作型。

## 适用 vs 不适用场景

**适用**：
- 协同编辑（多人改同一文档/画板）
- 离线优先应用（手机/本地客户端先改，联网再合）
- 多数据中心 active-active 复制（Riak、Redis Enterprise CRDB）
- 计数器、点赞数、购物车这类"加加加偶尔减"的数据

**不适用**：
- 强一致需求（金额扣减、库存防超卖）→ 用 [[paxos-1998]] / [[raft]] / 2PC
- 需要"先到先得"语义 → CRDT 的合并是数学决定，不是时间决定
- 数据量小但结构复杂且约束强 → 协调成本可能反而更低

## 历史小故事（可跳过）

- **2007 年**：Letia / Preguiça / Shapiro 在 SOSP'07 发表 Treedoc，第一个完整的"协同序列 CRDT"
- **2011 年**：Shapiro 等人在 SSS 2011 短文+这篇 INRIA 长报告里**正式给 CRDT 命名并系统分类**——这是"CRDT" 这个词第一次以现在的形态出现
- **2012 年**：Bieniusa 等人提出 OR-Set 的优化变种，Riak 团队开始把它工程化
- **2017 年**：Kleppmann [[crdt-json]] 把这套推广到嵌套 JSON，正式打通和"协同编辑"的桥
- **2020s**：Yjs / Automerge / Liveblocks / 各种实时协作平台底层全是这一脉

## 学到什么

1. **合并问题 = 半格问题**——这是过去 20 年分布式数据最重要的一个数学洞见，把"听起来很难"变成"找一个半格"
2. **状态型 vs 操作型是同一枚硬币的两面**——一个传状态省网络层假设，一个传操作省带宽，按场景选
3. **强最终一致（SEC）比"最终一致"严格得多**——传统 EC 只承诺"网络静止后会一致"，CRDT 承诺"收同一组更新就一致"，没有"静止"概念
4. **数学先行才能工程稳**——OR-Set / RGA 这些设计如果靠拍脑袋，做出来一定有边角 case；正是因为先证半格性质再写代码，才能让 Yjs 这种库被几十万开发者用而很少出"诡异冲突"

## 延伸阅读

- 论文 PDF：[INRIA RR-7506 长版](https://hal.inria.fr/inria-00555588/document)（50 页，包含所有 CRDT 设计的完整证明）
- 视频：[Martin Kleppmann — CRDTs and the Quest for Distributed Consistency](https://www.youtube.com/watch?v=B5NULPSiOGw)（30 分钟讲完核心思想）
- 工程入门：[Riak Data Types 文档](https://docs.riak.com/riak/kv/latest/developing/data-types/)（第一个把 CRDT 商业化的数据库）
- 互动可视化：[CRDT.tech](https://crdt.tech/)（社区维护的 CRDT 索引 + demo）
- [[crdt-json]] —— 这篇论文 6 年后被推广到嵌套 JSON 文档
- [[automerge-2016]] —— Kleppmann 团队的 JS 实现
- [[yjs-2020]] —— web 上跑得最快的 CRDT 引擎

## 关联

- [[crdt-json]] —— Kleppmann 2017 把 CRDT 推广到任意嵌套 JSON
- [[brewer-cap-2000]] —— CAP 定理；CRDT 站在 AP 一边，用数学换强一致
- [[bayou-1995]] —— 早期最终一致系统，CRDT 思想的远祖
- [[lamport-clocks-1978]] —— OR-Set / LWW 都依赖 Lamport 风格逻辑时钟
- [[raft]] —— 强一致路线代表，与 CRDT 互补：要严格全序就用 Raft

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[automerge]] —— Automerge — 让两份 JSON 自动合并的 CRDT 库
- [[bayou-1995]] —— Bayou — 离线先改本地，再回来和别人合并
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[cops-2011]] —— COPS — 大规模跨地域存储如何用得起的代价拿到因果一致
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[crdt-sss-2011]] —— CRDT 形式定义 — SSS 2011 八页浓缩版
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[jupiter-1995]] —— Jupiter — 把 OT 简化成 client-server，让协同编辑能上工业
- [[liveblocks]] —— Liveblocks — 多人协作的托管基础设施
- [[logoot-2010]] —— Logoot — 给每个字符发一张"永不过期的座位号"
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[ot-1989]] —— OT — 多人同时改一份文档，操作随上下文自动改坐标
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[raft]] —— Raft — 易理解的共识算法

