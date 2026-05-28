---
title: "Claude Code — 一个 LLM-runtime 暴露成 5 种 surface 的 agentic 产品"
description: 大型应用范例 (v1.1 分支 A 闭源反推) — agent loop / tool registry / permission / skill+hook+plugin 三层扩展 / memory 持久层
sidebar:
  order: 23
  label: "anthropics/claude-code"
---

> 状元篇升级 (2026-05-28，v1.1 分支 A 大型应用) — 上一版把 Claude Code 当 "agentic CLI 介绍" 来写，
> 这版重写两点：(1) 视角从 "产品介绍" 改成 "一个共享 runtime 怎么暴露 5 种 surface"，
> (2) 把扩展机制 (skill / hook / plugin) 从平铺的 "机制 1-7" 改成 **三层扩展架构**——
> 知识层 (skill 按需进 context) / 行为层 (hook 拦截事件) / 打包层 (plugin 整合分发)。
>
> **闭源声明**：Claude Code 主体 runtime 在 minified npm 包 `@anthropic-ai/claude-code` 内，
> 不可读源码。本笔记基于公开文档 + `~/.claude/` 目录实测 + settings.json schema + 9 hook 事件枚举
> + 68 个本机 skill 元数据 + 11 个启用 plugin **反推**内部设计。"心脏代码精读" 改成 "心脏机制反推"，
> 引用换成 docs.claude.com 链接 + 实测命令输出 + 文件路径，**不能验证内部实现**——这是闭源 SaaS
> 学习笔记的天花板。

## 核心信息

