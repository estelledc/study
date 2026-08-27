---
title: Apollo Client — 规范化缓存的 GraphQL 客户端
description: Apollo Client 4 binds a required cache plus link, then serves normalized query results through ObservableQuery.
来源: 'https://github.com/apollographql/apollo-client'
日期: 2026-08-27
分类: 数据获取
difficulty: intermediate
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/apollographql/apollo-client
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a4a170f1d8c0eee277f467013ec2b9ce7721e8c5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.2.12
---

## 是什么

Apollo Client 是一套**把 GraphQL 结果拆成实体、再按查询拼回去**的前端客户端。日常类比：像图书馆编目——每本书（实体）按索书号入库，读者递一张书单（query）时，馆员先查架上有没有，缺的再去进货。

固定 4.2.12 里你这样建客户端：

```ts
import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({ uri: "https://api.example.com/graphql" }),
});
```

构造函数在开发态要求同时给 `cache` 和 `link`。`uri` 不是 `ApolloClient` 自己的快捷字段，要先做成 `HttpLink`。

## 为什么重要

不理解这条主链，下面这些事都会说错：

- 为什么改一个 `User` 的名字，另一张也选了同一用户的查询会一起变
- 为什么同一 query + variables 在飞时，默认不会再打第二枪
- 为什么 `client.query()` 不能用 `cache-and-network`
- 为什么 v4 的错误对象不再能当成单一 `ApolloError` 来写

## 核心要点

固定源码把一次查询拆成五步：

1. **组装 client**：`ApolloClient` 保存 `link` 与 `cache`，再交给 `QueryManager`。`queryDeduplication` 默认 `true`。
2. **选 fetchPolicy**：`watchQuery` / `query` 默认 `cache-first`，`errorPolicy` 默认 `none`。缓存命中就不再进网络；`cache-and-network` 只属于 `watchQuery`。
3. **规范化写入**：`InMemoryCache` 用 `Policies.identify`。默认 `dataIdFromObject` 写成 `__typename:id`，没有 `id` 就回退 `_id`。
4. **读的时候补 `__typename`**：`DocumentTransform(addTypenameToDocument)` 先改文档，再进 `StoreReader`。
5. **React 订阅**：`useQuery` 挂在 `ObservableQuery` 上，经 `rxjs` 和 `useSyncExternalStore` 推到组件。

`HttpLink` 是 terminating link：内部先走 `ClientAwarenessLink`，再交给 `BaseHttpLink` 发 HTTP。

## 实践示例

### 案例 1：最小 query

```ts
import { gql } from "@apollo/client";

const GET_USER = gql`
  query GetUser($id: ID!) { user(id: $id) { id name } }
`;

const { data } = await client.query({ query: GET_USER, variables: { id: "1" } });
```

`client.query` 是一次性 Promise。默认 `cache-first`：架上有完整结果就直接返回。

### 案例 2：组件订阅

```tsx
import { useQuery } from "@apollo/client/react";

const { data, loading, error } = useQuery(GET_USER, { variables: { id } });
```

`useQuery` 走 `watchQuery`，缓存被别的 mutation 改写后可以再推一次。这和 `client.query` 不是同一条 API。

### 案例 3：mutation 写回缓存

```ts
await client.mutate({
  mutation: gql`mutation UpdateUser($id: ID!, $name: String!) {
    updateUser(id: $id, name: $name) { id name }
  }`,
  variables: { id: "1", name: "Ada" },
});
```

mutation 默认 `fetchPolicy: network-only`，结果按 `__typename:id` 写回。另一处正在 watch 同一 `User:1` 的查询会收到新字段，不必整页重拉。

## 踩过的坑

1. **构造函数没有 `uri`**：v4 开发态缺 `link` 或 `cache` 会直接 invariant。旧教程里的 `new ApolloClient({ uri })` 对不上这版源码。
2. **`client.query({ fetchPolicy: "cache-and-network" })` 会被拒绝**：这条策略只服务持续观察的 `watchQuery`。
3. **没有 `id` / `_id` 的对象不会得到稳定 dataId**：默认 identify 直接返回 `undefined`，实体无法合并，看起来像“缓存没生效”。
4. **`errorPolicy: none` 会停掉 observable**：GraphQL errors 走 `CombinedGraphQLErrors`。想同时拿到 `data` 和 errors，要把政策改成 `all`。
5. **TypeScript generic 不是运行时校验**：`useQuery<User>` 只影响类型，响应形状仍取决于服务端。

## 适用 vs 不适用场景

**适用**：

- 需要规范化实体缓存、跨查询共享同一对象
- React 17/18/19，并能接受 `rxjs ^7.3.0` 与 `graphql ^16 || ^17` 作为 peer
- 要自己拼 link 链（error / retry / persisted query / websocket）

**不适用**：

- 只想按“整张 query 文档”缓存、不想维护 `id` 与 type policy——document cache 更轻
- 不能接受必填 `link` + `cache` 的组装成本
- 需要把静态阅读写成已运行的网络或性能结论——本文没有这些证据

## 固定版本边界

- 本文绑定 `apollographql/apollo-client@a4a170f1...`，即 tag `@apollo/client@4.2.12`，与 npm `gitHead` 一致。
- 默认：`queryDeduplication=true`，query `fetchPolicy=cache-first`，`errorPolicy=none`，mutation `fetchPolicy=network-only`。
- `InMemoryCache` 默认 `resultCaching=true`，`assumeImmutableResults=true`。
- 本文未安装依赖、未发请求、未跑上游测试或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **规范化缓存的合同是 identify**：没有稳定 `__typename` + id，跨查询联动就不会发生。
2. **`query` 和 `watchQuery` 不是详略差别**：有的 fetchPolicy 只对持续订阅有意义。
3. **传输层被收成 `link`**：HTTP 只是其中一种 terminator，不再藏在 client 构造函数里。
4. **错误类型要按当前大版本重读**：v4 把 GraphQL 错误收到 `CombinedGraphQLErrors`。

## 应用型自测

1. `new ApolloClient({ uri: "/graphql" })` 在 4.2.12 开发态能过构造检查吗？
2. `client.query` 可以使用 `cache-and-network` 吗？
3. 一个只有 `uuid`、没有 `id`/`_id` 的对象，默认 `dataIdFromObject` 会生成什么？

检查点：

1. 不能。开发态要求 `cache` 和 `link`；`uri` 要先放进 `HttpLink`。
2. 不能。源码会 invariant，建议改 `watchQuery` 或换 `cache-first` / `network-only`。
3. `undefined`。默认只认 `id` 或 `_id`，要自己写 `dataIdFromObject` 或 type policy。

## 延伸阅读

- 官方文档：[apollographql.com/docs/react](https://www.apollographql.com/docs/react/)
- 固定源码：[apollographql/apollo-client](https://github.com/apollographql/apollo-client) —— 本文绑定提交 `a4a170f1d8c0eee277f467013ec2b9ce7721e8c5`
- [[apollo-server]] —— 常见配套的 Node GraphQL 服务端
- [[react]] —— `useQuery` 建立在 hooks 与 `useSyncExternalStore` 上

## 关联

- [[apollo-server]] —— schema / resolver 在服务端，Client 负责缓存与订阅
- [[react]] —— React bindings 从 `@apollo/client/react` 进入
- urql —— 同主题对照：默认 document cache，而不是规范化 entity store

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
