---
title: Dataflow Model — 流处理的四问框架
来源: 'Akidau et al., "The Dataflow Model", VLDB 2015 (Google)'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Dataflow Model 是 Google 2015 年提出的**一套把流处理拆成四个独立问题**的思考框架。日常类比：以前做菜，"菜谱 / 上菜时间 / 备料窗口 / 客人退菜怎么办"全揉成一锅粥；这篇论文把这四件事**单独拎出来**，每件都能独立调，组合起来满足任何场景。

四个问题分别是：

- **What**：算什么（求和？计数？平均？）
- **Where**：在事件时间的哪个**窗口**里算（每分钟？每个会话？）
- **When**：什么时候**输出**结果（数据到齐了？等不及先出一版？）
- **How**：后续晚到的数据来了，**怎么修正**已发出的结果

把这四个问题分开，工程师可以按需在**正确性 / 低延迟 / 低成本**三角之间精细取舍。这套模型后来变成 **Apache Beam**，并深刻影响了 **Flink** 和 **Spark Structured Streaming**。

## 为什么重要

不理解这套模型，下面这些事都没法解释：

- 为什么"事件时间"（event time）和"处理时间"（processing time）必须分开——同一个事件会两次出现在不同时间轴
- 为什么 2015 年前**Lambda 架构**（批+流双跑）那么流行又那么痛——因为没人把"延迟"和"修正"分开
- 为什么 Flink 的 watermark / trigger / allowed lateness 三个旋钮长得这么复杂——它们各自管 When 和 How
- 为什么"会话窗口"（session window）只有事件时间下才有意义

## 核心要点

模型的核心是**四个正交的问题**，每个问题都有独立的 API：

1. **What → transformations**：`ParDo` / `Combine` 这种纯计算算子。和批处理一样，定义"对每条记录做什么"。

2. **Where → windowing**：在**事件时间**上把无界流切成有限片段。三种典型窗口——
   - **固定窗口**（每 5 分钟一段）
   - **滑动窗口**（每 1 分钟出一个含过去 5 分钟的结果）
   - **会话窗口**（按 key 的活动间隙动态合并，比如"用户连续点击 30 分钟内算一次会话"）

3. **When → triggers + watermarks**：
   - **watermark**（水位线）：系统对"事件时间进度"的估计——"我认为 12:00 之前的数据都到齐了"
   - **trigger**（触发器）：在 watermark 之前可以**早发**（猜测结果）、watermark 到时**准时发**、之后再来数据可以**晚发**修正

4. **How → accumulation**：晚到的数据修正窗口结果时，三种模式——
   - **discarding**（丢弃旧值，下游自己累加）
   - **accumulating**（直接覆盖，给出最新累计值）
   - **accumulating + retracting**（先发"撤回上次的"再发新值，下游不会重复加）

四个轴**完全独立**——你可以"会话窗口 + 早触发一次 + 撤回式累加"，也可以"固定窗口 + 只准时触发 + 直接覆盖"。

## 实践案例

### 案例 1：移动游戏分数榜

需求：每个玩家每个会话的总分实时显示，玩家断线后 30 分钟会话结束。

- **What**：`Sum(score)` 按 user_id 聚合
- **Where**：会话窗口，gap = 30 min（事件时间）
- **When**：watermark 到时输出 + 每 1 分钟早触发一次（让玩家中途看到当前总分）
- **How**：accumulating + retracting（中途的"暂时分"会被新值取代，不会重复加）

### 案例 2：广告点击计费

需求：每小时统计每个广告的点击数，但**绝不能多算**（钱要付得准）。

- **What**：`Count()` 按 ad_id
- **Where**：固定 1 小时窗口（事件时间）
- **When**：**只**等 watermark 到了再输出（容忍延迟，换正确性）
- **How**：discarding（每小时只发一次最终值）

延迟换正确性，这个组合就是经典批处理思路，但跑在流引擎上。

### 案例 3：实时大屏（早期猜测）

需求：双 11 大屏要"秒级"看到实时 GMV，但最终对账要准。

- **What**：`Sum(amount)`
- **Where**：当天的 24 小时大窗口
- **When**：每秒一次早触发 + watermark 准时触发 + 允许 1 小时晚到
- **How**：accumulating（一直覆盖最新值）

大屏看到的数会持续增长并最终精确收敛——这正是论文展示的"延迟可调 + 正确性最终达成"。

## 踩过的坑

1. **混淆事件时间和处理时间**：把 `processing time` 窗口当业务窗口用，回填历史数据时结果完全不一样。论文反复强调：业务永远只关心**事件时间**。

2. **watermark 是启发式的**：它**永远可能错**——总有比 watermark 还晚的"超晚到数据"。必须配合 `allowed lateness` 决定多久后彻底丢弃。

