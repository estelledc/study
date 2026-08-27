---
title: ofetch — 以 Fetch 为底座的跨运行时请求包装
来源: https://github.com/unjs/ofetch
日期: 2026-05-30
分类: 前端工程化
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/ofetch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 47fe80799e23406dd0fb1c504bb493b6a6d0a5af
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 1.5.0
---

## 是什么

ofetch 是一个建立在 Fetch API 上的 HTTP 客户端。日常类比：运输车仍由运行时提供，ofetch 负责整理地址、包装 JSON、解析回包、执行 hook，并按明确规则决定是否再发一次。

你写：

```ts
import { ofetch } from "ofetch";
const user = await ofetch<User>("/api/users/1");
```

普通调用直接返回解析后的 `_data`；需要状态码与 headers 时使用 `ofetch.raw()`。固定版本按导出条件区分浏览器、worker 与 Node 入口，Node 入口在缺少全局 Fetch 时会使用 `node-fetch-native`。

## 为什么重要

不理解 ofetch，下面这些事都没法解释：

- 为什么普通调用返回 body，而 `.raw()` 返回带 `_data` 的 Response
- 为什么 GET 默认可能重试一次，POST/PUT/PATCH/DELETE 默认不重试
- 为什么显式设置 `retry` 后，payload method 也会进入重试
- 为什么 SSR cookie、用户身份和请求去重不属于 ofetch 核心合同

## 核心要点

ofetch 的执行链可以拆成五步：

1. **合并 options**：instance defaults 与本次请求合并，headers、query/params 被单独规范化。

2. **运行 `onRequest` 并准备请求**：拼接 `baseURL`/query；payload method 的普通对象会被 stringify，并补 JSON headers。

3. **调用运行时 Fetch**：网络失败先进入 `onRequestError`；固定版本仅在没有既有 `signal` 时用 `AbortController` 实现 `timeout`。

4. **解析 response body**：根据 Content-Type 或 `responseType` 选择 JSON/text/blob/arrayBuffer/stream；JSON 默认使用 `destr`。

5. **运行 response hook 并处理错误/retry**：`onResponse` 在状态判断前运行；4xx/5xx 再进入 `onResponseError` 和 retry 规则，最终形成 `FetchError`。

## 实践示例

### 案例 1：POST 一份 JSON 不需要手动 stringify

```ts
const created = await ofetch<User>("/api/users", {
  method: "POST",
  body: { name: "Alice" }   // ← 直接传 object
});
```

ofetch 看到 body 是 plain object，自动 `JSON.stringify` + 自动加 `Content-Type: application/json`。要传 FormData / URLSearchParams 时，不动它原样直传。这就省掉了原生 fetch 那两句样板代码。

### 案例 2：建一个带 baseURL 和 retry 的实例

```ts
const api = ofetch.create({
  baseURL: "https://api.example.com",
  retry: 2,
  retryDelay: 500,
  retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  onRequest({ options }) {
    options.headers.set("X-Trace-ID", crypto.randomUUID());
  }
});

const data = await api<User[]>("/users");  // 实际请求 https://api.example.com/users
```

不显式配置时，非 payload method 默认重试一次，POST/PUT/PATCH/DELETE 默认零次，默认 delay 为 0。这里显式写 `retry: 2` 后，所有 method 都可能按状态码重试；调用方必须证明副作用可去重。

### 案例 2.5：拿原始 Response 看 status / headers

```ts
const res = await ofetch.raw<User>("/api/users/1");
console.log(res.status, res.headers.get("etag"), res._data);
```

普通 `ofetch(url)` 直接解包成数据；`ofetch.raw(url)` 返回完整 FetchResponse，多了 `status / statusText / headers / _data` 字段。需要做 ETag 缓存、读 Set-Cookie、看 304 状态码时用这个。

### 案例 3：严格解析 JSON

```ts
const data = await ofetch<User>("/api/users/1", {
  responseType: "json",
  parseResponse: JSON.parse
});
```

固定 1.5.0 默认使用 `destr`，对部分非标准 JSON 输入会容错。可信边界需要严格 JSON 时，应显式提供 parser；TypeScript 泛型本身不验证数据。

## 踩过的坑

1. **把默认 retry 说成幂等 method allowlist**：固定 1.5.0 实际按 payload method 分组；PUT/DELETE 默认不重试，显式数值则会覆盖这个默认。

