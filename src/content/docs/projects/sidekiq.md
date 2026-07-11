---
title: Sidekiq — Ruby 后台任务的事实标准
来源: https://github.com/sidekiq/sidekiq
日期: 2026-05-30
分类: 后端基建
难度: 入门
---

## 是什么

Sidekiq 是 Ruby 生态里**让网站把"慢活儿"丢到后台慢慢做**的库。

日常类比：你在快餐店点餐，收银员立刻给你单号，让你坐下等——不是站在窗口等汉堡煎完。Sidekiq 就是那个"立刻给单号"的机制：

- 用户点"发邮件" → 网站 1 毫秒响应"已收到"
- 真正的"调 SMTP 发邮件"被排到 Redis 队列
- Sidekiq worker 进程在后台慢慢拉队列、慢慢发，发完就发完，用户根本不等

它由 Mike Perham 在 2012 年写出来，2026 年 GitHub 13k 星，Rails 项目里十有八九用它。

## 为什么重要

不理解 Sidekiq，下面这些事都没法解释：

- 为什么 Rails 应用响应"几乎都"在 100ms 以内——慢任务全被它吃掉了
- 为什么 Ruby 这种"被嘲笑慢"的语言能撑起 Shopify、GitHub 这种量级的网站
- 为什么招 Rails 后端面试官第一关常问"任务幂等怎么保证"——他在问 Sidekiq 重试
- 为什么 Resque（GitHub 自家的）2009 年发布，三年后被 Sidekiq 抢走大半市场——多线程比多进程省 10 倍内存

## 核心要点

Sidekiq 干的事可以拆成 **三步**：

1. **入队**：你写一个 Worker 类，调 `MyJob.perform_async(123)`。Sidekiq 把"类名 + 参数"序列化成 JSON，`LPUSH` 进 Redis 列表。

2. **出队**：worker 进程开 N 个线程（默认 5），每个线程 `BRPOP` 阻塞读 Redis。一有任务就拉一条，反序列化，调 `perform(123)`。

3. **重试**：`perform` 抛异常 → Sidekiq 把任务塞回"重试集合"，按指数退避（几秒、几分钟、几小时）再试，**默认最多 25 次**（约 21 天）。还失败就进"死信集合"等人工处理。

三件事加起来：**Redis 当队列 + 多线程并发 + 自动重试**。这就是 Sidekiq 的全部本质。

为什么是 Redis 而不是数据库？Redis 是内存数据库，读写快 100 倍以上；自带列表/集合/有序集合三种数据结构正好对应"待处理/处理中/定时"三种状态；`BRPOP` 阻塞读让 worker 不用轮询，省 CPU。Sidekiq 没发明 Redis，但选 Redis 是它能比 Resque（也用 Redis）跑得更快、比 Delayed Job（用 MySQL）省 10 倍资源的关键之一。

为什么是多线程？发邮件、调 API 这类**IO 密集**任务，绝大部分时间在等网络回包。Ruby 的 GIL 不允许两个线程同时跑 CPU 指令，但等 IO 时锁会释放——所以多线程在 IO 任务上几乎是真并发。CPU 密集任务才需要多进程，那种少。

## 实践案例

### 案例 1：发欢迎邮件

```ruby
# app/sidekiq/welcome_email_worker.rb
class WelcomeEmailWorker
  include Sidekiq::Worker

  def perform(user_id)
    user = User.find(user_id)
    UserMailer.welcome(user).deliver_now
  end
end

# 控制器里：
WelcomeEmailWorker.perform_async(user.id)  # 立刻返回，不等邮件发完
```

**关键细节**：传 `user.id` 而不是 `user` 对象。原因下面"踩过的坑"第 1 条。

### 案例 2：定时清理（用 sidekiq-cron）

```ruby
# config/schedule.yml
cleanup_old_sessions:
  cron: "0 3 * * *"          # 每天凌晨 3 点
  class: "CleanupOldSessionsWorker"
```

定时任务也走同一套队列，复用重试和监控。

### 案例 3：进 Web UI 看队列

```ruby
# config/routes.rb
require 'sidekiq/web'
mount Sidekiq::Web => '/sidekiq'
```

打开 `/sidekiq` 能看到：等待中、处理中、重试中、死信、每分钟吞吐量。出问题第一站。

### 案例 4：失败重试看到底发生了什么

```ruby
class FlakyApiWorker
  include Sidekiq::Worker
  sidekiq_options retry: 3   # 覆盖默认 25 次

  def perform(order_id)
    response = ExternalApi.charge(order_id)
    raise "API down" unless response.success?
  end
end
```

