---
title: nanostores — 不到 1 KB 的"框架无关"状态库
来源: 'https://github.com/nanostores/nanostores'
日期: 2026-05-30
分类: projects / 前端
难度: 初级
---

## 是什么

nanostores 是一个**不到 1 KB**（当前 README：压缩后约 340 到 864 字节）的状态管理库，最大特点是**核心完全不知道 React 的存在**。日常类比：像家里只装一根总水管，下面接 React 龙头、Vue 龙头、Svelte 龙头都行——水管自己不挑龙头。

你写一份 store 文件：

```js
import { atom } from 'nanostores'
export const $counter = atom(0)
```

React 组件里 `useStore($counter)`、Vue 组件里 `useStore($counter)`、Svelte 模板里 `$$counter`——**同一个 store 实例**，跨框架共用。这是 jotai / zustand / valtio 都做不到的事，因为那三个都是 React-first 长出来的。

作者 Andrey Sitnik（GitHub 用户名 `@ai`）也是 PostCSS / Autoprefixer / Browserslist / Size Limit 的作者，由 Evil Martians 公司维护；他做工具的一贯口味是"小 + 单一职责 + 无依赖"，nanostores 把这个口味带到状态管理。

## 为什么重要

不理解 nanostores，下面这些事都没法解释：

- 为什么有人愿意为了"几百字节"专门做一个状态库——bundle size 真的有人当 KPI
- 为什么"atom 思想"会演化出至少四种实现（jotai / nanostores / valtio / signals），每一种切法都不一样
- 为什么 micro-frontend 和 Next.js RSC 这种场景会冒出"同一个库被打包成多份、状态对不上"的怪问题
- 为什么"框架无关"听起来美好，但 99% 的状态库都做不到——核心和适配器必须在一开始就分仓库

## 核心要点

nanostores 的设计可以拆成 **三件事**：

1. **三种 store，按需取用**：`atom` 存原子值（数字 / 字符串 / 对象引用）；`map` 存扁平对象，多了 `setKey` 浅比较；`computed` 是派生值，自动跟依赖。类比：原子是一个鸡蛋，map 是一盒鸡蛋（可以单独换一颗），computed 是用鸡蛋做的蛋糕（鸡蛋变了蛋糕自动重做）。

2. **核心和适配器分仓库**：`nanostores/nanostores` 只有 vanilla 核心 + 几个工具；`@nanostores/react` / `@nanostores/vue` / `@nanostores/svelte` 都是**独立 repo**。类比：iPhone 主机和耳机各自一个产品线，主机不为耳机降级。

3. **订阅粒度到单个 atom**：组件订阅哪个 atom 就只在那个 atom 变时 re-render，不像单 store + selector 那样所有人陪跑一次。类比：群聊里你只 @ 收到通知，不是群里每条消息都震动。

## 实践案例

### 案例 1：跨框架共用同一份 store

```js
// stores/counter.js（vanilla，零框架）
import { atom } from 'nanostores'
export const $count = atom(0)
export const increment = () => $count.set($count.get() + 1)
```

React 端：

```jsx
import { useStore } from '@nanostores/react'
import { $count, increment } from './stores/counter'

export const Counter = () => {
  const count = useStore($count)
  return <button onClick={increment}>{count}</button>
}
```

Vue 端**用同一份 stores/counter.js**：

```vue
<script setup>
import { useStore } from '@nanostores/vue'
import { $count, increment } from './stores/counter'
const count = useStore($count)
</script>
<template><button @click="increment">{{ count }}</button></template>
```

**逐部分解释**：`stores/counter.js` 是纯 JS，没 import 任何框架；React 和 Vue 各自的适配器把 atom 包成自己框架的响应式语法。

### 案例 2：map + computed 做派生数据

```js
import { map, computed } from 'nanostores'

export const $users = map({ alice: { admin: true }, bob: { admin: false } })
export const $admins = computed($users, users =>
  Object.entries(users).filter(([, u]) => u.admin).map(([k]) => k)
)

$users.setKey('alice', { admin: false })
// $admins 自动重算成 []
```

`setKey` 只在那一个键变了才通知；`computed` 第一次被订阅时记下依赖，依赖变了自动重算。

### 案例 3：跨打包共享状态

micro-frontend / 双打包场景里，主应用和子应用可能各自打进一份 nanostores 核心。源码把共享计数器挂在 `globalThis.nanostoresGlobal.epoch`，让**通知序号**跨打包实例对齐：

```js
// nanostores 内部（简化）
export const nanostoresGlobal = (globalThis.nanostoresGlobal ||= { epoch: 0 })
```

