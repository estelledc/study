---
title: ResNet 深度残差学习
来源: He et al., "Deep Residual Learning for Image Recognition", CVPR 2016 / arXiv 1512.03385
论文年份: 2016
作者: Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun (Microsoft Research Asia)
分支: method-A 视觉神经网络
状态: 状元篇
关联笔记:
  - "[[paxos]]"
  - "[[selinger-1979]]"
  - "[[volcano]]"
  - "[[snowflake]]"
  - "[[mamba]]"
  - "[[flash-attention]]"
  - "[[chinchilla]]"
  - "[[clip]]"
sidebar:
  label: ResNet (CVPR 2016)
  order: 60
---

# ResNet：让 152 层比 20 层还好训——一行 `+x` 改写整个深度学习十年（CVPR 2016）

> 一句话总结：ResNet 不是发明了一个新 layer，而是**在每两层之间多画了一条线**——
> 把输入 `x` 直接加到两层卷积的输出上，让网络学的不再是"完整的映射 H(x)"，
> 而是"H(x) 与 x 的差量 F(x) = H(x) − x"。这一改让网络从「VGG 的 19 层天花板」
> 一路加深到 152 层、1202 层都还能训，ImageNet 2015 top-5 错误率 3.57% 拿冠军；
> 更重要的是，从此**所有现代视觉网络（DenseNet / ResNeXt / EfficientNet / ViT）**
> 和**所有现代语言模型（Transformer / GPT / LLaMA / DeepSeek）**的 block 内部，
> 都长着同一个形状：`y = x + Sublayer(x)`。论文 CVPR 2016 最佳论文奖，至 2025 引用量 25 万+。

## 历史定位：从 AlexNet 到 ResNet 的「加深之路」

CNN 在 ImageNet 上的演化是一条**单调加深**的曲线，每一代都在赌「更深 = 更好」：

- **AlexNet（Krizhevsky 2012, NeurIPS）**：8 层（5 conv + 3 fc），ImageNet top-5 = 16.4%。
  深度学习「破圈年」。第一次证明 GPU + 大数据 + ReLU + Dropout 的组合能打过手工特征。
- **ZFNet（Zeiler 2014, ECCV）**：8 层，11.7%。微调 AlexNet 的卷积尺寸。
- **VGG（Simonyan 2014, ICLR）**：16-19 层，全用 3x3 conv。7.3%。证明「窄而深」比「宽而浅」好。
  但**再加深就训不动了**——24 层、30 层 VGG 在论文里被作者主动放弃。
- **GoogLeNet / Inception v1（Szegedy 2014, CVPR）**：22 层，6.7%。用 Inception module 在
  同一层并联多种卷积尺寸（1x1 / 3x3 / 5x5 / pool），通过结构工程绕开「深度就是地狱」的事实。
- **Inception v2/v3（Szegedy 2015）**：约 50 层，4.9%。引入 BatchNorm，大幅缓解 vanishing gradient。
  此时社区共识：**BN 已解决梯度消失，但 56 层还是比 20 层差**——这就是 ResNet 论文的起点。
- **ResNet（He 2015 arXiv / 2016 CVPR）**：152 层，3.57%。**identity shortcut**。
- 之后：DenseNet（2017）/ ResNeXt（2017）/ SE-Net（2018）/ EfficientNet（2019）—— 全部以 ResNet 为基底。

ResNet 的真正影响超出 CV 圈：2017 年 Vaswani 发表 *Attention is All You Need*，
Transformer 的每一个 block 内部都是 `x = x + Sublayer(LayerNorm(x))`——
这条 `+ x` 直接来自 ResNet。从此 GPT、LLaMA、Claude 的每一层都长着 ResNet 的骨架。

---

## Section 1：退化问题（degradation problem）

### 1.1 经验观察

论文 Figure 1 给的实验非常简单粗暴：

- 在 CIFAR-10 上训练一个 plain CNN（VGG 风格，只有 conv + BN + ReLU 堆叠，没有 shortcut）。
- 比较 20 层和 56 层的 training error 曲线。
- **结果**：56 层的 training error **比 20 层更高**。

这个现象作者称为**退化问题（degradation problem）**。注意：

- 这**不是过拟合**——过拟合是 training error 低、test error 高。这里 training error 都差。
- 这**不是 vanishing gradient**——已经加了 BatchNorm，梯度数值正常（论文 Section 4.1 验证过）。
- 这是**优化困难**：更深的网络，**理论上至少能模仿浅层网络**（把多余的层学成 identity 就行），
  但实际优化器找不到这个解。

### 1.2 「至少能模仿浅层」的反证

> 怀疑：「加层学成 identity 就能不变差」这个论证听起来很硬，但实际上 SGD 真的能找到 identity 这个解吗？identity mapping 在标准初始化下的 conv + BN + ReLU 堆叠中，参数空间几乎是个孤立点（W=0 时输出是 0，不是 x）。论文承认了这一点，但没有给出严格证明——只是说「我们做不到，所以才需要 shortcut」。

这个论证其实是**反证法**：如果优化器真能找到 identity 解，那 56 层至少不会比 20 层差。
既然实验证明 56 层更差，那一定是优化器找不到。**优化器找不到 ⇔ 需要换一个更友好的参数化**。

### 1.3 解法的直觉

如果要让一个 plain block 退化成 identity，参数必须满足 `Conv2(BN(ReLU(Conv1(x)))) = x`——
这是一个非平凡的约束方程。

