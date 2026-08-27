---
title: bee-queue — 把延迟升队和 stalled 巡检留给调用方的 Redis 队列
description: 固定 2.0.0 用一张 jobs hash 加 waiting/active 列表，延迟任务与周期 stalled 检查都不是默认开机项
来源: https://github.com/bee-queue/bee-queue
日期: 2026-08-27
分类: backend-api
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bee-queue/bee-queue
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 47130b378df7871fc300e93cdead7602763316c2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.0
---

## 是什么

bee-queue 是一份刻意做窄的 Redis 任务队列：先 `createJob` 拼选项，再 `save()` 才入队；worker 用同一个 `process(handler)` 消化所有 job。日常类比：它给你一个只有一条传送带的厨房——单子都进同一口锅，什么时候把预约单揭下来、谁负责巡台，要你自己安排。

```js
const Queue = require("bee-queue")
const queue = new Queue("example")

const job = queue.createJob({ x: 2, y: 3 })
await job.save()

queue.process(async (job) => job.data.x + job.data.y)
```

固定 `2.0.0` 默认前缀 `bq`，key 形如 `bq:example:waiting`。全部 job 正文存在一张 `jobs` hash 里，id 是 field。

## 为什么重要

不理解 bee-queue 的显式开关，下面这些事会对不上：

- 为什么 `createJob` 之后必须再 `save()`，否则 Redis 里什么都没有
- 为什么 `delayUntil` 写了，worker 仍可能永远看不到这单
- 为什么 `process()` 不会替你周期检查 stalled job
- 为什么这里没有 job name、priority 或 cron

## 核心要点

固定版本可以拆成五条合同：

1. **一张 hash + 几条列表**：`addJob.lua` 在 `id` 计数器上 `INCR`（或用你设的 id），`HSET jobs`，再 `LPUSH waiting`。id 已存在则返回 `nil`。成功/失败默认 `SADD` 到 `succeeded` / `failed`，不是 zset。

2. **建造再保存**：`createJob(data)` 只 `new Job`。`retries` / `timeout` / `backoff` / `delayUntil` / `setId` 都是链式修改 `options`，最后 `save()` 才跑 Lua。`delayUntil` 只在时间戳大于 `Date.now()` 时写入 `options.delay`。

3. **延迟默认不升队**：`activateDelayedJobs` 默认 `false`，此时根本不建 `EagerTimer`。延迟 job 进 `delayed` zset 后，要靠某个把该开关打开的实例跑 `raiseDelayedJobs`。

4. **一个 handler**：`process(concurrency, handler)` 在 `isWorker` 为 false、已经有 handler、或 queue 已 close 时抛错。不能按 name 分发。`concurrency` 省略则为 1。出队是 `bclient.brpoplpush(waiting, active, 0)`，超时 0 表示一直阻塞。

5. **stalled 要人启动**：`process()` 开头只做一次 `_doStalledJobCheck`。周期巡检必须 `checkStalledJobs(interval)`。处理中每 `stallInterval/2`（默认 2500ms）从 `stalling` 集合 `SREM` 自己的 id；漏掉的会被下一次检查 `LPUSH` 回 waiting。

## 实践示例

### 案例 1：重试不是默认行为

```js
const job = queue.createJob({ n: 1 }).retries(2).backoff("exponential", 200)
await job.save()
```

未调用 `retries` 时 `options.retries` 为空，`computeDelay()` 看到 `retries > 0` 不成立就返回 `-1`，失败直接进 `failed`。`exponential` 策略每次把 `backoff.delay` 乘 2 后返回旧值。未知策略在 `backoff()` 当场抛 `unknown strategy`。

### 案例 2：延迟任务要有人 promote

```js
const later = new Queue("mail", { activateDelayedJobs: true, isWorker: false })
await later.createJob({ to: "a@b.c" }).delayUntil(Date.now() + 60_000).save()
```

生产者若保持默认 `activateDelayedJobs: false`，这单会停在 `delayed`。`addDelayedJob.lua` 只在它成为 zset 头部时 `PUBLISH earlierDelayed`，接收端还得开了 timer。

