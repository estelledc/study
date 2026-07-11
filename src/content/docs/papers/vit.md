---
title: ViT — Vision Transformer
来源: 'Dosovitskiy et al., "An Image is Worth 16x16 Words", ICLR 2021'
日期: 2026-05-29
分类: 计算机视觉
难度: 中级
---

## 是什么

ViT（**Vision Transformer**）是把 [[attention]] 直接搬到图像识别的方法——**把图片切成 16×16 的小方块当成「单词」喂进 Transformer**。日常类比：以前看图（CNN）像盲人摸象，从左上滑到右下一块块拼；ViT 像把图片裁成拼图碎片，每块单独看一眼，再用注意力机制让它们相互商量。

```
224×224 图片  →  切成 14×14 = 196 个 16×16 小块
              →  每块拉直 → 768 维向量
              →  当成 196 个「单词」喂给 Transformer Encoder
              →  最后取一个 [CLS] 输出做分类
```

整个网络**没有一个卷积层**（除了把 patch 投影成向量那一步在工程上用 conv2d 实现，但 stride=kernel 等价于「每块独立做线性映射」）。

## 为什么重要

ViT 是计算机视觉过去十年最关键的转折点之一：

- **第一次证明** Transformer 在视觉任务上能超过 ResNet / EfficientNet（前提：像 JFT-300M 这样的大规模预训练）
- 启发了 [[clip]] / [[dino]] / [[mae]] / [[sam]] 等主流视觉模型——它们的图像编码器**多基于** ViT（仍有 ConvNeXt 等 CNN 路线）
- 让"视觉 + 语言一套架构"成为可能——GPT-4V / Gemini / LLaVA 的图像分支都是 ViT
- 揭示了一条经验规律：小数据（约 ImageNet-1k）上 CNN 仍常占优；大规模预训练后 ViT 反超

## 核心要点

ViT 的设计可以拆成 **三件事**：

1. **Patch embedding（把图变成单词）**：图片切成不重叠的 16×16 小块，每块拉直成 768 维向量。这一步是 ViT 把图像「token 化」的关键。

2. **Position embedding（告诉模型谁在哪里）**：Transformer 本身不知道顺序，所以给每个 patch 加一个**可学习**的位置向量。类比：拼图碎片背面写了"我是第几块"。

3. **[CLS] token + Transformer Encoder**：在 196 个 patch 前面再拼一个**专门用来汇总全图**的 token，这个设计直接抄自 [[bert]]。最后取 [CLS] 的输出喂分类头。

整个 forward 流程跟 BERT 几乎一样——这就是 ViT 的「美」：**少即是多**。

## 实践案例

### 案例 1：一张 224×224 的图怎么进 ViT

```
输入：x ∈ R^(224 × 224 × 3)

1. 切成 14×14 = 196 个 patch，每个 16×16×3 = 768 维
2. 线性投影到 D=768（可用 Linear(768,D) 或 Conv2d(3,D,16,16)）
3. 前面拼一个 [CLS] → 196 + 1 = 197 个 token
4. 加上位置编码 → 喂给 12 层 Encoder → 取 [CLS] 接分类头
```

**逐部分解释**：196 是「拼图块数」；+1 的 [CLS] 是「全图汇总位」；投影只是把每块压成同长度向量。

### 案例 2：patch size 和 token 数的关系

| 输入分辨率 | patch size | token 数（不含 CLS） |
| ---------- | ---------- | -------------------- |
| 224×224    | 16         | 14×14 = 196          |
| 224×224    | 14         | 16×16 = 256          |
| 384×384    | 16         | 24×24 = 576          |

**逐部分解释**：

- token 数 = (高/patch) × (宽/patch)；patch 越小，块越多、看得越细
- attention 是 O(N²)：token 从 196→256（约 1.3×），计算量约 1.7×；到 576 则约 8.6×
- 所以高分辨率常换更大 patch，或改用窗口注意力（如 Swin）

### 案例 3：三个尺寸的 ViT

| 模型     | 层数 | 隐层维 | 头数 | 参数量 |
| -------- | ---- | ------ | ---- | ------ |
| ViT-B/16 | 12   | 768    | 12   | 86M    |
| ViT-L/16 | 24   | 1024   | 16   | 307M   |
| ViT-H/14 | 32   | 1280   | 16   | 632M   |

**逐部分解释**：名字里 `/16` 是 patch size；B/L/H 是 Base/Large/Huge。ViT-H/14 在 JFT-300M 预训练后 ImageNet top-1 达 88.55%，**第一次让 Transformer 在视觉上 SOTA**。

## 踩过的坑

1. **小数据集训不出来**：原始 ViT 直接在 ImageNet-1k（1.3M 图）上训，top-1 只有 77%——**比同等规模的 ResNet 还差**。论文作者只能上 JFT-300M（Google 内部 3 亿张图）才让 ViT 反超。学术界拿不到 JFT，等了一年才有 DeiT 用 distillation + 强增强补回来。

2. **patch=16 是经验数字**：论文没说为什么是 16。224 必须能整除 patch（224/16=14），patch 太小则 token 数爆炸，太大则单 token 信息太密。16 是"第一次跑通的那个数"，社区惯性沿用。

3. **1D 位置编码缺 2D 几何**：ViT 用 1D 学习的位置向量（位置 0、1、2...）。换分辨率时（224 → 384 finetune）必须**对位置编码做 2D 插值**——这是 hack，不是原生设计。后续 RoPE / relative position 才优雅解决。

4. **O(N²) 注意力 → 高分辨率跑不动**：1024×1024 + patch=16 → 4096 个 token → attention 矩阵 16M 元素，显存爆炸。这就是 [[flash-attention]] 和 Swin（窗口注意力）出现的原因。

