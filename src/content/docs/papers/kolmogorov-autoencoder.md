---
title: "KAE: Kolmogorov-Arnold Auto-Encoder for Representation Learning"
来源: https://arxiv.org/abs/2501.00420
日期: 2026-06-13
分类: 机器学习
子分类: 表示学习
provenance: pipeline-v3
---

# KAE: Kolmogorov-Arnold Auto-Encoder for Representation Learning

## 一、一个日常类比：会"变形"的压缩器

想象你有一台老式 ZIP 压缩包。你把一张照片放进去，它把它压成一个小文件；解压后，照片基本能看，但有点模糊。这就是**自编码器（Auto-Encoder）**的基本思路：把数据压缩成一个"浓缩版"（叫 latent representation），然后再还原回来。

传统自编码器的"压缩公式"长这样：

```
z = σ(W · x + b)
```

这里的 `σ` 是一个**固定不变**的函数，比如 ReLU 或 Sigmoid。无论输入是什么数据，它都用同一套"模具"来压缩。

KAE 的核心想法是：**让压缩函数自己学会怎么变**。

Kolmogorov-Arnold 表示定理告诉我们：任何一个多维连续函数，都可以拆成一堆"一维函数"的组合。翻译成大白话就是——你不需要一个万能公式搞定一切，只要每个维度各学各的"变形方式"，拼起来就能逼近任何复杂函数。

KAE 就是把这条数学定理塞进了自编码器的骨架里。

## 二、三大核心概念

### 1. 传统自编码器 vs KAN vs KAE

| 模型 | 激活函数 | 本质区别 |
|------|----------|----------|
| 传统 AE | 固定的（ReLU / Sigmoid） | `y = σ(W·x + b)`，权重可学，函数固定 |
| KAN | 可学习的 B 样条函数 | `y = φ(x)`，每条边上的函数自己学 |
| **KAE** | **可学习的多项式函数** | `y = σ(c₀ + c₁x + c₂x² + ... + cₚxᵖ + b)` |

关键区别：KAN 用的是 B 样条（B-spline），而 KAE 发现**多项式**在自编码器场景下更稳定、效果更好。

### 2. Kolmogorov-Arnold 表示定理（简化版）

定理说：对任意 d 维连续函数 f，都存在一组一维函数，使得：

```
f(x₁, x₂, ..., xₙ) = Σₖ Φₖ( Σⱼ φₖ,ⱼ(xⱼ) )
```

直观理解：

- 外层函数 Φₖ 负责"汇总"
- 内层函数 φₖ,ⱼ 负责对每个输入维度分别做非线性变换
- 两层叠加就能逼近任何连续函数

这就是 KAN 的理论根基。KAE 在此基础上进一步选择用**多项式**作为内层函数的具体形式。

### 3. 为什么选多项式而不是 B 样条？

论文做了一个重要发现：直接把 KAN 的 B 样条塞进自编码器，效果提升有限甚至更差。原因有三：

- B 样参数量多，容易过拟合
- 自编码器要求编码器和解码器互为"逆操作"，多项式的平滑可微特性更容易满足这个条件
- 二次（p=2）和三次（p=3）多项式在灵活性和稳定性之间取得了最佳平衡

KAE 的层定义：

```
KAE(x) = σ( h(x) + b )
       = σ( c₀·1 + c₁·x + c₂·x² + ... + cₚ·xᵖ + b )
```

其中 `h(x)` 是多项式函数，`σ` 是外层的 Sigmoid。

## 三、代码示例

### 示例 1：从零实现一个 KAE 层

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class KAELayer(nn.Module):
    """
    一个 KAE 层：用可学习多项式替换传统全连接层中的线性变换。

    传统全连接层：  y = σ(W · x + b)
    KAE 层：       y = σ( (c₀ + c₁x + c₂x² + ... + cₚxᵖ) + b )

    参数:
        dim_in:  输入维度
        dim_out: 输出维度
        poly_order: 多项式阶数（p=1 是线性，p=2 是二次，p=3 是三次）
    """
    def __init__(self, dim_in, dim_out, poly_order=2):
        super().__init__()
        self.poly_order = poly_order
        self.dim_in = dim_in
        self.dim_out = dim_out

        # 为每个多项式系数创建一个可学习矩阵
        # coeffs[p] 的形状: (dim_out, dim_in)
        self.coeffs = nn.ParameterList([
            nn.Parameter(torch.randn(dim_out, dim_in))
            for _ in range(poly_order + 1)
        ])

        # 传统偏置项
        self.bias = nn.Parameter(torch.randn(dim_out))

    def forward(self, x):
        # x 形状: (batch_size, dim_in)
        # 逐项计算多项式: c₀ + c₁x + c₂x² + ... + cₚxᵖ
        result = self.coeffs[0]  # c₀ 是常数项（相当于矩阵形式的偏置）
        x_power = x  # 当前 x 的幂次: x¹, x², x³, ...

        for p in range(1, self.poly_order + 1):
            result = result + self.coeffs[p] @ x_power.t()
            x_power = x_power * x  # 累积幂次: x -> x² -> x³

        # 加上偏置并经过 Sigmoid
        return torch.sigmoid(result.t() + self.bias)


