# tsup / unbuild source review (writer FY)

> 用途：记录 `tsup` 与 `unbuild` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fy` 标记 2026-08-27 平行 writer FY，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FY
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI 真实打包、stub/watch、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：清单原先没有这两个页面；按调用方指定目标新建，而不是改写已占用的 bundler 页

## tsup

- canonical source：`https://github.com/egoist/tsup`
- tag：annotated `v8.5.1`（tag object `c5e9cd96511f6e258eb6642ad20c08f70022be6b`）
- revision：`1ecb6a5783fc91c73a7426adaa9a5abf3f978f07`
- package：`tsup@8.5.1`（MIT，`engines.node >=18`）
- npm：latest `8.5.1`，无 `gitHead`；身份靠剥开的 annotated tag + package version
- inspected：
  - `README.md`
  - `package.json`
  - `src/index.ts`
  - `src/options.ts`
  - `src/cli-main.ts`
  - `src/cli-default.ts`
  - `src/cli-node.ts`
  - `src/load.ts`
  - `src/esbuild/index.ts`
  - `src/utils.ts`
  - `src/plugins/tree-shaking.ts`
  - `src/plugins/cjs-interop.ts`
- observed：
  - README 仍写 “no config, powered by esbuild”，同时警告项目不再积极维护并指向 tsdown；
  - `normalizeOptions` 默认 `format=['cjs']`、`outDir='dist'`、`removeNodeProtocol=true`；`target` 来自 tsconfig 或 `node16`；
  - CLI 使用 `ignoreOptionDefaultValue: true`，帮助里的 `--target es2017` 不是未传 flag 时的真实默认；
  - `tsup-node` 只是 `main({ skipNodeModulesBundle: true })`；
  - 每个 format 的插件链为 shebang → 用户 plugin → Rollup treeshake → cjsSplitting → cjsInterop → swcTarget → sizeReporter → terser，再 `runEsbuild`（`write: false`）；
  - `dtsTask` 与 `mainTasks` 并行；`dts` 与 `experimentalDts` 互斥；`--dts` 走 Worker + `rollup.js`；
  - `clean` 在声明任务开启时排除 `**/*.d.{ts,cts,mts}`；
  - production / peer 依赖默认 external；`cjsInterop` 只处理单 `default` 导出的 CJS 入口 chunk；
  - `type: module` 时 CJS 扩展名为 `.cjs` / `.d.cts`。
- provenance：
  - annotated tag `v8.5.1` 剥到 `1ecb6a57...`；clone `--branch v8.5.1` 落到同一提交；
  - npm 无 `gitHead`，未伪造。

## unbuild

- canonical source：`https://github.com/unjs/unbuild`
- tag：annotated `v3.6.1`（tag object `aed2d1c29cd274cf1060996d84f772b7b034dc71`）
- revision：`a0b4aaf87a6566e7b2c6f7855242fc2acc10dc6a`
- package：`unbuild@3.6.1`（MIT，纯 ESM）
- npm：latest `3.6.1`，`gitHead` 与剥开的 tag 一致
- also observed：README 写正在试验 rolldown 系后继 `obuild`；未绑定
- inspected：
  - `README.md`
  - `package.json`
  - `src/index.ts`
  - `src/build.ts`
  - `src/cli.ts`
  - `src/auto.ts`
  - `src/types.ts`
  - `src/validate.ts`
  - `src/builders/rollup/build.ts`
  - `src/builders/rollup/config.ts`
  - `src/builders/rollup/stub.ts`
  - `src/builders/mkdist/index.ts`
- observed：
  - 配置经 jiti 读 `build.config` 或 `package.json` 的 `unbuild` / `build`；preset 默认 `auto`；
  - 默认选项含 `clean=true`、`outDir=dist`、`emitCJS=false`、`failOnWarn=true`、`esbuild.target=esnext`、`preserveDynamicImports=true`；
  - builder 顺序 untyped → mkdist → rollup → copy；`parallel` 才并发；
  - 未写 `builder` 时，尾斜杠入口走 mkdist，否则 rollup；
  - auto 从 `exports` / `bin` / `main` / `module` / `types` 推断；CJS 输出会开 `emitCJS`；`declaration` 空值看 `types` 字段；
  - 声明 `compatible`/`true` 写 `.d.mts` + `.d.cts` + `.d.ts`，`node16` 不写 `.d.ts`；
  - `--stub` 写 jiti 包装（rollup）或 symlink（mkdist）；stub/watch 跳过 validate；
  - 非 stub/watch 会合并 `publishConfig`；警告非空且 `failOnWarn` 时 `process.exit(1)`。
- provenance：
  - annotated tag `v3.6.1`、npm `gitHead` 与 clone HEAD 三者同为 `a0b4aaf8...`。
