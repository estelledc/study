---
title: BM25 — 给文档打分的"老配方"
来源: 'Robertson & Walker, "Some Simple Effective Approximations to the 2-Poisson Model for Probabilistic Weighted Retrieval", SIGIR 1994'
日期: 2026-05-31
分类: 数据检索
难度: 入门
---

## 是什么

BM25 是一个**给文档打分**的公式：你给它一个查询（query），它告诉你每篇文档有多相关，按分数排序。日常类比：图书馆员收到"找讲发酵的书"，他不是逐字背书，而是按经验给每本书打个相关度分——书名出现"发酵"加几分，整本提到 50 次再加分，但加到一定程度就不再加了；这本书有 800 页 vs 那本只有 80 页，前者命中一次显然没后者重要。BM25 就是把这套图书馆员的直觉**写成了一个公式**。

名字来历：City University London 在 80 年代末做了一个信息检索实验系统叫 **Okapi**（一种非洲长颈鹿亲戚），里面试过 BM1、BM11、BM15…到第 25 个版本（**Best Match 25**）实证最稳，沿用至今。

## 为什么重要

不理解 BM25，下面这些事都没法解释：

- 为什么 Lucene / Elasticsearch / OpenSearch **默认排序**还是它（不是神经网络）
- 为什么 RAG 系统都在做 **hybrid retrieval**（一边 BM25 一边 dense embedding）而不是只用向量
- 为什么搜 `CVE-2024-1234` 这种 ID、产品型号、人名时，纯向量检索会丢，BM25 不会
- 为什么 1994 年的公式在现代 LLM 系统里还常坐在第一道闸门

## 核心要点

BM25 给"查询 Q 和文档 D"的得分，由**三块**叠加，每块都对应一个图书馆员直觉：

1. **TF（词频，term frequency）**：查询词在这篇文档出现几次。出现得多→相关。
   - 但加了个**饱和**机制：出现 100 次不会比 10 次多 10 倍分。参数 **k1**（典型 1.2-2.0）控制饱和速度。
   - 类比：一本书提"发酵"50 次和提 5 次，前者更相关，但提 500 次和 50 次差别不大——可能它就是讲这个的。

2. **IDF（逆文档频率，inverse document frequency）**：这个词在**多少文档**里出现过。出现得越少→信息量越大。
   - 类比："the""是"这种到处都是的词，没区分度，IDF 接近 0；"超临界二氧化碳"几乎只在化工书里出现，IDF 高。

3. **长度归一化（length normalization）**：短文档里命中一次比长文档里命中一次更重要。参数 **b**（典型 0.75）控制归一强度，b=0 不归一，b=1 完全归一。
   - 类比：80 页的小册子提到 3 次"发酵"和 800 页的百科全书提到 3 次，前者显然更聚焦。

公式骨架（不背，看意思就好）：

```
score(Q, D) = Σ  IDF(qi) · TF饱和(qi, D, k1, b)
             qi∈Q
```

- 把查询里每个词的"IDF × 饱和后的 TF"加起来，就是文档总分
- 整个过程**没有训练、没有神经网络、没有梯度下降**——纯统计公式

## 实践案例

### 案例 1：为什么搜产品型号 dense 会丢

你搜 `iPhone 15 Pro Max`：

- **dense embedding**：把这串压成 768 维向量，"15"和"14"在向量空间很接近 → 召回里混进 iPhone 14 Pro Max
- **BM25**：把查询切成 token `[iPhone, 15, Pro, Max]`，**字面**对每篇文档算分。`15` 这个 token 在 iPhone 14 的文档里压根不出现，IDF 直接把它过滤掉

**结论**：精确名词（型号、CVE 编号、人名、代码 identifier）**dense 不可靠**，必须有 BM25 这一路兜底。

### 案例 2：参数 k1 和 b 在调什么

```python
# 用 rank_bm25 库（最简单的 Python 实现）
from rank_bm25 import BM25Okapi

corpus = [
    "发酵 是 把 糖 变成 酒精 的 过程".split(),
    "酿酒 历史 悠久 涉及 复杂 发酵 工艺".split(),
    "面包 也 用 发酵 但 是 二氧化碳".split(),
]
bm25 = BM25Okapi(corpus, k1=1.5, b=0.75)
scores = bm25.get_scores(["发酵", "酒精"])
# scores = [2.31, 0.41, 0.32]  第 0 篇命中两个查询词且最短，得分最高
```

- 把 `k1` 从 1.5 降到 0.5：高频词得分压得更狠，结果更平均
- 把 `b` 从 0.75 降到 0：完全不归一，长文档容易高分
- **没有放之四海皆准的参数**——新闻 vs 代码 vs 中文 vs 短文档都需要重调

### 案例 3：现代 RAG 的 hybrid 检索

```
查询 → ┬─→ BM25      ─→ top 50 (字面命中)  ┐
       └─→ dense emb  ─→ top 50 (语义近似)  ┴─→ RRF 融合 → top 10
```

- BM25 抓**字面信号**（型号、专有名词、罕见词）
- dense 抓**语义信号**（"kill process" 约等于 "terminate thread"）
- **RRF**（Reciprocal Rank Fusion，倒数排名融合）把两路结果合起来——按排名而非分数融合，避免 BM25 0-30 vs dense 0-1 的尺度错配

### 案例 4：手算一次 IDF 体会"罕见词更值钱"

假设语料库一共 1000 篇文档：

- "的" 在所有 1000 篇里都出现 → IDF ≈ log(1000/1000) = 0，**贡献 0 分**
- "发酵" 在 50 篇里出现 → IDF ≈ log(1000/50) ≈ 3.0
- "超临界二氧化碳" 在 2 篇里出现 → IDF ≈ log(1000/2) ≈ 6.2

所以查询"超临界二氧化碳 的 发酵"，三个词的得分权重大约是 6.2 : 0 : 3.0——**罕见词主导排序**，停用词被自动忽略。这就是 BM25 不需要手工去停用词也能跑的原因（虽然去掉能省时间）。

## 踩过的坑

1. **中文不分词直接 BM25**：单字粒度噪声大，必须先 jieba 之类分词成词组。
2. **k1 b 用默认值**：默认是新闻语料上调出来的，代码搜索、商品描述、短问答场景需要重调。
3. **stopwords 不去**：很多停用词 IDF 接近 0 但仍占算分时间，去掉提速明显。
4. **直接相加 BM25 分和 cosine 分**：尺度差 10 倍以上，会偏向一方。要用 RRF 或先 min-max 归一。
5. **以为 BM25 懂同义词**：它**不懂**。"卡车"和"货车"是两个不同的 token，分数不会因为含义近就合并。语义层必须靠 dense 或同义词词典。
6. **TF 没饱和的版本（直接 TF-IDF）**：早期实现用线性 TF，一个高频词就能压倒一切，BM25 的"饱和"机制是关键改进点之一。

## 适用 vs 不适用场景

**适用**：
- 字面匹配为主的检索（产品库、代码库、日志、ID 查询）
- 冷启动场景——BM25 不需要训练数据，开箱可用
- 作为 hybrid retrieval 的一路，配合 dense

**不适用**：
- 跨语言检索（"car" vs "汽车"）→ 需要 dense 或翻译
- 同义词检索（"卡车" vs "货车"）→ BM25 当作两个词
- 需要理解语义关系（"杀进程" vs "终止线程"）→ 必须 dense

## 历史小故事（可跳过）

- **1976 年**：Robertson 和 Sparck Jones 写概率检索模型（PRP），证明"按相关概率排序"理论上最优——但公式没法直接算。
- **80 年代末**：City University London 的 Okapi 项目开干，试 BM1、BM11、BM15…一个个版本调。
- **1994 年**：Robertson & Walker 在 SIGIR 发论文，形式化 **BM25**——把 PRP 的理论近似成一个能算的公式。
- **1995 年**：TREC-3 评测 BM25 成绩压倒性，成为新基线。
- **2016 年前后**：Lucene 6 / Elasticsearch 5 默认排序转向 BM25，传统检索基线进入更多工程系统。
- **2020 年代**：RAG 兴起，BM25 + dense 的 hybrid 重新成为主流。

## 学到什么

1. **简单统计 + 几个超参数**就能做出 30 年不过时的工业级排序——不是所有问题都需要神经网络
2. **饱和 + 长度归一化**这两个直觉非常 portable，做任何排序公式都能借鉴
3. **dense 不是万能**——精确名词、罕见词、ID 这些场景，字面匹配是不可替代的兜底
4. **理论 → 工程实证 → 产品默认**：1976 PRP → 1994 BM25 → 2010s 搜索引擎默认，每一步都要十多年
5. **基线很重要**：任何号称"我比 BM25 强"的检索方法，先在同一份测试集上跑一遍 BM25 才有说服力——这条规矩从 TREC 一路传到今天的 BEIR / MTEB

## 延伸阅读

- 论文 PDF：[Robertson & Walker SIGIR 1994](https://www.staff.city.ac.uk/~sb317/papers/sigir94_bm25.pdf)
- 综述：[Robertson, "The Probabilistic Relevance Framework: BM25 and Beyond" (FnTIR 2009)](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf)
- 实操：[rank_bm25 Python 库](https://github.com/dorianbrown/rank_bm25)（30 行能跑起来）
- [[tfidf-classic]] — BM25 的前身
- [[dense-retrieval-dpr]] — 稠密检索的代表

## 关联

- [[tfidf-classic]] —— TF-IDF 是 BM25 的直接前身，BM25 在它基础上加饱和和长度归一
- [[dense-retrieval-dpr]] —— 稠密检索靠语义，BM25 靠字面，互补
- [[rrf-fusion]] —— BM25 和 dense 两路结果常用 RRF 融合
- [[lucene]] —— Lucene 6 起把默认排序换成 BM25

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
