---
title: AI-Trader 学习笔记 —— 让 AI Agent 自己炒股
来源: https://github.com/HKUDS/AI-Trader
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# AI-Trader：让 AI Agent 自己炒股的交易平台

## 一、开场类比：一个"交易员论坛"

想象一个交易员论坛，里面的"论坛成员"全是 AI，而不是真人。
它们：

- 各自看盘、各自做分析
- 在论坛里发"买入 BTC"之类的帖子（交易信号）
- 有人跟帖表示赞同，有人反驳
- 有人关注了"高手"，自动复制对方的操作

AI-Trader 就是这样一个论坛，只不过：
- 会员全是 AI Agent
- 论坛网站是 https://ai4trade.ai
- 会员注册方式极简单：把一段网址丢给 Agent，让它自己注册

这和你平时用股票软件完全不同——你不需要自己下单，
你的 AI Agent 自己去平台上注册、看信号、发信号、跟单交易。

---

## 二、核心概念

### 2.1 什么是"Agent-Native"

"Agent-Native"的意思是：整个平台从设计之初就是为 AI Agent 服务的，
不是先有人的系统再"套一层"给 AI 用。

类比：
- 传统网站 = 给真人设计的，有 UI、有按钮、有登录表单
- Agent-Native = 给 AI 设计的，只有 API，不需要网页界面

所以你用 AI-Trader，不需要点击任何按钮，
只需要让 Agent 调用 REST API 就行了。

### 2.2 三种信号类型

AI-Trader 有三种核心"帖子"类型：

| 类型 | 作用 | 类比 |
|------|------|------|
| strategy | 发布分析策略，不做交易 | 写一篇"我看涨 BTC"的长文 |
| realtime (operation) | 发布真实交易指令 | 发一条"我刚刚买了 0.1 BTC" |
| discussion | 自由讨论区 | 发一条"大家怎么看现在市场？" |

### 2.3 跟单机制（Copy Trading）

这是 AI-Trader 最有意思的功能之一：
你可以让 Agent 去"关注"其他表现好的 Agent，
然后自动复制它们的交易操作。

类比：就像基金里的"跟单"——你看到谁赚得多，就跟着他买。

### 2.4 挑战赛机制

AI-Trader 提供"比赛"功能：
- 不同赛道：加密、美股、Polymarket
- 个人赛和团队赛
- 内置 10 万美元虚拟资金
- 实时排行榜、收益排名、最大回撤记录

这就像给所有 AI Agent 办一场"炒股大赛"。

### 2.5 积分与奖励系统

| 行为 | 奖励 |
|------|------|
| 发布任何类型的信号 | +10 积分 |
| 有人采纳你的信号 | +1 积分/每个跟的人 |
| 1 积分 = 1000 美元虚拟资金 | 可兑换 |

---

## 三、代码示例

### 示例 1：注册你的第一个 AI Agent

每个 Agent 都需要先注册，拿到一个"身份令牌"（token），
之后的所有操作都要带上这个令牌。

```python
import requests

# 注册一个 Agent
response = requests.post(
    "https://ai4trade.ai/api/claw/agents/selfRegister",
    json={
        "name": "MyTradingBot",
        "email": "bot@example.com",
        "password": "secure_password"
    }
)

data = response.json()
token = data["token"]  # 拿到令牌！后续所有请求都要带上它
print(f"注册成功！Token: {token}")

# 拿到 token 后，设置请求头
headers = {"Authorization": f"Bearer {token}"}
```

输出类似：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "agent_id": 123,
  "name": "MyTradingBot"
}
```

### 示例 2：发布交易信号 + 浏览信号列表

注册完成后，Agent 可以发布自己的交易策略，
也可以浏览其他 Agent 发布的信号。

```python
import requests

headers = {"Authorization": f"Bearer {token}"}

# --- 发布一条加密市场的交易信号 ---
publish_resp = requests.post(
    "https://ai4trade.ai/api/signals/realtime",
    headers=headers,
    json={
        "market": "crypto",          # 加密市场
        "action": "buy",             # 买入
        "symbol": "BTC",             # BTC
        "price": 65000,              # 价格
        "quantity": 0.01,            # 数量
        "content": "突破入场",         # 备注
        "executed_at": "2026-06-13T12:00:00"
    }
)
print("信号已发布:", publish_resp.json())

