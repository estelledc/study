---
title: Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
来源: 'de Moura & Ullrich, "The Lean 4 Theorem Prover and Programming Language", CADE 2021'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

**Lean 4** 是一个**既能证明数学定理、又能像 OCaml 一样跑得飞快的编程语言**。日常类比：以前你写文章用 Word，写代码用 IDE，写数学证明用 LaTeX——三套工具不互通。Lean 4 像一个全能编辑器，写定理、写程序、写宏扩展、改语法解析器，**全用同一种语言**。

它的特别之处在于"自举"：**Lean 4 的编译器、elaborator、parser 全用 Lean 4 自己写**。Lean 3 时代内核是 C++ 写的，想加新功能就得改 C++ 重新编译；Lean 4 把所有这些都搬到 Lean 里，用户随时能改。

```lean
def or : Bool → Bool → Bool
  | true,  _ => true
  | false, b => b

theorem or_true (b : Bool) : or true b = true := rfl
```

上面四行：**前两行是程序**（or 函数），**后一行是数学证明**（or true b 恒等于 true）。同一个文件，同一个语言。

## 为什么重要

不理解 Lean 4 的设计，下面这些事都没法解释：

- 为什么数学家 **Peter Scholze 把 Liquid Tensor Conjecture** 拿到 Lean 上让计算机验证
- 为什么 **mathlib4** 这种上百万行量级的形式数学库越长越快，没在性能上垮掉
- 为什么 Lean 4 比 Coq / Agda 更受新一代形式数学社区欢迎——核心是性能 + 元编程开放
- 为什么"用证明助手当通用编程语言"这个想法 30 年来第一次像真的（FBIP + 编 C）

## 核心要点

Lean 4 的革命性在 **四件事**：

1. **自举**：Lean 4 的**可信内核仍是 C++**；内核之外——parser、elaborator、tactic、code generator——都用 Lean 写。类比：发动机还是原厂件，仪表盘和菜单全改成用户可改的宏。

2. **卫生宏（hygienic macros）**：宏展开时自动给临时变量换"不会撞名的身份证号"。借鉴 Scheme，用 `` `(...)`` 包语法树模板、`$x` 往洞里填——语法可扩展，又不会把用户变量悄悄改名。

3. **Tabled typeclass resolution**：typeclass 像"按接口自动找实现"。Lean 4 用 discrimination tree（按形状快速查表）+ 记忆化，把 Lean 3 在 mathlib 里指数爆炸的查找压回可接受时间。

4. **Functional but in-place（FBIP）**：纯函数式写法 + 引用计数，**没人共享时就地改**——树更新、列表 map 都能 0 分配，性能跟 ocamlopt / GHC 比肩。

## 实践案例

### 案例 1：写一个 Boolean 表达式简化器（论文范例）

```lean
inductive BoolExpr where
  | var (name : String)
  | val (b : Bool)
  | or  (p q : BoolExpr)
  | not (p : BoolExpr)

def simplify : BoolExpr → BoolExpr
  | .or p q => mkOr (simplify p) (simplify q)
  | .not p  => mkNot (simplify p)
  | e       => e
