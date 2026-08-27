# Metaframework / UI source review (writer Q)

> 用途：记录 Astro、SolidJS 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL Q
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、dev server、build、hydration、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- clone mode：blob-filtered；Astro 另做 cone sparse checkout（`packages/astro` + `packages/integrations/solid`）

## Astro

- canonical source：`https://github.com/withastro/astro`
- tag：`astro@7.2.8`（annotated）
- revision：`7cadf1055a61c85d0b05f3c7d8c709f7faa5cf0d`（`astro@7.2.8^{}`）
- package：`astro@7.2.8`；同 pin 的 `@astrojs/solid-js@7.0.2`
- engines：`node >= 22.12.0`
- inspected：
  - `packages/astro/package.json`
  - `packages/astro/src/content/config.ts`
  - `packages/astro/src/content/consts.ts`
  - `packages/astro/src/content/content-layer.ts`
  - `packages/astro/src/core/client-directive/default.ts`
  - `packages/astro/src/runtime/client/idle.ts`
  - `packages/astro/src/runtime/server/render/component.ts`
  - `packages/astro/src/runtime/server/astro-island.ts`
  - `packages/astro/src/runtime/server/render/server-islands.ts`
  - `packages/astro/src/core/config/schemas/base.ts`
  - `packages/astro/components/ClientRouter.astro`
  - `packages/integrations/solid/package.json`
  - `packages/integrations/solid/src/index.ts`
  - `packages/integrations/solid/src/client.ts`
  - `packages/integrations/solid/src/server.ts`
- observed：
  - `defineCollection` 见到 `loader` 时把 `type` 写成内部 `content_layer`；无 loader 时默认 `type: 'content'`（legacy）；
  - 现代配置入口是 `src/content.config.ts`，`glob`/`file` 从 `astro/loaders` 导出；`src/content/config.ts` 与 `type: "content"` 需要 `legacy.collectionsBackwardsCompat`；
  - 内置 client 指令只有 `load` / `idle` / `visible` / `media` / `only`；`idle` 在缺少 `requestIdleCallback` 时回退 `setTimeout(..., timeout || 200)`；
  - 无 `client:*` 的框架组件只输出 SSR HTML，不生成 `<astro-island>`；
  - `server:defer` 是 server island 指令，需要 adapter；占位后由 `/_server-islands/{id}` 拉取；
  - 视图过渡组件是 `ClientRouter`（`astro:transitions`），树中没有 `ViewTransitions.astro`；
  - `output: "hybrid"` 被 schema refine 拒绝，提示改用默认 `static`；
  - Vite 依赖为 `^8.0.13`，Zod 为 `^4.3.6` 并经 `astro/zod` 再导出；
  - `@astrojs/solid-js` peer 为 `solid-js ^1.9.13`；`client !== 'only'` 走 `hydrate`，`client:only` 走 `render`。
- provenance：
  - GitHub annotated tag `astro@7.2.8` 剥皮到上述 revision，与 `packages/astro/package.json` 的 `7.2.8` 一致；
  - npm `astro@7.2.8` 未暴露 `gitHead`，以 tag^{} + 包版本双锚点为准。

## SolidJS

- canonical source：`https://github.com/solidjs/solid`
- package：`solid-js@1.9.15`（`packages/solid/package.json`）
- revision：`a252c783b709e84e1e650a774d6cb52af7624ce7`（`chore: version packages for 1.9.15 release`）
- inspected：
  - `packages/solid/package.json`
  - `packages/solid/src/index.ts`
  - `packages/solid/src/reactive/signal.ts`
  - `packages/solid/src/reactive/scheduler.ts`
  - `packages/solid/src/reactive/array.ts`
  - `packages/solid/src/render/component.ts`
  - `packages/solid/src/render/flow.ts`
  - `packages/solid/src/render/hydration.ts`
  - `packages/solid/src/server/rendering.ts`
  - `packages/solid/CHANGELOG.md`
  - `packages/solid/test/component.spec.ts`
  - `packages/solid/test/signals.spec.ts`
- observed：
  - `createSignal` 返回 `[Accessor, Setter]`，默认 `equals` 为 `===`；setter 若收到函数一律当 updater；
  - 客户端 `createComponent` 在生产路径用 `untrack(() => Comp(props))`，组件函数按 setup 语义执行，不是 React 式重跑；
  - `createMemo` / `createComputed` 进 `Updates`；`createRenderEffect` 先于 `createEffect`（`user: true`）进入 `Effects`；
  - `Scheduler` 默认 `null`，更新同步；`enableScheduling` 才接入 `requestCallback`；
  - `splitProps` 的 `$PROXY` 路径按第一组认领重复 key，与非 proxy 路径对齐（1.9.15）；
  - `For` 按 item `===` 调和，`Index` 按固定下标；`Show` 的 condition 比较是真值相等；
  - `<Dynamic>` 在 `solid-js/web`，不在 core `flow.ts`；
  - Node 默认 `main`/`module` 指向 `dist/server.*`，浏览器条件导出才是 `dist/solid.*`；
  - 1.9.15 让 `lazy()` reject 能落到 ErrorBoundary，并清除缓存 promise 以便重试；SSR `startTransition` / `enableScheduling` 是空操作。
- provenance conflict：
  - npm latest 为 `solid-js@1.9.15`，且 `packages/solid/package.json` 在该提交自报 `1.9.15`；
  - canonical GitHub 在审查时没有 `v1.9.14` / `v1.9.15` tag；最近稳定 tag 是 annotated `v1.9.13`（剥皮 `3be495cec52bf78d7cc61f054af00320ecf4058c`）；
  - npm 未暴露 `gitHead`；本文绑定版本 bump 提交本身，不伪造缺失 tag。
