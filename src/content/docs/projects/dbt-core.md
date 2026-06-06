---
title: dbt-core — 把 SQL 当工程代码写，让数据仓库里的转换跑起来
来源: dbt Labs Documentation, https://docs.getdbt.com/
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

dbt（data build tool）是一个**用 Python 写的命令行工具**，它让数据分析师只用 `SELECT` 语句就能在数据仓库里做"转换"，并配套版本控制、测试、文档、依赖图。

日常类比：把数据仓库想成一个**装修工地**。原始数据是从供应商运来的板材、瓷砖、电线（已经被 Fivetran / Airbyte 这种"卸货卡车"卸到工地）。dbt 是工地的**施工管理软件**——每个 SQL 文件是一道工序图纸，`ref()` 是工序之间的先后关系，dbt 看完所有图纸自动排施工顺序、自动验收（测试）、自动出竣工报告（文档）。它自己不抡锤——锤子是数据仓库（Snowflake / BigQuery / Redshift / DuckDB）。

写起来是这样：

```sql
-- models/marts/orders_daily.sql
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS orders,
  sum(amount) AS revenue
FROM {{ ref('stg_orders') }}      -- 上游模型
WHERE status = 'paid'
GROUP BY 1
```

写完跑 `dbt run`，dbt 把这条 SELECT 包成 `CREATE TABLE orders_daily AS ...` 发给仓库执行，并把它接到 `stg_orders` 后面成为 DAG 一节。

## 为什么重要

不理解 dbt，下面这些事就解释不通：

- 为什么 2018-2024 数据团队从"写一堆 cron+Python 脚本"突然转向"写 SQL + 提 PR + 跑 CI 测试"——dbt 把分析工作搬进了软件工程的工作流
- 为什么 Snowflake / BigQuery 占领市场后，**仓内转换**（in-warehouse T）能把 Spark/Hadoop 的 T 这一步挤下去——dbt 让 SQL 重新变成主力
- 为什么 2020 后 LinkedIn 上冒出"Analytics Engineer"这个新岗位——介于分析师和数据工程师之间，写 dbt 模型为生
- 为什么 OpenLineage / Datafold / Elementary 这些血缘和数据观测工具，第一个支持的格式都是 dbt 编译产物 `manifest.json`

## 核心要点

dbt 的世界由七个东西咬合：

1. **Model**：一个 `.sql` 文件，内容是一条 SELECT。dbt 帮你包成 `CREATE TABLE / VIEW`，文件名就是表名。
2. **ref() 和 source()**：Jinja 函数。`{{ ref('stg_orders') }}` 解析时变成具体表名，dbt 同时记下"本模型依赖 stg_orders"——DAG 就是从所有 ref 关系扫出来的。
3. **Materialization**：决定 SELECT 怎么落地。`view`（每次查询时算）、`table`（dbt run 时算一次存下来）、`incremental`（只算新增行 merge 进去）、`ephemeral`（不落地，编译进下游 SQL 当 CTE）。
4. **Tests**：在 `schema.yml` 声明 `not_null` / `unique` / `relationships` / `accepted_values`，或写自定义 SQL 测试。`dbt test` 把每条测试编译成一条 `SELECT count(*) FROM ... WHERE 违规条件`，行数 > 0 就算失败。
5. **Macros**：用 Jinja 写的 SQL 函数，复用 SQL 片段。`dbt-utils` 这类 packages 就是社区 macros 集合。
6. **Snapshots**：用 SCD-2 风格捕获缓变维度——给一张会被原地更新的源表加上"何时生效、何时失效"两列，留下历史。
7. **Adapter**：抽象不同仓库方言的插件层。`dbt-snowflake` / `dbt-bigquery` / `dbt-postgres` / `dbt-duckdb`——dbt-core 只管编译和 DAG，怎么连库、怎么 merge、怎么建表全交给 adapter。

整个流程的关键是：**dbt 自己不算数据**，它只把 `.sql + Jinja` 编译成纯 SQL，把这条 SQL 发给仓库执行。所以 dbt 跑得快不快，几乎只看你的仓库跑得快不快。

## 实践案例

### 案例 1：一个最小项目

```
models/
  staging/
    stg_orders.sql      -- SELECT * FROM raw.orders WHERE deleted_at IS NULL
    stg_customers.sql
  marts/
    customer_orders.sql -- JOIN 上面两个 stg_*
schema.yml              -- 声明每个 model 的列 + 测试
dbt_project.yml         -- 项目配置（仓库连接、materialization 默认值）
```

跑 `dbt run` → 三个表按依赖顺序建好；跑 `dbt test` → 所有声明的测试一起执行；跑 `dbt docs generate` → 生成静态网站，含 DAG 图和列级文档。

### 案例 2：incremental 模型避免重算全表

```sql
{{ config(materialized='incremental', unique_key='event_id') }}
SELECT * FROM {{ ref('raw_events') }}
{% if is_incremental() %}
  WHERE event_at > (SELECT max(event_at) FROM {{ this }})
{% endif %}
```

第一次跑：全量建表。后续跑：只查新增行，按 `event_id` merge 进现有表。`{{ this }}` 是 dbt 注入的"我自己这张表"的引用。

### 案例 3：CI 里跑 dbt——分析师工作流的最大改变

