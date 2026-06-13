---
title: Polars — Rust 写的列存 DataFrame
来源: 'https://github.com/pola-rs/polars'
日期: 2026-05-30
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Polars 是一个**用 Rust 写的、列式存储的 DataFrame 库**，目标是替代 pandas 在大数据量下的单机分析。日常类比：pandas 像一台手动挡轿车，每挂一个档（每写一行 `df.xxx`）就立刻起步；Polars 像装了导航的自动挡——你先把整段路线告诉它，它帮你算出最短路径再一次性开过去。

核心三个东西：

- `DataFrame`——一张二维表，列存（一列连续放在内存，向量化和压缩友好）
- `LazyFrame`——只记下你要做什么，不立刻做，等你说 `.collect()` 才执行
- `Expression`——`pl.col("sales") * 2` 这种"对列的描述"，不是 Python 值，是查询计划的节点

底层走 [[cstore-2005]] 列存思路 + Apache Arrow 内存格式 + 多线程 + SIMD。所以你能写：

```python
import polars as pl
df = pl.scan_parquet("sales.parquet")           # lazy，没真读
result = (df.filter(pl.col("region") == "EU")
            .group_by("product").agg(pl.col("sales").sum())
            .collect())                          # 这一步才真的读+算
```

`scan_parquet` 不读文件、`filter`/`group_by` 不算数据，`collect()` 触发优化器把整链路看一眼，再一次性跑完。这就是和 pandas 的根本差别。

## 为什么重要

不理解 Polars，下面这些事都没法解释：

- 为什么 pandas 跑 1 亿行 groupby 要 30 秒，Polars 跑 5 秒——不是 Rust 比 Python 快，是查询优化器把无用读的列扔了
- 为什么数据科学圈 2023 起把 Polars 当 pandas 的"下一代"——它把 [[volcano]] 那套 SQL 优化器思想搬进了单机库
- 为什么 Hugging Face / NVIDIA 内部预处理大数据集都用它——单机就能塞下原本要起 Spark 集群的活
- 为什么写惯 pandas 的人换 Polars 头疼——没有 `.loc` / 没有行索引 / 表达式 API 完全不一样

## 核心要点

Polars 之所以快，可以拆成 **三层**：

1. **列式存储 + Arrow 内存格式**：每列连续放内存，CPU cache 友好、SIMD 能一次算 8 个数。pandas 表面是列存其实每列一个独立 NumPy 数组，跨列计算要跳着读。类比：列存像图书馆按"书脊朝外"排书，找同类型书一眼扫到；行存像把每本书横着叠，要找同类型得一本本翻。

2. **Lazy 查询优化**：写 `.scan_parquet().filter().group_by()` 时不真跑，攒成一棵计划树。`collect()` 之前优化器先做 **predicate pushdown**（filter 下推到 IO 阶段，少读文件）/ **projection pushdown**（只读用到的列）/ **common subplan elimination**（重复子查询合并）。pandas 完全 eager，每一行都立刻产生中间结果，没有优化空间。

3. **多线程 + SIMD 并行**：每个算子（filter / hash join / group by）内部用 Rayon 切成多个 chunk 并行跑。pandas 单进程单线程，一个 core 干活，剩下 7 个看着。

三层加起来 = SQL 优化器思路 + 列存 + 多核，结果就是 H2O.ai benchmark 上比 pandas 快 5-10x。

## 实践案例

### 案例 1：Lazy 模式 + 自动下推（Polars 的精髓）

```python
import polars as pl
result = (
    pl.scan_parquet("sales/*.parquet")          # 1. lazy 扫一堆 parquet
      .filter(pl.col("year") == 2024)            # 2. 加 filter
      .select(["region", "sales"])               # 3. 只要两列
      .group_by("region").agg(pl.col("sales").sum())
      .collect()
)
```

**逐部分解释**：

- `scan_*` vs `read_*`——前者 lazy，后者 eager；想吃优化必须用 scan
- 优化器看到 `select(["region","sales"])`，从 parquet 只读这两列（projection pushdown），其它列连碰都不碰
- 看到 `filter(year == 2024)`，把 filter 推进 parquet 读取（predicate pushdown），只解压 2024 的 row group
- `collect()` 触发执行，多线程跑 group_by

写法变了一点点，IO 量可能少 90%。pandas 写不出这种"先描述后执行"的链。

### 案例 2：表达式 API 一次算多列

```python
df = pl.DataFrame({"a": [1,2,3], "b": [10,20,30]})
df = df.with_columns(
    sum_ab = pl.col("a") + pl.col("b"),
    log_a  = pl.col("a").log(),
    rank_b = pl.col("b").rank(),
)
```

**逐部分解释**：

- `pl.col("a")` 是**表达式**，不是值——它返回一个"对 a 列的描述"
- `with_columns` 接收一堆表达式，规划器并行算所有派生列
- pandas 等价写法是 `df["sum_ab"] = df.a + df.b` 三次赋值——单线程顺序执行

表达式可以嵌套：`pl.col("a").filter(pl.col("b") > 5).sum()` 是一个完整的"过滤后求和"表达式，可以塞进 select 或 group_by 里。

### 案例 3：streaming 处理超内存数据

```python
result = (
    pl.scan_csv("huge_log.csv")           # 50GB 单文件
      .filter(pl.col("status") == 500)
      .group_by("endpoint").agg(pl.len())
      .collect(streaming=True)            # 流式跑，不全部加载
)
```

**逐部分解释**：