```

**逐部分**：`inductive` 定义递归数据类型；`def` 定义函数；`mkOr` / `mkNot` 是论文里的辅助构造（此处省略）。模式匹配跟 OCaml 一样。这段**既是程序又能被证明正确**——再写 `theorem denote_simplify ...` 即可证"简化后语义不变"。

### 案例 2：用宏定义嵌入式 DSL

```lean
syntax "`[BExpr|" term "]" : term
macro_rules
  | `(`[BExpr| $x:ident]) => `(BoolExpr.var $(quote x.getId.toString))
  | `(`[BExpr| $p ∨ $q])  => `(BoolExpr.or `[BExpr| $p] `[BExpr| $q])
```

反引号 `` `(...)`` 包的是语法树模板，`$` 是往洞里填。这几行让你写 `` `[BExpr| p ∨ q] `` 而不是手拼 `BoolExpr.or ...`。**关键是 hygienic**：宏里临时名不会和用户变量打架。

### 案例 3：FBIP 让 map 0 分配

```lean
def map : (α → β) → List α → List β
  | _, []      => []
  | f, a :: as => f a :: map f as
```

写法跟教科书一样纯函数式。但 Lean 4 编译时如果 `as` 引用计数为 1（没人共享），生成的 C 代码**直接就地改 cons cell**，不分配新 cell。性能跟手写 C 接近——这是 Perceus（Reinking 等 2020）reference counting 的成果。

## 踩过的坑

1. **Lean 3 → Lean 4 不是小升级**：语法改了、元编程接口大改、tactic 写法不同。老 mathlib 整体迁移到 mathlib4 花了好几年，期间生态分裂。

2. **FBIP 性能依赖『不被共享』**：写 `let xs := big_list in (xs, xs)` 就让 xs 引用计数 = 2，下一步任何更新都退化成分配新对象。读源码看不到这一层，只能跑 profile。

3. **卫生宏的 quasiquotation 学习曲线陡**：`` `(foo $bar) `` 里 `$bar` 是反引用，但要懂 Syntax / TSyntax / `MacroM` 才能写复杂宏。新人会被语法绊住。

4. **typeclass timeout 难 debug**：tabled resolution 比 Lean 3 快但不是万能，复杂 diamond instance 仍可能慢。报错只说"deterministic timeout"，根因藏在实例链里要靠 `set_option trace.Meta.synthInstance true` 翻日志。

## 适用 vs 不适用场景

**适用**：

- 形式化数学（mathlib4、Liquid Tensor、Perfectoid Spaces）
- 写需要数学证明保证的程序（编译器、加密协议、智能合约）
- 想把"程序 + 证明 + DSL + 元编程"写在同一份代码里

**不适用**：

- 只想快速 prototype 一个脚本——Lean 学习曲线比 Python 陡两个数量级
- 团队不熟依赖类型——elaborator 的报错会让人绝望
- 需要成熟商用库（Web 框架、机器学习库）——Lean 4 生态还在早期
- 经典 LCF 风格的工业证明（Isabelle/HOL）——那边自动化更成熟

## 历史小故事（可跳过）

- **2013 年**：Leonardo de Moura 在 Microsoft Research 启动 Lean 项目，目标是给 SMT 求解器（他做过 Z3）找一个更好的搭档——基于 Calculus of Inductive Constructions。
- **2017 年**：Lean 3 + mathlib 启动。**Kevin Buzzard 的 Xena 项目**把本科生数学搬上 Lean，社区开始扩张。
- **2020 年**：Peter Scholze 抛出 **Liquid Tensor Experiment** 挑战——把他自己都不完全相信的定理放上 Lean 让计算机验证。一年内完成。
- **2021 年**：de Moura + Sebastian Ullrich 发布 Lean 4（本笔记 CADE 论文）。**内核仍为 C++**；parser / elaborator / tactic 等外圈用 Lean 自举重写。
- **2023-2025 年**：mathlib4 迁移完成，Lean 4 成为形式数学社区的事实标准。

## 学到什么

1. **自举是终极开放**：把编译器自己用目标语言写一遍，用户改语言等于写普通代码——这是 Smalltalk / Lisp 的老智慧，Lean 把它带到依赖类型世界
2. **性能是采用率的关键**：FBIP + 编 C 让"用证明助手做日常编程"第一次实用，决定了 Lean 4 vs Coq/Agda 的胜负手
3. **卫生宏不只是技巧**：它是把"语法扩展"从字符串黑魔法升级到类型化变换，让 DSL 嵌入变得安全可组合
4. **理论 + 工程合体**：CIC（数学）+ tabled resolution（PL 算法）+ Perceus（系统）三栈合一才长出 Lean 4
5. **可扩展 vs 复杂度**：把 parser / elaborator 都开放给用户的代价是认知负担——能改一切意味着学的时候要懂一切，这是 Lean 4 入门陡的根因

## 延伸阅读

- 论文 PDF：[Lean 4 System Description (CADE 2021)](https://lean-lang.org/papers/lean4.pdf)
- 教程书：[Theorem Proving in Lean 4](https://lean-lang.org/theorem_proving_in_lean4/)（官方零基础入门）
- 教程书：[Functional Programming in Lean](https://lean-lang.org/functional_programming_in_lean/)（David Thrane Christiansen 写）
- mathlib4 源码：[github.com/leanprover-community/mathlib4](https://github.com/leanprover-community/mathlib4)
- [[lean-tactics]] —— Lean 的 tactic 框架
- [[calculus-of-constructions]] —— Lean 的逻辑基础

## 关联

- [[calculus-of-constructions]] —— Lean 类型理论的祖先，Lean 4 在 CIC 上扩展归纳类型
- [[martin-lof-itt]] —— 直觉主义类型论，CIC 的上游思想源
- [[agda-norell]] —— 同源依赖类型语言，Lean 4 在元编程开放性上做得更激进
- [[idris-brady]] —— 把依赖类型当通用语言的另一条路，Lean 4 走得更远
- [[lean-tactics]] —— Lean 的 tactic 系统在 Lean 4 用 Lean 自己写
- [[scala-macros]] —— 语法宏的另一种实现路线，Scala 选了字符串/AST 混合
- [[peyton-jones-stg]] —— Lean 4 code generator 借鉴 GHC 的程序变换技术
- [[hindley-milner]] —— HM 是简单类型推导的起点，Lean 4 在依赖类型层做更复杂的 elaboration

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[acl2-2000]] —— ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[cubical-type-theory-2018]] —— Cubical Type Theory — 让 Univalence 公理真的能算出结果
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hacl-star-2017]] —— HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hol-light-2009]] —— HOL Light — 不到 500 行 OCaml 写出能证开普勒猜想的证明助手
- [[hott-book-2013]] —— HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材
- [[idris-brady]] —— Idris — 让依赖类型从证明助理变成通用编程语言
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[lean-tactics]] —— Lean Tactics — 让证明助手把"写证明"当成写程序
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[sel4-2009]] —— seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认

