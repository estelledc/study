---
title: Scala — 函数式 + OO 的 JVM 语言
来源: https://github.com/scala/scala
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**Scala**（Scalable Language）由 Martin Odersky 在 EPFL 主导设计，2004 年首次发布，官方编译器与标准库托管于 [scala/scala](https://github.com/scala/scala)。它运行在 **JVM** 上，与 Java 字节码互操作；也可编译到 **JavaScript**（Scala.js）与 **WebAssembly**（Scala Native / Scala.js 生态）。当前主流版本为 **Scala 3**（2021 起），在保留 Scala 2 生态的同时简化了隐式、枚举与类型推导。

日常类比：如果把 **Java** 想象成一家规矩森严的**连锁超市**——分区清晰（类与接口）、进货渠道固定（继承树）、收银流程统一（样板代码多）；那 **Scala** 像是同一商圈里的**融合料理餐厅**：

- **后厨既会做中餐也会做西餐**（OOP 的类/特质 + FP 的不可变集合与高阶函数），同一道菜可以用不同技法完成；
- **菜单用「套餐组合」代替冗长说明**（`case class` + 模式匹配），点「宫保鸡丁」不必逐条写辣椒、花生、鸡肉；
- **地下通道直连超市仓库**（与 Java 互操作），你可以只把新菜放在融合餐厅，原料仍从 Java 货架取；
- **主厨带学徒时会说「缺什么自己从备料台拿」**（`given` 隐式实例 / 旧版 `implicit`），写 JSON 序列化不必每个类型手写一遍。

Scala 在 **Apache Spark**（大数据）、**Akka / Pekko**（Actor 并发）、**Play Framework**（Web）、**Cats / ZIO**（函数式库）等生态中仍是核心语言；Kotlin 崛起后，Scala 更偏向「需要强表达力与类型抽象」的团队，而非 Android 首选。

## 为什么值得学

零基础或从 Java 转 Scala，常见收益：

| 痛点（Java / 传统 OOP） | Scala 的应对 |
|-------------------------|--------------|
| `if`/`switch` 与表达式割裂，临时变量多 | **一切皆表达式**：`if`、`match`、`for` 都有返回值 |
| POJO + getter/setter + `equals` 冗长 | **`case class`** 自动生成相等性、`copy`、`toString` |
| `instanceof` + 强制转型易漏分支 | **`match` 模式匹配** + `sealed trait` 编译期穷尽检查 |
| 回调与线程安全难写 | **不可变集合** + **Future** / **Actor** / **ZIO** 等组合子 |
| 想复用 Java 资产 | 同一 JVM 类路径，直接 `import java.util._` |

即使不主力写 Scala，懂它也有助于理解 **Spark SQL**、**Kafka Streams** 部分 API、以及 **TypeScript / Kotlin** 里「代数数据类型 + 模式匹配」的设计来源。

## 核心概念

### 1. 编译管线：从 `.scala` 到 JVM

```
┌────────────────────────────────────────────────────────────┐
│  源码 .scala / .sc（脚本）                                   │
├────────────────────────────────────────────────────────────┤
│  Scala 编译器（scalac，Scala 3 起部分用 Dotty 重写）          │
│    → JVM：.class 字节码（与 javac 产物互操作）                │
│    → Scala.js：JavaScript                                   │
│    → Scala Native：LLVM 原生二进制（实验/专用场景）           │
├────────────────────────────────────────────────────────────┤
│  运行时：JVM HotSpot + Java 标准库 + Scala 标准库             │
└────────────────────────────────────────────────────────────┘
```

构建工具常用 **sbt**（Scala 原生）、**Mill**，或与 Java 项目混用 **Maven** / **Gradle**（`scala` 插件）。

### 2. 纯面向对象：一切皆对象

Scala 是 **纯 OOP** 语言：数字 `42`、函数本身都是对象；`+`、`-` 等运算符实际是方法调用（`1.+(2)`）。没有 Java 式的原始类型（`int` 在运行时是 `Integer` 或值类的包装）。

类与 **trait**（特质）描述行为；**单例对象**（`object`）代替 Java 的 `static`，也是模块与伴生对象的载体。

### 3. 纯函数式：函数是一等公民

函数可以赋值、作为参数传递、嵌套定义；标准库提供 `map`、`filter`、`foldLeft` 等组合子。**不可变**集合（`List`、`Vector`、`Map`）是默认推荐；可变版本在 `scala.collection.mutable` 包中。

```scala
val nums = List(1, 2, 3, 4, 5)
val evensSquared = nums
  .filter(_ % 2 == 0)
  .map(x => x * x)
// List(4, 16)
```

`_` 是占位符语法：`_ % 2 == 0` 等价于 `x => x % 2 == 0`（单参数时）。

### 4. `val` 与 `var`：默认不可变

- **`val`**：引用不可重新绑定（对象内部可变字段除外）。
- **`var`**：可重新赋值，函数式风格中尽量少用。

```scala
val name: String = "Scala"
val year = 2004          // 类型推断为 Int
var downloads = 1_000_000
downloads += 1           // 仅 var 允许
```

### 5. `case class` 与代数数据类型（ADT）

`case class` 介于 Java `record` 与函数式 ADT 之间：构造即工厂、自动 `equals`/`hashCode`、支持模式匹配解构。

```scala
enum Status:
  case Ok(data: String)
  case Err(code: Int, msg: String)

def describe(s: Status): String = s match
  case Status.Ok(d)   => s"成功: $d"
  case Status.Err(c, m) => s"错误 $c: $m"
```

Scala 3 的 **`enum`** 是官方推荐的封闭 ADT 写法；Scala 2 常用 `sealed trait` + 多个 `case class`。

### 6. 模式匹配 `match`

`match` 是增强版 `switch`：可按类型、结构、守卫条件分支；对 **`sealed`** 层次结构，编译器可警告 **非穷尽匹配**。

```scala
sealed trait Shape
case class Circle(r: Double) extends Shape
case class Rect(w: Double, h: Double) extends Shape

def area(s: Shape): Double = s match
  case Circle(r) => math.Pi * r * r
  case Rect(w, h) => w * h
```

### 7. Trait 与混入组合

Scala 用 **trait** 实现接口 + 可选默认实现；**混入（mixin）** 在类定义时 `extends A with B with C`，避免 Java 单继承的僵硬。Scala 3 中 trait 可带参数，更接近「可配置模块」。

### 8. 隐式与 `given`（Scala 3）

Scala 2 的 **`implicit`** 可自动注入参数、类型类实例、转换，强大但易滥用。Scala 3 用 **`given` / `using`** 显式化「编译器代劳的上下文」，并配合 **extension methods** 为既有类型添加方法。

典型用途：JSON 编解码（**circe**、**play-json**）、数据库行映射、类型类（type class）模式——与 Haskell 的 `TypeClass` 类似，但落在 JVM 上。

### 9. 与 Java 互操作

- Scala 调用 Java：Java 集合、注解、泛型擦除与 Scala 泛型需注意；Java 的 `null` 在 Scala 3 可用 **`Option`** 或实验性 **显式 null** 类型收紧。
- Java 调用 Scala：伴生对象的 `static` 转发、默认参数由 **`@annotation`** 生成重载；避免在 Java 里依赖过于「Scala 味」的 API 表面。
- 同一 sbt/Maven 模块可混放 `.scala` 与 `.java`。

### 10. Scala 2 与 Scala 3

| 维度 | Scala 2.13 | Scala 3（Dotty） |
|------|------------|------------------|
| 语法 | 广泛存量生态 | 简化 `given`、**enum**、**export**、**opaque type** |
| 类型 | 隐式解析复杂 | 匹配类型、内联更统一 |
| 迁移 | Spark 等仍支持 2.13 | 可用 **Scala 3 Migration Guide** 渐进升级 |

入门建议：新项目优先 **Scala 3**；维护 Spark 2.x 作业可能仍停留在 2.12/2.13。

## 代码示例一：表达式树求值（ADT + 模式匹配）

下面实现一个简单的算术表达式树，展示 `enum`、`match` 与递归：

```scala
enum Expr:
  case Num(value: Int)
  case Add(left: Expr, right: Expr)
  case Mul(left: Expr, right: Expr)

def eval(e: Expr): Int = e match
  case Expr.Num(v)       => v
  case Expr.Add(l, r)    => eval(l) + eval(r)
  case Expr.Mul(l, r)    => eval(l) * eval(r)

@main def demo(): Unit =
  // 表达式 (1 + 2) * 3
  val tree = Expr.Mul(Expr.Add(Expr.Num(1), Expr.Num(2)), Expr.Num(3))
  println(eval(tree))  // 9
```

要点：`match` 的每个分支既是分支又是解构；若漏掉 `Mul`，在 `sealed enum` 下编译器会提示非穷尽。这与 Java 17+ `switch` 模式、`instanceof` 相比，结构更清晰。

## 代码示例二：不可变数据更新与集合管道

模拟用户积分流水：用 `case class`、`copy` 与函数式链式处理：

```scala
case class User(id: Long, name: String, points: Int)

case class Event(userId: Long, delta: Int)

def applyEvents(users: Map[Long, User], events: List[Event]): Map[Long, User] =
  events.foldLeft(users) { (acc, ev) =>
    acc.get(ev.userId) match
      case Some(u) =>
        acc.updated(ev.userId, u.copy(points = u.points + ev.delta))
      case None    => acc
  }

@main def ledger(): Unit =
  val users = Map(
    1L -> User(1, "Ada", 100),
    2L -> User(2, "Grace", 50)
  )
  val events = List(
    Event(1, 10),
    Event(2, -5),
    Event(1, 5)
  )
  val result = applyEvents(users, events)
  println(result(1).points)  // 115
  println(result(2).points)  // 45
```

要点：没有原地修改 `User`；`copy` 生成新实例，`foldLeft` 从左累积新 `Map`。在并发场景下，不可变结构更容易推理（仍需注意 `var` 与可变集合）。

## 工具链与环境

| 工具 | 用途 |
|------|------|
| **sbt** | 事实标准构建工具，`build.sbt` 声明依赖与 Scala 版本 |
| **IntelliJ IDEA** + Scala 插件 | IDE 支持、调试、重构 |
| **Metals** | VS Code / Cursor 的 Scala 语言服务 |
| **scalac** / **scala-cli** | 命令行编译；`scala-cli` 适合脚本与单文件实验 |
| **[docs.scala-lang.org](https://docs.scala-lang.org/)** | 官方文档、Tour of Scala、Scala 3 Book |
| **Scalafmt** / **WartRemover** | 格式化与 lint |

快速体验（需安装 [scala-cli](https://scala-cli.virtuslab.org/) 与 JDK 17+）：

```bash
scala-cli repl
# 或
scala-cli run MyApp.scala
```

sbt 最小项目：

```bash
sbt new scala/scala3.g8
cd <project>
sbt run
```

## 学习路径建议

1. **语法基础**：官方 [Tour of Scala](https://docs.scala-lang.org/tour/tour-of-scala.html) — `val`/`var`、函数、类、trait、`object`。
2. **函数式习惯**：不可变集合、`map`/`flatMap`/`fold`、`Option`/`Either` 代替 `null` 与异常控制流。
3. **ADT 与 `match`**：[Scala 3 Book — ADT](https://docs.scala-lang.org/scala3/book/types-adts.html)，用 `enum` 建模业务状态机。
4. **选方向深入**：
   - 大数据 → Apache Spark（Dataset API、Spark SQL）
   - 并发 → Pekko Actor、ZIO、Cats Effect
   - Web → Play Framework、http4s、Tapir
   - 类型级编程 → Shapeless、Scala 3 `inline` / `Mirror`（进阶）

与专题笔记 [[openjdk]] 对照：Scala 编译为 `.class` 后仍由 **HotSpot** JIT 与 **GC** 管理；换的是 **抽象能力与组合方式**。与 [[kotlin]] 对比：两者都瞄准 JVM 现代语法，Scala 更强调 **FP + 类型类 + 隐式（given）**，Kotlin 更强调 **空安全 + 协程 + Android 官方支持**。

## 常见误区

- **「Scala 语法太复杂，没法读」** — 团队应约定子集（如禁用过于炫技的隐式）；业务代码可保持与 Kotlin 相近的简洁度。
- **「学完 Scala 就不用学 Java」** — 读 Hadoop/Spark 周边、Spring 老项目、Maven 插件仍需要 Java 底子。
- **到处用 `var` 和 `mutable`** — 失去不可变带来的可维护性；仅在性能热点或互操作处使用可变。
- **Scala 2 与 3 混用不查版本** — 依赖库需对齐 `%%` artifact 的 Scala 二进制版本（如 `_3` 后缀）。
- **把 Spark 当成语言本身** — Spark 是分布式计算框架；Scala 是编写 Driver/Executor 逻辑的语言之一（另有 PySpark、SparkR）。

## 延伸阅读

- 官方仓库：[github.com/scala/scala](https://github.com/scala/scala)
- Scala 3 新特性：[What's new in Scala 3](https://docs.scala-lang.org/scala3/new-in-scala3.html)
- Java 开发者视角：[Scala for Java Developers](https://docs.scala-lang.org/scala3/book/scala-for-java-devs.html)
- 设计哲学（Martin Odersky）：[Unifying FP and OO with Scala](https://cacm.acm.org/research/unifying-functional-and-object-oriented-programming-with-scala/)（CACM）
- 本库相关笔记：[[openjdk]]（JVM 底座）、[[kotlin]]（另一 JVM 现代语言）、[[apache-spark]]（若已收录 Spark 生态）
