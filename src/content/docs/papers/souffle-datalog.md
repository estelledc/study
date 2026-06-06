---
title: Soufflé — 把 Datalog 编译成 C++ 让程序分析跑得动
来源: Scholz, Jordan, Subotić, Westmann, "On Fast Large-Scale Program Analysis in Datalog", CC 2016
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

Soufflé 是一个**把 Datalog 规则当源码、编译成 C++ 二进制再跑**的引擎。日常类比：你把 SQL 查询不再交给数据库解释执行，而是把它翻译成一份 C++ 程序，编译完直接跑——快几个数量级。

Datalog 长得像逻辑题：

```prolog
reachable(X, Y) :- edge(X, Y).
reachable(X, Z) :- reachable(X, Y), edge(Y, Z).
```

意思是"从 X 能到 Y，如果有直接边；或者能先到中间点 Y 再到 Z"。

Soufflé 把这两条规则**编译**成一份递推 C++ 程序，自动挑索引、自动并行。在指针分析这种动辄几亿条 fact 的场景，原来跑 1 小时的 query 变成 1 分钟。

## 为什么重要

不理解 Soufflé，下面这些事都没法解释：

- 为什么 Java 指针分析框架 Doop 能在百万行代码上跑出"哪个变量可能指向哪个对象"
- 为什么以太坊智能合约的安全扫描器（Vandal、MadMax）用的是 Datalog 不是手写分析
- 为什么近 10 年新开源的程序分析工具，越来越多选择"用 Datalog 写 query，让引擎管性能"
- 为什么 CodeQL 这种产品级代码扫描会把 query 语言做成关系式

一句话：**Soufflé 让"声明式写分析、底层照样飞快"成为现实**，否则 Datalog 永远只是教科书里的好东西。

## 核心要点

Soufflé 把 Datalog 程序跑快，靠 **四个支柱**：

1. **编译而非解释**：传统 Datalog 引擎（bddbddb、IRIS）边读边算，每条规则都要去查表。Soufflé 把规则翻成 RAM（Relational Algebra Machine）中间表示，再生成 C++，最后用 g++/clang 编译。手写 C++ 怎么快它就怎么快。

2. **半朴素求值（semi-naive）**：递推时只用"上一轮新产生的 fact"驱动计算，不重算已经有的。类比：你拼拼图，每加一片只检查它能跟哪些已拼好的拼上，不用整桌重扫。

3. **自动索引选择**：每条规则要按某些列查表。Soufflé 静态分析所有规则的访问模式，自动决定每个 relation 建哪几个 B-tree 索引。等价于"看 query 自动建索引"。

4. **并行 + 锁无关数据结构**：B-tree 用 lock-free 实现，多线程同时插入。等价类（union-find）也有专门的并行版本。

四条加起来：在 Doop 的 Java 指针分析 benchmark 上，比 LogicBlox（当时最快的商业 Datalog 引擎）快 2-5 倍，比 bddbddb 快 10 倍以上。

## 实践案例

### 案例 1：图可达性查询

```prolog
.decl edge(x:number, y:number)
.decl reachable(x:number, y:number)
.input edge
.output reachable

reachable(x, y) :- edge(x, y).
reachable(x, z) :- reachable(x, y), edge(y, z).
```

Soufflé 编译成 C++ 后：

- 给 `edge` 自动建按 x 排的 B-tree（因为第二条规则里 `edge(y, z)` 要按 y 查）
- 半朴素求值：第 N 轮只用 N-1 轮新增的 reachable 与 edge join
- 多线程并行做 join

输入百万条 edge，秒级跑完。手写 BFS C++ 也就这个量级。

### 案例 2：Doop 指针分析

Doop 是 Yannis Smaragdakis 团队写的 Java 指针分析框架，**整套规则就是 Datalog**：

```prolog
VarPointsTo(var, obj) :- AssignHeapAllocation(obj, var).
VarPointsTo(to, obj) :- Assign(from, to), VarPointsTo(from, obj).
VarPointsTo(this, obj) :- 
    VirtualMethodInvocation(invo, sig, base),
    VarPointsTo(base, obj),
    LookupMethodOf(obj, sig, method),
    ThisVar(method, this).
```

读起来像数学定义，没有循环没有状态。Soufflé 在背后跑出"百万行 Java 代码每个变量指向哪些对象"。在 Soufflé 之前，同样的 Doop 规则用 LogicBlox 跑要 30 分钟，Soufflé 跑 5 分钟。

### 案例 3：智能合约漏洞扫描

Vandal 把以太坊字节码反编译成关系式 fact（`def(var, bytecode_pos)`、`use(var, bytecode_pos)` 等），再用 Datalog 写"哪些 storage 写入是 reentrancy 风险"的 query。规则几十行就能表达手写分析几千行的事。

