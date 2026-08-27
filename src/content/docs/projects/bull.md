---
title: Bull — Redis 任务队列（维护模式）
description: 固定 4.16.5 用 Lua 把 wait/active/delayed 状态机收成原子命令，并按 job name 分发处理器
来源: https://github.com/OptimalBits/bull
日期: 2026-08-27
分类: backend-api
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/OptimalBits/bull
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 489c6ab8466c1db122f92af3ddef12eacc54179e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.16.5
---

## 是什么

Bull 是一份 Node 任务队列：生产者把 job 写进 Redis，worker 再从同一套 key 里拿走执行。日常类比：奶茶店的取餐墙——前台把单子夹到「等待」夹，后厨夹到「制作中」，做完再按结果分到「完成」或「失败」。

```js
const Queue = require("bull")
const queue = new Queue("email")

await queue.add("welcome", { to: "jason@example.com" })

queue.process("welcome", async (job) => {
  await sendMail(job.data.to)
})
```

固定 `4.16.5` 默认前缀 `bull`，`toKey` 拼成 `bull:email:wait` 这类三段 key。入口是 `lib/queue.js`；`index.js` 只再导出 `Job` 与 `utils`。

## 为什么重要

不理解 Bull 的状态机，下面这些事会对不上：

- 为什么同一份 `Queue` 既要普通客户端，又要 subscriber 和 blocking 客户端
- 为什么 `process("welcome", handler)` 和 `process(handler)` 吃的不是同一种 job name
- 为什么 `attempts` 默认是 1，失败并不会自动重试
- 为什么 README 说新功能去看 [[bullmq]]，这个 4.16.5 仍能解释旧栈

## 核心要点

固定版本可以拆成五步：

1. **六类主结构**：源码注释写明 wait / active 是 list，delayed / priority / completed / failed 是 zset。延迟 job 进 delayed；带 `priority` 的进 priority zset；普通 FIFO/LIFO 直接 `LPUSH`/`RPUSH` 到 wait 或 paused。

2. **三条 Redis 连接**：`client` 负责写和 Lua，`eclient` 订事件，`bclient` 做 `BRPOPLPUSH`。构造时会删掉 ioredis 的 `keyPrefix`，因为 Lua 自己拼 key。

3. **入队走 Lua**：`queue.add(name, data, opts)` 无 `repeat` 时调用 `Job.create` → `addJob-6.lua`。自定义 `jobId` 已存在则发布 `duplicated` 并返回旧 id，不抛错。`opts.repeat` 改走 `cron-parser` 的 `nextRepeatableJob`。

4. **出队先搬再锁**：队列被掏空后，`bclient.brpoplpush(wait, active, drainDelay)` 阻塞等待，默认 `drainDelay=5` 秒；随后 `moveToActive` Lua 上锁。锁默认 30 秒，一半时间后续期；`process()` 还会按 `stalledInterval=30000` 把丢锁的 active job 搬回 wait。

5. **按名字分发**：`process(name?, concurrency?, handler)` 把 handler 记进 `this.handlers[name]`。省略 name 时用 `__default__`。同名不能登记两次。传入文件路径则开 sandbox 子进程。arity > 1 的函数按 callback 包装。

## 实践示例

### 案例 1：命名 job 与默认名

```js
await queue.add("resize", { file: "a.png" })
queue.process("resize", 2, async (job) => resize(job.data.file))

await queue.add({ to: "a@b.c" })
queue.process(async (job) => send(job.data.to))
```

第一组 name 是 `"resize"`。第二组写入和消费都落在 `__default__`。`concurrency` 必须是整数，`run()` 会按这个数字起一组 `processJobs` 循环。

### 案例 2：重试次数是显式合同

```js
await queue.add("charge", { id: 1 }, { attempts: 3, backoff: { type: "exponential", delay: 1000 } })
```

`setDefaultOpts` 把缺省 `attempts` 设成 1。数字 backoff 会被收成 `{ type: "fixed", delay }`。指数策略是 `(2^attemptsMade - 1) * delay`。自定义策略必须在构造 `settings.backoffStrategies` 里登记，否则 `lookupStrategy` 抛错。

### 案例 3：限流必须成对出现

