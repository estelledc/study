---
title: "SWR — 同一问题的另一种回答"
description: 把"远程数据该不该重新拉"做成一个全局事件广播，hook 第一、客户端对象消失
sidebar:
  order: 14
  label: "vercel/swr"
---

> Vercel 出品，2.4.1（2026-05），MIT。
> 名字取自 RFC 5861 的 cache 策略 **Stale-While-Revalidate**——
> "先把旧的给你看，同时去后台拉新的"。
>
> 4.3KB gzip，比 TanStack Query 小一个数量级。
> 但同一个问题（远程数据状态管理），它给出了**截然不同的设计回答**。
> 这一篇是这个站点的"对照系列"第一弹。

## 一句话定位

**SWR = 一个 Hook + 一个全局缓存 Map + 一组事件广播器。**
没有 Client 对象、没有 Provider（可选）、没有 Query Observer，
所有状态同步靠 React 18 的 `useSyncExternalStore`。

## Why（为什么是它而不是 TanStack Query）

[TanStack Query 笔记](/study/projects/tanstack-query/) 已经讲过：
"服务端状态是独立物种，不是 Redux 的子集"。这个判断 SWR 也认同。

但**怎么落实这个判断**，两个项目的回答完全相反：

| 维度 | TanStack Query | **SWR** |
|------|----------------|---------|
| 入口 | `new QueryClient()` + `<QueryClientProvider>` | 直接 `useSWR(key, fetcher)` |
| Key | 必须数组 `['orders', userId]` | 字符串 / 数组 / 对象 / 函数都行 |
| 缓存中心 | `Query` 对象 + `fetchStatus` 状态机 | 全局 `Map` + 事件广播 |
| 去重 | Query 对象内部协调 | 全局 `FETCH[key] = [promise, ts]` |
| 失效 | `queryClient.invalidateQueries({...})` | `mutate(key)` 函数式过滤 |
| Bundle | ~13KB gzip 核心 | **~4.3KB gzip** |
| 跨框架 | Vue / Svelte / Solid 都有适配 | 只有 React |

**为什么不只学 TanStack Query**：

不学 SWR 你就只看到一种思路，会以为"服务端状态管理 = QueryClient 模式"。
读完 SWR 你才知道：**同样的问题可以做到 1/3 的代码量**——只要你愿意
牺牲跨框架、牺牲一些显式 API、把 hook 当作一等公民。

判断哪个更合适需要这两种范式都看过。

**为什么不是 react-query 旧版本**：
TanStack Query 之前叫 react-query，现在已经迭代到独立 monorepo。
SWR 是 react-query 时代的同期产品（更早一点），两者的设计差异
**不是"成熟度差异"，是"哲学差异"**。

## 仓库地形

```
swr/
├── _internal/                  ← 共享内部模块
│   └── package.json (line 2)   ← 指向编译产物
├── src/
│   ├── index/                  ← ★ 主 useSWR
│   │   ├── use-swr.ts          ← ★★★ 心脏（860 行）
│   │   ├── serialize.ts        ← key 序列化魔法
│   │   ├── config.ts
│   │   └── index.ts
│   ├── _internal/
│   │   ├── utils/
│   │   │   ├── cache.ts        ← 全局 Map 初始化 + 订阅系统
│   │   │   ├── global-state.ts ← WeakMap<Cache, GlobalState>
│   │   │   ├── hash.ts         ← stableHash（WeakMap 防循环）
│   │   │   ├── mutate.ts       ← internalMutate + 乐观更新
│   │   │   ├── web-preset.ts   ← focus / online 事件监听
│   │   │   └── helper.ts       ← createCacheHelper（scoped getter/setter）
│   │   ├── events.ts           ← 事件常量
│   │   └── types.ts
│   ├── infinite/               ← useSWRInfinite（分页/无限滚动）
│   ├── mutation/               ← useSWRMutation（POST/PUT/DELETE）
│   ├── subscription/           ← useSWRSubscription（WebSocket/SSE）
│   └── immutable/              ← useSWRImmutable（永不刷新）
├── examples/                   ← Next.js / SvelteKit / SSR 等示例
└── e2e/, test/                 ← 测试套件
```

