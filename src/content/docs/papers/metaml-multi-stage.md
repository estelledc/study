---
title: MetaML — 让你显式地写"先生成代码、再跑代码"
来源: Taha & Sheard, "MetaML and Multi-Stage Programming with Explicit Annotations", TCS 2000
日期: 2026-05-30
分类: 编程语言
难度: 中级偏上
---

## 是什么

MetaML 是一门**让你在普通程序里显式标记"这一段先生成代码、那一段稍后再执行"**的语言。

日常类比：写菜谱。
- 普通菜谱（普通程序）：一步步做。
- 多阶段菜谱（multi-stage）：第一步根据"是几人份"先**生成一份新的菜谱**，第二步再按生成出来的菜谱做菜。

MetaML 给你三个工具，让"生成代码"这件事在源代码里直接看得见：

- `< e >`（brackets）：把 e **延迟**成"一段代码值"，不立刻执行
- `~ e`（escape）：在 brackets 内部，把已经算出来的代码值**拼**进去
- `! e`（run）：把一份代码值**编译并执行**

你写的不再是"一份程序"，而是**一份会生成程序的程序**。

## 为什么重要

不理解多阶段编程，下面这些事你只能"用得了但说不清"：

- 为什么 Scala 的 LMS、Squid、MetaOCaml 看起来都长得很像——它们都是 MetaML 这套思想的不同宿主版本
- 为什么 Lisp 宏 和 Template Haskell 是两条路：Lisp 走的是"语法树拼接"，MetaML 走的是"类型化代码值"
- 为什么 [[partial-evaluation-jones]] 总被拿来和 staging 比——一个是编译器自动找阶段，一个是程序员显式标
- 为什么"DSL 编译到高效低层代码"成为 2010 年代的常见手艺——MetaML 给了它一套类型化基础

## 核心要点

MetaML 的全部魔法压成 **三个算符 + 一条规矩**：

1. **brackets `< e >`**：读到这一段，**不要算**，把它包成"代码值"。类比：把菜谱字条折起来放兜里，先不做。
2. **escape `~ e`**：在 brackets 内部用 `~e`，意思是"把这里换成 `e` 算出来的那份代码值"。类比：把另一张菜谱字条**贴**到当前字条的某一行。
3. **run `! e`**：把一份代码值**真的编译并执行**。类比：把字条交给厨师做。

一条规矩叫 **类型化**：代码值有类型 `<t>`，意思是"一段会算出 t 类型结果的代码"。`<int>` 不是 `int`，你不能直接对它 +1，必须先 escape 出来。这是 MetaML 跟 Lisp 宏最大的不同——**编译器在生成阶段就能查类型**。

附带一个细节叫 **cross-stage persistence**：外层的普通变量可以被内层 brackets 引用，但有规则约束作用域，不会"漏出去"。

## 实践案例

### 案例 1：编译期特化幂函数

经典例子。普通写法（每次调用都递归）：

```sml
fun power (n, x) = if n = 0 then 1.0 else x * power (n - 1, x)
```

MetaML 把「已知指数 n、未知底数 x」拆成两阶段——`x` 必须是**代码值** `<real>`，才能在 brackets 里 escape：

```sml
fun power (n, x) =   (* int × <real> → <real> *)
  if n = 0 then <1.0>
  else < ~x * ~(power (n - 1, x)) >
```

逐步：① 调用 `power (5, <x>)` 在**生成阶段**展开递归；② 得到代码值 `< x * x * x * x * x * 1.0 >`；③ `!` 编译执行。指数 `n` 已在生成阶段消掉。

### 案例 2：DSL 编译到底层代码

写一个矩阵运算 DSL，给定形状后**生成专用循环**：

1. 不带 staging：每次执行都解释 DSL 节点（遍历 AST），慢
2. 带 staging：解释器对已知形状返回 `<for i = ...>` 这类代码值
3. 对结果跑一次 `!`，编译成原生循环，之后百万次调用不再解释

Scala LMS（Rompf-Odersky 2010）把这条思路嵌进 Scala，支撑 Spark / Delite 类高性能 DSL。

### 案例 3：跟 Lisp 宏对比

