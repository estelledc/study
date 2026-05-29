---
title: Calvin — 不要每次都协商，先排好顺序大家照做
来源: 'Thomson et al., "Calvin: Fast Distributed Transactions for Partitioned Database Systems", SIGMOD 2012'
日期: 2026-05-29
分类: 数据库
难度: 高级
---

## 是什么

Calvin 是一种**分布式数据库的事务架构**——所有副本不再每次执行事务时商量谁先谁后，而是**事先排好同一份执行清单，每个副本各自照着跑**，结果一定一致。日常类比：去银行办业务，传统数据库像每个柜员各自叫号、跨柜业务时靠对讲机商量谁先服务；Calvin 是大堂经理先发一张统一排队表，每个柜员看着同一张表叫号——**大家不需要商量，因为顺序已经定了**。

你写一段跨分区事务（"账户 A 给账户 B 转 100"，A 和 B 在不同分区）：

- 传统系统：每个分区先锁数据，再跑两阶段提交（2PC）协议互相确认 prepare / commit，最后释放
- Calvin 系统：事务先到 sequencer 节点，与同时段其他事务一起打包成 batch，用 Paxos 把 batch **顺序**复制到所有 replica → 各 replica 按这个固定顺序串行加锁、并发执行，**没有 prepare / commit 协议**

这把"分布式事务"reduce 成"分布式日志排序"——后者是成熟问题（Paxos / Raft 都能做）。

换句话说：Calvin 不是发明了一个更快的协议，而是**把难问题（事务协调）翻译成了已经解决的问题（日志排序）**。这种"问题转化"是分布式系统设计的高阶套路，论文标题里"Fast"其实有点谦虚——真正的贡献是"把跨分区事务从 2PC 解放出来"。

## 为什么重要

不理解 Calvin，下面这些事都没法解释：

- 为什么 FaunaDB 和区块链智能合约引擎都坚持"先共识顺序，再执行"——它们都是 Calvin 的徒弟
- 为什么 Spanner（同年发表）和 Calvin 是**两条相反路线**：Spanner 把时钟做成 API 来定顺序，Calvin 把时钟从 API 拿掉
- 为什么"分布式事务不能 scale"是个伪命题——真正不能 scale 的是 2PC，不是事务本身
- 为什么 Kafka partition leader 看起来像"小型 sequencer"——它们的核心抽象是同一个

## 核心要点

Calvin 把事务执行拆成 **三步**：

1. **排号（sequencer 收 batch）**：客户端事务先到 sequencer 节点，每 10ms 打包一次 batch。类比：餐厅服务员每 10 分钟把这一桌的点单条收一次，整批送到后厨。

2. **复制顺序（Paxos）**：sequencer 用 Paxos 把"这一批的执行顺序"复制到所有 replica。类比：把订单清单拍照发给所有分店，三个分店看到的顺序完全一样。

3. **各自 deterministic 执行**：每个 replica 拿到同样顺序的 batch，按声明的 read/write set 串行加锁、并发执行——**同样输入 + 同样顺序 = 同样输出**，根本不需要 commit 阶段对账。

硬约束：事务必须 upfront 声明会读哪些 key、写哪些 key（read/write set 已知），sequencer 才能正确路由。这一条是 Calvin 整套架构的"地基假设"——任何破坏它的事务（动态 SQL、跨分区 join、ORM 隐式 query）都需要走 reconnaissance phase 兜底。

## 实践案例

### 案例 1：sequencer 怎么把事务批成 epoch

Calvin 参考实现里的关键常量：

```cpp
Sequencer::Sequencer(...)
    : epoch_duration_(0.01), ...  // 每 10 ms 一批
```

**逐部分解释**：

- `epoch_duration_ = 0.01` —— 10ms 就 close 一个 batch，开始 Paxos 复制
- batch 越大，Paxos 协调成本摊得越薄，吞吐越高；但单事务延迟下限就是 epoch 长度
- 论文报告的 "100 节点 500k tps" 数字基于这个常量，是吞吐与延迟的折中

### 案例 2：deterministic 锁怎么消除死锁

经典 2PL（两阶段锁）由"谁先到 lock manager"决定锁顺序——非确定。Calvin lock manager 做了一个关键改动：

```cpp
// 锁请求按 sequencer 给的 batch 顺序登记
requests->push_back(LockRequest(WRITE, txn));
if (requests->size() > 1)
    not_acquired++;  // 前面有任何请求就阻塞
```

锁请求按全局事务顺序入队，**永远不会出现 "T1 等 T2 的锁、T2 又等 T1 的锁" 这种死锁**——拓扑上是一条单向链。

### 案例 3：reconnaissance phase 处理"读什么取决于读到什么"

TPC-C 的 NewOrder 事务：先读 customer 类型，再决定写哪些表。这种 read set 依赖运行时数据的事务，**做不到 upfront 声明**。Calvin 的兜底：

1. 先跑一个 read-only "侦察事务" 估算 read/write set
2. 正式事务跑时**验证**这个集合还成立（OCC 风格）
3. 不成立就 abort 重试

代价：业务方要为每类 dependent 事务**写两套查询**（侦察 + 正式）。这是 Calvin 工程上最被吐槽的部分，但保住了"提前知道 RWSet"的硬约束。

## 踩过的坑

1. **以为 Calvin 完全不需要时钟**：营销话术说"不需要时钟"，实际是不需要**跨节点时钟同步**——sequencer 切 10ms epoch 仍然依赖单机时钟。

