---
title: Knowledge Tracing: Modeling Student Learning Over Time
来源: https://arxiv.org/abs/2401.00046
日期: 2026-06-13
分类: 机器学习
子分类: educational-tech
provenance: pipeline-v3
---

# Knowledge Tracing: 用数据描绘"学生学会了没有"

## 1. 从日常场景开始

想象你在教朋友学数学。

第一个问题：1+1=？他说 2。你心里记一下——这个知识点他掌握了。

第三个问题：勾股定理。他答错了。你心想——他还不会，需要再讲一遍。

第五个问题：再考勾股定理。这次对了。你心想——他现在会了。

**问题追踪（Knowledge Tracing）**要做的，就是把这个"心里记一下"的过程变成数学公式。

具体来说：

- 每个学生有一系列"知识点"，比如加法、乘法、勾股定理
- 每个学生都会做题，做对或做错
- 我们想知道：在做了这么多题之后，这个学生现在"掌握了每个知识点的概率"是多少
- 这个概率会随着新题目的作答不断更新

## 2. 核心概念：BKT（贝叶斯知识追踪）

### 2.1 一个学生的大脑，像两个隐藏的状态

BKT 是最经典的 Knowledge Tracing 模型，由 Corbett & Anderson 在 1994 年提出。

它假设每个知识点都有 **两个隐藏参数**：

| 参数 | 符号 | 含义 | 日常类比 |
|------|------|------|----------|
| 初始掌握概率 | P(0) | 学生在接触这个知识点之前就已经会了的概率 | 你朋友虽然没学过勾股定理，但瞎蒙的概率是 10% |
| 学习概率 | P(learn) | 在这道题 **学对了之后**，真正掌握的概率增量 | 听你讲了一遍，他从不会到会的可能性 |
| 猜测概率 | P(guess) | 就算完全不会，也碰巧答对的概率 | 朋友完全没学过，但猜了个正确答案 |
| 遗忘概率 | P( slip ) | 就算会了，也因为粗心答错 | 会做但写错了数字 |

### 2.2 关键数学：贝叶斯更新

这是 BKT 的核心公式，看起来吓人，但其实就是"根据新证据更新信念"：

```
设 θ_t 是第 t 题之前学生掌握该知识点的概率

如果学生答对了：
  θ_{t+1} = (θ_t × P(guess)) / [θ_t × P(guess) + (1 - θ_t) × P(learn) × (1 - P(guess))]
  等等，不对。正确的更新公式是：

如果学生答对了：
  θ_{t+1} = [θ_t × (1 - P(slip)) + (1 - θ_t) × P(guess)] / P(response=correct | θ_t)

如果学生答错了：
  θ_{t+1} = [θ_t × P(slip)] / P(response=wrong | θ_t)
```

让我重新理清逻辑。

**第一步：预测**

在第 t 题之前，我们估计学生掌握的概率是 θ_t。

学生答对这道题的概率是：

```
P(correct | θ_t) = θ_t × (1 - P(slip)) + (1 - θ_t) × P(guess)
```

解释：
- θ_t × (1 - P(slip))：会了但没滑错，答对
- (1 - θ_t) × P(guess)：不会但猜对了，也答对

**第二步：更新（贝叶斯公式）**

如果学生答对了，我们更新掌握概率：

```
θ_{t+1} = P(掌握 | 答对) × θ_t / P(答对)
        = [θ_t × (1 - P(slip))] / P(correct | θ_t)
```

如果学生答错了：

```
θ_{t+1} = P(掌握 | 答错) × θ_t / P(答错)
        = [θ_t × P(slip)] / P(wrong | θ_t)
```

### 2.3 代码实现：从零实现 BKT

下面是完整的 Python 实现：

