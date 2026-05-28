---
title: "Inngest — durable workflow 的事件溯源"
description: 用 step.run 函数式 API 把"长时间任务"切成可重放步骤；event sourcing + replay 让进程崩溃后从断点恢复，而不是从头重跑
sidebar:
  order: 22
  label: "inngest/inngest"
---

> inngest/inngest，commit `c950111b4ef1a11e5236e63c298b3914ff1e2bf9`（2026-05-28 读），Apache-2.0。
>
> Inngest 解决的是**长时任务的崩溃问题**：你的后台 job 跑到第 7 步时进程挂了，
> 怎么不让前 6 步白跑？传统方案是状态机 + 数据库手动落盘——你写满 try/catch 和 status 字段。
>
> Inngest 的判断：**把每一步代码 wrap 进 `step.run("name", fn)`，平台帮你 record + replay**。
> 函数中断后重启时，已完成的 step 直接返回缓存结果，从断点继续——
> 你写的还是直白的 async/await 代码，但获得了 durable execution。
>
> Season 6 第二篇 · v1.1 项目类型分支 D（框架/SDK）。
>
> Go 写的 executor + queue 后端 + TypeScript/Python/Go SDK；自托管 OSS + Inngest Cloud。

## 一句话定位

**Inngest = durable workflow framework：把任意 async 函数切成 step.run / step.sleep / step.waitForEvent，executor 用 event sourcing 重放保证 exactly-once 语义。**
开发者写函数式代码，平台负责持久化、重试、调度。

## 核心信息表

