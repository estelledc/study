---
title: StarRocks — Doris 分叉出来的向量化 CBO 国产 OLAP
来源: 'Chen et al., "StarRocks: A Modern OLAP Database for Real-Time Analytics", VLDB 2024'
日期: 2026-05-31
分类: infrastructure
难度: 中级
---

## 是什么

StarRocks 是一个**专门用来"算大表"的数据库**——你给它一张几亿行的订单表，它能在一秒内告诉你"过去三个月每个城市每天的销售额"。日常类比：超市每天关店后要算今天的总账，普通收银机一笔一笔加要算到天亮，StarRocks 像一台"批量计算的加法器"——一次把上千行塞进 CPU 一起算完。

技术定位：它是一个 **MPP（大规模并行）+ 向量化执行 + 自带 CBO（成本优化器）** 的开源 OLAP 数据库，从 Apache Doris 在 2020 年分叉而来。开源协议 Apache 2.0，用 MySQL 协议——你拿任何 MySQL 客户端就能连。

## 为什么重要

不理解 StarRocks，下面这些事都没法解释：

- 为什么 2022 年后中国大厂的"实时数仓"方案从 ClickHouse + Druid + Presto 三件套迁到 StarRocks 一家——一个引擎替三个，运维成本骤降
- 为什么同样跑 TPC-H，StarRocks 在多表 JOIN 上常比 ClickHouse 快数倍（依赖 workload；单表场景两者其实差不多）——核心是有没有真 CBO
- 为什么国产 OLAP 在 ClickBench 公开榜上能稳定进前三——靠的是向量化引擎和 CBO，不是"赢在中文支持"
- 为什么"湖仓一体"在 2023–2024 变热——StarRocks / Doris 能直读 Iceberg / Hudi，让湖和仓不再二选一

## 核心要点

StarRocks 能跑赢上一代 OLAP，靠的是 **三件事的组合**：

1. **向量化执行**：传统数据库一次处理一行（row-at-a-time），StarRocks 一次处理一批（默认 4096 行的列向量），让 CPU 的 SIMD 指令一次算多个数。类比：手洗碗 vs 洗碗机——单个碗差不多，一千个碗就拉开差距。

2. **CBO（Cost-Based Optimizer，成本优化器）**：写 SQL 你不管 JOIN 顺序，它根据表统计（多少行、列分布）选更便宜的计划。这是和 ClickHouse 的最大差别——后者复杂 JOIN 常要你自己改 SQL。

3. **MPP 架构**：FE（前端，像"前台接待"：Java，管解析 / 元数据 / 计划）+ BE（后端，像"后厨"：C++，存数据 / 算数据）；数据按 Tablet（像切好的菜板块）分布在多台 BE 上并行算。

三件加起来，StarRocks 在多表分析上往往比 ClickHouse 更省心，相对自建 Snowflake 常更便宜；和 Doris 则是同根分叉、各有取舍。

补充：存储是**列存 + 排序键 + 前缀索引**——按排序列写入，查询可跳过整段数据。另支持**主键模型**，允许 UPDATE / DELETE，能直接接 CDC（Change Data Capture，像"业务库变更的直播回放"）流。

## 实践案例

### 案例 1：从三件套迁到一家

某电商原先：ClickHouse 算宽表、Druid 做时序聚合、Presto 做跨源 JOIN。迁到 StarRocks 后一个引擎全包。最小对照：

```sql
-- 以前：先拼大宽表再查；现在：多表 JOIN，交给 CBO
SELECT c.city, sum(o.amount)
FROM orders o JOIN dim_city c ON o.city_id = c.id
WHERE o.dt >= '2024-01-01' GROUP BY c.city;
```

**逐部分解释**：

- `JOIN dim_city`：不必先把城市名打进订单宽表；CBO 选执行顺序
- `WHERE o.dt`：谓词下推，少读无关分区
- 运维从三套缩成一套，公开案例里资源成本常降约 40–60%（视集群与查询形态）

### 案例 2：物化视图 + 自动改写

```sql
CREATE MATERIALIZED VIEW mv_city_sales
REFRESH ASYNC EVERY (interval 10 minute)
AS SELECT city, sum(amount) FROM orders GROUP BY city;
```

