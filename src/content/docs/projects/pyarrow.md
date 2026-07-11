---
title: PyArrow — 让所有数据系统共用一块内存
来源: 'https://github.com/apache/arrow'
日期: 2026-05-30
分类: data-science-ai
难度: 中级
---

## 是什么

PyArrow 是 **Apache Arrow 的 Python 入口**——它让 pandas、Polars、DuckDB、Spark、R 这些原本各说各话的系统**指着同一块内存**读数据，谁都不用复制一份给对方。

日常类比：从前每两家公司合作都得各印一份合同，10 家公司就 90 份；Arrow 是把合同放在公证处，**所有人都看同一份原件**。

底层只有两件事：

- **列式内存格式**——同一列的所有值在内存里**连续放**，不是按行混在一起。CPU 和 SIMD 喜欢这种连续。
- **Arrow IPC**——把这块内存的"摆放规则"写成标准。任意语言只要照规则读，就能直接拿数据，不用解 JSON、不用 unpickle。

PyArrow 在这两件事之上，额外提供 Python 直接可用的 Parquet / CSV 读写、内存映射、zero-copy 与 pandas / Polars 互转。

```python
import pyarrow as pa

table = pa.table({"city": ["BJ", "SH", "GZ"], "temp": [22, 25, 30]})
print(table.schema)
```

输出会显示每列的类型（`string` / `int64`），这就是 Arrow 比 Python list / dict **必须先有 schema** 的体现——schema 是零拷贝交换的合同。

## 为什么重要

不理解 Arrow，下面几件事就解释不了：

- 为什么 [[pandas]] 2.0 起多了 `dtype_backend="pyarrow"`，读 Parquet 突然快几倍
- 为什么 [[polars]] / [[duckdb]] 直接就能 `pl.from_arrow(table)` / `duckdb.sql("FROM arrow_table")`，不需要中间转 dict
- 为什么 Spark `toPandas()` 加了 `spark.sql.execution.arrow.pyspark.enabled` 之后能从分钟变秒
- 为什么 LLM / RAG 的 embedding 落盘越来越多用 Parquet 而不是 pickle/CSV

## 核心要点

PyArrow 干的事可以拆成三层：

1. **列存内存（Array / Table）**：每列是一段连续 buffer + 一张"哪格是空"的位图（null bitmap）。整张表是若干 column 拼起来，不是 NumPy 那种 ndarray。

2. **零拷贝交换**：buffer 是引用计数的"堆外内存"。pandas 调 `Table.to_pandas()`、Polars 调 `pl.from_arrow()` 时，**只复制 pointer，不复制数据**——前提是类型对得上。

3. **文件 / 网络 I/O**：`pyarrow.parquet` / `pyarrow.csv` / `pyarrow.dataset` 直接吐 Arrow Table；`pyarrow.flight` 把 Arrow 通过 gRPC 流出去，跨机器也零拷贝。

类比：列存是"一栋公寓每层一种房型"，零拷贝是"邻居家来串门看电视而不是搬一台一样的回家"，I/O 是"快递柜门口直接装载"。

## 实践案例

### 案例 1：读 Parquet 只取需要的列

```python
import pyarrow.parquet as pq

table = pq.read_table("sales.parquet", columns=["region", "amount"])
print(table.num_rows, table.schema)
df = table.to_pandas()
```

**为什么快**：Parquet 本来就是列存，PyArrow 只读这两列对应的 buffer，剩下几十列**根本不进内存**。这叫**列裁剪**（projection pushdown）。

### 案例 2：pandas ↔ Arrow ↔ Polars 的零拷贝桥

```python
import pandas as pd
import pyarrow as pa
import polars as pl

pdf = pd.DataFrame({"x": [1, 2, 3], "y": [0.1, 0.2, 0.3]})
table = pa.Table.from_pandas(pdf)        # pandas → Arrow
plf = pl.from_arrow(table)               # Arrow → Polars，零拷贝
back = plf.to_arrow().to_pandas()        # 转回 pandas
```

`pl.from_arrow` 这一步**不复制数据**——Polars 拿到的就是 PyArrow 同一份 buffer 指针。这就是 [[polars]] / [[duckdb]] 能跟 pandas 即插即用的关键。

### 案例 3：dataset API + 谓词下推

```python
import pyarrow.dataset as ds

dataset = ds.dataset("logs/", format="parquet", partitioning="hive")
table = dataset.to_table(
    columns=["user_id", "ts", "action"],
    filter=(ds.field("date") == "2026-05-01") & (ds.field("action") == "buy"),
)
```

`logs/date=2026-05-01/...` 这种 hive 分区目录，PyArrow 只扫匹配的子目录；`filter` 里的条件会下推到 Parquet 的 row group 级别，**不匹配的整段不解码**。这跟自己写循环读全量再 filter 完全是两个数量级。