| 字段 | 值 |
|---|---|
| 项目名 | [anthropics/claude-code](https://github.com/anthropics/claude-code) (公开仓库) + `@anthropic-ai/claude-code` (闭源 npm) |
| 类型 | v1.1 分支 A · 大型应用 (user-facing product，每天有人在用) |
| 发布形态 | npm CLI / VSCode + JetBrains 扩展 / GitHub Action / claude.ai Web (受限) |
| 主语言 | TypeScript (公开仓库) — runtime bundle minified 不可读 |
| 维护方 | Anthropic 官方 |
| License | MIT (公开仓库) — runtime 闭源商业 |
| 计费 | Anthropic API 按 token / Claude.ai Pro 订阅 |
| 类似项目 | Cursor (闭源 IDE-fork) / Cline (开源 VSCode 扩展) / Aider (开源 CLI) / Continue (开源多 LLM) / sst/opencode (开源对照) |
| 哲学不同竞品 | sst/opencode (Apache-2.0 TypeScript 开源对照，能读完整 source) |

## 一句话定位

**Claude Code 不只是 "agentic CLI"——它是一个 LLM-runtime 通过同一个 agent loop + tool registry +
permission model 同时暴露成 CLI / TUI / IDE / Web / GitHub Action 五种 surface 的产品形态。**
重点不是 "AI 能写代码"，是 **"围绕 LLM 设计的产品架构"** ——
五种 surface 共享一套核心，扩展机制分三层 (知识 / 行为 / 打包)，memory 跨 session 持久。

## Why (为什么是它而不是 Cursor / Cline / Aider / Continue / Copilot)

这个领域 2024-2026 涌现了很多产品。简化坐标系：

| 产品 | 形态 | 核心定位 | 闭源/开源 | 扩展机制 |
|---|---|---|---|---|
| **GitHub Copilot** | IDE 内联建议 | 自动补全 + chat | 闭源 | 几乎无 (model 黑盒) |
| **Cursor** | fork VSCode | "VSCode + AI" 全套 | 闭源 | rules/cursor.md (浅) |
| **Cline** | VSCode 扩展 | agentic 操作 (开源) | 开源 | MCP servers (单一) |
| **Continue** | VSCode 扩展 | 多 LLM 抽象层 | 开源 | config.json + custom commands |
| **Aider** | CLI + git | git-aware 编辑 | 开源 | conventions.md (单文件) |
| **Claude Code** | CLI 优先 + 全 surface | agentic + 三层扩展 | 闭源 + 开放扩展 | skill + hook + plugin + MCP + subagent |
| **sst/opencode** | CLI | Claude Code 的开源对照 | 开源 (Apache-2.0) | 复刻 Claude Code 范式 |

**Claude Code 的产品判断 (5 条相互支撑)**：

1. **CLI 优先而非 IDE 优先**——理由是终端用户更稳定，CLI 接口可以脚本化 (cron / git hook / pipeline / SSH 远程)
2. **agentic 默认而非建议默认**——直接执行任务，配套完整 permission 模型来控制 "agent 自由度"
3. **可扩展第一**——hook / skill / plugin / MCP / subagent 五个不同抽象层级，让用户在合适的层次叠加自己的工作流
4. **持久 memory**——不只是 session 内 context，而是跨 session 的 markdown 文件 (反潮流：不用 vector DB)
5. **Anthropic 官方出品**——能拿到模型最新能力 (Opus 4.7 fast mode、最新 prompt caching、最新 thinking) 而第三方产品需要等适配

**为什么不是 Cursor**：Cursor 是好产品，但**它绑死在 fork VSCode**——
每次 VSCode 更新它要 rebase，每次模型升级它要适配。
Claude Code 是模型厂自己出的工具，**升级周期一致** (2.1.x 月更，CHANGELOG 里能看到这个节奏)。

**为什么不是 Cline**：Cline 给你 90% 的 agentic 功能 + 开源 + 完全可控，
但缺乏 Claude Code 的"产品级整合"——hooks / skills / memory / subagents 这套**分层扩展体系**，
Cline 只有 MCP 一种扩展点，扁平。

**为什么不是 Aider**：Aider 是 git-first 工具，简单优雅。
但它的 agentic 程度远弱——做不到自动 spawn subagent、自动跑测试、自动调用 MCP server。
扩展只有一个 `conventions.md`。

**Claude Code 的代价**：
- 闭源——不能完全控制，看不到内部调度逻辑
- 计费——按消息计费，重度用户成本不低
- 锁定 Anthropic 模型 (虽然有第三方代理可绕过)

**怀疑 1**：CLI 优先这个判断在多少时间窗口内成立？2026 年的现状是 IDE-AI 集成正在变浅 (Cursor tab completion 反而被诟病过度依赖)，
而 CLI agent 反而越发重要。但**5 年视角下 IDE 可能再次反超**——如果 LLM 能力强到不需要 "agentic 思考"，IDE 内联反而更轻。
笔者倾向于：CLI 是 "agent 当前阶段" 的最佳形态，不是终极形态。

## 仓库地形 (Layer 2)

注意：**主体代码不在公开仓库**。这点和 excalidraw 等开源应用根本不同——
我们能看到的是 "产品形态 + 扩展样例"，不是 "心脏算法"。

### 顶层目录注释表 (按"路由 / 数据层 / 业务模块"三类区分)

CLI 等价物映射 (大型应用分支 A 必填条目)：
- **路由层 = CLI 入口 + slash 命令分发**
- **数据持久层 = `~/.claude/` 配置目录 + sessions/ 历史**
- **业务模块 = 内置 plugin / skill / hook 各自一坨**

公开仓库 (`anthropics/claude-code` GitHub) 结构：

```
claude-code/                            ← 公开仓库
├── README.md                           ← 用户说明
├── CHANGELOG.md                        ★★★ 100+ 条迭代记录 (产品判断的痕迹)
├── plugins/                            ★ 内置 plugin 示例 — 业务模块层
│   ├── feature-dev/                    ← 7 阶段功能开发流程
│   ├── code-review/                    ← /code-review --fix
│   ├── frontend-design/                ← UI 设计审查
│   ├── pr-review-toolkit/              ← PR 评审清单
│   ├── commit-commands/                ← /commit slash 命令
│   └── ...
├── examples/
│   ├── hooks/                          ← hook 用法示例 (行为层学习入口)
│   ├── settings/                       ← settings.json 范例 (配置 schema)
│   └── mdm/                            ← Mobile Device Management (企业部署)
└── .claude-plugin/marketplace.json     ← plugin 市场清单
```

本机 `~/.claude/` 实测目录结构 (2026-05-28，**这才是真正的"数据持久层"**)：

```
~/.claude/                              ← 数据持久层
├── settings.json                       ★ 全局配置 (env / permissions / model / hooks / plugins / sandbox / ...)
├── settings.local.json                 ← 本机覆盖层 (gitignored)
├── CLAUDE.md                           ← 用户级全局 prompt (会进每个 session)
├── skills/                             ★ 68 个 skill (本机 ls 计数)
├── plugins/                            ← 业务模块层
│   ├── marketplaces/                   ← 3 个 (anthropic / claude-plugins-official / phd-skills)
│   ├── installed_plugins.json          ← 11 个 enabled
│   └── cache/
├── hooks/                              ← 5+ shell scripts (行为层) — 例: auto-format / block-git-add-all
├── projects/<project-hash>/            ← per-project 状态
│   └── memory/                         ← 跨 session memory (markdown index)
├── sessions/                           ← 历史 session 文件
├── history.jsonl                       ← 全局命令历史
├── shell-snapshots/                    ← Bash 调用快照 (调试用)
├── tasks/ ide/ paste-cache/ ...
```

### 心脏文件清单 (≥ 3，分布在不同 subsystem)

大型应用分支 A 的 "心脏" 不是一个文件——是分布在 multiple subsystem 的关键判断点：

| 心脏 | subsystem | 文件 / 路径 | 为什么是心脏 |
|---|---|---|---|
| **agent loop 行为契约** | runtime 核心 | docs.claude.com/agents/loop + Anthropic [tool use API](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview) | 整个产品的循环骨架；其他都是这个循环上的注入点 |
| **`settings.json` schema** | 配置 / 路由 | `~/.claude/settings.json` (本机) | runtime 怎么解析 `permissions` / `hooks` / `enabledPlugins` 决定行为 |
| **`SKILL.md` frontmatter 协议** | 知识层扩展 | `~/.claude/skills/*/SKILL.md` | skill 怎么被 LLM 看到 (description) + 怎么被加载 (lazy 正文) |
| **hook event 列表** | 行为层扩展 | settings.json 的 `hooks.*` 9 个键 | runtime 在循环的哪些点暴露给用户脚本 |
| **CHANGELOG.md** | 产品演化轨迹 | 公开仓库 | 100+ 条迭代记录，看产品判断怎么累积 |

### Commit 热点 (按 subsystem 分组，不只是总榜)

由于主仓库 commit 多数集中在 plugins/examples/CHANGELOG，我用本机 `~/.claude/` 的子系统活跃度做反推
(每个 subsystem 的最后修改时间 + 文件数)：

| Subsystem | 路径 | 文件数 (实测) | 含义 |
|---|---|---|---|
| skill 库 | `~/.claude/skills/` | 68 | 知识层扩展占比最大 (近 60% 用户级配置) |
| plugin 缓存 | `~/.claude/plugins/cache/` + `marketplaces/` | 3 marketplaces / 11 enabled | 打包层活跃度中等 |
| hook 脚本 | `~/.claude/hooks/` | 5+ shell | 行为层最少 (但每个都很关键) |
| 历史会话 | `~/.claude/sessions/` + `history.jsonl` | N (随使用增长) | 数据持久层主体 |
| memory | `~/.claude/projects/<hash>/memory/` | per-project | 跨 session 状态 |

→ **观察**：用户级配置中 **skill > plugin > hook**——
说明大部分人会先用 skill (轻量、单文件)，少数高级用户会用 plugin (打包分发)，更少数会写 hook (需要懂 shell + JSON 协议)。
这是一个**抽象阶梯**：复杂度从低到高。

### 全局架构图 (P0 必填，分支 A)

![Claude Code 产品形态拆解 — 一个 LLM-runtime 暴露成 5 种 surface](/projects/claude-code/01-product-shape.webp)

*图 1：Claude Code 的产品形态。中央米黄底色框是闭源 runtime `@anthropic-ai/claude-code` 内部
四件套——agent loop / tool registry / permission model / memory store。围绕它有 5 种 surface
(CLI 主形态 / TUI Print 模式 / IDE 扩展 / GitHub Action / Web claude.ai 受限版)，
通过 IPC 或共享配置接 runtime。左侧扩展机制 (Skills / Hooks / Plugins / MCP / Subagents)
是用户可写的注入点；右侧 `~/.claude/` 是数据持久层 (settings / 68 skills / 3 marketplaces / hook scripts / per-project memory / sessions)。
本机量化：1 个共享 runtime / 5 种 surface / 9 hook 事件 / 68 skills / 3 marketplaces / 11 enabled plugins。*

**怀疑 2**：图中央的"4 个内核组件"是反推的——闭源 bundle 里实际可能不是这样切。
可能 agent loop 和 tool registry 是同一个状态机，permission 和 memory 是 pluggable 模块。
但**外部行为表现得像 4 个组件解耦**——例如 permission 决策可以被 hook 完全替换，
说明它至少在接口层是独立的。

## 核心机制反推 · Layer 3

(三段对应不同 subsystem：runtime 核心循环 / 行为层扩展 / 知识层扩展+打包层)

### 机制 1 · agent loop —— 把 ReAct 范式产品化

Claude Code 的核心循环：

```
1. UserPromptSubmit (hook 可触发)
2. LLM 思考 → emit tool_use 块 (Anthropic Messages API 协议)
3. Permission 检查 (settings.permissions + PreToolUse hook)
4. Tool 执行 (Read/Write/Bash/Edit/Agent/...)
5. tool_result 回流 (PostToolUse hook 可触发)
6. LLM 继续 → 回到 2，直到 LLM 不再 emit tool_use
7. 终止时 Stop / SubagentStop hook 触发
```

**这是 [ReAct 范式](https://arxiv.org/abs/2210.03629) (Reason + Act 交替) 的产品化**——
ReAct 论文 2022 年提出 "LLM 不要一次性给完整答案，而是 think → act → observe 交替"，
[Anthropic tool use API 文档](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
2024 年把这个范式落到 Messages API 协议层，Claude Code 是这套 API 的 **参考实现 + CLI 包装**。

**关键判断**：把"工具"做成模型的一等公民——而不是把 prompt 拼好让 LLM 输出代码。
LLM 直接 emit 一个 `tool_use` 块，runtime 执行，结果回流到下一轮 messages。

![Agent Loop 数据流 — think → tool → observe 循环 + 注入点](/projects/claude-code/02-agent-loop.webp)

*图 2：agent loop 的 4 阶段循环 (用户输入 → LLM 思考 → Tool 执行 → Observe 结果) 和 4 个注入点。
左上 Permission 决策 (settings.permissions + PreToolUse hook + OS sandbox 三层防御)；
右上 Skill 注入 (两层：description 进 system prompt 让 LLM 选 + 选中后才注入 SKILL.md 正文)；
右下 Hook 钩点 (本机 settings.json 9 类事件)；左下 Memory 持久层 (跨 session 的 markdown 索引)。
循环终止条件：LLM 返回纯文本不再 emit tool_use。本图基于 ReAct 论文 + Anthropic tool_use API + 本机 ~/.claude/ 实测反推。*

**对照 ReAct 论文**：study 仓库已有 [react.md](/study/papers-method/) 笔记，对照之下 Claude Code 的演进是：
- ReAct 在 prompt 内交替 `Thought:` / `Action:` / `Observation:` 文本——靠 LLM 自觉，runtime 不参与
- Claude Code 把 `Action` 提升为 API 协议层的 `tool_use` 块——runtime 强制 schema 校验，错误可恢复
- ReAct 论文里 tool 是 "外部 API 调用"——Claude Code 里 tool 既是文件 IO 也是 spawn subagent 也是调 MCP server，**抽象统一**

**怀疑 3**：循环里的 "下一轮 LLM 调用" 是 stateless (重发完整 messages 数组) 还是 stateful (只发增量)？
从 prompt caching 文档推测应该是 stateless 重发 + 服务端缓存命中——这样 client 端逻辑简单，
但 token 计费要看 cache hit 率。这是闭源不能直接验证的细节。

### 机制 2 · Permission Model —— bash sandbox + 写权限白名单 + hook 三层防御

`~/.claude/settings.json` 实测里的 permissions 段控制 tool 调用：

```jsonc
// 节选 (键名实测，值结构示意)
{
  "permissions": {
    "allow": ["Read(*)", "Bash(git status)", ...],
    "deny": ["Bash(rm -rf *)", "Write(/etc/*)", ...],
    "ask": ["Bash(git push *)", ...]
  },
  "defaultMode": "ask",  // 兜底策略
  "sandbox": { /* macOS App Sandbox 配置 */ }
}
```

**三层决策顺序** (反推自实测行为)：

1. **settings.permissions 模式匹配**——allow / deny / ask 三态
2. **PreToolUse hook 拦截**——hook 通过 stdout JSON 返回 `{"continue": false, ...}` 强制阻止
3. **OS sandbox**——macOS App Sandbox 进程级写隔离 (即使前两层放行，OS 不让写就是不让写)

**dangerous 操作硬编码** (CHANGELOG 里频繁提到)：
- `rm -rf` / `git push --force` / 写 `/System` `/etc` / 修改 git config / 改 `~/.ssh/`
- 即使 permissions 写 `allow`，runtime 也会强制 `ask`

**bypass mode** (`--dangerously-skip-permissions` 或 `defaultMode: bypass`)：
- 跳过 prompt 但**不绕 OS sandbox**
- 这是常见的误解——bypass 让 Claude Code 不问你，**不让 OS 不管你**

→ 这是**深思熟虑的安全模型**。早期 agentic 工具 (autoGPT 时代) 经常 `rm -rf /`——
Claude Code 把"agent 自由 + 用户控制"做成可调谱。

**对比 Cursor**：Cursor 没有这么细的 permission 模型——它依赖 IDE 自己的文件系统抽象 + 每次问 "确认应用此修改"。
Claude Code 的 permission 更像 **iOS 应用权限模型**——细粒度、可审计、可拦截。

**对比 Cline**：Cline 有 "auto-approve" 列表，但只是 allowlist，没有 deny + ask 的三态，也没有 hook 层。

### 机制 3 · 三层扩展架构 —— skill (知识) / hook (行为) / plugin (打包)

这是 Claude Code 真正不同于其他 agent 工具的地方——**扩展机制不是一个，而是分层的**：

#### 层 1：Skill —— 按需加载的领域知识

每个 skill 是一个文件夹：

```
my-skill/
├── SKILL.md            ← frontmatter + 内容
└── scripts/            ← 可选辅助脚本
```

`SKILL.md` frontmatter 协议：

```yaml
---
name: my-skill
description: 用于 ... 时调用此 skill (这段文字进 system prompt 让 LLM 自己决定何时 invoke)
allowed-tools: Bash, Read, Write   # 可选：限制此 skill 能用哪些 tool
---
# 真正的指令内容 (这部分只有被 invoke 时才注入 context)
当用户说 X 时，按以下步骤...
```

**关键设计**：

1. **不是全部加载**——所有 skills 的 `description` (大约 80-200 字) 进 system prompt，让 LLM 在合适时机自己 invoke
2. **lazy 内容**——`SKILL.md` 正文 (可能几千字) 只在被 invoke 时才注入 context
3. **声明式 tool 限制**——skill 可以指定 `allowed-tools` / `disallowed-tools`，限定权限
4. **路径分层**——支持项目级 (`.claude/skills/`)、用户级 (`~/.claude/skills/`)、plugin 级 (`<plugin>/skills/`)

**本机量化** (2026-05-28)：68 个 skill × 平均 ~80 字 description ≈ 5KB system prompt overhead。
这个数字可接受——LLM context 通常 100k+ tokens，5KB 不到 1%。

→ **这是"按需加载知识"的优雅解**：避免了 RAG 的复杂度 (向量库 / chunking / retrieval pipeline)，
避免了 system prompt 膨胀 (一次性塞所有内容)。**LLM 自己决定何时拉取哪些 skills，命中率高、context 干净**。

#### 层 2：Hook —— 事件驱动的行为拦截

Hooks 是 shell 命令，在特定事件触发时执行。本机 settings.json 实测有 **9 类事件** (2026-05-28)：

| 事件 | 时机 | 典型用途 |
|---|---|---|
| `UserPromptSubmit` | 用户输入提交时 | 改写 prompt / 拒绝某些请求 |
| `PreToolUse` | Tool 执行前 | 拦截 dangerous 调用 / 加日志 |
| `PostToolUse` | Tool 执行后 | 自动 format / 自动跑 lint |
| `PreCompact` | context 压缩前 | 持久化重要状态 |
| `PermissionRequest` | 权限询问触发 | 自动批准某些规则 |
| `Stop` | 主循环终止 | 触发后续工作流 (notify / commit) |
| `SubagentStop` | subagent 终止 | 收集子任务结果 |
| `SessionStart` | session 开始 | 加载 project-specific 状态 |
| `SessionEnd` | session 结束 | 保存历史 / 提交日志 |

settings.json 配置示例：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": "/path/to/script.sh"}]
      }
    ],
    "PostToolUse": [
      {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "format-on-save.sh"}]}
    ]
  }
}
```

**Hook 通过 stdout JSON 与 runtime 通信**：

```bash
# script.sh 示例
echo '{"continue": false, "stopReason": "blocked by policy"}'
# 或
echo '{"continue": true, "modifiedInput": "..."}'
```

→ 这是 **Unix 哲学**的延伸：**用文本协议让外部进程和 LLM runtime 通信**。
不需要写 plugin SDK，写 bash 脚本就能扩展。

**本机 hook 实例** (`~/.claude/hooks/`)：通用例子如 git pre-commit format check / 阻止 `git add .` / 阻止敏感文件 commit / 自动跑测试 / 自动 lint。
每个都是单文件 shell 脚本。

#### 层 3：Plugin —— 把 skill / hook / command / agent 打包分发

Plugin = 一组 commands + agents + skills + hooks + MCP servers，通过 `marketplace.json` 描述。

```json
// .claude-plugin/marketplace.json (节选)
{
  "name": "my-marketplace",
  "plugins": [
    {
      "name": "my-plugin",
      "description": "...",
      "commands": ["/my-command"],
      "skills": [...],
      "hooks": [...]
    }
  ]
}
```

**例子** (公开仓库 `claude-code/plugins/feature-dev/`)：
- 命令 `/feature-dev`
- 7 阶段工作流 (Discovery → Architecture → Implementation → Review)
- 每阶段触发不同 subagent
- 集成到主 session 不打断对话

**本机量化**：3 个 marketplace 注册 / 11 个 enabled plugin。

→ 这是**让用户级别的"工作流"成为可分享的产物**。
团队可以发布自己的 plugin marketplace，整组用同一套 workflow——这才是 Claude Code 真正的护城河 (单纯模型能力其他厂商也能追上)。

#### 三层关系图

```
打包层 (Plugin)        ← 给团队 / 社区分发用
  └─ 包含 skill+hook+command+agent+MCP

