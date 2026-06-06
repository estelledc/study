---
title: Svelte — 编译时 UI 框架
来源: https://github.com/sveltejs/svelte
日期: 2026-05-29
子分类: UI 框架
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Svelte 是一套**让组件代码在编译时直接转成精确操作 DOM 的 JS、不带运行时虚拟 DOM**的 UI 框架。日常类比：[[react]] 像**同声传译**——演讲者每说一句，翻译实时把它转成另一种语言；Svelte 像**提前写好剧本**——演出前每一句台词、每一个动作都已经定好，舞台上不需要现场翻译。

具体讲就是：你写

```svelte
<script>
  let count = 0
</script>

<button on:click={() => count++}>{count}</button>
```

Svelte 编译器会把它转成一段**直接操作 DOM 的 JS**——大致是 `button.textContent = count`。运行时没有 diff、没有 vdom、没有 reconciler，只有针对这段代码生成的精确指令。

## 为什么重要

- **打包体积比 [[react]] 小一半甚至更多**——因为没有运行时框架要塞进 bundle，只塞编译产物
- **写法接近原生 HTML/CSS/JS**——`.svelte` 文件就是带 `<script>` 的 HTML，新人零门槛
- **Svelte 5 推出 runes（`$state` / `$derived` / `$effect`）**——把响应式拉到与 [[solid]] 同级的细粒度
- **SvelteKit 是 Next.js 的强力替代**——同一个仓库覆盖 SSR / SSG / SPA / Edge，配置量小

## 核心要点

Svelte 学习曲线可以拆成 **三块**：

1. **编译时响应式（compile-time reactivity）**：[[react]] / [[vue]] 在浏览器里跑一个运行时去追踪谁改了谁、然后 diff 虚拟 DOM；Svelte 在**编译阶段**就分析出"`count` 一变就要改这段文本节点"，直接生成对应代码。运行时只是执行剧本，不再做推理。

2. **`.svelte` 单文件组件**：和 [[vue]] 的 SFC 思路一样，一个文件三段式——`<script>` 写逻辑、`<template>`（直接写 HTML，不用包裹）、`<style>` 写样式（默认 scoped）。比 Vue 还少一层 `<template>` 标签。

3. **Svelte 5 runes**：用 `$state(0)` 替代 Svelte 4 的"顶层 `let` 自动响应"，用 `$derived(...)` 替代 `$:` 标签。这一步把响应式从"语法糖"明确成"显式 API"，跟 [[solid]] 的 signals 思路对齐，可读性和可推理性都更好。

## 实践案例

### 案例 1：计数器 .svelte（Svelte 4 写法）

```svelte
<script>
  let count = 0
</script>

<button on:click={() => count++}>点了 {count} 次</button>
```

**逐部分解释**：

- 顶层 `let count = 0` 在 Svelte 4 里**自动是响应式的**——编译器看到 `let` 声明就生成订阅/重渲染代码
- `on:click={...}` 是事件绑定语法，对应 DOM 的 `addEventListener`
- `{count}` 是大括号插值，把变量直接放进 HTML 里
- 没有 import、没有组件包裹，**这就是一个完整组件**

### 案例 2：Svelte 5 runes 写法（同样的计数器）

```svelte
<script>
  let count = $state(0)
</script>

<button onclick={() => count++}>点了 {count} 次</button>
```

**关键差异**：

- `let count = 0` 不再自动响应，必须显式 `$state(0)` 才有响应式
- 事件名用原生 `onclick`，不再用 `on:click` 冒号语法
- 派生值用 `let doubled = $derived(count * 2)`；副作用用 `$effect(() => console.log(count))`
- runes 的好处：响应式来源**写出来就能看见**，不像 Svelte 4 要靠"哪里有 `let`"心里默算

### 案例 3：父子组件 + props

```svelte
<!-- Parent.svelte -->
<script>
  import Child from './Child.svelte'
  let name = 'Jason'
</script>

<Child {name} />

<!-- Child.svelte (Svelte 4) -->
<script>
  export let name
</script>

<p>Hello {name}</p>
```

**`export let name`** 不是真的导出——Svelte 把它**重新定义**为"对外接收的 prop"。Svelte 5 改成 `let { name } = $props()`，更接近 JS 解构习惯。

## 踩过的坑

1. **Svelte 4 和 Svelte 5 语法不兼容**：runes 是 5 才有；`on:click` vs `onclick` / `export let` vs `$props()` / `$:` vs `$derived` 都改了。看教程要先确认版本，别拿 4 的代码在 5 项目里抄。

