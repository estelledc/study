---
title: Temporal — 持久化工作流引擎
来源: https://github.com/temporalio/temporal
日期: 2026-05-29
子分类: cloud-native
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Temporal 是一个**让你写普通函数，运行时自动获得"程序崩了从断点继续"能力**的工作流引擎。

日常类比：以前写一个"下单 → 扣款 → 发货 → 通知"的多步流程，得搭一堆 [[kafka]] 队列 + 状态机表 + 定时补偿任务，中间任何一步进程挂了就要人工介入或者全流程重来。Temporal 让你把这一串写成一段普通的 `async` 代码：

```ts
async function processOrder(orderId: string) {
  await chargeCard(orderId)
  await reserveStock(orderId)
  await shipPackage(orderId)
  await sendEmail(orderId)
}
```

进程在第 3 步挂掉，重启后这个 workflow **自动从第 3 步接着跑**，前两步不会重复。你写代码的姿势没变，但底下多了一层"持久化执行"。

它由原 Uber Cadence 团队 2019 年从 Uber 出来商业化做出来，现在是 Snap / Datadog / Stripe / Coinbase 这种公司编排核心业务流程的常见选型。

## 为什么重要

- **微服务编排范式革新**：在 Temporal 之前主流做法是 Saga 模式 + 状态机，每加一步就要手写补偿逻辑、状态转移表、超时处理。Temporal 把这些下沉到 SDK + 集群，业务代码回归"线性几行"
- **生产级使用者多**：Snap 用它跑 Snap Map 的实时计算，Stripe 跑订阅生命周期，Coinbase 跑账户操作，Datadog 跑数据 pipeline 编排
- **生态卡位**：与 AWS Step Functions（闭源、绑死 AWS）、Cadence（fork 源、Uber 内部继续维护）、Argo Workflows（K8s 原生、偏数据 pipeline）形成 workflow 引擎的四强格局
- **多语言 SDK**：Go / TypeScript / Python / Java / .NET / PHP / Ruby 都有官方 SDK，团队可以按语言习惯接入

## 核心要点

Temporal 的心智模型只有 **三个角色**：

1. **Workflow（工作流）**：你写的业务逻辑代码，定义"做哪些事、按什么顺序"。这段代码在 Temporal 里运行时，每一步的输入输出都被存进集群的 history（事件日志）。进程崩掉重启后，集群把 history 重新喂给代码"重放"一遍，跳过已完成的步骤继续往下
2. **Activity（活动）**：所有"会失败的外部调用"都得封成 Activity——发邮件、调第三方 API、查数据库。Activity 自带重试、超时、心跳。Workflow 调 Activity 时只看到一个 `await`，底下是集群在做调度
3. **Worker（工作进程）+ Cluster（集群）**：Worker 是你部署的应用进程，从集群拉任务执行。集群（Server）只做事件存储、调度、超时管理，**不执行业务代码**。这个分离让集群可以做 multi-tenant、业务代码可以横向扩

关键约束：Workflow 代码必须**确定性**。同一个 history 重放必须得到同样的执行路径，否则恢复就错位。所以 Workflow 里不能直接用 `Math.random()` / `Date.now()` / 起一个 `setTimeout` —— 这些都得走 SDK 的 `workflow.now()`、`workflow.uuid4()`、`workflow.sleep()`，让结果被存进 history。

## 实践案例

### 案例 1：写一个订单处理流程

```ts
// workflow.ts
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { chargeCard, reserveStock, shipPackage, sendEmail } =
  proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' })

export async function processOrder(orderId: string) {
  await chargeCard(orderId)
  await reserveStock(orderId)
  await shipPackage(orderId)
  await sendEmail(orderId)
}
```

```ts
// activities.ts
export async function chargeCard(orderId: string) {
  // 真实调支付网关
}
// ... 其他 activity 同理
```

部署：跑一个 Worker 进程注册这两个文件，集群把任务派给它。进程任何时候挂掉，重启会从断点继续，前面成功的步骤不会重跑。

### 案例 2：定时任务 + 工作流复合

每天 9 点跑一次 ETL，用 Temporal 的 Cron Workflow：

```ts
await client.workflow.start(etlWorkflow, {
  cronSchedule: '0 9 * * *',
  workflowId: 'daily-etl',
  taskQueue: 'etl-queue',
  args: [],
})
```

每天 9 点集群自动起一个新的 workflow 实例。比 cron + 手写"上一次跑完没"的状态表干净很多。

### 案例 3：Saga（失败时反向补偿）

```ts
export async function bookTrip(tripId: string) {
  const compensations: Array<() => Promise<void>> = []
  try {
    await bookFlight(tripId)
    compensations.push(() => cancelFlight(tripId))
    await bookHotel(tripId)
    compensations.push(() => cancelHotel(tripId))
    await bookCar(tripId)
  } catch (err) {
    for (const undo of compensations.reverse()) await undo()
    throw err
  }
}
```

任何一步失败，前面已经成功的反向取消。没有 Temporal 的话，这套 try/catch + 补偿队列要自己搭一遍状态持久化，且崩了之后补偿队列怎么续跑也是大坑。