**心脏文件**：`src/index/use-swr.ts`（860 行）—— 一个文件囊括 useSWR 的全部逻辑。
你不会在 10 个文件之间跳转读它。这是 SWR 的设计美学。

## 核心机制 · Layer 3 精读

### 机制 1 · Hook 签名 + Getter 依赖追踪

`useSWR` 的返回值不是普通对象，是一个**带 getter 的对象**。

`src/index/use-swr.ts:122-126`（函数签名）：

```typescript
export const useSWRHandler = <Data = any, Error = any>(
  _key: Key,
  fetcher: Fetcher<Data> | null,
  config: FullConfiguration & SWRConfiguration<Data, Error>
) => {
```

`src/index/use-swr.ts:812-831`（返回值，简化）：

```typescript
const swrResponse: SWRResponse<Data, Error> = {
  mutate: boundMutate,
  get data() {
    stateDependencies.data = true       // ← 标记被读
    return returnedData
  },
  get error() {
    stateDependencies.error = true
    return error
  },
  get isValidating() {
    stateDependencies.isValidating = true
    return isValidating
  },
  get isLoading() {
    stateDependencies.isLoading = true
    return isLoading
  }
}
return swrResponse
```

**为什么用 getter 而不是直接赋值**：

`useSyncExternalStore` 在外部状态改变时会触发组件检查更新。但如果你的组件只读了 `data`，
不关心 `isValidating`，那么 `isValidating: false → true` 不应该让你重渲。

SWR 通过 getter **运行时收集依赖**：每次访问 `.data` 就在 `stateDependencies.data = true`
里打标记。下一次状态改变时，比对的范围只局限在被读过的字段。

→ **这是 MobX 风格的自动依赖追踪**，但只用 7 行代码实现，没有 Proxy / observable / autorun。
是 SWR 性能体感丝滑的核心原因之一。

### 机制 2 · 请求去重 — 全局 Map vs Query Observer

TanStack Query 的去重靠 `Query` 对象内的 `fetchStatus` 状态机协调。
SWR 的回答是：**一个全局 Map 就够了**。

`src/index/use-swr.ts:410`：

```typescript
const shouldStartNewRequest = !FETCH[key] || !opts.dedupe
```

`src/index/use-swr.ts:472-481`：

```typescript
FETCH[key] = [
  currentFetcher(fnArg as DefinitelyTruthy<Key>),
  getTimestamp()    // ← 时间戳，用来防竞态
]
//...
;[newData, startAt] = FETCH[key]    // ← 即使不发新请求，也共享 promise
newData = await newData
```

**这段代码里隐含的设计决策**：

1. `FETCH` 是 `Object.create(null)` 的纯 Map（在 cache.ts 里初始化），
   key 是 hash 后的字符串
2. 值是元组 `[Promise, timestamp]`——**promise 本身就是协调机制**
3. 第二个进来的同 key 调用：直接 `await FETCH[key][0]`，复用上一个的 promise
4. 时间戳用来在 response 回来时判断"是否被新请求顶替"

`src/index/use-swr.ts:493-497`（竞态判断）：

```typescript
if (!FETCH[key] || FETCH[key][1] !== startAt) {
  if (shouldStartNewRequest) {
    if (callbackSafeguard()) {
      getConfig().onDiscarded(key)
    }
  }
```

如果 `startAt` 和 `FETCH[key][1]` 不一致，说明有更新的请求已经发出了，
当前 response 应该被丢弃。**用时间戳代替状态机**，代码量减少一个数量级。

→ TanStack Query 的 `Query` 类有 ~600 行；SWR 等价的去重 + 竞态逻辑约 30 行。

### 机制 3 · 全局事件广播 — Focus / Online 触发器

TanStack Query 给每个 Query 一个 Observer，在 mount 时各自订阅 focus 事件。
SWR 的回答是：**装一个全局监听器，向所有 key 广播**。

`src/_internal/utils/web-preset.ts:29-44`：

```typescript
const initFocus = (callback: () => void) => {
  if (isDocumentDefined) {
    document.addEventListener('visibilitychange', callback)
  }
  onWindowEvent('focus', callback)
  return () => {
    if (isDocumentDefined) {
      document.removeEventListener('visibilitychange', callback)
    }
    offWindowEvent('focus', callback)
  }
}
```

