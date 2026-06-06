---
title: SparseGPT — 175B 大模型一次过剪 50%，不重训
来源: 'Frantar & Alistarh, "SparseGPT: Massive Language Models Can Be Accurately Pruned in One-Shot", ICML 2023 (arXiv 2301.00774)'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**SparseGPT** 是一种**后训练剪枝**方法：拿一个已经训好的大模型（比如 OPT-175B、BLOOM-176B），在**不重训**的前提下，**一次性**砍掉 50% 的权重，精度几乎不掉。

日常类比：像装修师傅给别人盖好的房子拆 50% 的墙——不能动地基（不重训）、不能让房子塌（精度不能崩）、还得一天搞完（4 小时一张 A100）。

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

意思是"找一个稀疏版 `W'`，让它对校准数据 X 的输出尽量接近原 W 的输出"。

直接解这个问题是 NP-hard。SparseGPT 的近似算法分四步：

1. **算 Hessian**：从校准数据 X 算 `H = 2·X·Xᵀ + λI`，再算 `H⁻¹`。这是 **OBS（Optimal Brain Surgeon, Hassibi 1993）** 的二阶信息。
2. **Cholesky 一次性铺好**：把 `H⁻¹` 做 Cholesky 分解，数值稳定 + 后面用整个序列。
3. **逐列处理（核心 trick）**：W 的所有行**共享同一列顺序**，从左到右、按 B=128 列分块走。每块内：
    - 决定 mask：哪些权重剪？按 `|w_ij| / [H⁻¹]_ii` 排序
    - **OBS 补偿**：剩余权重做闭式更新，吸收被剪权重造成的误差
    - **传播误差**：把残差推到后续列
4. **Adaptive mask**：mask 在每块内自适应选择，不是全局一刀切，精度更高。

第 3 步是真正的工程关键。理想情况每行 W 应该有自己的 `H⁻¹`，但太贵；让所有行共享同一列顺序，是把"行间独立"换成了"工程可行性"。

## 实践案例

### 案例 1：50% 稀疏 OPT-175B 几乎不掉点

```
模型              WikiText2 PPL    C4 PPL
OPT-175B 原版     8.34            10.12
SparseGPT 50%     8.21            10.08    ← 几乎一样
SparseGPT 2:4     8.74            10.85    ← 半结构化稍掉
Magnitude 50%     ~1e4            ~1e4     ← 直接崩
```

只看权重大小（magnitude）剪，175B 直接 perplexity 爆炸；用 OBS 补偿就保住了。

### 案例 2：2:4 稀疏喂 Ampere 稀疏 Tensor Core

NVIDIA A100 / H100 的稀疏 Tensor Core 要求 **2:4 模式**——每 4 个连续权重里**恰好 2 个是 0**。这个约束很硬。SparseGPT 直接把 2:4 当成 mask 形状约束塞进算法第 3 步，硬件可直接跑 2× 加速的稀疏矩乘。

参见 [[ampere-architecture-2020]]——A100 的稀疏 Tensor Core 是为这类方法准备的硬件入口。

### 案例 3：和 GPTQ 组合（同作者，2023）

GPTQ（[[awq]] 路线对照组）和 SparseGPT **同作者、同框架**：都用 OBS、都用 Cholesky、都按列分块走。区别只是目标——GPTQ 是量化（让权重落在 4-bit 网格），SparseGPT 是剪枝（让权重变 0）。两个可以叠加：先 SparseGPT 剪 50%，再 GPTQ 量化到 4-bit，模型体积压到 1/16。

### 案例 4：为什么"逐层"而不是"全局"

SparseGPT 不解全模型联合优化，而是**一层一层独立处理**。原因：

- 全模型联合是 NP-hard 的超大规模问题，175B 没法直接解
- 逐层只要求每层"输入 → 输出"映射近似保持，是个**凸**的二次规划
- 错误会顺着层堆积，但实测 50% 稀疏度下堆积可控

这个"分而治之"是大模型压缩工具的共识——GPTQ、AWQ、SmoothQuant 都按层走。

## 踩过的坑

1. **校准数据分布偏移**：用 C4 校准、部署到中文场景，掉点会比想象多。换校准集就好。
2. **非结构化稀疏在 GPU 上没加速**：50% 非结构化在 cuBLAS / CUTLASS 默认 kernel 上**和密集一样慢**——节省的只是显存。要硬件加速必须 2:4。
3. **OBS 近似在 70%+ 稀疏度站不住**：SparseGPT 在 50% 是甜点，60% 还行，70% 起 perplexity 明显恶化。极端稀疏要走别的路（如 Magnitude + 重训）。
4. **Hessian 内存别踩**：175B 模型每层 H 矩阵几个 GB，要么分块算、要么 offload 到 CPU，论文实现是按行块算 H 的。
5. **Cholesky 失败要加阻尼**：H 接近奇异时 Cholesky 直接 NaN。论文里 λ 设到 `0.01·mean(diag(H))` 才稳。

