---
title: Locally Coherent, Globally Incoherent — 多组件 LLM Agent 的组合不一致性
来源: https://arxiv.org/abs/2605.30335
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：每个专家都说得对，拼起来却不可能

想象你在组织一场关于「2026 年美国最大 AI 公司 IPO 会落在哪个赛道」的预测：

- **基础设施专家**只盯数据中心/芯片链，给出概率 **0.39**
- **模型实验室专家**只盯大模型公司，给出 **0.73**
- **应用层专家**只盯垂直 SaaS，给出 **0.67**
- **其他赛道专家**负责兜底，给出 **0.71**

每个人在自己的「局部问题」里都很自洽：概率在 0–1 之间，校准也说得过去。但协调员把四个数字**直接拼成联合报价**时，总和是 **2.50**——没有任何真实概率测度能让四个互斥结果的质量之和超过 1。这不是某个专家「算错了」，而是**结构上**局部合理、全局不可能。

Kotawala（Princeton，arXiv:2605.30335）把这类现象正式命名为 **locally coherent, globally incoherent（局部一致、全局不一致，LCGI）**。论文针对的是多组件 LLM Agent：规划器把检索、算术、概率评估路由给不同 specialist，每个组件只看见联合问题的一部分；即使每个组件都经过校准、自洽解码，**聚合后的信念仍可能违反基本概率公理**，从而暴露 Dutch-book（荷兰赌）风险。

类比总结：

| 日常 | 多组件 Agent | 论文术语 |
|------|-------------|---------|
| 四位专家各报局部概率 | 各 sub-agent 输出局部边际 | component marginal $\hat{p}^{(a)}$ |
| 协调员原样拼接 | owner-selected aggregation | 聚合器 $\mathcal{A}$ 只「选坐标」 |
| 四段概率加起来 > 1 | 违反 partition 约束 | 落在 coherent polytope $\mathcal{M}^{\star}$ 外 |
| 看不出谁「错了」 | 单组件监控检测不到 | $\varepsilon^{\star}>0$ 作为系统级证书 |
| 按比例归一化修一下 | 投影到合法概率区域 | hierarchical Boyle–Dykstra / $\Pi^{\star}$ |

---

## 这篇论文在解决什么问题

### 1. 现有手段为什么不够

对**单个** LLM 输出，业界已有不少「一致性」工具：

- **校准（calibration）**：让 $P(\text{事件})$ 与长期频率对齐
- **自洽采样（self-consistency）**：多次采样再投票
- **保形预测（conformal prediction）**：分布无关的覆盖保证

这些都在**组件内部**运作。它们**看不见**跨组件逻辑约束，例如：

- **否定**：$P(A)+P(\neg A)=1$（两个 specialist 各报一半）
- **划分（partition）**：互斥结果概率之和为 1（多个 specialist 各管一块）
- **合取/析取**：Fréchet 边界约束 $P(A\land B)\leq\min(P(A),P(B))$ 等

论文的核心论断：**per-component coherence 一般不能修复 composed system**；失败是**结构性的**，不是 prompt 写不好就能根治。

### 2. 论文贡献（操作化视角）

| 贡献 | 含义 |
|------|------|
| **组合残差** $\varepsilon^{\star}$ | 局部修复后再聚合的报价，到联合 coherent polytope 的 $L_2$ 距离；**运行时**可算 |
| **乘积结构二分法**（Thm 3.3） | 局部一致 ⇒ 全局一致，当且仅当联合多面体可分解为局部笛卡尔积 |
| **Rayleigh 商预测**（Cor 3.9） | 从 specialist 面板协方差预测 $\varepsilon^{\star}$ 量级 |
| **层次 Boyle–Dykstra 投影** | 确定性修复，保留 specialist 路由 |
| **e-process** | 序列部署中的 anytime-valid 一致性监测 |
| **可分解 benchmark** | 1,876 个 ensemble cliques，四类逻辑关系 |

### 3. 实证快照（论文 §5）

- 四类 contemporary LLM 组成的中端 panel 上，**33%–94%** 的 clique 出现 $\varepsilon^{\star}>0$
- 关系类难度排序（约束越紧，残差越大）：**partition > negation > disjunction > conjunction**
- Cor 3.9 的 magnitude 预测在四类中**三类误差 < 7%**
- 朴素组合下 exposure 界 $\sqrt{m^{\star}}\varepsilon^{\star}$ 平均约 **0.137**；层次投影可压到 QP 数值地板
- 三种直觉缓解（检索、partition-aware prompting、aggregator-LLM）**均失败或回退**

---

## 核心概念

### 1. Clique 与 coherent polytope

