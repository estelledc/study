---
title: Demystifying Data Organization for Enhanced LLM Training — 用「排课表」而不是「删题目」提升大模型训练
来源: https://arxiv.org/abs/2605.30334
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：同一套题库，顺序决定期末成绩

想象你是一位高中班主任，手里有一份 **已经筛好的** 模拟卷题库（每条样本都有「难度/质量分」），学期只剩 **一轮完整刷题**（对应 LLM 常见的 **1 epoch 预训练**）——每道题只能做一遍，不能像以前那样简单题反复刷到吐。

你会怎么排课？

| 日常做法 | 对应训练策略 | 常见后果 |
|---------|-------------|---------|
| 题目打乱随机发 | Random 随机顺序 | 稳定但平庸，边界阶段（开学/期末）没有针对性 |
| 从易到难一路推 | Curriculum Learning (CL) | 前期学得快，后期全做难题时 **忘记基础**（论文用低分样本 PPL 反弹验证） |
| 期末突击全上难题 | 训练末尾全是低分样本 | 最终性能停滞（SEG(h90) 类配置） |
| 期中把简单题再插回来 | Baby Step / 显式 replay | 有效但 **数据量翻倍**，LLM 规模下不现实 |
| 开学稳、期末冲、过渡平滑、每节课题型混搭 | 本文四条 Guidances + STR/SAW | **不增数据、几乎不增算力**，只改顺序 |

论文的核心洞察：**选什么题（Data Selection）** 和 **什么顺序做（Data Organization）** 是两件不同的事。工业界已经为筛选数据算过一遍 sample-level score（FineWeb-Edu 的教育分、QuRated 的多维质量分等），但这些分数通常 **筛完就扔**。本文说：同一份 $\bm{\gamma}$ 再排一次序，几乎是 **零额外成本** 的性能杠杆。

---

## 这篇论文在解决什么问题

### 1. 背景：LLM 训练是「单次过堂」

现代 LLM 常在 **数十亿 token 上只训 1～几个 epoch**（Llama、Qwen 等）。在这种 regime 下：

- 每个样本在训练生命周期里 **曝光次数有限**；
- **时间顺序** 成为塑造优化轨迹的一阶因素，而不只是「有没有这条数据」；
- 传统 Curriculum Learning 假设可以多次 revisit 简单样本，与 LLM 现实 **不匹配**。

### 2. 与相邻工作的关系

| 方向 | 代表 | 本文差异 |
|------|------|---------|
| 数据筛选 | FineWeb-Edu、QuRating、DSIR | 分数用于 **subset 选择** 后即丢弃 |
| 课程学习 | Bengio CL | 单调 easy→hard，易遗忘 |
| 折叠复习 | DELT (Dai et al., 2025a) | 有启发，但缺系统化 guidance |
| **数据组织** | **本文** | 四条原则 + STR/SAW，复用已有分数 |

### 3. 形式化：三阶段流水线

设原始数据集 $\mathcal{D}=\{x_1,\ldots,x_{|\mathcal{D}|}\}$。

**阶段 A — 打分（Data Scoring）**

$$
\bm{\gamma} = g(\mathcal{D}) = [\gamma_1, \gamma_2, \ldots, \gamma_{|\mathcal{D}|}]^\top
$$

$\gamma_i$ 可以是质量、难度、可学习性、教育价值等——论文直接 **复用** 数据效率文献里已有的分数。

**阶段 B — 筛选（Data Selection，可选）**

$$
\mathcal{D}_{\text{sub}} = f_s(\mathcal{D}; \bm{\gamma}, K), \quad K = \lfloor R \cdot |\mathcal{D}| \rfloor
$$

保留 score 排名前 $K$ 的样本，**改变规模，不决定顺序**。

**阶段 C — 组织（Data Organization，本文核心）**

$$
\mathcal{D}_{\text{ord}} = f_o(\mathcal{D}; \bm{\gamma}) = [x_{\pi(1)}, x_{\pi(2)}, \ldots, x_{\pi(n)}]
$$

只施加排列 $\pi$，**不改变集合大小**。完整训练集：

$$
\mathcal{D}_{\text{train}} = f_o\bigl(f_s(\mathcal{D}; \bm{\gamma}, K); \bm{\gamma}\bigr)
$$

**特例**：经典 CL 就是 $f_o$ 按 $\gamma$ **升序** 排列，得到 $\mathcal{D}_{\text{sort}}$。

---

## 四条 Guidances（G1–G4）

论文通过大量 ablation 归纳出四条可组合的组织原则，每条都有对应实现模块。

### G1：Boundary Sharpening（边界锐化）

**直觉**：训练 **开头** 和 **结尾** 看到的数据分布，对收敛和最终能力影响极大。