2. **响应式只在赋值时触发**（Svelte 4 痛点）：`arr.push(x)` **不会**触发更新，因为 `arr` 引用没变。要写 `arr = [...arr, x]` 或赋值后 `arr = arr` 强行触发。Svelte 5 的 `$state` 用 Proxy 解决了这个问题，深层修改也能响应。

3. **store 使用模式与 [[react]] Hook 不同**：Svelte 的 `writable()` store 用 `$store` 自动订阅+解包（在模板和 `<script>` 里都行），不需要 `useState` / `useContext`。从 React 来的人常误以为要手动订阅，写了一堆冗余 `subscribe()`。

4. **SSR 水合（hydration）不一致常见原因**：服务端渲的 HTML 和客户端首次渲不一致就会 mismatch。常见根因——日期/随机数（`new Date()` 服务端和客户端时间不同）、浏览器专属 API（`window.innerWidth`）、第三方库非确定性输出。修法：把这类逻辑放进 `onMount` 或用 `browser` 守卫。

## 适用 vs 不适用场景

**适用**：

- 包体积敏感场景（嵌入式页面 / 营销页 / 移动端弱网用户）
- 中小型项目（学习成本低、SvelteKit 一站式）
- 偏内容站 / 静态站（SvelteKit + adapter-static 比 Next 简洁）
- 想要 [[solid]] 级别细粒度响应又不想丢 SFC 体验

**不适用**：

- 团队和招聘池都是 [[react]] 背景（生态/招人都难）
- 复杂中后台 + 大型组件库需求（Element Plus / Ant Design 这种 Svelte 生态没有同等品）
- 极度依赖 React Native 之类跨端方案（Svelte Native 不活跃）
- 需要海量第三方 hooks/integration（npm 上 Svelte 库 ≈ React 的 1/10）

## 历史小故事（可跳过）

- **2016 年**：Rich Harris 在 The Guardian 做交互新闻图表，想要"零运行时框架"——把响应式逻辑编译进产物。Svelte 1 发布。
- **2019 年**：Svelte 3 发布，引入"顶层 `let` 自动响应式"，写法极简，社区破圈。
- **2020 年**：Stack Overflow 调查里 Svelte 成为"最受喜爱的前端框架"。
- **2021 年**：Vercel 雇佣 Rich Harris 全职做 Svelte / SvelteKit。
- **2024 年**：Svelte 5 发布，引入 runes，把响应式从"语法糖"显式化，对齐 [[solid]] 思路；同时保留兼容模式让老项目慢慢迁。

## 学到什么

1. **编译时 vs 运行时是个真二选一**——把工作挪到编译阶段，运行时就能更小更快；代价是构建链更复杂、调试要看编译产物
2. **响应式的 API 形态会回潮**：从"自动魔法（Svelte 4）"到"显式 runes（Svelte 5）"，社区逐渐承认魔法读不懂、追错难
3. **SFC 是新人友好度的天花板**：Vue / Svelte 都靠这个吃下了大量零基础学习者，单文件三段式比 JSX + CSS-in-JS 直观很多
4. **框架轻不等于生态轻**：SvelteKit 把路由、SSR、数据加载、表单都内置了，体积仍然比 Next 小——靠的是编译时砍掉运行时

## 延伸阅读

- 官方教程：[Svelte Tutorial](https://learn.svelte.dev/)（浏览器里互动学，质量极高）
- Svelte 5 迁移指南：[Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)（runes 改了哪些）
- 演讲：[Rich Harris — Rethinking Reactivity](https://www.youtube.com/watch?v=AdNJ3fydeao)（Svelte 思路总览，1 小时）
- [[vite]] —— SvelteKit 默认构建工具
- [[vue]] —— SFC 思路同源，可对比响应式实现差异

## 关联

- [[react]] —— 同代竞品，运行时 vdom vs 编译时直接 DOM
- [[vue]] —— SFC 同思路，但响应式靠运行时 Proxy
- [[solid]] —— 都用细粒度响应式（signals / runes），无 vdom
- [[vite]] —— SvelteKit 官方构建工具
- [[typescript]] —— Svelte 原生支持 TS，`<script lang="ts">` 即可

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[gradio]] —— Gradio — ML 模型 demo 框架
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[next-js]] —— Next.js — React 全栈框架
- [[qwik]] —— Qwik — Resumable UI 框架
- [[react]] —— React UI 组件库
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[sveltekit]] —— SvelteKit — Svelte 全栈框架
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vue]] —— Vue.js — 渐进式 UI 框架
- [[wails]] —— Wails — 用 Go 写后端、Web 写 UI 的跨平台桌面框架
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来

