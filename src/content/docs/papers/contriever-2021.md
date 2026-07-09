---
title: Contriever — 不用人工标注也能训练稠密检索器
来源: 'Izacard et al., "Unsupervised Dense Information Retrieval with Contrastive Learning", arXiv 2021'
日期: 2026-07-09
分类: 数据检索
难度: 中级
---

## 是什么

Contriever 是一种**用无监督对比学习训练出来的稠密检索器**。日常类比：你整理一大箱资料，没有老师告诉你"这张问题卡对应哪篇文章"，但你可以把同一篇文章剪成两张卡，让模型学会"同一来源的两张卡应该靠近，不同来源的卡应该远离"。

传统 BM25 像按书名和关键词找书，词不重合就容易漏。Contriever 则把查询和文档都编码成向量，向量越接近，表示语义越可能相关。

它的关键不是发明双塔，而是证明：**即使没有 MS MARCO 这种人工/点击标注，也能靠随机裁剪文本 + 对比学习，训练出接近 BM25 的通用稠密召回器**。

这条路线后来成为理解 Atlas、RAG 和开放域问答检索器训练方式的重要背景。

## 为什么重要

不理解 Contriever，下面这些事讲不清楚：

- 为什么 RAG 系统常说"先训一个 retriever，再训 reader / generator"——retriever 不是只能靠标注数据起步
- 为什么 dense retrieval 训练里反复出现"正样本、负样本、温度、batch 内负样本、hard negatives"
- 为什么 Atlas 这类检索增强模型会把 Contriever 当作强基线或初始化来源
- 为什么无监督向量检索能在很多跨领域任务上比直接拿 BERT embedding 强得多

## 核心要点

1. **双塔编码**：查询和文档分别过同一个 BERT 编码器，再用点积算相似度。类比：先给每张卡片做一个"坐标"，搜索时只比坐标距离，不重新读完整文章。

2. **随机裁剪造正样本**：从同一段文本里随机裁两段，视为一对正样本。类比：同一本书撕下来的两页，虽然内容不完全一样，但主题大概率相近。

3. **大量负样本拉开距离**：来自其他文档的片段都是负样本，模型要把它们排到后面。类比：训练前台接待员时，不只告诉他"这两张表属于同一个客户"，还给他一堆别人的表让他学会区分。

4. **MoCo 队列扩容负样本**：Contriever 用动量编码器和队列保存旧 batch 的向量，负样本数量可以很大。类比：考试不只拿本班同学对比，还把前几届同学的答卷也拿来当干扰项。

## 实践案例

### 案例 1：无监督正样本怎么构造

一段原文：

```text
Dense retrieval maps questions and passages into vectors.
The nearest passages are used by a reader or generator.
```

训练时随机裁两段：

```text
query view: Dense retrieval maps questions
key view: nearest passages are used by a reader
```

逐部分解释：

- 两段来自同一个文本块，所以被当作正样本
- 它们不必逐词重合，只要主题相关即可
- 其他文本块裁出来的片段，就是这条样本的负样本

### 案例 2：InfoNCE 损失在做什么

简化成 Python 伪代码：

```python
score_pos = dot(query_vec, positive_vec)
score_negs = [dot(query_vec, neg) for neg in negative_vecs]
loss = -log(exp(score_pos) / (exp(score_pos) + sum(exp(s) for s in score_negs)))
```

逐部分解释：

- `score_pos` 越大，代表同源片段越靠近
- `score_negs` 越小，代表不同文档越远
- `loss` 会惩罚"正样本没排到负样本前面"的情况

### 案例 3：RAG 里怎么使用 Contriever

```python
q = encoder("谁提出了 Contriever？")
ids = ann_index.search(q, top_k=100)
docs = [passages[i] for i in ids]
answer = generator(question=q, context=docs[:5])
```

逐部分解释：

- `encoder` 是 Contriever 这类双塔检索器
- `ann_index` 里提前存好所有 passage 的向量
- generator 只读召回到的少量文档，因此检索质量会直接影响最终答案

## 踩过的坑