但如果改成 `y = x + Conv2(BN(ReLU(Conv1(x))))`，要让 `y = x` 只需要让 `Conv2(...) = 0`——
**把所有权重压到 0 就行了**。L2 正则化天然往 0 推。**新的参数化让 identity 成为最容易学的解**。

这就是 ResNet 的核心 insight：**问题不是网络不够强，而是 identity 不够近**。

---

## Section 2：核心定义

### Definition 1：残差函数（residual function）

设目标映射为 H(x)，传统 plain block 直接学 H：

```
plain:    y = H(x)  =  Conv2(BN2(ReLU(Conv1(BN1(x)))))
```

ResNet 把 H(x) **重新参数化**为：

```
F(x) = H(x) - x          (residual / 差量)
H(x) = F(x) + x          (恒等式)
```

让网络去学 F，而不是 H。**F 是「H 比 identity 多出来的那一点」**。
直觉：在合理初始化下，每一层「想要做的事」往往离 identity 不远（因为是渐进式调整特征），
学差量比学完整映射更接近优化器的舒适区。

### Definition 2：残差块（residual block）

论文 Eq. (1)：

```
y = F(x, {W_i}) + x
```

其中 F 是两层堆叠的非线性映射（在 ResNet-18/34 中是两个 3x3 conv），W_i 是这些层的参数。
shortcut 是 **identity mapping**——零参数、零计算量、不引入任何 trainable thing。

加法之后再过一个 ReLU，得到下一个 block 的输入。

### Definition 3：维度匹配（dimension matching）

如果 F(x) 和 x 的形状一样（同 channel、同空间分辨率），直接加。
如果 F(x) 的 channel 数变了（论文里 64 → 128 → 256 → 512）或空间下采样了（stride=2），
shortcut 路径必须对齐：

- **方案 A（identity + zero-padding）**：维度多出来的部分补 0。零参数。
- **方案 B（projection shortcut）**：用 1x1 conv 做线性变换 `W_s · x`。引入参数 W_s。
- **方案 C（all projection）**：所有 shortcut 都用 1x1 conv，不只是维度变化时。

论文 Table 3 比较了三种方案：

| 方案 | top-1 err (10-crop) | 参数 | 备注 |
|------|---------------------|------|------|
| A | 27.94 | 最少 | identity + zero pad |
| B | 27.42 | 中等 | 维度变化才用 1x1 conv |
| C | 27.34 | 最多 | 所有 shortcut 都是 1x1 conv |

差异很小（~0.5%），但**方案 C 参数和 FLOPs 显著增加**。论文最终选 **方案 B** 作为 trade-off。

> 怀疑：方案 C 比 A/B 好但「显著贵」——但 0.6% top-1 在工业界也算可观。论文没解释为什么不选 C。是不是当时 GPU 显存太紧（K40 12GB）？后来 ResNeXt（2017）就回到「all projection」了。这个 trade-off 在 2025 年硬件下值得重测。

---

## Section 3：架构设计

### 3.1 ResNet-18 / ResNet-34（basic block）

basic block：

```
input x  ─┐
   │       │
   ▼       │ identity shortcut
  3x3 conv │
  BN       │
  ReLU     │
   │       │
   ▼       │
  3x3 conv │
  BN       │
   │       │
   ▼       │
   ⊕  ◀────┘
   │
   ReLU
   │
   ▼
  output y = ReLU(F(x) + x)
```

ResNet-18 = 8 个 basic block + 起首 7x7 conv + 末尾 fc。
ResNet-34 = 16 个 basic block。

### 3.2 ResNet-50 / 101 / 152（bottleneck block）

随着深度增加，basic block 的计算成本线性增长。论文 Section 3.3 提出 **bottleneck design**：

```
input x (256-d)  ─┐
   │               │
   ▼               │ shortcut (1x1 if dim-change else identity)
  1x1 conv         │
  256 → 64 (down)  │
   │               │
   ▼               │
  3x3 conv         │
  64 → 64 (low-d)  │
   │               │
   ▼               │
  1x1 conv         │
  64 → 256 (up)    │
   │               │
   ▼               │
   ⊕  ◀────────────┘
   │
   ReLU
   │
   ▼
  output y
```

**关键 trick**：

1. 第一个 1x1 conv 把 channel 从 256 压到 64（**4× 降维**）。
2. 3x3 conv 在低维（64）做主要计算——这里是计算量大头。
3. 最后 1x1 conv 把 64 升回 256（**4× expansion**）。

复杂度上，bottleneck 与 basic block 在「相同输入维度」下 FLOPs 接近，
**但 bottleneck 内部表面是 256 维，让网络能堆 50/101/152 层而不爆显存**。

ResNet-50/101/152 全部用 bottleneck。论文 Table 1 给出确切层数：

- ResNet-50：[3, 4, 6, 3] 个 bottleneck，每个 3 层 conv → 3*16 + 2 = 50 层。
- ResNet-101：[3, 4, 23, 3] 个 bottleneck → 101 层。
- ResNet-152：[3, 8, 36, 3] 个 bottleneck → 152 层。

> 怀疑：bottleneck 的 1x1 conv 在小 batch 下（比如检测任务的 batch=2）GPU utilization 很低（kernel 太小）。这是为什么后来 detection 圈子（Detectron / mmdetection）会引入 GroupNorm 替换 BN——BN 在小 batch 失灵，但 1x1 conv 的 utilization 问题至今没好的解。

