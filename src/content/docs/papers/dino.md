---
title: DINO 自监督视觉 transformer
来源: Caron et al., "Emerging Properties in Self-Supervised Vision Transformers", ICCV 2021 / arXiv 2104.14294
---

> 一句话：DINO 用 student/teacher 双 ViT + EMA 做自蒸馏（self-distillation），无 label 训练。最让人意外的不是它跑分高，而是训完之后 ViT 的 [CLS] 注意力自己长出 segmentation mask——一个没人显式要求的「涌现」性质。

## 历史定位

把视觉 self-supervised learning（SSL）放在一条时间线上：

- 2018 之前：rotation prediction / colorization / jigsaw——pretext task 五花八门，效果都一般
- 2019 MoCo（He et al.）——动量编码器 + queue，第一次让 contrastive learning 在 ImageNet 接近 supervised
- 2020 SimCLR（Chen et al.）——大 batch + 强增广 + projection head 三件套，contrastive learning 范式确立
- 2020 BYOL（Grill et al.）——「不要 negative pair 也能 work」，predictor + EMA target 是关键
- 2020 SwAV（Caron et al.）——cluster assignment + multi-crop，DINO 一作的前作
- **2021-04 DINO（Caron et al.）——self-distillation + ViT，emergent attention map**
- 2022 MAE（He et al.）——masked image modeling 重新崛起，BERT 风路线开始反超
- 2022 iBOT（Zhou et al.）——DINO + MIM 缝合
- 2023 DINOv2（Oquab et al.）——LVD-142M 数据，foundation 视觉特征事实标准

理解 DINO，等于理解 2020-2023 这几年视觉 SSL 从「contrastive 卷积」过渡到「distillation + ViT 涌现」的转折点。

---

## Section 1：动机——为什么把 self-distillation 搬到 ViT

### 1.1 contrastive 路线的疲态

到 2020 年底，SimCLR / MoCo / BYOL 已经把 ResNet-50 的 ImageNet linear probe 从 50% 推到 74% 左右。看着接近 supervised（76%），但有几个不舒服的地方：

1. **negative pair 工程量大。** SimCLR 要 batch 4096 才好，MoCo 要 65K queue。这些 trick 说明 contrastive 本身不够"自给自足"。
2. **特征不够 transfer。** k-NN 评估往往掉 5-10 点，说明对比目标主要把"同一图的两个 view"拉近，对类间结构学得没那么好。
3. **CV 没有 BERT 时刻。** NLP 已经被 transformer + masked LM 统一，CV 还在 ResNet + contrastive 里打转。

### 1.2 ViT 的奇怪困境

ViT（Dosovitskiy et al. 2020）出来之后，supervised 训练需要 JFT-300M 这种内部数据才能压过 ResNet。社区试过把 SimCLR / MoCo 直接套在 ViT 上——work 但收益不大，attention map 看起来跟随机差不多。

这里就有一个直觉假设：**ViT 的 inductive bias 弱（不像 CNN 自带 locality / translation 等价），所以 ViT 比 CNN 更需要"对的预训练目标"才能 unlock 注意力的潜力。** DINO 这篇论文实际上就是对这个假设的一次实验。

### 1.3 DINO 的赌注

不要 contrastive 的 negative pair。直接做 self-distillation：

- 同架构两个 ViT，一个叫 student、一个叫 teacher
- teacher 是 student 的 exponential moving average（EMA）——也就是 teacher 没有自己的梯度更新，只是 student 的"慢速副本"
- 把同一张图做不同 crop，喂给两个网络
- student 的输出去拟合 teacher 的输出（cross-entropy），梯度只更新 student

这套思路其实在 BYOL 已经出现过，但 DINO 把它跟 ViT 缝在一起后发生了一件论文标题里说的事：**emerging properties**——ViT 的注意力自动学到了物体边界。

> 怀疑：「emergent」这个词在 2021 之后被滥用了。DINO 的 emergent attention 是不是研究 PR 大于实质？工业上做分割还是用 SAM，DINO attention 只是「漂亮的可视化」。这个 emergent 性质带来什么真实下游收益？我目前能找到的最硬的下游应用是：DINOv2 的 dense feature 在 monocular depth / semantic segmentation 这类需要 patch-level 表征的任务上确实比 CLIP 强，且 fine-tune 收敛快。但这个收益是不是必须靠 emergence？换 supervised pretrain 也许同样 work——这个对照试验论文里没做干净。

---

## Section 2：核心定义

