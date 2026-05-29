---
title: Hindley-Milner — 编译器自己猜变量类型
来源: Damas & Milner, "Principal Type-schemes for Functional Programs", POPL 1982
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Hindley-Milner（**HM**）是一套**让编译器自己读代码、猜出每个变量是什么类型**的方法。日常类比：像一个推理小说侦探——他不会问你嫌疑人是谁，他从证据自己推。

你写：

```ml
let add = fun x -> x + 1
```

你**没标类型**。HM 编译器读完这一行，自己得出："`add` 必然是 `int → int`（接收一个整数，返回一个整数）"。

这个"自动推类型"的能力，是 OCaml / Haskell / Rust / TypeScript 这些语言敢说"静态类型但少手写注解"的核心引擎。

## 为什么重要

不理解 HM，下面这些事都没法解释：

- 为什么 OCaml / Haskell 写得像 Python（不标类型）但运行时**不会突然 `undefined is not a function`**
- 为什么 TypeScript 有时能推出复杂类型、有时又"推不动"——HM 是它的近亲但加了限制
- 为什么 Rust 报错信息有时候在第 17 行，但你最后发现根因是第 5 行——HM 推到中途才碰矛盾
- 为什么 1969 年的数学定理 60 年后还在影响每天写的代码

## 核心要点

HM 推类型的过程可以拆成 **三步**：

1. **占位符**：读到不知道的东西，先贴一张"占位卡片"——叫做"类型变量 α"。类比：拼图里看到一个孔，先放白卡占位。

2. **收集证据 → 解方程**：从代码用法里收集线索。比如读到 `x + 1`，已知 `+` 接收两个 `int`，所以 `x` 必须是 `int`。这一步在算法里叫**统一**（unification，Robinson 1965）。

3. **泛化（让函数对多种类型通用）**：`id = fun x -> x` 对任何类型都成立。HM 不会让它"凝固"成某个具体类型，而是保留 `α → α`，下次有人用就再代具体类型。这一步叫 **let-polymorphism**。

三步加起来叫 **算法 W**（Algorithm W）。

## 实践案例

### 案例 1：编译器在你看不见的地方推什么

OCaml 里你写：

```ocaml
let pair = fun a b -> (a, b)
```

编译器推出 `pair` 的类型是：

```
'a -> 'b -> 'a * 'b
```

**逐部分解释**：

- `'a` 和 `'b` 是类型变量，意思是 "任意类型 a"、"任意类型 b"
- `'a -> 'b -> 'a * 'b` 读作 "接收一个 a，再接收一个 b，返回一个 (a, b) 二元组"
- 这种 "保留任意 a 和 b" 就是**多态**——一份代码服务所有类型

### 案例 2：HM 怎么从证据推出具体类型

```ocaml
let inc = fun x -> x + 1
```

编译器推理过程：

1. 看到 `fun x -> ...` → 给 x 一个占位 α
2. 看到 `x + 1` → 已知 `+` 是 `int -> int -> int`
3. 解方程：α 必须是 `int`，整个表达式返回 `int`
4. 所以 `inc : int -> int`

整个过程**没问你一个字**。这就是 HM 的力量。

### 案例 3：TypeScript 里你能感受到的 HM 影子

```ts
const map = <T, U>(arr: T[], fn: (x: T) => U): U[] => arr.map(fn)
const result = map([1, 2, 3], (n) => n * 2)
//      ^? const result: number[]
```

TypeScript 自动推出 `T = number`、`U = number`、`result: number[]`。
这就是 HM 思想的简化版——TypeScript 没用完整 HM，但用了它的"占位符 + 解方程"两步。

## 踩过的坑

1. **HM 推不出"高阶多态"**：`fun id -> (id 1, id "hello")`——这要求 `id` 同时被当成 `int → int` 和 `string → string`，HM 拒绝。Haskell 用 `RankNTypes` 扩展才能写。

2. **let 和 fun 多态规则不一样**：`let x = ...` 里 x 可以多态，`fun x -> ...` 里 x **不能**多态。这个不对称叫 "value restriction"，让算法可判定，但有时阻挡你。

