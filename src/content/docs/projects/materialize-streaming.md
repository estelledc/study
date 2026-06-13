---
title: Materialize — 流式增量更新的实时数据库
来源: https://github.com/MaterializeInc/materialize
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

## 一句话理解

Materialize 像一个"永远自动刷新"的数据库视图——你写好一个查询，它就持续监听底层数据的变化，只把**变动的部分**推送给你，而不是每次从头算一遍。

## 日常类比

想象你在超市收银台排队。传统数据库的做法是：每次有人问你"队伍有多长"，你都从头开始数一遍所有人。Materialize 的做法是：你只需要站在队尾盯着入口，每进来一个人你就加一，每离开一个人你就减一。你永远知道当前队伍的长度，而且几乎不需要额外劳动。

这就是"增量计算"（Incremental Computation）的核心思想。

## 核心概念

### 1. Source（数据源）

Source 是 Materialize 读取外部数据的通道。它可以来自 Kafka 消息队列、PostgreSQL 的复制流、MySQL 的二进制日志、或者一个简单的 Webhook。Source 让 Materialize 能"订阅"数据变化，而不是被动轮询。

### 2. View / Materialized View（视图 / 物化视图）

- **View** 是一个逻辑查询定义，不会存储结果。
- **Materialized View** 会把查询结果实际存下来，并且当底层数据变化时**自动增量更新**。关键字是 `MATERIALIZED`——告诉 Materialize："别每次都重算，帮我维护好这份结果。"

### 3. Index（索引）

索引让物化视图的查询保持快速。创建索引后，Materialize 会在内存中维护一个加速结构，支持点查和范围扫描。

### 4. Subscribe（订阅）

`SUBSCRIBE` 是 Materialize 的"推模式"。和普通 `SELECT` 不同，它会阻塞并持续返回新产生的变更事件，适合构建实时下游系统。

### 5. Cluster（集群）

Cluster 定义了计算资源的分配方式。你可以把不同的视图分配到不同的集群上，实现资源隔离和水平扩展。

## 与传统方案的对比

| 维度 | 传统数据库 + ETL | Materialize |
|------|-----------------|-------------|
| 数据更新方式 | 定时批量搬运，有延迟 | 实时增量更新，毫秒级 |
| 查询性能 | 数据量大时越来越慢 | 结果预计算，查询即查即得 |
| 复杂度 | 需要维护 Kafka + Spark + 数据库等多套系统 | 一个 SQL 接口搞定 |
| 一致性 | 最终一致性 | 强一致性 |

## 代码示例

### 示例一：从 Kafka 消费数据并建立实时聚合视图

假设有一个电商订单系统，订单数据持续流入 Kafka topic `orders`：

```sql
-- 第一步：创建 Kafka 数据源，实时消费订单消息
CREATE SOURCE order_stream
FROM KAFKA CONNECTION kafka_conn (TOPIC 'orders')
FORMAT AVRO USING CONFLUENT SCHEMA REGISTRY connection csr_conn
DESCRIBE order_schema;

-- 第二步：创建一个物化视图，实时统计每个商品的总销售额
CREATE MATERIALIZED VIEW product_sales AS
SELECT
    product_id,
    product_name,
    COUNT(*) AS total_orders,
    SUM(price) AS total_revenue
FROM order_stream
GROUP BY product_id, product_name;

-- 第三步：随时查询，结果永远是最新的
SELECT * FROM product_sales ORDER BY total_revenue DESC;
```

当新订单进入 Kafka 时，`product_sales` 的结果会自动增量更新。你不需要重新运行聚合，Materialize 内部只更新受影响的行。

### 示例二：JOIN 多表 + 实时告警

把库存表和订单表 JOIN，实时监控缺货风险：

```sql
-- 从 PostgreSQL 实时同步库存表
CREATE SOURCE inventory_changefeed
FROM POSTGRES CONNECTION postgres_conn (PUBLICATION 'inventory_pub')
TABLE ('public'.'inventory');

-- 从另一个 Source 同步订单表
CREATE SOURCE order_changefeed
FROM POSTGRES CONNECTION postgres_conn (PUBLICATION 'order_pub')
TABLE ('public'.'orders');

-- 创建物化视图：关联库存和订单，找出低库存商品
CREATE MATERIALIZED VIEW low_stock_alert AS
SELECT
    i.product_id,
    i.product_name,
    i.stock_quantity,
    COALESCE(o.total_ordered, 0) AS total_ordered,
    i.stock_quantity - COALESCE(o.total_ordered, 0) AS remaining_balance
FROM inventory_changefeed i
LEFT JOIN (
    SELECT
        product_id,
        SUM(quantity) AS total_ordered
    FROM order_changefeed
    GROUP BY product_id
) o ON i.product_id = o.product_id
WHERE i.stock_quantity < 100;

-- 查询告警列表
SELECT * FROM low_stock_alert;
```

`low_stock_alert` 会随着库存变动和订单产生而实时更新。当某个商品库存降到 100 以下时，它会自动出现在结果里——不需要定时任务，不需要 cron。

### 示例三：使用 SUBSCRIBE 实现实时推送

```sql
-- SUBSCRIBE 会持续返回变更事件，不会结束
SUBSCRIBE low_stock_alert;
```

输出类似：

```
product_id | product_name | stock_quantity | total_ordered | remaining_balance | mz_diff
-----------|--------------|----------------|---------------|-------------------|----------
42         | 无线鼠标     | 50             | 30            | 20                | +1
17         | 机械键盘     | 80             | 55            | 25                | +1
42         | 无线鼠标     | 45             | 30            | 15                | -5
```

每一行代表一个变更事件：`+1` 表示新增/增加，`-5` 表示减少 5 个单位。下游系统可以消费这些事件，实时触发告警通知或更新前端页面。

## 典型应用场景

- **运营仪表盘**：替代定时刷新的报表，数据永远最新
- **AI/RAG 管道的实时上下文**：为 AI 应用提供最新的数据索引
- **反欺诈检测**：实时 JOIN 多个数据源，识别异常交易模式
- **数据仓库卸载（Query Offload）**：把复杂查询卸载到 Materialize，保护主数据库

## 为什么值得学

Materialize 把"流处理"这个原本需要掌握 Flink/Spark Streaming 等复杂框架的概念，简化成了几条 SQL 语句。对于已经熟悉 SQL 的人来说，学习曲线非常平缓。它本质上是在告诉你：**不要重新计算，只计算变化的部分。**

这个思想不仅适用于数据库，也适用于很多工程场景——无论是前端状态管理，还是后端缓存策略，"增量更新"都是提升效率的关键思路。

## 参考链接

- 官方文档：https://materialize.com/docs
- GitHub：https://github.com/MaterializeInc/materialize
- 在线试用：https://cloud.materialize.com（免费注册即可体验）
