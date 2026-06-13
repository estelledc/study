---
title: "awesome-systematic-trading 学习笔记"
来源: "https://github.com/edarchimbaud/awesome-systematic-trading"
日期: "2026-06-13"
分类: 其他
子分类: 量化金融
provenance: "pipeline-v3"
---

# awesome-systematic-trading 学习笔记

## 一、这是什么？

想象你想到图书馆学做饭，但图书馆没有分类，所有书散落在地上。awesome-systematic-trading 就是给"量化交易"这个领域做一次系统分类的书单整理者。

它由 edarchimbaud 维护，托管在 GitHub 上，目前已经被 Star 超过 8400 次。内容涵盖四大块：

- **97 个库和工具包** — 回测、实盘、指标计算、机器学习等
- **40+ 个策略** — 由学术论文提出，附带夏普比率、波动率等回测数据
- **55 本书** — 从零基础到专业量化
- **23 个视频 + 博客 + 课程**

核心网址：https://github.com/edarchimbaud/awesome-systematic-trading

## 二、核心概念：什么是"系统交易"？

**日常类比**：以前炒股靠"感觉"——"我觉得今天要涨"。系统交易（也叫量化交易）则是把"感觉"变成"规则"。

比如一条规则可以是：

> "如果某只股票的价格超过它过去 20 天的平均值，就买入；如果低于平均值 2%，就卖出。"

这条规则写进代码后，计算机可以 24 小时不间断地执行，不感情用事，不手软。这就是"系统化"。

系统交易的三个核心步骤：

1. **提出假设** — 比如"涨多了会回调"
2. **回测验证** — 用过去 10 年的数据跑一遍，看这假设是不是真管用
3. **实盘部署** — 用小资金试运行，确认没问题再放大

## 三、两大回测框架类型

awesome-systematic-trading 把回测工具分成两类，理解这个区分很重要。

### 3.1 事件驱动框架（Event Driven）

**类比**：像一个真实交易员的操作过程——每来一笔新数据（一条成交记录），就检查一遍"要不要交易"。

代表库：**backtrader**、**zipline**、**QuantConnect Lean**

### 3.2 向量化框架（Vector Based）

**类比**：不像真实交易员逐笔处理，而是直接把一整年的数据拿过来，用矩阵运算一次性算完。快得多，但不够"真实"。

代表库：**vectorbt**、**pysystemtrade**（Rob Carver 的书配套实现）

## 四、代码示例

### 示例 1：用 backtrader 写一个简单的双均线策略

```python
import backtrader as bt

class DualMACross(bt.Strategy):
    # 参数：快线周期10天，慢线周期30天
    params = (('fast_period', 10), ('slow_period', 30))

    def __init__(self):
        # 计算两条均线
        self.fast_ma = bt.indicators.SMA(self.data.close, period=self.p.fast_period)
        self.slow_ma = bt.indicators.SMA(self.data.close, period=self.p.slow_period)
        # 交叉信号：快线上穿慢线为1，下穿为-1
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)

    def next(self):
        if self.crossover > 0:
            # 金叉：买入
            self.buy()
        elif self.crossover < 0:
            # 死叉：卖出
            self.sell()

# 运行回测
cerebro = bt.Cerebro()
cerebro.addstrategy(DualMACross)
data = bt.feeds.YahooFinanceData(dataname='AAPL', fromdate='2020-01-01', todate='2024-01-01')
cerebro.adddata(data)
cerebro.broker.setcash(100000)
cerebro.run()
print(f'最终资金: {cerebro.broker.getvalue():.2f}')
```

这段代码做的事情就是前面说的"双均线策略"：短期均线上穿长期均线时买入，下穿时卖出。backtrader 负责处理数据加载、资金管理、订单执行等所有杂事。

### 示例 2：用 vectorbt 快速测试 1000 种参数组合

