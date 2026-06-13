---
title: jcode - 自动开发型 Coding Agent Harness 零基础学习笔记
来源: https://github.com/1jehuang/jcode
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# jcode - 自动开发型 Coding Agent Harness 零基础学习笔记

## 什么是 jcode？

先想一个问题：你平时写代码时，是不是先想做什么，再动手写，写完测试，有 bug 再改？jcode 做的事情和你差不多，但它是一个 AI agent 框架，叫做 **Coding Agent Harness（编程 Agent 的驾驶舱）**。

你可以把 jcode 理解为给 AI agent 配的"工作台"。就像程序员用 VS Code 写代码一样，jcode 是 AI agent 写代码的工作环境。

但它和普通 AI 编程工具不一样的地方在于：**jcode 能让 agent 自己改自己的源代码**。你告诉它"进入自开发模式"，它就会开始修改 jcode 自己的 Rust 源码，编译、测试、重新加载，全程全自动。这有点像让一个机器人不仅帮你做饭，还能自己改良菜谱。

### 一句话总结

jcode 是一个 Rust 写的命令行工具，让 AI agent 在终端里写代码、管理多会话、协作编程，并且能够自动改进自身。

---

## 核心概念

### 1. Harness（驾驶舱 / 操控台）

"Harness" 的本意是"马具"。在 jcode 里，它指的就是整个 agent 运行环境——包括对话管理、工具调用、记忆系统等。你可以把它想象成马车的方向盘和仪表盘，agent 是拉车的马。

### 2. Memory（记忆系统）

jcode 内置了一套类人记忆系统。它会把每次对话的内容转换成数学向量（叫"语义向量"），存在一个叫"记忆图"的地方。当下一次对话时，系统会自动回忆之前相关的信息。

打个比方：你之前让 agent 帮你设置了一个项目配置文件，过两天你忘了配置项的名字，问它"之前那个端口号是多少？"，jcode 的记忆系统会自动帮你找到，不需要你重新说明。

### 3. Swarm（蜂群 / 多 agent 协作）

这是 jcode 最酷的功能之一。你可以在同一个项目里同时启动多个 agent，它们会自动协调工作：

- agent A 修改了一个文件
- agent B 正好读了这个文件，系统会通知它
- agent B 检查有没有冲突，有就调整

这就像一个小团队：你告诉一个工程师改了 A 功能，另一个工程师在改 B 功能，系统会自动提醒他们不要互相捣乱。

### 4. Skills（技能系统）

不是所有技能都会一开始就加载，jcode 会根据你说的话，自动判断该用什么技能。比如你说"审查一下代码"，它会自动加载代码审查技能。你也可以手动用斜杠命令激活技能。

### 5. Provider（模型提供商）

jcode 支持连接多种 AI 模型提供商，包括 Claude、GPT、Gemini、Ollama（本地跑）等等。你可以用同一个 jcode 连接不同的"大脑"。

---

## 安装和启动

### 一键安装

```bash
# macOS 和 Linux
curl -fsSL https://raw.githubusercontent.com/1jehuang/jcode/master/scripts/install.sh | bash

# macOS 用 Homebrew（如果有的话）
brew tap 1jehuang/jcode
brew install jcode
```

### 启动 jcode

安装完成后，打开一个新终端，输入：

```bash
jcode
```

就会进入 jcode 的交互式界面。

### 快速验证

```bash
# 非交互式运行一条命令
jcode run "say hello"

# 用语音输入
jcode dictate
```

---

## 关键功能详解

### 性能优势

jcode 是用 Rust 写的，最大的特点就是快：

- **内存占用低**：单个会话只占约 28 MB（本地嵌入关闭时），比 Claude Code（386 MB）小 13 倍
- **启动速度极快**：首帧渲染仅需 14 毫秒，比 Claude Code 快 245 倍

为什么快？因为 Rust 是一门系统级语言，编译器会帮你把多余的开销在编译时就处理掉。类比：Python 像是自动挡汽车，方便但有一定损耗；Rust 像是手动挡赛车，上手复杂但性能极致。

### 会话管理

jcode 支持多种会话模式：

```bash
# 启动交互式 TUI 界面
jcode

# 恢复一个之前命名的会话
jcode --resume fox

# 作为持久后台服务启动，然后从其他终端连接
jcode serve
jcode connect
```

这有点像 SSH 连接：你先让 jcode 在后台跑着，然后可以随时从新终端连上去继续工作。

### 支持 OAuth 登录的模型提供商

```bash
# 登录 Claude
jcode login --provider claude

# 登录 OpenAI
jcode login --provider openai

# 登录 Gemini
jcode login --provider gemini

# 登录 GitHub Copilot
jcode login --provider copilot

# 登录本地 Ollama
jcode login --provider ollama

# 登录 LM Studio
jcode login --provider lmstudio
```

