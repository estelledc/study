---
title: DINO — 让视觉模型自己认出物体轮廓
来源: 'Caron et al., "Emerging Properties in Self-Supervised Vision Transformers", ICCV 2021'
日期: 2026-05-29
分类: 机器学习
难度: 中级
---

## 是什么

DINO 是 2021 年 Facebook AI Research（FAIR）提出的**自监督视觉表征**方法：不靠人工标注，只靠同一张图的不同裁剪互相对齐，训出可用的图像特征。

日常类比：像带两个学生看同一座雕塑——一个站远看整体（teacher），一个有时只看局部（student）。student 要猜出 teacher 对「整座雕塑」的描述；时间久了，student 也会自己盯住主体，而不是背景杂物。

技术上它用同架构的 student / teacher 两个 Vision Transformer（ViT，把图切成小块再建模）。teacher 不是另训的大模型，而是 student 参数的指数滑动平均（EMA，像「过去一段时间的我」的平滑版）。论文标题里的 emerging properties，指训完后 `[CLS]`（整图汇总 token）的注意力图会自动勾出物体轮廓。

和「必须找很多不像的图当反例」的对比学习不同，DINO 更像自己给自己出题：同一张图的不同看法要对齐。这让工程上少维护一个巨大的负样本队列，也更贴合 ViT 这种按 token 思考的结构。

## 为什么重要

不理解 DINO，下面这些事会很难解释：

- 为什么 2021 年后视觉自监督从「对比学习 + 卷积」转向「自蒸馏 + ViT」
- 为什么无标签也能训出比部分监督 ViT 更强的 ImageNet 线性探测分数
- 为什么 attention 热力图会「长」出分割形状，而不只是分类分数变高
- 为什么后来的 DINOv2 能成为深度估计、语义分割里常用的视觉底座

## 核心要点

1. **自蒸馏（self-distillation）**：经典蒸馏是大网教小网；这里 student 与 teacher 同架构，teacher 由 EMA 更新：`θ_t ← λ·θ_t + (1-λ)·θ_s`，λ 从约 0.996 升到 1.0。类比：老师是「更稳的过去的自己」，目标不会天天乱跳。

2. **multi-crop 不对称**：每张图约 2 个 global crop（约 224×224，尺度约 0.4–1.0）+ 8 个 local crop（约 96×96，尺度约 0.05–0.4）。student 看全部，teacher 只看 global——逼 student 从局部猜整体语义。

3. **防崩塌 + 高维投影**：两边都输出常数就学废了。centering（减 running mean）把分布推均匀，sharpening（teacher 温度更低，如 0.04 vs 0.1）把分布推尖锐；再加约 65536 维投影头当「伪类槽位」。训完后 `[CLS]` 对各 patch 的注意力常会盖住物体主体。

为什么 ViT 上更明显：监督分类常把注意力压到「最能区分类别的一小块」（比如猫脸）；DINO 要让不同裁剪的整图汇总一致，又要在 local crop 里猜对 global，于是汇总不得不覆盖更大主体区域。这是目标函数和架构特性叠在一起的结果，不是魔法。

## 实践案例

### 案例 1：一步里损失怎么算

```python
# 概念示意（非完整可跑脚本）
s_out = [student(v) for v in globals_ + locals_]
t_out = [teacher(v) for v in globals_]  # teacher 只看 global
loss = cross_entropy_student_to_teacher(s_out, t_out, center, tau_s, tau_t)
ema_update(teacher, student, m=0.996)
```

**逐部分解释**：

- `globals_ / locals_`：同一张图的远景与近景裁剪
- `center / tau_*`：防崩塌的居中与温度；teacher 侧温度通常更低（更尖）
- `ema_update`：只动 teacher 的平滑参数，不反传 teacher
- 跳过「同一 global 自己对自己」的配对，避免偷懒对齐

### 案例 2：读出 emergent attention

```python
attn = last_block_cls_attn(student, image)  # [num_patches]
heat = attn.reshape(h_patches, w_patches)
```

**逐部分解释**：

- 取最后一层 `[CLS]` 对其他 patch 的权重，reshape 成热力图
- 高响应区常覆盖主体；多物体时往往只盯最显眼的一个
- 不同 attention head 有时会分工：有的看身体，有的看头/四肢，有的偏背景——这是观察现象，不是保证稳定的产品 API

### 案例 3：按任务选档位

```text
dense 特征 / 分割 / 检索  → DINO 或 DINOv2
image-level 零样本+文本   → 更看 CLIP 路线
算力很小、只要分类微调   → 监督预训练 CNN/ViT 可能更省事
```

