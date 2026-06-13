---
title: GreptimeDB — 云原生时序数据库
来源: https://github.com/GreptimeTeam/greptimedb
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

# GreptimeDB — 云原生时序数据库

## 什么是 GreptimeDB？

先想一个日常场景：你开了一家连锁咖啡店，有 50 家店，每秒钟都在产生数据 —— 每杯咖啡的交易记录、每台咖啡机的温度传感器读数、每个顾客的排队等待时间。

过去，你要用三个不同的"仓库"来管这些数据：
- 一个仓库管「交易数字」（类似 Prometheus 管指标）
- 一个仓库管「文字记录」，比如顾客投诉（类似 Loki 管日志）
- 一个仓库管「流程追踪」，比如一个订单从下单到完成的每一步（类似 Jaeger/Elasticsearch 管链路追踪）

这三个仓库各用各的语言、各管各的事。如果你想搞清楚"为什么某家店在某个时间段的投诉突然变多了"，你就得在三个仓库之间来回翻找，非常麻烦。

GreptimeDB 的思路是：**一个数据库，同时管这三类数据。** 用同一套 SQL 就能跨指标、日志、链路做关联分析。

> GreptimeDB 是一个用 Rust 编写的开源云原生时序数据库，专注于可观测性（Metrics + Logs + Traces）场景。它由字节跳动开源，支持 Kubernetes 原生部署和对象存储。

---

## 核心概念

### 1. 时间索引（Time Index）

每个时序数据库最核心的东西就是"时间"。GreptimeDB 里，每行数据都有一个 `TIMESTAMP` 类型的列，叫 **TIME INDEX**。所有数据按时间排序存储，查询时也首先用时间来过滤。

### 2. 标签（Tag）vs 字段（Field）

GreptimeDB 的数据模型把列分为两类：

| 类型 | 作用 | 类比 |
|------|------|------|
| **Tag** | 标识"哪一条时序"，相当于分类标签 | 咖啡店的"店名"、"城市" |
| **Field** | 实际记录的数据值 | 咖啡机的"温度"、"压力" |

Tag 列用于分组和过滤，Field 列存储实际测量值。这种区分让数据库能高效压缩和索引数据。

### 3. 统一数据模型

GreptimeDB 把指标、日志、链路看作同一模型的三种投影：

- **指标（Metrics）**：带有 Tag + Timestamp + Field 的结构化数值
- **日志（Logs）**：没有 Tag，只有 Timestamp + Field 的文本/结构体
- **链路（Traces）**：带有 Tag（服务名）+ Timestamp + Field（耗时等）的追踪记录

它们共享同样的底层存储格式，所以可以跨信号类型做 JOIN 查询。

### 4. 计算存储分离（Compute-Storage Separation）

GreptimeDB 把计算节点和存储节点分开：
- **存储**：数据持久化到对象存储（如 AWS S3），成本低、无限扩展
- **计算**：查询引擎无状态，可以根据负载弹性伸缩
- **本地磁盘**：只用作缓存层，不是必需

这意味着你可以随时增加计算节点来加速查询，而不必担心数据迁移。

### 5. 协议兼容

GreptimeDB 不要求你放弃现有工具：
- Prometheus Remote Write —— 直接把 Prometheus 的指标写入
- OpenTelemetry（OTLP）—— 直接接收 Metrics/Logs/Traces
- Loki Protocol —— 直接接收 Loki 的日志
- Elasticsearch 协议 —— 直接写入
- MySQL / PostgreSQL 协议 —— 用标准 SQL/psql 连接
- InfluxDB Line Protocol —— 时序数据库常用格式

---

## 代码示例

### 示例 1：创建表并写入数据

下面创建一张监控表格，模拟记录多台服务器的 CPU 使用率：

```sql
-- 创建指标表：host 和 datacenter 是 Tag（PRIMARY KEY），
-- cpu_usage 是 Field（实际数据），ts 是 TIME INDEX
CREATE TABLE server_metrics (
    host        STRING,
    datacenter  STRING,
    cpu_usage   DOUBLE,
    memory_util DOUBLE,
    ts          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (host, datacenter),
    TIME INDEX (ts)
);

-- 写入多条记录
INSERT INTO server_metrics (host, datacenter, cpu_usage, memory_util)
VALUES
    ('server-1', 'us-east-1',  45.2,  62.1),
    ('server-1', 'us-east-1',  92.7,  78.4),
    ('server-2', 'us-east-1',  12.3,  45.6),
    ('server-2', 'us-east-1',  15.1,  46.2),
    ('server-3', 'eu-west-1',  88.9,  91.3);

-- 查询：找出 us-east-1 机房中 CPU 使用率超过 50% 的记录
SELECT host, ts, cpu_usage
FROM server_metrics
WHERE datacenter = 'us-east-1'
  AND cpu_usage > 50.0;
```

结果会返回 server-1 和 server-3 的高 CPU 记录。

