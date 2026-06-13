---
title: Resolution Diagnostics for Paired LLM Evaluation — 排行榜上的 0.8 分差距能信吗？
来源: https://arxiv.org/abs/2605.30315
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：视力表 vs 显微镜

想象你在选眼镜。视力表上，甲说「我看 1.0，你看 0.9」，差 0.1 听起来不大；但若只测了 5 个字母、房间还晃，这点差距可能只是随机波动——**表的分辨率不够**，却会被包装成「甲明显更清楚」。

LLM 排行榜做的事很像：两个模型在同一批 prompt 上答题，甲 78.3%、乙 77.5%，差 0.8 个百分点就上了新闻标题。**但 0.8 pp 是「真差距」还是「抽样噪声」？** 取决于 benchmark 有多少题、两模型在同一题上是否同对同错（配对相关 ρ），以及你要求的统计把握（显著性 α、功效 1−β）。

**Resolution Diagnostics for Paired LLM Evaluation**（Kotawala, Princeton；ICML 2026 Workshop on Hypothesis Testing, arXiv:2605.30315）把这件事说透了：共享 prompt 的 LLM 评测本质是**配对假设检验**；论文给出一套「分辨率诊断」协议，回答三个问题——当前 N 题能检测的最小差距（MDE）、要检测目标差距需要多少题（N*）、以及现有 benchmark 是否「够格」（分辨率比 q = N/N*）。

实证结论很扎眼：Open LLM Leaderboard v1 的 40 组两两比较里，**11 组**在常规目标 (α, 1−β) = (0.05, 0.8) 下**无法分辨**；MMLU-Pro 前十名相邻名次 9 对里 **4 对**未达标，考虑科目聚类后升到 **6/9**。很多「谁比谁强」的叙事，统计上站不住。

---

## 这篇论文在解决什么问题

### 1. 排行榜把「差距」当成「结论」

现代 leaderboard 用百分比点（percentage points, pp）展示模型 A 比 B 高多少。媒体和产品决策常把 headline gap 直接当成「A 更好」。但「A 显著优于 B」是一个**关于总体 prompt 分布的统计主张**，不是 gap 数字本身。

论文 §1 举了一个边界案例：HellaSwag 上 gemma-7B 与 Llama-3-8B 差 **+0.46 pp**（n = 10,042）——渐近 χ² McNemar **p = 0.049**（显著），精确条件二项 **p = 0.054**（不显著），配对 bootstrap 95% CI 仍含 0；分辨率比 **q ≈ 1/2**，即当前样本量只有「达标所需 N*」的一半。**名义显著 ≠ 达到 (0.05, 0.8) 分辨率目标。**

### 2. 配对设计被当成独立样本算

共享 prompt 评测里，同一道题上两模型往往同对或同错，**Cov(X^A, X^B) 很大**。若仍用独立样本的方差公式或 Miller (2024) 的无配对 Gaussian 近似，会**高估**所需样本量（配对其实更高效），或误用 Cohen-h + (1−ρ) 捷径**低估约一半**。

论文在 40 组 OLL v1 对上显示：配对 McNemar 所需 N* 的中位数是无配对 Miller 公式的 **1/2.15**（IQR [1.60, 2.75]），与教科书预测 1/(1−ρ) 一致。

### 3. 缺少「分辨率报告」标准

McNemar、配对 t、配对 bootstrap 都是经典工具；缺的是：**给定 benchmark 规模与数据结构，在常规 α 和功效下，多大的 gap 才配被写进标题？** 论文把 level-α、power-(1−β) 检验**反演**，得到 MDE、N*、q，并打包为 pip 包 **llm-power**。

---

## 核心概念

### 1. 配对设定

两模型 A、B 在相同 N 个 prompt 上评测（视为从 prompt 超总体 i.i.d. 抽样）。每题得分 X_i^A, X_i^B 可为 0/1 或 [0,1] 分级。定义配对差 D_i = X_i^A − X_i^B，估计 gap δ̂ = (1/N) Σ D_i。

### 2. 三个诊断量（论文 Equation 3–4）

在正态近似下，配对差标准误 SE(δ̂) = σ_D / √N。反演功效公式得到：

