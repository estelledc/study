---
title: ResNet — 残差连接
来源: 'He et al., "Deep Residual Learning for Image Recognition", CVPR 2016'
日期: 2026-05-29
分类: 计算机视觉 / 深度学习
难度: 中级
---

## 是什么

ResNet（Residual Network，残差网络）是 Microsoft Research Asia 的何凯明 2015 年发明的神经网络结构——核心动作就一个：**在每两层之间多画一根线，把输入直接加到输出上**。这根线叫做 **skip connection**（跳过连接）/ **shortcut**（短路）。

日常类比：

- 之前的网络像盖楼，每层只能问下一层要消息。盖到 100 层时，最高层和最底层的信号已经在传话游戏里走形了——这叫**梯度消失**，网络盖太高就"塌"。
- ResNet 给每层加了一部**直达电梯**——信号既走"楼梯"（卷积层），也走"电梯"（shortcut 直传）。无论盖多高，最底层的信号都能直接到顶。

效果立刻显现：之前神经网络最深训到 19 层（VGG），ResNet 一口气干到 **152 层**还能稳定训练。ImageNet 错误率从 7% 降到 3.57%，**首次超过人类水平**（人类识图错误率约 5%）。

你写：

```python
y = relu(conv(x) + x)   # 就这一行，让深网络能训
```

这一个 `+ x`，重塑了之后 10 年的深度学习。

## 为什么重要

不理解 ResNet，下面这些事都没法解释：

- 为什么 [[attention]] / [[bert]] / [[gpt-3]] / [[clip]] / [[vit]] / [[ddpm]] 这些现代大模型每一层内部都长一个样：`x = x + Sublayer(x)`——这个 `+ x` 直接来自 ResNet
- 为什么 ResNet-50 至今仍是 CV 论文比较的标准 backbone（10 年没换）
- 为什么 152 层比 20 层好训——直觉是"层数越多越难"，但 ResNet 把这个直觉打反了
- 为什么这一篇论文引用 25 万次（计算机视觉历史最高），博士生必读

## 核心要点

ResNet 的全部秘密可以拆成 **三个动作**：

1. **跳过连接（shortcut）**：在两层卷积之上多画一根线，把输入 `x` 直接加到这两层的输出上。原本 `y = F(x)`，改成 `y = F(x) + x`。这根线零参数、零计算量。

2. **学残差，不学完整映射**：让网络去学"输入和输出的差量 F(x) = H(x) − x"，而不是"完整映射 H(x)"。直觉：每层做的事情应该是"在输入上微调一下"，而不是"从零造一个全新输出"。学差量比学完整映射更接近优化器的舒适区。

3. **Bottleneck 降参数**：深到 50 层后，每个块改成 1×1 → 3×3 → 1×1 三层结构。第一个 1×1 把 channel 从 256 压到 64（降维省算力），3×3 在 64 维做主要计算，最后 1×1 升回 256。这样能堆到 152 层而不爆显存。

三个动作合起来叫 **Residual Learning**（残差学习）。

## 实践案例

### 案例 1：最简单的残差块

```python
def residual_block(x):
    out = relu(conv1(x))
    out = conv2(out)
    out = out + x         # 这一行就是 ResNet 的灵魂
    return relu(out)
```

**逐行解释**：

- `conv1(x)` / `conv2(...)`：两层卷积，做主要的特征变换
- `out + x`：把原始输入直接加到输出上——shortcut 不引入任何参数
- 反向传播时，梯度可以**沿 shortcut 直接传到底层**，不会衰减——这就是"梯度高速公路"

这一行 `out + x`，让深度学习从 19 层突破到 152 层。

### 案例 2：ResNet 系列层数与精度

| 模型 | 层数 | top-5 错误率 |
|------|------|--------------|
| VGG-19 | 19 | 9.33% |
| ResNet-18 | 18 | 10.76% |
| ResNet-50 | 50 | 7.02% |
| ResNet-101 | 101 | 6.21% |
| ResNet-152 | 152 | **5.71%** |

观察：

- 同样深度下（VGG-19 vs ResNet-18），ResNet 已经接近——但 VGG 是当时极限，ResNet 还能继续加深
- 越深越好——18 → 152 层，错误率单调下降
- 加 ensemble（多个 ResNet-152 投票）后到 **3.57%**，首次超人

### 案例 3：ResNet-50 为什么是 backbone 标配

至今（2026 年）大量 CV 论文还把 ResNet-50 当 baseline：

- detection（Faster R-CNN / Mask R-CNN）默认 backbone
- segmentation（DeepLab / FCN）默认 backbone
- contrastive learning（SimCLR / MoCo）默认 encoder

理由：

- **精度够**：ResNet-50 的 76% top-1 已经是合格基线
- **算力适中**：4G FLOPs，单 GPU 几小时能训完
- **生态成熟**：torchvision / timm 一行加载预训练权重

如果论文只用 ResNet-50 做对比都跑不赢基线，文章很难被接受。

## 踩过的坑

1. **shortcut 不解决梯度消失，解决的是"优化困难"**：BatchNorm 已经把梯度数值稳住了，但 56 层的 plain 网络仍比 20 层的差——这不是数值问题，是 SGD 找不到好解。ResNet 重新参数化让 identity 成为最容易学的解，**绕开了优化困境**。

2. **维度不匹配时怎么 add**：当卷积改了 channel 数（64 → 128）或做了下采样（stride=2）时，`x` 和 `F(x)` 形状对不上不能直接相加。解法：在 shortcut 路径上插一个 1×1 conv 做线性投影，把 `x` 变到对的形状再加。

