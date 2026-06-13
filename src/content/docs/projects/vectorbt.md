---
title: "vectorbt 零基础学习笔记"
来源: "https://github.com/polakowo/vectorbt"
日期: 2026-06-13
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

# vectorbt 零基础学习笔记

## 什么是 vectorbt？

假设你有一个炒股的想法，比如"当 10 日均线突破 50 日均线时买入，跌破时卖出"。
用传统工具回测这个策略，你得一天一天地模拟价格变动——如果测试 100 组不同的参数组合，就得跑 100 遍。

vectorbt 的做法完全不同。想象你有 1000 种策略想法，vectorbt 把它们全部打包进一个矩阵，一次性算完。
它的口号是"Thinks in matrices. Backtests at scale."（用矩阵思维，规模化回测）。

安装方式：

```bash
pip install -U vectorbt
```

## 核心概念

### 1. 矩阵思维 vs 循环思维

传统回测像一个人按顺序翻页算账：先算第一天赚多少，再算第二天……
vectorbt 把所有策略、所有资产、所有参数组合放进 NumPy 数组（矩阵），用 Numba（把 Python 即时编译成 C 级别速度）一次性完成计算。

### 2. 关键对象

| 对象 | 作用 | 类比 |
|------|------|------|
| `vbt.YFData` | 从 Yahoo Finance 下载行情数据 | 从市场获取原始食材 |
| `vbt.MA` | 计算移动平均线等指标 | 切菜备料 |
| `vbt.Portfolio` | 模拟买卖持仓和收益 | 下锅炒菜 |
| `vbt.BBANDS` | 布林带指标 | 一种烹饪技法 |

### 3. 信号生成

信号就是一组 True/False 数组，告诉你"哪天该买"、"哪天该卖"。
比如 `ma_crossed_above` 就是"快线从下方穿过慢线"的那一天为 True，其余为 False。

### 4. 广播（Broadcasting）

这是 vectorbt 最强大的特性。你可以把 100 组参数、10 只股票同时扔进去，
结果自动变成一个多维表格，按参数分组展示——不用写一个循环。

## 代码示例

### 示例 1：比特币持有 100 元

这是最简单的用法——假设你从 2014 年开始每月固定投入 100 元买比特币，看看结果如何。

```python
import vectorbt as vbt

# 下载比特币日线数据
data = vbt.YFData.download("BTC-USD")
price = data.get("Close")  # 提取收盘价

# 模拟一直持有，初始资金 100 元
pf = vbt.Portfolio.from_holding(price, init_cash=100)

# 查看总盈利
print(pf.total_profit())
# 输出示例：19501.10（意味着 100 元变成约 19601 元）
```

这行代码完成了一件事：假设你从比特币有数据的第一天起买入并一直持有，
vectorbt 自动计算了你的买入份额、当前价值和总收益。

### 示例 2：双均线交叉策略

这是经典的趋势跟踪策略——用快慢两条均线判断买卖时机。

```python
import vectorbt as vbt
import numpy as np

# 下载数据
data = vbt.YFData.download("BTC-USD")
price = data.get("Close")

# 计算 10 日和 50 日移动平均线
fast_ma = vbt.MA.run(price, 10)
slow_ma = vbt.MA.run(price, 50)

# 生成买卖信号：快线上穿慢线时买入，下穿时卖出
entries = fast_ma.ma_crossed_above(slow_ma)  # 买入信号
exits = fast_ma.ma_crossed_below(slow_ma)    # 卖出信号

# 用信号创建投资组合回测
pf = vbt.Portfolio.from_signals(price, entries, exits, init_cash=100)

# 查看总盈利
print(pf.total_profit())

# 查看详细统计
print(pf.stats())
```

输出包含丰富信息：总收益率、最大回撤、胜率、夏普比率等几十项指标。
比如你会看到"Win Rate: 41.25%"——这个策略只有四成胜率，但每次赚的比亏的多，所以整体赚钱。

### 示例 3：同时测试 10,000 组参数

这是 vectorbt 真正展现威力的地方——不用写循环，一行代码测试所有组合。

```python
import vectorbt as vbt
import numpy as np

# 下载多只加密货币数据
symbols = ["BTC-USD", "ETH-USD", "XRP-USD"]
data = vbt.YFData.download(symbols, missing_index="drop")
price = data.get("Close")

# 定义快线和慢线的所有窗口组合：2 到 100 天
windows = np.arange(2, 101)
fast_ma, slow_ma = vbt.MA.run_combs(
    price, window=windows, r=2, short_names=["fast", "slow"]
)

# 生成信号
entries = fast_ma.ma_crossed_above(slow_ma)
exits = fast_ma.ma_crossed_below(slow_ma)

# 回测所有组合（设置手续费 0.1%）
pf = vbt.Portfolio.from_signals(price, entries, exits, size=np.inf, fees=0.001, freq="1D")

# 用热力图可视化结果：横轴快线窗口，纵轴慢线窗口，滑块切换不同币种
fig = pf.total_return().vbt.heatmap(
    x_level="fast_window",
    y_level="slow_window",
    slider_level="symbol",
    symmetric=True,
    trace_kwargs=dict(colorbar=dict(title="Total return", tickformat="%"))
)
fig.show()
```

这段代码做了件很了不起的事：
- 快线窗口 2~100，慢线窗口 2~100 → 理论上 10,000 种组合
- 3 种资产 → 30,000 次回测
- 一行 `vbt.heatmap()` 直接生成可交互的热力图

## 为什么 vectorbt 快？

传统回测工具用"循环"——一个循环接着一个循环，像手算。
vectorbt 用"向量化"——把整个矩阵一次算完，像用计算器。

具体来说，它用了几层加速：

1. **NumPy**：矩阵运算的基础层，比 Python 原生列表快得多
2. **Numba**：把关键循环即时编译成 C 代码，不用你写 C
3. **Rust**（可选）：对最核心的路径用 Rust 预编译，连 JIT 编译的时间都省了

## 进阶方向

掌握基础后，你可以继续探索：

- **Portfolio 回测**：支持现金管理、手续费、杠杆等复杂场景
- **信号工具**：生成、排序、映射交易信号
- **Walk-forward 优化**：滚动窗口做稳健性测试
- **Plotly 可视化**：生成交互式图表和仪表盘
- **ML 集成**：生成标签用于机器学习模型训练

## 学习资源

- 官方文档：https://vectorbt.dev/
- GitHub：https://github.com/polakowo/vectorbt
- Colab 在线体验：https://colab.research.google.com/drive/1ibqyrf6LPFlzRb6mkPpl3hxqL6ryNBXI?usp=sharing
- 示例应用（K 线形态研究）：https://github.com/polakowo/vectorbt/tree/master/apps/candlestick-patterns
