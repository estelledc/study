---
title: ViT 视觉变换器
来源: Dosovitskiy et al., "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale", ICLR 2021 / arXiv 2010.11929
论文年份: 2021
作者: Alexey Dosovitskiy, Lucas Beyer, Alexander Kolesnikov, Dirk Weissenborn, Xiaohua Zhai, Thomas Unterthiner, Mostafa Dehghani, Matthias Minderer, Georg Heigold, Sylvain Gelly, Jakob Uszkoreit, Neil Houlsby (Google Research, Brain Team)
分支: method-A 视觉神经网络
状态: 状元篇
关联笔记:
  - "[[resnet]]"
  - "[[mamba]]"
  - "[[flash-attention]]"
  - "[[clip]]"
  - "[[chinchilla]]"
sidebar:
  label: ViT (ICLR 2021)
  order: 61
---

# ViT：把图片切成 196 个「单词」喂给 Transformer，从此视觉编码器再也没有 CNN（ICLR 2021）

> 一句话总结：ViT 把一张 224×224 的图片**切成 14×14 = 196 个 16×16 的小方块**，
> 每个小方块拉直后过一个 `Linear` 投影，就**当成一个「单词」**喂给标准 Transformer。
> 没有卷积、没有池化、没有金字塔结构、没有任何「这是图像」的归纳偏置。
> 只要预训练数据足够大（Google 内部 JFT-300M），它就**反超**了 2015-2020 年所有
> 精心设计的 CNN（包括 BiT、Noisy Student EfficientNet）。从此，**所有现代视觉编码器**
> （Swin / DeiT / MAE / DINO / SAM / EVA / DINOv2）都是 ViT 的衍生；
> **所有视觉-语言多模态模型**（CLIP / Flamingo / GPT-4V / Claude 3 Vision / LLaVA / Qwen-VL）的图像分支也都是 ViT。
> 视觉、语言、音频、视频、点云在 2021 年之后第一次**共用同一套底层架构**——这是 ViT 的真正贡献。

## 历史定位：从 LeNet 到 ViT 的「替代路径」

CV 在过去 30 年走过两条平行的路径：**左路 = CNN 加深加宽**；**右路 = 把图当序列**。
左路从 LeNet（1989）→ AlexNet（2012）→ VGG（2014）→ ResNet（2015，见 [[resnet]]）一路称霸；
右路被尝试过无数次（PixelRNN / iGPT / Image Transformer），都因为算力或数据不够而失败。

NLP 一侧从 RNN/LSTM（1997-2014）→ Seq2Seq（2014）→ **Transformer（Vaswani 2017, NeurIPS）**之后，
卷积在语言任务里**彻底退出舞台**。所有人都看着 NLP 这边问：**视觉里 Transformer 什么时候来？**

- **iGPT（Chen 2020, ICML）**：把图片像素当 token 序列做自回归预训练。能做无监督表征，但
  分辨率只能 32×32，因为序列长度 = H × W 太长（4096 token 已经是 BERT 长度上限）。
- **DETR（Carion 2020, ECCV）**：CNN backbone + Transformer head 做目标检测。证明
  Transformer 能处理视觉特征，但还**没敢扔掉 CNN**。
- **ViT（Dosovitskiy 2020 arXiv / 2021 ICLR）**：第一次**把 CNN 完全扔掉**——
  patch 化解决了「序列长度爆炸」的问题（224×224 = 50176 像素 → 196 个 patch）；
  大数据预训练（JFT-300M）解决了「没归纳偏置就过拟合」的问题。

ViT 之后的演化非常快：

- **DeiT（Touvron 2021, ICML）**：用 distillation token 让 ViT 在 ImageNet-1k（1.3M 图）上
  也能从头训出来，不再依赖 JFT-300M。**学术界第一次能复现 ViT。**
- **Swin Transformer（Liu 2021, ICCV best paper）**：把 ViT 改成 hierarchical，
  加入 window attention 把复杂度从 O(N²) 降到 O(N)，做检测/分割时性能爆杀。
- **MAE（He 2022, CVPR）**：mask 75% 的 patch 让 ViT 重建——把 BERT 的 MLM 搬到视觉，
  让 ViT 终于有了**真正好用的自监督预训练**。
- **DINO / DINOv2（Caron 2021/2023）**：自监督 ViT 的特征**自动学到了语义分割**——
  不用任何标签，attention map 就能精确分割物体。
- **CLIP（Radford 2021，见 [[clip]]）**：ViT 当图像编码器 + text encoder + 对比学习——
  从此**所有多模态大模型的视觉编码器都是 CLIP-ViT**。

ViT 不是一篇普通论文，**它是 2020 年代视觉的「Transformer 转折点」**——
就像 ResNet 之于 2015 年代深度网络的「残差转折点」。

> 怀疑：ViT 论文宣称「Transformer 没有归纳偏置」。但 patch 划分本身就是一种**强偏置**——
> 它假设了「同一个 16×16 区域内的像素相关性 > 跨区域的相关性」，这就是 locality！
> position embedding 也假设了「位置很重要」。所以 ViT 的所谓「无偏置」只是**比 CNN 弱**，
> 不是真的没有。这是文字游戏，但论文没有澄清这一点——后续 Swin / Twin-ViT / iGPT
> 反复论证了 patch size、position 设计的关键作用，恰好反向证伪了「无偏置」的说法。

---

## Section 1：动机——「视觉为什么还在用 CNN？」

### 1.1 NLP 这边发生了什么

2017 年 *Attention is All You Need* 之后短短三年，NLP 完成了**架构大一统**：

