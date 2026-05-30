---
title: 'DINO 自监督视觉 transformer'
来源: 'Caron et al., Emerging Properties in Self-Supervised Vision Transformers, ICCV 2021'
arxiv: '2104.14294'
---

## 是什么

DINO 是 2021 年 Facebook AI 提出的自监督视觉表征方法。

一句话：用同架构的 student / teacher 两个 ViT，teacher 是 student 的指数滑动平均（EMA），靠 multi-crop 不对称投喂 + 自蒸馏目标，无标签训出比 supervised ViT 还强的特征。最让人意外的不是分数，是训完之后 [CLS] 的注意力图自动长出物体分割形状——论文标题 emerging properties 指的就是这件事。

## 为什么重要

把视觉自监督放在时间线上看，DINO 是从「contrastive 卷积」到「distillation + ViT 涌现」的转折点。

- 2019 MoCo / 2020 SimCLR：contrastive 把 ResNet-50 推到 74%，但要么 65K queue 要么 4096 batch
- 2020 BYOL / SwAV：去掉 negative pair 也能 work，predictor + EMA 是关键
- 2021 DINO：把这套搬到 ViT，ImageNet linear 80.1%，k-NN 77.4%，第一次跨过 supervised ViT
- 2022 iBOT / 2023 DINOv2：把 DINO 拓到 patch 级和 142M 数据，做成 foundation visual encoder

读懂 DINO 等于读懂 2020-2023 视觉自监督的范式转移。它给的核心信号是：架构（ViT）+ 目标（self-distill）+ 数据视图（multi-crop）必须 co-design，三者交互才有 emergence。

## 核心要点

**self-distillation。** 经典蒸馏是大网络教小网络，self-distillation 反过来——student 和 teacher 同架构，teacher 没有独立训练，由 student 参数 EMA 派生：`θ_t ← λ·θ_t + (1-λ)·θ_s`，λ 用 cosine schedule 从 0.996 涨到 1.0。直觉上 teacher 是「过去 100 天的我」，比「今天的我」更稳定，目标也更稳定。

**multi-crop 不对称。** 同一张图取 2 个 global crop（224×224，覆盖 50%-100%）+ 8 个 local crop（96×96，覆盖 5%-50%）。关键：student 看所有 crop，teacher 只看 global。这逼 student 必须从局部碎片猜出 teacher 看全局时的输出，于是被迫学局部到整体的语义对应。

**centering + sharpening 防 collapse。** self-distillation 最大失败模式是 student 和 teacher 都输出常数。两个反向力：centering 在 teacher softmax 前减去 running mean `c`（推向均匀），sharpening 用 teacher 温度 τ_t=0.04 远低于 student τ_s=0.1（推向尖锐）。两力平衡点就是「有结构但不退化」。

**projection head 维度 K=65536。** ViT [CLS] 输出后接 3 层 MLP + L2 norm + 线性层，输出维度 65536。直觉：65536 个伪类槽位，越大能容纳的概念越多。论文 §5.3 ablation 显示 K 从 1024 到 65536 单调上升但收益递减——这是工程经验值不是理论最优。

**emergent attention。** 训完后取最后一层 multi-head self-attention 的 [CLS] 对其他 patch 的权重，按网格 reshape 成 heatmap，高响应区自动覆盖物体主体。supervised ViT 的 attention 看起来更随机，MoCo / BYOL 训的也远不如 DINO 干净。这是 self-distill + ViT + multi-crop 三者交互的副产品。不同 head 还会自发分工：有的关注主体物体，有的关注头部 / 四肢，有的关注背景——supervised 训练下这种 head-wise specialization 被 label 压制，DINO 没有 label 反而让它长出来。

**为什么 ViT 上才 emerge。** ViT 的 self-attention 本身就有「软分配」语义：每个 token 对其他 token 算权重。supervised 训练给 image-level label，attention 被压向「哪些 patch 帮我分类」——往往集中在判别性的小区域（猫脸）。DINO 的目标是「两个 view 的 [CLS] 输出一致」，逼 [CLS] 对所有 patch 形成稳定的全局总结。在 multi-crop 不对称下，全局总结必须覆盖物体主体（因为 local crop 只看到部分主体），于是 attention 自然分散到整个物体。这是「目标函数 → 架构特性 → 涌现现象」的因果链。

