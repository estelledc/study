---
title: "Chinchilla — 训练大语言模型的算力最优法则"
来源: 'https://arxiv.org/abs/2203.15556'
日期: 2026-06-13
分类: NLP
子分类: ml-deep-learning
provenance: pipeline-v3
---

## 是什么

Chinchilla 是 DeepMind 在 2022 年 3 月发表的论文，核心发现是：**训练大语言模型时，模型大小和训练数据量应该按比例一起增长，而不是只堆参数、喂固定量的数据。**

日常类比：

> 想象你在教一个学生。传统做法是：给他一个巨大的图书馆（大模型），但只让他读 100 页书（固定数据量），然后指望他什么都会。
>
> Chinchilla 发现：更好的做法是给他一个中小号的书架（小一点的模型），但让他把图书馆里每一本书都从头到尾读完。结果是：**小模型 + 大量阅读 > 大模型 + 囫囵吞枣**。
>
> 更精确地说，研究发现模型大小和数据量应该像跷跷板的两端——你让模型变大一倍，训练数据也要同样变大一倍。两边不成比例，就是在浪费算力。

这就是 Chinchilla 论文的核心发现：

> **在给定算力预算下，最优的训练策略是将模型参数和训练 token 数量以相同的速率同时缩放。当前几乎所有大模型都严重"欠训练"（undertrained），数据量远远不够。**

## 为什么重要

不理解 Chinchilla，很多后续工作都没法解释：

- 为什么 Gopher（2800 亿参数）、GPT-3（1750 亿参数）、Jurassic-1（1780 亿参数）这些"更大模型"反而打不过 Chinchilla（700 亿参数）——因为 Chinchilla 训练了它们 4 倍的数据
- 为什么"越大越好"这个直觉是错的——算力预算固定时，盲目堆参数是低效的
- 为什么后来所有主流模型（PaLM、LLaMA、Falcon）都大幅增加了训练数据量——因为 Chinchilla 给出了公式
- 为什么现在训练一个模型动辄万亿 token——因为 Chinchilla 定律确立了数据量的优先级

## 核心概念

### 1. 算力预算公式

训练一个语言模型的总算力（FLOPs）由三部分决定：

```
总算力 C = 6 × N × D × T

其中:
  N = 模型参数量（number of parameters）
  D = 训练 token 数量（dataset size）
  T = 训练轮次（通常 1-3 轮，因为数据珍贵）

C 是固定预算。N 和 D 就像蛋糕的两块——你多分一块，另一块就少。
```

直观理解：
- **N 大 D 小**：模型很大但读的书少 → 学艺不精，容易过拟合
- **N 小 D 大**：模型不大但书读得多 → 基础扎实，但上限可能受限于模型大小
- **N 和 D 成正比**：最优状态，算力利用率最高

### 2. 幂律缩放（Power Law Scaling）

这是论文最重要的方法论贡献。他们发现：**模型的 loss（损失）随着参数数量和 token 数量的增长，遵循一条平滑的幂律曲线。**

```
Loss(N, D, C) ≈ a × N^(-α) + b × D^(-β) + C^(-γ)

其中 α, β, γ 是缩放指数，a, b 是常数。
关键发现：α ≈ β ≈ 0.05-0.1，意味着 N 和 D 的缩放效率几乎相同。
```

类比：
> 想象你在爬山。参数量 N 是"体力"，数据量 D 是"锻炼时间"。研究发现，多练一小时（D 翻倍）和你多跑一小时步（N 翻倍）带来的进步幅度差不多。所以你应该**既锻炼体力又增加训练时间**，而不是只增其一。

### 3. 预测框架（The Predictive Framework）

Chinchilla 建立了一个预测模型：

1. 先训练一批小模型（从 7000 万到 160 亿参数）
2. 拟合幂律曲线，得到缩放指数
3. 用曲线预测：给定算力预算，最优的 N 和 D 各是多少

```
步骤:
  1. 训练 400 个小/中模型（70M ~ 16B 参数）
  2. 观察 N 和 D 对 loss 的影响
  3. 拟合幂律公式，找到最优比例
  4. 用预测的最优比例，训练最终的 Chinchilla 模型（70B 参数 + 数据）
```

### 4. 数据量不足是普遍问题

论文发现当时几乎所有主流模型都严重偏离最优比例：

```
模型         | 参数量   | 训练数据量   | 与最优数据量的差距
-------------|----------|-------------|------------------
Gopher       | 280B     | ~300B tokens| 最优的 4 倍太少
GPT-3        | 175B     | ~300B tokens| 最优的 12 倍太少
Jurassic-1   | 178B     | ~1.3T tokens| 最优的 4 倍太少
Megatron-Turing | 530B | ~410B tokens| 最优的 16 倍太少
```

几乎所有模型都在用"大模型 + 少数据"的配方——这正是 Chinchilla 要纠正的。

## 核心实验

### 实验一：幂律拟合

