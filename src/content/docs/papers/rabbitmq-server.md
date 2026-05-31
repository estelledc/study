---
title: RabbitMQ — 用 Erlang 写的多协议消息总线
来源: https://github.com/rabbitmq/rabbitmq-server （MPL 2.0）
日期: 2026-06-01
分类: 基础设施
难度: 中级
---

## 是什么

RabbitMQ 是一个**消息中间件**——你可以把它想成**邮局**：发件人（生产者）把信件（消息）扔进邮局，收件人（消费者）按自己节奏来取。发件人不用等收件人在不在线，邮局会先存着。

它的特殊之处：

- 用 **Erlang** 写的，跑在 BEAM 虚拟机上，天生擅长"上万个轻量进程同时跑"
- 一份服务器同时讲 **AMQP 0-9-1 / MQTT / STOMP / AMQP 1.0** 几种"邮政语言"
- 装插件就能扩协议、扩管理界面，核心保持小

## 为什么重要

不理解 RabbitMQ，下面这些事都没法解释：

- 为什么微服务之间不直接 HTTP 调用，要中间塞一个队列
- 为什么 Celery / OpenStack / 早期 Instagram 都默认用它
- 为什么"消息中间件"市场后来被 Kafka 抢一半，但 Rabbit 在"任务派发"场景仍然活得很好
- 为什么 Erlang 这种 1986 年的电信语言能扛住现代云原生压力

## 核心要点

RabbitMQ 的消息流走 **五件套**：

1. **Producer**（生产者）：发消息的人
2. **Exchange**（交换机）：消息先到这里，由它决定路由到哪
3. **Binding**（绑定规则）：告诉 Exchange "符合这个规则的消息送到那个队列"
4. **Queue**（队列）：消息排队等消费
5. **Consumer**（消费者）：从队列拉消息处理

类比：你寄一封信，邮局**先看地址**（Exchange + Binding），把它分到不同邮箱（Queue），收件人开邮箱取（Consumer）。

Exchange 有四种"分拣方式"：

- `direct`：精确匹配 routing key
- `fanout`：广播给所有绑定的队列
- `topic`：用 `*.error.*` 这种通配符匹配
- `headers`：按消息头字段匹配（少用）

## 实践案例

### 案例 1：发任务、取任务

Python（用 `pika` 客户端）：

```python
import pika
conn = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
ch = conn.channel()
ch.queue_declare(queue='hello')
ch.basic_publish(exchange='', routing_key='hello', body='Hello World!')
```

消费者：

```python
def callback(ch, method, properties, body):
    print(f"收到 {body}")
    ch.basic_ack(delivery_tag=method.delivery_tag)  # 确认才会从队列删

ch.basic_consume(queue='hello', on_message_callback=callback)
ch.start_consuming()
```

**关键**：`basic_ack` 是消费者说"我处理完了"。没 ack 的消息 RabbitMQ 会**重投**给别人——这是它"任务不丢"的核心机制。

### 案例 2：限流（Prefetch / QoS）

```python
ch.basic_qos(prefetch_count=10)
```

意思："我一次最多处理 10 条，没 ack 完别再发给我。" 没这一行，RabbitMQ 会一口气把队列里 10 万条全推过来打爆 worker。

### 案例 3：高可用（Quorum Queue）

```bash
rabbitmqctl set_policy ha "^orders\." \
  '{"queue-type":"quorum"}' --apply-to queues
```

让所有 `orders.*` 队列变成 **Quorum Queue**——基于 Raft 协议在 3 节点上复制，挂一台还能跑。这是 2019 年后官方推荐方案，老的"镜像队列"被废弃。

## 踩过的坑

1. **队列默认是单点的**：经典队列只在声明它的那个节点上，节点挂了队列就不可用。生产环境必须用 Quorum Queue。

2. **内存报警阻塞 publisher**：消息堆积时 RabbitMQ 占内存涨，触发 Memory Alarm 后**所有 publisher 被阻塞**。一旦发生，定位难、恢复慢。要监控 `rabbitmq_memory_used` 并设置消息 TTL / 队列长度上限。

3. **AMQP 0-9-1 不是 AMQP 1.0**：名字像，但是两套不兼容的协议。Rabbit 主要讲 0-9-1，1.0 是后加插件。客户端选错了根本连不上。

4. **Erlang cookie 不一致**：集群节点用一个共享密钥（`/var/lib/rabbitmq/.erlang.cookie`）互认。容器化部署时常忘记同步，节点之间静默拒绝连接，错误日志还藏得很深。

5. **跟 Kafka 选错**：Rabbit 是"投递任务"模型——消息消费完就删，强 routing；Kafka 是"持久日志"模型——消息留 7 天，消费者自管 offset。日志/事件流场景 Rabbit 撑不住吞吐，要换 Kafka。

## 适用 vs 不适用

**适用**：

- 微服务之间的 RPC 异步化（Celery / Sidekiq 默认 broker）
- 任务队列（图片处理、邮件发送、报表生成）
- 复杂路由场景（按 routing key 分发到不同 worker）
- 协议多样的物联网网关（一台机器同时收 MQTT 和 AMQP）

**不适用**：

- 高吞吐持久日志（百万级 msg/s）→ 用 Kafka
- 严格顺序消费的事件流 → 用 Kafka / Pulsar
- 不需要中间层的简单同步调用 → 直接 HTTP / gRPC
- 极低延迟（< 1ms）→ 用 Redis Streams 或 ZeroMQ

## 设计选择背后

为什么用 **Erlang**？

- BEAM 虚拟机一台机器跑十万级轻量进程毫无压力，正好对应"每个连接一个进程"的模型
- OTP 的"监督树"让进程崩溃后自动重启，节点级容错天然支持
- 热升级（不停机换代码）是电信级特性，Rabbit 跑十年不重启也能更新

为什么有这么多 Exchange 类型？

- AMQP 协议把"路由策略"从应用代码搬到了 broker 配置里。同一份生产者代码，运维改 binding 就能改整个消息流向——这是 Kafka 没有的灵活度。

## 历史小故事（可跳过）

- **2003**：JPMorgan 苦于厂商锁定（IBM MQ / TIBCO 各家协议互不通），牵头制定 **AMQP** 开放协议
- **2006**：iMatix / Red Hat / Cisco 加入，AMQP 0-8 草案出炉
- **2007**：Rabbit Technologies 发布 RabbitMQ 1.0，是 AMQP 第一个生产级实现
- **2010**：VMware 收购，进入企业市场
- **2013**：Pivotal 拆出，开源社区扩张
- **2019**：VMware 收回 Pivotal
- **2023**：Broadcom 收购 VMware；Khepri（Raft 元数据存储）开始替代 Mnesia

## 学到什么

1. **中间件不是代码层抽象，是运维边界**——把"谁先挂"的问题从应用搬到一个专门的组件上
2. **协议选择决定生态**：选了 AMQP 就吃下了它的概念体系（Exchange/Binding），换不掉
3. **Erlang 不是冷门**：所有需要"百万连接 + 容错"的场景（WhatsApp / Discord / RabbitMQ）都在用
4. **Quorum Queue 替代 Mirror Queue 用了 5 年**：基础设施换底层共识算法是慢工

## 延伸阅读

- 官方教程（6 个场景，从 Hello World 到 RPC）：[rabbitmq.com/getstarted](https://www.rabbitmq.com/getstarted.html)
- Quorum Queue 内幕：[Raft 在 RabbitMQ 中的实现](https://www.rabbitmq.com/quorum-queues.html)
- 性能调优：[Cloudamqp Best Practices](https://www.cloudamqp.com/blog/part1-rabbitmq-best-practice.html)

## 关联

- [[erlang-otp]] —— RabbitMQ 跑在 OTP 之上，监督树/进程模型直接复用
- [[kafka-2011]] —— 同代竞品，定位"持久日志" vs Rabbit 的"任务派发"
- [[milner-pi-calculus]] —— 通道传递消息的理论祖宗，BEAM 进程模型受其启发
