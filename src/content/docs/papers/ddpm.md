---
title: DDPM Denoising Diffusion Probabilistic Models
来源: Ho et al., "Denoising Diffusion Probabilistic Models", NeurIPS 2020 / arXiv 2006.11239
---

## 一句话总结

DDPM 把 Sohl-Dickstein 2015 提出的"用一条 Markov 链一步步加噪、再训神经网络一步步去噪"的扩散思想，配上现代 U-Net 与 reparameterization，跑出了第一个真正能打 GAN 的扩散生成模型。三件套——**前向闭式 q(x_t | x_0)**、**ε-prediction 参数化**、**简化的 MSE loss L_simple**——把一个看起来像随机过程论文的东西，拍成了"采一个 t、采一份噪声、回归一下噪声"的几行训练循环，并直接成为后来所有 GLIDE / DALL-E 2 / Stable Diffusion / Imagen / DiT / Sora 的祖先。

## 历史定位

要理解 DDPM 的位置，要把生成模型的几条主线串起来。

- **2014 GAN (Goodfellow)**：第一代主流生成模型。生成器 vs. 判别器对抗训练。出图清晰但训练不稳，模式崩塌（mode collapse）严重。
- **2014 VAE (Kingma & Welling)**：变分自编码器。训练稳，提供 likelihood，但出图糊。
- **2015 Deep Unsupervised Learning using Nonequilibrium Thermodynamics (Sohl-Dickstein et al.)**：从非平衡热力学出发，提出 diffusion 思想——"加噪是 Markov 链，反过来去噪也是 Markov 链"。理论优雅但当年没人能跑出像样的图。
- **2019 NCSN / Score-Based (Song & Ermon)**：从 score matching 角度切入，与 diffusion 互为对偶。引入 noise-conditional score network。
- **2020 DDPM (Ho et al.，本文)**：用现代 DL 工具（U-Net、Adam、reparameterization、large compute）把 Sohl-Dickstein 的思想第一次工程化跑通。CIFAR-10 FID 3.17，与 BigGAN 持平。
- **2021 Improved DDPM (Nichol & Dhariwal)**：cosine schedule + 学 Σ + L_hybrid。
- **2021 DDIM (Song et al.)**：把随机采样改成确定性（implicit），50 step 就能逼近 1000 step 的质量。
- **2021 Diffusion Models Beat GANs (Dhariwal & Nichol, ADM)**：classifier guidance + 更大 U-Net，diffusion 第一次明确超越 BigGAN。
- **2021 classifier-free guidance (Ho & Salimans)**：训练一个网络同时学 conditional + unconditional，推理时按系数线性外推。后续所有文生图都默认这套。
- **2022 GLIDE / DALL-E 2 / Imagen**：把 diffusion + 文本条件做工程化（OpenAI / Google）。
- **2022 Latent Diffusion / Stable Diffusion (Rombach et al.)**：把扩散搬到 VAE latent 空间，效率高一个量级，并开源放生态。
- **2023 DiT (Peebles & Xie)**：U-Net 换成 transformer。
- **2024 Sora / Stable Diffusion 3 / Flux**：DiT 系，文生视频 / 文生图主流。

DDPM 在这条链里的角色就是**祖先**。今天打开任何主流文生图 / 文生视频的代码，去 `forward` / `q_sample` / `training_loss` 三个函数里找，几乎一字不差就是 DDPM 这篇里给的公式。

> 怀疑：DDPM 之前的 Sohl-Dickstein 2015 已经把数学全部写完了，DDPM 的"贡献"看起来更像"工程能跑+把 loss 简化"。这种"换皮"贡献在机器学习里能拿 NeurIPS 不少见，但放在物理或数学就难。是不是说明 ML 领域评判贡献的标准更偏向"有没有让东西跑起来"，而不是"有没有发明新理论"？

## Section 1：动机——为什么是 DDPM 让 diffusion 火起来

要看清 DDPM 的关键贡献，要先把它面对的"前任痛点"列清楚。

### 1.1 GAN 的问题

GAN 训练靠对抗。一个生成器 G 想骗判别器 D，D 想分辨真假。理论上 Nash 均衡时分布对齐，实际上：

