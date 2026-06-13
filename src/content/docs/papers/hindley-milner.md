---
title: Hindley-Milner — 编译器自己猜出所有变量的类型
来源: 'Luis Damas & Robin Milner, "Principal Type-schemes for Functional Programs", POPL 1982'
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
难度: 中级
provenance: pipeline-v3
---

## 是什么

Hindley-Milner（HM）是一套**让编译器自己读代码、猜出每个表达式是什么类型**的数学方法。日常类比：像一个推理小说侦探——他不会问嫌疑人"你是谁"，他从证据自己推。

你写：

```ocaml
let add = fun x -> x + 1
```

你**没标类型**。HM 编译器读完这一行，自己得出："`add` 必然是 `int -> int`（接收一个整数，返回一个整数）"。

这个"自动推类型"的能力，是 OCaml / Haskell / Rust / TypeScript 这些语言敢说"静态类型但少手写注解"的核心引擎。1982 年 Damas 和 Milner 把完整的推导算法（Algorithm W）写在了一篇仅 6 页的 POPL 论文里——此后 40 年，所有带类型推导的函数式语言都是它的徒孙。

## 为什么重要

不理解 HM，下面这些事都没法解释：

- 为什么 OCaml / Haskell 写得像 Python（不标类型）但运行时**不会突然 `undefined is not a function`**——HM 在编译期就推完了所有类型
- 为什么 TypeScript 有时能推出复杂泛型、有时又"推不动"——TS 用的是 HM 的近亲但做了工程妥协
- 为什么 Rust 报错信息有时候在第 17 行，但你最后发现根因是第 5 行——HM 推到中途才碰矛盾，矛盾点和根因点常不在同一行
- 为什么 1969 年的纯数学定理 60 年后还在影响你每天写的代码——基础理论的生命周期远超任何框架

## 核心要点

HM 推类型的过程可以拆成**三步**：

1. **贴占位符**：读到不知道类型的东西，先贴一张"占位卡片"——叫做类型变量（type variable），记作 `α`、`β`。类比：拼图里看到一个孔，不知道哪块填进去，先放一张白卡占位。代码里遇到 `fun x -> ...`，x 的类型就是 `α`。

2. **收集证据 + 解方程**：从代码用法里收集线索。比如读到 `x + 1`，已知 `+` 接收两个 `int` 返回一个 `int`，所以 `x` 和 `1` 必须是 `int`。这一步在算法里叫**统一**（unification，Robinson 1965 年发明）。类比：你在纸上列出一堆"A 必须等于 B"的等式，然后逐个消元——`α = int`、`β = string`——直到所有类型变量都被确定。

    统一有一个关键保护叫 **occurs check**：如果推到 `α = α -> β`（一个类型包含它自己），直接拒绝。没有这个检查的话，可以把永不终止的 `(λx. x x)(λx. x x)` 错误地标上类型。

3. **泛化（让函数对多种类型通用）**：`let id = fun x -> x` 对任何类型都成立。HM 不会让它"凝固"成 `int -> int`，而是保留 `∀α. α -> α`（"对任意类型 α，接收 α 返回 α"）。下次有人用 `id 3` 就把 `α` 代成 `int`，有人用 `id "hello"` 就把 `α` 代成 `string`。这一步叫 **let-polymorphism**——只有 `let` 绑定的变量才能多态，`fun` 的参数不能。这个不对称设计是为了保证推导算法一定终止（全 System F 的类型推导是不可判定的）。

三步加起来叫 **算法 W**（Algorithm W）。它有两个数学保证：**soundness**（推导出的类型不会在运行时出错）和 **completeness**（如果存在类型注解能让程序通过检查，算法 W 一定能找到——而且是"最一般"的那个）。

## 实践案例

### 案例 1：编译器在你看不见的地方推什么

OCaml 里你写：

```ocaml
let pair = fun a b -> (a, b)
```

编译器推出 `pair` 的类型是：

```
val pair : 'a -> 'b -> 'a * 'b
```

**逐部分解释**：