### Definition 1：self-distillation（自蒸馏）

经典 distillation（Hinton 2015）：用一个大 teacher 网络教一个小 student 网络。teacher 是预先训好的，student 学 teacher 的 soft label。

self-distillation 反过来：student 和 teacher 同架构（甚至完全相同），teacher 没有"独立训练"——它由 student 的参数派生（EMA）。看上去像左手教右手，但 EMA 引入了一种"时间上的低通滤波"，让 teacher 比 student 更稳定，目标也更稳定。

形式上：
```
θ_t ← λ · θ_t + (1 - λ) · θ_s
```
其中 `λ` 是动量系数（DINO 用 cosine schedule，从 0.996 涨到 1.0）。

### Definition 2：multi-crop strategy

同一张图取多种 crop：

- **global crops（2 个）**：分辨率 224×224，覆盖图的 50%-100%
- **local crops（多个，默认 8 个）**：分辨率 96×96，覆盖图的 5%-50%

关键约束：
- **student 看所有 crop**（global + local）
- **teacher 只看 global crops**

这一不对称是核心设计——student 必须从局部碎片"猜"出 teacher 看全局时的输出，于是被迫学习"局部到整体"的语义对应。

> 怀疑：multi-crop 的不对称性是不是 DINO emergence 的真正原因？SwAV 里就有 multi-crop（DINO 一作 Caron 是 SwAV 一作），SwAV 的 attention 也没那么 emergent。所以 multi-crop 是必要不充分。真正的关键可能是 multi-crop × ViT × self-distillation 三者交互——这种"组合涌现"在论文里没拆得很干净。

### Definition 3：centering + sharpening（防 collapse 的两板斧）

self-distillation 最大的失败模式是 collapse：teacher 和 student 都输出常数（比如所有维度都接近均匀分布），loss 也很低，但学不到东西。

DINO 的解决方案是两个相反方向的力：

1. **centering**：teacher 输出在送进 softmax 前，减去一个 running mean `c`：
   ```
   p_t = softmax((g_t(x) - c) / τ_t)
   c ← m · c + (1 - m) · mean(g_t(x))  # m = 0.9
   ```
   这一步避免某个维度永远占主导（一种 collapse）。
2. **sharpening**：teacher 的 softmax 温度 `τ_t = 0.04`，比 student 的 `τ_s = 0.1` 低得多。低温让 teacher 输出更尖锐（接近 one-hot），避免另一种 collapse——所有维度都被均匀化。

两个力的方向相反：centering 推向均匀，sharpening 推向尖锐。它们的平衡点就是"有结构但不退化"。

### Definition 4：output dimension（投影头维度）

DINO 在 ViT 的 [CLS] 输出后接一个 projection head（3 层 MLP + L2 norm + 线性层），输出维度 `K = 65536`。

这个数字看起来夸张。直觉解释：相当于 65536 个"伪类"，让模型在没有真实标签的情况下，学会对每张图分配一个"伪类"概率分布。维度越大，能容纳的"概念槽位"越多。

> 怀疑：65536 这个数字有没有 rigorous 的最优分析？直觉上 ImageNet 才 1000 类，65 倍是不是过设？论文 §5.3 ablation 显示 K 从 1024 涨到 65536 单调上升但收益递减。这意味着 65536 是工程经验值，不是某个理论最优。后续 DINOv2 把这个数提到 131072，方向延续，但解释仍然是"经验上更大更好"。

### Definition 5：emergent attention map

训完 DINO 之后，把一张图 forward 一次，取最后一层 multi-head self-attention 里 [CLS] token 对其他 patch token 的 attention weight，按 patch 网格还原成一张 heatmap，会看到 heatmap 的高响应区**自动覆盖物体主体**——和 ground truth segmentation mask 高度吻合。

强调一点：**没有任何 segmentation 监督参与训练**。这是 self-distillation + ViT 这套 setup 的副产品，论文标题"emerging"指的就是这个。

---

## Section 3：方法（Method）

### Section 3.1：训练 loss

给定一张图 `x`，按 multi-crop 生成 crop 集合 `V`：

- `V_g = {x^g_1, x^g_2}`：2 个 global crops
- `V_l = {x^l_1, ..., x^l_8}`：8 个 local crops（默认）
- `V = V_g ∪ V_l`

定义网络输出（projection head 后）：
- `g_s(·)`：student 输出 logits
- `g_t(·)`：teacher 输出 logits（applies centering）

