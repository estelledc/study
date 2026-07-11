---
title: SparseGPT — 175B 大模型一次过剪 50%，不重训
来源: 'Frantar & Alistarh, "SparseGPT: Massive Language Models Can Be Accurately Pruned in One-Shot", ICML 2023 (arXiv 2301.00774)'
日期: 2026-05-31
分类: LLM 推理
难度: 中级
---

## 是什么

**SparseGPT** 是一种**后训练剪枝**方法：拿一个已经训好的大模型（比如 OPT-175B、BLOOM-176B），在**不重训**的前提下，**一次性**砍掉 50% 的权重，精度几乎不掉。

日常类比：像装修师傅给别人盖好的房子拆 50% 的墙——不能动地基（不重训）、不能让房子塌（精度不能崩）、还得一天搞完（约 4 小时一张 A100）。

具体数字：

- 模型规模：**175B 参数**（OPT 全家桶到顶）
- 稀疏度：**50%** 非结构化、或 **2:4 / 4:8** 半结构化
- 时间：单张 A100，**约 4 小时** 跑完整个 175B
- 校准数据：只要 **128 条 C4 序列**（每条 2048 token），完全无梯度

## 为什么重要

不理解 SparseGPT，下面这些事都没法解释：

- 为什么 2023 年之后大模型部署突然多了"剪枝 + 量化"两条独立路线，不再要求重训
- 为什么 NVIDIA 在 Ampere 架构里塞了**稀疏 Tensor Core**——SparseGPT 这类方法是它的主要客户
- 为什么后续的 Wanda、Magnitude+OBS 一堆论文都在和 SparseGPT 比
- 为什么"大模型反而更容易压"——SparseGPT 实测越大越好剪，反直觉

老路线（Han et al 2015 经典剪枝）要"剪一点 → 重训 → 再剪一点"。在 175B 上跑一遍重训要几百张卡几周，没人玩得起。SparseGPT 把剪枝从**训练时操作**变成**离线一次过工程问题**。

## 核心要点

SparseGPT 把剪枝重新表达为**逐层稀疏回归**：

```
对每一层 W：min ||WX − W'X||²，约束：W' 至少 50% 是 0
```

意思是"找一个稀疏版 `W'`，让它对校准数据 X 的输出尽量接近原 W 的输出"。带"至少一半是 0"的约束时这是 NP-hard；忽略该约束时是普通二次最小二乘，再靠启发式选 mask。

近似算法分四步：

1. **算 Hessian（二阶敏感度表）**：从校准数据 X 算 `H = 2·X·Xᵀ + λI`，再算 `H⁻¹`。类比：给每个权重贴一张"剪掉它会伤多大"的标签——这是 **OBS（Optimal Brain Surgeon, Hassibi 1993）** 的二阶信息。
2. **Cholesky 一次性铺好**：把 `H⁻¹` 做 Cholesky 分解。类比：把敏感度表预先拆成好用的三角表，后面按列连除更稳、更快。
3. **逐列处理（核心 trick）**：W 的所有行**共享同一列顺序**，按 B=128 列分块走。每块内按 `|w_ij| / [H⁻¹]_ii` 选 mask，再对剩余权重做 **OBS 闭式补偿**，并把残差推到后续列。
4. **Adaptive mask**：mask 在每块内自适应选择，不是全局一刀切。

第 3 步是工程关键：理想情况每行应有自己的列顺序，但太贵；共享顺序换来 175B 可跑完。

## 实践案例

### 案例 1：50% 稀疏 OPT-175B（WikiText2 / C4）

```
模型              WikiText2 PPL    C4 PPL
OPT-175B 原版     8.35            10.13
SparseGPT 50%     8.21            10.36    ← WikiText 几乎持平，C4 略升
SparseGPT 2:4     8.74            10.92    ← 半结构化约束更硬
Magnitude 50%     ~4e4            ~1e3     ← 直接崩
```

**逐部分解释（一层怎么剪）**：

```text
1. 取 128×2048 校准 token，跑该层得到激活 X
2. 算 H 与 H⁻¹（加阻尼 λ），Cholesky 预分解
3. 按列块选 mask → OBS 更新剩余权重 → 残差传给后面列
4. 写出稀疏 W'，进入下一层（无梯度、不重训）
```

只看权重大小剪会崩；OBS 补偿保住了大模型上的精度。

### 案例 2：2:4 喂 Ampere 稀疏 Tensor Core

**2:4** 长这样：连续 4 个权重里**恰好 2 个必须是 0**，例如 `[0.1, 0, -0.3, 0]` 合法，`[0.1, 0.2, 0, 0]` 也合法，但三个非零就不行。SparseGPT 把该形状塞进第 3 步的 mask 约束；A100/H100 稀疏 Tensor Core 才能吃到约 2× 稀疏矩乘加速。非结构化 50% 在默认 cuBLAS 上通常**不加速**，只省显存。