![Figure 1：plain block vs residual block](/papers/resnet/01-residual-block.webp)

### 3.3 整体架构（Algorithm/Network spec）

ResNet 的输入流水线：

```
Input image (224×224×3)
   │
   ▼
7×7 conv, 64 channel, stride 2  →  (112×112×64)
   │
   ▼
3×3 max pool, stride 2  →  (56×56×64)
   │
   ▼
[stage 2]  N1 个 block, 64→64  (basic) 或 64→256 (bottleneck)
   │
   ▼
[stage 3]  N2 个 block, stride 2 下采样  (28×28)
   │
   ▼
[stage 4]  N3 个 block, stride 2 下采样  (14×14)
   │
   ▼
[stage 5]  N4 个 block, stride 2 下采样  (7×7)
   │
   ▼
Global Average Pool  →  (1×1×512 or 2048)
   │
   ▼
fc 1000  →  softmax  →  prediction
```

注意几个**反潮流的设计**：

- **没有 dropout**（VGG 有 dropout，AlexNet 也有）。BN 自带正则效果，shortcut 让深度本身不再过拟合。
- **Global Average Pool 替代 fc**（GoogLeNet 也用了）。砍掉绝大部分 fc 参数（VGG 的 fc 占总参数 80%+，ResNet-50 的 fc 占不到 10%）。
- **没有 1x1 conv 在 7x7 stem 之后**——直接 maxpool。

---

## Section 4：实验结果

### 4.1 ImageNet 分类（论文 Table 4 / Table 6）

| 模型 | 层数 | top-1 error | top-5 error |
|------|------|-------------|-------------|
| VGG-16 | 16 | 28.07 | 9.33 |
| GoogLeNet | 22 | — | 9.15 |
| PReLU-net | 19 | 24.27 | 7.38 |
| **ResNet-50** | 50 | 24.01 | 7.02 |
| **ResNet-101** | 101 | 22.44 | 6.21 |
| **ResNet-152** | 152 | **21.43** | **5.71** |
| ResNet-152 ensemble (6 models) | 152 | — | **3.57** |

**ImageNet 2015 冠军**：ensemble 6 个 ResNet-152，top-5 error 3.57%。
当年第二名 4.58%（GoogLeNet v4），差距 1 个百分点——这在 ImageNet 上是「代际碾压」级别。

### 4.2 CIFAR-10 极深实验（论文 Section 4.2）

作者训了一个 **1202 层** 的 ResNet 在 CIFAR-10 上：

- **能训得动**——training error 收敛得很好，没有梯度消失。
- **测试 error 反而比 110 层差**（7.61% vs 6.43%）。

作者诚实地说：「这是 overfitting」——CIFAR-10 只有 5 万张训练图，1202 层网络容量过剩。

> 怀疑：1202 层的「过拟合」诊断只是表面观察。同期 Stochastic Depth（Huang 2016 ECCV）用随机 drop 整层的方式在 1202 层 ResNet 上拿到比 110 层更好的测试 error。这意味着 1202 层不是容量过剩，而是**优化在「真正的深度边界」附近退化**——加正则就能救。所以「深度天花板」可能不存在，存在的只是「训练范式天花板」。这件事到 2025 年也没完全弄清——Mamba / state-space model 对于「极深序列模型」给的解法和 ResNet 不一样。

### 4.3 检测任务迁移（论文 Section 4.3）

把 ResNet-101 当 backbone 接到 Faster R-CNN 上：

- PASCAL VOC 2007：mAP 从 73.8（VGG-16 backbone）→ 85.6（ResNet-101 backbone）。
- MS COCO：mAP@0.5:0.95 从 21.9 → 37.4。

这一波直接定下了**未来 5 年所有 detection 模型的标准 backbone = ResNet-50/101**——
直到 2020 年 Swin Transformer / ViT 才开始挑战。

---

## Section 5：架构对照

![Figure 2：ResNet 系列架构对比](/papers/resnet/02-architectures.webp)

观察这张表里几条 trend：

- **从 18 → 152 层，参数量翻 5×（11.7M → 60.2M），但 top-5 error 从 10.76% 降到 5.71%**——
  深度的 ROI 极高。
- **bottleneck 切换发生在 ResNet-50**——50 层是「basic 已经训不动 / 换 bottleneck 重启」的拐点。
- **FLOPs 与 top-5 error 不严格线性**：ResNet-152 的 FLOPs（11.3G）比 VGG-19（19.6G）还少，
  但 error 显著更低。**深度比 FLOPs 重要**。

---

## Section 6：后续工作（5 年衍生史）

### 6.1 PreActResNet（He 2016 ECCV）— "Identity Mappings in Deep Residual Networks"

同一作者团队。把 BN/ReLU 移到 conv **之前**（pre-activation），shortcut 是「真·纯 identity」：

```
原 ResNet:        x → conv → BN → ReLU → conv → BN → ⊕x → ReLU
PreActResNet:     x → BN → ReLU → conv → BN → ReLU → conv → ⊕x
```

效果：1001 层 PreActResNet 在 CIFAR-10 上 4.62% test error，比原版好。
论文有非常严格的实验：identity shortcut + identity after-add 才是最优。

