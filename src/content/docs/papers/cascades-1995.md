---
title: Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
来源: 'Goetz Graefe, "The Cascades Framework for Query Optimization", IEEE Data Engineering Bulletin 18(3) 1995'
日期: 2026-05-30
分类: 数据库
难度: 高级
---

## 是什么

Cascades 是一份**教 DBMS 怎么写"基于代价 + 基于规则"的查询优化器**的设计。日常类比：像**搭乐高城堡**——给你一堆"等价变换规则"（积木），一个共享的"已搭区"（Memo），一个调度员一块块拼装并比价，最后挑最便宜的方案。

你写 SQL：

```sql
SELECT * FROM A JOIN B JOIN C WHERE A.x = B.x AND B.y = C.y;
```

数据库内部要在**几十种执行顺序**里挑最快的。Cascades 把"挑"这件事拆成两层：**规则**说"`A ⋈ B` 等价于 `B ⋈ A`、可以换 HashJoin / SortMergeJoin"，**Memo** 把所有等价表达式共享存一份，**Task 调度器**自顶向下展开搜索、用代价剪枝。

这套骨架被 SQL Server / Greenplum ORCA / Apache Calcite / CockroachDB 几乎一字不差地搬过去。**Cascades 是 30 年间工业级查询优化器的标准答案**。

## 为什么重要

不理解 Cascades，下面这些事都没法解释：

- 为什么 SQL Server 加新优化规则只要写一个类，不用改优化器主循环
- 为什么 Calcite 文档里反复出现 `RelRule` `RuleSet` `VolcanoPlanner`——名字是 Volcano，机制是 Cascades
- 为什么 CockroachDB 2018 重写优化器要从一篇 23 年前的 8 页论文起步
- 为什么"规则可扩展"和"基于代价剪枝"几十年里都被绑在一起讲

## 核心要点

Cascades 的设计可以拆成 **三件事**：

1. **Memo = 共享等价表达式仓库**：每个 Group 装一族等价的 GroupExpression（如 `A⋈B` 和 `B⋈A` 同 Group）。类比：思维导图里同一个想法只画一个圈，新分支直接接进去——不重复存。

2. **规则 = 用 Pattern + Substitution 描述"怎么变"**：Transformation Rule 在逻辑空间内变换（join 交换律、谓词下推），Implementation Rule 把逻辑算子映射到物理算子（HashJoin / SortMergeJoin）。规则全是数据，不是 if-else。

3. **Task = 自顶向下任务驱动 + 代价剪枝**：调度器有一个任务栈：`OptimizeGroup → ExploreGroup → OptimizeExpr → ApplyRule → OptimizeInputs`。每展开一个新计划就和当前最优比较，超 bound 直接砍。

三件事加起来叫 **Cascades framework**，相比前作 Volcano 优化器最大的改动是**面向对象 + 自顶向下**。

## 实践案例

### 案例 1：SQL Server 把 Cascades 一比一搬进商用引擎

Graefe 1996 加入微软，把 Cascades 当成 SQL Server 7.0 (1998) 后的优化器骨架。**逐部分解释**：

- 内部有一个 Memo 类，对应论文的 Memo 表
- 每条优化规则是一个 C++ 类，继承 `CRule`，实现 `Promise()`（这条规则该不该被试）和 `Transform()`（怎么变）
- 任务栈用 `CGroupOptimizer` 实现，对应论文的 OptimizeGroup
- 加新优化只要新增一个 Rule 类、注册进 ruleset，**不改主循环**

这就是论文承诺的"可扩展"在工业落地的样子。每个 SQL Server 版本能加几十条新规则，靠的是这层架构。

### 案例 2：Apache Calcite 的 VolcanoPlanner 其实是 Cascades

```java
public class JoinCommuteRule extends RelRule<JoinCommuteRule.Config> {
  public void onMatch(RelOptRuleCall call) {
    Join join = call.rel(0);
    Join swapped = JoinCommuteRule.swap(join, /*swapOuter=*/false);
    call.transformTo(swapped);
  }
}
```

