---
title: DuckDB — 把 OLAP 数据库塞进你的 Python 进程
来源: 'Raasveldt & Mühleisen, "DuckDB: an Embeddable Analytical Database", SIGMOD 2019 demo'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

DuckDB 是一个**嵌入到你程序里跑的分析数据库**。日常类比：SQLite 是给笔记应用用的"装在 App 内的小数据库"，但它专门擅长一行一行处理；DuckDB 是它的"分析师亲戚"——一样塞进进程内、不需要起服务器，但专门擅长**一列一列扫几百万行做汇总**。

你写：

```python
import duckdb
duckdb.query("SELECT category, AVG(price) FROM 'sales.parquet' GROUP BY category").df()
```

没有连接字符串、没有起服务、没有 docker。这一行代码读了 1GB Parquet 文件，做了分组聚合，把结果给回 Pandas DataFrame。

这个"嵌入式 + 专做分析"的组合是 DuckDB 的核心定位——SIGMOD 2019 论文叫它 "**OLAP 版的 SQLite**"。

## 为什么重要

不理解 DuckDB 的设计动机，下面这些事会觉得奇怪：

- 为什么 2024 年 Pandas 用户开始集体迁移过去——明明 Pandas 已经够用了
- 为什么 Notebook 里跑个 SQL 不需要先连 PostgreSQL
- 为什么同样一份 Parquet，DuckDB 比 SQLite 快 50 倍
- 为什么数据工程师面试现在会问 "向量化执行 vs 火山模型 (Volcano) 区别"

数据科学日常痛点是：数据 1-100GB 这一档——比 Pandas 内存放得下的大、比上 Spark 集群划得来的小。DuckDB 就是为这一档生的。

## 核心要点

DuckDB 三个支柱合起来才解释它为什么快又好用：

1. **列式存储**（columnar）：表在磁盘和内存里按"列"存，不是按"行"。类比：Excel 把一整列工资数字连续放在一起，求平均时只扫这一列、不会顺路读姓名地址。这是分析查询能压缩、能向量化的前提。

2. **向量化执行**（vectorized execution）：每次操作处理一个 "vector"（≈ 1024-2048 个值的小批），而不是火山模型那样一次一行。类比：搬砖时一次抱 2000 块（vector）效率远高于一次抱 1 块（row）也远好于一次抱 100 万块（column-at-a-time，缓存装不下）。这一招出自 [[monetdb-x100-2005]]。

3. **嵌入式 in-process**：DuckDB 是一个 .so / .dll 库，被你 Python / R / C++ 进程直接 link。不像 PostgreSQL 要起 daemon，调用就是普通函数，零网络开销。

加上 ACID 事务（自定义 MVCC）、SQL-92 大部分支持、可直接读 Parquet/CSV/Arrow。

## 一图看懂三层结构

