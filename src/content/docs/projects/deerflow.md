---
title: DeerFlow — 深度研究 Agent
来源: https://github.com/bytedance/deer-flow
日期: 2026-06-13
分类: 机器学习
子分类: ai-agent-infra
provenance: pipeline-v3
---

# DeerFlow — 深度研究 Agent

## 日常类比

想象你正在写一份关于"2026年AI趋势"的报告。你一个人做，要花整整一周：查资料、写代码分析数据、整理结论、排版成PPT。

DeerFlow 做了什么？它相当于雇佣了一整个团队：

- **主项目经理（Lead Agent）**：接到任务后，把大工作拆成若干子任务
- **子研究员（Sub-Agents）**：每个专注一个方向，比如一个专门查资料，一个专门写代码
- **实习生的工作台（Sandbox）**：每个研究员有一个隔离的电脑，互不影响
- **图书馆（Memory）**：团队干过的活、学过的东西，下次还能用到

DeerFlow 就是搭建这个"团队"的基础设施。它由字节跳动开源，基于 LangGraph 和 LangChain 构建，核心定位是一个 **Super Agent Harness**——不是一个你能自己拼凑的框架，而是一个开箱即用、完全可扩展的智能体运行平台。

## 核心概念

### 1. Skills（技能模块）

技能是 DeerFlow 能干"几乎任何事"的关键。一个技能本质上是一个结构化的 Markdown 文件，定义了某个工作流、最佳实践和相关资源。DeerFlow 内置了研究、报告生成、PPT制作、网页生成、图片/视频生成等技能。

技能是"按需加载"的——只有任务需要时才加载，不会一次性塞满上下文窗口。用户也可以通过斜杠命令手动激活技能：

```
/data-analysis analyze uploads/foo.csv
```

### 2. Sub-Agents（子智能体）

复杂任务不适合单次处理。主智能体可以动态生成子智能体，每个子智能体有独立的上下文、工具集和终止条件。子智能体并行执行，将结构化结果汇报给主智能体，由主智能体汇总输出。

这是 DeerFlow 能处理"从几分钟到几小时"级别任务的核心机制。

### 3. Sandbox（沙箱环境）

DeerFlow 不只是"能说话"，它真的有自己的"电脑"。每个任务获得一个完整的执行环境：读写文件、执行 shell 命令、查看图片。沙箱支持三种模式：

- **本地执行**：直接在宿主机上运行
- **Docker 隔离**：在容器内运行，安全隔离
- **Kubernetes 编排**：通过 provisioner 在 K8s 集群中运行

### 4. Context Engineering（上下文工程）

DeerFlow 管理上下文的方式非常聪明：

- 每个子智能体运行在**隔离上下文**中，不会干扰主智能体
- 完成的子任务会被**摘要**，中间结果被转存到文件系统
- 遇到工具调用被意外中断时，有**严格恢复机制**保证模型不崩溃

### 5. Long-Term Memory（长期记忆）

大多数智能体对话结束就忘。DeerFlow 不同——它记住你的偏好、写作风格、技术栈和常用工作流。记忆存在本地，完全由用户控制。

## 代码示例

### 示例 1：配置模型（config.yaml）

DeerFlow 通过 YAML 配置文件指定使用的 LLM。以下是一个典型配置，包含 OpenAI 和 OpenRouter 两种模型：

```yaml
models:
  # OpenAI 模型
  - name: gpt-4o
    display_name: GPT-4o
    use: langchain_openai:ChatOpenAI
    model: gpt-4o
    api_key: $OPENAI_API_KEY

  # 通过 OpenRouter 使用 Gemini
  - name: openrouter-gemini-2.5-flash
    display_name: Gemini 2.5 Flash (OpenRouter)
    use: langchain_openai:ChatOpenAI
    model: google/gemini-2.5-flash-preview
    api_key: $OPENROUTER_API_KEY
    base_url: https://openrouter.ai/api/v1

  # 本地 vLLM 部署的 Qwen 模型
  - name: qwen3-32b-vllm
    display_name: Qwen3 32B (vLLM)
    use: deerflow.models.vllm_provider:VllmChatModel
    model: Qwen/Qwen3-32B
    api_key: $VLLM_API_KEY
    base_url: http://localhost:8000/v1
    supports_thinking: true
    when_thinking_enabled:
      extra_body:
        chat_template_kwargs:
          enable_thinking: true
```

关键点：
- `use` 字段指定 LangChain 的模型加载路径
- `api_key` 引用 `.env` 文件中的环境变量
- `supports_thinking: true` 告诉 DeerFlow 这个模型支持思维链（thinking/reasoning）

