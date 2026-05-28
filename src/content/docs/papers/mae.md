---
title: MAE Masked Autoencoder 视觉自监督
来源: He et al., "Masked Autoencoders Are Scalable Vision Learners", CVPR 2022 / arXiv 2111.06377
---

> 一句话：MAE 把 BERT 的「mask 一段，预测被 mask 的那段」搬到视觉，但把 mask ratio 从 NLP 的 15% 拉到 75%，并且把 encoder/decoder 设计成不对称的——encoder 只看可见的 25%，decoder 是 lightweight 的、训完就丢。最反直觉的发现是 75% 这个高得吓人的比例反而效果最好。

## 历史定位

把视觉自监督（SSL）放在一条主线上看：

- 2018 BERT（Devlin et al.）——NLP 用 masked language modeling 横扫所有任务，预训练范式确立
- 2019-2020 MoCo / SimCLR / BYOL——视觉 SSL 走 contrastive 路线，靠正负样本对+大 batch 拼
- 2021-04 [[dino]]（Caron et al.）——self-distillation + ViT，emergent attention 让 SSL 受关注
- 2021-06 BEiT（Bao et al.）——视觉 BERT 的第一次尝试，用 dVAE token 重建被 mask 的 patch
- **2021-11 MAE（He et al.）——pixel 重建 + 75% mask + asymmetric encoder-decoder，简单但工程上跑通**
- 2022-01 SimMIM（Xie et al.，Microsoft）——同期工作，symmetric encoder-decoder 也能 work
- 2022 iBOT（Zhou et al.）——DINO + MIM 缝合
- 2023 EVA（Fang et al.）——把 MAE scale 到 1B 参数 + CLIP target
- 2023 DINOv2（Oquab et al.）——整合 DINO + iBOT 思想，LVD-142M 数据

读 MAE 等于读视觉里 BERT-style 路线第一次真正跑通的工作。它和 [[dino]]、[[clip]] 三家一起代表了视觉自监督的三种范式：MAE 重建像素，DINO 自蒸馏不变性，CLIP 跨模态对齐。

---

## Section 1：动机——BERT 在 NLP 跑通了，视觉的对应方案是什么

### 1.1 NLP 的剧本

2018-2020 这几年 NLP 走了一个非常清晰的剧本：

- 拿大量无标注文本
- 随机 mask 掉 15% 的 token
- 训练一个 transformer 去预测被 mask 的 token
- 训完之后下游任务 fine-tune，所有任务一起涨

这个剧本简单、可复制、可 scale。GPT 家族走的是单向 LM，BERT 家族走的是双向 MLM，本质都是「输入部分可见，预测被遮挡的」。

### 1.2 视觉为什么没复制成功

2018-2021 视觉这边一直没把这个剧本搬过来跑通，原因：

- 像素是连续值，token 是离散值——不能直接 cross-entropy
- 图像 redundancy 比文本高得多——mask 一个像素邻居能直接抄答案
- 早期尝试（context encoder、jigsaw、rotation）都是手工 pretext task，没有一个能匹配 BERT 在 NLP 的统治力
- contrastive learning（SimCLR / MoCo）走的是另一条路：用增强一致性，不重建

到 2021 年，视觉 SSL 的主流是 contrastive + self-distillation（[[dino]]），重建路线被普遍认为不好用。

### 1.3 MAE 的赌注

MAE 论文做了一个反直觉的押注：**视觉 BERT 不是不能 work，是 mask ratio 太低、decoder 设计太重**。具体两条：

1. 图像 redundancy 高 → 必须 mask 极高比例（75%）才能让任务真的难
2. encoder 不需要看 mask token → 不对称设计省 4x 算力

> 怀疑：MAE 75% mask 是经验值，论文给的解释是"图像 redundancy 高"。但具体阈值（不是 70% / 80%）的选择没有理论支撑。换数据集（医疗影像、卫星图、X-ray）应该是不一样的——这些图像 redundancy 更高还是更低？论文没探索这一维度，留给后续工作。我个人推测医疗影像上 80-85% 才是 sweet spot，因为大面积都是均匀组织。

---

## Section 2：核心定义