- `'a` 和 `'b` 是类型变量，意思是"任意类型 a"、"任意类型 b"
- `'a -> 'b -> 'a * 'b` 读作"接收一个 a，再接收一个 b，返回一个 (a, b) 二元组"
- 这种"保留任意 a 和 b"就是**多态**——一份代码服务所有类型。pair 3 "hello" 返回 `(3, "hello")`，pair true 1.5 返回 `(true, 1.5)`
- HM 不把 a 和 b 固化成具体类型，因为 pair 的代码**没用任何特定类型的操作**（没做加法、没取长度），所以没理由限制它

### 案例 2：HM 怎么从证据一步一步推出具体类型

```ocaml
let inc = fun x -> x + 1
```

编译器推理过程：

1. 看到 `fun x -> ...` → 给 x 一个占位 `α`
2. 看到 `x + 1` → 已知 `+` 的类型是 `int -> int -> int`
3. 统一：`α` 必须等于 `int`（因为 `+` 的第一个参数要求 int），`1` 已经是 `int`
4. 表达式返回值类型：`+` 的返回类型是 `int`，所以 `inc` 整体是 `int -> int`
5. 结果：`val inc : int -> int`

整个过程**没问你一个字**。这就是 HM 的力量——编译器像侦探一样从操作符的类型签名反推变量的类型。

### 案例 3：TypeScript 里你能感受到的 HM 影子

```ts
const map = <T, U>(arr: T[], fn: (x: T) => U): U[] => arr.map(fn)
const result = map([1, 2, 3], (n) => n * 2)
//      ^? const result: number[]
```

TypeScript 自动推出 `T = number`、`U = number`、`result: number[]`。这里和 HM 的共通点是：

- `T` 和 `U` 一开始是"占位符"（HM 叫类型变量，TS 叫泛型参数）
- 调用 `map([1, 2, 3], ...)` 时收集到证据：`arr` 是 `number[]`，所以 `T = number`
- `(n) => n * 2` 返回 `number`，所以 `U = number`

**TS 和完整 HM 的关键差异**：TypeScript 没有 let-polymorphism（不区分 `let` 和函数参数的多态权限），也没有泛化（generalization）步骤。它是 HM 的"工程简化版"——牺牲了一些推导能力，换来了和 JS 生态的兼容性。

## 踩过的坑

1. **HM 推不出高阶多态（rank-2/rank-N）**：`fun id -> (id 1, id "hello")` 这要求 `id` 同时被当成 `int -> int` 和 `string -> string`，但 `fun` 参数在 HM 里**不能多态**——只能有一种类型。Haskell 用 `RankNTypes` 扩展才能写。

2. **let 和 fun 的多态规则不对称**：`let x = ...` 里 x 可以多态（`∀α. α -> α`），`fun x -> ...` 里 x **不能**多态。这个不对称叫 "value restriction"，是为了保证算法可判定，但有时会阻挡你想写的代码。

3. **副作用 + 多态 = 类型安全漏洞**：早期 ML 让 `let x = ref None` 多态，可以"先存 int 再当 string 取出"，类型系统失守。现代 OCaml / SML 用 "value restriction" 修了这个洞——有副作用的表达式不允许多态泛化。

4. **错误信息读不懂**：HM 推到中途碰矛盾，会报"int 和 string 不匹配在第 17 行"，但矛盾**根因**可能在第 5 行的某个变量名写错。新人常被误导——看到第 17 行是对的，就反复改那一行，越改越错。经验：报错行往上翻，找最近的类型标注或变量使用。

## 适用 vs 不适用场景

**适用**：

- 函数式语言的类型推导（OCaml / Haskell / Standard ML / Elm / PureScript）——这是 HM 的主场
- 类型注解负担重的场景——HM 能帮你省 80% 的手写注解，只在公开 API 处标注即可
- 中等复杂度的多态泛型——`a -> a`、`a -> b -> (a, b)`、`(a -> b) -> [a] -> [b]` 这种级别 HM 轻松处理

**不适用**：

- 需要 rank-2 / rank-N 多态（把多态函数当参数传）→ 用 Haskell `RankNTypes` / Scala 隐式参数
- 需要带副作用的多态引用 → 必须有 value restriction，或者换用更现代的类型系统（Rust 的 ownership、Koka 的 algebraic effects）
- 需要类型类 / trait / 接口（type class） → HM 原生没有，需扩展（Haskell type class / Rust trait / Scala implicit）
- 完全动态语言（Python / JS 不加类型注解）→ HM 不适用，它是**静态**类型推导，运行时信息用不到

