---
title: TF-IDF Classic — 给搜索词分清轻重缓急
来源: 'Gerard Salton & Chris Buckley, "Term-weighting approaches in automatic text retrieval", Information Processing & Management 1988'
日期: 2026-07-09
分类: 数据检索
难度: 入门
---

## 是什么

TF-IDF 是一套**给词打重要性分数**的方法：一个词在当前文档里出现得多，但在整个文档库里不常见，它就更能代表这篇文档。
日常类比：你在图书馆找"发酵 酒精"，"的"出现再多也没用；"酒精"和"发酵"更像书的标签，所以应该给它们更高权重。

Salton 和 Buckley 这篇论文不是第一次发明 IDF，而是把过去二十多年里各种 term weighting 做了一次系统整理和实验比较。
它把检索里最常见的三件事放到同一张表里：词频 TF、全库稀有度 IDF、文档长度归一化。

一句话记住：TF-IDF 不是"数词出现几次"这么简单，而是**在一篇文档内部看重复，在整个集合里看稀有，再避免长文档天然占便宜**。

## 为什么重要

不理解这篇，下面这些事都很难解释：

- 为什么搜索引擎不会让"的、是、the"这种高频词主导排序
- 为什么 [[bm25-okapi]] 能被看成 TF-IDF 的工程升级版，而不是完全另起炉灶
- 为什么 RAG 里做 sparse retrieval 时，字面罕见词仍然能打赢语义相近词
- 为什么论文反复强调"单词加权"：复杂短语、词典和知识库未必比简单单词更稳

## 核心要点

TF-IDF 这篇的核心可以拆成三块：

1. **TF 看文档内部的声音大小**。类比：一篇文章反复提"向量"，它大概率真的在讲向量；但只看重复会被长文章和废话带偏。

2. **IDF 看整个集合里的稀有程度**。类比：大家都戴白色工牌时，白色不区分人；只有少数人戴紫色工牌，紫色才有识别价值。

3. **归一化看文档长度是否公平**。类比：800 页百科全书命中一次"发酵"，不该和 2 页实验记录命中一次同分；长文档需要被校正。

论文的重要贡献，是把这些组件写成可替换的编码：`b/t/n` 表示 TF 处理，`x/f/p` 表示集合频率处理，`x/c` 表示是否做长度归一。
例如 `tfc.nfx` 就表示：文档用 TF × IDF × cosine 归一，查询用增强 TF × IDF、不做查询归一。

## 实践案例

### 案例 1：手算一个词为什么更重要

```python
import math

N = 1000
tf = {"the": 20, "retrieval": 5, "tfidf": 2}
df = {"the": 1000, "retrieval": 80, "tfidf": 5}
score = {t: tf[t] * math.log(N / df[t]) for t in tf}
print(score)
```

逐部分解释：

- `tf[t]` 是这个词在当前文档里出现几次，负责奖励"本文反复讲它"
- `math.log(N / df[t])` 是 IDF，负责惩罚"全库到处都有它"
- `the` 的 TF 很高，但 IDF 接近 0，所以最后几乎不贡献排序

### 案例 2：为什么要做长度归一化

```python
short_doc = {"retrieval": 3, "vector": 2}
long_doc = {"retrieval": 3, "vector": 2, "system": 20, "data": 18}

def dot_score(doc, query):
    return sum(doc.get(t, 0) * query.get(t, 0) for t in query)

query = {"retrieval": 1, "vector": 1}
print(dot_score(short_doc, query), dot_score(long_doc, query))
```

逐部分解释：

- 两篇文档对查询词的点积一样，都是 `retrieval + vector`
- 但长文档有很多额外词，主题可能更分散
- cosine 归一会除以向量长度，让短而聚焦的文档不被长文档挤掉

### 案例 3：把论文的 `tfc.nfx` 翻成工程直觉

```python
def augmented_tf(tf, max_tf):
    return 0.5 + 0.5 * tf / max_tf

doc_weight = "tf * idf, then cosine normalize"
query_weight = "augmented_tf * idf"
print(doc_weight, query_weight)
```

逐部分解释：

- 文档侧保留原始 TF，因为长文档里词频差异能提供信号
- 查询侧用增强 TF，因为查询通常很短，不希望某个重复词过度支配
- 论文实验里 `tfc.nfx` 和相近变体在五个自然语言集合上最稳

## 踩过的坑

1. **把 TF-IDF 理解成一个固定公式**：论文比较的是一族权重方案，TF、IDF、归一化都能替换，原因是不同语料的长度和词频分布不同。
2. **只看 TF 不看 IDF**：常见词会因为出现次数高而压倒真正有区分度的词，原因是它没有利用全库统计。
3. **忘记文档长度归一化**：长文档命中机会更多，原因是词多自然更容易和查询重叠。
4. **拿特殊集合推出普遍结论**：NPL 的最佳方案不同，原因是它的查询和文档向量很短且更像受控词表，不像普通自然语言文本。

## 适用 vs 不适用场景

**适用**：

- 搜索、日志检索、代码检索这类字面 token 很重要的任务
- 没有训练数据但要快速建立排序基线的场景
- 作为 [[bm25-okapi]]、倒排索引、RAG sparse retrieval 的入门模型

**不适用**：

- 同义词、跨语言、隐含语义关系很强的检索，需要 dense embedding 或词典扩展
- 极短文本且分词质量差的场景，统计量会很不稳定
- 文档集合频繁变化却不更新 DF/IDF 的系统，权重会慢慢失真

## 历史小故事（可跳过）

- **1950s**：Luhn 等人提出用机器从文本里抽词，自动检索开始从人工索引走向统计方法。
- **1972 年**：Karen Sparck Jones 提出 term specificity，用全库出现范围解释一个词有多"专门"。
- **1975 年**：[[salton-vsm-1975]] 把文档和查询放进向量空间，用相似度排序。
- **1987 年**：这篇以 Cornell 技术报告 TR87-881 形式出现，系统比较 1800 种权重组合。
- **1988 年**：期刊版发表，成为 TF-IDF、SMART notation 和稀疏检索的经典引用。

## 学到什么

1. **简单单词也能很强**：论文回顾了短语、同义词表、知识库等复杂表示，结论是精心加权的单词基线很难被轻易打败。
2. **排序公式要同时服务召回和精确率**：高频词帮助找全，稀有词帮助排准，TF-IDF 是两者的折中。
3. **基线必须跨集合验证**：五个自然语言集合表现一致，NPL 例外，说明"最佳公式"依赖数据形态。
4. **现代检索仍在继承这套问题分解**：BM25、Lucene、Anserini 和 hybrid RAG 依然在处理 TF、IDF、长度归一这三件事。

## 延伸阅读

- 论文入口：[Salton & Buckley 1988 DOI](https://doi.org/10.1016/0306-4573(88)90021-0)
- 公开技术报告：[Cornell TR87-881](https://ecommons.cornell.edu/items/d81a71f9-8de9-4ef1-9ee2-8544cdb48372)
- [[salton-vsm-1975]] —— 先把文档变成向量，TF-IDF 再回答每个坐标该给多大权重
- [[bm25-okapi]] —— 在 TF-IDF 直觉上加入 TF 饱和和更明确的长度惩罚
- [[experiments-automatic-phrase-indexing-document-retrieval-comparison-1987]] —— 论文引用的短语索引实验，用来对比复杂表示是否真的更好

## 关联

- [[salton-vsm-1975]] —— 提供向量空间骨架，本文主要补齐权重选择
- [[bm25-okapi]] —— BM25 继承 IDF 和长度校正，并把 TF 改成饱和函数
- [[anserini-2017]] —— 现代可复现实验平台，常用 BM25/TF-IDF 做检索基线
- [[colbert-2020]] —— 神经检索仍在处理 query-document 匹配，只是把词权重换成 token 向量交互
- [[block-max-wand-2011]] —— 倒排索引加速 top-k 排序，服务的正是这类稀疏加权模型
- [[okapi-bm25-1994]] —— 从概率检索角度把经典权重进一步工程化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bm25-okapi]] —— BM25 — 给文档打分的"老配方"
