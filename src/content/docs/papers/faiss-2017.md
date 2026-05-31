---
title: FAISS 2017 — 用 GPU 在十亿向量里找最近邻
来源: Johnson, Douze & Jégou, "Billion-scale Similarity Search with GPUs", arXiv 1702.08734 (2017)
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

FAISS 论文讲的是：**怎么在十亿条高维向量里，几百微秒内找出"和这一条最像"的那 10 条**。

日常类比：图书馆里有 10 亿本书，每本被压成一个 128 维的"指纹"。给你一本新书的指纹，要在毫秒内捞回最像的 10 本——逐本对比要算 10 亿次距离，CPU 卡死。FAISS 的答案是**先用 GPU 暴力并行 + 把每本书的指纹再压一道**。

它解决的是**近似最近邻**（ANN, Approximate Nearest Neighbor）问题，"近似"两个字是关键——允许偶尔漏掉真正的最佳答案，换十几倍速度。

## 为什么重要

不理解 FAISS，下面这些事都没法解释：

- 为什么 ChatGPT、Claude 做 RAG（检索增强生成）能在百万文档里 50ms 找到相关段落
- 为什么 Pinecone、Milvus、Weaviate 这些"向量数据库"能商业化——它们底层大量复用 FAISS 思路
- 为什么"语义搜索""以图搜图""人脸识别"在 2018 年后突然全行业铺开
- 为什么 GPU 在搜索/推荐召回阶段越来越重要，不只训练用

一句话：**深度学习把万物变成向量，FAISS 解决了"向量怎么快速检索"这个配套问题**。

## 核心要点

FAISS 把"找最近邻"拆成 **两步组合拳 + GPU 加速**：

### 第一步：IVF（倒排文件）—— 先粗筛

类比：找一本书不会从第一本翻到第十亿本，而是先看"科技/小说/历史"分区，只翻最可能那个区。

具体做法：把 10 亿向量先聚成 1 万个簇（k-means），每个查询只扫"最像的几个簇"，把候选从 10 亿砍到几百万。

### 第二步：PQ（乘积量化）—— 再压缩

类比：把每本书的 128 维指纹拆成 8 段，每段用 1 字节查表代替——一本书指纹从 512 字节压到 8 字节。

具体做法：向量切成 m 段，每段用 256 个码字（codebook）覆盖。原来算两个 128 维向量距离要 128 次乘加，现在变成查 m 张小表加起来。**速度提 60 倍，存储缩 64 倍**，代价是距离值有点失真。

### 第三步：GPU 加速

前两步在 CPU 时代（IVF 1999、PQ 2010）就已存在。FAISS 的工程贡献是**把它们整套搬上 GPU**：

- 距离计算：GPU 一次算几万对向量距离（矩阵乘的强项）
- top-k 选择：传统排序 GPU 不擅长，他们写了一个 warp 级选择算法（论文核心工程贡献之一）
- PQ 查表：用 GPU 共享内存（shared memory）做超快 LUT

**结论**：单台 8-GPU 机器，10 亿 96 维向量，建索引 35 分钟，每条查询 200 微秒。

## 实践案例

### 案例 1：RAG 检索的底座

```python
import faiss
import numpy as np

# 假设有 100 万段文档，每段编码成 768 维向量
docs = np.random.randn(1_000_000, 768).astype('float32')

# 建 IVF+PQ 索引
quantizer = faiss.IndexFlatL2(768)
index = faiss.IndexIVFPQ(quantizer, 768, nlist=1024, m=16, nbits=8)
index.train(docs)
index.add(docs)

# 查询
query = np.random.randn(1, 768).astype('float32')
D, I = index.search(query, k=10)  # 返回距离 D 和索引 I
```

LangChain / LlamaIndex 默认的本地向量库底层就是 FAISS。

### 案例 2：召回率 vs 速度的权衡

论文 Deep1B 实验数据：

| 配置 | 召回率@10 | 单查询延迟 |
|------|---|---|
| 精确暴力搜 | 1.00 | 几秒 |
| IVF (nprobe=8) + PQ | 0.45 | 50μs |
| IVF (nprobe=64) + PQ | 0.65 | 200μs |
| IVF (nprobe=256) + PQ | 0.80 | 800μs |

**nprobe**（扫多少簇）是工程师能直接调的旋钮——速度和准度之间滑动。

### 案例 3：为什么 GPU 比 CPU 快这么多

CPU 优势：分支预测、缓存层级深，做"复杂逻辑"快。
GPU 优势：几千个核，做"简单逻辑大批量重复"快。

向量距离计算正好是 GPU 主场——一个 query 对 100 万 candidate，本质就是矩阵乘。CPU 用 BLAS 也能做，但带宽不如 GPU 的 HBM。

