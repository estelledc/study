---
title: Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
来源: 'Eugene Burmako, "Scala Macros: Let Our Powers Combine!", Scala Workshop 2013'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Scala Macros 是 **Scala 2.10 引入的编译期元编程系统**：你声明一个普通方法但加上 `macro` 关键字，编译器看到调用时不会真的去调你写的方法体，而是把**调用现场的整段代码当数据**交给宏，宏返回一段新代码，编译器把它原地替换。

日常类比：像点外卖时备注栏写"按我的口味改"。柜员（编译器）看到这条订单，不直接做菜，而是把订单纸条递给厨师（宏），厨师改完递回来一张新订单，柜员才照着新订单做。

```scala
def assert(cond: Boolean, msg: String): Unit = macro Macros.assertImpl
// 调用方写：assert(x > 0, "x must positive")
// 编译期被宏改写成：if (!(x > 0)) throw new AssertionError(s"x must positive, got x=$x")
```

宏看得到 `cond` 的 AST（不是 `cond` 的值），所以可以把 `x > 0` 这段表达式打印进错误信息——纯运行期函数做不到，因为运行期只看到一个 `true`/`false`，源码长什么样早被 scalac 丢掉了。

Scala 宏比 Lisp macro 多了静态类型保障，比 Template Haskell（Haskell 的对应物）多了"类型驱动 implicit 派生"——这是它能撑起 Slick / Shapeless / circe 这类工业项目的关键。

## 为什么重要

不理解 Scala 宏，下面这些事都没法解释：

- 为什么 Slick 写 `users.filter(_.age > 18)` 会变成 `WHERE age > 18` 的 SQL，而不是把所有 user 拉到内存过滤
- 为什么 circe / Magnolia 给 case class 自动生成 JSON encoder，**一行手写也不用**
- 为什么 Spark 早期曾用 Scala quasiquote/toolbox 做表达式代码生成，后来又换成 Janino——宏路径能用，但编译太慢
- 为什么 Scala 2.10/2.11/2.13/3.x 之间宏代码经常整个重写——绑死了编译器内部 API 的代价

## 核心要点

Scala 宏的设计可以拆成 **三块拼图**：

1. **def macro = 编译期函数**：和普通方法签名一样，只是实现写在另一个方法里、接收 `Tree` 返回 `Tree`。类比"把代码当数据传给一个函数，函数返回新代码"——这是 Lisp 1960 年就有的想法，Scala 给它套了静态类型。

2. **quasiquote `q"..."` = 写代码而不是拼 AST**：早期写宏要 `Apply(Select(Ident("x"), TermName("+")), List(Literal(Constant(1))))`，意思是 `x + 1`。quasiquote 让你直接写 `q"x + 1"`，编译器自动拆成 AST。`$` 插值塞变量，像 JS 模板字符串一样。

3. **type-driven 派生（materializer）**：implicit 缺一个 `Encoder[User]`，编译器找不到时调用宏，宏在类型层把 `User` 拆成字段列表，**逐字段生成 encoder** 拼起来。Shapeless / circe / Magnolia 都靠这一招。

三块拼上 = 既能改写代码、又能读类型、写起来还像写 Scala。

## 实践案例

### 案例 1：Slick 把 lambda 翻译成 SQL

```scala
val q = users.filter(_.age > 18).map(_.name)
// 编译期看到 lambda AST：(u: User) => u.age > 18
// 宏把 AST 翻译成 SQL：SELECT name FROM users WHERE age > 18
```

**关键**：宏拿到的是 `_.age > 18` 的**语法树**，不是函数值。它能识别 `Select(u, age)` 是列引用、`>` 是比较谓词，逐节点翻成 SQL。这就是 LINQ 风格 query 在 JVM 上能跑的核心机制。

如果不用宏，要么写 `users.filter(_.age > 18).run` 把所有 user 拉到内存再过滤（慢且贵），要么自己拼字符串 `"WHERE age > 18"`（拼错就 SQL 注入）。宏让 Scala 既保留语法的安全感、又把执行下推到数据库。

