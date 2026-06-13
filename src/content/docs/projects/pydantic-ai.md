---
title: Pydantic AI — 零基础学习笔记
来源: https://github.com/pydantic/pydantic-ai
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# Pydantic AI — 零基础学习笔记

## 什么是 Pydantic AI

Pydantic AI 是由 Pydantic 团队（就是做 FastAPI 数据验证那个团队）开发的 Python AI Agent 框架。

日常类比：如果把 LLM（大语言模型）想象成一个很聪明但经常胡说八道的外包员工，那 Pydantic AI 就是一套"管理制度"——它给这个员工明确的工作流程、工具权限和验收标准，让你能用写普通 Python 代码的方式，可靠地驱动 LLM 完成真实任务。

核心一句话：**它是 Pydantic 验证库的 AI 延伸，用你熟悉的类型系统来约束 LLM 的输出和行为。**

## 核心概念

Pydantic AI 围绕以下几个核心概念构建：

1. **Agent（智能体）** — 一切的核心。Agent 是一个容器，装着指令、工具、输出类型、依赖项和模型配置。就像一台配置好的机器，你给它原料（用户输入），它就按设定好的流程运转，产出结果。
2. **Models & Providers（模型与供应商）** — 支持 OpenAI、Anthropic、Google Gemini、DeepSeek 等几乎所有主流 LLM，通过统一的接口调用，不用改代码就能切换模型。
3. **Tools（工具）** — 你给 Agent 准备的"工具箱"。LLM 在回答过程中可以调用这些工具获取信息，比如查数据库、调 API、做计算。
4. **Dependencies（依赖注入）** — 通过类型安全的方式把外部资源（数据库连接、配置等）注入到 Agent 中。
5. **Output（输出）** — Agent 最终返回的结果。可以是纯文本、结构化数据（由 Pydantic 保证格式正确），也可以是自定义函数的返回。
6. **Capabilities（能力包）** — 可复用的功能模块，比如联网搜索、深度思考，像插件一样装到 Agent 上。
7. **Structured Output（结构化输出）** — 用 Pydantic BaseModel 定义输出格式，LLM 的返回会被自动校验，不合格就让它重写。

## 代码示例一：最简单的 Hello World

这是最小可用示例，理解了这个，其他都是在此基础上加东西。

```python
from pydantic_ai import Agent

# 1. 创建一个 Agent，指定要用的模型和指令
agent = Agent(
    'anthropic:claude-sonnet-4-6',
    instructions='Be concise, reply with one sentence.',
)

# 2. 运行 Agent，传入用户问题
result = agent.run_sync('Where does "hello world" come from?')

# 3. 拿到结果
print(result.output)
# The first known use of "hello, world" was in a 1974 textbook about the C programming language.
```

逐行拆解：

- `Agent()` 构造函数接收模型标识（`'provider:model-name'` 格式）和可选参数。
- `instructions` 是给 LLM 的系统指令，相当于告诉它"你怎么工作"。
- `run_sync()` 是同步运行（也可以用 `run()` 异步运行），返回一个 `AgentRunResult` 对象。
- `result.output` 就是 LLM 的最终回答。

关键理解：Agent 本身只是"配置"，真正的对话发生在调用 `run_sync()` 的那一刻。Agent 可以重复使用，就像 FastAPI 的 App 对象。

## 代码示例二：带工具的结构化输出

这个例子展示两个核心能力：给 Agent 配备工具 + 要求结构化输出。

场景：一个银行客服 Agent，能查询用户余额，并返回结构化的客服建议。

