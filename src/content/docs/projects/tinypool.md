---
title: tinypool — 给 Vitest 削薄的 Node worker 池
description: 固定 2.1.2：默认 worker_threads，可用 child_process；池大小跟 availableParallelism，不是 physical-cpu-count
来源: https://github.com/tinylibs/tinypool
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/tinylibs/tinypool
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5e18382a9aaa3344035905384b18a88a9da8c8bb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.2
---

## 是什么

tinypool 是一份 **ESM-only 的 Node worker 池**，从 [[piscina]] 叉出来，去掉 utilization、线程 nice 和直方图，换来零运行时依赖。日常类比：同一间泳池只留泳道和救生员，计分牌和音响拆走。

```js
import Tinypool from "tinypool"

const pool = new Tinypool({
  filename: new URL("./worker.mjs", import.meta.url).href,
})
const n = await pool.run({ a: 4, b: 6 })
await pool.destroy()
```

固定 `2.1.2` 默认 `runtime: 'worker_threads'`。worker 文件导出函数（默认看 `name: 'default'`），`run(task)` 把 task 丢进池，结果以 Promise 回来。

## 为什么重要

不看固定入口，容易把 README 宣传写成合同：

- 为什么 README 还写 `physical-cpu-count`，源码却调用 `os.availableParallelism()`
- 为什么 `run(..., { runtime: 'child_process' })` 换不了运行时
- 为什么 Vitest 能在任务之间要一个干净 worker，而不必自己 `terminate`
- 为什么 `worker_threads` 上不能用 `TinypoolChannel.onMessage`

一句话：它是 **可回收的线程/进程池**，不是通用任务队列，也不是带仪表盘的 piscina。

## 核心要点

固定版本的主链可以拆成五步：

1. **选运行时**：`ThreadWorker` 用 `new Worker(entry/worker.js)`；`ProcessWorker` 用 `fork(entry/process.js)`，结束时先 `kill()`，1000ms 后再 `SIGKILL`。
2. **定池大小**：`cpuCount = availableParallelism()`。默认 `minThreads = max(cpuCount / 2, 1)`（不 `floor`），`maxThreads = cpuCount`。分数比例会先乘核数再 `floor`。
3. **派任务**：`runTask` 找 `currentUsage` 最低的 ready worker；带 `signal` 的任务必须独占一个空闲 worker，否则进队列。
4. **原子唤醒**：默认 `useAtomics: true`。主线程 `Atomics.add` 请求计数，worker 在 `currentTasks === 0` 时 `Atomics.wait`，避免每条任务都走一次 message 事件。
5. **回收**：`isolateWorkers` 每任务换人；`maxMemoryLimitBeforeRecycle` 看 worker 回报的 `heapUsed`；`teardown` 是销毁前再跑一次具名导出。

`run()` 虽然接收 `options.runtime`，`runTask` 并不读它。换 runtime 要 `recycleWorkers({ runtime })`。

## 实践示例

### 案例 1：默认线程池

```js
import Tinypool from "tinypool"
const pool = new Tinypool({ filename: "./add.mjs" })
await pool.run({ a: 1, b: 2 })
await pool.destroy()
```

`filename` 也可在 `run` 时补。缺文件名会立刻 `FilenameNotProvided`。

### 案例 2：隔离 worker，给 Vitest 式干净环境

```js
const pool = new Tinypool({
  filename: "./case.mjs",
  isolateWorkers: true,
  minThreads: 1,
})
await pool.run({ id: 1 })
await pool.run({ id: 2 })
```

每个任务结束后 `shouldRecycleWorker` 为真，旧 worker `terminate`，再 `_ensureMinimumWorkers()`。这是 [[vitest]] 常用它的原因之一。

### 案例 3：`child_process` 信道

`runtime: 'child_process'` 时，`TinypoolChannel.onMessage` 会把消息 `process.send` 到子进程。同一套 API 在 `worker_threads` 上会抛错，线程侧请用 `transferList` 里的 `MessagePort`。

## 踩过的坑

1. **把 README 的物理核写成事实**：`src/index.ts` 只 import `availableParallelism`，`package.json` 没有 `physical-cpu-count`。
2. **在 `run` 选项里换 runtime**：那条字段会被丢掉。
3. **以为 `destroy()` 会等队列自然做完**：排队任务直接 `Terminating worker thread`。
4. **把 38KB / Node 18 当合同**：引擎字段是 `^20 || >=22`；体积本轮未测。
5. **abort 任务和别人挤一个 worker**：`isRunningAbortableTask` 会把 usage 标成 `Infinity`。

## 适用 vs 不适用场景

**适用**：

- 测试运行器要在任务间隔离环境，或偶尔切到 `child_process`
- 只要 `run` / `destroy` / 回收，不要 utilization 仪表

**不适用**：

- 需要 `close()` 排空、直方图或 OS nice：看 [[piscina]]
- 浏览器 / Edge：没有 `worker_threads` 也没有这套 fork 入口
- 跨进程作业队列：这不是 Redis / BullMQ

## 固定版本边界

- 本文绑定 `tinylibs/tinypool@5e18382a...`，annotated tag `v2.1.2`，包版本 `2.1.2`。
- npm latest 无 `gitHead`；身份是 tag + SHA。
- 未安装依赖、拉起 worker 或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **叉出来的库要重新对源码，不要抄上游 README**
2. **池选项和单次 `run` 选项不是同一份合同**
3. **隔离是回收策略，不是另一种 runtime**
4. **Atomics.wait 会挡住还没 await 完的异步尾巴**

## 应用型自测

1. 固定源码用什么决定默认 `maxThreads`？
2. `pool.run(task, { runtime: 'child_process' })` 会把下一条任务送到子进程吗？
3. `isolateWorkers: true` 时，两个 `run` 有没有可能复用同一个 worker 实例？

检查点：

1. `os.availableParallelism()`，不是物理核计数包。
2. 不会。`runTask` 不读 per-call `runtime`。
3. 不会按设计复用。任务结束就 `destroy` 再补 `minThreads`。

## 延伸阅读

- 固定源码：[tinylibs/tinypool](https://github.com/tinylibs/tinypool) —— 本文绑定 `5e18382a9aaa3344035905384b18a88a9da8c8bb`
- 审查记录：仓库内 `docs/worker-pool-source-review-20260827-fs.md`
- [[piscina]] —— 上游完整池，带 utilization 与 `close`
- [[vitest]] —— 当前主要消费者之一

## 关联

- [[piscina]] —— 同一套 Atomics + MessagePort 主链的完整版
- [[vitest]] —— 需要 `isolateWorkers` / `child_process` 的测试运行器
- [[pino]] —— 另一条把慢活丢进 `worker_threads` 的路，但不是通用池

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[piscina]] —— piscina — 带仪表与收口的 Node 线程池
