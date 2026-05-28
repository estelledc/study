---
title: "Hono — 极简边缘后端的 API 取舍"
description: 用 Web 标准（Request/Response）+ 多种 router 实现 + koa-compose 中间件做"任何 runtime 都能跑"的 web 框架
sidebar:
  order: 28
  label: "honojs/hono"
---

> honojs/hono v4.12.23（2026-05），MIT。
>
> Hono 解决的是 Express 解决不了的问题：**云函数 / 边缘 runtime 时代**，
> Node 专属 API（`req.body` / `res.send`）不能用了——
> Cloudflare Workers / Deno Deploy / Vercel Edge / Bun / Lambda 各家有各家的 runtime。
>
> Hono 的判断：**用 Web 标准（Fetch API 的 Request / Response）写 framework**，
> 然后给每个 runtime 写一个轻量 adapter。一份代码处处跑。
>
> Season 5 第二篇。
>
> 4.4KB（minified + brotli）。比 Express 启动快 100 倍。

## 一句话定位

**Hono = 一个用 Web 标准 API 写的 router + middleware framework，可以在 Cloudflare Workers / Deno / Bun / Node / AWS Lambda / Vercel Edge 任意 runtime 跑。**
单一 API，多 runtime adapter，零 npm 依赖（核心）。

## Why（为什么是它而不是 Express / Fastify / Koa / itty-router）

服务端 web 框架的演化：

```
2010: Express        Node-only, callback hell
2014: Koa            Node-only, generator/async
2016: Fastify        Node-only, schema-first 性能优先
2020: edge runtime 时代到来
2022: Hono           Web 标准 API，多 runtime
```

**核心痛点**：

```typescript
// Express
app.get('/users/:id', (req, res) => {
  res.json({ ... })          // ← Node 专属 res.json
})

// Cloudflare Workers
addEventListener('fetch', (event) => {
  event.respondWith(new Response(JSON.stringify(...)))  // ← Web 标准
})
```

**两套不兼容的 API**——你的 Express 代码不能直接跑在 Workers。
迁移要重写。

Hono 的回答：**framework 内部用 Web 标准，给开发者一个跨 runtime 的 API**。

```typescript
import { Hono } from 'hono'

const app = new Hono()
app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))

// 跑在 Bun
export default app

// 跑在 Cloudflare Workers
export default { fetch: app.fetch }

// 跑在 Node + @hono/node-server
serve({ fetch: app.fetch, port: 3000 })
```

| 框架 | runtime | API | 性能 | bundle |
|---|---|---|---|---|
| **Express** | Node | callback / req.send | 慢 | 230KB |
| **Fastify** | Node | schema-first | 快 | 130KB |
| **Koa** | Node | async ctx | 中 | 80KB |
| **itty-router** | 任何 | 极简 | 极快 | 1KB |
| **Hono** | **任何** | **Web 标准** | **极快** | **~5KB** |

**为什么不是 Express**：Express 不会变。但**新项目用 Express 已经是技术债**——
锁 Node、不能跑 edge、性能不够。

**为什么不是 Fastify**：Fastify 在 Node 内极强，但**不跨 runtime**。
你要做 edge function 就还是要换框架。

**为什么不是 itty-router**：itty 是 1KB 路由库，没有 middleware / context / validator 等。
Hono 是 itty 的"完整版"。

**Hono 的代价**：
- Node 生态 middleware（cookie-parser / body-parser / cors）要重写或用 Hono 内置
- 不像 Express 那样"一切皆中间件"——Hono 选择性吸收 koa-compose 风格
- 某些 Express 特性（template engines）不内置

## 仓库地形

