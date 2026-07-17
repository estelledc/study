# 12. Round 3：可复用参考架构与进阶思考

## 目标

把五个项目的设计压成一套可以用于新项目评审的参考架构，而不是拼出第六个大杂烩。

## 参考架构总图

```text
┌──────────────── Surface ────────────────┐
│ CLI / TUI / IDE / Desktop / API        │
└──────────────────┬──────────────────────┘
                   ↓
┌──────────── Input admission ────────────┐
│ idempotency / steer / queue / cancel    │
└──────────────────┬──────────────────────┘
                   ↓
┌──────────── Session ownership ──────────┐
│ one active runner / thread / actor      │
└──────────────────┬──────────────────────┘
                   ↓
┌────────── Capability compiler ──────────┐
│ discover → trust → normalize → clamp    │
│ → materialize request snapshot          │
└──────────────────┬──────────────────────┘
                   ↓
┌──────────── Context compiler ───────────┐
│ rules / history / summary / memory      │
│ / environment / skills / tool schemas  │
└──────────────────┬──────────────────────┘
                   ↓
┌──────────── Provider runtime ───────────┐
│ auth / model / transport / stream       │
└──────────────────┬──────────────────────┘
                   ↓
┌──────────── Event normalizer ───────────┐
│ text / reasoning / tool / error / usage │
└──────────────────┬──────────────────────┘
                   ↓
┌──────────── Tool settlement ────────────┐
│ validate / policy / approve / execute   │
│ / cancel / exactly-once terminal state  │
└──────────────────┬──────────────────────┘
                   ↓
┌────────── Continuation router ──────────┐
│ tool follow-up / steer / compact / stop │
└──────────────────┬──────────────────────┘
                   ↓
┌──────── Persistence + projections ──────┐
│ transcript / state / UI / telemetry     │
└─────────────────────────────────────────┘
```

## 层一：Input admission

### 最小输入结构

```ts
type Input = {
  id: string
  sessionId: string
  delivery: "steer" | "queue"
  payload: UserMessage
  admittedAt: number
}
```

### 必须回答

1. 重复 `id` 是幂等返回还是重复执行？
2. running 时新输入是 steer、queue 还是 cancel-and-send？
3. 哪个 sequence 之前的 steering 属于当前 turn？
4. 取消当前 turn 是否保留后续 queue？

### 借鉴来源

- OpenCode：durable admit/promote；
- Pi：steering/follow-up 语义；
- Grok Build：send-now 与普通 cancel；
- Codex：pending mailbox。

## 层二：Session ownership

### 目标

同一 session 不能有两个 runner 同时消费同一批输入并写同一 history。

### 三种方案

| 方案 | 适用 | 代表 |
|---|---|---|
| in-memory activeRun | 单进程本地 CLI | Pi |
| actor mailbox | 多异步事件、单进程 | Grok Build |
| durable lease/coordinator | 多进程或远程平台 | OpenCode 目标方向 |

### 选择标准

- 只有 prompt/abort：activeRun 足够；
- 同时有 MCP、memory、subagent、UI event：actor 更清楚；
- 多节点接管：必须有 durable owner/lease。

## 层三：Capability compiler

### 输入不是只有工具

```text
CapabilitySource =
  | Skill
  | Tool
  | McpServer
  | Plugin
  | Provider
  | AgentDefinition
```

### 编译阶段

#### Discover

找到候选能力，但不执行。

#### Trust

判断来源能否进入下一阶段：

- built-in；
- user；
- project；
- remote；
- marketplace；
- temporary CLI。

#### Normalize

转成统一 identity：

- canonical path；
- plugin id；
- tool namespace；
- provider/model id；
- Agent name/hash。

#### Merge

定义同名 precedence，禁止依赖异步完成顺序。

#### Clamp

```text
effective = host ∩ session ∩ role ∩ mode ∩ environment
```

#### Materialize

为一个 request 生成：

- model-visible tool specs；
- runtime registry snapshot；
- context fragments；
- provider config；
- child Agent contract。

