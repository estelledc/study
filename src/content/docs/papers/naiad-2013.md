---
title: Naiad — 一套引擎同时跑批处理、流处理和迭代计算
来源: Murray, McSherry, Isaacs, Isard, Barham, Abadi, "Naiad: A Timely Dataflow System", SOSP 2013
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Naiad 是 Microsoft Research 2013 年做的一套数据处理引擎，它的核心创新叫 **timely dataflow（带时刻的数据流）**。日常类比：像一条**会自己打钟点**的流水线——每个零件经过工位时身上都贴着「我属于第几批、第几轮」的标签，工位看够了同一批的所有零件就敲钟说「这一批做完了」，然后把成品发出去。

以前要做三件事得用三套不同的系统：

- **批处理**（一次算一大堆历史数据）→ MapReduce / Dryad
- **流处理**（数据来一条算一条）→ Storm / Spark Streaming
- **迭代计算**（一直循环算到收敛，比如 PageRank）→ Pregel / GraphLab

Naiad 第一次把这三件事**塞进同一个模型**：每条数据带一个**多维时间戳**（epoch 第几批 + loop counter 第几轮），算子靠这个时间戳判断「现在能不能输出最终结果」。

## 为什么重要

不理解 Naiad，下面这些事都没法解释：

- 为什么 Apache Flink 的 watermark（水位线）长那个样——它是 Naiad **frontier** 的简化版
- 为什么 Materialize 这种「streaming SQL 数据库」突然能做到亚毫秒延迟还能跑增量计算——它的底座 Differential Dataflow 是 Naiad 的 Rust 重写
- 为什么 Spark Structured Streaming 后来要费力造 watermark / event time——Naiad 一开始就把这事算清楚了
- 为什么「micro-batch（小批次）」和「true streaming（真流式）」吵了 10 年——Naiad 给出第三条路

## 核心要点

Naiad 模型可以拆成 **三个机关**：

1. **多维时间戳**：每条记录带一个 `(epoch, loop_iter)`。epoch 表示「第几批输入」，loop_iter 表示「第几轮循环迭代」。两个维度合起来构成一个**偏序**（不是全序）——这样既能讲清楚「第 5 批的第 3 轮」，也能讲清楚不同 epoch 之间的并发。

2. **pointstamp 进度追踪**：每个算子持有「能力（capability）」，说明它**还可能**发出哪些时间戳的消息。系统全局统计每个 pointstamp 还剩多少消息没处理完——当某个时间戳 `t` 的全局计数归零，所有人都知道「`t` 这一刻彻底关闭了」。

3. **stateful vertex + notification（有状态算子 + 通知）**：算子可以攒着状态等数据来。当某个 epoch 的数据全部到齐，系统叫醒算子说「该输出了」。这是闭合『循环图』的关键——没这个，迭代计算就不知道什么时候该停。

三件事加起来叫 **timely dataflow**。

## 实践案例

### 案例 1：Naiad 跟 Spark Streaming 的根本区别

Spark Streaming 的做法：把流切成 1 秒一个的小批次，**每批结束 = 进度推进**。简单粗暴，但延迟下限就是批长度，循环计算很难写。

```
Spark:  [batch N] [batch N+1] [batch N+2] ...
                   ↑
                   每个 ] 是一次全局 barrier
```

Naiad 的做法：记录立刻往下流，进度信号**异步**追踪。

```
Naiad:  rec1(t=5) → rec2(t=5) → rec3(t=6) → ...
        进度协议在背后跑：「t=5 还有几条没处理？0 → 关闭 t=5」
```

结果：per-record 低延迟 + 精确「t 时刻全部收完」信号 + 原生支持环图。代价是协议复杂。

### 案例 2：循环图怎么走

PageRank 要循环算到收敛。Naiad 的做法：

```
input → enter_loop → compute → exit_loop → output
                       ↑          ↓
                       └──────────┘
                       loop_iter += 1
```

每次走过 loop 回边，时间戳的 `loop_iter` 自动 +1。系统**预先算好**整张图上时间戳怎么变（叫 path summary，路径摘要），算子能直接判断「还有没有更小时间戳的消息可能从循环里转回来」。这是 Spark/Storm 当年做不到的。

### 案例 3：能力（capability）下放就是关闭时间

算子手里捏着「我可能发 t=5 的消息」这个 capability，下游就得继续等。当算子放弃 capability（**downgrade** 到 t=6 或者完全 drop），系统把全局计数减一。所有 t=5 的 capability 都被放掉之后，t=5 就**彻底关闭**——这时下游可以放心做 emit、关窗口、写最终结果。

### 案例 4：跟 Spark Streaming 在 PageRank 上的对比

PageRank 要重复算「每个节点的 rank = 邻居贡献之和」直到收敛。在 Spark 里要写一个外层 Python/Scala 循环，每轮启动一个新 job，shuffle 数据落盘再读。延迟和资源开销随轮数线性涨。

Naiad 直接把循环当 dataflow 的一部分：数据进环路转一圈、loop_iter += 1、判断收敛、要么继续转要么吐出去。**没有 job 启停开销，没有落盘**。论文实测在百节点规模下比 Spark 快一个数量级。这就是「迭代是一等公民」的含义。

