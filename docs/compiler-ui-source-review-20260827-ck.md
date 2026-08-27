# Compiler-UI source review (writer CK)

> 用途：记录 Qwik、Stencil 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：CK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、optimizer/compiler、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Qwik

- canonical source：`https://github.com/QwikDev/qwik`
- revision：`971465f941e44e5adf2b2c2e44566b590d0990d8`
- packages：`@builder.io/qwik@1.20.0`、`@builder.io/qwik-city@1.20.0`
- inspected：
  - `packages/qwik/package.json`
  - `packages/qwik-city/package.json`
  - `packages/qwik/src/core/component/component.public.ts`
  - `packages/qwik/src/core/use/use-signal.ts`
  - `packages/qwik/src/core/use/use-task.ts`
  - `packages/qwik/src/core/qrl/qrl.public.ts`
  - `packages/qwik/src/core/util/implicit_dollar.ts`
  - `packages/qwik/src/core/util/markers.ts`
  - `packages/qwik/src/core/container/resume.ts`
  - `packages/qwik/src/core/container/pause.ts`
  - `packages/qwik/src/qwikloader.ts`
  - `packages/qwik-city/src/runtime/src/server-functions.ts`
  - `packages/qwik-city/src/middleware/request-handler/resolve-request-handlers.ts`
  - `packages/qwik/src/core/render/ssr/render-ssr.unit.tsx`
- observed：
  - `component$` is `componentQrl($(onMount))`; any `foo$` first argument is wrapped by `implicit$FirstArg` → `$()`, which the Optimizer extracts into a lazy QRL chunk;
  - `useSignal` stores a container-scoped signal via `useConstant(() => createSignal(initialState))`; a function initial state is invoked once;
  - event QRLs serialize onto host attributes as `on:<event>` (for example `on:click`), not a `q:click` attribute; `qwikloader` globally listens, then `import()`s the URL + `#symbol` (or looks up sync `qFuncs_<instance>[n]` when the QRL starts with `#`);
  - pause/resume state lives in a `script[type="qwik/json"]` plus `q:container="paused"`; `resumeIfNeeded` only resumes when the attribute is `paused`;
  - `useTask$` marks the task dirty and `waitAndRun`s it during the current render (including SSR); optional `eagerness` only registers a later client listener on the server path;
  - `useVisibleTask$` default `strategy` is `intersection-observer`, which registers `useOn('qvisible', ...)`; on the client first creation it also `$resolveLazy$` + `notifyTask`;
  - `routeLoader$` must be exported from the route `layout.tsx` / `index.tsx`; the request handler runs loaders in `actionsMiddleware` and puts resolved values into request loader state; the component reads them via `RouteStateContext`;
  - both packages declare `engines.node` as `>=16.8.0 <18.0.0 || >=18.11`.
- provenance note：
  - GitHub annotated tag `@builder.io/qwik@1.20.0` peels to `971465f941e44e5adf2b2c2e44566b590d0990d8` ("Merge pull request #8657"), and both workspace `package.json` files report `1.20.0`;
  - npm `@builder.io/qwik@1.20.0` exposes no `gitHead`;
  - npm latest `@qwik.dev/core` is `2.0.0-beta.42` (package rename / v2 beta line); this review binds the last stable `@builder.io/qwik@1.20.0` commit and does not treat the beta as the applicable version.

## Stencil

- canonical source：`https://github.com/stenciljs/core`（`ionic-team/stencil` 重定向到此仓）
- revision：`7a8cc6e60b7c92cffd907569886c97202153d6a0`
- package：`@stencil/core@4.44.2`
- inspected：
  - `package.json`
  - `src/compiler/compiler.ts`
  - `src/compiler/output-targets/index.ts`
  - `src/compiler/output-targets/dist-lazy/`
  - `src/compiler/output-targets/dist-custom-elements/`
  - `src/declarations/stencil-public-compiler.ts`
  - `src/declarations/stencil-public-runtime.ts`
  - `src/runtime/connected-callback.ts`
  - `src/runtime/initialize-component.ts`
  - `src/runtime/proxy-component.ts`
  - `src/runtime/runtime-constants.ts`
  - `src/utils/constants.ts`
- observed：
  - `createCompiler` validates config, installs an in-memory fs + cache, patches TypeScript, and exposes `build` / `createWatcher` / `destroy`;
  - `generateOutputTargets` first emits collection, custom-elements, hydrate script, lazy-loader and lazy bundles, then copy / www / docs / types / custom; www waits for the lazy output so it can inline the lazy entry;
  - public output-target type strings include `www`, `dist`, `dist-custom-elements`, `dist-hydrate-script`, `dist-lazy`, `dist-lazy-loader`, `dist-collection` and docs/types companions;
  - lazy runtime: `connectedCallback` → `initializeComponent` → `loadModule` → `proxyComponent` on the constructor → `new Cstr(hostRef)`; host element and lazy instance stay in sync through `hostRef`;
  - a failed lazy `import()` clears `hasInitializedComponent`, increments `$loadRetryCount$`, and retries on later reconnect up to `MAX_LAZY_LOAD_RETRIES = 3` with `LAZY_LOAD_RETRY_INTERVAL_MS = 1000`;
  - `@Component({ tag })` requires a hyphenated custom-element name; `shadow` / `scoped` choose encapsulation; `@Prop` is immutable inside the component unless `mutable: true`, and `reflect` defaults to false;
  - client hydration looks for host attribute `s-id` (`HYDRATE_ID`);
  - package engines are Node `>=16.0.0` and npm `>=7.10.0`; license field is MIT.
- provenance note：
  - npm `@stencil/core@4.44.2` reports `gitHead=7a8cc6e60b7c92cffd907569886c97202153d6a0`;
  - GitHub tag `v4.44.2` is a lightweight tag on the same commit ("v4.44.2 (#6851)");
  - `package.json` at that commit reports `4.44.2`.
