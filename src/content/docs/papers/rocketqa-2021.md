---
title: RocketQA — 把稠密检索的训练拧到工业级
来源: 'Qu et al., "RocketQA: An Optimized Training Approach to Dense Passage Retrieval for Open-Domain QA", NAACL 2021'
日期: 2026-05-31
分类: 数据检索
难度: 中级
---

## 是什么

RocketQA 是百度团队 2021 年提出的一套**稠密检索训练优化配方**——它不重新设计模型，而是把 DPR 的训练流程里三个被忽视的细节同时拧紧。日常类比：DPR 像一辆刚下生产线的家用轿车，能跑但每个零件都还有调校空间；RocketQA 不换发动机，只是把火花塞间隙、机油黏度、轮胎胎压同时调到最优，结果赛道圈速涨了一大截。

具体做了三件事：把多张 GPU 的负样本互相借来用（cross-batch negatives）、把 BM25 召回的硬负样本里的假负例过滤掉（denoised hard negatives）、用一个强 reranker 给海量无标注问题造伪标签做数据增强。三招叠加在 MS MARCO 和 Natural Questions 上全面超过 DPR，是中文检索社区最常被照搬的工业级 recipe。

## 为什么重要

不理解 RocketQA，下面这些事都没法解释：

- 为什么 2021 年之后所有稠密检索论文都默认报 'cross-batch negatives'，这其实是 RocketQA 推广的术语
- 为什么训练检索器时一定要有一个 cross-encoder 在旁边——它不是只用来 rerank，还在过滤训练数据
- 为什么 BM25 硬负样本不能 'BM25 召回了就直接当负例用'——里面藏着大量未标注的真相关段落
- 为什么百度 PaddleNLP 里的 rocketqa 模块成为中文 RAG 系统的事实基线

## 核心要点

RocketQA 的优化拆成 **三步**：

1. **Cross-batch negatives**：DPR 用 in-batch negatives——同一 batch 内别人的正样本就是我的负样本。RocketQA 让 N 张 GPU 通过 all_gather 把各自 batch 里的段落向量聚到一起，每个问题就有 `N × b - 1` 个负样本可用，但显存几乎没涨（只多存了别人的向量）。负样本数量决定对比学习的难度上限，这一步等于免费把训练强度拉高 N 倍。

2. **Denoised hard negatives**：DPR 用 BM25 召回 top-k 段落当硬负例，问题是这些段落里**有相当一部分其实也含答案**——只是没被人工标过。把它们当负例训练，等于告诉模型 '这个对的也是错的'，模型会学糊。RocketQA 先训一个 cross-encoder（问题 + 段落拼起来过 BERT），用它给 BM25 召回的候选打分，**只保留得分极低的当硬负例**，得分中等的全部丢掉。

3. **Data augmentation with denoised samples**：人工标注的 QA 对很贵。RocketQA 用前面那个 cross-encoder 给海量无标注问题（如搜索日志里的 query）打伪标签——cross-encoder 说 '这个段落对这个问题相关度极高' 的，就当作正例加进训练集。再加一遍训练。

三步是**串联**的：先拿基础 DPR 训一版 → 训一个 cross-encoder → 用它去噪 + 造数据 → 用扩展数据重训 retriever。每加一步都涨点，去掉任何一步都掉点。

## 实践案例

### 案例 1：Cross-batch 到底省了多少显存

设 batch size b = 16，GPU 数 N = 8。

- 普通 in-batch：每问题有 15 个负样本（同 batch 其他人的正样本）
- Cross-batch：all_gather 后每问题有 `8 × 16 - 1 = 127` 个负样本

显存代价：每张卡只多存 `(N-1) × b = 112` 个 768 维向量 ≈ 0.3 MB，可以忽略。这是典型的 **通信换计算** 思路——用一次 all_gather 的网络开销，换来对比学习正负比从 1:15 直接跳到 1:127。

### 案例 2：去噪硬负例的杀伤力

论文里有一组对照：直接用 BM25 top-100 当硬负例，MRR@10（前 10 个结果里相关文档排得有多靠前）比纯 in-batch 还**低**。去噪流程可拆成四步：

1. **召回**：用 BM25（或当前 retriever）取出 top-100 候选段落
2. **打分**：用已训好的 cross-encoder 给每个「问题 + 段落」打相关分
3. **过滤**：只保留得分极低（论文阈值 < 0.1）的当硬负例；中等分全部丢掉
4. **重训**：用去噪后的硬负例再训 dual-encoder

为什么有效？BM25 词面相关性强，top-100 里常混着未标注的真相关段落；把它们当负例等于教模型「对的也是错的」。去噪后同样候选池，MRR@10 反而涨约 3 个点——这是论文里最反直觉的实验之一。

### 案例 3：和 ANCE 的关系

[[ance-2020]] 也是 2020 年解决 'hard negatives 怎么挑' 的工作。ANCE 的做法是 **用当前 retriever 自己去全库召回硬负例，每隔几千步刷新一次**——动态硬负例。RocketQA 走另一条路：**让一个更强的 cross-encoder 来帮忙挑**——异步去噪。两条路殊途同归，工业界两种都用。

差别在工程成本：ANCE 每隔几千步要重新编码整个段落库（千万级文档过一遍 BERT），机器开销巨大；RocketQA 只在最初训一次 cross-encoder，之后就拿它当 'judge'，不需要反复刷新索引。中文社区更偏向 RocketQA 路线，因为段落库常常是亿级而非千万级。

### 案例 4：训练流程的时间分配

如果你按论文复现，时间大致是：

- 第 1 步（基础 DPR 训练）：8 GPU 一晚上
- 第 2 步（cross-encoder 训练）：8 GPU 一天
- 第 3 步（去噪 + 跑 cross-encoder 给候选打分）：8 GPU 一天（这一步是 inference，但段落多）
- 第 4 步（用扩展数据重训 retriever）：8 GPU 一晚上

总共约 4 天。比单纯 DPR 多 3 倍，但 MRR@10 涨幅在 4 个点以上——工业上算划算。如果你只有 1 张卡，建议跳过 cross-batch（它没意义），但保留去噪和增强。

## 踩过的坑

1. **Cross-encoder 训练数据从哪来**：第一步训 cross-encoder 时还没去噪样本，所以它本身也带噪。论文里靠 'cross-encoder 比 retriever 容量大' 来抵消——它能从噪声里学到更稳的相关性判断。但如果你的 cross-encoder 模型太小，整个流程会塌。

2. **All_gather 的反传**：跨卡借负样本时，别人卡上的段落向量也要能参与本卡的对比损失。原论文在 PaddlePaddle FleetX 里用的是 **differentiable all_gather**（可反传的跨卡聚合）。PyTorch 默认 `dist.all_gather` 不带梯度，社区复现常改成「别人的向量当 detached 负例」或手写带梯度的 all_gather——没做对时，常见「复现比 paper 低 1–2 个点」。

3. **伪标签的污染**：cross-encoder 的伪标签也会错。如果直接把所有 cross-encoder 高分的样本加进去，会引入系统性偏差。论文里只取 cross-encoder 极高置信度（top-k 而非 threshold）的样本，并控制每个 query 最多扩 1 个正例。

4. **复现门槛**：原论文用 8 张 V100，PaddlePaddle 实现。社区在 PyTorch 上复现时常忽略 cross-batch 的同步细节，导致 'why my reimplementation 比 paper 低 2 个点'——多半是 all_gather 没做对。

5. **去噪阈值很敏感**：cross-encoder 打分阈值定多高决定保留多少硬负例。阈值太松 → 噪声没去干净；阈值太严 → 硬负例太少，模型学不到难样本。论文给了 0.1 这个数，但不同领域要重新调（中文搜索语料就明显不同）。

6. **领域迁移会失效**：在 MS MARCO 上训出来的 RocketQA 直接用到中文医疗问答，效果会断崖式下降。因为伪标签和去噪都是基于 cross-encoder，cross-encoder 在新领域本身就不准。要重新跑一遍三步流程。

## 适用 vs 不适用场景

**适用**：

- 有多卡训练资源（cross-batch 至少要 4 GPU 才显著）
- 有大量无标注 query（搜索日志、用户问题）可造伪标签
- 已经训过一版 baseline retriever 和 cross-encoder reranker
- 工业 RAG 系统从 DPR 升级——RocketQA 是最低成本的下一步

**不适用**：

- 单卡训练——cross-batch 没意义
- 数据量极小（< 10k QA 对）——三步配方需要每一步都有足够样本
- 想 zero-shot / few-shot 检索——这是有监督训练配方
- 想用极小模型做检索——cross-encoder 容量不够，去噪信号不可靠

