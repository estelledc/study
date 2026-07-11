---
title: Apache Kafka — 分布式流处理平台
来源: https://github.com/apache/kafka
日期: 2026-05-29
分类: 数据库 / 消息队列
难度: 中级
---

## 是什么

Kafka 是一个**持久化日志 + 发布订阅**系统，2010 年 LinkedIn 开发并在 2011 年开源给 Apache 基金会。一个集群每秒能处理百万条消息，被 LinkedIn、Uber、Netflix、Twitter 等大型实时数据系统当成数据管道的中枢。

日常类比：**就像超市的传送带**——商家（producer）把商品放到传送带上，多个收银员（consumer）按顺序从传送带上取货。传送带自己记录每件商品的位置（offset），收银员只要告诉传送带"我取到了第 42 号商品"，下次就能从第 43 号继续取。

你写一个最简单的发消息：

```bash
bin/kafka-console-producer --topic events --bootstrap-server localhost:9092
> hello kafka
```

另一个进程订阅同一个 topic：

```bash
bin/kafka-console-consumer --topic events --from-beginning --bootstrap-server localhost:9092
hello kafka
```

发送方不需要知道接收方在哪、是谁、什么时候来——这就是发布订阅最基础的解耦能力。

## 为什么重要

不理解 Kafka 的设计哲学，下面这些事都没法解释：

- 为什么 LinkedIn / Uber / Netflix / Twitter 这种"每秒百万事件"的公司，数据管道几乎都是 Kafka
- 为什么 Kafka Streams + ksqlDB 让流处理可以写得像查询——过滤、聚合直接跑在事件流上
- 为什么 Kafka Connect 生态有大量现成连接器（MySQL / Elasticsearch / S3 等），让"进出管道"少写胶水代码
- 为什么在**高吞吐日志型管道**场景里，Kafka 比传统 broker 型队列（RabbitMQ / ActiveMQ）更常被选作中枢

简单说：**这是过去 10 年实时数据基础设施的核心开源项目之一**，尤其擅长"先落盘再多人消费"的管道。

## 核心要点

Kafka 的核心模型可以拆成 **三层**：

1. **Topic + Partition**：一个 topic 是一类消息的分类（如 `user-clicks`、`order-events`）。一个 topic 切成多个 partition，每个 partition 是一个独立的有序日志，可以并行写入和读取——这是 Kafka 横向扩展的根本。

2. **Producer + Consumer Group**：producer 把消息发到 topic，Kafka 决定写入哪个 partition（按 key hash 或轮询）。consumer 订阅 topic 时加入一个 consumer group，**同 group 内的 consumer 自动分摊 partition**——4 个 partition、2 个 consumer，每人吃 2 个；3 个 consumer，每人 1-2 个。

3. **Offset + 持久化**：每条消息在 partition 内有一个递增编号叫 offset。Kafka 把消息持久化到磁盘（默认保留 7 天），consumer 自己记录"我消费到 offset 多少了"。所以消费者**挂了重启也能从断点继续**，不会丢消息。

简单说：**topic 是邮筒，partition 是邮筒里的并行格子，consumer group 是分工取信的一组邮差，offset 是邮差的进度书签**。

## 实践案例

### 案例 1：Docker 起一个单节点 KRaft Kafka

最快上手可用 Bitnami / Apache 官方 quickstart；下面是一份**最小可跑**的单节点 KRaft 示意（生产请用官方文档补全安全与磁盘配置）：

```yaml
# docker-compose.yml（示意：单 broker + controller 合部署）
services:
  kafka:
    image: apache/kafka:3.7.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
```

```bash
docker compose up -d
# 再用容器内 kafka-topics / console-producer 验证连通
```

注意：这里没有 ZooKeeper——**3.3+** 可用 KRaft（broker 自管元数据）；**新集群应优先 KRaft**。

### 案例 2：发消息和收消息

```bash
# 创建 topic（3 个 partition = 最多 3 个同组 consumer 并行）
bin/kafka-topics.sh --create --topic events --partitions 3 \
  --bootstrap-server localhost:9092

# 发消息
bin/kafka-console-producer.sh --topic events --bootstrap-server localhost:9092
> {"user": "alice", "action": "click"}

# 收消息（从头回放）
bin/kafka-console-consumer.sh --topic events --from-beginning \
  --bootstrap-server localhost:9092
```

`--from-beginning` 是杀手锏：消息已落盘，新 consumer 仍可从最早 offset 重放。

### 案例 3：Consumer Group 的水平扩展

两个终端都用 group `analytics`：

```bash
# 终端 1
bin/kafka-console-consumer.sh --topic events --group analytics \
  --bootstrap-server localhost:9092

# 终端 2
bin/kafka-console-consumer.sh --topic events --group analytics \
  --bootstrap-server localhost:9092
```

Kafka 把 3 个 partition 分给两个 consumer（一人 2、一人 1）。再加第三个，正好一人一个。**同 group 分摊 partition = 流处理水平扩展的基本实现。**

## 踩过的坑

