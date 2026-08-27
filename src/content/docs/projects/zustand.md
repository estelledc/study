---
title: Zustand — 极简 React 状态管理
来源: https://github.com/pmndrs/zustand
日期: 2026-05-29
分类: 状态管理
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pmndrs/zustand
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2115efb9e270e73ad1d3472dfe0e0c7b8c6abcd4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.15
---

## 是什么

Zustand 是一个把「一份可变 store」和「React 订阅」拆开的状态库。日常类比：vanilla store 是一本可以打电话改页的账本；React hook 只是听电话的人。账本本身不依赖 React。

```ts
import { create } from 'zustand'

const useStore = create((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}))
```

`create` 先调用 `createStore`，再把 `getState` / `setState` / `subscribe` / `getInitialState` 挂到同一个 hook 上。组件里 `useStore((s) => s.count)` 只取一片；不传 selector 时，默认 identity，等于订阅整本账本。

## 为什么重要

不读固定 5.0.15 源码，下面这些合同很容易被旧教程带偏：

- 为什么「一个 hook 走天下」其实建立在 vanilla store 上，而不是 Context Provider
- 为什么 `set({ b: 2 })` 默认是浅合并，`set(null)` 或 `set(next, true)` 却是整段替换
- 为什么默认 `useStore` 不再接收 equality function；要浅比较得用 `useShallow` 或 `zustand/traditional`
- 为什么 persist 在 SSR 里可能根本没有 storage，却仍允许 `set`

## 核心要点

固定版本的主链可以拆成五步：

1. **vanilla `createStore`**：initializer 收到 `set`、`get` 和完整 `api`，返回初始 state。listener 是一个 `Set`。

2. **`setState` 合并规则**：参数可以是值或 `(state) => next`。`Object.is(next, current)` 则静默跳过。`replace` 为真，或下一状态不是对象 / 是 `null` 时整段替换；否则 `Object.assign({}, state, nextState)`。

3. **React `useStore`**：`React.useSyncExternalStore(api.subscribe, () => selector(getState()), () => selector(getInitialState()))`。默认 selector 是 identity。

4. **`useShallow`**：`zustand/react/shallow` 记住上一片结果，用 vanilla `shallow` 比较后决定是否回传旧引用。它不是默认行为。

5. **middleware 是 initializer 包装器**：`persist`、`subscribeWithSelector`、`devtools`、`combine`、`redux` 从 `zustand/middleware` 导出；`immer` 是单独入口；`ssrSafe` 只以 `unstable_ssrSafe` 导出。

## 实践示例

### 案例 1：默认浅合并 vs 显式替换

```ts
import { createStore } from 'zustand/vanilla'

const store = createStore<{ a: number; b?: number }>(() => ({ a: 1 }))
store.setState({ b: 2 })
// { a: 1, b: 2 }  ← Object.assign 浅合并
store.setState({ a: 3 }, true)
// { a: 3 }        ← replace=true，丢掉 b
```

函数式 `set((s) => ({ count: s.count + 1 }))` 返回的也是「下一状态片段」，同样走这条合并规则。`getInitialState()` 始终指向创建时那份初始对象。

### 案例 2：selector 与 useShallow

```tsx
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

const useStore = create(() => ({ name: 'Ada', age: 36 }))

// 每次都 new object → useSyncExternalStore 看到新引用 → 必 rerender
const bad = useStore((s) => ({ name: s.name, age: s.age }))

const user = useStore(useShallow((s) => ({ name: s.name, age: s.age })))
```

`useShallow` 只保证「选出的那一层」浅相等。嵌套对象字段换了引用，它仍会放行。

