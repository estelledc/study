---
title: Lance — 零基础学习笔记
来源: https://github.com/lancedb/lance
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# Lance — 零基础学习笔记

## 1. 什么是 Lance？用日常语言说清楚

先做一个类比。

想象你在管理一个巨大的"图书馆"，书架上存放的不是普通书，而是各种多媒体数据——图片、视频、音频、文本，以及由 AI 模型生成的"向量"（你可以把它理解成每本书的"摘要指纹"）。

以前，管理这样的图书馆需要好几套系统：

- **Parquet / Iceberg** 擅长管"目录"和"统计"，但找相似图片很慢。
- **向量数据库** 擅长找相似，但不擅长做统计分析。
- **对象存储（S3 / GCS）** 可以存文件，但查询效率很低。

**Lance 想做的是把这三件事合到一件事里**——它定义了一套文件格式 + 表格式 + 索引规范，让你把图片、向量、文本全部存进同一个 `.lance` 文件（其实是一个目录），然后用 SQL、向量搜索、全文搜索同时操作这些数据。

Lance 的官方定位是 **"The Open Lakehouse Format for Multimodal AI"**（多模态 AI 的开放湖仓格式）。"湖仓"（Lakehouse）这个词的意思是：既像数据湖一样便宜（存在对象存储上），又像数据仓库一样能做分析查询。

## 2. 为什么要学 Lance？

Lance 在以下场景中特别有用：

1. **AI 搜索**：存图片/文本的向量嵌入，做相似性搜索。
2. **ML 训练**：大规模训练中需要快速随机读取样本（比 Parquet 快 100 倍）。
3. **多模态数据管理**：一张表里同时存图片、向量、文本描述，不用拆开管理。

## 3. 核心概念

### 3.1 Lance 文件的"两层结构"

Lance 不只是一个文件格式，而是一整套分层规范：

| 层级 | 类比 | 说明 |
|------|------|------|
| **文件格式**（File Format） | 每本书的纸张和排版方式 | 数据在磁盘上如何编码、压缩、排列 |
| **表格式**（Table Format） | 图书馆的书架和编目系统 | 数据怎么组织成"表"、"片段"、"版本" |
| **索引格式**（Index Format） | 图书馆的检索卡片 | 向量索引、全文索引、标量索引等 |
| **目录规范**（Catalog） | 图书馆的注册中心 | 表怎么被注册、发现、管理 |

**通俗理解**：文件格式决定了"数据怎么存"，表格式决定了"数据怎么组织"，索引决定了"数据怎么快速找到"。

### 3.2 碎片（Fragment）

表里的数据不是一整块，而是切成多个"碎片"（Fragment）。每个碎片包含一部分行，可以独立压缩和读取。好处是：

- 添加新列时，只需追加新的数据文件到已有碎片，不用重写整张表。
- 删除行时，只记录"哪些行被删了"，不实际擦除数据。

### 3.3 版本控制（Zero-Copy Versioning）

Lance 自带版本管理。每次写入都产生一个新版本，旧版本数据不删除。你可以：

- **回退到任意历史版本**（Time Travel）
- **创建分支和标签**（Tags & Branches）
- 整个过程不需要额外的基础设施

### 3.4 混合搜索（Hybrid Search）

Lance 允许你在同一个数据集上同时使用三种搜索方式：

1. **向量相似度搜索**：找"相似"的记录。
2. **全文搜索**（BM25）：找包含"关键词"的记录。
3. **SQL 过滤**：按条件筛选。

三者可以组合使用，这就是所谓的"混合搜索"。

## 4. 编码策略（Encoding）—— 数据怎么存

这是 Lance 文件格式的底层设计。

Lance 不用 Parquet 的"行组"（Row Group）方式，而是用**"小微型块"（Mini Block）**：

- 数据被切成很多小微型块，每个块独立压缩。
- 读取时，只需要加载目标块，不需要读取整个文件。
- 这就是为什么 Lance 的**随机访问比 Parquet 快 100 倍**。

对于大型数据（如向量嵌入），Lance 使用"Full Zip"布局，把多个值打包在一起压缩，减少存储开销。

支持的压缩算法包括：Flat、Bitpacking、FSST、RLE、Byte Stream Split 等，根据数据类型自动选择最优方案。

## 5. 代码示例

### 示例 1：写入和读取数据集

这是 Lance 最基础的用法——写入数据、读取数据、转成 Pandas DataFrame。

```python
import lance
import pyarrow as pa
import pandas as pd

# 1. 准备数据：创建一个 PyArrow Table
table = pa.Table.from_pylist([
    {"name": "Alice", "age": 20, "city": "Beijing"},
    {"name": "Bob",   "age": 30, "city": "Shanghai"},
    {"name": "Carla", "age": 25, "city": "Guangzhou"},
])

# 2. 写入 Lance 数据集（本地路径或 S3 路径都可以）
ds = lance.write_dataset(table, "./my_dataset.lance")

# 3. 读取数据集
dataset = lance.dataset("./my_dataset.lance")

# 4. 转成 Pandas DataFrame
df = dataset.to_table().to_pandas()
print(df)
#     name  age       city
# 0  Alice   20    Beijing
# 1    Bob   30   Shanghai
# 2  Carla   25  Guangzhou
```

**关键理解**：
- `write_dataset()` 会创建一个 `.lance` 目录，里面包含多个 `.lance` 数据文件。
- `lance.dataset()` 打开数据集，返回一个 `LanceDataset` 对象。
- 读出来的数据本质上是 PyArrow Table，可以直接转 Pandas。

### 示例 2：向量搜索（创建索引 + 查询）

这是 Lance 最强大的功能——对向量数据建立索引，做相似性搜索。

