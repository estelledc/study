---
title: Almgren–Chriss 2001 — 大单怎么卖才「又快又省、还不赌方向」
来源: https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf
日期: 2026-06-13
子分类: 量化金融
分类: 其他
provenance: pipeline-v3
---

## 是什么

Almgren & Chriss 的 *Optimal Execution of Portfolio Transactions*（1999 工作论文，2001 年正式发表于 *Journal of Risk* 3(2):5–39）是**最优执行（optimal execution）**领域的奠基论文。它回答一个机构交易员每天都在面对的问题：

> 我手里有一大块股票要卖（比如 100 万股），必须在下午 4 点前清完。是一次性砸盘，还是慢慢拆单？拆多慢才划算？

日常类比：你要在跳蚤市场**清空一整箱旧书**（初始持仓 X）。两种极端做法：

1. **一口价全甩**（第一分钟全卖）：买家立刻知道你急着出手，会狠狠砍价——成交单价差，但**价格风险为零**（反正已经卖光了，后面涨跌与你无关）。
2. **均匀慢慢卖**（TWAP / 匀速清仓）：每分钟卖同样多，冲击小、单价好，但**拖得越久，中间价随机波动越大**——可能越卖越亏。

Almgren–Chriss 用可计算的数学模型，在这两个极端之间画出一条**有效前沿（efficient frontier）**：对每个「能接受的不确定性水平」，给出**期望成本最低**的拆单轨迹；并在线性冲击假设下给出**闭式解**——持仓随时间按双曲正弦曲线衰减。

Robert Almgren（芝加哥大学数学系）与 Neil Chriss（高盛资管 / Courant）把 **implementation shortfall**（Perold 1988：相对初始市值的成交损失）拆成：**永久冲击 + 临时冲击 + 波动风险**，再像 Markowitz 组合那样做**均值–方差权衡**。后来的 VWAP/TWAP 改进、流动性调整 VaR（L-VAR）、高频执行算法，大多可追溯到这篇论文的框架。

## 为什么重要

不理解 Almgren–Chriss，下面这些事都讲不清：

- 为什么机构卖大单不能「一把梭」——**市场冲击（market impact）**会吃掉 Alpha
- 为什么 TWAP（时间加权平均价）是**风险中性**下的自然策略，而真实交易员往往**前重后轻**地卖
- 为什么执行算法要调「**urgency / risk aversion**」旋钮——同一篮子，保守与激进对应有效前沿上不同点
- 为什么 [[black-scholes-1973]] 管「期权怎么定价」，Almgren–Chriss 管「**库存怎么变现**」——量化交易两条支柱
- 为什么做市商、券商 TCA（Transaction Cost Analysis）报告里会出现 **implementation shortfall** 与 **临时/永久冲击** 分解

## 核心要点

### 1. 交易轨迹与符号

在 `[0, T]` 内卖光 `X` 股。离散化为 `N` 个时段，每段长度 `τ = T/N`：

| 符号 | 含义 |
|------|------|
| `x_k` | 时刻 `t_k` 结束时**仍持有**股数，`x_0 = X`，`x_N = 0` |
| `n_k` | 第 `k` 段**卖出**股数，`n_k = x_{k-1} - x_k` |
| `S_k` | 中间价（mid price） |
| `σ` | 价格波动率（算术随机游走尺度） |
| `γ` | **永久冲击**系数：每卖 1 股，均衡价永久下移 `γ` 美元 |
| `η` | **临时冲击**系数：交易速率 `v` 越大，成交价相对中间价越差 |
| `λ` | **风险厌恶**参数：惩罚成交成本方差 |

### 2. 价格动态：永久 vs 临时冲击

**永久冲击**（equilibrium price 被你的卖压改写，卖完后仍留在价格上）：

```
S_k = S_{k-1} + σ·ξ_k − γ·n_k        （ξ_k 为零均值单位方差噪声）
```

**临时冲击**（只影响本段成交价，下一段流动性恢复）：

```
S̃_k = S_{k-1} − η·(n_k/τ)             （线性临时冲击，速率 v = n_k/τ）
```

直觉：永久冲击像「市场记住了你卖过很多」；临时冲击像「这一分钟订单簿被你吃穿，下一分钟又补货」。

### 3. 期望成本与方差

对纯卖出程序，论文给出（线性冲击 `g(v)=γv`，`h(v)=ηv`）：

