---
title: Agno (phidata) 零基础入门笔记
来源: https://github.com/agno-agi/agno
日期: 2026-06-13
分类_原始: AI / 大模型应用开发
分类: Agent
子分类: 智能体与 LLM
provenance: pipeline-v3
---

# Agno (phidata) 零基础入门笔记

## 一、Agno 是什么？用一个类比来理解

想象你要开一家餐厅：

- **LLM（大语言模型）** 就像一位知识渊博的厨师，能写菜谱、会聊天，但不知道你家厨房有什么食材。
- **Agno** 就是这套厨房系统——它给厨师配好了冰箱（知识库）、工具箱（工具）、记账本（记忆），甚至还有一面监控摄像头（追踪日志）。

Agno 是一个 Python SDK + 运行时平台，让你能「构建、运行、管理」自己的 AI Agent 平台。它的口号是：**Build, run, and manage agent platforms.**

简单说：

- 用 Agno SDK 写 Agent（智能体）
- 用 AgentOS 把 Agent 跑成生产级服务
- 用一个管理面板统一管理所有 Agent

## 二、核心概念

### 2.1 Agent（智能体）

Agent 是 Agno 最基本的单位。官方定义：

> Agents are a stateful control loop around a stateless model.

用大白话说：模型本身是「无状态」的——它只负责思考和调用工具。Agent 则在模型外面包了一层「状态管理」，让它能记住对话历史、管理工具调用、持续完成任务。

一个 Agent 包含：

| 组件 | 作用 | 类比 |
|------|------|------|
| model | 驱动 Agent 的 AI 模型 | 厨师的大脑 |
| tools | 让 Agent 能操作外部世界 | 刀具、锅铲、冰箱 |
| instructions | 给 Agent 的「工作指南」 | 菜单和标准操作流程 |
| memory | 跨会话的记忆能力 | 厨师的笔记本 |
| knowledge | 挂载知识库（如文档、网页） | 食材百科全书 |
| db | 会话存储 | 点单记录本 |

### 2.2 Team（团队）

多个 Agent 可以组成 Team，分工协作。比如一个 Team 里有个「研究员」和一个「写手」，研究员负责查资料，写手负责写报告。

### 2.3 Workflow（工作流）

比 Team 更精细的控制——你可以规定 Agent A 做完后交给 Agent B，或者根据条件走不同的分支。类似流水线上的自动化装配线。

### 2.4 AgentOS

如果把单个 Agent 看作一台机器，AgentOS 就是整个工厂：

- 提供 50+ REST API 端点
- 支持会话隔离、JWT 认证、角色权限管理（RBAC）
- 内置追踪日志（tracing）、定时任务（scheduling）
- 可对接 Slack、Telegram、WhatsApp、Discord
- 自带 Web 管理面板

## 三、代码示例

### 示例 1：创建一个最简单的 Agent

这是 Agno 文档中的第一个示例——一个能帮你整理文件文件夹的 Agent。

```python
from pathlib import Path
from agno.agent import Agent
from agno.tools.workspace import Workspace

folder = Path(".")

# 创建一个 Agent
sorting_hat = Agent(
    # 指定使用的 AI 模型（支持 OpenAI、Anthropic、Google 等 100+ 模型）
    model="openai:gpt-5.5",
    
    # 给 Agent 配工具——这里给它一个" workspace "工具
    # 可以读取文件、列出目录、搜索、执行 shell 命令
    tools=[Workspace(root=str(folder), allowed=["read", "list", "search", "shell"])],
    
    # 给 Agent 的工作指令
    instructions=(
        "浏览这个文件夹，搞清楚里面都有什么，然后提出一个整理方案。"
        "自己决定分类方式。如果 shell 命令有用就使用（比如 file、pdftotext）。"
        "最后返回一个整洁的总结、分类说明和文件夹树状图。"
    ),
    
    # 让回复支持 Markdown 格式
    markdown=True,
)

# 运行 Agent，stream=True 表示边生成边输出
sorting_hat.print_response(f"整理并分析 {folder}", stream=True)
```

