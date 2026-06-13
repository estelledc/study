---
title: AI-Trader 学习笔记 —— 让 AI Agent 自己炒股的交易平台
来源: https://github.com/HKUDS/AI-Trader
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# AI-Trader：全自动 Agent-Native 量化交易平台

先想象一个场景：你打开一个炒股论坛，里面有几百个"用户"在发帖讨论行情。
但奇怪的是——这些用户全是 AI，没有一个是真人。
它们自己看盘、自己分析、自己下单，还互相围观对方的操作、评价好坏、甚至"跟单"抄作业。

AI-Trader 就是这样一个论坛。只不过它的"用户"全是 AI Agent，
"论坛网站"是 https://ai4trade.ai，而"注册方式"极简单：
把一段网址丢给任何一个 AI Agent（Claude Code、Cursor、Codex 等都行），
它读完 `SKILL.md` 就自己注册、自己开始交易。

---

## 一、是什么：让 AI Agent 成为交易市场的"原住民"

AI-Trader 是香港大学数据科学实验室（HKUDS）黄超教授团队开发的开源项目。
它的核心命题是：**如果所有交易员都是 AI，它们之间该如何交流、协作、竞争？**

这个问题的关键在于"Agent-Native"这个词。它不是说"在人类交易系统外面套一层 API 给 AI 用"，
而是**从零开始就为 AI Agent 设计**整个平台。就像是：
- 人类用的炒股软件有 K 线图、按钮、登录表单
- AI 用的交易平台只有 API 和 SKILL.md 文件

Agent-Native 的具体表现：
- Agent 不需要点任何按钮——只通过 REST API 操作
- Agent 的"操作手册"是一个 markdown 文件（SKILL.md），Agent 读一遍就知道怎么用
- Agent 之间通过"发信号/回复/跟单"来互动，就像人在论坛发帖回帖
- 平台不区分"AI 用户"和"人类用户"——这里的用户就是 AI

项目的论文（arXiv:2512.10971）系统评估了 6 种主流大模型在美股、A 股、加密货币三个市场的交易表现，
结论是：**通用智能能力不会自动转化为交易能力**——在传统 benchmark 上表现好的模型，
在真实市场中可能亏钱。更重要的是，**风控能力比预测准确率更能决定跨市场表现**。

---

## 二、为什么重要：从"AI 辅助"到"AI 主导"的范式转变

传统量化交易的做法是：人类设计策略 -> 代码执行策略 -> AI 帮忙优化策略参数。
AI-Trader 把这个链条反过来：**AI 自己设计策略、自己执行、自己从结果中学习**。
人类只负责搭建平台和设定规则。

这对零基础的人意味着什么：

1. **不需要会写复杂的量化策略**。你只需要让 Agent 读 SKILL.md，它会自己理解该怎么做。
2. **Agent 之间的"集体智慧"**。单个 Agent 可能犯错，但几十个 Agent 同时讨论、互相验证，
   能筛选出更好的决策——这和人类交易室的分析师讨论会是一样的逻辑。
3. **可复现的研究基准**。所有 Agent 用同样的起始资金、同样的数据窗口、同样的工具集，
   这让不同模型之间的比较变得公平——不像实盘交易中每个人的资金量和信息源都不同。

从研究角度看，AI-Trader 提供了第一个**标准化的、可复现的 AI Agent 金融决策基准**。
从工程角度看，它展示了如何把 MCP（Model Context Protocol）工具链用于真实金融场景。

---

## 三、核心要点：架构、MCP 工具链与交易循环

### 3.1 双层流水线

AI-Trader 的交易逻辑是一个"双层循环"：

```
外层：每日回测循环
  ├── 日历过滤（跳过周末/节假日）
  ├── 加载当日价格数据
  ├── 触发各 Agent 的决策循环
  └── 记录当日盈亏、结算

内层：Agent 决策循环（每个交易日）
  ├── 接收市场上下文（价格/新闻/持仓）
  ├── 调用 MCP 工具获取信息
  ├── 推理 → 输出决策（买/卖/持有）
  └── 执行模拟交易
```

外层像一个"比赛裁判"：每天宣布开盘、收盘，记录成绩。内层是每个 Agent 的"思考过程"：
跟人一样——先看行情，再查新闻，然后决定买还是卖。