### 案例 3：persist 的默认 storage 与推迟 hydration

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const useUser = create(
  persist(
    (set) => ({ userId: null as string | null, setUser: (id: string) => set({ userId: id }) }),
    { name: 'app-user', skipHydration: true },
  ),
)
// 在确认进入浏览器后再：
void useUser.persist.rehydrate()
```

不写 `storage` 时，实现调用 `createJSONStorage(() => window.localStorage)`。`getStorage()` 抛错（典型是 SSR 无 `window`）就得到 `undefined` storage：后续 `set` 仍改内存，但会警告无法写盘。hydration 默认浅 merge：`{ ...current, ...persisted }`。版本号不同且没有 `migrate` 时，固定实现打 error 日志，不擅自迁移。

## 踩过的坑

1. **把「不传 selector」当成精细订阅**：默认 identity，任何 `setState` 只要产出新对象都会通知该组件。
2. **把 `set(partial)` 想成 immer 式原地改**：默认是浅合并新对象。要原地草稿必须另接 `zustand/middleware/immer`，且 `immer` 是 optional peer。
3. **以为 `useStore(selector, shallow)` 仍是默认入口**：那是 `zustand/traditional` 的 `useStoreWithEqualityFn`，它才依赖 `use-sync-external-store`。
4. **把 persist 当跨标签同步或 SSR 安全默认**：它只封装单一 storage；多标签、cookie、服务端渲染都要自己选 storage / `skipHydration`。`unstable_ssrSafe` 在 SSR 里直接禁止 `set`，而且仍标 experimental。

## 适用 vs 不适用场景

**适用**：

- 中小 React 应用的客户端全局态（主题、登录用户、UI 开关）
- 需要在非 React 代码里 `getState` / `setState` 的库内部 store
- 与 [[tanstack-query]] 分工：远端缓存走 query，本地 UI 态走 Zustand

**不适用**：

- 远端列表 / 缓存 / 重试 → [[tanstack-query]] 或 SWR
- 大量细粒度派生、组件各自持有一片公式 → [[jotai]]
- 复杂多步协议或显式状态图 → [[xstate]]
- 还没在目标 bundler 量过体积，却把「大约 1KB」写成当前事实

## 固定版本边界

- 本文绑定 `pmndrs/zustand@2115efb9e270e73ad1d3472dfe0e0c7b8c6abcd4`，tag / npm latest 均为 `5.0.15`。
- npm tarball 未提供 `gitHead`；升级前应重新核对 tag 与打包提交是否仍一致。
- 无生产 `dependencies`；React 18+ 只是 React 入口的 optional peer。vanilla 入口可单独使用。
- 类型入口要求 TypeScript >= 4.5。
- 本文未安装依赖、运行 vitest 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架适配可以薄到一层 hook**——真正的合同在 vanilla `setState` 的合并与通知规则。
2. **默认 API 的「省略参数」也是合同**——不传 selector 不是「随便用」，而是订阅全部。
3. **中间件必须按入口读**——`persist` 在 barrel 里，`immer` 不在；`ssrSafe` 还不稳定。
4. **持久化默认值绑定浏览器**——`window.localStorage` 不是通用运行时保证。

## 应用型自测

1. 组件写 `useStore()` 不传 selector。另一个字段被 `set` 了，这个组件会 rerender 吗？
2. 当前 state 是 `{ a: 1 }`，调用 `setState({ b: 2 })` 且不传 `replace`。结果还含 `a` 吗？
3. persist 未设 `storage`，在没有 `window` 的环境初始化。后续 `set` 还会改内存吗？会不会写盘？

检查点：

1. 会。默认 identity selector 订阅整份 state。
2. 会含 `a`。对象下一状态默认 `Object.assign` 浅合并。
3. 会改内存，默认不会写盘：`createJSONStorage` 失败后 storage 为空，只警告。

## 延伸阅读

- 官方文档：[zustand.docs.pmnd.rs](https://zustand.docs.pmnd.rs/)
- 固定源码：[pmndrs/zustand](https://github.com/pmndrs/zustand) —— 本文绑定提交 `2115efb9e270e73ad1d3472dfe0e0c7b8c6abcd4`
- [[jotai]] —— 同生态的原子化对照
- [[valtio]] —— 同作者的 Proxy mutate 路线
- [[tanstack-query]] —— 服务端态对照

## 关联

- [[jotai]] —— 原子 + 依赖追踪，对照集中 store
- [[valtio]] —— 直接 mutate，对照显式 `set`
- [[tanstack-query]] —— 远端缓存，不负责本地 UI store
- [[xstate]] —— 显式状态机，适合多步协议
- [[react-hooks]] —— `useSyncExternalStore` 是 React 入口的桥

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[jotai]] —— Jotai — 原子化 React 状态管理
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[projects/react]] —— React — 用组件描述界面的 JavaScript 库
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
