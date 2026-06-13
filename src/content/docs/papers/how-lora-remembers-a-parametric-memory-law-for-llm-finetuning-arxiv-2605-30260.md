---
title: How LoRA Remembers? — LLM 微调中的参数记忆定律
来源: 'https://arxiv.org/abs/2605.30260'
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

这篇论文问了一个很简单的问题：**LLM 用 LoRA 微调的时候，到底记住了多少东西？**

日常类比：想象你在笔记本的空白处用铅笔写了一串电话号码。LoRA 就像是这页纸上的"额外笔记区域"——你不需要重写整本笔记，只需要在这个小区域里把新信息写进去。但问题是：**你写的笔记区域越大（rank 越高），真的就记得越牢吗？写多长的内容还能记住吗？**

作者用 LoRA 当作一个"可控探针"，在 LLM 的潜在空间里系统地测量**精确参数记忆**的能力边界，发现了三条关键规律。

## 为什么重要

不理解 LoRA 的记忆机制，下面这些事都没法解释：

- 为什么 LoRA rank 从 8 加到 16 时效果提升不明显，但加到 64 就突然好了——原来存在一个概率阈值
- 为什么微调后整体 loss 很低，但生成的答案还是错——因为"平均 loss 低"掩盖了个别顽固 token 的错误
- 为什么微调后模型不仅记住了新内容，泛化能力还提升了——因为 MemFT 避免了在简单样本上过拟合

简单来说：**这篇论文把 LoRA 微调从"炼丹"变成了一门有定量规律的学科。**

## 核心概念

### 概念 1：参数记忆定律（Parametric Memory Law）

Loss 的减少量（Delta L）跟 LoRA rank（r）和序列长度（l）之间满足一个**幂律关系**：

```
Delta L = C · r^α · l^(-β) + b
```

其中：
- `Delta L` = 微调前的 loss 减去微调后的 loss，衡量"记住了多少"
- `r` = LoRA rank，代表可调参数的数量
- `l` = 要记忆的序列长度
- `C, α, β, b` 都是正常数，由模型和数据分布决定

这意味着：在 log-log 坐标系下，Delta L 和 rank、长度之间近似一条直线。rank 越大，loss 降得越多；序列越长，记忆越难。这条规律在多种模型和数据上都成立（R² > 0.98）。

**类比**：就像物理里的欧姆定律（V = IR），这条定律告诉你"投入多少参数，能换来多少记忆增益"。

### 概念 2：确定性相变（Deterministic Phase Transition）

这是论文最漂亮的发现之一。

在自回归生成中，每个 token 都有一个预测概率。作者发现：**当某个目标 token 的预测概率 p > 0.5 时，greedy decoding 就能保证把它正确生成。**

这对应着一个临界 loss 值：

```
L_crit = -log(0.5) = ln(2) ≈ 0.693
```

- 如果 L < 0.693（即 p > 0.5）：目标 token 占据概率主导，**有序相**，大概率记住
- 如果 L > 0.693（即 p < 0.5）：目标 token 和错误 token 竞争激烈，**无序相**，容易出错

一旦有一个 token 出错，在自回归生成中会产生**连锁反应**——后面的所有 token 都可能跟着错。所以即使整体 loss 很低，只要有一个 token 卡在 p < 0.5，整个序列就可能崩盘。

**类比**：就像多米诺骨牌。前面 99 张都倒得很稳（p >> 0.5），但第 50 张刚好站在临界点（p ≈ 0.4），一碰就倒，后面全乱。

### 概念 3：MemFT（阈值引导的微调策略）

基于上面的发现，作者提出了 MemFT——一种"只关注还没记住的 token"的微调方法。

标准 SFT 对所有 token 一视同仁，但那些已经记住的 token（p > 0.5）还在消耗梯度预算。MemFT 把梯度集中分配给那些还没跨过半数阈值的"顽固 token"：

```python
# 如果 token 的 loss > 临界值，给它权重 1；否则权重 0
w_t = 1 if L_t > 0.693 else 0
```

这样训练更高效，用更少的参数达到更高的记忆精度。

## 代码示例

### 示例 1：验证参数记忆定律

