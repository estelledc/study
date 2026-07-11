---
title: Databend — Rust 写的存算分离云数仓
来源: https://github.com/databendlabs/databend
日期: 2026-05-31
分类: 数据库
难度: 中级
---

## 是什么

Databend 是一个**用 Rust 写的开源云原生数据仓库**，核心卖点是"存算分离 + 对象存储 + 列存向量化"，自我定位是 **Snowflake 的开源对标**。

日常类比：传统分布式数仓像**自带仓库的工厂**——机器和原料堆在同一个院子，扩产能要连机器带仓库一起加。Databend 像**只租机器、原料统一存到中央货仓**——计算节点想加几台加几台，重启就丢，所有数据都躺在 S3 上等着读。

最简单的体验，跑一条建表插数据：

```sql
CREATE TABLE sales (
  id BIGINT, region VARCHAR, amount DECIMAL(18, 2)
) ENGINE = FUSE;

COPY INTO sales FROM 's3://my-bucket/sales/' FILE_FORMAT = (TYPE = PARQUET);

SELECT region, SUM(amount) FROM sales GROUP BY region;
```

接 MySQL 协议端口（3307），用 `mysql -h ... -P 3307` 直接连。**写入和扫描都走对象存储**，计算节点本地盘只放临时溢写。

## 为什么重要

不理解 Databend 的设计哲学，下面这些事都没法解释：

- 为什么"夜间集群整个关掉"在 Databend 上是合法操作——白天 ETL 跑完，存储在 S3，计算可以全停，账单只剩存储几块钱
- 为什么单个数据集可以同时被 BI、报表、ETL 三种 workload 查询——每个 workload 起一个独立的 Warehouse 计算 cluster，共享同一份对象存储数据，互不抢资源
- 为什么 ClickHouse 的本地盘扩缩容很痛苦，Databend 几乎无痛——后者无状态计算节点，加一台秒级 ready
- 为什么 Snowflake 的"时间旅行（Time Travel）"开源选项里 Databend 是最完整的——它继承了同样的 segment + snapshot 元数据模型

简单说：**它把 Snowflake 那套商业数仓的核心架构，原样开源了一份给你自托管**。

## 核心要点

Databend 的架构可以拆成 **三层**：

1. **Query 节点（无状态计算）**：Rust 写的向量化 SQL 引擎。接收 SQL、做规划、读对象存储、跑算子、返回结果。挂了重启就行，没有任何持久状态。

2. **Meta Service（元数据 + 事务）**：基于 Raft 共识的小集群，存表结构、segment 列表、snapshot、权限。所有 DDL 和事务提交都过这一层。它是整个系统**唯一**有状态的中枢。

3. **对象存储（数据本体）**：S3 / OSS / GCS / Azure Blob 任一。表数据按 Fuse Engine 格式存——基于 Apache Parquet 改造，分 segment、segment 内分 block，元数据指针由 Meta 管理。

简单说：**SQL 进来 → Query 问 Meta 要 schema 和 segment 列表 → Query 直接从 S3 拉 Parquet 列块 → 向量化算子在内存里跑 → 出结果**。

## 实践案例

### 案例 1：本地起一个最小 Databend

```bash
docker run -d --name databend \
  -p 3307:3307 -p 8000:8000 \
  --env QUERY_DEFAULT_USER=root \
  --env QUERY_DEFAULT_PASSWORD=root \
  datafuselabs/databend:latest
```

跑起来后用 `mysql -h 127.0.0.1 -P 3307 -uroot -proot` 连上去。**默认配置存到本地 `/var/lib/databend`**——这是为了体验方便，生产里改成 `[storage] type = "s3"` 指向真实 bucket。

### 案例 2：Warehouse 多 cluster 共享数据

在 Databend Cloud 或自建的调度层里，元数据和对象存储是共享的，但可以为不同 workload 起独立计算 cluster。下面用接近 Snowflake 的伪 SQL 表达这个管理动作：

```sql
-- BI 报表用：低延迟、轻量并发
CREATE WAREHOUSE bi_wh WITH cluster_size = 2;

-- 夜间 ETL 用：大吞吐
CREATE WAREHOUSE etl_wh WITH cluster_size = 8;

USE WAREHOUSE bi_wh;
SELECT * FROM sales WHERE date = today();
```

逐部分解释：

- 两个 Warehouse 共享**同一份 sales 表数据**（在 S3）和**同一套 schema**（在 Meta）
- BI cluster 跑短查询、可以 24×7 在线；ETL cluster 跑完批就关
- 这是 Snowflake 的"虚拟仓库"模型——Databend 的云服务/调度层按这个思路隔离计算资源

### 案例 3：时间旅行（Time Travel）

```sql
-- 查 1 小时前的版本
SELECT * FROM sales AT (TIMESTAMP => now() - INTERVAL 1 HOUR);

-- 查某个具体 snapshot
SELECT * FROM sales AT (SNAPSHOT => 'snapshot_id_xxx');

-- 误删后秒级恢复到指定时间点
CREATE TABLE sales_recovered AS
  SELECT * FROM sales AT (TIMESTAMP => '2026-05-30 10:00:00');
```

**关键点**：Fuse Engine 写入时不覆盖旧 segment，新写入只追加新 snapshot，旧版本由 retention 策略管。**误删一张表 5 分钟内能秒级恢复**，传统数仓需要从备份恢复几小时。

