---
title: Hono — 多运行时 Web 框架
来源: https://github.com/honojs/hono
日期: 2026-05-29
子分类: Web 框架
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Hono 是一个**基于 Web 标准（Request / Response）写的 Web 框架**——你只写一份代码，就能跑在 Node / Bun / Deno / Cloudflare Workers / Vercel Edge / Fastly / AWS Lambda 上。

日常类比：以前每种部署环境要写一种代码——给 Node 写 Express、给 Cloudflare Workers 写 Itty Router、给 AWS Lambda 写 handler。换运行时就要重写一遍。Hono 像一种"能装到任何车型上的发动机"——同一份代码，换底盘就能跑。

```typescript
import { Hono } from 'hono'

const app = new Hono()
app.get('/', (c) => c.text('Hi'))
export default app   // 这一份代码，Bun / Workers / Deno 都接得住
```

## 为什么重要

不理解 Hono 解决的问题，下面这些事都没法解释：

- 为什么 Cloudflare Workers / Bun 把 Hono 选成默认 web 框架推荐
- 为什么核心只有 14KB（比 Express 小 10 倍），冷启动几毫秒级
- 为什么路由比 Express 快 5-10 倍（基于 Trie 树 / 编译成大正则）
- 为什么写 `c.req.param('id')` IDE 自动推出 `string` 类型——TypeScript-first 设计

边缘运行时时代到了。Express 那套 `req.send` 不是 Web 标准、不能跑在 Workers——Hono 就是回答"今天从零设计一个 web 框架，会怎么做"。

## 核心要点

Hono 的设计可以拆成 **三块**：

1. **Web Fetch API 一等公民**：`c.req` 就是浏览器 fetch 用的那个 `Request` 对象，`c.res` 就是 `Response`。所以"能产出 `(req) => Response`"的运行时都能跑——Workers / Bun / Deno 原生支持，Node 加个 adapter 也行。

2. **中间件链同 Koa（洋葱模型）**：每层中间件写成 `(c, next) => Promise<void>`，调用 `await next()` 把控制权交下去，等下层跑完再回到自己的"出来"逻辑。日志、计时、鉴权都靠这个模式。

3. **多种路由实现可选**：RegExpRouter（编译成大正则，最快）/ TrieRouter（前缀树，通用）/ LinearRouter（数组扫描，路由少时最快）。默认 SmartRouter 启动时自己探测、选最优、锁死后续请求走同一个。

## 实践案例

### 案例 1：Hello world（一份代码三处跑）

```typescript
import { Hono } from 'hono'

const app = new Hono()
app.get('/', (c) => c.text('Hi'))
app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))

export default app
```

- 跑 **Bun**：`bun run --hot index.ts`
- 跑 **Cloudflare Workers**：`wrangler deploy`（一行部署到全球边缘）
- 跑 **Node**：装 `@hono/node-server`，`serve({ fetch: app.fetch, port: 3000 })`

**完全相同的 app**——只换"启动方式"。

### 案例 2：中间件链做日志 + 鉴权

```typescript
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'

const app = new Hono()

app.use('*', logger())                         // 全局打日志
app.use('*', cors())                           // 必须在 jwt 前面
app.use('/admin/*', jwt({ secret: 'xxx' }))    // 只对 /admin/* 鉴权

app.get('/admin/users', (c) => c.json({}))
```

→ Hono 内置 `logger` / `cors` / `jwt` / `cache` / `compress` 等中间件，`app.use()` 一行接入。

### 案例 3：路径参数 + 类型自动推

```typescript
app.get('/users/:id', (c) => {
  const id = c.req.param('id')        // TS 自动推出 string
  const search = c.req.query('q')     // TS 推出 string | undefined
  return c.json({ id, search })
})
```

写完直接有补全。这就是 TypeScript-first 的体感。

## 踩过的坑