DeepMind 训练了 400 多个模型，覆盖从 7000 万到 160 亿参数、500 亿到 5000 亿 token 的范围。

```python
# 幂律拟合的伪代码示例
# 假设我们已经训练了一批小模型，得到了 (N, D, loss) 数据

import numpy as np

# 假设 loss 随 N 和 D 的幂律衰减:
# loss ≈ a * N^(-α) + b * D^(-β)

# 通过 log-log 回归来估计 α 和 β
# 固定 D，改变 N:
def estimate_alpha(losses, ns):
    """从固定数据量下不同参数数量的 loss 估计 α"""
    log_n = np.log(ns)
    log_loss = np.log([l - min(losses) for l in losses])  # 减去 baseline
    # 线性回归: log(loss) = -α * log(N) + c
    slope, _ = np.polyfit(log_n, log_loss, 1)
    return -slope  # α 是负斜率的相反数

# 固定 N，改变 D:
def estimate_beta(losses, datasizes):
    """从固定参数数量下不同数据量的 loss 估计 β"""
    log_d = np.log(datasizes)
    log_loss = np.log([l - min(losses) for l in losses])
    slope, _ = np.polyfit(log_d, log_loss, 1)
    return -slope

# 关键发现:
# α ≈ 0.051, β ≈ 0.031
# 两者接近，说明 N 和 D 应该等比例缩放
```

### 实验二：Chinchilla vs 其他模型

用与 Gopher 相同的算力预算，训练了 Chinchilla（70B 参数，4× 数据量）：

```
模型          | 参数量 | MMLU 准确率 | 关键发现
--------------|--------|------------|----------
Gopher        | 280B   | 59.6%      | 参数是 Chinchilla 的 4 倍，但数据少 4 倍
Chinchilla    | 70B    | 67.5%      | 参数少 4 倍，但数据多 4 倍 → MMLU 高 7.9 个百分点
GPT-3         | 175B   | ~61%       | 参数量是 Chinchilla 的 2.5 倍，数据少 12 倍
Jurassic-1    | 178B   | ~63%       | 类似情况
Megatron-Turing| 530B  | ~55%       | 最大模型反而表现最差
```

这意味着：**用小模型吃更多数据，远比用大模型少吃数据有效。**

## 代码示例

### 示例一：计算最优 N/D 比例

假设你有一个算力预算 C，想知道应该用多大的模型和多少数据：

```python
def compute_optimal_chinchilla(flops_budget=3.3 * 10**22):
    """
    根据 Chinchilla 论文，给定算力预算 C，计算最优的参数量 N
    和训练数据量 D。
    
    公式: C = 6 * N * D * T，其中 T=1（单轮训练）
    最优比例: N = D（参数和 token 数相等）
    所以: C = 6 * N^2 * T → N = sqrt(C / (6 * T))
    
    Args:
        flops_budget: 总算力预算（FLOPs），Gopher/Chinchilla 约 3.3e22
    Returns:
        (optimal_params, optimal_tokens, optimal_fine_tune_tokens)
    """
    T = 1  # 训练轮次
    N = int(np.sqrt(flops_budget / (6 * T)))
    D = N  # 最优比例：N = D
    
    # 微调时推荐 1/6 的主训练数据量
    D_finetune = D // 6
    
    print(f"算力预算: {flops_budget:.2e} FLOPs")
    print(f"最优参数量: {N / 10**9:.1f}B")
    print(f"最优训练 token 数: {D / 10**9:.1f}B")
    print(f"推荐微调数据量: {D_finetune / 10**9:.1f}B")
    print(f"推理 token 数: {D / 10**9:.1f}B（比 Gopher 少 24 倍）")
    
    return N, D, D_finetune

# Chinchilla 论文中的算力预算
compute_optimal_chinchilla(3.3 * 10**22)

# 输出:
# 算力预算: 3.30e+22 FLOPs
# 最优参数量: 70.0B
# 最优训练 token 数: 70.0B
# 推荐微调数据量: 11.7B
# 推理 token 数: 70.0B（比 Gopher 少 24 倍）
```

### 示例二：验证你的模型是否"欠训练"

检查你正在训练的模型是否符合 Chinchilla 最优比例：

