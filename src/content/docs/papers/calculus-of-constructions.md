---
title: Calculus of Constructions — 让程序和数学证明共用一种语言
来源: 'Thierry Coquand & Gérard Huet, "The Calculus of Constructions", Information and Computation 1988'
日期: 2026-05-29
分类: 编程语言
难度: 高级
---

## 是什么

Calculus of Constructions（**CoC**）是一个**让你用同一种语言写程序和写数学证明**的类型系统。日常类比：像一本菜谱，"这是一道健康菜"的承诺（类型）和"切菜、煮、调味"的步骤（程序）用同一套词汇记录——你照步骤做，做出来本身就是"健康"成立的证据。

形式上 CoC 是个 λ-演算的扩展，把三种能力**揉进一个**系统：

- 类型可以接收类型作参数（多态，从 [[system-f-reynolds-1974]] 借的）
- 类型可以由值决定（依赖类型，从 Martin-Löf 借的）
- 类型本身可以被组合、抽象（高阶类型）

这三种能力分别活在 Barendregt **λ-cube** 的三条边上，CoC 是把三条边都打开的那个角。

## 为什么重要

不理解 CoC，下面这些事都没法解释：

- 为什么 **Coq**（Coquand 名字命名的证明助手）能写一个排序函数顺便证明它结果有序——CoC 是 Coq 的内核
- 为什么形式化数学（Lean、Agda、Rocq 验证四色定理 / Feit-Thompson 定理）背后跑的都是同一类系统
- 为什么"程序即证明"（Curry-Howard）从一个比喻变成可执行的工程现实
- 为什么类型系统的天花板还没碰到——CoC 的子孙仍在演化（CIC、HoTT、Cubical）

## 核心要点

CoC 的"同一种语言"靠 **三个机制** 撑起来：

1. **两个 sort：Prop 和 Type**：所有"东西"（值、类型、命题）都活在一棵语法树里。`Prop` 是命题宇宙，`Type` 是数据宇宙。类比：把"逻辑符号"和"数据符号"塞进同一个抽屉，但贴两种颜色标签区分用途。

2. **Pi 类型 `Πx:A. B`**：依赖函数类型。`B` 可以**用到 x 的值**。例子：`Πn:Nat. Vec n`——给我一个数 n，返回一个长度为 n 的向量类型。普通函数 `A → B` 只是 `Πx:A. B` 中 B 不依赖 x 的特例。

3. **Curry-Howard 同构**：每个 Pi 类型既是程序的"函数类型"也是逻辑的"全称命题"。证明 `∀n. n+0=n` 就是写一个 `Πn:Nat. Eq (n+0) n` 类型的程序。**类型对了 = 命题成立 = 证明完成**。

加上**强正规化**（每个有类型的项都能算到正常形式）保证：类型检查必停，证明不会跑死。

## 实践案例

### 案例 1：Coq 里的恒等函数（多态）

```coq
Definition id : forall A : Type, A -> A :=
  fun A x => x.
```

**逐部分解释**：

- `forall A : Type, A -> A` 是 Pi 类型——"接收一个类型 A，返回 `A → A`"
- `fun A x => x` 是程序：先收类型，再收值，原样返回
- 这就是 [[system-f-reynolds-1974]] 的 `ΛA. λx:A. x`，但写在 CoC 同一种语法里

### 案例 2：依赖类型——长度安全的向量

```coq
Inductive Vec (A : Type) : nat -> Type :=
  | nil  : Vec A 0
  | cons : forall n, A -> Vec A n -> Vec A (S n).

Definition head {A n} (v : Vec A (S n)) : A := ...
```

**关键**：`head` 的类型签名要求输入向量长度至少是 1（`S n`）。**空向量根本通不过类型检查**——bug 在编译时就死。这是 CoC 让你"用类型表达运行时不变量"的标志能力。

### 案例 3：把命题写成程序——证明 0 + n = n

```coq
Theorem zero_plus : forall n : nat, 0 + n = n.
Proof.
  intros n. simpl. reflexivity.
Qed.
```

**逐部分解释**：

- `forall n : nat, 0 + n = n` 是 Pi 类型，也是逻辑全称命题
- `Proof. ... Qed.` 内部一步步构造一个该类型的项（程序）
- Coq 检查这个程序类型对——对就接受证明，错就报"证明无效"

## 踩过的坑

1. **没有内置归纳法**：原始 CoC（1988）只有 Pi、Prop、Type，**不能定义自然数 / 列表 / 树**。1989-1990 Coquand-Paulin 加了归纳类型变成 **CIC**（Calculus of Inductive Constructions），Coq 实际跑的是 CIC 不是裸 CoC。

2. **Type:Type 不一致**：早期想让 `Type` 自己也是 `Type`（Type-in-Type），但 Girard 1972 已证这会出 Burali-Forti 悖论。CoC 用 **可累加的宇宙层级**（`Type₀ : Type₁ : ...`）才一致。新人易踩。

3. **判定相等≠运行相等**：CoC 默认"按 β-归约"判等，导致 `1+1` 和 `2` 是同一个项。但加了归纳类型后规则更微妙——某些 propositional equality 必须显式 `rewrite`，typing 不会自动认。

4. **抽取程序丢证明**：从 CoC/CIC 提取可执行代码（Coq 的 `Extraction`）会**丢掉所有 Prop 类型的项**，因为它们只是证明、运行时无用。新人会震惊于"我写的核心引理消失了"——这是设计而非 bug。

## 适用 vs 不适用场景

**适用**：

- 形式化定理证明（Coq / Rocq / Lean / Matita / Agda 都在 CoC 家族）
- 编译器 / OS 内核 / 加密协议的端到端验证（CompCert、seL4、HACL\*）
- 数学库（Mathlib4 在 Lean 4，Mathematical Components 在 Coq）
- 教学：作为类型论 / Curry-Howard 课程的最强教具

**不适用**：

- 日常应用开发（语法门槛 + 类型检查重）→ 用 [[hindley-milner]] / TypeScript
- 性能敏感的生产代码（很多依赖类型抽取后表达不出）→ 用 Rust
- 需要副作用 / 异常的代码 → 纯 CoC 没有副作用，Coq 用 monad 包，麻烦
- 不可判定的类型（如 dependent contracts 中的 SMT 推理）→ 用 Liquid Haskell / F\*

## 历史小故事（可跳过）

- **1972 年**：Per Martin-Löf 提出直觉主义类型论（ITT），首次把"命题就是类型"工程化。
- **1985 年**：Thierry Coquand 在巴黎 INRIA 完成博士论文《Une théorie des constructions》，把 [[system-f-reynolds-1974]] + 依赖类型 + 类型算符**统一**进一个系统。
- **1988 年**：Coquand 与导师 Gérard Huet 把核心理论写成 *Information and Computation* 的 26 页论文——就是这一篇。
- **1989 年**：第一版 Coq 实现发布（最早叫 CoC，后改名致敬 Coquand）。Christine Paulin-Mohring 加入归纳类型形成 CIC。
- **2005 年起**：Georges Gonthier 用 Coq 形式化四色定理、Feit-Thompson 定理；CompCert 用 Coq 写出可证明正确的 C 编译器。CoC 从理论变成工程。

## 学到什么

1. **统一比正交更深**——把多态、依赖、高阶塞进同一棵语法树，比分层叠加更优雅，也更可证明
2. **类型是命题，程序是证明**：[[hindley-milner]] 是这条路的入门版，CoC 是终点版
3. **强正规化 + 一致性 = 数学基础**：CoC 给数学提供另一套基础（不靠 ZFC 集合论）
4. **理论 → 工具 → 工程**：1985 论文 → 1989 Coq → 2005 形式化数学 → 2025 Lean Mathlib，每一步隔 15 年
5. **形式化的代价是绝对的**：每条数学规则、每个边界条件都得显式写出来；但换来的是机器可检查的真——这是其它范式给不了的

## 延伸阅读

- 入门视频：[Software Foundations Lecture Series](https://softwarefoundations.cis.upenn.edu/)（Pierce 团队从零教 Coq + CoC，免费）
- 入门书籍：[Programming and Proving in Coq](https://github.com/coq/platform-docs)（Coq 平台官方文档，从语法到大型证明工程）
- 原文 PDF：[Coquand & Huet, "The Calculus of Constructions" (1988)](https://core.ac.uk/download/pdf/82038778.pdf)（26 页，密度极高）
- 现代教材：[Type Theory and Formal Proof](https://www.cambridge.org/core/books/type-theory-and-formal-proof/0472640AAD34E045C7F140B46A1B5066)（Nederpelt-Geuvers，把 λ-cube 讲透）
- Lean 入门：[Theorem Proving in Lean 4](https://leanprover.github.io/theorem_proving_in_lean4/)（CoC 的现代化身）
- [[system-f-reynolds-1974]] —— CoC 的"多态"维度直接来自 System F
- [[lambda-calculus]] —— CoC 的语法骨架仍是 λ-演算

## 关联

- [[lambda-calculus]] —— CoC 在 λ-演算上加了类型 + 依赖 + 多态三层
- [[system-f-reynolds-1974]] —— CoC 的二阶多态部分就是 System F
- [[hindley-milner]] —— HM 是"类型推导"路线，CoC 是"类型表达力"路线，两条路汇于现代证明助手
- [[theorems-for-free]] —— 多态类型→定理的思想，在 CoC 里被推到极致：每个证明都是个程序
- [[bidirectional-typing]] —— CoC 因为类型表达太强，全推不可行，工业实现都用双向算法
- [[godel-1931]] —— 不完备性定理对类型论一致性的限制，CoC 一致性证明须诉诸更强系统
- [[linear-types]] —— 线性逻辑与 CoC 同属"类型即逻辑"思路的另一分支
- [[effect-handlers]] —— 副作用如何融入纯类型系统的另一条工业方案，与 CoC 的"无副作用纯证明"形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agda-norell]] —— Agda — 让你写代码的同时把数学也证明了
- [[certikos-2016]] —— CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[cubical-type-theory-2018]] —— Cubical Type Theory — 让 Univalence 公理真的能算出结果
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hott-book-2013]] —— HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材
- [[idris-brady]] —— Idris — 让依赖类型从证明助理变成通用编程语言
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[lean-tactics]] —— Lean Tactics — 让证明助手把"写证明"当成写程序
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
- [[verdi-2015]] —— Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架
- [[vst-2014]] —— VST — 把 C 程序的数学证明一路带到机器码
