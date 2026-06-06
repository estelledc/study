---
title: Madry PGD 2017 — 用最强对手训练最强防御
来源: 'Madry, Makelov, Schmidt, Tsipras, Vladu. "Towards Deep Learning Models Resistant to Adversarial Attacks". ICLR 2018'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

PGD 对抗训练是一套**让神经网络学会对抗最坏情况输入**的训练框架。日常类比：想象两个国际象棋玩家，一个专门找你最薄弱的走法施压（攻击者），另一个不断调整布局来封死这些弱点（模型训练）——两人面对同一张棋盘、同一套规则，攻守博弈里产生的压力让你的防守水平远超对着棋书自学。

对抗样本（adversarial examples）是 2013 年发现的奇怪现象：对猫的图片加几十个像素的人眼不可见的微小噪声，模型就把它认成了"鸵鸟"。这个扰动有预算上限——l∞ 范数（简单理解：每个像素最多允许变动 ε 个单位，ε 通常是 8/255，肉眼看不出任何差别）。

Madry 等人把这个攻防关系化成了数学优化题——**鞍点问题（min-max）**：

```
min_θ  E[(x,y)~D][ max_{δ∈S} L(θ, x+δ, y) ]
```

外层 `min` 是模型训练（找最优参数 θ），内层 `max` 是攻击者（在扰动集 S 内找让损失 L 最大的扰动 δ）。FGSM 只走一步梯度，PGD 走多步，每步之后把 δ **投影回** ε-ball 内——因此称为"投影梯度下降"（Projected Gradient Descent）。

这个框架有三个核心洞见：
1. PGD 是所有一阶攻击中最强的（first-order adversary），因为局部极大值的损失值高度集中
2. 对 PGD 鲁棒 → 对几乎所有一阶攻击鲁棒（包括 FGSM 及其变体）
3. 网络容量必须足够大才能学出复杂的鲁棒决策边界

## 为什么重要

不理解 PGD 对抗训练，下面这些事都没法解释：

- 为什么 **RobustBench** 这个对抗鲁棒性排行榜以 PGD 为默认评估标准——它是可证明意义上的最强一阶攻击基准
- 为什么很多声称"能防御对抗攻击"的方法后来被证明只是**梯度掩蔽**（gradient masking），一旦用 PGD 评估就立刻失效
- 为什么鲁棒模型的**标准准确率**往往低于普通模型——鲁棒性与准确率之间存在根本性权衡
- 为什么 TRADES、Free-AT、Fast-AT 这些后续工作都以 Madry 框架为出发点改进效率或权衡

## 核心要点

**1. 鞍点公式：把攻防统一成一个优化问题**

传统 ERM（经验风险最小化）只最小化平均损失，对抗训练把它改成最小化最坏情况损失。内层 max 是攻击，外层 min 是防御，两者共用同一个目标函数——这不是巧合，而是让攻防"讲同一种语言"的设计。

类比：公司安全演练不是模拟普通员工犯错，而是专门模拟最厉害的渗透测试员——只有打败这种对手，才能声称真正安全。

**2. PGD 是最强的一阶对手**

PGD 迭代公式（l∞ 约束）：

```python
x_adv = x_orig.clone()
for _ in range(pgd_steps):
    x_adv.requires_grad_(True)
    loss = criterion(model(x_adv), y)
    loss.backward()
    # 梯度符号方向迈一步
    x_adv = x_adv.detach() + alpha * x_adv.grad.sign()
    # 投影回 l∞ 扰动球
    delta = torch.clamp(x_adv - x_orig, -epsilon, epsilon)
    x_adv = torch.clamp(x_orig + delta, 0, 1)
```

多次随机初始化重启后，局部极大值的损失值呈现**高度集中分布**——这说明 PGD 能可靠找到最强对抗样本，也说明只要对 PGD 鲁棒，就近似对所有一阶攻击鲁棒。

**3. 对抗训练的外层优化**

找到 PGD 对抗样本后，用 Danskin 定理保证：在内层极大值处计算的梯度是外层 min 问题的有效下降方向。因此对抗训练只需把每个 batch 替换成 PGD 样本再做标准 SGD——理论上正确，实践上可行。

## 实践案例

### 案例 1：评估模型的鲁棒性

你有一个已训练的图像分类器，想知道它对白盒 l∞ 攻击的鲁棒性：

```python
import torch
import torchvision.transforms as T
from robustbench.utils import load_model

# 加载 Madry 风格的鲁棒预训练模型作为 baseline
model = load_model('Madry2018', dataset='cifar10', threat_model='Linf')
model.eval()

def pgd_attack(model, x, y, epsilon=8/255, alpha=2/255, steps=20):
    x_adv = x.clone().detach() + torch.zeros_like(x).uniform_(-epsilon, epsilon)
    x_adv = torch.clamp(x_adv, 0, 1)
    for _ in range(steps):
        x_adv.requires_grad_(True)
        out = model(x_adv)
        loss = torch.nn.functional.cross_entropy(out, y)
        loss.backward()
        with torch.no_grad():
            x_adv = x_adv + alpha * x_adv.grad.sign()
            delta = torch.clamp(x_adv - x, -epsilon, epsilon)
            x_adv = torch.clamp(x + delta, 0, 1)
    return x_adv.detach()

# 在测试集上跑 PGD 评估
correct, total = 0, 0
for images, labels in test_loader:
    adv_images = pgd_attack(model, images, labels)
    with torch.no_grad():
        preds = model(adv_images).argmax(dim=1)
    correct += (preds == labels).sum().item()
    total += len(labels)
print(f"PGD-20 鲁棒准确率: {correct/total:.1%}")
```

注意随机初始化（`uniform_(-ε, ε)`）很重要——从自然样本直接出发会低估攻击强度。

### 案例 2：实现最小对抗训练循环

从零实现 Madry 对抗训练，理解核心机制：

```python
def madry_at_step(model, optimizer, x, y, epsilon=8/255, alpha=2/255, pgd_steps=7):
    # Step 1: 生成 PGD 对抗样本（内层 max）
    model.eval()  # 生成对抗样本时不更新 BN 统计
    x_adv = pgd_attack(model, x, y, epsilon, alpha, pgd_steps)
    
    # Step 2: 用对抗样本训练（外层 min）
    model.train()
    optimizer.zero_grad()
    loss = torch.nn.functional.cross_entropy(model(x_adv), y)
    loss.backward()
    optimizer.step()
    return loss.item()

# 训练循环
for epoch in range(num_epochs):
    for x, y in train_loader:
        loss = madry_at_step(model, optimizer, x.cuda(), y.cuda())
```

`pgd_steps=7` 是 CIFAR-10 的常用设置（训练时比评估时步数少，以控制计算成本）。

### 案例 3：用 PGD 发现模型脆弱点

调试一个怀疑存在梯度掩蔽的防御方法：

```python
def diagnose_gradient_masking(model, x, y, epsilon=8/255):
    """
    如果 PGD-1（即 FGSM）准确率 >> PGD-100 准确率，
    说明模型在梯度方向有异常，可能存在梯度掩蔽。
    """
    results = {}
    for steps in [1, 5, 10, 50, 100]:
        alpha = epsilon / steps * 2.5  # 步长随步数缩放
        x_adv = pgd_attack(model, x, y, epsilon, alpha, steps)
        with torch.no_grad():
            acc = (model(x_adv).argmax(1) == y).float().mean().item()
        results[f'PGD-{steps}'] = acc
    
    # 正常鲁棒模型：随 steps 增加，准确率单调下降后趋于稳定
    # 梯度掩蔽模型：FGSM 准确率异常高，PGD-100 准确率更低（或发散）
    return results
```

## 踩过的坑

1. **梯度掩蔽的假安全感**：某些防御（早期的 PixelDefend、Feature Squeezing）通过让梯度变得不连续或接近零来"躲避" PGD，PGD 步长太小看起来攻击失败，但换用 BPDA（backward-pass differentiable approximation）或 C&W 攻击就立刻突破。评估防御时必须用多种攻击方法交叉验证。

2. **步长 α 选取有玄机**：α 太大会在扰动球边界震荡不收敛，太小收敛太慢。实践经验：`α = ε/步数 × 2` 是合理起点，CIFAR-10 常用 `ε=8/255, α=2/255, steps=10（训练）/20（测试）`。

3. **训练与评估的步数不对称**：训练时为省时用 PGD-7 或 PGD-10，但评估时应用 PGD-20 甚至更多步，且配合多次随机重启（AutoAttack 是当前最可信的无参数攻击评估工具）。

4. **鲁棒性不等于泛化**：PGD 训练对 l∞ 扰动球内鲁棒，但对 l2、l1 或语义扰动（色彩变换、旋转）不保证鲁棒——"鲁棒"始终是相对特定威胁模型而言的，不能说一劳永逸。

## 适用 vs 不适用场景

**适用**：
- 安全敏感的视觉任务：自动驾驶感知、人脸识别、医疗影像诊断
- 需要可量化安全保证的场景（l∞ 扰动球内的保证）
- 作为鲁棒性研究的 baseline——RobustBench 收录的所有模型都以 PGD-AT 为对照
- 研究对抗鲁棒性与泛化关系时的受控实验

**不适用**：
- 训练成本极紧张的场景（PGD-AT 比标准训练慢 7-20×，考虑 Free-AT/Fast-AT）
- 对 l∞ 以外的威胁模型（语义扰动、几何变换）——PGD 框架可扩展但需重新定义 S
- 部署环境中扰动上界未知或不稳定——ε 选错会导致过于保守（准确率损失大）或保护不足

## 历史小故事（可跳过）

- **2013 年**：Szegedy 等人发现对抗样本，震惊 CV 社区——仅仅像素级扰动就能骗过最先进的 ImageNet 分类器。
- **2014 年**：Goodfellow 等人提出 FGSM（快速梯度符号法），一步梯度攻击，简单有效；同年提出对抗训练雏形（FGSM-AT）。
- **2017 年 6 月**：Madry 组将对抗鲁棒性升华为优化问题，发布 MNIST/CIFAR-10 公开挑战赛，邀请社区尝试攻破其 PGD 训练模型。
- **2018 年 ICLR**：论文正式发表，同年 Athalye 等人发表 "Obfuscated Gradients Give a False Sense of Security"，系统性揭示梯度掩蔽问题，两篇论文共同奠定对抗鲁棒性研究的规范。
- **2021 年**：RobustBench 发布，以 AutoAttack（基于 PGD 变体）为标准评估，成为领域排行榜，Madry 框架成为不可绕过的 baseline。

## 学到什么

1. **把对抗写成优化，才能真正分析**：把"安全"从直觉转化为 min-max 问题，才能用优化理论工具（Danskin 定理、收敛性分析）做保证，而不是猜一个防御有没有效
2. **最强的训练信号来自最强的对手**：用 PGD 而不是 FGSM 训练，鲁棒性大幅提升——"以最坏情况训练"是一种普遍的学习原理
3. **容量是鲁棒性的前提**：鲁棒决策边界比自然边界复杂得多，模型容量不足会导致准确率与鲁棒性同时下降
4. **评估标准不统一是研究进步的最大障碍**：Madry 设立公开挑战赛的决定，推动了 RobustBench 等标准化评估基础设施，是"把领域做成科学"的关键一步

## 延伸阅读

- 原版代码与挑战赛：[MadryLab/cifar10_challenge](https://github.com/MadryLab/cifar10_challenge)（理解框架最直接的入口）
- AutoAttack 论文（Croce & Hein 2020）：[arXiv 2003.01690](https://arxiv.org/abs/2003.01690)（当前最可信的无参数鲁棒评估）
- RobustBench 排行榜：[robustbench.github.io](https://robustbench.github.io)（查看各模型对 PGD 攻击的鲁棒准确率）
- TRADES（Zhang et al. 2019）：[arXiv 1901.08573](https://arxiv.org/abs/1901.08573)（将鲁棒性-准确率权衡显式化的改进方法）
- Gradient Masking 解析：Athalye et al. 2018, "Obfuscated Gradients Give a False Sense of Security"

## 关联

- [[abadi-dpsgd-2016]] —— 差分隐私 SGD，同为"给机器学习加安全约束"的训练框架，两者关注的威胁模型不同（外部攻击 vs 成员推断）
- [[dwork-dp-icalp-2006]] —— 差分隐私理论基础，与 PGD 鲁棒性共同构成 ML 安全的两大柱石
- [[aes]] —— 传统密码学安全保证依赖数学困难性；PGD 鲁棒性是深度学习版本的"计算有界对手"假设
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私，用于分析 DPSGD 的隐私损耗，与对抗鲁棒性分析思路对称
- [[libsignal]] —— 端到端加密依赖密钥安全；对抗鲁棒性依赖对模型的扰动有界——都是"定义清晰的威胁模型才能给出保证"的范例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[dwork-dp-icalp-2006]] —— 差分隐私 — ε 与邻接数据集不可区分
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私 — 隐私会计统一框架

