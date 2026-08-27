---
title: srvx — 用 Web 标准 fetch 挂上各运行时的 HTTP 服务器
description: 看 srvx 如何把一份 fetch handler 接到 Node、Bun、Deno 与 Workers，以及默认端口、中间件折叠和 body 上限的真实合同。
来源: https://github.com/h3js/srvx
日期: 2026-08-27
分类: backend-api
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/h3js/srvx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 053be62e5e9e1f1966ab8592f1254ac40ac00317
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: '0.12.7'
---

## 是什么

srvx 是一个以 Web 标准 `Request` / `Response` 为合同的通用 HTTP 服务器。日常类比：你只写发动机（`fetch`），底盘（Node http、Bun.serve、Deno.serve、Workers）由条件导出换上；它不帮你选路，那是 [[hono]] / [[elysia]] 的事。

你写：

```ts
import { serve } from "srvx"

const server = serve({
  fetch(request) {
    return Response.json({ href: request.url })
  },
})
```

固定 0.12.7 里，根导出按运行时选 adapter：`node`、`bun`、`deno`、`workerd`（Cloudflare）、`browser`（service-worker），其余走 `generic`。`generic.serve()` 是空操作，只留下 `server.fetch` 给宿主去挂。

## 为什么重要

不读这层服务器合同，就解释不了下面几件事：

- 为什么同一份 `fetch` 能在 Bun 上直接 `listen`，在 Cloudflare 上却只是一个 handler
- 为什么默认会监听 `3000` 和全部网卡，却不能默认相信 `X-Forwarded-*`
- 为什么构造后再往 `server.options.middleware` 塞函数看不到效果
- 为什么 Node 上奇怪的 request-target 会直接 400，而 body 超限又不一定自动回 413

## 核心要点

srvx 的启动链可以拆成五步：

1. **选 adapter**：条件 exports 决定 `serve()` 实现。Node 会建 `http` / `https` / `http2` 服务器；Bun / Deno 调原生 `serve`；generic / Cloudflare / service-worker 不 listen。

2. **装插件与错误层**：用户 `plugins` 先跑；`error` 被 unshift 成最外层中间件，同步抛错和 Promise rejection 都交给它。

3. **折叠 middleware**：`wrapFetch` 在构造时从后往前包一层。注释写明：之后再改数组没有效果。

4. **解析监听地址**：端口是 `options.port ?? process.env.PORT ?? 3000`，非法值抛 `RangeError`；hostname 是 `options.hostname ?? process.env.HOST`，缺省绑定全部接口。

5. **按运行时读 body / 代理头**：`trustProxy` 默认 `false`。`maxRequestBodySize` 默认不限制；Bun 映射原生选项并在 handler 前 413，Node / Deno 在读 body 时抛 `ERR_BODY_TOO_LARGE`。

## 实践示例

### 案例 1：先拿到 fetch，再决定要不要 listen

```ts
import { serve } from "srvx"

const server = serve({
  manual: true,
  fetch: () => new Response("ok"),
})

export default { fetch: server.fetch }
```

Workers 或测试宿主只要 `fetch`。`manual: true` 阻止 Node / Bun 在构造时自动 `listen`。generic adapter 即使不设 `manual`，`serve()` 也什么都不做。

### 案例 2：中间件必须在构造时给齐

```ts
const server = serve({
  fetch: () => new Response("ok"),
  middleware: [
    async (request, next) => {
      const res = await next()
      res.headers.set("x-mw", "1")
      return res
    },
  ],
})
```

`error` 会再被塞到数组最前面。构造完成后 push 新中间件，固定实现不会重新 `wrapFetch`。

### 案例 3：TLS 在 Node 上默认打开 HTTP/2

```ts
serve({
  fetch: () => new Response("ok"),
  tls: { cert: "...", key: "..." },
})
```

有证书且 `protocol` 不是 `"http"` 时，Node adapter 走 `http2.createSecureServer({ allowHTTP1: true })`。只开 `node.http2` 却不给证书会抛错。`reusePort` 会把 Node 的 `exclusive` 设成相反值。

## 踩过的坑