### Definition 1：masked autoencoding

masked autoencoding 是一类自监督学习方法的总称：

- 输入 `x`，按某种规则 mask 掉一部分得到 `x_visible`
- 模型 `f(x_visible)` 试图重建被 mask 的部分 `x_masked`
- loss = distance(predicted, x_masked)

NLP 里 BERT 是 `mask 15% 的 token, predict cross-entropy on token id`。  
视觉里 MAE 是 `mask 75% 的 patch, predict MSE on normalized pixel`。

这是一个非常古老的想法（denoising autoencoder, Vincent 2008），MAE 的贡献不是发明它，而是给出一组让它在 ViT 上跑通的工程参数。

### Definition 2：75% mask ratio

mask ratio = masked patches / total patches。

- BERT 用 15%——文本信息密度高，mask 多了任务不可解
- MAE 用 75%——图像 redundancy 高，mask 少了任务太简单（邻居可抄）

具体到 ViT-B 16x16 patch / 224x224 图：

- 总 patch 数 = (224/16)^2 = 196
- 75% mask → 147 个 mask，49 个 visible
- encoder 只跑 49 个 token

### Definition 3：asymmetric encoder-decoder

「不对称」指的是 encoder 和 decoder 在以下三方面不平衡：

| 维度 | encoder | decoder |
|------|---------|---------|
| 容量 | 大（标准 ViT-B/L/H）| 小（默认 8 层 dim=512）|
| 输入 | 只看可见 25% patches | 看全部 100%（visible features + mask tokens）|
| 用途 | 预训练 + 下游 | 仅预训练，下游丢弃 |

这个不对称是 MAE 的工程关键。如果 encoder 也接受 mask token，那 encoder 算的是 "100% patches → all patches"，计算 4x，并且 mask token 在 fine-tune 阶段不存在，造成 train/test gap。

---

## Section 3.1：Encoder 设计

### 3.1.1 输入处理

输入图像 224x224 → 切成 14x14=196 个 16x16 patches → linear projection 到 dim=768（ViT-B）→ 加 positional embedding → 随机 shuffle → 取前 25%（49 个）作为 encoder 输入。

shuffle + take-first 是 token sampling 的实现 trick。等价于「均匀随机选 25%」，但 GPU 上更好实现。

### 3.1.2 主干

encoder 主干是标准 ViT，没有任何针对 MAE 的修改：

- Multi-head Self-Attention
- MLP block
- LayerNorm pre-norm
- residual connection

ViT-B / ViT-L / ViT-H 三档对应 86M / 307M / 632M 参数。

### 3.1.3 算力优势

encoder 处理 49 个 token 而不是 196 个。Self-Attention 的复杂度是 O(N^2 d)，所以理论上 attention 部分 16x 加速。整体（含 MLP，复杂度 O(N d^2)）大约 4x 加速。

这意味着：

- 同样 wall-clock，MAE 能训 4x 更多 epoch
- 同样 token budget，MAE 能用更大的 model
- 论文用 800 epochs ViT-H 训出 87.8% ImageNet-1k，这个组合在没有不对称设计下根本训不动

> 怀疑：MAE 的 4x 加速依赖于 attention 是 quadratic。如果换成 linear attention（Performer / Linformer），不对称设计的算力优势会缩水。但论文没讨论这点。我猜对 long-context attention（图像放大到 1024x1024）这个 trade-off 会更复杂。

### 3.1.4 GitHub 实现

MAE 官方代码：

- 链接示意（40-char hex commit hash）：`https://github.com/facebookresearch/mae/blob/efb2a8062c206524e35e47d04501ed4f544c0ae5/models_mae.py`
- encoder 部分：`MaskedAutoencoderViT.forward_encoder`
- 实现 token sampling：`random_masking` 函数，shuffle + slice

---

## Section 3.2：Decoder 设计

### 3.2.1 输入构造

decoder 的输入需要把 encoder 输出的 49 个 visible feature 和 147 个 mask token 拼起来，并按原始位置排好序。具体：

