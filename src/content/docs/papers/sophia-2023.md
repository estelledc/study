---
title: Sophia — 让二阶优化器第一次在 LLM 预训练里跑得动
来源: 'Liu, Li, Hall, Liang, Ma, "Sophia: A Scalable Stochastic Second-order Optimizer for Language Model Pre-training", arXiv 2305.14342 / ICLR 2024'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Sophia 是一个**给大语言模型预训练用的优化器**，名字拼自 **S**econd-**o**rder cl**i**pped stoc**h**astic optimiz**a**tion。日常类比：你下山找最低点，Adam 像只看脚下的坡度，Sophia 还顺手摸一下"这里地面是硬是软"——硬地小步、软地大步，用更少步数到底。

它的成绩单只有一句话：在 GPT 125M 到 1.5B 上，**达到同样的 loss / perplexity 用 50% 的 token、50% 的算力、50% 的 wall-clock 时间**。AdamW 主导 LLM 预训练优化器的位置，2023 年第一次被一个真能在大规模上跑的二阶方法挑战。

## 为什么重要

不理解 Sophia，下面这些事都没法解释：

- 为什么训练一个 13B 模型要烧几百万美元，但优化器换一下就能省一半——优化器选择是预训练成本最大的旋钮之一
- 为什么二阶方法（K-FAC、Shampoo）在论文里看着漂亮，实际工业训练几乎没人用——每步开销吃光理论收益
- 为什么 Adam / AdamW 已经统治 10 年——它的"梯度二阶矩"近似刚好够用又够便宜
- 为什么"对角 Hessian + 间隔估计 + clip"这套朴素组合能赢——工程权衡比数学优雅更值钱

## 核心要点

Sophia 把"二阶方法"从论文搬到 LLM 实战，靠 **三个工程取舍**：

1. **只估对角 Hessian**：完整 Hessian 是 N×N 矩阵（N 是参数数，70 亿模型是 70 亿乘 70 亿），存不下。Sophia 只估每个参数自己的二阶导（对角元素），每参数一个标量，和梯度同量级。代价是丢掉曲率交叉项，但 LLM 参数互相耦合本来就弱。

2. **每 k 步才估一次**：估对角 Hessian 仍要做一次额外反传。Sophia 设 k=10，把开销摊到 10 步，平均每步 Hessian 开销小于 5%，几乎免费。两步之间用滑动平均维持。

3. **逐元素 clip**：Hessian 估计有时是负数（非凸 loss 路径上很常见）或非常小，直接做分母会爆炸。Sophia 在更新方向上对每个参数单独 clip，相当于"理论上是二阶法、最坏情况退化成符号梯度法"，鲁棒性兜底。

更新公式简化版：

```
update = clip( EMA(grad) / EMA(diag_Hessian), rho )
param  = param - lr * update
```

**和 Adam 的对比一句话**：Adam 用梯度的二阶矩（梯度平方的滑动平均，相当于经验 Fisher）做 pre-conditioner，Sophia 用真实对角 Hessian。前者是"梯度方差"，后者是"loss 曲率"——后者才是二阶方法本来想要的东西。

## 实践案例

### 案例 1：Hessian 估计的两个版本

Sophia 论文给了两个估计器，选哪个看任务：

- **Hutchinson 估计器**：通用，任何可微目标都能用。原理是用随机向量 z 算 `z^T H z` 的期望来逼近 `diag(H)`。每次估要做一次 Hessian-向量积。
- **Gauss-Newton-Bartlett (GNB)**：分类任务（含语言建模 next-token prediction）专用。利用分类 loss 的结构，用 mini-batch 内的梯度差估计 Fisher，方差比 Hutchinson 小，论文里 GPT 实验默认用它。

实际开源实现里，PyTorch / Levanter / nanoGPT 的 Sophia 分支多用 GNB 版本。

### 案例 2：为什么 clip 不是装饰

