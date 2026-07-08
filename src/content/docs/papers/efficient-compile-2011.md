---
title: Efficient Compile 2011 — 把 SQL 查询编译成贴近 CPU 的机器码
来源: 'Thomas Neumann, "Efficiently Compiling Efficient Query Plans for Modern Hardware", PVLDB/VLDB 2011, DOI: 10.14778/2002938.2002940'
日期: 2026-05-29
分类: databases
难度: 中级
---

## 是什么

Efficient Compile 2011 是一篇讲**数据库不要一行一行解释执行查询，而要把 SQL 查询编译成紧凑机器码**的论文。日常类比：传统数据库像服务员每端一道菜都回厨房问一次“下一步做什么”，这篇论文像把整张菜单提前排成一条流水线，让食材一路走到出餐口。

它的核心名字叫 **data-centric query compilation**。意思不是“把每个算子都写得更快”，而是“让数据一路待在 CPU 寄存器里，直到不得不写进哈希表、排序区、聚合表这类内存结构”。

论文把这个想法接进 HyPer 主内存数据库，用 LLVM 在运行时生成机器码。结果很有标志性：在 TPC-CH 前五个 OLAP 查询里，HyPer+LLVM 经常比 HyPer 旧的 C++ 生成后端快，编译时间也从上千毫秒降到几十毫秒。

## 为什么重要

不理解这篇论文，下面这些事都很难解释：

- 为什么数据库执行 SQL 的瓶颈会从磁盘 I/O 转到 CPU 分支预测、指令缓存、数据缓存
- 为什么 Volcano iterator 的 `next()` 接口很优雅，却会在现代 CPU 上产生大量函数调用和分支错误
- 为什么 MonetDB/X100 的向量化已经很快，Neumann 仍然认为“编译整条 pipeline”还能继续榨性能
- 为什么 HyPer、Umbra、DuckDB 等现代查询引擎都会认真讨论 push pipeline、JIT、vectorized execution 的取舍

## 核心要点

Efficient Compile 2011 可以拆成 **三件事**：

1. **从 operator-centric 换成 data-centric**：传统执行器把 scan、filter、join、aggregate 当成一个个独立小柜台。data-centric 像让同一张订单穿过多个工位，能在寄存器里完成的事就不落盘、不落内存。

2. **从 pull 换成 push**：Volcano 模型是上层算子不断向下层要下一行。Neumann 反过来，让下层把 tuple 推给上层，直到遇到 pipeline breaker，像快递一路派送到必须入仓的节点。

3. **用 LLVM 生成热路径机器码**：复杂数据结构仍可用 C++ 写，真正对每个 tuple 重复执行的热循环交给 LLVM。类比：后台管理系统不用重写，但收银台那条最忙的通道要专门铺一条直达线。

## 实践案例

### 案例 1：一个 SQL 为什么不适合反复 `next()`

先看一个简单查询：

```sql
select count(*)
from orderline
where ol_o_id > 0 and ol_d_id > 0 and ol_w_id > 0;
```

传统 iterator 会把它拆成 scan、selection、selection、selection、aggregate：

```txt
aggregate.next()
  selection3.next()
    selection2.next()
      selection1.next()
        scan.next()
```

**逐部分解释**：

- 每个 `next()` 都像问下一个窗口“还有一行吗”
- tuple 每过一个算子边界，控制流就跳一次，CPU 很难预测
- 如果数据都在内存里，这些函数调用和分支就成了主要成本

论文的 microbenchmark 正是用这类级联 selection 看数据传递开销。结论是：解释式 iterator 最慢，编译后的 iterator 好一些，block-wise 更好，而 data-centric 编译在这些查询上最稳。

### 案例 2：push pipeline 把多个算子揉成一段代码

同样的逻辑，在 data-centric 视角下更像这样：

```txt
for tuple in orderline:
    if ol_o_id <= 0: continue
    if ol_d_id <= 0: continue
    if ol_w_id <= 0: continue
    count += 1
```

**逐部分解释**：

- `scan` 不再把 tuple 交给一个通用 `next()` 接口，而是直接进入过滤逻辑
- 三个 selection 不需要各自保存状态，能合并进一个紧凑循环
- `count` 是最后的 pipeline breaker，因为聚合状态必须被更新

这就是“operator 边界在编译器里存在，在生成代码里消失”。开发者仍然可以用代数算子优化查询，但机器真正运行的是更直的 imperative code。

### 案例 3：produce / consume 是编译器里的心智模型

论文没有让运行时代码真的调用 `produce()` 和 `consume()`，而是用它们指导代码生成：

```txt
Scan.produce():
  for tuple in table:
    parent.consume(tuple)

Select.consume(tuple):
  if condition(tuple):
    parent.consume(tuple)

HashJoin.consume(tuple, left):
  materialize tuple into hash table
```

**逐部分解释**：

- `produce()` 表示“请这个算子生成它能给出的数据”
- `consume()` 表示“父算子拿到一条数据后要怎么继续”
- 编译器沿着这两个动作展开代码，直到遇到 join、group by、sort 这类 pipeline breaker

这个接口保留了 iterator 的可组合性，但把运行时的通用函数调用搬到了编译阶段。也就是说，抽象留给编译器，热路径留给机器码。

