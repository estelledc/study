---
title: "Claude Code — 你天天用的工具自己怎么设计的"
description: 一个 agentic CLI 的产品形态、扩展机制、权限模型、插件生态——元学习
sidebar:
  order: 23
  label: "anthropics/claude-code"
---

> anthropics/claude-code（公开仓库），MIT。
> 主体是闭源 npm 包 `@anthropic-ai/claude-code`，
> 公开仓库提供 README + plugins + examples + CHANGELOG（迭代节奏极快，2.1.x 月更）。
>
> 这一篇不像之前那些笔记可以"贴心脏代码"——
> Claude Code 的 runtime 是闭源的。但作为这个站点本身的**协作伙伴**，
> 它的产品判断和扩展机制有大量公开痕迹可读：
> 100+ 条 CHANGELOG、十几个开源 plugin、几百条 skill 元数据。
>
> 这是 Season 4「AI 协作」开篇——元学习。

## 一句话定位

**Claude Code = 一个 agentic CLI，运行在终端 / IDE / Web，把"和 AI 写代码"这件事产品化。**
核心不是 LLM 的能力，是**围绕 LLM 设计的产品形态**：tool use 协议 + 文件读写沙箱 + 权限模型 +
hooks + skills + plugins + subagents + 持久 memory。

每一项都是一个**产品判断**——是这些判断的累加而不是模型本身让 Claude Code 比"调 API + 套个 CLI"
体验好一个数量级。

## Why（为什么是它而不是 Cursor / Cline / Continue / Aider / Copilot CLI）

这个领域 2024-2026 涌现了很多产品。简化坐标系：

| 产品 | 形态 | 核心定位 | 闭源/开源 |
|---|---|---|---|
| **GitHub Copilot** | IDE 内联建议 | 自动补全 + chat | 闭源 |
| **Cursor** | fork VSCode | "VSCode + AI" 全套 | 闭源 |
| **Cline** | VSCode 插件 | agentic 操作（开源） | 开源 |
| **Continue** | VSCode 插件 | 多 LLM 抽象层 | 开源 |
| **Aider** | CLI + git | git-aware 编辑 | 开源 |
| **Claude Code** | CLI 优先 + IDE 集成 | agentic + 可扩展 | 闭源 + 开放 plugin |
| **OpenCode** | sst 出品 | Claude Code 的开源对照 | 开源 |

**Claude Code 的产品判断**：

1. **CLI 优先**——不是 IDE 插件。理由是终端用户更稳定，CLI 接口可以脚本化（cron / hook / pipeline）
2. **agentic 默认**——直接执行任务，不只是建议。配套有完整权限/审批模型
3. **可扩展第一**——hooks + skills + plugins + MCP，让用户可以叠加自己的工作流
4. **持久 memory**——不只是 session 内 context，而是跨 session 的 `~/.claude/memory/`
5. **Anthropic 官方**——能拿到模型最新能力（Opus 4.7 fast mode、最新 caching、最新 thinking）

**为什么不是 Cursor**：Cursor 是好产品，但**它绑死在 fork VSCode**——
每次 VSCode 更新它要 rebase，每次模型升级它要适配。
Claude Code 是模型厂自己出的工具，**升级周期一致**。

**为什么不是 Cline**：Cline 是开源 + 开放，但缺乏 Claude Code 的"产品级整合"——
hooks / memory / skills 这套体系。

**为什么不是 Aider**：Aider 是 git-first 工具，简单优雅。
但它的 agentic 程度远弱——做不到自动 spawn subagent、自动跑测试、自动调用 MCP server。

**Claude Code 的代价**：
- 闭源——不能完全控制
- 计费——按消息计费，重度用户成本不低
- 锁定 Anthropic 模型（虽然有第三方代理）

## 仓库地形

注意：**主体代码不在公开仓库**。公开仓库结构：

```
claude-code/                            ← 公开仓库
├── README.md                           ← 用户说明
├── CHANGELOG.md                        ← ★★★ 100+ 条迭代记录（产品判断的痕迹）
├── plugins/                            ← ★ 内置 plugin 示例
│   ├── feature-dev/                    ← 7 阶段功能开发流程
│   ├── code-review/                    ← /code-review --fix
│   ├── frontend-design/                ← UI 设计审查
│   ├── pr-review-toolkit/
│   ├── commit-commands/
│   └── ...
├── examples/
│   ├── hooks/                          ← hook 用法示例
│   ├── settings/                       ← settings.json 范例
│   └── mdm/                            ← Mobile Device Management（企业部署）
└── .claude-plugin/marketplace.json     ← plugin 市场清单
```