行为层 (Hook)          ← 拦截 runtime 事件
  └─ shell + stdout JSON 协议

知识层 (Skill)         ← 按需进 LLM context
  └─ markdown + frontmatter，让 LLM 自己 invoke
```

**抽象阶梯**：用户先用 skill (低门槛、单文件、不用懂 shell) → 高级用户写 hook (需要 shell + JSON 协议) → 团队级用 plugin (打包分发)。

**怀疑 4**：这三层是 Anthropic 一开始设计好的，还是逐步演进出来的？
从 CHANGELOG 时间线看更像后者——early version 只有 hook，2.0+ 才大力推 skill，2.1.x 才有完整 plugin marketplace。
说明 Anthropic 也是 **"先做底层最灵活的 hook，再往上抽象 skill 让普通用户用，再往上做 plugin 让团队用"** 的渐进路线。

### 机制 4 · Memory 系统 —— 跨 session 持久知识 (反潮流：不用 vector DB)

`~/.claude/projects/<project-hash>/memory/` 实测结构：

```
memory/
├── MEMORY.md                       ← 索引 (始终加载到 context)
├── global/
│   ├── user_background.md          ← A. 始终适用
│   ├── feedback_teaching_style.md
│   └── ...
└── projects/
    └── <project-name>/
        └── ...                     ← C. 触发标签时加载
