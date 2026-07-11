---
title: Hekaton — SQL Server 的内存原生 OLTP 引擎
来源: 'Diaconu et al., "Hekaton: SQL Server''s Memory-Optimized OLTP Engine", SIGMOD 2013'
日期: 2026-07-08
分类: 数据库
难度: 中级
---

## 是什么

Hekaton 是 SQL Server 里一个**把热点表整表放进内存、用无锁结构跑短事务**的 OLTP 引擎（OLTP = Online Transaction Processing，像下单、扣款这种又短又频繁的交易）。

日常类比：店里不再每次去仓库翻厚账本，而是把**当天热销货架**搬到收银台旁；结账员之间也不抢同一支笔，而是各记各的小票，最后再对账。

它不是另起一个数据库，而是嵌在 SQL Server 里：你把某张表标成 memory-optimized，热点路径就能走 Hekaton；普通表仍走原引擎，可以同库混用。查询可以同时引用两类表，事务也可以同时更新两类表——迁移可以一张表、一个过程地渐进做。论文实验场景主要是高并发短事务，而不是通用分析负载。

## 为什么重要

不理解 Hekaton，下面这些事都讲不清：

- 为什么「内存够大」还不够——传统引擎仍按「数据在磁盘」设计，锁和闩锁会把多核吃掉
- 为什么 SQL Server 2014 起有 In-Memory OLTP：商用库如何把研究级主存引擎嵌进现有产品
- 为什么高频交易表要配合**本地编译存储过程**，而不是只改表属性
- 为什么后来的内存/HTAP 引擎都强调 latch-free + 多版本，而不是「再加几把锁」

## 核心要点

论文把加速拆成 **三刀**：

1. **内存优化表 + latch-free 索引**：行和索引常驻内存，用无闩锁（latch-free）结构，线程访问行时不互相堵在物理锁上。类比：货架按货位编号，店员不用抢同一把钥匙。

2. **乐观多版本并发（MVCC）**：读看自己的快照版本，写冲突才重试，而不是一上来悲观加锁。类比：每人复印一份菜单改，最后对一下谁改撞了。

3. **本地编译存储过程**：只碰 Hekaton 表的 T-SQL 过程可编译成机器码，去掉解释执行开销。类比：把收银台流程焊成固定流水线，不再每次翻操作手册。

索引上可选 **哈希索引**（等值点查，要设 BUCKET_COUNT）或 **范围索引**（有序扫描）。表可以 `SCHEMA_AND_DATA` 持久化，也可以 `SCHEMA_ONLY` 只保结构——后者更快，但重启丢数据。

## 实践案例

### 案例 1：声明一张内存优化表

```sql
CREATE TABLE dbo.AccountBalance (
  AccountId BIGINT NOT NULL PRIMARY KEY NONCLUSTERED HASH WITH (BUCKET_COUNT = 1000000),
  Amount BIGINT NOT NULL
)
WITH (MEMORY_OPTIMIZED = ON, DURABILITY = SCHEMA_AND_DATA);
```

**逐步解释**：

1. `MEMORY_OPTIMIZED = ON`：这张表改由 Hekaton 管，行常驻内存。
2. `SCHEMA_AND_DATA`：结构和数据都落日志，崩溃可恢复。
3. `HASH ... BUCKET_COUNT`：按账户 id 等值查；桶太少会撞链变慢，要按基数估算。

### 案例 2：短事务扣库存（乐观快照）

```sql
CREATE PROCEDURE dbo.DeductStock @id INT, @q INT
WITH NATIVE_COMPILATION, SCHEMABINDING
AS BEGIN ATOMIC WITH
(TRANSACTION ISOLATION LEVEL = SNAPSHOT, LANGUAGE = N'us_english')
  UPDATE dbo.Inventory SET Stock = Stock - @q
  WHERE Id = @id AND Stock >= @q;
  IF @@ROWCOUNT = 0 THROW 50000, 'stock insufficient', 1;
END;
```

**逐步解释**：

1. `NATIVE_COMPILATION`：过程编译成机器码，解释器开销去掉。
2. `BEGIN ATOMIC ... END`：整段一个原子块，适合短路径。
3. `SNAPSHOT` + `Stock >= @q`：读自己的版本，失败条件写在 SQL 里，避免「先读再写」拉长冲突窗口。

