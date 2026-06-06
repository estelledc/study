---
title: Stainless — 让编译器替你证明 Scala 函数真的满足规约
来源: 'Hamza, Voirol & Kunčak, "System FR: Formal Foundations for Stainless", OOPSLA 2019'
日期: 2026-05-31
子分类: 形式化验证
分类: 形式化方法
难度: 中级
provenance: pipeline-v3
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

1. **抽取规约**：从 `require` / `ensuring` / `invariant` 注释里读出前后置条件，从 `def` 体读出函数定义。整个程序变成一组**逻辑公式**。

2. **生成 verification condition (VC)**：对每个函数，问"前置成立 → 函数体执行 → 后置一定成立"是不是恒真？这是一道一阶逻辑+归纳数据类型的判定题。

3. **SMT 求解**：把 VC 喂给 **Z3 / CVC4 / Princess**。求解器要么说"valid"（证毕），要么给一个**反例**（输入 X 时后置不成立），要么超时。

System FR（OOPSLA 2019）是 Stainless 背后的**核心演算**——一套带 refinement type、recursive type、equality type 的多态依赖类型 lambda 演算，**Coq 里证明可靠**。Stainless 复杂的高级特性（type class、imperative、模式匹配）都被翻译成 System FR 再走 SMT。

## 实践案例

### 案例 1：链表反转的归纳证明

```scala
def reverse[T](xs: List[T]): List[T] = xs match {
  case Nil() => Nil()
  case Cons(h, t) => reverse(t) ++ List(h)
}

def reverseTwiceIsId[T](xs: List[T]): Boolean = {
  reverse(reverse(xs)) == xs
}.holds
```

`.holds` 让 Stainless 把这个 Boolean 表达式当成**待证定理**。它会自动按 `xs` 做结构归纳：Nil 情况手动可验，Cons 情况靠归纳假设。十几秒后："Theorem holds"。这就是手写 Coq 要花 20 行的证明。

### 案例 2：找到反例时给你具体输入

```scala
def safeDivide(a: BigInt, b: BigInt): BigInt = {
  require(b != 0)
  a / b
} ensuring(res => res * b == a)   // 故意写错的后置
```

跑 Stainless 会回："VC invalid, counterexample: a=1, b=2"。因为 BigInt 整除时 `1/2 == 0`，而 `0 * 2 != 1`。**反例直接告诉你哪里错**——这是测试做不到的。

### 案例 3：和 Leon 时代的差距

Leon（2013-2017）只支持纯函数子集；遇到 `var x = 0; x = x + 1` 直接拒绝。Stainless（2017 起）通过**翻译到 SSA + 引入幽灵状态变量**，让你写命令式 Scala 也能验证。代价是验证条件更复杂、SMT 更容易超时，但工业可用性大幅提升。

## 踩过的坑

1. **SMT 超时不等于不成立**：Z3 给"unknown"很常见。可能要拆函数、加中间引理、或换 `--solvers=cvc4`。Stainless 给的报错有时不指向真正难证的子目标。

2. **递归函数必须能证明终止**：否则 Stainless 会拒绝把它当成数学函数（不终止函数没有数学意义）。终止证明默认按结构递减；自定义度量要写 `decreases(...)`。

3. **抽取边界容易踩**：Scala 里 `Iterator` / 异常 / 反射 / Future 这些 Stainless 大多不支持。一定要用它的"verified subset"——库函数从 `stainless.lang._` / `stainless.collection._` 导，不能直接用 `scala.collection`。

4. **归纳证明不会自动做高阶函数的归纳**：`map` / `fold` 这种要么手动展开，要么调用预先证好的引理。新人常以为 Stainless 万能，碰到高阶就卡住。

5. **不要把"验证通过"当成"零 bug"**：Stainless 只证你写下的规约。规约本身写错，验证再绿也救不了——比如忘记写 `b != 0`，溢出检查没考虑，或者把"不该崩"误写成"返回 0"。形式化验证把责任**转移**到规约的正确性，而不是消除责任。

## 适用 vs 不适用场景

**适用**：

- 算法核心 / 数据结构不变量（红黑树平衡、堆有序）
- 密码协议 / 共识算法的关键性质
- 智能合约的资金守恒
- 编译器优化阶段的语义保持
- 关键业务逻辑里的"不可能出错"路径

**不适用**：

- 大量 IO / 网络 / GUI 代码——副作用难规约
- 性能关键路径——验证子集牺牲了一些 Scala 高性能特性
- 全代码库验证——成本极高，业界做法是只验证**核心模块**
- 需要复杂浮点 / 实数推理——SMT 对浮点支持有限

## 历史小故事（可跳过）

- **2011-2013**：Viktor Kunčak 在 EPFL 启动 **Leon** 项目，目标是"在 Scala 里做合成 + 验证"。Suter / Kneuss / Kuraj 在 OOPSLA 2013 发表 *Synthesis Modulo Recursive Functions*——只给规约就能合成代码。
- **2017**：Stainless 项目从 Leon fork 出来，重写架构，扩展到命令式 Scala。Voirol 的 PhD 论文 *Verified Functional Programming* 是核心。
- **2019 OOPSLA**：Hamza、Voirol、Kunčak 发表 **System FR**——给 Stainless 一个数学严密的核心演算 + Coq 可靠性证明。终于有了"Stainless 凭什么对"的标准答案。
- **System FR 的关键设计**：通过**分层**（stratified types）同时容纳终止与非终止计算——在某一层，类型只描述终止值；在另一层，允许潜在不终止。这避免了 Curry-Howard 风格依赖类型系统遇到不终止函数时的逻辑不一致问题。
- 论文里反复强调一个观点：工业语言的形式化基础**不能从零造**，必须把现有特性逐条翻译进可证明可靠的小核心，否则论文写完工具就跟不上。

之后 Stainless 被用到 **Cardano / DEDIS** 等区块链协议、Scala 标准库验证、教学（EPFL 形式化验证课）。

## 学到什么

1. **验证不是测试的加强版**——是另一种范式：测试问"这次跑对吗"，验证问"所有可能跑都对吗"
2. **依赖类型 + refinement type + SMT** 是把"高级类型论"落到工业语言的三件套
3. **核心演算（System FR）+ 翻译层** 是验证工具的通用架构：复杂语言特性都翻译成小核心，证明小核心可靠
4. **Coq 机械化证明 vs SMT 自动化** 不是对立——前者用来一次性证明工具本身可靠，后者用来日常验证用户代码
5. **学术工具走向工业** 通常要 6-10 年：Leon 2011 → Stainless 2017 → 区块链落地 2020s
6. **规约写作本身是技能**：把"我想要的行为"翻译成 `require`/`ensuring` 是新的负担，但这个翻译过程**本身就在帮你想清楚需求**——很多 bug 是规约阶段就发现的，VC 还没生成
7. **反例驱动的开发节奏**：写规约 → 跑验证 → 拿到反例 → 修代码或修规约。这个 loop 比"写代码 → 跑测试"更直接命中根因

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
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[verdi-2015]] —— Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架