每个 crop 走完之后，把输出过 softmax：
- `P_s(x) = softmax(g_s(x) / τ_s)`
- `P_t(x) = softmax((g_t(x) - c) / τ_t)`

Loss 是 cross-entropy 形式，遍历 (teacher_view, student_view) 配对：

```
L = Σ_{x ∈ V_g} Σ_{x' ∈ V, x' ≠ x}  H(P_t(x), P_s(x'))

H(a, b) = - Σ_i  a_i  log b_i
```

直觉：teacher 看 global view 输出一个分布，student 看任何其他 view（global 或 local）应该输出相近的分布。

注意：
- teacher 不参与梯度（`stop_gradient`）
- 求和只在 `x ≠ x'` 上（不让 teacher 自己教自己）
- teacher 只 process global crops（计算量节省 + 不对称信号）

伪代码（论文 Algorithm 1 改写）：
```python
# x: image, t_aug: teacher augmentation, s_aug: student augmentation
def dino_step(x, student, teacher, center, tau_s, tau_t, m):
    x1, x2 = t_aug(x), t_aug(x)              # 2 global crops
    locals_ = [s_aug(x) for _ in range(8)]   # 8 local crops

    s_out = [student(v) for v in [x1, x2] + locals_]
    t_out = [teacher(v) for v in [x1, x2]]   # teacher only sees globals

    loss = 0
    for i, t in enumerate(t_out):
        for j, s in enumerate(s_out):
            if (i < 2) and (j == i):
                continue                      # skip same view
            t_p = softmax((t - center) / tau_t)
            s_p = log_softmax(s / tau_s)
            loss += -(t_p * s_p).sum(dim=-1).mean()

    loss.backward()
    optimizer.step()                          # update student only
    teacher_params = m * teacher_params + (1 - m) * student_params  # EMA
    center = 0.9 * center + 0.1 * mean(concat(t_out))               # update center
```

### Section 3.2：防 collapse 的工程细节

ablation（论文 Table 6）：
- 关掉 centering → 立刻 collapse（teacher 输出某维度饱和）
- 关掉 sharpening → 慢速 collapse（输出趋向均匀，loss 看似在降但学不到东西）
- 两者都开 → 稳定训练

centering 的 momentum `m_c = 0.9`，比 EMA momentum 小很多（EMA 是 0.996+）——因为 center 需要更快跟上数据分布，不能滞后。

sharpening 的温度 `τ_t = 0.04`：经验值，论文 §5.3 ablation 显示 0.04-0.07 都 work，超过 0.1 退化明显。

> 怀疑：「centering 防 collapse」的故事在直觉上说得通，但严格来讲它跟 BYOL 的 predictor 设计是同一个数学对偶吗？后续 Tian et al. 2021 的 "Understanding Self-Supervised Learning Dynamics" 给了一个 toy linear analysis：所有 SSL 的"防 collapse 机制"——无论是 negative pair / predictor / centering——本质上都在阻止表征矩阵的奇异值塌陷。如果这个统一理论成立，centering 就不是 DINO 的核心创新，只是另一种实现。

### Section 3.3：架构

ViT backbone（无 modifier）+ 3 层 MLP projection head：

| 模型 | 参数量 | patch | 训练时长（V100×8）|
|------|--------|-------|---------------------|
| ViT-S/16 | 21M | 16 | 1.7 day |
| ViT-S/8 | 21M | 8 | 6.5 day |
| ViT-B/16 | 85M | 16 | 3.0 day |
| ViT-B/8 | 85M | 8 | 14.0 day |

`/8` 表示 patch size 8，比 `/16` 计算量大 4 倍但效果更好。论文最终主推的是 ViT-B/8。

参考实现里的训练入口：
- `https://github.com/facebookresearch/dino/blob/cb711401860da580817918b9167ed73e3eef3dcfe/main_dino.py`（链接示意，hash 仅形式）
- multi-crop 实现：`https://github.com/facebookresearch/dino/blob/cb711401860da580817918b9167ed73e3eef3dcfe/vision_transformer.py`（链接示意）

projection head：
```python
class DINOHead(nn.Module):
    def __init__(self, in_dim, out_dim=65536, hidden_dim=2048, bottleneck_dim=256):
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(in_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, bottleneck_dim),
        )
        self.last_layer = weight_norm(nn.Linear(bottleneck_dim, out_dim, bias=False))
        self.last_layer.weight_g.data.fill_(1)
        self.last_layer.weight_g.requires_grad = False  # weight_norm 关 grad

    def forward(self, x):
        x = self.mlp(x)
        x = F.normalize(x, dim=-1, p=2)  # L2 norm
        return self.last_layer(x)
```

