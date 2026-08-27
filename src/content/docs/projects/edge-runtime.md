---
title: edge-runtime — 用 Node vm 模拟 Edge Web API 的本地运行时
description: 介绍 edge-runtime 4.0.1 如何用 Node vm、FetchEvent 与 undici primitives 在本机跑 Edge Function。
来源: https://github.com/vercel/edge-runtime
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vercel/edge-runtime
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d1fbe4ee5937c4ad7ff60b57d6f3db9d1e6ab18a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.1
---

## 是什么

`edge-runtime` 是一个 **Node.js 库 + CLI**，用来在本机执行「只看见 Web 标准 API」的 Edge Function。日常类比：它不是另开一台独立发动机，而是在现有 Node 进程里隔出一间小房间（`vm.createContext`），再把 `Request` / `Response` / `fetch` 摆进去。

固定 tag `edge-runtime@4.0.1` 的公开入口是：

```js
const { EdgeRuntime } = require('edge-runtime')

const runtime = new EdgeRuntime({
  initialCode: `
    addEventListener('fetch', event => {
      event.respondWith(new Response('ok'))
    })
  `,
})

const response = await runtime.dispatchFetch('https://example.com')
```

`packages/runtime/src/edge-runtime.ts` 把 `EdgeRuntime` **原样再导出** `@edge-runtime/vm` 的 `EdgeVM`。真正干活的是 Node 内置 `vm`，不是独立 V8 isolate，也不是 [[workerd]]。

## 为什么重要

不读固定 4.0.1，旧教程会把三件事说成一回事：

- Vercel Edge / Next.js middleware 的「Edge Runtime」产品名，和这个 npm 包
- Cloudflare Workers 的生产 isolate（[[workerd]]）
- 一个能完整替代 Node 的通用运行时

它只解决「在 Node 里如何 dispatch 一次 `fetch` 事件」。没有 Workers 的 binding、compatibility date，也没有独立进程沙箱。

## 核心要点

固定源码的主链可以拆成五步：

1. **建 realm**：`VM` 调用 `createContext({}, { name: 'Edge Runtime', codeGeneration })`。默认 `strings: false`、`wasm: true`，也就是关掉 `eval` / `new Function`，但允许 Wasm。

2. **灌 primitives**：`EdgeVM` 用 `@edge-runtime/primitives` 的 `load()` 注入 `fetch`、`Request`、`Response`、`FetchEvent`、`crypto` 等。`fetch` / `Request` 来自 **undici 6.21.0**，构造时默认补 `duplex: 'half'`。

3. **注册监听**：注入的 `addEventListener` 把 handler 放进隐藏的 `self.__listeners`。`fetch` 类型只允许 **一个** listener，再注册会抛 `TypeError`。

4. **dispatchFetch**：构造 `Request` + `FetchEvent`，调用那一个 listener。没有 listener、抛错、或返回值不是 `Response`，就变成 `500 Internal Server Error`。

5. **可选 HTTP 桥**：`createHandler` 把 Node `IncomingMessage` 转成 `dispatchFetch`；`GET` / `HEAD` 不带 body。CLI 只有加 `--listen` 才会 `runServer`。

## 实践示例

### 案例 1：模块里直接 `dispatchFetch`

```js
import { EdgeRuntime } from 'edge-runtime'

const runtime = new EdgeRuntime({
  initialCode: `
    addEventListener('fetch', event => {
      const url = new URL(event.request.url)
      event.respondWith(new Response(url.pathname))
    })
  `,
})

const res = await runtime.dispatchFetch('https://local/hello')
await res.text() // "/hello"
```

`FetchEvent.respondWith` 只是把 `event.response` 存下来；`dispatchFetch` 再 `Promise.resolve(event.response)`。`waitUntil` 收到的 promise 进 `event.awaiting`，最终挂到返回值的 `response.waitUntil()`。

### 案例 2：CLI 默认不听端口

```sh
npx edge-runtime --eval "1 + 1"
npx edge-runtime worker.js
npx edge-runtime --listen --port 3000 worker.js
```

无脚本路径就 spawn REPL。有脚本但没有 `--listen` 时，只 `evaluate('')` 跑完 `initialCode` 就退出。`--listen` 默认 `127.0.0.1:3000`；`EADDRINUSE` 会 **+1 端口重试**，不是失败退出。

### 案例 3：跨 realm 的 `instanceof` 被补过

```js
new TextEncoder().encode('hello') instanceof Uint8Array
```

`TextEncoder` 来自 Node realm，`Uint8Array` 在 vm context 里本不是同一个构造器。固定源码用 `Proxy` 补 `Symbol.hasInstance`，让 `Object` / `Array` / `Uint8Array` / `ArrayBuffer` / `Error` 等一组 transferable constructors 两边都能认。

