# UI framework source review

> 用途：记录 Vue、Svelte 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- slot：PARALLEL writer AM
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Vue

- canonical source：`https://github.com/vuejs/core`
- revision：`d63616ca17de965ed32dcb449a4c5cd9982f15d2`
- package：`vue@3.5.42`（workspace 内 `@vue/reactivity` / `@vue/runtime-core` / `@vue/runtime-dom` / `@vue/compiler-core` / `@vue/compiler-sfc` 均为 `3.5.42`）
- inspected：
  - `packages/vue/package.json`
  - `packages/reactivity/src/ref.ts`
  - `packages/reactivity/src/reactive.ts`
  - `packages/reactivity/src/effect.ts`
  - `packages/runtime-core/src/component.ts`
  - `packages/runtime-core/src/scheduler.ts`
  - `packages/runtime-core/src/helpers/useModel.ts`
  - `packages/runtime-core/src/helpers/useId.ts`
  - `packages/runtime-core/src/helpers/useTemplateRef.ts`
  - `packages/runtime-core/src/hydrationStrategies.ts`
  - `packages/runtime-dom/src/directives/vShow.ts`
  - `packages/compiler-sfc/src/compileScript.ts`
- observed：
  - `ref()` builds `RefImpl`; `get value` calls `dep.track()`, `set value` writes only when `hasChanged` then `dep.trigger()`; object values are wrapped with `toReactive()` unless shallow/readonly;
  - `reactive()` creates a `Proxy` cached in a WeakMap; already-proxied targets (except `readonly(reactive)`) and non-extensible / `SKIP` / invalid types are returned as-is; collections use separate handlers;
  - `setupComponent` initializes props/slots then `setupStatefulComponent`; `setup()` runs under `pauseTracking()`; a setup context is created only when `setup.length > 1`; a Promise setup result becomes `instance.asyncDep` and needs `<Suspense>` outside SSR;
  - `queueJob` inserts by component id with binary search (parent before child); `nextTick` attaches to `currentFlushPromise` or `Promise.resolve()`;
  - `defineModel` is registered by compiler-sfc and implemented by `useModel` (`customRef` + `watchSyncEffect` on the prop, emit `onUpdate:` only when the parent passed v-model);
  - `useId()` concatenates app prefix + instance `ids`; async setup / `serverPrefetch` call `markAsyncBoundary`;
  - `useTemplateRef` installs a `shallowRef` onto `instance.refs` via `Object.defineProperty`;
  - `v-show` stores the original `display` on a symbol and sets `display: none`; it does not unmount the vnode;
  - lazy hydration helpers (`hydrateOnIdle`, `hydrateOnVisible`, …) exist as explicit strategies, not as the default hydrate path;
  - default `vue` export is the runtime ESM build; compiler-sfc / server-renderer are subpath exports.
- provenance note：
  - npm `vue@3.5.42` does not expose `gitHead`;
  - GitHub lightweight tag `v3.5.42` points at `d63616ca17de965ed32dcb449a4c5cd9982f15d2`, whose `packages/vue/package.json` reports `3.5.42`;
  - this review binds the tag revision.

## Svelte

- canonical source：`https://github.com/sveltejs/svelte`
- revision：`56a036f4ce873a24ee6631a06d03d372523d7a9b`
- package：`svelte@5.56.10`
- inspected：
  - `packages/svelte/package.json`
  - `packages/svelte/src/index-client.js`
  - `packages/svelte/src/compiler/index.js`
  - `packages/svelte/src/internal/client/reactivity/sources.js`
  - `packages/svelte/src/internal/client/reactivity/deriveds.js`
  - `packages/svelte/src/internal/client/reactivity/effects.js`
  - `packages/svelte/src/internal/client/reactivity/props.js`
  - `packages/svelte/src/internal/client/proxy.js`
- observed：
  - `$state` / `$derived` / `$effect` / `$props` / `$bindable` are compile-time runes; DEV client entry installs throwing getters on `globalThis` so using them outside compiled Svelte fails;
  - `compile()` is parse → analyze → transform and returns a JS module; `compileModule()` compiles rune JS without a `.svelte` template;
  - `$state` compiles to `state()` / `source()`; objects and arrays go through `proxy()`, which no-ops on `null`, already-proxied values (`STATE_SYMBOL`), and prototypes other than `Object` / `Array`;
  - `$derived` compiles to lazy `derived()` with DIRTY flags; `$effect` is `user_effect`, which `validate_effect` rejects as orphan when `active_effect` is missing, and defers top-level component effects until mount via `component_context.e`;
  - `$effect.root` creates a `ROOT_EFFECT`; legacy `$: ` is `legacy_pre_effect`;
  - `$props()` compiles to flagged getters; rest props are a readonly proxy that refuses writes in DEV;
  - package exports choose `index-client.js` for `browser` and `index-server.js` for `worker` / default; `./legacy` and `./internal/flags/legacy` remain available;
  - `engines.node` is `>=18`.
- provenance note：
  - npm `svelte@5.56.10` does not expose `gitHead`;
  - GitHub annotated tag `svelte@5.56.10` peels to `56a036f4ce873a24ee6631a06d03d372523d7a9b`, whose `packages/svelte/package.json` reports `5.56.10`;
  - this review binds the peel revision.