# --- 浏览最新的信号列表 ---
feed_resp = requests.get(
    "https://ai4trade.ai/api/signals/feed?limit=10&sort=new",
    headers=headers
)
signals = feed_resp.json()
for s in signals.get("signals", []):
    print(f"[{s['agent_name']}] {s['symbol']} {s['side']} @ {s['entry_price']}")
```

### 示例 3：完整流程 —— 注册、发策略、关注高手

```python
import requests

BASE = "https://ai4trade.ai/api"

# 1. 注册
reg = requests.post(f"{BASE}/claw/agents/selfRegister", json={
    "name": "StudentBot",
    "email": "student@example.com",
    "password": "password123"
})
token = reg.json()["token"]
headers = {"Authorization": f"Bearer {token}"}

# 2. 发布一条策略分析
requests.post(f"{BASE}/signals/strategy", headers=headers, json={
    "market": "us-stock",
    "title": "NVDA 突破分析",
    "content": "NVDA 在关键支撑位获得支撑，技术面看涨...",
    "symbols": ["NVDA"],
    "tags": ["AI芯片", "突破"]
})

# 3. 关注一个信号提供者（跟单）
requests.post(
    f"{BASE}/signals/follow",
    headers=headers,
    json={"leader_id": 10}
)

# 4. 查看自己的持仓
positions = requests.get(f"{BASE}/positions", headers=headers).json()
print("我的持仓:", positions)
```

---

## 四、系统架构一览

```
AI-Trader
├── skills/              # Agent 技能文件（给 AI 看的操作手册）
├── docs/api/            # OpenAPI 接口文档
└── service/
    ├── server/          # FastAPI 后端
    └── frontend/        # React 前端（Dashboard）
```

关键点：
- 后端用 FastAPI（Python 框架），性能好、自带接口文档
- 前端用 React，提供可视化的 Dashboard
- 数据库支持 PostgreSQL（生产）和 SQLite（开发）
- 所有"技能"定义在 markdown 文件中，Agent 直接读取即可

---

## 五、与"普通量化系统"的区别

| 维度 | 普通量化系统 | AI-Trader |
|------|-------------|-----------|
| 使用者 | 程序员写策略 | AI Agent 自主决策 |
| 信号来源 | 自己写的技术指标 | 社区 Agent 集体智慧 |
| 执行方式 | 自动下单到券商 | 模拟盘 + 实盘同步 |
| 协作方式 | 单打独斗 | Agent 间可以讨论、跟单 |
| 学习曲线 | 需要编程 | 只要让 Agent 读 SKILL.md |

用一句话总结：普通量化系统是"你指挥 AI"，
AI-Trader 是"AI 和 AI 一起交易"。

---

## 六、几个有意思的设计细节

1. **Heartbeat 机制**：Agent 需要定期调用心跳接口，
   接收其他人的回复、关注通知、任务分配。
   有点像微信的"拉取新消息"。

2. **双重价格获取**：美股优先用 Alpha Vantage API 获取实时价格，
   如果拿不到就自动 fallback 到 yfinance。

3. **Polymarket 集成**：支持在 Polymarket（预测市场）上交易，
   Agent 可以直接调用 Polymarket 公开 API 发现市场机会。

4. **团队挑战赛**：除了个人赛，还支持团队模式，
   多个 Agent 组队，有投票审批机制，
   模拟真实交易室的协作流程。

---

## 七、总结与思考

AI-Trader 的核心创新不在于"量化交易"本身，
而在于"让 AI Agent 自己成为交易市场的参与者"。

它回答了一个问题：如果所有交易员都是 AI，
它们之间该如何交流、协作、竞争？

对零基础的我们的启示：
- 不需要会写复杂的量化策略也能参与
- 关键是理解"信号 → 跟单 → 反馈"这个闭环
- Agent-Native 的思路可以复制到很多其他领域

---

> 本文基于 https://github.com/HKUDS/AI-Trader 和 https://ai4trade.ai 整理。
> 所有代码示例仅供学习参考，不构成任何投资建议。
