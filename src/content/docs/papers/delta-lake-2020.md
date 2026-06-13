---
title: Delta Lake: 在云对象存储之上实现高性能 ACID 表存储
来源: https://www.vldb.org/pvldb/vol13/p3411-armbrust.pdf
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# Delta Lake：给云对象存储穿上 ACID 事务外套

## 一、从"共享文件柜"说起：云存储的尴尬

想象一家大型公司，有一面占了整堵墙的文件柜（这就是云对象存储，比如 Amazon S3）。每个员工都可以随时往里放文件、往外取文件。

这个文件柜有两个优点：

1. 容量极大，扩容几乎免费
2. 文件和柜子完全独立——你可以今天存 1PB，明天只开 2 台电脑查它

但问题也随之而来。假设三个员工同时操作：

- A 员工把 100 份文件从"2023年"文件夹移到"2024年"文件夹，结果搬了一半系统崩溃了
- B 员工正好在那一刻去"2024年"找文件，发现只有部分文件到位了
- C 员工查到的结果和 D 员工查到的结果不一样

在传统数据库里，这叫**缺乏 ACID 事务保证**。ACID 是四个英文单词的首字母：

- **A**tomicity（原子性）：要么全做完，要么全不做
- **C**onsistency（一致性）：操作前后数据都处于合法状态
- **I**solation（隔离性）：多人同时操作不会互相干扰
- **D**urability（持久性）：提交后就永久保存，不会丢

云对象存储（S3、Azure Blob 等）本身**不是数据库**，它只管存二进制文件，不管这些文件组成了一张什么表。Delta Lake 的诞生，就是给这面文件柜加一套"事务管理规则"。

> 一句话总结：Delta Lake = Parquet 文件 + 一个事务日志（transaction log），让云对象存储拥有了数据库级别的管理能力。

## 二、核心概念

### 2.1 两种核心组件

Delta Lake 的每张表由两部分组成：

```
s3://my-bucket/my-table/
├── _delta_log/          ← 事务日志目录
│   ├── 00000000.json    ← 版本 0 的日志
│   ├── 00000001.json    ← 版本 1 的日志
│   ├── 00000002.json    ← 版本 2 的日志
│   ├── 00000000.checkpoint.parquet  ← 检查点（加速读取）
│   └── _last_checkpoint ← 最新检查点 ID
├── date=2024-01-01/     ← 按日期分区的数据
│   └── abc-123.parquet
├── date=2024-01-02/
│   └── def-456.parquet
└── date=2024-01-03/
    └── ghi-789.parquet
```

- **数据文件（Data Objects）**：实际数据以 Parquet 格式存储。Parquet 是一种列式存储格式，适合分析查询。
- **事务日志（Transaction Log）**：记录每次变更（添加文件、删除文件、修改元数据），以 JSON 格式存放，ID 按顺序递增。

### 2.2 事务日志长什么样

每个 `.json` 文件记录了一次变更，包含以下操作类型：

- `add`：往表里新增一个 Parquet 文件，附带统计信息（行数、每列的最大/最小值、空值计数）
- `remove`：标记某个文件已移除（物理删除延迟执行）
- `metaData`：修改表的元数据，比如 schema 变更
- `txn`：支持精确一次（exactly-once）的流写入

举个例子，版本 3 的日志 `00000003.json` 可能长这样：

```json
{
  "add": {
    "path": "date=2024-01-03/ghi-789.parquet",
    "size": 1048576,
    "modificationTime": 1704067200000,
    "stats": "{\"numRecords\":100000,\"minValues\":{\"amount\":0.5},\"maxValues\":{\"amount\":9999.9}}"
  }
}
```

### 2.3 乐观并发控制

Delta Lake 用**乐观并发控制**（Optimistic Concurrency Control）解决多写者冲突：

- 每个写者拿到下一个可用的日志 ID，尝试以原子操作写入 `XXXX.json`
- 如果写入时发现这个 ID 已被别人占用（即"版本冲突"），就回退重试
- 这个过程不需要专门的元数据服务器——全部依赖对象存储的原语（put-if-absent 或条件写入）

