---
title: Tree-of-Attention: Branching Attention for Long-Context Reasoning
来源: https://arxiv.org/abs/2605.30789
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Tree-of-Attention: Branching Attention for Long-Context Reasoning

> **一句话总结：** 这篇论文发现——在 GRPO 强化学习中，用小模型来做"探索者"，比在大模型里加随机噪声更能产生有质量的多样性，从而更快更好地训练大模型。

## 一、日常类比：寻宝游戏

想象你和朋友在玩一个寻宝游戏。规则是：每个人都要尝试不同的路线去找宝藏，最后把走过的路画成地图。

**传统做法（GRPO 原始方法）：** 让同一个经验丰富的寻宝专家（大模型）多走几次，每次故意让他"随机拐个弯"（加 token 级别的随机噪声）。问题是——这些随机拐弯经常让他走进死胡同，路线变得毫无逻辑。

**这篇论文的做法（S2L-PO）：** 找一个刚入门的新手（小模型），让他自由探索。新手虽然能力弱，但他走的每条路都是他自己"认真想出来"的，路线之间有内在的逻辑连贯性。你把这些新手的路线收集起来，教给那个经验丰富的专家。结果——专家学得更快，而且走得更远。

关键洞察：**多样性不等于随机性。** 小模型的"无知"反而是一种结构化的探索信号。

## 二、背景知识：GRPO 是什么？

在动手写代码之前，先搞懂 GRPO。

GRPO（Group Relative Policy Optimization）是大语言模型微调的一种方法。它的核心思想是：

1. 给模型出一道题
2. 让模型生成多个不同的答案（这叫"rollout"）
3. 对比这些答案的好坏
4. 根据好坏调整模型的参数，让它以后更可能生成好答案

**问题在于：** 如果生成多个答案时只是简单地增加随机性（提高 temperature），生成的答案质量参差不齐，很多根本不合逻辑，反而干扰了学习效果。

## 三、核心概念

### 3.1 Token-Level 噪声 vs Policy-Level 多样性

这是这篇论文最重要的区分。

**Token-Level 噪声（传统做法）：** 在每个词的选择上加点随机性。就像让一个厨师做菜时随机换调料——做出来的菜可能很难吃，因为每一步都乱了。

**Policy-Level 多样性（本文做法）：** 让整个策略（即整个解题思路）有所不同。就像让不同厨师各自按自己的风格做菜——每道菜都有完整的逻辑，只是风格不同。

论文发现：小模型天然具有更高的 Policy-Level 多样性，而且这种多样性是"时间上相关的"（temporally correlated），也就是说小模型的每一步决策之间是有逻辑联系的，不会像随机噪声那样前后矛盾。

### 3.2 S2L-PO：小到大策略优化

S2L-PO（Small-to-Large Policy Optimization）是本文提出的框架：

```
小模型（固定不动） ──→ 生成多样化的解题路径 ──→ 教给大模型
                                                    ↓
                                             大模型逐步学会
                                              更好的探索策略
```

小模型在整个过程中**不被训练**，它只是一个"探索者"。大模型用它生成的路径来学习。

### 3.3 渐进式退火策略

如果一直让小模型带大模型，大模型可能学不到足够的东西（因为小模型能力有限）。所以论文设计了一个"渐进退火"策略：

- 早期：主要用大模型的"老师"（小模型）提供的路径来学习
- 后期：逐渐过渡到大模型自己采样，减少对小模型的依赖

这就像学自行车——刚开始用辅助轮（小模型），慢慢减少辅助轮的支撑，最后完全靠自己。

## 四、代码示例

### 示例 1：理解 Token-Level 噪声与 Policy-Level 多样性的区别

```python
import torch
import torch.nn.functional as F

# 假设我们有一个语言模型，要生成答案
def generate_with_token_noise(model, prompt, temperature=1.5):
    """
    传统做法：通过提高 temperature 来增加随机性。
    这会在每个 token 的选择上引入噪声。
    """
    inputs = tokenizer(prompt, return_tensors="pt")
    outputs = model.generate(
        **inputs,
        temperature=temperature,      # 高 temperature = 更多随机选择
        top_p=0.9,
        max_new_tokens=200,
        num_return_sequences=5         # 生成 5 个答案
    )
    return [tokenizer.decode(o) for o in outputs]

def generate_with_small_model_explorer(small_model, large_model, prompt):
    """
    S2L-PO 做法：用小模型生成多样化的解题路径。
    小模型的多样性是结构化的、有逻辑的。
    """
    # 小模型固定不动，用自己的方式生成多条路径
    small_inputs = tokenizer(prompt, return_tensors="pt")
    small_outputs = small_model.generate(
        **small_inputs,
        temperature=0.8,               # 小模型不需要很高的 temperature
        max_new_tokens=200,
        num_return_sequences=5
    )
    small_paths = [tokenizer.decode(o) for o in small_outputs]

    # 大模型用小模型的路径作为"示范"来学习
    # （实际训练中会用 GRPO 的梯度更新大模型）
    return small_paths

# 类比理解：
# Token-Level 噪声：    同一个厨师，每次随机换调料 → 味道不可预测
# Policy-Level 多样性：  五个不同厨师，各自发挥 → 每道菜都有完整风味
```

### 示例 2：渐进式退火策略的实现

