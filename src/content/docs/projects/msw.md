---
title: MSW — 让 mock 不改业务代码，在网络层透明拦截
来源: 'https://github.com/mswjs/msw'
日期: 2026-05-30
分类: projects / 测试工具
难度: 中级
---

## 是什么

MSW（**Mock Service Worker**）是一套**让你不改业务代码就能 mock 网络请求**的库。日常类比：像在水管中间装一个滤芯——水龙头（业务代码里的 `fetch`）和水（请求 URL）都不变，滤芯负责把"真水"换成"假水"返回。

你写：

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.get('/users/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, name: 'Jason' })
  })
)
```

测试里 `fetch('/users/42')` 不需要改，MSW 在网络层把它接走，返回上面定义的假 JSON。浏览器里走 Service Worker，Node 里走 monkey-patch，**handler 写一次两边都用**。

## 为什么重要

不理解 MSW，下面这些事都不好解释：

- 为什么 2020 年后前端测试纷纷从 `jest.mock('./api')` 迁移到 MSW——业务零侵入是最大动力
- 为什么 Storybook、Vitest、Playwright 三个生态都有 MSW 集成——一份 handler 多处复用
- 为什么"Service Worker"这个本来给 PWA 离线用的浏览器 API，被借去做测试 mock
- 为什么后端没写完时前端也能开发完整页面——dev 模式下 MSW 就是"假后端"

## 核心要点

MSW 的工作可以拆成 **三层**：

1. **平台拦截层**：浏览器装 `/mockServiceWorker.js`，所有 `fetch` / `xhr` 经它转发；Node 用 `@mswjs/interceptors` monkey-patch `http.request` / `fetch` / `XMLHttpRequest` / `WebSocket`。类比：浏览器是"门口装摄像头"，Node 是"在每条门后面塞便条"。

2. **共享大脑**：handler 数组 + URL 匹配 + resolver 调用全在 `core/` 目录。无论请求从浏览器还是 Node 进来，进入大脑后流程一样：跑 `matchRequestUrl`（基于 path-to-regexp）找匹配 → 调用 resolver → 返回 `HttpResponse`。

3. **handler 抽象**：`http.get(path, resolver)` / `graphql.query(name, resolver)` 是平台无关的描述。这是 MSW 跨平台的根——你写一次 `http.get('/api/x', ...)`，浏览器测试、Node 测试、dev 模式三处都吃。

## 实践案例

### 案例 1：Node 端 vitest 单元测试

```ts
// vitest.setup.ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { beforeAll, afterEach, afterAll } from 'vitest'

