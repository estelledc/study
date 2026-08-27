---
title: Svelte — 编译时 UI 框架
来源: https://github.com/sveltejs/svelte
日期: 2026-08-27
分类: UI 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sveltejs/svelte
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 56a036f4ce873a24ee6631a06d03d372523d7a9b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.56.10
---

## 是什么

Svelte 是一套**编译器把 `.svelte` 编成模块、运行时用 signal 更新 DOM**的 UI 框架。日常类比：不是同声传译（运行时 diff 整棵树），而是先写好剧本，舞台上仍有灯光师（signal / effect / batch）按线索开关灯。

固定 `5.56.10` 里，你写：

```svelte
<script>
  let count = $state(0)
</script>
<button onclick={() => count++}>{count}</button>
```

`$state` / `$derived` / `$effect` / `$props` 是编译期 rune，不是可 import 的运行时函数。DEV 下在普通 JS 里读这些全局名会抛「rune outside svelte」。编译器 `compile()` 走 parse → analyze → transform，产物调用 `source` / `derived` / `user_effect` 和 DOM 操作，而不是虚拟 DOM reconciler。

## 为什么重要

旧印象「Svelte = 零运行时、顶层 `let` 自动响应」对不上固定 5.x：

- 为什么 `let count = 0` 在 runes 模式不再自动响应，必须 `$state`
- 为什么对象 `$state` 里 `arr.push(x)` 能更新——运行时 `proxy()` 给 Array/Object 做了 per-key signal
- 为什么组件外的孤儿 `$effect` 会抛错
- 为什么默认导出在 worker/Node 走 `index-server.js`，浏览器才走 `index-client.js`

## 核心要点

固定版本可以拆成四层：

1. **编译器**：`compile(source, options)` 去掉 BOM，校验选项，parse 后 `analyze_component`，再 `transform_component`。`compileModule` 给普通 JS 里的 rune 用。产物导出组件，不导出 vnode 树。

2. **signal 源**：`$state` 编成 `state()` / `source()`。对象和数组经 `proxy()`：已带 `STATE_SYMBOL`、非纯 Object/Array 原型的值不包。每个 key 一个 Source；`push` 这类变异走代理，不再要求「整段赋值才更新」。

3. **派生与 effect**：`$derived` 编成懒计算的 `derived()`，带 DIRTY 标记。`$effect` 走 `user_effect`：先 `validate_effect`，没有 `active_effect` 当孤儿拒绝；组件未挂载时的顶层 effect 会推进 `component_context.e`，挂载后再跑。另有 `$effect.pre`、`$effect.root`。

4. **props**：`$props()` 编成带 flag 的 getter（bindable / immutable / runes / updated / lazy initial）。`const { x, ...rest } = $props()` 的 rest 是只读 Proxy，赋值在 DEV 报错。Svelte 4 的 `export let` 仍在 legacy 入口。

## 实践示例

### 案例 1：Svelte 5 计数器

```svelte
<script>
  let count = $state(0)
  let doubled = $derived(count * 2)
</script>
<button onclick={() => count++}>{count} / {doubled}</button>
```

`onclick` 是原生事件名，不是 Svelte 4 的 `on:click`。`count++` 能更新，因为编译器把赋值编成 `set(source, value)`。

### 案例 2：对象 state 的变异

```svelte
<script>
  let todos = $state([{ id: 1, text: 'read source' }])
  function add() { todos.push({ id: 2, text: 'compile' }) }
</script>
<button onclick={add}>{todos.length}</button>
```

`proxy()` 只包 `Object` / `Array` 原型。`new Map()` 或 class 实例放进 `$state` 不会自动获得深层代理。

### 案例 3：props 与 bindable

```svelte
<script>
  let { name, count = $bindable(0) } = $props()
</script>
<p>{name}</p>
<button onclick={() => count++}>{count}</button>
```

普通 prop 默认单向。`$bindable` 才允许子组件写回；父级要用 `bind:count`。没有 bind 时，子组件自增不会改父级变量。

## 踩过的坑