注意：这只共享 epoch，**不会自动把两份独立的 atom 实例合并成一个**；真正跨包共享状态，仍要把同一个 store 模块当单例导出。这是 Sitnik 工具一贯的"小问题也认真解"风格——同样边界也出现在 Next.js RSC、模块联邦、`npm link` 双装等场景。

## 踩过的坑

1. **在组件里直接 `$store.get()`**：拿到的是当下快照，store 之后再变这个组件**不会重渲染**——文档明确说 get() 只给测试和初始化用，UI 必须走 useStore 订阅。
2. **把业务逻辑写在组件里**：nanostores 鼓励把 actions / 副作用放进 store 文件（`export const login = ...`），组件只读不写；混在组件里就失去了"跨框架复用 + 单元测试"两个最大优势。
3. **atom.set 不做引用比较**：`atom.set({...obj})` 即便内容一样但是新对象引用，**仍然会触发所有订阅者 re-render**。要么用 map.setKey（带浅比较），要么自己在 set 前判等。
4. **computed 的依赖只追踪静态那些**：第一次跑时记下哪些 atom 被读了，之后条件分支里新读的 atom **不会**被自动加入依赖；需要用 batched 模式或者一开始就把依赖列出来。

## 适用 vs 不适用场景

**适用**：
- 想做**跨框架**的设计系统 / 组件库 / micro-frontend，状态层不能绑死 React
- 极度在意 bundle size 的项目（Edge function / 嵌入式 Web / 广告位脚本）
- 喜欢 atomic state 但不想被 jotai 的 React-only 限制

**不适用**：
- 应用只跑在 React 一个框架——直接用 jotai / zustand 生态更厚，工具链更熟
- 大型 SPA 需要时间旅行调试 / 中间件链 / 复杂副作用编排——Redux Toolkit 仍是工业标准
- 需要 immer 风格"直接改对象"的可变写法——那是 valtio 的强项，nanostores 是不可变路线

## 历史小故事（可跳过）

- **2010 年代**：Andrey Sitnik 在 Evil Martians 做 PostCSS / Browserslist / Autoprefixer / Size Limit，一贯口味是"小 + 单一职责 + 无依赖"
- **2020 年前后**：React 生态长出 jotai / zustand / valtio 三大 atomic 路线，但都和 React 绑定，跨框架复用基本不可能
- **2021 年**：Sitnik 发布 nanostores，押注"vanilla 核心 + 框架适配器分仓库"，README 第一行就把 bundle size 摆上台
- **2023 年前后**：Astro 文档官方推荐 nanostores 做 island 之间共享状态——这成为它在 Astro 生态的标志性使用场景
- **2026 年**：仓库 7.4k+ star，覆盖 React / Vue / Svelte / Preact / Solid / Lit / Angular 八套适配器，README 顶部写着 "Between 340 and 864 bytes"

## 学到什么

1. **bundle size 也可以是一种产品定位**——不只是性能优化，是品牌：README 顶部直接挂字节区间当广告
2. **核心和适配器要在第一天就分仓库**——后期再拆代价巨大，jotai 把 vanilla 剥出来花了几个版本，体感很痛
3. **atomic state 不止一种切法**——按依赖追踪粒度（jotai）/ 按框架解耦（nanostores）/ 按可变性（valtio）各有所长
4. **小工具也要解小问题**——globalThis epoch trick 是工程"洁癖"的表现，背后假设是"用户迟早会踩到 micro-frontend 这种边界"

## 延伸阅读

- 仓库主页：[github.com/nanostores/nanostores](https://github.com/nanostores/nanostores)
- 作者博客：[Andrey Sitnik — Evil Martians Chronicles](https://evilmartians.com/chronicles)
- 同类对照：[jotai 文档](https://jotai.org/) / [zustand 文档](https://zustand-demo.pmnd.rs/) / [valtio 文档](https://valtio.pmnd.rs/)
- [[jotai]] —— React-first atomic 切法
- [[zustand]] —— 单 store + selector 切法

## 关联

- [[jotai]] —— 同样 atomic，但绑死在 React 内（vanilla 后剥）
- [[zustand]] —— 单 store + selector，与 atomic 路线对照
- [[valtio]] —— Proxy mutate 路线，可变 vs 不可变的另一面
- [[svelte]] —— Svelte 原生 writable store 影响了 nanostores 的 `$` 命名
- [[biome]] —— 同样把"小 + 工具链一体化"做成产品口味
- [[effect]] —— 另一种"框架无关 + 强类型"的状态/副作用切法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[valtio]] —— valtio — 让 state.x++ 直接驱动 React 重渲染的 Proxy 状态库
