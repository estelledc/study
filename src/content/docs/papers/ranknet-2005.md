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

- 为什么搜索引擎团队不直接做"分类/回归"，要绕一圈做 pairwise（两两比较）——因为人标"A 和 B 谁好"比标"A 是 7.3 分"靠谱十倍
- 为什么 2006 年能长出 LambdaRank：给 RankNet 梯度乘上「交换这一对会让榜单指标变多少」；2010 年再换成 GBDT 得到 LambdaMART，拿下 Yahoo LTR 挑战赛冠军
- 为什么 2024 年的 BERT reranker / cross-encoder 训练脚本里还能看到 `pairwise_loss`——同一个套路 19 年了没变
- 为什么"learning to rank"成了一个独立子领域，而不是"分类的特例"

## 核心要点

RankNet 的全部秘密就是把"排序"翻译成"概率"，让梯度下降能跑：

1. **打分函数**：每个文档 x 过神经网络，输出一个实数分数 `s = f(x; w)`。这分数本身没意义，**只用于比较**——像考试只看谁分更高，不看绝对分。

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

四步加起来：**pairwise 交叉熵 + 神经网络打分 + SGD**。用 sigmoid 把离散前后关系变成连续概率后，整条链路可导——和 contrastive loss 同一思路。

## 实践案例

### 案例 1：一条训练样本长什么样

```
query: "如何煮溏心蛋"
doc_i: 食谱网站详细教程       特征 [bm25=0.8, pagerank=0.6, ...]
doc_j: 含"溏心蛋"三字的旧博客 特征 [bm25=0.9, pagerank=0.1, ...]
label: 1   # 人标：i 比 j 更相关
```

**逐部分解释**：`bm25` 是关键词匹配分（像「标题里有没有这些词」）；`pagerank` 是网页权威分。注意 `doc_j` 的 BM25 反而更高，但人觉得 `doc_i` 更好——RankNet 要学的就是**打破单一信号的非线性组合**。一条样本永远是「同 query 的一对文档 + 谁更好」。

### 案例 2：最小训练一步（伪代码）

```python
# 同一 query 下取一对 (i, j)，label=1 表示 i 应排前
s_i, s_j = net(feat_i), net(feat_j)
P = sigmoid(s_i - s_j)          # 模型认为 i 在前的概率
loss = -(label * log(P) + (1 - label) * log(1 - P))
loss.backward(); optimizer.step()
```

**逐部分解释**：① 只在同一 query 内配对；② 用分差过 sigmoid 得到概率；③ 和人工 label 算交叉熵；④ 反向传播更新网络。整页精排时，对所有相关度不同的 pair 重复这一步。

### 案例 3：从 RankNet 到 LambdaRank / LambdaMART

搜索线上更在乎 NDCG@10——白话：**越靠前的对错越值钱**，第 1 名错了很痛，第 50 名错了几乎没人看。RankNet 却把所有 pair 错同等对待。

```
# 2006 LambdaRank：给梯度乘上「交换这对会让 NDCG 变多少」
lambda_ij = (sigmoid(s_i - s_j) - P*) * abs(delta_ndcg)
# 2010 LambdaMART：把上面的神经网络换成 GBDT（梯度提升树）
```

**逐部分解释**：LambdaRank 仍是 RankNet 的 pairwise 骨架，只改梯度权重；LambdaMART 换模型家族后拿下 2010 Yahoo Learning to Rank 挑战赛冠军。两步不要混成「同一个 2010 冠军算法」。

## 踩过的坑

1. **优化目标和评估指标错位**：RankNet 降的是 pairwise 错对数，线上却看 NDCG/MAP；top 错和 bottom 错权重一样时，错对数降了 NDCG 未必升。LambdaRank 才修了这个洞。

2. **pair 必须同 query**：把「煮蛋」的 doc1 和「买股票」的 doc2 配对没有意义；训练 pipeline 要严格按 query 分组。

3. **pair 数爆炸**：n 个文档有 O(n^2) 对。一个 query 100 文档约 5000 对，10 万 query 就是 5 亿对——实践要按相关度差采样或只取相邻 rank 对。

4. **2005 年 NN 还浅**：原论文是两层、约 10 个隐单元的小网络。深度神经排序要等 2013 DSSM、2019 BERT reranker 才真正起来。

## 适用 vs 不适用场景

**适用**：

- 搜索 / 推荐 / 广告精排（候选已缩到 10–1000）
- 标注预算紧——人标 pair 比标绝对分容易
- 已有多路特征（BM25、PageRank、点击率），要学非线性组合

**不适用**：

- 百万级召回——pairwise O(n^2) 跑不动，用 ANN / 双塔
- 要绝对概率的场景（CTR 预估）——回归更直接
- 单一 query 候选 < 5——pair 太少，方差大

## 历史小故事（可跳过）

- **2002 年**：Joachims 用 RankSVM（pairwise hinge + SVM）证明 pairwise 可行，但大规模搜索上 SVM 训练偏重。
- **2005 年**：Burges 团队换成神经网络 + 交叉熵 + SGD，更适合搜索引擎的大规模训练/推理，**ICML 论文约 8 页**。
- **2006 年**：同团队提出 LambdaRank，给梯度加 |ΔNDCG| 权重。
- **2010 年**：LambdaMART（GBDT 版）拿下 Yahoo LTR 挑战赛冠军。
- **2019 年**：BERT cross-encoder reranker 刷新 SOTA，底层 loss 仍常是 pairwise/listwise——RankNet 的孙辈。

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

- [[gbrank-2007]] —— GBRank — 把决策树堆起来学排序，一棵树纠正一处错排
- [[knrm-2017]] —— K-NRM — 用核函数把交互矩阵变成可微排序信号
- [[koren-mf-2009]] —— Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书
- [[lambdarank-2006]] —— LambdaRank — 跳过定义损失函数，直接把梯度写出来
- [[resolution-diagnostics-llm]] —— Resolution Diagnostics — 判断 LLM 排名差距有没有统计分辨率
- [[slim-2011]] —— SLIM — 让数据自己学一张稀疏的"看了又看"权重表