这意味着**零额外服务成本**：不用部署专门的元数据服务，不用维护额外的数据库。

### 2.4 检查点（Checkpoint）

随着版本增多，从头重放所有 JSON 日志会很慢。Delta Lake 定期把日志压缩成一个 Parquet 检查点文件，读取时先跳到最近检查点，再重放后面的少量 JSON 即可。

---

## 三、代码示例

### 示例 1：创建表并写入数据

```python
# 用 PySpark 创建 Delta 表
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName("DeltaLakeDemo") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

# 写入数据并创建 Delta 表（自动变成 ACID 表）
data = [
    ("2024-01-01", "Alice", 5000.0),
    ("2024-01-01", "Bob", 3200.0),
    ("2024-01-02", "Alice", 4800.0),
    ("2024-01-02", "Charlie", 6100.0),
]

df = spark.createDataFrame(data, ["date", "name", "salary"])

df.write.format("delta") \
    .mode("overwrite") \
    .partitionBy("date") \
    .save("/tmp/delta/employees")
```

此时 Delta 的底层结构自动变成：

```
/tmp/delta/employees/
├── _delta_log/
│   ├── 00000000.json    ← 记录了两批文件（1月1日和1月2日）的 add 操作
│   └── 00000001.checkpoint.parquet
├── date=2024-01-01/
│   ├── part-00000-xxx.parquet
│   └── part-00001-xxx.parquet
└── date=2024-01-02/
    ├── part-00000-xxx.parquet
    └── part-00001-xxx.parquet
```

### 示例 2：Upsert（更新已存在 + 插入新记录）

这是传统 Parquet 做不到的。传统方式只能"追加文件"，不能修改已有数据。Delta 用 MERGE 一条命令搞定：

```python
# 假设收到了新的工资数据，需要更新 Alice 和 Bob 的工资
new_data = [
    ("2024-01-01", "Alice", 5500.0),  # Alice 加薪了
    ("2024-01-01", "David", 4100.0),  # 新同事 David
]

new_df = spark.createDataFrame(new_data, ["date", "name", "salary"])

# MERGE：如果 name + date 匹配就更新（UPDATE），不匹配就插入（INSERT）
new_df.write.format("delta") \
    .mode("append") \
    .option("mergeSchema", "true") \
    .saveAsTable("employees")

# 执行 MERGE 操作
spark.sql("""
    MERGE INTO employees
    USING new_data
    ON employees.name = new_data.name AND employees.date = new_data.date
    WHEN MATCHED THEN
        UPDATE SET salary = new_data.salary
    WHEN NOT MATCHED THEN
        INSERT *
""")
```

执行后，Delta 日志会追加一条记录，里面包含：
- `remove` 旧版 Parquet 文件（Alice 原工资记录）
- `add` 新版 Parquet 文件（Alice 新工资记录 + David 的新记录）

对读者来说，这是一次**原子切换**——要么看到旧数据全貌，要么看到新数据全貌，永远不会看到"半更新"的中间状态。

### 示例 3：时间旅行（Time Travel）

因为每个版本都完整保存在日志中，你可以"穿越"回过去任意一个版本：

```python
# 查询 3 天前的数据快照
spark.sql("SELECT * FROM employees VERSION AS OF 2024-01-01")

# 或者用版本号
spark.sql("SELECT * FROM employees VERSION AS OF 3")

# 查询某个路径的历史版本
spark.sql("""
    SELECT * FROM "/tmp/delta/employees"
    TIMESTAMP AS OF '2024-01-01 00:00:00'
""")
```

---

## 四、论文讲的核心创新点

| 问题 | 传统方式 | Delta Lake |
|------|---------|-----------|
| 多文件原子更新 | 做不到，部分成功就会留下脏数据 | 事务日志保证原子性 |
| 查询大分区数 | S3 LIST 操作慢，百万分区要几十分钟 | 日志里的统计信息直接过滤 |
| 更新/删除数据 | 需要重写整个表 | MERGE 只改受影响的文件 |
| 审计追踪 | 没有 | 日志天然记录每次变更 |
| 流写入+批量读取 | 需要额外消息队列（Kafka） | Delta 表本身即可充当消息总线 |
| 数据优化 | 手动重组文件 | OPTIMIZE 命令自动重组 |

