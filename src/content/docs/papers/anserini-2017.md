---
title: Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台
来源: 'Yang, Fang & Lin, "Anserini: Enabling the Use of Lucene for Information Retrieval Research", SIGIR 2017'
日期: 2026-05-31
分类: 数据检索
难度: 入门
---

## 是什么

Anserini 是一个**架在 Apache Lucene 上的信息检索（IR）研究工具包**。日常类比：Lucene 像一台工业级的洗衣机——又大又快，能洗一座城市的衣服，但旋钮全是工厂内部代号。Anserini 给它加了一块"研究员面板"，把学术界常用的 BM25 调参、TREC 测试集、qrels 评测全摆到台面上。

你只要写：

```bash
target/appassembler/bin/SearchCollection \
  -index lucene-index.robust04 \
  -topics topics.robust04.txt \
  -output run.robust04.bm25.txt -bm25
```

就能拿一个标准的 BM25 baseline 在 TREC Robust04 上跑出可复现结果。**不用再自己写 30 行 Lucene 样板代码**。

这个工具包后来衍生出 [Pyserini](https://github.com/castorini/pyserini)（Python 绑定），是 2020 年后 dense retrieval / BERT 重排序论文里几乎人手一份的"第一阶段召回"标配。

## 为什么重要

不理解 Anserini 出现的背景，下面这些事都没法解释：

- 为什么 2017 年前学术 IR 论文几乎都用 [[indri-2005]] / Galago / Terrier，而工业界用的全是 Lucene
- 为什么这条沟存在了 15 年——学术工具不能上生产，工业工具不能跑 TREC
- 为什么"加个壳"也能进 SIGIR——它解决的是社区基础设施而非算法新颖
- 为什么 BERT 时代第一阶段检索还是 BM25 不是神经网络——因为 Anserini 把 BM25 调到了 SOTA

## 核心要点

Anserini 的全部贡献可以拆成 **三件事**：

1. **TREC 工作流接入**：Lucene 原生不懂 TREC topic 文件、不懂 qrels（人工标注的相关性），Anserini 写了解析器和评测胶水。类比：洗衣机原本只认洗衣袋，研究员要塞进去的是 TREC 标准信封——Anserini 加了个转接口。

2. **常用 IR 算法成开关**：BM25、Query Likelihood、RM3 伪相关反馈、Axiomatic 语义匹配，都做成命令行开关。学术 IR 长期纠结的"调参可复现性"问题——同一个 BM25，Indri 和 Lucene 的 b、k1 默认值不一样，结果差 5 个百分点——Anserini 把每个参数都暴露出来。

3. **测试集开箱即用**：TREC Robust04、ClueWeb09b、ClueWeb12-B13、Tweets2011/2013、Core17/Core18 都有现成索引脚本和回归测试。新方法发表前，先用 Anserini 跑一遍当 baseline，就是社区共识。

三件事加起来叫 **可复现的 IR baseline 基础设施**。

## 实践案例

### 案例 1：跑一个 TREC Robust04 BM25 baseline

```bash
# 1. 索引（Robust04 数据集约 50 万文档）
target/appassembler/bin/IndexCollection \
  -collection TrecCollection -input /path/to/disk45 \
  -index lucene-index.robust04 -threads 8

# 2. 检索
target/appassembler/bin/SearchCollection \
  -index lucene-index.robust04 \
  -topics src/main/resources/topics-and-qrels/topics.robust04.txt \
  -output run.robust04.bm25.txt -bm25

# 3. 评测
eval/trec_eval.9.0.4/trec_eval -m map -m P.30 \
  qrels.robust04.txt run.robust04.bm25.txt
```

跑出来 MAP 大约 0.2531，和论文报告的数字精确对上。这就是"可复现"——任何研究员、任何机器、跑出来都一样。

### 案例 2：BM25 + RM3 伪相关反馈

```bash
target/appassembler/bin/SearchCollection \
  -index lucene-index.robust04 \
  -topics topics.robust04.txt \
  -output run.robust04.bm25-rm3.txt \
  -bm25 -rm3
```

加 `-rm3` 一个开关，MAP 从 0.2531 升到 0.2903。这种"加一个开关换一个数字"的 ablation 研究，没 Anserini 之前要写两小时代码。

### 案例 3：Pyserini 做 BERT rerank 的第一阶段

```python
from pyserini.search.lucene import LuceneSearcher

searcher = LuceneSearcher.from_prebuilt_index('robust04')
hits = searcher.search('information retrieval evaluation', k=1000)
# hits 是 BM25 召回的 top-1000 候选
# 后面送给 BERT cross-encoder 重排
```

BERT 重排序论文常见做法：BM25 召回 1000 → BERT 精排前 100。Anserini / Pyserini 几乎垄断了这个"第一阶段"。

## 踩过的坑

1. **工程贡献能否进顶会**：Anserini 一作 Peilin Yang 当时是博士生，作品没新算法，只是"把现有东西胶水起来"。SIGIR 短文版接收的关键是社区**实际痛**——评审人都吃过"Lucene 默认 BM25 跑出来比 Indri 差"的亏。

2. **Lucene 默认参数的陷阱**：早期 Lucene `BM25Similarity` 的 k1 默认是 1.2、b 是 0.75，但学术界 b 常用 0.4。直接拿 Lucene 当 baseline 会得到偏低分数，让人误以为 BM25 弱。Anserini 显式暴露这两参数，避免误判。

3. **TREC topic 编码地雷**：Robust04 的 topics 文件混了 ASCII 和 ISO-8859-1，Lucene 默认 UTF-8 解析会丢字符。Anserini 内置了多编码探测——这种细节不写在论文里但能毁掉一个 baseline。

4. **回归测试是论文之外的护城河**：仓库里有 `regression/` 目录，对每个测试集每个算法都有目标分数。任何 PR 改动跑一遍回归，分数不对就拒。这种工程纪律比论文重要。

## 适用 vs 不适用场景

**适用**：

- 学术 IR 论文的 BM25 / QL / RM3 baseline——直接 Anserini 跑
- 给 dense retrieval 新方法找对照——Anserini BM25 是公认强基线
- TREC 测试集的快速实验——Robust04 / ClueWeb / MS MARCO 全套
- 教学：让学生几小时上手做检索实验

**不适用**：

- 端到端神经检索训练——那是 PyTorch 的事，Anserini 只管召回
- 中文搜索的复杂分词——默认 Lucene 标准分词器对中文支持有限，要自己接 IK / jieba
- 真正的工业搜索引擎——直接上 Elasticsearch / OpenSearch，别拿 Anserini 当生产系统

## 历史小故事（可跳过）

- **2010 年代初**：学术 IR 长期分裂——UMass 的 Indri、CMU 的 Lemur/Galago、格拉斯哥的 Terrier 各有一派，工业界全用 Lucene。
- **2015 年**：Jimmy Lin（滑铁卢大学）开始推动 Anserini，初衷是让自己研究组的 Twitter 检索工作能直接对接工业。
- **2017 年**：SIGIR 短文版发表，得到 Best Short Paper Honorable Mention。
- **2018 年**：JDIQ 期刊扩展版发表完整可复现实验。
- **2019 年**：Pyserini 出现，把 Anserini 包进 Python，赶上 BERT 重排序浪潮。
- **2020 年后**：MS MARCO / TREC Deep Learning Track 几乎全部论文用 Anserini 作为第一阶段。

## 学到什么

1. **工程贡献也是研究贡献**——只要它真的解决了社区基础设施问题
2. **可复现是 baseline 的命**——隐式默认值能让相同算法的实现差 5 个点
3. **包装现有工具**比从零写新工具的杠杆大得多——Lucene 已有 15 年优化，重写不如重用
4. **基础设施工作的回报是滞后的**——Anserini 真正爆发是 BERT 时代来了之后

## 延伸阅读

- 项目仓库：[castorini/anserini](https://github.com/castorini/anserini)
- Pyserini 仓库：[castorini/pyserini](https://github.com/castorini/pyserini)
- 论文 SIGIR 2017 短文：[Anserini: Enabling the Use of Lucene for IR Research](https://dl.acm.org/doi/10.1145/3077136.3080721)
- JDIQ 2018 扩展版：[Anserini: Reproducible Ranking Baselines Using Lucene](https://dl.acm.org/doi/10.1145/3239571)
- [[indri-2005]] —— 上一代学术 IR 工具包代表，Anserini 取代它的目标
- [[lucene]] —— Anserini 的工业级底座（待补）

## 关联

- [[indri-2005]] —— 上一代学术 IR 系统，Anserini 直接对标
- [[bm25]] —— Anserini 默认且最常用的检索算法（待补）
- [[trec]] —— 测试集与评测协议来源（待补）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ance-2020]] —— ANCE — 让模型自己挖训练负例，对比学习的"自给自足"
- [[anh-moffat-2005]] —— Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码
- [[block-max-wand-2011]] —— Block-Max WAND — 给倒排索引加分块上界，跳过算不过 top-k 的整块
- [[bm25]] —— BM25 — 用概率框架给搜索结果排队
- [[brill-moore-2000]] —— Brill-Moore 2000 — 把拼写纠错的编辑操作从单字符扩成任意子串
- [[colbert-2020]] —— ColBERT — 让 BERT 检索既准又能扛大规模
- [[croft-harper-1979]] —— Croft-Harper 1979 — 没有相关性反馈也能跑概率检索
- [[doc2query-2019]] —— doc2query — 让模型替文档预想"会被怎么搜"再写进倒排表
- [[dpr-2020]] —— DPR — 用 BERT 双塔把检索从 BM25 时代拉进稠密向量时代
- [[drmm-2016]] —— DRMM — 检索里的匹配是相关性不是语义相似
- [[dssm-2013]] —— DSSM — 把 query 和文档各编码成 128 维向量再算余弦
- [[gbrank-2007]] —— GBRank — 把决策树堆起来学排序，一棵树纠正一处错排
- [[knrm-2017]] —— K-NRM — 用核函数把交互矩阵变成可微排序信号
- [[lambdarank-2006]] —— LambdaRank — 跳过定义损失函数，直接把梯度写出来
- [[lsh-indyk-1998]] —— LSH — 让相似点撞同一个桶，把高维最近邻查询从线性变成亚线性
- [[ms-marco-2016]] —— MS MARCO — 约百万 Bing 真实查询喂饱神经检索的标准评测集
- [[ranknet-2005]] —— RankNet — 让搜索引擎学会比较两个结果谁更好
- [[rm3-2001]] —— RM3 — 让搜索引擎自己看一眼结果再重搜一次
- [[rocketqa-2021]] —— RocketQA — 把稠密检索的训练拧到工业级
- [[splade-2021]] —— SPLADE — 让神经网络学出稀疏向量，直接复用倒排索引
- [[tfidf-classic]] —— TF-IDF Classic — 给搜索词分清轻重缓急
