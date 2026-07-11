---
title: Product Quantization — 把向量切碎再压成几个字节
来源: Jégou, Douze, Schmid, "Product Quantization for Nearest Neighbor Search", IEEE TPAMI 2011
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

Product Quantization（**PQ**）是一种**把高维向量压缩成几个小整数**的方法。日常类比：你要寄一只 10 米长的鱼到外地，整条寄太贵；于是把鱼切成 8 段，每段单独装进标准小盒子，盒子上贴个编号（"3 号尾盒、5 号腹盒……"），收件人按编号在自己仓库里取出对应大小的标准盒子拼回去——形状不完全一样，但够用。

技术语言：

- 一个 128 维 float32 向量原本占 **512 字节**
- PQ 把它切成 8 段（每段 16 维），每段独立做 k-means 聚成 256 类
- 最终只存 8 个 0–255 的整数，**8 字节**——压缩 64 倍
- 查询时距离用查表近似，比暴力算全维距离快一个数量级

PQ 是 **FAISS / Milvus / Vespa** 等向量数据库做"十亿级 ANN 搜索"的核心压缩武器。

## 为什么重要

不理解 PQ，下面这些事都没法解释：

- 为什么向量库能宣称"10 亿向量塞进单台服务器内存"——靠 PQ 把每条压到 8–64 字节
- 为什么 RAG / 推荐系统能毫秒级查千万级 embedding——PQ + 倒排（IVF-PQ）
- 为什么 HNSW（图索引）和 PQ 经常一起出现——HNSW 管搜得快，PQ 管装得下
- 为什么许多向量库 / ANN 服务把 FAISS 当默认引擎——IVF-PQ 是其中最常用的压缩索引之一

## 核心要点

PQ 把"压缩 + 查询"拆成 **三步**：

1. **切段（product 的来源）**：D 维向量切成 M 段，每段 D/M 维。"product" 指**笛卡儿积**——总码本是 M 个子码本的笛卡儿积，量级从 256^M 个组合，但只存 M 个 256 大小的子码本。

2. **每段独立 k-means**：对每段单独跑 k-means，得到 256 个聚类中心（codeword）。一个向量被压缩成 M 个 codeword 的 id（**code**）。这一步叫**编码**。

3. **查询用查表（ADC）**：查询向量 q 和压缩库做距离时，把 q 也切成 M 段，对每段预算 q 子段到 256 个 codeword 的距离，存进**查表**（M × 256 浮点数）。库里每条向量距离 = M 次查表 + 累加。这叫 **Asymmetric Distance Computation**（非对称：q 不压、库压）。

三步合起来：**编码节省内存 + 查表加速距离 + 倒排（IVF）筛候选**。

## 实践案例

### 案例 1：128 维向量到底压成什么样

```python
# 原始：128 维 float32 = 512 字节
vec = np.random.randn(128).astype('float32')

# PQ 编码：M=8, 每段 16 维，每段 256 类
import faiss
pq = faiss.ProductQuantizer(d=128, M=8, nbits=8)
pq.train(training_vectors)         # 训练子码本
code = pq.compute_codes(vec[None]) # shape=(1, 8) uint8
# code = [37, 201, 5, 88, 142, 3, 99, 17]  ← 8 字节
```

逐步白话：① 把 128 维切成 8 段；② 每段找最近的聚类中心，记下 0–255 编号；③ 只存这 8 个编号。**压缩比**：512 / 8 = 64x。一亿条原本约 51 GB，压缩后约 800 MB。

### 案例 2：查询时 ADC 怎么省时间

```
查询 q：128 维
1. 切成 8 段 q1..q8，每段 16 维
2. 对每段 i，预算 q_i 到该段 256 个 codeword 的 L2 距离
   → 得到查表 LUT，shape=(8, 256)，2048 个 float
3. 库里每条向量的 code = (c1, c2, ..., c8)
   距离 ≈ LUT[0, c1] + LUT[1, c2] + ... + LUT[7, c8]
   → 8 次查表 + 7 次加法，无浮点乘法
```

对比暴力：原本每条向量 128 次乘加，现在 8 次查表，**快 ~16 倍**。再叠加 IVF 倒排（只查最近的几个簇），又快 100 倍。

### 案例 3：FAISS 的 IndexIVFPQ 是什么

```python
quantizer = faiss.IndexFlatL2(128)               # 粗量化器（IVF 簇心）
index = faiss.IndexIVFPQ(quantizer, 128, 1024, 8, 8)
# 1024 个 IVF 簇 + 每条向量 PQ(M=8, 8bit)
index.train(training_vectors)
index.add(database_vectors)                      # 一亿条没问题
index.nprobe = 16                                # 查询时探查最近 16 个簇
D, I = index.search(query, k=10)                 # 毫秒级
```

这就是十亿级向量库的标准底座。**两层量化**——IVF 粗筛把候选从一亿降到几十万，PQ 细量化让每条只占 8–16 字节，距离计算靠查表。

### 案例 4：SDC vs ADC 到底差多少

