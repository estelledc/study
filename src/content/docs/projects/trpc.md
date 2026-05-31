---
title: tRPC — TS 端到端类型安全 RPC
来源: https://github.com/trpc/trpc
日期: 2026-05-29
分类: API / 类型安全
难度: 中级
---

## 是什么

tRPC 是一个让你**前端直接调用后端函数**、**类型自动同步**的 TypeScript 框架。日常类比：以前点外卖，先翻菜单（schema），再下单，还得核对菜单和后台是否一致；tRPC 是直接喊"老板我要那道菜"，菜单和后台对账自动同步。

后端定义：

```typescript
const appRouter = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => ctx.db.user.find(input.id))
  })
})
export type AppRouter = typeof appRouter
```

前端调用：

```typescript
const { data } = api.user.byId.useQuery({ id: '1' })
//      ^? data 类型 = 后端 ctx.db.user.find 的返回类型
```

**没写一行 fetch、没写一行响应类型、没跑 codegen**。前端调用看起来像本地函数，背后是一个递归 Proxy + 一份共享的 TS 类型 + 一根 link 链。

## 为什么重要

不理解 tRPC，下面这些事都解释不通：

- 为什么 T3 Stack（Next.js + tRPC + Prisma + Tailwind）成了 TypeScript 全栈的默认套餐
- 为什么"后端改字段、前端立刻报错"成为可能——这在 REST + 手写类型时代要靠测试或线上炸来发现
- 为什么 OpenAPI / GraphQL 那一套 codegen 流程在小型 TS 项目里被觉得"过度工程"
- 为什么 [[zod]] 不只是验证库——它在 tRPC 里扮演 schema-as-runtime 的角色

## 核心要点

tRPC 的运作可以拆成 **三层**：

1. **TypeScript inference**：前端 `import type { AppRouter } from '../server'` 拿到后端 router 的完整类型树。编译期顺着类型递归映射，把每个 procedure 变成 `.query / .mutate / .subscribe` 调用。前后端靠**同一份 .ts 文件**对齐，不通过 schema 文件。

2. **Procedure**：服务端三种 procedure——`query`（读）、`mutation`（写）、`subscription`（订阅）。每个 procedure 是 `t.procedure.input(...).output(...).use(...).query(resolver)` 链式 builder——不可变累积，类型逐步收紧。

3. **Context + Middleware**：Context 是每个请求的"共享背景"（数据库 client、当前用户、trace ID）；middleware 是 procedure 上挂的拦截器，类比 Express middleware——`t.procedure.use(authMiddleware)` 强制登录。

## 实践案例

### 案例 1：定义 procedure → 调用 procedure

```typescript
// server.ts
const appRouter = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => ctx.db.user.find(input.id))
  })
})
export type AppRouter = typeof appRouter
```

```typescript
// client.tsx
const { data } = api.user.byId.useQuery({ id: '1' })
//                                ↑ TS 知道要传 { id: string }
//                                ↑ data 类型 = User | undefined
```

**关键**：`api.user.byId` 不是真的属性访问——它是个递归 Proxy，把 `user.byId` 拼成 path、把 args 序列化、通过 fetch 发 HTTP。

### 案例 2：middleware 强制登录

```typescript
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })  // 收紧 user 类型
})

const protectedProcedure = t.procedure.use(authMiddleware)

const appRouter = t.router({
  me: protectedProcedure.query(({ ctx }) => ctx.user)
  //                                          ↑ ctx.user 不再是 undefined
})
```

middleware 的能力不只是拦截——`next({ ctx })` 会**收紧 ctx 类型**让下游 resolver 拿到非空 user，这是 TS-first 框架才能做到的。

### 案例 3：与 TanStack Query 集成

```typescript
const api = createTRPCReact<AppRouter>()

const { data, isLoading } = api.user.byId.useQuery(
  { id: '1' },
  { staleTime: 60_000, retry: 3 }
)
```

`@trpc/react-query` 把每个 procedure 自动包成 `useQuery` hook——免费拿到缓存 / 重试 / focus revalidate / 乐观更新。前端写 hook，后端写 procedure，中间没 schema 文件。

