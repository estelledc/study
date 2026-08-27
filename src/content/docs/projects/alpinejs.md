---
title: Alpine.js — 在 HTML 上长出一块本地响应式
description: 用 x-data 指令和 Vue reactivity 在 HTML 上挂本地响应式状态的 HTML-first 库。
来源: https://github.com/alpinejs/alpine
日期: 2026-08-27
分类: HTML-first
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/alpinejs/alpine
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 518a7f4c525e56085bb48fbe11c60a1f87100b6a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.16.3
---

## 是什么

Alpine.js 是一个**把响应式状态和指令写进 HTML 属性**的浏览器库。日常类比：像给静态标签贴便利贴——`x-data` 声明这块的本地状态，`x-on` / `x-text` / `x-show` 告诉它怎么跟着变，不必先搭组件树。

你写：

```html
<div x-data="{ open: false }">
  <button @click="open = !open">切换</button>
  <p x-show="open">看见我了</p>
</div>
```

固定 `3.16.3` 的核心包是 `packages/alpinejs`。响应式引擎来自依赖 `@vue/reactivity@~3.5.40`；CDN 入口把 `Alpine` 挂到 `window`，再用 `queueMicrotask(() => Alpine.start())` 启动。`@click` 只是属性变换：`@` 被映射成 `x-on:`。

## 为什么重要

不理解 Alpine 的指令顺序和求值方式，下面这些事会踩坑：

- 为什么 `x-data` 必须先于 `x-for` / `x-show`：指令按固定优先级排队，不是 HTML 属性书写顺序
- 为什么表达式能直接写 `open = !open`：求值器生成 `with (scope)` 的 `AsyncFunction`
- 为什么和 [[htmx]] 能叠在同一段 HTML 上：Alpine 管本地状态，htmx 管换进来的新标记
- 为什么 `x-collapse` / `x-trap` 会警告找不到指令：这些是独立 plugin，不在核心包

## 核心要点

固定源码的启动和更新可以拆成四步：

1. **`Alpine.start()`**：若已 start 会警告；没有 `document.body` 也会警告。先发 `alpine:init` / `alpine:initializing`，再观察 DOM 变更，对 `[x-data]` 根节点 `initTree`，最后发 `alpine:initialized`。CDN 构建用 microtask 自动 start，模块入口不会。

2. **`x-data` 建响应式根**：空表达式当成 `{}`；`evaluate` 出的对象交给 `reactive()`。根选择器就是 `[x-data]`。对象上的 `init` / `destroy` 会在挂上和清理时被求值。

3. **指令按 `directiveOrder` 跑**：`ignore → ref → id → data → anchor → bind → init → for → model → modelable → transition → show → if → DEFAULT → teleport`。`x-on`、`x-text` 等未点名的指令走 `DEFAULT`，因此晚于 `x-data` / `x-for`。

4. **表达式进 `with (scope)`**：`normalEvaluator` 把 magics 和最近的 `_x_dataStack` 合成 scope，再用 memo 过的 `AsyncFunction` 执行。以 `if (` 或 `let`/`const` 开头的字符串会被包进 async IIFE。副作用默认再被自动调用一次。

`x-model` 默认听 `input`；只有 `.change` / `.lazy` / `.blur` / `.enter` 才改事件。`x-for` 用 `Map` 按 key 复用节点，数字、`Set`、`Map` 都会先被规范化；它的 effect 带 `priority: 'structural'`。

## 实践示例

### 案例 1：本地开关，不必组件文件

```html
<div x-data="{ open: false }">
  <button x-on:click="open = !open">菜单</button>
  <nav x-show="open" x-cloak>…</nav>
</div>
```

`x-data` 先把 `{ open: false }` 变成 Vue reactivity 代理并挂到节点 scope。`x-on` 在 DEFAULT 阶段注册监听，表达式在按钮的 data stack 里赋值。`x-cloak` 只是启动后去掉属性。

### 案例 2：x-model 默认跟 input，不跟 change

```html
<div x-data="{ q: '' }">
  <input x-model="q" />
  <p x-text="q"></p>
</div>
```

没有 `.lazy` / `.change` 时，`x-model` 绑的是输入过程，不是失焦后的 `change`。单选按钮如果没写 `name`，固定实现会用表达式字符串补一个共享 `name`。

### 案例 3：x-for 按 key 复用，而不是每次重绘

```html
<template x-for="item in items" :key="item.id">
  <li x-text="item.name"></li>
</template>
```

