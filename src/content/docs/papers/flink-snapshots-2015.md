---
title: Flink 异步快照 — 不停机给流处理拍一致照片
来源: Carbone et al., "Lightweight Asynchronous Snapshots for Distributed Dataflows", arXiv:1506.08603, 2015
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

这篇论文提出了 Apache Flink 用来做**故障恢复**的快照算法。日常类比：你在拍一张全家福，但每个人都在动——你要让快门按下的瞬间所有人**像同一刻被冻住**，事后能从这张照片把场景"重新开始"。

流处理系统里的"全家福"叫**全局一致快照**：把所有算子的状态、所有飞行中的消息，凑成一个"假装在某一时刻同时停下来"的截面。有了它，机器挂了重启时就能从最近一次快照接着算——输入会从 checkpoint 位点重放，但靠状态恢复做到**不丢不重（exactly-once）**，而不是"什么都不重算"。

经典做法是 Chandy-Lamport 1985（[[chandy-lamport-1985]]），它需要把飞行中的消息也录下来。本论文的核心贡献是：在**无环数据流图**上，飞行中的消息可以**完全不录**——只需要存算子状态。

## 为什么重要

不理解这个算法，下面这些事都没法解释：

- 为什么 Flink 敢说自己是 **exactly-once**（每条数据精确处理一次，不丢不重）
- 为什么 Spark Streaming 是 micro-batch（停一下攒一批再算）而 Flink 是真流——靠的就是这个算法允许"边跑边拍照"
- 为什么 Kafka Streams、Pulsar Functions 后来都抄了"屏障"这个概念
- 为什么 Flink 的 checkpoint 有时候会"卡一下"——alignment 在等慢通道

简单说：现代主流流处理框架的 exactly-once 语义，工程上几乎都是这篇论文的变体。

## 核心要点

### 关键道具：屏障（barrier）

把"快照请求"想象成一张**带编号的卡片**，从源头算子（Source）开始顺着数据流往下传。这张卡片就是 barrier，编号 n 表示"这是第 n 次快照"。

每张卡片做一件事：**把数据流切成"卡片之前"和"卡片之后"两段**。

### 三步操作

1. **Source 注入 barrier**：周期性（比如每 10 秒）向所有下游通道发 barrier n。
2. **下游算子做 alignment**：算子有多个输入通道时，谁先收到 barrier n 就把那条通道**暂时阻塞**，等所有输入通道的 barrier n 都到齐。
3. **拍照 + 转发**：所有 barrier n 到齐 → 算子把自己的状态写到持久存储 → barrier n 继续转发给下游。

Sink 收到所有 barrier n → 这次 epoch 的全局快照完成。

### 为什么飞行消息可以不录

关键观察：**barrier 是数据流里的一根分界线**。

- 任何在 barrier n 前面的消息，到达下游时一定已经被吸收进当前 epoch 的状态里——已经"在照片里"了，不需要再单独录。
- 任何在 barrier n 后面的消息，属于 epoch n+1，不该出现在这张照片里。

所以只需要存算子状态。这就是和 Chandy-Lamport 最大的区别——CL 需要把每条通道在 marker 前后飞行的消息也记录下来，本算法把这部分省了。

## 实践案例

### 案例 1：一个简单的两路 join

假设有两个 Source A、B，下游一个 Join 算子。

```
A ──┐
    ├── Join ── Sink
B ──┘
```

执行流程：

1. Source A 发出 `barrier-7`，Source B 也发出 `barrier-7`
2. Join 先收到 A 的 barrier → 阻塞 A 通道，继续从 B 通道读消息（这些 B 消息属于 epoch 7，要算进去）
3. Join 也收到 B 的 barrier → 此时两边对齐，Join 把自己的状态（所有未匹配的 A 行和 B 行）写盘
4. Join 把 barrier-7 转给 Sink
5. Sink 也对齐后写盘，epoch 7 完成

### 案例 2：故障恢复

Job 跑到 epoch 12 时某台机器挂了：

1. Job manager 检测到失败
2. 重启所有算子，每个算子从最近一次完成的快照（比如 epoch 11）加载状态
3. Source 也回滚——重新从 epoch 11 时记录的 offset 开始读消息
4. 数据流重新开始，从 epoch 11 之后所有事件都会被精确重放一次

外部观察者看到的效果：**像没挂过一样**。

### 案例 3：有环图怎么办

迭代计算（比如图算法、机器学习训练）会有环：

```
Op1 ── Op2 ──┐
 ↑           │
 └───────────┘
```

环边的飞行消息**确实**可能跨 epoch，无法简单忽略。算法用 **downstream logging**：环边的下游算子在 alignment 期间把环边收到的消息记录到一个 log，故障恢复时把这个 log 重放回去补上。

