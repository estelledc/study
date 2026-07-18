---
title: "09. Round 2：失败、取消与恢复状态机"
sidebar:
  hidden: true
---
# 09. Round 2：失败、取消与恢复状态机

## 本轮研究问题

第一轮回答了“正常情况下 Agent loop 如何工作”。第二轮改问：

> 当任意一步失败、被取消、被拒绝或超时时，系统怎样保证历史、工具状态和用户看到的结果仍然一致？

日常类比：正常流程像餐厅顺利出餐；可靠性研究不是再看一遍菜单，而是追踪停电、客人取消、后厨拒单、食材缺货和账单系统超时后，每张单最终落在哪个状态。

## 先区分四种终态

### Error：执行失败

动作被允许且开始了，但 provider、网络、工具或内部逻辑失败。

例子：

- provider 返回 500；
- shell 进程退出非零；
- tool handler panic/throw；
- stream 在 terminal event 前断开。

### Cancelled：被中止

动作没有按原计划完成，因为用户、上层 session 或取消信号终止了它。

取消不是普通 error：

- UI 通常不该显示“系统故障”；
- retry 不应自动重启用户明确取消的动作；
- pending/running 工具仍要进入终态；
- 已发生的副作用不能假装回滚。

### Denied / Rejected：政策或人拒绝

runtime 知道动作是什么，但政策或用户明确不允许执行。

它与取消的区别：

- deny 是能力/政策判断；
- cancel 可能只是用户不想继续当前运行；
- deny 结果往往需要回给模型，让它换方案；
- 某些系统将用户拒绝升级为整个 turn 终止。

### Recoverable transition：可恢复状态转换

当前请求无法直接继续，但 runtime 有一个受限恢复动作：

- context overflow → compaction → 重试一次；
- 401 → refresh token → 有界 backoff；
- transient provider error → 有界 retry；
- pending approval → 持久化后等待 resume。

它不是成功，也不是终态 error。

## 失败处理的共同不变量

### 不变量一：每个已开始对象必须有一个终态

对象可以是：

- Agent run；
- model turn；
- assistant message；
- tool call；
- permission request；
- compaction；
- subagent。

如果出现 `started/running` 却没有 `success/error/cancelled`，恢复时就不知道：

- 是否需要重试；
- 副作用是否可能已发生；
- UI 是否还该显示 loading；
- usage 是否完整。

### 不变量二：同一对象只能有一个权威终态

典型竞态：

```text
工具刚执行成功
        ↘
         用户取消同时到达
        ↗
```

如果 success 和 cancelled 都落盘，history 不再可解释。

Codex 使用 `terminal_outcome_reached` 原子标志；Gemini Scheduler 只 finalize terminal state；OpenCode event publisher 拒绝 duplicate result。

### 不变量三：取消信号不是撤销副作用

`AbortController.abort()` 或 `CancellationToken.cancel()` 只告诉协作者停止：

- 还没开始的调用可以不启动；
- 支持取消的进程可以 teardown；
- 已完成写文件不能自动消失；
- 外部 API 已接受请求时可能仍会生效。

因此取消后的状态必须记录“可能已执行到哪里”，不能只删 history。

### 不变量四：恢复必须有上限

无界 retry 会把暂态失败放大成：

- 费用失控；
- 重复副作用；
- 永久占用 session；
- 用户无法取回控制权。

五个项目都使用至少一种上限：

- retry count；
- max turns；
- one compact-and-retry；
- backoff schedule；
- timeout；
- Todo/structured-output gate fire count。

### 不变量五：历史保真与活动上下文分开

失败消息可以：

- 保留在完整 session history；
- 从下一次模型 context 中移除，避免模型重复看到无意义错误；
- 同时通过 UI event 告知用户。

Pi retry 就明确“从 Agent state 移除错误消息，但保留在 session history”。

## 统一失败管线

```text
trigger
  ↓
classify
  ├─ cancelled
  ├─ denied
  ├─ retryable
  ├─ overflow
  └─ terminal error
  ↓
settle active entities
  ├─ model turn
  ├─ assistant message
  ├─ tool calls
  └─ permission waits
  ↓
record evidence
  ├─ durable event/history
  ├─ UI status
  ├─ telemetry
  └─ usage/incomplete marker
  ↓
route
  ├─ stop
  ├─ retry with budget
  ├─ compact then retry
  ├─ await/resume
  └─ continue with alternate plan
```

任何项目如果只有 `catch (e) { print(e) }`，就缺少 settle 与 route 两层。

## Pi：把失败规范化成消息

### Agent 级取消

`Agent.abort()` 只对当前 active run 的 `AbortController` 发信号：

`pi@c6d83715:packages/agent/src/agent.ts:304-312`

