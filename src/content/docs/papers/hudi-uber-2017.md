---
title: Apache Hudi：大数据增量处理
来源: https://hudi.apache.org/docs/concepts
日期: 2026-06-13
分类_原始: 大数据
子分类: 现代数据库
分类: 数据库
难度: 初级
provenance: pipeline-v3
---

## 是什么

Hudi（读作"Hudi"）是 Apache 的一个**数据湖表格格式**，它在 Hadoop 兼容存储（比如 S3、HDFS）之上提供了两个原语：**记录的更新/删除**和**变更流（change stream）**。

日常类比：想象你有一本巨大的账本，每天往里面记流水。传统做法是每天复制整本账本——今天加了 10 行，就把 1000 行全抄一遍（写放大极高）。Hudi 的做法是：每天只追加新增或变动的行，并打个日期戳。你想看"今天发生了什么"，直接翻当天的记录就好，不用重头翻。

## 核心概念

### Timeline（时间线）

Hudi 为表维护一条**时间线**，记录每一次操作（写入、清理、合并等）。每次操作叫一个 `instant`（瞬间点），由三个部分组成：

- `Instant action`：操作类型（如 COMMIT、CLEAN、COMPACTION）
- `Instant time`：单调递增的时间戳（如 `20190117010349`）
- `state`：当前状态（REQUESTED → INFLIGHT → COMPLETED）

时间线是 Hudi 所有能力的基石——有了它，你就能问"上次提交之后哪些数据变了"。

### File Groups 和 File Slices（文件组与文件切片）

表按**分区**（partition）组织，类似 Hive 表。每个分区包含若干个**文件组**，每个文件组由一个 `file id` 唯一标识。每个文件组包含多个**文件切片**，每个切片包含：

- 一个**基础文件**（`.parquet`，列式存储）
- 一组**日志文件**（`.log.*`，行式存储，包含对基础文件的增删改）

Hudi 采用 **MVCC 设计**：合并（compaction）把日志和基础文件合并成新切片，清理（cleaning）丢弃不需要的旧切片以释放空间。

### Index（索引）

Hudi 维护一个索引，把每条记录（`record key + partition path`）映射到一个固定的文件组。映射一旦建立就**永不改变**。所有该记录的版本都写进同一个文件组——这让你无需扫描全表就能找到并更新某条记录。

### 两种表格类型

| 特性 | Copy On Write (COW) | Merge On Read (MOR) |
|------|---------------------|---------------------|
| 存储格式 | 纯列式（Parquet） | 列式 + 行式（Parquet + Avro） |
| 写入方式 | 更新时重写整个 Parquet | 更新先写 delta 日志，异步合并 |
| 写入延迟 | 较高 | 较低 |
| 写入放大 | 高（每次更新重写整文件） | 低（增量追加到 delta 日志） |
| 读性能 | 优（纯列式扫描） | 快照查询需合并 base + delta |
| 适用场景 | 读多写少的分析型负载 | 低延迟写入 + 近实时查询 |

### 三种查询类型

- **Snapshot Query（快照查询）**：看到表的最新快照。MOR 表会在查询时动态合并 base 和 delta 文件，提供近实时数据。
- **Incremental Query（增量查询）**：只看到某个时间点之后新增或修改的数据——这是实现增量数据处理 pipeline 的关键。
- **Read Optimized Query（读优化查询）**：只看 base（列式）文件，提供和原生列式表相同的扫描性能。

## 代码示例

### 示例 1：写入 COW 表并执行增量查询

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("hudi-incremental").getOrCreate()

# 写入数据到 COW 表
df.write.format("hudi").mode("append") \
  .option("hoodie.table.name", "events") \
  .option("hoodie.datasource.write.storage.type", "COPY_ON_WRITE") \
  .option("hoodie.datasource.write.recordkey.field", "user_id") \
  .option("hoodie.datasource.write.partitionpath.field", "date") \
  .option("hoodie.partitionpath.dateform", "yyyyMMdd") \
  .save("/data/events")

# 增量查询：只看最近一次提交之后的数据
df_incremental = spark.read.format("hudi") \
  .load("/data/events") \
  .filter("_hoodie_commit_time >= '20190117010349'") \
  .filter("_hoodie_commit_time < '20190118010349'")

