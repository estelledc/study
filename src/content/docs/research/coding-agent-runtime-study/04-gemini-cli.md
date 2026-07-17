# 04. Gemini CLI：模型流与工具调度分层

## 一句话定位

Gemini CLI 像“设计部 + 施工调度中心”：`GeminiClient` 和 `Turn` 负责与模型对话、解释模型输出；`Scheduler` 和 `PolicyEngine` 负责工具是否能执行、是否要确认、怎样进入终态。

固定快照：`google-gemini/gemini-cli@3ff5ba2`。

## 仓库分层

根 workspace 主要包含：

- `packages/cli`：参数、终端 UI、non-interactive 入口；
- `packages/core`：模型 client、turn、工具、政策、MCP、agents、context；
- 其他 packages：A2A server、VS Code companion、test utilities 等。

它是 TypeScript monorepo，CLI 使用 Ink/React 风格 TUI，core 保持较强的 UI 独立性。

## 入口与双路径

`packages/cli/src/gemini.tsx` 根据 `config.isInteractive()` 选择交互 UI 或 `runNonInteractive()`。

当前 non-interactive 入口又有 feature flag：

```ts
if (config.getAgentSessionNoninteractiveEnabled()) {
  return runNonInteractiveAgentSession(params);
}
```

源码：`packages/cli/src/nonInteractiveCli.ts:66-75`。

这说明仓库正把旧的 CLI-owned loop 迁向 agent session 抽象。研究时要区分：

- **原有路径**：CLI 自己循环，直接消费 `GeminiClient` 事件并调用 Scheduler。
- **agent session 路径**：`LegacyAgentSession` 拥有 agentic loop，CLI 主要负责输入输出适配。

“LegacyAgentSession” 这个名字不表示代码不可用，而表示它是新 session abstraction 迁移中的兼容实现。

## 核心对象

### GeminiClient

负责：

- chat 初始化与恢复；
- context management / compression；
- model routing 与 availability；
- loop detection；
- tool descriptions 随模型刷新；
- Before/AfterAgent hooks；
- next-speaker continuation；
- 产出统一 stream event。

它不是低层 HTTP client，而是一次 Agent 对话的控制面。

### Turn

`Turn` 是单次模型流解释器：

- 保存 pending tool calls；
- 保存 debug responses 与 citation；
- 读取 Gemini stream；
- 把 thought、text、function call、finish 和 error 转成内部事件。

源码：`packages/core/src/core/turn.ts:241-503`。

### Scheduler

负责完整工具生命周期：

- batch queue；
- tool resolution；
- validation；
- policy；
- hook；
- confirmation；
- execution；
- progress；
- completion/cancellation。

源码：`packages/core/src/scheduler/scheduler.ts:95-353`。

### PolicyEngine

负责将工具名、参数、MCP server、subagent 和 shell 子命令映射到：

- `ALLOW`
- `ASK_USER`
- `DENY`

它是 Scheduler 的确定性政策输入，不是 prompt。

## 一次非交互请求

```text
输入字符串
  ↓
slash command / @ command 预处理
  ↓
GeminiClient.sendMessageStream()
  ↓
processTurn()
  ├─ context management / compression
  ├─ overflow 预估
  ├─ IDE context
  ├─ loop detector
  ├─ model router
  └─ Turn.run()
       ├─ text/thought events
       └─ ToolCallRequest events
  ↓
Scheduler.schedule(tool calls)
  ├─ registry + validation
  ├─ policy + confirmation
  └─ execute
  ↓
tool response parts
  ↓
再次 sendMessageStream()
```

旧 CLI 外层循环见 `nonInteractiveCli.ts:305-520`。

## Turn 为什么只产出 ToolCallRequest

`Turn.handlePendingFunctionCall()`：

1. 规范化工具名和参数；
2. 为缺少 id 的调用生成稳定 id；
3. 从 registry 取工具，仅用于构建显示信息；
4. 把请求放入 `pendingToolCalls`；
5. 产出 `ToolCallRequest` 事件。

源码：`turn.ts:448-503`。

它不在这里执行工具，因为 model stream parsing 与工具政策是两个变化速度不同的领域：

- provider stream 受 Gemini API 影响；
- 工具执行受本地政策、MCP、确认 UI 和 sandbox 影响。

分开后，两边可以独立测试和替换。

## 请求前的上下文管理

`GeminiClient.processTurn()` 在模型调用前可能走两套机制：

### Context Manager 开启

- 渲染经过管理的 history；
- 区分 display content 与真正发给 API 的 processed content；
- late-bind 当前 prompt；
- 把 token ground truth 回流给 context manager。

源码：`client.ts:643-678,829-836`。

### Context Manager 未开启

- 调旧的 chat compression service；
- 成功时发送 `ChatCompressed` 事件。

源码：`client.ts:688-694`。

这说明“用户看到的原始输入”“持久化历史”“模型实际收到的输入”可以是三个对象，必须明确各自用途。

## Function call 相邻性

Gemini API 要求 model 的 function call 后紧跟 user function response。若中间插入 IDE context，会破坏协议。

所以 `processTurn()` 检查 history 尾部是否有 pending function call；只有没有时才注入 IDE context，见 `client.ts:717-742`。

这是一个典型例子：

> 动态上下文不是想插就插，它受 provider 对话语法约束。

## Model routing

一次 sequence 内：

- 若已有 `currentSequenceModel`，保持粘性；
- 否则调用 model router；
- 再经过 availability policy；
- 最后按确定的 model 刷新工具描述。

源码：`client.ts:765-803`。