```lisp
(defmacro square (x) `(* ,x ,x))
```

Lisp 宏：拿语法树拼接，运行时间发生在编译期，**没类型检查**——你拼出 `(+ 1 "a")` 也不会被立刻拒绝。

```sml
fun square x = < ~x * ~x >
```

MetaML：`x` 必须是 `<int>` 类型的代码值，编译器在你写的当下就拒绝错误拼接。

## 踩过的坑

1. **混淆 `<int>` 和 `int`**：`<int>` 是"会算出 int 的一段代码"，不是 int。你不能写 `<3> + 1`；要先 `!(<3>) + 1`，或在 brackets 内部用 `~` 拼接（`~` **只能**出现在 `<...>` 里）。

2. **run（`!`）很贵**：每次 `!e` 都要调用编译器。只在"生成一次、执行多次"才划算（比如 DSL 编 1 次跑 100 万次）。

3. **cross-stage persistence 引入幽灵变量**：把外层普通值塞进 brackets 时，如果作用域规则没设计好，生成的代码会引用不存在的变量。MetaML 用类型系统挡这个，但工程实现里仍是常见 bug。

4. **和 [[partial-evaluation-jones]] 边界模糊**：PE 是编译器自动找哪些可以提前算，MetaML 是程序员手动标。看起来效果像，但**控制权在谁手里完全相反**。两条路并行至今。

## 适用 vs 不适用场景

**适用**：
- 写需要生成低层代码的 DSL（线性代数、SQL 编译器、深度学习算子）
- 想要"参数化代码生成 + 类型保证"，又不想退回 Lisp 宏的无类型世界
- 高性能计算里"已知 N 后展开循环"这类特化

**不适用**：
- 普通 CRUD 应用——多阶段是工程负担，不是收益
- 只需要轻量元编程（Python decorator / Java annotation 级别）→ 杀鸡用牛刀
- 完全动态语言（Python / JS）→ 没静态类型 staging 失去主要好处
- 一次性脚本——`!e` 的编译开销吃掉所有收益

## 历史小故事（可跳过）

- **1971 年**：Futamura 提出 partial evaluation，编译器**自动**做 staging。
- **1989-1993 年**：Jones-Gomard-Sestoft 把 PE 工程化（[[partial-evaluation-jones]]）。
- **1997 年**：Walid Taha 和 Tim Sheard 在 PEPM 短文里第一次提出 MetaML——**显式** staging 算符。
- **2000 年**：TCS 长文（这篇），完整类型系统 + 元理论证明。
- **2003 年起**：Taha 自己做 MetaOCaml，把 staging 推到工业可用。
- **2010 年**：Rompf-Odersky 用 Scala 隐式参数实现 LMS，等价于 MetaML 思想 + 嵌入。
- **2016 年起**：Squid（Parreaux 等）在 Scala 里给 staging 加更精细的类型推断。

Taha 2017 年早逝，但这条思想线一直延续。

## 学到什么

1. **元编程不是只有 Lisp 一条路**——类型化的、跟宿主共用类型系统的 staging 是更安全的另一条路
2. **代码也是值**——`<t>` 让"代码"在类型层面有了一等公民地位
3. **生成 vs 执行可以拆开**——传统编译器藏在背后，MetaML 把这件事**摊到源代码里**让你显式控制
4. **显式 vs 自动**：MetaML（显式标）和 PE（自动找）是同一目标的两条路，不互斥而互补

## 延伸阅读

- 原论文：[Taha & Sheard, MetaML and Multi-Stage Programming with Explicit Annotations](https://www.cs.rice.edu/~taha/publications/journal/tcs00.pdf)（TCS 2000，约 50 页）
- MetaOCaml 入门：[Oleg Kiselyov — MetaOCaml tutorial](https://okmij.org/ftp/ML/MetaOCaml.html)（活的工业实现）
- Scala LMS：[Rompf & Odersky — Lightweight Modular Staging](https://infoscience.epfl.ch/record/150347)（PEPM 2010，把 MetaML 嵌入 Scala 的奠基）
- 综述：[Taha — A Gentle Introduction to Multi-stage Programming](https://www.cs.rice.edu/~taha/publications/journal/dspg04a.pdf)（更友好的入门版）
- [[partial-evaluation-jones]] —— 自动版的 staging
- [[lambda-calculus]] —— MetaML 的代码值本质就是被延迟求值的 lambda 项

## 关联

- [[partial-evaluation-jones]] —— 同一目标的"自动"路线，MetaML 是显式版
- [[lambda-calculus]] —— `< e >` 本质是把 e 延迟成抽象，MetaML 等于在 lambda 演算上加 staging 算符
- [[mccarthy-lisp]] —— Lisp 宏是 MetaML 的"无类型表亲"，对照看才能看清差异
- [[reynolds-definitional-interpreters]] —— "用一种语言定义另一种"的元编程基础观点
- [[system-f-reynolds-1974]] —— MetaML 的代码值 `<t>` 在类型层面也走多态
- [[hindley-milner]] —— MetaML 类型推导的基础引擎，加上 stage 注解后扩展
- [[pypy-tracing-jit]] —— 同样关心"生成专用代码"，但走 trace 而非显式标记
- [[turchin-supercompilation]] —— 比 PE 更激进的自动 staging

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
