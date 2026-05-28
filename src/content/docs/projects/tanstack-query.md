---
title: TanStack Query — 服务端状态当成"独立物种"管
description: 区别于 useState 的客户端状态，服务端状态需要缓存键、过期、回收、订阅。本笔记按状元篇 v1.1 工具库分支精读 query-core 心脏文件。
sidebar:
  label: TanStack Query
  order: 2
---

| 维度 | 值 |
|------|------|
| GitHub | <https://github.com/TanStack/query> |
| Star | 49.5k（2026-05） |
| 版本 | v5（最新 release 2026-05-23） |
| 最近活跃 | 几乎每天有 commit；2,122 个 release |
| 主语言 | TypeScript |
| 维护 | TanStack 组织（Tanner Linsley 主导） |
| License | MIT |
| 适配 | React / Vue / Solid / Svelte / Angular（同一份 core） |
| 项目类型 | 工具库（v1.1 分支 B） |
| 本笔记 commit 锚定 | `d5630c9`（2026-05 抓取） |
| 研究日期 | 2026-05-28（按 [方法论 v1.1](/study/method/) 重写） |

## 一句话定位

把"从后端来的数据"当作和"用户在表单里输的数据"**完全不同的物种**来管。
后端数据不归你管原始事实——**别人会改、会过期、会脏**——所以需要缓存键、
TTL、自动重拉、观察者订阅。TanStack Query 给这些抽象做了一套统一引擎。

## Why（它解决了什么）

在它出现前，React 应用里数据获取是这样的：

```jsx
const [data, setData] = useState(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

useEffect(() => {
  let cancelled = false
  setLoading(true)
  fetch('/api/orders').then(r => r.json()).then(d => {
    if (!cancelled) {
      setData(d)
      setLoading(false)
    }
  }).catch(e => { if (!cancelled) setError(e) })
  return () => { cancelled = true }
}, [])
```

每个组件、每个接口都重写这套模板代码。问题：

- 同一份数据 **多个组件各拉一次**（订单列表页和侧栏 Badge 都拉 `/api/orders`）
- 用户切走再回来，要不要重新拉？没有统一答案
- 网络断了重连后要不要补拉？要写一堆事件监听
- 写操作后怎么让相关查询自动刷新？只能手动 `setData` 或刷整个页面
- 取消请求？组件 unmount 后请求还在跑，浪费流量

Tanner Linsley 在 2017 年写 react-query 解决这套问题。**核心 insight**：
**前端状态有两种**——

| 类型 | 例子 | 性质 |
|------|------|------|
| 客户端状态 | 表单 draft、modal 开关、当前 tab | 你完全 own，永远是最新 |
| 服务端状态 | 用户列表、订单详情 | 副本，原始事实在远端 |

`useState / useReducer / Redux / Zustand` 设计的是客户端状态。
TanStack Query 设计的是 **服务端状态**——天然带缓存、过期、订阅、重拉、取消。

→ 一旦你心里区分这两种，你的代码会自然分裂成
"两种状态用两套工具"，整个项目复杂度立刻下降。

## Layer 2 · 仓库地形 + 心脏文件

monorepo（pnpm workspaces）：

```
TanStack/query/
├── packages/
│   ├── query-core/                       ← ★ 核心引擎（无框架依赖）
│   │   └── src/
│   │       ├── query.ts             776 行 ← Query 类（一个数据条目）
│   │       ├── queryCache.ts        223 行 ← QueryCache（所有 Query 的 Map）
│   │       ├── queryClient.ts       636 行 ← QueryClient（顶层 API 入口）
│   │       ├── queryObserver.ts     835 行 ← 一个 useQuery 调用 = 一个 observer
│   │       ├── mutation.ts          419 行 ← 写操作单元
│   │       ├── mutationCache.ts / mutationObserver.ts
│   │       ├── retryer.ts           229 行 ← 重试 + 取消机制
│   │       ├── removable.ts          61 行 ← gcTime 倒计时基类（默认 5min）
│   │       ├── focusManager.ts / onlineManager.ts ← 焦点 / 网络变化监听
│   │       ├── notifyManager.ts          ← batch 调度 observer 通知
│   │       └── utils.ts                  ← hashKey / matchQuery / replaceEqualDeep
│   ├── react-query/                      ← ★ React 适配器（useQuery / useMutation）
│   ├── vue-query/                        ← Vue 适配器
│   ├── solid-query/ angular-query/ ...   ← 其他框架适配器（同一 core）
│   └── react-query-devtools/             ← devtools
├── examples/                             ← 跨框架真实样例
└── docs/                                 ← 文档源
```