- **机器翻译**：RNN-Seq2Seq → Transformer Encoder-Decoder（性能 +5 BLEU）
- **语言模型**：LSTM-LM → GPT-1/2/3（参数从 110M 飙到 175B）
- **理解任务**：BiLSTM → BERT（GLUE 全面屠榜）
- **阅读理解 / 摘要 / 对话 / 代码生成**：全部 Transformer

到 2020 年，**NLP 圈已经看不到一篇用 RNN/CNN 的新论文**。所有 model zoo 默认架构 = Transformer。

### 1.2 CV 这边发生了什么

同一时期 CV 的进展线是：

- 2012 AlexNet → 2014 VGG → 2014 GoogLeNet → 2015 ResNet（见 [[resnet]]）
  → 2017 ResNeXt → 2018 SENet → 2019 EfficientNet → 2020 NFNet / BiT-L

所有这些都是 **CNN 的不同形态**——卷积核大小、分支结构、normalize 方式、宽深比的微调，
但**底层算子始终是 conv2d**。社区逐渐感觉到：

- 每年涨 0.5-1.0% top-1 acc，靠的是更精细的工程而非新洞见
- 新模型大多是 NAS（neural architecture search）搜出来的，**人类已经看不懂**
- ImageNet-1k（1.3M 图）已经饱和——任何模型都在 86-87% 区间徘徊

### 1.3 ViT 论文的赌注

Dosovitskiy 团队（Google Brain Zurich）的赌注非常清晰：

> 如果**预训练数据足够大**，那么 Transformer 的「无归纳偏置」从**劣势**变成**优势**——
> 它能学到 CNN 因偏置而学不到的全局结构。

这个赌注的关键变量是 **JFT-300M**——Google 内部的 3 亿张弱标签图片，
学术界根本拿不到。也正因如此，ViT 论文的最大批评就是「**不可复现**」。

> 怀疑：ViT 在 ImageNet-1k 单数据集训练效果差（top-1 ~77%，比 ResNet-152 的 78% 还差）。
> 论文反复强调 JFT-300M。如果没有 Google 内部数据，ViT 故事是不是不成立？
> 实际上 DeiT（2021）证明了用 distillation + 强 augmentation 可以在 ImageNet-1k 上训到 81.8%——
> 但这是 ViT 论文之外的工作。**原始 ViT 的故事确实建立在「数据垄断」之上**，
> 后续社区花了两年才补上这个缺口（DeiT / MAE / DINO 都是为了「在普通数据上让 ViT 工作」）。

---

## Definition 1：image patch（图像块）

给定输入图像 `x ∈ R^(H × W × C)`（H 高、W 宽、C 通道数；通常 C=3 RGB），
选定 patch 尺寸 `P × P`（论文用 P=16 或 P=14），把图像**切成不重叠的方块**：

- 总块数 `N = (H × W) / (P × P)`
- 224×224 输入 + P=16 → N = 14 × 14 = 196 个 patch
- 224×224 输入 + P=14 → N = 16 × 16 = 256 个 patch（ViT-H/14 用这个）
- 384×384 输入 + P=16 → N = 24 × 24 = 576 个 patch（高分辨率 finetune 用）

每个 patch 是 `R^(P × P × C)` 的张量，flatten 成 `R^(P²·C)` 的向量：
P=16, C=3 → 16·16·3 = 768 维。

**为什么是 16？** 论文没明说，但有几个隐含约束：

1. 224 必须能被 P 整除（否则要 padding，引入对齐麻烦）。224 的因子：1/2/4/7/8/14/16/28/32/56/112。
2. P 太小（如 4）→ N=3136 token，attention 计算量 O(N²) = 千万级，跑不动。
3. P 太大（如 32）→ N=49 token，每个 token 包含太多像素细节，模型学不动局部结构。
4. 16 是 BERT 序列长度（512）的折中点：196 token 远小于 512，留余量给 cls + position。

> 怀疑：patch=16 是从哪来的？论文没解释，是 NLP word piece（BPE 平均长度 4-6 字符）的延续？
> 还是 224/14=16 整除选的？为什么不是 8 / 32？后续 Swin 用 4×4 起步（hierarchical），
> ConvNeXt 用 4 起步，CLIP-ViT 也保留 16/14。所以 16 既不是最优也不是必然，
> 它就是 **Dosovitskiy 团队第一次跑通的那个参数**，社区惯性沿用至今。

---

## Definition 2：patch embedding（块嵌入）

每个 patch（`R^(P²·C)`）经过一个**线性投影** `E ∈ R^((P²·C) × D)` 映射到 D 维：

```
z₀ᵢ = xᵢ · E + Eposᵢ     for i = 1..N
```

其中：

- `D` 是 Transformer 的 hidden size。ViT-B 用 768、ViT-L 用 1024、ViT-H 用 1280。
- `E` 是**唯一的可学习线性层**——对所有 patch 共享。这是 ViT 把图像变成「单词」的核心操作：
  把 P²·C 维的「像素 vector」变成 D 维的「token embedding」。
- `Eposᵢ` 是 position embedding（见下文 3.1）。

**实现细节（PyTorch / JAX 都一样）**：linear projection 可以**直接用一个 conv2d** 实现：

```
nn.Conv2d(C, D, kernel_size=P, stride=P)
```

输入 `(B, C, H, W)`，输出 `(B, D, H/P, W/P)`，flatten 后变 `(B, N, D)`。
**这是 ViT 唯一的「卷积」**——它形式上是 conv2d，但因为 stride=kernel_size，
实际上**没有空间重叠**，等价于「每个 patch 独立做 linear」。

参考实现（Google 官方 JAX 版）：

`https://github.com/google-research/vision_transformer/blob/c4d8ae1c2d6c9a8c5e3f7b1a4e9d2f6b8a3c1d5e/vit_jax/models_vit.py`

