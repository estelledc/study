---
title: Hono — 多运行时 Web 框架
来源: https://github.com/honojs/hono
日期: 2026-05-29
分类: Web 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/honojs/hono
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 06880c4a2b04de9dd74217f26dd831209b9c01f1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.13.5
---

## 是什么

Hono 是一个以 Web 标准 Request / Response 为入口的多运行时 Web 框架。日常类比：你只造一台发动机，再按底盘换接口；业务代码写的是 `app.fetch(request)`，Cloudflare Workers、Bun、Deno 可以直接接，Node 则要另找适配器。

你写：

```ts
import { Hono } from "hono"

const app = new Hono()
app.get("/", (c) => c.text("Hi"))
app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }))
export default app
```

固定 4.13.5 里，`export default app` 暴露的是 `fetch`；运行时只要能把 HTTP 请求变成 `Request`、把返回值当 `Response`，就能挂上同一份 app。

## 为什么重要

不理解 Hono 的入口和路由器选择，就解释不了下面几件事：

- 为什么同一份 handler 能在 Workers / Bun / Deno 上直接跑，却不能假设 Node 也在核心包里
- 为什么默认 `Hono` 和 `hono/quick`、`hono/tiny` 用的不是同一套路由器
- 为什么只有一个 handler 时看不到 `compose`，多个中间件时 `next()` 又不能调用两次
- 为什么 `HEAD` 请求会先按 `GET` 走一遍，再被换成空 body

## 核心要点

Hono 的请求链可以拆成五步：

1. **注册路由**：`app.get(path, ...handlers)` 把 method、合并后的 path 和 handler 推进 `router.add()`，同时记入 `routes`。

2. **选择路由器**：默认 `SmartRouter` 带着 `RegExpRouter` 和 `TrieRouter`。第一次 `match()` 时按顺序把全部路由灌进候选路由器，谁能吃下就锁定，之后 `match` 直接绑到它。

3. **入口是 `fetch`**：`#dispatch` 用 `getPath(request)` 取路径（默认 `strict=true`），再 `router.match(method, path)`。`HEAD` 会改派成 `GET`，然后用空 body 包一层 `Response`。

4. **组成中间件**：匹配结果只有一个 handler 时直接调用，不再 `compose`；多个 handler 才走 koa 风格洋葱链。`next()` 被调用两次会抛错。

5. **Context 出响应**：handler 返回 `Response`，或通过 `c.text()` / `c.json()` 写入 `c.res`。未 finalize 时走 not-found；带 `getResponse()` 的错误可直接变成响应。

## 实践示例

### 案例 1：同一份 app，换入口而不是换 handler

```ts
import { Hono } from "hono"

const app = new Hono()
app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }))

export default app
```

Workers / Bun / Deno 把这份对象当 `fetch` 入口。固定源码里的 `src/adapter` 覆盖 Bun、Deno、Cloudflare、AWS Lambda、Lambda@Edge、Vercel、Netlify 和 service-worker；**没有 Node adapter**。要在 Node 上 listen，需要核心仓之外的包，本轮未打开那个包。

### 案例 2：CORS 必须先于会拒绝 OPTIONS 的中间件

```ts
import { Hono } from "hono"
import { cors } from "hono/cors"
import { jwt } from "hono/jwt"

const app = new Hono()
app.use("*", cors())
app.use("/admin/*", jwt({ secret: "xxx" }))
app.get("/admin/users", (c) => c.json({ ok: true }))
```

固定 CORS 在 `OPTIONS` 上直接 `return new Response(null, { status: 204 })`，**不会** `await next()`。如果 jwt 先注册并匹配到预检请求，预检会在 CORS 之前被拒绝。

### 案例 3：路由器预设不是同一个默认值

```ts
import { Hono } from "hono"
import { Hono as QuickHono } from "hono/quick"
import { Hono as TinyHono } from "hono/tiny"

const app = new Hono()           // SmartRouter(RegExpRouter, TrieRouter)
const quick = new QuickHono()    // SmartRouter(LinearRouter, TrieRouter)
const tiny = new TinyHono()      // PatternRouter
```