1. encoder 输出 `[B, 49, dim_enc]`
2. 准备 147 个相同的 learnable mask token `[B, 147, dim_dec]`
3. visible feature 经 linear projection 从 `dim_enc` 投到 `dim_dec`
4. 按 shuffle 时记录的 `ids_restore` 把 visible 和 mask 按原位置拼回 `[B, 196, dim_dec]`
5. 加上 positional embedding（这次是全部 196 个位置）

### 3.2.2 主干

decoder 默认配置：

- 8 层 transformer
- dim = 512
- 8 heads
- 比 encoder 浅 + 窄很多

参数量大约 25M，是 ViT-H encoder（632M）的 4%。

### 3.2.3 输出与丢弃

decoder 最后一层 linear projection 到 `patch_size^2 * 3 = 768`（per pixel RGB），reshape 回 16x16 patch。

下游任务（分类、检测、分割）只用 encoder，decoder 整个丢弃。这意味着 decoder 的设计选择只影响预训练效率，不影响下游精度的天花板。

### 3.2.4 GitHub 实现

- 链接示意（40-char hex commit hash）：`https://github.com/facebookresearch/mae/blob/9d9ec06ec85ca9b6d40c8bf67b4f9ca2cb3c0ce7/main_pretrain.py`
- decoder 部分在 `MaskedAutoencoderViT.forward_decoder`
- 重建 loss 在 `forward_loss`，注意只对 mask 部分计算

> 怀疑：MAE 论文反复强调"asymmetric encoder-decoder"是关键，但 SimMIM（Microsoft 同期工作）用 symmetric 设计也跑通了，性能也接近。MAE 的 asymmetric 是否被过度神化？还是有微妙的 calibration 优势（比如 encoder 没见过 mask token，下游 fine-tune 不需要适配）？这个疑问到现在（2026）也没看到一篇正面对比的论文。

---

## Section 3.3：重建目标

### 3.3.1 normalized pixel target

每个被 mask 的 16x16 patch，target 是这个 patch 的像素值，但要做 per-patch normalization：

```
target_patch = (raw_patch - mean(raw_patch)) / std(raw_patch)
```

normalize 是 per-patch（不是 per-image）。原因：去掉局部平均亮度后，模型被迫学高频纹理，而不是学"这块大概是亮的还是暗的"。

### 3.3.2 MSE loss only on masked

loss 只在被 mask 的 patch 上计算：

```
L = mean((pred[mask] - target[mask])^2)
```

不在 visible patch 上计算。原因：visible patch 的"重建"本质是 identity，对学习没贡献。

### 3.3.3 为什么不用 cross-entropy

BERT 用 cross-entropy on token id 是因为文本是离散的，有有限词表。  
图像是连续值，没有自然的离散化（除非额外训一个 dVAE 像 BEiT 那样）。  
MAE 选择 MSE on continuous pixel，简单有效。

> 怀疑：MAE 重建 pixel 而不是 token（vs BEiT / dVAE）。pixel 重建是不是早期权宜之计？现代 MAE-like（如 EVA）都开始用 CLIP / dVAE 提取的语义 token 作为重建目标，因为 pixel 包含太多对下游无用的低级细节（光照、纹理）。我个人押 2025 之后 pixel 重建会被基本替换掉。

---

## 架构总览图

![MAE 架构总览](/papers/mae/01-architecture.webp)

图解读：

1. 输入图分 16 个 patches
2. 随机 mask 掉 12 个，留 4 个 visible
3. encoder（heavy）只看 4 个 visible patch，输出 4 个 feature
4. decoder（lightweight）看 [4 visible features + 12 mask tokens]，预测全部 16 个 patch 的像素
5. loss 只在 12 个 masked patch 上计算 MSE

---

## Section 4：关键观察

### 4.1 mask ratio 必须很高

论文 Figure 5 是 MAE 最重要的实验。横轴是 mask ratio（10%-90%），纵轴是下游性能。

- 10% mask：fine-tune 83% 左右——任务太简单，学不到东西
- 30% mask：fine-tune 84.5%——开始有用
- 50% mask：fine-tune 85.4%——继续涨
- **75% mask：fine-tune 85.9%——sweet spot**
- 90% mask：fine-tune 84.6%——信号太稀疏，往下掉

