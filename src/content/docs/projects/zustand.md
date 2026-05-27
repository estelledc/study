---
title: zustand — 101 行核心的"反 Provider 派"状态管理
description: pmndrs 出品；用 useSyncExternalStore + 极简 API + 中间件链路，证明大型库不一定要复杂。
sidebar:
  label: zustand
  order: 3
---

| 维度 | 值 |
|------|------|
| GitHub | <https://github.com/pmndrs/zustand> |
| Star | ~50k+（2026-05） |
| 版本 | v5.0.13 |
| 最近活跃 | 4 天前最新 commit |
| 主语言 | TypeScript |
| 维护 | Paul Henschel（pmndrs 创始人）+ Daishi Kato 等 |
| License | MIT |
| **生产依赖** | **0**（peer 可选 react / immer / use-sync-external-store） |
| 研究日期 | 2026-05-27（按[方法论](/study/method/) + 本地 clone + Explore subagent 精读） |

## 一句话定位

zustand 不是"轻量版 Redux"。它的核心 vanilla store **101 行 TypeScript** 写完，
**零运行时依赖**，做出了 Redux 全家桶做不到的事——
不要 Provider、规避 React Context Loss / Zombie Child / 并发模式陷阱、
中间件可组合（immer + persist + devtools 链式拼接）。

它的存在证明：**大型 React 库不一定靠"加更多概念"取胜，靠"减更多依赖"也能赢**。

## Why（它解决了什么）

2017 年 Redux 当家时代，React 状态管理有三宗罪：

1. **Provider 强制嵌套**——`<Provider store><App/></Provider>`，
   组件树要为状态管理付出运行时代价
2. **boilerplate 层层叠**——一个简单 counter 要写 action / actionType / reducer / dispatch / mapStateToProps 5 层
3. **三个隐藏陷阱**：
   - **Zombie Child Problem**：被卸载组件的 reducer 拿到 stale props 引发崩溃
   - **React Concurrency 不兼容**：18+ 的并发渲染让 useState 的快照逻辑变复杂
   - **Context Loss**：跨 React renderer（如 react-three-fiber）时 Context 失效

Zustand 的核心 insight：

> 状态管理不需要 React。把 store 做成纯 JS，React 只是订阅者之一。

实现路径：

- 核心 store 是普通对象（state + setState + getState + subscribe），101 行
- React 部分只是用 `useSyncExternalStore` 把 React 组件挂上来
- 不需要 Provider，因为 store 是普通模块导出
- 中间件不修改核心，是函数包装函数（FP 风格的"高阶 store"）

→ 这个设计让它**比 Redux 简单**（无 boilerplate）、**比 Context 强大**（无 re-render 风暴）、
**比 Recoil 轻**（5KB vs 15KB），同时全面规避了 React 的三大陷阱。

## 仓库地形

```
zustand/
├── src/
│   ├── vanilla.ts            ← ★ 心脏：核心 createStore（101 行）
│   ├── react.ts              ← React 适配层（useStore + create hook）
│   ├── shallow.ts            ← 浅相等比较工具
│   ├── traditional.ts        ← 旧 API（用 use-sync-external-store/shim）
│   ├── middleware/
│   │   ├── immer.ts          ← Draft 风格更新
│   │   ├── persist.ts        ← 403 行，最复杂的中间件
│   │   ├── devtools.ts       ← Redux DevTools 集成
│   │   ├── redux.ts          ← Redux-style reducer 兼容
│   │   ├── subscribeWithSelector.ts ← 增强 subscribe
│   │   └── combine.ts        ← 合并多 store
│   ├── vanilla/shallow.ts    ← shallow 算法实现（非 React 版）
│   └── react/shallow.ts      ← useShallow hook
├── tests/                    ← 测试（devtools.test.tsx 高达 2595 行）
├── docs/learn/getting-started/comparison.md ← ★ 与 Redux/Jotai/Valtio/Recoil 的官方对比
└── examples/
```

**心脏文件**：`src/vanilla.ts`（101 行）。
读完它，你就读完了 zustand 的精髓——**整个库的"变速箱"就这一个文件**。

## 核心机制

### 机制 1 · vanilla store：101 行的状态机

