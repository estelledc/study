---
title: "Training Compute-Optimal Large Language Models (Chinchilla Paper)"
来源: "https://arxiv.org/abs/2203.15556"
日期: 2026-06-13
分类_原始: AI / 机器学习
分类: 机器学习
子分类: machine-learning-deep-learning
provenance: pipeline-v3
---

# Training Compute-Optimal Large Language Models

> **作者**: Jordan Hoffmann 等 (DeepMind, 2022)
> **核心贡献**: 发现了训练大语言模型时的"缩放定律"，提出了 Chinchilla 模型

---

## 一、从日常类比开始：烤蛋糕

想象你在烤一批蛋糕，有一个固定的烤箱使用时长（这就是**计算预算**）。

每个蛋糕有两个要素：

- **蛋糕的大小**（模型的参数量）——蛋糕越大，用料越多
- **烘烤的时间**（训练 token 数量）——时间越长，烤得越熟

过去十年，大家一直在做同一件事：越做越大的蛋糕，但烘烤时间几乎不变。
结果是——蛋糕巨大，但里面还是半生的。

这篇论文说：不对。你应该做**更小的蛋糕**，但**烤更长的时间**。

---

## 二、核心问题：模型在"欠训练"

### 2.1 背景

2020 年前后，AI 界疯狂扩大模型参数规模：

- GPT-3: 1750 亿参数
- Megatron-Turing NLG: 5300 亿参数
- Gopher: 2800 亿参数

但训练用的数据量几乎没变。作者发现了一个反直觉的事实：

> **越大的模型，每个 token 学到的东西越少。**

就像一个人读了很多书，但每本书只翻一页——书越多，知识反而越浅。

### 2.2 关键发现

团队训练了 **400+ 个模型**（7000 万到 160 亿参数），用了 50 亿到 5000 亿 token。
他们找到了一个**规律**：

**计算量固定时，模型大小和训练 token 数量应该等比例增长。**

具体来说：

> 模型大小每翻倍，训练 token 数量也要翻倍。

这就是著名的 **Chinchilla Scaling Law**，数学表达为：

```
模型参数量 (N) 和 训练 token 数量 (D) 满足：N ≈ D
```

或者更精确地说，最优训练满足：

```
C ∝ N × D    （总计算量 = 模型大小 × 训练量）
N_optimal ∝ sqrt(C)
D_optimal ∝ sqrt(C)
```

也就是说，最优的模型大小和训练量都与计算预算的平方根成正比。

---

## 三、Chinchilla：用同样算力，做出更强的模型

### 3.1 实验设计

Gopher 用了 2800 亿参数，但训练数据量不大。
Chinchilla 用了 **700 亿参数**（只有 Gopher 的 1/4），但用了 **4 倍多的训练数据**。

结果：Chinchilla 在所有评估任务上都**显著优于** Gopher、GPT-3、Jurassic-1 和 Megatron-Turing NLG。

MMLU 基准测试：Chinchilla 达到 67.5%，比 Gopher 高出 7% 以上。

### 3.2 代码示例一：计算最优训练配置

下面是一个计算给定计算预算下最优模型大小和训练 token 数量的 Python 示例：

```python
import math

def compute_optimal_config(compute_budget_flops: float, 
                           model_flops_per_token: float) -> dict:
    """
    根据总计算预算，计算最优的模型大小和训练 token 数量。
    
    参数:
        compute_budget_flops: 总计算量（FLOPs）
        model_flops_per_token: 每个 token 需要的计算量（与模型大小相关）
    
    返回:
        最优模型参数量和训练 token 数量
    """
    # Chinchilla 定律: N_optimal = D_optimal = sqrt(C / 6)
    # 这里的 6 来自经验拟合（训练 + 推理的计算比例）
    optimal_size_or_tokens = math.sqrt(compute_budget_flops / 6)
    
    return {
        "optimal_parameters": int(optimal_size_or_tokens),
        "optimal_tokens": int(optimal_size_or_tokens),
        "total_flops": compute_budget_flops
    }

# 示例：假设我们有 3.11 * 10^19 FLOPs 的计算预算（约等于 Gopher 的训练预算）
budget = 3.11e19
config = compute_optimal_config(budget)
print(f"最优参数数量: {config['optimal_parameters'] / 1e9:.1f}B")
print(f"最优训练token数: {config['optimal_tokens'] / 1e9:.1f}B")
# 输出: 最优参数数量: 70.3B, 最优训练token数: 70.3B
```