之后 BI 仍写 `SELECT city, sum(amount) FROM orders GROUP BY city`，优化器可透明改写到 `mv_city_sales`（**MV query rewrite**）。语法以 [docs.starrocks.io](https://docs.starrocks.io/) 当前版为准。

**逐部分解释**：

- `REFRESH ASYNC`：后台按间隔刷新，查询不阻塞
- `EVERY (interval 10 minute)`：新鲜度与刷新成本的权衡旋钮
- 自动改写：用户 SQL 不用改，优化器认得出"这张 MV 能答"

### 案例 3：Lakehouse 直读

```sql
CREATE EXTERNAL CATALOG iceberg_catalog
PROPERTIES ('type'='iceberg', 'iceberg.catalog.type'='hive');

SELECT count(*) FROM iceberg_catalog.db.events;
```

不导入、直接查。冷数据在 S3 / OSS 的 Parquet 上便宜，热数据在内部存储里快。`PROPERTIES` 随 hive / glue 等 catalog 类型而变，照抄前先对文档。

**逐部分解释**：

- `EXTERNAL CATALOG`：登记外部元数据，不把文件搬进 StarRocks
- `iceberg.catalog.type`：告诉引擎去哪解析表位置
- `iceberg_catalog.db.events`：用三层名字当本地表查

## 踩过的坑

1. **CBO 没统计会乱猜**：新表没跑 ANALYZE 时，选错计划可能比固定套路更慢——生产先建定时 ANALYZE。
2. **Routine Load 不是 Flink**：自带 Kafka 导入是微批，多流 JOIN / 复杂状态仍要上游 Flink。
3. **存算分离（3.x）与存算一体（2.x）配置两套**：网上文档常混用；3.x 数据在对象存储，2.x 在本地盘。
4. **从 Doris 迁不是无痛**：约 90% SQL 兼容，UDF / 部分函数 / DDL 有差，要做回归测试集。

## 适用 vs 不适用场景

**适用**：

- 实时 / 准实时 OLAP（延迟分钟到秒级，Kafka / CDC 流入）
- 多表 JOIN 复杂分析（相对 ClickHouse 的强项；目标是秒级交互，不是毫秒点查）
- 湖仓一体：直读 Iceberg / Hudi / Delta，不必先导入
- 用一个引擎替代 ClickHouse + Druid + Presto 拼盘
- MySQL 协议生态兼容；物化视图预聚合 + 自动改写

**不适用**：

- 超低延迟点查（毫秒级按主键查单行）→ Redis / TiKV
- 高频事务写入（OLTP）→ MySQL / PostgreSQL / TiDB
- 单机 GB 级分析 → DuckDB 更轻
- 流式 ETL / 多流 JOIN / 窗口状态 → Flink
- 全文 / 向量检索为主 → Elasticsearch / Milvus

## 历史小故事（可跳过）

- **2017**：百度 Palo 捐给 Apache，成为 Apache Doris。
- **2020**：核心团队离开成立鼎石科技（CelerData），分叉出 DorisDB。
- **2021**：因商标改名 **StarRocks**，Apache 2.0 开源；向量化 + CBO 成主线。
- **2022**：流水线执行引擎（pipeline executor）提升多核利用率；与 Doris 在国内份额追上 ClickHouse。
- **2023–2024**：3.0 存算分离对标 Snowflake；VLDB 2024 发表架构论文。

## 学到什么

1. **OLAP 不是 OLTP 的读多写少版**——列存 + 向量化 + 预聚合，工具链也分叉
2. **CBO 是分水岭**——没有它，多表 JOIN 靠人肉调 SQL；有了它，业务方才能随便写
3. **分叉不一定失败**：StarRocks / Doris 竞争推动了生态
4. **存算分离是下一站**：Snowflake 用商业证明，StarRocks 3.x 带回开源；协议兼容（MySQL）往往比单点功能更护城河

## 延伸阅读

- 论文：[StarRocks VLDB 2024 PDF](https://www.vldb.org/pvldb/vol17/p3686-chen.pdf)（架构总览：向量化与 CBO）
- 官方文档：[docs.starrocks.io](https://docs.starrocks.io/)（建议从快速体验开始）
- 对比：[CelerData 博客性能对比](https://celerdata.com/blog)（注意厂商立场）
- 榜单：[ClickBench](https://benchmark.clickhouse.com/)
- [[clickhouse]] —— 同一战场，单表强、JOIN 弱

## 关联

- [[clickhouse]] —— OLAP 老牌选手，主要对标；单表场景仍各有千秋
- [[snowflake]] —— 商业云原生 OLAP；StarRocks 3.x 存算分离对照
- [[duckdb]] —— 嵌入式单机 OLAP；单机用它，分布式用 StarRocks
- [[apache-iceberg]] —— Lakehouse 表格式，External Catalog 直读
- [[apache-doris]] —— 上游父亲，分叉四年仍并行演化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
