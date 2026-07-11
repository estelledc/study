---
title: Percolator 2010 — 给 Bigtable 加分布式事务的客户端库
来源: 'Peng & Dabek, "Large-scale Incremental Processing Using Distributed Transactions and Notifications", OSDI 2010'
日期: 2026-05-30
分类: 分布式系统
难度: 高级
---

## 是什么

Percolator 是 Google 2010 年发的一篇 OSDI 论文，做的事可以一句话讲完：**在 Bigtable 上面加一层客户端库，让原本只能"单行原子"的存储系统，跨行跨表也能跑 ACID 事务**。

日常类比：Bigtable 像一个超大号 Excel，你改一格能保证那一格不会半改半不改；但你要"同时改 A1 和 B1，要么都成功要么都失败"——它不管。Percolator 就是给这个 Excel 配了一套**便利贴 + 提交章 + 中央对表时钟**，让用户能拿这套工具自己组装出"跨格事务"的效果。

它要解决的真实问题：Google 网页索引以前用 MapReduce 全量重算，每来一批新网页就得把全网重跑一遍，端到端延迟好几天。Percolator 上线后（系统名 Caffeine），索引延迟从**几天降到几分钟**。

## 为什么重要

不理解 Percolator，下面这些事都没法解释：

- 为什么 TiKV / TiDB 的事务模型是 SI（snapshot isolation）而不是更强的 serializable——它直接复刻 Percolator
- 为什么 HBase + Apache Phoenix 也走"prewrite + commit"两阶段——同一份蓝本
- 为什么 Spanner 论文（2012）反复说"我们不要 TSO 单点"——就是在跟 Percolator 划清界限
- 为什么很多分布式数据库教程把 "Percolator 模型"当成一个独立词汇——它是工业界 SI 的事实标准

## 核心要点

Percolator 的设计可以拆成 **四个零件**：

1. **全局时间戳服务（TSO）**：一个集中式的发号器。论文里用主备 + 批量预分配后，吞吐大约 **每秒两百多万**个单调递增时间戳（不是上千万）。事务开始时拿一个 `start_ts`，提交时再拿一个 `commit_ts`。所有人按 ts 大小判先后。

2. **三列存储**：每个逻辑单元被拆成 **三列** 存进 Bigtable——`data`（实际值，按 ts 多版本）、`lock`（事务锁）、`write`（提交指针，从 `commit_ts` 指向某个 `data` 版本）。读的时候只看 `write` 列里的指针，看不到没提交的中间状态。

3. **Prewrite + Commit 两阶段**：客户端先在所有要改的行写 lock + data（prewrite），其中**一行选作 primary**；然后把 primary 的 lock 换成 write（commit 那一刻），其余行异步清理。primary 状态决定整个事务死活——这是单行原子性向上撬动跨行原子性的支点。

4. **Observers（通知机制）**：可以在某列上注册一个 trigger，cell 被写入就异步唤醒一个 worker 跑下游计算。这取代了 MapReduce 的"全量扫"——只算变了的那一小撮。

前三件是**事务内核**；Observer 是给增量索引用的**配套通知**。没有 Observer 也能跑跨行事务，但 Caffeine 那种"只算变更"的流水线就拼不起来。

## 实践案例

### 案例 1：跨行转账事务怎么落地

Alice 转 100 给 Bob。Percolator 流程：

1. 拿 `start_ts = 100`
2. **Prewrite**：选 Alice 这行做 primary
   - Alice 行写 `data@100 = 余额-100` + `lock@100 = "primary"`
   - Bob 行写 `data@100 = 余额+100` + `lock@100 = "pointer to Alice"`
3. 拿 `commit_ts = 110`
4. **Commit primary**：Alice 的 `lock@100` 删掉，写 `write@110 -> data@100`。**这一瞬间事务生效**。
5. **异步 commit secondary**：把 Bob 的 lock 也清掉，写 write 指针。

为什么 secondary 异步还安全？因为别人来读 Bob 看到 lock，就回头看 primary——primary 有 write 记录就说明事务已成，roll-forward 自己清理；primary 还在 lock 状态就 abort。

### 案例 2：crash 恢复怎么做

事务跑到 prewrite 一半客户端挂了，留下一堆孤儿 lock。Percolator 不需要 coordinator——后续读者来读看到旧 lock：

- 看 lock 指向的 primary 行
- primary 有 write 记录 → roll-forward（把 lock 替换成 write）
- primary 还在 lock 但已超时 → roll-back（删 lock 和 data）

整个系统**没有中心化的事务管理器**，全靠"primary 单行原子性"做仲裁。这是 Percolator 最优雅的一刀。

### 案例 3：TiKV 里你能直接看到 Percolator 影子

TiKV 把论文里的三列做成三个 **CF（column family，列族）**——可以当成 Bigtable 那三列的开源对照：`lock` / `default`（对应 data）/ `write`。事务 API：

```
TxnBegin → tso.GetTimestamp()
Put(k, v) → 写 lock CF + default CF
TxnCommit → tso.GetTimestamp() → CommitPrimary → CommitSecondary
```

提交流程和论文一字不差。读的时候 `MvccGet(k, read_ts)` 也是先看 lock、再看 write、再读 data，一模一样。

### 案例 4：observer 怎么取代全量 MapReduce

旧索引流程：每天全量跑一次 MR——读 100 PB 网页 → 算倒排 → 写回。每改一篇文章都要等下一次全量。

