# 02. 核心 Agent Loop 深读

## 最小算法

所有项目都可以压缩成下面的伪代码：

```text
append(user_input)

while true:
    request = assemble_context(history, tools, policy, environment)
    response = stream_model(request)
    append(response)

    calls = parse_tool_calls(response)
    if calls is empty:
        if pending_input or stop_hook_requests_continue:
            append(continuation)
            continue
        break

    results = authorize_and_execute(calls)
    append(results)
```

真正的差异集中在五个词：`assemble`、`stream`、`authorize`、`execute`、`break`。

## Pi：把算法直接写出来

### 源码入口

- `pi@c6d83715:packages/agent/src/agent-loop.ts:155-275`
- `pi@c6d83715:packages/agent/src/agent-loop.ts:281-373`
- `pi@c6d83715:packages/agent/src/agent-loop.ts:413-790`

### 双层循环

Pi 最值得先读，因为控制流几乎就是伪代码：

```text
外层 while:
    内层 while(还有 tool calls 或 steering):
        注入 steering
        流式请求模型
        执行工具
        prepareNextTurn
        shouldStopAfterTurn

    查询 follow-up
    有则重新进入内层
    无则 agent_end
```

源码事实：

- 外层循环负责“Agent 本来要结束后又来了 follow-up”，见 `agent-loop.ts:169-174,262-274`。
- 内层循环负责工具 continuation 和 steering，见 `agent-loop.ts:173-260`。
- steering 在下一次 assistant response 前进入 history，见 `agent-loop.ts:181-190`。
- 模型 error 或 abort 会直接结束 run，见 `agent-loop.ts:196-200`。

这段设计把两类新消息分开：

| 消息 | 注入时机 | 用户意图 |
|---|---|---|
| steering | 当前工具批次完成后、下一次模型调用前 | 调整正在进行的任务 |
| follow-up | Agent 已经没有工具要调时 | 在当前任务之后追加工作 |

### 模型流

`streamAssistantResponse()` 做了四件事：

1. 可选地变换 Agent 上下文；
2. 转成 provider 可接受的消息；
3. 组装 system prompt、messages、tools；
4. 把 provider stream 翻译成 `message_start/update/end`。

关键点：partial assistant message 会先放入 context，再随着流事件原位替换，见 `agent-loop.ts:319-360`。这样 UI 可以实时显示，最终 history 又只保留完成版本。

### 工具批次

Pi 默认可并行，但只要批次中任一工具标记 `executionMode: "sequential"`，整批改为串行，见 `agent-loop.ts:413-428`。

并行路径并不是“结果谁先完成谁先入历史”：

- 工具真正执行可以并行；
- `Promise.all` 返回后，结果按原调用顺序转成 tool result message；
- 模型看到的函数调用与函数结果顺序保持稳定。

见 `agent-loop.ts:491-555`。

执行前还会：

- 查工具是否存在；
- 变换与校验参数；
- 运行 `beforeToolCall`，允许扩展 block；
- 执行工具并发出 progress；
- 运行 `afterToolCall`，允许调整结果；
- 规范化 tool result。

见 `agent-loop.ts:602-755`。

一个容易忽略的保护：如果模型因输出 token 上限而截断，Pi 不执行该响应中的工具调用，因为“能解析”不代表参数完整，见 `agent-loop.ts:207-214`。

### Pi 的退出条件

Pi 结束 run 需要同时满足：

- 当前模型没有可继续的工具调用；
- 没有 steering；
- 没有 follow-up；
- `shouldStopAfterTurn` 没有更早要求停止；
- 没有 error / abort。

这是最适合拿来理解其他四个项目的基准模型。

## Codex：循环只是 Session 内核的一部分

### 源码入口

- `codex@800715d:codex-rs/core/src/tasks/regular.rs:28-89`
- `codex@800715d:codex-rs/core/src/session/turn.rs:144-430`
- `codex@800715d:codex-rs/core/src/session/turn.rs:1130-1224`
- `codex@800715d:codex-rs/core/src/tools/router.rs:29-243`

### 第一层：RegularTask

