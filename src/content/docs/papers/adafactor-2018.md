---
title: Adafactor — 把 Adam 的优化器内存从 O(d) 压到 O(√d)
来源: 'Shazeer & Stern, "Adafactor: Adaptive Learning Rates with Sublinear Memory Cost", ICML 2018'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Adafactor 是一种**为大模型训练省内存的优化器**。日常类比：你记一张全班 1000 人的考试成绩表（1000×1000 的座位表），每格记一个分数，要存一百万个数；Adafactor 说"我只记每行平均分（1000 个数）和每列平均分（1000 个数），用的时候再相乘还原"。

这样 1000×1000 的二维表只用了 2000 个数，从 100 万压到 2000——**100 倍**。

它由 Google Brain 的 Noam Shazeer 提出，后来被 T5、mT5 等 Google 系大模型训练广泛采用，是"训练很大模型时先想省优化器内存"的代表方案。

## 为什么重要

不理解 Adafactor，下面这些事都没法解释：

- 为什么 Adam 训练大模型时显存爆炸——Adam 每个参数额外存 **2 份**（动量 m + 二阶矩 v），训 10B 参数等于把模型存了 3 遍
- 为什么 T5 / mT5 论文里反复提"用 Adafactor 优化器"——不是品味，是**显存逼出来的选择**
- 为什么 LoRA / ZeRO 这些省显存工具常和它一起被讨论——它们解决的层面不同，但都在追同一个目标：少存冗余状态
- 为什么 Hugging Face Transformers 会给 T5 这类模型提供 Adafactor 配置

## 核心要点

Adam 的二阶矩 V 是一个**和参数同形状**的矩阵——参数 1 亿个，V 就 1 亿个。Adafactor 三步压它：

1. **行列因子化**：把 M×N 的二阶矩 V 用两个向量近似——一个**行和** R（M 个数）、一个**列和** C（N 个数），再用 V_ij ≈ R_i × C_j / sum(R) 还原
2. **默认不存动量 m**：Adam 的一阶矩也是 O(d)，论文里的主设定把它关掉，再省一份状态；如果任务确实需要，也可以打开一阶矩
3. **防爆补丁**：丢动量 + 因子化让训练不稳，用**更新裁剪**（update clipping）和**递增衰减率**两招稳住

三招合起来：**优化器辅助内存从 O(d) 降到 O(√d)**（对方阵），实测训 Transformer WMT 翻译任务结果和 Adam 持平。

## 实践案例

### 案例 1：行列因子化省了多少

设一个 4096×4096 的权重矩阵（Transformer 中 FFN 层很常见）：

- Adam 的二阶矩 V：4096 × 4096 = **1677 万个数**
- Adafactor 的 R 和 C：4096 + 4096 = **8192 个数**
- 压缩比：**约 2048 倍**

整个 11B 参数的 T5 模型训练，Adafactor 比 Adam 省下来的优化器显存以**几十 GB** 计。

### 案例 2：因子化怎么"还原"二阶矩

```python
# Adam 的存储 (M×N 矩阵)
V = exp_avg_sq  # shape: [M, N]

# Adafactor 的存储 (两个向量)
R = V.sum(dim=1)  # shape: [M], 每行的和
C = V.sum(dim=0)  # shape: [N], 每列的和

# 用的时候还原
V_approx = R.unsqueeze(1) * C.unsqueeze(0) / R.sum()
# shape: [M, N]，但不是精确等于 V
```

这是一种**秩 1 风格的因子化估计**——假设 V 大致可以写成"行因子 × 列因子"的乘积。论文不是说它精确还原每个格子，而是用实验证明这种估计在 Transformer 翻译任务上足够好。

### 案例 3：丢动量在数学上为什么没崩

Adam 用一阶矩 m 是为了**让步长在梯度抖动时保持平滑**——梯度突然变向时，m 还记着上一步方向，更新不会瞬间反转。Shazeer 观察到 Transformer 训练里梯度并没那么抖，**二阶矩自带的"按梯度幅度归一化"效果**已经够稳，再叠一层动量收益边际递减。

测试方法：在 WMT EN-DE 等翻译任务上比较训练曲线和 BLEU，Adafactor 不带动量时接近 Adam；这说明"省掉 m"在这些大模型场景里可行，但不是所有任务的定理。

### 案例 4：T5 训练里它的位置

```python
# Hugging Face Transformers 训 T5
from transformers import Adafactor

optimizer = Adafactor(
    model.parameters(),
    lr=None,                  # 用相对步长 (relative step size)
    scale_parameter=True,      # 按参数自身规模缩放更新
    relative_step=True,        # 自动调步长
    warmup_init=True
)
```

注意 `lr=None`——Adafactor 自带"按参数自身规模决定步长"的机制（`relative step size`），把"调学习率"这件事也省了一半工作。

## 踩过的坑