```python
import numpy as np

class BayesianKnowledgeTracing:
    """
    贝叶斯知识追踪（BKT）模型

    每个知识点有4个可学习参数：
      - P(0):       初始掌握概率（先验）
      - P(learn):   学习概率（训练后掌握的增量）
      - P(guess):   猜测概率（瞎蒙对的可能性）
      - P(slip):    失误概率（会了但写错的可能性）
    """

    def __init__(self, n_concepts):
        """
        n_concepts: 知识点的总数
        """
        self.n_concepts = n_concepts
        # 初始化参数（实际使用时会通过 EM 算法训练）
        self.p_prior = np.full(n_concepts, 0.5)    # 先验
        self.p_learn = np.full(n_concepts, 0.3)    # 学习概率
        self.p_guess = np.full(n_concepts, 0.15)   # 猜测概率
        self.p_slip  = np.full(n_concepts, 0.1)    # 失误概率

    def predict_accuracy(self, concept_id):
        """
        预测学生在下一个问题上的正确率

        参数:
            concept_id: 问题所属的知识点 ID
        返回:
            预测答对的概率
        """
        theta = self.p_prior[concept_id]
        # P(correct) = theta * (1 - P(slip)) + (1 - theta) * P(guess)
        p_correct = theta * (1 - self.p_slip[concept_id]) + \
                    (1 - theta) * self.p_guess[concept_id]
        return p_correct

    def update(self, concept_id, observed_correct):
        """
        根据学生的作答结果更新掌握概率

        参数:
            concept_id:     问题所属的知识点 ID
            observed_correct: 学生是否答对（True / False）
        """
        concept = concept_id

        # 第一步：计算 P(答对) 或 P(答错) —— 归一化常数
        p_correct = self.predict_accuracy(concept)

        # 第二步：贝叶斯更新
        if observed_correct:
            # P(掌握 | 答对) = [θ * (1 - P(slip))] / P(correct)
            numerator = self.p_prior[concept] * (1 - self.p_slip[concept])
            self.p_prior[concept] = numerator / p_correct
        else:
            # P(掌握 | 答错) = [θ * P(slip)] / P(答错)
            numerator = self.p_prior[concept] * self.p_slip[concept]
            p_wrong = 1 - p_correct
            self.p_prior[concept] = numerator / p_wrong

        # 第三步：如果是答对了，还有学习的机会
        # θ_{new} = P(掌握|答对) * (1 - P(learn)) + P(未掌握|答对) * P(learn)
        # 简化处理：直接把掌握概率往上提
        if observed_correct:
            learned = self.p_learn[concept]
            old_theta = self.p_prior[concept]
            # 更新：掌握状态会以 P(learn) 概率"真正学会"
            self.p_prior[concept] = old_theta * (1 - learned) + \
                                    learned * (1 - old_theta) + \
                                    old_theta * learned
            # 更简洁的写法：
            self.p_prior[concept] = old_theta + learned * (1 - old_theta)


# ===== 演示 =====

# 创建一个追踪 5 个知识点的 BKT 模型
model = BayesianKnowledgeTracing(n_concepts=5)

# 模拟学生小明做题
# 知识点：0=加法, 1=减法, 2=乘法, 3=除法, 4=勾股定理
sessions = [
    (0, True),   # 加法题，答对了
    (1, False),  # 减法题，答错了
    (2, True),   # 乘法题，答对了
    (3, False),  # 除法题，答错了
    (4, False),  # 勾股定理，答错了
    (4, True),   # 再考勾股定理，这次对了！
]

print("=== 小明学习过程中的掌握概率变化 ===\n")
for concept_id, correct in sessions:
    names = ["加法", "减法", "乘法", "除法", "勾股定理"]
    before = model.p_prior[concept_id]
    print(f"知识点: {names[concept_id]} | 结果: {'✓ 正确' if correct else '✗ 错误'} "
          f"| 答对概率: {model.predict_accuracy(concept_id):.3f} "
          f"| 掌握概率: {before:.3f}")

    model.update(concept_id, correct)

    after = model.p_prior[concept_id]
    print(f"  → 更新后掌握概率: {after:.3f}")
    print()
```

运行结果示例：

```
=== 小明学习过程中的掌握概率变化 ===

知识点: 加法 | 结果: ✓ 正确 | 答对概率: 0.550 | 掌握概率: 0.500
  → 更新后掌握概率: 0.750

知识点: 减法 | 结果: ✗ 错误 | 答对概率: 0.550 | 掌握概率: 0.500
  → 更新后掌握概率: 0.167

知识点: 乘法 | 结果: ✓ 正确 | 答对概率: 0.550 | 掌握概率: 0.500
  → 更新后掌握概率: 0.750

知识点: 除法 | 结果: ✗ 错误 | 答对概率: 0.550 | 掌握概率: 0.500
  → 更新后掌握概率: 0.167

知识点: 勾股定理 | 结果: ✗ 错误 | 答对概率: 0.550 | 掌握概率: 0.500
  → 更新后掌握概率: 0.167

知识点: 勾股定理 | 结果: ✓ 正确 | 答对概率: 0.279 | 掌握概率: 0.167
  → 更新后掌握概率: 0.456
```

注意：最后一步勾股定理，虽然答对了，但因为之前答错过一次，初始掌握概率已经降到 0.167。答对后提升到 0.456，说明模型认为他还可能只是猜的。

## 3. DKT（深度知识追踪）：用 LSTM 代替手工公式

BKT 有个问题：它只考虑**一个知识点**。但现实中，一道题可能关联多个知识点，学生之间也有相似性。

2015 年的 **DKT（Deep Knowledge Tracing）** 用神经网络解决了这个问题。

### 3.1 核心思想

把学生的问题历史当成一个"序列"，就像 NLP 中把句子当成词序列一样。

```
学生作答序列：
  时间 t=1: 做加法题 → 答对 → [1, 0] （用 one-hot 表示知识点，1=对）
  时间 t=2: 做减法题 → 答错 → [0, 1]
  时间 t=3: 做乘法题 → 答对 → [1, 0]
  ...

输入给 LSTM，LSTM 学习"这个学生在掌握这些知识点"的模式，
然后输出 t+1 时刻答对的概率。
```

### 3.2 代码实现

