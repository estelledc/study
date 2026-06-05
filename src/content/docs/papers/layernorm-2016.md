---
title: Layer Normalization — 把归一化方向从 batch 转到 feature，让 RNN/Transformer 也能稳定训
来源: 'Ba, Kiros & Hinton, "Layer Normalization", arXiv 2016 (1607.06450)'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 入门
---

## 是什么

Layer Normalization（**LN**）是一招**插在每层后面**的归一化操作，但归一化的方向和 BatchNorm 反过来：BN 是「同一通道、跨一个 batch 的所有样本」算均值方差；LN 是「同一个样本、跨这一层所有 hidden units」算均值方差。

日常类比：BN 像「每场考试结束后，老师把全班这道题的成绩拉成平均 60 分、标准差 10」；LN 像「每个学生交完卷后，自己把所有题的得分拉成平均 60、标准差 10」——前者依赖一整批同学，后者只看自己。

就这一行代码（PyTorch `nn.LayerNorm(hidden_size)`），让 BN 在序列任务上失灵的问题被绕开，并且后来直接成为 Transformer 的标配——每个 sublayer 出口都接一个 LN。

## 为什么重要

不理解 LN，下面这些事都解释不通：

- 为什么 RNN/LSTM 时代用了 BN 之后效果没提升甚至变差——序列任务里 batch 维度的统计量不稳
- 为什么 Transformer 全程用的是 LN 而不是 BN——Attention 里 batch 小、序列长度变化大，BN 的均值方差根本没法稳定累计
- 为什么训练和推理时 LN 的算法**一模一样**——它不依赖 batch 统计，不需要 running mean/var
- 为什么 RMSNorm（LLaMA 用的那个）是 LN 的直系简化——只是去掉了减均值那一步

## 核心要点

LN 和 BN 长得很像，但归一化的「轴」完全不同。这是它最核心的区别：

1. **归一化的方向**：假设这一层输出是一个 `[batch=32, hidden=512]` 的张量。BN 沿 batch 轴算——对每个 hidden 通道，得到 32 个数的均值方差，共 512 对统计量。LN 沿 hidden 轴算——对每个样本，得到 512 个数的均值方差，共 32 对统计量。

2. **训练-推理一致**：BN 训练时用当前 batch 的统计量，推理时用训练阶段累计的 running mean/var——两阶段算法不同。LN 不依赖 batch，**训练和推理用的是同一个公式**：每次都对当前样本现算。

3. **可学习的 γ β 还在**：归一化把分布拉回 0 均值 1 方差后，再乘 γ 加 β 让模型恢复表达自由度。γ β 的 shape 是 `[hidden_size]`，每个 hidden unit 一对。

4. **公式**：`y = γ · (x − μ) / √(σ² + ε) + β`，其中 μ σ 是沿 hidden 维算的、**不跨样本**。

## 直观对比 BN 和 LN

把同一个 `[batch=4, hidden=6]` 的张量摆开：

```
        h0  h1  h2  h3  h4  h5
sample0  *   *   *   *   *   *
sample1  *   *   *   *   *   *
sample2  *   *   *   *   *   *
sample3  *   *   *   *   *   *
```

- **BN**：每一**列**算一对 (μ, σ)，共 6 对——跨样本算
- **LN**：每一**行**算一对 (μ, σ)，共 4 对——跨 hidden 算

BN 的统计量随 batch 内容变；LN 的统计量只看当前样本自己。这就是为什么 batch=1 时 BN 直接退化（σ=0）而 LN 完全不受影响。

## 实践案例

### 案例 1：BN 在 RNN 上为什么会翻车

考虑一个 LSTM 跑句子分类，batch=8、句长不定。BN 想在「每个时间步、每个 hidden 通道」上累计均值方差，但是：

- 长句子的尾部时间步只见过少数几个样本（短句已经结束），统计量噪声极大
- 推理时遇到比训练更长的句子，新时间步**没有累计过统计量**
- batch=8 本身就太小，每个 batch 的统计量随机抖动

LN 直接绕开：每个时间步、每个样本、独立做归一化，根本不看 batch 维。

### 案例 2：Transformer 里 LN 的位置

Transformer 一个 block 的伪代码（**Post-LN**，原版）：

```
x = x + Attention(x)
x = LayerNorm(x)
x = x + FeedForward(x)
x = LayerNorm(x)
```

每个 sublayer 都是「残差相加 → LN」。注意 `LayerNorm(x)` 里的 `x` 是 `[batch, seq_len, hidden]`，LN 沿最后一维（hidden）做归一化——每个 token、每个样本独立。

### 案例 3：PyTorch 一行代码

```python
ln = nn.LayerNorm(512)            # 沿最后一维归一化
y = ln(torch.randn(32, 100, 512)) # [batch=32, seq=100, hidden=512]
# y 的最后一维已经是 0 均值 1 方差（再过 γ β）
```

注意 `nn.LayerNorm(512)` 里的 512 是 hidden size，不是 batch size——和 `nn.BatchNorm1d(512)` 长得像但语义反过来。

## 踩过的坑

1. **LN 和 BN 的 shape 参数容易写反**：`BatchNorm2d(C)` 里 C 是通道数，也确实是「沿 batch 归一化」的统计单元数；但 `LayerNorm(H)` 里 H 是被归一化掉的那一维。第一次写很容易混。

