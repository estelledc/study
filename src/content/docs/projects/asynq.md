---
title: Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
来源: 'https://github.com/hibiken/asynq'
日期: 2026-05-30
分类: 后端 API
难度: 中级
---

## 是什么

Asynq 是 Go 写的**分布式异步任务队列**——你 web 服务里那些"必须做但不必当场做"的活（发邮件、缩图、生成报表），交给它丢进 Redis，让后台 worker 慢慢消化。

日常类比：餐厅前台收到点单后不会自己跑去后厨炒菜，而是把订单贴到传菜口的小票夹上，厨师按夹子顺序拿、做完再喊"上菜"。Asynq 就是那个**小票夹 + 厨房**——前台（web 请求）只负责把任务挂上去就立刻给客人响应，厨房（worker 进程）独立按节奏处理。

```go
// 前台：客户端 Enqueue 一个任务
task := asynq.NewTask("email:welcome", []byte(`{"user_id":42}`))
client.Enqueue(task)  // 几毫秒返回，HTTP 请求立刻完成

// 后厨：worker 进程注册 Handler
mux.HandleFunc("email:welcome", sendWelcomeEmail)
srv.Run(mux)  // 后台 goroutine 不停拉任务、跑 handler
```

GitHub 13k+ stars，定位是 Go 生态里对标 Ruby 的 Sidekiq、Node 的 BullMQ、Python 的 Celery。

## 为什么重要

不理解 Asynq（或类似任务队列），下面这些事都没法解释：

- 为什么注册按钮一按就响应了，但欢迎邮件 5 秒后才到——任务被异步丢到队列了
- 为什么大促时商品图片处理任务积压几万条，前端 API 还很流畅——队列吸收了峰值
- 为什么 worker 进程崩了重启后任务不丢——Redis 的持久化 + 至少一次语义在兜底
- 为什么定时月报每月 1 号凌晨准点跑——背后是 cron + scheduled queue

## 核心要点

Asynq 干的活可以拆成 **三件事**：

1. **入队（Enqueue）**：客户端把任务序列化成 `[]byte` payload + 类型名，写进 Redis。类比：把订单小票贴到夹子上。每个任务会得到一个 UUID，可以查状态、改优先级、取消。

2. **状态机（Pending → Active → Done | Retry | Archived）**：worker 从 pending list 抢一个任务转到 active，跑成功移到 completed 或直接删除，跑失败按指数退避丢回 retry zset，重试用尽进 archived 等人工处理。类比：菜单从"待做"挪到"在做"再到"出菜"或"打回重做"。

3. **调度增强（Schedule / Periodic / Unique / Aggregate）**：可以延迟到某时刻入队（Redis sorted set 按时间排），可以注册 cron 表达式定时跑，可以用 unique key 防重复，可以把同类小任务聚合批量处理。类比：高级订单系统——可以"明早 9 点送"、"每周二送"、"重复订单合并"。

## 实践案例

### 案例 1：注册后异步发欢迎邮件

```go
// 1) 定义任务类型 + payload
type EmailPayload struct{ UserID int }

// 2) 客户端入队（在 HTTP handler 里调）
payload, _ := json.Marshal(EmailPayload{UserID: 42})
task := asynq.NewTask("email:welcome", payload, asynq.MaxRetry(25))
client.Enqueue(task)

// 3) worker 端注册处理函数
mux.HandleFunc("email:welcome", func(ctx context.Context, t *asynq.Task) error {
    var p EmailPayload
    json.Unmarshal(t.Payload(), &p)
    return smtp.SendWelcome(p.UserID)  // 失败 return error 自动重试
})
```

**逐部分解释**：`MaxRetry(25)` 让重试到第 25 次才进 archived；handler return error 触发指数退避（默认 1min, 2min, 4min...）；handler 必须幂等，因为重启可能重跑。

### 案例 2：每天凌晨生成日报

```go
mgr, _ := asynq.NewPeriodicTaskManager(asynq.PeriodicTaskManagerOpts{
    PeriodicTaskConfigProvider: &configProvider{},  // 提供 cron + task
})
mgr.Run()
```

`configProvider.GetConfigs()` 返回 `[{Cronspec: "0 2 * * *", Task: NewTask("report:daily", nil)}]`——每天 2 点自动入队一个 daily report 任务，worker 拉到后跑生成逻辑。底层用 Redis sorted set 存 due time。

### 案例 3：付费用户队列优先级更高

```go
// 入队时指定队列
client.Enqueue(task, asynq.Queue("premium"))
client.Enqueue(task, asynq.Queue("free"))

// server 配权重
srv := asynq.NewServer(redisOpt, asynq.Config{
    Queues: map[string]int{"premium": 8, "free": 2},  // 8:2 抢占
})
```

