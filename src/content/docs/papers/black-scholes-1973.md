---
title: Black-Scholes 1973 — 用「对冲复制」给期权和公司债定价
来源: https://www.cs.princeton.edu/courses/archive/fall09/cos323/papers/black_scholes73.pdf
日期: 2026-06-13
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

## 是什么

Black & Scholes 1973（*The Pricing of Options and Corporate Liabilities*，*Journal of Political Economy* 81(3):637–654）是现代**衍生品定价**的奠基论文。它回答了一个看似朴素的问题：

> 一张「到期可按约定价买入一股股票」的合约，**今天**应该卖多少钱？

日常类比：你开了一家**复印店**，顾客付定金，约定三个月后能以 100 元买走店里某幅限量版画（当前市价 S 元）。版画价格天天变，但你能**随时买卖版画对冲风险**——Black-Scholes 的核心不是「猜未来股价」，而是：

1. 用股票 + 现金**动态复制**这份合约的 payoff；
2. 若市场上期权价格 ≠ 复制成本，套利者就能无风险赚钱；
3. 因此**唯一合理的价格** = 复制组合的成本 → 闭式公式。

论文标题里的 *Corporate Liabilities* 同样重要：公司债、认股权证、甚至股权，都可看成**标的为「公司资产」的期权组合**——同一套分析可算「违约应折多少价」。

作者 Fischer Black（芝加哥大学）与 Myron Scholes（MIT）；Robert C. Merton 对对冲推导有重要贡献。论文 1970 年投稿、1972 年定稿，曾两次被拒，经 Fama、Miller 推动后 1973 年 5 月发表。Scholes 与 Merton 1997 年获诺贝尔经济学奖（Black 已于 1995 年去世）。

## 为什么重要

不理解这篇论文，下面这些事都讲不清：

- 为什么期权价格**不依赖**投资者对股价涨跌的主观预期（风险中性定价）
- 为什么做市商敢说「我 delta 对冲了」——以及 1987 股灾时对冲为何会集体失灵
- 为什么公司债利率高于国债：不仅是信用，更是**股东持有对资产的看涨期权**，债权人承担下行
- 为什么 VIX、隐含波动率曲面、奇异期权定价树，全都从这里的 PDE 和公式长出来
- 为什么 Kelly 1956 谈「信息 → 财富」，Black-Scholes 谈「波动 → 期权费」——两条线后来在量化基金里汇合

## 核心要点

### 1. 期权术语（论文 Introduction）

| 术语 | 含义 |
|------|------|
| **Call（看涨期权）** | 有权在到期前/到期日按行权价 K 买入标的 |
| **European** | 仅能在到期日 T 行权（公式针对此类） |
| **American** | 到期前任意时刻可行权（更贵，需数值方法） |
| **Strike / Exercise price (K)** | 行权价 |
| **Maturity (T)** | 到期日 |

直觉（论文 Figure 1）：股价 S 越高，call 越值钱；S ≫ K 时 call ≈ S − 贴现后的 K；S ≪ K 时 call ≈ 0；距到期越近，时间价值越少。

### 2. 无套利原则（论文开篇核心句）

> If options are correctly priced in the market, it should not be possible to make sure profits by creating portfolios of long and short positions in options and their underlying stocks.

即：**正确价格下，期权 + 股票的多空组合不能无风险套利**。一切推导从这里出发，而非「预测股价会涨会跌」。

### 3. 「理想市场」假设

论文为推导闭式解假设（后文大量实证与扩展在放松这些条件）：

- 股价服从**几何布朗运动**（对数正态、常数波动率 σ）
- **连续交易**、无摩擦（无手续费、无卖空限制、可借卖）
- 无风险利率 r 恒定
- 不付股息（后人有扩展）

在这些假设下，期权价值 w(S, t) **只依赖**当前股价 S、时间 t 和已知常数——可构造**完美对冲组合**。

### 4. Delta 对冲与复制

记 w(S, t) 为 call 价值。持有一份股票、做空 ∂w/∂S 份期权（论文记为 w_x），组合价值对微小股价变动**一阶免疫**：

```
Δ_portfolio ≈ ΔS − (∂w/∂S)·ΔS ≈ 0
```

