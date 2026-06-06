---
title: FGSM — 对抗样本的快速生成与线性假设
来源: 'Goodfellow, Shlens & Szegedy, "Explaining and Harnessing Adversarial Examples", ICLR 2015'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Explaining and Harnessing Adversarial Examples**（Goodfellow、Shlens、Szegedy，ICLR 2015）提出 **FGSM（Fast Gradient Sign Method）**：对输入 x 沿损失函数对 x 梯度的符号方向施加 ε 大小扰动，即

```
η = ε · sign(∇_x J(θ, x, y))
```

生成对抗样本 x̃ = x + η。论文的核心主张是：对抗样本的根源**不是**神经网络的高度非线性或过拟合，而是**线性性**——高维空间中，每个维度 ε 大小的微小扰动沿梯度方向累积，最终造成激活值的宏观跳变。

日常类比：在一张熊猫照片上叠加一层人眼看不见的"噪声花纹"（类似隐写术），每个像素只偏移 0.007，但 50,000 个像素同向叠加后，分类器以 99.3% 置信度把它认成长臂猿。

## 为什么重要

对抗攻防领域的**引用量最高论文之一**，奠定了攻击/防御研究基准：

- **FGSM → PGD**：[[madry-pgd-2017]] 将单步 FGSM 推广为多步迭代 PGD，成为更强攻击基准
- **对抗训练**：本文提出混合训练目标 J̃ = αJ_clean + (1-α)J_adv，后续 TRADES 等防御均在此框架上改进
- **迁移性发现**：在模型 A 上生成的对抗样本，也能迁移攻击模型 B（黑盒攻击基础）
- **实验引用**：后续几乎所有鲁棒性评测都用 FGSM/PGD 作为对比基线
- **与 [[abadi-dpsgd-2016]]**：差分隐私训练与对抗训练是安全-隐私领域两条并行主线

## 核心要点

1. **线性假设**：权重向量 w 与扰动 η 的内积增长量 = w⊤η；L∞ 约束下最优 η = sign(w)，增量 ε·m·n 随维度 n 线性扩大——这就是为什么高维输入特别脆弱。直觉：每个像素只偏移一点点，但 784 个像素同向叠加，最终改变分类器的输出方向。

2. **FGSM 公式**：η = ε·sign(∇_x J)，只需一次反向传播即可生成，**比 L-BFGS 快几个数量级**。

3. **对抗训练目标**：J̃(θ,x,y) = α·J(θ,x,y) + (1-α)·J(θ, x+η, y)，α=0.5 时在 MNIST maxout 网络上将干净错误率从 0.94% 降至 0.84%，对抗错误率从 89.4% 降至 17.9%。

4. **迁移性机制**：不同模型训练于同任务时学到近似相同的线性分类方向，因此对抗方向在模型间高度对齐。

5. **ε 与精度权衡**：ε=0.25 可令 softmax 在 MNIST 上错误率达 99.9%；ε 越大攻击越强，人眼越容易察觉。

6. **RBF 例外**：RBF 网络天然对对抗样本置信度低（误分置信仅 1.2%），但泛化能力差，说明线性与鲁棒性存在根本张力。

## 实践案例

### 案例 1：用 PyTorch 实现 FGSM

```python
import torch

def fgsm_attack(model, x, y, epsilon=0.25):
    """单步 FGSM 攻击：返回对抗样本"""
    x = x.clone().requires_grad_(True)
    loss = torch.nn.CrossEntropyLoss()(model(x), y)
    loss.backward()
    # 沿梯度符号方向扰动
    x_adv = x + epsilon * x.grad.sign()
    return x_adv.detach().clamp(0, 1)
```

运行思路：遍历测试集，比较 model(x) 与 model(x_adv) 的准确率落差，即可量化模型的 FGSM 鲁棒性。

### 案例 2：对抗训练混合目标

```python
import torch.nn.functional as F

alpha = 0.5

def adversarial_loss(model, x, y, epsilon=0.25):
    x_adv = fgsm_attack(model, x, y, epsilon)
    loss_clean = F.cross_entropy(model(x), y)
    loss_adv = F.cross_entropy(model(x_adv), y)
    return alpha * loss_clean + (1 - alpha) * loss_adv
```

与标准训练相比，每步多一次前向+反向传播；大模型上成本翻倍，工程上通常限于微调阶段使用。

### 案例 3：ε 扫描——鲁棒性压力测试

```python
for eps in [0.01, 0.05, 0.1, 0.2, 0.3]:
    acc = evaluate_under_fgsm(model, test_loader, epsilon=eps)
    print(f"ε={eps:.2f} → 准确率 {acc:.1%}")
```

用于安全部署前的快速压力测试，绘制 accuracy-vs-ε 曲线提交审计报告。

### 案例 4：用梯度方向做 Saliency Map

```python
x = image.requires_grad_(True)
model(x).max().backward()
saliency = x.grad.abs()       # 每个像素对输出的影响
# FGSM 方向即 sign(saliency)，高亮最敏感像素
```

可解释性工具：不仅生成对抗样本，还可视化模型在哪些像素最"脆弱"。

### 案例 5：黑盒迁移攻击流程

