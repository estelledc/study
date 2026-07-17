---
title: Got — Node 端以 Stream 为底座的 HTTP 客户端
来源: 'https://github.com/sindresorhus/got'
日期: 2026-05-30
分类: projects
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/got
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: e3924aa1e53a6ca3eb93a43618ce532442a89b40
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 15.1.0
---

## 是什么

Got 是一个 Node HTTP 客户端。它的核心 `Request` 继承 `Duplex`，默认调用再由 Promise 包装层收集响应、解析 body 并暴露 `.json()` 等 shortcut。日常类比：底层是一条可双向输送的管道，Promise API 是把管道里的结果装箱后再交给调用方。

这与 Ky 的 Fetch 包装路线不同：Got 自己管理 Node 请求、阶段 timeout、retry、hook、stream 与 Promise 适配。它也因此绑定 Node 运行时，不适用于浏览器或只提供 Web API 的 Edge 环境。

## 为什么重要

不理解 got，下面这些事都没法解释：

- 为什么 Promise 请求和 Stream 请求共享底层 `Request`，但 hook 与 retry 行为不完全相同
- 为什么默认 retry 两次仍不代表所有 method、状态码和错误都会重试
- 为什么 timeout 需要拆成 lookup、connect、response、read、request 等阶段
- 为什么已消费的 stream body 不能像 JSON body 一样直接重放

## 核心要点

Got 的执行链可以拆成五步：

1. **规范化 options**：`Options` 合并 instance defaults 和本次请求，形成 URL、headers、body、hook、timeout 与 retry policy。

2. **创建 Duplex Request**：`Request extends Duplex`，既能写入 request body，也能读取 response。`got.stream()` 直接暴露这条链路。

3. **Promise 包装可选**：默认 `got()` 用 `asPromise()` 监听底层 Request，收集并解析响应，再 resolve `Response` 或 body shortcut。

4. **按规则决定 retry**：默认 limit 为 2，但还要同时满足 method、status code 或 error code、`Retry-After` 与 delay 规则。默认 method 包含 GET、PUT、HEAD、DELETE、OPTIONS、TRACE、QUERY，不含 POST。

5. **每次 retry 创建新 Request**：Promise 包装层沿用更新后的 options；如果 body 仍是同一个已消费 stream，就以 `Cannot retry with consumed body stream` 失败。

## 实践示例

### 案例 1：集中配置 timeout 与 retry

把跨请求策略放进一个 `got.extend()` 实例：

```ts
import got from "got";

export const http = got.extend({
  prefixUrl: process.env.API_URL,
  timeout: {request: 5000, connect: 1000},
  retry: {
    limit: 2,
    methods: ["GET", "HEAD"],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
  hooks: {
    beforeRequest: [(options, {retryCount}) => {
      options.headers.authorization = `Bearer ${getToken()}`;
      options.headers["x-retry-count"] = String(retryCount);
    }],
    beforeRetry: [(error, retryCount) => {
      console.warn({code: error.code, retryCount});
    }],
  },
});
```

`request` timeout 是整个请求阶段预算，`connect` 只约束连接阶段；默认所有 timeout 都是关闭的。`beforeRetry` 当前签名是 `(error, retryCount)`，重试后的 `beforeRequest` 会再次运行。

### 案例 2：流式下大文件 + 进度

下载大文件时用 Stream API 与 `pipeline()` 保留反压：

```ts
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import got from "got";

const stream = got.stream("https://example.com/big.zip");
stream.on("downloadProgress", ({percent, transferred, total}) => {
  console.log(`${(percent * 100).toFixed(1)}%  ${transferred}/${total}`);
});
await pipeline(stream, createWriteStream("/tmp/big.zip"));
```

`await pipeline(...)` 会在任一 stream 失败时 reject，因此可以由外层 `try/catch` 处理并执行清理。若直接手写 `.pipe()`，则必须自己完整处理各端错误和生命周期。

### 案例 3：Promise API 解析 JSON

默认 API 在 Duplex Request 之上返回可装饰 Promise：

```ts
import got from "got";

const user = await got
  .get("https://api.example.com/users/42")
  .json<User>();
```

`.json<User>()` 会设置 JSON response type 并解析 body；`User` 只提供静态类型，不会验证外部响应。需要可信边界时仍要接 runtime schema。

## 踩过的坑