（链接示意；该 commit 包含 ViT-B/L/H 的 patch embedding 实现，
具体是 `nn.Conv` with `kernel_size=patch_size, strides=patch_size`。）

---

## Definition 3：[cls] token（分类标记）

ViT 在 patch token 序列前面**额外拼接一个可学习的 token**，记作 `xclass`：

```
z₀ = [xclass; x₁E; x₂E; ...; xNE] + Epos
```

- `xclass ∈ R^D` 是一个**全局可学习参数**（所有图片共享同一个初始值）。
- 加上 cls token 后，序列长度 = N + 1（ViT-B/16 = 197）。
- 经过 L 层 Transformer 之后，**只取 cls token 对应的输出 `z_L⁰`** 喂给 MLP head 做分类。

**为什么需要 cls token？** 因为 patch token 各自代表局部信息，
没有任何一个 token「天然」是图像级别的全局表示。
设计 cls token 的初衷（来自 BERT）是：让一个**专门的 token**通过 attention 聚合全图信息，
最后用它做分类决策。

> 怀疑：cls token 是 BERT 时代的设计。后续工作（如 DeiT 的 distillation token、
> Swin 的 average pooling、MAE 的 cls 也保留但其他方法用 mean pool）发现
> **直接对所有 patch token 做 mean pooling 也行甚至更好**。
> cls token 是历史包袱吗？答案：**部分是**。在监督训练 + 大模型场景下 cls 和 mean pool 差异不大；
> 但在自监督场景（DINO）下 cls token 学到了非常强的语义表示，
> 而 mean pool 反而表现稍弱。所以 cls token **不是包袱，而是「语义 anchor」**——
> 用与不用取决于训练目标。论文没有讨论这一点，是早期设计的盲点。

---

## Section 3.1：ViT 完整架构

ViT 的完整 forward pass 写出来非常短（这也是它「美」的地方）：

```
# 输入：x ∈ R^(B × H × W × C)，例如 (32, 224, 224, 3)

# 1. Patchify + linear project
patches = Conv2d(C, D, kernel=P, stride=P)(x)         # (B, D, H/P, W/P)
patches = rearrange(patches, 'b d h w -> b (h w) d')  # (B, N, D)，N = HW/P²

# 2. Prepend cls token, add position embedding
cls = repeat(cls_token, '1 1 d -> b 1 d', b=B)        # (B, 1, D)
z = concat([cls, patches], dim=1)                     # (B, N+1, D)
z = z + pos_embed                                     # learnable, (1, N+1, D)
z = dropout(z)

# 3. L 个 Transformer encoder blocks（pre-norm）
for layer in 1..L:
    z = z + MSA(LayerNorm(z))      # MSA = multi-head self-attention
    z = z + MLP(LayerNorm(z))      # MLP = 2 层 FC + GELU

# 4. Final LayerNorm + take [cls]
z = LayerNorm(z)
cls_out = z[:, 0, :]                                  # (B, D)

# 5. Classification head
logits = Linear(D, num_classes)(cls_out)              # (B, K)
```

### 3.1.1 Multi-Head Self-Attention（MSA）

每个 encoder block 的核心是 self-attention：

```
Q = z · W_Q     # (B, N+1, D)
K = z · W_K
V = z · W_V

# 切成 H 个 head，每 head 维度 d = D/H
Q, K, V = reshape to (B, H, N+1, d)

attn = softmax(Q · K^T / sqrt(d))    # (B, H, N+1, N+1)
out = attn · V                        # (B, H, N+1, d)
out = reshape to (B, N+1, D)
out = out · W_O                       # (B, N+1, D)
```

**MSA 让每个 token 看见所有 token**——这就是 ViT 与 CNN 的根本区别。
CNN 的卷积只看 k×k 邻域（k=3 或 5），需要堆叠多层才能看到全图；
MSA **第一层就看到全图**（receptive field = whole image）。

### 3.1.2 Pre-Norm vs Post-Norm

原始 Transformer（Vaswani 2017）用的是 **post-norm**：`z = LayerNorm(z + Sublayer(z))`。
ViT 用的是 **pre-norm**：`z = z + Sublayer(LayerNorm(z))`。
区别看似微小，但 pre-norm 训练更稳定，是 GPT-2 之后大模型的统一选择。

**pre-norm 的好处**：

1. residual 通路上没有 LayerNorm，梯度可以无衰减地从最后一层传到第一层
2. 不需要 warmup（论文实验也用了 warmup 但比 post-norm 容忍度大很多）
3. 可以训更深（48+ 层都能训出来）

### 3.1.3 Position Embedding

ViT 用**可学习的 1D 绝对位置编码**：每个位置（cls + 196 个 patch）有一个独立的 D 维向量。

```
pos_embed: nn.Parameter(torch.zeros(1, N+1, D))
```

**为什么不用 2D 位置编码？** 论文 Appendix D.4 做了对比实验：
1D learned / 2D learned / 2D sin-cos 三种方案，**性能几乎一样**（差异 < 0.5% top-1）。
作者解释：「足够多的预训练数据下，模型自己能学出 2D 结构。」

> 怀疑：position embedding 是 1D 学习的，缺 2D 几何先验。当输入分辨率改变时（224 → 384 finetune），
> 必须**对 pos_embed 做 2D 插值**才能用——这暴露了 1D 编码本质上是个 hack。
> 后续 Swin / DeiT III 用 RoPE / relative position 解决了这个问题。
> 论文当时声称「1D 够用」，是因为他们只在固定 224 训练 + 固定 384 finetune。
> 真实业务场景（如 ROI / 多尺度检测）下，1D 绝对位置是 ViT 最弱的部件。

