---
title: Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
来源: 'Ioffe & Szegedy, "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift", ICML 2015'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 入门
provenance: pipeline-v3
---

## 是什么

Batch Normalization（**BN**）是一招**插在每个全连接/卷积层后面**的小操作：把这一批样本流经这一层的输出，**强制减去这一批的均值、除以这一批的标准差**，让每个特征通道的分布大致变成"0 均值、1 方差"。然后再乘上一个可学习的缩放 γ、加上一个可学习的偏移 β——把"规整化"和"模型自由表达"两件事同时满足。

日常类比：每次开会前，主持人**强制把所有发言人的音量调到同一个基准**，再让他们按需要自己加大或减小——这样下游同事不用每次都重新校准耳朵。

就这一行代码（PyTorch `nn.BatchNorm2d(channels)`），让 2015 年的 Inception 在 ImageNet 上**训练步数压到原来的 1/14**，同时精度不降反升。从此深度网络的"层数"才真正能往 50、100、152 堆。

## 为什么重要

不理解 BN，下面这些事都解释不通：

- 为什么 2015 年之后**几乎每个 CNN 论文**都在 conv 后面接 BN——它不是可选项，是默认必备
- 为什么 ResNet（同年 12 月发布）能把网络从 22 层堆到 152 层而不爆炸——BN 把每层输出的尺度锁住，梯度才不会随深度指数放大或消失
- 为什么 Transformer 时代换成 **LayerNorm**——BN 依赖 batch 维度统计量，序列任务 batch 小 + 长度变化大，统计不准；但 LayerNorm 的"沿特征维归一化"思想完全继承自 BN
- 为什么 GroupNorm / InstanceNorm / WeightNorm / RMSNorm 全是它的变体——这一类"先归一化再仿射"的设计模式，是 BN 一篇论文奠定的

## 核心要点

BN 的训练-推理两阶段不一样，这是它最容易踩坑的地方：

1. **训练时**：对当前 mini-batch 的每个特征通道，分别算这批样本在该通道的均值 μ_B 和方差 σ²_B，然后做 `x̂ = (x − μ_B) / √(σ²_B + ε)`。再乘 γ 加 β 输出 `y = γ·x̂ + β`。γ 和 β 是和该通道绑定的**两个可学习参数**。
2. **推理时**：不再用当前 batch 算统计量（推理可能只来一个样本，没法算）。改用训练全程**滑动平均**累积下来的"全局 μ 和 σ²"做归一化。这一步很关键——切到 `model.eval()` 时框架自动切换。

为什么这招管用？论文给了**三个互补视角**：

1. **缓解内部协变量偏移（Internal Covariate Shift, ICS）**：作者原始解释是"训练过程中每层输入分布一直在变，下层得不停适应新分布"。BN 把每层输入分布锁住，下层不用再追。这个解释**后被 Santurkar 等 2018 反驳**——真正起作用的不是 ICS，而是损失曲面被 BN 光滑化了，梯度方向更可预测，所以能用大学习率。
2. **允许大学习率**：归一化后激活值尺度被锁定，权重稍大也不会让某层炸到天上去。论文里把学习率从 0.0015 提到 0.045（30 倍）依然稳定。
3. **正则化效果**：每个样本被归一化时用的均值/方差**取决于同 batch 里其他样本**，这引入了一种"邻居噪声"，效果类似一个弱版 dropout。论文里证明 BN 加上去后可以**降低甚至去掉 dropout 的用量**。

## 实践案例

### 案例 1：30 行 PyTorch 看懂 BN 训练流程

```python
import torch

def batchnorm_train(x, gamma, beta, running_mean, running_var, momentum=0.1, eps=1e-5):
    # x: (N, C, H, W)，C 个通道独立归一化
    mean = x.mean(dim=(0, 2, 3), keepdim=True)
    var  = x.var (dim=(0, 2, 3), keepdim=True, unbiased=False)
    x_hat = (x - mean) / torch.sqrt(var + eps)
    out = gamma.view(1, -1, 1, 1) * x_hat + beta.view(1, -1, 1, 1)
    # 维护推理用的滑动平均
    running_mean.mul_(1 - momentum).add_(momentum * mean.squeeze())
    running_var .mul_(1 - momentum).add_(momentum * var .squeeze())
    return out
```