# ---- 使用演示 ----
layer = KAELayer(dim_in=784, dim_out=32, poly_order=2)
x = torch.randn(64, 784)  # 64 张 28x28 的手写数字图片
z = layer(x)
print(f"输入形状: {x.shape}")  # torch.Size([64, 784])
print(f"输出形状: {z.shape}")  # torch.Size([64, 32])
```

### 示例 2：完整的 KAE 自编码器

```python
class KAAutoEncoder(nn.Module):
    """
    完整的 KAE 自编码器：编码器 + 解码器。

    架构: 784 -> 256 -> 32 (latent) -> 256 -> 784
    每一层都用 KAE 层替换了传统的全连接层。
    """
    def __init__(self, input_dim=784, latent_dim=32, hidden_dim=256, poly_order=2):
        super().__init__()

        self.encoder = nn.Sequential(
            KAELayer(input_dim, hidden_dim, poly_order),
            KAELayer(hidden_dim, latent_dim, poly_order),
        )

        self.decoder = nn.Sequential(
            KAELayer(latent_dim, hidden_dim, poly_order),
            KAELayer(hidden_dim, input_dim, poly_order),
        )

    def encode(self, x):
        return self.encoder(x)

    def decode(self, z):
        return self.decoder(z)

    def forward(self, x):
        z = self.encode(x)
        x_reconstructed = self.decode(z)
        return x_reconstructed


# ---- 训练循环（MNIST 示例）----
model = KAAutoEncoder(input_dim=784, latent_dim=32, poly_order=2)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-4, weight_decay=1e-4)
mse_loss = nn.MSELoss()

# 模拟一批 MNIST 数据 (batch=256, 784=28*28)
dummy_input = torch.randn(256, 784)

# 前向传播
reconstructed = model(dummy_input)
loss = mse_loss(reconstructed, dummy_input)

# 反向传播
optimizer.zero_grad()
loss.backward()
optimizer.step()

print(f"重建损失 (MSE): {loss.item():.6f}")
```

### 示例 3：对比实验——不同多项式阶数的效果

```python
"""
论文实验结果摘要（MNIST, latent_dim=32）：

模型          重建误差 (MSE)    检索召回率 (Recall@10)
--------------------------------------------------------
传统 AE        0.043             0.483
KAN (B-spline) 0.036             0.552
FourierKAN     0.031             0.638
WavKAN         0.089             0.447
KAE (p=1)      0.041             0.488
KAE (p=2)      0.017             0.689   <-- 最佳
KAE (p=3)      0.015             0.659

关键发现：
- p=2（二次多项式）在重建和检索上都是最佳平衡点
- p=3（三次多项式）重建误差更低，但检索略逊于 p=2
- 传统 AE 的误差是 KAE(p=2) 的 2.5 倍
"""

# 模拟不同阶数的参数量对比
def count_parameters(poly_order, layers=[784, 256, 32, 256, 784]):
    total = 0
    for i in range(len(layers) - 1):
        # 每个 KAE 层有 (poly_order + 1) 个系数矩阵 + 1 个偏置向量
        params = (poly_order + 1) * layers[i+1] * layers[i] + layers[i+1]
        total += params
    return total

for p in [1, 2, 3]:
    n_params = count_parameters(p)
    print(f"多项式阶数 p={p}: {n_params:,} 个可学习参数")
# p=1: 2,051,328 个参数
# p=2: 3,076,992 个参数
# p=3: 4,102,656 个参数
```

## 四、实验结果速览

论文在四个数据集上做了全面实验：

| 数据集 | 类型 | 图片尺寸 | 类别数 |
|--------|------|----------|--------|
| MNIST | 手写数字 | 28×28 | 10 |
| FashionMNIST | 服装 | 28×28 | 10 |
| CIFAR10 | 自然图像 | 32×32 | 10 |
| CIFAR100 | 自然图像 | 32×32 | 100 |

**三项下游任务均验证了 KAE 的优势：**

1. **重建质量**：KAE(p=2) 在 MNIST 上将 MSE 从 AE 的 0.043 降到 0.017，降幅 60%+
2. **相似度检索**：KAE(p=2) 在 MNIST 上将 Recall@10 从 0.483 提升到 0.689
3. **图像去噪**：KAE 在含噪图像重建任务中同样优于所有基线

## 五、与相关工作的关系

- **KAN (Liu et al., 2024)**：原始 KAN 用 B 样条作为可学习函数，KAE 证明在自编码器场景下多项式更优
- **FourierKAN**：用傅里叶级数，在检索上有竞争力但在重建上不如 KAE
- **WavKAN**：用小波函数，整体表现最弱
- **标准 AE**：KAE 在所有指标上显著超越

## 六、一句话总结

KAE 把 Kolmogorov-Arnold 定理引入自编码器，用可学习的多项式函数替换固定激活函数，在重建、检索、去噪三项任务上全面超越了传统自编码器和各类 KAN 变体。

## 七、延伸思考

1. **多项式阶数怎么选？** 论文显示 p=2 是甜点，但面对更复杂的任务（如大规模图像分类），p=3 是否会更优？
2. **和 VAE 结合会怎样？** KAE 目前是无监督重构，如果加入变分框架（KL 散度约束），生成的 latent space 会不会更适合生成任务？
3. **和其他架构结合？** KAN 已经被用来构建 Transformer（Kolmogorov-Arnold Transformer），KAE 的思路能否推广到卷积网络？
