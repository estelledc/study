# Test-runner source review (writer AG)

> 用途：记录 Jest、Mocha 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AG
- evidence：GitHub release/tag metadata、npm `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `/tmp/research-worktrees/`，不进入 Git
- target pair：`jest`、`mocha`
- excluded slugs：`vitest`、`playwright`，以及 A–AF 已分配 slug（含 `zustand`、`jotai`、`tanstack-query`、`swr` 等）

## Jest

- canonical source：`https://github.com/jestjs/jest`
- revision：`746f2a0f57c56e3bba555280f0587d40f3db95c0`
- package：`jest@30.4.2`
- tag：`v30.4.2`（annotated object 指向上述 commit；npm `gitHead` 一致）
- engines：`^18.14.0 || ^20.0.0 || ^22.0.0 || >=24.0.0`
- inspected：
  - `package.json`
  - `packages/jest/package.json`
  - `packages/jest-config/src/Defaults.ts`
  - `packages/jest-config/src/getMaxWorkers.ts`
  - `packages/jest-config/src/normalize.ts`
  - `packages/jest-core/src/runJest.ts`
  - `packages/jest-core/src/TestScheduler.ts`
  - `packages/jest-core/src/testSchedulerHelper.ts`
  - `packages/jest-circus/src/state.ts`
  - `packages/jest-circus/src/run.ts`
  - `packages/jest-circus/src/eventHandler.ts`
  - `packages/jest-runtime/src/internals/CjsLoader.ts`
  - `packages/jest-runtime/src/internals/JestGlobals.ts`
  - `packages/jest-runtime/src/internals/ModuleRegistries.ts`
- observed：
  - 默认 `testRunner` 是 `jest-circus/runner`，`automock` 为 `false`，`injectGlobals` 为 `true`，`workerThreads` 为 `false`；
  - 配置默认 `maxWorkers` 是 `'50%'`；`getMaxWorkers` 在未给 argv 且无 options 时才退回 `availableParallelism()-1`（watch 为半数）；
  - `shouldRunInBand` 会在 `runInBand`、`detectOpenHandles`、单测/单 worker，或「≤20 个且历史都快于 1s」时改走主进程；
  - circus 默认 `testTimeout` 为 5000ms，`maxConcurrency` 为 5；`test.concurrent` 经 `p-limit` 限流；
  - `jest.retryTimes` 只对已经产生 `test.errors` 的用例重跑，默认可延迟到 suite 末尾；
  - `eventHandler` 禁止在 test 内再定义 describe/hook/test，且测试必须同步注册；
  - CJS 走模块 registry；`require(ESM)` 需要 Node v24.9+ 的同步 vm module API，否则抛 `ERR_REQUIRE_ESM`；
  - `jest.isolateModules` 是 registry overlay，不是每个测试新建 `vm.Context`。
- provenance：
  - GitHub latest release、tag object 与 npm `jest@30.4.2` 的 `gitHead` 均为 `746f2a0f57c56e3bba555280f0587d40f3db95c0`。

## Mocha

- canonical source：`https://github.com/mochajs/mocha`
- revision：`90c1bb3e183a262ac91d83fa45035d03ea9f6045`
- package：`mocha@11.8.0`
- tag：`v11.8.0`（lightweight tag 即该 commit；npm `gitHead` 一致）
- engines：`^18.18.0 || ^20.9.0 || >=21.1.0`
- inspected：
  - `package.json`
  - `lib/mocharc.json`
  - `lib/mocha.js`
  - `lib/runner.js`
  - `lib/runnable.js`
  - `lib/suite.js`
  - `lib/interfaces/bdd.js`
  - `lib/nodejs/esm-utils.js`
  - `lib/nodejs/parallel-buffered-runner.js`
  - `lib/nodejs/buffered-worker-pool.js`
- observed：
  - 默认 `timeout=2000`、`slow=75`、`reporter=spec`、`ui=bdd`、扩展名 `js/cjs/mjs`；
  - `Runnable` 用 `fn.length` 判断 done-callback 异步；`_retries` 默认 `-1`（不重试）；
  - 实例是有限状态机：`init` / `running` / `referencesCleaned` / `disposed`；
  - 默认串行：`run()` 在非 lazy 时先 `loadFiles()`，同一进程走 `Runner` 遍历 Suite；
  - `--parallel` 且 `jobs` 未设或 `>1` 时换成 `ParallelBufferedRunner`；worker pool 明确使用 `workerType: "process"`，默认 `maxWorkers = workerpool.cpus - 1`；
  - 并行 runner 自己不执行 Runnable，只把文件丢给子进程并回放缓冲事件；
  - `requireOrImport` 在 `process.features.require_module` 时优先 `require`，`.mjs` 仍走 `import()`；否则 `import()` 失败再回退 `require`；
  - 核心不内置断言、mock 或覆盖率。
- provenance：
  - GitHub latest release、tag 与 npm `mocha@11.8.0` 的 `gitHead` 均为 `90c1bb3e183a262ac91d83fa45035d03ea9f6045`。
