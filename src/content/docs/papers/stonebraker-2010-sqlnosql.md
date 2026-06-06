---
title: Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
来源: 'Michael Stonebraker, "SQL Databases v. NoSQL Databases", CACM 2010'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 初级
provenance: pipeline-v3
---

## 是什么

Stonebraker 2010 年写的两页 CACM 短文，对当时正火的 NoSQL 浪潮反击：**SQL 数据库慢，不是因为 SQL 这门语言慢，也不是因为关系模型慢，而是因为老牌 RDBMS（Oracle、MySQL、DB2）背着 1970 年代的实现包袱**。

日常类比：一辆 1970 年的奔驰跑不过 2010 年的本田，不能因此说"奔驰这个品牌不行"——是这台车老了，发动机改一下就行。

Stonebraker 把传统 RDBMS 解剖给你看：CPU 时间里大约 **96% 花在四件杂事**（日志、锁、闩锁、缓冲池管理），**只有 4% 在真正干活**。NoSQL 的做法是把 SQL 和 ACID 一起扔掉换性能；Stonebraker 的做法是只砍这四件杂事，SQL 和 ACID 都留下——两全其美。这条路线后来叫 NewSQL，代表系统是他自己参与的 H-Store / VoltDB。

## 为什么重要

不理解这篇短文，下面这些事都没法解释：

- 为什么 Spanner / TiDB / CockroachDB 都说自己是"SQL + 高扩展"，没接着用 NoSQL 路子
- 为什么 VoltDB 一个 8 核机器能跑出 50-100 倍传统 OLTP 的吞吐
- 为什么 2015 年后的内存数据库大部分不再写 redo log，靠副本恢复
- 为什么"分布式系统就该用 NoSQL"是个被反驳过的口号，但很多人还在传

## 核心要点

Stonebraker 的论证可以拆成 **三步**：

1. **拆账单**：传统 OLTP RDBMS 跑 TPC-C 时，CPU 时间被切成五块——日志写 WAL（约 25%）、加锁（约 20%）、闩锁短锁（约 15%）、缓冲池找 page（约 35%），真正算业务的只有 5% 左右。类比：饭店厨师 95% 时间在洗碗、找菜、记账，5% 时间真正炒菜。

2. **指出归因错误**：NoSQL 阵营说"SQL 太慢所以扔掉"，但 SQL 编译后落到底层就是几个 get / put，和 NoSQL 接口本质一样。**慢的是上面那五块杂事，不是 SQL 这个语言**。把 SQL 扔了不解决问题。

3. **给出新方案**：把四件杂事各换一种实现——日志改用副本恢复（多机互为备份）、锁改用单线程分区（一个分区一个线程，根本不抢锁）、闩锁因为单线程也消失、缓冲池因为数据全在内存也消失。结果是 SQL 接口 + ACID + 50-100 倍吞吐。这就是 H-Store 论文的设计，VoltDB 是它的商业化版本。

三步加起来：**SQL 没错，老实现有错，重写就能既快又对**。

## 实践案例

### 案例 1：拆传统 RDBMS 的 CPU 饼图

Harizopoulos-Madden-Stonebraker 2008 SIGMOD 的 Shore DBMS 测出来的数据，跑 TPC-C 的 New-Order 事务：

```
日志（log manager）        ~25%   写 WAL，强刷盘
加锁（lock manager）        ~20%   两阶段锁的获取/释放
闩锁（latch / mutex）       ~15%   B-tree 节点、锁表、缓冲池的短互斥
缓冲池（buffer manager）   ~35%   把 page 从磁盘换进内存、LRU 替换
真正干业务                 ~5%    其实就是几次内存读写
```

**逐部分解释**：

- 这个测试是把 TPC-C 数据全部放进内存（避免磁盘 I/O 干扰），结果纯 CPU 还是只有 5% 在干正事
- 砍掉前四块的任意一块，性能立刻翻倍；全砍掉，理论上能 20 倍
- 这张饼图是 Stonebraker 整篇文章的杀手锏证据，后来被无数 NewSQL 论文引用

### 案例 2：H-Store 怎么砍掉这四块

```
日志    →  副本恢复：N 台机器互为备份，宕机从其他机器拉数据
锁      →  单线程分区：一个分区一个线程，事务排队执行不抢锁
闩锁    →  没有共享：单线程下没有共享数据结构，闩锁自然消失
缓冲池  →  全内存：数据常驻 RAM，没有 page 换入换出
```

**逐部分解释**：

- "单线程分区"是最反直觉的一招：你以为多线程才快，但锁/闩锁的开销大于多线程收益
- 副本恢复的代价：要保证至少 K+1 台机器同时挂掉才丢数据，所以集群要足够大
- 这个设计假设："事务很短 + 数据能放进内存 + 90% 事务不跨分区"——OLTP 场景大都成立

### 案例 3：Stonebraker 反 NoSQL 的三个论点

```
NoSQL 论点 A：性能更好
反驳：性能差距来自老实现，不是 SQL；H-Store 用 SQL 也能更快

NoSQL 论点 B：schema 灵活
反驳：JSON 列 / hstore / 半结构化扩展能给 SQL 加灵活性；
      schema-less 把数据治理责任甩给应用层，是债不是资产

NoSQL 论点 C：扩展更容易
反驳：分片 + 副本 SQL 也能做（H-Store 已证明）；
      牺牲 ACID 换 scale-out 是把锅甩给应用程序员
```

逐条解释：A 论点最致命，因为 Stonebraker 用论文数据回应；B 和 C 偏价值观，但他指出"代价被隐藏在应用层"这点至今有效。

