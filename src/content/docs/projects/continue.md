---
title: "Continue — IDE 内 AI 助手的另一种实现"
description: 同样是 agent，CLI（cn 命令）+ VSCode/JetBrains 扩展 + CI 集成的"开源对照"路线
sidebar:
  order: 26
  label: "continuedev/continue"
---

> continuedev/continue v1.2.22-vscode（2026-03 发布），Apache 2.0。
> 33.4k stars，TypeScript 84.4% + Kotlin（JetBrains）+ Rust（binary）。
>
> Continue 是 [Claude Code](/study/projects/claude-code/) 的**开源对照**——
> 同样的问题（agent + tool use + IDE 集成），不同的判断（开源 + 多 IDE + CI 集成）。
>
> 把它和 Claude Code 对照看，能学到"产品定位的判断怎么做"。
> Season 4 收尾。

## 一句话定位

**Continue = 一个 agent core + VSCode/JetBrains 扩展 + `cn` CLI + CI 集成。**
与 Claude Code 不同：**它是开源的、跨多 IDE、原生支持 PR 审查 + GitHub Actions**。

## Why（为什么是它而不是 Claude Code / Cursor / Copilot / Cline）

[Claude Code 笔记](/study/projects/claude-code/) 已经把 agentic 工具领域的格局展开了。
Continue 的独特定位：

| 工具 | 开源 | 多 IDE | CI 集成 | 核心形态 |
|---|---|---|---|---|
| Cursor | ✗ | fork VSCode | ✗ | IDE-first |
| Copilot | ✗ | VSCode + JetBrains | ✗ | inline 建议 |
| Claude Code | ✗（runtime） | CLI + IDE 集成 | 有限 | CLI-first |
| Cline | ✓ | VSCode 插件 | ✗ | VSCode-only |
| **Continue** | **✓** | **VSCode + JetBrains + CLI** | **原生 + Actions** | **多形态** |

**Continue 的判断分水岭**：

1. **完全开源**——Apache 2.0，不绑任何模型厂商
2. **多形态**：VSCode 扩展 + JetBrains 插件 + CLI（`cn`）+ GitHub Action
3. **原生 CI 集成**——`.continue/checks/*.md` 把 AI 评审写成 source-controlled 的 status check
4. **配置即代码**——配置在 markdown / YAML 文件里，git 管理
5. **"agent 审查 PR"**——Continue 的旗舰用例就是"AI 在 PR 上跑评审，作为 CI status check"

**为什么不是 Claude Code**：Claude Code 闭源 + 锁 Anthropic 模型。如果你的团队
合规要求开源 / 自托管 / 用其他模型——Claude Code 不能用，Continue 可以。

**为什么不是 Cursor**：Cursor 强在"IDE 内体验"，但 fork VSCode 让它**长期跟 VSCode 演化跑**。
Continue 是 VSCode 插件——VSCode 升级它跟着升级。

**为什么不是 Cline**：Cline 是 Continue 的子集（只做 VSCode、做 chat / agent）。
Continue 多了 JetBrains、CLI、CI 集成。

**Continue 的代价**：
- **多形态意味着每种都不极致**——不像 Cursor 在 VSCode 内做到精致
- **开源治理需要时间** ——版本碎片化（核心 v1.0、扩展 v1.2、CLI v1.x）
- **大企业用例验证少**——Claude Code 已是 Anthropic 内部使用

## 仓库地形

```
continue/
├── core/                          ← 核心 agent 逻辑（TS）
├── extensions/
│   ├── vscode/                    ← VSCode 扩展
│   └── intellij/                  ← JetBrains 扩展（Kotlin）
├── gui/                           ← 共享 UI 组件（webview 内）
├── packages/                      ← 模块化组件
│   ├── llm-info/                  ← provider info
│   ├── pearai-server-client/
│   └── ...
├── binary/                        ← cn CLI 二进制（Rust）
├── actions/                       ← GitHub Actions workflows
├── skills/                        ← 类似 Claude Code 的 skill 概念
└── docs/
```

**心脏文件区域**：

- `core/`——agent loop / context selection / tool calling
- `extensions/vscode/src/`——VSCode 集成（typescript）
- `extensions/intellij/src/`——JetBrains 集成（Kotlin，跨 IDE 必看）

