---
title: Block-Max WAND — 给倒排索引加分块上界，跳过算不过 top-k 的整块
来源: Ding & Suel, "Faster Top-k Document Retrieval Using Block-Max Indexes", SIGIR 2011
日期: 2026-05-31
分类: 数据检索
难度: 中级
---

## 是什么

Block-Max WAND（**BMW**）是一套**让搜索引擎在算 top-k 文档时跳过大段不可能进榜的文档**的方法。日常类比：考试改卷只挑前 10 名，先看每个班的最高分；某个班最高分还不够现在第 10 名的分数，整个班的卷子都不用翻。

倒排索引里每个词对应一串文档。WAND（2003）已经知道"每个词列表给一个分数上界，凑不够当前 top-k 阈值就跳"。BMW 在这上面又切一刀：**把每个词列表再分成 64-128 个文档一块，每块存一个块内最大分**。这样上界从"整列表一个粗值"变成"每块一个细值"，能跳的文档多 2-5 倍。

落地结果：相同硬件、相同结果集，BMW 比 WAND **快 2-5 倍**，元数据开销不到 1%。Lucene、Tantivy、Anserini、Pisa 现在的 top-k 检索默认走这条路。

## 为什么重要

不理解 BMW，下面这些事都没法解释：

- 为什么 Lucene 9.x 的 `WANDScorer` 文档里写"with block-max impacts"——它是 BMW 不是纯 WAND
- 为什么 Tantivy 仓库里有个 `block_wand` 模块占核心位置——这是它顶住高 QPS 的发动机
- 为什么 SPLADE / 学习稀疏检索 2020 年代再起来时，工程上还在用 BMW——上层换了打分函数，下层跳块逻辑一样
- 为什么 IR 论文里"剪枝率 / 跳过率"是和"召回质量"并列的核心指标——BMW 把这件事变成可度量的工程目标

## 核心要点

BMW 的精髓是**两层上界**：列表级上界（继承自 WAND）+ 块级上界（新加）。三步：

1. **建索引时**：每个词的倒排列表按 docID 排序后，**按 64 或 128 个文档切块**，每块算一个该词在这块里的**最大贡献分**（BM25 或类似可分解评分），存在块头。

2. **查询时第一层（WAND）**：把所有查询词的列表按当前游标 docID 排序，找最小的 k 使前 k 个列表的**列表上界之和 >= 当前 top-k 阈值 θ**。第 k 个列表当前游标处的文档叫 **pivot**——它是"理论上可能进榜"的最小 docID。

3. **查询时第二层（block-max）**：找到 pivot 后，**再用块上界算一遍**——把这些列表在 pivot 所在块的 block max 加起来，如果**仍然 >= θ**，正常评分；如果**< θ**，整个块都不可能进榜，**直接跳到块尾**。

一句话：**WAND 决定看哪个文档，block-max 决定要不要真的看**。

## 实践案例

### 案例 1：跳块到底省了什么

查询 "machine learning system"，三个词，倒排列表上界分别 10/8/6，θ = 15（当前第 10 名分数）。

- WAND：排序后看前两个列表 10+8=18 >= 15，pivot 在第 2 个列表的当前游标。要去拿那个文档评分。
- BMW：拿到 pivot 后再看 block-max——假设这个 pivot 在 "machine" 的某块 max=4，"learning" 那块 max=3，4+3=7 < 15。**整块跳过**，pivot 直接推进到 max(块尾)+1。

一次决策跳过 100+ 文档的评分。**全长查询里这种跳跃发生几千次**。

### 案例 2：每个块的 max 怎么存

```
[词: "system"] → 列表上界 6.0
  块 0 (docs 1-128):   block_max = 5.2
  块 1 (docs 129-256): block_max = 3.1
  块 2 (docs 257-384): block_max = 5.8
  ...
```

每块多存 1 个 float = 4 字节。一个 1000 万文档的列表分 78125 块 ≈ 300 KB。**整个列表 PForDelta 压缩后 5-10 MB**，开销 < 5%。

