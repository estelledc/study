---
title: p-limit — 只限制“同时跑几份 Promise”
description: "介绍 p-limit 如何用 yocto-queue 把 Promise 并发限制成可调整的叫号器。"
来源: https://github.com/sindresorhus/p-limit
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/p-limit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: df476048d023ff868cd45b35ee47f5fb0ca2b25a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.3.1
---

## 是什么

p-limit 是一个很小的 ESM 函数：你先声明“同时最多跑几份”，再把异步工作丢给返回的 `limit`。日常类比：食堂窗口只开 N 个打菜口，后面的人排队；窗口空出来才叫下一位。它不管优先级、暂停或按秒限流——那些是 [[p-queue]] 的地盘。

```js
import pLimit from 'p-limit'

const limit = pLimit(2)
const results = await Promise.all([
  limit(() => fetchItem('a')),
  limit(() => fetchItem('b')),
  limit(() => fetchItem('c')),
])
```

固定 `7.3.1` 也可以写成 `pLimit({concurrency: 2, rejectOnClear: false})`。`concurrency` 必须是大于 0 的整数，或 `Number.POSITIVE_INFINITY`。

## 为什么重要

不读固定提交，limiter 很容易被讲成“自动取消”或“按速率节流”：

- 为什么 `limit()` 立刻返回 Promise，但 `fn` 可能还没被调用——真正执行的是队列里的 `run`
- 为什么 `clearQueue()` 之后 `Promise.all` 可能永远不结束——默认不会拒绝挂起的 Promise
- 为什么同一把 `limit` 套在自己里面会卡住——内层任务要等外层让出 `activeCount`，外层又在等内层
- 为什么它和 [[p-queue]] 不是同一个抽象——这里没有 pause、priority、intervalCap

## 核心要点

固定版本可以拆成四层：

1. **工厂**：`pLimit` 建一个 `yocto-queue` 和 `activeCount`。校验失败抛 `TypeError('Expected \`concurrency\` to be a number from 1 and up')`。

2. **入队**：每次 `limit(fn, ...args)` 往队列塞 `{reject, run}`。`run` 不是 `fn` 本身，而是一个内部 `resolve`，用来保住调用时的异步上下文（测试覆盖了 `AsyncLocalStorage`）。

3. **执行**：`run` 先 `resolve(resultPromise)` 给调用方，再 `await` 并吞掉内部 rejection，避免未处理拒绝；调用方看到的仍是原来的成功或失败。完成后 `activeCount--`，再 `dequeue().run()`。

4. **观察与拆队**：`activeCount` / `pendingCount` 是 getter。`concurrency` 可读写，升高后在 `queueMicrotask` 里补启动。`map(iterable, mapper)` 等于立刻 `Promise.all(Array.from(iterable, ...))`。命名导出 `limitFunction(fn, options)` 给单个函数自带一把 limiter。

## 实践示例

### 案例 1：并发 1 的串行批次

```js
import pLimit from 'p-limit'

const limit = pLimit(1)
const input = [
  limit(async () => { await wait(300); return 10 }),
  limit(async () => { await wait(200); return 20 }),
  limit(async () => { await wait(100); return 30 }),
]
const result = await Promise.all(input)
// result === [10, 20, 30]，总等待接近三段之和
```

`Promise.all` 的顺序跟入队顺序一致，因为每个 `limit()` 都已经返回了对应任务的 Promise。并发为 1 时，后一个 `fn` 要等前一个 `await` 结束。

### 案例 2：`map` 与参数直传

```js
const limit = pLimit(3)
const doubled = await limit.map([10, 10, 10], async (value, index) => value + index)
// doubled === [10, 11, 12]

await limit((symbol) => symbol, mySymbol)
```

`map` 的 mapper 收到 `(value, index)`。拆下来的 `{map}` 仍绑着同一把 limiter。第二行是 `limit(fn, ...args)`，避免为每个调用包一层闭包。

### 案例 3：拆队时要不要拒绝

