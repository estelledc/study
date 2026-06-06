---
title: TimescaleDB — PostgreSQL 时序扩展
来源: https://github.com/timescale/timescaledb
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

TimescaleDB 是 [[postgresql]] 的一个**扩展**（extension），把"按时间分区 + 列存压缩 + 时序专用函数"加进去，让你**继续用 SQL** 写时序应用。

日常类比：

- [[influxdb]] 是去外面**专门买了个时钟**——独立的时序数据库，自己的查询语言、自己的工具链
- TimescaleDB 是**给 PostgreSQL 加个时钟功能**——同一个库、同一个 SQL、同一套备份和监控，多了时序能力

落到代码上就一行：

```sql
CREATE EXTENSION timescaledb;
```

之后你的 PostgreSQL 多了 `create_hypertable`、`time_bucket`、连续聚合视图等一堆时序工具，业务表照常用，新增的指标表用时序模式存。

## 为什么重要

时序数据（IoT 传感器、APM 指标、金融行情、运维监控）有个共性：**写入量远大于读取量、按时间窗口查、旧数据冷**。传统关系数据库写得动但读得慢，专用时序库读得快但和业务库分家。TimescaleDB 想两头都占：

- **不用学新数据库**：SQL 全沿用、psql / pgAdmin / 备份方案 / ORM 全沿用，团队学习成本几乎为零
- **Hypertable 自动按时间分区**：一张逻辑表底下自动切成几十几百个 chunk（每个 chunk 是一张真实的 PostgreSQL 表），写入按时间路由，查询按时间剪枝，无感分片
- **列存压缩 90%+**：旧 chunk 转成 columnar 格式后，存储能压到原来的 5%-10%，磁盘账单立刻降一个数量级
- **关系数据自由 join**：订单表、用户表、传感器读数表都在同一个 PG 实例里，"过去 24 小时温度异常的设备 join 它的所属客户" 一条 SQL 就够了——专用时序库做不到

一句话：你已经在用 PostgreSQL 了，加这个扩展能少养一套服务。

## 核心要点

**1. Hypertable（超表）**

逻辑上是一张大表，物理上自动切成多个 chunk。每个 chunk 覆盖一段时间范围（默认 1 周），是一张真实的 PostgreSQL 子表。查询时 planner 根据 `WHERE time > ...` 自动只扫相关 chunk，老 chunk 不读。

**2. Continuous Aggregates（连续聚合视图）**

类比：物化视图（materialized view）的"增量更新版"。普通物化视图刷新一次要重算全表，连续聚合视图只算新数据，按 policy 自动 refresh。常用来预聚合"每分钟/每小时平均值"，查询时直接读视图，比每次扫原始数据快几十倍。

**3. 列存压缩（compression）**

新写入的 chunk 是行存（PostgreSQL 默认），按 policy 老化后转成列存格式：相邻行的同一列连续存放、用编码压缩。代价是改写慢（不适合频繁更新），收益是磁盘省 90%+ 且按列查询更快。

## 实践案例

### 案例 1：在已有 PostgreSQL 上启用

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';
```

不需要新装数据库、不需要数据迁移，已有业务表保持不动。

### 案例 2：建一张时序表

```sql
CREATE TABLE metrics (
  time      TIMESTAMPTZ NOT NULL,
  device_id INT,
  value     DOUBLE PRECISION
);

SELECT create_hypertable('metrics', 'time',
  chunk_time_interval => INTERVAL '1 day');

CREATE INDEX ON metrics (device_id, time DESC);
```

第二行是关键：`metrics` 从普通表变成 hypertable，按 `time` 字段每天切一个 chunk。

### 案例 3：连续聚合视图

```sql
CREATE MATERIALIZED VIEW hourly_avg
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket,
       device_id,
       AVG(value) AS avg_value
FROM metrics
GROUP BY bucket, device_id;

