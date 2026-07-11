---
title: Spanner — 全球分布式 SQL 数据库
来源: 'Corbett et al., "Spanner: Google''s Globally Distributed Database", OSDI 2012'
日期: 2026-05-29
分类: 分布式系统 / 数据库
难度: 中级
---

## 是什么

Spanner 是 **Google 2012 年发表**的全球数据库——把 SQL 接口和"跨大洲事务一致性"塞进同一个系统。

日常类比：以前一个数据库只能放在一座城市，要全球用就得接受"国外用户访问慢、看到的版本不一致"。Spanner 把数据放全球，但保证你读到的版本是一致的——就像全世界都看着同一本账本，连挂钟时间也对得上。

它解决的核心问题：**跨洲事务怎么保证顺序**。一个广告主在纽约改预算，10ms 后东京副本要立刻看到——而且不能"读到旧值"。

## 为什么重要

不理解 Spanner，下面这些事都没法解释：

- 为什么 **CockroachDB / YugabyteDB** 长得像 Spanner（HLC 模拟 TrueTime），而 **TiDB** 更偏 Percolator、**FoundationDB** 走另一条有序 KV 路线
- 为什么 Google 内部敢用一个数据库跑 **AdWords**（每秒几百万事务、跨 5 大洲）
- 为什么"分布式时钟"突然从研究问题变成了**工程能用的 API**
- 为什么 2024 年 Cloud Spanner 终于加了 PostgreSQL 接口——承认 PG 兼容是必经之路

Spanner 是第一个**外部一致性**（external consistency）跨大洲数据库——不只是顺序一致，还要"顺序与挂钟时间一致"。

## 核心要点

Spanner 的三个发明：

1. **TrueTime API（核心）**：不再返回单一时间戳。`TT.now()` 返回一个**区间** `[earliest, latest]`，承诺真实时间一定落在区间内。区间宽度 ε 在 Google 数据中心 99% 情况下小于 7ms。

   类比：以前问"现在几点"，钟说"3:00:00.000"——但你不知道这个钟准不准。TrueTime 改成说"现在在 3:00:00.000 到 3:00:00.014 之间"——把不确定性显式暴露。

2. **Commit-Wait 协议**：写事务提交时，**故意阻塞 ~7ms**（等区间过完）才返回成功。这保证后续事务一定拿到更晚的时间戳——用 7ms 延迟换全球一致性。

3. **Paxos + 2PC 双层**：每个数据分片用 **Multi-Paxos** 选主、跨地域复制；多个分片之间用 **2-phase commit** 协调跨分片事务。SQL schema 变更也是 atomic 的（用 future timestamp 全局生效，不停机切换）。

底层时钟来源：**GPS 接收器 + 原子钟**双源——GPS 给绝对时间，原子钟保证 GPS 故障时仍能撑几小时。

## 实践案例

### 案例 1：跨美东/欧洲转账事务

一个用户从纽约的账号转钱给伦敦的账号：

1. 事务开始，coordinator 调 `TT.now()` 拿 `[t-ε, t+ε]`（ε≈7ms）
2. 选 commit timestamp `s = t+ε`（取区间右端，保守）
3. Paxos 复制写入到 5 个 region 的多数派
4. **commit-wait**：阻塞到 `TT.now().earliest > s`（约 **2ε≈14ms**，不是固定常数）
5. 释放锁、返回客户端 OK

之后任何 region 的读事务都看到这次转账——挂钟时间也对得上。

### 案例 2：Spanner SQL 接口

Spanner 的 SQL 长得几乎和 PostgreSQL 一样：

```sql
SELECT customer_id, SUM(amount)
FROM orders
WHERE region = 'asia-east1'
GROUP BY customer_id;
```

**逐部分解释**（tablet = 数据分片；每个分片是一个 Paxos 复制组）：

1. 规划器按主键范围把查询拆到多个 tablet
2. 每个 tablet 做 **snapshot read**（无锁读本地副本上的历史快照）
3. coordinator 汇总各分片结果返回——读路径通常比写快约 5 倍

### 案例 3：Google AdWords 的全球预算调整

广告主在控制台改预算（杀手级业务）：

1. 写事务提交预算新值，走 commit-wait（约 2ε）
2. 跨 region Paxos quorum 复制完成（约 50–100ms）
3. 任意 region 随后的读都能看到新预算——超预算窗口消失

旧方案（MySQL Cluster）要等**几分钟**别的 region 才看到。AdWords 约 2012 年迁到 Spanner/F1。

## 踩过的坑

1. **TrueTime 需要专用硬件**：GPS 接收器 + 原子钟。普通公有云用户买不到——CockroachDB 改用纯软件的 HLC（Hybrid Logical Clock），代价是 ε 从 7ms 涨到 250ms（35 倍宽）。

2. **写延迟 = commit-wait + 跨 region quorum**：commit-wait 约 2ε（ε≈7ms → ~14ms），跨 region Paxos 再加 ~50–100ms；跨洲 RTT 才是大头。同机房部署反而**比 PostgreSQL 慢**——commit-wait 白白等了。

3. **跨 region 读写不对称**：snapshot read 走本地副本 ~5ms；写事务必须等远端 quorum ~100ms。设计应用要把"写少读多"路径精心安排。

4. **Paxos leader 切换有 short blackout**：每个 tablet 的 Paxos leader 故障后，新 leader 选举 + 启动 commit-wait 需 5-10 秒。期间该 tablet **不可写**——跨 region 部署时这是日常。