### 3.2 MCP 工具服务（按端口拆分）

平台的核心操作都通过 MCP 工具完成，每个工具是一个独立的 FastMCP HTTP 服务：

| 工具服务 | 端口 | 职责 | 类比 |
|---------|------|------|------|
| Math | 8000 | 金融指标计算（夏普比率、最大回撤、年化收益） | 计算器 |
| Search | 8001 | 市场情报搜索（通过 Jina AI 获取新闻） | 财经新闻终端 |
| TradeTools | 8002 | 买卖下单模拟、持仓管理 | 交易终端 |
| LocalPrices | 8003 | 本地价格数据查询 | 行情软件 |
| CryptoTradeTools | 8005 | 加密货币专用交易工具 | 币圈专用终端 |

Agent 不会"看到"K 线图——它只会调用 `get_price_local("AAPL", "2026-01-05")` 拿到一串数字。
它的世界就是这些工具函数的输入和输出。设计的精妙之处在于：
所有工具都是"无状态的 RPC 调用"——Agent 不会因为"忘了关某个页面"而出错。

### 3.3 三种信号类型

Agent 在平台上通过三种"帖子"来交流：

| 类型 | API 路由 | 作用 | 日常类比 |
|------|---------|------|----------|
| Strategy（策略） | `/api/signals/strategy` | 发布分析报告，不做交易 | 写一篇"我看涨 BTC"的长文 |
| Realtime（操作） | `/api/signals/realtime` | 记录真实的交易操作 | 发一条"我刚买了 0.1 BTC" |
| Discussion（讨论） | `/api/signals/discussion` | 自由讨论市场话题 | 发帖问"大家怎么看当前行情" |

操作信号可以被其他 Agent "跟单"。策略分析可以被回复、讨论。三种信号形成了一个完整的信息生态：
分析 -> 操作 -> 讨论 -> 反馈修正分析。

### 3.4 跟单机制（Copy Trading）

这是 AI-Trader 最体现"集体智慧"的功能：

1. Agent A 看 Agent B 最近赚得多，调用 `POST /api/signals/follow {"leader_id": B的ID}`
2. 此后 B 每做一笔交易，A 的账户自动按 1:1 比例复制
3. 跟单的持仓在 `GET /api/positions` 中标记为 `source: "copied:{leader_id}"`
4. 被跟的 B 每多一个跟单者，获得 +1 积分

这个机制创造了一个自然的"信誉市场"——赚得多的 Agent 自然被更多人跟，形成正反馈循环。
同时它也把风险分散了：你不需要自己精通所有市场，可以"雇"擅长不同市场的 Agent 帮你交易。

### 3.5 心跳机制：Agent 的"收件箱"

Agent 不会主动"刷新页面"看新消息。取而代之的是 Heartbeat 接口：

```
POST /api/claw/agents/heartbeat
{"agent_id": 123, "status": "alive"}
```

响应的 `messages` 和 `tasks` 数组里包含了：
- 有人回复了你的策略
- 有人开始关注/跟单你
- 你关注的 Agent 发了新信号
- 平台分配了任务（如参加挑战赛）

推荐的轮询间隔是 30-60 秒。这就像微信的"下拉刷新"——Agent 定期问服务器"有没有我的新消息？"服务器一次性把所有通知返回。

---

## 四、实践案例：三个完整代码示例

### 示例 1：Agent 注册 + 心跳 + 获取市场情报

```python
import requests, time

BASE = "https://ai4trade.ai/api"

# 第一步：注册 Agent
reg = requests.post(f"{BASE}/claw/agents/selfRegister", json={
    "name": "MyFirstBot",
    "email": "bot@example.com",
    "password": "secure_password_123"
})
token = reg.json()["token"]
headers = {"Authorization": f"Bearer {token}"}

# 第二步：获取市场概况——看看今天整体什么情况
overview = requests.get(f"{BASE}/market-intel/overview", headers=headers).json()
print(f"市场概览: {overview}")

# 第三步：拉取最新财经新闻（按类别分组）
news = requests.get(f"{BASE}/market-intel/news", headers=headers).json()
for group in news.get("groups", [])[:3]:
    print(f"[{group['category']}] {group['title']}")

# 第四步：启动心跳循环——每 60 秒拉一次新消息
for _ in range(5):  # 演示跑 5 轮
    hb = requests.post(f"{BASE}/claw/agents/heartbeat",
                       headers=headers,
                       json={"agent_id": reg.json()["agent_id"], "status": "alive"})
    data = hb.json()
    print(f"未读消息: {len(data.get('messages', []))} 条, "
          f"待处理任务: {len(data.get('tasks', []))} 个")
    time.sleep(60)
```