### 案例 2：circe 自动派生 JSON encoder

```scala
case class User(name: String, age: Int)
val json = User("alice", 30).asJson  // 编译通过，没手写 encoder
```

`asJson` 需要一个 implicit `Encoder[User]`，没人写。编译器调 circe 的 materializer 宏，宏看 `User` 的类型签名 → 拆出 `(String, Int)` → 生成 `Encoder.forProduct2("name", "age")(User.unapply)` → 塞回 implicit scope。**全程编译期完成，运行期零反射开销**。

对比 Java 生态的 Jackson：Jackson 用运行期反射，每次 encode 都要走 Field/Method 反射查找；circe 用宏在编译期把这些查找展平成直接字段访问，性能差 3-5 倍。代价是编译时间——大型项目 case class 几百个，编译能从 30 秒涨到 3 分钟。

### 案例 3：Spark 从 quasiquote 换到 Janino

```scala
// 早期 Catalyst 表达式 codegen（示意）：用 quasiquote 拼 Scala，再 toolbox 编译
val code = q"input.getInt($idx) + 1"
// 生产路径（Spark 1.x 末起）：改成拼 Java 字符串，用 Janino 编译
// "int value = input.getInt(idx) + 1;"
```

**关键**：目标都是把查询计划变成特化字节码，**躲开逐算子虚调用的解释器循环**。早期试过 Scala quasiquote + toolbox，但编译太慢；whole-stage codegen 改成生成 Java、用 Janino 在**查询执行时**编译。Spark 2.0 后 TPC-DS 部分查询提速约 5-10 倍——宏能做代码生成，工业系统还要为编译速度换实现。

## 踩过的坑

1. **绑死编译器内部 API**：`c.universe.Tree` 是 nsc 内部表示，2.10 → 2.11 → 2.13 → 3.x 多次破坏式改版，Scala 3 干脆推翻成 inline + quoted 重写。维护一个 macro library 等于追编译器版本。
2. **编译时间爆炸**：Shapeless / circe 大量 implicit + materializer 让单次编译从几秒到几分钟，IDE 高亮卡住。Magnolia 出现就是为了减少 implicit search 的代价。
3. **whitebox macro 错误信息几乎不可读**：宏返回类型比签名更精确（whitebox），用户看到 "inferred type T does not match expected type S"，根因藏在宏内部 `c.typecheck` 里。
4. **macro annotation 长期实验**：`@deriving(...)` 能改写 class 定义太强，编译器的增量编译模型扛不住，Scala 3 直接砍掉，改用 `derives` + `Mirror`。

## 适用 vs 不适用场景

**适用**：

- 类型类自动派生（JSON / Protobuf / DB schema）—— circe / Magnolia / Shapeless
- 内嵌 DSL 翻译成另一种执行（Slick → SQL，Spark → 字节码）
- 编译期断言 / 字符串插值检查（`sql"SELECT ..."` 编译期校验语法）
- 性能敏感场景的代码生成（Catalyst whole-stage codegen）

**不适用**：

- 跨编译器版本要长期稳定的库 → 用普通 Scala 或运行期反射更合适
- 调试需求高的场景 → macro 生成的代码栈帧错乱，断点跳不到源码
- 团队里没人懂宏的项目 → 谁踩坑谁修两周
- Scala 3 项目 → 不能再用旧 def macro，要学 inline + quoted（PCP 演算）

## 历史小故事（可跳过）

