---
title: SPLADE — 让神经网络学出稀疏向量，直接复用倒排索引
来源: 'Formal, Piwowarski, Clinchant, "SPLADE: Sparse Lexical and Expansion Model for First Stage Ranking", SIGIR 2021'
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

SPLADE（**SParse Lexical AnD Expansion**）是一种用 BERT 学出**稀疏向量**的检索模型。日常类比：传统搜索靠"查字典"（出现哪些词、各有多重要），新派搜索靠"理解整段话压成稠密向量"——SPLADE 让神经网络学出来的依然是"哪些词重要"，但这些词可以是原文**没出现过**的相关词。

你给它一句 `2026 best laptop for ML`，它输出一张表：

```
laptop: 2.3,  ml: 1.8,  notebook: 1.1,  gpu: 0.9,
machine: 0.7,  learning: 0.6,  cuda: 0.4, ...（其余 30000 维都是 0）
```

向量维度是整个词表（约 30000），但**绝大多数位置是 0**。这种结构可以**直接塞进 Elasticsearch / Lucene 的倒排索引**——每个非零词当一个 posting list 入口，与 BM25 用同一套引擎。

## 为什么重要

- BM25（1994 年的统计公式）和 BERT-based 稠密检索（2019 年起的 DPR / ColBERT）一直是**两派**：稀疏快但不懂语义，稠密懂语义但需要专门的 ANN 索引和 GPU
- SPLADE 是**第一个让纯稀疏模型逼近稠密双塔**的方法，且 latency 还更低
- 工业落地不用换引擎：原有的 Elasticsearch 集群替换权重就能用
- 它把"查询扩展"从显式的两步流程（先改 query 再搜）变成端到端的一步——MLM 头自然预测语义相关词

## 核心要点

SPLADE 的核心机制可以拆成 **三步**：

1. **每个 token 投影到词表**：BERT 给每个输入 token 一个表示，再用 MLM 头（masked language model 那个分类头）把它投影到整个词表的维度。意思是"这个位置在告诉我们整段话与词表里每个词的关联强度"。

2. **max + log + ReLU 聚合**：对词表里的每个词 j，取所有输入位置中信号最强的那个，公式是 `w_j = max_i log(1 + ReLU(s_ij))`。ReLU 砍掉负值，log 压低极端值，max 选最强信号。

3. **稀疏正则逼出 0**：训练时加 FLOPS 正则项（直接约束"查询 × 文档"的乘法次数），逼模型把绝大多数维度推到 0。最后剩下的非零位置就是这段话"应该出现"的词，包括原文没说但语义相关的。

三步加起来叫 **SPLADE 聚合 + FLOPS 训练**。

## 实践案例

### 案例 1：扩展是怎么自然发生的

文档原文：`Pure Wool Sweater for Winter`

SPLADE 输出的非零维度（节选）：

```
sweater: 2.1,  wool: 1.9,  winter: 1.5,  pure: 0.8,
jumper: 0.7,  pullover: 0.6,  cashmere: 0.4,  warm: 0.3
```

`jumper` / `pullover` / `warm` **没在原文出现**，但 BERT 的 MLM 头认为这段话与它们高度相关。检索时若 query 用了 `jumper`，依然能命中——这就是隐式扩展，解决传统 BM25 的"词表不匹配"。

### 案例 2：为什么能跑在倒排索引上

倒排索引的本质：每个词 → 包含它的文档 ID 列表（posting list）。检索 `wool sweater` 就是把 `wool` 的列表与 `sweater` 的列表求交集，按权重打分。

SPLADE 的稀疏向量恰好就是这种结构：每个非零维度对应一个词，权重就是 BM25 那种"重要性分数"，只是分数从统计公式（tf-idf）换成了神经网络学出来的。Elasticsearch 完全不知道也不在乎权重是怎么来的。

### 案例 3：训练 loss 长什么样

```
L = L_contrastive(query, doc+, doc-) + λ_q * FLOPS(q) + λ_d * FLOPS(d)
```

- 对比损失推 query 与正样本接近、与负样本远离（用 MS MARCO 的 triples）
- FLOPS 正则项约束查询和文档**的乘积**的非零比例——直接对应实际检索时的乘法次数
- λ_q 通常比 λ_d 大，因为查询更短、更需要精炼

### 案例 4：与 BM25 / DPR 的三方对照

| 维度 | BM25 | DPR（稠密双塔） | SPLADE |
| --- | --- | --- | --- |
| 向量类型 | 稀疏（统计词频） | 稠密（768 维浮点） | 稀疏（词表维度，多数为 0） |
| 索引引擎 | Lucene 倒排 | FAISS / HNSW | Lucene 倒排（直接复用） |
| 是否懂同义词 | 不懂（要外挂扩展） | 懂（向量空间相近） | 懂（MLM 头自然预测） |
| GPU 是否必须 | 不需要 | 检索时也常用 | 仅训练和编码时需要 |
| 可解释性 | 高（词级权重） | 低（向量黑盒） | 高（依然是词级权重） |

## 踩过的坑

1. **文档侧不稀疏会炸 posting list**：早期版本只对查询稀疏化，导致每篇文档贡献几千个非零词，索引膨胀几十倍。必须查询和文档都稀疏。

2. **L1 正则不如 FLOPS 正则**：L1 只控制非零数量，但实际延迟取决于"查询非零数 × 各 posting list 长度"。FLOPS 正则直接对齐这个量，调起来更稳。

