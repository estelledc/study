# CLI-UX source review

> 用途：记录 consola、ora 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、终端渲染、prompt、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## consola

- canonical source：`https://github.com/unjs/consola`
- revision：`2cfcfc08275d7d2777c11310c9c2deab2a872c41`
- package：`consola@3.4.2`
- inspected：
  - `package.json`
  - `build.config.ts`
  - `src/index.ts`
  - `src/consola.ts`
  - `src/constants.ts`
  - `src/types.ts`
  - `src/browser.ts`
  - `src/core.ts`
  - `src/shared.ts`
  - `src/prompt.ts`
  - `src/reporters/basic.ts`
  - `src/reporters/fancy.ts`
  - `test/consola.test.ts`
  - `README.md`
- observed：
  - published `package.json` has no runtime `dependencies`; `unbuild` sets `inlineDependencies: true`, so `defu`、`std-env`、`@clack/prompts` and related helpers are bundled into dist;
  - Node factory in `src/index.ts` picks default level via std-env (`isDebug` → 4, `isTest` → 1, else 3) and then `CONSOLA_LEVEL` through `Number.parseInt`; browser/core factories do not read that env var;
  - Node default reporter is `FancyReporter` unless `fancy === false` or std-env `isCI`/`isTest` selects `BasicReporter`; `options.reporters` overrides both;
  - `Consola` normalizes options with `defu`, default `throttle: 1000`, `throttleMin: 5`, `formatOptions: { date: true, colors: false, compact: true }`;
  - each `LogType` becomes a method via `_wrapLogFn`; a log is dropped when `defaults.level > instance.level`;
  - identical `type+tag+args` inside the throttle window increment a counter; after `throttleMin` the extra copies are delayed and flushed as `(repeated N times)`;
  - `pauseLogs`/`resumeLogs` use module-level `paused` and `queue`, so pause is process-global across instances;
  - `wrapStd` redirects both stdout and stderr writes through the `log` type; `BasicReporter` still writes `level < 2` to stderr and the rest to stdout;
  - `prompt` is lazy-imported and wraps `@clack/prompts` (`text`/`confirm`/`select`/`multiselect`); cancel defaults to `"default"` (`default` or `initial`);
  - export map distinguishes Node / browser / `./basic` / `./core` / `./utils`; Node `require` goes through `./lib/index.cjs`;
  - engines: `node ^14.18.0 || >=16.10.0`.
- provenance note：
  - npm `consola@3.4.2` reports `gitHead=2cfcfc08275d7d2777c11310c9c2deab2a872c41`;
  - GitHub annotated tag `v3.4.2` peels to the same commit, whose `package.json` reports `3.4.2`;
  - this review binds that tag/package/revision.

## ora

- canonical source：`https://github.com/sindresorhus/ora`
- revision：`79cd8c15ac34572cffb3ab53e3d4b6bab6d59ea8`
- package：`ora@9.4.1`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - constructor defaults: `color: 'cyan'`, `stream: process.stderr`, `discardStdin: true`, `hideCursor: true`, `isSilent: false`;
  - `isEnabled` defaults to `isInteractive({stream})` when not a boolean; `isEnabled` getter is `options.isEnabled && !options.isSilent`;
  - spinner defaults to `cli-spinners.dots` when Unicode is supported, otherwise `cli-spinners.line`; `interval` is `options.interval ?? spinner.interval ?? 100`;
  - `start()` is a no-op when silent; when disabled it writes one static `'-'` line plus newline and returns;
  - enabled `start()` hides the cursor, starts `stdin-discarder` on TTY stdin, hooks `this.#stream` plus `process.stdout` and `process.stderr`, then `setInterval(render, interval)`;
  - a second ora instance hooking the same stream logs `[ora] Multiple concurrent spinners detected...`;
  - TTY `render()` wraps the frame in CSI `?2026` synchronized output, truncates when line count exceeds `stream.rows`, and pauses on write backpressure until `drain`;
  - external writes clear the spinner, pass through, and re-render; a chunk that does not end with `\n`/`\r` defers re-render by 200ms;
  - `succeed`/`fail`/`warn`/`info` call `stopAndPersist` with `log-symbols`; `oraPromise` starts a spinner, uses `succeed`/`fail` (or custom symbols), and rethrows on rejection;
  - engines: `node >=20`; package is ESM-only (`type: module`, `exports.default: ./index.js`).
- provenance note：
  - npm `ora@9.4.1` reports `gitHead=79cd8c15ac34572cffb3ab53e3d4b6bab6d59ea8`;
  - GitHub annotated tag `v9.4.1` peels to the same commit, whose `package.json` reports `9.4.1`;
  - this review binds that tag/package/revision.
