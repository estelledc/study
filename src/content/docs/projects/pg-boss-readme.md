---
title: pg-boss — 只用 Postgres 就能跑的任务队列
来源: 'https://github.com/timgit/pg-boss'
日期: 2026-05-31
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

pg-boss 是一个**让 Node.js 把后台任务直接塞进 PostgreSQL 表里、再让一群 worker 慢慢取出来做**的任务队列库。日常类比：像饭店把所有点单写进同一本台账，厨师们轮流翻台账、谁先看到没人接的单就划走自己做——不用再额外请一个"派单员"（Redis）。

你写：

```js
import PgBoss from 'pg-boss'
const boss = new PgBoss('postgres://user:pw@host/db')
await boss.start()
await boss.send('email', { to: 'jason@example.com' })

await boss.work('email', async ([job]) => {
  await sendMail(job.data.to)
})
```

API 立刻返回，邮件由 worker 异步发出去。**所有状态都在 Postgres 一张 `pgboss.job` 表里**，你已经在用的数据库就是队列，不用再装 Redis。

## 为什么重要

不理解 pg-boss，下面这些事都没法解释：

- 为什么"只用一个 Postgres"也能撑起生产级任务队列，而不是必须再上 Redis / Kafka
- 为什么"事务性入队"是 Redis 队列做不到的——你的业务 INSERT 和 job 入队**同一笔事务**，要么都成要么都没
- 为什么 Postgres 13 之后的 `SKIP LOCKED` 关键字让"多个 worker 抢同一张表"不再是性能噩梦
- 为什么 graphile-worker / River（Go）选了同一条路——它们底层都靠 `SELECT ... FOR UPDATE SKIP LOCKED`

## 核心要点

pg-boss 的全部魔法可以拆成 **三个 SQL 招式**：

1. **`SELECT ... FOR UPDATE SKIP LOCKED`（取 job）**：worker 从 `pgboss.job` 表抢一批未处理 job。`SKIP LOCKED` 是 Postgres 9.5+ 加的关键字——已经被别的事务锁住的行**直接跳过**，不阻塞。这就是多 worker 不抢同一份的原子保证。

2. **`INSERT INTO pgboss.job ...`（发 job）**：业务代码调 `boss.send()` 就是一条 INSERT。**关键**：这条 INSERT 可以和你的业务写**同一个事务**——付款表插一条订单 + 队列插一条"发货邮件"，commit 了两个都在，回滚了两个都没。Redis 队列做不到。

3. **`LISTEN/NOTIFY`（低延迟唤醒）**：默认 worker 是定时轮询（如 2 秒一次）。Postgres 自带的 `LISTEN/NOTIFY` 让"有新 job"瞬间通知 worker，把延迟从秒级压到毫秒级。

合起来：一张表 + 一个关键字 + 一个通知机制，就是完整的可靠任务队列。

## 实践案例

### 案例 1：事务性外发邮件（Transactional Outbox 模式）

```js
await db.tx(async tx => {
  await tx.insertInto('orders').values(order).execute()
  await boss.send('order-confirm', { orderId: order.id }, { db: tx })
})
```

`{ db: tx }` 让入队走同一个事务连接。订单写库失败，job 也不会留下"幽灵任务"。Redis + Bull 必须靠"先写 DB 再发 job"的两阶段模式，中间崩了就丢。

### 案例 2：定时任务（替代 cron）

```js
await boss.schedule('daily-report', '0 9 * * *')
await boss.work('daily-report', async () => {
  await generateReport()
})
```

部署 5 个实例都注册同一个 schedule，**只跑一次**——靠 `SELECT ... FOR UPDATE SKIP LOCKED` 自然抢锁，谁先抢到谁跑。

### 案例 3：失败重试 + 死信队列

```js
await boss.send('webhook', payload, {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
})
```

5 次指数退避后仍失败，job 进入 `failed` 状态留在表里——你可以直接 `SELECT * FROM pgboss.job WHERE state = 'failed'` 排查，比翻 Redis 命令舒服得多。

## 踩过的坑

1. **必须 Postgres 13+**：早期 Postgres 也有 `SKIP LOCKED`，但 13 才优化到大表也快。低版本用 pg-boss 在百万级 job 时会卡。

2. **轮询本身吃 DB**：默认 worker 每 2 秒一次 `SELECT`，10 个 worker 同时跑就是 5 QPS 空转。给低频队列调大 `pollingIntervalSeconds`，或开 `LISTEN/NOTIFY`。

