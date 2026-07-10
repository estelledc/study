---
title: Kafka — 把消息系统降维成只追加的日志文件
来源: 'Kreps, Narkhede, Rao. "Kafka: a Distributed Messaging System for Log Processing", NetDB 2011'
日期: 2026-05-30
分类: databases / 分布式系统
难度: 中级
---

## 是什么

Kafka 是一个**分布式消息系统**：发消息的人（producer）只管追加，存消息的服务器（broker）只管把字节按顺序写进文件，收消息的人（consumer）自己记"上次读到哪"。日常类比：传统消息队列像**图书馆**——管理员要记每本书谁借了、谁还了、谁催过；Kafka 像一份**不断追加的报纸**——它只往后印，订阅者自己记上次读到第几版。

写一段最小的发消息代码：

```bash
echo "user-1::login" | kafka-console-producer --topic events --bootstrap-server localhost:9092
```

这条消息被追加到 `events` topic 的某个 partition 末尾。下游想消费时随时来 `fetch(topic, partition, offset)`，broker 不知道也不关心你是谁、读了几次。

这套"broker 当文件、consumer 持游标"的设计，就是今天每条 CDC pipeline、每个 event sourcing 应用、每次 click 流分发到 100 个下游的共同骨架。

## 为什么重要

不理解 Kafka，下面这些事都没法解释：

- 为什么 LinkedIn 一天数百 GB activity log 不会把 broker 堆爆——传统 ActiveMQ 单机几万 msg/s 就到顶
- 为什么 event sourcing / CDC / stream-table join 在 2014 后突然流行——Kafka 让"日志即真值"成本降到可负担
- 为什么 Pulsar / Redpanda / WarpStream 都自称"Kafka 协议兼容"——协议成了事实标准
- 为什么面试问"Kafka 怎么保证不丢"答案不在 NetDB 2011 论文，而在 KIP-1 / KIP-101——论文 §6 写着 "replication is future work"

## 核心要点

Kafka 的反直觉决定可以拆成 **3 件事**：

1. **broker 重写成只追加的日志文件**：传统 broker 把每条消息当可单独 ack/delete/TTL 的实体，要维护 per-message 状态。Kafka 反过来——broker 上的 partition 就是一组顺序 segment 文件（如 `00000000000000000000.log`），写入是 O(1) 的 append，**不按单条消息原地改/删**（过期按整段 retention 丢掉，compaction 按 key 留最新值）。**类比**：传统 broker 是有 1 万张索引卡的档案柜；Kafka 是一卷只能往末尾贴纸条的电报纸带。

2. **offset 是 consumer 自己的状态**：传统 broker 必须记"谁读到哪、谁 ack 了什么"，这是 broker 复杂度的根源。Kafka 让 consumer 自己持有 offset（游标：上次读到第几条），broker 只暴露 `fetch(topic, partition, offset, max_bytes)` 这一个接口。**broker 因此对"谁读了什么"完全无知**。

3. **page cache + sendfile 做零拷贝扇出**：Kafka 不维护应用层 buffer，把"缓存什么"交给 OS 的 page cache（操作系统帮你记最近读过的磁盘页）。读时用 `sendfile(2)` 把内核页直接 DMA 到网卡——**不进用户态、不复制、不序列化**。多个 consumer 订同一 topic 只需一份内存。

把 broker 从"有状态、复杂、慢"降级成"无状态、简单、快"——这是 Kafka 单 broker 比 ActiveMQ 高一个数量级吞吐的根本原因。

## 实践案例

### 案例 1：用户行为日志 pipeline

LinkedIn 的原始动机：每天数百 GB 的 page view / 搜索 / 广告点击，既要喂离线 Hadoop，也要喂在线报表。下面是**示意伪代码**（真实客户端里 `group_id` 在 Consumer 构造参数里）：

```python
# 示意：生产端埋点
producer.send("page_view", key=user_id, value=b'{"url":"/feed"}')

# 示意：两个独立消费组
dashboard = Consumer(group_id="dashboard")   # 紧跟尾部
etl = Consumer(group_id="etl_hadoop")        # 可从 offset=0 重读
dashboard.subscribe(["page_view"])
etl.subscribe(["page_view"])
```

逐部分解释：

1. **生产**：埋点服务只往 `page_view` 追加，不管谁会读
2. **两个 group**：`dashboard` 与 `etl_hadoop` 各持自己的 offset，互不抢消息
3. **一份存储**：broker 只存一份 partition；被读 N 次成本几乎不变

### 案例 2：CDC（数据库变更同步）

把 MySQL/Postgres 的 binlog（数据库变更流水）写进 Kafka，下游按需消费：

```yaml
# Debezium connector：MySQL binlog → Kafka 事件（示意配置）
source: mysql
topic: orders.public.users
key: user_id
```

逐部分解释：

1. **抓变更**：connector 读数据库 binlog，转成 Kafka 消息
2. **按表分 topic**：例如用户表进 `orders.public.users`
3. **多下游重放**：数仓 / ES / Redis 各开一个 group；默认约 7 天 retention 让"重放历史"变日常

### 案例 3：扇出广播

一条订单事件被三个下游各自消费：

```
order_created (offset=42)
   ├─→ group "alert"  实时告警，offset 跟尾部
   ├─→ group "etl"    每小时入仓，offset=30 落后
   └─→ group "audit"  审计回放，offset=0 从头读
```

逐部分解释：

