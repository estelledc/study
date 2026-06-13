---
title: Direct Preference Optimization: Your LM is Secretly a Reward Model
来源: https://arxiv.org/abs/2305.18290
日期: 2026-06-13
分类: 机器学习
子分类: ml-deep
provenance: pipeline-v3
---

# Direct Preference Optimization (DPO)

## 什么是 DPO？

DPO 是 2023 年 5 月发表的一篇论文，全称是 "Direct Preference Optimization"。

它的核心问题只有一个：训练大语言模型时，让人更喜欢模型的回答，到底要多久、要多少步骤？

## 日常类比：学做菜

想象你在学做菜：

**传统 RLHF 流程（三步走）：**
1. 你做了 10 道菜
2. 请厨师长逐一品尝，告诉他哪道更好（人类偏好标注）
3. 厨师长自己学会打分，然后用他的打分来训练你

这个流程有三个独立的模型在跑：原始语言模型、人类偏好模型（奖励模型）、以及最终微调后的模型。

**DPO 的做法（一步到位）：**
你做了 10 道菜，厨师长告诉你哪道更好，你直接根据"哪道更好"这个信息来改进自己，不需要厨师长先学会打分。

简单说：DPO 把 RLHF 的三步合成一步，用一个更简单的目标函数直接训练语言模型。

## 为什么要做 DPO？

### 传统 RLHF 的痛点

传统方法是 PPO + 奖励模型（Reward Model），步骤复杂：

1. 预训练语言模型（SFT 阶段）
2. 训练奖励模型（RM）：给模型成对的回答，让 RM 学会打分
3. 用 PPO（近端策略优化）+ 奖励模型来微调语言模型

这三个阶段要分别训练三个模型，计算成本高，调试困难，实现复杂。

### DPO 的洞察

论文发现了一个数学上的等价性：**优化偏好和训练奖励模型本质上是一回事**。

如果你已经有一个奖励模型，那它隐式定义了一个"最优语言模型"。反过来，如果你直接优化语言模型让它更喜欢被选择的回答，你其实"隐式训练"了一个奖励模型。

结论：不需要显式训练奖励模型再用 PPO，直接优化语言模型就够了。

## 核心概念

### 1. 偏好数据

DPO 的输入非常简单，就是一个偏好的三元组 (x, y_w, y_l)：

- `x`：用户的输入（prompt）
- `y_w`：人类更喜欢的那个回答（win）
- `y_l`：人类不太喜欢的回答（lose）

例如：

```
x: "请解释量子计算"
y_w: "量子计算利用量子比特...（详细准确的解释）"
y_l: "量子计算就是很快...（模糊不准确的回答）"
```

### 2. 参考模型（Reference Model）

DPO 训练时保持一个"参考模型"不动，通常是 SFT 阶段结束时的模型。

作用：防止微调后的模型偏离太远，避免"模型崩溃"（答非所问或只讨好偏好数据）。

### 3. DPO 损失函数

DPO 的损失函数比 PPO 简单得多。对于每个偏好三元组，损失是：

```
L_DPO = -log(sigmoid(β * log(π_θ(y_w|x)/π_ref(y_w|x)) - β * log(π_θ(y_l|x)/π_ref(y_l|x))))
```

翻译成人话：

- π_θ(y|x)：当前模型生成 y 的概率
- π_ref(y|x)：参考模型生成 y 的概率
- β：一个超参数，控制偏离参考模型的力度

核心思想：如果模型对"喜欢的回答"概率增加、对"不喜欢的回答"概率减少，损失就小。

## 代码示例

### 示例 1：构建 DPO 数据集

```python
from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class PreferenceExample:
    """一个偏好样本"""
    prompt: str       # 用户输入
    chosen: str       # 人类喜欢的回答
    rejected: str     # 人类不喜欢的回答

# 构建一个简单的偏好数据集
dataset: List[PreferenceExample] = [
    PreferenceExample(
        prompt="Python 中如何实现二分查找？",
        chosen="""def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1""",
        rejected="""二分查找是一种快速查找的方法，时间复杂度是 O(log n)。"""
    ),
    PreferenceExample(
        prompt="什么是闭包？",
        chosen="""闭包是一个函数+它引用的外部环境变量。

在 Python 中：
def outer(x):
    def inner(y):
        return x + y  # inner 捕获了 outer 的 x
    return inner

closure = outer(10)
print(closure(5))  # 输出 15""",
        rejected="""闭包就是函数式编程里的一个概念。"""
    ),
]
```