一个 **clique** $C=(Q_1,\ldots,Q_m,R)$ 包含 $m$ 个 Bernoulli 问题及逻辑关系 $R$。de Finetti 定理保证：所有与 $R$ 一致的边际概率向量构成闭凸多面体

$$
\mathcal{M}_C = \left\{ r \in [0,1]^m : \exists\,\mu \in \Delta(\{0,1\}^m)\ \text{与 } R \text{ 一致} \right\}.
$$

**投影** $\Pi_C(\hat{p})$ 是把报价 $\hat{p}$ 投到 $\mathcal{M}_C$ 上最近的点；**残差** $\varepsilon_C(\hat{p})=\|\hat{p}-\Pi_C(\hat{p})\|_2$ 衡量「离合法概率有多远」。

### 2. 多组件 Agent 与 owner-selected aggregation

- $k$ 个子模型，各自输出 $\hat{p}^{(a)} \in [0,1]^{m_a}$
- 组件级 **JCD（Joint-Coherent Decoding）**：$\Pi_a(\hat{p}^{(a)})\in\mathcal{M}_a$
- 联合问题集 $\mathcal{Q}^{\star}=\bigcup_a \mathcal{Q}_a$，大小 $m^{\star}$
- **耦合集** $\mathcal{C}$：跨组件同一问题标识、逻辑关系、跨组件 partition 等
- **Owner-selected aggregation**：每个联合坐标 $j$ 只由一个组件「拥有」；聚合器**只选取**，不平均、不重采样

> 若改用坐标平均 $\mathcal{A}^{\mathrm{avg}}$，凸性保证输出已在 $\mathcal{M}^{\star}$ 内，LCGI **结构性消失**——但代价是每个坐标要 $k$ 次 elicitation，与 specialist 路由的设计目标相悖。

### 3. 组合残差 $\varepsilon^{\star}$（Definition 3.1）

$$
\varepsilon^{\star}(\hat{p}) = \left\| \mathcal{A}(\Pi_1\hat{p}^{(1)},\ldots,\Pi_k\hat{p}^{(k)}) - \Pi^{\star}\!\left(\mathcal{A}(\Pi_1\hat{p}^{(1)},\ldots,\Pi_k\hat{p}^{(k)})\right) \right\|_2
$$

读法：先把各组件**局部修到自洽**，再按 owner 规则**拼起来**，看这份联合报价离**全局** coherent 集合还有多远。

- $\varepsilon^{\star}=0$：局部修复已满足跨组件约束
- $\varepsilon^{\star}>0$：**证书级**证明系统级不一致；单看任一组件无法发现

### 4. 乘积结构二分法（Theorem 3.3）

记 $\mathcal{M}^{\boxtimes}=\bigcap_a \mathcal{M}_a^{\uparrow}$（只有局部约束、无跨组件耦合时的联合可行集）。

**定理**：在 owner-selected aggregation 下，

$$
\text{局部一致总能保证全局一致} \iff \mathcal{M}^{\star}=\mathcal{M}^{\boxtimes}.
$$

- **相等**：$L_2$ 投影可 blockwise 分解，$\varepsilon^{\star}\equiv 0$（局部-then-global 与 global 交换）
- **真子集**：存在局部皆 coherent 的组成报价，使 $\varepsilon^{\star}>0$

这就是论文所称的 **non-commutation theorem**：「先局部修复再聚合」与「先聚合再全局修复」**何时可交换**。

### 5. 暴露界与 Brier 改进

- **FTAP 暴露**（Cor 3.5）：$\mathrm{Exposure}^{\star}\leq\sqrt{m^{\star}}\,\varepsilon^{\star}$
- **Pythagorean Brier**（Cor 3.6）：全局投影确定性降低 Brier，slack 恰为 $(\varepsilon^{\star})^2$
- **Rayleigh 商**（Cor 3.9）：在随机 owner 分配下，$\mathbb{E}[(\varepsilon^{\star})^2]$ 可由 specialist 协方差与约束法向量闭式估计

### 6. 层次 Boyle–Dykstra 修复（Theorem 3.10）

对局部多面体 $\{\mathcal{M}_a^{\uparrow}\}$ 与耦合集 $\mathcal{C}$ 做 **循环 $L_2$ 投影**，收敛到 $\mathcal{M}^{\star}$ 上的最近点。partition 等 equality 约束常可一步闭式（simplex 投影）；conjunction/disjunction 的 Fréchet 多面体才需要完整循环。

### 7. 运行时三种模式

