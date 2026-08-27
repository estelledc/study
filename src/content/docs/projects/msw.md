---
title: MSW — 在网络层用同一套 handler 拦截请求
description: "介绍 MSW 如何把 handler 大脑与浏览器 Service Worker / Node interceptor 分开。"
来源: https://github.com/mswjs/msw
日期: 2026-08-27
分类: projects / 测试工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mswjs/msw
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 49d9d47f613b072f8d20e1a025feaee7c5382b2b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.15.0
---

## 是什么

MSW（Mock Service Worker）是一套**不改业务调用点**的 HTTP / GraphQL / WebSocket mock。日常类比：水龙头（`fetch` / `http.request`）和水（URL）都不变，滤芯装在水管中间。

你写：

```ts
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("/users/:id", ({ params }) =>
    HttpResponse.json({ id: params.id, name: "Jason" })
  )
);
```

固定 2.15.0 的 handler 写一次，浏览器走 `msw/browser`，Node 走 `msw/node`。包 exports 把 `./browser` 标成 `node: null`，把 `./node` 标成 `browser: null`。

## 为什么重要

不读这条拦截链，下面几件事会讲错：

- 为什么同一份 `http.get` 能同时服务 Vitest 和 Storybook
- 为什么默认漏 mock 只是 `'warn'`，不是自动报错
- 为什么 `setupWorker()` 在 Node 里会直接 invariant 失败
- 为什么 v1 的 `rest.get(req, res, ctx)` 不能抄到 2.15.0

## 核心要点

固定版本的控制流可以拆成五步：

1. **选入口**：`setupServer` 用 `@mswjs/interceptors` 的 ClientRequest、XMLHttpRequest、Fetch、WebSocket；`setupWorker` 先拒绝 Node，再选 Service Worker 或 fallback HTTP source。
2. **共享大脑**：请求进入 `handleRequest()`。带 `accept: msw/passthrough` 的请求直接放行。
3. **按顺序找 handler**：`executeHandlers()` 遍历数组；第一个带 `response` 的结果胜出，只有匹配没有 response 的 handler 可以继续往下掉。
4. **URL 匹配**：`matchRequestUrl()` 先规范化路径，再用 `path-to-regexp`。`:id` 和通配符在 `coercePath()` 里改写成它能吃的语法。
5. **未处理策略**：找不到 handler 时跑 `onUnhandledRequest`，默认 `'warn'`。`'error'` 会抛 `InternalError`，阻止穿透到真网络。

## 实践示例

### 案例 1：Node 测试里把漏 mock 升级成错误

```ts
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer(
  http.get("https://api.example.com/users/:id", ({ params }) =>
    HttpResponse.json({ id: params.id, name: "mocked" })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`listen()` 默认仍是 `'warn'`。这里显式改成 `'error'`，漏写的请求不会静默打到外网。`resetHandlers()` 清掉 `server.use()` 追加的一次性 handler。

### 案例 2：浏览器入口必须等网络启用

```ts
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