SELECT add_continuous_aggregate_policy('hourly_avg',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes');
```

后台每 30 分钟跑一次，把 `[3 小时前, 1 小时前]` 这段时间的新数据增量算进视图。仪表盘查"过去 7 天每小时平均值"直接查 `hourly_avg`，扫几百行而不是几亿行。

## 踩过的坑

1. **chunk_time_interval 默认 1 周对高频场景不合适**——IoT 每秒上千点的话，1 周一个 chunk 会变成几百 GB 的大块，压缩和查询都吃力。改成 1 天甚至 1 小时更顺。一旦建好不易改，开始就要算清。

2. **索引选错读不动**——只对 `time` 建索引，按设备查会全 chunk 扫；只对 `device_id` 建则失去时间剪枝优势。规则：`(device_id, time DESC)` 组合索引，时间倒序，按设备查也快、按时间剪也快。

3. **连续聚合 refresh policy 滞后**——policy 默认每 30 分钟刷一次、`end_offset` 留 1 小时缓冲，意思是查询永远拿不到"最近 1 小时"的聚合数据。要看实时面板就得直接查原始表 + UNION 视图。

4. **许可证有两层**：核心是 Apache 2.0（开源），但 Multinode、连续聚合的部分高级特性、热备等是 TSL（Timescale License）——可以免费用但禁止做"作为服务转售"。自建没事，做 SaaS 平台前要看清条款。

## 适用 vs 不适用场景

**适用**：

- IoT / APM / 监控 / 金融行情等"按时间写、按时间查"的场景
- 已经在用 PostgreSQL，不想再养一套时序库
- 时序 + 关系数据要 join（设备 + 客户、指标 + 订单）
- 单机或小规模（GB 到 TB 级）——TimescaleDB v2 之后官方推荐单机 + 大盘

**不适用**：

- 超大规模分布式时序（PB 级）——v2.14 之后官方移除了 Multinode 模式，要这种规模建议看 [[clickhouse]] / 专业时序库
- 高频 UPDATE 场景——压缩后 chunk 改写代价高
- 不需要 SQL、只要简单 KV 写入——[[redis]] / [[valkey]] 的 streams 更轻
- 完全不想要关系模型——直接选 InfluxDB / Prometheus

## 历史小故事

- **2017 年**：Timescale Inc. 在纽约成立，第一版作为 PostgreSQL 扩展开源，主打 "make Postgres time-series"
- **2020 年**：v2.0 发布，引入 Multinode 分布式模式，想冲超大规模时序
- **2024 年**：v2.14 起官方移除 Multinode（用户少、维护重），战略回归"单机 + 云端 Hypercore"
- **同年**：v2.18 发布 Cloud Hypercore Storage——把行存 / 列存 / 对象存储分层，热数据在 SSD、温数据列存压缩、冷数据下沉 S3

战略转向那次很关键：承认"分布式时序自己做不过 ClickHouse"，专注"PG 扩展"这个定位。

## 学到什么

1. **扩展 vs 独立产品**：TimescaleDB 选了扩展路线，复用整个 PG 生态——这个决定让它在工具链、人才、运维上零成本，是中小团队"上时序"的最低门槛
2. **chunk 是物理隔离单位**：分区不是 SQL 概念上的"逻辑分区"，是实打实的多张子表。理解这点才能解释为什么时间剪枝、压缩、保留策略都是"以 chunk 为粒度"
3. **连续聚合 = 物化视图增量化**：把"重算全表"变成"只算增量"，这个模式在仪表盘 / 报表场景非常通用
4. **战略收缩比战略扩张更难**：Multinode 砍掉那次，明确告诉用户"我们不再追这个市场"，反而帮 Timescale 重新聚焦

## 延伸阅读

- 官方文档：[Timescale Docs](https://docs.timescale.com/)（Hypertable / 连续聚合 / 压缩三章必读）
- 入门视频：Timescale 官方 YouTube 频道有 "Getting Started in 5 minutes" 系列
- 性能对比：搜 "TimescaleDB vs InfluxDB benchmark" 看官方和第三方双向对比
- [[postgresql]] —— 宿主数据库，先懂 PG 再看扩展
- [[clickhouse]] —— 大规模时序 / 分析场景的另一条路

## 关联

- [[postgresql]] —— TimescaleDB 是它的扩展，所有能力都建在 PG 之上
- [[clickhouse]] —— 同样做时序但路线不同：独立列存 OLAP 引擎 vs PG 扩展
- [[redis]] —— Redis Streams 也能做轻量时序，适合实时但不适合长保留
- [[valkey]] —— Redis 分叉，时序场景定位类似
- [[mysql]] —— 主流关系库的另一选择，但没有等价于 TimescaleDB 的扩展生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[influxdb]] —— InfluxDB — 专用时序数据库
- [[mongo]] —— MongoDB — 文档数据库服务端开源实现
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[opentsdb]] —— OpenTSDB — HBase 上的第一代分布式 TSDB
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[questdb]] —— QuestDB — 高性能时序库
- [[redis]] —— Redis — 内存键值数据库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库
- [[valkey]] —— Valkey — Redis 7.4 的开源 fork

