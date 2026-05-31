---
title: Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
来源: 'Kreps, Narkhede, Rao. "Kafka: a Distributed Messaging System for Log Processing", NetDB 2011'
日期: 2026-05-30
分类: databases / 分布式系统
难度: 中级
---

## 是什么

这篇 6 页论文（NetDB 2011）做了件**反直觉**的事：把消息系统的所有"聪明"统统砍掉，只剩下一个会顺序追加文件的进程。日常类比：传统消息中间件像**邮局柜员**——给每个包裹贴单号、记签收、催领——很慢；论文里的 Kafka 像**滚动播报机**——只往后接纸带，订阅者自己记"我看到第几页了"。

最小心智模型：

```
producer → broker（一串 segment 文件，只追加）→ consumer（自己记 offset）
```

LinkedIn 当时面临的现实：每天数百 GB 活动日志（点击、搜索、广告曝光），既要给 Hadoop 离线推荐用，又要给在线 dashboard 用。ActiveMQ 单机几万 msg/s 就崩，Scribe 不能 replay。三位作者干脆造一个"broker 只懂顺序写"的新系统。

## 为什么重要

不读这 6 页，下面这些事都没法解释：

- 为什么 2014 年后 event sourcing / CDC / stream-table join 突然遍地开花——它们都建立在"日志即真值"这个假设上
- 为什么 Pulsar / Redpanda / WarpStream 都自称"Kafka 协议兼容"——produce/fetch 接口 12 年没变，成了事实标准
- 为什么 Flink / Spark Streaming 普遍把 Kafka 当输入源——Kafka 提供的"可重放、按 partition 顺序"正是流处理需要的契约
- 为什么这篇论文本身没讲 replication / exactly-once，但你今天用的 Kafka 都有——论文 §6 老老实实写"replication is future work"

## 核心要点

论文把传统 broker 的复杂度拆成 **3 个反转**：

1. **broker 重写成只追加文件**：传统系统把每条消息当独立可 ack/delete/TTL 的实体，broker 维护 per-message 状态。Kafka 反过来——partition 是一组顺序 segment 文件（如 `00000000.log`），写入是 O(1) 的 append，永不修改、永不单删。**类比**：传统是 1 万张索引卡的档案柜（每张记一条消息），Kafka 是只能贴纸条的电报纸带。

2. **offset 是 consumer 的状态，不是 broker 的**：传统 broker 必须记"谁读到哪、谁 ack 了"——这是 broker 复杂度根源。Kafka 把 offset 还给客户端，broker 只暴露 `fetch(topic, partition, offset, max_bytes)` 一个接口。**broker 因此对"谁读了什么"完全无知**——所以才能轻、才能快、才能多消费者扇出。

3. **page cache + sendfile 做零拷贝扇出**：Kafka 不维护应用层缓存，把"缓存什么"完全交给 Linux page cache。读时 broker 用 `sendfile(2)` 把内核 page cache 直接 DMA 到 socket——**不进用户态、不复制、不重新序列化**。多个 consumer 订阅同一 topic 只需要一份内存。

砍掉 per-message 状态 + 砍掉 broker 缓存层 = 单 broker 吞吐比 ActiveMQ 高一个数量级。

## 实践案例

### 案例 1：活动日志双消费（论文原始动机）

LinkedIn 的真实需求：埋点服务发 `page_view`，离线推荐和在线 dashboard 都要消费同一份数据。

```python
# 生产端：埋点服务发消息
producer.send("page_view", key=user_id, value={
    "url": "/feed", "ts": 1716868800
})

# 消费端 1：dashboard 实时报表（5 秒读一次，紧跟尾部）
consumer.subscribe(["page_view"], group_id="dashboard")

# 消费端 2：Hadoop ETL（每天凌晨从 offset=0 重读 24 小时窗口）
consumer.subscribe(["page_view"], group_id="etl_hadoop")
```

两个 group 各自持独立 offset，互不影响——broker 只存一份数据，被读 N 次。**这就是论文 Figure 2 画的扇出模型**。

### 案例 2：CDC（数据库变更同步）

把 MySQL/Postgres 的 binlog 写进 Kafka，下游想消费就消费：

```yaml
# Debezium connector：MySQL binlog → Kafka 事件
source: mysql
topic: orders.public.users
key: user_id
```

这是当前几乎所有"DB → 数仓 / Elasticsearch / Redis"链路的标配——一份 binlog，N 个下游各自重放。Kafka 默认 7 天 retention 让"重放历史"成为日常操作而不是灾难恢复。

### 案例 3：扇出广播

一条订单事件被三个下游各自消费：

```
order_created (offset=42)
   ├─→ group "alert"  实时告警，offset 跟尾部
   ├─→ group "etl"    每小时入仓，offset=30 落后
   └─→ group "audit"  审计回放，offset=0 从头读
```

broker 只存一份 partition 文件，三个 group 各自读。**这是 Kafka 与传统 fan-out 的根本差别**——传统 broker 给每个订阅者维护游标，扇出成本随订阅数线性增长；Kafka 扇出成本恒定（多几次 sendfile 而已）。

## 踩过的坑

1. **不要把 Kafka 当 RPC**：它是单向 produce → fetch 模型，强行做 `reply_to` 可以但延迟高、运维丑。请求-响应该用 gRPC / HTTP。

2. **不要把 Kafka 当数据库**：compacted topic 看着像 KV store，但按 key 查是 O(n) 顺序扫，替代不了 Redis / RocksDB。compaction 只为"留最新快照"，不为查询。

3. **不要让 broker 跑业务逻辑**：Kafka Streams / ksqlDB 在客户端 JVM 跑，broker 永远只做存储 + 路由。Pulsar 反向把 Function 跑在 broker 上——这是哲学差异，跨派别套用会遇到性能黑洞。

4. **不要按 producer 时间戳精确查询**：producer 写入时间戳、broker 不校验，多生产者时钟漂移会让 `offsetsForTimes(ts)` 失真。时间精度高的场景请用业务自定义 ID 或 TrueTime 派系统。

## 适用 vs 不适用场景

**适用**：

- 大批量事件流 / event sourcing / CDC pipeline（Connect / Streams / Schema Registry 生态完整）
- 需要多消费者各自独立游标 + 可重放（log 派结构性优势）
- 吞吐 > 10 MB/s 的场景（page cache + sendfile + batch 三件套发力）
- 跨数据中心异步复制（MirrorMaker / Replicator）

**不适用**：

- 请求-响应 RPC（用 gRPC / HTTP）
- 高频小消息 < 1 ms 低延迟（用 Redis Streams / NATS）
- 需要 per-message TTL / routing key / job queue 语义（用 RabbitMQ / SQS——queue 派护城河）
- 单机简单 pub-sub（杀鸡用牛刀，Redis pub-sub 即可）

## 历史小故事（可跳过）

- **2010 年**：LinkedIn 内部 ActiveMQ 扛不住活动流；Scribe 不支持 replay 也无法低延迟订阅——既存方案两条路都堵死。
- **2011 年**：Kreps、Narkhede、Rao 在 NetDB workshop 发表 6 页论文，把 broker 重写成 file。论文 §6 写"replication is future work"。
- **2013 年**：Kafka 0.8 引入 ISR + high watermark + leader election——这才是今天 90% 文档讨论的核心，但论文里没有。
- **2014 年**：三人离职创立 Confluent，把 Kafka 推成商业基础设施。
- **2019-2024 年**：KIP-500 用 KRaft（内嵌 Raft）取代 ZooKeeper；4.0 默认 KRaft，ZK 模式 deprecated。

## 学到什么

1. **把"复杂的中间件"重写成"笨的文件追加器"是降维打击**——所有 per-message 状态消失后，吞吐自然涨一个数量级
2. **协议不变 + 实现迭代**——论文 6 页定哲学，KIP 系列（1 / 32 / 98 / 101 / 405 / 500）补 90% 实现，但 produce/fetch 接口 12 年没变
3. **生态护城河 > 协议优势**——Pulsar / Redpanda 在协议或性能上更优，但 Connect / Debezium / Flink-Kafka 生态厚到无法替代
4. **诚实承认 at-least-once**——论文不夸大，exactly-once 必须靠下游幂等。这种诚实反而比某些后续宣传更可信

## 延伸阅读

- 论文 PDF：[Kafka NetDB 2011 — 6 页](https://notes.stephenholiday.com/Kafka.pdf)
- 工程长文：[The Log: What every software engineer should know — Jay Kreps 2013](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)（论文哲学的展开版，必读）
- KIP 必读集：KIP-1（replication）/ KIP-32（timestamp）/ KIP-98（exactly-once）/ KIP-101（leader epoch）/ KIP-500（KRaft）/ KIP-405（tiered storage）
- 视频：[Confluent — Apache Kafka 101](https://developer.confluent.io/learn-kafka/apache-kafka/events/)（10 集，从 producer 到 streams）
- [[dstreams-2013]] —— Spark Streaming 的微批模型，Kafka 的天然下游
- [[flink-2015]] —— 流处理引擎，把 Kafka 的"按 partition 顺序"契约转成 exactly-once

## 关联

- [[bigtable-2006]] —— SSTable 的 append-only + compaction 思想与 Kafka segment 一脉相承
- [[gfs]] —— Kafka 的 page cache + sendfile 借用 GFS 同款"信任 OS、信任顺序写"假设
- [[chubby]] —— Kafka 早期用 ZooKeeper 做协调，ZK 是 Chubby 的开源版
- [[zab-2011]] —— ZooKeeper 的共识协议；Kafka 控制面前 10 年都靠它
- [[raft]] —— KRaft（KIP-500）用 Raft 取代 ZooKeeper，把控制面合并进 broker
- [[paxos-1998]] —— Raft 的前辈；理解 Paxos 才能看懂为什么 Kafka 选了 Raft
- [[aurora]] —— "日志即数据库"派代表，与 Kafka "日志即数据骨干"同根

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[chandy-lamport-1985]] —— Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[dstreams-2013]] —— D-Streams — 把流处理伪装成一串很小的批
- [[flink-snapshots-2015]] —— Flink 异步快照 — 不停机给流处理拍一致照片
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[helland-2007]] —— Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[rabbitmq-server]] —— RabbitMQ — 用 Erlang 写的多协议消息总线
- [[raft]] —— Raft — 易理解的共识算法
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本

