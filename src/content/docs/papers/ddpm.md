---
title: DDPM — Denoising Diffusion Probabilistic Models
来源: 'Ho et al., "Denoising Diffusion Probabilistic Models", NeurIPS 2020'
日期: 2026-05-29
分类: 生成模型
难度: 中级
---

## 是什么

DDPM（**去噪扩散概率模型**）是 UC Berkeley 在 2020 年发的一篇生成模型论文。它做的事很怪但很简单：**先把一张清晰图片一步步加噪声，加到全是雪花，再训神经网络一步步把雪花反推回原图**。

日常类比：

> 拿一张清晰的猫照片，每秒往上撒一把雪花，撒 1000 秒后整张图都是雪花看不见猫了。然后训练 AI："看这张全是雪花的图，反过来一秒一秒擦，最后猫得长出来。" AI 学会反推之后，给它一张**纯雪花图**（其实是随机噪声），它就能"擦"出一只**新猫**——一只它从没见过的猫。

这个"加噪 → 去噪"的训练范式就是 diffusion。DDPM 不是最早提出 diffusion 的论文（2015 年已有理论雏形），但它是**第一次在 CIFAR-10 等标准基准上把 FID 追平主流 GAN** 的工程实现。

## 为什么重要

不理解 DDPM，下面这些事都解释不了：

- 为什么 [[stable-diffusion]] / [[dalle-2]] / Midjourney / Sora 突然就能画图、画视频——它们底子全是 DDPM 这套
- 为什么 diffusion 比 GAN 训练稳——GAN 经常**模式崩塌**（mode collapse，只生成几个安全模式），diffusion 像普通监督学习一样平稳下降
- 为什么后续 [[dit]] / Latent Diffusion / Consistency Models 能站在 DDPM 肩上不断迭代——DDPM 给了一个**数学清晰**的底座（基于变分下界，可推导）
- 为什么 2015 年就有人提过 diffusion 没人理，2020 年 DDPM 一出现就引爆——光有理论不够，要有人把它**工程化跑通**

## 核心要点

DDPM 的整套流程拆成 **三步**：

1. **前向加噪（forward process）**：每一步往图上加一点点高斯噪声，T=1000 步后图变成纯噪声。这一步**不需要训练**，是固定的数学过程。

2. **反向去噪（reverse process）**：训一个神经网络（U-Net），输入"一张带噪声的图 + 当前是第几步（timestep t）"，输出"这张图里有多少噪声"。然后把这部分噪声减掉一点，得到稍微干净一点的图。

3. **损失函数（loss）**：让网络预测的噪声和真实加进去的噪声尽量像。具体就是 **MSE**（均方误差）——预测噪声 vs 真实噪声的差的平方。一行公式，一个监督学习任务。

整个训练循环只有 5 行代码：采一张真图、采一个 t、采一份噪声、加噪到第 t 步、回归预测的噪声。看不到 Markov 链、看不到 ELBO、看不到 KL，干净得像在训 ResNet。示意如下：

```
x0 = sample_image()
t  = uniform(1..T)
ε  = sample_noise()
xt = add_noise(x0, ε, t)   # 闭式一步跳到第 t 步
loss = MSE(unet(xt, t), ε) # 预测噪声 vs 真噪声
```

关键细节：前向有闭式公式 q(x_t | x_0)，所以训练时**不必**从 0 逐步加到 t，直接跳到随机 t 即可——这是 DDPM 能 scale 的工程前提。

## 实践案例

### 案例 1：CIFAR-10 上跑 1000 步生图

DDPM 在 32×32 的 CIFAR-10 上：

- **训练**：U-Net 约 35M 参数，约 800K 迭代步；每步采一张真图、一个随机 t、一份噪声，用 MSE 回归噪声。
- **推理（逐步）**：① 采纯噪声 x_T；② 对 t = T…1，把 (x_t, t) 送进 U-Net 得到噪声预测；③ 按公式减噪得到 x_{t-1}；④ 循环结束后输出 x_0。
- **结果**：FID 3.17，与当时最强无条件 GAN（StyleGAN2 + ADA 的 3.26）基本持平。

这是扩散模型**第一次**在标准图像基准上追平 SOTA GAN，让整个 ML 圈意识到："diffusion 不是玩具了。"

### 案例 2：U-Net 看到的是什么

每一步推理时，U-Net 收到两份输入：

- **一张噪声图**（某个 timestep t 的中间产物）
- **t 本身**（用 sinusoidal encoding 编码成向量，注入每一层）

U-Net 输出**和输入同尺寸**的一张"噪声预测图"——告诉你"这张图里我觉得每个像素藏了多少噪声"。把这份预测从 x_t 里减掉一点，就得到 x_{t-1}。

### 案例 3：训练曲线像 ResNet，不像 GAN

GAN 的 loss 曲线经常上下震荡甚至崩塌，需要无数 trick（label smoothing、spectral norm、TTUR）才能稳。DDPM 的 MSE loss：

- 缓慢下降，到某个值后稳定
- 没有"判别器太强生成器学不动"这种死锁
- 调超参像调普通监督学习——同样的直觉就够用

这种"无聊但稳"是工程师最爱的特性，也是 diffusion 后来横扫整个生成式 AI 的工程理由。

## 踩过的坑

1. **推理慢**：T=1000 步意味着生一张图要跑 1000 次 U-Net 前向。GAN 一步出图，DDPM 慢两个量级。后来 DDIM（50 步）、Consistency Models（1 步）才解决。