关键点：均值和方差是**沿 N、H、W 三个维度**算的，每个通道 C 独立。所以 BN 的可学习参数量只和通道数有关，和 H/W 无关。

### 案例 2：在 CNN 里插 BN

```python
import torch.nn as nn

class ConvBlock(nn.Module):
    def __init__(self, in_c, out_c):
        super().__init__()
        self.conv = nn.Conv2d(in_c, out_c, kernel_size=3, padding=1, bias=False)
        self.bn   = nn.BatchNorm2d(out_c)   # 紧跟 conv，吃掉 conv 的 bias
        self.act  = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.act(self.bn(self.conv(x)))
```

注意 `bias=False`——BN 自带的 β 已经起到加偏置的作用，再加一个 conv bias 就是冗余参数。这是工业默认搭配。

切训练和推理：`model.train()` 时 BN 用当前 batch 统计量并更新滑动平均；`model.eval()` 切到用滑动平均做归一化。**忘切，验证集精度会带 batch 大小波动**，是新人头号大坑。

### 案例 3：超参数和工程经验

- **batch size 不要太小**：BN 依赖 batch 内统计量，batch < 16 时方差估计噪声大，效果掉。检测/分割任务经常 batch=2，所以那个领域才生出 GroupNorm。
- **momentum 默认 0.1**（PyTorch）：滑动平均的更新速率，别动
- **eps 默认 1e-5**：防除零，几乎不用调
- **conv → BN → ReLU** 的经典顺序源自论文；后来 ResNet v2 改成 **BN → ReLU → conv** 的"pre-activation"，残差更顺
- 训练步数大约能砍到 **1/5 ~ 1/14**（论文里 Inception 跑到 BN 版本的 14 倍快，且精度更好）

## 踩过的坑

1. **小 batch 时 BN 崩掉**：医学影像分割经常 batch=1~2，BN 算出的方差是单样本噪声，训练发散。换 GroupNorm（按通道分组归一化，与 batch 无关）或 SyncBN（多卡之间汇总统计量）。
2. **分布式训练默认每卡独立算 BN**：8 卡每卡 batch=4 → 实际等价 batch=4 而非 32。要用 **SyncBN** 把统计量跨卡 all-reduce，否则大 batch 等于白费。
3. **BN + Dropout 同用 variance shift**（Li et al. 2018）：BN 训练时方差里包含了 dropout 噪声，推理时 dropout 关掉方差变小，统计量算偏。常见做法是把 dropout 放在所有 BN 之后，或最后一个 FC 之前才用一次。
4. **fine-tune 时 BN 的滑动统计漂移**：直接 fine-tune 会让 running_mean / running_var 被新数据带跑偏，**老任务精度反而掉**。常见做法：fine-tune 时**冻结 BN 的统计量**（`model.eval()` 部分子模块），只让 γ、β 参与训练。
5. **TensorFlow 的 BN 默认推理时还在更新 moving average**：1.x 时代经典坑，要手动把 update_ops 加到 train_op 里才能保证 moving average 真的更新。PyTorch 这事自动。

## 适用 vs 不适用场景

**适用**：

- 图像 CNN（分类、检测、分割）几乎全部默认 BN——这是它的主战场
- batch size 中等到大（≥ 16）
- 训练数据相对参数量充足、关注训练速度
- ResNet / Inception / DenseNet 等经典骨干网

**不适用**：

- 序列任务（NLP、语音）→ batch 内长度不一、统计不稳 → 用 **LayerNorm**
- 小 batch 任务（高分辨率分割、3D 医疗）→ 用 **GroupNorm** 或 SyncBN
- 风格迁移 / 生成模型里希望逐样本独立 → 用 **InstanceNorm**
- 在线学习 / 强化学习里 batch 概念模糊 → 用 LayerNorm 或 WeightNorm
- 需要严格确定性的小模型推理 → BN 滑动统计虽然固定，但精度更敏感

## 历史小故事（可跳过）

