---
title: Morsel-Driven Parallelism — 把 SQL 查询切成小口分给多核
来源: 'Viktor Leis, Peter Boncz, Alfons Kemper, Thomas Neumann, "Morsel-Driven Parallelism: A NUMA-Aware Query Evaluation Framework for the Many-Core Age", SIGMOD 2014'
日期: 2026-05-29
分类: databases
难度: 中级
---

## 是什么

想象餐厅后厨有 32 个厨师，不再让每个人从头到尾负责一整桌菜，而是把食材切成一小盘一小盘。谁手空了，就拿下一小盘；最好拿自己灶台旁边的小盘，实在没有再去别人那边拿。

Morsel-driven parallelism 就是数据库查询执行里的这个办法：把输入数据切成很多小块，论文叫 **morsel**；固定一组 worker 线程；每个线程一次拿一个 morsel，跑完整段 operator pipeline，直到遇到 pipeline breaker，例如 hash join build 完成或 aggregation 需要汇总。

它和传统 Volcano/exchange 风格的差别是：并行度不是在执行计划里提前写死，而是在运行时由 dispatcher 分配。这样系统既能平衡快慢线程，又能尽量让线程访问同一个 NUMA socket 上的本地内存。

## 为什么重要

不理解 morsel-driven parallelism，下面这些事都很难解释：

- 为什么多核很多时，简单地把表平均切成 32 份仍然可能有线程早早闲着
- 为什么主内存数据库不仅要快算，还要关心数据在哪个 CPU socket 旁边
- 为什么 HyPer/Umbra 这类系统强调 pipeline、JIT、operator state 和调度器要一起设计
- 为什么论文报告 TPC-H 上 32 核平均超过 30 倍加速，但核心贡献不只是“用了更多线程”

## 核心要点

Morsel-driven parallelism 可以拆成 **三件事**：

1. **小块任务**：morsel 像外卖小单，一单太大就不好抢，一单太小又调度太贵。论文经验值约为 100,000 tuples，目标是在调度开销和响应速度之间折中。

2. **运行期派活**：dispatcher 像后厨排班员，但它不是单独占一个厨师，而是被 worker 请求任务时顺手执行。任务由“哪个 pipeline job”加“哪一块 morsel”组成。

3. **NUMA 优先**：NUMA 像一栋楼里每层都有仓库，去本层拿货最快。dispatcher 优先把本 socket 的 morsel 分给本 socket 的线程，只有为了负载均衡才跨 socket 偷活。

这三件事连起来，得到的是一种细粒度、可伸缩、能中途改变资源分配的查询并行框架。

## 实践案例

### 案例 1：静态切 4 份为什么会等人

```js
const chunks = split(table, 4)
await Promise.all(workers.map((w, i) => w.run(chunks[i])))
```

**逐部分解释**：

- `split(table, 4)` 表示计划阶段就把活分死
- 如果 `chunks[0]` 过滤后特别重，其他 3 个 worker 做完也只能等
- 这就是传统 plan-driven 并行容易遇到的 load imbalance

论文的改法是：

```js
while (dispatcher.hasMorsel(query)) {
  const morsel = dispatcher.nextLocalOrSteal(worker.socket)
  worker.runPipeline(morsel)
}
```

**逐部分解释**：

- `hasMorsel` 让线程不停拿小块，而不是提前领一大块
- `nextLocalOrSteal` 先拿本地内存，没活才偷远端
- 每个 morsel 做完就是一次自然的资源重分配点

### 案例 2：一个三表 join 怎么变成 pipeline

```sql
SELECT *
FROM R
JOIN S ON R.a = S.a
JOIN T ON R.b = T.b;
```

论文会把它看成几段 pipeline：

```text
scan/filter T -> build HT(T)
scan/filter S -> build HT(S)
scan/filter R -> probe HT(S) -> probe HT(T) -> materialize
```

**逐部分解释**：

- 前两段先建 hash table，因为 probe 必须等 build 完成
- `R` 通常是大表，适合被切成许多 morsel 并行扫描
- pipeline breaker 是“必须停下来汇总状态”的地方，例如 hash table 已经建好

### 案例 3：NUMA locality 为什么要写进调度器

```js
function pickMorsel(worker) {
  return localQueue[worker.socket].pop()
      ?? nearbyQueue(worker.socket).steal()
      ?? anyQueue().steal()
}
```

**逐部分解释**：

