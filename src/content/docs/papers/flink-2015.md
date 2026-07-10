---
title: Apache Flink — 流批一体的单引擎
来源: 'Carbone et al., "Apache Flink: Stream and Batch Processing in a Single Engine", IEEE Data Eng. Bull. 2015'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Flink 是一个**把"流处理"当主角、"批处理"当配角**的开源数据引擎。日常类比：以前的系统像收集快递，每隔一小时把当时到的箱子一起拆（**批处理**）；Flink 像传送带，每来一件**立刻就拆**（**流处理**），但又保留了"我可以把传送带停在某一刻、把当时所有箱子当一批处理"的能力。

论文的一句话主张：**批是有限的流**。所以一套引擎同时跑：

- `DataStream` API：处理永不结束的事件（点击日志、传感器、金融行情）
- `DataSet` API：处理有头有尾的文件（HDFS 上的一天日志）

两套 API **共享同一个 runtime**——同样的算子调度、同样的 state、同样的快照。相对当时已有的 Spark Streaming（把流切成 micro-batch），Flink 把主张反过来做成工程：**流优先，批只是有界流**。

## 为什么重要

不理解 Flink，下面这些事都没法解释：

- 为什么阿里双 11 实时大屏能做到秒级延迟还**不丢不重**（exactly-once）
- 为什么"事件发生时间"（event time）和"事件到达时间"（processing time）是两个完全不同的世界
- 为什么 Spark Streaming（micro-batch）和 Flink（持续算子）在**尾延迟**上能差一个数量级
- 为什么 1985 年 Chandy-Lamport 的快照算法 30 年后又火了一次

## 核心要点

Flink 的招牌可以拆成 **三件事**：

1. **持续算子模型**：作业被编译成一张有向图（dataflow graph），每个算子常驻、数据持续流过。**不像 Spark 把流切成 1 秒一批**。

2. **ABS 异步屏障快照**（Asynchronous Barrier Snapshotting）：source 周期性往流里**插一个 barrier**（屏障），barrier 随数据顺流而下；每个算子收到 barrier 时把自己的 state 拍快照、存对象存储，再把 barrier 转给下游。**整个过程不停机**。这是论文最核心的创新。

3. **event time + watermark**：每条事件自带"我什么时候发生"的时间戳；算子用 **watermark**（"我承诺再不会有比 t 更早的事件了"）触发窗口计算。**乱序事件、迟到事件**都有规矩可依。

三件事加起来 → **exactly-once 状态一致性**：作业崩了，从最近一次快照恢复 state，从 Kafka 对应 offset 重放数据，**对外效果像没崩过**。

## 实践案例

### 案例 1：ABS 算法两分钟版

```
Source ──▶ Map ──▶ KeyBy ──▶ Window ──▶ Sink
            ▲       ▲          ▲          ▲
         barrier 顺着流走，每个算子接到就拍 state 快照
```

- t=0：Source 在数据中**插入** barrier #1
- t=1：Map 收到 barrier → 把自己 state 拍照存 S3 → 把 barrier 转给下游
- t=2：Window 收到 → 同样拍照
- t=3：Sink 收到 → 拍照 → barrier #1 全图完成

**关键**：拍照时**算子还在处理后续数据**——异步落盘，不阻塞流。相对 [[chandy-lamport-1985]]：经典算法用 marker 对齐通道、进程本地记状态；ABS 把 barrier **嵌进 dataflow**，并让 state 异步落对象存储，专为持续算子图设计。

### 案例 2：event time 解决乱序

某用户的点击事件因网络抖动**乱序到达**：

```
到达顺序：  click@10:05 → click@10:03 → click@10:04
processing time（按到达）：会以为 10:03 是新事件 → 错
event time（按事件戳）：watermark=10:04 时触发 [10:00-10:04] 窗口 → 对
```

**watermark = "我保证不会再来比 10:04 更早的事件"**。这条承诺让 Window 算子敢闭口结算。来晚的（比如 10:02）默认丢弃，或走 **side output** 单独处理。

### 案例 3：你能感受到的 Flink 影子

如果用过 Kafka Streams 的 `windowedBy(...).grace(Duration.ofMinutes(5))`，或 Spark Structured Streaming 的 `withWatermark("ts", "10 minutes")`——**这两个 API 都是抄 Flink 的**。Flink 把 event time / watermark 这套抽象推上历史舞台后，所有后来者都跟进。

### 案例 4：一个最小 Flink 作业骨架

```java
// 1. 拿到执行环境
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

// 2. 开启 checkpoint（exactly-once 的开关）
env.enableCheckpointing(5_000);  // 每 5 秒拍一次快照

// 3. source → 算子链 → sink
env.addSource(new FlinkKafkaConsumer<>("clicks", schema, props))
   .assignTimestampsAndWatermarks(WatermarkStrategy
       .<Click>forBoundedOutOfOrderness(Duration.ofSeconds(5)))  // 容忍 5 秒乱序
   .keyBy(Click::userId)
   .window(TumblingEventTimeWindows.of(Time.minutes(1)))
   .aggregate(new CountAgg())
   .addSink(new FlinkKafkaProducer<>(...));

env.execute("hourly-clicks");
```

**关键三行**：`enableCheckpointing` 开 ABS、`assignTimestampsAndWatermarks` 承认 event time、`window` 闭口结算。这三行决定了你拿到的是不是真正的 exactly-once 流处理。

## 踩过的坑