```js
const queue = new Queue("sms", { limiter: { max: 10, duration: 1000 } })
```

只给 `max` 或只给 `duration` 会在构造期抛 `TypeError`。`moveToActive-8.lua` 再按 limiter key 决定这次能不能把 job 锁给当前 worker。

## 踩过的坑

1. **把 `process(handler)` 当成会吃所有 name**：未命名 handler 只接 `__default__`。命名 job 缺对应 handler 会走 `Missing process handler for job type`。
2. **以为失败默认重试**：`attempts` 默认 1，要重试必须显式加大。
3. **给 ioredis 设 `keyPrefix` 指望 Lua 也带上**：构造函数会删掉这个字段。
4. **把 README 的 “fastest” 或旧 benchmark 写成当前事实**：本文未测吞吐。
5. **把本页当成 BullMQ**：README 写明 Bull 处于 maintenance，新功能在 [[bullmq]]；本页只绑 `4.16.5`。

## 适用 vs 不适用场景

**适用**：

- 已经在跑 Bull 4.x，需要读清 wait → active → completed/failed 这条 Redis 合同
- 需要按 job name 分处理器，或把处理器丢到 sandbox 子进程
- 需要 cron / `repeat`、priority、debounce、队列级 limiter

**不适用**：

- 要从头做 TypeScript 新栈——上游把新功能放到 [[bullmq]]
- 只要一个 handler、延迟任务还得自己决定谁来 promote——看 [[bee-queue]]
- 要把未实测的吞吐或 “最可靠” 写成选型结论

## 固定版本边界

- 本文绑定 `OptimalBits/bull@489c6ab8466c1db122f92af3ddef12eacc54179e`，包版本 `4.16.5`；npm latest 同号，`gitHead` 与 tag 一致。
- `package.json` 声明 `node >= 12`；源码在未跳过检查时要求 Redis `>= 2.8.18`。
- 运行时依赖包含 ioredis、cron-parser、msgpackr；本文不展开这些依赖的页面。
- 本文未安装依赖、未连 Redis、未跑 mocha，状态保持 `UNVERIFIED`。

## 学到什么

1. **状态在 Redis，不在进程内存**——六类结构加上 Lua，决定谁能拿走 job。
2. **名字是分发键**——`add` 和 `process` 的 name 对不上就会失败，不是默默落到默认 handler。
3. **锁和 stalled 巡检是同一条生命线**——`process()` 会自己开 interval；这和 bee-queue 要用户调用巡检不同。
4. **维护模式是产品边界**——读 4.16.5 不能外推 BullMQ 的 Queue/Worker 拆分。

## 应用型自测

1. `queue.add({ x: 1 })` 之后，`queue.process("x", handler)` 会处理它吗？
2. 不写 `attempts` 时，handler 抛错会自动再入 wait 吗？
3. `new Queue("q", { limiter: { max: 5 } })` 能通过构造吗？

检查点：

1. 不会。这条 job 的 name 是 `__default__`，`"x"` handler 接不住。
2. 不会。默认 `attempts=1`。
3. 不能。limiter 必须同时有 `max` 和 `duration`。

## 延伸阅读

- 固定源码：[OptimalBits/bull](https://github.com/OptimalBits/bull) —— 本文绑定提交 `489c6ab8466c1db122f92af3ddef12eacc54179e`
- 仓内 README 指向的后继：[BullMQ](https://github.com/taskforcesh/bullmq)
- [[bee-queue]] —— 更窄的 Redis 队列，延迟任务与 stalled 巡检都是显式开关
- [[bullmq]] —— 同作者线的 TypeScript 重写，不在本页范围内
- [[asynq]] —— Go 侧同类：enqueue 到 Redis，worker 另进程消化

## 关联

- [[bee-queue]] —— 单 handler + 用户启动 stalled 检查
- [[bullmq]] —— 维护模式 README 指向的后继
- [[asynq]] —— Go 版 Redis 任务队列
- [[sidekiq]] —— Ruby 鼻祖
- [[celery]] —— Python 老牌队列
- [[redis]] —— 存储层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bee-queue]] —— bee-queue — 把延迟升队和 stalled 巡检留给调用方的 Redis 队列
