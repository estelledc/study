---
title: crossws — 把各运行时的 WebSocket 收成同一套 hooks
description: 看 crossws 如何按连接解析 hooks、默认不回显子协议，以及它怎样挂到 srvx 的 upgrade。
来源: https://github.com/h3js/crossws
日期: 2026-08-27
分类: backend-api
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/h3js/crossws
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6d366f8b6d2ddd0276fd9eb9962a223f1a68429e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: '0.4.12'
---

## 是什么

crossws 是一套跨运行时 WebSocket 工具：你写 hooks，它按平台换成 Node `ws`、Bun / Deno 原生升级、Cloudflare、SSE 或 uWebSockets。日常类比：对讲机面板相同，底下换不同电台；房间名默认就是 URL 的 pathname。

你写：

```ts
import { serve } from "crossws/server"

serve({
  fetch: () => new Response("ok"),
  websocket: {
    message(peer, message) {
      peer.send(message.text())
    },
  },
})
```

固定 0.4.12 已删除 0.2.x 的 `createCrossWS`。现在是 `defineHooks` + 各 `adapters/*`，以及 `crossws/server` 把 WebSocket 接到 [[srvx]]。`srvx` 是可选 peer（`>=0.11.5`）。

## 为什么重要

不理解 hooks 解析和握手默认值，就解释不了：

- 为什么同一连接的 `message` 不会每次都重跑 `resolve` / `fetch`
- 为什么浏览器带了 `Sec-WebSocket-Protocol`，服务端默认却不回显，连接会被浏览器拒绝
- 为什么把 hooks 写在 `Response` 上，中间件一重建响应就丢
- 为什么 default server 导出不是真 WebSocket，而是 SSE 并打印警告

## 核心要点

一次升级可以看成五步：

1. **选 adapter**：`crossws/server` 条件导出 node / bun / deno / workerd；其余 default 走 SSE adapter，并 `console.warn`。

2. **upgrade hook**：可返回 headers / protocol / namespace / context，或直接返回 / 抛出 `Response` 拒绝；`handled: true` 表示 hook 自己接管了 socket。

3. **解析 hooks**：全局 `hooks` 与 `resolve(request)` 并行。`resolve` 按连接 `context` WeakMap 只执行一次；失败会删缓存，后续事件可重试。

4. **默认 namespace**：`getNamespace?.(request) ?? new URL(request.url).pathname`。空 namespace 在 publish 时会抛错。

5. **保活与扇出**：`idleTimeout` 默认 30 秒。Node 用 `ws` + `crossws-ping` 心跳；Bun / Deno / uWS 映射原生 idle。`peer.publish` 本地扇出，可选 sync 背板是 fire-and-forget。

## 实践示例

### 案例 1：内联 hooks，不要默认 fetch resolver

```ts
import { serve } from "crossws/server"

serve({
  fetch: () => new Response("http ok"),
  websocket: {
    message(peer, message) {
      peer.send(message.text())
    },
  },
})
```

只要 `websocket` 上出现任一 hook 函数，`defaultResolve` 就返回 `undefined`，不再为每个事件调用 `fetch`。内联 hooks 和“从 app 解析 hooks”是互斥模式。

### 案例 2：把 hooks 挂在 Request 上，避免 Response 被重建

```ts
import { setWebSocketHooks } from "crossws"

export default {
  fetch(request: Request) {
    setWebSocketHooks(request, {
      message(peer, message) {
        peer.send(message.text())
      },
    })
    return new Response(null, { status: 426 })
  },
}
```

默认 resolver 先跑 `server.fetch`。hooks 写在 `Symbol.for("crossws.hooks")`（也可写在 `request.context`）或 `response.crossws`。注释写明：中间件常 `new Response(res.body, res)`，自己的属性会丢；Request 更稳。带 request hooks 的 `426` 仍视为升级；孤立 `426` 会 `warnOnce`。`401` 等错误响应会原样拒绝握手。

### 案例 3：子协议必须显式接受

```ts
import adapter from "crossws/adapters/node"

const ws = adapter({
  handleProtocols: (protocols) =>
    protocols.has("graphql-transport-ws") ? "graphql-transport-ws" : false,
})
```

