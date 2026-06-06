---
title: Croft-Harper 1979 — 没有相关性反馈也能跑概率检索
来源: W. B. Croft & D. J. Harper, "Using Probabilistic Models of Document Retrieval Without Relevance Information", Journal of Documentation 35(4), 285-295, 1979
日期: 2026-05-31
子分类: 检索与排序
分类: 信息检索
难度: 中级
provenance: pipeline-v3
---

## 是什么

这篇论文解决了 1976 年 Robertson-Sparck Jones 概率检索模型（**BIM**，二元独立模型）的**冷启动**问题：原版要求知道每个查询词在"相关文档"里出现的概率，但你刚拿到一堆陌生文档时，根本没相关性数据可估。Croft 和 Harper 干了一件事——**直接假设"相关概率"对所有词是一个常数（典型 0.5）**，公式里这一项立刻退化成只跟"含该词的文档数"有关的量，也就是 IDF 的概率版本。再叠加一个简单的"文档内词频 tf"项，BIM 第一次在零相关性数据下能跑。

日常类比：你想给一桌子菜打分，但没人尝过、不知道哪盘好吃。Robertson-Sparck Jones 说"按好吃概率排序最优"，Croft-Harper 说"那就先假设大家口味一样、都给中位数，反正排序时常数会被消掉"。看起来粗暴，但**排序结果出乎意料地稳**。

工程意义：从这一刻起，**概率 IR 不再是"有标注数据才能玩"的学术玩具**，可以直接铺到任何新语料上。

## 为什么重要

不理解 1979 这步近似，下面这些事都没法解释：

- 为什么 BM25 的 IDF 项写成 `log((N-df)/df)` 而不是 Salton 1972 频率论的 `log(N/df)`——前者来自 Croft-Harper 的概率推导
- 为什么 1979 之后 BIM 真正进了工业系统（之前 3 年没人能跑）
- 为什么 Croft 在 UMass 建立的 CIIR（信息检索研究中心）能影响 30 年 IR 研究——本论文是 Croft 学派的开山级工作之一
- 为什么 BM25 能在 1994 年"接力"出来——它替换的就是本文里那个**线性 tf 项**，而 IDF 形式直接沿用

## 核心要点

**论文要解决的难题**：1976 年 Robertson-Sparck Jones 证明概率排序原理（PRP）—— 按 P(相关 | 文档) 排序最优。展开这个概率，关键是估每个查询词 q 的两个量：

- p_i：q 出现在相关文档里的概率
- u_i：q 出现在不相关文档里的概率

**但是**：相关文档是用户告诉你的，初次检索时根本没人告诉你。BIM 公式里 p_i 估不出来，整个模型瘫痪。

**Croft-Harper 的两步硬核简化**：

1. **对所有词假设 p_i 相同**（典型 0.5）：词权重里 p_i 这一项变成常数，对排序无影响（排序只看相对大小）；u_i 用语料估计——n_i / N（含该词的文档数 / 总文档数）。代入 BIM 权重后，结果是 `log((N-n_i)/n_i)`，这就是 IDF 的概率版本。

2. **加一个 tf 项**：BIM 原版只看"词出现/不出现"（二元），完全忽略一个词在文档里出现 10 次和 1 次的区别。Croft-Harper 直接补上一个线性的 tf 加权——文档内词频越大，得分越高。

**最终公式骨架**（不用背，看意思）：

```
score(Q, D) = C · |Q ∩ D| + Σ tf(q, D) · log((N-n_q)/n_q)
                            q∈Q∩D
```

**逐项解读**：

- `|Q ∩ D|`：查询 Q 和文档 D 共有的词数（叫 **coordination level**，命中几个词）
- `C`：平衡 coord 项和 tf-idf 项的权重常数
- `tf(q, D) · log(...)`：每个命中词的 tf-idf 概率版本

**为什么管用**：对所有词假设 p_i = 0.5 看似粗糙，但因为**所有词同样处理**，排序差异主要来自 u_i（语料统计）和 tf（文档统计），常数项被消掉。这是"假设错了但排序对了"的经典案例。

## 实践案例

### 案例 1：BIM 原版为什么不能跑

BIM 词权重是 `log((p_i (1-u_i)) / (u_i (1-p_i)))`。

- p_i = 0.5 假设代入 → 分子 = 0.5(1-u_i)，分母 = 0.5 u_i
- 化简 → `log((1-u_i)/u_i)`
- u_i 用 n_i / N 估 → `log((N-n_i)/n_i)`

**这就是 IDF 概率版**。同样形式 15 年后被 BM25 沿用（带 +0.5 平滑）。

### 案例 2：coordination level 是什么意思

查询 `深度学习 优化器`，3 篇文档：

- A 同时含 `深度学习` 和 `优化器` → `|Q∩D| = 2`
- B 只含 `优化器` → `|Q∩D| = 1`
- C 只含 `深度学习` → `|Q∩D| = 1`

直觉：A 命中两个词，应该排前面。Croft-Harper 用 `C·|Q∩D|` 显式给"命中多"加分。这是"覆盖度"思想，BM25 是用 `Σ` 隐式覆盖。

### 案例 3：tf 线性项的局限