```

**判断**：跨 session 必须有一个**人类可读的 markdown 索引**。
不用 vector DB，不用复杂 embedding，不用复杂 retrieval——**ROI 最高的设计是"让用户能直接读 / 编辑 memory"**。

→ 这背后是一个反潮流的判断：很多 AI 产品在叠加 RAG / 向量索引 / agent memory framework (mem0、letta 等)。
Claude Code 选了**最简单的形式**——markdown + 索引文件——但取得了好效果。

**为什么 work**：
1. LLM 本身善于读 markdown，不需要"语义检索"中间层
2. 用户能直接 vim 编辑 memory，可控可审计
3. 索引文件 (`MEMORY.md`) 起到 "router" 作用——告诉 LLM 哪些条目按什么标签触发
4. 跨 session 是 markdown 持久化，不依赖运行时进程

**什么时候会失败**：
- memory 量极大 (>10MB)——markdown 加载会撑爆 context
- 需要精确语义检索 (例如 "找类似这段代码的所有片段")——markdown 索引做不到
- 多 agent 共享 memory + 写冲突——markdown 没有 transaction

**对比 mem0**：mem0 是 agent memory 的专门框架——分层 (short / long term)、向量检索、自动总结。
Claude Code 选了**对立路线**——一切交给 markdown 文件 + LLM 自己读。在 80% 场景下后者赢。

### 机制 5 · Subagents —— 并发 spawn + 上下文隔离

`Agent` tool 让 Claude Code 主进程能 spawn 子 agent (同模型 / 不同模型)：

```
主 agent：
  Agent("Explore", "find all error handling")
                ↓
              子 agent 在新 context 里跑
                ↓
              返回总结给主 agent
