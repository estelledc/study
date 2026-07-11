---
title: Apache Arrow — 内存列式标准
来源: 'https://github.com/apache/arrow'
日期: 2026-06-01
分类: 数据库
难度: 中级
---

## 是什么

Apache Arrow 是一份**跨语言通用的列式内存格式规范**——它规定了"一张表在内存里应该长什么样"，让 C++ / Rust / Java / Python / Go / JS 等语言**指着同一段内存读出同一张表**，不需要序列化/反序列化。

日常类比：从前每两个国家的火车轨距不同，过境得换车头；Arrow 是把全世界轨距统一成一个标准，列车直接开过去。

它解决的根本问题是 **N × M 转换爆炸**——10 个数据系统两两互通，原本要写 90 套编解码器；约定一个共同格式后，每个系统只写"读 Arrow / 写 Arrow"两条路，复杂度从 N × M 压成 N + M。

```
传统：pandas ↔ Spark ↔ DuckDB ↔ Polars ↔ R   ← 每对都要序列化
Arrow：pandas → Arrow ← Spark / DuckDB / Polars / R   ← 共享内存
```

仓库 `apache/arrow` 主要内容：

- `cpp/` —— C++ 参考实现，Rust / Java / Go 都对照它的语义
- `format/` —— Flatbuffers schema 定义，是真正的"标准"
- `python/` —— PyArrow 绑定（已另有笔记 [[pyarrow]]）
- `rust/` —— 已迁出独立仓库 `apache/arrow-rs`，但语义仍同步

## 为什么重要

不理解 Arrow，下面几件事都解释不了：

- 为什么 [[duckdb]] 可以用 `SELECT * FROM arrow_table` 直接查 Python 进程里的 DataFrame，**0 ms 拷贝**
- 为什么 [[polars]] 选 Rust 重写却天然能跟 [[pandas]] 互通——它们底层都是 Arrow buffer
- 为什么 Spark `toPandas()` 在开 Arrow 之后从分钟级变秒级
- 为什么 [[clickhouse]] / Velox / DataFusion 等新查询引擎不再各设计内存模型，全部以 Arrow 为基

## 核心要点

Arrow 标准本身就三件事：

1. **列式 + null 位图**：每列一段连续 buffer，加一张 bitmap 标"哪格是空"。CPU 缓存命中率高，SIMD 直接能跑。

2. **Schema 是合同**：表头写明列名、类型、嵌套结构。读端按合同直接 cast，无需猜测。这跟 JSON / Pickle 那种"自描述但要解析"完全相反。

3. **零拷贝交换协议**：
   - **Arrow IPC**——同进程或同机器，直接共享内存指针
   - **Arrow Flight**——跨机器通过 gRPC 流，按 Arrow 原生帧传，省去 protobuf 转换
   - **ADBC**——把 JDBC/ODBC 那套"逐行拉数据"的接口换成"按 Arrow 列拉"，驱动层就快几十倍

类比：列存是仓库货架，Schema 是货品清单，IPC/Flight/ADBC 是不同距离的搬运方式。

## 实践案例

### 案例 1：DuckDB 直接查 Python 内存里的表

```python
import duckdb, pyarrow as pa

table = pa.table({"city": ["BJ", "SH", "GZ"], "sales": [100, 250, 180]})
duckdb.sql("SELECT city, sales FROM table WHERE sales > 150").show()
```

DuckDB **没把数据搬进自己的存储**，它读到 `table` 是 Arrow Table，直接对那段内存跑列向量查询。这就是 Arrow 最具代表性的红利——**容器与引擎解耦**。

### 案例 2：Arrow Flight 跨机器流大表

```python
import pyarrow.flight as flight

client = flight.connect("grpc://data-server:8815")
ticket = flight.Ticket(b"trips_2026")
reader = client.do_get(ticket)
table = reader.read_all()
```

Flight 在 gRPC 之上跑 Arrow 原生帧，**省去 protobuf 编解码**。同样千万行数据，Flight 比传统 ODBC + CSV 快 10 倍以上。

### 案例 3：ADBC 替代 ODBC

```python
import adbc_driver_postgresql.dbapi as pg

conn = pg.connect("postgresql://...")
cur = conn.cursor()
cur.execute("SELECT * FROM events WHERE date >= '2026-05-01'")
table = cur.fetch_arrow_table()
```

传统 ODBC 一行行返回，Python 侧再装回 DataFrame。ADBC 让数据库**直接吐 Arrow 列**，少两次格式转换。Postgres / Snowflake / DuckDB 都已支持。

## 踩过的坑

1. **Arrow 是格式不是引擎**——它本身没有 `groupby` / `join`，要算东西得交给 [[duckdb]] / [[polars]] / DataFusion。新人常误以为它能替代 pandas。

2. **零拷贝有前提**——只有 fixed-width 列（int / float）真零拷贝；string / list / null 位图不齐时仍要复制。读 [[pandas]] `to_pandas()` 文档的 zero-copy 章节再下定论。

3. **跨版本 schema 不严格兼容**——Arrow 1.x → 2.x 少数嵌套类型 layout 微调，旧文件用新库读偶尔报 InvalidSchema。生产管线务必锁版本。

4. **小数据反而更慢**——列式格式有 buffer 对齐和 metadata 开销，几百行的小表比 dict 还重。Arrow 的甜区是"百万行起"。

## 适用 vs 不适用场景

**适用**：

- 多个系统/语言之间传大表（pandas ↔ Spark ↔ R ↔ DuckDB）
- 列式 OLAP 引擎的内存模型（[[duckdb]] / [[clickhouse]] / DataFusion / Velox）
- 大批量 Parquet / Feather / IPC 文件读写
- 跨机器查询服务（Flight 取代 ODBC）

**不适用**：

- 想做 OLTP 行级更新——列存改一格要重建 buffer
- 小表 / 一次性脚本——开销不划算
- 需要 schemaless 任意嵌套——Arrow 必须先有 schema
- 直接当查询语言用——它没有 SQL，只是数据容器

## 历史小故事（可跳过）

- **2015 年**：[[pandas]] 作者 Wes McKinney 在博客《10 Things I Hate About pandas》指出"内存格式不统一"是数据栈最大瓶颈。
- **2016 年**：Wes 联合 Dremio 的 Jacques Nadeau、Cloudera 的几位核心，把 Arrow 立项为 Apache 顶级项目，第一版定下列存 + null 位图 + IPC。
- **2018-2020 年**：Spark / Dremio / Influx 接入 Arrow；[[polars]] / DataFusion / Velox 直接拿 Arrow 当原生内存模型。
- **2022 年**：Arrow Flight SQL 与 ADBC 出炉，瞄准 ODBC/JDBC 二十年的统治。
- **2023 年**：[[pandas]] 2.0 提供 Arrow-backed dtype，事实承认 Arrow 是默认底层。

## 学到什么

1. **标准化打败性能**——Arrow 不是最快的格式，但因 N + M 替代 N × M 成为事实标准
2. **格式 vs 引擎要分清**——容器（Arrow）拿数据，引擎（DuckDB / Polars）算数据，层次拆开后生态爆发
3. **零拷贝是接口红利**——同一段内存被多个系统共享，是过去十年最大的性能"白嫖"
4. **从内存到协议再到驱动**——Arrow 的扩张路径：内存格式 → IPC → Flight → ADBC，一步步把上下游都吃掉

## 延伸阅读

- 官方文档：[Apache Arrow](https://arrow.apache.org/docs/) —— format / IPC / Flight / ADBC 的权威入口
- Wes McKinney 回顾：[Apache Arrow and the 10 Things I Hate About pandas](https://wesmckinney.com/blog/apache-arrow-pandas-internals/) —— 讲为什么造 Arrow
- 视频：[Voltron Data — Arrow and the Future of Data Systems](https://www.youtube.com/watch?v=YSlZL-uHZRg)
- 论文角度：[The Composable Data Management System Manifesto (VLDB 2023)](https://www.vldb.org/pvldb/vol16/p2679-pedreira.pdf) —— Arrow 在新一代数据系统中的位置
- [[cstore-2005]] —— Arrow 列存布局的学术祖宗

## 关联

- [[pyarrow]] —— Apache Arrow 的 Python 入口，本笔记的具体语言绑定
- [[duckdb]] —— 进程内 OLAP 引擎，把 Arrow 当输入输出标准
- [[polars]] —— Rust 列存 DataFrame，原生用 Arrow 内存格式
- [[pandas]] —— 2.0 起底层可切到 Arrow
- [[clickhouse]] —— OLAP 列存数据库，与 Arrow 共享列向量化思想
- [[cstore-2005]] —— C-Store 列存奠基论文，Arrow 内存布局的理论源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[columnar-storage-formats-2023]] —— Columnar Storage Formats 2023 — Parquet/ORC 的体检报告
- [[velox-meta-2022]] —— Velox — Meta 统一执行引擎
- [[arrow-rs]] —— arrow-rs — Apache Arrow / Parquet 的 Rust 参考实现
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