```python
from dataclasses import dataclass
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

# --- 第一步：定义依赖项（Agent 运行时需要的外部资源）---
@dataclass
class SupportDependencies:
    customer_id: int
    db: 'DatabaseConn'  # 数据库连接

# --- 第二步：定义输出的数据结构 ---
# LLM 的回答必须符合这个格式，否则会被要求重写
class SupportOutput(BaseModel):
    support_advice: str = Field(description='Advice returned to the customer')
    block_card: bool = Field(description="Whether to block the customer's card")
    risk: int = Field(description='Risk level of query', ge=0, le=10)

# --- 第三步：创建 Agent ---
support_agent = Agent(
    'openai:gpt-5.2',
    deps_type=SupportDependencies,  # 告诉 Agent 需要什么依赖
    output_type=SupportOutput,       # 要求结构化输出
    instructions=(
        'You are a support agent in our bank, give the '
        'customer support and judge the risk level of their query.'
    ),
)

# --- 第四步：注册工具 ---
# 工具函数会被 LLM 在需要时调用
# @tool 装饰器的工具可以访问 RunContext（包含依赖项）
@support_agent.tool
async def customer_balance(
    ctx: RunContext[SupportDependencies], include_pending: bool
) -> float:
    """Returns the customer's current account balance.
    
    Args:
        include_pending: Whether to include pending transactions.
    """
    # ctx.deps 就是 SupportDependencies 实例
    balance = await ctx.deps.db.customer_balance(
        id=ctx.deps.customer_id,
        include_pending=include_pending,
    )
    return balance

# --- 第五步：运行 ---
async def main():
    deps = SupportDependencies(customer_id=123, db=DatabaseConn())
    
    # 用户说余额查询
    result = await support_agent.run('What is my balance?', deps=deps)
    print(result.output)
    # support_advice='Hello John, your current account balance is $123.45.'
    # block_card=False risk=1
    
    # 用户说卡片丢了
    result = await support_agent.run('I just lost my card!', deps=deps)
    print(result.output)
    # support_advice="I'm sorry to hear that, John. We are temporarily
    # blocking your card." block_card=True risk=8

import asyncio
asyncio.run(main())
```

逐行拆解关键部分：

1. **`@dataclass` 定义依赖** — 把数据库连接和客户 ID 打包，通过依赖注入传给 Agent。这就像给机器配好电源和原材料再启动。

2. **`BaseModel` 定义输出结构** — `SupportOutput` 规定了 LLM 回答必须包含三个字段：`support_advice`（字符串）、`block_card`（布尔值）、`risk`（0-10 的整数）。如果 LLM 返回的格式不对，Pydantic AI 会自动把验证错误丢回去让 LLM 重写，直到格式正确为止。

3. **`@support_agent.tool` 注册工具** — 被这个装饰器标记的函数，LLM 可以在回答过程中调用。`RunContext[SupportDependencies]` 让工具能访问依赖项（比如查数据库）。函数的 docstring 会自动变成 LLM 理解的工具描述。

4. **`ctx.deps` 访问依赖** — 工具内部通过 `ctx.deps` 拿到 `SupportDependencies`，就像拿到了机器的控制面板。

5. **LLM 自主决策调用工具** — 当用户问"我的余额是多少"时，LLM 会：先调用 `customer_balance` 工具拿到余额数据，再根据数据生成结构化回答。整个过程是 LLM 自主决定调用工具的时机和参数。

## 工作流程全景

```
用户输入 → Agent 执行图（Graph）→ LLM 响应 → 结束
                ↑                        ↓
           工具调用 ←──────────── 格式校验（Pydantic）
                ↓
          返回工具结果 → 继续对话
```

Agent 内部维护一个状态机（Graph），每个回合可能经历这些节点：

1. **用户提问** — 收到用户的自然语言输入
2. **向 LLM 发请求** — 把指令 + 历史对话发给模型
3. **LLM 思考** — 可能决定调用工具，也可能直接回答
4. **执行工具** — 如果调用了工具，执行并返回结果
5. **校验输出** — 如果要求结构化输出，用 Pydantic 校验格式
6. **重复或结束** — 格式不对就让 LLM 重写；格式对了就返回

## 其他重要特性

- **流式输出（Streaming）** — 可以逐 token 获取结果，适合实时展示。用 `run_stream()` 方法。
- **能力插件（Capabilities）** — 内置 `Thinking()`（让模型深度推理）、`WebSearch()`（联网搜索）等，传入 `capabilities=[Thinking(), WebSearch()]` 即可启用。
- **使用量限制（Usage Limits）** — 可以设置最大 token 数、请求次数、工具调用次数，防止无限循环或超支。
- **可观测性（Observability）** — 原生集成 Pydantic Logfire，能追踪每次调用的 token 消耗、延迟、成本。
- **多模型支持** — 一个框架搞定所有主流 LLM，切换模型只需改一行字符串。

## 总结

Pydantic AI 的设计哲学可以概括为三点：

1. **类型即契约** — 用 Python 类型注解和 Pydantic 模型约束 LLM 行为，把错误从运行时推到编写时。
2. **Agent 可复用** — 一个 Agent 实例可以全局复用或按需创建，类似 FastAPI 的 App。
3. **工具即扩展** — 普通 Python 函数就是工具，docstring 就是 LLM 的理解文档，零额外学习成本。

对学习者的建议：先跑通 Hello World 示例，再逐个添加工具、结构化输出、流式输出，每一层都很自然。
