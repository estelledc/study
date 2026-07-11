---
title: Elysia — 长在 Bun 上的极致类型安全 Web 框架
来源: 'https://github.com/elysiajs/elysia + elysiajs.com 官方文档'
日期: 2026-05-30
分类: web 框架
难度: 中级
---

## 是什么

Elysia 是一套**为 Bun runtime 深度优化（Bun-first）**的 TypeScript Web 框架。日常类比：像一台优先适配新款充电桩的电动车——在专属桩上跑得飞快；换旧插座（Node）也能充，但要加转接头，而且拿不到原厂快充红利。

你写：

```ts
import { Elysia, t } from 'elysia'

new Elysia()
  .get('/hi/:name', ({ params }) => `hello ${params.name}`,
       { params: t.Object({ name: t.String() }) })
  .listen(3000)
```

`params.name` 在编辑器里直接被推成 `string`，运行时也会先按 schema 校验，再进 handler。一份 schema 同时做了校验 + TypeScript 类型 + OpenAPI 文档三件事。

## 为什么重要

不理解 Elysia，下面这些事都没法解释：

- 为什么 2023–2024 年冒出一堆"Bun-first"框架，老牌 Express 不香了吗
- 为什么有人不用 zod 改用 TypeBox，schema 库选型背后的取舍
- 为什么前端能 `import type { App } from './server'` 就拿到全部接口类型，不写一行 codegen
- 为什么"性能"和"跨 runtime"在 Web 框架里几乎是反义词

## 核心要点

把 Elysia 拆成 **三件事** 看：

1. **方法链注册路由**：`new Elysia().get(...).post(...)` 像往一条传送带上挂工位，每挂一个，框架就把这个路由的类型合并进整个 app 类型里。类比：每加一节车厢，整列火车的乘客名单都自动更新。

2. **TypeBox 做 schema**：写一次 `t.Object({...})`，框架同时拿到 JSON Schema（生成 swagger）+ TypeScript 类型（编辑器推导）+ JIT 校验函数（runtime 拒绝坏请求）。类比：一份图纸同时给工人、税务局和质检员用。

3. **Bun build 时 macro**：build 时 Bun bundler 把 `.derive(...)` 这种链调用直接 inline 进 handler，runtime 没有"中间件遍历"的开销。代价：换到 Node 上跑这一层就失效了。

## 实践案例

### 案例 1：体会"schema 同时是类型"

```ts
import { Elysia, t } from 'elysia'

new Elysia()
  .post('/users', ({ body }) => {
    // 这里 body 已经是 { email: string, age: number }
    return { ok: true, who: body.email }
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      age: t.Number({ minimum: 0 })
    })
  })
  .listen(3000)
```

**逐部分**：

- `t.Object` 写的 schema 既是 runtime 校验，也是编辑器看到的 TS 类型
- 收到 `{ email: 'xx', age: -1 }` 会被 TypeBox 直接 422 掉，根本进不到 handler
- 对比 Express：`req.body` 默认是 `any`，要自己挂 zod / joi 再 cast 一次

### 案例 2：登录 + JWT，看 plugin 怎么注入类型

```ts
import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'

new Elysia()
  .use(jwt({ name: 'jwt', secret: process.env.SECRET! }))
  .post('/login', async ({ body, jwt }) => {
    // jwt 是 plugin 注入的字段，编辑器有提示
    const token = await jwt.sign({ email: body.email })
    return { token }
  }, { body: t.Object({ email: t.String(), pwd: t.String() }) })
  .listen(3000)
```

`.use(jwt(...))` 之后，所有下游 handler 的 `ctx` 里都多了一个类型化的 `jwt` 字段，新人看到自动补全就明白 plugin 在干嘛。

### 案例 3：Eden Treaty——把"接口文档"换成"import 类型"

```ts
// server.ts
const app = new Elysia()
  .get('/users/:id', ({ params }) => ({ id: params.id, name: 'Alice' }),
       { params: t.Object({ id: t.String() }) })
export type App = typeof app

// client.ts
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const api = treaty<App>('http://localhost:3000')
const { data, error } = await api.users({ id: '123' }).get()
// data 自动是 { id: string, name: string } | null
```

服务端类型直接被前端 import，无需 OpenAPI codegen，也不用包一层 router。

## 踩过的坑

