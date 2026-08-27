# Worker pool source review (writer FS)

> 用途：记录 `tinypool` 与 `piscina` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fs` 标记 2026-08-27 平行 writer FS，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FS
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未启动 worker / child_process，未运行上游 test、bench 或测量 bundle / 吞吐
- worktrees：本机 `research-worktrees/tinypool` 与 `research-worktrees/piscina`（gitignored），不进入 Git
- slugs：`tinypool`、`piscina`；本轮新建页面，不是改写既有笔记

## tinypool

- canonical source：`https://github.com/tinylibs/tinypool`
- tag：annotated `v2.1.2` 解引用到该提交（subject `2.1.2`，2026-08-23；与 `origin/main` 同指）
- revision：`5e18382a9aaa3344035905384b18a88a9da8c8bb`
- package：`tinypool@2.1.2`（MIT，`type: module`，零运行时依赖）
- npm：latest `2.1.2`，无 `gitHead`；身份靠 tag + package version + commit SHA
- engines：`^20.0.0 || >=22.0.0`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/common.ts`
  - `src/entry/worker.ts`
  - `src/entry/utils.ts`
  - `src/entry/process.ts`
  - `src/runtime/thread-worker.ts`
  - `src/runtime/process-worker.ts`
  - `test/simple.test.ts`
  - `test/runtime.test.ts`
  - `test/options.test.ts`
- observed：
  - 默认 `runtime: 'worker_threads'`；`child_process` 走 `ProcessWorker` + `fork(entry/process.js)`，`SIGKILL` 兜底 1000ms；
  - 池大小用 `os.availableParallelism()`，**不是** README 仍写的 `physical-cpu-count`；`minThreads` 默认 `max(cpuCount / 2, 1)`（不 `floor`），`maxThreads` 默认 `cpuCount`；
  - `run()` 的 `options.runtime` 被传入 `runTask` 后丢弃；换运行时要走 `recycleWorkers({ runtime })`；
  - `isolateWorkers` / `teardown` / `maxMemoryLimitBeforeRecycle` 在任务结束后回收 worker；
  - `useAtomics` 为布尔，默认 true；worker 侧仍认 `PISCINA_DISABLE_ATOMICS`；
  - `TinypoolChannel.onMessage` / `postMessage` 在 `worker_threads` 上直接抛错，只给 `child_process` 镜像 IPC；
  - 无 `utilization`、无 `niceIncrement`、无 `close()`，公开收口是 `destroy()`。
- also observed：README 仍写 “Node.js 18.x and higher” 与 38KB install size；本页不把这两项当固定源码合同。

## piscina

- canonical source：`https://github.com/piscinajs/piscina`
- tag：lightweight `v5.3.1`（release target `v5`，2026-08-21）
- revision：`6a23286fb7e3d28aa1745add5014f7187bc0389a`
- package：`piscina@5.3.1`（MIT；CJS `dist/main.js` + ESM wrapper）
- npm：latest `5.3.1`，无 `gitHead`
- engines：`>=20.x`
- optionalDependency：`@napi-rs/nice@^1.0.4`（`niceIncrement !== 0` 时动态 `import`）
- also observed：同仓存在 `v6.0.0-rc.4` → `bdd9dba8...`，未绑定
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/main.ts`
  - `src/common.ts`
  - `src/worker.ts`
  - `src/worker_pool/index.ts`
  - `src/worker_pool/balancer/index.ts`
  - `src/histogram.ts`
  - `src/errors.ts`
- observed：
  - 只创建 `worker_threads.Worker`，入口是 `resolve(__dirname, 'worker.js')`；没有 child_process runtime；
  - `minThreads` 默认 `max(floor(parallelism / 2), 1)`，`maxThreads` 默认 `parallelism * 1.5`；
  - 未传 `taskQueue` 时构造器用 `FixedQueue`，尽管 `kDefaultOptions.taskQueue` 写的是 `ArrayTaskQueue`；
  - 默认 `LeastBusyBalancer`：先抢 `currentUsage === 0`，跳过正在跑 abortable 任务的 worker；
  - `atomics` 为 `'sync' | 'async' | 'disabled'`，默认 `'sync'`；`'async'` 走 `Atomics.waitAsync`；
  - `recordTiming` 默认 true，据此算 `utilization`；`close({ force })` 默认 `closeTimeout=30000` 后再 `destroy()`；
  - `Symbol.dispose` / `Symbol.asyncDispose` 都转到 `close()`。