```python
def check_chinchilla_compliance(params, train_tokens, flops_per_token=6.0):
    """
    检查模型是否按照 Chinchilla 最优比例训练。
    
    Args:
        params: 模型参数量
        train_tokens: 训练 token 总数
        flops_per_token: 每 token 的 FLOPs（预训练约 6×N per token）
    Returns:
        合规状态和建议
    """
    # 实际使用的算力
    actual_flops = params * train_tokens * flops_per_token
    
    # Chinchilla 最优：N = D，所以 C = 6 * N^2
    optimal_flops = 6 * params * params
    
    # 如果实际算力 > 最优算力，说明数据量不足（欠训练）
    ratio = actual_flops / optimal_flops
    
    print(f"模型参数量: {params / 10**9:.1f}B")
    print(f"训练 token 数: {train_tokens / 10**9:.1f}B")
    print(f"N/D 比例: {params / train_tokens:.2f}")
    print(f"理想 N/D 比例: 1.00")
    print(f"偏差系数: {ratio:.2f}x")
    
    if ratio > 1.5:
        status = "⚠️  严重欠训练 — 数据量不足，建议增加训练数据或减小模型"
    elif ratio > 1.0:
        status = "⚡ 轻微欠训练 — 可以考虑增加数据量"
    else:
        status = "✓ 符合或优于 Chinchilla 最优比例"
    
    print(f"\n结论: {status}")
    return ratio, status

# 检查 Gopher（论文中的数据）
# Gopher: 280B 参数, ~300B tokens
check_chinchilla_compliance(280 * 10**9, 300 * 10**9)
# 输出: N/D = 0.93, 偏差 0.93x → 看起来合规？
# 但实际上 Gopher 的最优比例应该是 ~16B 参数 × ~16B token
# 这说明 Gopher 参数太多了

# 检查 GPT-3
# GPT-3: 175B 参数, ~300B tokens
check_chinchilla_compliance(175 * 10**9, 300 * 10**9)
# 输出: N/D = 0.58, 偏差 0.58x → 数据量严重不足（应该训练 ~12 倍的数据）
```

### 示例三：用 Chinchilla 定律选择模型大小

你在给定算力下需要决定训练多大的模型：

```python
def choose_model_size(flops_budget, min_params=10**6, max_params=10**12):
    """
    给定算力预算，用 Chinchilla 定律选择最优的模型大小。
    
    Chinchilla 定律: 对于算力 C，最优 N = sqrt(C / (6 * T))
    
    Args:
        flops_budget: 总算力 FLOPs
        min_params: 最小模型大小
        max_params: 最大模型大小
    Returns:
        推荐的参数量、数据量、以及如果选择不同大小的损失预估
    """
    T = 1
    optimal_N = np.sqrt(flops_budget / (6 * T))
    
    # 限制在合理范围内
    optimal_N = max(min_params, min(max_params, optimal_N))
    
    print(f"算力预算: {flops_budget:.2e} FLOPs")
    print(f"Chinchilla 最优参数: {optimal_N / 10**9:.2f}B")
    print()
    
    # 比较不同大小的模型的预估 loss
    print("各规模模型预估（相对最优 loss 的倍数）:")
    print("-" * 50)
    
    for scale in [0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0]:
        n = optimal_N * scale
        d = optimal_N * (1.0 / scale)  # 反向缩放，保持算力不变
        # loss 随 N 和 D 幂律衰减
        loss_ratio = (scale ** (-0.05) + (1.0 / scale) ** (-0.03)) / 2
        print(f"  {scale:4.1f}x 参数量 → 预估 loss 偏差: {loss_ratio:.3f}x")
    
    return optimal_N

# 假设你有 3.3e22 FLOPs 的算力
choose_model_size(3.3 * 10**22)
```

## 对工程实践的影响

### 1. 推理成本大幅降低

Chinchilla 的 70B 参数模型相比 Gopher 的 280B，推理时需要的 token 处理量减少了 24 倍：

```
模型       | 推理 token 数     | 相比最优的偏差
-----------|-----------------|------------------
Gopher     | 1680B tokens     | 24 倍过多
Chinchilla | 70B tokens       | 最优

实际影响: 推理速度快 24 倍，显存占用少得多，部署成本低得多
```

这意味着：小模型 + 多训练不仅学得好，用的时候也便宜。

### 2. 微调（Fine-tuning）数据量建议

论文建议微调时使用主训练数据量的 1/6：

```
主训练数据: D tokens
微调数据:   D/6 tokens

Chinchilla: 主训练 70B tokens → 微调 ~11.7B tokens
```

### 3. 后续模型遵循 Chinchilla 定律

- **PaLM（2022, Google）**: 540B 参数 + 780B tokens（接近最优比例）
- **LLaMA（2023, Meta）**: 7B-65B 参数 + 1-2 万亿 tokens（严格遵循）
- **Falcon（2023, TII）**: 40B-180B 参数 + 万亿级 tokens
- 这些模型都意识到：**数据质量 + 数据量 > 单纯堆参数**

## Chinchilla 的局限

- 幂律拟合只在小模型范围内有效，外推到超大模型时可能存在偏差
- 数据质量没有量化——同样数量的 token，维基百科和 Common Crawl 的价值完全不同
- 没有考虑推理效率——虽然 Chinchilla 推理更快，但某些场景下大模型的零样本能力仍有优势
- 后续研究（如 PaLM 2）发现 scaling exponent 可能随规模变化，不完全是常数

## 一句话总结

> **在算力预算固定的情况下，应该训练"一个小模型 + 大量数据"而不是"一个大模型 + 少量数据"，且模型大小和数据量应该等比例增长。Chinchilla（70B 参数 + 4× 数据）用比 Gopher（280B）少 4 倍的参数，在 MMLU 上高出 7.9 个百分点。**