1. **Partition 数预估错**：partition 数是 topic 创建时定的，**事后只能加不能减**。设少了无法横向扩 consumer（consumer 数 ≤ partition 数）；设多了 broker 元数据爆炸（每个 partition 占内存和文件句柄）。经验值：每 broker 不超过 2000-4000 partition。

2. **Consumer Rebalancing 期间消息处理停顿**：consumer 加入或退出 group 时会触发 rebalance，所有 consumer 暂停消费几秒到几十秒。Kafka 2.4 引入 `cooperative-sticky` 分配策略缓解了这个问题——只重分配必要的 partition，不全量打散。

3. **Exactly-once 语义复杂**：默认是 at-least-once（可能重复）。要做到 exactly-once 必须开启 idempotent producer + transactional consumer，配置一堆参数（`enable.idempotence`、`transactional.id`、`isolation.level=read_committed`），且只在 Kafka 内部端到端有效——出了 Kafka 还是要业务层去重。

4. **监控指标多到爆炸**：consumer lag（落后多少消息）/ throughput（吞吐）/ disk usage / GC 时间 / network IO ——任何一个炸了集群都可能挂。生产环境必须上 Confluent Control Center 或 LinkedIn 开源的 Burrow，光看 broker 自己的 JMX 不够。

## 适用 vs 不适用场景

**适用**：
- 大型实时数据管道（用户行为、日志聚合、CDC 数据库变更捕获）
- 微服务间事件驱动架构（订单事件 → 库存 + 物流 + 通知 多个下游）
- 流处理（Kafka Streams / Flink / Spark Streaming 的输入源）
- 需要消息持久化和回放的场景（消息保留 N 天，新业务上线可以从头消费）

**不适用**：
- 低延迟点对点通信（毫秒级 RPC 用 gRPC 更合适）
- 小规模消息队列（几千 QPS 用 RabbitMQ / Redis Stream 更轻）
- 严格 FIFO 跨多 partition（Kafka 只保证单 partition 内有序）
- 复杂路由规则（topic exchange、header routing 这种用 RabbitMQ）

## 历史小故事（可跳过）

- **2010 年**：LinkedIn 工程师 Jay Kreps 主导开发，名字来源于作家 Franz Kafka——"我喜欢一个写作系统命名的项目，所以叫了 Kafka"。
- **2011 年**：开源给 Apache 基金会，进入孵化器。
- **2014 年**：Jay Kreps 等核心团队从 LinkedIn 离职创立 Confluent，主导 Kafka 商业化。
- **2017 年**：Kafka Streams 发布，第一个内嵌在 Kafka 里的流处理库（不需要 Spark/Flink）。
- **2020 年**：KIP-500 推进移除 ZooKeeper 依赖（KRaft 自管元数据）。
- **2023–2024**：KRaft 生产可用（约 3.3+）；**3.5 起 ZooKeeper 模式标记 deprecated**；3.7 仍可跑 ZK 但新集群应选 KRaft；**Kafka 4.0 移除 ZK**。Tiered Storage 等让冷数据可下沉对象存储。

15 年从 LinkedIn 内部工具到全球数据管道标配。

## 学到什么

1. **持久化日志是个好抽象**——把"消息队列"和"分布式日志"统一了，副作用变成事实记录
2. **Partition + Consumer Group 是横向扩展的范式**——任何流处理系统都在重新发明这个模型
3. **零拷贝 + 顺序写磁盘**——Kafka 性能秘诀不是内存而是**顺序 IO 比随机内存还快**
4. **生态比单点功能重要**——Kafka Connect 的大量连接器让它常成为"系统之间的胶水层"

## 延伸阅读

- 官方文档：[Apache Kafka Documentation](https://kafka.apache.org/documentation/)（先看 "Introduction" 和 "Quick Start"）
- 经典文章：[The Log: What every software engineer should know](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)（Jay Kreps，设计哲学必读）
- 视频：[Confluent Developer — Apache Kafka 101](https://developer.confluent.io/courses/apache-kafka/events/)（短视频从零上手）
- 实战书：[Kafka: The Definitive Guide, 2nd Edition](https://www.confluent.io/resources/kafka-the-definitive-guide-v2/)（O'Reilly / Confluent）
- [[redis]] —— Redis Stream 是更轻的日志型队列，理解差异有助于选型
- [[flink]] —— 常以 Kafka 为输入源的流计算引擎

## 关联

- [[redis]] —— list / pub-sub / stream 也能做队列，但持久化与跨机扩展通常弱于 Kafka
- [[flink]] —— 有状态流计算，生产里常订阅 Kafka topic
- [[spark]] —— Spark Structured Streaming 常见数据源之一是 Kafka
- [[rabbitmq]] —— 传统 broker 型消息队列，路由灵活，高吞吐日志管道场景常让位 Kafka
- [[pulsar]] —— 另一套云原生日志/消息系统，常与 Kafka 对照选型
- [[zookeeper]] —— 旧版 Kafka 元数据依赖；KRaft 后新集群不再需要

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
