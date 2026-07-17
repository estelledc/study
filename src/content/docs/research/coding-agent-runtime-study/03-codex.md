# 03. Codex：线程/会话内核

## 一句话定位

Codex 像一栋共用同一机房的办公楼：CLI、TUI、App Server、IDE 和 Desktop 是不同前台，但线程、模型请求、工具、权限、历史和持久化都由共享内核管理。

固定快照：`openai/codex@800715d`。

## 为什么仓库看起来很大

根 `codex-rs/Cargo.toml` 包含大量职责明确的 crate：

- `cli`、`tui`：命令入口与终端 UI；
- `app-server*`：桌面端/IDE 使用的协议和 server；
- `core`：session、turn、工具和模型交互；
- `protocol`：跨进程事件与数据类型；
- `tools`、`exec`、`apply-patch`、`shell-command`：工具能力；
- `sandboxing`、`linux-sandbox`、`execpolicy`：硬约束；
- `thread-store`、`rollout`、`state`：线程历史和恢复；
- `skills`、`plugin`、`ext/*`、`mcp`：扩展能力；
- `model-provider*`、`ollama`、`lmstudio`：provider 接入。

这不是一个“把所有代码放在 core”的单体。它用 crate 边界限制依赖，但代价是追踪一条链路需要跨多个包。

## 产品入口

`codex-rs/cli/src/main.rs` 是 multitool CLI：

- 无子命令时进入交互 TUI；
- `exec` 走非交互执行；
- 另有 `mcp`、`plugin`、`sandbox`、`app-server`、`resume`、`fork` 等入口。

对学习 runtime 而言，入口参数解析不是重点。核心边界从 `CodexThread` 开始。

## 核心对象

### CodexThread

`CodexThread` 是对外线程门面，内部持有：

- `Arc<Session>`；
- `SessionIo`；
- session source；
- session configured event；
- rollout path 等持久化信息。

源码：`codex-rs/core/src/codex_thread.rs:162-166`。

它提供：

- `submit()` / `submit_with_trace()`：提交操作；
- `next_event()`：读取事件；
- `agent_status()`：读取状态；
- `read_thread()` / `load_history()`：持久化读取；
- `append_rollout_items()`：追加历史；
- `config_snapshot()`：读取线程配置快照。

日常类比：`CodexThread` 是档案窗口，不亲自施工，但它是所有客户端访问同一项目档案的统一入口。

### Session

`Session` 才是长期运行的状态拥有者。它管理：

- 当前 active turn；
- input queue；
- conversation history；
- services；
- model client；
- MCP、plugins、extensions；
- thread store / rollout；
- token 与 compaction 状态。

本轮没有逐行展开 `session/session.rs`，因为文件和依赖面很大；控制流通过 `SessionTask` 与 `run_turn()` 观察。

### ThreadConfigSnapshot

快照包含：

- model 与 provider；
- approval policy；
- permission profile；
- environment 与 workspace roots；
- reasoning；
- collaboration mode；
- history mode；
- fork/parent thread；
- session source。

源码：`codex_thread.rs:62-84`。

它不是简单的“配置对象”。这是一次线程运行需要复查和恢复的行为合同。

## 一次普通 turn

```text
client submit
  ↓
Session 选择 RegularTask
  ↓
RegularTask::run
  ↓
run_turn
  ├─ pre-sampling compact
  ├─ capture StepContext
  ├─ world state diff
  ├─ Skill / Plugin / Connector / Extension injection
  ├─ hooks + user input recording
  └─ sampling loop
       ├─ build history
       ├─ build ToolRouter
       ├─ call provider
       ├─ dispatch tool calls
       ├─ collect pending input
       ├─ compact if needed
       └─ stop hooks
```

关键源码：

- `tasks/regular.rs:28-89`
- `session/turn.rs:144-430`
- `session/turn.rs:1130-1224`

## StepContext：请求级一致性

`run_turn()` 在每个 sampling step 前捕获 `StepContext`，然后用同一个 context：

- 组装 model-visible context；
- 构建本次工具列表；
- 创建 `ToolCallRuntime`；
- 执行工具。

源码：`turn.rs:249-295,1139-1156`。

### 它解决什么

假设模型请求发出后，用户切换：

- cwd；
- sandbox；
- approval policy；
- enabled tool；
- model；
- plugin。

如果工具执行时重新读取“最新全局状态”，模型可能按旧 schema 发出调用，runtime 却用新权限或新 cwd 执行。`StepContext` 把同一次请求需要的一组状态冻结为一致视图。

这是一种 **request snapshot**，不是复制整个 Session。

## 上下文装配

`build_skills_and_plugins()` 会：

1. 从真实用户输入收集显式 mention；
2. 获取当前配置下启用的 plugins；
3. 必要时列出 MCP 工具；
4. 解析可用 connector；
5. 构建 Skill injection；
6. 构建 Plugin injection；
7. 加入 extension contributor 提供的片段。

源码：`turn.rs:529-694`。

一个重要安全细节：guardian reviewer 的输入包含父 transcript，它被视作不可信证据，不从里面解析 Skill 或 Plugin mention，见 `turn.rs:535-540`。

这体现了“被引用的用户文本”和“当前真实用户指令”不能混为一谈。

## 工具路由

`ToolRouter` 内部有两张表：