这个例子展示了 Agent 最核心的用法：

1. 导入 `Agent` 类
2. 传入 model（用哪个 AI）
3. 传入 tools（能让它做什么）
4. 传入 instructions（告诉它怎么做）
5. 调用 `print_response()` 让它干活

### 示例 2：带记忆和存储的生产级 Agent

第一个例子只是"一次性脚本"。如果我们要让 Agent 能持续对话、记住历史，就需要加 `db`（数据库）和 `memory`（记忆）。

```python
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.tools.workspace import Workspace

# 创建带记忆的 Agent
workbench = Agent(
    name="Workbench",
    model="openai:gpt-5.5",
    
    # 用 SQLite 存储会话数据——对话历史会自动管理
    db=SqliteDb(db_file="workbench.db"),
    
    # 操作当前目录
    tools=[Workspace(".")],
    
    # 启用智能记忆——Agent 能从使用中学习模式
    enable_agentic_memory=True,
    
    # 把最近的对话历史注入到上下文中
    add_history_to_context=True,
    num_history_runs=3,  # 保留最近 3 次运行记录
)

# 用 AgentOS 启动服务
# 这会让你的 Agent 变成一个可访问的 API 服务
# 支持流式响应、认证、会话隔离、API 端点
agent_os = AgentOS(agents=[workbench], tracing=True)
app = agent_os.get_app()

# 运行: fastapi dev workbench.py
# 服务启动后访问 http://localhost:8000/docs 看 API 文档
# 访问 os.agno.com 打开 Web 管理面板
```

这个例子里多了几个关键概念：

| 新增项 | 说明 |
|--------|------|
| `db=SqliteDb(...)` | 会话持久化。AgentOS 自动管理会话的读写和上下文注入 |
| `enable_agentic_memory=True` | 启用 Agent 记忆——它可以从历史使用中学习到你的偏好 |
| `add_history_to_context=True` | 把过往对话加入当前上下文，让 Agent 「记得之前聊过什么」 |
| `AgentOS` | 把 Agent 包装成生产级服务，自带 API、认证、追踪 |

## 四、Agno 能做什么？

根据官方文档和案例，Agno 的典型应用场景：

- **In-product 协作助手** — 像 Slack 里的代码伴侣，团队工作时实时协作
- **数据 Agent** — 自动分析数据、生成报告、做质量审计
- **文档处理** — 自动化文档分类、信息提取、知识整理
- **员工助手** — 连接 Slack、Google Drive、Wiki 等工作工具
- **数据标注** — ML 团队用来标注文本、图像、音频、视频数据
- **合成数据生成** — 自动生成训练数据和评估数据

## 五、安装与起步

```bash
# 创建虚拟环境
uv venv --python 3.12
source .venv/bin/activate

# 安装基础版
uv pip install -U agno openai

# 如果需要 AgentOS 完整功能
uv pip install -U 'agno[os]'
```

## 六、学习路线建议

1. **先跑通示例 1** — 理解 Agent、model、tools 三个核心概念
2. **理解 Tools 系统** — Agno 有 100+ 预建工具包（HackerNews、Google、Slack 等），这是 Agent 能力的来源
3. **深入 Memory 和 Knowledge** — 记忆 vs 知识库的区别：记忆是 Agent 自己学会的，知识库是你喂给它的
4. **尝试 AgentOS** — 把 Agent 跑成服务，体验生产级部署
5. **学习 Team 和 Workflow** — 从单 Agent 进阶到多 Agent 协作

## 七、个人理解总结

Agno 的核心价值在于「全栈」：

- 写 Agent 时：提供 SDK（Agent / Team / Workflow）
- 跑 Agent 时：提供 AgentOS 运行时（API / 存储 / 追踪 / 认证）
- 管 Agent 时：提供 Web 管理面板

它把通常需要你搭好几套系统才能完成的事情，浓缩到了一个 `pip install agno` 里。对于想快速验证 Agent 想法、或者搭建内部 Agent 平台的人来说，这是一个很好的起点。
