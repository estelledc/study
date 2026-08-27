# Bundler source review (writer AJ)

> 用途：记录 Vite、webpack 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：AJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、dev server、生产构建、HMR 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Vite

- canonical source：`https://github.com/vitejs/vite`
- revision：`de1111ab0be00879b404e7ed3b2a80e264edddc1`
- package：`vite@8.2.2`（`packages/vite/package.json`）
- tag：`v8.2.2`
- inspected：
  - `packages/vite/package.json`
  - `packages/vite/src/node/server/index.ts`
  - `packages/vite/src/node/server/transformRequest.ts`
  - `packages/vite/src/node/server/bundledDev.ts`
  - `packages/vite/src/node/server/environment.ts`
  - `packages/vite/src/node/server/hmr.ts`
  - `packages/vite/src/node/optimizer/index.ts`
  - `packages/vite/src/node/optimizer/optimizer.ts`
  - `packages/vite/src/node/build.ts`
  - `packages/vite/src/node/config.ts`
  - `packages/vite/src/node/utils.ts`
- observed：
  - published runtime dependencies are `rolldown`, `lightningcss`, `postcss`, `picomatch`, and `tinyglobby`;
  - `esbuild` is an optional peer/devDependency, not a published runtime dependency;
  - `createServer` resolves a `serve` config, creates client/ssr `DevEnvironment`s, and mounts Connect middleware;
  - `experimental.bundledDev` defaults to `false`; the default path uses `transformMiddleware` and `pluginContainer.load` / `transform`;
  - `experimental.bundledDev === true` uses `rolldown/experimental` `DevEngine` and in-memory files; `handleHMRUpdate` returns early in that mode;
  - `runOptimizeDeps` calls `rolldown()`; `optimizeDeps.esbuildOptions` and `optimizeDeps.rollupOptions` are deprecated in favor of `rolldownOptions`;
  - `build()` creates a builder and bundles through `resolveRolldownOptions`; default production input is `index.html` when no lib/ssr/input override exists;
  - if both `rollupOptions` and `rolldownOptions` are present, `rolldownOptions` wins and `rollupOptions` is a compatibility proxy;
  - engines require `node: ^20.19.0 || >=22.12.0`.
- provenance：
  - GitHub tag `v8.2.2` and the checked-out commit both identify `de1111ab0be00879b404e7ed3b2a80e264edddc1`;
  - npm `vite@8.2.2` publishes SLSA provenance but does not expose `gitHead`;
  - this review therefore binds the internally consistent GitHub tag / package version pair.

## webpack

- canonical source：`https://github.com/webpack/webpack`
- revision：`6a24bd65b72c43207c36ce61b54e1f5833486906`
- package：`webpack@5.109.2`
- tag：`v5.109.2`
- inspected：
  - `package.json`
  - `lib/webpack.js`
  - `lib/Compiler.js`
  - `lib/NormalModule.js`
  - `lib/loaders/LoaderRunner.js`
  - `lib/config/defaults.js`
  - `lib/config/normalization.js`
  - `lib/HotModuleReplacementPlugin.js`
  - `lib/container/ModuleFederationPlugin.js`
  - `lib/optimize/SideEffectsFlagPlugin.js`
- observed：
  - `webpack()` validates options then `createCompiler`: normalize → base defaults → intercept → `Compiler` → `NodeEnvironmentPlugin` → user `plugin.apply` → remaining defaults → `environment` / `afterEnvironment` → `WebpackOptionsApply.process` → `initialize`;
  - a compile run is `beforeCompile` → `compile` → `make` → `finishMake` → `finish` → `seal` → `afterCompile`, then emit / afterEmit / done;
  - loaders run through `LoaderRunner`: pitch walks `loaderIndex` upward, normal walk decrements, so a `use` array executes right-to-left in the normal phase;
  - `ModuleFederationPlugin` composes `ContainerPlugin` (exposes), `ContainerReferencePlugin` (remotes), `SharePlugin` (shared), and `HoistContainerReferences`;
  - `HotModuleReplacementPlugin` is an opt-in compiler plugin, not a default of `webpack()`;
  - `SideEffectsFlagPlugin` reads `package.json` `sideEffects` and rule `sideEffects` to mark `sideEffectFree`;
  - engines require `node: >=10.13.0`.
- provenance：
  - GitHub tag `v5.109.2`, npm `gitHead`, and `package.json` version all identify `6a24bd65b72c43207c36ce61b54e1f5833486906`.