论文通过实验证明了几组关键数据：

- **百万分区查询**：传统 Hive 在 1 万分区时查询超过 1 小时；Delta Lake 在 100 万分区时只需 108 秒，SSD 缓存下仅 17 秒
- **Z-Order 排序**：通过 Z-Order 多维排序，Parquet 文件跳过率从 0-47% 提升到 67-99%
- **TPC-DS 性能**：Delta 格式在 Databricks 运行比第三方云厂商的 Spark/Presto 快 1.44-3.76 倍
- **写入性能**：Delta 写入时间与直接写 Parquet 基本持平

---

## 五、设计取舍

论文也坦诚了几个限制：

1. **事务仅限单表**：目前不能跨表做原子事务，因为每张表有独立日志。扩展到多表需要跨表协调。
2. **写事务速率受限**：依赖对象存储的 put-if-absent 操作，延迟几十到几百毫秒，每秒几个到几十个事务。对大多数 ETL/流处理够用，但不适合高并发 OLTP。
3. **不支持二级索引**：除了文件级别的 min/max 统计信息，目前没有传统数据库那种 B+ 树索引。论文提到正在原型实现 Bloom Filter 索引。
4. **流延迟在秒级**：受对象存储读写延迟限制，很难做到毫秒级流处理。但对批流一体的分析场景足够。

---

## 六、"湖仓一体"（Lakehouse）的概念

论文提出了一个影响深远的新概念——**Lakehouse**。

传统架构是"双轨制"：
- **数据湖**（原始 Parquet 文件）：便宜但缺乏管理能力
- **数据仓库**（Snowflake / BigQuery）：功能强大但成本高、数据要搬迁

Lakehouse 用 Delta Lake 把两者统一：
- 数据留在便宜的云对象存储（湖的优势）
- 通过事务日志获得数据仓库级别的管理能力（仓的优势）

这就是为什么论文标题里的 "ACID table storage over cloud object stores" 不仅仅是一个技术细节，而是**用最低成本把云存储变成了数据库**。

---

## 七、关键术语速查

| 术语 | 含义 |
|------|------|
| ACID | 原子性、一致性、隔离性、持久性——数据库事务的四大保证 |
| Parquet | 列式存储格式，适合分析查询，压缩率高 |
| 事务日志 | 记录表每次变更的 JSON 文件序列 |
| 检查点 | 把日志压缩成 Parquet 文件，加速读取 |
| 乐观并发控制 | 先执行，冲突了再重试的并发策略 |
| Put-if-absent | 对象存储的原子写入：文件不存在时才写入 |
| Z-Order | 一种多维数据排序方法，提升查询过滤效率 |
| Lakehouse | 数据湖 + 数据仓库的统一架构 |
| CDC（Change Data Capture） | 捕获数据变更流，Delta 支持通过 MERGE 做 CDC |
| 时间旅行 | 查询表在过去任意时间点的状态 |

---

## 八、学习思考

论文最让我有启发的设计哲学是：**元数据也存到对象存储里**。

大多数数据库会把元数据放在专门的元数据服务（比如 Hive Metastore）里。Delta Lake 反其道而行——事务日志本身就是一份"元数据文件"，和其他 Parquet 数据文件一起存在 S3 里。

这个决定的好处是：
- 不需要维护任何额外的服务
- 存储和计算彻底解耦——计算节点挂了重启后，从对象存储读取日志就能恢复
- 任何能读 Parquet 的引擎都能直接读 Delta 表

代价是：元数据操作（如 LIST）的延迟较高，论文通过**检查点压缩**和**SSD 缓存**两个方案缓解。

这就是"用简单设计换取运维成本"的典型范式。当你的数据规模到了 PB 级，少维护一个系统的价值，可能远超几秒的查询延迟差异。
