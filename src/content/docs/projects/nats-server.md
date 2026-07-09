---
title: NATS Server — 极简云原生消息总线
来源: 'https://github.com/nats-io/nats-server'
日期: 2026-07-09
分类: databases
难度: 初级
---

## 是什么

NATS Server 是一个用 Go 写的**消息总线**：程序把消息发到一个名字上，其他程序只要订阅这个名字，就能收到。日常类比：它像办公室里的内线电话总机，A 不需要知道 B 坐在哪层，只要拨“订单组”这个分机名，电话系统自己把话送到正在值班的人那里。

这个“名字”在 NATS 里叫 **subject**，比如 `orders.created`、`device.42.temp`。NATS Server 的工作不是理解消息内容，而是负责三件事：收消息、按 subject 找订阅者、把消息转发出去。

NATS 的特别之处是“少而快”：核心模式不默认落盘，适合低延迟通知；需要持久化时再打开 JetStream，让消息可以保存、重放、确认处理。

## 为什么重要

不理解 NATS Server，下面这些事很难讲清：

- 为什么有些微服务不用 HTTP 调来调去，而是围着一个 subject 总线协作。
- 为什么“消息队列”不一定都像 [[kafka]] 那样有分区、长日志和重运维。
- 为什么 Core NATS 消息没人在线接收时会丢，而 JetStream 又能把消息存下来等消费者。
- 为什么边缘设备、控制平面、服务发现这类场景常常更看重低延迟和轻部署，而不是无限期保留数据。

## 核心要点

1. **Subject 是地址，不是表名**。类比：快递单上写的是“收件路线”，不是仓库货架编号。发布者发到 `orders.created`，订阅者可以精确订这个 subject，也可以用 `orders.*` 或 `orders.>` 收一片范围。

2. **Core NATS 先保证快，JetStream 再补可靠**。类比：对讲机适合即时沟通，留言箱适合人不在时留消息。Core NATS 是在线转发，JetStream 把消息放进 stream，再让 consumer 按自己的节奏取。

3. **请求-响应也是 publish/subscribe 拼出来的**。类比：你在前台喊“谁能处理打印机问题”，某个值班同事回应，而不是你事先知道他的座位号。NATS 用临时 inbox subject 把回复送回请求方。

这三点让 NATS 更像“连接层”：它不是先定义庞大数据模型，而是先让分散的程序能互相找到、互相发话。

## 实践案例

### 案例 1：用 subject 做广播通知

```bash
# 终端 A：订阅一层通配符，能收到 greet.joe / greet.pam
nats sub "greet.*"

# 终端 B：发布几条问候
nats pub greet.joe "hello joe"
nats pub greet.pam "hello pam"
nats pub greet.eu.alice "hello alice"
```

逐部分解释：

- `greet.*` 只匹配一个 token，所以能收到 `greet.joe`，收不到 `greet.eu.alice`。
- 这就是官方文档里的 publish-subscribe 模式：发布者只管 subject，所有匹配订阅者都会收到。
- 如果终端 A 没开，Core NATS 默认不会帮你补发旧消息；这不是 bug，而是它的 at-most-once 取舍。

### 案例 2：用 request-reply 做一个小服务

```bash
# 终端 A：服务实例 A
nats reply foo "service A Reply# {{Count}}"

# 终端 B：服务实例 B
nats reply foo "service B Reply# {{Count}}"

# 终端 C：发请求，多执行几次会看到不同实例回复
nats request foo "Simple request"
nats request foo --count 5 "Request {{Count}}"
```

逐部分解释：

- `nats reply foo ...` 既订阅 `foo`，也在收到请求后把响应发回请求方的 inbox。
- 多个 reply 实例默认组成队列组；每个请求只让其中一个实例处理，像多个窗口轮流接待。
- 这适合“找一个可用服务干活”，不适合“所有服务都必须收到同一条广播”。

### 案例 3：用 JetStream 做可确认的工作队列

```go
js, _ := jetstream.New(nc)
stream, _ := js.CreateStream(ctx, jetstream.StreamConfig{
    Name: "EVENTS",
    Retention: jetstream.WorkQueuePolicy,
    Subjects: []string{"events.>"},
})

js.Publish(ctx, "events.us.page_loaded", nil)
js.Publish(ctx, "events.eu.mouse_clicked", nil)

consumer, _ := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
    Name: "processor-1",
})
msgs, _ := consumer.Fetch(2)
for msg := range msgs.Messages() {
    msg.DoubleAck(ctx)
}
```

