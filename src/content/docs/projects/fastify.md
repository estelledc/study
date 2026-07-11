---
title: Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
来源: 'https://github.com/fastify/fastify'
日期: 2026-05-30
分类: web-frameworks
难度: 中级
---

## 是什么

Fastify 是一个 **Node.js 的 web 框架**——你给它路由和处理函数，它给你一个 HTTP 服务器。日常类比：像一个**带模具的注塑机**——Express 是手工捏陶，每个请求都要"看一眼形状再决定怎么处理"；Fastify 让你**先做模具（schema）**，开机后所有请求被同一个模具一压成型，没有判断、没有反射。

最简单一段：

```ts
import Fastify from 'fastify'
const app = Fastify()
app.get('/hi', async () => ({ msg: 'hello' }))
await app.listen({ port: 3000 })
```

写起来跟 Express 几乎一样。差别藏在你看不见的地方：当你给路由配一个 JSON Schema，Fastify 在 `listen()` 之前就把 schema **编译成一段 JavaScript 函数**。运行期不再"读 schema 判断 type"——直接调函数。这是它比 Express 快 3 倍的核心原因。

## 为什么重要

不理解 Fastify，下面这些事都没法解释：

- 为什么 Node.js 同样代码 Fastify 能跑 30k req/s、Express 只有 10k——差的 20k 哪里来
- 为什么 schema-first 框架（FastAPI / NestJS / Hono）这几年都流行——单一来源生成校验、序列化、文档
- 为什么 Fastify 的 plugin 不是 `app.use()` 而是 `app.register()`——封装边界设计的两条路
- 为什么 Matteo Collina（Node.js 核心维护者）愿意为这个框架站台

## 核心要点

Fastify 的设计可以拆成 **三个支柱**：

1. **schema 先于代码**：每个路由配 JSON Schema，启动期 Ajv 编译出 validator、fast-json-stringify 编译出 serializer。类比：开店前把所有菜单和容器提前印好，客人来了直接套用，不需要现场设计。

2. **plugin encapsulation**：每次 `register()` 出一个**子 instance**。在子里加的装饰器、hook、路由都被关在子 scope 里。类比：每个插件像独立的房间，不会污染走廊。要全局生效得用 `fastify-plugin` 标注"穿墙"。

3. **生命周期 hook 取代中间件链**：八个固定阶段（onRequest → preParsing → preValidation → preHandler → handler → preSerialization → onSend → onResponse），顺序不可变。类比：流水线的固定工位，不像 Express 的"想插哪就插哪"。

底层还有 find-my-way 的 radix tree 路由（匹配随**路径段数**增长，与注册路由条数基本无关）和 pino 异步 logger，三件套合起来叫"性能优先的现代 Node 框架"。

## 实践案例

### 案例 1：schema 同时管校验和序列化

```ts
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' },
      },
    },
    response: {
      200: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
    },
  },
  handler: async (req, reply) => {
    const { name } = req.body as { name: string }
    return { id: 1, name, secret: 'should-not-leak' }
  },
})
```

**关键观察**：客户端**收不到** `secret`——response schema 没列它，序列化阶段被裁掉。这是**安全特性**也是**性能优化**（fast-json-stringify 跳过未列字段）。

### 案例 2：plugin encapsulation——子里的东西父看不见

```ts
app.decorate('rootHelper', () => 'global')

app.register(async (sub) => {
  sub.decorate('inSub', () => 'only here')
  sub.get('/sub', async () => sub.inSub())     // OK
  sub.get('/up', async () => sub.rootHelper()) // OK：子能看父
})

// app.inSub  // ❌ undefined：父看不到子
```

**逐步解释**：`register` 内部 `Object.create(app)` 出 child；child 上加属性不会写回 parent。要"穿墙"得用 `fastify-plugin` 包：`fp(myPlugin)` 告诉 Fastify"这个插件不要起 scope"。

### 案例 3：hooks 替代 middleware

```ts
app.addHook('onRequest', async (req) => {
  req.log.info({ url: req.url }, 'incoming')
})
app.addHook('preHandler', async (req) => {
  if (!req.headers.authorization) throw new Error('Unauthorized')
})
```

**对比 Express**：Express 全是 `app.use(mw)`，顺序靠注册顺序，语义全靠你自己记。Fastify 把"什么阶段做什么"写进 API：onRequest 永远第一、preHandler 永远在 handler 前。读代码时一眼知道执行顺序。

## 踩过的坑