这里有两个细节：
1. `bottleneck_dim = 256`：MLP 出来后先 L2 norm 到一个低维，再线性映射到 65536。这一步类似 SwAV 的 prototype，把"概念槽位"显式化。
2. `weight_g` 关掉 grad：weight normalization 的"幅度"维度固定，只学方向。论文里说这一步对稳定性很关键。

---

## 训练流程图

![DINO self-distillation 训练流程](/papers/dino/01-self-distillation.webp)

图说：student/teacher 双 ViT，teacher 由 student EMA 派生。multi-crop 喂入，student 学预测 teacher 输出。centering + sharpening 防 collapse。

---

## Section 4：实验结果

### Section 4.1：ImageNet linear probe

冻结 backbone，只训一个线性层。论文 Table 2：

| 方法 | 架构 | 参数 | linear top-1 |
|------|------|------|--------------|
| supervised | ViT-B/16 | 85M | 79.9 |
| MoCov3 | ViT-B/16 | 85M | 76.5 |
| BYOL | ResNet-50 | 25M | 74.3 |
| SwAV | ResNet-50 | 25M | 75.3 |
| **DINO** | ViT-S/16 | 21M | **77.0** |
| **DINO** | ViT-B/16 | 85M | **78.2** |
| **DINO** | ViT-S/8 | 21M | **79.7** |
| **DINO** | ViT-B/8 | 85M | **80.1** |

ViT-B/8 的 80.1% 是 2021 SSL 上的 SOTA，**第一次跨过 supervised ViT-B/16 的 79.9%**。

### Section 4.2：k-NN 评估

最有意思的不是 linear probe，是 k-NN。直接用 backbone 输出做 k=20 近邻分类：

| 方法 | 架构 | k-NN top-1 |
|------|------|------------|
| supervised | ViT-B/16 | 76.1 |
| MoCov3 | ViT-B/16 | 71.4 |
| **DINO** | ViT-B/8 | **77.4** |
| **DINO** | ViT-B/16 | **76.1** |
| **DINO** | ViT-B/16 (DINOv2 后续) | 78.3 |

注意 DINO ViT-B/8 的 77.4 **超过 supervised 76.1**——这一点意义比 linear probe 更深刻。它说明 DINO 学到的不只是"线性可分"的特征，而是"度量空间结构"本身就接近真实语义。

### Section 4.3：下游迁移（segmentation / detection）

| 任务 | 数据集 | metric | DINO ViT-S/8 | supervised ViT-S/16 |
|------|--------|--------|--------------|---------------------|
| 视频分割（无监督） | DAVIS-2017 | J&F | 61.8 | n/a |
| object discovery | VOC07 | CorLoc | 45.9 | 35.3 |
| copy detection | INRIA Copydays | mAP | 81.7 | 73.6 |
| image retrieval | Oxford-Hard | mAP | 51.5 | 41.5 |

视频分割那一行是关键：DINO 的 [CLS] attention 直接拿来做无监督 mask propagation，性能逼近一些有监督 baseline。

> 怀疑：这些 transfer 实验里 supervised baseline 是不是太弱？supervised ViT-S/16 在 ImageNet linear 才 78%，但 supervised ResNet-50 是 76%。如果 baseline 换成更强的 supervised ConvNet（比如 ConvNeXt-T），DINO 的优势是不是会缩小？DINOv2 论文里给了部分对比，证实了 ViT-only 这条路确实压制大部分 ConvNet baseline，但前提是数据规模 ≥ 1B。在 ImageNet-1K 这种 1.4M 数据级别，supervised ConvNeXt 的 transfer 仍然非常 competitive。

### Section 4.4：scaling

论文 §5.5 测了 ViT-S/16 / ViT-S/8 / ViT-B/16 / ViT-B/8 的 scaling：

- patch 越小越好（/8 > /16）：因为 token 数量平方级增长，能捕获更细粒度的局部对应
- 模型越大越好：但 ViT-B/16 → ViT-B/8 的提升 > ViT-S/16 → ViT-B/16，说明"减小 patch"的边际收益 > "增大模型"

这一发现直接影响了 DINOv2 的设计——DINOv2 用 ViT-g/14（patch 14）+ 142M 数据，把这条路推到极致。

---

## Section 5：emergent properties——论文标题指的就是这个