完整实现（带行号）：

```typescript
// L60-96: createStoreImpl
const createStoreImpl: CreateStoreImpl = (createState) => {
  type TState = ReturnType<typeof createState>
  type Listener = (state: TState, prevState: TState) => void

  let state: TState
  // L64: listeners 用 Set——O(1) 增删 + 防重 + 迭代快
  const listeners: Set<Listener> = new Set()

  // L66-81: setState 核心逻辑
  const setState: StoreApi<TState>['setState'] = (partial, replace) => {
    const nextState =
      typeof partial === 'function'
        ? (partial as (state: TState) => TState)(state)  // 函数更新：注入当前 state
        : partial

    // L73: 关键 ! 用 Object.is 不用 ===
    // 原因：Object.is(NaN, NaN) === true，而 NaN === NaN 是 false
    // 不处理这个会导致 NaN 状态永远更新不上去
    if (!Object.is(nextState, state)) {
      const previousState = state

      // L75-78: merge 策略
      // replace 默认是 (typeof nextState !== 'object' || nextState === null)
      // 原因：Object.assign({}, state, null) 会忽略 null 返回 {...state}
      //      Object.assign({}, state, 123) 也忽略 number——这都是潜在 bug
      // 所以 nextState 是 primitive 时强制完全替换
      state =
        (replace ?? (typeof nextState !== 'object' || nextState === null))
          ? (nextState as TState)
          : Object.assign({}, state, nextState)

      // L79: 同步通知所有 listener（不 Promise 化）
      listeners.forEach((listener) => listener(state, previousState))
    }
  }

  const getState: StoreApi<TState>['getState'] = () => state
  const getInitialState: StoreApi<TState>['getInitialState'] = () => initialState

  // L88-92: subscribe 返回 unsubscribe
  const subscribe: StoreApi<TState>['subscribe'] = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const api = { setState, getState, getInitialState, subscribe }

  // L95: 关键的初始化时机！
  // createState 是用户传入的 ((set, get, api) => ...) 函数
  // 这一行同时完成：
  //   1. 调用 createState（让用户拿到 setState/getState/api 引用）
  //   2. 把返回值作为 initialState
  //   3. 同时赋给 state（首次设置）
  const initialState = (state = createState(setState, getState, api))

  return api as any  // as any 绕过 TS——中间件会修改类型
}
```