### 示例 2：简易 DPO 训练循环

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class DPOTrainer:
    """DPO 训练器（简化版，仅展示核心逻辑）"""

    def __init__(self, policy_model, reference_model, beta=0.1):
        self.policy = policy_model      # 可训练的模型
        self.ref = reference_model      # 参考模型（冻结）
        self.beta = beta                # 偏离控制参数

    def compute_log_probs(self, model, input_ids, attention_mask):
        """获取模型对每个 token 的对数概率"""
        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        logits = outputs.logits  # (batch, seq_len, vocab_size)
        log_probs = F.log_softmax(logits, dim=-1)  # 转换为对数概率
        return log_probs

    def dpo_loss(self, prompt_input_ids, chosen_input_ids, chosen_attention_mask,
                 rejected_input_ids, rejected_attention_mask):
        """
        计算 DPO 损失

        核心公式：
        L = -log(sigmoid(r_chosen - r_rejected))

        其中 r = β * (log π_θ(y|x) - log π_ref(y|x))
              即模型概率与参考模型概率之差的 β 倍
        """
        # 1. 获取策略模型的对数概率
        chosen_log_probs = self.compute_log_probs(
            self.policy, chosen_input_ids, chosen_attention_mask
        )
        rejected_log_probs = self.compute_log_probs(
            self.policy, rejected_input_ids, rejected_attention_mask
        )

        # 2. 获取参考模型的对数概率（不计算梯度）
        with torch.no_grad():
            ref_chosen_log_probs = self.compute_log_probs(
                self.ref, chosen_input_ids, chosen_attention_mask
            )
            ref_rejected_log_probs = self.compute_log_probs(
                self.ref, rejected_input_ids, rejected_attention_mask
            )

        # 3. 计算"奖励"差值
        chosen_reward = self.beta * (chosen_log_probs - ref_chosen_log_probs)
        rejected_reward = self.beta * (rejected_log_probs - ref_rejected_log_probs)

        # 4. 计算损失
        # 如果 chosen_reward > rejected_reward，损失就小
        log_ratio = chosen_reward - rejected_reward
        loss = -F.logsigmoid(log_ratio).mean()

        return loss

    def train_step(self, batch):
        """执行一步训练"""
        loss = self.dpo_loss(
            batch.prompt_input_ids,
            batch.chosen_input_ids,
            batch.chosen_attention_mask,
            batch.rejected_input_ids,
            batch.rejected_attention_mask
        )
        loss.backward()
        return loss.item()
```

### 示例 3：与 PPO 的对比

```
对比维度          | RLHF (PPO)              | DPO
-----------------|------------------------|------------------
训练阶段          | 3 个阶段（SFT → RM → PPO）| 1 个阶段（直接 DPO）
模型数量          | 4 个（策略+奖励+参考+ critic）| 2 个（策略+参考）
优化算法          | PPO（复杂）              | 标准反向传播
内存占用          | 很高（需要 4 个模型）     | 较低（需要 2 个模型）
调试难度          | 极高                    | 低
可复现性          | 差（PPO 随机性大）       | 好（标准训练）
```

## 关键优势

1. **实现简单**：不需要 PPO 的 critic 网络、优势函数估计等复杂组件
2. **稳定**：标准交叉熵损失，训练曲线平滑
3. **高效**：内存需求减少约一半
4. **可复现**：去掉 PPO 的随机性，不同实验之间可比性更强

## 局限与注意事项

- DPO 假设偏好数据质量好，噪声较大会影响效果
- 对参考模型的质量敏感
- 在某些复杂任务上，RLHF 仍可能略胜一筹（因为探索能力更强）

## 总结

DPO 的核心贡献是数学上的优雅：它证明了"直接优化语言模型"和"用奖励模型做 RL"在理论上等价。这使得从偏好数据训练对齐模型的流程从 3 步简化为 1 步，成为后续很多对齐方法的基础。
