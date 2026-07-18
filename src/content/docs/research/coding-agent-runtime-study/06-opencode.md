---
title: "06. OpenCode：双运行时迁移与事件溯源"
sidebar:
  hidden: true
---
# 06. OpenCode：双运行时迁移与事件溯源

## 一句话定位

OpenCode 当前像一座边营业边换地基的商场：`packages/opencode` 保留成熟产品运行时，`packages/core` 正在建设事件溯源式 V2 内核。两边通过数据库、EventV2 bridge 和共享 schema 渐进迁移。

固定快照：`anomalyco/opencode@4a760b5`，默认分支是 `dev`。

## 先避免一个误读

不能只读 `packages/core/src/session/runner/llm.ts` 就说“OpenCode 已完全切到 V2”。

当前快照同时存在：

### 成熟产品路径

```text
packages/opencode/src/session/prompt.ts
  → session/llm.ts
  → session/processor.ts
  → session/tools.ts
```

它已经处理：

- provider request；
- stream event；
- tool state；
- permission；
- plugin；
- snapshot；
- compaction；
- summary；
- retry；
- UI event。

### V2 目标内核

```text
packages/core/src/session/input.ts
  → session/execution/local.ts
  → session/runner/llm.ts
  → tool/registry.ts
  → event/projector/history
```

`runner/llm.ts` 文件头的 checklist 明确标了多项 TODO，例如：

- durable multi-node ownership；
- 完整的 MCP/plugin tool materialization；
- durable status；
- provider retry 与重复工具调用上限；
- post-run title/summary/cleanup。

因此本章会分别讲“已成熟路径”和“V2 已实现部分”。

## 仓库产品面

OpenCode 不只是 CLI：

- `packages/opencode`：主 CLI/server runtime；
- `packages/tui`：终端 UI；
- `packages/app`、`desktop`、`web`：不同客户端；
- `packages/core`：新内核与共享服务；
- `packages/llm`：统一模型事件层；
- `packages/server`、`client`、`sdk-*`：服务与 SDK；
- `packages/plugin`：插件 API；
- `packages/protocol`、`schema`：跨产品数据合同；
- `packages/console`、`slack`：其他产品接入。

这解释了 6,280 个 tracked files：大量文件属于 UI、资源和多产品面，不应把总规模等同于 Agent loop 复杂度。

## 成熟路径：SessionProcessor

`packages/opencode/src/session/processor.ts` 创建一个 processor context，记录：

- assistant message；
- tool call map；
- snapshot；
- blocked；
- needsCompaction；
- current text；
- reasoning map。

源码：`processor.ts:67-114`。

它把 LLM stream event 转成 durable/observable session part：

- reasoning start/delta/end；
- text start/delta/end；
- tool input；
- tool call；
- tool result；
- provider error；
- finish step。

### 工具状态

模型产生 tool call 时，processor 先确保存在 tool part：

```text
pending → running → completed / error
```

源码：`processor.ts:216-253,315-351`。

即使工具执行由 AI SDK 或其他模块触发，session 仍能保存一个可重放的状态变化序列。

### Snapshot 为什么要提前

processor 在 LLM stream 开始前就捕获文件 snapshot，注释说明 AI SDK 可能在发出 `start-step` 事件前已经执行工具，见 `processor.ts:98-103`。

这是一个时序教训：

> 观察事件不一定发生在副作用之前。要计算真实 diff，基线必须在启动可能产生副作用的组件前捕获。

## V2 输入：admit 与 promote

`SessionInput.admit()` 不是简单 `array.push()`：

1. 查询相同 message id 是否已存在；
2. 发布 `PromptAdmitted` event；
3. 要求事件包含 durable aggregate sequence；
4. 返回带 `admittedSeq` 的输入。

源码：`packages/core/src/session/input.ts:41-81`。

这提供了幂等性和崩溃恢复基础。

### 两种 delivery

| delivery | 何时进入模型 | 对应概念 |
|---|---|---|
| `steer` | 当前 Agent run 内，下一可用 turn | 运行中纠偏 |
| `queue` | 当前 run settle 后，每次提升一个 | 后续任务 |

`promoteSteers()` 会按 durable cutoff 批量提升 steering；`promoteNextQueued()` 只提升一个 queue item，见 `input.ts:245-288`。

为什么需要 cutoff：promotion 期间新来的 steering 不应被不确定地夹进当前批次；它们留给下一次稳定边界。

## V2 SessionExecution

`SessionExecutionLocal` 用 `SessionRunCoordinator` 保证：

