---
title: Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流
来源: 'Goetz Graefe, "Volcano—An Extensible and Parallel Query Evaluation System", IEEE TKDE 6(1) 1994'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

Volcano 是一份**把数据库执行器写成"算子树 + 三函数迭代器"**的设计。日常类比：像一条**自助取餐传送带**——下游饿了喊一声 `next()`，上游做出一份就传一份；不喊就不做。

你写 SQL：

```sql
SELECT name FROM users WHERE age > 18;
```

数据库内部会编译成一棵**算子树**：`Project(name) → Filter(age>18) → Scan(users)`。每个算子都实现三个函数：`Open()` 准备资源、`Next()` 吐一行、`Close()` 收尾。

执行时根节点（Project）调一次 `Next()`，向下传给 Filter，Filter 又向下喊 Scan，Scan 从磁盘读一行回来——再一路向上返回到 Project。**整个执行就是"沿树自顶向下喊、自底向上抬"**，懒得不能再懒。

这套接口让约 32 年后的 PostgreSQL / Oracle / SQL Server / Spark / DuckDB 几乎一字不差地复用。**Volcano 是现代 SQL 执行器的骨架**。

## 为什么重要

不理解 Volcano，下面这些事都没法解释：

- 为什么 PostgreSQL 源码里有 `ExecInitNode` / `ExecProcNode` / `ExecEndNode` 这套三函数——那就是 Open/Next/Close 改了名
- 为什么 Spark 把数据流叫 `Iterator[InternalRow]`，DuckDB 把它叫 `GetChunk()`——都是 Volcano 的变体
- 为什么数据库可以"一份算子代码同时跑串行和并行"——Exchange 算子把并行藏起来了
- 为什么 2010 年代有人写论文骂"迭代器太慢，得做向量化 / 编译"——是在和 Volcano 对话

## 核心要点

Volcano 三个最重要的设计可以拆成 **三层**：

1. **算子 = 迭代器（Open / Next / Close）**：所有算子都长一样的接口。类比：电池标准化以后，任何遥控器都能装任何牌子的 AA 电池——接口比内核更值钱。

2. **拉式执行（pull-based）**：根节点喊 `next()`，往下一路传，叶子节点（Scan）读一行回来。和"推式"（push-based，叶子主动推）相反。拉式简单、好调试、控制反转明确，懒到极致。

3. **Exchange 算子封装并行**：把"跨进程发数据"也包成一个普通迭代器。在算子树里随便插一个 Exchange，上下游就自动变成"两个进程并行跑、Exchange 中间帮你 shuffle"。其它算子完全不知道自己被并行化了。

三层加起来叫 **Volcano model** 或 **iterator model**，也是后来 dataflow toolkit 思想的源头。

## 实践案例

### 案例 1：PostgreSQL 里的 Volcano 接口

打开 Postgres 源码 `src/backend/executor/execProcnode.c`，你会看到：

```c
TupleTableSlot *ExecProcNode(PlanState *node)  // 拉一行，对应 Next()
void ExecInitNode(Plan *node, EState *estate)  // 准备资源，对应 Open()
void ExecEndNode(PlanState *node)              // 收尾，对应 Close()
```

每个算子（SeqScan / HashJoin / Sort / Aggregate）都实现这三个函数。**逐部分解释**：

- `ExecProcNode` 返回一行（一个 `TupleTableSlot`），返回 NULL 表示流结束
- 上层算子拿到一行后做完自己的处理（比如 Filter 判断是否丢掉），再拉下一行
- 整棵树自顶向下递归调用，**和 1994 年论文里画的图一模一样**
- 30 年没换过名字，是接口稳定性的极致案例

### 案例 2：Exchange 算子怎么把并行藏起来

```
Aggregate
   ↓ next()
Exchange(hash by user_id)   ← 把并行性藏在这里
   ↓ next()
Scan(events)
```

**逐部分解释**：

1. 没插 Exchange 时：一个进程里 Aggregate 喊 `next()` → Scan 吐一行 → 再聚合
2. 插上 Exchange 后：Scan 在 4 个 worker 上并行扫表；Exchange 按 `user_id` 哈希把行分到上游 4 个 Aggregate（这叫 shuffle，像分拣口把包裹分到不同传送带）
3. Aggregate 仍只看见普通的 `next()`——**完全感知不到自己被并行化**

杀手锏：**并行性是可插拔的 wrapper，不污染算子代码**。

### 案例 3：DuckDB 把 Next() 升级成按批取数

原版 Volcano 一次端一盘菜（一行）；DuckDB 一次端一托盘（一批行）。接口仍叫「拉下一批」，源码里对应 `GetChunk` / `Execute` 这类按批返回：

```cpp
// 概念接口：一次填满一个 DataChunk（约 1024 行），而不是 1 行
OperatorResultType Execute(DataChunk &input, DataChunk &chunk, ...);
```

**这就是向量化执行**——保留算子树形状，把"一行一调用"改成"一批一调用"，摊平每次虚函数跳转的开销。对照原版，差别只在**颗粒度**：行 → 批。Volcano 骨架还活着，只是吃了药变快了。

## 踩过的坑

1. **以为 Volcano = 1990 年那篇短文**：1990 是初版，1994 TKDE 才是定稿，含完整 Exchange 算子和 dataflow toolkit 设计；课件常引错。

2. **以为迭代器模型必然慢**：慢是 per-tuple virtual call + 缓存不友好的现代 CPU 现象。1994 年瓶颈在磁盘 IO，迭代器的简洁性远胜性能开销；2000s CPU 加速后才暴露问题。

