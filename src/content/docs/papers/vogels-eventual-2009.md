---
title: Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇
来源: 'Werner Vogels, "Eventually Consistent", ACM Queue Vol. 6 No. 6 (Dec 2008) / CACM Vol. 52 No. 1 (Jan 2009)'
日期: 2026-05-30
分类: papers / 分布式系统
难度: 中级
---

## 是什么

**Eventually Consistent** 是 Amazon CTO Werner Vogels 写的一篇综述。它用工程师听得懂的话回答一个问题：**为什么大型互联网服务的数据，不能保证你"刚写进去就立刻能读到最新值"？**

日常类比：你和朋友在两个城市分别开了同一家连锁咖啡店。你今天换了菜单，把"美式"改成"冰美式"。这条改动要先飞到总部、再分发回每家门店。在那几分钟里，你这家店看到的是新菜单，朋友那家店看到的是旧菜单。**最终**两家会一致——但**那一瞬间**不一致。

这就是"最终一致性"（eventual consistency）。Vogels 这篇 6 页文章做了三件事：

1. 把口语化的"最终一致"提炼成 **5 种可分类的工程合同**
2. 把 CAP 定理从理论翻译成"你必须在 C 和 A 之间选"的日常对话
3. 把 **BASE**（Basically Available, Soft state, Eventually consistent）作为 ACID 的对立轴推进了工业主流

## 为什么重要

不读这篇你解释不了：

- 为什么 Cassandra / DynamoDB / Riak 让你配 `N/R/W` 三个数字
- 为什么"购物车里删了的商品有时会复活"是 Amazon 故意设计的，不是 bug
- 为什么"我们这个服务选 CP 还是 AP"这种对话能成立——这套词汇就是从这篇出来的
- 为什么 [[spanner-2012]] 三年后用原子钟做"全球强一致"会被当成业界大事——它在挑战这篇文章默认的"必须放弃 C"

这篇是 2007 年 [[dynamo]] 论文的"科普后记"。Dynamo 给了**实现**，这篇给了**词汇**。

## 核心要点

**第一步：CAP 三选二的工程版**

Brewer 2000 年提出 CAP——一致性 (C) / 可用性 (A) / 分区容忍 (P) 三者只能选两个。Vogels 把它翻译成工程语言：

- **大型数据中心里网络分区是常态**，不是异常。机器死、交换机抖、跨区延迟飙升都算
- 所以 **P 不能放弃**——你不能说"分区发生时我直接挂掉"
- 剩下只能在 **C 和 A** 之间选：**CP 系统**（分区时拒绝写，保证一致）vs **AP 系统**（分区时继续写，事后再合并）

**第二步：BASE 作为 ACID 的对立轴**

| 维度 | ACID（数据库传统） | BASE（互联网规模） |
|------|-------------------|-------------------|
| 一致性 | 事务后立刻强一致 | Eventually consistent |
| 可用性 | 必要时拒绝服务 | Basically Available |
| 状态 | 持久化即不变 | Soft state（允许漂移） |

这不是非此即彼。实际系统常用混合策略——账户余额走 ACID，购物车走 BASE。

**第三步：最终一致性的 5 种变体**

"最终一致"听起来含糊，Vogels 给出 5 种**可命名、可承诺**的具体合同：

1. **因果一致 (Causal)**：有因果关系的写入，读到的顺序必须一致。基础是 [[lamport-1978]] 的 happens-before
2. **读己之写 (Read-your-writes)**：你自己刚写的，下次自己读必看到
3. **会话一致 (Session)**：在同一个会话里，至少有"读己之写"
4. **单调读 (Monotonic Read)**：读到值 v 之后，不会再读到比 v 旧的版本
5. **单调写 (Monotonic Write)**：同一进程发出的写，按发出顺序应用

工程上这 5 种可以叠加：会话一致 + 单调读 ≈ 用户体验上的"强一致幻觉"。

**第四步：N/R/W 公式**

副本数 N、读 quorum R、写 quorum W：

- `R + W > N` → 强一致（读写集合必相交）
- `R + W ≤ N` → 最终一致
- Dynamo 默认 `N=3, R=2, W=2`，介于两者之间偏强

不一致窗口 (inconsistency window) 由延迟、副本数、负载决定，**可观测可调**——这是这篇文章最实用的工程工具。

## 实践案例

### 案例 1：购物车的"商品复活"

你在手机上把商品 X 从购物车删了。这次操作打到副本 A，写成功。下一秒你在网页打开购物车，请求路由到副本 B（B 还没收到删除）。X 又出现了。

Dynamo 选择**不阻止**这种情况：宁可让你看到一次旧状态，也不能让"删除"操作因为副本不可达而失败。最终副本同步后 X 会消失——**但中间有几秒不一致窗口**。

### 案例 2：N/R/W 怎么选

3 副本场景：

- `R=1, W=1`：读写都飞快，但严重最终一致——可能读到旧值
- `R=3, W=3`：每次读写都要等 3 个副本，强一致但慢且脆弱（任一副本挂就阻塞）
- `R=2, W=2`：读写都要 2 副本回应，`R+W=4>N=3` 必相交 → 强一致但容忍 1 副本故障

