---
title: DuckDB — 嵌入式列存 OLAP
来源: https://github.com/duckdb/duckdb
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

DuckDB 是 CWI（阿姆斯特丹国家数学与计算机研究中心）团队从 2019 年开始用 C++ 写的 **"列式 SQLite"**——一个单文件、嵌入式、专门做分析查询（OLAP）的数据库。

日常类比：

- [[sqlite]] 是抽屉里的工作手册——事务好、写入快、但每次"统计上个月所有订单"它要逐行翻
- DuckDB 是装在同一个抽屉里的列式分析机——同样不需要服务器，但聚合、扫描、连接快上百倍

它不是要替代 SQLite（事务型）或者 [[postgresql]]（通用型），而是补一个之前没人做的位置：**单机、嵌入式、专做分析**。

## 为什么重要

不理解 DuckDB，下面这些事都没法解释：

- 为什么过去两年数据科学界突然把它捧成爆款——Pandas 和 Polars 都加了 DuckDB SQL 后端
- 为什么"一个 binary，无服务器"还能比 [[postgresql]] 单机分析快十倍
- 为什么 CSV/Parquet 文件可以直接当表查，不需要先 import
- 为什么和 [[clickhouse]] 同样是列存，定位完全不同

## 核心要点

DuckDB 的"快"建立在三个选择上：

1. **列式存储**：传统数据库一行一行存（行式），统计 `SELECT avg(price)` 要把每行整条读出来。列式把同一列的所有值连续存——只读 price 这一列，IO 量直接砍掉 90%。这点和 [[clickhouse]] 同源。

2. **向量化执行（Vectorized Execution）**：传统执行引擎一次处理一行（"火山模型"），函数调用开销大。DuckDB 一次处理一批（向量，约 2048 行），CPU cache 友好、能用 SIMD 指令并行算。

3. **嵌入式**：和 [[sqlite]] 一样，DuckDB 是一个 lib，不是服务器。Python 里 `pip install duckdb` 就能用，没有端口、没有进程、没有运维。C/C++/Python/JS/Rust/R/Java 都有 binding。

加分项：**直接读外部文件**——CSV、JSON、Parquet、甚至 [[postgresql]] / MySQL 表都能当成 DuckDB 的表查，零 ETL。

## 实践案例

### 案例一：Python 里直接 SQL 查 CSV

```python
import duckdb

# 不需要 load 进 DataFrame，直接查
result = duckdb.sql("SELECT category, avg(price) FROM 'sales.csv' GROUP BY category").df()
```

这段代码做了三件事：

- 解析 `sales.csv` 的 schema（自动推断列类型）
- 列式读取（只读 category 和 price 两列，跳过其他列）
- 返回 Pandas DataFrame

对比传统做法 `pd.read_csv` 后再聚合——DuckDB 在大文件（GB 级）上经常快 5-10 倍。

### 案例二：CLI 直接查 S3 上的 Parquet

```bash
duckdb mydb.duckdb -c "SELECT count(*) FROM read_parquet('s3://bucket/logs/*.parquet')"
```

`read_parquet` 是 DuckDB 内置函数，支持通配符、HTTP、S3。不需要先下载、不需要 import，**SQL 就是 ETL**。这种用法在数据工程圈很受欢迎，常用来做"一次性大数据探索"。

### 案例三：和 Pandas 互操作

```python
import pandas as pd
import duckdb

df = pd.read_csv("orders.csv")
con = duckdb.connect()
con.register("orders", df)  # 把 DataFrame 当表注册

result = con.execute("""
    SELECT customer_id, sum(amount)
    FROM orders
    WHERE date >= '2025-01-01'
    GROUP BY customer_id
""").df()
```

`register` 是零拷贝——DuckDB 直接读 Pandas 的内存布局，不复制数据。这是 Polars / Pandas 都拥抱 DuckDB 的关键：**不抢用户的 DataFrame，做它擅长的 SQL 那部分**。

## 踩过的坑

1. **多线程默认开但有时不生效**：DuckDB 默认用所有核心，但单 query 太小或数据太分散时调度反而拖慢。可以 `SET threads=1` 对照测试。

2. **大数据集要设 memory_limit**：默认会把中间结果留在内存，超过 RAM 直接 OOM。生产环境一定 `SET memory_limit='4GB'`，超出就自动 spill 到磁盘。