```

**作用**：
- 主 context 不被搜索结果占满 (保护"思考主线")
- 多个独立任务可并行 (`run_in_background: true`)
- 不同 agent 类型有不同的 tool 限制 (Explore 不能 Write，Plan 不能改文件)

→ 这是把"团队协作"模式带进 LLM 工作流。每个 subagent 有明确职责。
配合 `SubagentStop` hook，可以做"每个子任务完成后自动汇总到主 context"。

**怀疑 5**：subagent 是真的另起一个 LLM session (新 messages 数组、新 system prompt)，
还是只是 main session 内部的"context 切片"？从 token 计费行为推测应该是前者——
每个 subagent 独立计费、独立 caching。但 Anthropic 内部可能在多个 subagent 之间做 prompt cache 共享优化。

## 横向对比 (Layer 5)

### vs Cursor — IDE-first vs CLI-first

Cursor 把 AI 嵌进 IDE。优点：图形化、tab completion 直观、内联 diff 自然。
Claude Code 把 AI 放进 CLI。优点：脚本化 (cron 触发 / pipe 输入 / SSH 远程 / GitHub Action)、平台无关。

实际两者**互补**——很多人 Claude Code 跑后台任务，Cursor 做 IDE 编辑。

### vs Cline — 开源 vs 闭源 + 产品化

Cline 给你 90% 的 agentic 功能 + 开源 + 完全可控。
Claude Code 给你**那剩下 10%——hooks / skills / memory / subagents 的整合 + 三层扩展架构**。

如果你只要 "agent 能改文件"——Cline 够了。
如果你要"建立一套和 AI 协作的工作流"——Claude Code 是更好的起点。

### vs OpenCode — 同代开源对照

[sst/opencode](https://github.com/sst/opencode) 是 Claude Code 的明显对标。
Apache-2.0 license，TypeScript 写。**值得读源码**——
它实现了 Claude Code 的大部分核心 (agent loop、tool use、permissions)，让你看到**闭源产品的开源参考实现**。

→ 这就是为什么把 opencode 也放在推荐队列。学 Claude Code 的设计判断，读 opencode 的代码细节。

### vs Continue — 抽象 vs 具体

Continue 是"多 LLM 抽象层"——你可以接 GPT、Gemini、Llama、Claude。
Claude Code 是"为 Claude 优化的产品"。

**判断**：如果你不想绑 Anthropic、想随时切模型——Continue。
如果你信任 Anthropic 模型路线、想要最深度的整合——Claude Code。

### vs Aider — git-first 简单优雅 vs 全套抽象

Aider 简单到一个 `conventions.md` 就能配置所有，没有 hook 没有 plugin。
**这是优点**——上手成本极低。
但当你需要"每次 commit 前自动跑特定 lint" / "某些 tool 自动批准" / "和团队共享工作流"时，Aider 撞墙。

## Hands-on (10 分钟内能跑) (Layer 4)

### 安装 + 探索

```bash
# 安装
curl -fsSL https://claude.ai/install.sh | bash

