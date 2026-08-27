---
title: TanStack Query — 用 Observer 订阅一份服务端状态
来源: https://github.com/TanStack/query
日期: 2026-08-27
分类: 数据获取
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/TanStack/query
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 714df67ab11c6e16666e4282dfec8654175591f7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.102.6
---

## 是什么

TanStack Query 是一套**服务端状态引擎**：`query-core` 管缓存和拉取，框架包只负责订阅。日常类比：共享仓库按标签存货，组件只挂观察员；没货才进货，过期才补货，没人看才清仓。

你写：

```tsx
const { data, isPending, error } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
})
```

固定 5.102.6 里，这一句会经过 `QueryClient.defaultQueryOptions` 算出 `queryHash`，在 `QueryCache` 的 `Map` 里找到或新建 `Query`，再由 `QueryObserver` 决定要不要 `fetch`。`useQuery` 本身只是 `useBaseQuery(..., QueryObserver)`。

## 为什么重要

不读这条主链，下面几件事会讲错：

- 为什么多个组件写同一个 `queryKey` 会共享一份 `Query`，而不是各发各的
- 为什么默认 `staleTime: 0` 会在 remount / focus 时重拉，`'static'` 却永不视为过期
- 为什么 `invalidateQueries` 不是“立刻全员 fetch”，默认只重拉 **active** observer
- 为什么 React 18+ 要用 `useSuspenseQuery`，不能再写 `useQuery({ suspense: true })`

## 核心要点

固定版本的控制流可以拆成六步：

1. **合并 options**：client defaults → 按 key 的 defaults → 本次调用；缺 `queryHash` 时用 `hashKey`。
2. **定位 Query**：`QueryCache.build` 按 hash 查 `Map`，没有就 `new Query`。
3. **Observer 决策**：`enabled !== false` 且数据过期时，才在 mount / focus / reconnect 拉取。
4. **Query.fetch**：已有 in-flight 时复用 `retryer.promise`；`cancelRefetch` 才会静默取消再开新请求。
5. **Retryer**：浏览器默认最多 3 次重试，delay 为 `min(1000 * 2 ** failureCount, 30000)`；服务端默认 0。
6. **失效与回收**：`invalidate()` 只打 `isInvalidated`；`gcTime` 浏览器默认 5 分钟、服务端 `Infinity`，且要无人订阅且 `fetchStatus === 'idle'`。

## 实践示例

### 案例 1：同 key 共享一条 Query

```tsx
function TodoList() {
  return useQuery({ queryKey: ['todos'], queryFn: fetchTodos }).data
}
function TodoCount() {
  return useQuery({ queryKey: ['todos'], queryFn: fetchTodos }).data?.length
}
```

两个 hook 算出同一个 `queryHash`，命中同一条 `Query`。第二个 observer 加上去时，只要第一条已经在 fetch，就复用那份 promise。

### 案例 2：enabled 挡住未就绪的依赖查询

```tsx
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: ({ queryKey }) => fetchUser(queryKey[1]),
  enabled: Boolean(userId),
})
```

`enabled: false` 时 observer 不算 active。`queryKey` 里带 `userId`，切换用户会换一条 Query；旧条目仍可留在 cache，直到 `gcTime`。

### 案例 3：写后只唤醒还在看的人

```tsx
const qc = useQueryClient()
const mut = useMutation({
  mutationFn: addTodo,
  onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
})
```

`invalidateQueries` 先标记过期，再 `refetchQueries({ type: 'active' })`。没人订阅的 key 只留下 `isInvalidated`，下次有 observer 再拉。传入 `refetchType: 'none'` 则只标记。

## 踩过的坑