`RegularTask::run()` 先发送 `TurnStarted`，处理预热的 model client，然后反复调用 `run_turn()`。

它结束前会检查 session input queue：

```text
run_turn(input)
if input_queue empty:
    return
else:
    input = []
    run_turn again
```

见 `tasks/regular.rs:71-88`。

这里的意义是：UI 在模型运行期间提交的新输入不会自动丢失。`run_turn()` 内部已经尝试消费 pending input；task 外层再做一次兜底。

### 第二层：run_turn

`run_turn()` 比 Pi 的循环多了大量“请求前状态冻结”：

1. 必要时在采样前压缩；
2. 捕获当前 `StepContext`；
3. 记录 world state 差异；
4. 解析显式 Skill、Plugin、Connector 和 extension input；
5. 跑 session/turn hooks；
6. 记录用户输入；
7. 进入 sampling loop。

见 `turn.rs:144-209`。

`StepContext` 的工程意义是：同一次模型请求看到的上下文、工具定义和执行工具时使用的配置来自同一个快照，避免请求中途配置变化造成“模型看到 A，runtime 按 B 执行”。

### 第三层：sampling loop

循环每次：

1. 按条件取出运行中的 pending input；
2. 记录提醒与动态 world state；
3. 从 history 构造 model input；
4. 调 `run_sampling_request()`；
5. 判断模型是否需要 follow-up；
6. 判断是否有 pending input；
7. 处理 token limit 与 auto compact；
8. 没有 continuation 时运行 stop hooks。

见 `turn.rs:226-430`。

Codex 把 model client session 设为 turn-scoped，并在当前 turn 的 retry 中复用 WebSocket 与 sticky routing 状态，见 `turn.rs:219-224`。这是“逻辑 turn”和“传输会话”对齐的例子。

### 第四层：模型请求与工具 runtime

`run_sampling_request()`：

- 为当前 step 构建 ToolRouter；
- 读取 base instructions；
- 创建 `ToolCallRuntime`；
- 组装 prompt；
- 调 `try_run_sampling_request()`；
- 只对可重试错误消耗 provider retry budget。

见 `turn.rs:1130-1224`。

`ToolRouter` 分开保存：

- registry：runtime 真正可分发的工具；
- model-visible specs：本次向模型广告的工具。

见 `tools/router.rs:35-38`。这个分离非常关键：工具存在于进程中，不等于要在每次请求里暴露给模型。

### Codex 的退出条件

除了“模型没有工具调用”，还要考虑：

- pending input；
- model 自己要求 follow-up；
- context rollover / auto compact；
- stop hook 是否要求继续；
- session task 外层队列是否又有输入；
- turn 是否被取消或出错。

因此 Codex 没有一个像 Pi 那样独立、短小的 `agentLoop()`。它把 continuation 规则分布在 task、turn、sampling 和 hook 层。

## Gemini CLI：Turn 产出请求，Scheduler 结算工具

### 源码入口

- `gemini-cli@3ff5ba2:packages/cli/src/nonInteractiveCli.ts:66-75,305-535`
- `gemini-cli@3ff5ba2:packages/core/src/core/client.ts:614-1055`
- `gemini-cli@3ff5ba2:packages/core/src/core/turn.ts:241-503`
- `gemini-cli@3ff5ba2:packages/core/src/scheduler/scheduler.ts:95-353`

### 两条非交互路径

当前快照不是单一路径：

- feature flag `getAgentSessionNoninteractiveEnabled()` 开启时，转入新的 agent session 路径；
- 否则运行原有 `runNonInteractive` 循环。

见 `nonInteractiveCli.ts:66-75`。因此阅读时不能把某一条路径称为“Gemini CLI 唯一架构”。

### 原有 CLI 循环

CLI 外层做：

```text
while true:
    responseStream = geminiClient.sendMessageStream(...)
    收集文本和 ToolCallRequest
    completed = scheduler.schedule(toolCalls)
    currentMessages = tool results
```

见 `nonInteractiveCli.ts:305-363,453-520`。

