---
title: Mercurius — 把 GraphQL 接到 Fastify 上的适配器
来源: 'https://github.com/mercurius-js/mercurius'
日期: 2026-08-27
分类: 后端 API
难度: 中级
description: "Explain how Mercurius registers Fastify routes, caches parsed documents, and optionally JIT-compiles GraphQL operations."
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mercurius-js/mercurius
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3ad0edd8af3aa1774a342cb9f14a4bd991e16a42
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 16.10.0
---

## 是什么

Mercurius 是一个 **Fastify GraphQL 插件**。日常类比：Fastify 是餐厅的店面和点餐柜台；Mercurius 把菜单（schema）和后厨（resolvers）接到同一条出餐口，并决定要不要把常点的菜预编译。

固定 `16.10.0` 声明 `fastify: '5.x'`，Node 为 `^20.9.0 || >=22.0.0`，peer 是 `graphql@^16`。你写：

```js
import Fastify from "fastify"
import mercurius from "mercurius"

const app = Fastify()
app.register(mercurius, {
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => "world" } },
})
await app.listen({ port: 3000 })
```

默认挂 `GET` / `POST` `/graphql`。`routes: false` 时只留下 `app.graphql` / `reply.graphql`，HTTP 面要自己接。

## 为什么重要

不理解这层 Fastify 适配，下面这些事会对不上：

- 为什么同一份 schema 既能走 HTTP，也能被内部 `reply.graphql()` 复用
- 为什么 loader 看起来像 DataLoader，却必须带着 `reply`
- 为什么文档缓存默认开着，但 `graphql-jit` 不会自动上
- 为什么 CSRF 和 GraphiQL 都要显式打开，不能按 Apollo 的默认去猜

## 核心要点

一次查询可以拆成六步：

1. **注册插件**：校验 schema，装饰 `app.graphql`，按选项挂路由、WebSocket 与 error handler。
2. **组 context**：`context(request, reply)` 的返回值会并上 `reply` / `app`；loader 工厂按请求挂到 `reply`。
3. **preParsing → parse**：字符串 query 先过 hook，再用 `graphql.parse`。成功 document 默认进 1024 槽 `quick-lru`；校验失败另进 error cache。
4. **preValidation → validate**：可追加 `validationRules` 和 `queryDepth`。`GET` 只允许 query，mutation 会 `METHOD_NOT_ALLOWED`。
5. **preExecution → 执行**：默认调用 `graphql.execute`。`jit: 1` 会在缓存计数命中后 `compileQuery`；`jit: { minCount, eluThreshold }` 走后台 adaptive compile。
6. **onResolution**：格式化 errors，必要时改 `reply` 状态码。

## 实践示例

### 案例 1：带请求身份的最小服务

```js
app.register(mercurius, {
  schema: `type Query { me: String }`,
  resolvers: {
    Query: { me: (_root, _args, ctx) => ctx.user ?? "anon" },
  },
  context: async (request) => ({
    user: request.headers["x-user"] ?? null,
  }),
})
```

`context` 每个请求跑一次。resolver 第三参就是这份对象，再加上插件补上的 `reply` / `app`。

### 案例 2：用 defineLoaders 收 N+1

```js
app.register(mercurius, {
  schema: `
    type User { id: ID! name: String }
    type Query { users: [User] }
  `,
  resolvers: {
    Query: { users: () => [{ id: "1" }, { id: "2" }] },
  },
  loaders: {
    User: {
      async name(queries, ctx) {
        const ids = queries.map(({ obj }) => obj.id)
        return ids.map((id) => ctx.names.get(id))
      },
    },
  },
})
```

`defineLoaders` 用 `single-user-cache` 把同一请求里的 `User.name` 收成一批。loader 内部读 `ctx.reply`；直接 `app.graphql(query)`、没有 reply 时会抛错。

### 案例 3：打开 CSRF，而不是默认当成已开

```js
app.register(mercurius, {
  schema,
  resolvers,
  csrfPrevention: true,
})
```

`true` 采用 `application/json` / `application/graphql`，或要求 `x-mercurius-operation-name` / `mercurius-require-preflight`。不传该选项时，CSRF 检查不会跑。

## 踩过的坑

1. **把 GraphiQL 当默认附件**：只有 `graphiql` / `ide` 为真才挂 `/graphiql`；`onlyPersisted` 还会强制关掉 IDE。
2. **以为默认会 JIT**：未设 `jit` 时走 `execute`。测试启用都写 `jit: 1`；对象形态才是 adaptive JIT。
3. **在 `app.graphql()` 里用 loader**：loader resolver 没有 `reply` 就抛 `loaders only work via reply.graphql()`。
4. **把 `cache: false` 理解成“连解析都不做”**：它关掉的是 document LRU，不是 GraphQL 执行本身。
5. **按 Apollo 的默认去开 CSRF**：两边头名字不同，Mercurius 还是 opt-in。

## 适用 vs 不适用场景

**适用**：

- 已经在 Fastify 5 上，希望 GraphQL 变成一个插件而不是第二套服务器
- 需要同进程 pubsub / WebSocket subscription，并能接受 `mqemitter` 或自带 pubsub
- 想自己决定 JIT、CSRF、GraphiQL 和 batched query，而不是吃全家桶默认

**不适用**：

- 宿主是 Express / 独立 HTTP 适配器，又不想引入 Fastify
- 需要 Apollo Studio、usage reporting、gateway 那条托管合同——那是 [[apollo-server]] 的默认插件面
- 把 Yoga 的跨运行时 `fetch` handler 当成目标——本页未覆盖 [[graphql-yoga]]
- 需要把“比 Apollo 快 N 倍”写成预算——本文未测

## 固定版本边界

- 本文绑定 `mercurius-js/mercurius@3ad0edd8...`，tag 与 npm `gitHead` 均为 `16.10.0`。
- 插件声明 Fastify 5.x；Node `^20.9.0 || >=22.0.0`。
- 默认 document cache 1024；CSRF、GraphiQL、batched query、JIT 均非默认开启。
- 本文未安装依赖、未跑 `borp` / `tstyche`、未开 WebSocket 或测吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **适配器先接到宿主生命周期**——路由、context、error handler 都是 Fastify 钩子，不是第二套 HTTP stack
2. **缓存命中和 JIT 编译是两件事**——document LRU 默认开，编译要另设 `jit`
3. **loader 的请求作用域写在 reply 上**——没有 reply 就没有 batch
4. **安全默认值不能跨实现抄**——Mercurius 的 CSRF 头和开关都与 Apollo 不同

## 应用型自测

1. 不传 `jit`，第二次相同 query 会走 `compileQuery` 吗？
2. `csrfPrevention` 省略时，缺少 `x-mercurius-operation-name` 的 GET 会被插件拦下吗？
3. 调用 `app.graphql("{ users { name } }")` 且 schema 用了 `loaders.User.name`，会发生什么？

检查点：

1. 不会。默认执行路径是 `graphql.execute`；测试启用 JIT 写 `jit: 1`。
2. 不会。未配置时 CSRF 检查不运行。
3. loader 因缺少 `reply` 抛错；要从 HTTP 或 `reply.graphql()` 进入。

## 延伸阅读

- 官方文档：[mercurius.dev](https://mercurius.dev)
- 固定源码：[mercurius-js/mercurius](https://github.com/mercurius-js/mercurius) —— 本文绑定提交 `3ad0edd8af3aa1774a342cb9f14a4bd991e16a42`
- [[apollo-server]] —— 同主题的插件管线 / 独立 integration 对照
- [[fastify]] —— Mercurius 声明兼容的 5.x 宿主

## 关联

- [[fastify]] —— 插件、装饰器和路由都挂在这层
- [[apollo-server]] —— CSRF 默认开启、Express 适配外置的对照组
- [[graphql-yoga]] —— 另一条 GraphQL HTTP 服务器路线，本页未迁移
- [[dataloader]] —— 概念近亲；Mercurius loader 是 per-request Factory，不是这个包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — 用插件管线执行 GraphQL 的 Node 服务端
