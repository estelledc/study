---
title: Prototypical Networks — 每类算个均值，比距离就够了
来源: 'Snell, Swersky, Zemel, "Prototypical Networks for Few-shot Learning", NeurIPS 2017'
日期: 2026-06-01
分类: 机器学习
难度: 初级
---

## 是什么

Prototypical Networks（**ProtoNet**）是一套**少样本分类**算法。日常类比：你要认 5 种鸟，每种只见过 3 张照片。ProtoNet 的做法是——把每种鸟的 3 张照片在脑子里画个"平均长相"（叫**原型**），新来一张就比它离哪个平均长相最近。

形式上：每个类别 k 用 support set 里 K 张样本的 embedding 求平均，得到原型 c_k。query 样本 x 的预测就是看它的 embedding 离哪个 c_k 最近（**平方欧氏距离**），然后过一层 softmax。

```
c_k = (1/K) · Σ f_φ(x_i)         （类原型 = K 个样本 embedding 的均值）
p(y=k|x) = softmax(-‖f_φ(x) - c_k‖²)
```

整个模型只有一个 embedding 网络 f_φ，训练完之后**推理时不再更新任何参数**。

## 为什么重要

不理解 ProtoNet，下面几件事都讲不通：

- 为什么 [[maml-2017]] 那种"内循环再 SGD"的复杂做法在 5-shot 上反而被一个均值打败
- 为什么 SentenceBERT / CLIP 的 few-shot 分类常常就是"算几个均值再比距离"
- 为什么很多 embedding 分类器宁可做 nearest-centroid（每类一个中心），也不先上更花哨的元学习器
- 为什么 2024 年的 few-shot baseline 还是这个 2017 年短论文里的方法

## 核心要点

ProtoNet 的训练 + 推理可以拆成 **三步**：

1. **embedding 网络**：一个普通 CNN（论文里 4 层卷积），把图片映射成 64 维向量。类比：把每张照片压成一张"特征名片"，后面只比名片、不再比原图。所有训练参数都在这里。

2. **构造原型**：每个 episode 随机抽 N 个类别、每类 K 个 support 样本（**N-way K-shot**），算 N 个原型。类比：每组同学交作业，老师先把同组作业平均成一份"标准答案"。原型是均值，**没有可训练参数**。

3. **距离 → softmax → cross-entropy**：query 到 N 个原型的负欧氏距离过 softmax，对真实类别算交叉熵。类比：看新作业离哪份标准答案最近，再据此打分回传。梯度流回 embedding 网络。

```
训练 episode：
  抽任务 → 算原型 → query 比距离 → 交叉熵 → 更新 f_φ
推理：
  支持集算原型 → query 比距离 → argmin 即类别（不再训练）
```

三步加起来，模型学到的是"**让同类样本 embedding 聚得近、不同类离得远**"的特征空间。

## 实践案例

### 案例 1：miniImageNet 5-way 1-shot（含 episode 伪代码）

任务：给 5 个新类别、每类 1 张样本，问第 6 张属于哪一类。

```python
# 一个 episode：N=5, K=1
support, query, labels = sample_episode(n_way=5, k_shot=1)
# 1) 每类 support embedding 求均值 → 原型
protos = {c: embed(support[c]).mean(0) for c in support}
# 2) query 比平方欧氏距离，最近的原型即预测
pred = min(protos, key=lambda c: ((embed(query) - protos[c]) ** 2).sum())
```

**逐部分解释**：`sample_episode` 模拟"临时考试卷"；`embed` 是 f_φ；1-shot 时均值就是那一张。论文数字：ProtoNet 49.4%（同期 [[maml-2017]] 48.7%）；5-shot 68.2%（领先 MAML 约 5 个百分点）。**为什么赢**：MAML 在 1 张样本上做 SGD 易过拟合；ProtoNet 直接把那张当原型，没有"适应"步骤可坏掉。

### 案例 2：欧氏距离为什么打败余弦距离

论文消融：把距离从平方欧氏换成余弦，准确率显著掉点（图上常见约 6+ 个百分点量级）。

```
平方欧氏：‖f(x) - c_k‖²        强 baseline
余弦：    1 - cos(f(x), c_k)   显著掉点
```

**为什么**：平方欧氏属于 **Bregman 散度**（一类特殊距离：对这类距离，"算均值"恰好是最大似然估计，原型是最优类代表）。余弦不是 Bregman，平均向量对它**没有这种最优性**。

### 案例 3：用 SentenceBERT 做 5-shot 文本分类（现代延伸）

```python
# 5 个类别，每类 3 个样本
prototypes = {}
for label, samples in support_set.items():
    embs = sentence_bert.encode(samples)  # (3, 768)
    prototypes[label] = embs.mean(axis=0)  # (768,)

# 预测新文本
def predict(text):
    emb = sentence_bert.encode([text])[0]
    return min(prototypes, key=lambda k: np.sum((emb - prototypes[k])**2))
```

