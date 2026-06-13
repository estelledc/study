---
title: Verifier-Free RL for Reasoning via Self-Consistency Reward
来源: https://arxiv.org/abs/2605.30874
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Verifier-Free RL for Reasoning via Self-Consistency Reward

## 日常类比：没有标准答案的考试

想象一个学生做数学题。传统方法需要一个"老师"（Verifier/验证器）来批改每道题的对错——对就加分，错就扣分。但这有个问题：有些题目没有标准答案，或者老师太贵了请不起。

Self-Consistency Reward 的做法是：**让同一个学生做 8 遍同一道题，如果大部分答案都一样，那就认为这个答案很可能是对的**。

- 8 个人做同一道题，6 个人答"42"，2 个人答"40" → "42" 就是多数票答案
- 模型自己生成多个答案，多数一致就给它正奖励，不一致就降低奖励

这就像一群学生互相批改作业——没有老师，靠"共识"来判断对错。

## 背景：为什么需要这个方法？

大语言模型（LLM）在做数学、代码推理时，常用的训练方法是 **RLVR（Reinforcement Learning with Verifiable Rewards）**。流程是这样的：

```
问题 → 模型生成答案 → 验证器判断对错 → 给奖励 → 更新模型
```

问题在于：

1. **验证器很难构建**——不是所有题目都有可执行的验证逻辑（比如开放推理）
2. **验证器有偏差**——它可能教模型钻空子（reward hacking），模型学会骗过验证器但不真正变聪明
3. **成本高昂**——运行验证器 + 训练验证器本身就很贵

Self-Consistency Reward 的思路是：**干脆不用验证器，让模型自己"投票"来决定奖励信号**。

## 核心概念

### 1. Self-Consistency（自一致性）