第一次失败 → 等几秒 → 第二次 → 等几十秒 → 第三次 → 进死信。指数退避公式大致是 `(retry_count^4) + 15 + rand(30)` 秒。死信里的任务可以在 Web UI 手动重跑。

## 踩过的坑

1. **参数必须 JSON 友好**：传 `User` 对象会被 dump 成巨大的 hash，反序列化时拿到的是 hash 不是对象，方法全没了。**永远传 ID，worker 内部 `find` 一次**。

2. **任务必须幂等**：默认重 25 次。如果任务里"扣余额"，重试就扣 25 次。要么用唯一 token，要么先查再扣。

3. **线程安全**：单进程多线程，全局变量、类变量、未冻结的常量都可能被并发改坏。Rails 大部分代码线程安全，但你引的 gem 不一定。

4. **Redis / worker 一挂任务可能丢**：Redis 常默认有 RDB，但间隔快照仍可能丢最近写入；worker 半路崩溃时，未开 Sidekiq Pro reliable fetch 的任务也可能从队列消失。生产要开 AOF（或强 RDB 策略）+ 副本，关键队列再考虑 Pro。

5. **大队列堵小队列**：默认所有 worker 抢同一队列。如果"图片处理"几小时不结束，"发邮件"就排死后面。要分队列：`sidekiq -q critical -q default -q low`。

6. **Web UI 没鉴权**：`mount Sidekiq::Web => '/sidekiq'` 直接公开。生产必须套 HTTP Basic Auth 或 Devise admin 校验。

## 适用 vs 不适用场景

**适用**：

- Rails / Ruby 项目里**任何能容忍"几秒到几分钟"延迟**的工作（邮件、推送、报表、第三方 API、图片视频转码）
- 需要"失败自动重试"的网络调用
- 需要 cron 风格定时任务（配 sidekiq-cron）

**不适用**：

- **强一致性事务**：Sidekiq 任务和数据库事务**不在一起**，事务回滚了任务还是会跑——要用 `after_commit` 或 outbox 模式
- **毫秒级实时**（高频交易、游戏帧同步）→ 用消息总线（Kafka）或专用 RT 框架
- **Ruby 之外的语言**：本身只跑 Ruby。Python 用 Celery、Node 用 BullMQ、Go 用 asynq，思路全一样
- **跨数据中心严格保序**：单 Redis 实例顺序还行，多机就乱——要保序用 Kafka

## 历史小故事（可跳过）

- **2009 年**：GitHub 开源 Resque，每个 worker fork 一个进程，跑 100 个 worker 吃 5GB 内存
- **2012 年**：Mike Perham 发现 JRuby / MRI 的线程其实够用（IO 不被 GIL 锁），写出 Sidekiq——单进程 25 线程，内存只要 Resque 的 1/10
- **2014 年**：推出 Sidekiq Pro（保证至少跑一次）和 Sidekiq Enterprise（限流、加密、定时任务），靠商业版**养活作者一个人**到现在
- **2020 年代**：成为 Rails 官方文档推荐的 ActiveJob 后端

Mike Perham 一个人维护 13 年，公开过详细的"开源 + 商业"经营模型，是单人作者商业开源的标杆案例。

## 学到什么

1. **后台任务系统的最小三件套**：队列 + worker + 重试。任何语言都绕不开
2. **多线程不一定难写**：IO 密集任务（发邮件、调 API）线程安全成本远低于 CPU 密集
3. **重试改变设计**：一旦"会重试"，所有副作用代码都要被迫做幂等。这是好事——本来就该幂等
4. **商业开源能养活一个人**：核心 LGPL 免费，Pro/Enterprise 收钱，Mike 13 年单人维护，证明了路径

## 延伸阅读

- 官方 Wiki：[Best Practices](https://github.com/sidekiq/sidekiq/wiki/Best-Practices)（短，必读）
- Mike Perham 博客：[Sidekiq 商业与维护随笔](https://www.mikeperham.com/)（开源 + Pro 养活单人作者）
- [[redis]] —— Sidekiq 全靠 Redis 当队列后端
- [[rails]] —— Sidekiq 的主要宿主
- [[bullmq]] —— Node.js 生态等价物，对照看可以加深理解

## 关联

- [[redis]] —— 队列存储后端，没它 Sidekiq 跑不起来
- [[rails]] —— Sidekiq 通常作为 ActiveJob 的后端跑在 Rails 里
- [[bullmq]] —— Node 生态思路一致的对应物
- [[kafka]] —— 量级再上去、要严格保序时升级到这里

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[redis]] —— Redis — 内存键值数据库
