---
title: Sophia — 让二阶优化器第一次在 LLM 预训练里跑得动
来源: 'Liu, Li, Hall, Liang, Ma, "Sophia: A Scalable Stochastic Second-order Optimizer for Language Model Pre-training", arXiv 2305.14342 / ICLR 2024'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Sophia 是一个**给大语言模型预训练用的优化器**，名字拼自 **S**econd-**o**rder cl**i**pped stoc**h**astic optimiz**a**tion。日常类比：你下山找最低点，Adam 像只看脚下的坡度，Sophia 还顺手摸一下"这里地面是硬是软"——硬地小步、软地大步，用更少步数到底。

它的成绩单只有一句话：在 GPT 125M 到 1.5B 上，**达到同样的 loss / perplexity 用约 50% 的 token、算力与 wall-clock 时间**。AdamW 主导 LLM 预训练优化器的位置，2023 年第一次被一个真能在大规模上跑的二阶方法认真挑战。

## 为什么重要

不理解 Sophia，下面这些事都没法解释：

- 为什么训练一个 13B 模型要烧几百万美元，但优化器换一下就可能省一大截——优化器选择是预训练成本最大的旋钮之一
- 为什么二阶方法（K-FAC、Shampoo）在论文里看着漂亮，实际工业训练几乎没人用——每步开销吃光理论收益
- 为什么 Adam / AdamW 已经统治约 10 年——它的"梯度二阶矩"近似刚好够用又够便宜
- 为什么"对角曲率 + 间隔估计 + clip"这套朴素组合能赢——工程权衡比数学优雅更值钱

## 核心要点

Sophia 把"二阶方法"从论文搬到 LLM 实战，靠 **三个工程取舍**：

1. **只估对角曲率**：完整二阶信息是 N×N 矩阵（N 是参数数），存不下。Sophia 只给每个参数一个"软硬程度"标量，和梯度同量级。代价是丢掉参数之间的交叉项；对角近似丢掉交叉项，但实践里仍够用。

2. **每 k 步才估一次**：估曲率仍要做一次额外反传。Sophia 设 k=10，把开销摊到 10 步，平均每步额外开销约 5%。两步之间用**滑动平均**（EMA：像给读数装 smoothing，旧值慢慢淡出、新值慢慢淡入）维持。

3. **逐元素 clip**：曲率估计有时是负数或非常小，直接做分母会爆炸。Sophia 把每个参数的更新夹在 [-rho, +rho]，最坏情况退化成符号梯度法，鲁棒性兜底。论文常用 `rho=0.04`。

更新公式简化版：

```
update = clip( EMA(grad) / EMA(diag_curvature), rho )
param  = param - lr * update
```

**和 Adam 的对比一句话**：Adam 用梯度平方的滑动平均（经验 Fisher，可理解为"梯度抖动有多大"）做预条件（pre-conditioner：按维度缩放步长的那一层）；Sophia 用对角曲率估计。Hutchinson 更接近对角 Hessian；语言建模默认的 GNB 估的是 Gauss-Newton / Fisher 对角——都比"只看梯度抖动"更贴近二阶本意。

## 实践案例

### 案例 1：两个曲率估计器怎么选

```text
Hutchinson:  随机探针 z → 估 diag(Hessian)   # 通用，噪声更大
GNB:         分类/LM 结构 → 估 Fisher 对角     # GPT 实验默认
```

**逐部分解释**：

1. Hutchinson 像随机敲墙听回声，任何可微目标都能用，但单次估计吵
2. GNB（Gauss-Newton-Bartlett）利用 next-token 分类 loss 的结构，方差更小
3. 开源实现（PyTorch / Levanter / nanoGPT 分支）预训练多用 GNB；别把 GNB 一律叫成"真实 Hessian"

### 案例 2：为什么 clip 不是装饰

```text
坏情况: hess ≈ -0.001  →  grad/hess 方向反、幅度炸
有 clip: update_i = clamp(m_i / h_i, ±rho, +rho)
最坏:   update_i = sign(grad_i) * rho   # 退化成 signSGD
```

**逐部分解释**：

1. 非凸路径上对角曲率会抖到接近 0 甚至为负
2. 不加 clip，更新会反着冲且爆炸；加 clip 后每维更新有上限
3. "二阶为主、一阶兜底"是 Sophia 大规模不崩的关键；`rho=0.04` 是论文常用起点

### 案例 3：在代码里替换 AdamW