1. **把 limit=2 理解成任何失败都重试**：method、status code、error code 与 `Retry-After` 仍会阻止 retry；POST 默认不在 allowlist。

2. **默认重试 PUT/DELETE 不等于业务幂等**：如果服务端会发送消息或触发任务，应收窄 methods，并在服务端使用 idempotency key 或等价去重机制。

3. **给 stream body 开自动 retry 却不准备新 body**：第一次请求已经消费原 stream；重试前需要提供新可读 stream，否则 Promise 路径会拒绝重放。

4. **把 Promise hook 套到 Stream API**：`beforeRetry` 与 `afterResponse` 在 Stream API 中被忽略；Stream retry 需要监听 `retry` event 并重建输出与 body。

## 适用 vs 不适用场景

**适用**：

- Node 服务、爬虫或文件传输，需要一等 Stream API、阶段 timeout 与细粒度 retry policy
- 需要在共享 instance 中集中管理 Node 请求 options 与 hook
- 能满足当前 ESM 与 Node >=22 运行时要求

**不适用**：

- 浏览器或仅支持 Web API 的 Edge runtime
- 旧 Node 或 CommonJS 项目无法满足当前 package 合同
- 简单请求已由平台 fetch 满足，且不需要 Got 的 stream/retry/timeout 语义

## 固定版本边界

- 本文绑定 `sindresorhus/got@e3924aa1...`，package 版本为 `15.1.0`，要求 Node >=22。
- 固定 package 为 ESM；正文不把旧版 CommonJS 兼容方式外推到当前版本。
- 默认 retry limit 为 2；默认 timeout 的各阶段均为 `undefined`。
- 本文未安装依赖、发送网络请求、运行上游测试或性能 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **Promise 可以是 Stream 的消费视图**——Got 不是分别实现两套传输，而是在 Duplex Request 上叠加 buffer、parse 与错误合同。
2. **retry 是新请求，不是时间倒流**——method、副作用、body 可重放性和总预算都必须由调用方证明。
3. **阶段 timeout 比单一数字更可诊断**——连接慢、首包慢与读取慢对应不同故障和处置。
4. **共享底座不等于 API 完全等价**——Promise 与 Stream 对 hook、retry 和 body 消费有不同合同。

## 应用型自测

1. POST 请求收到 503，保留 `retry.limit: 2` 但不改 methods。会自动重试吗？
2. 使用 `createReadStream()` 作为 body，第一次请求失败后沿用同一个 stream。为什么第二次请求不能可靠重放？
3. 只配置 `timeout: {connect: 1000}`，能否保证整个请求 1 秒内结束？

检查点：

1. 默认不会；POST 不在 retry methods allowlist。
2. stream 已被消费或销毁，需要在 retry 前提供新的可读 body。
3. 不能；它只约束连接阶段，response、read 与 request 总预算仍未设置。

## 延伸阅读

- 官方文档：[got/readme.md](https://github.com/sindresorhus/got#readme)（功能矩阵 + 4 套 API 速查）
- 固定源码：[sindresorhus/got](https://github.com/sindresorhus/got) —— 本文绑定提交 `e3924aa1e53a6ca3eb93a43618ce532442a89b40`
- Stream 文档：[documentation/3-streams.md](https://github.com/sindresorhus/got/blob/main/documentation/3-streams.md)
- Retry 文档：[documentation/7-retry.md](https://github.com/sindresorhus/got/blob/main/documentation/7-retry.md)
- [[axios]] —— got 早年对标的"通用 HTTP 客户端"，今天在浏览器场景仍占主导
- [[ky]] —— 同作者 Sindre 的轻量 fetch wrapper，是 got 在 Edge 时代的"另一条腿"

## 关联

- [[axios]] —— 老牌 HTTP 客户端，浏览器+Node 双端，与 got 在 Node 服务场景直接竞争
- [[ky]] —— Sindre 同作者的 fetch 薄壳，与 got 互补覆盖 Edge 运行时
- [[ofetch]] —— UnJS / Nuxt 默认，function-style，跟 got 在"现代 Node 后端"赛道相邻
- [[wretch]] —— fluent FP / immutable middleware，和 got 在 API 设计哲学上对位
- [[tanstack-query]] —— 状态层（不是 HTTP 层）；用 got 取数据，用 TanStack Query 缓存
- [[fastify]] —— Node 后端框架；fastify 服务里用 got 出向调用，组合常见

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
