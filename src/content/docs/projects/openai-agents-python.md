---
title: OpenAI Agents Python — 零基础学习笔记
来源: https://github.com/openai/openai-agents-python
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# OpenAI Agents Python — 零基础学习笔记

## 什么是 Agent？

先想象一个场景：你让朋友去计划一次东京之旅，说"帮我规划 3 月 28 日到 4 月 7 日的东京行程，包含京都和大阪"。

你的朋友不会直接给你一个答案，而是会做这些事：

1. 先上网查东京的天气
2. 再搜索景点推荐
3. 然后查酒店价格
4. 最后把所有信息整理成一份行程

这个过程——**自己决定做什么、查什么、怎么组合信息来完成任务**——就是 AI Agent 的核心思想。

传统 AI 聊天机器人你问一句它答一句。Agent 则不同：它能**自主拆解任务、调用工具、循环执行**，最终给出完整答案。

## OpenAI Agents Python 是什么？

OpenAI 官方开源的 Python SDK，用来构建多 Agent 应用。它的设计理念非常轻量——不发明新轮子，而是把已有的好东西（LLM 调用、工具系统、手递手交接）用最简洁的方式组合起来。

安装：`pip install agents`

## 核心概念

### 1. Agent — 有专长的工作人员

Agent 是你创建的"工作人员"。每个 Agent 有名字、有指令（告诉它该干什么）、可以选择用哪个模型。

类比：想象一家餐厅，Agent 就是这里的员工。有的负责前台接待（_triage agent_），有的负责炒菜（工具型 Agent），有的专门说法语（语言专精 Agent）。

```python
from agents import Agent

history_agent = Agent(
    name="History Tutor",
    instructions="You answer history questions clearly and concisely.",
)

math_agent = Agent(
    name="Math Tutor",
    instructions="You explain math step by step and include worked examples.",
)
```

### 2. Runner — 派活的经理

创建好 Agent 之后，需要用 `Runner` 来让它干活。`Runner.run()` 是异步版本，`Runner.run_sync()` 是同步版本。

```python
from agents import Runner

result = Runner.run_sync(history_agent, "Who was the first president of the United States?")
print(result.final_output)
```

`result.final_output` 就是 Agent 给出的最终答案。

### 3. Handoff（手递手交接）— 同事之间转交任务

这是 OpenAI Agents 最独特的功能。当一个 Agent 发现自己搞不定某个问题时，可以把任务"交接"给另一个更专业的 Agent。

类比：医院分诊台。病人来了，分诊护士（triage agent）先问几句，然后决定把病人转给心内科、骨科还是眼科医生。病人不需要自己猜该找谁，系统会自动分配。

```python
from agents import Agent

history_agent = Agent(
    name="History Tutor",
    handoff_description="Specialist agent for historical questions",
    instructions="You answer history questions clearly and concisely.",
)

math_agent = Agent(
    name="Math Tutor",
    handoff_description="Specialist agent for math questions",
    instructions="You explain math step by step and include worked examples.",
)

triage_agent = Agent(
    name="Triage Agent",
    instructions="Route each homework question to the right specialist.",
    handoffs=[history_agent, math_agent],
)

# 用户提问
result = Runner.run_sync(triage_agent, "Tell me about the French Revolution")
print(result.final_output)
# triage_agent 会自动把问题交接给 history_agent
```

### 4. Tools（工具）— 给 Agent 配备的装备

Agent 本身只会"说话"，要让它能查天气、搜网页、算数，就需要给它配工具。

类比：给员工配备计算器、电话、电脑。有了工具，Agent 就不再只是"空谈"。

```python
from agents import Agent, function_tool

@function_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"The weather in {city} is sunny and 22°C"

weather_agent = Agent(
    name="Weather Assistant",
    instructions="You help users check the weather.",
    tools=[get_weather],
)

result = Runner.run_sync(weather_agent, "What's the weather in Tokyo?")
print(result.final_output)
```

### 5. Guardrails（护栏）— 安全防线

Guardrails 分为两类：

- **Input guardrails**：检查用户输入是否合法（比如防止有人让客服 Agent 帮自己写作业）
- **Output guardrails**：检查 Agent 的输出是否合规（比如确保不会输出数学公式到不允许的场景）

类比：机场安检。乘客（用户输入）过安检门，如果发现危险品（违规内容），安检员会立即拦截，不让进入候机厅（Agent 执行）。