这就是 Dynamo 默认的折中。

### 案例 3：为什么 Spanner 三年后值得专门写一篇

Vogels 这篇默认结论是"全球部署 → 必须放弃 C"。[[spanner-2012]] 用 TrueTime（GPS + 原子钟）给跨大洲事务一个全局时间戳，做出了真正的全球**强一致**数据库——这是对本文默认前提的一次有力反例，所以业界轰动。

## 踩过的坑

1. **CAP 的 C ≠ ACID 的 C**：CAP 的 C 是 [[linearizability-1990]] 那种"外部看像单点"，ACID 的 C 是"事务前后约束不变"。两个词同音不同义，混淆会让讨论失焦
2. **'最终一致' ≠ '没保证'**：5 种变体是从弱到强的合同。开发者必须问"我用的是哪种"，而不是笼统说"反正是最终一致"
3. **P 不可放弃是工程现实**：理论上你可以做不容忍分区的系统，只是大规模场景下没人这么做。把"P 是定理结论"挂嘴上是错的
4. **不一致窗口可观测**：很多人以为"不一致 = 不可控"。Vogels 强调它是**可测量、可设定 SLO** 的——P99 不一致窗口 < 100ms 是合理目标

## 适用 vs 不适用场景

**适用**：

- 全球部署 / 跨数据中心副本系统的一致性选型
- 面试时讨论 CAP 和一致性模型的标准答题框架
- 理解 Cassandra / DynamoDB / Riak 的 R/W/N 配置
- 向非分布式系统背景的同事解释"为什么购物车有时会复活已删商品"

**不适用**：

- 金融账本 / 库存扣减 / 唯一性约束 → 看 [[spanner-2012]]
- 单数据中心强一致即可用的系统 → 直接用传统 RDBMS
- 需要严格数学证明的场景 → 本文是工程综述，去看 [[linearizability-1990]] / [[sequential-consistency-1979]]

## 历史小故事（可跳过）

- **1979**：Lamport 提出 sequential consistency，定义强一致基线（[[sequential-consistency-1979]]）
- **1990**：Herlihy & Wing 提出 linearizability，把强一致严格化（[[linearizability-1990]]）
- **2000**：Eric Brewer 在 PODC keynote 抛出 CAP 猜想，**第一次提到 BASE 这个词**
- **2002**：Gilbert & Lynch 形式化证明 CAP
- **2007**：SOSP 上 Amazon 发表 [[dynamo]]，给 AP 系统一个完整实现
- **2008/2009**：Vogels 在 ACM Queue 写这篇综述，**让 BASE 和 5 种最终一致性变体进入主流词汇**
- **2012**：Google [[spanner-2012]] 用 TrueTime 给出反例——全球部署也能 CP

## 学到什么

1. **一致性是谱系不是开关**——5 种最终一致性变体让"弱一致"变得可设计、可承诺
2. **CAP 不是逼你二选一，是逼你说清楚选哪个**——AP 系统不是"放弃一致性"，是"承诺最终一致 + 某种客户端保证"
3. **N/R/W 是从理论到工程的桥**——把抽象一致性级别变成可调参数
4. **工程综述的价值**：本文没有新算法、没有新定理，但它**统一了行业词汇**，让架构对话能成立。这种贡献和写算法同样重要

## 延伸阅读

- 原文 PDF：[Eventually Consistent (CACM 版)](https://www.allthingsdistributed.com/files/cacm-eventually-consistent.pdf)（6 页）
- 进一步：[Bailis & Ghodsi, "Eventual Consistency Today: Limitations, Extensions, and Beyond", ACM Queue 2013](https://queue.acm.org/detail.cfm?id=2462076)（PBS 概率有界过期）
- [[dynamo]] —— 本文的实战支撑
- [[lamport-1978]] —— 因果一致性的理论基础
- [[linearizability-1990]] —— 强一致谱系的最严格端
- [[sequential-consistency-1979]] —— 强一致谱系的另一端
- [[spanner-2012]] —— 三年后对"必须放弃 C"的反例

## 关联

- [[dynamo]] —— Vogels 是 Amazon CTO，Dynamo 是这篇的实战版；本文给 Dynamo 的设计选择提供概念词汇
- [[lamport-1978]] —— happens-before 是因果一致性的基础
- [[sequential-consistency-1979]] —— 强一致基线，本文用它反衬最终一致
- [[linearizability-1990]] —— CAP 的 C 通常就是它
- [[spanner-2012]] —— 三年后用 TrueTime 给出 CP 全球数据库
- [[chandy-lamport-1985]] —— 分布式快照，与一致性观察密切相关
- [[lamport-tla-1994]] —— 用 TLA+ 验证一致性协议的工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dynamo-2007]] —— Dynamo 2007 — 让购物车在机器故障时也能写入
- [[helland-2007]] —— Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言
- [[scads-database-2008]] —— SCADS — 用户涨一万倍也不改应用的存储愿景
- [[server-sent-events]] —— Server-Sent Events — 服务器单向推送的标准协议