这个曲线证明了 MAE 的核心论点：图像 redundancy 高，mask 必须够高任务才有意义。

> 怀疑：曲线在 75% 附近相对平坦（70%-80% 都能 work）。这说明"75%"这个数字本身不重要，重要的是"足够高"。这种平坦度暗示这个超参对数据集可能比较 robust，但论文只在 ImageNet 上跑过，其他数据集需要重新调。

![mask ratio ablation](/papers/mae/02-mask-ratio.webp)

### 4.2 linear probe 与 fine-tune 不一致

图中红色是 linear probe accuracy。它在 55% mask 附近最高（67.5%），到 75% 反而下滑。这是一个非常重要的观察：

- fine-tune accuracy 75% 最高
- linear probe accuracy 55% 最高

两个指标的最优 mask ratio 不一致，说明 encoder 学到的 feature 不是"任务无关 + 现成可用"的，而是"提供了一个好的初始化，需要 fine-tune 才能挖出潜力"。

这一点和 [[dino]] 形成鲜明对比：DINO 的 feature 直接 linear probe 就能拿 80%，feature 是"task-agnostic"的。MAE 的 feature 是"fine-tune ready"的。

### 4.3 encoder-decoder 对称效果差

论文做过 ablation：如果让 encoder 也看 mask token（即对称设计），相同算力下精度差 1-2%。

原因（论文给的解释）：

- 对称设计下 encoder 的输入分布和 fine-tune 阶段（无 mask token）不一致
- mask token 在 encoder 早期层"污染"了 visible feature 的提取

### 4.4 decoder 深度敏感

论文 Table 1 给出的 ablation：

- decoder = 1 层：linear probe 严重下滑，但 fine-tune 还行
- decoder = 8 层：linear probe 和 fine-tune 都好
- decoder = 12 层：基本饱和，没收益

这暗示 decoder 容量影响 encoder feature 的"任务无关度"。decoder 太浅，强迫 encoder 自己做语义抽取（feature 偏 task-aware）；decoder 够深，encoder 可以输出更"原始"的 feature（feature 偏 task-agnostic）。

---

## Section 5：实验

### 5.1 ImageNet-1k fine-tune

| 模型 | pretrain epochs | fine-tune top-1 |
|------|-----------------|-----------------|
| ViT-B | 1600 | 83.6% |
| ViT-L | 1600 | 85.9% |
| ViT-H | 1600 | 86.9% |
| ViT-H (448 res) | 1600 | 87.8% |

注意 87.8% 是不需要 ImageNet-21k 标注数据的——只用 ImageNet-1k 的图像（无 label）做 SSL 预训练，然后用 ImageNet-1k 的 label 做 fine-tune。这是 MAE 最有说服力的卖点。

对比：ViT-H 在 ImageNet-21k（14M 张带标注图）监督预训练 + ImageNet-1k fine-tune ≈ 87.0%。MAE 不用 21k 标签反而更高。

### 5.2 linear probe

| 模型 | linear probe top-1 |
|------|-------------------|
| MAE ViT-B | 68.0% |
| MAE ViT-L | 75.8% |
| DINO ViT-B | 80.1% |

linear probe 是 MAE 的弱项。这一点上 [[dino]] 完胜。

### 5.3 迁移：COCO detection

把 MAE 预训练的 ViT 接到 Mask R-CNN：

- ViT-B：APbox 50.3
- ViT-L：APbox 53.3

明显高于 supervised baseline（ImageNet-1k label 监督预训练）。

### 5.4 迁移：ADE20K segmentation

| 模型 | mIoU |
|------|------|
| MAE ViT-L | 53.6 |
| supervised ViT-L | 49.9 |

分割任务上 MAE 涨幅最大。直觉：分割本身就是一个"密集像素预测"任务，和 MAE 的 pretext（重建像素）天然匹配。

### 5.5 训练成本

ViT-H 1600 epochs ImageNet-1k 在 128 张 V100 上要 31 小时。比对应 supervised 训练快很多，因为 encoder 只看 25% token。

---

## Section 6：与 DINO / CLIP 对比——SSL 三种范式

视觉 SSL 在 2022 年形成三家分立的格局：