- **开头**：先用 **低分（简单、低信息密度）** 样本，稳定早期优化（类似 learning rate warmup 的数据侧版本）。
- **结尾**：用 **高分（复杂、高质量）** 样本收尾，把模型能力「对齐」到下游推理任务。

**实现 — SEG（Segment Ordering）**：把 $\mathcal{D}_{\text{sort}}$ 按百分位切成 $L$ 段 $\mathcal{D}_0,\ldots,\mathcal{D}_{L-1}$，段内 shuffle，再拼接。例如 SEG(l10-h10) 表示低分起步、高分收尾。

**实验结论（FineWeb-Edu, Mistral-160M）**：

- 结尾是高分 → 普遍增益（如 SEG(l10-h10) 平均准确率 **38.28%** vs Random **~21.5%**）；
- 结尾是低分 → 性能停滞（SEG(h90)）；
- **只在开头堆高分** 几乎无益——固定数据量下，开头挑高分意味着结尾被迫吃低分。

### G2：Cyclic Scheduling（周期调度）

**直觉**：严格单调 CL 在后期全是难题，模型会 **遗忘** 早期简单样本上学到的基础（论文监测最低 10% 分位样本 $D_e$ 的 PPL：CL 先降后 **反弹**，FO 多周期后仍保持低 PPL）。

**实现 — FO（Folding Ordering）**：对排序后的数据做 **步长为 $L$ 的分层抽样**（strided partition）——第 $l$ 层取索引 $i \equiv l \pmod L$ 的样本。每个 folding cycle 覆盖 **全分数谱**，实现 **无 replay 开销的周期性复习**。

### G3：Curriculum Continuity（课程连续性）

**直觉**：分数分布 **突变** 会在 cycle 边界造成 **梯度范数尖峰**（optimizer shock），训练不稳定。

**实现 — ZIG（Zig-zag）**：在过渡区用 zig-zag 机制替代 FO 的折叠，使相邻样本的 score 变化更平滑。FO-3 在 cycle 边界出现 gradient norm spike；ZIG 维持更平稳的优化动态。

### G4：Local Diversity（局部多样性）

**直觉**：严格按分数排序时，连续 batch 内样本过于同质 → **梯度多样性** 下降 → 过拟合特定模式、泛化变差。

**实现 — JIT**：在已排好的序列上，用窗口 $w$ 做局部混洗/交错，在 **不破坏全局课程进度** 的前提下提高 mini-batch 内的 score 方差。JIT 还能让 loss landscape 更 **flat**（权重扰动实验：JIT 模型对噪声更鲁棒）。

---

## 两种综合策略：STR 与 SAW

在四条 guidance 之上，论文给出两个 **可部署** 的排序算法。

### STR（Stair Ordering）— G1 + G2 + G4

1. 将 $\mathcal{D}_{\text{sort}}$ 切成 $K$ 个 section；
2. **稳定区** $\mathcal{D}^s$：保持单调 score 顺序（全局 easy→hard 趋势，满足 G1）；
3. **过渡区** $\mathcal{D}^t$（split point 半径 $\rho$ 内）：应用 **FO 折叠**（G2 周期复习）；
4. 可选 **JIT**（G4）。

形状像 **楼梯**：大段单调上升，台阶转角处折叠复习。

### SAW（Saw Ordering）— G1 + G2 + G3 + G4

STR 的过渡区用 FO 会在区域边界产生 **属性跳变**。SAW 把过渡区的 $f_{\text{FO}}$ 换成 **$f_{\text{ZIG}}$**，强制 smoother transition（G3），其余同 STR。

论文 Figure 1：SAW 的 score–index 热力图比 Random/CL 更 **结构化、渐进**；在 160M–1.7B 各规模上 **稳定优于** Random 与 CL，模型越大增益有时更明显。

**主结果（Table 5, Mistral-160M, 1B tokens FineWeb-Edu）**：

| 方法 | 平均准确率（%） | 启用的 Guidance |
|------|----------------|-----------------|
| Random | ~21.5 | — |
| CL | ~37.1 | 单调课程 |
| DELT | 基线级 | 折叠 |
| **STR** | **38.65** | G1+G2+G4 |
| **SAW** | **38.78** | G1+G2+G3+G4 |

STR 与 SAW 接近：因为 STR 的过渡区折叠范围较窄，剧烈跳变本就较少，G3 的边际收益被压缩。最优配置报告为 **STR-2(JIT)** 与 **SAW-2(JIT)**。

---

## 实验设置速览

