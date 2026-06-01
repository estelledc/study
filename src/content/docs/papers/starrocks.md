---
title: StarRocks — Doris 分叉出来的向量化 CBO 国产 OLAP
来源: 'Lin et al., "StarRocks: A Modern OLAP Database for Real-Time Analytics", VLDB 2024'
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
- 为什么同样跑 TPC-H，StarRocks 在多表 JOIN 上比 ClickHouse 快 2 到 5 倍——核心是有没有真 CBO，单表场景两者其实差不多
- 为什么国产 OLAP 在 ClickBench 公开榜上能稳定进前三，且不是靠"赢在中文支持"——靠的是向量化引擎和 CBO 实打实的工程
- 为什么 Snowflake 的"存算分离"架构在 2023 年被 StarRocks 3.x 在开源世界里复刻了一遍——商业方案永远会被开源追上
- 为什么"湖仓一体"这个词在 2023 到 2024 年突然变热——StarRocks / Doris 这一代引擎能直读 Iceberg / Hudi，让湖和仓不再二选一

## 核心要点

StarRocks 能跑赢上一代 OLAP，靠的是 **三件事的组合**：

1. **向量化执行**：传统数据库一次处理一行（叫 row-at-a-time），StarRocks 一次处理一批（默认 4096 行的列向量），让 CPU 的 SIMD 指令一次算 8 个 / 16 个数。类比：手洗碗 vs 洗碗机——单个碗洗起来差不多，一千个碗就拉开差距。

2. **CBO（Cost-Based Optimizer，成本优化器）**：写 SQL 你不管 JOIN 顺序，它自己根据每张表的统计信息（多少行、列分布）选最便宜的执行计划。这是 StarRocks 和 ClickHouse 最大的区别——ClickHouse 优化器很弱，复杂 JOIN 你得自己改 SQL。

3. **MPP 架构**：FE（前端，Java 写，管 SQL 解析 / 元数据 / 计划）+ BE（后端，C++ 写，存数据 / 算数据），数据按 Tablet 切片分布在多台 BE 上并行算。

三件加起来，StarRocks 在 OLAP 场景比 ClickHouse 通用、比 Doris 快、比 Snowflake 便宜。

补充一点：StarRocks 的存储格式是**列存 + 排序键 + 前缀索引**——一张表写入时按某个排序列（比如时间）排好，查询时配合谓词下推可以跳过整段数据，IO 量大幅减少。这是所有 OLAP 引擎的共同基本功，但实现细节差别很大。

另外，StarRocks 支持**主键模型（Primary Key Model）**——允许 UPDATE / DELETE，弥补了传统列存"只增不改"的弱点，这让它能直接接 CDC 流、当成业务侧的实时数据底座。

## 实践案例

### 案例 1：从三件套迁到一家

某电商把"实时订单分析"原本是这样：

- ClickHouse：算单表大宽表查询
- Druid：算时序聚合
- Presto / Trino：跨源 JOIN

迁到 StarRocks 后**一个引擎全包**：宽表用列存 + 向量化、JOIN 用 CBO、跨源用 External Catalog 直读 Iceberg / Hudi。运维从三套缩成一套，资源成本下降 40 到 60% 是常见数字。

### 案例 2：物化视图 + 自动改写

经典需求：每天看"按城市汇总销售"。传统做法是预计算一张汇总表，再让 BI 工具查那张表。

StarRocks 的做法：

```sql
CREATE MATERIALIZED VIEW mv_city_sales
REFRESH ASYNC EVERY (interval 10 minute)
AS SELECT city, sum(amount) FROM orders GROUP BY city;
```

之后 BI 工具继续写 `SELECT city, sum(amount) FROM orders GROUP BY city` ——StarRocks 的优化器自动识别这个查询能用 mv_city_sales 物化视图回答，**透明改写**，无需用户改代码。这叫 **MV query rewrite**。

### 案例 3：Lakehouse 直读

数据湖里有 Iceberg 表，传统得"导一份进数仓"，导入要时间、要存储、还要维护两份一致性。StarRocks 通过 External Catalog 直接当外表读：

```sql
CREATE EXTERNAL CATALOG iceberg_catalog
PROPERTIES ('type'='iceberg', 'iceberg.catalog.type'='hive');

SELECT count(*) FROM iceberg_catalog.db.events;
```

不导入、不复制、直接查。这套思路叫 **Lakehouse**——湖仓一体。冷数据躺在 S3 / OSS 上的 Parquet 文件里便宜，热数据在 StarRocks 内部存储里快，同一条 SQL 透明处理。

## 踩过的坑

1. **CBO 没有统计信息时反而更慢**：CBO 靠表统计选计划，新表 / 小集群没跑 ANALYZE 时它选错的概率比"无脑老套路"还大。生产部署第一件事是建好定时 ANALYZE，否则 CBO 会"乱猜"。

2. **Routine Load 不是 Flink**：StarRocks 自带 Routine Load 从 Kafka 拉数据，但本质是"微批导入"，不是流处理引擎。多流 JOIN / 复杂状态计算还得 Flink 在上游做，StarRocks 只负责存和查。

3. **存算分离（3.x）和存算一体（2.x）配置完全不一样**：网上文档常常混在一起，复制配置过来跑不起来。两种部署是两套架构——3.x 把数据放对象存储（S3 / OSS），2.x 数据本地盘。新手一定要先确认自己版本。

4. **从 Doris 迁过来不是无痛**：90% SQL 兼容，但 UDF / 部分内置函数 / 部分 DDL 语法不一样。两边社区已经分叉超过四年，差异在持续扩大，迁移要做完整 SQL 测试集回归。

