---
title: CIEL 2011 — 让分布式数据流会自己长出下一步
来源: 'Murray, Schwarzkopf, Smowton, Smith, Madhavapeddy, Hand, "CIEL: A Universal Execution Engine for Distributed Data-Flow Computing", NSDI 2011'
日期: 2026-07-09
分类: 分布式系统
难度: 中级
---

## 是什么

CIEL 是一套分布式执行引擎，它让一批机器不只会照着固定清单干活，还能在干活过程中根据中间结果继续追加新任务。日常类比：普通流水线像提前排好的生产单，今天只做 A、B、C 三道工序；CIEL 像一个会看质检结果的车间主任，发现半成品还没达标，就立刻安排下一轮加工。

这篇论文要解决的是 MapReduce 和 Dryad 的共同短板：它们擅长固定形状的批处理，但遇到机器学习迭代、递归搜索、动态规划这类“算到一半才知道下一步”的任务，就要靠外部 driver 一轮一轮提交作业。

CIEL 的核心做法是 **dynamic task graph（动态任务图）**。任务、数据对象、future 引用都放在一张图里；任务执行时可以发布输出，也可以生成子任务，让整张图边跑边长。

## 为什么重要

不理解 CIEL，下面这些事都没法解释：

- 为什么早期 Hadoop 跑 k-means 很别扭——每轮迭代都像重新开一个新工单，收敛判断还在集群外面。
- 为什么 Spark / Ray 后来都强调 future、lineage、动态任务图——CIEL 已经把这条路的基本形状讲清楚了。
- 为什么“分布式数据流”不能只看 DAG 静态拓扑——很多算法的下一步取决于上一轮真实算出的值。
- 为什么容错不能只保护 worker——如果 driver 或 master 挂掉，迭代控制流也会跟着丢。

## 核心要点

CIEL 可以拆成 **三件事**：

1. **对象和引用**：对象是不可变字节串，引用是“这份对象在哪儿”的地址卡。类比：仓库里货物不能随便改，系统只传货单；货单上如果还没有位置，就是 future reference，表示货还在生产。

2. **非阻塞任务**：任务只有等所有依赖都变成 concrete reference 才能运行。类比：厨师不会站在灶台前干等未到的食材，而是把“食材到齐再做”写进排班表，让调度系统到点叫人。

3. **动态任务图**：任务可以发布结果，也可以 spawn 新任务接管某个 expected output。类比：主管发现这道菜还要复炸，不是自己原地等，而是开一张新工单，并告诉后厨“最终成品由新工单交付”。

三件事合起来，CIEL 既保留了数据流系统的自动调度和容错，又能表达循环、递归和动态规划。

## 实践案例

### 案例 1：一次迭代怎么写

```javascript
do {
  prev = curr;
  curr = [];
  for (chunk in input_data) {
    curr += process_chunk(chunk, prev);
  }
} while (!*is_converged(curr, prev));
```

逐部分解释：

- `process_chunk` 会为每个数据块生成并行任务，返回的是结果引用。
- `is_converged` 也是一个任务，它把当前结果和上一轮结果拿去判断是否收敛。
- `*` 会把引用里的小结果读回 Skywriting 控制层；如果结果还没出来，运行时会生成 continuation task，而不是让当前任务原地阻塞。

### 案例 2：MapReduce 也能编译成任务图

```javascript
function mapreduce(inputs, mapper, reducer, r) {
  map_outputs = apply(mapper, inputs);
  reduce_inputs = shuffle(map_outputs, r);
  reduce_outputs = apply(reducer, reduce_inputs);
  return reduce_outputs;
}
```

逐部分解释：

- `apply(mapper, inputs)` 为每个输入分片创建 map 任务。
- `shuffle` 把第 i 个 map 输出收集成第 i 个 reduce 输入。
- `apply(reducer, reduce_inputs)` 再生成 reduce 任务；这说明 CIEL 不是替代 MapReduce 的小语言，而是能把 MapReduce 当作一种库来表达。

### 案例 3：future 引用怎么避免死等

```python
x = spawn(load_block, block_id)
y = spawn(compute_score, x)
return y
```

逐部分解释：

- `x` 不是数据本身，而是“将来会出现的对象”的引用。
- `compute_score` 依赖 `x`，所以 master 只有在 `x` 变成 concrete reference 后才会调度它。
- 依赖被写进图里，失败后系统可以按任务血缘重跑，而不是靠用户自己记住跑到哪一步。

