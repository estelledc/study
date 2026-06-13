---
title: Cline — VS Code 自主编码代理
来源: https://github.com/cline/cline
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：带审批流程的「实习工程师」

想象你带一位能力很强的实习生进项目组。你说：「给登录接口加 rate limit，跑测试，有问题自己修。」实习生会自己翻代码、改文件、开终端跑命令、必要时打开浏览器点页面验证——但**每做一步都会把方案递到你面前**：「我准备改这三个文件，并执行 `npm test`，可以吗？」你点批准，他才动；你点拒绝或改一句指示，他就换方案。

**Cline 就是住在 [[vscode]] 侧边栏里的这位实习生。** 它是开源（Apache 2.0）的自主编码代理，在编辑器里读项目结构、写 diff、跑 shell、连 MCP 工具、甚至驱动浏览器做端到端验证。与「全自动黑盒脚本」不同，Cline 默认 **human-in-the-loop（人在回路）**：文件变更和终端命令都要经你审批（也可对信任操作开 auto-approve）。官方仓库：[cline/cline](https://github.com/cline/cline)；扩展可在 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) 安装。除 VS Code 外，项目还提供 CLI、SDK、Kanban 等多端形态，但零基础最顺的路径仍是 **装扩展 → 配 API Key → 侧边栏对话**。

---

## 这个项目解决什么问题

### 痛点 1：聊天 AI 和「真的改仓库」之间缺一层编排

网页 ChatGPT 能写代码片段，但你要自己复制、找路径、跑测试。Cline 把 **理解仓库 → 多文件编辑 → 执行命令 → 读 linter 输出 → 再修** 串成一条 agent loop，且每一步在 VS Code diff 视图里可见。

### 痛点 2：一次性改太多，回滚困难

Cline 在编辑过程中维护 **Checkpoints（检查点）**，可一键撤销 agent 的改动序列，不必手动 `git checkout -- .` 猜哪次改坏了。

### 痛点 3：每个团队的规范不同

通过 **`.clinerules/`** 目录（及兼容的 `AGENTS.md`、`.cursorrules` 等），把编码标准、测试要求、架构约定写进仓库，Cline 启动任务时会自动注入这些规则——类似给实习生一份 onboarding 手册。

### 痛点 4：模型和工具被单一厂商绑死

Cline 采用 **BYOK（Bring Your Own Key）**：Anthropic、OpenAI、Google Gemini、OpenRouter、AWS Bedrock、Azure、本地 Ollama / LM Studio 等均可配置，扩展本身不按 token 加价（你直接向模型商付费）。

---

## 核心概念拆解

### 1. Agent Loop（代理循环）

你发自然语言任务 → Cline 规划子步骤 → 调用内置工具（读文件、写文件、执行终端、搜索代码、浏览器操作等）→ 把结果反馈给模型 → 循环直到 `attempt_completion` 或你叫停。VS Code 1.93+ 的 **Shell Integration** 让 Cline 能在集成终端里跑命令并实时读 stdout/stderr，而不是 blind exec。

### 2. Plan 模式 vs Act 模式

官方 **Plan & Act** 双模式把「想」和「做」分开：

| 模式 | 能做什么 | 不能做什么 |
|------|----------|------------|
| **Plan** | 读代码、搜索、讨论架构、写计划文档 | 改文件、跑命令 |
| **Act** | 在 Plan 上下文基础上编辑、执行、测试 | — |

典型流程：先在 Plan 里摸清范围和边界 → 切 Act 实现。复杂任务可用 `/deep-planning` 做更长程分析。还可为两种模式配置**不同模型**（例如 Plan 用强推理模型，Act 用更快便宜的模型）。

### 3. 审批与 Auto-Approve

每个 `write_file`、`execute_command`、MCP 工具调用都会弹出批准 UI。熟悉后可对只读类或固定测试命令开启 auto-approve，但新手建议保持默认——这是 Cline 相对「完全自主脚本」的安全阀。

### 4. Checkpoints

Act 模式下的大改前可启用 checkpoint；不满意从时间线回滚 agent 引入的变更，再换提示重试，比依赖单次 Git commit 粒度更细。

### 5. Linter / Compiler 感知

Cline 会监视 TypeScript、ESLint 等诊断信息；模型看到报错后会尝试补 import、修类型、改语法——类似实习生改完代码看一眼 Problems 面板。

### 6. Computer Use / 浏览器

支持 **Computer Use** 能力时，Cline 可启动浏览器、点击、输入、截图、读 console，用于 UI 调试或简单 E2E——适合「复现页面上的报错」这类任务。

### 7. MCP（Model Context Protocol）

MCP 像 **AI 的 USB-C 口**：通过标准协议把数据库、GitHub、搜索、文件系统等外部能力接进 agent。配置写在 MCP 设置 JSON（CLI 侧常见路径概念为 `.cline/mcp.json`；扩展内通过 MCP Servers 面板编辑）。传输方式包括 **stdio**（本地进程）和 **HTTP/SSE**（远程服务）。扩展内置 **MCP Marketplace**，可一键安装社区服务器。

### 8. `.clinerules/` 项目规则

在项目根建 `.clinerules/`，里面放多个 `.md` / `.txt`，Cline 合并后作为系统级约束。文件可用 YAML frontmatter 的 `paths` 字段做 **按 glob 激活**（例如只在 `src/**/*.ts` 时加载前端规范）。团队把规则 commit 进 Git，人人同一套 agent 行为。

### 9. 多产品形态（了解即可）

| 产品 | 用途 |
|------|------|
| VS Code 扩展 | 日常 GUI 开发 |
| CLI (`npm i -g cline`) | 终端、CI、脚本化 |
| SDK | 自建 agent / 插件 |
| Kanban | 多 agent 任务看板 |

零基础先把扩展用熟，再考虑 CLI 自动化。

### 10. 与 Aider、Cursor、Copilot 的定位差

| 维度 | Cline | [[aider]] | Cursor / Copilot |
|------|-------|-----------|------------------|
| 运行位置 | VS Code 侧边栏 | 终端 | IDE 内置 |
| 自主多步 | 强，带逐步审批 | 强，Git 为中心 | 视功能而定 |
| 规则文件 | `.clinerules/` | `.aider.conf.yml` | 各产品规则 |
| MCP | 一等公民 + Marketplace | 非核心 | Cursor 也支持 MCP |
| 开源 | Apache 2.0 | Apache 2.0 | 多为商业 |

三者可并存：例如终端里 [[aider]] 做 Git 原子提交，VS Code 里 Cline 做带浏览器验证的大功能。

---

## 安装与首次配置

1. 在 VS Code 扩展市场搜索 **Cline**（发布者 saoudrizwan）并安装。
2. 打开侧边栏 Cline 面板，在 Settings 里选择 **API Provider**（Anthropic / OpenAI / OpenRouter 等）并填入 API Key。
3. 用 `File → Open Folder` 打开一个 **Git 仓库**（便于你自己用 Git 做最终审查；Cline checkpoint 不能替代团队 PR 流程）。
4. 建议默认从 **Plan 模式** 开始第一次对话。

```bash
# 可选：全局 CLI（与扩展共用 agent 核心）
npm i -g cline

# 查看 CLI 帮助
cline --help
```

---

## 代码示例 1：Plan → Act 完成一个小功能

场景：在一个 Express 项目里新增 `GET /health`，返回 `{ status: "ok", uptime: number }`。

**Step 1 — Plan 模式（只读）**

在 Cline 输入：

```text
@src/server.ts @package.json
我想加 GET /health，返回 JSON：status 和 process.uptime()。
先别改文件：列出要动哪些文件、是否需要新测试、项目里现有的路由风格。
```

Cline 会搜索/阅读你 @ 提到的文件，给出计划。你确认无误后点击 **Switch to Act**（或输入切换 Act）。

**Step 2 — Act 模式（执行）**

```text
按刚才的计划实现。写完在 package.json 里找 test 脚本并运行；
如果有 eslint/tsc 报错请自行修复。完成后简短总结 diff。
```

你会依次看到类似审批项：

```text
[Approve] Write file: src/routes/health.ts
[Approve] Execute: npm test
[Approve] Write file: tests/health.test.ts  (若测试失败后的修复)
```

在 VS Code 内置 diff 里审查每处修改；若整条路径不对，用 **Reject** 并补充：「测试请用 vitest，不要 jest」。全部完成后 Cline 会 `attempt_completion` 并总结变更。

---

## 代码示例 2：`.clinerules/` 与 MCP 配置

### 2a. 团队编码规则

```text
my-app/
├── .clinerules/
│   ├── 01-general.md
│   ├── 02-typescript.md
│   └── 03-testing.md
├── src/
└── package.json
```

`01-general.md`：

```markdown
# 通用约定

- 所有新代码必须有对应测试。
- 不要删除或弱化现有 eslint-disable，除非同时修复根因。
- 提交前必须能本地通过 `npm run lint` 与 `npm test`。
- 未经我明确批准，不要执行 deploy 或访问 production 环境变量。
```

`02-typescript.md`（带路径条件，仅编辑 TS 时生效）：

```yaml
---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript 规范

- 禁止使用 `any`；不确定时用 `unknown` 并收窄。
- 公共 API 必须写 JSDoc。
- 优先 functional 组件 + hooks，不要新建 class 组件。
```

之后任何 Cline 任务都会带上这些约束，减少「风格跑偏」。

### 2b. MCP：给 Cline 接上 GitHub 与文件系统

在 Cline 面板 → **MCP Servers** → Configure，在 `mcpServers` 中增加（路径按本机调整）：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/you/projects/my-app"
      ],
      "disabled": false
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxx"
      },
      "disabled": false
    }
  }
}
```

保存后 MCP 面板应显示绿色连接与可用 **tools** 列表。此时你可以说：

```text
用 GitHub MCP 列出本 repo 最近 5 个 PR 的标题；
再读 src/auth/login.ts，对照 PR 里关于 rate limit 的讨论，在 Plan 模式给出实现建议。
```

Cline 会在调用 `use_mcp_tool` 前再次请求批准（除非你为特定工具配置了 autoApprove）。

CLI 侧也可用向导管理 MCP：

```bash
cline mcp
# 交互式：List / Add / Edit / Enable / Disable / Delete
```

---

## 常用操作速查

| 操作 | 说明 |
|------|------|
| `@文件名` | 把文件/文件夹加入上下文 |
| Plan ↔ Act 切换 | 工具栏或命令面板切换模式 |
| `/deep-planning` | 复杂任务深度规划 |
| MCP Servers 面板 | 安装、重启、禁用 MCP |
| Checkpoints | 回滚 agent 变更序列 |
| Settings → Plan/Act 模型 | 分模式指定不同 LLM |

---

## 成本、安全与合规

- **成本**：按所选 LLM 提供商计费；长对话 + 大仓库 context 会烧 token。Plan 用贵模型、Act 用便宜模型是常见省钱组合。
- **代码外泄**：源码与命令输出会发往模型 API；敏感仓库用本地 Ollama 或私有端点，并阅读厂商数据保留政策。
- **命令风险**：`rm -rf`、curl 管道 bash、改 `.env` 等操作务必人工审批；CI 密钥不要写进会被 agent 读取的明文文件。
- **MCP 权限**：filesystem 服务器只授予必要目录；GitHub token 用最小 scope。

---

## 实践建议（零基础上手）

1. **先 Plan 后 Act**——除非 typo 级小改，否则不要一上来就 Act。
2. **用 @ 精确指路**——@ 相关文件比让 agent 全库乱搜更省 token、更准。
3. **把规范写进 `.clinerules/`**——比每次聊天重复「我们用 pnpm」更有效。
4. **开 checkpoint 再做大重构**——多文件迁移、换框架时尤其有用。
5. **MCP 一次加一个**——确认 tools 正常再叠下一个，方便排错。
6. **人类仍做 code review**——Cline 是执行层，合并前你自己或 CI 终审。
7. **与 Git 习惯结合**——agent 完成后 `git diff`、分 commit，别一股脑 push。

---

## 进一步阅读

- 官网：[cline.bot](https://cline.bot/)
- GitHub：[cline/cline](https://github.com/cline/cline)
- 文档索引：[docs.cline.bot](https://docs.cline.bot/)（含 [Plan & Act](https://docs.cline.bot/features/plan-and-act)、[MCP](https://docs.cline.bot/mcp/mcp-marketplace)、[Rules](https://docs.cline.bot/customization/cline-rules)）
- VS Code Marketplace：[Cline 扩展页](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)

---

## 小结

Cline 把「会自己改代码的 AI」放进了你已有的 VS Code 工作流：**Plan 模式对齐方案，Act 模式落地变更，逐步审批守住安全线，Checkpoints 与 diff 视图保证可逆，`.clinerules/` 与 MCP 把团队规范和外部系统接进同一条 agent loop。** 对希望在不换 IDE 的前提下体验自主编码、又要保持透明可控的开发者，Cline 是从零上手的一条清晰路径——先装扩展、配一把 Key、从小任务 Plan → Act 开始，再逐步加规则与 MCP 即可。
