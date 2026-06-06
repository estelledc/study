---
title: Szegedy 对抗样本 2013 — 一张图片骗过神经网络的开山之作
来源: 'Szegedy et al., "Intriguing Properties of Neural Networks", ICLR 2014'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**对抗样本（Adversarial Example）**是指：给一张图片加上肉眼几乎看不出来的微小噪声，深度神经网络就会把它认错——而且不是随便认错，可以被精准导向任何你想要的错误答案。

类比：这就像给人脸识别摄像头前的门牌上贴一张打印出来的白纸，摄像头突然把"正门"认成"后院仓库"，而旁边的保安完全看不出白纸有什么异常。

Szegedy 等人（Google + NYU，后来有 Goodfellow 参与）在 2013 年底发现这件事，顺带揭开了神经网络的第二个怪异性质：**高层神经元的语义并不存在于单个神经元里，而是存在于整个激活空间**——随机挑几个神经元的线性组合，和单个"最重要神经元"承载的语义是差不多的。这两个反直觉发现合起来就是论文标题「神经网络的有趣性质」。

对抗机器学习作为一个独立研究方向，就是从这篇六七页的 ICLR 2014 论文出发的。此后十年的攻击、防御、鲁棒性训练，都是对这把火的追随。

## 为什么重要

不理解对抗样本，下面这些事情都没法解释：

- 为什么把人脸识别或自动驾驶视觉模型部署到真实世界会有安全顾虑——对抗攻击是一种可以物理打印出来的威胁
- 为什么"模型在测试集上 99% 准确率"不等于"模型可以信任"——高精度和高鲁棒性是两件事
- 为什么黑盒攻击（你连模型权重都不知道）也能成功——本文证明对抗样本可以跨模型、跨训练集迁移
- 为什么对抗训练（把对抗样本混进训练集）会成为防御的基础思路，但同时降低干净样本准确率

## 核心要点

1. **微小扰动 → 任意误分类**：论文用 L-BFGS（一种数学优化算法，类似 GPS 找最短绕路：给定"想骗网络认为这是鸵鸟"的目标，算法计算出一条扰动最小的路径）在扰动幅度尽可能小（人眼不可见）的约束下最大化预测损失，找到扰动向量 r，使 x+r 和 x 肉眼看起来完全一样，但网络输出变成任意目标类别。类比：就像给魔方转了肉眼难以察觉的两度，但魔方程序认定"复原了"。

2. **对抗样本具有跨模型迁移性**：用模型 A 生成的对抗样本，拿去骗用不同超参数训练的模型 B，同样有很大概率成功。更惊人的是——用在 P₁ 子集上训练的模型生成的对抗样本，对用 P₂（不相交子集）训练的模型也有效。这说明对抗脆弱性是深度学习的**系统性盲区**，不是某个模型过拟合的副产品。

3. **激活空间整体承载语义，不是单神经元**：过去的神经网络可视化研究假设"某一个神经元对某一特征负责"；本文实验发现，用激活空间里的随机方向激活出来的图片，和用单个神经元激活出的图片，语义上几乎一样丰富。这让"神经元 = 概念探测器"的假设存疑。类比：乐队的声音不能归功于某一件乐器，整个频谱一起构成音乐。

## 实践案例

### 案例 1：用 L-BFGS 生成对抗样本

```python
import torch
import torch.nn as nn

def lbfgs_attack(model, x, target_label, c=1e-4, max_iter=1000):
    """
    最小化 c*‖δ‖₂² + loss(x+δ, target_label)
    使得 f(x+δ) = target_label（目标分类错误）

    箱型约束（box constraint）：每个像素值必须保持在 [0,1] 范围内，
    防止生成像素值为负数或超过 255 的"不合法图片"。
    """
    x_adv = x.clone().requires_grad_(True)
    optimizer = torch.optim.LBFGS([x_adv], max_iter=max_iter)
    x_orig = x.detach()  # 记录原始图片，不参与梯度计算

    def closure():
        optimizer.zero_grad()
        x_clamped = torch.clamp(x_adv, 0, 1)
        output = model(x_clamped)
        # target 必须是 Long 类型整数，CrossEntropyLoss 要求
        target = torch.tensor([target_label], dtype=torch.long)
        loss_adv = nn.CrossEntropyLoss()(output, target)
        loss_dist = c * torch.norm(x_clamped - x_orig) ** 2
        loss = loss_adv + loss_dist
        loss.backward()
        return loss

    optimizer.step(closure)
    return torch.clamp(x_adv, 0, 1).detach()
```

