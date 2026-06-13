---
title: LangGraph — 有状态 Agent 编排
来源: https://github.com/langchain-ai/langgraph
日期: 2026-06-13
分类: 机器学习
子分类: ai-infra
provenance: pipeline-v3
---

## 是什么

LangGraph 是 LangChain 出品的一个**底层编排框架**，用来构建**有状态、能长期运行、可以中断恢复**的 AI Agent。日常类比：如果你把 Agent 比作一个员工，普通的 LLM 调用就像一个记性很差的人——每次问你话，他都不记得上次聊了什么；LangGraph 则给这个员工配了一个**笔记本**，每做一件事都记下来，下次问的时候翻开笔记本继续。更重要的是，这个笔记本还能持久保存——就算员工下班了（程序崩溃），第二天再来还能从上次停下的地方继续。

LangGraph 受 Google 的 Pregel 分布式计算框架启发，用"图（Graph）"的方式组织 Agent 的行为：每个"节点（Node）"做一件事（比如调用 LLM、执行工具），每条"边（Edge）"决定从哪个节点走到哪个节点。它提供两个 API：

- **Graph API**（图式）：显式定义节点和边，像画流程图一样构建 Agent
- **Functional API**（函数式）：写一个普通函数，用 `@task` 和 `@entrypoint` 装饰器标记

## 为什么重要

LangGraph 解决了 AI Agent 的三大核心问题：

1. **状态持久化**：Agent 可以跑很长时间，中途挂了也能从断点恢复
2. **人在环路（Human-in-the-loop）**：可以在执行过程中停下来让人审核或修改
3. **完整记忆**：短期记忆（当前对话上下文）+ 长期记忆（跨会话持久存储）

由 LangChain 团队开发，截至 2026 年 6 月已在 Klarna、Uber、J.P. Morgan 等公司生产环境使用，GitHub Star 34.6k+。

## 核心概念

**State（状态）**：Agent 的"笔记本"。用 `TypedDict` 定义结构，每次节点执行完都会更新状态。关键是 `Annotated` + `operator.add` 让消息自动追加而不是覆盖。

**Node（节点）**：Agent 的一步操作。一个函数，接收当前状态，返回要更新的状态字段。比如"调用 LLM"是一个节点，"执行工具"是另一个节点。

**Edge（边）**：节点之间的连接线。`add_edge(START, "llm_call")` 表示从起点进入 LLM 节点，`add_conditional_edges` 则根据条件决定走向。

**Graph（图）**：所有节点和边的集合。定义完后调用 `.compile()` 编译成可运行的 Agent。

**Persistence（持久化）**：LangGraph 的状态可以保存到数据库，Agent 崩溃后通过同一个 checkpoint 恢复，就像游戏存档一样。

## 代码示例一：Graph API 版计算器 Agent

这是用图式 API 构建的完整计算器 Agent：

```python
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, MessagesState, START, END
from langchain.messages import SystemMessage, HumanMessage, ToolMessage
from typing import Literal
import operator

# 1. 定义工具和模型
model = init_chat_model("claude-sonnet-4-6", temperature=0)

@tool
def multiply(a: int, b: int) -> int:
    """Multiply a and b."""
    return a * b

@tool
def add(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [add, multiply]
tools_by_name = {t.name: t for t in tools}
model_with_tools = model.bind_tools(tools)

# 2. 定义状态（笔记本的结构）
class AgentState(MessagesState):
    llm_calls: int  # 记录调了几次 LLM

# 3. 定义节点
def llm_call(state):
    """LLM 决定要不要调用工具"""
    return {
        "messages": [
            model_with_tools.invoke(
                [SystemMessage(content="你是一个计算器助手。")]
                + state["messages"]
            )
        ],
        "llm_calls": state.get("llm_calls", 0) + 1
    }

def tool_node(state):
    """执行 LLM 请求的工具调用"""
    result = []
    for tc in state["messages"][-1].tool_calls:
        tool = tools_by_name[tc["name"]]
        observation = tool.invoke(tc["args"])
        result.append(ToolMessage(
            content=observation, tool_call_id=tc["id"]
        ))
    return {"messages": result}

# 4. 定义条件路由（决定走工具还是结束）
def should_continue(state) -> Literal["tool_node", END]:
    last = state["messages"][-1]
    if last.tool_calls:
        return "tool_node"  # 有工具调用，去执行
    return END  # 没有，结束对话

# 5. 构建图并编译
builder = StateGraph(AgentState)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)

builder.add_edge(START, "llm_call")
builder.add_conditional_edges(
    "llm_call", should_continue, ["tool_node", END]
)
builder.add_edge("tool_node", "llm_call")  # 工具执行完回到 LLM

agent = builder.compile()

# 6. 运行
result = agent.invoke({
    "messages": [HumanMessage(content="3 乘以 7 等于几？")]
})
for m in result["messages"]:
    m.pretty_print()
```

