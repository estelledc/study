---
title: Naiad — 面向流式数据的及时数据流系统
来源: 'Murray, McSherry, Isaacs, Isard, Barham, Abadi, "Naiad: A Timely Dataflow System", SOSP 2013'
日期: 2026-07-08
分类: 分布式系统
难度: 中级
---

## 是什么

Naiad 是 Microsoft Research 在 SOSP 2013 发表的数据处理引擎，核心模型叫 **timely dataflow（及时数据流）**。日常类比：流水线上每个零件都贴着「第几批、第几轮」的标签；工位不是傻等整批到齐才开工，而是边流边算——当系统确认「这一批这一轮不会再有零件进来」时，才敲钟允许输出最终结果。

以前三件事常拆三套系统：批处理（MapReduce）、低延迟流（Storm）、迭代图计算（Pregel）。Naiad 用**同一张可含环的数据流图**把它们统一：每条记录带多维逻辑时间戳，算子靠时间戳判断何时能安全吐出答案。

## 为什么重要

不理解 Naiad，下面这些事都不好串起来：

- Flink 的 watermark / frontier 为什么长那样——它是 timely 进度思想的工业简化版
- Materialize 为何能做低延迟增量视图——底座 Differential Dataflow 是 Naiad 思想的 Rust 重写
- Spark Structured Streaming 后来为何补 event time——Naiad 一开始就把「时刻收齐」说清楚了
- 「micro-batch」和「true streaming」吵了十年——Naiad 给出第三条路：per-record 流动 + 精确进度关闭

## 核心要点

1. **多维时间戳**：记录带 `(epoch, loop_iter)`。epoch = 第几批输入，loop_iter = 环里第几轮。两者构成**偏序**，所以「第 5 批第 3 轮」能和别的 epoch 并发推进，而不是全球一个总时钟。

2. **pointstamp 进度追踪**：算子持有 capability（「我还可能发出时间戳 t 的消息」）。全局统计每个 pointstamp 未完成计数；当 t 归零，所有人知道「t 彻底关闭」，可以放心做最终输出。

3. **有状态算子 + notification**：算子可攒状态；当某时刻数据收齐，系统发 notification 叫醒它输出。这是闭合循环图的关键——没有「收齐」信号，迭代不知道何时收敛可出。

三点合起来才是 timely dataflow，而不只是「带时间戳的流」。

和同代系统对照（记一张表就够）：

| 系统 | 主打 | 循环 | 进度模型 |
|------|------|------|----------|
| MapReduce | batch | 外层重跑 | job 完成 |
| Storm | streaming | 基本不支持 | 无精确收齐 |
| Spark Streaming | micro-batch | 外层循环 | 批边界 |
| Pregel | 图迭代 | 一等公民 | superstep |
| **Naiad** | **三合一** | **一等公民** | **pointstamp 偏序** |

## 实践案例

### 案例 1：进度关闭 vs 小批次 barrier

Spark Streaming 把流切成固定小批，**批边界 = 进度**。简单，但延迟下限绑死批长，环图难写。

```
Spark:  [batch N] | [batch N+1] | ...
                  ↑ 全局 barrier
Naiad:  rec(t=5) → rec(t=5) → rec(t=6) → ...
        后台协议：「t=5 未完成计数 → 0 则关闭 t=5」
```

跟做三步：

1. 记录带着逻辑时间立刻下流，不做「等这一秒结束」
2. 每个 worker 维护 pointstamp 未完成计数，变化要广播
3. 当某 `t` 全局归零，才允许「最终结果」类输出（关窗、写 sink）

### 案例 2：PageRank 环图

```
input → enter_loop → compute → exit_loop → output
                       ↑          │
                       └──────────┘  loop_iter += 1
```

每走一圈回边，`loop_iter` +1。系统预先算 path summary（路径上时间戳怎么变），算子能判断「还有没有更小时间戳可能从环里转回来」。

对比 Spark：外层 Python/Scala 循环每轮启一个新 job，shuffle 落盘再读，开销随轮数涨。Naiad 把循环嵌进 dataflow，**没有 job 启停税**。论文在百节点规模下相对 Spark 可快一个数量级量级——重点是模型，不是微基准刷分。

### 案例 3：capability 下放 = 关窗

算子捏着「可能发 t=5」的 capability 时，下游必须继续等。它 downgrade/drop 掉 t=5 后，全局计数减一；所有 t=5 capability 放完，t=5 关闭——下游才 emit 窗口最终结果。

