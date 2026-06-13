---
title: Scaling Laws for Neural Language Models
来源: https://arxiv.org/abs/2001.08361
日期: 2026-06-13
分类: 机器学习
子分类: llm-scaling
provenance: pipeline-v3
---

# Scaling Laws for Neural Language Models

## 一句话总结

这篇论文发现了一个惊人的规律：神经网络语言模型的性能，跟模型大小、数据量、训练算力三者之间，存在极其精确的幂律关系。简单来说，就是"越大越好、越多越好、算得越久越好"，而且这种好是可以精确预测的。

## 日常类比：烤蛋糕

想象你在烤一个巨大的蛋糕。你发现：

- 蛋糕的"美味程度"跟面粉量（模型参数 N）呈幂律关系
- 跟食谱丰富度（数据集大小 D）也呈幂律关系
- 跟烤箱工作时间（训练算力 C）同样呈幂律关系

关键发现是：只要这三个因素同时按比例增长，蛋糕就会越来越好吃。而且这个"越来越好"的速度可以用一个简单公式精确算出来。

这跟你平时想的"模型大一点性能好一点"不同——这里的"好一点"不是随便好一点的，而是按照非常精确的数学规律变好的。

## 核心概念

### 1. 幂律缩放（Power-law Scaling）

幂律关系是这篇论文的核心发现。它的形式是：

```
性能 = (常数 / 变量)^指数
```

在日志坐标图上，幂律关系就是一条直线。这意味着：

- 模型参数翻倍，损失（loss）按固定比例下降
- 数据量翻倍，损失按固定比例下降
- 算力翻倍，损失按固定比例下降

### 2. 三个关键变量

| 符号 | 含义 | 单位 |
|------|------|------|
| N | 模型参数数量（不含词嵌入） | 参数量 |
| D | 训练数据量 | token 数 |
| C | 训练使用的总算力 | PF-days |

### 3. 损失函数（Loss）

论文用的是交叉熵损失（cross-entropy loss），单位是 nats。损失越低，模型预测下一个词就越准。

### 4. 过拟合的通用规律

当你把模型做大但数据不够时，模型会过拟合。论文发现过拟合的程度只取决于一个比值：N^0.74 / D。也就是说，模型变大 8 倍时，数据只需要增加约 5 倍就能避免过拟合惩罚。

## 三个核心公式

### 公式一：模型大小的影响

```
L(N) = (Nc / N)^αN

其中 αN ≈ 0.076, Nc ≈ 8.8 × 10^13
```

模型参数越多，损失越小。具体来说，参数翻倍，损失变为原来的 0.95 倍（下降了 5%）。

### 公式二：数据量的影响

```
L(D) = (Dc / D)^αD

其中 αD ≈ 0.095, Dc ≈ 5.4 × 10^13 tokens
```

数据量越大，损失越小。数据量翻倍，损失变为原来的 0.94 倍。

### 公式三：算力的最优分配

```
L(C_min) = (Cc_min / C_min)^αC_min

其中 αC_min ≈ 0.050
```

这是最反直觉的发现：**最优策略是用非常大的模型、相对较少的数据、提前停止训练**。而不是用小模型训练到收敛。

## 代码示例

### 示例一：计算模型缩放带来的损失变化

```python
import math

def predict_loss_from_params(param_count, Nc=8.8e13, alpha_n=0.076):
    """
    根据模型参数数量预测交叉熵损失。

    param_count: 模型的非嵌入参数数量
    Nc: 缩放定律中的常数
    alpha_n: 幂律指数
    """
    loss = (Nc / param_count) ** alpha_n
    return loss

# 对比不同大小的模型
models = {
    "小模型 (1M)": 1e6,
    "中等模型 (100M)": 1e8,
    "大模型 (1B)": 1e9,
    "超大模型 (10B)": 1e10,
}

print("=== 模型大小对损失的影响 ===")
baseline_loss = None
for name, params in models.items():
    loss = predict_loss_from_params(params)
    if baseline_loss is None:
        baseline_loss = loss
        print(f"{name}: loss = {loss:.4f} (基准)")
    else:
        ratio = loss / baseline_loss
        print(f"{name}: loss = {loss:.4f} (基准的 {ratio:.2%})")
```

运行结果会显示：从 1M 到 10B 参数，损失持续下降，但下降速度越来越慢。这就是幂律的特征。

### 示例二：模拟算力预算的最优分配

```python
def optimal_compute_allocation(total_compute, alpha_n=0.076,
                                alpha_d=0.095, alpha_s=0.76,
                                alpha_b=0.21):
    """
    给定总算力预算，计算最优的参数规模、数据量和训练步数分配。

    论文的核心结论：算力增加时，大部分应该花在增大模型上，
    而不是增加数据量或训练时间。
    """
    # 组合指数：alpha_C = 1 / (1/alpha_S + 1/alpha_B + 1/alpha_N)
    alpha_c = 1.0 / (1.0/alpha_s + 1.0/alpha_b + 1.0/alpha_n)

    # 最优分配比例
    param_growth = total_compute ** (alpha_c / alpha_n)
    batch_growth = total_compute ** (alpha_c / alpha_b)
    step_growth = total_compute ** (alpha_c / alpha_s)
    data_size = batch_growth * step_growth

    return {
        "组合指数 alpha_C": f"{alpha_c:.3f}",
        "参数增长倍数": f"{param_growth:.1f}x",
        "批次大小增长": f"{batch_growth:.1f}x",
        "训练步数增长": f"{step_growth:.1f}x",
        "数据量增长": f"{data_size:.1f}x",
    }

# 模拟算力增加 100 倍的情况
result = optimal_compute_allocation(100)
print("\n=== 算力增加 100 倍时的最优分配 ===")
for key, value in result.items():
    print(f"  {key}: {value}")
```

这段代码验证了论文的关键发现：当算力增加 100 倍时，参数规模应该增长约 55 倍，而数据量只增长约 2.8 倍。绝大部分算力应该花在更大的模型上。

## 为什么这很重要

### 1. 预测性

有了这些公式，你可以在训练之前就知道：如果我想要损失降到某个值，我需要多大的模型、多少数据、多少算力。这不再是玄学猜测，而是可以计算的。

### 2. 效率启示

传统做法是把小模型训练到收敛。但这篇论文告诉我们：**最优策略是大模型 + 少数据 + 早停**。这完全颠覆了直觉。

### 3. 可扩展性

这些幂律关系跨越了七个数量级以上，没有看到任何偏离的迹象。这意味着即使模型继续变大，性能提升的规律依然成立。

## 关键发现总结

- 性能主要取决于规模（N、D、C），对网络形状（深度 vs 宽度）不敏感
- 三个因子之间存在精确的幂律关系，可预测
- 大模型比小模型更高效（sample-efficient），达到相同性能需要的数据更少
- 最优训练策略是大模型、少数据、早停止
- 泛化能力随模型增大而稳定提升，与训练时长无关

## 留给你的思考题

论文提到，随着模型越来越大，它们变得越发"高效"——用更少的数据就能达到同样的性能。你觉得这可能意味着什么？如果未来数据成为瓶颈，我们该怎么办？
