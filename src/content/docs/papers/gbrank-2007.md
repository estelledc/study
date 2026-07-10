---
title: GBRank — 把决策树堆起来学排序，一棵树纠正一处错排
来源: Zheng, Zha, Zhang, Chapelle, Chen, Sun, "A Regression Framework for Learning Ranking Functions Using Relative Relevance Judgments", SIGIR 2007
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

GBRank 是 2007 年 Yahoo Research 提出的**用梯度提升决策树（GBDT）学搜索排序**的方法。日常类比：你是个画家在描一幅画，描完看哪笔歪了，再补一笔修正；下一棵树专门盯着上一棵树没修对的错排对去补。补几百轮，整幅画就准了。

它把搜索排序的训练数据写成一堆"i 比 j 更相关"的偏好对（pairwise），然后把每个偏好对违反程度当作回归目标，让一棵接一棵的回归树去拟合这些"该修但还没修"的目标。

**意义**：在 [[ranknet-2005]] 用神经网络做 pairwise 排序的两年后，GBRank 在 Yahoo 内部数据上**全面胜过 RankNet 和 RankSVM**——这是 2007 年"GBDT 在 IR 实战胜过神经网络"的早期重要证据，也为后续把 [[lambdarank-2006]] 梯度套进 GBDT 的 LambdaMART（2010 年 Yahoo LTR 冠军）铺了路。

## 为什么重要

不理解 GBRank，下面这些事都没法解释：

- 为什么 2008-2018 年工业搜索排序几乎清一色是 GBDT 而不是神经网络——直到 BERT 才真正翻身
- 为什么 XGBoost / LightGBM 都内置 `rank:pairwise` 目标函数——它们的祖宗就是 GBRank
- 为什么 2007 年 NN 在 IR 上输给了树——特征是稀疏离散混合类型，浅 NN 没优势
- 为什么"pairwise 偏好"成了排序问题的标准数据形态——比绝对相关度好标十倍

## 核心要点

GBRank 的全部秘密就是**把 pairwise 排序问题翻译成一系列 regression 子问题**：

1. **打分函数**：对每个文档 x，输出一个分数 `s(x) = sum_t eta * h_t(x)`，其中 h_t 是第 t 棵回归树，eta 是学习率（shrinkage，0.05-0.1）。

2. **偏好对损失**：对一对 (i 优于 j)，定义带 margin 的 squared hinge（平方铰链损失：分够开就零，分不够就按差的平方罚）：

   ```
   L_ij = (1/2) * max(0, tau - (s_i - s_j))^2
   ```

   tau 是 margin（安全间距，论文取 0 或 1）。当 `s_i - s_j >= tau` 时损失为 0——已经分得够开，不动了；只对**违反 margin 的 pair** 算该往哪边推。

3. **回归目标的巧妙转化**：对违反的 pair (即 `s_i < s_j + tau`)，论文不直接对 L 求导，而是把这对的修正写成两个回归目标：

   - doc i 的目标：`s_j + tau`（应该至少升到这）
   - doc j 的目标：`s_i - tau`（应该至少降到这）

   然后**拟合一棵回归树 h_t** 去拟合这些目标。把 eta * h_t 加到 s 上，进入下一轮。

4. **重复 T 轮**：典型 1000-5000 轮，每轮一棵 5-7 层的小树。每棵树只盯着"上一轮还没修对的错排对"去微调。

四步加起来：**pairwise hinge + 把违反对转成 regression 目标 + GBDT**。

注意第 3 步的设计：传统 boosting 让弱学习器拟合"损失下降最快的方向"（Friedman 2001 把这叫函数空间里的梯度下降）；GBRank 做了工程简化——直接给出"该修到哪"的靶点，让回归树去拟合。这种"绕开求导、直接写回归靶点"的思路，和后来 [[lambdarank-2006]] "跳过定义损失、直接写梯度"精神相通。

## 实践案例

### 案例 1：训练数据长什么样

一条 pair 样本：

```
query: "如何煮溏心蛋"
doc_i 特征: [bm25=0.8, pagerank=0.6, click_rate=0.12, domain="zhihu", ...]
doc_j 特征: [bm25=0.9, pagerank=0.1, click_rate=0.01, domain="unknown", ...]
preference: i > j   (人工标注)
```

注意特征**类型混杂**：bm25 是连续实数、domain 是类别、click_rate 是分布长尾的概率。GBDT 不需要 normalize / one-hot / impute——决策树在每个分裂点独立选阈值，天生处理混合类型。这是它在 2007 年 IR 上压过浅 NN 的重要原因之一。

### 案例 2：一轮训练的内部循环

假设当前打分函数 s_old，对所有 pair 检查违反情况：

```
对每个偏好对 (i > j):
  if s_old(i) - s_old(j) < tau:
    把 (x_i, target = s_old(j) + tau) 加入回归训练集
    把 (x_j, target = s_old(i) - tau) 加入回归训练集
拟合一棵 5 层回归树 h_t 拟合这堆 (x, target)
更新 s_new = s_old + 0.1 * h_t
```

每棵新树**只看错排对**，已经分得开的对不参与训练——这和 boosting 的核心思想一致：每轮把注意力集中在还没学好的样本上。

### 案例 3：为什么 GBDT 在 2007 年 IR 上压过 NN

对照案例 2 的伪代码看下表——同一套 pairwise 训练，换模型骨架差在哪：