**心脏文件**：
- `CHANGELOG.md`——读完一遍能看到产品判断的累积
- `plugins/feature-dev/README.md`——一个完整 plugin 的设计哲学
- 自己电脑上的 `~/.claude/skills/`（如果你装过 Claude Code）——sk ill 元数据格式

主体 runtime 在 `node_modules/@anthropic-ai/claude-code/`——是 minified JS bundle，不可读。

## 核心机制 · Layer 3 精读

### 机制 1 · agent loop —— LLM + tool use 的标准化协议

Claude Code 的核心循环（基于 Anthropic Messages API 的 tool use）：

```
1. 用户输入
2. LLM 分析 → 决定调用哪些 tool（Read / Write / Bash / Agent / ...）
3. tool 执行（在 sandbox 内）
4. 结果返回给 LLM
5. LLM 总结 / 继续调 tool / 回复用户
6. (回到 2，直到任务完成)
```

**关键判断**：把"工具"做成模型的一等公民——而不是把 prompt 拼好让 LLM 输出代码。
LLM 直接 emit 一个 `tool_use` 块，runtime 执行，结果回流。

→ 这是 Anthropic 在 2024 年推的 [tool use API](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
的产品化。Claude Code 是这套 API 的"参考实现"。

### 机制 2 · Skills 系统 —— 按需加载的领域知识

Skills 是 Claude Code 2.1.x 时代的核心扩展机制（CHANGELOG 里频繁出现）。

每个 skill 是一个文件夹，含：

```
my-skill/
├── SKILL.md            ← frontmatter + 内容
└── scripts/            ← 可选辅助脚本
```

`SKILL.md` 的 frontmatter：

```yaml
---
name: my-skill
description: 用于 ... 时调用此 skill
allowed-tools: Bash, Read, Write
---
# 真正的指令内容
当用户说 X 时，按以下步骤...
```

**关键设计**：

1. **不是全部加载**——所有 skills 的 `description` 进 system prompt，让 LLM 在合适时机自己 invoke
2. **lazy 内容**——`SKILL.md` 内容只在被 invoke 时才注入 context
3. **声明式 tool 限制**——skill 可以指定 `allowed-tools` / `disallowed-tools`，限定权限
4. **路径自由**——支持项目级（`.claude/skills/`）+ 用户级（`~/.claude/skills/`）

→ **这是"按需加载知识"的优雅解**：避免了 RAG 的复杂度，避免了 system prompt 膨胀。
LLM 自己决定何时拉取哪些 skills，命中率高、context 干净。

### 机制 3 · Hooks 系统 —— 事件驱动的扩展点

Hooks 是 shell 命令，在特定事件触发时执行：

```json
// settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": "/path/to/script.sh"}]
      }
    ],
    "PostToolUse": [...],
    "UserPromptSubmit": [...],
    "SessionStart": [...]
  }
}
```

事件清单（CHANGELOG 时间线）：
- `PreToolUse` / `PostToolUse`——拦截工具调用
- `UserPromptSubmit`——用户输入提交时
- `SessionStart` / `SessionEnd`
- `MessageDisplay`（2.1.152 新加）——拦截助手消息显示前

**Hook 通过 stdout JSON 与 runtime 通信**：

```bash
echo '{"continue": false, "stopReason": "blocked by policy"}'
```

→ 这是 **Unix 哲学**的延伸：**用文本协议让外部进程和 LLM runtime 通信**。
不需要写 plugin SDK，写 bash 脚本就能扩展。

### 机制 4 · Permissions 模型 —— bash sandbox + 写权限白名单

Claude Code 一直在演化权限系统（CHANGELOG 痕迹）。当前模型：

1. **bash sandbox**：默认每个 Bash 调用都要审批（"allow once / always / deny"）
2. **写权限白名单**：`Edit / Write / NotebookEdit` 受 `allowWrite` 设置控制
3. **危险操作**：`rm -rf` / `git push --force` / 写敏感文件 → 强制审批
4. **bypass mode**：`--dangerously-skip-permissions` 整个绕过（不进 OS sandbox 但跳过 prompt）
5. **OS 沙箱**：macOS App Sandbox 一层，进程级写隔离

→ 这是**深思熟虑的安全模型**。早期 agentic 工具（autoGPT 时代）经常 `rm -rf /`——
Claude Code 把"agent 自由 + 用户控制"做成可调谱。

### 机制 5 · Memory 系统 —— 跨 session 持久知识

`~/.claude/projects/<project-hash>/memory/MEMORY.md` + 多个分类文件：

```
memory/
├── MEMORY.md                       ← 索引（始终加载）
├── global/
│   ├── user_background.md
│   ├── feedback_teaching_style.md
│   └── ...
└── projects/
    └── <project-name>/
        └── ...
```

**判断**：跨 session 必须有一个**人类可读的 markdown 索引**。
不用 vector DB，不用复杂结构——**ROI 最高的设计是"让用户能直接读 / 编辑 memory"**。

→ 这背后是一个反潮流的判断：很多 AI 产品在叠加 RAG / 向量索引 / agent memory framework。
Claude Code 选了**最简单的形式**——markdown + 索引文件——但取得了好效果。

### 机制 6 · Subagents —— 并发 spawn + 上下文隔离

`Agent` tool 让 Claude Code 主进程能 spawn 子 agent（同模型 / 不同模型）：

```
主 agent：
  Agent("Explore", "find all error handling")
                ↓
              子 agent 在新 context 里跑
                ↓
              返回总结给主 agent
```

**作用**：
- 主 context 不被搜索结果占满（保护"思考主线"）
- 多个独立任务可并行（`run_in_background: true`）
- 不同 agent 类型有不同的 tool 限制（Explore 不能 Write，Plan 不能改文件）

→ 这是把"团队协作"模式带进 LLM 工作流。每个 subagent 有明确职责。

### 机制 7 · Plugins —— 把上面所有打包成可分发的工作流

Plugin = 一组 commands + agents + skills + hooks + MCP servers。
通过 `marketplace.json` 描述。

例子（feature-dev plugin）：
- 命令 `/feature-dev`
- 7 阶段工作流（Discovery → Architecture → Implementation → Review）
- 每阶段触发不同 subagent
- 集成到主 session 不打断对话

→ 这是**让用户级别的"工作流"成为可分享的产物**。
团队可以发布自己的 plugin marketplace，整组用同一套 workflow。

## 横向对比

### vs Cursor — IDE-first vs CLI-first

Cursor 把 AI 嵌进 IDE。优点：图形化、 tab completion 直观。
Claude Code 把 AI 放进 CLI。优点：脚本化（cron 触发 / pipe 输入 / SSH 远程）、平台无关。

实际两者**互补**——很多人 Claude Code 跑后台任务，Cursor 做 IDE 编辑。

### vs Cline — 开源 vs 闭源 + 产品化

Cline 给你 90% 的 agentic 功能 + 开源 + 完全可控。
Claude Code 给你**那剩下 10%——hooks / skills / memory / subagents 的整合**。

如果你只要 "agent 能改文件"——Cline 够了。
如果你要"建立一套和 AI 协作的工作流"——Claude Code 是更好的起点。

### vs OpenCode — 同代开源对照

[sst/opencode](https://github.com/sst/opencode) 是 Claude Code 的明显对标。
Apache-2.0 license，TypeScript 写。**值得读源码**——
它实现了 Claude Code 的大部分核心（agent loop、tool use、permissions），让你看到**闭源产品的开源参考实现**。

→ 这就是为什么我把 opencode 也放在推荐队列。学 Claude Code 的设计，读 opencode 的代码。

### vs Continue — 抽象 vs 具体

Continue 是"多 LLM 抽象层"——你可以接 GPT、Gemini、Llama、Claude。
Claude Code 是"为 Claude 优化的产品"。

**判断**：如果你不想绑 Anthropic、想随时切模型——Continue。
如果你信任 Anthropic 模型路线、想要最深度的整合——Claude Code。

## Hands-on（10 分钟内能跑）

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

1. **/help 列出所有 skills**——看它的 description，理解 skill 命名约定
2. **/memory 看到 MEMORY.md**——这是它跨 session 的真相之一
3. **执行一个会写文件的请求**——会触发审批弹窗，体验权限模型

### 改一处的实验（必做）

写一个最简单的 hook，检测 Bash 调用：

```bash
# ~/.claude/hooks/log-bash.sh
#!/bin/bash
echo "[$(date)] Bash call intercepted" >> ~/claude-bash.log
echo '{"continue": true}'
```

```json
// ~/.claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": "/path/to/log-bash.sh"}]
      }
    ]
  }
}
```

跑 Claude Code，让它执行任意 bash——观察 `~/claude-bash.log` 出现条目。
**这就是 Claude Code 可扩展性的最小验证**。

第二个实验：写一个 skill。在 `~/.claude/skills/` 下建一个文件夹：

```yaml
# ~/.claude/skills/my-greet/SKILL.md
---
name: my-greet
description: 用于打招呼场景；用户说"打招呼"或"hello"时调用
---
你应该用一种夸张的方式打招呼，加上 emoji 不少于 5 个 🎉🎊✨🌟⭐
```

跑 `claude`，输入"打招呼"——会触发 skill 加载，按 skill 内容回复。
**理解 skill 是怎么 invoke 的**。

第三个实验：写一个 plugin。可以参考 `claude-code/plugins/feature-dev/` 的结构。
plugins 是 skill / commands / agents / hooks 的打包形式。

## 与你工作的连接

**能立刻迁移**：

- 把项目里的"可重复工作流"（部署 / 提交 / 写文档）写成 skill 而不是脚本
- 用 hooks 做"AI 行为的边界"——比如禁止 push、强制 commit 前跑 lint
- 把 memory 用起来——不要每次新 session 都重新解释项目

**下个月可能用到**：

- 给团队建一个内部 plugin marketplace（共享 commit 规范、code review checklist）
- 把 `/wiki` / `/daily-learn` 等本站点用的 skill 模式应用到工作项目
- 用 subagent 做"独立任务并行"——比如同时跑 lint + test + 文档生成

**不要用 Claude Code 的部分**：

- **简单 chat 用 web claude.ai 就行**——不需要 CLI
- **完全脱离 Anthropic 的偏好**（隐私 / 数据合规）——选开源（Cline / opencode）
- **想要 IDE 内 tab completion**——Cursor / Copilot 更合适

## 读完你能做之前做不了的事

- **判断**：看到一个 AI 工具，能识别它"是套壳还是有产品判断"——看 hooks / permissions / memory 这些机制是否完整
- **设计**：自己想做 AI 工具时，问"我的扩展点是什么"——hooks / plugin / skill / agent 哪个层次
- **解释**：被问"agent 是什么"时，能用 Claude Code 当例子（不是模糊概念）
- **下钻**：看懂 OpenCode、Cline 这种开源对照的代码——它们和 Claude Code 同模型
- **对照**：识别"我自己的工作流"哪些可以做成 skill / plugin，哪些应该做成 hook

## 自检 · 5 个问题

1. Claude Code 选 CLI 优先，Cursor 选 IDE 优先。各自的代价是什么？长远谁会胜？
2. Skills 的 description 进 system prompt，内容 lazy load。如果改成"全部加载"性能会怎样？
   如果改成"完全 RAG"会丢失什么？
3. Hooks 用 shell + JSON stdout 通信，不提供 SDK。这种"原始"接口的好处和坏处是什么？
4. Memory 用 markdown 而不是向量 DB。在什么场景下 markdown 会失败、向量索引能赢？
5. Plugin marketplace 是闭源（marketplace.json 由 Anthropic 审）还是开源（任何人可发）？
   两种生态各自的产品权衡。

## 延伸阅读

读完这篇笔记后下一步：

1. `CHANGELOG.md` 完整看一遍——你会看到产品判断的演化（"先加这个特性，再发现要加那个"）
2. `plugins/feature-dev/`——一个完整 plugin 的实现，对照写自己的
3. **anthropics/claude-code-action**（GitHub 仓库）——Claude Code 在 GitHub Actions 里运行
4. **sst/opencode**——开源对照，能读完整 source
5. **anthropics/skills**（社区 skill 仓库）——superpowers / agent-skills 这些 meta-skill 是怎么设计的
6. Anthropic [tool use 文档](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)——Claude Code 底层协议

---

**笔记完成**：2026-05-27（v2.1.152）
**研究方法**：CHANGELOG 时间线分析 + plugin 结构 + 自身使用经验
**心脏文件**：`CHANGELOG.md` + `plugins/feature-dev/README.md` + `~/.claude/` 实例
