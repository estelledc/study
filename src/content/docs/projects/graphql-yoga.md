---
title: GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
来源: 'https://github.com/graphql-hive/graphql-yoga'
日期: 2026-05-30
分类: 后端 API
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/graphql-hive/graphql-yoga
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0c6025d5bfcde9bd1be86b73ba406a0ca84e35eb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.22.0
---

## 是什么

GraphQL Yoga 是 The Guild / GraphQL Hive 的 **GraphQL HTTP 服务器**：你给它一份可执行 schema，它接管解析、校验、执行和按 Accept 选择的响应格式。日常类比：还是“自助点单”餐厅，但灶台只认标准化外卖箱（WHATWG `Request` / `Response`），煤气灶和电灶用同一套箱子接单。

`createYoga()` 先构造内部 `YogaServer`，再包一层 `@whatwg-node/server` 的 `createServerAdapter`。所以同一个实例既能 `createServer(yoga)` 挂到 Node，也能在 Workers / Deno / Bun 上当 Fetch handler。`createSchema()` 只是 `@graphql-tools/schema` 的 `makeExecutableSchema` 包装。

## 为什么重要

不理解固定 5.22.0 的默认值，下面这些事会写错：

- 为什么旧文档里的 `dotansimha/graphql-yoga` 现在应写成 `graphql-hive/graphql-yoga`
- 为什么生产环境不关 GraphiQL / landing page / CORS，调试面和跨域策略会按默认敞开
- 为什么 `context: { cache: new Map() }` 不是每请求新建——静态对象会被原样复用
- 为什么 Federation 不该再写 `@graphql-yoga/federation` / `useApolloFederation`：该 revision 没有这两个符号

## 核心要点

Yoga 的请求链可以看成四段：

1. **Fetch adapter 外壳**：`createYoga` 返回 `ServerAdapter`。默认 `graphqlEndpoint` 是 `/graphql`，健康检查是 `/health`，`logging` 默认打开。

2. **Envelop 插件链**：内置 `useEngine`（graphql-js 的 `parse`/`validate` + `@graphql-tools/executor`）、请求 parser、结果 processor、校验缓存和错误掩码。用户 `plugins` 插在 parser 之后、校验缓存之前。

3. **默认安全/调试开关**：`graphiql !== false` 时启用 GraphiQL（只在 `GET` 且 `Accept` 含 `text/html` 时渲染）；`landingPage` 默认开；`cors !== false` 时启用 CORS；`maskedErrors` 默认开，文案是 `Unexpected error.`；`multipart` 默认开；`batching` 默认关，显式打开后 limit 默认 10。

4. **订阅走 SSE 优先**：async iterable / subscription 结果优先匹配 `text/event-stream`；固定实现会先写一行注释 ping，再每 12 秒心跳。GraphiQL 的 `subscriptionsProtocol` 还可选 `GRAPHQL_SSE` / `WS` / `LEGACY_WS`。

## 实践示例

### 案例 1：Node 上挂同一个 adapter

```js
import { createYoga, createSchema } from "graphql-yoga";
import { createServer } from "node:http";

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Book { title: String, author: String }
      type Query { books: [Book] }
    `,
    resolvers: { Query: { books: () => [{ title: "A", author: "X" }] } },
  }),
});

createServer(yoga).listen(4000);
```

打开 `http://localhost:4000/graphql` 且浏览器带 `Accept: text/html` 时会进 GraphiQL。这是默认，不是需要另装的插件。

### 案例 2：同一实例交给 Cloudflare Workers

```js
import { createYoga, createSchema } from "graphql-yoga";

const yoga = createYoga({
  schema: createSchema({
    typeDefs: `type Query { hello: String }`,
    resolvers: { Query: { hello: () => "edge" } },
  }),
  graphqlEndpoint: "/",
  graphiql: false,
  landingPage: false,
});

export default yoga;
```

Workers 认 Fetch handler。生产环境应显式关掉 GraphiQL / landing page，不要依赖“反正不是浏览器”。

### 案例 3：用本仓插件关 introspection

```js
import { createYoga } from "graphql-yoga";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";

const yoga = createYoga({
  schema,
  graphiql: false,
  plugins: [useDisableIntrospection()],
});
```