**逐部分解释**：

- `RelRule` 是规则基类——对应 Cascades 的 Rule
- `onMatch` 里用 `transformTo` 把新表达式塞回 Memo——对应 ApplyRule 后入 Memo
- `VolcanoPlanner` 类名沿袭 1993 Volcano，但内部 Memo + Task + Rule 的结构纯属 Cascades

Hive / Flink / Drill / Beam 都用这同一套引擎，**一份 Cascades 实现服务整个 Apache 数据生态**。

### 案例 3：CockroachDB 用 .opt DSL 把规则编译成 Go 代码

```
[CommuteJoin, Normalize]
(InnerJoin $left:* $right:* $on:* $private:*)
=>
(InnerJoin $right $left (CommuteJoinFlags $on) $private)
```

**逐部分解释**：

- 这是 CockroachDB 的 Optgen DSL，每条规则一个文件
- 编译期 Optgen 把它生成 Go 代码，注册进 Memo
- Pattern 匹配逻辑、Substitution 替换、cost-based 选优全在生成的代码里跑

CockroachDB 团队 2018 的工程博客直说："架构来自 Cascades 论文"。从 1995 一篇 8 页论文到 2018 的 Go DSL，**搜索结构没换过**。

## 踩过的坑

1. **把 Cascades 等同于 Volcano**：Volcano 是 1993 年的优化器生成器（自下而上 DP + 规则），Cascades 是 1995 年重写版（自顶向下任务驱动 + 面向对象 + Memo）；两者算法和代码结构都不同。

2. **以为 Memo 只是缓存**：Memo 同时承担"共享等价表达式存储"和"代价剪枝边界"两个职责，winners 缓存的是 cost-bounded 的当前最优，错过 bound 不是 bug 而是设计。

3. **混淆 Transformation Rule 和 Implementation Rule**：前者只在逻辑代数里变换（join 交换、子查询展开），后者把逻辑算子映射到物理算子（HashJoin / SortMergeJoin）；混着写会让搜索空间爆炸或漏物理选项。

4. **以为分阶段搜索是可选优化**：在大查询里 logical exploration 必须先于 physical implementation，否则物理算子会基于不完整的逻辑空间挑选；这是工业实现常见的踩坑根源。

## 适用 vs 不适用场景

**适用**：

- 商用 / 开源关系型数据库优化器（SQL Server / CockroachDB / Calcite / ORCA）
- 需要"加规则就能扩展"的大型 OLAP 系统（Greenplum / Doris / StarRocks）
- 需要复用同一套优化引擎服务多个查询语言的场景（Calcite 给 Hive / Flink / Drill）
- 教学：第一次理解"为什么优化器要分逻辑/物理 + 用 Memo + 任务驱动"

**不适用**：

- 简单查询场景（OLTP 单表点查）→ 启发式 rewriter 就够，不必上 Memo
- 查询规则极少且固定的小型嵌入式 DB → 写死优化路径更简单
- 实时流处理优化（窗口语义动态变）→ 静态搜索空间假设不成立
- 学习路径上还没看过 Volcano / Selinger 的人 → Cascades 直接读会很难，先打底
- 极端低延迟需求（亚毫秒优化预算）→ 任务调度本身有开销，固定计划更省

## 历史小故事（可跳过）

- **1986-1987 年**：Graefe 在 Wisconsin-Madison 做 EXODUS 可扩展数据库，第一次引入"用规则描述变换"，但缺代价模型
- **1993 年**：Graefe 在 Portland State 发表 Volcano 优化器生成器，加上代价模型 + 自下而上动态规划，但代码组织过程式
- **1995 年**：在 IEEE Data Engineering Bulletin 发表 Cascades，自顶向下任务驱动 + 面向对象 + Memo 共享子表达式（本笔记主角）
- **1996 年**：Graefe 加入 Microsoft，把 Cascades 直接作为 SQL Server 7.0 (1998) 后优化器骨架
- **2014 年**：Greenplum 团队在 SIGMOD 发表 ORCA 论文，公开 Cascades 风格的开源实现
- **2018 年**：CockroachDB 重写优化器，再次以 Cascades 为蓝本
- **2020s**：Apache Calcite 成为 Hive / Flink / Drill / Beam 共享优化引擎，活成 Cascades 在开源生态的代理人