| 符号 | 含义 | 直觉 |
|------|------|------|
| **N*(δ; α, β)** | 检测目标 gap \|δ\| 所需的配对样本量 | 「要证明 1 pp 差距，至少要多少题？」 |
| **δ_MDE(N; α, β)** | 当前 N 下可检测的最小 \|δ\| | 「这 1 万题最多能分辨多小的差距？」 |
| **q = N / N*(δ̂)** | **分辨率比** | **q ≥ 1** → 在 (α, 1−β) 下**可分辨**当前观测 gap；**q < 1** → **未达标** |

默认操作点：**(α, 1−β) = (0.05, 0.8)**，即双侧 5% 显著性、80% 功效。

对单对比较，q 与 Wald 统计量单调相关：q ≥ 1 ⟺ |T_N| ≥ z_{1−α/2} + z_{1−β} ≈ **2.80**。q 的价值在于**可聚合**（多重比较、聚类、序贯检验），比裸 p 值更易解读 leaderboard 整体「有多糊」。

**重要区分**：q < 1 **不断言两模型相等**，也**不推翻**固定 N 下的 p 值；它说的是「以当前 benchmark 规模，达不到预设分辨率目标」。这是**benchmark 设计诊断**，不是「用观测效应算事后功效」那类 Hoenig–Heisey 谬误。

### 3. 二元准确率的配对方差（Equation 5–6）

对 0/1 正确率，p_A、p_B 为边际准确率，ρ 为**题内 Bernoulli 相关**（同对同错程度）：

```
σ_D² = p_A(1−p_A) + p_B(1−p_B) − 2ρ√[p_A(1−p_A)·p_B(1−p_B)]
N* = [(z_{1−α/2} + z_{1−β})² · σ_D²] / (p_A − p_B)²
```

这与 McNemar–Connor 大样本所需 N 渐近一致。SOTA 模型在同一 prompt 上 ρ 常很高（0.45–0.99），**忽略配对结构会严重误判分辨率**。

### 4. Cohen-h + (1−ρ) 捷径的「减半陷阱」（Lemma 1）

很多人只有无配对 Cohen-h 计算器：先算 n_unp = K/h²，再乘 **(1−ρ)** 当配对样本量。论文证明：在**小差距、相邻排名** regime，该捷径 n_h 约为正确 N* 的 **1/2**，偏差 O(δ²)。

在 (p_A, p_B, ρ) = (0.65, 0.60, 0.30) 例子中，正确 N* ≈ **1028**；Cohen 1988 / G*Power / R pwr 的 per-arm K/h² 再 ×(1−ρ) 只得 **515**——**少估一半**。statsmodels 的 2K/h² 约定与 **llm-power** 直接算 Var(Δ) 则正确。

结构原因：(1−ρ) 加在**单臂**方差 p(1−p) 上，但配对差方差来自 Var(X^A) + Var(X^B) − 2Cov，**多一个因子 2**。

### 5. 多重比较、聚类与序贯更新

- **Leaderboard 多重性**：K 个模型最多 C(K,2) 对比较；Bonferroni/Holm 会放大 N*（OLL v1 上约 ×2.11）。
- **科目/主题聚类**：MMLU-Pro 14 个 subject 作为 cluster，设计效应 DE = 1 + (m̄−1)·ICC(D)；IID 下 4/9 未达标 → 聚类校正后 **6/9**。
- **持续更新的 leaderboard**：固定 n 检验在「看完数据再停」时失控；anytime-valid e-process 阈值约再 ×2.15，MMLU-Pro 相邻对未达标数 4 → **5**。

---

## 实证结果速览

### Open LLM Leaderboard v1（40 对）

5 个 7–8B 开源模型 × 4 任务（ARC、HellaSwag、Winogrande、GSM8K），每任务 10 对，共 40 对。

| \|δ\| 区间 | 对数 | 未达标 (q<1) 比例 | 中位 r = N*/N |
|-----------|------|-------------------|---------------|
| ≤ 1% | 3 | 100% | 94 |
| 1%–2% | 4 | 100% | 4.2 |
| 2%–5% | 10 | 40% | 0.75 |
| 5%–15% | 17 | 0% | 0.15 |
| > 15% | 6 | 0% | 0.03 |
| **合计** | **40** | **11 (28%)** | 0.16 |

