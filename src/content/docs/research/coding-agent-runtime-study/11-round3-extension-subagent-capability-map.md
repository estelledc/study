---
title: "11. Round 3：扩展、子 Agent 与能力边界"
sidebar:
  hidden: true
---
# 11. Round 3：扩展、子 Agent 与能力边界

## 本轮研究问题

第一轮看 Agent loop，第二轮看失败恢复，第三轮看：

> 新能力怎样进入 runtime？它继承谁的权限？如何卸载？子 Agent 为什么不能简单复制父 Agent？

## 先拆开六种“扩展”

### 1. Instruction / Skill

本质是进入模型上下文的文字与工作流。

- 能影响模型决策；
- 不能自己执行代码；
- 真实能力仍受工具、权限和 sandbox 限制；
- 需要处理来源、优先级和 prompt injection。

### 2. Tool

模型可提出的结构化动作：

- 名字；
- schema；
- runtime handler；
- policy；
- result。

工具是 capability，不只是文档。

### 3. MCP

通过进程/网络协议提供工具与资源：

- 独立服务生命周期；
- handshake；
- auth；
- schema discovery；
- liveness/restart；
- server trust。

### 4. In-process plugin / extension

直接在 Agent 进程内运行代码，可以：

- 注册工具；
- 改 provider request；
- 改 system prompt；
- 拦截 session/tool lifecycle；
- 改 UI；
- 访问宿主文件和凭证。

它的风险通常高于 Skill 和远程 MCP。

### 5. Provider adapter

将统一模型接口转换成某个厂商的：

- auth；
- model catalog；
- message shape；
- stream events；
- reasoning；
- caching；
- transport。

它接触凭证和原始请求，是高权限扩展。

### 6. Subagent

一个有独立上下文、模型、工具、生命周期和结果的子运行。

它需要定义：

- 输入；
- 输出；
- cwd；
- tools；
- permission；
- isolation；
- depth；
- foreground/background；
- cancellation；
- usage；
- parent handoff。

## 能力编译管线

五个项目虽然实现不同，但都可以用下面的过程理解：

```text
能力来源
  ↓
discover
  ↓
trust / acknowledge
  ↓
normalize definition
  ↓
merge precedence
  ↓
clamp by policy and session
  ↓
materialize request-scoped tools/context
  ↓
execute with lifecycle
  ↓
dispose / reload / revoke
```

任何一步缺失都会产生典型问题：

- 没 discover：能力存在但不可用；
- 没 trust：仓库代码启动即执行；
- 没 normalize：跨 provider/tool 名称无法对齐；
- 没 precedence：同名扩展结果随机；
- 没 clamp：子 Agent 能力扩大；
- 没 request scope：模型看到旧工具；
- 没 dispose：reload 后旧 handler 继续生效。

## Codex：typed contributor registry

### Extension API 不是一个万能 hook

Codex 的 extension API 按职责拆 contributor：

- context；
- thread lifecycle；
- turn lifecycle；
- turn input；
- world state；
- tool；
- tool lifecycle；
- approval review；
- token usage；
- turn item；
- MCP server；
- Skill invocation。

源码：

- `codex@800715d:codex-rs/ext/extension-api/src/contributors.rs`
- `ext/extension-api/src/registry.rs`

这种设计让 extension 只能在明确阶段贡献特定类型数据，比一个 `onAnyEvent(any)` 更容易维护 contract。

### 三层 ExtensionData

贡献者可以获得：

- session store；
- thread store；
- turn store。

源码：`ext/extension-api/src/contributors/context.rs` 与各 lifecycle input。

这解决状态归属：

- 跨所有线程的状态放 session；
- 单线程状态放 thread；
- 一次 turn 临时状态放 turn。

如果所有 extension 状态都塞全局 map，fork/resume/并发 turn 很容易串线。

### ToolContributor

extension tool executor 在每次路由构建时从 contributor 收集：

`core/src/tools/router.rs:246-261`

工具执行仍通过同一 `ToolRouter`、`StepContext` 和 cancellation，不绕开核心权限/生命周期。

### TurnInputContributor

extension 能贡献本 turn 的 context fragment，但 host 只提供受控的：

- turn id；
- user input；
- environment/cwd；
- session/thread/turn store。

源码：`core/src/session/turn.rs:701-754`。

### Plugin capability summary

Codex plugin load outcome 为模型生成 capability summary，但源码注释要求：

> 调用方必须先应用 runtime capability policy，再构造 outcome。

源码：`codex-rs/plugin/src/load_outcome.rs:87-110`。

这意味着“插件安装了什么”和“当前线程允许模型知道/使用什么”不是同一层。