| 结构 | 作用 |
|---|---|
| `registry` | runtime 实际可以分发的工具 |
| `model_visible_specs` | 本次告诉模型的工具 schema |

源码：`tools/router.rs:35-38`。

`build_tool_call()` 将 Responses API item 规范化成内部 `ToolCall`：

- function call；
- client-side tool search；
- custom tool call。

源码：`tools/router.rs:111-160`。

`dispatch_tool_call...()` 再把 session、step context、取消 token、diff tracker、call id、tool name 和 payload 组装成 `ToolInvocation`，交给 registry，见 `tools/router.rs:209-243`。

### 为什么要两张表

- 某些工具存在于 runtime，但当前模式不应广告给模型。
- deferred discovery 可以先只暴露搜索入口。
- extension 工具可以动态贡献。
- plan mode、sandbox 或能力开关可以改变本次可见集合。

## 权限与沙箱

`ThreadConfigSnapshot` 同时持有：

- `approval_policy`：何时问用户；
- `permission_profile`：允许什么能力；
- `sandbox_policy()`：把权限 profile 映射成实际沙箱策略。

源码：`codex_thread.rs:62-69,126-140`。

三者职责不同：

| 层 | 问题 |
|---|---|
| model-visible tools | 模型有没有机会提出这个动作？ |
| approval policy | 动作执行前是否需要人确认？ |
| sandbox policy | 即使执行，操作系统层实际允许到哪里？ |

只保留任意一层都会产生错误安全感。

## Provider 与传输

`model-provider-info` 明确是 provider registry：

- built-in OpenAI；
- Amazon Bedrock；
- Ollama；
- LM Studio；
- 用户可在 `config.toml` 增加 OpenAI Responses-compatible provider。

源码：`codex-rs/model-provider-info/src/lib.rs:1-5,429-493`。

当前 provider wire protocol 统一到 Responses API；旧 chat wire API 已移除。`ModelClientSession` 会根据 provider 能力和健康状态选择 HTTP 或 WebSocket，并在 turn 内复用 sticky routing。

这说明 Codex 有 provider 抽象，但产品和协议设计仍明显围绕 OpenAI Responses 生态，不等于 Pi/OpenCode 那种广泛的多种原生 API 适配。

## 持久化

`CodexThread` 可以：

- 加载完整 history；
- 读取 thread；
- 更新 metadata；
- 追加 rollout items；
- 读取 state DB。

源码：`codex_thread.rs:504-560`。

rollout 是原始/结构化运行历史，thread store 提供可查询的线程视图，state DB 保存派生状态。这里的设计目标不是只“下次能看到聊天”，还包括：

- resume；
- fork；
- archive；
- token usage 恢复；
- 桌面端读取；
- instruction source 追踪。

## Compaction 与 continuation

Codex 有多个压缩时机：

- pre-sampling：新请求前发现上下文即将超限；
- mid-turn：模型/工具 continuation 中达到阈值；
- model fallback 相关的 inline compaction。

在 sampling loop 中，如果还需要继续且 token limit reached，会先 `run_auto_compact()`，再回到循环，见 `turn.rs:328-381`。

压缩是 continuation 的一个状态转换，不是最终答案。

## Hooks 与扩展

扩展点至少包括：

- session start hooks；
- turn hooks；
- stop hooks；
- legacy after-agent hook；
- turn input contributors；
- tool contributors；
- Skills、Plugins、MCP 和 Connectors。

stop hook 可以：

- 允许结束；
- 阻止结束并注入 continuation fragment；
- 明确要求停止。

源码：`turn.rs:384-429`。

这就是为什么“模型没调用工具”不一定代表 Codex turn 结束。

## 设计优点

1. 多客户端共享一致内核。
2. 权限、沙箱和工具路由有明确分层。
3. 请求级 context snapshot 降低配置竞态。
4. thread/rollout/state 能支持恢复与审计。
5. extension、plugin、Skill、MCP 都有正式接入点。

## 设计代价

1. 控制流跨 task、session、turn、client、tool runtime，阅读成本高。
2. 同一概念可能同时存在 protocol item、internal item、rollout item 和 UI event。
3. 特性很多，必须依赖 feature flag 和测试保证组合正确。
4. provider 抽象受 Responses API 形状影响较深。

## 初学者容易看错

### 只读 `codex_thread.rs`

它只是门面。真正的 agentic loop 在 `session/turn.rs`。

### 把 approval 当 sandbox

approval 是交互决策，sandbox 是硬执行边界。

### 把 history 当 prompt

history 还要经过 modality 过滤、world state、Skill/Plugin injection 和工具装配，才成为本次 prompt。

## 推荐精读顺序

1. `tasks/regular.rs:28-89`：先看最外层任务循环。
2. `session/turn.rs:144-430`：理解一次 turn。
3. `session/turn.rs:1130-1224`：理解一次 provider request。
4. `tools/router.rs:29-243`：理解工具 schema 与执行分离。
5. `codex_thread.rs:504-560`：理解线程持久化门面。

## 思考点

1. 如果去掉 `StepContext`，用户在模型流式响应期间切换 cwd，可能发生什么？
2. 为什么 `registry` 中存在工具，但 `model_visible_specs` 可以不包含它？
3. 为什么 stop hook 必须发生在“模型无 continuation”之后，而不能只在用户 prompt 开始前运行？