df_incremental.count()  # 只看这个时间窗口内写入/变更的记录
```

核心要点：Hudi 自动为每条记录加了 `_hoodie_commit_time` 字段，增量查询只需比较这个时间戳，无需扫描整个表。

### 示例 2：写入 MOR 表并查询变更流

```python
# 写入 MOR 表（支持近实时低延迟写入）
df.write.format("hudi").mode("append") \
  .option("hoodie.table.name", "events_mor") \
  .option("hoodie.datasource.write.storage.type", "MERGE_ON_READ") \
  .option("hoodie.datasource.write.recordkey.field", "user_id") \
  .option("hoodie.datasource.write.partitionpath.field", "date") \
  .option("hoodie.compaction.inline", "true") \
  .save("/data/events_mor")

# 增量查询 + 只读新增记录（不看到更新/删除）
df_new_only = spark.read.format("hudi") \
  .load("/data/events_mor") \
  .filter("_hoodie_commit_time = '20190117010349'") \
  .filter("_hoodie_is_delete = 'false'")

df_new_only.count()
```

MOR 表把更新写入 delta 日志，写入速度远快于 COW。`inline compaction=true` 表示每次写入后自动合并，让快照查询也能看到较新的数据。

### 示例 3：用 SQL 做增量查询

```sql
-- 快照查询：看到最新全量数据
SELECT * FROM events LIMIT 10;

-- 增量查询：只取 2019-01-17 当天提交的数据
SELECT * FROM events
WHERE _hoodie_commit_time >= '20190117000000'
  AND _hoodie_commit_time < '20190118000000';

-- 增量 + 只保留新增（排除更新和删除）
SELECT * FROM events
WHERE _hoodie_commit_time = '20190117000000'
  AND _hoodie_is_delete = 'false';
```

## 为什么重要

理解 Hudi 能解释很多大数据架构设计：

- **为什么 Uber、Shopee 等公司用 Hudi 做 CDC（变更数据捕获）？**——传统上，数据库变更靠监听 binlog 再写入数据湖，Hudi 直接把"支持更新的 Parquet 表"放在 S3 上，增量查询 = 变更流。
- **为什么数据湖能替代部分数据仓库？**——COW 表提供 ACID 语义和更新删除能力，查询引擎（Presto/Trino/Spark SQL）直接查 S3 上的 Parquet，不再需要把数据搬进 Redshift/Snowflake。
- **增量数据处理 pipeline 怎么构建？**——时间线 + 增量查询让"每天只处理新增数据"变成一行 filter，无需复杂的 watermark 或状态管理。

## 延迟 vs 完整性的权衡

Hudi 处理数据时有一个关键区分：**数据到达时间**（arrival time）和**事件时间**（event time）。

比如 9:00 的事件数据可能在 10:20 才到达。Hudi 用 `_hoodie_commit_time` 标记到达时间，用分区目录（如 `date=20190117`）标记事件时间。时间线让你只关心"哪些文件被提交了"，不需要自己实现复杂的迟到数据逻辑——Hudi 会把迟到数据写进对应的历史分区，而增量查询只扫描时间线上新的 commit。

**延迟和完整性的取舍**：如果你要求数据一旦写入立即可查，选 MOR + 内联合并；如果你接受分钟级延迟换取更好的读性能，选 COW 或 MOR + 异步合并。这个取舍决定了你的 pipeline 延迟下限。

### Compaction（合并）是什么

MOR 表随时间推移会产生越来越多 delta 日志文件。合并的过程就是把 delta 日志中的记录**合并到新的 base 文件**中，生成新的列式切片。合并可以是**同步**（每次写入后立即合并）或**异步**（后台定时合并）。合并频率越高，快照查询看到的延迟越低，但写入端付出的 I/O 代价也越高。

## 总结

Hudi 的核心思想很简单：**在对象存储上给 Parquet 加上"时间线 + 索引 + 更新能力"**。它不引入新的计算引擎，而是让现有的 Spark/Presto/Trino 直接获得流式数据处理能力。Timeline 是灵魂，File Groups 是骨架，COW/MOR 两种模式覆盖了"写多读少"和"读多写少"两大类场景。
