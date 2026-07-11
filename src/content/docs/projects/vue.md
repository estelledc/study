---
title: Vue.js — 渐进式 UI 框架
来源: https://github.com/vuejs/core
日期: 2026-05-29
分类: UI 框架
难度: 中级
---

## 是什么

Vue.js 是一套**用模板 + 响应式数据写网页 UI 的渐进式框架**。日常类比：像一个**会盯着账本自动改看板的助理**——你在账本上改一行数字，看板上对应格子立刻跟着变；你不用自己拿笔去改看板。

具体讲就是：

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>
```

按一次按钮，`count` 从 0 变 1，**页面自动刷新显示 1**——你不用手动改 DOM（页面上的按钮、文字那些零件）。表单里常见的 `v-model` 才是「输入框 ↔ 数据」双向同步的语法糖，不是整框架的默认模型。

"渐进式"的意思是：可以只用一小块（在已有 jQuery 项目里嵌一个 Vue 组件），也可以全家桶（Vue + Vue Router + Pinia + Vite + Vitest）做整站。

## 为什么重要

- **单文件组件（.vue）** 把 `<template>` / `<script>` / `<style>` 装进一个文件，新人一眼能看懂这个组件的全部
- **中文文档第一梯队**——尤雨溪是华人，官方中文文档质量极高，零基础也能顺着教程做完
- **逻辑复用更自由**：相关状态和副作用可以收进一个函数（Composition API），不必被「数据一块、方法一块」的旧写法拆散；对比 [[react]] 的 Hook，少一些调用顺序硬规则
- **Nuxt + Vue** 能做整站服务端渲染，国内很多团队选 Vue 不只是因为情怀

## 核心要点

Vue 学习曲线可以拆成 **三块**：

1. **响应式（reactive）**：数据是"会广播的"。`ref(0)` / `reactive({...})` 创建出的数据被读取时会被记录依赖；改它的时候，**所有用过它的地方自动重跑一遍**。类比：你订阅了一个公众号，作者发文你手机就响——你不用主动刷新。

2. **单文件组件（SFC）**：一个 `.vue` 文件三段式。`<template>` 写 HTML 长什么样，`<script>` 写数据和逻辑，`<style>` 写样式（可加 `scoped` 让样式只对本组件生效）。一个组件 = 一个 .vue 文件。

3. **Composition API**：Vue 3 的写法。用一堆 `ref` / `computed` / `watch` 函数组合状态，而不是 Vue 2 的 Options API（`data() / methods / computed` 分块写）。Composition API 让相关逻辑写在一起，比 Options API 容易拆复用。

## 实践案例

### 案例 1：计数器 SFC（最小可运行单元）

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <button @click="count++">点了 {{ count }} 次</button>
</template>
```

**逐部分解释**：

- `ref(0)` 创建一个**响应式数字**，初值 0。返回的不是数字本身，而是一个"盒子"
- 在 `<script>` 里访问值要用 `count.value`；**但模板里直接写 `count` 即可**（Vue 自动 unwrap）
- `@click` 是事件监听语法糖，等于 `v-on:click`
- `{{ count }}` 是双花括号插值，把变量放到 HTML 里渲染

### 案例 2：v-for 渲染列表（注意 key）

```vue
<script setup>
import { ref } from 'vue'
const todos = ref([
  { id: 1, text: '学 Vue' },
  { id: 2, text: '配 Vite 脚手架' }
])
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">{{ todo.text }}</li>
  </ul>
</template>
```

**关键点**：`:key` 必须是**稳定唯一**的 id，不能用数组下标——否则数据重排时 Vue 会复用错误的 DOM 节点，导致输入框内容串位、动画错乱。

### 案例 3：Composition API 写一个 useMouse() 自定义 hook

```js
// composables/useMouse.js
import { ref, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)
  const update = (e) => { x.value = e.pageX; y.value = e.pageY }
  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))
  return { x, y }
}
```

任何组件 `import { useMouse } from './composables/useMouse'` 拿来就用，**逻辑可以跨组件复用**。这就是 Composition API 比 Options API 强的地方——不再被组件结构绑架。

## 踩过的坑

1. **ref 必须 `.value`**：脚本里写 `count + 1` 不会报错但**是错的**——`count` 是盒子不是数字。必须 `count.value + 1`。模板里反而不用，Vue 自动拆盒子。这个不一致是 ref 最大的认知负担。