```
你的 Python 程序进程
┌──────────────────────────────────┐
│ Pandas / PyArrow / 业务代码      │
│        ↕  零拷贝（同进程）       │
│ ┌──────────────────────────────┐ │
│ │ DuckDB 查询引擎              │ │
│ │  ├─ SQL parser + 优化器       │ │
│ │  ├─ vectorized executor       │ │
│ │  └─ MVCC 事务                 │ │
│ └──────────────────────────────┘ │
│        ↕                          │
│ ┌──────────────────────────────┐ │
│ │ 列式存储 (单文件 .duckdb)    │ │
│ │ 也能直接读 Parquet/CSV/Arrow │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

注意整个数据库是**进程内的几个对象**，不是另一个服务。

## 实践案例

### 案例 1：Pandas DataFrame 当 SQL 表查

```python
import duckdb
import pandas as pd
df = pd.read_csv("orders.csv")
result = duckdb.query("SELECT user_id, SUM(amount) FROM df GROUP BY user_id").df()
```

注意：`df` 直接出现在 SQL 里——DuckDB 在同一进程里能"看见"Python 变量。**没有任何数据复制**，DuckDB 直接读 Pandas 内存。这是嵌入式带来的核心便利。

### 案例 2：直接查 Parquet 文件

```python
duckdb.query("SELECT * FROM 'data/2024-*.parquet' WHERE region='APAC'").df()
```

DuckDB 边读边过滤（predicate pushdown），只解码需要的列（projection pushdown）。1GB 文件可能只读出几十 MB。中等规模 ETL 任务可以替代 Spark。

### 案例 3：CLI 当本地数据治理工具

```bash
duckdb -c "SELECT count(*), region FROM read_csv('logs.csv') GROUP BY region"
```

像 awk / jq 一样在命令行里写 SQL 处理本地文件，不开 Python 也行。

### 案例 4：Wasm 浏览器内分析

DuckDB 编了 Wasm 版本，可以在浏览器里直接跑分析查询。OpenAI 的某些数据看板、Hugging Face datasets 预览都用了它。这是真正"嵌入式"的极限——连服务器都没有。

## 踩过的坑

1. **当 OLTP 数据库用就翻车**：DuckDB 是单写多读的 OLAP 引擎，并发写入吞吐远不如 PostgreSQL/MySQL。Web 后端用户表请用别的，DuckDB 适合分析查询。

2. **超出单机就该换工具**：DuckDB 是单机嵌入式，没有分布式。数据量稳定超过几百 GB、需要副本/分片，就该上 ClickHouse / Snowflake。

3. **以为"列存自动比行存快"**：列存只在大量行扫描+少数列聚合时占优。**点查询**（按主键取一行）反而行存更快。要看负载选工具。

4. **大文件没设并发**：默认 threads 数有时候不够。`SET threads TO 8` 一行让查询快几倍，但容易忘。

5. **嵌入式 ≠ 玩具**：很多人看到"单文件、单进程"就以为像 SQLite 一样只能跑小数据。实际 DuckDB 在 100GB Parquet 上常规聚合也能秒级返回。

## 适用 vs 不适用

**适用**：
- Notebook / 脚本里做 SQL 分析（取代 Pandas + 取代起 PG）
- 中等规模 ETL（大约 1–100GB，单机磁盘舒适区；再大要看内存/磁盘与并发写入模式）
- 嵌入到桌面 / 移动 / Wasm 应用做本地分析（单文件库，跨平台）
- 直接读 Parquet/Arrow 做数据科学预处理

**不适用**：
- 高并发 OLTP 写入（用 PostgreSQL / MySQL）
- 分布式或稳定超过几百 GB、需要副本/分片的大数据（用 ClickHouse / Snowflake / BigQuery）
- 需要严格服务隔离/多租户（嵌入式天然没隔离）
- 全文搜索（用 Elasticsearch / Postgres FTS）

## 历史小故事（可跳过）

- **2005 年**：CWI 数据库组在 [[monetdb-x100-2005]] 论文提出"向量化执行"，证明可以比一次一行快十倍以上，后来商业化为 Vectorwise。
- **2017 年**：Hannes Mühleisen 在 R 社区做 MonetDBLite——把 MonetDB 改成嵌入式版本——发现 MonetDB 太重、不适合嵌入。
- **2018 年**：Mühleisen 与博士生 Mark Raasveldt 决定**从零开始**写一个嵌入式分析数据库，吸收 MonetDB/X100 向量化思路。命名 DuckDB（CWI 园区有只鸭子吉祥物 Wilbur）。
- **2019 年**：SIGMOD 2019 demo 论文（4 页）发布。
- **2020 年**：CIDR 2020 全文版进一步阐述存储与执行。
- **2022 年**：成立 DuckDB Labs（开源 + 商业支持双轨）。
- **2024 年**：在 Python 数据栈生态里成为最常用嵌入式分析引擎，Pandas 用户大规模迁移。

## 学到什么

1. **嵌入式不等于小**：SQLite 让人觉得嵌入式 = 玩具，DuckDB 用 100GB 级数据证明嵌入式可以是认真的分析工具。
2. **列式 + 向量化是一对**：单独列式（C-Store）和单独向量化（早期 Vectorwise）都厉害，但 DuckDB 把两者工程化合在一起塞进库里才真正普及。
3. **找对部署摩擦的痛点**：DuckDB 的最大胜利不是性能而是"不用起服务"——降低部署门槛常比性能优化收益更大。
4. **学院派也能赢工程**：CWI 这种研究机构持续 20 年（MonetDB → X100 → MonetDBLite → DuckDB）演进同一思路，最终改变了一个生态。

## 延伸阅读

- 官方主页：[duckdb.org](https://duckdb.org/) — 入门 5 分钟
- 论文 PDF：[DuckDB SIGMOD 2019 demo](https://duckdb.org/pdf/SIGMOD2019-demo-duckdb.pdf)（4 页，密度高）
- 长版论文：DuckDB CIDR 2020（讲存储格式、MVCC 实现）
- 视频：Hannes Mühleisen 在多个数据库会议讲 DuckDB 设计取舍，YouTube 搜 "DuckDB Hannes" 即可
- [[monetdb-x100-2005]] —— DuckDB 向量化执行的思想源头
- [[volcano-1994]] —— 火山模型，一次一行的迭代器，DuckDB 用 vector 替换了"行"
- [[cstore-2005]] —— Stonebraker 列存原创论文，DuckDB 存储设计的另一支祖先

## 关联

- [[monetdb-x100-2005]] —— 向量化执行的开山之作，DuckDB 直接继承
- [[volcano-1994]] —— pull-based 迭代器模型，DuckDB 在它基础上把粒度改成 vector
- [[cstore-2005]] —— 列存数据库经典，DuckDB 存储格式的祖先
- [[vertica-2012]] —— C-Store 商业化，列存在工业界的代表
- [[snowflake-2016]] —— 云上分布式 OLAP，与 DuckDB 互补（云 vs 嵌入式）
- [[leis-2015-optimizers]] —— 现代查询优化器评测，DuckDB 的优化器吸收了这条线
- [[stonebraker-2010-sqlnosql]] —— 同期数据库格局讨论