### 案例 3：和纯 MaxScore 比

MaxScore（Turtle-Flood 1995）是另一条线：把词分成"必须命中"（essential）和"可选"（non-essential），θ 高时跳过 non-essential 列表。**WAND/BMW 是按 docID 推进**，**MaxScore 是按词分类**——两者**正交**，可以叠加用。Lucene 现役实现就是 MaxScore + block-max 混合。

### 案例 4：阈值 θ 从哪来

θ 是当前堆里第 k 名的分数。**冷启动时 θ=0**，所有文档都得评分，跳不掉。工程上常用**两阶段**：

1. 先扫前几千文档，把堆填满，θ 升到一个有意义的值
2. 之后开始 BMW 跳块

或者用**词级估计**预设 θ 起点（如 BM25 的某分位）。冷启动这一段是 BMW 的弱项，VBMW 没改它。

## 踩过的坑

1. **块大小不是越小越好**：64 块边界元数据多 + 缓存抖动；512 块上界又退化回 WAND。**64-128 是工业默认**。论文里 64 性能最优，Lucene 用 128。

2. **块边界要和压缩对齐**：PForDelta 一批 128 整数。块大小不取 128 的整数倍 → 解码要跨批 → 慢一倍。**先确定压缩 batch，再定块大小**。

3. **阈值更新太频繁会拖累**：每出一个新文档进 top-k 都重排上界 → 频繁缓存 miss。Lucene 用 **lazy update**——只在跳块决策时读最新 θ。

4. **block-max 在更新场景痛苦**：增量加一个文档可能改变某块的 max → 整个倒排表的部分元数据要重算。**LSM 风格分层 + 后台合并**是工业解（Elasticsearch / Lucene segment）。在线写入直接 BMW 不现实。

5. **学习稀疏检索 / 神经评分要 per-term 可分解**：BM25 满足"总分 = 各词得分之和"，所以每词上界相加是合法上界。某些 cross-attention 评分 **不可分解**，BMW 直接失效。SPLADE / uniCOIL 之所以能用 BMW，是因为它们刻意保持了可分解性。

6. **DocID 排序要稳定**：BMW 假设列表按全局 docID 顺序。如果 docID 重排（比如按 PageRank 降序）想跳得更早，整个索引要重建。**doc reordering 是单独一篇论文的研究主题**——VBMW 等论文专门讨论了这个。

7. **VBMW 不是免费午餐**：变长块边界要存额外的"块起止"位置 → 元数据多 30%。压缩率换跳块率。**默认 BMW，极致 QPS 再上 VBMW**。

## 适用 vs 不适用场景

**适用**：
- BM25 / DFR / LMD 等**可分解**评分的 top-k 检索
- 静态或准静态索引（segment-based 的 Lucene 系）
- 短到中等查询（2-10 个词）—— 词数越多 BMW 优势越大
- SPLADE / uniCOIL 等**学习稀疏检索**（保留可分解性）

**不适用**：
- 评分**不可分解**的模型（cross-encoder / 神经 reranker）
- 频繁在线更新的索引 → 块上界维护成本高
- top-k 中 k 极大（如 k=10000）→ θ 上不去，跳不动
- 全文档评分（计算每文档分数后再排序的离线场景）

## 与同家族算法的对比

| 算法 | 上界粒度 | 实现复杂度 | 跳过率 | 工业代表 |
|------|----------|------------|--------|----------|
| 全 DAAT 评分 | 无（全打分） | 极低 | 0 | 教科书基线 |
| MaxScore (1995) | 词级（essential 划分） | 低 | 中 | 早期 Indri |
| WAND (2003) | 词列表上界 | 中 | 中 | 早期搜索引擎 |
| **BMW (2011)** | **块级上界** | **中** | **高** | **Lucene/Tantivy/Anserini 默认** |
| VBMW (2017) | 变长块上界 | 高 | 极高 | Pisa 高 QPS 模式 |

