---
title: TanStack Query — 服务端状态当成"独立物种"管
description: 区别于 useState 的客户端状态，服务端状态需要缓存键、过期、回收、订阅，TanStack Query 把这套抽象做到了极致。
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
| 研究日期 | 2026-05-27（按 [方法论](/study/method/) 重写第 1 版） |

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

## 仓库地形

monorepo（pnpm workspaces）：

```
TanStack/query/
├── packages/
│   ├── query-core/          ← ★ 核心引擎（无框架依赖）
│   │   └── src/
│   │       ├── query.ts             ← Query 类（一个数据条目）
│   │       ├── queryCache.ts        ← QueryCache 类（所有 Query 的 Map）
│   │       ├── queryClient.ts       ← QueryClient 类（顶层 API）
│   │       ├── queryObserver.ts     ← 观察者（一个 useQuery 调用 = 一个 observer）
│   │       ├── mutation.ts / mutationCache.ts / mutationObserver.ts
│   │       ├── retryer.ts           ← 重试 + 取消机制
│   │       └── focusManager.ts / onlineManager.ts ← 焦点 / 网络变化监听
│   ├── react-query/         ← ★ React 适配器（useQuery / useMutation hook）
│   ├── vue-query/           ← Vue 适配器
│   ├── solid-query/         ← ...
│   └── react-query-devtools/← devtools 实现
├── examples/                ← 跨框架的真实使用样例
└── docs/                    ← 文档源（react.dev 风格的 deep dives）
```

**心脏文件**：

1. `packages/query-core/src/query.ts`（700+ 行）— 单个 Query 实例的状态机和 fetch 流
2. `packages/query-core/src/queryObserver.ts` — observer 模式：组件订阅 Query
3. `packages/react-query/src/useQuery.ts` — React hook 怎么对接 core

下面精读 #1。

## 核心机制

### 机制 1 · Query 类：数据条目的状态机

`Query` 是一个**数据条目**的运行时实例（[github 链接](https://github.com/TanStack/query/blob/main/packages/query-core/src/query.ts)）。
关键字段：

```typescript
export class Query<...> extends Removable {
  queryKey: TQueryKey                  // 唯一标识：['orders', userId]
  queryHash: string                    // queryKey 序列化后的 hash，作 Map key
  state: QueryState<TData, TError>     // status: pending|error|success, data, error, ...
  observers: Array<QueryObserver<...>> // 订阅这个 Query 的所有 observer
  #cache: QueryCache                   // 反向引用：所属的全局 cache
  #retryer?: Retryer<TData>            // 当前正在跑的请求重试器
  #abortSignalConsumed: boolean        // queryFn 是否用了 signal（取消支持）
}
```

**关键方法 `fetch()` 的真实流程**（节选）：

```typescript
async fetch(options?, fetchOptions?): Promise<TData> {
  // 1. 防重入：已经在跑了就返回正在跑的 promise
  if (this.state.fetchStatus !== 'idle' && this.#retryer?.status() !== 'rejected') {
    if (this.state.data !== undefined && fetchOptions?.cancelRefetch) {
      this.cancel({ silent: true })
    } else if (this.#retryer) {
      this.#retryer.continueRetry()
      return this.#retryer.promise
    }
  }

  // 2. 创建 AbortController（关键的取消机制）
  const abortController = new AbortController()
  const addSignalProperty = (object: unknown) => {
    Object.defineProperty(object, 'signal', {
      enumerable: true,
      get: () => {
        this.#abortSignalConsumed = true   // 用 getter 检测 queryFn 是否用了 signal
        return abortController.signal
      },
    })
  }

  // 3. 构造 queryFn 的执行上下文（注入 signal）
  const fetchFn = () => {
    const queryFnContext = { client, queryKey, meta }
    addSignalProperty(queryFnContext)      // 把 signal 作为 getter property 注入
    this.#abortSignalConsumed = false
    return this.options.queryFn(queryFnContext)
  }

  // 4. 派发 fetch action（state machine 转入 'fetching'）
  this.#dispatch({ type: 'fetch', meta: context.fetchOptions?.meta })

  // 5. 创建 retryer 包裹 queryFn，处理重试逻辑
  this.#retryer = createRetryer({
    fn: context.fetchFn,
    onCancel: (error) => {
      if (error instanceof CancelledError && error.revert) {
        this.setState({ ...this.#revertState, fetchStatus: 'idle' })
      }
      abortController.abort()              // 真正发出 abort 信号
    },
    retry: context.options.retry,
    retryDelay: context.options.retryDelay,
    networkMode: context.options.networkMode,
    ...
  })

  // 6. 执行 + 捕获结果
  try {
    const data = await this.#retryer.start()
    this.setData(data)                     // 写入 state，通知所有 observer
    return data
  } catch (error) {
    if (error instanceof CancelledError && error.silent) {
      return this.#retryer.promise         // silent 取消不算失败
    }
    this.#dispatch({ type: 'error', error })
    throw error
  } finally {
    this.scheduleGc()                      // 安排 gcTime 后 GC
  }
}
```

**机制揭秘**：

- **取消用 getter 探测**：第 2-3 步注意 `addSignalProperty` 是把 `signal` 加成
  `getter` property。**只有当 queryFn 真的访问了 `ctx.signal` 时，
  `#abortSignalConsumed` 才变 true**。这是为什么 query-core 能优雅处理"老 fetch
  代码不用 signal"——它知道你没用，就不会假装支持取消
- **revert state**：第 5 步的 `onCancel` 里有 `revert` 模式——乐观更新被取消时
  回滚到 fetch 前的 state，配合 `setQueryData(...)` 的乐观更新
- **silent cancel**：fetch 流里有"静默取消"概念，用于"我要重新取消并立刻重发"的场景，
  这种取消不会触发错误回调
- **finally GC**：每次 fetch 结束都重新安排 GC 计时。这是为什么数据没人订阅后
  会在 gcTime（默认 5 分钟）后被清掉

### 机制 2 · Observer 模式：组件怎么订阅 Query

`useQuery({ queryKey, queryFn })` 实际做了什么？看 `Query.addObserver`：

```typescript
addObserver(observer: QueryObserver<...>): void {
  if (!this.observers.includes(observer)) {
    this.observers.push(observer)
    this.clearGcTimeout()                // 关键：有人订阅就取消 GC
    this.#cache.notify({ type: 'observerAdded', query: this, observer })
  }
}

removeObserver(observer: QueryObserver<...>): void {
  if (this.observers.includes(observer)) {
    this.observers = this.observers.filter((x) => x !== observer)

    if (!this.observers.length) {
      // 没人订阅了：取消正在跑的 retryer
      if (this.#retryer) {
        if (this.#abortSignalConsumed || this.#isInitialPausedFetch()) {
          this.#retryer.cancel({ revert: true })
        } else {
          this.#retryer.cancelRetry()
        }
      }
      this.scheduleGc()                  // 重新启动 GC 倒计时
    }

    this.#cache.notify({ type: 'observerRemoved', query: this, observer })
  }
}
```

**这就是为什么组件 unmount 时正在跑的请求会被取消**——`removeObserver` 在
react-query 的 useEffect cleanup 里被调用，最后一个 observer 移除后就触发 retryer
cancel，retryer 内部 abort AbortController，queryFn 内的 fetch 收到 signal 中断。

**多组件共享数据**：5 个组件都用 `useQuery({ queryKey: ['orders'] })`，
内部其实只有一个 Query 实例（按 queryHash 在 QueryCache Map 里去重），
5 个 observer 订阅它。Query.fetch 只跑一次，setData 后通知 5 个 observer 同时更新。

### 机制 3 · isStale：什么时候自动重拉

```typescript
isStaleByTime(staleTime: StaleTime = 0): boolean {
  if (this.state.data === undefined) return true   // 没数据 → stale
  if (staleTime === 'static') return false         // static → 永不 stale
  if (this.state.isInvalidated) return true        // 被 invalidateQueries 标过 → stale
  return !timeUntilStale(this.state.dataUpdatedAt, staleTime)
}
```

**触发自动重拉的 4 个条件**（通过 observer 实现）：

1. `staleTime` 内重新 mount 不重拉；超出立刻重拉
2. 窗口重新聚焦（`focusManager`）：tab 切回来时调 `Query.onFocus`
3. 网络重连（`onlineManager`）：调 `Query.onOnline`
4. 显式 `queryClient.invalidateQueries({ queryKey })`：`isInvalidated = true`

→ 用户行为/网络环境的所有变化都会触发**对应 observer 的 `shouldFetch...`
判断**，符合条件就重拉。这是为什么"用户离开页面 5 分钟回来，数据自动新鲜"。

### 机制 4 · Mutation + invalidateQueries：写操作的对偶概念

```jsx
const mutation = useMutation({
  mutationFn: drawApi,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['draws', userId] })
  }
})

mutation.mutate(orderId)
```

`invalidateQueries` 内部：扫描 QueryCache，找出 queryKey 匹配的所有 Query，
逐个调 `query.invalidate()`，state 标记 `isInvalidated = true`。
**有 observer 订阅的 Query 立刻触发 refetch；没人订阅的等下次有 observer 时再处理**。

→ 写操作完成后**不需要手动同步任何状态**——你只声明"和这个数据相关的查询都过期了"，
core 引擎自己处理后续。这是 TanStack Query 心智模型的灵魂。

### 机制 5 · 乐观更新（Optimistic Update）

```jsx
useMutation({
  mutationFn: drawApi,
  onMutate: async (newDraw) => {
    await queryClient.cancelQueries({ queryKey: ['draws'] })  // 取消进行中的查询
    const previous = queryClient.getQueryData(['draws'])       // 备份
    queryClient.setQueryData(['draws'], old => [...old, newDraw])  // 立刻更新 UI
    return { previous }
  },
  onError: (err, vars, context) => {
    queryClient.setQueryData(['draws'], context.previous)      // 回滚
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['draws'] })     // 最终对齐后端
  }
})
```

→ 这套范式让"用户点击立刻看到结果，失败再回滚"成为标准做法。
对任何"想要瞬间反馈"的交互（点赞、加购、抽奖、即时编辑等）至关重要。

## Hands-on（30 分钟跑通 + 1 个改动实验）

### Step 1：基础接入（10 分钟）

```bash
# 在你的 React 项目里
npm i @tanstack/react-query @tanstack/react-query-devtools

# main.tsx / App.tsx 顶层包 Provider
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

找你项目里最简单的一个数据获取场景，对照改写：

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
    queryFn: () => fetch(`/api/orders?userId=${userId}`).then(r => r.json()),
    staleTime: 30_000,        // 30 秒内不重拉
  })
  if (isLoading) return <Spinner />
  return <List items={orders} />
}
```

**重点**：现在 5 个组件都用 `useQuery({ queryKey: ['orders', userId] })`，
**只发一次请求**，5 个组件同时拿到数据。

### Step 3：改一处实验（10 分钟）

**实验 A：观察取消机制**

打开 devtools。在 `OrderList` 渲染时立刻切走（unmount）。
看 devtools 里这个 query 的状态：从 fetching → idle，retry count 显示请求被取消。

如果你的 queryFn 里没用 `ctx.signal`，请求实际还在飞，只是结果被丢弃。
改成：

```jsx
queryFn: ({ signal }) => fetch(`/api/orders?userId=${userId}`, { signal }).then(r => r.json())
```

再试一次：现在 unmount 时 fetch 真的被中断（network 面板看 status=cancelled）。

**实验 B：乐观更新**

实现一个"点击抽奖按钮立刻 UI 显示新结果，失败回滚"的最小例子。
按机制 5 那段代码写。然后**人工模拟失败**（在 mutationFn 里 `throw new Error`），
看 UI 是否回滚。这一步建立"乐观更新不是骗人，是带兜底的提速"的肌肉记忆。

## 横向对比：TanStack Query / SWR / Apollo Client

| 维度 | TanStack Query | SWR | Apollo Client |
|------|----------------|-----|---------------|
| 出身 | Tanner Linsley，2017 | Vercel，2019 | GraphQL 官方栈 |
| 哲学 | 显式 invalidateQueries + 乐观更新 | 主要靠 revalidate（focus/interval） | GraphQL schema 驱动缓存 |
| 适用 | REST / GraphQL / 任何 promise | REST / GraphQL，简单数据展示 | 强 GraphQL 项目 |
| 学习曲线 | 中等（概念较多） | 低（5 分钟） | 高（要懂 GraphQL + cache normalization） |
| Bundle | ~13kb（react-query 包） | ~4kb | ~30kb |
| 特色 | mutation + 乐观更新成熟 | revalidate-on-focus 优雅 | Normalized cache 自动联动 |

**选型**：

- **频繁写 + 立刻反馈类产品**（电商加购、抽奖、点赞、协同编辑） → TanStack Query。乐观更新 + invalidate 链
- **简单数据展示页（只读多）** → SWR。心智简单
- **重 GraphQL 项目** → Apollo（但实际很多团队也在 Apollo 之上加 TanStack Query 处理 mutation）

## 与你当前工作的连接

### 今天就能用的部分

**项目数据获取层全面迁移**（高优先级）：

1. 装 react-query + devtools（30 分钟）
2. 列出你项目里所有 `useEffect + fetch` 模式，按"数据共享度"排优先级：
   - **共享度高**：用户信息、订单列表、库存（多个页面都拿）→ 最先迁
   - **共享度低**：单页面专用数据 → 后迁
3. 第一周迁 5 个最热接口；统一约定 staleTime（建议：高频变化数据 30s，
   稳定数据 5min，几乎不变的数据 Infinity）
4. `useMutation` 替换所有写操作；onSuccess 配 invalidateQueries

**预期收益**：

- 删掉约 40% 的样板 useState/useEffect
- 用户切走再回来的"数据已过期但不知道"问题消失
- 抽奖按钮的乐观更新让产品手感升一档

### 下个月能用的部分

**乐观更新做"立刻反馈"产品体验**：

任何"用户期望点击瞬间看到结果"的交互（抽奖、加购、点赞、即时编辑、协同光标等）
都适合乐观更新。但要小心**回滚的视觉过渡**——不能直接闪一下就回到原状，
要有 toast 提示"网络问题，请重试"。这套交互模式可以变成产品差异化点。

**配合 Suspense（v5 新特性）**：

`useSuspenseQuery` 把 loading 状态从 if-else 抽离，让组件树用 Suspense 边界
统一 fallback。这是 React 19 时代的写法，现在迁移可以一步到位。

### 不要用的部分

- **不要把 TanStack Query 当 Redux 用**。客户端纯 UI 状态（modal 开关、
  抽奖动画 step）继续用 useState 或 zustand，不要塞进 Query
- **不要无脑 staleTime: Infinity**。看起来"省请求"，但用户拿到的可能是几小时前的
  数据。要按数据性质分档
- **不要每个查询都设独立的 cacheTime**。除非有特别理由，跟全局默认走

## 自检问题 + 延伸阅读

**还没回答的（精读源码时回头查）**：

- `Query.fetch` 的"防重入"逻辑里，`#retryer.continueRetry()` 是不是
  会让两个并发 fetch call 共享同一个 promise？追到 `retryer.ts`
- `QueryCache` 用什么数据结构存 Query？是 `Map<queryHash, Query>` 吗？
  失效查询的时候是 O(n) 扫描还是有索引？看 `queryCache.ts`
- React 18 的 `useSyncExternalStore` 在 react-query 里怎么用的？
  看 `useBaseQuery.ts` 里的 subscribe 实现
- `placeholderData` 和 `initialData` 在 state machine 里走的是同一条路吗？
  追到 `query.ts` 的 setOptions 和 getDefaultState
- 长列表场景（数千条数据分页加载），用 useInfiniteQuery 怎么避免重复 fetch？
  看 `infiniteQueryBehavior.ts`

**延伸阅读路径**：

1. `packages/query-core/src/queryCache.ts`（300 行）— 学全局 Map + 通知机制
2. `packages/query-core/src/queryObserver.ts`（500+ 行）— 学 observer 怎么决定
   "我要不要触发 refetch"
3. `packages/react-query/src/useBaseQuery.ts`（200 行）— 学 React 适配器怎么对接 core
4. `packages/query-core/src/retryer.ts`（300 行）— 学"重试 + 取消 + 暂停 + 继续"
   状态机的工程化实现

→ 4 篇读完你能自己实现一个微型 query-core。
