---
title: Nuxt — Vue 全栈框架
来源: https://github.com/nuxt/nuxt
日期: 2026-05-29
分类: Meta 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/nuxt/nuxt
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e2d3a3945a3459c0e3a869de85c0b53c6c214432
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.5.2
---

## 是什么

Nuxt 是 [[vue]] 生态的全栈框架。固定 `4.5.2` 把页面路由、auto-import、SSR/SSG 和 Nitro 服务端打包成一份约定，而不是让你自己拼 Vue Router + Vite + 部署脚本。

日常类比：Vue 是发动机，Nuxt 是整车。你写一个页面文件，框架负责把它挂到 URL、决定在哪一端取数、再把同一份应用打到 Node 或边缘运行时。

固定提交里，默认 `srcDir` 会先看项目根下有没有非空的 `app/`；没有才退回根目录。`server/` 始终相对 `rootDir`，不会跟着 `app/` 一起挪走。

```vue
<script setup>
const msg = ref("Hi from Nuxt")
</script>
<template>
  <h1>{{ msg }}</h1>
</template>
```

把这段放进 `app/pages/index.vue`（或旧布局的 `pages/index.vue`），约定路由会把它映射到 `/`。`ref` 来自 Vue auto-import preset，不必手写 import。

## 为什么重要

不理解固定 4.5.2 的分层，下面这些事会说错：

- 为什么新项目常见 `app/pages`，而 `server/api` 仍在仓库根
- 为什么 `useFetch('/api/hello')` 在服务端会走 `event.$fetch`，hydrate 时又先读 payload
- 为什么“Nitro preset 一键换部署目标”不在 `packages/nuxt` 里实现，而在 `@nuxt/nitro-server` + `nitropack`
- 为什么 Node 版本不能再按 Nuxt 3 的宽松引擎猜

## 核心架构与流程

固定源码的主链可以拆成五步：

1. **解析目录**：`srcDir` 优先 `app/`；`dir.pages` 默认 `pages`。`resolvePagesRoutes` 扫描各 layer 的 `appPages`，用 `unrouting` 建成 Vue Router 4 路由树。

2. **注入 auto-import**：`nuxt:imports` 默认 `autoImport: true`，扫描 `composables/`、`utils/`、`shared/utils`、`shared/types`；Vue 的 `ref` / `computed` / `watch` 和 `useFetch` / `$fetch` 来自 preset。

3. **取数走 `useAsyncData`**：`useFetch` 是 `createUseFetch` 工厂的默认实例。请求 key 由 method、URL、query/body 哈希组成；服务端对本站相对路径改用 `useRequestFetch()`。

4. **hydrate 先读缓存**：默认 `getCachedData` 在 `nuxtApp.isHydrating` 时返回 `payload.data[key]`，否则在非手动/hook refresh 时读 `static.data[key]`。

5. **服务端交给 Nitro**：默认 server builder 是 `@nuxt/nitro-server`，它调用 `nitropack` 的 `createNitro` / `build` / `prerender`。H3 从 `@nuxt/nitro-server/h3` 再导出。

## 实践案例

### 案例 1：页面文件即路由

`app/pages/index.vue`：

```vue
<script setup>
const msg = ref("Hi")
</script>
<template>
  <h1>{{ msg }}</h1>
</template>
```

`pages/index.vue` 仍表示 `/`，但固定 4.5.2 默认先找 `app/pages`。动态段仍是 `[id].vue` 这类文件名，由 `unrouting` 编译，不是手写 `createRouter`。

### 案例 2：API 路由停在仓库根

`server/api/hello.ts`：

```ts
export default defineEventHandler(() => {
  return { message: "Hello from API" }
})
```

`serverDir` 固定相对 `rootDir` 解析，默认就是根上的 `server/`。即便 `srcDir` 是 `app/`，接口也不该写成 `app/server/api`。`defineEventHandler` 来自 H3/Nitro 的 auto-import，不在 Vue 页面 preset 里。

### 案例 3：useFetch 复用 payload，不保证零网络

```vue
<script setup>
const { data } = await useFetch('/api/hello')
</script>
<template>
  <pre>{{ data }}</pre>
</template>
```

服务端对本站 `/api/hello` 走 `event.$fetch`；结果写入 `payload.data`。客户端 hydrate 时默认先取这份缓存。这不是“永远不再请求”：`refresh:manual` / `refresh:hook`、key 变化或自定义 `getCachedData` 都会重新执行 handler。`createUseFetch` 从 4.2.0 起允许预置默认选项。

## 踩过的坑

