---
title: "XState — 把状态画成图"
description: 有限状态机 + Actor 模型，把"看似简单的状态"变成可视化的设计文档
sidebar:
  order: 16
  label: "statelyai/xstate"
---

> statelyai/xstate v5.31.1（2026-05），MIT。
>
> XState 不是状态管理库——状态机才是。
> 它的核心主张：**很多 bug 是因为没把状态画清楚**。
> 一旦你把"加载中 / 成功 / 失败 / 重试"画成有向图，
> 你会发现以前的 useState + boolean flag 写法有 4 个不可达状态和 2 个未处理转移。
>
> 这是 Season 2「类型当设计工具」第二篇。

## 一句话定位

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

只有 4 个状态。**所有不在转移图里的状态根本不存在**——TS 类型层面就限制不了。

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
XState 用纯数据描述状态机，可以直接 export 到 [Stately Studio](https://stately.ai)
画出有向图。**画图就是 code review**。

**为什么不是 Effect-TS 的 actor**：Effect-TS 也有 actor 模型（甚至更优雅），
但它是 FP 范式重型库，学习曲线陡。XState 是"普通 React 程序员就能上手"的取舍。

## 仓库地形

```
xstate/
├── packages/
│   ├── core/                       ← ★ 主包
│   │   └── src/
│   │       ├── createMachine.ts    ← 165 行：把 config 包成 StateMachine
│   │       ├── createActor.ts      ← 889 行：★★★ 运行时 actor 实现
│   │       ├── stateUtils.ts       ← 1850 行：★★★ microstep / macrostep（SCXML 算法核心）
│   │       ├── setup.ts            ← 454 行：v5 类型推导引擎
│   │       ├── StateMachine.ts     ← 686 行：StateMachine 类（纯定义，不运行）
│   │       ├── StateNode.ts        ← 476 行：单个状态节点
│   │       ├── State.ts            ← 511 行：snapshot
│   │       ├── guards.ts           ← 守卫条件
│   │       ├── actors/             ← fromPromise / fromCallback / fromObservable
│   │       ├── actions/            ← assign / raise / sendTo / spawn
│   │       └── types.ts            ← 2788 行（TS 泛型山）
│   ├── xstate-react/               ← React adapter（useMachine / useActor）
│   ├── xstate-vue/                 ← Vue adapter
│   ├── xstate-svelte/              ← Svelte adapter
│   ├── xstate-solid/               ← Solid adapter
│   └── xstate-store/               ← 不要状态机时的轻量替代
└── examples/
```

**心脏文件**：
- `createActor.ts:77-870`——Actor 类是运行时核心
- `stateUtils.ts:985-1850`——microstep / macrostep 是 SCXML 算法实现

types.ts 有 2788 行，但**那是手册不是心脏**——读它会陷入泛型迷宫。

## 核心机制 · Layer 3 精读

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

要让它"活"起来，需要 createActor：

`createActor.ts:862-870`：

```typescript
export function createActor<TLogic extends AnyActorLogic>(
  logic: TLogic,
  options?: ActorOptions<TLogic>
): Actor<TLogic> {
  return new Actor(logic, options)
}
```

返回 `Actor` 实例（`createActor.ts:77`）：

```typescript
export class Actor<TLogic extends AnyActorLogic> implements ActorRef<...> {
  // ...
}
```

Actor 才是有 mailbox、能 `.send()`、能 `.subscribe()`、能被 `.start()` / `.stop()` 的运行时对象。

→ **机器和 actor 分离的设计意义**：
- 同一个机器可以创建多个 actor 实例（multi-tenant）
- 机器可以静态分析（"是否有不可达状态"等）
- 机器可以可视化（Stately Studio 加载机器定义）

vs Redux：reducer + store 是绑死的；reducer 不能被视为独立的"行为定义"。

### 机制 2 · 事件路由经过 system._relay

你以为 `actor.send(event)` 会直接处理事件？不是。

`createActor.ts:750-757`：

```typescript
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

`createActor.ts:729-744`（`_send` 内部入队）：

```typescript
public _send(event: EventFromLogic<TLogic>) {
  if (this._processingStatus === ProcessingStatus.Stopped) {
    if (isDevelopment) {
      console.warn(`Event "${event.type}" was sent to stopped actor ...`)
    }
    return
  }
  this.mailbox.enqueue(event)
}
```

**为什么要经过 system**：

1. **跨 actor 通信**：父 actor `system._relay(self, child, event)` 给子 actor 发事件
2. **inspection**：DevTools 可以挂在 system 上观察所有事件流
3. **调度**：mailbox 按顺序处理，保证转移的原子性

→ 这是经典的 **Actor 模型**（Erlang / Akka 那套）：actor 之间不共享内存，
只通过消息传递。XState 在 JS 单线程里模拟出了这个范式。

### 机制 3 · microstep / macrostep — SCXML 算法

XState 的状态转移**严格按 W3C SCXML 标准实现**。SCXML 区分两个概念：

- **microstep**：一次转移的原子操作（exit 旧状态 → 执行 actions → enter 新状态）
- **macrostep**：从一个稳定状态到下一个稳定状态（可能经过多个 microstep，因为
  转移过程中可能 raise 内部事件触发新的 microstep）

`stateUtils.ts:1004-1010`（microstep 注释）：

```typescript
/** https://www.w3.org/TR/scxml/#microstepProcedure */
function microstep(
  // ...
)
```

`stateUtils.ts:1649-1700`（macrostep 入口）：

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
  // ...
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
  // ...
}
```

**为什么要分两层**：

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
- microstep 1: idle → loading（执行 entry，raise AUTO_RETRY）
- microstep 2: loading → success（处理刚 raise 的事件）
- 队列空 → macrostep 完成

`subscribe` 的回调只在 macrostep 之间触发——你不会看到中间的 `loading` 状态。

→ 这是**真严格的状态机**。Redux + Saga 你必须自己实现这套调度，否则
"事件 A 触发事件 B 触发事件 C"会变成异步噩梦。

### 机制 4 · setup() — v5 的类型推导引擎

v4 时代，machine config 的类型推导很弱。v5 引入了 setup 模式：

`setup.ts:334-370`（节选）：

```typescript
export function setup<
  TContext extends MachineContext,
  TEvent extends AnyEventObject,
  TActors extends Record<string, UnknownActorLogic> = {},
  TChildrenMap extends Record<string, string> = {},
  TActions extends Record<string, ParameterizedObject['params'] | undefined> = {},
  TGuards extends Record<string, ParameterizedObject['params'] | undefined> = {},
  // ...
>({
  schemas,
  actors,
  actions,
  guards,
  delays
}) {
  return {
    createMachine: (config) => createMachine(config, { actors, actions, guards }),
    // ...
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

### 机制 5 · 子 actor 与 invoke

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

`createActor.ts:416-468`（subscribe 简化版）：

```typescript
public subscribe(observer): Subscription {
  const observerObj = toObserver(observer, errorListener, completeListener)

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
甚至直接喂给 `useSyncExternalStore`（[zustand 笔记](/study/projects/zustand/)、
[SWR 笔记](/study/projects/swr/) 用的是同一接口）。

→ XState 的 actor 是**符合 W3C Observable 协议的状态源**。
任何能消费 Observable 的工具都能消费它。

## 横向对比

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
你在 `success` 状态再发 `SUCCESS` 也能跑。

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
- 不可视化
- 类型推导差（generator 内部 `yield` 的返回类型很难推）
- 不能静态分析（不可达状态、未处理转移）

XState 用纯数据描述，所有这些都能做。

### vs Effect-TS Actor — 同范式，不同哲学

Effect-TS 的 actor 系统更"理论上正确"——纯函数式、不可变、
Effect 类型贯穿全程。但：
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

## Hands-on（30 分钟内能跑）

```bash
mkdir xstate-demo && cd xstate-demo
npm init -y
npm install xstate
```

写 `index.ts`：

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

### 改一处的实验（必做）

把上面的 `RESET` 加守卫——只有当 count > 0 时才能 reset：

```typescript
guards: {
  isPositive: ({ context }) => context.count > 0
},
// ...
RESET: {
  guard: 'isPositive',
  actions: assign({ count: 0 })
}
```

跑一遍：先 send INC 几次然后 RESET，再 send 一遍 RESET。
**第二次 RESET 不会触发 actions**——因为 guard 失败。
观察 subscribe 回调：count 不变，没有任何"reset 失败"的提示。

→ XState 的"无效转移**静默丢弃**"是个常见踩坑点。
要看为什么没转移，用 inspect API 或 Stately Studio。

第二个实验：把它升级成多状态机器：

```typescript
states: {
  idle: { on: { START: 'counting' } },
  counting: {
    on: {
      INC: { /* same */ },
      STOP: 'idle',
      RESET: { guard: 'isPositive', actions: assign({ count: 0 }) }
    }
  }
}
```

试一下 `STOP` 之后再 `INC`——**没反应**。因为 idle 状态没定义 INC 转移。
对比 useReducer 你必须每个 case 自己 if，**这就是为什么 XState 写复杂流程代码量更少**。

## 与你工作的连接

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

## 读完你能做之前做不了的事

- **判断**：看到一段 `if (status === 'loading' && !data && !error)` 的代码，
  能立刻识别"这应该是状态机"
- **设计**：和 PM 讨论需求时画状态图（"这个流程的状态有 4 个，转移 7 条"），
  这是工程师 vs 程序员的核心差异
- **解释**：被问"actor 模型是什么"时能用 XState 当例子，不需要扯 Erlang
- **下钻**：看懂 Akka / Erlang OTP / Elixir GenServer 的设计——它们和 XState 同源
- **对照**：识别"我这是不是在重新发明状态机"——很多重型 Redux 代码就是

## 自检 · 5 个问题

1. `createActor.ts:750-757` 的 `send` 经过 `system._relay`，而不是直接调用 `_send`。
   把 `system._relay` 移除会丢失什么能力？（提示：跨 actor、inspection）
2. `stateUtils.ts:1649-1700` 区分 microstep 和 macrostep。如果不区分（每个 microstep 都通知 observer），
   会发生什么观察体验问题？
3. `setup.ts:334-454` 的 setup 函数返回一个对象，里面是带类型记忆的 createMachine。
   如果把 setup 去掉、所有用法直接用 createMachine，**什么类型安全保证会丢失**？
4. XState 的 actor 在 stop 后接收事件会被丢弃（dev 模式 warn）。
   这种"静默丢弃"在生产环境是好设计还是坏设计？讨论场景。
5. 比较 XState 和 Saga 处理"竞态请求"（用户连续点击 fetch 按钮）的优劣。
   哪种更容易写对？为什么？

## 延伸阅读

读完 `createActor.ts` 后下一步：

1. `stateUtils.ts:985-1850`——读完 microstep 和 macrostep 的完整算法
2. `actors/fromPromise.ts` / `actors/fromCallback.ts` / `actors/fromObservable.ts`——
   看 XState 怎么把 Promise / callback / Observable 包装成 actor
3. **W3C SCXML 规范**（[spec](https://www.w3.org/TR/scxml/)）——XState 严格遵守这个标准，
   读完一段你会发现 XState 的"奇怪行为"都是 SCXML 规定的
4. **Stately Studio**（[stately.ai](https://stately.ai/)）——画图工具，
   导出/导入 XState v5 机器定义
5. **xstate/store** 包（同 monorepo）——XState 团队对"我只想要 zustand"用户的回答

---

**笔记完成**：2026-05-27（v5.31.1）
**研究方法**：本地克隆 + 子代理深读 + 自查关键代码引用
**心脏文件**：`createActor.ts:77-870` + `stateUtils.ts:985-1850`