## 踩过的坑

1. **把它当成独立 isolate**：它和宿主 Node 共享进程、事件循环和 `process.on('unhandledRejection')`。handler 是按需挂到当前进程上的。

2. **注册两个 `fetch` listener**：第二个 `addEventListener('fetch', ...)` 直接抛错。没有「后写覆盖」或中间件链。

3. **以为 CLI 一运行就是 HTTP 服务**：必须显式 `--listen`。只传文件名等于加载脚本后立刻结束。

4. **把 `packages/runtime/README.md` 的 MPLv2 当许可**：同提交的 `LICENSE.md` 与各包 `package.json` 写的是 **MIT**。以 `LICENSE.md` 为准。

5. **把 npm `gitHead` 当交叉验证**：本轮 `npm view edge-runtime@4.0.1` **没有** `gitHead`。绑定的是 annotated tag 剥皮提交。

## 适用 vs 不适用场景

**适用**：

- 在 Node 测试或 CLI 里跑一段 `addEventListener('fetch')` / `Response` 代码
- 需要本地复现 Vercel Edge / Next.js middleware 那套 Web API 子集
- 接受 `engines.node >= 18`，以及 fetch 走 undici 而不是浏览器引擎

**不适用**：

- 要 Cloudflare Workers 的 isolate、binding、compatibility date——看 [[workerd]]
- 要通用 JS 运行时、包管理或权限模型——看 [[bun]] / [[deno]] / [[node-js]]
- 不能接受「同一 Node 进程里的 vm context」当隔离边界
- 需要多 fetch listener 或框架级中间件链——应自己在一个 listener 里编排，或换 [[hono]]

## 固定版本边界

- 本文绑定 `vercel/edge-runtime@d1fbe4ee5937c4ad7ff60b57d6f3db9d1e6ab18a`，annotated tag `edge-runtime@4.0.1` 剥皮至此提交；`packages/runtime` version 为 `4.0.1`，`@edge-runtime/vm` 为 `5.0.0`，`@edge-runtime/primitives` 为 `6.0.0`。
- 根仓 `package.json` 是 private `@edge-runtime/root@0.0.0`；npm 发布物是子包。npm `edge-runtime@4.0.1` 本轮未给出 `gitHead`。
- `globalThis.EdgeRuntime` 被写成字符串 `'edge-runtime'`，用来让用户代码探测环境。
- 本文未安装依赖、未跑上游 test、未测 HTTP 或 isolate 性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **产品名和实现不是一层**——「Edge Runtime」在文档里常指平台约束；这个包是 Node `vm` + undici primitives。
2. **事件模型极窄**——一个 `fetch` listener，`respondWith` 只存响应，`waitUntil` 只收 promise。
3. **CLI 的默认动作是求值，不是监听**——`--listen` 才架 Node `http` 服务器。
4. **跨 realm 的类型相等要补**——`instanceof` 对 TypedArray / Error 默认会骗你。

## 应用型自测

1. `new EdgeRuntime()` 会不会启动一个独立于当前 Node 进程的 V8 isolate？
2. 同一脚本里两次 `addEventListener('fetch', handler)` 会怎样？
3. `edge-runtime worker.js` 不带 `--listen` 时，会不会在 3000 端口听请求？

检查点：

1. 不会。它是 `vm.createContext` 建出的 realm，和宿主共享进程。
2. 第二次抛 `TypeError`：只能注册一个 fetch listener。
3. 不会。没有 `--listen` 只执行 `initialCode` 后退出。

## 延伸阅读

- 文档：[edge-runtime.vercel.app](https://edge-runtime.vercel.app/)
- 固定源码：[vercel/edge-runtime](https://github.com/vercel/edge-runtime) —— 本文绑定 `d1fbe4ee5937c4ad7ff60b57d6f3db9d1e6ab18a`
- [[workerd]] —— 真正的 Workers isolate 与 Cap'n Proto 配置
- [[hono]] —— 同一套 `Request` / `Response`，但入口是 `app.fetch`
- [[node-js]] —— 这个包寄居的宿主

## 关联

- [[workerd]] —— 生产 Workers 运行时对照：独立 V8 + capability binding
- [[hono]] —— 多运行时 Web 框架，可把 `fetch` 交给这个包
- [[next-js]] —— 平台文档里的 Edge Runtime 产品名来源之一
- [[bun]] —— 另一条「单二进制跑 TS / HTTP」路线
- [[deno]] —— 默认拒绝权限的对照运行时
- [[postgres-js]] —— 条件导出里出现 `workerd`，不是这个 Node vm 包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[workerd]] —— workerd — Cloudflare Workers 同源的 JS/Wasm 服务器运行时