| 范式 | 代表 | pretext task | feature 性质 | 强项 | 弱项 |
|------|------|--------------|--------------|------|------|
| 重建式 | MAE | mask + 重建像素 | fine-tune ready | fine-tune / dense prediction | linear probe / zero-shot |
| 不变式 | [[dino]] | self-distillation + 增广 | task-agnostic | linear probe / k-NN | 需要强数据增广 |
| 对齐式 | [[clip]] | image-text contrastive | semantic-aligned | zero-shot / 检索 | fine-tune 不强 |

具体数字（ViT-L）：

- ImageNet fine-tune：MAE 85.9% > DINO 84.5% > CLIP ~76%（zero-shot 下推断）
- ImageNet linear probe：DINO 80.1% > CLIP 75.5% > MAE 75.8%
- ImageNet zero-shot：CLIP 76% > MAE 0% > DINO 0%（后两者不支持）

三家不是 superset/subset 关系，而是三种不同的优化目标。后续工作（iBOT / DINOv2 / EVA）都是在尝试组合两到三家的优点。

> 怀疑：MAE 在 fine-tune 强、linear probe 弱。这暗示 encoder 学的 feature 不是"task-agnostic"，而是"fine-tune ready"。这种 feature 在 LLM-style decoder-only 时代是不是优势变劣势？因为大模型时代很多场景是"frozen feature + 一个小 adapter"，feature 必须 task-agnostic 才能复用。MAE 这条线在 2024 之后被 DINOv2 路线（task-agnostic feature）压过，部分原因可能在此。

---

## Section 7：后续与衍生

### 7.1 SimMIM（同期，Microsoft）

- 时间：2021-11，和 MAE 同月
- 设计：symmetric encoder-decoder（encoder 也看 mask token）
- mask ratio：50% 左右
- 结论：symmetric 也能 work，性能接近 MAE
- 启示：「asymmetric 不是必要条件」——但 MAE 算力上更省

### 7.2 BEiT（早于 MAE）

- 时间：2021-06
- 设计：先用 dVAE 把每个 patch 离散化成 token id，然后 mask + 预测 token id
- 缺点：依赖外部 dVAE，pipeline 复杂；mask ratio 较低
- 优点：cross-entropy on token id 比 MSE on pixel 信号更"语义"

### 7.3 iBOT（2022）

- 思路：MAE-style mask + 重建 + DINO-style self-distillation
- 性能：linear probe 80% 左右，fine-tune 也不输 MAE
- 是把"重建"和"不变性"两条线第一次工程上整合的工作

### 7.4 EVA（2023）

- scale up MAE 到 1B 参数
- 重建目标从 normalized pixel 换成 CLIP visual feature
- 性能：ImageNet fine-tune 90%+
- 启示：pixel 不是唯一的 reconstruction target，更高级的 target（CLIP feature / DINO feature）能继续涨

### 7.5 DINOv2（2023）

- 整合 [[dino]] + iBOT 思想
- 重点是数据策划（LVD-142M）和稳定性 trick
- 不强调 MIM，但其设计明显借鉴了 MAE 的几个工程经验
- 最终成为 2024-2025 视觉 foundation feature 的事实标准

### 7.6 huggingface 复现

社区复现：

- 链接示意（40-char hex commit hash）：`https://github.com/huggingface/transformers/blob/3f5a9b26d92ce8d37fd1bee9e5b3d7c4f9ed0c2a/src/transformers/models/vit_mae/modeling_vit_mae.py`
- 文件名：`modeling_vit_mae.py`
- 关键类：`ViTMAEModel`、`ViTMAEForPreTraining`
- 实现要点：`random_masking` 函数完全复现 MAE 的 shuffle+take-first 策略

---

## Section 8：限制与争议