[GitHub 永久链接](https://github.com/pmndrs/zustand/blob/main/src/vanilla.ts)

**精读要点**：

- **整个 store = `state` 变量 + `listeners` Set + 4 个 method 闭包**。这是 vanilla
  JS 的"对象"，不依赖 React，可以在 Node.js / Web Worker / 任何 JS 环境用
- **L73 用 Object.is**：很多人 review 代码看到 `===` 会觉得"对的"，但 NaN 是个坑。
  这是工程师 vs 业余写手的分水岭
- **L75-78 的 replace 默认值**：如果你只看 README，会以为 setState 永远是浅 merge。
  但实际上 primitive 强制 replace——不写这个分支，`store.setState(123)` 会无效
- **L95 的初始化时序**：`state = createState(setState, getState, api)` 这一行
  是闭包的精彩用法。createState 在被调用时就能用 setState（因为它是闭包引用，
  不是当下值），但此时 state 还没赋值。这意味着：用户的 createState 不能在
  函数体里立刻调 setState/getState（否则 state 还是 undefined）

### 机制 2 · React 接入：useSyncExternalStore 是关键

```typescript
// src/react.ts L17-36
export function useStore<TState, StateSlice>(
  api: ReadonlyStoreApi<TState>,
  selector: (state: TState) => StateSlice = identity as any,
) {
  const slice = React.useSyncExternalStore(
    api.subscribe,                                                  // 怎么订阅
    React.useCallback(() => selector(api.getState()), [api, selector]),     // render 时取快照
    React.useCallback(() => selector(api.getInitialState()), [api, selector]), // SSR 用
  )
  React.useDebugValue(slice)
  return slice
}
```

**为什么 useSyncExternalStore 是"关键基建"**：

- React 18 之前，外部 store 订阅靠 `useState + useEffect + force re-render`，
  在并发渲染下会错过 update（产生 "tearing"——同一次渲染里不同组件看到不同 state）
- React 18 引入 `useSyncExternalStore`，是 React 团队为外部 store 准备的
  **官方钩子**——保证在每次 render 开始时拿一致的快照，与并发模式兼容
- zustand 依赖这个 hook，**白送地解决了 Zombie Child + Concurrency 两大陷阱**

**equalityFn 在哪？**

zustand v5 默认用引用相等（`Object.is`）。要做浅比较，用 `useShallow`：

```typescript
// src/react/shallow.ts
export function useShallow<S, U>(selector: (state: S) => U): (state: S) => U {
  const prev = React.useRef<U>(undefined)
  return (state) => {
    const next = selector(state)
    return shallow(prev.current, next)
      ? (prev.current as U)        // 浅相等 → 返回旧引用 → React 不 re-render
      : (prev.current = next)       // 不同 → 更新 ref + 返回新值
  }
}
```

用法：`useStore(store, useShallow(s => ({a: s.a, b: s.b})))`——
当 a/b 字段值都没变时，外层 useStore 看到引用相等，不触发 re-render。

### 机制 3 · 中间件：函数包装函数的链路

zustand 的中间件不是"插件系统"，是**纯函数高阶器**。看 immer 中间件：

```typescript
// src/middleware/immer.ts L74-86
const immerImpl: ImmerImpl = (initializer) => (set, get, store) => {
  // ↑ 中间件签名：(initializer) => (set, get, store) => initialState
  // 它接收一个 initializer，返回一个新的 initializer

  // 劫持 store.setState：把"接受 Draft 函数的 setState"转换成"接受 immutable nextState 的 setState"
  store.setState = (updater, replace, ...args) => {
    const nextState = (
      typeof updater === 'function'
        ? produce(updater as any)   // ← immer.produce：Draft → immutable
        : updater
    ) as ((s: T) => T) | T | Partial<T>

    return set(nextState, replace as any, ...args)
  }

  // 调用原始 initializer，但传入的 setState 已经被劫持
  return initializer(store.setState, get, store)
}
```

**链式调用是怎么发生的**：

```typescript
const store = create(
  immer(persist((set) => ({ count: 0 })))
)
// 等价于:
//   1. (set) => ({ count: 0 })           ← 用户 initializer
//   2. persist 包装：返回新 initializer，自动 save 到 storage
//   3. immer 再包装：让 set 接受 Draft 函数
//   4. create 包装：返回 React hook
```

每一层都是**(initializer) => initializer** 的高阶函数。
这是函数式编程的"装饰器"模式（不是 Python decorator 那种语法），
源自 Redux 的 enhancer 设计但更简洁。

**TS 类型用 module augmentation 扩展**：

```typescript
declare module '../vanilla' {
  interface StoreMutators<S, A> {
    'zustand/immer': WithImmer<S>
    'zustand/persist': WithPersist<S, A>
  }
}
```

`StoreMutators` 是 vanilla.ts 里定义的空接口（`interface StoreMutators<S, A> {}`），
中间件通过 module augmentation 往里加 key。
TS 的 `Mutate` 类型递归处理这个数组，最终算出经过链式中间件后的 store 类型。

→ **这是工业级 TS 库怎么做"开放扩展"的范例**。学透这个模式，
你以后写自己的 TS 库会受益匪浅。

### 机制 4 · persist 中间件的 hydrationVersion 巧思

persist 是最复杂的中间件（403 行）。最精彩的设计是 **hydration version 机制**：

```typescript
// src/middleware/persist.ts
let hydrationVersion = 0  // L203

const hydrate = () => {
  const currentVersion = ++hydrationVersion  // L262: 每次 hydrate 版本 +1

  // ... 异步从 storage 取数据 ...

  .then((migrationResult) => {
    if (currentVersion !== hydrationVersion) {  // L298: 检查是否过期
      return  // 我开始时是 v3，现在是 v5，说明有新 hydrate 启动了，我退出
    }
    // 安全更新 state ...
  })
}
```

**为什么不是 boolean `isHydrating`**：

布尔值无法处理"两个并发 hydrate 都成功"的情况——
hydrate#1 启动 → 还没完成 → 用户调 `persist.rehydrate()` 触发 hydrate#2 →
hydrate#1 完成（覆盖了 hydrate#2 期望的状态）→ 一致性破坏。

版本号方案：每次 hydrate 启动都拿到自己的 version number。
完成时检查"当前 version 是否还是我的"——是就更新，不是就放弃。
这是**经典的 CAS（Compare-And-Swap）思想**在异步代码里的应用。

→ 这种 race condition 思维，是"系统思维"工程师和"语法工程师"的本质区别。

## Hands-on（30 分钟跑通 + 2 个改动实验）

### Step 1：基础接入（5 分钟）

```bash
npm i zustand
```

```jsx
import { create } from 'zustand'

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ count: 0 }),
}))

function Counter() {
  const count = useStore((s) => s.count)
  const increment = useStore((s) => s.increment)
  return <button onClick={increment}>{count}</button>
}
```

注意：

- 没有 Provider
- selector `(s) => s.count` 让组件只在 count 变化时 re-render（其他字段变了不影响）
- `increment` 也用 selector 提取，引用稳定

### Step 2：本地 clone 跑测试（10 分钟）

```bash
cd ~/study/.research/zustand
pnpm install
pnpm test src/vanilla
# 看到所有 vanilla 测试通过——你正在跑这个库的真正测试
```

### 实验 A：移除 Object.is 检查，改用 ===（5 分钟）

改 `src/vanilla.ts` L73：

```typescript
// 原: if (!Object.is(nextState, state)) {
// 改: if (nextState !== state) {
```

跑测试：

```bash
pnpm test src/vanilla
```

**预期失败的测试**：
- "should call listeners only once on multiple sequential setState calls" 类型的会过
- 但凡涉及 NaN 比较的测试会失败（如果有的话）

写一个最小复现：

```typescript
import { createStore } from './src/vanilla'
const store = createStore(() => ({ value: NaN }))
let called = 0
store.subscribe(() => called++)
store.setState({ value: NaN })
console.log(called)
// 改前：0（Object.is(NaN, NaN) === true，不触发）
// 改后：1（NaN !== NaN 是 true，触发了——这是 bug）
```

→ 这一步建立"为什么用 Object.is 不是 ===" 的肌肉记忆。

### 实验 B：把 listeners 改成 Array（5 分钟）

改 L64：

```typescript
// 原: const listeners: Set<Listener> = new Set()
// 改: const listeners: Listener[] = []
```

L88-92 跟着改：

```typescript
const subscribe = (listener) => {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx > -1) listeners.splice(idx, 1)
  }
}
```

写性能测试：1 万个 listener，频繁订阅/退订，对比 Set vs Array 的耗时。
**预期**：Array 慢一个数量级（splice 是 O(n)，Set.delete 是 O(1)）。

→ 这一步建立"基础数据结构选择 = 性能" 的直觉。

## 横向对比

### 哲学层面的对比表

| 维度 | Zustand | Redux Toolkit | Jotai | Valtio | Recoil |
|------|---------|---------------|-------|--------|--------|
| **状态模型** | 不可变，中心化 | 不可变，slice 化 | 原子化分散 | 可变 proxy | 原子化分散 |
| **更新风格** | 函数或对象 | immer draft（默认） | atom setter | 直接赋值 | atom setter |
| **粒度** | 单 store | 多 slice | 多 atom | 单 proxy | 多 atom |
| **Provider** | ❌ 无 | ✅ 必需 | ✅ 必需 | ❌ 无 | ✅ 必需 |
| **选择器优化** | 手动 selector + equality | mapStateToProps | atom 自动追踪 | useSnapshot 自动追踪 | atom 自动追踪 |
| **中间件** | 函数高阶器（immer/persist/devtools） | RTK + RTK Query | 插件 | 基础 plugin | 无官方 |
| **DevTools** | Redux DevTools 中间件 | 内置 | 浏览器扩展 | ❌ 无 | React DevTools |
| **学习曲线** | 极低（3 概念） | 中（actions/reducers/selectors） | 低（atoms） | 极低（proxy） | 中高（atoms+selectors+families） |
| **Bundle** | ~1KB | ~10KB | ~5KB | ~8KB | ~15KB |
| **并发模式** | ✅ useSyncExternalStore | ⚠️ 部分 | ✅ | ⚠️ 需 adapter | ✅ |
| **生产依赖** | **0** | redux + reselect + immer | 0 | 0 | 0 |

### 怎么选

- **小到中型 React 项目，看重简单** → Zustand。3 个概念学完直接干活
- **大型企业应用，多团队** → Redux Toolkit。RTK Query 的接口缓存+错误处理太成熟
- **强调原子化、组件可重用** → Jotai
- **逻辑量极大、需要"突变"风格** → Valtio（warning：逃出 React 心智会有适应成本）
- **重 GraphQL 项目** → Apollo Client（不在表内但同类）

**一句话**：要从 Redux 迁出，第一站永远是 Zustand。

## 与你当前工作的连接

### 今天就能用的部分

**项目状态分层**（高优先级）：

设想一个典型 React 产品有这些状态：

- 接口返回的数据（订单、商品、用户列表）→ 用 [TanStack Query](/study/projects/tanstack-query/) 管
- 全局客户端状态（登录用户、主题设置、当前所选分类）→ 用 zustand 管
- 局部组件状态（modal 是否打开、当前 tab、表单 draft）→ 用 useState 管

→ 这是**三种状态分层**：
- 服务端状态 = TanStack Query（已学）
- 全局客户端状态 = zustand
- 局部组件状态 = useState

迁移路径：

```typescript
// store/user.ts - 用户态
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUserStore = create(
  persist(
    (set) => ({
      userId: null,
      nickname: '',
      setUser: (user) => set(user),
      logout: () => set({ userId: null, nickname: '' }),
    }),
    { name: 'app-user' }  // localStorage key
  )
)
```

任何组件 `const userId = useUserStore(s => s.userId)` 即用，无 Provider。
持久化白送（persist 中间件）。

### 下个月能用的部分

**accept "未来工程师"框架后**：本地 clone zustand 跑通测试，
然后**自己写一个微型 zustand**（100 行 vanilla store + 50 行 React 适配）。
关键不是"会用 zustand"，是**理解外部 store + useSyncExternalStore 的协作模型**。

懂了这个模型，你看 Recoil / Jotai / Valtio 都是"换皮"。

### 不要用的部分

- **复杂业务里大量 action**：单文件 store 会变长。Zustand 的 slice 模式
  （多个 createSlice 合并）比 Redux 的 slice 简陋。复杂场景考虑分多个 store
- **大型多团队项目**：缺 RTK Query 那种官方推荐的"接口层"。但现在你可以
  zustand + TanStack Query 自己拼，效果不输

## 自检问题 + 延伸阅读

**真问题（精读源码时回头查）**：

- `useStore` 的 useCallback 依赖数组为什么是 `[api, selector]` 而不只 `[selector]`？
  追到 `src/react.ts` L32
- persist 的 `hydrationVersion` 设计在什么并发场景下能救命？写最小复现
- `setState` 第二参 replace 的默认值 `replace ?? (typeof nextState !== 'object' || nextState === null)`——
  为什么不能简单写成 `replace ?? false`？追到 `src/vanilla.ts` L76
- `shallow` 算法（src/vanilla/shallow.ts L60）为什么要先比 `Object.getPrototypeOf`？
  写一个 plain object vs class instance 都有相同 keys 的最小例子
- 为什么 `create<T>()(initializer)` 是柯里化的而不是 `create<T>(initializer)` 直接调？
  这个是 TS 的 partial type argument workaround——理解了这个你就理解了"为什么 TS 的高级库
  喜欢柯里化"

**延伸阅读路径**：

1. `src/vanilla.ts`（101 行，已读完）
2. `src/react.ts`（70 行，已部分读完）— 完整看一遍
3. `src/vanilla/shallow.ts`（50 行）— 看 shallow 算法
4. `src/middleware/persist.ts`（403 行）— 看异步 + 竞态处理
5. 跳到 `tests/devtools.test.tsx` 节选 100 行——看怎么测试一个中间件

→ 5 步读完你能自己实现 zustand-clone 100 行版。
**这才是"懂变速箱"——能在白板前 30 分钟手写 zustand 的核心**。
