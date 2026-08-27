# Route-pattern source review (writer IJ)

> 用途：记录 url-pattern、regexparam 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- not selected：path-to-regexp、route-recognizer、radix3、rou3、itty-router、find-my-way（开放 PR 已占用）

## url-pattern

- canonical source：`https://github.com/snd/url-pattern`
- revision：`195d77082e438bcacaf095ecb812d80eeac456ae`
- package：`url-pattern@1.0.3`
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `index.d.ts`
  - `lib/url-pattern.js`（UMD、parser combinator、AST、`match`、`stringify`）
- observed：
  - `package.json` version is `1.0.3`, `main=lib/url-pattern`, `engines.node >= 0.12.0`, no runtime dependencies;
  - constructor accepts a string or `RegExp`; empty string and whitespace throw; string patterns compile once via combinators into AST then `RegExp`;
  - AST tags are `wildcard` / `named` / `static` / `optional`; optional uses `()`; wildcard names become `_`;
  - default named-value charset is `a-zA-Z0-9-_~ %`; compiled regex is `^...$` with no `i` flag;
  - `match` maps capture groups onto names, stacking duplicates into arrays;
  - `stringify` walks the AST and refuses regex-originated patterns;
  - CoffeeScript source exists as `src/url-pattern.coffee`; published entry is the compiled `lib/url-pattern.js`.
- provenance split：
  - npm `url-pattern@1.0.3` reports `gitHead=195d77082e438bcacaf095ecb812d80eeac456ae`, which is reachable on `snd/url-pattern`;
  - GitHub has no `1.0.3` tag; the newest source tag is `1.0.1` → `41ddfece274a6fb840a97d04e3ae047e6414b861`;
  - this review binds the reachable npm `gitHead`, not an invented tag.

## regexparam

- canonical source：`https://github.com/lukeed/regexparam`
- revision：`d05da2631beb7c5620774dae207cb09c7cbf24cc`
- package：`regexparam@3.0.0`
- inspected：
  - `package.json`
  - `readme.md`
  - `index.d.ts`
  - `src/index.js`（`parse`、`inject`）
  - `test/parse.js` / `test/inject.js`（只读对照，未执行）
- observed：
  - tag `v3.0.0`、package version and npm `gitHead` identify the same commit;
  - `exports` point at `dist/index.mjs` / `dist/index.js`; `dist/` is not in the source tree;
  - `parse(string)` splits on `/`, normalizes a missing lead slash, and builds `^.../?$` with the `i` flag;
  - named keys become `([^/]+?)`; optional keys wrap a non-capturing group; `*` keys become `(.*)`;
  - `parse(RegExp)` returns `{ keys: false, pattern: input }` and ignores `loose`;
  - `loose` changes the suffix from `/?$` to `(?=$|/)`;
  - `inject` keeps missing required `:name` text, drops missing optional / wildcard segments;
  - `engines.node >= 8`; README size claims were not measured.
