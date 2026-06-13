---
title: Freqtrade 零基础入门笔记
来源: https://github.com/freqtrade/freqtrade
日期: 2026-06-13
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

# Freqtrade 零基础入门笔记

## 什么是 Freqtrade？

Freqtrade 是一个用 Python 写的免费开源加密货币交易机器人。你可以把它想象成一个"不会疲劳的交易员"——它可以 7×24 小时盯盘，按照你写好的规则自动买卖。

它支持 Binance、OKX、Bybit、Kraken 等主流交易所，能通过 Telegram 或网页界面远程控制，还内置了回测（用历史数据检验策略）和超参数优化（用机器学习找到最佳参数）功能。

> 免责声明：此软件仅供学习使用。不要用你输不起的钱去冒险。

## 核心概念

### 1. 策略（Strategy）—— 你的交易大脑

策略是 Freqtrade 最核心的概念。它是一个 Python 类，告诉机器人"在什么情况下买入、在什么情况下卖出"。

类比：如果你去钓鱼，策略就是你的钓鱼规则——"水深超过 2 米且有浮漂信号时才收竿"。Freqtrade 的策略则是"RSI 低于 30 时买入，高于 70 时卖出"。

### 2. K 线数据（OHLCV）—— 机器人看到的"地图"

交易所按固定时间间隔（称为 Timeframe，如 5 分钟、1 小时）提供每根蜡烛的六个数据：

- **O**pen：开盘价
- **H**igh：最高价
- **L**ow：最低价
- **C**lose：收盘价
- **V**olume：成交量

类比：每根蜡烛就是一分钟内的"交易快照"。5 分钟时间框意味着每 5 分钟生成一根蜡烛，就像每 5 分钟拍一张相。

### 3. 技术指标（Indicators）—— 对地图做标注

技术指标是通过对 OHLCV 数据做数学计算得出的辅助数据。最常见的包括：

- **RSI（相对强弱指数）**：衡量价格涨多还是跌多，0-100 之间
- **SMA/EMA（简单/指数移动平均线）**：反映价格的平均趋势
- **布林带（Bollinger Bands）**：衡量价格波动范围

类比：如果 OHLCV 是原始地图，技术指标就是地图上用荧光笔标注的关键信息——"这里曾是价格高峰"、"这里经常反弹"。

### 4. 交易信号（Signals）—— 买卖指令

策略会根据技术指标生成两种信号：

- **入场信号（Entry Signal）**：`enter_long = 1` 表示买入
- **出场信号（Exit Signal）**：`exit_long = 1` 表示卖出

### 5. 回测（Backtesting）和干跑（Dry-Run）—— 模拟练习

- **回测**：用历史数据跑一遍你的策略，看"如果过去这么做会赚多少"
- **干跑**：用实时数据但不真花钱，模拟交易全过程

类比：回测像是"复习过去的考试卷"，干跑像是"模拟考"。两者都重要，但都不等于真实考试。

### 6. 风控工具

- **止损（Stoploss）**：亏损到一定程度自动卖出，防止越亏越多
- **最小投资回报率（ROI）**：赚到一定比例自动止盈
- **配对（Pair）**：交易对，如 `BTC/USDT`，表示用 USDT 买 BTC

## 代码示例

### 示例一：第一个最简单的策略

这是 Freqtrade 官方文档中最简策略，用 RSI 指标实现"低买高卖"：

```python
from freqtrade.strategy import IStrategy
from pandas import DataFrame
import talib.abstract as ta

class SimpleRsiStrategy(IStrategy):

    # 使用 15 分钟级别的 K 线数据
    timeframe = '15m'

    # 止损设为 -10%：亏损超过 10% 自动卖出
    stoploss = -0.10

    # ROI 规则：只要赚钱超过 1%，就卖出
    minimal_roi = {"0": 0.01}

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        第一步：计算技术指标。
        给数据表加上一列 'rsi'，值为 14 周期的 RSI。
        """
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        第二步：定义买入信号。
        当 RSI < 30 时，标记为"应该买入"。
        """
        dataframe.loc[
            (dataframe['rsi'] < 30),
            'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        第三步：定义卖出信号。
        当 RSI > 70 时，标记为"应该卖出"。
        """
        dataframe.loc[
            (dataframe['rsi'] > 70),
            'exit_long'] = 1
        return dataframe
```

