---
title: Wide & Deep — 让模型同时学会"记住"和"举一反三"
来源: Cheng et al., "Wide & Deep Learning for Recommender Systems", DLRS @ RecSys 2016
日期: 2026-05-31
子分类: 检索与排序
分类: 信息检索
难度: 中级
provenance: pipeline-v3
---

## 是什么

Wide & Deep 是 Google 2016 年在 Play 商店上线的一种**推荐排序**做法。日常类比：一家便利店有两个店员配合工作。

- **老店员**（wide 路）：在店里干了 10 年，背了一脑子规则——"买尿布的人常买啤酒"、"周三下午来的大叔多半会买功能饮料"。他**靠记忆**，对见过的组合反应飞快。
- **新店员**（deep 路）：刚入职，没见过几个人，但他会**抽象**——他把每个顾客在脑子里转换成一串特征向量（"年轻爸爸"、"健身党"），然后猜你大概想要什么。他**靠泛化**，对没见过的人也能给个不离谱的推荐。

老店员对长尾组合的精度高但不会推新东西；新店员什么都敢推但偶尔离谱。Wide & Deep 把两人**绑成一个团队**——同一份订单，老店员算一个分、新店员算一个分，**两个分加起来再决定**。更妙的是：他俩同时学，每天的对错都一起反思（联合训练）。

## 为什么重要

不理解 Wide & Deep，下面这些事都没法解释：

- 为什么 2016 年之后所有大型 CTR 模型都长得"两路并行"——DeepFM、DCN、xDeepFM、阿里 DIN，全是这个套路的变体
- 为什么 TensorFlow 把 `DNNLinearCombinedClassifier` 直接做成内置 API
- 为什么纯 DNN 推荐效果反而不如"DNN + 一条 LR"——这条 LR 就是在帮 DNN 兜住"已经看到的具体组合"
- 为什么"记忆"和"泛化"被反复当成两种能力来谈——这一对术语就是这篇论文带火的

## 核心要点

整个系统可以拆成三块。

1. **wide 路 = 广义线性模型 + 手工交叉特征**。
   你写规则告诉模型："如果用户装了 Netflix **而且** 当前展示的是 Pandora，就给这个组合一个权重 w"。这种 `AND(A=x, B=y)` 形式叫**交叉积特征**（cross-product feature）。wide 路本质是 logistic regression，靠 FTRL+L1 训练，权重会变得非常稀疏（大部分为 0），只保留真正有用的组合。

2. **deep 路 = embedding + 前馈网络**。
   每个类别特征（app id、用户 id、地区等）映射成约 32 维稠密向量；这些向量拼起来过一个 1024 → 512 → 256 的 MLP；输出一个 logit。embedding 让"没见过的组合"也能算出合理的相似度——因为 Netflix 的向量和 Pandora 的向量本身就近。

3. **联合训练**。
   wide 路的 logit 和 deep 路的 logit **直接相加**，过一个 sigmoid 得到点击概率，损失是单一交叉熵。一次反向传播**同时**更新两路参数（注意：不是先训 wide 再训 deep 的 ensemble）。两路用**不同优化器**——wide 用 FTRL+L1 保稀疏，deep 用 AdaGrad。

## 实践案例

### 案例 1：什么样的组合 wide 路记得住

Google Play 真实例子：用户已装 `netflix`，看到的展示是 `pandora`。手工特征是 `AND(installed=netflix, impression=pandora)`。这种组合**只有线性模型才能精确记住权重**——DNN 把 netflix 和 pandora 都映射成 embedding 后，会"差不多"地推荐很多类似 app，但拿不到这条特定组合的精确收益。论文里这条 cross feature 单独贡献了可观的 AUC。

直觉上你可以这样想：**wide 路是 if-else 字典**，每个 key 是一种你**亲眼见过**的具体组合，value 是它的点击率权重。模型一旦命中 key，结果立刻飞回；命中不了就给 0。它不会"猜"，所以稀疏组合也不会被推平均。

### 案例 2：什么样的组合 deep 路才能想出来

