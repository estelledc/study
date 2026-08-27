# TS transpile source review

> 用途：记录 sucrase、ts-jest 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL DU
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、Jest、sucrase CLI、require hook、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- out of scope：native [[swc]]、[[esbuild]]、tsx；本对是「JS 实现的按文件剥类型」与「Jest 里包一层 TypeScript compiler API」

## sucrase

- canonical source：`https://github.com/alangpierce/sucrase`
- revision：`280ee202e73b18e396069782bd41e1eaaccbf620`
- package：`sucrase@3.35.1`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/Options.ts`
  - `src/cli.ts`
  - `src/register.ts`
  - `src/TokenProcessor.ts`
  - `src/transformers/RootTransformer.ts`
  - `src/transformers/TypeScriptTransformer.ts`
  - `src/transformers/JestHoistTransformer.ts`
  - `src/transformers/JSXTransformer.ts`
  - `src/util/getJSXPragmaInfo.ts`
  - `bin/sucrase-node`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - `transform(code, options)` 先 `validateOptions`（`ts-interface-checker` 的 `strictCheck`），再 `parse` → `TokenProcessor` → `RootTransformer.transform()`；sourcemap 另外要 `filePath`；
  - `transforms` 是无序名字数组：`jsx` / `typescript` / `flow` / `imports` / `react-hot-loader` / `jest`；没有这个数组就不能工作；
  - 架构是 token 改写，不是 Babel 式 AST visitor。parser 给 token 标 `isType`；`processPossibleTypeRange()` 连续删掉 type token。TS 的 `public`/`protected`/`private`/`abstract`/`readonly`/`override` 与非空断言也是删 token；
  - `enum` / `const enum` 都在当前文件改写成 IIFE + `var Name`；没有跨文件 inlining；
  - 未开 `imports` 时仍挂 `ESMImportTransformer`，用来做 TS/Flow 的 type-only import 裁剪；`keepUnusedImports` 关掉自动 elision（对标 `verbatimModuleSyntax`）；
  - 默认会做 optional chaining / nullish / numeric separator / optional catch；`disableESTransforms: true` 才退出；
  - JSX 默认 `jsxRuntime` 未设时走 classic，`getJSXPragmaInfo` 默认 `React.createElement` / `React.Fragment`。README 写成 `React.createClass` 与源码不符；
  - `registerTS` / `registerTSX` 固定带 `imports`，即 require hook 默认打成 CJS；`SUCRASE_OPTIONS` 环境变量必须是 JSON，会覆盖 hook 选项；
  - `sucrase-node` 只 `require("../register")` 再 `Module.runMain()`，不转发 Node/V8 参数；
  - CLI 无 `--transforms` 且无 `--project` 会直接退出。`--project` 用 `JSON.parse` 读 `tsconfig.json`（不吃注释），只看 `files`/`include`，源码标了 `TODO: read exclude`；`module === "commonjs"` 才加 `imports`；`esModuleInterop !== true` 才开 legacy TS interop；
  - `jest` transform 只提升顶层 `jest.mock` / `unmock` / `enableAutomock` / `disableAutomock`；
  - engines：`node >=16 || 14 >=14.17`；3.35.1 把 CLI glob 换成 `tinyglobby`；
  - `getVersion()` 在源码里写死 `"3.35.1"`。
- provenance note：
  - npm `sucrase@3.35.1` 的 `gitHead` 是父提交 `fa5b7abfb5588afc20c6c28f23a95b9e347215d7`，该提交 `package.json` 仍是 `3.35.0`（内容是 Switch to tinyglobby #846）；
  - 仓库没有 `v3.35.1` tag / GitHub release；
  - 自报 `3.35.1` 的提交是 `280ee202e73b18e396069782bd41e1eaaccbf620`（parent = 上述 gitHead，信息 `v3.35.1`）；
  - 本审查绑定这份自报版本一致的 revision，并披露 npm `gitHead` 指向其父提交。

## ts-jest

- canonical source：`https://github.com/kulshekhar/ts-jest`
- revision：`3f05625da10da954fdf0a10394385008275ddbb3`
- package：`ts-jest@29.4.12`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/types.ts`
  - `src/legacy/ts-jest-transformer.ts`
  - `src/legacy/compiler/ts-compiler.ts`
  - `src/legacy/compiler/ts-jest-compiler.ts`
  - `src/legacy/config/config-set.ts`
  - `src/presets/create-jest-preset.ts`
  - `src/transformers/hoist-jest.ts`
  - `README.md`
- observed：
  - 默认导出 `createTransformer(options)`，构造 `TsJestTransformer`；这是 Jest `SyncTransformer`；
  - `TsJestCompiler` 注释写明以后可接其他 compiler，固定 29.4.12 只实例化 `TsCompiler`（TypeScript API）；
  - `isolatedModules` 默认来自解析后的 tsconfig；选项里的 `isolatedModules` 已 deprecated，写了会警告。false → Language Service；true → `transpileModule` / 自研 `tsTranspileModule`；
  - Language Service 路径会 `getEmitOutput` + `getDiagnostics`。非 ESM 模式调用 `raiseDiagnostics`；`diagnostics.throws` 默认 true，Warning/Error 会抛。ESM 模式（`useESM && supportsStaticESM`）在 LS 路径跳过这次 raise；
  - `processAsync` 若 `processWithTs` 带回 `diagnostics` 会再抛一次；同步 `process()` 只取 `.code`，依赖 compiler 内部已经 raise；
  - `babelConfig` 有值才创建 `babel-jest` transformer，作为第二段，且 `instrument: false`（覆盖率仍交给 Jest）；
  - `resolvedTransformers.before` 默认带 `hoist-jest`；用户 `astTransformers` 再追加；
  - `.d.ts` 输出空字符串；`stringifyContentPathRegex` 命中则 `module.exports=${JSON}`；`node_modules` 里的 JS 走 `ts.transpileModule`，不进 LS；
  - `globals['ts-jest']` 仍能合并，但会打 deprecation；transformer 构造参数优先；
  - cache key 在非 isolated 且有 `tsCacheDir` 时并入解析到的依赖路径与 `mtimeMs`；
  - preset 工厂按 CJS/ESM × default / js-with-ts / js-with-babel × current/legacy 切 transform 正则；
  - peer：`jest` `^29 || ^30`，`typescript` `>=4.3 <7`；`@babel/core` / `babel-jest` / `esbuild` 为 optional peer；engines：`node ^14.15.0 || ^16.10.0 || ^18.0.0 || >=20.0.0`。
- provenance note：
  - npm `ts-jest@29.4.12` 报告 `gitHead=3f05625da10da954fdf0a10394385008275ddbb3`；
  - GitHub lightweight tag `v29.4.12` 指向同一提交，`package.json` 为 `29.4.12`；
  - 本审查绑定该 tag/package/revision。
