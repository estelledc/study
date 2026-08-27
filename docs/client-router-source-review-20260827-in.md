# Client-router source review (writer IN)

> 用途：记录 wouter、navaid 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IN（intern lanes HM–ID）
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- forbidden：未使用 itty-router、find-my-way、path-to-regexp、route-recognizer、radix3、rou3 作为目标；未使用 marked、markdown-it、knex、ioredis、redis、BullMQ

## wouter

- canonical source：`https://github.com/molefrog/wouter`
- revision：`9f7645688909605e47fb49455c885ca6f26d5762`
- package：`wouter@3.9.0`（源码 tag `v3.9.0`，`packages/wouter/package.json`）
- inspected：
  - `package.json`（monorepo 根）
  - `packages/wouter/package.json`
  - `README.md`
  - `packages/wouter/src/index.js`（defaultRouter、matchRoute、Router、Route、Switch、Link、Redirect、useSearchParams）
  - `packages/wouter/src/paths.js`
  - `packages/wouter/src/use-browser-location.js`
  - `packages/wouter/src/use-hash-location.js`
  - `packages/wouter/src/memory-location.js`
- observed：
  - default `parser` is `regexparam.parse`; root `path-to-regexp` is a test/devDependency only;
  - `useBrowserLocation` patches `history.pushState` / `replaceState` once via `Symbol.for("wouter_v3")`;
  - `matchRoute` accepts a RegExp or a pattern string, defaulting empty patterns to `"*"`;
  - `nest` uses loose parse and wraps children in `<Router base={$base}>`;
  - `Switch` cloneElement-injects `match` so the child Route does not rematch;
  - `Link` treats a leading `~` as “do not prefix router.base”;
  - `useSearchParams` in 3.9.0 always concatenates `"?"`, even when the params string is empty;
  - `memoryLocation` at this tag has no `state` getter.
- provenance split：
  - npm `wouter@3.9.0` reports `gitHead=e8726aa807a600688709059a524d3461291e30da` (ancestor of the tag);
  - npm `wouter@3.10.0` reports `gitHead=708c23639d4174ba7deda06c40c8208118899da7` (reachable, no `v3.10.0` tag, package version still `3.9.0`);
  - this review binds the reachable source tag `v3.9.0` peeled commit.

## navaid

- canonical source：`https://github.com/lukeed/navaid`
- revision：`9989c05ece026f2786f3582bb35ea4dc86afc574`
- package：`navaid@1.2.0`
- inspected：
  - `package.json`
  - `readme.md`
  - `src/index.js`
  - `index.d.ts`
  - `builder.js`
  - `test/index.js`（只读，未执行）
- observed：
  - annotated tag `v1.2.0^{}`, package version and npm `gitHead` identify the same commit;
  - `format` returns `false` when the URI is outside `base`; `on404` is skipped in that case;
  - `on` stores `regexparam` compile results; `run` stops at the first `exec` hit;
  - missing optional captures become `null` via `arr[++i] || null`;
  - `route` only calls `history.pushState` / `replaceState`;
  - `listen` patches history once using `history.push` / `history.replace` as flags, then binds popstate / pushstate / replacestate / click;
  - `unlisten` exists only after `listen()`;
  - runtime dependency is `regexparam@^1.0.2`, not `path-to-regexp`.