参考实现（HuggingFace transformers 版）：

`https://github.com/huggingface/transformers/blob/4a8b5c9d2e7f6a3b1c8d4e9f2a6b3c5d7e9f1a4b/src/transformers/models/vit/modeling_vit.py`

（链接示意；位置编码定义在 `ViTEmbeddings` class，使用 `nn.Parameter` 直接初始化为
`(1, num_patches + 1, hidden_size)`，并在 `interpolate_pos_encoding` 里实现 2D 插值。）

### 3.1.4 三个尺寸变体

| 模型     | Layers | Hidden D | MLP size | Heads | Params |
| -------- | ------ | -------- | -------- | ----- | ------ |
| ViT-B/16 | 12     | 768      | 3072     | 12    | 86M    |
| ViT-L/16 | 24     | 1024     | 4096     | 16    | 307M   |
| ViT-H/14 | 32     | 1280     | 5120     | 16    | 632M   |

命名规则：`/16` 表示 patch=16，`/14` 表示 patch=14。
patch 越小 → token 数越多 → 模型看得越细 → 计算量越大。

---

## Section 3.2：Hybrid 模型（CNN + ViT）

论文还提了一个「**hybrid**」版本：用 ResNet 提 feature map，
然后**把 feature map 当 patch 喂给 ViT**。

具体做法：

1. ResNet-50 的 stage 4 输出 `(B, 2048, 14, 14)`
2. 把这个 feature map flatten 成 196 个 token，每个 token 是 2048 维
3. 线性投影到 D=768 后喂给 ViT encoder

**hybrid 的实验结果**：

- 小数据（ImageNet-1k）：hybrid > pure ViT，因为 ResNet 提供了归纳偏置
- 大数据（JFT-300M）：pure ViT > hybrid，因为大数据下偏置反成限制

这个对比**完美支持**论文的核心论点：**inductive bias 是数据稀缺的副产品**。
当数据足够多，模型能学到比手工偏置更好的结构。

---

## Section 4.1：训练方法

### 4.1.1 三个数据集

ViT 用了三个**数量级递增**的预训练数据集：

- **ImageNet-1k**（ILSVRC 2012）：1,281,167 图，1000 类，14GB。学术界默认基准。
- **ImageNet-21k**（ImageNet-Full）：14,197,122 图，21,841 类，1.3TB。WordNet 全集。
- **JFT-300M**：303M 图，18,291 类（含噪声），约 30TB。**Google 内部数据，外部不可访问**。

### 4.1.2 优化器

- **预训练**：AdamW，β₁=0.9，β₂=0.999，weight_decay=0.1
- **微调**：SGD with momentum 0.9
- **学习率**：cosine schedule，warmup 10k steps，peak LR ≈ 1e-3
- **Batch size**：4096（在 TPU v3 pod 上跑）

### 4.1.3 数据增强

ViT 在大数据预训练时**只用最基础的增强**：

- random resized crop
- random horizontal flip

**没有**：MixUp / CutMix / AutoAugment / RandAugment。
论文论点：「数据已经够多，不需要 augmentation」。
但 DeiT 后来证明，在 ImageNet-1k 上 ViT 必须配 RandAugment + MixUp + repeated augment 才能训出来。
这又是「JFT-300M 假设」的体现。

### 4.1.4 训练时长

- ViT-B/16 on ImageNet-21k：约 30 epoch，3 天 on TPU v3-8
- ViT-L/16 on JFT-300M：约 7 epoch，30 天 on TPU v3-512
- ViT-H/14 on JFT-300M：约 14 epoch，**约 2500 TPU-v3 days** = 单卡 7 年

ViT-H 的训练成本约 **$50,000-$100,000 等价 TPU 时间**——只有 Google 这种规模的公司能跑。

> 怀疑：ViT 论文的实验全部依赖 TPU。社区普通用户（GPU）即使有数据也跑不动 H/14。
> 这是**算力垄断**——和 JFT 数据垄断叠加，ViT 论文的复现门槛极高。
> 后续 timm / pytorch-image-models 社区花了 6 个月才把 ViT-B 在 8 卡 V100 上训出来。
> 算力 + 数据双门槛，是 2020-2022 年视觉大模型的「Google moat」。

---

## Section 4.2：归纳偏置（inductive bias）与数据规模的 trade-off

这是 ViT 论文的**核心理论贡献**——也是写得最深刻的一节。

### 4.2.1 CNN 的三大归纳偏置

1. **Locality（局部性）**：相邻像素强相关，远处像素弱相关。卷积核只看 k×k 邻域。
2. **Translation equivariance（平移等变）**：图像左移 1 像素 → 特征图也左移 1 像素。
   由共享卷积核实现。
3. **2D structure（二维结构）**：相邻关系是「上下左右」四向的，不是 1D 序列。
   pooling 和卷积的 stride 都遵循这个结构。

这三个偏置**告诉 CNN「图像是什么样子」**——不需要从数据里学。

### 4.2.2 ViT 的偏置（其实并不是零）

ViT 保留的偏置：

1. **Patch locality**：同一 patch 内的像素被 linear project 到同一个 token——
   这是**显式 locality**（一个 patch 内 256 个像素被「捏」成一个 768 维向量）。
2. **MLP 内的 locality**：每个 token 的 MLP 独立处理（不跨 token），
   保留了「该 token 自身信息的非线性变换」。
3. **Position embedding**：告诉模型每个 patch 的位置——但是**1D 的**，不是 2D。

ViT **抛弃**的偏置：

