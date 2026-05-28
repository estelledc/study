---
title: "SWR — 同一问题的另一种回答"
description: 把"远程数据该不该重新拉"做成一个全局事件广播，hook 第一、客户端对象消失
sidebar:
  order: 14
  label: "vercel/swr"
---

> Vercel 出品，2.4.1（2026-05），MIT，~21k★。
> 名字取自 RFC 5861 的 cache 策略 **Stale-While-Revalidate**——
> "先把旧的给你看，同时去后台拉新的"。
>
> 4.3KB gzip，比 TanStack Query 小一个数量级。
> 但同一个问题（远程数据状态管理），它给出了**截然不同的设计回答**。
> 这一篇按 [状元篇 Checklist v1.1 分支 B（工具库）](/study/method/#分支-b-工具库v1-默认结构不变) 升级。

## Layer 0 · 身份扫描

| 项 | 值 |
|---|---|
| 仓库 | [vercel/swr](https://github.com/vercel/swr) |
| 心脏文件 | `src/index/use-swr.ts`（860 行） |
| 当前 commit | [`e384af7`](https://github.com/vercel/swr/commit/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be)（2026-05 抓取） |
| Star / fork | ~21k / ~880 |
| 主语言 | TypeScript（>97%） |
| Bundle | ~4.3KB gzip 核心，only `use-sync-external-store` 一个 runtime dep |
| 类型 | **工具库（v1.1 分支 B）** — small-surface API，单一职责，~3000 行核心 |
| 维护方 | Vercel 团队 + 社区，活跃维护（最近一次 release 在 5 周内） |

判定为分支 B 的理由：心脏物是一个 hook + 一个 cache + 一个事件广播器，而不是一个产品 / 一个 pipeline / 一个 framework abstraction。
心脏文件 2-3 个就交代完整设计哲学，符合工具库底线（行数 400 / figure 1 / permalink 3 / 怀疑 3）。

## Layer 1 · 一句话定位 + Why

**SWR = 一个 Hook + 一个全局缓存 Map + 一组事件广播器。**
没有 Client 对象、没有 Provider（可选）、没有 Query Observer，
所有状态同步靠 React 18 的 `useSyncExternalStore`。

### 它如果不存在，世界会缺少什么？

会缺少**"hook 是一等公民"这条思路在服务端状态管理领域的样板间**。

[TanStack Query 笔记](/study/projects/tanstack-query/) 已经讲过：
"服务端状态是独立物种，不是 Redux 的子集"。这个判断 SWR 也认同。

但**怎么落实这个判断**，两个项目的回答完全相反——见 Layer 5 横向对比图（figure 01）。

**为什么不只学 TanStack Query**：
不学 SWR 你就只看到一种思路，会以为"服务端状态管理 = QueryClient 模式"。
读完 SWR 你才知道：**同样的问题可以做到 1/3 的代码量**——只要你愿意
牺牲跨框架、牺牲一些显式 API、把 hook 当作一等公民。

判断哪个更合适需要这两种范式都看过。

**为什么不是 react-query 旧版本**：
TanStack Query 之前叫 react-query，现在已经迭代到独立 monorepo。
SWR 是 react-query 时代的同期产品（更早一点），两者的设计差异
**不是"成熟度差异"，是"哲学差异"**。

## Layer 2 · 仓库地形

```
swr/
├── _internal/                  ← 共享内部模块
│   └── package.json (line 2)   ← 指向编译产物
├── src/
│   ├── index/                  ← ★ 主 useSWR
│   │   ├── use-swr.ts          ← ★★★ 心脏（860 行）
│   │   ├── serialize.ts        ← key 序列化（29 行整个文件）
│   │   ├── config.ts
│   │   └── index.ts
│   ├── _internal/
│   │   ├── utils/
│   │   │   ├── cache.ts          ← ★★ 全局 Map 初始化 + 订阅系统（142 行）
│   │   │   ├── global-state.ts   ← WeakMap<Cache, GlobalState>
│   │   │   ├── hash.ts           ← stableHash（WeakMap 防循环）
│   │   │   ├── mutate.ts         ← internalMutate + 乐观更新（219 行）
│   │   │   ├── web-preset.ts     ← ★★ focus / online 事件监听（69 行）
│   │   │   ├── with-middleware.ts← middleware 包装（27 行）
│   │   │   ├── resolve-args.ts   ← middleware 链组装（29 行）
│   │   │   └── helper.ts         ← createCacheHelper（scoped getter/setter）
│   │   ├── events.ts             ← FOCUS_EVENT / RECONNECT_EVENT / MUTATE_EVENT 等
│   │   └── types.ts              ← Middleware / Cache / GlobalState 类型
│   ├── infinite/                 ← useSWRInfinite（分页/无限滚动，middleware 实现）
│   ├── mutation/                 ← useSWRMutation（POST/PUT/DELETE）
│   ├── subscription/             ← useSWRSubscription（WebSocket/SSE）
│   └── immutable/                ← useSWRImmutable（永不刷新，middleware 实现）
├── examples/                     ← Next.js / SvelteKit / SSR 等示例
└── e2e/, test/                   ← 测试套件
```

**心脏文件清单（工具库底线 ≥ 2，本篇 3 个）**：

1. `src/index/use-swr.ts`（860 行）—— useSWR 全部逻辑塞一个文件，是 SWR 的设计美学
2. `src/_internal/utils/cache.ts`（142 行）—— 全局 cache 初始化 + 订阅 + revalidator 桥
3. `src/_internal/utils/web-preset.ts`（69 行）—— focus / online 事件源头，整个项目就这一处装监听器

**为什么不是 mutate.ts 进心脏**：mutate 是消费 cache 的下游，不是定义模型的地方——
看懂前 3 个文件后 mutate.ts 是顺势就懂的派生品。

**commit 热点**（git log --oneline 最近 50 条扫一眼）：use-swr.ts 改动最频繁（多为 React 18 适配），
cache.ts 和 web-preset.ts 极稳定（半年级别只 1-2 次小改）—— 这正符合"心脏在外围、热点在内部"的稳定库特征。

## Layer 3 · 核心机制精读（≥ 3 段，每段 30+ 行 TS + ≥ 5 旁注 + 1 怀疑）

### 段 1 · cache + 订阅模型 — vs TanStack Query 的 QueryObserver

TanStack Query 给每个 mounted query 一个 **QueryObserver** 对象，里面有 lifecycle、events、subscriber 列表。
SWR 的回答是：**没有 Observer 对象，subscribe 就是往一个 array 里 push 一个 callback。**

[`src/_internal/utils/cache.ts:39-90`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/cache.ts#L39-L90)（核心订阅 + setter 逻辑）：

```typescript
if (!SWRGlobalState.has(provider)) {
  const opts = mergeObjects(defaultConfigOptions, options)

  // 1️⃣ 一个全局 revalidator 字典，key 字符串 → revalidate callback 数组
  const EVENT_REVALIDATORS = Object.create(null)

  const mutate = internalMutate.bind(UNDEFINED, provider) as ScopedMutator
  let unmount = noop

  // 2️⃣ subscriptions 也是 string → callback[] 的纯字典
  //    Object.create(null) 而不是 {}，避开 prototype pollution
  const subscriptions: Record<string, ((current: any, prev: any) => void)[]> =
    Object.create(null)

  const subscribe = (
    key: string,
    callback: (current: any, prev: any) => void
  ) => {
    const subs = subscriptions[key] || []
    subscriptions[key] = subs

    subs.push(callback)
    return () => {
      const index = subs.indexOf(callback)
      if (index >= 0) {
        // 3️⃣ O(1) 移除：和最后一个换位再 pop——经典数组无序删除
        //    React 高频 mount/unmount 下这个细节决定 GC 压力
        subs[index] = subs[subs.length - 1]
        subs.pop()
      }
    }
  }

  const setter = (key: string, value: any, prev: any) => {
    provider.set(key, value)        // 4️⃣ 先写 cache（provider 默认是 Map）
    const subs = subscriptions[key]
    if (subs) {
      for (const fn of subs) {       // 5️⃣ 然后同步广播给所有订阅者
        fn(value, prev)              //    没有 microtask、没有批处理——值变就推
      }
    }
  }
```

**5 条旁注**：

1. **`Object.create(null)` 不是装饰**——SWR 的 cache key 是用户传进来的字符串，
   如果用 `{}` 当 dict，用户传 `'__proto__'` 当 key 就能注入。这是工具库的基础卫生。
2. **subscribe 返回 unsubscribe**——这是符合 `useSyncExternalStore` 接口约定的最小实现，
   不需要 Observer 对象的 `removeListener / off / dispose` 三套 API。
3. **swap-and-pop 删除**比 `splice(i, 1)` 快，且不在乎顺序——
   订阅者之间无依赖时这是最佳选择。如果哪天 SWR 想搞"按订阅顺序广播"，这一行就要重写。
4. **setter 同步广播**——这是 SWR 体感丝滑的来源，但也是它和 React 18 concurrent 的张力点：
   同步推送过快会导致 React 在一帧内多次 batch，依赖 `useSyncExternalStore` 自己的合并逻辑。
5. **`mergeObjects(defaultConfigOptions, options)`** 把 web-preset 的默认 focus/reconnect 监听
   和用户自定义合并——下文段 2 会展开。

**怀疑 1**：subscribe 用纯数组 + linear `indexOf` 删除，订阅同 key 的组件 ≥ 100 时
是否会成为 hot path？官方 issue 没看到投诉，但理论上 `subs.indexOf(callback)` 是 O(N) ——
我倾向相信 React 应用里"同 key 订阅 100 个组件"是病态场景（你应该 lift state up 而不是叠订阅），
所以 SWR 故意没优化。但这是个值得跑 benchmark 的问题，**我没自己跑过，留作下钻**。

→ TanStack Query 的 [`QueryObserver` 类](https://github.com/TanStack/query/blob/main/packages/query-core/src/queryObserver.ts) 有 ~600 行；
SWR 等价的订阅 + 广播逻辑约 30 行，因为 SWR 把"observer 的状态"压缩到了"被订阅的 callback 自己 closure 里"。

### 段 2 · revalidate 触发器 — focus / interval / mutation 三条线

TanStack Query 给每个 Query 一个 Observer，在 mount 时各自订阅 focus 事件。
SWR 的回答是：**装一个全局监听器，向所有 key 广播。**

[`src/_internal/utils/web-preset.ts:29-59`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/web-preset.ts#L29-L59)（focus + reconnect 全局监听器）：

```typescript
const initFocus = (callback: () => void) => {
  // focus revalidate
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

const initReconnect = (callback: () => void) => {
  // revalidate on reconnected
  const onOnline = () => {
    online = true
    callback()
  }
  // nothing to revalidate, just update the status
  const onOffline = () => {
    online = false
  }
  onWindowEvent('online', onOnline)
  onWindowEvent('offline', onOffline)
  return () => {
    offWindowEvent('online', onOnline)
    offWindowEvent('offline', onOffline)
  }
}

export const defaultConfigOptions: ProviderConfiguration = {
  initFocus,
  initReconnect
}
```

cache 初始化时只装一次（不论你创建了多少个 useSWR hook），见
[`cache.ts:97-116`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/cache.ts#L97-L116)：

```typescript
if (!IS_SERVER) {
  // 关键：用 setTimeout 延一个 tick，让 React 的 state update 先跑完
  // 否则会触发 https://github.com/vercel/swr/issues/1680 的 bug
  const releaseFocus = opts.initFocus(
    setTimeout.bind(
      UNDEFINED,
      revalidateAllKeys.bind(
        UNDEFINED,
        EVENT_REVALIDATORS,
        revalidateEvents.FOCUS_EVENT
      )
    )
  )
  const releaseReconnect = opts.initReconnect(
    setTimeout.bind(
      UNDEFINED,
      revalidateAllKeys.bind(
        UNDEFINED,
        EVENT_REVALIDATORS,
        revalidateEvents.RECONNECT_EVENT
      )
    )
  )
  unmount = () => {
    releaseFocus && releaseFocus()
    releaseReconnect && releaseReconnect()
    SWRGlobalState.delete(provider)
  }
}
```

事件触发后，hook 内部装的 `onRevalidate` 函数响应——
[`use-swr.ts:660-689`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/index/use-swr.ts#L660-L689)：

```typescript
const onRevalidate = (
  type: RevalidateEvent,
  opts: { retryCount?: number; dedupe?: boolean } = {}
) => {
  if (type == revalidateEvents.FOCUS_EVENT) {
    const now = Date.now()
    if (
      getConfig().revalidateOnFocus &&
      now > nextFocusRevalidatedAt &&
      isActive()
    ) {
      // 每个 hook 内自己的节流，默认 5s
      nextFocusRevalidatedAt = now + getConfig().focusThrottleInterval
      softRevalidate()
    }
  } else if (type == revalidateEvents.RECONNECT_EVENT) {
    if (getConfig().revalidateOnReconnect && isActive()) {
      softRevalidate()
    }
  } else if (type == revalidateEvents.MUTATE_EVENT) {
    return revalidate()
  } else if (type == revalidateEvents.ERROR_REVALIDATE_EVENT) {
    return revalidate(opts)
  }
  return
}
```

interval 触发器在 [`use-swr.ts:726-767`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/index/use-swr.ts#L726-L767)（refreshInterval polling）。

**5 条旁注**：

1. **三条触发线归一到一个 `onRevalidate(type)` 分发**——switch by event type 是事件总线最朴素的实现，
   但比给每个事件源装一个独立 callback 数组省不少代码。
2. **focus 节流是 hook 局部状态**（`nextFocusRevalidatedAt` 是 closure 变量），不是全局。
   这意味着同一时刻 focus 事件会被 cache.ts 广播到所有 key，但**每个 key 自己决定要不要响应**。
3. **`setTimeout.bind(UNDEFINED, fn)`** 这种 bind 模式在 SWR 里到处用——
   等价于 `() => setTimeout(fn, 0)`，但 bind 比箭头函数生成的闭包略省内存。
   是工具库典型的"省字节就是省体感"思路。
4. **`isActive()`** 同时检查 `isVisible() && isOnline()`——
   tab 隐藏的组件就算装了 `revalidateOnFocus` 也不会瞎拉。
5. **mutate 走 `MUTATE_EVENT`** 而不是直接调 hook——
   保证手动 invalidate 也走同一条事件总线，方便测试和调试（所有 revalidate 都能在一个分发函数里打断点）。

**怀疑 2**：全局事件广播给"所有 key"看上去很浪费——
50 个 key 同 focus 事件触发 50 次 `onRevalidate` 检查。我**怀疑** SWR 没对此优化的理由是
"hook 自己的早退检查（`revalidateOnFocus / isActive / throttle`）已经足够便宜"。
但如果你的应用同时挂载 1000+ 个 useSWR，这条假设可能不成立。**没在大规模应用上验过，标记 TODO**。

→ 好处：内存最小（一个事件回调 vs N 个 observer）；初始化成本最低
→ 代价：所有 key 共享一个全局监听器实例（不能"只让 user-related 的 key 在 focus 时刷新"）
→ 折中：每个 hook 内部也有自己的节流（`focusThrottleInterval`，5s 默认）

### 段 3 · global config + middleware 链 — 把 hook 当函数来组合

TanStack Query 的扩展点是配置项（`onSuccess`、`onError`、`select`、`refetchInterval` 等）。
SWR 的扩展点是 **middleware**——一个函数，接受 `useSWRNext` 返回新的 `useSWRNext`。
这是 Redux middleware / Express middleware 思路在 hook 层的复刻。

middleware 的"包装"实现 [`src/_internal/utils/with-middleware.ts:11-27`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/with-middleware.ts#L11-L27)：

```typescript
// Create a custom hook with a middleware
export const withMiddleware = (
  useSWR: SWRHook,
  middleware: Middleware
): SWRHook => {
  return <Data = any, Error = any>(
    ...args:
      | [Key]
      | [Key, Fetcher<Data> | null]
      | [Key, SWRConfiguration | undefined]
      | [Key, Fetcher<Data> | null, SWRConfiguration | undefined]
  ) => {
    const [key, fn, config] = normalize(args)
    const uses = (config.use || []).concat(middleware)
    return useSWR<Data, Error>(key, fn, { ...config, use: uses })
  }
}
```

middleware 链的"组装"在 [`src/_internal/utils/resolve-args.ts:8-29`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/resolve-args.ts#L8-L29)：

```typescript
export const withArgs = <SWRType>(hook: any) => {
  return function useSWRArgs(...args: any) {
    // 1️⃣ 拿 SWRConfig context 里的默认配置
    const fallbackConfig = useSWRConfig()

    // 2️⃣ 把 (key, fn, config) 三种调用形态归一
    const [key, fn, _config] = normalize<any, any>(args)

    // 3️⃣ 合并 context 配置 + 本地配置
    const config = mergeConfigs(fallbackConfig, _config)

    // 4️⃣ middleware 链组装：把 use[] 数组一层层包到 hook 外面
    let next = hook
    const { use } = config
    const middleware = (use || []).concat(BUILT_IN_MIDDLEWARE)
    for (let i = middleware.length; i--; ) {
      next = middleware[i](next)
    }

    // 5️⃣ 调用最外层包装后的 hook
    return next(key, fn || config.fetcher || null, config)
  } as unknown as SWRType
}
```

useSWRInfinite / useSWRImmutable 都是 middleware 实现的（不是 fork），证据见
[`src/immutable/index.ts`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/immutable/index.ts)。

**5 条旁注**：

1. **`for (let i = middleware.length; i--; )` 倒序循环包装**——
   等价于 `middleware.reduceRight((next, m) => m(next), hook)`。
   倒序是为了保证调用顺序：用户传 `[a, b]` 时执行顺序是 a → b → 真正的 useSWR。
2. **`BUILT_IN_MIDDLEWARE`** 默认含 preload middleware（用 React 18 cache 提前 warmup）。
   用户配置的 middleware 永远在 built-in 之前执行——这是 SWR 团队"内置永远兜底"的约定。
3. **middleware 不是 plugin**——它**就是一个 hook**，签名 `(useSWRNext) => useSWR`。
   这意味着 middleware 内部可以调任何 React hook（useEffect / useState），
   不像 Redux middleware 那样被限制在 store 层。
4. **`useSWRConfig()` 提供 React Context 形式的全局配置**——
   `<SWRConfig value={{ revalidateOnFocus: false, fetcher }}>` 可以包住整个子树。
   这是 SWR 唯一接近"Provider 模式"的地方，但**不是必须**（不裹也能跑）。
5. **`mergeConfigs(fallbackConfig, _config)`**——本地配置优先，context 兜底。
   这是 React 配置传递的标准模式，但 SWR 的实现里 `use[]` 是**追加**而不是覆盖（注意上面 `withMiddleware` 里的 `concat`）。

**怀疑 3**：middleware 链是"hook 嵌套 hook"，每层都创建自己的 closure 和 state。
对 React 的 `useState` / `useEffect` 调用顺序有要求——如果某个 middleware 里写了条件 hook 调用，
整条链会崩。我**怀疑** SWR 没在 middleware 类型签名里强制约束这个，仅靠文档警告。
扫了 types.ts 256-280 确认：`Middleware = (useSWRNext: SWRHook) => SWRHook`，纯类型，没运行时校验。
**这是工具库典型的"约定优于配置"取舍**——表面优雅，但 middleware 作者要懂 React hook 规则。

→ middleware 模式让 useSWRInfinite / useSWRMutation / useSWRImmutable **不是新 hook**，
而是**装饰器**——这是 SWR 心脏文件能保持 860 行不爆炸的关键工程决策。

## Layer 4 · 改一处的实验（必做）

### 实验 A：30 分钟跑通 + 观察基础行为

```bash
git clone --depth 1 https://github.com/vercel/swr.git swr
cd swr/examples/basic-typescript
pnpm install
pnpm dev
```

打开浏览器 DevTools 的 Network 面板，做以下三件事：

1. **观察 dedupe**：在另一个组件里也写 `useSWR('/api/data', fetcher)`，
   切换路由让两个组件同时挂载。Network 里应该**只有一次请求**。
2. **观察 focus revalidate**：切到别的 tab 等 5 秒以上再回来，
   Network 会自动多一次请求。把 `revalidateOnFocus: false` 加到 SWRConfig 里看变化。
3. **改 dedupingInterval**：默认 2000ms。改成 100ms，再次同时挂载两个 hook，
   观察 Network 是不是出现两次请求（因为 dedupe 窗口太短了）。

### 实验 B：写一个 custom logger middleware（30 分钟）

新建 `src/swr-logger.ts`：

```typescript
import type { Middleware, SWRHook } from 'swr'
import { useEffect, useRef } from 'react'

// 一个 middleware = 一个 (useSWRNext) => useSWR
export const loggerMiddleware: Middleware = (useSWRNext: SWRHook) => {
  return (key, fetcher, config) => {
    // 1. 把 fetcher 用一个 wrapper 包起来，记录每次请求耗时
    const wrappedFetcher = fetcher
      ? async (...args: any[]) => {
          const t0 = performance.now()
          console.log(`[SWR] → ${String(key)}`)
          try {
            const data = await fetcher(...args)
            const dt = (performance.now() - t0).toFixed(1)
            console.log(`[SWR] ✓ ${String(key)} ${dt}ms`)
            return data
          } catch (err) {
            const dt = (performance.now() - t0).toFixed(1)
            console.warn(`[SWR] ✗ ${String(key)} ${dt}ms`, err)
            throw err
          }
        }
      : fetcher

    // 2. 调底层 useSWR，注入包装后的 fetcher
    const result = useSWRNext(key, wrappedFetcher, config)

    // 3. 用 effect 跟踪 data / error 变化
    const prevDataRef = useRef(result.data)
    useEffect(() => {
      if (prevDataRef.current !== result.data) {
        console.log(`[SWR] data changed for ${String(key)}`)
        prevDataRef.current = result.data
      }
    }, [result.data, key])

    return result
  }
}
```

用法：

```tsx
import useSWR, { SWRConfig } from 'swr'
import { loggerMiddleware } from './swr-logger'

<SWRConfig value={{ use: [loggerMiddleware] }}>
  <App />
</SWRConfig>
```

打开 console，你会看到：

```
[SWR] → /api/user/1
[SWR] ✓ /api/user/1 124.3ms
[SWR] data changed for /api/user/1
```

**这个实验为什么必做**：

它强迫你触碰段 3 讲过的"middleware 是一个 hook"——你写的那个 wrapper 函数
会被 SWR 在每次组件 render 时调用，里面的 useRef / useEffect 都按 React 规则运行。
**不亲手写一遍，永远体感不到这层的设计漂亮在哪里**。

第三个实验**必做**——它会让你彻底搞懂"middleware 不是 hook 外的中间人，是 hook 自己"。

## Layer 5 · 横向对比

![SWR vs TanStack Query — 同一问题的两种哲学](/projects/swr/01-swr-vs-tanstack-query.webp)

### vs TanStack Query — 同一问题的两种回答

我已经在 figure 01 里给过表，这里展开**思路上的差异**：

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

**扩展机制不同**：

- TanStack Query：通过配置项扩展（`select` / `placeholderData` / `structuralSharing`）
- SWR：通过 middleware 扩展（一个 hook 包另一个 hook）

→ 前者声明式，后者函数组合式。前者上手 5 分钟、深用 5 周；后者上手 1 天、深用 5 天。

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

### vs zustand（[zustand 笔记](/study/projects/zustand/)）

zustand 是客户端状态库，但和 SWR 同样依赖 `useSyncExternalStore`：
**两者其实是"同一个 React 18 接口的两种应用"**。

- zustand：客户端状态 → 外部 store → useSyncExternalStore 订阅
- SWR：远程数据 → 全局 cache → useSyncExternalStore 订阅

→ SWR 把"远程数据"当作一种特殊的"外部 store"，这正是 zustand 设计的延伸。
读过 zustand 再读 SWR 你会觉得 cache.ts 几乎是似曾相识。

## Layer 6 · 与你工作的连接

**能立刻迁移**：

- "全局事件广播 + scoped 订阅"模式可以用在任何"状态共享 + 选择性通知"场景
- 时间戳防竞态比状态机便宜得多——遇到 async 问题先想想能不能用 ts
- Getter 依赖追踪：要做"细粒度订阅但不想引入 MobX"时这个 7 行实现是范本
- middleware 链：任何"想加日志 / 重试 / 缓存包装"的 hook 都能用同一招

**下个月可能用到**：

- 如果你在做 dashboard / 后台管理，本身访问压力大、组件多，
  可以认真比一下 SWR vs TanStack Query 的内存差异
- SSR 场景（Next.js）SWR 的 `fallback` API 比 TQ 的 `dehydrate / hydrate` 更直接
- 想给团队的自定义 hook 加可观察性时，loggerMiddleware 模式直接复用

**不要用 SWR 的部分**：

- 不要用 SWR 做客户端状态（用 zustand 或 React state）
- 不要用 SWR 做 GraphQL（用 Apollo / urql / Relay）
- 不要用 SWR 做 WebSocket 长连接的复杂 reducer 逻辑（用 zustand + RxJS 更合适）

## Layer 7 · 自检 · 5 个问题（自己能答上才算读完）

1. [`src/index/use-swr.ts:472-481`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/index/use-swr.ts#L472-L481) 里 `FETCH[key] = [promise, timestamp]`
   元组的 timestamp，到底防的是什么场景的竞态？画个 req1/req2 的时序图。
2. [`src/index/use-swr.ts:812-831`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/index/use-swr.ts#L812-L831) 的 getter 设计能不能换成普通对象 `return {data, error, ...}`？
   如果不能，会有什么具体的性能问题？
3. [`src/_internal/utils/serialize.ts`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/serialize.ts) 里函数 key 的 try/catch 处理是为了什么场景？
   能想到一个**没有这个 try/catch 就会崩溃的真实例子**吗？
4. SWR 的 `mutate(key)` 是全局函数；TanStack Query 的 `queryClient.invalidateQueries`
   是 client 实例方法。哪种设计在 monorepo + 多 entrypoint 的应用里更容易出 bug？
5. middleware 链是"hook 嵌套 hook"，如果某个 middleware 内部写了条件 useState
   会发生什么？为什么 SWR 不用类型签名禁止这种写法？

## 限制段（不要假装它什么都好）

- **只有 React**——Vue / Svelte 用户看不上，这是写在 README 第一行的取舍
- **middleware 缺乏 Redux 那样的中间件标准**——社区 middleware 数量远少于 Redux 生态
- **缓存粒度是 query 而非 entity**——高度规范化数据上 Apollo 是更对的工具
- **没有 DevTools**（社区有 [swr-devtools](https://github.com/koba04/swr-devtools)，但不是官方），
  TanStack Query 的 React Query Devtools 是事实标准

## 宣传 vs 现实附录

| 宣传 | 现实 |
|------|------|
| "4.3KB gzip 比 TQ 小一个数量级" | 真，是去重逻辑塞 30 行 vs 600 行带来的 |
| "无 Provider"（Zero-config） | 半真——`<SWRConfig>` 不强制，但中大型应用基本都会包一个 |
| "stale-while-revalidate 是 SWR 发明的" | 假——RFC 5861 已有，HTTP cache directive 层就有这个名字 |
| "比 useEffect + fetch 简单" | 真——在"轻请求"场景；复杂 mutation 流程仍需 useSWRMutation 学一套 |

## 延伸阅读

读完 `use-swr.ts` 后下一步：

1. [`src/_internal/utils/mutate.ts`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/mutate.ts)（219 行）—— 看完整的乐观更新 + 回滚 + 多 key 失效
2. [`src/_internal/utils/hash.ts`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/_internal/utils/hash.ts)（76 行）—— `stableHash` 用 WeakMap 防循环引用，可作为
   通用 hash 函数的范例
3. [`src/infinite/index.ts`](https://github.com/vercel/swr/blob/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be/src/infinite/index.ts) —— 看 SWR 如何用 middleware 模式扩展，对比 TanStack
   `useInfiniteQuery` 的专门 hook 设计
4. RFC 5861（[原文](https://datatracker.ietf.org/doc/html/rfc5861)）—— 知道 stale-while-revalidate
   不是 SWR 发明的，HTTP 协议层已经有这个 cache directive

---

**笔记完成**：2026-05-28（v2.4.1，按 v1.1 分支 B 工具库 checklist 升级）
**研究方法**：本地克隆 [`e384af7`](https://github.com/vercel/swr/commit/e384af7f0d3e8620e4ec10c5b7c2b0e9bb9466be) + Read 心脏 3 文件 + 对照 [TanStack Query 笔记](/study/projects/tanstack-query/) + figure 01 PIL 渲染
**心脏文件**：`src/index/use-swr.ts`（860 行） / `src/_internal/utils/cache.ts`（142 行） / `src/_internal/utils/web-preset.ts`（69 行）
**通过 v1.1 分支 B 底线**：行数 ≥ 400 ✓ / figure ≥ 1 ✓ / GitHub permalink ≥ 3 ✓ / 显式怀疑 ≥ 3 ✓