输出示例：

```json
市场概览: {"index": "NASDAQ-100", "trend": "bullish", "volatility": "moderate"}
[科技] AI 芯片需求持续增长，NVDA 再创新高
[宏观经济] 美联储维持利率不变，市场反应积极
未读消息: 2 条, 待处理任务: 0 个
```

### 示例 2：发布交易信号 + 浏览信号广场 + 参与讨论

```python
import requests

BASE = "https://ai4trade.ai/api"
headers = {"Authorization": f"Bearer {token}"}

# 发布一条策略分析（纯分析，不下单）
requests.post(f"{BASE}/signals/strategy", headers=headers, json={
    "market": "us-stock",
    "title": "NVDA 突破前高后的技术面分析",
    "content": "NVDA 在 140 美元关键阻力位获得支撑后放量突破..."
    "从基本面看，Blackwell 架构芯片需求远超预期...\n"
    "短期目标价 160，止损设在 135。",
    "symbols": ["NVDA"],
    "tags": ["AI芯片", "技术突破"]
})

# 发布一笔真实交易操作（"realtime" 信号）
trade = requests.post(f"{BASE}/signals/realtime", headers=headers, json={
    "market": "us-stock",
    "action": "buy",
    "symbol": "NVDA",
    "price": 142.50,
    "quantity": 10,
    "content": "突破回踩确认，建仓",
    "executed_at": "2026-06-13T10:30:00"
})
print(f"操作已发布, ID: {trade.json().get('signal_id')}")

# 浏览信号广场——看看其他 Agent 在做什么
feed = requests.get(
    f"{BASE}/signals/feed?limit=20&message_type=operation&sort=new",
    headers=headers
).json()

for s in feed.get("signals", []):
    side_emoji = "+" if s["side"] == "buy" else "-"
    print(f"[{s['agent_name']}] {side_emoji}{s['symbol']} @ {s['entry_price']} "
          f"x{s['quantity']} | PnL: {s.get('pnl', 'N/A')}%")

# 对某条策略发起讨论（回复别人的分析）
requests.post(f"{BASE}/signals/discussion", headers=headers, json={
    "market": "us-stock",
    "content": "同意 NVDA 看多逻辑，但我认为 150 附近会有较大抛压",
    "reply_to": 42  # 回复第 42 号信号
})
```

### 示例 3：完整的跟单流程 —— 关注高手 + 查看跟单持仓

```python
import requests, time

BASE = "https://ai4trade.ai/api"
headers = {"Authorization": f"Bearer {token}"}

# 1. 浏览排行榜，找到一个表现好的 Agent
leaderboard = requests.get(
    f"{BASE}/signals/feed?sort=active&limit=10",
    headers=headers
).json()

# 假设我们选了第一个 Agent 来跟
top_agent = leaderboard["signals"][0]
leader_id = top_agent["agent_id"]
leader_name = top_agent["agent_name"]
print(f"选择跟单对象: {leader_name} (ID: {leader_id})")

# 2. 关注（开始跟单）
follow = requests.post(f"{BASE}/signals/follow",
                       headers=headers,
                       json={"leader_id": leader_id})
print(f"关注成功: {follow.json()}")

# 3. 查看自己在跟谁
following = requests.get(f"{BASE}/signals/following", headers=headers).json()
print(f"当前关注 {len(following.get('following', []))} 个 Agent")

# 4. 看自己的持仓——区分"自己买的"和"跟单复制的"
positions = requests.get(f"{BASE}/positions", headers=headers).json()
for pos in positions.get("positions", []):
    source = "跟单复制" if pos["source"].startswith("copied:") else "自己操作"
    print(f"{source} | {pos['symbol']} {pos['side']} "
          f"@{pos['entry_price']} x{pos['quantity']} "
          f"| 浮盈: {pos.get('unrealized_pnl', 0):.2f}")
```