连续调整对冲比率（**delta**），组合收益应等于无风险利率——由此得到 **Black-Scholes 偏微分方程（PDE）**：

```
∂w/∂t + (1/2)σ²S² · ∂²w/∂S² + rS · ∂w/∂S − rw = 0
```

边界条件（欧式 call）：到期时 w(S, T) = max(S − K, 0)。

**日常类比**：你不是在赌版画涨价，而是像**调色师**不断调整「股票 : 期权」配比，让小店账本对涨跌暂时「无感」；账本只按国债利率爬升，这个爬升率就是期权今天的公平价。

### 5. Black-Scholes 闭式公式（欧式 call）

令 τ = T − t 为剩余期限：

```
d₁ = [ln(S/K) + (r + σ²/2)τ] / (σ√τ)
d₂ = d₁ − σ√τ

C = S·N(d₁) − K·e^(−rτ)·N(d₂)
```

P（看跌）由 **put-call parity**：

```
P = C − S + K·e^(−rτ) = K·e^(−rτ)·N(−d₂) − S·N(−d₁)
```

N(·) 为标准正态 CDF。注意：**公式里不出现股票期望收益率 μ**——对冲消掉了风险溢价，这是论文最令人惊讶的结论之一。

论文还给出了用 **CAPM** 的等价推导：期权 β 与股票 β 成比例，风险调整折现与 PDE 路径一致。

### 6. 公司负债 = 期权组合

论文后半部分：将**公司资产** V 视为标的，**股权** = 以 V 为标的、行权价为债务面值 D 的**看涨期权**（股东在清偿后拿走剩余）；**债权** = 无风险债 − 看跌期权（违约相当于资产不足）。因此：

- 同一 σ、r 可估**信用利差**（违约风险折价）
- 认股权证（warrant）是标准 call 的变体

这为 Merton 1974 结构化信用模型等后续工作铺了路。

### 7. Greeks（实践延伸，非原文重点）

| Greek | 含义 | Call（直觉） |
|-------|------|----------------|
| **Delta** ∂C/∂S | 对冲比率 | 0→1，价内越深越大 |
| **Gamma** ∂²C/∂S² | Delta 变化速度 | 平价附近最大 |
| **Theta** ∂C/∂t | 时间衰减 | 通常为负 |
| **Vega** ∂C/∂σ | 对波动率敏感 | 总是为正 |

## 实践案例

### 案例 1：手写 Black-Scholes 定价器

```python
import math

def norm_cdf(x: float) -> float:
    """标准正态 CDF Φ(x)"""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def black_scholes_call(S: float, K: float, tau: float, r: float, sigma: float) -> float:
  """欧式看涨：S 现价, K 行权价, tau 剩余年数, r 无风险利率, sigma 波动率"""
  if tau <= 0:
    return max(S - K, 0.0)
  sqrt_tau = math.sqrt(tau)
  d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * tau) / (sigma * sqrt_tau)
  d2 = d1 - sigma * sqrt_tau
  return S * norm_cdf(d1) - K * math.exp(-r * tau) * norm_cdf(d2)

def black_scholes_put(S, K, tau, r, sigma):
  c = black_scholes_call(S, K, tau, r, sigma)
  return c - S + K * math.exp(-r * tau)  # put-call parity

# 例：S=100, K=100, 3 个月, r=5%, σ=20%
C = black_scholes_call(100, 100, 0.25, 0.05, 0.20)
P = black_scholes_put(100, 100, 0.25, 0.05, 0.20)
print(f"Call ≈ {C:.4f}, Put ≈ {P:.4f}")  # Call ≈ 4.62, Put ≈ 3.37
```

**读数**：平价 call 约 4.6 元——不是零，因为三个月内股价仍可能涨过 100；主要价值来自 **vega / 时间价值**。

### 案例 2：离散 Delta 对冲模拟

真实市场不能连续交易；下面用**每日再平衡**近似论文的连续对冲，观察复制误差：

