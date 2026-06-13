---
title: Lakehouse — 用开放格式统一数据仓库与高级分析
来源: https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：公司资料室的三次升级

想象一家公司的「资料管理」：

**第一代（数据仓库）**像**精装档案室**：所有报表材料进门前必须按固定模板整理（schema-on-write），查 BI 报表很快，但扩容贵、视频/日志/图片进不来，新数据也要等 ETL 搬进来才能查。

**第二代（湖 + 仓两层）**像**先堆杂物间、再挑精品进档案室**：原始数据廉价丢进 S3/HDFS 的「数据湖」（schema-on-read），重要表再 ETL 到 Snowflake/Redshift。便宜是便宜了，但同一份数据要搬两次、管道多、湖和仓语义不一致，分析师常查到**过期数据**——论文引用的 Fivetran 调查显示 86% 分析师用过过时数据。

**第三代（Lakehouse，湖仓一体）**像**带管理员系统的开放货架**：数据仍以 Parquet/ORC 等**开放格式**躺在廉价对象存储上，任何人（SQL 引擎、Spark、TensorFlow）都能直接读文件；同时在文件之上加一层**事务元数据**（Delta Lake / Iceberg / Hudi），补上 ACID、版本、审计、索引统计——BI 和机器学习共用同一套真源，少一层 ETL。

这篇 CIDR 2021 论文由 Databricks 的 Michael Armbrust、Ali Ghodsi、Reynold Xin、Matei Zaharia 撰写，提出 Lakehouse 作为下一代开放数据平台架构，并在 TPC-DS 上展示可与主流云数仓竞争的性能。

---

## 是什么

**Lakehouse** = **Data Lake 的低成本开放存储** + **Data Warehouse 的管理能力与 SQL 性能**。

论文给出的三个核心特征：

1. **开放、可直接访问的数据格式**（Apache Parquet、ORC 等），不锁在厂商私有格式里。
2. **对机器学习 / 数据科学的一等公民支持**——大表用 DataFrame、非 SQL 代码直接读对象存储，而不是经 ODBC/JDBC 慢慢抽。
3. **接近顶尖数仓的 SQL 性能**——通过缓存、辅助数据结构、数据布局优化，在**不改 Parquet 文件本身**的前提下加速查询。

---

## 三代数据平台演进

| 代际 | 代表 | 存储 | 模式 | 典型问题 |
|------|------|------|------|----------|
| 第一代 | Teradata 等本地数仓 | 专有格式 + 计算存储耦合 | schema-on-write | 扩容贵、非结构化数据难管 |
| 第二代 | S3 湖 + Redshift/Snowflake | 湖用 Parquet；仓用专有格式 | 湖 schema-on-read，仓 schema-on-write | 双 ETL、数据陈旧、ML 难接、存储双份 |
| 第三代 | Lakehouse | 对象存储 + 开放文件 + 元数据层 | 湖上叠加事务与管理 | 需在开放格式上「补」数仓能力（论文论证可行） |

论文 Figure 1 用一张架构图概括：Lakehouse 把 BI、数据科学、机器学习报告都接到**同一套带元数据层的开放数据**上，而不是 today 常见的「湖 → 再 ETL → 仓」两段式。

---

## 为什么两层架构让人头疼

论文归纳当前「湖 + 仓」的四大痛点（很多是**架构意外复杂度**，而非业务本身必然如此）：

### 1. 可靠性（Reliability）

湖和仓可能有不同的 SQL 方言、类型语义、表结构（湖宽表、仓星型模型）。多段 ETL/ELT 增加失败点和 silent bug，数据质量更难保证。

### 2. 数据陈旧（Data staleness）

新数据先进湖，再批量进仓，延迟常以**天**计——比第一代「操作库 → 数仓」即时可查还退步。实时业务（推荐、客服）和人工分析都受影响。

### 3. 高级分析支持弱（Limited ML support）

TensorFlow、PyTorch、XGBoost 等需要扫描大表、跑复杂非 SQL 代码。经 JDBC/ODBC 从数仓拉数据效率低；导出到文件又多一步 ETL。ML 系统读 Parquet 湖数据可以，但湖又缺 ACID、版本、索引。

### 4. 总拥有成本高（TCO & lock-in）

持续 ETL 的人力 + 仓内**再存一份**数据的双倍存储 + 专有格式迁移成本。

**草房方案**：干脆不要湖，全放支持存算分离的云数仓——论文认为采纳有限，因为仍难管视频/音频/文本，且 ML 仍无法高效直连。

---

## 核心概念

### 1. 元数据层（Metadata Layer）

对象存储（S3、ADLS、GCS）本身只有「放/取文件」，**跨文件更新一张表不是原子的**。Lakehouse 在文件之上加**事务日志**，记录「哪些 Parquet 文件属于表 version N」。

代表实现：

| 系统 | 起源 | 要点 |
|------|------|------|
| **Delta Lake** | Databricks 2016+ | 事务日志也存 Parquet，可扩到单表数十亿文件；schema enforcement、time travel |
| **Apache Iceberg** | Netflix | 类似设计，支持 Parquet/ORC |
| **Apache Hudi** | Uber | 偏流式 ingest；早期并发写支持较弱 |