3. **1202 层不再线性变好**：作者试着堆到 1202 层，结果在 CIFAR-10 上反而比 110 层差——是过拟合。残差不是"无脑加深"的银弹，深度仍受数据量约束。

4. **add 比 concat 更适合做 shortcut**：DenseNet 用 concat 替代 add，信息保留更多，但梯度反传路径更长。**add 的真正价值不是"信息保留"，而是"让梯度直接到达每层"**——这是 ResNet 训得动的核心。

## 适用 vs 不适用场景

**适用**：

- 任何想堆超过 30 层的深网络（CV / NLP / multi-modal 都行）
- 需要稳定训练大模型——LLM 的每个 transformer layer 都是 ResNet 风格
- 迁移学习——ImageNet 预训练的 ResNet-50 权重几乎是 CV 的"通用特征提取器"

**不适用**：

- 极小模型（< 10 层）——shortcut 帮助有限，反而引入额外计算
- 边缘设备推理——shortcut 需要保存激活，显存压力大；MobileNet 的 depthwise separable conv 更合适
- 任务的输入和输出 shape 完全不同（如 image-to-text）——残差需要 input 和 output 在同一空间

## 历史小故事（可跳过）

- **2012 年**：Krizhevsky 用 AlexNet（**8 层**）拿 ImageNet 冠军，深度学习破圈。
- **2014 年**：Simonyan 用 VGG（**19 层**）证明窄而深好，但作者主动放弃 24 层 VGG——训不动。同年 Szegedy 用 GoogLeNet（**22 层** + Inception module）绕路。
- **2015 年初**：Ioffe 发明 BatchNorm，缓解梯度消失，社区以为深度问题已解决——直到何凯明实验发现 56 层仍比 20 层差。
- **2015 年底**：何凯明团队提出 ResNet，**152 层** ImageNet 冠军。论文 arXiv 一周后投 CVPR 2016，拿最佳论文奖。
- **2017 年**：Vaswani 把残差思想搬到 NLP——Transformer 每个 block 都是 `x = x + Sublayer(x)`。从此 [[bert]] / [[gpt-3]] / [[clip]] / [[vit]] 全部继承 ResNet 骨架。
- **2024 年**：现代所有大模型（LLM / 扩散模型 / state-space model）每一层都有 `+ x`。10 年过去，ResNet 的核心 idea 不仅没过时，反而成了**深度学习的唯一架构原语**。

## 学到什么

1. **优化友好的参数化 > 表达能力大的参数化**——plain 网络和 ResNet 的函数族其实一样，差别只在"优化器找不找得到好解"。这个洞察在所有大模型工程里反复出现：LayerNorm 位置、初始化方法、warmup，全是"让 SGD 走得动"的工程，不是"让网络更强"的结构。

2. **学差量比学完整值容易**——把"identity 设成默认，让网络只学增量"是优雅的工程哲学。可以迁移到其他场景：时间序列预测可以学差分而不是绝对值，文本生成可以学 edit operation 而不是从头生成。

3. **判断新架构能不能训深，先看有没有 `+ x`**——一条简单的工程经验。没有残差的深网络，基本堆不上去。

4. **一行代码 vs 十年影响**——`out += identity` 一行 Python，重塑了之后所有大模型。最强的 idea 往往是最简单的。

## 延伸阅读

- 论文 PDF：[He et al. 2015 arXiv](https://arxiv.org/abs/1512.03385)（密度高但可读，强烈推荐第 4 节实验）
- 视频教程：[Yannic Kilcher — ResNet 论文逐段讲解](https://www.youtube.com/watch?v=GWt6Fu05voI)
- 自己实现：[动手学深度学习 — 现代卷积神经网络章节](https://zh.d2l.ai/chapter_convolutional-modern/resnet.html)（用 PyTorch 一步步搭 ResNet-18）
- [[attention]] —— Transformer 把残差思想搬到 NLP
- [[vit]] —— Vision Transformer 抛弃 CNN，但内部仍是残差

## 关联

- [[attention]] —— Transformer 每个 block 是 `x = x + Sublayer(LayerNorm(x))`，残差骨架直接来自 ResNet
- [[bert]] —— 12-24 层 transformer，每层都有两次 `+ x`
- [[gpt-3]] —— 96 层 transformer × 175B 参数，所有层都是残差结构
- [[clip]] —— 视觉编码器用 ResNet-50 / ResNet-101 backbone
- [[vit]] —— 用 Transformer 替代 CNN，但残差仍在
- [[ddpm]] —— 扩散模型的 U-Net 内部用残差块

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[align-2021]] —— ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声
- [[attention]] —— Attention Is All You Need
- [[batchnorm-2015]] —— Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[dino]] —— DINO 自监督视觉 transformer
- [[dit]] —— DiT — Diffusion Transformer
- [[dropout-2014]] —— Dropout — 训练时随机关掉一半神经元，反而学得更好
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[label-smoothing-2016]] —— Label Smoothing — 别让模型对正确答案过度自信
- [[liu-2020-dlss]] —— DLSS 2.0 — 把 4K 实时渲染的一半工作量交给神经网络
- [[mae]] —— MAE — Masked Autoencoders
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[nbeats-2020]] —— N-BEATS — 纯前馈网络在时序预测上打败统计派
- [[paxos]] —— Paxos — 分布式共识算法
- [[vit]] —— ViT — Vision Transformer

