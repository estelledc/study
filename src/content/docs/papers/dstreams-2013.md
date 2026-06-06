---
title: D-Streams — 把流处理伪装成一串很小的批
来源: 'Zaharia et al., "Discretized Streams: Fault-Tolerant Streaming Computation at Scale", SOSP 2013'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

D-Streams（**Discretized Streams**，离散化流）是 Spark Streaming 的核心模型，它的思路反直觉：**别真的做流处理，把流切成一串很小的批**。日常类比：传统流处理像水龙头滴水（一滴算一次），D-Streams 像每秒接一小杯水，接满就拿去处理一杯——**外人看起来还是连续在处理，内部其实是一杯一杯算**。

具体来说：每隔 0.5-2 秒，系统把这段时间收到的事件打包成一个 **mini-batch**，喂给底层 Spark 的 RDD 引擎跑一遍，产出结果，再处理下一杯。整条流就是 RDD 的序列。

论文的一句话主张：**流是批的特例**（和 Flink 后来主张的"批是流的特例"正好相反，这是流处理的两大流派分水岭）。

## 为什么重要

不理解 D-Streams，下面这些事都没法解释：

- 为什么 Spark Streaming 写起来和 Spark 批处理几乎一样——同样的 `map / reduceByKey / join`
- 为什么 Spark Streaming 的故障恢复**比 Storm 快一个数量级**（秒级 vs 分钟级）
- 为什么 D-Streams 能用 **speculative execution**（推测执行）对抗 straggler，而 Storm/Flink 这种连续算子流派做不到
- 为什么 2013 年之后流处理分成两派（micro-batch vs continuous operator），互相打了 5 年口水仗

## 核心要点

D-Streams 的招牌可以拆成 **三件事**：

1. **离散化（discretization）**：流被切成时间区间，每个区间产出一个 **RDD**（Resilient Distributed Dataset，弹性分布式数据集）。`DStream = RDD₀, RDD₁, RDD₂, ...`。**所有计算都退化成 RDD 上的批操作**。

2. **lineage 容错**：每个 RDD 记着"我是怎么从上一个 RDD 算出来的"（这条计算谱系叫 **lineage**）。某个节点挂了 → 丢了哪些 partition，**所有活着的节点同时重算**这些 partition——叫 **parallel recovery**（并行恢复）。Storm 的 upstream backup 是一个节点串行追赶上游，慢得多。

3. **checkpoint 砍 lineage**：lineage 链如果无限长，重算成本会爆炸。所以系统**每隔 N 个 batch 把当前 RDD 物化到 HDFS**，把 lineage 截断重置。这是 D-Streams 实战可用的关键。

三件事加起来 → **流处理的容错几乎是免费的**：复用 Spark 批引擎的所有机制（lineage、推测执行、故障重算），不需要为流再发明一套。

## 实践案例

### 案例 1：D-Streams 跑 WordCount（流式）

```scala
val ssc = new StreamingContext(sparkConf, Seconds(1))   // 1 秒一个 batch
val lines = ssc.socketTextStream("localhost", 9999)
val counts = lines.flatMap(_.split(" "))
                  .map(w => (w, 1))
                  .reduceByKey(_ + _)
counts.print()
ssc.start()
```

**关键观察**：除了 `StreamingContext` 和 `Seconds(1)`，这段代码和**普通 Spark 批 WordCount 几乎一样**。这就是 D-Streams 的卖点：**流批同构**——同一个开发者能把昨天写的批作业改 3 行变成实时作业。

### 案例 2：parallel recovery vs upstream backup

```
Storm（连续算子，upstream backup）：
  Node 3 挂 → Node 2 替它跑 → Node 2 要从头追赶 5 分钟 lineage
  恢复时间 = 5 分钟（串行追赶）

D-Streams：
  Node 3 挂 → 丢了 RDD_t 上的 4 个 partition
  Node 1, 2, 4, 5 同时重算各自的一份 → 1 秒搞定
  恢复时间 ≈ 1 个 batch interval（并行）
```

**关键**：D-Streams 把"恢复"变成普通的并行 RDD 重算任务，所有空闲节点都来帮忙。这是论文实验中"故障恢复 < 1 秒"的来源。

### 案例 3：你能感受到的 D-Streams 影子

如果用过 Spark Structured Streaming：

```scala
df.writeStream.trigger(Trigger.ProcessingTime("1 second")).start()
```

这个 `Trigger.ProcessingTime("1 second")` 就是 D-Streams 的直系后代——**默认还是 micro-batch**，每秒切一刀。直到 2017 年的 Continuous Processing 模式才真正脱离 D-Streams 模型。今天 99% 的 Spark Streaming 生产作业还是 micro-batch。

### 案例 4：有状态流（updateStateByKey）

```scala
val running = pairs.updateStateByKey[Int]((newVals, oldVal) =>
  Some(newVals.sum + oldVal.getOrElse(0))
)
ssc.checkpoint("hdfs://...")   // 必须开！否则 driver 重启丢全状态
```

**踩坑提醒**：状态计算依赖 checkpoint，没开就等着出事故。新人最常翻车的地方。

## 踩过的坑

1. **以为 Spark Streaming 是真流处理**：它是 **micro-batch**，延迟下限 = batch interval。设 1 秒 → end-to-end 通常 1-3 秒。需要亚秒延迟（< 200ms）→ 用 Flink 或 Spark Continuous Processing。

2. **batch interval 设太小**：< 100ms 时 Spark 调度开销超过实际计算，**吞吐反而崩盘**。生产里通常 0.5-2 秒，不要试图做 50ms 的 micro-batch。