cache 初始化时只装一次（不论你创建了多少个 useSWR hook）。
事件触发后，cache.ts 内的 `revalidateAllKeys` 函数广播给所有注册过的 revalidator。

**这个设计的代价和好处**：

- 好处：内存最小（一个事件回调 vs N 个 observer）；初始化成本最低
- 代价：所有 key 的 revalidate 节流必须共享一个全局 throttle interval
- 折中：每个 hook 内部也有自己的节流（`focusThrottleInterval`，5s 默认），
  防止过度刷新

→ 如果你的应用同时显示 50 个组件、订阅 50 个 query，SWR 这种全局广播
模式比 50 个 observer 各自监听 focus 事件**省一个数量级的内存**。

### 机制 4 · Key 序列化 — 字符串友好的设计

TanStack Query 强制数组 key（`['orders', userId]`），是为了类型推导清晰。
SWR 给出更宽松的设计——string、array、object、function 都行。

`src/_internal/utils/serialize.ts:6-29`（完整函数）：

```typescript
export const serialize = (key: Key): [string, Arguments] => {
  if (isFunction(key)) {
    try {
      key = key()                      // ← 函数 key 立即调用
    } catch (err) {
      // dependencies not ready
      key = ''                          // ← 报错就返回空 key（禁用 fetch）
    }
  }

  const args = key                      // ← 原始 key 透传给 fetcher

  // 序列化为缓存索引
  key =
    typeof key == 'string'
      ? key                             // ← 字符串直接用，不 hash
      : (Array.isArray(key) ? key.length : key)
      ? stableHash(key)                 // ← 非空才 hash
      : ''                              // ← 空数组 / falsy → 禁用 fetch

  return [key, args]
}
```

**`useSWR(null, fetcher)` 为什么能"条件式禁用"**：

看上面这段代码——传 `null` 时，`(Array.isArray(null) ? ... : null)` 是 falsy，
最终 `key = ''`。空 key 在 use-swr.ts 内部会跳过 fetch。

这个 idiom 把 React 的"useSWR 必须无条件调用"和"我有时不想 fetch"
合并到一行：

```typescript
const { data: user } = useSWR(token ? `/api/user/${id}` : null, fetcher)
```

→ 比 TanStack Query 的 `enabled: !!token` 更紧凑，但也更"魔法"。

### 机制 5 · `useSyncExternalStore` 订阅缓存

`src/index/use-swr.ts:279`：

```typescript
const cached = useSyncExternalStore(
  useCallback(
    (callback: () => void) =>
      subscribeCache(
        key,
        (current: State<Data, any>, prev: State<Data, any>) => {
          if (!isEqual(prev, current)) callback()    // ← 深比较优化
        }
      ),
    [cache, key]
  ),
  getSnapshot[0],    // client snapshot
  getSnapshot[1]     // server snapshot（SSR）
)
```

这是 React 18 之后做"外部状态 → React"同步的标准接口。
SWR 的依赖只有 `use-sync-external-store` 一个（package.json 显示），
也就是说 React 17 也能跑（用 shim 模拟）。

**和 zustand 的关系**（[zustand 笔记](/study/projects/zustand/)）：
zustand 也是用同一个 hook 订阅外部 store。
**SWR 把"远程数据"当作一种特殊的外部 store**——这正是 zustand 设计的延伸。

### 机制 6 · 乐观更新 — 时间戳 + 备份字段

`src/_internal/utils/mutate.ts:128-150`（节选）：

```typescript
const beforeMutationTs = getTimestamp()
MUTATION[key] = [beforeMutationTs, 0]     // ← 标记变异开始

const displayedData = state.data
const currentData = state._c              // ← _c 字段：备份提交过的数据
const committedData = isUndefined(currentData) ? displayedData : currentData

if (hasOptimisticData) {
  optimisticData = isFunction(optimisticData)
    ? optimisticData(committedData, displayedData)
    : optimisticData
  set({ data: optimisticData, _c: committedData })   // ← 立即显示乐观值
}

// 异步执行变异
data = await (data as Promise<Data>).catch(err => {
  error = err
  isError = true
})

// 竞态：如果有新的 mutation 已经开始，丢弃当前结果
if (beforeMutationTs !== MUTATION[key][0]) {
  if (isError) throw error
  return data
} else if (isError && hasOptimisticData && rollbackOnError(error)) {
  set({ data: committedData, _c: UNDEFINED })   // ← 失败回滚到备份
}
```

