---
title: Jotai — 原子化 React 状态管理
来源: https://github.com/pmndrs/jotai
日期: 2026-05-29
分类: 状态管理
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pmndrs/jotai
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3e0b9ffad54b2fbedf2165a82d06ae6bcf1ebd67
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.20.3
---

## 是什么

Jotai 把状态拆成一颗颗 atom（原子）。日常类比：[[zustand]] 是一本大家翻的账本；Jotai 是一堆卡片，组件只捏住自己那张。卡片的身份是 **对象引用**，不是名字字符串。

```ts
import { atom, useAtom } from 'jotai'

const countAtom = atom(0)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>
}
```

`atom(0)` 在组件外创建一颗 primitive atom：内部带 `init`，默认 `read` 读自己，默认 `write` 接受值或 updater。`useAtom` 只是 `useAtomValue` + `useSetAtom` 的配对。

## 为什么重要

不读固定 2.20.3 源码，原子模型很容易被讲成「自动魔法」：

- 为什么派生 atom 不用手写依赖数组——`read` 里每次 `get(other)` 都会记入当前 atom 的依赖表
- 为什么把 `atom()` 写进组件会「状态重置」——每次 render 都是新对象，store 用 WeakMap 按引用存值
- 为什么异步 atom 要包 `<Suspense>`——`useAtomValue` 对 Promise 走 `React.use` 或抛 Promise 的 shim
- 为什么没写 `<Provider>` 也会共享状态——默认落到进程内单例 `getDefaultStore()`

## 核心要点

固定版本可以看成四层：

1. **atom config**：`atom()` 返回普通对象。有初始值就是 primitive；只传 `read` 是只读派生；再传 `write` 是可写派生。

2. **store**：`createStore()` 用 WeakMap 保存每颗 atom 的值、epoch、依赖和挂载信息。`get` / `set` / `sub` 是对外入口。

3. **依赖与失效**：`read` 期间的 `get(dep)` 把 `dep -> epoch` 记进 `atomState.d`。写入后沿 dependents 做 invalidate，再重算。

4. **React 绑定**：`useStore(options)` 优先级是 `options.store` → Context `<Provider>` → `getDefaultStore()`。异步值在 hook 层才变成 Suspense；vanilla `store.get` 会直接拿到 Promise。

## 实践示例

### 案例 1：派生 atom 自动记依赖

```ts
import { atom } from 'jotai'

const countAtom = atom(0)
const doubledAtom = atom((get) => get(countAtom) * 2)
```

`doubledAtom` 没有 `init`。第一次 `store.get(doubledAtom)` 会跑 `read`；其中 `get(countAtom)` 把 `countAtom` 登记为依赖。之后只有 `countAtom` 的 epoch 变了，派生才会重算。这不是编译期分析，是运行时记录。

### 案例 2：异步 atom 与 Suspense

```tsx
const idAtom = atom(1)
const userAtom = atom(async (get) => {
  const id = get(idAtom)
  const res = await fetch(`/api/users/${id}`)
  return res.json()
})

function User() {
  const user = useAtomValue(userAtom)
  return <div>{user.name}</div>
}
```

`read` 的第二参数带 `signal: AbortSignal`。`idAtom` 先变时，上一轮未完成的 Promise 会被 abort，再接上新的 continuable promise。`useAtomValue` 看到 Promise 就交给 `React.use`（没有 `React.use` 时用会抛 Promise 的 shim）。没有外层 `<Suspense>` / Error Boundary，加载和失败都没有地方接。

### 案例 3：默认 store 与 Provider 隔离

```tsx
import { Provider, createStore, useAtom } from 'jotai'

function CountButton() {
  const [count, setCount] = useAtom(countAtom)
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>
}

function DefaultStoreDemo() {
  return <CountButton /> // 无 Provider → getDefaultStore()
}

const isolatedStore = createStore()

function IsolatedStoreDemo() {
  return (
    <Provider store={isolatedStore}>
      <CountButton />
    </Provider>
  )
}
```

