---
title: NATS Server — 极简云原生消息总线
来源: https://github.com/nats-io/nats-server
日期: 2026-06-01
分类: 消息队列
难度: 中级
---

## 是什么

NATS Server 是 Derek Collison 2010 年用 Go 写的**极简消息中间件**——单 binary 启动、亚毫秒级转发、按 subject（主题）做发布订阅。日常类比：

- [[kafka]] 像**高速公路收费站**——能拉重货、能保留三个月日志，但要先建收费亭、调度车流，启动要分钟级
- NATS 像**电话总机**——拿起话筒拨号即通，话筒挂上消息就走，主打"即时短消息"

写一行 `docker run -p 4222:4222 nats` 就跑起来，不用 ZooKeeper、不用 schema registry、不用控制器集群。这种"启动 5 秒就能用"的体验是它能从一堆消息系统里杀出重围的关键。

仓库 GitHub Star 约 16k，2023 年从 CNCF Incubating 升 **Graduated**，云原生圈子事实标准之一。

## 为什么重要

不了解 NATS 会错过这些事：

- **延迟极低**：单核每秒转发 1800 万条消息，p99 在亚毫秒。做 RPC 替代或服务总线时几乎找不到对手
- **核心 + JetStream 两层架构**：核心 NATS 是 fire-and-forget（射后不理），JetStream 给它加上"持久化 + at-least-once + 流回放"，既能秒级广播也能可靠落盘
- **与 Kafka / Pulsar 划边界**：NATS 主打"轻、快、做微服务总线"；[[kafka]] 主打"大吞吐 + 长保留"；[[pulsar]] 主打"多租户 + 分层存储"——三者各占一极，互不替代
- **Go 单 binary 部署哲学**：`go build` 出来一个 30MB 文件，不带依赖、跨平台。这种"运维简单到没朋友"的设计正是云原生时代的红利

## 核心要点

理解 NATS 抓住三件事：**subject 路由 / 多种交付模式 / JetStream 持久化层**。

### 1. Subject-based routing（按主题树状路由）

NATS 不像 [[redis]] 用 channel 名直接匹配，而是用**点分主题 + 通配符**：

```
订单系统：orders.us.created       订单美国分部新建
        orders.eu.shipped       订单欧洲分部已发
通配符：orders.*.created          匹配任何分部新建
        orders.>                  匹配 orders 下所有层级
```

`*` 匹配一段，`>` 匹配多段。这种树状路由让"一个 NATS 集群承载几百个微服务"变得自然。

### 2. 三种核心交付模式

| 模式       | 语义              | 类比                  |
|----------|-----------------|---------------------|
| Pub/Sub  | 一对多广播           | 电台广播——所有调到这频率的人都收到  |
| Request/Reply | 一对一带回执     | 打电话——拨号、说话、等对方回      |
| Queue Group   | 多个订阅者抢消息   | 客服热线——多个坐席轮流接，一通电话只一个人接 |

这三种模式都用同一套 subject 语法，切换只是订阅时多一个参数。

### 3. JetStream：可持久化的"加挂车"

核心 NATS 是内存转发，断电消息就没了。JetStream 是一层**可选的持久化引擎**：

- **Stream**：按 subject 模式收集消息，落到本地文件（或内存）
- **Consumer**：从 Stream 拉，支持 ack、replay、按时间点重放
- **Replication**：3 副本 Raft，主挂了换备
- **Limits**：按时间 / 大小 / 条数自动裁剪老消息

这一层让 NATS 能用同一套 API 既做秒级 RPC 又做"持久任务队列"，不用拉第二套系统。

### 4. 集群与超级集群

NATS 集群（cluster）是**全连接 mesh**——每个节点都跟其他节点建一条 TCP 长连接，消息一跳就到。比 [[kafka]] 的 controller-broker 模型简单得多。再上一层叫 **super-cluster**，连接多地集群做地理分区，跨数据中心走"懒同步"。

## 实践案例

### 案例 1：服务间解耦的事件总线

电商场景：订单服务发 `orders.created`，库存服务、积分服务、邮件服务各自订阅。订单服务**不知道**有谁在听，加新订阅者零改动。

