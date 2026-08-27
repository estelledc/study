---
title: Redux Toolkit — 把 Redux 收成 configureStore 与 createSlice
description: 官方 Redux 默认写法：configureStore、createSlice 与 Immer
来源: https://github.com/reduxjs/redux-toolkit
日期: 2026-08-27
分类: 状态管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/reduxjs/redux-toolkit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 576a02f8056fbee2dcaddb4d2e4d2da3b7937c58
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.12.0
---

## 是什么

Redux Toolkit（npm 名 `@reduxjs/toolkit`，常缩写 **RTK**）是 Redux 官方的**默认写法**：用 `configureStore` 搭好中间件和 DevTools，用 `createSlice` 一次生成 action 与 Immer 包装过的 reducer。日常类比：以前 Redux 像自己开银行——印支票（action type）、雇柜员（reducer）、装监控（DevTools）全手写；Toolkit 是开户套餐，这些默认已经装好。

```ts
import { configureStore, createSlice } from '@reduxjs/toolkit'

const counter = createSlice({
  name: 'counter',
  initialState: { n: 0 },
  reducers: {
    inc(state) { state.n++ },
  },
})

const store = configureStore({ reducer: { counter: counter.reducer } })
store.dispatch(counter.actions.inc())
```

`state.n++` 看起来像突变，固定 2.12.0 里真正跑的是 Immer：`createReducer` 用 `createNextState` 把 draft 收成下一份不可变 state。核心不强制 React；`react` / `react-redux` 是可选 peer。

## 为什么重要

不理解 Toolkit 在 Redux 5 上的默认合同，下面这些事会写错：

- 为什么现在新项目几乎没人手写 `switch (action.type)`，但 store 仍是「dispatch 进、纯函数出」
- 为什么 `middleware` 必须写成 `(getDefaultMiddleware) => …`，不能丢一个数组进去
- 为什么 Date / Map / 函数进 state 会在开发构建被 serializable 中间件骂
- 为什么 RTK Query 要走 `@reduxjs/toolkit/query`，并且第二个 API 必须换 `reducerPath`

一句话：RTK 没有取消 Redux，它把样板收成默认值，并把 Immer、thunk、reselect 焊进同一条安装面。

## 核心要点

固定 2.12.0 的主链：

1. **`configureStore` 是对 `createStore` 的封装**：`reducer` 是函数就当根 reducer，是普通对象就 `combineReducers`。`devTools` 默认 true（非生产开 stack trace）。`middleware` / `enhancers` 若传入必须是回调；开发构建还会默认做重复中间件引用检查。

2. **默认中间件与 enhancer**：`getDefaultMiddleware` 默认装 `redux-thunk`；非生产再前置 action-creator / immutable 检查，后置 serializable 检查。`getDefaultEnhancers` 默认是「中间件 enhancer + `autoBatchEnhancer`」（`autoBatch` 默认 true）。

3. **`createSlice` 生成一类本地 action**：类型名为 `name/reducerName`。`reducers` 可以是对象，也可以是 `(creators) => ({…})` 的回调。`extraReducers` 只接受 builder 回调；对象写法在非生产直接抛错。reducer 本身惰性构建，第一次收到 action 才 `createReducer`。

4. **异步与查询是另两段合同**：`createAsyncThunk(typePrefix, payloadCreator)` 发出 `pending` / `fulfilled` / `rejected`，自带 `AbortController`，可 `condition` 短路，可接外部 `signal`；抛出的错误默认被 `miniSerializeError` 收成 `{name,message,stack,code}`。RTK Query 的 `createApi` 在 `@reduxjs/toolkit/query`，默认 `reducerPath: 'api'`，同一应用里多个 API 必须换路径。

运行时依赖写在 package 上：`redux@^5.0.1`、`immer@^11.0.0`、`redux-thunk@^3.1.0`、`reselect@^5.1.0`，以及 Standard Schema 包。

## 实践示例

### 案例 1：slice + configureStore

```ts
const todos = createSlice({
  name: 'todos',
  initialState: [] as { text: string; done: boolean }[],
  reducers: {
    add(state, action: { payload: string }) {
      state.push({ text: action.payload, done: false })
    },
  },
})

const store = configureStore({ reducer: { todos: todos.reducer } })
store.dispatch(todos.actions.add('write note'))
```

**逐部分**：`name` 决定 action type 前缀（这里是 `todos/add`）；case reducer 拿到的是 Immer draft；忘了把 `todos.reducer` 挂进 `configureStore`，dispatch 不会改到任何 state。

### 案例 2：createAsyncThunk 的三态

```ts
const fetchUser = createAsyncThunk('user/fetch', async (id: string, api) => {
  const res = await fetch(`/users/${id}`, { signal: api.signal })
  if (!res.ok) return api.rejectWithValue(await res.text())
  return res.json()
})
```

**逐部分**：返回值走 `fulfilled`；`rejectWithValue` 走 `rejected` 且 `meta.rejectedWithValue === true`；`api.signal` 接到内部 AbortController，外部再传入 `signal` 也会转成同一次 abort。

