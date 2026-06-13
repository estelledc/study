---
title: The 10 Reasons Most Machine Learning Funds Fail — 金融机器学习十大失败原因
来源: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3104816
日期: 2026-06-13
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

## 是什么

Marcos López de Prado 2018 年发表于 *Journal of Portfolio Management* 的短文（SSRN #3104816），系统总结了**金融机器学习（Financial ML）基金**高失败率的十个结构性错误。论文与同年出版的 *Advances in Financial Machine Learning*（AFML）一脉相承，可视为该书的「失败模式清单」。

日常类比：想象你开了一家**用 AI 预测天气的旅行社**。普通 ML 教程教你在「每天固定整点」采样温度、用「是否下雨」当标签、反复调参直到回测漂亮——这在气象数据上也许可行。但金融市场更像**一团不断被新闻、算法和流动性搅动的雾**：信号极弱、样本不独立、标签互相重叠、同一套历史路径只能测一次。把 ImageNet 那套流程原封不动搬过来，相当于用拍证件照的方法预测台风路径——模型越灵活，**假阳性**产出越快。

论文把十个陷阱分为四类（见 Exhibit 1）：

| 类别 | 陷阱 | 对策 |
|------|------|------|
| 认识论 | ① 西西弗斯范式 | 元策略（Meta-Strategy）范式 |
| 认识论 | ② 用回测做研究 | 特征重要性分析 |
| 数据处理 | ③ 按日历时间采样 | 成交量时钟（Dollar Bars） |
| 数据处理 | ④ 整数阶差分 | 分数阶差分（FracDiff） |
| 标注 | ⑤ 固定时间 horizon 标签 | 三重屏障（Triple Barrier） |
| 标注 | ⑥ 同时学方向与仓位 | 元标注（Meta-Labeling） |
| 标注 | ⑦ 非 IID 样本等权 | 唯一性加权 + 序列自助法 |
| 评估 | ⑧ 交叉验证泄漏 | Purging + Embargo |
| 评估 | ⑨ 仅 Walk-Forward 回测 | 组合净化交叉验证（CPCV） |
| 评估 | ⑩ 回测过拟合 | 收缩 Sharpe（DSR） |

## 为什么重要

- **量化基金失败率本就很高**，ML 赛道更高：灵活模型 + 低信噪比 ≈ 加速制造「看起来有效」的策略
- 论文点破一个行业潜规则：**反复回测直到 Sharpe 好看**，在 ASA 伦理指南里接近学术不端；约 20 次迭代在 5% 显著性下就能「发现」假策略
- 后续 AFML、mlfinlab、Hudson & Thames 等生态，很多工具（FracDiff、Triple Barrier、CPCV、Meta-Labeling）都从这里长出
- 对零基础读者：即使不做基金，也能理解**为什么 Kaggle 冠军策略不能直接上实盘**——问题不在模型，在**数据构造、标签、验证协议**

## 核心概念（按流水线理解）

### 1. 西西弗斯范式 vs 元策略范式

discretionary PM 各自为战、靠直觉下注可以分散风险；但把「雇 50 个 PhD、每人半年交一个策略」复制到 quant/ML，只会逼人在过拟合回测与拥挤因子之间二选一。元策略范式把研究拆成**流水线**：数据、特征、执行模拟、回测各自有质量标准，个人专精一环——像汽车工厂，而非每人从零造一辆车。

### 2. 用回测做研究 → 用特征重要性做研究

正确流程：`(X, y)` 上训练分类器 → 交叉验证看泛化 → **问哪些特征真正驱动性能** → 再设计经济解释与样本外检验。回测是**验收**，不是**搜索**；把回测当搜索工具，等价于对同一数据集做多次假设检验却不校正。

### 3. 时间 Bar 的问题与 Dollar Bar

市场按**信息到达**而非按秒表运行。固定 5 分钟 bar 在开盘 oversample、午间 undersample，带来序列相关与异方差。Dollar bar：每成交固定**美元名义金额**采一个观测，使 bar 频率更稳定，对拆股、回购等公司行为也更鲁棒。

### 4. 分数阶差分：在平稳与记忆之间取平衡

经典做法：`log return = diff(log price, 1)` 使序列平稳，但**抹掉过多记忆**，预测力随之消失。FracDiff 用阶数 `d ∈ (0,1)`：足够小则保留记忆，足够大则通过 ADF 检验。论文举例：E-mini S&P 500 对数价在 `d≈0.4` 时可拒绝单位根，且与原序列相关约 0.995；而 `d=1` 时相关仅 0.05——**几十年实证可能一直在用过差分数据**，从而「证明」市场不可预测。

### 5. 三重屏障标签

