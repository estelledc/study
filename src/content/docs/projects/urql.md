---
title: urql — 用 exchange 管道拼起来的 GraphQL 客户端
description: urql 5 runs operations through a required exchange pipeline and a document cache keyed by Operation.key.
来源: 'https://github.com/urql-graphql/urql'
日期: 2026-08-27
分类: 数据获取
difficulty: intermediate
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/urql-graphql/urql
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1eb11fcd68cc13d413f42e34a49c798dd97a7506
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.4
---

## 是什么

urql 是一套**把 GraphQL 操作推进 exchange 管道**的客户端。日常类比：像快递分拣线——单子（operation）从入口进去，缓存、鉴权、fetch 各站决定放行、改写或拦截，最后给你一份结果。

固定 `urql@5.0.4` 里核心这样建：

```ts
import { Client, cacheExchange, fetchExchange, Provider } from "urql";

const client = new Client({
  url: "https://api.example.com/graphql",
  exchanges: [cacheExchange, fetchExchange],
});
```

`createClient` 就是这个构造函数。开发态缺少 `url` 会抛错。`exchanges` 是必填数组，构造函数**不会**替你塞默认的 cache/fetch。

## 为什么重要

不理解这条管道，下面这些事都会说错：

- 为什么默认缓存是“整张 query”，改一个实体不一定更新另一张查询
- 为什么 mutation 之后有的列表会自己刷新，空列表却可能一直旧着
- 为什么 `useQuery` 返回的是元组，而不是 Apollo 那种对象
- 为什么 query 有时会变成 GET

## 核心要点

固定 `@urql/core@6.0.3`（同树）把执行链收成四步：

1. **Client 当调度中心**：给 operation 分配 `key`，按微任务队列 `reexecuteOperation`。默认 `requestPolicy` 是 `cache-first`。
2. **exchange 管道**：`composeExchanges(opts.exchanges)` 后再接内部 `fallbackExchange`。常见起步是 `[cacheExchange, fetchExchange]`。
3. **document cache**：`cacheExchange` 用 `Operation.key`（djb2/`phash` 哈希文档+变量）做 `Map`。命中 `cache-and-network` 时先返回缓存并把 `stale: true`，再 `network-only` 重跑。
4. **按 `__typename` 失效**：mutation 结果里收集到的 typename 会清掉相关 query key 并重跑。空列表或缺字段时，要自己传 `additionalTypenames`。

`fetchExchange` 发 GraphQL over HTTP；默认 `preferGetMethod: 'within-url-limit'`，query 能塞进 2048 字符就走 GET。订阅默认不走 fetch，除非 `fetchSubscriptions`。

React `useQuery` 返回 `[state, reexecute]`。`pause: true` 会停自动执行；`fetching` 表示在等新结果，`stale` 表示后台还会再来一份。

## 实践示例

### 案例 1：Provider + 元组 hook

```tsx
import { Provider, useQuery } from "urql";

const Todos = () => {
  const [result, reexecute] = useQuery({
    query: `query { todos { id title } }`,
  });
  if (result.fetching) return <p>loading</p>;
  if (result.error) return <p>{result.error.message}</p>;
  return <button onClick={() => reexecute({ requestPolicy: "network-only" })}>刷新</button>;
};
```

`reexecute({ requestPolicy: "network-only" })` 会跳过 document cache。即使 hook 写了 `pause: true`，手动 `reexecute` 仍会执行。

### 案例 2：必须自己声明 exchanges

```ts
import { createClient, cacheExchange, fetchExchange } from "urql";

createClient({ url: "/graphql" }); // 类型上缺 exchanges
createClient({ url: "/graphql", exchanges: [cacheExchange, fetchExchange] });
```

漏掉 `cacheExchange` 就没有文档缓存；漏掉 `fetchExchange` 请求到不了网络。这是管道，不是“给个 url 就全能”。

### 案例 3：空列表失效要额外提示

```ts
useQuery({
  query: `query { todos { id title } }`,
  context: { additionalTypenames: ["Todo"] },
});
```