Percolator 流程：

1. 在"网页正文"列上注册 observer
2. 爬虫写入新网页 → cell 变 → observer 触发 → 跑只算这一篇的倒排
3. observer 输出落到"倒排索引"列 → 触发下一级 observer 更新文档排序

整条链路是数据流式的，**只算变了的那一小撮**。论文里提到 Caffeine 系统每秒处理几十万次 observer 触发。

## 踩过的坑

1. **TSO 是单点**：发号集中在一台（主备切换）。论文用批量预分配缓解（一次发约一万个，合计约数百万/秒量级）。后来 Spanner 用 TrueTime、CockroachDB 用 HLC 才彻底去掉这个单点。

2. **SI 不是 serializable**：存在 **write skew**——两个事务各读对方将要写的数据，各自检查约束都通过、并发提交，结果违反全局约束。OLTP 高竞争场景容易踩。Percolator 不解决这个，因为索引场景不在乎。

3. **悲观锁阻塞**：长事务持锁时间长，后来者全得等或 abort 重试。TiKV 后期加了"乐观事务"和"async commit"优化，但本质还是 Percolator 的锁模型。

4. **慢 10x**：每行操作要写三列 + 跑两阶段，per-doc 吞吐比 MapReduce 低一个数量级。Google 的取舍：**机器多花点没事，端到端延迟从天降到分钟**才是关键。

## 适用 vs 不适用场景

**适用**：

- 大数据增量处理（搜索索引、广告倒排、知识图谱更新）
- 高并发但**低竞争**的 OLTP（HTAP 的 OLTP 部分；竞争一高，锁等待/abort 会按踩坑第 3 条放大）
- 已有一个支持单行原子性的 KV / 表存储，想加分布式事务（HBase / Bigtable / 自研 KV）

**不适用**：

- 需要 serializable / 强一致地理分布 → 上 Spanner（TrueTime + Paxos）或 Calvin
- 高竞争事务 → 锁阻塞会很惨，考虑乐观 + 重试或 OCC
- 不能容忍 TSO 单点 → 选 HLC（CockroachDB / YugabyteDB）路线
- 微服务跨异构存储 → Saga / TCC 更合适

## 历史小故事（可跳过）

- **2004**：MapReduce 论文发表，Google 网页索引就是 MR 大户。
- **2006**：Bigtable 论文，给了 Percolator 的存储层。
- **2010**：Peng & Dabek 在 OSDI 发表 Percolator，Caffeine 系统已上线，索引延迟从 3 天降到几分钟。
- **2012**：Spanner 论文，明确批评 TSO 单点，用 TrueTime 接班。
- **2015 后**：PingCAP 创立 TiKV，事务层完全照搬 Percolator，让这个模型在开源世界活了下来。
- **今天**：TiDB / TiKV / HBase Phoenix / ByteDance内部多个 KV 都用 Percolator 模型。

## 学到什么

1. **单行原子性能撬动跨行原子性**——选一个 primary，所有人围着它转，事务死活由它一行决定。这是分布式事务里最便宜的范式之一。
2. **集中式时间戳够用**：在数据中心规模内，TSO 批量预分配就能到每秒数百万级；不是所有系统都需要 TrueTime / HLC 的复杂度。
3. **客户端协调 vs 服务端协调**：Percolator 把事务逻辑塞到客户端库，存储层零改动。代价是没法做服务端优化（如 Spanner 的 participant leader）。
4. **异步通知替代 MR**：observer 机制让"数据流"成为一等公民，比 batch 计算更适合增量场景。这个思想后来在 Differential Dataflow / Materialize 里被发扬光大。

## Percolator vs Spanner 速查

两篇论文经常一起被问，差异点列出来：

| 维度 | Percolator (2010) | Spanner (2012) |
|------|------|------|
| 时间戳 | TSO 单点（主备 + 批量预分配） | TrueTime（原子钟 + GPS 多源 + 不确定区间） |
| 一致性 | snapshot isolation | external consistency（等价 linearizable + serializable） |
| 协调 | 客户端库 | 服务端 participant leader |
| 复制 | 依赖 Bigtable 单 region | 多 region Paxos |
| 适用 | 单数据中心增量计算 | 全球分布 OLTP |

读完 Percolator 再读 Spanner 会有一种"这是同一帮人在改进自己"的感觉——很多设计选择是对 Percolator 痛点的直接回应。

## 延伸阅读

- 论文 PDF：[Percolator OSDI 2010](https://research.google.com/pubs/archive/36726.pdf)（14 页，工程论文，可读性高）
- TiKV 官方文档的事务章节：把 Percolator 翻译成代码级讲解
- 视频：CMU 15-721 数据库课有一节专门讲 Percolator vs Spanner

## 关联

- [[bigtable-2006]] —— Percolator 的存储底座，提供单行原子性这一支点
- [[spanner-2012]] —— Google 自己的接班人，用 TrueTime + Paxos 解决 TSO 单点
- [[hlc-2014]] —— 替代 TSO 的去中心化时间戳方案，CockroachDB 走这条路
- [[lamport-1978]] —— 逻辑时钟祖宗，Percolator 的物理时间戳与之思想同源
- [[aries-1992]] —— 单机事务的 WAL 范式，Percolator 把"日志 + 锁"拆成分布式版本
- [[paxos-1998]] —— Spanner 用 Paxos 复制时间戳服务，是对 Percolator 单点的修补
