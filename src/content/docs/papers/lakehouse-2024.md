---
title: "Lakehouse Architecture: The Future of Data Management"
来源: https://arxiv.org/abs/2401.00006
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Lakehouse Architecture: 数据管理的新未来

## 一、从日常类比开始

想象一下你家的厨房。

**数据仓库（Data Warehouse）** 就像一个专用烘焙间——里面全是面粉、糖、模具。专门做甜点（分析报表）非常好用，但你没法在这里炒一盘家常菜（实时交易）。

**数据湖（Data Lake）** 就像一个超大仓库，什么都能往里扔——食材、锅碗瓢盆、工具。什么都有，但找东西像寻宝，而且如果你把生肉和甜点原料混在一起，很快就一团糟。

**湖仓一体（Lakehouse）** 就是把这两者合二为一：一个既能保持灵活性（像仓库一样能存任何东西），又有秩序（像烘焙间一样有规则、能追溯来源）的空间。你既能在这里炒家常菜，也能做甜点，而且每种食材放在哪里、什么时候放进去、谁动过，都有记录。

技术上来说，Lakehouse = 数据湖的低成本存储 + 数据仓库的管理能力和查询性能。

---

## 二、为什么需要 Lakehouse？

在 Lakehouse 出现之前，公司通常有两条数据通路：

1. **OLTP 数据库**（如 MySQL、PostgreSQL）：处理用户的日常操作——下单、注册、支付。快，但分析能力弱。
2. **数据仓库**（如 Snowflake、BigQuery）：分析海量历史数据——用户画像、销售趋势。分析很强，但存实时交易数据成本高。

中间需要一个 **ETL 过程**（Extract-Transform-Load），把 OLTP 的数据搬运到数据仓库。这个过程慢、复杂、容易出错，数据延迟常常是几小时甚至几天。

Lakehouse 的理念是：**为什么需要搬运？** 直接在湖上提供仓库级别的管理能力，让分析和交易数据用同一份存储。

---

## 三、核心概念

### 3.1 ACID 事务

ACID 是数据库的"四大纪律"：

- **A**tomicity（原子性）：要么全部完成，要么什么都不做。就像你转账——钱从 A 扣了、B 没收到，交易就回滚。
- **C**onsistency（一致性）：交易前后数据必须符合规则。比如账户余额不能变负数。
- **I**solation（隔离性）：两个同时进行的操作不会互相干扰。
- **D**urability（持久性）：一旦交易完成，数据就永久保存了，即使系统崩溃也不丢失。

在 Lakehouse 出现之前，"大数据湖"（如存储在 HDFS 或 S3 上的文件）通常不支持 ACID 事务。Lakehouse 通过 **事务日志（Transaction Log）** 解决了这个问题。

### 3.2 数据分区与分区修剪

想象一本百科全书分成 26 卷，每卷按字母 A-Z 排列。如果你想查"Zebra"，你直接翻到 Z 卷——这就是 **分区修剪（Partition Pruning）**。不需要读完 26 卷，只读相关部分。

Lakehouse 把大数据按某个字段（如日期、地区）分成"分区"，查询时跳过不需要的数据，速度提升巨大。

### 3.3 Schema-on-Read vs Schema-on-Write

- **Schema-on-Write（写入时定结构）**：传统数据仓库的做法。数据存入前必须先定义好格式。灵活但笨重。
- **Schema-on-Read（读取时定结构）**：数据湖的做法。数据随便存，查询时再解释格式。灵活但容易出错。

Lakehouse 取两者之长：**写入时保持灵活，读取时提供一致性**。

### 3.4 表格式（Table Formats）

这是 Lakehouse 的技术核心。它定义了一个元数据层，管理存储在对象存储（如 S3）上的数据文件：

| 表格式 | 开发方 | 主要生态 |
|--------|--------|----------|
| Apache Iceberg | 携程/Amazon | 通用 |
| Delta Lake | Databricks | Spark/Databricks |
| Apache Hudi | LinkedIn | Flink/Spark |

它们都提供：ACID 事务、时间旅行（Time Travel，可以查看历史版本）、UPSERT（更新/插入）、模式演进（Schema Evolution）。

---

## 四、代码示例

### 示例 1：用 PyIceberg 创建表和写入数据

```python
# 安装: pip install pyiceberg

from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import NestedField, StringType, DoubleType, TimestampType

# 1. 连接到表目录（Catalog）
# 这里用简单的文件目录作为示例，实际中通常连接 Spark / Trino 等
catalog = load_catalog("my_catalog")

# 2. 定义表结构（Schema）
# 假设我们要存电商订单数据
schema = Schema(
    NestedField(field_id=1, name="order_id", type=StringType(), required=True),
    NestedField(field_id=2, name="customer_name", type=StringType(), required=True),
    NestedField(field_id=3, name="amount", type=DoubleType(), required=True),
    NestedField(field_id=4, name="order_time", type=TimestampType(), required=True),
)

# 3. 创建表（如果不存在）
table_name = "my_catalog.inventory.orders"
try:
    table = catalog.create_table(table_name, schema=schema)
    print(f"表已创建: {table_name}")
except:
    table = catalog.load_table(table_name)
    print(f"表已存在，加载成功: {table_name}")

# 4. 插入数据
with table.new_append() as append:
    append.add_file("s3://my-bucket/data/orders/part-00000.parquet")

# 5. 查询（使用 PyArrow）
import pyarrow.parquet as pq
table_data = table.scan().to_arrow()
print(table_data.to_pandas())
```

### 示例 2：时间旅行（Time Travel）— 查看历史版本

