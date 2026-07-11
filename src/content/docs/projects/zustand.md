---
title: Zustand — 极简 React 状态管理
来源: https://github.com/pmndrs/zustand
日期: 2026-05-29
分类: 状态管理
难度: 中级
---

## 是什么

Zustand 是一个**用一个 hook 就能在任意 React 组件读 / 改全局状态**的库。日常类比：

> 以前 Redux 是去政府部门盖章——你得先写 action（申请单）、再过 reducer（窗口审核）、最后 dispatch（盖章）、组件再 selector（领回执）。Provider 是大门，少了进不去。
>
> Zustand 是直接打个电话——`const count = useStore(s => s.count)`，一个 hook 全搞定。没有大门、没有窗口、没有申请单。

它的极简 API 就是两件事：

```jsx
import { create } from 'zustand'

// 1. create 创建 store——state 和 actions 写一起
const useStore = create((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}))

// 2. 任意组件用 hook 订阅
function Counter() {
  const count = useStore((s) => s.count)
  return <button onClick={() => useStore.getState().inc()}>{count}</button>
}
```

没 Provider、没 reducer、没 actionType——这就是 Zustand 全部表面积。

## 为什么重要

不理解 Zustand，下面这些事都没法解释：

- 为什么 Stack Overflow 2024 调查（Other libraries 口径）里 Zustand 使用率能和 Redux 并排甚至更高——5 年从无名到主流
- 为什么 React 生态 2024 后默认推荐"服务端态用 [[tanstack-query]] / 客户端态用 Zustand"的双轨制
- 为什么约 1KB 的库能替代更重的 Redux Toolkit 样板——少 = 强是这里的真理
- 为什么 pmndrs（Three.js 生态那群人）的库都"反 Provider"——他们做 react-three-fiber 时被 Context 跨 renderer 失效坑过

一句话：Zustand 证明了**大型 React 库不一定靠"加更多概念"取胜，靠"减更多依赖"也能赢**。

## 核心要点

Zustand 的心智模型只有 **三件事**：

1. **create 创建 store**：把 state（数据）和 actions（修改 state 的函数）写在同一个对象里。类比：把数据和操作打包成一个"小型部门"。

2. **useStore(selector) 订阅**：组件用 selector 告诉 Zustand"我只关心哪一片"。比如 `s => s.count`——只有 count 字段变了才触发当前组件 re-render，其他字段变化无感。

3. **middleware 链**：用高阶函数串联 `persist`（自动存 localStorage）/ `immer`（让你"直接 mutate"）/ `devtools`（接 Redux DevTools）。每个 middleware 是 `(initializer) => initializer` 的纯函数包装。

三件事加起来 ≈ 1KB（gzip 后）。

## 实践案例

### 案例 1：最简 store——counter

```jsx
import { create } from 'zustand'

const useStore = create((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}))

function Counter() {
  const count = useStore((s) => s.count)
  const inc = useStore((s) => s.inc)
  return <button onClick={inc}>{count}</button>
}
```

**逐部分解释**：

- `create((set) => ({...}))`：用户传入的 initializer 函数，Zustand 把 setState 注入给你
- `set((s) => ({ count: s.count + 1 }))`：拿到当前 state 函数式更新（推荐写法）
- `useStore((s) => s.count)`：selector 提取 count，**只有 count 变才 rerender**
- 没 Provider、没 import store——任何文件 import `useStore` 即用

### 案例 2：persist 中间件——白送本地持久化

```jsx
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useUserStore = create(
  persist(
    (set) => ({
      userId: null,
      setUser: (id) => set({ userId: id }),
    }),
    { name: 'app-user' }   // localStorage 的 key
  )
)
```

**逐部分解释**：

- `persist(...)`：把 store 包一层——每次 `set` 后自动写入本地存储（默认 localStorage）
- `{ name: 'app-user' }`：存盘钥匙名；换名字等于换一份独立存档
- 刷新后 Zustand 读回 `userId`；浏览器 SPA 零配置，SSR 需自换 storage（无 `window`）

### 案例 3：分离 selector 引用，避免不必要 rerender

```jsx
// 错误写法：每次 render 都新对象引用，永远 rerender
const user = useStore((s) => ({ name: s.name, age: s.age }))

// 正确写法 1：用 useShallow 浅比较
import { useShallow } from 'zustand/react/shallow'
const user = useStore(useShallow((s) => ({ name: s.name, age: s.age })))

// 正确写法 2：分两次取
const name = useStore((s) => s.name)
const age = useStore((s) => s.age)
```