模型粘性避免同一 tool continuation 中途切模型造成能力和格式漂移。

## Scheduler 状态机

### 批次队列

如果 Scheduler 正在处理或已有 active call，新批次进入 `requestQueue`；取消信号可以把尚未开始的批次移除，见 `scheduler.ts:195-259`。

### 批次启动

`_startBatch()`：

1. 清空上批状态；
2. 读取当前 approval mode；
3. 对特殊 topic tool 排序；
4. 从 registry 解析每个工具；
5. 找不到工具时生成 error call；
6. 校验并入队；
7. `_processQueue()` 驱动状态转换；
8. finally 中清理并启动下一批。

源码：`scheduler.ts:300-353`。

### 为什么需要状态机

工具调用可能处于：

- validating；
- awaiting approval；
- scheduled；
- executing；
- success；
- error；
- cancelled。

UI、MCP progress、用户取消和 telemetry 都需要观察这些中间态。直接 `await tool.execute()` 无法稳定表达它们。

## PolicyEngine

### Shell 解析

PolicyEngine 不只匹配完整命令字符串，还会：

- 解析复合命令；
- 识别重定向；
- 递归剥离 `bash -c` 等 wrapper；
- 对每个子命令重新检查；
- 聚合最严格决策。

源码：`policy/policy-engine.ts:344-470`。

### Fail-closed 边界

当 parser 失败：

- 若已有 DENY 规则，立即拒绝；
- YOLO 模式下，如果规则依赖参数限制但参数无法验证，拒绝；
- 普通模式回退到默认 `ASK_USER` 或 non-interactive 下的 `DENY`。

见 `policy-engine.ts:366-396`。

正确直觉是：

> 看不懂命令时，不能假装它匹配了安全 allowlist。

### Policy 不是 sandbox

PolicyEngine 决定是否批准工具调用，但工具进程最终能访问什么，还取决于 Gemini sandbox 设置和宿主环境。两者仍是不同层。

## 子 Agent

Gemini CLI 把子 Agent 暴露成统一 `AgentTool`：

```text
agent_name + complete prompt
  ↓
registry 查 AgentDefinition
  ↓
按 input schema 映射参数
  ↓
根据 local/remote、session/non-session 选择 Invocation
  ↓
沿用工具确认和执行协议
```

源码：`packages/core/src/agents/agent-tool.ts:36-125,156-243`。

值得注意：

- prompt schema 强调必须给完整上下文；
- 子 Agent 可以是 local、remote、browser；
- AgentTool 自己也走 `shouldConfirmExecute()`；
- Scheduler 能携带 `subagent` 和 `parentCallId`。

因此子 Agent 不只是“再调用一次模型”，而是工具系统中的一种带独立上下文与能力边界的 invocation。

## Loop detector 与 next-speaker

GeminiClient 同时有两种 continuation 判断：

### Loop detector

模型/工具行为重复时：

- 第一次可进入恢复；
- 再次检测到则停止；
- 受 bounded turns 限制。

源码：`client.ts:747-763,810-855`。

### Next-speaker check

没有 pending tools 时，还会判断下一位说话者应是 user 还是 model。若仍应由 model 继续，自动发送 `Please continue.`，见 `client.ts:875-904`。

一个防无限循环，一个防模型过早停止。

## Hooks

BeforeAgent hook 可以：

- stop；
- block；
- 注入 additional context。

AfterAgent hook 可以：

- stop execution；
- clear context；
- block 并给 continuation reason；
- 递归触发下一次 `sendMessageStream()`。

源码：`client.ts:910-1034`。

与 Codex 类似，“模型没有工具调用”只是进入 hook 决策的前提，不是最终结束证明。

## 会话与恢复

README 和代码都支持 conversation checkpoint/resume。non-interactive 入口接收 `resumedSessionData`，先转换为 client history，再恢复 chat，见 `nonInteractiveCli.ts:236-243`。

当前材料没有展开 session 文件格式，重点是：

- chat history 用于模型上下文；
- session data 还包含恢复元数据；
- CLI output event 另有 streaming JSON 协议。

三者不应压成一个字符串日志。

## 设计优点

1. `Turn` 与 `Scheduler` 职责清晰。
2. PolicyEngine 对 shell 复合语法做确定性分析。
3. 工具状态机适合 UI、确认、MCP progress 与取消。
4. context management、model routing 和 loop detection 都有显式服务。
5. 子 Agent 复用工具调用协议，而不是开旁路。

## 设计代价

1. 迁移期存在旧 loop、新 agent session 和 legacy adapter，阅读时容易串线。
2. 同一流程跨 CLI、client、turn、scheduler、policy 多层。
3. policy、approval mode、sandbox 和 hook 组合较多。
4. 产品主要围绕 Gemini provider，不是广义多厂商 harness。

## 推荐精读顺序

1. `core/turn.ts:241-503`：先理解模型流如何变成事件。
2. `core/client.ts:614-907`：理解请求前后控制面。
3. `scheduler/scheduler.ts:95-353`：理解工具状态机。
4. `policy/policy-engine.ts:344-470`：理解 shell policy。
5. `agents/agent-tool.ts:36-243`：理解子 Agent 如何复用工具协议。

## 思考点

1. 为什么 IDE context 不能插在 function call 与 function response 之间？
2. 如果把 Scheduler 合并进 `Turn.run()`，哪些测试和状态会变难？
3. parser 失败时，为什么普通模式应 ask/deny，而不是沿用 allow？
4. next-speaker check 与 loop detector 分别防哪一种错误？
