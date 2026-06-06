---
title: RabbitMQ — 用 Erlang 写的多协议消息总线
来源: https://github.com/rabbitmq/rabbitmq-server
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

RabbitMQ 是一个**消息中间件**——生产者把消息丢进去，消费者按自己速度取出来，中间有缓冲。2007 年由 Rabbit Technologies 用 Erlang/OTP 实现，原生支持 AMQP 0-9-1 协议，后来通过插件支持 MQTT、STOMP、AMQP 1.0、HTTP API、WebSocket。

日常类比：**就像快递柜**——快递员（生产者）把包裹塞进柜子的某个格子（队列），收件人（消费者）有空时来取。快递员不必等收件人到、收件人也不必盯着门口。柜子还能按快递公司、目的地分流（exchange routing）。

最小例子（Python pika）：

```python
import pika
conn = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = conn.channel()
ch.queue_declare(queue="hello")
ch.basic_publish(exchange="", routing_key="hello", body="world")
```

消费方另起一个进程订阅 `hello` 队列就能收到 `world`。生产消费两端互相不认识，靠 RabbitMQ 撮合。

## 为什么重要

不理解 RabbitMQ，下面这些事都讲不通：

- 为什么 OpenStack 内部组件（Nova、Neutron）默认靠 RabbitMQ 通信而不是 HTTP 直连
- 为什么 Celery（Python 最常用的任务队列）默认 broker 是 RabbitMQ
- 为什么 Instagram、Reddit、Mozilla 早期都拿它做消息总线
- 为什么"消息队列"和"流处理"两类系统看起来像但工程取舍完全不同

简单说：**它是把"应用解耦 + 流量削峰 + 异步任务"三件事打包进一个中间件**，2010 年代后端架构里几乎绕不过的一块基础设施。

## 核心要点

RabbitMQ 的消息流转模型是 **五件套**：

1. **Producer（生产者）**：发送消息的进程，不直接连队列，只把消息丢给 exchange。

2. **Exchange（交换机）+ Binding（绑定）**：路由器。常见类型：`direct`（按 routing key 精确匹配）、`fanout`（广播给所有绑定队列）、`topic`（按 routing key 模式匹配，如 `order.*.cn`）、`headers`（按消息头匹配）。binding 是 exchange 和队列之间的连线。

3. **Queue（队列）**：消息真正存放的地方。三种实现：Classic（默认，单节点）、Quorum（基于 Raft，三副本强一致）、Stream（仿 Kafka 的 append-only 日志）。

4. **Consumer（消费者）**：订阅队列拉消息。处理完发 `ack` 才算消费成功，没 ack 重启会被重投。可以设 `prefetch` 限制单消费者在途消息数，防止快消费者抢光。

5. **运行时**：跑在 Erlang BEAM 虚拟机上，每个连接、每个队列都是一个轻量级进程（Erlang process，不是 OS 线程），靠监督树（supervision tree）做故障恢复——一个队列进程崩了不影响别的。

集群层面：3-5 节点用 Erlang Distribution 心跳互联，元数据用 Mnesia（旧）或 Khepri（新，基于 Raft）共享。

## 实践案例

### 案例 1：异步发邮件

注册成功后给用户发欢迎邮件——HTTP 同步调邮件服务的话，邮件服务挂了用户注册接口也挂。改成：

```python
ch.queue_declare(queue="email", durable=True)
ch.basic_publish(exchange="", routing_key="email",
                 body=json.dumps({"to": "u@x.com", "tpl": "welcome"}),
                 properties=pika.BasicProperties(delivery_mode=2))
```

注册接口立即返回，邮件服务慢慢消费 `email` 队列。`durable=True` + `delivery_mode=2` 让消息落盘，RabbitMQ 重启不丢。

### 案例 2：topic exchange 做事件分发

订单系统发出 `order.created.cn`、`order.paid.us` 这样的事件：

```
exchange: orders (type=topic)
queue audit       binding: order.#       （收所有订单事件）
queue cn-billing  binding: order.*.cn    （只收中国地区）
```

发一条 `order.paid.cn`，audit 和 cn-billing 都能收到。新增一个"美国地区结算"消费者只要绑 `order.*.us` 即可，不动生产者。

### 案例 3：Quorum Queue 防节点挂

Classic Queue 默认只在一个节点上，节点挂了队列不可用。Quorum Queue 用 Raft 在 3 个节点保留三副本：

```python
ch.queue_declare(queue="payments",
                 arguments={"x-queue-type": "quorum"})
```