## 适用 vs 不适用场景

**适用**：

- 已训好的大模型（10B+）做离线压缩，不能重训
- 需要喂 NVIDIA 稀疏 Tensor Core（2:4 / 4:8）
- 和量化叠加做极致压缩（SparseGPT + GPTQ）
- 长尾验证：模型已部署、想压一档省成本

**不适用**：

- 模型还在训：边训边稀疏（如 RigL）效果更好
- 70%+ 极端稀疏度：精度掉太多
- 校准数据极少 / 分布和部署差很远：精度不可控
- 推理框架不支持稀疏内核：相当于只省显存不省算力

## 历史小故事（可跳过）

- **1989 年**：Yann LeCun 提出 **Optimal Brain Damage**，用一阶 + 对角 Hessian 决定剪哪个权重。
- **1993 年**：Hassibi & Stork 提出 **OBS（Optimal Brain Surgeon）**——用完整 Hessian 而非对角，给出剪枝 + 剩余权重补偿的闭式解。论文里只在小网络上玩。
- **2015 年**：Han 等人 **Deep Compression** 把 magnitude pruning + 重训组合成工业方案，但需要重训。
- **2022 年**：Frantar & Alistarh 在 **GPTQ** 论文里把 OBS 用在量化上、配合 Cholesky 分解 + 列分块——证明 OBS 思路在大模型规模可行。
- **2023 年 1 月**：同两人把 GPTQ 框架拿来做剪枝，就是 SparseGPT。论文 30 页、ICML 2023 接收。
- **2023 年中**：**Wanda**（Sun et al）发现可以省掉 OBS 补偿，只看 `|w| · ||x||` 也能 work——SparseGPT 的精简版。

OBS 这个 30 年前的算法，在 GPU 时代被翻出来变成大模型压缩的主力，是经典理论被新硬件复活的典型故事。

类似的复活在系统领域反复发生：90 年代的二阶优化在大模型时代变成压缩工具，60 年代的 Cholesky 分解突然成为关键路径。冷板凳算法等的就是合适的硬件和数据规模。

## 学到什么

1. **后训练压缩可行**——有 OBS 这种闭式补偿，剪枝不一定要重训。但前提是有好的二阶信息。
2. **行间共享列顺序是工程胜利**——理论最优是每行独立，但工程可行性更重要。共享 + Cholesky 分解把 175B 跑进 4 小时。
3. **半结构化稀疏才是硬件友好**——非结构化稀疏在通用 GPU 上没加速。Ampere 的 2:4 是软硬件协同的产物。
4. **越大越好剪**——大模型冗余更多。50% 稀疏在 175B 比在 1.3B 容易。这给"先大后压"的部署路径提供了合法性。

## 延伸阅读

- 论文 PDF：[arXiv 2301.00774](https://arxiv.org/abs/2301.00774)（30 页，但前 8 页讲清核心）
- 代码仓库：作者所在实验室 DASLab 的 GitHub `sparsegpt` 项目（PyTorch，单文件能读）
- 同作者 GPTQ：[arXiv 2210.17323](https://arxiv.org/abs/2210.17323)——量化版，框架完全一样
- 后续 Wanda：[arXiv 2306.11695](https://arxiv.org/abs/2306.11695)——SparseGPT 简化版，一行式 metric
- [[awq]] —— 另一条后训练量化路线（激活感知）
- [[ampere-architecture-2020]] —— Ampere 稀疏 Tensor Core 的硬件入口

## 关联

- [[awq]] —— 同期后训练量化路线，和 SparseGPT 一起构成 LLM 后训练压缩工具集
- [[ampere-architecture-2020]] —— 2:4 稀疏 Tensor Core 是 SparseGPT 这类方法的硬件落地点
- [[attention]] —— SparseGPT 主要剪 attention / FFN 的全连接层
- [[flash-attention]] —— attention 算子优化路线，和稀疏化是两条独立优化轴

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[awq]] —— AWQ — 看激活脸色给权重打折
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gptq-2023]] —— GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点
- [[lottery-ticket-2019]] —— 彩票假设 — 大网里藏着一张能独立训出来的小网

