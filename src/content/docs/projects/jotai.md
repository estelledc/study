---
title: Jotai — 原子化 React 状态管理
来源: https://github.com/pmndrs/jotai
日期: 2026-05-29
分类: 状态管理
难度: 中级
---

## 是什么

Jotai 是 React 的状态管理库，把全局状态**拆成无数小"原子"**（atom），组件只订阅它真正用到的原子。

日常类比：[[zustand]] 是一个大账本（store），所有人翻同一本，找自己要的那一行；Jotai 是每个数据一张小卡片，谁需要哪张拿哪张，互不打扰。

你写：

```ts
const countAtom = atom(0)
```

就声明了一个最小的状态单元。任何组件可以：

```tsx
const [count, setCount] = useAtom(countAtom)
```

去读、去改这颗原子。组件**只订阅这一颗**——别的 atom 改了不会触发重渲染。

## 为什么重要

不理解 atomic 状态管理，下面这些事都说不清：

- **Recoil 的精神继承**：Recoil 是 Facebook 2020 推出的 atom 状态库，但已停更。Jotai 接住了 atomic 思想，做得更小、更专注、更稳定。
- **比 [[zustand]] 更细粒度**：zustand 要写 selector 才能避免无关重渲染；Jotai 自带 atom 级订阅，**派生 + 订阅都自动**。
- **与 React 18 Suspense 原生兼容**：atom 可以是异步的（返回 Promise）；Suspense 像"加载中挡板"，会自动接住 loading 状态。
- **TypeScript-first**：atom 类型自动推，写 `atom(0)` 就推出 `PrimitiveAtom<number>`，不用手动标注。

## 核心要点

Jotai 只有 **三个核心概念**：

1. **atom**：最小状态单元。可以是一个原子值（`atom(0)`），也可以是一个派生公式（`atom((get) => ...)`）。每个 atom 是一张独立的卡片。

2. **useAtom**：组件订阅 + 修改 atom 的钩子。返回 `[value, setter]`，签名和 `useState` 几乎一样。

3. **Atom 派生**：一个 atom 可以基于其他 atoms 计算出来——你写公式，Jotai **自动追踪依赖**。某个被依赖的 atom 改了，派生 atom 自动重算。

三件事拼起来就是 Jotai 的全部公开 API。其他 utils（atomFamily、atomWithStorage 等）都是这三件事的组合。

## 实践案例

### 案例 1：基础 atom

```tsx
import { atom, useAtom } from 'jotai'

const countAtom = atom(0)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

逐部分解释：

- `atom(0)` 在组件外创建一个原子，初始值 0
- `useAtom(countAtom)` 订阅这颗原子，**写法和 useState 一样**
- 任何调用 `setCount` 的组件都会通知所有订阅 `countAtom` 的组件

### 案例 2：派生 atom（自动追踪依赖）

```tsx
const countAtom = atom(0)
const doubledAtom = atom((get) => get(countAtom) * 2)

function Display() {
  const [doubled] = useAtom(doubledAtom)
  return <div>{doubled}</div>
}
```

只要 `countAtom` 变化，`doubledAtom` **自动重算**——你不需要写 selector、不需要写 useMemo、不需要在依赖数组里列。

`get` 函数在 read 回调里调用，Jotai 在运行时记录"我读了哪些 atom"，构成依赖图。

### 案例 3：异步 atom（Suspense 自动处理 loading）

```tsx
const idAtom = atom(1)
const userAtom = atom(async (get) => {
  const id = get(idAtom)
  const res = await fetch(`/api/users/${id}`)
  return res.json()
})

function User() {
  const [user] = useAtom(userAtom)
  return <div>{user.name}</div>
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <User />
    </Suspense>
  )
}
```

`userAtom` 返回 Promise，Jotai 把它包装成 Suspense 兼容的资源——loading 期间外层 `<Suspense>` 自动显示 fallback，无需手写 `if (loading)` 分支。

## 踩过的坑

1. **atom 必须在组件外定义**：写在组件内部每次渲染都新建 atom，订阅链路全部丢失，状态会"莫名重置"。要按参数动态创建（如每个 userId 一颗）用 `atomFamily`——像"按钥匙开抽屉"的工厂。

2. **大量 atom 时调试难**：没有 Redux DevTools 那种全局状态树视图。要装 jotai-devtools 独立包，并给 atom 加 `debugLabel`，才能在面板里识别每颗原子。

3. **atom-in-atom 模式容易内存泄漏**：`atomFamily` 默认无限缓存，参数空间大（比如按 userId 创建）时 Map 会一直涨。要手动 `setShouldRemove` 配 GC 策略。

4. **Provider scope 误用**：默认无 Provider 时全局共享一个 default store；要做"每个子树独立状态"（比如多个隔离的弹窗）必须用 `<Provider>` 包裹。一旦混用，状态会串店。

## 适用 vs 不适用场景

**适用**：
- 中小到中型 React 应用（大约几十到一两百个业务 atom），状态拆成多个独立单元
- 需要异步状态 + Suspense 集成的场景
- 想避开 Redux / Redux Toolkit 重型样板代码
- TypeScript 项目，希望少写类型标注

**不适用**：
- 大型企业应用且团队习惯 Redux 中间件 / dispatch action 流程 → 还是 Redux Toolkit 好
- 需要丰富的开发者工具、time travel 调试、action 日志 → Redux DevTools 还是更强
- 状态都是少数几个全局 slice，不需要 atom 级粒度 → [[zustand]] 更轻

## 历史小故事（可跳过）

- **2020 年**：Facebook 开源 Recoil，把 atom / selector 带进 React 主流视野。
- **2020 年前后**：Daishi Kato 在 pmndrs 生态里陆续做出 Zustand、Valtio、Jotai——三条不同的状态哲学。
- **Jotai 路线**：名字来自日语「状態」（jotai，状态），把 Recoil 式原子模型做得更小、API 更贴 `useState`。
- **之后**：Recoil 维护放缓并停更；Jotai 继续迭代，异步 atom + Suspense、devtools、utils 成为常用组合。

## 学到什么

1. **状态可以"原子化"**——不是所有数据都该塞进同一个 store；按业务把状态切碎，订阅粒度自然到位
2. **派生状态不必手写 selector**——`atom((get) => ...)` 让运行时帮你追踪依赖，比 `useMemo` + 手写依赖数组省心
3. **atom 是"引用 identity"**——这是底层 Map 的 key，所以 atom 必须 stable（在组件外定义、或用 atomFamily 缓存）
4. **三套同作者状态库的对照**：[[zustand]] / valtio / Jotai 出自同一个人（Daishi Kato），分别选了"集中 store + selector"、"Proxy mutate"、"atom 分散"三条路——理解 Jotai 反过来加深对前两套的理解

## 延伸阅读

- 官方文档：[jotai.org](https://jotai.org/)（核心 API 一页讲完，文档非常薄）
- 入门视频：YouTube 搜 "Jotai vs Zustand vs Redux"（社区横评，快速建立心智模型）
- 源码精读：`src/vanilla/atom.ts` + `src/vanilla/store.ts`（vanilla 部分核心约 500 行，dependency tracking 在 `readAtomState`）
- [[zustand]] —— 同作者的"集中 store + selector"路线
- [[react-19]] —— Suspense + atom 的协作前提

## 关联

- [[zustand]] —— 同作者第一套，集中 store + selector，对照组
- [[react-19]] —— atom 异步 + Suspense 自动 loading 依赖 React 18+ 的能力
- [[typescript]] —— atom 类型自动推，是 TS-first 设计的范例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
- [[zustand]] —— Zustand — 极简 React 状态管理
