---
title: 'Toy Models of Superposition'
来源: 'Elhage et al., "Toy Models of Superposition", Anthropic Transformer Circuits 2022'
日期: 2026-05-29
分类: AI 可解释性
难度: 中级
---

## 是什么

Toy Models of Superposition（**Toy Models**）是 Anthropic 2022 年的一篇论文——**用最简单的小模型解释为什么神经网络一个神经元会同时编码很多无关概念**。日常类比：神经元像一间狭小公寓，要塞下 1000 个室友（特征），每个室友共用同一张床（神经元方向）。床不够，只能交错排班——你睡白天、我睡夜晚。

你打开 GPT-2 的某个神经元，它**既**对 Python 代码激活，**又**对 DNA 序列激活，看起来"什么都不是"。论文给这种现象一个名字：**superposition**（叠加）。然后用一个**只有 5 行核心代码**的小模型，把它**复现**出来。

这是 Anthropic Mechanistic Interpretability（机制可解释性）研究的起点之一，也是后来 [[sparse-autoencoders]] 的理论基础。

## 为什么重要

不理解 superposition，下面这些事都没法解释：

- 为什么 LLM 内部每个神经元看起来"乱七八糟"——叫做 **polysemantic**（多义性）
- 为什么早期可解释性研究老是失败——以为一个神经元 = 一个概念，但实际上 1 个神经元 = 几十个概念
- 为什么 Anthropic 后来花大力气做 sparse autoencoder——因为 superposition 的"逆问题"就是把压在一起的特征分开
- 为什么"AI 黑盒"问题第一次有了**数学化**的研究框架——不再只是"我们看不懂"，而是"为什么必然看不懂"

## 核心要点

论文要解释的核心问题可以拆成 **三个观察**：

1. **Superposition 是几何必然**：当你要表达的特征数 **n** 大于神经元数 **m**（n > m），又想让每个特征都"留下痕迹"，唯一办法是让多个特征**共用方向**。类比：你有 5 个朋友想坐进 2 人沙发——必须叠着坐。

2. **稀疏度（sparsity）决定 superposition 严不严重**：如果特征**很少同时出现**（稀疏），共用方向也没事——大部分时候只有一个室友在床上。如果特征**经常一起激活**（稠密），共用方向就互相干扰，模型只好"放弃"一些特征。

3. **Phase change（相变）**：当稀疏度从 0（稠密）慢慢调到 1（极稀疏）时，模型行为不是平滑过渡，而是在某个阈值**突然**学会"压缩多个概念到少量神经元"。类似水到 100°C 突然变蒸汽。

三点连起来：**特征 ≠ 神经元；特征是方向，方向可以共用，共用程度看稀疏。**

## 实践案例

### 案例 1：toy 模型长什么样

论文的核心模型只有 5 行：

```python
import torch.nn as nn

class ToyModel(nn.Module):
    def __init__(self, n_features, n_hidden):
        super().__init__()
        self.W = nn.Parameter(torch.randn(n_features, n_hidden))
        self.b = nn.Parameter(torch.zeros(n_features))

    def forward(self, x):
        h = x @ self.W           # 压缩到 hidden（n_features → n_hidden）
        out = h @ self.W.T + self.b  # 还原回原维度
        return torch.relu(out)
```

**逐部分解释**：

- 输入 `x` 是 `n_features` 维的稀疏向量（比如 5 维，但大部分位置是 0）
- `W` 把它压缩到 `n_hidden` 维（比如 2 维）——故意让 hidden 比 input 小
- 再用 `W.T` 还原回 `n_features` 维
- 训练目标：还原后的向量和原始 `x` 越像越好

**关键技巧**：用 `W.T`（转置）做还原，不是新参数。这逼模型"用同一组方向编码和解码"，这样几何结构就清晰可见。

### 案例 2：可视化 superposition

论文最经典的图：取 `n_features=5, n_hidden=2`，画出 W 的 5 行（每行是一个特征在 2D hidden 空间里的方向）。

- 当**稀疏度 0**（所有特征都密集激活）：模型只学到 2 个特征（hidden 容量上限），其他 3 个被丢弃
- 当**稀疏度 0.9**（特征基本不同时出现）：5 个特征**全都学到了**，5 个方向均匀分布在 2D 平面上（72° 一个）——这就是 superposition

5 个室友挤进 2 张床，但因为他们**几乎不同时回家**，所以"够用"。

### 案例 3：真实 LLM 里的 superposition

Anthropic 后来在 GPT-2 Small 里观察到：

- 某个神经元**同时**对 "Python 代码片段" 和 "DNA 碱基序列（ATGC）" 激活
- 看起来风马牛不相及，但因为 Python 代码和 DNA 序列**几乎不会在同一段文本里出现**（高稀疏），网络就把它们叠到了同一个方向

这就是为什么早期可解释性研究"打开一个神经元发现什么都不是"——不是神经元乱了，是特征**故意叠在一起省空间**。