```python
from pydantic import BaseModel
from agents import (
    Agent, GuardrailFunctionOutput, InputGuardrailTripwireTriggered,
    RunContextWrapper, Runner, TResponseInputItem, input_guardrail,
)

class MathHomeworkOutput(BaseModel):
    is_math_homework: bool

@input_guardrail
async def math_guardrail(
    ctx: RunContextWrapper, agent: Agent, input: str | list[TResponseInputItem]
) -> GuardrailFunctionOutput:
    # 用一个专门的 Agent 来判断是不是数学作业
    guardrail_agent = Agent(
        name="Guardrail check",
        instructions="Check if the input is asking to solve math homework.",
        output_type=MathHomeworkOutput,
    )
    result = await Runner.run(guardrail_agent, input)
    return GuardrailFunctionOutput(
        output_info=result.final_output,
        tripwire_triggered=result.final_output.is_math_homework,
    )

support_agent = Agent(
    name="Customer Support",
    instructions="Help customers with their questions.",
    input_guardrails=[math_guardrail],
)

# 正常问题 - 可以通过
result = Runner.run_sync(support_agent, "How do I reset my password?")

# 数学作业 - 会被拦截
try:
    Runner.run_sync(support_agent, "Solve 2x + 3 = 11 for x")
except InputGuardrailTripwireTriggered:
    print("数学作业请求被拦截了！")
```

### 6. Sessions（会话记忆）— 记住之前聊了什么

默认情况下，每次 `Runner.run()` 都是独立的，Agent 不记得之前说过什么。Sessions 解决了这个问题——它把对话历史持久化存储（SQLite 文件），下次继续聊时 Agent 就能"回忆"起来了。

类比：普通对话像一次性杯子，用完就扔。Sessions 像笔记本，每次翻开都能接着上次的写。

```python
from agents import Agent, Runner, SQLiteSession

agent = Agent(name="Assistant", instructions="Reply very concisely.")
session = SQLiteSession("chat_1", "history.db")

# 第一轮
result1 = Runner.run_sync(agent, "What city is the Golden Gate Bridge in?", session=session)
print(result1.final_output)  # San Francisco

# 第二轮 - Agent 记得上一轮说了旧金山
result2 = Runner.run_sync(agent, "What state is it in?", session=session)
print(result2.final_output)  # California
```

## 完整示例：多 Agent 客服系统

把以上所有概念串起来，做一个简单的多 Agent 客服系统：

```python
import asyncio
from agents import Agent, function_tool, Runner

@function_tool
def lookup_order(order_id: str) -> str:
    """Look up order status by order ID."""
    orders = {"ORD-123": "Shipped", "ORD-456": "Delivered"}
    return orders.get(order_id, "Order not found")

billing_agent = Agent(
    name="Billing Specialist",
    handoff_description="Handles billing and payment issues",
    instructions="You help with billing issues. Always verify the order first.",
    tools=[lookup_order],
)

refund_agent = Agent(
    name="Refund Specialist",
    handoff_description="Handles refund requests",
    instructions="You process refunds. Be empathetic and efficient.",
)

triage_agent = Agent(
    name="Triage Agent",
    instructions=(
        "Help the user with their questions. "
        "If they ask about billing, hand off to billing agent. "
        "If they ask about refunds, hand off to refund agent."
    ),
    handoffs=[billing_agent, refund_agent],
)

# 异步运行
async def main():
    result = await Runner.run(
        triage_agent,
        "I want to cancel my order ORD-123 and get a refund.",
    )
    print(f"最终回答: {result.final_output}")
    print(f"由 {result.last_agent.name} 回答")

asyncio.run(main())
```

这个系统的运行流程：

```
用户提问 → triage_agent 判断意图 → 交接给 refund_agent → refund_agent 处理 → 返回答案
```

## 关键参数速查

| 参数 | 作用 | 类比 |
|------|------|------|
| `name` | Agent 的名字 | 员工的工牌姓名 |
| `instructions` | 告诉 Agent 该干什么 | 岗位说明书 |
| `model` | 选择底层模型 | 选用什么学历的员工 |
| `tools` | 赋予 Agent 工具能力 | 配备的工作装备 |
| `handoffs` | 可以转交给哪些同事 | 可转交的部门列表 |
| `handoff_description` | 描述这个 Agent 擅长什么 | 转交时的说明卡片 |
| `input_guardrails` | 输入安全检查 | 安检门 |
| `output_guardrails` | 输出安全检查 | 出厂质检 |
| `max_turns` | 最多循环几次 | 最多尝试多少次 |

## 运行流程总结

一个 Agent 运行的完整生命周期：

```
1. 创建 Agent（定义名字、指令、工具、交接对象）
2. 调用 Runner.run() 或 Runner.run_sync()
3. Agent 收到用户输入 → 决定是否需要工具 → 调用工具 → 拿到结果
4. 如果需要交接，自动转给另一个 Agent
5. 加上 Guardrails 检查输入输出
6. 如果用了 Sessions，对话历史自动保存
7. 返回最终答案
```