### Subagent

`AgentRunner` 在 owning `ThreadManager` 下 fork parent thread，再提交初始 turn：

`codex-rs/ext/agent/src/lib.rs:15-72`

主要含义：

- child 有真实 thread identity；
- 可继承父线程上下文快照；
- child history 与 parent 可分开持久化；
- 调用不是普通函数。

### Codex 的取舍

**优点**

- typed extension surface；
- scope 清楚；
- tool 不绕 core；
- 多产品面共享同一扩展合同。

**代价**

- contributor 类型很多；
-新增扩展点要改 Rust API；
- plugin marketplace、capability root、runtime extension 是多层概念。

## Gemini CLI：Agent 也是 Tool

### AgentRegistry 的来源优先级

registry 加载：

1. built-in agents；
2. project `.gemini/agents/`；
3. user agents；
4. extension agents。

源码：`gemini-cli@3ff5ba2:packages/core/src/agents/registry.ts:160-282`。

### Project agent 的双重门

项目 Agent 需要：

1. folder trust；
2. 对 Agent definition hash 的 acknowledge。

未 acknowledge 的 Agent 只进入 discovered event，不直接注册。

源码：`registry.ts:172-230`。

folder trust 解决“是否加载项目能力”，hash acknowledge 解决“Agent 定义变了是否仍沿用旧批准”。

### 同名冲突

后来的同名 Agent 不覆盖前一个，而是 warning + ignore：

`registry.ts:330-348`

这让 precedence 确定，不受并行加载完成顺序影响。

### Local / Remote / Browser

`AgentTool` 根据 definition 选择：

- local executor；
- local agent session；
- remote A2A invocation；
- remote session；
- browser invocation。

源码：`packages/core/src/agents/agent-tool.ts:156-207`。

上层模型只看到统一：

```text
agent_name + complete prompt
```

底层 transport 可以完全不同。

### 子 Agent 复用 Scheduler

Agent tool 本身是 declarative tool：

- 走 policy；
- 走 confirmation；
- 走 abort；
- 产生 progress；
- 返回 ToolResult。

因此主循环不需要为 subagent 开特殊旁路。

### 能力隔离

LocalAgentExecutor 根据 Agent definition 构建独立工具列表。测试明确覆盖：

- 只允许指定工具；
- 未配置时继承普通工具；
- 过滤 subagent tools，防递归；
- MCP 名称规范化；
- unauthorized tool 给模型显式失败。

源码入口：`packages/core/src/agents/local-executor.ts`；相应行为测试集中在 `local-executor.test.ts:667-943,1753` 之后。

### Policy 可按 subagent 匹配

PolicyEngine rule 可带 `subagent` 字段；调用 `AgentTool` 时，还会把 `agent_name` 当虚拟工具别名参与匹配。

源码：`policy/policy-engine.ts:93-105,564-567`。

这让规则可以表达：

```text
主 Agent 可用 shell
但 explore 子 Agent 只能 read/grep
```

### Remote Agent 默认更谨慎

registry 为 remote Agent 动态增加需要确认的 policy；本地内建 Agent 可按默认规则运行。远程 Agent 涉及：

- 外部 URL；
- 单独 auth；
- A2A card；
- 数据出站。

因此不能和同进程 local Agent 同一 trust 级别。

## Grok Build：能力裁剪最细

### Plugin trust 粒度

项目 plugin 是可执行面。TrustStore 以**单个 plugin root 的 canonical path**为 key：

- 信任一个 plugin 不自动信任同仓其他 plugin；
- canonicalize 失败按 untrusted；
- untrusted plugin 的 Skill/Agent metadata 可发现；
- hooks、MCP server、script 被阻止。

源码：`grok-build@b189869:xai-grok-agent/src/plugins/trust.rs:1-18,60-176`。

这是“可发现”和“可执行”分离。

### Agent builder 的有效工具集

构建顺序大致是：

1. 加默认工具；
2. 按 feature 移除 memory/ask/subagent；
3. 应用 Agent deny；
4. 应用 Agent allowlist；
5. 应用 session allow/deny clamp；
6. 解析 Agent(subagent types) directive；
7. 若不允许递归，移除 task 与后台 task lifecycle；
8. finalize ToolBridge。

源码：`xai-grok-agent/src/builder.rs:730-1030`。

### 一个危险兼容策略

Agent allowlist 中出现无法映射的工具名时，当前实现可能保留 full toolset，避免把 Agent 误裁成零工具：

`builder.rs:919-935`

这提高兼容性，但安全系统应注意：未知 allowlist 名称时 fail-open 与 fail-closed 是明确取舍。

