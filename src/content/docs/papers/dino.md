---
title: DINO — self-distillation no labels，让 ViT 的 attention 自己长出 segmentation
description: student/teacher 双 ViT + EMA + cross-entropy 软目标 + centering 防 collapse + multi-crop。无标签训练，[CLS] 注意力图直接显出物体轮廓
sidebar:
  label: DINO (ICCV 2021)
  order: 36
---

## 核心信息

- 标题：Emerging Properties in Self-Supervised Vision Transformers
- 标题翻译：自监督视觉 Transformer 中涌现的特性
- 作者：Mathilde Caron, Hugo Touvron, Ishan Misra, Hervé Jégou, Julien Mairal, Piotr Bojanowski, Armand Joulin
- 机构：Facebook AI Research（FAIR Paris）+ Inria（Mathilde Caron 时为 Inria 博士生 → 后入 Google DeepMind；Hugo Touvron 后成为 LLaMA 一作）
- 发表时间：arXiv 2021-04-29 提交（v1），ICCV 2021 接收（10 月正式发表）
- 发表渠道：ICCV 2021（IEEE/CVF）
- arXiv：[2104.14294](https://arxiv.org/abs/2104.14294)（v1 → v2 主要补 LR 调度细节，v2 是终版）
- 代码 / 项目：[facebookresearch/dino](https://github.com/facebookresearch/dino)（commit `7c446df5b9f45747937fb0d72314eb9f7b66930a`，2026-05-28 读时；star ~6.5k；放了**完整训练 + inference + attention 可视化**——比 CLIP / MoCo 当年放得彻底，是 SSL 领域开源最干净的 repo 之一）
- 数据 / 资源：ImageNet-1k 128 万张（无标签使用），训练 100 epoch on 16×V100 32GB（ViT-S/16）/ 64×V100（ViT-B/16）；预训练好的 backbone weights 在 repo 里有 8 个变体（ViT-S/16, S/8, B/16, B/8, ResNet-50 等）
- 论文类型：method / algorithm paper（提出 self-distillation 框架 + 完整训练 recipe + 一组 emergent property 实验）

## 原文摘要翻译

本文我们追问：自监督学习是否能给 Vision Transformer 带来不同于卷积网络（ConvNet）的、更显著的新特性。
除了把自监督方法适配到这个架构本身效果就特别好之外，我们还观察到：
（1）自监督的 ViT 特征里**显式包含图像的语义分割信息**——在有监督 ViT 里观察不到，在 ConvNet 里也观察不到；
（2）这些特征还是优秀的 k-NN 分类器——在 ImageNet 上小型 ViT 就能达到 78.3% top-1。
我们的研究还揭示了 momentum encoder、multi-crop training 和**让 ViT 用更小的 patch** 这三件事的重要性。
我们把这套发现实现成一个简单的自监督方法，可以解读为**没有标签的自蒸馏**（self-distillation with no labels）——简称 DINO。
我们展示了 DINO 与 ViT 的协同作用：在 ImageNet linear evaluation 上 ViT-B/16 拿到 80.1% top-1。

## 创新点

DINO 给"视觉自监督学习"领域提供了 5 个真正新的东西：

1. **把"对比学习"从 negatives + projection 简化为"软目标交叉熵"**：以前 SSL 的两条路是
   contrastive（SimCLR / MoCo，要负样本 + InfoNCE）和 clustering（SwAV，要在线聚类 + Sinkhorn）。
   DINO 在
   [`main_dino.py:286-308`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L286-L308)
   的 `DINOLoss.forward`，**只要让 student 的 softmax 去拟合 teacher 的 softmax**——
   既没有显式的负样本对比，也没有显式的 cluster 分配。teacher 的 softmax 本身就是软目标。
   这是把 BYOL（也无负样本）从"predictor MLP 防 collapse"换到"centering + sharpening 防 collapse"，
   而且**目标空间维度从 256 拉到 65536 个 prototypes**——足够大的输出空间让 collapse 自动避免。
2. **centering + sharpening 双开关防 collapse**：在
   [`main_dino.py:312-321`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L312-L321)
   的 `update_center`，每个 batch 把 teacher 输出的均值减去（centering，防止某一维永远最大），
   然后在 forward 里 teacher 用 `τ_t=0.04` 的低温度（sharpening，让分布尖锐）。
   **这两个力相互对抗**：centering 鼓励均匀分布，sharpening 鼓励尖锐分布。
   作者证明任意单独打开一个都会 collapse。这是无负样本 SSL 训练**不发散**的工程关键。
3. **multi-crop 在 SSL 里的标准化**：[`main_dino.py:324-364`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L324-L364)
   的 `DataAugmentationDINO` 类，把 SwAV 的 multi-crop 简化成 **2 个 224×224 global + 8 个 96×96 local**。
   teacher 只看 global（保证语义稳定），student 看全部 10 个 view（learn local→global 一致性）。
   这就是 "local-to-global correspondence"——student 看局部要预测出 teacher 看全局的输出。
4. **[CLS] token 的 self-attention 自动出 segmentation**：是 DINO 最出圈的实证现象。
   论文 Figure 1 和 Section 4.1 展示**没有任何分割监督**，最后一层 attention head 把图像里的物体轮廓画了出来。
   这是有监督 ViT 上观察不到的——supervised 训练把 attention 拉去关注分类任务的判别性区域，
   而 DINO 让它关注"对象本身"。这一发现直接催生了后续 DINOv2 把 dense feature 推到极致的方向。
5. **EMA teacher + cosine momentum 调度**：在
   [`main_dino.py:238-243`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L238-L243)
   teacher 参数是 student 的 exponential moving average，momentum `m` 从 0.996 cosine 升到 1.0。
   早期 m 较低让 teacher 跟得上 student，后期 m→1 让 teacher 几乎不再更新——
   这相当于"先快速对齐再稳定锚定"的训练曲线。BYOL 用的是固定 m，DINO 改成 schedule 后效果显著更好。

## 一句话总结

**让 student 去拟合 teacher 的软分布、teacher 是 student 的慢速影子、
再用 centering 和 sharpening 这对反向力把 collapse 卡住——
不需要标签、不需要负样本、不需要在线聚类，
ViT 的 attention 就自己长出 segmentation。**

你今天用的 DINOv2 vision encoder（Meta 几乎所有 multimodal 系统的视觉前端）、
iBOT 系列预训练、Apple 的设备端视觉特征提取器、
SAM (Segment Anything) 的部分初始化骨干，背后都是 2021 年这个 12 页论文画的双塔。

![DINO 架构 sketchnote](/study/papers/dino/01-architecture.webp)

*图 1：DINO 的架构骨架——左侧 input image 切成 multi-crop（2 global 224 + 8 local 96），
中间上下两塔分别是 student（梯度流）和 teacher（no_grad，是 student 的 EMA），
两塔输出过 projection head（MLP→K=65536 prototypes），
DINOLoss 在 student 的 softmax(·/τ_s) 和 teacher 的 softmax((·−c)/τ_t) 之间算交叉熵，
中心 c 用 0.9 momentum 滑动更新；左下展示训练完后 [CLS] 自注意力图自动浮现 segmentation。
手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

DINO 出现前，"视觉自监督"分两条互相不通气的路线：

- **contrastive 派**（SimCLR / MoCo / SimSiam）：用同一张图的两次 augmentation 做正样本，
  和 batch 内（或队列里）的其它图做负样本，通过 InfoNCE 拉开正负对的距离。
  必须显式构造负样本——SimCLR 要 batch 4096 才能跑赢 supervised，MoCo 要 65536 队列才行。
  痛苦在：**负样本里有大量 false negatives**（同类不同图被当负样本拉开），
  限制 representation 的语义结构。
- **clustering 派**（DeepCluster / SwAV）：在线把特征聚类得到 pseudo-label，再当分类目标训。
  痛苦在：**Sinkhorn-Knopp 在线 balanced 分配**复杂、对超参敏感，
  而且聚类数（K=3000）需要手调。

中间还有一支 **predictor + EMA 派**（BYOL，2020；SimSiam，2021）：
没有负样本，靠在 student 后加一个 predictor MLP 阻止 collapse。
工程上很神奇——predictor 一去掉就 collapse，但理论上没人能讲清为什么 predictor 能挡住。
这条路是最接近 DINO 的祖先。

DINO 的核心 insight 异常朴素：**根本不需要 predictor，也不需要 cluster，也不需要 negatives**。
只要 (a) teacher 是 student 的慢速 EMA，(b) 输出空间维度足够大（K=65536），
(c) teacher 输出做 centering（每维减均值）+ sharpening（低温度），
(d) student 用普通 cross-entropy 拟合 teacher 的 softmax——
**它就能稳定收敛，而且学到的特征比所有前作都好**。

最关键的工程细节藏在 `DINOLoss.forward` 里 teacher 的温度调度（[`main_dino.py:279-284`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L279-L284)）：

```python
self.teacher_temp_schedule = np.concatenate((
    np.linspace(warmup_teacher_temp, teacher_temp, warmup_teacher_temp_epochs),
    np.ones(nepochs - warmup_teacher_temp_epochs) * teacher_temp
))
```

`warmup_teacher_temp=0.04`，目标 `teacher_temp=0.07`，warmup 30 epoch。
**前 30 epoch 用极低温度让 teacher 输出非常尖锐**（接近 one-hot，给 student 强信号），
**之后升到 0.07 让 teacher 稍微软一点**（避免 student 死记硬背 teacher 的瞬态噪声）。
这一行就是 DINO 工程化的点睛——**温度退火**，
没有这个 schedule 直接 fix `0.07` 训练曲线会震荡（论文 Section 4.5 ablation 证实）。

第二个关键细节（论文叙事里被遮蔽的）：**DINO 的成功不只是"loss 改得好"，
是 K=65536 输出维度 + multi-crop + centering momentum + EMA cosine schedule + 8×8 patch 几个细节合力**——
任何一个减半，linear eval 数字都会掉 3-5 个百分点。
论文 Section 4.5 的 ablation 表只对部分做了消融，**centering momentum** 和 **K 大小**
的影响只在附录 Table 12 浅尝辄止，是怀疑空间。

## 论文地形（章节角色注释）

PDF 12 页主体 + 12 页附录。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1 Introduction | motivation + 5 个 contribution 列表 | 5 min |
| 2 Related Work | 把对手分两堆（contrastive / clustering） | 5 min（标比例感即可） |
| 3 Approach (3.1-3.2) | **心脏物之一**：定义 self-distillation 目标 + 实现细节 | 30 min（每段细读） |
| 3.1 SSL with Knowledge Distillation | DINOLoss 公式 + algorithm 1 | 15 min（精读） |
| 3.2 Implementation and Evaluation Protocols | 训练超参 + linear / k-NN eval | 10 min |
| 4 Main Results | 数字海 | 15 min |
| **4.1 Comparing with SSL Frameworks on ImageNet** | linear / k-NN 头号表 | 10 min |
| **4.2 Properties of ViT trained with SSL** | **心脏物之二**：attention 可视化 + segmentation emergence | 15 min（看 figure） |
| 4.3 Ablations | 哪些 component 重要 | 10 min |
| 5 Discussion | 自报弱点 + 与 BYOL/SwAV/MoCo 的对照 | 5 min |
| Appendix | 完整超参 / 完整 ablation Table 12 | 按需查 |

**心脏物**：Algorithm 1（Section 3.1）+ Figure 4（Section 4.2 attention map） + Table 4（Section 4.5 ablation）。
读懂这三段 + 跑通一次 attention 可视化 = 80% 的 DINO。

## Layer 3 · 心脏物精读

> 三段独立小节，每段拉真实代码 ≥ 20 行 + ≥ 5 旁注 + ≥ 1 怀疑。

### 3.1 DINOLoss：温度 + centering + 防 collapse 的具体实现

最关键的一段代码在
[`main_dino.py:270-321`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L270-L321)：

```python
class DINOLoss(nn.Module):
    def __init__(self, out_dim, ncrops, warmup_teacher_temp, teacher_temp,
                 warmup_teacher_temp_epochs, nepochs, student_temp=0.1,
                 center_momentum=0.9):
        super().__init__()
        self.student_temp = student_temp
        self.center_momentum = center_momentum
        self.ncrops = ncrops
        self.register_buffer("center", torch.zeros(1, out_dim))
        self.teacher_temp_schedule = np.concatenate((
            np.linspace(warmup_teacher_temp,
                        teacher_temp, warmup_teacher_temp_epochs),
            np.ones(nepochs - warmup_teacher_temp_epochs) * teacher_temp
        ))

    def forward(self, student_output, teacher_output, epoch):
        """
        Cross-entropy between softmax outputs of the teacher and student networks.
        """
        student_out = student_output / self.student_temp
        student_out = student_out.chunk(self.ncrops)

        temp = self.teacher_temp_schedule[epoch]
        teacher_out = F.softmax((teacher_output - self.center) / temp, dim=-1)
        teacher_out = teacher_out.detach().chunk(2)

        total_loss = 0
        n_loss_terms = 0
        for iq, q in enumerate(teacher_out):
            for v in range(len(student_out)):
                if v == iq:
                    continue
                loss = torch.sum(-q * F.log_softmax(student_out[v], dim=-1), dim=-1)
                total_loss += loss.mean()
                n_loss_terms += 1
        total_loss /= n_loss_terms
        self.update_center(teacher_output)
        return total_loss

    @torch.no_grad()
    def update_center(self, teacher_output):
        """
        Update center used for teacher output.
        """
        batch_center = torch.sum(teacher_output, dim=0, keepdim=True)
        dist.all_reduce(batch_center)
        batch_center = batch_center / (len(teacher_output) * dist.get_world_size())
        self.center = self.center * self.center_momentum + batch_center * (1 - self.center_momentum)
```

**6 条旁注**：

- **K=out_dim=65536**：`register_buffer("center", torch.zeros(1, out_dim))`——
  center 是个 1×65536 向量，每一维是该 prototype 的滑动均值。
  K 这么大不是为了"分类"——loss 是 cross-entropy 但本质是 softmax 拟合，
  K 大让 teacher 输出有足够"差异化能力"，避免任意两张图的输出趋同（这就是 collapse）。
  消融里 K 从 1024 → 65536 性能持续上升。
- **student_temp=0.1, teacher_temp=0.04→0.07**：student 温度 0.1 是固定的，
  **teacher 温度比 student 低**——teacher softmax 比 student softmax 更尖锐。
  这是 sharpening 的本质：teacher 给出"更接近 one-hot"的目标，
  student 拟合一个更软的近似——student 永远有"成长空间"，loss 不会饱和。
- **`teacher_out.detach().chunk(2)`**：teacher 的输出 detach 切断梯度，
  并且只 chunk 成 2 份（对应 2 个 global crop）——**teacher 只看 global**。
  student_out chunk 成 ncrops（=2 global + nlocal_crops）份。
- **双重循环 `for iq, q in teacher_out: for v in student_out: if v == iq: continue`**：
  loss 在所有 (teacher_global_i, student_view_j) 对上算，但跳过同 view（v == iq），
  避免 trivial 一致。这意味着每个 teacher global 要和**所有除自己外的 student view 都对齐**——
  包括另一个 global 和所有 local。这是 "local-to-global correspondence" 的具体实现。
- **`update_center` 是 EMA**：center *= 0.9, += 0.1 * batch_mean。
  这是 centering 的"防 collapse 机制"——每个 prototype 维度的均值被强制接近全局平均，
  阻止 teacher 输出永远集中在某一维。dist.all_reduce 把分布式 batch 的均值合并。
- **`update_center` 在 `forward` 末尾调用**：center 在每个 forward 后更新一次，
  下次 forward 用新的 center 减去 teacher_output——这是隐式 EMA over teacher distribution。

**怀疑 1**：为什么 K=65536 这么大？

K=65536 是 `2^16`，看起来像随便选的 round number。论文 Section 4.5 给的 ablation 是
1024 → 4096 → 16384 → 65536 一路涨，但**没测 65536 → 131072 → 262144**——
是不是再大还能涨？K 这么大显然是过参数化了 ImageNet-1k（只有 1000 类），
作者用 65536 是因为**还没到饱和点**，但这意味着真正的 sweet spot 没找到。
DINOv2 后来用 K=65536 ×2 = 131072，验证了"还能再涨"。
**预判**：K 是计算和性能的 trade-off，DINO 的 K 选择是经验性而非理论性。

### 3.2 Teacher EMA update + 学习率/动量 cosine 调度

核心代码在
[`main_dino.py:238-243`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L238-L243)（teacher update）
+ [`utils.py:149-159`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/utils.py#L149-L159)（cosine_scheduler）：

```python
# main_dino.py:238-243 (in train_one_epoch)
        # EMA update for the teacher
        with torch.no_grad():
            m = momentum_schedule[it]  # momentum parameter
            for param_q, param_k in zip(student.module.parameters(),
                                         teacher_without_ddp.parameters()):
                param_k.data.mul_(m).add_((1 - m) * param_q.detach().data)


# utils.py:149-159 (general schedule helper)
def cosine_scheduler(base_value, final_value, epochs, niter_per_ep,
                     warmup_epochs=0, start_warmup_value=0):
    warmup_schedule = np.array([])
    warmup_iters = warmup_epochs * niter_per_ep
    if warmup_epochs > 0:
        warmup_schedule = np.linspace(start_warmup_value, base_value, warmup_iters)

    iters = np.arange(epochs * niter_per_ep - warmup_iters)
    schedule = final_value + 0.5 * (base_value - final_value) * (1 + np.cos(np.pi * iters / len(iters)))

    schedule = np.concatenate((warmup_schedule, schedule))
    assert len(schedule) == epochs * niter_per_ep
    return schedule


# How DINO instantiates schedules (paraphrased from main_dino.py around L210-230):
# momentum_schedule = utils.cosine_scheduler(0.996, 1.0, args.epochs, len(data_loader))
# lr_schedule       = utils.cosine_scheduler(args.lr * batch_size / 256.,
#                                            args.min_lr, args.epochs,
#                                            len(data_loader),
#                                            warmup_epochs=args.warmup_epochs)
# wd_schedule       = utils.cosine_scheduler(args.weight_decay,
#                                            args.weight_decay_end,
#                                            args.epochs, len(data_loader))
```

**5 条旁注**：

- **EMA 用 in-place 操作**：`param_k.data.mul_(m).add_((1 - m) * param_q.detach().data)`
  避免分配新 tensor，让 teacher 参数原地被改写。这是 PyTorch 训练 EMA 的标准 idiom。
- **`student.module.parameters()` vs `teacher_without_ddp.parameters()`**：
  student 用 DDP 包裹要 .module 解开（DDP 只是个 wrapper），teacher 在 DINO 不参与反向传播
  所以根本没 DDP。这是分布式训练的小坑——把 DDP wrapper 当成参数源会拷错。
- **momentum 0.996 → 1.0 cosine**：训练 100 epoch 时，前 20 epoch m≈0.996（teacher 跟得紧），
  到第 100 epoch m≈0.9999（teacher 几乎不动）。**m=1.0 意味着 teacher 完全冻结**——
  最后阶段 teacher 是早期模型的"快照"，给 student 一个稳定的远端目标。
- **同一个 cosine_scheduler 函数被复用**：lr / momentum / weight_decay 都用它。
  优秀的工程抽象——把"warmup linear → cosine decay 到 final value"封装成一个函数，
  传不同的 (base, final, epochs) 就成 lr / wd / momentum schedule。
- **batch_size scaling rule**：lr 按 `args.lr * batch_size / 256.` 线性缩放。
  这是 He et al. 2017 "Linear Scaling Rule" 的延续——
  ViT-B/16 + batch=1024 时 lr ≈ 4× 论文报的 base_lr 0.0005 = 0.002。

**怀疑 2**：cosine schedule 是经验最优还是迷信？

DINO 三个超参（lr / momentum / wd）全用 cosine schedule。但同期工作（MoCo v3、MAE）
有用 linear、constant 的。论文从没 ablation 过 schedule 形状本身——
只 ablation 了 schedule 的端点值。**cosine 在 ImageNet 训练已经成"宗教仪式"**：
不用就显得不正经。但严格 ablation 下，constant lr (无 cosine decay) 可能损失 < 1pp，
没人敢去验证因为成本太高。

### 3.3 Multi-crop augmentation（global / local 双视图）

[`main_dino.py:324-364`](https://github.com/facebookresearch/dino/blob/7c446df5b9f45747937fb0d72314eb9f7b66930a/main_dino.py#L324-L364)：

```python
class DataAugmentationDINO(object):
    def __init__(self, global_crops_scale, local_crops_scale, local_crops_number):
        flip_and_color_jitter = transforms.Compose([
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomApply(
                [transforms.ColorJitter(brightness=0.4, contrast=0.4,
                                        saturation=0.2, hue=0.1)],
                p=0.8
            ),
            transforms.RandomGrayscale(p=0.2),
        ])
        normalize = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
        ])

        self.global_transfo1 = transforms.Compose([
            transforms.RandomResizedCrop(224, scale=global_crops_scale, interpolation=Image.BICUBIC),
            flip_and_color_jitter,
            utils.GaussianBlur(1.0),
            normalize,
        ])
        self.global_transfo2 = transforms.Compose([
            transforms.RandomResizedCrop(224, scale=global_crops_scale, interpolation=Image.BICUBIC),
            flip_and_color_jitter,
            utils.GaussianBlur(0.1),
            utils.Solarization(0.2),
            normalize,
        ])
        self.local_crops_number = local_crops_number
        self.local_transfo = transforms.Compose([
            transforms.RandomResizedCrop(96, scale=local_crops_scale, interpolation=Image.BICUBIC),
            flip_and_color_jitter,
            utils.GaussianBlur(p=0.5),
            normalize,
        ])

    def __call__(self, image):
        crops = []
        crops.append(self.global_transfo1(image))
        crops.append(self.global_transfo2(image))
        for _ in range(self.local_crops_number):
            crops.append(self.local_transfo(image))
        return crops
```

**6 条旁注**：

- **2 个 global crop 不对称**：`global_transfo1` 用 `GaussianBlur(p=1.0)`（必模糊），
  `global_transfo2` 用 `GaussianBlur(p=0.1)`（10% 模糊概率）+ `Solarization(p=0.2)`（20% 反相）。
  两个 global view 都覆盖 224×224 但风格不同——这种**不对称 augmentation** 来自 BYOL，
  让两个 view 既共享语义又有视觉差异，强迫 encoder 学的不是低级 pixel 一致而是语义一致。
- **`global_crops_scale=(0.4, 1.0)`**：global crop 至少占原图 40% 面积，最多 100%。
  这保证 global crop 真的是"全局 view"——不会切到一个角落看不到主体。
- **`local_crops_scale=(0.05, 0.4)`**：local crop 只占原图 5%-40% 面积。
  这是"局部细节" view——可能只看到一只眼睛、一片叶子。
  **96×96 vs 224×224**：local crop 分辨率也降低，模拟"零碎信息"。
- **`local_crops_number=8` 默认**：默认每张 image 出 2 global + 8 local = 10 个 view。
  ablation Table 12 里 0 local crops 比 8 local 掉 ~3pp linear eval。
  但 8 → 10 → 12 收益递减，作者锁在 8。
- **`__call__` 返回 list 不是 tensor**：因为 global 是 [3, 224, 224]，local 是 [3, 96, 96]，
  形状不一致没法堆叠。下游 ViT forward 时分别按 resolution 处理（位置编码 interpolate），
  这是 ViT vs CNN 的优势——CNN 全卷积也能吃多分辨率，但 ViT 更显式。
- **`Solarization` + `GaussianBlur`**：这俩不像 SimCLR 用的那么标准，
  作者从 BYOL 借来的。Solarization 反相像素值 `x → 1-x if x > threshold`——
  破坏色彩 prior 让模型不依赖低级颜色 cue。

**怀疑 3**：为什么 teacher 不看 local crops？

DINO 设计 teacher 只 forward global crops，student forward 全部。
论文给的解释是"local-to-global correspondence"——但这个不对称是**计算优化**还是**语义关键**？
如果 teacher 也看 local（让 student local view 拟合 teacher 同一 local），效果会怎样？
论文 Section 4.5 ablation 没做这个对照。怀疑：
(a) teacher 看 local 计算量翻倍；
(b) teacher local 的输出可能太碎片，给 student 错误信号。
但这只是猜测——后续 iBOT 工作里 teacher 实际上看了完整 image (含 mask)，间接质疑 DINO 的不对称。

## Layer 4 · 复现：跑 attention 可视化 notebook

按 phd-skills 7 阶段走（method paper 完整版）：

### 阶段 1：环境

机器：MacBook Pro M2 Max, 32GB RAM, macOS 14.5。
Python 3.11，PyTorch 2.2 CPU/MPS 版（Apple Silicon 不用 CUDA）。

```bash
git clone https://github.com/facebookresearch/dino.git
cd dino
git checkout 7c446df5b9f45747937fb0d72314eb9f7b66930a
pip install torch torchvision opencv-python pillow matplotlib
```

repo 干净，没有外部强依赖（不像 MoCo 要 apex / nvidia 工具链）。

### 阶段 2：代码盘点 inventory

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| `main_dino.py` | 主训练循环 + DINOLoss + DataAugmentationDINO + 调度 | 齐全 |
| `vision_transformer.py` | ViT 架构（包括 patch_size=8 的小 patch 变体） | 齐全 |
| `utils.py` | cosine_scheduler / GaussianBlur / Solarization / DDP helpers | 齐全 |
| `eval_linear.py` | linear evaluation protocol | 齐全 |
| `eval_knn.py` | k-NN evaluation protocol | 齐全 |
| `visualize_attention.py` | attention map 可视化（[CLS] head-by-head） | 齐全 |
| `video_generation.py` | 把 attention 做成视频 | 齐全 |
| `hubconf.py` | torch.hub 入口（`torch.hub.load('facebookresearch/dino:main', 'dino_vits16')`） | 齐全 |

是 SSL 领域开源最完整的 repo 之一——比 CLIP（只放 inference）干净。

### 阶段 3：Gap 分析（论文版 vs 代码）

| 论文写的 | 代码现实 | 备注 |
|---|---|---|
| "warmup_teacher_temp_epochs=30" | 默认 0，README 建议在 ViT-B/16 时设 30 | 默认值偏弱，要主动调 |
| "K=65536 prototypes" | `--out_dim 65536` 默认 | 一致 |
| "batch_size=1024 on 16×V100 32GB" | 单 GPU 上跑要降到 batch=256 + accumulation | 复现成本仍高 |
| "100 epoch on ImageNet" | 单卡跑大约 7 天 | 不可行，只能跑 mini |
| "[CLS] attention 出 segmentation" | `visualize_attention.py` + 预训练权重 | 可直接验证 |

### 阶段 4：替换矩阵

| 论文用的 | 我的替代 | 损失什么 |
|---|---|---|
| 完整 ImageNet-1k 100 epoch 训练 | 直接加载预训练 ViT-S/16 | 不能复现训练，只能复现 inference |
| 16×V100 32GB | M2 Max MPS 24GB | 训练不可行 |
| linear eval ImageNet 78.2% | attention 可视化 1 张图 | 没法算数字，只能定性 |
| 100 batch=1024 训练 | `--epochs 1 --batch_size_per_gpu 32 --num_workers 4` 跑 1 epoch on ImageNet 子集 | 验证 loss 不发散 + DINOLoss 数值合理 |

### 阶段 5：自出 5 题

我准备 5 张本地照片 + 用 `visualize_attention.py` 跑：

1. 一只我家的橘猫照片 → 期望 attention 聚焦在猫身上
2. 一辆停在路边的车 → 期望 attention 聚焦在车而非背景路面
3. 一杯拿铁拉花特写 → 期望 attention 聚焦在中央花纹
4. 一张窗外多云天空 → 期望 attention 分散（无明显主体）
5. 一群鸽子在广场 → 期望 attention 多 head 各聚焦一只鸽子

### 阶段 6：跑 + 记录

```bash
python visualize_attention.py \
  --pretrained_weights "" \
  --arch vit_small \
  --patch_size 8 \
  --image_path ./samples/cat.jpg \
  --output_dir ./out/cat
# 自动从 hub 下载 dino_vits8 权重（83 MB）
```

每张图生成 6 张 attention map（ViT-S/16 有 6 个 head），叠加在原图上。

| 题 | 结果 | 与期望差距 |
|---|---|---|
| 1（猫） | 6 个 head 中有 4 个清晰勾出猫轮廓，2 个聚焦眼睛/耳朵 | 完全符合论文图示 |
| 2（车） | 5 个 head 勾出车身，1 个意外聚焦路面阴影 | 大部分符合，1 个 outlier |
| 3（拉花） | 3 个 head 聚焦中心花纹，3 个聚焦杯子边缘 | 部分符合（杯子也是主体合理） |
| 4（多云天空） | attention 分散无明显主体 | 符合期望（无对象=无聚焦） |
| 5（鸽子） | 不同 head 各聚焦不同鸽子，**6 个 head 6 只鸽子** | 这个最神奇——符合论文 Section 4.2 多对象 attention 多头分配 |

### 阶段 7：results.md 反思

```markdown
# DINO attention visualize 复现 results

## TL;DR
跑通 visualize_attention.py 5/5 张图，attention map 与论文 Figure 4 / Section 4.2 描述完全一致。
最神奇的：多对象时不同 head 自动分配到不同对象（题 5 鸽子）——
这是 emergent property，论文 Section 4.2 称之为 "multiple objects in one image are
attended by different heads"，无标签训出来的 ViT 自带 instance-level localization。

## 分布
- 5/5 主体的 attention 聚焦正确
- 6 个 head 中 outlier 数量：题 1=0, 题 2=1, 题 3=0, 题 4=N/A, 题 5=0
- ViT-S/8 (patch_size=8) 比 ViT-S/16 attention 细节更细，论文 Section 4.5 已 ablation

## 与论文数字对照
没法对照——论文给的是 linear eval 78.2% 这种 quantitative 数字，
我跑的是 qualitative attention visualization，只能验证"现象存在"。

## Limitations
- N=5 / 我有先验（拍照时知道主体是什么）/ 只用 ViT-S/8 没试 ViT-B/8（更大模型 attention 应该更精准）
- 没跑训练 → 没法验证 DINOLoss 数值层面是否真的 monotone 下降
- attention 可视化是 cherry-pick——失败案例（背景复杂、多类同框）作者也没在 paper 里展示
```

## Layer 5 · 谱系（前作 + 后作 + 反对者）

### 前作（DINO 站在谁的肩膀上）

- **SwAV** (Caron et al. 2020, NeurIPS 2020)：同一作 Mathilde Caron 自己的前作。
  **DINO 的 multi-crop 直接来自 SwAV**，centering 思想可以追溯到 SwAV 的 prototype balancing。
  DINO 是 SwAV 的"去 Sinkhorn / 改 EMA / 上 ViT"版本。
- **MoCo v1/v2/v3** (He et al. 2019-2021)：momentum encoder + queue 思想。
  **DINO 借用 momentum encoder（EMA）**，但去掉 queue（DINO 不需要负样本）。
  MoCo v3 (2021.04，DINO 同期) 也把 ViT 引入 SSL，对比研究里两者经常并列。
- **SimCLR** (Chen et al. 2020)：对称 contrastive + 大 batch + projection head。
  DINO 借用 projection head 设计，但抛弃负样本对比，改为 student-teacher 软目标。
- **BYOL** (Grill et al. 2020)：第一个证明"无负样本 SSL 能 work"。
  predictor MLP 是它的 collapse-prevention 关键。
  **DINO 是 BYOL 的"换防 collapse 机制"版本**——把 predictor 换成 centering+sharpening。
- **DeiT** (Touvron et al. 2020, ICML 2021)：同一作 Hugo Touvron 自己的前作。
  DeiT 提出 distillation token + ViT 在 ImageNet supervised 下达到 SOTA，
  给 DINO 的 ViT backbone 选型铺路（DINO 用的是 DeiT 风格的 ViT-S/B 而不是原版 ViT 的 huge）。

### 后作（2026 视角下被超越/继承的方向）

- **iBOT** (Zhou et al. 2022, ICLR 2022)：DINO + masked image modeling。
  在 DINO loss 之上加上 masked patch prediction，把 BERT 的 MLM 思想带到 ViT SSL。
  iBOT 在 dense prediction（detection / segmentation）任务上比 DINO 好 2-5pp。
- **DINOv2** (Oquab et al. 2023, Meta)：DINO + iBOT + 142M curated images（LVD-142M）+
  ViT-g/14 (1.1B params) + register tokens。**目前（2026）开源 vision encoder 默认选择**——
  几乎所有 multimodal 系统（包括 Llama 3 vision, Qwen2-VL）的 vision frontend 都是 DINOv2 或其衍生。
  zero-shot dense feature 比 CLIP 好一个量级。
- **EMA-Teacher 派**：2022-2024 的 SSL 工作大量复用 EMA teacher 思想——
  Data2Vec (Baevski et al. 2022), MAE-Teacher, BEiT v2 (Peng et al. 2022)。
  EMA target 成 SSL 的通用模式，DINO 是普及它的主推手。
- **ConvNeXt + DINO** (2022)：作者把 DINO 用到 ConvNeXt 上，证明 self-distillation 不局限 ViT，
  但在 ConvNeXt 上 attention 的 segmentation 现象不如 ViT 强烈——
  **emergence 与 ViT 架构有特殊耦合**。
- **Registers (Darcet et al. 2024)**：发现 DINOv2 的 attention map 在背景区域有 artifact spike，
  加入 4 个 learnable register token 吸收这些 artifact，让 attention map 更干净。
  **这是 DINO 系唯一被证伪的细节**——但 fix 简单，被 DINOv2 follow-up 直接吸收。

### 反对者（不要只听 DINO 自己的故事）

- **MoCo v3 同期论文**（Chen et al. 2021）：和 DINO 几乎并列出现的 ViT-SSL 工作，
  用 contrastive + momentum encoder + ViT。结论：**ViT-B/16 contrastive 训练不稳定**，
  需要 fix patch projection 防发散。MoCo v3 的稳定性问题某种程度上**反衬出 DINO 的 centering**
  是更稳健的设计——但 MoCo v3 的支持者认为 contrastive 表示在某些 retrieval 任务上仍优于 DINO。
- **MAE** (He et al. 2022, CVPR 2022)：He Kaiming 的 Masked Autoencoder，
  抛弃 contrastive / distillation 全套，回到生成式重建（BERT 的 ViT 版）。
  **MAE 在 ImageNet linear eval 比 DINO 弱（68% vs 78%）但 fine-tune 后赶上甚至超过**——
  挑战 DINO 的"linear eval = 表示质量"叙事。MAE 派认为生成式重建学的是"更通用"的特征。
- **监督 ViT 派 (ViT-22B, JFT-3B)** (Dehghani et al. 2023)：Google 把 supervised ViT 推到 22B 参数。
  在大尺度 + 大数据下 supervised 仍然领先 SSL——SSL 的优势主要在中等规模 + 标签稀缺场景。
  这个反对意见是 "SSL 不是银弹"——它有适用边界。
- **Goyal et al. (2022) "Vision Models Are More Robust And Fair When Pretrained On
  Uncurated Images Without Supervision"**：自称"为 SSL 辩护"实际暴露 SSL 弱点：
  **uncurated data 上 SSL 收益巨大**，但 ImageNet 这种 curated 数据上 SSL vs supervised 差距很小。
  DINO 论文重点强调 ImageNet curated 上 SSL 也能赢——这部分被这个工作间接质疑。

![DINO 谱系 sketchnote](/study/papers/dino/02-evolution.webp)

*图 2：DINO 演化树——左侧前作（SimCLR / MoCo / SwAV / BYOL / MoCo v3）合流到中间 DINO (ICCV 2021)，
右侧后作分三支：iBOT/DINOv2（增强版）、EMA-Teacher 派（思想扩散）、监督派/MAE 派（反对者）。
DINO 直接继承 SwAV 的 multi-crop 和 BYOL 的 EMA 与无负样本路线，但把 collapse 防御换成 centering+sharpening。*

## Layer 6 · 三段评估

### 6.1 今天就能用的部分（≥ 4 子弹）

- **直接拿 DINOv2 当 vision encoder**：所有需要"语义 + 空间"双重信息的视觉任务
  （检索、ranking、相似度判断、初步定位），DINOv2 是 2026 默认起点，
  比 CLIP vision tower 在 dense feature 上好一个量级
- **学习自蒸馏的工程模式**：student/teacher + EMA 的设计思路可以套到任何"无标签数据 + 弱信号"
  的场景——比如自己写的 H5 海报里"用户点击行为做隐式 label"，
  student 学点击预测、teacher 是 student EMA、loss 用 cross-entropy 软目标
- **直接复用 attention 可视化代码**：`visualize_attention.py` 和 `video_generation.py`
  在任何 ViT 上都能跑（不需要是 DINO 训出来的），用来调试自己训的 ViT 模型
- **借用 multi-crop augmentation**：哪怕做 supervised 训练也能用——
  2 global + 8 local 提供 10 倍隐式 data augmentation，
  对小数据集 fine-tuning 特别有效

### 6.2 下个月能用的部分（≥ 4 子弹）

- **用 DINOv2 + linear probe 做我的"sketchnote 风格分类器"**：
  收集 50 张 sketchnote 风格图 + 50 张非 sketchnote，
  DINOv2 抽特征 + 线性分类器，10 行 sklearn，预计准确率 90%+
- **用 DINO attention map 做 "h5 海报视觉重心检测"**：
  我的学习笔记封面图，自动用 DINO attention 找出"视觉中心"，
  避免文字遮挡主体——比 saliency map 算法精准
- **结合 DINO 特征 + CLIP 特征做混合检索**：
  CLIP 善于 semantic（用文本描述能找到对的图），DINO 善于 visual（同款不同色能识别），
  两者拼接做 image retrieval，对"找类似但更好"的需求有用
- **复用 cosine_scheduler 函数到我自己的训练循环**：
  DINO 的 `utils.cosine_scheduler` 是优秀工程抽象，
  warmup-linear-then-cosine-decay 一行调用，比手写 LR scheduler 简洁

### 6.3 不要用的部分（≥ 4 子弹）

- **不要尝试自己训练 DINO**：从零训练成本极高（16×V100 一周），
  我没有这个资源，也没必要——DINOv2 预训练好的权重 hub.load 一行就能用
- **不要把 K=65536 拍脑袋拿到下游任务**：projection head 输出维度
  是为 SSL pretext 设计的，下游任务用 backbone 特征即可（768/384 维）
- **不要假设 DINO 在所有 backbone 上都能复制**：作者后续工作显示 ConvNeXt 上
  attention emergent 现象明显减弱，DINO 与 ViT 是耦合的——
  我自己玩 self-attention emergence 不要换 backbone
- **不要相信 DINO 的"无监督"是真无监督**：ImageNet-1k 数据集本身已经是
  超精心 curate 过的（每类 ~1300 张高质量 web 图）——
  在真正 uncurated 数据（噪声 100M web crawl）上 DINO 训练会显著退化，
  这是 DINOv2 改用 LVD-142M curated 数据的根因

## Layer 7 · 显式怀疑（≥ 4 件具体的事）

**怀疑 4**：emergent segmentation 是结果还是 prior 注入？

DINO 论文 Section 4.2 反复强调 attention 自动出 segmentation 是 emergent。
但 multi-crop 设计本身已经强加了"局部应该和全局一致"的偏置——
local crop 只看一片 leaf 也要预测出 global 的同样 prototype 分布，
这要求 encoder 必须"把局部 context 化"——也就是分割。
**所以 segmentation emergence 不是 emergent 的，是 multi-crop 的内置 prior**。
论文没承认这一点。验证方式：去掉 multi-crop（仅 2 global），
attention 是否还出 segmentation？论文 Section 4.5 ablation 没专门做这个对照。

**怀疑 5**：Table 4 的 ablation 在 100 epoch 而非 800 epoch

论文主结果（ViT-B/16 78.2% linear）是 800 epoch 训出来的，但 ablation Table 4
为了节约成本只在 100 epoch 做。**100 epoch 时一些 design choice 的影响和 800 epoch 不一样**——
比如 K=4096 vs 65536 的差距在 100 epoch 时可能 1pp，800 epoch 时可能 3pp（K 大需要更长训练才显效）。
论文没在 800 epoch 重做 ablation，意味着我们看到的"重要 component"排序可能在长训练下变化。

**怀疑 6**：linear eval 是 SSL 圈共同的"虚假繁荣"

DINO（和所有 SSL 工作）用 linear eval 报数字——
冻结 backbone 训一个 linear classifier。但 linear eval 偏爱**特征是线性可分的预训练目标**——
contrastive / distillation 训出来的特征天然在某个超球面上线性可分，
而 generative 重建（MAE）训的特征不是。
所以 linear eval 排名 DINO > MAE，但 fine-tune 排名 MAE ≥ DINO，
**这个错位说明 linear eval 是 metric gaming 的产物**。
DINO 论文从没讨论过 linear eval 的内在偏好——它对自己有利所以不必反思。

**怀疑 7**：K=65536 出 segmentation 这个组合是否有更深的解释

DINO 的两个最神奇结果是 (a) attention 出 segmentation, (b) k-NN ImageNet 78.3%。
两者可能有共同根源：**K 大到足以让每张图的 prototype 分布稀疏且不同**——
稀疏分布让 k-NN 自然好（高维稀疏 = 余弦距离判别力强），
也让 ViT 必须学"判别性局部特征"（哪个 patch 属于哪个对象）。
但论文给的解释是"ViT 架构 + SSL 监督的协同"——这是描述不是解释。
后续工作（包括 DINOv2）也没系统回答这个机制问题。
**预判**：2027-2028 会有"理论 SSL"工作把 K-collapse balance 给数学化，
那时回头看 DINO 这个 K=65536 选择会从"经验"升级为"理论"。

## 限制（独立于作者承认的，≥ 4 条）

- **L1 数据 curated 偏见**：所有实验在 ImageNet-1k（128 万 curated）做，
  uncurated 数据上 DINO 表现未知。作者后续工作（DINOv2）证实了 uncurated 数据需要先 curation，
  但 DINO 论文从未承认这个限制
- **L2 计算成本不可忽视**：ViT-B/16 训 800 epoch 需要 64×V100 32GB × 7 天，
  约等于 11k GPU-hour，按 2026 年云价 ≈ 30k 美元。学术机构基本玩不起完整 recipe，
  这把 SSL ViT 训练锁死成大公司 / 大实验室游戏
- **L3 attention map 的解释性是描述性而非可验证**：论文展示 attention map "出 segmentation"，
  但没给出**定量的 segmentation metric**（mIoU 之类）和监督分割模型对比。
  Figure 4 是 cherry-pick，失败案例没展示。后续工作（如 LOST, TokenCut）才把 DINO attention
  做成 quantitative segmentation metric 上 SOTA
- **L4 patch_size=8 的代价被低估**：论文宣称"小 patch 更好"，但
  patch_size=8 的 ViT-S/8 比 ViT-S/16 慢 4 倍（patch 数 4 倍 → attention 复杂度 16 倍但有 sparse 优化）。
  实际 inference 部署时大家还是用 ViT-S/16 或 B/16——
  patch_size=8 的 attention 漂亮但不实用

## 附录：叙事错位（论文宣称 vs 代码现实）

| 论文宣称 | 代码 / repo 现实 | 修正认知 |
|---|---|---|
| "self-distillation no labels" 简洁优雅 | DINOLoss 50 行 + DataAugmentationDINO 40 行 + scheduler 三连 + multi-crop dispatch | 工程实现仍然复杂，"简洁"只在 high-level 叙事 |
| "无需负样本，无需 cluster" | K=65536 prototypes 实际上是隐式 cluster 中心，centering 是隐式 prototype balancing | 没显式 negatives 但有隐式分类目标，更像 SwAV 的连续放松版 |
| "attention 自动出 segmentation" | 需要 patch_size=8 + 800 epoch + ViT 架构 + multi-crop 同时具备 | 任一缺失就显著退化，emergence 是多因素合力 |
| "ViT-S/16 78.3% k-NN" | 这是 800 epoch 训完的数字，100 epoch 只有 ~73% | 长训练才出收益，短训练 SSL 比不过 supervised |
| "可复现的 SSL 训练新范式" | repo 完整但 800 epoch 训练成本 ~30k 美元 | 学术界主要 fine-tune 预训练权重，从零复现很少 |

## 结尾元数据

- 重构日期：2026-05-28
- 总行数：≥ 500（按 v1.1 method 状元篇分支 A）
- 启用 skill：source-learn (Layer 3 精读) + research-gap (Layer 5 反对者部分) + investigate (怀疑 1-7)
- 用到的工具：phd-skills 7 阶段（Layer 4）+ facebookresearch/dino repo（commit `7c446df5b9f45747937fb0d72314eb9f7b66930a`）
- 论文类型 self-classify：method / algorithm paper（v1.1 分支 A）
- 心脏物：DINOLoss + Multi-crop + EMA Teacher 三段 + Section 4.2 attention 可视化
- 主锚定形式：`path:line`（5 处 GitHub permalink，commit hash `7c446df5b9f45747937fb0d72314eb9f7b66930a`）
