---
title: Agno — 多模态 Agent 平台框架
来源: https://github.com/agno-agi/agno
日期: 2026-06-13
分类_原始: AI / Agent 框架
分类: 机器学习
子分类: ai-agent-infra
provenance: pipeline-v3
---

# Agno — 多模态 Agent 平台框架

## 一句话概括

Agno 是一个 Python SDK，帮你「用几行代码创建一个 AI Agent，再把它变成生产可用的 API 服务」。

它不跟你纠缠于 Prompt 怎么写，而是把 Agent 从「脚本」变成「服务」——自带会话管理、记忆、追踪、调度、权限控制。

## 日常类比

想象你开了一家餐馆：

- **普通的 LLM 调用** 就像你每次都要亲自跑到厨房，告诉厨师「帮我做个宫保鸡丁」，厨师做好端出来。下一个顾客还要再跑一趟、再说一遍。
- **Agno** 就像给餐馆装了一套完整的运营系统：有个前台（API 端点）接待顾客，每张桌子有编号（Session ID），服务员记得每位客人上次点了什么（Memory），厨师的操作都有监控录像（Tracing），而且系统还能自动告诉厨师「今天 10 点要准备材料」（Scheduling）。

简单说：Agno 把「跟 AI 聊一次天」变成了「运营一个 AI 服务」。

## 核心概念

### 1. Agent（智能体）

Agent 是 Agno 的基本单位。你只需要给它三样东西：名字、用哪个模型、给它什么工具。

```python
from agno.agent import Agent

assistant = Agent(
    name="Data Analyst",
    model="openai:gpt-5.5",
    instructions="你是一个数据分析助手，擅长用 Python 分析数据并生成报告。",
    markdown=True,
)
```

- **name**：Agent 的标识名
- **model**：指定底层 AI 模型，支持 OpenAI、Anthropic、Google、本地模型等
- **instructions**：给 Agent 的「角色设定」
- **markdown**：让回复自动渲染为 Markdown 格式

### 2. Tools（工具）

工具是 Agent 能干活的「手」。Agno 内置了 100+ 个预建工具包，也可以自己写。

```python
from agno.agent import Agent
from agno.tools.duckduckgo import DuckDuckGoTools

search_agent = Agent(
    name="Web Researcher",
    model="openai:gpt-5.5",
    tools=[DuckDuckGoTools()],  # 让 Agent 能搜索互联网
    instructions="当用户问问题时，先搜索最新信息再回答。",
)

response = search_agent.run("2026年AI领域有什么重大突破？")
print(response.content)
```

常见工具包包括：文件读写、网页搜索、数据库查询、Slack 消息、代码执行等。

### 3. Session & Memory（会话与记忆）

这是 Agno 和其他框架的区别所在。普通的 LLM 调用每次都是「失忆」的，Agno 帮你持久化会话和记忆。

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb

memory_agent = Agent(
    name="My Assistant",
    model="openai:gpt-5.5",
    db=SqliteDb(db_file="assistant.db"),       # 会话存储
    enable_agentic_memory=True,                 # 开启记忆功能
    add_history_to_context=True,                # 把历史对话加入上下文
    num_history_runs=3,                         # 保留最近 3 轮对话
)

# 第一次对话 — Agent 记住了你说过的话
memory_agent.run("我喜欢Python和Rust，帮我推荐学习路径")

# 第二次对话 — Agent 会记得上次的内容
memory_agent.run("接着上次的建议，我该怎么开始？")
```

`db=SqliteDb(...)` 把会话存在本地 SQLite 数据库，生产环境可以换成 PostgreSQL、Redis 等。`enable_agentic_memory=True` 让 Agent 从使用中学会东西。

### 4. AgentOS（运行时）

AgentOS 是 Agno 的「引擎室」。注册 Agent 之后，一行代码就能启动一个完整的 API 服务。

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.tools.workspace import Workspace

workbench = Agent(
    name="Workbench",
    model="openai:gpt-5.5",
    db=SqliteDb(db_file="workbench.db"),
    tools=[Workspace(".")],
    enable_agentic_memory=True,
    add_history_to_context=True,
    num_history_runs=3,
)

# 一键启动生产 API 服务
agent_os = AgentOS(agents=[workbench], tracing=True)
app = agent_os.get_app()
```

