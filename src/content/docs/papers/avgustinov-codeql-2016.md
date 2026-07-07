---
title: QL / CodeQL — 用面向对象外壳写可扩展代码查询
来源: 'Pavel Avgustinov, Oege de Moor, Michael Peyton Jones, and Max Schäfer, "QL: Object-oriented Queries on Relational Data", ECOOP 2016'
日期: 2026-05-29
分类: security-privacy
难度: 中级
---

## 是什么

QL 是 CodeQL 背后的查询语言祖先：它让你把大型代码库先变成关系数据库，再用一种像 Java 又像逻辑规则的语言去问"哪里可能有 bug 或安全漏洞"。

日常类比：把一座城市拍成地图数据库，普通 SQL 像问"所有红绿灯在哪"，QL 像问"哪些路口一旦下雨就容易堵车，而且附近还没有绕行路"。它不直接跑程序，而是在程序的"地图"上找结构、数据流和危险模式。

这篇论文的核心定位是：QL 底层编译到 Datalog，能处理递归和大规模关系数据；表层提供 class、method、inheritance、virtual dispatch，让写查询的人能复用一套熟悉的面向对象接口。

## 为什么重要

不理解 QL，下面这些事都很难解释：

- 为什么 CodeQL 能把"SQL 注入"写成查询，而不是给每个项目手工写脚本
- 为什么 Datalog 这种逻辑语言会在现代安全扫描、指针分析、依赖分析里反复出现
- 为什么论文反复强调"没有真正对象"，却又说 QL 是面向对象语言
- 为什么全程序分析通常慢于编译期 lint，但能看见更深的数据流问题

## 核心要点

1. **代码先变数据库**：抽取器把 AST、控制流、类型、调用关系等事实放进 snapshot database。类比：先把仓库货架盘点成表格，之后所有盘货规则都查这张表。

2. **面向对象只是好用外壳**：QL 的 class 是"满足某个谓词的一组值"，method 是关系谓词，subclass 是集合包含。类比：不是给物品装上按钮，而是给数据库里的编号贴上可复用标签。

3. **类型会参与运行**：普通静态类型多半只在编译期检查；QL 的 prescriptive typing 会变成隐含过滤条件。类比：报名表上写"只看 18 岁以上的人"，不是备注，而是筛选器。

## 实践案例

### 案例 1：找 JavaScript 里没有效果的表达式

```ql
import javascript

from Expr e
where e.isPure() and e.getParent() instanceof ExprStmt
select e, "This expression has no effect."
```

**逐部分解释**：

- `import javascript` 引入 JavaScript 代码库的标准模型，里面已经有 `Expr`、`ExprStmt` 等类
- `from Expr e` 表示变量 `e` 可以取所有表达式节点
- `e.isPure()` 查纯表达式，`instanceof ExprStmt` 把表达式筛到"结果被丢掉"的上下文
- `select` 返回命中的代码位置和提示语；论文完整例子还递归处理逗号表达式

### 案例 2：class 不是对象，而是集合过滤器

```ql
class Digit extends int {
  Digit() { (int)this in [0..9] }
}

from Digit d
where (int)d % 2 = 0
select d
```

**逐部分解释**：

- `Digit` 看起来像 Java 类，其实定义的是整数集合 `{0,1,...,9}`
- `Digit()` 不是构造函数，而是 characteristic predicate，决定哪些值属于这个类
- `from Digit d` 已经自动加了"只看 0 到 9"的限制，所以查询只会返回偶数数字

### 案例 3：用接口把多种语法统一成一种查询

```ql
abstract class EqualityTest extends ASTNode {
  abstract Expr getALeftOperand();
  abstract Expr getARightOperand();
}

from EqualityTest eq, Expr l, Expr r
where l = eq.getALeftOperand() and r = eq.getARightOperand()
select eq
```

**逐部分解释**：

- `EqualityTest` 把 `==`、`switch case` 等都看成"左右两边可比较"的东西
- 新语法只要新增子类实现两个 member predicate，主查询不用改
- 这就是论文想要的复用：复杂分析写在抽象接口上，语言细节藏进库里

## 踩过的坑

1. **把 QL class 当 Java class**：QL 没有 `new`，类只是在数据库值上定义集合，误当对象会看不懂为什么 method 能反向查询。

