---
title: "OpenClaw 学习笔记 — 你的私人 AI 助手"
来源: "https://github.com/openclaw/openclaw"
日期: "2026-06-13"
分类: 机器学习
子分类: 数据科学与 AI
provenance: "pipeline-v3"
---

# OpenClaw 学习笔记 — 你的私人 AI 助手

## 一、日常类比：为什么需要 OpenClaw？

想象一下：你有无数个手机 App — WhatsApp、Telegram、Slack、Discord、微信。你希望有一个 AI 助手，能同时出现在所有这些 App 里，你无论在哪发消息，它都能回应你。

传统的 AI 工具（比如 ChatGPT 网页版）每次都要打开浏览器、输入网址、敲对话，像一个需要你"专门去找"的外包员工。

OpenClaw 的做法是把 AI 助手变成你手机里"常驻"的同事 — 它跑在你自己的电脑上，像后台程序一样一直在线。你在哪个聊天软件里 @它，它就在哪里回应你。不需要打开任何网页。

类比：如果说 ChatGPT 网页版是"去柜台办事"，那 OpenClaw 就是"派了个助理住在你家里"。

## 二、核心概念

### 2.1 Gateway（网关）

Gateway 是 OpenClaw 的"大脑"，是一个运行在你本机上的后台服务（Daemon）。

- 它保持 24 小时在线
- 它连接所有你配置的聊天平台（WhatsApp、Telegram 等）
- 它调用 AI 模型（OpenAI、Anthropic 等）来理解你的消息并回复

类比：Gateway 就像一个翻译兼调度员，你发消息给它，它找 AI 模型翻译理解，再把回复送回去。

### 2.2 Agent（智能体）

Agent 是真正"思考"的部分。Gateway 接收到消息后，会交给 Agent，Agent 调用大语言模型（LLM）来生成回复。

你可以配置不同的 Agent 来处理不同场景的消息。

### 2.3 Channel（通道）

Channel 是你和 AI 助手对话的"渠道"。OpenClaw 支持 20 多个渠道：

- 即时通讯：WhatsApp、Telegram、Slack、Discord、iMessage、微信、QQ
- 其他：IRC、Signal、Microsoft Teams、Matrix、Feishu（飞书）等
- 平台：macOS、iOS、Android、Windows

### 2.4 Skill（技能）

Skill 是给 AI 助手增加的"专项能力"。

- 内置技能（Bundled）：开箱即用
- 工作区技能（Workspace Skills）：放在 `~/.openclaw/workspace/skills/` 下
- 可自定义 SKILL.md 文件来描述技能的行为

### 2.5 Session（会话）

Session 是一次完整的对话上下文。每个对话拥有独立的会话，AI 能记住之前的聊天内容。

### 2.6 Workspace（工作区）

工作区（`~/.openclaw/workspace`）是 AI 助手的"家"。它存放配置文件、技能和提示词文件（AGENTS.md、SOUL.md、TOOLS.md），定义了助手的行为模式。

## 三、安装与启动

### 3.1 环境要求

- Node.js 22.19+（推荐 24）
- 支持 macOS、Linux、Windows

### 3.2 一行安装

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

`onboard` 是一个交互式向导，会一步步引导你完成：

1. 配置 AI 模型（填 API Key）
2. 连接聊天平台（WhatsApp、Telegram 等）
3. 设置技能
4. 安装守护进程（Daemon），让 OpenClaw 开机自启

安装完成后，守护进程会自动在后台运行，Gateway 就上线了。

### 3.3 检查状态

```bash
openclaw gateway status
```

### 3.4 前台调试模式

```bash
openclaw gateway --port 18789 --verbose
```

## 四、配置详解

### 4.1 基础配置

OpenClaw 的配置文件在 `~/.openclaw/openclaw.json`。最简配置只需要指定 AI 模型：

```json
{
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

`model` 字段格式是 `提供商/模型ID`。支持的提供商包括：

- `anthropic/` — Claude 系列
- `openai/` — GPT-4o、GPT-4.1 等
- `google/` — Gemini 系列
- `openrouter/` — 通过 OpenRouter 聚合多个提供商

### 4.2 网关安全配置

OpenClaw 连接的是真实的聊天平台，安全很重要。默认情况下，陌生人发给 AI 的消息不会被处理，需要先"配对"。

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    auth: {
      mode: "token",
      token: "你的随机密钥"
    }
  },
  session: {
    dmScope: "per-channel-peer"
  },
  tools: {
    profile: "messaging",
    deny: [
      "group:automation",
      "group:runtime",
      "group:fs",
      "sessions_spawn",
      "sessions_send"
    ],
    fs: { workspaceOnly: true },
    exec: {
      security: "deny",
      ask: "always"
    }
  },
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      groups: {
        "*": { requireMention: true }
      }
    }
  }
}
```

上面的配置做了以下安全加固：

1. Gateway 只监听本地（`loopback`），不暴露到网络
2. 使用 Token 认证
3. 会话按通道/用户隔离
4. 关闭了危险的工具组（自动化、运行时、文件系统）
5. WhatsApp 的 DM 策略设为 "pairing"（配对模式）

### 4.3 技能管理配置

```json5
{
  skills: {
    allowBundled: ["gemini", "peekaboo"],
    load: {
      extraDirs: ["~/Projects/agent-scripts/skills"]
    },
    install: {
      preferBrew: true,
      nodeManager: "npm"
    },
    entries: {
      "image-lab": {
        apiKey: {
          source: "env",
          provider: "default",
          id: "GEMINI_API_KEY"
        }
      },
      peekaboo: {
        enabled: true
      },
      sag: {
        enabled: false
      }
    }
  }
}
```

