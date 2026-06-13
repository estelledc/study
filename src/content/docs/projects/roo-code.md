---
title: Roo Code — 多模式 VS Code AI 助手
来源: https://github.com/RooCodeInc/Roo-Code
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：编辑器里的「可换岗开发团队」

想象你管理一个小型软件团队，但成员都坐在同一张工位前——只是**戴不同工牌**。写功能时换「码农」；画架构时换「架构师」；查资料时换「文档员」；线上报错时换「排障工程师」。每个人**权限不同**：架构师可以读全仓库、写设计文档，但不能乱改业务代码；码农可以改文件、跑终端；文档员 mostly 只读。你作为 Tech Lead，每步仍可点「批准 / 拒绝」，熟悉后也可以对固定操作开「自动批准」，让团队连续工作几小时。

**Roo Code 就是 [[vscode]] 侧边栏里的这支团队。** 它是开源（Apache 2.0）的 AI 编码代理扩展，源自 [[cline]] 生态的演进路线，在 GitHub 上以 [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) 维护（2026 年 5 月官方扩展已宣布停更并归档，社区 fork 如 [ZooCode](https://github.com/Zoo-Code-Org/Zoo-Code/) 可继续跟进；学习其设计仍对理解 VS Code agent 范式极有价值）。核心卖点不是「又一个聊天框」，而是 **Modes（多模式角色）+ 工具链 + 模型无关（BYOK）**：同一套 agent 引擎，通过模式切换系统提示、可用工具与文件编辑边界，让 LLM 在长任务里少跑偏。

---

## 这个项目解决什么问题

### 痛点 1：单一 Chat 角色「什么都想干」

通用助手容易在「先写设计文档」和「直接改十三个文件」之间摇摆。Roo 用 **Code / Architect / Ask / Debug** 等内置模式，以及可扩展的 **Custom Modes**，把「当前能用什么工具、能改哪些路径」写死在配置里，相当于给模型换工牌。

### 痛点 2：被一家模型厂商锁死

Roo **本身不是模型**；它通过 `buildApiHandler()` 对接 OpenAI、Anthropic、OpenRouter、Google Gemini、本地 Ollama 等二十余家 Provider。官方文档强调 **model agnosticism**：「最好的模型」每两周变一次，扩展层不应绑死。

### 痛点 3：AI 改仓库缺审批与回滚

与 [[cline]] 类似，Roo 默认 **human-in-the-loop**：`write_to_file`、`execute_command`、MCP 调用等需批准。任务执行中维护 **Checkpoints（检查点）**，可逐步回退 agent 引入的变更；并支持 `.rooignore` 控制哪些路径不可碰、哪些不进 checkpoint。

### 痛点 4：团队规范难注入 agent

通过 `.roo/rules/`、`.roo/rules-{modeSlug}/`、`.roorules`、以及兼容的 `AGENTS.md`，把编码规范、测试要求、目录约定写进**系统提示**，且可按模式分层加载——新人 clone 仓库即继承同一套 agent 行为。

---

## 核心概念拆解

### 1. 三层架构（Extension Host / Webview / External）

| 层 | 职责 | 典型组件 |
|----|------|----------|
| **Extension Host** | 跑在 VS Code 扩展进程：任务编排、工具执行、Provider 调用 | `ClineProvider`、`Task`、`CodeIndexManager` |
| **Webview UI** | 侧边栏 React 界面：聊天、设置、模式管理 | `ExtensionStateContext`、`SettingsView` |
| **External Services** | LLM API、MCP Server、可选云端认证/索引 | OpenRouter、Qdrant 语义索引等 |

Extension 与 Webview 通过 VS Code **`postMessage`** 双向通信；状态用 `clineMessagesSeq` 等序列号避免竞态覆盖。

### 2. Task（任务）与 Agent Loop

一次用户请求对应一个 **Task** 实例（`Task.ts`）：

1. 初始化模式、API Handler、`.rooignore` 控制器、Checkpoint 服务、终端注册表  
2. 进入 `recursivelyMakeClineRequests()` 循环：组上下文 → 调 LLM → 解析 tool call → 执行工具 → 把结果塞回对话 → 直到完成或用户 abort  
3. 维护两路消息：`clineMessages`（UI 展示）与 `apiConversationHistory`（发给模型的精简历史，省 token）

若 agent 连续犯同类错误超过 `consecutiveMistakeLimit`，会暂停并请你介入——防止无限重试同一错误命令。

### 3. Modes System（模式系统）

每个模式是 `ModeConfig`：**slug、名称、roleDefinition、customInstructions、groups（工具组）、可选 fileRegex**。

| 内置模式 | 典型用途 | 行为倾向 |
|----------|----------|----------|
| **Code** | 日常编码、改文件、跑命令 | 全工具组，偏实现 |
| **Architect** | 系统设计、迁移方案、规格 | 偏规划，常限制直接改业务代码 |
| **Ask** | 解释代码、查文档、问答 | 只读为主 |
| **Debug** | 加日志、复现、定位根因 | 偏诊断与最小改动 |
| **Custom** | 团队自定义（如 Docs Writer、Security Review） | YAML 定义，可导入导出 |

工具可见性由 `groups` 映射到 `TOOL_GROUPS`（read、edit、command、mcp、browser 等），再经 `buildNativeToolsArray()` 过滤后交给模型。

**加载优先级**（后者覆盖同名 slug）：项目 `.roo/modes/` → 根目录 `.roomodes` → 全局 `~/.roo/modes/` → 全局设置。

### 4. Tool Architecture（工具架构）

Roo 把自然语言落到环境动作，来源包括：

- **Native Tools**：`read_file`、`write_to_file`、`execute_command`、`search_files` 等  
- **MCP Tools**：Model Context Protocol 服务器暴露的工具（命名如 `mcp--server--tool`）  
- **Custom Tools**：工作区 `.roo/tools` 等目录发现的用户工具  

执行前走 `askApproval`；写文件/跑命令会检查 **`.rooignore`**（类似 `.gitignore` 的 agent 黑名单）。

### 5. Provider Profiles（模型配置）

在设置里建 **Profile**：选 Provider、模型 ID、API Key、温度、max tokens 等。可为不同模式绑定不同 Profile（例如 Architect 用强推理模型，Code 用更快模型）。动态 Provider（OpenRouter 等）通过 `modelCache` 拉取模型元数据。

### 6. Custom Instructions（规则注入）

规则加载顺序（概念上，越具体越靠前）：

1. 模式目录：`.roo/rules-{modeSlug}/`（及 `~/.roo/rules-{modeSlug}/`）  
2. 回退文件：`.roorules-{modeSlug}`  
3. `.rooignore` 相关说明  
4. `AGENTS.md` / `AGENT.md`（可通过 `roo-cline.useAgentRules` 关闭）  
5. 通用：`.roo/rules/`、`.roorules`  

目录内多文件按**文件名字母序**拼进 system prompt。

### 7. Checkpoints 与 Cleanup

任务编辑过程中可打 checkpoint，支持在聊天里逐步回退。存储可配置保留策略（如 7 天、每任务最多 50 个、全局 5GB 上限），并尊重 `.rooignore` 排除二进制/敏感路径。

### 8. Code Index（可选语义搜索）

**CodeIndexManager** 可对仓库做 embedding + 向量库（如 Qdrant），让 agent 用语义搜索定位相关代码，而不只依赖文件名 grep——大 monorepo 里尤其有用。

### 9. Auto-Approve 与 Orchestrator 思维

新手应保留逐步批准。熟悉后可对只读、固定测试命令等开 **Auto-Approve**，让 agent 长时自治。官方文档还提到 **Orchestrator** 方向：复杂项目由协调角色在多个 Mode 之间分派子任务（适合「整模块迁移」类野心任务）。

### 10. CLI 与扩展双形态

除 VS Code 扩展外，仓库含 **独立 CLI**：支持 headless 任务、会话恢复、NDJSON stdin 等，便于 CI 或脚本化；但零基础路径仍是 **Marketplace 装扩展 → 配 Provider → 侧边栏开 Task**。

### 11. 与 Cline、Aider、Cursor 的定位

| 维度 | Roo Code | [[cline]] | [[aider]] |
|------|----------|-----------|-----------|
| 运行位置 | VS Code 侧边栏 | VS Code 侧边栏 | 终端 |
| 角色切换 | **多 Mode 一等公民** | Plan / Act 双模式 | `/architect` 等 chat mode |
| 模型 | BYOK，Profile 丰富 | BYOK | BYOK |
| 规则 | `.roo/rules*`、`.roorules` | `.clinerules/` | `.aider.conf.yml` |
|  lineage | 自 Cline 分支演进 | 上游 agent 扩展 | 独立 Python CLI |

三者可并存：Roo/Cline 管 IDE 内多步 agent，Aider 管 Git 原子提交。

### 12. 停更说明（2026-05）

官方于 2026 年 5 月 15 日关闭扩展运营并归档主仓库；文档站注明可转向 **ZooCode**（社区 fork）或回到 **Cline**。本笔记以 Roo Code 架构为学习对象；若你要在生产环境长期依赖，请确认安装源（Marketplace 条目 `RooVeterinaryInc.roo-cline`）与社区接手版本。

---

## 零基础上手路径

### 第一步：安装与 Provider

1. 在 VS Code / Cursor / VSCodium 扩展市场搜索 **Roo Code**（或社区接手 fork）并安装。  
2. 打开侧边栏 Roo 面板 → **Settings / Providers** → 新建 Profile，填入 API Key（如 Anthropic、OpenRouter）。  
3. 选默认模型，发送一条简单消息验证连通：`Explain what this repo's package.json scripts do`。

### 第二步：按任务选 Mode

- 问概念、读代码 → **Ask**  
- 写功能、改 bug → **Code**  
- 设计 API / 模块边界 → **Architect**  
- 线上报错、测试红 → **Debug**  

切换模式后，同一仓库上下文保留，但**可用工具与系统提示**会变。

### 第三步：加项目规则

在仓库根建 `.roo/rules-code/01-testing.md`（Code 模式专用），写入测试与提交约定；下次 Task 自动注入。

### 第四步：MCP 扩展能力

在设置 **MCP Servers** 添加 stdio 或 HTTP 服务（如 GitHub、数据库、浏览器）。Mode 需启用 **mcp** 工具组后，模型才能调用。

### 第五步：熟悉批准与 Checkpoint

前几次任务**不要**全开 Auto-Approve；在 diff 视图里看清每处改动。大改前确认 checkpoint 可用，改坏了从时间线回退再换提示。

---

## 代码示例

### 示例 1：项目级 Custom Mode（`.roo/modes/docs-writer.yaml`）

为「只写文档、不改 src」定义专用模式，放在项目 `.roo/modes/`（优先级最高）：

```yaml
# .roo/modes/docs-writer.yaml
slug: docs-writer
name: Docs Writer
description: 维护 README、docs/ 与 changelog，不修改生产代码

roleDefinition: |
  你是技术文档工程师。输出清晰、可扫描的 Markdown；
  引用代码时使用仓库内真实路径；不臆造 API。

customInstructions: |
  - 遵循 docs/ 下现有标题层级与术语表
  - 修改后列出「读者应验证的链接/命令」
  - 禁止修改 src/、tests/ 下任何文件

groups:
  - read
  - edit
  - command

# 仅允许编辑文档相关路径（具体语法以当前版本 schema 为准）
fileRegex: "^(docs/|README\\.md|CHANGELOG\\.md).*"
```

在 UI **Modes** 面板导入或刷新后，选 **Docs Writer** 发任务：`根据 src/api/auth.ts 更新 docs/api/auth.md，并补全 curl 示例。`

配合规则目录 `.roo/rules-docs-writer/01-style.md`，可进一步规定中英文、代码块语言标签等。

### 示例 2：模式规则 + 全局 `.roorules` + MCP 配置片段

**模式专用规则**（`.roo/rules-debug/01-repro.md`）：

```markdown
# Debug 模式复现约定

1. 先读报错栈与相关测试，再改代码；禁止未读就重写模块。
2. 加日志时使用项目已有 logger（如 `import { logger } from '@/lib/logger'`），禁止 `console.log` 长期残留。
3. 每轮修复后给出：根因假设、验证命令、若仍失败时的下一步。
```

**仓库级回退文件**（无 `.roo/rules/` 目录时可用根目录 `.roorules`）：

```markdown
# Global agent rules

- package manager: pnpm（勿生成 npm/yarn 命令）
- 测试: `pnpm test`；单测: `pnpm test --filter <pkg>`
- 新 API 必须同步 OpenAPI 或 docs/api/
```

**MCP Server 片段**（设置 JSON 概念示例，路径因版本而异）：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}"
      }
    }
  }
}
```

在 **Debug** 或 **Code** 模式启用 `mcp` 组后，可让 agent「查 PR diff / issue 讨论」辅助排障——仍建议在 Settings 里对该 server 的写操作保持手动批准。

---

## 常用工作流（模式组合）

### 流程 A：新功能（Architect → Code → Debug）

1. **Architect**：`设计用户通知模块：事件源、队列、失败重试；输出 docs/specs/notifications.md`  
2. 审阅 spec，切 **Code**：`按 spec 实现 MVP，补单元测试`  
3. 测试失败切 **Debug**：`根据 jest 输出修 race condition，最小 diff`  

### 流程 B：只问不改（Ask）

`src/core/task/Task.ts 里 checkpoint 和 abort 的调用关系是什么？用列表说明，不要改文件。`

### 流程 C：导出 Mode 给另一仓库

Modes 面板 **Export Mode** → 生成含 `rules-{slug}` 的 YAML → 在另一项目 **Import（Project level）** → 得到相同 `.roo/rules-*` 结构。

---

## 配置与目录速查

| 路径 | 作用 |
|------|------|
| `.roo/modes/*.yaml` | 项目自定义模式 |
| `.roomodes` | 单文件模式定义（YAML/JSON） |
| `.roo/rules/` | 全局（所有模式）规则目录 |
| `.roo/rules-{slug}/` | 某模式专用规则 |
| `.roorules` / `.roorules-{slug}` | 单文件规则回退 |
| `.rooignore` | agent 不可访问/不可 checkpoint 的路径 |
| `.roo/tools/` | 自定义工具发现目录 |
| `AGENTS.md` | 与 Cursor/Cline 生态兼容的 agent 说明 |

VS Code 设置示例：`"roo-cline.useAgentRules": true`（默认加载 AGENTS.md）。

---

## 心智模型：官方「成功用法」四条

1. **Leverage model agnosticism**：为不同任务试不同模型，别绑死一家。  
2. **Don't skimp on tokens**：强模型 + 足够上下文通常比省 token 更省开发者时间。  
3. **Trust roles**：用 Mode 约束边界，比在长 prompt 里反复叮嘱「不要改 xxx」更稳。  
4. **Be ambitious**：批准流程熟悉后逐步提高 Auto-Approve 范围，把大块 refactor 交给 agent 分步完成。

---

## 常见问题

**和 Cline 是什么关系？**  
Roo Code 与 [[cline]] 同源分支演进，架构相似（Task、MCP、侧边栏 agent），Roo 更强调 **多 Mode 产品化** 与 Profile/规则目录体系。学 Roo 等于学「Cline 系 agent」的典型实现。

**扩展停更后还能学吗？**  
能。仓库 archived 但代码与文档仍可读；社区 fork（ZooCode）延续功能。本笔记侧重**可迁移的概念**（Mode、Task、Tool、MCP、规则注入）。

**Auto-Approve 全开安全吗？**  
不建议一开始全开。应对 `execute_command`、MCP 写操作、生产配置路径保持批准；只读搜索可对信任仓库放宽。

**规则太多会爆 context 吗？**  
会。应用 `.roo/rules-{slug}/` 做**按模式裁剪**，避免把所有规范塞进每个 Task；大段文档可放 `docs/` 让 agent 用 `read_file` 按需读取。

**能否和 [[aider]] 一起用？**  
可以。Roo 在 IDE 里做多步探索与 MCP；Aider 在终端里做 Git 中心化编辑与自动 commit。注意别让两者同时改同一文件。

---

## 延伸资源

- 官方仓库：[RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code)（Apache-2.0，已归档）  
- 文档站：[Roo Code Docs](https://roocodeinc.github.io/Roo-Code/)（含 Modes、Custom Instructions、Provider 指南）  
- Marketplace：[Roo Code 扩展页](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)  
- 社区延续：[ZooCode](https://github.com/Zoo-Code-Org/Zoo-Code/)  
- 上游对照：[[cline]]  
- 终端结对：[[aider]]  
- 编辑器基座：[[vscode]]  

---

## 小结

Roo Code 把 VS Code 里的 AI 助手做成**可换岗的开发团队**：**Modes** 定义角色与工具边界，**Task** 驱动多轮 LLM + 工具循环，**`.roo/` 规则体系** 把团队规范写进仓库，**MCP** 接外部世界，**Checkpoints + 批准流** 控制风险。即使官方扩展已停更，其「模式化 agent + 模型无关 + 深度 IDE 集成」仍是零基础理解现代 coding agent 的绝佳样本——下一步可对照 [[cline]] 读 Task 源码，或用 ZooCode 继续在日常开发里实践。
