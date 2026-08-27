---
title: XState — 把状态画成图，让矛盾写不出来
来源: https://github.com/statelyai/xstate
日期: 2026-05-30
分类: 前端
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/statelyai/xstate
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 21872cdc93a3baddbcf43f1d83553991d39f28ab
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.32.6
---

## 是什么

XState 是一个 JavaScript/TypeScript 状态机与 statechart 运行时。日常类比：地铁线路图是纯数据，列车才是正在跑的进程。`createMachine()` 画出站点与允许的换乘；`createActor(machine)` 再把图跑起来。

你写：

```ts
import { createMachine, createActor } from "xstate";

const fetchMachine = createMachine({
  id: "fetch",
  initial: "idle",
  states: {
    idle: { on: { FETCH: "loading" } },
    loading: { on: { OK: "success", FAIL: "error" } },
    success: {},
    error: { on: { RETRY: "loading" } }
  }
});

const actor = createActor(fetchMachine);
actor.start();
actor.send({ type: "FETCH" });
```

固定 5.32.6 里，`createMachine` 返回 `StateMachine`（实现 `ActorLogic`），`createActor` 返回带 mailbox 的 `Actor`。`interpret` 只是 `createActor` 的弃用别名。

## 为什么重要

不理解 XState，下面这些事都没法解释：

- 为什么多个布尔标志会交叉出大量非法组合，而状态图从源头删掉未画出的边
- 为什么 `send` 不是同步改当前状态，而是先入队再串行 `transition`
- 为什么 `setup().createMachine()` 和直接 `createMachine()` 运行时都能建机器，但类型推断路径不同
- 为什么 React 绑定要订阅 snapshot，而不是把 ActorRef 当成 machine 传进 hook

## 核心要点

固定版本的主链可以拆成五步：

1. **描述机器**：`createMachine(config)` 或 `setup({ actors, actions, guards, delays }).createMachine(config)` 构造 `StateMachine`。`setup` 的第二职责是把实现表和类型绑在一起；直接 `createMachine` 的第二参数 implementations 在源码注释里标为 DEPRECATED，应改用 `setup` 或 `machine.provide()`。

2. **创建 Actor**：`createActor(logic)` 隐式建一个以自己为根的 actor system。构造时就调用 `logic.getInitialSnapshot()`，所以未 `start()` 也能 `getSnapshot()`。

3. **启动并打开 mailbox**：`start()` 把状态标为 Running，执行 `logic.start`，通知订阅者，再 `mailbox.start()`。启动前入队的事件会在此刻冲洗。

4. **串行转移**：`send(event)` 经 `system._relay` 进入 `_send`，mailbox 一次只 `_process` 一个事件。`StateMachine.transition` 跑完整 `macrostep`；当前状态没有匹配边时，`microstep` 直接返回原 snapshot。

5. **快照与子 actor**：观察者拿到的是 snapshot（含 `value` / `context` / `status`），`snapshot.matches('loading')` 比较的是 `value`。`assign` 用 `Object.assign({}, oldContext, partial)` 产出新 context，再 `cloneMachineSnapshot`。子 actor 复用父 system，不能对自己调用 `stop()`。

## 实践示例

### 案例 1：未画出的事件不会改状态

```ts
actor.send({ type: "LOGOUT" }); // 当前若在 loading，selectTransitions 为空
console.log(actor.getSnapshot().value); // 仍是 loading
```

空转移不是“丢进黑洞就没进运行时”：事件仍入队并走完 `_process`，只是 `microstep([])` 返回原 snapshot。`snapshot.can(event)` 可以事先问有没有非 forbidden 转移。

### 案例 2：React 里用 useActor，不要把 ActorRef 再塞回去

```tsx
import { useActor } from "@xstate/react";

function FetchView() {
  const [state, send] = useActor(fetchMachine);
  if (state.matches("loading")) return <p>加载中</p>;
  if (state.matches("error")) {
    return <button onClick={() => send({ type: "RETRY" })}>重试</button>;
  }
  return <button onClick={() => send({ type: "FETCH" })}>加载</button>;
}
```

固定 `@xstate/react@6.1.0` 里 `useMachine` 只是 `useActor` 的弃用别名，返回 `[snapshot, send, actor]`。`useActor` 用 `useSyncExternalStore` 订阅，并在 `useEffect` 里 `start()`。若把已经在跑的 ActorRef 传进去，开发模式会抛错，应改用 `useSelector(actorRef, ...)`。

### 案例 3：层级状态用绝对 id