```python
import vectorbt as vbt
import pandas as pd

# 假设 prices 是某个资产的历史价格序列（Series 格式）
# 快速计算不同参数组合的 Sharpe 比率
fast_periods = range(5, 30)
slow_periods = range(30, 60)

results = {}
for fast in fast_periods:
    for slow in slow_periods:
        if fast >= slow:
            continue
        # 生成买卖信号
        fast_ma = vbt.MA.run(prices, fast, short_name='fast')
        slow_ma = vbt.MA.run(prices, slow, short_name='slow')
        # 金叉买入，死叉卖出
        entries = fast_ma.ma_crossed_above(slow_ma)
        exits = fast_ma.ma_crossed_below(slow_ma)
        # 回测
        port = vbt.Portfolio.from_signals(prices, entries=entries, exits=exits)
        results[(fast, slow)] = port.sharpe

# 找出最优参数
best = max(results, key=results.get)
print(f'最优参数: 快线={best[0]}天, 慢线={best[1]}天, Sharpe={results[best]:.3f}')
```

这个例子展示了向量化框架的威力——不需要逐日模拟订单，而是直接对整段数据进行矩阵运算。你可以几秒钟内测试几百种参数组合，这在事件驱动框架中需要跑很久。

## 五、精选策略一览

该仓库整理了 40+ 篇学术论文中的策略，以下是按夏普比率排序的几个代表性策略：

| 策略名称 | 夏普比率 | 再平衡频率 | 一句话解释 |
|---------|---------|-----------|----------|
| 资产增长效应 | 0.835 | 年度 | 买入资产增长慢的公司，卖出增长快的 |
| 股票短期反转 | 0.816 | 周度 | 短期跌太猛的股票，接下来会反弹 |
| 比特币日内季节性 | 0.892 | 日内 | 比特币在一天中某些时段倾向于上涨 |
| 趋势跟踪 | 0.569 | 每日 | "顺势而为"——涨了就买，跌了就卖 |
| 价值因子（账面市值比） | 0.526 | 月度 | 买便宜的股票（市净率低），卖贵的 |
| 低波动率效应 | 0.717 | 月度 | 波动小的股票长期收益反而更高 |

**最值得入门的策略：趋势跟踪（Trend-following）**。它的核心思想最简单——"追涨杀跌"，而且跨越多个市场（股票、商品、外汇）都有效。

## 六、工具链全景

做一个量化系统，一般需要以下组件：

1. **数据源** — 获取历史行情和基本面数据（如 Yahoo Finance、Alpha Vantage）
2. **回测框架** — backtrader、vectorbt、zipline 等
3. **因子计算** — pandas、ta-lib 等计算技术指标
4. **机器学习** — scikit-learn、TensorFlow、PyTorch 等
5. **实盘执行** — 通过券商 API（如 Interactive Brokers、Alpaca）下单

awesome-systematic-trading 把这每一步的工具都整理好了，你不需要从零造轮子。

## 七、学习路径建议

作为一个零基础的初学者，建议按以下顺序推进：

1. **先读书** — 《Systematic Trading》by Robert Carver（中文译名《系统交易》），这本书配套的 pysystemtrade 就在该仓库中
2. **跑通一个回测** — 用 backtrader 把示例 1 的双均线策略跑起来，看到数字比"感觉"可靠
3. **理解一个策略** — 从仓库中的"趋势跟踪"策略论文开始，理解它的逻辑
4. **写自己的策略** — 在示例基础上修改参数，观察回测结果变化

## 八、关键提醒

- **回测不等于实盘**。任何回测结果都有"过拟合"风险——你可能只是恰好找到了一组在过去有效、未来无效的参数
- **注意交易成本**。很多论文回测不考虑手续费和滑点，实盘中这些会吃掉大量利润
- **风险管理比策略更重要**。即使是最简单的策略，配合严格的仓位管理，也能活下来；最好的策略没有风控，一次大跌就归零

## 九、延伸阅读

- 论文与策略的完整实现：https://paperswithbacktest.com
- 配套课程：https://paperswithbacktest.com/course
- Rob Carver 的《Systematic Trading》一书是该仓库中 pysystemtrade 库的理论基础
