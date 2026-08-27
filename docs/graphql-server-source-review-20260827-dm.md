# GraphQL server source review (writer DM)

> 用途：记录 Mercurius、Apollo Server 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer DM
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、GraphiQL、standalone server、federation gateway、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- reserved slugs：未改 `graphql-yoga`、`trpc`

## Mercurius

- canonical source：`https://github.com/mercurius-js/mercurius`
- revision：`3ad0edd8af3aa1774a342cb9f14a4bd991e16a42`
- release：lightweight tag `v16.10.0` 与 npm `mercurius@16.10.0` 的 `gitHead` 均为该提交（"Bumped v16.10.0"，2026-07-14）
- package：`mercurius@16.10.0`；`engines.node` 为 `^20.9.0 || >=22.0.0`；`fastify-plugin` 声明 `fastify: '5.x'`；peer `graphql@^16.0.0`
- inspected：
  - `package.json`、`index.js`、`index.d.ts`
  - `lib/routes.js`
  - `lib/hooks.js`
  - `lib/handlers.js`
  - `lib/csrf.js`
  - `lib/errors.js`
  - `lib/adaptive-jit.js`
  - `lib/subscription.js`
  - `test/hooks.test.js`
  - `test/options.test.js`
- observed：
  - 入口是 Fastify 插件：注册后装饰 `app.graphql` / `reply.graphql`，默认路由 `GET|POST` `path` 为 `/graphql`；`routes: false` 可关掉 HTTP 面，只留装饰器；
  - schema 可以是 SDL 字符串、字符串数组或 `GraphQLSchema`；字符串走 `buildSchema`；缺省会生成空 Query（可选空 Mutation）；
  - 请求主链为 `preParsing` → `parse` → `preValidation` → `validate` → 可选 `queryDepth` → `preExecution` → `execute` 或已编译的 `graphql-jit` → `onResolution`；
  - 默认用 `quick-lru` 缓存 1024 条成功 document；`cache: false` 关闭；校验失败另存 `lruErrors`，避免错误查询挤掉成功缓存；
  - 未设置 `jit` 时 `minJit` 为 0，编译条件是已命中缓存后的 `cached.count++ === minJit`；测试启用 JIT 都显式写 `jit: 1`。`jit: { minCount, eluThreshold, ... }` 走后台 adaptive compile，默认 `minCount=3`、`eluThreshold=0.8`；
  - `defineLoaders` 用 `single-user-cache` Factory，按请求挂到 `reply[kLoaders]`；loader resolver 在缺少 `reply` 时抛错，因此 `app.graphql()` 不能当 loader 入口；
  - CSRF 默认关闭；`csrfPrevention: true` 才检查 `application/json` / `application/graphql`，或要求 `x-mercurius-operation-name` / `mercurius-require-preflight`；
  - GraphiQL 是 opt-in：`graphiql`/`ide` 为真才挂 `/graphiql`；`onlyPersisted` 会强制关掉 IDE；
  - `subscription: true` 用 `mqemitter` + 内部 `PubSub`；对象形态可注入自定义 pubsub、`verifyClient`、`keepAlive` 与 `graphql-ws` / `graphql-transport-ws`；
  - 默认安装 error handler；`allowBatchedQueries` 默认关，打开后 POST body 可以是 operation 数组。
- provenance note：
  - npm `gitHead`、GitHub tag `v16.10.0` 与 clone HEAD 三者一致，未发现冲突；
  - 未把 GraphiQL、JIT 或 CSRF 写成默认开启。

## Apollo Server

- canonical source：`https://github.com/apollographql/apollo-server`
- revision：`4f154060bbe57d3bd612cb09ab63467f319d4ba5`
- release：annotated tag `@apollo/server@5.5.1` 解引用到该提交（"Version Packages (#8207)"）；npm `@apollo/server@5.5.1` 的 `gitHead` 同值
- package：`packages/server` 的 `@apollo/server@5.5.1`；`engines.node >=20`；peer `graphql@^16.11.0`
- inspected：
  - `packages/server/package.json`、`packages/server/README.md`、`packages/server/CHANGELOG.md`
  - `packages/server/src/index.ts`
  - `packages/server/src/ApolloServer.ts`
  - `packages/server/src/requestPipeline.ts`
  - `packages/server/src/runHttpQuery.ts`
  - `packages/server/src/standalone/index.ts`
  - `packages/server/src/preventCsrf.ts`
  - `packages/server/src/externalTypes/constructor.ts`
  - `packages/server/src/httpBatching.ts`
- observed：
  - 核心合同是 `new ApolloServer(...)` + `executeHTTPGraphQLRequest({ httpGraphQLRequest, context })`；宿主适配器只做 HTTP ↔ 该结构的转换；
  - `startStandaloneServer` 用 Node `http` + `cors()` + `body-parser.json({ limit: '50mb' })`，默认 `listen.port=4000`，并自动安装 `ApolloServerPluginDrainHttpServer`，随后 `server.start()`；
  - Express 中间件不再从 `@apollo/server/express4` 导出；固定 README / CHANGELOG 要求 `@as-integrations/express5`（或 Express 4 的独立包）；
  - 默认 `csrfPrevention` 开启，推荐头为 `x-apollo-operation-name` 与 `apollo-require-preflight`；`application/json` 等非 safelist Content-Type 视为已预检；
  - `allowBatchedHttpRequests` 默认 `false`；Automatic Persisted Queries 默认开启，可用 `persistedQueries: false` 关掉；
  - `addDefaultPlugins` 默认安装 CacheControl；非 production 装 local landing page，production 装 production landing page；有 `APOLLO_KEY`+`graphRef` 时前置 usage reporting；subgraph schema 默认 inline trace；
  - `processGraphQLRequest` 主链为 persisted query 解析 → `didResolveSource` → documentStore 命中或 parse/validate → `didResolveOperation` → 插件 `executionDidStart` / field resolve 钩子 → 格式化响应；GET 只允许 query；
  - `status400ForVariableCoercionErrors` 默认 `true`；`includeStacktraceInErrorResponses` 在非 production/test 默认开；
  - Federation subgraph / gateway 不在本包实现：构造函数可接 `gateway`，subgraph schema 由外部 `@apollo/subgraph` 提供，本轮未检那两包。
- provenance note：
  - npm `gitHead` 与 annotated tag 解引用提交一致；
  - 旧正文把 `expressMiddleware` 写成 `@apollo/server/express4` 内建导出，与 5.5.1 不符，已按独立 integration 包更正。