## 踩过的坑

1. **PQ 召回率天花板**：0.65 不是"调参不够"，是有损压缩的极限。要 0.95+ 必须放弃 PQ 或加重排（先 PQ 粗排再精排）。

2. **nlist 选择反直觉**：聚类数太少（如 100）→ 每个簇太大，扫不动；太多（如 100 万）→ 簇内向量太少，k-means 训练不稳定。经验值：sqrt(N) 到 4*sqrt(N) 之间。

3. **GPU 显存是硬墙**：单卡 32GB 大概装 1 亿条 PQ 压缩后向量。超过就要多 GPU 分片或 CPU/GPU 混合。

4. **k-NN ≠ 语义匹配**：向量本身的质量决定检索上限。embedding 模型烂，FAISS 调到飞起也救不了。这是 RAG 翻车最常见根因。

5. **训练集要够大**：PQ 码表要从向量分布学出来，训练样本太少（如 1 万条）会偏。论文建议至少 256 × m 条。

## 适用 vs 不适用场景

**适用**：

- 千万到十亿级静态向量库的 ANN 检索（RAG、推荐召回、以图搜图）
- 能容忍 0.6-0.9 召回率换十倍速度的场景
- 单机或少量节点能放下的数据规模

**不适用**：

- 要求 100% 精确（金融对账、合规去重）→ 用精确搜或哈希
- 数据频繁增删（FAISS 索引重建代价大）→ 看 HNSW、ScaNN 或托管向量数据库
- 超大规模（百亿+）跨机分布式 → 需要 Milvus / Vespa 这种系统层封装
- 向量维度极低（< 32）→ KD-tree / R-tree 可能更快

## 历史小故事（可跳过）

- **2010 年**：Hervé Jégou 在 INRIA 发明 PQ，把"压缩 + 检索"绑一起，但只有 CPU 实现。
- **2014 年**：Jégou 加入 Facebook AI Research（FAIR），开始把 PQ 工程化。
- **2017 年**：FAISS 论文 + 开源代码同步发布。Jeff Johnson 是 GPU 工程主力，Matthijs Douze 是 CPU/系统主力，Jégou 是算法奠基人。
- **2017-2020**：FAISS 成为 Pinecone、Milvus、Weaviate 等向量数据库的灵感源。
- **2022 年后**：ChatGPT 推动 RAG 爆发，FAISS（和它的派生品）成为大模型检索栈标配。

## 学到什么

1. **算法层面没有新东西，工程胜利**：IVF 1999、PQ 2010 都是老技术。FAISS 的贡献是把它们组合 + GPU 化 + 开源 + 文档完善。
2. **召回率 0.65 也能商用**：在"找不到完美匹配也比慢得无法接受好"的场景，工程权衡比理论纯度重要。
3. **批量是 GPU 的灵魂**：单条查询 GPU 不一定快过 CPU，但批量 1024 条查询时 GPU 碾压。
4. **开源 + 论文 + 工业代言三件套**：FAIR 的标准打法——FAISS 既是研究产物，也是 Meta 自家推荐系统的生产组件。

## 延伸阅读

- 论文 PDF：[arXiv 1702.08734](https://arxiv.org/abs/1702.08734)（13 页，工程细节比理论多）
- 视频教程：[Pinecone — FAISS Tutorial](https://www.pinecone.io/learn/series/faiss/)（图文系列，零基础也能跟）
- 代码库：[github.com/facebookresearch/faiss](https://github.com/facebookresearch/faiss)（README 里的 Wiki 是最好的入门）
- 配套阅读：PQ 原论文 [Jégou et al. 2010](https://lear.inrialpes.fr/pubs/2011/JDS11/jegou_searching_with_quantization.pdf)（理解 PQ 必读）
- [[hnsw-2016]] —— FAISS 的主要竞争对手（图索引路线）
- [[bigtable-2006]] —— 同样是"工程组合 + 论文化"的代表

## 关联

- [[hnsw-2016]] —— HNSW 是另一条 ANN 主流路线（图索引），与 IVF+PQ 并驾齐驱
- [[attention]] —— Transformer 把万物变向量，FAISS 是这些向量的检索引擎
- [[bert]] —— BERT 等编码器产出的 embedding 是 FAISS 最常服务的客户
- [[bigtable-2006]] —— 类似的"老技术 + 工程化 + 开源"成功范式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[numpy]] —— NumPy — Python 科学计算基石
- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度
- [[scann-2020]] —— ScaNN — 让向量量化只精修「客户会看到的那一面」
- [[spann-2021]] —— SPANN — 内存放中心、SSD 放向量的十亿级近邻检索
- [[youtube-two-tower-2019]] —— YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键

