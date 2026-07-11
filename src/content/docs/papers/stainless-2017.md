---
title: Stainless — 让编译器替你证明 Scala 函数真的满足规约
来源: 'Hamza, Voirol & Kunčak, "System FR: Formal Foundations for Stainless", OOPSLA 2019'
日期: 2026-05-31
分类: 编程语言
难度: 中级
---

## 是什么

Stainless 是 **EPFL LARA 实验室**做的 Scala **程序验证器**：你写一段普通 Scala 函数，再用注释加几行"前置条件 / 后置条件"，Stainless 会**数学上证明**这个函数对所有可能输入都满足规约——而不是写几个测试碰运气。

日常类比：买保险柜，普通做法是上锁后摇一摇看牢不牢；Stainless 做的是请数学家**证明**这把锁的所有钥匙组合在物理上不可能撬开。

```scala
import stainless.lang._

def factorial(n: BigInt): BigInt = {
  require(n >= 0)               // 前置：n 不能为负
  if (n == 0) 1
  else n * factorial(n - 1)
} ensuring(_ >= 0)               // 后置：返回值必为非负
```

跑 `stainless factorial.scala`，几秒后告诉你"VC valid"——这个函数被**证明**对任何非负 BigInt 都返回非负值。不是测试通过，是证明通过。

## 为什么重要

不理解 Stainless 这类工具，很难解释下面几件事：

- 为什么有人敢用 Scala 写**密码协议 / 共识算法 / 智能合约**——靠 Stainless 把 bug 在编译期挡掉
- "测试覆盖率 100%" 和 "形式化验证通过" 的差距：测试只检查走过的路径，验证检查**所有**路径
- 学术界研究的"依赖类型 / refinement type / SMT 求解器"如何在工业 Scala 子集里**真的能跑起来**
- 验证工具为什么常出现在 **Scala / OCaml / Haskell / F\*** 这类强类型函数式语言里——纯函数 + 不变数据让 SMT 可处理

## 核心要点

Stainless 的工作流程可以拆成 **三步**：

1. **抽取规约**：从 `require` / `ensuring` / `invariant` 读出前后置条件，从 `def` 体读出定义，整段程序变成一组**逻辑公式**。类比：把合同条款从白话抄成可核对的条款清单。

2. **生成 verification condition (VC)**：对每个函数问"前置成立 → 执行函数体 → 后置一定成立"是否恒真。类比：不是抽查几份合同，而是问"有没有任何一份能违约"。

3. **SMT 求解**：把 VC 喂给 **Z3 / cvc5 / Princess**（自动定理证明器）。结果是 valid、反例，或超时。类比：把条款丢给验算机，它要么盖章，要么指出哪一页对不上。

System FR（OOPSLA 2019）是背后的**小核心演算**：用 refinement type（给类型加约束，如"非负整数"）等特性描述程序，并在 **Coq** 里证明可靠。高级 Scala 特性先翻译进这个小核心，再交给 SMT。

## 实践案例

### 案例 1：链表反转的归纳证明

```scala
import stainless.lang._
import stainless.collection._

def reverse[T](xs: List[T]): List[T] = xs match {
  case Nil() => Nil()
  case Cons(h, t) => reverse(t) ++ List(h)
}

def reverseTwiceIsId[T](xs: List[T]): Boolean = {
  reverse(reverse(xs)) == xs
}.holds
```

`.holds` 把表达式当成**待证定理**。证明按结构归纳三步走：（1）Nil 基例：`reverse(reverse(Nil)) == Nil`；（2）Cons 步：假设对尾巴成立，推对 `Cons(h,t)` 成立；（3）合起来对任意列表成立。十几秒后 "Theorem holds"。

### 案例 2：找到反例时给你具体输入

```scala
def safeDivide(a: BigInt, b: BigInt): BigInt = {
  require(b != 0)
  a / b
} ensuring(res => res * b == a)   // 故意写错的后置
```

跑 Stainless 会回："VC invalid, counterexample: a=1, b=2"。因为 BigInt 整除时 `1/2 == 0`，而 `0 * 2 != 1`。**反例直接告诉你哪里错**——这是测试做不到的。

### 案例 3：和 Leon 时代的差距

Leon（2013-2017）只支持纯函数；遇到 `var x = 0; x = x + 1` 直接拒绝。Stainless（2017 起）把命令式代码**翻译成 SSA**（每改一次变量就换个新名字记账）并加**幽灵状态**跟踪副作用，于是命令式 Scala 也能验证。代价是 VC 更复杂、SMT 更易超时。

## 踩过的坑