2. **把 method 当单值函数**：QL 的函数式写法本质仍是关系，一个调用可能返回多个结果，原因是 Datalog 谓词没有"必须唯一"的默认承诺。

3. **忽略 prescriptive typing**：参数类型会变成运行时过滤器，所以一次类型转换可能不是报错，而是把不满足条件的候选值筛掉。

4. **只看语法不看执行模型**：QL 写起来短，但背后是全程序数据库查询，原因是它追求全局事实和复用库，不是逐文件即时 lint。

## 适用 vs 不适用场景

**适用**：

- 安全审计：污点追踪、SQL 注入、跨站脚本、危险 API 使用
- 大型代码库结构查询：调用链、继承层次、依赖关系、重复模式
- 需要递归规则的问题：可达性、祖先节点、控制流和数据流传播
- 多语言静态分析平台：把不同语言的 AST 包成相似接口，复用查询思路

**不适用**：

- 需要毫秒级交互反馈的轻量 lint，因为数据库构建和全局查询有成本
- 需要真实运行时行为的问题，例如网络时序、并发竞争的随机触发路径
- 需要创建或修改程序状态的任务，QL 是查询语言，不是转译器或解释器
- 数据模型很小、规则很简单的脚本，一条 `grep` 或普通 AST 遍历就够

## 历史小故事（可跳过）

- **1980s-1990s**：研究者开始把程序结构放进关系数据库或逻辑语言里查询，但 SQL 表达递归和路径问题很别扭。
- **2005 年左右**：PQL、bddbddb 等系统证明 Datalog 可以用来做程序分析和安全缺陷查找。
- **2006-2007 年**：CodeQuest 和早期 .QL 把 Datalog 查询编译到 SQL，先在 Java 源码分析上尝试工程化。
- **2016 年**：这篇 ECOOP 论文把 QL 的类、动态派发、prescriptive typing 用 Core QL → Datalog 的翻译正式说清楚。
- **后来**：QL 思想进入 CodeQL 生态，成为安全研究人员审计大型仓库的一条标准路线。

## 学到什么

1. **静态分析可以写成查询**：只要把程序抽成事实表，"找漏洞"就能变成"找满足条件的元组"。
2. **好的 DSL 常常是两层结构**：底层用 Datalog 保证递归和可优化，表层用面向对象语法降低写库成本。
3. **类型也可以是过滤逻辑**：QL 的类型不是纯说明文字，而是参与查询语义的一部分。
4. **工程取舍很清楚**：QL 用更多离线计算时间，换来全程序视角、复用库和更深的安全分析。

## 延伸阅读

- 原文 PDF：[Avgustinov et al. 2016 — QL: Object-oriented Queries on Relational Data](https://drops.dagstuhl.de/storage/00lipics/lipics-vol056-ecoop2016/LIPIcs.ECOOP.2016.2/LIPIcs.ECOOP.2016.2.pdf)
- 论文前身：Oege de Moor 等，".QL for source code analysis", SCAM 2007（看 QL 如何从 Java 代码查询起步）
- [[souffle-datalog]] —— 了解 Datalog 如何被工程化成高性能程序分析引擎
- [[differential-datalog]] —— 继续看"输入变化后只增量更新结论"的 Datalog 路线
- [[newsome-taintcheck-2005]] —— 污点追踪的安全背景，解释 CodeQL 常见查询为什么重要
- [[andersen-pointer-analysis]] —— 指针 / points-to 分析是 QL 类工具经常承载的底层事实

## 关联

- [[souffle-datalog]] —— 同样把 Datalog 用在程序分析上，偏底层执行引擎
- [[differential-datalog]] —— 关注增量维护，和 QL 的离线全量查询形成对照
- [[cousot-abstract-interpretation]] —— 提供静态分析的统一数学视角，QL 是其中一种工程表达方式
- [[kildall-dataflow]] —— 数据流分析的经典框架，QL 查询常常要表达类似传播过程
- [[andersen-pointer-analysis]] —— points-to 事实可作为 QL 查询的基础关系
- [[newsome-taintcheck-2005]] —— 安全污点追踪是 CodeQL 最容易被理解的应用场景
- [[prolog-colmerauer]] —— 逻辑编程祖先，帮助理解 QL 的谓词和关系思维

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