1. **同一条消息**：offset=42 只在磁盘上存一次
2. **三个游标**：每个 group 自己记读到哪，快的不等慢的
3. **成本恒定**：传统 broker 每多一个订阅者就多一份 cursor 状态；Kafka 只多几次 `sendfile`

## 踩过的坑

1. **不要把 Kafka 当 RPC**：Kafka 是单向的 produce → fetch 模型。强行做 `reply_to` 模式可以但延迟高、运维丑——请求-响应该用 gRPC / HTTP，不要硬塞进 Kafka。

2. **不要把 Kafka 当数据库**：`compacted topic`（保留每个 key 最新值）看着像 KV store，但 read-by-key 是 O(n) 顺序扫描，替代不了 Redis / RocksDB。compaction 只为"留最新快照"，不为查询。

3. **不要让 broker 跑业务逻辑**：Kafka Streams / ksqlDB 在客户端 JVM 跑，broker 永远只做存储 + 路由。Pulsar 的 Function 反过来在 broker 上跑——这是哲学差异，跨派别套用会遇到性能黑洞。

4. **不要按 timestamp 做精确查询**：`offsetsForTimes(ts)` 是稀疏索引近似，且 producer 的时间戳由客户端写入，broker 不校验。多 producer 时钟漂移会让结果失真——KIP-32 没强约束。时间精度要求高 → 业务 ID 或 Spanner / TrueTime 派系统。

## 适用 vs 不适用场景

**适用**：

- 大批量事件流 / event sourcing / CDC pipeline（生态最厚，Connect / Streams / Schema Registry 完整）
- 需要多消费者各自独立游标 + 可重放（log 派结构性优势）
- 吞吐 > 10 MB/s 的场景（page cache + sendfile + batch 三件套真正发力）
- 跨数据中心异步复制（MirrorMaker / Confluent Replicator）

**不适用**：

- 请求-响应 RPC（用 gRPC / HTTP）
- 高频小消息低延迟（< 1ms P99——用 Redis Streams / NATS）
- 需要 per-message TTL / 严格 routing key / job queue 语义（用 RabbitMQ / SQS——这是 queue 派的护城河）
- 单机简单 pub-sub（杀鸡用牛刀，用 Redis pub-sub 即可）

## 历史小故事（可跳过）

- **2010 年**：LinkedIn 内部 activity log 每天数百 GB，ActiveMQ 扛不住吞吐，Scribe 不能 replay 也无法实时——既存方案两条路都堵死。
- **2011 年**：Jay Kreps、Neha Narkhede、Jun Rao 三人在 NetDB workshop 发表 6 页论文，把 broker 写成 file。论文 §6 老老实实写"replication is future work"。
- **2013 年**：Kafka 0.8 实现 ISR + high watermark——这才是今天 90% 文档讨论的核心，但论文里没有。
- **2014 年**：三人离开 LinkedIn 创立 Confluent，把 Kafka 推成商业基础设施。
- **2019 年**：KIP-500 启动用 KRaft（内嵌 Raft）取代 ZooKeeper；2024 年 Kafka 4.0 默认 KRaft，ZK 模式 deprecated。

## 学到什么

1. **把"复杂的中间件"重写成"笨的文件追加器"是降维打击**——所有 per-message 状态消失后，吞吐自然涨一个数量级
2. **协议不变 + 实现迭代**——论文 6 页定哲学，KIP 系列（1 / 32 / 98 / 101 / 405 / 500）补 90% 实现，但 produce/fetch 接口 12 年没变
3. **生态护城河 > 协议优势**——Pulsar / Redpanda 在协议或性能上都更优，但 Kafka 的 Connect / Debezium / Flink-Kafka 生态厚到无法替代
4. **诚实地承认 at-least-once**——Kafka 自身只保证 at-least-once，exactly-once 必须靠下游幂等。不夸大反而比某些后续宣传更可信

## 延伸阅读

- 工程长文：[The Log: What every software engineer should know — Jay Kreps 2013](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)（NetDB 2011 论文哲学的展开版，必读）
- 论文 PDF：[Kafka NetDB 2011 — 6 页](https://notes.stephenholiday.com/Kafka.pdf)
- KIP 必读集：KIP-1（replication）/ KIP-32（timestamp）/ KIP-98（exactly-once）/ KIP-101（leader epoch）/ KIP-500（KRaft）/ KIP-405（tiered storage）
- 视频：[Confluent — Apache Kafka 101](https://developer.confluent.io/learn-kafka/apache-kafka/events/)（10 集，从 producer 到 streams）
- [[pulsar]] —— 计算 / 存储分离的"次世代 Kafka"
- [[bigtable]] —— 同期 Google 论文，另一种 append-only 哲学（SSTable）

## 关联

- [[bigtable]] —— SSTable 的 append-only + compaction 思想与 Kafka segment 一脉相承
- [[gfs]] —— Kafka 的 page cache + sendfile 借用 GFS 同款"信任 OS、信任顺序写"假设
- [[chubby]] —— Kafka 早期用 ZooKeeper 做协调，ZK 是 Chubby 的开源版
- [[raft]] —— KRaft（KIP-500）用 Raft 取代 ZooKeeper，把控制面合并进 broker
- [[paxos]] —— Raft 的前辈；理解 Paxos 才能看懂为什么 Kafka 选了 Raft 而非 Paxos
- [[spanner]] —— Spanner 的 TrueTime 哲学与 Kafka "假装时钟问题不存在"恰好相反
- [[aurora]] —— Aurora 也是"日志即数据库"派，把 redo log 当真值——与 Kafka "日志即数据骨干"同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