3. **副作用 + 多态 = 危险**：早期 ML 让 `let x = ref None` 多态，可以"先存 int 再当 string 取出"，类型系统失守。现代 OCaml / SML 用 "value restriction" 修了这个洞——有副作用的表达式不允许多态。

4. **错误信息读不懂**：HM 推到中途碰矛盾，会报"int 和 string 不匹配在第 17 行"，但矛盾**根因**可能在第 5 行的某个变量名写错。新人常被误导。

## 适用 vs 不适用场景

**适用**：
- 函数式语言的类型推导（OCaml / Haskell / Standard ML / Elm / PureScript）
- 类型注解负担重的场景——HM 能帮你省 80% 注解
- 中等复杂度的多态泛型——`a → a` / `a → b → (a, b)` 这种

**不适用**：
- 需要 rank-2 / rank-N 多态（HM 限制）→ 用 Haskell `RankNTypes` / Scala 隐式
- 需要带副作用的多态 → 必须有 value restriction
- 需要类型类 / 特征 / 接口（type class / trait） → HM 没有，需扩展（Haskell type class / Rust trait）
- 完全动态语言（Python / JS） → HM 不适用，它是静态类型推导

## 历史小故事（可跳过）

- **1969 年**：数学家 Roger Hindley 在组合子逻辑里证明每个项有"最一般类型"。纯数学，没人能跑。
- **1978 年**：Robin Milner 在爱丁堡造定理证明器 LCF，需要一种语言写它的元程序，发明了 ML（Meta Language），写了算法 W 但没证明它正确。
- **1982 年**：Milner 的博士生 Luis Damas 把 Hindley 1969 的数学 + Milner 1978 的算法拼成完整系统——有证明、能跑、能扩展。这就是 POPL 1982 论文，**6 页**。

之后 40 年，所有静态推导的函数式语言都是 HM 的徒孙。

## 学到什么

1. **类型可以推出来，不必硬标**——这是过去 60 年程序设计语言最重要的一个洞见
2. **占位符 + 收集证据 + 泛化** 是推导的三板斧，背后是数学上的 "最一般合一"（most general unifier）
3. **多态 vs 可判定**：能表达的多态越强，类型系统越难推。HM 选了"够用 + 一定能推出来"的中间点
4. **理论 → 算法 → 工程**，每一步隔 10 年。1969 → 1978 → 1982 → 1990s 工业落地

## 延伸阅读

- 视频教程：[Bartosz Milewski — Hindley-Milner Type Inference](https://www.youtube.com/watch?v=0mCsluv5FXA)（1 小时把推导过程讲一遍，有动画）
- 自己写实现：[Stephen Diehl — Write You a Haskell](https://smunix.github.io/dev.stephendiehl.com/fun/index.html)（用 Haskell 一步步写迷你 HM）
- 论文 6 页 PDF：[Damas-Milner 1982](https://web.cs.wpi.edu/~cs4536/c12/milner-damas_principal_types.pdf)（密度极高，看不懂正常）
- [[lambda-calculus]] —— HM 推导的对象就是 λ-演算项
- [[standard-ml]] —— 第一个用 HM 的工业语言

## 关联

- [[lambda-calculus]] —— 提供"项"的语法，HM 给"项"贴类型
- [[standard-ml]] —— ML 是 HM 的第一个工业宿主
- [[mccarthy-lisp]] —— 最早的函数式语言，但没类型系统；HM 是把"函数式 + 类型"绑到一起的桥
- [[llvm]] —— 现代编译器后端，与 HM 同样致力于"少手写、多自动推"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aes]] —— AES Rijndael 对称分组密码
- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[karp-21]] —— Karp 21 — 21 个 NP-完全问题
- [[knuth-taocp]] —— Knuth TAOCP — 计算机程序设计艺术
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[linear-types]] —— 线性类型（Linear Types）
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[push-pull-frp]] —— Push-Pull FRP — Functional Reactive Programming 实用化
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[smalltalk-80]] —— Smalltalk-80
- [[ssa]] —— SSA — 静态单赋值形式
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
- [[turing-1936]] —— Turing 1936 可计算性
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器