用户装了一堆健身 app，从没装过 Pandora，但展示的是另一个新音乐 app `Spotify`。wide 路里没有 `AND(installed=fitness_app, impression=spotify)` 这条规则——它**没见过**。deep 路把"健身用户"和"音乐 app"的 embedding 一算，发现"年轻活跃用户 × 流媒体音乐"距离很近，给一个不低的分数。这就是泛化。

deep 路的泛化能力来自 embedding 的"语义聚类"——训练过程中，常被一起点击的 app 在 32 维空间里会自然靠近。所以即使两个 app 从未在同一用户身上共现过，只要它们各自的 embedding 落在相近区域，模型就能给出合理估计。

### 案例 3：上线效果

Google Play 上线的 A/B 实验，相对纯 wide 模型 app 安装量 **+3.9%**，相对纯 deep 模型 **+1%**（用户量级 1B+，统计上显著）。论文还给了线上服务的延迟约束：每次请求要在 **10 ms** 内完成排序。训练数据规模约 **5000 亿** 样本（500B），可见这套架构在工业级数据上确实跑得动。

### 案例 4：用 TensorFlow 拼一个最小版本

```python
import tensorflow as tf

# wide 侧：sparse 特征 + cross feature
wide_columns = [
    tf.feature_column.categorical_column_with_hash_bucket("user_id", 1e6),
    tf.feature_column.crossed_column(
        ["installed_app", "impression_app"], hash_bucket_size=1e7),
]

# deep 侧：相同 sparse 特征过 embedding
deep_columns = [
    tf.feature_column.embedding_column(
        tf.feature_column.categorical_column_with_hash_bucket("user_id", 1e6),
        dimension=32),
]

model = tf.estimator.DNNLinearCombinedClassifier(
    linear_feature_columns=wide_columns,
    dnn_feature_columns=deep_columns,
    dnn_hidden_units=[256, 128, 64],
)
```

代码层面只要把"哪些列进 wide、哪些列进 deep"声明清楚，框架自动接好两路输出 + 联合损失。

## 踩过的坑

1. **以为 wide 路可以丢掉**：丢了之后**长尾稀疏组合**的精度会掉。deep 路天生倾向于"把相似的东西推近"，对真正稀有但有信号的组合反而不敏感。
2. **以为这是 ensemble**：ensemble 是各模型独立训练再融合分数；Wide & Deep 是**联合训练**——两路梯度同时回传，所以每路可以做得**更小**。
3. **wide 路用 AdaGrad/Adam**：FTRL+L1 才能让 cross feature 权重稀疏化；换成稠密优化器后，长尾权重会被养肥然后过拟合。
4. **把它和"双塔召回"混淆**：双塔（[[youtube-two-tower-2019]]）是 user 和 item **各自一个塔**输出向量再点积，用于**召回**；Wide & Deep 是**单一排序模型**，user/item 特征都进同一个网络，wide 和 deep 是"两种处理方式"而不是"两个塔"。这个区分非常常考。
5. **手工 cross feature 还是要做**：这是 Wide & Deep 的局限，也是后来 DeepFM / DCN 出现的动机——它们把 cross feature 的发现自动化了。

## 适用 vs 不适用场景

**适用**：
- 大规模 CTR 排序、推荐排序，类别特征多、交互稀疏
- 既有"老用户老 item"（需要记忆）又有"新用户新 item"（需要泛化）的混合场景
- 你愿意人工写一些 cross feature（可以接受特征工程成本）

**不适用**：
- **召回阶段**——召回需要 user/item 向量分离便于近邻检索，应该用双塔（[[youtube-two-tower-2019]]）
- **数据量很小**——wide 路的 cross feature 学不充分，deep 路会过拟合
- **纯文本 / 纯图像 / 纯序列**——应该用专门的 encoder（Transformer / CNN）做主干
- **不愿写 cross feature**——直接上 DeepFM / DCN，让模型自己发现交叉

## 历史小故事（可跳过）

