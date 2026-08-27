# Util-lib source review (writer AH)

> 用途：记录 lodash、Ramda 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：AH
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## lodash

- canonical source：`https://github.com/lodash/lodash`
- revision：`cb0b9b9212521c08e3eafe7c8cb0af1b42b6649e`
- package：`lodash@4.18.1`（源码 tag `4.18.1`）
- inspected：
  - `package.json`
  - `README.md`
  - `lodash.js`（VERSION、wrapper、LazyWrapper、baseClone、baseIteratee、baseSet、debounce、throttle、set、cloneDeep、wrapperValue、isLaziable）
  - `fp/_mapping.js`（alias、aryRearg、mutate）
- observed：
  - source repo `package.json` is `private: true` with `main=lodash.js` and `engines.node >= 4.0.0`;
  - `_(value)` builds `LodashWrapper`; `_.chain` sets `__chain__`; `value()` goes through `wrapperValue`;
  - `baseIteratee` maps function / null / array / object / property-name shorthands;
  - `debounce` defaults to trailing-only; `throttle` is `debounce` plus `maxWait=wait` and default `leading=true`;
  - `_.set` mutates via `baseSet` and rejects `__proto__` / `constructor` / `prototype` path keys;
  - `cloneDeep` uses `baseClone` with deep + symbols flags and a `Stack` for cycles;
  - FP mapping marks assign/set/pull-family methods as mutating so the FP build can rewrite them.
- provenance split：
  - npm `lodash@4.18.1` reports `gitHead=4f0b76e2eca13de1c1fe8b4305abc1f7d63f4b86` (`4.18.1-npm^{}`);
  - npm `lodash-es@4.18.1` reports `gitHead=d85490ebfb8f49ddc1eab84892aa33a3ef547894` (`4.18.1-es^{}`);
  - this review binds the reachable source tag `4.18.1` peeled commit, not the npm publish trees.

## Ramda

- canonical source：`https://github.com/ramda/ramda`
- revision：`f0b1fb524a681bc8c37dd6c35886420f8c2470c3`
- package：`ramda@0.32.0`
- inspected：
  - `package.json`
  - `README.md`
  - `source/index.js`
  - `source/curry.js`
  - `source/curryN.js`
  - `source/internal/_curryN.js`
  - `source/internal/_isPlaceholder.js`
  - `source/__.js`
  - `source/pipe.js`
  - `source/compose.js`
  - `source/flow.js`
  - `source/map.js`
  - `source/internal/_dispatchable.js`
  - `source/assoc.js`
  - `source/assocPath.js`
  - `source/clone.js`
- observed：
  - tag `v0.32.0^{}`, package version and npm `gitHead` identify the same commit;
  - `exports` select `src/index.js` for require and `es/index.js` for import; `sideEffects` is false;
  - `source/index.js` has 272 `export { default as ... }` lines;
  - `curry` uses `fn.length`; default parameters shrink arity and break later application;
  - `_curryN` fills `R.__` placeholders (`@@functional/placeholder`) before deciding to invoke;
  - `pipe` / `compose` are not auto-curried; `compose` reverses into `pipe`;
  - `assocPath` shallow-copies the write path; `map` dispatches to functor / transducer / array / object / function cases.
