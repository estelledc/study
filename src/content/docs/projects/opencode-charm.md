---
title: OpenCode (Charm) — 零基础学习笔记
来源: https://github.com/sst/opencode
日期: 2026-06-13
分类: Agent
子分类: 智能体与 LLM
provenance: pipeline-v3
---

# OpenCode — 你的终端编程搭档

## 一、它是什么？（类比开始）

想象你在写代码，身边坐着一位资深同事。你随时开口问他：

> "这段代码是干什么的？"
> "帮我加一个登录功能。"
> "这个 bug 怎么修？"

他会直接在你的屏幕上改代码，改完让你确认。改完了你不满意，还可以说"撤回刚才的修改"。

**OpenCode 就是这位同事**——只不过他是跑在你终端里的 AI 编程代理（coding agent）。

它由 [Anomaly](https://anoma.ly) 团队开发，174k+ GitHub Stars，开源协议 MIT。可以用在终端（TUI）、桌面应用（Beta）、VS Code 插件等。

## 二、核心概念

### 2.1 安装与启动

最简单的安装方式：

```bash
# 一行搞定
curl -fsSL https://opencode.ai/install | bash

# 或者用 npm
npm i -g opencode-ai

# 或者用 Homebrew（macOS/Linux）
brew install anomalyco/tap/opencode
```

启动很简单——进入你的项目目录，运行 `opencode`：

```bash
cd /path/to/my-project
opencode
```

### 2.2 配置 API Key

OpenCode 需要一个 LLM 模型来运行。它支持多种提供商：

- **OpenCode Zen**（官方推荐，开箱即用）
- **Anthropic**（Claude）
- **OpenAI**（GPT-4）
- **Google Gemini**
- **OpenRouter**
- 以及任何兼容 OpenAI / Anthropic API 的服务

启动时它会引导你输入 API Key。

### 2.3 项目初始化（init）

第一次在一个项目里使用 OpenCode 时，运行：

```
/init
```

OpenCode 会自动分析你的代码库，生成一个 `AGENTS.md` 文件放在项目根目录。这个文件记录了项目的构建命令、代码风格、文件结构等。下次启动时，OpenCode 会读取这个文件，更快地理解你的项目。

**建议把这个文件提交到 Git**，让团队成员（或未来的自己）共享上下文。

### 2.4 两种模式：Plan 和 Build

OpenCode 内置了两个代理，用 **Tab 键**切换：

| 模式 | 用途 | 权限 |
|------|------|------|
| **Build**（默认） | 直接写代码、改文件 | 全权限 |
| **Plan** | 只读分析，不修改文件 | 受限 |

Plan 模式适合先"想清楚再动手"。你描述需求 → 它给出实施方案 → 你满意后切回 Build 模式执行。

### 2.5 会话（Session）

每次对话是一个"会话"。OpenCode 会记住上下文，你可以在一次会话中连续追问、连续修改。

### 2.6 @ 符号引用文件

在对话中用 `@` 可以模糊搜索并引用项目中的文件：

```
帮我看看 @src/auth/login.ts 的认证逻辑
```

## 三、实际操作示例

### 示例 1：问问题

你刚接手一个陌生项目，想了解它的结构。

```
帮我把这个项目的主要目录结构解释一下
```

或者精确引用某个文件：

```
@src/utils/api.ts 这个文件里的函数是怎么用的？
```

OpenCode 会读取文件内容，用你看得懂的方式解释。

### 示例 2：加功能（Plan → Build 流程）

**Step 1：切换到 Plan 模式（按 Tab）**

描述需求：

```
用户删除笔记后，希望在数据库中标记为"已删除"而不是直接删掉。
然后做一个页面显示所有最近删除的笔记，可以恢复或删除。
```

**Step 2：迭代计划**

OpenCode 给出方案后，你可以补充：

```
我想用和现有笔记列表同样的设计风格。
[拖入一张参考图片]
参考这张图来设计新页面。
```

**Step 3：切回 Build 模式（再按 Tab）执行**

```
方案不错，开始改吧。
```

### 示例 3：直接修改

如果是小改动，不需要 Plan 模式，直接说：

```
把 @src/api/index.ts 里的函数重构一下，
参考 @src/notes.ts 里的认证写法
```

### 示例 4：撤回修改

改完了不满意？用 `/undo` 命令：

```
/undo
```

可以多次 `/undo` 撤回多步修改。要用 `/redo` 恢复。

## 四、自定义配置

OpenCode 的配置文件是 `opencode.json`（项目级）或 `~/.config/opencode/config.json`（全局）。

配置 LSP 服务器让 OpenCode 获得更智能的代码理解：

```json
{
  "lsp": {
    "go": {
      "command": "gopls"
    },
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"]
    }
  }
}
```

配置自定义工具权限，减少每次操作都弹窗确认：

```json
{
  "permissions": {
    "allowed_tools": ["view", "ls", "grep", "edit"]
  }
}
```

## 五、关键特性总结

- **多模型支持**：一个工具，多种 LLM，中途可切换
- **会话持久化**：每次对话独立保存，支持多会话
- **LSP 增强**：利用语言服务器协议获得更精确的代码理解
- **MCP 扩展**：支持 Model Context Protocol 插件系统
- **三种使用方式**：终端 TUI、桌面应用、IDE 扩展
- **跨平台**：macOS / Linux / Windows (WSL) / Android
- **`AGENTS.md`**：项目级上下文文件，一次初始化，处处受益
- **Plan + Build 双模式**：先规划再动手，降低改错成本

## 六、学习建议

1. **从 `/init` 开始**：在你的项目里跑一次初始化
2. **先问后做**：用 Plan 模式练手，熟悉它的思维方式
3. **善用 `@`**：引用具体文件会让回答精准很多
4. **写 `AGENTS.md`**：把项目的重要约定写进去，它会越用越聪明
5. **大胆 `/undo`**：不用担心改坏，随时可以撤回

---

> 本文档由 pipeline-v3 自动生成。
> 更多文档：https://opencode.ai/docs
