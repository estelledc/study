---
title: Undici — Node.js 官方 HTTP 客户端与 Fetch 实现
description: Node.js 官方 HTTP/1.1 客户端：Dispatcher 连接池、WHATWG fetch 与可选 retry 是三条不同合同
来源: https://github.com/nodejs/undici
日期: 2026-08-27
分类: HTTP 客户端
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nodejs/undici
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c8d80e6b2dcfab282557b08f51352937bc9e5692
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.10.0
---

## 是什么

Undici 是 Node.js 官方维护的 HTTP 客户端，也是运行时内置 `fetch` 的实现来源。日常类比：它先建一座按源站复用的调度台（Dispatcher），再在上面挂两条窗口——一条是 WHATWG `fetch()`，一条是 `request()` / `stream()` 这类 Node 原生风格 API。

你写：

```js
import { fetch, request, Agent, setGlobalDispatcher } from "undici";

const res = await fetch("https://example.com/api/users/1");
const { statusCode, body } = await request("https://example.com/api/users/1");
```

固定 8.10.0 在模块加载时会 `setGlobalDispatcher(new Agent())`。`fetch()` 默认走这个全局 Agent；`request()` 也一样，除非你显式传入 `dispatcher`。package 声明 Node `>=22.19.0`。

## 为什么重要

不理解 undici 这两条窗口，下面这些事都没法解释：

- 为什么 `request({ body })` 不写 method 时会变成 PUT，而 `fetch()` 默认仍是 GET
- 为什么 404/500 不会让 `fetch()` reject，却可能被 `RetryHandler` 当成可重试状态
- 为什么 timeout 要拆成 connect / headers / body，而不是一个总开关
- 为什么 Node 内置 fetch 换全局 dispatcher 会影响整个进程

## 核心要点

Undici 的执行链可以拆成五步：

1. **选择 Dispatcher**：默认全局 `Agent` 按 origin 建 `Pool`（`connections === 1` 时改用单连接 `Client`）。

2. **规范化请求**：`fetch()` 先构造 WHATWG `Request`；`request()` 走 `makeDispatcher`，缺 method 且带 body 时默认 PUT。

3. **建连与复用**：connector 默认 `connectTimeout=10s`；Client 默认 `headersTimeout`/`bodyTimeout` 各 300s，`keepAliveTimeout` 4s，`pipelining=1`。

4. **可选拦截与重试**：`compose()` 把 interceptor 包在 `dispatch` 外；retry 不是 fetch 默认，需 `RetryAgent` / `RetryHandler` / `interceptors.retry`。

5. **返回不同对象**：`fetch()` 得到 WHATWG `Response`；`request()` 得到 `{ statusCode, headers, body, trailers }`，body 是 Node 可读流。

## 实践示例

### 案例 1：同一进程里换掉全局 Agent

```js
import { Agent, fetch, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({
  connections: 16,
  connect: { timeout: 5_000 },
  headersTimeout: 30_000,
  bodyTimeout: 30_000
}));

const res = await fetch("https://example.com/health");
```

`fetch()` 没有自己的连接池；它问 `getGlobalDispatcher()`。这里改的是进程级默认，不只影响这一次调用。

### 案例 2：`request()` 的默认 method 陷阱

```js
import { request } from "undici";

// 固定 8.10.0：有 body、没写 method → PUT
const putLike = await request("https://example.com/items", {
  body: JSON.stringify({ name: "Ada" }),
  headers: { "content-type": "application/json" }
});

const posted = await request("https://example.com/items", {
  method: "POST",
  body: JSON.stringify({ name: "Ada" }),
  headers: { "content-type": "application/json" }
});
```

`makeDispatcher` 的规则是 `opts.method || (opts.body ? "PUT" : "GET")`。`fetch()` 不走这条规则。

### 案例 3：重试是选配件，而且默认不含 POST

```js
import { request, interceptors, Agent } from "undici";

const agent = new Agent().compose(interceptors.retry({
  maxRetries: 2,
  statusCodes: [429, 503]
}));

const { statusCode } = await request("https://example.com/flaky", {
  dispatcher: agent,
  method: "GET"
});
```