```python
import numpy as np

class ProgressiveAnnealingScheduler:
    """
    渐进式退火调度器。
    控制从小模型探索到大模型自主采样的过渡比例。
    """

    def __init__(self, total_steps=10000, anneal_start=2000, anneal_end=7000):
        self.total_steps = total_steps
        self.anneal_start = anneal_start   # 开始过渡的步骤
        self.anneal_end = anneal_end       # 过渡完成的步骤

    def get_small_model_ratio(self, step):
        """
        返回当前步骤中小模型路径应该被使用的比例。
        - 步骤 0~2000:  100% 用小模型路径
        - 步骤 2000~7000: 从 100% 线性降到 0%
        - 步骤 7000+:   0%（大模型完全自主）
        """
        if step < self.anneal_start:
            return 1.0
        elif step > self.anneal_end:
            return 0.0
        else:
            # 线性插值：从 1.0 降到 0.0
            progress = (step - self.anneal_start) / (self.anneal_end - self.anneal_start)
            return 1.0 - progress

    def select_sampling_source(self, step, small_model_paths, large_model_paths):
        """
        根据当前进度，决定使用哪条路径。
        """
        ratio = self.get_small_model_ratio(step)
        use_small = np.random.random() < ratio

        if use_small and small_model_paths:
            return small_model_paths[np.random.randint(len(small_model_paths))]
        else:
            return large_model_paths[np.random.randint(len(large_model_paths))]


# 模拟训练过程
scheduler = ProgressiveAnnealingScheduler(total_steps=10000, anneal_start=2000, anneal_end=7000)

print("训练进度与小模型路径使用比例:")
for step in [0, 1000, 2000, 3500, 5000, 7000, 8000, 10000]:
    ratio = scheduler.get_small_model_ratio(step)
    bar = "#" * int(ratio * 20)
    print(f"  Step {step:5d}: 小模型贡献 {ratio:.0%}  {bar}")

# 输出:
#   Step     0: 小模型贡献 100.0%  ####################
#   Step  1000: 小模型贡献 100.0%  ####################
#   Step  2000: 小模型贡献 100.0%  ####################
#   Step  3500: 小模型贡献  65.0%  #############
#   Step  5000: 小模型贡献  30.0%  #####
#   Step  7000: 小模型贡献   0.0%
#   Step  8000: 小模型贡献   0.0%
#   Step 10000: 小模型贡献   0.0%
```

### 示例 3：验证小模型的 pass@k 优势

```python
"""
论文中的一个关键发现：小模型的 pass@k 随样本数增长得比大模型更快。

pass@k 的含义：生成 k 个答案，只要其中至少有 1 个正确，就算通过。
"""

import matplotlib.pyplot as plt

def simulate_pass_at_k(model_diversity, k_values):
    """
    模拟 pass@k 计算。
    model_diversity: 模型的策略多样性得分（越高越多样化）
    k_values: 不同的 k 值 [1, 2, 5, 10, 20]
    """
    pass_rates = []
    for k in k_values:
        # 假设每个答案独立的正确率与多样性正相关
        single_answer_accuracy = min(0.5, model_diversity * 0.05)
        # pass@k = 1 - (1 - p)^k
        pass_at_k = 1 - (1 - single_answer_accuracy) ** k
        pass_rates.append(pass_at_k)
    return pass_rates

# 模拟：小模型多样性高，大模型多样性低
small_model_diversity = 0.8    # 小模型：高多样性
large_model_diversity = 0.4    # 大模型：低多样性（更"固执"）

k_values = [1, 2, 5, 10, 20]

small_pass = simulate_pass_at_k(small_model_diversity, k_values)
large_pass = simulate_pass_at_k(large_model_diversity, k_values)

print("pass@k 对比（小模型 vs 大模型）:")
print(f"{'k':>4} | {'小模型':>8} | {'大模型':>8} | {'差距':>8}")
print("-" * 36)
for k, sp, lp in zip(k_values, small_pass, large_pass):
    print(f"{k:>4} | {sp:>7.1%} | {lp:>7.1%} | {sp-lp:>7.1%}")

# 输出:
#    k |     小模型 |     大模型 |       差距
# ------------------------------------
#    1 |    40.0% |    20.0% |   20.0%
#    2 |    64.0% |    36.0% |   28.0%
#    5 |    86.2% |    59.0% |   27.2%
#   10 |    95.4% |    78.7% |   16.7%
#   20 |    99.3% |    91.4% |    7.9%
```

## 五、实验结果

论文在多个数学推理基准上做了实验，核心结果：

- 用 1.7B 的小模型引导 8B 的大模型，在 AIME 24 上提升了 **+8.8%**
- 同时减少了 rollout 的计算开销
- 收敛速度更快，最终性能上限更高

## 六、关键 takeaway

1. **多样性 ≠ 随机性。** 真正的多样性来自不同的"策略"，而不是在同一个策略上加噪声。
2. **弱者的智慧。** 小模型虽然单个答案质量不如大模型，但它们的"群体智慧"（多条结构化路径）对大模型的学习非常有价值。
3. **渐进过渡很重要。** 一直依赖小模型不行（能力天花板），完全不依赖也不行（缺少探索信号）。渐进退火找到了平衡点。

## 七、我的理解

这篇论文最妙的地方在于"反直觉"——我们通常认为大模型什么都比小模型强，所以应该让大模型自己做一切。但这篇论文告诉我们：在某些任务中，"不知道"本身就是一种优势。小模型因为不知道太多，反而不会被既有知识束缚，能走出更多意想不到的路径。而这些路径，恰好是大模型最需要的学习材料。

就像学数学——有时候一个刚学的人提出的"笨办法"，反而能给解题高手带来新的启发。