```go
// 发布方
nc.Publish("orders.created", orderJSON)

// 订阅方（库存服务）
nc.Subscribe("orders.created", func(m *nats.Msg) {
    deductStock(m.Data)
})
```

### 案例 2：用 Queue Group 做工作分发

```go
// 三台 worker 都加入 "image-workers" 组
nc.QueueSubscribe("jobs.image", "image-workers", handle)
```

NATS 自动**轮流**派给三台 worker，一条消息只被一个人处理——天然的负载均衡，不用搞 Redis list pop。

### 案例 3：JetStream 替代 Kafka 的轻量场景

中小型项目原本要上 [[kafka]]——3 台 broker + ZooKeeper + Schema Registry。换 NATS JetStream：3 个 nats-server 节点起 cluster，开 JetStream，吞吐量做到 100 万条/秒、消息 7 天保留——足够覆盖大多数业务，运维成本降一个数量级。

## 踩过的坑

1. **核心 NATS 不持久化**：默认发完就忘。订阅者断线重连后**收不到**断线期间的消息。新手常以为"消息一定不会丢"——错。要持久化必须开 JetStream

2. **subject 设计跑偏**：subject 树设计不好（比如全部塞 `events.>`）会导致集群扇出爆炸。规范做法是 `domain.entity.action` 三段式

3. **JetStream 不是 Kafka 替代品**：长保留 + 大吞吐场景（比如 100GB/天 保留 30 天）JetStream 会被磁盘 IO 拖垮。这种场景还是 [[kafka]] 更稳

4. **集群规模有上限**：因为是全连接 mesh，节点数 > 50 时连接数会爆（n^2）。大规模要走 super-cluster 分片

5. **Request/Reply 默认无超时**：忘记设 timeout 会一直挂着等回复。必须 `nc.Request(subj, data, 2*time.Second)` 显式带超时

## 适用 vs 不适用场景

**适用**：
- 微服务间事件总线 / 服务发现 / 心跳广播
- 边缘计算（NATS 才几十 MB 内存，可在树莓派跑）
- 实时通知（聊天 presence、IoT 设备状态推送）
- 中小型可靠任务队列（用 JetStream 替代 [[redis]] + Sidekiq）

**不适用**：
- 超大吞吐 + 长保留日志（>30 天 + TB 级）→ 用 [[kafka]]
- 需要 SQL 查询历史消息 → NATS 不是数据库
- 强一致性事务（exactly-once 跨多 subject）→ NATS 只保证 at-least-once
- 多租户严格隔离 + 分层存储 → 用 [[pulsar]]

## 学到什么

1. **简单是一种特性**——NATS 用极小的复杂度覆盖了 80% 消息场景，剩下 20% 让位给 Kafka/Pulsar，不贪
2. **核心 + 可选层** 的设计哲学：核心保证极致性能，重功能（持久化、KV、对象存储）走 JetStream 可选挂载，不让简单用户为复杂功能买单
3. **subject 通配符 + queue group** 这两个原语足够构建大部分消息模式——RPC、广播、工作队列、扇入扇出
4. **Go 单 binary** 在云原生时代的运维红利怎么强调都不过分：无依赖、跨平台、容器友好
5. **协议轻**：NATS 客户端协议是基于文本的（`PUB`、`SUB`、`MSG` 等关键字），调试时 `telnet` 直连 4222 端口手敲都能跑——这种透明度极大降低了工具开发和故障排查门槛

## 延伸阅读

- 官方文档：[NATS.io](https://nats.io/)（结构清晰，有大量 Go/Python/JS 示例）
- 创始人讲座：Derek Collison 在 GopherCon 2017 讲 NATS 设计哲学
- 与 Kafka 对比：[NATS vs Kafka](https://nats.io/blog/comparing-nats-jetstream-to-kafka/)（官方但相对客观）
- 源码起点：仓库 `server/server.go` 看主循环、`server/jetstream.go` 看持久化层
- 客户端：`nats.go`（Go 官方）、`nats.js`（JS）、`nats.py`（Python），三者协议层一致，切语言成本低

## 关联

- [[kafka]] —— 大吞吐长保留消息系统，与 NATS 主打不同场景
- [[pulsar]] —— 多租户分层存储消息系统，互补
- [[redis]] —— 早期常被当 pub/sub 用，NATS 是它在消息总线场景的进阶替代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