## 踩过的坑

1. **把 CIEL 当成更快的 Hadoop**：它真正的价值是动态控制流；只跑超长批处理时，固定 DAG 系统反而可能更简单。

2. **把 future 当成普通值直接读**：读 future 会触发 continuation，原因是 CIEL 任务必须非阻塞，所有等待都要显式回到任务图里。

3. **把 Skywriting 当高性能计算语言**：Skywriting 负责协调小对象和控制流，大数据块仍应交给 Java、C、shell 或 native executor。

4. **忽略任务粒度**：任务太小会被调度和通信开销吞掉，原因是每个任务都要经过 master、对象表和 worker 心跳链路。

## 适用 vs 不适用场景

**适用**：

- 迭代机器学习，比如 k-means、PageRank、直到收敛才停的优化循环。
- 动态规划和递归任务，比如 Smith-Waterman 序列比对、期权定价的依赖矩阵。
- 想把 MapReduce、Dryad 风格批处理和更灵活控制流放进同一套执行模型的场景。
- 需要 driver、worker、master 都有明确容错边界的长作业。

**不适用**：

- 极细粒度任务，调度开销会比计算本身更大。
- 全部数据都能放进内存并频繁原地更新的算法，Piccolo 这类内存表模型可能更直接。
- 需要低延迟逐条流处理和事件时间窗口的业务，MillWheel / Dataflow Model 后来给了更专门的答案。
- 只想写普通 Python 函数远程执行的现代应用，Ray 的 API 更贴近日常开发体验。

## 历史小故事（可跳过）

- **2004 年**：MapReduce 把大规模批处理做成 map / reduce 两段，牺牲表达能力换来简单可靠。
- **2007 年**：Dryad 把两段扩成任意静态 DAG，但 DAG 仍要在作业启动前确定。
- **2010 年**：Skywriting 先提出用脚本协调云上任务，给 CIEL 的语言层打底。
- **2011 年**：CIEL 把 dynamic task graph 做成执行引擎原语，让迭代和递归能留在同一个分布式作业里。
- **2013 年以后**：Naiad、Spark、Ray 等系统继续沿着动态数据流、future 和 lineage 的方向扩展。

## 学到什么

1. **动态任务图是“控制流进集群”的关键**：循环判断不再躲在外部 driver 里，而是变成可调度、可恢复的任务。

2. **future reference 是连接数据和调度的桥**：它既能表示“结果还没出来”，也能告诉系统“哪些任务该等谁”。

3. **通用性要付出协调成本**：CIEL 能表达 MapReduce、Dryad、Pregel 类计算，但每一步动态决策都要经过任务图维护。

4. **后来的框架不是凭空出现**：Ray 的 task future、Spark 的 lineage、Naiad 的数据流进度，都能在 CIEL 的问题意识里看到前身。

## 延伸阅读

- 原论文 PDF：[CIEL: A Universal Execution Engine for Distributed Data-Flow Computing](https://www.usenix.org/legacy/events/nsdi11/tech/full_papers/Murray.pdf)（NSDI 2011，动态任务图的主文）
- [[scripting-cloud-with-skywriting-2010]] —— Skywriting 是 CIEL 上层脚本语言的前身论文
- [[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— DryadLINQ 代表静态 DAG 加高级语言接口的路线
- [[piccolo-building-fast-distributed-programs-with-partitioned-2010]] —— Piccolo 用分区内存表处理迭代程序，是 CIEL 论文里的对照对象
- [[nectar-automatic-management-data-computation-datacenters-2010]] —— Nectar 关注中间结果复用，和 CIEL 的 memoisation 目标相邻

## 关联

- [[mapreduce]] —— CIEL 能把 MapReduce 当成库来实现，并绕开多轮作业提交开销。
- [[mesos-2011]] —— Mesos 解决多框架共享集群，CIEL 解决单个框架内部如何表达动态控制流。
- [[naiad-2013]] —— Naiad 继续发展数据流模型，把循环和进度追踪做得更精细。
- [[millwheel-2013]] —— MillWheel 专攻低延迟流处理，和 CIEL 的批式动态任务图形成对比。
- [[dataflow-model-2015]] —— Dataflow Model 把流处理窗口、触发和修正拆开，是数据流思想的后续抽象。
- [[ray-2018]] —— Ray 把 task、future、object store 做成面向 AI 应用的现代动态执行框架。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[spark-rdd]] —— Spark RDD — 用血缘记录重建内存数据