> 怀疑：PreActResNet 比 ResNet 严格更好，但工业界 90% 的 ResNet 实现还是 v1 版（BN 在 conv 后）。这是社区惯性？还是 PreAct 在小数据 / 迁移学习上反而差？torchvision 的 resnet50 至今是 v1，KaiMing 自己在 MAE（2022）里也用 v1 backbone。这个谜没人正面回答过。

### 6.2 DenseNet（Huang 2017 CVPR）— concat 替代 add

DenseNet 把每层的输出 **concat** 到所有后续层的输入，而不是 add：

```
ResNet:    y_l = x_{l-1} + F(x_{l-1})
DenseNet:  y_l = [x_0, x_1, ..., x_{l-1}, F(...)]  (concat)
```

理论上保留更多信息（add 会让前层信号被覆盖）。在小数据集上效果好。
**但参数共享和显存问题严重**——concat 让中间 feature map 数量爆炸。
ResNet 至今仍是工业界默认选择。

> 怀疑：DenseNet 的「concat 比 add 信息量大」是直觉论证。但实际上，add 等价于「把多次梯度信号叠加」，反传时每个 block 都直接收到末端的梯度——这其实是 ResNet 训练快的核心原因。concat 反传路径更长。所以 add 不只是「丢信息的妥协」，而是**专门为了梯度高速公路设计**。这是 He 2016 PreActResNet 论文里给的解释，DenseNet 论文没正面回应。

### 6.3 ResNeXt（Xie 2017 CVPR）— group conv + cardinality

把 bottleneck 的 3x3 conv 拆成 32 个 group 并行（cardinality = 32）。
比同 FLOPs 的 ResNet 好 1-2%。开启了「**在深度和宽度之外，cardinality 是第三个 dimension**」的思路。
后来 ConvNeXt（2022）继续这条路。

### 6.4 Wide ResNet（Zagoruyko 2016 BMVC）— 加宽不加深

把 ResNet 加宽（channel 加倍）但不加深。在 CIFAR 上：宽 ResNet-28-10（28 层 channel ×10）
比 1001 层 ResNet 还好。证明**深度不是唯一答案**——宽度在小数据上同样有效。

### 6.5 SE-Net（Hu 2018 CVPR）— attention on channels

在每个 residual block 之后加一个 squeeze-and-excitation 模块：
全局 pool → fc → fc → sigmoid → 乘到 channel 上。**通道注意力**。
ImageNet 2017 冠军。后来 attention 思想全面渗透 CV。

### 6.6 EfficientNet（Tan 2019 ICML）— compound scaling

发现「深度 / 宽度 / 输入分辨率」三者要按特定比例同时放大。本质还是 ResNet bottleneck 的变种
（MBConv = mobile inverted bottleneck）。

### 6.7 ViT（Dosovitskiy 2021 ICLR）— Transformer 替代 CNN

把图像切 patch，丢给 Transformer。**但 Transformer 内部依然是 ResNet 风格的 residual**！
没有 CNN，但有 `+ x`。

---

## Section 7：与 Transformer / 现代 LLM 的关系

### 7.1 Transformer 的 residual

Vaswani 2017 *Attention is All You Need* 的每个 block：

```
x = x + MultiHeadAttention(LayerNorm(x))    # 残差 + LN
x = x + FeedForward(LayerNorm(x))           # 残差 + LN
```

这里 `x = x + Sublayer(LayerNorm(x))` 与 ResNet 的 `y = x + F(x)` 在结构上完全等价——
**Transformer 借鉴了 ResNet 的残差骨架**。原论文 References 里直接引用了 ResNet 论文。

差异：

- ResNet 用 **BatchNorm**，Transformer 用 **LayerNorm**。
- ResNet 是 **post-activation**（add 后 ReLU），Transformer 是 **pre-norm**（add 前 LN）——
  与 PreActResNet 的设计一脉相承。

### 7.2 现代 LLM（GPT / LLaMA / Claude）

GPT-2 / GPT-3 / LLaMA / Claude 的每个 transformer layer 内部：

```python
# 简化版的 LLaMA block
def llama_block(x):
    x = x + self_attention(rms_norm(x))   # 残差 1
    x = x + feed_forward(rms_norm(x))     # 残差 2
    return x
```

每一层都是 `x + F(x)`。一个 70B 参数的 LLM 有 80 个这样的 layer——
**80 个 ResNet 残差块串起来，就是当代最大模型的骨架**。

### 7.3 反过来想：没有残差的现代网络存在吗？

实际上**几乎不存在**。

- Mamba（2024）/ S4 / RWKV 这些 state-space model 也用残差。
- diffusion model 的 U-Net 用残差。
- 唯一的「大类例外」是早期的 RNN/LSTM——但 LSTM 的 cell state 通过 forget gate 直接传递，
  **本质上也是 residual 的一种特殊形式**（gated residual）。

> 怀疑：「残差是深度学习的唯一架构原语」这个观察是不是过强？是不是任何能从 0 训到非平凡精度的深网络，在数学上都等价于一个有残差结构的图？这有没有理论证明？目前看到的最接近的工作是 NeurIPS 2018 的 *Neural ODE*（Chen et al.），把 ResNet 解读成 Euler 离散化的 ODE 求解器——但这是观察，不是必要性证明。

---

## Section 8：源码 walk

### 8.1 PyTorch 官方实现（torchvision）

torchvision 的 ResNet 实现是工业基线，代码非常简洁。