迟到数据若仍属未关闭时刻，按时间戳进状态；若时刻已关闭，就要按策略丢弃或进旁路，而不是 silently 当新事实。工程口诀：**先查时间维度，再加机器**。

## 踩过的坑

1. **C# / .NET 生态门槛**：参考实现绑 .NET，大数据圈当时不熟；论文火了但线上少。McSherry 后来用 Rust 重写 timely-dataflow，才有第二春。
2. **进度协议本身会成瓶颈**：worker 要广播 pointstamp 变化，集群一大协议开销明显；论文规模到数百核已吃力。
3. **容错偏粗**：重点在模型与性能，恢复多靠整图 checkpoint，粒度不如后来 Flink 的分布式快照。
4. **把 arrival order 当逻辑时间**：迟到事件会污染窗口；必须按记录时间戳 + 关闭语义处理。
5. **迭代不设收敛/上限**：环图是能力也是风险——无 `max_iter` / 收敛条件会把 CPU 与状态打满。

## 适用 vs 不适用场景

**适用**：

- 既要秒级/亚秒更新，又要迭代或增量重算（实时图、增量 ML）
- 需要精确「时刻 t 收齐」语义，而不是粗批边界（例如对账窗口必须可解释）
- 读现代流引擎源头：再看 Flink / Materialize 会突然通
- 原型验证 timely / differential 思想（今天更常直接用 Rust timely 生态）

**不适用**：

- 纯离线 ETL（Spark / Trino 更省心）
- 无迭代、只要简单 watermark 窗口（直接用 Flink/Beam）
- 团队无法运维分布式进度与状态（调试成本高）
- 强金融级细粒度容错优先（选 Flink checkpoint 生态）

## 历史小故事（可跳过）

- **2010 前后**：批、流、迭代三套栈并行，跨栈组合又慢又难维护。
- **2013**：Murray / McSherry / Isaacs / Isard / Barham / Abadi 在 SOSP 发表 Naiad，timely dataflow 把三合一说清楚。
- **2014–2016**：MSR 项目收束后，timely / differential 在 Rust 开源社区续命。
- **2019 至今**：Materialize 等把增量视图产品化；Flink 等公开吸收 watermark/iteration 思路。

之后很多「新流引擎」其实是在还 Naiad 当年挖的概念债。读论文时抓住三词就够：**timestamp、capability、notification**。

## 学到什么

1. **统一语义比堆系统品牌更值钱**——批/流/迭代可以共享一张图。
2. **进度 ≠ 批边界**——per-record 流动与「时刻关闭」可以共存。
3. **时间戳可以是偏序**——epoch × loop 才能让环图讲得通。
4. **capability 是协调原语**——声明「还可能发 t」，全局才能无锁推进。
5. **论文影响力看徒孙**——Naiad 商业上不红，但 Flink watermark / Materialize 证明概念赢了。
6. **状态要能解释自己**——窗口抖动时先问「哪个时刻还没关闭」，不要先加机器。

## 延伸阅读

- 论文 PDF：[Naiad: A Timely Dataflow System (SOSP 2013)](https://www.microsoft.com/en-us/research/wp-content/uploads/2013/11/naiad_sosp2013.pdf)
- Rust 实现：[timely-dataflow](https://github.com/TimelyDataflow/timely-dataflow)
- 增量层：[differential-dataflow](https://github.com/TimelyDataflow/differential-dataflow)
- 产品化：[Materialize docs](https://materialize.com/docs/)
- [[stream-processing]] —— 流处理与状态管理

## 关联

- [[batch-vs-stream]] —— 批流模型如何被统一语义收编
- [[incremental-compute]] —— 增量替代全量重算
- [[flink-2015]] —— watermark / 状态流的工业大头
- [[dataflow-model-2015]] —— 同代 Google Dataflow 窗口模型
- [[differential-datalog]] —— 建在 timely 上的增量 Datalog 路线
- [[naiad-2013]] —— 同论文另一篇笔记入口（模型对照时可一起读）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flink]] —— 现代流引擎在状态与窗口上延续该路线
- [[spark-structured-streaming]] —— 与实时语义对齐的方法
- [[beam]] —— 统一模型在其他生态里的实现
- [[storm]] —— 经典流引擎与及时流的分野
- [[materialize]] —— 增量视图与可解释状态

读完若只记一句：Naiad 教你用逻辑时间把「还在算」和「可以定稿」分开。
