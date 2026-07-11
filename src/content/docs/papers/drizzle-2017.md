---
title: Drizzle — 让 micro-batch 也能跑出 100ms 延迟
来源: 'Venkataraman et al., "Drizzle: Fast and Adaptable Stream Processing at Scale", SOSP 2017'
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Drizzle 是 Spark Streaming 的延迟手术——**把 driver 和 executor 之间的协调频率从『每批一次』降到『每 N 批一次』**，把端到端延迟从秒级压到 100ms 量级。

日常类比：餐厅传菜。原来传菜员每上一道菜都要跑回厨房问"下一道做啥"，每次往返耽误一秒。Drizzle 让厨房一次告诉他"接下来 10 道菜是这些"，传菜员一口气端完。**做菜模型没变（还是一次一道）**，但跑腿次数少 10 倍。

放到流处理里：每个 micro-batch 处理逻辑没动，driver 只是把后续 N 个批的任务**一次性**调度下去——这套技巧叫 **group scheduling**。

## 为什么重要

2017 年之前流处理界有两派吵架：

- **micro-batch 派**（Spark Streaming）：每秒切一个小批跑，故障恢复简单（重算一批就行），但延迟卡在 0.5~2 秒——driver 每批都要发一轮调度 RPC
- **record-at-a-time 派**（Flink、Naiad）：逐条记录处理，延迟 ~10ms，但故障恢复要回放大量状态，自适应（动态调度）也代价高

大家以为这是**架构层面**的天然权衡：要低延迟就放弃 BSP，要简单恢复就接受高延迟。

Drizzle 捅破了这个假设——**瓶颈不是『批 vs 流』，是『协调频率』**。把协调成本摊到 N 个批上，micro-batch 也能压到百毫秒级。后续 Spark Structured Streaming 的 continuous processing 等路线，同样在抠「处理间隔」和「协调间隔」能不能拆开——Flink 本身早已是 continuous operator，并不是从 Drizzle 才学会低延迟。

## 核心要点

Drizzle 的三个动作：

1. **Group scheduling**：driver 一次性把后续 N 个 micro-batch 的任务全部发给 executor。N=10 时，**每个批只摊到 1/10 的调度开销**。N 越大延迟越低，但故障重做窗口越大——典型 N 取 10~100。

2. **Pre-scheduled shuffle**：原版 Spark 每批都要做一次 shuffle barrier（reducer 等所有 mapper 完成后再去拉数据）。Drizzle 让 mapper 提前知道 reducer 的位置，**reducer 主动 pull 而不是被动等**——省掉每批一次的协调 RPC。

3. **Adaptive group size**：观察延迟波动自动调 N。工作负载稳定时 N 调大（拿延迟），波动大时 N 调小（保故障恢复速度）。

底层模型仍然是 **BSP（Bulk Synchronous Parallel）**——一个 group 内每批之间还是有同步点，只是同步点的『协调成本』被摊薄了。

三个动作之间的分工：

- group scheduling 解决『driver 调度太频繁』
- pre-scheduled shuffle 解决『shuffle barrier 太频繁』
- adaptive group size 解决『N 怎么选』

少一项整体延迟降不下来——这是工程上的成套打法，不是单点优化。故障恢复仍走 BSP 原有的协调式 checkpoint，重做粒度是一个 group 而不是单批，比 record-at-a-time 系统的状态回放快很多。

## 实践案例

### 案例 1：协调成本到底贵在哪

Spark Streaming 跑一个 100ms 批的内部时间分布大概是：

```
任务调度发送（driver → executor）   ~50ms
shuffle barrier RPC                ~20ms
实际计算                            ~30ms
结果回收                            ~20ms
总计                               ~120ms
```

**协调（70ms）比计算（30ms）还贵**。Drizzle 把前两项摊到 N=10 个批上，每批只剩 7ms 协调，端到端做到 100ms 以下。

### 案例 2：group scheduling 是怎么发的

伪代码示意：

```python
# 原版 Spark Streaming
for batch in stream:
    tasks = scheduler.plan(batch)         # 每批一次
    executor.run(tasks)                   # 每批一次 RPC
    wait_shuffle_barrier()

# Drizzle
for group in stream.grouped(N=10):
    plans = [scheduler.plan(b) for b in group]
    executor.run_group(plans)             # 一次 RPC 发 N 批
    for batch in group:
        wait_lightweight_barrier()        # 本地、无 driver 介入
```

driver 的 RPC 次数从 N 次降到 1 次，**网络往返被均摊**。

### 案例 3：和 Flink 的 Yahoo Streaming 对比

论文 SOSP 2017 实验：Yahoo Streaming Benchmark（广告点击窗口聚合），**128** 台 EC2 r3.xlarge，约 20M events/s。