| 模式 | 行为 |
|------|------|
| **Monitor** | 记录 $\varepsilon^{\star}$，超阈值告警 |
| **Repair** | 下游使用前替换为 $\Pi^{\star}(\cdot)$ |
| **Abstain** | $\varepsilon^{\star}>\tau$ 时拒答或升级人工 |

长期部署还可对残差流 $(\varepsilon^{\star}_t)$ 做 **e-process** 序列检验（§3.7）。

---

## 代码示例 1：计算 partition 上的组合残差

四个 specialist 各报一块互斥赛道的概率，owner-selected 拼接后检查是否违反 $\sum_i p_i = 1$。

```python
import numpy as np

def project_simplex(v: np.ndarray) -> np.ndarray:
    """把向量投影到概率单纯形 {x >= 0, sum x = 1}（Euclidean）。"""
    v = np.asarray(v, dtype=float)
    if v.sum() <= 1 and np.all(v >= 0):
        return v
    # 经典排序法：O(m log m)
    u = np.sort(v)[::-1]
    cssv = np.cumsum(u)
    rho = np.nonzero(u * np.arange(1, len(v) + 1) > (cssv - 1))[0][-1]
    theta = (cssv[rho] - 1) / (rho + 1)
    return np.maximum(v - theta, 0)

def compositional_residual_partition(quote: np.ndarray) -> float:
    """
    partition clique：m 个互斥结果，约束 sum(p)=1, p>=0。
    ε* = ||quote - Π*(quote)||_2
    """
    quote = np.clip(np.asarray(quote, dtype=float), 0.0, 1.0)
    repaired = project_simplex(quote)
    return float(np.linalg.norm(quote - repaired))

# 论文 Figure 1 风格：四块 partition，局部各自合理，拼接总和 2.50
sector_probs = np.array([0.39, 0.73, 0.67, 0.71])
eps_star = compositional_residual_partition(sector_probs)

print(f"sum(quote) = {sector_probs.sum():.2f}")   # 2.50
print(f"ε* (partition) ≈ {eps_star:.3f}")         # 论文报告 ~0.749（含 JCD 等细节时略异）
print(f"repaired   = {project_simplex(sector_probs)}")
print(f"sum(repaired) = {project_simplex(sector_probs).sum():.6f}")
```

要点：**每个分量单独看都在 [0,1]**，但联合约束是「质量和为 1」——这就是 $\mathcal{M}^{\star}\subsetneq\mathcal{M}^{\boxtimes}$ 的典型情形。

---

## 代码示例 2：negation 约束与 exposure 上界

两个组件分别回答 $P(A)$ 与 $P(\neg A)$，耦合约束 $p_A + p_{\neg A} = 1$。

```python
import numpy as np

def project_negation_pair(p_a: float, p_not_a: float) -> tuple[float, float]:
    """投影到 {p_a + p_not_a = 1, 0<=p<=1}。"""
    v = np.array([p_a, p_not_a], dtype=float)
    v = np.clip(v, 0.0, 1.0)
    s = v.sum()
    if abs(s - 1.0) < 1e-12:
        return float(v[0]), float(v[1])
    # 等式约束下的 L2 投影：沿 (1,1) 方向平移
    shift = (s - 1.0) / 2.0
    v = v - shift
    v = np.clip(v, 0.0, 1.0)
    # 若 clipping 破坏等式，再投影一次（小规模闭式足够）
    if abs(v.sum() - 1.0) > 1e-9:
        v = project_simplex(v)
    return float(v[0]), float(v[1])

def exposure_bound(eps_star: float, m_star: int) -> float:
    """Cor 3.5: Exposure* <= sqrt(m*) * ε*（论文实验用 LMSR 统计）。"""
    return float(np.sqrt(m_star) * eps_star)

# 研究组件报 P(Republican)=0.6，预测组件报 P(Democrat)=0.6 —— 论文引言例子
p_rep, p_dem = 0.6, 0.6
quote = np.array([p_rep, p_dem])
repaired = np.array(project_negation_pair(p_rep, p_dem))
eps = float(np.linalg.norm(quote - repaired))

print(f"naive mass = {quote.sum():.2f}")          # 1.20 —— 不可能测度
print(f"ε* (negation) ≈ {eps:.3f}")
print(f"repaired = {repaired}, sum = {repaired.sum():.3f}")
print(f"exposure bound sqrt(m*)ε* ≈ {exposure_bound(eps, m_star=2):.3f}")
```

若 $p_A+p_{\neg A}=1.2$，则存在**无风险套利组合**（Dutch book）：对手可以在你的报价上同时买/卖合约锁定正收益。论文强调：**各组件局部 Dutch-book exposure 可为 0**，正暴露**完全来自跨组件 incoherence**。

