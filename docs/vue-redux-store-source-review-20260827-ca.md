# Vue / Redux store source review

> 用途：记录 Pinia、Redux Toolkit 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：ca
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、SSR、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Pinia

- canonical source：`https://github.com/vuejs/pinia`
- revision：`5d6ac5b86491041aa83a663a9a31189c707aff08`
- package：`pinia@4.0.3`
- inspected：
  - `packages/pinia/package.json`
  - `packages/pinia/src/createPinia.ts`
  - `packages/pinia/src/store.ts`
  - `packages/pinia/src/rootStore.ts`
  - `packages/pinia/src/storeToRefs.ts`
  - `packages/pinia/src/index.ts`
  - `packages/pinia/__tests__/ssr.spec.ts`
- observed：
  - `createPinia()` allocates an `effectScope(true)`, a root `ref<Record<string, StateTree>>`, a plugin list, and a `Map` of live stores;
  - `install` calls `setActivePinia`, `app.provide(piniaSymbol)`, and assigns `app.config.globalProperties.$pinia`; plugins queued by `use()` before install are flushed then;
  - `defineStore(id, setup | options)` is lazy: the first `useStore()` creates the store and caches it in `pinia._s`;
  - options stores compile into a setup that writes `state()` into `pinia.state.value[id]`, wraps getters as `computed`, and passes actions through;
  - setup stores treat returned refs / reactive objects as state (synced onto the root tree) and wrap functions for `$onAction`; `skipHydrate` opts an object out of SSR hydration;
  - `$patch` accepts a mutator or a partial object, pauses `$subscribe` watchers, merges with `mergeReactiveObjects` (Map/Set aware), then manually triggers subscriptions;
  - `$reset` is implemented only for options stores; setup stores throw in development and are a no-op in production;
  - `storeToRefs` keeps refs / reactive / computed and ignores methods;
  - peer range at this revision is `vue@^3.5.11`; `@vue/devtools-api@^8.1.5` is a required peer; `typescript>=5.6.0` is optional; `nostics` is an inlined dependency.
- provenance note：
  - npm `pinia@4.0.3` does not expose `gitHead`;
  - GitHub annotated tag `v4.0.3` peels to commit `5d6ac5b86491041aa83a663a9a31189c707aff08`, whose `packages/pinia/package.json` reports `4.0.3`;
  - this review binds the peeled tag commit.

## Redux Toolkit

- canonical source：`https://github.com/reduxjs/redux-toolkit`
- revision：`576a02f8056fbee2dcaddb4d2e4d2da3b7937c58`
- package：`@reduxjs/toolkit@2.12.0`
- inspected：
  - `packages/toolkit/package.json`
  - `packages/toolkit/src/index.ts`
  - `packages/toolkit/src/configureStore.ts`
  - `packages/toolkit/src/getDefaultMiddleware.ts`
  - `packages/toolkit/src/getDefaultEnhancers.ts`
  - `packages/toolkit/src/createSlice.ts`
  - `packages/toolkit/src/createReducer.ts`
  - `packages/toolkit/src/createAsyncThunk.ts`
  - `packages/toolkit/src/query/createApi.ts`
- observed：
  - `configureStore` builds a root reducer (`combineReducers` when given a map), requires `middleware` / `enhancers` to be callbacks if supplied, defaults `devTools` and `duplicateMiddlewareCheck` to true, then `createStore`s with composed enhancers;
  - `getDefaultMiddleware` always includes `redux-thunk` unless disabled; non-production additionally prepends action-creator and immutable checks and appends the serializable check;
  - `getDefaultEnhancers` includes the middleware enhancer plus `autoBatchEnhancer` (`autoBatch` defaults true);
  - `createSlice` namespaces actions as `name/reducerName`, wraps case reducers with Immer via `createReducer`, and rejects object-form `extraReducers` in non-production;
  - `createAsyncThunk` emits `pending` / `fulfilled` / `rejected`, owns an `AbortController`, honors `condition` and an external `signal`, and serializes thrown values with `miniSerializeError` (`name` / `message` / `stack` / `code`);
  - RTK Query lives on `@reduxjs/toolkit/query`; `createApi` defaults `reducerPath` to `'api'` and requires a unique path per API instance;
  - runtime dependencies are `redux@^5.0.1`, `immer@^11.0.0`, `redux-thunk@^3.1.0`, `reselect@^5.1.0`, plus Standard Schema packages; `react` and `react-redux` are optional peers.
- provenance note：
  - npm `@reduxjs/toolkit@2.12.0` reports `gitHead=576a02f8056fbee2dcaddb4d2e4d2da3b7937c58`;
  - GitHub annotated tag `v2.12.0` peels to the same commit, whose `packages/toolkit/package.json` reports `2.12.0`;
  - tag object and npm `gitHead` agree; this review binds that commit.