## 踩过的坑

1. **对象存储延迟不可忽视**：S3 的 GET 首字节延迟通常 30-100ms。Databend 默认开 prefetch 和并行读，但**点查询（带强 WHERE 过滤的小查询）**仍可能比本地盘 ClickHouse 慢一截。Databend 强项是大扫描，不是 OLTP 风格点查。

2. **Meta Service 必须高可用**：所有 DDL/事务过 Meta，**Meta 挂了整个集群只读**。生产至少 3 节点 Raft，磁盘要稳定。早期版本曾因 Meta 单点导致集群全挂的事故。

3. **小文件灾难**：每次写入都生成新 segment 和 block，频繁小批量写入会产生海量小文件，扫描和 LIST 都变慢。**必须配 `OPTIMIZE TABLE ... COMPACT`** 或开自动 compaction，否则三个月后查询掉到原速度的 1/10。

4. **MySQL 协议兼容不是 100%**：默认走 MySQL wire protocol，但函数语义、隐式类型转换、错误码并非完全和 MySQL 一致。**别假设 MySQL 客户端工具的高级特性都能用**——简单 query/insert 没问题，复杂 stored procedure 不支持。

## 适用 vs 不适用场景

**适用**：

- 云上分析型 workload——对象存储已是标配，Databend 无缝接入，存储成本压到极限
- 多团队/多业务共享同一份数据——Warehouse 隔离 + 共享存储模型最合适
- 需要时间旅行 / snapshot 隔离的合规场景——金融、审计需要查询历史快照
- 已有 MySQL/ClickHouse SQL 习惯，迁移成本低

**不适用**：

- OLTP 高频点查询和事务——它是分析型数仓，不是 OLTP 引擎
- 完全离线 / 没有对象存储的环境——可以用本地 FS 但失去核心价值
- 亚秒级实时数据流（TPS 上万的连续 INSERT）——更适合用 RisingWave / Flink + Databend 落盘
- 极小规模（GB 级）数据 + 单机分析——直接用 DuckDB 更轻

## 历史小故事（可跳过）

- **2021 年**：DatabendLabs 团队（前阿里云 RDS / OceanBase 背景）启动 Databend，目标是"把 Snowflake 架构开源化"。最早用 Rust + 对象存储原型证明可行。
- **2022 年**：核心引擎 Fuse Engine 成型，向量化执行器借鉴 ClickHouse / Velox 思路。开始接收社区 PR，加 MySQL/ClickHouse 协议兼容。
- **2023 年 4 月**：v1.0 正式发布。同年商业化 Databend Cloud 上线，提供托管版本。
- **2024 年**：生态完善——支持 Iceberg / Delta Lake 外部表、UDF、流式 ingestion。GitHub stars 破 7k。
- **现在**：开源端定位与 ClickHouse / Doris / StarRocks 三足鼎立，差异点是"原生云架构 + 对象存储一等公民"。

## 学到什么

1. **存算分离不是简单分两层** —— 真正的分离要让计算无状态、存储统一寻址、元数据独立成第三方。Databend 把这三件事各放一层。
2. **对象存储是云数仓的地基** —— 牺牲一点延迟换无限容量、低成本、跨服务共享，符合大部分分析负载的取舍
3. **MySQL 协议是迁移开关** —— 兼容老协议比设计新协议更能让用户敢用——这是 ClickHouse、Doris、Databend 都选的路
4. **从商业产品反向开源** —— Snowflake 验证了架构，Databend 把它做成开源版本，省去了从零设计的多年探索成本

## 延伸阅读

- 官方文档：[Databend Documentation](https://docs.databend.com/)（Quickstart 最快上手）
- 架构文章：[Databend 架构总览](https://docs.databend.com/guides/overview/architecture)（一篇看清三层）
- GitHub 仓库：[databendlabs/databend](https://github.com/databendlabs/databend)（examples 目录可对照学习）
- 与 Snowflake 对比：社区博客 [Databend vs Snowflake](https://www.databend.com/blog/) 系列（讲清楚开源版做到什么、还差什么）
- [[clickhouse]] —— 同一类列存 OLAP，本地盘路线的代表
- [[snowflake-2016]] —— Databend 的原型，云数仓存算分离的开山之作

## 关联

- [[clickhouse]] —— 同一类列存 OLAP，区别在 ClickHouse 默认本地盘、Databend 默认对象存储
- [[doris]] —— 国产 MPP 数仓，本地盘路线，与 Databend 形成"本地 vs 云"两条路对比
- [[starrocks]] —— 同样 MPP 列存路线，与 Doris 同源，定位 OLAP 实时分析
- [[risingwave]] —— 流式数据库，常与 Databend 搭配——RisingWave 实时入仓，Databend 做批分析
- [[snowflake-2016]] —— Databend 直接对标的商业产品，三层架构来源
- [[duckdb-2019]] —— 单机分析数据库，小数据量比 Databend 轻得多，互补不冲突
- [[greenplum-db]] —— Postgres 改的 MPP 数仓，老一代分布式数仓代表，与 Databend 形成代际对比
- [[lakehouse-2021]] —— 湖仓一体范式，Databend 通过 Iceberg 外部表也能接入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
