---
title: Discrete Distribution Networks（离散分布网络）
来源: https://arxiv.org/abs/2401.00036
日期: 2026-06-13
分类: 机器学习
子分类: 生成模型
provenance: pipeline-v3
---

# Discrete Distribution Networks（离散分布网络）

## 一句话总结

DDN 是一种全新的生成模型：它不让神经网络只"吐出"一张图，而是同时吐出 K 张图，用这 K 张图组成的离散分布来逼近真实数据的分布。

## 日常类比：厨师做菜

想象你是一位学厨艺的学生，目标是模仿一道名菜。

传统模型（如 GAN、DDPM）的做法是：厨师每次尝试做一道菜，做得好就记住配方，做得不好就扔垃圾桶重来。要做出足够多样的菜，厨师需要尝试非常多次。

DDN 的做法是：厨师每次同时做 K 道"半成品菜"，然后尝一尝哪一道跟目标最接近，只把最接近的那一道交给下一轮继续加工。第一轮可能做得很粗糙，但第二轮会基于第一轮最好的结果再做 K 道，第三轮再选最好的继续……层数越多，最终成品就越接近目标。

关键区别：每次不只试一次，而是同时试 K 次，然后"择优录取"。

## 核心概念 1：离散分布层（DDL）

DDN 的基本构建块叫 **Discrete Distribution Layer（离散分布层，DDL）**。每一层做三件事：

1. **生成 K 个候选**：接收上一层的输入（第一层时输入是全零），通过 K 个"输出节点"同时生成 K 张图像
2. **择优**：从 K 张中选一张与目标图像最接近的（用 L2 距离衡量）
3. **传递**：被选中的那一张传给下一层，同时记录下被选中的是第几个节点（这个编号就是"隐变量"）

如果网络有 L 层、每层 K 个节点，总共有 K^L 种可能的输出路径。即使 K=512、L=128，K^L 也是一个天文数字，远超任何数据集的规模。

**用代码理解：**

```python
import torch
import torch.nn as nn

# 假设有一层 DDL，包含 K=5 个输出节点
# 每个节点是一组 1x1 卷积，把特征图变成图像
K = 5
batch_size = 1
height, width, channels = 64, 64, 3

# 每个输出节点的 1x1 卷积参数
# shape: [K, channels, channels] —— 每个节点独立学习如何"变换特征到图像"
output_nodes = nn.Parameter(
    torch.randn(K, channels, channels)
)

def forward_ddl_layer(features, output_nodes, target_image):
    """
    前向传播：K 个候选 -> 选最优 -> 计算损失

    Args:
        features: 上一层的特征图, shape [batch, channels, H, W]
        output_nodes: K 个节点的卷积核, shape [K, C, C]
        target_image: 目标图像, shape [batch, C, H, W]

    Returns:
        best_output: 选出的最佳输出图像
        best_index: 最佳输出对应的节点编号（隐变量）
        loss: 仅对选中的输出计算 L2 损失
    """
    batch, C, H, W = target_image.shape

    # 步骤 1：K 个节点各自生成一张图像
    # 对每个节点做 1x1 卷积 -> 得到 K 张候选图像
    # output_nodes shape: [K, C, C]
    # features shape: [batch, C, H, W]
    # 展开 features 为 [batch*H*W, C]，然后跟每个节点的卷积核做矩阵乘法
    x_flat = features.permute(0, 2, 3, 1).reshape(-1, C)  # [batch*H*W, C]
    candidates = torch.matmul(x_flat, output_nodes.T)       # [batch*H*W, K]
    candidates = candidates.reshape(batch, H, W, K, C)     # [batch, H, W, K, C]
    candidates = candidates.permute(0, 4, 1, 2, 3)         # [batch, C, H, W, K]

    # 步骤 2：择优——计算每张候选与目标的 L2 距离，选最小的
    distances = torch.norm(candidates - target_image, p=2, dim=1)  # [batch, H, W, K]
    distances = distances.mean(dim=[1, 2])  # [batch, K] 平均所有像素
    best_index = torch.argmin(distances, dim=1)  # [batch]

    # 步骤 3：取出被选中的输出
    batch_indices = torch.arange(batch)
    best_output = candidates[batch_indices, :, :, best_index, :]  # [batch, C, H, W]

    # 步骤 4：只对选中的输出计算损失
    loss = torch.norm(best_output - target_image, p=2) / batch

    return best_output, best_index, loss
```

## 核心概念 2：Split-and-Prune 优化算法

