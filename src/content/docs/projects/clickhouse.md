---
title: ClickHouse — 列式 OLAP 数据库
来源: https://github.com/ClickHouse/ClickHouse
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

ClickHouse 是一套**专门为分析查询设计的列式数据库**，2009 年由俄罗斯 Yandex（俄罗斯版谷歌）为它的网站统计产品（类似 Google Analytics）开发。它的核心招牌：扫描亿级行只要秒级返回。

日常类比：

- [[postgresql]] 像**按订单卷宗存档**——一笔订单的所有字段（金额、用户、时间、地址）整本绑在一起，方便"取出某一笔订单的全部信息"
- ClickHouse 像**按字段分柜**——把"所有订单的金额"放一个柜子，"所有订单的时间"放另一个柜子。要算"今天总销售额"时，只开"金额"那个柜子扫一遍就行，其他柜子根本不碰

这种"按列存"的存放方式，让 OLAP（在线分析处理）查询比传统行式数据库快 10-100 倍。

## 为什么重要

不理解 ClickHouse，下面这些事都没法解释：

- 为什么 Cloudflare 每秒 1100 万次 HTTP 请求的日志能实时查询——传统 [[postgresql]] 早撑不住
- 为什么ByteDance、阿里、Uber 都在用它跑日志分析、监控、用户行为分析
- 为什么"OLAP 数据库"是 2020 年后云原生时代的新风口，估值百亿美元
- 为什么"列式存储"不是新概念（1970 年代就有），但 ClickHouse 直到 2016 年开源才让它平民化

## 核心要点

ClickHouse 快的原因可以拆成 **三个机制**：

1. **列式存储**：同一列的数据连续存放在磁盘上。查"今天 amount 之和"时，只读 amount 这一列的ByteDance，跳过其他所有列。类比：图书馆按"作者"分柜，找某作者的全部书不用翻整馆。

2. **压缩 + 编码**：同一列数据类型一致、相邻值相似，压缩率极高。LZ4 通用压缩 + ZSTD 高比压缩 + Delta/Gorilla 等专门编码。**存储成本能砍 80%**。

3. **向量化执行（Vectorized Execution）**：传统数据库一次处理一行，ClickHouse 一次处理一批（4096 行），充分利用 CPU 的 SIMD 指令。类比：搬砖时不是一块一块拿，而是用叉车一次拉一垛。

## 实践案例

### 案例 1：30 秒启动 ClickHouse

```bash
docker run -d --name ch -p 9000:9000 -p 8123:8123 clickhouse/clickhouse-server
docker exec -it ch clickhouse-client
```

进入 SQL 提示符，跟 [[postgresql]] 用法很像但**引擎选择不一样**。

### 案例 2：建表与 MergeTree 引擎

```sql
CREATE TABLE events (
  date Date,
  user_id UInt64,
  event String,
  amount Float64
) ENGINE = MergeTree()
ORDER BY (date, user_id);
```

**逐部分解释**：

- `ENGINE = MergeTree()` 是 ClickHouse 最常用的存储引擎，名字来自 LSM-Tree（Log-Structured Merge Tree）
- `ORDER BY (date, user_id)` 是**排序键**，数据按这两列在磁盘上排序，**不是唯一约束**——这跟 [[postgresql]] 的 PRIMARY KEY 完全不同
- 数据按这个排序键自动分块（part），后台合并

### 案例 3：聚合查询的速度感

```sql
SELECT
  date,
  count() AS pv,
  uniq(user_id) AS uv,
  sum(amount) AS gmv
FROM events
WHERE date >= '2026-01-01'
GROUP BY date
ORDER BY date;
```

在 1 亿行表上，这个查询通常 **1 秒内返回**。同样数据放在 [[postgresql]] 里没建专门索引时，可能 30 秒以上。

差距来源：

- 列式：只读 date / user_id / amount 三列，event 列完全跳过
- 压缩：实际从磁盘读的ByteDance数可能只有原始数据的 20%
- 向量化：一次处理 4096 行，CPU 流水线打满

## 踩过的坑

1. **不擅长 OLTP**：ClickHouse 为分析查询优化，单行 INSERT/UPDATE 性能很差。**插入必须批量**——一次至少几千行起步。频繁单行写会让后台 part 合并跟不上，磁盘和 CPU 双爆。

2. **JOIN 性能历来是弱点**：早期 ClickHouse 的 JOIN 把右表整个加载到内存（broadcast）。小表没问题，大表炸内存。25.x 才显著优化（grace hash join），但仍不如 [[postgresql]] 灵活。设计 schema 时**优先大宽表**，能不 JOIN 就不 JOIN。

3. **主键不是唯一约束**：ClickHouse 的 ORDER BY 主键只是排序依据，**不去重、不报错**。同一个 user_id 可以反复插。要去重得用 ReplacingMergeTree / CollapsingMergeTree 这些特殊引擎，且去重是**最终一致**（后台合并时才生效），不能用于业务强一致。