1. **把 srvx 当路由器**：它没有 method / path 表。路由是上层框架的工作。

2. **默认相信反代头**：`trustProxy` 默认关闭。随便信任 `X-Forwarded-For` 等于让客户端伪造 IP 和 scheme。

3. **以为超限会自动变成 HTTP 413**：Node / Deno 只在消费 body 时抛带 `statusCode: 413` 的错误；没有 `error` handler 时，要自己映射响应。Bun 才在进 handler 前原生 413。

4. **在 CI 里等 SIGTERM 优雅退出**：`CI` 或 `TEST` 为真时，默认不装 graceful shutdown。

5. **把 Node 当成会拒绝一切脏 URL 的运行时**：llhttp 会放行部分非 Fetch URL；srvx 对非 `/...`、非合法 `http(s)` absolute-form、非 `*` 的目标回 400。

## 适用 vs 不适用场景

**适用**：

- 已经有一份 `(request) => Response`，只差一个跨运行时 listen / fetch 出口
- 要在 Node 上拿到接近原生 `http.Server` 的句柄，同时给 Bun / Deno 留同一 API
- 需要明确的反代、TLS、body 上限开关，而不是框架默认值

**不适用**：

- 需要路由、校验、RPC 或渲染——应叠 [[hono]] / [[elysia]] / [[express]]
- 必须把 Node 核心 adapter 排除在依赖树外
- 要用本轮未核验的 bench 数字做选型

## 固定版本边界

- 本文绑定 `h3js/srvx@053be62e...`，annotated tag `v0.12.7`，仓内 `package.json` 为 `0.12.7`。
- npm latest 同为 `0.12.7`，但 packument **没有** `gitHead`；revision 只由 GitHub tag 对齐，不能用 npm gitHead 交叉验证。
- `engines.node >= 20.16.0`。零运行时依赖；发布物是 `bin` + `dist`。
- 本文未安装依赖、运行 vitest / bench，也未 listen，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨运行时服务器先统一 fetch，再换 socket**——generic 路径证明 listen 不是合同本身。
2. **中间件是编译期折叠，不是可变管道**——和“随时 `app.use`”的框架经验相反。
3. **默认值偏暴露、偏不信任代理**——`3000` + 全接口，但 `trustProxy=false`。
4. **body 上限的 HTTP 语义因运行时而异**——同一选项，Bun 先 413，Node 后抛错。

## 应用型自测

1. 不传 `port` / `HOST` / `PORT` 时，固定 0.12.7 听哪个端口、绑哪类地址？
2. 构造结束后把函数推进 `server.options.middleware`，下一次请求会跑到它吗？
3. `maxRequestBodySize` 未设置时有没有默认上限？Node 超限是自动 413 响应，还是读 body 时抛错？

检查点：

1. 端口 `3000`，hostname 未设时绑定全部接口。
2. 不会。`wrapFetch` 只在构造时折叠一次。
3. 没有默认上限。Node / Deno 在消费 body 时抛 `ERR_BODY_TOO_LARGE`。

## 延伸阅读

- 文档：[srvx.h3.dev](https://srvx.h3.dev/)
- 固定源码：[h3js/srvx](https://github.com/h3js/srvx) —— 本文绑定提交 `053be62e5e9e1f1966ab8592f1254ac40ac00317`
- 对照入口：`src/adapters/node.ts`、`src/_middleware.ts`、`src/body-limit.ts`
- [[crossws]] —— 同一作者线的跨运行时 WebSocket，Node 插件挂在 srvx 的 `upgrade`
- [[hono]] —— 在 srvx 之上补路由与中间件生态

## 关联

- [[crossws]] —— HTTP server 对应的 WebSocket 适配层
- [[hono]] —— 多运行时 Web 框架，例子里可以直接挂 srvx
- [[ofetch]] —— 同一生态的 Fetch 客户端，方向相反
- [[bun]] —— Bun adapter 直接调用 `Bun.serve`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[crossws]] —— crossws — 把各运行时的 WebSocket 收成同一套 hooks

- [[crossws]] —— crossws — 把各运行时的 WebSocket 收成同一套 hooks
