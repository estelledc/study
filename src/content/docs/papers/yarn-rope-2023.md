---
title: YaRN -- 让大语言模型"看得更远"的上下文扩展技术
来源: https://arxiv.org/abs/2309.00071
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# YaRN: 高效扩展大语言模型上下文窗口

## 一个日常类比：望远镜的"调焦"

想象你有一台望远镜，出厂时只能看清 4 公里以内的风景。现在你想让它看清 16 公里以外的东西。

最简单的做法是把镜片拉远一点（ Position Interpolation，PI），但这会让远处的景物变得模糊不清——因为原本聚焦在近距离的细节丢了。

YaRN 的思路是：不是所有镜片都需要同样程度地拉远。靠近中心的镜片（编码局部信息的"高频"维度）保持不动，边缘的镜片（编码全局信息的"低频"维度）拉得更远。同时还加了一个"调焦环"（温度缩放），让整个画面更清晰。

这就是 YaRN 的核心直觉。

## 背景：RoPE 是什么？

Transformer 模型需要知道每个词在句子中的"位置"。RoPE（Rotary Position Embedding，旋转位置编码）的做法是给每个词的位置信息做一个"旋转"——类似于时钟指针转过的角度。

```
位置 m 的查询向量 q_m 和位置 n 的键向量 k_n 之间的相似度
= softmax(q_m^T · k_n / sqrt(D))

RoPE 把这个相似度"编码"成角度旋转的形式
使得 q_m 和 k_n 的点积只取决于它们的相对距离 (m - n)
```

关键问题：RoPE 只在训练时见过的最大长度（比如 4096）内"学好了"。超过这个长度，模型就"不认识"那些位置了。

## 核心问题一：高频信息丢失（NTK-aware）

RoPE 把位置信息映射到多个维度上，每个维度有一个"频率" θ。频率高的维度转得快（波长短），频率低的维度转得慢（波长长）。

简单拉伸（PI）的问题：把所有维度的频率都除以同一个缩放因子 s。这会导致高频维度"跳过了太多角度"，模型根本学不回来。

```python
# 问题：PI 等比例缩放所有维度
# 假设 θ = [0.0001, 0.001, 0.01, 0.1] 是 RoPE 的频率
# s = 8 意味着把上下文从 2048 扩展到 16384

theta = np.array([0.0001, 0.001, 0.01, 0.1])
theta_stretched = theta / 8  # PI 的做法：全部除以 8

# 高频维度 0.1 变成了 0.0125
# 模型原本在 0.1 附近"校准"过的，现在完全对不上
# 就像把一张照片放大 8 倍，像素全糊了

# NTK-aware 的做法：不同维度用不同的缩放倍数
# 低频（大波长）拉伸得多，高频（小波长）拉伸得少
theta_new = theta ** (1.0 / np.sqrt(np.sqrt(s)))
# s=8 时指数约等于 0.595
# 0.1 -> 0.255 (拉伸较少，保留了高频信息)
# 0.0001 -> 0.000012 (拉伸较多，填补了低频的空缺)
```

## 核心问题二：局部相对位置被破坏（NTK-by-parts）

并非所有维度都应该被拉伸。那些波长远小于上下文长度的维度——它们只编码"相邻词之间的相对位置"，不应该被改动。

```python
# NTK-by-parts：按"波长"分类处理
# r = 上下文长度 / 波长，表示一个维度在上下文内转了几圈

alpha = 1    # 下界：r < alpha 说明这个维度转得太少了
beta = 32    # 上界：r > beta 说明这个维度转得太多了

def gamma(r, alpha=1, beta=32):
    """ ramps from 0 to 1 between alpha and beta """
    if r < alpha:
        return 0          # 低频维度：完全拉伸 (除以 s)
    elif r > beta:
        return 1          # 高频维度：完全不拉伸 (保持 θ)
    else:
        return (r - alpha) / (beta - alpha)  # 中间值：线性过渡

# 对每个维度 d 计算其频率 θ_d
def apply_ntk_by_parts(theta_d, r_d, scale_s):
    g = gamma(r_d)
    h_theta = (1 - g) * (theta_d / scale_s) + g * theta_d
    return h_theta

# 举例：
# 维度A: r=0.5 < alpha=1, gamma=0, theta 被除以 8 (完全拉伸)
# 维度B: r=16, alpha<r<beta, gamma=0.5, theta 被除以 4 (半拉伸)
# 维度C: r=64 > beta=32, gamma=1, theta 不变 (完全不拉伸)
```

