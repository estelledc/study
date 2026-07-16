# 10. Round 2：可靠性源码追踪卡

## 使用方法

每张卡只追一个故障变量，按“触发 → 状态变化 → 证据 → 退出”阅读。

不要同时假设网络失败、用户取消、权限拒绝和 context overflow；那样无法判断是哪条恢复逻辑起作用。

## Pi

### 卡 P1：用户在模型流式输出时取消

**触发**

当前 `Agent` 有 active run，用户调用 `abort()`。

**链路**

```text
Agent.abort()
→ active AbortController.abort()
→ provider stream / tool 接收 signal
→ loop 返回 aborted 或 executor throw
→ handleRunFailure(aborted=true)
→ assistant stopReason = aborted
→ message_start/end
→ turn_end
→ agent_end
→ finishRun 清 runtime state
```

**源码**

- `pi@c6d83715:packages/agent/src/agent.ts:304-312`
- `agent.ts:469-518`

**关键判断**

取消后仍然生成 assistant message 和结束事件，不直接把 active run 从内存删掉。

**否则会怎样**

- UI 一直 streaming；
- session 没有终止证据；
- `waitForIdle()` 无法确定 listener 是否完成。

### 卡 P2：工具参数来自被截断的模型响应

**触发**

assistant response `stopReason === "length"`，但 content 中已经出现 tool call。

**链路**

```text
parse tool calls
→ 检查 stopReason
→ 不执行任何 call
→ 为每个 call 生成 error tool result
→ 模型下一轮可重新提交完整参数
```

**源码**

- `pi@c6d83715:packages/agent/src/agent-loop.ts:202-216`
- `agent-loop.ts:376-410`

**关键判断**

“JSON 能解析”不等于“参数生成完整”。

### 卡 P3：provider 暂态错误

**触发**

assistant error 被 `isRetryableAssistantError()` 判定为 overloaded、rate limit 或 server error。

**链路**

```text
agent_end
→ AgentSession._handlePostAgentRun
→ _isRetryableError
→ _prepareRetry
→ attempt + 1
→ emit auto_retry_start
→ 从活动 context 移除失败 assistant
→ abortable exponential sleep
→ agent.continue()
```

**源码**

- `pi@c6d83715:packages/coding-agent/src/core/agent-session.ts:1049-1090`
- `agent-session.ts:2606-2670`

**关键判断**

错误留在 session history，但不重复送给模型。

### 卡 P4：context overflow 连续发生

**触发**

第一次请求 overflow，compact 后重试仍 overflow。

**链路**

```text
first overflow
→ _overflowRecoveryAttempted = true
→ compact
→ retry
→ second overflow
→ emit compaction_end(error)
→ 不再 compact/retry
→ 提示减少 context 或换大窗口模型
```

**源码**

`pi@c6d83715:packages/coding-agent/src/core/agent-session.ts:1925-1992`

**关键判断**

overflow recovery budget 是 1，不和普通 provider retry 混用。

## Codex

### 卡 C1：取消在工具完成前到达

**触发**

tool dispatch 正在等待或执行，turn cancellation token 触发。

**链路**

```text
tokio::select
→ cancellation branch
→ terminal_outcome_reached == false
→ runtime-specific teardown 或 abort task
→ 构造 AbortedToolOutput
→ notify_tool_aborted
→ 返回失败 tool result
```

**源码**

`codex@800715d:codex-rs/core/src/tools/parallel.rs:158-199`

**关键判断**

无论 handler 是否支持内部清理，模型都收到一个对应 tool result。

### 卡 C2：取消与工具完成同时发生

**触发**

handler 已到终态，cancellation 几乎同时到达。

**链路**

```text
cancel branch
→ terminal_outcome_reached 或 handle.is_finished
→ await 原 handler result
→ 保留 completed lifecycle
→ 不再发 aborted lifecycle
```

**源码**

- `parallel.rs:162-170`
- 对应测试：`parallel.rs:660` 之后

**关键判断**

真实完成结果优先，取消不能改写过去。

### 卡 C3：工具 handler 返回普通错误

**触发**

registry dispatch 返回非 Fatal `FunctionCallError`。

**链路**

```text
handle_tool_call
→ failure_response
→ 根据 payload 类型生成 function/custom/tool-search output
→ success=false
→ 记录 conversation
→ 模型可换方案
```

**源码**

`codex@800715d:codex-rs/core/src/tools/parallel.rs:74-89,210-235`

**关键判断**

局部工具失败不是整个 runtime 崩溃。

### 卡 C4：provider stream 提前 EOF

**触发**

stream 返回 `None`，但没有 `response.completed`。

**链路**

