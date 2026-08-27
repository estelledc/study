# URL + query-string source review (writer FJ)

> 用途：记录 `ufo` 与 `query-string` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fj` 标记 2026-08-27 平行 writer FJ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL FJ
- evidence：GitHub metadata、npm provenance 与固定提交静态源码 / 测试阅读
- not executed：未安装两仓依赖，未跑 vitest / ava / tsd / benchmark，未测 bundle 或吞吐
- worktrees：本机 `research-worktrees/ufo` 与 `research-worktrees/query-string`（gitignored），不进入 Git
- slugs：`ufo`、`query-string`；本轮为新建 study-v2 页，不是改写既有 legacy 正文

## ufo

- canonical source：`https://github.com/unjs/ufo`
- tag：`v1.6.4`
- revision：`f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6`
- package：`ufo@1.6.4`（MIT，零运行时依赖）
- npm gitHead：与 revision / tag 一致
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/parse.ts`
  - `src/query.ts`
  - `src/encoding.ts`
  - `src/url.ts`
  - `src/utils.ts`
  - `test/query.test.ts`
  - `README.md`
- observed：
  - `parseURL` 把 `blob:` / `data:` / `javascript:` / `vbscript:` 单列；无协议时走 `parsePath`，除非给 `defaultProto`；
  - `parseQuery` 用 `Object.create(null)`，忽略 `__proto__` / `constructor`，重复 key 升级为数组；
  - `stringifyQuery` 过滤 `undefined`；`encodeQueryItem` 先把 number/boolean `String`，假值（`null` / `""`）输出裸 key；对象值 `JSON.stringify`；
  - `joinURL` 不处理 `..`（源码 TODO）；`joinRelativeURL` 处理 `.` / `..`；
  - `withoutBase` 折叠前导斜杠，避免协议相对 URL；
  - `$URL` / `createURL` 标 deprecated。

## query-string

- canonical source：`https://github.com/sindresorhus/query-string`
- tag：`v9.5.0`
- revision：`aae373a54526c7b297f60e4d7b77eb0709d2ae9c`
- package：`query-string@9.5.0`（MIT，ESM-only，`node>=18`）
- npm gitHead：与 revision / tag 一致
- dependencies：`decode-uri-component@^0.5.0`、`filter-obj@^5.1.0`、`split-on-first@^3.0.0`
- inspected：
  - `package.json`
  - `index.js`
  - `base.js`
  - `base.d.ts`
  - `readme.md`
  - `test/parse.js`、`test/stringify.js`、`test/parse-url.js`、`test/stringify-url.js`
- observed：
  - 默认 `arrayFormat: 'none'`、`sort: true`、`decode/encode: true`、`strict: true`；
  - 缺 `=` 的参数值为 `null`（源码引用 W3C URL 草稿）；
  - 数组方言：`none` / `bracket` / `index` / `comma` / `separator` / `bracket-separator` / `colon-list-separator`；分隔符必须是单字符；
  - `stringifyUrl` 合并 URL 自带 query 与传入对象，对象覆盖；fragment 可用 `https://query-string.invalid` 作 base 的 `URL` 编码；
  - README / `base.d.ts` 声称 plain object stringify 会 throw；`base.js` 无独立拒绝分支，对象经 `encodeURIComponent` 变成 `[object Object]`。