挂一个节点其他两个继续服务，付款消息不丢。代价是写吞吐比 Classic 低，因为每条消息要过 Raft 共识。

## 踩过的坑

1. **队列默认不复制**：Classic Queue 只在声明它的那个节点。节点挂了队列就消失（消息也可能丢）。生产环境关键队列必须用 Quorum 或 Stream。

2. **Memory Alarm 阻塞 publisher**：消息堆积导致 Erlang 进程内存超阈值（默认 40%），RabbitMQ 直接 block 所有发送方。表现是生产者 publish 卡住没报错。要监控 `rabbitmq-diagnostics memory_breakdown` 和队列深度。

3. **AMQP 0-9-1 跟 AMQP 1.0 是两套协议**：名字像但报文格式、概念都不一样。0-9-1 才是 RabbitMQ 的原生协议，1.0 走插件。客户端选错版本连不上。

4. **Erlang cookie 不一致集群组不起来**：节点间认证靠 `~/.erlang.cookie`，三台机器上 cookie 文件内容不同就互相拒绝，错误信息又含糊。第一次搭集群必踩。

5. **没设 prefetch 导致一个消费者吃光**：默认 consumer 一次能预取无限条。慢消费者把全部消息抢走再卡住，其他空闲消费者啥也拿不到。`basic_qos(prefetch_count=10)` 是必设。

## 适用 vs 不适用场景

**适用**：

- 异步任务队列（Celery / Sidekiq / 自研 worker pool）
- 微服务事件总线，强 routing 需求（topic exchange）
- 多协议混合接入（IoT 走 MQTT、Web 走 STOMP、后端走 AMQP）
- 中等吞吐（单集群 10w-100w msg/s）+ 低延迟（毫秒级）

**不适用**：

- 超高吞吐流处理 / 数据管道 → 用 Kafka（百万 msg/s + 长保留 + 消费者自管 offset）
- 消息要长期回放（按时间回到一周前）→ Stream 类型勉强行，但生态不如 Kafka
- 进程内队列 / 单机够用 → 直接 Redis List 或内存 channel，省得装 RabbitMQ
- 团队没 Erlang 经验且部署规模很小 → 调试集群问题成本高

## 历史小故事

- **2006**：JPMorgan 牵头联合 iMatix 等搞 AMQP 协议草案，目标"金融行业开放消息标准"
- **2007**：Rabbit Technologies 发布 RabbitMQ 1.0，选 Erlang 是看中 BEAM 天生擅长高并发 + 容错
- **2010**：VMware 收购 Rabbit Technologies
- **2013**：VMware 把 RabbitMQ 拆给 Pivotal
- **2019**：Pivotal 又被 VMware 收回
- **2023**：Broadcom 收购 VMware，RabbitMQ 归 Broadcom

中间几次易主，社区版本一直保持开源（MPL 2.0）。

## 学到什么

1. **消息队列不是"快递柜"那么简单**：解耦、削峰、重试、ack、路由、持久化、集群一致性，每一个都是工程取舍
2. **Erlang/OTP 的"轻量进程 + 监督树"**让 RabbitMQ 单节点能开几十万并发连接，且某个连接崩了影响隔离
3. **AMQP 的 exchange/binding 模型比 Kafka 的 topic/partition 表达力强**：topic exchange 能做正则匹配的扇出，Kafka 做不到——但 Kafka 吞吐高一个量级
4. **基础设施迁主四次还能稳定运行**：好的开源项目活得比公司久

## 延伸阅读

- 官方教程：[RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)（6 个 hello world 覆盖核心模式）
- 协议规范：[AMQP 0-9-1 Reference](https://www.rabbitmq.com/amqp-0-9-1-reference.html)
- Quorum Queue 设计：[RabbitMQ blog — Quorum Queues internals](https://blog.rabbitmq.com/posts/2020/04/quorum-queues-and-why-disks-matter)
- [[kafka]] —— 高吞吐流处理对照
- [[erlang-otp]] —— RabbitMQ 的运行时基础

## 关联

- [[kafka]] —— 同样做消息总线但工程取舍相反：吞吐 vs 路由表达力
- [[erlang-otp]] —— 提供 BEAM 运行时和监督树
- [[redis]] —— Redis Streams / List 是轻量级替代
- [[celery]] —— Python 任务队列默认 broker 就是 RabbitMQ

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[emqx]] —— EMQX — 单集群千万连接的 MQTT 物联网消息总线
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[nats-server]] —— NATS Server — 极简云原生消息中间件
- [[nsq]] —— NSQ — Go 写的去中心化消息队列
- [[redis]] —— Redis — 内存键值数据库

