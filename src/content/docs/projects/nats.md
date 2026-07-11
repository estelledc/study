---
title: NATS — 极简云原生消息系统
来源: 'https://github.com/nats-io/nats-server'
日期: 2026-05-29
分类: 消息队列
难度: 中级
---

## 是什么

NATS 是 Derek Collison 2010 年用 Go 写的**极简快速消息系统**——单 binary 启动、亚毫秒级延迟、按 subject（主题）路由。日常类比：

- [[kafka]] 像**高速公路**——吞吐量大、车多、能拉重货，但要先建收费站、修路、调度，启动慢
- NATS 像**电话总机**——拿起电话拨号即通，秒级响应，主打"即时短消息"

写一行 `docker run -p 4222:4222 nats` 就起来了，不用 ZooKeeper、不用 Kafka 控制器、不用 schema registry。这种"启动几秒就能用"的体验是它最大的卖点。

## 为什么重要

不了解 NATS 会错过这些事：

- **启动极快、单机吞吐极高**——官方基准常见到单核千万级消息/秒量级（视消息大小与硬件而定），做 RPC 替代 / 服务总线时很难被忽视
- **JetStream 加持**：核心 NATS 是 fire-and-forget（射后不理），JetStream 加上"持久化 + at-least-once"，既能秒级广播也能可靠落盘
- **与 [[kafka]] / [[pulsar]] 划清边界**：NATS 主打轻量低延迟微服务总线；Kafka 主打大吞吐长保留；Pulsar 主打多租户分层存储。三者不互相替代
- **CNCF 毕业项目**：2023 年从 incubating 升毕业，云原生圈子里消息总线事实标准之一

## 核心要点

### 1. Subject-based routing（按主题树状路由）

NATS 不像 Kafka 的"topic + partition"那么重，它用一棵**主题树**：

```
events.user.created
events.user.updated
events.order.placed
```

订阅时可以用通配符：

- `events.user.*` → 只收 user 一层
- `events.>` → 收 events 整棵子树

类比：你订报纸时既可以"只订体育版"也可以"订整份报纸"，不用注册 partition、不用算 hash。

### 2. Core NATS + JetStream 两层

| 层 | 模式 | 类比 |
|---|---|---|
| Core NATS | fire-and-forget，broker 不存盘 | UDP 风格——发出去就算完，没人接就丢 |
| JetStream | 持久化 + at-least-once | 留言信箱——消息存盘，消费者随时回放 |

默认起的是 Core NATS。要持久化必须**显式开启 JetStream**（`--jetstream` 启动参数）。

### 3. Multi-tenancy + Account 隔离

一个 NATS 集群可以分多个 **Account**（账户），每个 Account 内的 subject 互相隔离。一家公司里"订单组"和"风控组"用同一套 NATS，subject 不会撞。

类比：写字楼里多个公司共用一栋楼，各自的电话分机互不串线。

## 实践案例

### 案例 1：一行启动

```bash
docker run -p 4222:4222 nats
```

几秒后端口 4222 就能 publish / subscribe。无配置文件、无依赖。

### 案例 2：Pub/Sub 收发

```bash
# 终端 A：订阅整棵 events 子树
nats sub "events.>"

# 终端 B：发送一条消息
nats pub events.user.created '{"id":1,"name":"Alice"}'
```

终端 A 立刻打印出收到的 JSON。延迟通常 < 1ms。

### 案例 3：JetStream 持久化

```bash
# 1. 创建流，订阅 orders.*，自动持久化
nats stream add ORDERS --subjects "orders.>"

# 2. 发消息
nats pub orders.placed '{"order":42}'

# 3. 即使消费者还没起来，消息也在磁盘
nats consumer add ORDERS workers
nats consumer next ORDERS workers
```

到这一步 NATS 已能覆盖许多"持久订阅"场景，且配置量远少于 Kafka。

## 踩过的坑

1. **Core NATS 不持久化**——没人订阅或订阅者掉线时消息直接丢。要持久化必须先 `--jetstream`，再 `nats stream add` 建流。
2. **JetStream 存储策略选错**——`FileStorage` vs `MemoryStorage`；FileStorage 还要看 `fsync` 频率：每条 fsync 安全但慢，批量 fsync 快但崩溃可能丢最近几条。
3. **Account / User 权限是 NATS 自有体系**——和 K8s RBAC 不通；能进 pod 不等于能 publish 到 subject。
4. **集群 quorum 易混**——三节点 JetStream 用 Raft，`cluster.routes` 要列出所有节点；少写一个就组不成 quorum，写错端口常沉默不报错。

## 适用 vs 不适用

**适用**：

- 微服务之间的 RPC / 事件总线，要求低延迟（< 1ms）
- 边缘计算 / IoT 设备汇聚，要轻量启动
- 临时通知 / 心跳广播 / 状态同步（用 Core NATS）
- 中小规模可靠队列（用 JetStream）

**不适用**：

- 单 topic 日 TB 级数据 → 用 [[kafka]]
- 跨地域多 region 持久订阅 + 长保留（30 天+）→ Kafka / Pulsar 更成熟
- 需要 schema registry / Avro / Protobuf 强约束 → NATS 不内置，自己拼

## 历史小故事（可跳过）

- **2010 年**：Derek Collison（Cloud Foundry / TIBCO 出身）写出 NATS 第一版，原是 CF 内部控制平面消息总线
- **2014 年**：Synadia 成立，专门做 NATS 商业化与持续开发
- **2017 年**：加入 CNCF Sandbox
- **2018 年**：v2.0 引入 Account（多租户隔离）
- **2020 年**：JetStream 上线，补齐持久化与可靠投递
- **2023 年**：从 CNCF 毕业，成为基金会顶级项目

## 学到什么

1. **"轻量"是一种功能**——默认仍是 Core NATS；把"够用"放在"全功能"前面
2. **subject 树状路由 vs partition 哈希**——前者灵活但难做严格分区有序，选型看消息是否需要有序
3. **Account 是云原生多租户切法**——不必再起一套集群，而是逻辑隔离
4. **fire-and-forget 是合理选择**——控制信号 / 心跳丢了重发即可，强行上 Kafka 常是过度设计

## 延伸阅读

- 官方文档：[NATS Concepts](https://docs.nats.io/nats-concepts/overview)（30 分钟过完核心概念）
- JetStream 教程：[NATS by Example](https://natsbyexample.com/)（按场景给可运行示例）
- Derek Collison 演讲：[Distributed Systems with NATS](https://www.youtube.com/results?search_query=derek+collison+nats)
- 源码入口：`nats-server/server/server.go`（Go 写，主循环体量可控）

## 关联

- [[kafka]] —— 高吞吐流平台；与 NATS 是"重 vs 轻"的两端
- [[pulsar]] —— 多租户 + 分层存储；和 NATS 比更重、保留更长
- [[etcd]] —— 都用 Raft，但 etcd 是强一致 KV，NATS JetStream 是流
- [[redis]] —— Redis Pub/Sub 也轻量，但不持久化、无 subject 通配符
- [[rabbitmq-server]] —— 传统 AMQP 队列；路由更丰富，运维更重
- [[mosquitto]] —— MQTT broker；IoT 协议栈对照
- [[nanomq]] —— 边缘 MQTT；和 NATS 边缘场景常被一起比较

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
