---
title: Apollo Server — 用插件管线执行 GraphQL 的 Node 服务端
来源: 'https://github.com/apollographql/apollo-server'
日期: 2026-05-30
分类: 后端 API
难度: 中级
description: "Explain how Apollo Server 5 runs HTTP GraphQL requests through plugins, CSRF defaults, and standalone or integration adapters."
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/apollographql/apollo-server
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4f154060bbe57d3bd612cb09ab63467f319d4ba5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.5.1
---

## 是什么

Apollo Server 是 GraphQL 的 **执行引擎 + HTTP 适配合同**，不是某一个 Web 框架。日常类比：它是后厨调度台。`ApolloServer` 认菜单和厨师；`executeHTTPGraphQLRequest` 认标准化的点菜单。Express、独立 HTTP 或网关只负责把盘子端上桌。

固定 `@apollo/server@5.5.1` 要求 Node `>=20`、peer `graphql@^16.11.0`。最小独立进程是：

```js
import { ApolloServer } from "@apollo/server"
import { startStandaloneServer } from "@apollo/server/standalone"

const server = new ApolloServer({
  typeDefs: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => "world" } },
})
const { url } = await startStandaloneServer(server)
```

`startStandaloneServer` 用 Node `http` + `cors` + `body-parser.json`（默认 50mb），监听 `4000`，并先装上 drain 插件再 `start()`。

## 为什么重要

不理解 5.x 这条合同，升级和对照都会走偏：

- 为什么 v5 不能再从 `@apollo/server/express4` import 中间件
- 为什么没配 CORS 的浏览器 GET 会被默认 CSRF 拦住
- 为什么 landing page、cache control、usage reporting 会在 `start()` 时自己出现
- 为什么 Federation 例子不能从本包里找 `buildSubgraphSchema`

## 核心要点

主链可以看成五段：

1. **构造 schema 来源**：`typeDefs`+`resolvers`、现成 `schema`，或外部 `gateway`。三者互斥。
2. **start 时补默认插件**：CacheControl 默认开；非 production 给 local landing page，production 给 production landing page；有 `APOLLO_KEY` 且有 `graphRef` 时前置 usage reporting；subgraph schema 默认 inline trace。
3. **适配器翻译 HTTP**：把 method / headers / search / body 收成 `HTTPGraphQLRequest`，再提供 `context()`。
4. **`processGraphQLRequest`**：persisted query → 取/解析 document → validate → `didResolveOperation` → execute → 格式化。GET 只允许 query。
5. **写出 HTTP 头和 body**：完整字符串或 incremental async iterator。

旧页里的“两件套 + `expressMiddleware(server)`”在 5.5.1 仍然能工作，但中间件来自 `@as-integrations/express5`，不在本包 exports 里。

## 实践示例

### 案例 1：独立进程，把用户放进 context

```js
const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req }) => ({
    user: req.headers.authorization ?? null,
  }),
})
```

`context` 不再传给 `new ApolloServer`。独立服务器把 Node 的 `IncomingMessage` 交给你，再把返回值送进 resolver 第三参。

### 案例 2：Express 5 适配器在另一个包

```js
import { expressMiddleware } from "@as-integrations/express5"
import express from "express"
import cors from "cors"

const app = express()
const server = new ApolloServer({ typeDefs, resolvers })
await server.start()

app.use("/graphql", cors(), express.json(), expressMiddleware(server, {
  context: async ({ req }) => ({ user: req.headers.authorization ?? null }),
}))
```

固定 README 的安装行是 `@apollo/server @as-integrations/express5 graphql express cors`。v4 的 `@apollo/server/express4` 深导入在 5.5.1 的 package exports 中不存在。

### 案例 3：关掉默认 CSRF 之前先认头

```js
const server = new ApolloServer({
  typeDefs,
  resolvers,
  csrfPrevention: true, // 与省略同义
})
```

默认要求：Content-Type 不是浏览器 safelist，或带 `x-apollo-operation-name` / `apollo-require-preflight`。`csrfPrevention: false` 才能关掉。这和 [[mercurius]] 的 opt-in 正好相反。

