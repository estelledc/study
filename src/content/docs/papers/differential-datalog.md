---
title: DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
来源: 'Ryzhyk, Budiu, et al. "Differential Datalog". Datalog 2.0 Workshop 2019'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

DDlog 是一种**增量化 Datalog 引擎**：你写一堆"如果 A 和 B 成立，那么 C 也成立"的规则；它把规则编译成 Rust 程序；运行时给它喂事实，它输出推理结果——**关键是，每次只改一条输入，它只重算受影响的那一小块**。

日常类比：像 Excel 里改一个单元格——所有依赖它的公式自动更新，但**没依赖它的格子动都不动**。DDlog 是把这个增量更新能力做到逻辑推理上：规则集通常不大，但面对**百万级事实/元组**的增删时，只传播受影响的那一小块。

你写：

```
input relation User(id: u32, country: string)
output relation USUser(id: u32) :- User(id, "US").
```

第一次跑：DDlog 扫一遍 `User`，把所有 `country == "US"` 的人挑出来。之后你说"新加一个 user (42, US)"——DDlog **不重扫整张表**，只追加 `USUser(42)`。说"删掉 user 17（原本是 US）"——它只发"USUser(17) 删除"。

底座是 Frank McSherry 的 Differential Dataflow，VMware Research 把它做成 Datalog 前端。

## 为什么重要

不理解 DDlog 这套思路，下面这些事会觉得不可思议：

- 为什么 VMware NSX / OVN 改一条防火墙或网络策略，大规模连接表能毫秒级更新——背后就是 DDlog
- 为什么 IDE（Roslyn / rust-analyzer）改一行代码，全项目的类型错误标记几乎瞬时——增量分析
- 为什么 Materialize 说"SQL 也能流式增量"——底座同属 Frank McSherry 的 Differential Dataflow 一脉（DDlog 是 Ryzhyk/Budiu 做的 Datalog 前端，不是同一作者）
- 为什么"重新跑整个 pipeline" 在大规模数据上是反模式——增量 > 重算

## 核心要点

DDlog 的思路可以拆成 **三步**：

1. **规则 → 算子图**：每条 Datalog 规则被编译成一串 Differential Dataflow 算子（join、map、filter、iterate）。类比：把"if A then B"翻译成一根流水线，A 进 B 出。

2. **差量流（delta stream）**：每个算子收到的不是整张表，而是"刚才哪几行进来了 / 哪几行走了"——这是 differential dataflow 的核心数据形式。带版本戳让多版本能并存。

3. **arrangement**：中间结果会按 join 的键预先索引化（叫 arrangement），后续 join 直接从索引拿数据，不用每次扫全表。代价是内存。

递归（如"祖先关系"）用嵌套迭代算子求不动点——同样是增量的：祖先表里只追加新增的那部分。

三步合起来：**输入差量进来 → 沿着算子图传播 → 输出差量出去**。中间所有"没变的关系"一动不动。

## 实践案例

### 案例 1：传递闭包（祖先关系）

经典 Datalog 例子：

```
input relation Parent(child: string, parent: string)
output relation Ancestor(person: string, ancestor: string)

Ancestor(c, p) :- Parent(c, p).
Ancestor(c, a) :- Parent(c, p), Ancestor(p, a).
```

第一次跑，DDlog 计算出所有 (child, ancestor) 对。然后你**新增一对** `Parent("Eve", "Alice")`：

- 普通 Datalog：把整个 Ancestor 表清空，从头算。
- DDlog：只算"由这条新边能多推出哪些 ancestor 关系"——通常就几条。

数据集大的时候，差距是几个数量级。

### 案例 2：网络防火墙策略（VMware NSX 的真实用法）

```
input relation Connection(src: u32, dst: u32, port: u16)
input relation BlockRule(dst: u32, port: u16)
output relation Blocked(src: u32, dst: u32) :-
    Connection(src, dst, port),
    BlockRule(dst, port).
```

NSX 控制器有几万条 BlockRule、几百万条 Connection。运维往 BlockRule 加**一条**新策略：

- 旧 Java 实现：扫全表重算 Blocked，几百毫秒到几秒
- DDlog：只算这条新规则匹配的 Connection 子集，毫秒级输出新增的 Blocked 行

VMware 的工程团队把这块从 Java 重写成 DDlog 后，规则代码量缩了一个数量级。

### 案例 3：增量指针分析（IDE / 静态分析的典型场景）

源码改了一行 `x = y`，传统 Andersen pointer analysis 要重跑整个项目（几万行代码可能几秒到几十秒）。

DDlog 写成规则后，只有"x 指向什么、谁指向 x 派生出来的链"会被重算——通常只是几十到几百条 fact 的差量。这也是 [[reps-ifds]] 同类问题的另一种解法。

## 踩过的坑

1. **内存吃得多**：每个中间 relation 都被建成 arrangement（带版本戳的索引）留在内存里。规则越多、关系越多，RAM 越大。生产里跑 NSX 控制器经常要几十 GB 内存。

