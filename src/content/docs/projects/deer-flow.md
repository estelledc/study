---
title: DeerFlow — 字节跳动的超级智能体引擎
来源: https://github.com/bytedance/deer-flow
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# DeerFlow — 字节跳动的超级智能体引擎

## 一、先问一个问题：你用过"分工合作"吗？

想象一下，你要写一份关于"2026 年 AI 趋势"的深度报告。

一个人从头干到完，要查资料、要分析、要写 PPT、要画图——可能一周都搞不完。但如果把任务拆出去呢？

- 研究员 A 去搜全球最新论文
- 研究员 B 去抓竞品公司的财报
- 设计师 C 根据数据做可视化图表
- 主编 D 把所有人的成果汇总成最终报告

这就是 **DeerFlow** 的核心思想。

DeerFlow（Deep Exploration and Efficient Research Flow，深度探索与高效研究流程）是字节跳动开源的一个**超级智能体引擎**（Super Agent Harness）。它用 LangGraph 做编排底层，让一个大模型当"项目经理"，自动拆分任务、派出多个"子智能体"并行工作，最后把结果汇总成一份完整的交付物。

> **一句话定位**：DeerFlow 不是聊天机器人，它是一个能真正"干活"的智能体基础设施——有文件系统、有长期记忆、有技能库、有隔离沙箱，还能派兵遣将。

## 二、核心概念拆解

### 2.1 Lead Agent（主智能体）

主智能体是整个系统的"大脑"。你给它一个模糊指令，比如"帮我做一份关于量子计算的市场分析报告"，它会：

1. 理解意图
2. 拆解任务
3. 决定要不要派出子智能体
4. 协调各子智能体的产出
5. 生成最终报告

### 2.2 Sub-Agents（子智能体）

子智能体是主智能体派出去干活的"员工"。每个子智能体都有：

- **独立的上下文**：看不到主智能体或其他子智能体的对话历史，专注自己的任务
- **独立的工具集**：可以配置不同的搜索权限、文件访问范围
- **明确的终止条件**：知道什么情况下该交差

多个子智能体可以**并行运行**，大幅缩短整体耗时。

### 2.3 Skills（技能模块）

技能是 DeerFlow 能干"几乎任何事情"的关键。每个技能就是一个结构化的 Markdown 文件（`SKILL.md`），定义了一个工作流、最佳实践和相关资源。

内置技能包括：

| 技能名称 | 用途 |
|---|---|
| `research` | 深度网络研究 |
| `report-generation` | 自动生成报告 |
| `slide-creation` | 制作 PPT 幻灯片 |
| `web-page` | 生成网页 |
| `image-generation` | 图像生成 |
| `video-generation` | 视频生成 |
| `claude-to-deerflow` | 从 Claude Code 直接调用 DeerFlow |

关键设计：**技能按需加载**。不是把所有技能一次性塞进上下文窗口，而是任务需要时才加载对应的 `SKILL.md`。这让它能在 token 敏感的模型上也跑得不错。

手动激活某个技能的方式也很直观——在消息前加斜杠命令：

```
/data-analysis analyze uploads/foo.csv
```

这会把 `data-analysis` 技能的 `SKILL.md` 作为当前轮的隐藏上下文加载。

### 2.4 Sandbox & File System（沙箱与文件系统）

DeerFlow 不只是"嘴上说说"，它真的有一台"电脑"。每个任务都有独立的执行环境：

```
/mnt/user-data/
├── uploads/          ← 用户上传的文件
├── workspace/        ← 智能体的工作目录
└── outputs/          ← 最终交付物
```

有两种沙箱模式：

- **AioSandboxProvider**：在隔离容器中执行 shell 命令，安全隔离
- **LocalSandboxProvider**：文件操作映射到宿主机目录，但默认禁用 shell 执行

### 2.5 Long-Term Memory（长期记忆）

大多数智能体对话结束就忘了。DeerFlow 不一样——它会记住你的偏好、写作风格、技术栈、常用工作流。用得越多，它越了解你。记忆存在本地，完全由你控制。

### 2.6 Context Engineering（上下文工程）

DeerFlow 在上下文管理上做了很多精细工作：

- **子智能体上下文隔离**：每个子智能体只看自己的上下文
- **摘要压缩**：已完成的任务会被摘要，中间结果写入文件系统，不相关的信息被压缩
- **工具调用恢复**：当模型中断工具调用循环时，DeerFlow 会自动清理元数据并注入占位符结果，避免报错

## 三、快速上手

### 3.1 安装（一行命令）

```bash
git clone https://github.com/bytedance/deer-flow.git
cd deer-flow
make setup
```

`make setup` 会启动一个交互式向导，引导你选择 LLM 提供商、配置 API Key、设置沙箱模式等，大约 2 分钟搞定。

### 3.2 启动

```bash
# Docker 方式（推荐）
make docker-init    # 首次拉取沙箱镜像
make docker-start   # 启动服务

# 本地开发方式
make check          # 检查前置依赖
make install        # 安装依赖
make dev            # 启动开发服务
```

启动后访问 `http://localhost:2026` 即可使用。

### 3.3 配置模型

DeerFlow 支持任何兼容 OpenAI API 的大模型。配置文件是 `config.yaml`，示例：