2. **L_simple 不是合法 likelihood**：DDPM 的简化 MSE loss 抛掉了完整变分下界里的权重项，所以训出来的模型**不能直接报 NLL**。Improved DDPM 用 L_hybrid 才补回这块。

3. **schedule 是隐藏超参**：DDPM 用 linear β（1e-4 到 0.02），在 32×32 够用。但到 256×256 信号毁得太快，要 cosine schedule 才行——这是 Improved DDPM 的关键改动。

4. **离散数据用不了**：原始 DDPM 噪声是高斯，加在像素 / 音频上 OK。加在文本 token 上不行——要 Discrete Diffusion 这种新框架。

## 适用 vs 不适用场景

**适用**：
- 高质量图像生成（CIFAR / FFHQ / LSUN / 各种文生图）
- 训练稳定性比推理速度更重要的场景（科研、离线生成）
- 需要多样性的场景（diffusion 不易模式崩塌，覆盖分布更全）
- 多模态条件生成（文本 → 图、文本 → 视频、文本 → 蛋白结构）

**不适用**：
- 实时推理（DDPM 原版 1000 步太慢，要靠 DDIM / 蒸馏才能落地）
- 离散 token 生成（直接用文本 LLM 更简单）
- 计算资源极少（DDPM 训练算力比 VAE 大一个量级）

## 历史小故事（可跳过）

- **2015 年**：Sohl-Dickstein 在斯坦福从非平衡热力学出发提出 diffusion 思想——"加噪是 Markov 链，去噪也是 Markov 链"。理论很美，只在玩具数据集上跑过，没人能在真实图像上做出像样结果。
- **2019 年**：Song & Ermon 从 score matching 切入提出 NCSN，与 diffusion 是对偶视角。
- **2020 年**：Ho、Jain、Abbeel 在 Berkeley 把 Sohl-Dickstein 的思想配上 U-Net + reparameterization + 简化 MSE loss，第一次跑出能打 GAN 的图。**DDPM 就是这篇**。
- **2021 年**：Improved DDPM（cosine schedule）+ DDIM（50 步采样）+ classifier-free guidance（文生图必备 trick）三件套接连出现。
- **2022 年**：Latent Diffusion → [[stable-diffusion]] 开源放生态；DALL-E 2、Imagen 把文生图工程化。
- **2024 年**：[[dit]] / SD3 / Sora —— transformer 替换 U-Net，文生图、文生视频成主流。

整条线从 2015 年的"理论玩具"到 2024 年的"Sora 60 秒视频"，**核心训练范式没变过**——还是 DDPM 那 5 行循环。

## 学到什么

1. **加噪 + 去噪是一种监督学习包装**——任何"困难的生成任务"都可以转成"对噪声的回归"，这种 trick 在多模态、机器人动作、蛋白结构上都已复用
2. **闭式（closed-form）能让训练 scale**——前向 q(x_t | x_0) 的闭式公式让"采一个 t 直接跳过去"成为可能，没这个就没法训。**遇到迭代过程时先问"能不能跳到第 t 步"**
3. **简单 loss + 大算力 > 复杂 loss + 小算力**——DDPM 把完整 ELBO 简化成 MSE，理论上"次优"但实际更好。这是 The Bitter Lesson 的又一案例
4. **范式起点 > 优化点**——DDPM 是范式起点（让 diffusion 能跑），DDIM / EDM / Consistency Models 都是优化点。范式起点的论文影响最深，因为后续所有工作都站在它之上

## 延伸阅读

- 论文：[arXiv 2006.11239](https://arxiv.org/abs/2006.11239)（22 页，数学密度高，先看 Algorithm 1/2 再回头读推导）
- 官方 TensorFlow 实现：[hojonathanho/diffusion](https://github.com/hojonathanho/diffusion)
- PyTorch 复刻（社区事实标准）：[lucidrains/denoising-diffusion-pytorch](https://github.com/lucidrains/denoising-diffusion-pytorch)
- 视频教程：[Yannic Kilcher — DDPM Paper Explained](https://www.youtube.com/watch?v=W-O7AZNzbzQ)（30 分钟把数学讲透）
- 工业级实现：[HuggingFace Diffusers](https://github.com/huggingface/diffusers)（DDPM scheduler 是现代文生图代码的基本起点）

## 关联

- [[stable-diffusion]] —— DDPM 的工业化版本，把扩散搬到 VAE latent 空间
- [[dalle-2]] —— DDPM + CLIP 的两阶段文生图
- [[dit]] —— 把 DDPM 的 U-Net 换成 transformer，scalability 更好
- [[clip]] —— CLIP latent 是 DALL-E 2 / 文生图的桥梁，与 diffusion 是标准搭档
- [[vit]] —— ViT 把 transformer 引入视觉 backbone，是 DiT 把 U-Net 换成 transformer 的前提
- [[mae]] —— mask + 重建做自监督，与 diffusion 的"加噪 + 去噪"内在相似（都是 corruption + reconstruction）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[dalle-2]] —— DALL-E 2 — 基于 CLIP + 扩散的图像生成
- [[ddim-2020]] —— DDIM — 把扩散模型 1000 步采样压到 50 步
- [[dit]] —— DiT — Diffusion Transformer
- [[edm-2022]] —— EDM — 把扩散模型的训练配方一次拆清楚
- [[imagen-2022]] —— Imagen — 文生图真正的引擎是语言模型
- [[mae]] —— MAE — Masked Autoencoders
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[resnet]] —— ResNet — 残差连接
- [[stable-diffusion]] —— Stable Diffusion — 开源文生图引爆
- [[vit]] —— ViT — Vision Transformer

