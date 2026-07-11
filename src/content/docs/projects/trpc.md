---
title: tRPC — TS 端到端类型安全 RPC
来源: https://github.com/trpc/trpc
日期: 2026-05-29
分类: API / 类型安全
难度: 中级
---

## 是什么

tRPC 是一个让你**前端直接调用后端函数**、**类型自动同步**的 TypeScript 框架。日常类比：以前点外卖要先翻菜单（schema）再下单、还得核对菜单和后台是否一致；tRPC 是直接喊"老板我要那道菜"，菜单和后台对账自动同步。

后端定义 procedure（可理解为"一个可远程调用的小函数"），导出类型；前端用同一份类型调用——**没写 fetch、没写响应类型、没跑 codegen**（不用额外脚本生成客户端代码）。看起来像本地函数，背后是递归 Proxy（拦截属性访问的替身对象）+ 共享 TS 类型 + 一条 HTTP link。

## 为什么重要

不理解 tRPC，下面这些事都解释不通：

- 为什么 T3 Stack（Next.js + tRPC + Prisma + Tailwind）在不少 TypeScript 全栈社区里成了默认起步套餐
- 为什么"后端改字段、前端立刻报错"成为可能——REST + 手写类型时代要靠测试或线上炸才发现
- 为什么 OpenAPI / GraphQL 那一套 codegen 流程在小型 TS 项目里常被觉得"过度工程"
- 为什么 [[zod]] 不只是验证库——它在 tRPC 里扮演 schema-as-runtime（运行时按 schema 校验）的角色

## 核心要点

tRPC 的运作可以拆成 **三层**：

1. **TypeScript inference（类型推导）**：前端 `import type { AppRouter }` 拿到后端 router 的类型树。编译期把每个 procedure 映射成 `.query / .mutate / .subscribe`。前后端靠**同一份 .ts 类型**对齐，不靠单独 schema 文件。类比：两人本子上抄同一份菜单，改一处两边都看见。

2. **Procedure（远程小函数）**：三种——`query`（读）、`mutation`（写）、`subscription`（订阅）。链式 builder：`t.procedure.input(...).use(...).query(resolver)`，类型逐步收紧。类比：点菜单上先写菜名、再写忌口、最后下锅。

3. **Context + Middleware**：Context 是每个请求的共享背景（数据库、当前用户）；middleware 是挂在 procedure 上的拦截器，像门卫——`t.procedure.use(authMiddleware)` 强制登录后再进厅。

## 实践案例

### 案例 1：最小接线 → 定义 → 调用

```typescript
// server.ts
const t = initTRPC.create()
const appRouter = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => db.user.find(input.id))
  })
})
export type AppRouter = typeof appRouter

// client.ts
const api = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })]
})
const user = await api.user.byId.query({ id: '1' })
```

**逐部分解释**：

1. `initTRPC.create()` 造出 `t`，再挂 router / procedure
2. `export type AppRouter` 只导出类型；前端 `import type` 零运行时成本
3. `createTRPCProxyClient` 用 Proxy 把 `user.byId` 拼成 path，经 `httpBatchLink` 发 HTTP

### 案例 2：middleware 强制登录并收紧类型

```typescript
const auth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})
const protectedProcedure = t.procedure.use(auth)
const appRouter = t.router({
  me: protectedProcedure.query(({ ctx }) => ctx.user) // user 非空
})
```

**逐部分解释**：

1. middleware 先检查 `ctx.user`，没有就抛 UNAUTHORIZED
2. `next({ ctx })` 把收紧后的 ctx 传给下游
3. resolver 里 `ctx.user` 不再是 `undefined`——门卫验完证，厅里默认你是会员

### 案例 3：与 TanStack Query 集成

```typescript
const api = createTRPCReact<AppRouter>()
const { data, isLoading } = api.user.byId.useQuery(
  { id: '1' },
  { staleTime: 60_000, retry: 3 }
)
```

**逐部分解释**：

1. `createTRPCReact<AppRouter>()` 按 router 类型生成 hooks
2. `api.user.byId.useQuery` = procedure 自动包成 `useQuery`
3. 缓存 / 重试 / focus revalidate 免费来自 [[tanstack-query]]，中间仍无 schema 文件

## 踩过的坑

1. **只能 TS 单仓使用**：Swift / Kotlin / Python 客户端没法 import 类型，得走 REST adapter（如 trpc-openapi）——根因是假设两端共享语言。
2. **大型 router IDE 卡顿**：几百个 procedure 时 `tsc` 与补全变慢；可拆 sub-router / lazy router，但不彻底。
3. **Subscription 不开箱**：要 WebSocket（`wsLink`）或 SSE（`httpSubscriptionLink`），并单独挂适配层，比 query/mutation 麻烦。
4. **Next.js App Router / RSC 胶水多**：服务端直接调 router 与客户端 hook 是两条路径，团队要先约定边界，否则配置会膨胀。

## 适用 vs 不适用场景

**适用**：
- 前后端都是 TS 的内部应用——不写 fetch、不写类型
- 小到中型项目（< 200 procedure）——类型推导还吃得消
- 团队想要"重构后端字段、前端立刻报错"
- 配合 [[zod]] 做 input 校验 + [[tanstack-query]] 做缓存

**不适用**：
- 公开 API / 多语言客户端——REST + OpenAPI 或 gRPC 更直接
- 真正需要 GraphQL 灵活字段选择（多端各取不同子集）
- 巨型项目（> 300 procedure）——TS 推导慢到不可接受

## 历史小故事（可跳过）

- **2020 年**：Alex Johansson（KATT）开源 tRPC，赌"全 TS 单仓不需要中间 schema 文件"
- **2021–2022 年**：与 React Query 深度集成；T3 Stack 把它推进 Next.js 全栈模板，社区迅速放大
- **2023 年前后**：v10 起 builder API 与 adapter 生态成熟；公开 API / 多语言场景仍多走 OpenAPI 适配

## 学到什么

1. **协议层不是必需品**——共享语言时，类型本身就是协议；过去硬塞 OpenAPI/GraphQL，常因前后端不同语言
2. **Proxy 是 TS SDK 的瑞士军刀**——没有它就只能 codegen
3. **Builder 链 + 类型累积**是 TS 库通用模式——zod、drizzle 同源
4. **先解决 90% 简单场景**——故意不像 GraphQL 那么强，省下的复杂度是真金白银

## 延伸阅读

- 官方文档：[trpc.io](https://trpc.io)
- 视频：[Theo Browne — Why I use tRPC](https://www.youtube.com/@t3dotgg)
- T3 起步：[create.t3.gg](https://create.t3.gg)
- [[zod]] —— schema-as-runtime 一等公民
- [[tanstack-query]] —— `@trpc/react-query` 的缓存底座

## 关联

- [[zod]] —— input/output 默认走 zod parser
- [[tanstack-query]] —— procedure 包成 useQuery，免费拿缓存重试
- [[hono]] —— 同为 TS 优先，但走 REST 路线
- [[next-js]] —— T3 Stack 另一半；App Router 与 tRPC 整合是常见热点
- [[connect-rpc]] —— 浏览器可跑的 gRPC 风格 RPC，多语言友好对照

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
- [[next-js]] —— Next.js — React 全栈框架
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[zod]] —— Zod — TypeScript-first schema 验证