3. **把 Exchange 当成"shuffle 算子"**：它是一个能在任意位置插入的并行性 wrapper，可同时实现 producer/consumer 解耦、partition 重分布、pipeline 并行——shuffle 只是它的一种用法。

4. **以为 Volcano 已经死了**：Postgres / DuckDB / Spark SQL 物理算子接口几乎一字不差就是 Open/Next/Close；ClickHouse / Snowflake 也是迭代器加上向量化扩展。骨架还活着。

## 适用 vs 不适用场景

**适用**：

- SQL 数据库执行器骨架（OLTP / OLAP 都行）
- 需要把"算子组合"和"并行硬件"解耦的批处理系统（Spark / Flink）
- 教学：第一次理解"查询计划如何变成可执行代码"
- 需要支持任意算子组合的 dataflow 框架（即使不是 SQL）

**不适用**：

- 极致 OLAP、CPU 已是瓶颈（扫描吞吐要逼近内存带宽）→ 向量化（DuckDB）或编译（HyPer / Photon）
- 实时流处理且单行延迟要亚毫秒 → push-based（Flink）更自然
- 嵌入式键值访问（不需要算子组合）→ 直接调存储引擎更简单

## 历史小故事（可跳过）

- **1986 年**：Goetz Graefe 在 Wisconsin-Madison 读博，做 EXODUS 可扩展数据库的执行器，是 Volcano 的前身
- **1990 年**：发表 Volcano 短文，提出迭代器接口和 Exchange 算子
- **1994 年**：在 IEEE TKDE 6(1) 发表完整版（本笔记主角），把 1990 短文 + 后续工作整合
- **1995 年**：Graefe 发表 **Cascades 优化器框架**，影响 SQL Server / CockroachDB / Calcite
- **2005 年**：MonetDB/X100 提出向量化执行，对 Volcano 的"per-tuple 调用"开刀，但保留树形
- **2011 年**：Neumann 在 VLDB 用 HyPer 提出 push-based 编译执行，正式向 Volcano 模型发起挑战；2024 年 Volcano-style 仍是工业主流

## 学到什么

1. **接口的力量**：三个函数的简单接口（Open / Next / Close）比再花哨的具体实现更值钱——这是 32 年后还在用的根本原因
2. **抽象隔离硬件**：Exchange 算子让"算子代码"和"并行硬件"解耦，是 dataflow 系统的一次设计胜利
3. **简洁 > 性能**：1994 年选简洁，是因为瓶颈在 IO；今天有人选编译，是因为瓶颈在 CPU。**架构选择跟着瓶颈走**
4. **向量化是 Volcano 的子代而非反对者**：DuckDB / ClickHouse 保留树形 + 迭代器，只把"行"改成"批"
5. **学一个范式，先学它的接口而不是它的实现**：迭代器三函数比具体算子代码更应该背下来

## 延伸阅读

- 论文 PDF：[Volcano TKDE 1994](https://paperhub.s3.amazonaws.com/dace52a42c07f7f8348b08dc2b186061.pdf)（16 页，可读性高）
- 视频教程：[CMU 15-445 Lecture 12 — Query Execution](https://www.youtube.com/watch?v=vrid7lG8H2A)（Andy Pavlo 把 Volcano / 向量化 / 编译三种模型讲一遍）
- 对照实现：[postgres/postgres `src/backend/executor`](https://github.com/postgres/postgres/tree/master/src/backend/executor)（Volcano 工业落地的活样本）
- [[selinger-1979]] —— 优化器决定算子树长什么样，Volcano 决定算子树怎么跑
- [[system-r-1976]] —— 第一个完整 SQL 系统，确定了"优化 + 执行"分层

## 关联

- [[selinger-1979]] —— 查询优化器：Volcano 是它的下游，优化器选好计划后由 Volcano 执行
- [[system-r-1976]] —— SQL 数据库的祖先，定义了"优化器 → 执行器"的分工模式
- [[aries-1992]] —— 同年代的恢复算法：Volcano 管"读"，ARIES 管"写后崩溃恢复"
- [[bernstein-1981-cc]] —— 并发控制：Volcano 在事务上层跑，并发控制管事务之间互不踩
- [[spanner]] —— 现代分布式数据库执行器，仍是迭代器 + Exchange 的变体（跨数据中心）
- [[bigtable]] —— 列式存储 + 迭代器接口，证明 Volcano 模式不限于关系型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[benchmarking]] —— Wisconsin Benchmark — 给数据库出一套可重复的体检题
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[papers/clickhouse]] —— ClickHouse — 把列存 OLAP 推到硬件极限
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[distserve]] —— DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
- [[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— DryadLINQ — 把普通 C# 查询变成集群作业
- [[duckdb-2019]] —— DuckDB — 把 OLAP 数据库塞进你的 Python 进程
- [[efficient-compile-2011]] —— Efficient Compile 2011 — 把 SQL 查询编译成贴近 CPU 的机器码
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[leis-2015-optimizers]] —— Leis 2015 — 用真实数据打脸所有数据库的查询优化器
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[morsel-driven-2014]] —— Morsel-Driven Parallelism — 把 SQL 查询切成小口分给多核
- [[neumann-2015-large-joins]] —— Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[papers/vllm]] —— vLLM — 把操作系统的分页搬进 GPU KV cache
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[pandas]] —— pandas — Python 表格数据事实标准
- [[polars]] —— Polars — Rust 写的列存 DataFrame