5. **schema change 不是真"瞬间"**：论文说 atomic，实际是 background 异步——前端事务在切换瞬间可能看到旧 schema。CockroachDB 工业实践证明 schema change 是分布式系统最难的部分之一。

## 适用 vs 不适用场景

**适用**：

- 跨大洲多写入业务（广告投放、跨区清算、全球库存、跨境支付）
- 强一致性 + SQL 接口同时刚需的场景
- Google 内部、Cloud Spanner 客户、银行级金融
- 自建可接受 Spanner 启发的 OSS → CockroachDB / YugabyteDB（TiDB 更偏 Percolator 路线）

**不适用**：

- 单 region 业务 → PostgreSQL + 异地灾备已足够，别过度工程化
- 极高写吞吐 + 简单 KV → FoundationDB / DynamoDB 更合适（不是 Spanner 复刻）
- AP 优先 + 最终一致即可 → Cassandra / DynamoDB 更便宜
- OLAP 列存分析 → Snowflake / ClickHouse 完胜
- 没有 GPS+原子钟硬件的自建场景 → 选 HLC 系 OSS，别硬复刻 TrueTime

## 历史小故事（可跳过）

- **2006**：Bigtable 论文发表——Google 第一代分布式存储，单行原子但无跨行事务
- **2007**：F1 项目启动（Spanner 前身），AdWords 团队不堪 MySQL Cluster 之苦
- **2011**：Megastore 论文——在 Bigtable 上叠 Paxos，写延迟 100-400ms 出名"不能跑交易热路径"
- **2012**：Spanner OSDI 论文发表，拿最佳论文奖；F1 替换 AdWords MySQL Cluster
- **2013**：F1 论文（VLDB）单独发表
- **2014**：CockroachDB 创业公司起步，用 HLC 做 OSS 复刻；同年 Raft 论文发表
- **2015**：PingCAP 创立 TiDB（Percolator 派 + MySQL 兼容）
- **2017**：Cloud Spanner 商业化对外；YugabyteDB 起步（HLC + PostgreSQL 兼容）
- **2020**：TiDB 4.0 GA、CockroachDB 20.x 跑过 Jepsen
- **2024**：Cloud Spanner 上线 PostgreSQL 接口 GA——承认 PG 是必经生态

40 年理论（Lamport 1978 logical clock）→ 30 年共识（Paxos 1989）→ 12 年工程（Spanner 2012）→ 12 年生态（OSS 复刻全部生产可用）。

## 学到什么

1. **不确定性可以变成 API**：TrueTime 把"时钟不准"从 bug 翻成 `[earliest, latest]` 区间——这是过去 20 年分布式系统最重要的设计哲学之一
2. **故意等也是合理设计**：commit-wait 用 7ms 延迟换全球一致性——P99 高一点不一定是 bug，可能是 trade-off
3. **多层次解耦**：Paxos 负责复制、2PC 负责跨分片协调、TrueTime 负责排序——每层只做一件事
4. **理论 → 工程 → 生态**：1978 Lamport logical clock 到 2012 Spanner 跨 34 年才工业化；再 12 年才有 OSS 复刻生态成熟

## 延伸阅读

- 论文 PDF：[Spanner OSDI 2012](https://research.google/pubs/pub39966/)（密度极高，先读 §1 Intro 和 TrueTime 那节）
- 配套博客：[CockroachDB — Living Without Atomic Clocks](https://www.cockroachlabs.com/blog/living-without-atomic-clocks/)（讲怎么用 HLC 模拟 TrueTime）
- 视频教程：[MIT 6.824 Lecture — Spanner](https://www.youtube.com/watch?v=ZulDvY429B8)（Robert Morris 把 commit-wait 推导一遍）
- 后续论文：[F1: A Distributed SQL Database (VLDB 2013)](https://research.google/pubs/pub41344/)（Spanner 上层 SQL 怎么用）
- 同期对照：[Calvin (SIGMOD 2012)](https://cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf)（不用时钟的另一条路）

## 关联

- [[paxos]] —— Spanner 用 Multi-Paxos 复制每个 tablet
- [[raft]] —— 后续 OSS 复刻（CockroachDB / TiDB）改用 Raft，因更易理解
- [[selinger-1979]] —— Spanner 的 SQL 优化器（F1）继承 Selinger 框架
- [[volcano]] —— Spanner SQL 执行引擎走 volcano iterator 模型
- [[snowflake]] —— Snowflake 走 OLAP 列存路线，与 Spanner OLTP 派互补
- [[rocksdb-lsm]] —— Spanner SSTable 是 LSM 结构，CockroachDB 直接用 RocksDB

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[bigtable-revisit-2024]] —— Bigtable 二十年回顾 — 从三维表到云数据库
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[papers/kafka]] —— Kafka — 把消息系统降维成只追加的日志文件
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[paxos]] —— Paxos — 分布式共识算法
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[selinger-1979]] —— Selinger 1979 — 基于代价的查询优化
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tls-1.3]] —— TLS 1.3 — 把 HTTPS 握手砍到一个来回
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本
- [[cockroachdb]] —— CockroachDB — 分布式 SQL 数据库
- [[rethinkdb]] —— RethinkDB — 让数据库自己把更新推给客户端的先驱
- [[tidb]] —— TiDB — HTAP 分布式数据库