if (import.meta.env.DEV) {
  const worker = setupWorker(...handlers);
  await worker.start();
}
```

`start()` 是 async 的：它要 `network.enable()`，Service Worker 路径还要等 registration。固定版本已把 `waitUntilReady` 标成 deprecated；正确做法是 await `start()`，而不是依赖这个旧开关。

### 案例 3：运行时覆盖一条 handler

```ts
test("renders error state", async () => {
  server.use(
    http.get("/users/:id", () => new HttpResponse(null, { status: 500 }))
  );
  render(<UserPage id="42" />);
  expect(await screen.findByText(/出错/)).toBeInTheDocument();
});
```

`use()` 把 handler 插到查找顺序的前面。`{ once: true }` 可以让某条 handler 用一次后失效。这是测试态覆盖，不是改业务代码。

## 踩过的坑

1. **把默认未处理策略写成 error**：`listen()` / `start()` 默认 `'warn'`。要 fail-closed 必须显式传 `'error'`。
2. **在 Node 里调用 `setupWorker`**：源码第一行用 `isNodeProcess()` invariant。Node 测试只能走 `msw/node`。
3. **不 await `worker.start()`**：首屏 `fetch` 可能发生在 Service Worker 还没 enable 之前，看起来像偶发漏拦截。
4. **抄 v1 API**：`rest.get((req, res, ctx) => res(ctx.json(...)))` 已不存在；2.15.0 是 `http.get` + `HttpResponse`。
5. **把 `defineNetwork` 当稳定公开主 API**：`SetupServerApi` / `SetupWorkerApi` 已 deprecated，但文档和现有集成仍以 `setupServer` / `setupWorker` 为入口。

## 适用 vs 不适用场景

**适用**：

- 浏览器 + Node 要共用同一份 API 合同（单测、Storybook、本地假后端）
- 业务代码不想为测试抽一层 `jest.mock('./api')`
- 需要按请求标准对象（`Request` / `Response`）写 resolver

**不适用**：

- 只要拦 Node `http`、不想装 Service Worker → 用 [[nock]]
- 只跑 Playwright / Cypress E2E，平台自带 route / intercept 已够
- 需要带关联表的全栈假资源 → MSW 不做 ORM
- 生产流量改写或灰度路由 → 这是测试 / 开发工具

## 固定版本边界

- 本文绑定 `mswjs/msw@49d9d47f...`，Git tag 为 `v2.15.0`，包版本为 `2.15.0`。
- npm `msw@2.15.0` 没有 `gitHead`；升级前应再核 GitHub tag，不要假设 registry 对象等于该提交。
- engines 写 `node >= 18`；Node 拦截依赖 `@mswjs/interceptors ^0.41.3`。
- 本文未安装依赖、运行上游测试、注册 Service Worker 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **mock 边界在网络层**——业务继续调用真实 client，测试替换的是传输，不是模块图。
2. **入口分叉、大脑不分叉**——browser / node / native 只换 source，handler 查找是同一套。
3. **默认策略必须读源码**——`'warn'` 不会保护 CI 免于漏网请求。
4. **标准 Request/Response 是跨端合同**——v2 用它替换了 v1 的 `req/res/ctx`。

## 应用型自测

1. 不传 `onUnhandledRequest` 时，未匹配请求会抛错并阻止真网络吗？
2. 两个 `http.get('/users/:id')` handler 都匹配，且都返回 `HttpResponse`，谁生效？
3. 在 Vitest 里调用 `setupWorker()` 会怎样？

检查点：

1. 不会。默认 `'warn'`，请求按 passthrough 处理。
2. 数组里先出现且带 `response` 的那条。
3. `isNodeProcess()` 为真时 invariant 失败；应改用 `setupServer`。

## 延伸阅读

- 官方文档：[mswjs.io](https://mswjs.io)
- 固定源码：[mswjs/msw](https://github.com/mswjs/msw) —— 本文绑定提交 `49d9d47f613b072f8d20e1a025feaee7c5382b2b`
- v1 → v2 迁移：[migrations/1.x-to-2.x](https://mswjs.io/docs/migrations/1.x-to-2.x)
- [[nock]] —— Node 侧 Scope/Interceptor；v14 也用 `@mswjs/interceptors`
- [[vitest]] —— 常见的 `setupFiles` 注入点
- [[storybook]] —— story 级 handler 复用

## 关联

- [[nock]] —— Node-only 对照：一次用完的 interceptor vs 常驻 handler 表
- [[vitest]] —— Node 测试 runner
- [[playwright]] —— E2E 自带 `route`，和 MSW 分层不同
- [[jest]] —— `jest.mock` 是业务侵入式对照
- [[storybook]] —— 用 addon 注入同一份 handler
- [[wretch]] —— 以标准 Fetch 为底座，适合被 MSW 拦截

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nock]] —— nock — 用 Scope 和一次用完的 interceptor 假扮 Node HTTP
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[wretch]] —— wretch — 把 fetch 写成一条链