## 踩过的坑

1. **用 ReLU 不是 sigmoid**：toy 模型的非线性必须是 ReLU。sigmoid 没有"零值"概念，无法体现"稀疏特征大部分时候是 0"。这是 superposition 出现的前提。

2. **稀疏度从 0 到 1 不是线性变化**：很多人以为稀疏度调高一点点 superposition 就增加一点点。实际上有 **phase change**——某个阈值之前模型完全不 superposition，过了之后突然"开窍"。这就是为什么 LLM 训练曲线常有"突然学会"的现象。

3. **特征数 n 必须 >> hidden 数 m 才有意义**：如果 n ≤ m（神经元够用），模型直接每个特征一个方向（叫 monosemantic，单义），看不到 superposition。所以要研究 superposition 得故意让模型"内存不够"。

4. **几何结构不是巧合**：5 个特征塞进 2D 时学到正五边形（pentagon），3 个特征塞进 2D 时学到正三角形——这些**正多边形结构**是数学上的最优解（最小化干扰），不是随机产物。

## 适用 vs 不适用场景

**适用**：
- 解释 LLM 内部为什么 polysemantic（每个 neuron 看不出明确意义）
- 给 [[sparse-autoencoders]] 提供"为什么需要把特征拆开"的理论依据
- 做机制可解释性研究的起点——先看 toy 再看真实模型
- 解释训练过程中的"涌现"和 phase change 现象

**不适用**：
- 直接预测某个具体神经元编码什么——toy model 解释**为什么会这样**，不是**具体是什么**
- 处理超大模型的 superposition——toy 是几十维的，真实 LLM 是几千维，结构复杂得多
- 视觉模型——论文主要例子是文本特征，但思想可以迁移
- 不是工程方法——这是**理论解释**，不直接给可解释性工具，工具是后来的 [[sparse-autoencoders]]

## 历史小故事（可跳过）

- **2021 年**：Anthropic 成立第二年，Chris Olah 团队开始在 [transformer-circuits.pub](https://transformer-circuits.pub) 发系列博客，研究 transformer 内部"电路"
- **2022 年 3 月**：先发 [[induction-heads]]——发现 transformer 自己学会了"复制 + 模式匹配"的电路
- **2022 年 9 月**：发 Toy Models 论文，**13 节**，blog 形式发布，arXiv 号 `2209.10652`
- **2023 年 10 月**：Anthropic 发 *Towards Monosemanticity*——用 sparse autoencoder 把 superposition 特征拆开，第一次在小模型上做出"每个特征一个意义"
- **2024 年 5 月**：Anthropic 在 Claude 3 Sonnet 上跑 [[sparse-autoencoders]]，找到 3000 万个有意义的特征——"Golden Gate Bridge 神经元"出圈
- **2025 年**：Anthropic 大规模招 mech interp 研究员，把 toy → SAE → real LLM 这条路线工业化

## 学到什么

1. **特征不是神经元，是方向**——这是过去 5 年 AI 可解释性最重要的洞见之一
2. **网络是在玩"压缩"**——只要稀疏度允许，它会主动把多个特征塞到一个神经元，这是优化目标的**必然**结果
3. **理论 + toy code 比大模型实验更先 surface 问题**——论文 5 行核心代码解释了 GPT-2 的现象
4. **Phase change** 是机器学习里被低估的现象——很多"涌现能力"本质上是稀疏度跨过阈值
5. **Monosemantic（一神经元一概念）不是默认状态**——是要靠后续技术（SAE）**强行拆开**才能得到的

## 延伸阅读

- 原文（blog 形式，最清晰）：[Toy Models of Superposition](https://transformer-circuits.pub/2022/toy_model/index.html)（含交互式可视化）
- arXiv 版：[arXiv:2209.10652](https://arxiv.org/abs/2209.10652)
- 教学复刻：[ARENA 3.0 — Toy Models 章节](https://github.com/callummcdougall/ARENA_3.0)（一步步跑 toy code，看几何结构）
- 后续工作：[Towards Monosemanticity (2023)](https://transformer-circuits.pub/2023/monosemantic-features)——把 toy 思想用到真实小模型
- [[sparse-autoencoders]] —— Toy Models 直接催生的可解释性工具
- [[anthropic-circuits]] —— 同一研究 program 的电路视角

## 关联

- [[sparse-autoencoders]] —— 把 superposition 压在一起的特征**拆开**的工具
- [[anthropic-circuits]] —— 同一团队的电路视角，与 Toy Models 互补
- [[induction-heads]] —— Anthropic mech interp 三部曲的另一篇
- [[attention]] —— Transformer 的核心机制，superposition 主要发生在 MLP 层但 attention 也有
- [[bert]] —— 早期被研究 polysemantic 现象的模型之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sparse-autoencoders]] —— Sparse Autoencoders — 把 superposition 解出来