**逐部分解释**：

- DINO 强在无标签视觉结构；不自带图文对齐
- 论文设定下 ViT-B/8 的 ImageNet linear 约 80.1%、k-NN 约 77.4%（对照表中监督 ViT-B/16 的 k-NN 约 76.1%）
- 数字只在论文报告的架构/协议下成立；换数据或换探测协议不要直接横比

## 踩过的坑

1. **关掉 centering 或 sharpening**：会快崩或慢崩，两个都要开。
2. **乱改 batch 不改 EMA**：默认常按较大 batch（如 1024）调；降到 256 时 momentum 往往要下调，否则 teacher 跟不上。
3. **把前几 epoch 的抖动当崩塌**：teacher 温度有 warmup，前期 loss 抖很常见。
4. **把 `[CLS]` attention 当实例分割**：多物体场景会偏到最显著目标，不能直接当 mask。

补充：multi-crop 的 dataloader 很容易成为瓶颈——`num_workers` 太小会让 GPU 空转；这看起来像「算法不收敛」，其实是输入管道饿死了。

## 适用 vs 不适用场景

**适用**：

- 需要稠密 / patch 级特征（分割、检索、部分深度任务）
- 有大量无标签图像，不想维护对比学习的巨大 negative queue
- backbone 走 ViT 或同类 token 架构
- 想先用公开 DINO/DINOv2 权重做下游微调，而不是从零自训

**不适用**：

- 需要图文零样本分类 → CLIP 更对口
- 算力极紧（论文级 ViT-B/8 训练可达数日 × 多卡）
- 边缘端强实时 → ViT 推理偏重，常不如轻量 CNN
- 多实例精确 mask → 直接用专用分割模型更合适

落地时可先问三件事：任务粒度（整图 / 稠密 / 实例）、数据规模、算力预算；多数团队是「下载现成权重 + 微调头」，而不是复现全文训练。

## 历史小故事（可跳过）

- **2019–2020**：MoCo / SimCLR 把对比学习推高，但常要大 queue 或超大 batch。
- **2020**：BYOL / SwAV 证明可以不做负样本对；SwAV 已用 multi-crop。
- **2021**：Caron 等（SwAV 一作脉络）把 multi-crop + EMA 自蒸馏搬到 ViT，写出 DINO（ICCV）。
- **工程细节**：投影头 weight norm 等稳定性技巧，社区复现里经常比正文更关键。
- **2023**：DINOv2 把思路推到更大模型与更多数据，成为常用视觉编码器。

## 学到什么

- 自监督不只 contrastive 一种；自蒸馏也能成主线。
- 架构与目标要一起设计：同一套自蒸馏在 ResNet 上故事弱很多，在 ViT 上才明显。
- 「涌现」要会追问：换设定还在吗？消融了吗？
- 数据规模是隐形门槛：复现 DINO 可行，复现 DINOv2 级数据很难。
- 超参里很多是工程经验值（温度、EMA、投影维数）；先求稳定可训，再谈理论最优。

## 延伸阅读

- 论文 PDF / 预印本：[Emerging Properties in Self-Supervised Vision Transformers](https://arxiv.org/abs/2104.14294)（arXiv:2104.14294）
- DINOv2（Oquab et al., 2023）：更大数据与模型上的后续
- BYOL（Grill et al., 2020）：EMA 自蒸馏的重要前作
- iBOT（Zhou et al., 2022）：把 DINO 思路扩到 patch 级掩码建模
- MAE（He et al., 2022）：另一条掩码重建路线，便于对照
- [[vit]] / [[clip]] / [[sam]] —— 架构、图文对照、分割下游

## 关联

- [[vit]] —— DINO 的骨干；无标签目标让 attention 结构更可读
- [[clip]] —— 图文对比的另一条路；image-level 零样本常更吃香
- [[sam]] —— 分割下游；社区常拿 DINOv2 类特征当替换骨干
- [[resnet]] —— 卷积时代 SSL 基线；DINO+ViT 后主流骨干切换
- [[mae]] —— 掩码自编码并行路线，和 DINO 系一起塑造 2022 后格局
- [[pytorch]] —— 论文实验与社区复现最常见的训练框架底座

> 记四个常用旋钮：teacher 温度（sharpening）、EMA momentum、投影维数 K、batch size；改其中一个时，往往要连着检查另外三个。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mae]] —— MAE — Masked Autoencoders
- [[vit]] —— ViT — Vision Transformer
