---
title: Wide & Deep — 让模型同时学会"记住"和"举一反三"
来源: Cheng et al., "Wide & Deep Learning for Recommender Systems", DLRS @ RecSys 2016
日期: 2026-05-31
分类: 推荐系统
难度: 中级
---

## 是什么

Wide & Deep 是 Google 2016 年在 Play 商店上线的一种**推荐排序**做法。日常类比：一家便利店有两个店员配合工作。

- **老店员**（wide 路）：在店里干了 10 年，背了一脑子规则——"买尿布的人常买啤酒"。他**靠记忆**，对见过的组合反应飞快。
- **新店员**（deep 路）：刚入职，会**抽象**——把顾客换成特征向量（"年轻爸爸"、"健身党"），再猜你想要什么。他**靠泛化**，没见过的人也能给个不离谱的推荐。

老店员对长尾组合精度高但不会推新；新店员什么都敢推但偶尔离谱。Wide & Deep 把两人**绑成一个团队**——同一份订单两路各打一个分，**加起来再决定**；而且两人同时学、一起反思（联合训练）。

## 为什么重要

不理解 Wide & Deep，下面这些事都没法解释：

- 为什么 2016 年后多数工业 CTR 排序模型仍沿用"记忆 + 泛化 / 两路"骨架——DeepFM、DCN、xDeepFM 都是变体（DIN 等更偏注意力，但仍在同一问题族）
- 为什么 TensorFlow 把 `DNNLinearCombinedClassifier` 直接做成内置 API
- 为什么纯 DNN 推荐效果反而不如"DNN + 一条 LR"——这条 LR 在帮 DNN 兜住"已经看到的具体组合"
- 为什么"记忆"和"泛化"被反复当成两种能力来谈——这一对术语就是这篇论文带火的

## 核心要点

整个系统可以拆成三块。

1. **wide 路 = 广义线性模型 + 手工交叉特征**。
   你写规则："用户装了 Netflix **而且** 展示的是 Pandora，就给权重 w"。这种 `AND(A=x, B=y)` 叫**交叉积特征**。wide 本质是 logistic regression，用 FTRL+L1 训练，权重会变得很稀疏，只留真正有用的组合。

2. **deep 路 = embedding + 前馈网络**。
   每个类别特征映射成约 32 维稠密向量，拼起来过 1024 → 512 → 256 的 MLP，输出一个 logit。embedding 让没见过的组合也能算相似度。

3. **联合训练**。
   两路 logit **直接相加**，过 sigmoid 得点击概率，单一交叉熵损失；一次反向传播**同时**更新两路（不是先训再融合的 ensemble）。wide 用 FTRL+L1 保稀疏，deep 用 AdaGrad。

## 实践案例

### 案例 1：wide 路怎么"记住"一条组合

Google Play 例子：用户已装 `netflix`，展示是 `pandora`。手工特征是 `AND(installed=netflix, impression=pandora)`。

**逐步拆解**：

1. **输入**：稀疏交叉特征命中 → 对应权重 w 被取出
2. **wide 怎么算**：logit_wide += w（没命中就贡献 0，不会"猜"）
3. **输出**：这条具体组合的精确收益被直接加进总分——DNN 做不到这种字典式记忆

### 案例 2：deep 路怎么"举一反三"

用户装了一堆健身 app，从没装过 Pandora，展示却是新音乐 app `Spotify`。wide 里没有对应 AND 规则。

**逐步拆解**：

1. **输入**：把"健身用户"、"Spotify"等类别特征查成 embedding
2. **deep 怎么算**：向量拼起来过 MLP，得到 logit_deep
3. **输出**：即使从未共现，只要 embedding 落在相近区域，也能给出合理分数——这就是泛化

### 案例 3：上线效果（相对谁、为何显著）

Google Play A/B：相对**纯 wide** app 安装 **+3.9%**，相对**纯 deep** **+1%**。用户量级 1B+，所以 1% 也统计显著。线上每次请求要在 **10 ms** 内排完；训练约 **5000 亿**样本——说明这套架构在工业级数据上跑得动。

### 案例 4：用 TensorFlow 拼一个最小版本

```python
import tensorflow as tf

wide_columns = [
    tf.feature_column.categorical_column_with_hash_bucket("user_id", 1000000),
    tf.feature_column.crossed_column(
        ["installed_app", "impression_app"], hash_bucket_size=10000000),
]
deep_columns = [
    tf.feature_column.embedding_column(
        tf.feature_column.categorical_column_with_hash_bucket("user_id", 1000000),
        dimension=32),
]
model = tf.estimator.DNNLinearCombinedClassifier(
    linear_feature_columns=wide_columns,
    dnn_feature_columns=deep_columns,
    dnn_hidden_units=[256, 128, 64],
)
# 还需要 input_fn 喂 batch，再 model.train(...)；上面只声明两路结构
```