注意：因 Continue 仓库巨大（21000+ commits），克隆和精读成本高。
**这一篇笔记的重点是产品判断对照，不是源码精读**。

## 核心机制 · 设计判断分析

### 机制 1 · 多 IDE 通过共享 core 实现

Continue 的核心架构（推断 + 公开资料）：

```
┌─────────────────────────────────────────┐
│             agent core (TS)             │
│  generate / stream / tools / context    │
└──────────────┬──────────────────────────┘
               │
   ┌───────────┼───────────┬──────────────┐
   ↓           ↓           ↓              ↓
VSCode      JetBrains      CLI         Action
扩展(TS)    插件(Kotlin)   (Rust)       (CI)
```

**判断**：把 LLM agent 逻辑做成可移植 core，让每个 IDE 只做"集成层"——
访问编辑器 API、UI 渲染、键盘快捷键。

→ **类比 LSP**：Language Server Protocol 把 IDE 和 language server 解耦。
Continue 把 IDE 和 AI agent 解耦。**同样的工程哲学**。

### 机制 2 · `.continue/checks/*.md` —— 配置即源码

```markdown
<!-- .continue/checks/security-review.md -->
---
trigger: pull_request
description: Reviews PR for security issues
---

You are a security expert. Review this PR for:
- SQL injection vulnerabilities
- XSS issues
- Secret leakage in logs
- Auth bypass

Output your findings as inline diff comments.
```

把这个 markdown 提交到 git，CI 自动跑——**AI review 是 source-controlled 的、可 review 的**。

→ 这个判断很有意思：**AI 行为不应该是黑盒**。把 prompt 写在仓库里，
所有人能读、能改、能 PR——这是 LLM 时代的"基础设施即代码"。

### 机制 3 · 多模型兼容

Continue 不绑模型厂商。配置文件支持：

```yaml
# config.yaml
models:
  - title: Claude
    provider: anthropic
    model: claude-opus-4-7
  - title: GPT-4
    provider: openai
    model: gpt-4o
  - title: Local
    provider: ollama
    model: llama3
```

任何 OpenAI 兼容 API、Ollama、自托管 LLM 都能接。
**与 Claude Code 锁 Anthropic 完全相反的判断**。

→ 这是开源项目的天然优势：**不需要为商业利益绑定一个厂商**。

### 机制 4 · CLI（`cn` 命令）—— 把 IDE 体验带到终端

```bash
cn chat "explain this codebase"
cn review --path src/
cn run skill code-review
```

类似 Claude Code 的 CLI 模式，但**完全开源**。

如果你想要 "Claude Code 体验 + 开源 + 自定义模型"——`cn` 是答案。

### 机制 5 · Skills —— 复用 Claude Code 的概念

Continue 也有 skills 概念（仓库里有 `skills/` 目录）。和 Claude Code 的 skill 大体兼容——
description + 内容 + 可选脚本。

→ **生态收敛**：MCP / skill / agent / tool use——这些概念在跨厂商收敛中。
开源工具吸收闭源工具的好设计，闭源工具借鉴开源工具的灵活——**整个 LLM 工具领域在收敛**。

## 横向对比

### vs Claude Code — 开源 vs 闭源、多 IDE vs CLI-first

最直接的对比维度：

| 维度 | Claude Code | Continue |
|---|---|---|
| 开源 | ✗ | ✓ |
| 模型 | 主用 Anthropic | 任何（多 provider） |
| 形态 | CLI + IDE 集成 | VSCode + JetBrains + CLI |
| Memory | 跨 session markdown | 部分（演化中） |
| Hooks | 完整 | 部分 |
| Skills | 完整 | 部分 |
| MCP | 完整 | 完整 |
| CI 集成 | 部分 | **核心用例** |

**判断**：

- 你重视**产品体验**、信任 Anthropic、不要求开源 → Claude Code
- 你需要**开源**、多 IDE / 模型 / CI 灵活 → Continue
- 你做 AI PR review → Continue（旗舰用例）
- 你做交互式 coding → Claude Code（更成熟）

### vs Cursor — IDE 内 vs 跨 IDE

Cursor 把 AI 完美嵌入 VSCode（fork）。
Continue 在 VSCode 内做扩展，体验略弱但**不锁定 VSCode 版本**。

我的判断：**Cursor 在 VSCode 内更精致，Continue 在生态广度上更胜**。