1. **linear probe 偏弱**：feature 偏 fine-tune ready，frozen-feature 场景下不如 [[dino]]。这一缺陷在大模型时代更突出，因为很多下游不愿意 fine-tune backbone。
2. **像素重建丢高频**：MSE on pixel 是 mode-seeking 的，倾向输出"模糊但平均正确"。重建可视化能看到边缘模糊。后续 EVA 用 CLIP feature 作为 target 部分缓解。
3. **训练计算大**：ViT-H 800-1600 epochs ImageNet-1k 是个不小的数字。对资源有限的实验室，这个成本仍然不友好。
4. **decoder 设计敏感**：8 层 dim=512 是论文 sweet spot，但偏离这个组合掉得很快。意味着这个超参不能 transfer 到所有数据集。
5. **与 ImageNet-21k 监督的 gap 在最强 backbone 上仍存在**：ViT-G 量级，ImageNet-21k 监督 + label smoothing + EMA 还能比 MAE 高出 0.2-0.5%。MAE 的"无标签胜过有标签"在 ViT-H 量级成立，但不是无条件的。

---

## Section 9：核心算法（伪代码）

### Algorithm 1：MAE 单步前向

```python
def mae_forward(images, mask_ratio=0.75):
    # 1. patchify
    patches = patchify(images)  # [B, N, patch_dim]
    B, N, _ = patches.shape

    # 2. project + add pos embed
    tokens = patch_embed(patches) + pos_embed  # [B, N, dim_enc]

    # 3. random shuffle and split
    noise = torch.rand(B, N)
    ids_shuffle = noise.argsort(dim=1)        # [B, N]
    ids_restore = ids_shuffle.argsort(dim=1)  # [B, N]
    n_keep = int(N * (1 - mask_ratio))        # 49 for ratio=0.75
    ids_keep = ids_shuffle[:, :n_keep]        # [B, 49]
    visible = gather(tokens, ids_keep)        # [B, 49, dim_enc]

    # 4. encoder
    enc_out = encoder(visible)                # [B, 49, dim_enc]

    # 5. project to decoder dim
    dec_in_visible = enc_to_dec(enc_out)      # [B, 49, dim_dec]

    # 6. append mask tokens
    n_mask = N - n_keep                       # 147
    mask_tokens = mask_token.expand(B, n_mask, -1)  # [B, 147, dim_dec]
    dec_input = torch.cat([dec_in_visible, mask_tokens], dim=1)  # [B, N, dim_dec]

    # 7. unshuffle to original positions
    dec_input = gather(dec_input, ids_restore) + dec_pos_embed   # [B, N, dim_dec]

    # 8. decoder
    dec_out = decoder(dec_input)              # [B, N, dim_dec]

    # 9. predict pixels
    pred = pixel_head(dec_out)                # [B, N, patch_dim]

    # 10. compute loss only on masked patches
    target = patch_norm(patches)
    mask = make_mask_indicator(ids_keep, N)   # [B, N], 1 if masked, 0 if visible
    loss = ((pred - target) ** 2).mean(dim=-1)  # [B, N]
    loss = (loss * mask).sum() / mask.sum()
    return loss
```

### Algorithm 2：random_masking（关键 trick）

```python
def random_masking(x, mask_ratio):
    B, N, D = x.shape
    n_keep = int(N * (1 - mask_ratio))
    noise = torch.rand(B, N, device=x.device)
    ids_shuffle = torch.argsort(noise, dim=1)
    ids_restore = torch.argsort(ids_shuffle, dim=1)
    ids_keep = ids_shuffle[:, :n_keep]
    x_masked = torch.gather(x, dim=1,
                            index=ids_keep.unsqueeze(-1).expand(-1, -1, D))
    mask = torch.ones([B, N], device=x.device)
    mask[:, :n_keep] = 0
    mask = torch.gather(mask, dim=1, index=ids_restore)
    return x_masked, mask, ids_restore
```

注意 `ids_restore` 的双 argsort——这是把 shuffle 反过来的标准 trick。

### Algorithm 3：fine-tune

下游 fine-tune 时只用 encoder：

```python
def finetune_forward(images):
    patches = patchify(images)
    tokens = patch_embed(patches) + pos_embed   # [B, N, dim_enc]
    feat = encoder(tokens)                      # [B, N, dim_enc]
    cls_logits = classifier_head(feat[:, 0, :]) # 用 CLS 或 global pool
    return cls_logits
```

decoder 完全丢弃。这就是为什么 decoder 设计选择只影响预训练效率，不影响下游天花板。

