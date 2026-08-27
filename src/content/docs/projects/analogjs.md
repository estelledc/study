---
title: AnalogJS — 把 Angular 接到 Vite 文件路由和 Nitro 上
description: 固定 Analog 2.7.1：platform 插件如何把 pages/*.page.ts、*.server.ts 和 Nitro 收成 Angular 路由。
来源: 'https://github.com/analogjs/analog'
日期: 2026-08-27
分类: Meta 框架
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/analogjs/analog
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0896a7eaaa2acf26443ca184bc1dd9aa1a06f4d6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.7.1
---

## 是什么

AnalogJS 是一套**给 Angular 补上 Vite 构建、文件路由和 Nitro HTTP 层**的元框架。日常类比：Angular 自己是一台精密机床，Analog 是车间流水线——你把零件放进 `src/app/pages/`，它负责变成路由表、SSR 入口和 API。

固定 `2.7.1` 的入口是 `import analog from '@analogjs/platform'`。`platformPlugin()` 按顺序叠 `@analogjs/vite-plugin-nitro`、`routerPlugin`、`contentPlugin` 和 `@analogjs/vite-plugin-angular`。没有名为 `@analogjs/nitro` 的包；服务器适配器叫 `@analogjs/vite-plugin-nitro`，依赖 `nitropack`。

## 为什么重要

不理解这条流水线，下面这些事会对不上：

- 为什么 `.page.ts` 能变成 Angular `Route[]`，却不是 Next.js App Router
- 为什么页面数据写在并列的 `*.server.ts`，而不是页面文件自己的 `loader`
- 为什么默认 SSR 走 `@angular/platform-server` 的 `renderApplication`，水合仍是 Angular 自己的 `provideClientHydration`
- 为什么 `/api` 既可以走 Nitro `src/server/routes/`，也可以走已弃用的 `#ANALOG_API_MIDDLEWARE`

## 核心要点

一次请求可以拆成五步：

1. **Vite 插件编排**：`analog()` 默认 `ssr: true`。Nitro 负责 dev API、生产 server bundle 和 prerender；Angular 插件负责编译。
2. **文件变路由**：`routerPlugin` 扫描 `src/app/pages/**/*.page.ts`（以及遗留的 `app/routes/**/*.ts`）。`createRoutes()` 把 `[id]` 变成 `:id`，`[...slug]` 变成 `**`，`(auth)` 从 URL 里剥掉。父文件带着子文件时，父文件就是 layout，没有单独的 `layout.ts` 文件名。
3. **页面数据是另一次 HTTP**：并列 `*.server.ts` 导出 `load` / `action`。Nitro 把它们挂到 `/_analog/pages/...`（有 `src/server/routes/api/` 时前面再加 `/api`）。`toRouteConfig()` 始终注入 `resolve.load`，用 `HttpClient` GET 这份 JSON。组件里 `injectLoad()` 读的是 `ActivatedRoute.data['load']`。
4. **SSR 边界**：Nitro renderer 调 `src/main.server.ts` 的默认导出。官方模板写 `export default render(App, config)`。`routeRules.ssr === false` 或请求头 `x-analog-no-ssr` 只吐静态 `index.html`。流式 SSR 要 `renderStream` + `experimental.streaming`，并且 Angular major ≥ 21。
5. **API 与 serverFn 分家**：REST 文件在 `src/server/routes/**`。`serverFn()` 走 `/_analog/fn/:id`，带 `input` schema 时必须 POST。

`provideFileRouter()` 把发现到的 `routes` 交给 `provideRouter`，默认 `API_PREFIX` 为 `'api'`。

## 实践示例

### 案例 1：最小 Vite 入口

```ts
import { defineConfig } from "vite";
import analog from "@analogjs/platform";

export default defineConfig({
  plugins: [analog()],
});
```

不传选项时，测试断言 `viteNitroPlugin` 收到 `{ ssr: true }`。

### 案例 2：页面 + 并列 load

```ts
// src/app/pages/(home).server.ts
import type { PageServerLoad } from "@analogjs/router";

export const load = async ({ fetch }: PageServerLoad) => {
  const products = await fetch("/api/v1/products");
  return { products };
};
```

```ts
// src/app/pages/(home).page.ts
import { Component } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { injectLoad } from "@analogjs/router";
import type { load } from "./(home).server";

@Component({
  standalone: true,
  template: `@for (p of data().products; track p.id) { <p>{{ p.name }}</p> }`,
})
export default class HomePage {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });
}
```

`(home)` 是 pathless 命名 index，URL 仍是 `/`。`injectLoad` 返回 Observable，不是同步对象。

### 案例 3：服务端渲染入口

```ts
import { render } from "@analogjs/router/server";
import { App } from "./app/app";
import { config } from "./app/app.config.server";

export default render(App, config);
```

这是 `create-analog` 模板 `src/main.server.ts` 的形状。Nitro 把它当成 `#analog/ssr`。

## 踩过的坑

1. **把 Analog 当成 Next App Router**：路由对象是 Angular `loadChildren` + resolver，不是 RSC 树。
2. **在 `.page.ts` 里找 `loader`**：固定版本的数据合同在 `*.server.ts`。
3. **把包名写成 `@analogjs/nitro`**：2.7.1 只有 `@analogjs/vite-plugin-nitro`。
4. **默认打开流式 SSR**：`experimental.streaming` 默认关，还要求 Angular 21+。
5. **以为 `/api` 永远走中间件代理**：存在 `src/server/routes/api/` 时，`#ANALOG_API_MIDDLEWARE` 不再注册。

## 适用 vs 不适用场景

**适用**：

- 已经用 Angular 组件和 Router，但想换成 Vite 文件路由
- 需要和页面并列的 `load`/`action`，同时保留 Angular guard / resolver
- 部署目标能吃 Nitro preset（Vercel / Netlify / Cloudflare Pages 等）

**不适用**：

- 要 React / Solid 那套 `"use server"` 指令语义——Analog 的 `serverFn` 是另一条 `/_analog/fn` 通道
- 只想要 `@angular/ssr` 的 `CommonEngine` 官方构建链，不想接 Vite + Nitro
- 需要把“首屏一定比 Next 快 N 倍”写成预算——本文未测 bundle 或吞吐
- 生产环境低于文档声明的 Node 范围：仓库根 `engines.node` 为 `^22.22.3 || ^24.15.0 || ^26.0.0`

## 固定版本边界

- 本文绑定 `analogjs/analog@0896a7ea...`，即轻量 tag `v2.7.1`。npm `@analogjs/platform@2.7.1` 与 `@analogjs/router@2.7.1` 的 `gitHead` 与该提交一致。
- `@analogjs/router` 对 `@angular/core` 的 peer 为 `^17 || ^18 || ^19 || ^20 || ^21 || ^22`。
- `@analogjs/platform` 对 Vite 的 peer 为 `^5 || ^6 || ^7 || ^8`。
- 上游同时有 `v3.0.0-alpha.*` 线；本文不外推 3.x。
- 本文未安装依赖、未跑上游 test / e2e / Nitro preset，状态保持 `UNVERIFIED`。

## 学到什么

1. **元框架不等于换掉 UI 运行时**——Analog 仍把路由交给 Angular Router
2. **文件路由的 layout 是“有孩子的父文件”**，不是约定文件名
3. **页面数据默认再打一次 HTTP**，所以 cookie 转发和 TransferState 才出现
4. **Nitro 是默认服务器层，不是唯一模式**：`ssr: false` 或 prerender-only 可以不跑完整 server

## 应用型自测

1. 固定 2.7.1 里，页面数据应该写在哪个文件？`injectLoad()` 读的是哪一个 route data key？
2. `(auth)/login.page.ts` 的公开 URL 是什么？`(auth)` 会出现在 path 里吗？
3. 不传选项调用 `analog()`，SSR 默认开还是关？流式渲染会一起打开吗？

检查点：

1. 并列 `*.server.ts` 的 `load`；`injectLoad()` 读 `ActivatedRoute.data['load']`。
2. URL 是 `/auth/login`；括号分组会被 `toSegment` 剥掉。
3. SSR 默认开。流式要额外开 `experimental.streaming`，并且 Angular ≥ 21。

## 延伸阅读

- 官方站点：[analogjs.org](https://analogjs.org/)
- 固定源码：[analogjs/analog](https://github.com/analogjs/analog) —— 本文绑定提交 `0896a7eaaa2acf26443ca184bc1dd9aa1a06f4d6`
- [[solid-start]] —— 同一批里对照的 Solid 元框架；2.0 已离开 Vinxi
- [[next-js]] —— 文件路由元框架的对照面，实现合同不同

## 关联

- [[vite]] —— Analog 的构建入口是 Vite plugin，不是 Angular CLI builder
- [[nuxt]] —— 同样以 Nitro 做服务器层，但 UI 运行时是 Vue
- [[solid-start]] —— Vite 文件路由 + 服务端函数，另一条运行时
- [[astro]] —— 同仓库还有 `@analogjs/astro-angular`，不在本页展开

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[solid-start]] —— SolidStart — Vite 环境 API 上的 Solid 全栈壳
