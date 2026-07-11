---
title: Debezium — 把数据库的"刚刚改了"变成消息流
来源: https://debezium.io/documentation/
日期: 2026-05-31
分类: 数据基建 / CDC
难度: 中级
---

## 是什么

Debezium 是一个**变更数据捕获**（CDC，Change Data Capture）平台，2016 年由 Red Hat 开源。它做一件事：**盯住数据库的变更日志，把每条 INSERT / UPDATE / DELETE 变成一条消息发到 Kafka**（或 Pulsar / Kinesis / Pub-Sub）。

日常类比：**像在数据库门口装了一台监控摄像头**。原来想知道"alice 这条记录刚刚改了什么"，得每几秒查一次（轮询），慢且耗性能。Debezium 不查表，它**直接读数据库自己写的事务日志**——MySQL 的 binlog、PostgreSQL 的 WAL、MongoDB 的 oplog——这些日志数据库为了崩溃恢复本来就要写，Debezium 顺路读一份。

最简单的链路：

```
PostgreSQL ── WAL ──> Debezium Connector ──> Kafka topic ──> 下游消费者
```

下游消费者拿到的每条消息长这样：

```json
{ "before": null, "after": { "id": 42, "name": "alice" }, "op": "c" }
{ "before": { "name": "alice" }, "after": { "name": "bob" }, "op": "u" }
```

`op` 字段告诉你是 `c`reate / `u`pdate / `d`elete / `r`ead（快照）。

## 为什么重要

不理解 CDC 这层抽象，下面这些事都做不出来：

- 数据库 → 数据湖 / 数据仓库 的**实时同步**（Snowflake / BigQuery / Iceberg）——批量 ETL 延迟动辄几小时，CDC 是秒级
- **Outbox pattern** 消除双写问题（事务里写 DB 同时发消息，两个动作怎么保证一致？）
- 缓存失效（DB 改了立刻刷 Redis，不用业务代码到处加 invalidate）
- 微服务事件驱动（订单状态变化 → 库存 / 物流 / 通知 多个下游订阅）
- 2024 年后**向 AI 特征仓库 / 向量库实时灌数据**——这是 RAG 系统保持新鲜度的标配

## 核心要点

Debezium 的工作模型可以拆成 **三层**：

1. **数据库的事务日志**：MySQL 的 binlog（必须是 ROW 格式）、PostgreSQL 的 WAL + logical replication slot、MongoDB 的 oplog。这些是数据库为了**崩溃恢复 + 主从复制**本来就要写的，Debezium 蹭车读一份。

2. **Connector**：Debezium 给每种数据库写了一个 connector，跑在 **Kafka Connect** worker 里（也可以独立跑 Debezium Server）。connector 负责：连数据库 → 申请逻辑订阅位点 → 解码日志 → 拼成结构化消息 → 发到 Kafka。

3. **位点管理**：connector 必须记住"我读到 LSN xxxx 了"，挂了重启从那继续，不能漏也不能重——默认是 **at-least-once**（可能重复，下游必须幂等）。

简单说：**事务日志是数据库的录音笔，connector 是翻译官，Kafka 是公告板**。

## 实践案例

### 案例 1：监听 PostgreSQL 的变更

PostgreSQL 用**逻辑复制槽**（logical replication slot）让外部消费者按需读 WAL：

```sql
-- 数据库管理员先开这两个参数
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_replication_slots = 10;
```

然后丢一个 connector 配置给 Kafka Connect REST API：

```json
{
  "name": "pg-orders",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "pg.internal",
    "database.dbname": "shop",
    "table.include.list": "public.orders",
    "plugin.name": "pgoutput",
    "slot.name": "debezium_orders"
  }
}
```

Debezium 自动创建 slot 名为 `debezium_orders`，从此 PG 把所有 `orders` 表的变更通过这个 slot 推给 connector。

### 案例 2：Outbox pattern 消除双写

业务代码原来要写两步（不安全）：

```python
db.insert(order)        # 步骤 1
kafka.publish(event)    # 步骤 2 — 如果这步挂了就丢消息
```

改成：在**同一个事务里**插一条 `outbox` 表记录，Debezium 监听这张表，把记录翻成 Kafka 消息：

```python
with db.transaction():
    db.insert(order)
    db.insert_outbox(event)  # 一个事务，要么都成功要么都失败
# Kafka 消息由 Debezium 异步保证投递
```

这是 Debezium 最经典的工程价值——**用 CDC 把"双写一致性"问题压成"单写一致性"问题**。

### 案例 3：下游怎么处理重复消息

Debezium 默认是 at-least-once：connector 重启、Kafka 重试时，同一条变更可能再来一次。下游最稳的做法是用主键和版本号做幂等写入：

```sql
INSERT INTO search_index (id, name, updated_at)
VALUES (:id, :name, :updated_at)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = EXCLUDED.updated_at
WHERE search_index.updated_at < EXCLUDED.updated_at;
```

**逐部分解释**：