1. **把 Svelte 5 写成「没有运行时」**：固定包导出完整 client runtime（signal、batch、DOM）。编译器去掉的是 vdom，不是全部 runtime。
2. **在模块顶层或普通 `.js` 里写 `$effect`**：`validate_effect` 要求已有 `active_effect`，否则 `effect_orphan`。
3. **拿 Svelte 4 教程抄 5**：`export let`、`on:click`、`$: ` 属于 legacy；runes 模式默认不走那条链。
4. **以为任意对象都是深层响应**：`proxy()` 拒绝 class / Map / 已代理值。

## 适用 vs 不适用场景

**适用**：

- 愿意用编译器换「无 vnode diff」的更新模型
- 新项目直接写 runes，而不是混用 4/5 语法
- 需要同一套编译器同时出 client / server 模块

**不适用**：

- 团队合同是 React Hook / JSX，且没有迁移预算 → [[react]]
- 需要运行时模板编译、CDN 一行引入完整编译器 → 对照 [[vue]] 的 runtime+compiler 构建
- 要把「比 React 小一半」写成事实 → 本轮未测 bundle

## 固定版本边界

- 本文绑定 `sveltejs/svelte@56a036f4...`（tag `svelte@5.56.10` 的 peel），`packages/svelte` 版本为 `5.56.10`。
- npm `svelte@5.56.10` 未暴露 `gitHead`；以 annotated tag peel 为溯源锚点。
- 包 `engines.node` 为 `>=18`；默认导出按条件选择 client/server。
- 仍提供 `./legacy` 与 `./internal/flags/legacy`。本文主线是 runes，不把 legacy 当默认。
- 本文只做源码静态审查，未安装依赖、未跑上游测试或浏览器渲染，状态保持 `UNVERIFIED`。

## 学到什么

1. **编译时分析不等于零运行时**——Svelte 5 把「谁依赖谁」编进产物，执行时仍有 signal 图。
2. **rune 是语法，不是库函数**——离开 `.svelte` / `compileModule` 就没有 `$state`。
3. **对象响应式是 opt-in Proxy**——只覆盖纯对象和数组。
4. **legacy 与 runes 是两条编译链**——版本号升到 5 不会自动改旧语法的语义。

## 应用型自测

1. 在 Svelte 5 runes 组件里写 `let count = 0` 再 `count++`，按钮上的数字会变吗？
2. 组件外的普通模块顶层调用 `$effect(() => {})`，固定 5.56.10 会怎样？
3. `let items = $state([])` 后执行 `items.push(1)`，需要再写 `items = items` 吗？

检查点：

1. 不会。runes 模式必须 `$state` 才创建 Source。
2. 抛孤儿 effect。`$effect` 只能活在已有 `active_effect` 的组件树里。
3. 不必。Array 被 `proxy()` 后，`push` 会碰到对应 key 的 Source。

## 延伸阅读

- 官方教程：[learn.svelte.dev](https://learn.svelte.dev/)
- 固定源码：[sveltejs/svelte](https://github.com/sveltejs/svelte) —— 本文绑定提交 `56a036f4ce873a24ee6631a06d03d372523d7a9b`
- signal 源：[sources.js](https://github.com/sveltejs/svelte/blob/56a036f4ce873a24ee6631a06d03d372523d7a9b/packages/svelte/src/internal/client/reactivity/sources.js)
- 对象代理：[proxy.js](https://github.com/sveltejs/svelte/blob/56a036f4ce873a24ee6631a06d03d372523d7a9b/packages/svelte/src/internal/client/proxy.js)
- [[vue]] —— 同样 SFC，但运行时是 Proxy + vnode
- [[solid]] —— 细粒度信号，无 Svelte 那种单文件编译约定
- [[sveltekit]] —— 全栈框架，不在本页合同内

## 关联

- [[react]] —— 运行时 vdom vs 编译产物 + signal
- [[vue]] —— SFC 同源，响应式靠运行时 Proxy 与调度队列
- [[solid]] —— 都用细粒度信号，但 Solid 不靠 `.svelte` 编译约定
- [[vite]] —— SvelteKit 默认构建工具
- [[typescript]] —— `<script lang="ts">` 由编译器剥类型后再变换

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[gradio]] —— Gradio — ML 模型 demo 框架
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[next-js]] —— Next.js — React 全栈框架
- [[qwik]] —— Qwik — Resumable UI 框架
- [[sveltekit]] —— SvelteKit — Svelte 全栈框架
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
- [[vue]] —— Vue.js — 渐进式 UI 框架
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