- **训练不稳**：D 太强 → G 学不到梯度；G 太强 → D 拉不开两端。需要无数 trick（label smoothing、spectral norm、TTUR）。
- **模式崩塌**：G 倾向于只生成几个"安全"模式，覆盖不了真实分布的多样性。CIFAR-10 上经常 5 个类反复出现，另外 5 类被吞了。
- **没有 likelihood**：GAN 不直接给 p(x)，做密度估计 / 异常检测都难。

### 1.2 VAE 的问题

VAE 优化 ELBO，训练稳，给 likelihood。代价是出图糊：

- 高斯先验 + 高斯解码器 + ELBO 中的 reconstruction 项是 L2，**等价于在像素空间里做高斯模糊**。
- latent 空间的"洞"（先验和后验对不齐的区域）让插值生成质量下降。

### 1.3 Sohl-Dickstein 2015 的问题

理论很美，工程难跑：

- 他用 binary 数据和 swissroll 这种小玩具数据集做实验，没在真实图像上跑出像样结果。
- 当时还没有大 U-Net、没有 reparameterization 的简化 loss、没有 GPU 训练 1.7M 步的体力。
- 论文偏物理风，AI 圈大部分人没消化。

### 1.4 DDPM 做了什么

把上面三条全部一次性解决：

1. 用 **U-Net + sinusoidal time embedding** 当 ε_θ。
2. 给出 forward closed-form q(x_t | x_0)，让任意 t 步可以一行代码采样，不需要走 t 步 Markov 链。
3. 给出 **ε-prediction** 参数化：神经网络不预测 μ_θ，预测加进去的噪声 ε。
4. **简化 loss L_simple**：把 ELBO 里的所有 KL / 权重项扔掉，只留下 || ε - ε_θ ||² 的 MSE。
5. 用 1.7M 步 × T=1000 × 大 batch 训出 CIFAR-10 FID 3.17，与 BigGAN 持平。

> 怀疑：DDPM 的成功是不是主要靠"L_simple = MSE 而不是完整 ELBO"这一刀？论文 §3.4 自己也承认 L_simple 在数学上不是合法的 lower bound，但实验更好。所以 DDPM 真正的贡献到底是数学（reparameterization）还是 empirical hack（去权重）？

## Section 2：核心定义

在进入数学之前，给一个直觉模型。

想象一张照片放在桌上，每过一秒钟，你撒一把盐糖混合在上面（盐糖是噪声）。一开始，图还认得出。10 秒后，糖盖住一半。100 秒后，全是盐糖看不见图了。这是**前向过程**。

现在反过来：给你一桌只剩盐糖的图，你能不能一秒秒擦回去，恢复出原图？人不行，但训一个神经网络可以——这是**反向过程**。

DDPM 数学化的关键，就是把这两个直觉过程严格定义成两条 Markov 链。

### Definition 1：前向（diffusion / 加噪）过程

给定一张真实图像 x_0，定义 T 步前向 Markov 链：

```
q(x_t | x_{t-1}) = N(x_t; sqrt(1 - β_t) * x_{t-1}, β_t * I)
```

- β_t 是预先设定的 noise schedule，β_1 = 1e-4, β_T = 0.02，T=1000，linear 插值。
- 每一步把上一步信号缩小 sqrt(1-β_t)，再加一份方差 β_t 的高斯白噪声。
- T 足够大、β_t 设得合适时，x_T 趋近 N(0, I)（纯噪声，与 x_0 无关）。

### Definition 2：反向（denoising）过程

学一个神经网络去拟合反向 Markov 链：

```
p_θ(x_{t-1} | x_t) = N(x_{t-1}; μ_θ(x_t, t), Σ_θ(x_t, t))
```

- 这是一个**待学**的分布。前向的 q 是已知（手动设的），反向的 p_θ 是网络要学的。
- 真实的反向后验 q(x_{t-1} | x_t, x_0) 可以推出闭式（高斯 × 高斯），但**它依赖 x_0**——而 x_0 正是我们要生成的，不能用。所以网络从 x_t 学一个近似。

### Definition 3：ε-prediction 参数化

DDPM 不让网络直接输出 μ_θ。改让网络输出**当初加进去的那份噪声 ε**：

```
ε_θ(x_t, t) ≈ ε   （where x_t = sqrt(α_bar_t) x_0 + sqrt(1-α_bar_t) ε）
```

然后用代数把 μ_θ 写成 ε_θ 的函数：

