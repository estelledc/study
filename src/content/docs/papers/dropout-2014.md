---
title: Dropout — 训练时随机关掉一半神经元，反而学得更好
来源: 'Srivastava, Hinton, Krizhevsky, Sutskever, Salakhutdinov, "Dropout: A Simple Way to Prevent Neural Networks from Overfitting", JMLR 2014'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 入门
provenance: pipeline-v3
---

## 是什么

Dropout 是一招**训练神经网络时的"故意捣乱"**：每次喂数据进网络，都**随机把一半隐藏单元的输出强制置 0**，让它们当这一步不存在。日常类比：上课老师每次随机点名抽走半个班的笔记，剩下的人必须自己能完整复述——逼每个学生都不能只指望"反正同桌会记"。

测试（推理）时，所有神经元都**正常工作**，但权重乘上 0.5 做一次缩放，保持总输出量级和训练时一致。

就这么一行代码（PyTorch 里 `nn.Dropout(0.5)`），把 2012 年的 AlexNet 在 ImageNet 上的错误率往下压了一大截，让深度网络第一次能正经训到很深而不是一训就过拟合。

## 为什么重要

不理解 Dropout，下面这些事都解释不通：

- 为什么 2012~2017 年几乎每个 CNN 论文里都有一句"applied dropout with p=0.5"
- 为什么后来的 **Stochastic Depth**（随机扔掉整个残差层）、**DropPath**（NAS 里用）、**DropBlock**（扔一片像素）都自称是 dropout 的后裔
- 为什么 Transformer 时代 BatchNorm 让位给 LayerNorm，但 dropout **没退场**——attention dropout / residual dropout 还在每个 block 里
- 为什么 Hinton 把它类比"有性生殖"——这不是炫学，背后是**反 co-adaptation** 的核心思想

## 核心要点

Dropout 的训练-推理两阶段：

1. **训练时**：对每个隐藏单元，独立掷一枚硬币（伯努利分布），概率 p 抹零、概率 1-p 保留。每个 mini-batch 抹的位置都不一样。
2. **推理时**：所有单元都开，但权重乘 (1-p)。直觉：训练时平均只有一半神经元在工作，推理时全开会让信号翻倍，要等比例缩回来。

工程上通常用 **inverted dropout**：训练时**保留的单元除以 (1-p)** 提前补偿，推理代码就不用动了。PyTorch、TensorFlow、JAX 都是这种实现。

为什么这招管用？论文给了**两个互补视角**：

1. **集成视角**：n 个隐藏单元，每次 drop 出来的"子网络"是 2^n 个里的一个。这些子网络**共享权重**，训练相当于同时训练指数多个网络，推理是它们的几何平均。这是 bagging（Breiman 1996）的廉价近似。
2. **反 co-adaptation 视角**：单个神经元不能再"依赖某个固定搭档"，必须自己也能扛事。Hinton 类比有性生殖——基因每代被随机打散重组，所以每个基因单独有用，不能寄生在固定组合里。

## 实践案例

### 案例 1：30 行 PyTorch 看懂 inverted dropout

```python
import torch

def dropout(x, p=0.5, training=True):
    if not training or p == 0:
        return x
    # 训练时：以概率 1-p 保留，保留的提前除以 (1-p) 补偿
    mask = (torch.rand_like(x) > p).float() / (1 - p)
    return x * mask

# 训练
x = torch.randn(4, 8)
y = dropout(x, p=0.5, training=True)  # 大约一半位置变 0，其余 ×2
# 推理
y = dropout(x, p=0.5, training=False) # 原样返回
```

关键点：mask 是**逐元素**伯努利采样，不是按行/按列。每个 forward pass 都重新采。

### 案例 2：在 MLP 里加 Dropout

```python
import torch.nn as nn

class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 1024)
        self.drop1 = nn.Dropout(0.5)   # 隐藏层 p=0.5
        self.fc2 = nn.Linear(1024, 1024)
        self.drop2 = nn.Dropout(0.5)
        self.fc3 = nn.Linear(1024, 10)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = self.drop1(x)              # 训练时随机抹零
        x = torch.relu(self.fc2(x))
        x = self.drop2(x)
        return self.fc3(x)

# 训练循环里 model.train()，dropout 生效
# 验证/推理 model.eval()，dropout 自动关闭
```

注意 `model.train()` / `model.eval()` 的切换——忘了切，验证集结果会**带噪声**且偏低。这是新人常踩的坑。

### 案例 3：超参数怎么选

论文给的经验值（也是后来工业界的默认）：

- 隐藏层：**p = 0.5**（抹一半）几乎总是接近最优
- 输入层：**p = 0.1 ~ 0.2**（抹太多损失信息）
- 配 **max-norm 约束**（权重 2 范数 ≤ c）+ 大学习率 + momentum，效果最好
- 训练时间约**变 2~3 倍**——梯度噪声大，需要更多步才能收敛

## 踩过的坑

1. **忘记 `model.eval()`**：验证集 / 推理时 dropout 还开着，结果每次跑不一样、且系统性偏低。PyTorch 用 `model.eval()` 一键切走 dropout 和 BN 的训练模式。