```js
const hanging = pLimit(1)
const first = hanging(() => delay(100))
const leftover = hanging(() => delay(10))
hanging.clearQueue()
// leftover 默认不再 settle；first 仍会跑完

const rejecting = pLimit({concurrency: 1, rejectOnClear: true})
const pending = rejecting(() => delay(10))
rejecting.clearQueue()
// pending 以 AbortError（AbortSignal.abort().reason）拒绝
```

已经在跑的任务两边都不会被取消。只是排队中的 `fn` 还没调用。

## 踩过的坑

1. **把 `clearQueue()` 当成“全部失败”**：默认只 `queue.clear()`，挂起的 Promise 悬空。要跟 `Promise.all` 一起用，固定版本建议开 `rejectOnClear`。
2. **同一 `limit` 嵌套调用**：类型声明和 README 都写了会死锁。内层任务另建一把 limiter。
3. **以为 `map` 会流式拉取**：它先 `Array.from(iterable)` 再全部 `limit()`，输入很大时队列会一次性胀起来。
4. **把 `activeCount` 写成可写字段**：它是 getter。要改的是 `concurrency`。
5. **拿 README 的 bench 数字当选型结论**：固定仓有 `benchmark.js`，本页未跑，也不绑定吞吐。

## 适用 vs 不适用场景

**适用**：

- 只要“同时最多 N 个 Promise”，不要队列产品功能
- 一批 URL / 文件用 `limit.map` 做有上限的 `Promise.all`
- 需要把现有函数包成自带并发上限的 `limitFunction`

**不适用**：

- 要暂停、优先级、按时间窗口限流、按任务 timeout → [[p-queue]]
- 要把任务持久化到 Redis、跨进程重试 → [[bullmq]]
- 仍在 CommonJS 里 `require('p-limit')`——固定包是纯 ESM
- 需要取消已经开始的 `fn`——`clearQueue` 明确不碰 running

## 固定版本边界

- 本文绑定 `sindresorhus/p-limit@df476048d023ff868cd45b35ee47f5fb0ca2b25a`，npm / annotated tag `v7.3.1` 解引用到同一提交，`gitHead` 一致。
- 运行时依赖只有 `yocto-queue@^1.2.1`；`engines.node` 为 `>=20`。
- 未安装依赖，未跑 `xo` / `ava` / `tsd` / `benchmark.js`，状态保持 `UNVERIFIED`。

## 学到什么

1. **limiter 是“叫号器”，不是取消器**——默认拆队只扔掉号票。
2. **调用方拿到的 Promise 和内部排队是两条线**——`resolve(result)` 发生在 `fn` 结束之前。
3. **嵌套同一把锁会自锁**——并发计数不区分调用栈。
4. **`map` 是便利的 `Promise.all`，不是流**——物化发生在调用当下。

## 应用型自测

1. `pLimit(1.5)` 会得到一把可用的 limiter 吗？
2. 默认 `clearQueue()` 之后，还在排队的那个 `limit()` Promise 会变成 rejected 吗？
3. 在已经被 `limit` 包住的 `fn` 里再调用同一个 `limit`，内层任务一定能开始吗？

检查点：

1. 不会。非整数且不是 `Infinity` 会在构造期抛 `TypeError`。
2. 不会。默认不 reject；要拒绝需 `rejectOnClear: true`。
3. 不一定。同一把 limiter 的内层任务可能永远等不到空位。

## 延伸阅读

- 固定源码：[sindresorhus/p-limit](https://github.com/sindresorhus/p-limit) —— 本文绑定提交 `df476048d023ff868cd45b35ee47f5fb0ca2b25a`
- 作者对照：[p-queue](https://github.com/sindresorhus/p-queue) —— 同作者的队列产品；见 [[p-queue]]
- [[bullmq]] —— 跨进程、可持久化的任务队列，不是进程内 limiter

## 关联

- [[p-queue]] —— 同作者：priority / pause / intervalCap / timeout
- [[bullmq]] —— Redis 作业队列，解决的是另一层问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[p-queue]] —— p-queue — 带优先级和窗口限流的进程内 Promise 队列
