# Lib-bundler source review (writer IQ)

> 用途：记录 tshy、microbundle 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL IQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、tsc/tsgo、Rollup bundle 或体积 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## tshy

- canonical source：`https://github.com/isaacs/tshy`
- revision：`b695e201caa7232767ade0cfb5e75f244fd8e41c`
- git tag：`v4.1.3`（annotated tag 对象 `1cb204afc3438bf3021da53f509e06d9ba32779b`，剥皮提交即上列 SHA）
- package：`tshy@4.1.3`
- provenance：npm `gitHead`、剥皮 tag 与 `package.json` version 三方一致
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/build.ts`
  - `src/config.ts`
  - `src/types.ts`
  - `src/dialects.ts`
  - `src/exports.ts`
  - `src/which-tsc.ts`
  - `src/build-esm.ts`
  - `src/build-commonjs.ts`
  - `src/build-live-esm.ts`
  - `src/set-folder-dialect.ts`
  - `src/polyfills.ts`
  - `src/tsconfig.ts`
  - `src/self-link.ts`
  - `src/write-package.ts`
  - `src/prevent-verbatim-module-syntax.ts`
  - `src/watch.ts`
  - `src/usage.ts`
  - `src/valid-compiler.ts`
- observed：
  - `engines.node` 为 `20 || >=22`；CLI 只接受 `--help` / `-h` 与 `--watch` / `-w`；
  - 默认 `dialects` 为 `['esm', 'commonjs']`；源码必须在 `./src`，产物先写 `.tshy-build` 再 `syncContentSync` 到 `dist/`；
  - 每次 dialect 构建会往 `src/` 写临时 `package.json`（`type: module` 或 `commonjs`），再 `spawnSync(node, [tsc|tsgo, '-p', '.tshy/<dialect>.json'])`；
  - `compiler` 只允许 `tsc`（默认，解析 `typescript/bin/tsc`）或 `tsgo`（解析 `@typescript/native-preview/bin/tsgo.js`）；
  - README 写明 v4 默认切到 TypeScript 6；本仓自己的 `tshy` 字段是 `compiler: "tsgo"` 且 `dialects: ["esm"]`；
  - `liveDev` 在 `npm_command` 不是 `publish` / `pack` 时改为硬链源文件，不跑 tsc；
  - `exports` 把 `./src/*.ts` 映射到 `dist/esm` / `dist/commonjs`，并补 `types`；`.mts` 不进 require，`.cts` 不进 import；
  - `foo-cjs.cts` / `foo-esm.mts` / 自定义 `-name.ts` 是 dialect polyfill，会在对应构建里覆盖同名 `.ts`；
  - 多 dialect 时若 `verbatimModuleSyntax` 为 true 会直接 `process.exit(1)`；
  - 不把 ESM 包一层 CJS wrapper；README 把 dual-package hazard 写成既成事实；
  - `selfLink !== false` 时把包目录链进 `src/node_modules/<name>` 与 `dist/node_modules/<name>`。

## microbundle

- canonical source：`https://github.com/developit/microbundle`
- revision：`c76c41f8317611f7592d8e44c569e8083076f25f`
- git tag：`v0.15.1`（annotated tag 对象 `830d73e99fbcce25163117a47592e40c9cc86ba3`，剥皮提交即上列 SHA）
- package：`microbundle@0.15.1`
- provenance：npm `gitHead`、剥皮 tag 与 `package.json` version 三方一致；`main` HEAD `9f56e06...` 更晚，本页不绑定
- inspected：
  - `package.json`
  - `README.md`
  - `src/cli.js`
  - `src/prog.js`
  - `src/index.js`
  - `src/lib/package-info.js`
  - `src/lib/babel-custom.js`
  - `src/lib/option-normalization.js`
- observed：
  - CLI 由 `sade` 提供 `build`（默认）与 `watch`；默认 format 为 `modern,esm,cjs,umd`，可用 `MICROBUNDLE_MODERN=false` 去掉 modern；
  - 入口解析顺序：CLI entries → `package.source` → `src/index.{ts,tsx,js}` → `index.{ts,tsx,js}` → `package.module`；
  - 缺省 `external` 是 `dependencies` + `peerDependencies`（另加 web 目标下的 `dns/fs/path/url`，或 node 目标下的 `node:*` 与 builtin）；`devDependencies` 会被打进包；
  - `--target` 默认 `web`；web 默认 `compress=true`，node 默认 `compress=false`；node Babel target 写死 `{ node: '12' }`；
  - `modern` 走 Rollup `format: 'es'`，Babel `targets: { esmodules: true }` 且 `bugfixes: true`，并关掉 `async-to-promises` / `transform-fast-rest` / regenerator；Terser `ecma: 2017` 且 `module: true`；modern 步骤关闭 Rollup cache；
  - 非 modern web 构建用 `babel-plugin-transform-async-to-promises` 把 async 降成 Promise；
  - JSX pragma 默认 `h` / `Fragment`；`--generateTypes` 在 `types`/`typings` 存在时默认打开，走 `rollup-plugin-typescript2`；
  - CSS 默认 `external`，只在第一份 format 抽一次；`--workers` CLI 默认 false；
  - 输出文件名跟 `main` / `module` / `unpkg` / `exports` 走；`cjs` 若在 format 列表里会排到最前先编。
