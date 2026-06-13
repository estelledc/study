---
title: Kelly Criterion — 信息率的新解释
来源: https://www.princeton.edu/~wbialek/rome/refs/kelly_56.pdf
日期: 2026-06-13
子分类: 量化金融
分类: 其他
provenance: pipeline-v3
---

## 是什么

Kelly 1956（*A New Interpretation of Information Rate*）是 Bell Labs 物理学家 **John L. Kelly Jr.** 发表的一篇 10 页论文。它把 Shannon 1948 里的**信道传输率 R**（互信息）和**赌博/投资中的资金指数增长率 G** 画上了等号：

> 若信道输入符号对应可下注的随机事件，且赔率与真实概率一致（公平赔率），赌徒利用接收符号下注，可使资金**指数增长**；使 G 最大的下注策略，其增长率恰好等于信道的 **R**。

日常类比：你有一条**内线电话**（噪声信道），能比赌场大厅早 0.5 秒知道赛马结果。问题不是「这一把赢多少」，而是「**无限重复**时，本金按什么速度复利」。Kelly 给出的答案：**每次只押本金的一定比例**——押太多会在某次连输后归零（破产概率 → 1），押太少又浪费信息优势。最优比例让长期增长率 G 最大，而这个 G 在数学上就是 Shannon 的 **bit/秒**。

论文最初发在 *Bell System Technical Journal* 35(4):917–926（1956 年 7 月），同年亦见于 *IRE Transactions on Information Theory*。后来投资界把公式叫 **Kelly criterion（凯利公式）**；Shannon 本人和 MIT 数学家 Ed Thorp 曾用它在拉斯维加斯试手（见 Poundstone《Fortune's Formula》）。

## 为什么重要

不理解 Kelly 1956，下面这些事都讲不清：

- 为什么「**期望收益最大**」和「**长期不破产**」常常是两套答案——全仓押注 E[资金] 可能很高，但几乎必然破产
- 为什么量化基金、期权交易、体育博彩里都在谈 **fractional Kelly（半凯利）**
- Shannon 的 **R = I(X;Y)** 除了编码定理，还有**不编码**时的经济意义：信息 = 可变现的复利增速
- 为什么 [[shannon-1948]] 之后信息论能走进金融：Kelly 是第一个严格的「信息 → 财富」桥梁
- 现代 portfolio 理论里 **对数效用最大化** 与 Kelly 下注在独立赌局下等价

Kelly 本人 1965 年 41 岁早逝；公式由 Thorp、Berlekamp、Simons 一脉传到文艺复兴科技等对冲基金。Buffett 是否用「变体 Kelly」有争议，但**对数复利思维**与本文一脉相承。

## 核心要点

### 1. 指数增长率 G

赌徒初始本金 V₀，第 N 次后本金 V_N。Kelly 定义（对数底为 2，与信息论一致）：

```
G = lim_{N→∞} (1/N) log₂(V_N / V₀)
```

- G > 0：资金以 2^G 倍/局的复利速度增长（渐近意义）
- G = 1：每局本金翻倍（无噪声、全知、公平赔率的理想情况）
- G < 0：长期趋向破产

**关键**：优化目标是 **G**，不是单局的 E[V] 或「赢的概率」。

### 2. 噪声二元信道 + 公平赔率（论文核心例子）

信道传输「赢/输」，正确概率 q，错误概率 p（p + q = 1）。赌场给**公平赔率**（赢一倍本金）。每次押本金比例 ℓ（0 ≤ ℓ < 1），W/L 为赢/输次数，则：

```
V_N = (1+ℓ)^W (1-ℓ)^L V₀
G   = q·log₂(1+ℓ) + p·log₂(1-ℓ)    （几乎必然成立）
```

对 ℓ 求极大，利用 log 凹性得：

```
(1+ℓ) / (1-ℓ) = q / p
ℓ* = q - p = 2q - 1    （当 q > 1/2 时才有正下注）
G_max = 1 + p·log₂ p + q·log₂ q = R
```

**R 正是 Shannon 信道容量（二元对称信道）**。信息优势 q > 0.5 时，最优策略不是全仓，而是只押 **(2q-1)** 的本金比例。

若 q = p = 0.5（信道无用），则 ℓ* = 0——**公平赔率下没有优势就不下注**，哪怕期望看起来「不亏」。

### 3. 一般情形：多符号 + 任意赔率

符号 s 真实概率 p(s)，收到 r 后下注比例 a(s|r)，赔率 α_s（押 1 元正确时拿回 α_s 元，含本金）。资本增长率：

