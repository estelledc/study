---
title: SWR — React 远程数据 hook 的极简流派
来源: 'https://github.com/vercel/swr'
日期: 2026-05-30
分类: 前端
难度: 初级
---

## 是什么

SWR 是一个 **React hook 库**，专门管"远程数据怎么拉、怎么缓存、什么时候重拉"。日常类比：像冰箱里的便当——你打开冰箱（render 组件），它先把昨天剩的递给你看（**stale**），同时悄悄热一份新的（**revalidate**），等热好了换上来。这就是名字 SWR 的由来：Stale-While-Revalidate，一个 HTTP 缓存策略（RFC 5861）。

你写：

```tsx
const { data, error, isLoading } = useSWR('/api/user/1', fetcher)
```

这一行做了五件事：发请求 / 缓存结果 / 同 key 去重 / tab 切回时自动重拉 / 组件卸载时取消订阅。整个库约 **4.3KB gzip**，体积大约是 TanStack Query（约十几 KB）的三分之一。

## 为什么重要

不理解 SWR，下面这些事都没法解释：

- 为什么 React 里"远程数据"不能靠 `useEffect + setState` 解决（缓存、去重、tab 切回都得自己写）
- 为什么 SWR 约 4KB 就够用，而 TanStack Query 要十多 KB——同一个问题两种哲学差在哪
- 为什么 SWR 没有 `<Provider>` 包裹也能跑——全局 cache 是怎么"凭空"出现的
- 为什么 `useSWRInfinite` 不是新 hook 而是一个 middleware——middleware 链是怎么把 hook 嵌套起来的

## 核心要点

SWR 的设计可以拆成 **三件事**：

1. **一个全局 Map 当 cache**：所有 useSWR 共享一张 `Map<key, value>`，没有 QueryClient 对象。类比：办公室共用的白板，谁都能贴便签谁都能看。

2. **一组事件广播器**：focus / online / 手动 mutate 三种事件，全局监听一次，向所有订阅的 key 广播。类比：消防警报响一次，每个房间自己决定要不要疏散。

3. **middleware = (useSWRNext) => useSWR**：扩展点是函数组合而不是配置项。`useSWRInfinite` / `useSWRImmutable` 都是 middleware 装饰出来的，不是 fork。

三件事加起来叫 **hook 第一**——客户端对象（QueryClient / Observer）全部消失，状态同步靠 React 18 的 `useSyncExternalStore`。

## 实践案例

### 案例 1：两个组件共享同一个 key 自动去重

```tsx
function UserCard({ id }) {
  const { data } = useSWR(`/api/user/${id}`, fetcher)
  return <div>{data?.name}</div>
}

function UserBadge({ id }) {
  const { data } = useSWR(`/api/user/${id}`, fetcher)
  return <span>@{data?.login}</span>
}

function Profile({ id }) {
  return <>
    <UserCard id={id} />
    <UserBadge id={id} />
  </>
}
```

**逐部分解释**：

- `UserCard` 和 `UserBadge` 同时挂载，都调 `useSWR('/api/user/42', fetcher)`——**同一个 key**
- 同一帧内 SWR 发现该 key 已有 in-flight 请求，**只发一次**网络请求
- 拿到数据后广播给所有订阅该 key 的组件——卡片和徽章一起更新

这就是"dedupe"：不同 key（如 `/1` 与 `/2`）仍会各打一次；同 key 才合并。不必自己写 `if (loading) return` 防抖。

### 案例 2：tab 切走再回来自动刷新

```tsx
const { data } = useSWR('/api/dashboard', fetcher, {
  revalidateOnFocus: true, // 默认就是 true
  focusThrottleInterval: 5000,
})
```

切到别的 tab 看一眼微信，5 秒后回来——SWR 自动多发一次请求拿最新数据。原理：`web-preset` 里挂了**全局** `visibilitychange` 监听器，一次广播给所有 key，每个 hook 自己决定要不要响应。把 `revalidateOnFocus` 设成 `false` 就关掉。

### 案例 3：写一个 logger middleware

```tsx
const logger = (useSWRNext) => (key, fetcher, config) => {
  const wrapped = async (...args) => {
    const t0 = performance.now()
    const data = await fetcher(...args)
    console.log(`[SWR] ${key} ${(performance.now() - t0).toFixed(1)}ms`)
    return data
  }
  return useSWRNext(key, wrapped, config)
}

<SWRConfig value={{ use: [logger] }}>
  <App />
</SWRConfig>
```

middleware 自己**就是一个 hook**——里面可以调 `useEffect / useRef`。这是 SWR 心脏文件能保持小巧的关键：扩展不靠加配置项，靠**函数组合**。