```
hono/
└── src/
    ├── hono.ts                       ← 默认 Hono 类（继承 HonoBase + 默认 router）
    ├── hono-base.ts                  ← ★★ 545 行：HonoBase 类核心
    ├── context.ts                    ← ★ 780 行：Context（c）对象
    ├── compose.ts                    ← 73 行：koa-compose 中间件
    ├── request.ts                    ← Request 包装
    ├── response.ts                   ← Response 包装
    ├── router/                       ← ★★ 多种 router 实现
    │   ├── reg-exp-router/           ← 正则编译路由（最快）
    │   ├── trie-router/              ← Trie 树路由（默认）
    │   ├── linear-router/            ← 线性路由（小数量最快）
    │   ├── pattern-router/           ← URLPattern API
    │   └── smart-router/             ← 自动选择最优 router
    ├── adapter/                      ← runtime 适配器
    │   ├── bun/
    │   ├── cloudflare-workers/
    │   ├── cloudflare-pages/
    │   ├── deno/
    │   ├── lambda-edge/
    │   ├── vercel/
    │   └── ...
    ├── middleware/                   ← 内置 middleware
    │   ├── cors/
    │   ├── jwt/
    │   ├── logger/
    │   ├── compress/
    │   └── ...
    ├── helper/                       ← helper 工具
    └── client/                       ← RPC client（typed fetch）
```

**心脏文件**：

1. `src/hono-base.ts:98`——`Hono` 基类（545 行总，类是核心）
2. `src/compose.ts`（73 行）——middleware 调度
3. `src/router/smart-router/router.ts`（94 行）——自动选择最优 router 的判断逻辑

## 核心机制 · Layer 3 精读

### 机制 1 · Web 标准 API —— Request 进、Response 出

```typescript
// Hono 应用的本质（伪代码）
async function handler(req: Request): Promise<Response> {
  // 1. 路由匹配
  const handler = router.match(req.url, req.method)
  // 2. 创建 Context（包装 Request + Response builder）
  const c = new Context(req)
  // 3. 跑 middleware chain + handler
  await compose(middleware)(c)
  // 4. 返回 c.res
  return c.res
}
```

签名 `(req: Request) => Promise<Response>` ——这就是 Web 标准。

**为什么这么重要**：所有现代 runtime 都接受这个签名：

- **Cloudflare Workers**：`{ fetch(req) { ... } }`
- **Deno Deploy**：`Deno.serve(req => ...)`
- **Bun**：`Bun.serve({ fetch(req) { ... } })`
- **Vercel Edge**：`export default function (req) {...}`
- **AWS Lambda + adapter**：`{ fetch }` 包装

只要你能产出 `(req) => Response`，就能跑在任何地方。

→ 这是**站在标准的肩膀上**——Web Platform 标准化的 Fetch API
解决了"如何跨 runtime"的问题。Hono 顺势而为。

### 机制 2 · 多 Router 实现 — 让选择有取舍

普通框架只有一个 router。Hono 有 5 个：

| Router | 实现 | 适合场景 | 速度 |
|---|---|---|---|
| **TrieRouter**（默认） | Trie 树 | 通用，路由数中等 | 快 |
| **RegExpRouter** | 正则编译成单个大正则 | 路由数大、固定 | **极快** |
| **LinearRouter** | 数组线性扫描 | 路由数 < 10 | 数量小最快 |
| **PatternRouter** | URLPattern Web API | 浏览器原生 | 中 |
| **SmartRouter** | 启动时自动选最优 | 不知道选哪个 | 各场景最优 |

`smart-router/router.ts:4`：

```typescript
export class SmartRouter<T> implements Router<T> {
  // 启动时尝试多个 router，选最快的
  // ...
}
```

**判断**：不同 router 在不同负载下性能差距大。SmartRouter 让用户**不需要做这个选择**——
启动时基准测试一下，用最适合的。

→ 这是**生态成熟的标志**：把性能优化从用户责任变成 framework 责任。

### 机制 3 · Context（c）对象 —— 一站式 API

`src/context.ts`（780 行）实现 `Context`：

```typescript
app.get('/users/:id', (c) => {
  const id = c.req.param('id')           // ← 路径参数
  const q = c.req.query('search')        // ← query 参数
  const body = await c.req.json()        // ← 请求 body
  const env = c.env                      // ← runtime env (Workers / Bun)
  c.header('X-Custom', 'value')          // ← 设置 response header
  return c.json({ id, found: true })     // ← 返回 JSON Response
})
```

`c` 是 koa 的 ctx 一脉相承。所有你需要的都在 `c`：req、env、header、status、cookie、json/html/redirect 各种 helper。

→ **一站式**让 API 学习曲线极平。
开发者只要记住一个 `c`，不用记 `req` `res` `next` 三件套。