- 同一 session 一个 active drain；
-显式 resume 可以汇合；
- 多个 wake 合并；
- 运行时为 session 解析 location；
- interrupt 有统一入口。

源码：`session/execution/local.ts:10-36`。

它把两个问题拆开：

1. session 里有没有 durable work；
2. 当前由哪个执行器、在哪个 location 运行。

未来 remote placement 可以替换第二层，而不重写 session 语义。

## V2 SessionRunner

### 请求前

`runTurnAttempt()`：

1. 加载 session 并验证 location；
2. 选择 agent；
3. 初始化/准备 context epoch；
4. 提升 steering 或 queue；
5. 解析 system context；
6. 解析 model；
7. 读取 runner history；
8. 根据 step limit 决定是否禁用工具；
9. 物化 permission-filtered tools；
10. 组装统一 LLM request；
11. 必要时 compact；
12. 捕获文件 snapshot。

源码：`session/runner/llm.ts:173-227`。

### Context epoch

`SessionContextEpoch` 给 system context 一个稳定 baseline sequence。runner 只读取该 baseline 之后的活动 history，并把 baseline 作为 system 输入。

工程意义：

- 当前运行时规则有明确版本边界；
- history 投影可以知道哪些消息已被某次 context baseline 覆盖；
- compaction 或 system context 更新不需要模糊地改写所有旧消息。

### Provider stream

runner 调 `llm.stream(request)`，对每个 event：

1. 通过 semaphore 串行发布，保持 event order；
2. provider error 进入明确分支；
3. local tool call 标记 `needsContinuation`；
4. 取得对应 assistant message id；
5. 通过 ToolRegistry settlement；
6. 把 tool result 再发布为 LLM event；
7. 工具 fiber 并发运行。

源码：`runner/llm.ts:228-275`。

### 为什么 event publish 要串行

provider stream 和工具 fiber 可以并发，但 session history 必须有确定顺序：

```text
assistant started
→ tool called
→ tool progress/result
→ assistant/step ended
```

否则 replay 可能在 tool result 出现时还找不到对应 assistant message。

### 中断与未结算工具

runner 会在启动新 run 前把历史中 pending/running 工具结算为 interrupted failure，见 `runner/llm.ts:119-139`。

模型/工具 stream 中断时，也会：

- 清理 tool fibers；
- fail unsettled tools；
- 必要时 fail active assistant；
- 保留 provider executed metadata。

见 `runner/llm.ts:277-345`。

这比“catch error 后 return”更严格，因为半完成工具必须进入可恢复终态。

## V2 双层循环

```text
while shouldRun(queue):
    while needsContinuation(tool or steer):
        runTurn()
        step += 1
        promotion = steer
    promotion = next queue
```

源码：`runner/llm.ts:383-405`。

它与 Pi 的 steering/follow-up 双层循环语义接近，但 OpenCode 把 input、model event、tool settlement 和 compaction 都放入 durable event/history。

## PermissionV2

### 默认决策

如果没有匹配 rule，`evaluate()` 默认返回 `ask`，见 `packages/core/src/permission.ts:76-86`。

### 规则组合

每个请求包含：

- session；
- action；
- resources；
- save patterns；
- metadata；
- source；
- 可选 agent。

runtime 合并：

- agent/session configured rules；
- 用户保存的 allow rule。

任一资源 deny 则 deny；否则只要有 ask 就 ask；全部 allow 才 allow，见 `permission.ts:137-162`。

### Ask 的生命周期

`assert()`：

1. evaluate；
2. deny → `BlockedError`；
3. allow → 返回；
4. ask → 发布 `Permission.Asked`；
5. 等 deferred reply；
6. reject → 失败，并清理同 session pending request；
7. always → 保存 allow rule，并自动释放已满足的新 pending request。

源码：`permission.ts:176-218,220-280`。

Permission request 本身也是事件，因此 CLI、Desktop 或其他客户端都能用同一协议回复。

## ToolRegistry

ToolRegistry 支持：

- application tools；
- location-scoped 动态注册；
- scope 结束自动注销；
- 根据 permission 过滤 definition；
- stale tool call 检测；
- output 资源绑定和截断；
- 统一 settlement。

源码：`packages/core/src/tool/registry.ts:23-147`。

### Stale tool call

如果模型看到工具 A 的旧 definition，但工具已被替换为新 registration，registry 比较 identity，返回 `Stale tool call`，见 `tool/registry.ts:50-61`。

这解决动态插件/工具热替换时的请求一致性问题，作用类似 Codex 的 request snapshot，但实现点不同。