### 5.1 [CLS] attention 自动 segmentation

ViT 的 attention 形式：每个 head 输出一个 attention matrix `A ∈ R^(N+1) × (N+1)`，其中 `N` 是 patch 数量，`+1` 是 [CLS]。取最后一层、所有 head 的 `A[0, 1:]`（[CLS] 对所有 patch 的 attention）求平均，按 patch 网格 reshape，就得到一张 attention heatmap。

DINO 的发现：这张 heatmap **只在 DINO 训练后才呈现 segmentation 形态**。supervised ViT 的 attention 看起来更随机；MoCo/BYOL 训练的 ViT attention 偶尔会有结构，但远不如 DINO 干净。

不同 head 学到不同模式：
- 有的 head 关注「主体物体」
- 有的 head 关注「头部」「四肢」
- 有的 head 关注「背景」

这种 head-wise specialization 在 supervised ViT 里也存在，但被 supervised label 压制；DINO 没有 label 反而让它"长出来"。

### 5.2 features 含 patch-level 语义

把 patch token 的特征做 cluster（k-means k=21），每个 cluster ID 当 mask 上色，结果接近 segmentation——同一个 instance 的 patch 被分到同一个 cluster。

这意味着 patch-level feature 不只是为 image-level 分类服务，本身就携带 dense semantic structure。这一点对下游 dense prediction 任务（segmentation / depth / detection）至关重要。

### 5.3 robustness

DINO ViT 在 ImageNet-A / ImageNet-C 等 OOD 测试上比 supervised ViT 更稳健：
- ImageNet-A：DINO 17.5% vs supervised 7.5%（高越好）
- ImageNet-C：DINO mCE 56.6 vs supervised 64.0（低越好）

直觉解释：self-distillation 的目标是"两个 view 输出一致"，天然鼓励特征对扰动不敏感。

---

## 注意力涌现示例

![DINO ViT 的 [CLS] attention map 自动分割](/papers/dino/02-attention-emergence.webp)

图说：三组样本（猫 / 狗 / 车）。左是输入图，右是 [CLS] 在最后一层的 attention 可视化。没有用任何 segmentation label，但 attention 的高响应区自动覆盖物体主体。

---

## Section 6：后续与衍生

### 6.1 iBOT（Zhou et al. 2022）

把 DINO 和 BERT-style masked image modeling 缝在一起：
- DINO loss 保持（image-level）
- 加 masked patch loss：随机 mask 一部分 patch，让 student 预测被 mask patch 在 teacher 输出空间的投影
- 结果：linear probe 推到 81.6%，下游 dense task 提升明显

iBOT 实质上是给 DINO 补了一条 patch-level supervision——DINO 自己的 patch-level emergence 被显式化。

### 6.2 DINOv2（Oquab et al. 2023）

FAIR 把 DINO 推到 foundation 视觉特征级别：

- 数据从 ImageNet-1K 换成 LVD-142M（自动 curated 142M 图）
- 缝合 DINO + iBOT + KoLeo regularizer + Sinkhorn-Knopp centering
- backbone 推到 ViT-g/14（1.1B 参数）
- 蒸馏出 ViT-S/14 / ViT-B/14 / ViT-L/14 系列给社区用

DINOv2 提供的 dense feature 在 monocular depth / semantic segmentation 上是 2023-2024 的事实 baseline，参考实现：
- `https://github.com/facebookresearch/dinov2/blob/c3c2683a13cde94d4d99f523cf4170384b00c34a/dinov2/models/vision_transformer.py`（链接示意）

> 怀疑：DINOv2 在 LVD-142M（FAIR 内部数据）上训，与 CLIP 的 WIT 数据一样不开源。学术界 SSL 怎么 keep up？目前 OpenCLIP 在 LAION-2B 上训出的 DINO-style 模型（OpenCLIP DINO）效果接近但有 2-3 点 gap。这不是模型设计差距，而是数据 curation 差距——这个 gap 在可见的未来很难抹平。

### 6.3 PixPro / DenseCL / VICRegL

这些是 "dense SSL" 路线——直接在 patch / pixel level 做对比或回归。和 DINO 路线的差别是不依赖 [CLS] 涌现，而是显式监督 dense feature。两条路线在 dense prediction 任务上各有胜负。

### 6.4 Segment Anything（Meta 2023）

[[sam]] 不是 SSL 但用了 DINO/CLIP 风格的 ViT image encoder。SAM 的 encoder 用的是 MAE 而不是 DINO，但社区有不少工作把 DINOv2 作为 SAM 的替换 backbone，效果在某些 dense 任务上更好。