这段代码的运行逻辑，就像你告诉机器人：

1. 每 15 分钟看一次 `BTC/USDT` 的价格
2. 算出 RSI 数值
3. RSI 跌到 30 以下 → 买入
4. RSI 涨到 70 以上 → 卖出
5. 如果亏了 10% 以上 → 强制止损卖出
6. 如果赚了 1% 以上 → 主动止盈卖出

### 示例二：加入更多指标的进阶策略

单用 RSI 容易出错，下面加入 MACD 和布林带做双重确认：

```python
from freqtrade.strategy import IStrategy
from pandas import DataFrame
import talib.abstract as ta

class MultiIndicatorStrategy(IStrategy):

    timeframe = '1h'
    stoploss = -0.15
    minimal_roi = {"0": 0.05, "60": 0.02, "120": 0.01}

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """计算 RSI + MACD + 布林带"""

        # RSI：14 周期相对强弱指数
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)

        # MACD：趋势指标
        macd = ta.MACD(dataframe)
        dataframe['macd'] = macd['macd']
        dataframe['macdsignal'] = macd['macdsignal']

        # 布林带：衡量价格波动区间
        bollinger = ta.BBANDS(dataframe, timeperiod=20)
        dataframe['bb_lower'] = bollinger['lowerband']
        dataframe['bb_upper'] = bollinger['upperband']
        dataframe['bb_mid'] = bollinger['middleband']

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        买入条件：RSI < 30 且 收盘价 < 布林下轨 且 MACD 线在信号线上方
        三个条件同时满足才买入，减少误判。
        """
        dataframe.loc[
            (
                (dataframe['rsi'] < 30) &           # 价格处于超卖区
                (dataframe['close'] < dataframe['bb_lower']) &  # 跌破布林下轨
                (dataframe['macd'] > dataframe['macdsignal'])    # MACD 开始向上
            ),
            'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        卖出条件：RSI > 70 或 收盘价 > 布林上轨
        """
        dataframe.loc[
            (
                (dataframe['rsi'] > 70) |           # 价格处于超买区
                (dataframe['close'] > dataframe['bb_upper'])    # 突破布林上轨
            ),
            'exit_long'] = 1
        return dataframe
```

这个进阶策略用"三重确认"降低了误判率：

- RSI 超卖 → 价格可能被低估
- 跌破布林下轨 → 价格暂时跌出正常范围
- MACD 金叉 → 趋势开始转向上

类比：就像出门看天气——不仅看云（RSI），还要看风速（布林带），再看气压（MACD），三个信号都指向下雨才带伞。

## Freqtrade 的工作流程

一个典型的 Freqtrade 使用流程如下：

```
1. 安装 Freqtrade（推荐 Docker）
2. 下载历史数据（backtesting 用）
3. 编写策略（写 Python 类）
4. 回测策略（看历史表现）
5. 干跑测试（实时模拟，不花钱）
6. 正式上线（Live 模式，用真钱）
```

## 常用命令行

| 命令 | 作用 |
|------|------|
| `freqtrade download-data` | 下载交易所历史 K 线数据 |
| `freqtrade backtesting` | 用历史数据回测策略 |
| `freqtrade trade` | 启动实盘/干跑交易 |
| `freqtrade hyperopt` | 超参数优化，自动找最佳参数 |
| `freqtrade list-data` | 查看已下载的数据 |

## 学习建议

- 先理解 RSI、SMA 等基本指标，再动手写策略
- 从干跑开始，不要一上来就用真钱
- 回测结果不要太当真，干跑结果更可靠
- 读官方示例策略仓库：`github.com/freqtrade/freqtrade-strategies`
- 遇到问题先去 Discord 社区问

## 总结

Freqtrade 的核心逻辑可以用一句话概括：

> **输入历史价格 → 计算指标 → 产生信号 → 自动下单**

你写的策略就是这个流程的大脑。写得越好，机器人交易越聪明。但记住：没有任何策略能保证盈利，风险管理永远比预测市场更重要。
