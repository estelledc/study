---
title: StarRocks — MPP 列存数据库
来源: https://github.com/StarRocks/starrocks
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

StarRocks 是一个**开源的列式 OLAP 数据库**，定位是让你在几亿到几百亿行的数据上做实时多维分析。日常类比：你开了一家有几十个分店的连锁餐厅，每天都要回答"过去 30 天哪个菜在哪个城市卖得最好、客单价多少、年龄段怎么分布"——这种**横切大量历史数据 + 多维度交叉**的查询，传统 MySQL 半天都跑不出来，StarRocks 几秒就能出。

技术上它是 Apache Doris 的分叉：2020 年原 Doris 核心团队离开百度，把 Doris 做成商业版 DorisDB；2021 年改名 StarRocks 并以 Elastic License 2.0 开源，**2022 年底才切到 Apache 2.0**。

它的三个核心卖点：

1. **MPP 架构**：把一个查询切成几十份，几十台机器同时算
2. **全面向量化执行**：按列批处理（一次 4096 行）+ 用 SIMD 指令一条算 8 个数
3. **基于成本的优化器（CBO）**：自动选最快的 JOIN 顺序，不靠人写 hint

## 为什么重要

不理解 StarRocks 这类 MPP OLAP 数据库，下面这些事都解释不了：

- 为什么携程、腾讯、小红书、Airbnb 把 ClickHouse + Druid + Presto 三个组件**统一替换成 StarRocks**
- 为什么"实时数仓"这两年突然成了热词——以前要 T+1 的报表现在能 T+1 分钟
- 为什么国产数据库讲 OLAP 时绕不开 Doris 和 StarRocks 这对兄弟
- 为什么 ClickHouse 单表跑得飞快，多表 JOIN 一上量就崩——它没真正的 CBO

## 核心要点

StarRocks 的架构可以拆成 **两个角色 + 三件武器**。

**两个角色**：

- **FE（Frontend，Java 写的）**：接待员。负责接 SQL、解析、生成查询计划、管元数据。类比餐厅前台——看菜单、算账、调度厨房。
- **BE（Backend，C++ 写的）**：厨房。负责存数据（列式 segment 文件）和执行计算。类比厨师团队——真正切菜下锅。

**三件武器**：

1. **向量化执行**：传统数据库一行一行算（火山模型，每次一个 tuple）；StarRocks 一次拿一**批列**算（4096 行的某一列同时进 SIMD 指令），CPU 缓存命中率和指令吞吐都飙升。
2. **CBO**：基于表的统计信息（行数、基数、直方图）估算每种 JOIN 顺序的代价，挑最便宜的。这是它打 ClickHouse 的关键。
3. **物化视图自动改写**：你预先建一个聚合好的物化视图，**用户写原始 SQL，引擎自动判断能不能改写到物化视图上**——用户无感，速度飞起。

## 实践案例

### 案例 1：用户画像多维分析

某电商要回答"过去 7 天，一线城市 25-35 岁女性，在母婴类目下单 GMV TOP 10 SKU"。

```sql
SELECT sku_id, SUM(gmv) AS total
FROM orders o JOIN users u ON o.user_id = u.id
WHERE o.dt >= CURDATE() - 7
  AND u.city_tier = 1 AND u.age BETWEEN 25 AND 35
  AND u.gender = 'F' AND o.category = 'maternal'
GROUP BY sku_id ORDER BY total DESC LIMIT 10;
```

StarRocks 上一般 1-3 秒返回；ClickHouse 上 JOIN 大表会慢很多，需要手工预 JOIN 成大宽表才能做。

### 案例 2：直接查数据湖（Lakehouse）

不导入数据，直接查 Hive / Iceberg / Hudi：

```sql
CREATE EXTERNAL CATALOG iceberg_catalog
PROPERTIES (
  "type" = "iceberg",
  "iceberg.catalog.type" = "hive",
  "hive.metastore.uris" = "thrift://metastore:9083"
);

SELECT * FROM iceberg_catalog.db.events WHERE dt='2026-05-30' LIMIT 100;
```

省掉 ETL 环节。配合本地缓存，热数据查询速度接近原生表。

### 案例 3：物化视图自动改写

```sql
-- 你建了一个按天聚合的物化视图
CREATE MATERIALIZED VIEW daily_gmv AS
SELECT dt, city, SUM(amount) FROM orders GROUP BY dt, city;

-- 用户照常写原始查询
SELECT dt, city, SUM(amount) FROM orders
WHERE dt >= '2026-05-01' GROUP BY dt, city;
-- 引擎自动改写到 daily_gmv，不扫原表
```

`EXPLAIN` 能看到是否真的命中。

## 踩过的坑

