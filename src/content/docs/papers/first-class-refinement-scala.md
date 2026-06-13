---
title: First-Class Refinement Types for Scala — 把「带条件的类型」写进 Scala 3 本身
来源: 'Bovel, Kunčak & Odersky, "First-Class Refinement Types for Scala", arXiv:2605.08369, 2026'
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
---

## 从日常类比开始：VIP 名单不是贴在门外的便签

想象一家 nightclub 的入场规则：

- **普通做法**：门口保安只认身份证上的「是否成年」（相当于 `Int`、`String` 这类基础类型）。至于「是否穿正装、是否在 guest list 上」，另有一张**手写便签**贴在保安亭里——保安和前台各看各的，规则不一致时，客人会在两个窗口之间来回解释。
- **理想做法**：guest list 直接写进**同一份正式名册**。前台登记时，姓名后面就带上「仅限 VIP 区」；保安、调酒师、储物柜系统读的都是同一份数据，子集关系也自然成立——「VIP」一定是「已入场客人」的子集。

编程里的 **refinement type（精化类型）** 就是给类型加逻辑谓词：  
`{ x: Int | x > 0 }` 表示「正整数」，比裸 `Int` 更窄。

Liquid Haskell、F*、Dafny 等系统早已证明：这种「类型 + 谓词」的轻量验证很管用——数组下标不越界、除数不为零、协议状态机不变量，都可以写进类型。

但 Liquid Haskell 的典型写法是：

```haskell
{-@ x :: {v:Int | v mod 2 == 0} @-}
let x = 42 :: Int in ...
```

注意 **`Int` 写了两遍**：一遍给 GHC，一遍给 LiquidHaskell 插件。两套类型检查器、两套报错、两套 IDE 心智模型。Gamboa 等人 2025 年的可用性研究里，有参与者说：「好像在同时跟 GHC 和 LiquidHaskell 说话。」

这篇论文（EPFL，Matt Bovel、Viktor Kunčak、Martin Odersky）的核心主张是：**在 Scala 3 里，精化类型应该是 first-class——和普通类型一样，参与子类型、推断、模式匹配、重载解析**，而不是编译器外的第二层。

Liquid Haskell 的例子在 Scala 3 原型里变成：

```scala
val x: (Int with x % 2 == 0) = 42
```

`Int with x % 2 == 0` 就是**普通 Scala 类型**，不是注释里的注解。

---

## 是什么

**First-Class Refinement Types for Scala** 提出并实现了 Scala 3 精化类型的完整设计：

1. **语法**：两种写法——长形式 `{ v: T with p(v) }` 与短形式 `T with p`（复用外层绑定名）。
2. **语义**：谓词是 Scala 表达式的一个**纯子集**；采用**部分正确性（partial correctness）**——程序若终止且返回值存在，则满足谓词；不要求证明终止。
3. **类型推断**：保留 Scala 原有 widening，不强行给每个中间表达式推断最精类型；用 **equality facts（等式事实）** 和 **selfification（自化）** 按需恢复精度。
4. **证明义务**：编译器内置轻量 **e-graph 求解器**（约 600 行），不依赖外部 SMT；IDE 里每次按键都能跑。
5. **形式化**：在 Rocq 中 mechanize 核心演算 soundness，覆盖依赖函数类型、有界多态、正等递归类型、并/交类型与精化类型的组合。
6. **工程**：作为 Dotty（Scala 3 编译器）原型扩展，约 2500 行改动。