### 机制 4 · `compose.ts` —— koa 风格中间件

73 行的 `compose.ts`：

```typescript
export const compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
) => {
  return (context, next) => {
    let index = -1

    async function dispatch(i: number): Promise<Context> {
      if (i <= index) throw new Error('next() called multiple times')
      index = i
      // ... 调用 middleware[i]，让它能 await next() 调用下一个
    }

    return dispatch(0)
  }
}
```

每个 middleware 形如 `(c, next) => Promise<void>`，在 next() 前后都可以加逻辑：

```typescript
app.use(async (c, next) => {
  const start = Date.now()
  await next()                          // ← 先把控制权交下去
  const duration = Date.now() - start
  console.log(`${c.req.method} ${c.req.path}: ${duration}ms`)
})
```

→ **这就是 Koa 的洋葱模型**。Hono 直接复用了这个成熟模式，没重新发明。

### 机制 5 · RPC client —— typed fetch

```typescript
// server
const route = app.get('/users/:id', (c) => c.json({ name: 'Jason' }))
export type AppType = typeof route

// client
import { hc } from 'hono/client'
import type { AppType } from './server'

const client = hc<AppType>('http://localhost:3000')
const res = await client.users[':id'].$get({ param: { id: '123' } })
const data = await res.json()       // ← 自动类型 { name: string }
```

→ **同 [tRPC 笔记](/study/projects/trpc/) 思路**：
import server 的类型，client 自动类型安全。
但 Hono 走 REST 风格，tRPC 走 RPC 风格——不同协议，相同思想。

### 机制 6 · adapter 层 —— 各 runtime 一个文件

`src/adapter/cloudflare-workers/index.ts`：

```typescript
// 大约 50 行
export const handle = (app: Hono) => ({
  fetch: app.fetch,
  // 处理 Workers 特殊事件（scheduled / queue）
})
```

`src/adapter/aws-lambda/handler.ts`：

```typescript
// AWS Lambda 不是 fetch 协议，要手动转换
export const handle = (app: Hono) => async (event: APIGatewayEvent) => {
  const req = convertLambdaEventToRequest(event)
  const res = await app.fetch(req)
  return convertResponseToLambda(res)
}
```

→ **adapter 模式**让 framework 核心保持纯净（只管 Web 标准），
runtime 特殊性收敛到 adapter。这是面向未来的设计——新 runtime 出来加个 adapter 就行。

## 横向对比

### vs Express — 不同时代的产物

Express 是 Node-only callback 时代的产物。今天写 Express 应用就像 2010 年写 jQuery——
能用，但不是新项目应该选的。

Hono 是"如果今天从零设计 web framework，会怎么做"的回答。

### vs Fastify — Node 内最快 vs 跨 runtime 最快

Fastify 在 Node 内的 throughput 是天花板（schema-first + 内联优化）。
Hono 在跨 runtime 上是天花板（Web 标准 + adapter）。

如果你**只跑 Node**且追求极致性能——Fastify。
否则 Hono 是更面向未来的选择。

### vs Itty Router — 单点最小 vs 完整框架

itty-router 1KB 做路由。Hono 5KB 做路由 + middleware + context + validator。
**90% 应用需要 Hono 这个量级**，少数极简 worker 用 itty 即可。

### vs Next.js API Routes / RSC — 框架内 vs 独立框架

Next API Routes：你必须在 Next 项目里用。
Hono：可以在任何项目，包括 Next（用 catch-all route 把 Hono 嵌进去）。

灵活度：Hono 完胜。
集成度：Next API Routes 在 Next 生态内更顺。

### vs tRPC — 协议风格不同

tRPC 是 RPC（函数调用），Hono 是 REST/HTTP。
tRPC 适合"前后端都 TS、没有第三方"的场景。
Hono 适合"开放 API、第三方调用、跨语言"的场景。

→ 实际上**很多人两个一起用**——内部 tRPC，公开 Hono REST。

## Hands-on（5 分钟内能跑）

```bash
mkdir hono-demo && cd hono-demo
npm init -y
npm install hono
```

写 `server.ts`：

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`)
})

app.get('/', (c) => c.text('Hello Hono!'))

app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id, name: `User ${id}` })
})

app.post('/users', async (c) => {
  const body = await c.req.json()
  return c.json({ created: body }, 201)
})

export default app
```