| 字段 | 值 |
|---|---|
| 仓库 | [inngest/inngest](https://github.com/inngest/inngest) |
| star / fork | ~3.4k / ~190（2026-05 读） |
| 最近活跃 | 2026-05-27 主干持续提交（commit `c950111` 当日） |
| 读时 commit | `c950111b4ef1a11e5236e63c298b3914ff1e2bf9` |
| 主语言 | Go（executor / queue / state store）+ TypeScript（SDK）+ React（dev UI） |
| 维护方 | Inngest, Inc.（YC W23）+ 社区 |
| 主要贡献者 | tonyhb（Tony Holdstock-Brown，CTO）/ djfarrelly（Dan Farrelly，CEO）/ jpwilliams / BrunoScheufler |
| License | Apache-2.0 |
| 类似项目 | temporal · trigger.dev · bullmq · restate · dbos · cloudflare workflows · aws step functions |

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK（用户在自己的代码里写 step.run / step.sleep，平台是显式 abstraction）
- **心脏物**：`pkg/execution/executor`（Go 端 replay 调度核心）+ TS SDK 的 `InngestFunction` / `Step` 类
- **extension point**：function（用户函数）/ step（粒度单元）/ event（trigger）/ cron（schedule trigger）/ middleware（hooks）
- **混合特征**：含明显的"运行时"特征（executor + queue + state store 是后端服务），
  但**核心心智模型是给开发者用的 abstraction**——开发者写 step，平台跑 step——所以归类 D。
  附录里点出与 Temporal（runtime 派）的差别。

## Why（为什么是它而不是 Temporal / trigger.dev / BullMQ）

durable workflow 的派系演化：

```
2018: AWS Step Functions   JSON DSL，平台锁定
2019: Temporal             Go runtime 派，需要 worker 进程长连
2022: trigger.dev V1/V2    Node.js 派，sleep 是 polling
2023: Inngest              event sourcing + step.run 函数式
2024: trigger.dev V3       重写成 V8 isolate runtime（学 Inngest）
2025: Cloudflare Workflows 平台原生
```

**核心痛点**：你写一个"用户注册后发欢迎邮件 + 24 小时后发 onboarding tip + 7 天后发问卷"的 job。

**派系 1：Temporal Go 派**

```go
func WelcomeWorkflow(ctx workflow.Context, userID string) error {
    workflow.ExecuteActivity(ctx, SendWelcomeEmail, userID).Get(ctx, nil)
    workflow.Sleep(ctx, 24*time.Hour)
    workflow.ExecuteActivity(ctx, SendOnboardingTip, userID).Get(ctx, nil)
    workflow.Sleep(ctx, 7*24*time.Hour)
    return workflow.ExecuteActivity(ctx, SendSurvey, userID).Get(ctx, nil)
}
```

代价：你必须在自己服务器上跑一个 Temporal worker 进程 24/7 长连
Temporal cluster；workflow 代码运行受 deterministic 约束（不能直接调 `time.Now()`）。
冷启动慢，部署模型重。

**派系 2：BullMQ Redis 派**

```typescript
welcomeQueue.add('send-welcome', { userID })
welcomeQueue.add('send-tip', { userID }, { delay: 24*3600*1000 })
welcomeQueue.add('send-survey', { userID }, { delay: 7*24*3600*1000 })
```

代价：每一步是独立 job，**没有"workflow"概念**——
中间任意一步失败了，怎么找到这是同一个用户的流？要自己拼。
没有原生 step 依赖关系。

**派系 3：trigger.dev V3 / Inngest（函数式 step.run 派）**

```typescript
inngest.createFunction(
  { id: "welcome-flow" },
  { event: "user/signed_up" },
  async ({ event, step }) => {
    await step.run("send-welcome", () => sendEmail(event.user))
    await step.sleep("wait-day", "24h")
    await step.run("send-tip", () => sendTip(event.user))
    await step.sleep("wait-week", "7d")
    await step.run("send-survey", () => sendSurvey(event.user))
  }
)
```

执行模型：函数被 HTTP 调用 → 跑到第一个 step.run → 记录结果 → 函数返回 →
24 小时后 executor 通过 HTTP 再调用同一个函数 → replay 到上次断点 → 继续。
**你的应用是无状态 HTTP server**——不需要长连 worker，不需要 daemon 进程。
Vercel / Lambda / Cloudflare Workers 都能跑。

| 框架 | 部署模型 | API 风格 | sleep 实现 | 持久化 |
|---|---|---|---|---|
| **Temporal** | worker daemon 长连 | activity DSL | runtime sleep | event history |
| **BullMQ** | Redis + worker | queue.add() | delayed job | Redis |
| **AWS Step Functions** | platform-only | JSON ASL DSL | wait state | platform |
| **trigger.dev V3** | V8 isolate runtime | step.run | runtime sleep | postgres |
| **Inngest** | **stateless HTTP server** | **step.run** | **HTTP re-invoke + replay** | **state store + event log** |

**为什么不是 Temporal**：太重。Go 派的 worker daemon 模型对小团队是过度的——
你要管 worker 集群、管 task queue 配额、deterministic constraint 不直观。
但对超大规模（金融、Uber 派单）Temporal 仍然是正解。

**为什么不是 BullMQ**：BullMQ 是 queue 不是 workflow——
没有"一个流"的概念，跨步骤的错误处理要自己拼。

**为什么不是 trigger.dev V3**：trigger 的 V3 学了 Inngest 但选了"自己跑 V8 isolate"——
平台耦合更强；Inngest 把执行权交给开发者的 HTTP server，
**开发者 push code 不需要管"Inngest 上的 worker 怎么部署"**。

**Inngest 的代价**：

- 每次 step.run 之间都是 HTTP round-trip——单 step 延迟比内存调用高几十毫秒
- 函数代码必须 idempotent（HTTP 可能重投递）
- 大 step 输出要走 state store，太大的 payload 会被 truncate
- 自托管模式 OSS 单机够用，分布式生产需要单独部署 Redis + Postgres + executor 集群

## 仓库地形 · Layer 2（框架/SDK 分支：标 abstraction + extension point）

inngest/inngest 顶层目录（commit `c950111`，2026-05-28 读）：

```
inngest/
├── cmd/                       命令行入口（dev / start / serve）
├── pkg/
│   ├── api/                   public REST + GraphQL API
│   ├── config/                配置加载（含 redis / postgres 选项）
│   ├── coreapi/               GraphQL schema for run inspection
│   ├── cqrs/                  read / write store 分离层
│   ├── devserver/             单进程 dev mode（嵌入 miniredis + sqlite）★
│   ├── enums/                 opcode / status 枚举（含 OpcodeStepRun 等 15 种 opcode）★
│   ├── event/                 event ingestion / serialization
│   ├── execution/             ★★★ 心脏区域 —— 全部跑 step 的逻辑
│   │   ├── executor/          Schedule / Execute / HandleResponse / replay 调度 ★
│   │   ├── state/             State 接口 + GeneratorOpcode + opcode hash ★
│   │   ├── queue/             分布式 redis 队列（partition / shadow / shard）
│   │   ├── driver/            HTTP / connect / mock 三种 driver
│   │   │   └── httpv2/        ★ V2 HTTP driver：往用户 server POST opcodes
│   │   ├── runner/            event → workflow trigger 入口
│   │   ├── pauses/            waitForEvent / sleep 暂停管理
│   │   ├── batch/             event batching
│   │   ├── debounce/          event debouncing
│   │   ├── concurrency/       并发限流
│   │   ├── ratelimit/         per-key 速率限制
│   │   └── checkpoint/        异步 checkpoint（v0.40+ 新增）
│   ├── connect/               长连 worker 模式（替代 HTTP 的可选 transport）
│   ├── sdk/                   SDK register manifest schema
│   ├── inngest/               function / step Go 类型定义（与 SDK 共用）
│   ├── service/               service Lifecycle 抽象
│   └── ...
├── ui/                        React-based dev UI（运行时挂在 / 路径）
├── proto/                     gRPC proto（connect 模式）
├── tests/golang/              端到端用 Go SDK 写的测试 ★
├── tests/js/                  端到端用 TS SDK 写的测试
└── vendor/github.com/inngest/inngestgo/  ★ 内嵌的 Go SDK（项目自己用来跑测试）
```

**重点**：`pkg/execution/` 是绝大部分代码所在。`pkg/sdk/` 在这个仓库里只是
register manifest——真正的 TS / Python / Go SDK 各在独立 repo
（[inngest/inngest-js](https://github.com/inngest/inngest-js)、
[inngest/inngestgo](https://github.com/inngest/inngestgo)）。
但 vendor 里嵌了 inngestgo 用来端到端测试，这是**仓库内查 SDK 实现的最快路径**。

## 心脏文件 + extension point

按行数 + 心智重要度排：

| 文件 | 行数 | 角色 |
|---|---|---|
| `pkg/execution/executor/executor.go` | 5797 | **总调度心脏**：`Schedule` / `Execute` / `HandleResponse` / `HandleGeneratorResponse` / `handleGeneratorSleep` 都在这里 |
| `pkg/execution/state/opcode.go` | 654 | `GeneratorOpcode` 结构（SDK ↔ executor 跨进程协议） |
| `pkg/execution/state/state.go` | 465 | `State` / `Manager` / `StateLoader` 接口契约 |
| `pkg/execution/state/driver_response.go` | 647 | `DriverResponse`：driver 回包给 executor 的形状 |
| `pkg/execution/driver/httpv2/httpv2.go` | 285 | V2 HTTP driver：往用户 SDK server POST 一次 |
| `pkg/devserver/devserver.go` | 804 | 单进程 dev server：嵌 miniredis + sqlite，串起所有 service |
| `vendor/github.com/inngest/inngestgo/step/run.go` | 204 | Go SDK 端的 `step.Run`：replay cache 查询 + ControlHijack |
| `vendor/github.com/inngest/inngestgo/internal/sdkrequest/manager.go` | 400+ | SDK 端 request context manager：`mgr.Step()` 是 cache 命中点 |

**Extension point 一览**（用户能挂的钩子）：

- `function`（用户函数）：`inngestgo.CreateFunction(client, opts, trigger, handler)` —— 唯一对外类型
- `step`（粒度单元）：`step.Run` / `step.Sleep` / `step.WaitForEvent` / `step.Invoke` / `step.WaitForSignal`
   —— 每个对应一个 opcode（`pkg/enums/opcode.go:9-29`，共 15 种 opcode）
- `event`（trigger）：`inngestgo.EventTrigger("test/sdk-steps", nil)` —— 事件名 + CEL 表达式过滤
- `cron`（trigger）：`inngestgo.CronTrigger("0 9 * * *")` —— 定时调度
- `middleware`：`mw.BeforeExecution / AfterExecution / TransformInput / TransformOutput`
   —— SDK 侧 hook（见 `vendor/github.com/inngest/inngestgo/middleware/`）
- `concurrency` / `rateLimit` / `throttle` / `debounce` / `batchEvents`：function 级配置
   —— executor 侧 hook（见 `pkg/execution/concurrency` / `ratelimit` / 等）

**为什么把 SDK 划进框架/SDK 分支而不是运行时分支**：尽管 executor 是后端 service，
**用户接触面是 SDK 暴露的 step API**——开发者写的是函数式代码，SDK 把它翻译成 opcodes，
executor 是被动调度。这是典型的 abstraction + extension point 心智模型。

## 架构图（hero figure）

![inngest 的 step.run replay 机制：上半时间轴是用户函数 5 个 step，第 3 个 call-stripe 失败；中段是 state store 内容；下半 Run 1 / Run 2 两条 timeline，箭头标 cache hit 路径](/projects/inngest/01-replay.webp)

**图说**：上半部分是用户函数，画 5 个 step（A、B、C、sleep、D）。下半部分是 Inngest executor 的视角：
Run 1（首次调用）跑到 step C 时进程崩溃 → executor 把 A、B 的输出写进 state store，
事件 log 加 `step.completed{C}` 记录中断；Run 2（24h 后或重试）通过 HTTP 再次调用同一函数——
TS SDK 在进入 step.run 前先查 state store，如果 step 已完成就**直接返回缓存结果**（不再执行 fn），
直到跑到未执行的 step 才真正调用 fn。这就是 event sourcing + replay 的核心：**function code 不变，runtime 通过状态决定哪些 step 跳过**。
画风：上半部分时间轴 + step 块；下半部分两条 timeline 对照（Run 1 失败、Run 2 replay）；箭头标 state store 读写。

## Layer 3 · 核心机制（≥ 3 段）

### 3.1 step.run：replay 缓存 + panic 控制流（SDK 心脏）

入口在 Go SDK 的 `step/run.go`。
[permalink to commit `c950111`](https://github.com/inngest/inngest/blob/c950111b4ef1a11e5236e63c298b3914ff1e2bf9/vendor/github.com/inngest/inngestgo/step/run.go#L34-L120)：

```go
// vendor/github.com/inngest/inngestgo/step/run.go:34-120
func Run[T any](
	ctx context.Context,
	id string,
	f func(ctx context.Context) (T, error),
) (T, error) {
	targetID := getTargetStepID(ctx)
	mgr := preflight(ctx, enums.OpcodeStepRun)

	if mgr == nil {
		// If there's no manager, execute the function directly.
		return f(ctx)
	}

	op := mgr.NewOp(enums.OpcodeStepRun, id)
	hashedID := op.MustHash()

	// ★ 核心：cache 命中检查
	if val, ok := mgr.Step(ctx, op); ok {
		return loadExistingStep(id, mgr, val, f)
	}

	if targetID != nil && *targetID != hashedID {
		// Don't report this step since targeting is happening and it isn't targeted
		panic(sdkrequest.ControlHijack{})
	}

	planParallel := targetID == nil && sdkrequest.IsParallel(ctx)
	planBeforeRun := targetID == nil && mgr.Request().CallCtx.DisableImmediateExecution
	if planParallel || planBeforeRun {
		plannedOp := sdkrequest.GeneratorOpcode{
			ID:       hashedID,
			Op:       enums.OpcodeStepPlanned,
			Name:     id,
			Userland: op.Userland(),
		}
		mgr.AppendOp(ctx, plannedOp)
		panic(sdkrequest.ControlHijack{})
	}

	// 真正执行用户的回调
	mw := internal.MiddlewareFromContext(ctx)
	mw.BeforeExecution(ctx, mgr.CallContext())
	pre := time.Now()
	result, err := f(setWithinStep(ctx))
	post := time.Now()
	mw.AfterExecution(ctx, mgr.CallContext(), result, err)
	// ...（错误处理 + 把结果包成 OpcodeStepRun 加进 mgr.ops）
}
```

旁注：

- **第一次调用**：`mgr.Step(ctx, op)` 返回 `(nil, false)` —— cache miss → 真正跑 `f(ctx)` →
  把结果加进 `mgr.ops` →（在 handler.go 上层）panic `ControlHijack{}` 退出函数 → SDK 把累计的 ops 序列化成 HTTP 响应。
- **第二次以后调用（replay）**：`mgr.Step` 在 `manager.go:341-360` 查 `r.request.Steps[hash]`
  —— 这个 map 是 executor 在请求 body 里塞进来的。命中就调 `loadExistingStep` 直接 unmarshal 缓存的 `T` 返回。
  **用户函数完全不知道自己在 replay**——同一份代码，行为由外部状态决定。
- **`panic(sdkrequest.ControlHijack{})` 是滥用 panic 当 generator**：Go 没有 yield 关键字，
  作者用 panic + 上层 recover 模拟"yield 一个 opcode 然后退出"。注释里自嘲：
  `XXX: I'm not very happy with using this; it is dirty`（`handler.go:1308` 附近）。
- **opcode hashing**：`op.MustHash()` 用 step id（用户传的 string）+ stack 索引算 sha256。
  这就是为什么用户必须给每个 step 起**唯一稳定**的 id —— 改 id 会失去 replay 能力。
- **targeting 模式**：当 executor 只想跑某一个特定 step（parallel 或 plan-then-run），
  `targetID` 会指定哪个 hash 该执行，其它都 panic 跳过。这是 V2 中 `OpcodeStepPlanned` 的运行时表现。

> **怀疑 1**：`mgr.Step` 用 `RLock` 读 cache，但 `r.unseen.Remove(hash)` 操作的是同一个数据结构。
> 看 manager.go:341-360：`unseen` 是 set，移除时仍用 RLock 而不是 Lock —— 这是设计上认为 set
> 自己线程安全，还是个 latent race？parallel step 同时跑时，多个 goroutine 并发减 unseen，
> 不应该是 Lock 吗？我没读到 unseen 的具体实现，存疑。

### 3.2 GeneratorOpcode + state machine（SDK ↔ executor 协议）

opcode 是 SDK 和 executor 之间的"中间表示"。
[permalink to commit `c950111`](https://github.com/inngest/inngest/blob/c950111b4ef1a11e5236e63c298b3914ff1e2bf9/pkg/execution/state/opcode.go#L26-L70)：

```go
// pkg/execution/state/opcode.go:26-70
type GeneratorOpcode struct {
	// Op represents the type of operation invoked in the function.
	Op enums.Opcode `json:"op"`
	// ID represents a hashed unique ID for the operation.  This acts
	// as the generated step ID for the state store.
	ID string `json:"id"`
	// Name represents the name of the step, or the sleep duration for sleeps.
	Name string `json:"name"`
	// Opts indicate options for the operation, eg. matching expressions
	// when setting up async event listeners via `waitForEvent`, or retry policies for steps.
	Opts any `json:"opts"`
	// Data is the resulting data from the operation, eg. the step output.
	Data json.RawMessage `json:"data"`
	// Error is the failing result from the operation
	Error *UserError `json:"error"`
	DisplayName *string `json:"displayName"`
	Timing interval.Interval `json:"timing"`
	Userland *struct {
		ID    string `json:"id"`              // User-defined ID
		Index int    `json:"index,omitempty"` // Autogenerated index for repeated IDs
	} `json:"userland,omitempty"`

	Metadata []metadata.ScopedUpdate `json:"metadata,omitempty"`
}

func (g GeneratorOpcode) Validate() error {
	if input, _ := g.Input(); input != "" && len(input) > consts.MaxStepInputSize {
		return ErrStepInputTooLarge
	}
	if output, _ := g.Output(); output != "" && len(output) > consts.MaxStepOutputSize {
		return ErrStepOutputTooLarge
	}
	return nil
}
```

opcode 类型表（[permalink](https://github.com/inngest/inngest/blob/c950111b4ef1a11e5236e63c298b3914ff1e2bf9/pkg/enums/opcode.go#L1-L40)）：

```go
// pkg/enums/opcode.go:7-30
const (
	OpcodeNone        Opcode = iota
	OpcodeStep               // step.run with maybe-wrapped data
	OpcodeStepRun            // guarantees data is not wrapped
	OpcodeStepError          // step errored
	OpcodeStepPlanned        // step reported but not yet executed
	OpcodeSleep
	OpcodeWaitForEvent
	OpcodeInvokeFunction
	OpcodeAIGateway          // AI gateway inference call
	OpcodeGateway
	OpcodeWaitForSignal
	OpcodeRunComplete
	OpcodeStepFailed
	OpcodeSyncRunComplete
	OpcodeDiscoveryRequest
	OpcodeDeferAdd
	OpcodeDeferAbort
)
```

旁注：

- **opcode = event sourcing 的事件**。SDK 每跑一次函数，产出一组 opcodes（通常是 1-N 个）。
  executor 拿到 opcodes 后，把 step 结果写入 state store，然后决定下一步：
  `OpcodeSleep` → enqueue 一个 delayed job；`OpcodeWaitForEvent` → 注册 pause；
  `OpcodeRunComplete` → finalize；普通 `OpcodeStepRun` → 立刻 re-invoke SDK 跑下一段。
- **opcode 不是 "next instruction"，是 "what just happened or wants to happen"**。
  这是 event sourcing 的精髓：你不存"现在第几行"，你存"发生过什么"，replay 时按事件重建状态。
- **15 种 opcode 但只有 ~5 种被前端"广泛用"**（StepRun / Sleep / WaitForEvent / InvokeFunction / RunComplete）。
  剩下的 `OpcodeDeferAdd` / `OpcodeAIGateway` / `OpcodeGateway` 是新加的、半隐藏 feature。
- **`Validate()` 强制 step input/output size**：超限直接拒绝（`MaxStepOutputSize` 在 consts 里默认 4MB）。
  这是为什么 Inngest 的最佳实践是"step 之间传引用，不传大对象"。
- **`Userland` 字段存用户原始 ID + autogenerated index**：
  当用户在循环里写 `for i := 0; i < 10; i++ { step.Run("loop-step", ...) }`，
  SDK 会自动在 hash 里加 index 区分。但用户**要小心循环长度漂移**——如果你下次跑这个函数循环少一次，
  缓存就对不上了，replay 会失败。

> **怀疑 2**：`GeneratorOpcode` 的 `Opts any` 字段 + 各种 `OptsAsXXX()` accessor（见 opcode.go:244-450 区段）
> 是典型的 untyped sum type。Go 没有 sum types 是真的，但**这种 unmarshal-on-read 模式让"opts shape 改了 → 旧 SDK 发的 opcode 还能解码吗"成为关键问题**。
> 仓库里有没有 opts 反向兼容的回归测试？我只看到 opcode_test.go 182 行，覆盖度疑虑大。

### 3.3 executor 调度 + queue 后端（运行时心脏）

executor 的 `Execute` 入口会被 queue worker 反复调用。
[permalink to commit `c950111`](https://github.com/inngest/inngest/blob/c950111b4ef1a11e5236e63c298b3914ff1e2bf9/pkg/execution/executor/executor.go#L1587-L1620)：

```go
// pkg/execution/executor/executor.go:1587-1620
func (e *executor) Execute(ctx context.Context, id state.Identifier, item queue.Item, edge inngest.Edge) (*state.DriverResponse, error) {
	conditionalTraceCtx, conditionalSpan := e.conditionalTracer.NewSpan(ctx, "executor.Execute", id.AccountID, id.WorkspaceID, id.WorkflowID)
	defer conditionalSpan.End()

	// Immediately store execution context for tracing.
	ctx = tracing.WithExecutionContext(ctx, tracing.ExecutionContext{
		Identifier:  sv2.IDFromV1(id),
		Attempt:     item.Attempt,
		MaxAttempts: item.MaxAttempts,
		QueueKind:   item.Kind,
	})

	if e.fl == nil {
		return nil, fmt.Errorf("no function loader specified running step")
	}

	requestID := ulid.MustNew(ulid.Timestamp(e.now()), rand.Reader).String()
	jobID := queue.JobIDFromContext(ctx)
	if item.JobID != nil {
		jobID = *item.JobID
	}
	ctx = driver.WithRequestIDs(ctx, requestID, jobID)
	// ...（log 上下文 / 并发限制 / 加载函数定义 / 调用 e.run(ctx, i) 进入 driver）
}
```

sleep 处理（`handleGeneratorSleep`，
[permalink](https://github.com/inngest/inngest/blob/c950111b4ef1a11e5236e63c298b3914ff1e2bf9/pkg/execution/executor/executor.go#L4152-L4200)）：

```go
// pkg/execution/executor/executor.go:4152-4195
func (e *executor) handleGeneratorSleep(ctx context.Context, runCtx execution.RunContext, gen state.GeneratorOpcode, edge queue.PayloadEdge) error {
	dur, err := gen.SleepDuration()
	if err != nil { return err }

	nextEdge := inngest.Edge{
		Outgoing: gen.ID,             // Leaving sleep
		Incoming: edge.Edge.Incoming, // To re-call the SDK
	}

	until := e.now().Add(dur)

	// Create another group for the next item which will run.
	groupID := uuid.New().String()
	ctx = state.WithGroupID(ctx, groupID)

	jobID := queue.HashID(ctx, fmt.Sprintf("%s-%s", runCtx.Metadata().IdempotencyKey(), gen.ID))
	nextItem := queue.Item{
		JobID:       &jobID,
		WorkspaceID: runCtx.Metadata().ID.Tenant.EnvID,
		// Sleeps re-enqueue the step so that we can mark the step as completed
		// in the executor after the sleep is complete.  This will re-call the
		// generator step, but we need the same group ID for correlation.
		GroupID:               groupID,
		Kind:                  queue.KindSleep,
		Identifier:            sv2.V1FromMetadata(*runCtx.Metadata()),
		PriorityFactor:        runCtx.PriorityFactor(),
		CustomConcurrencyKeys: runCtx.ConcurrencyKeys(),
		Semaphores:            stepSemaphores(*runCtx.Metadata()),
		Attempt:               0,
		MaxAttempts:           runCtx.MaxAttempts(),
		Payload:               queue.PayloadEdge{Edge: nextEdge},
		Metadata:              make(map[string]any),
		ParallelMode:          gen.ParallelMode(),
	}
	// ...（创建 trace span / 调 queue.Enqueue 把 nextItem 投进队列，AT 时刻是 until）
}
```

旁注：

- **sleep 不是真睡觉**：executor 收到 `OpcodeSleep` 后，**不会** `time.Sleep(24h)`——
  那会占住 worker。它把"24 小时后再调一次这个函数"的任务投进 queue（`AtMS = now + 24h`）。
  worker 只在到点时才会 dequeue。**这是为什么 Inngest 的 sleep 可以跨进程重启不丢**。
- **HTTP re-invoke 模型**：每次 step 之间的 SDK 调用都是一次 POST。
  `pkg/execution/driver/httpv2/httpv2.go:155-235` 是这个调用的实现——
  body 包含 step cache（`r.request.Steps`），response 是新产生的 opcodes。
  所以**用户的 server 必须 always-on**，但**不需要长连**。
- **idempotency key**：`runCtx.Metadata().IdempotencyKey() + gen.ID` 哈希成 jobID。
  queue 看到相同 jobID 不会重复 enqueue —— 哪怕 executor 因为重启又重新 handle 一次同样的 generator response，
  也不会创建重复 sleep job。
- **GroupID 是同一组 step 的关联键**：parallel step / sleep 后的 step 都用同一个 group，
  方便 lifecycle hook 和 trace 把它们串成一棵树。
- **queue 后端是 redis**：见 `pkg/execution/queue/` 目录（45+ Go 文件）。
  partition / shadow_partition / shard 三层结构是为多 tenant 隔离 + 公平调度设计的——
  **这是 Inngest 商业版的硬核**，OSS dev server 用 miniredis 模拟，单进程也能跑通整套机制。

> **怀疑 3**：sleep 的 jobID 是 `IdempotencyKey() + gen.ID` 哈希。
> 如果用户在循环里写 `for i := 0; i < 5; i++ { step.Sleep("nap", 1*time.Second) }`，
> 第二次 enqueue sleep 时 gen.ID 会因为 Userland.Index 不同而 hash 不同吗？
> 看 `op.MustHash()` 实现需要追到 `mgr.NewOp` —— 但如果 hash 算法没考虑循环索引，
> 第二个 sleep 会被 idempotency 直接吞掉。这是 SDK + executor 跨边界的一个潜在陷阱。


## Layer 4 · 改一处（hands-on）

### 30 分钟跑通 dev server + 一个 idempotent step.run + replay 验证

**目标**：写一个故意第一次失败、第二次成功的 step.run，看 replay 是否真的跳过已完成的 step。

**步骤 1：clone + build**

```bash
GIT_SSL_NO_VERIFY=true git clone --depth 1 https://github.com/inngest/inngest /tmp/inngest-study
cd /tmp/inngest-study
go build -o ./bin/inngest ./cmd/inngest
./bin/inngest dev   # 默认监听 :8288，dev UI 在 http://localhost:8288
```

**步骤 2：写 idempotent function**

新建 `/tmp/replay-toy/main.go`：

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/inngest/inngestgo"
	"github.com/inngest/inngestgo/step"
)

func main() {
	client, _ := inngestgo.NewClient(inngestgo.ClientOpts{
		AppID:   "replay-toy",
		EventKey: inngestgo.StrPtr("dev"),
	})

	var attempts int

	_, _ = inngestgo.CreateFunction(
		client,
		inngestgo.FunctionOpts{ID: "demo-replay"},
		inngestgo.EventTrigger("toy/run", nil),
		func(ctx context.Context, in inngestgo.Input[any]) (any, error) {
			a, _ := step.Run(ctx, "always-ok", func(ctx context.Context) (string, error) {
				fmt.Println(">>> step A executing (this should print exactly ONCE)")
				return "A done", nil
			})

			b, err := step.Run(ctx, "fail-first-time", func(ctx context.Context) (string, error) {
				attempts++
				fmt.Println(">>> step B attempt", attempts)
				if attempts == 1 {
					return "", fmt.Errorf("simulated transient failure")
				}
				return "B done after retry", nil
			})
			if err != nil {
				return nil, err
			}

			step.Sleep(ctx, "tiny", 2*time.Second)

			c, _ := step.Run(ctx, "after-sleep", func(ctx context.Context) (string, error) {
				fmt.Println(">>> step C executing (only after sleep resumes)")
				return "C done", nil
			})

			return map[string]any{"a": a, "b": b, "c": c}, nil
		},
	)

	http.ListenAndServe(":3000", client.Serve())
	_ = os.Stdout.Sync()
}
```

**步骤 3：触发**

```bash
go run /tmp/replay-toy/main.go &       # 终端 1：用户 server
# inngest dev 会扫描 http://localhost:3000/api/inngest 注册函数

curl -X POST http://localhost:8288/e/dev \
  -H 'Content-Type: application/json' \
  -d '{"name":"toy/run","data":{}}'    # 终端 2：发事件
```

**预期输出**（终端 1）：

```
>>> step A executing (this should print exactly ONCE)
>>> step B attempt 1                          # 第一次：B 失败
>>> step B attempt 2                          # 第二次：B 成功（重试）
                                              # ↑ 注意 A 没再 print —— replay 跳过了
                                              # （sleep 2s）
>>> step C executing (only after sleep resumes)
```

**关键验证点**：

- A 只 print 一次 → cache hit 真的工作了（Run 1 失败时 A 已经写进 state，Run 2 直接返回缓存）
- B 重试时 attempts=2 → SDK 进程内 counter 在递增（**注意：这种"靠进程内变量计数"在 SDK 多进程部署时会失效**——
  这就是为什么文档强调"step.run 必须 idempotent"）
- C 在 sleep 后才 print → executor 真的把 nextItem enqueue 到 2 秒后才 dequeue

**改一处实验**：把 step B 的 id 从 `"fail-first-time"` 改成 `"fail-first-time-v2"` 重新发事件。
观察：B 的 hash 变了 → cache 失效 → 整个 run 从 A 重新开始（A 也会重新 print）。
这就是 **step id 是 cache key，不要随便改** 的实证。

## Layer 5 · 横向对比

### 5.1 维度对比

| 维度 | Inngest | Temporal | trigger.dev V3 | BullMQ |
|---|---|---|---|---|
| 部署模型 | **stateless HTTP server** + 后端 (Redis+PG) | worker daemon 长连 cluster | V8 isolate runtime（平台跑） | Redis + worker 进程 |
| 函数代码受何约束 | 必须 idempotent；不写 deterministic constraint | 必须 deterministic（不能 `time.Now()`） | 必须 idempotent | 不约束（每个 job 独立） |
| sleep 实现 | HTTP re-invoke + delayed queue | runtime sleep（worker 阻塞） | runtime sleep（isolate 内 yield） | delayed job |
| 跨语言 | TS / Python / Go 三家 SDK | Go / Java / TS / Python / .NET | TS-only（V3） | TS-only |
| 状态可视化 | dev UI + cloud UI（runs / steps / events） | Temporal UI | trigger.dev dashboard | Bull Board (社区) |
| OSS / 商业 | OSS (Apache 2.0) + Cloud | OSS (MIT) + Temporal Cloud | TS OSS + 商业 cloud | OSS only |
| star (2026-05) | ~3.4k | ~12k | ~9k | ~6k |
| sweet spot | edge / serverless / 中小 SaaS | 金融 / 大规模工程 | TS 单语言团队 | 简单 queue 场景 |

### 5.2 哲学不同的竞品：DBOS（durable execution-as-database）

DBOS 的判断完全不同：**让 Postgres 自己做 durable execution**——
你的函数每个 step 就是 SQL transaction，状态机存在 PG 里，
不需要外部 executor。这是把"持久化"下沉到数据库层。

| 维度 | Inngest | DBOS |
|---|---|---|
| 状态在哪 | Inngest state store (Redis + PG) | 你自己的 Postgres |
| 心智模型 | "把代码当 event log 重放" | "把代码当 PG 事务序列" |
| 跨服务调用 | 原生（用户 server 是 HTTP endpoint） | 有限（需要 PG 跨实例可见） |

DBOS 适合"我所有状态都在 PG"的场景（典型：财务系统）；
Inngest 适合"我有多个服务、跨语言、跨 cloud"的场景。

### 5.3 选型建议

- **edge function / 多 runtime / 跨语言团队** → Inngest
- **金融级 deterministic guarantee 必须** → Temporal（受得起 worker daemon 的运维代价）
- **TS 单语言、想要更"火热"的开发体验和 dashboard** → trigger.dev V3
- **没有 workflow 概念、只是后台任务** → BullMQ + 自己拼
- **所有状态都在 PG** → DBOS

## Layer 6 · 与当前工作连接

> 上下文：Activity Planner 是黑客松子项目，用 LangGraph 做多步规划 + checkpoint。
> 写笔记的此刻，我正在思考 LangGraph checkpoint 模式 vs Inngest replay 模式的同异。

### 今天就能用

- **把 LangGraph checkpoint 模式当成 Inngest replay 的"内存版"读**：两者都是
  "函数式代码 + 外部状态 + replay"。LangGraph 的 `checkpointer` 写在 SQLite/PG，
  Inngest 写在 state store——但**心智完全相通**：状态机不在代码里，在外部存储里，
  代码本身只是声明转换关系。这是 Activity Planner 重构 plan 流程时的关键参照。
- **`step.run` 的 id 必须稳定**这个原则直接搬到 LangGraph node id：
  改 node 名字 = 让 checkpoint 失效，blast radius 比想象大。
- **idempotency 设计**：写新 step 前先问"如果这步被调用两次，会有什么副作用？"
  Inngest 把这条原则写进了 SDK 文档第一页，值得在 Activity Planner 的 plan 节点里也强制——
  尤其是调外部 API（搜索 POI、订餐厅）的节点。
- **opcode 当 audit log 用**：opcode log 天然就是"这个 plan 怎么从 A 走到 B"的证据链。
  Activity Planner 现在的 plan trace 是手工拼字符串，**不如直接抽象成 opcode 序列**——
  既能 replay debug，又能渲染成时间线。

### 下个月能用

- **如果 Activity Planner 要支持"用户填了一半，关掉浏览器，几小时后回来继续"**：
  这就是 durable workflow 的标准场景。用 Inngest（或 LangGraph 的 long-running checkpointer）
  比自己手写 status 字段省得多。
- **多 plan 共享某些 step**（如"查 POI"是多个 plan 都要做的）：用 `step.invoke` 模式
  让"查 POI"成为独立 function，被多个 plan 调用，结果天然有 dedup + cache。
- **HTTP re-invoke 模型当成"无 daemon 的后台任务"心智锚**：以后做任何"长任务"，
  优先想"能不能拆成 step 让外部 schedule 我，而不是我自己 keep-alive"。
  这跟 cloud function 时代的 stateless 心智完全一致。
- **看 Inngest 的 `pkg/execution/state/opcode.go` 是怎么定义"function 内部状态"的**：
  把 Activity Planner 的 plan state schema 也按 opcode 风格重写一次，会自然得到
  serializable + replay-safe 的设计。

### 不要用的部分

- **不要把 Inngest 当 "Redis queue 替代品"**：单看 enqueue/dequeue 它比 BullMQ 重得多。
  没有 step 概念的简单任务（"发个邮件"、"写个 log"）BullMQ 更合适。
- **生产部署不要 OSS dev server**：dev server 嵌的 miniredis + sqlite **没有持久化保证**——
  进程挂了 state 全丢。生产要么用 Inngest Cloud，要么自己部 Redis + Postgres + executor 集群。
- **不要在 step.run 里调 step.run 套娃**：opcode hash 是按 stack 索引算的，嵌套调用会破坏 hash 稳定性。
  正确姿势是用 `step.invoke` 显式调另一个 function。
- **不要把 step output 当大对象存**：超过 4MB 直接报错。
  state store 是 hot path，存大数据会拖垮 replay 性能——大对象走 S3 + 在 step 里只存 URL。


## Layer 7 · 自检 + 延伸

### 7.1 三件具体怀疑（追到行号）

- **怀疑 4**：`pkg/execution/state/opcode.go:148` 的 `IsError() bool` 只检查 `g.Error != nil`，
  但 `OpcodeStepFailed` 是另一个 opcode（不是 error 字段非空）。
  如果 SDK 发的是 `OpcodeStepFailed` 但 `Error` 为 nil（比如只有 status code），
  这个 IsError 会返回 false——executor 会不会误以为成功？读 driver_response.go 的失败处理
  能否覆盖这种 edge case？
- **怀疑 5**：`pkg/execution/executor/executor.go:1571` 的 `handleFunctionSkipped` 会在 schedule 阶段
  因为 `skipped(req)` 命中而把整个 run 标记 skip。我没找到 skip 的原因如何回报给用户——
  用户怎么知道"我发的事件被 throttle / debounce / cancel 了"？是只在 dev UI 里能看，还是
  有 webhook / log 自动通知？
- **怀疑 6**：vendor 里嵌的 `inngestgo` 版本和外部 [inngest/inngestgo](https://github.com/inngest/inngestgo)
  最新版本一定一致吗？go.mod 用 `replace` 指令吗？如果不一致，端到端测试用的 SDK 行为
  可能和用户实际 import 的 SDK 行为有 drift——这是个 latent bug 源。

### 7.2 接下来读哪 N 个文件

| 文件 | 为什么读 |
|---|---|
| `vendor/github.com/inngest/inngestgo/internal/sdkrequest/manager.go`（全 ~400 行） | 看 `Step()` / `AppendOp()` / `unseen` 的并发模型，验证或证伪怀疑 1 |
| `pkg/execution/state/opcode.go` 全部 654 行 | 看每种 `XxxOpts()` accessor，验证或证伪怀疑 2 |
| `pkg/execution/queue/enqueue.go` + `process.go` | 看 idempotent jobID 的具体哈希策略 + dedup 时机，证伪怀疑 3 |
| `pkg/execution/state/driver_response.go` 647 行 | 看 driver 失败 vs 成功的判定全路径，证伪怀疑 4 |
| `pkg/devserver/devserver.go:167-300`（启动序列） | 看 in-mem dev server 怎么把 executor / queue / state / driver 串起来——是写自己 prototype 的最佳模板 |
| `tests/golang/checkpoint_test.go` | 看 checkpointing 的端到端语义（V0.40+ 新 feature） |


## 限制段（≥ 3 条独立限制）

1. **每个 step 是一次 HTTP round-trip**——单步延迟硬地板大约 50-200ms（网络 + JSON 解析 + state 读写）。
   做高频小任务（每秒 1000 个 step）会被网络往返打死；这种场景不该用 Inngest，应该是普通 queue + 进程内状态机。

2. **state 增长不可控**：每个 step 的 input + output 都被存进 state store。
   长时 workflow（跑几天、上百个 step）的 state 体积可能上 MB 量级。
   读 `pkg/execution/state/state.go:283-330` 的 `State` 接口——`Actions()` / `Events()` 都是全量返回的，
   长 plan 的内存压力会变大。

3. **panic-as-control-flow 让栈追踪噪声大**：每个 step.run 命中 cache miss 后会 panic 退出函数，
   生产环境的 panic monitor（如 Sentry）默认会上报。需要专门加白名单忽略 `ControlHijack{}` 类型，
   否则 alert 会被刷爆——这是采用 Inngest 的隐藏运维成本。

4. **dev server 不能持久化**：`pkg/devserver/devserver.go:809` 的 `createInmemoryRedis` 用的是 miniredis，
   进程退出 state 全丢。生产部署要么 Inngest Cloud，要么自己起 Redis + PG + executor service——
   这一步的运维复杂度比 BullMQ（"装 Redis 就完事了"）高一个数量级。


## 附录：宣传 vs 现实

| 宣传（README / docs / 一作 blog） | 代码现实 |
|---|---|
| "Stateless functions. No queues. No workers." | 字面错误：仓库里 `pkg/execution/queue/` 有 45+ 个 Go 文件，是分布式 redis 队列的硬核实现。"无 queue"指的是**用户不需要管 queue**，但 queue 必须在那。 |
| "Just write async functions." | 你确实写 async 函数，但**必须 idempotent**、step.run 必须有稳定 id、不能在 step 外存共享状态——这是一组隐藏约束，新手踩坑频繁。 |
| "Run anywhere — Vercel, Lambda, Cloudflare Workers." | 真的——只要你的 server 能 export HTTP handler 就行（`client.Serve()` 返回标准 http.Handler）。这点比 Temporal 强很多。 |
| "Reliable durable execution out of the box." | 取决于"the box"——dev server 用 miniredis 是**不持久化**的。生产 durable 需要你部署或买 Inngest Cloud。 |
| "Free tier forever." | OSS Apache-2.0，可自托管所有 feature。但 Cloud 免费额度有限，超过要付费。OSS 自托管要付出运维成本（Redis 集群 + PG + executor）。 |
| "Type-safe events." | TS SDK 真的有；Go SDK 是 generic-based 但**事件 schema 没有静态校验**——发错 event name 只能 runtime 报错。 |


升级日期：2026-05-28
启用工具：本地 git clone --depth 1 / Read / grep