2. **v-if vs v-show 选错性能差**：`v-if` 是真删 DOM，`v-show` 只切 `display: none`。频繁切换用 `v-show`（不重渲染），偶尔切换或初始可能不显示用 `v-if`（省内存）。新人见啥写啥，列表里大量 `v-if` 切换会卡。

3. **整对象替换会丢掉 Proxy**：Vue 3 的 `reactive()` 用 Proxy，深层属性改动也会触发更新；但若写 `obj = newObj` 把变量指到新对象，原 Proxy 就丢了，后续改动不再驱动界面。改用 `Object.assign(obj, newObj)` 或单独改字段。

4. **Options API 和 Composition API 混用容易乱**：Vue 3 兼容 Vue 2 写法，所以一个组件里既能 `data()` 又能 `<script setup>`，但**不要混**——this 指向、生命周期顺序、状态可见性都不一样。新项目直接用 Composition API + `<script setup>`，老项目迁移时整组件一次性切。

## 适用 vs 不适用场景

**适用**：

- 中后台管理系统（Element Plus / Naive UI / Ant Design Vue 生态成熟）
- 国内团队（中文文档完善、社区活跃、招人容易）
- 渐进迁移老项目（可以从 jQuery 一块块换成 Vue，不必整站重构）
- 服务端渲染网站（Nuxt 3 配合 Vue 3 体验和 Next 13+ 接近）

**不适用**：

- 极致追求生态广度（npm 上 Vue 库 ≈ [[react]] 库的 1/3）
- 团队全员 React 背景，没人想学新语法
- React Native / Flutter 替代品场景（Vue 没有官方原生方案，第三方 NativeScript-Vue 不活跃）
- 类型推断要求顶级（Vue 3 + TypeScript 比 React + TS 体验稍弱，模板里类型推断有时候推不动）

## 历史小故事（可跳过）

- **2013 年**：尤雨溪在 Google Creative Lab 做原型，受 Angular 启发但觉得太重，自己拆出一个轻量级版本
- **2014 年**：Vue 0.6 发布，一个人维护
- **2016 年**：Vue 2 发布，引入虚拟 DOM，性能向 [[react]] 看齐；Laravel 把它选为默认前端，国内开始大规模采用
- **2020 年**：Vue 3 发布，重写为 TypeScript，引入 Composition API；Proxy 取代 Object.defineProperty，深层响应不再有遗漏
- **2023 年**：Vue 3 成为默认版本，Vue 2 进入维护期；Vite（同样尤雨溪作品）成为 Vue 官方推荐构建工具

## 学到什么

1. **响应式是"自动同步"的工程化**——把"我改了数据，UI 自己跟上"这件事变成一行 `ref()` 调用
2. **单文件组件是新人友好度的天花板**：template/script/style 同文件 + scoped 样式 = 学三天就能写组件
3. **Composition API > Options API** 不是因为新，而是因为**逻辑组织自由**——同一个功能的代码不再被框架结构切碎
4. **渐进式不是营销词**：是真能从 CDN script 一行到全家桶平滑过渡，不需要 all-in 才能用

## 延伸阅读

- 官方教程：[Vue.js 中文文档](https://cn.vuejs.org/)（中文质量天花板）
- 互动教程：[Vue.js Tutorial](https://cn.vuejs.org/tutorial/)（浏览器里直接写）
- 源码精读：《Vue.js 设计与实现》霍春阳（Vue 团队成员写，从 0 实现一个 Vue）
- [[vite]] —— Vue 官方推荐构建工具，同作者
- [[vitest]] —— Vue 生态首选测试框架

## 关联

- [[react]] —— 同代竞品，函数式优先 vs Vue 模板优先；学过其一再看另一个事半功倍
- [[vite]] —— 尤雨溪另一作品，Vue 默认脚手架
- [[svelte]] —— 编译时响应式，把"运行时框架"砍成"编译产物"
- [[vue-i18n]] —— Vue 生态官方国际化方案
- [[typescript]] —— Vue 3 用 TS 重写，模板里也能写 TS
- [[vitepress]] —— 用 Vue 写文档站的工具
- [[tailwind]] —— Vue 项目最常搭配的原子化 CSS 方案

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