2. **Pre-LN vs Post-LN 之争**：原论文是 Post-LN（残差加完再归一化）。但 Post-LN 训练初期梯度方差大，必须配合 lr warmup（Transformer 原论文也是这么干的）。GPT-2 之后逐渐改成 **Pre-LN**——LN 放在残差分支前，恒等通路保留，梯度更稳，不需要 warmup。代价是表达力略弱、最终精度可能稍低。**这就是 Pre-LN vs Post-LN 之争的源头**，至今还在调。

3. **小心算的是哪一维**：`LayerNorm(hidden)` 默认归一化最后一维，但有时你想跨「最后两维」（比如 `[seq, hidden]` 一起归一化），要传 `LayerNorm([seq, hidden])`——这个细节很多新手没注意。

4. **RMSNorm 是顺手的简化**：`y = γ · x / √(mean(x²) + ε)`——只除以 RMS，不减均值。LLaMA / T5 等现代 LLM 直接用 RMSNorm，FLOPs 省 7%-64%，效果几乎不掉。LN 的「减均值」那一步其实没那么必要。

## Pre-LN vs Post-LN 速记

这是 Transformer 工程里反复被调的地方，单独拆出来说：

```
Post-LN（原版 Transformer）：
  x = LayerNorm(x + Sublayer(x))

Pre-LN（GPT-2 之后）：
  x = x + Sublayer(LayerNorm(x))
```

差别看似只是 LN 位置换了，但工程后果截然不同：

- **Post-LN**：训练初期梯度方差大，必须配合 lr warmup（Transformer 原论文 4000 步 warmup），不然训不动；优点是最终精度可能稍高
- **Pre-LN**：恒等通路 `x + ...` 没被 LN 卡住，梯度能直通到底层，**不需要 warmup**，训得稳；现代 LLM 几乎全用这一路

记忆口诀：Post-LN 是「先加再洗」，Pre-LN 是「先洗再加」。先洗的那一路梯度更顺。

## 适用 vs 不适用场景

**适用**：
- RNN/LSTM/GRU 的所有变体——LN 是序列模型的事实标配
- Transformer 全家（BERT / GPT / T5 / ViT / Whisper）——每个 sublayer 后必接
- batch size 极小或为 1 的场景（在线推理、强化学习）——BN 完全失效，LN 不受影响
- 输入序列长度变化大的任务——BN 没法稳定累计统计量，LN 不在乎

**不适用**：
- 大 batch CNN 图像任务——BN 通常更好（CV 里 BN 仍是主流）
- 极小 hidden size——hidden 维样本数太少，LN 的统计量也会抖
- 有强通道独立性的任务——可能 GroupNorm / InstanceNorm 更合适

## 学到什么

1. **归一化的「轴」可以选**：BN 沿 batch 轴、LN 沿 feature 轴、GroupNorm 沿组、InstanceNorm 沿单样本单通道——这是一个完整设计空间，按任务结构挑。

2. **不依赖 batch 统计是 LN 最大的工程优势**：训练推理一致、batch=1 也能跑、序列长度变化无感。这些性质让它成为 Transformer 时代的默认选择。

3. **Pre-LN vs Post-LN 不是小事**：放置位置直接决定要不要 warmup、训得稳不稳、最终精度上限——是工程实践里被反复调的关键。

4. **简化的空间还在**：RMSNorm 证明「减均值」可以省掉。归一化这一类操作，越简单往往效果越好。

## 历史小故事（可跳过）

- **2015 年 2 月**：Ioffe & Szegedy 发表 BN，CNN 训练步数砍到 1/14，立刻成 CV 标配。但 RNN 党试着把 BN 套到 LSTM 上，发现效果时好时坏——大家隐约知道是 batch 维度的锅。
- **2016 年 7 月**：Hinton 组（Ba 是他博士生）放出 LN，明确把归一化方向从 batch 转到 feature，给 RNN 一个干净答案。论文里大量篇幅做 RNN 实验。
- **2017 年 6 月**：Vaswani 等发 Transformer，每个 sublayer 都接 LN（Post-LN）。从此 LN 不只是 RNN 的备选，而是序列建模的事实标配。
- **2019 年起**：Pre-LN 逐渐取代 Post-LN（GPT-2 / ViT / 现代 LLM）；RMSNorm 进一步简化掉减均值。LN 的演化还在继续。

## 延伸阅读

- 论文 PDF：[Ba-Kiros-Hinton 2016](https://arxiv.org/abs/1607.06450)（11 页，前半 RNN 实验，后半数学推导）
- 视频讲解：[Yannic Kilcher — Layer Normalization](https://www.youtube.com/watch?v=2V3Uduw1zwQ)（结合论文逐节讲）
- Pre-LN 起源：Xiong et al. 2020, "On Layer Normalization in the Transformer Architecture"——证明 Pre-LN 不需要 warmup
- RMSNorm 论文：Zhang & Sennrich 2019, "Root Mean Square Layer Normalization"

## 关联

- [[batchnorm-2015]] —— LN 的直接前辈，BN 在序列任务上失效正是 LN 诞生的动机
- [[transformer-2017]] —— LN 的最大用户，每个 sublayer 后必接
- [[adam-2014]] —— LN 配合 Adam 几乎是 Transformer 训练的事实组合
- [[resnet-2015]] —— 残差结构和 LN 一起，构成现代深度模型的两大稳定器
