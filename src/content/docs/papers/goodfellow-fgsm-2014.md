---
title: FGSM — 用一行梯度让神经网络看错图片
来源: 'Goodfellow, Shlens & Szegedy. "Explaining and Harnessing Adversarial Examples". ICLR 2015'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**FGSM（Fast Gradient Sign Method）**是一种让神经网络"被一行公式骗过去"的攻击算法。日常类比：把一张熊猫照片加上一层肉眼看不见的"噪声滤镜"——噪声值不超过 8/255 像素精度——模型就以 99% 置信度把它认成长臂猿。

这篇论文同时给出了一个惊人的解释：对抗样本存在的根本原因**不是**神经网络太复杂、太非线性，而恰恰是它们**太线性**。

核心公式只有一行：

```python
# x: 原始输入  J: 损失函数  ε: 扰动幅度（如 0.01）
x_adv = x + ε * sign(∇_x J(θ, x, y))
```

高维空间里，扰动向量 η 每一维都很小（ε），但有 n 维同时沿梯度方向叠加，总体偏移量可以达到 εmn——足够让模型的输出翻天覆地。

## 为什么重要

不理解 FGSM 和对抗样本，下面这些事都没法解释：

- 为什么在 ImageNet 上达到 95% 准确率的模型，对一张加了噪声的停车标志仍然 100% 识别错误——自动驾驶安全的核心威胁
- 为什么"在更多数据上训练"或"加 dropout"并不能修复对抗脆弱性——正则化手段治不了线性问题
- 为什么攻击一个模型生成的对抗样本，能以 54.6% 的概率骗过另一个完全不同架构的模型——transferability 使黑盒攻击成立
- 为什么 2017 年之后的 AI 安全研究几乎都以这篇论文为起点

## 核心要点

**1. 线性假设——对抗样本的根因**

8 位图像的精度是 1/255，比这更小的扰动人眼察觉不到。但模型对输入做的是高维点积：w⊤x。当输入维度 n 很大时，即便每维扰动 η 都极小，累计效果 w⊤η 可以极大。这就是"一点一点叠、叠出大变化"——不是深度网络独有的问题，浅层 softmax 回归也受到同等威胁。

**2. FGSM 算法——梯度符号乘以 ε**

沿损失函数对输入的梯度方向走一步，步长由 ε 控制：

```python
import torch

def fgsm_attack(model, loss_fn, x, y, epsilon=0.03):
    x.requires_grad_(True)
    output = model(x)
    loss = loss_fn(output, y)
    model.zero_grad()
    loss.backward()
    # 关键：只取梯度的符号，不取大小
    x_adv = x + epsilon * x.grad.sign()
    return x_adv.detach().clamp(0, 1)
```

这比当时 Szegedy 用的 L-BFGS 方法快几个数量级——反向传播一次即可，使得大规模对抗训练成为可能。

**3. 对抗训练——把攻击者变成正则化器**

将对抗样本混入训练集，用混合损失同时优化两个目标：

```python
# α=0.5：对抗样本和干净样本各占一半
J_combined = α * J(θ, x, y) + (1-α) * J(θ, x_adv, y)
```

实验结果：MNIST maxout 网络测试错误率从 0.94% 降至 0.84%，同时在对抗样本上的错误率从 89.4% 降至 17.9%。这也是后来 Madry PGD 对抗训练的直接前身。

## 实践案例

### 案例 1：快速评测模型鲁棒性

在正式部署前，用 FGSM 做压力测试：

```python
from torchvision import models, transforms
import torch.nn.functional as F

model = models.resnet50(pretrained=True).eval()
loss_fn = F.cross_entropy

# 对一批验证集图片做 FGSM 攻击
correct_clean, correct_adv = 0, 0
for x, y in val_loader:
    # 干净样本准确率
    pred_clean = model(x).argmax(1)
    correct_clean += (pred_clean == y).sum().item()
    
    # FGSM 对抗样本准确率
    x_adv = fgsm_attack(model, loss_fn, x.clone(), y, epsilon=0.03)
    pred_adv = model(x_adv).argmax(1)
    correct_adv += (pred_adv == y).sum().item()

print(f"干净准确率: {correct_clean/len(val_loader.dataset):.1%}")
print(f"FGSM准确率: {correct_adv/len(val_loader.dataset):.1%}")
# 如果两者差超过 30%，说明模型鲁棒性严重不足
```

典型结果：一个在 ImageNet 准确率 76% 的 ResNet50，在 ε=8/255 的 FGSM 攻击下会跌至 10% 以下。

### 案例 2：对抗训练提升鲁棒性

在训练循环中加入 FGSM，构建更鲁棒的分类器：

```python
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

for epoch in range(num_epochs):
    for x, y in train_loader:
        # 生成对抗样本（注意：不要在 no_grad 上下文里做）
        x_adv = fgsm_attack(model, F.cross_entropy, x.clone(), y, epsilon=0.03)
        
        # 混合损失：干净样本 + 对抗样本各半
        loss_clean = F.cross_entropy(model(x), y)
        loss_adv = F.cross_entropy(model(x_adv), y)
        loss = 0.5 * loss_clean + 0.5 * loss_adv
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

注意：每个 epoch 的对抗样本要重新生成（model 权重在变，对抗方向也在变）。

### 案例 3：用梯度可视化做可解释性分析

FGSM 的梯度方向 sign(∇_x J) 本质上是 saliency map——模型认为"最关键"的像素：

```python
def get_saliency(model, loss_fn, x, y):
    """可视化模型最敏感的输入区域"""
    x = x.unsqueeze(0).requires_grad_(True)
    loss = loss_fn(model(x), torch.tensor([y]))
    loss.backward()
    # 取绝对值：正负方向都是重要的
    saliency = x.grad.abs().squeeze().max(dim=0)[0]
    return saliency