selector 返回新对象引用 = 每次都不同 = 每次都 rerender——这是 Zustand 最常见的性能坑。

## 踩过的坑

1. **不传 selector / 传 `s => s`**：都会订阅整个 store，**任何字段变都 rerender**。永远只取所需字段（如 `s => s.count`）；大列表场景把 selector 提到组件外更稳。

2. **selector 返回新对象引用**：`s => ({ a: s.a, b: s.b })` 每次 render 都是新对象 → React 看到引用变 → 永远 rerender。要么用 `useShallow`、要么拆成多次单字段取。

3. **store 之间共享状态**：Zustand 没内建"组合多 store"的方案。两个 store 想共享一片状态，要么手动 subscribe 互相写、要么合并成一个 store。这是 [[jotai]] 的原子化模型反而更顺手的场景。

4. **React Server Components 不能直接用**：Zustand 依赖 `useSyncExternalStore`（Client-only hook）。RSC 里用 Zustand 必须在 `'use client'` 组件内，不能在 server component 里 `useStore()`。

## 适用 vs 不适用场景

**适用**：

- 中小型 React 项目的全局客户端态（登录用户、主题、UI 偏好）
- 从 Redux 迁出的第一站——3 个概念替代 5 层 boilerplate
- 需要不依赖 Provider 的库内部 store（react-three-fiber 这类）
- 与 [[tanstack-query]] 配合：服务端态用 query / 客户端态用 Zustand

**不适用**：

- 服务端返回的接口数据 → 用 [[tanstack-query]] / SWR（缓存、重新请求、乐观更新都白送）
- 高频原子化更新（每次只动一个字段，几百个字段并存）→ 用 [[jotai]] 的 atom 模型
- 跨进程 / 跨 tab 同步 → Zustand persist 只覆盖 localStorage，多 tab 同步要自己接 BroadcastChannel
- 复杂多步表单 / 状态机 → 用 [[xstate]]，状态转换显式声明

## 历史小故事（可跳过）

- **2019 年**：Paul Henschel（pmndrs 创始人）写 react-three-fiber 时被 Context 跨 renderer 失效坑过，开始想"状态管理能不能不依赖 React"。
- **2019 年底**：Zustand v1 发布，核心 vanilla store **101 行 TypeScript**，零依赖。
- **2022 年**：React 18 引入 `useSyncExternalStore`，Zustand v4 接入，正式解决 React 并发模式的 tearing 问题。
- **2024 年**：Stack Overflow 调查里 Zustand 进入主流状态库前列，与 Redux 并排讨论。
- **2026 年**：v5 当家，仍是 ~1KB，仍是 0 生产依赖。

5 年时间从"小众玩具"到"事实标准"。

## 学到什么

1. **状态管理可以不绑死 React**——把 store 做成普通 JS 对象，React 只是订阅者之一。这是 Zustand 比 Redux 更"基础"的原因。
2. **selector + 引用相等是 React 性能优化的本质**——任何"全局态库"都得回答"组件什么时候 rerender"，Zustand 选了最直白的"selector 返回值变 = rerender"。
3. **API 表面积少 = 心智负担少**——Redux 的 5 层概念在 Zustand 是 3 个，差距来自"砍掉历史包袱"而非"创新"。
4. **库的合理拆层**：vanilla（纯 JS）→ React 适配（64 行）→ middleware 高阶器。每层都能独立讲清楚。

## 延伸阅读

- 官方 docs：[zustand.docs.pmnd.rs](https://zustand.docs.pmnd.rs/)（短小精悍，1 小时读完）
- 视频教程：[Jack Herrington — Zustand vs Redux Toolkit](https://www.youtube.com/watch?v=fZPgBnL2x-Q)（30 分钟看完两边代码量对比）
- 自己写实现：照着 vanilla.ts 100 行手写一遍，再对照 react.ts 64 行接 useSyncExternalStore——能讲清楚 Zustand 内核就懂了大半状态管理库
- [[tanstack-query]] —— 服务端态的标配，与 Zustand 分工
- [[react-hooks]] —— `useSyncExternalStore` 是 Zustand React 接入的桥梁

## 关联

- [[tanstack-query]] —— 服务端态用 query / 客户端态用 Zustand 的双轨制
- [[react-hooks]] —— `useSyncExternalStore` 是 React 18 给外部 store 的官方接入点
- [[jotai]] —— 同 pmndrs 出品但用原子化模型，适合高频细粒度更新
- [[xstate]] —— 复杂状态转换的状态机方案，与 Zustand 形成互补

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