4. **实时更新很别扭**：ClickHouse 设计假设是"日志型数据，写多读多但少改"。要更新一行，传统做法是 ALTER TABLE UPDATE，但这是**重写整个 part 的异步操作**，不能频繁用。状态类数据继续放 [[postgresql]]，分析数据放 ClickHouse 是常见组合。

## 适用 vs 不适用场景

**适用**：

- 日志分析、监控、APM（每秒百万级写入，亿级行查询）
- 用户行为分析、漏斗、留存、归因
- BI 报表、数据看板（小时级 / 天级聚合）
- 时序数据（与 InfluxDB / TimescaleDB 同类）

**不适用**：

- OLTP 业务（订单、支付、库存）→ 用 [[postgresql]] / MySQL
- 强一致事务、外键、复杂约束 → ClickHouse 没有
- 频繁单行更新 → 用 KV 数据库或传统 RDBMS
- 小数据量（百万级以下）→ 用 [[postgresql]] 加索引就够，ClickHouse 反而是杀鸡用牛刀

## 历史小故事（可跳过）

- **2009 年**：Yandex 内部为 Yandex.Metrica（统计产品）开发，处理俄罗斯网站每天数十亿事件
- **2016 年**：开源，Apache 2.0 许可。当时市场上 OLAP 选项只有 Druid、Pinot 这些 JVM 系，ClickHouse 用 C++ 写、单机就能跑，立刻被注意
- **2020 年**：核心团队从 Yandex 独立成立 ClickHouse Inc.，估值 $10 亿，搬到旧金山
- **2024 年**：ClickHouse Cloud 商业化全面铺开，与 Snowflake、Databricks 同台竞争。开源版与 Druid / Pinot / StarRocks 形成 OLAP 四强

## 学到什么

- **列存 vs 行存不是哪个更好**，而是按访问模式选——OLTP 行存、OLAP 列存
- **压缩在分析数据库里是核心特性**，不是附加项。列式 + 类型化的数据压缩率远高于行式
- **向量化执行**是过去 10 年数据库领域最大的性能跃迁之一，几乎所有新一代分析引擎（DuckDB / Photon / Velox）都用
- **数据库分化到一定程度后，混合架构是常态**——业务库 [[postgresql]]、分析库 ClickHouse、缓存 Redis，各司其职

## 延伸阅读

- 官方文档：[clickhouse.com/docs](https://clickhouse.com/docs)（写得清楚，案例多）
- 入门视频：YouTube 搜 "ClickHouse Overview" 有 1 小时综述
- 性能对比：[Mark Litwintschik 的 ClickHouse 基准测试系列](https://tech.marksblogg.com)（同样数据集跑遍主流数据库）
- [[postgresql]] —— ClickHouse 的对照面，行式 OLTP 之王

## 关联

- [[postgresql]] —— OLTP 行式数据库的代表，与 ClickHouse 互补
- [[redis]] —— KV 内存数据库，三者经常组合：业务 PG + 分析 CH + 缓存 Redis
- [[docker]] —— ClickHouse 单镜像启动，是体验它的最快路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arrow]] —— Apache Arrow — 内存列式标准
- [[cockroachdb]] —— CockroachDB — 分布式 SQL 数据库
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[databend]] —— Databend — Rust 写的存算分离云数仓
- [[datadog]] —— Datadog — 把所有监控装进一个仪表盘的 SaaS 标杆
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[druid]] —— Apache Druid — 流批一体的实时分析数据库
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[duckdb-wasm]] —— duckdb-wasm — 把分析数据库塞进浏览器标签页
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[grafana]] —— Grafana — 监控可视化看板
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[greenplum-db]] —— Greenplum — Postgres 改的 MPP 数仓
- [[lfs-1991]] —— LFS 1991 — 把整个磁盘当日志写
- [[loki]] —— Loki — 给日志做 Prometheus，只索引标签不索引内容
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[metabase]] —— Metabase — 让非技术人查数
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[mongo]] —— MongoDB — 文档数据库服务端开源实现
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[nebula]] —— NebulaGraph — 国产分布式图数据库
- [[neo4j]] —— Neo4j — 主流图数据库
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[opentsdb]] —— OpenTSDB — HBase 上的第一代分布式 TSDB
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[pinot]] —— Apache Pinot — LinkedIn 起家的实时 OLAP
- [[polars]] —— Polars — Rust 写的列存 DataFrame
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[prometheus]] —— Prometheus — 时序监控系统
- [[questdb]] —— QuestDB — 高性能时序库
- [[redis]] —— Redis — 内存键值数据库
- [[redpanda]] —— Redpanda — Kafka 兼容的 C++ 实现
- [[risingwave]] —— RisingWave — Postgres 兼容的流式数据库，用物化视图替代 Flink + KV 组合
- [[sentry]] —— Sentry — 把崩溃和报错自动收集 + 分组 + 可查询的错误监控平台
- [[signoz]] —— SigNoz — 自托管的 OpenTelemetry 一体化可观测平台
- [[starrocks]] —— StarRocks — MPP 列存数据库
- [[superset]] —— Apache Superset — 开源 BI 平台
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库
- [[tidb]] —— TiDB — HTAP 分布式数据库
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析