3. **SQL 方言和 PostgreSQL 不完全一致**：DuckDB 大体兼容 PostgreSQL，但一些函数名、日期处理细节有差异。比如 `date_trunc` 参数顺序、字符串拼接行为。从 PG 迁移过来要逐条测。

4. **Parquet 写入分区策略要手动指定**：`COPY ... TO 'output' (FORMAT 'parquet', PARTITION_BY (year, month))` 必须显式声明分区列，否则就是单文件。和 Spark 写 Parquet 的默认行为不同。

## 适用 vs 不适用场景

**适用**：

- 数据科学家本地分析（CSV / Parquet / Pandas）
- 单机 OLAP 探索（< 1TB 数据）
- 嵌入到应用里做"内置分析模块"——比如 BI 工具、笔记应用
- 替代 SQLite 做"读多写少的分析报表"
- 替代部分 Spark 单机场景（数据 < RAM × 10）

**不适用**：

- 高并发事务型场景（用 [[postgresql]] 或 [[sqlite]]）
- 跨机器分布式分析（用 [[clickhouse]] / Spark / Trino）
- 需要严格 ACID 多用户写入（DuckDB 是单写多读）
- 实时流处理（DuckDB 是批处理，没有 streaming）

## 历史小故事（可跳过）

- **2019 年**：CWI 的 Mark Raasveldt 和 Hannes Mühleisen 启动项目。他们的观察是——数据科学家 90% 的时间用 Pandas，但 Pandas 在大数据上慢；同时数据库领域的列存技术（C-Store / [[clickhouse]] / Vectorwise）已经成熟，但都是服务器型。把列存做成嵌入式有市场。
- **2021 年**：v0.2 发布，Python binding 成熟，开始在数据科学圈传播。
- **2023 年**：v0.10 加 Iceberg 表格式支持，进入数据湖生态。
- **2024 年 6 月**：v1.0 GA（Generally Available），稳定 API 和文件格式。
- **2024 年 12 月**：DuckDB Cloud（managed 服务）公测，开始商业化。

## 学到什么

- **嵌入式数据库不只能做事务**——SQLite 占了"事务嵌入式"，DuckDB 占了"分析嵌入式"，是补全而非替代
- **列存 + 向量化** 是过去十年 OLAP 数据库的共同选择（[[clickhouse]] / Snowflake / BigQuery 都是这个思路）
- **零 ETL** 是趋势——直接查 CSV/Parquet/远端表的能力比"先 import 再查"对用户友好得多
- **小而精胜过大而全**——DuckDB 团队明确说"我们不做事务、不做分布式、不做流处理"，反而做出了独特的位置

## 延伸阅读

- 官方文档：[duckdb.org/docs](https://duckdb.org/docs/)（教程结构清晰，从 CLI 到 Python 全覆盖）
- 论文：[DuckDB: an Embeddable Analytical Database, SIGMOD 2019](https://hannes.muehleisen.org/publications/SIGMOD2019-demo-duckdb.pdf)（4 页演示论文，讲设计取舍）
- 视频：[Mark Raasveldt — Inside DuckDB](https://www.youtube.com/watch?v=bZOvAKGkzpQ)（CMU 数据库讲座，讲架构细节）
- [[sqlite]] —— 嵌入式数据库的鼻祖，DuckDB 的对照系
- [[clickhouse]] —— 同样是列存，但走分布式服务器路线
- [[postgresql]] —— 传统行存通用数据库，DuckDB 经常和它互补使用

## 关联

- [[sqlite]] —— 同样嵌入式，但偏事务；DuckDB 偏分析
- [[postgresql]] —— DuckDB SQL 方言的主要参照，和 PG 单机分析做对比
- [[clickhouse]] —— 同样列式向量化，但 CH 是分布式服务器、DuckDB 是嵌入式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arrow]] —— Apache Arrow — 内存列式标准
- [[arrow-rs]] —— arrow-rs — Apache Arrow / Parquet 的 Rust 参考实现
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[dbt-core]] —— dbt-core — 把 SQL 当工程代码写，让数据仓库里的转换跑起来
- [[duckdb-wasm]] —— duckdb-wasm — 把分析数据库塞进浏览器标签页
- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
- [[lance]] —— Lance — AI 数据列存格式
- [[lightdash]] —— Lightdash — 寄生在 dbt 项目里的开源 BI
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[starrocks]] —— StarRocks — MPP 列存数据库