不过 session clamp 随后仍会生效，且 plugin/subagent 有额外限制。

### Subagent spawn 前检查

`handle_subagent_request()` 先：

- 解析 definition；
- 检查 toggle；
- 检查 parent allowed types；
- 登记 pending；
- 解析 toolset/persona/role；
- 校验 resume identity；
- 校验 model；
- 选择 isolation。

源码：`xai-grok-shell/src/agent/subagent/handle_request.rs:59-245`。

### Worktree isolation

subagent 可创建独立 worktree；创建失败会明确降级到 shared workspace并记录 warning。

源码：`handle_request.rs:245-365`。

隔离不是布尔值：

- `None`：共享 cwd；
- worktree：文件副本隔离；
- 创建失败：降级；
- resume 时可复用或从 snapshot rehydrate。

### 递归上限

child depth 达到 `MAX_SUBAGENT_DEPTH` 时，runtime 从 child toolset 移除 Task tool，并清理孤立的 background task tools。

源码：`handle_request.rs:405-418`。

这不是只靠 prompt 说“不要递归”。

### Plugin Agent 附加限制

对 plugin Agent，源码明确忽略：

- `permissionMode`；
- inline hooks；
- agent MCP servers；
- parent MCP pool inheritance。

源码线索：`handle_request.rs:798-814,857-976`。

原因是 plugin definition 本身来自更低信任来源，不能借子 Agent 入口扩大权限。

### Foreground 超时转 background

foreground child 等待超过预算时，可以自动 detach 到 background，而 child 继续运行。

源码：`handle_request.rs:1317-1372`。

父 turn 不应被一个慢 child 永久卡死。

## OpenCode：插件作用域与子 Agent 权限派生

### Mature plugin loader

现有 `packages/opencode` plugin runtime：

- 内建 auth/provider plugins；
- 外部 file/npm plugins；
- install/entry/compatibility/load 分阶段错误；
- 外部模块可注册 hooks；
- plugin 初始化按顺序执行，保证 hook order 确定；
- session event 转发；
- finalizer 调 dispose。

源码：`opencode@4a760b5:packages/opencode/src/plugin/index.ts:64-304`。

### 为什么外部 plugin 加载可并行、应用要串行

- 文件解析/安装/导入互不依赖，可以并行；
- hook 注册顺序影响行为，必须确定；
- 所以 `loadExternal` 并行，`applyPlugin` 循环串行。

### V2 scoped plugin

`PluginV2` 为每个 plugin fork child scope：

- 同 id 加载用 keyed mutex；
- 检测 load cycle；
- 重载时先 close old scope；
- load 失败 close child scope；
- remove 时 close scope；
- waiters 在成功/失败时全部结算；
-全局 finalizer 关闭全部 scope。

源码：`packages/core/src/plugin.ts:31-142`。

scope 关闭意味着 plugin 注册的 hook/resource 随之回收，不必手工追踪每个 callback。

### 子 Agent permission 派生

OpenCode 不直接复制 parent Agent 全部 allow：

- parent session 的 deny 继续继承；
- `external_directory` 边界继续继承；
- child 自身 permission 决定能力；
- child 未显式允许 task/todowrite 时默认 deny。

源码：`packages/opencode/src/agent/subagent-permissions.ts:4-27`。

关键原则：

> 子 Agent 可以比父 Agent 更专门，但不能绕过 parent session 的硬 deny。

### Provider plugin

OpenCode V2 provider 目录有 30 余种 adapter。Provider plugin 可以改：

- provider catalog；
- model catalog；
- SDK factory；
- headers/body；
- OAuth；
- model-specific behavior。

源码入口：`packages/core/src/plugin/provider.ts` 与 `plugin/provider/*`。

这比“自定义 baseURL”更接近编译器后端：同一统一模型要投影成不同厂商协议。

## Pi：最大扩展自由与最大宿主信任

### Extension API 暴露面

Pi extension 可注册：

- tools；
- commands；
- shortcuts；
- flags；
- message/entry renderers；
- providers。

也可监听：

- project trust；
- resource discovery；
- session start/shutdown/switch/fork/compact/tree；
- context/provider request/headers/response；
- Agent/turn/message；
- tool call/result；
- input；
- model/thinking select。

源码：`pi@c6d83715:packages/coding-agent/src/core/extensions/types.ts:436-473,506-900,1164-1396`。

### Pre-trust 两阶段加载

project trust 未决定前，只加载：

- user/global extensions；
- CLI 显式 extension；
- context files。

项目 settings、project packages 和 project extensions 等 trust 后再加载。

源码：`resource-loader.ts:330-413,492-567`。

这样 extension 本身可以提供自定义 project trust UI/策略，但未受信项目代码不会先执行。