**逐部分解释**：

- `c * ‖δ‖₂²` 是扰动大小惩罚，让噪声尽量小（‖δ‖₂ 就是扰动向量的欧氏长度）
- `CrossEntropyLoss(output, target)` 把模型往 `target_label` 推，形成误分类
- `torch.clamp(0,1)` 保证像素值始终合法——这就是"箱型约束"
- `dtype=torch.long` 是 PyTorch 要求：标签必须是整数类型，否则运行报错
- 返回的 `x_adv` 在人眼看与 `x` 几乎相同，但被分类成 `target_label`

### 案例 2：验证跨模型迁移性

FGSM（快速梯度符号法）是一种比 L-BFGS 更快的攻击方式，一行就能实现：扰动 = ε × sign(对损失的梯度)，即"沿着让模型出错最快的方向走一步"。

```python
def fgsm_attack(model, x, y, epsilon):
    """FGSM：沿梯度符号方向加扰动，1 步生成对抗样本"""
    x_adv = x.clone().requires_grad_(True)
    loss = nn.CrossEntropyLoss()(model(x_adv), y)
    loss.backward()
    return torch.clamp(x_adv + epsilon * x_adv.grad.sign(), 0, 1).detach()

def cross_model_transfer(model_a, model_b, test_loader, epsilon=0.1):
    """
    用 model_a 生成对抗样本，测试 model_b 的错误率
    """
    transfer_errors = 0
    total = 0

    for x, y in test_loader:
        # 用 model_a 生成对抗样本
        x_adv = fgsm_attack(model_a, x, y, epsilon)

        # 喂给 model_b 看成功率
        with torch.no_grad():
            pred_b = model_b(x_adv).argmax(dim=1)
        transfer_errors += (pred_b != y).sum().item()
        total += len(y)

    return transfer_errors / total  # 迁移攻击成功率

# 论文实验：FC100-100-10 生成的样本，在 FC200-200-10 上约有 20% 错误率
# 而相同幅度的高斯噪声只造成 0% 错误率
```

**逐部分解释**：

- `fgsm_attack` 是用 model_a 生成扰动；换 model_b 生成后打 model_a 同样有效——这就是迁移性
- 关键指标是：对抗噪声 vs 等幅随机噪声，攻击成功率差几个数量级
- 迁移率越高，说明对抗脆弱性是跨模型的系统性特征

### 案例 3：对抗训练降低测试误差

```python
def adversarial_training_step(model, optimizer, x, y, attack_fn):
    """
    每个 batch：一半干净样本 + 一半对抗样本混合训练
    """
    # 生成对抗样本：attack_fn 内部需要计算梯度，所以不能放在 no_grad 里
    # attack_fn 结束后返回 .detach() 的 Tensor，切断与计算图的联系
    x_adv = attack_fn(model, x, y)  # 例如 fgsm_attack，内部自带 detach()

    # 混合训练
    x_mixed = torch.cat([x, x_adv], dim=0)
    y_mixed = torch.cat([y, y], dim=0)

    optimizer.zero_grad()
    output = model(x_mixed)
    loss = nn.CrossEntropyLoss()(output, y_mixed)
    loss.backward()
    optimizer.step()
    return loss.item()

# 论文结果（MNIST）：
# 普通训练 + weight decay → 1.6% 测试误差
# 对抗训练（本文方法） → 1.2% 测试误差
# 说明对抗样本作为数据增强有实际正则化价值
```

## 踩过的坑

1. **L2 和 L∞ 范数不分**：Szegedy 用 L2-BFGS，后来的 FGSM 和 PGD 用 L∞。两种范数下扰动球的形状不同，攻击难度和防御方法差别很大，混着讨论会让实验无法复现。

2. **用梯度掩码当防御**：有些"防御"通过让梯度变成 NaN 或接近零来阻止基于梯度的攻击——但这对 adaptive attacker（知道你在掩码）完全无效；评估防御必须包含对应的 adaptive attack，否则只是在骗自己。

3. **以为对抗训练不降干净精度**：对抗训练通常会在干净测试集上损失几个百分点（鲁棒-精度权衡，robust-accuracy tradeoff），直接拿干净精度评估"防御效果"是错的——要同时报干净精度和对抗精度。

4. **单模型验证安全性**：本文最核心的发现是对抗样本可跨模型迁移。只在部署模型上验证没有对抗样本，黑盒攻击者可以用代理模型（surrogate model）生成对抗样本后直接打你——迁移性让黑盒威胁真实存在。

