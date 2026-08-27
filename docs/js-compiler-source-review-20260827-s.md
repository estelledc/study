# JS/TS compiler source review (writer S)

> 用途：记录 esbuild、SWC 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL S
- evidence：GitHub/npm metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- 未绑定：下载量、star 数、与 webpack/Rollup/Terser 的倍率、下游框架默认编译器身份

## esbuild

- canonical source：`https://github.com/evanw/esbuild`
- revision：`609683d892977362a0f99026cb74b96263d728a9`
- package：`esbuild@0.28.2`
- provenance：lightweight tag `v0.28.2` 与 npm `gitHead` 三方一致；`version.txt` 与 `npm/esbuild/package.json` 均为 `0.28.2`
- license：MIT（`LICENSE.md`）
- toolchain files：`go.mod` module `github.com/evanw/esbuild` / `go 1.13`；`go.version` `1.26.5`
- inspected：
  - `version.txt`
  - `LICENSE.md`
  - `npm/esbuild/package.json`
  - `cmd/esbuild/main.go`
  - `pkg/api/api.go`
  - `pkg/api/api_impl.go`
  - `lib/shared/types.ts`
  - `lib/npm/node.ts`
  - `internal/bundler/bundler.go`
  - `internal/linker/linker.go`
  - `internal/js_parser/js_parser.go`
  - `internal/js_parser/ts_parser.go`
  - `internal/resolver/resolver.go`
  - `internal/css_parser/css_parser.go`
- observed：
  - JS 解析器对每个模块做两遍：先建 AST/作用域，再 bind + 按 target lower；打包另有 scan → link → print；不是单次 lexer walk；
  - TypeScript 类型被当成空白跳过，不生成类型 AST，也不做类型检查；源码建议另跑 TypeScript checker；
  - `build` 走真实文件系统与模块图；`transform` 走 mock FS + stdin，不支持 plugin；
  - plugin 钩子是 `onStart` / `onResolve` / `onLoad` / `onEnd` / `onDispose`，另有 `resolve()`；没有 Babel 式 AST visitor；
  - `platform` 默认 `browser`；打包且未设 `format` 时 browser→`iife`、node→`cjs`、neutral→`esm`；
  - `treeShaking` 默认在 `bundle: true` 或 `format: 'iife'` 时开启；node 默认 `mainFields` 为 `main` 再 `module`；
  - CSS 只有内置 parser/printer 与 CSS modules/`local-css`，没有 PostCSS / Sass / Less 管线；
  - `minify: true` 同时打开 syntax / whitespace / identifiers 三项；不保证输出小于 Terser。

## SWC

- canonical source：`https://github.com/swc-project/swc`
- revision：`490c7d88ad15cf84ee410c69e19eef86f445d45b`
- package：`@swc/core@1.16.1`
- provenance：annotated tag `v1.16.1` 解引用到此提交；提交说明 Publish `1.16.1` with `swc_core` `v77.0.2`；`packages/core/package.json` 版本一致。npm 未暴露 `gitHead`，以 peeled tag + 版本文件为锚点
- license：Apache-2.0（根 `Cargo.toml` 与 `@swc/core`）
- inspected：
  - `package.json`
  - `Cargo.toml`
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/postinstall.js`
  - `bindings/binding_core_node/src/lib.rs`
  - `bindings/swc_cli/src/main.rs`
  - `crates/swc/src/lib.rs`
  - `crates/swc/src/config/mod.rs`
  - `crates/swc/src/plugin.rs`
  - `crates/swc_ecma_parser/src/parser/expr.rs`
  - `crates/swc_ecma_transforms_typescript/src/lib.rs`
  - `crates/swc_ecma_transforms_react/src/jsx/mod.rs`
  - `crates/swc_ecma_minifier/src/lib.rs`
  - `crates/swc_plugin_runner/src/transform_executor.rs`
- observed：
  - JS API 导出 `transform` / `transformSync` / `parse` / `print` / `minify` / `bundle` 与 `Compiler`；`bundle` 是独立 Spack 路径，且 `@swc/wasm` 没有文件系统/`bundle`；
  - 主链为 parse → resolver → 可选 decorator → TypeScript strip → Wasm plugin → React/JSX → optimizer → compat/`env` → module → 可选 minify → hygiene/fixer → codegen；
  - TypeScript 变换只剥语法并处理 enum/namespace 等，不做 HM 类型检查；parser 把部分 TS 语义错误留给 type checker；
  - `jsc.transform.react.runtime` 默认 `Classic`（源码注明 v2 可能改）；自动 JSX 必须显式 `automatic`；
  - decorator 有 `2021-12`（legacy + metadata）、`2022-03`、`2023-11` 三条路径；未设 `decoratorVersion` 走默认 legacy 路径；TypeScript 语法会强制 `legacyDecorator: true`；
  - Wasm plugin 配在 `jsc.experimental.plugins`；`swc_plugin_runner` 校验 AST schema / `swc_core` 版本，不匹配即失败；`@swc/wasm` 会跳过 plugin；
  - 独立 `minify`/`minifySync` 与 transform 内 `minify: true` 都走 `swc_ecma_minifier::optimize`；说明是 Terser 风格移植，不保证字节或体积一致；
  - `env` 与 `jsc.target` 互斥；CLI 入口在 `bindings/swc_cli`，本轮未展开 `swc_cli_impl`，实践示例只绑定 `@swc/core` JS API。