---

## Section 7：限制（≥ 5 条）

1. **训练成本仍大。** ViT-B/16 + 8 V100 GPU × 3 day。ViT-B/8 + 16 GPU × 14 day。这意味着这是一篇"工业实验室友好、学术实验室不友好"的论文。社区复现 DINO 通常要 4-8 张 A100 + 完整一周。
2. **centering / sharpening 超参敏感。** `τ_t = 0.04` vs `0.07` 在某些 batch size 下差距明显。社区 issue 里有不少"换 batch size 后 collapse"的报告。
3. **小集群难复现。** DINO 默认 batch size 1024（global view），降到 256 时 EMA momentum 需要重新调，论文没给详细 schedule。
4. **emergent attention 在小物体 / 多物体场景仍粗糙。** 一张图里有 5 只猫时，attention 倾向于聚焦最显著的那只；多 instance segmentation 不能直接从 [CLS] attention 拿 mask。
5. **与最强 supervised 仍有微小 gap。** ViT-B/8 linear 80.1% 看起来超 supervised ViT-B/16 的 79.9%，但 supervised ViT-L/16 + JFT 是 87%+。SSL 还没追上"大数据 + 大模型 + supervised"的天花板。
6. **依赖 ViT。** ResNet 上做 self-distillation（如 DINO 论文 Table 7）效果好但没 emergent attention。说明 DINO 的核心收益跟 transformer 的注意力机制深度耦合——换 backbone 就丢一半故事。

> 怀疑：DINO + ViT 的成功是不是依赖 ViT 本身（Transformer）的 inductive bias 弱？换 ResNet 是不是 self-distillation 失效？BYOL on ResNet 的 emergent attention 没那么强。论文 Table 7 自己有 ResNet 实验，linear probe 75.3%（和 SwAV 同水平），但论文里几乎没提 ResNet 的 attention 分析——这是个 implicit 的承认：emergent 故事只在 ViT 上成立。

---

## Section 8：参考实现关键 commit

按论文顺序对应到 facebookresearch/dino 仓库（链接示意，hash 为占位 40-char）：

- 训练主入口（multi-crop loader + EMA + loss）：
  `https://github.com/facebookresearch/dino/blob/cb711401860da580817918b9167ed73e3eef3dcfe/main_dino.py`
- ViT 实现（patch embedding / attention / [CLS]）：
  `https://github.com/facebookresearch/dino/blob/cb711401860da580817918b9167ed73e3eef3dcfe/vision_transformer.py`
- DINOv2 ViT（gated MLP + Layer Scale + ViT-g/14）：
  `https://github.com/facebookresearch/dinov2/blob/c3c2683a13cde94d4d99f523cf4170384b00c34a/dinov2/models/vision_transformer.py`

读源码建议顺序：
1. `vision_transformer.py` 看 ViT 怎么搭（已经看过 [[vit]] 可以跳）
2. `main_dino.py` 看 multi-crop dataloader：`DataAugmentationDINO` 这个类把 PIL transform 拆成 global / local 两组
3. `main_dino.py` 看 `DINOLoss.forward`：里面是上面 Section 3.1 伪代码的 PyTorch 实现
4. `utils.py` 看 EMA 更新和 cosine schedule

---

## Section 9：和其他论文的关系

### 9.1 [[vit]]：DINO 的骨架

DINO 用的就是原版 ViT，没改架构。但 DINO 揭示了一件事：**ViT 在 supervised 训练下"未充分利用"**——它的 attention 其实有更多结构可以学，supervised label 反而压制了这种结构。这一观察是后续 MAE / iBOT / DINOv2 的共识起点。

### 9.2 [[clip]]：另一条路

CLIP 用对比 + 文本监督，DINO 用自蒸馏 + 无监督。两条路在 2023-2024 渐渐合流：
- CLIP 路线擅长 image-level 语义和 zero-shot
- DINO 路线擅长 dense feature 和 patch-level 语义
- 工业实践：image-level 任务用 CLIP，dense task 用 DINOv2，融合用 SigLIP / LLaVA-style 多塔

> 怀疑：CLIP vs DINO 这场"路线之争"会持续多久？2025 年看起来是融合趋势——SigLIP-2 用了类 DINO 的 multi-crop + EMA，MetaCLIP 在做 LAION-2B 的 curation 也用 DINO 特征做去重。也许 5 年后回头看，CLIP 和 DINO 是同一棵进化树的两个分支，最终的 foundation visual encoder 会两边都吸收。

