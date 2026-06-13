---
title: Hummingbot 零基础入门笔记
来源: https://github.com/hummingbot/hummingbot
日期: 2026-06-13
分类: 其他
子分类: 量化金融
provenance: pipeline-v3
---

# Hummingbot 零基础入门笔记

## 一、日常类比：什么是 Hummingbot？

想象你在菜市场摆摊卖苹果。你挂一个牌子："我出 5 元买你的苹果，也愿意以 5.2 元卖给你苹果"——这 5 元叫"买单"（bid），5.2 元叫"卖单"（ask）。中间的 0.2 元就是你赚的差价。

如果你能 24 小时不睡觉地盯着行情牌，每秒钟都根据最新价格调整自己的买卖报价，那你就能稳定赚到这点"点差"。但人做不到，于是有了 Hummingbot。

Hummingbot 是一个开源的 Python 框架，帮你在加密货币交易所上自动运行这种"做市"策略——也就是同时挂买单和卖单，赚取买卖价差。它支持 140+ 交易所，包括币安（Binance）、OKX 这些中心化交易所，也包括 Uniswap 这样的去中心化交易所（DEX）。

GitHub 上有近 19000 个 Star，说明它是这个领域里最流行的开源项目之一。

## 二、核心概念

### 1. 策略（Strategy）

策略就是交易的"大脑"。Hummingbot 内置了很多策略模板，最常见的有：

- **纯做市（Pure Market Making, PMM）**：围绕市场中间价，同时挂买单和卖单，定时刷新订单。这是最适合新手的入门策略。
- **跨交易所做市（XEMM）**：在两个交易所之间套利——比如在 A 所低价买入，同时在 B 所高价卖出。
- **Avellaneda 做市**：基于学术论文的数学模型，更高级。

### 2. 连接器（Connector）

连接器是 Hummingbot 连接不同交易所的"翻译官"。无论交易所的 API 长什么样，Humingbot 都会把它标准化成统一的接口。连接器分三类：

| 类型 | 说明 | 例子 |
|------|------|------|
| CLOB CEX | 中心化限价单簿交易所，资金托管在你给的 API Key 上 | Binance, OKX, KuCoin |
| CLOB DEX | 去中心化限价单簿交易所，通过钱包连接 | Hyperliquid, dYdX |
| AMM DEX | 自动化做市商协议，通过 Gateway 中间件连接 | Uniswap, PancakeSwap |

### 3. V1 vs V2 框架

- **V1**：2019 年推出的原始框架，每个策略是一个独立的文件，配置写在 YAML 文件里。简单直接，适合新手。
- **V2**：2023 年开始推出的新框架，把策略拆成了积木式的组件：
  - **Executor**：完成一个具体交易任务的模块（比如开仓、网格交易），设计为"启动后自动结束"。
  - **Script**：把所有逻辑写在一个 Python 文件里，适合学习和原型开发。
  - **Controller**：生产级别的模块化子策略，可以同时运行多个，适合复杂的多币种策略。

### 4. 时钟滴答（Clock Tick）

策略的运行节奏叫"时钟滴答"，默认每秒一次。每次滴答，策略会：
1. 从交易所拉取最新的订单簿快照
2. 检查自己的持仓和订单状态
3. 根据策略逻辑决定要不要挂新单、撤旧单

## 三、安装与启动

最简单的安装方式是用 Docker：

```bash
git clone https://github.com/hummingbot/hummingbot.git
cd hummingbot
make setup
make deploy
docker attach hummingbot
```

启动后你会进入一个交互式命令行界面（CLI），输入 `help` 可以看到所有可用命令。

## 四、代码示例

### 示例 1：配置一个纯做市策略（YAML 配置文件）

在 Hummingbot 中，策略参数保存在 YAML 文件里。你可以通过 `create` 命令自动生成，也可以手动编写。下面是一个典型的纯做市策略配置：

```yaml
# conf/strategies/conf_pure_mm_1.yml
strategy: pure_market_making
exchange: binance
market: BTC-USDT
bid_spread: 0.005       # 买单挂在中间价下方 0.5%
ask_spread: 0.005       # 卖单挂在中间价上方 0.5%
order_amount: 0.001     # 每笔订单 0.001 BTC
order_refresh_time: 30  # 每 30 秒刷新一次订单
max_order_age: 1800     # 超过 30 分钟未成交就撤销重挂
```

解释：
- `bid_spread` 和 `ask_spread` 决定了你的利润空间——价差越大，单笔利润越高，但成交概率越低。这是一个权衡。
- `order_refresh_time` 控制订单的"保质期"。到期后 Hummingbot 会自动撤掉旧单，按最新行情挂新单。
- 启动命令：`start`

### 示例 2：V2 框架下的策略脚本（Python 代码）

V2 框架的策略脚本把所有逻辑放在一个 Python 文件中。下面是一个简化版的示例，展示了一个基于 EMA 指标的趋势跟踪策略的基本结构：

```python
# scripts/simple_directional.py
from hummingbot.strategy.script_strategy_v2 import ScriptStrategyV2


class SimpleDirectional(ScriptStrategyV2):

    # 定义可配置的参数
    def __init__(self):
        super().__init__()
        self.trades_count = 0

    def on_tick(self):
        """
        这是策略的核心心跳函数。
        每秒被调用一次，负责获取行情并做出交易决策。
        """
        ticker = self.get_ticker()
        current_price = ticker.last

        # 获取短期和长期 EMA
        short_ema = self.market_data_provider.get_candles(
            conn=self.exchange.markets["BTC-USDT"][0],
            symbol="BTC-USDT",
            timeframe="5m",
            limit=24,  # 短期：4 小时数据
        )[0].close

        long_ema = self.market_data_provider.get_candles(
            conn=self.exchange.markets["BTC-USDT"][0],
            symbol="BTC-USDT",
            timeframe="5m",
            limit=72,  # 长期：12 小时数据
        )[0].close

        # 金叉：短期均线上穿长期均线 → 买入信号
        if short_ema > long_ema and not self.has_open_orders():
            self.buy(amount=0.001, price=current_price)
            self.trades_count += 1
            self.logger().info(f"Buy signal triggered. Total trades: {self.trades_count}")

        # 死叉：短期均线跌破长期均线 → 卖出信号
        elif short_ema < long_ema and self.position_is_open():
            self.sell(amount=0.001, price=current_price)
            self.trades_count += 1
            self.logger().info(f"Sell signal triggered. Total trades: {self.trades_count}")

    def format_status(self) -> str:
        """格式化显示当前策略状态"""
        if not self.ready_to_trade:
            return "交易所连接尚未就绪"
        lines = [
            f"总交易次数: {self.trades_count}",
            f"当前 BTC 价格: {self.get_ticker().last}",
        ]
        return "\n".join(lines)
```

关键理解：
- `on_tick()` 是策略的心脏——每秒跳动一次，读取数据、做出判断、发出指令。
- `get_ticker()` 拿到最新价格，`get_candles()` 拿到历史 K 线数据来计算 EMA。
- `buy()` 和 `sell()` 是下单方法，`has_open_orders()` 和 `position_is_open()` 是状态查询方法。
- `format_status()` 让你在终端里看到策略的实时状态。

## 五、策略运行流程总结

用一个流程图来理解整个系统的运作：

```
时钟滴答（每秒）
    │
    ▼
拉取订单簿数据 ──→ 分析数据（价差、趋势、持仓）
    │
    ▼
生成订单建议 ──→ 检查是否需要撤单
    │
    ▼
合并所有建议 ──→ 发送到交易所执行
    │
    ▼
回到时钟滴答（循环）
```

## 六、风险提醒

Hummingbot 本身只是一个工具，就像一把菜刀——厨师用它做饭，坏人用它伤人。以下几点务必注意：

1. **市场风险**：做市策略在横盘行情中表现最好，但如果价格单边暴跌或暴涨，你可能囤积大量亏损的仓位。
2. **API Key 安全**：连接交易所时需要提供 API Key，务必只开启"交易权限"，关闭"提现权限"。
3. **回测先行**：在真实资金上运行之前，先用 Hummingbot 的 Paper Trade（模拟交易）模式测试。
4. **手续费**：高频交易意味着高手续费，如果价差收益覆盖不了手续费，策略就会亏钱。

## 七、进一步学习

- 官方文档：https://hummingbot.org
- 官方 Discord 社区：https://discord.gg/hummingbot
- Botcamp 培训课程：https://www.botcamp.xyz（官方认证课程）
- Quants Lab：https://github.com/hummingbot/quants-lab（Jupyter 笔记本，用于数据研究和回测）
