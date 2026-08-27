---
title: SolidStart — Vite 环境 API 上的 Solid 全栈壳
description: 固定 SolidStart 2.0.4：h3 请求管线、文件路由和 use server RPC，以及它和 Vinxi / Nitro / Router 的边界。
来源: 'https://github.com/solidjs/solid-start'
日期: 2026-08-27
分类: Meta 框架
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/solidjs/solid-start
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5d23efbcbb47997a70978be8b0e468df50d774a8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.4
---

## 是什么

SolidStart 是 [[solid]] 的全栈壳：它负责**文件路由发现、SSR 文档壳、API 匹配和 `"use server"` RPC**，导航和 `query` / `action` 仍交给 `@solidjs/router`。日常类比：Solid 是发动机，Start 是车架和线束，Router 是方向盘。

固定 `2.0.4` 的包是 `@solidjs/start`。CHANGELOG 写明 v2 **用 Vite Environment API 替换 Vinxi**。运行时 HTTP 是 **h3**，开发桥是 **srvx**，API 查找用 **radix3**。fixture 常再挂 `nitro/vite`，但 Nitro **不是** `@solidjs/start` 自己的 dependency。

## 为什么重要

不切开这几层，下面这些说法会写错：

- 为什么 2.x 不能再按 Vinxi / `.vinxi/` 心智排障
- 为什么 `query` / `action` / `preload` 在 Router 里，却必须搭配 `"use server"`
- 为什么默认渲染是 `renderToStream`，SPA 模式却整段改走 `server/spa`
- 为什么 Node 引擎写成 `>=24`，Vite peer 却是 `^8 || ^9`

## 核心要点

`createHandler()` 的主链按路径分流：

1. **配置**：`solidStart()` 必须找到 `{appRoot}/app.{tsx,jsx}`，否则 throw。默认 `appRoot` 为 `./src`，`routeDir` 为 `./routes`，`ssr` 为 `true`，序列化模式为 `"json"`。
2. **文件路由**：`fsRoutes()` 生成虚拟模块 `solid-start:routes`。`(group)` 从 URL 剥掉，`[id]` → `/:id`，`[...rest]` → `/*rest`。页面要有 `default`；同文件还可以导出 `GET`/`POST` 和 `route`（给 Router 的 `preload`）。
3. **`/_server` RPC**：Babel 把 `"use server"` 编成 `createServerReference`。客户端 POST 到 `{BASE_URL}_server`，带 `X-Server-Id`。请求上下文里走进程内调用；否则 throw `Cannot call server function outside of a request`。
4. **API**：`matchAPIRoute` 用 radix3。非 GET 必须返回值，否则 throw。GET 若在页面路由上返回 `undefined`，会掉下去渲染页面。API 路由禁止 optional param。
5. **渲染**：默认 `mode` 为 `"stream"`（`renderToStream`）。`"sync"` 或 `START_SSR` 关闭时用 `renderToString`。客户端 `mount()` 就是 `hydrate`。

`FileRoutes` 只是把生成的路由树交给 `<Router>`。没有 Router，Start 仍能跑 API / server function，但示例应用都显式依赖它。

## 实践示例

### 案例 1：Vite 插件 + 可选 Nitro

```ts
import { defineConfig } from "vite";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [solidStart(), nitro()],
});
```

`solidStart()` 返回一组 Vite plugin，不是单个对象。Nitro 只出现在应用自己的 `vite.config.ts` 里。

### 案例 2：应用壳与文件路由

```tsx
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
```

这是 `apps/fixtures/basic` 的骨架。缺 `src/app.tsx` 会在配置阶段直接失败。

### 案例 3：`"use server"` 叠在 Router query 上

```ts
import { action, query, redirect } from "@solidjs/router";

export const getNote = query(async (id: number) => {
  "use server";
  return notes.find((note) => note.id === id);
}, "note");

export const saveNote = action(async (formData: FormData) => {
  "use server";
  // persist...
  return redirect("/notes/1");
});
```

`query`/`action` 的缓存与重定向语义属于 Router；Start 只保证函数能被编成 `/_server` 引用，并在 `X-Single-Flight` 时重跑应用数据。