## Compaction

V2 compaction：

- 配置默认 buffer 20K tokens；
- 默认保留最近 8K tokens；
- tool output 摘要前截断到 2,000 字符；
- summary 最多 4,096 output tokens；
- 保留固定 Markdown summary contract；
- 先发布 Compaction.Started；
- 无工具地调用 LLM；
- 成功后发布 Compaction.Ended，保存 summary + recent。

源码：`packages/core/src/session/compaction.ts:12-46,128-240`。

### 为什么 summary 有固定结构

固定 `Objective / Important Details / Work State / Next Move / Relevant Files`：

- 提高恢复时字段稳定性；
- 让测试能检查结构；
- 减少模型自由发挥丢失 active/blocked 状态；
- 为未来 UI 和自动 continuation 提供可解析边界。

但它仍是有损文本，不是 permission、event sequence 或 snapshot 的替代品。

## Provider 体系

OpenCode 有广泛 provider plugin：

- Anthropic；
- OpenAI；
- Google / Vertex；
- Bedrock；
- Azure；
- GitHub Copilot；
- Groq、Mistral、OpenRouter、xAI 等；
- OpenAI-compatible dynamic provider。

它还维护 `ProviderTransform` 处理不同 provider 的：

- reasoning effort；
- cache；
- tool schema；
- message shape；
- headers；
- model quirks。

这使 OpenCode 更像多 provider 产品平台，而不是单 provider CLI。

代价是兼容矩阵很大：同一个 Agent runtime 必须面对不同 stream event、reasoning、tool call 和认证语义。

## Plugin 与 MCP

OpenCode 有两类插件面：

- server plugin：provider、auth、session/tool hooks；
- TUI plugin：keymap、theme、mode、UI 扩展。

插件可来自 file 或 npm，并有 compatibility、install、enable/disable、cleanup timeout 和 metadata。

MCP tools 和 resources 会进入 session tool resolution，并经过 Permission 规则。代码还对 MCP resource blob 设置大小上限并限定可接受的附件 MIME。

这说明插件不是只改 prompt；它可以接入 provider、runtime 和 UI，因此安装信任边界比普通 Skill 更高。

## 持久化与投影

V2 使用 SQLite + event sequence：

- event 先记录；
- projector 更新 session/message/tool 当前视图；
- history loader 为 UI 或 runner 构建不同投影；
- input table 区分 admitted/promoted；
- context epoch 记录 baseline；
- snapshot 记录文件状态；
- message updater 可从 event 重建 UI memory state。

这是本轮五个项目里最明确的 event-sourced 方向。

## 设计优点

1. 多产品面和多 provider 平台能力强。
2. V2 把 input、model event、tool side effect 顺序做成 durable contract。
3. Permission request 可跨客户端统一处理。
4. context epoch、stale tool identity、snapshot 都针对恢复一致性。
5. 渐进迁移避免一次性重写成熟 runtime。

## 设计代价

1. 新旧运行时并存，概念和命名重复。
2. Effect、Layer、event、projector、bridge 提高学习门槛。
3. V2 仍有明确 TODO，不能把设计注释当完成事实。
4. 多 provider compatibility 带来大量 transform 与补丁。
5. event-first 可靠性换来更复杂的调试与迁移。

## 初学者容易看错

### 把 `MessageV2` 当完整 V2 runtime

产品代码里很多 `V2` 名字是桥接后的 schema/消息层，不能据此判断整个执行链已迁移。

### 把 event publish 当“日志”

这些 event 驱动数据库投影、UI 和恢复，是状态变化合同，不只是 observability。

### 把 TODO 注释写成现有能力

`runner/llm.ts` 明确区分 `[x]` 和 `[ ]`；未勾选项必须保留为未完成边界。

## 推荐精读顺序

1. `core/session/input.ts:41-81,245-288`：理解 durable input。
2. `core/session/runner/llm.ts:173-405`：理解 V2 turn 与双层循环。
3. `core/permission.ts:137-280`：理解 ask/allow/deny。
4. `core/tool/registry.ts:42-123`：理解动态工具与 settlement。
5. `opencode/session/processor.ts:98-205,278-360`：回看成熟路径如何处理 stream。

## 思考点

1. 为什么 V2 要把 `admitted` 与 `promoted` 分开？
2. stale tool identity 解决了哪一种动态扩展竞态？
3. event publish 串行、tool fiber 并行，这两个选择为什么不矛盾？
4. 渐进迁移比一次性重写多付出了哪些认知成本？