## 踩过的坑

1. **C# / .NET 实现限制了开源生态**：Naiad 是 .NET，2013 年那会儿做大数据的人不熟，论文出名了但没几个公司真用上线。后来 Frank McSherry 自己用 Rust 重写成 timely-dataflow，才有了第二春。

2. **进度协议的扩展性**：每个 worker 要广播 pointstamp 计数变化，集群大了之后协议本身成瓶颈。论文做到几百核就开始吃力，大规模生产部署是另一篇文章的事。

3. **容错相对薄弱**：论文重点在性能和模型，fault tolerance 章节短小——主要靠 checkpoint 整个 dataflow，恢复粒度粗。后来 Flink 的 Chandy-Lamport snapshot 把这块补得更扎实。

4. **编程模型门槛偏高**：要写 LINQ 风格 + 显式管理 epoch/loop iteration，比 Spark 的 RDD 难上手。这也是工业界没直接抄的原因之一。

## 跟同代系统的位置

| 系统 | 主打 | 循环 | 进度模型 | 状态 |
|------|------|------|---------|------|
| MapReduce / Dryad | batch | 不支持 | 整个 job 完成 | 无（每轮重读） |
| Storm | streaming | 不支持 | 无精确语义 | 算子内 |
| Spark Streaming | micro-batch | 外层循环 | 批边界 | RDD |
| Pregel / GraphLab | iterative graph | 一等公民 | superstep | 顶点 |
| **Naiad** | **三合一** | **一等公民** | **pointstamp 偏序** | **算子内 + 全局** |

Naiad 是第一个把「循环」「精确进度」「有状态算子」三件事**同时**做对的系统。

## 适用 vs 不适用场景

**适用**：

- 既要低延迟流处理、又要循环迭代的场景（实时图算法、增量机器学习）
- 想要精确「时刻 t 全部数据收完」语义（Spark 的批边界太粗）
- 学习现代流处理模型源头——读 Naiad 再回头看 Flink/Materialize 会突然通

**不适用**：

- 纯批处理 ETL（Spark / Trino 更省心）
- 团队没人懂分布式进度协议（坑太多，调试复杂）
- 不需要循环计算（直接用 Flink / Beam，watermark 够用）
- 要求强容错保证的金融场景（用 Flink，它的 checkpoint 更完备）

## 历史小故事（可跳过）

- **2010 年前**：MapReduce 火了 5 年，所有人发现它不能做迭代（每轮要重新读 HDFS）。Pregel / GraphLab 出来补迭代，Storm 出来补低延迟。三套系统并行。
- **2013 年**：Naiad 论文在 SOSP 发表，第一次把三件事用一个模型说清楚。论文密度极高（14 页）。
- **2014-2016**：Microsoft 项目组解散，Frank McSherry 离开后用 Rust 单人重写 timely-dataflow，再叠一层做 Differential Dataflow（增量计算）。
- **2019 至今**：基于 Differential Dataflow 创业的 Materialize 公司起来，把 streaming SQL 做成商品；Apache Flink 的 watermark/iteration API 公开承认借鉴 Naiad。

之后所有现代流处理引擎都在还 Naiad 当年挖的坑。

## 学到什么

1. **进度 ≠ 批边界**：以前以为「批结束才能算进度推进」，Naiad 证明 per-record 流式 + 精确进度信号是可以共存的，代价是分布式协议
2. **时间戳是偏序不是全序**：epoch + loop_iter 的二元组天然支持环形数据流，全序时间戳做不到
3. **capability 抽象的力量**：「我**可能**发 t 的消息」这种声明式语义，让全局协调可以无锁推进
4. **理论先行 → 工业落地**：Naiad 2013 出来，工业界 5-10 年后才慢慢吸收（Flink watermark / Materialize）。好系统论文要等
5. **微软研究院风格**：写得密、参考实现少、商业上没成功，但概念深远。F# / C# 的工程选择限制了影响力，所以要看一篇论文是否真有用，**5 年后看徒孙**比当下看下载量准

## 延伸阅读

- 论文 PDF（14 页）：[Naiad: A Timely Dataflow System](https://www.microsoft.com/en-us/research/wp-content/uploads/2013/11/naiad_sosp2013.pdf)
- Rust 重写 + 详细文档：[timely-dataflow GitHub](https://github.com/TimelyDataflow/timely-dataflow)（McSherry 的 mdbook 把进度协议讲得最清楚）
- Frank McSherry 个人博客：很多文章对比 Naiad / Spark / Flink 的进度模型
- 商业化产物：[Materialize 官方 docs](https://materialize.com/docs/) —— 看 timely 思想怎么变成 streaming SQL 数据库

## 关联

- [[dataflow-model-2015]] —— Google Dataflow，Naiad 同代竞品，更偏 streaming + window
- [[flink-2015]] —— Apache Flink，Naiad 思想的工业落地大头
- [[differential-datalog]] —— Differential Dataflow / Datalog 同源系列，建在 timely 上
- [[kildall-dataflow]] —— 单机数据流分析框架，Naiad 是分布式版的精神后裔
- [[adapton]] —— 增量计算的另一条路线，跟 Differential Dataflow 互为镜像