PR 提交时，CI 在测试 schema 跑 `dbt build --select state:modified+`（只跑改过的 model + 它的下游），全部通过才能 merge。这条流程在 dbt 之前几乎不存在——分析师在仓库里改 SQL 没人 review、没人测试，凭手感。

### 案例 4：测试声明长这样

```yaml
# models/staging/schema.yml
models:
  - name: stg_orders
    columns:
      - name: order_id
        tests:
          - unique
          - not_null
      - name: customer_id
        tests:
          - relationships:
              to: ref('stg_customers')
              field: customer_id
      - name: status
        tests:
          - accepted_values:
              values: [pending, paid, refunded]
```

跑 `dbt test`，dbt 把每条声明展开成一条断言 SQL：`SELECT count(*) FROM stg_orders WHERE order_id IS NULL`，行数 > 0 就算这条测试失败。所有测试结果一起报告。

## 踩过的坑

1. **Jinja 调试痛**：`{{ ref(...) }}` 出错时，报错往往在编译后的 SQL 里，不在源文件。看 `target/compiled/<project>/...` 找编译产物，对照行号。
2. **incremental 合并键写错 = 数据翻倍**：`unique_key` 必须真唯一，否则 merge 不上、变成 append，悄悄重复。建议写完后立刻配 `unique` 测试。
3. **测试默认全表扫**：`unique`、`not_null` 默认 `SELECT count(*) FROM <整张表>`，大表上很慢。用 `where:` 配置加过滤，或用 `dbt-utils.expression_is_true` 自定义。
4. **DAG 大了之后编译变慢**：几百个 model 后，`dbt parse` 本身就要几十秒。社区的 `defer` + `state:modified+` 是标配——CI 只跑改过的部分。
5. **dbt-core 没有调度器**：定时触发要外挂 Airflow / Dagster / dbt Cloud。新人常以为 `dbt run` 自带 cron，结果生产上没人跑。

## 适用 vs 不适用场景

**适用**：

- 已有云数据仓库（Snowflake / BigQuery / Redshift / Databricks SQL）的团队做 T
- 数据团队想引入 git + PR + CI 工作流
- 需要给下游用户提供有文档、有测试、可追溯血缘的数据集市

**不适用**：

- 流式（streaming）数据——dbt 是批处理思维，分钟级以下不合适，看 Materialize / RisingWave
- 数据还没进仓库的阶段——dbt 不做 EL，只做 T；用 Fivetran / Airbyte / 自写 ingestion
- 仓库本身性能是瓶颈的场景——dbt 优化空间有限，因为它只是发 SQL，慢在仓库

## 历史小故事（可跳过）

- **2016 年**：Tristan Handy 在波士顿开 Fishtown Analytics 咨询公司，给客户建数据仓库时反复手写一堆 ETL 脚本，受不了，写了个内部工具叫 dbt 帮自己加速。开源出来时只有 SQL + Jinja + 一个简单的 DAG。
- **2018 年**：Snowflake / BigQuery 这类云仓库已经把性能解决了，分析师终于敢在仓库里直接做 T；dbt 踩着这波顺风开始扩散。
- **2020 年**：Fishtown 改名 dbt Labs，融资数亿美元，发布 dbt Cloud 商业版。同年 Tristan 在博客里造词 **Analytics Engineer**，定义这个新岗位。
- **2022 年**：dbt + Snowflake + Fivetran + Looker 被打包卖成 **Modern Data Stack**——这是 2022 数据圈最响的概念之一。dbt 是其中的 T。

## 学到什么

1. **抽象的位置很关键**：dbt 不重写仓库、不替代 SQL，它只在 SQL 之外加了一层"工程化壳"——版本、依赖、测试、文档。这一层就足以改变整个行业。
2. **编译 + 委托执行** 是个朴素但强力的范式——dbt、Terraform、Pulumi 都是这套：源文件不直接生效，先编译成目标平台的语言，再让目标平台执行。
3. **工具能创造岗位**：Analytics Engineer 这个 title 几乎是 dbt 一手催生的。工具改变了哪些人能干哪些事。
4. **开源 + SaaS 双轨**：dbt-core 免费撑生态，dbt Cloud 收 SaaS 钱（IDE / 调度 / SSO）——是 2018 年后开源商业化的标准玩法。
5. **承认自己不做的事**：dbt 明确拒绝做调度、做 ingestion、做 BI——这种"狭窄定义"反而让它在生态里站稳。同期一些"什么都做"的工具反而活得艰难。

## 延伸阅读

- 官方教程：[dbt Learn — Fundamentals](https://learn.getdbt.com/)（免费，4 小时建一个完整项目）
- 创始人长文：[Tristan Handy — The Modern Data Experience](https://roundup.getdbt.com/p/the-modern-data-experience)
- 源码：[dbt-labs/dbt-core](https://github.com/dbt-labs/dbt-core)（Python，看 `core/dbt/parser/` 理解 ref 解析）
- 对照阅读：[SQLMesh 和 dbt 的差异](https://sqlmesh.com/blog/dbt-comparison)（增量推断、Python model）

## 关联

- [[airflow]] —— 最常见的 dbt-core 调度上游：Airflow 触发 `dbt run`
- [[duckdb]] —— dbt-duckdb adapter 让本地笔记本就能跑 dbt 学习
- [[snowflake]] —— dbt 和 Snowflake 在 2019-2024 是最常见的搭配
- [[great-expectations]] —— 数据质量框架，和 dbt 测试是互补关系（GE 更通用、dbt test 更轻）
