---
title: Spark RDD — 用血缘记录重建内存数据
来源: 'Matei Zaharia et al., "Resilient Distributed Datasets: A Fault-Tolerant Abstraction for In-Memory Cluster Computing", NSDI 2012'
日期: 2026-07-09
分类: 分布式系统
难度: 初级
---

## 是什么

RDD（Resilient Distributed Dataset）是 Spark 论文提出的核心抽象：一份分散在多台机器上的只读数据集合。

日常类比：你不是把一整本错题本复印十份，而是记住“第几页从哪本教材、按什么步骤整理出来”。

机器坏了、某一页丢了，就照这个整理步骤重新生成那一页。

这里的“整理步骤”在论文里叫 **lineage**，可以理解成数据的血缘记录。

RDD 的特别之处不是“把数据放进内存”这么简单，而是把内存数据和可重算的来源绑在一起。

这样 Spark 可以大胆把中间结果放进内存，失败时只重算丢掉的分区，不必把每份中间数据都细粒度复制。

一句话：RDD 是“只读分区数据 + 转换历史 + 可选择缓存”的组合。

## 为什么重要

不理解 RDD，下面这些事都很难解释：

- 为什么 Spark 比早期 Hadoop MapReduce 更适合迭代机器学习和图计算。
- 为什么 `map`、`filter` 这些转换先不执行，遇到 `count`、`collect` 才真正跑。
- 为什么 Spark 节点丢了一块缓存数据，不一定要整批任务从头重来。
- 为什么 `persist`、`partitionBy` 这种看似普通的 API，会直接影响分布式性能。

这篇论文的重要价值在于：它把“内存计算”和“容错”放进同一个抽象里处理。

传统思路常是“怕丢就复制”，RDD 的思路是“能重算就少复制”。

## 核心要点

1. **只读数据，换来简单容错**：RDD 创建后不在原地修改。类比：共享文档不允许大家直接乱改，只能生成新版本，所以历史更清楚。

2. **lineage 记录怎么来，而不是复制所有结果**：每个 RDD 记住自己从哪些父 RDD 经过哪些转换得到。类比：保留菜谱比把每盘菜都备一份便宜。

3. **分区和依赖决定调度成本**：RDD 被切成 partitions，转换之间有 narrow dependency 和 wide dependency。类比：有些作业只要同桌传纸条，有些作业要全班重新分组。

Spark 的关键选择是限制写入方式：用户不能随便改某个远程内存格子，只能用批量转换生成新 RDD。

这个限制少了一些自由度，却让系统知道每份数据如何恢复、任务如何切分、数据该尽量放在哪台机器附近。

## 实践案例

### 案例 1：日志查询为什么要 `persist`

```scala
val lines = spark.textFile("hdfs://logs")
val errors = lines.filter(_.startsWith("ERROR"))
errors.persist()
errors.filter(_.contains("MySQL")).count()
errors.filter(_.contains("HDFS")).count()
```

**逐部分解释**：

- `textFile` 创建的是来自稳定存储的 RDD，数据还没有真正读进来。
- `filter` 只是记录“如何筛出错误日志”，不会立刻扫描整个文件。
- `persist` 告诉 Spark：这个中间结果后面会反复用，第一次算完后尽量放进内存。
- 两次 `count` 是 action，会触发真实计算；第二次可以复用缓存的 `errors`。

这就是论文里的交互式日志挖掘例子：先把常用子集放内存，再快速问多个问题。

### 案例 2：节点丢了一块数据，Spark 怎么补

```txt
lines  --filter(ERROR)-->  errors  --filter(HDFS)-->  hdfsErrors
```

**逐部分解释**：

- `errors` 的某个 partition 如果丢了，Spark 不需要恢复整个 `errors`。
- 它只找到对应的 `lines` partition，再重新跑一次 `filter(ERROR)`。
- 后面的 `hdfsErrors` 也按同样的 lineage 往前追。
- 论文强调：程序通常不会引用一个完全无法重建的 RDD。

这个思想和“每份中间结果复制三份”不同：Spark 用少量 lineage 元数据换取失败后的局部重算。

### 案例 3：PageRank 为什么关心分区

```scala
val links = spark.textFile("pages")
  .map(parseLinks)
  .partitionBy(myPartitioner)
  .persist()
var ranks = initialRanks.partitionBy(myPartitioner)
val joined = links.join(ranks)
```

**逐部分解释**：

- PageRank 每轮都要把网页链接表和当前排名 join 在一起。
- 如果 `links` 和 `ranks` 按同样规则分区，同一个 URL 的数据更可能在同一台机器。
- join 时少搬数据，网络开销就下降。
- 论文实验里，PageRank 仅靠内存有加速；再控制分区，速度提升更明显。