**分辨率边界大约在 |δ| ≈ 5 pp**：≤2% 几乎全糊，>5% 几乎全清，2%–5% 混合——正是相邻名次最常出现的区间。

### MMLU-Pro Top-10（9 对相邻名次）

N = 12,032 题；固定 n 下 **4/9** 未达标；Bonferroni-9、聚类校正、anytime-valid 分别更严，未达标数 **4 → 6 → 5**（不同准则回答不同问题，不宜简单比「谁更对」）。

---

## 代码示例 1：手算分辨率三件套（Python）

下面用论文 Equation 5–6 实现二元配对诊断，不依赖外部包，便于理解公式。

```python
import math
from scipy import stats

def paired_binary_variance(p_a: float, p_b: float, rho: float) -> float:
    """配对差 D = X^A - X^B 的方差（0/1 得分）。"""
    q_a, q_b = 1 - p_a, 1 - p_b
    term = math.sqrt(p_a * q_a * p_b * q_b)
    return p_a * q_a + p_b * q_b - 2 * rho * term


def resolution_diagnostics(
    p_a: float,
    p_b: float,
    rho: float,
    n: int,
    alpha: float = 0.05,
    power: float = 0.80,
) -> dict:
    """返回 N*, MDE, q 及是否可分辨。"""
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    z_sum = z_alpha + z_beta

    delta = abs(p_a - p_b)
    sigma_d = math.sqrt(paired_binary_variance(p_a, p_b, rho))

    n_star = (z_sum * sigma_d / delta) ** 2 if delta > 0 else float("inf")
    mde = z_sum * sigma_d / math.sqrt(n)
    q = n / n_star if math.isfinite(n_star) else float("inf")

    return {
        "delta_pp": delta * 100,
        "N_star": round(n_star),
        "MDE_pp": mde * 100,
        "q": q,
        "resolved": q >= 1.0,
    }


# 论文 Table 1 工作例子：(0.65, 0.60, 0.30), N 足够大时 gap=5pp
diag = resolution_diagnostics(0.65, 0.60, 0.30, n=12_032)
print(diag)
# 期望 N* ≈ 1028；若用错误捷径 (1-ρ)*K/h² ≈ 515，会误以为样本「绰绰有余」

# HellaSwag 边界对：小 gap + 高 ρ → q < 1 但 p 可能擦边 0.05
hellaswag = resolution_diagnostics(0.783, 0.778, 0.81, n=10_042)
print(f"q={hellaswag['q']:.2f}, resolved={hellaswag['resolved']}")
```

运行后你会看到：5 pp 差距在 ρ=0.3 时 N* ~千级；0.46 pp + ρ≈0.81 时 q 远小于 1——**统计显著与分辨率达标可以分道扬镳**。

---

## 代码示例 2：从 per-prompt 0/1 矩阵估计 ρ 并扫描 leaderboard 相邻对

真实复现应拉 lm-evaluation-harness 的 per-item 分数；这里用合成数据演示**从 (N×2) 正确率矩阵估计 ρ、δ̂、q** 的流程。

