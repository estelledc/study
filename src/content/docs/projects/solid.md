---
title: SolidJS — 细粒度响应式 UI 框架
来源: https://github.com/solidjs/solid
日期: 2026-05-29
分类: UI 框架
难度: 中级
---

## 是什么

SolidJS 是一个**用 React 风格 JSX 但没有"重新渲染"**的前端框架。日常类比：React 是数据变了把整张菜单重写一遍再贴回墙上；Solid 是数据变了只画掉那一行换一笔——其它行根本没动过。

更技术一点说：你写一个组件函数，**它一辈子只跑一次**。函数里读到的"数据"实际上是一个个**信号**（signal），信号变了，框架直接更新订阅它的那一小段 DOM——不重跑组件、不做 virtual DOM diff。

```jsx
function Hello() {
  const [name, setName] = createSignal('Jason')
  return <h1>你好，{name()}</h1>
}
```

看起来和 React 几乎一样，但语义完全相反——`Hello` 只跑一次，`name()` 才是真正的订阅入口。

## 为什么重要

不理解 Solid，下面这些事都没法解释：

- **Benchmark 里长期前三**：JS Framework Benchmark 上常压过 React 一截，背后是"细粒度反应式 + 无 virtual DOM diff"（具体倍数随场景变，别当硬指标）
- **JSX 看起来像 React 但底层完全不同**：组件函数只跑一次这个事实改写了所有"重渲染心智"，是理解现代响应式框架的钥匙
- **和 React Compiler 同向**：2024 年 React Compiler 也在做编译期细粒度优化；社区常拿 Solid / Svelte 5 作对照，不是官方认亲声明
- **SolidStart 对标全栈路线**：同样是 SSR + 路由 + 数据加载，runtime 体积通常比 React 栈小一截

## 核心要点

Solid 的心智模型可以拆成 **三块**：

1. **信号（Signal）**：存"会变的值"的最小单位。`createSignal(0)` 返回一对 getter / setter——`count()` 读，`setCount(1)` 写。读的时候**自动登记自己是订阅者**。类比：广播电台和收音机——按下一个频道（调用 getter）就自动收到后续广播。

2. **派生（Effect / Memo）**：`createEffect` 跑副作用（拉数据、写日志、操作 DOM 之外的事），`createMemo` 算派生值（缓存计算结果）。它们都**自动追踪依赖**——你在里面读了哪些 signal，哪些变了就重跑。

3. **编译时 JSX 优化**：Solid 的编译器把 `<h1>{name()}</h1>` 拆成"一次创建 DOM + 一个订阅函数绑到那个文本节点"。没有 virtual DOM，没有 diff，只有最小订阅单位的精准更新。

## 实践案例

### 案例 1：最小计数器

```jsx
import { createSignal } from 'solid-js'

function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

**逐行解释**：

- `createSignal(0)` 返回 `[getter, setter]`——`count` 是函数，不是变量
- JSX 里 `{count()}` 调用 getter——**这一调用就把"这个文本节点"订阅到 `count`**
- 点按钮 → `setCount(...)` → Solid 通知所有订阅者 → 只更新那个文本节点
- `Counter` 函数本身**只跑了一次**，整个生命周期都不会再跑

### 案例 2：用 createEffect 追副作用

```jsx
import { createSignal, createEffect } from 'solid-js'

function Logger() {
  const [name, setName] = createSignal('Jason')
  createEffect(() => {
    console.log('name 变成了', name())
  })
  return <input value={name()} onInput={e => setName(e.target.value)} />
}
```

**三步跟读**：

1. **读了谁**：effect 里调用了 `name()` → 自动订阅 `name`
2. **谁变**：输入框 `onInput` → `setName` → signal 更新
3. **谁重跑**：只有这个 effect 重跑打日志；`Logger` 组件函数本身仍不重跑

**没有依赖数组**——读了什么就追什么，比 React `useEffect([deps])` 心智简单。

### 案例 3：嵌套 createMemo 派生

```jsx
import { createSignal, createMemo } from 'solid-js'