这说明 RDD 不只是“缓存”，还让用户表达数据布局意图。

## 踩过的坑

1. **把 RDD 当普通数组**：RDD 是分布式集合，`collect()` 会把结果拉回 driver，数据大时容易撑爆本机内存。

2. **以为 `map` 会立刻执行**：转换是 lazy 的，只有 action 才会触发作业，所以调试时要看执行边界。

3. **什么都 `persist`**：缓存占内存，缓存错对象会让真正热的数据被挤出去。

4. **忽略 wide dependency**：`join`、`groupByKey` 这类操作可能触发 shuffle，成本远高于普通 `map`。

这些坑的共同根因是：没有把 RDD 看成“分区 + lineage + 调度计划”的整体。

## 适用 vs 不适用场景

**适用**：

- 迭代算法，比如逻辑回归、K-means、PageRank，每轮反复读同一批数据。
- 交互式分析，比如先缓存日志子集，再连续执行多个查询。
- 批量数据转换，比如 `map`、`filter`、`join`、`reduceByKey` 这类对大量记录做同一操作的任务。
- 失败后可以接受重算少量分区，而不是要求每个写入立即持久化的场景。

**不适用**：

- 大量细粒度异步更新，比如在线数据库里每条记录随时被改。
- 强事务系统，比如需要多行原子提交、严格并发控制的业务存储。
- 单机小数据脚本，分布式调度成本可能比计算本身还高。
- lineage 过长且重算代价极高的任务，此时需要 checkpoint 或可靠持久化。

判断口诀：如果你的工作像“一批数据反复加工”，RDD 很合适；如果像“很多人同时改一本账”，RDD 不是主角。

## 历史小故事（可跳过）

- **2004 年**：MapReduce 让大规模批处理变简单，但每轮结果主要靠磁盘文件衔接。
- **2010 年前后**：机器学习和图计算越来越依赖迭代，反复读写磁盘成为明显瓶颈。
- **2011 年**：Spark 技术报告把 RDD 思路公开，并把 lineage 容错作为核心卖点。
- **2012 年**：NSDI 论文系统阐述 RDD，实验展示迭代任务最高可比 Hadoop 快很多。
- **后来**：Spark 发展出 DataFrame、Dataset、SQL 等更高层接口，但底层仍能看到 RDD 的影子。

这个故事的主线不是“内存更快”这么朴素，而是“怎样让内存里的中间结果也可靠”。

## 学到什么

- 抽象的力量在于取舍：RDD 放弃任意细粒度写入，换来简单、低开销的容错。
- lineage 是一种工程化的“可重现性”：只要来源和步骤确定，结果就可以局部再造。
- 分布式性能不只看 CPU，还要看数据是否反复序列化、是否落盘、是否跨网络搬运。
- 好的 API 会把系统实现需要的信息暴露给用户，比如 `persist` 表达复用，`partitionBy` 表达布局。

这篇论文真正值得学的是设计判断：把问题限制在“批量转换”里，系统就能做出强优化。

## 延伸阅读

- 论文 PDF：[Resilient Distributed Datasets](https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final138.pdf)
- 官方文档：[Apache Spark RDD Programming Guide](https://spark.apache.org/docs/latest/rdd-programming-guide.html)
- 相关论文：[[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— 高层语言接口做分布式数据并行。
- 相关论文：[[piccolo-building-fast-distributed-programs-with-partitioned-2010]] —— 对比共享可变状态路线。
- 相关论文：[[ciel-universal-execution-engine-distributed-data-flow-2011]] —— 动态数据流执行引擎。
- 相关论文：[[availability-intermediate-data-cloud-computations-2009]] —— 中间数据可用性和复制成本。

## 关联

- [[mapreduce]] —— RDD 继承批量数据处理思想，但把跨作业共享从磁盘推进到内存。
- [[hadoop]] —— Spark 论文里的主要对比对象，瓶颈常在反复磁盘 I/O 和反序列化。
- [[pregel]] —— PageRank 等图迭代模型可以在 RDD 上用库实现。
- [[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— Spark API 受语言集成数据并行接口影响。
- [[piccolo-building-fast-distributed-programs-with-partitioned-2010]] —— 展示 RDD 与分布式共享可变表的取舍差异。
- [[ciel-universal-execution-engine-distributed-data-flow-2011]] —— 同属数据流系统，但 RDD 强调显式内存共享和 lineage。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[piccolo-building-fast-distributed-programs-with-partitioned-2010]] —— Piccolo — 用分区表写分布式迭代程序
- [[sparrow-2013]] —— Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器
- [[tachyon-2014]] —— Tachyon — 把集群存储推到内存速度，丢了再算回来