## 踩过的坑

1. **把 Table 当 DataFrame 用**——Arrow Table 没有 `.iloc / .loc / groupby`，它只是个**容器**。要算东西得交给 pandas / [[polars]] / [[duckdb]]。新手常误以为 PyArrow 是 pandas 的替代品。

2. **`to_pandas()` 不一定零拷贝**——带 `null` 的 int 列、字符串列、嵌套类型都会**复制一份**。真正零拷贝要用 pandas 2.0 的 Arrow-backed dtype 或直接换 Polars。

3. **Schema 不一致直接报错**——`pa.concat_tables` 要求列名 + 类型完全一致，`int32` 拼 `int64` 会 ArrowInvalid，不像 pandas 那样静默升级。批量入库前最好显式 `cast`。

4. **`write_dataset` 分区基数失控**——按 `user_id` 分区写出来可能是几万个小文件，S3/HDFS 一查 list 就慢。要么按粗粒度（日期/省份）分区，要么用 `max_partitions` / `max_open_files` 兜底。

## 适用 vs 不适用场景

**适用**：

- 多个 Python 库（pandas / [[polars]] / [[duckdb]] / [[scipy]] sparse）之间传大表
- 读写 Parquet / Feather / Arrow IPC，特别是要列裁剪 + 谓词下推
- 跨进程 / 跨语言交换（Spark ↔ Python、R ↔ Python、子进程间用共享内存避开 pickle）
- LLM 训练数据 / 向量落盘的列存格式

**不适用**：

- 想直接做分析查询——PyArrow 没 join / window / 复杂 groupby，请用 [[duckdb]] 或 [[polars]]
- 行级频繁更新——列存改一格要重建一段 buffer，不适合 OLTP
- 小数据 + 一次性脚本——直接 pandas / [[numpy]] 更省心
- 需要 Python list / dict 那种"任意嵌套"的 schemaless 数据——Arrow 要求显式 schema

## 历史小故事（可跳过）

- **2008-2015**：[[pandas]] 作者 Wes McKinney 发现内存碎片化、跨语言传数据是行业通病——每对 (源, 目标) 都要写一对编解码器，`N × M` 的复杂度。
- **2016 年**：Wes 和 Dremio 的 Jacques Nadeau 等人把 Apache Arrow 作为 Apache 顶级项目立项，定下"列存 + 零拷贝 + 跨语言"三件事。设计上吸收了 [[cstore-2005]] 的列存思想。
- **2018-2020 年**：Spark 的 `arrow-pyspark` 走通；Dremio / Influx 的查询引擎切到 Arrow；[[polars]] / DataFusion / Velox 直接以 Arrow 为内存模型。
- **2023 年**：[[pandas]] 2.0 把 Arrow-backed dtype 设为可选后端，承认 "用 Arrow 做底层" 是默认未来。

## 学到什么

1. **格式标准化的威力**——把 N×M 的编解码问题压成 N+M，10 家系统不再各印合同
2. **列存 + 零拷贝是正交的两件事**——列存利好向量化计算，零拷贝利好系统集成，两个一起才有 Arrow 的红利
3. **"容器 vs 引擎" 要分清**——Arrow 是容器（拿数据），DuckDB / Polars 是引擎（算数据）
4. **生态绑定 > 单点性能**——Arrow 不是最快的格式，但因为大家都用，反而成了事实标准

## 延伸阅读

- 官方文档：[Apache Arrow Python](https://arrow.apache.org/docs/python/) —— Table / Array / IPC / dataset API 的权威入口
- Wes McKinney 的回顾：[Apache Arrow and the "10 Things I Hate About pandas"](https://wesmckinney.com/blog/apache-arrow-pandas-internals/) —— 讲为什么造 Arrow
- 视频：[High Performance Python with Apache Arrow (PyCon 2022)](https://www.youtube.com/watch?v=mP1tg8mgIcI) —— 跨库零拷贝演示
- Parquet 协同：[Querying Parquet with Millisecond Latency](https://www.influxdata.com/blog/querying-parquet-millisecond-latency/) —— 看 dataset + 谓词下推怎么压时延
- [[cstore-2005]] —— PyArrow 列存设计的学术祖宗

## 关联

- [[pandas]] —— Python 表格事实标准；2.0 起底层可切到 Arrow
- [[polars]] —— Rust 写的列存 DataFrame，原生用 Arrow 内存格式
- [[duckdb]] —— 进程内 OLAP 引擎，把 Arrow 当输入输出标准
- [[numpy]] —— Arrow 之前的"准事实标准"内存格式，但只有数值、没字符串/null 位图
- [[scipy]] —— 数值科学栈邻居，与 Arrow 互补：scipy 算法 + Arrow I/O
- [[cstore-2005]] —— 列存数据库奠基论文，Arrow 内存布局的理论源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