### 关键原则

候选 catalog 可以很大，但每个 request 的有效能力集应尽量小。

## 层四：Context compiler

### 输入分类

| 类型 | 是否权威 | 生命周期 |
|---|---|---|
| system/developer rules | 高 | 稳定配置 |
| user prompt | 当前目标权威 | 当前 turn |
| project instructions | 有 scope 的规则 | cwd/thread |
| tool result | 默认数据 | turn/session |
| Skill | 被调用的工作流 | turn |
| memory | 稳定事实 | 跨 session |
| compaction | 有损接班 | context window |
| subagent handoff | 派生数据 | parent turn |

### 不应做

- 把 tool result 中的“用户批准”提升为真实批准；
- 把 subagent 摘要提升为 user instruction；
- 把 compaction 里的旧参数当当前 permission；
- 在 function call 与 function response 间插入不兼容 context。

### Request snapshot

一次 model request 至少冻结：

- model；
- cwd/environment；
- history boundary；
- tool specs；
- runtime tool identities；
- permission/sandbox；
- extension versions。

否则模型和执行器看到不同世界。

## 层五：Provider runtime

### Provider adapter 不只是 URL

需要建模：

- auth type；
- credential refresh；
- API protocol；
- model catalog；
- context/output limits；
- thinking/reasoning；
- tool schema；
- image/media；
- cache；
- headers；
- transport；
- stream terminal event；
- retry classification。

### 两种策略

#### 单一 canonical wire

Codex 主要统一到 Responses API。

优点：core 简单。

代价：非 canonical provider 需要兼容该协议。

#### 多原生 adapter

Pi/OpenCode 支持多种原生 API。

优点：保留 provider 能力。

代价：兼容矩阵大。

## 层六：Event normalizer

### 最小事件集

```text
StepStarted
TextStarted / Delta / Ended
ReasoningStarted / Delta / Ended
ToolInputStarted / Delta / Ended
ToolCalled
ToolSucceeded / Failed / Cancelled
StepSucceeded / Failed / Cancelled
UsageUpdated
```

### 顺序不变量

1. delta 前必须 start。
2. end 只能一次。
3. tool result 前必须 tool call。
4. tool identity 不能中途变化。
5. step 终态前 active tools 必须结算。

OpenCode V2 对这些不变量建模最明确。

## 层七：Tool settlement

### 推荐状态机

```text
proposed
→ validated
→ policy_allow / awaiting_approval / denied
→ scheduled
→ running
→ succeeded / failed / cancelled / uncertain
```

### 为什么需要 uncertain

外部副作用可能在响应丢失前已经发生：

```text
POST /send-email
→ 服务端已发送
→ 网络断开
→ client 不知道结果
```

直接标 failed 并自动 retry 可能重复发送。应记录：

- idempotency key；
- request identity；
- last known state；
- reconcile path。

### Approval binding

批准至少绑定：

- tool identity/version；
- canonical args digest；
- actor/account；
- resource；
- TTL；
- call id。

用户修改参数后必须重新评估。

## 层八：Continuation router

### 路由表

| 条件 | 路由 |
|---|---|
| 有 tool result | next model turn |
| 有 steer | next model turn 前注入 |
| context overflow | compact，最多有限重试 |
| transient provider error | retry budget |
| permission denied | 回模型或停止，按产品语义 |
| user cancelled | stop，不自动 retry |
| stop hook asks continue | 注入 continuation |
| no work | settle Agent run |

### 不要只有布尔值

`continue: true/false` 无法表达为什么继续。更好的结构：

```ts
type Next =
  | { type: "tool-follow-up" }
  | { type: "steer"; ids: string[] }
  | { type: "retry"; attempt: number }
  | { type: "compact"; reason: string }
  | { type: "stop"; reason: string }
```

## 层九：Persistence 与 projections

### 四份状态