`x-for` 把 key 表达式存成 `el._x_keyExpression`，用 `Map` 把旧节点搬到新 lookup；没被复用的节点 `destroyTree` 后删除。`:key` 是 `x-bind:key` 的短写，必须是字符串或整数，对象 key 会警告。

## 踩过的坑

1. **把 plugin 指令当成核心**：`x-collapse`、`x-intersect`、`x-trap`、`x-mask` 在核心里只注册“没装 plugin”的警告。`start()` 还会探 `x-dialog` / `x-anchor` / `x-sort`。
2. **模块导入不会自动 start**：CDN 才 `queueMicrotask(Alpine.start)`；bundler 路径要自己调一次，且不能调两次。
3. **`x-for` 写在非 `<template>` 上**：实现按模板节点做 lookup/clone，普通元素不是这条路径。
4. **表达式能碰到 `with` 作用域里的意外名字**：求值器就是 `with (scope)`，magics 和 data stack 都在里面。
5. **`Alpine.watch` 对对象用 JSON 快照**：深层变更靠 `JSON.stringify`；循环引用或不可序列化值不是这条 API 的合同。

## 适用 vs 不适用场景

**适用**：

- 服务端 HTML 或 [[htmx]] 换进来的片段，需要一小块本地交互
- 开关、tabs、轻量表单，状态能放进 `x-data`
- 想用 Vue 同系 reactivity，但不想上组件构建链

**不适用**：

- 需要 CSP 且不能 `new Function`——应走单独的 `@alpinejs/csp`，不是默认 evaluator
- 对话框、锚点定位、拖拽排序——这些在 3.16.3 是 plugin，不在核心
- 大型 SPA 路由与构建期组件图——这不是 Alpine 的单位
- 把 Livewire/morph 的 clone 语义当成普通 `x-data` 初始化——clone 路径会跳过已有 `data-has-alpine-state`

## 固定版本边界

- 本文绑定 `alpinejs/alpine@518a7f4c...`，tag `v3.16.3`，package `alpinejs@3.16.3`；npm `gitHead` 与 tag 一致。
- 核心依赖 `@vue/reactivity@~3.5.40`。同提交还有 `collapse` / `intersect` / `focus` / `mask` / `persist` / `morph` / `sort` / `anchor` / `resize` / `ui` 等 workspace 包，本文只约束核心。
- `@alpinejs/history` 仍标 `3.0.0-alpha.0`，`@alpinejs/navigate` 仍标 `3.10.2`，不能从 3.16.3 核心版本外推。
- CDN 自动 `start()`；ESM/CJS 入口不自动 start。
- 本文未安装依赖、未跑 Cypress/Vitest、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **HTML 指令也有调度顺序**——看起来“写在标签上”，实际按 `directiveOrder` 初始化。
2. **响应式可以外置**：Alpine 3.16.3 自己不实现依赖收集，核心是包一层 Vue reactivity + 自有 scheduler。
3. **求值器决定安全边界**：`with` + `AsyncFunction` 换来短表达式，也换来 CSP 与意外名字。
4. **核心和 plugin 必须分开读版本**：workspace 里不是每个包都是 3.16.3。

## 应用型自测

1. CDN 构建里，`Alpine.start()` 是谁调用的？再调用一次会怎样？
2. 同一元素上同时有 `x-data` 和 `x-on:click`，哪个先初始化？
3. `<input x-model="q">` 没写修饰符，默认监听的是 `change` 还是 `input`？

检查点：

1. CDN 用 `queueMicrotask` 自动调用；第二次 `start()` 会警告“已经初始化”。
2. `data` 在 `directiveOrder` 里先于 `DEFAULT`，所以 `x-data` 先于 `x-on`。
3. `input`。只有 `.change` / `.lazy` / `.blur` / `.enter` 才改事件。

## 延伸阅读

- 文档：[alpinejs.dev](https://alpinejs.dev/)
- 固定源码：[alpinejs/alpine](https://github.com/alpinejs/alpine) —— 本文绑定提交 `518a7f4c525e56085bb48fbe11c60a1f87100b6a`
- [[htmx]] —— 负责把新 HTML 换进来，不提供 `x-data`
- [[vue]] —— Alpine 3.16.3 的 reactivity 来自 `@vue/reactivity`

## 关联

- [[htmx]] —— 请求/换 DOM；Alpine 处理换进来之后的本地交互
- [[vue]] —— 同一套 reactivity 包，但是完整框架
- [[phoenix]] —— 服务端持有 UI 状态，和 Alpine 的节点本地状态相反
- [[svelte]] —— 编译期响应式，对比 Alpine 的运行时指令

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[htmx]] —— htmx — 用 HTML 属性发请求、换 DOM
