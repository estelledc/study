---
title: SWR — 用全局 cache 和事件广播做 stale-while-revalidate
来源: https://github.com/vercel/swr
日期: 2026-08-27
分类: 前端
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vercel/swr
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7173e55b2a175dee455612c5fa067383345c392f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.5.1
---

## 是什么

SWR 是一个 React hook 库，把远程数据做成 **先给旧值、再在后台重拉**。日常类比：打开冰箱先看见昨天的便当（stale），同时热一份新的（revalidate），热好再换上。名字来自 HTTP 的 Stale-While-Revalidate（RFC 5861）。

你写：

```tsx
const { data, error, isLoading } = useSWR('/api/user/1', fetcher)
```

固定 2.5.1 里，这一句会 `serialize` key、从模块级 `Map` cache 读快照，并用 `use-sync-external-store/shim` 订阅。同 key 的 in-flight 请求放在 `FETCH[key] = [promise, timestamp]`。不包 `SWRConfig` 也能跑，因为默认 cache 在模块作用域已经 `initCache(new Map())`。

## 为什么重要

不读这套全局表，就解释不了：

- 为什么没有 QueryClient，两个 `useSWR(同一个 key)` 仍会去重
- 为什么 focus / online 只在 cache provider 上挂一次，却能唤醒所有 key
- 为什么 `useSWRImmutable` 不是新引擎，只是关掉重拉开关的 middleware
- 为什么 `mutate(key, data)` 默认还会再打一枪网络请求

## 核心要点

固定版本可以拆成五步：

1. **序列化 key**：字符串原样使用；数组和 plain object 走 `stableHash`（object 字段排序后按内容哈希）。
2. **读 cache**：`useSyncExternalStore` 选出 `data / error / isLoading / isValidating`。
3. **决定是否重拉**：无数据，或 `revalidateIfStale`（默认 true）为真时，mount 就会 revalidate。
4. **去重**：`FETCH[key]` 已在且这次带 `dedupe`，就 await 同一份 promise；成功后 `dedupingInterval`（默认 2000 ms）再清标记。
5. **全局事件**：`initCache` 监听 `document.visibilitychange`、`window` focus，以及 online/offline。每个 key 只调用 **第一个** revalidator。

默认开关还包括 `revalidateOnFocus` / `revalidateOnReconnect` / `shouldRetryOnError` 为 true，`focusThrottleInterval` 为 5000 ms。错误重试用带抖动的指数退避，间隔默认 5 秒（慢网 10 秒）。

## 实践示例

### 案例 1：同 key 共用 in-flight 请求

```tsx
function UserCard({ id }) {
  const { data } = useSWR(`/api/user/${id}`, fetcher)
  return <div>{data?.name}</div>
}
function UserBadge({ id }) {
  const { data } = useSWR(`/api/user/${id}`, fetcher)
  return <span>@{data?.login}</span>
}
```

两个 hook 得到同一字符串 key。第二个进入 `revalidate` 时，若 `FETCH[key]` 还在，就 await 同一 promise，再各自从 cache 读更新。

### 案例 2：focus 节流

```tsx
useSWR('/api/dashboard', fetcher, {
  revalidateOnFocus: true,
  focusThrottleInterval: 5000,
})
```

这是默认值。全局 listener 广播 `FOCUS_EVENT` 后，每个 hook 自己看 `now > nextFocusRevalidatedAt` 且当前可见/在线，才 soft-revalidate。

### 案例 3：middleware 包一层 logger

```tsx
const logger = (useSWRNext) => (key, fetcher, config) => {
  const wrapped = async (...args) => {
    const data = await fetcher(...args)
    console.log('[SWR]', key)
    return data
  }
  return useSWRNext(key, wrapped, config)
}

<SWRConfig value={{ use: [logger], fetcher: globalFetcher }}>
  <App />
</SWRConfig>
```

