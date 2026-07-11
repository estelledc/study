---
title: TanStack Query — 数据获取与缓存库
来源: https://github.com/TanStack/query
日期: 2026-05-29
分类: 数据获取
难度: 中级
---

## 是什么

TanStack Query 是一个**让前端组件不用自己写 fetch + loading + error + 缓存逻辑**的库。一个 `useQuery(key, fn)` 把"组件挂载就 fetch、卸载就取消、缓存命中直接给、过期就重新拉"全包了。

日常类比：

- **以前**：每个组件自己开冰箱拿菜——拉数据、记 loading、记 error、unmount 取消、过期重拉，全部自己写一遍
- **现在**：有个共享冰箱（query cache）。打开就有；没了自动补；多个人要同一道菜只跑一次

你写：

```jsx
const { data, isLoading } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
})
```

挂载、取消、缓存、重拉这一长串行为全在这一个 hook 里。

## 为什么重要

不用 TanStack Query 也能写代码，但下面这几件事会反复掉坑：

- 大量 React 项目用它**替代 Redux / MobX 处理服务器状态**——服务器数据本来不归你 own，硬塞进 Redux 反人类
- TanStack 系（query / table / router / form）跨框架（React / Vue / Solid / Svelte / Angular）**一套 API 几乎不变**——学一次到处用
- 自带 dedup（同 key 只发一次）/ 缓存失效 / 后台 revalidate / 离线支持 / 乐观更新——这些功能自己写一遍要几千行
- 自带 Devtools——缓存里有什么、谁在 fetching、谁过期了，可视化看到

## 核心要点

记住三个概念，其它都是它们的衍生：

1. **Query Key**：数据的唯一身份。`['todos']` / `['user', userId]`。同一个 key 同时被多个组件用 = 共享同一份数据 + 只发一次请求。

2. **staleTime / gcTime**：staleTime 控制"过期了没"——过期就在下次 mount / focus 时重新拉；gcTime 控制"没人订阅多久后扔掉"。默认 `staleTime: 0`（每次挂载都重拉），`gcTime: 5min`。

3. **Mutation + invalidate**：写操作（POST / PUT / DELETE）走 `useMutation`，写完 `invalidateQueries(['todos'])` 让相关 query 自动重拉——这就是"加完 todo，列表自动刷新"。

## 实践案例

### 案例 1：最简 useQuery

```jsx
function TodoList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['todos'],     // ← 数据身份
    queryFn: fetchTodos,     // ← 没货时去哪买
  })
  if (isLoading) return <Spinner />
  if (error) return <Error msg={error.message} />
  return <List items={data} />
}
```

把 `queryKey` 想成冰箱里的标签，`queryFn` 是"没货时去哪进货"。10 个组件用 `['todos']` 这个 key 只会发一次请求——其余组件直接共享。

### 案例 2：依赖参数 + enabled

```jsx
function UserProfile({ userId }) {
  const { data: user } = useQuery({
    queryKey: ['user', userId],            // userId 变 → 不同 query
    queryFn: () => fetchUser(userId),
    enabled: !!userId,                     // userId 还没拿到时不发请求
  })
  return user ? <Card user={user} /> : null
}
```

两个细节：

- `queryKey` 数组里带 `userId`——切换用户会自动拉新数据，旧数据留在 cache 里下次切回来直接用
- `enabled: false` 期间这个 hook 完全不跑，等条件满足后再触发——做"等 A 拿到 ID 再拉 B"的依赖式查询

### 案例 3：Mutation + 自动刷新列表

```jsx
function AddTodo() {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: addTodo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })   // 标过期 + 让订阅者重拉
    },
  })
  return <button onClick={() => mut.mutate({ title: '买菜' })}>加</button>
}
```

`invalidateQueries` 不是"立刻拉"，而是"标过期 + 让正在订阅这条 key 的 observer 立刻重拉"。没人订阅的 query 只标记，下次有人订阅时再触发。

## 踩过的坑

1. **queryKey 数组顺序敏感**：`['user', 1]` 和 `[1, 'user']` 是**两个不同的 key**——内部 hash 用 `JSON.stringify` 加 sort object 内的字段，但**数组元素顺序不动**，写错顺序两个组件各拉一次。

