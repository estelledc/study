---
title: Celery — Python 把慢任务搬到后台干的工头
来源: 'https://github.com/celery/celery'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

Celery 是 Python 世界最经典的**分布式任务队列**——专门帮你把"慢吞吞的活"从 web 请求里搬出去，扔到后台让别的进程慢慢干。日常类比：餐厅前台接到客人点单，不会自己跑去后厨炒菜，而是把单子贴到取餐口，后厨厨师拿单子做菜。Celery 就是这套"前台 → 单子 → 厨师"系统。

你写：

```python
@app.task
def send_email(to, body):
    smtp.send(to, body)

# 在 Django view 里
send_email.delay("a@b.com", "hi")  # 立即返回，不等邮件发完
```

`.delay()` 不是真去发邮件，而是把"发邮件"这事写成一张单子塞进消息队列（broker），后台的 worker 进程会取出来执行。web 请求 0.1 秒返回，邮件慢慢在后面发。

## 为什么重要

不理解 Celery，下面这些事都没法解释：

- 为什么 Django/Flask 后端遇到耗时操作（生成 PDF、调外部 API）不会让用户等 30 秒
- 为什么"每天凌晨 3 点清理日志"这种周期任务不用 cron 也能跑
- 为什么 Instagram、Mozilla、Reddit 早期都用它扛住了百万级用户
- 为什么 RabbitMQ 和 Redis 经常被一起讨论——它们是 Celery 的两条腿

## 核心要点

Celery 三个支柱，记住就够入门：

1. **broker（消息中转站）**：worker 和 web 进程不直接说话，靠 broker 传单子。类比：取餐口的纸条架。Celery 同时支持 RabbitMQ（专业邮局）和 Redis（顺手的便利贴墙），换 broker 只需改一行 config。

2. **task（可序列化的活）**：用 `@app.task` 装饰的普通 Python 函数。调用时用 `.delay(args)` 把参数打包成消息丢队列。worker 拿到消息后**反序列化**回函数 + 参数，调用执行。

3. **canvas（拼工作流的积木）**：复杂场景要串多个任务。Celery 给三个原语：`chain`（A 接 B 接 C 串行）、`group`（A B C 并行）、`chord`（先并行后汇总）。组合起来能描述大多数 DAG。

## 实践案例

### 案例 1：Web 后端发邮件不阻塞响应

```python
# tasks.py
from celery import Celery
app = Celery("myapp", broker="redis://localhost:6379/0")

@app.task
def send_welcome(user_id):
    user = User.objects.get(id=user_id)
    smtp.send(user.email, "welcome!")

# views.py（Django）
def register(request):
    user = User.objects.create(...)
    send_welcome.delay(user.id)  # 异步调用
    return JsonResponse({"ok": True})
```

**逐部分解释**：

- `Celery("myapp", broker=...)` 创建 app 实例，告诉它消息往哪发
- `@app.task` 把普通函数注册成"可被异步调度的任务"
- `send_welcome.delay(user.id)` 不真发邮件，只把"调用 send_welcome 参数 user_id=42"序列化丢 Redis
- 真正发邮件的是后台跑的 `celery -A myapp worker` 进程

### 案例 2：周期任务（每天清日志）

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    "cleanup": {
        "task": "tasks.cleanup_old_logs",
        "schedule": crontab(hour=3, minute=0),
    },
}
```

启动 `celery -A myapp beat` 进程后，每天 3 点自动把 `cleanup_old_logs` 推进队列，由 worker 执行。比 cron 强在：任务用 Python 写、能利用 worker 池、有重试和监控。

### 案例 3：chord 拼并行汇总

```python
from celery import group, chord