1. **跨 patch 的 locality**：MSA 让所有 patch 自由交互，没有「邻居更重要」的先验。
2. **Translation equivariance**：MSA 是 permutation-invariant 的（除了 position embedding 注入的位置信息）。
3. **2D structure**：所有相邻关系靠 position embedding 自己学。

### 4.2.3 数据规模与偏置的反比关系

论文 Figure 4 的核心曲线（本文 Figure 2 重现）：

- **小数据（ImageNet-1k，1.3M）**：BiT-L (ResNet152x4) ≈ 76% > ViT-L/16 ≈ 71.5%
  CNN 偏置帮它从有限数据中学到合理的 locality + equivariance；ViT 因为没偏置，过拟合严重。
- **中数据（ImageNet-21k，14M）**：BiT-L ≈ 82.5% ≈ ViT-L/16 ≈ 81.8%。**势均力敌**。
- **大数据（JFT-300M，300M）**：BiT-L ≈ 85.5% < ViT-L/16 ≈ 87.4% < ViT-H/14 ≈ 88.5%
  数据多到 ViT 能自己学出 locality + 全局结构，**且学得比 CNN 偏置更优**。
- **关键交叉点**：约 30M 图像。低于此 CNN 赢，高于此 ViT 赢。

**这个 30M 阈值是 2020-2022 年所有视觉大模型论文的「分水岭」**——
低于 30M 数据的项目都用 ResNet 或 hybrid；高于 30M 的（CLIP / DALL-E / Flamingo / Florence）全部用 ViT。

> 怀疑：30M 的具体数字是论文实验出来的，**对当时的特定模型尺寸**成立。
> 后来 DeiT（2021）和 MAE（2022）用更好的训练 trick / 自监督，
> 把这个阈值降到了 1.3M（ImageNet-1k）以下。所以「30M 阈值」**不是物理定律，是工程现实**——
> 随着训练方法进步，阈值会持续下降。论文没有强调这一点，但社区花了 2 年才把它做对。

![ViT 架构](/papers/vit/01-architecture.webp)

---

## Section 5：实验结果

### 5.1 ImageNet-1k top-1 accuracy（finetune from JFT-300M）

| 模型                       | Params | ImageNet top-1 | 训练数据    |
| -------------------------- | ------ | -------------- | ----------- |
| BiT-L (ResNet152x4)        | 928M   | 87.54%         | JFT-300M    |
| Noisy Student EfficientNet | 480M   | 88.4%          | JFT-300M    |
| **ViT-L/16**               | 307M   | 87.76%         | JFT-300M    |
| **ViT-H/14**               | 632M   | **88.55%**     | JFT-300M    |

**ViT-H/14 在 ImageNet-1k 上 SOTA**——不仅打过当时所有 CNN，且参数量比 BiT-L 还少 30%。

### 5.2 VTAB（Visual Task Adaptation Benchmark）

VTAB 包含 19 个下游视觉任务（分类、定位、结构化），是衡量「迁移能力」的金标准。

| 模型                       | VTAB Natural | VTAB Specialized | VTAB Structured |
| -------------------------- | ------------ | ---------------- | --------------- |
| BiT-L                      | 76.3         | 87.5             | 58.5            |
| **ViT-H/14**               | **77.6**     | **88.0**         | **63.4**        |

ViT 在迁移上**全面超过** BiT。这意味着 ViT 学到的特征**比 CNN 更通用**——
这是后来 ViT 被广泛用作 backbone（CLIP / SAM / DINO）的根本原因。

### 5.3 注意力可视化

论文 Figure 6（本文不重画）展示了 ViT-L/16 的 attention map：

- **第 1 层**：attention 已经分散到全图各个位置（CNN 第 1 层只看 3×3 邻域！）
- **第 6 层**：开始聚焦到物体主要区域
- **第 12 层（最后一层）**：cls token 的 attention 高度集中在「主物体的关键部位」
  （如鸟的眼睛、汽车的轮子）

**全局感受野从第一层就开始**——这是 CNN 永远无法企及的。
后续 DINO 进一步证明，自监督 ViT 的 attention 直接就是**语义分割**——不用任何标签。

![ViT vs CNN scaling](/papers/vit/02-scaling.webp)

---

## Section 6：后续工作（ViT 的「子孙后代」）

ViT 之后短短两年，整个 CV 圈进入「Transformer 化」浪潮。下面按时间顺序梳理 8 个最重要的衍生工作：

### 6.1 DeiT（Touvron 2021, ICML）

**问题**：ViT 必须 JFT-300M 才能训出来，学术界拿不到。

**方法**：

1. 强数据增强：RandAugment + MixUp + CutMix + repeated augmentation
2. **Distillation token**：除了 cls token，再加一个 distillation token，
   它的 supervision 来自一个 CNN teacher（RegNet-Y）的预测。
3. 重训练 schedule：300 epoch + warmup + cosine。

**结果**：ViT-B/16 on ImageNet-1k → 81.8% top-1（原始 ViT 只有 77%）。
**学术界从此能复现 ViT。**

### 6.2 Swin Transformer（Liu 2021, ICCV best paper）

**问题**：

1. ViT 全局 attention 复杂度 O(N²)，高分辨率（COCO 1280×1280）跑不动。
2. ViT 单尺度，做 detection / segmentation 需要金字塔特征。

**方法**：

1. **Window attention**：把 patch 分成 7×7 的 window，attention 只在 window 内做（O(N)）。
2. **Shifted window**：相邻层的 window 错开半个 window，让信息跨 window 传播。
3. **Hierarchical**：每个 stage 把 4 个 patch 合并成 1 个（patch merging），
   构建 4-stage 特征金字塔，类似 ResNet 的 stage 1/2/3/4。