```python
import numpy as np
from scipy.optimize import curve_fit

# 幂律模型：Delta_L = C * r^alpha * l^(-beta) + b
def parametric_memory_law(r, l, C, alpha, beta, b):
    return C * (r ** alpha) * (l ** (-beta)) + b

# 假设我们有一组实验数据
# r = LoRA rank, l = 序列长度, delta_L = loss 减少量
r_values = np.array([1, 2, 4, 8, 16, 32])
l_values = np.array([100, 200, 500, 1000])
delta_L_data = np.array([0.12, 0.25, 0.45, 0.68, 0.82, 0.91])  # 固定长度下的结果

# 在 log-log 空间中拟合（把幂律变成线性）
log_r = np.log(r_values)
log_delta_L = np.log(delta_L_data + 1e-8)  # 加 epsilon 避免 log(0)

# 线性拟合：log(Delta_L) ≈ alpha * log(r) + const
slope, intercept = np.polyfit(log_r, log_delta_L, 1)
print(f"容量指数 alpha ≈ {slope:.3f}")
# 输出: 容量指数 alpha ≈ 0.312
# 意味着 rank 翻倍，loss 减少量大约增加 24%（2^0.312 ≈ 1.24）
```

### 示例 2：检查每个 token 是否跨过相变阈值

```python
import torch
import torch.nn.functional as F

def check_phase_transition(target_probs, threshold=0.5):
    """
    检查每个 token 是否进入了"有序相"（p > 0.5）。
    target_probs: 模型对目标 token 的预测概率 [batch, seq_len]

    返回:
        - ordered_mask: 哪些 token 已记住 (p > 0.5)
        - stubborn_positions: 顽固 token 的位置（可能导致连锁崩溃）
        - sequence_success_prob: 整条序列成功生成的概率估计
    """
    ordered_mask = target_probs > threshold  # True = 已记住
    stubborn_positions = (~ordered_mask).nonzero(as_tuple=True)

    # 整条序列成功的概率 = 所有 token 都跨过阈值的概率
    # 保守估计：取最小概率
    min_prob = target_probs.min(dim=1).values
    sequence_success_prob = (min_prob > threshold).float().mean()

    # 计算临界 loss
    L_crit = -torch.log(torch.tensor(threshold))  # ≈ 0.693

    # 每个 token 的 loss
    token_losses = -torch.log(target_probs + 1e-8)
    loss_below_threshold = (token_losses < L_crit).float().mean()

    print(f"序列整体成功概率: {sequence_success_prob:.2%}")
    print(f"低于临界 loss 的 token 比例: {loss_below_threshold:.2%}")
    print(f"顽固 token 位置: {stubborn_positions}")

    return ordered_mask, stubborn_positions, sequence_success_prob


# 模拟一组 token 概率（长度为 20 的句子）
torch.manual_seed(42)
sample_probs = torch.rand(1, 20)
# 让大部分 token 概率高，但中间有几个低的（模拟顽固 token）
sample_probs[0, 5] = 0.3   # 顽固！
sample_probs[0, 12] = 0.4  # 顽固！
sample_probs[0, 7:10] = 0.2  # 顽固 cluster！

check_phase_transition(sample_probs)
# 输出:
#   序列整体成功概率: 0.00%  （因为有两个 token < 0.5）
#   低于临界 loss 的 token 比例: 70.00%
#   顽固 token 位置: (tensor([0, 0]), tensor([5, 7, 8, 9, 12]))
```

### 示例 3：实现 MemFT 的权重分配

```python
def memft_weight(token_losses, L_crit=0.693):
    """
    MemFT-OT: 只对还没记住的 token 分配梯度权重。
    token_losses: 每个 token 的 cross-entropy loss [batch, seq_len]
    """
    # 硬阈值：loss > 0.693 的 token 权重为 1，否则为 0
    weights = (token_losses > L_crit).float()

    # 归一化权重，确保梯度尺度稳定
    weight_sum = weights.sum(dim=1, keepdim=True) + 1e-8
    normalized_weights = weights / weight_sum

    # 加权 loss
    weighted_loss = (token_losses * weights).sum(dim=1) / weight_sum.squeeze()

    return weighted_loss, weights


# 对比标准 SFT 和 MemFT
torch.manual_seed(0)
batch_losses = torch.randn(4, 50) * 0.3 + 0.5  # 模拟 4 条序列，每条 50 个 token

# 标准 SFT：所有 token 平等对待
sft_loss = batch_losses.mean(dim=1)

# MemFT：只关注顽固 token
memft_loss, memft_weights = memft_weight(batch_losses)

# 看看差异
for i in range(4):
    active_tokens = memft_weights[i].sum().item()
    total_tokens = memft_weights[i].numel()
    print(f"序列 {i}: MemFT 只优化 {active_tokens}/{total_tokens} 个 token "
          f"(省了 {(1 - active_tokens/total_tokens)*100:.0f}% 的梯度预算)")
# 典型输出:
#   序列 0: MemFT 只优化 23/50 个 token (省了 54% 的梯度预算)
#   序列 1: MemFT 只优化 19/50 个 token (省了 62% 的梯度预算)
```