**`_c` 字段的设计妙处**：

它不在 React 组件内当 state，而是**塞进缓存对象本身**。这样：

- 任何同 key 的 hook 都能看到这个备份
- mutate 可以跨组件影响（"先乐观更新，失败时所有订阅同 key 的组件都回滚"）
- 不污染组件树

这是"缓存即真相，组件只是订阅者"哲学的一致延伸。

## 横向对比

### vs TanStack Query — 同一问题的两种回答

我已经在 Why 部分给过一张表，这里展开**思路上的差异**：

**抽象层级的选择不同**：

- TanStack Query 把 Query 抽象成对象（`new Query()`），有 lifecycle、events、observers
- SWR 把 Query 抽象成"key 在缓存里的一个 entry"，没有对象，没有 lifecycle

→ 前者更像 OOP，后者更像 FP。

**生态野心不同**：

- TanStack Query 想做"跨框架的服务端状态层"——React/Vue/Svelte/Solid 都有适配
- SWR 只服务 React，专注做小

→ 前者是 toolbox，后者是 specialty tool。

**API 取舍不同**：

- TanStack Query：`useQuery({ queryKey: [...], queryFn: ... })` 配置式
- SWR：`useSWR(key, fetcher, config?)` 位置参数

→ 前者表达力强，后者上手更快。

### vs 自己写 useEffect + useState

最朴素的"远程数据获取"是：

```typescript
const [data, setData] = useState(null)
useEffect(() => {
  fetch(url).then(r => r.json()).then(setData)
}, [url])
```

这种写法的问题（前面 [TanStack Query 笔记](/study/projects/tanstack-query/) 已讲过）：
没有缓存、没有去重、tab 切回不刷新、组件卸载不取消、错误状态没人管。

SWR 解决了这些，**多一个依赖（4.3KB）**。

### vs Apollo Client / urql（GraphQL 系）

GraphQL 客户端通常自己实现了 cache + dedupe，且
缓存粒度到 entity 级别（不是 query 级别）。

SWR 是 query 级别的缓存——`mutate('/api/user/123')` 失效一个 key，
不会影响 `/api/user/124`。GraphQL 客户端可以做到"更新 user 实体，
所有引用它的 query 自动更新"。

→ SWR 简单，但表达力上限更低。如果你的数据高度规范化，
Apollo / urql 的 entity cache 是真需要的。

## Hands-on（30 分钟内能跑）

```bash
git clone --depth 1 https://github.com/vercel/swr.git swr
cd swr/examples/basic-typescript
pnpm install
pnpm dev
```