**没有训练**。直接拿 pretrained embedding 算原型。这就是 ProtoNet 思路被现代 embedding 模型继承的样子。

## 踩过的坑

1. **embedding 维度过高时距离失效**：维度上千后所有点之间距离趋于相同（curse of dimensionality）。需要 normalize 或降维到 64-512。

2. **类别不平衡时原型失真**：均值假设每类样本"代表性差不多"。如果 support set 里有噪声样本，原型会被拉偏。生产中常用中位数或 trimmed mean 替代。

3. **训练 episode 配置要对齐测试**：训练 5-way 1-shot、测试 20-way 5-shot 会掉点。论文建议**训练时 way 数比测试更高**（例如训练 20-way、测试 5-way），让特征更鲁棒。

4. **跨域泛化弱**：训练在 miniImageNet（自然图像）上的 ProtoNet，到医学影像上几乎不可用。原因是 embedding 学到的是"自然图像类内方差"，新域分布完全不同。

## 适用 vs 不适用场景

**适用**：

- few-shot 分类，每类 1-20 个样本
- 已有强 embedding 模型（CLIP / SentenceBERT），想做零额外训练分类
- 类别会增删的场景——加新类别只要加一个原型，不用重训

**不适用**：

- 大数据 + 固定类别 → 直接训分类头更简单
- 类内方差极大（人脸不同表情、医学影像不同病期）→ 单个均值代表不了类
- 需要给出"为什么是这一类"的可解释性 → 距离能给排序但说不出原因
- 跨域 few-shot → 需要 domain adaptation 配套

## 历史小故事（可跳过）

- **2015 年**：Koch et al. 用 Siamese Network 做 one-shot，思路是"学距离"，但要 pairwise 训练，效率低。
- **2016 年**：Vinyals 等的 Matching Networks 用 attention 对 support set 加权——可以看成"软原型"，比 Siamese 强但实现复杂。
- **2017 年 3 月**：[[maml-2017]] 发表，用二阶梯度学初始化。
- **2017 年 6 月**：Snell（Toronto + Twitter）发表 ProtoNet，主文很短，思路简单到让人怀疑——"为什么不直接对 support 求均值"。
- **2018 年**：Relation Networks 把欧氏距离换成可学习的"关系网络"，更花哨但提升有限。
- **2020 年起**：CLIP / SentenceBERT 普及，ProtoNet 范式以"用预训练 embedding 算原型"的形式回归主流。

## 学到什么

1. **简单方法 + 对的 inductive bias** 常常打败复杂算法。MAML 的二阶梯度，在 5-shot 上输给一个均值
2. **距离的选择有数学含义**：欧氏距离 ↔ Bregman 散度 ↔ 高斯生成模型，三者绑定
3. **训练分布要匹配测试条件**——episodic training 是把这个原则做到极致
4. **零参数推理是部署友好性的护身符**：加新类别不用重训、模型大小不增长

## 一句话区分容易混淆的概念

- **ProtoNet vs [[maml-2017]]**：ProtoNet 学好的特征空间，推理直接比距离；MAML 学好初始化，推理还要做 K 步 SGD。
- **ProtoNet vs Matching Networks**：Matching 用 attention 加权 support 样本（每个 query 看到的 support 权重不同）；ProtoNet 把 support 平均成一个原型（query 看到的是固定原型）。
- **ProtoNet vs Siamese**：Siamese 学 pairwise 距离，要枚举对；ProtoNet 学 embedding，每个 episode 用 N×(K+Q) 个样本一次更新。
- **ProtoNet vs k-NN**：k-NN 用所有训练样本作邻居；ProtoNet 把每类压成一个原型，N 个邻居做分类。

## 延伸阅读

- 论文 PDF：[Snell et al. 2017](https://arxiv.org/abs/1703.05175)（短论文，密度低，一晚上能读完）
- 官方代码：[jakesnell/prototypical-networks](https://github.com/jakesnell/prototypical-networks)（PyTorch 100 行核心）
- 综述视角：[Wang et al. 2020, "Generalizing from a Few Examples"](https://arxiv.org/abs/1904.05046) 第 4.2 节
- 现代实现：[learn2learn 库](https://github.com/learnables/learn2learn) 提供 MAML / Reptile / ProtoNet 同接口对比
- Bregman 散度数学背景：Banerjee et al. 2005, "Clustering with Bregman Divergences"

## 关联

- [[maml-2017]] —— 同年 few-shot 论文，MAML 学初始化、ProtoNet 学 embedding 空间
- [[attention]] —— Matching Networks 用 attention，ProtoNet 用均值，是更简单的"加权聚合"
- [[clip-2021]] —— CLIP 的 zero-shot 分类把文本 prompt 当原型，是 ProtoNet 思路的跨模态延伸
- [[sentence-bert]] —— SentenceBERT + 类原型 = 现代文本 few-shot 分类的工程标配

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
