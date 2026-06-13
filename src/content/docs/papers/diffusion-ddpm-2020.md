---
title: "DDPM — Denoising Diffusion Probabilistic Models（零基础笔记）"
来源: https://arxiv.org/abs/2006.11239
日期: 2026-06-13
分类: 机器学习
子分类: ml-deep
provenance: pipeline-v3
---

## 一句话

DDPM 教你用"先搞坏、再修好"的思路来生成新图片——先学会把图片一步步加噪声毁掉，再训练神经网络一步步把噪声去掉，最后从纯随机噪声"擦"出一张新图。

## 日常类比：橡皮泥雕塑

想象你在玩橡皮泥：

1. 你先捏了一只猫（这是**真实数据 x₀**）。
2. 然后你每隔一分钟就揉一下，每次揉的力度很小。揉了 1000 分钟后，橡皮泥变成了一团看不出形状的糊糊（这是**纯噪声 x_T**）。
3. 现在你请一个学生来学习：给他看每一分钟的"揉过的状态"，告诉他"上一分钟长什么样"。让学生学会**逆向操作**——从一团糊糊，一分钟一分钟地揉回一只猫。
4. 学生学会之后，你给他一团全新的橡皮泥（随机噪声），让他开始"逆向揉"。他揉出来的猫，和你原来那只不一样——是一只**全新的猫**。

DDPM 做的就是这件事。只不过"橡皮泥"是高维像素，"揉"是高斯噪声，"学生"是一个叫 U-Net 的神经网络。

## 为什么这篇文章重要

- 它是**扩散模型（Diffusion Model）的第一个 SOTA 实现**。2020 年之前扩散思想已经存在 5 年了，但一直只在玩具数据集上跑，DDPM 第一次在真实图像上追平了 GAN。
- 它是 **Stable Diffusion / DALL·E 2 / Midjourney / Sora 的祖宗**。这些产品背后的生成范式全部来自 DDPM。
- 它训练**比 GAN 稳得多**。GAN 经常"模式崩塌"（只生成几种安全的图），DDPM 就像普通监督学习一样，loss 平稳下降，不需要各种 trick 来稳住训练。
- 它给出了一个**数学清晰的底座**。基于变分下界（ELBO），每一步都有公式可推，后续所有改进（DDIM、Improved DDPM、Latent Diffusion）都建立在这套数学之上。

## 核心概念

### 概念 1：前向扩散（Forward Process）—— 慢慢加噪声

给定一张真实图片 x₀，我们定义一个包含 T 步（论文中 T = 1000）的马尔可夫链，每一步往图片上加一小撮高斯噪声：

```
x_t = √(1 - β_t) · x_{t-1} + √β_t · ε     （ε 是从标准正态分布采的噪声）
```

这里的 β_t 叫"方差调度"（variance schedule），是一个预设的小数序列，从 1e-4 线性增长到 0.02。

**关键技巧：闭式采样（Reparameterization Trick）**

你不需要一步一步加噪声。可以直接跳到任意第 t 步：

```
x_t = √ᾱ_t · x₀ + √(1 - ᾱ_t) · ε
```

其中 ᾱ_t = α₁ × α₂ × ... × αₜ（α_i = 1 - β_i）。这个公式意味着：训练时**直接跳到第 t 步**，不需要模拟前面的每一步。这就是 DDPM 能高效训练的核心原因。

### 概念 2：反向扩散（Reverse Process）—— 学去掉噪声

前向过程是固定的数学公式，不需要学。反向过程才是重点：给定 x_t，如何找到 x_{t-1}？

理论上 x_{t-1} 也服从高斯分布，但我们没法直接算出来（因为它依赖整个训练数据集）。所以 DDPM 的做法是：**用一个神经网络来近似**。

```
p_θ(x_{t-1} | x_t) = N(x_{t-1}; μ_θ(x_t, t), Σ_θ(x_t, t))
```

μ_θ 和 Σ_θ 都由神经网络输出。网络输入是"带噪声的图 x_t + 当前步数 t"，输出是"去噪后的均值和方差"。

### 概念 3：噪声预测重参数化（Noise Prediction）

论文做了一个漂亮的简化：与其让网络预测"去噪后的均值 μ"，不如让它直接预测"加进去的噪声 ε"。

把 x_t = √ᾱ_t · x₀ + √(1 - ᾱ_t) · ε 代入 μ 的公式，经过代数变换后，预测 μ 等价于预测 ε。于是损失函数变成了简单的 MSE：

```
L_simple = E_{t, x₀, ε} [ || ε - ε_θ(x_t, t) ||² ]
```

**这就是 DDPM 的全部训练目标：让网络预测的噪声和真实噪声的 MSE 最小。** 一个普通的监督学习回归任务。

### 概念 4：训练 vs 推理