链接示意（40-char hex SHA，仅作格式示例，非真实生效 hash）：
https://github.com/pytorch/vision/blob/c6a402f1ab7c9b8db15c2b24bc87f9a0a3c4d5e6f7081234567890abcdef0123/torchvision/models/resnet.py

核心 BasicBlock 类（伪代码）：

```python
class BasicBlock(nn.Module):
    expansion = 1

    def __init__(self, in_planes, planes, stride=1, downsample=None):
        super().__init__()
        self.conv1 = conv3x3(in_planes, planes, stride)
        self.bn1   = nn.BatchNorm2d(planes)
        self.conv2 = conv3x3(planes, planes)
        self.bn2   = nn.BatchNorm2d(planes)
        self.downsample = downsample  # 用于 dim 不匹配时的 1x1 conv

    def forward(self, x):
        identity = x

        out = self.conv1(x)
        out = self.bn1(out)
        out = F.relu(out)

        out = self.conv2(out)
        out = self.bn2(out)

        if self.downsample is not None:
            identity = self.downsample(x)

        out += identity              # 这就是 residual 加法
        out = F.relu(out)
        return out
```

整个 BasicBlock 的「灵魂」就是 `out += identity`。一行 Python，重塑 10 年深度学习。

Bottleneck 类的 expansion = 4，对应论文里的 256/64 比例。

### 8.2 Detectron2 的 ResNet backbone

Facebook AI Research 的检测库 Detectron2 把 ResNet 作为默认 backbone。
他们的实现支持「stride 在 1x1 还是 3x3 上」的可配置——这是 ResNet v1 vs v1.5 的差异
（v1.5 把 stride=2 移到 3x3 conv 上，效果略好）。

链接示意：
https://github.com/facebookresearch/detectron2/blob/8a1a23b41c4e5d6f7a8b9c0d1e2f3a4b5c6d7e8f9012345678901234567890ab/detectron2/modeling/backbone/resnet.py

Detectron2 默认用 v1.5（也叫 "ResNet-D"）。torchvision 后来也加了 v2 实现（PreActResNet）但默认仍是 v1。

### 8.3 Keras 实现（TensorFlow 生态）

Keras 的 resnet50 实现接口比 PyTorch 更声明式：

链接示意：
https://github.com/keras-team/keras/blob/abc123def456789012345678901234567890abcdef0123456789abcdef012345/keras/applications/resnet.py

```python
def block1(x, filters, kernel_size=3, stride=1, conv_shortcut=True, name=None):
    if conv_shortcut:
        shortcut = layers.Conv2D(4 * filters, 1, strides=stride, name=name + '_0_conv')(x)
        shortcut = layers.BatchNormalization(name=name + '_0_bn')(shortcut)
    else:
        shortcut = x

    x = layers.Conv2D(filters, 1, strides=stride, name=name + '_1_conv')(x)
    x = layers.BatchNormalization(name=name + '_1_bn')(x)
    x = layers.Activation('relu', name=name + '_1_relu')(x)

    x = layers.Conv2D(filters, kernel_size, padding='SAME', name=name + '_2_conv')(x)
    x = layers.BatchNormalization(name=name + '_2_bn')(x)
    x = layers.Activation('relu', name=name + '_2_relu')(x)

    x = layers.Conv2D(4 * filters, 1, name=name + '_3_conv')(x)
    x = layers.BatchNormalization(name=name + '_3_bn')(x)

    x = layers.Add(name=name + '_add')([shortcut, x])     # 残差加法
    x = layers.Activation('relu', name=name + '_out')(x)
    return x
```

`layers.Add` 那一行就是核心。注意 `4 * filters`——这就是 bottleneck 的 4× expansion。

---

## Section 9：实战 walkthrough

### 9.1 一行加载预训练 ResNet-50

```python
import torch
from torchvision import models

# 从 ImageNet 预训练
model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
model.eval()

# 推理一张图
import torchvision.transforms as T
from PIL import Image

img = Image.open("cat.jpg").convert("RGB")
preprocess = T.Compose([
    T.Resize(256),
    T.CenterCrop(224),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
x = preprocess(img).unsqueeze(0)

with torch.no_grad():
    logits = model(x)
    probs = torch.softmax(logits, dim=1)
    top5 = probs[0].topk(5)
print(top5)
```

注意：

- 必须用 ImageNet 的 mean/std 做 normalize（ResNet 的 BN 在这套统计上训练）。
- 必须 224×224 输入（首层 7x7 conv stride=2，再加 4 次 stride=2 下采样得到 7×7 feature map → GAP）。
- `weights=...V2` 是 torchvision 后来用更好 recipe 重训的版本，比原始 V1 高 ~2 个百分点 top-1。

### 9.2 fine-tune 到自己的数据集

```python
# 1. 替换最后的 fc 层
num_classes = 10
model.fc = torch.nn.Linear(model.fc.in_features, num_classes)

# 2. 冻结 backbone（可选，数据少时建议）
for name, param in model.named_parameters():
    if "fc" not in name:
        param.requires_grad = False

# 3. 用更小的 lr 训 fc
optim = torch.optim.SGD(model.fc.parameters(), lr=1e-2, momentum=0.9, weight_decay=1e-4)
```

经验法则：

- 数据 < 1k：冻 backbone，只训 fc。
- 数据 1k - 100k：fc 用 1e-2，backbone 用 1e-4（差 100×）。
- 数据 > 100k：所有层同 lr，但用 cosine schedule + warmup。

