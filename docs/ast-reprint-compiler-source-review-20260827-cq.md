# AST reprint / compiler source review (writer CQ)

> 用途：记录 Recast、Babel 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、codemod、transform 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `oxc`、`swc`，也未占用当时仍 open 的 CQ PR slug

## Recast

- canonical source：`https://github.com/benjamn/recast`
- revision：`93325e37b544b1f3d69d46efbee23cf2f5b86efd`
- package：`recast@0.24.0`
- tag：`v0.24.0`
- provenance：GitHub annotated tag `v0.24.0` 剥开后与 npm `recast@0.24.0` 的 `gitHead` 均指向 `93325e37...`；`package.json` 版本为 `0.24.0`
- inspected：
  - `package.json`
  - `main.ts`
  - `lib/parser.ts`
  - `lib/printer.ts`
  - `lib/patcher.ts`
  - `lib/options.ts`
  - `parsers/esprima.ts`
  - `parsers/babel.ts`
  - `test/visit.ts`
  - `test/identity.ts`
- observed：
  - 公开入口是 `parse` / `print` / `prettyPrint` / `visit` / `run`；`visit` 再导出 `ast-types`；
  - `print()` 返回 `{ code, map? }`，`toString()` 只警告一次并返回 `.code`；
  - 默认 parser 是 `recast/parsers/esprima`；`esprima` 选项仍可覆盖 `parser`；
  - `parse()` 先展开 tab，再让 parser 产出 AST；`Program` 根包成 `File`；`TreeCopier` 写 `original` 与 token 范围；
  - `Printer.print()` 能对上 `original.loc.lines` 时走 `getReprinter()` / `Patcher`，否则 generic print；`prettyPrint()` 不复用原文；
  - `parsers/babel.ts` 运行时 `require("@babel/parser")`，失败再试 `babylon`；`@babel/parser` 不在 runtime dependencies；
  - `engines.node` 为 `>= 22`；身份测试断言 `print(parse(source)).code === source`。

## Babel

- canonical source：`https://github.com/babel/babel`
- revision：`8ed5db1bc5bed6c0b640cc06bae447acf6395c02`
- monorepo tag：`v8.0.4`
- packages at this revision：`@babel/core@8.0.1`、`@babel/parser@8.0.4`、`@babel/cli@8.0.4`、`@babel/preset-env@8.0.2`
- provenance：GitHub annotated tag `v8.0.4` 剥开后指向 `8ed5db1bc...`。npm `@babel/core@8.0.1` 与 `@babel/parser@8.0.4` 均无 `gitHead`，未把 npm tarball 伪造成 pin。GitHub `latest` release 名在 2026-08-27 取数时仍是较晚发布的 `v7.29.8`（剥开后 `5de11ca9...`）；本文以可达 8.x tag 为准，不猜测 7.x 指针。
- inspected：
  - `packages/babel-core/package.json`
  - `packages/babel-core/src/index.ts`
  - `packages/babel-core/src/transform.ts`
  - `packages/babel-core/src/parse.ts`
  - `packages/babel-core/src/transformation/index.ts`
  - `packages/babel-core/src/config/files/configuration.ts`
  - `packages/babel-parser/package.json`
  - `packages/babel-parser/src/index.ts`
  - `packages/babel-cli/package.json`
  - `packages/babel-cli/src/babel/index.ts`
  - `packages/babel-cli/src/babel/options.ts`
  - `packages/babel-preset-env/package.json`
- observed：
  - `transform()` / `parse()` 无 callback 时抛 `Starting from Babel 8.0.0, the 'transform' function expects a callback.`；同步入口是 `transformSync` / `parseSync`；
  - `transform*` 主链是 `loadConfig` → `run()` → `normalizeFile` → 多 pass `plugin.pre` / merged visitor / `plugin.post` → `generateCode`；
  - 每个 pass 追加内部 block-hoist 插件；默认不把 AST 放进返回值，除非 `opts.ast === true`；
  - 根配置文件包含 `babel.config.ts` / `.mts` / `.cts`；相对配置是 `.babelrc` 与 `.babelrc.js` / `.cjs` / `.mjs` / `.json` / `.cts`，**没有** `.babelrc.ts`；
  - `DEFAULT_EXTENSIONS` 为 `.js` `.jsx` `.es6` `.es` `.mjs` `.cjs`，不含 `.ts`；
  - CLI：`parseArgv` 失败 `exitCode = 2`；有 `--out-dir` 走目录命令，否则走文件命令；命令失败 `exitCode = 1`；
  - `@babel/parser` 的 `sourceType: "unambiguous"` 先按 module 解析，再按歧义回退 script；
  - `engines.node` 为 `^22.18.0 || >=24.11.0`。