这是由 Wang 等人（2022）在论文 ["Self-Consistency Improves Chain of Thought Reasoning in Language Models"](https://arxiv.org/abs/2203.11171) 中提出的概念。

传统方法：模型对一个问题的答案只采样 1 次。

Self-Consistency 方法：模型对一个问题的答案采样 N 次（比如 N=8、16、32），然后取多数投票（majority vote）作为最终答案。

```python
import math
from collections import Counter

def majority_vote(generated_answers: list[str]) -> str:
    """从多次采样中取多数票作为最终答案"""
    vote_counts = Counter(generated_answers)
    # 返回出现次数最多的答案
    most_common_answer, count = vote_counts.most_common(1)[0]
    return most_common_answer

# 示例：同一个数学题生成 8 个答案
answers = [
    "42", "42", "40", "42",  # 多数是 42
    "42", "38", "42", "40"
]
print(majority_vote(answers))  # 输出: 42
```

### 2. Self-Consistency Reward（自一致性奖励）

把 Self-Consistency 从"推理策略"变成"奖励函数"：

传统 RL 的奖励函数：`R = 1`（答案正确），`R = 0`（答案错误）——需要外部验证器。

Self-Consistency Reward：`R = 多数答案的比例`——不需要外部验证器。

```python
def self_consistency_reward(generated_answers: list[str]) -> float:
    """
    用自一致性计算奖励分数（0.0 ~ 1.0）
    不需要任何外部验证器或标准答案
    """
    if not generated_answers:
        return 0.0

    vote_counts = Counter(generated_answers)
    max_count = vote_counts.most_common(1)[0][1]
    total = len(generated_answers)

    # 奖励 = 多数派的比例
    # 如果 8 个答案中有 6 个相同，奖励 = 6/8 = 0.75
    reward = max_count / total
    return reward

# 示例对比
answers_correct = ["42", "42", "42", "42", "40", "42", "42", "42"]  # 6/8 一致
answers_wrong = ["42", "38", "40", "44", "42", "36", "40", "38"]     # 没有多数

print(f"强一致答案的奖励: {self_consistency_reward(answers_correct):.2f}")  # 0.75
print(f"弱一致答案的奖励: {self_consistency_reward(answers_wrong):.2f}")     # 0.25
```

### 3. 训练流程：不用 PPO，用 Group Relative Policy Optimization（GRPO）

大多数现代 LLM 推理训练使用 **GRPO**（而非传统的 PPO），因为它不需要训练一个独立的 Critic 模型，节省了大量显存。

GRPO 的关键思想：**一个 prompt 生成 N 个答案，用这些答案之间的相对表现来估计优势值**，而不是用独立的 Critic 模型。

```python
"""
简化版 GRPO + Self-Consistency Reward 的训练循环
"""
import torch
import torch.nn.functional as F

class GRPOWithSCR:
    def __init__(self, model, config):
        self.model = model
        self.num_choices = config.get('num_choices', 8)
        self.epsilon = config.get('epsilon', 0.2)

    def compute_reward(self, group_outputs: list[str]) -> torch.Tensor:
        """用自一致性计算一组答案的奖励"""
        rewards = torch.zeros(len(group_outputs))
        from collections import Counter
        vote_counts = Counter(group_outputs)
        majority_count = vote_counts.most_common(1)[0][1]
        majority_ratio = majority_count / len(group_outputs)

        for i, output in enumerate(group_outputs):
            if output == vote_counts.most_common(1)[0][0]:
                # 多数派答案：获得正奖励
                rewards[i] = 1.0
            else:
                # 少数派答案：获得负奖励（鼓励向多数靠拢）
                rewards[i] = -0.5

        # 加入一致性 bonus（所有答案越一致，bonus 越大）
        consistency_bonus = majority_ratio
        rewards = rewards + consistency_bonus
        return rewards

    def compute_advantage(self, rewards: torch.Tensor) -> torch.Tensor:
        """GRPO 的优势估计：用组内均值和标准差归一化"""
        if len(rewards) < 2:
            return torch.zeros_like(rewards)
        mean = rewards.mean()
        std = rewards.std(unbiased=False) + 1e-8
        advantage = (rewards - mean) / std
        return advantage

    def train_step(self, prompt: str, num_choices: int = 8) -> dict:
        """单个训练步骤"""
        # 1. 从 prompt 生成 num_choices 个答案
        responses = self.model.generate(
            prompt,
            num_return_sequences=num_choices,
            do_sample=True,
            temperature=0.7,
        )

        # 2. 计算每个答案的自一致性奖励
        rewards = self.compute_reward(responses)

        # 3. GRPO：用奖励计算优势值
        advantage = self.compute_advantage(rewards)

        # 4. 计算 KL 惩罚（防止模型偏离初始模型太远）
        # 这一步用原始模型的输出做参照

        # 5. 计算 GRPO 目标函数并反向传播
        # policy_ratio = new_policy_prob / old_policy_prob
        # loss = -mean(policy_ratio * advantage) - beta * KL

        return {
            'rewards': rewards.tolist(),
            'advantages': advantage.tolist(),
            'consistency': float(rewards.max() - rewards.min()),
        }
```

### 4. 为什么这个方法有效？（直觉理解）

从第一性原理推导：

- **数学题的答案空间很小**——问"2+2 等于几"，模型可能答"3"、"4"、"5"、"4"、"4"、"4"、"42"、"4"
- 当模型变聪明时，它产生正确答案的概率提高 → 多数票自然偏向正确答案
- 当模型产生"看起来合理但错误"的答案时，由于推理路径不同，错误答案也各不相同 → 它们很难"串通"形成虚假的多数
- 所以 **多数票的一致性是一个很好的隐式正确性信号**

```python
"""
模拟：模型训练前后，自一致性奖励的变化
"""
import random

def simulate_model_accuracy(base_accuracy: float, num_samples: int = 8) -> float:
    """模拟模型一次采样，返回正确答案的概率"""
    return 1.0 if random.random() < base_accuracy else 0.0

def simulate_self_consistency_reward(base_accuracy: float, num_samples: int = 8, runs: int = 1000) -> float:
    """模拟多次推理，计算自一致性奖励的平均值"""
    total_reward = 0
    for _ in range(runs):
        answers = []
        for _ in range(num_samples):
            answer = 1 if random.random() < base_accuracy else random.randint(0, 9)
            answers.append(answer)
        from collections import Counter
        vote_counts = Counter(answers)
        max_count = vote_counts.most_common(1)[0][1]
        total_reward += max_count / num_samples
    return total_reward / runs

# 模型训练前（准确率 40%）
before_reward = simulate_self_consistency_reward(0.40)
# 模型训练后（准确率 70%）
after_reward = simulate_self_consistency_reward(0.70)

print(f"训练前自一致性奖励: {before_reward:.3f}")  # ~0.53
print(f"训练后自一致性奖励: {after_reward:.3f}")    # ~0.84
print(f"奖励提升: {((after_reward - before_reward) / before_reward * 100):.1f}%")
```

## 优势与挑战

### 优势

| 方面 | 传统方法（需要验证器） | Self-Consistency Reward |
|------|----------------------|------------------------|
| 是否需要验证器 | 是 | 否 |
| 适用的题目类型 | 只有可验证的题目 | 所有题目 |
| 训练成本 | 验证器 + 模型 | 只需模型本身 |
| Reward hacking | 容易发生 | 很难发生（多数投票很难作弊） |

### 挑战

1. **计算开销大**——需要采样多个答案（通常 8-32 个），推理成本是单次的 8-32 倍
2. **对简单题目不够敏感**——当模型已经很强时，所有采样答案都相同，奖励梯度消失
3. **需要足够的多样性**——如果 temperature 太低，所有采样都一样，没有"投票"可言

## 相关论文

- ["Self-Consistency Improves Chain of Thought Reasoning in Language Models" (Wang et al., 2022)](https://arxiv.org/abs/2203.11171) — 首次提出 Self-Consistency 概念
- ["GRPO: Group Relative Policy Optimization" (Shao et al., 2024)](https://arxiv.org/abs/2402.03300) — 无 Critic 的 RL 训练方法
- ["DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models" (2024)](https://arxiv.org/abs/2402.03300) — 大规模使用 RL 训练数学推理的典型案例
- ["Scalable Verifier-Free RL" 系列研究] — 近期探索不依赖外部验证器的 RL 训练方向

## 关键 takeaway

自一致性奖励的核心洞察很简单：**当一群"学生"对同一道题给出相同答案时，这个答案大概率是正确的**。不需要老师，不需要标准答案，模型就能通过"自我共识"获得训练信号来提升自己。

这就像是"三个臭皮匠，顶个诸葛亮"——只不过这里臭皮匠和诸葛亮是同一个模型的不同采样版本。