然后用 `fastapi dev workbench.py` 启动，API 就在 `http://localhost:8000` 运行了。你自动获得：

| 功能 | 说明 |
|------|------|
| 50+ API 端点 | 会话管理、记忆管理、追踪查看、调度任务等 |
| SSE 流式响应 | 大段回复可以逐字输出 |
| 后台任务 | 可以异步执行耗时操作 |
| JWT 权限控制 | 多用户、多租户隔离 |
| 内置 UI | 访问 `os.agno.com` 连接后即可聊天和管理 |

### 5. 多模态支持

Agno 支持图片、视频、音频等多模态输入。Agent 可以直接接收并处理文件。

```python
from agno.agent import Agent

vision_agent = Agent(
    name="Image Analyzer",
    model="openai:gpt-5.5",  # GPT-4V 系列支持多模态
)

# 分析一张图片
response = vision_agent.run(
    "描述这张图片的内容，并分析图中的布局",
    images=["photo.jpg"],
)
```

### 6. Context Providers（上下文提供者）

Context Providers 让 Agent 能访问实时数据源：Slack、Google Drive、MCP 服务器、自定义 API 等。

## Agno 与同类框架对比

| 维度 | Agno | LangChain / LangGraph | OpenAI Agents SDK |
|------|------|----------------------|-------------------|
| 定位 | Agent 平台（从代码到服务） | Agent 编排框架 | 单层 Agent SDK |
| 内置 API 服务 | 有（AgentOS） | 需要自己搭建 | 无 |
| 会话/记忆 | 内置 | 需要接第三方 | 无 |
| 追踪/监控 | 内置 OpenTelemetry | 需要 LangSmith | 无 |
| 权限/RBAC | 内置 JWT+RBAC | 无 | 无 |
| 部署 | 容器化部署到任意云平台 | 自行决定 | 不适用 |

Agno 的特点是：「给你搭好一个完整的 Agent 服务平台，你只管定义 Agent 的行为」。

## 完整示例：一个会搜索+写文件的 Agent

```python
from pathlib import Path
from agno.agent import Agent
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.workspace import Workspace

folder = Path(__file__).parent

researcher = Agent(
    name="Research Writer",
    model="openai:gpt-5.5",
    tools=[
        DuckDuckGoTools(),          # 搜索互联网
        Workspace(root=str(folder), allowed=["read", "list", "write", "shell"]),
    ],
    instructions=(
        "搜索用户给的主题，整理出关键点，"
        "然后写一份 Markdown 格式的报告保存到研究文件夹。"
        "最后返回目录结构。"
    ),
    markdown=True,
)

response = researcher.print_response(
    "请研究 Rust 的 Error Handling 最佳实践并写一份报告",
    stream=True,
)
```

运行这个脚本，Agent 会：
1. 用 DuckDuckGo 搜索主题
2. 整理关键信息
3. 写入 Markdown 文件
4. 输出报告 + 目录树

## 学习路线建议

1. **第一步**：用 20 行代码跑通第一个 Agent（官方教程）
2. **第二步**：理解 Session + Memory 是怎么工作的（换不同的数据库后端）
3. **第三步**：尝试加入工具包，让 Agent 能访问外部资源
4. **第四步**：用 AgentOS 把 Agent 变成 API 服务，接入前端界面
5. **第五步**：了解生产级功能：RBAC、OpenTelemetry 追踪、调度、人类审批流

## 关键资源

- 文档：https://docs.agno.com
- 源码：https://github.com/agno-agi/agno（40.7k stars）
- 第一个 Agent 教程：https://docs.agno.com/first-agent
- 编码 Agent 集成指南：https://docs.agno.com/coding-agents
