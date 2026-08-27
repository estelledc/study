---
title: tRPC — TS 端到端类型安全 RPC
来源: https://github.com/trpc/trpc
日期: 2026-05-29
分类: API / 类型安全
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/trpc/trpc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6aec1578a899df50a17e4e78d5512a099b574c18
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.18.0
---

## 是什么

tRPC 是一个让 TypeScript 前后端**共享同一份 router 类型**的 RPC 框架。日常类比：以前点外卖要先对菜单（独立 schema），再核对后厨是否同一版本；tRPC 是把菜单本身当成类型，编译器替你核对点单。

后端用 `initTRPC.create()` 建 procedure（可远程调用的小函数）和 router，再 `export type AppRouter`。前端 `createTRPCClient<AppRouter>()` 用递归 Proxy 把 `user.byId.query(...)` 拼成 path，经 HTTP link 发出。运行时没有 codegen 步骤；类型只存在于编译期。

## 为什么重要

不理解固定 11.18.0 的合同，下面这些事会说错：

- 为什么客户端推荐 `createTRPCClient`，而旧文里的 `createTRPCProxyClient` 只是即将在 v12 删除的别名
- 为什么 input 不只属于 [[zod]]——parser 还认 Standard Schema、valibot、arktype、yup、superstruct 和自定义函数
- 为什么 React 现在有两套入口：`@trpc/react-query` 的 hook，以及 `@trpc/tanstack-react-query` 的 `queryOptions`
- 为什么 subscription 主合同已经是 `AsyncIterable`，observable 形态被标 deprecated

## 核心要点

固定源码可以把主链拆成五步：

1. **根对象只初始化一次**：`initTRPC.context<Ctx>().create()` 产出 `procedure` / `middleware` / `router` / `mergeRouters` / `createCallerFactory`。非 server 环境默认抛错，除非 `allowOutsideOfServer: true`。

2. **procedure builder 逐步收紧类型**：`.input(parser).use(mw).output(parser).query|mutation|subscription(resolver)`。resolver 拿到 `ctx`、`input`、`signal`、`path` 和可选 `batchIndex`。

3. **router 是一棵可懒加载的记录**：嵌套 router 组成 path；`lazy(() => import(...))` 按路径延迟加载。服务端调用走 `createCallerFactory`，不经过 HTTP。

4. **客户端是 Proxy + link 链**：`createTRPCClient` 把最后一段 `.query` / `.mutate` / `.subscribe` 映射到 procedure type。固定版本导出 `httpLink`、`httpBatchLink`、`httpBatchStreamLink`、`httpSubscriptionLink`、`wsLink`、`splitLink`、`loggerLink`、`retryLink`、`localLink`。`httpBatchLink` 的 `maxURLLength` / `maxItems` 默认 `Infinity`。

5. **HTTP 适配是 path 裁剪**：`fetchRequestHandler` 从 URL 去掉 `endpoint` 前缀，再交给 `resolveResponse`。同仓还有 Node HTTP、standalone、Express、Fastify、Next、Next App Router、AWS Lambda 与 WebSocket adapter。

## 实践示例

### 案例 1：最小 server + client

```ts
import { initTRPC } from "@trpc/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { z } from "zod";

const t = initTRPC.create();
const appRouter = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => db.user.find(input.id)),
  }),
});
export type AppRouter = typeof appRouter;

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});
const user = await client.user.byId.query({ id: "1" });
```

**逐部分解释**：

1. `export type AppRouter` 只导出类型，前端 `import type` 没有运行时体积
2. 客户端必须写 `.query()`；mutation 对应 `.mutate()`，subscription 对应 `.subscribe()`
3. Zod 能用，是因为它暴露 `parse` / `parseAsync`；换 Standard Schema 实现同样走 `getParseFn`

### 案例 2：middleware 收紧 ctx

```ts
const auth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
const protectedProcedure = t.procedure.use(auth);
```

`UNAUTHORIZED` 在固定源码里是 JSON-RPC `-32001`。`next({ ctx })` 的覆盖会进入下游 resolver 的类型。

### 案例 3：TanStack Query 的 options 入口

```ts
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useQuery } from "@tanstack/react-query";

const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function UserCard() {
  const trpc = useTRPC();
  const query = useQuery(trpc.user.byId.queryOptions({ id: "1" }));
  return query.data?.name ?? null;
}
```

