---
title: LACUNA —— 把 AI Agent 写成「递归的程序孔洞」
来源: https://arxiv.org/abs/2605-28617
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# LACUNA：把 AI Agent 写成「递归的程序孔洞」

## 一、一个日常类比：拼图里的空缺

想象你在拼一幅巨大的拼图。大部分拼图块你已经亲手放好了——这些是你写的代码，变量、函数、控制流，一切井井有条。

但现在有一块拼图你找不到。这块拼图该是什么形状？你不知道。于是你把这块空缺的位置、周围已经拼好的图案、以及"这块拼图应该是什么"的描述，交给一个朋友去画。朋友画好后，你拿回去试——如果大小正好严丝合缝，就放进去；如果大了、小了、或者形状不对，就把朋友叫回来，告诉他哪里不合适，让他重画。

LACUNA 做的就是这样一件事。它的核心问题是：

> 现在的大模型 Agent 经常"写代码来做事"，但模型写的代码和运行这段代码的运行时之间有一条鸿沟。运行时掌握循环、上下文和控制流，模型只能写一小段代码，几乎没有发言权。

LACUNA 的答案是：**让模型写的代码变成程序中的一个「类型化孔洞」（typed hole），在运行到这个孔洞时，由模型来填充，并且填充的代码在运行之前必须通过编译器的类型检查。**

## 二、核心概念拆解

### 2.1 类型化孔洞（Typed Hole）

在编译器术语中，"孔洞"指的是一个还缺少值的占位符。比如你在写 Scala 代码，写了一半不知道后面该填什么，编译器就会显示一个"类型化孔洞"，告诉你："这里需要一个 `Int`，但你还没给出。"

LACUNA 把这个想法用到运行时：

```scala
def agent[T](task: String): T
```

这行代码的意思是："我需要一个类型为 `T` 的值，具体内容让大模型来写。"

- `T` 是期望的结果类型（比如 `String`、`List[Int]`、`Order`）
- `task` 是用自然语言描述的任务
- 当程序执行到这行时，模型会被调用，生成一段 Scala 代码来产生 `T`
- 生成的代码会在当前作用域内被编译检查——如果类型匹配，就跑；如果不匹配，就拒绝并重试

### 2.2 为什么这比 ReAct 更好？

传统的 ReAct Agent 模式是：模型每次只做一个工具调用（比如"搜索一下"、"读这个文件"），然后交替做推理和行动，直到得出结论。

LACUNA 的思路不同：模型写的是**一整段代码**，可以包含循环、条件分支、多个工具调用、甚至嵌套的 `agent` 调用。更重要的是，这段代码在运行前就被编译器检查了——**要么整体通过并运行，要么整体被拒绝，不会出现"部分执行导致状态不一致"的问题。**

### 2.3 安全保证

LACUNA 有三层安全机制：

1. **静态类型检查**：模型生成的代码必须像手写代码一样通过编译器检查
2. **原子性**：如果生成的代码有错误，整段代码都不会运行，不会留下不一致的状态
3. **能力追踪（Capture Checking）**：通过 Scala 3 的能力追踪系统，限制模型生成的代码能访问哪些资源（文件、网络、工具）

## 三、代码示例

### 示例 1：基础用法——过滤素数

假设你有一个数字列表，想让模型帮你写出过滤素数的代码：

```scala
val xs = List(0, 1, 2, 4, 7, 9, 10)

val r = agent[List[Int]](
  "filter the prime numbers from xs"
)

// 模型生成的代码可能是：
// def isPrime(n: Int): Boolean =
//   n > 1 && (2 until n).forall(n % _ != 0)
// xs.filter(isPrime)

// 最终结果：
val r: List[Int] = List(2, 7)
```

注意几个要点：

- 类型 `List[Int]` 约束了模型只能返回整数列表，不能返回字符串或单个整数
- `xs` 是外层程序定义的变量，模型生成的代码可以直接使用它
- 如果模型返回了错误的类型（比如返回了一个 `String`），编译器会在运行前拒绝这段代码，并把错误信息反馈给模型让它重试

### 示例 2：嵌套调用——并行研究并生成报告

更强大的场景是嵌套调用。模型生成的代码内部可以再调用 `agent`，形成递归的"孔洞套孔洞"：

```scala
val topics = List(
  "LLM", "world models", "transformer", "attention"
)

val report: String = agent[String](
  "Research each topic and generate a " +
  "report on their connections."
)

// 模型可能生成这样的代码：
val report: String = {
  val findings =
    topics.par.map(topic =>
      agent[String](s"Research: $topic")
    )
  agent("Generate a report from the findings")
}
```

这里发生了什么：

1. 最外层的 `agent` 被调用，模型收到任务
2. 模型生成的代码中，对 `topics` 列表做了并行映射，为每个主题发起一个子 `agent` 调用
3. 每个子调用有自己的类型参数（`String`）和任务描述
4. 最后再把所有发现汇总成一份报告

