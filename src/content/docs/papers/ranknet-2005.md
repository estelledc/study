---
title: RankNet — 让搜索引擎学会比较两个结果谁更好
来源: Burges 等, "Learning to Rank using Gradient Descent", ICML 2005
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

RankNet 是 2005 年微软研究院提出的**用神经网络学排序**的方法。日常类比：你不让评委给每首歌打 1-10 分，而是**让评委两两比较**——"A 和 B 哪个更好听？"——然后从一堆"A 比 B 好"的判断里推出整个排行榜。

搜索引擎要做的就是这件事：给定一个 query 和 100 个候选网页，把最相关的排到前面。RankNet 不让模型猜"这页相关度是 7.3 分"（这分太难标），而是只学"i 比 j 更相关"这种两两关系。

被 MSN / Bing 直接上线，是**第一代工业级神经排序模型**。

## 为什么重要

不理解 RankNet，下面这些事都没法解释：

- 为什么搜索引擎团队不直接做"分类/回归"，要绕一圈做 pairwise——因为人标"A 和 B 谁好"比标"A 是 7.3 分"靠谱十倍
- 为什么 LambdaRank / LambdaMART（2010 年 Yahoo 挑战赛冠军）能直接长出来——它就是 RankNet 改了一行梯度
- 为什么 2024 年的 BERT reranker / cross-encoder 训练脚本里还能看到 `pairwise_loss`——同一个套路 19 年了没变
- 为什么"learning to rank"成了一个独立子领域，而不是"分类的特例"

## 核心要点

RankNet 的全部秘密就是把"排序"翻译成"概率"，让梯度下降能跑：

1. **打分函数**：每个文档 x 过神经网络，输出一个实数分数 `s = f(x; w)`。这分数本身没意义，**只用于比较**。

2. **把"谁排前"变成概率**：对一对文档 (i, j)，定义"i 排在 j 前面"的概率为

   ```
   P(i > j) = sigmoid(s_i - s_j) = 1 / (1 + exp(-(s_i - s_j)))
   ```

   分数差越大，越确信 i 在前。这一步把**不可导的"谁前谁后"**变成了**可导的概率**。

3. **交叉熵损失**：人工标注给出"真实"概率 P\* —— 1（i 该在前）/ 0（j 该在前）/ 0.5（并列）。把模型概率和真实概率算交叉熵：

   ```
   C = -P* log P - (1-P*) log(1-P)
   ```

4. **反向传播**：梯度 `dC/ds_i = sigmoid(s_i - s_j) - P*` 形式极简，照常 backprop 更新网络权重。

四步加起来：**pairwise cross-entropy + 神经网络打分 + SGD**。

注意第 2 步的设计美感：原本"i 是否排在 j 前面"是离散的 0/1，没法求导；用 sigmoid 把分数差映射到 (0,1) 之后，整条链路从输入特征到 loss 全部可导，反向传播一路到底。这种"用一个连续函数模拟离散决策"的套路在深度学习里反复出现——softmax / Gumbel-Softmax / contrastive loss 都是同一思路的变体。

## 实践案例

### 案例 1：训练数据长什么样

一条样本 = (query, doc_i, doc_j, label)：

```
query: "如何煮溏心蛋"
doc_i: 食谱网站详细教程       特征向量 [bm25=0.8, pagerank=0.6, ...]
doc_j: 含"溏心蛋"三字的旧博客 特征向量 [bm25=0.9, pagerank=0.1, ...]
label: 1   (i 比 j 更相关)
```

注意 `doc_j` 的 BM25 反而更高，但人觉得 `doc_i` 更好——RankNet 要学的就是**这种打破单一信号的非线性模式**。

### 案例 2：为什么不用回归

如果让人标"这页对这个 query 多相关，0-10 分"：

- 标注员之间打分差 2 分很正常
- 同一个人今天和明天打分会漂移
- 模型把噪声当信号学

让人比较"i 和 j 哪个更好"：

- 一致性高得多
- 即使绝对值有偏，相对顺序很稳
- RankNet 只用相对顺序，**不在乎绝对分数的标度**

### 案例 3：从 RankNet 到 LambdaRank（一行改动的传奇）

RankNet 优化的是 pairwise 错误率。但搜索真正在乎的是 NDCG@10——top 几个错代价巨大，第 50 名错没人在乎。

Burges 团队 2006 发现：把梯度乘以"如果交换这一对会让 NDCG 变多少"

```
lambda_ij = (sigmoid(s_i - s_j) - P*) * |Delta_NDCG|
```

就直接近似优化 NDCG。改一行公式，效果飞跃。这就是 **LambdaRank**。再把神经网络换成 GBDT，就是 **LambdaMART**——2010 年 Yahoo Learning to Rank 挑战赛冠军。

## 踩过的坑

