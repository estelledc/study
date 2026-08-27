# API layer source review (writer U)

> 用途：记录 tRPC、GraphQL Yoga 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel U
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、HTTP server、GraphQL execute、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## tRPC

- canonical source：`https://github.com/trpc/trpc`
- revision：`6aec1578a899df50a17e4e78d5512a099b574c18`
- provenance：annotated tag `v11.18.0` 剥皮提交与 npm `@trpc/server@11.18.0` `gitHead` 三方一致
- packages inspected：`@trpc/server@11.18.0`、`@trpc/client@11.18.0`、`@trpc/react-query@11.18.0`、`@trpc/tanstack-react-query@11.18.0`
- peer：`typescript >= 5.7.2`；React 集成另需 `@tanstack/react-query ^5.80.3` 与 `react >= 18.2.0`
- inspected：
  - `packages/server/package.json`
  - `packages/server/src/unstable-core-do-not-import/initTRPC.ts`
  - `packages/server/src/unstable-core-do-not-import/procedureBuilder.ts`
  - `packages/server/src/unstable-core-do-not-import/parser.ts`
  - `packages/server/src/unstable-core-do-not-import/middleware.ts`
  - `packages/server/src/unstable-core-do-not-import/router.ts`
  - `packages/server/src/unstable-core-do-not-import/rpc/codes.ts`
  - `packages/server/src/adapters/fetch/fetchRequestHandler.ts`
  - `packages/client/src/index.ts`
  - `packages/client/src/createTRPCClient.ts`
  - `packages/client/src/links.ts`
  - `packages/client/src/links/httpBatchLink.ts`
  - `packages/client/src/links/httpSubscriptionLink.ts`
  - `packages/react-query/src/createTRPCReact.tsx`
  - `packages/tanstack-react-query/src/index.ts`
  - `packages/tanstack-react-query/src/internals/Context.tsx`
  - `packages/tanstack-react-query/src/internals/createOptionsProxy.ts`
- observed：
  - `initTRPC` 是单例 builder；`.context()` / `.meta()` 只收类型，`.create()` 产出 `procedure` / `middleware` / `router` / `mergeRouters` / `createCallerFactory`；
  - 非 server 环境默认抛错，除非 `allowOutsideOfServer: true`；
  - `.input()` 通过 `getParseFn` 适配 Standard Schema `~standard`、zod `parse`/`parseAsync`、valibot、arktype `assert`、yup、superstruct 与自定义函数，不是 zod 独占；
  - procedure 三种入口是 `.query()` / `.mutation()` / `.subscription()`；subscription 主合同是 `AsyncIterable`，observable 形态已 `@deprecated` 并将在 v12 删除；
  - resolver 收到 `ctx`、`input`、`signal`、`path`、可选 `batchIndex`；
  - `createTRPCProxyClient` 只是 `createTRPCClient` 的 deprecated 别名，计划 v12 删除；客户端仍用递归 Proxy 把 `.query` / `.mutate` / `.subscribe` 映射到 procedure type；
  - HTTP 客户端 link 导出 `httpLink`、`httpBatchLink`、`httpBatchStreamLink`、`httpSubscriptionLink`、`wsLink`、`splitLink`、`loggerLink`、`retryLink`、`localLink`；`httpBatchLink` 的 `maxURLLength` / `maxItems` 默认 `Infinity`；
  - `@trpc/react-query` 仍导出 `createTRPCReact` hook API；`@trpc/tanstack-react-query` 导出 `createTRPCContext` + `createTRPCOptionsProxy`，查询入口是 `queryOptions` / `mutationOptions` 再交给 TanStack Query；
  - `lazy()` 可按路径延迟加载子 router；`fetchRequestHandler` 从 URL 去掉 endpoint 前缀后交给 `resolveResponse`；
  - 错误码表按 JSON-RPC 数字存放，`UNAUTHORIZED` 为 `-32001`。

## GraphQL Yoga

- canonical source：`https://github.com/graphql-hive/graphql-yoga`（`dotansimha/graphql-yoga` 已重定向到此仓库）
- revision：`0c6025d5bfcde9bd1be86b73ba406a0ca84e35eb`
- provenance：annotated package tag `graphql-yoga@5.22.0` 剥皮提交与 `packages/graphql-yoga/package.json` 版本 `5.22.0` 一致；npm `graphql-yoga@5.22.0` 未暴露 `gitHead`，以 Git tag 为锚点
- engines：`node >= 18.0.0`；peer `graphql ^15.2.0 || ^16.0.0 || ^17.0.0`
- inspected：
  - `packages/graphql-yoga/package.json`
  - `packages/graphql-yoga/src/index.ts`
  - `packages/graphql-yoga/src/server.ts`
  - `packages/graphql-yoga/src/schema.ts`
  - `packages/graphql-yoga/src/subscription.ts`
  - `packages/graphql-yoga/src/plugins/use-graphiql.ts`
  - `packages/graphql-yoga/src/plugins/use-health-check.ts`
  - `packages/graphql-yoga/src/plugins/use-result-processor.ts`
  - `packages/graphql-yoga/src/plugins/result-processor/sse.ts`
  - `packages/plugins/disable-introspection/src/index.ts`
  - `packages/plugins/apollo-managed-federation/package.json`
- observed：
  - `createYoga()` 构造 `YogaServer` 后再包一层 `@whatwg-node/server` 的 `createServerAdapter`，因此同一实例既是 Node request listener，也暴露 Fetch `handle`；
  - `createSchema()` 只是 `@graphql-tools/schema` 的 `makeExecutableSchema` 包装；
  - 默认插件链包含 `useEngine(graphql-js parse/validate + @graphql-tools/executor)`、`useHealthCheck`、`useCORS`（`cors !== false`）、`useGraphiQL`（`graphiql !== false`）、GET/JSON/multipart/GraphQL-string/form-urlencoded parsers、`useResultProcessors`、`useParserAndValidationCache`、`useLimitBatching`、landing page、method/GET-mutation 校验与 `useMaskedErrors`；
  - 默认值：`graphqlEndpoint=/graphql`、`healthCheckEndpoint=/health`、`logging=true`、`maskedErrors=true`（默认文案 `Unexpected error.`）、`landingPage` 开启、`multipart=true`、`parserAndValidationCache` 开启、`batching=false`（显式开启后 limit 默认 10）；
  - GraphiQL 只在 `GET` 且 `Accept` 含 `text/html` 时渲染；`subscriptionsProtocol` 可选 `SSE` / `GRAPHQL_SSE` / `WS` / `LEGACY_WS`；
  - 订阅与 async iterable 结果优先匹配 `text/event-stream`，SSE ping 间隔 12 秒；
  - 静态 `context` 对象每次请求原样返回，函数形式才按请求计算；
  - 该 revision 没有 `@graphql-yoga/federation` 或 `useApolloFederation`；Federation 相关包是 `@graphql-yoga/apollo-managed-federation@0.21.0` 与 `@graphql-yoga/apollo-inline-trace`。

## 未覆盖风险

- 未运行任何 server、client、GraphQL execute 或上游测试，运行时行为保持 `UNVERIFIED`。
- 未测量 bundle、吞吐或冷启动；正文不写性能对比。
- tRPC v12 删除项（proxy 别名、observable subscription、旧 `responseMeta.headers` 对象形态）只按当前源码 deprecated 标记披露，不预测发布时间。
- Yoga 5.22.0 之后的 changeset release tag（`release-*`）未绑定。