1. **当 Express 用，连 schema 都不写**：等于把 Elysia 最大卖点关掉，body 又变 any，性能反而被运行时校验拖慢
2. **在 Node 上跑求"通用性"**：官方有 `@elysiajs/node` adapter，能跑但 macro / JSC 红利基本没了，QPS 常与 Hono 持平甚至更低——花了学习成本却没拿到 Bun 侧收益
3. **以为 Node 是 drop-in**：要用 Node 必须显式安装 adapter 并在 `new Elysia({ adapter: node() })` 里挂上，不是换个 runtime 命令就完事
4. **TypeBox 和 zod 两套 schema 共存**：表单层用 zod、API 层用 TypeBox，bundle 翻倍且心智重复，要么统一要么换框架
5. **单文件 50+ 路由不拆分**：类型层会累积成巨型联合类型，IDE tsserver 容易卡顿，建议按业务用 `.group()` / `.use()` 切片

## 适用 vs 不适用场景

**适用**：
- 新项目愿意押 Bun runtime（个人项目 / 小型创业 / 边缘函数）
- 强调端到端类型安全，前后端都在 TypeScript 同一仓库
- 高 QPS 场景（10k+ req/s 的轻量 API 网关）
- 需要 schema 同时做校验 + OpenAPI 文档

**不适用**：
- 生产只能 Node、且你要的是跨 runtime 红利而不是 Bun 峰值——Node adapter 可跑，但优势不明显时不如直接用 [[hono]] / [[fastify]]
- 需要 Spring/Nest 那样的 DI、依赖注入、企业级 plugin 生态
- 多语言微服务体系，期望 GraphQL 或独立 IDL
- 团队不熟 TypeScript 类型层，巨型类型会变成读不懂的报错

## 历史小故事（可跳过）

- **2022 年**：Bun runtime 进入公测，泰国独立开发者 SaltyAom（Athichai L.）开始写 Elysia v0.1，最初只是"在 Bun 上能跑的 Koa-like"
- **2023 年**：放弃 zod 改用 Sinclair 的 TypeBox，因为 TypeBox 用 JSON Schema 又能直接生成 TS 类型，跟"一份 schema 三处用"的目标更契合
- **2023 年**：Bun 1.0（2023-09）发布；Elysia 同步走向 1.x，引入 macro 编译期优化，和 Hono 一起常被拿来做 Bun/Edge 选型对照
- **2024–2025 年**：Eden Treaty 走向稳定，端到端类型安全成主推卖点；随后补上 Node 等 adapter，但仍明确 Bun-first，社区 plugin 远小于 Express 阵营

## 学到什么

1. **runtime 决定上限**：框架性能的天花板很多时候不是代码质量，而是底下跑的引擎是 V8 还是 JSC、IO 是 libuv 还是 Zig
2. **schema 是事实唯一来源**：当你能用一份 schema 同时做校验/类型/文档，开发体验和正确性会齐涨
3. **method chain + 类型累积** 是另一条端到端类型安全之路，差别只在协议是 REST 还是 RPC
4. **取舍永远要标量化**：Elysia 用"跨 runtime + 生态"换"性能 + 类型推导"，没有银弹

## 延伸阅读

- 官方文档：[elysiajs.com](https://elysiajs.com/)（quick start 半小时能过完）
- 仓库：[elysiajs/elysia](https://github.com/elysiajs/elysia)（看 README + examples 目录最快）
- TypeBox：[sinclairzx81/typebox](https://github.com/sinclairzx81/typebox)（理解 schema 的灵魂）
- Bun 性能基准：[bun.sh/docs](https://bun.sh/docs)（看真实 QPS 数字别只信宣传）
- [[hono]] —— 同阵营但跨 runtime 的兄弟，对照看选型差别更清楚

## 关联

- [[hono]] —— 同样 Web 标准 + 边缘 runtime，但不绑 Bun，类型推导稍弱
- [[fastify]] —— Node 上 schema-first 的老前辈，TypeBox 思路的源头之一
- [[express]] —— 反面参照：req/res 弱类型，看完 Elysia 更能感受痛点
- [[koa]] —— method chain + 中间件思路的早期代表，Elysia 是它的类型化后继
- [[nestjs]] —— 重型企业框架，与 Elysia 形成"DI 重 vs 极简"两极
- [[trpc]] —— 端到端类型安全的另一路线（RPC over JSON），与 Eden Treaty 对照
- [[bun]] —— Elysia 的"地基"，没它谈不上 Elysia

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
