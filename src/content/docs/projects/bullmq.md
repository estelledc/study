---
title: BullMQ — Node.js 上的 Redis 任务队列
来源: 'https://github.com/taskforcesh/bullmq'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

BullMQ 是一个**让 Node.js 把"后台慢活"丢进 Redis、再让一群工人慢慢做完**的任务队列库。日常类比：像奶茶店的取餐号——前台收单立刻给号，后厨按号做单，做完叫号；前台不会因为一杯奶茶要 5 分钟就把后面 10 个人都挡在门口。

你写：

```js
import { Queue, Worker } from 'bullmq'
const queue = new Queue('email')
await queue.add('welcome', { to: 'jason@example.com' })

new Worker('email', async job => {
  await sendMail(job.data.to)  // 慢活在另一个进程里跑
})
```

API 立即返回，邮件由 worker 异步发出去。Redis 当中间存储，挂掉重启 job 还在。被 6.5k+ Node 后端拿来做异步任务基建。

## 为什么重要

不理解 BullMQ，下面这些事都没法解释：

- 为什么大量 Node 后端有"API 立即返回 + 后台跑活"的能力，而不是直接 `setTimeout` 完事
- 为什么同一个 Node 服务部署 5 个实例，定时任务**只跑一次**而不是 5 次
- 为什么 Redis 也能做"任务队列"，不一定非要上 Kafka / RabbitMQ
- 为什么 BullMQ 的失败重试、延迟、限流是"原子的"，靠的是 Redis 里的 Lua 脚本

## 核心要点

BullMQ 把任务队列拆成 **三件套 + 一个原子保证**：

1. **Queue（生产者）**：业务代码调 `queue.add(name, data)` 把 job 塞进 Redis。类比：前台开取餐号，写在小票上贴墙。

2. **Worker（消费者）**：另一个进程跑 `new Worker(name, async job => ...)`，循环从 Redis 拉 job 执行。多个 worker 并行不冲突——因为 Redis 给每个 job 加了"原子取走"标记。

3. **QueueEvents（监听者）**：业务想知道 job 跑完了、失败了，订阅 `completed` / `failed` 事件就行，不用轮询 DB。

**原子保证**靠 Lua 脚本——把"取 job + 标记处理中 + 设超时"几个 Redis 命令打包成一段 Lua 在服务端原子执行，不会被并发 worker 抢到同一份。这是 BullMQ 比早期 Bull 更可靠的关键。

## 实践案例

### 案例 1：发邮件 / push 通知

```js
// API 路由
app.post('/signup', async (req, res) => {
  await db.user.create(req.body)
  await emailQueue.add('welcome', { to: req.body.email })
  res.json({ ok: true })  // 立刻返回，不等邮件
})

// worker.js（独立进程）
new Worker('email', async job => {
  await mailgun.send(job.data.to, '欢迎')
}, { concurrency: 10 })
```

`concurrency: 10` 表示这一个 worker 进程内可以同时 await 10 个 job。

### 案例 2：视频转码 pipeline（Flow）

```js
import { FlowProducer } from 'bullmq'
const flow = new FlowProducer()
await flow.add({
  name: 'publish', queueName: 'video',
  children: [
    { name: 'download', queueName: 'video', data: { url } },
    { name: 'transcode', queueName: 'video', data: { quality: '720p' } }
  ]
})
```

Flow 让父 job **必须等所有子 job 跑完**才执行——天然适合"下载 → 转码 → 上传"这种串联依赖，任一步失败整链可见。

### 案例 3：定时任务（替代 cron）

```js
await queue.add('daily-report', {}, {
  repeat: { pattern: '0 9 * * *' }  // 每天早 9 点
})
```

部署 5 个实例都注册同一个 repeatable，**只会跑一次**——因为 BullMQ 用 Redis sorted set 做时间轮，谁先抢到 score 最小的 job 谁跑。比手写 cron + 加锁省事得多。

## 踩过的坑

1. **concurrency 不等于并行**：单 worker 进程内 `concurrency: 10` 是 10 个协程在 await，CPU 密集场景**没用**——必须用 sandboxed processor（传文件路径而非函数），让 worker fork 子进程跑。

2. **job.data 必须 JSON 可序列化**：传 `Buffer` / `Date` / 类实例会被静默转字符串，反序列化后类型丢失。约定只传 plain object + 原始类型。

