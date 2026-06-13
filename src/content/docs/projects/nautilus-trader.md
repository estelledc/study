---
title: Nautilus Trader —— 用 Rust 写的量化交易引擎，Python 当遥控器
来源: https://github.com/nautechsystems/nautilus_trader
日期: 2026-06-13
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

## 是什么

NautilusTrader 是一个**用 Rust 写的、生产级别的量化交易引擎**，策略逻辑用 Python 写。日常类比：

- **Rust 核心 = 汽车引擎** —— 负责所有硬核计算、网络通信、订单路由，跑得快还不炸
- **Python 策略 = 司机** —— 你写"看到什么信号就买/卖"，但真正的方向盘和刹车在 Rust 手里
- **Adapter（适配器）= 车钥匙** —— 每接一个交易所（Binance、Coinbase、OKX），就换一把钥匙，引擎不变

它最突出的特点是**回测和实盘用同一套代码**：你在回测里写的策略，直接连上实盘 API 就能跑，不用重写。

## 为什么重要

传统量化开发的痛苦流程是：

```
回测（Python / Pandas 矢量化） → 实盘（C++ / 事件驱动引擎）
```

两套代码、两种时序模型、两种 bug 来源。NautilusTrader 把这两层**合二为一**，用一个引擎同时覆盖回测和实盘。

它的核心价值：

- **Rust 内核性能**：异步网络、纳秒级时间戳、内存安全（Rust 所有权系统），适合毫秒级甚至微秒级交易
- **Python 策略开发**：策略逻辑用 Python 写，不需要会 Rust —— PyO3  bindings 把 Rust 对象暴露给 Python
- **多交易所统一接口**：Binance、Coinbase、Bybit、Kraken、OKX、Interactive Brokers 等 15+ 交易所，同一个 API 调用方式
- **事件驱动架构**：不是轮询，是"来了数据就触发"——类似你家的烟雾报警器，不是每分钟检查一次有没有火
- **回测到实盘零修改**：同一份策略代码，切换配置就能从历史回测切到实盘交易

## 核心概念

### 1. 事件驱动（Event-Driven）

NautilusTrader 的核心是一个**事件循环**（Event Loop）。整个系统的运作方式就像一家交易所的撮合引擎：

```
行情数据进来 → 触发事件 → 策略响应 → 生成订单 → 订单发送 → 成交确认 → 更新持仓
```

每一步都是一个 "event"，被事件循环按时间顺序处理。

### 2.  instrument（交易标的）

一个 `Instrument` 代表一种可以交易的东西：BTC/USDT 永续合约、AAPL 股票、ETH 期权。每个 instrument 定义了：

- 最小交易单位（lot size）
- 价格精度（price tick）
- 所属的交易所 venue

### 3. 订单与持仓（Order & Position）

- **Order**：你发出的买卖指令（限价单、市价单、止损单等）
- **Position**：你当前的持仓状态，由成交的订单自动累积生成

### 4. Cache（缓存）

所有交易相关的数据——品种信息、持仓、订单状态——都存在一个内存 Cache 里。策略通过 Cache 查询当前状态，**不直接操作数据**，保证状态一致性。

### 5. Message Bus（消息总线）

组件之间**不直接通信**，而是通过消息总线。类似小区的公告栏：

- 行情模块把价格贴到公告栏上
- 策略模块订阅了这个公告栏，看到价格变化就处理
- 执行模块也订阅了，收到订单就发出去

这样每个模块互相独立，换行情源不影响策略代码。

## 代码示例

### 示例 1：最简策略 —— 均线交叉

这是 NautilusTrader 策略的骨架。你只需要继承 `Strategy` 类，实现两个方法：

- `on_start()`：引擎启动时运行一次，初始化指标
- `on_bar()`：每来一根 K 线数据就调用一次

```python
from nautilus_trader.model.enums import OrderSide
from nautilus_trader.trading.strategy import Strategy


class MovingAverageCrossover(Strategy):

    def __init__(self, symbol: str, fast_ma: int = 10, slow_ma: int = 30):
        super().__init__()
        self.symbol = symbol
        self.fast_ma_period = fast_ma
        self.slow_ma_period = slow_ma

    def on_start(self) -> None:
        # 创建两个移动平均指标：快线(10) 和慢线(30)
        fast_ma = self.indicators.move_average_relative(
            self.symbol, self.fast_ma_period
        )
        slow_ma = self.indicators.move_average_relative(
            self.symbol, self.slow_ma_period
        )

        # 注册回调：当指标值更新时触发 on_indicator_value
        self.subscribe_indicator_values(fast_ma.ts_id, self.on_fast_ma)
        self.subscribe_indicator_values(slow_ma.ts_id, self.on_slow_ma)

        self._fast_ma_value = 0.0
        self._slow_ma_value = 0.0
        self._crossed = False

    def on_bar(self, bar) -> None:
        fast = self._fast_ma_value
        slow = self._slow_ma_value

        # 金叉：快线上穿慢线 → 买入
        if not self._crossed and fast > slow:
            order = self.order_market_factory(OrderSide.BUY)
            self.submit_order(order)
            self._crossed = True

        # 死叉：快线下穿慢线 → 卖出
        elif self._crossed and fast < slow:
            order = self.order_market_factory(OrderSide.SELL)
            self.submit_order(order)
            self._crossed = False

    def on_fast_ma(self, value) -> None:
        self._fast_ma_value = value

    def on_slow_ma(self, value) -> None:
        self._slow_ma_value = value
```

### 示例 2：配置并启动回测

写好策略后，用 `BacktestNode` 启动回测。配置部分定义了你接入哪个交易所、用什么数据、策略怎么配：

```python
from pathlib import Path
from nautilus_trader.common.component import TestClock
from nautilus_trader.config import BacktestNode, BacktestDataClientConfig
from nautilus_trader.config import StrategyNodeConfig
from nautilus_trader.examples.strategies.volatility_position_sizing import (
    VolatilityPositionSizing,
)
from nautilus_trader.examples.strategies.volatility_position_sizing_config import (
    VolatilityPositionSizingConfig,
)
from nautilus_trader.model.identifiers import Venue
from nautilus_trader.persistence.wranglers import QuoteTickDataGenerator

# 生成模拟的报价数据（回测不需要真实数据源）
data_generator = QuoteTickDataGenerator(
    instrument_id=None,  # 先用真实 instrument
    bid_price=50000.0,
    ask_price=50001.0,
    timestamp=TestClock.now().value,
)

# 配置数据客户端
data_client_config = BacktestDataClientConfig(
    venue=Venue("BINANCE"),
    type="backtest",
)

# 配置策略
strategy_config = StrategyNodeConfig(
    strategy=VolatilityPositionSizing,
    config=VolatilityPositionSizingConfig(
        symbol="BTCUSDT-PERP.BINANCE",
        bar_type=None,  # 填入实际的 BarType
        position_size=0.001,
        volatility_lookback=20,
        max_trade_size=0.01,
    ),
)

# 启动回测
backtest = BacktestNode(
    data_clients=[data_client_config],
    strategies=[strategy_config],
)
backtest.run()
```

### 示例 3：从回测切换到实盘

这就是 NautilusTrader 最酷的地方：**同一个策略，只改配置，不改代码**：

```python
# ===== 回测模式（上面已经写好了）=====
from nautilus_trader.config import BacktestNode
# 用 BacktestNode + 历史数据文件

# ===== 实盘模式（几乎一模一样）=====
from nautilus_trader.config import LiveNode
from nautilus_trader.adapters.binance.factories import (
    BinanceLiveDataClientConfig,
    BinanceLiveExecutionClientConfig,
)

# 只需要替换数据源和执行源的配置
live_node = LiveNode(
    data_clients=[
        BinanceLiveDataClientConfig(
            api_key="your-api-key",
            api_secret="your-api-secret",
        ),
    ],
    execution_clients=[
        BinanceLiveExecutionClientConfig(
            api_key="your-api-key",
            api_secret="your-api-secret",
            # 实盘用 risk 参数控制仓位
            risk_mode="conservative",
        ),
    ],
    strategies=[strategy_config],  # ← 同一个策略配置！
)
live_node.run()
```

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                   Python 层（策略）               │
│                                                 │
│  Strategy 类 → 你的交易逻辑                      │
│  Indicators  → 技术指标（MA、RSI、布林带...）     │
│  Configuration → 参数配置                        │
└──────────────────────┬──────────────────────────┘
                       │ PyO3 bindings
┌──────────────────────▼──────────────────────────┐
│              Rust 核心（Nautilus Engine）          │
│                                                  │
│  Event Loop  → 事件调度中心                      │
│  Cache       → 内存状态存储                      │
│  Message Bus → 组件间通信                        │
│  Executor    → 订单执行与路由                    │
│  Accounting  → 盈亏计算与持仓管理                │
└──────────────────────┬──────────────────────────┘
                       │ Adapters
┌──────────────────────▼──────────────────────────┐
│              交易所适配器层                       │
│                                                  │
│  Binance  │  Coinbase  │  Bybit  │  IB  │  ...  │
└──────────────────────────────────────────────────┘
```

## 关键设计模式

- **事件溯源（Event Sourcing）**：所有状态变化都以事件形式保存，可以回放任意时间段的状态 —— 类似飞机的黑匣子
- **Actor 模型**：每个组件（行情、策略、执行）都是独立的 Actor，通过消息通信 —— 类似微服务
- **确定性时间模型**：回测中用的"模拟时钟"和实盘中的"真实时钟"遵循相同的时序规则，保证行为一致
- **插件系统**：可以用 Rust 编写独立的 cdylib 插件，通过 C ABI 扩展引擎 —— 适合极端性能场景

## 学习资源

- **官方文档**：<https://nautilustrader.io/docs/latest/>
- **GitHub**：<https://github.com/nautechsystems/nautilus_trader>
- **Discord 社区**：<https://discord.gg/NautilusTrader>
- **示例策略**：`nautilus_trader/examples/` 目录下的 `strategies/` 文件夹

## 一句话总结

NautilusTrader 用 Rust 引擎提供性能保证，用 Python 策略降低开发门槛，用统一的事件驱动架构打通回测和实盘 —— 是量化交易者从"纸上回测"到"真金白银"之间最短的路。
