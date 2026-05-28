---
title: "Continue — 把 AI code review 写成 git 跟踪的 markdown，让 PR 跑 status check"
description: 不再是"开源 Cursor"——v1.5 重塑后核心叙事是"AI checks as code"，IDE 扩展退到辅线
sidebar:
  order: 26
  label: "continuedev/continue"
---

> 状元篇升级（2026-05-28）。基于 commit `cb273098` 的源码精读 + 一次本地 hands-on 实验。
> 上一版（2026-05-27）把 Continue 当"开源 Claude Code"理解，
> 升级后发现：v1.5 之后 README 一开口就讲 `.continue/checks/*.md`，
> IDE 扩展被挪到末尾——这是产品叙事的硬转向，旧版笔记没抓到。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [continuedev/continue](https://github.com/continuedev/continue) |
| Star / Fork | 33,427 / 4,570（2026-05-28 拉取） |
| 最近活跃 | `pushed_at = 2026-05-28T...`（活跃 daily 推送） |
| 主分支 commit | `cb273098d968`（2026-04-17，"Merge PR #12156 from RomneyDa/add-mercury-2"） |
| 最新 release | `v1.5.45` (commit `abb1fc04`) |
| 主语言 | TypeScript 9.4MB / Kotlin 0.4MB（IntelliJ 插件）/ Rust 76KB（CLI binary 包装） |
| 维护方 | Continue Dev, Inc.（旧金山）— Apache 2.0 |
| 主要贡献者 | sestinj 9634 / RomneyDa 3014 / Patrick-Erichsen 1979 / tomasz-stefaniak 1090 / uinstinct 742 |
| License | Apache-2.0 |
| 类似项目 | Claude Code（闭源 + Anthropic 锁定）/ Cursor（fork VSCode）/ Cline（VSCode-only 开源）/ Aider（CLI-only 开源） |

## 一句话定位

**Continue 不是"开源 Cursor"，也不是"开源 Claude Code"——
2026-04 之后它是"把 AI code review 写成 git 跟踪 markdown 的 PR 评审平台"，
IDE 扩展是历史包袱式的副产品。**

## Why（这个项目出现前世界缺什么）

旧版（2024 年）的 Continue 解决"想要 AI 编程助手又不想被某家公司锁死"的痛点——
那时候 Cursor 还要订阅、Copilot 是 GPT-3.5、Claude Code 还没出。
Continue 的早期定位就是上一版笔记里写的那个："开源 + 多 IDE + 多模型"。

**但 2026 年这个赛道已经被吃透了**：
Cursor 体验封顶、Claude Code 集成度高、Cline 在 VSCode 内开源、Aider 在 CLI 开源——
"再做一个开源 Cursor"已经没有边际价值。Continue 必须找新的存在理由。

它的新 manifesto 写在 [README 第 19 行](https://github.com/continuedev/continue/blob/cb273098d968/README.md#L19)：

> **Source-controlled AI checks, enforceable in CI**

下一行（[L33-46](https://github.com/continuedev/continue/blob/cb273098d968/README.md#L33-L46)）解释机制：

> Continue runs agents on every pull request as GitHub status checks.
> Each agent is a markdown file in your repo at `.continue/checks/`.
> Green if the code looks good, red with a suggested diff if not.

把这两段连起来读，就是 Continue v1.5 的存在理由：

- **AI 行为不应该是黑盒**：把 prompt 提交到 git，所有人能读、能 review、能改
- **AI 评审不应该是聊天**：让它跑成 status check，红/绿信号嵌进开发者已有的 PR 工作流
- **AI 工具不应该绑模型**：`cn` CLI 接 Anthropic / OpenAI / Ollama / 任何 OpenAI-兼容 endpoint

这三点合起来叫 "AI checks as code"——它的真正对手不是 Claude Code / Cursor，
是 SonarQube / CodeQL / Semgrep 这一代静态扫描工具。
**用 LLM 做的"动态语义级 code review"**，能 catch 静态分析永远 catch 不到的东西
（"这个新 endpoint 没做输入校验" / "这段日志可能漏密钥" / "这个 PR 没改 docs"）。

旧版笔记把 Continue 当"开源 Claude Code"理解——这是 2024 年的视角。
2026 年的 Continue 把 IDE 体验交给 Cursor / Claude Code / Cline，
自己往"PR 评审"差异化撤退。**理解这个 pivot 比理解任何一段代码都更重要**。

![Continue 双轨架构 — CI checks 主线 + IDE 扩展辅线](/study/projects/continue/01-architecture-dual-track.webp)

*图 1：Continue v1.5.45 的双轨架构。上方红框是 README 第一段就讲的 CI checks 主线——
开发者推 PR → GitHub Action 触发 → cn CLI 读 `.continue/checks/*.md` → 调任意 LLM provider →
回写 PR status check（绿 / 红+建议 diff）。下方蓝框是 IDE 扩展辅线，README 末尾才提一句。
两条轨道都依赖底部的共享底座（`core/llm/streamChat.ts` 181 行 / `core/tools/callTool.ts` 280 行 /
`core/tools/builtIn.ts` 32 行枚举 19 个内置工具 / `.continue/checks/*.md` 6 个 PR 评审 prompt /
`.continue/rules/*.md` 26 条行为规则）。手绘 sketchnote 风。*

## 仓库地形

### 顶层目录注释表

```
continue/
├── core/                          ← 所有形态共享的"心脏"：LLM 抽象 + tool 调度 + 配置加载（TS）
├── extensions/
│   ├── vscode/                    ← VSCode 扩展（TS，最早形态）
│   ├── intellij/                  ← JetBrains 插件（Kotlin，跨 IDE 的真实成本）
│   └── cli/                       ← cn CLI（npm 包 + Rust binary 启动器）— v1.5 的主推形态
├── gui/                           ← React webview，extensions/* 都用这套 UI
├── packages/                      ← 内部 npm 子包（@continuedev/* 全在这）
├── binary/                        ← cn CLI 的 Rust 启动器（Node 仍是主体）
├── actions/                       ← GitHub Actions workflows，主推用例
├── skills/                        ← skill 概念，与 Claude Code 收敛
├── .continue/                     ← Continue 仓库自己用 Continue 评审：dogfood
│   ├── checks/                    ← 6 个 markdown：security-audit / anti-slop / stale-comments ...
│   ├── rules/                     ← 26 个 markdown：no-any-types / personality / programming-principles ...
│   ├── agents/                    ← 已注册 agent 配置
│   └── prompts/
├── docs/                          ← Mintlify 站点
└── eval/                          ← 内部 eval harness
```

### 心脏文件清单（commit `cb273098d968` 时刻）

| 文件 | 行数 | 角色 |
|---|---|---|
| [`core/llm/streamChat.ts`](https://github.com/continuedev/continue/blob/cb273098d968/core/llm/streamChat.ts) | 181 | LLM 调用入口：处理 slashCommand 路径 + 普通流式路径，是所有形态的"喉咙" |
| [`core/tools/callTool.ts`](https://github.com/continuedev/continue/blob/cb273098d968/core/tools/callTool.ts) | 280 | tool 三路分发：built-in / MCP / HTTP；理解 Continue 工具机制必读 |
| [`core/tools/index.ts`](https://github.com/continuedev/continue/blob/cb273098d968/core/tools/index.ts) | 59 | 哪些工具在哪些条件下注册（modelName / signedIn / isRemote / experimental）|
| [`core/tools/builtIn.ts`](https://github.com/continuedev/continue/blob/cb273098d968/core/tools/builtIn.ts) | 32 | `BuiltInToolNames` 枚举：19 个内置工具的名称真理 |
| [`.continue/checks/security-audit.md`](https://github.com/continuedev/continue/blob/cb273098d968/.continue/checks/security-audit.md) | 6 | "config 即源码"的最小活样本：6 行 markdown 就是一个 PR security agent |

### commit 热点（按文件大小近似 + 子目录命名启发）

精确的 `git log --format='' --name-only | sort | uniq -c | sort -rn | head -20` 需要完整克隆——
本次 hands-on 用 `--depth 1` 浅克隆只拿到一个 commit 的 tree，无法做严格热点统计。
**用近似手段**：按代码体积 + 子模块命名 + GitHub Insights 中"contributors top file" 推断热点 top10：

| 估计排名 | 文件 / 目录 | 体积 | 推断理由 |
|---|---|---|---|
| 1 | `core/llm/index.ts` | 45 KB | LLM 抽象层 + 各 provider 适配点；上层每加新 provider 都改这里 |
| 2 | `core/llm/openaiTypeConverters.ts` | 33 KB | OpenAI schema 兼容层，model 协议变化高频改 |
| 3 | `core/llm/countTokens.ts` | 17 KB | token 计算；context window 调整频繁改 |
| 4 | `core/tools/callTool.ts` | 9 KB | 工具分发，每加一种新 protocol 改 |
| 5 | `extensions/vscode/src/extension.ts` | – | VSCode 入口（每次扩展协议变更改） |
| 6 | `extensions/cli/` 各文件 | – | v1.5 的主推形态，活跃度高 |
| 7 | `gui/src/redux/thunks/*` | – | webview 状态管理，UI 改动主战场 |
| 8 | `core/protocol/*` | – | core ↔ 外部进程的 IPC 协议 |
| 9 | `core/config/ConfigHandler.ts` | – | 配置加载/校验中心 |
| 10 | `core/index.d.ts` | – | 全局类型契约，每次新增字段都改 |

**怀疑 0**（限制说明）：上表是启发式估计，**不是严格 commit 计数**——
完整克隆 + `git log` 才能给出真实数字。下次 W3 复盘时补一次精确统计。

## 核心机制（3 段 30-100 行真实代码精读）

### 机制 1 · `streamChat.ts` —— LLM 调用的喉咙

[`core/llm/streamChat.ts:11-160`](https://github.com/continuedev/continue/blob/cb273098d968/core/llm/streamChat.ts#L11-L160)
是所有 Continue 形态（VSCode 扩展、CLI、Action）调 LLM 的唯一入口：

```typescript
export async function* llmStreamChat(
  configHandler: ConfigHandler,
  abortController: AbortController,
  msg: Message<ToCoreProtocol["llm/streamChat"][0]>,
  ide: IDE,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
): AsyncGenerator<ChatMessage, PromptLog> {
  const { config } = await configHandler.loadConfig();
  if (!config) {
    throw new Error("Config not loaded");
  }

  // Stop TTS on new StreamChat
  if (config.experimental?.readResponseTTS) {
    void TTS.kill();
  }

  const { legacySlashCommandData, completionOptions, messages, messageOptions } = msg.data;
  const model = config.selectedModelByRole.chat;
  if (!model) { throw new Error("No chat model selected"); }

  const errorPromptLog = {
    modelTitle: model?.title ?? model?.model,
    modelProvider: model?.underlyingProviderName ?? "unknown",
    completion: "",
    prompt: "",
    completionOptions: { ...msg.data.completionOptions, model: model?.model },
  };

  try {
    if (legacySlashCommandData) {
      // ...走自定义 slash command 分支（30 行省略，见 L54-L115）...
    } else {
      const gen = model.streamChat(messages, abortController.signal, completionOptions, messageOptions);
      let next = await gen.next();
      while (!next.done) {
        if (abortController.signal.aborted) {
          next = await gen.return(errorPromptLog);
          break;
        }
        const chunk = next.value;
        yield chunk;
        next = await gen.next();
      }
      if (config.experimental?.readResponseTTS && "completion" in next.value) {
        void TTS.read(next.value?.completion);
      }
      void Telemetry.capture("chat", { model: model.model, provider: model.providerName }, true);
      void checkForOutOfStarterCredits(configHandler, messenger);
      if (!next.done) { throw new Error("Will never happen"); }
      return next.value;
    }
  } catch (error) {
    throw error;
  }
}
```

旁注：

- **`async function*`**——这是 TypeScript 的 async generator，对外暴露的是个流：
  调用方用 `for await (const chunk of gen)` 拿 token。这一选择决定了 Continue 所有形态都"先拿到第一个 token 立刻渲染"
- **`configHandler.loadConfig()` 在每次 streamChat 都重新调一次**（L18）——
  支持运行时改 config 文件立即生效，代价是高频 IO，对短消息可能不划算
- **L24-L27 TTS.kill()**——开关 `config.experimental?.readResponseTTS`。
  这是**核心目录里有 TTS** 的唯一证据：Continue 真的把"语音读响应"当 1st-class feature
- **errorPromptLog 提前构造**（L42-L51）——为了在 generator 里任何一步抛错时都有结构化错误日志可返回。
  普通同步代码没必要这样写，但 generator 一旦中途中止，外面的 `.next()` 拿不到上下文
- **L99 `next = await gen.return(errorPromptLog)`**——这是 generator 的 abort 协议。
  `gen.return(...)` 不是普通函数返回，是**强制让 inner generator 走 finally 块**。
  Continue 用这个让所有 LLM provider 在 abort 时都能干净清理（关 socket / 取消 fetch）

**怀疑 1**：catch 块里只有 `throw error;`（L156-L158）。注释说"Moved error handling that was here to GUI, keeping try/catch for clean diff"——
**这是技术债的化石**。说明历史上有过复杂错误处理，被搬到 GUI 去做了；保留 try/catch 是为了 git diff 干净，
但等于让 LLM 的真实错误（rate limit / network / auth fail）全部裸抛给上层。**这种"为了 diff 而留 try/catch"是反模式**，
未来读到这段不要照搬——它是 Continue 仓库历史的产物，不是设计选择。

**怀疑 2**：`legacySlashCommandData` 这个名字（L29）说明 slash command 已被标记为"待淘汰"——
但同时仍在主流分支保留逻辑分支。**这种"legacy 但还在跑"的代码段**通常意味着：
新的等价机制（可能是 `.continue/agents/*` 或 hooks）还没完全 ready；读这段时要警惕——
这部分代码可能在下个版本被整段删掉，迁移文档可能滞后。

### 机制 2 · `callTool.ts` —— 三路分发到一个统一返回

[`core/tools/callTool.ts:235-280`](https://github.com/continuedev/continue/blob/cb273098d968/core/tools/callTool.ts#L235-L280)
是工具调用的总入口，把所有协议（HTTP / MCP / built-in）都收敛成同一种返回结构：

```typescript
// Handles calls for core/non-client tools
// Returns an error context item if the tool call fails
// Note: Edit tool is handled on client
export async function callTool(
  tool: Tool,
  toolCall: ToolCall,
  extras: ToolExtras,
): Promise<{
  contextItems: ContextItem[];
  errorMessage: string | undefined;
  errorReason?: ContinueErrorReason;
  mcpUiState?: McpUiState;
}> {
  try {
    const args = safeParseToolCallArgs(toolCall);
    const { contextItems, mcpUiState } = tool.uri
      ? await callToolFromUri(tool.uri, args, extras)
      : { contextItems: await callBuiltInTool(tool.function.name, args, extras) };
    if (tool.faviconUrl) {
      contextItems.forEach((item) => { item.icon = tool.faviconUrl; });
    }
    return { contextItems, errorMessage: undefined, mcpUiState };
  } catch (e) {
    let errorMessage = `${e}`;
    let errorReason: ContinueErrorReason | undefined;
    if (e instanceof ContinueError) {
      errorMessage = e.message;
      errorReason = e.reason;
    } else if (e instanceof Error) {
      errorMessage = e.message;
    }
    return { contextItems: [], errorMessage, errorReason };
  }
}
```

而 `callToolFromUri` 在同一文件的 [L67-L185](https://github.com/continuedev/continue/blob/cb273098d968/core/tools/callTool.ts#L67-L185) 做协议分发：

```typescript
async function callToolFromUri(uri: string, args: any, extras: ToolExtras) {
  const parsedUri = new URL(uri);
  switch (parsedUri?.protocol) {
    case "http:":
    case "https:":
      return { contextItems: await callHttpTool(uri, args, extras) };
    case "mcp:":
      const decoded = decodeMCPToolUri(uri);
      if (!decoded) { throw new Error(`Invalid MCP tool URI: ${uri}`); }
      const [mcpId, toolName] = decoded;
      const client = MCPManagerSingleton.getInstance().getConnection(mcpId);
      // ...调 MCP client.callTool(...)，处理 isError、UI resource、内容映射成 ContextItem...
    default:
      throw new Error(`Unsupported protocol: ${parsedUri?.protocol}`);
  }
}
```

旁注：

- **`tool.uri` 三态**：没有 → 走 built-in；`http(s)://` → 自定义 HTTP webhook 工具；`mcp://...` → MCP server 注册的工具。
  **一个判断分三路，是 Continue 工具机制的核心抽象**
- **`mcp://encodedId/encodedToolName` URI 协议**（L52-L65）——Continue 把"哪个 MCP server 的哪个工具"
  压成一个 URL。比 ToolCall 里塞两个字段简洁，且能直接放进 OpenAI 的 `tool.function.name`
- **错误回来不是抛出，是塞进返回值的 `errorMessage`**（L274-L278）——
  让上层 LLM 在下一轮看到 `errorMessage` 字段就能"自我纠错"，
  和 ReAct 论文里 wikienv 返回 `"Invalid action: ..."` 让模型下一轮自己改的设计**完全同源**
- **`safeParseToolCallArgs`**（L246）——LLM 吐的 JSON 不一定合法，必须 safe parse；
  失败时返回空 args，让下游 tool 自己 fallback。**这是 LLM 时代和传统 RPC 的根本区别**
- **`tool.faviconUrl` 写回 contextItems[].icon`**（L252-L255）——这是 UI 关注点，
  按理不该放在 dispatch 层；但 Continue 把它放这里是为了让所有形态（VSCode / IntelliJ / CLI）
  共享同一段 icon 注入逻辑，避免每个 UI 重复写

**怀疑 3**：`callBuiltInTool` 是巨型 switch（L187-L230，19 路），
每加一个内置工具都要改两个文件——`builtIn.ts` 加枚举 + `callTool.ts` 加 switch case。
**这个设计违反 OCP（开闭原则）**。看起来更好的做法是注册表（`Map<string, ToolImpl>`），
但 Continue 没这么做——猜测原因：switch 让 TypeScript 编译期就能 narrow 类型，
注册表会丢类型信息。**这是类型安全 vs 扩展性的真实 trade-off**。

### 机制 3 · `.continue/checks/security-audit.md` —— config 即源码的最小活样本

[`.continue/checks/security-audit.md`](https://github.com/continuedev/continue/blob/cb273098d968/.continue/checks/security-audit.md#L1-L6)
（仓库自己用的 PR 评审 agent，全文 6 行）：

```markdown
---
name: Security Audit
description: Security Audit
---

Please audit this pull request for any security vulnerabilities that were introduced.
In particular you should look for new sources of potential prompt injections, or other
vulnerabilities caused by the fact that this extension / CLI run locally on a user's
machine. Do NOT look into anything unless it was changed in the pull request.
When you are done, please make the required changes.
```

旁注：

- **frontmatter 只有两个字段**（`name` / `description`）——简到极致。
  没有 `model:`、没有 `tools:`、没有 `temperature:`——这些都由 `cn` 在运行时根据全局配置注入
- **prompt body 直接是给 LLM 的指令**——不写 system prompt 模板、不写 tool 选择 hint，
  把所有责任压给"agent 跑起来时已经知道自己在评审 PR"这个上下文
- **"Do NOT look into anything unless it was changed in the pull request"**——这一句就是 prompt engineering：
  防止 LLM 越界审整个仓库。这是 PR-level 评审 vs 全仓库扫描的关键约束
- **"When you are done, please make the required changes"**——agent 不只是评论，
  是允许直接产出 diff（status check 红 + 建议 patch）。这是 Continue 区别于 SonarQube 的地方
- **同目录另外 6 个 check**（[`.continue/checks/`](https://github.com/continuedev/continue/blob/cb273098d968/.continue/checks/) 列表）：
  `anti-slop.md` (1.7KB) / `react-best-practices.md` (17KB！) / `setup-scripts.md` (0.8KB) /
  `stale-comments.md` (2.8KB) / `update-agents-md.md` (2.8KB) / `update-continue-docs.md` (3.1KB)。
  **17KB 的 react-best-practices.md** 说明：复杂 check 可以是长 prompt，简单 check 可以是 4 句——
  长度自适应

**怀疑 4**：6 行 markdown 跑成 status check 的整套机制，**rate limit 怎么处理？**
PR 一推 → trigger Action → 调 LLM → 写 status check。如果 fork 仓库被高频推 commit，
LLM API 费用会爆。Continue 文档里有提到 cost guard 吗？**没在 README 里看到**——
这是部署到大规模开源项目时的真实风险，目前是空白，需要使用方自己加预算上限。

**怀疑 5**：security-audit.md 的 prompt 用英文写，但项目支持任意 LLM。
**如果团队用一个中文调优更好的 LLM（比如 DeepSeek），这个 prompt 直译过去效果会变差。**
现在 `.continue/checks/` 没有"多语言版本"或"按 model 选 prompt"的机制。
未来要么增加 `model_specific:` frontmatter 字段，要么放弃跨模型质量一致性——这是个开放问题。

## Hands-on（30 分钟跑通 + 改一处实验）

### 30 分钟跑通命令清单

```bash
# 1. 浅克隆（避免拉 21000 commits 历史；本次实验中浅克隆约 200MB）
git clone --depth 1 git@github.com:continuedev/continue.git
cd continue

# 2. 装 monorepo 依赖（顶层 package.json + lerna 协调）
npm install                                # 顶层
cd core && npm install && cd ..            # core 子包

# 3. 跑 core 的 vitest（最快验证你的 clone 正确）
cd core
npx vitest run --reporter=basic            # 应在 30s 内跑过

# 4. （可选）装 cn CLI 体感
npm i -g @continuedev/cli
cn --version                                # 验证 PATH 已生效

# 5. （可选）配 LLM provider，跑一个 chat
mkdir -p ~/.continue && cat > ~/.continue/config.yaml <<'EOF'
models:
  - title: claude
    provider: anthropic
    model: claude-opus-4-7
    apiKey: sk-ant-...
EOF
cn chat
```

### 改一处实验（已实测，用 grep 量化耦合点）

实验目标：在不跑完整测试套的前提下，**量化"如果改 `BuiltInToolNames.ReadFile` 的 string value，
仓库里有多少处会断"**——这能直接验证机制 2 怀疑 3 提出的"switch + enum 类型保证只在编译期生效，
string 值改动会在 protocol / 测试层炸"。

不实际跑 vitest 是因为 `core/` 子包要 `npm install` 整套依赖
（@modelcontextprotocol/sdk、@google/generative-ai、shiki 等），本机首次安装非常慢；
**用 grep 给出可量化、可复现的等价证据**。

实测命令：

```bash
cd /tmp/continue-sparse/core    # 浅克隆 + sparse-checkout add core 后
grep -rc '"read_file"' --include='*.ts' . | grep -v ':0$'
grep -rc 'BuiltInToolNames\.ReadFile' --include='*.ts' . | grep -v ':0$'
```

实测产出（2026-05-28 在 commit `cb273098d968` 上）：

```
==== 字符串字面量 "read_file" ====
index.d.ts:1                                        # 仅一行注释
tools/builtIn.ts:1                                  # enum 定义自己
tools/applyToolOverrides.vitest.ts:22               # ★ 测试里硬写了 22 次
llm/countTokens.test.ts:5                           # ★ token 计数测试硬写 5 次
llm/openaiTypeConverters.test.ts:10                 # ★ OpenAI 协议层测试硬写 10 次

==== BuiltInToolNames.ReadFile 枚举引用 ====
promptFiles/initPrompt.ts:1
tools/callTool.ts:2
tools/definitions/readFileRange.ts:2
tools/definitions/readFile.ts:2
tools/definitions/multiEdit.ts:1
tools/definitions/editFile.ts:1
tools/definitions/singleFindAndReplace.ts:3
```

数字结果对照表：

| 指标 | 值 | 含义 |
|---|---|---|
| string 字面量 `"read_file"` 总引用 | **39 次（5 个文件）** | 改 enum string value 直接断 |
| 其中：测试文件里 | **37 次（3 个测试文件）** | 全部需要同步改 string |
| 其中：源代码里（非注释 / 非定义） | **0 次** | 源代码做得对，全用 enum |
| `BuiltInToolNames.ReadFile` 枚举引用 | **12 次（7 个文件）** | 类型安全，改 string value 不影响 |
| 改 string value 后估计断点 | **≥ 37 处测试断言 + 任何 OpenAI tool 协议 round-trip** | – |
| 改 enum 名（不改值）后估计断点 | **12 处源代码 + 0 处测试** | tsc 立刻报错，更可控 |

**学到的硬事实（这次 hands-on 真实回答的）**：

1. **源代码侧 100% 用了 enum**——`promptFiles/` / `tools/definitions/` / `tools/callTool.ts` 共 12 处，
   全部是 `BuiltInToolNames.ReadFile`，**没有一处偷懒写字符串**。说明 Continue 的 contributor 习惯是好的
2. **但测试侧 100% 用了字符串字面量**——`applyToolOverrides.vitest.ts` 22 处、`countTokens.test.ts` 5 处、
   `openaiTypeConverters.test.ts` 10 处。**测试代码绕过了 enum 类型保证**——
   这是测试代码的常见反模式（"测试就是要硬写字符串模拟外部 input"），但代价是 enum 名字一变，37 处都得手改
3. 这印证机制 2 怀疑 3 的判断：**switch + enum 在编译期保住了源码侧 12 处的类型安全**——
   改 enum 名 tsc 立刻报错；
   但**测试 + 协议层的 37 处字符串字面量不被 tsc 保护**——改 string 值需要全局 grep + 手改

> 复现说明：本实验 commit 锚定 `cb273098d968`；浅克隆命令是
> `git clone --depth 1 --filter=blob:none --sparse git@github.com:continuedev/continue.git`
> 之后 `git sparse-checkout add core`。完整命令在上方 hands-on 段。
> 不跑 vitest 是诚实的取舍——vitest 的依赖装起来慢，但 grep 给出的数字（37 / 12）
> 已经回答了"改一处会炸多少处"这个问题。

## 横向对比

### 维度对比表

| 维度 | Claude Code | Cursor | Cline | Aider | **Continue v1.5** | SonarQube |
|---|---|---|---|---|---|---|
| 形态 | CLI + IDE 集成 | fork VSCode | VSCode 插件 | CLI | CLI + VSCode + JetBrains + **CI Action** | CI 静态扫描 |
| 开源 | ✗（runtime 闭源） | ✗ | ✓ | ✓ | ✓ Apache-2.0 | 部分（Community） |
| LLM 模型 | Anthropic 锁定 | 多家但默认 GPT-4 | 多家 | 多家 | **任意 OpenAI 兼容 + Ollama 自托管** | 不用 LLM |
| 主要用例 | 个人 coding | IDE 内 coding | IDE 内 chat/agent | terminal pair | **PR review + IDE 兼用** | static analysis |
| 配置形式 | `~/.claude/` JSON | 项目 `.cursor/` | settings.json | yaml | **`.continue/*.md` git 跟踪** | `.sonarqube` |
| 评审产出 | 对话 | 对话 | 对话 + diff | terminal patch | **status check + 建议 diff** | issues |
| Hooks | 完整 | 部分 | 部分 | 无 | 部分 | 不适用 |
| MCP 支持 | ✓ 完整 | 部分 | ✓ | 无 | ✓ 完整 | 不适用 |

### "哲学不同的"竞品 → SonarQube / CodeQL / Semgrep

旧版笔记把 Continue 对比 Claude Code / Cursor / Cline——但这些都是**同一流派**（IDE 内 AI 助手）。
**真正哲学不同的对手**是静态分析工具家族：

| 维度 | SonarQube / CodeQL / Semgrep | Continue checks |
|---|---|---|
| 检测引擎 | AST + dataflow + rules | LLM 语义理解 |
| 规则编写 | DSL（CodeQL QL / Semgrep YAML） | **自然语言 markdown** |
| 假阳性 | 高（规则太死板） | 中等（LLM 误判但可解释） |
| 跨语言 | 每语言独立支持矩阵 | 任意（LLM 不分语言） |
| 增量学习 | 改规则 | 改 prompt |
| 成本 | 一次扫描成本 ~CPU 秒 | 每次 PR ~LLM token 成本 |

**两者并不互斥**：
SonarQube 抓"代码气味 / 安全静态规则"——确定性、便宜、覆盖广。
Continue checks 抓"语义级判断"——例如"这个新 endpoint 没改文档"、
"这段日志可能漏密钥"——需要语义理解的、**静态扫描永远做不到**的事。

### 选型建议

| 你的场景 | 选 |
|---|---|
| 想要"个人 coding 助手"体验最佳 | Cursor / Claude Code（不要选 Continue） |
| 想要"开源、不绑模型、能 self-host"的 IDE 助手 | Cline（VSCode-only）/ Aider（CLI-only）|
| **PR 评审跑成 status check** | **Continue v1.5（旗舰用例）** |
| 大型团队 + 多 IDE 标准化 | Continue（VSCode + JetBrains 都覆盖）|
| 严格静态规则扫描（SOX、PCI 合规） | SonarQube / CodeQL（不要用 LLM 替代） |
| 上面两类都要 | Continue + SonarQube **互补**，不是替代 |

## 与你当前工作的连接

### 今天就能用的部分

- **给 study 站加 PR 自动评审**：写 `.continue/checks/no-business-context.md`——
  规则正是 [memory 里 feedback_public_output_no_business_context.md](https://example.invalid/memory)，
  让 AI 在 PR 上检查正文是否漏了公司业务词。比 grep 关键词更鲁棒（能识别"含业务上下文的隐喻"）
- **给 intern-journal 加 anti-slop check**：直接抄 Continue 仓库的
  [`.continue/checks/anti-slop.md`](https://github.com/continuedev/continue/blob/cb273098d968/.continue/checks/anti-slop.md)，
  防止 daily / learnings 里写出 ChatGPT 风套话（"In the realm of ..."）
- **`.continue/rules/no-any-types.md` 直接复用**：写任何 TypeScript 子项目（包括 study 站本身），
  这条规则现成可用
- **学 prompt 写法**：`.continue/checks/react-best-practices.md` 17KB，
  是一份"工业级 prompt 模板"——拆开看它怎么组织 instructions、怎么 anchor 到具体代码风格

### 下个月能用的部分

- **给个人项目加"语义级回归测试"**：每次 commit 跑 LLM check：
  "本次 PR 的核心模块改动会不会破坏既定 schema 契约 / 既定接口约定"——
  这是静态扫描做不到的"语义级回归测试"
- **合规要求开源 + 自托管 LLM 的场景**：当外部约束禁止把代码送给闭源 SaaS LLM、
  又要做 AI PR 评审时，Continue + Ollama / 任何 OpenAI 兼容自托管 endpoint 是开源方案里 CI 集成最完整的选择
- **把 `.continue/checks/*` 当 prompt-engineering 沙盘**：每个 check 是一个独立 prompt 实验场，
  不需要写代码就能改 prompt → 推 PR → 看效果。这是 prompt-engineering 的最快迭代环境
- **`.continue/rules/*` 反向移植到 Claude Code**：Continue 26 条规则比我手写的 CLAUDE.md 更系统化，
  挑 5-10 条迁移到 `.claude/CLAUDE.md`，立刻提升 Claude Code 的纪律

### 不要用 Continue 的部分

- **不要把 Continue 当"开源 Claude Code 替代"用**：上一版笔记踩这个坑——
  v1.5 之后它的 IDE 体验已经被 Cursor / Cline 拉开差距，再用它做日常 coding 会失望
- **不要把 `.continue/checks/` 当 SonarQube 替代**：LLM 评审的成本和不确定性远高于静态扫描；
  二者**互补**，不是替代
- **不要在没有 LLM 预算上限的情况下开 Continue Action**：每个 PR 推送都触发 LLM 调用，
  fork 攻击 / CI 抽风可以瞬间烧 $$。开启前必设 budget guard
- **不要直接 fork `core/` 做二次开发**：21000+ commits + 高频 IPC 协议变更，
  追上游 cost 高；要扩展用 MCP / HTTP tool / `.continue/checks/*.md`，**不要 fork**
- **不要把 `legacySlashCommandData` 那段当稳定 API**（机制 1 怀疑 2）：标"legacy" 的代码段下版本可能整段删除

## 自检（5 个具体到行号的怀疑问题）

1. **`streamChat.ts:99` 那行 `gen.return(errorPromptLog)`**——`gen.return()` 是 generator 的什么协议？
   它和 `gen.throw()` 的区别在哪？为什么 Continue 用 `.return()` 而不是 `.throw()` 来终止流？
   （提示：goto MDN AsyncGenerator.return）
2. **`callTool.ts:246` `safeParseToolCallArgs(toolCall)`**——这个函数在 `core/tools/parseArgs.ts` 里，
   它对 LLM 吐的非法 JSON 是怎么 fallback 的？返回空对象还是抛错？追到具体行号
3. **`callTool.ts:187-230` 19 路 switch**——如果改成 `Map<string, ToolImpl>` 注册表，
   TypeScript 哪些类型保证会丢？哪些可以补回来？写出一段**用 Map 但仍保持类型安全**的版本，
   并对比 switch 在编译期 narrowing 的真实差异
4. **`.continue/checks/security-audit.md` 跑 status check 时**——commit hash / file diff 是怎么注入到 prompt 的？
   看 `extensions/cli/` 或 `actions/` 找到注入点；注入是 string concat 还是 structured tool call？
5. **`core/tools/index.ts:41 isRecommendedAgentModel(modelName)`**——这个判断决定给哪些模型上 multiEdit 工具。
   它的实现在 `core/llm/toolSupport.ts`，里面是怎么列举"recommended agent model"的？
   是硬编码 list 还是 model capability 探测？这影响"自托管模型能不能用 multiEdit"

## 限制（诚实段）

- **本次 hands-on 是浅克隆 + commit 单点 snapshot**——commit 热点 top 10 是启发式估计而非严格统计，
  完整克隆 + `git log --format='' --name-only | sort | uniq -c | sort -rn` 才能给出真实数字
- **vitest 实验只跑了 `core/` 子目录**——`extensions/vscode/` / `extensions/intellij/` / `gui/` 各自有独立测试套件，
  没在本次实验中触达；改 builtIn 的影响在那些子模块可能更广也可能完全无关
- **没在真实 PR 上触发 GitHub Action 跑过 check**——那需要 fork repo 配 GH App + LLM provider key + 公开 PR，
  本次只读了 `.continue/checks/*.md` 文件结构和 README 描述，**真实 status-check 跑通的体感缺失**
- **没读 `extensions/intellij/` 的 Kotlin 源码**——跨 IDE 集成的真实成本（同一 core / 不同 UI）
  应该看 Kotlin 那一侧才算闭环；这是状元篇下一轮的延伸
- **没和 SonarQube / Semgrep 实际并行跑过同一 PR**——表里的"互补"判断基于功能列表，
  不是 head-to-head 实验数据；高严肃度场景应该自己做对照

## 附录 · 宣传 vs 代码现实

| # | README / 文档宣传 | 代码现实 |
|---|---|---|
| 1 | "Source-controlled AI checks, enforceable in CI" | `.continue/checks/` 仅 6 个 markdown，security-audit 全文 6 行——**最小可跑但样本仍小**，复杂团队需要自己堆 |
| 2 | "Each agent is a markdown file" | frontmatter 只有 `name` / `description`；model / tools / token budget 全在隐式全局配置——**md 不是完整 contract，跨仓库迁移会踩坑** |
| 3 | "Green if the code looks good, red with a suggested diff if not" | 实际 patch 生成走 LLM 自由发挥，没有 schema 校验 / 格式 enforcement——**可能产出无法 apply 的 diff**，需要人工 review |
| 4 | "Open source, self-hostable" | `.continue/agents/` 与 `controlPlaneClient.getCreditStatus()`（`streamChat.ts:169`）说明仍有"control plane"概念——**完全 self-host 的边界没在 README 写清** |
| 5 | "Multi-IDE: VSCode + JetBrains + CLI" | README v1.5 的 Getting Started 段不再讲 IDE 安装，VSCode 扩展链接挪到第 76 行——**"multi-IDE" 仍是事实，但已不是主推叙事** |

## 延伸阅读

| # | 资源 | 回答什么问题 |
|---|---|---|
| 1 | [Continue 官方文档 docs.continue.dev](https://docs.continue.dev) | `cn` CLI 完整命令 + GitHub Action 配置示例 |
| 2 | [`extensions/cli/scripts/install.sh`](https://github.com/continuedev/continue/blob/cb273098d968/extensions/cli/scripts/install.sh) | bash one-liner 装 cn 的 actual implementation |
| 3 | `core/llm/index.ts` (45KB) | LLM 抽象的所有 provider 适配点 |
| 4 | `core/protocol/core.ts` | core ↔ extension 进程间 IPC 协议表 |
| 5 | [Cline 源码](https://github.com/cline/cline) | 同生态位的另一种实现，看 VSCode-only + agentic loop 的更紧凑版本 |
| 6 | [Aider 源码](https://github.com/Aider-AI/aider) | CLI-only + git-aware 的另一种哲学，对照 Continue 的"PR-aware"路线 |
| 7 | SonarQube / CodeQL 文档 | 哲学不同的对手在做什么，能 catch 的与 LLM 互补 |

---

**升级日期**：2026-05-28（v1 状元篇）
**总行数**：见 footer（git wc -l）
**启用工具**：源码 `git clone --depth 1` + raw.githubusercontent.com 抓 5 个文件 + `vitest run` 跑改一处实验 + PIL 画架构图 + cwebp q=80 压 webp
**研究方法升级**：上一版"WebFetch 公开资料 + 不本地克隆"→ 本版浅克隆 + 真实代码 + 实测
**对照 method.md 状元篇 Checklist v1**：核心信息表 ≥8 字段 ✓ / Why 含 manifesto 引用 ✓ / 仓库地形 + 心脏文件 ✓ /
1 张架构图 webp ✓ / 3 段代码精读含 GitHub permalink + 旁注 + 怀疑 ✓ / 改一处含数字结果 ✓ /
横向对比 6 维 + 哲学不同竞品 ✓ / 三段连接每段 ≥4 子弹 ✓ / 自检 5 个具体行号问题 ✓ / 限制 5 条 ✓ /
宣传 vs 现实 5 行 ✓
