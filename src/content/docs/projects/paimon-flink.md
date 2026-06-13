---
title: "Apache Paimon 零基础入门"
来源: https://github.com/apache/paimon
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# Apache Paimon 零基础入门

## 一、日常类比：一个"能自动整理"的快递柜

想象你在运营一个大型快递柜系统。

每天有成千上万个包裹进出：有人寄出旧书，有人收到新鞋。传统数据库像是一个普通柜子——东西放进去就固定在那里了，要修改得整个搬出来再塞回去。

Apache Paimon 像一个**智能快递柜**：

- 包裹来了，它自动按区域归类（分区 Partition）
- 有人修改了包裹信息（比如改了地址），它只记录变化，不搬动整个柜子（增量更新 Incremental Update）
- 你可以随时"回滚"到昨天的状态（时间旅行 Time Travel）
- 快递柜本身可以无限扩容，不需要停机（可伸缩 Scalable）

这就是 Paimon 的核心价值：**为流式数据设计的现代数据湖存储引擎**。

## 二、什么是 Apache Paimon？

Paimon（发音 /paɪˈmoʊn/，源自"派蒙"）是 Apache 顶级项目，前身是 Apache CouchBase 社区贡献的 **Columbus** 和 **Flink CDC** 团队开发的 **Lakehouse Storage Engine**。

简单说：

| 对比维度 | 传统数据仓库 | Apache Paimon |
|---------|-------------|---------------|
| 数据来源 | 批量导入（T+1） | 实时流 + 批量混合 |
| 数据更新 | 困难，需全量替换 | 原生支持行级更新 |
| 查询延迟 | 分钟到小时级 | 秒级近实时 |
| 存储成本 | 较高 | 低（对象存储友好） |

**一句话定位**：Paimon 是连接"实时数据流"和"数据分析"之间的桥梁。

## 三、核心概念

### 1. Table（表）

Paimon 的表不是传统关系型数据库里的那种"静态表格"。它是一个**有历史版本的、可追加的数据集**。

每条数据都有隐含的时间戳，你可以问"昨天的数据长什么样"。

### 2. Partition（分区）

分区就像文件夹。把数据按某个字段（比如日期、地区）分组存放，查询时只需要扫描相关分区，不用全表扫描。

```sql
-- 创建一个按日期分区的表
CREATE TABLE orders (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10, 2),
    order_time TIMESTAMP(3),
    PRIMARY KEY (order_id) NOT ENFORCED
) PARTITIONED BY (dt);
```

### 3. Primary Key（主键）

Paimon 支持两种表：

- **主键表（Primary Key Table）**：每条记录有唯一 key，支持 UPDATE 和 DELETE。适合用户信息、订单状态这类"会被修改"的数据。
- **非主键表（Non-Primary Key Table）**：只能追加，不能更新。适合日志、事件流这类"来了就不改"的数据。

### 4. Snapshot（快照）

每次写入操作都会生成一个新的 snapshot。每个 snapshot 就是数据在那个时间点的一份"照片"。

你可以：
- 查看任意历史 snapshot 的数据
- 从 snapshot A 恢复到 snapshot B
- 比较两个 snapshot 之间的差异

### 5. File Store（文件存储）

Paimon 底层数据以 Parquet + Avro 格式存储在对象存储（S3/HDFS/GCS）或本地文件系统上。对开发者透明，你不需要关心文件怎么组织。

## 四、代码示例

### 示例 1：用 Flink SQL 创建实时数据管道

场景：电商订单系统，实时接收订单事件，存入 Paimon 表，同时支持查询最新订单状态。

```sql
-- Step 1: 在 Flink SQL Client 中创建 Paimon 表
-- 这是一个主键表，order_id 是唯一键
CREATE TABLE orders (
    order_id BIGINT,
    user_id BIGINT,
    product_name STRING,
    amount DECIMAL(10, 2),
    status STRING,
    order_time TIMESTAMP(3),
    PRIMARY KEY (order_id) NOT ENFORCED
) WITH (
    'connector' = 'paimon',
    'path' = 's3://my-data-lake/orders',
    'merge-engine' = 'partial-update',
    'changelog-producer' = 'input',
    'snapshot.num-retained.max' = '10',
    'snapshot.time-retained' = '7d'
);

-- Step 2: 从 Kafka 读取实时订单流，写入 Paimon
INSERT INTO orders
SELECT
    order_id,
    user_id,
    product_name,
    amount,
    status,
    TO_TIMESTAMP(FROM_UNIXTIME(order_ts, 'yyyy-MM-dd HH:mm:ss')) AS order_time
FROM kafka_orders_source;

-- Step 3: 查询今天的订单（利用分区裁剪）
SELECT * FROM orders
WHERE dt = '2026-06-13';

-- Step 4: 时间旅行 —— 查看昨天这个时候的订单快照
SELECT * FROM orders
FOR SYSTEM_TIME AS OF TIMESTAMP('2026-06-12 10:00:00')
WHERE dt = '2026-06-12';
```