### 9.3 [[resnet]]：被超越的 backbone

ResNet 时代的 SSL（SimCLR / MoCo / BYOL / SwAV）已经把 ResNet-50 推到 75% 左右。DINO + ViT-B/8 直接干到 80%。从这一刻起，视觉 SSL 的主流 backbone 切到 ViT，ResNet 退到 deployment 端。

### 9.4 [[sam]]：dense feature 的下游

SAM（Segment Anything Model）的 prompt-able 分割能力建立在强 image encoder 之上。SAM 自己用的是 MAE，但社区把 DINOv2 作为 SAM 的替换 backbone 后，零样本分割能力有可见提升——这是 DINO 派 dense feature 的工业认证。

### 9.5 [[mamba]]：架构层面的对照

Mamba 是另一条"挑战 transformer"的路线（state space model）。DINO 的 emergent attention 故事跟 transformer 注意力机制深度绑定——如果 Mamba 在视觉成功，self-distillation 还能不能产生类似的 emergent properties？目前社区在 vision Mamba 上做 SSL 的工作仍少（Vim、VMamba 主要是 supervised），这是个开放问题。

---

## Section 10：学到什么——零基础视角

### 10.1 self-distillation 的直觉

把 self-distillation 想成**写日记 + 读自己昨天的日记**：

- student 是今天的我，正在学习
- teacher 是过去 100 天我的"心智综合"——每天我都把今天的状态混 0.4% 进去（EMA momentum 0.996）
- 我今天看一张图的局部碎片，要去预测过去 100 天的我看完整张图后会怎么描述它
- 这个目标不依赖任何外部老师

为什么能 work？因为"过去的我"比"今天的我"更稳定（多天平均后噪声小）；同时 multi-crop 强迫"今天的我"必须从局部信息推出全局——这是真正的学习压力。

### 10.2 为什么 ViT 上 emerge

ViT 的 self-attention 本身就有"软分配"的语义：每个 token 对其他 token 算权重。supervised 训练给一个 image-level label，attention 是被压向"哪些 patch 帮我分类"——往往集中在判别性的小区域（比如猫脸）。

DINO 的目标是"两个 view 的 [CLS] 输出一致"——这逼着 [CLS] 要对所有 patch 形成一个稳定的"全局总结"。在多 crop 的不对称下，"全局总结"必须覆盖物体主体（因为 local crop 只看到一部分主体），于是 attention 自然分散到整个物体。

这是一个**目标函数 → 架构特性 → 涌现现象**的因果链，论文里没直接说，但理解这条链才理解 DINO 为什么是 ViT 专属。

### 10.3 给我的 takeaway

1. **SSL 不是 contrastive 一种范式。** distillation / clustering / masked modeling 都行；选哪种取决于 backbone 和任务。
2. **架构和目标必须 co-design。** 同样的 self-distillation 在 ResNet 上效果一般，在 ViT 上才 emerge。这警告我："换 backbone 同方法"的迁移性比想象中差。
3. **"emergent" 是一个需要被审视的词。** DINO 的 emergent attention 是真的，但论文标题的修辞掩盖了"哪些是真正涌现，哪些是工程精调的副产品"。每次读 emergence 类论文都要问：消融了吗？换 setup 还在吗？
4. **数据 curation 是 SSL 的隐形门槛。** DINO 在 ImageNet-1K 已经够强，DINOv2 跨到 LVD-142M 才彻底起飞。学术复现 DINO 不难，复现 DINOv2 几乎不可能——数据壁垒比模型壁垒高。

---

## Appendix：核心超参表

按论文 §A.1 整理（ViT-B/16 默认）：

| 类别 | 名称 | 值 |
|------|------|-----|
| 优化 | optimizer | AdamW |
| 优化 | learning rate (peak) | 0.0005 × batch_size / 256 |
| 优化 | weight decay | 0.04 → 0.4 (cosine) |
| 优化 | warmup | 10 epochs |
| 优化 | total epochs | 100 (ViT-B/16) / 300 (ViT-S/16) |
| 优化 | batch size | 1024 |
| EMA | teacher momentum | 0.996 → 1.0 (cosine) |
| 损失 | student temp τ_s | 0.1 |
| 损失 | teacher temp τ_t | 0.04 → 0.07 (warmup 30 ep) |
| 中心化 | center momentum | 0.9 |
| 投影头 | hidden dim | 2048 |
| 投影头 | bottleneck dim | 256 |
| 投影头 | output dim K | 65536 |
| 数据增强 | global crop scale | (0.4, 1.0) |
| 数据增强 | local crop scale | (0.05, 0.4) |
| 数据增强 | num local crops | 8 |
| 数据增强 | color jitter | yes |
| 数据增强 | gaussian blur | global only |
| 数据增强 | solarization | global only, p=0.2 |