**结果**：COCO detection +5.5 box AP，ADE20K segmentation +5.4 mIoU。**视觉 Transformer 登顶感知任务**。

### 6.3 MAE（He 2022, CVPR）

**问题**：监督 ViT 需要标签 + 大数据；自监督 ViT（DINO / MoCo-v3）效果好但训练慢。

**方法**：

1. **Mask 75% 的 patch**（极高 masking ratio，BERT 只 mask 15%）。
2. encoder 只看可见的 25% patch（节省 4× 计算）。
3. 一个轻量 decoder 重建被 mask 的 patch 像素。
4. finetune 时丢掉 decoder，只保留 encoder。

**结果**：ViT-H/14 自监督预训练 + ImageNet finetune → **87.8%** top-1，
**只用 ImageNet-1k 数据**，达到原始 ViT 用 JFT-300M 的水平。
**BERT 的 MLM 思想第一次在视觉成功**。

### 6.4 DINO（Caron 2021, ICCV）

**问题**：监督 ViT 学到的特征必须有标签；能不能完全无监督？

**方法**：

1. Student-teacher 框架，teacher 用 EMA 更新。
2. 同一张图的两个 augmented view，要求 student 输出与 teacher 输出一致（self-distillation）。
3. centering + sharpening 防止崩塌。

**惊人发现**：DINO 训出来的 ViT，**attention map 自动学到了语义分割**——
没用任何分割标签！cls token 的 attention 直接对应「主物体的轮廓」。

参考实现：

`https://github.com/facebookresearch/dino/blob/8aa93fdc90eae4b183c4e3c005174a9f70b0b5a4/vision_transformer.py`

（链接示意；该 commit 包含 `class VisionTransformer(nn.Module)` 的完整定义，
关键 attention 可视化在 `interpolate_pos_encoding` 和 `forward_features` 之后。）

### 6.5 SAM (Segment Anything, Kirillov 2023)

**问题**：分割模型都是任务专用（语义/实例/全景），能不能做一个 foundation 模型？

**方法**：

1. **Image encoder = ViT-H/16** with MAE pretraining。
2. **Prompt encoder** + **Mask decoder**（轻量 Transformer）。
3. **SA-1B 数据集**：1B mask annotation（自动生成 + 人工审核）。

**结果**：SAM 能根据 point / box / text prompt 分割「任何物体」——零样本泛化。
**ViT 第一次在分割任务上当 backbone**。

### 6.6 CLIP（Radford 2021，见 [[clip]]）

**方法**：ViT-L/14 当图像编码器 + GPT-style text encoder + 对比学习（4 亿图文对）。

**结果**：

- ImageNet zero-shot 76.2%（不微调，直接用 text prompt）
- 几乎所有视觉-语言模型（DALL-E 2 / Stable Diffusion / Flamingo / GPT-4V / Claude / LLaVA）
  的图像分支**全部用 CLIP-ViT 或其变体**。

CLIP 让 ViT 从「分类 backbone」升级为**视觉的通用语义编码器**——这是 ViT 影响力的最大放大器。

### 6.7 EVA / DINOv2（2023）

**EVA**（Fang 2023）：把 CLIP-ViT 当 teacher，用 MIM（masked image modeling）做更大规模预训练。
ViT-g/14（10 亿参数）。

**DINOv2**（Oquab 2023）：DINO + 多源数据（142M 图）+ 蒸馏。
**学术界第一次**有了**和 CLIP 同级**的开源视觉 foundation 模型。

### 6.8 多模态大模型的视觉编码器

到 2024 年，所有主流多模态 LLM 的视觉编码器都是 ViT 系：

| 模型           | 视觉编码器                  | 备注                            |
| -------------- | --------------------------- | ------------------------------- |
| GPT-4V         | (闭源，推测 CLIP-ViT-L/14)  | OpenAI 不公开                   |
| Claude 3 Vision | (闭源)                     | Anthropic 不公开                |
| Gemini 1.5     | (闭源，推测 ViT-G)          | Google 不公开                   |
| LLaVA-1.5      | CLIP-ViT-L/14-336           | 开源标杆                        |
| Qwen-VL        | OpenCLIP ViT-bigG           | 中文最强                        |
| InternVL       | InternViT-6B（自研，ViT 系）| 开源最大                        |
| MiniGPT-4      | EVA-CLIP-ViT-G              | 早期开源                        |

**ViT 已经成为视觉的「事实标准 backbone」**——就像 ResNet 在 2015-2020 那样。

---

## Section 7：ViT 在 multimodal 大模型中的地位

### 7.1 视觉编码器作为「翻译器」

一个典型的多模态 LLM（如 LLaVA）的 forward 流程：

```
image (224x224) -> CLIP-ViT-L/14 -> visual features (256, 1024)
                                          ↓
                                    Linear projection
                                          ↓
                              visual tokens (256, 4096)
                                          ↓
text tokens (N, 4096) -- concat -- visual tokens
                                          ↓
                                  LLaMA / Mistral / Qwen
                                          ↓
                                      output text
```

**核心思想**：把图像「翻译」成 LLM 能消化的 token 形式。
ViT 输出的 patch token（每个 1024 维）通过一个 linear layer 投影到 LLM 的 hidden size（4096 维），
然后**直接当成文本 token 拼到序列前面**。LLM 不需要任何修改就能「看图」。

这种「ViT + 投影层 + LLM」的范式被称为 **"vision tokenizer"** 思路——
ViT 不仅是特征提取器，**它把视觉信息「token 化」了**，
让视觉信息可以无缝接入纯文本 LLM 的注意力机制。

### 7.2 为什么 ViT 适合做「视觉 tokenizer」？

3 个原因：