## 踩过的坑

1. **key 不稳定会重复拉取**：传对象 `useSWR({ id: 1 })` 时每次 render 都是新对象，hash 不同 SWR 以为是新 key——要么用字符串 `` `/api/user/${id}` ``，要么用稳定引用。

2. **fetcher 抛非 Error 对象时 `error.message` 是 undefined**：SWR 把 reject 值原样塞进 error 字段，`throw 'oops'` 时 `error?.message` 取不到——抛 `new Error('oops')` 实例。

3. **`mutate(key, newData)` 默认会再请求一次**：你已经知道新值还多一次网络请求，乐观更新场景是浪费——传 `mutate(key, newData, { revalidate: false })`。

4. **SWRConfig 的 fetcher 不强制**：每个 useSWR 都要自己传，大型应用容易忘——最外层包一个 `<SWRConfig value={{ fetcher: globalFetcher }}>` 全局兜底。

## 适用 vs 不适用场景

**适用**：
- 中小型 React 应用的远程数据（列表 / 详情 / dashboard）
- 想要 4KB 极简、不想学 QueryClient 那套对象模型
- 用 Next.js / Vercel 全家桶——SWR 和 SSR `fallback` 集成得很自然
- 想给 hook 加日志 / 重试 / 缓存包装——middleware 模式很顺手

**不适用**：
- GraphQL 高度规范化数据 → 用 Apollo / urql 的 entity cache
- 跨框架统一（Vue / Svelte / Solid 都要支持）→ 用 TanStack Query
- 客户端状态管理（表单、UI state）→ 用 zustand / [[react-hook-form]]
- 复杂分页 + 无限滚动的状态机 → useSWRInfinite 能写但 TQ 的 useInfiniteQuery 表达力更强

## 历史小故事（可跳过）

- **2019 年**：Vercel 团队（作者 Shu Ding）从 Next.js 衍生出 SWR，定位"小、Hook-only、专做 React"。
- **2020 年**：react-query（后改名 TanStack Query）正式 1.0，走相反路线——QueryClient + Observer 的 OOP 风格。两个库同期存在，业界开始分流。
- **2022 年**：React 18 上线 `useSyncExternalStore`，SWR 切到这个新接口，订阅模型变得更标准（之前自己 hack subscription）。
- **2024 年**：SWR 2.x 稳定版，加 `useSWRMutation` / `useSWRSubscription` 把 POST 和 WebSocket 也拉进同一个心智模型。

## 学到什么

- "服务端状态是独立物种"这个判断 SWR 和 TanStack Query 都认同，但**怎么落实**走相反路线——一个 FP / 一个 OOP
- bundle size 不是越小越好，是**和你的复杂度匹配**——SWR 4KB 服务的是"中等复杂度"区间
- middleware = `(useSWRNext) => useSWR` 是个漂亮的 trick：扩展不靠配置项，靠函数组合
- 全局事件广播 + 局部节流，是"内存最省 + 体感够好"的折中——前提是订阅数不超过几百

## 延伸阅读

- 官方文档：[swr.vercel.app](https://swr.vercel.app)（中文版有，新人入门首选）
- 视频：[Shu Ding — SWR Internals](https://www.youtube.com/results?search_query=swr+internals+shu+ding)（作者讲设计哲学）
- 对比文：[SWR vs TanStack Query](https://tkdodo.eu/blog/react-query-vs-swr)（TQ 维护者写，立场偏 TQ 但很公允）
- RFC 5861：[Stale-While-Revalidate](https://datatracker.ietf.org/doc/html/rfc5861)（HTTP cache directive，SWR 名字的源头）
- [[tanstack-query]] —— SWR 的同期对手，OOP 风格

## 关联

- [[tanstack-query]] —— 同一问题的 OOP 回答，QueryClient + Observer 的对照组
- [[react]] —— SWR 的宿主框架，依赖 React 18 useSyncExternalStore
- [[zustand]] —— 客户端状态库，和 SWR 共用同一个 React 18 订阅接口
- [[preact]] —— SWR 也支持 Preact（兼容层最薄的 React 替代）
- [[react-hook-form]] —— 表单状态用它，远程数据用 SWR，互不干涉
- [[tanstack-router]] —— 路由级别的 loader 与 SWR 配合得很好
- [[tanstack-form]] —— 表单库的 TanStack 系，可与 SWR 同栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[preact]] —— Preact — 3KB React 替代
- [[react]] —— React UI 组件库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[tanstack-form]] —— TanStack Form — 跨框架共享一份表单校验逻辑
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[zustand]] —— Zustand — 极简 React 状态管理