3. **session window 状态体积**：会话窗口会随新数据动态合并，状态可能无限膨胀。要设 `gap` 合理 + 定期清理。

4. **trigger 组合爆炸**：早触发 + 准时 + 晚触发 + 三种 accumulation = 9 种组合，新人很容易选错。论文给了**判定树**：先想"能容忍多少延迟"，再想"晚到怎么处理"。

5. **以为 Dataflow 是引擎**：它**只是一套模型**——具体怎么调度、怎么容错、怎么 exactly-once，论文留给 MillWheel 那篇讲。新人常把"Dataflow Model 论文"当系统论文读，就会觉得空洞。

## 适用 vs 不适用场景

**适用**：

- 无界数据流，且事件**会乱序**到达（绝大多数真实场景）
- 既要低延迟早出结果、又要正确性最终收敛
- 流批一体（论文论点："批是有限的流"）

**不适用**：

- 严格"恰好一次 + 零延迟"——物理不可能，要么牺牲延迟要么接受最终一致
- 数据完全有序到达——退化为批处理，杀鸡用牛刀
- 不关心事件时间（纯监控指标）——`processing time` 简单窗口就够

## 历史小故事（可跳过）

- **2010 年**：Google FlumeJava 论文，把批处理 pipeline 写成 Java，提供 `ParDo` / `Combine` 等算子
- **2013 年**：MillWheel 论文，Google 内部第一个能做 exactly-once + 事件时间 watermark 的流处理引擎
- **2015 年**：Akidau 等把 FlumeJava 的批 SDK + MillWheel 的流引擎统一成一个 SDK，发表 Dataflow Model 论文
- **2016 年**：Google 把这套 SDK 捐给 Apache，改名 **Apache Beam**——Beam 名字来自 **B**atch + str**eam**
- 同期 Flink 团队读了论文后，把 watermark / event time / trigger 全搬进 DataStream API，开源世界第一个真正落地

## 学到什么

1. **正交分解是设计的圣杯**：把混在一起的问题拆成 4 个独立轴，每个轴单独能调，组合空间瞬间打开
2. **事件时间是唯一可信的业务时钟**：处理时间会随重启、回填、追赶而变，事件时间是数据自己带的
3. **正确性 / 延迟 / 成本不是二选一**：通过 trigger + accumulation 组合，可以在三角内任意点
4. **理论 → 引擎 → 生态**：MillWheel（引擎）→ Dataflow（模型论文）→ Beam（SDK）→ Flink/Spark 跟进，5 年一代
5. **"模型论文"价值**：好的模型论文不是讲怎么实现，而是给后来人一套**说话方式**——What/Where/When/How 这四个词成了行业共同语言，工程师之间沟通成本骤降

## 与 Lambda 架构的对比

2010 年代前期主流方案是 Nathan Marz 的 **Lambda 架构**：批层（Hadoop）算精确结果 + 速度层（Storm）算近似结果 + 服务层把两者拼起来。问题：

- 同一份业务逻辑要写**两遍**（批一份、流一份），改一处忘了另一处就出 bug
- 维护两套集群，成本翻倍
- 拼接层处理"批迟到、流早到"边界 case 极其复杂

Dataflow Model 主张：**只用一个流引擎**，通过 trigger（早触发=速度层职能）+ watermark（准时触发=批层职能）+ accumulation（修正）就能在单引擎内同时拿到两个层的效果。这就是 **Kappa 架构**的理论基础。

## 延伸阅读

- 论文 PDF：[The Dataflow Model VLDB 2015](https://research.google.com/pubs/archive/43864.pdf)（13 页，密度高）
- 博客：[Streaming 101 / 102 by Tyler Akidau](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/)（论文作者写的科普版，强烈推荐先读）
- 书：《Streaming Systems》（Akidau 等著，论文的章节扩展版）
- [[flink-2015]] —— 把这套模型最早工程化的开源引擎
- [[kafka]] —— 流处理上游消息总线

## 关联

- [[flink-2015]] —— Flink 的 watermark / event time / trigger 直接来自这篇论文
- [[kafka]] —— Dataflow / Beam pipeline 上游通常是 Kafka topic
- [[kildall-dataflow]] —— 同名"dataflow"但完全不同：Kildall 1973 是编译器静态分析框架；这篇是分布式流处理模型
- [[bigtable-2006]] —— 同为 Google 数据基建论文，但批/在线键值视角

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[differential-datalog]] —— DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
- [[drizzle-2017]] —— Drizzle — 让 micro-batch 也能跑出 100ms 延迟
- [[dstreams-2013]] —— D-Streams — 把流处理伪装成一串很小的批
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[millwheel-2013]] —— MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机
- [[naiad-2013]] —— Naiad — 一套引擎同时跑批处理、流处理和迭代计算
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析