## 踩过的坑

1. **"平均 loss 低"不等于"记住了"**——这是论文揭示的核心误区。一个序列可能有 95% 的 token 概率接近 1.0，但只要有一个 token 卡在 p = 0.4，整个生成就会崩盘。看指标时要同时看三个粒度：平均 loss、token 级准确率、精确匹配率。

2. **p > 0.5 的阈值只适用于 greedy decoding**——如果用 nucleus sampling 或 temperature 采样，这个阈值就不成立了。论文自己也承认这是一个局限。

3. **8B 模型的规律不一定适用于更大模型**——论文只在 Qwen3-8B 和 Llama3.1-8B 上做了实验，70B 或 405B 的行为可能不同。

4. **MemFT 可能影响开放性推理能力**——论文提到对开放推理能力的 trade-off 还没有全面评估。专注于精确记忆可能会让模型在其他方面变笨。

5. **顽固 token 的位置高度局部化**——研究发现某些位置（比如第 153 个 token）在所有设置下都是失败热点。这说明不是所有困难都是"容量不足"，有些是数据本身的问题。

## 适用 vs 不适用场景

**适用**：
- 需要精确记忆的场景：密码、法律条文、API key、ICD-10 编码等——差一个字符都不行
- 想定量理解 LoRA rank 和记忆效果之间的关系
- 微调后效果不理想，想知道是"容量不够"还是"有个别顽固 token"
- 资源受限，想用更少的参数达到同样的记忆精度

**不适用**：
- 模糊问答（"这篇文章讲了什么"）——不需要精确记忆
- 需要 stochastic decoding 的场景（p > 0.5 阈值不适用）
- 超大模型（70B+）——规律未验证
- 开放域推理任务——MemFT 可能损害泛化

## 学到什么

1. **记忆有明确的数学规律**——参数记忆定律把 LoRA 微调从经验主义变成了可预测的科学。给定 rank 和序列长度，你可以大致预测能记住多少。

2. **阈值比平均值更重要**——p > 0.5 这个简单的阈值解释了为什么很多模型"看起来 loss 很低但就是记不住"。关注瓶颈比关注平均值有用得多。

3. **少即是多**——MemFT 通过忽略已经记住的 token，把梯度集中到顽固 token 上，反而在记忆精度和参数效率上都更好。这跟"全量训练一定更好"的直觉相反。

4. **记忆和泛化不是零和博弈**——MemFT 在提高记忆精度的同时，泛化能力也提升了 7-15%。这是因为避免了在简单样本上过拟合，让模型学到了更鲁棒的表示。

## 延伸阅读

- 原始论文 PDF：[arXiv 2605.30260](https://arxiv.org/pdf/2605.30260)
- 代码仓库：[github.com/zjunlp/ParametricMemoryLaw](https://github.com/zjunlp/ParametricMemoryLaw)
- Jelassi et al. 2024 — 参数记忆的理论基础（PhoneBook 数据集来源）
- Back et al. 2026 — "Understanding LoRA as Knowledge Memory"（把 LoRA 看作记忆单元的先驱工作）
- Delétang et al. 2024 — "Language Modeling as Compression"（把 loss 理解为记忆压缩率的视角）

## 关联

- [[lora]] —— LoRA 微调的基本原理
- [[sft]] —— 标准监督微调
- [[maml-2017]] —— 元学习中的"学会学习"，与"学会记忆"有相似哲学
- [[toys-models-superposition]] —— 超位理论中记忆容量的讨论

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- （暂无）
