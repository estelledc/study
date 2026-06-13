---
title: MaskAlign: Token-Subset Representation Alignment for Efficient Diffusion Training
来源: https://arxiv.org/abs/2606.08788
日期: 2026-06-13
分类: 机器学习
子分类: 扩散模型
provenance: pipeline-v3
---

# MaskAlign: 用 Token 子集对齐，让扩散模型学得快又好

## 一、一个日常类比

想象你要学画画。

一位老师（预训练视觉模型）站在你旁边，你每画一笔，他就告诉你这一笔应该对应哪一块颜色。问题是：你看到的参考图是清晰的，但你画的草图其实很模糊，甚至有些地方被水晕开了。老师拿着清晰图的每一块颜色来要求你，而你手上只有模糊的草图。

这种"要求对不上"的情况，就是 MaskAlign 要解决的核心矛盾。

传统方法让模型用"所有画块"去对齐清晰参考图的"所有画块"。MaskAlign 的做法更聪明：每次随机遮住 25% 的画块，让模型学会在"看不到某些部分"的情况下仍然画出好作品。

## 二、背景：扩散模型为什么要对齐？

### 2.1 扩散模型在做什么

扩散模型生成图像的过程可以简化为三步：

1. **加噪**：把一张清晰图片逐渐加上随机噪声，直到变成一团纯噪声
2. **学去噪**：训练一个神经网络，学会从噪声中逐步恢复原图
3. **生成**：从纯噪声开始，让网络一步步"画"出图像

训练时，网络需要预测"这张图上加的是什么噪声"。损失函数就是预测噪声和真实噪声之间的距离。

### 2.2 为什么要引入"对齐"

2024-2025 年，研究者发现一个加速训练的好方法：

- 同时训练一个**预训练视觉编码器**（比如 DINOv2），它已经"见过"几亿张真实图片
- 每训练一步，让扩散模型的中间特征和这个编码器的特征尽量接近
- 这相当于给扩散模型请了一位"经验丰富的美术老师"在旁边指导

这个方法叫 **Representation Alignment**（表示对齐）。代表性工作包括 REPA、REG 等。

### 2.3 但有一个问题

对齐方法有一个隐藏矛盾：

| 扩散模型看到的是什么 | 编码器参考的是什么 |
|---|---|
| 加了噪声的模糊图像 | 完全清晰的干净图像 |
| 信息量随噪声强度变化 | 信息完整、稳定 |
| 不同阶段依赖不同视觉线索 | 始终提供完整语义 |

用清晰图的特征去要求一个正在处理模糊输入的模型，就像要求一个戴着毛玻璃眼镜的人画出精确的线条。

## 三、核心发现：Token 级别的不均匀性

### 3.1 什么是 Token

在 Transformer 架构中，一张图片会被切分成很多小块，每一块叫一个 **Token**。

比如一张 256x256 的图片：
- 先经过 VAE 压缩成 32x32 的潜在表示
- 再切成 16x16 的 patch，共 144 个 patch tokens
- 加上 1 个 class token（代表整张图的全局信息），共 145 个 tokens

### 3.2 关键观察

研究者分析了"对齐损失"在每个 token 上产生的梯度大小，发现：

- 梯度**不是均匀分布**的
- 某些空间位置的 token 总是产生更大的梯度
- 这种空间偏好是**稳定的**（在不同图片、不同训练阶段都一致）
- 最大空间概率是最小的约 21 倍

这说明：全 token 对齐并不是"公平对待"每一个画块，而是反复强化某些特定位置的 token。模型可能学会了一种"投机取巧"的方式——匹配清晰图的特征模式，但并不真正理解如何在噪声下完成去噪。

### 3.3 用热力图理解

```
Full-token 梯度热力图（示意，16x16 网格）:

高梯度概率       低梯度概率
██████░░░░░░░░░░  第 0 行：大部分位置高梯度
█████░░░░░░░░░░░  第 1 行：左侧高
██████░░░░░░░░░░  第 2 行：偏左高
█░░░░░░░░░░░░░░░  第 3 行：只有第一个位置高
...

→ 某些位置反复出现在"高梯度"名单中
→ 对齐梯度空间分布不均匀
```

## 四、MaskAlign 的解决方案

MaskAlign 的核心思想来自机器学习中经典的 **Dropout**：随机丢弃一部分输入，防止模型依赖完整的输入模式。

### 4.1 算法流程

```
训练时每一步：

1. 输入：干净图 z* → VAE编码 → 潜在 z0
2. 加噪：zt = (1-t) * z0 + t * 噪声
3. Token化：把 zt 切成 N 个 patch tokens + 1 个 class token
4. 【MaskAlign 新增】预掩码混合：用轻量级 Mixer 在 tokens 之间交换信息
5. 【MaskAlign 新增】随机遮罩：以 25% 概率随机遮住部分 patch tokens
   - class token 始终保留
   - 只保留约 193 个 tokens（而非全部 257 个）
6. 通过 SiT 网络前向传播
7. 计算两个损失：
   - 预测损失：用保留的 tokens 预测目标速度
   - 对齐损失：用保留的 tokens 与清晰图特征对齐
```

### 4.2 代码示例：随机 Token 遮罩

这是 MaskAlign 的核心操作——随机选择保留哪些 token：

```python
import torch

def apply_token_mask(hidden_states, mask_ratio=0.25):
    """
    对 Transformer 的 tokens 应用随机遮罩

    Args:
        hidden_states: (batch_size, seq_len, hidden_dim)
                       seq_len = 1 (class) + N (patches)
        mask_ratio:  要遮掉的 patch token 比例

    Returns:
        masked_states:   (batch_size, masked_len, hidden_dim)
                         只保留 class token + 可见的 patch tokens
        mask_indices:    (batch_size, masked_len) 保留的 token 索引
    """
    batch_size, seq_len, hidden_dim = hidden_states.shape

    # class token 是第一个，始终保留
    # patch tokens 从索引 1 到 seq_len-1
    num_patches = seq_len - 1
    num_keep = int(num_patches * (1 - mask_ratio))

    # 生成每个样本的随机遮罩
    # 对每个 batch 样本，从 num_patches 中随机选 num_keep 个保留
    noise = torch.randn(batch_size, num_patches, device=hidden_states.device)
    # argsort 返回从小到大排序的索引；取前 num_keep 个
    mask_indices = noise.argsort(dim=1)[:, :num_keep]

    # 插入 class token 的索引 0
    class_idx = torch.zeros(batch_size, 1, device=hidden_states.device, dtype=torch.long)
    mask_indices = torch.cat([class_idx, mask_indices + 1], dim=1)

    # 用 gather 选取保留的 tokens
    # expand 需要适配 hidden_dim
    expand_idx = mask_indices.unsqueeze(-1).expand(-1, -1, hidden_dim)
    masked_states = hidden_states.gather(1, expand_idx)

    return masked_states, mask_indices
```

运行效果：
- 输入：batch=32, seq_len=257 (1 class + 256 patches), hidden_dim=1152
- 输出：batch=32, seq_len=193 (1 class + 192 patches), hidden_dim=1152
- 每步的遮罩模式都不同

### 4.3 代码示例：预掩码 Token 混合

遮罩会造成信息丢失。MaskAlign 在遮罩前加入一个轻量级混合层，让 tokens 先交换信息：

```python
class PreMaskTokenMixer(torch.nn.Module):
    """
    预掩码 Token 混合器

    作用：在随机遮罩之前，让 tokens 之间交换信息。
    这样即使某些 token 被遮掉，它的内容已经通过混合
    传递到了其他 token 中。

    结构：两层带层归一化的 MLP
    """
    def __init__(self, hidden_dim, num_layers=2):
        super().__init__()
        layers = []
        for _ in range(num_layers):
            layers.extend([
                torch.nn.LayerNorm(hidden_dim),
                torch.nn.Linear(hidden_dim, hidden_dim * 4),
                torch.nn.GELU(),
                torch.nn.Linear(hidden_dim * 4, hidden_dim),
            ])
        self.layers = torch.nn.ModuleList(layers)

    def forward(self, x):
        """
        Args:
            x: (batch_size, seq_len, hidden_dim)
        Returns:
            混合后的 tokens，形状不变
        """
        for layer in self.layers:
            x = x + layer(x)  # 残差连接
        return x

# 使用方式：
# mixer = PreMaskTokenMixer(hidden_dim=1152, num_layers=2)
# mixed_tokens = mixer(all_tokens)  # 先混合
# masked_tokens, mask_idx = apply_token_mask(mixed_tokens, mask_ratio=0.25)  # 再遮罩
```

### 4.4 完整训练循环

