---
title: BullMQ — 默认 Redis、可选 Postgres 的 Node 任务队列
来源: 'https://github.com/taskforcesh/bullmq'
日期: 2026-08-27
分类: backend-api
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/taskforcesh/bullmq
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9d737e9d0e467eeacf6f6a43f3f806fa2873ee1b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.3.1
---

## 是什么

BullMQ 是一个把后台任务从请求路径拆出去的 Node.js 队列库。日常类比：前台只开单，后厨按单做；前台不必等一杯奶茶做完才接待下一位。

固定 `6.3.1` 的高阶 API 仍是 `Queue`、`Worker`、`QueueEvents` 与 `FlowProducer`，但它们不再直接操作 Redis。默认 `BackendFactory` 指向 Redis；也可以注入 `createPostgresBackend`。

```ts
import { Queue, Worker } from "bullmq";

const connection = { host: "127.0.0.1", port: 6379 };
const queue = new Queue("email", { connection });
await queue.add("welcome", { to: "jason@example.com" });

new Worker("email", async job => {
  await sendMail(job.data.to);
}, { connection });
```

`Worker` 缺少 `connection` 会直接抛错。Redis 路径未传入现成 client 时，会懒加载 optional peer `ioredis`。

## 为什么重要

不理解 v6 的存储与调度边界，下面这些事都会写错：

- 为什么 `Queue.add(..., { repeat })` 已经不是合法 API
- 为什么同一套 Queue/Worker 能换 Postgres，却仍把 Redis 写成默认 backend
- 为什么 worker 需要第二条 blocking connection
- 为什么 `concurrency: 10` 只约束一个进程里同时 await 的 job 数

## 核心要点

1. **Backend 抽象**：`QueueBase` 只依赖 `IQueueBackend`。默认 `createRedisBackend`；Postgres 用 `createPostgresBackend` 或 `setDefaultBackendFactory`。
2. **生产**：`queue.add(name, data, opts)` 把 `data` 做 `JSON.stringify` 后交给 backend。类实例方法到不了 worker。
3. **消费**：Worker 默认 `autorun: true`、`concurrency: 1`、`lockDuration: 30000`、`drainDelay: 5`、`maxStalledCount: 1`。Redis worker 另建 blocking connection，用 `BZPOPMIN` 取活，单次最长 10 秒。
4. **调度**：Job Scheduler 取代 v5 repeatable API。重复任务走 `upsertJobScheduler` / `removeJobScheduler`，不再把 `repeat` 传给 `add`。
5. **依赖树**：`FlowProducer.add` 仍是树。子 job 完成后父 job 才处理，并可读子结果。
6. **原子性**：Redis backend 仍靠 `src/commands/` 里的 Lua；Postgres backend 走 SQL，不再假装“全靠 Lua”。

## 实践示例

### 案例 1：API 立刻返回，邮件在 worker 里发

```ts
const connection = { host: "127.0.0.1", port: 6379 };
const emailQueue = new Queue("email", { connection });

app.post("/signup", async (req, res) => {
  await db.user.create(req.body);
  await emailQueue.add("welcome", { to: req.body.email });
  res.json({ ok: true });
});

new Worker("email", async job => {
  await mailgun.send(job.data.to, "欢迎");
}, { connection, concurrency: 10 });
```

`concurrency` 默认是 1。把它调到 10 只增加同进程并发 await，不会自动 fork 出 CPU 进程。

### 案例 2：定时任务改走 Job Scheduler

```ts
await queue.upsertJobScheduler(
  "daily-report",
  { pattern: "0 9 * * *", tz: "UTC" },
  { name: "daily-report", data: {} }
);
```

v6 删除了 `Queue.add(..., { repeat })`、`removeRepeatable` 和 `Repeat`。改 cron 应再次 `upsertJobScheduler` 同一 id，或先 `removeJobScheduler`。旧 `repeat.utc` 改为 `tz: "UTC"`。

### 案例 3：可选 Postgres backend

```ts
import { Queue, Worker, createPostgresBackend } from "bullmq";

const opts = { connection: "postgres://user:pass@localhost:5432/app" };
const queue = new Queue("email", opts, createPostgresBackend);
new Worker("email", async job => job.data, opts, createPostgresBackend);
```

文档要求 PostgreSQL 13+，并懒加载 optional peer `pg`。本轮未启动 Postgres，也未验证行为等价。

## 踩过的坑