5. **物化视图刷新不是免费午餐**：异步刷新 + 自动改写很美，但底表数据频繁更新时刷新代价不低；要权衡刷新频率和查询新鲜度。

## 适用 vs 不适用场景

**适用**：

- 实时 / 准实时 OLAP（数据延迟分钟到秒级，从 Kafka / CDC 流入）
- 多表 JOIN 的复杂分析查询（比 ClickHouse 强项，CBO 自动选执行计划）
- 需要"湖仓一体"——直接查 Iceberg / Hudi / Delta Lake，不必导入
- 替代 ClickHouse + Druid + Presto 这种多引擎拼盘，统一一个引擎
- 需要 MySQL 协议生态兼容（BI 工具 / 老客户端 / 中间件不用改）
- 需要预聚合加速 + 自动改写——靠物化视图把查询从分钟降到秒

**不适用**：

- 超低延迟点查（毫秒级，按主键查单行）→ 用 KV 数据库（Redis / TiKV）
- 高频事务写入（OLTP，每秒万级写）→ 用 MySQL / PostgreSQL / TiDB
- 单机小数据集分析（数据 GB 级）→ 用 DuckDB（嵌入式更轻，省运维）
- 流式 ETL / 复杂状态计算（多流 JOIN / 窗口 / 状态机）→ 用 Flink（StarRocks 是查询引擎不是计算引擎）
- 全文检索 / 向量检索为主的场景 → 用 Elasticsearch / Milvus，StarRocks 做不了

## 历史小故事（可跳过）

- **2017 年**：百度把内部 OLAP 系统 Palo 捐给 Apache，成为 Apache Doris（孵化期）。
- **2020 年**：Doris 核心团队（前百度）离开，成立鼎石科技（CelerData），把 Doris 分叉成商业版 DorisDB。
- **2021 年**：因商标问题改名 **StarRocks**，全部源码以 Apache 2.0 开源，向量化引擎 + CBO 是分叉后的新增主线。
- **2022 年**：流水线执行引擎（pipeline executor）发布，多核 CPU 利用率显著提高。
- **2022 到 2023 年**：StarRocks 和 Apache Doris 双双在中国 OLAP 市场份额超过 ClickHouse，成为主流选择，携程 / 腾讯 / 小红书 / 拼多多陆续公开技术方案。
- **2023 年**：StarRocks 3.0 推出存算分离架构，对标 Snowflake，把数据放到 S3 / OSS。
- **2024 年**：核心团队在 VLDB 2024 发表论文，正式把 StarRocks 推上学术舞台。

之后的故事还在写——开源 OLAP 这一仗，StarRocks / Doris / DuckDB 三家分别占住"分布式重型"/"分布式轻量"/"嵌入式"三个生态位，谁也吃不掉谁。

## 学到什么

1. **OLAP 不是 OLTP 的"读多写少版"**——它是另一种数据组织（列存 + 向量化 + 预聚合），性能假设完全不同，工具链也分叉
2. **CBO 是数据库分水岭**——没有 CBO 的引擎在多表 JOIN 上永远是体力活，DBA 得手工调 SQL；有 CBO 才能让"业务方随便写 SQL"成为可能
3. **分叉不一定是坏事**：StarRocks 从 Doris 分叉后两边都进步了，竞争反而推动了整个生态。开源社区里"分叉 = 失败"的旧观念，在数据库领域可能不成立
4. **存算分离是 OLAP 的下一站**：从"机器即数据"到"S3 即数据"，弹性 / 成本 / 多租户三件事一起改写。Snowflake 用商业证明了这条路，StarRocks 3.x 把它带回了开源
5. **国产基础软件的崛起路径**：StarRocks 是少数从中国走向全球开源社区被认真对待的基础软件之一——不靠"国产替代"标签，而是靠真实性能数据
6. **协议兼容性的复利**：选择 MySQL 协议看似只是"省一个 driver"，但带来了海量 BI 工具 / ORM / 中间件零改造适配——基础软件的护城河往往不在功能本身而在生态接入成本
7. **从论文回看产品**：VLDB 2024 这篇论文最有价值的不是性能数字，而是把工程权衡（向量化批大小 / CBO 启发式 / Tablet 切分粒度）讲清楚了；很多"为什么这么设计"的问题在论文里有答案

## 延伸阅读

- 论文：[StarRocks VLDB 2024 PDF](https://www.vldb.org/pvldb/vol17/p3686-chen.pdf)（核心团队亲自写的架构总览，含向量化和 CBO 实现细节）
- 官方文档：[docs.starrocks.io](https://docs.starrocks.io/)（中文版很全，新手建议从"3 分钟快速体验"开始）
- 对比阅读：[ClickHouse vs StarRocks 性能对比](https://celerdata.com/blog)（CelerData 官方博客，注意立场）
- 公开榜单：[ClickBench](https://benchmark.clickhouse.com/)（StarRocks 长期前三，可以自己看排名变化）
- [[clickhouse]] —— 同一战场的另一种解法，单表强 JOIN 弱

## 关联

- [[clickhouse]] —— OLAP 老牌选手，StarRocks 主要对标对象，单表场景下仍各有千秋
- [[snowflake-2016]] —— 商业云原生 OLAP，StarRocks 3.x 存算分离架构的对照参考
- [[duckdb]] —— 嵌入式单机 OLAP，互补不冲突——单机用 DuckDB，分布式用 StarRocks
- [[apache-iceberg]] —— Lakehouse 表格式，StarRocks 通过 External Catalog 直读
- [[apache-doris]] —— StarRocks 的上游父亲，分叉超过四年仍在两条路并行演化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