`useDisableIntrospection` 在该 monorepo 的 `packages/plugins/disable-introspection`。默认 `isDisabled` 为 true，会给 validate 加上 graphql-js 的 `NoSchemaIntrospectionCustomRule`。深度限制这类能力属于外部 Envelop 插件，不在本包默认链里。

## 踩过的坑

1. **以为 GraphiQL 只在开发环境出现**：默认 `graphiql` 为 true；只是按 `GET + text/html` 决定是否渲染，与 `NODE_ENV` 无关。
2. **把静态 context 对象当成每请求工厂**：函数形式才按请求计算；普通对象每次原样返回，Map/DataLoader 会串请求。
3. **继续写 `@graphql-yoga/federation`**：固定树里是 `@graphql-yoga/apollo-managed-federation` 与 `@graphql-yoga/apollo-inline-trace`，没有旧包名和 `useApolloFederation`。
4. **打开 batching 却不设上限**：`batching: true` 时 limit 默认 10，不是无限。
5. **忽略 `graphql` peer 必须是同一份拷贝**：peer 允许 15.2 / 16 / 17；装两份 graphql-js 仍会在 schema 运行时报复制错误。

## 适用 vs 不适用场景

**适用**：
- 需要一份 handler 同时部署 Node 与 Workers / Deno / Bun
- 已在 The Guild 工具链（codegen、Hive、Envelop 插件）里
- 想要 GraphQL over HTTP，但不必绑 Apollo Studio 全家桶

**不适用**：
- 团队已经标准化 Apollo Federation 控制面，迁移收益未实测
- 只要 TS 单仓端到端类型、不需要字段选择——[[trpc]] 更直接
- 不能接受 Node `>= 18`，或需要 GraphQL Java / Python 运行时——Yoga 只在 JS 圈

## 固定版本边界

- 本文绑定 `graphql-hive/graphql-yoga@0c6025d5...`，包版本 `graphql-yoga@5.22.0`。
- npm latest 未暴露 `gitHead`，溯源锚点是 package tag 剥皮提交，不是 npm gitHead。
- 未安装依赖、未执行 GraphQL、未测跨运行时或 SSE 心跳，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨运行时的公约数是 Fetch，不是 `http.Server`**——adapter 把 Node 和 Workers 收成同一种箱子
2. **默认值就是产品决策**：CORS、GraphiQL、landing page、错误掩码都默认开，安全面要显式关
3. **插件插槽位置有合同**：用户插件在 parser 之后，因此能改方法面，但挡不住更早的 health check
4. **包名会过期**：canonical 仓库和 Federation 插件名都已经换过一轮

## 应用型自测

1. `createYoga({})` 在生产环境是否默认提供 GraphiQL？
2. `context: { loaders: new Map() }` 会每请求新建 Map 吗？
3. 该 pin 里 Federation 应该 import `@graphql-yoga/federation` 吗？

检查点：

1. 是。默认 `graphiql !== false`，只要求 GET + `text/html`。
2. 不会。静态对象每次原样返回，应写成函数。
3. 不应该。该 revision 没有这个包名。

## 延伸阅读

- 文档：[the-guild.dev/graphql/yoga-server](https://the-guild.dev/graphql/yoga-server)
- 固定源码：[graphql-hive/graphql-yoga](https://github.com/graphql-hive/graphql-yoga) —— 本文绑定提交 `0c6025d5bfcde9bd1be86b73ba406a0ca84e35eb`
- Envelop：[the-guild.dev/graphql/envelop](https://the-guild.dev/graphql/envelop)
- [[apollo-server]] —— 同生态另一条 server 路线
- [[trpc]] —— 全 TS 单仓、没有 schema language 的对照

## 关联

- [[apollo-server]] —— schema 可互搬的另一主流 GraphQL server
- [[trpc]] —— 共享 TS 类型、不写 SDL 的对照
- [[express]] / [[fastify]] —— 常见宿主；Yoga adapter 也能挂上去
- [[connect-rpc]] —— 跨语言 RPC，字段选择需求弱时的对照
- [[swr]] —— 前端取 GraphQL 数据时常见的缓存层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