**怎么选**：默认 BMW；学术极致跑分用 VBMW；只要正确性不要速度用全 DAAT。MaxScore 和 BMW 可以叠加（Lucene 现役方案就是）。

## 历史小故事（可跳过）

- **1995 年**：Turtle 和 Flood 发表 MaxScore，**第一次把"top-k 早停"系统化**——按词分 essential / non-essential。
- **2003 年**：Broder 等人在 CIKM 发表 WAND，**用 pivot 把跳过逻辑推到 docID 级**，是从那时起 IR 工业默认的"动态剪枝"方法。
- **2011 年**：Ding 和 Suel 在 SIGIR 发表 BMW，**只加了一个简单想法——块级上界——但实测加速 2-5 倍**，瞬间被工业接受。
- **2014 年前后**：Lucene `WANDScorer` 开始内置 block-max 实现，Tantivy 跟进。
- **2017 年**：Mallia 等人发表 VBMW（变长块），**让块边界自适应数据分布**，再快 30-40%。Pisa 引擎成为学术 IR 的标准跑分平台。
- **2019 年至今**：SPLADE 等学习稀疏检索把神经评分**反向适配** BMW——故意保持可分解性以便用上 BMW 跳块。这是"硬件友好"反向影响"模型设计"的一个典型例子。

## 学到什么

1. **上界紧度直接决定跳过率**：从列表上界（粗）到块上界（细），跳过率翻 2-5 倍。**精度更高的元数据是性能的一阶变量**。
2. **元数据预算 < 5% 是廉价杠杆**：1 float/block 几乎没成本，但能把 QPS 翻几倍。**先看哪些"问一次能跳一片"的小数据可以加**。
3. **算法-压缩-硬件三家对齐**：块大小要和 PForDelta batch 对齐，要和 SIMD 寄存器宽度对齐，要和 cache line 对齐。**任何一家不对齐都吃掉收益**。
4. **可分解性是检索系统的设计契约**：BM25 / SPLADE 选择保留它，cross-encoder 放弃它——前者能用 BMW，后者只能 reranker 模式。**模型设计要考虑工程链路**。
5. **简单想法 + 实测 = 工业标准**：BMW 论文核心想法 1 段话能讲清楚，但实测把它变成 15 年没人换的默认方案。**可执行的工程改进比花哨的理论值钱**。

## 延伸阅读

- 论文 PDF：[Ding-Suel 2011 SIGIR](https://www.cs.princeton.edu/~chazelle/courses/BIB/wand.pdf)（短，10 页，图清楚）
- VBMW 论文：[Mallia et al. 2017 SIGIR](https://dl.acm.org/doi/10.1145/3077136.3080780)（变长块）
- Pisa 实现：[github.com/pisa-engine/pisa](https://github.com/pisa-engine/pisa)（C++，块上界源码注释清楚）
- Tantivy block_wand：[github.com/quickwit-oss/tantivy](https://github.com/quickwit-oss/tantivy)（Rust，可读性强）
- Lucene WANDScorer：[apache/lucene WANDScorer.java](https://github.com/apache/lucene)（生产代码）
- 综述：[Tonellotto et al. 2018 — Efficient Query Processing for Scalable Web Search](https://dl.acm.org/doi/10.1561/1500000057)
- [[anh-moffat-2005]] —— 块边界要对齐的整数压缩家族
- [[anserini-2017]] —— 学术 IR 基准平台默认用 BMW

## 关联

- [[anh-moffat-2005]] —— BMW 块大小要和这家族的压缩 batch 对齐
- [[anserini-2017]] —— 该平台 top-k BM25 默认走 BMW
- [[okapi-bm25-1994]] —— BM25 的可分解性是 BMW 工作的前提
- [[salton-vsm-1975]] —— 倒排索引最初的物理实现，BMW 在它上面叠两层上界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anh-moffat-2005]] —— Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码
- [[anserini-2017]] —— Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台
- [[salton-vsm-1975]] —— Salton VSM 1975 — 把文档变成向量再用余弦比相似度