这个循环的特点是：模型流只产出标准化的 `ToolCallRequestInfo`，CLI 不直接执行工具，而是交给 `Scheduler`。

### GeminiClient

`processTurn()` 在请求前处理：

- context manager 或 chat compression；
- context overflow 预估；
- Gemini 对 function call / function response 相邻性的协议要求；
- IDE context；
- loop detector；
- model router 与 availability；
- 根据最终模型刷新工具描述。

见 `client.ts:637-807`。

随后 `Turn.run()` 只负责解释 provider stream：

- thought → Thought event；
- text → Content event；
- function call → ToolCallRequest；
- finish reason → Finished event；
- invalid stream / error → 明确错误事件。

见 `turn.ts:256-445`。

### Scheduler

`Scheduler` 是工具生命周期状态机，不只是 executor：

1. 对批次排队，避免多个批次同时破坏状态；
2. 从 registry 解析工具；
3. 参数校验；
4. policy check；
5. before-tool hook；
6. 用户确认；
7. 执行与进度；
8. 生成 completed result。

它还持有 `schedulerId`、`subagent`、`parentCallId`，说明主 Agent 与子 Agent 可以共用同一套调度抽象，见 `scheduler.ts:64-72,99-138`。

### Gemini CLI 的退出条件

除无工具调用外，还包括：

- loop detector；
- maximum session turns；
- `STOP_EXECUTION` 工具错误；
- Before/AfterAgent hooks 的 stop/block；
- next-speaker check 让模型自己继续；
- 用户取消；
- invalid stream。

其中 next-speaker check 会在没有 pending tools 时询问是否仍应由模型继续；若答案为 model，则递归发送 `Please continue.`，见 `client.ts:875-904`。

## Grok Build：actor 外层 + prompt 内层

### 源码入口

- `grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/run_loop.rs:33-304`
- `grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/turn.rs:1710-2305`
- `grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/sampler_turn.rs:848-914`
- `grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/tool_dispatch.rs:10-58`

### Session actor 外层

`run_session()` 的 `tokio::select!` 同时接收：

- idle memory flush timer；
- memory dream timer；
- model switch；
- chat state event；
- UI notification event；
- prompt completion；
- session command。

见 `run_loop.rs:33-221`。

用户 prompt 到达后不会直接在 mailbox 主循环里执行全部工作，而是：

1. `queue_input()`；
2. 必要时取消旧 turn；
3. `maybe_start_running_task()`。

见 `run_loop.rs:281-304`。这样 actor 仍能处理其他事件，不会被一次长模型请求完全堵住。

### prompt 内层

真正的 agentic loop 在 `turn.rs:1799-2305`：

1. 注入 interjection、Skill reminder、monitor event、memory、MCP reminder；
2. 检查 pre-sampling compaction；
3. 解析本轮有效工具；
4. 从 chat state 构造请求；
5. 通过 sampler actor 请求模型；
6. 记录流、usage、assistant item；
7. 无工具时检查 Todo gate、late interjection 和 structured output；
8. 有工具时执行工具批次；
9. 把结果写回 chat state，继续循环。

这比最小算法多出两个产品化 gate：

- **Todo gate**：模型想结束但仍有 pending/in-progress todo 时，可以注入提醒让模型继续，且有最大触发次数。
- **Structured output gate**：后端不支持原生 schema 时，用合成工具要求模型提交最终 JSON，并限制纠错次数。

### sampler actor

`run_turn_via_sampler()` 先刷新本 turn 的 sampler config，再调用 `submit_and_collect()`。模型失败可以返回两类“非终态”：

- compact 后重新提交；
- 刷新认证后重新提交。

见 `sampler_turn.rs:848-914`。

### 工具并发

Grok Build 允许不同工具并发，但会从参数中提取目标文件路径：

- 相同路径共享 mutex，按模型顺序串行；
- 无路径或不同路径可并发。

见 `tool_dispatch.rs:40-58`。

这比“整批并行或整批串行”更细，直接针对最危险的同文件写冲突。

## OpenCode V2：先持久化，再执行

### 源码入口