### vs Cline — 同生态位的开源

Cline = VSCode 内开源 agent。功能上 Continue 是超集——多 IDE、CLI、CI。

如果你只用 VSCode + 只要 chat —— Cline 更轻。
否则 Continue 更全。

## Hands-on（10 分钟内能跑）

```bash
# 装 VSCode 扩展
# 在 VSCode 里搜 "Continue"，安装 continuedev.continue

# 配置（VSCode 命令面板：Continue: Open config）
# config.yaml 加：
# models:
#   - title: Claude
#     provider: anthropic
#     model: claude-opus-4-7
#     apiKey: sk-...

# 用：选中代码 → Cmd+L → 提问

# 装 CLI
npm install -g @continuedev/cli
cn --version
```

```bash
cn chat
> 解释 src/main.ts 的核心逻辑
```

### 改一处的实验（必做）

写一个 `.continue/checks/lint.md`：

```markdown
---
trigger: pull_request
description: lint check using LLM
---

Review changes for:
- console.log left in production code
- TODO comments without tracking issues
- Missing error handling in async functions
```

push 到 GitHub，开 PR——**Continue Action（如果配了）会跑这个 check 当 status check**。
理解"AI checks as code"是什么体感。

第二个实验：在 VSCode 用 Continue chat 问"我这个 React 组件有什么改进空间"——
体感对比 Cursor / Copilot Chat。

## 与你工作的连接

**能立刻迁移**：

- 公司**不允许 Claude Code**（合规）→ Continue 是开源替代
- 团队混用 VSCode + IntelliJ → Continue 跨 IDE 优势凸显
- 想给项目加 AI PR review → Continue 是事实标准

**下个月可能用到**：

- 给开源项目加 AI security review check
- 团队 IDE 工具标准化用 Continue（不强制 VSCode 也不强制订阅）
- 自托管 LLM（Ollama）+ Continue 做"完全自主 agent"

**不要用 Continue 的部分**：

- **个人最深度的 coding 助手**——Claude Code 集成度更高
- **想要 Cursor 那种 inline 编辑流畅度**——Continue 不是 IDE fork，体验略弱
- **多 IDE 不是你的需求**—— 单 IDE 用 Cursor / Cline 更专注

## 读完你能做之前做不了的事

- **判断**：选 AI coding tool 时，能多维度评估（开源 / IDE / 模型 / CI / 体验）
- **设计**：写 LLM agent 时，思考"我的 core 能不能跨 IDE / CLI / CI 复用"
- **解释**：被问"AI tools 这么多怎么选"时，能给出基于产品定位的回答
- **下钻**：看懂 Continue 的 core 模块，理解多 IDE 集成的架构挑战
- **对照**：识别"开源 vs 闭源"在 AI 工具领域的真实代价（不是技术，是治理）

## 自检 · 5 个问题

1. Continue 完全开源 vs Claude Code 闭源——开源对产品长期演化的好处和坏处分别是什么？
2. 多 IDE 支持是优势但分散精力。Cursor 选 fork VSCode 集中资源——长期哪个会赢？
3. `.continue/checks/*.md` 把 AI prompt 当源码管。**为什么这是关键设计**？普通 LLM 工具藏 prompt 有什么问题？
4. CLI（cn）+ IDE 扩展并存。这种"双形态"会不会让用户混乱？怎么设计 UX 让它们协同？
5. Continue 不绑模型——任何模型可接。但实际上不同模型的 tool use 协议差异大。
   写一个判断框架："什么模型适合什么工具"。

## 延伸阅读

读完这篇笔记后下一步：

1. **Continue 官方文档**（[docs.continue.dev](https://docs.continue.dev)）
2. `core/` 模块源码——agent loop 和 Claude Code 同思路
3. `extensions/intellij/`——Kotlin 实现的另一面，看跨 IDE 集成的真实成本
4. `actions/` —— GitHub Actions 集成实现
5. **Cline 源码**（[cline/cline](https://github.com/cline/cline)）——同生态位的另一种实现

---

**笔记完成**：2026-05-27（v1.2.22-vscode）
**研究方法**：WebFetch 公开资料 + 设计判断对照分析（不本地克隆）
**心脏文件**：`core/` + `.continue/checks/*.md` 配置形态