```text
stream.next() == None
→ CodexErr::Stream
→ run_sampling_request 判断是否 retryable
→ 有预算则 reconnect/retry
→ 无预算则 turn error
```

**源码**

- `codex@800715d:codex-rs/core/src/session/turn.rs:2034-2052`
- `turn.rs:1157-1224`

**关键判断**

EOF 不是成功终态。

### 卡 C5：模型流结束但工具仍在运行

**触发**

stream terminal event 已到，`in_flight` 仍有 tool futures。

**链路**

```text
response loop end
→ drain_in_flight
→ 按 FuturesOrdered 顺序等待
→ 每个结果 record_conversation_items
→ 再结束 sampling request
```

**源码**

`codex@800715d:codex-rs/core/src/session/turn.rs:1907-1932,2494-2505`

**关键判断**

turn 结束条件包含“工具已结算”，不只包含“provider 已结束”。

## Gemini CLI

### 卡 G1：工具 policy 为 DENY

**触发**

`PolicyEngine.check()` 返回 `DENY`。

**链路**

```text
Scheduler validating
→ checkPolicy
→ DENY
→ createErrorResponse
→ status = Error
→ errorType = POLICY_VIOLATION
→ finalize call
```

**源码**

`gemini-cli@3ff5ba2:packages/core/src/scheduler/scheduler.ts:639-666`

**关键判断**

deny 是模型可见的工具错误，不自动改成用户取消。

### 卡 G2：非交互模式需要用户确认

**触发**

policy 返回 ASK_USER，但 `config.isInteractive() === false`。

**链路**

```text
checkPolicy
→ 无 confirmation surface
→ throw 明确错误
→ Scheduler 转 unhandled/error response
→ 不执行工具
```

**源码**

`gemini-cli@3ff5ba2:packages/core/src/scheduler/policy.ts:48-108`

**关键判断**

缺少确认 UI 时必须 fail closed。

### 卡 G3：用户在确认框选择 Cancel

**触发**

confirmation response 的 outcome 是 `Cancel`。

**链路**

```text
correlationId 匹配
→ resolveConfirmation 返回 Cancel
→ 当前 call = Cancelled
→ cancelAllQueued
→ 同批剩余调用不执行
```

**源码**

- `scheduler/confirmation.ts:63-103,155-175`
- `scheduler/scheduler.ts:702-714`

**关键判断**

一个 batch 的确认不能让“前半批已执行、后半批取消”悄悄发生。

### 卡 G4：确认时用户修改文件内容

**触发**

用户选择 external editor 或 inline modification。

**链路**

```text
AwaitingApproval
→ 修改参数
→ tool.build(updatedParams)
→ state.updateArgs
→ 重新进入 confirmation loop / ProceedOnce
→ 执行新 invocation
```

**源码**

`gemini-cli@3ff5ba2:packages/core/src/scheduler/confirmation.ts:105-199,231-290`

**关键判断**

批准对象必须是最终参数，不是最初草稿。

### 卡 G5：模型返回空或畸形 stream

**触发**

`GeminiChat` 抛 `InvalidStreamError`。

**链路**

```text
Turn.catch
→ yield InvalidStream event
→ CLI 清空 toolCallRequests
→ 报明确错误
→ 不把空 stream 当正常 assistant answer
```

**源码**

- `core/turn.ts:403-444`
- `cli/nonInteractiveCli.ts:435-450`

## Grok Build

### 卡 X1：用户 send-now 新 prompt

**触发**

当前 turn running，用户要求新 prompt 立即接管，且 goal mode 不禁止取消。

**链路**

```text
queue_input(send_now=true)
→ 新 prompt 排队并标记下一运行
→ cancel_turn_for_send_now
→ 当前 turn 终态 = Cancelled
→ cancelTrigger = send_now
→ 不显示普通取消噪声
→ 新 prompt 启动
```

**源码**

- `grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/prompt_queue.rs:219-272`
- `tasks_cancel.rs:208-224,457-473`

**关键判断**

这是 cancel-and-continue，不是用户放弃整个 session。

### 卡 X2：普通取消但队列还有下一 prompt

**触发**

用户取消正在运行的 turn，后面已有 queued prompt。

**链路**

```text
cancel_running_task
→ 只移除 running turn
→ 保留 queued user inputs
→ 记录 queued_after_cancel
→ actor 继续 promote 下一 prompt
```

**源码**

`grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs:350-424`

**关键判断**

取消当前工作不等于清空用户未来意图。

### 卡 X3：工具批次中第一个权限拒绝

**触发**

批次第一个 tool 在 prepare/approval 返回 `PermissionReject`。

**链路**

```text
final_result = PermissionReject
→ 后续 tool 不 prepare/execute
→ 为每个后续 call 写 cancelled tool result
→ turn outcome = Cancelled(PermissionRejected)
```

