---
title: Dual PatchNorm — 用两个 LayerNorm 让 ViT 更稳地学图像
来源: https://arxiv.org/abs/2302.01327
日期: 2026-06-13
分类: 其他
子分类: ml-deep-learning
provenance: pipeline-v3
---

# Dual PatchNorm 学习笔记

## 一、一句话概括

这篇论文说了一件事儿：**在 ViT 的 patch embedding 层前后各加一个 LayerNorm，就能稳定提升精度，而且几乎零成本。**

作者叫它 "Dual PatchNorm"。改动量极小，效果却稳定——这就是它的核心贡献。

## 二、从日常类比开始

想象你在教一个学生认猫和狗的照片。

在原始 ViT 里，第一步是把一张大图切成很多小块（patch），然后把每个小块变成一串数字向量。这就像让学生先看每张照片的局部——比如只看耳朵、只看尾巴。

问题来了：不同照片的亮度、颜色差异很大。有的照片偏黄（室内灯光），有的偏蓝（阴天）。这些"色彩偏差"会让后面的学习过程很混乱，模型不知道该关注"这是猫的耳朵"还是"这张照片太亮了"。

**LayerNorm 的作用就是"调白平衡"**——它把每个 patch 向量的数值拉到同一个尺度上，去掉光照差异带来的干扰，让模型只关注内容本身。

传统做法是在整个网络里到处放 BatchNorm 或者只在某些位置放 LayerNorm。但 Dual PatchNorm 的思路更简单：既然 patch embedding 是 ViT 接收图像的第一步，那我们就在这一步的**前面**做一次归一化（让输入更干净），在**后面**再做一次归一化（让输出更干净）。两步夹击，后续的所有层都能在一个更稳定的起点上开始学习。

## 三、ViT 的背景知识

在看 Dual PatchNorm 之前，需要先理解 Vision Transformer 的基本流程。

### 3.1 ViT 的核心步骤

一个标准的 ViT 处理一张图片的流程如下：

1. **Patch Embedding**：把 H x W x C 的图片切成 N 个固定大小的 patch（比如 16x16），每个 patch 展平成一维向量，再通过一个线性投影映射到 D 维
2. **添加 Positional Embedding**：因为 Transformer 本身没有空间感知能力，所以需要加上位置编码
3. **Transformer Encoder**：用多头自注意力（Multi-Head Self-Attention）和前馈网络（FFN）反复处理这些 patch 向量
4. **分类头**：取第一个 token（CLS token）的输出，接一个全连接层得到类别概率

### 3.2 LayerNorm 是什么

LayerNorm（层归一化）是对单个样本的某个向量做标准化：

- 算出这个向量所有元素的平均值 μ 和标准差 σ
- 每个元素减去 μ 再除以 σ
- 最后乘上一个可学习的缩放因子 γ，加上偏置 β

公式是：

```
LN(x) = γ * (x - μ) / σ + β
```

为什么要做这个？因为如果输入的数值范围不稳定（有时很大、有时很小），模型训练就会震荡。LayerNorm 保证每一层的输入都在一个合理的范围内。

## 四、Dual PatchNorm 的核心思想

### 4.1 问题动机

作者观察到，在 ViT 中，patch embedding 层的输入（原始像素值）和输出（嵌入向量）的分布都不是很理想：

- **输入端**：像素值的分布受光照、对比度影响大
- **输出端**：经过线性变换后的嵌入向量，分布也不够稳定

这两个地方的"脏数据"会一路传播到后面的 Transformer 层，影响训练效果。

### 4.2 解决方案

Dual PatchNorm 的做法就是在 patch embedding 的前后各放一个 LayerNorm：

```
输入像素 --> LayerNorm(A) --> PatchEmbedding --> LayerNorm(B) --> 后续 Transformer 层
```

- **LayerNorm(A)**：在 patch embedding 之前，对原始 patch 向量做归一化
- **LayerNorm(B)**：在 patch embedding 之后，对嵌入后的向量做归一化

两个 LayerNorm 都是可学习的（各有自己的 γ 和 β 参数），所以模型可以自动学会"什么时候需要归一化、归一化成什么样"。

### 4.3 为什么有效

从第一性原理推导：