1. **继续写 `repeat` 到 `add`**：类型和迁移文档都写明这是 v6 breaking change。
2. **Worker 不传 connection**：固定实现会抛 `Worker requires a connection`。
3. **默认 ioredis 选项直接塞进 BullMQ**：Redis 连接路径要求 `maxRetriesPerRequest` 为 `null`，并会覆盖调用方设置。
4. **指望 `removeOnFail: { age }` 自己扫地**：清理发生在下一次同类 job 结束时，没有后台定时器。
5. **把多语言目录当成同一 npm 包合同**：仓库里还有 Python / PHP / Rust / .NET / Elixir 客户端；本文只绑定 Node 包 `bullmq@6.3.1`。

## 适用 vs 不适用场景

**适用**：

- Node 服务要把邮件、转码、报表从请求线程拆走
- 已经有 Redis，并接受 Lua 脚本作为原子边界
- 需要重试、延迟、优先级、Flow 依赖树或 Job Scheduler

**不适用**：

- 还停在 v5 `repeat` / `removeRepeatable`，又没有按迁移文档改数据和代码
- 跨语言事件流要独立 broker 合同——对照 [[kafka]] / [[nats]]，不要把多语言目录写成已验证互通
- 长事务补偿 / 跨服务编排——对照 [[temporal]] / [[inngest]]
- 需要已测量的吞吐或“单 Redis 扛百万 job/天”——本轮没有 benchmark

## 固定版本边界

- 本文绑定 `taskforcesh/bullmq@9d737e9d...`。npm latest 与 tag `v6.3.1` 的 `gitHead` 一致。
- 该提交树内 `package.json` 与 `src/version.ts` 仍写 `6.3.0`；发布提交未回写版本号，不另猜别的 revision。
- `engines.node` 为 `>=14.17.0`。`ioredis`、`redis`、`pg` 均为 optional peer。
- 本文未安装依赖、连接 Redis/Postgres、跑 worker 或测延迟，状态保持 `UNVERIFIED`。

## 学到什么

1. **队列外观稳定，不等于存储合同不变**——同一套 Queue/Worker 现在可以换 backend。
2. **调度 API 和入队 API 必须分开**——重复任务是 scheduler，不是 `add` 的一个选项。
3. **并发是进程内预算**——`concurrency` 管同时处理数；CPU 密集仍要沙箱文件处理器。
4. **默认保留失败 job**——不配清理策略，失败集合会一直长。

## 应用型自测

1. `await queue.add("daily", {}, { repeat: { pattern: "0 9 * * *" } })` 在固定 6.3.1 还是公开 API 吗？
2. `new Worker("email", processor)` 不传 `opts.connection` 会怎样？
3. 配了 `removeOnFail: { age: 86400 }` 后，失败 job 会在 24 小时整点自动消失吗？

检查点：

1. 不是。应使用 `upsertJobScheduler`。
2. 抛 `Worker requires a connection`。
3. 不会保证。age/count 只在下一次失败结束时 best-effort 评估。

## 延伸阅读

- 固定源码：[taskforcesh/bullmq](https://github.com/taskforcesh/bullmq) —— 本文绑定提交 `9d737e9d0e467eeacf6f6a43f3f806fa2873ee1b`
- v6 迁移：[migrate-from-v5-to-v6](https://docs.bullmq.io/guide/migrations/migrate-from-v5-to-v6)
- Job Scheduler：[guide/job-schedulers](https://docs.bullmq.io/guide/job-schedulers)
- [[ioredis]] —— Redis backend 默认仍可懒加载的 Node 客户端
- [[redis]] —— Lua、Sorted Set 与阻塞弹出，决定 Redis backend 的原子面

## 关联

- [[ioredis]] —— 默认 Redis 驱动之一；BullMQ 会改写 `maxRetriesPerRequest`
- [[redis]] —— 默认存储；命令原子性来自服务端脚本
- [[nestjs]] —— `@nestjs/bullmq` 仍是常见封装，但 adapter 版本要单独核对
- [[fastify]] —— 快返回 + 慢任务的常见 web 组合
- [[temporal]] —— 长流程 / 补偿编排的对照面
- [[inngest]] —— 事件函数路线的对照面
- [[kafka]] —— 跨语言日志流，不是同一种队列合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[redis]] —— Redis — 内存键值数据库
- [[sidekiq]] —— Sidekiq — Ruby 后台任务的事实标准