## 踩过的坑

1. **仍按 Vinxi 排障**：2.0.4 源码里的 Vinxi 只剩清理脚本和历史目录名。
2. **把 Nitro 写成 Start 内核**：包自身依赖是 h3 / srvx / seroval；Nitro 是应用插件。
3. **在 Start 包里找 `createAsync`**：它在 `@solidjs/router`。
4. **API 路由写 `[[optional]]`**：`matchAPIRoute` 会 throw `Optional parameters are not supported in API routes`。
5. **生产环境用 Node 22**：`engines.node` 是 `>=24`。npm `@solidjs/start@2.0.4` **没有 `gitHead`**，只能以 GitHub annotated tag 解引用提交为准。

## 适用 vs 不适用场景

**适用**：

- 已经用 Solid JSX / signal，需要文件路由和 SSR 文档壳
- 想把 server function 写成普通导出，而不是另立一套 RPC 框架
- 部署时自己选 Nitro 或其他 Vite Environment 后端

**不适用**：

- 生产 Node 低于 24，或还锁在 Vite 5/6/7
- 需要 Analog 那种 Angular resolver + `*.server.ts` HTTP load
- 要把“比 Next 少 hydrate N kb”写成结论——本文未测体积
- 指望 Start 内置 `query` 实现——那是 Router 的工作

## 固定版本边界

- 本文绑定 `solidjs/solid-start@5d23efbc...`，即 annotated tag `@solidjs/start@2.0.4` 的解引用提交。
- 包版本 `@solidjs/start@2.0.4`；peer 为 `vite ^8 || ^9`，可选 `@solidjs/router >=0.16.0 <2.0.0-0`；直接依赖 `solid-js ^1.9.15`。
- npm latest 无 `gitHead`，不能用 registry 反推提交；以 GitHub tag 为准。
- 本文未安装依赖、未跑 vitest / fixture e2e / Nitro preview，状态保持 `UNVERIFIED`。

## 学到什么

1. **v2 的替换对象是 Vinxi，不是 Solid 本身**
2. **请求先看 `/_server`，再看 API export，最后才 SSR**
3. **文件路由发现在 Start，导航和数据原语在 Router**
4. **默认流式 SSR 是 handler option，不是营销口号**

## 应用型自测

1. 固定 2.0.4 里，`"use server"` 的 HTTP 路径是什么？缺注册 ID 时生产环境回什么状态码？
2. `createHandler` 默认渲染 mode 是 `stream`、`async` 还是 `sync`？SPA（`ssr: false`）还走同一套 `StartServer` 吗？
3. `query` / `action` 是 `@solidjs/start` 导出的吗？没有 `@solidjs/router` 还能做文件路由发现吗？

检查点：

1. `/_server`。生产缺 ID 是 404 空 body；开发才有 `"Server function not found"`。
2. 默认 `"stream"`。`ssr: false` 会改 alias 到 `server/spa` / `client/spa`，SPA 壳不带 `{children}` 水合树。
3. 不是 Start 导出。Start 仍能生成路由模块和 API；`<FileRoutes>` + `<Router>` 才是页面导航合同。

## 延伸阅读

- 官方文档：[docs.solidjs.com/solid-start](https://docs.solidjs.com/solid-start)
- 固定源码：[solidjs/solid-start](https://github.com/solidjs/solid-start) —— 本文绑定提交 `5d23efbcbb47997a70978be8b0e468df50d774a8`
- [[solid]] —— UI 运行时；Start 不重新实现 signal
- [[analogjs]] —— 同一批里对照的 Angular 元框架，数据合同是 `*.server.ts`

## 关联

- [[solid]] —— 组件函数只跑一次；Start 只提供壳和 RPC
- [[vite]] —— v2 直接使用 Vite Environment API
- [[analogjs]] —— 同样是文件路由元框架，服务器层默认接 Nitro
- [[next-js]] —— `"use server"` 语汇相近，打包和路由实现不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[analogjs]] —— AnalogJS — 把 Angular 接到 Vite 文件路由和 Nitro 上