固定 horizon 标签（h 个 bar 后涨跌）忽略波动率差异与止损现实。三重屏障：**止盈线、止损线、垂直时间/活动屏障**；先触碰哪条决定标签。标签是**路径依赖**的，与真实交易退出逻辑一致。

### 6. 元标注：方向与仓位解耦

Primary 模型负责**买还是卖**（高 recall）；Secondary 模型学习「primary 的这次信号该不该跟」（提高 precision），只决定**仓位大小**。这样降低过拟合对整体行为的控制，也便于 quantamental（基本面 + ML）架构。

### 7. 非 IID：唯一性加权

标签常跨越多个 bar（重叠），像化验室**试管血样互相串了**。要对每个观测算「并发标签数」，给**唯一性高**的样本更大权重；自助抽样时优先抽高唯一性样本（Sequential Bootstrap）。

### 8. Purging 与 Embargo

标准 k-fold 在 finance 会**泄漏**：`t` 与 `t+1` 特征相关，标签又因重叠而相关，测试集信息漏进训练集。Purging：删掉训练集中与测试标签**时间重叠**的样本；Embargo：在测试段之后留一段**禁训区**，防止序列相关特征泄漏。

### 9. CPCV vs Walk-Forward

WF 只走**一条历史路径**，易对特定牛熊顺序过拟合；且早期决策只用很少数据。CPCV 在 N 组序列上枚举大量 train/test 组合，得到**多条回测路径**和 Sharpe **分布**，而非单点估计。

### 10. 回测过拟合与 DSR

在 `I` 个独立试验、真实 Sharpe=0 的情况下，**最大样本 Sharpe 的期望仍 >0**（类似 multiple testing）。Deflated Sharpe Ratio（DSR）把「试了多少策略」纳入显著性，修正选择偏差；PSR 则处理短样本、偏度、峰度对 Sharpe 推断的影响。

## 代码示例 1：分数阶差分（FracDiff）

下面用纯 NumPy 实现 FracDiff 权重与变换（教学用；生产环境可用 `mlfinlab` / `fracdiff` 包）：

```python
import numpy as np
from statsmodels.tsa.stattools import adfuller

def fracdiff_weights(d: float, size: int) -> np.ndarray:
    """Binomial-style weights w_k for fractional differentiation order d."""
    w = [1.0]
    for k in range(1, size):
        w.append(-w[-1] * (d - k + 1) / k)
    return np.array(w)

def fracdiff_series(x: np.ndarray, d: float, threshold: float = 1e-5) -> np.ndarray:
    """
    Apply FracDiff with weight cutoff.
    x: 1-D price or log-price series.
    """
    w = fracdiff_weights(d, len(x))
    # Drop negligible tail weights for speed
    w = w[np.abs(w) > threshold]
    width = len(w)
    out = np.full(len(x), np.nan)
    for i in range(width - 1, len(x)):
        window = x[i - width + 1 : i + 1][::-1]  # x_t, x_{t-1}, ...
        out[i] = np.dot(w, window)
    return out

# 演示：合成带趋势的价格序列
np.random.seed(42)
n = 2000
log_price = np.cumsum(np.random.randn(n) * 0.01) + 0.0002 * np.arange(n)

for d in [0.0, 0.3, 0.5, 1.0]:
    fd = fracdiff_series(log_price, d)
    valid = fd[~np.isnan(fd)]
    adf_stat = adfuller(valid, maxlag=1, regression="c", autolag=None)[0]
    corr = np.corrcoef(log_price[-len(valid):], valid)[0, 1]
    print(f"d={d:.1f}  ADF={adf_stat:7.3f}  corr(original)={corr:.4f}")
```

**预期直觉**：`d=0` 非平稳；`d` 增大 ADF 更负（更平稳）但 `corr` 下降；存在某个 `d*` 在「拒绝单位根」与「保留记忆」之间折中——这正是论文对 E-mini 的核心论点。

## 代码示例 2：三重屏障标签（简化版）

