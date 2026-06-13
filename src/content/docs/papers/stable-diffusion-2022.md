---
title: "Stable Diffusion：用潜在空间做高清图像生成"
来源: https://arXiv.org/abs/2112.10752
日期: 2026-06-13
分类_原始: 计算机视觉
分类: 机器学习
子分类: cv
provenance: pipeline-v3
---

# Stable Diffusion：用潜在空间做高清图像生成

来源：CVPR 2022 | Robin Rombach 等人 | arXiv:2112.10752

## 一句话总结

Stable Diffusion 把"从噪声画图片"这件事，从像素空间搬到了一个压缩后的"潜在空间"里做，从而用普通显卡也能跑出高质量的图片生成。

---

## 0. 日常类比：在缩略图上修图

想象你要给一张 4K 照片（800 万像素）加滤镜。

传统做法：逐像素处理，每个像素的 R、G、B 三个通道都要算一遍。
耗时长，显存爆。

Stable Diffusion 的做法：先把照片缩略化（比如缩到 1/8 的宽高），变成一个"潜在表示"。
在这个缩略图上做扩散和去噪，最后再放大还原。

关键点：缩略化不是简单缩小——而是用一个智能编码器（VAE）把图片压缩成一种"语义缩略图"，保留了图片的核心语义信息。

---

## 1. 背景：扩散模型是什么

### 1.1 DDPM（去噪扩散概率模型）

扩散模型的核心思想分两步：

- **前向过程（加噪）**：一步一步往图片上加高斯噪声，直到变成纯噪声
- **反向过程（去噪）**：训练一个神经网络，学会从纯噪声一步步还原回图片

类比：就像一首歌被逐渐加入白噪音变成刺耳的嘶鸣，扩散模型学会的是"逆过程"——从嘶鸣中把音乐一步步还原出来。

数学上，前向过程是固定的马尔可夫链：

```
q(x_t | x_{t-1}) = N(x_t; sqrt(1 - beta_t) * x_{t-1}, beta_t * I)
```

其中 `beta_t` 是预定义的噪声调度（noise schedule），控制每一步加多少噪声。

### 1.2 扩散模型的问题

DDPM 直接在像素空间操作：

- 训练需要几百个 GPU 天
- 推理时需要几十到几百次 sequential 的去噪步骤
- 每一步都要处理完整的像素图，计算量大

Stable Diffusion 要解决的就是这个问题。

---

## 2. 核心创新：潜在扩散模型（LDM）

### 2.1 整体架构

Stable Diffusion 由三个部分组成：

1. **变分自编码器（VAE）**：负责在像素空间和潜在空间之间来回转换
2. **U-Net 去噪网络**：在潜在空间里执行扩散过程的核心网络
3. **文本编码器（CLIP）**：把文字描述转换成条件信号

```
文字描述 --> CLIP编码器 --> 条件信号
                                |
纯噪声 --> U-Net去噪 --> 潜在表示 --> VAE解码 --> 最终图片
         ^       |
         |-------+ (反复迭代几十到几百次)
```

### 2.2 VAE：空间转换的"翻译官"

VAE 有两个角色：

- **编码器（Encoder）**：把像素图压缩成潜在表示 z
- **解码器（Decoder）**：把潜在表示 z 还原回像素图

关键：潜在空间的维度远小于像素空间。

原始 256x256x3 的 RGB 图片 = 200,736 个值（像素 x 通道）
压缩到 32x32x4 的潜在表示 = 4,096 个值

压缩率约 **50 倍**。这就是为什么训练快了很多——在 4096 维的空间里加噪/去噪，远比在 20 万维的像素空间里快。

代码示例 1：VAE 的编码和解码过程

```python
# 假设我们有一个训练好的 VAE（encoder + decoder）
# 以及一张原始图片 x（形状：batch x 3 x 256 x 256）

import torch
import torch.nn.functional as F

# 1. 编码：图片 --> 潜在表示
# z = encoder(x)，z 的形状大概是 batch x 4 x 32 x 32
# 4 是潜在通道数，32x32 是压缩后的空间尺寸
z = vae_encoder(x)

# 2. 在潜在空间里做扩散过程的加噪和去噪
# （这一步由 U-Net 完成，后面详细讲）
z_denoised = diffusion_process(z)

# 3. 解码：潜在表示 --> 图片
# x_reconstructed = decoder(z_denoised)
x_output = vae_decoder(z_denoised)

# 整个 pipeline 看起来就是这样：
# x (256x256x3) 
#   --> vae_encoder --> z (32x32x4)  [压缩 50 倍]
#   --> U-Net 去噪 --> z_denoised (32x32x4)
#   --> vae_decoder --> x_output (256x256x3)
```

### 2.3 交叉注意力机制（Cross-Attention）：让模型"听懂"文字

这是 Stable Diffusion 能"看图说话"的关键。

在 U-Net 的每一层中，插入 cross-attention 层：

- **Query（查询）**：来自 U-Net 当前的特征图
- **Key & Value（键和值）**：来自文本编码器的输出