---

## Section 10：MAE 三个最有价值的工程教训

### 10.1 简单 + scale 击败精巧设计

MAE 没有任何 fancy 设计：

- pixel reconstruction，不用 dVAE token
- MSE loss，不用 perceptual loss
- 标准 ViT，没有针对性魔改
- 标准 AdamW + cosine schedule

但通过两个简单的 design choice（75% mask + asymmetric），把工程性能拉到 SOTA。这是 He Kaiming 一贯的风格——和 [[resnet]] 一样，用最朴素的设计 + 大胆的超参选择，而不是堆复杂模块。

### 10.2 工程感性比理论解释更重要

为什么是 75%？论文的解释是"图像 redundancy 高"。这个解释是事后合理化，不是先验推导。MAE 的开发过程明显是 sweep mask ratio 然后选最好的，再回头解释。

工程项目里这种先做后解释是常态，不是缺陷。重要的是把 mask ratio 当作一个一阶的超参去 sweep，而不是默认沿用 BERT 的 15%。

### 10.3 想清楚什么是 train-time only 

decoder 的"训完即丢"是 MAE 的核心 insight 之一。这给设计留了很大自由度：decoder 可以小、可以浅、可以异构，只要预训练阶段够用就行。

类似的 train-time only 模块在很多 SOTA 工作里都出现过：

- BYOL 的 predictor head
- DINO 的 teacher network
- 很多 contrastive learning 的 projection head

养成这个意识：每次设计模型问一句「这个模块下游要不要用？」，能省掉很多算力。

---

## 学到什么

1. **视觉 SSL 不是 NLP 的简单移植**：mask ratio / loss 形式 / 重建目标 都需要重新设计。BERT 的 15% 直接搬过来不 work。
2. **redundancy 决定 mask ratio**：信号越冗余，mask 比例必须越高。这是一个可以 transfer 到其他模态的原则——视频应该比图像更高，医疗影像应该比自然图像更高。
3. **训完即丢的模块设计自由度大**：decoder 只在预训练用，下游丢，所以可以激进地小。这是节省算力的一个 generic pattern。
4. **不对称设计的算力优势是 quadratic 决定的**：因为 attention 是 O(N^2)，砍掉 75% input 收益是 16x（attention 部分）。如果换成 linear attention，优势缩水。
5. **三家 SSL 各有所长**：MAE / [[dino]] / [[clip]] 不能简单排序，要看下游是 fine-tune / linear probe / zero-shot 哪种用法。
6. **fine-tune-ready feature 与 task-agnostic feature 的 trade-off**：MAE 是 fine-tune-ready 路线，DINOv2 是 task-agnostic 路线。大模型时代后者更受欢迎，但前者在分割/检测仍有优势。
7. **像素重建会被语义重建替代**：EVA 用 CLIP feature 做 target 已经验证了这一方向。pixel 是 MAE 的简化选择，不是终极答案。

---

## 关联

### 同期 / 同代
- [[clip]]：另一种视觉 SSL 范式（image-text contrastive），强项 zero-shot
- [[dino]]：另一种视觉 SSL 范式（self-distillation），强项 linear probe / 涌现 attention

### 基础架构
- [[vit]]：MAE 的 backbone 是标准 ViT，没有针对性修改
- [[resnet]]：He Kaiming 早期作品，"简单 + 深度"的同一种工程哲学

### 应用 / 下游
- [[sam]]：image segmentation foundation model，部分用了 MAE-style pretraining

### 后续路线
- iBOT / EVA / DINOv2 都是 MAE / DINO / CLIP 三家融合路线的产物，MAE 的 mask reconstruction 思想被反复借鉴

---

## 一句话回到开头

MAE 是"视觉 BERT 终于跑通"的那篇。它的贡献不是发明新组件，而是给出一组让 mask reconstruction 在 ViT 上 scale 的工程参数：75% 的 mask，asymmetric encoder-decoder，per-patch normalized pixel target。这种"简单组合 + 大胆超参 + 可 scale"的工作方式，是 He Kaiming 路线的标志，也是 [[resnet]] / MAE / [[sam]] 三篇论文一脉相承的工程审美。