- **2010 ~ 2014**：工业 CTR 主战场是 LR + 大量手工 cross feature + FTRL，Google 的 [[ftrl-2013]] 论文奠定 online learning 框架。
- **2014 ~ 2015**：DNN 在 CV/NLP 大放异彩，推荐圈开始尝试，但纯 DNN 在大规模稀疏特征上**效果反而不如 LR**——deep 路太能泛化，把长尾的精确信号"抹平"了。
- **2016**：Google Play 团队 Cheng 等人想到："不如让两个模型一起干，linear 管记忆，DNN 管泛化"。论文 4 页 workshop 短文，但 TensorFlow 当年就把它做成 high-level API。
- **之后 4 年**：DeepFM（2017）、DCN（2017）、xDeepFM（2018）、AutoInt（2019）相继出现，主旋律都是"自动学交叉"，但**两路并行**的骨架没变。
- **现在**：哪怕用了 Transformer 替换 deep 路，工业排序模型仍然几乎都保留一条"线性 / 浅层" tower 兜底——这就是 Wide & Deep 留下的工程范式。

## 论文里值得记住的几个数字

- 训练样本量：**5000 亿**（500B）
- 在线服务延迟上限：**10 ms** / 请求
- deep 路网络结构：embedding 维度约 32，三层隐藏层 1024 → 512 → 256（论文 Section 3.2）
- 上线收益：相对纯 wide 模型 app 安装 **+3.9%**；相对纯 deep 模型 **+1%**（A/B 实验）
- 论文长度：**4 页**（DLRS workshop 短文格式）

这些数字是面试常考点，也是判断"自己是不是真懂这篇"的快速试金石。

## 学到什么

1. **记忆 vs 泛化是一对独立能力**——单一模型很难两个都做好，把它们分到两路、联合训练，反而都更好。
2. **联合训练 ≠ ensemble**——梯度共享让两路相互"挑刺"，每路可以做得更小，总参数量不一定更大。
3. **不同优化器可以混用**——同一个模型里 wide 用 FTRL、deep 用 AdaGrad，根据每路的归纳偏置选优化器。
4. **工业论文价值**：4 页 workshop 短文 + 真实 1B 用户上线数据，胜过百页纯理论。
5. **架构骨架长寿命**——10 年过去，DeepFM、DCN、xDeepFM 都改了细节，但"两路并行 + 联合训练"这个骨架没换。设计模式比具体公式更耐用。

## 延伸阅读

- 论文 4 页 PDF：[Wide & Deep Learning for Recommender Systems](https://arxiv.org/abs/1606.07792)
- TensorFlow 官方教程：[tf.estimator.DNNLinearCombinedClassifier](https://www.tensorflow.org/api_docs/python/tf/estimator/DNNLinearCombinedClassifier)（直接对应论文实现）
- Google AI 博客：[Wide & Deep Learning: Better Together with TensorFlow](https://research.google/blog/wide-deep-learning-better-together-with-tensorflow/)
- [[youtube-two-tower-2019]] —— 同时期 Google 另一类两塔结构，区别在召回 vs 排序

## 关联

- [[youtube-two-tower-2019]] —— 兄弟工作；同样"两路并行"思想，但用于召回，user/item 各一个塔
- [[attention]] —— 后来很多 CTR 模型把 deep 路的 MLP 换成 attention，但 wide+deep 的骨架没变
- [[deepseek-r1]] —— 现代大模型也在用"两路混合"思路（专家/通用），抽象上和 wide+deep 同属"分工 + 联合训练"

## 一句话记住它

把"老店员的记忆 + 新店员的举一反三"装进同一个模型，让两个人**一起反思**每天的对错——这就是 Wide & Deep。从这一天起，工业推荐排序进入"两路并行"的标准范式。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert4rec-2019]] —— BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
- [[dcn-2017]] —— DCN — 在 DNN 旁边并联一条专门学特征交叉的网络
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[din-2018]] —— DIN — 让推荐模型按你看的广告决定该激活你哪段历史
- [[dlrm-2019]] —— DLRM — Meta 把工业推荐模型拆成 4 个标准积木
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
- [[youtube-two-tower-2019]] —— YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键