考虑一个参数 p，它的对角 Hessian 估计偶尔波动到 -0.001（接近 0 且为负）。如果直接 `grad / hess`，更新方向**反着冲**而且**幅度爆炸**。clip 把每个维度的更新限制在 [-rho, +rho]，最坏情况下退化为：

```
update_i = sign(grad_i) * rho
```

也就是符号梯度法（signSGD）。这个"二阶为主、一阶兜底"的设计是 Sophia 能在大规模训练里不崩的关键——理论收益拿到，工程鲁棒性也保住。

### 案例 3：和 K-FAC、Shampoo 的差别

| 优化器 | 近似 Hessian | 每步开销 | LLM 实战 |
|---|---|---|---|
| AdamW | 经验 Fisher（梯度二阶矩） | 1x | 主流 |
| K-FAC | 块对角 Kronecker 因子 | 3-5x | 几乎不用 |
| Shampoo | 每层左右 preconditioner | 2-4x | Google 部分用 |
| Sophia | 对角 + 间隔估 + clip | 1.05x | 论文给出实战可行性 |

Sophia 的赌注是：**最简单的 Hessian 近似 + 工程兜底，足以在 LLM 上跑赢 Adam**。事实证明赌赢了。

### 案例 4：在代码里替换 AdamW 长什么样

伪代码层面，从 AdamW 切到 Sophia 的改动量极小：

```python
# 原来
optimizer = AdamW(params, lr=6e-4, betas=(0.9, 0.95))

# 切换
optimizer = SophiaG(params, lr=6e-4, betas=(0.965, 0.99), rho=0.04)

for step, batch in enumerate(loader):
    loss = model(batch).loss
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
    if step % 10 == 0:           # 关键：每 10 步估一次 Hessian
        optimizer.update_hessian()
```

`update_hessian()` 内部跑一次额外的 Gauss-Newton-Bartlett 估计，和正常 backward 共享计算图。除了这一行，训练循环和 AdamW 几乎一样——这是 Sophia 真正能在工业代码里落地的关键。

### 案例 5：理论收益从哪来

论文在简化设定下给出一个干净的结论：Sophia 的 runtime bound **不依赖 condition number κ**（loss 在最陡 / 最平方向曲率比）。

直觉解释：

- Adam 把所有维度按梯度方差归一，但梯度方差 ≠ 曲率，对各向异性 loss surface 不够敏感
- κ 大意味着各方向"陡平差距"大，一阶方法走最平方向时步子被卡死，整体步数被慢方向拖累
- Sophia 直接按曲率归一，陡的小步走、平的大步走，各方向同步收敛，κ 失去对总步数的杀伤力

LLM loss surface 各维度异质曲率严重（有的方向几乎平、有的方向极陡），这正是 Sophia 拿到 2 倍速度的根源——κ 越大，Sophia 相对 AdamW 的优势越大。

## 踩过的坑

1. **直觉以为"二阶 = 慢"**：很多人记忆里的二阶方法是 Newton 法或 BFGS，每步要 O(N^2) 或 O(N^3)。Sophia 的对角近似让每步只要 O(N)，和 SGD 一个量级。

2. **clip 阈值 rho 是关键超参**：太大 clip 不起作用，更新会被异常 Hessian 带偏；太小退化成纯 signSGD，丢掉曲率信息。论文给的推荐值是参数维度无关的常数。

3. **学习率不能照搬 AdamW**：Sophia 的"有效更新幅度"由 clip 控制而不是 lr × grad，所以 lr 调参曲线和 AdamW 完全不同。直接复用 AdamW 的 lr schedule 通常会差一截。

4. **不是所有任务都受益**：Sophia 主打 LLM 预训练（稀疏梯度、各维度曲率差异大）。在小模型 / dense 数据上和 AdamW 拉不开差距。

5. **Hutchinson 估计噪声**：Hutchinson 用随机向量算 Hessian-向量积，单次估计方差大。Sophia 靠滑动平均 + 间隔估两层平滑压住噪声，但小 batch 下仍可能不稳。GPT 实验切到 GNB 估计器就是因为方差更小。