1. **不是所有任务都比 Adam 好**：图像分类、强化学习等任务，丢动量后**收敛明显变慢**，仍然推荐 Adam。Adafactor 的甜区是**大语言模型 + 长训练**

2. **裁剪阈值要调**：默认 `clip_threshold=1.0`，但论文里在某些任务上调到 0.1 才稳——丢动量后训练对超参更敏感

3. **对 1D 参数（bias / LayerNorm）退化**：因子化只对 ≥2D 矩阵有意义，1D 向量 Adafactor 退回普通 Adam 行为，省不到内存

4. **`relative_step=True` 时不要再设 lr scheduler**：会和内置的步长调度冲突，loss 直接发散

5. **大 batch 训练才显出优势**：小 batch + 短训练时，因子化引入的近似误差会让 loss 曲线明显比 Adam 抖。论文里都是 batch ≥ 4096 的实验

6. **混精训练要小心**：fp16 下 R / C 这两个累加向量容易溢出，Hugging Face 实现里默认对累加用 fp32，别图省事改回 fp16

## 适用 vs 不适用场景

**适用**：
- 大语言模型预训练（T5 / mT5 / UL2 这类长训练）
- 显存吃紧、模型 ≥1B 参数
- 长训练、batch 大、学习率敏感的任务
- TPU 训练（Google 默认推荐）

**不适用**：
- 中小模型（< 100M 参数），动量带来的收益 > 内存代价
- 计算机视觉（ResNet / ViT），实测 Adam / SGD 表现更好
- 强化学习（动量对策略梯度很关键）
- 需要快速收敛的微调任务（用 AdamW 更稳）

## 与 Adam 的对照表（一目了然）

| 维度 | Adam | Adafactor |
|---|---|---|
| 优化器辅助内存 | O(d) × 2（m + v） | O(√d) |
| 一阶矩（动量） | 有 | 无 |
| 二阶矩存储 | 全矩阵 | 行 + 列向量 |
| 学习率 | 需手设 + scheduler | 可自适应（relative step） |
| 数值稳定性 | 默认稳 | 需 update clipping |
| 适用规模 | 任意 | ≥ 1B 参数收益最大 |

## 历史小故事（可跳过）

- **2014 年**：Kingma & Ba 提出 Adam，深度学习圈快速普及——但当时模型最多几亿参数，O(d) 优化器显存还没被注意到
- **2017 年**：Transformer / BERT 出现，参数膨胀到 1B+，Adam 的 3× 显存代价开始成为训练瓶颈
- **2018 年**：Noam Shazeer（也是 Transformer 论文作者之一）在 Google Brain 提出 Adafactor，2018 ICML 发表
- **2019 年起**：T5（11B）、Switch Transformer、PaLM（540B）全用 Adafactor。它从"小众省内存技巧"变成"大模型时代默认优化器"

Shazeer 后来还做了 **Mesh-TensorFlow**、**MoE**、**Multi-Query Attention**——大模型工程的几个关键引擎都有他。

## 学到什么

1. **二阶矩可以低秩式近似**——不是所有"看起来高维"的量都需要全维度存；这和 LoRA 都利用了低维结构，但一个省优化器状态，一个省微调参数
2. **大模型工程里，常数因子也是命**——Adam → Adafactor 只是"少存一份"，但乘上参数量就是几十 GB 的差别
3. **算法选择要看规模**：100M 参数选 Adam，10B 参数选 Adafactor，不是"哪个更好"而是"在这个规模下哪个更可行"
4. **稳定性 vs 内存的 tradeoff**：丢动量省内存，但要靠裁剪 + 衰减率补回稳定性。每一项工程优化都有代价
5. **作者血统决定接受度**：Shazeer 既是 Transformer 又是 Adafactor 作者，所以 Google 系大模型几乎全跟。这是工程界一个真实但很少被讨论的因素

## 延伸阅读

- 论文 PDF：[Adafactor (arXiv 1804.04235)](https://arxiv.org/abs/1804.04235)
- T5 训练里的 Adafactor 配置：[T5 paper §3](https://arxiv.org/abs/1910.10683)
- Hugging Face 实现：[transformers/optimization.py — Adafactor](https://github.com/huggingface/transformers/blob/main/src/transformers/optimization.py)
- [[adam-2014]] —— Adafactor 直接对标的基线
- [[adamw-2017]] —— Adam 的另一个改进方向（解耦权重衰减）

## 关联

- [[adam-2014]] —— 二阶矩存储的源头；Adafactor 把它压到 O(√d)
- [[adamw-2017]] —— 同期 Adam 改进，关注衰减不是内存
- [[lora]] —— 低秩近似思路的衍生应用（参数微调侧）
- [[t5]] —— Adafactor 最大规模的实战检验（11B）
- [[transformer]] —— Shazeer 既是 Transformer 也是 Adafactor 作者，两者一脉相承
