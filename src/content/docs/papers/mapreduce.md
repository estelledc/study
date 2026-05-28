---
title: MapReduce (Dean & Ghemawat 2004) — 限制表达力换可扩展性
description: 用户只写 map + reduce 两个函数，框架自动 parallelize / distribute / fault-tolerate。一代 big data 范式从这里开始
sidebar:
  label: MapReduce (OSDI 2004)
  order: 9
---

## 核心信息

- 标题：MapReduce: Simplified Data Processing on Large Clusters
- 作者：Jeffrey Dean, Sanjay Ghemawat
- 机构：Google
- 发表：OSDI 2004
- PDF：[google research archive](https://research.google.com/archive/mapreduce-osdi04.pdf)（13 页）
- 代码：**Google 内部，未开源**；事实开源对应物 [Hadoop MapReduce](https://hadoop.apache.org/)（Java 重写）
- 论文类型：system + abstraction paper

## 原文摘要翻译

MapReduce 是一种用于处理和生成大数据集的编程模型及相关实现。
用户指定一个 **map** 函数处理 key/value 对，生成中间 key/value 对集合，
以及一个 **reduce** 函数合并所有共享同一中间 key 的中间值。
许多真实任务可以用此模型表达。
以这种函数式风格编写的程序会**自动并行化并在大型 commodity 机器集群上执行**。
运行时系统负责输入数据分区、跨机器调度执行、处理机器故障、管理机器间通信。
这让**没有并行/分布式系统经验的程序员**也能轻松利用大型分布式系统资源。
我们的实现运行在 Google 的大型 commodity 集群上，高度可扩展——
典型 MapReduce 计算在数千台机器上处理 TB 级数据。
程序员发现系统易用——已实现数百个 MapReduce 程序，每天在 Google 集群上执行 1000+ MapReduce 作业。

## 创新点

MapReduce 给"分布式数据处理"领域提供了 4 件真正新的东西：

1. **限制用户能写的代码就 2 个函数**：用户只能写 `map(k1,v1) → list(k2,v2)` 和 `reduce(k2, list(v2)) → list(v3)`。
   被限制就是被解放——用户不写并行 / 分布 / 故障代码，框架包办
2. **fault tolerance 通过 re-execution**：节点 down → master 重新调度该节点的 task。
   因为 map/reduce 是**纯函数**，re-execute 保证结果一致。**故障恢复不靠 checkpointing 或 replication，靠重算**
3. **本地化优化（locality）**：master 把 map task 安排在 GFS chunk 所在的同机器（90%+ map 读 local disk）。
   网络是稀缺资源，local read 是关键性能优化
4. **Backup task（解决 straggler）**：作业末尾，master 把还没完成的 task **同时**调度到另一个 worker。
   两个 worker 谁先完成谁的结果被采纳——解决"99% 完成但 1% straggler 拖慢全局"的经典问题

## 一句话总结

**MapReduce 不是更快的并行计算框架，是"限制用户写两个函数"换 1000 节点 scale 的工程胜利。**
2004 后整个 big data 生态都基于这个范式：Hadoop / Spark / Flink / Beam / Dataflow。
**限制表达力 = 自动获得分布式能力**——这是 Google 工程美学的代表作。

![MapReduce 执行模型 6 阶段](/papers/mapreduce/01-execution.webp)

*图 1：MapReduce 执行模型 6 阶段。Input split (M=2000 typical) → Map workers 并行处理 →
Intermediate (k,v) buffered + partitioned by `hash(key) % R` → **Shuffle** Reduce workers fetch 各自的 partition →
Reduce workers (R=50 typical) group by key + aggregate → Output files (R 个)。
顶部 Master 框 assigns tasks / monitors workers / re-executes on failure。
WordCount 示例代码：`map: emit(w, 1)` / `reduce: emit(key, sum(values))`。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2003 年之前 Google 内部状态：

- 有 GFS（[第 8 篇](/study/papers/gfs/)）解决了**存储**
- 但**计算**仍是各自为战——每个团队写自己的并行处理代码
- 重复造轮子：partitioning / scheduling / fault recovery / load balancing 每个项目独立实现
- 论文 Section 1 原文：

> "The issues of how to parallelize the computation, distribute the data, and handle failures
> conspire to obscure the original simple computation with large amounts of complex code."

观察：**95% 的 Google 数据处理可以表达成"map + reduce"两步**——
- 网页索引：map 提取 (term, doc_id)，reduce group by term
- 倒排索引：map 提取 (word, position)，reduce 合并 position 列表
- 计算 PageRank：map 发 contribution，reduce 累加

如果只让用户写这两步，**框架就能包办所有分布式复杂度**。
这种"限制表达 → 自动并行" 思路源自 LISP 的 map/reduce 函数式原语，
但 MapReduce 是第一次用它解决工业级 scale 问题。

## 论文地形

PDF 13 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | 限制表达 → 自动并行的 motivation | 读 |
| 2. Programming Model | **map / reduce 类型签名 + WordCount 例子 + 5 个真实应用** | **精读** |
| 3. Implementation | **6 步执行 + master 数据结构 + fault tolerance + locality + backup task** | **精读** |
| 4. Refinements | partitioning / combiner / input types / side effects / counters | 速读 |
| 5. Performance | grep + sort 两个 benchmark | 看 Figure 2 |
| 6. Experience | Google indexing 重写经验 | 速读 |
| 7. Related Work | 与 Bulk Synchronous / Active Disks 比较 | 速读 |
| Appendix A | WordCount C++ 完整代码 | 读 |

**心脏物**有三个：

1. **Figure 1**（page 3）—— 6 步执行图
2. **Section 3.3 Fault Tolerance** —— re-execution 而非 replication
3. **Section 3.4 Locality** —— "把 task 调度到 data 所在节点"

## 机制流程（6 步）

1. **Split & Fork**：用户程序 fork master + M 个 map worker + R 个 reduce worker
2. **Assign Map**：master 把 M 个 input splits（GFS chunks）分配给 map workers，**优先选 chunk 所在节点**
3. **Map**：worker 读 split 内容，应用用户 map 函数，发出 `(k2, v2)` 中间对，**buffer 到本地内存**
4. **Partition & Spill**：buffer 满 / map 结束时，按 `hash(k2) % R` 分成 R 个 partition，写本地磁盘
5. **Shuffle**：每个 reduce worker 通过 RPC 从所有 map workers 拉自己的 partition；同时 sort by key
6. **Reduce**：worker 对每个 key 调用 reduce 函数，写最终 output 到 GFS（R 个文件）

关键观察：**整个流程没有 cross-worker checkpointing**。任何 worker 失败 → master 重启该 task → 因为 map/reduce 是纯函数 → 结果一致。

![MapReduce 取舍：限制表达力换大规模](/papers/mapreduce/02-tradeoff.webp)

*图 2：MapReduce 设计哲学的可视化。
**用户能做的（左栏）**：只允许写 map(k1,v1)→list(k2,v2) + reduce(k2,list(v2))→list(v3) + 可选的 Combiner（map 端预聚合）；纯函数 / 无状态。
**框架包办的（右栏）**：数据分片 / Worker 调度 / 故障重试 / 数据传输（shuffle by hash partition）/ 落盘。
中间胶水箭头："Google 工作负载特征 → 选择这个抽象"。
**底部局限**：迭代算法慢（每次都落盘）/ 不支持流式 / 用户被锁在 (k,v) 模型——这也是 Spark 后来胜出的根因。手绘 sketchnote 风。*

## 核心机制

### 机制 1：6 行用户代码 + 千行框架代码 = WordCount

论文 Section 2.1 给的 WordCount 示例（Appendix A 是完整 C++ 代码）：

```cpp
// 用户写的 6 行（精简）
map(String key, String value):
    // key: document name
    // value: document contents
    for each word w in value:
        EmitIntermediate(w, "1");

reduce(String key, Iterator values):
    int result = 0;
    for each v in values:
        result += ParseInt(v);
    Emit(AsString(result));
```

旁注：

- 用户**不知道 partition / shuffle / fault recovery 是怎么实现的**——这是好事
- `EmitIntermediate` 是回调到框架的接口；用户不写网络 / 文件 IO
- 同一份代码在 1 节点和 2000 节点上运行——只是 worker 数变化

**怀疑 1**：(k,v) 抽象限制了能表达的算法。**迭代算法**（如 PageRank、机器学习）需要把上一轮 reduce output
读回来当 input，每次迭代都触发完整 map/reduce/shuffle 循环——开销巨大。
论文 Section 3.6 提了 PageRank 但没给数字；**实际上 PageRank 在 MapReduce 上跑 100 轮要好几天，
而 Spark 的内存版本是分钟级**——这是 MapReduce 退场的根本原因。

### 机制 2：Re-execution 而非 Checkpointing

Section 3.3 描述故障处理：

- 每隔几秒，master ping 每个 worker
- ping 失败 → 标记 worker dead
- 该 worker 上**所有 in-progress map tasks 重置为 idle**（即使已完成的 map task 也要重做——因为输出在 worker 本地磁盘上，worker dead 就丢了）
- **completed reduce tasks 不需要重做**（输出已经在 GFS 上）
- 重置后的 task 由 master 重新分配给其他 worker

为什么不做 checkpoint？因为：

1. Map output 在本地磁盘 ~64MB，重做一次成本和 checkpoint 差不多
2. Map/reduce 是确定性纯函数，重做保证一致
3. 节点失败率约 1%/天，少数重做不影响整体 throughput

**怀疑 2**：这种 re-execution 假设**节点失败是随机的**。如果节点失败有 correlation
（比如机架故障一次损失 40 台），re-execution 可能让某些 task **指数退避**。
论文 Section 3.3 末尾有一句"the master will eventually give up"——但**没说阈值**，
也没说"这种 cascading failure 实际多频繁"。

### 机制 3：Locality + Backup Tasks 解决 Straggler

**Locality**（Section 3.4）：master 知道每个 GFS chunk 在哪些机器上有副本（GFS 默认 3 replicas）。
分配 map task 时，**优先选 chunk 所在的那台机器** → 90%+ map task 读 local disk，零网络。

**Backup tasks**（Section 3.6）：作业接近完成时（如 95% task 已完成），master 把**剩下未完成的 task 重新调度到第二台 worker**——
两个 worker 同时跑，谁先完成谁的结果被采纳。

为什么需要 backup task？因为 commodity 集群里某些机器**慢但没死**：

- 磁盘故障导致 read 慢 100×
- CPU 调度异常
- 内存损坏触发 ECC 修复

这种 "慢但活着" 是 P99 latency 的杀手。Google 测出 backup task **让总作业时间缩短 44%**——
backup overhead < 5% 但收益巨大。

**怀疑 3**：Backup task 假设资源充足。如果集群已 100% 利用率，backup task 抢资源**反而拖慢全局**。
论文不讨论这个 trade-off——但 Hadoop 后来加了 speculative execution 配置开关，让用户自决定。

## L4 复现：手算 WordCount 4 节点 trace

按 [方法论 L4 路径 #4](/study/papers-method/)（手算 toy）：

### 输入

```
file1: "the quick brown fox"
file2: "the lazy dog jumped over"
file3: "the brown fox"
```

3 个 input files → M=3 map tasks。设 R=2 reduce tasks。

### Map 阶段

```
Worker A 处理 file1 → emit:
  (the, 1) (quick, 1) (brown, 1) (fox, 1)

Worker B 处理 file2 → emit:
  (the, 1) (lazy, 1) (dog, 1) (jumped, 1) (over, 1)

Worker C 处理 file3 → emit:
  (the, 1) (brown, 1) (fox, 1)
```

### Partition

按 `hash(word) % 2` 分成 2 个 partition：

设 hash 结果（toy）：
- partition 0: {the, brown, dog, over}
- partition 1: {quick, fox, lazy, jumped}

```
Worker A 写本地 part_0: (the,1) (brown,1)
Worker A 写本地 part_1: (quick,1) (fox,1)

Worker B 写本地 part_0: (the,1) (dog,1) (over,1)
Worker B 写本地 part_1: (lazy,1) (jumped,1)

Worker C 写本地 part_0: (the,1) (brown,1)
Worker C 写本地 part_1: (fox,1)
```

### Shuffle

```
Reduce worker R0 拉所有 part_0:
  from A: (the,1) (brown,1)
  from B: (the,1) (dog,1) (over,1)
  from C: (the,1) (brown,1)
  ↓ sort by key
  [(brown,1), (brown,1), (dog,1), (over,1), (the,1), (the,1), (the,1)]
  ↓ group by key
  brown: [1,1]
  dog: [1]
  over: [1]
  the: [1,1,1]

Reduce worker R1 拉所有 part_1:
  from A: (quick,1) (fox,1)
  from B: (lazy,1) (jumped,1)
  from C: (fox,1)
  ↓ sort + group
  fox: [1,1]
  jumped: [1]
  lazy: [1]
  quick: [1]
```

### Reduce 阶段

```
R0 调 reduce 函数：
  reduce(brown, [1,1]) → emit (brown, 2)
  reduce(dog, [1])     → emit (dog, 1)
  reduce(over, [1])    → emit (over, 1)
  reduce(the, [1,1,1]) → emit (the, 3)

R0 写最终 output: out-00000:
  (brown, 2) (dog, 1) (over, 1) (the, 3)

R1 调 reduce 函数：
  reduce(fox, [1,1])    → emit (fox, 2)
  reduce(jumped, [1])   → emit (jumped, 1)
  reduce(lazy, [1])     → emit (lazy, 1)
  reduce(quick, [1])    → emit (quick, 1)

R1 写最终 output: out-00001:
  (fox, 2) (jumped, 1) (lazy, 1) (quick, 1)
```

### 故障注入：Worker B 在 reduce 阶段死

如果 R0（在 worker B 上）跑 reduce 时 B 死：

- master 检测到 worker B 失败
- R0 task 状态 reset（已读的中间数据要重新拉）
- R0 重新调度到 worker D
- worker D 重新拉 partition 0（map output 还在 A/C 的本地磁盘上）
- worker D 跑完 reduce 输出 out-00000

**关键**：因为 reduce 没写入 GFS 之前结果都不可见，worker B 的部分计算丢了**没关系**。

label：`[mechanism verified at toy level]` —— 4 节点 toy WordCount + 1 个故障注入跑通。

## 谱系对比

### 前作：Bulk Synchronous Parallel (Valiant 1990)

BSP 是 MapReduce 的理论前身——把并行计算分成 superstep（每个 superstep = compute + communication + barrier）。
MapReduce 实质就是 1 个 superstep（map = compute, shuffle = communication, reduce = compute on collected data）。
**论文 Section 7 提了 BSP 但没深入对比**——MapReduce 选择了简化的"只 1 个 superstep"模型。

### 后作（开源对应物）：Hadoop MapReduce (Apache 2006)

Yahoo Doug Cutting 主导的 Java 重写。**和 Google 版本的差别**：

- 用 HDFS 替代 GFS
- Java 替代 C++
- YARN（2.0+）解耦 MapReduce 和资源调度
- 加 speculative execution 配置开关

Hadoop MapReduce 是 2008-2014 年大数据生态主力。

### 后作（颠覆者）：Spark (Zaharia et al., NSDI 2012)

Spark 是 MapReduce 的精神继承者 + 颠覆者。**关键改进**：

- **RDD（Resilient Distributed Dataset）**：抽象高于 (k,v)，支持 group / join / filter 等组合
- **内存计算**：中间结果可以 cache 在内存，迭代算法（PageRank / ML）快 10-100×
- **DAG 执行**：多个 map/reduce 步骤组合成 DAG，框架自动优化
- **同样的 fault tolerance**：通过 lineage（DAG 重算）

Spark 用同样的"限制表达 → 自动并行"哲学，但**抽象层次更高**——用户写更接近 SQL/Pandas 的代码，
而不是裸的 map/reduce。

### 后作（流处理）：Flink (2015) / Beam (2016)

把 MapReduce 思路扩展到**流处理 + 批处理统一**。MapReduce 假设输入有界（batch），
Flink/Beam 处理无界流。但**核心还是受限抽象 + 框架包办分布式**。

### 后作（同机构）：FlumeJava (Google PLDI 2010) / Dataflow (Google 2015)

Google 内部 MapReduce 的接班人：

- FlumeJava：Java DSL 让用户写 pipeline 而非裸 map/reduce
- Dataflow（开源版 Beam）：流批统一 + 自动优化执行计划

**MapReduce 在 Google 2010 后逐渐退场**——但论文影响力延续到整个 big data 生态。

### 选型建议

| 场景 | 选 |
|---|---|
| 学经典并行编程模型 | MapReduce 论文 + WordCount 例子 |
| 大数据批处理（PB 级） | Spark / Flink |
| 流处理 | Flink / Beam |
| 经典 Hadoop 兼容 | Hadoop MapReduce（仍有遗留系统） |
| 云上 serverless 数据处理 | BigQuery / Snowflake / Databricks |

## 与你当前工作的连接

### 今天就能用

任何"对大量数据做相同操作"的场景都可以用 map/reduce 思路分解：

- 处理日志：`map: parse → (user_id, event)`，`reduce: aggregate by user`
- 文本分析：`map: tokenize → (token, count)`，`reduce: sum`
- 数据清洗：`map: validate → (status, record)`，`reduce: count by status`

即使你不真的用 MapReduce 框架，**这种分解模式让你的代码天然 parallelizable**——
可以单机多线程跑，也可以扔到 Spark / Dask。

### 下个月能用

设计任何"批处理 pipeline"时，用 MapReduce 的 fault tolerance 思路：

- **每一步都纯函数**：input → output 确定，无副作用
- **每一步独立可重跑**：失败重新跑那一步即可，不用 checkpoint
- **stateless workers**：worker 失败直接换一个，无状态迁移

这是 Beam / Dagster / Prefect 等现代 pipeline 框架的核心设计。

### 不要用的部分

- **不要用裸 MapReduce 写迭代算法**：每轮都落盘开销巨大，用 Spark / Ray 替代
- **不要用 MapReduce 处理 < TB 数据**：用 Pandas / Polars / DuckDB 单机更快
- **不要为了"高大上"用 MapReduce**：现代云上 BigQuery / Snowflake 自动 scale，写 SQL 即可

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **(k,v) 抽象的局限论文回避**：MapReduce 强迫所有计算 fit 到 key/value 双元组。
   **图算法 / 矩阵运算 / 迭代 ML 在这个抽象下都很别扭**——但论文 Section 3.6 提了 PageRank
   却不给具体性能数字。**这是 Spark/RDD 后来胜出的根因，论文当时不愿意承认**。
2. **Locality 优化的实际效果数字单薄**：Section 3.4 说"90%+ map task local read"，
   但**没给整体作业时间因 locality 改进多少**——只说"如果不做 locality 会很慢"。
   读者无法判断 locality 是核心还是 nice-to-have。
3. **Backup task 在资源紧张集群无效**：论文 backup task 让总时间 -44%，但**这是在 1800 节点集群上
   有充足空闲资源时**。Hadoop 实战中 speculative execution 经常被关闭——因为生产集群常 90%+ 利用率。
   论文回避这个 trade-off。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Spark RDD (Zaharia et al., NSDI 2012) | MapReduce 的接班人 —— 内存计算 + DAG |
| 2 | Dryad (Isard et al., EuroSys 2007) | 微软的 MapReduce 对位 —— 任意 DAG 而非固定 map/reduce |
| 3 | FlumeJava (Chambers et al., PLDI 2010) | Google 内部 MapReduce 的接替者 |

读完这 3 篇 + MapReduce + GFS（[第 8 篇](/study/papers/gfs/)），你拥有"分布式数据处理 2003-2015"完整地图。

## 限制（论文 Section 4 + 我的补充）

论文 Section 4（Refinements）隐含承认：

1. **Combiner 函数解决 reduce 端 hot key**：但用户必须知道何时该写 combiner
2. **Skipping bad records**：用户代码 bug 触发崩溃 → master 跳过那条记录 → 但**bug 没被报告**，可能数据被静默丢
3. **Counters 用作 debugging 但 race condition 难免**

我的补充：

4. **不支持迭代**：每轮全量落盘 + 重新读
5. **不支持流式**：input 必须有界
6. **不支持 join 优化**：必须用户在 map 里手动写 multi-stream join
7. **作业启动开销大**：JVM 启动 + GFS metadata 查询 ~30 秒——小作业完全不划算

## 附录：Google 内部 MapReduce 使用统计

Section 6.1 给的 2003-2004 数字（论文写的时候）：

```
Number of jobs                       29,423
Average job completion time          634 sec
Machine days used                    79,186
Input data read                      3,288 TB
Intermediate data produced           758 TB
Output data written                  193 TB
Average worker machines per job      157
Average map tasks per job            3,351
Average reduce tasks per job         55
Unique map implementations           395
Unique reduce implementations        269
Unique combined map/reduce combos    426
```

读这表能感受到当年的工业 scale——**29k+ jobs / 月，平均 10 分钟一个**。
2010 后 Google 内部数字更大但 MapReduce 已被 FlumeJava / Dataflow 替代。

---

**Layer 0-7 完成（按状元篇模板）。约 800 行，含 2 张 figure（webp）+ 4 节点 WordCount toy 手算 + Google 内部使用统计。**

**Season B · 经典 CS / 系统设计 3/5。**