3. **archive 表会膨胀**：完成的 job 默认 7 天后从 `job` 移到 `archive` 表，再 30 天后才删。高吞吐场景要调 `archiveCompletedAfterSeconds` 和 `deleteAfterDays`，否则磁盘悄悄爆。

4. **大版本升级要预留窗口**：v9 → v10 / v10 → v12 都改了 schema。`boss.start()` 第一次跑会跑迁移 SQL，几百万 job 的库可能锁表几十秒，必须停服或离线迁移。

5. **`work()` 拿到的是数组**：API 设计成"一次取一批"提高吞吐，新人常写 `boss.work('q', async job => ...)` 直接报错——参数是 `[job]`。

## 适用 vs 不适用场景

**适用**：

- 已经在用 Postgres 的项目，不想再引 Redis / Kafka 一份依赖
- 需要"业务写 + 入队"严格同一事务（Outbox 模式、金融场景）
- 中小规模任务队列（< 100 万 job/天，单库够用）
- Serverless / 多 master 部署——pg-boss 不需要长连接
- 想用 SQL 直接查队列状态、调试、写运维报表

**不适用**：

- 千万级 QPS 流处理 → Postgres 单实例顶不住，用 [[kafka]] 之类
- 跨语言生产/消费（生产 Java、消费 Go）→ 用 NATS / Kafka，pg-boss 是 Node 独占
- 长事务工作流 / 状态机编排（要补偿逻辑）→ 用 [[temporal]] / [[inngest]]
- 边缘 / 无 Postgres 的环境 → 找 SQLite 队列方案
- 极致低延迟（亚毫秒级）→ Redis 内存队列更快

## 历史小故事（可跳过）

- **2016 年**：Tim Jones 发布 pg-boss v1，最初只是想给自己的 Node 项目避免再装 Redis
- **2017-2019 年**：v3-v6 大改 schema，从单表演化到 `pgboss` 独立 schema、加上分区
- **2021 年**：v7 加 singleton（同名 job 全局只一份）和 cron，可以替代 node-cron
- **2023 年**：v9 重构 polling 逻辑，让 serverless（每次冷启动连一下就走）也能跑
- **2024-2026 年**：v10-v12 引入 partition-based archive、更细的背压控制；现在最新 12.18，依然只一个维护者
- **生态影响**：graphile-worker / River（Go）/ Oban（Elixir）都是同思路——"Postgres + SKIP LOCKED" 已成跨语言模式

## 学到什么

1. **数据库就是队列**——只要有 `SKIP LOCKED`，关系库可以撑起原本要专门中间件做的事，少一个组件就少一份运维
2. **事务性入队是 Postgres 队列的杀手锏**——Redis 队列再强也做不到"业务写 + 入队"原子化
3. **`SKIP LOCKED` 本质是"读跳过被锁的行"**——比"等锁"或"乐观锁重试"都简单，是 Postgres 给消息队列场景的官方答案
4. **小项目能撑大场景**——pg-boss 全靠一两个维护者，但已经是 ADR-3 选型清单里的主推方案

## 延伸阅读

- 官方文档：[pg-boss docs](https://timgit.github.io/pg-boss/)（API 参考 + 配置项 + 迁移指南）
- 源码：[timgit/pg-boss](https://github.com/timgit/pg-boss)（核心 SQL 在 `src/plans.js`，看那一个文件就懂全部）
- 论文背景：[What's New in Postgres 9.5: SKIP LOCKED](https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/)（关键字的来源解释）
- [[postgresql]] —— pg-boss 全部状态都在 Postgres 一张表里
- [[bullmq]] —— Redis 路线的对照面，理解两边取舍

## 关联

- [[postgresql]] —— pg-boss 的存储后端，理解 `SKIP LOCKED` 才能读懂 pg-boss 的实现
- [[postgres-js]] —— Node 上常用的 Postgres 驱动，pg-boss 内部就用它
- [[bullmq]] —— Redis 阵营对照面：性能更高但多一份依赖
- [[asynq]] —— Go 版 Redis 队列，和 pg-boss 是不同语言不同存储的两条路
- [[celery]] —— Python 老牌任务队列，broker 选 Redis / RabbitMQ；pg-boss 是"broker 就是你的主库"
- [[sidekiq]] —— Ruby 任务队列事实标准，Redis 路线
- [[inngest]] —— 持久工作流的现代替代品，云原生场景比 pg-boss 更省运维
- [[temporal]] —— 长事务编排引擎，pg-boss 撑不下来的复杂流程交给它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[temporal]] —— Temporal — 持久化工作流引擎