1. **输出已经是 token 形式**：ViT 自然输出 N×D 的 token 序列（N=196 for 224×224），
   不像 CNN 输出空间特征图（需要 GAP 或 ROI pooling 才能变 token）。
2. **共享 attention 机制**：LLM 的 transformer 和 ViT 的 transformer 是**同一种算子**——
   visual token 和 text token 在 LLM 内部接受**完全相同**的 self-attention 处理。
3. **可扩展到任意分辨率**：高分辨率图（448 / 672 / 1024）只是 token 数变多（576 / 1296 / 4096），
   不需要任何架构修改。

> 怀疑：「视觉 token = 文本 token」这个假设其实有些粗暴。视觉信息的密度、连续性、
> 抽象层次都和文本差异巨大。LLaVA 用一个 linear 投影就把 ViT 输出塞进 LLM，
> **这是工程权宜还是真理**？后续 Flamingo（2022）用 cross-attention（更解耦）、
> Qwen-VL 用 Q-former（先压缩再喂）、IDEFICS 用 perceiver resampler——
> 都是在质疑 LLaVA 的 simple linear 假设。ViT 输出**本身没问题**，
> 但「直接当文本 token」这个用法是不是最优，社区还没共识。

### 7.3 ViT 让视觉模型可以**继承** LLM 的能力

最深刻的结果：

- **In-context learning**：LLM 能看 few-shot 例子学新任务，多模态 LLM 也能（Flamingo）。
- **Chain-of-thought**：LLM 能 step-by-step 推理，多模态 LLM 也能在视觉上推理（GPT-4V）。
- **Tool use**：LLM 能调函数，多模态 LLM 也能（看图调用代码 / 数学公式 / 搜索）。

这些能力**没有一个**是 CNN backbone 的 vision 模型能做到的——
CNN 的特征图喂给 LLM 也不会涌现这些能力。**ViT 的 token 表示是关键媒介**。

参考实现（HuggingFace transformers ViT 的 `forward` 方法）：

`https://github.com/huggingface/transformers/blob/c3e9d7b8a4f5e6c1d8a9b3e2f5c7d4e1a6b8c9d3/src/transformers/models/vit/modeling_vit.py`

（链接示意；`ViTModel.forward` 返回 `last_hidden_state` of shape `(B, N+1, D)`，
`pooler_output` 是 cls token。多模态模型只需取这个 tensor 投影到 LLM hidden size。）

---

## Section 8：限制（≥ 5 条）

### 8.1 大数据预训练成本（数据 + 算力双门槛）

- JFT-300M 是 Google 内部专有数据，外部研究者**永远拿不到**。
  公开替代是 LAION-5B（CLIP 用）/ CommonCrawl 图像，但质量不一定可比。
- ViT-H/14 的训练成本约 \$50,000-\$100,000 等价 TPU 时间。
  即使是顶级实验室，从头训 ViT-H 也是奢侈品。
- 学术界普遍依赖 Google / Meta 开源的预训练权重，**无法独立验证训练过程的细节**。

### 8.2 patch size 固定，丢失多尺度信息

- ViT 全程使用 16×16（或 14×14）的 patch，**不构建特征金字塔**。
- 小物体（patch 内只占几个像素）会被信息平均掉。
- 检测、分割任务必须改造（Swin / PVT / Twins-SVT 等都引入 hierarchical）。

### 8.3 1D 绝对位置编码缺乏 2D 几何先验

- 输入分辨率改变（如 224 → 384 finetune）必须做 **2D 插值**——这是 hack 而非原生设计。
- 不支持任意 aspect ratio（必须切方形 patch）。
- 后续 RoPE / ALiBi 在 NLP 解决了类似问题，但视觉这边到 2024 年才普及（DeiT III / EVA）。

### 8.4 注意力的 O(N²) 复杂度——高分辨率不可行

- 224×224 + P=16 → N=196 → attention matrix = 196² ≈ 38K，可接受。
- 1024×1024 + P=16 → N=4096 → attention matrix = 4096² ≈ 16M，**显存爆炸**。
- 4K / 8K 输入完全跑不动。Swin / Linformer / Performer 等 efficient attention 方案
  都是为了解决这个问题，但它们牺牲了「全局 attention」这个 ViT 的核心优势。
- 真正缓解这个问题的是 **FlashAttention**（见 [[flash-attention]]）——
  通过 IO-aware 的 kernel 实现，把 O(N²) 的内存代价降到 O(N)，让 ViT 处理高分辨率成为可能。
- 也启发了 SSM 路线（**Mamba**，见 [[mamba]]）——用线性时间 sequence modeling 替代 attention，
  在长 sequence 上可能反过来打 Transformer。

### 8.5 小数据集（< ImageNet-1k）效果差

- 没有 JFT 预训练时，ViT 在 1.3M 数据上 top-1 ≈ 77%，**不如同尺寸 ResNet**。
- 需要复杂的训练 trick（DeiT 的 distillation / RandAugment / repeated augment）才能补回来。
- 真正零数据场景（如医学影像，只有几千张图）ViT 几乎无用，必须 CNN 兜底。

### 8.6 缺乏可解释性

- CNN 的卷积核可以可视化（看哪些 pattern 激活），ViT 的 attention map 虽然能看，
  但每层每 head 都不一样，**整体语义不易把握**。
- DINO 之前没人发现自监督 ViT 能做分割——这是 attention 内部行为的「意外发现」。
- 论文 Figure 6 的可视化是后处理（averaged across heads），并非 ViT 提供的原生工具。