**逐部分解释**：`crossed_column` = wide 的手工交叉；`embedding_column` = deep 的稠密向量；`DNNLinearCombinedClassifier` = 两路 logit 相加 + 联合损失。声明清哪些列进 wide/deep，框架自动接好。

## 踩过的坑

1. **以为 wide 路可以丢掉**：丢了之后长尾稀疏组合精度会掉——deep 天生把相似物推近，对稀有但有信号的组合不敏感。
2. **以为这是 ensemble**：ensemble 是各训各的再融分；Wide & Deep 是联合训练，两路梯度同时回传，每路可以做得更小。
3. **wide 路用 AdaGrad/Adam**：FTRL+L1 才能让 cross 权重稀疏；稠密优化器会把长尾权重养肥再过拟合。
4. **把它和"双塔召回"混淆**：双塔（[[youtube-two-tower-2019]]）是 user/item 各一塔再点积，用于召回；Wide & Deep 是单一排序模型，wide/deep 是两种处理方式不是两个塔。

## 适用 vs 不适用场景

**适用**：
- 大规模 CTR / 推荐排序，类别特征多、交互稀疏
- 既有"老用户老 item"（要记忆）又有"新用户新 item"（要泛化）
- 你愿意人工写一些 cross feature

**不适用**：
- **召回阶段**——需要 user/item 向量分离做近邻检索，用双塔（[[youtube-two-tower-2019]]）
- **数据量很小**——cross 学不充分，deep 易过拟合
- **纯文本 / 纯图像 / 纯序列**——应用专门 encoder 做主干
- **不愿写 cross feature**——直接上 DeepFM / DCN，让模型自己发现交叉

## 历史小故事（可跳过）

- **2010 ~ 2014**：工业 CTR 主战场是 LR + 手工 cross + FTRL；[[ftrl-2013]] 奠定 online learning 框架。
- **2014 ~ 2015**：DNN 在 CV/NLP 大放异彩，但纯 DNN 在大规模稀疏特征上效果反而不如 LR——太能泛化，把长尾精确信号"抹平"了。
- **2016**：Google Play 团队 Cheng 等人让 linear 管记忆、DNN 管泛化；4 页 workshop 短文，TensorFlow 当年做成 high-level API。
- **之后**：DeepFM / DCN / xDeepFM / AutoInt 主旋律是"自动学交叉"，但**两路并行**骨架没变；哪怕 deep 路换成 Transformer，工业排序仍常留一条线性/浅层兜底。

## 学到什么

1. **记忆 vs 泛化是一对独立能力**——分到两路、联合训练，反而都更好。
2. **联合训练 ≠ ensemble**——梯度共享让两路相互"挑刺"，总参数量不一定更大。
3. **不同优化器可以混用**——wide 用 FTRL、deep 用 AdaGrad，按归纳偏置选。
4. **架构骨架长寿命**——细节改了十年，"两路并行 + 联合训练"没换；设计模式比具体公式更耐用。

## 延伸阅读

- 论文 PDF：[Wide & Deep Learning for Recommender Systems](https://arxiv.org/abs/1606.07792)
- TensorFlow：[tf.estimator.DNNLinearCombinedClassifier](https://www.tensorflow.org/api_docs/python/tf/estimator/DNNLinearCombinedClassifier)
- Google AI 博客：[Wide & Deep Learning: Better Together with TensorFlow](https://research.google/blog/wide-deep-learning-better-together-with-tensorflow/)
- [[youtube-two-tower-2019]] —— 同时期 Google 另一类两塔结构，区别在召回 vs 排序
- [[dcn-2017]] —— 把手工 cross 换成可学习的交叉网络

## 关联

- [[youtube-two-tower-2019]] —— 兄弟工作；两路思想用于召回，user/item 各一塔
- [[dcn-2017]] —— 在 DNN 旁并联专门学特征交叉的网络，自动化 wide 侧
- [[din-2018]] —— 用注意力按候选广告激活用户历史，同属工业 CTR 排序族
- [[attention]] —— 后来很多 CTR 把 deep 路 MLP 换成 attention，wide+deep 骨架仍在
- [[ftrl-2013]] —— wide 路常用的在线稀疏优化器前身
- [[dlrm-2019]] —— Meta 把工业推荐拆成标准积木，仍可见 embedding + 交互分工

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bert4rec-2019]] —— BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
- [[dcn-2017]] —— DCN — 在 DNN 旁边并联一条专门学特征交叉的网络
- [[din-2018]] —— DIN — 让推荐模型按你看的广告决定该激活你哪段历史
- [[dlrm-2019]] —— DLRM — Meta 把工业推荐模型拆成 4 个标准积木
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