参见 [[ampere-architecture-2020]]。

### 案例 3：和 GPTQ 组合（同作者）

GPTQ（[[gptq-2023]]）与 SparseGPT **同作者、同框架**：都用 OBS + Cholesky + 列分块。区别只是目标——GPTQ 量化到低比特网格，SparseGPT 把权重置 0。可叠加：先剪 50% 再 GPTQ 到 4-bit；存储量级上可压到约 **1/8–1/16**（视稀疏存储格式与索引开销）。

## 踩过的坑

1. **校准数据分布偏移**：用 C4 校准、部署到中文场景，掉点会比想象多。换校准集就好。
2. **非结构化稀疏在 GPU 上没加速**：50% 非结构化在默认 dense kernel 上和密集一样慢——要加速必须 2:4 + 稀疏内核。
3. **OBS 近似在 70%+ 稀疏度站不住**：50% 是甜点，60% 还行，70% 起 perplexity 明显恶化。
4. **Hessian 内存与 Cholesky 阻尼**：每层 H 可达数 GB，需分块/offload；`λ ≈ 0.01·mean(diag(H))`，否则 Cholesky 易 NaN。

## 适用 vs 不适用场景

**适用**：

- 已训好的大模型（论文主结果在 OPT/BLOOM，**越大越好剪**；125M 同稀疏度掉点更大）做离线压缩、不能重训
- 需要喂 NVIDIA 稀疏 Tensor Core（2:4 / 4:8）
- 和量化叠加做极致压缩（SparseGPT + GPTQ）
- 模型已部署、想压一档省显存/成本

**不适用**：

- 模型还在训：边训边稀疏（如 RigL）效果更好
- 70%+ 极端稀疏度：精度掉太多
- 校准数据极少 / 分布和部署差很远：精度不可控
- 推理框架不支持稀疏内核：相当于只省显存不省算力

## 历史小故事（可跳过）

- **1989 年**：Yann LeCun 提出 **Optimal Brain Damage**，用一阶 + 对角 Hessian 决定剪哪个权重。
- **1993 年**：Hassibi & Stork 提出 **OBS**——用完整 Hessian，给出剪枝 + 剩余权重补偿的闭式解。
- **2015 年**：Han 等人 **Deep Compression** 把 magnitude pruning + 重训组合成工业方案，但需要重训。
- **2022 年**：Frantar & Alistarh 在 **GPTQ** 里把 OBS + Cholesky + 列分块用到量化，证明大模型规模可行。
- **2023 年 1 月**：同两人把该框架拿来做剪枝，即 SparseGPT（ICML 2023）。随后 **Wanda** 发现可省掉 OBS 补偿，只看 `|w| · ||x||`。

OBS 这个 30 年前的算法，在 GPU 时代被翻出来变成大模型压缩主力——冷板凳算法等的就是合适的硬件和数据规模。

## 学到什么

1. **后训练压缩可行**——有 OBS 闭式补偿，剪枝不一定要重训，但前提是有好的二阶信息。
2. **行间共享列顺序是工程胜利**——理论最优是每行独立；共享 + Cholesky 把 175B 跑进约 4 小时。
3. **半结构化稀疏才是硬件友好**——非结构化在通用 GPU 上常不加速；Ampere 的 2:4 是软硬件协同产物。
4. **越大越好剪**——50% 稀疏在 175B 比在 1.3B 容易，给"先大后压"提供了合法性。

## 延伸阅读

- 论文 PDF：[arXiv 2301.00774](https://arxiv.org/abs/2301.00774)（前 8 页讲清核心）
- 代码：DASLab GitHub `sparsegpt`（PyTorch）
- 同作者 GPTQ：[arXiv 2210.17323](https://arxiv.org/abs/2210.17323)
- 后续 Wanda：[arXiv 2306.11695](https://arxiv.org/abs/2306.11695)
- [[gptq-2023]] —— 同框架的量化版
- [[ampere-architecture-2020]] —— 2:4 稀疏 Tensor Core 硬件入口

## 关联

- [[gptq-2023]] —— 同作者 OBS 框架的量化路线
- [[awq]] —— 另一条后训练量化（激活感知）
- [[ampere-architecture-2020]] —— 2:4 稀疏 Tensor Core 落地点
- [[attention]] —— SparseGPT 主要剪 attention / FFN 的全连接层
- [[flash-attention]] —— 算子优化轴，与稀疏化独立

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[awq]] —— AWQ — 看激活脸色给权重打折
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gptq-2023]] —— GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点
- [[lottery-ticket-2019]] —— 彩票假设 — 大网里藏着一张能独立训出来的小网