## 五、常用命令行操作

### 5.1 发消息

```bash
# 通过 WhatsApp 发送测试消息
openclaw message send --target +1234567890 --message "Hello from OpenClaw"

# 直接和 AI 对话
openclaw agent --message "Ship checklist" --thinking high
```

### 5.2 MCP 工具管理

MCP（Model Context Protocol）是 OpenClaw 连接外部工具的协议。

```bash
# 列出已配置的 MCP 服务器
openclaw mcp list

# 查看某个 MCP 服务器的详情
openclaw mcp show context7 --json

# 添加一个新的 MCP 服务器
openclaw mcp add memory --command npx --arg -y --arg @modelcontextprotocol/server-memory

# 诊断 MCP 连接状态
openclaw mcp doctor --probe
```

### 5.3 会话管理

```bash
# 列出所有会话
openclaw tasks

# 查看运行中的任务
openclaw tasks list --status running

# 取消某个任务
openclaw tasks cancel <lookup>
```

### 5.4 聊天中的快捷命令

在任意聊天窗口中，AI 助手支持斜杠命令：

| 命令 | 作用 |
|------|------|
| `/status` | 查看助手状态 |
| `/new` | 开始新会话 |
| `/reset` | 重置当前会话 |
| `/compact` | 压缩上下文（节省 Token） |
| `/think high` | 开启深度思考模式 |
| `/verbose on` | 打开详细输出 |
| `/restart` | 重启助手 |

### 5.5 诊断与维护

```bash
# 运行健康检查
openclaw doctor

# 查看配置文件路径
openclaw config file

# 验证配置
openclaw config validate
```

## 六、从源码开发

如果你想在本地修改源码并调试：

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# 安装依赖（必须用 pnpm）
pnpm install

# 首次设置
pnpm openclaw setup

# 开发循环模式（修改后自动重载）
pnpm gateway:watch

# 构建
pnpm build
pnpm ui:build
```

注意：从源码构建必须使用 `pnpm`，不支持 `npm install`。

## 七、安全模型

这是初学者最需要理解的部分。

### 7.1 默认行为

- 当你单独使用 OpenClaw（只有你和 AI）时，工具默认运行在你的本机环境上
- 这意味着 AI 可以直接执行命令、读写文件 — 因为是你自己在用，所以风险可控

### 7.2 沙箱隔离

如果你在多人环境中使用，可以为非你自己的会话启用沙箱：

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main"
      }
    }
  }
}
```

这样，非你自己的会话会被限制在一个隔离环境中运行，不能访问你的文件系统、浏览器等敏感工具。

### 7.3 DM 配对机制

对于 Telegram、WhatsApp、Signal、Discord 等通道，默认启用"配对"模式：

1. 陌生人发给 AI 的消息不会被处理
2. 陌生人会收到一个配对码
3. 你输入 `openclaw pairing approve <通道> <码>` 后，该用户才会被加入白名单

这个机制防止了未经授权的访问。

## 八、多智能体路由

OpenClaw 支持"多智能体路由"（Multi-agent routing），这意味着：

- 不同聊天通道可以路由到不同的 Agent
- 不同群聊/私聊可以绑定不同的 Agent 配置
- 每个 Agent 有独立的工作区和会话

类比：就像公司里有不同的部门，不同的客户打不同的热线电话，各自由专门的客服人员处理。

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/.openclaw/workspace"
    }
  }
}
```

## 九、学习建议

### 第一步：安装并跑通

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

### 第二步：连一个聊天平台

比如 Telegram：
1. 在 Telegram 创建 Bot（找 @BotFather）
2. 拿到 Bot Token
3. 在 onboard 向导中填入

### 第三步：理解配置

打开 `~/.openclaw/openclaw.json`，看懂每一行的含义。

### 第四步：探索技能

```bash
# 查看可用技能
openclaw mcp list

# 安装额外技能
openclaw skills install <技能名>
```

### 第五步：阅读安全文档

在将 OpenClaw 暴露到公网之前，务必阅读 Security 和 Exposure Runbook 文档。

## 十、关键文件一览

| 文件/目录 | 作用 |
|-----------|------|
| `~/.openclaw/openclaw.json` | 主配置文件 |
| `~/.openclaw/workspace/` | AI 助手的工作区 |
| `~/.openclaw/workspace/AGENTS.md` | 注入给 AI 的行为提示词 |
| `~/.openclaw/workspace/SOUL.md` | 定义 AI 的人格和语气 |
| `~/.openclaw/workspace/TOOLS.md` | 定义可用工具列表 |
| `~/.openclaw/workspace/skills/` | 自定义技能目录 |
| `~/.openclaw/logs/` | 运行日志 |

## 十一、总结

OpenClaw 的核心理念很清晰：

- **本地优先**：你的 AI 助手跑在你自己的机器上，数据不离开
- **多通道统一**：一个 Gateway 连接所有聊天平台
- **可编程**：通过配置、技能和 MCP 协议扩展能力
- **安全可控**：从 DM 配对到沙箱隔离，有多层安全防护
- **开源**：MIT 许可证，社区活跃（378k+ Star）

对学习者来说，OpenClaw 是一个很好的"AI 助手框架"入门项目 — 它的配置直观，命令行工具丰富，而且文档齐全。通过配置它，你可以理解 AI 应用的基本架构：Gateway（路由层）→ Agent（推理层）→ Channel（交互层）。