逐部分解释：

- `WorkQueuePolicy` 表示消息被消费者确认后就可以从 stream 里移走，像“待办事项做完就划掉”。
- `Subjects: []string{"events.>"}` 把所有 `events.` 开头的消息收入这个 stream。
- `Fetch(2)` 是消费者主动拿两条消息；`DoubleAck` 等服务端确认 ack 已收到，降低重复投递风险。

## 踩过的坑

1. **把 Core NATS 当持久队列**：Core 模式没人订阅就会丢消息，离线补偿要用 JetStream。
2. **subject 设计太随意**：`orders.eu.created` 和 `eu.orders.created` 都能用，但通配符消费者会被命名结构锁住。
3. **以为 request-reply 等于 HTTP**：NATS 的回复靠 inbox subject，天然能做多实例队列和 no responders 快速失败。
4. **把 JetStream 当无限硬盘**：stream 仍然要设置保留策略、大小限制、ack 策略和副本数，否则成本会失控。

## 适用 vs 不适用

**适用**：

- 微服务之间的事件通知、状态广播、控制命令。
- 边缘设备或小集群，需要一个轻量消息层。
- 请求-响应服务，想要动态扩缩容和 no responders 快速反馈。
- 中小规模可靠任务队列，愿意用 JetStream 管 ack、重放和保留。

**不适用**：

- 需要多年级别审计日志和超大吞吐离线分析，优先看 [[kafka]] 这类日志平台。
- 业务强依赖复杂 schema registry、SQL 查询或二级索引，NATS 不负责这些。
- 单机内存队列就够的后台任务，[[asynq]] 或 [[celery]] 可能更贴近业务框架。
- 只需要点对点同步调用且调用链很短，普通 HTTP 或 [[grpc-go]] 更直接。

## 历史小故事（可跳过）

- **2010 年前后**：NATS 从云平台控制平面的消息需求里长出来，目标是简单、快、可嵌入云原生系统。
- **2018 年**：NATS 被 CNCF 接纳为 Incubating 项目；公开 CNCF 项目页目前仍标注这个成熟度，别只凭二手资料写成“毕业”。
- **2019 年**：NATS 2.0 强化多租户、账户和安全模型，让一套集群能服务多个隔离团队。
- **2020 年后**：JetStream 成为内置持久化层，NATS 从“极快总线”扩展到“能存、能重放、能确认”的消息系统。
- **今天**：nats-server 仍保持单二进制和 Go 实现，价值在于用较少概念覆盖 pub/sub、request-reply、queue 和 stream。

## 学到什么

- **轻量不是功能少，而是默认路径短**：Core NATS 先把“在线消息转发”做到直接，需要可靠性时再显式打开 JetStream。
- **subject 是设计核心**：命名好，消费者可以用通配符自然扩展；命名乱，后面所有订阅者一起还债。
- **消息系统也有层次**：广播、请求-响应、队列、持久流不是四套东西，在 NATS 里都围绕 publish/subscribe 组合出来。
- **可靠性要付成本**：ack、落盘、副本、fsync 都会增加延迟和运维成本，应该按消息价值选择。

## 延伸阅读

- 官方仓库：[nats-io/nats-server](https://github.com/nats-io/nats-server)
- 官方概览：[NATS Concepts Overview](https://docs.nats.io/nats-concepts/overview)
- Subject 文档：[Subject-Based Messaging](https://docs.nats.io/nats-concepts/subjects)
- JetStream 文档：[JetStream](https://docs.nats.io/nats-concepts/jetstream)
- 可运行示例：[NATS by Example](https://natsbyexample.com/)
- [[kafka]] —— 对比“长日志平台”和“轻量消息总线”的边界。

## 关联

- [[kafka]] —— 同样处理事件流，但更偏大吞吐、长保留和分区日志。
- [[redis]] —— Redis Pub/Sub 也轻量，但 NATS 的 subject、队列组和 JetStream 更像完整消息层。
- [[etcd]] —— 都会碰到一致性和 Raft，但 etcd 是配置 KV，JetStream 是消息存储。
- [[grpc-go]] —— request-reply 能覆盖一部分 RPC 场景，但抽象和调用方式不同。
- [[asynq]] —— 后台任务队列，适合 Redis + Go 应用；NATS JetStream 更跨语言。
- [[dendrite]] —— Matrix 服务端组件间曾用 NATS JetStream 做事件传递，可作为真实系统参照。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
