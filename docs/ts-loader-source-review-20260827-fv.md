# TS loader source review (writer FV)

> 用途：记录 `jiti` 与 `importx` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fv` 标记 2026-08-27 平行 writer FV，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FV
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、register hook、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/jiti` 与 `research-worktrees/importx`（gitignored），不进入 Git
- slugs：本轮新增 `jiti` 与 `importx` 两页；未改 `esbuild`、`swc`、`vite`、`oxc` 正文
- fallback unused：两仓均可固定到内部一致的 tag + npm `gitHead`，未改用其他 TS-loader 对

## jiti

- canonical source：`https://github.com/unjs/jiti`
- revision：`fd3bb289b75ed207edfb686d671ed50144f7e90f`
- git tag：annotated `v2.7.0` → peel 到上述提交
- package：`jiti@2.7.0`（MIT）
- npm gitHead：与 revision 一致
- inspected：
  - `package.json`
  - `README.md`
  - `src/jiti.ts`
  - `src/options.ts`
  - `src/require.ts`
  - `src/eval.ts`
  - `src/transform.ts`
  - `src/babel.ts`
  - `src/utils.ts`
  - `src/cache.ts`
  - `lib/jiti.mjs`
  - `lib/jiti-register.mjs`
  - `lib/jiti-hooks.mjs`
  - `lib/jiti-native.mjs`
  - `lib/jiti-static.mjs`
  - `lib/jiti-cli.mjs`
  - `lib/types.d.ts`
- observed：
  - 发布包零运行时依赖；Babel 转译器打进 `dist/babel.cjs`，由 `lib/jiti.mjs` 惰性 `createRequire`，`jiti/static` 则静态 import 以便 Bun 编译进二进制；
  - `createJiti` 返回可调用对象：同步 `jiti(id)` 走 `async: false`，`jiti.import` 走 `async: true`；类型声明把同步调用标成 deprecated；
  - `evalModule` 用 `vm.runInThisContext` 包一层 CJS/async 函数；ESM 语法失败时改走 `data:` URL，`ENAMETOOLONG` 再落到临时 `.mjs`；
  - `interopDefault` 默认 true，用带 cache 的 Proxy 把 named export 与 `default` 合成一份；
  - `tryNative` 默认只在检测到 Bun 时打开；失败后关掉该旗标重跑转译路径；
  - `jiti/register` 用 `module.register` 挂 hook；hook 里 `ts: url.endsWith("ts")`，`.tsx` 不会被当成 TypeScript；
  - `jiti/native` 不转译，只做 `import.meta.resolve` + `import()` 穷举扩展名；
  - 磁盘缓存版本常量 `9`；默认目录是邻近 `node_modules/.cache/jiti` 或 `{tmpdir}/jiti`。

## importx

- canonical source：`https://github.com/antfu-collective/importx`（`antfu/importx` 301 到此组织）
- revision：`18c23bab2652d034e32c0f77b228d1b38a14b3d8`
- git tag：annotated `v0.5.2` → peel 到上述提交
- package：`importx@0.5.2`（MIT，ESM-only）
- npm gitHead：与 revision 一致；`package.json` repository 仍写 `antfu/importx.git`
- also observed：README 兼容表标注 generated with `v0.4.4`，不是本页绑定版本的运行结果
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/import.ts`
  - `src/types.ts`
  - `src/detect.ts`
  - `src/loaders/jiti.ts`
  - `src/loaders/tsx.ts`
  - `test/detect.test.ts`
- observed：
  - `importx` / `import` 是同一函数；第二参可以是 `parentURL` 或 options；`loader` 缺省读 `IMPORTX_LOADER`，再落到 `auto`；
  - `auto` 按矩阵顺序试 `native` → `tsx` → `jiti` → `bundle-require`，匹配 cache / listDependencies / type / importTS；
  - `isRuntimeSupportsTsx` 要求 Node `>=18.19` 或 `>=20.8`，并拒绝旧 VS Code `microsoft-build < 10629634`；与 README 写的 `^18.18.0` / `^20.6.0` 不一致，以源码为准；
  - `fallbackLoaders` 默认 `['jiti']`；主 loader 失败后按集合继续；
  - `cache: false` 与 `native` 互斥，`cache: true` 与 `bundle-require` 互斥；后者报错文案误写成 native；
  - jiti 适配器用 `createJiti` + `jiti.import`，并把 `cache: false` 映射到 jiti 的旧名 `cache` / `requireCache`；
  - tsx 适配器：`cache === true` 走 scoped `register`，否则走一次性 `tsImport`；
  - `getModuleInfo` 把元数据挂在模块实例的 WeakMap 上。