类比：你去看电影，字幕（text）告诉你剧情走向，
你的眼睛（U-Net features）在看画面。
字幕告诉你"一只金色的狗在草地上奔跑"，
你的眼睛就会在画面上"注意"到狗、草地、奔跑这些区域。

交叉注意力公式：

```
Attention(Q, K, V) = softmax(Q @ K^T / sqrt(d)) @ V
```

其中：
- Q 来自 U-Net 的特征图（空间位置信息）
- K, V 来自文本编码器（语义信息）
- d 是维度

代码示例 2：Cross-Attention 层

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class CrossAttention(nn.Module):
    """
    交叉注意力层。
    
    参数:
        d_model: 模型维度（隐藏层大小）
        n_heads: 注意力头数
    
    输入:
        x: U-Net 的特征图 [batch, seq_len, d_model]
           其中 seq_len = 空间高度 * 空间宽度（潜在表示展平后的长度）
        context: 文本编码器的输出 [batch, text_len, d_model]
                 例如 CLIP 输出的文本嵌入
    """
    
    def __init__(self, d_model, n_heads):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        
        # 三个线性层：分别生成 Q, K, V
        self.q_linear = nn.Linear(d_model, d_model)
        self.k_linear = nn.Linear(d_model, d_model)
        self.v_linear = nn.Linear(d_model, d_model)
        
        # 输出投影
        self.out_linear = nn.Linear(d_model, d_model)
    
    def forward(self, x, context):
        """
        x:       [batch, seq_len, d]      -- U-Net 空间特征
        context: [batch, text_len, d]     -- 文本嵌入（来自 CLIP）
        
        返回:
            注意力输出，形状同 x
        """
        batch_size = x.shape[0]
        
        # 1. 生成 Q, K, V
        # Q 来自图像特征，K 和 V 来自文本
        q = self.q_linear(x)          # [batch, seq_len, d]
        k = self.k_linear(context)    # [batch, text_len, d]
        v = self.v_linear(context)    # [batch, text_len, d]
        
        # 2. 分头：把 d 维度拆成 n_heads 个 head
        # [batch, seq_len, n_heads, head_dim]
        q = q.view(batch_size, -1, self.n_heads, self.head_dim).transpose(1, 2)
        k = k.view(batch_size, -1, self.n_heads, self.head_dim).transpose(1, 2)
        v = v.view(batch_size, -1, self.n_heads, self.head_dim).transpose(1, 2)
        
        # 3. 计算注意力分数
        # Q @ K^T 得到 [batch, n_heads, seq_len, text_len]
        # 除以 sqrt(head_dim) 做缩放，防止 softmax 饱和
        attn_weights = torch.matmul(q, k.transpose(-2, -1)) / (self.head_dim ** 0.5)
        
        # 4. Softmax 归一化
        attn_weights = F.softmax(attn_weights, dim=-1)
        
        # 5. 乘以 V：加权求和
        # 结果形状: [batch, n_heads, seq_len, text_len] @ [batch, n_heads, text_len, head_dim]
        #        = [batch, n_heads, seq_len, head_dim]
        output = torch.matmul(attn_weights, v)
        
        # 6. 合并头，回到原始维度
        output = output.transpose(1, 2).reshape(batch_size, -1, self.n_heads * self.head_dim)
        
        # 7. 输出投影
        return self.out_linear(output)
```

代码示例 3：完整的 Stable Diffusion 推理流程

```python
"""
Stable Diffusion 推理流程（简化版）

输入: prompt = "a cat sitting on a windowsill, sunlight, detailed fur"
输出: 一张 512x512 的图片
"""

import torch
import torch.nn.functional as F

def stable_diffusion_inference(prompt, device="cuda"):
    # ===== 第 1 步：文本编码 =====
    # CLIP 把文字变成文本嵌入（条件信号）
    text_tokens = tokenizer(prompt)           #  tokenize 文字
    text_embeddings = clip_encoder(text_tokens)  # [batch, text_len, 768]
    
    # ===== 第 2 步：生成纯噪声 =====
    # 在潜在空间里随机采样高斯噪声
    # 对于 512x512 图片，潜在空间尺寸是 64x64（因为压缩了 8 倍）
    # 潜在通道数是 4
    latent_noise = torch.randn(
        1, 4, 64, 64, device=device  # 64x64 = 512/8, 4=latent_channels
    )
    
    # ===== 第 3 步：扩散去噪循环 =====
    # 通常 50-100 步
    x = latent_noise.clone()
    for t in reversed(range(num_diffusion_steps)):
        # 3a. 计算当前的时间步嵌入（用来告诉模型当前在去噪的哪一步）
        time_emb = timestep_embedding(t, dim=embedding_dim)
        
        # 3b. U-Net 预测噪声
        # 输入: 当前潜在表示 x + 时间步信息 + 文本条件
        # 输出: 预测的噪声 eps_theta
        predicted_noise = unet(
            x,               # 当前潜在表示 [1, 4, 64, 64]
            timestep=time_emb,
            context=text_embeddings  # 交叉注意力注入文本信息
        )
        
        # 3c. 根据预测的噪声，更新 x（DDIM 或 DDPM 的采样公式）
        x = step_denoise(x, predicted_noise, t)
    
    # ===== 第 4 步：VAE 解码 =====
    # 把去噪后的潜在表示还原回像素空间
    image = vae_decoder(x)  # [1, 3, 512, 512]
    
    # 归一化到 [0, 1]
    image = (image + 1) / 2
    image = torch.clamp(image, 0, 1)
    
    return image
