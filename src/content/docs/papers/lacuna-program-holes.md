---
title: LACUNA — 把 AI agent 的行动变成编译器先检查的程序洞
来源: 'Zhao et al., "LACUNA: Safe Agents as Recursive Program Holes", arXiv 2026'
日期: 2026-05-27
分类: compilers-pl
难度: 中级
---

## 是什么

LACUNA 是一种让 AI agent 写代码办事、但先交给编译器检查再运行的编程模型。日常类比：像让实习生填一张报销单，但系统会先检查金额、部门、审批人都对不对；检查不过，单子不会进入付款流程。

它的核心接口长这样：

```scala
def agent[T](task: String): T
```

`task` 是自然语言任务，`T` 是周围程序期待的返回类型。执行到这里时，大模型生成一段 Scala 代码；LACUNA 把这段代码放回原来的程序位置，用同一套 Scala 编译器检查它。

如果代码能产生 `T`，它才运行；如果类型、名字、权限不对，它整体被拒绝，并把编译错误发回模型重试。

## 为什么重要

不理解 LACUNA，下面这些问题会很难解释：

- 为什么“让 agent 写代码”比“让 agent 调一个工具”更灵活，也更危险
- 为什么只靠 JSON schema 或输出格式约束，挡不住代码中途改坏状态
- 为什么静态类型不只是开发期工具，也能管住运行时生成的代码
- 为什么 prompt injection 的关键不是“模型会不会被骗”，而是“被骗后能碰到什么”

## 核心要点

1. **typed hole：先声明洞的形状**。类比：拼图板上先有洞的轮廓，模型只能填进形状匹配的一块。`agent[T]` 告诉模型和编译器：这里必须得到一个 `T`。

2. **先编译，后执行**。类比：舞台剧开演前先彩排整场，而不是演到一半才发现演员进错门。代码只要有一处类型错、名字不存在、返回值不对，整段都不运行。

3. **权限来自词法作用域**。类比：你进会议室时桌上有什么资料，你就只能用什么资料。Scala 3 的 capture checking 可以让文件、网络、工具能力都变成可追踪的值。

## 实践案例

### 案例 1：返回值形状被类型钉住

```scala
val xs = List(0, 1, 2, 4, 7)
val primes = agent[List[Int]]("filter prime numbers from xs")
// 允许：xs.filter(isPrime)
// 拒绝："2, 7"
```

**逐部分解释**：

- `List[Int]` 是洞的形状，意思是最后必须交回整数列表
- 模型可以自己写 `isPrime`，也可以调用周围已有函数
- 如果模型偷懒返回字符串，编译器在执行前就拒绝

### 案例 2：失败时不会留下半截副作用

```scala
var balance = 100
val left = agent[Int]("subtract 50 and return balance")
// 模型错误生成：
// balance -= 50
// s"left: $balance"
```

**逐部分解释**：

- 周围程序要的是 `Int`
- 最后一行却是 `String`
- 这段代码整体编译失败，所以 `balance -= 50` 也不会执行

这就是论文强调的 atomicity：坏片段不是“跑到一半报错”，而是“根本不进场”。

### 案例 3：权限可以跟着作用域走

```scala
def withReadOnlyFile[T](op: FileCap => T): T = ???

val summary = withReadOnlyFile { file =>
  agent[String]("read the file and summarize it")
}

val leaky = agent[String]("upload the file to the network")
```

**逐部分解释**：

- 第一个洞里 `file` 在作用域内，所以可以读文件
- 第二个洞没有网络能力，也没有文件能力，所以不能凭空上传
- 如果类型系统追踪能力，模型被诱导也只能使用作用域给过的工具

## 踩过的坑

1. **“类型对”不等于“任务对”**：编译器只保证返回形状和权限，不能保证摘要真的抓住重点。
2. **权限给多了就会失效**：如果把网络、文件、数据库都放进同一个洞，类型系统只能忠实执行这个过宽边界。
3. **递归 agent 可能失控**：模型可以生成新的 `agent` 调用，所以运行时仍要限制深度、时间和重试次数。
4. **宿主语言门槛很高**：动态语言的 `eval` 容易做，但没有静态类型和能力追踪，安全故事就弱很多。

## 适用 vs 不适用场景

**适用**：

- 想让 agent 写多步代码，而不是一次只调一个工具
- 工具参数、返回值、权限边界能用静态类型表达
- 任务本身已经愿意付一次模型调用和一次编译检查的成本
- 需要把 ReAct、skills、子 agent、并行分解统一成普通控制流

**不适用**：

- 超低延迟路径，连一次重新编译都嫌慢
- 结果正确性必须由语义证明保证，而不只是类型形状保证
- 宿主语言没有运行时重新编译机制，也没有能力或 effect discipline
- 开发者无法清楚拆分最小权限，只能把所有工具一次性塞进作用域

## 历史小故事（可跳过）

- **2017 年**：Hazelnut 等 typed hole 工作把“程序里缺一块，但类型知道缺什么”做成编辑器和理论问题。
- **2023 年**：ReAct 让模型在“思考”和“行动”之间循环，成为 agent 常见骨架。
- **2024 年**：code-as-action agent 开始让模型直接写代码，把工具组合、循环和解析都交给代码完成。
- **2025 年**：prompt injection 与 agent 权限问题变得更突出，研究者开始强调能力隔离和数据流边界。
- **2026 年**：LACUNA 把这些线索接起来：让模型写程序洞，但让宿主编译器先验收这段行动。

## 学到什么

- Agent 行动可以不是“工具调用记录”，而是一段普通程序。
- 静态类型最有价值的地方，是把错误挡在执行前，而不是事后解释异常。
- 安全边界最好跟代码作用域绑定：洞看得见什么，才有资格使用什么。
- LACUNA 的野心不是替代所有 agent 框架，而是给这些框架一个可组合、可检查的底座。

## 延伸阅读

- 论文 PDF：[LACUNA: Safe Agents as Recursive Program Holes](https://arxiv.org/pdf/2605.28617v1.pdf)
- [[react]] —— LACUNA 把 ReAct 循环改写成递归的 `agent[T]` 控制流
- [[dspy]] —— DSPy 约束单次模型调用的输入输出，LACUNA 约束模型生成的整段程序
- [[liquid-types]] —— 论文把 refinement type 作为下一步：不只检查形状，还检查值满足性质
- [[stainless-2017]] —— 如果未来洞的返回值带可证明性质，验证器会成为更强的后端
- [[code-as-agent-harness]] —— LACUNA 属于 code-as-action 路线，但把安全检查前移到编译器

## 关联

- [[react]] —— 递归 agent 调用可以表达 ReAct 的“观察、行动、再观察”
- [[dspy]] —— 都把模型调用写进程序，只是约束层级不同
- [[effect]] —— LACUNA 的能力边界和 effect/资源追踪有共同直觉
- [[liquid-types]] —— refinement type 是把 `T` 变成更细契约的自然方向
- [[stainless-2017]] —— 代表“让程序性质进入验证器”的另一条路
- [[scala-macros]] —— Scala 编译器扩展能力是 LACUNA 原型能成立的工程基础之一
- [[swe-agent]] —— 同样关注 agent 写代码，但 LACUNA 更关心运行时行动的类型安全

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