几个值得记住的数：
- `τ_t = 0.04`：teacher 温度，比 student 低 2.5×，这是 sharpening
- `EMA momentum 0.996 → 1.0`：cosine schedule，越训越像把 teacher 完全冻住
- `K = 65536`：投影头输出维度，远大于真实类别数，这是经验值
- `batch size 1024`：分布在 8 GPU 上每卡 128。降到每卡 32 (batch 256) 时需要重调

---

## Appendix：和 BYOL 的对比

DINO 和 BYOL 都是"无 negative pair 的 SSL"，差别不小：

| 维度 | BYOL | DINO |
|------|------|------|
| backbone | ResNet 主推 | ViT 主推 |
| target 网络 | EMA student | EMA student |
| 防 collapse | predictor MLP | centering + sharpening |
| 输出维度 | 256 (projection) | 65536 (over-cluster) |
| loss | MSE on L2-norm features | cross-entropy on softmax |
| multi-crop | no | yes (核心) |
| emergent attention | weak | strong |

最关键的差别是**输出维度和 loss 形式**。BYOL 把特征拉到 256 维做回归；DINO 把特征推到 65536 维做分布拟合。后者本质是给 SSL 一个"伪分类"信号，比"特征对齐"更强。

> 怀疑：BYOL 和 DINO 的差别能不能被理论统一？目前没有干净的 reduction 把两者写成同一个目标的两个特例。Tian et al. 2021 的 toy analysis 只覆盖到"目标网络存在 + 防 collapse 机制"层面，对维度和 loss 形式的差别没拆出来。这意味着 SSL 理论还差一步。

---

## Appendix：复现脚本骨架

如果要在 4 GPU 小集群上复现 DINO ViT-S/16，建议：

```bash
# 1. 数据：ImageNet-1K（1.28M 训练图，需要原版完整版本）
# 2. 环境：torch 1.9+ / timm 0.4.12 / 8 V100 推荐，4 V100 也可（半精度+gradient accumulation）
# 3. 启动：
python -m torch.distributed.launch --nproc_per_node=4 main_dino.py \
    --arch vit_small \
    --data_path /path/to/imagenet/train \
    --output_dir /path/to/output \
    --batch_size_per_gpu 64 \
    --epochs 100 \
    --warmup_epochs 10 \
    --use_fp16 true \
    --num_workers 8
```

预期：
- ImageNet linear probe 达到 ~76% (ViT-S/16, 100 ep)
- 训练时间 ~3 day on 4 V100
- 显存：每卡 ~15 GB（fp16）

避坑：
1. 如果 batch size 必须降到 256 以下，把 EMA momentum 从 0.996 降到 0.99，否则 teacher 跟不上 student
2. multi-crop 的 num_workers 不能太低（推荐 ≥ 8），数据加载是瓶颈
3. ImageNet 路径用绝对路径，分布式启动里相对路径常常解析错
4. 训练前 10 epoch loss 抖动很大（teacher 温度 warmup 中），不要误以为 collapse

---

## 结语

DINO 在 2021 年做了三件事：

1. 把 self-distillation 从 BYOL 的 ResNet 路线搬到 ViT 上，证明 ViT + SSL 可以超 supervised
2. 发现并命名了 emergent attention map——一个让整个 SSL 社区意识到"我们没在好好用 ViT 的注意力"的现象
3. 给 DINOv2、iBOT、SAM 这些后续工作打下了基础设施

它的限制也是清楚的——超参敏感、训练贵、ResNet 上不灵。但作为 [[vit]] 之后视觉 SSL 的关键节点，DINO 是绕不过去的论文。

下一步推荐阅读顺序：
- [[vit]] 如果还没看
- [[clip]] 看 SSL 的另一条对比路线
- [[sam]] 看 dense feature 的下游放大
- DINOv2 论文（Oquab et al. 2023）看 DINO 怎么变成 foundation visual encoder
- iBOT 论文（Zhou et al. 2022）看 DINO 和 MAE 的融合