- **2002 年**：Sheard & Peyton Jones 发表 Template Haskell（[[template-haskell]]），用 `[| ... |]` 和 `$( ... )` 给 Haskell 装上编译期元编程。
- **2010 年**：Scala 2.8/2.9 只有运行期反射 manifest，元编程要么走 toolbox 要么走外部代码生成器。
- **2012 年**：Burmako 在 EPFL 跟 Odersky 做博士，把 def macro + quasiquote 实现到 Scala 2.10 nightly。
- **2013 年**：Scala Workshop 论文发表，把这套系统讲清楚；同年 Slick 1.0 / Shapeless 2.0 大规模采用。
- **2021 年**：Scala 3（dotty）整体重写宏成 inline + quoted DSL，理论基础是 Stucki/Biboudis 的 PCP（principle of phase consistency）。旧 def macro API 不再可用——Scala 历史最大兼容性断点之一。
- **近年**：Burmako 的 scalameta（脱离编译器内部 API 的独立 AST 库）成为工具链事实标准；Scala 3 派生多走 `inline` + `Mirror`，Magnolia 等库也迁到这条路。

## 学到什么

1. **元编程的关键是"把代码当数据"**——Lisp 1960 年就懂，Scala 用静态类型把它工业化，让 Java 生态也能享受
2. **quasiquote 把"写宏"从拼 AST 降到了"写 Scala"的认知成本**——这是工业落地的临界点
3. **类型驱动派生（implicit + macro）**让"自动生成模板代码"从代码生成器（外部）变成编译器内置能力
4. **绑死内部 API 的代价**：能力换来兼容性债务，Scala 3 不得不推翻重来。这是所有"开放编译器"系统都要做的取舍
5. **同代不同路径**：Template Haskell 走 quote/splice + IO Monad，Scala 走 def macro + implicit 派生，最后两边都被新一代（quoted DSL / typed quasiquote）取代——但工业项目的真实经验沉淀都来自 2013 这一代
6. **macro 不是免费午餐**：每加一行 def macro，库的可调试性和向前兼容性都打折扣，决定要不要用前先看团队能否支付维护成本

## 延伸阅读

- [Burmako 2013 PDF](https://infoscience.epfl.ch/record/186497/files/scalamacros.pdf)（原论文 8 页，可作起步）
- [Eugene Burmako 博士论文 2017](https://infoscience.epfl.ch/record/226166)（150 页，scalameta 起源，比 2013 论文深得多）
- [Scala 3 Macros 官方教程](https://docs.scala-lang.org/scala3/guides/macros/)（学新语法用，inline + quoted）
- [scalameta 项目](https://scalameta.org)（Burmako 在 2013 论文之后做的下一代 macro 框架）
- [[template-haskell]] —— Scala 宏的精神祖先，比较两者实现细节
- [[metaml-multi-stage]] —— 多阶段编程的理论根，理解 quote / splice 从哪来
- [Shapeless 教程 The Type Astronaut's Guide](https://underscore.io/books/shapeless-guide/)（看类型驱动派生怎么用宏实现）

## 关联

- [[template-haskell]] —— 同时代的 Haskell 元编程系统，Scala 宏在它基础上加了类型驱动派生
- [[metaml-multi-stage]] —— quote/splice 的理论起源，Burmako quasiquote 的祖父
- [[partial-evaluation-jones]] —— 编译期专精化思想，宏可以看作受限的 partial evaluation
- [[gadt-pjones]] —— GADT 让宏在类型层做更精确的 case 分析（circe / shapeless 用）
- [[reynolds-definitional-interpreters]] —— 把高级语言映射到目标语言，宏做的就是这件事
- [[graalvm-truffle]] —— 另一种"在运行期把高级 AST 编译成机器码"的路径，对照宏的编译期路线
- [[hindley-milner]] —— 宏要看类型，类型从 HM 推出来；两个系统在编译器里串联
- [[system-f-reynolds-1974]] —— Scala 类型系统是 System F 的扩展，宏在类型层操作时面对的就是 F 风格量词
- [[trees-that-grow]] —— 可扩展 AST 设计，思路类似宏要面对的"如何让 Tree 表示能演化"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lacuna-program-holes]] —— LACUNA — 把 AI agent 的行动变成编译器先检查的程序洞
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[lean-tactics]] —— Lean Tactics — 让证明助手把"写证明"当成写程序
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