默认不接受任何子协议。浏览器 `new WebSocket(url, ["graphql-transport-ws"])` 在服务端不回显时会关连接。upgrade hook 的 `{ protocol }` 优先于 header，再才是 `handleProtocols`。

## 踩过的坑

1. **继续找 `createCrossWS`**：0.2.x API 已删除，入口在 `src/index.ts` 写明。

2. **假设 default `crossws/server` 就是 WebSocket**：非 Node/Bun/Deno/workerd 时走 SSE，并要求专用客户端。

3. **把 namespace 当成 bun / uWS 的硬隔离**：这两类 native pub/sub 按 topic 全应用广播，跨 namespace 的同名 topic 仍可能互相听到。

4. **把 hooks 只挂在 Response 上**：任何重建响应的中间件都会拆掉 `crossws` 属性。

5. **把 30 秒 idle 当成关闭**：它是无消息 / 无 pong 才回收半开连接；活着的客户端会自动 pong。设 `0` 关闭探测。

## 适用 vs 不适用场景

**适用**：

- 已经用 [[srvx]] / h3 写 fetch，想在同一入口加 WebSocket
- 需要 Node `ws`、Bun、Deno、Cloudflare 共用 hooks
- 能接受默认不协商子协议、默认 30 秒空闲探测

**不适用**：

- 要 Socket.IO 那种自动降级长轮询和房间协议——看 [[socket-io]]
- 不能引入可选 peer `srvx`，又想用 `crossws/server` 的 Node 插件路径
- 需要本轮未核验的吞吐或 uWS 对比数字

## 固定版本边界

- 本文绑定 `h3js/crossws@6d366f8b...`，annotated tag `v0.4.12`，仓内 version 为 `0.4.12`。
- npm latest 同为 `0.4.12`，packument **没有** `gitHead`。
- LICENSE 文件是 MIT；GitHub 仓库 license metadata 显示 Other，不以 metadata 覆盖文件。
- optional peer：`srvx >= 0.11.5`。
- 本文未安装依赖、未跑 vitest、未连真实 WebSocket，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨运行时 WS 的稳定面是 hooks，不是某个 socket 类**——adapter 负责升级，peer 负责发送。
2. **`resolve` 是每连接一次，不是每条消息一次**——默认 resolver 才因此敢去调 `fetch`。
3. **握手默认严格**——不回显子协议、不把普通 4xx 当成静默升级。
4. **Request 比 Response 更适合当 hooks 载体**——响应对象太容易被换掉。

## 应用型自测

1. 不传 `handleProtocols`、upgrade 也不返回 `protocol` 时，服务端会不会回显客户端的子协议？
2. 同一连接的第二条 `message` 还会再调用一次 `resolve` 吗？`resolve` 第一次失败后呢？
3. `crossws/server` 在既不是 Node / Bun / Deno / workerd 的导出条件下，会启用哪种 adapter？

检查点：

1. 不会。默认接受“无子协议”。
2. 不会再跑；失败的 Promise 会从 WeakMap 删掉，后续事件可以重试。
3. SSE adapter，并打印警告。

## 延伸阅读

- 文档：[crossws.h3.dev](https://crossws.h3.dev)
- 固定源码：[h3js/crossws](https://github.com/h3js/crossws) —— 本文绑定提交 `6d366f8b6d2ddd0276fd9eb9962a223f1a68429e`
- 对照入口：`src/hooks.ts`、`src/server/_resolve.ts`、`src/server/node.ts`
- [[srvx]] —— Node 插件把 `upgrade` 挂到 `server.node.server`
- [[socket-io]] —— 带降级与房间协议的另一条实时栈

## 关联

- [[srvx]] —— HTTP listen / fetch 底座；crossws server 插件的可选 peer
- [[socket-io]] —— 事件协议 + 长轮询降级，合同更厚
- [[hono]] —— 可与 crossws / h3 同一条 fetch 链
- [[bun]] —— Bun adapter 走原生 `server.upgrade`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[srvx]] —— srvx — 用 Web 标准 fetch 挂上各运行时的 HTTP 服务器

- [[srvx]] —— srvx — 用 Web 标准 fetch 挂上各运行时的 HTTP 服务器
