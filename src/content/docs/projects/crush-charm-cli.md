---
title: Crush — 终端里的 AI 编程搭档
来源: https://github.com/charmbracelet/crush
日期: 2026-06-13
分类: Agent
子分类: 智能体与 LLM
provenance: pipeline-v3
---

# Crush — 终端里的 AI 编程搭档

## 这是什么

Crush 是 [Charm](https://charm.land) 团队开发的一款 **终端 AI 编程助手**。

用日常的话说：它就像在你终端里坐了一个 AI 程序员搭档——你能看到它在读什么文件、改什么代码、跑什么命令，你随时可以点头或叫停。

Charm 团队之前做过很多有名的终端工具，比如 `bubbletea`（TUI 框架）、`lipgloss`（终端样式库）、`hugo`（虽不是他们做的但同生态）。Crush 是他们把"漂亮终端体验"和"AI 编程能力"结合的作品。

- Stars: 25k+
- 语言: Go (98.4%)
- 最新 Tag: v0.76.0 (2026-06-05)

## 核心概念

### 1. 会话（Session）

Crush 的工作单位是 **会话**。每个项目可以有多个会话，每个会话保持独立的对话上下文。

类比：就像一个项目有多个"工作线程"——你在一个会话里让 Crush 修复 bug，在另一个会话里让它加新功能，互不干扰。

### 2. Provider（模型提供商）

Crush 不绑定某个特定 AI 模型。它支持：

- OpenAI（GPT-4、o 系列等）
- Anthropic（Claude 系列）
- Google Gemini
- Ollama（本地模型）
- 以及任何 OpenAI/Anthropic 兼容的 API

这意味着你可以"中途换模型"——比如先用 Claude 做架构设计，再切到 GPT-4 写代码。

### 3. LSP 增强

Crush 能接入你项目的 **LSP**（Language Server Protocol），就像 VS Code 那样。这让 AI 能理解你的代码结构——知道函数定义在哪、依赖关系如何。

类比：普通 AI 编程助手像是"只看文件内容的读者"，加了 LSP 的 Crush 像是"懂代码结构的程序员"。

### 4. MCP（Model Context Protocol）

MCP 是 Anthropic 提出的一个协议，让 AI 能安全地调用外部工具。Crush 支持三种传输方式：

- **stdio** — 本地命令行工具（比如文件系统操作）
- **HTTP** — 远程 HTTP 服务（比如 GitHub API）
- **SSE** — Server-Sent Events（实时数据流）

类比：MCP 就像给 AI 配了一套"工具箱"——它能读写文件、查 GitHub issue、调 API，但每项操作都需要你批准。

### 5. Skills（技能包）

Crush 支持 [Agent Skills](https://agentskills.io) 标准——用 `SKILL.md` 文件定义可复用的能力模块。

类比：就像手机的"快捷指令"或 Chrome 的"扩展"——你可以装社区技能，也可以自己写。

### 6. 权限控制

默认情况下，Crush 每次要执行命令或修改文件前都会 **问你**。你可以：

- 逐条批准（默认安全模式）
- 白名单某些工具（比如只允许 `view`、`ls`、`grep`）
- 用 `--yolo` 跳过所有确认（不推荐新手使用）

## 安装

```bash
# Homebrew (macOS / Linux)
brew install charmbracelet/tap/crush

# 或者用 Go 直接装
go install github.com/charmbracelet/crush@latest

# NPM
npm install -g @charmland/crush
```

安装完后，直接跑 `crush` 就行——它会提示你输入 API Key。

## 快速上手

### 第一步：设置 API Key

```bash
crush
```

首次运行时，Crush 会进入交互式配置流程，让你选择模型提供商并输入 API Key。

支持的 Key 环境变量：

| 环境变量 | 提供商 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI (GPT) |
| `GEMINI_API_KEY` | Google Gemini |
| `OPENROUTER_API_KEY` | OpenRouter (多模型) |
| `HF_TOKEN` | Hugging Face |
| `GROQ_API_KEY` | Groq |

你也可以先不设，Crush 会交互式让你输入。

### 第二步：开始对话

进入 Crush 的 TUI（终端用户界面）后，直接在底部输入框打字就行：

```
给这个项目加一个健康检查端点
```

Crush 会：

1. 先读你的项目文件，理解代码结构
2. 可能问你几个澄清问题
3. 然后开始修改代码
4. 每步操作都显示给你看，等你确认

### 第三步：切换模型

在 TUI 的会话管理器里（通常是侧边栏），可以随时切换不同的模型提供商，上下文会保留。

## 配置

Crush 的配置是一个 JSON 文件，优先级从高到低：

1. `.crush.json` — 项目级配置（推荐）
2. `crush.json` — 项目级（备用名）
3. `~/.config/crush/crush.json` — 全局配置

### 示例 1：配置 OpenAI 提供商

`.crush.json`：

```json
{
  "$schema": "https://charm.land/crush.json",
  "providers": {
    "openai": {
      "id": "openai",
      "name": "OpenAI",
      "base_url": "https://api.openai.com/v1",
      "type": "openai",
      "api_key": "$OPENAI_API_KEY",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o"
        },
        {
          "id": "gpt-4o-mini",
          "name": "GPT-4o Mini"
        }
      ]
    }
  }
}
```

注意 `"$OPENAI_API_KEY"` — Crush 会自动从环境变量取值，不需要把密钥写死在配置文件里。

### 示例 2：配置 LSP

`.crush.json`：

```json
{
  "$schema": "https://charm.land/crush.json",
  "lsp": {
    "go": {
      "command": "gopls"
    },
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"]
    },
    "python": {
      "command": "pyright-langserver",
      "args": ["--stdio"]
    }
  }
}
```

配置后，Crush 在分析 Go、TypeScript、Python 项目时会调用对应的 LSP，获得代码定义、引用、类型推断等上下文。

### 示例 3：配置 MCP 服务器

`.crush.json`：

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"],
      "timeout": 120
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "timeout": 120,
      "headers": {
        "Authorization": "Bearer $GH_PAT"
      }
    }
  }
}
```

这里配了两个 MCP 工具：
- **filesystem** — 让 AI 能读写文件系统
- **github** — 让 AI 能操作 GitHub（创建 issue、PR 等）

### 示例 4：权限控制

`.crush.json`：

```json
{
  "$schema": "https://charm.land/crush.json",
  "permissions": {
    "allowed_tools": [
      "view",
      "ls",
      "grep",
      "edit"
    ]
  },
  "options": {
    "disabled_tools": ["bash"],
    "attribution": {
      "trailer_style": "co-authored-by",
      "generated_with": true
    }
  }
}
```

这段配置的意思是：
- 允许 Crush 使用 `view`、`ls`、`grep`、`edit` 工具（不需逐个确认）
- 禁止使用 `bash` 工具（完全不让它跑命令）
- Git 提交时加上 `Co-Authored-By` Attribution

## 进阶用法

### 初始化项目

Crush 能分析整个代码库并自动生成 `AGENTS.md`，记录项目的构建命令、代码规范、文件结构——以后 Crush 就不用每次都重新"认识"你的项目了。

### 全局上下文文件

- `~/.config/crush/CRUSH.md` — Crush 专属规则（比如"永远用 TypeScript 5.x"）
- `~/.config/AGENTS.md` — 跨工具的通用规则

### 查看日志

```bash
# 最近 1000 行
crush logs