1. **把 Nuxt 4 仍写成“根目录 pages/ 是唯一默认”**：有非空 `app/` 时 `srcDir` 是 `app/`；只有 `app/` 不存在、或空 `app/` 且根上已有 `app.vue` / `pages/` 时才退回根目录。

2. **把 `server/` 跟着 `app/` 搬家**：`serverDir` 不读 `srcDir`。`app/server/api` 不是固定默认。

3. **把 hydrate 缓存说成“客户端绝不再 fetch”**：默认缓存只覆盖 hydrating 的 `payload.data` 和部分 `static.data`；手动 refresh 不走这条短路。

4. **按 Nuxt 3 猜 Node 版本**：`packages/nuxt/package.json` 的 engines 是 `^22.19.0 || ^24.11.0 || >=26.0.0`。

5. **把部署 preset 当成 `packages/nuxt` 内建表**：本仓只选择 `@nuxt/nitro-server`；preset 编译在 `nitropack`。本轮未打开 nitropack 源码，不能写出具体 preset 名单。

## 适用 vs 不适用场景

**适用**：

- 已用 Vue 3，需要文件路由、SSR/SSG 和同构取数
- 希望服务端路由与页面约定分开，API 留在根 `server/`
- 接受 Nitro/`nitropack` 作为服务端编译层，而不是自己接 Express

**不适用**：

- 团队主栈是 React → 看 [[next-js]]，Nuxt 帮不上
- 只要内容站、默认 0 JS → [[astro]] 更贴
- 必须跑在 Node 18/20 → 固定 4.5.2 的 engines 不包含这些主版本
- 需要本轮未核验的具体边缘 preset 行为或性能数字

## 固定版本边界

- 本文绑定 `nuxt/nuxt@e2d3a394...`，`packages/nuxt` 与 `@nuxt/nitro-server` 均为 `4.5.2`。
- npm `nuxt@4.5.2` 未提供 `gitHead`；revision 来自 GitHub 轻量 tag `v4.5.2` 指向的提交，并与该提交上的 `package.json` version 对齐。
- 服务端依赖声明为 `nitropack@^2.13.4`、`h3@^1.15.11`、`ofetch`；具体锁文件版本未核验。
- 本文未安装依赖、未跑 `nuxi`、未发送请求、未测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **目录约定是解析结果，不是口号**——`app/` 与根目录 `pages/` 哪一个生效，要看 `srcDir` 解析；`server/` 是另一条路径。
2. **`useFetch` 不是裸 `$fetch`**——它把请求编进 `useAsyncData` 的 key/cache/dedupe 合同，服务端本地调用还换了 fetch 实现。
3. **Nitro 是独立 builder**——Nuxt 选择 `@nuxt/nitro-server`，真正的 `createNitro` 在 `nitropack`。
4. **引擎字段会收紧**——4.5.2 已经把 Node 下限写进 package，不能靠旧教程里的 18 推断。

## 应用型自测

1. 新建项目只有根目录 `pages/index.vue`，没有 `app/`。固定 4.5.2 会把 `srcDir` 解析成 `app/` 吗？
2. `srcDir` 已是 `app/` 时，默认 API 文件应放在 `app/server/api` 还是根 `server/api`？
3. hydrate 完成后用户点“手动 refresh”。默认 `getCachedData` 还会直接返回 `payload.data[key]` 吗？

检查点：

1. 不会。`app/` 不存在时退回 `rootDir`。
2. 根 `server/api`。`serverDir` 相对 `rootDir`。
3. 不会。`refresh:manual` 不走默认 static/payload 短路。

## 延伸阅读

- 官方 docs：[nuxt.com/docs](https://nuxt.com/docs)
- 固定源码：[nuxt/nuxt](https://github.com/nuxt/nuxt) —— 本文绑定提交 `e2d3a3945a3459c0e3a869de85c0b53c6c214432`
- Nitro 文档：[nitro.build](https://nitro.build)（preset 细节以 nitropack 为准，本轮未打开）
- [[vue]] —— Nuxt 之上的 UI 运行时
- [[ofetch]] —— `$fetch` / `useFetch` 底层客户端
- [[sveltekit]] —— 另一条文件约定全栈路线

## 关联

- [[vue]] —— 页面组件与 auto-import 的 `ref`/`computed` 来源
- [[next-js]] —— React 阵营的文件路由 + SSR 对照
- [[astro]] —— 内容站优先、默认少 JS 的另一端
- [[ofetch]] —— Nuxt 请求包装的底座
- [[unstorage]] —— Nitro server cache 常用的存储抽象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sveltekit]] —— SvelteKit — Svelte 全栈框架
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
- [[vue-i18n]] —— vue-i18n — Vue 官网推荐的 i18n，切语言整页自己刷新