```python
class MaskAlignTrainingStep:
    """
    MaskAlign 的单步训练流程
    """
    def __init__(self, sit_model, mixer, encoder, proj,
                 lambda_align=0.5, beta_class=0.03):
        self.sit = sit_model
        self.mixer = mixer
        self.encoder = encoder  # DINOv2 预训练编码器
        self.proj = proj        # 对齐投影层
        self.lambda_align = lambda_align
        self.beta_class = beta_class

    def forward(self, clean_images, class_labels, timestep):
        """
        Args:
            clean_images: (B, 3, 256, 256) 干净图像
            class_labels: (B,) 类别标签
            timestep:     当前噪声强度 t
        Returns:
            total_loss: 总损失
        """
        B = clean_images.shape[0]

        # 1. 编码为潜在表示
        z0 = vae_encode(clean_images)  # (B, 4, 32, 32)

        # 2. 加噪
        noise_z = torch.randn_like(z0)
        zt = (1 - timestep) * z0 + timestep * noise_z

        # 3. Token 化 + 加入 class token
        patch_tokens = patchify(zt)  # (B, N, D)
        class_token = encode_class(clean_images, class_labels)  # (B, D)
        tokens = concat([class_token.unsqueeze(1), patch_tokens], dim=1)

        # 4. 【MaskAlign】预掩码混合
        tokens = self.mixer(tokens)

        # 5. 【MaskAlign】随机遮罩
        masked_tokens, mask_idx = apply_token_mask(tokens, mask_ratio=0.25)

        # 6. SiT 前向传播
        hidden = self.sit(masked_tokens, timestep, class_labels)

        # 7. 计算预测损失（用保留的 tokens）
        pred_loss = compute_velocity_loss(hidden, z0, noise_z, mask_idx,
                                          beta_class=self.beta_class)

        # 8. 计算对齐损失（用保留的 tokens）
        # 获取清晰图的特征参考
        ref_features = self.encoder(clean_images)  # (B, N+1, D_ref)
        aligned_hidden = get_alignment_layer(hidden)  # (B, masked_len, D)
        aligned_ref = self.proj(ref_features)

        alignment_loss = -cosine_similarity(aligned_hidden, aligned_ref, mask_idx)

        # 9. 总损失
        total_loss = pred_loss + self.lambda_align * alignment_loss
        return total_loss
```

## 五、核心贡献总结

### 5.1 三个贡献

1. **发现了全 token 对齐的空间不均匀性**：高梯度 token 在空间上存在稳定偏好，说明对齐不是均匀影响所有 token
2. **提出了 Token 子集对齐方法**：随机遮罩 token，让模型学会在"信息不完整"时仍然保持对齐能力
3. **设计了轻量预掩码混合器**：在遮罩前先让 tokens 交换信息，减少信息丢失

### 5.2 关键数据

| 指标 | 结果 |
|---|---|
| 达到 FID 8.3 的速度 | 比原始 SiT-XL/2 快 **77 倍** |
| 达到 FID 5.9 的速度 | 比 SiT-XL/2 + REPA 快 **30 倍** |
| 每步训练时间减少 | 相对 REG 减少 **11.6%** |
| 400K 迭代 FID (无 CFG) | REG: 3.4 → MaskAlign: **2.8** |
| Token 数量减少 | 257 → 193，减少 **24.9%** |

## 六、实验中的关键发现

### 6.1 遮罩比例的影响

| 遮罩比例 | FID | 说明 |
|---|---|---|
| 0 (不遮) | 3.52 | 退化为 baseline |
| 0.25 | **2.84** | 最佳 |
| 0.50 | 3.15 | 遮太多，信息不足 |
| 0.75 | 5.82 | 完全无法训练 |

25% 是最佳平衡点：提供足够的扰动正则化，同时保留足够信息。

### 6.2 预掩码混合器的作用

| 配置 | FID | 说明 |
|---|---|---|
| 完整 MaskAlign | **2.67** | 两项都有 |
| 无混合器 | 3.54 | 直接遮罩，信息损失大 |
| 无遮罩 | 3.20 | 只剩混合，无正则化效果 |
| 两者都无 | 3.01 | 纯 baseline |

混合器和遮罩是互补的：混合器减少遮罩的信息损失，遮罩提供正则化信号。

## 七、我的理解

### 7.1 一句话总结

MaskAlign 发现"让模型每次都用全部 token 对齐清晰图特征"是一种偷懒的学习方式，于是随机遮住一部分 token，逼模型在信息不完整时仍然学会对齐，最终反而学得更牢固。

### 7.2 为什么有效

传统 Dropout 防止的是神经元之间的"共适应"。MaskAlign 把 Dropout 的思路迁移到了 token 级别，防止的是模型对"完整 token 集合"的依赖。当模型每次看到的 token 集合都不同时，它无法走捷径，只能学到更本质的对齐模式。

### 7.3 类比记忆

回到开头的画画类比：

- 传统对齐：老师每次都让你照着完整清晰图画，但你手头的草图是模糊的
- MaskAlign：老师每次遮住你参考图的一部分，让你猜缺失的部分应该是什么颜色，并告诉你猜得对不对

第二种方式训练出的"直觉"更 robust——因为你在信息不完整的情况下学会了如何推断完整图像。

## 八、局限性

- 目前仅在 ImageNet 256x256 和 SiT 架构上验证
- 对更高分辨率、文生图、其他教师模型的效果待探索
- 依赖遮罩比例（0.25）和混合层数（2 层）等设计选择

## 九、参考

- 原始论文: Pang et al., "MaskAlign: Token-Subset Representation Alignment for Efficient Diffusion Training", 2026
- arXiv: [2606.08788](https://arxiv.org/abs/2606.08788)
- 相关方法: REPA, REG, SiT