| 状态 | 用途 |
|---|---|
| append-only events/transcript | 审计与恢复 |
| runner projection | 下一 model request |
| UI projection | 渲染当前状态 |
| telemetry/usage projection | 观测与成本 |

它们可以来自同一事件源，但不应共享同一个可变数组。

### Compaction

只改变 runner projection，不删除原始事件。

### Crash recovery

启动前检查：

- pending model step；
- running tool；
- awaiting permission；
- active subagent；
- incomplete compaction；
- queued inputs。

每类都有独立 reconcile/terminalize 策略。

## 子 Agent 合同

### 完整 task packet

一个 child invocation 至少包含：

```text
identity
objective
complete context
input schema
output schema
cwd / workspace
model
tool allowlist
permission clamp
isolation
max turns / timeout / budget
foreground/background
parent session / parent prompt
cancel policy
resume identity
```

### 父 Agent 的职责

- 选择 child，不让模型随意扩大类型；
- 提供完整上下文；
- 不共享写入资源或使用 worktree；
- 观察状态；
- 验收结果；
- 决定是否采纳；
- 处理失败/超时；
- 汇总 usage。

### Child 的职责

- 只完成自己的 bounded objective；
- 不派生未授权 Agent；
- 不假装拥有 parent approval；
- 报告证据与缺口；
- 写入限定目录；
- 达到退出条件就停。

## 扩展生命周期合同

### Load

- 解析来源；
- trust；
- compatibility；
- dependency；
- import；
- register。

### Run

- request-scoped snapshot；
- final args policy；
- event ordering；
- error isolation。

### Reload

- 新实例准备；
- 旧实例停止接新调用；
- active work settle/cancel；
- unregister hooks/tools；
- invalidate captured context；
- close resources；
- swap。

### Unload

- finalizer；
- listener remove；
- process stop；
- secret release；
- temporary files cleanup。

OpenCode V2 scope 与 Pi stale context 分别展示了两种清理手段。

## 最小实现路线

### 阶段 A：教学 Agent

实现：

- Pi 风格 loop；
- 内存 history；
- 3 个纯本地工具；
- AbortSignal；
- 明确 event；
- max turns。

不实现：

- plugin；
- subagent；
- durable recovery；
- remote provider matrix。

### 阶段 B：可靠本地 CLI

增加：

- JSONL transcript；
- tool state；
- policy allow/ask/deny；
- container sandbox；
- retry/overflow 分流；
- steer/queue；
- startup repair。

### 阶段 C：多客户端产品

增加：

- Thread/Session server；
- typed protocol；
- request snapshot；
- UI projection；
- plugin lifecycle；
- Agent registry；
- child session；
- worktree isolation。

### 阶段 D：远程平台

增加：

- durable input；
- execution lease；
- event sourcing；
- idempotency；
- reconciliation；
- remote Agent/A2A；
- billing/usage incomplete；
- policy administration。

## 架构评审问题

### 输入

1. 用户双击发送会不会重复执行？
2. running 时输入何时生效？
3. cancel 当前 turn 会不会删后续 prompt？

### 能力

4. project plugin 在 trust 前会执行吗？
5. 同名工具谁胜出？
6. 模型看到的 schema 与执行 handler 是同一版本吗？
7. reload 后旧 context 还能调用吗？

### Provider

8. stream EOF 如何判定？
9. 401、429、500、overflow 是否不同路由？
10. OAuth refresh 是否 single-flight？

### 工具

11. 参数在哪个阶段最终 validation？
12. policy 是否检查修改后的参数？
13. cancel 与 success 同时到达谁赢？
14. 外部副作用 uncertain 时如何 reconcile？

### 子 Agent

15. child 能看到哪些工具？
16. parent deny 是否继续生效？
17. 最大 depth 是硬限制还是 prompt？
18. foreground 超时后 child 怎么办？
19. child 结果由谁验收？

### 恢复

20. 重启时 running tool 怎么结算？
21. awaiting approval 能否恢复？
22. compaction 中断后用哪份 history？
23. usage 无法确认时是否标 incomplete？