1. **Node 部署需要 adapter**：Cloudflare Workers / Bun 原生支持 `fetch` 入口，Node 不行。要装 `@hono/node-server`，把 Hono app 包成 Node http server 才能跑。

2. **Streaming 响应各运行时实现不同**：Cloudflare Workers 原生支持 `ReadableStream`，Node 通过 `@hono/node-server` 模拟，行为有细微差异。生产用流式响应前要在目标运行时实测。

3. **Body size 限制各家不同**：Cloudflare Workers 100MB / Vercel Edge 4.5MB / AWS Lambda 6MB。同一份代码部署到不同环境，**上传文件场景**要单独按运行时算配额。

4. **中间件顺序敏感**：把 `jwt` 放在 `cors` 之前，浏览器的 CORS preflight `OPTIONS` 请求会先被 jwt 拒绝（401），CORS 永远不通。**必须 cors 先于 jwt** 注册。

## 适用 vs 不适用场景

**适用**：
- 任何 edge function（Cloudflare Workers / Vercel Edge / Fastly）
- 多运行时部署需求（一套代码 Bun + Node + Workers 都跑）
- 轻量 BFF（backend for frontend），前端附带的 API 层
- 给 LLM agent / MCP server 写部署层（启动快、跨平台）

**不适用**：
- 需要重型 ORM 集成 + 复杂 service layer → NestJS / Fastify 生态更全
- 已有大量 Express middleware 的现成项目 → 迁移成本可能不值
- 重型 SSR → Next / Remix / Astro 更合适
- WebSocket / SSE 是核心需求 → 能做但不是 Hono 强项，各 adapter 差异大

## 历史小故事（可跳过）

- **2010 年**：Express 诞生，Node 专属，callback 风格统治十年。
- **2020 年前后**：Cloudflare Workers / Deno Deploy / Vercel Edge 陆续上线，**Node 专属 API 不再够用**——边缘运行时只接受 `(req) => Response` 这种 Web 标准签名。
- **2022 年**：日本开发者 Yusuke Wada 启动 Hono（日语"炎"），目标是"用 Web 标准写一次、到处跑"。
- **2024-2026 年**：Cloudflare 把 Hono 列为 Workers 官方推荐框架，Bun 内置 Hono template，社区贡献者破百，star 数破 24k。

## 学到什么

1. **抽象层站对了，跨平台是免费的**——Hono 的关键判断不是"重新发明 API"，而是"Web 平台已有标准，我们顺着走"。
2. **核心薄、扩展点多** 是好框架的健康信号——核心 14KB，路由 / 中间件 / adapter 都是扩展点，业务方不动核心也能扩展。
3. **运行时优化（SmartRouter）的代价是冷启动**——首次探测有开销，但探测一次后就锁定；这种"启动时一次性 N 选一"的模式可以抄到自己的库里。
4. **顺序敏感的设计要让用户看得见**——cors 必须在 jwt 之前，这种隐含约束最好用文档显式提醒，而不是让用户撞错才发现。

## 延伸阅读

- 官方文档：[hono.dev](https://hono.dev/)（中文文档完整，5 分钟跑起来）
- 源码精读：[hono-base.ts](https://github.com/honojs/hono/blob/main/src/hono-base.ts)（545 行，整个框架的入口）
- [compose.ts 73 行](https://github.com/honojs/hono/blob/main/src/compose.ts) —— koa-compose 经典模式，比读 200 页 koa 文档快
- [[trpc]] —— 同样 TypeScript-first 的"前后端类型共享"框架，REST vs RPC 风格不同

## 关联

- [[bun]] —— Bun 内置 Hono template，二者协同强
- [[koa]] —— Hono 的中间件模型抄自 Koa（洋葱模型 + compose 73 行）
- [[express]] —— Hono 解决的问题就是 Express 解决不了的"跨运行时"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[bun]] —— Bun — JS 全能运行时
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[next-js]] —— Next.js — React 全栈框架
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC

