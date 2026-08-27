# p-limit + p-queue source review (writer FD)

> 用途：记录 `p-limit` 与 `p-queue` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fd` 标记 2026-08-27 平行 writer FD，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FD
- evidence：GitHub tag / refs、npm latest 与 `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 xo / ava / tsd / node:test / tsc / bench，未测 bundle、吞吐或延迟
- worktrees：本机 `research-worktrees/p-limit` 与 `research-worktrees/p-queue`（gitignored），不进入 Git
- slugs：本轮新增 `p-limit` 与 `p-queue` 两页；未改既有笔记正文

## p-limit

- canonical source：`https://github.com/sindresorhus/p-limit`
- package：`p-limit@7.3.1`
- git tag：`v7.3.1`（annotated object `ea4d92ddb9c3dc43d3efff0a7549d7a1ac5ed2b9`，peel 到下方 commit）
- revision：`df476048d023ff868cd45b35ee47f5fb0ca2b25a`
- npm：`p-limit@7.3.1` latest，`gitHead` 与 revision 一致
- license：MIT
- engines：`node >= 20`；ESM；依赖 `yocto-queue ^1.2.1`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `recipes.md`
  - `test.js`
- observed：
  - `pLimit(concurrency)` 或 `pLimit({concurrency, rejectOnClear})`；`concurrency` 必须是 `> 0` 的整数或 `Infinity`；
  - 返回的 `limit` 用 `yocto-queue` 排队，`activeCount` / `pendingCount` 是 getter；
  - 入队用内部 Promise 保存 `queueItem.run`，以保留 AsyncLocalStorage 上下文；
  - `run` 立刻把任务 Promise `resolve` 给调用方，再 `await` 并吞掉内部 rejection，避免未处理拒绝，同时保留调用方看到的拒绝；
  - `clearQueue()` 默认只 `queue.clear()`，挂起的 Promise 不再 settle；`rejectOnClear: true` 时用 `AbortSignal.abort().reason` 拒绝；
  - `concurrency` setter 在 `queueMicrotask` 里补启动；`map` 是 `Promise.all(Array.from(iterable, ...))`，会立刻物化全部输入；
  - 命名导出 `limitFunction(fn, options)` 给单函数自带 limiter；
  - 文档与类型警告：同一 `limit` 嵌套调用会死锁。

## p-queue

- canonical source：`https://github.com/sindresorhus/p-queue`
- package：`p-queue@9.3.3`
- git tag：`v9.3.3` → `180ab9e25cd10b6f548767d7176076b50d25e188`
- revision：`180ab9e25cd10b6f548767d7176076b50d25e188`
- npm：`p-queue@9.3.3` latest，`gitHead` 与 revision 一致
- license：MIT
- engines：`node >= 20`；ESM；发布 `dist/`；依赖 `eventemitter3 ^5.0.4`、`p-timeout ^7.0.0`
- inspected：
  - `package.json`
  - `readme.md`
  - `source/index.ts`
  - `source/options.ts`
  - `source/queue.ts`
  - `source/priority-queue.ts`
  - `source/lower-bound.ts`
  - `test/basic.ts`
  - `test/advanced.ts`
  - `test/validation.ts`
- observed：
  - `PQueue` 继承 EventEmitter3；默认 `concurrency: Infinity`、`autoStart: true`、`intervalCap: Infinity`、`interval: 0`（后两者会使间隔限流被忽略）；
  - 默认队列是按 priority 降序、同优先级 FIFO 的数组，dequeue 用 `#head` 摊还 O(1)，阈值 100 后 compact；
  - `add(fn, options)` 始终返回任务完成时才 settle 的 Promise；未提供 `id` 时用递增 `BigInt` 转字符串；`fn` 收到 `{signal}`；
  - `timeout` 从出队执行开始，经 `pTimeout`；公开导出 `TimeoutError`。`options.ts` JSDoc 仍写 `AbortError` 命名导出，`index.ts` 并未导出它；中止走 `AbortSignal.reason`；
  - 排队中 abort 会 `remove` 并 reject；已经 `pending++` 的运行任务必须自己处理 signal，否则只靠 `Promise.race` 拒绝 `add()`；
  - `clear()` 换新队列、清 abort listener，不取消运行中任务，也不清 strict 窗口的 tick 历史；未带 signal 的排队 Promise 不会被 reject；
  - `onEmpty` / `onIdle` / `onPendingZero` 语义不同；`interval`+`intervalCap` 分固定窗口与 `strict` 滑动窗口；`carryoverConcurrencyCount` 仍是 `carryoverIntervalCount` 的过时别名。