跑（Bun）：

```bash
bun run --watch server.ts
# 或 Node + @hono/node-server
```

curl 测试：

```bash
curl http://localhost:3000/users/42
# {"id":"42","name":"User 42"}

curl -X POST http://localhost:3000/users -H 'Content-Type: application/json' -d '{"name":"Jason"}'
# {"created":{"name":"Jason"}}
```

### 改一处的实验（必做）

把同样的 `app` 部署到 Cloudflare Workers：

```bash
npx wrangler init
# 选 hello-world template
```

替换 `src/index.ts` 内容为你的 Hono app + `export default app`。

```bash
npx wrangler dev      # 本地起 Workers runtime
npx wrangler deploy   # 部署到 cloudflare.com
```

**完全相同的代码**，从 Bun 切到 Workers——这就是"跨 runtime"的真实体感。

第二个实验：用 RPC client：

```typescript
// 在 client 端
import { hc } from 'hono/client'
import type { AppType } from './server'

const client = hc<AppType>('http://localhost:3000')
const res = await client.users[':id'].$get({ param: { id: '7' } })
const data = await res.json()    // ← 类型自动推断
console.log(data.name)
```

观察 IDE 自动补全——`client.users[':id'].$get` 自动补全；`data.name` 类型自动是 string。

## 与你工作的连接

**能立刻迁移**：

- 任何**新 web service**用 Hono——选 runtime 后续决定，框架不变
- 给项目加 `/api` 用 Hono（即使主体是 Next）——比 Express middleware 更轻
- 边缘函数（Workers / Vercel Edge）用 Hono——这是它的甜点场景

**下个月可能用到**：

- 给 LLM agent / MCP server 写部署层用 Hono——启动快，跨平台
- 内部小工具放 Bun + Hono——单文件部署、毫秒级冷启动
- BFF（backend for frontend）用 Hono RPC client，类型安全

**不要用 Hono 的部分**：

- **重型 ORM 集成 + 复杂 service layer**——NestJS / Fastify 生态更全
- **基于 Express middleware 的现成项目**——迁移可能不值
- **重型 SSR**——用 Next / Remix / Astro 更合适

## 读完你能做之前做不了的事

- **判断**：选 web framework 时，能区分"跑哪些 runtime / 性能要求 / 生态需求"三轴
- **设计**：写新 backend 时，第一选择不是 Express，而是基于 Web 标准的框架
- **解释**：被问"为什么 Cloudflare Workers 不能跑 Express"时，能用"req.send 不是 Web 标准"解释
- **下钻**：看懂 Cloudflare Workers / Deno / Bun 的 runtime API——它们都和 Hono 同源
- **对照**：识别"我的 backend 可不可以做成 fetch handler"——这是迁移到 edge 的判断

## 自检 · 5 个问题

1. Hono 有 5 种 router。SmartRouter 启动时自动选——这种"运行时优化"在哪些场景反而是劣势？
2. Hono 用 koa 风格的洋葱模型，Express 用线性 next() 调用。两者在错误处理上有什么差异？
3. RPC client `hc<AppType>` 自动类型推断。当 server 接口很大时，client 的 IDE 性能会怎样？
4. adapter 模式让 Hono 跨 runtime。但每个 adapter 要追各 runtime 升级——
   团队怎么管理这个负担？
5. Hono 故意不做 ORM / template engine 集成。这种"刻意减法"的产品判断在哪些项目阶段反而拖累用户？

## 延伸阅读

读完这篇笔记后下一步：

1. `src/hono-base.ts:98-545`——HonoBase 类完整实现
2. `src/compose.ts`（73 行全部）——koa-compose 经典模式
3. `src/router/smart-router/router.ts`——SmartRouter 选择算法
4. **MDN Web Standards** [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)——理解 Request/Response 的标准
5. **Cloudflare Workers** [Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)——看 Hono 如何顺势而为

---

**笔记完成**：2026-05-28（v4.12.23）
**研究方法**：本地克隆 + 读 hono.ts/hono-base.ts/compose.ts + 设计判断分析
**心脏文件**：`src/hono-base.ts:98` + `src/compose.ts`（73 行）