1. **"exactly-once" 有两层**：引擎内（state 一致）容易，**端到端**（含 sink）需要 sink 支持事务（Kafka 事务消息、JDBC 两阶段提交）或幂等。新人常以为开了配置就万事大吉，写库还是会重复。

2. **watermark 不是真理**：它是**启发式承诺**。设太紧 → 迟到事件全丢；设太松 → 窗口迟迟不闭 → 延迟膨胀。生产里通常用 `BoundedOutOfOrderness(几秒~几分钟)` + side output 兜底。

3. **state 一大就慢**：RocksDB 后端把 state 落到本地磁盘，几百 GB 时 checkpoint 时间从秒级涨到分钟级。要么调 incremental checkpoint，要么砍 state TTL，要么换 keyed state 拆 key 空间。

4. **Flink ≠ Spark Streaming**：Spark 是 micro-batch（默认 200ms 一批），Flink 是持续算子。**面试常考**：低延迟场景（< 100ms）必须 Flink；只关心吞吐和批兼容生态时 Spark 也行。别混一起说。

5. **重启不等于 exactly-once**：作业失败重启会从最近一次成功 checkpoint 恢复，但**两次 checkpoint 之间已经发出去的数据**——不通过事务 sink 兜底就会重复发。新人最常翻车的地方。

6. **反压（backpressure）会沉默地拖慢一切**：下游慢 → 网络缓冲区满 → 上游被动减速。Flink 没有显式告警，只能从 metric 里看 `inPoolUsage` / `outPoolUsage`。生产先把这俩 dashboard 立起来。

## 适用 vs 不适用场景

**适用**：
- 实时数仓 / 实时大屏（双 11、广告归因、风控）
- CDC 流转下游（Debezium → Flink → 数仓）
- 需要 event time + 复杂窗口（会话窗口、超大滑动窗口）
- 有状态流计算（join 两条流、计数去重、CEP 模式匹配）

**不适用**：
- 一次性的 ad-hoc 离线分析 → Spark / Trino 更顺手
- 极简定时任务（每天跑一遍）→ Airflow + 普通脚本即可
- 强 OLTP 事务（毫秒读写）→ TiDB / CockroachDB 那条路
- 团队没人懂分布式 state → Flink 学习曲线陡，先用 Kafka Streams 起步

## 历史小故事（可跳过）

- **2009-2014 年**：柏林工业大学的 Stratosphere 项目（Volker Markl 团队），主要研究流批一体的执行引擎，DAG 调度 + 内存管理偏学术。
- **2014 年**：项目捐给 Apache，改名 Flink（德语"敏捷"）。Stephan Ewen、Kostas Tzoumas 等出来开 data Artisans 公司商业化。
- **2015 年**：Carbone 等人发表本论文（IEEE Data Eng. Bull.），同年 ABS 算法单独投 ICDE 2015。这是 Flink 第一次系统化向工业界讲清楚自己的设计。
- **2016-2019 年**：阿里收购 data Artisans → Ververica，Blink 分支合并回主干，国内大厂全面铺开。
- **2020s**：成为流处理事实标准，Beam / Kafka Streams / Pulsar Functions 都向它的抽象看齐。

## 学到什么

1. **抽象的方向决定一切**：选"批是流的特例"还是"流是批的特例"，会长出完全不同的系统。Flink 的工程优势 80% 来自这个选择。
2. **老算法 + 一点改造 = 新工业标准**：Chandy-Lamport 1985 在分布式课本里躺了 30 年；Flink 把 marker 对齐改成 dataflow 里的异步 barrier 快照，立刻变成 PB 级流处理的引擎心脏。
3. **时间是分布式系统的一等公民**：event time vs processing time 不是细节，是世界观。承认时间不可靠，用 watermark 显式建模——这是处理现实数据的成熟态度。
4. **理论 → 算法 → 工程**：1985（Chandy-Lamport）→ 2014（ABS 论文）→ 2015（开源工业系统）→ 2020s（事实标准）。又一个 30 年周期。

## 延伸阅读

- 论文 PDF：[Apache Flink: Stream and Batch Processing in a Single Engine](http://sites.computer.org/debull/A15dec/p28.pdf)（11 页，IEEE Data Eng. Bull. 2015）
- ABS 算法原论文：[Lightweight Asynchronous Snapshots for Distributed Dataflows](https://arxiv.org/abs/1506.08603)（Carbone et al., 2015，单独讲快照）
- 官方文档：[Stateful Computations over Data Streams](https://flink.apache.org/)（中文版完整，从 quickstart 到 state backend 调优）
- 视频：[Tyler Akidau — The world beyond batch](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/)（Google Beam 之父，把流处理思想史讲清楚）
- [[chandy-lamport-1985]] —— 分布式快照祖宗；ABS 把它嵌进流式 dataflow
- [[kafka]] —— Flink 上游 source replay 的实际承担者

## 关联

- [[chandy-lamport-1985]] —— 分布式快照开山之作；Flink ABS 把 barrier 嵌进算子图并异步落盘
- [[kafka]] —— Flink 端到端 exactly-once 的另一半：source 必须能按 offset 重放
- [[kildall-dataflow]] —— dataflow 思想更早的源头（编译器全局优化）
- [[calvin-2012]] —— 同样追求强一致，但选了"确定性事务"而非"快照恢复"路径
- [[spanner-2012]] —— 强一致分布式数据库；时间观（TrueTime）与 Flink 的 event time 互为镜像
- [[lamport-1978]] —— happens-before / 逻辑时钟；理解乱序与因果的前置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