旧文把 LinearRouter 写成默认实现，这与 4.13.5 的 `src/hono.ts` 不符。路由少、想先线性扫描时才走 `hono/quick`。

## 踩过的坑

1. **把 Node 当成核心 runtime**：`src/adapter` 没有 Node。`export default app` 对 Node http.Server 不够，还要单独 adapter。

2. **把 LinearRouter 当默认**：默认是 RegExpRouter 优先的 SmartRouter；LinearRouter 在 `hono/quick`。

3. **中间件顺序**：CORS 对 OPTIONS 短路。鉴权中间件放在 CORS 前面，浏览器预检过不了。

4. **忘记返回 Response 或 `await next()`**：多 handler 路径在 `context.finalized === false` 时会抛 “Context is not finalized”。

5. **把 `c.req.param('id')` 的类型当成永远是 `string`**：路径里声明了必填 `:id` 时是 `string`；未知 key 或可选参数的重载是 `string | undefined`。

## 适用 vs 不适用场景

**适用**：

- 目标运行时接受 `(request) => Response`，例如 Workers、Bun、Deno
- 希望一份路由表挂到多个 adapter，而不是为每个平台重写 handler
- 需要内置 CORS / JWT / validator，并且能接受 TypeScript 路径参数推导

**不适用**：

- 必须跑在 Node，又不想引入核心仓之外的 server adapter
- 已经堆了大量 Express middleware，迁移成本高于重写
- 需要本轮未核验的固定 bundle 大小或路由 benchmark 数字来做选型

## 固定版本边界

- 本文绑定 `honojs/hono@06880c4a...`，annotated tag `v4.13.5`、package 与 npm `gitHead` 均为同一提交。
- package 声明 `engines.node >= 16.9.0`，同时提供 import / require exports。
- 默认路由器是 `SmartRouter + RegExpRouter`，失败才落到 `TrieRouter`；探测完成后 `match` 被替换，路由表不再允许继续 `add`。
- 本文未安装依赖、运行 `runtime-tests` 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨运行时靠的是 Fetch 合同，不是“全能 adapter 目录”**——核心包里有哪些 adapter，要以 `src/adapter` 为准。
2. **默认路由器是启动时一次性竞选**——SmartRouter 把第一次 match 当成编译点。
3. **单 handler 快路径和洋葱链是两条代码**——不要用 compose 的语义去解释所有请求。
4. **中间件短路是可观察合同**——CORS 对 OPTIONS 直接 204，顺序必须写进注册表。

## 应用型自测

1. `new Hono()` 默认会先尝试哪两个路由器？`LinearRouter` 在哪个预设？
2. 某条路由只匹配到一个 handler 时，还会走 `compose` 吗？
3. 核心仓的 `src/adapter` 有没有 Node？`HEAD /users/1` 会不会原样当 HEAD 去 match？

检查点：

1. 先 `RegExpRouter` 再 `TrieRouter`；`LinearRouter` 在 `hono/quick`。
2. 不会。单 handler 直接调用。
3. 没有 Node adapter。`HEAD` 会按 `GET` dispatch，再包成空 body 响应。

## 延伸阅读

- 官方文档：[hono.dev](https://hono.dev/)
- 固定源码：[honojs/hono](https://github.com/honojs/hono) —— 本文绑定提交 `06880c4a2b04de9dd74217f26dd831209b9c01f1`
- 对照入口：`src/hono.ts`、`src/hono-base.ts`、`src/compose.ts`、`src/router/smart-router/router.ts`
- [[trpc]] —— 同样 TypeScript-first，但是 RPC 而不是 REST fetch 入口
- [[koa]] —— Hono `compose` 注释写明基于 koa-compose

## 关联

- [[bun]] —— Bun 可直接挂 `app.fetch`
- [[koa]] —— 洋葱中间件与 `next()` 语义的来源
- [[express]] —— Node 专属 req/res 模型的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[next-js]] —— Next.js — React 全栈框架
- [[query-string]] —— query-string — 可配置的查询串解析与序列化
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[ufo]] —— ufo — 给人读的 URL 工具箱
