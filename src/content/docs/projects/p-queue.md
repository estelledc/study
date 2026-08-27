---
title: p-queue — 带优先级和窗口限流的进程内 Promise 队列
description: "介绍 p-queue 如何用优先级队列、固定或滑动窗口和完成 Promise 管理进程内异步任务。"
来源: https://github.com/sindresorhus/p-queue
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/p-queue
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 180ab9e25cd10b6f548767d7176076b50d25e188
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.3.3
---

## 是什么

p-queue 是进程内的 Promise 队列类：`add()` 把任务放进去，再按并发、优先级和时间窗口往外倒。日常类比：不只是“窗口只开 N 个”，还可以插队、暂停叫号、规定“每秒最多出几单”。它不是 Redis 作业队列；README 写明服务器上的持久任务应另找 job queue。作者对照的极简版是 [[p-limit]]。

```js
import PQueue from 'p-queue'

const queue = new PQueue({concurrency: 1})
const one = queue.add(() => fetchPage('a'))
const two = queue.add(() => fetchPage('b'))
```

注意：`new PQueue()` 的默认 `concurrency` 是 `Infinity`。不传选项时，它几乎不会替你限流。

## 为什么重要

不读固定 `9.3.3`，队列合同很容易被旧印象带偏：

- 为什么 `await queue.add(fn)` 会等到 `fn` 跑完，而不只是入队——返回的是完成 Promise
- 为什么默认构造几乎“不排队”——`interval` 默认 `0`、`intervalCap` 默认 `Infinity`，间隔限流被直接忽略
- 为什么 `clear()` 之后旧的 `add()` 可能还挂着——它换了一条新数组，并不 reject 未带 signal 的等待者
- 为什么 JSDoc 里的 `AbortError` 命名导入对不上——`index.ts` 只再导出了 `TimeoutError`

## 核心要点

固定版本可以看成五层：

1. **构造**：选项摊开后校验 `intervalCap >= 1`、`interval` 为有限且 `>= 0`。`strict: true` 还要求非零 `interval` 和有限 `intervalCap`。`carryoverConcurrencyCount` 仍是 `carryoverIntervalCount` 的过时别名。

2. **默认队列**：`PriorityQueue` 按 priority 降序插入，同优先级追加到尾部（FIFO）。dequeue 移动 `#head`，超过 100 且浪费过半再 compact。

3. **`add(fn, options)`**：拷贝 options，缺 `id` 时用递增 `1n++` 转字符串。出队后 `pending++`，把 `{signal}` 交给 `fn`。`timeout` 从这时才起算，包一层 `pTimeout`。失败既 `reject` 又 `emit('error')`。

4. **限流窗口**：非 strict 用固定窗口计数 + `setInterval`；idle 后再来的任务看 `#intervalEnd`。`strict` 改记每笔开始时间的滑动窗口，`carryoverIntervalCount` 在这条路上无效。

5. **等待与观察**：`onEmpty` 只看队列空；`onIdle` 还要 `pending === 0`；`onPendingZero` 只等运行中的结束。`isSaturated` 是“并发槽满且还有人等”或“正在 rate-limit 且还有人等”。

## 实践示例

### 案例 1：优先级插队

```js
import PQueue from 'p-queue'

const queue = new PQueue({concurrency: 1})
const order = []
queue.add(async () => { order.push(1) }, {priority: 1})
queue.add(async () => { order.push(0) }, {priority: 0})
queue.add(async () => { order.push(3) }, {priority: 2})
await queue.onEmpty()
// 固定测试里同类序列会先跑已出队的 1，再跑剩下最高优先级
```

已经 `dequeue` 的任务不会因为后来更高的 priority 被抢回去。`setPriority(id, n)` 只改还在队列里的项。

### 案例 2：超时从出队开始

```js
import PQueue, {TimeoutError} from 'p-queue'

const queue = new PQueue({concurrency: 1, timeout: 50})
const slow = queue.add(async () => wait(200))
// 若 50ms 内没结束，slow 以 TimeoutError 拒绝
```

全局 `queue.timeout` 可运行时改；单次 `add(fn, {timeout: 10_000})` 覆盖默认。超时文案会带上当时的 `pending` 和 `size`。

### 案例 3：中止还在排队的任务

