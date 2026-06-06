---
title: NATS Server — 极简云原生消息中间件
来源: 'https://github.com/nats-io/nats-server'
日期: 2026-06-06
分类: 数据库
子分类: 存储与查询
难度: 中级
---

## 是什么

**NATS Server** 是 NATS 生态的**消息路由核心**——一个 Go 写的轻量进程，客户端通过 TCP 连上来，按 **subject**（主题字符串）做发布/订阅或请求-应答。CNCF 毕业项目，单二进制即可跑在笔记本、K8s 或树莓派上。

日常类比：[[kafka]] 像**货运铁路**——分区、副本、日志段，吞吐巨大但铺轨成本高。[[rabbitmq-server]] 像**分拣中心**——交换机、队列、路由键规则丰富。NATS 像**对讲机频道**——你说「频道 orders.new」，所有调到这个频道的终端同时听到；需要留档时开 **JetStream** 模式，像给对讲机加录音。

启动与发布：

```bash
nats-server -js   # 启用 JetStream 持久化
nats pub orders.new '{"id":1,"sku":"A"}'
nats sub orders.>   # > 通配符订阅 orders 下所有子主题
```

## 为什么重要

不理解 NATS，下面这些事讲不清：

- 为什么云原生微服务常选 NATS 做**服务间事件总线**——部署极简、延迟低
- 为什么「默认不持久化」反而是设计选择——core NATS 追求 fire-and-forget 速度
- 为什么 JetStream 让 NATS 能对标 [[kafka]] 部分场景——流、消费者组、ACK
- 为什么 40+ 语言都有客户端——协议简单，边缘设备也能集成

## 核心要点

1. **Subject 路由**：层级命名 `orders.us.east`，`*` 匹配单层，`>` 匹配多层尾部。订阅表在 server 内存维护。

2. **Core vs JetStream**：Core 纯内存转发，最快；JetStream 把消息写入流文件，支持 at-least-once、回放、限速。

3. **集群与超级集群**：多 server 通过 gossip 交换路由，客户端连任意节点即可发现全局 subject。

4. **安全**：TLS、NKeys/JWT 账户隔离、鉴权可细到 subject 级。

5. **轻量 observability**：内建 varz/ping 便于健康检查，K8s liveness 好接。

## 实践案例

### 案例 1：微服务事件广播

```bash
# 服务 A 发布用户注册事件
nats pub users.registered '{"uid":"u42"}'
# 服务 B/C 各自订阅处理
nats sub users.registered
```

无队列堆积概念时，慢消费者要靠应用层背压或改 JetStream。

### 案例 2：JetStream 持久化流

```bash
nats stream add ORDERS --subjects "orders.>" --storage file --retention limits
nats consumer add ORDERS shipper --filter "orders.ship" --ack explicit
```

流落盘后可重启恢复；`--ack explicit` 保证处理完才确认，类似 [[kafka]] consumer offset。

### 案例 3：与 [[rabbitmq-server]] 对照

| 维度 | NATS Core | NATS JetStream | [[rabbitmq-server]] |
|---|---|---|---|
| 持久化 | 否 | 是 | 队列持久化 |
| 路由模型 | subject 通配 | stream + consumer | exchange + queue |
| 运维复杂度 | 极低 | 中 | 中高 |
| 典型延迟 | 亚毫秒级 | 毫秒级 | 毫秒级 |

订单漏斗、日志采集倾向 Kafka；轻量通知、IoT 遥测倾向 NATS。

## 踩过的坑

1. **以为默认会存消息**——core NATS 重启即丢在途，要业务容忍或启用 JetStream。

2. **subject 设计过扁**——全用 `event` 一条 subject，订阅方收到无关流量。

3. **JetStream 磁盘没规划**——流无限增长撑满盘；必须设 retention 与 max bytes。

4. **用 NATS 扛 Kafka 级吞吐**——分区日志不是其核心优化方向，别硬比 MB/s。

## 适用 vs 不适用场景

**适用**：
- 服务间轻量 pub/sub、控制面事件
- 边缘/嵌入式设备上报遥测
- 需要极简运维的消息层

**不适用**：
- 海量日志归档（优先 [[kafka]]）
- 复杂路由与死信队列（[[rabbitmq-server]] 更成熟）
- 需要 SQL 式消息查询（考虑 [[pulsar]] 等）

## 历史小故事（可跳过）

- **2010**：Derek Collison 在 VMware 时期开始 NATS 设计
- **2018**：捐赠给 CNCF；Synadia 公司持续商业支持
- **2020+**：JetStream 成熟，补齐持久化与流处理
- **2024**：CNCF 毕业；安全审计由 OSTIF 资助

## 学到什么

1. **消息系统可以先极简再叠持久化**——core + JetStream 分层很清晰
2. **subject 命名就是 API 设计**——通配符规则决定扩展性
3. **云原生不等于重**——单二进制 + 集群 gossip 也能横向扩展
4. **选型看交付语义**——at-most-once / at-least-once 要比吞吐先想清楚
5. **CNCF 毕业是运维信心信号**——安全审计与生态文档更完整

## 延伸阅读

- [NATS 官方文档](https://docs.nats.io) — JetStream 与集群指南
- [CNCF NATS 项目页](https://www.cncf.io/projects/nats/) — 生态与毕业信息
- [[kafka]] —— 高吞吐日志型消息对照
- [[rabbitmq-server]] —— AMQP 路由丰富度对照
- [[pulsar]] —— 分层存储与多租户对照

## 与同类对比

| 方案 | 协议风格 | 持久化 | 典型规模 | 许可证 |
|---|---|---|---|---|
| **NATS** | 自定义文本 | JetStream 可选 | 中小集群 | Apache 2.0 |
| [[kafka]] | 二进制日志 | 强 | 大数据流 | Apache 2.0 |
| [[redis]] | Redis | Stream 可选 | 缓存+轻队列 | SSPL |
| [[pulsar]] | 二进制 | 分层存储 | 多租户 | Apache 2.0 |
| [[rabbitmq-server]] | AMQP | 队列 | 企业集成 | MPL |

部署体积上 NATS 常是**最小可运行消息面**之一：单二进制、默认配置即可 pub/sub，适合边缘网关先上线再叠 JetStream。

## 关联

- [[kafka]] —— 日志流与高吞吐对照
- [[rabbitmq-server]] —— AMQP 路由与队列语义
- [[pulsar]] —— 云原生多租户消息
- [[redis]] —— Stream 轻量队列替代
- [[etcd]] —— 常同栈出现，协调 vs 事件分工
- [[kubernetes]] —— 控制面事件与 sidecar 通信常见 NATS

微服务里把「配置协调」交给 [[etcd]]，把「业务事件」交给 NATS，是常见职责切分。

新手可先 `nats-server -js` 本地起服，用 `nats pub/sub` 验证 subject 再接入业务。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lmdb]] —— LMDB — 闪电内存映射嵌入式 KV 库