## 学到什么

1. **规则即数据**：把"怎么变"写成 Pattern + Substitution 数据，比写成 if-else 代码可扩展性高一个量级——这是 30 年没换过的根因
2. **共享胜过复制**：Memo 让等价表达式只存一份，搜索空间从指数级降到多项式级；面对组合爆炸先想"能不能共享"
3. **任务驱动 = 控制反转**：把"优化"拆成可压栈的任务（OptimizeGroup / ApplyRule / ...），比一个大 while 循环灵活——便于剪枝、便于并行、便于调试
4. **抽象骨架 + 大量插件 > 大一统**：SQL Server 几百条规则、Calcite 上千条规则都靠同一套骨架；学一个范式要学骨架而不是规则集
5. **代价剪枝必须和搜索同时设计**：Cascades 的剪枝边界是搜索任务的一部分，不是搜完再过滤——这点决定了它能在大查询里 still 收敛

## 延伸阅读

- 论文 PDF：[The Cascades Framework for Query Optimization (1995)](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.39.819&rep=rep1&type=pdf)（8 页，工业骨架级文献）
- 视频教程：[CMU 15-721 Lecture 13 — Query Optimization](https://www.youtube.com/watch?v=lUhlS0vp51Y)（Andy Pavlo 讲 Cascades / Volcano 对比）
- 工程博客：[CockroachDB SQL Optimizer](https://www.cockroachlabs.com/blog/building-cockroachdb-cascades-style-optimizer/)（2018 重写过程）
- 开源参考：[Apache Calcite VolcanoPlanner](https://github.com/apache/calcite/tree/main/core/src/main/java/org/apache/calcite/plan/volcano)（活的 Cascades 实现）
- [[volcano-1994]] —— 同作者前作执行器，Cascades 优化器选好计划后由 Volcano 执行
- [[selinger-1979]] —— System R 优化器，Cascades 的代价模型源头

## 关联

- [[volcano-1994]] —— 同作者执行器框架：Cascades 出计划，Volcano 跑计划，配合形成完整 SQL 引擎
- [[selinger-1979]] —— 第一个基于代价的优化器：Cascades 沿用代价剪枝思想但换了搜索结构
- [[system-r-1976]] —— SQL 数据库的祖先，定义"优化器→执行器"分工，Cascades 是优化器侧的现代答案
- [[codd-1970]] —— 关系代数：Cascades 的 Transformation Rule 全部是关系代数等价变换
- [[aries-1992]] —— 同年代恢复算法：Cascades 管"读出最优计划"，ARIES 管"写后崩溃恢复"，并列出现在工业 DB
- [[bernstein-1981-cc]] —— 并发控制：Cascades 在事务上层跑，并发控制管事务之间互不踩
- [[cockroachdb]] —— 2018 直接照本论文重写优化器骨架的活样本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/clickhouse]] —— ClickHouse — 把列存 OLAP 推到硬件极限
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[efficient-compile-2011]] —— Efficient Compile 2011 — 把 SQL 查询编译成贴近 CPU 的机器码
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[leis-2015-optimizers]] —— Leis 2015 — 用真实数据打脸所有数据库的查询优化器
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[neumann-2015-large-joins]] —— Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[papers/vllm]] —— vLLM — 把操作系统的分页搬进 GPU KV cache
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[wco-joins-relational-2020]] —— WCO Joins 2020 — 把最坏情况最优连接搬进关系数据库
