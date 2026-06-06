---
title: MAE — Masked Autoencoders
来源: 'He et al., "Masked Autoencoders Are Scalable Vision Learners", CVPR 2022'
日期: 2026-05-29
子分类: 计算机视觉 / 自监督
分类: 机器学习
难度: 中级
schema_version: legacy-short
provenance: legacy-migrated
---

## 是什么

MAE 是 Kaiming He（[[resnet]] 作者）2021 年做的"图像版 [[bert]]"——把图片切成方块（patch），随机盖住 75%，让 [[vit]] 看剩下的 25%，再让一个轻量 decoder 重建被盖住的部分。

日常类比：[[bert]] 把句子里 15% 的词盖住，让模型猜被盖住的词；MAE 把图片里 75% 的小方块盖住，让 ViT 猜被盖住的方块。两件事是同一个剧本，只是输入从文字换成图块。

预训练完，decoder 直接扔掉，只留 encoder。下游分类、检测、分割都接这个 encoder。

## 为什么重要

不理解 MAE，下面这些事都没法解释：

- 为什么 2021 年之后视觉自监督的"标准答案"换了一次——从 contrastive learning（SimCLR / MoCo）换成 mask reconstruction
- 为什么"盖 75%"反直觉地比"盖 15%"更好——和 [[bert]] 的设定相反
- 为什么自监督预训练（不用 label）的 ViT 能比有 label 的监督预训练更强（ImageNet 1k fine-tune 87.8% vs 84%）
- 为什么后续 SimMIM / VideoMAE / AudioMAE 都按 MAE 的剧本走——它确立了一种可复制的范式

## 核心要点

MAE 三个关键设计：

1. **盖 75%**：图像信息高度冗余（一块草地周围还是草地），盖少了模型抄邻居就能猜对，任务太简单。盖到 75%，邻居都看不见，才必须从全局结构里推。这个数字比 [[bert]] 的 15% 高 5 倍，是 MAE 最反直觉的工程选择。

2. **不对称 encoder-decoder**：encoder 只接收 25% 可见 patch（49 个），decoder 接收全部 196 个位置（49 个 visible feature + 147 个 mask token）。encoder 大且重，decoder 小且浅（默认 8 层、dim=512，参数量只有 encoder 的几个百分点）。下游只用 encoder，decoder 训完丢弃。

3. **直接预测像素**：每个被盖 patch 的 target 是它原始的 16×16 RGB 像素（做了 per-patch normalize）。loss 是 MSE，只在被盖的 patch 上算。不像 BEiT 还要先训一个 dVAE 把像素离散成 token——MAE 一步到位。

具体到 ViT-B 在 224×224 图片上：总 patch 数 = (224/16)² = 196，盖 75% = 147 个，留 49 个给 encoder。decoder 的输入是 49 个 visible feature 经投影 + 147 个共享的可学习 mask token，按原始位置摆好后过 8 层 transformer 重建。

## 实践案例

### 案例 1：ImageNet 上越级打怪

ViT-Huge 用 MAE 预训练 1600 epoch（不用任何标签），再用 ImageNet-1k 标签 fine-tune：

- 224 分辨率：86.9% top-1
- 448 分辨率：**87.8% top-1**

对比同时期监督训练的 ViT-L 大约 84%。换句话说，MAE 不需要标签的预训练比有标签的监督训练更强。这是 MAE 最有说服力的卖点。

### 案例 2：分割任务涨幅最大

ADE20K 语义分割：

- 监督预训练 ViT-L：49.9 mIoU
- MAE 预训练 ViT-L：**53.6 mIoU**

直觉：分割本身就是密集像素预测，和 MAE 的预训练目标（重建像素）天然对齐。检测（COCO）也类似，APbox 涨 3-4 个点。

### 案例 3：训练比 contrastive learning 快

encoder 只跑 49 个 token（不是 196 个）。Self-Attention 是 O(N²) 的，所以 [[attention]] 部分 16× 加速，整体大约 4× 加速。同样的 wall-clock 预算下，MAE 能跑更多 epoch 或更大模型。ViT-H 1600 epoch 在 128 张 V100 上 31 小时——对当时的视觉自监督来说很轻量。

## 踩过的坑

1. **75% 不是普世值**：论文只在 ImageNet 上 sweep 出 75%。换数据集（医疗影像、卫星图、视频）需要重新调。VideoMAE 用 90%，因为时间维度让冗余更高。

2. **linear probe 偏弱**：MAE encoder 的 feature 直接接 linear classifier 大约 75% top-1，明显输给同期 [[dino]]（80%）。这意味着 MAE 学的是"fine-tune ready"feature，不是"task-agnostic"feature——下游必须 fine-tune 才能挖出潜力。大模型时代很多场景要 frozen feature，这是 MAE 的弱项。