- `streaming=True` 让引擎分块读、分块算、最后聚合，内存峰值只跟 group_by 的 cardinality 有关
- pandas 必须 `read_csv(chunksize=...)` 自己手写循环；Polars 自动切
- 这是单机替代 Spark 的核心场景——8GB 内存的笔记本跑 50GB 日志

## 踩过的坑

1. **忘了 `.collect()`**：写完一长串 `scan_parquet().filter().group_by()` 直接 `print(df)`，输出是查询计划文本而不是数据。Polars LazyFrame 的 repr 是 plan，不是结果——必须 `.collect()` 拿 DataFrame。

2. **表达式上下文用错**：`pl.col("a") * 2` 单独写不会执行，必须放进 `select` / `with_columns` / `filter` / `group_by(...).agg` 之类的"上下文"里。新手写 `df.pl.col("a") * 2` 直接报 AttributeError。

3. **没有 pandas 的行索引**：pandas 的 `df.loc["beijing"]` 在 Polars 里不存在。Polars 把"行标签"看成一种 [[volcano-1994]] 风格的反模式，强制你用 `df.filter(pl.col("city") == "beijing")`。从 pandas 迁过来时这是最大思维转换。

4. **40 亿行上限**：默认 wheel 用 u32 索引，单表上限 2^32 ≈ 42 亿行。要更多得自己 `cargo build --features bigidx`。pip 装的版本撞到这个限会报神秘 panic，不是 Python 异常。

## 适用 vs 不适用场景

**适用**：

- 几千万到几十亿行、单机分析（laptop 32GB 能跑 Spark 集群规模的活）
- ETL：读一堆 parquet → filter / join / group_by → 写出
- pandas 跑不动但还不想起 Spark 的中间地带
- 想要 SQL 优化器但又不想离开 Python 的场景——和 [[duckdb-2019]] 同代友军

**不适用**：

- 已有 pandas 生态深度集成（matplotlib / scikit-learn 直接吃 ndarray）→ 转换成本可能不值
- 需要丰富的时间序列方法（pandas 的 resample / rolling 更成熟）
- 几千行小表 → pandas 启动更轻，Polars 的优化器开销反而显得多
- 完全 OLTP / 在线事务读写 → Polars 是分析引擎，不是数据库

## 历史小故事（可跳过）

- **2020 年**：荷兰能源工程师 Ritchie Vink 处理风电数据，pandas 慢得受不了，开始用 Rust + Arrow 写 Polars
- **2021 年**：从一个人项目变成开源社区，Python 绑定（py-polars）发布
- **2022 年**：H2O.ai DataFrame benchmark 把 Polars 推上风口——同样的 group_by，比 pandas / data.table 都快
- **2024 年**：1.0 稳定 API，pola.rs 公司成立做企业版；GitHub 31k star
- **2025 年**：和 [[duckdb-2019]] 双雄分别代表"DataFrame 风" vs "SQL 风"的单机分析新一代

## 学到什么

1. **Lazy + 优化器是核心**——速度快不是因为 Rust，是因为重复读和多余列被优化器砍掉了
2. **列存让 SIMD 落地**——同类型连续放内存，硬件向量指令能一次干 8 个；行存做不到
3. **没有索引也能活**——pandas 的标签索引看似方便其实拖累性能；Polars 强迫你显式 filter，反而更可预测
4. **单机 vs 集群的边界正在右移**——10 年前 1B 行必须 Spark，现在 Polars / DuckDB 在 laptop 上就能跑完

## 延伸阅读

- 官方用户指南：[Polars User Guide](https://docs.pola.rs/)（含 lazy/eager/streaming 三种模式对比）
- 视频：[Liquid Brain — Polars Crash Course](https://www.youtube.com/watch?v=CtqWj7QoX_g)（30 分钟从 pandas 切过来）
- 性能对比：[H2O.ai DataBench](https://duckdblabs.github.io/db-benchmark/)（Polars / DuckDB / pandas / data.table 横评）
- [[pandas]] —— 老一代 DataFrame 标准，先懂 pandas 再看 Polars 差异最清楚
- [[duckdb-2019]] —— 同代友军，SQL 风的单机分析引擎
- [[cstore-2005]] —— 列式存储起源，Polars 的内存布局直接来自这篇

## 关联

- [[pandas]] —— 上一代 DataFrame；Polars 是"列存 + lazy + 多线程"的重写版
- [[numpy]] —— pandas 的地基；Polars 跳过 NumPy 直接用 Arrow，这是性能差异的源头
- [[duckdb-2019]] —— 同代单机分析引擎；DuckDB 走 SQL 路线，Polars 走 DataFrame 路线
- [[cstore-2005]] —— 列式存储奠基；Polars 内存模型是它的现代实现
- [[monetdb-x100-2005]] —— 向量化执行引擎；Polars 的多线程算子继承这条线
- [[volcano]] / [[volcano-1994]] —— 火山模型查询执行；Polars 的 lazy 计划树是它的简化版
- [[clickhouse]] —— 同样列存 + 向量化思路，但 ClickHouse 是数据库，Polars 是嵌入式库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arrow]] —— Apache Arrow — 内存列式标准
- [[arrow-rs]] —— arrow-rs — Apache Arrow / Parquet 的 Rust 参考实现
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[dask]] —— Dask — 让 pandas / NumPy 直接跑在比内存大的数据上
- [[lance]] —— Lance — AI 数据列存格式
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[numpy]] —— NumPy — Python 科学计算基石
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[pyarrow]] —— PyArrow — 让所有数据系统共用一块内存
- [[scikit-learn]] —— scikit-learn — 经典 ML 库
- [[scipy]] —— SciPy — NumPy 之上的科学计算工具箱
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