## 踩过的坑

- **Workflow 必须确定性**：在 Workflow 函数里随手写 `Math.random()` / `Date.now()` / `fetch()`，重放时结果不一致就错位崩溃。SDK 在开发模式会直接报错，生产模式可能埋很久。所有非确定性操作都得放进 Activity
- **History 累积爆炸**：一个 workflow 跑久了（比如订阅生命周期跑 3 年），history 累积几 MB，每次重放都慢。解法是 `continueAsNew`——主动把当前状态打包成参数，开一个"逻辑上的同一个" workflow 接着跑，history 重置
- **Activity 超时三件套**：`scheduleToStartTimeout`（任务排队等多久）、`startToCloseTimeout`（执行多久）、`heartbeatTimeout`（心跳间隔）三个超时配错容易死锁——任务永远卡在某个状态。新人常忘配 `startToCloseTimeout` 导致 activity 永不超时
- **心智模型反直觉**：习惯了"消息驱动 + 状态机"的人会一直问"消息从哪来"；Temporal 是"代码驱动 + 隐式状态"，状态在 history 里，你不直接读它。要花一两天扭过来
- **本地调试需要起 Server**：Temporal CLI 提供 `temporal server start-dev` 起单机版，但和生产 cluster 行为有细微差别（比如 archival、跨集群路由）。Code Connect 类的设计review 流程要在 staging 集群跑

## 适用 vs 不适用场景

**适用**：

- 多步骤、需要保证"每步至少执行一次"的业务流程（订单、支付、订阅、KYC）
- 长周期工作流（几小时到几年）—— Saga 模式手写状态持久化太痛
- 跨服务编排，且每个服务的失败模式不同
- 数据 pipeline 中需要业务语义而非纯 DAG（DAG 用 Argo Workflows 更轻）

**不适用**：

- 纯实时计算 / 流处理（用 Flink / Kafka Streams）
- 高 QPS 的简单请求—响应（每个 workflow 实例至少一次 history 写入，QPS 上限受限于集群存储）
- 不需要持久化的临时编排（直接 async/await 就够了）
- 没有运维能力的小团队 —— 集群依赖 Cassandra / PostgreSQL / MySQL + Elasticsearch，自建复杂；可以用 Temporal Cloud 但要付费

## 历史小故事（可跳过）

- **2015 年**：Maxim Fateev 和 Samar Abbas 在 Uber 内部做出 Cadence，解决 Uber 微服务编排痛点
- **2019 年**：两人从 Uber 出来创立 Temporal Inc.，把 Cadence 改名 Temporal 商业化（Cadence 仍在 Uber 维护）
- **2020 年**：Temporal v1.0 发布，Apache 2.0 协议
- **2022 年**：B 轮 7500 万美元，估值 17 亿美元
- **2024 年**：v1.25 加 Nexus —— 跨 Temporal 集群调用的统一抽象，类似把 RPC 上升到 workflow 层
- **现在**：Temporal Cloud 是主要商业化路径；开源版本 + 多语言 SDK 持续迭代

## 学到什么

- **持久化执行**是工作流编排的下一代范式：业务代码线性写，状态自动落盘
- 设计 API 时**心智模型 > 功能数量**：Temporal 只有 Workflow / Activity / Worker 三个概念，但能覆盖 Saga / Cron / 长任务 / 跨服务编排
- "崩了能续跑"的能力来自**事件日志 + 重放**，不是魔法。理解这一层才能避坑（确定性约束）
- 工程演化路径：内部工具（Uber Cadence）→ 商业化分叉（Temporal Inc.）→ 多语言 SDK → 跨集群协议（Nexus）。每一步隔 2-3 年

## 延伸阅读

- 官网入门：[Temporal Docs — TypeScript SDK](https://docs.temporal.io/dev-guide/typescript) （比 README 顺）
- 视频：[Maxim Fateev — What is Temporal?](https://www.youtube.com/watch?v=f-18XztyN6c)（创始人 30 分钟讲清楚为什么这样设计）
- 实战教程：[temporalio/samples-typescript](https://github.com/temporalio/samples-typescript)（订单、Saga、子 workflow 等场景全覆盖）
- 论文级长文：[Designing A Workflow Engine from First Principles](https://temporal.io/blog/workflow-engine-principles)（Maxim 写的，从需求倒推为什么要这个设计）

## 关联

- [[kafka]] —— 传统编排靠 Kafka 队列 + 状态机；Temporal 把这层抽象上移
- [[argocd]] —— 同样是声明式编排，但 ArgoCD 偏 K8s 部署、Temporal 偏业务流程

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[airflow]] —— Apache Airflow — 用 Python 代码画工作流图，让调度器替你按图施工
- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[asynq]] —— Asynq — Go 版 Sidekiq，把后台任务丢进 Redis 慢慢跑
- [[botpress]] —— Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[encore]] —— Encore — 类型安全 Go/TS 后端框架，基础设施即代码
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[orleans]] —— Orleans — 让分布式服务写起来像单机对象
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列