`runWithLifecycle()` 无论执行成功还是失败，最终都调用 `finishRun()` 清理：

- `isStreaming = false`；
- streaming message 清空；
- pending tool ids 清空；
- idle promise resolve；
- active run 清除。

源码：`agent.ts:469-518`。

### 非预期异常也变成完整事件序列

如果 executor throw，`handleRunFailure()` 合成一个 assistant failure message，然后依次发：

```text
message_start
message_end
turn_end
agent_end
```

源码：`agent.ts:494-510`。

好处：UI 和 session listener 不需要为“函数直接 throw、没有任何结束事件”写另一套恢复逻辑。

### Idle 的严格定义

`agent_end` 只表示 loop 不再发新事件；真正 idle 要等所有 `agent_end` listener 完成，最后 `finishRun()` 清状态。

源码：`agent.ts:520-573`。

这个区别很重要，因为 listener 可能正在：

- 持久化消息；
- 触发 compaction；
- extension 在 agent_end 时追加消息。

### Retry 与 overflow 分流

`AgentSession._handlePostAgentRun()` 的顺序：

1. 检查 retryable error；
2. 准备 retry；
3. 若最终失败，发 `auto_retry_end`；
4. 检查 compaction；
5. 检查 extension 在 agent_end 后追加的队列。

源码：`agent-session.ts:1049-1090`。

`_isRetryableError()` 明确排除 context overflow，后者交给 compaction：

`agent-session.ts:2606-2614`

### 有界 exponential backoff

`_prepareRetry()`：

- 读取 retry settings；
- attempt 加一；
- 超过 maxRetries 停止；
- `baseDelayMs * 2^(attempt-1)`；
- 发 retry start event；
- 从活动 Agent context 移除失败 assistant；
- 可取消地 sleep；
- 取消 sleep 时发 retry end；
- 返回是否继续。

源码：`agent-session.ts:2616-2670`。

### Overflow 只恢复一次

Pi 将 overflow 分成：

- 已成功生成回复但 usage 超阈值：compact，但不重发已完成请求；
- 请求因 overflow 失败：移除活动错误消息、compact、自动 retry；
- 已经 compact-and-retry 过仍 overflow：报告明确失败，不无限循环。

源码线索：`agent-session.ts:1925-2025`。

### 边界

Pi core 没有 durable tool-call transaction。工具在 side effect 后、session listener 持久化前进程崩溃，恢复能力取决于具体工具和上层 session。

## Codex：取消时争夺唯一终态

### 分层 CancellationToken

turn 接收一个根 cancellation token；sampling 和每个 tool call 使用 child token。

这样：

- 取消 turn 能传播到请求与工具；
- 单个子任务可以拥有自己的生命周期；
- 父 token 不必被子任务反向取消。

源码：`codex@800715d:codex-rs/core/src/session/turn.rs:144-150,286-295,2106-2112`。

### ToolCallRuntime 的并发门

`ToolCallRuntime` 持有一个 `RwLock`：

- 支持并行的工具拿 read lock；
- 不支持并行的工具拿 write lock。

源码：`codex-rs/core/src/tools/parallel.rs:42-64,100-137`。

这表示“不可并行工具”会阻塞其他全部调用，而不仅是和同类型工具互斥。

### 取消与完成竞态

工具执行与 cancellation 用 `tokio::select!` 竞争。

取消到达时先检查：

- `terminal_outcome_reached` 是否已置位；
- dispatch handle 是否已经完成。

若工具已经到达终态，就保留真实完成结果；否则：

- 某些 runtime 需要自己完成 teardown，Codex 等它清理；
- 普通工具直接 abort task；
- 合成 aborted tool output；
- 发 tool-aborted lifecycle。

源码：`tools/parallel.rs:158-199`。

### 为什么有 `terminal_outcome_reached`

它防止：

```text
handler 已提交 success
→ 用户 cancel 到达
→ runtime 又提交 aborted
```

取消不能覆盖已经权威完成的终态。

### 非 Fatal 工具错误回给模型

`handle_tool_call()` 只把 `FunctionCallError::Fatal` 升级成整个 Codex error；其他错误转成失败 tool output，让模型有机会调整。

源码：`tools/parallel.rs:74-89,210-235`。

这体现：

- tool-local failure 不必杀死 turn；
- runtime invariant failure 才终止上层。

### Stream 断开

sampling request 若：

- cancellation token 触发 → `TurnAborted`；
- stream 返回 error → 返回对应 error；
- stream 在 `response.completed` 前关闭 → 显式 `Stream` error。

源码：`session/turn.rs:2034-2052`。

没有把“stream EOF”误当正常完成。

### Drain in-flight tools