### 示例 2：配置 IM 渠道（config.yaml）

DeerFlow 支持通过 Telegram、Slack、飞书、微信等即时通讯平台接收任务：

```yaml
channels:
  langgraph_url: http://localhost:8001/api
  gateway_url: http://localhost:8001

  # Telegram 渠道
  telegram:
    enabled: true
    bot_token: $TELEGRAM_BOT_TOKEN
    allowed_users: []

  # 飞书渠道
  feishu:
    enabled: true
    app_id: $FEISHU_APP_ID
    app_secret: $FEISHU_APP_SECRET

  # Slack 渠道（需要 Socket Mode）
  slack:
    enabled: true
    bot_token: $SLACK_BOT_TOKEN
    app_token: $SLACK_APP_TOKEN
    allowed_users: []

  # 企业微信渠道
  wecom:
    enabled: true
    bot_id: $WECOM_BOT_ID
    bot_secret: $WECOM_BOT_SECRET
```

配置好之后，你就可以在聊天窗口直接给 DeerFlow 发任务。支持的命令包括：

| 命令 | 说明 |
|------|------|
| `/new` | 开始新对话 |
| `/status` | 查看当前线程状态 |
| `/models` | 列出可用模型 |
| `/memory` | 查看长期记忆 |
| `/help` | 帮助 |

没有命令前缀的消息会被当作普通聊天处理，DeerFlow 会自动创建线程并回复。

### 示例 3：通过 DeerFlow 的 Python 客户端发送任务

DeerFlow 内置了一个 Python 客户端，可以在其他程序中使用：

```python
from deerflow_client import DeerFlowClient

# 连接到本地运行的 DeerFlow 实例
client = DeerFlowClient(base_url="http://localhost:2026")

# 流式发送任务，支持四种执行模式：
# - flash：快速执行
# - standard：标准执行
# - pro：启用规划
# - ultra：启用子智能体并行
for event in client.stream(
    message="帮我调研 2026 年 AI Agent 框架的现状，生成一份报告",
    mode="ultra"
):
    if event.type == "content":
        print(event.content, end="", flush=True)
    elif event.type == "done":
        print("\n任务完成！")
```

## 快速开始

### Docker 一键部署（推荐）

```bash
git clone https://github.com/bytedance/deer-flow.git
cd deer-flow
make setup        # 交互式配置向导，选择模型提供商、搜索工具等
make docker-start # 启动所有服务
```

然后访问 http://localhost:2026 即可使用。

### 本地开发

```bash
make check        # 检查 Node.js 22+、pnpm、uv、nginx
make install      # 安装前后端依赖
make dev          # 启动本地开发服务
```

### 推荐模型

官方推荐使用以下模型组合运行 DeerFlow：

- **Doubao-Seed-2.0-Code**（豆包）
- **DeepSeek v3.2**
- **Kimi 2.5**

也支持 OpenAI、OpenRouter、vLLM 以及 Claude Code CLI 等。

## DeerFlow 2.0 的变化

DeerFlow 2.0 是一次从零开始的重写，与 v1 没有任何共享代码。v1 版本维护在 `main-1.x` 分支上。

主要的变化包括：

- 从"Deep Research 框架"升级为 **Super Agent Harness**——不只是做研究，而是做"几乎任何事"
- 内置技能系统、沙箱执行、长期记忆、子智能体调度，开箱即用
- 更强的上下文工程管理，支持长时多步骤任务
- 丰富的 IM 渠道集成，可以在任何聊天平台使用

## 架构概览

```
┌─────────────────────────────────────────┐
│              前端 UI / IM 渠道             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│            Gateway (nginx 代理)           │
├─────────────────────────────────────────┤
│  LangGraph API │ 子智能体调度 │ 沙箱管理   │
├─────────────────────────────────────────┤
│  技能系统 │ 长期记忆 │ 上下文工程 │ 工具集  │
├─────────────────────────────────────────┤
│  模型适配层 (OpenAI / vLLM / Claude 等)    │
└─────────────────────────────────────────┘
```

## 为什么值得关注

1. **开源且 MIT 许可**：可以自由商用和修改
2. **字节跳动实战验证**：71k+ Star，GitHub Trending #1
3. **不只是研究工具**：从研究扩展到数据处理、PPT 生成、仪表盘搭建等
4. **灵活的语言模型适配**：支持几乎所有主流 LLM
5. **本地优先的记忆系统**：数据完全由用户掌控

## 参考资料

- GitHub 仓库：https://github.com/bytedance/deer-flow
- 官方网站：https://deerflow.tech
- 安装文档：https://github.com/bytedance/deer-flow/blob/main/Install.md
