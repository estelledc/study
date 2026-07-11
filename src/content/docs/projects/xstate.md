---
title: XState — 把状态画成图，让矛盾写不出来
来源: 'https://github.com/statelyai/xstate'
日期: 2026-05-30
分类: 前端
难度: 中级
---

## 是什么

XState 是 JavaScript/TypeScript 的**状态机库**，让你把"应用现在处于什么状态、能怎么变"画成一张有向图，再用代码运行它。日常类比：像地铁线路图——每一站是状态，每一段铁路是允许的转移；图上没画的路线，列车根本开不过去。

你写：

```ts
import { createMachine, createActor } from 'xstate'

const fetchMachine = createMachine({
  initial: 'idle',
  states: {
    idle:    { on: { FETCH: 'loading' } },
    loading: { on: { OK: 'success', FAIL: 'error' } },
    success: {},
    error:   { on: { RETRY: 'loading' } }
  }
})
const actor = createActor(fetchMachine).start()
actor.send({ type: 'FETCH' })   // → loading
```

`createMachine` 返回的是**纯数据**（图的描述），`createActor` 把图跑起来变成进程。机器和进程分开，意味着同一张图可以同时跑很多份，也可以序列化、可视化、单独 review。

## 为什么重要

不理解 XState 的状态机思想，下面这些事说不清楚：

- 为什么用多个标志位描述 fetch 会写出十几种不可达组合，bug 反复出现
- 为什么 useReducer 不够用——它没有"当前状态决定能响应哪些 action"的概念
- 为什么 Redux Saga 也是状态机，但**写起来不能可视化**
- 为什么 W3C 在 2015 年专门定了 SCXML 标准——状态机是工业级流程的通用语言

## 核心要点

XState 的设计可以拆成 **三层**：