## 适用 vs 不适用场景

**适用**：

- 安全敏感场景（自动驾驶视觉、人脸识别门禁、医疗影像辅助诊断）需要评估对抗鲁棒性
- 研究神经网络内部表示：对抗样本是探测模型盲区的工具
- 数据增强：把对抗样本混入训练集可以提升模型泛化能力（类似 dropout 的正则效果）
- 迁移学习安全性评估：预训练模型的对抗脆弱性可能被继承到下游任务

**不适用**：

- 低安全要求的离线批处理分析（对抗鲁棒性成本高，不值得全场景引入）
- 对抗训练对计算资源要求 2-10 倍于普通训练，算力受限时不适合
- 非神经网络模型（决策树、线性模型对原始 L-BFGS 对抗样本有天然不同的反应）
- 攻击者没有查询能力的场景（纯物理世界无法构造精确数字扰动的场合）

## 历史小故事（可跳过）

- **2013 年 12 月**：Szegedy、Zaremba、Sutskever、Bruna、Erhan、Goodfellow、Fergus 把预印本挂上 arXiv（1312.6199）。Goodfellow 当时仍在蒙特利尔大学攻读博士，同时与 Google 合作参与该研究，2014 年博士毕业后才全职加入 Google Brain。
- **2013 年除夕前后**：Goodfellow 读到这篇论文，在和朋友喝啤酒的夜晚，几小时内在餐巾纸上推出了快速梯度符号法（FGSM）——将对抗扰动简化为一行公式 `δ = ε·sign(∇ₓ loss)`，隔天写成了 Goodfellow et al. 2014「解释并利用对抗样本」，成为领域第二篇奠基论文。
- **2014 年 ICLR**：本文正式发表。「对抗样本」这个词从此进入机器学习词典。
- **2018 年**：Madry 等人提出 PGD 攻击和 AT 框架，成为此后鲁棒性训练的标准基线。
- **2020 年代**：对抗攻击从图像领域扩展到文本（prompt injection）、语音、代码——本文的核心洞见「梯度方向上的微小扰动可以破坏模型」在大语言模型时代依然成立。

## 学到什么

1. **高精度 ≠ 高鲁棒性**：神经网络在测试集上表现出色，不代表它"理解"了任务，可能只是拟合了训练分布的统计模式，在分布边界极其脆弱
2. **对抗样本是系统性盲区，不是个例**：跨模型、跨训练集的迁移性说明这个问题来自深度学习架构本身，不能靠换个模型或多加数据来消除
3. **攻击即诊断工具**：用对抗样本探测模型的决策边界，是理解"模型到底学到了什么"的一种方法——比单纯看准确率信息量更大
4. **第一性发现往往简单到难以置信**：整篇论文的核心实验是"最小化扰动让网络分错类"，优化方法是 L-BFGS，十几行代码；但这个简单观察改变了整个领域对神经网络安全性的认知

## 延伸阅读

- [Goodfellow et al. 2014 — FGSM 原论文（一行公式的攻击）](https://arxiv.org/abs/1412.6572)
- [Madry et al. 2018 — PGD 攻击与对抗训练框架](https://arxiv.org/abs/1706.06083)
- [Carlini & Wagner 2017 — 目前最强白盒攻击之一](https://arxiv.org/abs/1608.04644)
- [Aleksander Madry 的课程笔记 — 鲁棒深度学习](https://people.csail.mit.edu/madry/lab/)
- [[abadi-dpsgd-2016]] —— 另一个角度的安全：通过差分隐私保护训练数据不被提取

## 关联

- [[abadi-dpsgd-2016]] —— 差分隐私 SGD，安全机器学习的另一翼：防止模型泄露训练数据；与本文共同构成"AI 安全两大经典问题"
- [[dropout-2014]] —— Dropout 作为正则方法可以在一定程度上提升模型对噪声的鲁棒性，但对对抗噪声效果有限
- [[resnet]] —— 更深的网络（ResNet）并不天然更鲁棒，对抗脆弱性在所有架构上都存在
- [[adam-2014]] —— 现代对抗攻击优化通常用 Adam 或 SGD 做内层扰动更新，Szegedy 用的 L-BFGS 在高维下被 FGSM/PGD 的一阶方法替代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[dropout-2014]] —— Dropout — 训练时随机关掉一半神经元，反而学得更好
- [[resnet]] —— ResNet — 残差连接

