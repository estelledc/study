---
title: Columnar Storage Formats 2023 — Parquet/ORC 的体检报告
来源: 'Xinyu Zeng et al., "An Empirical Evaluation of Columnar Storage Formats", PVLDB 2023'
日期: 2026-07-08
分类: databases
难度: 中级
---

## 是什么

日常类比：你去仓库找一箱苹果，如果仓库按“每个家庭一整袋”摆放，你得拆很多袋；如果仓库按“苹果区、香蕉区、牛奶区”摆放，你只去苹果区就够了。

列式存储格式做的就是后者：把表里的同一列放得更近，让分析查询只读自己要的列。

这篇论文是给 Parquet 和 ORC 做一次系统体检：它不只问“哪个更快”，而是拆开文件布局、编码、压缩、索引、嵌套数据、机器学习负载和 GPU 解码，问每个设计在 2023 年的硬件和数据分布下还合不合适。

结论先说：Parquet 和 ORC 没有绝对赢家。Parquet 常常解码更快、文件略小；ORC 在细粒度过滤时更会跳过无关数据；未来格式要为云存储、宽表、向量数据和 GPU 重新设计。

## 为什么重要

不理解这篇，下面这些事很难解释：

- 为什么同一份数据写成 Parquet、ORC、CSV，查询时间会差很多。
- 为什么“压得更小”不一定“跑得更快”，因为 CPU 解压也要花时间。
- 为什么数据湖里一个小查询可能慢在 S3 多次 GET，而不是慢在扫描本身。
- 为什么机器学习特征表和向量 embedding 让传统列存格式显得别扭。

## 核心要点

这篇的核心可以拆成三句话：

1. **列存格式是很多小设计的组合**：行组大小、字典编码、RLE、bitpacking、zone map、Bloom Filter 都会影响结果。类比：一辆车快不快，不只看发动机，还要看轮胎、变速箱和路况。

2. **现代瓶颈从磁盘转向计算**：NVMe 和云对象存储改变了成本账本。过去省 I/O 很重要，现在经常是“少一点解码分支、少一点解压 CPU”更重要。

3. **新负载暴露老格式边界**：宽特征表、向量检索、图片二进制、GPU 并行解码，都不是 2010 年代 Hadoop 格式最初优化的中心。类比：老仓库适合纸箱，不一定适合自动分拣机器人。

## 实践案例

### 案例 1：只读需要的列

```python
columns = {
    "user_id": [1, 2, 3],
    "city": ["BJ", "SH", "HZ"],
    "price": [20, 35, 8],
}

total = sum(columns["price"])
print(total)
```

逐部分解释：

- `columns` 把同一列的数据放在一起，像仓库里同类货物放同一排。
- 查询只需要 `price`，所以 `user_id` 和 `city` 可以完全不读。
- Parquet/ORC 的基本收益就是这种“投影裁剪”：少读列，少搬数据。
- 论文提醒我们：宽表里即使只读 10 列，元数据如果不能随机访问，仍然可能要顺序解析很多列的 schema。

### 案例 2：字典编码为什么常常划算

```python
values = ["paid", "paid", "free", "paid", "trial"]
dictionary = {v: i for i, v in enumerate(sorted(set(values)))}
codes = [dictionary[v] for v in values]

print(dictionary)
print(codes)
```

逐部分解释：

- `dictionary` 把重复出现的字符串变成小整数编号。
- `codes` 存的是编号，比反复存原字符串更省空间。
- 论文发现真实数据里很多列的不同值比例很低，连浮点列也常有重复，所以 Parquet 激进使用字典编码是合理默认。
- 但编号之后还要再编码。Parquet 的整数编码更简单，常常解码更快；ORC 的整数编码更会压，但分支更多、解码更重。

### 案例 3：zone map 如何跳过无关块

```python
chunks = [
    {"min": 1, "max": 9, "offset": "A"},
    {"min": 40, "max": 49, "offset": "B"},
    {"min": 80, "max": 89, "offset": "C"},
]

for chunk in chunks:
    if chunk["max"] < 42 or chunk["min"] > 45:
        continue
    print("read", chunk["offset"])
```

逐部分解释：

- 每个 `chunk` 只记一小段数据的最小值和最大值。
- 查询条件是 42 到 45，A 和 C 的范围不可能命中，可以跳过。
- ORC 的 zone map 粒度更细，所以在低选择率查询里更容易少读数据。
- 但在 S3 这类高延迟对象存储上，zone map 如果散在很多地方，省下的数据可能被更多小请求抵消。