const server = setupServer(
  http.get('https://api.example.com/users/:id', ({ params }) =>
    HttpResponse.json({ id: params.id, name: 'mocked' })
  )
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

业务代码里的 `fetch('https://api.example.com/users/42')` 完全不动，测试自动拿到 `{ id: '42', name: 'mocked' }`。`onUnhandledRequest: 'error'` 让漏 mock 的请求直接报错，避免静默走真网络。

### 案例 2：浏览器 dev 模式假后端

```ts
// src/main.ts
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

if (import.meta.env.DEV) {
  const worker = setupWorker(...handlers)
  await worker.start()  // 必须 await，等 SW 注册完
}
```

后端还没实现 `/api/orders` 时，前端先写 handler 返回假订单数据。后端上线后把 `worker.start({ onUnhandledRequest: 'bypass' })` 加上，没 mock 的请求直接穿透到真 API。

### 案例 3：动态切换 mock（测试运行时改返回）

```ts
test('renders error state', async () => {
  server.use(
    http.get('/users/:id', () =>
      new HttpResponse(null, { status: 500 })
    )
  )
  // 这个 test 内 /users/:id 返回 500
  render(<UserPage id="42" />)
  expect(await screen.findByText(/出错/)).toBeInTheDocument()
})
// afterEach 的 resetHandlers 自动复位
```

`server.use()` 在 `setupServer` 启动后追加 handler，比初始 handlers 优先级高。配合 `afterEach(resetHandlers)` 实现"每个 test 自带 mock 状态"。

## 踩过的坑

1. **Service Worker 注册要 dev server 服务**：`/mockServiceWorker.js` 必须由 HTTP server 提供，`file://` 协议下 SW 注册不了——所以纯静态 demo 跑不起来 MSW。

2. **`worker.start()` 必须 await**：它是异步的（要等 SW 进入 active 状态）。`main.tsx` 里如果不 await 直接渲染，首屏的 `fetch` 会绕过 SW 打到真服务器，测试时表现成"偶发漏拦截"。

3. **v1 → v2 大改不兼容**：v1 的 `rest.get('/x', (req, res, ctx) => res(ctx.json(...)))` 在 v2 完全废弃，换成 `http.get('/x', () => HttpResponse.json(...))`。老博客上的代码不能直接抄。

4. **生产 build 必须排除 msw**：包体积大且不应进 prod。用 `import.meta.env.DEV` 守门 + Vite 自动 tree-shake，否则 bundle 里出现 `mockServiceWorker.js` 就是事故。

## 适用 vs 不适用场景

**适用**：
- 浏览器 + Node 都要 mock 同一套 API（unit test + Storybook + dev 共用 handler）
- 业务代码不想为测试做改动（不想抽 api 层、不想引 jest.mock）
- 后端没写完，前端要先开发完整体验
- 需要"动态切换 mock"演示组件多种状态（loading / 失败 / 限流）

**不适用**：
- 只想在 Node 拦 http、不想装 SW 的小项目 → 用 nock 更轻
- 只跑 Cypress / Playwright E2E 的项目 → 用它们自带的 `intercept` / `route` 即可
- 需要带 ORM 的全栈 mock（自动 ID、关联表） → 选 miragejs，MSW 故意不做这层
- 生产环境的 A/B 流量改写、灰度路由 → MSW 是测试工具，不是 service mesh

## 历史小故事（可跳过）

- **2018-2019**：Artem Zakharchenko (kettanaito) 在做前端测试时不满 jest.mock 的业务侵入，启发自浏览器 Service Worker（PWA 用的）能拦 fetch 这件事，做了第一版 MSW
- **2020**：Manifesto 帖《Mock Service Worker, the next-generation API mocking library》发布，社区开始大量迁移
- **2021-2022**：Storybook 官方 addon、Vitest 集成相继出现，MSW 成为 React 生态默认 mock 方案
- **2023**：v2 大版本切到 web 标准 `Request` / `Response`，配套独立项目 `@mswjs/interceptors` 把 Node 拦截层抽出
- **2025-2026**：MSW v2 稳定演进，成为 npm 周下载量百万级的工具库

## 学到什么

1. **mock 应该在网络层、不应该在业务依赖点**——这是 MSW 与 jest.mock 哲学的根本差异
2. **借现成平台 API（Service Worker）做新事**——比自己造拦截器优雅得多，且天然跨浏览器
3. **同一份 handler 多处复用**是 DX 的胜利——测试、dev、Storybook 不必写三遍 mock
4. **runtime invariant + 友好 warning** 比类型系统更适合"运行环境分叉"的库——`isNodeProcess()` 第一行守门胜过让 TS 复杂泛型

## 延伸阅读

- 官方文档：[mswjs.io](https://mswjs.io) —— 含完整 v2 API + 迁移指南
- 作者的 manifesto：[Mock Service Worker — kettanaito](https://kettanaito.com/blog/mock-service-worker)
- v1 → v2 迁移：[migrations/1.x-to-2.x](https://mswjs.io/docs/migrations/1.x-to-2.x)
- 配套包：[@mswjs/interceptors](https://github.com/mswjs/interceptors) —— Node 端拦截核心
- [[storybook]] —— `msw-storybook-addon` 让每个 story 配自己的 mock
- [[vitest]] —— Vitest setupFiles 注入 MSW lifecycle 是当前主流写法

## 关联

- [[jest]] —— jest.mock 是 MSW 要替代的"业务侵入式"老方案
- [[playwright]] —— Playwright 自带 `route` 拦截器，与 MSW 解决类似问题但只在 E2E 内
- [[storybook]] —— 通过 addon 把 MSW handler 注入每个 story
- [[fastify]] —— 真后端框架；MSW 是 fastify 没写完时的"假替身"
- [[express]] —— path-to-regexp 由 Express 推广，MSW 复用了它的语法
- [[vitest]] —— 现代 Node 测试 runner，MSW 通常以 setupFiles 注入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[wretch]] —— wretch — 把 fetch 写成一条链
