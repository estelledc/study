---
title: Agenda — 把任务状态交给可插拔 backend 的 Node 调度器
description: 介绍 agenda 6.2.6 如何用 backend、锁和 nextRunAt 组织持久化定时任务。
来源: https://github.com/agenda/agenda
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/agenda/agenda
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fd90c624938524f1a8f6793942d40f612acbff64
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.2.6
---

## 是什么

Agenda 是一个把“什么时候跑、谁在跑”写进外部存储的 Node.js 任务调度器。日常类比：前台只负责点菜和叫号，真正的排队本在后厨账本里；换一个服务员，还能从同一本账接着做。

固定 6.2.6 不再接受旧的 `db.address` 构造。必须先给一个实现 `AgendaBackend` 的 backend，再 `define` 处理器、`every` / `schedule` / `now` 写入任务，最后 `start()` 才开始抢锁。

```ts
import { Agenda } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";

const agenda = new Agenda({
  backend: new MongoBackend({ address: "mongodb://127.0.0.1/agenda" })
});

agenda.define("welcome", async (job) => {
  await sendMail(job.attrs.data.to);
});

await agenda.start();
await agenda.now("welcome", { to: "ada@example.com" });
```

`MongoBackend` 只提供 repository，不提供 notification channel；没有通知时，处理器按 `processEvery` 轮询。

## 为什么重要

不理解 v6 的 backend / 锁 / `nextRunAt`，就解释不了下面几件事：

- 为什么两个进程能同时 `start()`，却不会各跑一份同一条 cron
- 为什么 `every("5 minutes", "digest")` 第一次可能立刻跑
- 为什么 `stop()` 不会把正在执行的任务立刻解锁
- 为什么换存储不能只改连接字符串，必须换 `@agendajs/*-backend`

## 核心要点

固定 6.2.6 的主链可以拆成五步：

1. **构造期绑定 backend**：`new Agenda({ backend })` 立刻 `backend.connect()`，`ready` 在 `ready` 事件后兑现。默认 `processEvery=5000`、`defaultConcurrency=5`、`maxConcurrency=20`、`defaultLockLifetime=10 * 60 * 1000`、`removeOnComplete=false`。
2. **定义处理器**：`define(name, fn, options)` 把 options 放在第三参数。`fn` 可以是 `(job) => Promise<void>` 或 `(job, done) => void`。未定义的名字仍可被写入存储，但处理器看不到就不会锁。
3. **写入任务**：`now` 把 `nextRunAt` 设成当前时间；`schedule` 解析一次时间；`every` 把 `type` 设为 `'single'` 再 `repeatEvery`。数值间隔按毫秒，字符串先试 cron-parser，再试 `human-interval`。
4. **抢锁执行**：`start()` 等 `ready`，可选连接 notification channel，再新建 `JobProcessor`。处理器按 job 名 `getNextJobToRun`，写 `lockedAt`。`lockLimit` 默认 0 表示不额外限锁。
5. **停机合同**：`stop()` 清轮询，只解锁“已锁但还没跑”的任务；正在跑的锁留给完成或过期。`drain()` 先停收新任务，再等 running 结束。并发 `start()` 会复用同一个 in-flight promise。

## 实践示例

### 案例 1：v6 必须先有 backend

```ts
const backend = new MongoBackend({ address: "mongodb://127.0.0.1/agenda" });
const agenda = new Agenda({ backend, name: "api-1" });
```

`ownsConnection` 在传入 `address` 时为 true，传入现成 `mongo` 时为 false。`stop()` / `drain()` 默认按这个标志决定要不要 `backend.disconnect()`。

### 案例 2：`every` 的第一次不一定等一个周期

```ts
await agenda.every("0 9 * * *", "digest", { tz: "Asia/Shanghai" });
await agenda.every(5000, "tick", undefined, { skipImmediate: true });
```

`repeatEvery` 默认按“现在”算下一次；`skipImmediate: true` 会先把 `lastRunAt` 当成当前 `nextRunAt`，再重算，因此第一次会被推到下一格。纯数字 `5000` 在 `computeFromInterval` 里就是 5000ms，不是 cron。

### 案例 3：debounce 必须先 `unique`

```ts
await agenda.nowDebounced(
  "reindex",
  { entityType: "products" },
  { "data.entityType": "products" },
  2000,
  { maxWait: 30000 }
);
```

`nowDebounced` 内部是 `schedule(new Date()).unique(uniqueKey).debounce(delay, options)`。没有 unique 约束，debounce 窗口不知道该合并哪几条。

## 踩过的坑