```python
import numpy as np
import pandas as pd

def triple_barrier_labels(
    prices: pd.Series,
    events: pd.DatetimeIndex,
    pt_sl: tuple[float, float],  # profit-take / stop-loss multiples of vol
    vol: pd.Series,
    vertical_bars: int,
) -> pd.DataFrame:
    """
    Path-dependent labels: +1 upper, -1 lower, 0 vertical (optional: use sign).
    prices: close series indexed by time
    events: entry timestamps (must exist in prices index)
    vol: e.g. rolling std of returns, aligned to prices
    """
    records = []
    idx = prices.index
    for t0 in events:
        if t0 not in idx:
            continue
        i0 = idx.get_loc(t0)
        p0 = prices.iloc[i0]
        sigma = vol.loc[t0]
        if sigma <= 0 or np.isnan(sigma):
            continue
        upper = p0 * (1 + pt_sl[0] * sigma)
        lower = p0 * (1 - pt_sl[1] * sigma)
        label = 0
        touch_time = idx[i0]
        end = min(i0 + vertical_bars, len(prices) - 1)
        for i in range(i0 + 1, end + 1):
            p = prices.iloc[i]
            if p >= upper:
                label = 1
                touch_time = idx[i]
                break
            if p <= lower:
                label = -1
                touch_time = idx[i]
                break
        else:
            # vertical barrier first: label by return sign (paper's preference)
            label = int(np.sign(prices.iloc[end] / p0 - 1)) or 0
            touch_time = idx[end]
        records.append({"t0": t0, "t1": touch_time, "label": label})
    return pd.DataFrame(records).set_index("t0")

# 用法示意
# labels = triple_barrier_labels(close, events, pt_sl=(1.0, 1.0), vol=rolling_vol, vertical_bars=20)
```

与固定 horizon 标签相比，止盈/止损随**波动率缩放**，垂直屏障用 bar 数而非墙上时钟，更贴近「这笔交易何时被迫出场」。

## 代码示例 3：Purging 训练集（概念）

```python
def get_label_span(label_row) -> tuple:
    """label_row has t_start, t_end from triple barrier."""
    return label_row["t_start"], label_row["t_end"]

def purged_train_indices(train_idx, test_idx, labels_df):
    """
    Remove training samples whose label interval overlaps any test label interval.
    labels_df indexed by event time with columns t_start, t_end.
    """
    test_spans = [get_label_span(labels_df.loc[i]) for i in test_idx]
    keep = []
    for i in train_idx:
        ts, te = get_label_span(labels_df.loc[i])
        overlap = any(not (te < t_s or ts > t_e) for t_s, t_e in test_spans)
        if not overlap:
            keep.append(i)
    return keep

# Embargo: additionally drop train samples with t_start in [test_end, test_end + h]
```

k-fold 在 finance 上必须配合 **Purging + Embargo**，否则 CV 分数会系统性乐观。

## 与相关工作的关系

- **Bailey & López de Prado (2014)**：PBO、DSR 的数学基础——「试策略次数」必须进入推断
- **Easley, López de Prado & O'Hara (2011–2013)**：Volume Clock / Dollar Bars 的微观结构动机
- **AFML (2018)**：各陷阱的完整算法与章节展开（第 2 章 bars、第 4 章采样权重、第 7 章 CPCV 等）
- 与经典 **因子投资 / 线性回归**：论文开篇批评「只会协方差矩阵求逆」的 econometrics 范式；ML 应**引导理论**而非黑箱替代思考

## 实践检查清单（零基础版）

1. **组织**：是否是流水线协作，而非每人独立交策略？
2. **研究循环**：是否在改特征/标签/protocol，而非改回测参数直到好看？
3. **Bars**：是否仍只用 5min/1d 时间 bar？
4. **差分**：特征是否一律用 `pct_change()`？
5. **标签**：是否固定「20 根 bar 后涨跌」？
6. **模型结构**：是否一个模型同时输出方向与仓位？
7. **样本权重**：重叠标签是否等权进 CV？
8. **CV**：是否标准 `KFold(shuffle=True)`？
9. **回测**：是否只有一条 WF 路径、一个 Sharpe 数字？
10. **显著性**：是否报告试了多少 variant、DSR/PSR 多少？

## 局限与批判性阅读

- 论文来自成功 quant 实践者的**规范清单**，部分方法（CPCV、FracDiff 最优 `d`）计算成本不低
- 「ML 优于 econometrics」的论断有**生存者偏差**；失败基金不会写论文
- 2018 年后深度学习、另类数据、LLM 特征工程带来新的过拟合面，但**验证协议问题**（泄漏、多重试验、非 IID）依旧
- 零基础读者应先掌握：**标签定义 > 模型选择**；**验证设计 > 调参**

## 小结

López de Prado 的「十大原因」不是唱衰 ML，而是强调：**金融数据违反 ML 默认假设**。失败基金常见模式是——用 ImageNet 式流程，在极低信噪比、标签重叠、路径依赖的市场里，快速产出**统计幻觉**。解药是整套 **financial ML 协议**：Dollar bars、FracDiff、Triple barrier、Meta-labeling、Purged CV、CPCV、DSR。记住一句话：**在量化里，回测是终审法官，不是灵感搜索引擎。**

## 延伸阅读

- López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley.
- Bailey, D. & López de Prado, M. (2014). The deflated Sharpe ratio. *JPM*.
- Hudson & Thames — mlfinlab 文档中对本文 Pitfall #1–#6 的实现说明
- 本书库：[[kelly-criterion-1956]]（仓位与信息率）、因子与回测过拟合相关笔记