```
G = Σ_{s,r} p(s,r) · log₂( Σ_s' a(s'|r)·(α_{s'} - δ_{s,s'}) + (1 - Σ_{s'} a(s'|r)) )
```

（δ 为 Kronecker 符号；未押出的部分保留为现金。）在**公平赔率** α_s = 1/p(s) 且独立重复下，使 G 最大的策略满足：**收到 r 后，按后验 q(s|r) 的比例分配赌注**。此时最大 G 等于互信息 I(S;R)。

若赔率由另一套概率 q̃(s) 定价（市场隐含概率），则 G 的增量仍与 **I(S;R)** 相关；存在 **track take**（抽水）时公式更复杂。

### 4. 与经典「凯利公式」的对应

单次赌局：赢概率 p，净赔率 b（赢则净赚 b，输则亏光所押），最优押注比例：

```
f* = (p·(b+1) - 1) / b = (p·b - q) / b     （q = 1-p）
```

这是二元 Kelly 在**非公平赔率**下的常见写法，可由论文一般式退化得到。投资里常写 **f* = μ/σ²**（正态近似），那是连续情形的推广，不是 Kelly 原文重点。

### 5. Kelly 对 Shannon 的「新解释」

Shannon 定理：存在编码使误码率任意小，传输率可达 R。Kelly 补充：**即使不做编码**，只要接收方能**反复下注、复利再投资**，R 仍度量「能从信道榨出的最大指数财富增速」。这给雷达、侦听等「无法编码」场景提供了不同于任意 cost function 的、与概率结构绑定的价值度量。

## 实践案例

### 案例 1：内线 60% 准确，公平赔率

q = 0.6，p = 0.4 → ℓ* = 0.2。模拟 10 000 局，对比 ℓ = 0.2 / ℓ = 1.0 / ℓ = 0.5：

```python
import random
import math

def simulate(q, ell, n_rounds=10_000, v0=1.0, seed=42):
    random.seed(seed)
    v = v0
    for _ in range(n_rounds):
        win = random.random() < q
        v *= (1 + ell) if win else (1 - ell)
        if v < 1e-12:
            v = 0.0
            break
    g_empirical = math.log2(v / v0) / n_rounds if v > 0 else float("-inf")
    return v, g_empirical

q = 0.6
g_theory = 1 + 0.4 * math.log2(0.4) + 0.6 * math.log2(0.6)  # ≈ 0.029

for ell in (0.2, 0.5, 1.0):
    v, g = simulate(q, ell)
    print(f"ell={ell:.1f}  final={v:.4f}  G_hat={g:.4f}")

print(f"G_theory (R) = {g_theory:.4f}")
```

典型输出：ℓ=0.2 时 G_hat 接近 0.029；ℓ=1.0 常中途破产（final≈0）；ℓ=0.5 波动大且 G 偏低。**全仓最大化期望，却毁掉几乎必然的长期 G**——这就是 Kelly 论文要强调的悖论。

### 案例 2：多结果公平赔率 + 后验下注

三场赛马，真实概率 p = (0.5, 0.3, 0.2)。公平赔率 α_s = 1/p(s)。信道有时传错：收到 r 时后验 q(s|r) 已知。最优：把**当前本金的 q(s|r) 倍**押在 s 上（各结果互斥，总押注 ≤ 1）。

```python
import numpy as np

p = np.array([0.5, 0.3, 0.2])
alpha = 1.0 / p  # 公平赔率

# 收到信号 r=0：后验略偏向马 0
q_given_r = np.array([0.62, 0.25, 0.13])
q_given_r /= q_given_r.sum()

def growth_rate(p_joint, bet_fractions):
    """bet_fractions[r][s] = 收到 r 时押在 s 上的本金比例"""
    g = 0.0
    for r in range(len(bet_fractions)):
        for s in range(len(p)):
            # 简化：单信号 r，联合概率 p(s) 加权
            pass
    return g

# 单信号情形：每次按后验下注
def one_bet_growth(q, alpha, p_true):
  # 公平赔率下回报：押 a_s 在 s，若 s 发生则乘子为 1 + a_s*(alpha_s-1) = a_s*alpha_s + (1-sum a)
  a = q.copy()  # Kelly：a(s) = q(s|r)
  cash = 1.0 - a.sum()
  factors = cash + a * alpha
  # 期望对数增长率 E_s[ log2( factor_s ) ]
  return np.sum(p_true * np.log2(factors))

g_opt = one_bet_growth(q_given_r, alpha, p)
print(f"G per bet (nats base2): {g_opt:.4f}")

# 互信息 I(S;R) 上界（需完整信道矩阵）；此处展示后验比先验更「尖」时 G 为正
g_prior = one_bet_growth(p, alpha, p)
print(f"G if bet prior (no info): {g_prior:.4f}")
```