- **未开 micro-batch 内优化**：Drizzle 中位延迟约 **350ms**，与 Flink 同档，比 Spark 约 **3.6×**（论文 Figure 6）
- **开了批内聚合优化后**：Drizzle 可压到 **<100ms**，并在同延迟目标下吞吐高于 Spark/Flink（论文 Figure 8；此时 Drizzle 可比 Flink 更快）
- **故障恢复**：杀一台机器后，Drizzle 恢复约比 Flink **快 4×**，恢复期间延迟也更低（论文 Figure 7）

要点：低延迟不是「永远比 Flink 慢一截」，而是协调摊薄 + 批内优化后，BSP 也能进百毫秒档，同时保住并行恢复。

## 踩过的坑

1. **N 不是越大越好**：N 大延迟低但故障重做窗口拉长。一个 group 中途挂了要从头重做整组，N=100 时可能多算 10 秒数据。生产环境 N 一般 10~30。

2. **预调度依赖稳态假设**：group scheduling 提前发了 N 批的执行计划。如果上游数据分布在这 N 批内突然变了（hot key、skew 突增），原计划不再最优。论文的 adaptive group size 只调 N，不调 plan。

3. **弹性扩缩容打破 pre-scheduled shuffle**：reducer 位置一旦变（加节点、挂节点），mapper 缓存的下游地址全失效，整组要重新发计划。流任务不像批任务能容忍几秒空档。

4. **BSP 没根治 straggler**：一个 group 内只要一个 task 慢，整批等它。Drizzle 没解决这个，留给后续工作（speculative execution、microtasking）。

## 适用 vs 不适用场景

**适用**：

- 已经在用 Spark Streaming 但延迟卡 1 秒不够用——直接换 Drizzle 改善 10 倍
- 流式 ML 训练（mini-batch SGD）：每 mini-batch 是天然的 group 边界
- 数据稳态、节点稳态的长跑流任务（监控指标聚合、广告点击流）

**不适用**：

- 端到端 < 50ms 硬要求（金融高频）→ 还是要 record-at-a-time（Flink/Naiad）
- 上游数据分布频繁突变 → 预调度计划频繁失效，N 只能调到很小
- 需要『一条记录到达就立即吐结果』的语义 → BSP 模型本身不支持

## 历史小故事（可跳过）

- **2013**：Zaharia 等人发表 dstreams-2013，提出 micro-batch 是『流处理 + Spark RDD』的简单融合，延迟接受秒级
- **2013-2015**：Naiad（MSR）和 Flink 用 record-at-a-time 把延迟做到 10ms 级，业界开始觉得 micro-batch 没希望
- **2017**：UC Berkeley AMPLab + Databricks 团队（Spark 主创那波人）用 Drizzle 反击——不是模型问题，是协调频率问题
- **2018 之后**：Spark Structured Streaming 引入 continuous processing，思路上也在拆「处理」与「协调」；业界对 micro-batch 的延迟上限看法随之松动

故事的内核：**老架构往往不是输在模型，是输在没人去抠协调成本**。

## 学到什么

1. **延迟瓶颈未必在算力**——很多时候是调度、协调、barrier 这些『元开销』。先 profile 再优化
2. **批 vs 流不是非此即彼**：把批的粒度调细 + 协调摊薄 = 流；把流的处理打包 = 批。两者是连续谱
3. **BSP 仍然有空间**：BSP 模型简单、恢复快、推理容易，与其抛弃不如优化它的同步点成本
4. **调度成本可以分摊**：N 次 RPC 合成 1 次的思路在 RPC、批处理、IO 等场景都通用（参见 [[bigtable-2006]] 的批量写）
5. **架构论战要警惕"模型决定一切"**：micro-batch vs record-at-a-time 吵了几年，结果发现一边的『硬伤』只是工程没抠到位

## 一句话总结

把 driver 的协调成本从『每批一次』摊到『每 N 批一次』，micro-batch 模型也能做到 100ms 端到端延迟——**瓶颈是协调频率，不是模型本身**。

## 延伸阅读

- 论文 PDF：[Drizzle SOSP 2017](https://shivaram.org/publications/drizzle-sosp17.pdf)（14 页，实验充分）
- 一作 Shivaram Venkataraman 的演讲视频：搜 "Drizzle SOSP 2017 talk" 有 25 分钟讲解
- [[dstreams-2013]] —— Spark Streaming 原作，理解 micro-batch 起点
- [[naiad-2013]] —— record-at-a-time 阵营代表，对比基线
- [[flink-snapshots-2015]] —— Flink 异步快照，理解低延迟系统的故障恢复
- [[dataflow-model-2015]] —— Google Dataflow，批流统一的概念框架

## 关联

- [[dstreams-2013]] —— Drizzle 是 D-Streams 的延迟优化继任者
- [[naiad-2013]] —— record-at-a-time 阵营，Drizzle 想追平的延迟基线
- [[flink-2015]] —— 同期低延迟流处理代表
- [[flink-snapshots-2015]] —— 故障恢复对比基线
- [[dataflow-model-2015]] —— 批流统一思路的更高层抽象
- [[millwheel-2013]] —— 早期低延迟流系统，影响了 Dataflow 模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