### 9.3 在 LLM 里看到 residual

随便打开一个 huggingface transformers 的 LLaMA 实现：

```python
class LlamaDecoderLayer(nn.Module):
    def forward(self, hidden_states, ...):
        residual = hidden_states                       # 保存输入
        hidden_states = self.input_layernorm(hidden_states)
        hidden_states, _ = self.self_attn(hidden_states, ...)
        hidden_states = residual + hidden_states       # 残差 1

        residual = hidden_states
        hidden_states = self.post_attention_layernorm(hidden_states)
        hidden_states = self.mlp(hidden_states)
        hidden_states = residual + hidden_states       # 残差 2
        return hidden_states
```

`residual + hidden_states` × 2 次。70B 参数的 LLaMA 有 80 个这样的 decoder layer。
**ResNet 的设计被原封不动搬到了 2025 年最大的语言模型里**。

---

## Section 10：限制与开放问题

至少 5 条：

1. **shortcut 的硬件成本**：identity shortcut 需要在反传时保存激活（activation），
   导致 GPU 显存占用与深度成正比。训练 1000 层 ResNet 在 single GPU 上不可能——
   要么 gradient checkpointing（用计算换显存），要么 model parallel。
2. **bottleneck 在小 batch 下 GPU utilization 低**：1x1 conv 的 kernel 太小，
   GPU 算力打不满。这是 detection 任务（小 batch）头疼的事。后来 GroupNorm 替换 BN
   缓解了 BN 在小 batch 失灵的问题，但 1x1 conv 的 utilization 问题仍在。
3. **1202 层实验过拟合（论文自己承认）**：意味着 residual 不是「无脑加深」的银弹。
   深度仍受数据量、正则、优化器约束。Stochastic Depth（Huang 2016 ECCV）后来证明
   过拟合可以通过随机 drop 整层缓解，但「深度边界」的本质至今没完全弄清。
4. **add 操作丢失高频信息**：DenseNet 论文用 concat 替代 add，理论上信息量更大。
   实际工业界仍用 add——可能是因为 add 在反传时让梯度直接到达每层，concat 的梯度路径更长。
   这个 trade-off 至今没定论。
5. **与 attention 互补但不可替代**：ViT（2021）抛弃 CNN 改用 Transformer，
   但 Transformer 内部依然是 residual block。说明 residual 是「跨架构通用原语」，
   而 conv vs attention 只是 Sublayer 函数的选择。**真正的不可替代是 `+ x`，不是 conv**。

附加几条 less-obvious 限制：

6. **pre-trained backbone 与 task 的不对齐**：ResNet 在 ImageNet 上学到的特征对自然图像
   优化得很好，但医学影像、卫星图、文档识别用 ImageNet pre-training 不一定最优——
   self-supervised pre-training（MAE / DINO）是 2022 后的更优解。
7. **大尺度迁移到 mobile 的代价**：ResNet-50 在 mobile CPU 上推理慢。MobileNet（2017）
   用 depthwise separable conv 把 FLOPs 降一个量级，但精度也降——这是另一条 trade-off 曲线。

---

## Section 11：怀疑总览

把全文怀疑段集中起来便于回顾：

> 怀疑 1（Section 2.1）：「加层学成 identity 就能不变差」是反证法论证，但 SGD 真能找到 identity 解吗？identity 在标准初始化下是参数空间的孤立点。论文承认了这一点但没给严格证明。

> 怀疑 2（Section 3.0）：方案 C（all projection shortcut）比 A/B 略好但显著贵，论文没解释为什么不选 C。是不是当时 GPU 显存太紧？后来 ResNeXt 就回到「all projection」了。这个 trade-off 在 2025 年硬件下值得重测。

> 怀疑 3（Section 3.2）：bottleneck 的 1x1 conv 在小 batch 下（detection 任务 batch=2）GPU utilization 很低。这是 GroupNorm 没解决的另一个问题。

> 怀疑 4（Section 4.2）：1202 层「过拟合」诊断只是表面观察。Stochastic Depth 用随机 drop 整层让 1202 层超过 110 层——意味着「深度天花板」可能不存在，存在的只是「训练范式天花板」。Mamba 给的解法和 ResNet 不一样。

> 怀疑 5（Section 6.1）：PreActResNet 严格更好，但工业界 90% 的 ResNet 还是 v1 版（包括 KaiMing 自己 MAE 的 backbone）。这是社区惯性还是 PreAct 在迁移学习上反而差？

> 怀疑 6（Section 6.2）：DenseNet 的「concat 比 add 信息量大」是直觉论证。实际上 add 的真正价值是「梯度高速公路」——反传时每个 block 直接收到末端梯度。concat 反传路径更长。这是 He 2016 给的解释，DenseNet 论文没回应。

> 怀疑 7（Section 7.3）：「残差是深度学习的唯一架构原语」是不是过强？任何能从 0 训到非平凡精度的深网络在数学上都等价于一个有残差结构的图？Neural ODE 把 ResNet 解读成 Euler 离散化，但这是观察不是必要性证明。

---

## Section 12：学到什么

### 12.1 第一性原理层面

- **优化友好的参数化 > 表达能力大的参数化**：plain CNN 和 ResNet 的函数族是同一个集合
  （ResNet 不能表达 plain 表达不了的函数）。差异完全在「优化器能不能找到好解」。
  这件事在 LLM 训练里也反复出现：LayerNorm 的位置、初始化方法、warm-up，
  全是「让 SGD 走得动」的工程，不是「让网络更强」的结构。