打开 `pages/index.tsx`，最小代码长这样（[源链接](https://github.com/vercel/swr/blob/main/examples/basic-typescript/pages/index.tsx)）：

```typescript
import useSWR from 'swr'
import fetch from '../libs/fetch'

export default function HomePage() {
  const { data } = useSWR<string[]>('/api/data', fetch)
  const { data: data2 } = useSWR(null, fetch)    // ← null key 禁用 fetch

  return (
    <div>
      <h1>Trending Projects</h1>
      {data2}
      <div>
        {data
          ? data.map(project => <p key={project}>{project}</p>)
          : 'loading...'}
      </div>
    </div>
  )
}
```

### 改一处的实验（必做）

打开浏览器 DevTools 的 Network 面板，做以下三件事：

1. **观察 dedupe**：在另一个组件里也写 `useSWR('/api/data', fetcher)`，
   切换路由让两个组件同时挂载。Network 里应该**只有一次请求**。
2. **观察 focus revalidate**：切到别的 tab 等 5 秒以上再回来，
   Network 会自动多一次请求。把 `revalidateOnFocus: false` 加到 SWRConfig 里看变化。
3. **改 dedupingInterval**：默认 2000ms。改成 100ms，再次同时挂载两个 hook，
   观察 Network 是不是出现两次请求（因为 dedupe 窗口太短了）。

第三个实验**必做**——它会让你彻底搞懂"为什么 dedupe 不是无限期的"以及
"竞态防护和 dedupe 的关系"。

## 与你工作的连接

**能立刻迁移**：

- "全局事件广播 + scoped 订阅"模式可以用在任何"状态共享 + 选择性通知"场景
- 时间戳防竞态比状态机便宜得多——遇到 async 问题先想想能不能用 ts
- Getter 依赖追踪：要做"细粒度订阅但不想引入 MobX"时这个 7 行实现是范本

**下个月可能用到**：

- 如果你在做 dashboard / 后台管理，本身访问压力大、组件多，
  可以认真比一下 SWR vs TanStack Query 的内存差异
- SSR 场景（Next.js）SWR 的 `fallback` API 比 TQ 的 `dehydrate / hydrate` 更直接

**不要用 SWR 的部分**：

- 不要用 SWR 做客户端状态（用 zustand 或 React state）
- 不要用 SWR 做 GraphQL（用 Apollo / urql / Relay）
- 不要用 SWR 做 WebSocket 长连接的复杂 reducer 逻辑（用 zustand + RxJS 更合适）

## 读完你能做之前做不了的事

- **判断**："这个 `useEffect + useState + useRef` 的请求逻辑能不能换成 useSWR"——
  你能扫一眼就知道，因为你知道 SWR 提供了什么、不提供什么
- **设计**：你给团队选库时，能用"我们要不要跨框架"和"我们的数据规范化程度"
  这两个维度做选择，而不是"哪个 star 多"
- **解释**：被问到"useSyncExternalStore 是什么"时你能用 SWR 当例子
- **下钻**：看懂任何"全局事件 + scoped 订阅"模式的代码（包括 zustand、jotai、valtio）
- **对照**：能在自己写的 hook 里识别"我这是不是在重新造轮子，是不是 SWR / TanStack Query 已经替我想过了"

## 自检 · 5 个问题

1. `src/index/use-swr.ts:472-481` 里 `FETCH[key] = [promise, timestamp]`
   元组的 timestamp，到底防的是什么场景的竞态？画个 req1/req2 的时序图。
2. `src/index/use-swr.ts:812-831` 的 getter 设计能不能换成普通对象 `return {data, error, ...}`？
   如果不能，会有什么具体的性能问题？
3. `src/_internal/utils/serialize.ts:6-29` 里函数 key 的 try/catch 处理是为了什么场景？
   能想到一个**没有这个 try/catch 就会崩溃的真实例子**吗？
4. SWR 的 `mutate(key)` 是全局函数；TanStack Query 的 `queryClient.invalidateQueries`
   是 client 实例方法。哪种设计在 monorepo + 多 entrypoint 的应用里更容易出 bug？
5. `src/_internal/utils/mutate.ts` 里的 `_c` 字段（备份提交过的数据），
   为什么不放在 React state 里而要塞进缓存对象？

## 延伸阅读

读完 `use-swr.ts` 后下一步：

1. `src/_internal/utils/mutate.ts`（180+ 行）—— 看完整的乐观更新 + 回滚 + 多 key 失效
2. `src/_internal/utils/hash.ts`（76 行）—— `stableHash` 用 WeakMap 防循环引用，可作为
   通用 hash 函数的范例
3. `src/infinite/index.ts` —— 看 SWR 如何用 middleware 模式扩展，对比 TanStack
   `useInfiniteQuery` 的专门 hook 设计
4. RFC 5861（[原文](https://datatracker.ietf.org/doc/html/rfc5861)）—— 知道 stale-while-revalidate
   不是 SWR 发明的，HTTP 协议层已经有这个 cache directive

---

**笔记完成**：2026-05-27（v2.4.1）
**研究方法**：本地克隆 + Explore 子代理深读 + 对照 [TanStack Query 笔记](/study/projects/tanstack-query/)
**心脏文件**：`src/index/use-swr.ts`（860 行）