两个组件可以并排渲染：`DefaultStoreDemo` 走默认单例，`IsolatedStoreDemo` 走自己的 store，点击互不影响。`<Provider>` 不传 `store` 时，会 `useRef` 建一份自己的 store，子树也不串值。多个 Jotai 副本同时调用 `getDefaultStore()` 时，开发模式会警告 default store 行为可能异常。

## 踩过的坑

1. **atom 建在组件里**：每次 render 新引用，WeakMap 看成新 atom，状态像被清空。按参数动态建 atom 时，固定 2.20.3 的 `jotai/utils` `atomFamily` 仍能用，但源码已标 deprecated，将在 v3 删除并迁到 `jotai-family`。
2. **把异步 atom 当普通 hook 数据**：vanilla 层返回 Promise；React 层靠抛/use Promise。不要假设会得到 `{ loading }` 对象，除非自己用 `loadable` 这类 utils。
3. **误以为必须有 Provider**：没有 Provider 时全体组件共享 default store。要隔离弹窗/测试，显式 `createStore()` + `<Provider store>`。
4. **继续依赖 `setSelf`**：`read` options 里的 `setSelf` 已标 deprecated，生产模式外会警告，计划在 v3 移除。

## 适用 vs 不适用场景

**适用**：

- 状态天然拆成许多独立单元，派生多、共享边多
- 需要异步 atom 和 React Suspense 对齐的树
- 想在非 React 代码里直接 `createStore().get/set`

**不适用**：

- 只有少数全局 slice，团队已经习惯一个 store + selector → [[zustand]]
- 想直接 `state.x++` 驱动渲染 → [[valtio]]
- 需要把 `atomFamily` 当成长期稳定 API → 固定 2.20.3 已宣布迁出核心
- 尚未在目标环境跑过的「比 Zustand 更细所以一定更快」

## 固定版本边界

- 本文绑定 `pmndrs/jotai@3e0b9ffad54b2fbedf2165a82d06ae6bcf1ebd67`，稳定 tag / npm latest 均为 `2.20.3`。
- 同仓已有 `v3.0.0-alpha.0/1`，本页不讨论 alpha 合同。
- npm tarball 未提供 `gitHead`；升级前应重新核对 tag 与打包提交。
- 无生产 `dependencies`；React 17+ 是 React 入口的 optional peer。
- 本文未安装依赖、运行 vitest 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **atom 是引用 identity**——名字只是给你看的；store 认的是对象本身。
2. **依赖表是执行出来的**——`get` 调用顺序决定图，不是装饰器或编译器。
3. **Suspense 是 React 适配，不是 store 语义**——vanilla 只保存 Promise。
4. **默认单例是隐式全局**——Provider 是隔离工具，不是「使用 Jotai 的入场券」。

## 应用型自测

1. 把 `const countAtom = atom(0)` 写进函数组件。两次 render 之间，状态还会接上吗？
2. `userAtom` 的 `read` 返回 Promise。没有 `<Suspense>` 时，`useAtomValue(userAtom)` 会得到普通对象吗？
3. 页面里没有任何 `<Provider>`。两个组件 `useAtom(countAtom)`，改其中一个会不会改到另一个？

检查点：

1. 不会稳定接上。每次 render 都是新 atom 对象，WeakMap 存的是另一份状态。
2. 不会。hook 会对 Promise 走 `use` / 抛 Promise，没有边界时这是运行时失败，不是 `{ loading: true }`。
3. 会。双方都落到 `getDefaultStore()` 单例。

## 延伸阅读

- 官方文档：[jotai.org](https://jotai.org/)
- 固定源码：[pmndrs/jotai](https://github.com/pmndrs/jotai) —— 本文绑定提交 `3e0b9ffad54b2fbedf2165a82d06ae6bcf1ebd67`
- [[zustand]] —— 集中 store + selector 对照
- [[valtio]] —— Proxy mutate 对照

## 关联

- [[zustand]] —— 同生态集中 store，对照原子模型
- [[valtio]] —— 同作者第三条路：直接 mutate
- [[immer]] —— 需要草稿式更新时的可选搭配，不是 Jotai 核心

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
- [[zustand]] —— Zustand — 极简 React 状态管理
