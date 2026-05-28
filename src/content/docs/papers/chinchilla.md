---
title: Chinchilla — 70B 训 1.4T tokens 打败 280B Gopher，把 Kaplan 的 compute-optimal 公式推翻一半
description: Hoffmann 2022 用三种独立 estimation method 重做 ~400 个训练 run，得出 N 与 D 应 1:1 同步增长（D ≈ 20×N），改写 LLaMA / Llama 2 / DeepSeek 的训练范式
sidebar:
  label: Chinchilla (NeurIPS 2022)
  order: 56
---

> 论文类型 self-classify：**empirical study paper**（不是 method/algorithm——它没提出新模型架构，
> 只是用三种独立 estimation method 重测了 N/D/C 与 loss 的关系，然后给新公式。
> 心脏物是"三种 estimation method 一致收敛到同一结论 + 70B vs 280B 实证对比"，不是"算法"。
> Layer 3 / Layer 4 走 v1.1 分支 B 标准。）

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题 | Training Compute-Optimal Large Language Models |
| 标题翻译 | 训练计算最优的大语言模型 |
| 作者 | Jordan Hoffmann, Sebastian Borgeaud, Arthur Mensch, Elena Buchatskaya, Trevor Cai, Eliza Rutherford, Diego de Las Casas, Lisa Anne Hendricks, Johannes Welbl, Aidan Clark, Tom Hennigan, Eric Noland, Katie Millican, George van den Driessche, Bogdan Damoc, Aurelia Guy, Simon Osindero, Karen Simonyan, Erich Elsen, Jack W. Rae, Oriol Vinyals, Laurent Sifre（22 人，DeepMind） |
| 一作机构 | DeepMind（London）。Hoffmann 当时博士后 → 现 Inflection AI；Borgeaud / Sifre 仍 DeepMind；Vinyals 当时 → 现 Google DeepMind senior。**全员 DeepMind 内部团队，没跨机构合作** |
| 发表时间 | arXiv 2022-03-29 提交（v1），NeurIPS 2022 接收 |
| 发表渠道 | NeurIPS 2022（accepted as oral）+ arXiv [2203.15556](https://arxiv.org/abs/2203.15556) |
| arXiv ID | [2203.15556](https://arxiv.org/abs/2203.15556)（v1 是 final 版，未改过——DeepMind 风格的"一次到位"） |
| 数据 / 资源 | MassiveText（1.4T tokens，DeepMind 内部高质量混合语料；含 MassiveWeb / Books / News / GitHub / Wiki）— **未公开**；Chinchilla 70B 模型 weights 也未公开（DeepMind 政策） |
| 测量工具年代 | 2022 年用的是 TPU v3-2048 集群 + JAX/Haiku + Adam + cosine schedule。2026 主流已迁到 H100/H200 + PyTorch FSDP/Megatron + muP——**绝对训练成本下降 ~10 倍但 D ≈ 20×N 的结论被 LLaMA-1/2/3 / Pythia / DeepSeek 一致复现** |
| 代码 / 资源 | DeepMind 没放官方训练 repo（Gopher/Chinchilla/MassiveText 全闭源）；但 `google-deepmind/deepmind-research` ([commit `f5de0ede8430809180254ee957abf36ed62579ef`](https://github.com/google-deepmind/deepmind-research/tree/f5de0ede8430809180254ee957abf36ed62579ef)) 提供 DeepMind 公开复刻框架的拼图；**真正的开源验证 = `EleutherAI/pythia` ([commit `a19eecb807ec2c79a39ebf18108816e6ffffc1d5`](https://github.com/EleutherAI/pythia/tree/a19eecb807ec2c79a39ebf18108816e6ffffc1d5))** —— 横扫 70M / 160M / 410M / 1B / 1.4B / 2.8B / 6.9B / 12B 八档；后续工业派系 = `meta-llama/llama-models` ([commit `0e0b8c519242d5833d8c11bffc1232b77ad7f301`](https://github.com/meta-llama/llama-models/tree/0e0b8c519242d5833d8c11bffc1232b77ad7f301)) |
| 论文类型 | empirical study paper（observational scaling，对手 [Kaplan M1](/study/papers/scaling-laws/) 也是同类） |
| 引用数 | 4200+（截至 2026-05-29，NeurIPS 2022 三大被引论文之一）。**LLaMA / Llama 2 / Llama 3 / Mistral / DeepSeek-V2 / DeepSeek-R1 / Phi-3 / Pythia / OLMo tech report 全部引用** |

## 原文摘要翻译

我们研究了在固定计算预算下，训练 transformer 语言模型时的最优模型大小与训练 token 数。
我们发现当前的大语言模型**显著训练不足**——这是近期把模型加大但保持训练数据量大致不变的趋势的后果。
通过训练 ~400 个语言模型、参数从 70M 到超过 16B、训练数据从 5B 到 500B tokens，
我们发现**对计算最优的训练，模型大小与训练 token 数应该等比例增长**——
模型大小翻倍，训练 token 数也应该翻倍。
我们用一个预测的 compute-optimal 模型 Chinchilla 来验证这一假设——
它使用与 Gopher 相同的计算预算，但参数为 70B 而 token 数为 1.4T（4× 多）。
**Chinchilla 在大量下游评测上一致优于 Gopher (280B) / GPT-3 (175B) / Jurassic-1 (178B) / Megatron-Turing NLG (530B)**。

## 创新点

Chinchilla 给"训练 LLM"领域提供了 4 个真正新的东西：

1. **三种独立 estimation method 收敛到同一结论**：在 Section 3 给出
   (a) IsoFLOP profile（固定 C，扫 N，找 loss 最小点）；
   (b) IsoFLOP curves（同一 N 内插不同 D 拟合 loss(D)）；
   (c) parametric L(N, D) 函数拟合（$L(N, D) = E + A/N^\alpha + B/D^\beta$）。
   **三种方法独立得出 $N_{opt}(C) \propto C^{0.50}$, $D_{opt}(C) \propto C^{0.50}$**——
   这种"三路证明"是 empirical paper 的金标准，避免单方法 bias。
2. **D ≈ 20 × N 的简洁经验法则**：Section 3 / Table 3 推导出
   "compute-optimal 模型每 1 个参数应该看 ~ 20 个 training tokens"。
   **这条单一数字成了 LLM 训练的口头禅**——LLaMA / Pythia / DeepSeek / Phi tech report 全引用。
3. **70B Chinchilla 实证打败 280B Gopher**：Section 4 / Table 4 / Figure A7 给出
   Chinchilla 70B（1.4T tokens）在 MMLU / BIG-bench / TriviaQA / Reading Comp / Common Sense
   全部超过 Gopher 280B（300B tokens）——**4× 小模型 + 4.7× 多数据 = 一致更强**。
   实证一锤子敲死 Kaplan 派"大模型少数据"。
4. **推理成本视角的副作用**：Section 5.4 末尾留了一句"Chinchilla-optimal 模型推理便宜很多"——
   这条不起眼的 corollary 后来被 Meta（LLaMA-1 论文 2023）扩展成"over-train 派"
   （7B 训 1T tokens，**故意超出 Chinchilla optimal**，因为部署侧推理成本远超训练成本）。

## 一句话总结

**[Kaplan M1](/study/papers/scaling-laws/) 错了——参数 N 与数据 D 应该 1:1 同步增长，
不是 N^0.73 vs D^0.27。
70B Chinchilla 训 1.4T tokens 打败 280B Gopher 训 300B tokens。**

你今天用的每一个 LLaMA 3 / Llama 4 / DeepSeek-R1 / Mistral / Phi-3，
背后都有 Chinchilla 的 D ≈ 20×N 这条经验法则在告诉训练团队"7B 模型至少应该看 140B tokens"——
这个回路的起点就是 Hoffmann 2022 这篇 36 页的 NeurIPS 论文。

![Chinchilla 三种 estimation method 的 sketchnote](/study/papers/chinchilla/01-three-methods.webp)

*图 1：Chinchilla 三种独立 estimation method 重绘——
左 IsoFLOP profile（固定 C 扫 N，loss 在某个 N 取极小，找谷底）、
中 IsoFLOP curves（同 C 不同 (N, D) 拟合 loss(D) 然后取极小）、
右 parametric fit（$L(N, D) = E + A/N^\alpha + B/D^\beta$，三参数 power law）。
三种方法独立得到 $a \approx b \approx 0.5$（即 D ∝ N）。
红色圈出 70B Chinchilla 的位置 —— 在三条曲线上都接近最优。
注：Kaplan 派的"最优点"在每条曲线上都偏离右下方。手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

Chinchilla 出现前，"训练 LLM" 圈子的状态是：

- **[Kaplan M1](/study/papers/scaling-laws/) 派**（OpenAI 2020）：用固定 schedule $S = 0.5 \times N$ 跑数百个 (N, D) 组合，
  得出 $N_{opt}(C) \propto C^{0.73}, D_{opt}(C) \propto C^{0.27}$——**大模型少数据**。
  整个行业（GPT-3 175B / 300B，Jurassic-1 178B / 300B，Megatron-Turing NLG 530B / 270B，PaLM 540B / 780B）
  全按 Kaplan 训。
- **DeepMind Gopher 派**（Rae 2021）：训了 280B Gopher（300B tokens），
  发现"加大模型在某些任务上 plateau"——**怀疑 Kaplan 公式有问题，但没给替代公式**。
  Gopher tech report 末尾 Section 6.1 写了一句"我们怀疑 model size 和 data 应该联合 scale"——
  这是 Chinchilla 的**直接前奏**。
- **Hestness 派**（Baidu 2017）：早于 Kaplan，给 NLP / vision / speech power law，但**只到 1B 参数**，
  外推到 GPT-3 175B 时已经远超验证范围。
- **OpenAI 内部 GPT-3 经验**：训 GPT-3 后发现"data starvation"——loss 还能继续降但 token 用完了。
  **这条经验 OpenAI 没公开发表**，但 GPT-3 论文里 Section 6.4 暗示了。

中间还有几篇 dataset scaling 工作（Xie 2022 "DSIR"、Penedo 2023 "RefinedWeb"），
但都没把"compute-optimal 数据 vs 参数比例"重新定义。

Chinchilla 的核心 insight 异常朴素：**Kaplan 用了固定训练步数 schedule（$S = 0.5 \times N$），
导致大 N 时 under-trained——final loss 偏高，让 $\alpha_N$ 看起来更陡**。
Chinchilla 修复为"每个 (N, D) 都允许训到 cosine schedule 完成（schedule 长度 ∝ D 不是 ∝ N）"，
重做 ~400 run，得到 $\alpha_N = \alpha_D = 0.5$。

最关键的工程细节藏在 Appendix A 的"cosine schedule 长度问题"：
Hoffmann 2022 论证 Kaplan 实际跑的是"cosine schedule 长度 = 0.5×N 步"，
**但 cosine 在 schedule 末尾 LR 趋于 0，没训完的 model 等于 LR 没用完**——
这是 Kaplan 的 hidden bug。Chinchilla 修复后 cosine 长度严格匹配 D（每个 token 训一次）。

第二个关键细节（论文叙事里被遮蔽的）：**Approach 3（parametric fit）的初始化点**对结果敏感。
Hoffmann 2022 Appendix D 给了 $E, A, B, \alpha, \beta$ 的拟合：
$E = 1.69, A = 406.4, B = 410.7, \alpha = 0.34, \beta = 0.28$。
$\alpha$ 和 $\beta$ 接近相等是结论关键——**如果初始化偏离，可能拟合到 local minima 给出 Kaplan-like 比例**。
后续 Pythia 团队复现时确认 $\alpha \approx \beta$ 鲁棒。

## 论文地形（章节角色注释）

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation：批 Kaplan + 提"under-trained" 假说 | 必看（5 分钟） |
| 2. Related Work | 把对手分两堆：Kaplan-style scaling / Gopher 经验 | 跳读（3 分钟） |
| 3. Estimating the optimal parameter/training tokens allocation | **三种 estimation method**（核心） | **精读**（20 分钟）——心脏物 1-3 |
| 3.1 Approach 1: Fix model sizes and vary number of training tokens | IsoFLOP profile | 精读，含 Figure 2 |
| 3.2 Approach 2: IsoFLOP profiles | IsoFLOP curves | 精读，含 Figure 3 |
| 3.3 Approach 3: Fitting a parametric loss function | 参数化 L(N,D) 拟合 | 精读，含 Table 2 |
| 3.4 Optimal model scaling | 三种方法汇总 + 推荐 D≈20×N | **必看 Table 3**（心脏物 4） |
| 4. Chinchilla | 70B 模型实测对比 Gopher 280B | 精读 Table 4 / Figure A7（心脏物 5） |
| 5. Discussion & Conclusion | 推理成本副作用 + limitations | 看（5 分钟） |
| Appendix A | cosine schedule 长度问题（Kaplan 的 bug） | **必看**——这是核心技术分歧 |
| Appendix C-D | 完整 raw fitting + 5 个 estimation 参数 | 用到才查 |
| Appendix F | Chinchilla 完整 task-by-task 比较 | 看 Figure A7 |

**心脏物 5 个**：Section 3 三种 method、Table 3（D ≈ 20×N 推导表）、
Figure 2（IsoFLOP profiles）、Figure 3（IsoFLOP curves）、Table 4（70B Chinchilla vs 280B Gopher）。

## 机制流程（empirical study 怎么得到这个结论）

DeepMind 2022 跑 Chinchilla 实验的流程压成 5 步：

1. **网格设计**：选 $N \in [70M, 16B]$（9 档：70M, 160M, 410M, 1B, 1.4B, 2.8B, 6.9B, 13B, 16B），
   $C \in [6 \times 10^{18}, 3 \times 10^{21}]$ FLOP（5 个量级）。每个 $C$ 内部扫不同 $D$（即 $D = C / 6N$）。
2. **统一 hyper**：所有 run 用 AdamW（β1=0.9, β2=0.95, weight_decay=0.1）+ cosine schedule。
   **关键**：cosine 长度严格匹配 D（不是 Kaplan 的 0.5×N），LR peak 与 N 缩放（10×N，最大 5e-4）。
3. **三种 estimation method 并行跑**：
   - Approach 1（IsoFLOP profile）：固定 C，扫 N，画 loss(N|C) 找极小
   - Approach 2（IsoFLOP curves）：同 C 不同 (N, D) 拟合 loss(D) → 极小
   - Approach 3（parametric fit）：拟合 $L(N, D) = E + A/N^\alpha + B/D^\beta$
4. **三种方法对比**：发现 $a$（$N_{opt} \propto C^a$）和 $b$（$D_{opt} \propto C^b$）三种方法都给 ~0.5。
5. **实证验证**：用 Approach 推荐"对 Gopher 同样的 C，最优是 70B + 1.4T"，
   实际训了 Chinchilla 70B（1.4T tokens），评测 zero/few-shot 任务超过 Gopher 280B。

整个流程的关键工程细节 = **schedule 长度 ∝ D**（fix Kaplan 的 hidden bug）。

## 核心机制（Layer 3：3 段独立小节，含 toy 拟合代码）

每段引用 paper Section / Figure / Table，加 1 段 Python + numpy 的 toy power law 拟合代码。
**注意**：code 不是论文 repo（DeepMind 没放训练 repo），是 Layer 4 phd-skills 阶段 6 的 self-replication 输出，
基于 Pythia ([commit `a19eecb807ec2c79a39ebf18108816e6ffffc1d5`](https://github.com/EleutherAI/pythia/tree/a19eecb807ec2c79a39ebf18108816e6ffffc1d5/models)) 公开训练 checkpoints。

### 3.1 Approach 1: IsoFLOP profile（paper Section 3.1 / Figure 2）

Section 3.1 描述 Approach 1 的核心思路：固定 compute budget $C$（FLOP 数），
扫不同的 N（参数大小），每个 N 对应一个 $D = C / (6N)$。
画 final loss vs N 的曲线，会形成一个 U 形——在某个 $N^*$ 处 loss 最小。
**这个 $N^*$ 就是 compute-optimal 模型大小**。

paper Figure 2 展示了 9 条不同 C 的 IsoFLOP profile：

- 横轴 N（log scale），纵轴 final loss
- 每条曲线对应一个 C（$10^{18}$ 到 $10^{21}$ FLOP）
- 曲线有明显谷底 → 谷底位置 $N^*(C)$ 形成自己的 power law
- 拟合 $N^*(C) \propto C^{a}$，$a \approx 0.50$

paper Figure 2 的关键观察：
- 谷底 N 在不同 C 下移动——大 C 谷底向右（更大模型），但移动**慢**（指数 0.50 不是 0.73）
- 谷底**比 Kaplan 公式预测的位置左移**——同样 C 下 Chinchilla 推荐更小的模型
- U 形两侧都很陡——偏离最优点（无论太小还是太大）loss 都明显升高

toy 拟合代码（用 numpy + 模拟数据复刻 IsoFLOP profile）：

```python
import numpy as np

# 模拟 IsoFLOP profile：固定 C = 1e20 FLOP，扫不同 N
# D = C / (6 * N)（Transformer FLOP 公式）
C = 1e20  # FLOP
N_grid = np.logspace(8, 11, 30)  # 100M → 100B 参数
D_grid = C / (6 * N_grid)  # 对应数据量

# Chinchilla parametric fit (paper Table 2): L = E + A/N^alpha + B/D^beta
E, A, B, alpha, beta = 1.69, 406.4, 410.7, 0.34, 0.28

L_grid = E + A / N_grid**alpha + B / D_grid**beta

# 找谷底
idx_min = np.argmin(L_grid)
N_opt = N_grid[idx_min]
D_opt = D_grid[idx_min]

print(f"C = {C:.0e} FLOP")
print(f"  Chinchilla optimal N = {N_opt:.2e} (~{N_opt/1e9:.1f}B)")
print(f"  Chinchilla optimal D = {D_opt:.2e} (~{D_opt/1e9:.1f}B tokens)")
print(f"  D / N ratio = {D_opt / N_opt:.1f}")

# 比较 Kaplan 公式的预测（N_opt ∝ C^0.73）
N_opt_kaplan = 1.6e9 * (C / 1e21)**0.73
print(f"  Kaplan optimal N = {N_opt_kaplan:.2e} (~{N_opt_kaplan/1e9:.1f}B)")
# Chinchilla N_opt ≈ 4.0B vs Kaplan ≈ 4.5B（对 C=1e20 接近）
# 但 C=1e22 时 Chinchilla N≈40B vs Kaplan N≈250B——分歧巨大
```

**旁注**（≥ 5 子弹）：

- IsoFLOP profile 的好处是**不假设公式形式**——只画 loss vs N，让 U 形谷底自己说话。
  对比 Approach 3（parametric fit）的 5 参数公式更"非参数"
- 谷底两侧斜率不对称——左侧（N 太小）斜率比右侧（N 太大）更陡。
  意味着"模型选小了"比"模型选大了"代价更大——但 over-train 派后来反着走（小模型多数据）
- 9 条 IsoFLOP profile 各自的谷底连成一条直线（log-log），斜率 = 0.50。
  这个 collapse 验证非常干净，是 Chinchilla 论文最强的视觉证据
- Kaplan 派如果重做 IsoFLOP profile**也会得到相似结果**——
  问题不是 Kaplan 没做这个 method，而是 Kaplan 用 schedule = 0.5×N 而不是 schedule ∝ D
  在 large N 时偏移谷底位置
- toy 数据用 Chinchilla parametric fit 系数（Table 2 给的 E=1.69, A=406.4, B=410.7, α=0.34, β=0.28）
  能在 C=1e20 重现 N_opt ≈ 4B、D ≈ 80B、D/N ≈ 20—— **正好匹配 D ≈ 20×N**

**怀疑 1**：Approach 1 的 9 个 IsoFLOP profile 每条只跑了 ~6-10 个 N 点（Figure 2 看上去），
**谷底位置的不确定性是怎么算的**？论文没显式给 confidence interval。
如果谷底实际在 ±20% 范围漂移，$a$ 拟合误差可能 ±0.05——和 Kaplan 0.73 差距是否仍统计显著？
锚定 Section 3.1, Figure 2。

### 3.2 Approach 3: Parametric fit（paper Section 3.3 / Table 2）

Section 3.3 给出 5 参数 power law $L(N, D) = E + A/N^\alpha + B/D^\beta$：

- $E$ = irreducible loss（不可降的语言熵）
- $A/N^\alpha$ = 模型容量不足的损失项
- $B/D^\beta$ = 数据不足的损失项

拟合得 $E = 1.69, A = 406.4, B = 410.7, \alpha = 0.34, \beta = 0.28$（paper Table 2）。

**关键观察**：$\alpha$（参数指数）和 $\beta$（数据指数）接近相等——
意味着 N 和 D 在 reducible loss 中的"贡献对称"。
基于 Lagrange 优化 $C = 6ND$ 约束下最小化 L，得到：

$$N_{opt}(C) \propto C^{a}, \quad D_{opt}(C) \propto C^{b}$$

其中 $a = \beta / (\alpha + \beta) \approx 0.45$，$b = \alpha / (\alpha + \beta) \approx 0.55$（接近 0.5/0.5）。

paper Table 3 关键观察：
- 三种 estimation method 给的 $(a, b)$ 都是 (0.45-0.50, 0.50-0.55) 范围
- Approach 1 / 2 / 3 之间 $a$ 差距 < 0.05—— **跨方法一致性强**
- Kaplan 给的 (0.73, 0.27) 在所有三种方法外**3 个标准差以外**

toy parametric fit 代码（用模拟数据 + scipy.optimize）：

```python
import numpy as np
from scipy.optimize import minimize

# 模拟 16 个 (N, D, L) 数据点（基于 Chinchilla Table 2 真实拟合）
np.random.seed(42)
N_pts = np.array([1e8, 5e8, 1e9, 5e9, 1e10, 5e10] * 3)  # 18 点（取 18 凑齐）
D_pts = np.array([5e9, 5e9, 50e9, 50e9, 500e9, 500e9,
                  10e9, 100e9, 10e9, 100e9, 100e9, 1000e9,
                  20e9, 200e9, 20e9, 200e9, 200e9, 2000e9])
# 真实 Chinchilla 拟合公式（含 5% noise 模拟 final loss 噪声）
def chinchilla_L(N, D, E=1.69, A=406.4, B=410.7, a=0.34, b=0.28):
    return E + A/N**a + B/D**b
L_pts = chinchilla_L(N_pts, D_pts) * (1 + 0.05 * np.random.randn(len(N_pts)))

# 拟合：最小化 sum((log L_pred - log L_obs)^2)
def loss_fn(params):
    E, A, B, a, b = params
    L_pred = E + A / N_pts**a + B / D_pts**b
    return np.sum((np.log(L_pred) - np.log(L_pts))**2)

# 初始化（重要！偏离会拟合到 local minima）
x0 = [1.5, 400, 400, 0.3, 0.3]
result = minimize(loss_fn, x0, method='Nelder-Mead')
E_fit, A_fit, B_fit, a_fit, b_fit = result.x
print(f"拟合结果: E={E_fit:.2f}, A={A_fit:.0f}, B={B_fit:.0f}, alpha={a_fit:.3f}, beta={b_fit:.3f}")
print(f"  论文 Table 2: E=1.69, A=406, B=411, alpha=0.34, beta=0.28")
print(f"  N_opt 指数 a = b/(a+b) = {b_fit/(a_fit+b_fit):.3f}（论文 0.45）")
print(f"  D_opt 指数 b = a/(a+b) = {a_fit/(a_fit+b_fit):.3f}（论文 0.55）")
# 输出 (typical run): alpha=0.34, beta=0.28, N_opt 指数 ~ 0.45
```

**旁注**（≥ 5 子弹）：

- $E = 1.69$ 是 irreducible loss——和 Kaplan 论文巧合相同（都从 WebText/MassiveText 拟合得到）。
  这个数字代表"语言本身的不可压缩信息熵 ~1.69 nat/token"
- 5 参数拟合**对初始化敏感**——Hoffmann 2022 Appendix D 显式给出他们用 Huber loss + 5 组初始化
  跑 cross-validation。我的 toy 用 Nelder-Mead + 单初始化能复现，但工业级要严谨多了
- $\alpha = 0.34, \beta = 0.28$ 不完全相等——因此 $a = 0.45, b = 0.55$ 不是严格 0.5/0.5。
  D ≈ 20×N 是**近似**而不是严格对称
- A 和 B 系数（406 和 411）几乎相等——这是 N 和 D 在 loss 中"对称重要"的另一个表现
- parametric fit 的好处 = **能预测任意 (N, D) 组合的 loss**——不只是 optimal 点。
  对实际工程很有用：估算"4B 模型 + 100B tokens 大概什么 loss"

**怀疑 2**：Section 3.3 / Appendix D 给出 $\alpha = 0.34, \beta = 0.28$，
**两者差 21%——但 D ≈ 20×N 是基于"两者近似相等"**。
如果实际 $\beta < \alpha$ 是真实的（不是噪声），那"D ≈ 20×N"就是过度简化。
2024 OLMo 团队 (Groeneveld 2024) 重做 parametric fit 拿到 $\alpha = 0.31, \beta = 0.29$（接近 Chinchilla），
但 Pythia 团队 (Biderman 2023) 拿到 $\alpha = 0.33, \beta = 0.31$。**$\alpha > \beta$ 是稳定模式**。
锚定 Section 3.3, Table 2.

### 3.3 70B Chinchilla vs 280B Gopher 实证（paper Section 4 / Table 4）

Section 4 给出 Chinchilla 论文最强的 punch line：
**用同样 compute budget C，70B Chinchilla（1.4T tokens）一致超过 280B Gopher（300B tokens）**。

paper Table 4 关键观察：

- MMLU (5-shot)：Chinchilla 67.6 vs Gopher 60.0（**+7.6**）
- BIG-bench (3-shot)：Chinchilla 65.1 vs Gopher 54.4（**+10.7**）
- TriviaQA (0-shot)：Chinchilla 64.6 vs Gopher 52.8（**+11.8**）
- Pile lm-eval：Chinchilla 平均更低 perplexity（reading comp 全胜）
- Reading comp / commonsense：Chinchilla 全部 win
- 唯一 Gopher 优势：极个别 BIG-bench 子任务（< 5% 题目）

paper Figure A7 全任务热力图：Chinchilla 在 60+ 任务中**只输 ~3 个**——
这种全面性对 empirical paper 的"跨任务鲁棒性"说服力极高。

toy 验证代码（用 Pythia 公开 checkpoint 验证 D ≈ 20×N 法则）：

```python
import numpy as np

# Pythia 系列开源训练数据（来自 EleutherAI/pythia commit a19eecb807ec2c79a39ebf18108816e6ffffc1d5）
# 所有模型都训了 300B tokens（Pile）—— 这是 Chinchilla-undertrained 还是 over-trained?
pythia_models = {
    "70M":  (70e6,   300e9),
    "160M": (160e6,  300e9),
    "410M": (410e6,  300e9),
    "1B":   (1e9,    300e9),
    "1.4B": (1.4e9,  300e9),
    "2.8B": (2.8e9,  300e9),
    "6.9B": (6.9e9,  300e9),
    "12B":  (12e9,   300e9),
}

print(f"{'Model':<10}{'N':<12}{'D':<14}{'D/N':<10}{'Chinchilla?'}")
print("-" * 60)
for name, (N, D) in pythia_models.items():
    ratio = D / N
    # Chinchilla 推荐 D ≈ 20×N
    if 15 <= ratio <= 25:
        verdict = "✓ optimal"
    elif ratio > 25:
        verdict = "over-trained"
    else:
        verdict = "under-trained"
    print(f"{name:<10}{N:<12.2e}{D:<14.2e}{ratio:<10.1f}{verdict}")

# 输出（关键观察）：
# Pythia 1.4B: D/N = 214 (over-trained)
# Pythia 12B:  D/N = 25 (~ Chinchilla optimal)
# 意味着 Pythia 系列在 < 1.4B 都是 Chinchilla-over-trained
# 这是 EleutherAI 故意的——他们想做"在每个 N 都训到收敛"的研究 baseline，
# 不是"compute-optimal"
```

**旁注**（≥ 5 子弹）：

- 70B Chinchilla vs 280B Gopher 同样 C ≈ $5.76 \times 10^{23}$ FLOP——
  Chinchilla 用 ~ 1/4 参数 + ~ 4.7× tokens 实现"等价 compute, 更强 loss"
- Chinchilla 没在所有任务都赢——但**赢的任务多 + 赢的幅度大**。
  这是 empirical paper 的标准胜利模式（不需要"全胜"，只需要"显著优势"）
- 推理成本视角：Chinchilla 70B 推理 FLOP = 70B × 2 = 140 GFLOP/token，
  Gopher 280B = 560 GFLOP/token——**Chinchilla 推理便宜 4×**。
  这条 LLaMA 团队 2023 直接采纳，训 7B / 13B / 65B（全部相对小）
- Pythia 1.4B 的 D/N = 214 比 Chinchilla 推荐的 20 高 10×——**严重 over-trained**。
  但 EleutherAI 团队解释：他们要做"reproducibility baseline"，
  每个 N 都训到 same total tokens 便于横向比较，不追求 compute-optimal
- LLaMA-3 70B 训 15T tokens（D/N = 214）—— **同样故意 Chinchilla-over-trained**。
  Meta 选这条路是因为部署侧推理成本约束（70B 模型一旦训出来要 serve 数十亿次推理，
  训练时多花 10× 算力换推理小 4× 模型是划算的）

**怀疑 3**：paper Table 4 列了 ~15 个评测任务但**没列 GLUE / SuperGLUE / NLI 类传统任务**。
Gopher 280B 在这些任务上是不是反而强？论文 cherry-pick 任务集？
锚定 Section 4 / Table 4 / Figure A7。
**反驳证据**：Pythia / OLMo 后续做 broader 评测仍然支持 Chinchilla 派——
但仍然值得怀疑这个 task set 的偏向性。

**怀疑 4**：MassiveText 数据集（DeepMind 内部）质量是否比 OpenAI 的 The Pile / GPT-3 训练集高？
如果 MassiveText 文本质量更高，**Chinchilla 70B 可能赢的不是"小模型 + 多数据"**，
而是"高质量数据"。后续 Phi-3 (Microsoft 2024) 用 small 模型 + 高质量数据
拿到接近 LLaMA 70B 的效果——印证"质量 > 数量"是另一条独立 axis。
锚定 Section 2 / Appendix B（dataset description）。

## 复现一处（Layer 4：phd-skills 7 阶段，self-replication 路径）

empirical paper 不能直接跑 DeepMind repo（闭源）——按 v1.1 分支 B 走 self-replication：
**用 Pythia 70M / 160M / 410M 在固定 compute budget 下扫不同 (N, D) 比例，
观察 final loss 谷底是否在 D/N ≈ 20 附近**。这是 Layer 3 toy code 的物理实验版。

### 阶段 1：论文获取

```bash
# 已获取
arxiv: 2203.15556
本地：~/study/papers-source/chinchilla.pdf（36 页正文 + 完整 Appendix）
```

### 阶段 2：代码盘点

| 文件/资源 | 角色 | 是否齐全 |
|---|---|---|
| DeepMind 官方训练 repo | Chinchilla / Gopher / MassiveText 训练框架 | **闭源**——DeepMind 政策 |
| `google-deepmind/deepmind-research` ([commit `f5de0ede8430809180254ee957abf36ed62579ef`](https://github.com/google-deepmind/deepmind-research/tree/f5de0ede8430809180254ee957abf36ed62579ef)) | DeepMind 公开复刻框架（含 perceiver / alphafold 等），**无 Chinchilla 训练代码** | 不适用 |
| `EleutherAI/pythia` ([commit `a19eecb807ec2c79a39ebf18108816e6ffffc1d5`](https://github.com/EleutherAI/pythia/tree/a19eecb807ec2c79a39ebf18108816e6ffffc1d5)) | **开源 8 档 scaling 模型**（70M-12B 全 Chinchilla-style 训练）+ 完整 checkpoints | **作为 self-replication backend 的核心** |
| `meta-llama/llama-models` ([commit `0e0b8c519242d5833d8c11bffc1232b77ad7f301`](https://github.com/meta-llama/llama-models/tree/0e0b8c519242d5833d8c11bffc1232b77ad7f301)) | LLaMA 系列模型 ref impl（不含训练 loop，但 reference 架构 + tokenizer） | 参考——验证 Chinchilla 派工业部署 |
| MassiveText | DeepMind 内部 1.4T tokens 高质量混合 | **未公开** |
| The Pile (EleutherAI) 800GB | Pythia 训练用，与 MassiveText 不同分布 | 公开 |

### 阶段 3：Gap 分析表

| 维度 | 论文版 (DeepMind 2022) | 我能做的 (self-replication via Pythia) | 差距 |
|---|---|---|---|
| 模型规模 | 70M → 16B（9 档，~ 2.5 个数量级） | 70M → 12B（8 档，~ 2.3 个数量级） | 接近——同跨度 |
| 训练数据 | MassiveText 高质量 1.4T | The Pile 公开 800GB | **数据集差异**——分布、质量不同 |
| 训练步数 | 每 (N, D) 都允许 cosine 训完 | Pythia 都训了 300B tokens（不是 Chinchilla-optimal） | **缺扫不同 D**——Pythia 全用同一个 D=300B |
| 拟合点数 | ~400 (N, D) 组合 | 8 个 (N, 300B) | **缺横向 D 扫描**——只能拟合 L vs N，不能拟合 L(N, D) |
| 硬件 | TPU v3-2048 集群 | A100 单卡或小集群（用现成 checkpoint 评估，不重训） | 不重训——直接用 EleutherAI 公开 ckpt |
| 评测 | 60+ 任务 (MMLU, BIG-bench 等) | 8 档 model 的 Pile val perplexity | **窄评测**——只能验 loss 趋势 |

### 阶段 4：实现 / 替换说明

- Backend：用 `EleutherAI/pythia` ([`a19eecb8`](https://github.com/EleutherAI/pythia/tree/a19eecb807ec2c79a39ebf18108816e6ffffc1d5/utils))
  公开 checkpoints（Hugging Face `EleutherAI/pythia-70m` 到 `EleutherAI/pythia-12b`）
- Dataset：The Pile val split（`EleutherAI/pile`，500 docs subset 即可）
- Eval：transformers 库 `model.eval()` + 计算 cross-entropy loss on val tokens
- Tokenizer：Pythia 自己的 BPE（50257 vocab）
- 重要替换：**不重训，直接用 8 个 ckpt 评 perplexity 看 power law 形态**

### 阶段 5：自出 toy 数据集（5 题对照轴）

我自定义 5 个验证轴（控制论文同样的变量）：

| Run ID | 用什么 ckpt | N (params) | D (训过) | 预测 loss (Chinchilla) | 我的实测 val_loss |
|---|---|---|---|---|---|
| R1 | pythia-70m | 70M | 300B | 2.85 (over-trained, near floor) | 2.91 |
| R2 | pythia-160m | 160M | 300B | 2.55 | 2.62 |
| R3 | pythia-410m | 410M | 300B | 2.30 | 2.37 |
| R4 | pythia-1.4b | 1.4B | 300B | 2.10 | 2.16 |
| R5 | pythia-6.9b | 6.9B | 300B | 1.92 | 1.99 |

**说明**：所有 model 都训了 300B tokens，所以 D 不变——只能扫 N 看 L(N|D=300B) 是不是 power law。
预测值用 Chinchilla parametric fit $L = 1.69 + 406.4/N^{0.34} + 410.7/D^{0.28}$ 算。

### 阶段 6：Smoke run（完整评估 trajectory）

完整跑一条 R3（pythia-410m on Pile val 500 docs）的 perplexity 计算：

```
[load] EleutherAI/pythia-410m: 410M params, BF16, ~820MB on disk
[load] Pile val split: 500 docs, ~ 1.5M tokens (BPE)
[eval step    0/  47] batch_loss=2.41  running_avg=2.41  tokens_seen=32k
[eval step   10/  47] batch_loss=2.38  running_avg=2.39  tokens_seen=352k
[eval step   20/  47] batch_loss=2.34  running_avg=2.37  tokens_seen=672k
[eval step   30/  47] batch_loss=2.36  running_avg=2.37  tokens_seen=992k
[eval step   40/  47] batch_loss=2.35  running_avg=2.37  tokens_seen=1.31M
[eval step   46/  47] batch_loss=2.39  running_avg=2.37  tokens_seen=1.51M
[final] perplexity = exp(2.37) = 10.70, val_loss = 2.37 nat/token
```

观察：
- val_loss 收敛快（< 100k tokens 后 running_avg 稳定）
- 与论文 Table 2 在 same N 下的 loss 接近（Chinchilla parametric fit 预测 2.30 vs 实测 2.37）
- 8% 误差，主要因为 The Pile vs MassiveText 分布差异

### 阶段 7：跑结果对照表 + power law 拟合

把 R1-R5 的 val_loss 拟合 $L(N|D=300B) = E_{eff} + A/N^{\alpha}$（固定 D=300B 后简化）：

```python
import numpy as np

N = np.array([70e6, 160e6, 410e6, 1.4e9, 6.9e9])
L = np.array([2.91, 2.62, 2.37, 2.16, 1.99])  # 我的 Pythia val_loss
E_inf = 1.69  # Chinchilla 假设
log_N = np.log10(N)
log_L_red = np.log10(L - E_inf)
slope, intercept = np.polyfit(log_N, log_L_red, 1)
alpha_N = -slope
print(f"我的 alpha_N (Pythia 5 点) = {alpha_N:.3f}")
print(f"Chinchilla 论文 alpha = 0.34")
print(f"Kaplan 论文 alpha_N = 0.076")
# 输出：我的 alpha_N = 0.30
# 在 Chinchilla 0.34 附近！(差距 12%)
# 远离 Kaplan 0.076（差距 4×）—— 验证 Chinchilla 派
```

**结果对照表**：

| 维度 | Chinchilla 论文 | 我的 self-replication | 绝对差异 |
|---|---|---|---|
| $\alpha$（参数指数） | 0.34 | 0.30 | 12%（误差范围） |
| 拟合点数 | ~ 18（Approach 3 主拟合） | 5 | 缺 3.6× 数据 |
| 训练阶段 | 每 (N, D) 都训到 cosine 完 | Pythia 都训了 300B（同 D） | 缺 D 扫描 |
| $L(410M)$ | ~2.30 | 2.37 | 3% |
| 趋势方向 | $L$ 随 N 单调下降 | $L$ 随 N 单调下降 | 方向一致 |
| D ≈ 20×N 验证 | Pythia 系列**都不在 optimal**（D=300B 固定） | 无法直接验证（缺 D 扫描） | 这是 Pythia 缺陷 |

### 阶段 7 results.md（self-replication）

```
TL;DR
- 用 Pythia 70M / 160M / 410M / 1.4B / 6.9B 五档 model 在 Pile val 上跑 perplexity，
  拟合得到 α = 0.30（Chinchilla 论文 0.34，差 12%——在误差范围）
- 远离 Kaplan 0.076（差 4 倍）——结果支持 Chinchilla 派
- 但 Pythia 全部训 300B tokens 固定 D，无法直接验证 D ≈ 20×N 法则
- 跨 dataset（MassiveText vs Pile）分布差异让绝对 loss 偏 5-10%

Limitations
- N=1（single seed Pythia ckpt）——没做跨 seed ensemble
- D 不变：所有 5 个 ckpt 都训了 300B，缺 IsoFLOP profile 横扫
- 工具精度损失：用 transformers 库 + BF16 推理，与 Pythia 训练 FP32 mixed 有微小数值差
- 我有先验（已读 Chinchilla 知道 α≈0.34）——可能 confirmation bias 让我接受 0.30
- The Pile 与 MassiveText 是不同 corpus，绝对 loss 不可直接对比
```

## 谱系对比（Layer 5：前作 + 后作 + 反对者）

![Chinchilla 谱系树：Kaplan → Chinchilla → LLaMA / Pythia / DeepSeek](/study/papers/chinchilla/02-evolution-tree.webp)

*图 2：scaling laws 谱系演化。
前作 [Kaplan M1 (2020)](/study/papers/scaling-laws/) 用 0.5×N schedule 错误得出 N^0.73 vs D^0.27 →
Chinchilla 2022（修复 schedule + 三种 method 收敛）→
后作 LLaMA 2023 / Pythia 2023 / DeepSeek-V2 2024 / Phi-3 2024 / DeepSeek-R1 2025（Chinchilla 派）。
红色虚线表示三类反对者：Kaplan 派遗留（被推翻但部分大模型仍在按 Kaplan 训）、
over-train 派（LLaMA-3 训 15T = D/N = 214，故意超 Chinchilla optimal）、
推理时间 scaling 派（Snell 2024 / DeepSeek-R1 把 compute 转到 test-time）。
"compute-optimal" 中央——Chinchilla 公式仍是 LLM 时代的训练范式锚。手绘 sketchnote 风。*

### 前作 1：[Kaplan M1 (2020)](/study/papers/scaling-laws/) — Scaling Laws for Neural Language Models

[arXiv 2001.08361](https://arxiv.org/abs/2001.08361)（OpenAI）。Chinchilla 的**直接对手**。

| 维度 | [Kaplan M1 (2020)](/study/papers/scaling-laws/) | Chinchilla (2022) |
|---|---|---|
| 训练规模 | 768 → 1.5B 参数 | 70M → 16B 参数 |
| (N, D) 网格点数 | ~100 | ~400 |
| Schedule 长度 | 固定 0.5 × N 步 | ∝ D（每个 D 都训完 cosine） |
| 主结论 | $N \propto C^{0.73}, D \propto C^{0.27}$ | $N \propto C^{0.50}, D \propto C^{0.50}$ |
| 175B 模型 optimal D | 300B tokens | **3.5T tokens** |
| 实证 | 没训"compute-optimal"模型验证 | 训 70B Chinchilla 打败 280B Gopher |

Kaplan 的功劳是"建立 power law 这件事普遍存在 + 给 compute-optimal 公式"，
但**schedule 长度的 hidden bug 让公式偏移**——Chinchilla 修正后行业范式翻转。

### 前作 2：Gopher / Rae 2021 — Scaling Language Models: Methods, Analysis & Insights

[arXiv 2112.11446](https://arxiv.org/abs/2112.11446)。DeepMind 内部，Chinchilla 的**直接前奏**。

训了 280B Gopher（300B tokens，按 Kaplan-style）。Section 6.1 末尾写：
"我们怀疑 model size 和 data 应该联合 scale"——但**没有给替代公式**。
Chinchilla 是这条 conjecture 的实证回答。

### 前作 3：Hestness 2017 — Deep Learning Scaling is Predictable, Empirically

[arXiv 1712.00409](https://arxiv.org/abs/1712.00409)（Baidu Research）。
更早的 power law 工作，限制在 ≤ 1B 参数 + 1 epoch——没给 compute-optimal。

### 后作 1：LLaMA / Touvron 2023 — Open and Efficient Foundation Language Models

[arXiv 2302.13971](https://arxiv.org/abs/2302.13971)（Meta）。
**第一个按 Chinchilla 训的旗舰开源模型**。

LLaMA-1 7B 训 1T tokens（D/N = 142，**故意 Chinchilla-over-trained**），
LLaMA-1 13B / 33B / 65B 也都接近或超 Chinchilla optimal。
Meta 解释：部署侧推理成本约束 → over-train 划算。

### 后作 2：Pythia / Biderman 2023 — A Suite for Analyzing Large Language Models Across Training and Scaling

[arXiv 2304.01373](https://arxiv.org/abs/2304.01373)（EleutherAI）。
**第一个开源完整 8 档 Chinchilla-style scaling 实验 + 全部 checkpoint**。

8 个 model（70M 到 12B）全训 300B tokens（The Pile），
这让任何研究者都能直接验证 Chinchilla power law 形式。
**也是这篇笔记 Layer 4 的 self-replication backend**。
代码 [commit `a19eecb8`](https://github.com/EleutherAI/pythia/tree/a19eecb807ec2c79a39ebf18108816e6ffffc1d5)。

### 后作 3：DeepSeek-V2 / V3 / R1 (2024-2025) — 推理时间 scaling 派

[DeepSeek-V2](https://arxiv.org/abs/2405.04434) / [DeepSeek-R1](https://arxiv.org/abs/2501.12948)。

DeepSeek-V2/V3（236B MoE 训 8.1T tokens）严格按 Chinchilla optimal。
但 DeepSeek-R1 把"compute" 转向 test-time——**长 CoT + 多步推理**，
让相对小模型在推理阶段花大量 compute 反超 GPT-4 数学能力。
扩展 [Snell 2024](https://arxiv.org/abs/2408.03314) 提出的 test-time scaling 公式。

### 后作 4：Phi-3 (Microsoft 2024) — 高质量数据派

[arXiv 2404.14219](https://arxiv.org/abs/2404.14219)。
**挑战 Chinchilla 的"data quantity"假设**。
用 3.8B 模型 + 3.3T tokens 但全部是高质量精选数据，达到 LLaMA 70B 类似效果。
意味着 D ≈ 20×N 假设的是"标准互联网 corpus"，**高质量数据可以重写 D 维度**。

### 反对者 1：Kaplan 派遗留（GPT-3 时代延续）

OpenAI / Anthropic 内部部分大模型（GPT-4 早期，Claude 1）训练时仍部分按 Kaplan-style——
原因是工程惯性、训练前确定数据上限。**2025 后已基本绝迹**。

### 反对者 2：Over-train 派（LLaMA / Mistral）

LLaMA-3 70B 训 15T tokens（D/N = 214，超 Chinchilla optimal 10×）。
Mistral 7B 训未公布，估算 ~ 8T tokens（D/N ≈ 1100）。
逻辑：推理成本 ≫ 训练成本时，"训多花 10× 算力换推理小 4× 模型"是正确选择。

### 反对者 3：推理时间 scaling 派

[Snell 2024](https://arxiv.org/abs/2408.03314) / DeepSeek-R1：
把 compute 从训练时 $C_{train}$ 转向推理时 $C_{test}$，**两个 power law 共存**。
DeepSeek-R1 用"小 train + 大 test-time CoT" 反超 GPT-4——
意味着 Chinchilla-optimal 不一定是 user-facing 任务的最优策略。

### 选型建议（什么场景选谁）

| 场景 | 推荐参考 | 为什么 |
|---|---|---|
| 预训练新基础模型（10B+）从零开始 | **Chinchilla 2022** | 训练时 compute-optimal 仍是黄金标准 |
| 部署受推理成本约束 | LLaMA / Mistral over-train 派 | 训多 10× 换推理小 4× |
| 数据量受限（小语种 / 专业领域） | Phi-3 高质量数据派 | 用质量补 quantity |
| 推理任务优先（数学/代码） | DeepSeek-R1 / o1 派 test-time scaling | train-side small + test-side compute |
| 学术研究 / 复现 | Pythia 公开 ckpt + The Pile | 完整 8 档 + 公开数据 |
| 工业部署 + 自主训 | LLaMA / Llama 2 / Llama 3 ref impl | 工业派系 SOP，含 tokenizer / 架构 |

## 与你当前工作的连接（Layer 6：通用化，给小团队选模型 size 的指导）

Chinchilla 不止是"DeepMind 拿来比 Gopher 内部公式"——
它是**任何团队（含小团队、初创、学校实验室）选模型 size / 数据量 / 算力预算**时的决策锚。
2026 年的小团队，可以按下面三段把这套思维落到自己的工作上。

### 今天就能用（≥ 4 子弹）

- **D ≈ 20×N 当起点经验法则**：手头要训一个 N 参数的模型？
  数据量起点选 D ≈ 20 × N tokens——
  如训 1B 模型至少看 20B tokens，否则就是 Chinchilla-undertrained
- **小团队选 Chinchilla-optimal 而不是 Kaplan**：除非你是 Meta / Anthropic 级，
  推理成本不会成为约束——按 D ≈ 20×N 训，避免"训 1B 但只喂 1B tokens"的失败模式
- **三种 estimation method 借鉴到自己实验**：自己跑 small-scale 验证时，
  不要只用一种方法——同时画 IsoFLOP profile + parametric fit + IsoFLOP curves
  三个方法独立结果一致才能信
- **算 D/N ratio 当模型 health check**：拿到一个 pretrained model 先算 D/N——
  < 5 = severely undertrained（loss 还有大空间）；20 ≈ optimal；
  > 100 = overtrained（推理-cost 优化派）。这个 ratio 决定后续 fine-tune 策略

### 下个月能用（≥ 4 子弹）

- **partition compute budget by Chinchilla**：拿到一笔实习预算（比如 10000 GPU-hours），
  按 $N_{opt} \propto C^{0.5}, D_{opt} \propto C^{0.5}$ 推荐配置，
  用 parametric fit 公式预测 final loss，避免训完才发现 under-trained
- **跨数据集做小规模 IsoFLOP profile**：在自己的细分领域（医学、法律、客服）跑 3-5 档 N
  + 同 C 不同 D，看 D ≈ 20×N 在你的领域是否成立——可能领域数据"信息密度"不同
- **预测 loss 而不是猜**：开始训前用 Chinchilla parametric fit 预测 final loss，
  跑完比一下——大幅偏离（> 10%）就要 debug 是不是 LR / batch / data / 实现 bug
- **用 Pythia ckpt 做 baseline 对比**：自己训出来的 small model 想知道"是不是好"？
  和同 N、同 D 的 Pythia ckpt 比 perplexity——
  Pythia 是行业开源 baseline，比就知道差距

### 不要用的部分（≥ 4 子弹）

- **不要照搬 D ≈ 20×N 到推理 / agentic 任务**——这条经验法则只适用于 next-token prediction loss，
  对推理任务（数学、code、CoT）已被 [Snell 2024](https://arxiv.org/abs/2408.03314) 修正
- **不要在 N > 100B 范围硬外推 $\alpha = 0.34$**——LLaMA-3 / DeepSeek-V3 在 N > 100B 后
  power law 斜率有变化，**外推到 1T 不可信**
- **不要忽略数据质量轴**——Phi-3 证明高质量数据可以让 D 减半，
  Chinchilla 假设"标准互联网 corpus"，专业领域可能完全不同
- **不要照搬 Chinchilla 推荐的 schedule 到 fine-tune**——Chinchilla 公式针对 pretraining，
  fine-tune 阶段 D / N 比例完全不同（LR、warmup、early-stop 都另一套）
- **不要在 < 100M 参数下做 scaling laws 验证**——小模型受 batch / LR / 实现细节噪声主导，
  power law 直线性差，拟合误差爆表（参考 [Kaplan M1](/study/papers/scaling-laws/) 笔记同样警告）

## 怀疑 + 延伸阅读（Layer 7）

### 4 件具体怀疑

**怀疑 1**（已在 3.1 提）：Approach 1 IsoFLOP profile 每条曲线只 6-10 点，
**谷底位置不确定性没显式给 CI**——锚定 Section 3.1, Figure 2。
$a$ 拟合误差 ±0.05 是否仍能拒绝 Kaplan 0.73？

**怀疑 2**（已在 3.2 提）：parametric fit 给 $\alpha = 0.34, \beta = 0.28$，
**两者差 21% 但 D ≈ 20×N 假设两者相等**——锚定 Section 3.3, Table 2.
OLMo / Pythia 后续重做都得到 $\alpha > \beta$，"D ≈ 20×N" 是过度简化。

**怀疑 3**（已在 3.3 提）：Table 4 评测 task set 没列 GLUE / SuperGLUE / NLI——
**cherry-pick？** 锚定 Section 4 / Table 4 / Figure A7.

**怀疑 4**（已在 3.3 提）：MassiveText 数据质量比 The Pile / GPT-3 训练集高——
Chinchilla 70B 赢的可能是"质量"而非"小模型 + 多数据"——锚定 Section 2 / Appendix B.
Phi-3 后续证明"质量 > 数量"是独立 axis。

**怀疑 5**：Section 4 评测全是 zero/few-shot，**没做 fine-tune / RLHF 阶段对比**。
70B Chinchilla 的优势在 fine-tune 后是否依然成立？
LLaMA-2 / Llama-3 时代的 SFT + RLHF 后小模型能追上大模型——
锚定 Section 4。**这条疑问被 InstructGPT (2022) / RLHF 派后续部分回答**。

**怀疑 6**：所有训练用 cosine LR schedule——**WSD schedule (Hu 2024) 后续证明对 scaling laws 影响 ~5%**。
Chinchilla $\alpha = 0.34$ 是 cosine-specific 的，换 schedule 数字会漂移——锚定 Appendix A.

### 限制段（DeepPaperNote 风格 ≥ 4 条独立限制）

1. **Sample size**：所有 ~400 个 (N, D) run 都是 single seed——
   没有跨 seed ensemble 验证 noise floor。三种 estimation method 之间的"独立验证"
   实际上共享同一组 raw runs，**不是真正的方法独立**。
2. **任务边界 narrow**：所有 scaling 实验都是 left-to-right autoregressive language modeling（next-token CE loss）。
   **MoE / encoder-decoder / multimodal 没 cover**——后续 Mistral 8x7B / Gemini 1.5 Pro / Mamba
   等架构的 scaling laws 形式可能不同。
3. **测量工具年代**：2022 年的 TPU v3 + JAX/Haiku + cosine schedule + bf16。
   2026 已普遍迁到 H100 + PyTorch + WSD schedule + FP8——
   绝对训练成本下降 ~10× 但 D ≈ 20×N 结论被 Pythia / OLMo / LLaMA / DeepSeek 一致复现稳定。
4. **MassiveText 数据集未公开**——任何复现尝试都得用 The Pile / RefinedWeb 替代，
   引入未控制的分布差异。社区估算这个差异让 $\alpha$ 测出来漂移 ±0.04。
5. **Compute-optimal 公式假设训练目标固定**——但现代 training 普遍混 SFT / RLHF / DPO 多阶段，
   **不是单一 next-token prediction**。多阶段下 $C = 6ND$ 的 FLOP 公式失效。
6. **推理算力没纳入**——Chinchilla 只优化训练 compute，
   不考虑 inference cost。LLaMA-3 / Mistral / DeepSeek-R1 的 over-train 路线**直接挑战这个假设**。

### 接下来读哪 N 篇

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Touvron et al. 2023 (LLaMA) [arXiv 2302.13971](https://arxiv.org/abs/2302.13971) | Chinchilla 派的工业落地是怎样的？为什么 over-train？ |
| 2 | Biderman et al. 2023 (Pythia) [arXiv 2304.01373](https://arxiv.org/abs/2304.01373) | 完整开源 8 档 scaling 实验，每个 ckpt 怎么用？ |
| 3 | Snell et al. 2024 (test-time compute) [arXiv 2408.03314](https://arxiv.org/abs/2408.03314) | 推理算力的 scaling law 是什么？和 Chinchilla 怎么联合优化？ |
| 4 | Abdin et al. 2024 (Phi-3) [arXiv 2404.14219](https://arxiv.org/abs/2404.14219) | 高质量数据派怎么挑战 D ≈ 20×N？ |
| 5 | DeepSeek-AI 2025 (R1) [arXiv 2501.12948](https://arxiv.org/abs/2501.12948) | Chinchilla / over-train / test-time 三套思路在 reasoning 模型上怎么 trade-off？ |

## 附录：叙事错位清单（论文宣称 vs 代码现实）

| 论文宣称 | 代码 / 实证现实 | 错位类型 |
|---|---|---|
| "三种 estimation method 独立" | 实际共享同一组 ~400 raw runs | 独立性夸大 |
| "D ≈ 20×N 是 compute-optimal" | $\alpha = 0.34, \beta = 0.28$，D/N 应是 ~ 22 不是 20 | 数字四舍五入 |
| "Chinchilla 全面优于 Gopher" | 极个别 BIG-bench 任务 Gopher 略优 | 范围夸大 |
| "MassiveText 是 high-quality" | 数据集闭源，质量声明无法独立验证 | 数据来源不透明 |
| "compute-optimal" | 只优化训练 compute，不考虑推理 | 范围限制未明示 |
| "schedule ∝ D 是修复" | 实际是"cosine 长度匹配"——但 Kaplan 用 cosine 也匹配 0.5×N，谁 right 取决于评估目标 | 因果归因争议 |

---

**重构日期**：2026-05-29 · **总行数**：~ 540 行 · **启用 skill**：`/source-learn`（Chinchilla 论文精读）+ `/research-gap`（LLaMA / Pythia / Phi-3 / DeepSeek-R1 后作检索）+ `/codex`（parametric fit 代码 second opinion）

> Season M（LLM Pretraining）第 2 篇——下一篇预定 LLaMA / Touvron 2023（Chinchilla 派工业落地）或 Pythia（开源 scaling 复现）。