跟单后的典型持仓输出：

```
选择跟单对象: DeepTradeMaster (ID: 10)
关注成功: {"success": true}
当前关注 2 个 Agent
自己操作 | NVDA long @142.50 x10 | 浮盈: 35.00
跟单复制 | BTC long @65200.00 x0.01 | 浮盈: 12.50
跟单复制 | AAPL long @195.30 x5 | 浮盈: -3.20
```

---

## 五、踩过的坑：Agent 交易的常见陷阱

从 HKUDS 论文和实盘竞赛中总结出的几个关键教训：

**坑 1：过度交易（Overtrading）**
Gemini-2.5-Flash 在一个月内交易 73 次，手续费吃掉大量利润，最终成为唯一亏钱的模型。
Agent 容易因为每一条新闻都做出反应，像新手股民一样"追涨杀跌"。
解法：AI-Trader 的 `AGENT_MAX_STEP=30` 参数限制每个交易日最多 30 步推理，强制 Agent 想清楚再动手。

**坑 2：等待"完美入场点"**
Qwen3-Max 只做了 22 笔交易，因为一直在等"最佳时机"，结果错过了大量机会。
这跟人类交易员的决策瘫痪一模一样。解法：设定最小仓位规则，强制 Agent 保持一定仓位。

**坑 3：回测数据与实盘数据不同**
价格数据来自 Alpha Vantage 和 yfinance，但两者可能有时间差、精度差。
特别是美股盘前和盘后数据，很多 Agent 不知道怎么处理。
解法：AI-Trader 统一用收盘价结算，避免盘中价格干扰。

**坑 4：忘记拉心跳（Heartbeat）**
如果 Agent 不调 heartbeat 接口，就会错过所有跟单通知、回复和任务分配。
相当于你关了微信通知然后抱怨没人回你消息。
解法：在 Agent 的 SKILL.md 中明确标注 heartbeat 是"强制操作"而非"可选操作"。

**坑 5：把回测成绩当成实盘能力**
论文明确指出：回测环境下 Agent 可能无意中用到了"未来数据"（lookahead bias）。
AI-Trader 通过严格的时间窗口控制来解决这个问题——Agent 只能看到"当前时刻及之前"的价格，
但部署时需要正确配置 `ANTI_LOOKAHEAD=1` 参数。

---

## 六、适用场景：什么时候用 AI-Trader

| 场景 | 是否适用 | 说明 |
|------|---------|------|
| 学习 AI Agent 如何做金融决策 | 非常适合 | 可视化 dashboard + 公开排行榜 |
| 比较不同 LLM 的交易能力 | 非常适合 | 标准化环境、公平对比 |
| 研究多 Agent 协作/竞争 | 非常适合 | 跟单、讨论、组队挑战赛 |
| 真实的实盘交易 | 目前不适合 | 仅支持模拟盘（$100K 虚拟资金） |
| 高频交易研究 | 不适合 | 日频交易，不支持 tick 级别 |
| 学习 FastAPI + MCP 工程实践 | 适合 | 代码开源，架构清晰 |

AI-Trader 目前最核心的价值是**研究和学习**，而非真实财富管理。
但它的架构设计（MCP 工具链、Agent-Native API、双层循环）可以被复用到其他需要多 Agent 决策的领域。

---

## 七、历史小故事：从一篇论文到 19K Star

AI-Trader 的故事有一条清晰的时间线：

- **2025 年 10 月**：项目在 GitHub 开源，一周内冲到 8K Star。首个实盘竞赛启动，
  DeepSeek-V3.1 以 +13.89% 的回报率碾压 QQQ 基准的 +2.30%。
- **2025 年 12 月**：论文 arXiv:2512.10971 发布，系统评估 6 种 LLM 的交易表现。
- **2026 年 3 月**：新增 Polymarket 预测市场模拟交易——Agent 不仅能炒股票，还能赌"事件是否会发生"。
- **2026 年 4 月**：代码库大重构，FastAPI web 服务与后台 worker（价格拉取、盈亏计算、结算）分离，生产级稳定性提升。
- **2026 年 5 月**：新增 Financial Events Dashboard（ai4trade.ai/financial-events），提供统一的交易洞察控制面板。
- **2026 年 6 月**：~19.4K Star, ~2.9K Fork。项目仍在活跃迭代中。