1. **优化目标和评估指标错位**：RankNet 直接降的是 pairwise 错对数，但线上指标是 NDCG/MAP。降错对数不一定提 NDCG（top 错和 bottom 错权重一样）。LambdaRank 才修了这个洞。

2. **pair 必须同 query**：把不同 query 的文档配对没意义——"煮蛋" 的 doc1 和 "买股票" 的 doc2 比谁排前是什么意思？训练 pipeline 要严格按 query 分组。

3. **pair 数爆炸**：n 个文档有 O(n^2) 对。一个 query 100 个文档就是 5000 对，10 万个 query 就是 5 亿对。实践要么按相关度差采样、要么只取相邻 rank 对。

4. **2005 年 NN 还浅**：原论文用的就是 2 层、10 个隐单元的小网络。深度神经排序要等 2013 年 DSSM、2019 年 BERT reranker 才真正起来。

## 适用 vs 不适用场景

**适用**：

- 搜索 / 推荐 / 广告排序（候选集已经 10-1000 量级，要精排）
- 标注成本受限——人标 pair 比标绝对分容易
- 特征工程做了大量信号（BM25、PageRank、点击率），要学非线性组合

**不适用**：

- 候选集巨大（百万级）的召回阶段——pairwise O(n^2) 跑不动，用 ANN / 双塔
- 真正要绝对分数的场景（CTR 预估直接出概率）——回归更直接
- 单一 query 候选很少（< 5 个）——pair 太少，方差大

## 历史小故事（可跳过）

- **2002 年**：Joachims 用 RankSVM（pairwise hinge loss + SVM）证明 pairwise 可行，但 SVM 训练慢。
- **2005 年**：Burges 团队把 SVM 换成神经网络 + cross-entropy + SGD，速度上 10 倍，**ICML 论文 8 页**。
- **2006 年**：同团队提出 LambdaRank，给梯度加 NDCG 权重。
- **2010 年**：LambdaMART（GBDT 版）拿下 Yahoo LTR 挑战赛冠军。
- **2019 年**：BERT 把 cross-encoder reranker 做到新 SOTA，但底层训练 loss 仍是 pairwise/listwise——RankNet 的孙辈。

## 学到什么

1. **把不可导问题变可导是深度学习的万能套路**：sigmoid + 差值 + 交叉熵——同样的招在 word2vec / contrastive learning 一再出现
2. **标注成本决定能学什么**：让人比较比让人打分容易十倍，模型也跟着改架构
3. **优化目标 vs 评估指标的鸿沟**：RankNet 暴露这个问题，LambdaRank 填了第一道坑——这种"近端代理 + 后续修正"是工业 ML 的通用模式
4. **小论文撬大产业**：8 页论文催生 Bing 搜索排序、Yahoo LTR 大赛、整个 learning-to-rank 子领域

## 延伸阅读

- 论文 PDF：[Burges et al., ICML 2005](https://www.microsoft.com/en-us/research/wp-content/uploads/2005/08/icml_ranking.pdf)
- 后续技术报告：[From RankNet to LambdaRank to LambdaMART: An Overview](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/MSR-TR-2010-82.pdf)（Burges 自己写的综述，把三代算法串起来）
- 现代实现：[allRank](https://github.com/allegro/allRank) PyTorch 学习排序库
- [[pagerank-1998]] —— 同样关心"网页排序"，但用图结构而非有监督学习
- [[word2vec]] —— 同样用 sigmoid 把比较变可导（这里是 word context vs negative sample）

## 关联

- [[pagerank-1998]] —— 都做"排序"，PageRank 用图传播无监督，RankNet 用监督学习
- [[personalized-pagerank-2003]] —— 排序的另一支，按用户偏好定制
- [[trustrank-2004]] —— 排序的反垃圾视角
- [[anh-moffat-2005]] —— 同年 SIGIR，索引侧的排序加速
- [[anserini-2017]] —— 现代 BM25 toolkit，常作为 RankNet 类模型的特征源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anh-moffat-2005]] —— Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码
- [[anserini-2017]] —— Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台
- [[gbrank-2007]] —— GBRank — 把决策树堆起来学排序，一棵树纠正一处错排
- [[knrm-2017]] —— K-NRM — 用核函数把交互矩阵变成可微排序信号
- [[koren-mf-2009]] —— Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书
- [[lambdarank-2006]] —— LambdaRank — 跳过定义损失函数，直接把梯度写出来
- [[pagerank-1998]] —— PageRank — 用随机游走给整个网络的页面打分
- [[personalized-pagerank-2003]] —— Personalized PageRank — 给每个人一份属于自己的网页排名
- [[slim-2011]] —— SLIM — 让数据自己学一张稀疏的"看了又看"权重表
- [[trustrank-2004]] —— TrustRank — 用一小撮可信种子把整张 Web 的信誉算出来
- [[word2vec]] —— Word2Vec — 词向量奠基