2. **以为 reconnaissance 是框架自动的**：论文 §3.2.2 写得像自动机制，代码里其实是业务方手写一份只读侦察查询，迁移成本被低估。

3. **以为 500k tps 是完整路径**：参考实现的代码注释写"TPC-C / Microbenchmark 下 write set 不冲突，释放路径暂时注释掉了"——性能数字是简化锁路径下测的，真实生产含写冲突时未知。

4. **以为 sequencer 没瓶颈**：单 sequencer 节点的 batch 写吞吐就是整系统事务吞吐上限。多 sequencer 平摊只对独立事务有效，跨 region 事务仍要跨 sequencer 协调。

## 适用 vs 不适用

**适用**：

- 跨分区 OLTP 但**不能容忍 2PC blocking**（一个节点挂让事务 hang 数十秒）的场景
- 智能合约 / 区块链全节点共识引擎——deterministic execution 是底线
- 高吞吐 stored procedure 风格业务（RWSet 可预测、动态 SQL 少）
- 强一致性优先于全球低延迟的场景

**不适用**：

- 99% 的"单 region + 不跨分区"业务——直接用 PostgreSQL + 复制就够
- 大量动态 SQL / ORM 隐式查询——做不到 upfront 声明 RWSet
- 高竞争 + 高动态 RWSet 负载——reconnaissance 大量 abort/retry，反而更慢
- 全球地理分布 + 自家 GPS/原子钟基建——选 Spanner / TrueTime 路线
- 需要长事务（数分钟级）——sequencer 串行加锁会被长事务卡死整个 batch

## 历史小故事（可跳过）

- **2008 年**：H-Store（VLDB 2008）证明 stored procedure-only 数据库能扛百万 tps，但跨分区事务跑不动
- **2010 年**：Daniel Abadi 与博士生 Alex Thomson 发表 "The Case for Determinism in Database Systems"，提出 deterministic execution 概念，仍是论文层面
- **2012 年 5 月**：Thomson 等人在 SIGMOD 发表 Calvin——deterministic 思想的工程落地
- **2012 年 10 月**：Google 在 OSDI 发表 Spanner——同年但**完全独立**的另一条路线（时钟主义）。两篇互相引用为 "concurrent work"
- **2017 年起**：FaunaDB 基于 Calvin 思路上线商业产品；区块链智能合约 VM 的 deterministic execution 把 Calvin 哲学推到极致
- **2020 年**：Aria（VLDB 2020）放松 Calvin "必须 upfront 声明 RWSet" 的硬约束，让 deterministic 派可以处理动态事务——Calvin 思路的工程改进

## 学到什么

1. **"分布式事务难"是个伪命题**——真正难的是 2PC。能 reduce 到 ordering-only 协调，事务可以扛百万 tps
2. **顺序可以前置决定，不必每次商量**——这是 Calvin 给分布式协议的最大启示，写测试 / 写 CI 时强制 deterministic 也用同样思路
3. **同年两篇论文走相反路线都活下来**——Spanner 派统治 OLTP 主流（CockroachDB / TiDB / YugabyteDB），Calvin 派在区块链 / 强一致优先场景占据专门生态位
4. **工程现实 vs 论文宣称要双读**——论文 §6 是简化锁路径、reconnaissance 是业务责任、sequencer 是单点协调瓶颈，这些都不在标题页
5. **deterministic 思想能跨域迁移**——FoundationDB 的 simulation 测试、区块链共识的 EVM、Kafka 的 partition leader 都是 Calvin 哲学的不同投影：先固定顺序，再让所有节点照做

## 延伸阅读

- 论文 PDF：[Calvin SIGMOD 2012](http://cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf)（22 页，§3 是核心）
- 视频教程：[CMU 15-721 Distributed OLTP Lecture](https://www.youtube.com/watch?v=ZRP5WyAlzFw)（一节课讲完 Calvin vs Spanner 对照）
- 前作：[The Case for Determinism in Database Systems (VLDB 2010)](https://www.cs.yale.edu/homes/dna/papers/determinism-vldb10.pdf)
- 后作：[Aria (VLDB 2020)](https://www.vldb.org/pvldb/vol14/p476-lu.pdf) —— 不强制 upfront 声明 RWSet 的 deterministic 协议
- 博客：[Daniel Abadi — It's Time to Move on from Two-Phase Commit](https://dbmsmusings.blogspot.com/2019/01/its-time-to-move-on-from-two-phase.html)（作者本人 2019 年回顾 Calvin 视角）
- [[spanner]] —— 同年同主题的对照路线（时钟主义）

## 关联

- [[spanner]] —— 同年同主题的"对手"，时钟主义 vs Calvin 的 sequencer 主义
- [[paxos]] —— Calvin 用它复制 batch 顺序，是整套设计的协调底座
- [[raft]] —— Paxos 的工程化简化版，今天替代 Paxos 做 sequencer 复制更常见
- [[kafka]] —— partition leader 实质是个"小型 sequencer"，与 Calvin 同一抽象
- [[lamport-1978]] —— Lamport 时钟与 Calvin 的核心问题（事件全序）一脉相承
- [[bigtable]] —— 对照：单行原子无跨分区事务，与 Calvin 不在同一维度
- [[foundationdb]] —— deterministic simulation 测试方法论受 Calvin 启发
- [[dynamo]] —— 完全相反的派系：放弃 ACID 换可用性，是 Calvin 在 §1 直接对照的"NoSQL 派"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable]] —— Bigtable — Google 把行级随机读写做到 PB 级的存储
- [[dns]] —— DNS Domain Name System
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库