3. **lineage 不 checkpoint = 定时炸弹**：跑几小时后 lineage 链长到几千个 RDD，故障重算时把集群打满。**有状态作业必开 checkpoint**，间隔通常 5-10 个 batch。

4. **event time 几乎没有**：D-Streams 论文里基本是 processing time（事件到达时间）。乱序事件、watermark、迟到事件这些 Flink 的招牌——D-Streams 这一代没有，Structured Streaming 才补上。

5. **driver 是单点**：D-Streams 的 driver 调度所有 batch，driver 挂了整条流停摆。生产要配 driver HA（standalone cluster + supervise，或者 YARN cluster mode）。

6. **背压（backpressure）**：上游来太快、下游消化不动 → 数据在 receiver 堆积 → OOM。Spark 1.5 之后有动态 backpressure（`spark.streaming.backpressure.enabled=true`），D-Streams 论文那时还没有。

## 适用 vs 不适用场景

**适用**：
- 已经有 Spark 批处理栈、想加实时维度（团队学习成本最低）
- 秒级延迟够用的场景（实时报表、风控离线 + 实时双写、ETL）
- 需要流批同代码（lambda 架构）
- 有状态聚合不太复杂（计数、TopN、滑动平均）

**不适用**：
- 亚秒级延迟（金融行情、广告竞价 < 100ms）→ Flink 或 Continuous Processing
- 复杂 event-time 窗口（会话窗口、超大乱序）→ Flink 更优雅
- 极简事件转发（Kafka → Kafka 一对一映射）→ Kafka Streams / Pulsar Functions 更轻
- 单事件极重的处理（每事件调外部 API 200ms）→ micro-batch 调度反而成瓶颈

## 历史小故事（可跳过）

- **2010-2012 年**：Matei Zaharia 在 UC Berkeley AMPLab 做 Spark + RDD（NSDI 2012），核心思想是"用 lineage 替代 replication 做容错"。
- **2013 年**：Zaharia 把 RDD 思路推广到流处理 → 本文 SOSP 2013。Spark Streaming 1.0 同年发布。这是 micro-batch 流派的奠基论文。
- **2014-2015 年**：Storm 还是流处理事实标准，但 Spark Streaming 因"和批处理同代码"在 lambda 架构里疯狂铺开。同期 Flink 1.0 出来，连续算子流派开始反扑。
- **2016 年**：Spark 2.0 推出 Structured Streaming（基于 DataFrame）。DStreams API 标记为 legacy，但 micro-batch 模型保留。
- **2017 年后**：Spark Continuous Processing 模式实验性引入连续算子；Structured Streaming 加 watermark 学 Flink；两派开始互相吸收对方优点。

## 学到什么

1. **抽象方向决定一切**：D-Streams 选"流是批的特例"，所以容错几乎免费、流批同构；Flink 选"批是流的特例"，所以延迟可以做到毫秒级、event time 优雅。**没有银弹，只有取舍**。
2. **复用比重做强**：D-Streams 80% 的容错能力来自直接复用 RDD 引擎。**不发明新机制，把老机制换个角度再用一次**——SOSP 论文常见的取胜套路。
3. **并行恢复 > 串行追赶**：把恢复变成普通的并行任务，所有节点都能帮忙——这是 D-Streams 比 Storm 快的根本原因。
4. **理论 → 算法 → 工程**：2010 年 RDD 思想 → 2012 年 Spark NSDI → 2013 年 D-Streams SOSP → 2014 年开源全面落地。又一个 4 年完成的"研究到工业"周期。

## 延伸阅读

- 论文 PDF：[Discretized Streams: Fault-Tolerant Streaming Computation at Scale](https://people.csail.mit.edu/matei/papers/2013/sosp_spark_streaming.pdf)（14 页 SOSP 2013）
- RDD 论文：[Resilient Distributed Datasets](https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final138.pdf)（NSDI 2012，D-Streams 的地基）
- 视频：[Matei Zaharia — Spark Streaming](https://www.youtube.com/watch?v=Fp1ud39E2QU)（作者本人讲一遍）
- 对比阅读：[[flink-2015]] 看连续算子流派怎么打这场仗
- 文档：[Spark Streaming Programming Guide](https://spark.apache.org/docs/latest/streaming-programming-guide.html)（实操从 quickstart 到调优）

## 关联

- [[flink-2015]] —— 流处理另一条路；连续算子 + ABS barrier vs D-Streams 的 micro-batch
- [[bigtable-2006]] —— 大数据系统设计共同根源（lineage、checkpoint 思想都从这一代扩展而来）
- [[lamport-1978]] —— 分布式快照思想是流处理容错共同祖宗，D-Streams 用 lineage 绕开了它
- [[mapreduce]] —— RDD 是 MapReduce 的一般化；D-Streams 是 RDD 在时间维度上的延伸
- [[dataflow-model-2015]] —— Google Dataflow 把 D-Streams 和 Flink 的取舍统一进同一个抽象
- [[millwheel-2013]] —— 同一年 Google 发布的连续算子流处理系统，正好是 D-Streams 的镜像
- [[kafka]] —— D-Streams 在生产里几乎总是搭 Kafka 做可靠 source replay

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[cuda-streams-concurrency-2018]] —— CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
- [[dataflow-model-2015]] —— Dataflow Model — 流处理的四问框架
- [[drizzle-2017]] —— Drizzle — 让 micro-batch 也能跑出 100ms 延迟
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[millwheel-2013]] —— MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机
- [[server-sent-events]] —— Server-Sent Events — 服务器单向推送的标准协议
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析