1. **把 v4/v5 的 `new Agenda({ db: { address } })` 抄到 6.2.6**：构造函数类型要求 `backend`。Mongo / Postgres 实现已经拆到 `@agendajs/mongo-backend` 与 `@agendajs/postgres-backend`。
2. **以为 `stop()` 等于立刻放锁**：源码只解锁 locked-but-not-running；running 任务继续持锁，直到自己写回或 `lockLifetime` 过期。
3. **把 `every("5 minutes")` 理解成“从现在起再等 5 分钟”**：没有 `skipImmediate` 时，human-interval 在缺少 `lastRunAt` 时会把 `nextRunAt` 设成现在。
4. **给 forked worker 里的 `Job` 调 `save()`**：`forkedWorker` 路径会打警告并直接返回，不写库。
5. **把 Mongo 当成有推送的 backend**：固定 `MongoBackend.notificationChannel` 是 `undefined`，靠轮询；要跨进程立刻唤醒，得另接 `notificationChannel`。

## 适用 vs 不适用场景

**适用**：

- 多个 Node 进程要共享同一份定时任务状态
- 需要失败后按 `backoff` 重试、`unique` 去重，或 `drain` 优雅停机
- 已经有 Mongo 或 Postgres，并接受把任务表放进现有库

**不适用**：

- 只要本进程用 worker thread 跑目录里的脚本，且不需要跨进程账本——先看 [[bree]]
- 需要把长事务和工作流检查点做成一等语义——[[inngest]] / [[temporal]] 更贴近
- Node < 18：`agenda` 与 `@agendajs/mongo-backend` 都声明 `engines.node >= 18.0.0`

## 固定版本边界

- 本文绑定 `agenda/agenda@fd90c624938524f1a8f6793942d40f612acbff64`，monorepo tag `agenda@6.2.6`，`packages/agenda/package.json` 版本为 `6.2.6`。
- npm `agenda@6.2.6` 未提供 `gitHead`；本轮按可达 package tag 绑定，不伪造 publish tree。
- 同提交里 `@agendajs/mongo-backend` 为 `4.0.3`。仓库此后还有未纳入 6.2.6 的修复，本文不引用。
- 本文未安装依赖、连接数据库、运行上游测试或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **持久化调度的真相在存储层**——进程只是抢锁的工人，账本在 backend。
2. **轮询和通知是两条唤醒路径**——Mongo 默认轮询；channel 只处理 `nextRunAt` 落在下一轮扫描前的任务。
3. **停机要分清 locked 与 running**——`stop` 放未开跑的锁，`drain` 等开跑的人做完。
4. **间隔语法不是一种东西**——毫秒、cron、human-interval 在 `computeFromInterval` 里分叉。

## 应用型自测

1. `new Agenda({ db: { address: "mongodb://localhost/agenda" } })` 在固定 6.2.6 能通过类型和运行时构造吗？
2. 两个进程同时 `start()`，`every("0 * * * *", "hourly")` 每个整点会跑几次？
3. 一个任务已经 `run()` 到一半时调用 `stop()`，它的 `lockedAt` 会立刻被清掉吗？

检查点：

1. 不能。构造函数要的是 `backend`，不是 `db.address`。
2. 一次。锁在 repository 里，第二个进程拿不到同一条未过期锁。
3. 不会。`stop()` 只解锁 locked-but-not-running。

## 延伸阅读

- 固定源码：[agenda/agenda](https://github.com/agenda/agenda) —— 本文绑定提交 `fd90c624938524f1a8f6793942d40f612acbff64`
- 构造与默认值：[packages/agenda/src/index.ts](https://github.com/agenda/agenda/blob/fd90c624938524f1a8f6793942d40f612acbff64/packages/agenda/src/index.ts)
- 间隔计算：[packages/agenda/src/utils/nextRunAt.ts](https://github.com/agenda/agenda/blob/fd90c624938524f1a8f6793942d40f612acbff64/packages/agenda/src/utils/nextRunAt.ts)
- [[bree]] —— 无共享账本、用 worker thread 跑脚本的对照
- [[inngest]] —— 步骤级断点恢复，不是“一条 job 一行记录”

## 关联

- [[bree]] —— 进程内调度对照；不靠 Mongo / Postgres 锁
- [[inngest]] —— durable step，适合长流程
- [[temporal]] —— 工作流引擎，不是轻量 cron 表
- [[pg-boss-readme]] —— 另一条“把队列放进 Postgres”的路
- [[mongodb]] —— MongoBackend 的存储

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bree]] —— Bree — 用 worker thread 在本进程里跑作业脚本的调度器