```ts
const auth = createMachine({
  id: "auth",
  initial: "anonymous",
  states: {
    anonymous: { on: { LOGIN: "verifying" } },
    verifying: {
      initial: "password",
      states: {
        password: { on: { OK: "mfa", FAIL: "#auth.anonymous" } },
        mfa: { on: { OK: "#auth.authenticated" } }
      }
    },
    authenticated: { on: { LOGOUT: "anonymous" } }
  }
});
```

`#` 是状态 id 前缀。`FAIL: '#auth.anonymous'` 从任意子状态跳回登录，不必手写一层层 if。

## 踩过的坑

1. **把字符串当事件**：开发构建里 `send("FETCH")` 会抛错，必须 `send({ type: "FETCH" })`。

2. **以为没 start 就读不到 snapshot**：构造函数已经 `getInitialSnapshot`。真正的边界是 mailbox 尚未 `start()`，启动前的 `send` 会排队，不会立刻转移。

3. **把 `useMachine` 当成与 `useActor` 不同的两套 API**：固定 React 包里前者只是别名；把 ActorRef 传给 `useActor` 会在开发模式失败。

4. **闭包里捏住旧 context**：`assign` 每次浅合并出新对象。`const c = snapshot.context` 之后再 send，`c` 不会跟着变。

5. **对子 actor 直接 `stop()`**：非根 actor 会抛 `A non-root actor cannot be stopped directly`；应让父机器用 `stopChild` 或走到终态。

## 适用 vs 不适用场景

**适用**：

- 认证、向导、播放器、支付这类状态多、非法组合代价高的流程
- 需要同一份机器跨 React / Vue / Svelte adapter 复用
- 需要把转移图画给非工程师看，或把 snapshot 持久化后再 `restoreSnapshot`

**不适用**：

- 只有两三个线性状态的小表单——状态图元数据比收益大
- 需要隐式依赖收集、直接 `state.count++` 的编辑器模型——见 [[mobx]]
- 不能接受固定 5.32.6 的 actor / mailbox 合同，或准备直接跟 v6 alpha 走

## 固定版本边界

- 本文绑定 `statelyai/xstate@21872cdc...`，`packages/core` 的 package 为 `xstate@5.32.6`。npm 未暴露 `gitHead`，锚点是 GitHub tag `xstate@5.32.6`。
- 同提交里 `@xstate/react` 为 `6.1.0`；`useMachine` 已标 deprecated。
- 仓库另有 `xstate@6.0.0-alpha.*` tag，本文不绑定 alpha。
- 本文未安装依赖、运行上游测试、浏览器渲染或 bundle 测量，状态保持 `UNVERIFIED`。

## 学到什么

1. **机器是逻辑，Actor 才是进程**——同一张图可以多实例、可持久化、可检查。
2. **mailbox 把并发 send 收成串行 macrostep**——转移原子性来自队列，不是来自“状态对象自己上锁”。
3. **未画出的边不是运行时魔法忽略**——事件仍被处理，只是空转移列表让 snapshot 保持原样。
4. **类型入口和运行时入口可以分开**——`setup()` 主要服务实现表与推断；运行时仍是 `StateMachine` + `Actor`。

## 应用型自测

1. 在 `loading` 且机器没有 `LOGOUT` 边时 `send({ type: "LOGOUT" })`，snapshot.value 会变成什么？
2. `createActor(machine)` 之后、`start()` 之前，`getSnapshot()` 会不会因为“还没 start”而得到 `undefined`？
3. 固定 `@xstate/react@6.1.0` 里，把已经 `start()` 的 ActorRef 传给 `useActor`，开发模式会怎样？

检查点：

1. 仍是 `loading`；空转移返回原 snapshot。
2. 不会。构造时已写入初始 snapshot；未 start 只意味着 mailbox 还没冲洗。
3. 会抛错，提示改用 `useSelector(actorRef, ...)`。

## 延伸阅读

- 文档：[stately.ai/docs](https://stately.ai/docs)
- 固定源码：[statelyai/xstate](https://github.com/statelyai/xstate) —— 本文绑定提交 `21872cdc93a3baddbcf43f1d83553991d39f28ab`
- 标准：[W3C SCXML 1.0](https://www.w3.org/TR/scxml/)
- [[mobx]] —— 隐式依赖收集的互补路线
- [[effect]] —— 更偏代数效应与 typed concurrency 的 actor 亲戚

## 关联

- [[mobx]] —— 反应式 store；XState 显式画边，MobX 隐式收集读依赖
- [[react]] —— `@xstate/react` 用 `useSyncExternalStore` 订 snapshot
- [[effect]] —— FP 侧重的并发与资源作用域
- [[tanstack-query]] —— 服务端请求状态机，不替代本地流程状态图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[jotai]] —— Jotai — 原子化 React 状态管理
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[react]] —— React — 用组件描述界面的 JavaScript 库
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[zustand]] —— Zustand — 极简 React 状态管理
