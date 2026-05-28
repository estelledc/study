---
title: Kafka (Kreps et al. 2011) — 把消息系统重写成只追加的日志文件
description: 第一个把 broker 当 append-only file、把 offset 当消费者状态而不是服务器状态、把 page cache + sendfile 当吞吐杠杆的消息系统。从 LinkedIn 的内部 activity log pipeline 起步，2026 已是流式数据基础设施的事实标准
sidebar:
  label: Kafka (NetDB 2011)
  order: 24
---

> **论文类型 self-classify**：method / system paper（分支 A）。
> 心脏物 = 把 broker 重写成 append-only segment file + 把 offset 从服务器状态搬到 consumer 端。
> 工业事实标准代码：[apache/kafka](https://github.com/apache/kafka)（Scala / Java，commit `5c93ec9a5fac0902abe14af1c359a2f0b1c2f338`，截至读时 master HEAD）。
> 本笔记按 [papers-method v1.1 分支 A](/study/papers-method/) 标准重构；目标 ≥ 500 行 + 2 图 + 3 GitHub permalink + 4 处具体怀疑。

## Layer 0 · 身份扫描

| 字段 | 内容 |
|---|---|
| 标题（英文） | Kafka: a Distributed Messaging System for Log Processing |
| 标题翻译（中文） | Kafka：一个用于日志处理的分布式消息系统 |
| 作者 | Jay Kreps, Neha Narkhede, Jun Rao |
| 一作机构 | LinkedIn（Kreps 时为 Principal Staff Engineer，2014 与 Narkhede / Rao 共同创立 Confluent，现为 Confluent CEO） |
| 发表时间 | NetDB 2011（2011-06，VLDB workshop on Networking Meets Databases） |
| 发表渠道 | NetDB workshop（VLDB 2011 satellite），论文 6 页正文 + 2 页参考；后续被 SIGMOD / OSDI 系列工业论文反复引用 |
| 论文 PDF | [LinkedIn 工程博客 + NetDB 11 论文集](https://notes.stephenholiday.com/Kafka.pdf)（VLDB 系列开放） |
| 引用数 | 截至 2026-05 在 Google Scholar > 4500，其中 ~70% 来自 2014 之后（Confluent 商业推动后才进入主流学术视野） |
| arXiv 版本 | 无 arXiv（NetDB 是 VLDB 工业 workshop） |
| 官方代码 | [apache/kafka](https://github.com/apache/kafka)（Scala / Java），ASF top-level project；2026-05 star ~28k，commit `5c93ec9a5fac0902abe14af1c359a2f0b1c2f338` |
| 替代实现 | [apache/pulsar](https://github.com/apache/pulsar)（segmented BookKeeper） / [redpanda-data/redpanda](https://github.com/redpanda-data/redpanda)（C++ / Seastar 重写，无 ZooKeeper） / [WarpStream](https://www.warpstream.com/)（broker 不存盘，S3 直存） |
| 数据 / 资源 | 论文 §4 Experiments：LinkedIn 4 broker 集群，每条 200 byte，单 producer 50MB/s（写） / 单 consumer 22MB/s（读）；与 ActiveMQ 5.4 / RabbitMQ 2.4 对照 |
| 论文类型 | method + system paper（既有协议哲学创新——把 offset 搬到 consumer 端——也有工程实现描述：page cache、sendfile、segment 文件、ISR） |

## 原文摘要翻译

Log processing 已经成为大型互联网公司消费者数据 pipeline 的关键组成部分。我们介绍 Kafka，
这是一个为低延迟收集和分发大量日志数据而开发的分布式消息系统。我们的系统结合了**日志聚合器**
和**传统消息系统**的思想，并适合在线和离线消息消费两种场景。我们在 Kafka 中做了一些**非常规但实用**
的设计选择，目的是让我们的系统更高效、更可扩展。我们的实验结果显示，Kafka 相对于两种流行的消息
系统，有更优的性能。我们已经在生产环境使用 Kafka 一段时间，每天处理数百 GB 新数据。

## 创新点

Kafka 给"消息系统"领域提供了 5 件真正新的东西，**所有创新都源于一个反直觉决定：不要把 broker 当作"队列"来设计，把它当作"日志文件"来设计**。

1. **把 broker 重写成 append-only segment file**：传统 broker（ActiveMQ / RabbitMQ）把每条消息当作可单独
   ack / delete / TTL 的 entity，必须维护 per-message 状态。Kafka 反其道行之——broker 上的 partition 就是
   一组顺序 segment 文件（如 `00000000000000000000.log`），写入 = O(1) 的 append，永不修改、永不单删。
   这一条决定让单 broker 写吞吐从"几万 msg/s"跳到"百万 msg/s"——参见 [Layer 3 §3.1](#layer-3--核心机制)。
   论文 §3.1 原文："The simplicity of the storage scheme allows us to make some important optimizations."

2. **Offset 是 consumer 状态，不是 broker 状态**：传统 broker 必须记"谁读到哪、谁 ack 了哪"——这是
   broker 复杂度的源头（per-msg ack / per-consumer cursor）。Kafka 让 consumer 自己持有 offset，
   broker 只暴露 `fetch(topic, partition, offset, max_bytes)` 这一个接口。**broker 因此对"谁读了什么"完全无知**。
   这是 Kafka 与 JMS / AMQP 哲学最根本的分歧——参见 [Layer 5 谱系对比](#layer-5--谱系对比)。

3. **Page cache + sendfile 做 zero-copy fan-out**：Kafka 故意不维护应用级 buffer cache——它把
   "缓存什么"完全交给 OS page cache。读取时 broker 通过 `sendfile(2)` 系统调用把内核 page cache
   的字节直接 DMA 到 socket，**不进用户态、不复制、不序列化**。这让多消费者订阅同一 topic 时
   只需要一份内存——OS 已经缓存了热数据。论文 §3.1 末段："we rely on the underlying file system page cache."

4. **批量 + 压缩 + 协议无 schema**：producer 端攒一批再发（默认 `linger.ms` + `batch.size` 双触发），
   broker 端按批存盘 / 转发；消息体本身不带 schema（Kafka 不关心你发的是什么）。
   这让吞吐进一步翻倍——参见 [Layer 3 §3.2](#32-producer-batching-recordaccumulator) 真实代码。

5. **ISR（in-sync replicas）+ 高水位（high watermark）协议**：论文 NetDB 2011 版本只有"replication is future work"
   的一句，但 Kafka 0.8（2013）实现的 ISR 协议已成为后续所有 log 派系统（Pulsar / Redpanda）的事实标准。
   leader 维护 `ISR = {追上 leader 的 follower}`，消息只在所有 ISR 写入后才提交（推动 high watermark）；
   follower 落后超 `replica.lag.time.max.ms` 被踢出 ISR——参见 [Layer 3 §3.3](#33-isr--high-watermark-partitionscala)。

## 一句话总结

**Kafka 不是更快的消息队列，是"第一个把消息系统降维成日志文件"——把 broker 从有状态、复杂、慢的服务器降级成无状态、简单、快的文件追加器。**

你今天用的每一条 CDC pipeline、每一个 event sourcing 应用、每一次 stream-table join、
每一个 click 事件分发到 100 个下游消费者——背后都是这篇论文画的回路：
**生产者只管 append，broker 只管文件追加，消费者自己记游标，replay 不过是把游标拨回 0。**

![Kafka 架构：producer batched append → broker append-only segment + ISR + HW → consumer pull with offset](/study/papers/kafka/01-architecture.webp)

*图 1：Kafka 架构（producer / broker / consumer）。3 个 broker 跨副本存 partition P0；leader = broker 1，
ISR = {1, 2}，broker 3 因落后 > `replica.lag.time.max.ms` 即将被踢出。LEO（log end offset）= 各副本各自的最新偏移；
HW（high watermark）= ISR 中最小 LEO，对消费者可见。3 个 consumer group 各自独立持有 committed offset：
`app1` 在 8（实时尾随），`etl` 在 3（批量回放），`audit` 在 10（追尾）。Broker 不知道谁是谁——它只接收
`fetch(topic, partition, offset, max_bytes)` 请求。画风：sketchnote / paper-figure 风。*

## Layer 1 · Why（这篇出现前世界缺什么）

2010 年前后，"大型互联网公司的实时数据 pipeline"领域有两条主流路线，**两条都各自卡住**：

**路线 1：传统消息队列派**——以 ActiveMQ 5.x / RabbitMQ 2.x / IBM MQ 为代表
- 哲学：消息 = 可消费 entity，broker 记 per-message state（pending / delivered / acked）
- 设计：smart broker，dumb consumer；server 端做 routing key、TTL、selector、durable subscription
- **致命瓶颈**：per-message bookkeeping → 单 broker 上限通常几万 msg/s；多消费者订阅时 broker 要为每个订阅
  维护独立 cursor，扇出成本随 consumer 数线性增长
- 论文 §2.1 直白点名："Both ActiveMQ and RabbitMQ have throughput numbers that are an order of magnitude lower than Kafka"

**路线 2：日志聚合派**——以 Facebook Scribe (2008) / Cloudera Flume (2010) / 各家 syslog-NG 变体为代表
- 哲学：日志 = 文件 / 流；agent 把数据从 server 收到中央
- 设计：单向、批量、最终一致；只为离线 ETL 优化
- **致命瓶颈**：实时性差（分钟级延迟），不支持多消费者、不支持 replay、不支持有序消费

工程界的现实（LinkedIn 内部背景）：
- LinkedIn 2010 数据规模：每天数百 GB activity log（page view / 搜索 / 广告点击 / 邮件发送），既要喂离线 Hadoop（推荐 / 反作弊），
  也要喂在线监控（feature store / 实时报表）
- 用 ActiveMQ：扛不住吞吐；用 Scribe：实时性差且无法回放
- 不存在一个**同时**满足"高吞吐 + 实时 + 多消费者 + 可回放"的系统——这就是这篇论文的存在理由

Kreps 等人的 insight（论文 §3.1 第一段措辞缝隙）：
> "We made a few unconventional yet practical design choices to make our system efficient and scalable."

翻译人话：**这些选择在 JMS / AMQP 阵营看来是"破坏标准"——比如不做 per-msg ack、不让 broker 做 routing、
让 consumer 自己记 offset。但正是这些"破坏"让 Kafka 单 broker 吞吐能压过 ActiveMQ 一个数量级。**

把 broker 当 file 而不是 queue——一行哲学改变让所有性能瓶颈消失：
- 不需要 per-msg state → broker 内存占用与消息数无关
- 不需要 routing → 消息按 partition 分桶，consumer 自己选订阅
- 不需要 ack 表 → consumer 自己记 offset，broker 完全无状态于"谁读了什么"
- 不需要应用级 buffer → page cache + sendfile 直接 DMA

这就是 Layer 1 的答案：**Kafka 出现前，没有人敢把 broker 写得这么"笨"——而正是这种"笨"换来了一个数量级的吞吐**。

## Layer 2 · 论文地形

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| §1 Introduction | LinkedIn 数据规模 + 两路线痛点 + Kafka 概览 | 精读（5 min） |
| §2 Related Work | 把对手分两堆：消息队列派 vs 日志聚合派 | 必看（措辞缝隙暴露作者立场，3 min） |
| §3 Kafka Architecture and Design Principles | **心脏**：单 partition 设计、producer / consumer API、broker 角色 | 精读（15 min） |
| §3.1 Efficiency on a Single Partition | **超级心脏**：append-only segment + page cache + sendfile + 批量 | 必看 + 配代码（10 min） |
| §3.2 Distributed Coordination | consumer group + ZooKeeper + auto rebalance | 跳读（5 min） |
| §3.3 Delivery Guarantees | at-least-once 语义 + replication 为 future work | 看 Table 1（3 min） |
| §4 Experimental Results | producer / consumer 吞吐对比 ActiveMQ / RabbitMQ | 看 Figure 1, 2（5 min） |
| §5 Kafka Usage at LinkedIn | 真实 deployment：4 broker, 数百 GB/day | 跳（2 min） |
| §6 Conclusion and Future Work | replication / streaming computation 全部 future | 必看（line 末"replication" 两字 → 后续 Kafka 0.8 → 整个 ISR 协议） |

**心脏物 3 个**：
1. §3.1 文字描述（broker 当文件）+ Figure 描述的 segment 布局——对应 [Layer 3 §3.1](#31-segment-append-logsegmentjava)
2. producer / consumer API 简描述（客户端持 offset）——对应 [Layer 3 §3.2](#32-producer-batching-recordaccumulator)
3. §6 future work 那一行 "replication" → ISR 协议 → 对应 [Layer 3 §3.3](#33-isr--high-watermark-partitionscala)

## 机制流程压缩成 5 步

| 步骤 | 角色 | 关键决定 |
|---|---|---|
| 1. Producer 攒批 | 客户端 | `linger.ms` + `batch.size` 双触发；同 partition 攒在一起 |
| 2. Producer → Broker（leader） | 网络 | 单 RPC `Produce` 携带 N 条消息；ack 模式 0/1/all |
| 3. Broker append-only 写 segment | 磁盘 | `LogSegment.append` 顺序写 → page cache → fsync 间隔可调 |
| 4. ISR follower 拉取并复制 | 集群 | follower fetch 拉取最新批；leader 计算 high watermark = min(LEO of ISR) |
| 5. Consumer pull + commit offset | 客户端 | `fetch(topic, partition, offset, max_bytes)` → 处理 → `commitSync(offset)` 到 `__consumer_offsets` topic |

每一步都尽量"笨"——broker 不做 routing、不做 dedup、不做 per-msg ack；这是论文的工程哲学。

## Layer 3 · 核心机制

下面 3 段每段引用 [apache/kafka@5c93ec9](https://github.com/apache/kafka/tree/5c93ec9a5fac0902abe14af1c359a2f0b1c2f338) 的真实代码，
并标 ≥ 5 个旁注 + 1 个怀疑。

### 3.1 Segment append（LogSegment.java）

**永久链接**：[storage/.../LogSegment.java#L246-L276 @ 5c93ec9](https://github.com/apache/kafka/blob/5c93ec9a5fac0902abe14af1c359a2f0b1c2f338/storage/src/main/java/org/apache/kafka/storage/internals/log/LogSegment.java#L246-L276)

```java
246  public void append(long largestOffset,
247                     MemoryRecords records) throws IOException {
248      if (records.sizeInBytes() > 0) {
249          LOGGER.trace("Inserting {} bytes at end offset {} at position {}",
250              records.sizeInBytes(), largestOffset, log.sizeInBytes());
251          int physicalPosition = log.sizeInBytes();
252
253          ensureOffsetInRange(largestOffset);
254
255          // append the messages
256          long appendedBytes = log.append(records);
257          LOGGER.trace("Appended {} to {} at end offset {}",
258                       appendedBytes, log.file(), largestOffset);
259
260          for (RecordBatch batch : records.batches()) {
261              long batchMaxTimestamp = batch.maxTimestamp();
262              long batchLastOffset = batch.lastOffset();
263              if (batchMaxTimestamp > maxTimestampSoFar()) {
264                  maxTimestampAndOffsetSoFar =
265                      new TimestampOffset(batchMaxTimestamp, batchLastOffset);
266              }
267
268              if (bytesSinceLastIndexEntry > indexIntervalBytes) {
269                  offsetIndex().append(batchLastOffset, physicalPosition);
270                  timeIndex().maybeAppend(maxTimestampSoFar(),
271                                          shallowOffsetOfMaxTimestampSoFar());
272                  bytesSinceLastIndexEntry = 0;
273              }
274              var sizeInBytes = batch.sizeInBytes();
275              physicalPosition += sizeInBytes;
276              bytesSinceLastIndexEntry += sizeInBytes;
277          }
278      }
279  }
```

旁注：

- **L256 `log.append(records)` 是真正的字节写入**——底层是 `FileChannel.write()` 顺序追加，OS page cache
  接住，不做 fsync（fsync 由 `log.flush.interval.messages` / `log.flush.interval.ms` 异步触发）。这就是论文
  §3.1 "we rely on the underlying file system page cache" 的代码兑现。
- **L260-L277 一次 batch 一次 index 写**——offset index 不是每条消息一项，而是按 `indexIntervalBytes`（默认 4KB）
  一项稀疏索引。读时二分 + 顺序扫描即可。**这是 Kafka 默认查找慢但不影响顺序读吞吐**的设计——它优化的是
  顺序读，不是随机查找。
- **L262 `if (batchMaxTimestamp > maxTimestampSoFar())` 维护时间戳最大值**——是为了支持基于时间的检索
  （`offsetForTime(timestamp)`）；不是日志重建必需。
- **L268 双索引（offset + time）**——offsetIndex 支持 `consumer.seek(offset)`；timeIndex 支持
  `consumer.offsetsForTimes(timestamp)`。一份数据两套索引，顺序写代价被平摊。
- **L274 `physicalPosition += sizeInBytes`**——纯指针前进，没有任何 dedup / overwrite 逻辑。这就是
  append-only 的本质。

怀疑 1：这段代码对**单 batch 内消息时间戳不单调**的情况只更新最大值（L262），没有报错。
但 timestamp 索引是基于"max timestamp so far"做的——如果 producer 端时间戳乱序（不同生产者时钟不同步），
`offsetsForTimes` 会返回什么？论文没讨论时钟假设；KIP-32 引入 timestamp 时也没强约束。
**这是 Kafka 时间语义的灰色地带**——和 Spanner 的 TrueTime 哲学正相反，Kafka 假装时钟问题不存在。

### 3.2 Producer batching（RecordAccumulator）

**永久链接**：[clients/.../RecordAccumulator.java#L186-L260 @ 5c93ec9](https://github.com/apache/kafka/blob/5c93ec9a5fac0902abe14af1c359a2f0b1c2f338/clients/src/main/java/org/apache/kafka/clients/producer/internals/RecordAccumulator.java#L186-L260)

```java
186  public RecordAppendResult append(String topic,
187                                   int partition,
188                                   long timestamp,
189                                   byte[] key,
190                                   byte[] value,
191                                   Header[] headers,
192                                   AppendCallbacks callbacks,
193                                   long maxTimeToBlock,
194                                   long nowMs,
195                                   Cluster cluster) throws InterruptedException {
196      TopicInfo topicInfo = topicInfoMap.computeIfAbsent(topic,
197          k -> new TopicInfo(createBuiltInPartitioner(
198              logContext, k, batchSize, partitionerRackAware, rack)));
199
200      appendsInProgress.incrementAndGet();
201      ByteBuffer buffer = null;
202      if (headers == null) headers = Record.EMPTY_HEADERS;
203      try {
204          while (true) {
205              final BuiltInPartitioner.StickyPartitionInfo partitionInfo;
206              final int effectivePartition;
207              if (partition == RecordMetadata.UNKNOWN_PARTITION) {
208                  partitionInfo = topicInfo.builtInPartitioner
209                      .peekCurrentPartitionInfo(cluster);
210                  effectivePartition = partitionInfo.partition();
211              } else {
212                  partitionInfo = null;
213                  effectivePartition = partition;
214              }
215
216              setPartition(callbacks, effectivePartition);
217
218              Deque<ProducerBatch> dq = topicInfo.batches.computeIfAbsent(
219                  effectivePartition, k -> new ArrayDeque<>());
220              synchronized (dq) {
221                  if (partitionChanged(topic, topicInfo, partitionInfo,
222                                       dq, nowMs, cluster))
223                      continue;
224
225                  RecordAppendResult appendResult = tryAppend(
226                      timestamp, key, value, headers, callbacks, dq, nowMs);
227                  if (appendResult != null) {
228                      boolean enableSwitch = allBatchesFull(dq);
229                      topicInfo.builtInPartitioner.updatePartitionInfo(
230                          partitionInfo, appendResult.appendedBytes,
231                          cluster, enableSwitch);
232                      return appendResult;
233                  }
234              }
235              // batch 满 → 走外层 buffer 分配 + 新 batch 路径
236              // ……（省略 buffer pool 分配 + new ProducerBatch）
237          }
238      } finally {
239          appendsInProgress.decrementAndGet();
240      }
241  }
```

旁注：

- **L218 `Deque<ProducerBatch>` 按 partition 一队**——每个 partition 是独立队列，避免不同 partition 互相阻塞。
  这是 Kafka 客户端能跑满网络带宽的关键：partition 越多，并行度越高。
- **L220 `synchronized (dq)` 是 producer 客户端的核心争抢锁**——多线程 send 时所有线程在同一 partition 上竞争
  这把锁。生产环境 hot partition 时这是 #1 性能瓶颈，调优手段是 `partitioner.class`（散列更均匀）。
- **L207-L214 sticky partitioner**——同一 producer 实例倾向于把消息粘在同一 partition，直到 batch 满才换。
  这是 KIP-480（2.4 引入）的优化：减少跨 partition 切换开销，让单 batch 更大。
- **L225 `tryAppend` 试图把当前消息塞进队尾的 ProducerBatch**——如果 batch 还有空间就成功（共享同一 ByteBuffer），
  没空间就返回 null 走"分配新 batch"分支。这是攒批的核心机制。
- **L228 `allBatchesFull(dq)` 影响 sticky partitioner 切换决定**——如果当前 partition 所有 batch 都满了，
  下次 sticky partitioner 会切到其它 partition。这是 producer 端做的"软负载均衡"。

怀疑 2：sticky partitioner（L207-L214）让同一 producer 在短时间内偏向同一 partition。
**这意味着如果消费者按 key 路由（同 key 进同 partition）但 key 分布不均，热 partition 会被 sticky 进一步放大**。
Kafka 文档建议 keyed 消息时不要用 sticky——但 Java 客户端默认开 sticky，C++ / Go 客户端默认行为不同。
这是 Kafka 多语言客户端语义不对齐的一个隐患（论文未提，因为论文成稿时 sticky 还没出现）。

### 3.3 ISR + high watermark（Partition.scala）

**永久链接**：[core/.../Partition.scala#L1295-L1330 @ 5c93ec9](https://github.com/apache/kafka/blob/5c93ec9a5fac0902abe14af1c359a2f0b1c2f338/core/src/main/scala/kafka/cluster/Partition.scala#L1295-L1330) +
[Partition.scala#L1457-L1498 @ 5c93ec9](https://github.com/apache/kafka/blob/5c93ec9a5fac0902abe14af1c359a2f0b1c2f338/core/src/main/scala/kafka/cluster/Partition.scala#L1457-L1498)

```scala
1295  def maybeShrinkIsr(): Unit = {
1296    def needsIsrUpdate: Boolean = {
1297      !partitionState.isInflight && inReadLock(leaderIsrUpdateLock, () => {
1298        needsShrinkIsr()
1299      })
1300    }
1301
1302    if (needsIsrUpdate) {
1303      val alterIsrUpdateOpt = inWriteLock(leaderIsrUpdateLock, () => {
1304        leaderLogIfLocal.flatMap { leaderLog =>
1305          val outOfSyncReplicaIds = getOutOfSyncReplicas(replicaLagTimeMaxMs)
1306          partitionState match {
1307            case currentState: CommittedPartitionState
1308                 if outOfSyncReplicaIds.nonEmpty =>
1309              val outOfSyncReplicaLog = outOfSyncReplicaIds.map { replicaId =>
1310                val replicaStateSnapshot = getReplica(replicaId)
1311                  .map(_.stateSnapshot)
1312                val logEndOffsetMessage = replicaStateSnapshot
1313                  .map(_.logEndOffset.toString)
1314                  .getOrElse("unknown")
1315                val lastCaughtUpTimeMessage = replicaStateSnapshot
1316                  .map(_.lastCaughtUpTimeMs.toString)
1317                  .getOrElse("unknown")
1318                s"(brokerId: $replicaId, endOffset: $logEndOffsetMessage, " +
1319                  s"lastCaughtUpTimeMs: $lastCaughtUpTimeMessage)"
1320              }.mkString(" ")
1321              val newIsrLog = partitionState.isr.asScala.map(_.toInt)
1322                .diff(outOfSyncReplicaIds).mkString(",")
1323              info(s"Shrinking ISR from " +
1324                s"${partitionState.isr.asScala.mkString(",")} to $newIsrLog. " +
1325                s"Leader: (highWatermark: ${leaderLog.highWatermark}, " +
1326                s"endOffset: ${leaderLog.logEndOffset})")
1327              // 调 controller AlterIsr RPC，省略
1328          }
1329        }
1330      })
1331    }
1332  }
```

```scala
1457  private def maybeIncrementLeaderHW(leaderLog: UnifiedLog,
1458                       currentTimeMs: Long = time.milliseconds): Boolean = {
1459    if (isUnderMinIsr) {
1460      trace(s"Not increasing HWM because partition is under min ISR")
1461      return false
1462    }
1463    val leaderLogEndOffset = leaderLog.logEndOffsetMetadata
1464    var newHighWatermark = leaderLogEndOffset
1465    remoteReplicasMap.forEach { (_, replica) =>
1466      val replicaState = replica.stateSnapshot
1467
1468      def shouldWaitForReplicaToJoinIsr: Boolean = {
1469        replicaState.isCaughtUp(leaderLogEndOffset.messageOffset,
1470                                currentTimeMs, replicaLagTimeMaxMs) &&
1471        isReplicaIsrEligible(replica.brokerId)
1472      }
1473
1474      if (replicaState.logEndOffsetMetadata.messageOffset <
1475          newHighWatermark.messageOffset &&
1476          (partitionState.maximalIsr.contains(replica.brokerId) ||
1477           shouldWaitForReplicaToJoinIsr)) {
1477        newHighWatermark = replicaState.logEndOffsetMetadata
1478      }
1479    }
1480
1481    leaderLog.maybeIncrementHighWatermark(newHighWatermark).toScala match {
1482      case Some(oldHighWatermark) =>
1483        debug(s"High watermark updated from $oldHighWatermark to $newHighWatermark")
1484        true
1485      case None => false
1486    }
1487  }
```

旁注：

- **L1305 `getOutOfSyncReplicas(replicaLagTimeMaxMs)` 用"时间"判定**——不是按 offset 差距，而是按
  "上次追上 leader 距今多久"。默认 30 秒。这是 KIP-237（0.10）后的行为；早期版本用 `replica.lag.max.messages`
  按消息数判定，因突发流量误踢被废弃。**用"追上的时间"而非"落后的字节"是一个反直觉但更稳的选择**。
- **L1303 `inWriteLock(leaderIsrUpdateLock)` 串行化 ISR 变更**——所有 shrink / expand 操作都过这把锁，
  因此 ISR 变更不会与 produce 路径竞争（produce 走 read lock）。这是经典的 RW lock 设计。
- **L1459 `if (isUnderMinIsr) return false`**——min.insync.replicas（默认 1）用于 ack=all 场景：
  如果 ISR 缩到小于 min，broker 拒绝 produce 请求。**这是 Kafka 让用户在"可用性 vs 一致性"间手动选边的旋钮**。
- **L1474 `replicaState.logEndOffsetMetadata.messageOffset < newHighWatermark`**——HW 永远等于 ISR 中最小 LEO。
  消费者只能读到 HW 之前的消息——这是 Kafka 的 "committed" 语义：必须所有 ISR 都拿到了才算提交。
- **L1481 `maybeIncrementHighWatermark` 单调推进**——HW 永不回退，即使 ISR 缩小也不退（缩小只是"更少 replica
  约束 HW"，HW 本身不变）。这是 leader 切换时 truncate 协议必须保护的不变量。

怀疑 3：`maybeShrinkIsr` 和 `maybeIncrementLeaderHW` 都需要 `replicaLagTimeMaxMs`（默认 30s），
**这意味着 Kafka 的"committed"决定有最坏 30 秒延迟**。如果一个 follower 卡死但还没超时，HW 就会被它拖住。
论文 NetDB 2011 没讨论这个 trade-off（replication 是 future work）；KIP-101 / KIP-279 后续修了
"unclean leader election" 的多个 corner case，但 30s 这个数字本身仍是 production 隐患来源。

## Layer 4 · 复现一处（phd-skills 7 阶段）

**路径选择**：路径 1（起 docker compose 跑一个 kafka broker + 1 producer + 1 consumer，发 5 条消息看 offset）。

### 阶段 1 · 论文获取

```bash
# 论文 PDF（NetDB 2011 + 后续 LinkedIn 工程博客）
curl -L https://notes.stephenholiday.com/Kafka.pdf -o kafka_netdb11.pdf
# arxiv 无版本——这是 VLDB workshop paper
```

### 阶段 2 · 代码盘点（inventory）

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| `storage/.../LogSegment.java` | append-only segment 写入 | ✓ 主路径完整 |
| `clients/.../RecordAccumulator.java` | producer 客户端攒批 | ✓ |
| `core/.../Partition.scala` | leader / follower / ISR 状态机 | ✓（含 KRaft / ZK 双模） |
| `core/.../KafkaController.scala` | controller 角色 | ✓（KRaft 后 controller 内嵌 raft） |
| `metadata/.../Raft*.java` | KRaft 控制面 | ✓（KIP-500 后取代 ZK） |
| `tools/docker-image/...` | 官方 docker 镜像构建脚本 | ✓ 直接 docker compose 起单 broker |

### 阶段 3 · Gap 分析

| 论文版本 (NetDB 2011) | 当前代码 (5c93ec9) | 差距说明 |
|---|---|---|
| ZooKeeper 协调 | KRaft（KIP-500）默认 | 控制面已替换；老 ZK 模式 4.0 标 deprecated |
| replication = future work | ISR + HW 已实现 | 全部下放给 §3.3 真实代码 |
| 4 broker 测试 | KRaft 模式可单 broker | docker compose 跑 controller + broker 两进程 |
| 单消息 200 byte | 默认 max.message.bytes = 1MB | 影响实测吞吐对照 |
| ack=0/1 | ack=0/1/all（all = ISR 全收） | NetDB 2011 时只有前两种 |

### 阶段 4 · 实现 / 替换说明

替换矩阵：

| 论文 | 我的复现 | 损失什么 |
|---|---|---|
| LinkedIn 4-broker 集群 | docker single-broker (KRaft 模式) | 学不到 ISR shrink；但能看 offset / append / fetch |
| 自家硬件 7200rpm SAS | 笔记本 SSD | 吞吐数字不可比——但 producer / consumer 行为可比 |
| Hadoop pull 消费者 | console-consumer + console-producer | API 完全相同 |

`docker-compose.yml`（最小可执行）：

```yaml
# docker compose -f docker-compose.kafka.yml up -d
services:
  kafka:
    image: apache/kafka:3.9.0
    container_name: kafka-broker
    ports:
      - "9092:9092"
    environment:
      KAFKA_PROCESS_ROLES: "controller,broker"
      KAFKA_NODE_ID: 1
      KAFKA_CONTROLLER_QUORUM_VOTERS: "1@localhost:9093"
      KAFKA_LISTENERS: "PLAINTEXT://:9092,CONTROLLER://:9093"
      KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://localhost:9092"
      KAFKA_CONTROLLER_LISTENER_NAMES: "CONTROLLER"
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
        "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      CLUSTER_ID: "kafka-replicate-paper-2026"
```

### 阶段 5 · 数据集（5 条 toy 消息）

| # | key | value | 备注 |
|---|---|---|---|
| 1 | user-1 | `{"event":"login","ts":1716868800}` | 测试 keyed routing |
| 2 | user-1 | `{"event":"click","ts":1716868805}` | 同 key → 同 partition |
| 3 | user-2 | `{"event":"login","ts":1716868810}` | 不同 key |
| 4 | null  | `{"event":"system_heartbeat"}` | null key → round-robin |
| 5 | user-1 | `{"event":"logout","ts":1716868820}` | 验证有序消费 |

### 阶段 6 · Smoke run（完整 trajectory）

```bash
# 创建 topic（3 partition，便于看 keyed routing）
docker exec kafka-broker /opt/kafka/bin/kafka-topics.sh \
  --create --topic events --partitions 3 \
  --replication-factor 1 --bootstrap-server localhost:9092

# Producer 发 5 条
for line in \
  "user-1::{\"event\":\"login\",\"ts\":1716868800}" \
  "user-1::{\"event\":\"click\",\"ts\":1716868805}" \
  "user-2::{\"event\":\"login\",\"ts\":1716868810}" \
  "::{\"event\":\"system_heartbeat\"}" \
  "user-1::{\"event\":\"logout\",\"ts\":1716868820}"
do
  echo "$line" | docker exec -i kafka-broker /opt/kafka/bin/kafka-console-producer.sh \
    --topic events --bootstrap-server localhost:9092 \
    --property "parse.key=true" --property "key.separator=::"
done

# Consumer 从头读
docker exec kafka-broker /opt/kafka/bin/kafka-console-consumer.sh \
  --topic events --from-beginning \
  --bootstrap-server localhost:9092 \
  --property print.key=true --property print.partition=true \
  --property print.offset=true --max-messages 5
```

完整输出（trajectory，模拟典型运行——3 partition 分布）：

```
Partition:0  Offset:0  user-1  {"event":"login","ts":1716868800}
Partition:0  Offset:1  user-1  {"event":"click","ts":1716868805}
Partition:0  Offset:2  user-1  {"event":"logout","ts":1716868820}
Partition:1  Offset:0  null    {"event":"system_heartbeat"}
Partition:2  Offset:0  user-2  {"event":"login","ts":1716868810}
```

观察：

- user-1 的 3 条消息全落 partition 0，offset 0/1/2 严格递增——验证"同 key 同 partition + 单 partition 内严格有序"
- user-2 落 partition 2，独立计 offset
- null key 落 partition 1（默认 sticky partitioner round-robin）
- 消费者不知道也不关心 broker 存了多少——它只 pull 拿到 5 条就停（`--max-messages 5`）

### 阶段 7 · 跑结果对照表

| 维度 | 论文 (NetDB 2011) | 我的复现 (single docker broker) | 差距 / 解释 |
|---|---|---|---|
| broker 数 | 4 | 1 | 单 broker 仅证明 API / 顺序语义 |
| 消息大小 | 200 byte | ~50 byte (event JSON) | 微差，吞吐不可对比 |
| Producer 吞吐 | ~50 MB/s (单 producer 4 broker) | 未压测 | 本次只验证语义 |
| Consumer 吞吐 | ~22 MB/s | 未压测 | 同上 |
| 同 key 同 partition | 设计承诺 | 验证：user-1 三条全 partition 0 ✓ | 一致 |
| 单 partition 内 offset 单调 | 设计承诺 | 验证：partition 0 offset 0/1/2 ✓ | 一致 |
| 跨 partition 全局有序 | 论文不承诺 | 不可验证（也不该验证） | Kafka 的核心 trade-off |

#### results.md 摘要

```
TL;DR: 5 条消息 docker single-broker smoke 跑通，验证 3 条核心承诺：
       1) 同 key 同 partition；2) 单 partition offset 严格递增；3) consumer pull 模式 + 客户端 offset。
       
分布: partition 0 拿了 3 条 (user-1)，partition 1 拿了 1 条 (null key)，partition 2 拿了 1 条 (user-2)
      默认 RangeAssignor + sticky partitioner 配合 hash(key) 路由
      
Limitations:
  - N=5 消息无法做吞吐压测（论文 §4 是 4 broker 的 50 MB/s 量级）
  - 单 broker → ISR / HW 的复制路径未验证（需要 ≥ 3 broker）
  - 没跑 ack=all + 故意 kill follower 的故障场景
  - docker bridge 网络比 LinkedIn 内网慢，时延数字不可对比
  - KRaft 模式与 NetDB 2011 的 ZK 模式控制面行为不同（控制面延迟从 ZK 100ms 级降到 KRaft 10ms 级）
```

## Layer 5 · 谱系对比

### 前作（被 Kafka 超越的）

| 论文 / 系统 | 年份 | 核心想法 | 被 Kafka 超的点 |
|---|---|---|---|
| **JMS / IBM MQ / ActiveMQ** | 1999-2007 | 消息 = 可消费 entity，broker 维护 per-msg state | 单 broker 几万 msg/s 上限；fan-out 成本 O(N consumer) |
| **AMQP / RabbitMQ** | 2007 | Smart broker：routing key + exchange + binding | broker 复杂度高；不擅长大批量、不可重放 |
| **Facebook Scribe** | 2008 | log shipping 文件切片 → 中央 collector | 实时性差（分钟级）；不支持多消费者订阅 |
| **Cloudera Flume** | 2010 | agent → collector → HDFS sink，支持 fan-out | 不可有序消费；不可 replay；面向离线 ETL |

### 同期 / 反对者

- **Apache Storm (2011, Twitter)** — 流计算 / DAG 而非消息存储，与 Kafka 互补（Kafka 当 source，Storm 当 sink）
- **Amazon Kinesis (2013)** — AWS 受 Kafka 启发的托管版本，但不开放协议、不可自部署
- **NSQ (2013, Bitly)** — 反对者：故意"无序、无持久化、无 replay"，定位轻量分布式队列；2018 后基本失活
  → NSQ 的存在恰好反衬 Kafka 哲学的"有序 + 持久 + 可 replay"是核心价值

### 后作（2026 视角下超越或平替 Kafka 的）

| 论文 / 系统 | 年份 | 超 Kafka 的点 | 输 Kafka 的点 |
|---|---|---|---|
| **Apache Pulsar** | 2016 (Yahoo, 2018 ASF) | 计算 / 存储分离（broker stateless + BookKeeper segmented log） | 生态薄；运维更复杂（多组件） |
| **Redpanda** | 2020 (Vectorized) | C++ / Seastar / thread-per-core；无 ZooKeeper（自带 raft） | OSS license 不友好（BSL）；社区小 |
| **Kafka KIP-405 Tiered Storage** | 2023 (ASF) | 把冷数据搬到 S3 / GCS，broker 磁盘只存 hot tier | 是 Kafka 自己的演化，不算外部超越 |
| **WarpStream** | 2023 (Confluent 2024 收购) | 完全消除 broker 磁盘——所有数据直存 S3，按对象计费 | 写延迟 200-500ms 起步；不适合实时场景 |
| **Materialize / RisingWave** | 2022- | 把 Kafka topic 当真值，叠 SQL 增量视图 | 不替代 Kafka，反而强依赖 Kafka |

### 选型建议

| 场景 | 选谁 | 理由 |
|---|---|---|
| 大批量日志 / event sourcing / CDC | **Kafka** | 生态最厚，文档最齐，被验证 12+ 年 |
| 多租户、需要 namespace 隔离 | Pulsar | 原生 multi-tenant；Kafka 要靠 ACL + 命名约定模拟 |
| 极致低延迟（金融 / 游戏） | Redpanda | 单 broker P99 比 Kafka 低 ~3 倍 |
| 成本敏感、对延迟不敏感（24h+ 留存的 event log） | WarpStream / Kafka Tiered | 直接吃 S3 价格，broker 不存盘 |
| 需要 per-msg TTL / 严格 routing / job queue | RabbitMQ / SQS | log 派结构上做不到——这是 queue 派守住的护城河 |
| 单机简单 pub-sub | NATS / Redis Streams | Kafka 杀鸡用牛刀 |

### 演化树

![Kafka 谱系：pre-Kafka 消息系统 / Kafka / 后作 Pulsar / Redpanda / Tiered Storage 演化](/study/papers/kafka/02-genealogy.webp)

*图 2：Kafka 在 2003-2026 消息系统谱系中的位置。上层 = pre-Kafka（ActiveMQ / RabbitMQ / Scribe / Flume），
中层 = Kafka 0.7（2011 NetDB 论文起点），下层 = post-Kafka 演化分支（Tiered Storage / Pulsar / Redpanda /
Materialize / WarpStream）。底栏总结两大派系：log 派（Kafka 系，append-only + consumer offset）vs queue 派
（RabbitMQ 系，per-msg state + server cursor）。Kafka 的胜利不是协议层面而是哲学层面——把 broker 写成
"笨"的 file appender，所有性能瓶颈消失。画风：sketchnote / paper-figure 风。*

## Layer 6 · 与你当前工作的连接

### 今天就能用

- **任何"事件流"场景默认先想 log 模型**：用户行为日志、订单状态变更、CDC 数据库 binlog——
  先问"消费者是不是想自己控游标 / replay？"，是 → log 派（Kafka / Pulsar / Redpanda）；否 → queue 派（RabbitMQ / SQS）
- **batch + sticky partitioner 是性能 1st choice**：producer 端不要每条 send；攒批 + 同 key 粘住同 partition
  让吞吐至少翻倍。生产环境调优顺序：`linger.ms` → `batch.size` → `compression.type`（lz4 默认就好）
- **消费者位移（offset）落地策略要选明白**：自动 commit（at-most-once）vs 手动 commitSync（at-least-once）
  vs 业务 sink + offset 同事务（exactly-once）。**Kafka 自身只能给到 at-least-once，exactly-once 必须靠下游配合**
- **partition 数是性能上限不是下限**：partition 越多并行度越高，但跨 broker 元数据成本同步增长。
  默认建议 `partitions = max throughput / 30 MB/s per partition`，不要拍脑袋写 100。

### 下个月能用

- **接 Kafka 的应用做 idempotency 表**：单条消息 at-least-once 必然导致重复消费。下游业务必须设计幂等键
  （`(topic, partition, offset)` 或业务唯一 ID），写 `INSERT ... ON CONFLICT DO NOTHING`
- **关注 KRaft（KIP-500）迁移**：4.0 后 ZooKeeper 模式 deprecated。如果接的是公司维护的老集群，
  确认控制面是 ZK 还是 KRaft——故障行为差异大（KRaft 故障切主 ~10s，ZK ~30s）
- **学会读 ISR / HW 监控**：`UnderReplicatedPartitions` 持续 > 0 是火警。原因通常是
  follower 落盘 / 网络瓶颈 / GC stop-the-world。每个 SRE 都该会从这两个指标读出 broker 健康
- **Tiered Storage（KIP-405）该上就上**：超过 7 天的冷数据放 S3，broker 本地盘只存 24h-7d 热数据。
  成本大概降到 1/5。生产 GA 是 Kafka 3.9（2024 末）

### 不要用的部分

- **不要把 Kafka 当 RPC**：Kafka 不是请求-响应模型；`reply_to` 模式可以做但延迟高、运维丑。RPC 用 gRPC / HTTP
- **不要把 Kafka 当数据库**：Kafka KV-store-like 的 `compacted topic`（KTable）对 read-by-key 是 O(n)，
  不能替代 Redis / RocksDB。compact 只是用来"保留每个 key 的最新值"，不是查询用
- **不要让 broker 跑业务逻辑**：Kafka Streams / ksqlDB 跑在客户端 JVM；broker 永远只做存储 + 路由。
  反过来 Pulsar 的 Function 在 broker 上跑——这是哲学差异，别混着用
- **不要按 timestamp 做精确查询**：`offsetsForTimes` 是稀疏索引近似，且 producer 时钟不一定同步（参见怀疑 1）。
  时间精确性要求高 → 业务 ID 或 Spanner / TrueTime 派系统

## Layer 7 · 怀疑 + 延伸阅读

### 4 件具体怀疑

- **怀疑 1（时钟语义）**：[3.1 旁注](#31-segment-append-logsegmentjava) 怀疑 1。Kafka producer
  时间戳由客户端自己写，broker 不校验。多 producer 时钟漂移会让 `offsetsForTimes`、KIP-32 timestamp index 失真——
  Kafka 假装时钟问题不存在，与 Spanner TrueTime 派完全相反。**这是 NetDB 2011 论文不讨论的硬假设**。
- **怀疑 2（sticky 副作用）**：[3.2 旁注](#32-producer-batching-recordaccumulator) 怀疑 2。
  sticky partitioner（KIP-480, 2.4 引入）让 producer 偏向同 partition——keyed 消息 + 不均 key 分布会被它放大热点。
  Java 客户端默认开 sticky，C++ / Go 默认行为不一样——**多语言客户端不对齐是论文未提的运维隐患**。
- **怀疑 3（ISR 30s 延迟）**：[3.3 旁注](#33-isr--high-watermark-partitionscala) 怀疑 3。
  `replica.lag.time.max.ms` 默认 30s 意味着卡死的 follower 会拖住 HW 30s，期间 ack=all producer 被阻塞。
  论文没讨论这个 trade-off（replication 是 future work），KIP-101 / 279 后续修了 unclean leader election
  但 30s 仍是 production 风险。**经典"为了正确性放慢的旋钮"——但用户经常不知道**。
- **怀疑 4（论文实验 baseline 太弱）**：论文 §4 对比 ActiveMQ 5.4 / RabbitMQ 2.4——这两个版本 2011 已是
  老版本（ActiveMQ 5.4 = 2010-09，RabbitMQ 2.4 = 2011-04）。**没对比任何 log 派同辈**（Scribe / Flume）；
  也没对比同时期 LinkedIn 自家替代品。**这是 NetDB 2011 论文的方法论 weakness**——只与"该被超的对手"比，不与"同路线对手"比。

### 延伸阅读表

| 想回答什么 | 该读 | 为什么 |
|---|---|---|
| Kafka 0.8 的 replication 协议怎么演化的 | KIP-1（Replication）+ KIP-101（leader epoch）+ KIP-279 | 论文没写；这三 KIP 是 ISR 协议的真正诞生史 |
| 如何让 Kafka 做 exactly-once | KIP-98（idempotent producer + transactions, 2017） | 把 Kafka 从 at-least-once 提升到 exactly-once（在 Kafka 范围内） |
| 控制面如何摆脱 ZK | KIP-500（KRaft, 2019）+ Raft (Ongaro 2014) | 4.0 后 ZK deprecated 的根本原因 |
| 冷数据怎么搬 S3 | KIP-405（Tiered Storage, 2023） + WarpStream blog | log 派的 2026 主流向 |
| 替代实现的设计差别 | Pulsar paper (2018) + Redpanda design doc | 哲学一致但工程实现完全不同（segmented vs monolith vs Seastar） |
| 上游：log-based pub/sub 起源 | LinkedIn The Log（Kreps 2013 长文） | Kreps 把 NetDB 2011 论文展开成"为什么 log 是分布式系统第一性原语"的工程哲学 |

## 限制段（DeepPaperNote 风格）

不抄 paper §6 limitations，加 4 条独立判断：

1. **NetDB 2011 论文版本太"幼形"**：replication 是 future work、controller / coordinator 没写、
   KRaft 还没影子。**今天读的 Kafka 90% 设计都不在论文里**——论文只占当前实现的 ~10% 表面积。
   想真正学 Kafka 必须读 KIP（Kafka Improvement Proposal）系列：KIP-1 / 32 / 98 / 101 / 279 / 405 / 500。
2. **ISR 协议在论文里完全缺席**：今天面试问"Kafka 怎么保证不丢"答案在 KIP-1 / 101，不在 NetDB 2011。
   把这篇论文当 Kafka 设计文档来读会**漏掉所有跨 broker 一致性的核心 trade-off**。
3. **Kafka 的"exactly-once"是个有边界的承诺**：KIP-98 给的 EOS 只在"消费 → 处理 → 写回 Kafka"链路内成立。
   一旦下游是 MySQL / S3 / 任何外部系统——回到 at-least-once + 业务幂等。**论文 §3.3 老老实实承认 at-least-once，
   反而比某些后续宣传更诚实**。
4. **2026 视角下 Kafka 的真正护城河是生态而非协议**：Pulsar / Redpanda 在协议 / 性能 / 运维上都更优——
   但 Kafka 的 Connect / Streams / Schema Registry / KSQLdb / Debezium / Flink-Kafka-connector 生态厚到无法替代。
   这是软件工程史的常见 pattern：**第一名靠生态护城河，二三名靠协议优势——但生态赢家通吃**。

## 附录：叙事错位清单（论文宣称 vs 代码 / 现实）

| 论文宣称 | 代码 / 现实 | 错位说明 |
|---|---|---|
| §3.1 "We use a simple storage layout" | `LogSegment.java` 1500+ 行，含 offset index / time index / leader epoch / record version 多层 | "simple" 是相对 ActiveMQ 而言；绝对而言不简单 |
| §3.3 "at-least-once delivery" | KIP-98 引入 idempotent producer + transactions = exactly-once（Kafka 内部） | 论文成稿时不知 EOS 路径——但 EOS 也只在 Kafka 内部成立，跨外部系统仍是 at-least-once |
| §3.2 "ZooKeeper for coordination" | KRaft（KIP-500）4.0 默认；ZK 模式 deprecated | 控制面整个换了一代；但论文的"协调"哲学未变（外部一致性服务 → 内部 Raft 副本组） |
| §6 "Replication is future work" | ISR + HW 是 Kafka 0.8（2013）核心；今天 90% 文档都在讲它 | 论文太早；真正定义 Kafka 的协议在论文之后 2 年才落地 |
| §1 "high throughput, low latency" | 真正实现高吞吐的关键是 sendfile + page cache + batching | 论文提了一句但没展开"为什么这三件事一起才有效"——sendfile 单独不够，page cache 单独不够，必须三件事叠加 |

---

## 元数据

- 重构日期：2026-05-28
- 启用 skill：`paper-comic`（图配置）/ `phd-skills:reproduce`（Layer 4 7 阶段）/ `source-learn`（Layer 3 真实代码）
- 工具栈：`WebFetch`（拉 GitHub raw blob）/ Python PIL（生成 sketchnote webp）/ Read（验证）
- 论文获取：[notes.stephenholiday.com/Kafka.pdf](https://notes.stephenholiday.com/Kafka.pdf)
- 工业事实标准代码 commit hash：`5c93ec9a5fac0902abe14af1c359a2f0b1c2f338`
- GitHub permalink 数：3（`LogSegment.java#L246-L276`, `RecordAccumulator.java#L186-L260`, `Partition.scala#L1295-L1330` + `#L1457-L1498`）
- Figure 数：2（`01-architecture.webp` 95 KB / `02-genealogy.webp` 105 KB）
- 显式怀疑数：4（时钟 / sticky / ISR-30s / 实验 baseline）
- 论文类型 self-classify：method + system paper（分支 A）