# 进项目
cd ~/your-project
claude

# 在交互界面试
> 帮我读 README，告诉我这个项目是做什么的
> /help
> /skills
> /memory
```

观察这些：

1. **`/help` 列出所有 skills**——看它的 description，理解 skill 命名约定
2. **`/memory` 看到 MEMORY.md**——这是它跨 session 的真相之一
3. **执行一个会写文件的请求**——会触发审批弹窗，体验 permission 模型

### 改一处的实验 1：写一个 hook 看行为变化 (必做)

写一个最简单的 hook，检测 Bash 调用并记日志：

```bash
# ~/.claude/hooks/log-bash.sh
#!/bin/bash
echo "[$(date)] Bash call intercepted: $CLAUDE_TOOL_INPUT" >> ~/claude-bash.log
echo '{"continue": true}'  # 不阻止，继续执行
```

```json
// ~/.claude/settings.json (新增 hook 配置)
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": "/Users/<you>/.claude/hooks/log-bash.sh"}]
      }
    ]
  }
}
```

跑 Claude Code，让它执行任意 bash——观察 `~/claude-bash.log` 出现条目。
**这就是 Claude Code 可扩展性的最小验证**——你以非 Anthropic 雇员身份，
插入了一段代码到 runtime 的关键决策点。

### 改一处的实验 2：写一个 skill 观察 invoke 时机

在 `~/.claude/skills/` 下建文件夹：

```yaml
# ~/.claude/skills/my-greet/SKILL.md
---
name: my-greet
description: 用于打招呼场景；用户说"打招呼"或"hello"或"hi"时调用此 skill
---
你应该用一种夸张的方式打招呼，输出至少 3 行祝福语。
```

跑 `claude`，输入"打招呼"——会触发 skill 加载，按 SKILL.md 内容回复。

**理解 skill 是怎么 invoke 的**：
- LLM 看到 system prompt 里有这段 description
- 用户输入匹配 "打招呼"
- LLM 自主决定 invoke `my-greet`
- runtime 把 SKILL.md 正文注入 context
- LLM 按指令输出

**实验扩展**：把 description 改成"用于天气查询"，再输入"打招呼"——观察 skill 不再被 invoke。
这验证了 description 是 LLM 的决策依据，不是关键词匹配。

### 改一处的实验 3：观察 memory 跨 session 持久

```bash
claude
> 我喜欢用 Python 3.12，请记住
# Claude 会在 ~/.claude/projects/<hash>/memory/ 写 markdown
> exit