无信息时应用先验 p 下注，G 为 0（公平市场无 edge）。有噪声内线使后验偏离先验时，G > 0。**信息的价值 = 对数财富增速的增量**。

### 案例 3：投资语境——edge 与 half-Kelly

估计某策略胜率 p=0.55，赔率为 1:1（b=1）：f* = 2×0.55 - 1 = **0.10**（押 10% 本金）。实务常用 **half-Kelly（5%）** 降低估计误差和路径波动——论文假设概率已知；真实市场要打折。

## 踩过的坑

1. **把 Kelly 当「这一把押多少能赢」**：Kelly 优化的是**渐近几乎必然**的指数增长率，短期方差极大，可能出现很长回撤。
2. **全仓因为 E[资金] 更大**：二元公平例子中 ℓ=1 时 E[V_N] = (2q)^N V₀ 看似很美，但 P(破产)→1。Kelly 与「期望最大化」分道扬镳。
3. **概率估错**：f* 对 p 极敏感；高估 edge 会导致**过度下注**，比保守更危险。实务普遍 fractional Kelly。
4. **相关赌局**：论文假设**独立**重复。投资组合里资产相关时，简单 f* 不再最优，需多资产 Kelly 或均值-方差近似。
5. **赔率含抽水**：公平赔率 α_s = 1/p(s) 是理想；真实体育/赌场有 vig，G 会下降，有时 ℓ*=0。
6. **与 Shannon 容量混淆**：G_max = R 是在特定赌博模型下；**不等于**任意通信系统都能「变现」为等额收益——需要可重复下注、复利、赔率结构匹配。

## 适用 vs 不适用场景

**适用**：

- 重复性独立（或弱相关）赌局/交易，可复利再投资
- 有**概率优势**且赔率已知或可调
- 分析「信息通道」的经济价值（侦听、低延迟行情、内幕信号——法律与伦理另论）
- 理解对数效用、熵与金融的桥梁

**不适用**：

- **一次性**决策（买房、职业选择）——没有 N→∞ 复利语境
- 概率/赔率**严重不确定**且无保守折扣
- 存在**破产吸收壁**以外的约束（保证金、杠杆强平）——需修正模型
- 多人博弈、市场冲击：你的下注改变赔率

## 与相关工作的关系

| 概念 | 关系 |
|------|------|
| [[shannon-1948]] | R、互信息 I(X;Y) 的定义来源；Kelly 赋予 R「无编码」的经济意义 |
| Von Neumann 效用 | Kelly 批评任意 cost function 过泛；下注模型内生于「人能获利」 |
| Thorp / 21 点 | 将 Kelly 用于可数牌面赌局，写进 *Beat the Dealer* |
| 现代 portfolio | 对数效用、CRRA、风险平价与 Kelly 家族相关；多资产需扩展 |
| Black-Scholes | 连续时间极限下 Kelly 与 growth-optimal portfolio 接轨 |

## 历史小故事（可跳过）

- Kelly 在 Bell Labs 与 Shannon 同僚，论文动机是回应同行「**不编码时传输率有何意义**」的困惑。
- Shannon 和 Thorp 曾带 **Wearable 计算机** 去拉斯维加斯（未在 Kelly 原文，属后续传奇）。
- 论文标题强调 **Information Rate**，不是「赌博公式」——投资界的「Kelly criterion」是后来命名。
- Kelly 1965 年因脑溢血去世；年仅 41 岁。公式的影响远超过他个人的职业生涯长度。

## 小结

Kelly 1956 用「**有内线电话的赌徒**」讲清了一件事：**Shannon 信道传输率 = 最优复利下注下的最大指数增长率**。核心操作是每次押 **ℓ***（二元公平情形 ℓ* = 2q−1），而非全仓。它把信息论从「传比特」扩展到「传财富增速」，为量化投资与重复博弈提供了与熵同构的标尺。读原文时建议对照 [[shannon-1948]] 的二元对称信道容量公式——两个式子应当逐项重合，那是整篇论文最美的一处。

## 延伸阅读

- 原文 PDF：[Kelly 1956](https://www.princeton.edu/~wbialek/rome/refs/kelly_56.pdf)
- Shannon 1948：[[shannon-1948]]
- Thorp, *Beat the Dealer* (1962)；Poundstone, *Fortune's Formula* (2005)
- Cover & Thomas, *Elements of Information Theory* — 第 16 章赌博与数据压缩的对偶