| 方式 | 查询向量 | 距离计算 | 精度 | 速度 |
|------|----------|----------|------|------|
| SDC（对称） | 也压成 code | 子码本两两距离预算表 | 较差 | 极快 |
| ADC（非对称） | 不压、保持 float | 查询时建 LUT | 较好 | 快 |

工业界几乎都用 ADC——查询频次高、查询向量数量少（vs 库百万级），多算一点 LUT 完全划得来。

## 踩过的坑

1. **段间相关性强 → 精度崩**：原始论文要求子段近似独立。如果向量前 64 维和后 64 维高度相关，按顺序切会丢信息。改进版 **OPQ**（Optimized PQ, Ge et al. 2013）先学一个旋转矩阵把维度去相关，再切，recall 提升 5–10 个点。

2. **训练样本不够 → 子码本退化**：每段要训 256 个聚类中心，训练样本至少 256 × 30 = 7680 条，不然中心代表性差。FAISS 给的经验值是 **每段 ≥ 30 × k 条**。

3. **M 选错 → 内存或精度二选一**：M 太大压缩比低（M=64 等于不压）；M 太小精度差。常用 M=8 或 16，nbits=8（每段 256 类）。**M × nbits = 总比特数**，决定压缩比。

4. **L2 vs 内积要选对**：余弦相似度需要先归一化向量。直接用未归一化 PQ 做内积会算错。

5. **PQ 编码不可微 → 不能端到端学**：embedding 模型训练时 PQ 步是离线的，retrain embedding 后 codebook 也要重训。深度学习圈有 DPQ / Soft PQ 想解决但不主流。

## 适用 vs 不适用场景

**适用**：

- 十亿级向量、内存吃紧、容忍 90–95% recall（推荐、检索、RAG 召回）
- 配合 IVF（粗筛）+ HNSW（图导航）一起用；IVF 的 `nprobe` 越大 recall 越高、延迟也越高
- 维度 ≥ 64 的稠密 embedding（CNN / Transformer 输出）

**不适用**：

- 维度 < 32 的低维向量（切完每段 4 维，量化失真大）
- 需要 99%+ recall 的精确召回（用 HNSW + 不压缩，或 brute force）
- 非欧式距离（Hamming、Jaccard）→ 用专门的二值哈希（LSH）
- 在线频繁增删的小库（PQ 训练成本高，不如 brute force）

## 历史小故事（可跳过）

- **2010 年**：Jégou 等人在 INRIA 做图像检索，128 维 SIFT 特征堆到几亿条，硬盘装不下、内存更装不下。当时主流是 LSH（局部敏感哈希）和 spectral hashing，recall 都不够。
- **2011 年 TPAMI**：他们提出 PQ。论文核心两点——**笛卡儿积码本** + **ADC 非对称查表**——把"压缩"和"查询加速"同时做了。SIFT-1B 数据集上首次实现亿级欧式 ANN。
- **2013 年**：Ge 等人 OPQ 用旋转矩阵进一步去段间相关。
- **2017 年**：Facebook 把 INRIA 的代码工程化成 **FAISS**，开源。从此 PQ 成事实标准。
- **2020 年后**：向量数据库爆发（Milvus / Pinecone / Weaviate / Vespa），底层索引几乎都是 IVF-PQ 或 HNSW-PQ 变体。

## 学到什么

1. **"切碎 + 笛卡儿积"是处理高维的通用招**：单维联合分布太大，切成低维子空间各自处理，再组合——和分块矩阵、分段哈希思路一致
2. **非对称比对称聪明**：ADC（查询不压、库压）比 SDC（两边都压）精度高得多，多花一次查表预算就值
3. **压缩 + 索引正交**：PQ 管"每条多大"，IVF/HNSW 管"先看哪几条"。两件事拆开做，组合起来威力倍增
4. **理论 → 工程 6 年**：2011 论文 → 2017 FAISS 开源。学界发明、工业打磨，是数据库领域常态

## 延伸阅读

- 论文 PDF：[Product Quantization for Nearest Neighbor Search (TPAMI 2011)](https://hal.inria.fr/inria-00514462v2/document)
- FAISS 官方 wiki：[Indexing 1B vectors](https://github.com/facebookresearch/faiss/wiki/Indexing-1G-vectors)（亿级实测参数）
- OPQ 改进：[Optimized Product Quantization, Ge et al. CVPR 2013](https://kaiminghe.github.io/cvpr13/index.html)
- 视频讲解：[Pinecone — Product Quantization 图解](https://www.pinecone.io/learn/series/faiss/product-quantization/)（带动画的零基础入门）

## 关联

- [[hnsw-2018]] —— HNSW 图索引；和 PQ 互补，常组合成 HNSW-PQ
- [[bigtable-2006]] —— 大规模存储系统的设计权衡参考
- [[lsm-tree]] —— 另一种"分层 + 压缩"的存储思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[awq]] —— AWQ — 看激活脸色给权重打折
- [[awq-2023]] —— AWQ 2023 — 把 70B 大模型权重压到 35GB
- [[gptq-2023]] —— GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点
- [[milvus-2021]] —— Milvus 2021：把向量搜索做成数据库
- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度
- [[scann-2020]] —— ScaNN — 让向量量化只精修「客户会看到的那一面」
