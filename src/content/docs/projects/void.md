---
title: Void — 开源 Cursor 替代
来源: https://github.com/voideditor/void
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：自己选供应商的「改装版 VS Code」

想象你有一辆很顺手的轿车（[[vscode]]），原厂加装了一套导航语音助手，但所有语音都要先经过厂商云端转录，路线偏好和对话记录也留在他们服务器上。有一天你换了一套**开源改装方案**：外壳还是那辆车——座椅、方向盘、扩展槽位全兼容——但语音模块改成**直连**你信任的供应商：OpenAI、Anthropic、本机 Ollama，或公司内网的兼容接口。你说的话和代码上下文**不经过中间商**；不满意 AI 改过的文件，还能像游戏存档一样**一键回滚到改之前**。

**Void 就是这辆「改装版 VS Code」。** 它是 [voideditor/void](https://github.com/voideditor/void) 仓库里的完整 IDE 源码（VS Code fork，Apache 2.0），由 YC 支持的 Glass Devtools 团队发起，定位是开源、透明的 [[cursor]] 替代。AI 能力不是外挂扩展，而是**写进编辑器内核**：Tab 补全、行内 Quick Edit（`Ctrl+K`）、侧边栏 Chat（`Ctrl+L`）、Agent / Gather 多步代理、LLM 改动 Checkpoint、MCP 工具接入等。官网：[voideditor.com](https://voideditor.com)。

> **重要现状（2026）**：官方 README 声明已**暂停**对本 IDE 仓库的主动维护，转向探索新方向；现有版本仍可运行，但部分功能可能随上游 API 变化而退化。选型时应把它当作「功能完整、更新放缓」的工具，而非快速迭代的商业 IDE。

---

## 这个项目解决什么问题

### 痛点 1：Cursor / Copilot 的数据路径不透明

商业 AI IDE 往往把你的 prompt 和代码片段经自有后端转发。Void 的设计原则是 **direct-to-provider**：请求从你本机直接打到所选 LLM 服务商，Void 不保留对话数据。适合对合规、内网部署、可审计链路有要求的团队。

### 痛点 2：想保留 VS Code 生态，又要 Agent 级能力

Void 是 **VS Code 完整 fork**，不是扩展拼装。主题、快捷键、`settings.json`、Marketplace 扩展、集成终端、Git、Remote SSH/WSL 等继承自上游。官方提供**一键迁移** VS Code / Cursor 配置，降低切换成本。

### 痛点 3：模型选择被单一厂商绑定

Void 支持 **Bring Your Own Key / Own Model**：OpenAI、Anthropic、Google、xAI、OpenRouter、DeepSeek、Qwen、Azure，以及本机 **Ollama**、vLLM 等。可为 Chat、Agent、Autocomplete、Quick Edit **分别指定不同模型**，在成本与质量之间拆开优化。

### 痛点 4：AI 改坏了难以撤销

Void 为 LLM 驱动的编辑维护 **Checkpoints（检查点）**：每次 AI 批量改动前可存档，改崩了从时间线回滚，而不必依赖 `git stash` 猜哪一步出错。这与 [[cline]] 的 checkpoint 理念相近，但集成在独立 IDE 而非扩展里。

### 痛点 5：开源模型缺少原生 tool calling

许多本地模型不支持 OpenAI 式 function calling。Void 在 changelog 中强调升级了 **tool-calling 实现**，使 R1、Gemma、GPT 4.1 等在 Agent / Gather 模式下也能跑多步工具流——这对「全本地 Agent」很关键。

---

## 核心概念拆解

### 1. VS Code Fork，而非扩展

Void 修改的是 `vscode` 本体。AI 相关代码主要集中在：

```text
src/vs/workbench/contrib/void/
```

这意味着补全、diff 预览、流式输出与编辑器生命周期深度耦合，延迟和 UI 一致性通常优于「编辑器 + 侧边栏插件」方案。代价是：**安装包体积大、自编译门槛高**（需 Node 20.18.2、平台原生构建链，见 `HOW_TO_CONTRIBUTE.md`）。

### 2. 四种交互形态

| 形态 | 快捷键 / 入口 | 做什么 |
|------|----------------|--------|
| **Tab Autocomplete** | `Tab` 接受建议 | FIM（Fill-in-the-Middle）补全，适合专用代码补全模型 |
| **Quick Edit** | `Ctrl+K` / `Cmd+K` | 选中代码 → 自然语言 → 行内 diff 应用 |
| **Chat** | `Ctrl+L` / `Cmd+L` | 对话、@ 文件/文件夹、建议改哪些文件 |
| **Agent / Gather** | Chat 面板切换模式 | Agent 可读写文件、终端、MCP；Gather **只读**探索仓库 |

**Gather Mode** 像「只带眼睛不带手的实习生」：能搜索、读文件、梳理依赖，**不能**改磁盘或跑破坏性命令——适合刚进陌生 monorepo 时摸底。

**Agent Mode** 则具备写文件、删文件、开终端（含后台持久终端）、调用 MCP 等能力，并可在编辑后尝试 **自动修 lint**。

### 3. Fast Apply 与 Search/Replace 块

早期 Apply 较慢；后续版本用 **Search/Replace 块**直接落地补丁，并对上千行文件优化 **Fast Apply**。在设置里可开 **auto-approve** 减少逐步确认，但新手建议先手动审查 diff。

### 4. Checkpoints

对 LLM 引起的工作区变更打检查点。与 Git 互补：Git 记录你认可的提交；Checkpoint 记录「某次 prompt 之前」的 IDE 状态，粒度更细，适合反复试 prompt。

### 5. FIM 与模型能力自动探测

Tab 补全走 **FIM API**（中间填空），不是把整文件塞进 chat completion。Void 会探测模型是否支持 FIM、tools、reasoning，并在设置里提示。本地实验推荐 `qwen2.5-coder` 等 coder 系列小模型做补全。

### 6. @file / @folder 上下文

在 Chat 输入框用 `@` 引用文件或目录，把路径与内容注入上下文（类似 Cursor 的 @ 语法）。Agent 结合 `@src/api/` 可缩小搜索范围，节省 token。

### 7. MCP（Model Context Protocol）

changelog 记载已支持 MCP，Agent 可挂外部工具（数据库、GitHub、搜索等）。与 [[cline]] 的 MCP Marketplace 不同，Void 侧更偏原生集成，具体服务器需在 Void 设置中按 MCP 规范配置。

### 8. 提供商与设置页

Void 有独立 **Void Settings** 面板（与 VS Code 通用设置并存），按厂商分 tab 填 API Key、Base URL、模型列表。Ollama 默认探测 `http://127.0.0.1:11434`；局域网带鉴权的 Ollama 可改用 **OpenAI-Compatible** 提供商填地址和 Key。

### 9. 与 Cline、Aider、Cursor 的定位

| 维度 | Void | [[cline]] | [[aider]] | Cursor |
|------|------|-----------|-----------|--------|
| 形态 | 独立 IDE（VS Code fork） | VS Code 扩展 | 终端 CLI | 商业 IDE |
| 数据路径 | 直连提供商 | BYOK，经扩展 | BYOK | 经 Cursor 后端 |
| 开源 | Apache 2.0 | Apache 2.0 | Apache 2.0 | 闭源 |
| 本地模型 | Ollama 原生 | Ollama 等 | 多种 | 有限 |
| 维护状态 | 暂停主动开发 | 活跃 | 活跃 | 活跃 |

可组合使用：日常在 Void 里写代码 + Agent，终端用 [[aider]] 做 Git 原子提交，或在 [[vscode]] 里装 Cline 做审批式多步任务。

### 10. 构建与分发

- **用户**：从 [voideditor.com](https://voideditor.com) 下载安装包（macOS / Windows / Linux）。
- **开发者**：`git clone` → `npm install` → `Cmd/Ctrl+Shift+B` 编译 → `./scripts/code.sh` 进 Developer Mode。
- **定制发行版**：维护者用 [void-builder](https://github.com/voideditor/void-builder)（VSCodium 系 pipeline）打正式包；自维护 fork 需自行跟进 VS Code 上游 rebase。

---

## 安装与首次配置

### 下载安装

1. 打开 [voideditor.com](https://voideditor.com) 下载对应平台安装包。
2. 首次启动可走 **Onboarding**：选择提供商（如 OpenRouter、Gemini）、填入 API Key、选默认 Chat 模型。
3. 若从 VS Code / Cursor 迁移，使用内置 **一键导入** 主题、键位、`settings.json`（具体入口随版本在欢迎页或设置中）。

### 本机 Ollama 快速路径

```bash
# 安装 Ollama 后拉取模型
ollama pull qwen2.5-coder:7b
ollama pull deepseek-r1:8b

# 确认服务监听
curl http://127.0.0.1:11434/api/tags
```

在 Void Settings → **Ollama** 点 **Refresh Models**，为 Chat / Agent / Autocomplete 分别选中模型。若列表为空，检查防火墙与 Ollama 是否已 `ollama serve`。

---

## 代码示例 1：Void Settings 多模型分工

下面是一份概念性的 `settings.json` 片段（键名随版本可能略有差异，以设置 UI 导出为准），演示 **Chat 用强模型、补全用小模型、Agent 用支持 tools 的模型**：

```json
{
  "void.provider.chat": "anthropic",
  "void.anthropic.apiKey": "${env:ANTHROPIC_API_KEY}",
  "void.anthropic.model": "claude-sonnet-4-20250514",

  "void.provider.agent": "openai",
  "void.openai.apiKey": "${env:OPENAI_API_KEY}",
  "void.openai.model": "gpt-4o",

  "void.autocomplete.provider": "ollama",
  "void.ollama.providerSettings": {
    "baseURL": "http://127.0.0.1:11434"
  },
  "void.ollama.model": "qwen2.5-coder:7b",

  "void.featureOptions": {
    "autoApprove": false,
    "fastApply": true
  }
}
```

**练习步骤：**

1. 用环境变量注入 Key，避免明文进 Git。
2. 打开 `Ctrl+L`，发一条只读问题确认 Chat 模型连通。
3. 切 **Gather**，`@package.json` 问「本项目有哪些 npm scripts」——应只回答、不改文件。
4. 在 `.ts` 文件里停顿打字，观察 Tab 补全是否来自 Ollama coder 模型。

---

## 代码示例 2：Quick Edit（Ctrl+K）改函数

假设 `src/math.ts` 中有：

```typescript
export function add(a: number, b: number) {
  return a + b;
}
```

1. 选中整个 `add` 函数。
2. 按 `Ctrl+K`（macOS：`Cmd+K`）。
3. 输入 prompt：

```text
改为支持可变参数求和；参数为空时返回 0；保留 TypeScript 类型并加 JSDoc。
```

4. Void 在行内流式显示 diff；满意则 Accept，不满意 Reject 或继续追问。
5. 若启用了 Checkpoint，可在改动前存档，便于对比 AI 版本与手写版本。

**期望结果示意：**

```typescript
/**
 * 对任意个数字求和；无参数时返回 0。
 */
export function add(...nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0);
}
```

---

## 代码示例 3：Agent Mode 小任务与终端

场景：在空目录的 Node 项目里初始化 `GET /health`。

在 Chat（`Ctrl+L`）切换到 **Agent**，输入：

```text
@package.json
如果还没有 package.json 就初始化一个最小 TypeScript 项目。
然后创建 src/server.ts，用原生 http 监听 3000，提供 GET /health 返回 JSON：
{ "status": "ok", "uptime": <秒数> }。
写完用 node 或 tsx 运行并 curl 验证。有 lint 报错请自行修复。
```

Agent 典型步骤（需按提示批准，除非开启 auto-approve）：

```text
[Tool] write_file package.json
[Tool] write_file src/server.ts
[Tool] run_terminal npm install -D typescript tsx @types/node
[Tool] run_terminal npx tsx src/server.ts
[Tool] run_terminal curl -s http://localhost:3000/health
```

若使用 **较弱的本机 Ollama 模型**，社区 issue 反馈可能出现「建议只在聊天里、Apply 不落地」——换更大 coder 模型或云端 API 通常可缓解；这是暂停维护期需要自行踩坑的点。

---

## 代码示例 4：OpenAI-Compatible 接局域网 Ollama

当 Ollama 部署在 LAN 且需要 API Key 时，官方 issue 建议走 **OpenAI-Compatible** 而非 Ollama 原生 tab：

```json
{
  "void.provider.chat": "openai-compatible",
  "void.openai-compatible.apiKey": "your-lan-api-key",
  "void.openai-compatible.providerSettings": {
    "baseURL": "http://192.168.1.50:11434/v1"
  },
  "void.openai-compatible.model": "qwen2.5-coder:7b"
}
```

保存后重启 Chat，发 `ping` 测试；若报 `contents.parts must not be empty` 类错误，多半是兼容层与 Gemini 式请求体不匹配，可换 vLLM / LiteLLM 做统一代理。

---

## 常用快捷键速查

| 操作 | Windows / Linux | macOS |
|------|-----------------|-------|
| 打开 Chat | `Ctrl+L` | `Cmd+L` |
| 行内 Quick Edit | `Ctrl+K` | `Cmd+K` |
| 接受补全建议 | `Tab` | `Tab` |
| 重载开发者窗口 | `Ctrl+R` | `Cmd+R` |
| 命令面板 | `Ctrl+Shift+P` | `Cmd+Shift+P` |

---

## 从零学习路径建议

1. **第 1 天**：安装正式包 → 导入原 VS Code 配置 → 配一个云端模型完成 `Ctrl+L` 问答。
2. **第 2 天**：装 Ollama → 分离 Chat 与 Autocomplete 模型 → 体验 `Ctrl+K` 小改。
3. **第 3 天**：用 **Gather** 读陌生仓库；用 **Agent** 完成单文件小功能；练习 Checkpoint 回滚。
4. **第 4 天**：配置 MCP 服务器（如 filesystem、GitHub），让 Agent 调外部工具。
5. **进阶**：读 `VOID_CODEBASE_GUIDE.md`，`Cmd+Shift+B` 跑 Developer Mode，改 `contrib/void` 下 UI 或提供商适配。

---

## 优势与局限

### 优势

- **开源可审计**：完整 fork 源码，可自建发行版（void-builder）。
- **隐私与直连**：无强制专有后端，适合 BYOK 与内网模型。
- **VS Code 兼容**：扩展与习惯可延续，切换成本低于全新 IDE。
- **能力栈完整**：补全 + 行内编辑 + Chat + Agent + Checkpoint + MCP 一条龙。
- **本地友好**：Ollama 自动发现、FIM 补全、非原生 tool 模型的 Agent 适配。

### 局限

- **维护暂停**：新模型、新 API、安全补丁需社区或自维护 fork 跟进。
- **编译重**：自改源码需 VS Code 级构建环境，机器与时间都不少。
- **本地 Agent 不稳定**：小模型 + Fast Apply 在 issue 中多次报告不落地，需调模型与设置。
- **生态分裂**：与 Cursor 的 Composer、Rules、Cloud Agent 等不会自动对齐。
- **文档分散**：以 GitHub、Discord、changelog 为主，不如商业产品文档系统化。

---

## 与其他工具怎么选

- 要 **闭源省心 + 最强集成**：继续用 Cursor 或 Windsurf。
- 要 **留在 VS Code + 审批式 Agent**：[[cline]] 扩展更活跃。
- 要 **终端 Git 工作流**：[[aider]] 更轻。
- 要 **开源 IDE + 直连 API + 本地模型 + VS Code 外壳**：Void 仍是类别里完成度很高的选择，但需接受**更新放缓**，必要时 fork 自维护。

---

## 参考链接

- 源码与 README：[github.com/voideditor/void](https://github.com/voideditor/void)
- 官网与下载：[voideditor.com](https://voideditor.com)
- 更新日志：[voideditor.com/changelog](https://voideditor.com/changelog)
- 代码库导读：`VOID_CODEBASE_GUIDE.md`
- 贡献与编译：`HOW_TO_CONTRIBUTE.md`
- 发行构建：[github.com/voideditor/void-builder](https://github.com/voideditor/void-builder)
- 社区： [Discord](https://discord.gg/RSNjgaugJs) · 邮件 hello@voideditor.com

---

## 小结

Void 把「AI 结对编程」做成了**可自托管、可换引擎的 VS Code 发行版**：你掌握 API Key、模型与数据路径，编辑器提供 Tab 补全、行内快改、Chat、只读 Gather、可写 Agent、改动 Checkpoint 和 MCP。零基础上手只需会装 VS Code 系 IDE、会配一个 LLM 提供商；真正要花心思的是**按场景拆模型**和**在维护暂停时代替自己验证 Agent 可靠性**。若你重视透明与本地优先，Void 值得试；若你依赖最新商业功能，应并行关注 [[cline]]、Cursor 等仍在快速迭代的方案。
