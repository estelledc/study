# Bundler source review

> 用途：记录 rollup、rspack 项目页迁移所用的固定源码输入。目标原为 rollup + parcel；仓库没有 `parcel` slug，且开放 PR 已占用 vite / webpack / esbuild / swc / oxc / rolldown，故 fallback 为 rollup + rspack。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BL
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、dev server 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## rollup

- canonical source：`https://github.com/rollup/rollup`
- revision：`34b8b924c815ec9413d7821f6fd54cc615584a51`
- git tag：`v4.63.0`
- package：`rollup@4.63.0`
- inspected：
  - `package.json`
  - `ARCHITECTURE.md`
  - `src/rollup/rollup.ts`
  - `src/Graph.ts`
  - `src/Bundle.ts`
  - `src/ModuleLoader.ts`
  - `src/Module.ts`
  - `src/utils/buildPhase.ts`
  - `src/utils/PluginDriver.ts`
  - `src/utils/resolveId.ts`
  - `src/utils/parseAst.ts`
  - `src/utils/options/normalizeInputOptions.ts`
  - `src/utils/options/options.ts`
  - `src/finalisers/index.ts`
- observed：
  - npm `gitHead` equals this reachable commit; package version and tag both report `4.63.0`;
  - engines are `node >= 18.0.0`;
  - `rollup(inputOptions)` builds a `Graph` then returns `{ generate, write, close }`; generate/write can emit multiple formats from one graph;
  - `Graph.build` is generate module graph → sort/bind → include statements; phases are `LOAD_AND_PARSE`, `ANALYSE`, `GENERATE`;
  - tree-shaking is a multi-pass `include()` over executed modules; after pass 1, entries with `preserveSignature !== false` call `includeAllExports()`;
  - `treeshake === false` includes every module wholesale; default `moduleSideEffects` is `() => true`;
  - `smallest` preset sets `moduleSideEffects` to `() => false`; core does not parse npm `package.json` `sideEffects`;
  - default `resolveId` fallback only joins relative/absolute paths and probes `.mjs` / `.js`; bare specifiers return null unless a plugin resolves them;
  - parse goes through native NAPI `parse` / `parseAsync`;
  - output finalisers are `amd`, `cjs`, `es`, `iife`, `system`, `umd`;
  - `maxParallelFileOps` defaults to 1000.
- provenance：
  - Git tag `v4.63.0` and npm `rollup@4.63.0` `gitHead` identify the same reachable revision.

## rspack

- canonical source：`https://github.com/web-infra-dev/rspack`
- revision：`e4d321c088d4f1396ae9d332a947a4c2e060420c`
- git tag：`v2.2.0` (annotated tag `bf92f915...` → this commit)
- package：`@rspack/core@2.2.0`
- inspected：
  - `package.json`
  - `README.md`
  - `packages/rspack/package.json`
  - `packages/rspack/src/index.ts`
  - `packages/rspack/src/rspack.ts`
  - `packages/rspack/src/exports.ts`
  - `packages/rspack/src/checkNodeVersion.ts`
  - `packages/rspack/src/Compilation.ts`
  - `packages/rspack/src/builtin-plugin/JsLoaderRspackPlugin.ts`
  - `packages/rspack/src/builtin-plugin/html-plugin/plugin.ts`
  - `packages/rspack/src/loader-runner/worker.ts`
  - `crates/rspack_core/src/compiler/mod.rs`
  - `crates/rspack_core/src/compilation/run_passes.rs`
  - `crates/rspack_core/src/compilation/build_module_graph/mod.rs`
  - `crates/rspack_core/src/compilation/seal/mod.rs`
  - `crates/rspack_core/src/loader/loader_runner.rs`
- observed：
  - workspace and `@rspack/core` both report `2.2.0`; npm does not publish `gitHead`;
  - `@rspack/core` engines are `^20.19.0 || >=22.12.0`; JS entry warns outside that range;
  - `webpackVersion` is hardcoded `5.75.0` and exported as `version` for plugin detection;
  - JS `rspack()` creates a webpack-shaped `Compiler`, applies plugins, then `RspackOptionsApply`;
  - Rust `Compiler::build` resets `Compilation`, emits `this_compilation` / `compilation`, then `compile()` → `run_passes`;
  - pass order is build module graph → finish modules → seal → optimize deps/chunks/modules → ids → code generation → process assets → after seal;
  - `HtmlRspackPlugin` is a builtin plugin (`version = 5`), not a drop-in of community `html-webpack-plugin`;
  - JS loaders go through `JsLoaderRspackPlugin` + `loader-runner` worker; builtin loaders use the `builtin:` prefix;
  - official site in this revision is `https://rspack.rs`.
- provenance：
  - Git tag `v2.2.0` and npm `@rspack/core@2.2.0` identify this reachable revision;
  - identity is tag + package version + commit SHA because npm omits `gitHead`.