## 踩过的坑

1. **把"SQL 慢"错误归因到语言层面**：SQL 经过查询优化器编译后落到底层就是几个 index seek + page read，和 NoSQL 的 get/put 没本质差别，慢的是日志/锁/闩锁/缓冲池四块。

2. **为了性能扔掉 ACID 害死自己**：把一致性责任甩给应用层后，应用代码慢慢长出"手写两阶段提交""手写幂等键""手写补偿事务"——这是债不是资产，到 2015 年 Jepsen 一篇接一篇打脸 NoSQL 一致性。

3. **以为内存数据库不需要日志**：宕机后数据没了还是要恢复，只是从"WAL 重放"变成"副本拉取"——副本本质上也是一种日志，只是分散在多机上。

4. **把"单线程分区"当万能药**：H-Store 假设 90% 事务不跨分区，跨分区事务要走分布式协调。分区键设计错了，跨分区比例飙到 50%，性能直接崩盘。

## 适用 vs 不适用场景

**适用 Stonebraker 路线（NewSQL）**：
- OLTP 工作负载（短事务、高并发、强一致）→ VoltDB / TiDB / CockroachDB
- 数据量能放进多机内存（几十 TB 量级，分区到 100+ 节点上）
- 业务上 90% 事务能落到单分区——典型如电商订单按用户分片、银行账户按账号分片

**不适用（NoSQL 还是有它的位置）**：
- 海量非结构化数据（日志、图片元数据）→ S3 / 对象存储
- 弱一致可接受的读多写少（CDN 缓存、leaderboard）→ Redis / Cassandra
- 图遍历、时序、向量检索等专用模型 → Neo4j / InfluxDB / Pinecone（多存储引擎并存）
- 数据 PB 级且预算有限 → HDFS + Spark 还是更便宜

## 历史小故事（可跳过）

- **2006-2008 年**：Google BigTable、Amazon Dynamo、Facebook Cassandra 相继公布，社区开始喊"SQL 已死"
- **2008 年 SIGMOD**：Harizopoulos-Madden-Stonebraker 发表 *OLTP Through the Looking Glass*，第一次定量拆出 96%/4% 那张饼图
- **2008 年 VLDB**：Stonebraker 团队发表 H-Store 设计，证明砍掉四块开销可以 50-100 倍快
- **2010 年 4 月**：本文在 CACM Viewpoint 发表，2 页短文，成为 NewSQL 阵营的公开宣言
- **2011 年**：分析师 Matt Aslett 创造"NewSQL"标签，VoltDB / Clustrix / NuoDB 进场
- **2012 年**：Google Spanner 论文出来，证明大规模 SQL + ACID 真的能跑

## 学到什么

1. **慢的是实现不是抽象**——这是数据库系统设计 50 年的反复教训：模型对了实现可以重写，模型扔了路就走窄了
2. **拆账单是科学，扔接口是政治**——Stonebraker 用 5% 那张饼图把对方反驳得无话可说，靠的是定量分析不是嘴炮
3. **ACID 不是性能税而是开发税的反面**——扔掉 ACID 看似省了数据库的事，应用层补回来的代价大得多
4. **预言失败也是好预言**：Stonebraker 当年说 NoSQL 会消亡，事实是 NoSQL 没死但 NewSQL 也起来了——结果是数据库走向多模型并存

## 延伸阅读

- 原文 PDF：[SQL Databases v. NoSQL Databases](https://cacm.acm.org/magazines/2010/4/81481-sql-databases-v-nosql-databases/fulltext)（CACM 2010, 2 页）
- 杀手证据论文：[OLTP Through the Looking Glass](https://hstore.cs.brown.edu/papers/hstore-lookingglass.pdf)（Harizopoulos-Madden-Stonebraker SIGMOD 2008，那张饼图的出处）
- H-Store 设计：[The End of an Architectural Era](https://hstore.cs.brown.edu/papers/hstore-endofera.pdf)（VLDB 2007，单线程分区 + 内存常驻的完整设计）
- 视频：[Andy Pavlo CMU 15-721 — In-Memory Databases](https://www.youtube.com/watch?v=watch?v=15-721)（CMU 数据库公开课讲 H-Store 的那一节）
- [[cassandra-2010]] —— Stonebraker 反对的典型 NoSQL 系统之一
- [[spanner-2012]] —— Google 用大规模 SQL + ACID 实证 Stonebraker 路线

## 关联

- [[codd-1970]] —— 关系模型的源头，Stonebraker 全文都在为它辩护
- [[aries-1992]] —— 传统 WAL 日志的标准实现，Stonebraker 要砍掉的对象之一
- [[gray-1981-transaction]] —— ACID 概念的奠基论文，Stonebraker 主张保留的核心
- [[cassandra-2010]] —— 这篇文章直接论战的对象（Cassandra 是当时 NoSQL 代表）
- [[spanner-2012]] —— Google 后来证明 SQL + ACID 真能大规模跑
- [[dewitt-gray-1992]] —— 并行数据库的早期路线，Stonebraker 路线的精神前辈
- [[bigtable-2006]] —— NoSQL 浪潮的起点，本文的反方代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[duckdb-2019]] —— DuckDB — 把 OLAP 数据库塞进你的 Python 进程
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[skip-locked-postgres-9.5]] —— SKIP LOCKED — 让 Postgres 当任务队列用
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[sqlite-2022]] —— SQLite — 嵌入式数据库 30 年怎么活下来的
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账

