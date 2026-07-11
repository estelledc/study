---
title: FAISS — 向量检索的标准件库
来源: https://github.com/facebookresearch/faiss
日期: 2026-06-01
分类: 基础设施 / 向量检索
难度: 中级
---

## 是什么

FAISS（Facebook AI Similarity Search）是 Meta AI 在 2017 年开源的 **C++ 向量检索库 + Python 绑定**。一句话：**给你 N 条向量、一条查询向量，几毫秒内找到最相近的 k 条**。日常类比：图书馆有十亿本书，每本压成一张 128 维"指纹卡片"，FAISS 是一台专门干"按指纹找最像的 10 本"的检索机。

代码组织上它是"积木盒"，不是"成品库"：

- **底层**：暴力距离、IVF 倒排、PQ 乘积量化、HNSW 图索引、OPQ / Scalar Quantization 等几十种索引算法各自实现
- **中层**：用工厂字符串 `"IVF1024,PQ16"` 把积木拼出一个组合索引
- **上层**：Python 包装一行 `index.add(vecs); D, I = index.search(q, 10)` 就能用
- **加速**：CPU SIMD（AVX2 / AVX-512） + 可选 GPU（CUDA）双后端，同一套 API

它**不是**完整数据库——没持久化、没 SQL、没分布式、没多租户。给你的是"算子"，业务库（[[milvus]] / Pinecone / Weaviate）在它上面包一层。

## 为什么重要

不理解 FAISS 在生态里的位置，就理解不了"向量检索"这个赛道为什么 2018 年之后突然爆发：

- **业界事实标准**：[[milvus]] / Vespa / Vald / [[pgvector]] 的 IVFPQ 实现，要么直接调 FAISS、要么照着 FAISS 重写——FAISS 论文 + 代码是这个领域的"教科书 + 参考实现"
- **算法全家桶**：IVF / PQ / HNSW / OPQ / RaBitQ / 二值量化全都能在一个仓库里组合，方便实验对比
- **GPU 路径独占**：在 GPU 上跑 IVFPQ + warp-level top-k，FAISS 的工程实现至今没有真正的开源对手
- **学术 + 工业双轨**：Hervé Jégou 团队同时是 IVF / PQ 的论文作者 + 这套库的写代码人，理论一动代码就跟上

## 核心要点

理解 FAISS 抓住三个层次就够：

1. **Index 抽象**：所有算法都实现 `Index` 接口——`train(xs)` 学码本、`add(xs)` 入库、`search(q, k)` 查询。换索引类型只换一行字符串，业务代码不动。

2. **工厂字符串（index_factory）**：`"PCA64,IVF16384,PQ32"` 这种由逗号串起来的小语言，把 PCA 降维 + IVF 倒排 + PQ 量化拼成一条流水线。这是 FAISS 最像"乐高"的地方。

3. **三类典型索引各管一段**：
   - `IndexFlat`——精确暴力，小规模（< 100 万）兜底
   - `IndexIVFPQ`——大规模（千万到十亿），先粗筛再压缩，论文核心
   - `IndexHNSW`——中规模（百万到千万），图索引，召回率最高、内存最重

## 实践案例

### 案例 1：三行 Python 跑通暴力检索

```python
import faiss, numpy as np
xs = np.random.rand(10_000, 128).astype('float32')
index = faiss.IndexFlatL2(128)   # 128 维 L2 距离暴力索引
index.add(xs)
D, I = index.search(xs[:5], 10)  # 给前 5 条找各自的 10 个最近邻
```

`D` 是距离矩阵，`I` 是结果向量在库中的编号。**没建索引、没训练**——FlatL2 真的就是矩阵乘+取最小，但已经被 SIMD 拉满。

### 案例 2：用工厂字符串拼组合索引