| 维度 | 配置 |
|------|------|
| 预训练数据 | FineWeb-Edu（主文）、QuRatedPajama（附录）；1B tokens 主实验，50B scaling |
| 领域 SFT | DeepMath-103K（数学）、OpenCodeInstruct（代码） |
| 模型 | 预训练 Mistral 架构 160M–1.7B；SFT 用 Qwen3 官方权重 |
| 分数来源 | FineWeb-Edu 教育分（0–5）；QuRated 四维质量分 |
| 基线 | Random、CL、DELT |
| 评估 | 多 benchmark 平均准确率；PPL、梯度范数、scaling law 外推 |
| 代码 | [microsoft/data-efficacy](https://github.com/microsoft/data-efficacy/) |

Scaling 实验：在 DCLM 上 160M→1.7B，STR/SAW 的 test loss 优势 **随规模保持甚至放大**；用 Chinchilla scaling law 外推到 GPT-3 175B、Llama 3.1 405B 量级，组织数据的收益 **仍然存在**。

---

## 代码示例 1：Folding Ordering（FO，实现 G2）

下面用 Python 演示论文 Algorithm 2 的核心——对 **已按 score 升序排列** 的索引做步长为 $L$ 的分层，再按层拼接。这是 **零额外数据** 的「周期复习」。

```python
from __future__ import annotations

import numpy as np


def folding_order(scores: np.ndarray, num_layers: int) -> np.ndarray:
    """
    FO (Folding Ordering): Cyclic Scheduling (G2).

    Args:
        scores: shape (N,), 每个样本的质量/难度分
        num_layers: 折叠层数 L

    Returns:
        order: 长度 N 的索引排列，按 FO 规则组织训练顺序
    """
    sorted_idx = np.argsort(scores, kind="stable")  # 低分 -> 高分
    n = len(sorted_idx)
    layers: list[list[int]] = [[] for _ in range(num_layers)]

    for rank, sample_id in enumerate(sorted_idx):
        layer = rank % num_layers
        layers[layer].append(int(sample_id))

    # 按层拼接：cycle-0, cycle-1, ..., cycle-(L-1)
    order: list[int] = []
    for layer in layers:
        order.extend(layer)
    return np.array(order, dtype=np.int64)


# --- 玩具例子：10 条样本，分数 0..9 ---
scores = np.arange(10, dtype=float)
fo2 = folding_order(scores, num_layers=2)
fo3 = folding_order(scores, num_layers=3)

print("sorted :", np.argsort(scores))
print("FO-2   :", fo2)  # [0,2,4,6,8, 1,3,5,7,9] — 偶数秩与奇数秩分两 cycle
print("FO-3   :", fo3)  # 每 3 个秩一层，每层覆盖不同分数段
```

**读输出**：FO-2 先把排序后的第 0、2、4… 条（覆盖低分到高分）训完一轮，再训第 1、3、5… 条——每个 cycle 都见到 **宽分数谱**，而不是 CL 那样后半段只剩难题。

---

## 代码示例 2：Segment Ordering + JIT 窗口混洗（G1 + G4 骨架）

SEG 实现 G1（分段边界控制）；JIT 在 SEG 或 STR/SAW 输出上增加 G4（局部多样性）。下面给一个 **教学用** 的简化实现：先按百分位分段拼接，再在固定窗口内做 constrained shuffle。

```python
from __future__ import annotations

import numpy as np


def segment_order(
    scores: np.ndarray,
    segment_bounds: list[tuple[float, float]],
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """
    简化版 SEG (G1): 按分数百分位切段，段内 shuffle，再拼接。

    segment_bounds 例如 [(0.0, 0.1), (0.1, 0.9), (0.9, 1.0)] 对应 SEG(l10-h10) 风格。
    """
    rng = rng or np.random.default_rng(0)
    n = len(scores)
    sorted_idx = np.argsort(scores, kind="stable")
    ranks = np.empty(n, dtype=np.int64)
    ranks[sorted_idx] = np.arange(n)

    segments: list[list[int]] = [[] for _ in segment_bounds]
    for sample_id, rank in enumerate(ranks):
        pct = rank / max(n - 1, 1)
        for seg_id, (lo, hi) in enumerate(segment_bounds):
            if lo <= pct <= hi or (seg_id == len(segment_bounds) - 1 and pct == 1.0):
                segments[seg_id].append(sample_id)
                break

    order: list[int] = []
    for seg in segments:
        seg_arr = np.array(seg, dtype=np.int64)
        rng.shuffle(seg_arr)
        order.extend(seg_arr.tolist())
    return np.array(order, dtype=np.int64)


def jit_local_shuffle(order: np.ndarray, window: int, rng: np.random.Generator | None = None) -> np.ndarray:
    """
    简化版 JIT (G4): 在滑动窗口内 shuffle，保留全局大致进度，提高局部 score 多样性。
    论文中 window w 对 CL/FO/ZIG 分别调参（如 5000、50000）。
    """
    rng = rng or np.random.default_rng(1)
    out = order.copy()
    n = len(out)

    for start in range(0, n, window):
        end = min(start + window, n)
        chunk = out[start:end].copy()
        rng.shuffle(chunk)
        out[start:end] = chunk
    return out


# --- 演示：100 条样本，低分起步 + 高分收尾 + JIT ---
rng = np.random.default_rng(42)
scores = rng.uniform(0, 1, size=100)
seg_order = segment_order(scores, [(0.0, 0.1), (0.1, 0.9), (0.9, 1.0)], rng=rng)
final_order = jit_local_shuffle(seg_order, window=10, rng=rng)

# 检查「开头 / 结尾」平均分数是否符合 G1 意图
print("head mean score:", scores[final_order[:10]].mean())
print("tail mean score:", scores[final_order[-10:]].mean())
print("global head->tail trend OK:", scores[final_order[:10]].mean() < scores[final_order[-10:]].mean())
```

**工程提示**：真实 STR/SAW 还要在 section 之间的 **过渡区** 插入 FO 或 ZIG（G2/G3），并对接分布式 dataloader 的 **deterministic shuffle seed**。论文强调：JIT 应作为 **最后一步** 加在 $f_o$ 输出上，避免破坏全局课程结构。

---

## 代码示例 3：把组织接到训练 loop（概念骨架）

```python
# 伪代码：同一分数向量驱动 selection + organization
gamma = load_prewcomputed_scores(corpus)  # FineWeb-Edu / QuRated，离线算一次

# 可选：筛选 top-R
top_k = int(0.5 * len(gamma))
selected_ids = np.argsort(-gamma)[:top_k]

# 组织：SAW-2(JIT) — 生产环境应调用官方 data-efficacy 实现
ordered_ids = saw_order(gamma[selected_ids], num_sections=2, transition="zigzag")
ordered_ids = jit_local_shuffle(ordered_ids, window=5000)

train_loader = build_loader(corpus, ordered_ids, shuffle=False)  # 顺序由 f_o 决定，不再 random shuffle

for step, batch in enumerate(train_loader):
    loss = model.training_step(batch)
    loss.backward()
    optimizer.step()
```

关键点：`shuffle=False` —— 顺序本身就是 **训练信号** 的一部分；若再 random shuffle，会破坏 G1–G3 精心构造的轨迹。

---

## 局限与依赖

1. **分数质量决定上限**：组织策略完全依赖 $\bm{\gamma}$。分数噪声大、与任务无关时，排序可能有害。论文明确承认这是主要 limitation。
2. **不是万能替代数据筛选**：组织 **不改变** $|\mathcal{D}|$；低质量 corpus 靠排序无法变魔法。
3. **超参敏感**：FO 的层数 $L$、SEG 的百分位区间、JIT 的窗口 $w$、STR/SAW 的 section 数 $K$ 和过渡半径 $\rho$ 都需要验证（论文对 $L$ 做了 grid search，FO-20/FO-100 可能退化）。
4. **分布式训练细节**：全局顺序 vs 多 worker 分片、resume checkpoint 时的顺序一致性，生产系统要额外工程化（论文 focus 在算法与单轨实验）。

---

## 谁应该关心这篇论文

| 角色 | 可行动项 |
|------|---------|
| 预训练工程师 | 若已有 QuRating / FineWeb-Edu 分数 pipeline，**加一层 $f_o$** 几乎零成本 |
| 数据平台 | 把 score 从「一次性 filter」升级为 **filter + rank API** |
| 研究者 | 四条 guidance 提供了比「单调 CL」更细的 ablation 语言 |
| 微调工程师 | SFT 阶段在 DeepMath / OpenCodeInstruct 上同样有效，不仅限于 pretrain |

---

## 一句话总结

**Demystifying Data Organization for Enhanced LLM Training** 告诉我们：在大模型 **少 epoch、大数据** 的训练范式下，**同一批数据怎么排队** 与 **选哪批数据** 同样重要。复用已有的 sample-level score，按 **边界锐化、周期复习、平滑过渡、局部多样** 四条原则组织序列，STR/SAW 能在 **不增加训练 token、几乎不增加算力** 的前提下，稳定提升预训练与 SFT 的效果——就像同一套题库，换一张更科学的课表，期末均分就能上去。

---

## 延伸阅读

- FineWeb-Edu / QuRating：分数从哪来
- DELT (Dai et al., 2025a)：折叠复习的相关工作
- Curriculum Learning (Bengio et al., 2009)：本文特例化的基线
- 官方实现：[https://github.com/microsoft/data-efficacy/](https://github.com/microsoft/data-efficacy/)