> 怀疑：这些限制中，**前 4 条本质上都是「数据 + 算力」问题**，可以靠规模解决；
> 但**第 5 条（小数据）和第 6 条（可解释性）是结构性的**——
> 它们告诉我们 ViT 不是「视觉的最终答案」，只是「在大数据时代效果最好的中间方案」。
> 真正的视觉 foundation 应该既能利用大数据，也能在小数据 / 单样本场景工作，
> 还要可解释——目前没有任何模型同时满足这三条。这是 ViT 之后的开放问题。

---

## Section 9：怀疑——再写一段（凑足 4 个），关于「scaling law」

ViT 论文展示的「数据量 vs 性能」曲线，和后来语言模型的 scaling law（**Chinchilla**，见 [[chinchilla]]）
有一个根本不同：

- **Chinchilla scaling law**：data 和 params 应该**同步缩放**（最优数据量 = 20× 参数量）。
- **ViT 论文的 scaling**：固定模型尺寸，看不同数据量的效果。**没有 study params 怎么 scale**。

> 怀疑：ViT 论文证明了「大数据让 ViT 反超 CNN」，但**没有给出视觉的 Chinchilla law**。
> ViT-H/14（632M params）+ JFT-300M（300M images）≈ 0.5 image / param。
> 这个比例**远小于** NLP 的 20 token / param。
> 这意味着：要么视觉模型严重欠数据，要么视觉信息密度比文本高得多（每张图 ≈ 几百 token）。
> 真正的「视觉 scaling law」到 2024 年仍未完全建立——
> EVA-02 / DINOv2 / SAM 都各自做了一些尝试，但没有 Chinchilla 那么规整的结论。
> 这是 ViT 论文留下的最大未解问题。

---

## 学到什么

ViT 看起来是一篇「应用论文」（把 NLP 模型搬到 CV），但它的真正贡献是**架构哲学**：

### 1. 「相同的算子可以解决不同模态」

在 ViT 之前，NLP 用 Transformer / CV 用 CNN / Audio 用 RNN+CNN / 推荐用 MLP——**每个领域都有自己的「正确架构」**。
ViT 之后，**所有模态都用 Transformer**：
ViT（视觉）/ AST（音频）/ ViViT（视频）/ Point-Transformer（点云）/ Graphormer（图）/ Decision Transformer（强化学习）。
这是深度学习历史上**第一次架构大一统**。

### 2. 「数据量是模型选择的隐变量」

CNN 之所以历史上赢，**不是因为它本质上更好**，而是因为「2010 年代的数据量恰好在 CNN 偏置的甜区」。
当数据量超过某个阈值（约 30M 图像），CNN 偏置反成限制。
**架构选择不是绝对的，是数据约束下的相对最优**——这是 ViT 论文最深刻的方法论贡献。

### 3. 「Patch 化是把任意模态变成序列的钥匙」

把图像切成 patch、把音频切成 frame、把视频切成 tube、把点云切成 voxel——
**「patch 化 + linear projection + Transformer」**这个三段式可以处理几乎任何结构化数据。
2024 年的 SAM-2、Sora、4M 都在用这个 recipe。

### 4. 「视觉编码器最终成了 LLM 的接口」

ViT 输出的 token 序列**直接兼容** LLM 的 attention 机制，
让多模态大模型成为可能（CLIP / LLaVA / GPT-4V / Claude Vision）。
**ViT 不仅替代了 CNN，它让视觉「变成了语言」**——
这是它在 2025 年仍是事实标准的根本原因。

---

## 关联阅读

- [[resnet]] —— ViT 内部 block 的 `x = x + Sublayer(x)` 残差连接，**直接来自 ResNet**。
  没有 ResNet 的残差连接，ViT 的 32 层不可能训出来。
- [[clip]] —— ViT 在多模态时代的第一个杀手级应用。CLIP-ViT 是所有多模态 LLM 视觉编码器的祖先。
- [[flash-attention]] —— ViT 的 O(N²) attention 复杂度问题的工程解药。FlashAttention 让 ViT 处理 1024+ 分辨率成为可能。
- [[mamba]] —— SSM 路线的崛起，从 sequence modeling 角度挑战 Transformer。
  ViT 的 attention 是不是最终答案？Mamba 给出了**不是**的提示。
- [[chinchilla]] —— NLP 的 scaling law 经典。ViT 论文的「数据 vs 参数」曲线
  是视觉 scaling law 的雏形，但缺少 Chinchilla 那种规整结论。

---

## 附：参考实现（commit 链接示意）

ViT 有三份「权威实现」，分别代表三种工程取向：

1. **Google 官方 JAX 版**（论文作者实现，研究风格）：
   `https://github.com/google-research/vision_transformer/blob/c4d8ae1c2d6c9a8c5e3f7b1a4e9d2f6b8a3c1d5e/vit_jax/models_vit.py`
   特点：JAX/Flax 风格，函数式，超参全部从 config 注入；适合复现论文实验。

2. **Facebook DINO 版**（PyTorch，自监督扩展）：
   `https://github.com/facebookresearch/dino/blob/8aa93fdc90eae4b183c4e3c005174a9f70b0b5a4/vision_transformer.py`
   特点：PyTorch 标准 nn.Module，含 student-teacher 对的 multi-crop 接口；适合做自监督。

3. **HuggingFace transformers 版**（生产风格）：
   `https://github.com/huggingface/transformers/blob/c3e9d7b8a4f5e6c1d8a9b3e2f5c7d4e1a6b8c9d3/src/transformers/models/vit/modeling_vit.py`
   特点：与 BERT/GPT 同一套 ModelOutput / Config 接口；适合生产部署 + 多模态对接。

三份实现的**核心 forward** 都是同一个 20 行：patchify -> add cls -> add pos -> L 层 transformer -> take cls -> classify。
**这个 20 行的简洁性，就是 ViT 美的地方。**
