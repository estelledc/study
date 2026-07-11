---
title: Encore — 类型安全 Go/TS 后端框架，基础设施即代码
来源: https://github.com/encoredev/encore
日期: 2026-05-30
分类: 后端 / 框架
难度: 中级
---

## 是什么

Encore 是一个**让你只写应用代码、基础设施自己长出来**的开源后端框架，支持 Go 和 TypeScript。

日常类比：传统后端开发像装修房子要同时管三本账——业务代码（家具）、Terraform/IaC（水电图）、docker-compose（看房 demo）。改一处忘了同步另两处，立刻漂移：本地能跑、staging 报错、生产 IAM 权限不够。Encore 把"水电图"这本账消掉了——你在代码里写 `sqldb.NewDatabase("orders", ...)`，框架就知道要给你建一个 Postgres，本地用 docker、AWS 用 RDS、GCP 用 Cloud SQL，全自动。

```go
import "encore.dev/storage/sqldb"

var orders = sqldb.NewDatabase("orders", sqldb.DatabaseConfig{
    Migrations: "./migrations",
})
```

这一行代码就是基建声明 + 业务依赖。Encore 静态分析整个代码库，生成一张"应用图"（Application Graph），`encore run` 起本地等价环境，`encore deploy` 按图自动 provision 云资源 + 配最小 IAM 权限。

## 为什么重要

- **基础设施即代码的"代码"反过来变成主角**：以前 IaC 是配置文件，应用代码引用它；Encore 让应用代码声明依赖、IaC 自动推导，单一真相源
- **本地与云端 1:1 等价**：`encore run` 一条命令起完整环境，新人入职不用装 Postgres / Redis / NSQ，避免"在我机器上能跑"
- **生产级使用者验证**：Groupon 报告开发提速 2-3 倍，Bookshop.org DevOps 时间降 95%，Pave Bank 9 个月建出一家银行
- **Go/TS 双 SDK + AI 友好**：内置 MCP server 让 Claude / Cursor 这类 agent 直接读应用图做修改建议，是少数从设计上拥抱 AI 协作的后端框架

## 核心要点

Encore 的心智模型只有 **三层**：

1. **Service（服务）**：你写的业务代码包，可以是单进程单服务也可以多服务。Service 之间互相 import 直接调用，框架识别这是一条服务依赖，本地走进程内、生产走 HTTP/RPC——你写代码的姿势不变
2. **Resource（资源）**：框架内置的基建原语——SQL Database / Pub/Sub Topic / Object Storage / Cron Job / Cache / Secret。在代码里 `import` + 一行声明就拥有这个资源，框架按云环境映射成具体实现
3. **Application Graph（应用图）**：静态分析整个代码库得到的一张图，节点是 Service / Resource，边是调用 / 依赖。这张图就是 IaC 的等价物——`encore deploy` 按图建云资源、配 IAM、生成架构图、生成分布式追踪

关键约束：Encore 是**框架不是库**——你必须按它的项目结构组织代码（每个 service 一个目录、`encore.app` 配置文件、API endpoint 用 `//encore:api` 注解或 TS 装饰器声明）。这个约束换来了应用图能被精确推导，但也意味着**遗留项目接不进来**，要用就要新建项目。

## 实践案例

### 案例 1：Postgres + Pub/Sub 订单服务

```go
package orders

import (
    "encore.dev/pubsub"
    "encore.dev/storage/sqldb"
)

var db = sqldb.NewDatabase("orders", sqldb.DatabaseConfig{
    Migrations: "./migrations",
})

var OrderCreated = pubsub.NewTopic[*Order]("order-created",
    pubsub.TopicConfig{DeliveryGuarantee: pubsub.AtLeastOnce})

//encore:api public method=POST path=/orders
func Create(ctx context.Context, req *CreateReq) (*Order, error) {
    o := &Order{ID: req.ID, Amount: req.Amount}
    _, err := db.Exec(ctx, "INSERT INTO orders ...", o.ID, o.Amount)
    if err != nil { return nil, err }
    OrderCreated.Publish(ctx, o)
    return o, nil
}
```

`encore run` 起本地：自动拉 Postgres docker + NSQ docker + 跑 migrations。部署到 AWS：自动建 RDS + SNS+SQS + IAM。代码一行没改。

### 案例 2：Cron Job 日报生成

```ts
import { CronJob } from "encore.dev/cron";
import { api } from "encore.dev/api";

export const generate = api({ method: "POST" }, async () => {
  // 拉昨天数据，生成日报，发邮件
});

const _ = new CronJob("daily-report", {
  title: "每日日报",
  schedule: "0 9 * * *",
  endpoint: generate,
});
```

部署到 AWS 自动注册成 EventBridge Rule，部署到 GCP 自动是 Cloud Scheduler。不用自己写 K8s CronJob YAML。

### 案例 3：跨服务调用 + IAM 自动开通