## 踩过的坑

1. **只能 TS 单仓使用**：iOS Swift / Android Kotlin / Python 客户端调你的 server，没法 import 类型，必须走 REST adapter（trpc-openapi）反向适配。这是 tRPC 的根本限制——它假设两端共享语言。

2. **大型 router IDE 卡顿**：router 深嵌套 + 几百个 procedure 时，TS 类型推导 `tsc --noEmit` 从秒级跳到分钟级，IDE 写代码补全也跟着慢。解法是 lazy router + 拆 sub-router，但不彻底。

3. **Subscription 不开箱即用**：实时订阅要 WebSocket adapter（`wsLink`）或 SSE adapter（`httpSubscriptionLink`），server 端要单独起 WS server 或挂 SSE 路由。比 query / mutation 麻烦得多。

4. **Next.js Server Components 整合复杂**：Next 13+ 要 `createTRPCNextLayout` 等额外配置，RSC 里直接调用 router 还是走 hook，团队要先约定。简洁是 query/mutation 简洁，进 RSC 边界胶水会变多。

## 适用 vs 不适用场景

**适用**：
- 前后端都是 TS 的内部应用——不写 fetch、不写类型，最爽姿势
- 小到中型项目（< 200 procedure）——类型推导还吃得消
- 团队全员 TS、想要"重构后端字段、前端立刻报错"的体感
- 配合 [[zod]] 做 input 校验 + [[tanstack-query]] 做缓存层，开箱全栈

**不适用**：
- 公开 API（给第三方调用）——用 REST + OpenAPI，对方不一定是 TS
- 多语言客户端（iOS / Android / Python）——REST 或 gRPC 更直接
- 真正需要 GraphQL 灵活字段选择（N 端 client 各取不同字段子集）
- 巨型项目（> 300 procedure）——TS 推导慢到不可接受，得拆 sub-router

## 学到什么

1. **协议层不是必需品**——当前后端共享语言时，类型本身就是协议；过去十几年我们在前后端中间硬塞 OpenAPI/GraphQL，是因为前后端不同语言这个假设
2. **Proxy 是 TS SDK 的瑞士军刀**——递归 Proxy 把"看起来像本地函数"变成可能，没有它就只能 codegen
3. **Builder 链 + 类型累积**是 TS 库的通用模式——zod、drizzle、knex 同源；理解 tRPC 的 `.input().use().query()` 就理解了一类设计
4. **先解决 90% 简单场景再考虑 10% 复杂场景**——tRPC 故意不像 GraphQL 那么强大，省下来的复杂度是真金白银

## 延伸阅读

- 官方文档：[trpc.io](https://trpc.io)（quickstart 30 分钟跑通最小 server + client）
- 视频教程：[Theo Browne — Why I use tRPC](https://www.youtube.com/@t3dotgg)（讲背景判断最清晰）
- T3 Stack 起步：[create.t3.gg](https://create.t3.gg)（Next.js + tRPC + Prisma + Tailwind 一键模板）
- 自己写一个：用 Proxy + 类型递归映射写迷你版 tRPC，只支持 query 单方法——能彻底理解机制
- [[zod]] —— input/output 默认走 zod parser，是 tRPC 的 schema-as-runtime 一等公民
- [[tanstack-query]] —— `@trpc/react-query` 把 procedure 包成 useQuery，免费拿缓存重试

## 关联

- [[zod]] —— tRPC 的 schema 校验一等公民，input/output 默认走 zod parser
- [[tanstack-query]] —— `@trpc/react-query` 把 procedure 包成 useQuery，免费拿缓存重试
- [[hono]] —— 同样是 TS 优先的 server 框架，但走 REST 路线，对比可见两种取舍
- [[next-js]] —— T3 Stack 的另一半，Next 13+ App Router 与 tRPC 的整合是当前热点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[connect-rpc]] —— ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[hono]] —— Hono — 多运行时 Web 框架
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[next-js]] —— Next.js — React 全栈框架
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[zod]] —— Zod — TypeScript-first schema 验证

