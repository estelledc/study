# Client data-fetch source review B

> 用途：记录 TanStack Query、SWR 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer B
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- forbidden overlap：未修改 zustand、jotai、react-hook-form、tanstack-form、mcp-ts-sdk、ollama、aichat、shell-gpt

## TanStack Query

- canonical source：`https://github.com/TanStack/query`
- revision：`714df67ab11c6e16666e4282dfec8654175591f7`
- release tag：`release-2026-08-26-1836`
- packages：`@tanstack/query-core@5.102.6`、`@tanstack/react-query@5.102.6`
- inspected：
  - `packages/query-core/package.json`
  - `packages/query-core/src/queryClient.ts`
  - `packages/query-core/src/queryCache.ts`
  - `packages/query-core/src/query.ts`
  - `packages/query-core/src/queryObserver.ts`
  - `packages/query-core/src/mutation.ts`
  - `packages/query-core/src/retryer.ts`
  - `packages/query-core/src/utils.ts`
  - `packages/query-core/src/removable.ts`
  - `packages/query-core/src/types.ts`
  - `packages/query-core/src/focusManager.ts`
  - `packages/react-query/package.json`
  - `packages/react-query/src/useQuery.ts`
  - `packages/react-query/src/useBaseQuery.ts`
  - `packages/react-query/src/useSuspenseQuery.ts`
  - `packages/react-query/src/useMutation.ts`
  - `packages/react-query/src/QueryClientProvider.tsx`
- observed：
  - `QueryCache` stores `Query` objects in a `Map` keyed by `queryHash`;
  - default `hashKey` is `JSON.stringify` with object keys sorted, array order preserved;
  - `QueryClient.defaultQueryOptions` merges client defaults, per-key defaults and call options, then computes the hash;
  - `QueryObserver` decides mount/focus/reconnect fetch using `staleTime` (documented default `0`; `'static'` never stale);
  - `Query.fetch` reuses the in-flight `retryer.promise` unless `cancelRefetch` replaces it;
  - client query retry defaults to 3 with `min(1000 * 2 ** failureCount, 30000)`; mutation retry defaults to 0;
  - `invalidateQueries` marks `isInvalidated` then `refetchQueries` with `type` defaulting to `active`, unless `refetchType: 'none'`;
  - `gcTime` defaults to 5 minutes in the browser and `Infinity` on the server; GC waits for zero observers and idle fetch;
  - `onMutate` return value is stored as mutation `context` and passed to later callbacks; cache snapshots are not automatic;
  - React adapter requires `QueryClientProvider` unless a client is passed in; `useSuspenseQuery` is a separate hook;
  - `QueryClientProvider` mounts the client, which subscribes `focusManager` (`window.visibilitychange`) and `onlineManager`;
  - same release also publishes `@tanstack/svelte-query@6.1.46` while React/Vue/Solid remain `5.102.6`.
- provenance：
  - GitHub annotated tag `release-2026-08-26-1836` checks out commit `714df67ab11c6e16666e4282dfec8654175591f7`;
  - package.json versions at that commit match npm `@tanstack/query-core@5.102.6` and `@tanstack/react-query@5.102.6`;
  - npm metadata for these packages does not expose a comparable `gitHead` field.

## SWR

- canonical source：`https://github.com/vercel/swr`
- revision：`7173e55b2a175dee455612c5fa067383345c392f`
- release tag / package：`v2.5.1` / `swr@2.5.1`
- inspected：
  - `package.json`
  - `src/index/use-swr.ts`
  - `src/index/index.ts`
  - `src/_internal/utils/config.ts`
  - `src/_internal/utils/cache.ts`
  - `src/_internal/utils/serialize.ts`
  - `src/_internal/utils/hash.ts`
  - `src/_internal/utils/mutate.ts`
  - `src/_internal/utils/resolve-args.ts`
  - `src/_internal/utils/with-middleware.ts`
  - `src/_internal/utils/web-preset.ts`
  - `src/_internal/utils/global-state.ts`
  - `src/_internal/utils/middleware-preset.ts`
  - `src/_internal/events.ts`
  - `src/mutation/index.ts`
  - `src/infinite/index.ts`
  - `src/immutable/index.ts`
  - `src/subscription/index.ts`
- observed：
  - default cache is a module-level `Map`; `SWRGlobalState` is a `WeakMap<Cache, GlobalState>` holding revalidators, in-flight FETCH/PRELOAD, mutate and subscribe;
  - `serialize` keeps string keys; arrays/plain objects go through `stableHash` (content hash, object keys sorted);
  - `useSWR` reads cache via `use-sync-external-store/shim`;
  - in-flight requests are stored as `FETCH[key] = [promise, timestamp]` and cleaned after `dedupingInterval` (default 2000 ms);
  - default config: `revalidateOnFocus/revalidateOnReconnect/revalidateIfStale/shouldRetryOnError` true, `focusThrottleInterval` 5000, `errorRetryInterval` 5000 or 10000 on slow connection;
  - `initCache` registers `document.visibilitychange` plus `window` focus, and online/offline; `revalidateAllKeys` invokes only the first revalidator per key;
  - middleware is `(config.use || []).concat(BUILT_IN_MIDDLEWARE)` composed right-to-left; `useSWRImmutable` / `useSWRInfinite` / `useSWRMutation` are middleware wrappers;
  - `internalMutate` defaults `revalidate` to true unless `revalidate: false`; `populateCache` defaults true, while `useSWRMutation` sets `populateCache: false`;
  - rejected fetcher values are stored as `error` without wrapping;
  - compare uses `dequal/lite`;
  - a `SWRConfig` provider is optional because the default Map cache exists at module scope.
- provenance：
  - GitHub tag `v2.5.1`, npm `swr@2.5.1` `gitHead`, and the checked-out commit are the same `7173e55b2a175dee455612c5fa067383345c392f`.
