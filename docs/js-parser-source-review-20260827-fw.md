# Acorn / Meriyah source review (writer FW)

> 用途：记录 `acorn` 与 `meriyah` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fw` 标记 2026-08-27 平行 writer FW。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FW
- evidence：GitHub tag metadata、npm latest 与 `gitHead`、固定提交静态源码与 changelog 阅读
- not executed：未安装两仓依赖，未运行上游 test / test262 / vitest，未测 parse 吞吐或内存
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：清单原先没有这两个页面；两仓小、tag 与 npm `gitHead` 同指，按指定目标新建

## acorn

- canonical source：`https://github.com/acornjs/acorn`
- revision：`d788421b242ddccb28040f1431438ee5cf474208`
- git tag：`8.18.0`（annotated tag，解引用到上述 commit）
- package：`acorn@8.18.0`（MIT）；同提交 `acorn-walk@8.3.5`、`acorn-loose@8.5.2`
- npm：`acorn@8.18.0` latest，`gitHead` 与 tag 一致
- inspected：
  - `acorn/package.json`
  - `acorn/README.md`
  - `acorn/CHANGELOG.md`
  - `acorn/src/index.js`
  - `acorn/src/options.js`
  - `acorn/src/state.js`
  - `acorn/src/statement.js`
  - `acorn/src/expression.js`
  - `acorn/src/tokenize.js`
  - `acorn/src/parseutil.js`
  - `acorn/src/location.js`
  - `acorn/src/scope.js`
  - `acorn/src/scopeflags.js`
  - `acorn-walk/package.json`
  - `acorn-loose/package.json`
- observed：
  - 导出 `parse` / `parseExpressionAt` / `tokenizer`；`Parser.extend(...plugins)` 做插件；
  - `ecmaVersion` 缺省会 `console.warn` 并落到内部 `11`（2020），文档写明未来会停；`"latest"` 写成 `1e8`；年份值先减 `2009`；
  - `sourceType` 可为 `script` / `module` / `commonjs`；`commonjs` 顶层进 `SCOPE_FUNCTION`，但 `Program.sourceType` 仍写成 `"script"`；
  - `allowHashBang` 在未显式传入时，`ecmaVersion >= 14` 为真；`strict` 可把 script 直接开严格模式；
  - 只实现 stage 4；JSX / 提案语法要走插件，不在本包；
  - `using` / `await using` 要求 `ecmaVersion >= 17`；`8.16.0` 起认 Unicode 17；
  - `parse()` 用 `catchStackOverflow` 把递归溢出改写成 `Not enough stack space to parse input`；
  - `raise` 抛带 `pos` / `loc` / `raisedAt` 的 `SyntaxError`；`raiseRecoverable` 与 `raise` 是同一函数；
  - `engines.node` 为 `>=0.4.0`；发布物双入口 `dist/acorn.mjs` / `dist/acorn.js`。
- provenance：
  - GitHub tag `8.18.0`、npm latest 与 `gitHead` 三方均为 `d788421b...`。

## meriyah

- canonical source：`https://github.com/meriyah/meriyah`
- revision：`3e586e4c957a438bf872a9d09aab334a3cea3f8d`
- git tag：`v7.3.2`（annotated tag，解引用到上述 commit）
- package：`meriyah@7.3.2`（ISC）
- npm：`meriyah@7.3.2` latest，`gitHead` 与 tag 一致
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `src/meriyah.ts`
  - `src/options.ts`
  - `src/features.ts`
  - `src/parser.ts`
  - `src/parser/parser.ts`
  - `src/parser/scope.ts`
  - `src/errors.ts`
  - `src/lexer/comments.ts`
  - `src/lexer/scan.ts`
- observed：
  - 推荐入口是 `parse(source, options)`；`parseScript` / `parseModule` 标 `@deprecated`；
  - 默认 `sourceType` 未设时按 script 走；`commonjs` 置 `InReturnContext | AllowNewTarget`，AST 上 `Program.sourceType` 仍是 `'script'`；
  - `next` 只打开 `Decorators | ImportDefer | ImportSource`，不是任意 stage 3；
  - `jsx: true` 走内建 JSX lexer；文档写明不解析 TypeScript / Flow；
  - `validateRegex` 默认 `true`，用宿主 `RegExp` 验字面量，合规性随运行时变；
  - `ranges` 可为 `true` 或 `{ start, end, range }`；`loc` / `raw` / `lexical` / `webcompat` / `impliedStrict` 各自独立；
  - `skipHashBang` 在 `parseSource` 入口无条件调用，没有对应 option；
  - `ParseError` 继承 `SyntaxError`，带 `description` 与起止 `loc`；`isParseError` 做 `instanceof`；
  - `engines.node` 为 `>=20.0.0`；devDependency 钉了 `acorn@^8.18.0` 做对照，不是运行时依赖。
- provenance：
  - GitHub release / tag `v7.3.2`、npm latest 与 `gitHead` 三方均为 `3e586e4c...`。