```js
const queue = new PQueue({concurrency: 1})
const controller = new AbortController()
const running = queue.add(() => wait(100))
const queued = queue.add(() => wait(10), {signal: controller.signal})
controller.abort()
// queued 以 signal.reason（name 为 AbortError）拒绝，并从 PriorityQueue 里 remove
```

若任务已经开始跑，`add()` 会用 `Promise.race` 拒绝，但 `fn` 自己还要听 `signal` 才能停掉副作用。`options.ts` 示例里的 `import {AbortError} from 'p-queue'` 在固定 `index.ts` 里并不存在。

## 踩过的坑

1. **默认当成已经限流**：`new PQueue()` 并发无限，间隔限流关闭。要限流必须显式写 `concurrency` / `interval`+`intervalCap`。
2. **`await add()` 当“入队成功”**：文档强调这会等到任务结束，可能把并发模型等回串行。
3. **`clear()` 以为会 reject 所有等待者**：它 `new this.#queueClass()`，不取消 running，也不清 strict tick；没挂 signal 的 Promise 会悬空。
4. **固定窗口当滑动窗口**：`intervalCap: 2, interval: 1000` 在窗口边界可以连发两批。要滚动窗口得开 `strict`。
5. **忽略 `add()` 的失败**：源码会 `emit('error')`，但每个 `add()` Promise 仍会 reject；不 `.catch` 就是未处理拒绝。

## 适用 vs 不适用场景

**适用**：

- 进程内需要 priority、pause/start、按时间窗口限流或 per-task timeout
- 想用 `onIdle` / `onSizeLessThan` / `isSaturated` 做回压，而不是自己数槽
- 浏览器或 Node 里对 REST 做短时节流，任务不必落盘

**不适用**：

- 只要一个数字上限 → [[p-limit]] 更小
- 任务要跨进程、重启后还在 → [[bullmq]] 或别的 job queue
- CommonJS `require`——固定包只发布 ESM `dist/`
- 把 README 的“feature complete”理解成 API 冻结到永远；升级仍要重新钉 revision

## 固定版本边界

- 本文绑定 `sindresorhus/p-queue@180ab9e25cd10b6f548767d7176076b50d25e188`，git tag `v9.3.3` 与 npm `gitHead` 一致。
- 运行时依赖 `eventemitter3@^5.0.4`、`p-timeout@^7.0.0`；`engines.node` 为 `>=20`。
- README 写明项目 feature complete，仍接受 PR，但不再规划新功能。本页不把它写成“停止维护”。
- 未安装依赖，未跑 `xo` / `node:test` / `tsc` / `bench.ts`，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认选项等于“几乎不限”**——Infinity 并发 + 关闭的 interval 不是安全默认。
2. **完成 Promise 和队列位置不是一回事**——`add` 的 await 点在任务结束。
3. **限流有两种时钟**——固定窗口会在边界爆发；`strict` 才按滚动时间戳。
4. **中止分两段**——排队中可以摘掉；跑起来之后队列只能拒绝 `add()`，停副作用是 `fn` 的事。

## 应用型自测

1. `new PQueue()` 之后连续 `add` 100 个立刻可完成的任务，会被自动限制成一次一个吗？
2. `timeout: 1000` 的任务在队列里等了 2 秒还没出队，这时已经超时了吗？
3. `queue.clear()` 会把已经 `pending++` 的运行任务停掉吗？

检查点：

1. 不会。默认 `concurrency` 是 `Infinity`。
2. 不会。超时从 dequeue 后开始执行算起。
3. 不会。`clear()` 只丢掉还在队列里的项。

## 延伸阅读

- 固定源码：[sindresorhus/p-queue](https://github.com/sindresorhus/p-queue) —— 本文绑定提交 `180ab9e25cd10b6f548767d7176076b50d25e188`
- 作者对照：[p-limit](https://github.com/sindresorhus/p-limit) —— 只要并发上限；见 [[p-limit]]
- [[bullmq]] —— 持久化、跨进程的 Redis 作业队列

## 关联

- [[p-limit]] —— 同作者的“只限并发”
- [[bullmq]] —— 需要落盘和 worker 池时的另一层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[p-limit]] —— p-limit — 只限制“同时跑几份 Promise”