```yaml
models:
  - name: gpt-4o
    display_name: GPT-4o
    use: langchain_openai:ChatOpenAI
    model: gpt-4o
    api_key: $OPENAI_API_KEY

  - name: openrouter-gemini-2.5-flash
    display_name: Gemini 2.5 Flash (OpenRouter)
    use: langchain_openai:ChatOpenAI
    model: google/gemini-2.5-flash-preview
    api_key: $OPENROUTER_API_KEY
    base_url: https://openrouter.ai/api/v1

  - name: qwen3-32b-vllm
    display_name: Qwen3 32B (vLLM)
    use: deerflow.models.vllm_provider:VllmChatModel
    model: Qwen/Qwen3-32B
    api_key: $VLLM_API_KEY
    base_url: http://localhost:8000/v1
    supports_thinking: true
```

推荐使用的模型具备这些能力：长上下文窗口（10 万 token 以上）、推理能力、多模态输入、强大的工具调用能力。

## 四、代码示例

### 示例 1：作为 Python 库嵌入使用

DeerFlow 可以不启动 HTTP 服务，直接作为 Python 库导入：

```python
from deerflow.client import DeerFlowClient

client = DeerFlowClient()

# 普通对话
response = client.chat("帮我分析这份论文", thread_id="my-thread")

# 流式响应（LangGraph SSE 协议）
for event in client.stream("分析一下这个数据集"):
    if event.type == "messages-tuple" and event.data.get("type") == "ai":
        print(event.data["content"])

# 管理技能、模型、文件上传
models = client.list_models()
skills = client.list_skills()
client.update_skill("web-search", enabled=True)
client.upload_files("thread-1", ["./report.pdf"])
```

这让 DeerFlow 可以嵌入到你现有的 Python 项目中，不需要额外部署服务。

### 示例 2：通过 config.yaml 配置多智能体工作流

```yaml
# config.yaml 中的模型与技能配置示例

models:
  # 使用 Codex CLI 作为推理模型
  - name: gpt-5.4
    display_name: GPT-5.4 (Codex CLI)
    use: deerflow.models.openai_codex_provider:CodexChatModel
    model: gpt-5.4
    supports_thinking: true
    supports_reasoning_effort: true

  # 使用 Claude Code OAuth
  - name: claude-sonnet-4.6
    display_name: Claude Sonnet 4.6 (Claude Code OAuth)
    use: deerflow.models.claude_provider:ClaudeChatModel
    model: claude-sonnet-4-6
    max_tokens: 4096
    supports_thinking: true

# 技能加载路径
skills:
  public: /mnt/skills/public    # 内置技能
  custom: /mnt/skills/custom    # 自定义技能

# IM 渠道集成（可选）
channels:
  telegram:
    enabled: true
    bot_token: $TELEGRAM_BOT_TOKEN
  slack:
    enabled: true
    bot_token: $SLACK_BOT_TOKEN
    app_token: $SLACK_APP_TOKEN
```

配置好之后，你就可以通过 Telegram、Slack、飞书、钉钉等渠道直接与 DeerFlow 交互，发送 `/new` 开启新对话，发送 `/models` 查看可用模型。

## 五、DeerFlow 为什么重要？

DeerFlow 最初是一个"深度研究"框架，但社区把它用到了远超研究的地方——构建数据管道、生成演示文稿、搭建仪表盘、自动化内容工作流。这些甚至超出了开发者的预期。

这说明了一件事：DeerFlow 本质上不是一个研究工具，而是一个**智能体基础设施**——一个让智能体真正能把事做成的运行时。

它的价值在于：

1. **开箱即用**：不再需要自己拼凑各种组件，文件系统、记忆、技能、沙箱全部内置
2. **极度可扩展**：可以只用内置功能，也可以完全替换掉重做
3. **模型无关**：不绑定任何特定大模型，支持 OpenAI、Anthropic、OpenRouter、vLLM 等
4. **生产就绪**：Docker 部署、IM 集成、LangSmith/Langfuse 可观测性，一应俱全

## 六、安全提醒

DeerFlow 默认设计为在**本地可信环境**中运行（仅通过 127.0.0.1 回环接口访问）。如果部署到不可信的网络环境中，需要注意：

- 使用 IP 白名单限制访问
- 配置反向代理做身份验证
- 将智能体放在专用 VLAN 中隔离
- 保持 DeerFlow 更新到最新版本

## 七、学习小结

| 概念 | 类比 |
|---|---|
| Lead Agent | 项目经理 |
| Sub-Agents | 分工合作的员工 |
| Skills | 员工的专长手册 |
| Sandbox | 独立的办公隔间 |
| Memory | 员工的工作档案 |
| Context Engineering | 信息筛选与整理 |

DeerFlow 把"让 AI 干活"这件事从"你问一句它答一句"升级到了"你说目标，它自己拆任务、找人干、交成品"。对于想深入理解多智能体系统的学习者来说，这是一个极佳的开源参考实现。

## 参考资料

- GitHub 仓库：https://github.com/bytedance/deer-flow
- 官方网站：https://deerflow.tech
- 架构文档：https://github.com/bytedance/deer-flow/blob/main/backend/CLAUDE.md
- 配置指南：https://github.com/bytedance/deer-flow/blob/main/backend/docs/CONFIGURATION.md
- 贡献指南：https://github.com/bytedance/deer-flow/blob/main/CONTRIBUTING.md