## 历史小故事（可跳过）

- **1969 年**：数学家 Roger Hindley 在组合子逻辑里证明每个项存在"最一般类型"（principal type）。纯数学，没有实现，没有人能跑。

- **1978 年**：Robin Milner 在爱丁堡大学造 LCF 定理证明器，需要一种语言写它的元程序（meta-program）。他发明了 ML（Meta Language），顺手写了 Algorithm W——能实际运行的推导算法——但没给出完备性证明。

- **1982 年**：Milner 的博士生 Luis Damas 把两样东西拼到一起——Hindley 1969 的数学框架 + Milner 1978 的工程算法 + 完备性证明。写成 6 页 POPL 论文。Damas 的贡献常被低估——是他把"能跑"和"能证明"合为一体。

- 此后 40 年：Haskell（1990）、OCaml（1996）、F#（2005）、Elm（2012）、PureScript（2013）、Rust 的部分推导（2015）——全部站在这 6 页纸的肩膀上。

## 学到什么

1. **类型可以推出来，不必硬标**——这是程序设计语言过去 60 年最重要的洞见之一。省掉的不只是敲键盘的功夫，更重要的是让代码更简洁、重构更安全——改一处实现，类型推导会自动把影响传播出去，不匹配的地方编译器会替你找到。

2. **占位符 + 收集证据 + 泛化**是推导的三板斧，背后是 Robinson 的"最一般合一"（most general unifier）。理解了这三步，再看任何语言的类型推导都能快速抓住要点。

3. **多态 vs 可判定是一对永恒的矛盾**：能表达的多态越强，类型系统越难自动推导。HM 选了"够用 + 一定能推出来"的中间点——System F 更强大但类型推导不可判定，Monomorphic 一定能推但表达能力太弱。

4. **理论 -> 算法 -> 工程**，每一步隔大约 10 年。1969（数学证明） -> 1978（可运行算法） -> 1982（理论完备） -> 1990s（Haskell/OCaml 工业落地）。好理论不急着落地，但一旦落地就影响深远。

## 延伸阅读

- 论文原文（仅 6 页）：[Damas & Milner, "Principal Type-schemes for Functional Programs", POPL 1982](https://web.cs.wpi.edu/~cs4536/c12/milner-damas_principal_types.pdf)
- 视频教程：[Bartosz Milewski — Hindley-Milner Type Inference](https://www.youtube.com/watch?v=0mCsluv5FXA)（1 小时，有动画，把推导过程一步步演了一遍）
- 自己实现：[Stephen Diehl — Write You a Haskell](https://smunix.github.io/dev.stephendiehl.com/fun/index.html)（用 Haskell 从零写一个迷你 HM 推导器，边写边学）
- [[lambda-calculus]] —— HM 推导的对象就是 λ-演算项，先理解 λ-演算再看 HM 会轻松很多
- [[standard-ml]] —— 第一个用 HM 的工业语言，ML 的"类型推导体验"至今仍是标杆

## 关联

- [[lambda-calculus]] —— 提供"项"的语法，HM 给"项"贴类型，两者加起来才是一门完整的类型化 λ-演算
- [[standard-ml]] —— ML 是 HM 的第一个工业宿主，Standard ML 的定义里类型推导就是标配
- [[mccarthy-lisp]] —— 最早的函数式语言但没类型系统；HM 把"函数式编程 + 静态类型"绑到了一起
- [[bidirectional-typing]] —— HM 的"纯推导"在一些场景太激进，双向类型检查在"推导"和"检查"之间加入了平衡
- [[milner-pi-calculus]] —— Milner 的另一杰作，π-演算和 HM 分别代表了他对"类型"和"并发"两大方向的贡献
- [[theorems-for-free]] —— Wadler 1989：从 HM 推出来的多态类型签名可以"免费"得到语义定理——类型越泛，能做的事越少，越容易推理
- [[gradual-typing]] —— 把 HM 的"全有或全无"类型推导变成"可以渐进标注"——TypeScript / Flow / mypy 都是这个思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