3. **像素重建丢高频**：MSE on pixel 倾向输出"模糊但平均正确"。重建可视化能看到边缘模糊。后续 EVA 用 [[clip]] feature 做 target 部分缓解。

4. **decoder 设计敏感**：8 层 dim=512 是 sweet spot，偏离掉得很快。意味着这个超参不能直接 transfer 到所有数据集。

## 适用 vs 不适用场景

**适用**：

- ViT backbone 的视觉自监督预训练，下游会 fine-tune
- 密集预测任务（分割 / 检测）——pretext 与下游目标天然对齐
- 算力受限但有大量无标签图像的场景——比 contrastive 省 3-4×

**不适用**：

- 需要 frozen feature 直接用（linear probe / k-NN / 检索） → 用 [[dino]] / DINOv2
- 需要 zero-shot 跨模态（图搜文 / 文搜图） → 用 [[clip]]
- 数据集小、冗余度未知 → mask ratio 需要重新 sweep

## 历史小故事（可跳过）

2018 年 [[bert]] 在 NLP 里把"mask 一段、预测被 mask 的"剧本跑通了。视觉这边盯着这个剧本看了三年一直搬不过来——像素是连续的、邻居能抄答案、早期尝试都不如 contrastive learning。

- **2020**：[[vit]] 把 transformer 搬进视觉，给后来的 mask reconstruction 提供了 patch 化的 backbone
- **2021-06**：BEiT 第一次在视觉上跑通 mask 预测，但要先训一个 dVAE 把 patch 离散成 token，pipeline 复杂
- **2021-11**：MAE 发表。两个简单 design choice（75% mask + 不对称 encoder-decoder）+ 直接预测像素，第一次在 ViT 上把 mask reconstruction 推到 SOTA
- **2022-01**：SimMIM（Microsoft 同期）证明对称设计也能 work，MAE 的不对称是算力优势不是必要条件
- **2023**：EVA 把 MAE scale 到 1B 参数，重建目标从像素换成 [[clip]] feature，ImageNet fine-tune 90%+
- **2023**：DINOv2 整合 [[dino]] + iBOT，成为 2024-2025 视觉 foundation feature 的事实标准

MAE 是这条线上"视觉 BERT 终于跑通"的那篇。

## 学到什么

1. **redundancy 决定 mask 比例**：信号越冗余，必须盖得越多任务才有意义。这条原则可以 transfer 到视频（VideoMAE 用 90%）、医疗影像、卫星图等模态。

2. **训完即丢的模块设计自由度大**：MAE 的 decoder 只在预训练用，下游丢，所以可以激进地小。这是节省算力的通用 pattern——BYOL 的 predictor、[[dino]] 的 teacher network 都是同一思路。

3. **不对称设计的算力优势是 quadratic 决定的**：因为 [[attention]] 是 O(N²)，砍掉 75% input 在 attention 部分收益 16×。换 linear attention 优势就缩水。

4. **简单 + 大胆超参 击败精巧设计**：He Kaiming 一贯风格——[[resnet]] / MAE / [[sam]] 都是用最朴素的设计 + 一个反直觉的工程选择，而不是堆复杂模块。

## 延伸阅读

- 论文 PDF：[He et al. 2021, arXiv:2111.06377](https://arxiv.org/abs/2111.06377)
- 官方代码：[facebookresearch/mae](https://github.com/facebookresearch/mae)
- 同期对照：SimMIM（Microsoft，对称设计）、BEiT（dVAE token 重建）
- 后续路线：EVA（[[clip]] feature 作 target）、DINOv2（task-agnostic feature 路线）
- [[bert]] —— NLP 里把 mask reconstruction 跑通的原型
- [[vit]] —— MAE 的 backbone，没有任何针对性魔改

## 关联

- [[bert]] —— mask reconstruction 范式的原型；MAE 是视觉版搬运
- [[vit]] —— MAE 的 encoder backbone，标准 ViT 没改
- [[dino]] —— 同期视觉 SSL 的不变式范式，linear probe 强、fine-tune 弱
- [[clip]] —— 同期视觉 SSL 的对齐式范式，强项 zero-shot
- [[resnet]] —— He Kaiming 早期作品，与 MAE 同一种"简单 + 大胆"工程审美
- [[sam]] —— 下游分割 foundation model，部分用了 MAE-style pretraining
- [[attention]] —— ViT 用的就是 self-attention；MAE 砍 75% input 的算力优势源于 attention 的 quadratic 复杂度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[dino]] —— DINO 自监督视觉 transformer
- [[electra-2020]] —— ELECTRA — 把猜词题改成判真假题，训练效率 4 倍
- [[resnet]] —— ResNet — 残差连接
- [[sam]] —— SAM — Segment Anything
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[vit]] —— ViT — Vision Transformer