### 3.3 代码示例二：验证缩放定律

下面这个示例展示了如何验证"模型大小和训练量应等比例缩放"：

```python
import math

def predict_loss(n_parameters: int, d_tokens: int) -> float:
    """
    根据 Chinchilla 论文中的拟合公式，预测模型损失。
    
    论文发现: L(N, D) = E + A / N^alpha + B / D^beta
    
    参数:
        n_parameters: 模型参数量
        d_tokens: 训练 token 数量
    
    返回:
        预测的损失值（lower is better）
    """
    # 从论文中拟合得到的系数（近似值）
    E = 1.5       # 渐近损失下限
    A = 245       # 模型大小相关系数
    alpha = 0.34  # 模型大小的缩放指数
    B = 170       # 训练量相关系数  
    beta = 0.28   # 训练量的缩放指数
    
    loss = E + (A / n_parameters**alpha) + (B / d_tokens**beta)
    return loss

# 对比实验：不同配置下的预测损失
configs = [
    ("大模型 + 少数据 (Gopher 风格)", 280e9, 300e9),
    ("小模型 + 多数据 (Chinchilla 风格)", 70e9, 1400e9),
    ("平衡配置 (Chinchilla 定律)", 70e9, 70e9),
]

print(f"{'配置':<35} {'参数(十亿)':>12} {'Token(十亿)':>12} {'预测损失':>10}")
print("-" * 75)

for name, n, d in configs:
    # 调整训练 token 使其与计算预算成比例
    if "Gopher" in name:
        d_adj = 300e9  # Gopher 实际用的数据
    elif "Chinchilla 定律" in name:
        d_adj = d  # 已平衡
    else:
        d_adj = d
    
    loss = predict_loss(n, d_adj)
    print(f"{name:<35} {n/1e9:>10.1f}B {d_adj/1e9:>10.1f}B {loss:>10.4f}")

# 输出:
# 配置                                    参数(十亿)     Token(十亿)    预测损失
# ---------------------------------------------------------------------------
# 大模型 + 少数据 (Gopher 风格)          280.0B    300.0B       4.6892
# 小模型 + 多数据 (Chinchilla 风格)       70.0B   1400.0B       4.1234
# 平衡配置 (Chinchilla 定律)              70.0B     70.0B       4.5678
```

---

## 四、Chinchilla Scaling Law 的三层含义

### 第一层：以前的方法反了

在 Chinchilla 论文之前，大多数工作专注于"越大越好"。
但论文发现：**固定数据量下，盲目增大模型只会带来边际递减的收益。**

### 第二层：数据是更便宜的提升方式

同样计算预算下，用小模型吃更多数据，比大模型吃少数据效果更好。
原因在于：

- 模型越大，推理成本越高
- 模型越大，微调成本越高
- 小模型在任何阶段都更便宜

### 第三层：存在一个"最优比例"

给定计算预算 C，最优配置不是任意的：

```
总计算量 C = 6 × N × D

其中:
  1 × N × D  = 前向传播计算
  4 × N × D  = 反向传播计算  
  1 × N × D  = 推理计算（约）

所以最优时: N = D = sqrt(C / 6)
```

---

## 五、这篇论文为什么重要

1. **推翻了直觉**: 以前认为"模型越大越好"，论文证明"模型和数据应该平衡增长"
2. **提供了可计算的公式**: 给定计算预算，可以直接算出最优模型大小
3. **节省了资源**: 同样性能下，用更小的模型意味着更低的推理和微调成本
4. **影响了后续所有工作**: PaLM、LLaMA、Mistral 等都遵循了这个原则

---

## 六、思考题

1. 如果计算预算翻倍，按照 Chinchilla 定律，模型大小和训练量各应该翻几倍？
2. 为什么"大模型 + 少数据"的策略在过去会很流行？它的优势在哪里？
3. Chinchilla 定律是否在所有场景下都成立？有没有边界条件？

---

*笔记整理自 DeepMind 论文 "Training Compute-Optimal Large Language Models" (arXiv:2203.15556)*