## 实践案例

伪代码（论文 Algorithm 1 改写）：

```python
def dino_step(x, student, teacher, center, tau_s, tau_t, m):
    x1, x2 = aug(x), aug(x)               # 2 global crops
    locals_ = [aug(x, local=True) for _ in range(8)]
    s_out = [student(v) for v in [x1, x2] + locals_]
    t_out = [teacher(v) for v in [x1, x2]]   # teacher 只看 global
    loss = 0
    for i, t in enumerate(t_out):
        for j, s in enumerate(s_out):
            if i < 2 and j == i: continue   # skip same view
            t_p = softmax((t - center) / tau_t)
            s_p = log_softmax(s / tau_s)
            loss += -(t_p * s_p).sum(-1).mean()
    loss.backward(); optimizer.step()
    teacher_params = m * teacher_params + (1-m) * student_params  # EMA
    center = 0.9 * center + 0.1 * mean(concat(t_out))
```

关键结果（论文 Table 2 / 3 / 5）：

| 方法 | 架构 | linear top-1 | k-NN top-1 |
|------|------|--------------|------------|
| supervised | ViT-B/16 | 79.9 | 76.1 |
| MoCov3 | ViT-B/16 | 76.5 | 71.4 |
| DINO | ViT-S/16 | 77.0 | 74.5 |
| DINO | ViT-B/8 | 80.1 | 77.4 |

ViT-B/8 的 k-NN 77.4 超过 supervised 76.1——意味着 DINO 学到的不只是线性可分特征，度量空间结构本身就接近真实语义。下游：DAVIS-2017 视频分割 J&F=61.8、VOC07 object discovery CorLoc=45.9（vs supervised ViT-S/16 35.3）、Oxford-Hard image retrieval mAP=51.5。

## 踩过的坑

- **collapse 模式有两种。** 关掉 centering 立刻 collapse（某维度饱和），关掉 sharpening 慢速 collapse（输出趋向均匀，loss 看似在降但学不到）。两个都开才稳定。
- **超参对 batch size 敏感。** 默认 batch 1024（8 GPU × 128）。降到 256 时 EMA momentum 要从 0.996 调到 0.99，否则 teacher 跟不上 student。论文没给详细 schedule，社区 issue 里大量「换 batch 后 collapse」的报告。
- **τ_t warmup 必须做。** teacher 温度从 0.04 warmup 到 0.07（前 30 epoch）。前 10 epoch loss 抖动很大不要误判 collapse——是 warmup 中。
- **multi-crop dataloader 是瓶颈。** num_workers 不够（< 8）GPU 会饿。
- **emergent attention 在多 instance 粗糙。** 一张图 5 只猫，attention 倾向聚焦最显著那只，不能直接拿 [CLS] attention 做 instance segmentation。

## 适用

选 DINO 路线的判断：

- 任务需要 dense / patch-level 特征（语义分割、单目深度、检索）→ DINO / DINOv2 比 CLIP 强
- 没有标签，但能拿到大量图像 → self-distillation 比 contrastive 工程量小（不用维护 negative queue）
- backbone 必须是 ViT（或类似 token-based 架构）；ResNet 上 emergent 故事不成立，效果回到 SwAV 水平

不选的判断：

- image-level zero-shot 分类 / 检索 → CLIP 路线更对口（有文本对齐）
- 算力极度受限 → DINO ViT-B/8 训练 14 day on 8 V100，小集群很难复现
- 多 instance 场景需要 mask → 直接用 SAM 而不是 [CLS] attention
- 模型必须部署到边缘端 → ViT 推理慢，蒸馏到 ResNet 又丢 emergent attention，不如直接 supervised CNN

落地决策树：先看任务粒度（image-level / dense / instance），再看数据规模（< 1M 用 supervised pretrain 微调可能更省事，> 10M 才考虑自训 SSL），最后看算力预算。

## 历史小故事

DINO 一作 Mathilde Caron 是 SwAV 的一作。SwAV 已经引入 multi-crop，但没碰 ViT，attention 也没那么 emergent。DINO 实质是把 SwAV 的 multi-crop + BYOL 的 EMA + ViT 三件事揉到一起。