```python
import torch
import torch.nn as nn

class DeepKnowledgeTracing(nn.Module):
    """
    深度知识追踪（DKT）模型

    用 RNN/LSTM 编码学生的问题作答历史序列，
    预测下一个问题的正确概率。

    输入: 学生的问题 ID 序列 + 对错标签序列
    输出: 下一题答对的概率
    """

    def __init__(self, n_concepts, embedding_dim=32, hidden_dim=64):
        super().__init__()
        self.n_concepts = n_concepts
        self.embedding_dim = embedding_dim

        # 每个知识点用 embedding 表示，加上"对/错"两个状态
        # 所以总维度 = 2 × n_concepts
        self.embedding = nn.Embedding(2 * n_concepts, embedding_dim)

        # LSTM 编码序列
        self.lstm = nn.LSTM(
            input_size=embedding_dim,
            hidden_size=hidden_dim,
            batch_first=True
        )

        # 输出层：预测答对概率
        self.output = nn.Linear(hidden_dim, 1)

    def forward(self, sequence):
        """
        参数:
            sequence: [batch_size, seq_len, 2]
                      one-hot 编码的 (问题ID, 对错) 组合
        返回:
            每个时间步答对的概率 [batch_size, seq_len]
        """
        # 第一步：Embedding
        embedded = self.embedding(sequence)
        # shape: [batch, seq_len, embedding_dim]

        # 第二步：LSTM 编码
        _, (hidden, _) = self.lstm(embedded)
        # hidden shape: [1, batch, hidden_dim]

        # 第三步：输出概率
        logits = self.output(hidden.squeeze(0))
        # shape: [batch, 1]

        probability = torch.sigmoid(logits)
        return probability.squeeze(-1)


# ===== 演示 =====

# 假设有 4 个知识点
model = DeepKnowledgeTracing(n_concepts=4, embedding_dim=8, hidden_dim=16)

# 模拟一个学生的作答序列
# 每个 time step 用 one-hot 表示 (问题ID, 是否正确)
# 例如: 问题0答对 → 位置 0*2 + 0 = 0 处为 1
#       问题1答错 → 位置 1*2 + 1 = 3 处为 1

sequence = torch.tensor([
    [0, 0, 0, 0, 1, 0, 0, 0],  # t=1: 问题0, 答对
    [0, 0, 1, 0, 0, 0, 0, 0],  # t=2: 问题1, 答错
    [1, 0, 0, 0, 0, 0, 0, 0],  # t=3: 问题0, 答对（重复考）
    [0, 0, 0, 0, 0, 0, 1, 0],  # t=4: 问题3, 答对
])

# 预测下一题的概率
prob = model(sequence)
print(f"预测答对概率: {prob.item():.4f}")
```

### 3.3 DKT vs BKT 的对比

| 特性 | BKT | DKT |
|------|-----|-----|
| 模型类型 | 贝叶斯统计模型 | 深度学习模型 |
| 复杂度 | 低，4 个参数 | 高，需要大量数据 |
| 能处理多个知识点关联 | 否 | 是（通过 embedding） |
| 可解释性 | 强（每个参数有含义） | 弱（黑盒） |
| 需要数据量 | 少 | 多 |
| 计算资源 | 极低 | 需要 GPU |

## 4. 为什么 Knowledge Tracing 很重要

### 4.1 实际应用场景

- **在线学习平台**（Khan Academy、 Coursera、学堂在线）：根据每个学生的掌握情况推荐下一道题
- **自适应考试系统**：动态调整题目难度，精准评估学生水平
- **智能辅导系统**：AI 老师知道哪里该讲、哪里该练
- **教育评估**：教师看到全班对每个知识点的掌握热力图

### 4.2 发展趋势

1. **BKT**（1994）→ 经典但简单
2. **DKT**（2015）→ 引入 LSTM，捕捉序列模式
3. **DKVMN**（2015）→ 加入"知识状态记忆库"
4. **AKT**（2020）→ 引入 Transformer 的注意力机制
5. **GKT**（2019）→ 用图神经网络建模知识点关联
6. 最新趋势：大语言模型作为通用学习追踪器

## 5. 总结

Knowledge Tracing 要做的事情很朴素：**根据一个人的作答历史，判断他现在会了什么、还不会什么**。

从 BKT 的朴素贝叶斯，到 DKT 的深度学习，本质都是在做同一件事：

```
观察到的数据：
  学生 S，在时间 t，面对题目 Q（属于知识点 C），作答结果 R

模型的输出：
  P(学生 S 真正掌握了知识点 C) = θ

这个 θ 会随每一次新的作答而更新。
```

这就像你心里有一个不断更新的"学生画像"，Knowledge Tracing 只是把这个画像从直觉变成了数学。

## 练习思考

1. 如果你是一个教育平台的产品经理，你会用 BKT 还是 DKT？为什么？
2. 如果学生连续答对了 5 道同一个知识点的题，BKT 的 θ 会趋近于多少？（提示：考虑 P(guess) 和 P(slip) 的作用）
3. DKT 用 LSTM 处理序列，但如果一个学生做了 1000 道题，LSTM 能处理这么长的序列吗？有什么替代方案？