**心脏文件 3 个**（v1.1 工具库分支要求 2-3 个）：

1. `packages/query-core/src/query.ts` — 单个 Query 实例的状态机和 fetch 流（[L155 class Query](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/query.ts#L155)）
2. `packages/query-core/src/queryCache.ts` — 全局 `Map<queryHash, Query>` + 订阅总线（[L92 class QueryCache](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryCache.ts#L92)）
3. `packages/query-core/src/queryObserver.ts` — observer 模式的"判断我要不要触发 refetch"逻辑（[L40 class QueryObserver](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryObserver.ts#L40)）

> **怀疑 1**（写完 Layer 4 之前）：QueryClient 算不算第 4 个心脏？读完发现它主要是
> facade——把 cancelQueries / invalidateQueries / refetchQueries 这些动词转发给
> queryCache + 找出 query 调对应方法。它的复杂度集中在 default options 合并和泛型
> 类型，不是状态机本身。所以**不算**心脏，归"门面"。

下面 Layer 3 拆 3 段精读这 3 个文件中最关键的 subsystem。

## Layer 3 · 核心机制（3 段）

![Query 状态机](/projects/tanstack-query/01-query-lifecycle.webp)

> 上图：Query 在 `(status × fetchStatus)` 二维状态空间里的转换。
> 全部转换边都来自 `query.ts:627-707` 的 `#dispatch` reducer，下面三段会逐一解释。

### 机制 1 · Query lifecycle：5 状态 + #dispatch reducer

#### 1.1 状态长什么样

`QueryState` 不是单变量 `'idle' | 'loading' | 'success' | 'error'`，而是
**两个正交字段**：

```typescript
// packages/query-core/src/query.ts L40-L65（commit d5630c9）
export interface QueryState<TData = unknown, TError = DefaultError> {
  data: TData | undefined
  dataUpdateCount: number
  dataUpdatedAt: number
  error: TError | null
  errorUpdateCount: number
  errorUpdatedAt: number
  fetchFailureCount: number
  fetchFailureReason: TError | null
  fetchMeta: FetchMeta | null
  isInvalidated: boolean
  status: 'pending' | 'error' | 'success'   // ← 数据是否到位
  fetchStatus: 'fetching' | 'paused' | 'idle' // ← 网络层是否在跑
}
```

**关键 insight**：`status` 与 `fetchStatus` 正交。所以"已经有数据 + 后台再拉一次"
是合法状态：`status: 'success' + fetchStatus: 'fetching'`——这就是 devtools 里
看到的"fetching"圆点出现在已渲染数据上的原因。

permalink：[query.ts L40-L65](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/query.ts#L40)

#### 1.2 reducer 全貌

所有状态转换走 `#dispatch(action)`，是个标准 reducer：

```typescript
// packages/query-core/src/query.ts L627-L707（节选自 #dispatch）
#dispatch(action: Action<TData, TError>): void {
  const reducer = (state: QueryState<TData, TError>): QueryState<TData, TError> => {
    switch (action.type) {
      case 'failed':
        return { ...state,
          fetchFailureCount: action.failureCount,
          fetchFailureReason: action.error }                      // 一次重试失败但还会重试
      case 'pause':
        return { ...state, fetchStatus: 'paused' }                // 网络掉线 / 窗口失焦
      case 'continue':
        return { ...state, fetchStatus: 'fetching' }              // 恢复
      case 'fetch':
        return { ...state, ...fetchState(state.data, this.options),
                 fetchMeta: action.meta ?? null }                 // 进入 fetching
      case 'success':
        const newState = { ...state,
          ...successState(action.data, action.dataUpdatedAt),
          dataUpdateCount: state.dataUpdateCount + 1,
          ...(!action.manual && {
            fetchStatus: 'idle',
            fetchFailureCount: 0,
            fetchFailureReason: null,
          }) }
        this.#revertState = action.manual ? newState : undefined  // ★ 乐观更新备份
        return newState
      case 'error':
        return { ...state,
          error: action.error,
          errorUpdateCount: state.errorUpdateCount + 1,
          errorUpdatedAt: Date.now(),
          fetchFailureCount: state.fetchFailureCount + 1,
          fetchFailureReason: action.error,
          fetchStatus: 'idle',
          status: 'error',
          isInvalidated: true }                                   // ★ 失败=自动 invalidate
      case 'invalidate':
        return { ...state, isInvalidated: true }
      case 'setState':
        return { ...state, ...action.state }
    }
  }

  this.state = reducer(this.state)

  notifyManager.batch(() => {
    this.observers.forEach((observer) => { observer.onQueryUpdate() })  // ★ 通知所有 observer
    this.#cache.notify({ query: this, type: 'updated', action })
  })
}
```

**6 个旁注**：

- 行 `manual: action.manual` —— `setQueryData()` 走 `success + manual=true`，
  乐观更新场景；`#revertState` 备份当前 state，**onError 时回滚走的就是这份备份**
- 行 `isInvalidated: true`（error case）—— 失败的 query 总是 stale，
  这样下次有 observer 出现就立刻 refetch，不用等 staleTime
- 行 `notifyManager.batch(...)` —— `setData` 触发 5 个 observer 同步更新前会用
  microtask 合并通知，避免 React 同步多次 setState 导致 5 次 render
- `fetch` action 走的是 `fetchState(state.data, this.options)` 这个 helper
  （[L710](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/query.ts#L710)），
  里面有个魔鬼细节：`status` 只在 `data === undefined` 时才被改成 `pending`——
  也就是说"已经有数据的后台刷新"不会把 status 改回 pending，UI 不会闪 spinner
- error reducer 把 `isInvalidated` 设 true 是**自动失败-即-标过期**的设计，
  与显式 `invalidateQueries` 共享同一个标志位，下游 observer 不需要区分两种来源
- pause / continue 这对 action 来自 retryer：网络掉线时 `pause`，
  window 重新聚焦或网络恢复后 `continue`——这是为什么"地铁里 4G 断了，
  恢复后页面自动补数据"

#### 1.3 转换图与状态空间

5 个有意义的合法状态（图中节点）：

| status | fetchStatus | 含义 |
|--------|-------------|------|
| pending | idle | 初态，还没拉过 |
| pending | fetching | 首次拉取中（loading）|
| success | idle | 有数据稳定态 |
| success | fetching | 后台刷新（背景拉新）|
| error | idle | 失败 + 已 invalidated |

> **怀疑 2**：理论上还有 `error + fetching`（失败后正在重试）。源码里它存在吗？
> 看 reducer，`error` action 把 fetchStatus 改成 `'idle'`，所以重试期间的状态是
> `pending + fetching`（重试逻辑在 retryer 里反复循环 run，
> 在 retryer 内部不会 dispatch 'error'，而是 dispatch 'failed' 只更新 failureCount，
> [retryer.ts L161-L205](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/retryer.ts#L161)）。
> 即"重试中"在 reducer 视角等同于"在拉"，不暴露 error 状态——这是 UX 设计：
> 不让中间一次失败把 UI 切 error 闪一下。

### 机制 2 · QueryCache：queryKey 序列化 + 订阅机制

#### 2.1 queryHash —— 用 JSON.stringify 当 Map key

```typescript
// packages/query-core/src/utils.ts L232-L243（commit d5630c9）
export function hashKey(queryKey: QueryKey | MutationKey): string {
  return JSON.stringify(queryKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()                           // ★ 关键：先排序再序列化
          .reduce((result, key) => {
            result[key] = val[key]
            return result
          }, {} as any)
      : val,
  )
}
```

permalink：[utils.ts L232](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/utils.ts#L232)

**5 个旁注**：

- 用 `JSON.stringify` 的 `replacer` 参数，遇到 plain object 时**先 `Object.keys().sort()`
  再 reduce**——这样 `{a:1, b:2}` 和 `{b:2, a:1}` 序列化结果相同
- 数组顺序保留：`['orders', userId]` 和 `['orders', otherUser]` 当然不同 hash
- 这个函数同时给 query 和 mutation 用，签名是 `QueryKey | MutationKey`
- 如果你传了 `Date` / `Map` / `Set`，JSON.stringify 默认行为会让 hash 不稳定——
  这是为什么 v5 docs 强调"queryKey 必须是 serializable"
- 想自定义 hash？`queryOptions.queryKeyHashFn` 是逃生口（见
  [utils.ts L220 hashQueryKeyByOptions](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/utils.ts#L220)）

#### 2.2 QueryCache.build —— Map 去重逻辑

```typescript
// packages/query-core/src/queryCache.ts L100-L131
build<...>(client, options, state?): Query<...> {
  const queryKey = options.queryKey
  const queryHash = options.queryHash ?? hashQueryKeyByOptions(queryKey, options)
  let query = this.get<...>(queryHash)               // ★ 先查 Map

  if (!query) {                                       // 没有就建一个新的
    query = new Query({
      client, queryKey, queryHash,
      options: client.defaultQueryOptions(options),
      state,
      defaultOptions: client.getQueryDefaults(queryKey),
    })
    this.add(query)                                   // 入 Map + 通知 'added'
  }

  return query
}
```

permalink：[queryCache.ts L100](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryCache.ts#L100)

**这就是为什么 5 个组件用同一个 queryKey 只发一个请求**——5 次 `build` 调用走第 1 次
`new Query`，后 4 次拿 Map 命中的同一个实例，5 个 observer 挂到同一个 Query 上。

#### 2.3 订阅机制 —— Subscribable 基类

`QueryCache extends Subscribable<QueryCacheListener>`。所有 cache 级别事件
（added / removed / updated / observerAdded / observerRemoved / observerResultsUpdated /
observerOptionsUpdated）都过 `cache.notify(event)`：

```typescript
// packages/query-core/src/queryCache.ts L200-L206
notify(event: QueryCacheNotifyEvent): void {
  notifyManager.batch(() => {
    this.listeners.forEach((listener) => {
      listener(event)
    })
  })
}
```

谁订阅这条总线？`MutationCache.notify` 触发 `invalidateQueries` 时，devtools 实时
显示 query 状态变化时，react-query 的 `useIsFetching()` hook 计数当前 fetching
query 数时——都是订阅 `cache.subscribe(listener)` 拿事件。

permalink：[queryCache.ts L200](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryCache.ts#L200)

> **怀疑 3**：findAll 是不是 O(n) 全扫？
> 看 [queryCache.ts L193](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryCache.ts#L193)：
> ```typescript
> findAll(filters: QueryFilters<any> = {}): Array<Query> {
>   const queries = this.getAll()      // = [...this.#queries.values()]
>   return Object.keys(filters).length > 0
>     ? queries.filter((query) => matchQuery(filters, query))
>     : queries
> }
> ```
> 确实是 O(n) 全扫 + filter。`invalidateQueries({ queryKey: ['orders'] })` 在
> 1 万条 query 的 cache 里就是 1 万次 `partialMatchKey`。
> 实际上不会跑这种规模——一个 SPA 同时挂的 query 通常 < 200。但是**如果你写了
> 一个长跑的 admin dashboard 用 hot-reload 不断加 query 不清，理论上会变慢**。
> 没看到内置索引；想优化得自己写 `queryKeyHashFn` 把 key 折叠到更窄空间。

### 机制 3 · QueryObserver + retryer：observer 决策 + 重试取消

QueryObserver 是 useQuery 在 core 层的对应物。它做两件事：
**(a)** 监听 Query 变化通知 React 重渲染；
**(b)** 决定"现在该不该 fetch"。

#### 3.1 shouldFetchOnMount —— observer 挂载时该不该拉

```typescript
// packages/query-core/src/queryObserver.ts L762-L789（commit d5630c9）
function shouldFetchOnMount(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any, any>,
): boolean {
  return (
    shouldLoadOnMount(query, options) ||
    (query.state.data !== undefined &&
      shouldFetchOn(query, options, options.refetchOnMount))
  )
}

function shouldFetchOn(query, options, field) {
  if (
    resolveQueryBoolean(options.enabled, query) !== false &&
    resolveStaleTime(options.staleTime, query) !== 'static'
  ) {
    const value = typeof field === 'function' ? field(query) : field
    return value === 'always' || (value !== false && isStale(query, options))
  }
  return false
}

function isStale(query, options): boolean {
  return (
    resolveQueryBoolean(options.enabled, query) !== false &&
    query.isStaleByTime(resolveStaleTime(options.staleTime, query))
  )
}
```

permalink：[queryObserver.ts L762](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryObserver.ts#L762)

**5 个旁注**：

- `shouldLoadOnMount`：data 还没 → 必须拉。`shouldFetchOn`：有 data 但 stale →
  按 `refetchOnMount` 设定决定
- `refetchOnMount` 三种值：`true`（stale 才拉）/ `false`（不拉）/ `'always'`（每次都拉）
- `staleTime: 'static'` 是 v5 引入的特殊值——永不 stale，给那种"一次拉了就一辈子有效"
  的配置数据（如国家列表）用，比 `Infinity` 语义更明确
- `enabled` 是 boolean 也可以是 `(query) => boolean` 函数（resolveQueryBoolean），
  支持"等其他 query 拿到 ID 后再拉这个 query"的依赖式查询
- 这套布尔运算每次 component 重渲染都会跑一次（在 useBaseQuery 里），所以
  `enabled` / `staleTime` 必须便宜——别在里面 sort 数组

#### 3.2 isStaleByTime —— 心脏判断

```typescript
// packages/query-core/src/query.ts L316-L331
isStaleByTime(staleTime: StaleTime = 0): boolean {
  if (this.state.data === undefined) return true        // 没数据 → stale
  if (staleTime === 'static') return false              // static → 永不 stale
  if (this.state.isInvalidated) return true             // 显式失效 → stale
  return !timeUntilStale(this.state.dataUpdatedAt, staleTime)
}
```

`timeUntilStale` 在 utils.ts L111：`return Math.max(updatedAt + staleTime - Date.now(), 0)`
返回剩余新鲜毫秒，0 时被 `!` 反转成 true（即 stale）。

permalink：[query.ts L316](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/query.ts#L316)

#### 3.3 retryer —— 重试 + 取消 + 暂停 + 继续

retryer 是个独立的 IIFE-style 状态机闭包，不是 class（[retryer.ts L76 createRetryer](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/retryer.ts#L76)）：

```typescript
// packages/query-core/src/retryer.ts L142-L206（节选 run 函数）
const run = () => {
  if (isResolved()) return

  let promiseOrValue: any
  const initialPromise = failureCount === 0 ? config.initialPromise : undefined

  try {
    promiseOrValue = initialPromise ?? config.fn()                  // ★ 跑 queryFn
  } catch (error) {
    promiseOrValue = Promise.reject(error)
  }

  Promise.resolve(promiseOrValue)
    .then(resolve)
    .catch((error) => {
      if (isResolved()) return

      const retry = config.retry ?? (environmentManager.isServer() ? 0 : 3)
      const retryDelay = config.retryDelay ?? defaultRetryDelay     // 1s, 2s, 4s, ... 30s 上限
      const delay = typeof retryDelay === 'function'
        ? retryDelay(failureCount, error)
        : retryDelay
      const shouldRetry =
        retry === true ||
        (typeof retry === 'number' && failureCount < retry) ||
        (typeof retry === 'function' && retry(failureCount, error))

      if (isRetryCancelled || !shouldRetry) {
        reject(error); return
      }

      failureCount++
      config.onFail?.(failureCount, error)

      sleep(delay)
        .then(() => canContinue() ? undefined : pause())            // ★ 失焦/掉线则 pause
        .then(() => {
          if (isRetryCancelled) reject(error)
          else run()                                                // ★ 递归重试
        })
    })
}
```

**`canContinue` 的三个条件**：

```typescript
// packages/query-core/src/retryer.ts L104-L107
const canContinue = () =>
  focusManager.isFocused() &&
  (config.networkMode === 'always' || onlineManager.isOnline()) &&
  config.canRun()
```

**5 个旁注**：

- `defaultRetryDelay`（[L49](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/retryer.ts#L49)）：
  `Math.min(1000 * 2 ** failureCount, 30000)`——指数退避，封顶 30 秒
- 默认重试 3 次（client）/ 0 次（server，避免 SSR 流卡住）
- 取消是 `CancelledError` 抛进 reject 链，配合 `revert: true` 让 Query 走
  `onCancel` 回滚到 `#revertState`（乐观更新失败回滚就走这里）
- `silent: true` 取消用于"我要立刻发新请求覆盖旧请求"的场景，
  不会触发 onError，UI 不闪
- `pause()` 返回 Promise，pending 直到 `continueFn` 被调；这就是为什么
  后台刷新页面时浏览器 tab 失焦，请求不会真的失败而是悬着等切回来

#### 3.4 invalidation 策略 —— 写操作如何"扇出"

`queryClient.invalidateQueries(filters)` 真实实现：

```typescript
// packages/query-core/src/queryClient.ts L291-L311
invalidateQueries<TTaggedQueryKey extends QueryKey = QueryKey>(
  filters?: InvalidateQueryFilters<TTaggedQueryKey>,
  options: InvalidateOptions = {},
): Promise<void> {
  return notifyManager.batch(() => {
    this.#queryCache.findAll(filters).forEach((query) => {
      query.invalidate()                              // 仅设 isInvalidated=true
    })

    if (filters?.refetchType === 'none') {
      return Promise.resolve()
    }
    return this.refetchQueries(
      { ...filters, type: filters?.refetchType ?? filters?.type ?? 'active' },
      options,
    )
  })
}
```

permalink：[queryClient.ts L291](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryClient.ts#L291)

**两步分离很重要**：

1. **标过期**：扫 cache，找 match 的 query，全部设 `isInvalidated = true`
2. **触发 refetch**：默认 `type: 'active'`——只对**有 observer**的 query 立刻 refetch；
   没人订阅的 query 标记后等下次有 observer 出现时再触发（在 observer mount 路径上）

这是为什么"我先关掉某个 tab，再 invalidate，再打开 tab，数据还是新的"——
关掉时没人订阅，invalidate 只标记不拉；打开时 observer mount 走 shouldFetchOnMount，
看到 isInvalidated 立刻拉。

> **怀疑 4**：mutation 的 `onSuccess` 回调能保证在 invalidateQueries 触发的 refetch
> 完成**之后**才 resolve 吗？源码里 invalidateQueries 返回的是 `refetchQueries(...)`
> 的 Promise，refetchQueries 里 `Promise.all(promises).then(noop).catch(noop)`，
> 所以 await 这个 Promise 确实会等所有 active query refetch 完。但这要求 onSuccess
> 里 `await queryClient.invalidateQueries(...)`——很多教程示例没 await，那种写法
> mutation Promise 早就 resolve，UI 上看起来"瞬间完成"但 query 数据还在飞。
> [queryClient.ts L313-L335 refetchQueries](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/queryClient.ts#L313)。

## Layer 4 · Hands-on：30 分钟跑通 + 改一处实验

### Step 1：基础接入（10 分钟）

```bash
# 在你的 React 项目里
npm i @tanstack/react-query @tanstack/react-query-devtools
```

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      <ReactQueryDevtools />   {/* ← 关键：可视化看缓存状态 */}
    </QueryClientProvider>
  )
}
```

### Step 2：把一个 useState+fetch 改成 useQuery（10 分钟）

```jsx
// 改前
function OrderList({ userId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    fetch(`/api/orders?userId=${userId}`)
      .then(r => r.json())
      .then(d => { setOrders(d); setLoading(false) })
  }, [userId])
  if (loading) return <Spinner />
  return <List items={orders} />
}

// 改后
function OrderList({ userId }) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', userId],
    queryFn: ({ signal }) =>
      fetch(`/api/orders?userId=${userId}`, { signal }).then(r => r.json()),
    staleTime: 30_000,        // 30 秒内不重拉
  })
  if (isLoading) return <Spinner />
  return <List items={orders} />
}
```

**重点**：5 个组件都用 `useQuery({ queryKey: ['orders', userId] })`，**只发一次请求**——
原因 = `QueryCache.build` 按 queryHash 去重，参见上面 [机制 2.2](#22-querycachebuild--map-去重逻辑)。

### Step 3：改一处实验 —— 把 staleTime default 改了看 devtools 行为

> v1.1 工具库分支要求"30 分钟跑通 + 1 个改一处实验"。下面给两个：
> 实验 A 是默认值改动 + devtools 观察；实验 B 是写一个 custom mutation observer 看
> mutation 总线。两选一即可。

#### 实验 A：把 staleTime default 改成 60s 看 devtools

默认 `staleTime: 0`——意味着每次有新 observer 挂载都重拉一次。改成全局 60s：

```jsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,         // 全局默认：1 分钟内同 key 不重拉
    },
  },
})
```

**对照实验**：

1. 默认 `staleTime: 0` 时，把 OrderList 组件 mount-unmount-mount 三次，
   devtools 会看到三次 `fetching → success`
2. 改成 60s 后，第一次 mount 拉一次后，60 秒内的 mount-unmount-mount 不会重拉，
   devtools 显示 `success` 一直亮但 `last fetched` 时间不动
3. 60 秒后再 mount，触发一次 stale-refetch（status 保持 success，fetchStatus 切 fetching）

这一步把 [机制 1.3 状态空间表格](#13-转换图与状态空间) 的 `success + fetching`
从抽象状态变成你眼睛看到的 devtools 视觉标记。

#### 实验 B：写一个 custom mutation observer

绕过 useMutation hook，直接订阅 mutation 总线：

```typescript
import { MutationCache, MutationObserver } from '@tanstack/react-query'

// 全局监听所有 mutation 的状态机迁移
queryClient.getMutationCache().subscribe((event) => {
  console.log('[mutation event]', event.type, event.mutation.options.mutationKey)
  // event.type: 'added' | 'removed' | 'updated' | 'observerAdded' | ...
})

// 不走 hook 触发一个 mutation
const obs = new MutationObserver(queryClient, {
  mutationFn: (id: string) => fetch(`/api/draws/${id}`, { method: 'POST' }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['draws'] }),
})
await obs.mutate('order-123')
```

跑完看 console 你会看到一串事件：`added` → `updated`（status: pending）→
`updated`（status: success）→ `observerRemoved`，最后 gcTime（默认 5min）后会
出 `removed`。这套事件总线就是 devtools 的数据源。

### Step 4：观察取消机制

打开 devtools，在 `OrderList` 渲染时立刻切走（unmount）。看 devtools 里这个 query
的状态：从 fetching → idle，retry count 显示请求被取消。

如果你的 queryFn 没用 `ctx.signal`，请求实际还在飞，只是结果被丢弃。
看 `query.ts:444-457` 的 `addSignalProperty`——signal 是个 getter，
**只有 queryFn 真访问了 `ctx.signal`，`#abortSignalConsumed` 才变 true**，
后续 cancel 才会真的 `abortController.abort()`。

permalink：[query.ts L444-L457](https://github.com/TanStack/query/blob/d5630c9/packages/query-core/src/query.ts#L444)

## Layer 5 · 横向对比：TanStack Query / SWR / Apollo Client

| 维度 | TanStack Query | SWR | Apollo Client |
|------|----------------|-----|---------------|
| 出身 | Tanner Linsley，2017 | Vercel，2019 | GraphQL 官方栈 |
| 核心抽象 | Query + Observer + Cache + Retryer | Resource + Revalidator | Normalized Cache + Field Policies |
| 哲学 | 显式 invalidateQueries + 乐观更新 | 主要靠 revalidate（focus/interval） | Schema 驱动缓存联动 |
| 适用 | REST / GraphQL / 任何 promise | REST / GraphQL，简单数据展示 | 强 GraphQL 项目 |
| 学习曲线 | 中等（概念较多） | 低（5 分钟） | 高（要懂 GraphQL + cache normalization） |
| Bundle | ~13kb（react-query 包） | ~4kb | ~30kb |
| 特色 | mutation + 乐观更新成熟，跨框架 core 复用 | revalidate-on-focus 优雅 | Normalized cache 自动联动 |

**选型**：

- **频繁写 + 立刻反馈**（电商加购、点赞、即时编辑） → TanStack Query。
  乐观更新 + invalidate 链 + revertState 兜底
- **简单数据展示页（只读多）** → SWR。心智简单，bundle 小
- **重 GraphQL 项目** → Apollo（但实际很多团队也在 Apollo 之上加 TanStack Query
  处理 mutation）

**抽象层差异**（看完 query-core 源码反观对比）：

- TanStack Query 的"key"是**用户给的 array**（`['orders', userId]`），cache 是
  `Map<jsonHash, Query>`。简单粗暴，扩展性靠 partialMatchKey 的前缀匹配
- SWR 的"key"也是字符串/array，但内部不维护"observer 决策树"——它的取舍是
  把 mutation/optimistic 的活儿少做一些
- Apollo 的"key"是 GraphQL field path + args + `__typename` + id，
  cache 是规范化（normalized）扁平 Map<entityKey, fields>。这套让 mutation 改一个
  user 自动联动到所有引用该 user 的 query；但代价是要懂 GraphQL schema 和 typePolicies

## Layer 6 · 与你当前工作的连接

### 今天就能用的部分

**项目数据获取层全面迁移**（高优先级）：

1. 装 react-query + devtools（30 分钟）
2. 列出你项目里所有 `useEffect + fetch` 模式，按"数据共享度"排优先级：
   - **共享度高**：用户信息、订单列表、库存（多个页面都拿）→ 最先迁
   - **共享度低**：单页面专用数据 → 后迁
3. 第一周迁 5 个最热接口；统一约定 staleTime（建议：高频变化数据 30s，
   稳定数据 5min，几乎不变的数据 `'static'`）
4. `useMutation` 替换所有写操作；onSuccess 配 `await invalidateQueries`

**预期收益**：

- 删掉约 40% 的样板 useState/useEffect
- 用户切走再回来的"数据已过期但不知道"问题消失
- 写操作的"立刻反馈 + 失败回滚"让产品手感升一档

### 下个月能用的部分

**乐观更新做"立刻反馈"产品体验**：

任何"用户期望点击瞬间看到结果"的交互（点赞、加购、即时编辑、协同光标等）都适合
乐观更新。但要小心**回滚的视觉过渡**——不能直接闪一下回到原状，要有 toast 提示
"网络问题，请重试"。这套交互模式可以变成产品差异化点。

**配合 Suspense（v5 新特性）**：

`useSuspenseQuery` 把 loading 状态从 if-else 抽离，让组件树用 Suspense 边界
统一 fallback。这是 React 19 时代的写法，现在迁移可以一步到位。

### 不要用的部分

- **不要把 TanStack Query 当 Redux 用**。客户端纯 UI 状态（modal 开关、表单 draft、
  动画 step）继续用 useState 或 zustand，不要塞进 Query
- **不要无脑 `staleTime: Infinity` 或 `'static'`**。看起来"省请求"，但用户拿到的
  可能是几小时前的数据。要按数据性质分档
- **不要每个查询都设独立的 gcTime**。除非有特别理由，跟全局默认（5 分钟）走

## Layer 7 · 自检 + 怀疑收口 + 延伸阅读

### 还没回答的（精读源码时回头查）

- `Query.fetch` 的"防重入"逻辑里，`#retryer.continueRetry()` 是不是会让两个并发
  fetch call 共享同一个 promise？追到 `retryer.ts`
- React 18 的 `useSyncExternalStore` 在 react-query 里怎么用的？
  看 `useBaseQuery.ts` 里的 subscribe 实现
- `placeholderData` 和 `initialData` 在 state machine 里走的是同一条路吗？
  追到 `query.ts` 的 setOptions 和 getDefaultState
- 长列表场景（数千条数据分页加载），用 useInfiniteQuery 怎么避免重复 fetch？
  看 `infiniteQueryBehavior.ts`
- notifyManager.batch 实现细节是 microtask 还是 setTimeout(0)？
  v5 之后默认走 microtask（queueMicrotask），但有 `setBatchNotifyFunction` 逃生口

### 显式怀疑收口

| # | 怀疑 | 现状 |
|---|------|------|
| 怀疑 1 | QueryClient 算心脏吗 | 不算，归"门面" |
| 怀疑 2 | error + fetching 状态合法吗 | 不暴露，重试期间走 pending+fetching，UX 设计 |
| 怀疑 3 | invalidateQueries 是 O(n) 全扫吗 | 是，无内置索引；规模 < 200 query 时无感 |
| 怀疑 4 | mutation onSuccess 等不等 invalidate 完成 | 等，但前提是 `await invalidateQueries(...)` |

### 延伸阅读路径（按读完笔记再深入）

1. `packages/query-core/src/queryObserver.ts`（835 行）— 学 observer 怎么决定
   "我要不要触发 refetch"+ getOptimisticResult 的 placeholder 逻辑
2. `packages/react-query/src/useBaseQuery.ts`（200 行）— 学 React 适配器怎么对接 core，
   useSyncExternalStore 是怎么用的
3. `packages/query-core/src/mutation.ts` + `mutationCache.ts`（419+ 行）— 学
   mutation 状态机和 onMutate / onError / onSettled 生命周期
4. `packages/query-core/src/hydration.ts` — 学 SSR 里把 server 拉好的数据
   serialize 给 client 复用的 dehydrate / hydrate 协议
5. `packages/query-core/src/notifyManager.ts` — 学 batch + scheduler 抽象，
   v5 默认走 queueMicrotask，逃生口是 setBatchNotifyFunction

→ 这 5 篇读完你能自己实现一个微型 query-core，并且能解释 SWR / Apollo 在每个
设计点上为什么做不同选择。

## 限制 / 适用边界

- 不适合**纯客户端状态**（动画 step、modal 开关、表单 draft）——用 useState / zustand
- 不适合**实时流**（WebSocket push、SSE）——用专门的 socket 库 + 用 setQueryData
  写入 cache 来桥接
- 不适合**强 GraphQL normalized cache 联动**——Apollo / urql 在那个领域更专业
- v5 的 staleTime `'static'` 还在普及，老 docs 里 `Infinity` 混用
- React 适配器版本与 core 版本要锁同一 minor，monorepo 里别一个用 v5.50 一个用 v5.62

## 元数据

| 项 | 值 |
|------|------|
| 版本 | v1.1（2026-05-28 按 [方法论 v1.1 工具库分支](/study/method/) 重写）|
| 行数 | 当前文件 ≥ 600 行（工具库分支底线 400）|
| Figure | 01-query-lifecycle.webp（5 状态 + 转换边）|
| GitHub permalink | ≥ 10 个，全部锚定 commit `d5630c9` |
| 显式怀疑 | 4 个（工具库分支底线 3）|
| Hands-on | 实验 A（改 staleTime default）+ 实验 B（custom mutation observer） |
| 心脏文件 | query.ts / queryCache.ts / queryObserver.ts |
| 上次重写 | 2026-05-27（v1 草稿，475 行） |