**训练时**（5 行核心循环）：
1. 从训练集采一张真实图 x₀
2. 随机采一个 timestep t ∈ [1, T]
3. 随机采一份噪声 ε ~ N(0, I)
4. 用闭式公式计算 x_t = √ᾱ_t · x₀ + √(1 - ᾱ_t) · ε
5. 让网络 ε_θ(x_t, t) 预测 ε，计算 MSE loss 并反向传播

**推理时**（生成新图）：
1. 从纯高斯噪声 x_T ~ N(0, I) 开始
2. 对 t = T, T-1, ..., 1：
   - 让网络预测 ε_θ(x_t, t)
   - 用 ε_θ 计算 x_{t-1} 的均值和方差
   - 采样 x_{t-1} ~ N(μ_θ, Σ_θ)
3. 输出 x₀ —— 一张从未见过的全新图片

## 代码示例

### 示例 1：前向加噪（闭式采样）

这是 DDPM 最重要的一个函数——直接从 x₀ 跳到第 t 步，不需要逐步模拟。

```python
import torch

def q_sample(x_start, t, noise, alphas_cumprod):
    """
    前向扩散：从 x₀ 直接跳到第 t 步的噪声版本。

    参数:
      x_start:         原始图像 [batch, channels, height, width]
      t:               当前 timestep，形状 [batch]，每个样本可以不同
      noise:           随机高斯噪声，与 x_start 同形状
      alphas_cumprod:  ᾱ_t 的预计算张量，形状 [T]，索引 t 即 ᾱ_t

    返回:
      noisy_x:  第 t 步的加噪图像 [batch, channels, height, width]
    """
    # 把 t 的形状从 [batch] 变成 [batch, 1, 1, 1]，方便广播
    sqrt_alpha_cumprod = alphas_cumprod[t].reshape(-1, 1, 1, 1)

    # x_t = √ᾱ_t · x₀ + √(1 - ᾱ_t) · ε
    noisy_x = (
        sqrt_alpha_cumprod * x_start
        + torch.sqrt(1 - sqrt_alpha_cumprod) * noise
    )

    return noisy_x
```

这段代码对应论文公式 (5)：q(x_t | x₀) = N(x_t; √ᾱ_t x₀, (1 - ᾱ_t)I)。`alphas_cumprod` 是训练前预计算的：

```python
# 训练前一次性算好
betas = torch.linspace(1e-4, 0.02, 1000)  # linear schedule
alphas = 1 - betes
alphas_cumprod = torch.cumprod(alphas, dim=0)
```

### 示例 2：训练循环（DDPM 的 5 行核心）

```python
import torch
import torch.nn as nn

def train_ddpm(model, dataloader, device, T=1000):
    """
    DDPM 训练循环。

    参数:
      model:       U-Net 网络 ε_θ，输入 (x_t, t)，输出预测的噪声 ε
      dataloader:  图像数据加载器，产出 [batch, 3, 32, 32] 的归一化图像
      device:      'cuda' 或 'cpu'
      T:           总扩散步数
    """
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()

    for x_start, _ in dataloader:
        x_start = x_start.to(device)          # 真实图像
        batch_size = x_start.shape[0]

        # 1. 随机采样 timestep t
        t = torch.randint(0, T, (batch_size,), device=device)

        # 2. 随机采样噪声
        noise = torch.randn_like(x_start)

        # 3. 前向加噪到第 t 步
        noisy_x = q_sample(x_start, t, noise, alphas_cumprod.to(device))

        # 4. 网络预测噪声
        predicted_noise = model(noisy_x, t)

        # 5. MSE 损失：预测噪声 vs 真实噪声
        loss = nn.functional.mse_loss(predicted_noise, noise)

        # 反向传播
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    return loss.item()
```

U-Net 的网络签名很简单：

```python
# model(noisy_image, timestep_tensor) -> predicted_noise
# 输入: [B, C, H, W] + [B]
# 输出: [B, C, H, W]  （和输入同尺寸的噪声预测）
```

### 示例 3：推理采样（从噪声生成图像）

```python
@torch.no_grad()
def sample_ddpm(model, shape, device, T=1000):
    """
    从纯噪声生成一张图像。

    参数:
      model:       训练好的 U-Net
      shape:       (batch, channels, height, width)
      device:      'cuda' 或 'cpu'
      T:           总扩散步数

    返回:
        生成的图像，像素范围 [-1, 1]
    """
    # 1. 从纯高斯噪声开始
    x = torch.randn(shape, device=device)

    for t in reversed(range(T)):          # T, T-1, ..., 0
        t_tensor = torch.full((shape[0],), t, device=device)

        # 网络预测当前 x_t 中的噪声
        predicted_noise = model(x, t_tensor)

        # 2. 用预测噪声计算 x_{t-1} 的均值
        alpha = 1 - betas[t]
        alpha_cumprod = alphas_cumprod[t]

        # x_{t-1} = (1/√α_t) · (x_t - (1-α_t)/√(1-ᾱ_t) · ε_θ)
        coefficient = (1 - alpha) / torch.sqrt(1 - alpha_cumprod)
        mean = (1 / torch.sqrt(alpha)) * (x - coefficient * predicted_noise)

        # 3. 添加噪声采样（t=0 时不加）
        variance = 0.0 if t == 0 else betes[t]
        noise = torch.randn_like(x) if t > 0 else 0

        x = mean + torch.sqrt(variance) * noise

    return x
```