| 因素 | 浅 NN（2007） | GBDT |
|---|---|---|
| 处理混合特征 | 要 normalize / one-hot | 原生支持 |
| 缺失值 | 必须填充 | 树可走备用分裂（surrogate split） |
| 特征交互 | 隐藏层学（数据量要够） | 决策树路径自动组合 |
| 调参敏感度 | 学习率/初始化敏感 | 较稳定（树深度 + 学习率） |
| 训练数据规模 | 千万级以上才有优势 | 百万级甜区 |

Yahoo 当年的标注数据就在百万级、特征几百维、混合类型——**正好命中 GBDT 的甜区**。这不是"NN 永远不如树"，而是"在那个数据规模 + 特征类型 + 算力条件下，GBDT 是更优解"。

## 踩过的坑

1. **margin tau 选择敏感**：太小则违反 pair 区分不够（分数推不动）；太大则违反对太多、噪声大、训练不稳。论文实验 tau ∈ {0, 1}，需要 grid search 调。

2. **pair 必须同 query 构造**：和 [[ranknet-2005]] 一样的坑——跨 query 的 pair 没有"谁更相关"的语义。训练 pipeline 要严格按 query 分组采样。

3. **pair 数爆炸**：n 个文档有 O(n^2) 对，一个 query 100 个文档就 5000 对，10 万 query 就 5 亿对。实践要么按相关度差采样、要么只取相邻 rank 对。

4. **树深度过深会过拟合**：作者推荐 5-7 层。GBDT 靠"很多浅树"而非"几棵深树"——这是和随机森林截然相反的设计哲学。

5. **训练慢**：每轮要扫一遍违反 pair + 拟合一棵树 + 更新分数。T=2000 时单机要跑几小时。XGBoost/LightGBM 后来用直方图加速 + 并行才把这个时间压下来。

## 适用 vs 不适用场景

**适用**：

- 精排阶段（候选 100-1000，特征几百维）
- 标注是 relative judgment（"i 比 j 更相关"）而非绝对分
- 特征是混合类型（连续 + 类别 + 计数 + 缺失）
- 数据规模在百万级训练样本

**不适用**：

- 召回阶段百万级候选——pairwise O(n^2) 跑不动，应用双塔 + ANN
- 稠密向量场景（语义检索）——embedding + cosine 更直接
- 真正端到端深度学习管道——现代 BERT reranker 直接吃 token

## 历史小故事（可跳过）

- **2001 年**：Friedman 提出 Gradient Boosting Machine，把 boosting 解释为函数空间的梯度下降。
- **2002 年**：Joachims 用 RankSVM 证明 pairwise 训练可行，但 SVM 训练慢、特征要 kernelize。
- **2005 年**：[[ranknet-2005]] Burges 用 NN + cross-entropy 把 pairwise 推到工业级。
- **2007 年**：Zheng 等在 Yahoo 把 GBDT 套进 pairwise 框架，**SIGIR 论文 8 页**，全面胜过 RankNet。
- **2008-2010 年**：Burges 把 LambdaRank 的梯度套到 GBDT 上做出 LambdaMART，2010 年拿下 Yahoo LTR 挑战赛冠军。
- **2014 年**：Chen 的 XGBoost 把 GBDT 工程化（直方图 + 并行 + GPU），内置 `rank:pairwise` 目标。

## 学到什么

1. **特征性质决定模型选择**：稀疏离散混合 → 树；稠密连续 → 神经网络。2007 年 IR 的特征性质让 GBDT 占优，2019 年 BERT 把 token embedding 做稠密了才翻身。
2. **把难问题转成熟问题**：pairwise 排序 → 一系列 regression 子问题。这是工程上反复出现的套路——能用 squared loss 解决，绝不发明新优化器。
3. **boosting 的精神**：每轮专注修正前面没学好的部分。GBRank 把这个精神搬到排序——每棵新树只盯着错排对。
4. **小论文撬大产业**：8 页 SIGIR 论文催生了 LambdaMART、XGBoost rank、LightGBM lambdarank——10 多年工业排序系统都是它的徒孙。

## 延伸阅读

- 论文 PDF：[Zheng et al., SIGIR 2007](https://www.cc.gatech.edu/~zha/papers/fp086-zheng.pdf)
- 综述：[From RankNet to LambdaRank to LambdaMART](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/MSR-TR-2010-82.pdf)（Burges 把三代算法串起来）
- 现代实现：[XGBoost rank tutorial](https://xgboost.readthedocs.io/en/stable/tutorials/learning_to_rank.html)
- 原始 GBDT：Friedman 2001, "Greedy Function Approximation: A Gradient Boosting Machine"

## 关联

- [[ranknet-2005]] —— 同样做 pairwise，但用神经网络；GBRank 两年后用 GBDT 把它压下去
- [[lambdarank-2006]] —— "跳过 loss 直接写梯度"；后续 LambdaMART 把这条思路套进 GBDT，是 GBRank 的精神后继
- [[pagerank-1998]] —— 排序的另一支，无监督图传播
- [[okapi-bm25-1994]] —— 经典 IR 信号，是 GBRank 输入特征的重要一维
- [[anserini-2017]] —— 现代 BM25 toolkit，常用作 LTR 模型的特征源
- [[anh-moffat-2005]] —— 同时期 SIGIR 工作，索引侧的排序加速

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
