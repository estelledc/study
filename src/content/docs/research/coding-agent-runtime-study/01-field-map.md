---
title: "01. Coding Agent Runtime 领域地图"
sidebar:
  hidden: true
---
# 01. Coding Agent Runtime 领域地图

## 先建立直觉

把 coding agent 想成一家能够接单、查资料、动手施工并交付结果的工程团队。

- **CLI / TUI / IDE / Desktop** 是接单窗口。
- **Session / Thread** 是项目档案袋。
- **Agent loop** 是项目经理不断执行“判断下一步 → 调工具 → 看结果”的循环。
- **Model client** 是向专家咨询的通信渠道。
- **Tool registry** 是可调用的施工队名册。
- **Permission / sandbox** 是审批和门禁。
- **Transcript / event log** 是完整施工记录。
- **Compaction** 是把旧记录压成接班摘要。
- **Memory** 是跨项目仍值得保留的稳定经验。
- **Plugin / Skill / MCP / Subagent** 是扩展能力的不同接入方式。

类比的边界：模型不是项目经理本人。真正保证文件访问、命令执行、并发、取消和持久化的是 runtime 代码；提示词只能影响模型倾向，不能替代硬约束。

## 一个完整请求至少经过八层

```text
用户输入
  ↓
1. Surface：CLI/TUI/IDE/Desktop 接收输入
  ↓
2. Session：定位线程、cwd、模型、权限、历史
  ↓
3. Context assembly：拼装规则、历史、技能、环境和工具 schema
  ↓
4. Model transport：向 provider 发起流式请求
  ↓
5. Stream parsing：把文本、思考、工具调用转成内部事件
  ↓
6. Policy + tool execution：校验、审批、沙箱、执行、收集结果
  ↓
7. Continuation：把工具结果送回模型，判断继续还是结束
  ↓
8. Persistence + UI：持久化事件并更新用户界面
```

最小 demo 常把 2、3、6、8 压成几个数组和函数。工业实现必须把它们拆开，因为任意一层都可能失败、重试、取消或跨进程恢复。

## 关键术语

### Turn

一次模型请求及其直接响应。一个用户 prompt 可能触发多个 turn：

```text
用户问“修这个 bug”
→ 模型 turn 1：要求读文件
→ 工具执行
→ 模型 turn 2：要求改文件
→ 工具执行
→ 模型 turn 3：给出最终说明
```

### Agent run

从用户输入开始，到模型不再请求工具且没有待处理输入为止的完整运行。它通常包含多个 turn。

### Session / Thread

跨多个用户输入持续存在的状态容器。它至少持有历史、当前配置、权限和持久化标识。不同项目命名不同：

- Codex 公开 `CodexThread`，内部持有 `Session`。
- Gemini CLI 以 `GeminiClient`、chat history 和 agent session 组合。
- Grok Build 的中心对象是 `SessionActor`。
- OpenCode 将 session 作为数据库聚合与事件流。
- Pi 用 `AgentSession` 包装底层 `Agent` 和 `SessionManager`。

### Steering

Agent 正在运行时插入、希望在下一次模型调用前生效的输入。它不是“等当前任务完全结束后再问”。

- Pi 的 steering 在当前工具批次完成后、下一次模型调用前注入。
- Codex 从 input queue 中排出运行中提交的 pending input。
- OpenCode V2 将 `steer` 与普通 `queue` 作为两种 durable delivery。

### Follow-up / Queue

等当前 Agent 本来要结束时再启动的新输入。Pi 叫 follow-up，OpenCode V2 叫 queue。它们和 steering 的差异是“何时获得模型控制权”。

### Tool definition、tool call、tool result

三者不能混：

1. **Tool definition**：告诉模型工具名、描述和参数 schema。
2. **Tool call**：模型生成的调用意图。
3. **Tool result**：runtime 校验、审批并实际执行后的结果。

模型能看到工具，不代表一定有权执行；模型发出调用，也不代表调用已经成功。

### Compaction

把旧上下文变成更短的摘要，同时保留最近消息。它是有损派生状态，不能替代原始 transcript。

### Event sourcing

不直接把“当前会话对象”当唯一真相，而是先记录事件，再从事件投影出当前状态。OpenCode V2 对这一路线最明确：输入先 `admit` 成 durable event，模型与工具流也逐项发布事件。

## 五种总体架构

### Codex：线程内核

```text
CLI / TUI / App Server / IDE
          ↓
      CodexThread
          ↓
        Session
          ↓
 SessionTask → run_turn
          ↓
 ModelClientSession + ToolRouter
          ↓
 rollout / thread store / state DB
```

特点：多个产品面共享一个强状态内核。复杂度换来线程恢复、桌面端协议、权限配置、扩展和工具运行的一致性。

### Gemini CLI：模型流与工具调度分离

```text
CLI
 ↓
GeminiClient → Turn → GeminiChat/provider
      ↓ 产生 ToolCallRequest
  Scheduler → PolicyEngine → confirmation → ToolExecutor
      ↓
tool response 再送回 GeminiClient
```

特点：`Turn` 只解释模型流，`Scheduler` 专门负责工具生命周期。这使政策、确认、并发和取消更容易独立测试。

### Grok Build：Session Actor

```text
TUI / headless / stdio ACP / leader
              ↓
         SessionActor mailbox
              ↓
 prompt、MCP、model switch、memory timer、completion
              ↓
  handle_prompt → sampling loop → tool loop
              ↓
 chat state / JSONL / telemetry / updates
```