## 踩过的坑

1. **递归 + negation 要小心 stratification**：`a :- not b.` 和 `b :- not a.` 同时存在就矛盾。Soufflé 静态检查规则分层，分不出层就拒绝。新人常踩。

2. **大 relation 的内存压力**：Soufflé 把所有 fact 装内存。Doop 在 OpenJDK 全程序分析时能吃几十 G。生产环境必须配大内存机器或用 disk-backed 模式。

3. **索引选错性能差几十倍**：自动索引选择不是万能的。复杂规则有时需要手动加 `.plan` 提示告诉它先 join 哪一对。debug 时要看 profile 报告。

4. **Datalog 不是 SQL**：没有 `count(*)` `group by` 的天然支持。Soufflé 加了 aggregate 扩展但语义微妙——同一条规则里多个 aggregate 可能死锁。

## 适用 vs 不适用场景

**适用**：

- 程序分析（指针、taint、类型推导、call graph）——本身就是不动点递推
- 图算法（可达、最短路、强连通分量）——Datalog 的天然舞台
- 业务规则引擎（合规检查、权限推导）——规则可读性比性能更重要
- 安全审计 query（"哪些函数没检查权限就读了 storage"）

**不适用**：

- 需要任意 Turing 完备表达——Datalog 是有限固定点逻辑，递归只能在 relation 上
- 需要浮点 / 复杂数值——Soufflé 主打整数和符号，做不动数值线性代数
- 流式 / 增量更新——传统 Soufflé 是 batch 模式，要增量得用衍生品 DDLog
- 数据规模超内存——除非用 disk-backed 模式，否则吃内存吃到崩

## 历史小故事（可跳过）

- **1977 年**：Aho 和 Ullman 给 Datalog 这个名字，意思是"data 的 Prolog"。但当时没人当真——大家觉得递归 query 跑不动。
- **1989 年**：Naughton、Ramakrishnan、Sagiv、Ullman 提出 magic sets 重写，让递归 query 能像 query 引擎一样剪枝。理论奠基。
- **2004 年**：Whaley & Lam 用 BDD（二叉决策图）表示 relation 做 Java 指针分析（bddbddb），第一次让 Datalog 跑动百万行代码。但 BDD 编程门槛高、不能并行。
- **2016 年**：Scholz 等在 Oracle Labs 发表本论文。把 Datalog 编译成 C++ 听起来朴素，但工程细节（索引、并行、半朴素）做到位才能赢 BDD。
- **2016 年至今**：Soufflé 开源，被 Doop、Vandal、各种学术工具采纳，成了"工业级 Datalog 引擎"的事实标准。

## 学到什么

1. **声明式不等于慢**——只要 compile 而非 interpret，加上认真做索引和并行，声明式语言可以逼近手写 C++
2. **抽象层次往上抬，工程问题往下压**——用户写 Datalog（高层），引擎管 RAM、C++、索引、并行（底层）。这是 90% 现代系统的设计哲学
3. **半朴素求值** 是任何递推算法都该会的优化模式：只用增量驱动下一轮，不重算
4. **领域专用语言（DSL）的胜利路径**：先证明它表达力够（80 年代 Datalog），再证明能跑动（Soufflé 2016），最后才会被产业采纳

## 延伸阅读

- 论文 PDF（12 页）：[Scholz et al. CC 2016](https://souffle-lang.github.io/pdf/cc.pdf)
- 官方 tutorial：[souffle-lang.github.io](https://souffle-lang.github.io/)（含可在浏览器跑的例子）
- Doop 框架：[bitbucket.org/yanniss/doop](https://bitbucket.org/yanniss/doop)（看真实工业 Datalog 长什么样）
- 综述：Smaragdakis & Bravenboer "Pointer Analysis with Datalog"（2010）—— Doop 论文，理解 Datalog 怎么在程序分析里被用
- [[whaley-bddbddb]] —— Soufflé 之前的 BDD 路线
- [[andersen-pointer-analysis]] —— Datalog 写指针分析的经典 benchmark

## 关联

- [[andersen-pointer-analysis]] —— Andersen 风格的指针分析，正是 Doop 用 Datalog 实现的底层算法
- [[steensgaard-pointer]] —— 另一种指针分析风格，也能用 Datalog 表达
- [[whaley-bddbddb]] —— Soufflé 之前 Datalog 程序分析的 BDD 路线代表
- [[wam-warren]] —— WAM 让 Prolog 跑得快的抽象机；Soufflé 在做的是 Datalog 版的"WAM"
- [[differential-dataflow]] —— 增量 Datalog 路线（DDLog 的精神祖先）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[differential-datalog]] —— DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
- [[ethane-2007]] —— Ethane 2007 — 把企业网安全策略集中到一台中央电脑上
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器