- `localQueue` 对应本 socket 的数据块，访问延迟最低
- `nearbyQueue` 表示某些 NUMA 拓扑里，相邻 socket 比远端 socket 便宜
- `anyQueue` 是兜底：宁可偶尔远程访问，也不要让核心闲着

## 踩过的坑

1. **把 morsel 理解成缓存块**：morsel 的主要作用是调度单位，不要求完全放进 cache；原因是 pipeline 仍然按算子逻辑访问数据。

2. **以为 NUMA-aware 就永不远程访问**：论文允许 work stealing；原因是全本地但线程闲置，整体吞吐反而更差。

3. **只改调度器、不改算子**：join、aggregation、sort 也要能并行接收或产出；原因是 Amdahl 定律会让一个串行算子拖垮全局加速。

4. **把 elasticity 当成线程创建销毁**：HyPer 预创建并绑核 worker；原因是频繁创建线程会带来额外开销，还可能破坏 NUMA locality。

## 适用 vs 不适用场景

**适用**：

- 主内存 OLAP / HTAP 数据库，需要在单机多核上跑复杂 SQL
- pipeline 化查询执行，例如 scan、filter、hash join、aggregation 可以串起来
- 多租户或交互式负载，需要中途把核心从长查询让给短查询
- NUMA 机器，远端内存访问成本明显高于本地访问

**不适用**：

- 主要瓶颈是磁盘 I/O 的老式执行环境，CPU 调度不是核心问题
- 查询算子无法并行化，或者共享状态只能靠粗粒度锁保护
- 单核或很少核心的场景，morsel 调度收益不够覆盖实现复杂度
- 必须严格固定每个线程处理范围的实时系统，因为 work stealing 会改变归属

## 历史小故事（可跳过）

- **1990 年**：Volcano exchange 把并行性封装进执行计划，很多系统因此能少改算子就获得并行能力。
- **2005 年**：MonetDB/X100 推动 vectorized execution，让数据库一次处理一批 tuple，减少解释器开销。
- **2011 年**：HyPer 展示主内存 OLTP/OLAP 混合系统，后续需要把单线程快引擎扩展到 many-core。
- **2014 年**：Leis、Boncz、Kemper、Neumann 在 SIGMOD 提出 morsel-driven，把 pipeline、work stealing、NUMA locality 合成一套框架。
- **后来**：HyPer/Umbra 系数据库继续沿着“编译执行 + morsel 调度 + NUMA aware”的方向演化。

## 学到什么

1. **并行不是平均切块就结束**：真正难的是运行时负载不均、CPU 性能波动、多个查询抢资源。
2. **数据位置也是性能的一部分**：NUMA 机器上，同样一条 load 指令，本地和远端可能差很多。
3. **调度器和算子要一起设计**：morsel 只负责“谁来做哪块”，hash table、aggregation、sort 还要自己能并行。
4. **弹性来自小边界**：每个 morsel 结束时都能换任务，所以系统不用强行打断线程也能改变并行度。

## 延伸阅读

- 论文 PDF：[Morsel-Driven Parallelism 2014](https://db.in.tum.de/~leis/papers/morsels.pdf)（本文原文）
- [[volcano]] —— 传统 exchange/iterator 思路，正好作为 morsel-driven 的对照
- [[volcano-1994]] —— Graefe 系统梳理查询执行技术，能补上历史背景
- [[monetdb-x100-2005]] —— vectorized execution，说明批处理和 pipeline 为什么重要
- [[dash-numa-1992]] —— NUMA 共享内存机器的早期代表，解释硬件背景
- [[neumann-2015-large-joins]] —— 同一研究线继续处理大规模 join 的工程问题

## 关联

- [[codd-1970]] —— SQL 和关系代数的源头，morsel-driven 处理的是这些关系操作的执行问题
- [[volcano]] —— 传统 plan-driven/exchange 并行模型，是本文主要比较对象
- [[monetdb-x100-2005]] —— 向量化执行减少解释器开销，本文进一步处理 many-core 调度
- [[dash-numa-1992]] —— NUMA 让内存访问有远近之分，本文把这个事实写进 dispatcher
- [[neumann-2015-large-joins]] —— hash join 与主内存执行是本文 operator 设计的重要背景
- [[duckdb-2019]] —— 现代分析型单机数据库，也依赖 pipeline 和向量化执行的工程传统
- [[starrocks]] —— MPP/OLAP 系统中的查询并行问题，可以和单机 many-core 并行对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