2. **否定和聚合必须分层（stratified）**：不能写"X 不在 Y 里，且 Y 依赖 X"——这种循环否定 DDlog 编译器会直接拒绝。聚合（sum / min / max）也要保证不和递归互相依赖。

3. **编译到 Rust 慢**：一份 100 行 DDlog 规则编出来要几十秒到几分钟才有二进制。改一行规则迭代一次开发体验很重——所以 DDlog 鼓励把"规则集"当库做，不是当脚本。

4. **删除操作有时贵**：min / max 这类聚合，删掉一条原始事实可能让派生表整段重算（因为新的最小值要重新选）。"通常增量便宜" 不等于"所有操作都便宜"。

## 适用 vs 不适用场景

**适用**：

- 输入流式增删、需要持续输出差量的系统（网络控制器、实时风控）
- 静态分析、IDE、增量 build（输入小幅变化、输出大）
- 规则可声明式表达（join + 递归就够），且规则集相对稳定

**不适用**：

- 一次性批处理（重头跑一次就完）——上 [[souffle-datalog]] 更快
- 规则要频繁动态生成 / 改写——DDlog 编译开销太重
- 内存严重受限（嵌入式 / 边缘设备）——arrangement 太占内存
- 需要非分层否定 / well-founded semantics——DDlog 不支持

## 历史小故事（可跳过）

- **2013 年**：Frank McSherry 在 Microsoft Research 做 Naiad，提出 Differential Dataflow——一种带"逻辑时间戳"的算子框架，能做增量计算和迭代。
- **2017 年**：McSherry 离开 MS 创业 Materialize（把 Differential Dataflow 做成 SQL 产品；与后文 DDlog 同底座、不同作者）。
- **2019 年**：VMware Research 的 Leonid Ryzhyk 和 Mihai Budiu 在 Datalog 2.0 Workshop 发表 DDlog——把 Datalog 编译到 Differential Dataflow 上。
- **2020-2021 年**：DDlog 进入 VMware NSX / OVN 相关生产路径，重写网络控制器逻辑；开源。
- **2024 年**：项目归档（VMware 内部用法变化 + 维护者去向调整），但 Differential Dataflow 和 Materialize 仍活跃。

## 学到什么

1. **增量 > 重算** 是大规模系统的根本节奏：能算差量的别算全量
2. **声明式 + 增量** 的组合让运维改一行配置就毫秒生效，工程效率和性能可以同时拿
3. **内存换时间** 是 DDlog 最大的代价——arrangement 把"以后可能用得上的索引"全留下来
4. **学术原型 → 生产引擎** 的桥（Naiad → Differential Dataflow → DDlog → NSX）是过去十年增量计算最完整的一条线

## 延伸阅读

- [DDlog GitHub（已归档）](https://github.com/vmware/differential-datalog) —— 原始仓库 + tutorial，README 写得清楚
- [Frank McSherry blog](https://github.com/frankmcsherry/blog) —— Differential Dataflow 作者博客，几篇文章把核心机制讲透
- [Materialize 文档](https://materialize.com/docs/) —— 同一思路的 SQL 产品化版本
- [[souffle-datalog]] —— 批处理向的 Datalog 引擎，对比理解 DDlog 的"增量 vs 全量"取舍
- [[self-adjusting]] —— Adapton / self-adjusting computation，另一种"输入小变只重算受影响部分"的思路

## 关联

- [[souffle-datalog]] —— Souffle 是批处理向 Datalog；DDlog 是增量向，定位互补
- [[self-adjusting]] —— Self-adjusting computation 的"只重算受影响部分"思路在 DDlog 里以差量流形式实现
- [[salsa-adapton]] —— Rust 生态的增量计算框架（rust-analyzer 用），同问题不同解法
- [[kildall-dataflow]] —— 经典数据流分析框架；DDlog 把它的 fixed-point 求解换成增量版
- [[reps-ifds]] —— IFDS 增量指针分析，DDlog 的天然应用场景
- [[andersen-pointer-analysis]] —— 指针分析经典算法，可用 DDlog 表达成几十行规则
- [[dataflow-model-2015]] —— Google Dataflow 模型，同样是"差量 + 时间戳"的流式计算思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[avgustinov-codeql-2016]] —— QL / CodeQL — 用面向对象外壳写可扩展代码查询
- [[egglog-incremental-2026]] —— Egglog — 把 Datalog 和等式饱和合成一台推理引擎
- [[ethane-2007]] —— Ethane 2007 — 把企业网安全策略集中到一台中央电脑上
- [[naiad-2013]] —— Naiad — 一套引擎同时跑批处理、流处理和迭代计算
- [[naiad-2013-sosp]] —— Naiad — 面向流式数据的及时数据流系统
- [[rethinkdb]] —— RethinkDB — 让数据库自己把更新推给客户端的先驱
