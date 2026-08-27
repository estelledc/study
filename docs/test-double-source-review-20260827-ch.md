# Test double source review

> 用途：记录 Sinon、testdouble.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CH
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与 README / docs 阅读
- not executed：未安装两仓依赖，未运行上游 mocha / teenytest / example、fake-timer、quibble loader、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Sinon

- canonical source：`https://github.com/sinonjs/sinon`
- revision：`ab289e92cdd76caf8cec2b0a8c9a391283e6c9df`
- package：`sinon@22.1.0`
- provenance：GitHub tag `v22.1.0` 与 npm `22.1.0` 的 `gitHead` 指向同一提交
- inspected：
  - `package.json`
  - `src/sinon.js`
  - `src/create-sinon-api.js`
  - `src/sinon/sandbox.js`
  - `src/sinon/create-sandbox.js`
  - `src/sinon/spy.js`
  - `src/sinon/stub.js`
  - `src/sinon/fake.js`
  - `src/sinon/behavior.js`
  - `src/sinon/default-behaviors.js`
  - `src/sinon/mock.js`
  - `src/sinon/util/fake-timers.js`
  - `COMPATIBILITY.md`
  - `README.md`
- observed：
  - default export is `createApi()` which `extend`s a `Sandbox` with `createSandbox`, `match`, `restoreObject`, `createStubInstance`, `addBehavior`, `promise` and timers;
  - `createSandbox` is intentionally not pushed into the default sandbox collection so `sinon.restore()` does not cascade-restore sub-sandboxes (comment cites 21.1.0 / #2701);
  - `sandbox.spy` / `stub` pass a per-sandbox `{ callId }` context; `stub(obj, 'meth', fn)` throws as removed;
  - `stubImpl` rejects ES modules, missing properties, and non-configurable / non-writable descriptors; whole-object stub walks own methods;
  - stub invoke picks the matching fake with the longest `matchingArguments`, then `behaviors[callCount - 1]` or `defaultBehavior`;
  - `behavior.invoke` runs `callsArg` / yield callbacks first, then throw / returnArg / fakeFn / resolve / callsThrough / returnValue;
  - `sandbox.replace` requires an existing same-type data property and records a restorer; accessors must use `replaceGetter` / `replaceSetter`; `define` is for new own properties;
  - leak warning fires after 10000 collected fakes unless `leakThreshold` is changed;
  - `useFakeTimers` with no args installs `@sinonjs/fake-timers` at `now: 0`;
  - package `exports` map `require` to `./lib/sinon.js` and browser/import to `./pkg/sinon-esm.js`; README states `lib/` is generated and not committed;
  - no `engines` field; `COMPATIBILITY.md` targets ES2023+, browserslist `maintained node versions`, and not IE 11.

## testdouble.js

- canonical source：`https://github.com/testdouble/testdouble.js`
- revision：`293753e7380eab997a23d09014f4595313c2f2b0`
- package：`testdouble@3.20.2`
- provenance：GitHub tag `v3.20.2` 与 npm `3.20.2` 的 `gitHead` 指向同一提交
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/index.mjs`
  - `src/function.js`
  - `src/when.js`
  - `src/verify.js`
  - `src/object.js`
  - `src/replace/index.js`
  - `src/replace/property.js`
  - `src/replace/module/index.js`
  - `src/store/stubbings.js`
  - `src/args-match.js`
  - `src/reset.js`
  - `src/config.js`
  - `src/version.js`
  - `docs/5-stubbing-results.md`
  - `docs/6-verifying-invocations.md`
  - `docs/7-replacing-dependencies.md`
  - `README.md`
- observed：
  - published CJS/ESM entries import `./function.js`, `./when.js` and `./verify.js` (store + global call stack), not the sibling `function/`, `when/`, `verify/` CallLog packages;
  - `td.function()` logs each call then `stubbings.invoke`; `td.when(...)` / `td.verify(...)` ignore their first argument and `pop()` the last recorded call as rehearsal / demonstration;
  - stubbing match is last-in-wins (`_.findLast`) plus `times`; sequential `thenReturn` values index by `callCount`, then stay on the last outcome;
  - argument match is exact arity unless `ignoreExtraArgs`, and uses lodash equality plus optional matchers;
  - `td.verify` throws an unsatisfied message listing wanted vs actual calls; it warns when the same args were also stubbed;
  - `td.replace(string)` goes through quibble (Jest CJS has a special path); `td.replaceEsm` requires `--loader=testdouble` / quibble loader and throws under Jest;
  - property replace imitates or accepts a manual fake, then registers `reset.onNextReset` to restore or delete;
  - `td.object` accepts a name/proxy, an array of method names, or an object-like value to imitate; passing a function errors since 2.0.0;
  - `td.reset()` clears the store, `quibble.reset()`, and both persistent / next-reset handlers;
  - package `engines` declare Node `>= 16`; `exports` expose types, `./lib/index.js` and `./lib/index.mjs`.