这是 `@trpc/tanstack-react-query@11.18.0` 的入口：先拿 `queryOptions` / `mutationOptions`，再交给 TanStack Query。`@trpc/react-query` 的 `createTRPCReact` + `api.user.byId.useQuery` 仍在，但已经不是唯一写法。

## 踩过的坑

1. **继续把 `createTRPCProxyClient` 写成当前推荐名**：它只是 deprecated 别名，源码写明 v12 删除。
2. **把 input 说成“只能用 zod”**：`getParseFn` 按 `~standard` / `parseAsync` / `parse` / `assert` / `validateSync` / `create` 探测，认多家 validator。
3. **subscription 仍按 observable 教**：当前 `.subscription()` 主签名要求 `AsyncIterable`；observable 重载已 deprecated。
4. **假设 batch link 默认切批**：`maxURLLength` 与 `maxItems` 默认都是无限，不设上限就不会因长度自动拆批。
5. **在非 server 环境直接 `initTRPC.create()`**：默认会抛；浏览器侧应只用 client 包，或显式允许。

## 适用 vs 不适用场景

**适用**：
- 前后端都是 TypeScript、能共享 `AppRouter` 类型的内部应用
- 需要 compiler 在改字段时立刻打断客户端
- 已有 [[zod]] / valibot / arktype 等 runtime parser，并准备接 [[tanstack-query]]

**不适用**：
- 公开多语言 API——类型不能当跨语言契约，应走 OpenAPI / gRPC / [[connect-rpc]]
- 需要按字段选择子集的多端 GraphQL 查询——对照 [[graphql-yoga]]
- 不能接受 TypeScript `>= 5.7.2`，或尚未实测大型 router 的 IDE / `tsc` 成本

## 固定版本边界

- 本文绑定 `trpc/trpc@6aec1578...`，`@trpc/server` / `@trpc/client` 均为 `11.18.0`。
- 未安装依赖、未启动 adapter、未跑上游测试或测量 IDE/bundle，状态保持 `UNVERIFIED`。
- v12 删除项只按源码 deprecated 标记披露，不预测发布时间。

## 学到什么

1. **共享语言时，类型可以替代中间 schema 文件**——代价是客户端必须能 `import type`
2. **推荐入口会比“还能编译的旧名字”更窄**——proxy 别名与 observable subscription 都还在，但不该当新项目默认
3. **parser 适配层比品牌绑定更稳**——Standard Schema 让 tRPC 不必把 zod 写进 runtime 依赖
4. **React 集成正在从“自造 hook 树”退回“给 TanStack 喂 options”**

## 应用型自测

1. 新项目该写 `createTRPCProxyClient` 还是 `createTRPCClient`？
2. 不设 `maxItems` 时，`httpBatchLink` 会按默认 10 条切批吗？
3. 一个 procedure 的 input 能否用实现了 `~standard` 的非 zod schema？

检查点：

1. 应写 `createTRPCClient`；前者只是 v12 将删除的别名。
2. 不会。默认 `maxItems` 与 `maxURLLength` 都是 `Infinity`。
3. 能。`getParseFn` 优先识别 Standard Schema。

## 延伸阅读

- 官方文档：[trpc.io](https://trpc.io)
- 固定源码：[trpc/trpc](https://github.com/trpc/trpc) —— 本文绑定提交 `6aec1578a899df50a17e4e78d5512a099b574c18`
- [[zod]] —— 常见 input parser，但不是唯一适配对象
- [[tanstack-query]] —— `@trpc/tanstack-react-query` 的缓存底座
- [[graphql-yoga]] —— 需要字段选择与多语言客户端时的对照

## 关联

- [[zod]] —— procedure input/output 的常见 runtime parser
- [[tanstack-query]] —— `queryOptions` / 旧 `useQuery` hook 的缓存层
- [[graphql-yoga]] —— schema language + 字段选择的另一条 API 层
- [[hono]] —— 同为 TS 优先，但走显式 HTTP 路由
- [[next-js]] —— App Router adapter 与 RSC caller 的常见宿主
- [[connect-rpc]] —— 浏览器可跑、多语言友好的对照 RPC

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
