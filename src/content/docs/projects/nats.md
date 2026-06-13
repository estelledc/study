---
title: NATS — 极简云原生消息系统
来源: https://github.com/nats-io/nats-server
日期: 2026-05-29
子分类: cloud-native
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

NATS 是 Derek Collison 2010 年用 Go 写的**极简快速消息系统**——单 binary 启动、亚毫秒级延迟、按 subject（主题）路由。日常类比：

- [[kafka]] 像**高速公路**——吞吐量大、车多、能拉重货，但要先建收费站、修路、调度，启动慢
- NATS 像**电话总机**——拿起电话拨号即通，秒级响应，主打"即时短消息"

写一行 `docker run -p 4222:4222 nats` 就起来了，不用 ZooKeeper、不用 Kafka 控制器、不用 schema registry。这种"启动 5 秒就能用"的体验是它最大的卖点。

## 为什么重要

不了解 NATS 会错过这些事：

- **启动 < 50ms，单核 1800 万消息/秒**——速度上的王者，做 RPC 替代 / 服务总线时几乎找不到对手
- **JetStream 加持**：核心 NATS 是 fire-and-forget（射后不理），JetStream 给它加上"持久化 + at-least-once"两条腿，既能秒级广播也能可靠落盘
- **与 [[kafka]] / Pulsar 划清边界**：NATS 主打"轻量、低延迟、做微服务总线"；Kafka 主打"大吞吐 + 长保留"；Pulsar 主打"多租户 + 分层存储"。三者不互相替代
- **CNCF 毕业项目**：2023 年从 incubating 升毕业，云原生圈子里"消息总线"事实标准之一

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

5 秒后端口 4222 就能 publish / subscribe。无配置文件、无依赖。

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
# 1. 创建一个流，订阅 orders.* 主题，自动持久化
nats stream add ORDERS --subjects "orders.>"

# 2. 发消息
nats pub orders.placed '{"order":42}'

# 3. 即使消费者还没起来，消息也存在磁盘
nats consumer add ORDERS workers
nats consumer next ORDERS workers
```

到这一步 NATS 已经能替代 Kafka 的"持久订阅"场景了，且配置量少一个数量级。

## 踩过的坑

1. **Core NATS 不持久化**——没人订阅 / 订阅者掉线时，消息直接丢。新人常踩"我发了为啥没收到"。规则：要持久化必须先 `--jetstream` 起服务、再 `nats stream add` 建流
2. **JetStream 存储策略选错**——`FileStorage`（磁盘）vs `MemoryStorage`（内存），选错要么慢要么丢。FileStorage 还要看 `fsync` 频率：每条 fsync 安全但慢，批量 fsync 快但崩溃可能丢最近几条
3. **Account / User 权限是 NATS 自有体系**——和 K8s RBAC 不通。在 K8s 里跑 NATS 集群时容易混淆"K8s 里能进 pod 不等于能 publish 到 subject"
4. **集群 quorum 配置易混**——三节点集群里 JetStream 用 Raft，要写 `cluster.routes` 列出**所有**节点。少写一个就组不成 quorum，写错端口默认沉默不报错
5. **subject 命名一旦广泛使用就难改**——子树通配符让消费者依赖结构。重构 `events.user.*` → `user.events.*` 时所有订阅方都要同步改

## 历史小故事（可跳过）

- **2010 年**：Derek Collison（Cloud Foundry / TIBCO 出身）写出 NATS 第一版，原是 CF 内部的"控制平面消息总线"
- **2014 年**：Synadia 公司成立，专门做 NATS 的商业化和持续开发
- **2017 年**：加入 CNCF，进入 Sandbox
- **2018 年**：v2.0 发布，引入 Account（多租户隔离）
- **2020 年**：JetStream 上线，补齐"持久化 + 可靠投递"短板
- **2023 年**：从 CNCF 毕业，正式成为基金会顶级项目
- **2024 年**：v2.10 加入 Sourcing（流到流的转发），开始往"流处理平台"方向走

15 年从一个"启动脚本里的内部组件"长成 CNCF 毕业项目，演化路线非常清楚——先做"足够快的总线"，再补"足够可靠的存储"。

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

## 学到什么

1. **"轻量"是一种功能**——JetStream 把 NATS 从"广播工具"扩展成"消息系统"，但默认启动还是 Core NATS。设计上把"够用"放在"全功能"前面
2. **subject 树状路由 vs partition 哈希**——前者灵活但难做有序保证，后者严格但写消费者复杂。选型时看"消息是否需要严格分区有序"
3. **Account 是云原生时代的新概念**——多租户隔离不再靠"再起一套集群"，而是逻辑划分
4. **fire-and-forget 是合理选择**——不是所有消息都需要持久化，控制信号 / 健康心跳 / 临时通知丢了重发即可，强行上 Kafka 是过度设计

## 延伸阅读

- 官方文档：[NATS Concepts](https://docs.nats.io/nats-concepts/overview)（30 分钟过完核心概念）
- JetStream 教程：[NATS by Example](https://natsbyexample.com/)（按场景给可运行示例）
- Derek Collison 演讲：[Distributed Systems with NATS](https://www.youtube.com/results?search_query=derek+collison+nats)（YouTube 多场，听他讲设计哲学）
- 源码入口：`nats-server/server/server.go`（Go 写，主循环不到 2000 行）

## 关联

- [[kafka]] —— 高吞吐流平台；与 NATS 是"重 vs 轻"的两端
- [[etcd]] —— 都用 Raft，但 etcd 强一致 KV，NATS JetStream 是流
- [[redis]] —— Redis Pub/Sub 也轻量，但不持久化、无 subject 通配符