- `opencode@4a760b5:packages/core/src/session/input.ts:41-81,216-288`
- `opencode@4a760b5:packages/core/src/session/execution/local.ts:10-36`
- `opencode@4a760b5:packages/core/src/session/runner/llm.ts:43-90,173-405`
- `opencode@4a760b5:packages/core/src/tool/registry.ts:23-121`

### 先说明双运行时

当前产品目录仍有成熟路径：

```text
packages/opencode/src/session/prompt.ts
→ session/llm.ts
→ session/processor.ts
→ session/tools.ts
```

同时 `packages/core/src/session/` 正在建设 V2 event-sourced runtime。V2 文件头的 checklist 明确还有未完成项，例如 durable multi-node ownership、完整插件/MCP工具物化、状态结算和重复工具调用上限。

所以本章把 V2 当“当前正在落地的目标内核”，不把 TODO 当已完成能力。

### durable input

`SessionInput.admit()` 先发布 `PromptAdmitted` 事件，事件拥有 durable sequence 后才返回输入对象，见 `input.ts:41-81`。

steering 和普通 queue 被分别持久化；runner 再按时机 promotion：

- `promoteSteers()`：批量提升截止序列前的 steering；
- `promoteNextQueued()`：只提升下一个普通队列输入。

这使进程崩溃后仍能知道哪些输入已接收、哪些已进入模型历史。

### SessionExecution

本地 execution 层确保同一 session 只有一个 active drain，显式 resume 可以 join，多个 wake 会合并，见 `execution/local.ts:10-36`。

它把“输入来了”与“谁来运行 session”分开，为未来 remote placement 留出位置。

### SessionRunner

V2 `SessionRunner` 的核心流程：

1. 选 session 和 agent；
2. 初始化 context epoch；
3. 提升 steering/queue；
4. 解析模型、历史、system context 和 tools；
5. 必要时 compaction；
6. 捕获文件 snapshot；
7. 流式调用 provider；
8. 每个 LLM event 先发布；
9. 本地工具调用在 side effect 前已有 durable call event；
10. 工具并行结算后决定 continuation。

见 `runner/llm.ts:173-348`。

最关键的可靠性顺序是：

```text
模型产生 tool-call event
→ 发布并获得 assistant message identity
→ ToolRegistry.settle()
→ 发布 tool result
→ 等待所有 tool fiber
→ 决定是否继续下一 model turn
```

### 双层输入循环

V2 runner 也有两个循环：

```text
while 有 queue:
    while 有 tool continuation 或 steer:
        runTurn()
    取下一个 queue
```

见 `runner/llm.ts:383-405`。它和 Pi 的双层循环语义相近，但输入与中间状态都先进入数据库事件。

## 五种循环放在一起

| 维度 | Pi | Codex | Gemini CLI | Grok Build | OpenCode V2 |
|---|---|---|---|---|---|
| 循环所有者 | async function | SessionTask + turn | client/session + Scheduler | SessionActor prompt task | SessionRunner |
| 运行中输入 | steering | input queue | injection / session | interjection / queue | durable steer |
| 结束后输入 | follow-up | task 再检查队列 | 新 prompt | pending inputs | durable queue |
| 工具并发 | 批次级并/串 | registry 声明 + runtime | Scheduler 状态机 | 同文件锁，其余并发 | fiber 并发结算 |
| 压缩 | AgentSession 外层 | turn 内 pre/mid | client context service | turn 内 preflight | runner transition |
| stop gate | hook | stop hook | loop/turn/hook | todo/structured/interjection | durable continuation |
| 持久化耦合 | loop 外层 | 深度集成 | chat/session service | chat state + actor | event-first |

## 本章思考点

1. 为什么 OpenCode V2 选择“tool call 先持久化，再执行副作用”，而 Pi 可以直接调用 `tool.execute()`？
2. Grok Build 为什么不把所有工具整批串行，而要按目标文件加锁？
3. Codex 的 `StepContext` 解决了哪类配置竞态？
4. Gemini CLI 为什么把 `Turn` 和 `Scheduler` 分成两个对象？

这些问题的答案都在本章。后续项目章节会补充具体设计代价。