# 实时查看
crush logs --follow

# 调试模式启动
crush --debug
```

### 忽略文件

Crush 默认遵守 `.gitignore`。额外可以建 `.crushignore`：

```
# .crushignore
node_modules/
*.log
.env
```

### 更新模型列表

```bash
# 从 Catwalk 在线更新
crush update-providers

# 从本地文件更新
crush update-providers /path/to/providers.json

# 恢复到内置版本
crush update-providers embedded
```

## Crush 的工作流程（一图流）

```
你输入需求
    │
    ▼
Crush 读项目 + LSP 上下文
    │
    ▼
Crush 规划方案（可能问你问题）
    │
    ▼
Crush 执行：读文件 → 改代码 → 跑命令
    │             │           │
    │             ▼           ▼
    │        你确认      你确认
    │             │           │
    ▼             ▼           ▼
提交到 Git（带 Attribution）
```

## 和普通 AI 编程助手的区别

| 特性 | 普通 ChatGPT/Copilot Chat | Crush |
|---|---|---|
| 运行位置 | 网页 / IDE 插件 | 你的终端 |
| 文件系统访问 | 有限 | 全权限（需你批准） |
| 模型切换 | 通常锁定一个 | 会话中随时换 |
| LSP 集成 | 取决于 IDE | 原生支持 |
| MCP 扩展 | 不支持 | 完整支持 |
| 权限控制 | 无 | 逐条确认 / 白名单 / yolo |
| 会话管理 | 一个对话一个上下文 | 多会话并行 |
| Skills | 无 | 标准化技能包 |

## 适合谁

- 想在终端里直接让 AI 帮写代码、改 bug 的开发者
- 已经熟悉终端工作流，不想切到网页或 IDE 插件的人
- 想灵活切换 AI 模型（今天用 Claude，明天用 GPT）的人
- 想给 AI 编程助手加自定义工具（MCP）的进阶用户

## 不适合谁

- 完全没碰过终端的新手（Crush 本身是个 CLI 工具）
- 希望 AI 全自动跑、不需要任何确认的人（虽然可以开 `--yolo`，但不安全）

## 下一步

想继续深入了解的话，推荐：

1. 直接安装后跑 `crush`，体验一遍 TUI 界面
2. 看 [Crush 的 docs](https://github.com/charmbracelet/crush) 了解更多配置选项
3. 试试接入一个 MCP 服务器，看看 AI 能调用什么外部工具
4. 写一个自定义 Skill，看看怎么扩展 Crush 的能力