论文状态：2026 年 5 月 arXiv 草稿（`2605.08369`），与 [scala/scala3#21586](https://github.com/scala/scala3/pull/21586) 工作相关。

---

## 为什么重要

### 1. 解决「两套类型系统」的结构性问题

Schmid & Kunčak 2016 年在旧版 Dotty 上做过 qualified types，但 refinement checker **与 Scala 类型检查器 largely independent**。结果是：精化类型流不进泛型代码、无法与 Scala 推断协同、需要单独的 qualifier 推断——难以扩展。

用户态库 **Iron**、**Refined** 走另一条路：用 opaque type + implicit evidence 模拟约束，能复用 Scala 工具链，但证明能力受 implicit 解析限制，没有专用算术/等式决策过程。

First-class 设计的目标是：**一条类型检查管线、一种报错语言、一种推断行为**。

### 2. 与 Scala 既有特性自然组合

精化类型是基类型的**子类型**（refinement <: base），因此：

- **有界多态**里，`U <: T` 可以实例化为精化类型；
- **重载解析**会选更具体的签名；
- **模式匹配**可以把精化类型当 pattern，运行时分支。

这些在「外挂 refinement 层」的架构里往往要单独造机制；在 first-class 设计里从子类型直接推出。

### 3. 工业编译器上的可行性

不是只在论文语言里演示：作者 fork Dotty，改 bidirectional type checker 的一个 reconciliation 点，加 e-graph solver，benchmark 显示编译开销仍较低——说明「主流 OO 语言 + 丰富子类型」与 refinement 可以共存。

---

## 核心概念

### 1. Refinement type 的两种语法

**长形式**（显式 binder，用于返回值等没有现成名的情况）：

```scala
def fill[T](n: Int, v: T): { r: Vec[T] with r.len == n } = ???
```

**短形式**（复用 `val`/参数名，desugar 为长形式）：

```scala
val x: (Int with x % 2 == 0) = 42
// 等价于
val x: { v: Int with v % 2 == 0 } = 42
```

谓词 **reuse Scala 表达式语法**，但语义上限制在纯 fragment：常量、stable identifier、`val` 字段选择、构造器、布尔/比较/算术等。可变变量、引用相等类不能出现在谓词里。

### 2. 子类型：精化类型是基类型的子集

若 `p ⇒ q`（谓词蕴含），则 `{ x: T | p(x) } <: { x: T | q(x) }`。  
任意 `{ x: T | p(x) } <: T`——精化类型可当作基类型用。

这是 bounded polymorphism 与重载能工作的根基。

### 3. 部分正确性 vs 全正确性

- **全正确性**（Liquid Haskell、System FR）：还要证明终止，否则 unsound。
- **部分正确性**（本文）：只要**能返回**，返回值满足谓词；不终止的表达式理论上可赋「假谓词」类型，但强迫求值的路径不可达。

取舍：Scala 是通用语言，要求终止证明 adoption 成本太高；部分正确性仍覆盖大量实践（边界检查、除零、格式验证）。

### 4. Mixed-precision 推断：equality facts

若每个 `val x = 1 + 2` 都推断成 `{ v: Int | v == 1 + 2 }`，会破坏：

- **向后兼容**（implicit / overload 依赖推断类型）；
- **性能**（类型变大、比较变慢）；
- **可读性**（满屏 singleton union）。

因此 **`val mPlusN = m + n` 仍推断为 `Int`**，但上下文记录 **`mPlusN ~ m + n`**。当后续需要 `{ r: Vec[...] with r.len == m + n }` 时，求解器用等式替换验证义务。

### 5. Selfification：把表达式「抬」进类型

检查表达式 `e: T` 是否符合期望 `{ x: T | p(x) }` 时，若 `e` 是合法谓词项，可赋 **自引用类型** `{ x: T | x == e }`——无需改变无注解代码的推断，只在需要精度的边界生效。

例如 `case class Range(from: Int, until: Int)` 构造结果可 selfify 为 `{ r: Range | r == Range(from, until) }`，配合 skolem 变量，求解器能展开 `?1.from`、`?1.until` 验证循环体里的下标。

### 6. E-graph 求解器（内置，无 SMT 依赖）

义务形式：`P1 ⇒ P2`（假设谓词能否推出目标谓词）。

- 收集 qualifier、val 等式、分支条件；
- 插入 **acyclic e-graph**，做 congruence closure；
- 域相关 rewrite：`x + 0 → x`、`x % 2 == 0` 与偶数判定等。

优点：无平台相关 SMT 二进制、适合 IDE 实时反馈。  
代价：线性算术等理论**没有完备决策过程**——Schmid 原型里需要 LA 的 benchmark（如 `sumnat`）本文求解器过不了；与 Stainless 的全功能验证不在同一赛道。

### 7. 运行时兜底

静态证不出的谓词，程序员可显式：

- **模式匹配**：`case id: ID => ...` 运行时检验；
- **`.runtimeChecked`**：失败抛异常（desugar 为 `if` + `asInstanceOf`）。

不自动插入 dynamic check，形式化更简单；且限制在一阶谓词，避开高阶 contract 的 blame assignment 问题。

### 8. 形式化核心（Rocq）

核心演算在 System F<sub><:</sub> 上扩展：依赖函数/对、和类型、并/交、精化、正等递归、fuel-bounded definitional interpreter + semantic typing。

作者称这是首个 mechanized soundness proof，**同时**组合：精化 + 并/交 + 双界有界多态 + 正等递归——此前 mechanization 未覆盖这一组合（Hamza 2019、Borkowski 2024、Sun 2024 等各覆盖子集）。

---

## 代码示例

### 示例 1：长度索引向量（依赖精化）

经典「向量长度在类型里」：

```scala
type Vec[T]

object Vec:
  def fill[T](n: Int, v: T): { r: Vec[T] with r.len == n } = ???

  extension [T](a: Vec[T])
    def len: Int = ???

  def concat(b: Vec[T]): { r: Vec[T] with r.len == a.len + b.len } = ???

  def zip[S](b: Vec[S] with b.len == a.len): { r: Vec[(T, S)] with r.len == a.len } = ???

def example3(n: Int, m: Int): { r: Vec[(String, Int)] with r.len == m + n } =
  val v1 = Vec.fill(n, 0)
  val v2 = Vec.fill(m, 1)
  val v3 = v1.concat(v2)
  val mPlusN = m + n   // 推断仍为 Int，但有 mPlusN ~ m + n
  Vec.fill(mPlusN, "").zip(v3)
```

要点：

- `zip` 要求 `b.len == a.len`——**依赖精化**（谓词引用其他绑定）。
- `mPlusN` 不必写成精化类型；**等式事实**在 `fill(..., "").zip(v3)` 处把义务 discharge 掉。

### 示例 2：有界多态 + 重载解析

**有界多态**：精化类型实例化类型参数

```scala
def maximum[T: Ordering, U <: T](xs: List[U]): U = xs.reduce(max)

type Even = { v: Int with v % 2 == 0 }

def example1: Even = maximum(List(2, 4, 6))
// U 推断为 Even；Even <: Int 满足 U <: T
```

**重载**：更具体的精化签名优先

```scala
def min(l: List[Int] with l.isSorted): Int = l.head  // O(1)
def min(l: List[Int]): Int = l.min                    // O(n)

def example2(l: List[Int] with l.isSorted): Int = min(l)
// 调用第一个 overload
```

若 refinement 是外挂层，`maximum` / `min` 这类 everyday Scala 代码很难「无感」组合；first-class 子类型让泛型与重载**零额外机制**生效。

### 示例 3：运行时精化（模式 + checked cast）

```scala
type ID = { s: String with s.matches(idRegex) }

"a2e7-e89b" match
  case id: ID => println(s"valid: $id")
  case _      => println("invalid")

val id: ID = userInput.runtimeChecked
```

静态证不出时，程序员**显式**选择运行时路径——与 Flanagan 2006 hybrid checking「编译器自动插桩」不同，责任边界清晰。

---

## 与相关工作的对比（简表）

| 系统 | Refinement 位置 | 与宿主类型系统 | 求解 / 证明 |
|------|-----------------|----------------|-------------|
| Liquid Haskell | 注释注解 | 分离 phase | 外部 SMT + 终止 |
| Schmid Dotty 2016 | 限定类型 | 独立 checker | SMT，更强算术 |
| Iron / Refined（库） | opaque + implicit | 完全 inside Scala | implicit 能力上限 |
| **本文 Scala 3** | **普通类型语法** | **同一 type checker** | **内置 e-graph** |
| F* / Dafny | first-class | 为验证设计的语言 | SMT / Dafny 求解器 |
| Stainless | 精化 + 依赖 | 独立验证器 | 强大 SMT，目标更重 |

本文定位：**在已有丰富子类型的工业语言里**，把 refinement 做成 first-class，并用 modest 编译器改动 + 轻量求解器证明可行。

---

## 学习路径（零基础）

1. **先理解 refinement 直觉**：集合 `{ x ∈ T | P(x) }`；子类型 = 谓词变强（集合变小）。
2. **读 Liquid Haskell 一个例子**，再对照论文 Scala 语法——体会「一套 vs 两套类型系统」。
3. **手画子类型格**：`{ v:Int | v>0 }` → `Int`；`Even` 如何放进 `U <: T`。
4. **跟踪 equality fact**：写 `val a = m+n`，在需要 `len == m+n` 的地方求解器怎么用 `a ~ m+n`。
5. **了解 selfification 触发点**：期望类型是 qualified type 时，表达式如何变成 `{ x:T | x==e }`。
6. **区分静态义务 vs `.runtimeChecked`**：哪些证明是编译期，哪些是程序员承担的动态检查。
7. **若学类型论**：读 §3 的 F<sub><:</sub> + 精化 + 正等递归；对比 Hamza System FR 的全正确性假设。
8. **若学编译器**：Dotty bidirectional checking 的 reconciliation 点、e-graph congruence closure（Nelson-Oppen 传统）。

---

## 局限与开放问题

- **求解器能力**：无完备线性算术；复杂不变量仍可能证不出，需 `.runtimeChecked` 或弱化规范。
- **谓词纯度**：目前不传递检查被调用函数是否纯；未来或与 Scala 3 capture tracking / safe mode 集成。
- **JVM 擦除**：参数化精化如 `List[ID]` 的模式匹配受限；需 workaround（如 `filter` + 精化元素）。
- **高阶谓词**：运行时检查仅限一阶；高阶 contract 仍是 future work。
- **草稿阶段**：论文写「coming months will update」；API 以最终 Scala 3 PR 为准。

---

## 一句话总结

**Refinement type 不是编译器外的「验证注释」，而是 Scala 3 类型语法里的普通公民**——与子类型、泛型、重载、模式匹配同一套规则；通过 equality facts 与 selfification 保持推断兼容，用内置 e-graph  discharge 义务，并在 Rocq 里证明核心 soundness。对学习者而言，这篇论文的价值在于：它把「轻量形式化验证」从专用语言/插件，推到了**你已经在写的 Scala 类型**里。

---

## 参考链接

- 论文 HTML：[arXiv:2605.08369](https://arxiv.org/html/2605.08369v1)
- 论文 PDF：[https://arxiv.org/pdf/2605.08369](https://arxiv.org/pdf/2605.08369)
- 相关工作 PR：[scala/scala3#21586](https://github.com/scala/scala3/pull/21586)
- 历史背景：Liquid Types（Rondon et al. 2008）、Liquid Haskell（Vazou et al. 2014）
- 形式化参考：System FR（Hamza et al. 2019）、Schmid SMT-based qualified types for Scala（2016）