工程上有个细节：projection head 最后一层用 weight normalization 但把幅度维度（weight_g）冻住——只学方向。论文里轻描淡写一句「对稳定性很关键」。社区复现里关掉 weight_norm 经常 loss 不收敛，说明这个工程细节比论文呈现的更核心。

DINO 之后，FAIR 把同一思路推到 142M 数据 + ViT-g/14（11 亿参数）做出 DINOv2。蒸馏出 ViT-S/14 / ViT-B/14 / ViT-L/14 给社区用，dense feature 在 monocular depth / semantic segmentation 上是 2023-2024 的事实 baseline。

## 学到什么

- **自监督不是 contrastive 一种范式。** distillation / clustering / masked modeling 都行，选哪种取决于 backbone 和任务。
- **架构和目标必须 co-design。** 同一个 self-distillation 在 ResNet 上效果一般，在 ViT 上才 emerge。这警告我「换 backbone 同方法」的迁移性比想象中差。
- **emergent 是个需要被审视的词。** DINO 的 emergent attention 是真的，但论文标题的修辞掩盖了「哪些是真涌现，哪些是工程精调副产品」。每次读 emergence 类论文都要问：消融了吗？换 setup 还在吗？
- **数据 curation 是隐形门槛。** DINO 在 ImageNet-1K 已经够强，DINOv2 跨到 LVD-142M 才彻底起飞。学术复现 DINO 不难，复现 DINOv2 几乎不可能——数据壁垒比模型壁垒高。
- **target 完成而非完美的工程哲学。** 65536 这个维度、0.04 这个温度、0.996 这个 momentum 都是经验值。能 work 就先发，理论解释后人补。

## 延伸阅读

- DINOv2 (Oquab et al. 2023)：DINO + iBOT + KoLeo 缝合，LVD-142M 数据，foundation 视觉特征事实标准
- iBOT (Zhou et al. 2022)：DINO + BERT-style masked image modeling，patch-level emergence 显式化
- BYOL (Grill et al. 2020)：DINO 的精神祖先，ResNet 上的 EMA self-distillation
- MAE (He et al. 2022)：另一条 SSL 路线，masked autoencoder，和 DINO 路线 2022 后并行发展
- Tian et al. 2021《Understanding Self-Supervised Learning Dynamics》：toy linear analysis，把 SSL 防 collapse 机制统一为「阻止表征矩阵奇异值塌陷」

## 关联

- [[vit]]：DINO 用的就是原版 ViT。DINO 揭示 ViT 在 supervised 训练下未充分利用，attention 有更多结构可学
- [[clip]]：另一条路。CLIP 用图文对比，DINO 用纯图像自蒸馏。工业实践 image-level 用 CLIP，dense 用 DINOv2
- [[sam]]：dense feature 的下游放大。SAM 自己用 MAE，但社区把 DINOv2 作为替换 backbone 后零样本分割能力提升
- [[resnet]]：被超越的 backbone。ResNet 时代 SSL 推到 75% 左右，DINO + ViT-B/8 直接干到 80%，主流 backbone 切换到 ViT

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[mae]] —— MAE — Masked Autoencoders
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[resnet]] —— ResNet — 残差连接
- [[sam]] —— SAM — Segment Anything
- [[vit]] —— ViT — Vision Transformer

## 附录

核心超参（ViT-B/16 默认）：

| 类别 | 值 |
|------|-----|
| optimizer / lr | AdamW / 0.0005 × bs/256 |
| weight decay | 0.04 → 0.4 (cosine) |
| epochs / batch | 100 / 1024 |
| EMA momentum | 0.996 → 1.0 (cosine) |
| τ_s / τ_t | 0.1 / 0.04 → 0.07 (warmup 30 ep) |
| center momentum | 0.9 |
| projection bottleneck / output K | 256 / 65536 |
| global / local crop scale | (0.4, 1.0) / (0.05, 0.4) |
| num local crops | 8 |

记四个数：τ_t=0.04（sharpening 强度）、EMA 0.996→1.0（越训越冻）、K=65536（伪类槽位）、batch 1024（小集群要重调 momentum）。