# 对比干净样本和对抗样本的 saliency 差异
saliency_clean = get_saliency(model, F.cross_entropy, img, label)
saliency_adv = get_saliency(model, F.cross_entropy, img_adv, label_adv)
# 如果两者差异大，说明对抗样本激活了完全不同的特征
```

这帮助回答"模型到底在看什么"——论文发现对抗训练后权重更加局部化、可解释。

## 踩过的坑

1. **FGSM 鲁棒性 ≠ 真实鲁棒性**：通过 FGSM 对抗训练防住了 FGSM，但对 PGD（多步迭代版本）往往仍然脆弱。Madry 等人 2017 年证明单步防御的"鲁棒性"其实是梯度掩盖（gradient masking），不是真鲁棒。

2. **ε 的选择没有通用标准**：论文用 ε=0.007（8 位图像最低位），但不同数据集、不同像素归一化方式下合适的 ε 差异极大。直接复用别人的 ε 往往要么攻击不够强，要么扰动太明显。

3. **对抗样本的迁移性被低估**：很多人以为黑盒场景下对抗样本无效。实验显示跨模型迁移率达 54.6%（softmax 预测 maxout 的错误类别）。不能靠"攻击者不知道模型结构"来保证安全。

4. **对抗训练计算成本**：FGSM 对抗训练每步需要额外一次前向+反向传播，训练时间约为标准训练的 2 倍。PGD 对抗训练（k 步迭代）成本是 k+1 倍，大模型上难以承受。

## 适用 vs 不适用场景

**适用**：
- 安全关键系统的鲁棒性基线评测（人脸识别、自动驾驶、医疗影像）
- 对抗训练数据增强，特别是计算资源有限时（单步 FGSM 最轻量）
- 模型可解释性分析的快速工具（saliency map 可视化）
- 研究对抗样本 transferability 和跨模型攻击

**不适用**：
- 作为强安全保证的唯一评测：FGSM 通过 ≠ 鲁棒（需要至少加 PGD 评测）
- 需要视觉不可见扰动的高质量攻击（C&W attack 在质量上远超 FGSM）
- 大规模模型（GPT-4 级别）的对抗训练（计算成本不可接受）
- 文本、图 等非连续输入域（FGSM 依赖输入可微，离散域需要特殊处理）

## 历史小故事（可跳过）

- **2013 年**：Szegedy、Sutskever、Goodfellow 等在 Google Brain 发现 ImageNet 分类器被 L-BFGS 生成的微小扰动欺骗，学界普遍以为这是深度网络的"神秘非线性"引起的。
- **2014 年 12 月**：Goodfellow、Shlens、Szegedy 三人提交 ICLR 2015 论文，用线性假设解释这一现象，并给出 FGSM 算法。论文颠覆了"非线性导致"的假说——浅层 softmax 同样脆弱。
- **2015 年**：论文在 ICLR 2015 发表，随即成为对抗攻防领域引用最多的论文，超过 2 万次引用。
- **2017 年**：Madry 等人在 FGSM 基础上提出 PGD 攻击（多步迭代），建立了至今仍是标准的鲁棒性基准，直接延伸自 Goodfellow 的对抗训练思想。
- **2020 年代**：对抗样本从图像分类扩展到语言模型（prompt injection）、点云（自动驾驶激光雷达）、语音（ASR 攻击），FGSM 的"线性假设"成了理解各类对抗现象的起点。

## 学到什么

1. **线性是双刃剑**：ReLU、LSTM、maxout 都被设计成"足够线性以便优化"——但线性的代价是高维空间里对扰动的天然脆弱
2. **梯度是地图也是武器**：优化器用梯度找参数，攻击者用梯度找扰动；保护模型就是让"攻击者的地图"失真或无效
3. **防御比攻击难得多**：一行代码可以攻击，但真正的鲁棒性需要重新思考训练目标——这个不对称至今没有根本解决方案
4. **简单假设往往更深刻**：把"非线性魔法"替换成"高维线性叠加"，一个简单假设解释了迁移性、多模型一致性等一系列现象

## 延伸阅读

- 论文原文：[arXiv 1412.6572](https://arxiv.org/abs/1412.6572)（6 页，公式密度高但逻辑清晰）
- Madry et al. 2017 PGD 攻击：[arXiv 1706.06083](https://arxiv.org/abs/1706.06083)（FGSM 的多步延伸，当前对抗训练标准）
- Carlini & Wagner Attack 2016：更强的优化型攻击，常用于评测防御真实效果
- [[dropout-2014]] —— 论文中与对抗训练对比的正则化基准
- [[abadi-dpsgd-2016]] —— 差分隐私 SGD，从隐私角度保护训练数据

## 关联

- [[dropout-2014]] —— 对抗训练与 dropout 同时使用能叠加正则化效果；论文直接对比了两者
- [[abadi-dpsgd-2016]] —— 同样关注 ML 安全，但从训练数据隐私角度出发；两者共同构成 ML 安全研究的两大主线
- [[batchnorm-2015]] —— batch norm 改变了激活分布，影响对抗样本的构造和迁移性
- [[resnet]] —— 深层 ResNet 的对抗脆弱性比浅网络更受关注；FGSM 评测在 ResNet 系列上成为标配
- [[attention]] —— Transformer 的注意力机制在对抗样本下表现出与 CNN 不同的脆弱性模式
- [[adam-2014]] —— 对抗训练的优化器选择（SGD vs Adam）显著影响鲁棒性，Madry 等推荐 SGD

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[attention]] —— Attention Is All You Need
- [[batchnorm-2015]] —— Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
- [[dropout-2014]] —— Dropout — 训练时随机关掉一半神经元，反而学得更好
- [[resnet]] —— ResNet — 残差连接