```python
# 原来
optimizer = AdamW(params, lr=6e-4, betas=(0.9, 0.95), weight_decay=0.1)

# 切换（官方 SophiaG 风格）
optimizer = SophiaG(params, lr=6e-4, betas=(0.965, 0.99),
                    rho=0.04, weight_decay=0.1)

for step, batch in enumerate(loader):
    loss = model(batch).loss
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
    if step % 10 == 0:           # 每 10 步估一次曲率
        optimizer.update_hessian()
```

**逐部分解释**：

1. `rho=0.04` 与官方推荐对齐；betas 也别照搬 AdamW
2. `update_hessian()` 跑一次 GNB 估计，开销摊到 k=10 步
3. 训练循环几乎不变——这是能进工业 codepath 的原因

## 踩过的坑

1. **直觉以为"二阶 = 慢"**：Newton/BFGS 每步 O(N²)/O(N³)；Sophia 对角近似每步 O(N)，和 SGD 同量级。
2. **clip 阈值 rho 是关键超参**：太大兜不住异常曲率，太小退化成纯 signSGD；先从论文常用的 `rho=0.04` 起步。
3. **学习率不能照搬 AdamW**：有效更新幅度由 clip 管着，直接复用 AdamW 的 lr schedule 通常会差一截。
4. **不是所有任务都受益**：主场是 LLM 预训练；小模型 / dense 数据上和 AdamW 常拉不开差距。
5. **Hutchinson 噪声**：小 batch 下更吵，靠 EMA + 间隔估平滑；GPT 实验切 GNB 就是为了降方差。
6. **别把"对角曲率"和 Adam 的"经验 Fisher"混为一谈**：后者是梯度抖动；训练中途并不等于曲率。

## 适用 vs 不适用场景

**适用**：
- LLM 预训练（论文主场，125M ~ 1.5B 验证过）
- 各维度曲率差异大、训练步数预算紧的任务
- 已有稳定 AdamW baseline，希望改动训练循环约 5 行做对照实验

**不适用**：
- 微调（SFT/RLHF）— 步数少，曲率估计噪声占比高，论文未验证收益
- 极小模型 / toy 任务 — Adam 已够好，多出的约 5% 开销不值
- 需要可证明收敛保证的一般非凸场景 — 理论分析在简化设定下

## 历史小故事（可跳过）

- **2014 年**：Kingma 提出 Adam，"梯度二阶矩"做预条件，统治深度学习训练。
- **2015-2020 年**：K-FAC、Shampoo 等真二阶方法不断出现，工业界几乎不动 Adam——每步 2-5 倍开销吃光收益。
- **2023 年 5 月**：Stanford 团队（Hong Liu、Tengyu Ma 等）放出 Sophia：对角 + 间隔 + clip，端到端在 LLM 预训练上相对 AdamW 约 2 倍步数效率。
- **2024 年**：进入 ICLR，社区复现增多；工业正式切换仍慢——成熟 AdamW codepath 的切换风险不小。

## 学到什么

1. **优化器是预训练成本最大的旋钮之一**——AdamW 不是终点
2. **理论优雅 vs 工程可行**：完整 Hessian 最干净，对角近似最实用，Sophia 选后者
3. **"间隔估计 + clip" 是经典工程套路**：贵的摊薄、危险的兜底
4. **Adam 的经验 Fisher 是二阶的偷懒版**——Sophia 把预条件更贴近曲率
5. **rho 替代了一部分 lr 的角色**——所以 lr schedule 不能照搬
6. **κ（最陡/最平曲率比）越大，相对 AdamW 的优势往往越大**——选任务的指南针

## 延伸阅读

- 论文 PDF：[Sophia 2305.14342](https://arxiv.org/abs/2305.14342)（前 8 页讲清算法和实验）
- 官方实现：[Liuhong99/Sophia](https://github.com/Liuhong99/Sophia)（PyTorch，含 GPT 训练脚本）
- nanoGPT 集成：社区有 nanoGPT-Sophia 分支可对照 AdamW 跑
- [[adam-2014]] —— Sophia 想替代的对手，理解 Adam 的经验 Fisher 是前提
- [[adamw-2017]] —— 当前 LLM 预训练默认，Sophia 论文的 baseline

## 关联

- [[adam-2014]] —— Adam 用梯度二阶矩做预条件，Sophia 用对角曲率估计
- [[adamw-2017]] —— AdamW 是 Sophia 主要 baseline
- [[adafactor-2018]] —— Adafactor 也想省 Adam 的内存，Sophia 关注收敛速度
- Shampoo / K-FAC（暂无独立笔记）—— Kronecker 近似路线；Sophia 是更激进的对角简化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
