---
title: TabPFN — 一秒解决小表格分类的 Transformer
来源: 'Hollmann, Müller, Eggensperger, Hutter, "TabPFN: A Transformer That Solves Small Tabular Classification Problems in a Second", ICLR 2023'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

TabPFN 是一个**预训练好的 Transformer**，看一眼就能给出表格分类的答案，不需要再训练。

日常类比：经验老到的中医师傅。徒弟把"全班同学的病历 + 这位新病人的症状"一起递过去，师傅扫一眼立刻报"风寒还是风热"。他靠的不是为这个病人重新读 3 年书，而是过去看过的几百万个相似病例。

具体到表格：

- 你给它一张训练表（比如 800 行 × 30 列 + 标签）
- 再给一行没有标签的测试样本
- 它把两者拼成一段输入塞进 Transformer
- **一次前向**就输出测试样本属于每个类别的概率

整个过程**没有梯度下降、没有 fit()**。它的参数是出厂前在几百万个合成数据集上预训练好的。

## 为什么重要

表格数据是工业界最常见的数据形态（金融风控、医疗诊断、用户分群），但深度学习在这上面**追了 10 年没追上 GBDT**。XGBoost / LightGBM / CatBoost 一直是冠军。

TabPFN 是第一次让 Transformer 在**小样本表格**上全面超过经过充分调参的 GBDT，而且：

- 推理时间从"分钟级调参 + 秒级训练"压到**1 秒一次前向**
- 用户**零超参数调节**——不用 grid search、不用学习率
- 训练成本一次性付清（开发者在合成数据上预训练几天），用户白嫖

这是表格领域第一次出现 "foundation model 时刻"——和 GPT-3 把 in-context learning 带进 NLP 是同一种范式迁移。

## 核心要点

TabPFN 能这样工作，靠三件事拼起来：

1. **PFN 框架（Prior-Fitted Networks）**：用神经网络近似**贝叶斯后验预测分布**——白话：在见过训练行之后，给新行报"属于各类的概率"。类比：教 Transformer 当贝叶斯推断器。Müller 等 2022 年提出，TabPFN 是表格上的首个成功应用。

2. **合成 prior 数据**：从先验里**采样无穷多个小型假表格**。先验混了贝叶斯神经网络 + **结构因果模型**（白话：先画"谁影响谁"的因果箭头，再按箭头造数）。假数据贴近真实表格规律，所以能迁移。

3. **In-context learning**：训练集 + 测试样本拼成一段序列。**Encoder**（白话：把每一行压成向量的模块）编码后，注意力让测试行"看见"训练行，一次前向出类别概率。

记住：**原版限制 ≤1000 训练样本、≤100 特征、≤10 类**。超出就要降级。

## 实践案例

### 案例 1：拿来就用

```python
from tabpfn import TabPFNClassifier
clf = TabPFNClassifier(device='cuda')  # 无 GPU 改 'cpu'，更慢但能跑
clf.fit(X_train, y_train)   # 几乎不做事，只缓存训练集
y_pred = clf.predict(X_test)  # 一次前向，约 1 秒
```

**逐部分解释**：`fit()` 为兼容 sklearn，**并不训练**；真正计算在 `predict()`。参数出厂已冻住。

### 案例 2：和 XGBoost 比一比

**逐步对比**（OpenML-CC18，约 30 个小型分类集，论文报告量级）：

1. 同一批 ≤1000 行任务上分别跑默认 XGBoost、调参 XGBoost、AutoML、TabPFN
2. 看平均 ROC AUC（越高越好）与墙钟时间
3. 量级：默认 XGBoost 约 0.86 / 数秒；调参约 1 小时到约 0.89；AutoML 约数小时到约 0.89；TabPFN 零调参约 0.91 / 约 1 秒

上万行时 TabPFN 要子采样集成，优势变弱，GBDT 更稳。

### 案例 3：合成 prior 长什么样

```python
# 预训练伪代码：每个假数据集这样造
scm = sample_causal_graph()          # 随机"谁影响谁"
generator = sample_bayes_net(scm)    # 按因果图造数
X, y = generator.draw(n_rows=256)
loss = tabpfn.predict_heldout(X[:-1], y[:-1], X[-1], y[-1])
```