2. **staleTime 默认 0**：每次组件挂载都重新拉一次。开发期看起来"正常"，但用户切走再切回来你就看到一堆重复请求。**把全局默认设成至少 30s** 是几乎所有项目第一步：

   ```jsx
   new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
   ```

3. **v5 的 Suspense 模式 hooks 名字不一样**：用 `useSuspenseQuery` 不是 `useQuery({ suspense: true })`——v4 的旧写法在 v5 里被删了。迁移老项目读 changelog。

4. **Optimistic update 失败要手动回滚**：你在 `onMutate` 里改了 cache 让 UI 立刻变，请求失败时 `onError` 必须手动 `setQueryData` 还原——没自动备份。要么自己 snapshot 旧值，要么用 `onMutate` 返回值传给 `onError`。

## 适用 vs 不适用场景

**适用**：

- 任何"前端从后端拉数据"的场景——REST / GraphQL / RPC 都行（queryFn 只要返回 Promise）
- 写操作多、需要"立刻反馈 + 失败回滚"的产品（电商加购、点赞、即时编辑）
- 多个页面共享同一份数据（订单列表 + 侧栏 Badge + Header 计数都看 `['orders']`）
- 跨框架：React / Vue / Solid / Svelte / Angular core 同一套，迁移技术栈不重学

**不适用**：

- **纯客户端状态**（modal 开关、表单 draft、动画 step）→ 用 useState / zustand
- **WebSocket / SSE 实时流** → 用专门的 socket 库，再 `setQueryData` 把数据写进 cache 桥接
- **强 GraphQL normalized cache 联动**（改一个 user 自动联动所有引用） → Apollo / urql 在那个领域更专业
- 单页一次性的简单 fetch 也能用，但杀鸡用牛刀；老项目可以渐进式迁移

## 历史小故事（可跳过）

- **2019–2020 年**：Tanner Linsley 抽出 react-query（GitHub 约 2019-09，v1 约 2020-02）。当时 React 生态常用 Redux / Saga 管服务器数据，他提出"服务器状态和客户端状态是两种不同物种"
- **2022 年 7 月**：随 v4 改名 TanStack Query，monorepo + 跨框架——Vue / Solid / Svelte 共用 query-core
- **2023 年 10 月**：v5.0.0 发布，引入 `useSuspenseQuery`、`cacheTime`→`gcTime` 等；之后才陆续有 `staleTime: 'static'` 等增强，深度配合 React 18+

核心 insight 是"前端状态分两种"——一旦你心里区分客户端状态（自己 own）和服务器状态（远端 own 的副本），代码会自然分裂成两套工具。

## 学到什么

1. **服务器状态需要单独的引擎管**——它有缓存键、TTL、订阅、重拉、取消，硬塞进 Redux / useState 等于反复造轮子
2. **同 key 共享、写后失效**是这套设计的两大支柱：去重靠 hash key，扇出靠 invalidate
3. **抽象层级**：Query（一条数据） → QueryCache（所有 Query 的 Map） → QueryClient（顶层 facade） → QueryObserver（一个 useQuery 调用）。从下到上拆开看复杂度立刻下降
4. **跨框架架构**：把核心引擎写成 framework-agnostic 的 query-core，每个框架写薄适配器——这是工具库做大做久的标准姿势

## 延伸阅读

- 官方文档：[TanStack Query Docs](https://tanstack.com/query/latest)（example 完整、有交互 demo）
- 博客：[TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query)（核心维护者写的，讲"为什么这样设计"）
- 源码精读：`packages/query-core/src/query.ts`（一个数据条目的状态机）/ `queryCache.ts`（去重 + 订阅总线）/ `queryObserver.ts`（要不要 refetch 的决策）
- [[react-hooks]] —— useQuery 是个 hook，理解 hook 心智模型是基础
- [[swr]] —— 同领域 Vercel 的方案，更轻量但 mutation 弱

## 关联

- [[react-hooks]] —— 基础设施，useQuery 就是个 custom hook
- [[swr]] —— 同领域竞品，对照看 trade-off
- [[redux]] —— 客户端状态管理；TanStack Query 不是替代 Redux，而是把服务端状态从 Redux 拿走
- [[graphql]] —— Apollo 在 GraphQL 场景对应这一层

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