2. **以为 retry 默认指数退避**：默认 `retryDelay` 是 0。需要退避、jitter 或尊重业务预算时必须显式实现。

3. **同时设置 signal 与 timeout**：固定实现只在没有 `signal` 时创建 timeout controller；已有 signal 时不能假定 `timeout` 仍会生效。

4. **把 `destr` 容错当 schema validation**：它是 parser，不会证明字段、类型或业务约束；外部数据仍需 zod/valibot 等 runtime schema。

5. **把 Nuxt SSR 行为归给 ofetch**：cookie 透传、payload hydration 和响应式缓存来自上层框架，不是本库单独保证。

## 适用 vs 不适用场景

**适用**：

- Nuxt 3 / Nitro / 任何基于 [[h3]] 的 server——开箱即用，零配置
- 具有标准 Fetch 的浏览器、worker 与现代运行时
- 需要自动 body 处理、response parsing、hook 与轻量 retry policy

**不适用**：

- 维护中的老 axios 项目——interceptor → hooks 是结构性重写，不是 rename
- 需要阶段 timeout、复杂 retry budget 或 Node Duplex stream 的服务
- 需要框架级身份透传、缓存或去重，但没有上层 integration
- 不能接受固定 1.5.0 的依赖与 parser 语义

## 固定版本边界

- 本文绑定 `unjs/ofetch@47fe8079...`，tag 与 package 均为 `1.5.0`。
- npm 把 1.5.1 标为 latest，但其 `gitHead` 在 canonical GitHub 仓库不可达，GitHub `v1.5.1` tag 又指向自报 2.0 alpha 的提交；升级前需重新建立可复查 provenance。
- 固定版本依赖 `ufo`、`destr`、`node-fetch-native`；条件 exports 为不同运行时选择入口。
- 本文未安装依赖、运行上游测试、发送请求或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架默认 = 独立库**——Nuxt 不重造 HTTP 客户端，只给 ofetch 起别名 `$fetch` + 注入 SSR 上下文。这种拆法让 ofetch 在非 Nuxt 项目里也能用，Nuxt 用户也能在需要时摸到底层
2. **依赖按职责切**——ufo 管 URL 拼接、destr 管 JSON 安全 parse、node-fetch-native 管 polyfill。代价是用户要"理解 N 个小包"
3. **默认策略必须按版本读源码**——retry method、delay 与 signal/timeout 组合都不能靠同类库经验外推。
4. **parsed 不等于 validated**——自动解包改善调用体验，却没有提高外部数据可信度。

## 应用型自测

1. 未显式配置 retry 的 PUT 请求收到 503，会自动重试吗？
2. POST 配置 `retry: 2` 后，是否仍因“payload method”而禁止重试？
3. 已传入 `AbortSignal`，同时设置 `timeout: 1000`。固定 1.5.0 是否一定创建 timeout controller？

检查点：

1. 不会；PUT 属于 payload method，默认 retry 为 0。
2. 不会禁止。显式数值覆盖默认，副作用安全需由调用方保证。
3. 不一定；固定实现只在没有既有 signal 时安装 timeout。

## 延伸阅读

- 文档：[unjs.io/packages/ofetch](https://unjs.io/packages/ofetch)（API 速查 + 例子）
- 固定源码：[unjs/ofetch](https://github.com/unjs/ofetch) —— 本文绑定提交 `47fe80799e23406dd0fb1c504bb493b6a6d0a5af`
- [[ky]] —— 同赛道竞品，ResponsePromise 与 retry/timeout 合同不同
- [[axios]] —— 上一代代表，interceptor 模式 vs hooks 模式对照
- [[destr]] —— ofetch 内部依赖，安全 JSON parse

## 关联

- [[ky]] —— 同赛道竞品；ofetch 多了框架集成，少了"零依赖"
- [[axios]] —— 老牌 HTTP 客户端；interceptor 模式 vs hooks 模式
- [[destr]] —— ofetch 用它做安全 JSON parse
- [[h3]] —— Nuxt 服务端 router；和 ofetch 是 Nitro 的两大支柱
- [[playwright]] —— 缺 mock 时的兜底方案之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[wretch]] —— wretch — 把 fetch 写成一条链