注意：t = 0 时 variance = 0，因为最后一步不需要再加噪声，直接输出结果。

## 为什么 DDPM 比 GAN 更受欢迎

| 特性 | GAN | DDPM |
|------|-----|------|
| 训练稳定性 | 经常模式崩塌，需要大量 trick | MSE loss 平稳下降，像普通监督学习 |
| 多样性 | 判别器倾向于"安全模式" | 自然覆盖更广的数据分布 |
| 数学基础 | 博弈论（极小极大），不直观 | 变分下界（ELBO），每一步可推导 |
| 推理速度 | 一步出图，极快 | 1000 步迭代，慢 |
| 可扩展性 | 大分辨率时训练更难 | 分辨率提升时表现稳定 |

## 这篇论文的局限

1. **推理太慢**：1000 步意味着要跑 1000 次 U-Net 前向。一张 32×32 的 CIFAR-10 图要几秒钟，256×256 可能要几分钟。后来 DDIM 把步数压到 50，Consistency Models 压到 1 步。
2. **训练算力消耗大**：比 VAE 大一个量级。论文在 8 块 V100 上训了几天。
3. **只能处理连续数据**：高斯噪声适合像素，但文本是离散的 token，不能直接加噪声。需要 Discrete Diffusion 等新框架。
4. **生成质量在高分辨率上仍需改进**：256×256 的 LSUN 结果接近 ProgressiveGAN 但还不够超越，需要 Improved DDPM（cosine schedule + 更好的 U-Net）来补足。

## 学到了什么

1. **困难任务可以转成噪声回归**——任何"从分布采样"的问题都可以包装成"预测噪声"的 MSE 回归。这个思路后来被复用到文本生成、蛋白质折叠、视频生成等几乎所有模态。
2. **闭式公式是训练能 scale 的关键**——如果没有 q(x_t | x₀) 的闭式表达，就无法直接跳到第 t 步，训练效率会降 1000 倍。以后遇到任何迭代过程，先问"能不能一步跳到第 t 步"。
3. **简单 loss + 大算力 > 复杂 loss + 小算力**——DDPM 把完整的 ELBO 简化为 MSE，理论上"次优"但实际效果更好。这是"The Bitter Lesson"的又一个案例。
4. **范式起点 > 优化点**——DDPM 是范式起点（让 diffusion 能跑），DDIM / EDM / Consistency Models 都是优化点。范式起点的论文影响最深，因为后续所有工作都站在它之上。

## 历史脉络

- **2015**：Sohl-Dickstein（Stanford）从非平衡热力学出发提出 diffusion 思想——"加噪是 Markov 链，去噪也是 Markov 链"。理论很美，但只在玩具数据集上跑过。
- **2019**：Song & Ermon 从 score matching 切入提出 NCSN，与 diffusion 是对偶视角。
- **2020.6**：Ho、Jain、Abbeel（Berkeley）发表本文。配上 U-Net + reparameterization + 简化 MSE loss，第一次跑出能打的图。
- **2021**：Improved DDPM（cosine schedule）+ DDIM（50 步采样）+ classifier-free guidance 三件套接连出现。
- **2022**：Latent Diffusion → Stable Diffusion 开源放生态；DALL-E 2、Imagen 把文生图工程化。
- **2024**：DiT / SD3 / Sora —— transformer 替换 U-Net，文生图、文生视频成主流。

从 2015 年的"理论玩具"到 2024 年的"Sora 60 秒视频"，核心训练范式没变过——还是 DDPM 那 5 行循环。

## 延伸阅读

- 论文原文：[arXiv 2006.11239](https://arxiv.org/abs/2006.11239)（22 页，数学密度高，先看 Algorithm 1/2 再回头读推导）
- 官方 TensorFlow 实现：[hojonathanho/diffusion](https://github.com/hojonathanho/diffusion)
- PyTorch 复刻（社区事实标准）：[lucidrains/denoising-diffusion-pytorch](https://github.com/lucidrains/denoising-diffusion-pytorch)
- 视频教程：[Yannic Kilcher — DDPM Paper Explained](https://www.youtube.com/watch?v=W-O7AZNzbzQ)（30 分钟把数学讲透）
- 工业级实现：[HuggingFace Diffusers](https://github.com/huggingface/diffusers)（DDPM scheduler 是现代文生图代码的基本起点）
- 延伸阅读：[[ddim-2020]]（DDIM 把采样压到 50 步）、[[stable-diffusion]]（DDPM 的工业化版本）、[[dit]]（把 U-Net 换成 transformer）