DDN 面临一个关键挑战：每一层只对被选中的节点更新参数，那些没被选中的节点就会"饿死"（类似 VQ-VAE 中的 dead codebooks 问题）。DDN 的解决方案是借鉴进化论的 **Split-and-Prune**：

- **Split（分裂）**：当某个节点被选中的频率过高（超过阈值 2/K），就克隆它变成两个节点。刚克隆时参数完全一样，但后续训练中它们会被不同的样本引导，逐渐分化成不同的输出
- **Prune（修剪）**：当某个节点长期不被选中（低于阈值 0.5/K），就直接删除它

这就像生物进化：频繁被"自然选择"的物种会繁衍分裂，长期被淘汰的物种会灭绝。

```python
class SplitAndPrune:
    """
    Split-and-Prune 优化器
    类比：物种的繁衍（分裂）与灭绝（修剪）

    - 被选中的节点就像"适者生存"，获得繁衍机会
    - 不被选中的节点就像"不适者"，面临灭绝
    - 分裂后的两个子节点一开始相同，但后续训练会让它们"分道扬镳"
    """

    def __init__(self, K=512):
        self.K = K
        self.split_threshold = 2.0 / K      # 超过此频率就分裂
        self.prune_threshold = 0.5 / K       # 低于此频率就修剪
        self.counts = torch.zeros(K)         # 每个节点的选中计数
        self.num_samples = 0

    def step(self, selected_index, K_current):
        """
        训练一步：选择节点 + 可选的分裂/修剪

        Args:
            selected_index: 本轮被选中的节点编号

        Returns:
            needs_split: 是否需要执行 Split
            needs_prune: 是否需要执行 Prune
        """
        self.counts[selected_index] += 1
        self.num_samples += 1

        # 计算每个节点的相对频率
        frequencies = self.counts[:K_current] / self.num_samples

        # 找出频率最高和最低的节点
        max_freq_idx = torch.argmax(frequencies).item()
        min_freq_idx = torch.argmin(frequencies).item()

        needs_split = frequencies[max_freq_idx] > self.split_threshold
        needs_prune = (K_current > 2) and (frequencies[min_freq_idx] < self.prune_threshold)

        if needs_split:
            # 克隆最高频节点：复制参数，平分计数
            # 两个新节点初始参数相同，但后续会被不同样本引导
            pass

        if needs_prune:
            # 删除最低频节点，从网络中移除
            pass

        return needs_split, needs_prune
```

## 核心概念 3：生成与重建

DDN 有两种用法：

### 3.1 重建（Reconstruction）

给定一张目标图片，从全零开始逐层推理，每层选最接近目标的候选。最终输出的图像就是重建结果。沿着推理路径记录的节点编号序列 [k1, k2, ..., kL] 就是这张图片的"隐变量编码"。

### 3.2 生成（Generation）

把 Guided Sampler（择优采样器）换成 **随机选择**。因为总共有 K^L 条路径，随机选一条就能生成一张新图片。

**生成过程代码：**

```python
def generate_ddn(ddn_network, L, K, random_seed=42):
    """
    从 DDN 生成一张新图片

    训练时：每层选最接近目标的（Guided Sampler）
    生成时：每层随机选一个节点（Random Sampler）

    Args:
        ddn_network: 训练好的 DDN 网络（包含 L 层 DDL）
        L: 网络层数
        K: 每层的节点数
        random_seed: 随机种子

    Returns:
        generated_image: 生成的图像 [C, H, W]
        latent_codes: 隐变量编码序列 [L]，每个元素是 0..K-1 的整数
    """
    import random

    torch.manual_seed(random_seed)
    random.seed(random_seed)

    # 第一层输入：全零
    current_input = torch.zeros(1, 3, 64, 64)
    latent_codes = []

    for layer_idx in range(L):
        layer = ddn_network.layers[layer_idx]

        # 当前层生成 K 个候选
        candidates = layer(current_input)  # shape: [1, 3, 64, 64, K]

        # 关键：随机选择，而非择优选择
        chosen_idx = random.randint(0, K - 1)
        latent_codes.append(chosen_idx)

        # 取出选中的候选作为下一层输入
        current_input = candidates[:, :, :, chosen_idx, :]

    # 最终输出就是生成的图像
    generated_image = current_input.squeeze(0)
    return generated_image, latent_codes

# 举例：假设 DDN 的 K=512, L=128
# 隐变量编码长度 = 128，每个值是 0~511
# 信息量 = 128 * log2(512) = 128 * 9 = 1152 bits
# 一张 64x64 RGB 图像的原始像素信息量约为 64*64*24 = 98304 bits
# 压缩比 = 98304 / 1152 ≈ 85:1
print(f"隐变量信息量: {128 * 9} bits")
print(f"原始图像信息量: {64 * 64 * 24} bits")
print(f"压缩比: ~{64*64*24 // (128*9)}:1")
```