5. **看似无偏置，实际有强偏置**：论文宣称 ViT「没有 CNN 的归纳偏置」，但 patch 划分本身就是一种 locality 假设——「同一个 16×16 区域内像素更相关」。位置编码也假设了「位置很重要」。所以 ViT 是**比 CNN 弱的偏置**，不是真无偏置。

## 适用 vs 不适用场景

**适用**：

- 大规模预训练后再下游微调（JFT / LAION 量级；CLIP / DINOv2 / MAE 都在此档）
- 多模态模型的图像编码器（CLIP-ViT 是事实标准）
- 任务需要全局理解（图像分类、图文检索、视觉问答）
- 想和 LLM 做接口（ViT 输出天然是 token 序列，LLM 能直接消化）

**不适用**：

- 小数据场景（≲ ImageNet-1k / < 1M 图，医学影像 / 工业检测）→ CNN、hybrid 或 DeiT 式蒸馏
- 高分辨率密集预测（4K 检测 / 分割）→ 用 Swin 或 hierarchical 变体
- 需要平移等变（数据增强不够时）→ CNN 的卷积天然平移等变
- 极致推理速度敏感的边缘设备 → CNN 的卷积 op 仍是最优化的算子

## 历史小故事（可跳过）

- **2017 年**：Vaswani 等人发 *Attention is All You Need*，[[attention]] 在 NLP 横扫一切。视觉圈开始问："Transformer 什么时候能做视觉？"
- **2018-2020 年**：iGPT（把像素当 token，分辨率上不去）、DETR（CNN+Transformer 检测，不敢扔卷积）多次尝试失败。
- **2020 年 10 月**：Dosovitskiy 团队把论文 *An Image is Worth 16×16 Words* 挂上 arXiv。第一次**完全扔掉 CNN**——靠 patch 化解决序列长度，靠 JFT-300M 解决数据稀缺。
- **2021 年 ICLR**：论文正式发表。同年 DeiT（让小数据也能训）、Swin（hierarchical + 窗口注意力）相继出现。
- **2021-2022 年**：[[clip]] / [[dino]] / [[mae]] 在 ViT 基础上做对比学习 / 自监督，全面打开视觉自监督新时代。
- **2023-2024 年**：[[sam]] / DINOv2 / EVA / 各家多模态 LLM 的视觉编码器**大多**基于 ViT；CNN 仍在边缘与部分骨干里出现，但已非默认首选。

ViT 是 2020 年代视觉的 ResNet 时刻——架构转折点。

## 学到什么

1. **同一种算子可以解决不同模态**——ViT 之前 NLP 用 Transformer / CV 用 CNN / 音频用 RNN+CNN，每个领域有自己的"正确架构"。ViT 之后所有模态共用 Transformer，这是深度学习史上第一次架构大一统。

2. **数据量是架构选择的隐变量**——CNN 历史上赢，不是因为本质更好，而是因为「2010 年代的数据量恰好在 CNN 偏置的甜区」。到 JFT 这类大规模数据后，弱偏置的 ViT 反而更能吃满数据。

3. **Patch 化是把任意结构化数据变成序列的钥匙**——图切 patch、音频切 frame、视频切 tube、点云切 voxel——「patch + linear + Transformer」这个三段式可以处理几乎任何数据。

4. **视觉编码器最终成了 LLM 的接口**——ViT 输出的 token 序列**直接兼容** LLM 的 attention，让多模态大模型成为可能。这才是 ViT 在 2025 年仍是事实标准的根本原因。

## 延伸阅读

- 论文 PDF：[Dosovitskiy et al. 2021](https://arxiv.org/abs/2010.11929)（22 页，Section 3.1 架构 + Section 4.2 偏置讨论是核心）
- 视频教程：[Yannic Kilcher — ViT 论文逐段精读](https://www.youtube.com/watch?v=TrdevFK_am4)（45 分钟）
- 自己跑：[HuggingFace transformers ViT](https://github.com/huggingface/transformers/tree/main/src/transformers/models/vit)（生产风格 PyTorch 实现）
- 进阶：[Lucas Beyer — Better plain ViT baselines](https://arxiv.org/abs/2205.01580)（论文一作之一总结的训练 trick 集合）

## 关联

- [[attention]] —— ViT 的核心算子。没有 self-attention 就没有 ViT。
- [[bert]] —— ViT 的 [CLS] token 设计、pre-norm Transformer 结构、训练流程都直接抄自 BERT。
- [[clip]] —— ViT 在多模态时代的第一个杀手级应用。CLIP-ViT 是所有多模态 LLM 视觉编码器的祖先。
- [[dino]] —— 自监督 ViT，attention map 自动学到语义分割，无需任何标签。
- [[mae]] —— mask 75% 的 patch 让 ViT 重建——把 BERT 的 MLM 思想搬到视觉。
- [[sam]] —— SAM 的图像编码器是 MAE 预训练的 ViT-H，证明 ViT 也能做密集预测。
- [[3d-gaussian-splatting]] —— 虽然 3DGS 本身不是 ViT，但场景重建里的 feature 编码层越来越多用 ViT 提语义。
- [[flash-attention]] —— ViT O(N²) 注意力的工程解药，让高分辨率 ViT 可行。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[attention]] —— Attention Is All You Need
- [[autonomous-driving-waymo-2021]] —— Waymo Open Dataset: A Large-Scale Dataset for Autonomous Driving
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[coca-2022]] —— CoCa — 把对比和生成两种多模态训练目标合到一个模型里
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[dino]] —— DINO 自监督视觉 transformer
- [[dit]] —— DiT — Diffusion Transformer
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[mae]] —— MAE — Masked Autoencoders
- [[resnet]] —— ResNet — 残差连接
- [[sam]] —— SAM — Segment Anything

