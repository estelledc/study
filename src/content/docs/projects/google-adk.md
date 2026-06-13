---
title: Google ADK — Agent 开发套件
来源: https://github.com/google/adk-python
日期: 2026-06-13
子分类: ai-agent-infra
分类: 机器学习
provenance: pipeline-v3
---

## 是什么

Google ADK（Agent Development Kit）是 Google 开源的一套**用代码定义 AI Agent 的开发框架**。日常类比：假设你要雇一个助理（Agent），你只需要写一封"职位描述"——告诉他叫什么名字、用什么"大脑"（AI 模型）、做什么事（指令）、能用什么工具。ADK 就是帮你把这份"职位描述"变成真正能跑起来的程序。

它跟 LangChain 有点像，但理念不同：LangChain 偏向"把所有东西串成管道"，ADK 更像"搭乐高"——一个 Agent 就是一个积木块，多个积木块拼成工作流（Workflow）或图（Graph）。

ADK 2.0 是 2026 年初 GA 的重大版本，新增了图工作流引擎和 Agent 间任务委托 API。目前同时支持 Python、TypeScript、Go、Java、Kotlin 五种语言。

## 为什么重要

- GitHub 上 **20k+ stars**，是当前增长最快的 Agent 框架之一
- Google 官方出品，与 Gemini 模型深度集成，企业场景下信任度更高
- 2.0 版引入了**图工作流**——这不是简单的"顺序执行"，而是支持分支、循环、并行 fan-out/fan-in、人工审核（human-in-the-loop）的完整执行引擎
- 支持**多 Agent 协作**——Agent 可以互相委托任务，形成团队
- 一套 Agent 可以一键部署到 Google Cloud（Cloud Run、GKE）

## 核心概念

### 1. Agent（智能体）

Agent 是 ADK 的最小可执行单元。定义一个 Agent 只需要三个东西：

- **name**：Agent 的名字
- **model**：用哪个 AI 模型当"大脑"
- **instruction**：给它的工作说明（类似 system prompt）

```python
from google.adk import Agent

researcher = Agent(
    name="researcher",
    model="gemini-2.5-flash",
    instruction="You help users research topics thoroughly. Use web search when needed.",
)
```

就这么几行代码，你就拥有了一个能跟用户对话、会用搜索工具的 Agent。

### 2. Workflow（工作流）

单个 Agent 能做的事情有限。当任务变复杂时，你需要让**多个 Agent 协同工作**——ADK 提供了两种模式：

**模式 A：Workflow（Agent 链）**

把一个 Agent 的输出传递给下一个 Agent，形成流水线。

```python
from google.adk import Agent, Workflow

fruit_generator = Agent(
    name="fruit_generator",
    instruction="Return the name of a random fruit. Return only the name.",
)

benefit_writer = Agent(
    name="benefit_writer",
    instruction="Tell me one health benefit about the specified fruit.",
)

# START -> fruit_generator -> benefit_writer -> END
pipeline = Workflow(
    name="fruit_benefit_pipeline",
    edges=[("START", fruit_generator, benefit_writer)],
)
```

用户问一个话题时，fruit_generator 先生成一个水果名，然后传给 benefit_writer 写健康说明。两个 Agent 各司其职，这就是 Workflow。

**模式 B：Graph（图）**

ADK 2.0 新增的图工作流更强大——它不是简单的流水线，而是一个**有向图执行引擎**。你可以定义节点之间的路由、分支、循环、并行执行等复杂逻辑。适合需要"根据中间结果决定下一步怎么走"的场景。

### 3. Tools（工具）

Agent 本身只负责"思考"，真正动手干活靠的是工具。ADK 内置了 Google Search 等工具，你也可以自定义：

```python
from google.adk import Agent
from google.adk.tools import google_search

researcher = Agent(
    name="researcher",
    model="gemini-2.5-flash",
    instruction="You help users research topics thoroughly.",
    tools=[google_search],  # 把搜索工具交给 Agent 使用
)
```

### 4. Session（会话）和 Memory（记忆）

Agent 需要"记住"之前聊过什么。ADK 自动管理上下文：它会过滤无关内容、压缩旧对话、追踪 token 用量——不像有些框架只会把字符串越拼越长直到溢出。

## 怎么跑起来

安装很简单：

```bash
pip install google-adk
```

创建一个 Python 文件（比如 `my_agent.py`）：

```python
from google.adk import Agent

greeting_agent = Agent(
    name="greeting_agent",
    model="gemini-2.5-flash",
    instruction="You are a helpful assistant. Greet the user warmly.",
)
```

然后两条命令即可运行：

```bash
# 交互式 CLI 模式（终端里直接对话）
adk run my_agent

# Web UI 模式（浏览器里可视化操作）
adk web .
```

## 关键特性速览

- **多语言**：Python（主力）、TypeScript、Go、Java、Kotlin —— 团队用什么语言就选哪个 SDK
- **多模型**：内置 Gemini，也支持 Anthropic Claude、Ollama（本地模型）、vLLM 等
- **部署**：本地 CLI / Web UI 调试，生产环境可一键部署到 Google Cloud Run 或 GKE
- **可观测性**：内置日志、指标、追踪（Logging / Metrics / Traces）
- **评估**：支持 Criteria 评估、用户模拟、环境模拟、自定义指标
- **开源协议**：Apache 2.0

## 跟同类框架对比

| | LangChain | LangGraph | Semantic Kernel | Google ADK |
|---|---|---|---|---|
| 理念 | 管道编排 | 状态机 | .NET 优先 | 积木式 Agent + 图 |
| 语言 | Python/JS | Python/JS | C#/Python/JS | Py/TS/Go/Java/Kotlin |
| 图工作流 | 通过 LangGraph | 有 | 部分 | **2.0 原生支持** |
| 多 Agent 协作 | 通过 LangGraph | 有 | 部分 | **Task API 原生支持** |
| Google 生态集成 | 一般 | 一般 | 无 | **深度集成** |

## 适合谁

- **初学者**：几行代码就能跑起来一个 Agent，门槛很低
- **企业团队**：多语言支持 + 企业级部署 + Google Cloud 原生集成
- **想理解"Agent 到底是什么"的人**：ADK 把 Agent 拆得很干净——一个 Agent 就是一个定义，不会像某些框架那样一层套一层