`resolve-args` 把 `config.use` 接到内置 middleware 前面，**从右往左** 包一层。`useSWRImmutable` 就是把 focus / stale / reconnect / interval 全关掉的 middleware。

## 踩过的坑

1. **把“对象 key 每次都是新引用”说成一定换 key**：plain object / 数组按内容哈希。真正不稳定的是函数 key 抛错变空串、或非 plain object 走 WeakMap 身份。
2. **`mutate(key, newData)` 默认会再 revalidate**：`internalMutate` 里 `revalidate !== false` 就重拉。乐观更新要写 `{ revalidate: false }`。
3. **reject 值原样进 `error`**：`throw 'oops'` 时没有 `.message`。应抛 `Error` 实例。
4. **fetcher 不是每个 hook 都必传**：`SWRConfig` 的 `fetcher` 会在 `resolve-args` 里兜底；没配才是 `null`，此时不会发请求。
5. **`useSWRMutation` 默认不写回 cache**：它把 `populateCache` 设成 false。要更新对应 `useSWR` 条目，需显式打开或再 `mutate`。

## 适用 vs 不适用场景

**适用**：

- React 16.11+ / 17 / 18 / 19 的远程列表、详情、dashboard
- 想用 hook + middleware 扩展，而不是先建 Client 对象
- 需要 `fallback` / `cacheData` 把 SSR 或 RSC 预取灌进同一张表

**不适用**：

- 跨 Vue / Solid / Svelte 共用同一套 core → 看 [[tanstack-query]]
- GraphQL 规范化 entity cache → Apollo / urql
- 客户端表单或 UI draft → 不要塞进 SWR cache
- 把“4KB / 比 Query 小三倍”当固定事实 → 本轮未测 bundle

## 固定版本边界

- 本文绑定 `vercel/swr@7173e55b...`，Git tag `v2.5.1` 与 npm `swr@2.5.1` 的 `gitHead` 同一提交。
- 依赖 `dequal` 与 `use-sync-external-store`；peer 为 `react ^16.11 || ^17 || ^18 || ^19`。
- 条件 exports 另有 `./infinite`、`./mutation`、`./immutable`、`./subscription` 和 `react-server` 入口。
- 本文未安装依赖、运行 Jest/Playwright、发送请求或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **服务端状态可以没有 Client 对象**——一张 Map 加 WeakMap 里的全局表就够去重和广播。
2. **stale-while-revalidate 是默认政策**，不是可选项的别名；关掉它才是 `useSWRImmutable`。
3. **扩展点是函数组合**：middleware = `(useSWRNext) => useSWR`。
4. **事件是全局的，节流是局部的**；每个 key 只让第一个 revalidator 响应广播。

## 应用型自测

1. 默认配置下，`mutate('/api/user', newUser)` 在写入 cache 后还会发请求吗？
2. 两个组件订阅同一 key，focus 事件会让几个 revalidator 函数跑起来？
3. `useSWRImmutable` 改变了引擎，还是只改了开关？

检查点：

1. 会。除非传入 `revalidate: false`。
2. 一个。`revalidateAllKeys` 只调用 `revalidators[key][0]`。
3. 只改开关：关掉 focus / stale / reconnect / interval。

## 延伸阅读

- 官方文档：[swr.vercel.app](https://swr.vercel.app)
- 固定源码：[vercel/swr](https://github.com/vercel/swr) —— 本文绑定提交 `7173e55b2a175dee455612c5fa067383345c392f`
- RFC 5861：[Stale-While-Revalidate](https://datatracker.ietf.org/doc/html/rfc5861)
- [[tanstack-query]] —— 同一问题的 QueryClient + Observer 对照

## 关联

- [[tanstack-query]] —— OOP / Observer 对照组
- [[react]] —— 宿主框架；订阅走 `useSyncExternalStore` shim
- [[tanstack-router]] —— loader 与 SWR cache 可以并存，但不是同一层
- [[preact]] —— 兼容层最薄的 React 替代，需单独验证 adapter

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