3. **过大的模型反而慢**：稠密模型加大通常更准，SPLADE 加大反而让文档侧 posting list 变长。瓶颈是稀疏度而不是容量。

4. **评估只看 Recall@1000 失真**：稀疏正则调小一点 Recall 看着会涨，但 latency 也涨。要看 **quality × latency 的帕累托前沿**，不能单看一个数。

5. **聚合方式选错会丢信号**：早期试过 sum-pooling，结果长文档的稀有强信号被一堆弱信号稀释。max-pooling 选最强信号才是对的。

6. **MLM 头不能随便换**：有人想把投影头改成线性层省参数，结果扩展能力消失——能"扩展到没出现的词"是 MLM 头预训练得来的能力，去掉就等于把 SPLADE 变成 DeepCT 那种纯重加权。

7. **稀疏度想看是否合理**：实践上查询通常在 30-80 个非零词，文档在 100-300 个；偏离这个量级就要怀疑训练或正则配置出了问题。

## 适用 vs 不适用场景

**适用**：

- 已经有 Elasticsearch / Solr 集群、不想引入向量数据库
- 需要"原因可解释"（哪个词命中、权重多少都能 print 出来看）
- 中等规模语料（数千万到数亿文档），首阶段召回
- BM25 召回不够、但又不想为稠密向量重建整套基建

**不适用**：

- 跨语言检索（词表不重叠时稀疏空间失效，稠密向量更合适）
- 多模态检索（图像 / 音频天然没词表）
- 极小规模（几十万文档，BM25 就够，复杂度不值）
- 强语义对话式检索（句子级语义匹配，稠密 + ColBERT 那种后期交互更准）

## 历史小故事（可跳过）

- **2019 年**：Nogueira 提 doc2query，用 T5 给每篇文档生成"可能的查询"再加进文档——显式扩展，效果好但要两步走
- **2020 年**：Dai 提 DeepCT，用 BERT 给 BM25 的词频重新加权，但不做扩展
- **2021 年 7 月**：Naver Labs 三人组 Formal-Piwowarski-Clinchant 把这两条思路合并——既加权又扩展，端到端学，不用先生成 query。这就是 SIGIR 2021 论文，**8 页**
- **2021 年 9 月**：v2 版改用蒸馏和难负样本，在 MS MARCO 上首次稳定超过 BM25 + 重排序
- **2022 年起**：SPLADE++ 等后续版本被 Vespa / Pyserini / Elasticsearch 集成，工业开始大规模上线
- **2023 年后**：与稠密向量做混合检索（hybrid retrieval）成为常规配方，SPLADE 通常占稀疏一路

## 学到什么

1. **稀疏不等于落后**：把"哪些词重要"这件事做到神经网络级别，依然能与稠密向量打平
2. **基建复用是工程的最高效率**：换权重不换引擎，迁移成本接近零
3. **正则项要对齐真实指标**：FLOPS 正则直接约束乘法次数，比 L1 更接近 latency
4. **扩展可以隐式发生**：MLM 头本来就是预测被遮的词，让它自然产出相关词，比另起一套生成式模型简洁得多
5. **两派打架时，往往最有机会的是合派**：BM25 派与 BERT 派各执一端时，SPLADE 把两边的优点钉在一起，反而走出新路

## 延伸阅读

- 论文 PDF：[SPLADE SIGIR 2021](https://arxiv.org/abs/2107.05720)（8 页，公式不多）
- 官方实现：[naver/splade GitHub](https://github.com/naver/splade)（含训练脚本和预训练 checkpoint）
- 实战集成：[Pyserini SPLADE 教程](https://github.com/castorini/pyserini)（在 MS MARCO 上跑通的最快路径）
- HF 模型卡：[splade-cocondenser-ensembledistil](https://huggingface.co/naver/splade-cocondenser-ensembledistil)（实践常用强基线）
- 后续版本论文：[SPLADE v2](https://arxiv.org/abs/2109.10086)（蒸馏 + 难负样本，工业落地常用的版本起点）

## 关联

- [[anserini-2017]] —— Lucene 之上的 IR 工具链，SPLADE 实验主要在它上面跑
- [[colbert-2020]] —— 后期交互的稠密派代表，与 SPLADE 是同时代的两条路线
- [[bm25-1994]] —— 经典稀疏基线，SPLADE 用的倒排索引就是为它设计的
- [[dpr-2020]] —— 稠密双塔的代表，SPLADE 在 MS MARCO 上首次逼近的对手
- [[doc2query-2019]] —— 显式文档扩展，与 SPLADE 的隐式扩展形成对照
- [[deepct-2020]] —— 用 BERT 重新加权 BM25 词频但不扩展，SPLADE 的直接前驱
- [[ms-marco-2016]] —— SPLADE 训练和评测的主要数据集

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anserini-2017]] —— Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台
- [[cocondenser-2021]] —— coCondenser — 让 BERT 的 [CLS] 在预训练就学会"代表整段话"
- [[colbert-2020]] —— ColBERT — 让 BERT 检索既准又能扛大规模
- [[dpr-2020]] —— DPR — 用 BERT 双塔把检索从 BM25 时代拉进稠密向量时代
- [[e5-2022]] —— E5 — 用海量"自然出现的文本对"训通用 embedding