```python
index = faiss.index_factory(128, "IVF1024,PQ16")
index.train(train_set)        # k-means 出 1024 个簇心 + PQ 学 16 个子码本
index.add(database)
index.nprobe = 16             # 查询时扫 16 个簇（粗筛参数）
D, I = index.search(queries, 10)
```

把字符串改成 `"HNSW32"` 就换成图索引，代码其它部分零改动。这是 FAISS 最强的工程美感。

### 案例 3：CPU → GPU 一行迁移

```python
res = faiss.StandardGpuResources()
gpu_index = faiss.index_cpu_to_gpu(res, 0, index)
D, I = gpu_index.search(queries, 10)  # 同一套 API，GPU 跑
```

千万级以下数据，单张 V100 就能压到 100 微秒级 latency。这条迁移路径是 FAISS 最被工业界买账的地方。

## 踩过的坑

1. **维度 / 距离不一致直接错**：建索引时声明 128 维 L2，搜索向量给了 256 维或没归一化的余弦——FAISS 不会报错只会给乱七八糟的结果。L2 + 归一化才等价于余弦。

2. **IVF 训练数据要"代表性"**：训练集太小或分布偏，k-means 簇心歪掉，nprobe 调到 64 召回都上不去。一般要 30-100 倍簇数的样本量；训练集和库分布不一致时还要分两批 `train` 与 `add`。

3. **`add_with_ids` 只有部分索引支持**：`IndexFlat` / `IndexIVF` 支持，`IndexHNSW` 不直接支持，要套 `IndexIDMap` 或 `IndexIDMap2`。新人常踩。

4. **Python GIL + 多线程**：FAISS 的 `search` 本身释放 GIL 内部多线程并行，**外层再开 Python 线程没意义反而更慢**。要并发就用 `omp_set_num_threads` 调内部线程数。

5. **GPU 索引内存吃紧**：千万级 IVFPQ 在单卡能跑，但加 nprobe 加 batch 容易 OOM。生产前用 `faiss.GpuIndexIVFPQConfig` 调 `useFloat16LookupTables=True` 省一半显存。

6. **持久化只有 `write_index` / `read_index`**：没 WAL、没增量、没快照——大库重建一次几小时，业务方常以为有数据库语义然后翻车。它就是个"内存数据结构能 dump 到磁盘"。

7. **`nprobe` 和 `efSearch` 调错完全跑偏**：IVF 的 `nprobe` 默认 1（只扫一个簇）、HNSW 的 `efSearch` 默认 16，照默认跑召回率经常不到 50%。第一件事就是把这两个旋钮往上拧到精度 / 延迟交点。

8. **不同版本二进制不兼容**：`write_index` dump 出的文件格式跨 minor 版本会变，升级 FAISS 后老索引读不出来很常见——生产部署要把 FAISS 版本固定写进依赖。

## 适用 vs 不适用场景

**适用**：

- 离线 / 准实时召回（推荐、搜索、去重、聚类）——百万到十亿规模，单机吃得下
- 实验和调参——同一套 API 切几十种索引，做 ANN benchmark 的事实标准
- 在自家服务里嵌入向量检索——不想引专门数据库，FAISS 当库直接 link
- 教学 / 论文复现——IVF / PQ / HNSW / OPQ 实现都在一个仓库，比读多篇论文+多份代码省事

**不适用**：

- 需要 CRUD + 事务 + 权限 + 多租户——这是数据库层的事，去用 [[milvus]] / Vespa / [[pgvector]]
- 实时流式更新——FAISS 的 `add` 不适合每秒上千次单条写入，要定期重建索引
- 跨机器 sharding——FAISS 单机库，分布式要自己在外面包路由 + 合并 top-k
- 和 SQL 混查（"`WHERE user_id=42` 内的最近邻"）——这正是 [[pgvector]] 的强项，FAISS 没有
- 超低维稠密向量（< 16 维）——LSH / k-d 树更合适，FAISS 的优势在中高维（64-2048）

## 历史小故事（可跳过）