2. **Dropout + BatchNorm 同用 variance shift**（Li et al. 2018）：BN 在训练时算出的 batch 方差，是包含了 dropout 噪声的；推理时 dropout 关了，方差变小，BN 用旧统计量会算偏。常见做法：把 dropout 放在最后一个 BN **之后**，或在最后一个全连接前才用，或者换 LayerNorm。

3. **RNN 隐状态加普通 dropout 会"擦掉"记忆**：每个时间步独立采样 mask，长序列的隐藏状态被反复抹零，模型记不住东西。Gal & Ghahramani 2016 的 **variational dropout** 让同一序列里 mask **共享**，这才能在 LSTM 上稳。

4. **Dropout p 不是越大越好**：p=0.8 把信号几乎全抹了，模型欠拟合。论文里 p=0.5 是甜区，工业界常见 0.1~0.5。

5. **小数据集 + 大网络更需要它**；如果数据量已经远大于参数量（如现代 LLM 预训练），dropout 收益会变小，但**不会归零**——Transformer 里依然每个 block 都加。

## 适用 vs 不适用场景

**适用**：

- 全连接层（FC）和卷积层后接的 FC（最经典战场）
- Transformer 的 attention 输出、FFN 输出、residual 之后（默认 p=0.1）
- 训练数据相对参数量偏少、容易过拟合的场景
- 想低成本得到"集成"效果，又不想训 N 个模型

**不适用**：

- RNN 隐藏状态间的连接 → 用 variational dropout 或 zoneout
- 已有强 BN + 强数据增强 + 海量数据的 CNN → 增益小，可省
- 需要严格确定性输出的推理（自动驾驶安全验证等） → 必须 `eval()`

## 历史小故事（可跳过）

- **2012 年 7 月**：Hinton 把 dropout 的雏形挂上 arXiv（标题"Improving neural networks by preventing co-adaptation of feature detectors"），同年 9 月 AlexNet 在 ImageNet 上炸场，论文里就有 dropout。
- **2014 年**：博士生 Srivastava 把它扩展成完整 JMLR 论文，加了集成视角的数学解释、和 bagging / 高斯噪声 / 贝叶斯神经网络的关系。
- **2016 年**：Huang 等提出 **Stochastic Depth**——直接 drop 掉整个残差块，是 dropout 在 ResNet 时代的进化版，也是 NAS 里 DropPath 的基础。
- **2018 年**：Ghiasi 提出 **DropBlock**——抹掉一整片连续区域而非散点，更适合 CNN（散点抹零容易被卷积"插值修复"）。

dropout 不是 Hinton 凭空想的，他承认灵感来自 Bishop 1995 的"训练时给输入加噪声等价于 L2 正则"和有性生殖的进化生物学。

## 学到什么

1. **正则化不一定要写成损失函数里的惩罚项**——也可以是"训练过程的噪声"。Dropout 等价于在隐藏层加伯努利乘性噪声。
2. **集成（ensemble）和 bagging 思想可以"内化"到一个模型里**——通过权重共享 + 随机子结构，免去训 N 个模型的代价。
3. **简单的训练 trick 可以救一个时代**：就 5 行代码，让深度网络从"一训就过拟合的玩具"变成工业可用。
4. **类比能打开新设计空间**：Hinton 从有性生殖推到反 co-adaptation，又从反 co-adaptation 推到 dropout——后续 stochastic depth、DropPath、DropBlock 都是顺着"随机扔掉某个结构单位"这条主线走的。

## 延伸阅读

- 论文 PDF：[Srivastava et al. 2014 (JMLR)](https://jmlr.org/papers/v15/srivastava14a.html)（30 页，前 10 页够用）
- 早期版：[Hinton et al. arXiv:1207.0580 (2012)](https://arxiv.org/abs/1207.0580)（更短，思想已经全了）
- 后续：[Stochastic Depth (Huang 2016)](https://arxiv.org/abs/1603.09382)、[DropBlock (Ghiasi 2018)](https://arxiv.org/abs/1810.12890)
- BN+Dropout 互坑：[Li et al. 2018 — Understanding the Disharmony](https://arxiv.org/abs/1801.05134)
- [[adam-2014]] —— 同年的优化器革命，常和 dropout 一起出现在论文标配
- [[resnet]] —— 残差网络让超深成为可能，stochastic depth 把 dropout 的思想搬上来

## 关联

- [[adam-2014]] —— 2014 年同框的训练革命（一个管优化、一个管正则）
- [[adamw-2017]] —— 把 weight decay 从 Adam 里解耦，dropout 也是一种"非损失项"正则
- [[resnet]] —— 残差结构让深度成为可能，dropout 的后裔 stochastic depth 直接 drop 整层
- [[cook-1986-stochastic-sampling]] —— "用随机采样近似积分"的同源思想，dropout 也是用随机近似指数级集成

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[adamw-2017]] —— AdamW — 把 weight decay 从梯度里拆出来
- [[batchnorm-2015]] —— Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
- [[cook-1986-stochastic-sampling]] —— Cook 1986 — 用噪声换掉锯齿
- [[goodfellow-fgsm-2014]] —— FGSM — 对抗样本的快速生成与线性假设
- [[label-smoothing-2016]] —— Label Smoothing — 别让模型对正确答案过度自信
- [[resnet]] —— ResNet — 残差连接
- [[szegedy-adversarial-2013]] —— Szegedy 对抗样本 2013 — 一张图片骗过神经网络的开山之作

