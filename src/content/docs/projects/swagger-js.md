---
title: swagger-js — 按 OpenAPI 文档 resolve 并执行操作的 JS client
description: 把 Swagger 2 / OpenAPI 3.x 文档 resolve 成可执行接口，再由 fetch 发出真实 HTTP 请求
来源: https://github.com/swagger-api/swagger-js
日期: 2026-08-27
分类: projects
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/swagger-api/swagger-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c605554cd713fe6d84152510fafe4c9169088b71
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.38.0
---

## 是什么

swagger-js 是一个 **按 OpenAPI 文档找到操作、拼好请求、再用 fetch 发出去** 的 JavaScript 客户端。日常类比：openapi-typescript 只把说明书抄成类型；swagger-js 是拿着同一份说明书去窗口办事的人。

固定 3.38.0 的 npm 包名是 `swagger-client`。GitHub 仓库历史上叫 `swagger-api/swagger-js`，当前 canonical remote 重定向到 `swagger-api/swagger-client`。构造函数返回 **Promise**，实例挂在 `promise.client` 上。

```js
import SwaggerClient from "swagger-client";

const client = await SwaggerClient("https://petstore3.swagger.io/api/v3/openapi.json");
const res = await client.apis.pet.getPetById({ petId: 1 });
```

`new` 可省略。resolve 完成后，除非 `disableInterfaces`，否则会混入 `apis[tag][operationId](params)`。

## 为什么重要

不理解 resolve 与 execute 的分层，下面这些事会踩空：

- 为什么 `SwaggerClient(url)` 的返回值不能立刻 `.execute()`，必须先 await
- 为什么空 `servers` 会被改写成 `{ url: "/" }`
- 为什么 HTTP 4xx/5xx 会 throw，而不是返回带 `ok: false` 的 Response
- 为什么它能跑 Swagger 2.0，而 [[openapi-typescript]] 7.13.0 直接拒绝

它是 Swagger UI 背后那条“读文档 → 发请求”的运行时，不是文档渲染器本身。

## 核心要点

固定版本的主链可以拆成五步：

1. **构造并 resolve**：把 `url` 或 `spec` 交给策略链：OpenAPI 3.2 ApiDOM → 3.1 ApiDOM → 3.0 → Swagger 2.0 → generic。成功后写回 `this.spec` / `this.errors`。

2. **挂 tag 接口**：`makeApisTagOperation()` 按 `tags`（缺省 `default`）分组，每个 operation 绑定 `execute({ pathName, method, operationId })`。

3. **applyDefaults**：OpenAPI 2 且 spec URL 是 http(s) 时，缺省补 `host` / `schemes` / `basePath:'/'`。OpenAPI 3 在 `servers` 缺失或空数组时写成 `[{ url: "/" }]`。这会改内存里的 spec。

4. **buildRequest**：用 `operationId` 或 legacy `pathName+method` 找操作；按 2.0 / 3.x 选 parameter builder；处理 server URL、securities、cookie、`signal`。object/array body 在 execute 里再 `JSON.stringify`。

5. **http() 真正发请求**：默认用运行时 `fetch`（Node >= 22 原生）。`requestInterceptor` 在发出前运行；`!res.ok` 会 throw，并把原 response 挂到 `error.response`。

## 实践示例

### 案例 1：只拼请求，先不发

```js
import SwaggerClient from "swagger-client";

const req = SwaggerClient.buildRequest({
  spec,
  operationId: "getPetById",
  parameters: { petId: 1 },
});
```

`buildRequest` 是静态方法，不必先构造实例。适合单测里断言 URL / headers。

### 案例 2：静态 execute

```js
const res = await SwaggerClient.execute({
  spec,
  operationId: "getPetById",
  parameters: { petId: 1 },
  securities: { authorized: { api_key: "secret" } },
});
```

和实例方法走同一条 `buildRequest` → `http()` 链。`http` / `userFetch` 可替换。

### 案例 3：拦截器与取消

```js
const client = await SwaggerClient({
  url: specUrl,
  requestInterceptor: (req) => {
    req.headers.Authorization = `Bearer ${token}`;
    return req;
  },
});

const ac = new AbortController();
await client.execute({ operationId: "getPetById", parameters: { petId: 1 }, signal: ac.signal });
```

`signal` 被写进请求模板。multipart 时 http 层会删掉手工 `Content-Type`，让 fetch 自己补 boundary。

## 踩过的坑

1. **把构造结果当成同步 client**：`Swagger(url)` 返回 Promise。同步读 `client.apis` 会是 undefined。

2. **把 404 当成普通 Response**：固定 `http()` 在 `!res.ok` 时 throw。要看 body 得从 `error.response` 取。

3. **假设空 servers 保持原样**：`applyDefaults()` 会写入 `{ url: "/" }`。之后的绝对 URL 取决于你怎么解析 `/`。

4. **和 swagger-ui 当成同一个包**：UI 是另一个仓库。本包只负责 resolve / execute；README 仍保留对旧 UI 的 `helpers` 兼容导出。

5. **忽略安装期分析**：依赖 `@scarf/scarf`。不想参加安装统计，需要在自己的 package.json 写 `scarfSettings.enabled=false`，或设 `SCARF_ANALYTICS=false`。

## 适用 vs 不适用场景

**适用**：

- 浏览器或 Node 22+ 里，已经有 Swagger 2 / OpenAPI 3.0–3.2 文档，要按 tag/operationId 调接口
- 需要先 `buildRequest` 再自己决定是否发出
- 要与 Swagger UI 共享同一套 resolve / execute 语义

**不适用**：

- 只要 TypeScript 类型、不要运行时请求 → 看 [[openapi-typescript]]
- 不能升级到 Node 22，或必须继续用已 EOL 的 18/20
- 需要 gRPC / tRPC 那种非 OpenAPI 契约
- 主要需求是文档站 UI，而不是 JS client

## 固定版本边界

- 本文绑定 `swagger-api/swagger-js@c605554c...`。GitHub tag `v3.38.0` 与 npm `swagger-client@3.38.0` 的 `gitHead` 指向同一 commit。
- `package.json` 的 `engines.node` 为 `>=22`；入口是 CJS `lib/commonjs.js` + ESM `es/index.js`，用 `browser` 字段替换 btoa / AbortController。
- 兼容矩阵写明 2.0 与 OpenAPI 3.0.x / 3.1.0 / 3.2.0。3.1/3.2 走 ApiDOM 策略。
- 本文未安装依赖、未发真实请求、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **文档运行时和类型生成器是两条产品**：一份 spec 可以同时服务两者，但不能互相替代。
2. **构造即异步**：resolve 是 I/O；接口对象是 resolve 之后的派生产物。
3. **默认 http 把非 2xx 当异常**：这和原生 fetch 的 `ok` 语义不同。
4. **仓库名、npm 名、UI 名是三件事**：slug 仍叫 swagger-js，包叫 swagger-client，UI 是另一个项目。

## 应用型自测

1. `const c = SwaggerClient(url)` 之后立刻访问 `c.apis`，固定 3.38.0 会得到 tag 接口吗？
2. OpenAPI 3 文档的 `servers` 是 `[]`。实例 `execute()` 前会不会改 spec？
3. 操作返回 HTTP 404。默认 `http()` 是 resolve 出 response，还是 throw？

检查点：

1. 不会。返回值是 Promise，接口在 await 之后才挂上。
2. 会。空数组被替换为 `[{ url: "/" }]`。
3. throw。`error.response` 里才有原响应。

## 延伸阅读

- 仓库 README：[swagger-api/swagger-js](https://github.com/swagger-api/swagger-js) —— 本文绑定提交 `c605554cd713fe6d84152510fafe4c9169088b71`
- 构造与策略链：[src/index.js](https://github.com/swagger-api/swagger-js/blob/c605554cd713fe6d84152510fafe4c9169088b71/src/index.js)
- 执行与 http：[src/execute/index.js](https://github.com/swagger-api/swagger-js/blob/c605554cd713fe6d84152510fafe4c9169088b71/src/execute/index.js)
- [[openapi-typescript]] —— 同一份 3.x 文档的类型编译器
- [[axios]] —— 手写 HTTP client，不读 OpenAPI

## 关联

- [[openapi-typescript]] —— 编译期类型；不 resolve、不 fetch
- [[axios]] —— 通用 HTTP 客户端，interceptor 模型可对照 requestInterceptor
- [[ofetch]] —— fetch wrapper，默认解包 body，但没有 operation 索引
- [[fastapi]] —— 常见的 OpenAPI 文档生产者
- [[nestjs]] —— 另一侧常导出 OpenAPI 的服务端框架

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[openapi-typescript]] —— openapi-typescript — 把 OpenAPI 3 文档编译成 TypeScript AST