- **2015 年 2 月**：Sergey Ioffe 和 Christian Szegedy（Inception 作者）在 arXiv 挂出 BN 论文。他们做 Inception v2 时遇到训练不稳，BN 是边做边发现的工程产物。
- **2015 年 12 月**：何凯明的 ResNet 出炉，每个残差块里都有 BN。152 层网络能训，BN 是必要条件之一。
- **2016 年**：LayerNorm（Ba, Kiros, Hinton）出来，明确说"BN 在 RNN 上不灵，因为 batch 维不稳定"，把归一化的方向从"沿 batch"改到"沿特征"。Transformer（2017）直接用 LayerNorm。
- **2018 年**：Santurkar 等 "How Does Batch Normalization Help Optimization?" 用实验+理论证明：**BN 真正的价值不是减少 ICS，而是把损失曲面变光滑、让梯度方向更可信**。原作者的解释被科学界温和地推翻——但 BN 该用还是照用。
- **2018 年**：吴育昕、何凯明的 GroupNorm 把通道分组归一化，彻底摆脱 batch 维依赖。

BN 是少有的**先工程上爆杀全场，再被理论慢慢看懂**的例子——和 Adam 同款剧情。

## 学到什么

1. **归一化是深网训练的"管道压力调节阀"**：每层输入尺度锁死，梯度信号才能稳定流过 100+ 层
2. **可学习的 γ、β 是关键**：单纯归一化会限制表达力，加这两个参数让模型自己决定要不要"取消"归一化（γ=σ, β=μ 时等于不动）
3. **训练/推理两套行为是 BN 设计的代价**：必须维护滑动平均，必须切 train/eval；后来 LayerNorm/WeightNorm 都在试图绕开这个代价
4. **正则化可以是"统计量噪声"的副产品**：BN 没设计成正则项，但因为 batch 内邻居影响每个样本的归一化，它自然就有了一点 dropout 的效果
5. **理论解释可以错，但工程结果不会撒谎**：ICS 解释虽被推翻，BN 的地位没动摇——这是好工程的金标准

## 延伸阅读

- 论文 PDF：[Ioffe & Szegedy 2015](https://arxiv.org/abs/1502.03167)（11 页，前 6 页够用）
- 反驳原解释：[Santurkar et al. 2018 — How Does Batch Normalization Help Optimization?](https://arxiv.org/abs/1805.11604)
- 后裔家族：[LayerNorm (Ba 2016)](https://arxiv.org/abs/1607.06450)、[GroupNorm (Wu & He 2018)](https://arxiv.org/abs/1803.08494)、[WeightNorm (Salimans & Kingma 2016)](https://arxiv.org/abs/1602.07868)
- BN+Dropout 互坑：[Li et al. 2018 — Understanding the Disharmony](https://arxiv.org/abs/1801.05134)
- [[resnet]] —— 同年 12 月的 ResNet 是 BN 的最大受益者
- [[dropout-2014]] —— 同为正则化思路，BN 出来后部分场景能替代 dropout

## 关联

- [[resnet]] —— 152 层网络能训，BN 把每层尺度锁住是必要条件
- [[dropout-2014]] —— 另一种正则化，BN 引入隐式正则后部分替代了它
- [[adam-2014]] —— 同期训练革命：Adam 管自适应步长，BN 管激活分布
- [[attention]] —— Transformer 把 BN 换成 LayerNorm，但"先归一化再仿射"的范式来自 BN
- [[cudnn-2014]] —— BN 的反向传播对内存访问敏感，cuDNN 的融合实现把 BN 性能拉到能落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[attention]] —— Attention Is All You Need
- [[cudnn-2014]] —— cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速
- [[dropout-2014]] —— Dropout — 训练时随机关掉一半神经元，反而学得更好
- [[goodfellow-fgsm-2014]] —— FGSM — 对抗样本的快速生成与线性假设
- [[label-smoothing-2016]] —— Label Smoothing — 别让模型对正确答案过度自信
- [[layernorm-2016]] —— Layer Normalization — 把归一化方向从 batch 转到 feature，让 RNN/Transformer 也能稳定训
- [[mixup-2018]] —— mixup — 把两张图按比例叠成一张，标签也一起叠
- [[resnet]] —— ResNet — 残差连接

