---
title: OpenCode — SST 出品的终端 AI IDE
来源: https://github.com/sst/opencode
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：住在终端里的「结对程序员」

想象你有一位随叫随到的结对搭档：你坐在熟悉的终端窗口里，他坐在旁边。你说「帮我把 `/settings` 路由加上和 `/notes` 一样的鉴权」，他会自己翻文件、grep 搜索、跑测试、看 LSP 报错，改完还问你「这样 diff 可以吗？」——但**不会偷偷把你的代码上传到某个黑盒 SaaS**；模型 API Key 在你手里，对话默认留在本机。

**OpenCode 就是这位搭档。** 它是 SST（Serverless Stack）团队开源的 AI 编码代理（MIT），主打 **终端 TUI**，同时也提供桌面客户端和 VS Code / Cursor 扩展。官方仓库历史上叫 [sst/opencode](https://github.com/sst/opencode)，现主维护在 [anomalyco/opencode](https://github.com/anomalyco/opencode)；文档与安装入口见 [opencode.ai](https://opencode.ai)。与「只能聊天、不能动仓库」的网页 AI 不同，OpenCode 内置读文件、编辑、bash、grep、LSP、MCP 等工具，形成完整的 **agent loop**；与完全无人值守的脚本不同，它支持 **Plan 模式**（只读分析）和可配置的 **permission**（改文件、跑命令前询问）。

零基础学习路径：**安装 CLI → `/connect` 配模型 → 进项目跑 `/init` → Tab 切换 build/plan → 用自然语言 + `@文件` 提任务**。

---

## 这个项目解决什么问题

### 痛点 1：终端党不想为了 AI 换整套 GUI IDE

很多资深开发者日常在 iTerm、WezTerm、Ghostty 里用 vim/neovim + tmux。OpenCode 把 agent 直接嵌进 TUI，不必为了「让 AI 改代码」切到另一个 Electron 应用；需要图形界面时还有 **Desktop Beta** 和 **IDE 扩展** 可选。

### 痛点 2：模型和账号被单一厂商绑死

OpenCode 通过 [Models.dev](https://models.dev) 接入 **75+ 提供商**：Anthropic、OpenAI、Google、本地 Ollama、Amazon Bedrock 等。还可复用已有订阅——例如 **GitHub Copilot** 登录、**ChatGPT Plus/Pro** 登录，或 SST 自家的 **OpenCode Zen**（经团队 benchmark 过的模型列表）。API Key 用 `/connect` 或环境变量配置，**扩展本身不按 token 加价**。

### 痛点 3：AI 乱改文件、命令不可控

内置 **build**（全权限开发）与 **plan**（默认禁止写文件、bash 需批准）两种主 agent，用 **Tab** 切换。`opencode.json` 里可把 `edit`、`bash` 设为 `"ask"`，团队还可用 macOS MDM / 托管 `opencode.json` 强制策略。

### 痛点 4：每个仓库规范不同

运行 **`/init`** 会扫描项目并生成根目录 **`AGENTS.md`**，帮助 agent 理解目录结构与约定；还可通过 `instructions` 字段引用 `CONTRIBUTING.md`、`.cursor/rules/*.md` 等。项目级 **`opencode.json`** 与 **`.opencode/`** 目录（agents、commands、plugins、skills）可 commit 进 Git，全组行为一致。

### 痛点 5：协作与 CI 需要可分享的 agent 会话

TUI 里 **`/share`** 可生成公开链接分享当前对话（可设为 manual / auto / disabled）。GitHub 侧运行 `opencode github install` 后，在 Issue/PR 评论里 `@opencode` 或 `/oc`，可在 **GitHub Actions runner** 里执行任务并提 PR——代码不出你的 GitHub 环境。

---

## 核心概念拆解

### 1. TUI（Terminal User Interface）

在项目目录执行 `opencode` 即启动交互界面。斜杠命令如 `/connect`、`/init`、`/undo`、`/models` 是主要控制面；Leader 键默认 **Ctrl+X**（可改 `tui.json` 的 `keybinds`）。长消息可用 **`/editor`** 调 `$EDITOR` 撰写；拖图片进终端可做多模态参考。

### 2. Agent 与模式

| Agent | 作用 | 典型场景 |
|-------|------|----------|
| **build** | 默认；可编辑、跑 bash、调工具 | 实现功能、修 bug、跑测试 |
| **plan** | 只读；改文件默认 deny，bash 需批准 | 读陌生仓库、写实现方案 |
| **general**（子 agent） | 复杂搜索、多步任务 | 消息里 `@general` 显式调用 |

右下角指示当前模式；**Tab** 在 build ↔ plan 间切换。自定义 agent 可在 `opencode.json` 的 `agent` 块或 `.opencode/agents/*.md` 定义。

### 3. 内置工具（Tool Registry）

OpenCode 核心注册的工具包括：

| 类别 | 工具 | 用途 |
|------|------|------|
| 文件 | `read`, `edit`, `write`, `apply_patch` | 读/改/写/补丁式编辑 |
| 搜索 | `grep`, `glob`, `lsp` | ripgrep、路径匹配、语言服务器 |
| 网络 | `webfetch` | 拉取网页内容 |
| 编排 | `task`, `skill` | 委派子 agent、加载 skill 指令 |

可在配置里 `tools: { write: false }` 禁用某类工具；与 **permission** 配合实现最小权限。

### 4. LSP 与 Formatter

开启 `lsp: true` 后，OpenCode 会按项目自动加载合适 LSP，让模型「看见」类型与诊断；`formatter` 可在 agent 改文件后自动跑 Prettier 等。这对 TypeScript/Rust 等强类型项目减少「改完一堆红波浪线」的返工。

### 5. 配置分层与合并

多个来源的 `opencode.json` **合并而非覆盖**（冲突键以后者为准）。大致优先级从低到高：远程 `.well-known/opencode` → 全局 `~/.config/opencode/` → 环境变量 `OPENCODE_CONFIG` → 项目根 `opencode.json` → `.opencode/` → 托管/MDM 策略。TUI 外观单独放在 **`tui.json`**。

### 6. Session、Snapshot 与 Undo

会话内改动通过 **snapshot** 跟踪（默认开启，大 monorepo 可 `snapshot: false` 换性能）。**`/undo`** 回滚 agent 引入的变更并恢复你的上一条提示；**`/redo`** 重做。这与 Git 互补：Git 管「最终提交」，OpenCode 管「这一轮对话里的试错」。

### 7. MCP、Plugin、Skill

- **MCP**：在 `opencode.json` 的 `mcp` 块配置远程/stdio 服务器，扩展数据库、Jira、搜索等能力。
- **Plugin**：`.opencode/plugins/` 或 npm 包名（`plugin` 数组）加载自定义工具与钩子。
- **Skill**：`.opencode/skills/` 或 `@skill` 注入领域指令，类似「可插拔 SOP」。

### 8. 多界面同一核心

| 界面 | 说明 |
|------|------|
| TUI | `opencode`，日常主力 |
| Desktop | [opencode.ai/download](https://opencode.ai/download)，Beta |
| VS Code 扩展 | 扩展 ID `sst-dev.opencode`；`Cmd+Esc` 开终端会话 |
| CLI 非交互 | `opencode run "prompt"`，适合脚本 |
| GitHub Action | `opencode github install` 后 PR/Issue 驱动 |

### 9. 与 Cline、Aider、Cursor 的定位差

| 维度 | OpenCode | [[cline]] | [[aider]] | Cursor |
|------|----------|-----------|-----------|--------|
| 主战场 | 终端 TUI | VS Code 侧边栏 | 终端 + Git | IDE 内置 |
| 开源 | MIT | Apache 2.0 | Apache 2.0 | 商业为主 |
| Plan/Build 分离 | Tab 切换内置 agent | Plan & Act 模式 | 无一等 Plan UI | Agent 模式因版本而异 |
| 模型来源 | 75+ 提供商 + Zen | BYOK | BYOK | 订阅制 |
| 项目规则 | `AGENTS.md` + `instructions` | `.clinerules/` | `.aider.conf.yml` | Rules |

三者可并存：终端 OpenCode 做探索，[[aider]] 做 Git 原子提交，[[cline]] 做带浏览器 MCP 的 GUI 任务。

---

## 安装与首次配置

```bash
# 推荐：官方安装脚本（自动检测 OS/arch）
curl -fsSL https://opencode.ai/install | bash

# 或通过包管理器
brew install anomalyco/tap/opencode   # macOS/Linux，更新最勤
npm install -g opencode-ai              # Node 全局
scoop install opencode                  # Windows

# 进入项目
cd /path/to/your-repo
opencode
```

TUI 内首次使用：

1. **`/connect`** — 选 OpenCode Zen、Anthropic、OpenAI 等，粘贴 API Key；或 OAuth 登录 Copilot/ChatGPT。
2. **`/models`** — 选择默认模型（如 `anthropic/claude-sonnet-4-5`）。
3. **`/init`** — 生成 `AGENTS.md`。
4. **Tab** — 确认右下角为 **plan** 或 **build**。

可选：项目根创建 `opencode.json` 固化模型与权限（见下文示例）。

---

## 代码示例 1：Plan → Build 完成一个小功能

场景：Express 项目新增 `GET /health`，返回 `{ status: "ok", uptime: number }`。

**Step 1 — 切到 Plan 模式（Tab），只读分析**

在 TUI 输入：

```text
@src/server.ts @package.json
我想加 GET /health，返回 JSON：status 和 process.uptime()。
先别改文件：列出要动哪些文件、测试怎么跑、和现有路由风格是否一致。
```

Plan agent 会 `read` / `grep` 相关文件，给出实现步骤。你确认后再 **Tab 切回 build**。

**Step 2 — Build 模式执行**

```text
按刚才的方案实现。写完运行 package.json 里的 test 脚本；
若有 tsc/eslint 报错请自行修复。完成后用三句话总结 diff。
```

若配置了 `"permission": { "edit": "ask", "bash": "ask" }`，每次写文件或跑命令会弹出批准；满意则通过，不满意 **`/undo`** 整轮回滚并重写提示。

**Step 3 — 分享或固化（可选）**

```text
/share
```

生成只读链接给同事 review 这次 agent 对话；或把最终方案写进 `AGENTS.md` 的「Health check」小节供后续会话复用。

---

## 代码示例 2：项目级 `opencode.json` 与自定义命令

### 2a. 团队统一模型、权限与 MCP

项目根 `opencode.json`：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "default_agent": "build",
  "permission": {
    "edit": "ask",
    "bash": {
      "*": "ask",
      "rm -rf *": "deny"
    }
  },
  "instructions": ["CONTRIBUTING.md", "docs/architecture.md"],
  "formatter": true,
  "lsp": true,
  "command": {
    "test": {
      "description": "跑全量测试并汇报失败",
      "template": "Run the full test suite with coverage. Fix failures if trivial; otherwise summarize root cause.",
      "agent": "build"
    }
  },
  "mcp": {
    "github": {
      "type": "stdio",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "{env:GITHUB_TOKEN}"
      }
    }
  }
}
```

之后在 TUI 输入 **`/test`** 即展开为预置长提示；敏感 Key 用 `{env:GITHUB_TOKEN}` 从环境变量注入，避免写进 Git。

### 2b. 只读 Code Review 子 agent

`.opencode/agents/reviewer.md`：

```markdown
---
description: 只读代码审查，不改文件
model: anthropic/claude-sonnet-4-5
tools:
  write: false
  edit: false
  bash: false
---

你是严格的 code reviewer。关注：安全、性能、边界条件、测试覆盖。
输出格式：Critical / Major / Minor 分级，每条带文件路径与行号引用。
不要直接修改代码，只给可执行的修改建议。
```

TUI 里 `@reviewer` 或配置 `default_agent` 切换；适合 PR 前自检，与 build agent 分工明确。

---

## 代码示例 3：非交互 CLI 与 VS Code 快捷集成

### 3a. 脚本化一次问答

```bash
# 单次 prompt，适合 CI 或本地脚本（需已 opencode auth）
export OPENCODE_CONFIG=/path/to/opencode.json
opencode run "List all TODO comments in src/ and group by module"

# 指定工作目录
opencode /path/to/other-repo run "Explain how auth middleware works"
```

### 3b. VS Code / Cursor 扩展

1. 在集成终端运行一次 `opencode`，扩展会自动安装（Marketplace ID：`sst-dev.opencode`）。
2. 快捷键：
   - **Cmd+Esc**（Mac）/ **Ctrl+Esc**（Win/Linux）：聚焦或打开 OpenCode 终端。
   - **Cmd+Shift+Esc**：新开会话 tab。
   - **Cmd+Option+K**：把当前文件路径插入为 `@path/to/file#L10-20` 引用。

这样 GUI 里选中代码、终端里 agent 改仓库，上下文通过 `@` 引用对齐，不必复制粘贴大段代码。

---

## TUI 常用斜杠命令速查

| 命令 | 作用 |
|------|------|
| `/connect` | 配置 LLM 提供商与 API Key |
| `/init` | 分析项目，生成/更新 `AGENTS.md` |
| `/models` | 切换当前会话模型 |
| `/undo` / `/redo` | 回滚/重做 agent 文件变更 |
| `/share` | 生成可分享会话链接 |
| `/export` | 导出对话（走 `$EDITOR`） |
| `/help` | 命令面板与快捷键帮助 |

Leader 键（默认 Ctrl+X）组合可打开主题、键位、滚动等设置；细节见 [TUI 文档](https://opencode.ai/docs/tui)。

---

## 隐私、成本与选型建议

- **隐私**：官方强调不存储你的代码与上下文；敏感环境可只用本地模型 + 禁用 `webfetch` / 出站 MCP。
- **成本**：OpenCode 软件免费；token 费用取决于所选模型。Zen 提供经测试的「agent 友好」模型列表，减少「同一个 prompt 不同模型质量差十倍」的试错。
- **何时优先 OpenCode**：你本来就在终端工作、想要开源可审计 agent、需要 Plan/Build 明确分离、或要在 GitHub Actions 里 `@opencode`。
- **何时叠加其他工具**：需要 VS Code diff 侧边栏审批 UX 用 [[cline]]；需要「只改 Git 跟踪文件、自动 commit」用 [[aider]]；需要深度 IDE 索引用 Cursor。

---

## 常见问题

**Q：仓库从 sst/opencode 迁到哪了？**  
A：主开发在 GitHub **anomalyco/opencode**；安装脚本与文档域名仍是 opencode.ai。笔记 frontmatter 保留 SST 起源链接便于溯源。

**Q：必须联网吗？**  
A：模型推理需 API 或本地推理栈（Ollama 等）；工具链本身可离线读本地仓库。

**Q：Windows 怎么装？**  
A：Scoop、Chocolatey、npm 或 Desktop `.exe`；Bun 安装仍在完善中。

**Q：和 Claude Code / Codex CLI 冲突吗？**  
A：不冲突，可同时安装；注意别多个 agent 同时改同一工作区，用 Git 分支隔离。

**Q：大 monorepo 卡顿？**  
A：配置 `watcher.ignore` 排除 `node_modules`/`dist`；必要时 `snapshot: false`；或缩小单次 `@` 引用范围。

---

## 延伸资源

- 官方文档：[opencode.ai/docs](https://opencode.ai/docs)
- 配置 Schema：[opencode.ai/config.json](https://opencode.ai/config.json)
- GitHub：[github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)（原 [sst/opencode](https://github.com/sst/opencode)）
- 社区： [opencode.ai/discord](https://opencode.ai/discord)
- 相关笔记：[[cline]]、[[aider]]、[[vscode]]

---

## 小结

OpenCode 把「会读仓库、会跑命令、会看 LSP 的 AI」放进终端，用 **build/plan 双 agent**、**分层配置** 和 **/undo 快照** 平衡效率与安全。零基础只需记住四条：**安装 → `/connect` → `/init` → Tab 切换模式**；进阶再把 `opencode.json`、`.opencode/agents` 和 MCP 纳入团队工程化。作为 SST 开源生态里面向 daily driver 的 agent 入口，它适合作为终端工作流的第一站，而不是唯一一站。