## 三步配方的最小心智图

```
  人工标注 QA 对
        │
        ▼
  ┌──────────────┐
  │ 基础 DPR     │  ← 第 1 步：先训一版 retriever
  │ (in-batch)   │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ Cross-encoder│  ← 第 2 步：训 reranker（容量更大）
  │ (BERT pair)  │
  └──────┬───────┘
         │
         ├─→ 给 BM25 硬负例打分 → 过滤假负例
         │
         ├─→ 给海量无标注 query 打伪标签 → 扩展训练集
         │
         ▼
  ┌──────────────┐
  │ RocketQA     │  ← 第 3 步：cross-batch + 去噪 + 增强
  │ retriever    │     一起重训
  └──────────────┘
```

读图要点：cross-encoder 既是 'reranker' 又是 'data tool'，这是 RocketQA 的核心创新点之一。

## 历史小故事（可跳过）

- **2020 年 4 月**：[[dpr-2020]] 发布，证明双塔稠密检索可行，in-batch negatives 是关键
- **2020 年 6 月**：[[ance-2020]] 提出动态硬负例，把 retriever 训得更难
- **2020 年 10 月**：RocketQA 第一版上 arXiv，把 'cross-batch + 去噪 + 增强' 三件套打包发布
- **2021 年 5 月**：NAACL 接收，百度 PaddleNLP 同步开源 rocketqa 代码库
- **2021 年 8 月**：RocketQA-v2 把 retriever 和 reranker 联合训练，进一步涨点
- **2022 年**：PAIR 用 passage-centric 损失换角度看负样本

中文检索社区从 2021 年起几乎每个 RAG 项目都会照搬 RocketQA 的配方——它的 'recipe 可复制' 是被工业验证过的。

## 学到什么

1. **数据质量 > 模型架构**：三步里两步在改训练数据（去噪 + 增强），只有一步在改训练算法（cross-batch）。这是 2020 年后稠密检索研究的主旋律——架构早就够了，配方不够
2. **GPU 间通信是被低估的优化维度**：cross-batch 几乎免费，但很多团队没用，因为 in-batch 已经 'work'
3. **强模型给弱模型当老师**：cross-encoder 给 retriever 造数据 / 去噪声，是 RAG 训练里反复出现的模式（后来的 GPL、Promptagator 都沿用）
4. **三招同时上**：单独用 cross-batch 涨 1 个点，单独去噪涨 1.5 个点，单独增强涨 1 个点——三招叠加涨 4-5 个点，超过线性。这是工程上 'recipe' 的真实价值
5. **'BM25 召回的当负例' 是常识陷阱**：DPR 论文这么写的，社区跟着这么用，没人追问 '召回的真都是负的吗'。RocketQA 这一击恰恰打在 '看似显然实则错' 的盲点上——做研究时要警惕被前人 paper 默认下来的假设

## 延伸阅读

- 论文 PDF：[RocketQA arXiv](https://arxiv.org/abs/2010.08191)（NAACL 2021，13 页好读）
- 代码：[PaddlePaddle/RocketQA](https://github.com/PaddlePaddle/RocketQA)（百度官方实现，含预训练权重）
- 后续工作：[RocketQAv2 EMNLP 2021](https://arxiv.org/abs/2110.07367)（联合训练 retriever + reranker）
- 综述：Lin et al., "Pretrained Transformers for Text Ranking: BERT and Beyond"（把 DPR / ANCE / RocketQA 放一起对比）
- [[dpr-2020]] —— RocketQA 的直接基线，必须先理解
- [[ance-2020]] —— 另一条解决硬负例的路线，对照阅读

## 关联

- [[dpr-2020]] —— RocketQA 在 DPR 双塔结构上做训练优化，模型架构没改
- [[ance-2020]] —— 同期解决硬负例问题的另一思路（动态采样 vs 异步去噪）
- [[colbert-2020]] —— 走的是 'late interaction' 而非双塔单向量，与 RocketQA 正交
- [[colbert-v2]] —— ColBERT 的训练优化版，思路上借鉴了 RocketQA 的去噪
- [[anserini-2017]] —— 稀疏检索基线 BM25 的工业实现，RocketQA 的硬负例就来自它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[e5-2022]] —— E5 — 用海量"自然出现的文本对"训通用 embedding
- [[replug-2023]] —— REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