# 先并行抓 100 个用户的数据，全部完成后汇总写库
job = chord(
    group(fetch_user.s(uid) for uid in user_ids),
    aggregate_and_save.s()
)
job.apply_async()
```

`group(...)` 启动 100 个并行任务，`chord` 等它们全部完成后把结果列表传给 `aggregate_and_save`。`.s()` 是 signature——把任务和参数打包成可拼接的积木。

## 踩过的坑

1. **参数序列化**：任务参数必须能 pickle/JSON。传 Django ORM 对象会爆——只能传 `user.id`，让 worker 自己去查库。
2. **broker 和 backend 是两套**：只配 `broker` 不配 `result_backend`，`.get()` 永远拿不到返回值——broker 管派单，backend 管存结果。
3. **prefetch 饿死**：默认 `prefetch_multiplier=4`，一个 worker 一次抓 4 条任务。如果碰到 4 个长任务，别的 worker 会饿着等，要把这值调到 1。
4. **beat 单点**：`celery beat` 进程只能跑一份，多副本会重复触发周期任务。生产要用 redbeat 或 celery-beat-cluster 做选主。

## 适用 vs 不适用场景

**适用**：
- Python web 后端把耗时操作（邮件、报表、外部 API 调用）异步化
- 周期任务（取代 cron，享受 worker 池 + 监控）
- 中等复杂度 DAG 工作流（chain/group/chord 够用）

**不适用**：
- 非 Python 项目 → 用 Sidekiq（Ruby）/ BullMQ（Node）/ Inngest（语言无关）
- 超低延迟（< 10ms）→ Celery 序列化 + 网络往返本身就要几 ms，直接用线程池
- 严格 exactly-once 语义 → Celery 是 at-least-once，重复执行得自己加幂等
- 复杂 DAG（数百节点、动态依赖）→ 用 Airflow / Temporal / Prefect

## 历史小故事（可跳过）

- **2009 年**：Ask Solem 在做 Django 项目时受不了 cron + 自写脚本，写了 Celery 雏形，只支持 RabbitMQ。
- **2010 年**：1.0 发布，引入 broker-agnostic 设计——加一层 kombu 抽象，RabbitMQ 和 Redis 都能用。
- **2014 年**：3.x 加入 canvas（group/chord/chain DSL），从"丢任务"升级到"拼工作流"。
- **2018 年**：Solem 离开后由社区接手，节奏明显放缓，但生态地位已稳。
- **2020s**：出现挑战者 RQ（更轻）、Dramatiq（更现代 API）、Huey（更小），Celery 仍是事实标准。

## 学到什么

1. **解耦慢任务和 web 进程**——这是后端工程最常用的架构动作之一，Celery 把它做成了 Python 默认方案
2. **broker-agnostic** 让你换 RabbitMQ ↔ Redis 不用改代码——抽象层的价值就在这种"以后再说"的灵活性
3. **canvas 把任务变成可拼装积木**——`chain/group/chord` 的组合能描述大多数业务 DAG
4. **at-least-once + 幂等**是分布式任务的现实——不要假设任务只跑一次

## 延伸阅读

- 官方文档：[Celery Project](https://docs.celeryq.dev/)（First Steps + Canvas 必看）
- 视频教程：[Celery in Python — Async Task Processing](https://www.youtube.com/watch?v=THxCy-6EnQM)（30 分钟把 broker / worker / beat 讲一遍）
- 对比文章：[Celery vs RQ vs Dramatiq](https://blog.bitsrc.io/python-task-queues-comparison)（2024 年视角）
- [[redis]] —— Celery 最常用的 broker
- [[sidekiq]] —— Ruby 世界的同位语
- [[bullmq]] —— Node.js 世界的同位语

## 关联

- [[redis]] —— Celery 最常用的 broker，也兼任 result backend
- [[kafka]] —— 重型消息系统，Celery 的远房亲戚（场景不同）
- [[sidekiq]] —— Ruby 版 Celery，理念几乎一样
- [[bullmq]] —— Node.js 版 Celery，BullMQ + Redis 是 JS 生态标配
- [[inngest]] —— 新一代事件驱动队列，对标 Celery 的"无 broker 心智"
- [[temporal]] —— 工作流引擎，比 Celery 更适合复杂 DAG
- [[nats]] —— 轻量消息系统，可作 Celery 的替代 broker

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[prefect]] —— Prefect — Python 原生编排，让数据流水线像写普通函数一样自然
- [[rabbitmq-server]] —— RabbitMQ — 用 Erlang 写的多协议消息总线
- [[redis]] —— Redis — 内存键值数据库
- [[superset]] —— Apache Superset — 开源 BI 平台
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通
- [[temporal]] —— Temporal — 持久化工作流引擎