jcode 支持 30+ 种提供商，包括各种国内外的模型服务。

### 浏览器自动化

jcode 内置了浏览器控制工具，可以自动控制 Firefox：

```bash
# 检查浏览器自动化状态
jcode browser status

# 设置浏览器自动化
jcode browser setup
```

设置完成后，agent 就能用浏览器工具自动打开网页、点击按钮、填表单了。

---

## 代码示例

### 示例 1：基本的交互编程

启动 jcode 后，你可以直接用自然语言描述需求：

```
帮我创建一个 Python 函数，接收一个数字列表，返回排序后的结果，
要求用快速排序算法实现。
```

jcode 的 agent 会：
1. 理解你的需求
2. 在当前项目中创建或修改代码文件
3. 写代码并保存
4. 运行测试验证

### 示例 2：进入自开发模式

这是 jcode 最独特的功能——让 agent 改 jcode 自己的代码：

```
进入自开发模式，帮我优化内存占用
```

此时 agent 会：
1. 读取 jcode 的 Rust 源码
2. 找到内存占用高的地方
3. 修改源代码
4. 编译新的 jcode 二进制文件
5. 自动重新加载，在已有会话中生效

注意：官方建议使用前沿模型（如 GPT 5.5）来做自开发，因为 jcode 的源码库不复杂，弱模型可能做出 subtle（微妙）的破坏性修改。

### 示例 3：多 agent 蜂群协作

在同一个项目目录下：

```bash
# 第一个终端：agent A 负责修复 bug
jcode

# 第二个终端：agent B 负责添加新功能
jcode
```

两个 agent 同时在同一个仓库里工作，jcode 的服务器会自动协调：
- 如果 agent A 修改了 agent B 正在读的文件，系统会通知 agent B
- agent B 可以检查差异，确认是否有冲突
- 每个 agent 还可以互相发消息（DM 或广播）

---

## 配置结构

jcode 的配置文件在 `~/.jcode/config.toml`，大致结构如下：

```toml
[provider]
default_provider = "claude"
default_model = "claude-sonnet-4-20250514"

[providers.my-api]
type = "openai-compatible"
base_url = "https://api.example.com/v1"
default_model = "my-model"
```

MCP 服务器配置在 `~/.jcode/mcp.json`，支持全局和项目级别的配置。

---

## 与其他工具对比

| 特性 | jcode | Claude Code | OpenCode | Codex CLI |
|------|-------|-------------|----------|-----------|
| 语言 | Rust | TypeScript | TypeScript | Python |
| 单会话内存 | ~28 MB | ~386 MB | ~371 MB | ~140 MB |
| 启动速度 | ~14ms | ~3437ms | ~1036ms | ~883ms |
| 自开发模式 | 支持 | 不支持 | 不支持 | 不支持 |
| 多 agent 协作 | 支持 | 不支持 | 不支持 | 不支持 |
| 会话恢复 | 支持 | 有限 | 有限 | 有限 |
| 提供商数量 | 30+ | 主要 Anthropic | 主要 Anthropic | 主要 OpenAI |

---

## 学习总结

jcode 的核心价值可以用三个词概括：**快、聪明、可进化**：

1. **快**：Rust 写的工具，性能远超同类 TypeScript/Python 工具
2. **聪明**：内置记忆系统、技能系统、多 agent 蜂群协作
3. **可进化**：agent 可以自动改进 jcode 自身的代码

对于零基础的初学者来说，你不需要理解 Rust 或向量嵌入的数学原理。你只需要记住：
- `jcode` 打开工具
- `jcode run "你的需求"` 快速执行
- 对 agent 说"进入自开发模式" 让它改进自身
- 多个 `jcode` 可以同时协作一个大项目

这就是 jcode 的基本面貌。它不是另一个聊天机器人，而是一个专门为 AI 写代码设计的完整工作环境。

---

## 延伸阅读

- [Memory Architecture](https://github.com/1jehuang/jcode/blob/master/docs/MEMORY_ARCHITECTURE.md) — 记忆系统详解
- [Swarm Architecture](https://github.com/1jehuang/jcode/blob/master/docs/SWARM_ARCHITECTURE.md) — 蜂群协作详解
- [Server Architecture](https://github.com/1jehuang/jcode/blob/master/docs/SERVER_ARCHITECTURE.md) — 服务端架构
- [Ambient Mode](https://github.com/1jehuang/jcode/blob/master/docs/AMBIENT_MODE.md) — 环境模式
- [Safety System](https://github.com/1jehuang/jcode/blob/master/docs/SAFETY_SYSTEM.md) — 安全系统
- [TERMINAL_CAPABILITIES](https://github.com/1jehuang/jcode/blob/master/terminal-capabilities.md) — 终端能力
- [OAUTH](https://github.com/1jehuang/jcode/blob/master/OAUTH.md) — OAuth 登录详解