**源码**

- `tool_calls.rs:284-383`
- `turn.rs:2260-2279`

**关键判断**

模型协议仍保持“一次 call 对应一次 result”。

### 卡 X4：等待后台任务时用户插话

**触发**

Agent 正在执行 `wait_tasks`，interjection buffer 出现用户消息。

**链路**

```text
wait tool 与 interjection select
→ interjection 胜出
→ wait tool result.status = cancelled
→ 后台任务不必停止
→ 模型下一轮处理用户消息
```

**源码**

`grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/tool_calls.rs:18-72,409-458`

### 卡 X5：foreground subagent usage 等待超时

**触发**

turn 完成，但 foreground child 在最大等待时间后仍 live。

**链路**

```text
freeze_prompt_usage
→ poll outstanding reply
→ deadline reached
→ UsageDrainOutcome.fail_closed = true
→ prompt/session usage 标 incomplete
→ turn 仍可完成
```

**源码**

`grok-build@b189869:xai-grok-shell/src/session/acp_session_impl/turn.rs:1094-1167`

**关键判断**

计费/用量证据不完整不应阻塞用户永久等待，但必须明确降级置信度。

## OpenCode V2

### 卡 O1：stream 出现 tool result before call

**触发**

provider adapter 产生 `tool-result`，但 publisher 没记录对应 tool call。

**链路**

```text
publisher.publish(tool-result)
→ tools map 查不到 called=true
→ Effect.die("Tool result before call")
→ runner 进入 failure settlement
→ 不写不可解释 success
```

**源码**

`opencode@4a760b5:packages/core/src/session/runner/publish-llm-event.ts:337-345`

**关键判断**

协议乱序是 runtime invariant 失败，不是普通工具错误。

### 卡 O2：provider error 时还有未结算工具

**触发**

provider stream failure，部分工具已 called 但没有 result。

**链路**

```text
provider-error
→ failAssistant
→ runner 检查 stream failure
→ failUnsettledTools
→ 每个 tool 发布 Tool.Failed
→ providerExecuted metadata 保留
```

**源码**

- `publish-llm-event.ts:199-232,402-407`
- `session/runner/llm.ts:289-314`

### 卡 O3：进程重启后历史存在 running tool

**触发**

上次进程在副作用期间退出，数据库投影仍显示 pending/running。

**链路**

```text
SessionRunner.run
→ failInterruptedTools
→ 扫描 projected context
→ pending/running → Tool.Failed("Tool execution interrupted")
→ 再开始新 provider turn
```

**源码**

`opencode@4a760b5:packages/core/src/session/runner/llm.ts:119-139,383-391`

**关键判断**

恢复先清理旧不确定状态，再接新输入。

### 卡 O4：overflow 后压缩成功，但再次 overflow

**触发**

第一次 provider attempt overflow，compaction 成功；post-compaction attempt 再次 overflow。

**链路**

```text
runTurn
→ compactAfterOverflow
→ ContinueAfterOverflowCompaction
→ runAfterOverflowCompaction
→ second overflow
→ terminal die
→ 不进行第二轮压缩
```

**源码**

`opencode@4a760b5:packages/core/src/session/runner/llm.ts:355-380`

### 卡 O5：用户拒绝 permission

**触发**

tool settlement 等待 PermissionV2，用户回复 reject。

**链路**

```text
Permission.Replied(reject)
→ Deferred.fail(DeclinedError)
→ 同 session 其他 pending permission 一并 reject
→ runner 识别 user declined
→ clear tool fibers
→ fail unsettled tools
→ interrupt
```

**源码**

- `core/permission.ts:220-247`
- `session/runner/llm.ts:297-300`

## 迁移到自己项目时的最小测试集

1. provider stream 无 terminal event。
2. tool success 与 cancel 同时到达。
3. tool call 有 start 无 result，模拟进程重启。
4. policy deny 与用户 cancel 分别产生不同状态。
5. confirmation response 使用错误 correlation id。
6. retry sleep 中用户取消。
7. overflow → compact → 再 overflow。
8. 同批第一个工具拒绝，后续工具不得执行。
9. queued input 在取消当前 turn 后仍存在。
10. duplicate tool result 被拒绝或幂等处理。

## Round 2 自测

1. 哪个项目最明确地验证 provider event 的顺序？它为什么必须这么严格？
2. 哪个项目最明确地区分“取消等待”与“取消后台任务”？
3. 如果用户批准前修改了工具参数，为什么旧批准不能复用？
4. 为什么 context overflow 不应该占用普通 500/rate-limit retry budget？
5. 进程崩溃后看到 running tool，为什么不能直接重新执行？