claude    # 新 session
> 我之前说我喜欢什么版本的 Python？
# 应该能从 memory 读出来
```

**实验**：vim 打开 `~/.claude/projects/<hash>/memory/MEMORY.md`，删掉那条记录，
再开新 session 问——应该不记得了。**这验证了 memory 是文件持久，不是 runtime 内存**。

### 改一处的实验 4：用 settings.permissions 自动放行某个 Bash 模式

```json
// ~/.claude/settings.json
{
  "permissions": {
    "allow": ["Bash(git status)", "Bash(git diff)", "Bash(git log:*)"]
  }
}
```

跑 Claude Code 让它跑 `git status`——观察不再弹审批 prompt。改 `allow` 列表，再跑——观察重新弹。

## 与你工作的连接

**能立刻迁移**：

- 把项目里的"可重复工作流" (部署 / 提交 / 写文档) 写成 skill 而不是脚本
- 用 hook 做"AI 行为的边界"——例如禁止 push、强制 commit 前跑 lint、阻止某些路径写
- 把 memory 用起来——不要每次新 session 都重新解释项目

**下个月可能用到**：

- 给团队建一个内部 plugin marketplace (共享 commit 规范、code review checklist、review prompt)
- 把 `/wiki` `/daily-learn` 等本站点用的 skill 模式应用到工作项目
- 用 subagent 做"独立任务并行"——例如同时跑 lint + test + 文档生成

**不要用 Claude Code 的部分**：

- **简单 chat 用 web claude.ai 就行**——不需要 CLI
- **完全脱离 Anthropic 的偏好** (隐私 / 数据合规)——选开源 (Cline / opencode / continue)
- **想要 IDE 内 tab completion**——Cursor / Copilot 更合适
- **不愿意学 hook/skill/plugin 抽象**——Aider 一个 conventions.md 更简单

## 读完你能做之前做不了的事

- **判断**：看到一个 AI 工具，能识别它"是套壳还是有产品判断"——看 hook / permission / memory / 扩展层是否完整
- **设计**：自己想做 AI 工具时，问"我的扩展点是什么"——hook / plugin / skill / agent 哪个层次
- **解释**：被问"agent 是什么"时，能用 Claude Code 当例子 (不是模糊概念) 讲 ReAct 循环 + tool use API
- **下钻**：看懂 OpenCode、Cline 这种开源对照的代码——它们和 Claude Code 同范式
- **对照**：识别"我自己的工作流"哪些可以做成 skill / plugin，哪些应该做成 hook
- **预测**：看到一个新 AI agent 产品，能预判它哪些扩展机制是浅的、哪些是深的——通过看是否有三层抽象

## 自检 · 5 个问题

1. Claude Code 选 CLI 优先，Cursor 选 IDE 优先。各自的代价是什么？长远谁会胜？
2. Skills 的 description 进 system prompt，内容 lazy load。如果改成"全部加载"性能会怎样？
   如果改成"完全 RAG (向量检索)"会丢失什么？
3. Hooks 用 shell + JSON stdout 通信，不提供 SDK。这种"原始"接口的好处和坏处是什么？
   什么时候应该升级成 typed SDK？
4. Memory 用 markdown 而不是向量 DB。在什么场景下 markdown 会失败、向量索引能赢？
5. Plugin marketplace 是闭源 (marketplace.json 由 Anthropic 审) 还是开源 (任何人可发)？
   两种生态各自的产品权衡。
6. 三层扩展 (skill / hook / plugin) 是 Anthropic 一开始设计好的吗？从 CHANGELOG 看是不是渐进演进？

## 限制段 (闭源反推的天花板)

**这篇笔记不能验证的事**：

1. **runtime 内部调度细节**——agent loop 是不是真的按图 2 这样切 4 阶段？或者是更细粒度的状态机？不可知
2. **prompt caching 命中率**——subagent 之间是否共享 cache？Anthropic 文档说会，但内部实现不可见
3. **tool_use 的 schema 校验**——bundle 内是否用了 zod / json-schema / 自研 validator？看 npm tarball 不可读
4. **permission 三层防御的具体顺序**——文档没明说 settings.permissions 和 PreToolUse hook 谁先 evaluate
5. **memory 索引的加载策略**——`MEMORY.md` 是每轮都重发还是 prompt cache？

**所以这篇笔记的价值**：不是"读懂 Claude Code 代码"——是**用产品行为反推设计判断**，
建立"看一个 agent 工具该看什么"的鉴赏框架。

**下一步该做什么** (如果想继续深入)：
- 读 [sst/opencode](https://github.com/sst/opencode) 源码——看 Claude Code 范式的开源参考实现
- 完整看一遍 `claude-code/CHANGELOG.md`——理解产品判断的演化路径
- 写一个完整 plugin (含 skill + hook + command)——验证三层扩展能否串起来

## 宣传 vs 现实附录

| 宣传话术 | 现实复杂度 |
|---|---|
| "agentic CLI" | 是 ReAct 范式 + tool_use API 的产品化，不是凭空发明 |
| "可扩展" | 三层 (skill/hook/plugin)，门槛递增，普通用户大多停在 skill |
| "memory 跨 session" | 是 markdown 文件，不是 vector DB；优雅但 >10MB 会撞墙 |
| "permission 模型" | 三层 (settings + hook + OS sandbox)，bypass mode 不绕 OS |
| "subagent" | 真的另起 LLM session 独立计费，不是 context 切片 |

## 延伸阅读

读完这篇笔记后下一步：

1. `CHANGELOG.md` 完整看一遍——你会看到产品判断的演化 ("先加这个特性，再发现要加那个")
2. `plugins/feature-dev/`——一个完整 plugin 的实现，对照写自己的
3. **anthropics/claude-code-action** (GitHub 仓库)——Claude Code 在 GitHub Actions 里运行
4. **sst/opencode**——开源对照，能读完整 source
5. **anthropics/skills** (社区 skill 仓库)——superpowers / agent-skills 这些 meta-skill 是怎么设计的
6. Anthropic [tool use 文档](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)——Claude Code 底层协议
7. ReAct 论文 [arxiv.org/abs/2210.03629](https://arxiv.org/abs/2210.03629)——agent loop 的范式起源

---

**笔记完成**：2026-05-28 (v1.1 分支 A 大型应用 / 闭源产品反推)
**研究方法**：CHANGELOG 时间线 + 公开 docs.claude.com + `~/.claude/` 实测目录 (settings.json schema + 9 hook 事件 + 68 skills + 3 marketplaces + 11 plugins) + 自身使用经验
**心脏机制**：agent loop (ReAct 产品化) + permission 三层防御 + 三层扩展 (skill/hook/plugin) + memory markdown 持久 + subagent 隔离
**显式限制**：闭源 runtime 不可读，本笔记是产品行为反推；不能验证内部调度 / cache 策略 / schema 校验细节
