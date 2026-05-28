---
title: "XState — 把状态画成图"
description: 有限状态机 + Actor 模型，把"看似简单的状态"变成可视化的设计文档
sidebar:
  order: 16
  label: "statelyai/xstate"
---

> statelyai/xstate v5.31.x（2026-05），MIT，commit `ddca0ff8c53dc2e85f9173514cc686308d65bd2c`。
>
> XState 不是状态管理库——状态机才是。
> 它的核心主张：**很多 bug 是因为没把状态画清楚**。
> 一旦你把"加载中 / 成功 / 失败 / 重试"画成有向图，
> 你会发现以前的 useState + boolean flag 写法有 4 个不可达状态和 2 个未处理转移。
>
> 这是 Season 2「类型当设计工具」第二篇。本笔记按 [状元篇 v1.1](/study/method/) **分支 B 工具库** 模板写。

## Layer 0 · 身份扫描

| 项 | 值 |
|---|---|
| 仓库 | [statelyai/xstate](https://github.com/statelyai/xstate) |
| star | ~28k |
| 主语言 | TypeScript（核心 100% TS） |
| License | MIT |
| 心脏包 | `packages/core` |
| 心脏文件 | `createActor.ts` (888 行) / `stateUtils.ts` (1850 行) / `setup.ts` (454 行) |
| 锚定 commit | `ddca0ff8c53dc2e85f9173514cc686308d65bd2c` |
| 维护方 | Stately Inc.（David Khourshid 主导） |
| 项目类型 | 工具库（兼框架特征：actor 编排 + adapter 生态） |

**self-classify 推导**：心脏物是"小 surface API + 单一职责（FSM/Actor 抽象）"，核心包 `packages/core` 才几千行可读代码——属于**工具库**。
xstate-react / xstate-vue 等 adapter 让它有"框架感"，但它们只是把 createActor 包装成各框架的 hook，本质仍是工具库 + bindings。

## Layer 1 · 一句话定位

**XState = 一个 createMachine（声明状态图）+ 一个 createActor（运行它）。**
机器是数据（纯定义），actor 是运行时进程（有 mailbox、能 send、能 spawn 子 actor）。
两者分离，让"状态设计"和"状态执行"也物理隔离。

## Why（为什么是它而不是 useReducer / Redux / zustand）

绝大多数 React 项目里这种代码很常见：

```typescript
const [isLoading, setIsLoading] = useState(false)
const [data, setData] = useState(null)
const [error, setError] = useState(null)
const [retries, setRetries] = useState(0)
```

4 个布尔/标志位 = $2^4 = 16$ 种组合，但只有 4 个**真正有意义**：

- `idle`（都为空）
- `loading`（isLoading=true）
- `success`（data 有值）
- `error`（error 有值）

**剩下 12 种组合是不可达 / 矛盾的**。比如 `isLoading=true && data=有值 && error=有值`。

写这种代码的人通常用 `useEffect` 加一堆 if 来"防止矛盾"——
但**防御代码越多，bug 越多**。

XState 的回答：**禁止矛盾，从源头**。

```typescript
const machine = createMachine({
  id: 'fetch',
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: {
      on: {
        SUCCESS: 'success',
        ERROR: 'error'
      }
    },
    success: { on: { FETCH: 'loading' } },
    error: { on: { RETRY: 'loading' } }
  }
})
```

只有 4 个状态。**所有不在转移图里的状态根本不存在**——TS 类型层面就限制不了写错。

| 库 | 状态模型 | 转移约束 | 异步 | 可视化 |
|---|---|---|---|---|
| **useState** | 多个独立标志位 | 无 | 手动 useEffect | 无 |
| **useReducer** | 单 state + action union | reducer 内部判断 | 手动 effect | 无 |
| **Redux** | global state + saga/thunk | reducer + middleware | saga 是状态机 | redux-devtools |
| **zustand** | 全局 store | 无 | actions 内 | 无 |
| **XState** | **状态机 + actor** | **图本身就是约束** | invoke / fromPromise | **Stately Studio** |

**为什么不是 useReducer**：useReducer 是状态机的退化版（没有"当前状态决定能响应哪些 action"的概念）。
XState 你在 `loading` 状态发 `LOGOUT` 事件不会触发——因为图里没画。
useReducer 你必须每个 case 自己 `if (state.kind !== 'loading') return state`。

**为什么不是 Redux Saga**：Saga 是用 generator 写的状态机，但**它不可视化**。
XState 用纯数据描述状态机，可以直接 export 到 [Stately Studio](https://stately.ai) 画出有向图。**画图就是 code review**。

**为什么不是 Effect-TS 的 actor**：Effect-TS 也有 actor 模型（甚至更优雅），
但它是 FP 范式重型库，学习曲线陡。XState 是"普通 React 程序员就能上手"的取舍。

## Layer 2 · 仓库地形

```
xstate/
├── packages/
│   ├── core/                       ← ★ 主包（本笔记主战场）
│   │   └── src/
│   │       ├── createMachine.ts    ← 165 行：把 config 包成 StateMachine
│   │       ├── createActor.ts      ← 888 行 ★★★ 运行时 actor 实现
│   │       ├── stateUtils.ts       ← 1850 行 ★★★ microstep / macrostep（SCXML 算法核心）
│   │       ├── setup.ts            ← 454 行 ★★ v5 类型推导引擎
│   │       ├── StateMachine.ts     ← 686 行：StateMachine 类（纯定义，不运行）
│   │       ├── StateNode.ts        ← 476 行：单个状态节点
│   │       ├── State.ts            ← 511 行：snapshot
│   │       ├── guards.ts           ← 守卫条件
│   │       ├── actors/             ← fromPromise / fromCallback / fromObservable
│   │       ├── actions/            ← assign / raise / sendTo / spawn
│   │       └── types.ts            ← 2788 行（TS 泛型山，是手册不是心脏）
│   ├── xstate-react/               ← React adapter（useMachine / useActor）
│   ├── xstate-vue/                 ← Vue adapter
│   ├── xstate-svelte/              ← Svelte adapter
│   ├── xstate-solid/               ← Solid adapter
│   └── xstate-store/               ← 不要状态机时的轻量替代
├── examples/
└── templates/
```

**Layer 2 心脏文件清单**（v1.1 工具库模板要求 2-3 个）：

1. `packages/core/src/createActor.ts:77`——Actor 类是运行时核心（mailbox + observers + system）
2. `packages/core/src/stateUtils.ts:1649`——macrostep / microstep 是 SCXML 算法实现
3. `packages/core/src/setup.ts:334`——v5 的类型推导引擎（柯里化 setup）

types.ts 有 2788 行，但**那是 TS 泛型手册不是运行时心脏**——读它会陷入泛型迷宫，跳过。

## Layer 3 · 核心机制精读（≥ 3 段）

> Figure 1 把后续 3 段机制串成一张图：root actor 包含层级状态，外面有兄弟 actor，下面有 macrostep 时间轴。
> ![XState Actor Model + Hierarchical State Machine](/study/projects/xstate/01-actor-model.webp)

### 机制 1 · 机器是数据，actor 是进程

`createMachine.ts:76-110`（签名简化版）：

```typescript
export function createMachine<
  TContext extends MachineContext,
  TEvent extends AnyEventObject,
  // ... 12 个泛型参数
>(
  config: MachineConfig<TContext, TEvent, /* ... */>
): StateMachine<TContext, TEvent, /* ... */> {
  // 把 config 包装成 StateMachine 实例（纯计算对象）
  return new StateMachine(config) as any
}
```

**StateMachine 是值，不是进程**：它没有"当前状态"，没有 mailbox，
你可以序列化它、把它发给后端、画成图。

要让它"活"起来，需要 createActor。锚定源码：
[`createActor.ts:861-872`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L861-L872)：

```typescript
export function createActor<TLogic extends AnyActorLogic>(
  logic: TLogic,
  ...[options]: ConditionalRequired<
    [
      options?: ActorOptions<TLogic> & {
        [K in RequiredActorOptionsKeys<TLogic>]: unknown;
      }
    ],
    IsNotNever<RequiredActorOptionsKeys<TLogic>>
  >
): Actor<TLogic> {
  return new Actor(logic, options)
}
```

返回 `Actor` 实例（[`createActor.ts:77-122`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L77-L122)）：

```typescript
export class Actor<TLogic extends AnyActorLogic>
  implements ActorRef<SnapshotFrom<TLogic>, EventFromLogic<TLogic>, EmittedFrom<TLogic>>
{
  /** The current internal state of the actor. */
  private _snapshot!: SnapshotFrom<TLogic>;
  public clock: Clock;
  public options: Readonly<ActorOptions<TLogic>>;
  public id: string;

  // mailbox: 单 actor 内部串行队列，保证转移原子性
  private mailbox: Mailbox<EventFromLogic<TLogic>> = new Mailbox(
    this._process.bind(this)
  );

  private observers: Set<Observer<SnapshotFrom<TLogic>>> = new Set();
  private eventListeners: Map<string, Set<...>> = new Map();
  private logger: (...args: any[]) => void;

  /** @internal */
  public _processingStatus: ProcessingStatus = ProcessingStatus.NotStarted;

  public _parent?: AnyActorRef;
  public sessionId: string;        // 全局唯一 process id
  public system: AnyActorSystem;   // 所有 actor 共享的"调度器"
  public src: string | AnyActorLogic;
  // ... constructor: 接 logic + options，注册到 system
}
```

**Actor 才是有 mailbox、能 `.send()`、能 `.subscribe()`、能被 `.start()` / `.stop()` 的运行时对象。**

**旁注 5 条**：

1. `_snapshot` 用 `private` + `!` 强行延迟初始化——构造时还没 start，没法算出初始 snapshot
2. `mailbox` 是 actor 内部的串行队列，保证一次只处理一个事件——这是**转移原子性**的物理基础
3. `observers: Set<...>` 用 Set 而不是数组，是为了 unsubscribe 时 O(1) 删除
4. `sessionId` 来自 `system._bookId()`——全局自增，不是机器 id（id 可重复，sessionId 全局唯一）
5. 构造时如果 `parent` 存在就复用 `parent.system`，否则 `createSystem(this, ...)`——**整棵 actor 树共享一个 system**

**机器和 actor 分离的设计意义**：

- 同一个机器可以创建多个 actor 实例（multi-tenant）
- 机器可以静态分析（"是否有不可达状态"等）
- 机器可以可视化（Stately Studio 加载机器定义）

vs Redux：reducer + store 是绑死的；reducer 不能被视为独立的"行为定义"。

**怀疑 1**：`_snapshot!` 这种 non-null assertion 是 TS 安全性的"灰色地带"——
如果 `getSnapshot()` 在 `start()` 之前被调用，运行时会拿到 `undefined`。
源码用 `if (isDevelopment && !this._snapshot) throw` 兜底（`createActor.ts:810-816`），
但生产构建**不会抛**——会返回 undefined 给调用方，可能引发 `Cannot read property 'context' of undefined`。
这是**设计缺陷还是性能取舍**？我倾向后者——dev 模式抛错足够提早暴露问题，prod 不抛是为了省判断成本。
但用户教育成本不低（"为什么我的 SSR 代码崩了"在 GitHub issue 里反复出现）。

### 机制 2 · 事件路由经过 system._relay（中央调度器）

你以为 `actor.send(event)` 会直接处理事件？不是。

[`createActor.ts:744-756`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L744-L756)：

```typescript
/**
 * Sends an event to the running Actor to trigger a transition.
 *
 * @param event The event to send
 */
public send(event: EventFromLogic<TLogic>) {
  if (isDevelopment && typeof event === 'string') {
    throw new Error(
      `Only event objects may be sent to actors; use .send({ type: "${event}" }) instead`
    )
  }
  this.system._relay(undefined, this, event)    // ← 关键
}
```

`system._relay(from, to, event)` 是整个 actor 系统的中央路由器。
它把事件投递到目标 actor 的 mailbox：

[`createActor.ts:728-742`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L728-L742)（`_send` 内部入队）：

```typescript
public _send(event: EventFromLogic<TLogic>) {
  if (this._processingStatus === ProcessingStatus.Stopped) {
    // do nothing
    if (isDevelopment) {
      const eventString = JSON.stringify(event)
      console.warn(
        `Event "${event.type}" was sent to stopped actor "${this.id} (${this.sessionId})". This actor has already reached its final state, and will not transition.\nEvent: ${eventString}`
      )
    }
    return
  }
  this.mailbox.enqueue(event)
}
```

**为什么要经过 system 而不是直接 mailbox.enqueue**：

1. **跨 actor 通信**：父 actor `system._relay(self, child, event)` 给子 actor 发事件——`from` 不是 `undefined` 就走这条路径
2. **inspection**：DevTools 可以挂在 system 上观察所有事件流（[Stately Inspect API](https://stately.ai/docs/inspector)）
3. **调度**：mailbox 按顺序处理，保证转移的原子性
4. **隔离**：actor 之间不共享内存，只通过 relay 传递消息——这是 Actor 模型的本质要求

**旁注 5 条**：

1. `send()` 把第一个参数（`from`）传成 `undefined`——**外部输入（如 `actor.send` 调用）的 `from` 是空**，区别于 actor 之间互发
2. dev 模式还检查"是不是直接传字符串而非 event 对象"——`actor.send('FETCH')` 会抛错，避免新手把字符串当 event 类型用
3. `_send` 看到 `Stopped` 状态默默返回（dev 模式 warn）——这是"静默丢弃"语义（怀疑点之一，见下）
4. `mailbox.enqueue` 不是直接 `_process`——入队后**异步**调度处理，避免栈溢出（recursive send）
5. `_processingStatus` 是 `enum` 而非 boolean：`NotStarted / Running / Stopped` 三态——不能简单 boolean 化，因为"还没 start"和"已经 stop"语义不同

→ 这是经典的 **Actor 模型**（Erlang / Akka 那套）：actor 之间不共享内存，
只通过消息传递。XState 在 JS 单线程里模拟出了这个范式。

**path:line 引用**：详细代码段在 `packages/core/src/createActor.ts:744-756` 与 `packages/core/src/createActor.ts:728-742`。

**怀疑 2**：actor 在 `Stopped` 状态收到事件**默默丢弃**（[`createActor.ts:728-742`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L728-L742)），仅 dev 模式 warn。
这种"静默丢弃"在生产是好设计还是坏设计？
**好处**：不抛错让上层代码不必到处 try/catch；race 场景（用户快速切换路由 → 老 actor 已 stop 但事件还在飞）不会变成 noisy error。
**坏处**：bug 很难发现——你 send 了事件，"什么都没发生"，调试时容易归因到机器本身写错。
我猜 XState 团队选这条是因为 **dev mode warn 已经够用 + Promise rejection 已有惯例**，
但这种"默认 forgiving"对新手不友好——更安全的设计应该是返回一个 `boolean` 或 `Result<void, ActorStoppedError>`，让调用方显式选择忽略或处理。

### 机制 3 · microstep / macrostep — SCXML 算法

XState 的状态转移**严格按 W3C SCXML 标准实现**。SCXML 区分两个概念：

- **microstep**：一次转移的原子操作（exit 旧状态 → 执行 actions → enter 新状态）
- **macrostep**：从一个稳定状态到下一个稳定状态（可能经过多个 microstep，因为
  转移过程中可能 raise 内部事件触发新的 microstep）

[`stateUtils.ts:1649-1700`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/stateUtils.ts#L1649-L1700)（macrostep 入口）：

```typescript
export function macrostep(
  snapshot: AnyMachineSnapshot,
  event: EventObject,
  actorScope: AnyActorScope,
  internalQueue: AnyEventObject[]
): {
  snapshot: typeof snapshot;
  microsteps: Microstep[];
} {
  if (isDevelopment && event.type === WILDCARD) {
    throw new Error(`An event cannot have the wildcard type ('${WILDCARD}')`)
  }

  let nextSnapshot = snapshot
  const microsteps: Microstep[] = []

  function addMicrostep(
    step: Microstep,
    event: AnyEventObject,
    transitions: AnyTransitionDefinition[]
  ) {
    actorScope.system._sendInspectionEvent({
      type: '@xstate.microstep',
      actorRef: actorScope.self,
      event,
      snapshot: step[0],
      _transitions: transitions
    })
    microsteps.push(step)
  }

  // Handle stop event
  if (event.type === XSTATE_STOP) {
    nextSnapshot = cloneMachineSnapshot(
      stopChildren(nextSnapshot, event, actorScope),
      { status: 'stopped' }
    )
    addMicrostep([nextSnapshot, []], event, [])
    return { snapshot: nextSnapshot, microsteps }
  }
  // ...（接下面循环）
}
```

继续看主循环（[`stateUtils.ts:1735-1770`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/stateUtils.ts#L1735-L1770)）：

```typescript
let shouldSelectEventlessTransitions = true
const maxIterations = snapshot.machine.options?.maxIterations ?? Infinity
let iterationCount = 0

while (nextSnapshot.status === 'active') {
  iterationCount++
  if (iterationCount > maxIterations) {
    throw new Error(
      `Infinite loop detected: the machine has processed more than ${maxIterations} microsteps without reaching a stable state. ...`
    )
  }

  let enabledTransitions: AnyTransitionDefinition[] =
    shouldSelectEventlessTransitions
      ? selectEventlessTransitions(nextSnapshot, nextEvent)
      : []

  const previousState = enabledTransitions.length ? nextSnapshot : undefined

  if (!enabledTransitions.length) {
    if (!internalQueue.length) {
      break    // ← 队列空 + 无 eventless transition → 稳定，跳出循环
    }
    nextEvent = internalQueue.shift()!
    enabledTransitions = selectTransitions(nextEvent, nextSnapshot)
  }

  const step = microstep(
    enabledTransitions,
    nextSnapshot,
    actorScope,
    nextEvent,
    false,
    internalQueue
  )
  nextSnapshot = step[0]
  shouldSelectEventlessTransitions = nextSnapshot !== previousState
}
```

**为什么要分两层（microstep vs macrostep）**：

考虑这种场景：

```typescript
states: {
  idle: { on: { FETCH: 'loading' } },
  loading: {
    entry: raise({ type: 'AUTO_RETRY' }),  // ← 进入 loading 立即触发新事件
    on: { AUTO_RETRY: 'success' }
  }
}
```

`actor.send({ type: 'FETCH' })` 后，应该一步到 `success` 还是停在 `loading`？

SCXML 的回答：**一直跑微步直到稳定**。所以：

- microstep 1: idle → loading（执行 entry，raise AUTO_RETRY 入队）
- microstep 2: loading → success（处理刚 raise 的事件）
- 队列空 → macrostep 完成

`subscribe` 的回调**只在 macrostep 之间触发**——你不会看到中间的 `loading` 状态。

**旁注 5 条**：

1. `maxIterations` 是死循环保护——如果 `entry` 一直 raise 同一个事件触发 entry 自己，会无限循环；默认 `Infinity`，但用户可在 machine options 里覆盖
2. `shouldSelectEventlessTransitions` 控制是否选择 always 转移（无事件触发的转移）——避免在同一帧重复选同一组转移
3. `internalQueue.shift()!` 用 `!` 是因为 length 已经判过——TS 推不出来，得用断言
4. 每次 `addMicrostep` 都会触发 `_sendInspectionEvent`——**inspection 看的是 microstep 粒度**，比 subscribe 看的 macrostep 粒度细
5. `XSTATE_STOP` 走特殊路径：克隆快照 + 标 status 'stopped' + stopChildren——**不走主循环**，因为停止是终态

→ 这是**真严格的状态机**。Redux + Saga 你必须自己实现这套调度，否则
"事件 A 触发事件 B 触发事件 C"会变成异步噩梦。

**怀疑 3**：`maxIterations` 默认 `Infinity` 的设计。
理论上死循环保护应该有个**默认安全值**（比如 1000），让用户主动放宽。
现在的默认是"信任开发者"——如果你写了 entry: raise 自己的循环 bug，浏览器会卡死再抛 error。
我读源码时没找到为什么默认 Infinity 的注释，疑惑这是早期决定还是有意取舍。
对比 React 18 的 update queue 限定 50 次防 setState 死循环——XState 这里更"放任"，
是不是因为状态机用户群假设更熟悉 FSM 理论、不容易写出 raise 自循环？
不确定，存疑。

### 机制 4 · setup() — v5 的类型推导引擎

v4 时代，machine config 的类型推导很弱。v5 引入了 setup 模式：

[`setup.ts:334-444`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/setup.ts#L334-L444)（节选）：

```typescript
export function setup<
  TContext extends MachineContext,
  TEvent extends AnyEventObject,
  TActors extends Record<string, UnknownActorLogic> = {},
  TChildrenMap extends Record<string, string> = {},
  TActions extends Record<string, ParameterizedObject['params'] | undefined> = {},
  TGuards extends Record<string, ParameterizedObject['params'] | undefined> = {},
  TDelay extends string = never,
  TTag extends string = string,
  TInput = NonReducibleUnknown,
  TOutput extends NonReducibleUnknown = NonReducibleUnknown,
  TEmitted extends EventObject = EventObject,
  TMeta extends MetaObject = MetaObject
>({
  schemas,
  actors,
  actions,
  guards,
  delays
}: {
  schemas?: unknown
  types?: SetupTypes<TContext, TEvent, TChildrenMap, TTag, TInput, TOutput, TEmitted, TMeta>
  actors?: { [K in keyof TActors | Values<TChildrenMap>]: ... }
  actions?: { [K in keyof TActions]: ActionFunction<...> }
  guards?: { [K in keyof TGuards]: GuardPredicate<...> }
  delays?: { [K in TDelay]: DelayConfig<...> }
}) {
  return {
    assign,
    sendTo,
    raise,
    log,
    cancel,
    stopChild,
    enqueueActions,
    emit,
    spawnChild,
    createStateConfig: (config) => config,
    createAction: (fn) => fn,
    createMachine: (config) =>
      (createMachine as any)(
        { ...config, schemas },
        { actors, actions, guards, delays }
      ),
    extend: (extended) =>
      setup({
        schemas,
        actors,
        actions: { ...actions, ...extended.actions },
        // ...
      })
  }
}
```

**柯里化的目的**：先收集所有 implementations（actors / actions / guards）拿到具体类型，
再生成一个**带这些类型记忆**的 createMachine 函数。

用户写法：

```typescript
const machine = setup({
  types: {} as { context: { count: number }, events: { type: 'INC' } | { type: 'DEC' } },
  actions: {
    increment: assign({ count: ({ context }) => context.count + 1 })
  },
  guards: {
    isPositive: ({ context }) => context.count > 0
  }
}).createMachine({
  context: { count: 0 },
  initial: 'active',
  states: {
    active: {
      on: {
        INC: { actions: 'increment' },     // ← 字符串引用，必须在 actions 里有
        DEC: {
          guard: 'isPositive',             // ← 同样，guard 名称类型检查
          actions: 'increment'
        }
      }
    }
  }
})
```

**字符串 `'increment'` 是类型安全的**——TS 会校验它必须是 setup 时声明的 actions 之一。
你写错名字编译期就报错，**不会到运行时才发现"action 'incrment' not found"**。

→ 这是把"类型当设计工具"做到极致：**字符串引用 + 编译期校验**。
代价是 setup.ts 里有几十行嵌套泛型——这是"用复杂的类型让用户的类型简单"的取舍。

### 机制 5 · 子 actor 与 invoke / spawn

XState 的 actor 不只是顶层一个，可以**嵌套**：

```typescript
const machine = setup({
  actors: {
    fetcher: fromPromise(async ({ input }) => fetch(input.url).then(r => r.json()))
  }
}).createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: {
      invoke: {
        src: 'fetcher',
        input: ({ event }) => ({ url: event.url }),
        onDone: { target: 'success', actions: assign({ data: ({ event }) => event.output }) },
        onError: 'error'
      }
    },
    success: {},
    error: {}
  }
})
```

进入 `loading` 时自动 spawn fetcher actor，`onDone` / `onError` 是子 actor 完成时的转移。

子 actor 完成时（`status: 'done'`）会发 `DoneActorEvent` 给父 actor。源码在
[`createActor.ts:300-353`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L300-L353)：

```typescript
switch ((this._snapshot as any).status) {
  case 'active':
    for (const observer of this.observers) {
      try {
        observer.next?.(snapshot)
      } catch (err) {
        reportUnhandledError(err)
      }
    }
    break
  case 'done':
    // 通知所有 observer 最后一个 snapshot
    for (const observer of this.observers) {
      try { observer.next?.(snapshot) } catch (err) { reportUnhandledError(err) }
    }
    this._stopProcedure()
    this._complete()
    this._doneEvent = createDoneActorEvent(
      this.id,
      (this._snapshot as any).output
    )
    if (this._parent) {
      this.system._relay(this, this._parent, this._doneEvent)   // ← 通知父 actor
    }
    break
  case 'error':
    this._error((this._snapshot as any).error)
    break
}
```

**对比 Redux Thunk**：

```typescript
const fetchData = (url) => async (dispatch) => {
  dispatch({ type: 'FETCH_START' })
  try {
    const data = await fetch(url).then(r => r.json())
    dispatch({ type: 'FETCH_SUCCESS', data })
  } catch (err) {
    dispatch({ type: 'FETCH_ERROR', err })
  }
}
```

Thunk 把异步逻辑塞在闭包里——**不可视化**。XState 的 invoke 是**配置数据**，
直接画成图：`loading -[onDone]-> success` 和 `loading -[onError]-> error`。

→ 这是 XState 的最大价值：**把异步流程从代码升级为图**。

### 机制 6 · subscribe — Observable 模式

[`createActor.ts:415-470`](https://github.com/statelyai/xstate/blob/ddca0ff8c53dc2e85f9173514cc686308d65bd2c/packages/core/src/createActor.ts#L415-L470)（subscribe 简化版）：

```typescript
public subscribe(observer: Observer<SnapshotFrom<TLogic>>): Subscription
public subscribe(
  nextListener?: (snapshot: SnapshotFrom<TLogic>) => void,
  errorListener?: (error: any) => void,
  completeListener?: () => void
): Subscription {
  const observerObj = toObserver(
    typeof nextListener === 'function' ? nextListener : nextListener,
    errorListener,
    completeListener
  )

  if (this._processingStatus !== ProcessingStatus.Stopped) {
    this.observers.add(observerObj)
  } else {
    // actor 已停止时，立即触发 complete 或 error
    switch ((this._snapshot as any).status) {
      case 'done':
        observerObj.complete?.()
        break
      case 'error':
        observerObj.error(this._snapshot.error)
        break
    }
  }

  return {
    unsubscribe: () => { this.observers.delete(observerObj) }
  }
}
```

每次 macrostep 完成，actor 调用所有 observers：

- `next(snapshot)` —— 状态改变
- `complete()` —— actor 进入 final state
- `error(err)` —— actor 内部抛错

**这是 RxJS 的 Observable 协议**。你可以直接 `from(actor)` 转成 RxJS Observable，
甚至直接喂给 `useSyncExternalStore`（[zustand 笔记](/study/projects/zustand/)、[SWR 笔记](/study/projects/swr/) 用的是同一接口）。

→ XState 的 actor 是**符合 W3C Observable 协议的状态源**。
任何能消费 Observable 的工具都能消费它。

## Layer 4 · 改一处实验（hierarchical state machine 跑 toy）

> v1.1 工具库分支要求：30 分钟内跑通 + 1 个改一处实验。这里写一个**层级状态机**，刚好涵盖 Layer 3 的机制 1-3 + 5。

### Step 1：基础环境

```bash
mkdir xstate-demo && cd xstate-demo
npm init -y
npm install xstate
npm install -D typescript tsx @types/node
npx tsc --init
```

### Step 2：写 `index.ts`（基础 counter）

```typescript
import { setup, createActor, assign } from 'xstate'

const counterMachine = setup({
  types: {} as {
    context: { count: number }
    events: { type: 'INC' } | { type: 'DEC' } | { type: 'RESET' }
  }
}).createMachine({
  id: 'counter',
  context: { count: 0 },
  on: {
    INC: { actions: assign({ count: ({ context }) => context.count + 1 }) },
    DEC: { actions: assign({ count: ({ context }) => context.count - 1 }) },
    RESET: { actions: assign({ count: 0 }) }
  }
})

const actor = createActor(counterMachine)
actor.subscribe(snapshot => {
  console.log('count =', snapshot.context.count)
})
actor.start()

actor.send({ type: 'INC' })
actor.send({ type: 'INC' })
actor.send({ type: 'INC' })
actor.send({ type: 'DEC' })
actor.send({ type: 'RESET' })
```

```bash
npx tsx index.ts
# count = 0
# count = 1
# count = 2
# count = 3
# count = 2
# count = 0
```

### Step 3：改一处——升级到层级状态机（hierarchical）

把上面改成"counter 必须先 START 才能加减，STOP 后回到 idle"：

```typescript
import { setup, createActor, assign } from 'xstate'

const counterMachine = setup({
  types: {} as {
    context: { count: number }
    events:
      | { type: 'START' }
      | { type: 'STOP' }
      | { type: 'INC' }
      | { type: 'DEC' }
      | { type: 'RESET' }
  },
  guards: {
    isPositive: ({ context }) => context.count > 0
  },
  actions: {
    inc: assign({ count: ({ context }) => context.count + 1 }),
    dec: assign({ count: ({ context }) => context.count - 1 }),
    zero: assign({ count: 0 })
  }
}).createMachine({
  id: 'counter',
  context: { count: 0 },
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'counting' }
    },
    counting: {
      initial: 'normal',
      // 父状态退出时归零（验证 microstep exit action）
      exit: 'zero',
      on: {
        INC: { actions: 'inc' },
        DEC: { actions: 'dec' },
        STOP: 'idle'
      },
      states: {
        normal: {
          // RESET 必须 count > 0 才有效（验证 guard）
          on: {
            RESET: { guard: 'isPositive', target: 'normal', actions: 'zero' }
          }
        }
      }
    }
  }
})

const actor = createActor(counterMachine)
actor.subscribe(snapshot => {
  console.log(`state=${JSON.stringify(snapshot.value)}, count=${snapshot.context.count}`)
})
actor.start()

actor.send({ type: 'INC' })       // ← 在 idle，没有 INC 转移，被 silently dropped
actor.send({ type: 'START' })     // → counting.normal
actor.send({ type: 'INC' })
actor.send({ type: 'INC' })
actor.send({ type: 'INC' })
actor.send({ type: 'DEC' })
actor.send({ type: 'RESET' })     // ← guard isPositive 通过（count=2 > 0），count = 0
actor.send({ type: 'RESET' })     // ← guard 失败（count=0），无变化
actor.send({ type: 'STOP' })      // → idle，触发父 exit action 归零
actor.send({ type: 'INC' })       // ← 又在 idle，dropped
```

跑：

```bash
npx tsx index.ts
# state="idle", count=0
# (INC 在 idle 被 silently 丢弃，没新输出)
# state={"counting":"normal"}, count=0
# state={"counting":"normal"}, count=1
# state={"counting":"normal"}, count=2
# state={"counting":"normal"}, count=3
# state={"counting":"normal"}, count=2
# state={"counting":"normal"}, count=0
# (第二次 RESET guard 失败，没新输出)
# state="idle", count=0
# (最后 INC 在 idle 又被 dropped)
```

**这次改一处验证了 4 个机制**：

1. **机制 1（机器是数据）**：`counterMachine` 是个 StateMachine 值，可以序列化、可以多个 actor 共享
2. **机制 2（事件路由 + 静默丢弃）**：在 idle 发 INC 没反应——证实"图里没画的转移就不存在"
3. **机制 3（microstep / macrostep）**：每次 send 后 subscribe 只触发一次回调，即使内部走了 multiple microstep
4. **机制 5（spawn / 层级）**：`counting.normal` 是嵌套子状态——XState 内部把 hierarchical state 当作 statechart 节点处理

→ **XState 的"无效转移**静默丢弃**"是个常见踩坑点**。
要看为什么没转移，用 inspect API 或 Stately Studio。

## Layer 5 · 横向对比

### vs useReducer — 升级版？不，是不同物种

```typescript
function reducer(state, action) {
  switch (action.type) {
    case 'FETCH':
      return { ...state, status: 'loading' }
    case 'SUCCESS':
      return { ...state, status: 'success', data: action.data }
    // ...
  }
}
```

useReducer 的问题：**没有"当前状态约束 action"的概念**。
你在 `success` 状态再发 `SUCCESS` 也能跑（reducer 根据 action.type 走 case，不看当前 state.status）。

XState：在 `success` 状态发 `SUCCESS` **不会触发任何转移**——
图里没画就是没有。

### vs Redux + Saga — 都是状态机，但风格不同

```typescript
function* fetchSaga() {
  yield take('FETCH')
  try {
    const data = yield call(api.fetch)
    yield put({ type: 'SUCCESS', data })
  } catch (err) {
    yield put({ type: 'ERROR', err })
  }
}
```

Saga 是 generator 写的状态机，能力相当强。但：

- 不可视化（generator yield 顺序需要在脑里编译）
- 类型推导差（generator 内部 `yield` 的返回类型很难推）
- 不能静态分析（不可达状态、未处理转移）

XState 用纯数据描述，所有这些都能做。

### vs Effect-TS Actor — 同范式，不同哲学

Effect-TS 的 actor 系统更"理论上正确"——纯函数式、不可变、Effect 类型贯穿全程。但：

- 学习曲线陡（Effect / Layer / Fiber 全套概念）
- 生态小（社区比 XState 小一个数量级）
- 集成麻烦（不像 useMachine 一行接入 React）

XState 是"普通 React 程序员能上手"的取舍。
Effect-TS 是"FP 工程师才会爱"的取舍。

### vs Stately Studio — 这才是 XState 的真实力

XState 的核心价值不是库本身，是**机器定义可以直接 export 到 Stately Studio**：

- 画图代替写代码（设计师 / PM 能改）
- 静态分析（不可达状态、死锁警告）
- 模型生成测试（基于状态图自动生成 e2e 测试用例）
- 双向同步（图改了代码改，代码改了图改）

→ 这是"**设计工具优先**"的极致：**类型工具（zod）让你写完代码后类型对**，
**XState 让你写代码前先画图**。

## Layer 6 · 与你工作的连接

**能立刻迁移**：

- 任何"loading + error + retry"流程——立即用 XState 重写，代码量少 30%
- WebSocket 连接管理（connecting / open / closing / closed / reconnecting）
- 表单多步骤向导
- 文件上传（idle / uploading / processing / done / failed）

**下个月可能用到**：

- LLM 多轮对话状态：`waiting_user` → `thinking` → `streaming` → `done` / `interrupted`
  这种流程用 XState 比 zustand 干净 5 倍
- Agent 编排：每个 agent 是一个 actor，spawn 子 agent 处理子任务，
  这是 XState 设计的甜点场景
- 测试：用 `@xstate/test` 基于状态图自动生成 e2e 用例

**不要用 XState 的部分**：

- 简单的 toggle / counter / 表单字段——useState 够了
- 全局缓存 / 用户偏好——zustand 或 jotai
- 服务端数据缓存——TanStack Query / SWR
- "我只需要一个 setState" 的场景——XState 是过度工程

**XState 的真实成本**：

- Bundle ~15KB gzip（vs zustand 600 字节）
- 学习曲线 2-3 天（FSM 概念 + actor 模型 + setup 类型）
- 错误信息长（嵌套泛型推断失败时的 TS 报错经常 100+ 行）

判断标准：**你的状态超过 3 个、转移超过 5 个、有异步**——上 XState；
否则不上。

## Layer 7 · 自检 · 5 个问题

1. `createActor.ts:749-756` 的 `send` 经过 `system._relay`，而不是直接调用 `_send`。
   把 `system._relay` 移除会丢失什么能力？（提示：跨 actor、inspection）
2. `stateUtils.ts:1649-1770` 区分 microstep 和 macrostep。如果不区分（每个 microstep 都通知 observer），
   会发生什么观察体验问题？
3. `setup.ts:334-444` 的 setup 函数返回一个对象，里面是带类型记忆的 createMachine。
   如果把 setup 去掉、所有用法直接用 createMachine，**什么类型安全保证会丢失**？
4. XState 的 actor 在 stop 后接收事件会被丢弃（dev 模式 warn）。
   这种"静默丢弃"在生产环境是好设计还是坏设计？讨论场景。
5. 比较 XState 和 Saga 处理"竞态请求"（用户连续点击 fetch 按钮）的优劣。
   哪种更容易写对？为什么？

## 限制 / 坑（宣传 vs 现实）

读源码 + 跑 demo 后发现的**真实摩擦**：

- **TS 报错堆栈巨长**：嵌套泛型推断失败时报错 100+ 行很常见。SetupTypes、ParameterizedObject、ToProvidedActor 互相缠绕——尤其是 invoke 里 src 字符串引用类型推不出时
- **inspection 必须主动开**：`createActor(machine, { inspect })` 默认不开，dev 调试时容易忘记
- **静默丢弃事件**：见怀疑 2，prod 模式连 warn 都没有
- **`_snapshot!` non-null 假设**：在 SSR / 异步 boundary 处偶发 undefined（怀疑 1）
- **maxIterations 默认 Infinity**：entry: raise 自循环可以卡死浏览器（怀疑 3）
- **Bundle 不小**：~15KB gzip，对 landing page 是负担——但状态机本来就不该上 landing page，对症下药
- **学习曲线**：FSM + actor + setup 类型，新手 2-3 天才能写顺
- **adapter 多但同步度不一**：xstate-react 一直跟主线，xstate-vue / svelte 偶尔慢一拍
- **错误信息可能误导**：guard 失败"静默丢弃"时不告诉你 guard 名字——除非开 inspect

**宣传 vs 现实**：
"unmatched developer tools" 是真的——Stately Studio 比 redux-devtools 强一个量级；
但"easy to learn" 半真——简单状态机 30 分钟学会，复杂的（parallel state / history state / actor 通信）2-3 天起步。

## 延伸阅读

读完 `createActor.ts` 后下一步：

1. `stateUtils.ts:985-1850`——读完 microstep 和 macrostep 的完整算法（本笔记只精读了 macrostep 入口和主循环，microstep 的 transition selection 算法值得单独读一次）
2. `actors/fromPromise.ts` / `actors/fromCallback.ts` / `actors/fromObservable.ts`——
   看 XState 怎么把 Promise / callback / Observable 包装成 actor
3. **W3C SCXML 规范**（[spec](https://www.w3.org/TR/scxml/)）——XState 严格遵守这个标准，
   读完一段你会发现 XState 的"奇怪行为"都是 SCXML 规定的
4. **Stately Studio**（[stately.ai](https://stately.ai/)）——画图工具，
   导出/导入 XState v5 机器定义
5. **xstate/store** 包（同 monorepo）——XState 团队对"我只想要 zustand"用户的回答

## 读完你能做之前做不了的事

- **判断**：看到一段 `if (status === 'loading' && !data && !error)` 的代码，
  能立刻识别"这应该是状态机"
- **设计**：和 PM 讨论需求时画状态图（"这个流程的状态有 4 个，转移 7 条"），
  这是工程师 vs 程序员的核心差异
- **解释**：被问"actor 模型是什么"时能用 XState 当例子，不需要扯 Erlang
- **下钻**：看懂 Akka / Erlang OTP / Elixir GenServer 的设计——它们和 XState 同源
- **对照**：识别"我这是不是在重新发明状态机"——很多重型 Redux 代码就是

---

**笔记完成**：2026-05-28（v5.31.x，commit `ddca0ff`）
**研究方法**：本地克隆 + 心脏文件精读 + 锚定 GitHub permalink + 改一处 hierarchical 实验
**心脏文件**：`createActor.ts:77-818` + `stateUtils.ts:1649-1850` + `setup.ts:334-454`
**模板**：[状元篇 v1.1 分支 B 工具库](/study/method/)