特点：会话像一个长期值班进程，所有影响状态的事件集中排队处理。它适合大量异步能力，但阅读成本最高。

### OpenCode：成熟运行时 + V2 事件内核并存

```text
现有产品路径：
SessionPrompt / SessionProcessor / LLM / tools

V2 路径：
SessionInput event
  → SessionExecution
  → SessionRunner
  → LLM event publisher
  → ToolRegistry settlement
  → projected history
```

特点：不是一次性重写。`packages/opencode` 仍包含成熟的 V1/桥接代码；`packages/core` 正在建设更可恢复的 V2 runtime。

### Pi：最小内核 + 扩展

```text
CLI
 ↓
AgentSession
 ↓
Agent
 ↓
agent-loop.ts
 ↓
pi-ai provider adapters

旁路：ExtensionRunner、SessionManager、TUI
```

特点：把“通用最小循环”与“coding-agent 产品能力”分开。它主动不内置 MCP、子 Agent、权限弹窗和计划模式，要求通过扩展或外部隔离补上。

## 规模只能说明阅读成本

| 项目 | 追踪文件 | 主语言分布 | 适合的第一入口 |
|---|---:|---|---|
| Codex | 5,530 | Rust 为主，另有 TypeScript 协议/客户端 | `codex-rs/core/src/tasks/regular.rs` |
| Gemini CLI | 2,919 | TypeScript / TSX | `packages/core/src/core/client.ts` |
| Grok Build | 2,715 | Rust | `xai-grok-shell/.../turn.rs` |
| OpenCode | 6,280 | TypeScript / TSX，含大量产品资源 | `packages/core/src/session/runner/llm.ts` |
| Pi | 1,042 | TypeScript | `packages/agent/src/agent-loop.ts` |

文件多不等于 Agent loop 更先进。OpenCode 的文件数包含 Web、Desktop、Console 和大量资源；Codex 与 Grok Build 的 Rust workspace 拆分粒度也不同。

## 所有项目都在解决的六个问题

### 1. 谁拥有循环

- Pi：一个普通异步函数。
- Gemini CLI：client 负责模型 turn，CLI/agent session 负责工具反馈循环。
- Codex：`SessionTask` 调 `run_turn`，后者持有模型与工具 continuation。
- Grok Build：`SessionActor` 的 prompt task。
- OpenCode V2：`SessionRunner`。

### 2. 运行中来的新输入怎么办

简单实现会忽略或直接打断。成熟实现至少区分：

- 立即取消；
- 当前工具结束后 steering；
- 当前 Agent 结束后 follow-up/queue；
- 仅作为 UI 消息，不进模型上下文。

### 3. 工具调用能否并行

不能只问“是否用 `Promise.all`”。正确问题是：

- 哪些工具声明可并行？
- 同一文件的两个写操作是否要串行？
- 结果是否按模型发出顺序回填？
- 某个调用被拒绝时，其他调用怎么办？
- 取消时如何把 pending/running 工具结算为终态？

### 4. 如何限制副作用

存在四种强度不同的机制：

1. 提示模型不要做。
2. 从 tool schema 中隐藏能力。
3. runtime policy 决定 allow / ask / deny。
4. OS、容器、VM 或平台沙箱真正限制进程能力。

Pi 明确只提供工具 allowlist 和项目资源 trust，不把它们冒充 sandbox。Codex、Gemini CLI、Grok Build 和 OpenCode 都有更中心化的政策/审批层。

### 5. 如何跨上下文窗口继续

完整 transcript 不应直接丢弃。常见结构是：

```text
原始历史：长期保留，供审计与恢复
活动上下文：摘要 + 最近消息 + 当前状态
memory：只保留跨任务稳定信息
```

Pi 的 JSONL 会话树最容易看懂；OpenCode V2 的 event log 最严格；Codex 和 Grok Build 的状态面最丰富。

### 6. 如何证明“Agent 停了”

“模型没再发工具调用”只是一个条件。还要确认：

- 没有 steering/follow-up；
- 没有未结算工具；
- 没有 stop hook 要求继续；
- 没有 compaction 后重试；
- 没有后台任务必须在当前 turn 等待；
- 没有达到上限、被政策拒绝或发生 terminal error。

## 三个常见误区

### 误区一：Agent loop 越短，系统越简单

短循环往往只是把复杂度移到 provider SDK、工具封装、UI 或外部进程。Pi 的循环短，但 `AgentSession`、extensions、session tree 和 provider adapters 仍然承担大量产品职责。

### 误区二：有确认弹窗就等于安全

确认只是 policy 的交互输出。真正的安全还取决于参数解析、默认决策、沙箱边界、凭证范围和插件代码权限。

### 误区三：摘要就是记忆

摘要服务于“当前任务续接”，memory 服务于“跨任务复用”。把摘要当长期事实会积累过期状态；把 memory 当当前执行状态会导致恢复错误。

## 进入下一章前的自检

1. 一个用户 prompt 为什么可能包含多个 model turn？
2. steering 和 follow-up 的控制时机有什么区别？
3. 为什么 tool schema、permission 和 sandbox 是三层不同机制？

答案都在本章。如果能用自己的话说清，再进入[核心循环对比](02-core-loop-deep-dive.md)。