## 核心概念 4：零样本条件生成（ZSCG）

这是 DDN 最吸引人的特性之一。传统生成模型要支持"文本生成图片"或"低分辨率转高分辨率"，需要为每种条件单独训练一个模型。DDN 不需要：它可以在推理时动态切换"择优标准"。

做法：把 Guided Sampler 中的"L2 距离最小"替换为其他标准。例如：
- 用分类器：选属于目标类别概率最高的
- 用 CLIP：选与文本描述语义最接近的
- 用超分辨率：选经过下采样后最接近低分辨率条件的

**最关键的是：DDN 不需要梯度！** 它只依赖分类器的输出概率（argmax），而不是反向传播。这意味着可以用黑盒模型（如闭源 API）作为条件引导。

```python
def guided_sampling_with_classifier(candidates, classifier, target_class):
    """
    分类器引导的零样本条件生成

    训练时选"最接近目标"的，生成时选"最符合类别"的

    Args:
        candidates: K 个候选图像, shape [1, C, H, W, K]
        classifier: 分类器（可以是黑盒，只要能给出类别概率）
        target_class: 目标类别索引

    Returns:
        best_index: 被选中的节点编号
    """
    batch, C, H, W, K = candidates.shape

    # 将 K 个候选分别输入分类器
    # candidates: [1, C, H, W, K] -> [K, C, H, W]
    candidate_list = candidates.permute(4, 0, 1, 2, 3).squeeze(1)

    # 分类器给出每个候选属于目标类别的概率
    probs = classifier(candidate_list)[:, target_class]  # [K]

    # 选概率最高的
    best_index = torch.argmax(probs).item()

    return best_index


def conditional_generate(ddn_network, L, K, classifier, target_class):
    """
    条件生成：给定类别，生成该类别的图片
    不需要任何梯度反向传播！
    """
    current_input = torch.zeros(1, 3, 64, 64)
    latent_codes = []

    for layer_idx in range(L):
        layer = ddn_network.layers[layer_idx]
        candidates = layer(current_input)

        # 用分类器引导选择，而非随机选择
        idx = guided_sampling_with_classifier(candidates, classifier, target_class)
        latent_codes.append(idx)

        current_input = candidates[:, :, :, idx, :]

    return current_input.squeeze(0), latent_codes
```

## 训练技巧

DDN 提出了一些实用的训练技巧：

**Chain Dropout（链式丢弃）**：训练中有一定概率（默认 5%）让每层改用随机选择而非择优选择。防止网络只在少数几条路径上过拟合，相当于给训练加了正则化。

**Learning Residual（残差学习）**：借鉴 ResNet，每层不是直接输出图像，而是输出"与前一层输出的残差"。两层之间的计算量很小，直接回归图像很难，学残差就容易多了。

**Leak Choice（选择泄漏）**：每个输出节点额外学习一套特征，直接传给下一层作为"选择信号"。这样下一层不需要从图像中反复解析上一层的决定，训练更高效。

## 与其他生成模型对比

| 特性 | GAN | VAE | Diffusion | DDN |
|------|-----|-----|-----------|-----|
| 生成方式 | 单样本生成 | 单样本生成 | 多步迭代生成 | 每层 K 候选择优 |
| 重建能力 | 弱（无编码器） | 强（有编码器） | 弱（反向过程） | 强（天然可重建） |
| 条件生成 | 需单独训练 | 需单独训练 | 需单独训练 | 推理时动态引导 |
| 隐变量 | 无 | 连续向量 | 无 | 离散整数序列 |
| 零样本条件 | 不支持 | 不支持 | 有限支持 | 全面支持 |

## 实验数据

- **CIFAR-10**：FID = 52.0（低于 Gated PixelCNN 的 65.9，但高于 GLOW 的 46.0）
- **CelebA-HQ 64x64**：FID = 35.4
- **FFHQ 64x64**：FID = 43.1
- 模型参数量 93M，K=512, L=128

## 思考题

DDN 的核心思想是"每层同时生成 K 个候选，择优传递"。这和 Transformer 中的 beam search（束搜索）有相似之处——都是保留多个候选路径。但 DDN 是在像素空间直接操作，而 beam search 是在序列空间操作。你觉得这两种方法在"表示能力"上的根本区别是什么？