### 案例 3：extraReducers 只能用 builder

```ts
createSlice({
  name: 'user',
  initialState: { name: '', status: 'idle' as 'idle' | 'loading' },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchUser.pending, (state) => { state.status = 'loading' })
  },
})
```

**逐部分**：固定源码在非生产对 `typeof extraReducers === 'object'` 抛错。旧的 `{ [fetchUser.pending]: … }` 映射已经不是合法合同。

## 踩过的坑

1. **`middleware: [logger]` 不是合法写法**：必须 `middleware: (gDM) => gDM().concat(logger)`。enhancer 同样要回调。
2. **开发构建的 serializable / immutable 检查**：Date、Map、class 实例、非 FSA action 会报警或抛错。生产默认不装这两条，问题会换个时间出现。
3. **Immer 不能「改完再 return 另一份」**：case reducer 要么 mutate draft，要么 return 新值，混用是 Immer 的经典翻车。
4. **`miniSerializeError` 很瘦**：只有 `name` / `message` / `stack` / `code` 四条字符串。自定义字段要自己 `rejectWithValue` 或换 `serializeError`。
5. **第二个 `createApi` 忘了换 `reducerPath`**：默认都叫 `api`，后挂上的会和先挂上的抢同一段 state。

## 适用 vs 不适用场景

**适用**：

- React 或非 React 都要用「单一不可变 store + 时间旅行」的应用
- 已有 Redux，想丢掉手写 action type 和 `switch`
- 异步流程要 pending/fulfilled/rejected 三态，或要用 RTK Query 做缓存
- 需要 DevTools、thunk、`combineSlices` / `injectInto` 做按需注入

**不适用**：

- Vue 组件里只想 `store.count++`：固定合同更接近 [[pinia]]，不必为了「也是商店」硬接 RTK
- 状态几乎全是服务端缓存：TanStack Query / RTK Query 二选一即可，不要两套再加一份 slice
- 想把非序列化句柄（socket、class）长期放进 store：默认中间件会挡，也违反 Redux 可重放前提
- 只要几百字节、不要 Provider：Zustand 更贴那条线

## 固定版本边界

- 本文绑定 `reduxjs/redux-toolkit@576a02f8...`，即 tag `v2.12.0` 与 npm `@reduxjs/toolkit@2.12.0` 的 `gitHead`，三者指向同一提交。
- `packages/toolkit/package.json` 版本为 `2.12.0`。子路径导出：`.`、`./react`、`./query`、`./query/react`。
- 依赖：`redux@^5.0.1`、`immer@^11.0.0`、`redux-thunk@^3.1.0`、`reselect@^5.1.0`、`@standard-schema/spec` / `utils`。
- peer：`react` `^16.9 || ^17 || ^18 || ^19`、`react-redux` `^7.2.1 || ^8.1.3 || ^9`，均为 optional。
- `createReducer` / `createSlice.extraReducers` 的对象记法已删除；`autoBatch` 默认开启。本文未跑上游测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认值也是 API**：中间件、DevTools、auto-batch 不写不等于没有
2. **Immer 让「看起来可变」和「store 不可变」同时成立**，但混用 mutate/return 会立刻破功
3. **异步被收成三条 action**，取消和 condition 是一等公民，不是事后补的 abort 旗
4. **查询缓存是另一条安装面**：`createApi` 不在主入口，路径和 `reducerPath` 都要单独认

## 应用型自测

1. `configureStore({ middleware: [thunk] })` 在这个版本合法吗？
2. `createSlice` 的 `extraReducers: { [other.pending]: fn }` 还会被接受吗？
3. `createAsyncThunk` 抛出的 `Error` 默认会保留自定义的 `statusCode` 字段吗？

检查点：

1. 不合法。`middleware` 必须是接收 `getDefaultMiddleware` 的回调。
2. 不会。非生产对对象形式直接抛错，只能用 builder。
3. 不会。`miniSerializeError` 只拷贝 `name` / `message` / `stack` / `code`。

## 延伸阅读

- 官方文档：[redux-toolkit.js.org](https://redux-toolkit.js.org)
- 固定源码：[reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit) —— 本文绑定提交 `576a02f8056fbee2dcaddb4d2e4d2da3b7937c58`
- [[pinia]] —— Vue 侧对照：直接改响应式对象，没有 action type
- Immer 11 —— `createReducer` / `createSlice` 的 draft 来源
- TanStack Query —— 与 RTK Query 同赛道的请求缓存

## 关联

- [[pinia]] —— 同主题 Vue 官方商店，更新模型相反
- React —— 常见宿主；peer 可选，核心并不 import React
- Immer 11 —— case reducer 的可变写法由它翻译成拷贝
- Zustand —— 更短的 React 商店，没有默认中间件套餐
- TanStack Query —— 服务端状态；不要和 slice 抢同一份缓存

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