```python
import numpy as np

def empirical_paired_stats(correct_a: np.ndarray, correct_b: np.ndarray) -> tuple[float, float, float]:
    """correct_*: bool 或 0/1，长度 N。"""
    assert len(correct_a) == len(correct_b)
    p_a = correct_a.mean()
    p_b = correct_b.mean()
    # 题内相关：Pearson 相关于 0/1 即 phi 系数
    rho = np.corrcoef(correct_a.astype(float), correct_b.astype(float))[0, 1]
    return p_a, p_b, rho


def scan_adjacent_pairs(scores: dict[str, np.ndarray], alpha=0.05, power=0.80) -> list[dict]:
    """scores: 模型名 -> (N,) 0/1 向量，按排行榜顺序传入。"""
    names = list(scores.keys())
    rows = []
    for i in range(len(names) - 1):
        a, b = names[i], names[i + 1]
        p_a, p_b, rho = empirical_paired_stats(scores[a], scores[b])
        n = len(scores[a])
        d = resolution_diagnostics(p_a, p_b, rho, n, alpha, power)
        rows.append({"pair": f"{a} vs {b}", "rank_adjacent": True, **d})
    return rows


# 合成：10000 题，模型逐 rank 略强 0.3pp，ρ≈0.85（强配对）
rng = np.random.default_rng(42)
N = 10_000
base = rng.random(N) < 0.75
models = {}
for k, name in enumerate(["M10", "M9", "M8", "M7"]):
    flip = rng.random(N) < (0.003 * k)  # 逐 rank 多错一点点
    models[name] = base ^ flip

for row in scan_adjacent_pairs(models):
    flag = "✓" if row["resolved"] else "✗ 未达标"
    print(f"{row['pair']}: δ={row['delta_pp']:.2f}pp, q={row['q']:.2f} {flag}")
```

输出会显示：即使相邻模型 gap 只有零点几 pp，在 N=10k、高 ρ 下 **q 常 < 1**——这就是论文对 MMLU-Pro / OLL **相邻名次叙事**的定量警告。

---

## 代码示例 3（可选）：官方 llm-power 包

论文作者发布 **llm-power**（GitHub: akotawala10/llm-power），一行调用对齐 Equation 6：

```python
# pip install llm-power  （以仓库 README 为准）
from llm_power.parametric import parametric_required_n_paired_binary

n_star = parametric_required_n_paired_binary(
    p1=0.65, p2=0.60, rho=0.30, alpha=0.05, power=0.80
)
print(n_star)  # ≈ 1028
```

还提供 bootstrap 功效、McNemar discordance 形式、对 OLL 数据的 **reanalysis** 脚本，适合 benchmark 维护者直接接入 CI。

---

## 方法论要点（进阶）

### 配对 vs 无配对：何时差 2 倍？

当 ρ > 0（共享 prompt 上两模型表现相关）时，σ_D² < Var(X^A) + Var(X^B)，配对检验更高效。ρ → 1 时 discordant pairs 极少，McNemar 本身也会变难；论文要求 ρ 落在 Hoeffding 可容许区间 [ρ_min, ρ_max]。

### 有限样本：该用哪种检验？

论文 Table 2 比较五种配对二元检验；推荐：

- **有二元 0/1 + 可估 ρ**：Equation 6 参数形式；
- **分级分数或无闭式 σ_D**：Definition 2 的**配对 bootstrap**（百分位 CI）。

渐近 McNemar χ²、mid-p、bootstrap 在调参到 80% 功效时经验功效中位 **0.79**；精确条件二项略保守（~0.76）。

### 前瞻性 vs 诊断性用法

- **前瞻性**：benchmark 设计前，指定目标 δ（如 1 pp），算 N* 决定题库规模。
- **诊断性**：观测 δ̂ 后算 N*(δ̂) 与 q——**不是**「观测到的功效」，而是「要支撑这个 gap 叙事需要多大 N」。

论文在 3 对 OLL 真实数据上 bootstrap  subsample 到 N*，经验 McNemar 功效 **0.796–0.827**，验证框架校准良好。

---

## 对实践者的建议

1. **发 leaderboard / 写论文时**：对 headline 相邻对报告 **q 或 N***，而不只报 pp gap 和 p 值。
2. **算样本量时**：勿对 G*Power / pwr 的 per-arm 输出简单 ×(1−ρ)；用 **Var(Δ)** 或 llm-power。
3. **|δ| ≤ 5 pp 的相邻排名**：默认假设「未达标」，除非 q ≥ 1 且通过多重/聚类敏感性检查。
4. **MMLU 类分科 benchmark**：做 subject-level 聚类校正；IID 假设会**乐观**。
5. **持续更新的公开榜**：考虑 anytime-valid 边界，固定 n 结论可能过松。

---

## 与相关工作的关系

| 方向 | 代表 | 与本文关系 |
|------|------|------------|
| 配对二元检验 | McNemar (1947), Connor (1987) | 本文把 required-N **反演**为分辨率报告 |
| NLP 功效倡导 | Card et al. (2020) | 指出 underpowered，未系统对比配对/无配对 required-N |
| LLM 无配对样本量 | Miller (2024) | 独立样本 Gaussian；本文证配对 median **~2.15× 更省 N** |
| Benchmark 方差 | Madaan et al. (2024) | 测跨任务方差；本文聚焦**假设检验分辨率** |
| 构造效度批判 | Bean, Alaa 等 | 正交：高 construct validity 仍可能 **N 太小** 撑不起相邻 gap 声明 |

---

## 局限与未解问题

- 论文**不**声称构造效度或题目质量，只问「给定设计，统计上能否分辨 gap」。
- i.i.d. prompt 假设在真实 benchmark（模板题、泄漏、分布漂移）上可能偏乐观或偏悲观。
- q 与 p 值对单对**信息等价**；价值在**聚合报告**与**设计对话**。
- 闭源 frontier 面板仅 Appendix  illustrative replication（N 较小）。

---

## 学到什么（零基础版）

- **排行榜上的小数点差距是统计主张**，需要配对样本量、相关结构和 α/功效共同决定能否「写进标题」。
- **三个数记牢**：MDE（能看多远）、N*（要看清需要多大 magnifier）、**q = N/N***（当前视力表够不够）。
- **(0.05, 0.8) 下 q ≥ 1** 是论文推荐的「可分辨」操作定义；q < 1 不是说两模型一样好，是说 **benchmark 分辨率不足**。
- **Cohen-h × (1−ρ) 捷径在相邻小差距场景约少算一半 N***，G*Power 用户尤其容易踩坑。
- **真实 public leaderboard 里，28%（OLL）到近半（MMLU-Pro 聚类后）的相邻对未达标**——「谁排第几」的精细叙事应带误差条思维。
- 工具链：**llm-power** 把 Equation 6、bootstrap、reanalysis 封装成可复用 API，benchmark 维护者应比媒体更早看到 q。

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.30315](https://arxiv.org/html/2605.30315v1)
- 代码与复现：[github.com/akotawala10/llm-power](https://github.com/akotawala10/llm-power)
- 配对检验基础：McNemar 检验、Dror et al. (2018) NLP 显著性检验综述
- 功效谬误：Hoenig & Heisey (2001) 「The Abuse of Power」——为何不能用观测效应做事后功效
- 同仓库笔记：[[soundness-bench]]（提案阶段方法论健全性）、[[llm-serving-needs-math]]（LLM 系统侧数学）

---

## 自测题

1. q = 0.5 表示什么？能否因为 p < 0.05 就认为「结论可靠」？
2. 为什么共享 prompt 上 ρ 高反而让 **σ_D 变小**，但小 gap 仍难分辨？
3. Cohen-h + (1−ρ) 与正确 N* 差约 2 倍的结构原因是什么？
4. MMLU-Pro 从 IID 4/9 未达标变为聚类 6/9，物理直觉是什么？
5. 若你只关心「跨档差距」（如 70% vs 55%），分辨率诊断还重要吗？

<details>
<summary>参考答案（点击展开）</summary>

1. 当前 N 只有达标所需 N* 的一半；p < 0.05 只说明在**固定 α 下拒绝 H0**，不保证 **80% 功效意义下的分辨率**；论文 HellaSwag 例即 p≈0.049 但 q≈0.5。
2. ρ 高 → 同对同错多 → 配对差 D 方差小（更高效）；但相邻 SOTA gap 本身常只有 0.x–2 pp，δ 在分母上，N* 仍可能 ≫ N。
3. (1−ρ) 加在单臂方差上；配对差方差含 Var(A)+Var(B)−2Cov，相当于少算因子 2；Lemma 1 给出小 δ 时 n_h/N* → 1/2。
4. 某些科目内模型差距极大（ICC(D) 高），有效独立样本数因 DE 暴跌；两对相邻 rank 从「看起来 resolved」翻转为 N* > 3N。
5. 跨档大 gap 常 q ≫ 1，分辨率诊断较 benign；价值集中在 **adjacent-rank、小 gap headline** 与 **benchmark 设计**。

</details>