文档 D 含 `优化器` 50 次：

- Croft-Harper 公式：得分按 50 倍线性加
- BM25 公式：`50·(k1+1)/(50+k1)` ≈ 2.4 倍

**问题**：线性项让"刷词频"的文档无限上分，1994 年 Robertson-Walker 看到这个问题，把线性项换成 S 形饱和分式——这就是 BM25。**Croft-Harper 的 IDF 部分被沿用，tf 部分被替换**。

### 案例 4：为什么 p_i = 0.5 假设不离谱

直觉上"所有词相关概率都一样"听起来很错。但拆开看：

- BIM 用的是 **比值** `p_i / (1-p_i)`
- 0.5 / 0.5 = 1 → log(1) = 0 → 这一项**对所有词为 0**
- 排序差异完全来自 u_i 项 → 也就是 IDF

**结论**：p_i = 0.5 不是说"我相信所有词同等相关"，而是说"在没数据时，我让这一项不影响排序"。是工程上的**让位**，不是认知上的判断。

## 踩过的坑

1. **当成 TF-IDF 同义词**：Salton 的 TF-IDF 来自向量空间几何（cos 相似度），Croft-Harper 来自 BIM 概率推导。形式像，但来历完全不同。BM25 沿用的是概率版那条线。

2. **忽略 coordination level**：后来教材常只讲 `Σ tf·IDF`，跳过 `C·|Q∩D|`。但论文原文是两项并列的，coord 项让"命中多个词"显式加分。

3. **以为 p_i = 0.5 是猜的**：不是猜，是**故意让这一项不影响排序**。这是 Croft-Harper 的关键 trick。

4. **以为 1979 就出 BM25 了**：1979 是 IDF 概率形式 + 线性 tf。BM25 的 S 形 tf 和长度归一要等 1994 Robertson-Walker。中间 15 年，工业上跑的就是 1979 这个版本。

5. **把它当过时论文**：BM25 公式里的 IDF 项形式直接来自这里。今天每次你用 Lucene/Elasticsearch 默认排序，背后就在跑 Croft-Harper 1979 的 IDF 推导。

## 适用 vs 不适用场景

**适用**：

- 任何**没有相关性反馈数据**的字面检索（绝大多数冷启动场景）
- 教学：理解为什么 BM25 的 IDF 项不是 `log(N/df)`
- 对比理解 IR 两条历史路线——VSM（几何）vs PRP（概率）

**不适用**：

- 需要语义匹配（同义词、跨语言）→ 走 dense retrieval
- 现代神经检索（dense embedding / cross-encoder）—— 已不基于 BIM
- 短查询 + 长文档极不平衡 → 本文没做长度归一，需 1994 Robertson-Walker

## 历史小故事（可跳过）

- **1972 年**：Sparck Jones 提出 IDF（频率论 `log(N/df)`）
- **1975 年**：Harter 写 2-Poisson 模型——理论好看但算不出
- **1976 年**：Robertson + Sparck Jones 把 PRP 形式化，给出 BIM——但要相关性反馈
- **1979 年**：本论文 Croft + Harper 假设 p_i = 0.5，BIM 第一次能跑零训练数据
- **1980s**：Croft 回 UMass Amherst 建 CIIR（信息检索研究中心），影响 30 年 IR 研究
- **1994 年**：Robertson + Walker 用 S 形分式替换线性 tf，加长度归一 → BM25
- **2009 年**：Lucene 默认从 TF-IDF 切到 BM25——本文 IDF 项跟着进入主流

## 学到什么

1. **"假设错了但排序对了"是合法策略**——p_i = 0.5 看似粗糙，实际让常数项消掉、保留信息项，这是工程上的"让位"哲学
2. **桥梁论文的价值**：1976 BIM 不能跑 → 1979 加假设能跑 → 1994 替 tf 项更准。每一步只动一处
3. **理论 + 工程接力**：BIM 是理论（数学好看），1979 让它能跑（工程让位），1994 让它跑得更好（曲线 fit）
4. **零训练 baseline 的力量**：不依赖标注数据的方法在工业上活得最久。BM25 至今守第一道闸门，根子在 1979

## 延伸阅读

- 论文：[Using Probabilistic Models of Document Retrieval Without Relevance Information](https://citeseerx.ist.psu.edu/document?doi=10.1.1.108.7708)（Journal of Documentation 1979）
- 综述：Robertson 2009《Probabilistic Relevance Framework: BM25 and Beyond》—— 把 1976/1979/1994 三篇串成一条线
- 教科书：Manning-Raghavan-Schütze《Introduction to Information Retrieval》第 11 章 PRP
- [[okapi-bm25-1994]] —— 接力本文的 IDF 推导，把线性 tf 换成 S 形分式
- [[bm25-okapi]] —— BM25 工程视角

## 关联

- [[okapi-bm25-1994]] —— 1994 年用 S 形分式接力本文的线性 tf 项；本文是 BM25 的直接前身
- [[bm25-okapi]] —— BM25 工程视角；本文是其 IDF 项的概率推导来源
- [[anserini-2017]] —— 工业 BM25 的复现，跑的就是 1979→1994 这条线的最终公式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anserini-2017]] —— Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台