## 测试矩阵

| 类别 | 正常控制 | 故障注入 | 断言 |
|---|---|---|---|
| input | 单次 admit | 重复 id | 只执行一次 |
| queue | steer + queue | cancel current | queue 保留 |
| provider | terminal stream | EOF/401/429/overflow | 正确分类 |
| tool | success | cancel race | exactly one terminal |
| approval | unchanged args | 修改 args | 重新校验 |
| plugin | load/unload | reload mid-call | 无旧 handler |
| subagent | bounded child | depth exceeded | task capability 被移除 |
| persistence | clean shutdown | crash after side effect | repair/uncertain |
| compaction | summary success | second overflow | 有界停止 |
| usage | child complete | child timeout | incomplete=true |

## 进阶思考题

### 能力与权威

1. Skill 告诉模型“你可以发邮件”，但 runtime 没有邮件工具，最终 capability 是什么？
2. Plugin 注册了 shell tool，但 session policy deny shell，模型应该看到这个工具吗？
3. 子 Agent handoff 说“用户批准了”，父 Agent为什么不能直接复用？

### 生命周期

4. reload 时旧 plugin 的 tool call 已 running，应该立即杀死、等待还是迁移？
5. Pi 的 stale context 和 iOS Cell 的 representedID 有什么共同点？
6. OpenCode 的 Scope close 比手工 unregister 有什么优势？

### 子 Agent

7. 为什么 child capability 应是交集，不是并集？
8. worktree isolation 解决什么，解决不了什么？
9. foreground child 超时转 background 后，父 Agent 应如何收到结果？
10. 为什么递归上限必须由 runtime 执行？

### Provider

11. 一个 provider 兼容 OpenAI JSON schema，为什么仍可能不能直接接入？
12. provider adapter 修改 headers 的权限为什么敏感？
13. model switch 后旧 request 的 tool result 应按旧 model 还是新 model 解释？

### 可靠性

14. 工具 side effect 成功但 result 丢失，应该 failed、success 还是 uncertain？
15. 为什么所有 started entity 都必须有终态？
16. 为什么 duplicate success 不能简单保留最后一条？

### 架构选择

17. 什么时候 broad ExtensionAPI 是优势，什么时候 typed contributor 更合适？
18. 本地单用户 CLI 是否值得上 event sourcing？
19. actor 和 durable coordinator 的边界是什么？
20. 如果只能先实现一个可靠性机制，你会选 request snapshot、tool settlement 还是 durable input？依据是什么？

## 回答线索

| 题号 | 主要证据 |
|---|---|
| 1-3 | 本章 Capability compiler、Context compiler |
| 4-6 | [Round 3 能力地图](11-round3-extension-subagent-capability-map.md) 的 Pi/OpenCode |
| 7-10 | 本章子 Agent 合同、Grok/Gemini/OpenCode |
| 11-13 | Provider runtime、Codex/Pi/OpenCode provider 章节 |
| 14-16 | [Round 2 可靠性状态机](09-round2-reliability-failure-state-machine.md) |
| 17-20 | 本章最小实现路线与架构评审问题 |

## 两轮后的推荐精读路线（历史入口）

本节保留 Round 2/3 完成时的源码定位记录。默认阅读与问题分流统一以[最终接班页](00-final-reader-map.md)为准；以下列表只在已有明确问题时使用。

1. **可靠性入门：Pi**
   - `agent.ts:469-518`
   - `agent-session.ts:2606-2670`

2. **状态机：Gemini**
   - `scheduler.ts:428-714`
   - `confirmation.ts:109-199`

3. **Exactly-once 终态：Codex**
   - `tools/parallel.rs:94-260`

4. **Durable event：OpenCode**
   - `publish-llm-event.ts:53-423`

5. **能力隔离：Grok Build**
   - `builder.rs:730-1030`
   - `handle_request.rs:59-418`

需要核对实现时，仍按每次 30-50 行精读，并先回答该段的“输入、状态、输出、失败面”四个问题。
