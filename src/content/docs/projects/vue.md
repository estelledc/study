---
title: Vue.js — 渐进式 UI 框架
来源: https://github.com/vuejs/core
日期: 2026-08-27
分类: UI 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vuejs/core
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d63616ca17de965ed32dcb449a4c5cd9982f15d2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.5.42
---

## 是什么

Vue 是一套**模板 + 运行时响应式 + 虚拟 DOM 渲染**的渐进式 UI 框架。日常类比：像会盯着账本改看板的助理——你改账本上的数字，看板对应格子跟着变；助理自己决定何时批量改、改哪一格。

固定 `3.5.42` 里，你写：

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>
<template>
  <button @click="count++">{{ count }}</button>
</template>
```

`<script setup>` 由 `@vue/compiler-sfc` 编成 `setup()`。`ref(0)` 返回带 `.value` 的盒子：读取时 `Dep.track()`，赋值且 `hasChanged` 时 `Dep.trigger()`。对象值会再包一层 `reactive()` Proxy。模板里的 `count` 会被编译器拆盒子；脚本里必须写 `count.value`。

## 为什么重要

不按固定源码读，下面这些说法会对不上：

- 为什么「改了数据页面就变」不是同步立刻画完，而是先入调度队列、再 `nextTick`
- 为什么 `let state = reactive(obj)` 之后 `state = other` 会丢掉 Proxy，而 `state.count++` 不会
- 为什么 `<script setup>` 看起来没有 `setup`，运行时却走 `setupStatefulComponent`
- 为什么 `defineModel` 不是魔法双向绑定，而是 `useModel` 对 props / `onUpdate:` 的桥

## 核心要点

固定版本的主链可以拆成四层：

1. **响应式核**：`RefImpl` 用独立 `Dep` 做 get/set；`reactive()` 对 Object/Array 用 `baseHandlers`，对 Map/Set 用 `collectionHandlers`，并用 WeakMap 缓存同一 target 的 Proxy。不可扩展、带 `SKIP` 或非对象会原样返回。

2. **组件装配**：`setupComponent` 先 `initProps` / `initSlots`，再调用 `setup`。`setup` 执行期间 `pauseTracking()`；`setup.length > 1` 才创建 setup context。`setup` 返回 Promise 时，没有 `<Suspense>` 不能完成渲染。

3. **调度**：`queueJob` 按组件 id 二分插入，父先于子；`nextTick` 挂到当前 flush Promise，没有 flush 时用 `Promise.resolve()`。

4. **3.5 辅助 API**：`useId()` 按实例 `ids` 计数；async setup / `serverPrefetch` 会 `markAsyncBoundary`。`useTemplateRef(key)` 把 `shallowRef` 接到 `instance.refs`。`hydrateOnIdle` / `hydrateOnVisible` 是惰性水合策略，不是默认水合。

## 实践示例

### 案例 1：ref 与模板拆盒

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
function inc() { count.value++ }
</script>
<template>
  <button @click="inc">{{ count }}</button>
</template>
```

脚本必须 `.value`；模板插值由编译器 unwrap。`count++` 写在脚本里不会改盒子里的数字。

### 案例 2：defineModel 对 props 的桥

```vue
<script setup>
const model = defineModel({ type: String, default: '' })
</script>
<template>
  <input v-model="model" />
</template>
```

`defineModel` 由 compiler-sfc 登记 props，运行时落到 `useModel`：`watchSyncEffect` 跟 props，setter 在父级传了 `onUpdate:` 时 emit，否则只改本地。没有父级 `v-model` 时，它不是「自动同步到父组件」。

### 案例 3：v-show 只改 display

`v-show` 在 `runtime-dom` 里把原 `display` 存到元素 symbol，隐藏时写成 `none`，并不卸载 vnode。需要销毁/重建用 `v-if`。

## 踩过的坑

1. **把响应式写成「立刻重绘」**：trigger 只通知订阅者；组件更新要等 `queueJob`。
2. **整对象替换丢掉 Proxy**：`reactive()` 包的是原对象。换绑定等于丢掉那层代理。
3. **async setup 没有 Suspense**：固定源码会把 Promise 挂到 `instance.asyncDep`，并警告缺少边界。
4. **把 `useId` 当全局随机数**：它依赖当前实例；实例外调用在 DEV 警告并返回空串。