### 案例 3：持久性怎么选

```sql
-- 可恢复：订单、余额
WITH (MEMORY_OPTIMIZED = ON, DURABILITY = SCHEMA_AND_DATA)
-- 重启可丢：会话缓存、暂存队列
WITH (MEMORY_OPTIMIZED = ON, DURABILITY = SCHEMA_ONLY)
```

**逐步解释**：`SCHEMA_AND_DATA` 写日志、可恢复，适合真钱；`SCHEMA_ONLY` 更快但进程重启数据没了，只适合可重建的缓存表。选错会在故障演练时才爆。上线前用「杀进程再拉起」验证一次恢复预期。

## 踩过的坑

这些坑多半出在「以为改个表属性就完事」之后：

1. **整库改成内存表**：大表、分析型扫描吃内存且无收益；先用 profile 找真正热点。
2. **DURABILITY 选错**：`SCHEMA_ONLY` 当主数据用，重启后余额消失。
3. **长事务 / 跨引擎乱混**：内存表与磁盘表同事务可以，但长事务放大版本与冲突，抵消收益。
4. **以为改表属性就够**：热点路径不改成 natively compiled 过程，加速往往只有一小截。
5. **BUCKET_COUNT 拍脑袋**：哈希桶远小于基数时链表变长，点查退化；要按峰值行数留余量。

## 适用 vs 不适用场景

**适用**：

- 支付、库存、会话状态等**高频短事务**，单行/窄范围更新
- 愿意为热点表做容量规划，并接受内存表功能子集
- 延迟敏感，且能把逻辑收进本地编译过程
- 需要与现有 SQL Server 同库共存，而不是迁到另一套主存 DBMS

**不适用**：

- 大表扫描、复杂分析、ad-hoc 报表为主
- 团队无法监控内存占用、恢复时间与 failover
- 依赖内存表不支持的特性（部分约束/类型/操作），又不愿改 schema
- 工作集远超可用内存，却幻想「标成内存表就变快」

## 历史小故事（可跳过）

- **2010 前后**：主存变便宜，研究界主存 OLTP 升温（H-Store 等）。
- **2013**：Diaconu 等在 SIGMOD 发表 Hekaton，强调集成进 SQL Server 而非独立产品。
- **2014**：随 SQL Server 2014 以 In-Memory OLTP 名义商用。
- **之后**：工具与监控补齐；思路影响后续 HTAP / 内存优化引擎讨论。

它回答的不是「要不要买更大内存」，而是「内存常驻之后，锁、版本与编译路径该怎么重做」。

## 学到什么

1. **性能来自执行模型匹配负载**，不是「全部搬进内存」一句话。
2. **无锁结构 + 乐观多版本** 是多核短事务的常见组合拳。
3. **先切热点表与热点过程**，比全库迁移更符合这篇论文的工程主张。
4. **持久性档位是产品决策**：快与可恢复要显式选，不能默认。
5. **集成式主存引擎**的卖点是渐进迁移：不必把整个应用搬到另一套 DBMS。

## 延伸阅读

- 论文页：[Hekaton (Microsoft Research)](https://www.microsoft.com/en-us/research/publication/hekaton-sql-servers-memory-optimized-oltp-engine/)
- 文档：[In-Memory OLTP](https://learn.microsoft.com/sql/relational-databases/in-memory-oltp/in-memory-oltp-in-memory-optimization)
- 相关：[[mvcc]] —— 多版本可见性
- 相关：[[lock-free]] —— 无锁/无闩锁结构
- 相关：[[write-ahead-log]] —— 持久化与日志
- 对照：[[h-store]] —— 另一路主存 OLTP 分区思路

## 关联

- [[mvcc]] —— Hekaton 乐观并发的版本基础
- [[lock-free]] —— latch-free 索引与并发
- [[write-ahead-log]] —— SCHEMA_AND_DATA 的耐久路径
- [[oltp-vs-olap]] —— 短事务 vs 分析负载
- [[acid]] —— 事务语义仍要满足
- [[h-store]] —— 同期主存 OLTP 的分区路线对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[index-structures]] —— Learned Index Structures — 把数据库索引看成会预测位置的模型
- [[mvcc]] —— MVCC — 让读写互不挡路的版本账本