**这里的关键点是：**
- `PRIMARY KEY (host, datacenter)` 定义了 Tag 列 —— 相同 host + datacenter 的行属于同一条时序
- `TIME INDEX (ts)` 告诉数据库按时间排序，这是查询性能的关键
- `INSERT` 之后，GreptimeDB 会自动按 `(host, datacenter, ts)` 排序存储

### 示例 2：关联分析 —— 同时看指标、日志和链路

这是 GreptimeDB 最强大的能力。假设我们遇到一个问题：某台服务器的延迟突然飙升。我们需要同时看三个方面：

```sql
-- 第一步：创建三张表分别存指标、日志、链路
CREATE TABLE grpc_latencies (
    ts          TIMESTAMP TIME INDEX,
    host        STRING,
    latency     DOUBLE,
    PRIMARY KEY (host)
);

CREATE TABLE app_logs (
    ts          TIMESTAMP TIME INDEX,
    host        STRING,
    error_msg   STRING FULLTEXT INDEX,
    PRIMARY KEY (host)
) WITH ('append_mode' = 'true');

CREATE TABLE traces (
    ts            TIMESTAMP TIME INDEX,
    trace_id      STRING SKIPPING INDEX,
    service_name  STRING,
    duration      DOUBLE,
    PRIMARY KEY (service_name)
) WITH ('append_mode' = 'true');

-- 插入模拟数据（略，假设三张表都已经有数据了）

-- 第二步：一个 SQL 查询，关联三类数据
WITH
  -- 每个时间窗口内的 p95 延迟（指标）
  metrics AS (
    SELECT
      host,
      ROUND(AVG(latency), 2) AS avg_latency
    FROM grpc_latencies
    WHERE ts >= '2024-07-11 20:00:00'
    GROUP BY host
  ),
  -- 每个时间窗口内的错误日志数量
  logs AS (
    SELECT
      host,
      COUNT(*) AS error_count
    FROM app_logs
    WHERE ts >= '2024-07-11 20:00:00'
    GROUP BY host
  )
-- 第三步：JOIN 关联，一张表回答所有问题
SELECT
  m.host,
  m.avg_latency,
  COALESCE(l.error_count, 0) AS error_count
FROM metrics m
LEFT JOIN logs l ON m.host = l.host
ORDER BY m.avg_latency DESC;
```

**这段 SQL 在做什么？**
1. `WITH` 子句分别计算每个信号的数据（指标用 AVG、日志用 COUNT）
2. `LEFT JOIN` 把它们拼在一起
3. 一条查询就能看出"延迟高 = 错误多"的相关性

在传统三件套（Prometheus + Loki + Jaeger）中，这需要三个系统各查一次，然后人工比对时间戳。

### 示例 3：窗口聚合（Range Query）

时序数据最常见的分析是"按时间窗口聚合"。GreptimeDB 提供了简洁的 RANGE 语法：

```sql
-- 每 5 秒一个窗口，计算每个窗口的平均延迟
SELECT
  ts,
  host,
  AVG(latency) RANGE '5s' AS avg_latency
FROM grpc_latencies
ALIGN '5s' FILL PREV
WHERE ts >= '2024-07-11 20:00:00'
  AND ts < '2024-07-11 20:01:00';
```

这里：
- `RANGE '5s'` 表示每 5 秒聚合一次
- `ALIGN '5s'` 对齐到 5 秒的整数倍
- `FILL PREV` 如果一个窗口没有数据，就填充前一个窗口的值

---

## 与其他数据库的对比

| 能力 | GreptimeDB | Prometheus | InfluxDB | TimescaleDB |
|------|-----------|------------|----------|-------------|
| 指标 | ✅ | ✅ | ✅ | ✅ |
| 日志 | ✅ | ❌ | ❌ | ❌ |
| 链路追踪 | ✅ | ❌ | ❌ | ❌ |
| 查询语言 | SQL + PromQL | PromQL | Flux/SQL | SQL |
| 对象存储 | ✅ | 需 Thanos | 有限 | ❌ |
| 云原生 | 原生 | 需额外组件 | 有限 | 有限 |
| 语言 | Rust | Go | Go | C/PostgreSQL |

---

## 典型使用场景

1. **IT 可观测性**：替代 Prometheus + Loki + Jaeger 三件套，统一管理指标、日志、链路
2. **IoT 物联网**：传感器数据的高频写入和高效压缩，配合对象存储降低海量数据成本
3. **金融审计日志**：利用 SQL 能力做合规查询和分析
4. **游戏服务器监控**：玩家行为、服务器性能、日志关联分析

---

## 学习资源

- 官方文档：https://docs.greptime.com
- GitHub：https://github.com/GreptimeTeam/greptimedb
- 快速入门指南：https://docs.greptime.com/getting-started/quick-start
- 数据模型文档：https://docs.greptime.com/user-guide/concepts/data-model/

---

## 小结

GreptimeDB 的核心价值可以用一句话概括：**一个数据库，三类信号，一条 SQL。**

对于零基础学习者，最关键的理解是：
1. 时序数据库以"时间"为中心组织数据
2. Tag 是分类标签，Field 是实际测量值
3. 过去三套系统做的事，现在一套系统能搞定
4. SQL 是通用的查询和管理语言