模型流结束后，Codex 继续 drain 已启动的 tool futures，并把每个结果记录进 conversation。

源码：`turn.rs:1907-1932`。

这避免 assistant turn 已结束、工具仍悬空。

### Provider retry

`run_sampling_request()` 只重试 `err.is_retryable()`，并通过 provider 配置的最大 stream retry 数限制次数；context window exceeded 和 usage limit 走独立分支。

源码：`turn.rs:1157-1224`。

## Gemini CLI：所有工具都经过显式状态机

### 状态序列

Scheduler 中工具可能经过：

```text
validating
→ awaiting_approval
→ scheduled
→ executing
→ success / error / cancelled
```

`_processNextItem()` 分三段：

1. 并行验证；
2. 全部 active call ready 后并行执行；
3. finalize terminal calls。

源码：`gemini-cli@3ff5ba2:packages/core/src/scheduler/scheduler.ts:428-549`。

### 为什么“全部 ready 才执行”

如果同一批有三个调用：

- A policy allow；
- B 等用户确认；
- C policy deny。

在 B 还没决定时就执行 A，用户可能以为自己是在批准“整批计划”前，部分副作用却已发生。Scheduler 先让 active batch 都进入 ready/terminal，再启动 scheduled calls。

### Cancel all

`cancelAll()`：

- 拒绝尚未进入 Scheduler 的 requestQueue promise；
- active 非终态调用转 cancelled；
- queued calls 全部转 cancelled。

源码：`scheduler.ts:262-286`。

### Policy deny 与 confirmation cancel 不同

- DENY → error + `POLICY_VIOLATION`；
- ASK_USER → confirmation loop；
- 用户 Cancel → 当前调用 cancelled，并级联取消批次后续调用。

源码：`scheduler.ts:639-714`。

因此模型能分辨“政策不允许”和“用户取消了这次操作”。

### Non-interactive 下 ASK_USER

非交互模式没有确认 surface。`checkPolicy()` 遇到 ASK_USER 会 throw 明确错误，而不是：

- 永久等待；
- 自动 allow；
- 静默跳过。

源码：`scheduler/policy.ts:48-108`。

### Confirmation correlation

每次确认创建随机 `correlationId`，只接收匹配响应；wait 受 AbortSignal 管理。

源码：`scheduler/confirmation.ts:51-103,155-175`。

这防止多个并发确认的回复串线。

### 用户可修改后再批准

confirmation loop 支持：

- 外部 editor 修改；
- inline payload 修改；
- 修改后重新 build invocation；
- 再展示 diff。

源码：`confirmation.ts:105-199,231-290`。

批准绑定的是修改后的 invocation，不应继续执行旧参数。

### Model stream failure

`Turn.run()` 区分：

- user cancelled；
- invalid stream；
- unauthorized；
- ordinary structured error。

源码：`core/turn.ts:403-444`。

`GeminiClient` 还用 loop detector 与 max session turns 阻止逻辑无限循环。

## Grok Build：取消必须保护队列、子 Agent 与账本

### 两种取消语义

Grok Build 区分：

- 普通交互取消：取消当前运行 turn，保留后续排队输入；
- `send_now`：静默 cancel-and-send，让新 prompt 立即接管。

源码线索：

- `grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/prompt_queue.rs:219-272`
- `tasks_cancel.rs:208-224,350-424`

如果所有 cancel 都 `take()` 整个队列，用户排队的下一条 prompt 会被误删。

### 权威取消 identity

取消时使用真正被 teardown 的 running task prompt id；UI 当前 pin 只作竞态窗口兜底。

源码：`tasks_cancel.rs:421-424`。

这防止 cancel 事件记到已经切换后的新 prompt 上。

### 工具批次的级联

工具先逐个 prepare/approval，再并行 dispatch。

如果 prepare 阶段某个调用发生：

- permission reject；
- user cancel；
- follow-up；

后续未开始工具不会执行，而是生成明确的 cancelled tool result。

源码：`acp_session_impl/tool_calls.rs:284-383`。

模型历史仍然能看到每个原始 tool call 对应一个 result，不会留下协议缺口。

### Wait tool 可被 interjection 打断

对 `wait_tasks`、`Await` 等阻塞等待工具：

- 真正任务可以继续后台运行；
- 用户新消息到达时，当前 wait 返回 `cancelled` result；
- Agent 获得控制权处理用户消息。

源码：`tool_calls.rs:18-72,409-458`。

这不是取消后台任务，而是取消“当前等待”。

### Auth retry 去重

同一工具批次多个调用同时 401 时，共用 `OnceCell<bool>` 做一次 auth recovery，避免并发刷新同一 rotating token。

源码：`tool_calls.rs:405-458` 与 `sampler_turn.rs:63-108`。