- **2010 年**：Hervé Jégou 等人在 INRIA 发表 PQ（Product Quantization）论文，奠定了"向量切段 + 查表"的压缩思路
- **2017 年 2 月**：Johnson、Douze、Jégou 三人在 Meta（当时 FAIR）发布 [[faiss-2017]] 论文 + 代码，第一次把 IVFPQ 完整搬上 GPU，billion-scale 检索从理论变成开箱可跑
- **2018-2020 年**：[[milvus]] / Vespa / Vald 陆续起家，要么直接 link FAISS、要么用它做 baseline 对比
- **2023 年起**：RAG 火爆把 FAISS 推到主流认知，Hugging Face / LangChain / LlamaIndex 默认教程都从 FAISS 开始
- **持续维护**：仓库十年了还在迭代，2024 年加了 RaBitQ（1-bit 量化）和 NeuralFAISS 探索

## 学到什么

1. **"积木库"赢"成品库"**：FAISS 故意不做数据库，把粒度做到算子级。结果是上面长出 10+ 个商业产品，自己反而活得最久——通用化是底层库的护城河
2. **工厂字符串是好设计**：`"IVF1024,PQ16"` 这种小语言把"组合索引"的复杂度封装到一行——值得在自己设计可组合系统时模仿
3. **理论 + 代码 + 论文同源**：Jégou 团队"研究员即维护者"，让 IVF / PQ 这条路线避免了"论文很美、代码不能用"的常见割裂
4. **GPU 先行 5 年**：FAISS 2017 就把 ANN 搬上 GPU，比同行至少早 3-5 年——选对硬件趋势是工程库长寿的隐藏指标
5. **召回 / 速度 / 内存三选二**：FAISS 把这条 trade-off 做成可调参数（`nprobe`、`M`、`efSearch`、PQ 段数），明确告诉用户"没有银弹"，是值得学习的产品诚实度

## 延伸阅读

- 官方 wiki：[github.com/facebookresearch/faiss/wiki](https://github.com/facebookresearch/faiss/wiki)（Getting started / Index factory / GPU 一站式）
- [[faiss-2017]] —— 论文笔记，讲清楚 IVF + PQ + GPU top-k 的算法细节
- [[hnsw-2018]] —— FAISS 的 HNSW 索引来自这篇
- [[ann-benchmarks]] —— 把 FAISS 和 ScaNN / NMSLIB / HNSWlib 放一起跑分
- 教程视频：[Pinecone — FAISS Indexing Tutorial](https://www.pinecone.io/learn/faiss/)（从 Flat 到 IVFPQ 一路调参）
- 工程博客：[Meta Engineering — FAISS](https://engineering.fb.com/2017/03/29/data-infrastructure/faiss-a-library-for-efficient-similarity-search/)（首发解读 + GPU 加速直觉）

## 关联

- [[faiss-2017]] —— 原论文，讲算法 + GPU 实现细节
- [[hnsw-2018]] —— FAISS 的 HNSW 索引算法来源
- [[pgvector]] —— PG 扩展版向量检索，跨过 FAISS 直奔 SQL 集成
- [[milvus]] —— 在 FAISS 等底层库上包了数据库语义的开源向量库
- [[ann-benchmarks]] —— 近似最近邻算法擂台，FAISS 是常驻选手

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[milvus-2021]] —— Milvus 2021：把向量搜索做成数据库
- [[papers/opensearch]] —— OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
- [[scaling-hnsws-antirez]] —— Scaling HNSWs — antirez 把向量图做成 Redis 数据结构的工程笔记
- [[ann-benchmarks]] —— ANN-Benchmarks — 近似最近邻算法的统一擂台
- [[annoy]] —— Annoy — Spotify 的随机森林近似最近邻索引
- [[milvus]] —— Milvus — 开源向量数据库
- [[weaviate]] —— Weaviate — 模块化向量数据库
