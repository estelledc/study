---
title: Apollo Server — Node 端 GraphQL 服务端的事实标准
来源: 'https://github.com/apollographql/apollo-server'
日期: 2026-05-30
分类: 后端 API
难度: 中级
---

## 是什么

Apollo Server 是一个 **Node.js GraphQL 服务端框架**：你写一份"菜单"（schema），再写一组"厨师"（resolvers，每道菜怎么做），它负责按客户点的单上菜。

日常类比：像点菜系统。REST 是"套餐"——服务员只能给你 A 套餐或 B 套餐，多余的菜也得吃。GraphQL 是"自助点单"——客人列出"我要鱼香肉丝里的笋丝、宫保鸡丁里的花生"，后厨按单装盘。

代码长这样：

```js
import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'

const typeDefs = `type Query { hello: String }`
const resolvers = { Query: { hello: () => 'world' } }

const server = new ApolloServer({ typeDefs, resolvers })
const { url } = await startStandaloneServer(server)
```

两件套（typeDefs + resolvers）+ 一句 startStandaloneServer，一个 GraphQL endpoint 就跑起来了。

## 为什么重要

不理解 Apollo Server，下面这些事都不好解释：

- 为什么 GitHub API v4 / Shopify / Airbnb 用 GraphQL，前端只发一个请求就能拿到嵌套数据
- 为什么大公司多团队前端不再吵"这个字段加在哪个接口"——Federation 让每个团队各管一段 schema
- 为什么 GraphQL 项目都在踩 N+1，DataLoader 几乎成了标配
- 为什么 v4 升级时全网在改 import——单包架构是有意收敛

## 核心要点

Apollo Server 的设计可以拆成 **三块**：

1. **schema-first**：先写 SDL（schema definition language）描述 API，编译器把它变成可执行 schema。类比：先画好菜单，厨师才知道有什么菜。`type Query { user(id: ID!): User }` 就是一行菜单。

2. **resolvers 树**：每个字段对应一个函数，签名是 `(parent, args, context, info) => value`。类比：每道菜有一个厨师，上一道菜的产出（parent）是这道菜的原料。

3. **数据源 + context**：每个请求 new 一个 context（装当前用户、DataLoader 实例等），resolvers 通过 context 拿数据库连接。类比：每桌单独一个服务员账本，互不串台。

底层执行器是 graphql-js，Apollo 在外面套了 HTTP 处理 + 插件系统 + Federation。

## 实践案例

### 案例 1：最小 Hello World

```js
import { ApolloServer } from '@apollo/server'
import { startStandaloneServer } from '@apollo/server/standalone'

const typeDefs = `
  type Book { title: String, author: String }
  type Query { books: [Book] }
`
const books = [{ title: 'A', author: 'X' }]
const resolvers = { Query: { books: () => books } }

const server = new ApolloServer({ typeDefs, resolvers })
const { url } = await startStandaloneServer(server, { listen: { port: 4000 } })
console.log(`ready at ${url}`)
```

打开 url 自带 Apollo Sandbox（一个网页 IDE），你能直接写查询测试。

### 案例 2：挂在 Express 上 + 注入用户身份

```js
import express from 'express'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import cors from 'cors'

const app = express()
const server = new ApolloServer({ typeDefs, resolvers })
await server.start()

app.use('/graphql', cors(), express.json(), expressMiddleware(server, {
  context: async ({ req }) => ({ user: await getUserFromToken(req.headers.authorization) }),
}))
```

`context` 每个请求跑一次，把 user 注入；resolvers 里 `(parent, args, ctx) => ctx.user.id` 就能用。

### 案例 3：Federation v2 子图

```js
import { buildSubgraphSchema } from '@apollo/subgraph'

const typeDefs = `
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0")
  type User @key(fields: "id") { id: ID!, name: String }
`
const resolvers = {
  User: { __resolveReference: ({ id }) => loadUser(id) },
}
const server = new ApolloServer({ schema: buildSubgraphSchema({ typeDefs, resolvers }) })
```

`@key` 告诉网关"User 用 id 跨子图认领"；网关收到查询时按 id 来本子图取 User，再把结果合并。

## 踩过的坑