```
μ_θ(x_t, t) = (1 / sqrt(α_t)) * (x_t - β_t / sqrt(1 - α_bar_t) * ε_θ(x_t, t))
```

为什么这样改？三个原因：

1. **ε ~ N(0, I)** 永远是单位高斯，scale 不变，回归目标稳定。μ_θ 的目标随 t 变化巨大，loss 数值不稳。
2. **MSE 直接对 ε 训**，简单。
3. 实验上 ε-prediction 比 x_0-prediction 更稳更好。

> 怀疑：DDPM 之后 v-prediction（progressive distillation, Salimans & Ho 2022）和 EDM（Karras 2022）的 σ-conditioning 都说"ε-prediction 在小 t 数值不稳"。所以 ε-prediction 是 2020 年的最优解，2022 年就不是了。这是不是 DL 领域的常态——每个"defaults"都有 2-3 年寿命？

## Section 3：核心算法

### Section 3.1：前向闭式 q(x_t | x_0)

直接走 t 步 Markov 链很慢（T=1000 步要循环 1000 次）。论文给出闭式：

```
q(x_t | x_0) = N(x_t; sqrt(α_bar_t) * x_0, (1 - α_bar_t) * I)
```

其中：

- α_t = 1 - β_t
- α_bar_t = ∏_{s=1..t} α_s

含义：从 x_0 一步到 x_t，**一行代码**：

```
x_t = sqrt(α_bar_t) * x_0 + sqrt(1 - α_bar_t) * ε,   ε ~ N(0, I)
```

这是 DDPM 训练里最关键的一步。否则每个训练样本要走 1000 步前向，根本不可能扩展。

> 怀疑：closed-form 之所以成立，是因为 forward 是高斯链且独立，方差可加。如果改成非高斯链（比如 Laplace 噪声），还有闭式吗？后续的 cold diffusion / heat dissipation 论文用确定性退化也跑通了，说明高斯不是必须的。但闭式没了，训练就慢了。这是工程 vs 一般性的 trade-off。

### Section 3.2：variational lower bound

像所有变分模型一样，DDPM 优化 ELBO。展开后是一串 KL：

```
L_VLB = E_q [
  L_T  =  D_KL( q(x_T | x_0) || p(x_T) )            # x_T 应当是 N(0,I)
  + sum_{t>1} L_{t-1}  =  D_KL( q(x_{t-1} | x_t, x_0) || p_θ(x_{t-1} | x_t) )   # 每一步去噪都对得上真实后验
  + L_0  =  -log p_θ(x_0 | x_1)                     # 最后一步像 VAE 的重建项
]
```

- L_T 与 θ 无关（前向是固定的）。
- L_{t-1} 是核心项，T 个 KL 之和。
- L_0 是边界项，重建。

每个 L_{t-1} 都是两个高斯的 KL，可以解析算出，**得到关于 μ_θ 的二次损失**。再把 μ_θ 换成 ε_θ：

```
L_{t-1} = E_{x_0, ε} [ w_t * || ε - ε_θ(x_t, t) ||² ]
```

w_t 是依赖 β_t 的权重项。

### Section 3.3：简化 loss L_simple（论文 §3.4 关键 hack）

DDPM 实验发现：**把 w_t 全部扔掉（设为 1），效果反而更好**。

```
L_simple = E_{x_0, t, ε} [ || ε - ε_θ(x_t, t) ||² ]
         where t ~ Uniform(1, T), ε ~ N(0, I), x_t = sqrt(α_bar_t) x_0 + sqrt(1-α_bar_t) ε
```

直觉：

- L_VLB 的 w_t 在小 t（低噪声）时权重大，在大 t（高噪声）时权重小。
- 模型会被引导去优化"几乎是干净的图"那部分，而忽略真正难的高噪声步骤。
- 去掉 w_t 后，所有 t 等权重，模型被迫学好高噪声部分。
- 高噪声部分学好，整个采样链才稳。

> 怀疑：L_simple 严格来说**不是**ELBO，所以 DDPM 训出来的 likelihood 不能直接报。后续 Improved DDPM 用 L_hybrid = L_simple + λ * L_VLB 同时学 ε_θ 和 Σ_θ，才能报合法 NLL。这是不是说明 simple loss 是"sample 质量"和"likelihood"的取舍？这俩在 generative model 评测里经常打架。

### Section 3.4：训练算法（论文 Algorithm 1）

```
repeat:
    x_0  ~  data                              # 真实图像
    t    ~  Uniform({1, ..., T})              # 采一个时间步
    ε    ~  N(0, I)                           # 采一份噪声
    x_t  =  sqrt(α_bar_t) x_0 + sqrt(1-α_bar_t) ε   # 一行加噪到第 t 步
    take gradient descent step on:
        ∇_θ || ε - ε_θ(x_t, t) ||²
until converged
```

整个训练就是这 5 行。看不到 KL，看不到 ELBO，看不到 Markov 链。完全是个"回归噪声"的监督学习任务。

参考实现：

- 论文官方 TensorFlow 代码：[hojonathanho/diffusion/diffusion_tf/diffusion_utils_2.py @ 4748f4f3a3318d97186a127b0b4ab6dd2a4d56b1](https://github.com/hojonathanho/diffusion/blob/4748f4f3a3318d97186a127b0b4ab6dd2a4d56b1/diffusion_tf/diffusion_utils_2.py)（链接示意）。
- PyTorch 复刻（lucidrains 系列基本是 ML 圈"事实标准"）：[lucidrains/denoising-diffusion-pytorch @ 8d3a8e7c25b5f9a0b1c4e2d3f6a8b7c9e1d5f2a4](https://github.com/lucidrains/denoising-diffusion-pytorch/blob/8d3a8e7c25b5f9a0b1c4e2d3f6a8b7c9e1d5f2a4/denoising_diffusion_pytorch/denoising_diffusion_pytorch.py)（链接示意）。
- HuggingFace Diffusers 工业实现：[huggingface/diffusers @ 6f2b3c5e8a1d4f7c0b9e2d5a8c1f4b7e0d3a6c9f](https://github.com/huggingface/diffusers/blob/6f2b3c5e8a1d4f7c0b9e2d5a8c1f4b7e0d3a6c9f/src/diffusers/schedulers/scheduling_ddpm.py)（链接示意）。

![DDPM forward / reverse Markov chain](/papers/ddpm/01-forward-reverse.webp)

### Section 3.5：采样算法（论文 Algorithm 2）

训练完后，怎么生图？从纯噪声出发，迭代 T 步：

```
x_T  ~  N(0, I)
for t = T, T-1, ..., 1:
    z   ~  N(0, I)  if t > 1 else 0
    x_{t-1}  =  (1 / sqrt(α_t)) * ( x_t - β_t / sqrt(1 - α_bar_t) * ε_θ(x_t, t) )  +  σ_t * z
return x_0
```

直觉：

- 每一步：拿当前 x_t 给网络，网络预测"这里头有多少噪声 ε_θ"，把这份噪声从 x_t 里减掉一点（只减一点，因为整个噪声不是一步加的，是 T 步累积的）。
- 再加一点新噪声（σ_t * z），让采样保持随机性，避免直接坍缩到平均图。
- 走 T 步后得到 x_0。

T=1000 步意味着推理一张图要跑 1000 次 U-Net 前向。慢。这是 DDPM 最大的工程缺点，也是后来 DDIM / progressive distillation / consistency models 一路解决的方向。

> 怀疑：T=1000 这个数是论文超参网格搜索出来的最优，但 DDIM 后来证明 50 步能达到接近的质量。所以 1000 不是"采样质量需要"，而是"训练时为了让 forward 链足够细致"。训练 T 和推理 T 能不能解耦？后续 DDIM 给出"是"。原始 DDPM 的 1000 是不是 over-engineered？

![DDPM loss derivation: ELBO -> simple noise prediction](/papers/ddpm/02-loss-derivation.webp)

## Section 4：实验

### 4.1 数据集 + 模型

- **CIFAR-10** 32×32：FID 3.17（unconditional），与 BigGAN（FID 14.7 unconditional / 4.06 conditional）相比已经是 SOTA。
- **CelebA-HQ** 256×256：FID 7.89。
- **LSUN Bedrooms / Churches** 256×256：高质量样本，没报 FID（缺 reference）。

### 4.2 模型规模

- U-Net：4-5 个 resolution level，每个 level 有 ResNet block × 2，attention 在 16×16 分辨率。
- CIFAR-10：35.7M 参数。
- CelebA-HQ 256：~256M 参数。
- 训练步数：CIFAR-10 800K iter，CelebA-HQ 500K iter。

### 4.3 对比

| Model | CIFAR-10 FID (unconditional) | 备注 |
|-------|-----------------------------:|------|
| BigGAN-deep | 14.7 | conditional 4.06 |
| StyleGAN2 + ADA | 3.26 | 当时最强 GAN |
| **DDPM (本文)** | **3.17** | 与 SOTA GAN 持平/略好 |

DDPM 是**第一个**在 CIFAR-10 上明确追平 SOTA GAN 的扩散模型，这一战让 diffusion 进入主流视野。

### 4.4 消融

论文表 2 给出 ε-prediction vs μ-prediction 的对比：

- ε-prediction + L_simple：FID 3.17（最好）。
- μ-prediction + L_simple：FID 6.96。
- ε-prediction + L_VLB：FID 13.51（更糟，validates §3.4 的 hack）。

> 怀疑：L_simple > L_VLB 这个结论被反复引用，但当时只在 CIFAR-10 / 32×32 上验证过。之后 Improved DDPM 在大模型大分辨率下又调回 L_hybrid。所以"L_simple 最好"的结论是不是只在小模型上成立？

### 4.5 训练曲线观察

论文里没单独画 loss 曲线，但社区复现里 ε-prediction 的 loss 大概落在 0.02-0.05 区间，且非常平稳——不像 GAN 那样上下震荡或崩塌。这背后是两个原因：

1. **MSE 是凸损失**（对单点，loss landscape 平滑），梯度方向稳。
2. **训练目标永远是 N(0, I)**，target 不漂移。

这种"训练像监督学习一样无聊"的特性，是 DDPM 相对 GAN 的最大工程优势——开发者可以用平时调 ResNet 的直觉来调 diffusion，不用专门为对抗训练加一堆 trick。

### 4.6 采样质量随步数变化

论文图 7 给出："随机采样到第 t 步停下，看 x_t 长什么样"的可视化。结果：

- t = T = 1000：纯噪声，看不出任何结构。
- t = 750：开始浮现大色块，能感觉到"图的轮廓"。
- t = 500：物体大体出现，但细节糊。
- t = 250：物体清晰，纹理还在打磨。
- t = 0：完全清晰。

这是个直观的 demo——前 1/4 步是确定大局（low-frequency / coarse structure），后 3/4 步是打磨细节（high-frequency / fine details）。

> 怀疑：如果模型在不同 t 上学到的能力不同（前段管大局，后段管细节），那理论上可以**对不同 t 训不同子网络**？后续的 eDiff-I (Balaji 2022) 和 SDXL 的 multi-expert 实际上就是这个思路。是不是说明"单网络管所有 t"在 DDPM 里只是简化，长期会被打破？

## Section 5：noise schedule 设计

### 5.1 linear schedule（DDPM 原始）

```
β_1 = 1e-4
β_T = 0.02
β_t = linear interpolate
T = 1000
```

直觉：t 越大噪声越多，到 T 时累积总噪声 1 - α_bar_T ≈ 1（信号几乎全没）。

### 5.2 cosine schedule（Improved DDPM, Nichol & Dhariwal 2021）

linear schedule 在小分辨率（CIFAR-10 32×32）够用，但到 256×256 就有问题——太早把信号毁完。Improved DDPM 提出 cosine schedule：

```
α_bar_t = cos²( ((t/T + s) / (1 + s)) * π/2 )
```

让 α_bar_t 在前期变化慢、中期变化快、后期再慢。视觉上：信号被"温柔"地破坏，最后几步还有结构保留。

### 5.3 后续 schedule 演化

- **EDM (Karras 2022)**：用 σ（noise std）作为唯一时间变量，把 schedule 写成 σ_t 序列。理论统一了 score matching 与 diffusion。
- **Rectified Flow (Liu 2022)**：训练时直接学"从 noise 到 data 的直线 ODE"，schedule 退化为 linear interpolation。

> 怀疑：schedule 是个被低估的超参——它的影响和 model size 一样大。但论文里通常一笔带过，只给"我们用 X schedule"。是不是因为 schedule 是连续函数，搜索空间太大，没法 grid search？

### 5.4 SNR 视角

最近几年的 diffusion 论文倾向于**不再讲 β_t / α_bar_t**，改讲 **signal-to-noise ratio (SNR)**：

```
SNR(t) = α_bar_t / (1 - α_bar_t)
```

- SNR 大 = 信号占主导（小 t）。
- SNR 小 = 噪声占主导（大 t）。
- log-SNR 是常用的更对称的变量。

这个角度让不同 schedule 之间的对比变得清晰：

- linear β：log-SNR 在前期下降快，后期下降慢。
- cosine：log-SNR 整体更线性。
- EDM：直接 parametrize log-SNR 为均匀分布。

更进一步：训练目标也可以重写为"对 log-SNR 区间均匀采样"，理论上等价于"对 t 加合适权重采样"。这条线索把 schedule 与 loss weighting 统一进同一个超参——σ 域。

### 5.5 离散 t vs 连续 t

DDPM 用离散 t ∈ {1, ..., T}。Score-based / EDM 用连续 t ∈ [0, 1]。两者在大 T 极限下等价，但工程实现差异：

- **离散版**：训练时采 t ~ Uniform{1, ..., 1000}，模型有 1000 个时间嵌入位置。
- **连续版**：训练时采 t ~ Uniform[0, 1]，时间嵌入是连续函数（Fourier features）。

连续版在采样器选择上更灵活（任何 ODE 步长），但实现复杂。工业界（Stable Diffusion）大多用 1000 步离散 + DDIM 重新插值，简单可靠。

## Section 6：后续工作 + 影响

### 6.1 直接技术后继

- **Improved DDPM** (Nichol & Dhariwal 2021)：cosine schedule + 学 Σ_θ + L_hybrid + 报合法 NLL。
- **DDIM** (Song et al. 2021)：把随机采样改成确定性 ODE，可以 50 step 出图，且支持 deterministic interpolation。
- **classifier-free guidance** (Ho & Salimans 2021)：训练时 10% 概率丢掉 condition，推理时按系数线性外推 conditional 与 unconditional。所有现代文生图默认 trick。
- **ADM** (Dhariwal & Nichol 2021，"Diffusion Models Beat GANs"): classifier guidance + scaled U-Net，diffusion 第一次在 ImageNet 256 / 512 上明确超越 BigGAN。
- **EDM** (Karras 2022): 把 score-based 与 diffusion 统一进 σ-conditioning + preconditioning + Heun sampler 框架。
- **Progressive Distillation** (Salimans & Ho 2022): 把 1000 step 蒸馏到 1 step，引入 v-prediction。
- **Consistency Models** (Song 2023): 1-step / few-step 采样，不靠蒸馏。

### 6.2 应用层

- **GLIDE** (OpenAI 2021): text-to-image diffusion + classifier-free guidance。
- **DALL-E 2 / unCLIP** (Ramesh et al. 2022): two-stage diffusion (prior + decoder)，CLIP latent 当桥梁。
- **Imagen** (Saharia et al. 2022, Google): T5 文本编码 + cascade diffusion。
- **Latent Diffusion / Stable Diffusion** (Rombach et al. 2022): 把 diffusion 搬到 VAE latent 空间，开源放生态。
- **DiT** (Peebles & Xie 2023): transformer 替代 U-Net，scalability 更好。
- **Sora** (OpenAI 2024): DiT + 时空 patch + temporal attention，文生视频。
- **Stable Diffusion 3 / Flux** (2024): MMDiT，文本和图像两路 transformer 互相 cross-modulate。

### 6.3 跨模态扩展

- **Audio**: WaveGrad (Chen 2020)、DiffWave (Kong 2020) 用 DDPM 思想做语音。
- **Molecule / Protein**: AlphaFold 后续的 RFdiffusion 用 diffusion 生成蛋白结构。
- **Robotics**: Diffusion Policy (Chi 2023) 用 diffusion 生成动作序列。
- **Discrete data**: Discrete Diffusion (Austin 2021) 把 ε ~ N 改成 categorical 噪声，用于离散 token（文本）。

### 6.4 工业级影响

DDPM 之后短短 4 年（2020 → 2024），diffusion 把生成式 AI 重新定义：

- 文生图从"GAN 模糊小图" → "扩散 SOTA 真实大图"。
- 文生视频从"几乎不存在" → "Sora 60 秒高清"。
- 工程方面：U-Net、ε-prediction、classifier-free guidance、CFG、scheduler 这些词成了 ML 工程师的日常。
- 开源生态：HuggingFace Diffusers 库基本是 DDPM 这一系工程化的标准实现，几百万次下载。

## Section 6.5：U-Net 架构细节

DDPM 用的 U-Net 与原始 Ronneberger 2015 的 U-Net 有明显区别。值得专门拆开看一下，因为这是后续所有 diffusion 工作的标配 backbone。

### 6.5.1 整体形状

```
input (32, 32, 3)
  -> conv 3x3 -> (32, 32, 128)
  -> ResBlock x 2 + Downsample -> (16, 16, 256)
  -> ResBlock x 2 + Attention(16x16) + Downsample -> (8, 8, 256)
  -> ResBlock x 2 + Downsample -> (4, 4, 512)
  -> ResBlock x 2 (bottleneck) -> (4, 4, 512)
  -> ResBlock x 2 + Upsample -> (8, 8, 512)
  -> ResBlock x 2 + Attention(16x16) + Upsample -> (16, 16, 256)
  -> ResBlock x 2 + Upsample -> (32, 32, 128)
  -> conv 3x3 -> (32, 32, 3)  # output ε prediction
```

每一层 ResBlock 接收 **time embedding**（sinusoidal 编码 + MLP）作为 conditioning，方式是把 t 的 embedding 加到 ResBlock 的中间 activation 上。

### 6.5.2 几个关键设计

- **time embedding 注入每一层**：保证模型在每个 resolution 都知道当前 t。
- **attention 只在中等分辨率**（16×16）：太高分辨率（32×32 全图）attention 计算量爆炸，太低分辨率（4×4）attention 又退化为 MLP。中等分辨率是甜蜜点。
- **GroupNorm 而不是 BatchNorm**：BN 在小 batch 时不稳，diffusion 训练 batch 不一定大。
- **swish 激活**：比 ReLU 平滑，对 ε 这种零均值目标更友好。

> 怀疑：U-Net 的"下采样 + 上采样 + skip"结构是不是 diffusion 的必需？DiT 后来用 transformer 完全替掉，证明不是。但在数据量有限的医疗影像 / 天气预测领域，U-Net 仍占优。所以归纳偏置（局部性、多尺度）和数据量是 trade-off。

## Section 7：限制

DDPM 强，但限制也明确：

1. **推理慢**：T=1000 step × U-Net forward。即使后续 DDIM 把它降到 50，仍然比 GAN（1 步）慢一两个数量级。Real-time 视频生成（30 fps）很久之后才解决。
2. **训练算力大**：CIFAR-10 800K iter × batch 128 × 35M U-Net，单卡要几天。CelebA-HQ 256 是几十 GPU-day。后来的 Stable Diffusion 是 256 × A100 × 几个月。
3. **样本 sharpness 早期不及 GAN**：DDPM 在 FID 上追上 BigGAN，但人眼看时仍觉得 GAN 出图"更锋利"。要到 ADM + classifier guidance 才视觉上明确超越。
4. **高分辨率需要 cascade**：1024×1024 生图原始 DDPM 直接训不动，要分多阶段（base → upsample × 2 × 2）。Imagen 用了 3 级 cascade。
5. **离散数据不适用**：原始 DDPM 噪声是高斯，对图像 / 音频可以，对离散 token（文本）不行。要 Discrete Diffusion / Argmax Flow 这种新框架。
6. **likelihood 不是合法 ELBO**：L_simple 不是 lower bound，所以 DDPM 报的 NLL 实际是 L_simple 数值，不能与 VAE / autoregressive model 直接比。
7. **缺少 inversion**：从一张真实图反推 latent（GAN inversion 那种）在原始 DDPM 不平凡，要 DDIM inversion 才能稳定。

> 怀疑：DDPM 的"慢"是不是 fundamental 的？它本质是个 stochastic differential equation 的 numerical solver，T 步是数值精度需要。Consistency Models 直接 1 步出图，但训练时实际是用 multistep teacher 蒸馏出来的——也就是说，"快速采样"是 post-hoc 的工程优化，不是 DDPM 框架自带的能力。这是不是说明 diffusion 的"慢"是个范式特征？

## Section 8：从 DDPM 看研究方法

DDPM 这篇论文的写作可以当成"理论 + 工程"两条腿走路的范本来读。

### 8.1 它从理论出发

§2 - §3.3 全部是数学：Markov 链、ELBO、KL、reparameterization。每一步都有推导。

### 8.2 但它在 §3.4 来了个工程 hack

L_VLB → L_simple，**没有理论保证更好**，纯靠"我们试了 L_simple 效果好"。这一刀让模型实际能训。

### 8.3 实验设计紧凑

只在 4 个数据集上跑（CIFAR-10、CelebA-HQ 256、LSUN-Church、LSUN-Bedroom），但每个都说明一件事：

- CIFAR-10：追上 SOTA GAN。
- CelebA-HQ：高分辨率人脸可行。
- LSUN：高分辨率自然场景可行。

没有刻意刷 10 个数据集，没有冗余消融。

### 8.4 代码开源 + 复现性

[hojonathanho/diffusion](https://github.com/hojonathanho/diffusion) 公开了 TensorFlow 实现，配置完全可复现。这让 lucidrains 等人能在两周内做出 PyTorch 版，一个月内 Improved DDPM 和 DDIM 就跟着出来——**开源加速了整个领域**。

> 怀疑：DDPM 论文写得简洁 + 代码开源 → 半年内整个 diffusion 子领域起飞。是不是说明 ML 论文的影响力，工程贡献和理论贡献几乎同等重要？反例：很多理论非常漂亮但没开源代码的论文（GAN 早期的某些理论分析），影响力远不如 DDPM。

## 学到什么

读 DDPM，几个能直接复用到其他场景的模式：

### 1. closed-form 是工程救星

前向闭式 q(x_t | x_0) 是整个训练能 scale 的关键。没有它，每个样本要跑 1000 步 forward，不可能训。**当看到一个迭代过程时，先问：能不能直接跳到第 t 步？** 这个问题在 RL（多步轨迹）、optimization（多步迭代）、numerical methods（多步 ODE）都是一样的。

### 2. reparameterization 让损失稳定

ε-prediction 把网络的回归目标固定在 N(0, I)，无论 t 是 1 还是 1000。比起让网络去回归"scale 不固定的 μ_θ"，数值上稳得多。**当训练不稳时，先看 loss 数值范围是否随某个变量剧烈变化**。如果是，找一个等价的、scale 不变的目标。

### 3. theoretically suboptimal 可能 empirically optimal

L_simple 不是合法 ELBO 但效果更好。这种"理论次优、实际最优"在 ML 里很常见（比如 RL 里 PPO 的 clipping 在理论上不严密，但稳）。**遇到这种情况，先别强行用理论那套，先信实验。**

### 4. 简单 loss + 大算力 > 复杂 loss + 小算力

DDPM 的 loss 简单到一行 MSE，但训了 800K 步、35M 参数。这背后是 deep learning 整个时代的元教训——"the bitter lesson"（Sutton）。**当你想加正则、加约束、加复杂的 loss 时，先问：增加算力或数据是不是更直接？**

### 5. schedule 是被低估的超参

cosine schedule 不改任何模型结构，只改 β_t 函数，FID 就大幅提升。**类似的"形状"超参（learning rate schedule、warmup、weight decay schedule）经常比模型结构改动影响更大**。

### 6. 范式起点 vs 优化点

DDPM 是范式起点（让 diffusion 能跑），DDIM / EDM / Consistency Models 是优化点（让它跑得快）。**范式起点的论文影响最深**，因为后续所有人都得基于它。判断一篇论文是不是范式起点：看它之后 1-2 年内有没有一群论文都引它做基础。

## 关联

- [[clip]] CLIP 的对比学习、CLIP latent 是后来 DALL-E 2 / unCLIP 的桥梁，diffusion + CLIP 是文生图标准组合。
- [[vit]] ViT 把 transformer 引入视觉 backbone，是后来 DiT 把 U-Net 换成 transformer 的前提。
- [[mae]] MAE 用 mask + 重建做自监督预训练，与 diffusion 用噪声 + 去噪有内在相似（都是 corruption + reconstruction）。
- [[sam]] SAM 是图像分割大模型，与 diffusion 的图像生成是图像理解的两面。
- [[dino]] DINO 自监督，与 diffusion 共享"利用大数据无标签"的元思路。
- [[stable-diffusion]] Stable Diffusion 是 DDPM 的工业化版本，把扩散搬到 VAE latent 空间。
- [[dalle-2]] DALL-E 2 / unCLIP 是 DDPM + CLIP 的两阶段文生图。
- [[dit]] DiT 把 DDPM 的 U-Net 换成 transformer，是从 DDPM 范式到 transformer 范式的过渡。