```python
# 安装: pip install pyiceberg boto3

from pyiceberg.catalog import load_catalog

catalog = load_catalog("my_catalog")
table = catalog.load_table("inventory.orders")

# --- 当前数据 ---
print("=== 当前数据 ===")
current_snapshot = table.current_snapshot()
print(f"当前快照 ID: {current_snapshot.snapshot_id}")
print(table.scan().to_arrow().to_pandas())

# --- 时间旅行：查看第一次写入时的数据 ---
# 假设你知道第一次写入后的快照 ID（实际中可以通过 table.history() 获取）
history = table.history
print("\n=== 历史快照列表 ===")
for entry in history:
    print(f"  快照 ID: {entry.snapshot_id}, 时间: {entry.timestamp}")

# 通过快照 ID 读取历史数据
# 注意: pyiceberg 中通过 specifying a snapshot_id 实现
for entry in history:
    print(f"\n--- 快照 {entry.snapshot_id} 的数据 ---")
    df = table.scan(snapshot_id=entry.snapshot_id).to_arrow().to_pandas()
    print(df)
    break  # 只看第一个历史版本

# --- 模拟：删除数据后再恢复 ---
# 先追加一条新数据
with table.new_append() as new_append:
    new_append.add_file("s3://my-bucket/data/orders/part-00001.parquet")

print("\n=== 删除新数据后的快照 ===")
print("此时如果发生误操作，我们可以通过上面的历史快照 ID 恢复数据！")
```

### 示例 3：用 Spark 操作 Delta Lake（更常见的生产场景）

```python
# 安装: pip install delta-spark
# 需要 PySpark 环境

from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType
from delta.tables import DeltaTable
from pyspark.sql.functions import current_timestamp

# 1. 创建 Spark Session（带 Delta 支持）
spark = SparkSession.builder \
    .appName("LakehouseDemo") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

# 2. 写入数据到 Delta 表（自动创建）
data = [
    ("ORD-001", "Alice", 250.50, "2024-01-15 10:30:00"),
    ("ORD-002", "Bob", 120.75, "2024-01-15 11:45:00"),
    ("ORD-003", "Charlie", 380.00, "2024-01-16 09:00:00"),
]

schema = StructType([
    StructField("order_id", StringType(), True),
    StructField("customer_name", StringType(), True),
    StructField("amount", DoubleType(), True),
    StructField("order_time", StringType(), True),
])

df = spark.createDataFrame(data, schema)

# 写入 Delta 格式（支持 ACID）
df.write.format("delta") \
    .mode("overwrite") \
    .save("/tmp/lakehouse/orders")

# 3. 读取并查询
delta_table = DeltaTable.forPath(spark, "/tmp/lakehouse/orders")
delta_table.toDF().show()

# 4. UPSERT（合并更新/插入）
new_data = [
    ("ORD-002", "Bob Updated", 150.00, "2024-01-15 12:00:00"),
    ("ORD-004", "Diana", 90.25, "2024-01-16 14:30:00"),
]
new_df = spark.createDataFrame(new_data, schema)

# 如果 order_id 已存在则更新，否则插入
new_df.write.format("delta") \
    .mode("overwrite") \
    .option("mergeSchema", "true") \
    .save("/tmp/lakehouse/orders")

delta_table.update("customer_name = 'Bob Updated'", {"customer_name": "'Unknown Bob'"})

# 5. 时间旅行：回滚到之前的版本
# 读取某个时间点之前的数据
old_df = spark.read.format("delta").option("timestampAsOf", "'2024-01-15 12:00:00'").load("/tmp/lakehouse/orders")
old_df.show()

# 或者用版本编号
# old_df = spark.read.format("delta").option("versionAsOf", 0).load("/tmp/lakehouse/orders")
```

---

## 五、Lakehouse 的架构组件

```
┌─────────────────────────────────────────────────┐
│              查询引擎层                            │
│  Spark │ Trino │ Flink │ Presto │ Databricks     │
├─────────────────────────────────────────────────┤
│              表格式层 (Table Format)               │
│  Iceberg │ Delta Lake │ Hudi ── 元数据 + 事务日志  │
├─────────────────────────────────────────────────┤
│              存储层                                │
│  S3 │ HDFS │ ADLS │ GCS ── 廉价对象存储            │
└─────────────────────────────────────────────────┘
```

三个层次各司其职：
- **存储层**：用廉价的对象存储（如 AWS S3）存原始数据文件（Parquet/ORC 格式）
- **表格式层**：管理元数据和事务日志，提供 ACID、时间旅行等能力
- **查询引擎层**：任何计算引擎都能直接读存储层的数据，互不锁定

---

## 六、Lakehouse vs 传统架构

| 维度 | 数据仓库 | 数据湖 | 湖仓一体 |
|------|---------|--------|---------|
| 数据结构化程度 | 强（Schema-on-Write） | 弱（Schema-on-Read） | 两者兼顾 |
| 存储成本 | 高 | 低 | 低 |
| 实时性 | 低（批处理） | 高 | 高 |
| ACID 事务 | 支持 | 通常不支持 | 支持 |
| 数据类型 | 结构化为主 | 结构化 + 非结构化 | 全类型 |
| 适用场景 | BI 报表 | 数据探索、ML | 统一分析平台 |

---

## 七、总结

Lakehouse 不是一个"新技术"，而是对已有技术的聪明组合：

1. **对象存储**（S3）解决了成本问题
2. **表格式**（Iceberg/Delta/Hudi）解决了管理问题
3. **分布式计算引擎**（Spark/Flink）解决了计算问题

三者结合，让企业可以用低廉的存储成本，获得传统数据仓库级别的数据管理能力。这就是为什么它被称为"数据管理的新未来"。

---

## 八、延伸阅读

- Apache Iceberg 官方文档: https://iceberg.apache.org
- Delta Lake 论文: Databricks 技术博客
- "Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics" (Erickson et al., 2020)