1. **以为无监督等于不需要数据**：它不需要人工标注，但仍需要大量 Wikipedia / CCNet 文本来做裁剪和负样本。
2. **以为随机裁剪永远比 ICT 好**：论文里随机裁剪更稳，但前提是文本块够干净、主题够集中。
3. **只看 nDCG@10 会低估价值**：Contriever 的优势常体现在 Recall@100，适合给后续 reader / reranker 提供候选。
4. **以为稠密检索必然替代 BM25**：Trec-COVID、长文档讨论等场景里，BM25 仍可能明显更稳。
5. **忽略负样本规模**：负样本太少时，对比学习会学得松散，向量空间区分度不够。
6. **把 reranker 成绩算给 retriever**：cross-encoder 重排能提高 nDCG，但 Recall@100 主要由第一阶段检索决定。

## 适用 vs 不适用场景

**适用**：

- 新领域没有标注问答对，但有大量原始文本
- RAG / 开放域问答需要先召回 100 篇左右候选文档
- 需要比 BM25 更能跨词面表达的语义召回
- 想用一个通用 retriever 迁移到多种 BEIR 风格任务

**不适用**：

- 业务只关心完全关键词匹配，且术语必须逐字命中
- 文档特别长，单向量会压丢太多局部证据
- 查询和文档需要细粒度 token 对齐，更适合 ColBERT 这类 late interaction
- 已有大量高质量标注和线上点击，直接监督训练可能更快达到目标

## 历史小故事（可跳过）

- **1990s**：BM25 成为经典词项匹配基线，快、稳、可解释，但不懂同义表达。
- **2013 年**：DSSM 把 query 和 document 各编码成向量，现代双塔召回雏形出现。
- **2019 年**：ICT 用"一句话 vs 同文档剩余部分"预训练开放域问答检索器。
- **2020 年**：DPR 用监督问答对把 BERT 双塔推到主流 RAG 场景。
- **2021 年**：Contriever 证明随机裁剪 + MoCo 能训练强无监督稠密检索器。
- **2022 年后**：Atlas 等检索增强模型把这种 retriever 训练路线接到生成模型前面。

## 学到什么

1. **检索器也能自监督预训练**：同一文本的两种视图就是天然正样本。
2. **Recall@100 和 nDCG@10 服务不同目标**：前者更像"有没有把证据捞上来"，后者更像"第一页排序好不好"。
3. **随机裁剪的朴素性很值钱**：它避免了手写任务过强的偏置，还让 query/key 分布更一致。
4. **MoCo 是工程放大器**：队列让负样本数量变大，不必把 batch size 无限堆高。
5. **预训练不是终点**：MS MARCO 微调、hard negative mining、cross-encoder rerank 仍能继续提高效果。

## 延伸阅读

- 论文 PDF：[Contriever arXiv](https://arxiv.org/pdf/2112.09118)（正文 + 附录，实验表很多）
- 代码与模型：[facebookresearch/contriever](https://github.com/facebookresearch/contriever)（可直接下载 checkpoint）
- 评测基准：[BEIR Benchmark](https://arxiv.org/abs/2104.08663)（看 zero-shot 检索泛化）
- [[dpr-2020]] —— 监督稠密检索路线，理解 Contriever 的对照组
- [[colbert-2020]] —— 保留 token 级交互，解决单向量压缩过狠的问题
- [[splade-2021]] —— 稀疏神经检索路线，与 Contriever 的稠密路线互补

## 关联

- [[dssm-2013]] —— 双塔向量检索的早期工业源头，Contriever 把塔换成 BERT 并改成无监督训练
- [[dpr-2020]] —— 用标注问答对训练 BERT 双塔，Contriever 证明无标注文本也能预训练
- [[ance-2020]] —— 强调难负样本挖掘，和 Contriever 的负样本设计属于同一训练问题
- [[ms-marco-2016]] —— Contriever 后续监督微调的重要数据集
- [[colbert-2020]] —— late interaction 代表，牺牲更多索引空间换更细粒度匹配
- [[splade-2021]] —— 神经稀疏检索代表，复用倒排索引而不是 ANN 向量索引
- [[self-rag-2023]] —— RAG 后续路线，依赖检索器先把可能有用的证据召回

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