## 核心技巧三：温度缩放（Temperature Scaling）

在计算注意力之前，对 logits 做一个温度缩放，能进一步降低困惑度：

```
softmax(q_m^T · k_n / (t · sqrt(D)))

其中 t 是温度参数，t < 1 会让注意力分布更集中
```

YaRN 的经验公式（对 LLaMA/Llama2 系列）：

```
sqrt(1/t) = 0.1 * ln(s) + 1

s=16 时：sqrt(1/t) = 0.1 * ln(16) + 1 ≈ 1.35
s=32 时：sqrt(1/t) = 0.1 * ln(32) + 1 ≈ 1.41
```

## YaRN 完整公式

把上面三件事组合起来：

```python
import numpy as np

def yarn_rope(x, m, theta, scale_s):
    """
    YaRN 扩展的 RoPE 位置编码
    
    参数:
        x:       隐藏状态向量
        m:       当前 token 的位置索引
        theta:   RoPE 频率数组，形状 (D/2,)
        scale_s: 扩展倍数，如 16 表示从 4k 扩展到 64k
    
    返回:
        处理后的 query/key 向量
    """
    D = len(theta) * 2
    s = scale_s

    # 1. NTK-by-parts：对每个维度计算不同的 θ'
    r = 4096 / (2 * np.pi * (10000 ** (np.arange(D//2) / D)))  # 计算每个维度的 r 值
    alpha, beta = 1, 32

    def gamma(r_val):
        if r_val < alpha: return 0
        if r_val > beta: return 1
        return (r_val - alpha) / (beta - alpha)

    theta_new = np.array([
        (1 - gamma(r)) * (theta[d] / s) + gamma(r) * theta[d]
        for d, r in enumerate(r)
    ])

    # 2. 温度缩放
    inv_sqrt_t = 0.1 * np.log(s) + 1
    scale_factor = 1.0 / np.sqrt(inv_sqrt_t ** 2)

    # 3. 应用旋转位置编码
    cos_matrix = np.cos(m * theta_new)  # 形状 (seq_len, D/2)
    sin_matrix = np.sin(m * theta_new)

    # 旋转公式（简化版，实际是 2D 旋转矩阵乘法）
    q = x * cos_matrix + rotate_neg(x) * sin_matrix  # query
    q = q * scale_factor  # 温度缩放

    return q
```

## 推理时技巧：Dynamic Scaling

如果不做微调，只在推理时动态调整缩放因子：

```python
def dynamic_scaling_rope(x, current_length, max_context, theta):
    """
    Dynamic NTK：推理时根据当前序列长度动态调整
    
    好处：不需要微调，零成本获得 2 倍以上上下文扩展
    """
    s = max(1.0, current_length / max_context)

    # 当前序列越长，扩展越多
    # 当前序列越短，越接近原始模型行为
    # 模型性能"优雅降级"而非突然崩溃

    # 注意：如果用 KV Cache，要在应用 RoPE 之前缓存
    # 因为 RoPE 的 theta 会随 s 变化
```

## 实验结果速览

| 方法 | 扩展倍数 | 微调步数 | 32k 困惑度 |
|------|---------|---------|-----------|
| PI | 2k×16 | 400 | 最高 |
| NTK-aware | 2k×16 | 400 | 中等 |
| NTK-by-parts | 2k×16 | 400 | 较低 |
| **YaRN** | **2k×16** | **400** | **最低** |
| YaRN | 4k×32 | 400+200 | 2.37 (128k) |

YaRN 的关键优势：用 10 倍更少的 token 和 2.5 倍更少的训练步数，达到最好的扩展效果。

## 总结

| 组件 | 解决什么问题 | 类比 |
|------|------------|------|
| NTK-by-parts | 局部高频维度不被拉伸 | 中心镜片不动 |
| 温度缩放 | 降低整体困惑度 | 调焦环 |
| Dynamic Scaling | 零微调下推理时扩展 | 自动变焦 |

YaRN 的三件套让模型像一个好摄影师——近处清晰，远处也调得到焦。

## 下一步

- 阅读原论文：https://arxiv.org/abs/2309.00071
- 代码实现：https://github.com/jquesnelle/yarn
- 对比学习：Position Interpolation（PI）和 NTK-aware 方法的区别