```go
// service billing/billing.go
import "myapp/orders"

//encore:api private
func Charge(ctx context.Context, orderID string) error {
    order, err := orders.Get(ctx, orderID)  // 直接 import 调用
    if err != nil { return err }
    return chargeCard(order.Amount)
}
```

应用图识别 billing → orders 的依赖，本地是函数调用，生产是 HTTP，IAM 自动允许 billing 服务调 orders。手写的话要改 service mesh / API Gateway 配置 + 手写 Auth header。

## 踩过的坑

1. **语言锁定**：当前只有 Go 和 TypeScript，Python 标 coming soon；团队主语言是 Java / Rust / Python 时无法接入，混合栈也不行
2. **99% 覆盖、1% 缺口要绕开**：常见 Postgres / Pub/Sub / S3 / Cron 都覆盖；用到 SQS FIFO 特殊语义、Aurora Serverless v2 高级配置时只能手写 AWS SDK，那部分就脱离应用图
3. **云厂商支持不全**：AWS 和 GCP 一等公民，Azure 在 roadmap，阿里云 / 华为云完全不支持；已在 Azure 上的服务迁过来要重做基建
4. **应用图是黑盒**：想看 Encore 到底给我建了什么 IAM policy / SG 规则要去控制台对照，不像 Terraform 有一份显式 `.tf` 可读，审计/合规场景下可能需要导出工具

## 适用 vs 不适用场景

**适用**：

- 全新项目从零搭后端，团队主语言是 Go 或 TypeScript
- 想跨 AWS / GCP 但不想被绑死，又不想自己学 Terraform
- 小团队没专职 DevOps，希望本地 `encore run` 一键起环境
- AI 协作密集——内置 MCP server 让 agent 能读懂应用图

**不适用**：

- 遗留项目接入——Encore 要求按它的项目结构重写
- 需要 Azure / 阿里云 / 华为云的部署目标
- 主语言是 Python / Java / Rust 的团队（至少等到 Python SDK GA）
- 强合规审计场景，IaC 必须显式声明、可 diff、可签字（用 [[terraform]] 更合适）

## 历史小故事（可跳过）

- **2018 年**：André Eriksson 在 Spotify 看到大公司内部基建工具痛点（每个团队都重新发明 service+DB+queue 的接线），构思 Encore 雏形
- **2021 年**：Encore 开源 Go 版本，主打 "no Terraform, no docker-compose"
- **2023 年**：增加 TypeScript SDK，Go/TS 双 SDK 完全平价，开始抢 Node.js 后端市场
- **2024 年**：发布 Encore Cloud 商业化产品，提供托管控制台 + Preview Environments per PR
- **2025 年**：加入 MCP server 支持，主动拥抱 AI agent 协作（Claude / Cursor 直接读应用图）
- **2026 年 5 月**：v1.57 发布，GitHub 12k stars

## 学到什么

- **基础设施即代码的下一步是"基础设施从代码推导"**：IaC 让基建可重复，Encore 让基建从应用代码自动长出来，去掉一份漂移源
- **应用图是新一代后端框架的核心抽象**：传统框架核心是 router + middleware，Encore 的核心是 Application Graph，所有能力（IAM / 追踪 / 架构图）都从图上长出
- **"框架而非库"是有代价但值得的取舍**：失去渐进接入，换来精确静态分析 + 跨云 provision
- **AI 友好不是事后补丁**：内置 MCP server 是从设计上承认 agent 是一等用户，2025 年后端框架的差异化方向

## 延伸阅读

- 官方文档：[Encore Docs](https://encore.dev/docs)（从 Hello World 到生产部署的完整通路）
- 视频：[André Eriksson — Why Encore](https://www.youtube.com/results?search_query=encore.dev+andre+eriksson)（创始人讲为什么这样设计）
- 实战教程：[encoredev/examples](https://github.com/encoredev/examples)（订单、Pub/Sub、Cron、跨服务调用都有）
- 对比文章：[Encore vs Terraform](https://encore.dev/blog/why-not-terraform)（官方视角解释取舍）

## 关联

- [[temporal]] —— 同样把"基建复杂度"下沉到框架，但 Temporal 管的是工作流执行，Encore 管的是基础设施声明
- [[kafka]] —— Encore 的 Pub/Sub 在生产环境可以映射到 Kafka，但默认走云原生 SNS+SQS / Cloud Pub/Sub
- [[argocd]] —— 都是声明式部署，但 ArgoCD 在 K8s 资源层、Encore 在应用代码层
- [[go-zero]] —— 同为 Go 后端框架，go-zero 偏 RPC + 微服务治理，Encore 偏基础设施推导
- [[terraform]] —— Encore 的对立面：Terraform 是显式 IaC，Encore 是隐式从代码推导
- [[inngest]] —— 都做 Cron + Pub/Sub 编排，Inngest 偏事件驱动，Encore 偏完整后端
- [[chi]] —— 轻量 Go router，零基建抽象，与 Encore 是两个极端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