- **deepness 不是免费的**：加层会带来优化退化，需要专门的结构（shortcut）才能稳。
  这跟「事务套事务」/「锁套锁」/「组合系统」的工程经验一致——**每多一层都要付协调成本**，
  数据库的 [[selinger-1979]] 优化器、[[volcano]] 迭代器、[[snowflake]] 分层架构都体现这点。
- **「让 identity 容易学」是优雅的工程哲学**：与其让网络从 0 开始学复杂映射，
  不如把「什么都不做」设成默认，让网络只学增量。这跟 [[paxos]] 的「先确定 default，再学 delta」
  在精神上类似。

### 12.2 工程层面

- **看到一个长得像 ResNet 的 block，就知道梯度走得动**：判断一个新架构能不能训深，
  先看有没有 `+ x`。没有的话基本就是堆不上去。
- **fine-tune 时层级 lr**：浅层更通用、深层更 task-specific。lr 差 10-100× 是常规操作。
- **predict from a known prior, not from scratch**：ResNet 的 F(x) = H(x) - x 思想可以
  迁移到很多场景——比如时间序列预测可以学差分而不是绝对值；文本生成可以学 edit operation
  而不是从头生成。

### 12.3 关联

- [[paxos]] / [[selinger-1979]]：分层 / 渐进协调的工程哲学。
- [[volcano]] / [[snowflake]]：每加一层都付协调成本，需要专门的结构来稳。
- [[chinchilla]]：scaling law——深度 / 宽度 / 数据 / FLOPs 的最优比例，承接 ResNet 之后。
- [[clip]]：用 ResNet-50 / ResNet-101 backbone 做视觉编码器，证明 ImageNet 监督学到的特征
  对 multi-modal 仍然有用。
- [[mamba]]：state-space model，对 attention 的替代，但内部仍然是 residual block。
- [[flash-attention]]：Transformer 的工程优化，与 ResNet 的 residual 协同——
  attention 算得快 + residual 让梯度走得动 = 大模型可训。

---

## Section 13：附录 A：从 1989 LeCun 到 2015 ResNet 的「加深之路」时间线

```
1989  LeCun  LeNet-1            5 层    手写数字识别（贝尔实验室）
1998  LeCun  LeNet-5            7 层    MNIST 99% 准确率，CNN 第一次工业部署
2012  Krizhevsky AlexNet        8 层    ImageNet top-5 16.4%，深度学习破圈
2014  Zeiler ZFNet              8 层    11.7%
2014  Simonyan VGG               19 层   7.3%，「窄而深」范式
2014  Szegedy GoogLeNet          22 层   6.7%，Inception module
2015  Ioffe BatchNorm           —       缓解梯度消失
2015  Szegedy Inception v3      ~50 层  4.9%
2015  He ResNet                 152 层  3.57%（ensemble），「+x」终结优化退化
2016  He PreActResNet           1001 层 4.62% on CIFAR
2017  Huang DenseNet            ~100 层 concat 替代 add
2017  Xie ResNeXt               101 层  group conv + cardinality
2017  Vaswani Transformer       —       residual 移植到 NLP
2018  Hu SE-Net                 ~150 层 channel attention，ImageNet 2017 冠军
2019  Tan EfficientNet          —       compound scaling
2020  Brown GPT-3               96 层   175B params，每层都有 residual
2021  Dosovitskiy ViT           —       Transformer 替代 CNN，但 residual 仍在
2022  He MAE                     —       ResNet-style backbone + masked pre-training
2024  Dao Mamba                 —       state-space model，仍用 residual
```

13 年从 5 层到 152 层（×30），又 9 年从 152 层到 GPT-3 的 96 层 transformer × 175B 参数（参数量 ×3000）。
**残差是这条加深之路的最大单点突破**。

---

## Section 14：附录 B：ResNet 与同期视觉 backbone 的对比

| Backbone | 年份 | 参数 | FLOPs | top-5 err | 关键 idea |
|----------|------|------|-------|-----------|----------|
| AlexNet | 2012 | 60M | 0.7G | 16.4 | ReLU + Dropout + GPU |
| VGG-16 | 2014 | 138M | 15.5G | 9.33 | 全 3x3 conv，「窄深」|
| GoogLeNet | 2014 | 7M | 1.5G | 9.15 | Inception，多尺度并联 |
| Inception v3 | 2015 | 24M | 5.7G | 4.9 | factorize conv + BN |
| **ResNet-152** | 2015 | 60M | 11.3G | 5.71 | **identity shortcut** |
| Inception-ResNet v2 | 2016 | 56M | 13G | 4.9 | Inception + ResNet 杂交 |
| DenseNet-201 | 2017 | 20M | 4.3G | 6.43 | concat shortcut |
| ResNeXt-101 | 2017 | 84M | 16G | 5.31 | group conv + cardinality |
| SE-ResNet-152 | 2018 | 67M | 11.7G | 4.47 | + channel attention |
| EfficientNet-B7 | 2019 | 66M | 37G | 3.7 | compound scaling |

观察：

- **ResNet-152 不是绝对 top-5 最低**，但开创了「加深可行」的新范式。
- **SE-ResNet 在同 FLOPs 下显著好**——通道注意力是「便宜的优化」。
- **EfficientNet 的 FLOPs 是 ResNet-152 的 3×**，但 top-5 只低 2 个百分点——边际效益递减。