- `ON CONFLICT (id)` 让同一个业务主键只保留一份，不会因为重复消息插两行
- `updated_at` 条件挡住乱序旧消息，避免昨天的更新覆盖今天的数据
- 真正生产里还会用 WAL LSN / binlog position 当版本号，比应用时间戳更可靠

## 踩过的坑

1. **逻辑复制槽是磁盘炸弹**：slot 一旦创建，PostgreSQL 就**保留所有该 slot 还没确认过的 WAL 文件**。如果 connector 挂了没人重启，WAL 越堆越多，几小时就把磁盘塞满，整个数据库写不下去。生产必须监控 `pg_replication_slots` 视图的 `confirmed_flush_lsn` 和实际 LSN 的差距（lag），超阈值就告警。

2. **空闲数据库 slot 也不前进**：DB 没变更 → WAL 不写 → slot 的 LSN 不动 → 万一你又设了 `idle_in_transaction_session_timeout` 之类的参数，会出现奇怪行为。Debezium 提供 `heartbeat.interval.ms` 配置，定期发心跳推进 slot。

3. **初始快照大表跑几小时**：connector 第一次启动会全表扫一遍生成 `r` 类型快照，1 亿行的表跑一夜不奇怪。1.6+ 提供**增量快照**（incremental snapshotting），可以边消费实时变更边补历史。

4. **MySQL binlog 必须 ROW 模式**：默认很多生产 MySQL 是 `STATEMENT` 或 `MIXED`，Debezium 直接拒收——因为 statement 模式只记 SQL 文本，没法知道改了哪几行。改 `binlog_format=ROW` 后还要重启 MySQL 才生效。

5. **schema 变更要小心**：ALTER TABLE 后 Debezium 自己有个 `schema history topic` 记录历次 schema，重启时回放。这个 topic 的清理策略写错（被压实掉）会让 connector 永远启动不起来。

## 适用 vs 不适用场景

**适用**：
- 数据库实时同步到数据仓库 / 数据湖 / 搜索引擎 / 缓存
- Outbox pattern 解决双写一致性
- 全量审计日志（每条变更都进 Kafka，永久归档）
- 微服务间事件驱动（DB 是源真相）
- 实时特征工程 / 向量库灌数据（AI 场景新热点）

**不适用**：
- 数据库不支持 logical replication（老版 PG / MySQL statement 模式）
- 极低延迟要求（< 100ms 端到端）——CDC 链路本身有几百 ms 延迟
- 简单的应用内事件——直接用应用代码发 Kafka 更轻
- 数据量极小（每天几千条变更）——上 Kafka Connect 集群成本不划算

## 历史小故事（可跳过）

- **2016 年**：Red Hat 工程师 Randall Hauch 启动项目，最初只支持 MySQL。
- **2019 年**：Debezium 1.0 GA，PostgreSQL / MongoDB / SQL Server connector 齐全。
- **2022 年**：**Debezium Server** 模式成熟——不依赖 Kafka Connect，直接 sink 到 Pulsar / Kinesis / Pub-Sub，让"轻量 CDC"成为可能。
- **2024-2026 年**：Outbox 编排器内置，向 Iceberg / 向量数据库的 sink 大量出现。

10 年从一个 Red Hat 内部项目变成 CDC 事实标准——Confluent、AWS DMS、Google Datastream 背后或多或少都借鉴了它的设计。

## 学到什么

1. **CDC 比轮询本质优越**——不增加 DB 负担、不漏更新、自带顺序
2. **数据库的事务日志是金矿**——它本来就为崩溃恢复存在，CDC 蹭车不要钱
3. **逻辑复制槽是双刃剑**——给你订阅能力的同时把磁盘风险锁在你头上
4. **at-least-once + 幂等下游** 是流处理工程的默认假设，exactly-once 永远要付额外代价

## 延伸阅读

- 官方文档：[Debezium Documentation](https://debezium.io/documentation/)（先看 "Tutorial" 和 PostgreSQL connector）
- 经典文章：[Debezium Blog — Reliable Microservices Data Exchange With the Outbox Pattern](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/)
- PostgreSQL 文档：[Logical Replication](https://www.postgresql.org/docs/current/logical-replication.html)（理解 slot / publication / subscription 三件套）
- 实战书：[Designing Data-Intensive Applications](https://dataintensive.net/) 第 11 章 Stream Processing
- [[kafka]] —— Debezium 默认输出到 Kafka，Kafka Connect 是 Debezium 的运行时

## 关联

- [[kafka]] —— 默认运行时和默认 sink，Kafka Connect 提供 worker 集群和 offset 管理
- [[postgresql]] —— PostgreSQL logical replication slot 是 Debezium 最常见的数据源之一
- [[redis]] —— CDC 常被用来驱动缓存刷新，避免业务代码到处手写失效逻辑
- [[airflow]] —— 批处理调度和 CDC 实时链路经常在同一个数据平台里协作
- [[duckdb]] —— 小规模分析可以把 CDC 落到文件后用 DuckDB 做本地验证

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