```
E[成本] = ½γX² + η·Σ_k (n_k²/τ)       （永久项 + 临时二次项）
Var[成本] = σ²·Σ_k x_k²·τ              （未平仓头寸暴露在波动下）
```

优化目标（拉格朗日形式）：

```
min  E + λ·Var
```

- `λ → 0`（风险中性）：均匀卖 → **TWAP**，最小化冲击成本
- `λ → ∞`（极度厌恶方差）：尽快卖光 → 接近**第一分钟清仓**

### 4. 闭式最优轨迹（论文式 17–18）

连续时间极限下，剩余持仓：

```
x(t) = X · sinh(κ·(T−t)) / sinh(κ·T)

κ = √(λ·σ² / η)                        （特征速率）
```

**半衰期（half-life / e-life）**：`τ_half = 1/κ`。它与截止时刻 `T` 无关，只由 `σ、η、λ` 决定——表示「在没有硬 deadline 时，自然清仓的时间尺度」。

- 若 `T ≫ τ_half`：大部分货在 deadline 很早之前就卖完（像「尽快卖」）
- 若 `T ≪ τ_half`：时间太紧，只能近似匀速卖（像 TWAP）

### 5. 有效前沿与 L-VAR

所有最优策略在 `(E[成本], Var[成本])` 平面上形成**有效前沿**：同方差下期望成本最小。论文还讨论：

- **二次效用**：选前沿上切点，对应某个 `λ`
- **VaR 约束**：引出 **liquidity-adjusted VaR（L-VAR）**——把「卖不完的价格风险」和「卖太快冲击成本」放进同一风险度量

### 6. 静态策略为何够好？

在**收益独立、对称风险惩罚**假设下，最优策略可**事前确定**（open-loop），不必盘中根据价格改计划。论文第 4 节讨论漂移、序列相关、财报等「信息事件」：增益通常随组合规模增大而**占比变小**——因此 TWAP/Almgren–Chriss 轨迹仍是工业界强基准。

## 代码示例 1：计算最优持仓曲线与 TWAP 对比

```python
import numpy as np
import matplotlib.pyplot as plt

def almgren_chriss_holdings(X, T, sigma, eta, lam, n_steps=200):
    """剩余持仓 x(t)，线性临时冲击 + 算术波动风险."""
    tau = T / n_steps
    kappa = np.sqrt(lam * sigma**2 / eta)
    t = np.linspace(0, T, n_steps + 1)
    if kappa * T < 1e-8:
        # λ→0：TWAP
        x = X * (1 - t / T)
    else:
        x = X * np.sinh(kappa * (T - t)) / np.sinh(kappa * T)
    return t, x

def expected_cost_variance(x, X, T, sigma, eta, gamma=0.0, n_steps=200):
    """离散化 E 与 Var（与论文式 4–5 一致）."""
    tau = T / n_steps
    n = -np.diff(x)  # 每段卖出量
    E = 0.5 * gamma * X**2 + (eta / tau) * np.sum(n**2)
    V = (sigma**2) * tau * np.sum(x[:-1] ** 2)
    return E, V

# 卖 1,000,000 股，2 小时内清盘
X, T = 1_000_000, 2.0 * 3600  # 秒
sigma, eta, gamma = 0.0002, 1e-6, 1e-10
lam = 1e-10  # 风险厌恶：越大越「急着卖」

t, x_ac = almgren_chriss_holdings(X, T, sigma, eta, lam)
_, x_twap = almgren_chriss_holdings(X, T, sigma, eta, 0.0)

E_ac, V_ac = expected_cost_variance(x_ac, X, T, sigma, eta, gamma)
E_tw, V_tw = expected_cost_variance(x_twap, X, T, sigma, eta, gamma)

kappa = np.sqrt(lam * sigma**2 / eta)
print(f"κ = {kappa:.2e}, half-life τ = {1/kappa:.0f}s")
print(f"Almgren–Chriss: E={E_ac:,.0f}, Var={V_ac:,.0e}")
print(f"TWAP (λ=0):     E={E_tw:,.0f}, Var={V_tw:,.0e}")
```

典型输出解读：`λ` 较大时 `E` 略升、`Var` 显著下降——用一点冲击成本换更确定的成交。

## 代码示例 2：扫描有效前沿（不同 λ 的一条曲线）