**Transformer 学的不是某个具体表**，而是"在这种先验下做推断"——把推断蒸馏进网络。

## 踩过的坑

1. **误以为在用户数据上训练**：参数已冻结；用户数据只在前向 in-context 里出现，不是 fine-tune。
2. **>1000 行硬套**：会子采样到 1000 再集成，常不如 XGBoost——大表选 GBDT。
3. **特征 >100 / 类别 >10**：原版报错或截断；要扩展等 v2 或自训 prior。
4. **只盯架构、忽视 prior**：差 prior 下同样 Transformer 学不会；prior 才是灵魂。

## 适用 vs 不适用场景

**适用**：

- 行数 ≤1000、特征 ≤100、类别 ≤10 的分类任务
- 需要快速 baseline——交付前 30 秒拿一个强基线
- 算力充足但人力调参时间紧（比如 Kaggle 比赛冷启动）
- 教学演示——展示 in-context learning 在结构化数据上也能成

**不适用**：

- 大规模表格（>10000 行）—— GBDT 仍然是更好的选择
- 高维稀疏特征（>100 列）—— 超出限制
- 回归任务（原版只支持分类，v2 才加回归）
- 需要特征重要性 / 可解释性的金融、医疗合规场景
- 在线学习——每次推理都要把整个训练集塞进去，O(N²) 注意力开销

## 历史小故事（可跳过）

- **2017 年**：Transformer 发表；随后数年深度学习在表格上仍难稳赢 GBDT。
- **2022 年初**：Müller、Hollmann 等提出 PFN（"Transformers Can Do Bayesian Inference"），为 TabPFN 奠基。
- **2022 年 7 月**：TabPFN 挂上 arXiv，在 OpenML 小表排行榜引起关注。
- **2023 年**：ICLR 2023 Spotlight；团队获 Frank Hutter 相关 ERC 资助支持。
- **2025 年**：TabPFN v2 发 Nature，扩展回归、缺失值与更大规模。

## 学到什么

1. **Foundation model 可跨模态迁移**——in-context learning 在表格也成立，但 prior 必须重做。
2. **预训练一次付清**——用户零训练、零调参，就能拿到接近充分调参 GBDT 的小表效果。
3. **好先验的合成数据可以赢真实数据堆砌**——TabPFN 预训练全是假表，却在真实小任务上很强。
4. **架构次要，prior 与目标才是灵魂**——同样 Transformer，prior 差就学不会。

## 延伸阅读

- 视频教程：[Yannic Kilcher — TabPFN paper review](https://www.youtube.com/watch?v=KlECLY-vMb0)（45 分钟把论文逐段讲清）
- 官方代码：[automl/TabPFN GitHub](https://github.com/automl/TabPFN)（pip install tabpfn 直接能跑）
- 论文 PDF：[arXiv 2207.01848](https://arxiv.org/abs/2207.01848)
- Müller 2022 PFN 论文：[Transformers Can Do Bayesian Inference](https://arxiv.org/abs/2112.10510)（理解 TabPFN 必读前置）
- v2 Nature 论文：[Accurate predictions on small data with a tabular foundation model](https://www.nature.com/articles/s41586-024-08328-6)（2025）
- [[attention]] —— TabPFN 用的是标准 Transformer encoder，注意力是底座
- [[gpt-3]] —— in-context learning 的范式来源

## 关联

- [[attention]] —— TabPFN 的骨架就是标准 Transformer encoder
- [[gpt-3]] —— in-context learning 范式从 NLP 迁移到表格的桥梁
- [[bert]] —— 同样是 encoder-only 的双向 Transformer，TabPFN 借鉴了这个结构
- [[transformer-xl-2019]] —— 长上下文 Transformer，TabPFN 把训练集当 context 处理
- [[flash-attention]] —— TabPFN 推理瓶颈在 O(N²) 注意力，FlashAttention 是缓解方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chronos-2024]] —— Chronos — 把时间序列当语言来训练大模型
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去