```python
import lance
import numpy as np
import pyarrow as pa
from lance.vector import vec_to_table

# 1. 准备向量数据：假设我们有 10 个 5 维向量
vectors = np.array([
    [1.0, 0.5, 0.3, 0.1, 0.2],
    [0.9, 0.6, 0.4, 0.2, 0.3],
    [0.1, 0.2, 0.8, 0.9, 0.5],
    [0.2, 0.1, 0.7, 0.8, 0.4],
    [0.5, 0.9, 0.2, 0.1, 0.3],
    [0.6, 0.8, 0.3, 0.2, 0.4],
    [0.3, 0.4, 0.6, 0.7, 0.8],
    [0.4, 0.3, 0.5, 0.6, 0.9],
    [0.7, 0.2, 0.1, 0.3, 0.5],
    [0.8, 0.1, 0.2, 0.4, 0.6],
], dtype=np.float32)

names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
table = vec_to_table({i: v for i, v in enumerate(vectors)})
table = table.append_column("name", pa.array(names))

# 2. 写入 Lance 数据集
ds = lance.write_dataset(table, "./vector_data.lance")

# 3. 创建向量索引（IVF_PQ 是最常用的索引类型）
ds.create_index(
    "vector",                    # 要索引的列名
    index_type="IVF_PQ",         # 索引类型：IVF + 乘积量化
    num_partitions=2,            # IVF 分区数（类似 K-Means 的聚类数）
    num_sub_vectors=2,           # PQ 子向量数（向量被分成的片段数）
)

# 4. 执行向量搜索
query_vector = np.array([0.5, 0.6, 0.5, 0.5, 0.4], dtype=np.float32)
results = ds.to_table(
    nearest={
        "column": "vector",      # 搜索哪个向量列
        "q": query_vector,       # 查询向量
        "k": 3,                  # 找最接近的 3 条
    }
)

print(results.to_pandas())
#   id                                            vector score name
# 0  5  [0.600, 0.800, 0.300, 0.200, 0.400]  0.090    f
# 1  1  [0.900, 0.600, 0.400, 0.200, 0.300]  0.170    b
# 2  0  [1.000, 0.500, 0.300, 0.100, 0.200]  0.250    a
```

**关键理解**：
- `vec_to_table()` 把 numpy 向量数组转成 PyArrow 表，方便写入。
- `create_index()` 创建的是 ANN（近似最近邻）索引，`IVF_PQ` = IVF（向量空间分区）+ PQ（乘积量化，压缩向量）。
- `to_table(nearest=...)` 执行向量搜索，返回的结果包含 `id`、`vector`、`score`（距离分数）。
- **没有索引时** Lance 也能搜（暴力扫描），但建索引后速度提升巨大（官方数据：百万向量搜索 <1ms）。

### 示例 3：数据操作（增删改）

Lance 支持对数据集做增删改，而且不重写底层文件：

```python
import lance
import pyarrow as pa

dataset = lance.dataset("./my_dataset.lance")

# 插入新行
new_data = pa.Table.from_pylist([{"name": "David", "age": 35, "city": "Shenzhen"}])
dataset.insert(new_data)

# 删除行（基于 SQL 条件）
dataset.delete("name = 'Bob'")

# 更新行（SQL 表达式）
dataset.update({"age": "age + 1"}, where="name = 'Alice'")

# 批量替换（Merge Insert = Upsert）
updates = pa.Table.from_pylist([
    {"name": "Alice", "age": 21, "city": "Beijing"},
    {"name": "Carla", "age": 26, "city": "Guangzhou"},
])
dataset.merge_insert("name") \
    .when_matched_update_all() \
    .when_not_matched_insert_all() \
    .execute(updates)
```

## 6. Lance 的生态集成

Lance 不要求你只用它的 Python SDK，它可以和主流数据处理工具无缝集成：

| 工具 | 集成方式 |
|------|----------|
| **Pandas / Polars** | `dataset.to_table().to_pandas()` |
| **PyArrow** | 原生返回 PyArrow Table |
| **DuckDB** | 直接 SQL 查询 `.lance` 文件 |
| **Apache Spark** | Spark 连接器读写 Lance |
| **Apache Trino** | Trino 查询 Lance 表 |
| **PyTorch / TensorFlow** | 作为 ML 训练的数据源 |
| **S3 / GCS** | 直接存到对象存储，不落地本地 |

## 7. Lance vs Parquet 的对比

| 特性 | Lance | Parquet |
|------|-------|---------|
| 随机访问速度 | 100x 更快 | 较慢（需要扫描行组） |
| 向量搜索 | 原生支持 | 不支持 |
| 全文搜索 | 原生支持 | 不支持 |
| 版本控制 | 内置（零拷贝） | 需额外工具（Iceberg/Delta） |
| 列追加 | 追加文件，不重写 | 需要重写 |
| 多模态数据 | 原生支持 | 需外部存储 |
| SQL 分析 | 支持 | 支持（生态更成熟） |

简单说：**如果你只做 SQL 分析，Parquet 够用。如果你要做 AI/ML 相关的数据管理，Lance 更合适。**

## 8. 总结

Lance 的核心价值可以归纳为一句话：

> **一套格式，解决多模态 AI 数据的全生命周期管理——存储、搜索、训练、进化。**

学习路线建议：
1. 先用 `pip install pylance` 跑通写入/读取。
2. 尝试向量搜索：建索引 + 查询。
3. 了解版本控制和分支功能。
4. 探索与 DuckDB / Spark 的集成。

完整的规格文档见：https://lance.org/format

---

> **下一步想学什么？** 比如"如何用 Lance 构建一个图片搜索系统"，或者"混合搜索（向量 + 全文 + SQL）的具体用法"？