**关键点解析**：

- `'merge-engine': 'partial-update'`：部分更新模式，只更新指定的列，不会覆盖整行
- `'changelog-producer': 'input'`：利用输入流的 changelog（变更日志），避免额外计算
- `'snapshot.num-retained.max'`：最多保留 10 个快照，防止存储膨胀
- `FOR SYSTEM_TIME AS OF`：这是 Paimon 的时间旅行语法，类似 Git 的 checkout

### 示例 2：CDC 实时同步 MySQL 到数据湖

场景：MySQL 里的用户表，通过 Flink CDC 实时同步到 Paimon，供下游 BI 查询。

```sql
-- Step 1: 创建 MySQL CDC 源表（Flink CDC Connector）
CREATE TABLE mysql_users (
    id INT,
    name STRING,
    email STRING,
    city STRING,
    updated_at TIMESTAMP(3),
    PRIMARY KEY (id) NOT ENFORCED
) WITH (
    'connector' = 'mysql-cdc',
    'hostname' = 'localhost',
    'port' = '3306',
    'username' = 'flink',
    'password' = 'secret',
    'server-id' = '5400-5404',
    'database-name' = 'ecommerce',
    'table-name' = 'users'
);

-- Step 2: 创建 Paimon 目标表（按城市分区）
CREATE TABLE paimon_users (
    id INT,
    name STRING,
    email STRING,
    city STRING,
    updated_at TIMESTAMP(3),
    PRIMARY KEY (id) NOT ENFORCED
) PARTITIONED BY (city) WITH (
    'connector' = 'paimon',
    'path' = 's3://my-data-lake/users',
    'merge-engine' = 'first-row',
    'changelog-producer' = 'full-compaction',
    'file.format' = 'parquet',
    'compaction.max-file-num' = '10'
);

-- Step 3: 实时同步
INSERT INTO paimon_users
SELECT id, name, email, city, updated_at
FROM mysql_users;
```

**CDC 流程图解**：

```
MySQL binlog ──► Flink CDC Source ──► Flink Job ──► Paimon Table
  (变更日志)        (解析binlog)         (实时处理)      (数据湖存储)
                                         │
                                         ▼
                                   下游查询引擎
                                 (Presto/Trino/Spark)
```

- `'merge-engine': 'first-row'`：当同一用户有多条变更时，保留最新的一条
- `'changelog-producer': 'full-compaction'`：通过合并小文件产生 changelog，适合没有上游 changelog 的场景
- 下游可以用 Presto/Trino/Spark 直接查询 Paimon 表，无需数据迁移

## 五、为什么选择 Paimon？

### 优势

1. **真正的流式存储**：不是批处理加个"实时"标签，而是从架构层面为流式设计
2. **低延迟高吞吐**：写入延迟秒级，吞吐可达每秒百万级记录
3. **与 Flink 深度集成**：原生支持 Flink SQL，开箱即用
4. **多计算引擎兼容**：除了 Flink，还支持 Spark、Presto/Trino、Doris 等查询
5. **存算分离**：数据存在对象存储，计算资源可以独立伸缩，成本更低

### 适用场景

- 实时数据湖（Real-time Data Lake）
- CDC 数据同步（MySQL → 数据湖）
- 用户画像 / 实时推荐特征存储
- 数据仓库的实时层（Real-time DWD/DWS）

### 不适用场景

- 强事务要求的 OLTP 业务数据库（请用 MySQL/PostgreSQL）
- 需要复杂 JOIN 的高频交互式查询（请用 ClickHouse/Doris）
- 纯离线批处理且无实时需求（传统 Hive 可能更简单）

## 六、学习路线建议

1. **先理解 Flink SQL**：Paimon 主要通过 Flink SQL 使用，先掌握 CREATE TABLE、INSERT SELECT、时间窗口等基础语法
2. **本地搭建测试环境**：用 Docker 跑 Flink + Paimon + MiniIO（模拟 S3），写几个 INSERT 试试
3. **实践 CDC 同步**：搭一个 MySQL 实例，用 Flink CDC 同步到 Paimon，观察 snapshot 的变化
4. **阅读源码**：Paimon 代码结构清晰，从 `org.apache.paimon.table` 包开始看

## 七、延伸阅读

- GitHub: https://github.com/apache/paimon
- 官方文档: https://paimon.apache.org/docs/
- Flink CDC 集成指南: https://nightlies.apache.org/flink/flink-cdc-docs/stable/topics/connector-mysql-cdc