6. **不要混淆 "对角 Hessian" 和 "经验 Fisher"**：Adam 的分母是梯度平方的滑动平均（经验 Fisher），它在最优点处约等于 Hessian，但训练中途偏差很大。Sophia 直接估真实 Hessian，从源头上避开这个偏差。

## 适用 vs 不适用场景

**适用**：
- LLM 预训练（论文主场，125M ~ 1.5B 验证过，更大尺寸社区有复现）
- 各维度曲率差异大、训练步数预算紧的任务
- 已有稳定 AdamW baseline，希望"用同样代码改 5 行省一半算力"

**不适用**：
- 微调（fine-tune）— SFT/RLHF 阶段步数本就少，Hessian 估计噪声占比高，论文未验证收益
- 极小模型 / toy 任务 — Adam 已经够好，多出的 5% 开销不值
- 需要可证明收敛保证的凸优化场景 — Sophia 的理论分析在简化设定下，不覆盖一般非凸

## 历史小故事（可跳过）

- **2014 年**：Kingma 提出 Adam，"梯度二阶矩"做 pre-conditioner，统治深度学习训练。
- **2015-2020 年**：K-FAC、Shampoo 等"真二阶"方法不断出现，论文好看，工业界几乎不动 Adam——每步 2-5 倍开销吃光收益。
- **2023 年 5 月**：Stanford 团队（Hong Liu、Tengyu Ma 等）放出 Sophia，思路是"别贪心估完整 Hessian，对角 + 间隔 + clip 就够"，第一次让二阶方法在 LLM 预训练上端到端跑赢 AdamW 2 倍。
- **2024 年**：进入 ICLR，社区复现增多。但工业界正式切换仍慢——成熟的 AdamW codepath 切换风险大于 50% 收益。

## 学到什么

1. **优化器是预训练成本最大的旋钮之一**——AdamW 不是终点，换得动就是百万美元级别的省钱
2. **理论优雅 vs 工程可行**：完整 Hessian 在数学上最干净，对角近似在工程上最实用，Sophia 选了后者
3. **"间隔估计 + clip" 是经典工程套路**：贵的东西摊薄、危险的东西兜底，理论收益就能落地
4. **Adam 的"经验 Fisher" 其实是二阶方法的偷懒版**——Sophia 把这一步做对，回到二阶方法的本意
5. **rho 这个超参替代了一部分 lr 的角色**——理解了 clip 为什么是核心，就理解了为什么 lr schedule 不能照搬
6. **κ 不依赖** 这个理论结论给的不是绝对加速比，而是"loss surface 越各向异性，Sophia 相对优势越大"——预测哪些任务值得切换的指南针

## 延伸阅读

- 论文 PDF：[Sophia 2305.14342](https://arxiv.org/abs/2305.14342)（30 页，前 8 页讲清算法和实验）
- 官方实现：[Liuhong99/Sophia](https://github.com/Liuhong99/Sophia)（PyTorch，含 GPT 训练脚本）
- nanoGPT 集成：社区有 nanoGPT-Sophia 分支可对照 AdamW 跑
- [[adam-2014]] —— Sophia 想替代的对手，理解 Adam 的"经验 Fisher"是理解 Sophia 的前提
- [[adamw-2017]] —— AdamW 是当前 LLM 预训练默认，Sophia 论文的 baseline

## 关联

- [[adam-2014]] —— Adam 用梯度二阶矩做 pre-conditioner，Sophia 用真实对角 Hessian
- [[adamw-2017]] —— AdamW 是 Sophia 主要 baseline，论文实验用同 lr schedule 框架
- [[adafactor-2018]] —— Adafactor 也想省 Adam 的内存，Sophia 关注的是收敛速度
- Shampoo / K-FAC（暂无独立笔记）—— 二阶优化器另一条路线，用 Kronecker 近似而非对角；Sophia 是更激进的简化