1. **消除输入分布偏移**：不同图像的光照、颜色差异本质上是一种分布偏移。LayerNorm(A) 在特征进入非线性变换之前就把它拉平了
2. **稳定嵌入空间**：Patch embedding 是一个线性投影，可能放大某些方向的方差。LayerNorm(B) 确保输出的嵌入向量在稳定的尺度上
3. **梯度更友好**：归一化后的输入意味着梯度不会在某些方向上爆炸或消失，训练更稳定
4. **零副作用**：因为 LayerNorm 是可学习的，如果某个地方不需要归一化，模型可以把 γ 设为 σ 对应的值、β 设为 μ，相当于恒等变换

## 五、代码示例

### 5.1 原始 ViT 的 Patch Embedding（没有 Dual PatchNorm）

```python
import torch
import torch.nn as nn

class VanillaPatchEmbed(nn.Module):
    """原始的 patch embedding：直接把图片切成块并投影"""

    def __init__(self, img_size=224, patch_size=16, in_chans=3, embed_dim=768):
        super().__init__()
        self.num_patches = (img_size // patch_size) ** 2
        # 用一个卷积来做 patch embedding
        self.proj = nn.Conv2d(
            in_chans, embed_dim,
            kernel_size=patch_size,
            stride=patch_size
        )

    def forward(self, x):
        # x: (B, C, H, W)
        x = self.proj(x)          # (B, embed_dim, H/P, W/P)
        x = x.flatten(2)          # (B, embed_dim, num_patches)
        x = x.transpose(1, 2)     # (B, num_patches, embed_dim)
        return x
```

这里没有任何归一化操作。像素值直接进卷积，输出的嵌入向量也没有被归一化。

### 5.2 加入 Dual PatchNorm 的版本

```python
class DualPatchNormEmbed(nn.Module):
    """Dual PatchNorm：在 patch embedding 前后各加一个 LayerNorm"""

    def __init__(self, img_size=224, patch_size=16, in_chans=3, embed_dim=768):
        super().__init__()
        self.num_patches = (img_size // patch_size) ** 2
        self.norm_before = nn.LayerNorm(in_chans * patch_size * patch_size)
        self.proj = nn.Conv2d(
            in_chans, embed_dim,
            kernel_size=patch_size,
            stride=patch_size
        )
        self.norm_after = nn.LayerNorm(embed_dim)

    def forward(self, x):
        # x: (B, C, H, W)
        x = self.proj(x)                    # (B, embed_dim, H/P, W/P)
        x = x.flatten(2)                    # (B, embed_dim, num_patches)
        x = x.transpose(1, 2)               # (B, num_patches, embed_dim)
        x = self.norm_after(x)              # LayerNorm(B)：嵌入后归一化
        return x
```

注意：这里的 `norm_before` 实际上应该用在 flatten 之前、proj 之前的原始 patch 上。在实际实现中，通常把 LayerNorm(A) 放在将 patch 展平之后、卷积投影之前。更完整的写法是：

```python
class DualPatchNormEmbedFull(nn.Module):
    """更完整的 Dual PatchNorm 实现"""

    def __init__(self, img_size=224, patch_size=16, in_chans=3, embed_dim=768):
        super().__init__()
        self.num_patches = (img_size // patch_size) ** 2
        patch_dim = patch_size * patch_size * in_chans

        # LayerNorm(A)：在投影之前对原始 patch 向量做归一化
        self.norm_before = nn.LayerNorm(patch_dim)

        # Patch embedding 投影
        self.proj = nn.Linear(patch_dim, embed_dim)

        # LayerNorm(B)：在投影之后对嵌入向量做归一化
        self.norm_after = nn.LayerNorm(embed_dim)

    def forward(self, x):
        # x: (B, C, H, W)
        # 把图片切成 patches，每个 patch 展平
        # x: (B, num_patches, patch_dim)
        B, C, H, W = x.shape
        P = int(H ** 0.5)  # 假设正方形图片
        x = x.reshape(B, C, P, self.num_patches ** 0.5 // P).flatten(2)
        # 更简单的做法：直接用 unfold
        x = x.unfold(2, self.patch_size, self.patch_size).unfold(3, self.patch_size, self.patch_size)
        x = x.reshape(B, -1, self.patch_size * self.patch_size * C)

        # Step 1: LayerNorm(A) —— 归一化原始 patch
        x = self.norm_before(x)

        # Step 2: 线性投影
        x = self.proj(x)

        # Step 3: LayerNorm(B) —— 归一化嵌入向量
        x = self.norm_after(x)

        return x
```

### 5.3 在完整 ViT 中的集成

```python
class SimpleViTWithDualPatchNorm(nn.Module):
    """带 Dual PatchNorm 的简化版 ViT"""

    def __init__(self, img_size=224, patch_size=16, in_chans=3,
                 embed_dim=768, depth=12, num_heads=12, mlp_ratio=4.0,
                 num_classes=1000):
        super().__init__()
        self.patch_embed = DualPatchNormEmbedFull(
            img_size=img_size,
            patch_size=patch_size,
            in_chans=in_chans,
            embed_dim=embed_dim
        )

        # 位置编码
        self.pos_embed = nn.Parameter(torch.zeros(1, self.patch_embed.num_patches + 1, embed_dim))

        # CLS token
        self.cls_token = nn.Parameter(torch.zeros(1, 1, embed_dim))

        # Transformer encoder blocks
        self.blocks = nn.Sequential(*[
            nn.TransformerEncoderLayer(
                d_model=embed_dim,
                nhead=num_heads,
                dim_feedforward=int(embed_dim * mlp_ratio),
                activation='gelu',
                norm_first=True
            )
            for _ in range(depth)
        ])

        # 分类头
        self.norm = nn.LayerNorm(embed_dim)
        self.head = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        B = x.shape[0]

        # Patch embedding with Dual PatchNorm
        x = self.patch_embed(x)  # (B, num_patches, embed_dim)

        # 添加 CLS token 和位置编码
        cls_tokens = self.cls_token.expand(B, -1, -1)
        x = torch.cat([cls_tokens, x], dim=1)  # (B, num_patches+1, embed_dim)
        x = x + self.pos_embed

        # Transformer encoder
        x = self.blocks(x)

        # 取 CLS token 做分类
        x = x[:, 0]
        x = self.norm(x)
        x = self.head(x)

        return x
```

## 六、实验结果要点

论文在多个数据集上验证了 Dual PatchNorm 的效果：

- **ImageNet 图像分类**：在 ViT-Base、ViT-Large 等不同规模模型上都取得了稳定提升
- **对比学习（MAE）**：在半监督预训练 setting 下也有效
- **VTAB 微调**：在跨域泛化任务上同样受益
- **消融实验**：单独使用 LayerNorm(A) 或 LayerNorm(B) 也有提升，但两者一起用时效果最好
- **与搜索策略比较**：即使和暴力搜索出来的最佳 LayerNorm 放置位置相比，Dual PatchNorm 的表现也不逊色

关键结论：**一个极简的改动，不需要搜索、不需要额外设计，就能稳定提升 ViT 的性能。**

## 七、局限性和思考

1. **不是银弹**：Dual PatchNorm 的提升幅度通常在 0.5%-1% 左右，属于"免费的午餐"但不是革命性的
2. **计算开销极小**：LayerNorm 的计算量相对于 Transformer 的注意力机制来说几乎可以忽略
3. **适用范围**：论文主要验证了在图像分类和对比学习上的效果，在其他视觉任务（如检测、分割）上的效果有限
4. **为什么不早点被发现？**：这可能说明学术界存在一种"集体盲点"——当大家都在 Transformer block 内部寻找优化方案时，很少有人回头看最基础的 patch embedding 阶段

## 八、总结

Dual PatchNorm 的价值不在于提出了什么复杂的新架构，而在于它提醒我们：

> **有时候最好的改进不在复杂的地方，而在最简单、最基础的地方。**

在 patch embedding 前后各加一个 LayerNorm，这个想法简单到几乎让人觉得"为什么没人早点做"。而这正是好科学的特征——用最小的改动，解决最普遍的问题。

对于学习者来说，这篇论文的启示是：在做模型改进时，不要忽视那些最基础的组件。有时候，回到第一步，检查一下数据的分布是不是已经"脏了"，就能找到突破口。

## 九、延伸阅读

- Vision Transformer 原始论文：[Dosovitskiy et al., 2020](https://arxiv.org/abs/2010.11929)
- LayerNorm 原始论文：[Ba et al., 2016](https://arxiv.org/abs/1607.06450)
- MAE（掩码自编码器）：[He et al., 2021](https://arxiv.org/abs/2111.06377)
- 本文发表于 **TMLR 2023**（Transactions on Machine Learning Research）