1. **N+1 查询**：`Post.author` resolver 直接 `db.users.findById(post.authorId)` 会让 100 篇文章触发 100 次 DB 查询，必须套 DataLoader 在一次 tick 里 batch + cache。

2. **resolvers 名字打错只返 null**：typeDefs 里写 `title`，resolvers 里写成 `Title`，Apollo 不报错只静默返 null，调试半天才发现是大小写。

3. **context 别放全局可变状态**：context 函数每请求跑一次，里头 new Date() 这种没事，但放共享 cache 时记得加请求作用域；放错地方会让 A 用户看到 B 用户数据。

4. **v3 → v4 大改 import**：以前 `apollo-server-express`、`apollo-server-koa` 一堆子包，v4 全合并进 `@apollo/server`，老代码 import 全要改 + 中间件改成 `expressMiddleware(server)` 注入。

## 适用 vs 不适用场景

**适用**：
- 前端字段需求多变、嵌套层级深（GraphQL 一次请求拿全）
- 多团队多服务要拼一份对外 API（用 Federation 让每团队管自己 subgraph）
- 已经在 Node.js 生态，不想自己造 HTTP + 解析 + executor 轮子
- 想要查询验证、tracing、缓存等开箱即用

**不适用**：
- 简单 CRUD + 单团队 → REST/tRPC 更轻
- 极致延迟敏感（金融交易撮合）→ gRPC/Protobuf 二进制更快
- 大量文件上传/流式数据 → GraphQL 不擅长，走 HTTP 直传
- 已用 Yoga GraphQL/Mercurius 等其它 server，没强诉求别迁

## 历史小故事（可跳过）

- **2012 年**：Facebook 内部为新闻 feed iOS app 设计 GraphQL，解决 REST 数据冗余/不足
- **2015 年**：GraphQL 规范开源，graphql-js 参考实现发布
- **2016 年**：Apollo（公司原名 Meteor）推出 Apollo Server 把 GraphQL 在 Node 落地
- **2018 年**：Apollo Federation v1 让多 service schema 合并；2021 v2 改进
- **2022 年**：v4 大重构，所有 `apollo-server-*` 子包合并到 `@apollo/server`
- **2025 年前后**：v5 继续收敛运行时边界，重点放在新版 Node.js、Express 5 等宿主环境兼容

## 学到什么

- **schema-first 把契约提前**：前后端先对 schema 一致再各干各的，比 REST"接口文档拖后写"靠谱
- **resolvers 是树而非平面**：嵌套查询自然映射到嵌套 resolvers 调用，但也意味着 N+1 是默认坑
- **Federation 是"把单体大 schema 拆成多 subgraph 但对外仍是一份"** 的中间路线
- **包结构演化反映社区心智**：v4 收敛单包是承认"集成爆炸"是反模式

## 延伸阅读

- 官方文档：[Apollo Server Docs](https://www.apollographql.com/docs/apollo-server)（quickstart + Federation 都在这）
- 视频：[GraphQL 官方简介](https://www.youtube.com/watch?v=783ccP__No8)（Lee Byron，30 分钟讲清动机）
- DataLoader 源：[graphql/dataloader](https://github.com/graphql/dataloader)（解决 N+1 的标配）
- Federation 规范：[Apollo Federation Spec](https://www.apollographql.com/docs/federation/)
- 对比阅读：[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)（更轻量的同类）

## 关联

- [[express]] —— Apollo 最常见的 Node 宿主，expressMiddleware 直接挂上
- [[fastify]] —— 另一个常用宿主，fastifyApollo 插件支持
- [[koa]] —— 老 Apollo Server v3 时代主流宿主，v4 仍可用
- [[trpc]] —— 同站全 TS 替代品，没有 schema language，类型靠 TS 推
- [[grpc-go]] —— 二进制契约 RPC，Federation 之前微服务拼数据另一条路线
- [[connect-rpc]] —— 跨语言 RPC，介于 gRPC 和 REST 之间
- [[swr]] —— 前端拿 GraphQL 数据时常用的缓存层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[haraka]] —— Haraka — 用 Node.js 写插件链式架构的 SMTP 服务器
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[nodemailer]] —— Nodemailer — Node.js 发邮件的事实标准
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC

