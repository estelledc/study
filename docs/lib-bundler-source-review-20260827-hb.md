# pkgroll + bunchee source review (writer HB)

> 用途：记录 `pkgroll` 与 `bunchee` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-hb` 标记 2026-08-27 平行 writer HB，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、真实打包、watch、prepare / lint、worker 池或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`pkgroll`、`bunchee` 为本轮新建页面；清单原先没有这两个 slug
- not this pair：未绑定 tsup、unbuild、esbuild、rollup、vite 作为审查对象；它们只作为已有对照页出现

## pkgroll

- canonical source：`https://github.com/privatenumber/pkgroll`
- tag：`v2.27.1`（lightweight tag）
- revision：`959847d0328d4683a3f259b7e1b4a494c98be120`
- package：npm `pkgroll@2.27.1` latest；`gitHead` 与 tag 同指此提交
- license：MIT（`LICENSE` 文件；作者 Hiroki Osame）
- engines：`node >=18`
- also observed：仓内 `package.json#version` 为 `0.0.0-semantic-release`，发布号由 semantic-release 写入 npm，不以仓内字段为准
- inspected：
  - `README.md`
  - `LICENSE`
  - `package.json`
  - `src/cli.ts`
  - `src/utils/get-build-entry-points/index.ts`
  - `src/utils/get-build-entry-points/get-pkg-entry-points.ts`
  - `src/utils/get-build-entry-points/get-source-path.ts`
  - `src/utils/get-build-entry-points/apply-publish-config.ts`
  - `src/utils/get-build-entry-points/utils.ts`
  - `src/utils/clean-dist.ts`
  - `src/rollup/get-rollup-configs.ts`
  - `src/rollup/configs/pkg.ts`
  - `src/rollup/configs/dts.ts`
  - `src/rollup/plugins/externalize-dependencies.ts`
- observed：
  - 入口来自 `package.json` 的 `main` / `module` / `types` / `bin` / `exports` / `imports`，再把 `dist` 路径映射回 `src`；`--input` 是逃逸口；
  - `applyPublishConfig` 会用 `publishConfig` 覆盖 `bin` / `main` / `exports` / `types` / `module`；
  - `packageJson.type` 缺省按 `commonjs`；`module` 字段一律 ESM；`types` 条件一律声明格式；
  - 默认 `src:dist` 是 `./src:./dist`；`--clean-dist` 默认关；`--minify` 默认关；
  - `--target` 默认 `node${process.versions.node}`，再追加 tsconfig `compilerOptions.target`；
  - JS 与 dts 分 Rollup 配置；JS 再按 `format-extension` 拆构建，避免 ESM top-level await 污染 CJS 渲染；
  - `dependencies` / `peerDependencies` / `optionalDependencies` 外置；仅 `devDependencies` 在可解析时打进包；未列入的依赖警告后打包；
  - dts 走 `rollup-plugin-dts`，并强制 `composite: false`；
  - watch 在 `package.json` 变化时 100ms 防抖后关掉并重建 watcher，因为 Rollup watcher 不会发现新入口。

## bunchee

- canonical source：`https://github.com/huozhi/bunchee`
- tag：annotated `v7.0.1` → peel `18f93d40e96ed1fbaa1570f2d295678ff61c3036`
- revision：`18f93d40e96ed1fbaa1570f2d295678ff61c3036`
- package：npm `bunchee@7.0.1` latest；`gitHead` 与剥开 tag 一致
- license：`package.json` 声明 MIT；该提交工作树没有 `LICENSE` / `LICENSE.md`
- engines：`node >=22.12.0`
- inspected：
  - `README.md`
  - `docs/MIGRATION.md`
  - `package.json`
  - `src/bin/index.ts`
  - `src/index.ts`
  - `src/bundle.ts`
  - `src/entries.ts`
  - `src/exports.ts`
  - `src/constants.ts`
  - `src/prepare/index.ts`
  - `src/lib/worker-pool.ts`
- observed：
  - 多入口时先 `parseExports`，再把 `src/` 文件名对到 export 名（`src/index.ts` → `"."`，`src/lite.ts` → `"./lite"`）；
  - CLI 缺省 `format=esm`、`runtime=browser`、`target=es2022`；`clean` 默认开（`--no-clean` 才关）；
  - `--minify` 未显式关 sourcemap 时会打开 sourcemap；单独未传 `--sourcemap` 时仍是关；
  - `generateTypes` 要求有 tsconfig；源码含 TS 且没有 tsconfig 时会写一份默认 `ES2022` / `ESNext` / `bundler`；
  - 特殊条件约定含 `react-server` / `edge-light` / `workerd` / `development` / `production` 等；`_*` 私有文件不进入口；
  - 7.0 起不再读 `typings`；`prepare` 默认只写 ESM，`--cjs` 才双格式；旧 `--prepare` flag 已删；
  - 可合并时走共享 graph；`>=8` 个入口且非 watch 时才上 Piscina worker；合并构建再拆 worker 的门槛是 `>=256`；
  - `dependencies` / `peerDependencies` 外置；`--no-external` 把 `external` 收成 `null` 表示打进去。