```

---

## 3. 训练过程

### 3.1 两阶段训练

Stable Diffusion 的训练分两个独立的阶段：

**阶段 1：训练 VAE**

```
原始图片 x --> VAE Encoder --> z --> VAE Decoder --> x'
损失 = 重建损失 + KL 散度
```

VAE 的训练目标：

- **重建损失**：解码后的图片和原图尽可能接近（MSE 或 LPIPS）
- **KL 散度**：强制潜在分布接近标准正态分布（让潜在空间连续、可采样）

```python
# VAE 损失函数
def vae_loss(x, x_reconstructed, z_mean, z_logvar):
    # 重建损失：原图和重建图的差异
    reconstruction_loss = F.mse_loss(x, x_reconstructed)
    
    # KL 散度：让潜在变量接近标准正态分布 N(0, 1)
    kl_loss = -0.5 * torch.mean(
        1 + z_logvar - z_mean.pow(2) - z_logvar.exp()
    )
    
    # 总损失
    total_loss = reconstruction_loss + kl_weight * kl_loss
    return total_loss
```

**阶段 2：在固定 VAE 的潜在空间里训练 U-Net**

```
原始图片 x --> VAE Encoder（冻结） --> z
z --> U-Net 加噪/去噪训练
损失 = U-Net 预测噪声 vs 真实噪声（MSE）
```

### 3.2 条件训练：让模型听文字

在训练 U-Net 时，每张图片都配有一段文字描述（caption）。

训练过程：

1. 随机丢弃部分文本条件（约 10% 的概率）
2. 这样模型既能"按文字生成"，也能"无条件生成"

这种技术叫 **Classifier-Free Guidance**：
不需要额外的分类器，模型自己学会了"有条件"和"无条件"两种模式。

---

## 4. 为什么 LDM 比 DDPM 快这么多

| 维度 | DDPM（像素空间） | LDM（潜在空间） |
|------|-----------------|----------------|
| 输入维度 | 256x256x3 = 196,608 | 32x32x4 = 4,096 |
| 压缩比 | 1x | ~48x |
| 显存占用 | 极高 | 低 |
| 训练时间 | 数百 GPU 天 | 数十 GPU 天 |
| 推理速度 | 慢（sequential） | 快 |

关键洞察：VAE 学到的潜在表示保留了生成所需的大部分视觉信息，
同时去掉了冗余的像素级细节。

---

## 5. 应用与扩展

Stable Diffusion 提出后，催生了一系列重要应用：

1. **文生图**：text-to-image，最经典的应用
2. **图生图**：img2img，基于参考图进行风格转换
3. **局部重绘（Inpainting）**：修改图片的局部区域
4. **超分辨率（Super-Resolution）**：在潜在空间做上采样
5. **ControlNet**：用边缘图、深度图等额外条件控制生成
6. **LoRA**：轻量级微调技术，用少量数据适应特定风格

---

## 6. 关键概念回顾

### 6.1 扩散过程

- 前向：逐步加噪 x_0 --> x_1 --> ... --> x_T（纯噪声）
- 反向：逐步去噪 x_T --> x_{T-1} --> ... --> x_0
- 训练目标：预测每一步添加的噪声

### 6.2 潜在空间

- 用 VAE 把高维像素空间压缩到低维潜在空间
- 在潜在空间做扩散，效率提升数十倍
- VAE 的 KL 散度约束让潜在空间连续，支持采样和插值

### 6.3 交叉注意力

- 将文本（或任意条件）注入到去噪过程中
- Q 来自图像特征，K/V 来自文本嵌入
- 让模型学会"按照文字描述生成对应图像"

### 6.4 Classifier-Free Guidance

- 训练时随机丢弃条件（文本）
- 推理时通过调整 guidance scale 控制"遵循条件的程度"
- 不需要额外的分类器模型

---

## 7. 总结

Stable Diffusion（LDM）的核心贡献可以概括为一句话：

**把扩散模型从像素空间搬到 VAE 学到的潜在空间里训练和推理。**

这个简单而优雅的想法带来了三个关键好处：

1. 训练成本大幅下降（从几百 GPU 天到几十 GPU 天）
2. 可以在消费级显卡上运行
3. 通过交叉注意力，把扩散模型变成了强大的条件生成器

这正是 Stable Diffusion 能成为开源 AI 图像生成生态基石的原因。

---

## 参考资料

1. Rombach et al., "High-Resolution Image Synthesis with Latent Diffusion Models", CVPR 2022
2. Ho et al., "Denoising Diffusion Probabilistic Models" (DDPM), NeurIPS 2020
3. Kingma & Welling, "Auto-Encoding Variational Bayes" (VAE), ICLR 2014
4. Radford et al., "Learning Transferable Visual Models From Natural Language" (CLIP), ICML 2021