1. **把 hash 理解成“随便 stringify”**：默认 `hashKey` 会排序 **object 字段**，但 **数组顺序不变**。`['user', 1]` 和 `[1, 'user']` 是两条 Query。
2. **默认 staleTime 是 0**：类型注释写明默认 0；`refetchOnWindowFocus` 默认 true。每次挂载或回前台，过期数据都会重拉。
3. **v5 只有对象参数**：`useQuery(key, fn)` 会在开发态抛错。Suspense 走 `useSuspenseQuery`，它会强制 `enabled: true` 并清掉 `placeholderData`。
4. **乐观更新没有自动备份 cache**：`onMutate` 的返回值只是 mutation `context`，会传给 `onError` / `onSettled`。`setQueryData` 要自己 snapshot，或用 context 在失败时写回。
5. **Mutation 默认不重试**：`mutation.ts` 写的是 `retry ?? 0`，和 query 的 3 次不是同一套默认。

## 适用 vs 不适用场景

**适用**：

- 需要按 key 去重、失效、后台重拉的服务端状态
- React 18/19，或同一 release 里的 Vue / Solid adapter
- queryFn 能返回 Promise 的 REST / RPC / GraphQL 请求

**不适用**：

- 纯客户端 UI 状态 → 用组件 state 或客户端 store
- 需要规范化 entity 图、改一处联动全部引用 → Apollo / urql 更对口
- 把 WebSocket 流当成 queryFn 的唯一来源 → 推送应 `setQueryData`，不要假装成一次 fetch
- 假设所有框架包都是 5.102.6：同一 tag 里 `@tanstack/svelte-query` 是 `6.1.46`

## 固定版本边界

- 本文绑定 `TanStack/query@714df67a...`，release tag `release-2026-08-26-1836`，`query-core` / `react-query` 均为 `5.102.6`。
- npm 这两包没有可对照的 `gitHead`；身份以 Git tag 检出的 `package.json` 与 npm 版本一致为准。
- `QueryClientProvider` 会 `client.mount()`，向 `focusManager`（`window.visibilitychange`）和 `onlineManager` 订阅。
- React adapter 的 peer 是 `react: ^18 || ^19`。
- 本文未安装依赖、运行上游测试、发送请求或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **服务端状态是带 hash、TTL、订阅和取消的引擎**，不是另一个 Redux store。
2. **去重发生在 Query 这一层**，Observer 只决定“要不要看、要不要拉”。
3. **invalidate 先打标再按 active 重拉**，空闲条目不会被默认扇出。
4. **跨框架共用的是 query-core**；adapter 版本号仍要逐包核对。

## 应用型自测

1. 两个组件同时 `useQuery({ queryKey: ['todos'], queryFn })`，会创建几条 `Query`？
2. `invalidateQueries({ queryKey: ['todos'] })` 时，没有任何 observer 的条目会立刻 fetch 吗？
3. 浏览器里 query 失败，固定版本默认最多再试几次？mutation 呢？

检查点：

1. 一条。hash 相同就复用 `QueryCache` 里的同一对象。
2. 不会。默认 `refetchType` 是 `active`；无人订阅只留下 `isInvalidated`。
3. query 默认最多 3 次重试；mutation 默认 0。

## 延伸阅读

- 官方文档：[TanStack Query Docs](https://tanstack.com/query/latest)
- 固定源码：[TanStack/query](https://github.com/TanStack/query) —— 本文绑定提交 `714df67ab11c6e16666e4282dfec8654175591f7`
- 博客：[TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query)
- [[swr]] —— 同一问题的 hook / 全局事件回答
- [[react-hooks]] —— `useQuery` 仍是 custom hook，底下却是 Observer

## 关联

- [[swr]] —— 对照：全局 Map + 事件广播 vs QueryClient + Observer
- [[react-hooks]] —— React adapter 的宿主模型
- [[redux]] —— 客户端状态工具；Query 拿走的是服务端副本
- [[trpc]] —— 常用 `@trpc/react-query` 把 procedure 接到这层 cache

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ag-grid]] —— AG Grid — 企业级数据表格
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[projects/react]] —— React — 用组件描述界面的 JavaScript 库
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[swr]] —— SWR — React 远程数据 hook 的极简流派
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[wretch]] —— wretch — 把 fetch 写成一条链
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来
- [[zustand]] —— Zustand — 极简 React 状态管理
