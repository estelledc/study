# TypeScript runner source review (writer CG)

> 用途：记录 tsx、ts-node 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CG
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、watch、REPL、type-check 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `esbuild`、`swc`、`bun`、`vite`、`oxc`、`rolldown`，也未触及其他开放 PR 占用的 slug

## tsx

- canonical source：`https://github.com/privatenumber/tsx`
- revision：`ed9d33046a135de13a35fdfce12368b79d1b1518`
- package：`tsx@4.23.12`
- tag：`v4.23.12`（lightweight tag，指向同一 commit）
- provenance：GitHub tag、npm `gitHead` 与发布包版本一致；仓库根 `package.json` 仍是 `0.0.0-semantic-release`，适用版本以 npm / tag 为准
- inspected：
  - `package.json`
  - `src/cli.ts`
  - `src/run.ts`
  - `src/loader.ts`
  - `src/cjs/index.ts`
  - `src/cjs/api/register.ts`
  - `src/cjs/api/module-extensions.ts`
  - `src/esm/index.ts`
  - `src/esm/hook/load.ts`
  - `src/esm/hook/resolve.ts`
  - `src/utils/transform/index.ts`
  - `src/utils/transform/get-esbuild-options.ts`
  - `src/utils/transform/cache.ts`
  - `src/utils/tsconfig.ts`
  - `src/utils/temporary-directory.ts`
  - `src/watch/index.ts`
- observed：
  - CLI 用 `cleye` 解析 `--no-cache` / `--tsconfig` / `watch`，再 `spawn(process.execPath)` 拉起子进程；
  - 子进程固定 `--require ./preflight.cjs`，REPL 再加 `--require ./patch-repl.cjs`；支持 `module.register` 时用 `--import loader.mjs`，否则回退 `--loader`；
  - `loader.mjs` 同时挂 CJS `register()` 与 ESM `initialize` / `resolve` / `load`；
  - 变换只走 esbuild（运行时依赖 `esbuild ~0.28.0`），不做 TypeScript 类型检查；
  - CJS 变换默认 `format: 'cjs'`，用 IIFE banner/footer，并在 lexer 看到 `import.meta` 时用 JSON `define` 做 shim；固定提交补的是注释/换行拆开 `import` 与 `.meta` 的漏检；
  - 磁盘缓存默认写到 `os.tmpdir()/tsx-${uid}`；`TSX_DISABLE_CACHE=1` 改成内存 `Map`；
  - tsconfig 由 `get-tsconfig` 读取，路径别名只对非 `node_modules` 父模块生效；
  - `--eval` / `--print` 在父进程里先 `esbuild.transformSync`，`sourcefile` 固定为 `/eval.ts`。

## ts-node

- canonical source：`https://github.com/TypeStrong/ts-node`
- revision：`057ac1beb118f9c42d21e876a17320ad73ea6be2`
- package：`ts-node@10.9.2`
- tag：`v10.9.2`；同仓另有 `v11.0.0-beta.1`，本文不绑定 beta
- provenance：GitHub tag、npm `gitHead` 与 `package.json` 版本一致
- inspected：
  - `package.json`
  - `src/bin.ts`
  - `src/index.ts`
  - `src/configuration.ts`
  - `src/esm.ts`
  - `src/module-type-classifier.ts`
  - `src/cjs-resolve-hooks.ts`
  - `src/transpilers/swc.ts`
  - `src/repl.ts`
- observed：
  - 默认走 TypeScript 编译器并做类型检查；`transpileOnly` 或 `swc` 才关掉类型检查；
  - `swc` 隐含 `transpileOnly`；`transpileOnly: false` 与 `swc` 同时出现会抛错；CLI `--type-check` 可以压过配置里的 `transpileOnly`；
  - 强制覆盖一组 compiler options：`sourceMap=true`、`inlineSourceMap=false`、`inlineSources=true`、`declaration=false`、`noEmit=false`、`outDir=.ts-node`；未写 `target` / `module` 时默认 ES5 + CommonJS；
  - CLI 分 phase 启动；`--esm` 或配置 `esm` 会先 `callInChild` 再挂 loader；
  - ESM hook 按 Node `>=16.12.0` 在 API1（`getFormat`/`transformSource`）与 API2（`load`）之间切换；
  - `moduleTypes` 可按路径覆盖 CJS/ESM 分类；`compile()` 先走带类型检查的 `getOutput`，再按分类强制 CJS/ESM emit；
  - SWC 路径解析 `@swc/core`，失败再试 `@swc/wasm`；`.tsx`/`.jsx` 用另一套 swc options；
  - 多个 bin：`ts-node`、`ts-node-transpile-only`、`ts-node-esm`、`ts-node-cwd`、`ts-node-script`；REPL 是一等入口。