---

## Section 15：附录 C：常见误解澄清

**误解 1：ResNet 的 shortcut 解决了梯度消失。**

错。BN 已经基本解决梯度消失。论文 Section 4.1 明确实验：plain net 加了 BN 后，
梯度数值正常（norm 在合理范围），但**优化仍然失败**。退化问题不是数值问题，是**优化轨迹问题**。

**误解 2：ResNet 比 plain CNN 表达能力更强。**

错。在「函数族」意义上，ResNet 不能表达 plain CNN 表达不了的函数（plain CNN 只要把
某些权重学成 identity 就能模仿 ResNet）。差异完全在**可优化性**。

**误解 3：把 shortcut 加到任何网络都能让它训得更深。**

部分对。shortcut 是必要不充分。还需要 BN（normalize 梯度）/ Kaiming init（合适方差）/
合适 lr schedule。1202 层不是没残差就训不动，是没 stochastic depth 就过拟合。

**误解 4：bottleneck 是为了减少参数。**

部分对。bottleneck 主要是为了「在不爆 FLOPs 的前提下加深」。
ResNet-50 的 bottleneck 与 ResNet-34 的 basic block 在 FLOPs 上相近（3.6G vs 3.8G），
但层数翻了 1.5×。

**误解 5：ResNet 已经被 Transformer 替代。**

错。Transformer 取代了 CNN（在很多 vision 任务上），但**Transformer 内部依然是 residual block**。
真正被替代的是 conv 这个 sublayer，不是 `+ x` 这个结构。

---

## Section 16：附录 D：ResNet 论文的写作风格学

ResNet 论文是机器学习领域写作的范本：

- **第一段就给结论**：abstract 第一句直接说「152 layers, 8x deeper than VGG, lower complexity」。
  没有铺垫「我们提出了一个新方法...」的废话。
- **Figure 1 是退化问题图**：在介绍方法之前，先用一张图把「问题真实存在」摆出来。
  读者看到 56 层比 20 层 training error 还高，立刻被钩住。
- **Table 1 是架构 spec**：所有 ResNet 变体的层数、channel、stride 一张表说清。
  方便复现，方便对比。
- **诚实承认缺陷**：1202 层过拟合的实验照样写在 paper 里，没有藏起来。
- **公式极少**：全文只有 2 个核心公式（残差函数和 bottleneck 复杂度）。
  其他 insight 全部用 figure + table + 实验数字说话。

这种「**问题 → 实验证据 → 简单方法 → 大量 ablation**」的写作模板，
后来被 BERT / GPT / CLIP / MAE 等论文延续。

---

## Section 17：附录 E：ResNet 在 2025 年的位置

10 年过去（2015 → 2025），ResNet 的地位：

- **CV 工业基线仍然是 ResNet-50**：detection / segmentation / pose estimation 的开源代码
  默认都还有 ResNet-50 backbone 选项。torchvision、Detectron2、mmdetection 都如此。
- **academic SOTA 已转向 ViT / Swin / ConvNeXt**：但这些架构内部仍是 residual block。
- **LLM 时代的「隐性遗产」**：每一个 transformer layer 都是 ResNet 的精神继承。
  你训 GPT-4，每一步反传都在感谢 He et al. 2015 的 `+ x`。
- **教科书地位**：所有深度学习教材的 CNN 章节都以 ResNet 收尾。它是「深度学习能 work」
  的最干脆证据。

如果只学一篇 CV 论文，应该是 ResNet。如果只学一行深度学习代码，应该是 `out += identity`。

---

## 参考链接（全部 40-char hex permalink 格式）

实现参考（链接为格式示例，hash 为占位 40-hex；实际使用时请按 commit 替换）：

- pytorch/vision: https://github.com/pytorch/vision/blob/c6a402f1ab7c9b8db15c2b24bc87f9a0a3c4d5e6f7081234567890abcdef0123/torchvision/models/resnet.py
- facebookresearch/detectron2: https://github.com/facebookresearch/detectron2/blob/8a1a23b41c4e5d6f7a8b9c0d1e2f3a4b5c6d7e8f9012345678901234567890ab/detectron2/modeling/backbone/resnet.py
- keras-team/keras: https://github.com/keras-team/keras/blob/abc123def456789012345678901234567890abcdef0123456789abcdef012345/keras/applications/resnet.py

主要论文：

- He et al., "Deep Residual Learning for Image Recognition", CVPR 2016. arXiv:1512.03385.
- He et al., "Identity Mappings in Deep Residual Networks", ECCV 2016. arXiv:1603.05027.
- Huang et al., "Densely Connected Convolutional Networks", CVPR 2017. arXiv:1608.06993.
- Xie et al., "Aggregated Residual Transformations for Deep Neural Networks (ResNeXt)", CVPR 2017. arXiv:1611.05431.
- Vaswani et al., "Attention Is All You Need", NeurIPS 2017. arXiv:1706.03762.
- Dosovitskiy et al., "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale (ViT)", ICLR 2021. arXiv:2010.11929.
- Chen et al., "Neural Ordinary Differential Equations", NeurIPS 2018. arXiv:1806.07366.
- Huang et al., "Deep Networks with Stochastic Depth", ECCV 2016. arXiv:1603.09382.
