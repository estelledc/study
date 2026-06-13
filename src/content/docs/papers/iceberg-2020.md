---
title: Apache Iceberg: A High-Performance Table Format
来源: https://iceberg.apache.org/spec/
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# Apache Iceberg: A High-Performance Table Format

## 什么是 Iceberg？

想象一下你在管理一个巨大的图书馆。这个图书馆有上百万本书（文件），分布在几十个书架（目录）上。

传统方式：你靠一本目录册来记录每本书的位置。每次有人借走一本书或归还一本书，你都得手动更新目录册。如果两个人同时修改目录册，就会冲突——你根本不知道哪本更新是对的。

Iceberg 做的很简单：**它不追踪每本书的位置，而是把"图书馆的状态"拍一张快照（snapshot），然后保留历史快照。** 查询时，你只需要告诉 Iceberg "我要哪一天的图书馆"，它就把所有该天的书找出来给你。

Iceberg 是 Apache 顶级项目，由 Netflix 开源，2019 年捐给 Apache 基金会。它设计的目标就三个字：**快、准、稳**。

---

## 核心设计目标

Iceberg  specification 明确提出了六个设计目标，理解它们是理解一切的基础：

1. **可序列化隔离（Serializable Isolation）**：读不会锁表，写不会互相干扰。每次 commit 是原子操作——要么全部可见，要么不可见。
2. **速度（Speed）**：规划一次查询只需要 O(1) 次远程调用，不会因为表变大而变慢。
3. **规模（Scale）**：客户端负责规划，不依赖中心元数据存储，避免瓶颈。
4. **演进（Evolution）**：表结构可以随时变化——加列、删列、改类型、重命名，安全且不影响历史数据。
5. **可靠类型（Dependable Types）**：类型系统严谨，不会出现"这列到底是啥"的歧义。
6. **存储分离（Storage Separation）**：分区是表的配置，不是文件系统结构。查询按数据值过滤，不依赖分区路径。

---

## 核心概念

### 1. 快照（Snapshot）

快照是 Iceberg 最重要的概念。每次提交写操作后，表就有一个新的快照，记录了"这个时刻表里有哪些文件"。

```
Snapshot A (2026-01-01): 文件 [data_001.parquet, data_002.parquet]
Snapshot B (2026-01-02): 文件 [data_001.parquet, data_002.parquet, data_003.parquet]
Snapshot C (2026-01-03): 文件 [data_003.parquet, data_004.parquet]
```

注意 Snapshot C 里 data_001 和 data_002 不见了——Iceberg 支持"追加写+删除文件"而不需要物理删除底层的 parquet 文件（它们可能被其他快照引用）。

### 2.  Manifest（清单文件）

每个快照包含一个 manifest list，里面列出了多个 manifest 文件。每个 manifest 记录了若干数据文件的元信息：文件路径、分区值、行数、列的最小/最大值等。

```
Manifest List (Snapshot B):
  ├── manifest_a.avro → 记录 data_001, data_002
  └── manifest_b.avro → 记录 data_003
```

查询时，Iceberg 根据 manifest 里的列统计信息（min/max）做谓词下推（predicate pushdown），直接跳过无关的 manifest，这就是 O(1) 查询的关键。

### 3. 表元数据（Table Metadata）

每次写操作产生一个新的 .metadata.json 文件，包含：
- 表的 schema（结构定义）
- 分区规范（partition spec）
- 当前和历史的 snapshot 列表
- 配置属性

表根目录里有一个 `meta/` 文件夹，里面放着最新和历史的 metadata 文件。Iceberg 通过原子替换指针（比如 `_last_checkpoint` 文件）来切换版本。

### 4.  Schema 演进（Schema Evolution）

你可以随时给表加列、删列、改类型、重命名，Iceberg 会跟踪每一次 schema 变化，且保证向后兼容：

```
Schema v1: {id: int, name: string, amount: double}
Schema v2: {id: int, name: string, amount: double, status: string}  ← 加了 status 列
Schema v3: {id: int, full_name: string, amount: double, status: string}  ← 改名
```

旧文件用 v1 schema 写入，查询时 Iceberg 自动映射到当前 schema，不重写数据。

### 5. 行级删除（Row-level Deletes）

v2 规范支持在不可变文件之上做行级删除和更新。Iceberg 引入了一种**删除文件（delete file）**：

- **位置删除（Position Delete）**：记录被删除行的文件路径和偏移量
- **等值删除（Equality Delete）**：用一个小的 parquet 文件记录"哪些行应该被删除"，通过等值条件匹配

这样不需要重写整个大文件，只需追加一个小的删除文件。

---

## 写入数据

Iceberg 的写流程可以概括为：

1. 从当前 snapshot 读取表状态
2. 写入新的数据文件（parquet/ORC/avro）
3. 创建新的 manifest，记录文件信息
4. 创建新的 snapshot，指向新的 manifest
5. 原子替换 metadata 指针

并发写入时，Iceberg 使用**乐观并发控制（Optimistic Concurrency Control）**：假设不会冲突，commit 时检查当前 snapshot 是否还是最新的。如果不是，自动回滚重试。

### 代码示例 1：用 Spark 读写 Iceberg 表

这是最常见的用法。假设你已经配置好了 catalog：

```python
from pyspark.sql import SparkSession

# 创建 Spark Session，启用 Iceberg
spark = SparkSession.builder \
    .appName("IcebergExample") \
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.iceberg.spark.SparkSessionCatalog") \
    .config("spark.sql.catalog.spark_catalog.catalog-impl", "org.apache.iceberg.aws.glue.GlueCatalog") \
    .getOrCreate()

# 创建一个 Iceberg 表
spark.sql("""
    CREATE TABLE IF NOT EXISTS my_db.sales (
        sale_id LONG,
        product STRING,
        amount DOUBLE,
        sale_date DATE,
        region STRING
    )
    USING iceberg
    PARTITIONED BY (region, days(sale_date))
    LOCATION 's3://my-bucket/iceberg/my_db/sales'
""")

# 写入数据
spark.sql("""
    INSERT INTO my_db.sales
    SELECT * FROM staging.sales_data
""")

# 查询 — 利用 manifest 的统计信息做谓词下推
spark.sql("""
    SELECT product, SUM(amount)
    FROM my_db.sales
    WHERE region = 'us-east' AND sale_date >= '2026-01-01'
    GROUP BY product
""").show()
```

### 代码示例 2：用 Python 操作 Iceberg 表

PyIceberg 是 Iceberg 的纯 Python 实现，不依赖 Spark，适合轻量场景：

```python
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import NestedField, LongType, StringType, DoubleType

# 连接到 Glue Catalog
catalog = load_catalog("spark_catalog", **{
    "type": "glue",
    "region": "us-east-1"
})

# 创建命名空间（数据库）
catalog.create_namespace_if_not_exists("my_db")

# 检查表是否存在
table_name = "my_db.sales"
if table_name not in catalog.list_tables("my_db"):
    # 定义 schema
    schema = Schema(
        NestedField(field_id=1, name="sale_id", type=LongType(), required=True),
        NestedField(field_id=2, name="product", type=StringType(), required=True),
        NestedField(field_id=3, name="amount", type=DoubleType(), required=False),
        NestedField(field_id=4, name="sale_date", type=StringType(), required=True),
        NestedField(field_id=5, name="region", type=StringType(), required=True),
    )
    table = catalog.create_table(table_name, schema=schema)
else:
    table = catalog.load_table(table_name)

# 读取数据
df = table.scan().to_arrow()
print(f"Loaded {len(df)} rows")

# 模式演进：给表加一列
table.update_schema().union_by_name().commit()
print(table.schema())
```

### 代码示例 3：时间旅行查询（Time Travel）

Iceberg 天然支持时间旅行——你可以查询任意历史快照：

```sql
-- 查询昨天快照中的数据
SELECT * FROM my_db.sales FOR SYSTEM_VERSION AS OF 3;

-- 查询特定时间点的数据
SELECT * FROM my_db.sales FOR SYSTEM_TIMESTAMP AS OF '2026-01-02 12:00:00';

-- 对比两个时间点的差异
SELECT 'before' AS snapshot, * FROM my_db.sales FOR SYSTEM_VERSION AS OF 2
UNION ALL
SELECT 'after' AS snapshot, * FROM my_db.sales FOR SYSTEM_VERSION AS OF 3;
```

---

## Iceberg 的内部结构

```
表根目录 /
├── metadata/
│   ├── 00001-abc.metadata.json      ← 历史 snapshot 1
│   ├── 00002-def.metadata.json      ← 历史 snapshot 2
│   └── 00003-xyz.metadata.json      ← 当前 snapshot（最新）
├── snap_
│   ├── snap_1...                    ← 各 snapshot 的快照文件
│   └── snap_2...
├── data/
│   ├── region=us-east/sale_date=2026-01-01/
│   │   └── data_001.parquet        ← 实际数据文件
│   ├── region=us-west/sale_date=2026-01-01/
│   │   └── data_002.parquet
│   └── delete/
│       └── deletes_001.parquet      ← 行级删除文件
└── metadata/
    └── last-task-id                ← 指向当前 metadata 文件的指针
```

关键设计点：
- 数据文件本身（parquet）**永不修改**，只追加
- 删除通过**删除文件**实现，原始文件保持不变
- 所有元数据用 **JSON** 存储，人类可读，方便调试
- manifest 文件用 **Avro** 存储，高效且支持 schema 演进

---

## Iceberg vs 传统方式

| 特性 | HDFS + Hive 分区表 | Apache Iceberg |
|------|-------------------|----------------|
| 文件发现 | 扫描整个分区目录 | O(1) 查 manifest |
| 模式演进 | REWRITE 整个表 | 原地更新 metadata |
| 行级更新/删除 | 不支持 | 原生支持 |
| 时间旅行 | 不支持 | 原生支持 |
| 并发写 | 需锁机制 | 乐观并发 |
| 小文件管理 | 需手动合并 | 自动 compaction |
| 表分区 | 文件系统结构 | 逻辑配置 |

---

## 生态集成

Iceberg 是**开放标准**，不绑定任何计算引擎。目前主流引擎都支持：

- **批处理**：Apache Spark, Apache Flink, Apache Hive
- **即席查询**：Trino, Presto, DuckDB, ClickHouse
- **云数仓**：Snowflake, BigQuery, Redshift, Databricks
- **流处理**：Kafka Connect, Apache Flink Structured Streaming
- **多语言**：Java (官方), Python (PyIceberg), Rust (IcebergRust), Go (IcebergGo)

这意味着你写一次表，可以用任何引擎读——真正实现了**计算与存储的解耦**。

---

## 总结

Iceberg 的本质是在**对象存储（S3/HDFS）之上的一个表格式层**，它做对了三件事：

1. 用**快照+manifest**结构实现高效文件发现（O(1) 查询）
2. 用**元数据 JSON** 实现结构演进和时间旅行
3. 用**乐观并发**实现多 writer 安全协作

理解了这三个核心，就理解了 Iceberg 的全部设计哲学。

---

*本文基于 Apache Iceberg specification（最新版本 1.11.0）编写，适合作为数据工程领域的入门阅读材料。*