1. **机器（Machine）**：纯数据，描述"有哪些状态、什么事件能让它从 A 跳到 B"。类比：地铁线路图，挂在墙上不会动。机器没有"当前状态"概念，可以序列化发给后端、可以画到 [Stately Studio](https://stately.ai)。

2. **Actor**：把机器跑起来的进程。类比：一辆正在地铁线上跑的列车。它有事件队列、当前快照、订阅者。`actor.send(event)` 不是直接改状态——事件先入队，再串行处理，**保证转移原子性**。

3. **System**：所有 actor 共享的调度中心。父 actor `spawn` 子 actor 时复用同一套调度，每个实例有全局唯一 id。兄弟之间发消息由系统路由——这是 Erlang 风格 Actor 模型在浏览器里的简化版。

三层加起来叫 **Statechart 运行时**（参考 Harel 1987）。

## 实践案例

### 案例 1：多个标志位 → 4 个状态

很多 React 项目这样写 fetch：

```tsx
const [isLoading, setLoading] = useState(false)
const [data, setData] = useState(null)
const [error, setError] = useState(null)
const [retries, setRetries] = useState(0)
```

多个标志位交叉组合 ≈ $2^4 = 16$ 种可能，真正合法的只有 4 个（idle / loading / success / error），**剩下约 12 种是矛盾**。比如 `isLoading=true && error=有值`。

XState 的版本只有 4 个状态，**图里没画的转移根本发不出去**——`actor.send({ type: 'LOGOUT' })` 在 `loading` 被静默忽略。矛盾从源头消除。

### 案例 2：在 React 里用 useMachine

```tsx
import { useMachine } from '@xstate/react'

function FetchView() {
  const [state, send] = useMachine(fetchMachine)
  if (state.matches('loading')) return <Spinner />
  if (state.matches('error'))
    return <button onClick={() => send({ type: 'RETRY' })}>重试</button>
  if (state.matches('success')) return <p>加载完成</p>
  return <button onClick={() => send({ type: 'FETCH' })}>加载</button>
}
```

**逐部分解释**：

- `useMachine(fetchMachine)` 启动一份 actor，返回当前 `state` 和 `send`
- `state.matches('loading')` 问"现在是不是 loading 站"，替代 `isLoading === true`
- 点按钮只 `send` 事件；能不能跳，由图决定，不靠散落的 setState

### 案例 3：层级状态和绝对路径

登录流嵌套：未认证 → 输密码 → 多因子 → 已认证。用层级状态：

```ts
const auth = createMachine({
  id: 'auth',
  initial: 'anonymous',
  states: {
    anonymous: { on: { LOGIN: 'verifying' } },
    verifying: {
      initial: 'password',
      states: {
        password: { on: { OK: 'mfa', FAIL: '#auth.anonymous' } },
        mfa:      { on: { OK: '#auth.authenticated' } }
      }
    },
    authenticated: { on: { LOGOUT: 'anonymous' } }
  }
})
```

**逐部分解释**：

- 必须设 `id: 'auth'`，`#auth.xxx` 这种绝对路径才找得到目标
- `verifying` 里再嵌 `password` / `mfa`，像大站里的换乘厅
- `FAIL: '#auth.anonymous'` 从任意子状态一跳回登录页——useReducer 里要写一坨嵌套 if

## 踩过的坑

1. **v5 用 setup() 柯里化推类型，v4 旧写法不能直接迁移**——v5 要求先 `setup({ types, actors, guards })` 再 `.createMachine(...)`，否则类型推不出来。
2. **SSR / 测试中没 start 就读 snapshot**：`createActor(...)` 后没 `.start()`，`actor.getSnapshot()` 在 dev 抛错，prod **返回 undefined**，下游 `state.context` 直接崩。
3. **context 是不可变快照**：`assign` 看起来在改 context，其实每次返回新对象。你在闭包里 `const c = state.context` 后再 send 几次事件，`c` 仍是旧的。要用最新值必须重新 `getSnapshot()`。
4. **spawn 出来的 child actor ref 不是函数**：`spawn(childMachine)` 返回 `ActorRef`，调用要用 `ref.send({ type: 'X' })`，不是 `ref({ type: 'X' })`——后者运行时静默无响应，新人最常踩。

## 适用 vs 不适用场景

**适用**：
- 状态多且转移复杂的流程（认证、向导、支付、视频播放器）
- 需要给非工程师看流程图（PM / QA 看 Stately Studio 的图）
- 需要严格保证"不该发生的状态不会发生"的关键流程
- 跨框架共享业务逻辑（一份机器 + 各 framework adapter）

**不适用**：
- 简单 CRUD 表单——杀鸡用牛刀，用 [[zustand]] 或 useState 即可
- 状态只有 2-3 个、转移线性——状态机的元数据成本超过收益
- 团队没人愿意学 statechart 概念——XState 学习曲线在中后段陡，没人维护反而成负担
- 需要 FP 严格副作用追踪——选 [[effect]]，它的 actor 模型更纯

## 历史小故事（可跳过）

- **1987 年**：David Harel 在《Statecharts: A Visual Formalism for Complex Systems》里提出 Statechart——给状态机加层级、并行、历史。这是工业控制系统（飞机、电梯）的标准。
- **2015 年**：W3C 正式发布 SCXML 1.0，给 Statechart 定可执行 XML 标准。
- **2017 年**：David Khourshid 在 React Rally 演讲 "Infinitely Better UIs with Finite Automata"，把状态机思想带回前端社区。
- **2018 年**：XState v4 发布，主打 createMachine + interpret API。
- **2023 年**：v5 完全重写，引入 setup() 推类型 + 全 actor 模型，Stately Inc. 推出可视化编辑器 Stately Studio。

## 学到什么

1. **状态机是设计工具，不仅是实现技术**——画图就是 code review，矛盾在画图阶段暴露
2. **机器（数据）和 Actor（进程）分离**让同一逻辑能多实例、能序列化、能跨语言
3. **mailbox 串行处理**保证转移原子性，避免并发改 state 的 race condition
4. **statechart 的层级和并行**让"嵌套 if 地狱"变成几行声明

## 延伸阅读

- 视频：[David Khourshid — Infinitely Better UIs with Finite Automata](https://www.youtube.com/watch?v=VU1NKX6Qkxc)（2017 React Rally，状态机入门首选）
- 文档：[stately.ai/docs](https://stately.ai/docs)（v5 官方文档，含交互式 demo）
- 论文：[Harel 1987 Statecharts PDF](https://www.inf.ed.ac.uk/teaching/courses/seoc/2005_2006/resources/statecharts.pdf)（理论根，21 页）
- 标准：[W3C SCXML 1.0](https://www.w3.org/TR/scxml/)（XState 算法对齐的工业标准）
- [[effect-handlers]] —— 状态机的 FP 表亲，用代数效应追踪副作用

## 关联

- [[react]] —— xstate-react 提供 useMachine hook，订阅 actor 状态
- [[zustand]] —— 简单全局 state 的轻量替代，没有状态机约束
- [[jotai]] —— 原子化 state 管理，和状态机互补不冲突
- [[effect]] —— FP 重型替代，actor 模型更纯但学习曲线更陡
- [[erlang-otp]] —— Actor 模型的工业起源，XState 的跨 actor 路由是它的浏览器简化版
- [[svelte]] —— xstate-svelte adapter 让 Svelte 也能用同一份机器
- [[tanstack-query]] —— 异步 fetch 的状态机替代，专注服务端状态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[jotai]] —— Jotai — 原子化 React 状态管理
- [[react]] —— React UI 组件库
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[zustand]] —— Zustand — 极简 React 状态管理