`RetryHandler` 默认 `maxRetries=5`、`minTimeout=500ms`、指数因子 2、上限 30s；method allowlist 含 GET/PUT/DELETE，不含 POST。未 compose retry 时，503 不会自动重发。

## 踩过的坑

1. **把 `request()` 当 `fetch()`**：前者默认 method 看有没有 body，后者默认 GET；前者返回 statusCode + stream，后者返回 WHATWG Response。

2. **以为 fetch 自带 retry**：固定版本的 fetch 路径不安装 RetryHandler。要重试必须显式挂 interceptor 或 RetryAgent。

3. **把 300s timeout 理解成“不会超时”**：headers/body 默认 300s，connect 默认 10s；设 `0` 才关闭对应阶段。

4. **`install()` 影响整个 `globalThis`**：它会覆盖 `fetch` / `Headers` / `WebSocket` 等；测试或多版本共存时要用局部 import，不要默认 install。

5. **HTTP 错误状态不是异常**：`fetch()` 对 4xx/5xx resolve；要当失败处理必须自己看 `res.ok` 或改用 `interceptors.responseError`。

## 适用 vs 不适用场景

**适用**：

- Node 22.19+ 服务端，需要连接池、HTTP/1.1 或可选 HTTP/2
- 希望和运行时内置 fetch 共享同一套 Dispatcher
- 需要 MockAgent、cache interceptor 或显式 retry 策略

**不适用**：

- 浏览器或只提供 Web API 的 Edge——那里应直接用运行时 fetch / [[ky]] / [[wretch]]
- 需要在 Node 16/18 上跑 userland Fetch——看 [[node-fetch]]
- 已经用 [[got]] 的 stream/hook 合同，且没有迁移预算
- 想要 axios 式 interceptor + 自动 JSON 解包，却不想自己处理 Dispatcher

## 固定版本边界

- 本文绑定 `nodejs/undici@c8d80e6b...`，tag、package 与 npm `gitHead` 均为 `8.10.0`。
- package `engines.node` 为 `>=22.19.0`。
- `request()` 缺 method 且带 body 时默认 PUT；`fetch()` 默认 GET、redirect `follow`、最多 20 次。
- Retry 默认不是 fetch 合同；启用后默认不含 POST。
- 本文未安装依赖、运行上游测试、发送请求或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **官方 fetch 仍是一层皮**——真正复用连接、超时和拦截的是 Dispatcher，不是 `fetch` 函数本身。
2. **同库两条 API 可以有不同默认 method**——不能用“这是 HTTP 客户端”四个字外推。
3. **Retry 必须显式打开**——默认 method allowlist 也不保护 POST 的副作用。
4. **全局 dispatcher 是进程资源**——测试隔离和多租户超时都要从 Agent 边界看。

## 应用型自测

1. `undici.request(url, { body: "x" })` 不写 method，实际会发什么动词？
2. 未 compose retry 的 `fetch(url)` 收到 503，会自动再发一次吗？
3. `fetch(url)` 收到 404，Promise 会 reject 吗？

检查点：

1. PUT。`makeDispatcher` 在有 body、无 method 时默认 PUT。
2. 不会。retry 是 opt-in interceptor / RetryHandler。
3. 不会。WHATWG fetch 对 HTTP 错误状态 resolve，需检查 `res.ok`。

## 延伸阅读

- 官方文档：[undici.nodejs.org](https://undici.nodejs.org)
- 固定源码：[nodejs/undici](https://github.com/nodejs/undici) —— 本文绑定提交 `c8d80e6b2dcfab282557b08f51352937bc9e5692`
- [[node-fetch]] —— 不依赖 undici 的 userland Fetch
- [[got]] —— Node Duplex 客户端，retry/timeout 合同不同
- [[ky]] —— 浏览器/跨运行时 Fetch 包装

## 关联

- [[node-fetch]] —— 同一 Fetch 外观，底层是 Node `http`/`https`
- [[got]] —— 另一条 Node HTTP 主链：Duplex + Promise 包装
- [[ky]] —— 薄 Fetch wrapper，不自建连接池
- [[ofetch]] —— 框架向 Fetch 包装，Node 回退曾走 node-fetch-native
- [[axios]] —— adapter 模型，和 Dispatcher 不是同一层抽象
- [[fastify]] —— 常见的服务端对端，客户端常直接用 undici

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