关键 insight：**嵌套的 `agent` 调用不是特殊的协议，就是普通的控制流。** 它可以分支、循环、并行分解，全部用宿主语言的语法表达。

### 示例 3：安全边界——防止越权操作

LACUNA 利用 Scala 3 的捕获检查（capture checking）来限制模型代码的能力。看下面这个例子：

```scala
trait IO extends caps.SharedCapability

def withIO[T](op: IO^ => T): T =
  op(new IO {})

def readFile(io: IO, path: String): String = ...

// 正常用法：读取文件，返回纯字符串（安全）
val res0: String = withIO[String] { io =>
  agent("read /etc/hosts using io")
}

// 危险用法：模型试图返回一个携带 io 能力的 lambda（被拒绝！）
val res2: String => String = withIO[String => String] { io =>
  agent("return a file reader using io")
}
// ❌ 编译错误：
// Capability io outlives its scope: it leaks into
// outer capture set s1 owned by value res2.
```

第一个调用是安全的：模型读取文件后返回一个普通字符串，`io` 能力没有泄露出 `withIO` 的作用域。

第二个调用被编译器拒绝了：模型试图返回一个 lambda，这个 lambda 捕获了 `io` 能力。但 `io` 是在 `withIO` 内部创建的，它的生命周期不应该超出这个块。编译器在运行前就阻止了这种"能力泄漏"。

### 示例 4：敏感数据处理—— Classified 包装器

对于敏感数据，LACUNA 可以结合 `Classified` 类型来确保数据永远不会泄露到不受信任的模型中：

```scala
class Classified[T]:
  def map[U](f: T => U): Classified[U]

val doc: Classified[String] = docs.load(id)

val report: Classified[Report] =
  doc.map { content =>
    // 这里的 agent 调用指向的是本地可信模型
    local.agent[Report](
      s"follow the skill steps on $content"
    )
  }
```

- 外层的托管模型（hosted agent）可以看到 `content` 的**源码**，但看不到 `content` 的**值**
- 当 `map` 在运行时展开时，`content` 的值只传递给本地可信模型（local agent）
- 本地模型生成的代码在纯函数作用域内编译，捕获检查禁止它做任何 I/O 操作（包括调用托管模型的 API）
- 结果仍然是 `Classified[Report]`，包装保持完整

## 四、编译错误即反馈

LACUNA 的一个优雅之处是：编译器的错误信息本身就是给模型的反馈。

```scala
val tax: Double = 0.08
agent[Double]("apply tax to price")

// 模型生成了：price * (1.0 + tax)
// ❌ 编译错误：Not found: value price

// 错误信息被送回给模型，模型知道要修复这个问题
// 可能重试生成：taxAmount * (1.0 + tax)
```

模型不需要理解复杂的 JSON schema 或工具注册表。它只需要像写正常的 Scala 代码一样写代码，编译器帮它保证正确性。

## 五、实际效果

论文中的实验数据：

- **BrowseComp-Plus 基准测试**：8.6% 的生成在运行前就被类型系统拒绝，平均每个查询 0.7 次重试，准确率达到 27.1%
- **τ²-bench**：在 392 个跨四个领域的任务上，LACUNA 解决了 76.0%，与基线 Agent 持平
- 每次被拒绝的代码都**完全不执行**，不会留下任何副作用

## 六、局限性与思考

论文也坦诚了几点局限：

1. **类型正确 ≠ 逻辑正确**：编译器只检查类型，不检查业务逻辑是否正确
2. **能力边界取决于授予的范围**：如果外层程序给了太多权限，模型代码也能用那么多
3. **依赖模型的编码能力**：模型写得越好，效果越好
4. **延迟和成本**：每次 `agent` 调用都涉及模型推理 + 编译 + 可能的重试
5. **终止和资源使用**：模型可能生成无限递归的嵌套调用，需要设置深度上限

## 七、总结

LACUNA 的核心贡献可以用一句话概括：

> 把 AI Agent 的每一次行动变成一个类型化的程序孔洞，让模型写的代码在运行前接受宿主语言的完整静态检查。

这样做的好处是：

- **安全性**：编译器的保证延伸到模型生成的代码
- **表达力**：嵌套调用、并行分解、技能复用都是普通控制流
- **简洁性**：工具就是函数，能力就是作用域，不需要额外的协议层

这篇论文由 EPFL 的 Martin Odersky（Scala 之父）等人完成，实现基于 Scala 3，充分利用了 Scala 3 的运行时编译能力和捕获检查系统。

---

*参考：Zhao, Y., Xu, Y., Bračevac, O., Pham, C. N., Wu, F. Z., & Odersky, M. (2026). LACUNA: Safe Agents as Recursive Program Holes. arXiv:2605.28617.*