关键能力：ACID 事务、time travel、零拷贝克隆（zero-copy clone）、schema 演进与约束、治理（访问控制、审计）。

**无痛迁移**：现有 Parquet 目录只需**加一个 transaction log 指向已有文件**，零拷贝即可变成 Delta 表——论文称这是企业快速采纳的重要原因（Delta 在 Databricks 上三年覆盖约一半计算时长）。

### 2. 在开放格式上做出数仓级 SQL 性能

Lakehouse **放弃**传统 DBMS 那种「引擎与存储格式完全耦合、对外不可见」的数据独立性——Parquet 成为**公开 API** 的一部分。论文提出三类**不改变 Parquet 文件**的优化：

1. **Caching**：在 SSD/RAM 缓存热文件；有事务层可判断缓存是否仍有效；缓存可用转码格式（如部分解压 Parquet）匹配引擎。
2. **Auxiliary data（辅助数据）**：在 transaction log 里维护列 min-max 统计 → **data skipping**；Bloom filter 等索引放在系统可控的辅助文件中（类似 NoDB、raw data indexing 研究线）。
3. **Data layout（数据布局）**：在 Parquet 内做记录聚簇；Delta 支持 **Z-order / Hilbert 曲线** 多维局部性，让典型分析查询少读数据。

典型 workload：**热数据**靠缓存接近闭源数仓；**冷数据**在对象存储上，性能主要取决于**每次查询读多少字节**——布局 + zone map 缩小 I/O。

### 3. 声明式 DataFrame API 连接 ML

ML 库常用 DataFrame 做特征工程。Spark SQL 等把 DataFrame 变换**惰性求值**成查询计划，下推到 Delta Lake 数据源插件——自动用上缓存、跳过、布局优化（论文 Figure 4）。

TensorFlow 的 `tf.data` 等不推送语义的路径仍可直接读 Parquet 文件列表，但优化空间较小。

### 4. TPC-DS 基准（论文 Figure 3）

在 scale factor **30,000**、各 **960 vCPU**、本地 SSD 的可比集群上，**Delta Engine**（Spark 上的 C++ 执行引擎 + 上述优化）与四家主流云数仓对比：

- **查询总耗时**：与 DW1–DW4 相当或更好（图中 Delta on-demand 约 5793s 量级，部分数仓更高）。
- **成本**：Delta on-demand / spot 在论文定价模型下**明显低于**对比数仓（spot 约 $56 vs 数仓 $153–$570 区间）。

冷缓存启动时 Delta Engine 仅慢约 **18%**，说明优化不完全依赖预热。

---

## 代码示例

### 示例 1：把 Parquet 目录升级为 Delta 表（ACID + Schema Enforcement）

下面用 PySpark 演示 Lakehouse 最基础的「元数据层」价值：同一张逻辑表、原子写入、拒绝脏 schema。

```python
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType, LongType

spark = (
    SparkSession.builder
    .appName("lakehouse-demo")
    .config("spark.sql.extensions",
            "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog")
    .getOrCreate()
)

# 假设 s3://company-lake/orders/ 里已有一堆 Parquet 文件
# 零拷贝：只创建 transaction log，不复制数据
spark.sql("""
  CONVERT TO DELTA parquet.`s3://company-lake/orders/`
""")

# 原子追加：要么整批成功，要么读者看不到半写状态
new_rows = spark.createDataFrame(
    [("ord-9001", "CN", 19900)],
    ["order_id", "country", "amount_cents"],
)
new_rows.write.format("delta").mode("append").save(
    "s3://company-lake/orders/"
)

# Schema enforcement：列名/类型不匹配会直接失败，而不是 silently 污染表
bad = spark.createDataFrame([("x",)], ["order_id"])  # 缺 country、amount_cents
try:
    bad.write.format("delta").mode("append").save("s3://company-lake/orders/")
except Exception as e:
    print("rejected by schema enforcement:", e)

# Time travel：读昨天版本做审计或对账
yesterday = spark.read.format("delta").option(
    "versionAsOf", 41
).load("s3://company-lake/orders/")
```

这段代码对应论文 3.2 节：元数据层把「一堆 Parquet 文件」提升为**可事务管理的数据库表**，并内置数据质量门禁。

### 示例 2：同一 Lakehouse 表 — BI 用 SQL，ML 用 DataFrame

Lakehouse 的目标之一是**消除「仓给 BI、湖给 ML」的分裂**。BI 分析师和算法工程师读的是同一份 Delta 表，只是接口不同：

```python
# --- BI 路径：标准 SQL ---
spark.sql("""
  SELECT country,
         COUNT(*) AS orders,
         SUM(amount_cents) / 100.0 AS revenue_usd
  FROM delta.`s3://company-lake/orders/`
  WHERE order_date >= DATE '2026-01-01'
  GROUP BY country
  ORDER BY revenue_usd DESC