这里的关键是 `tool_node` 执行完后，边又回到 `llm_call`，形成**循环**——LLM 调用工具、拿到结果、再判断是否继续调用，直到不需要工具为止。

## 代码示例二：Functional API 版（更简洁）

函数式 API 用普通 Python 函数写控制流，不需要手动定义边：

```python
from langgraph.func import entrypoint, task
from langchain.messages import SystemMessage, HumanMessage
from langchain_core.messages import BaseMessage
from langchain.messages import add_messages

@task
def call_llm(messages: list[BaseMessage]):
    """调用 LLM 的 task"""
    return model_with_tools.invoke(
        [SystemMessage(content="你是一个计算器助手。")] + messages
    )

@task
def call_tool(tool_call):
    """执行单个工具调用的 task"""
    tool = tools_by_name[tool_call["name"]]
    return tool.invoke(tool_call)

@entrypoint()
def agent(messages: list[BaseMessage]):
    model_response = call_llm(messages).result()

    # while 循环就是"人在环路"之外的自动循环
    while True:
        if not model_response.tool_calls:
            break  # 没有工具调用，结束
        # 并行执行所有工具
        futures = [call_tool(tc) for tc in model_response.tool_calls]
        results = [f.result() for f in futures]
        messages = add_messages(messages, [model_response, *results])
        model_response = call_llm(messages).result()

    messages = add_messages(messages, model_response)
    return messages

# 运行
for chunk in agent.stream(
    [HumanMessage(content="5 加 8 再乘以 2 等于几？")],
    stream_mode="updates"
):
    print(chunk)
```

`@task` 标记的函数可以被并行执行（比如多个工具调用），`@entrypoint` 是 Agent 的入口。`stream_mode="updates"` 让你看到每次状态更新的中间结果。

## 核心概念对比

| 概念 | 图式 API（Graph） | 函数式 API（Functional） |
|------|------|------|
| 定义方式 | 节点 + 边的流程图 | 一个入口函数 |
| 循环控制 | 边回到上一节点 | `while` 循环 |
| 条件路由 | `add_conditional_edges` | `if / else` |
| 并行任务 | 需要手动编排 | `@task` 自动并行 |
| 适用场景 | 复杂多分支流程 | 简单工具循环 |

## 持久化：游戏存档般的体验

LangGraph 的状态可以保存到数据库（如 SQLite、PostgreSQL）。Agent 跑了一半程序挂了，重启后用同一个 `thread_id` 加载 checkpoint，就能从断点继续——不需要重新跑前面的步骤。这让 Agent 可以安全地运行需要几分钟甚至几小时的任务。

```python
from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()
agent = builder.compile(checkpointer=memory)

# 第一次运行
result = agent.invoke(
    {"messages": [HumanMessage(content="3 + 5 = ?")]},
    config={"configurable": {"thread_id": "thread-1"}}
)

# 程序重启后，用同一个 thread_id 加载之前的状态
# Agent 记得之前聊过什么
```

## 学习路线建议

1. 先理解 LLM 和 Tool（LangChain 的基础组件）
2. 用 Graph API 跑通一个计算器 Agent（理解节点、边、状态）
3. 试试 Functional API 对比两种写法
4. 加入 persistence（持久化），理解 checkpoint 机制
5. 学习 Human-in-the-loop（中断点），体验人在回路中的审核能力

参考：LangChain Academy 有免费的 [Intro to LangGraph](https://academy.langchain.com/courses/intro-to-langgraph) 课程，非常适合零基础入门。