function Cart() {
  const [items, setItems] = createSignal([{ price: 10 }, { price: 20 }])
  const total = createMemo(() => items().reduce((s, i) => s + i.price, 0))
  const taxed = createMemo(() => total() * 1.1)
  return <div>含税总价：{taxed()}</div>
}
```

**三步跟读**：

1. **读了谁**：`total` 读 `items()`；`taxed` 读 `total()`；JSX 读 `taxed()`
2. **谁变**：`setItems(...)` 改购物车
3. **谁重跑/更新**：`total` 重算 → `taxed` 重算 → 只改那个 `<div>` 文本；整条链路**惰性 + 缓存**——没人读 `taxed()` 就不算

## 踩过的坑

1. **组件函数只跑一次，不能用 React useState 思维**：在组件函数体里写 `if (count() > 5) ...` 永远只走第一次的分支，因为函数本身不会重跑。条件渲染要用 JSX 内联表达式或 `<Show when={...}>`。

2. **必须 `count()` 调用才订阅，写 `count` 是函数引用**：`<h1>{count}</h1>` 把 getter 函数本身渲染成字符串，不会订阅。新人最常见的报错来源。

3. **JSX 块外面解构 props 会丢响应式**：`function Foo(props) { const { x } = props; return <p>{x}</p> }`——`x` 一旦解构出来就是普通值，丢了 props 的 getter 代理，再变也不会更新。要写 `props.x` 或用官方的 `splitProps` / `mergeProps`。

4. **与 React 库不兼容，生态小很多**：React 表单、动画、状态管理库（`react-hook-form`、`framer-motion`、`zustand`）都不能直接用——Solid 有自己的对应物（`solid-forms`、`@motionone/solid`），但数量级少一两个。选 Solid 等于选一个更小的生态。

## 适用 vs 不适用场景

**适用**：

- 性能敏感的复杂界面（dashboard / 实时数据 / 编辑器）—— 细粒度更新优势明显
- 嵌入式 / 小体积场景 —— Solid runtime 比 React 小一个数量级（约 7KB gzip）
- 想体验"现代响应式"心智的学习项目 —— 比 React 更直接、更接近 Vue 3 的 Composition API
- SSR + 路由的中型应用 —— SolidStart 提供完整的 [[vite]] 集成方案

**不适用**：

- 团队已经全员熟 React —— 切换成本高，且 Solid 招聘市场远小于 React
- 重度依赖现成 React 库（`shadcn-ui` / `react-spring` 等）—— 在 Solid 里要找替代或自己写
- 静态营销页 —— 用 Astro / 11ty 更合适，Solid 的反应式优势用不上
- 团队还不熟"信号"心智 —— 解构丢响应式这种坑会反复踩，比 React 更需要训练

## 历史小故事（可跳过）

- **2018 年**：Ryan Carniato 在工作中维护一个老 Knockout.js 项目，受其细粒度反应式启发，业余时间开始造 Solid 原型
- **2019 年 1 月**：Solid 0.9 发布，第一次进入 JS Framework Benchmark 视野，性能榜单前三
- **2021 年 6 月**：Solid 1.0 正式发布，API 稳定，社区开始增长
- **2022 年 8 月**：SolidStart 公布，对标 Next.js / Remix，把 Solid 从"组件库"变成"全栈框架"
- **2024 年**：React Compiler 公开，被普遍认为吸收了 Solid / Svelte 5 这一派"编译期细粒度追踪"的思路

## 学到什么

1. **响应式不一定要靠"重渲染"**：React 的"数据变 → 函数重跑 → diff DOM"只是一种实现，Solid 证明了"数据变 → 直接通知订阅者 → 改 DOM"是可行且更快的另一条路
2. **信号是过去 5 年最重要的前端概念**：Vue 3 的 `ref`、Svelte 5 的 `$state`、Angular 的 `signal()`、Preact 的 `signal`——本质都是 Solid 这套思路的近亲
3. **JSX 不等于 React**：JSX 只是语法，背后的语义（每次重跑 vs 只跑一次）由编译器和 runtime 共同决定
4. **小生态的代价是真实的**：性能优势不能直接翻译成生产力，团队选型要权衡"框架性能 + 生态成熟度 + 招聘"三件事

## 延伸阅读

- 官方文档：[solidjs.com](https://www.solidjs.com)（教程互动式，1 小时跑通核心 API）
- 作者讲设计思路：[Ryan Carniato — Building SolidJS](https://www.youtube.com/watch?v=J70HXl1KhWE)（90 分钟从零讲反应式系统）
- 性能对比：[JS Framework Benchmark](https://krausest.github.io/js-framework-benchmark/current.html)（每次发版都更新，Solid 长期前三）
- 信号思想综述：[Ryan Carniato — A Hands-on Introduction to Fine-Grained Reactivity](https://dev.to/this-is-learning/a-hands-on-introduction-to-fine-grained-reactivity-3ndf)
- [[react]] —— 对比阅读价值最高，理解"重渲染 vs 细粒度"两条路线
- [[vue]] —— Vue 3 的 ref / reactive 和 Solid 信号思想接近，是另一种工业级实现

## 关联

- [[react]] —— 同样的 JSX 语法，相反的执行模型；理解 Solid 必先对比 React
- [[vue]] —— Vue 3 Composition API 与 Solid 信号心智高度相似
- [[vite]] —— SolidStart 默认构建工具，Solid 编译插件就是 Vite plugin
- [[mobx]] —— React 生态里的"信号派"实现，思路和 Solid 一致但寄生在重渲染框架上
- [[zustand]] —— React 状态管理，Solid 因有 signal 不需要这类库
- [[tanstack-query]] —— Solid 也能用（有 `@tanstack/solid-query` 端口），是少数跨框架的好库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[parnas-information-hiding-1972]] —— Parnas 信息隐藏 1972 — 模块化设计原则
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[mobx]] —— MobX — 让 state 像电子表格一样自动重算
- [[qwik]] —— Qwik — Resumable UI 框架
- [[svelte]] —— Svelte — 编译时 UI 框架