### 用量 fail-closed

turn 结束时可等待 foreground subagent usage 最多 120 秒：

- 查询失败 → `fail_closed`；
- 超时且仍有 live id → `fail_closed`；
- 只有 background child 仍活跃 → 报告 incomplete，但不污染 session ledger；
- sticky apply miss → 报告 incomplete。

源码：`turn.rs:1094-1167`。

系统宁可承认 usage 可能少算，也不把不完整数字伪装成精确事实。

## OpenCode V2：把非法事件序列当 invariant failure

### Event publisher 是协议校验器

`createLLMEventPublisher()` 不只是写日志。它验证：

- delta 必须在 start 后；
- end 不能重复；
- tool call 名字不能中途变化；
- tool result 必须在 call 后；
- success result 不能重复；
- step finish 不能重复。

源码：`opencode@4a760b5:packages/core/src/session/runner/publish-llm-event.ts:91-193,239-408`。

这些违反协议的情况使用 `Effect.die`，因为继续投影会制造不可解释历史。

### Provider error

provider-error 会：

1. 标记 provider failed；
2. flush partial fragments；
3. 确保 assistant step 已开始；
4. 发布 `Step.Failed`。

源码：`publish-llm-event.ts:199-211,402-407`。

### Unsettled tools

`failUnsettledTools()` 为所有尚未落终态的调用发布 `Tool.Failed`，并保留：

- call id；
- assistant message id；
- providerExecuted；
- provider metadata。

源码：`publish-llm-event.ts:213-232`。

### 启动前修复旧 pending

新 runner 开始前扫描历史，把上次进程留下的 pending/running tool 标成 interrupted failure。

源码：`session/runner/llm.ts:119-139,383-391`。

这是 crash recovery，不是普通 turn 内错误处理。

### Permission reject

用户拒绝 permission 或 question 时：

- tool fibers 清空；
- unsettled tools 标 interrupted；
- runner interrupt；
- 不把拒绝包装成可 retry provider error。

源码：`runner/llm.ts:297-300`。

### Overflow recovery最多一层

普通 `runTurn` 可调用 `compactAfterOverflow`；压缩后进入 `runAfterOverflowCompaction`。若第二次仍 overflow，直接报告：

`Post-compaction provider attempt cannot recover another overflow`

源码：`runner/llm.ts:355-380`。

### 当前未完成边界

文件头明确仍未完成：

- durable status；
- attachment replacement 后拒绝 stale work；
- bounded provider retry；
- durable continuation recovery。

这些不能写成现有保证。

## 横向失败矩阵

| 场景 | Pi | Codex | Gemini CLI | Grok Build | OpenCode V2 |
|---|---|---|---|---|---|
| 用户取消 model stream | failure message 标 aborted | `TurnAborted` | `UserCancelled` event | turn cancelled + trigger | interrupt + settle tools |
| 工具取消 | error result / signal | aborted tool output | cancelled state/result | cancelled tool result | failed/interrupted event |
| 权限 deny | 扩展自定义 | handler/approval 层 | POLICY_VIOLATION | PermissionReject | BlockedError |
| 用户拒绝 | 扩展自定义 | approval lifecycle | batch cancel | turn cancelled | Declined interrupt |
| transient provider error | AgentSession backoff | provider retry budget | retryWithBackoff | sampler retry policy | V2 仍有 TODO |
| context overflow | compact + 最多一次 retry | auto compact/rollover | context manager/compress | compact-and-resubmit | compact + 一次 post-compact |
| stream 无 terminal | error message | explicit stream error | InvalidStream | sampler error | provider/step failed |
| 进程重启后 pending tool | session 依赖上层 | rollout/session recovery | session implementation | persisted session repair | 启动前 fail interrupted |

## 最值得复用的七条规则

1. **取消不是失败，也不是回滚。**
2. **已开始实体必须 exactly once 进入终态。**
3. **tool-local failure 优先回给模型，runtime invariant failure 才杀死 turn。**
4. **overflow 不走普通 retry budget。**
5. **等待用户的状态必须有 correlation id、取消和恢复策略。**
6. **完整 history 保留失败证据，活动 context 可移除无用错误。**
7. **无法证明完整时标 incomplete，不编造精确状态。**

## 本轮思考点

1. 为什么 Pi 在 retry 前从 Agent state 删除失败消息，却仍把它留在 session history？
2. Codex 为什么不能在 cancellation 到达时无条件覆盖工具结果为 aborted？
3. Gemini 为什么让 confirmation cancel 级联到同一批后续工具？
4. Grok Build 为什么取消 wait tool，而不一定取消它等待的后台任务？
5. OpenCode 为什么把 duplicate tool success 当 invariant failure，而不是忽略第二条？
