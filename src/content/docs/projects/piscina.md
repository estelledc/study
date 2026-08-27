---
title: piscina — 带仪表与收口的 Node 线程池
description: 固定 5.3.1：只跑 worker_threads；默认 maxThreads 是 parallelism×1.5，未传 queue 时用 FixedQueue
来源: https://github.com/piscinajs/piscina
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/piscinajs/piscina
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6a23286fb7e3d28aa1745add5014f7187bc0389a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.3.1
---

## 是什么

piscina 是一份 **只使用 `worker_threads` 的 Node 任务池**。日常类比：不只给你泳道，还装了等候计时、利用率表和打烊铃。[[tinypool]] 把这些表拆走；本页把它们留在固定 5.3.1 里。

```js
const Piscina = require("piscina")

const pool = new Piscina({
  filename: require.resolve("./worker.js"),
})
const n = await pool.run({ a: 4, b: 6 })
await pool.close()
```

CJS 入口是 `dist/main.js`，ESM 走 `dist/esm-wrapper.mjs`。worker 默认导出（或 `name` 指出的导出）被 `import()` 缓存后调用。

## 为什么重要

不看构造器和 balancer，下面这些印象会对不上：

- 为什么默认线程上限不是“核数”，而是 `availableParallelism() * 1.5`
- 为什么没传 `taskQueue` 时实际是 `FixedQueue`，不是 `kDefaultOptions` 里的 `ArrayTaskQueue`
- 为什么 abort 中的任务会让 balancer 跳过该 worker
- 为什么 `destroy()` 和 `close()` 不是同一件事

一句话：它是 **可观测、可排空的线程池**，不是进程池，也不是作业队列。

## 核心要点

固定 5.3.1 的主链：

1. **只创建线程**：`WorkerInfo` 里 `new Worker(resolve(__dirname, 'worker.js'), …)`。没有 tinypool 那种 `child_process` runtime。
2. **默认容量**：`minThreads = max(floor(parallelism / 2), 1)`，`maxThreads = parallelism * 1.5`。`maxQueue: 'auto'` 仍是 `maxThreads ** 2`。
3. **LeastBusyBalancer**：先找 `currentUsage === 0`；正在跑 abortable 任务的 worker 直接跳过；其余挑 usage 最低者。
4. **Atomics 三档**：`'sync'`（默认，`Atomics.wait`）、`'async'`（`Atomics.waitAsync`）、`'disabled'`。环境变量 `PISCINA_DISABLE_ATOMICS` / `PISCINA_ENABLE_ASYNC_ATOMICS` 仍能盖掉。
5. **收口**：`close({ force })` 等在飞任务结束，超时默认 30s 再 `destroy()`；`Symbol.dispose` 也转到 `close()`。`destroy()` 则立刻给队列里的任务 `Terminating worker thread`。

`recordTiming` 默认 true。`utilization` 用 `runTime` 均值 × 样本数 / `(duration * maxThreads)`；直方图关着时恒为 0。

## 实践示例

### 案例 1：具名导出，而不是只能 default

```js
const pool = new Piscina({
  filename: "./jobs.js",
  name: "hash",
})
await pool.run({ bytes: buf })
```

worker 侧 `getHandler` 先动态 `import`，再取 `module[name]`。缓存键是 `` `${filename}/${name}` ``，超过 1000 条丢最老的。

### 案例 2：排空而不是掐断

```js
await pool.close()           // 等当前任务；超时发 error 再 destroy
await pool.close({ force: true }) // 没开工的排队任务直接 AbortError('pool is closed')
```

`force` 只丢 **还没绑到 worker** 的任务；已经 `postTask` 的继续跑到 `onPoolFlushed`。

### 案例 3：nice 是可选原生，不是默认依赖

`niceIncrement !== 0` 时，worker 启动才 `import('@napi-rs/nice')`。包在 `optionalDependencies`；失败被 `catch` 成 noop。Windows 上负增量会被构造器拒绝。

## 踩过的坑

1. **把 tinypool 的 `isolateWorkers` 抄过来**：5.3.1 没有这个选项。
2. **把 `kDefaultOptions.taskQueue` 当成运行时默认**：构造器写的是 `options.taskQueue ?? new FixedQueue()`。
3. **用 `utilization` 当基准分数**：它是点估计，依赖 `recordTiming` 和 `maxThreads` 容量，本轮未测。
4. **把 v6 RC 写进本页**：`v6.0.0-rc.4` 指向另一 SHA，未绑定。
5. **`[Symbol.dispose]()` 当同步销毁**：它调用的是 `close()`，返回 Promise。

## 适用 vs 不适用场景

**适用**：

- Node ≥ 20 的 CPU / 隔离计算，要等待时间、利用率或自定义 balancer
- 需要 `close()` 打烊，而不是立刻 `terminate`

**不适用**：

- 必须 `child_process` 或每任务换进程：看 [[tinypool]]
- 没有 `worker_threads` 的 Edge / 浏览器
- 持久化作业：看 [[bullmq]]，那是 Redis 队列

## 固定版本边界

- 本文绑定 `piscinajs/piscina@6a23286f...`，lightweight tag `v5.3.1`，包版本 `5.3.1`。
- npm latest 无 `gitHead`；v6 RC 线披露但不采用。
- 未安装 `@napi-rs/nice`、未跑测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认容量公式比“按核数开池”更具体**——这里是 0.5× 与 1.5×
2. **选项表里的默认值和构造器 ?? 可能不是同一份**
3. **abortable 任务独占 worker，是 balancer 的硬约束**
4. **`close` 是排空协议，`destroy` 是终止协议**

## 应用型自测

1. 未指定 `maxThreads` 时，8 个并行度会开几个线程上限？
2. `new Piscina({ filename })` 没传 `taskQueue`，实际队列类是什么？
3. 一个 worker 正在跑带 `signal` 的任务时，LeastBusyBalancer 会不会再给它派非 abort 任务？

检查点：

1. `8 * 1.5 = 12`。
2. `FixedQueue`。
3. 不会。`isRunningAbortableTask` 为真时 `continue`。

## 延伸阅读

- 固定源码：[piscinajs/piscina](https://github.com/piscinajs/piscina) —— 本文绑定 `6a23286fb7e3d28aa1745add5014f7187bc0389a`
- 审查记录：仓库内 `docs/worker-pool-source-review-20260827-fs.md`
- [[tinypool]] —— 同主链的瘦叉，补 child_process 与 isolate
- Node [`worker_threads`](https://nodejs.org/api/worker_threads.html)

## 关联

- [[tinypool]] —— Vitest 使用的瘦叉
- [[vitest]] —— 需要隔离时往往不直接依赖本页
- [[bullmq]] —— 跨进程持久队列，不是线程池
- [[pino]] —— 专用 worker transport，不是通用 `run()`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[tinypool]] —— tinypool — 给 Vitest 削薄的 Node worker 池