```python
import numpy as np

def efficient_frontier(X, T, sigma, eta, gamma=0.0, n_lambdas=40):
    """扫描 λ，得到 (E, Var) 有效前沿点集."""
    taus = np.logspace(-14, -6, n_lambdas)
    points = []
    n_steps = 100
    tau = T / n_steps
    t_grid = np.linspace(0, T, n_steps + 1)

    for lam in taus:
        kappa = np.sqrt(lam * sigma**2 / eta)
        if kappa * T < 1e-8:
            x = X * (1 - t_grid / T)
        else:
            x = X * np.sinh(kappa * (T - t_grid)) / np.sinh(kappa * T)
        n = -np.diff(x)
        E = 0.5 * gamma * X**2 + (eta / tau) * np.sum(n**2)
        V = (sigma**2) * tau * np.sum(x[:-1] ** 2)
        points.append((E, V, lam))
    return points

X, T = 500_000, 3600
sigma, eta = 0.0003, 2e-6

frontier = efficient_frontier(X, T, sigma, eta)
# 前沿最低点 ≈ TWAP（Bertsimas–Lo 所称 naive strategy）
E_min = min(p for p, _, _ in frontier)
print("Frontier sample (E, Var, λ):")
for E, V, lam in frontier[::8]:
    tag = "← near TWAP" if abs(E - E_min) < 1 else ""
    print(f"  E={E:12,.0f}  Var={V:12,.0e}  λ={lam:.1e} {tag}")
```

有效前沿通常**光滑凸**：在 TWAP 点附近，方差一阶下降、期望成本仅二阶上升——论文用此解释「略偏离 TWAP 可大幅降风险」。

## 与相关工作的关系

| 方向 | 代表 | 与本文关系 |
|------|------|------------|
| 仅最小化期望成本 | Bertsimas & Lo (1998) | 动态规划；无方差项时常退化为 TWAP |
| 几何布朗 / 非线性风险 | Gatheral & Schied (2011) | 换风险准则仍可得闭式或 HJB 解 |
| 瞬态冲击（resiliency） | Obizhaeva & Wang (2013) | 最优轨迹出现「块交易 + 连续」；VWAP 不再最优 |
| 多资产组合 | 论文附录 A | 相关矩阵进入最优路径；需联合清算 |
| 期权定价 | [[black-scholes-1973]] | 管「衍生品价值」；本文管「现货库存变现」 |
| 资金增长率 | [[kelly-criterion-1956]] | 管「押多少」；本文管「每分钟卖多少」 |

## 局限与实务注意

1. **线性冲击**：大单时临时冲击常呈**凹函数**（平方根法则），线性 `η` 会低估/高估成本；实务常按规模分段标定 `η`。
2. **算术 vs 几何布朗**：短周期执行可用算术近似；长线或高波动需 GBM 扩展。
3. **开环策略**：计划事前固定；若盘中出现未建模信息（突发新闻），需动态重优化——论文第 4.3 节对**预定新闻事件**给出分段静态解。
4. **买入对称**：买仓建仓与卖仓清仓公式镜像；纯卖程序下最优解**不会出现回补**（`n_k > 0` 单调减仓）。
5. **参数估计**：`σ` 来自历史波动，`η, γ` 来自微观结构回归或券商 TCA——模型输出质量取决于校准，而非公式本身。

## 一句话总结

Almgren–Chriss 把「大单怎么拆着卖」变成**冲击成本 vs 库存波动风险**的均值–方差问题：在线性冲击下，最优轨迹是 `sinh` 形衰减；风险厌恶 `λ` 扫出一条有效前沿，TWAP 是风险中性角点，「半衰期」给出与 deadline 无关的自然清仓时间尺度——这是现代执行算法与 TCA 的理论起点。

## 延伸阅读

- 原文 PDF：[Optimal Execution of Portfolio Transactions](https://www.smallake.kr/wp-content/uploads/2016/03/optliq.pdf)（与 1999 预印本同源）
- 正式发表：*Journal of Risk* 3(2), 2001
- 综述讲义：Gatheral, *Optimal Execution*（含无价格操纵条件与扩展模型）
- 实现参考：[joshuapjacob/almgren-chriss-optimal-execution](https://github.com/joshuapjacob/almgren-chriss-optimal-execution)（Jupyter + 真实股价示例）