""").show()

# --- ML 路径：DataFrame 特征工程（惰性计划可下推过滤/投影）---
from pyspark.sql import functions as F

orders = spark.table("delta.`s3://company-lake/orders/`")
buyers = (
    orders
    .filter(F.col("customer_segment") == "buyer")
    .select("order_date", "zip", "amount_cents")
    .fillna({"amount_cents": 0})
)

# MLlib / 其他 Spark ML 库直接 consume buyers
# 引擎会通过 Delta 数据源插件应用 statistics skipping、Z-order 布局、节点缓存
train = buyers.filter(F.col("order_date") < "2026-06-01")
```

论文 Figure 4 的 Spark MLlib 流程与此一致：`users[users.kind == "buyer"]` 等操作被优化器下推，Delta 客户端决定读哪些分区、是否命中 cache——**ML 数据准备享受与 SQL 相同的 Lakehouse 优化**。

### 示例 3（可选）：Iceberg 的等价 SQL DDL

若团队选 Apache Iceberg 而非 Delta，思想相同——开放 Parquet + 表级事务：

```sql
-- Spark + Iceberg catalog
CREATE TABLE warehouse.orders (
  order_id   STRING,
  country    STRING,
  amount_cents BIGINT
) USING iceberg
PARTITIONED BY (country);

INSERT INTO warehouse.orders VALUES ('ord-1', 'CN', 9900);

-- 时间旅行（Iceberg snapshots）
SELECT * FROM warehouse.orders FOR SYSTEM_TIME AS OF TIMESTAMP '2026-06-01 00:00:00';
```

---

## Lakehouse 系统组件（论文 Figure 2）

```
┌─────────────────────────────────────────────────────────┐
│  SQL API          Declarative DataFrame API             │
├─────────────────────────────────────────────────────────┤
│  Metadata, Caching, and Indexing Layer                  │
│  (Delta Lake / Iceberg / Hudi)                          │
│  · 事务 / 版本 / 治理                                    │
│  · 缓存 · 统计 · Bloom · Z-order 布局                    │
├─────────────────────────────────────────────────────────┤
│  Data files in open format (Parquet / ORC)              │
│  on low-cost object store (S3, ADLS, GCS, HDFS)         │
└─────────────────────────────────────────────────────────┘
```

上层多种引擎（Spark SQL、Presto、Flink、甚至 Snowflake/BigQuery 读 Iceberg）可**并行**读同一存储；GPU 集群跑训练、SQL 集群跑报表，无需再复制一份到专有仓格式。

---

## 与相关系统的关系

| 方向 | 关系 |
|------|------|
| **云原生数仓**（Snowflake、BigQuery） | 存算分离做得好，但多数企业主数据仍在湖；数仓已支持 external Parquet 表，却**无法对湖数据提供与内部表同等的 ACID/索引** |
| **Hive / Presto / Athena** | 直接查湖，但早期缺事务；Hive ACID、Delta/Iceberg 补上了管理特性 |
| **纯 ML 特征仓库**（Feast、DVC） | 很多在重造 DBMS 已有功能；论文认为可直接建在 Lakehouse 事务与版本之上 |
| **HTAP** | 或可经 Lakehouse 事务 API 归档 operational 快照，在一致快照上混合分析 |

---

## 开放问题（论文第 4 节摘要）

- 事务日志放 S3（低延迟限制 TPS）vs 独立元数据存储的权衡。
- 单表事务 → **跨表事务**扩展。
- 是否设计**下一代开放列存格式**（比 Parquet 更利于布局/索引），同时保持多引擎可读。
- Serverless 查询引擎如何与 rich metadata layer 集成以降低延迟。
- **Data Mesh** 分布式数据产品：Lakehouse 让各团队通过对象存储共享数据集，无需共享同一计算集群。

---

## 读完这篇论文，零基础该记住什么

1. **Lakehouse 不是又一个产品名**，而是一种架构：**开放文件 + 事务元数据 + 计算引擎优化**。
2. 它要解决的不是「SQL 快不快」 alone，而是 **ETL 复杂度、数据陈旧、ML 接不上、厂商锁定** 一整套企业数据痛点。
3. **Delta Lake / Iceberg / Hudi** 是 2021 年前后工业界落地元数据层的三条主路线；今天选哪一个常是组织与生态问题，原理相通。
4. 性能路径是：**热数据缓存 + 冷数据少读字节**；不是把 Parquet 换成黑盒专有格式。
5. 若你所在团队仍是「湖进 raw、仓进 curated、ML 再导第三份」，这篇论文给出了清晰的收敛方向——**一份 curated 数据，多种引擎读**。

---

## 延伸阅读

- Delta Lake 系统论文：*Delta Lake: High-Performance ACID Table Storage over Cloud Object Stores*（VLDB 2020）
- 三格式对比：*Analyzing and Comparing Lakehouse Storage Systems*（CIDR 2023）
- 本仓库：[[starrocks]]（Lakehouse 直读）、[[databend]]（Iceberg 外部表）

---

## 参考

- Armbrust, M., Ghodsi, A., Xin, R., & Zaharia, M. (2021). *Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics.* CIDR 2021.
- https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf
