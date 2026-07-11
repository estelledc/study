---
title: RRF — 把多个搜索结果列表合并成一个的最简单办法
来源: Cormack, Clarke & Buettcher, "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods", SIGIR 2009
日期: 2026-05-31
分类: 数据检索
难度: 入门
---

## 是什么

RRF（Reciprocal Rank Fusion，倒数排名融合）是一招**把好几个搜索系统给出的结果列表合并成一个最终列表**的算法。

日常类比：你想找一家好吃的火锅店，问了三个朋友各推荐 10 家。每个朋友的"第 1 名"都不一样。怎么综合？RRF 的办法是：

- 一家店在朋友 A 排第 1，给它 `1/(60+1)` 分
- 同一家店在朋友 B 排第 5，再加 `1/(60+5)` 分
- 朋友 C 没推荐？这家店从 C 那拿 0 分
- 把三个朋友的分数加起来，**总分最高的就是合并后的第 1 名**

公式：

```
RRFscore(d) = Σ_i  1 / (k + r_i(d))
```

`r_i(d)` 是文档 `d` 在第 i 个列表里的排名（从 1 开始），`k` 是常数（论文推荐 `k=60`）。

## 为什么重要

不懂 RRF 没法解释这些事：

- 为什么现在 RAG 系统几乎都同时跑 BM25（关键词）和 embedding（语义），最后用 RRF 合并
- 为什么 Elasticsearch 8.8+ 直接把 RRF 内置进 `rank` API、默认 `rank_constant=60`
- 为什么 LangChain 的 `EnsembleRetriever`、Weaviate、Vespa、Qdrant 全部支持 RRF
- 一篇 **2 页**短文，2009 年发表，2020 年后随 RAG 重新走红；引用量随统计源变化，大约数百到上千

## 核心要点

RRF 的设计哲学可以拆成 **三句话**：

1. **只看排名，不看分数**。BM25 输出的分（比如 12.3）和 embedding 的余弦相似度（比如 0.87）量纲完全不同，直接加会出乱子。RRF 干脆只用"第 1 第 2 第 3"，跨系统天然可比。

2. **倒数 + 偏置 = 头部重要但不独裁**。`1/(k+r)` 在 r=1 时最大，r 越大衰减越快。但加了 `k`（不是 `1/r`）防止"第 1 名"碾压式独大——`1/(60+1)≈0.0164`，`1/(60+2)≈0.0161`，差距很小。

3. **k=60 是经验值**。作者在 TREC 数据集上扫了 `k∈[0, ∞)`，发现 60 附近多组测试集都接近最优。论文没给数学解释，**纯实验**得出。后人也基本沿用。

合起来：无需训练、无需归一化、无需调参（除了 k）、O(n) 一次过。简单到不像 SIGIR 论文。

## 实践案例

### 案例 1：典型 RAG 检索召回

用户问"如何用 Python 读取 CSV"。

- BM25 召回（关键词）：`[A=Python读CSV教程, B=pandas文档, C=CSV标准RFC4180]`
- Embedding 召回（语义）：`[D=数据导入示例, A=Python读CSV教程, E=Excel互转]`

RRF 合并（k=60）：

| 文档 | BM25 排名 | Embedding 排名 | RRF 分 |
|------|----------|---------------|--------|
| A    | 1        | 2             | 1/61 + 1/62 ≈ 0.0325 |
| B    | 2        | -             | 1/62 ≈ 0.0161 |
| D    | -        | 1             | 1/61 ≈ 0.0164 |

A 在两边都靠前，分最高，最终排第 1。这就是"两边都看好的文档优先"。

### 案例 2：为什么不直接加分

分三步看清问题：

1. **量纲不同**：BM25 可能是十几，余弦相似度卡在 0–1，不能直接比大小。
2. **大分压死小分**：天真做法 `BM25 + cosine` 时，`A: 12.3+0.87=13.17`，`B: 11.5+0.91=12.41`——BM25 差 0.8 就碾压余弦那 0.04。
3. **RRF 只用名次**：融合时必须先归一化（min-max / z-score 各有偏差）；RRF 绕开分数，**根本不用分数**。

### 案例 3：Elasticsearch 8.8+ 用法

```json
POST /my-index/_search
{
  "rank": { "rrf": { "rank_constant": 60, "rank_window_size": 100 } },
  "query":  { "match": { "title": "python csv" } },
  "knn":    { "field": "embedding", "query_vector": [...], "k": 50 }
}
```

`rank_constant: 60` 就是论文里的 `k`。ES 跑两路检索（match 和 knn），各取 top-100，按 RRF 融合返回。`query_vector: [...]` 是占位，实跑时换成模型算出的真实向量。

## 踩过的坑

1. **k=60 不是万能**：列表很短（只有 top-10）时 60 显得太大，建议调小到 10-30；列表很长（top-1000）时 60 反而能稳住。

2. **列表独立性假设**：RRF 默认各列表是独立信息源。如果你跑两个 BM25 只是参数微调，它们高度相关——RRF 会**把它们的偏差互相加强**，结果反而变差。

3. **rank 1 和 rank 2 几乎同分**：`1/61 - 1/62 ≈ 0.00027`，差距小到忽略不计。如果你需要"第 1 名要明显比第 2 名重要"，RRF 不适合，去用 weighted RRF 或学习排序。

4. **量级差异大的列表被 1:1 对待**：一个高质量召回 + 一个全是噪声的召回，RRF 把它们等权合并，噪声列表会拉低结果。生产里通常给每个列表一个权重 `w_i / (k+r)`。

## 适用 vs 不适用场景

**适用**：

- RAG 多路召回融合（BM25 + 向量 + 标签 + 重排序前置）
- 异构系统结果合并：分数量纲完全不同时
- 没有训练数据 / 不想搭学习排序流水线
- 中文混合检索：jieba+BM25 抓精确词、embedding 抓同义词

**不适用**：

- 列表来自同源系统（高度相关）→ 改用 weighted RRF 或重新设计召回
- 需要"头部强权重"的场景（推荐系统首屏）→ 用幂律 `1/r^p` 或学习排序
- 已有充足训练数据 → 直接训 LambdaMART / cross-encoder 重排序更准
- 列表里分数本身有信息（点击率、转化率）→ 用 score-based 融合更划算

## 历史小故事（可跳过）

- **1994 年**：Fox 和 Shaw 提 `CombSUM` / `CombMNZ`——把各系统分数归一化后相加。这是融合的起点，但归一化本身是难题。
- **2000 年代**：学界跑 Condorcet 投票法、Borda count，效果都不稳，O(n^2) 计算还慢。
- **2009 年**：Waterloo 三人组发现"**只用排名 + 倒数 + 偏置常数**"反而最稳。两页短文塞进 SIGIR poster track，几乎没人当回事。
- **2020 年后**：RAG 火起来，工程师重新发现 RRF 简单到爆且效果好，主流向量数据库全部内置。引用量从早期几十升到数百乃至上千（随 Google Scholar / ACM 等统计源而异）。

简单 + 没参数 + 抗噪 = 工程师最爱。

## 学到什么

1. **排名是比分数更鲁棒的信号**——量纲、分布、单位都不重要了，这是 RRF 的核心洞见
2. **加常数 k 防止头部独裁**——`1/(k+r)` 比 `1/r` 多一个偏置，看似小改动改变了整个算法的稳定性
3. **k=60 是经验值**，不是理论推出来。工程上拿来即用，遇到短列表/长列表再微调
4. **简单算法 + 工程时机** 大于 复杂算法。2009 年没人重视，2020 年成 RAG 标配，差的是应用场景成熟

## 延伸阅读

- 论文 2 页 PDF：[Cormack-Clarke-Buettcher 2009](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)（一坐就读完）
- Elasticsearch 文档：[Reciprocal rank fusion](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html)（含 API 用法）
- 视频：["What is RRF in hybrid search"](https://www.youtube.com/results?search_query=reciprocal+rank+fusion+rag)（搜任意一个 RAG 教程几乎都讲）
- [[bm25]] —— RRF 最常合并的稀疏检索方法之一
- [[dpr-karpukhin]] —— 现代密集检索的代表，与 BM25 互补

## 关联

- [[bm25]] —— 关键词检索经典，RRF 的常见输入之一
- [[dpr-karpukhin]] —— 密集向量检索，与 BM25 通过 RRF 融合是 RAG 标配
- [[learning-to-rank]] —— 当数据足够时的更精准替代方案
- [[fox-shaw-combsum]] —— RRF 的前辈，分数级融合的起点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bm25]] —— BM25 — 用概率框架给搜索结果排队
- [[okapi-bm25-1994]] —— Robertson-Walker 1994 — 把 2-Poisson 压成一行能算的公式
- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度