### 案例 4：分支形状也会影响查询速度

论文专门提醒，哈希表查找里的分支要让 CPU 好预测：

```cpp
Entry* iter = hashTable[hash];
if (iter) do {
    inspect(iter);
    iter = iter->next;
} while (iter);
```

**逐部分解释**：

- 先判断 bucket 是否为空，这个分支通常很稳定
- 再在短 collision list 里循环，这个分支也通常很快结束
- 论文报告，仅调整这种分支结构，哈希表查找就有超过 20% 的改善

这说明 JIT 不是“把 SQL 翻译成 C++ 就完事”，而是要理解 CPU 的预测、缓存和寄存器压力。

## 踩过的坑

1. **把“编译查询”理解成只消除解释器开销**：真正收益来自 pipeline fusion、寄存器驻留和分支布局，否则编译后的 iterator 仍然会被算子边界拖慢。

2. **以为 push 比 pull 一定更简单**：push 让热路径更快，但 join、outer join、sort 会把一个算子的逻辑拆到多个 code fragment，编译器实现更复杂。

3. **以为所有代码都该生成 LLVM**：论文明确保留 C++ 处理复杂数据结构和溢写逻辑，只要求 99% tuple 都走纯 LLVM 热路径。

4. **只看执行时间不看编译时间**：C++ 生成代码也可能跑得快，但运行时编译要几秒就不适合交互查询；LLVM 的几十毫秒编译时间才是工程关键。

## 适用 vs 不适用场景

**适用**：

- 主内存 OLAP 查询，数据已经在内存里，CPU 成本比磁盘 I/O 更显眼
- 重复执行的 prepared query，编译成本可以被多次执行摊薄
- pipeline 清晰、过滤和聚合较多的查询，能把中间 tuple 留在寄存器里
- 需要跟现代编译器优化、CPU 分支预测、缓存 locality 联动的查询引擎

**不适用**：

- 极短一次性查询，编译时间可能超过执行时间
- 主要瓶颈在远程 I/O、网络、锁竞争的系统，机器码再紧凑也救不了
- 大量动态 UDF 或解释型扩展混在热路径里，LLVM 很难看穿这些边界
- 更需要可调试性和快速迭代的教学执行器，iterator 模型会更容易讲清楚

## 历史小故事（可跳过）

- **1974 年前后**：早期关系数据库已经有 tuple-at-a-time 的执行思路，接口简单，适合磁盘主导时代。
- **1993-1994 年**：Volcano 把 iterator 和 extensible query processing 推成经典架构，`next()` 成了教科书模型。
- **2005 年**：MonetDB/X100 证明 vectorized execution 能显著改善 CPU cache 行为，把“一批一批处理”带回舞台中央。
- **2011 年**：Thomas Neumann 在 HyPer 中提出 data-centric query compilation，用 LLVM 把查询编译成机器码。
- **2014 年以后**：HyPer/Umbra 路线继续发展出 morsel-driven parallelism，说明 pipeline breaker 也可以成为并行调度边界。

## 学到什么

1. **数据库执行器的抽象边界不一定要暴露给 CPU**：优化器可以保留代数树，生成代码可以抹平算子边界。
2. **现代硬件不是“更快的老机器”**：函数调用、分支预测、I-cache、D-cache 都会影响 SQL 执行。
3. **JIT 的价值在热路径**：复杂少见路径可以留给 C++，频繁 tuple loop 才值得生成机器码。
4. **向量化和编译不是非此即彼**：论文站在编译一边，但后续研究会继续比较两者怎样组合。

## 延伸阅读

- 论文 PDF：[Thomas Neumann 2011](https://www.vldb.org/pvldb/vol4/p539-neumann.pdf)（原文，重点看 Section 3、4、6）
- [[monetdb-x100-2005]] —— 向量化执行的代表，正是这篇论文要超越的强基线
- [[volcano-1994]] —— iterator/pull 模型的经典来源，理解它才能理解 Neumann 在反对什么
- [[llvm]] —— 运行时生成机器码的基础设施，给 HyPer 提供可移植 JIT 后端
- [[branch-prediction-yeh-patt-1991]] —— 分支预测为什么会决定热循环速度
- [[morsel-driven-parallelism-2014]] —— HyPer 后续把 pipeline fragment 继续用于多核并行调度

## 关联

- [[codd-1970]] —— 关系模型定义了 SQL 背后的代数对象，这篇讨论如何高效执行它们
- [[cascades-1995]] —— Cascades 关注怎么选好计划，Neumann 关注选好计划后怎么跑得贴近硬件
- [[volcano]] —— Volcano 给了优雅执行接口，也留下 tuple-at-a-time 的 CPU 成本
- [[monetdb-x100-2005]] —— X100 用 vectorized chunk 降低函数调用开销，是 data-centric 编译的主要对照
- [[llvm]] —— LLVM 让数据库不必自己写寄存器分配器和机器码后端
- [[cstore-2005]] —— 列存让扫描更接近内存带宽上限，data-centric 编译进一步减少 CPU 浪费
- [[duckdb-2019]] —— 现代嵌入式分析数据库，适合对比 vectorized execution 与 compilation 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