1. **不写 response schema = 序列化红利大打折扣**：没 schema 的路由会回退到通用 `JSON.stringify`，吞吐明显掉一截（路由/封装等优化还在，但最肥的那块没了）。schema-first 的红利主要落在配了 schema 的路由上。

2. **schema 是契约不是建议**：字段类型错配（schema 说 string、handler 返 number）会让 fast-json-stringify 在 prod 直接拼出 `{"email":123}` 这种不合法但能 parse 的 JSON；handler 多返字段 schema 只列 3 个，会被悄悄裁掉——dev 模式 strict 能提前抓到

3. **register 不是 use**：第一次写的人会困惑"为什么我 decorate 的 helper 在外面调不到"。要全局共享得 `fastify-plugin` 包一层。

## 适用 vs 不适用场景

**适用**：
- 高并发 REST API / JSON 微服务（schema 编译收益最大）
- 需要 OpenAPI 文档自动生成（schema 是单一来源）
- 中大型项目想用 plugin encapsulation 做边界隔离

**不适用**：
- 一次性脚本 / 简单内部工具（Express 几行更快）
- Edge runtime（Cloudflare Workers / Deno Deploy）——Fastify bundle 偏大，Hono / Elysia 更合适
- 想要类型自动从 schema 推到 TS——zod-based 的 Hono / Elysia 体验更顺，Fastify 要靠 `@fastify/type-provider-typebox`

## 历史小故事（可跳过）

- **2010 年**：Express 1.0，定义了 Node.js 的 middleware 范式，但 schema 不是它的关注点
- **2013 年**：Koa 出来，async 中间件优雅了，但仍是中间件链思维
- **2017 年**：Matteo Collina（Node.js TSC 成员）和 Tomas Della Vedova 觉得"该有个 schema-first 的"，开了 Fastify v0.x
- **2018 年 8 月**：v1.0 发布，性能立刻成为社区话题
- **2024 年**：v5 要求 Node ≥ 20，weekly downloads ~3M，已经是 Node web 框架前三

## 学到什么

1. **"编译期做完，运行期不动" 是性能的黄金法则**——schema → fn 这个套路适用于任何"反复用同一规则处理大量数据"的场景
2. **封装边界 + 固定 Hook 比"想插就插" 更结构化**——Fastify 用 `Object.create` 在 JS 层做出 scope 隔离 + 八阶段固定 hook，思路可移植，且 FastAPI / Hono / Elysia 都已沿用 schema-first 路线，Express "代码即接口" 时代结束

## 延伸阅读

- 官方文档：[fastify.dev](https://fastify.dev/)（Getting Started 写得简洁，30 分钟跑通）
- Matteo Collina 的演讲：[The Cost of Logging](https://www.youtube.com/watch?v=hVR-PGiNsv4)（讲为什么默认用 pino）
- Plugin 写法实战：[fastify/example](https://github.com/fastify/example)
- [[fastapi]] —— Python 同样是 schema-first 的代表，思路一脉相承
- [[playwright]] —— 同 Node 生态、同样把"编译/启动期把动态判断消除"做到极致

## 关联

- [[fastapi]] —— Python 版的 schema-first：Pydantic schema 同时管校验 / 文档 / 序列化
- [[warp]] —— Rust 里同代的"现代 web 框架"，但用类型而非 schema 表达 route
- [[playwright]] —— 同样 Node.js 生态，同样靠"启动期把动态消除"换性能
- [[hindley-milner]] —— schema 编译为 fn 的思路，与类型推导"把检查移到编译期"哲学相通
- [[ssa]] —— 编译期消除"运行期判断"的另一个工程典范

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[centrifugo]] —— Centrifugo — Go 写的开源实时消息服务器
- [[connect-rpc]] —— ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
- [[discord-js]] —— discord.js — Node.js Discord API 客户端事实标准
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[haraka]] —— Haraka — 用 Node.js 写插件链式架构的 SMTP 服务器
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[next-js]] —— Next.js — React 全栈框架
- [[nodemailer]] —— Nodemailer — Node.js 发邮件的事实标准
- [[peerjs-server]] —— peerjs-server — 只管握手不管传话的 WebRTC 信令服务器
- [[pino]] —— pino — 日志不该阻塞热路径
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[simple-peer]] —— simple-peer — 三行代码把两个浏览器直接连起来
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[soketi]] —— Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[ssa]] —— SSA — 静态单赋值形式
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
- [[vertx]] —— Vert.x — Eclipse 出品的 polyglot reactive JVM toolkit，用事件总线 + verticle 把 Node.js 那套搬到多语言
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架