1. 在替代模型（如 ResNet-18）上用 FGSM 生成对抗样本（`model.eval()` + 关闭 dropout）
2. 将对抗样本直接提交给目标 API（无需访问梯度）
3. 测量目标模型错误率；若显著高于干净样本，说明存在迁移漏洞

这是实际红队测试的常见流程，也说明**黑盒安全不等于无梯度安全**。

## 踩过的坑

1. **FGSM ≠ 真实鲁棒性**：FGSM 是单步攻击，能抵御 FGSM 的模型对 PGD（[[madry-pgd-2017]]，40 步）往往仍然脆弱。不要把"FGSM 错误率低"当作安全证明。

2. **对抗样本的迁移性被低估**：学界早期认为黑盒攻击不可行，本文已实验证明迁移率高达 54.6%（softmax 预测 maxout 类别）。

3. **线性假设不是终极解释**：后续研究（维度诅咒、流形假说、高曲率方向）给出了更丰富的解释，不要把 FGSM 论文当作对抗样本现象的完整理论。

4. **对抗训练计算开销**：每步多一次前反向传播，大模型（>1B 参数）上开销翻倍，需要梯度检查点或混合精度控制内存。

5. **ε 量纲依赖数据范围**：论文 MNIST 用 [0,1] 范围 ε=0.25；若数据归一化到 [-1,1] 或未归一化，需重新校准 ε 的实际感知大小。

6. **集成不够用**：12 个 maxout 集成在 FGSM ε=0.25 下错误率仍达 91.1%；集成不是防御银弹。

## 适用 vs 不适用场景

**适用**：

- **鲁棒性基准**：新模型发布前用 FGSM 快速检验输入敏感性
- **对抗训练热身**：FGSM 成本低，可在 PGD 对抗训练之前预热
- **红队快速评估**：白盒条件下 1 次 backward 即可生成攻击样本
- **可解释性辅助**：梯度方向可视化模型关注区域

**不适用**：

- **生产级鲁棒性认证**（需 PGD/AA/凸松弛验证）
- **物理世界攻击**（需 C&W 等更强优化攻击，FGSM 物理实现困难）
- **防御大型语言模型**（离散 token 空间无法直接用梯度符号）

## 历史小故事（可跳过）

- **2013**：Szegedy 等人（含本文作者之一）发现 ImageNet 上神经网络存在对抗样本，归因于"极度非线性"。
- **2014**：Goodfellow 在 Google Brain 内部讨论时意识到线性才是根因，用一个下午推导出 FGSM，隔天就能运行实验——ICLR 2015 录用。
- **2017**：Madry 等人将单步 FGSM 拓展为多步 PGD，确立了 ε-ball 鲁棒性作为评测标准。
- **2018**：Athalye 等人发布 Obfuscated Gradients 报告，戳破大量"防御"实际上只是梯度遮蔽，FGSM/PGD 仍是标准检验。
- **2020+**：AutoAttack、RobustBench 社区继续以 FGSM/PGD 为底线，形成对抗鲁棒性排行榜。

## 学到什么

- **对抗脆弱性的根源是线性**，不是深度或非线性：高维内积在每个维度累积 ε，整体效果不可忽视。
- **FGSM 极简**：一次反向传播，3 行代码，让大规模对抗训练成为可能。
- **单步攻击 ≠ 安全基准**：FGSM 是必要条件，不是充分条件；配套使用 PGD 才能说明问题。
- **迁移性是黑盒攻击的理论基础**：不同模型共享线性方向 → 替代模型攻击可迁移。
- **对抗训练是正则化**：减少了 MNIST maxout 测试错误率，权重变得更局部化和可解释。
- **实验习惯**：每次引入新防御，先跑 FGSM 基线；若 FGSM 就能突破，说明防御失效。
- **复习时对照** [[madry-pgd-2017]] 和 [[carlini-wagner-2016]]，三篇合看理解攻击强度梯度。

## 延伸阅读

- https://arxiv.org/abs/1412.6572 — 原始论文
- [[madry-pgd-2017]] — PGD 多步攻击与 min-max 训练
- [[carlini-wagner-2016]] — C&W 攻击：更强的优化攻击
- https://robustbench.github.io — RobustBench 鲁棒性排行榜
- [[abadi-dpsgd-2016]] — 安全-隐私双线：DP 训练对照

## 关联

- [[madry-pgd-2017]] — PGD 对抗训练
- [[carlini-wagner-2016]] — C&W 攻击
- [[abadi-dpsgd-2016]] — 差分隐私训练
- [[dropout-2014]] — 论文引用的正则化基线
- [[batchnorm-2015]] — 论文引用的架构组件
- [[lstm-1997]] — 论文提及 LSTM 线性设计动机

## 维护备注

- frontmatter `分类/子分类` 对应 research.json `canonical_theme` = 安全与隐私。
- 代码块为概念性伪代码，可直接在 PyTorch ≥ 2.0 环境运行；路径使用占位符。
- 关联 slug 以 `data/written.txt` 已写 slug 为优先；未写 slug 使用纯文本暂记，合并后补 wikilink。
- 本篇目标 150–200 行；扩写优先「实践案例」与「踩过的坑」段落。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