## 适用 vs 不适用场景

**适用**：

- 模板 SFC、渐进接入已有页面
- 需要 compiler-sfc、Vue Router / Pinia / Nuxt 这一层生态约定
- 要看清响应式、调度与水合边界，而不是只抄教程语法

**不适用**：

- 必须无虚拟 DOM、由编译器直接写 DOM 指令 → 对照 [[svelte]]
- 必须函数组件 + Hook 调用顺序合同 → 对照 [[react]]
- 要把「更小 / 更快 / 生态更大」写成事实 → 本轮未测 bundle 或下载量

## 固定版本边界

- 本文绑定 `vuejs/core@d63616ca...`，`vue` / `@vue/reactivity` / `@vue/runtime-core` 均为 `3.5.42`。
- npm `vue@3.5.42` 未暴露 `gitHead`；GitHub tag `v3.5.42` 是指向该提交的轻量 tag。
- 默认导出走 runtime ESM；完整编译器、SFC、SSR 是子路径，不是同一个 entry。
- 本文只做源码静态审查，未安装依赖、未跑上游测试或浏览器渲染，状态保持 `UNVERIFIED`。

## 学到什么

1. **响应式和渲染是两段**：track/trigger 只记账，真正画页面走 scheduler。
2. **SFC 语法糖会消失**：`<script setup>` / `defineModel` 编译后仍是 `setup` + props/emit。
3. **Proxy 的身份在对象上，不在变量名上**：换绑定就换身份。
4. **3.5 的 useId / 惰性水合是显式 API**，不是「升级后自动获得」的默认行为。

## 应用型自测

1. 在 `<script setup>` 里写 `count++`（`count` 是 `ref(0)`），按钮上的数字会加一吗？
2. `const state = reactive({ n: 1 })` 之后执行 `state = { n: 2 }`，界面还会跟着 `n` 变吗？
3. `setup()` 返回 Promise，父树没有 `<Suspense>`。固定 3.5.42 会完成首次渲染吗？

检查点：

1. 不会。脚本里的 `count` 是盒子，必须 `count.value++`。
2. 不会。新对象没有原来的 Proxy；应改字段或 `Object.assign`。
3. 不会完成。Promise 会挂到 `asyncDep`，需要 Suspense 才能继续。

## 延伸阅读

- 官方文档：[vuejs.org](https://vuejs.org/)
- 固定源码：[vuejs/core](https://github.com/vuejs/core) —— 本文绑定提交 `d63616ca17de965ed32dcb449a4c5cd9982f15d2`
- `RefImpl` 读写：[ref.ts](https://github.com/vuejs/core/blob/d63616ca17de965ed32dcb449a4c5cd9982f15d2/packages/reactivity/src/ref.ts)
- `useModel`：[useModel.ts](https://github.com/vuejs/core/blob/d63616ca17de965ed32dcb449a4c5cd9982f15d2/packages/runtime-core/src/helpers/useModel.ts)
- [[svelte]] —— 编译期分析 + 运行时 signal，对照 Vue 的 Proxy + vnode
- [[vite]] —— Vue 官方脚手架默认构建工具
- [[nuxt]] —— Vue 全栈框架，不在本页合同内

## 关联

- [[react]] —— 运行时 vdom，但状态合同是 Hook 而不是 Proxy
- [[svelte]] —— 同样提供 SFC，但编译产物调用 signal runtime
- [[vite]] —— 尤雨溪另一作品，Vue 默认开发服务器
- [[vitest]] —— Vue 生态常见测试运行器
- [[vue-i18n]] —— Vue 官方国际化方案
- [[vitepress]] —— Vue 团队文档站生成器
- [[nuxt]] —— Vue 元框架
- [[solid]] —— 细粒度信号，无 vnode 对齐

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ag-grid]] —— AG Grid — 企业级数据表格
- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[nuxt]] —— Nuxt — Vue 全栈框架
- [[quasar]] —— Quasar Framework — 一套代码跑 Vue 全端的应用框架
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[sveltekit]] —— SvelteKit — Svelte 全栈框架
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vue-i18n]] —— vue-i18n — Vue 官网推荐的 i18n，切语言整页自己刷新
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用