## 踩过的坑

1. **把“列存”理解成只换存放方向**：原因是格式里还藏着编码、压缩、索引和元数据布局，这些常比方向本身更决定性能。

2. **默认认为压缩越强越好**：原因是现代本地盘很快，zstd 省下的 I/O 可能不够抵消解压 CPU。

3. **拿一个 benchmark 宣判 Parquet/ORC 胜负**：原因是不同数据分布会触发不同编码路径，结论会随 NDV、排序程度、选择率变化。

4. **忽略 Arrow 的边界**：原因是 Arrow 主要是内存交换格式，不是长期磁盘存储格式；把它和 Parquet/ORC 直接混为一谈会问错问题。

## 适用 vs 不适用场景

**适用**：

- 你想理解 Parquet 和 ORC 的内部取舍，而不是只记“哪个快”。
- 你在做数据湖、OLAP、DuckDB/ClickHouse 外部表、Spark/Presto 文件读写。
- 你需要判断字典编码、block compression、zone map、Bloom Filter 是否值得打开。
- 你想理解为什么 ML 特征表、向量检索、GPU 解码会逼出下一代格式。

**不适用**：

- 你只想学习 SQL 基础语法，这篇太靠近存储层。
- 你想比较行存事务数据库的并发控制，这篇主要看分析型文件格式。
- 你想找 Parquet/ORC 的 API 教程，这篇给设计原则，不给一步步调用手册。
- 你要的是 Arrow IPC 或内存列式布局细节，这篇只把 Arrow 当边界条件提到。

## 历史小故事（可跳过）

- **2000 年代**：C-Store、MonetDB、VectorWise 等列式数据库证明分析查询可以靠“只读相关列”变快。
- **2010 年**：Dremel 把嵌套数据的列式表示推到大规模交互分析里，影响了 Parquet 的嵌套模型。
- **2011-2013 年**：RCFile、ORC、Parquet 在 Hadoop 生态里出现，目标是跨引擎共享大数据文件。
- **2020 年后**：NVMe、S3、数据湖、GPU 和机器学习特征表变成新常态，老格式的默认假设开始松动。
- **2023 年**：这篇 PVLDB 论文把 Parquet/ORC 拆成可实验的组件，给下一代格式列出设计清单。

## 学到什么

1. **没有万能格式，只有负载画像**：读全表、低选择率过滤、宽表投影、向量检索会偏爱不同设计。
2. **低 NDV 是现实数据的重要事实**：多数列重复值多，字典编码不是小技巧，而是默认策略候选。
3. **简单编码常常赢在解码速度**：ORC 更复杂的整数编码能省空间，但更多分支会拖慢 CPU。
4. **云存储改变元数据设计**：未来格式要减少小范围请求，把 footer、索引和列块组织得更适合高延迟环境。

## 延伸阅读

- 论文 PDF：[An Empirical Evaluation of Columnar Storage Formats](https://www.vldb.org/pvldb/vol17/p148-zeng.pdf)（原文，重点看第 5、6 节）。
- [[cstore-2005]] —— 先理解列式数据库为什么能快，再看文件格式如何继承这些思想。
- [[arrow]] —— 对照内存列式格式，理解 Parquet/ORC 为什么要先解码再交给计算引擎。
- [[faiss-2017]] —— 论文的向量检索实验会用到 top-k 相似搜索，这里补向量索引背景。
- [[btrblocks-2023]] —— 图谱相关论文，关注数据湖场景里的列式压缩和解码成本。

## 关联

- [[cstore-2005]] —— 列式存储的系统源头之一，解释为什么“只读需要的列”能改变 OLAP。
- [[arrow]] —— Parquet/ORC 常被解码成 Arrow 表，内存格式和磁盘格式的边界很关键。
- [[duckdb]] —— 本地分析数据库经常直接读 Parquet，能感受到格式选择的实际影响。
- [[clickhouse]] —— 现代列式数据库有自己的存储布局，可用来对比开放文件格式。
- [[faiss-2017]] —— ML 向量检索让低选择率读取成为列存格式的新压力测试。
- [[dremel-2010]] —— Parquet 的嵌套数据模型来自 Dremel 的 repetition/definition level 思想。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dremel-2010]] —— Dremel 2010 — BigQuery 和 Parquet 背后的嵌套列式分析
- [[fastlanes-compression]] —— FastLanes Compression Layout — 用标量代码解码千亿整数
- [[velox-meta-2022]] —— Velox — Meta 统一执行引擎
