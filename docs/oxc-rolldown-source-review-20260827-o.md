# Oxc / Rolldown source review

> 用途：记录 oxc、rolldown 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer O
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、dev server 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## oxc

- canonical source：`https://github.com/oxc-project/oxc`
- revision：`4e258430cdb290598d9f2aeb2d13be598ec9e8e9`
- git tag：`crates_v0.147.0`
- package：`oxc` / `oxc-parser` / `oxc-transform` report `0.147.0`
- inspected：
  - `README.md`
  - `ARCHITECTURE.md`
  - `Cargo.toml`
  - `crates/oxc/Cargo.toml`
  - `crates/oxc/src/lib.rs`
  - `crates/oxc/src/compiler.rs`
  - `crates/oxc_parser/src/lib.rs`
  - `crates/oxc_parser/src/config.rs`
  - `crates/oxc_allocator/src/lib.rs`
  - `crates/oxc_span/src/lib.rs`
  - `crates/oxc_span/src/span.rs`
  - `crates/oxc_span/src/source_type.rs`
  - `crates/oxc_transformer/src/lib.rs`
  - `napi/parser/package.json`
  - `napi/parser/src-js/index.js`
- observed：
  - workspace members include `apps/*`, `crates/*` and `napi/*`; published compiler crates share `0.147.0`;
  - `oxc_linter` in this same commit reports `1.79.0`; `apps_v1.80.0` / `oxlint_v1.80.0` point to a different SHA;
  - `oxc` is a feature-gated facade; `Compiler::compile` runs parse → optional isolated declarations → semantic → optional transform → inject/define → compress/DCE → mangle → codegen;
  - transform leaves scoping dirty; inject/define/compress rebuild `Scoping` before consuming it;
  - parser is hand-written recursive descent; scope/symbol work is delegated to semantic analysis;
  - `Span` uses `u32` offsets, so source longer than 4 GiB is rejected;
  - recoverable parse errors still produce a structurally present AST; `panicked` empties the program;
  - Node NAPI parser exposes `parseSync` / `parse`; async parse still deserializes on the calling thread;
  - `oxc_resolver` is a separate repository, not a member of this workspace.
- provenance：
  - Git tag `crates_v0.147.0` and npm `oxc-parser@0.147.0` / `oxc-transform@0.147.0` identify this reachable revision;
  - npm packages do not publish `gitHead`; identity is tag + package version + commit SHA.

## rolldown

- canonical source：`https://github.com/rolldown/rolldown`
- revision：`5375362b36eeeaf514c67052ba65f3e97523dde5`
- git tag：`v1.2.6`
- package：`rolldown@1.2.6`
- inspected：
  - `README.md`
  - `Cargo.toml`
  - `package.json`
  - `packages/rolldown/package.json`
  - `packages/rolldown/src/index.ts`
  - `crates/rolldown/src/lib.rs`
  - `crates/rolldown/src/bundler/bundler.rs`
  - `crates/rolldown/src/bundler/impl_bundler_build.rs`
  - `crates/rolldown/src/stages/mod.rs`
  - `crates/rolldown/src/bundle/bundle.rs`
  - `docs/guide/introduction.md`
  - `docs/guide/getting-started.md`
  - `docs/guide/notable-features.md`
  - `docs/apis/plugin-api.md`
  - `docs/development-guide/repo-structure.md`
- observed：
  - JS package version, workspace crate versions and git tag all report `1.2.6`;
  - workspace pins `oxc` crates at `0.147.0`, `oxc_resolver` at `11.24.3`, `oxc_sourcemap` at `8.1.0`;
  - `Bundler::write` / `generate` create a `Bundle` and call `scan_modules` → `LinkStage::link` → `GenerateStage::generate`;
  - `write` then creates the output directory and writes assets; `generate` stays in memory;
  - incremental rebuild is gated by `experimental.is_incremental_build_enabled()`;
  - JS API exports `rolldown`, `build` and `watch`; `watch().close()` returns a Promise;
  - plugin interface is documented as almost Rollup-compatible, with hook filters recommended;
  - Node engines are `^20.19.0 || >=22.12.0`;
  - npm `vite@8.2.2` lists `rolldown ~1.2.4` as a dependency; this note does not review Vite itself.
- provenance：
  - Git tag `v1.2.6` and npm `rolldown@1.2.6` identify the same reachable revision;
  - npm does not publish `gitHead`; identity is tag + package version + commit SHA.