1. **CBO 没统计信息时反而更慢**：新表刚导入数据，没跑 `ANALYZE TABLE`，CBO 只能瞎猜。3 节点小集群更容易踩——记得先收集统计信息。

2. **Routine Load 不是流处理**：从 Kafka 拉数据进 StarRocks 是"微批"（默认几秒一批），不是真正的流。复杂的多流 JOIN / 窗口仍然要 Flink 在前面顶。

3. **存算分离 vs 存算一体配置混在一起**：3.x 引入存算分离（数据放 S3），但 2.x 老文档讲的是存算一体（BE 本地盘），新人按老文档配新版本会踩巨坑。建表时 `PROPERTIES` 完全不一样。

4. **Primary Key 模型很香但贵**：支持 update/delete 的 Primary Key 表，比 Duplicate Key 表多吃 3-5 倍内存（要存主键索引）——别什么表都用 PK。

5. **小批量 Stream Load 拖慢查询**：每秒几十个小批量写入会触发频繁 compaction，BE 后台合并文件占 CPU，前台查询变慢。要么攒批，要么用 Stream Load 的事务模式。

6. **Doris 和 StarRocks SQL 不完全互通**：早期分叉 90% 兼容，现在 UDF 和部分内置函数已经分化，迁移别想着无缝切。

## 适用 vs 不适用场景

**适用**：

- 实时数据分析（用户行为日志 / 业务事件流 / 监控指标）
- 多维 OLAP 报表（看板、运营大盘、临时分析）
- 数据湖加速查询（Iceberg / Hudi / Delta Lake 上的交互式查询）
- 替换 ClickHouse + Druid + Presto 的混合栈

**不适用**：

- 事务型业务（OLTP）→ 用 MySQL / PostgreSQL / TiDB
- 单表数据量很小（<1GB）→ DuckDB / SQLite 更轻
- 强一致性金融账务 → 银行核心交易类系统
- 纯 KV 查询场景 → Redis / RocksDB
- 需要复杂流式窗口 / CEP → Flink

## 历史小故事（可跳过）

- **2020**：原 Apache Doris 核心成员创业，基于 Doris 做商业版 DorisDB（后因商标问题改名）
- **2021-09**：产品改名 StarRocks，以 Elastic License 2.0 开源；同期补齐向量化执行与 CBO
- **2022-12**：许可证切到 Apache 2.0；公司侧品牌后称 CelerData
- **2023**：项目捐赠给 Linux Foundation；3.0 起推存算分离（数据上对象存储）
- **协议兼容**：一直走 MySQL 协议，JDBC / 常见 BI 可直连；Pipeline 引擎约 2.2 引入

## 学到什么

1. **MPP + 向量化是现代 OLAP 的标配组合**：MPP 解决"机器之间并行"，向量化解决"单机内 CPU 并行"，两者乘起来才有几十倍提速
2. **CBO 是 OLAP 数据库的护城河**：写 SQL 的人不会手动调 JOIN 顺序，能自动选对就赢一半
3. **存算分离是云原生 OLAP 的方向**：Snowflake 走通了，StarRocks 3.x 跟上
4. **分叉再开源要看许可时间线**：2021 开源 ≠ 一开始就是 Apache 2.0；ELv2 → Apache 2.0 差了一年多

## 延伸阅读

- 官方文档：[StarRocks Docs](https://docs.starrocks.io/)（中英双语，架构与存算分离说明最全）
- GitHub：[StarRocks/starrocks](https://github.com/StarRocks/starrocks)（Linux Foundation 项目）
- [[clickhouse]] —— 单机 OLAP 之王，StarRocks 的主要对手
- [[doris]] —— 同源兄弟项目，对照看分叉后各自演进
- [[rocksdb]] —— 底层 KV 引擎思路对比（StarRocks 自研列存，不用 RocksDB）

## 关联

- [[clickhouse]] —— 单表强、JOIN 弱；StarRocks 反过来靠 CBO + MPP JOIN
- [[doris]] —— 同源分叉，协议与生态仍常被拿来对比
- [[duckdb]] —— 嵌入式单机列存；StarRocks 是分布式集群向
- [[rocksdb]] —— LSM 嵌入式引擎 vs MPP 列存的不同路径
- [[greenplum-db]] —— 另一路 Postgres 系 MPP 数仓
- [[hindley-milner]] —— 类型推导和查询优化都是"基于已知信息推出最优方案"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[databend]] —— Databend — Rust 写的存算分离云数仓
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[greenplum-db]] —— Greenplum — Postgres 改的 MPP 数仓
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[questdb]] —— QuestDB — 高性能时序库
- [[redash]] —— Redash — 浏览器里写 SQL、出图、做仪表板的开源 BI
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库

