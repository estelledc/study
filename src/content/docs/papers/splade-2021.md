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
- SPLADE 把神经稀疏检索推到能**显著缩小与稠密双塔差距**的水平，且 latency 往往更低
- 工业落地不用换引擎：原有的 Elasticsearch 集群替换权重就能用
- 它把"查询扩展"从显式的两步流程（先改 query 再搜）变成端到端的一步——MLM 头自然预测语义相关词

## 核心要点

SPLADE 的核心机制可以拆成 **三步**：

1. **每个 token 投影到词表**：BERT 给每个输入 token 一个表示，再用 MLM 头（masked language model 那个分类头）把它投影到整个词表的维度。意思是"这个位置在告诉我们整段话与词表里每个词的关联强度"。

2. **log + ReLU 再聚合**：对词表里每个词 j，先对每个位置做 `log(1 + ReLU(s_ij))`。SIGIR 2021 原版用 **sum** 把各位置加总；后续 SPLADE-max / v2 改成 **max** 取最强信号。ReLU 砍负值，log 压极端值。

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

### 案例 2：稀疏向量怎么塞进倒排索引

假设文档编码后只剩三个非零维：`wool: 1.9, sweater: 2.1, jumper: 0.7`。

1. 对每个非零词开一条 posting：`wool → [(doc42, 1.9)]`，`sweater → [(doc42, 2.1)]`，`jumper → [(doc42, 0.7)]`
2. 查询 `jumper sweater` 编码后若非零含 `jumper`、`sweater`，就取出这两条 posting 列表
3. 对共现文档把权重做点积打分：`score(doc42) = 0.7*q_jumper + 2.1*q_sweater`
4. Elasticsearch / Lucene 完全不关心权重来自 BM25 还是神经网络——结构一样就能复用

### 案例 3：编码与训练 loss 长什么样

最小编码伪代码（教学版）：

```
tokens = BERT(text)          # 每个位置一个向量
s = MLM_head(tokens)         # 投影到词表维 |V|
w_j = sum_i log(1+ReLU(s_ij))  # 原版 sum；v2 可换成 max
keep only w_j > 0            # 稀疏：绝大多数维被正则推成 0
```

训练目标（原论文用 in-batch negatives 的 ranking loss）：

```
L = L_rank-IBN(q, d+, d-, batch-) + λ_q * FLOPS(q) + λ_d * FLOPS(d)
```

- `L_rank-IBN`：推 query 靠近正样本、远离难负样本与同 batch 其他文档
- FLOPS 约束查询/文档非零分布，对齐检索时的乘法次数；λ_q 通常大于 λ_d

## 踩过的坑

1. **文档侧不稀疏会炸 posting list**：早期版本只对查询稀疏化，导致每篇文档贡献几千个非零词，索引膨胀几十倍。必须查询和文档都稀疏。
2. **L1 正则不如 FLOPS 正则**：L1 只控制非零数量，实际延迟取决于"查询非零数 × 各 posting list 长度"。FLOPS 直接对齐这个量。
3. **过大的模型反而慢**：稠密模型加大通常更准，SPLADE 加大反而让文档侧 posting list 变长。瓶颈是稀疏度而不是容量。
4. **评估只看 Recall@1000 失真**：稀疏正则调小一点 Recall 看着会涨，但 latency 也涨。要看 quality × latency 的帕累托前沿。
5. **聚合方式有版本差**：SIGIR 2021 原版是 sum；长文档上弱信号会稀释强信号，v2 的 max-pooling 通常更稳——别把两版公式混用。
6. **MLM 头不能随便换**：改成普通线性层会丢掉扩展能力，退化成 DeepCT 式纯重加权。
7. **稀疏度量级**：实践上查询约 30–80 非零词、文档约 100–300；偏离就要查训练或正则配置。

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
- **2021 年 7 月**：Naver Labs 三人组 Formal-Piwowarski-Clinchant 把加权与扩展端到端合并，SIGIR 2021 短文（约 4–5 页正文）
- **2021 年 9 月**：v2 引入 max-pooling、蒸馏与难负样本，首阶段在 MS MARCO 上相对 BM25 / 同期稠密检索更稳更强
- **2022 年起**：SPLADE++ 等被 Vespa / Pyserini / Elasticsearch 集成；之后常与稠密向量做 hybrid，占稀疏一路

## 学到什么

1. **稀疏不等于落后**：把"哪些词重要"做到神经网络级别，依然能与稠密向量打平
2. **基建复用是工程的最高效率**：换权重不换引擎，迁移成本接近零
3. **正则项要对齐真实指标**：FLOPS 直接约束乘法次数，比 L1 更接近 latency
4. **扩展可以隐式发生**：MLM 头本来就预测被遮的词，让它自然产出相关词，比另起生成式模型更简洁
5. **两派打架时，往往最有机会的是合派**：BM25 派与 BERT 派各执一端时，SPLADE 把两边优点钉在一起

## 延伸阅读

- 论文 PDF：[SPLADE SIGIR 2021](https://arxiv.org/abs/2107.05720)（原版公式与实验）
- 官方实现：[naver/splade GitHub](https://github.com/naver/splade)（训练脚本与 checkpoint）
- 实战集成：[Pyserini SPLADE 教程](https://github.com/castorini/pyserini)（MS MARCO 最快跑通路径）
- HF 模型卡：[splade-cocondenser-ensembledistil](https://huggingface.co/naver/splade-cocondenser-ensembledistil)（常用强基线）
- 后续版本：[SPLADE v2](https://arxiv.org/abs/2109.10086)（max-pooling + 蒸馏 + 难负样本）

## 关联

- [[anserini-2017]] —— Lucene 之上的 IR 工具链，SPLADE 实验主要在它上面跑
- [[colbert-2020]] —— 后期交互的稠密派代表，与 SPLADE 是同时代的两条路线
- [[bm25-1994]] —— 经典稀疏基线，SPLADE 用的倒排索引就是为它设计的
- [[dpr-2020]] —— 稠密双塔的代表，SPLADE 在 MS MARCO 上对标的对手
- [[doc2query-2019]] —— 显式文档扩展，与 SPLADE 的隐式扩展形成对照
- [[deepct-2020]] —— 用 BERT 重加权 BM25 词频但不扩展，SPLADE 的直接前驱
- [[ms-marco-2016]] —— SPLADE 训练和评测的主要数据集

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bm25]] —— BM25 — 用概率框架给搜索结果排队
- [[cocondenser-2021]] —— coCondenser — 让 BERT 的 [CLS] 在预训练就学会"代表整段话"
- [[contriever-2021]] —— Contriever — 不用人工标注也能训练稠密检索器
- [[doc2query-2019]] —— doc2query — 让模型替文档预想"会被怎么搜"再写进倒排表
- [[e5-2022]] —— E5 — 用海量"自然出现的文本对"训通用 embedding
