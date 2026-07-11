---
title: GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
来源: 'https://github.com/dotansimha/graphql-yoga'
日期: 2026-05-30
分类: 后端 API
难度: 中级
---

## 是什么

GraphQL Yoga 是 The Guild 出的 **GraphQL HTTP 服务器**：你给它一份 schema 和 resolvers，它接管解析、校验、执行、返回 JSON。和 Apollo Server 干同一件事，但更小巧、不绑 Node。

日常类比：还是"自助点单"那家餐厅，但 Yoga 是**走开放厨房的小店**——后厨只有标准工具，灶台同时能用煤气、电、柴。Apollo 是连锁店带自家中央厨房（Studio + Federation 商业化）。

代码长这样：

```js
import { createYoga, createSchema } from 'graphql-yoga'
import { createServer } from 'node:http'

const yoga = createYoga({
  schema: createSchema({
    typeDefs: `type Query { hello: String }`,
    resolvers: { Query: { hello: () => 'world' } },
  }),
})
createServer(yoga).listen(4000)
```

一个 `createYoga`、一个 schema，HTTP 端点就有了，自带 GraphiQL 调试网页。

## 为什么重要

不理解 Yoga，下面这些事不好解释：

- 为什么同一份 GraphQL handler 既能跑 Node，又能直接 `export default { fetch: yoga.fetch }` 部署到 Cloudflare Workers / Deno / Bun
- 为什么 The Guild 工具链（codegen / inspector / mesh / hive）默认推 Yoga 当 server 层
- 为什么 GraphQL 圈出现"两条主线"——Apollo 的全家桶 vs Yoga + Envelop 的拼装路线
- 为什么 Yoga v3 重写后体积砍到一半还更快——Web Fetch API 抛掉 Node 专属胶水

## 核心要点

Yoga 的设计可以拆成 **三块**：

1. **Fetch-based HTTP**：Yoga 是一个 `(Request) => Response` 的纯函数。Node 用 `createServer(yoga)`，Workers 用 `export default { fetch: yoga.fetch }`，本质是同一个东西。类比：你的厨房只接受标准化外卖箱，谁来取都按这个箱子接。

2. **Envelop 插件系统**：每个 GraphQL 阶段（parse / validate / context / execute / subscribe）都开 hook，插件像积木一样拼。`useDepthLimit`、`useResponseCache`、`usePersistedOperations` 都是社区插件。类比：每道菜中间留一个检查口，安检员、营养师、记账员各自挂上去。

3. **schema 工厂 + context 工厂**：`createSchema` 把 typeDefs + resolvers 编成可执行 schema；`context` 是个函数，每请求跑一次注入登录用户。

底层 executor 仍是 graphql-js，所以 schema 文件能在 Apollo / Yoga 之间直接搬。

## 实践案例

### 案例 1：Node 上跑起来

```js
import { createYoga, createSchema } from 'graphql-yoga'
import { createServer } from 'node:http'

const schema = createSchema({
  typeDefs: `
    type Book { title: String, author: String }
    type Query { books: [Book] }
  `,
  resolvers: { Query: { books: () => [{ title: 'A', author: 'X' }] } },
})

createServer(createYoga({ schema })).listen(4000)
```

打开 `http://localhost:4000/graphql` 自带 GraphiQL，能直接写查询。

### 案例 2：同一份代码部署到 Cloudflare Workers

```js
import { createYoga, createSchema } from 'graphql-yoga'

const yoga = createYoga({
  schema: createSchema({
    typeDefs: `type Query { hello: String }`,
    resolvers: { Query: { hello: () => 'edge!' } },
  }),
  graphqlEndpoint: '/',
})

export default { fetch: yoga.fetch }
```

不需要 `node:http`、不需要 polyfill；Workers 把请求当成 Web Request 喂进来，Yoga 直接吃。Deno 和 Bun 也走同样套路。

### 案例 3：用 Envelop 插件防 DoS

```js
import { createYoga } from 'graphql-yoga'
import { useDepthLimit } from '@envelop/depth-limit'

const yoga = createYoga({
  schema,
  plugins: [useDepthLimit({ maxDepth: 10 })],
})
```

恶意客户端发 `user { posts { author { posts { author { ... } } } } }` 这种深层嵌套时直接被拒，避免后端被指数级 resolver 调用打崩。

## 踩过的坑

1. **GraphiQL 默认开着**：`createYoga({})` 不传 `graphiql: false` 时生产环境也暴露调试 IDE，schema 一览无余。要么关掉，要么用 `graphiql: { headerEditorEnabled: false }` 限制。

2. **graphql peerDep 版本错配**：`graphql` 是 peerDep，npm 同时装了两个版本时运行时报 "Cannot use a different copy of graphql"。锁同一份就行。

3. **Federation 不在主包**：要做 subgraph 必须装 `@graphql-yoga/federation`，按 `useApolloFederation` 风格挂插件，光装 graphql-yoga 启动 Federation 会一脸懵。

4. **context 工厂当全局缓存**：`context: () => ({ cache: new Map() })` 看着没事，跨请求**共享**会让 A 用户看到 B 用户的数据。每请求新建是关键。

## 适用 vs 不适用场景

**适用**：
- 想跨运行时部署（Node + Workers / Deno / Bun 同一份）
- 想要 GraphQL 但不想被 Apollo Studio / Federation 商业化路线绑
- 已经在用 The Guild 工具链（codegen + hive + mesh）
- 想用 Envelop 自定义中间件（rate limit、persisted ops、tracing）

**不适用**：
- 想要 Apollo Studio 一键监控 → 直接用 Apollo Server 省心
- 团队已经标准化在 Apollo Federation v2 → 迁移收益不大
- 极简 CRUD 单体 → REST/tRPC 更轻
- 需要 GraphQL Java / Python 生态 → Yoga 只在 JS 圈

## 历史小故事（可跳过）

- **2018 年**：Prisma Labs 发布 graphql-yoga v1，本质是 `apollo-server-express + graphql-tools` 的预设打包，定位是"零配置 Apollo"
- **2021 年**：The Guild 接管维护权，Prisma 把精力转向自家 ORM
- **2022 年**：Yoga v3 大重写，扔掉 apollo-server-express 依赖，改用 Web Fetch API 自己实现 HTTP 层 + 集成 Envelop 插件系统
- **2023 年**：v4 调整默认错误响应格式，对齐 GraphQL over HTTP spec；增 `@graphql-yoga/federation`
- **2024–2025 年**：v5 持续打磨，subscription 用 SSE 替代 WebSocket 当默认，跨运行时矩阵稳定

## 学到什么

- **Web Fetch API 是跨运行时的最大公约数**：Yoga v3 的关键决策——只认 `Request/Response`，省掉一层适配
- **Envelop 拆开 GraphQL 流水线**：parse / validate / execute 每步都能插钩子，比 Apollo 的 plugin 颗粒更细
- **库可以"轻"也可以"全"**：Yoga 选轻，Apollo 选全，靠共享 graphql-js 底座保证 schema 不锁死
- **The Guild vs Apollo 的路线分歧**：开源中性 + 商业化捆绑是 GraphQL 工具链长期的两条主轴

## 延伸阅读

- 官方文档：[GraphQL Yoga Docs](https://the-guild.dev/graphql/yoga-server)（quickstart + 跨运行时部署都在这）
- Envelop 文档：[envelop.dev](https://the-guild.dev/graphql/envelop)（理解插件系统的钥匙）
- 视频：[The Guild — Yoga v3 Deep Dive](https://www.youtube.com/watch?v=ZgBRk2qd1JE)（作者讲为什么重写）
- 对比阅读：[Apollo Server](https://www.apollographql.com/docs/apollo-server)（同类全家桶路线）
- GraphQL over HTTP spec：[graphql/graphql-over-http](https://github.com/graphql/graphql-over-http)（Yoga v4+ 对齐的标准）

## 关联

- [[apollo-server]] —— 同生态另一主流 server，schema 可互搬
- [[express]] —— Yoga 可以挂在 Express 上当中间件
- [[fastify]] —— 另一常见宿主，Yoga 提供官方适配
- [[trpc]] —— 同站全 TS 替代品，没有 schema language
- [[grpc-go]] —— 二进制契约 RPC，跨语言时比 GraphQL 更省字节
- [[connect-rpc]] —— 跨语言 RPC，定位介于 gRPC 和 REST 之间
- [[swr]] —— 前端拿 GraphQL 数据时常用的缓存层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
