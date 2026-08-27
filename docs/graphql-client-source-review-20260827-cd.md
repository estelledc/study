# GraphQL client source review (writer CD)

> 用途：记录 Apollo Client、urql 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：CD
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Apollo Client

- canonical source：`https://github.com/apollographql/apollo-client`
- revision：`a4a170f1d8c0eee277f467013ec2b9ce7721e8c5`
- package：`@apollo/client@4.2.12`
- inspected：
  - `package.json`
  - `src/core/ApolloClient.ts`
  - `src/core/QueryManager.ts`
  - `src/core/watchQueryOptions.ts`
  - `src/core/defaultOptions.ts`
  - `src/cache/inmemory/inMemoryCache.ts`
  - `src/cache/inmemory/helpers.ts`
  - `src/cache/inmemory/policies.ts`
  - `src/link/http/HttpLink.ts`
  - `src/react/hooks/useQuery.ts`
  - `src/errors/CombinedGraphQLErrors.ts`
- observed：
  - `ApolloClient` 构造在开发态要求同时传入 `cache` 与 `link`；没有把 `uri` 当作构造函数快捷字段；
  - `queryDeduplication` 默认 `true`，`ssrMode` 默认 `false`，`ssrForceFetchDelay` 默认 `0`；
  - `assumeImmutableResults` 默认跟随 cache；`InMemoryCache.assumeImmutableResults` 为 `true`；
  - `watchQuery` / `query` 默认 `fetchPolicy: cache-first`、`errorPolicy: none`；`client.query` 拒绝 `cache-and-network` 与 `standby`；
  - mutation 路径默认 `fetchPolicy: network-only`；
  - `HttpLink` 是 terminating link，内部是 `ClientAwarenessLink` 再接 `BaseHttpLink`；
  - `InMemoryCache` 用 `EntityStore` + `Policies`；默认 `dataIdFromObject` 把对象写成 `__typename:id`，没有 `id` 时回退 `__typename:_id`；
  - 读路径通过 `DocumentTransform(addTypenameToDocument)` 补 `__typename`；
  - React `useQuery` 订阅 `ObservableQuery`，经 `rxjs` 与 `useSyncExternalStore` 接到组件；
  - GraphQL 执行错误走 `CombinedGraphQLErrors`，不再假设单一 `ApolloError` 形状；
  - peer 依赖声明 `graphql` `^16 || ^17`、`rxjs` `^7.3.0`、`react` `^17 || ^18 || >=19.0.0-rc`。
- provenance note：
  - npm `@apollo/client@4.2.12` 的 `gitHead` 为 `a4a170f1d8c0eee277f467013ec2b9ce7721e8c5`；
  - GitHub 注释 tag `@apollo/client@4.2.12` 解引用到同一提交；
  - 本审查绑定该提交。

## urql

- canonical source：`https://github.com/urql-graphql/urql`
- revision：`1eb11fcd68cc13d413f42e34a49c798dd97a7506`
- packages：`urql@5.0.4`、工作区 `@urql/core@6.0.3`
- inspected：
  - `packages/core/package.json`
  - `packages/react-urql/package.json`
  - `packages/core/src/client.ts`
  - `packages/core/src/exchanges/cache.ts`
  - `packages/core/src/exchanges/fetch.ts`
  - `packages/core/src/exchanges/index.ts`
  - `packages/core/src/utils/hash.ts`
  - `packages/core/src/utils/error.ts`
  - `packages/react-urql/src/context.ts`
  - `packages/react-urql/src/hooks/useQuery.ts`
  - `packages/react-urql/src/index.ts`
- observed：
  - `createClient` 就是 `Client` 构造函数；开发态缺少 `url` 会抛错；
  - `exchanges` 是必填数组，构造函数不会自动插入 `cacheExchange` / `fetchExchange`；
  - 默认 `requestPolicy` 为 `cache-first`，默认 `preferGetMethod` 为 `within-url-limit`；
  - 内置 `cacheExchange` 是按 `Operation.key`（djb2/`phash`）索引的 document cache，不是规范化 entity store；
  - mutation / 非订阅结果用响应里的 `__typename` 失效相关 query；空列表或缺 typename 时可靠 `additionalTypenames`；
  - `fetchExchange` 走 GraphQL over HTTP，可选用 GET，并处理 incremental multipart；订阅默认不走 fetch，除非 `fetchSubscriptions`；
  - React `useQuery` 返回 `[state, reexecute]`；`pause` 可停自动执行；`stale` 与 `fetching` 分开；
  - 错误归一成 `CombinedError`（`networkError` 与 `graphQLErrors`）；
  - `@urql/core` 依赖 `@0no-co/graphql.web` 与 `wonka`；`urql` peer 为 `@urql/core ^6.0.0`、`react >= 16.8.0`。
- provenance note：
  - GitHub tag `urql@5.0.4` 解引用到 `1eb11fcd68cc13d413f42e34a49c798dd97a7506`（`Version Packages (#3899)`），工作区 `packages/react-urql/package.json` 报 `5.0.4`，`packages/core/package.json` 报 `6.0.3`；
  - tag `@urql/core@6.0.3` 解引用到祖先提交 `d510a9a110a39ac2c25cbaf6639c2278ced2f6de`；两者之间还有站点/示例提交和 `React suspense cache poisoning` 修复；
  - npm `urql@5.0.4` 未暴露 `gitHead`；本审查绑定 React 包 tag 提交，并在该树上阅读同版本 `@urql/core` 源码。