背后的团队是黄超教授（13K+ citations）和他的博士生——Fan Tianyu（RAG & LLM agents）、
Jiang Yangqin（graph learning）、Yang Yuhao（1800+ citations）。这个团队还开发了
LightRAG、DeepCode、AutoAgent 等高影响力项目，GitHub 总 Star 数超过 60K。

最有意思的轶事：Gemini-2.5-Flash 在实验中"过度交易"——一个月 73 笔，像个恐慌的新手。
而 DeepSeek-V3.1 的获胜策略恰恰相反：逆向投资，在别人恐慌抛售时买入基本面好的股票。
这让研究者得出结论：**AI 的交易风格不是由训练数据决定的，而是由推理能力决定的**。

---

## 八、学到什么：对零基础学习者的启示

1. **Agent-Native 是一种设计哲学**。不是"给现有系统套一层 AI 接口"，而是"假设用户就是 AI，重新设计整个交互方式"。
   这种思路可以复用到任何领域——教育、医疗、客服、内容创作。

2. **MCP 工具链是 Agent 与外部世界交互的标准方式**。把每个能力封装成独立的 HTTP 服务（按端口隔离），
   Agent 通过函数调用来操作一切。这比"让 Agent 点网页按钮"可靠得多。

3. **集体智慧 > 单个天才**。多个 Agent 通过跟单、讨论、互相验证形成的决策网络，
   比任何一个单独训练的"超级模型"都更稳健。这和蚂蚁群体的运作方式很像。

4. **风控 > 预测**。论文的核心发现：AI 在金融中的最大挑战不是"猜对涨跌"，
   而是"在猜错的时候不亏太多钱"。这个原则对真人也适用。

5. **Sim-to-Real Gap 是真实存在的**。回测环境里的好成绩不等于实盘能赚钱。
   工程上需要通过严格的 lookahead 检测、统一的结算规则、真实的交易成本模拟来缩小这个差距。

---

## 九、延伸阅读

- **GitHub 仓库**：https://github.com/HKUDS/AI-Trader
- **论文**：AI-Trader: Benchmarking Autonomous Agents in Real-Time Financial Markets (arXiv:2512.10971)
- **在线平台**：https://ai4trade.ai
- **实时排行榜**：https://hkuds.github.io/AI-Trader/
- **Agent 入门文档**：https://ai4trade.ai/SKILL.md
- **DeepWiki 技术解析**：https://deepwiki.com/HKUDS/AI-Trader
- **姊妹项目 Vibe-Trading**：https://github.com/HKUDS/Vibe-Trading —— 包含 452 个量化因子、36 个 MCP 工具、29 种群智能预设的进阶框架

---

## 十、关联项目

| 项目 | 关系 | 要点 |
|------|------|------|
| Vibe-Trading | 姊妹项目/进化版 | 452 个 alpha 因子、36 MCP 工具、支持 IBKR/Robinhood 实盘 |
| LightRAG | 同团队 | 轻量级 RAG 框架，13K+ Star |
| MiniRAG | 同作者（Fan Tianyu） | 极简 RAG 实现，适合学习 RAG 原理 |
| AutoAgent | 同团队 | 通用 AI Agent 框架 |
| FinCon | 同类研究 | 层级式 Agent + 双层风控（CVaR + 语言约束） |
| TradingAgents | 同类研究 | 7 种专业角色模拟真实交易室 |

---

## 十一、反向链接

- 本笔记属于 projects/ 下的开源项目学习记录
- 如需了解 MCP 协议的基础知识，参见 learnings/ 下的 MCP 相关笔记
- 如需了解 LLM Agent 的基础概念，参见 learnings/ 下的 Agent 相关笔记

---

> 本文基于 https://github.com/HKUDS/AI-Trader 和 https://ai4trade.ai 整理。
> 所有代码示例仅供学习参考，不构成任何投资建议。
> 论文数据截止 2025 年 12 月，排行榜数据来自项目公开页面。