3. **失败 job 不会自动清**：默认重试是指数退避，最终失败的 job 留在 `failed` set 不动，几个月后会撑爆 Redis。必须配 `removeOnFail: { age: 86400 }` 或写定期 clean。

4. **Repeatable 改 cron 后旧 schedule 不会自动删**：直接改 `pattern` 重新 add，会**双倍跑**——必须先 `removeRepeatable` 再 add。线上改 cron 是高发事故。

## 适用 vs 不适用场景

**适用**：
- Node.js 后端的异步任务（邮件 / 通知 / 转码 / 报表 / 爬虫）
- 中小规模分布式任务调度（< 百万 job/天，单 Redis 够用）
- 需要重试 / 延迟 / 优先级 / 定时 / 依赖链等丰富语义
- 已经在用 Redis，不想再引一个 Kafka / RabbitMQ

**不适用**：
- 跨语言事件流（生产者 Java / 消费者 Go）→ 用 [[kafka]] / [[nats]]
- 长事务工作流 / 跨服务编排（要补偿、要状态机）→ 用 [[temporal]] / [[inngest]]
- 千万级 QPS 实时流处理 → Redis 单实例瓶颈，BullMQ 不抗
- 不想要 Redis 依赖（边缘 / 无服务器）→ 用 SQLite / Postgres 队列方案

## 历史小故事（可跳过）

- **2014 年**：OptimalBits 团队发布 Bull v1，回调风格 + 纯 JS，是早期 Node 任务队列的事实标准
- **2018-2019 年**：Bull 暴露出"非原子操作并发丢 job""复杂依赖难做"两类痛点，Manuel Astudillo（Taskforce.sh 创始人）开始重写
- **2020 年**：BullMQ v1 首发——Promise + TypeScript + 全 Lua 原子操作 + Flow 父子依赖
- **2022-2024 年**：加 sandboxed processor / repeatable 改进 / 多语言代理（Python / PHP / Elixir 通过 BullMQ Pro 共用同一 Redis 队列）
- **现在**：被 NestJS / Fastify 生态广泛采纳，成 Node 后端任务队列默认选择

## 学到什么

1. **Redis 不仅是缓存**——它的 Streams / List / Sorted Set / Lua 脚本组合起来，足够撑一个生产级任务队列
2. **原子性靠 Lua**——多键操作要原子，必须服务端脚本，客户端 transaction 不够
3. **任务队列三件套**：生产 / 消费 / 事件监听是通用模式，理解了 BullMQ，看 Sidekiq / Celery / [[inngest]] 都好懂
4. **"分布式只跑一次"不是魔法**——是 sorted set + 抢锁，第一个拿到的赢

## 延伸阅读

- 官方文档：[BullMQ Docs](https://docs.bullmq.io/)（教程 + API + Patterns 三部分）
- 源码：[taskforcesh/bullmq](https://github.com/taskforcesh/bullmq)（核心 Lua 脚本在 `src/commands/`）
- 视频：[BullMQ in 100 Seconds](https://www.youtube.com/results?search_query=bullmq)（社区视频快速上手）
- [[redis]] —— BullMQ 全部状态都在 Redis 里
- [[inngest]] —— BullMQ 的"持久工作流"竞品

## 关联

- [[redis]] —— BullMQ 的存储后端，理解 Redis 数据结构才能读懂 BullMQ 的实现
- [[fastify]] —— Node 高性能 web 框架，常和 BullMQ 一起做"快返回 + 慢任务"
- [[nestjs]] —— NestJS 自带 `@nestjs/bullmq` 适配器，企业 Node 项目常用组合
- [[express]] —— 老牌 Node 框架，最早 Bull 教程都基于 Express
- [[kafka]] —— 大数据流处理的对照面：跨语言、海量、但学习曲线陡
- [[temporal]] —— 持久工作流引擎，适合 BullMQ 撑不住的长流程编排
- [[inngest]] —— "事件驱动 + 持久函数"的现代替代品，云原生场景更省运维

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[redis]] —— Redis — 内存键值数据库
- [[sidekiq]] —— Sidekiq — Ruby 后台任务的事实标准
- [[temporal]] —— Temporal — 持久化工作流引擎