### 进程内执行

loader 用 Jiti 导入 TypeScript/JavaScript factory。extension 可以调用 `execCommand`，并可访问宿主 Node/Bun 权限。

源码：`extensions/loader.ts:1-30,390-414`。

所以 project trust 是加载门，不是 sandbox。

### Registration 与 action 分阶段

加载时：

- `registerTool`、`registerCommand` 等写 extension definition；
- session action methods 是 throwing stub；
- provider registration 先排队。

runner bind core 后：

- action methods 替换成真实实现；
- pending provider registration flush；
- 后续 provider register/unregister 可即时生效。

源码：`extensions/loader.ts:165-215,217-379` 与 `extensions/runner.ts:315-381`。

这防止 extension factory 在 runtime 尚未准备好时发送消息或改 session。

### Stale context 防护

session replace/reload 后，旧 extension context 被 invalidate。再调用会 throw，提示使用新 session 的 `withSession` context。

源码：`extensions/loader.ts:169-203` 与 `extensions/runner.ts:515`。

这和 Cell 复用的 representedID 有相同思想：对象还活着，不代表它仍代表当前身份。

### Tool hook 的高风险边界

Pi 允许 `tool_call` handler 原地修改参数，且注释明确：

> 后续 handler 能看到前面修改；修改后不重新 validation。

源码：`extensions/types.ts:885-900`。

这给 extension 很大自由，也意味着：

- extension 必须自己保证修改后仍符合 schema；
- permission gate 应在最终参数上执行；
- 不可信 extension 可以绕过原始参数验证假设。

### Provider composition

Pi provider 由三层合成：

```text
built-in provider
→ models.json config
→ extension override
```

extension 可替换：

- model list；
- baseURL；
- API type；
- stream function；
- OAuth；
- headers；
- compatibility。

源码：`core/provider-composer.ts:43-68,124-228,399-479`。

结构在注册/重载时先验证，再读取凭证；credential resolution 与 model catalog composition 分开。

### Pi 不内置 subagent

Pi 没有统一 child session graph。扩展可：

- spawn 另一个 Pi 进程；
-用 tmux；
- 自己组合 AgentSession；
- 安装第三方 orchestrator。

这保持 core 简单，但没有统一：

- parent/child identity；
- recursive depth；
- child permission；
- usage fold；
- worktree isolation；
- background lifecycle。

## 五项目能力边界比较

| 维度 | Codex | Gemini CLI | Grok Build | OpenCode | Pi |
|---|---|---|---|---|---|
| 扩展 API 形态 | Rust typed contributors | Agent/Tool/extension services | plugin + Agent builder + hooks | hooks + scoped V2 plugins | TypeScript broad ExtensionAPI |
| 项目能力 trust | capability/plugin policy | folder trust + hash acknowledge | per-plugin-root trust | config/plugin origin | project trust |
| 工具裁剪 | request ToolRouter | Agent isolated registry + policy | allow/deny/session/depth filters | permission-derived materialization | active tool list + hooks |
| 子 Agent identity | forked thread | AgentProtocol/session | child session + coordinator | child session + Agent config | 无统一内建 |
| 递归限制 | host/session policy | 过滤 subagent tools | depth 硬上限 | 默认 deny task | 扩展自管 |
| 隔离 | thread/environment/sandbox | local/remote/browser | optional worktree | session/worktree/permission | 外部容器/进程 |
| reload 清理 | scoped extension data | registry reload/dispose | registry/session lifecycle | Scope close/finalizer | stale ctx invalidate |
| provider 扩展 | Responses-compatible registry | Gemini/A2A 为主 | xAI/BYOK config | 大量 provider plugins | built-in/config/extension composer |

## 能力继承的正确方向

不要写：

```text
child_capabilities = parent_capabilities ∪ child_requested
```

更安全的模型是：

```text
child_capabilities
  = host_hard_limit
  ∩ parent_session_limit
  ∩ child_role_limit
  ∩ current_mode_limit
  ∩ runtime_environment_limit
```

允许 child 自己增加专门工具，只能发生在 host 已注册且 parent/session 未禁止的范围内。

## Round 3 思考点

1. Gemini 为什么同时需要 folder trust 和 Agent hash acknowledge？
2. Grok Build 为什么允许 untrusted plugin 的 Agent metadata 被发现，却阻止 hooks/MCP/script？
3. OpenCode 为什么让 plugin load 并行、hook apply 串行？
4. Pi reload 后为什么要让旧 extension context 失效，而不是继续复用？
5. 子 Agent 能力为什么应做多层交集，而不是复制父 Agent 后再追加？