## 踩过的坑

1. **继续从 `@apollo/server/express4` import**：5.x 要求独立 integration 包；CHANGELOG 写明可先迁包再升主版本。
2. **把 batched HTTP 当默认**：`allowBatchedHttpRequests` 默认 `false`。
3. **以为 APQ 要自己打开**：Automatic Persisted Queries 默认开，关要用 `persistedQueries: false`。
4. **用 GET 发 mutation**：管线会 405，并写 `allow: POST`。
5. **把 DataLoader / subgraph codegen 写进本包**：N+1 仍靠外部 DataLoader；`buildSubgraphSchema` 在 `@apollo/subgraph`，本轮未检。

## 适用 vs 不适用场景

**适用**：

- 需要一份稳定的 HTTP GraphQL 执行器，再接到 Express、独立进程或自写适配器
- 想要默认 CSRF、landing page、cache control，并能用插件关掉
- 已经走 Apollo graph ref / usage reporting，并接受环境变量合同

**不适用**：

- Fastify 应用只想要一个插件和 per-request loader——对照 [[mercurius]]
- 目标运行时是 Worker / Deno 的 `fetch` handler——本页未覆盖 [[graphql-yoga]]
- 同仓 TypeScript 函数即 API、不需要 SDL——那是 [[trpc]] 的问题，本页不改它
- 要把“Federation 是唯一拆分方式”或固定吞吐写成结论——缺少运行证据

## 固定版本边界

- 本文绑定 `apollographql/apollo-server@4f154060...`，即 `@apollo/server@5.5.1` 的解引用提交，与 npm `gitHead` 一致。
- 包导出 `.` / `./standalone` / `./errors` / 若干 `./plugin/*`；没有 `./express4`。
- CSRF、APQ、CacheControl 默认开；batched HTTP 默认关；`status400ForVariableCoercionErrors` 默认 `true`。
- 本文未安装依赖、未跑 Jest、未启动 standalone、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架中间件不是核心 API**——核心是 `executeHTTPGraphQLRequest`
2. **默认插件会在 start 时长出来**——没写进 constructor 不等于没装
3. **CSRF 默认保护的是“看起来像简单请求”的浏览器调用**，不是所有客户端
4. **v4 单包收敛之后，v5 又把宿主适配拆出去**——升级要认 exports，而不是旧 import 记忆

## 应用型自测

1. `@apollo/server@5.5.1` 还能从 `@apollo/server/express4` 导入 `expressMiddleware` 吗？
2. 构造时不写 `csrfPrevention`，浏览器用无自定义头的 GET 发 query，会进入 `context()` 吗？
3. `allowBatchedHttpRequests` 默认允许 POST body 里的 operation 数组吗？

检查点：

1. 不能。5.5.1 的 package exports 没有这一项，要走 `@as-integrations/express5`。
2. 默认 CSRF 会先拦住这类非预检请求，不进入后续 context / execute。
3. 不允许。默认 `false`。

## 延伸阅读

- 官方文档：[Apollo Server Docs](https://www.apollographql.com/docs/apollo-server)
- 固定源码：[apollographql/apollo-server](https://github.com/apollographql/apollo-server) —— 本文绑定提交 `4f154060bbe57d3bd612cb09ab63467f319d4ba5`
- DataLoader：[graphql/dataloader](https://github.com/graphql/dataloader)
- [[mercurius]] —— Fastify 插件对照：CSRF / JIT / loader 边界不同

## 关联

- [[express]] —— 常见宿主；5.x 中间件在 `@as-integrations/express5`
- [[mercurius]] —— Fastify 适配器，默认安全开关相反
- [[fastify]] —— 另一条宿主路线，本包不内置
- [[graphql-yoga]] —— 跨运行时对照，本轮未改
- [[trpc]] —— 无 SDL 的同仓 TS 对照，本轮未改

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[haraka]] —— Haraka — 用 Node.js 写插件链式架构的 SMTP 服务器
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[mercurius]] —— Mercurius — 把 GraphQL 接到 Fastify 上的适配器
- [[nodemailer]] —— Nodemailer — Node.js 发邮件的事实标准
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