```python
import random
import math

def simulate_gbm_path(S0, mu, sigma, days, dt=1/252):
  """几何布朗运动路径（μ 为真实漂移，定价仍用 r）"""
  prices = [S0]
  for _ in range(days):
    z = random.gauss(0, 1)
    prices.append(prices[-1] * math.exp((mu - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * z))
  return prices

def delta_call(S, K, tau, r, sigma):
  if tau <= 0:
    return 1.0 if S > K else 0.0
  sqrt_tau = math.sqrt(tau)
  d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * tau) / (sigma * sqrt_tau)
  return norm_cdf(d1)

def delta_hedge_pnl(prices, K, r, sigma, T_years):
  """卖 1 份 call，用股票动态对冲；看到期组合能否覆盖 payoff"""
  cash = black_scholes_call(prices[0], K, T_years, r, sigma)  # 初始收取期权费
  dt = 1 / 252
  shares = 0.0
  for i, S in enumerate(prices[:-1]):
    tau = T_years - i * dt
    target = delta_call(S, K, tau, r, sigma)
    shares_needed = target  # 空头 call 需多头股票
    cash -= (shares_needed - shares) * S
    shares = shares_needed
    cash *= math.exp(r * dt)
  ST = prices[-1]
  payoff = max(ST - K, 0.0)
  final = cash + shares * ST - payoff
  return final  # ≈0 说明对冲成功

random.seed(0)
path = simulate_gbm_path(S0=100, mu=0.10, sigma=0.20, days=63)
err = delta_hedge_pnl(path, K=100, r=0.05, sigma=0.20, T_years=63/252)
print(f"对冲残差（应接近 0）: {err:.4f}")
```

**要点**：定价用 r 和 σ，**不用真实 μ**；但对冲频率低、σ 突变、有交易成本时，残差会变大——这是模型与实务的主要裂缝。

### 案例 3：股权作为「资产看涨期权」（结构化直觉）

简化 Merton 视角：公司资产 V=120，债务面值 D=100，一年后到期，无风险利率 r=5%，资产波动 σ_V=25%：

```python
# 股权 = Call(V, K=D)
E = black_scholes_call(120, 100, 1.0, 0.05, 0.25)
# 债权价值 ≈ 贴现面值 − 看跌期权（违约损失）
D_pv = 100 * math.exp(-0.05 * 1.0)
P_on_assets = black_scholes_put(120, 100, 1.0, 0.05, 0.25)
debt_value = D_pv - P_on_assets
print(f"股权价值 ≈ {E:.2f}, 债权价值 ≈ {debt_value:.2f}, 合计 ≈ {E + debt_value:.2f}")
```

资产 V=120 时，股东「实值」看涨；债权人承担 V 跌破 100 的尾部——**信用风险即卖出看跌**。

## 局限与常见误解

1. **波动率非常数**：真实市场存在「波动率微笑/偏斜」，Black-Scholes 是基准，不是终局。
2. **跳跃与厚尾**：1987、2020 等极端日，GBM 假设失效；需 Merton 跳跃扩散、随机波动率（Heston）等。
3. **连续对冲不可行**：离散再平衡带来 **gamma 风险**；做市商靠买卖价差与库存管理存活。
4. **μ 消失了，但 σ 成了新上帝**：σ 估错比 μ 估错更致命；实务用隐含波动率反推市场共识。
5. **American 与股息**：提前行权、分红会改变界条件；闭式公式需修正或数值解。

## 与仓库其他笔记的关系

- [[kelly-criterion-1956]]：最优下注比例 vs 期权对冲——一个管「赌多少次」，一个管「连续复制」
- 现代 ML 波动率预测、深度对冲网络，都是在**放松 GBM** 前提下重谈同一问题

## 一句话总结

Black-Scholes 1973 用**无套利 + 动态对冲**把期权价格写成 S、K、T、r、σ 的函数，并说明公司债与股权不过是同一套期权语言——它把金融从「凭感觉赌方向」变成了「算复制成本」的工程问题。

## 延伸阅读

- [Princeton 课程 PDF 镜像](https://www.cs.princeton.edu/courses/archive/fall09/cos323/papers/black_scholes73.pdf)（本笔记来源）
- [JSTOR 正式版](https://www.jstor.org/stable/1831029)
- Black & Scholes (1972), *Journal of Finance*：公式实证检验
- Merton (1973)：连续时间推广与美式期权框架
- Hull, *Options, Futures, and Other Derivatives*：教科书标准表述