1. **SMT 超时不等于不成立**：Z3 给"unknown"很常见——拆函数、加中间引理，或换 `--solvers=smt-cvc5`；报错有时不指向真正难证的子目标。
2. **递归必须能证终止**：否则不能当数学函数用；默认按结构递减，自定义度量写 `decreases(...)`。
3. **抽取边界**：`Iterator` / 异常 / 反射 / `Future` 大多不支持——只用 `stainless.lang._` / `stainless.collection._`，别直接用 `scala.collection`。
4. **验证通过 ≠ 零 bug**：只证你写下的规约；规约写错（漏 `b != 0`、误写后置）再绿也救不了——责任转移到规约本身。

## 适用 vs 不适用场景

**适用**：

- 算法核心 / 数据结构不变量（红黑树平衡、堆有序）；核心模块大约几百行往往可证
- 密码协议 / 共识关键性质、智能合约资金守恒
- 编译器优化阶段的语义保持；关键业务里的"不可能出错"路径

**不适用**：

- 大量 IO / 网络 / GUI——副作用难规约
- 全库万行级验证——成本过高，业界只验核心；复杂归纳常 >30s 超时，需先拆引理
- 复杂浮点 / 实数推理——SMT 支持有限；极致性能路径也可能落在验证子集外

## 历史小故事（可跳过）

- **2011-2013**：Viktor Kunčak 在 EPFL 启动 **Leon**。Suter / Kneuss / Kuraj 在 OOPSLA 2013 发表 *Synthesis Modulo Recursive Functions*——只给规约就能合成代码。
- **2017**：Stainless 从 Leon fork，重写架构并扩展命令式支持。Voirol 的 PhD *Verifying Functional Programs* 是核心。
- **2019 OOPSLA**：Hamza、Voirol、Kunčak 发表 **System FR**——小核心演算 + Coq 可靠性证明，回答"Stainless 凭什么对"。
- **System FR 关键**：用 **sized types** 等机制做终止推理（含惰性结构如 stream），并证明可类型化程序规范化——避免"不终止项混进逻辑"的不一致。
- 论文强调：工业语言形式化**不能从零造**，要把现有特性翻译进可证可靠的小核心。

之后用于 Scala 库验证、EPFL 教学；Cardano 生态的 Scala 工具链（如 Scalus）也会指向 Stainless 做形式化验证。

## 学到什么

1. **验证不是测试的加强版**：测试问"这次对吗"，验证问"所有可能都对吗"
2. **refinement type + SMT + 小核心演算** 是把类型论落到工业语言的常见三件套；System FR 证明工具本身可靠，SMT 日常验用户代码
3. **规约写作是技能**：把行为写成 `require`/`ensuring` 本身就在澄清需求；很多 bug 在规约阶段就暴露
4. **反例驱动**：写规约 → 验证 → 反例 → 修代码或修规约，比"写代码再测"更直接命中根因

## 延伸阅读

- 官网：[Stainless](https://stainless.epfl.ch/)（教程 + 在线试玩）
- 论文：[System FR — Hamza, Voirol, Kunčak, OOPSLA 2019](https://dl.acm.org/doi/10.1145/3360592)
- Coq 形式化：[github.com/epfl-lara/SystemFR](https://github.com/epfl-lara/SystemFR)
- 工具源码：[github.com/epfl-lara/stainless](https://github.com/epfl-lara/stainless)
- Leon 旧论文：*Synthesis Modulo Recursive Functions*（OOPSLA 2013）——理解 Stainless 的合成血统
- [[fstar]] —— 微软的同类工具，路线略不同（依赖类型更激进）
- [[liquid-types]] —— refinement type 的另一脉，Stainless 的 refinement 思路相近

## 关联

- [[hindley-milner]] —— HM 是"自动推类型"，Stainless 是"自动证规约"，思路同源不同目标
- [[liquid-types]] —— refinement type 的轻量版，验证更受限但更自动
- [[fstar]] —— 把依赖类型 + SMT 自动化推到极致的同类语言
- [[refinement-types-1991]] —— refinement type 概念的开山，Stainless 的 ensuring 是其工业落地
- [[hoare-logic]] —— 前置/后置条件的概念源头
- [[boogie-2005]] —— "翻译到中间语言再交 SMT" 这种架构的代表，Stainless 思路相近
- [[isabelle-hol-2002]] —— 交互式证明助手，和 Stainless 的"全自动"形成对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chapar-2016]] —— Chapar — 第一个被机器证明的因果一致 KV 存储
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[lacuna-program-holes]] —— LACUNA — 把 AI agent 的行动变成编译器先检查的程序洞
- [[verdi-2015]] —— Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架