---

## 代码示例 3：模拟 owner-selection 与 Rayleigh 商量级（可选直觉）

```python
import numpy as np

def expected_eps_sq_rayleigh(panel: np.ndarray, a: np.ndarray, kappa: float = 1.0) -> float:
    """
    Cor 3.9 简化版：E[(ε*)^2] ≈ κ * (a^T D a / ||a||^2)
    panel: shape (k, m) — k 个 specialist 在 m 维联合坐标上的 JCD 后报价
    a: 绑定约束的法向量（partition 时 a=1 向量；negation 时 a=(1,1)）
    """
    bar = panel.mean(axis=0)
    D = np.diag(((panel - bar) ** 2).mean(axis=0))  # 独立 owner 分配下的有效协方差
    num = float(a @ D @ a)
    den = float(a @ a)
    return kappa * num / den

# 4 个 LLM 对 4 维 partition 各给一个「偏乐观」报价（示意）
rng = np.random.default_rng(0)
panel = rng.uniform(0.45, 0.75, size=(4, 4))
a_partition = np.ones(4)
pred = np.sqrt(expected_eps_sq_rayleigh(panel, a_partition, kappa=1.0))
print(f"predicted E[ε*] (order of magnitude) ≈ {pred:.3f}")
```

论文在 1,876 个 cliques 上验证：该预测与观测 residual 在 negation / partition / disjunction 上匹配良好；conjunction 因 $\bar{\Pi}$ 离边界较远，经验 $\kappa$ 略低。

---

## 四类逻辑关系与难度排序

| 关系类 | 典型约束 | 耦合强度 | 经验 residual 倾向 |
|--------|---------|---------|-------------------|
| **Conjunction** | Fréchet 上界 | 较弱 | 最小 |
| **Disjunction** | Fréchet 下界 | 中等 | 较小 |
| **Negation** | $p+q=1$ | 较强 | 较大 |
| **Partition** | $\sum p_i=1$ | 最强 | **最大** |

partition 的修复在「未 clip」情形下甚至就是给每个坐标减去 $(\sum p_i - 1)/m^{\star}$——算法简单，但**原始错误最大**，因为约束直接作用于质量和。

---

## 与 Agent 框架的关系

LangGraph、AutoGen、CrewAI 等框架常见模式：

1. Planner 路由子任务
2. 各 tool / sub-agent 返回局部结论（含概率、分类、数值）
3. Orchestrator **拼接**进下游 prompt 或决策

若步骤 3 是 owner-selected（每个字段来自单一 specialist），且存在跨字段逻辑约束，则 LCGI **不是 edge case**。论文证明：仅监控各模块输出无法检测此类失败——必须在**组合层**计算 $\varepsilon^{\star}$ 或做 $\Pi^{\star}$ 修复。

---

## 局限与开放问题（论文 §6 摘要）

- 耦合集 $\mathcal{C}$ 需**显式声明**；从 agent transcript **隐式恢复** $\mathcal{C}$ 仍开放
- 层次投影保证几何/Brier 改进，但若真实标签 $p^{\star}\notin\mathcal{M}^{\star}$（标注与逻辑结构不一致），预测增益可能反转（Cor 3.7）
- Abstain 阈值 $\tau$ 与预算化 exposure 的校准未完全解决

---

## 一句话带走

> **多组件 LLM Agent 的失败模式之一：每个部件Locally 看起来是合法概率，拼起来却违反联合逻辑；$\varepsilon^{\star}$ 是可运行时计算的「系统级不一致证书」，Boyle–Dykstra 投影给出确定性修复——这不是 prompt 工程能替代的结构问题。**

---

## 延伸阅读

- 论文 HTML：[arXiv:2605.30335](https://arxiv.org/html/2605.30335v1)
- 作者代码仓库：[akotawala10/composition-incoherence-icml](https://github.com/akotawala10/composition-incoherence-icml)
- 相关 benchmark 数据：Paleka et al. (2025) ensemble cliques；Polymarket partition 场景
- 凸投影理论：Bauschke & Combettes (2017)；Boyle–Dykstra (1986)
- 一致性哲学基础：de Finetti (1937) Dutch book / FTAP

---

## BibTeX

```bibtex
@misc{kotawala2026lcgi,
  title   = {Locally Coherent, Globally Incoherent: Bounding Compositional Incoherence in Multi-Component LLM Agents},
  author  = {Kotawala, Anany},
  year    = {2026},
  eprint  = {2605.30335},
  archivePrefix = {arXiv},
  primaryClass  = {cs.LG},
  url     = {https://arxiv.org/abs/2605.30335}
}
```