若当前 `todos` 是 `[]`，响应里可能收集不到 `Todo`。之后 `createTodo` mutation 即使返回了 `Todo`，默认 cache 也不知道该踢哪条 query。`additionalTypenames` 就是给这条 document cache 的人工标签。

## 踩过的坑

1. **把默认缓存当成规范化 store**：同一 `Todo:1` 出现在两张不同 query 里，改一张的字段不会自动补另一张——key 是整份文档，不是实体 id。
2. **空列表不失效**：`collectTypenames` 对空数组是空的。动态列表要写 `additionalTypenames`。
3. **忘记传 `exchanges`**：类型必填；运行时也不会回填 cache/fetch。
4. **`CombinedError` 同时装两类失败**：网络失败在 `networkError`，执行失败在 `graphQLErrors`。只判断 `result.error` 不够区分。
5. **context 对象每渲染新建**：`useQuery` 文档写明 `context` 应用 `useMemo`，否则会反复重跑。

## 适用 vs 不适用场景

**适用**：

- 想先用轻量 document cache，必要时再换 `@urql/exchange-graphcache`
- React `>= 16.8`，并能接受 `wonka` 流与 `@urql/core ^6`
- 需要自己排序 exchange（auth、persisted query、retry）

**不适用**：

- 必须靠规范化实体缓存做跨查询自动联动——这是 Apollo `InMemoryCache` 或 urql Graphcache 的合同，不是默认 `cacheExchange`
- 希望构造函数偷偷装上 cache + fetch
- 要把静态阅读写成已运行的网络或性能结论——本文没有这些证据

## 固定版本边界

- 本文绑定 `urql-graphql/urql@1eb11fcd...`，即 tag `urql@5.0.4`。同提交工作区 `@urql/core` 为 `6.0.3`。
- `@urql/core@6.0.3` 的独立 tag 是祖先 `d510a9a1...`；本提交还包含 React suspense cache poisoning 修复，已在共享审查文档披露。
- 默认：`requestPolicy=cache-first`，`preferGetMethod=within-url-limit`；`exchanges` 必填。
- `@urql/core` 依赖 `@0no-co/graphql.web` 与 `wonka ^6.3.2`。
- 本文未安装依赖、未发请求、未跑上游测试或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **exchange 是控制流，不是插件装饰器**：顺序决定缓存能不能看见请求、fetch 能不能发出去。
2. **document cache 的失效单位是 typename，不是实体字段**：空列表是这种设计的经典盲区。
3. **`fetching` 和 `stale` 不是一回事**：前者在等结果，后者表示先给旧的、后面还有更新。
4. **默认 GET 有长度门**：`within-url-limit` 不是“永远 POST”，也不是“永远 GET”。

## 应用型自测

1. `new Client({ url: "/graphql" })` 会自动带上 `cacheExchange` 吗？
2. 默认 `cacheExchange` 用什么当缓存 key？
3. query 在默认 `preferGetMethod` 下什么时候会改走 GET？

检查点：

1. 不会。`exchanges` 必填，构造函数不插入默认管道。
2. `Operation.key`，由文档和变量的 djb2/`phash` 算出来，不是 `__typename:id`。
3. 作为 query 且拼出的 URL 不超过 2048 字符时；超过就回退，除非改成 `force`。

## 延伸阅读

- 官方文档：[urql.dev](https://urql.dev/)
- 固定源码：[urql-graphql/urql](https://github.com/urql-graphql/urql) —— 本文绑定提交 `1eb11fcd68cc13d413f42e34a49c798dd97a7506`
- [[react]] —— React bindings 在 `urql` 包，核心在 `@urql/core`
- Apollo Client —— 同主题对照：默认规范化 `InMemoryCache`

## 关联

- [[react]] —— `Provider` / `useQuery` 从 `urql` 进入，核心调度在 `@urql/core`
- [[apollo-server]] —— GraphQL over HTTP 的常见对端
- Apollo Client —— 规范化实体缓存对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
