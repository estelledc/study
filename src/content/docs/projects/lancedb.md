---
title: LanceDB — 嵌入式向量库（进程内 + 对象存储）
来源: https://github.com/lancedb/lancedb
日期: 2026-06-01
分类: 数据检索 / 基础设施
难度: 中级
---

## 是什么

LanceDB 是 Chang She（前 pandas 核心成员）2022 年开源的**嵌入式向量数据库**。日常类比：你不需要为了存几本书专门盖一栋图书馆，找个书架放家里就够用——LanceDB 就是这种"放在你程序进程里、不另开服务"的向量库。

它做一件事：

- 像 SQLite 一样**进程内**调用（`import lancedb` 就完事），不开 server / 不维护节点
- 数据可直接放 S3 / GCS / Azure Blob 等**对象存储**，本地也行
- 底层用自研的 **Lance 列存格式**，专为 AI 数据（向量、图片、音频）优化随机点取

一行代码连库、建表、写数据、查最近邻全在同一个 Python 进程里完成。

## 为什么重要

不理解 LanceDB 的位置，理解不了向量数据库这一两年怎么分化：

- **嵌入式 vs 服务端**的代表：服务端代表是 Milvus / Qdrant（要部署节点），嵌入式代表就是 LanceDB / Chroma
- **存储格式自研**：大多数向量库直接用 Parquet 或 RocksDB，LanceDB 自己造了 Lance 格式，专门为"随机访问而非顺序扫"做优化
- **多模态原生**：列里可以同时存 vector / image bytes / 文本 / 嵌套结构，一套表搞定
- **零运维 RAG / 桌面 AI 的默认选项**：要做个本地知识库 / Notebook 实验 / 单机产品，不想运维向量服务的，几乎都会落到它

## 核心要点

LanceDB 的设计可以拆成 **三层 + 一个关键差异**：

1. **底层：Lance 列存格式**（Rust 写）
   - Parquet 的设计目标是"顺序扫一大段"，LanceDB 反过来——AI 训练 / 检索更多是**随机点取**（取第 31427 条向量）；官方博客宣称点取可比 Parquet 快一个到两个数量级

2. **中层：版本化对象存储**
   - 每次写入都是**新版本**，老版本数据复用，可以 `table.checkout(version=N)` 回到任一历史快照——零拷贝
   - 表数据可直接放在 `s3://my-bucket/table.lance/`，不用本地节点

3. **上层：向量库 API**
   - 自带三种近似最近邻（ANN）索引：IVF-PQ（先分桶再压缩编码）、HNSW（图上跳着找近邻）、IVF-HNSW（两者组合）
   - 支持 `WHERE category='book' AND vector ANN` 这种 **filter + 向量混合检索**
   - 全文检索（FTS）和向量检索可以**同表协同**（混合排序）

**关键差异**：和 Chroma / pgvector 不同——Chroma 用 SQLite + duckdb 拼起来，pgvector 长在 Postgres 里；LanceDB **自研存储格式**，所以扩展到亿级向量时存储压缩率和点取性能都更可控。

## 实践案例

### 案例 1：30 秒建一个本地 RAG 库

```python
import lancedb
import numpy as np

db = lancedb.connect("./mydata.lance")
table = db.create_table("docs", data=[
    {"vector": np.random.rand(384).tolist(), "text": "Lance 列存", "tag": "db"},
    {"vector": np.random.rand(384).tolist(), "text": "向量检索",   "tag": "ml"},
])
results = (table.search(np.random.rand(384).tolist())
                .where("tag = 'db'")
                .limit(5).to_pandas())
```

注意点：

- **没起任何服务**——`./mydata.lance` 就是个目录，用完关掉，进程退出无残留
- `where()` 是先过滤再 ANN，类似 SQL `WHERE`，但走的是 Lance 自己的下推

### 案例 2：把表放到 S3，跨机共享

```python
db = lancedb.connect("s3://my-bucket/mydata.lance")
```

把 URI 从本地路径换成 `s3://`，**其他代码一字不改**——这是"对象存储原生"的实际意义。多台机器读同一份数据时，每台都嵌入式连接，没有协调节点。

### 案例 3：版本回退（Lance 独有）

```python
table = db.open_table("docs")
table.add([{"vector": [...], "text": "新数据"}])
print(table.version)        # 比如 5
table.checkout(version=4)   # 回到加新数据前
```

每次写入产生新版本号，老版本数据通过列存的 fragment 复用 —— 这是 Lance 列格式自带的能力，向量库这一层只是暴露 API。

### 案例 4：filter + 向量混合检索

```python
table.search(query_vec) \
     .where("price < 100 AND in_stock = true", prefilter=True) \
     .limit(20).to_pandas()
```

`prefilter=True` 表示先用条件过滤再做 ANN（精度高，召回稳定），`prefilter=False` 是先 ANN 再过滤（快，但若过滤掉太多可能不够 K 条）—— 业务场景里这是要权衡的关键开关。

## 踩过的坑

1. **嵌入式 ≠ 多进程并发安全**：多个进程同时写同一张表要 Lance 自己的 transaction 协调——是**单写多读**模型。如果业务有多写需求，要么前面套队列，要么改用 Milvus / Qdrant 服务端。

2. **Lance 不是 Parquet 替代品**：批量分析型扫描（Spark / DuckDB 算聚合）Parquet 仍然更优。Lance 的设计权衡是**点取快 → 压缩率与顺序扫稍弱**。别因为听说"更新格式"就替换分析型管道里的 Parquet。

3. **对象存储延迟敏感**：放 S3 上每次 query 比本地多十几毫秒首字节延迟。用 IVF-PQ 索引（一次 IO 取多个 PQ 编码）比 HNSW（要随机跳节点）更适合 S3 后端。

4. **版本不是免费午餐**：每次写都留版本，长期不清理会让目录里 fragment 文件数量增长。要定期 `compact()` 合并。

5. **prefilter vs postfilter 选错就错**：`where()` 默认 prefilter=False（先 ANN 再过滤），如果 filter 命中率低（例如 1%），limit=10 可能查回 0 条；这时要显式开 prefilter=True，但代价是预先扫一遍索引。

## 适用 vs 不适用场景

**适用**：

- 单机 / 桌面 AI 应用（本地知识库、Obsidian 插件、Jupyter 实验）
- RAG 项目原型 / 中小规模生产（百万到亿级向量）
- 需要把向量直接搁 S3 / GCS 上，不想多养一套向量服务
- 多模态数据（一张表既存向量又存图片二进制）

**不适用**：

- 高并发多租户写入（要么前面套队列，要么换分布式向量库）
- 需要分布式 scale-out（用 Milvus 系列）
- 强事务 + 多表 JOIN（用 pgvector + Postgres）
- 每秒上万次随机写小数据（嵌入式 + 列存的版本化机制不擅长）

## 学到什么

1. **嵌入式数据库这条路在 AI 栈上重新流行**：SQLite 在 OLTP、DuckDB 在 OLAP、LanceDB 在向量——都是"进程内库 + 单文件 / 目录"的复刻
2. **存储格式决定上限**：Parquet 顺序扫 vs Lance 随机点取——这一步选型比上层 API 更影响最终性能
3. **对象存储原生是新范式**：传统数据库要"先把数据搬进来"，LanceDB 直接把 S3 当存储层，这种"数据在哪库就在哪"的模型让协作 / 共享代价大幅降低
4. **版本化（time travel）会成为标配**：DVC / Delta Lake / Iceberg / Lance —— 数据版本和代码版本对齐是 AI 工程化的必经之路

## 延伸阅读

- 官方文档：[LanceDB Docs](https://lancedb.github.io/lancedb/)
- Lance 格式论文：[Lance: A Modern Columnar Data Format for ML](https://blog.lancedb.com/lance-v2/)
- 与 Chroma / Qdrant 实测对比：[LanceDB vs Chroma](https://lancedb.github.io/lancedb/concepts/data_management/)
- [[ann-benchmarks]] —— 给 LanceDB 用的 IVF-PQ / HNSW 算法做统一打分的擂台
- [[milvus]] —— 分布式服务端向量库，LanceDB 嵌入式版的对照面

## 关联

- [[ann-benchmarks]] —— 衡量 LanceDB 内置索引召回 / QPS 的同一套基准
- [[milvus]] —— 服务端 vs 嵌入式的两条路径对照
- [[pgvector]] —— Postgres 内向量扩展，强事务但弱在多模态与 S3 原生

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lance]] —— Lance — AI 数据列存格式