这是无环情形最优雅简化的代价——有环时部分回到了 Chandy-Lamport 的思路。

## 踩过的坑

1. **alignment 不是免费的**：一条慢通道（数据倾斜、反压）会阻塞所有快通道，整个 checkpoint 时间被拉到木桶最短板。生产中 checkpoint 超时常见根因就在这。

2. **状态特别大时全量快照很慢**：算子状态几十 GB 时全量写 HDFS 不现实。Flink 后来用 RocksDB 增量快照——只写改动的 SST（Sorted String Table，排序字符串表）文件，老文件复用。

3. **exactly-once 不是端到端的**：算法只保证 Flink 内部的 exactly-once。如果 Sink 是 Kafka 或外部数据库，还需要两阶段提交（two-phase commit Sink）才能做到端到端不重复。

4. **alignment 阻塞 → unaligned checkpoint**：Flink 1.11 引入 unaligned checkpoint：不阻塞快通道，把飞行消息也存进快照。这相当于**部分回到 Chandy-Lamport**——用空间换时间。

## 适用 vs 不适用场景

**适用**：

- 长时运行的流处理 Job 需要 exactly-once 语义
- 算子状态可控（几十 MB 到几 GB）
- 数据流以无环 DAG 为主，少量环

**不适用**：

- 算子状态超大（TB 级）→ 用增量快照 + 分层状态后端
- 严重数据倾斜 + 严格延迟要求 → 用 unaligned checkpoint
- 一次性批处理 → 直接重跑就行，不需要快照

## 历史小故事（可跳过）

- **1985 年**：Chandy 和 Lamport 发表分布式快照算法，奠定理论基础——但要存飞行中消息。
- **2014 年**：Flink 早期版本（Stratosphere 出身）需要一种能落地的 exactly-once 方案。
- **2015 年**：Carbone 等人在 KTH + data Artisans 合作发表本算法，把 Chandy-Lamport 在无环图上简化成"只存算子状态"。Flink 0.9 同年落地。
- **2020 年**：FLIP-76 引入 unaligned checkpoint，把飞行消息也存进去——绕了一圈又用回了 CL 的核心思想，但只在需要时才用。

## 学到什么

1. **加约束往往能简化算法**：CL 通用（任何拓扑），本算法限制为无环图就把"飞行消息记录"消掉了。工程里愿意接受拓扑限制换简化是常见取舍。
2. **屏障是流处理的"时钟"**：barrier 是"在数据流里插标记"的工程手法；Flink 的 watermark / event time 也用同类流内标记（思想同源更多来自 Dataflow 系，不必归因到本篇）。
3. **alignment 的代价要被看见**：每个工程化的算法都有隐藏代价。alignment 是 Flink checkpoint 不稳定的根源之一，理解它才能调参。
4. **理论 → 工程 → 再退化**：Flink 1.11 的 unaligned checkpoint 等于"在需要时退回到 Chandy-Lamport"——好的工程系统不是死守一个算法，而是知道什么时候用哪种。

## 延伸阅读

- 论文 PDF：[arXiv:1506.08603](https://arxiv.org/abs/1506.08603)（10 页，密度适中，比经典 Chandy-Lamport 好读）
- Flink 官方文档：[Stateful Stream Processing](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/)（看 Checkpointing 章节）
- 博客：[Flink Forward — A Deep Dive into Rescalable State](https://flink.apache.org/2017/07/04/flink-rescalable-state.html)（讲快照在 rescaling 时的角色）
- [[chandy-lamport-1985]] —— 全局快照的理论始祖，本算法的简化对象
- [[lamport-clocks]] —— 分布式系统里"事件先后"的基础，barrier 是它的工程化体现

## 关联

- [[chandy-lamport-1985]] —— 经典分布式快照，本算法把它在无环图上简化
- [[kafka-2011]] —— Flink 最常见的 Source/Sink，端到端 exactly-once 的另一半
- [[spanner-2012]] —— 同样要解决"分布式一致截面"，Spanner 用 TrueTime，本算法用 barrier
- [[paxos]] —— 分布式共识基础，checkpoint 元数据协调常用类似思想
- [[mapreduce]] —— 批处理的 fault tolerance 是重跑，流处理选了快照路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[delta-lake-2020]] —— Delta Lake 2020 — 给对象存储补上事务日志
- [[distributed-snapshot-byzantine-2026]] —— Byzantine Linearizability — 让拜占庭客户端也像排队办业务
- [[drizzle-2017]] —— Drizzle — 让 micro-batch 也能跑出 100ms 延迟