### 案例 3：周期 stalled 检查是独立命令

```js
queue.process(4, async (job) => work(job.data))
queue.checkStalledJobs(5000)
```

只调 `process` 不会按 interval 再跑脚本。README 说明自动全开会让每个实例都查，调用方应指定由谁、以多频检查。`stallBlock` 用 `SET PX NX` 挡住过于密集的重复检查。

## 踩过的坑

1. **以为 `createJob` 已经入队**：没 `save()` 就没有 Redis 写入。
2. **只写 `delayUntil`、不设 `activateDelayedJobs`**：延迟集合不会被 raise。
3. **指望 `process()` 自带周期 stalled 巡检**：它只做一次；要重复检查得自己调。
4. **对同一 Queue 调两次 `process`**：第二次抛 `Cannot call Queue#process twice`。
5. **把 2017 年 benchmark 图写成今天的吞吐**：本文未复现，也不引用那些数字。

## 适用 vs 不适用场景

**适用**：

- 短任务、单处理器、希望 API 面尽量小
- 能接受“延迟升队”和“stalled 巡检”由指定进程负责
- 需要 `saveAll` 把多条 `EVALSHA` 打进同一 batch

**不适用**：

- 要按 job name 分 handler、priority、cron / repeat——用 [[bull]] 或 [[bullmq]]
- 运行时低于 Node 20——`package.json` `engines` 写的是 `>= 20`
- 要把未实测的 “fast / ~1000 LOC” 营销句写成当前性能保证

## 固定版本边界

- 本文绑定 `bee-queue/bee-queue@47130b378df7871fc300e93cdead7602763316c2`，包版本 `2.0.0`；npm latest 同号，`gitHead` 与 tag 一致。
- `engines.node` 为 `>= 20`。README 写 Redis 2.8+，并建议 3.2+；本文未连实例核实。
- 运行时依赖是 `redis@^3.1.2`、`p-finally`、`promise-callbacks`。`lib/redis.js` 能识别传入的现成客户端，但本页不展开客户端库。
- 本文未安装依赖、未连 Redis、未跑 ava，状态保持 `UNVERIFIED`。

## 学到什么

1. **建造和入队是两步**——链式 options 只改内存对象。
2. **默认关闭比默认聪明更重要**——延迟升队和周期 stall 检查都要显式打开。
3. **单 handler 是宽度换开销**——没有 name/priority/repeat。
4. **完成路径是 MULTI，不是另一份巨型 Lua**——`LREM active` + 写 hash/集合 + 可选 `PUBLISH events`。

## 应用型自测

1. `queue.createJob({ a: 1 })` 之后不调用 `save()`，waiting 列表里会有这条吗？
2. 默认设置下，`delayUntil(Date.now() + 5000)` 的 job 会在 5 秒后自动进 waiting 吗？
3. 只调用 `queue.process(handler)`、不调用 `checkStalledJobs(interval)`，之后还会按 interval 巡检 stalled 吗？

检查点：

1. 不会。`createJob` 只构造；`save()` 才跑 `addJob` Lua。
2. 不会。`activateDelayedJobs` 默认 false。
3. 不会。`process()` 只做一次检查；周期巡检要自己调度。

## 延伸阅读

- 固定源码：[bee-queue/bee-queue](https://github.com/bee-queue/bee-queue) —— 本文绑定提交 `47130b378df7871fc300e93cdead7602763316c2`
- 仓内提到的 UI：[Arena](https://github.com/bee-queue/arena)
- [[bull]] —— 同主题但带 name / priority / repeat，且 stalled 巡检由 `process()` 自开
- [[bullmq]] —— Bull 维护模式 README 指向的后继，不在本页范围内
- [[asynq]] —— Go 侧 Redis 队列，对照 “enqueue 立刻返回”

## 关联

- [[bull]] —— 更宽的 Redis 队列合同
- [[bullmq]] —— Bull 线后继
- [[asynq]] —— Go 同类
- [[sidekiq]] —— Ruby 同类
- [[celery]] —— Python 同类
- [[redis]] —— 存储层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bull]] —— Bull — Redis 任务队列（维护模式）