worker 每轮按权重随机挑队列拉任务，**不是严格优先级**而是按比例。也支持 `StrictPriority: true` 让 premium 空了才碰 free。

## 踩过的坑

1. **至少一次 ≠ 恰好一次**：worker 跑到一半进程崩了，重启后这个任务会被另一个 worker 再领一次跑——handler 必须幂等，发邮件、扣款、写库都要做去重 key。
2. **payload 是 `[]byte` 不是 struct**：忘记 `json.Marshal` / `Unmarshal` 或字段大小写不一致会 silent 丢字段，建议统一用 struct + JSON tag 并写单测。
3. **Redis Cluster 上 Lua 脚本受限**：asynq 的原子操作大量用 Lua + 多 key，Cluster 要求 key 在同 hash slot，官方推荐用 Sentinel HA 而非 Cluster。
4. **v0.x 警告**：作者明说 v1 之前公共 API 可能不兼容，生产环境务必锁住 minor 版本，升级前读 release notes。

## 适用 vs 不适用场景

**适用**：
- Go 单体或微服务里的后台异步任务（邮件、推送、缩图、报表）
- 已经在用 Redis 且不想再引入新中间件
- 需要简单可视化（Asynqmon）+ CLI 排查的中小团队
- 定时任务（替代 crontab + 单点）

**不适用**：
- 需要严格"恰好一次"语义的支付清算 → 选 Temporal / Cadence
- 跨系统长事务编排（多步骤 saga 状态机）→ 用 Temporal 工作流
- 海量流式数据管道（每秒百万级）→ 用 Kafka / Pulsar
- 不想依赖 Redis 的纯数据库方案 → 用 River（Postgres-based）

## 历史小故事（可跳过）

- **2019 年**：Ken Hibino（独立开发者）开源 asynq，目标是把 Sidekiq 在 Ruby 圈成熟的体验搬到 Go——之前 Go 里只有 machinery、go-workers 等不太好用的选择。
- **2020-2021 年**：陆续加上 unique tasks、periodic、retry policy 自定义、CLI 工具。
- **2022 年**：Asynqmon Web UI 独立仓库发布，可视化所有队列、失败任务、Worker 列表。
- **2023-2024 年**：加 Task Aggregator（合并同类小任务）、Sentinel/Cluster 支持完善、Prometheus metrics。
- **2025 年**：13k+ stars，仍是 v0.25.x，作者保守不发 v1，但已是 Go 后台任务队列事实标准。

## 学到什么

1. **任务队列的本质是状态机 + 持久化存储**：Pending / Active / Retry / Archived 四态切换，所有可靠性都靠这条状态机
2. **至少一次语义 + 幂等 handler** 是异步任务的基本契约——想要恰好一次就得加自己的去重表
3. **Redis 不只是缓存**：sorted set 做时间堆、list 做 FIFO、Lua 做原子操作——asynq 把 Redis 当多功能数据结构服务器用
4. **Web UI 的价值**：Asynqmon 让运维不用 redis-cli 也能看队列长度、retry 数、失败 stack——好工具能把事故响应从 30min 压到 3min

## 延伸阅读

- 视频教程：[Build Distributed Task Queue with Asynq](https://www.youtube.com/results?search_query=asynq+golang+tutorial)（搜 "asynq golang tutorial"，30 分钟跑通入门示例）
- 官方 Wiki：[hibiken/asynq Wiki](https://github.com/hibiken/asynq/wiki)（Quickstart、Best Practices、Operations 三大块）
- Web UI：[Asynqmon](https://github.com/hibiken/asynqmon)（独立 React 前端，docker 一键启）
- [[bullmq]] —— Node.js 生态对标项目，思路几乎一致
- [[sidekiq]] —— Ruby 鼻祖，asynq 直接对标的灵感来源
- [[celery]] —— Python 老牌任务队列，特性更全但更重

## 关联

- [[redis]] —— asynq 的存储层，所有队列、状态、调度都建在 Redis 数据结构上
- [[bullmq]] —— Node 生态同类，看完一个能秒懂另一个
- [[sidekiq]] —— Ruby 老大哥，asynq 直接 port 思路过来
- [[celery]] —— Python 同类，特性矩阵互补
- [[temporal]] —— 跨界对手，主打"恰好一次"和工作流编排，比 asynq 重但更可靠
- [[kafka]] —— 流式管道，处理量级比任务队列高 2-3 个数量级
- [[nats]] —— 消息总线，jetstream 也能当任务队列但生态没 asynq 专

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nats-server]] —— NATS Server — 极简云原生消息总线
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[redis]] —— Redis — 内存键值数据库
