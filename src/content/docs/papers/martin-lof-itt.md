---
title: Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
来源: Per Martin-Löf, "Intuitionistic Type Theory", Bibliopolis 1984（1972 初稿）
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Martin-Löf **直觉主义类型论**（Intuitionistic Type Theory，简称 **ITT** 或 **MLTT**）是一套**让"数学证明"和"计算机程序"用同一种东西表达**的系统。

日常类比：以前数学家写证明（一沓纸）和程序员写程序（一段代码）是两件事。Martin-Löf 说："如果命题就是类型，证明就是属于这个类型的程序，那一段代码同时就是一份机器可检的证明。"

你写：

```agda
plus_zero : (n : Nat) → plus n zero ≡ n
plus_zero zero = refl
plus_zero (suc n) = cong suc (plus_zero n)
```

这既是一个**程序**（按 n 递归），也是一个**证明**（"对任意 n，n+0=n"）。Agda 编译通过 = 证明被机器检过。

## 为什么重要

不理解 ITT，下面这些事都没法解释：

- 为什么 Coq 能"证明"操作系统 seL4 没有 bug —— 它的核心（CoC/CIC）同属依赖类型、构造性传统，是 ITT 路线的近亲扩展
- 为什么数学家陶哲轩 2024 年在 Lean 里"形式化"自己的论文 —— Lean 基于 ITT
- 为什么 Idris 能让 `Vec 3 Int`（长度精确为 3 的向量）在编译期防越界 —— **依赖类型**这个能力来自 ITT
- 为什么 1972 年一篇瑞典哲学家的笔记，50 年后变成了"机器辅助数学"的地基

## 核心要点

ITT 加了三件 Hindley-Milner 不敢加的东西：

1. **依赖类型**（Dependent Types）：类型可以依赖于值。`Vec n A` 是"长度为 n 的、元素类型 A 的向量"，n 是一个**值**，但出现在**类型**位置。这让类型表达"长度精确为 3"这种事成为可能。

2. **Π 类型 / Σ 类型**：升级版的函数类型和元组类型。
   - `Π (x : A). B(x)` —— 接收 x 后返回的类型可以**依赖** x；普通函数类型 `A → B` 是它的退化情况
   - `Σ (x : A). B(x)` —— 一对 (x, y)，y 的类型可以**依赖** x；普通对 `A × B` 是它的退化情况

3. **Curry-Howard 同构**：命题 = 类型，证明 = 程序，蕴含 = 函数类型，"对任意 x" = Π，"存在 x" = Σ。1969 年 Howard 提出，Martin-Löf 把它做成完整的系统。

加起来的结果：**写程序就是写证明**。

## 实践案例

### 案例 1：依赖类型替编译器查越界

Idris：

```idris
head : Vec (S n) a -> a
head (x :: _) = x
```

`Vec (S n) a` 表示"长度至少为 1 的向量"（S n 意为"n 的后继，至少是 1"）。**空向量调用 head 编译期就报错**——不需要运行时抛异常，类型系统替你拦截。

### 案例 2：在 Lean 里证明加法交换律

```lean
theorem add_comm : ∀ (a b : Nat), a + b = b + a := by
  intro a b
  induction b with
  | zero => simp
  | succ n ih => rw [Nat.add_succ, ih, ← Nat.succ_add]
```

每行 `rw` / `simp` 都是一次"用某条已知规则改写"。整段代码 = 一份完整证明。Lean 编译过 = 数学定理被机器证过。

### 案例 3：宇宙层级避免悖论

第一版 ITT（1972）有 `U : U`（"宇宙是它自己的成员"）。Girard 立刻证出**悖论**——类似罗素悖论"包含所有不包含自己的集合"。

修复：分层 `U_0 : U_1 : U_2 : ...`。`U_0` 装普通类型，`U_1` 装 `U_0`，依此类推。任何宇宙不能装自己。这件事教训：**朴素的"无限自指"在数学里很危险**。

### 案例 4：用 Π 类型表达"对任意 n 都成立"

```agda
double : (n : Nat) → Σ Nat (λ m → m ≡ 2 * n)
double n = (2 * n , refl)
```

这个签名读作："对任意自然数 n，存在一个 m 满足 m = 2 * n"。返回值是一对 (m, 等同性证明)。**类型签名本身就是定理陈述**，函数体就是证明。再也不需要"先写代码、再单独写测试和证明"——它们是同一段。

## 踩过的坑

1. **类型检查需要计算**：检查 `Vec 3 Int = Vec (1+2) Int` 时编译器要算 `1+2=3`。如果类型里塞了不停机的程序，类型检查也不停机——所以 ITT 要求所有函数**必须停机**（这又损失了图灵完备）。

2. **判断等同 vs 命题等同**：`2 = 1+1` 在 ITT 里有两层。"按计算规则可化简为同一形" 叫**判断等同**（自动）；需要写证明的"等同性命题"叫**命题等同**（要构造 `refl` 项）。新人常混淆——同一个 `=` 符号在不同上下文里规则不同。Homotopy Type Theory（HoTT）就是为了把这件事讲清楚。

3. **证明长度爆炸**：手写证明可以靠"显然""易证"省略。ITT 必须把每一步落到规则上——一个看起来"显然"的引理可能要 100 行。`tactic` 系统（Coq/Lean 的核心创新）就是来对抗这件事的：写一段"策略脚本"自动生成底层证明项。

4. **构造性的代价**：ITT 不接受**排中律**（`P ∨ ¬P` 总成立）。"反证法"在这里不通用——你必须**构造**出证据。很多经典数学定理需要重写，部分定理（如选择公理的某些等价形式）干脆失效。

5. **Universe polymorphism 复杂**：宇宙分层 `U_0 : U_1 : U_2 ...` 解决了悖论，但写"一个对所有宇宙都成立的定理"时要手动管理层级。Lean 4 / Coq 8.x 才把这件事自动化得勉强好用。

## 适用 vs 不适用场景

**适用**：

- 形式化验证：操作系统内核（seL4 / Coq）、密码协议、编译器（CompCert）
- 形式化数学：Mathlib（Lean，已有数十万定理）、Univalent Foundations
- 高保证编程：Idris / F* 让类型替业务规则把关
- 教学：把"逻辑"和"编程"统一讲

**不适用**：

- 日常 web / 业务开发：证明开销远大于收益
- 需要副作用 / IO 的部分：要单独建模（Idris 用 Effect、Coq 用 Monad）
- 需要图灵完备 / 任意循环：ITT 要求停机
- 团队没有类型论训练：学习曲线陡

## 历史小故事（可跳过）

- **1969 年**：William Howard 写了一份未发表的笔记，发现"自然演绎"和"类型化 λ-演算"长得几乎一样——后来叫 Curry-Howard 同构。
- **1972 年**：瑞典哲学家 Per Martin-Löf 把这个观察做成完整系统。第一版有 `U : U` 漏洞。
- **1972 年（晚些）**：Jean-Yves Girard 在博士论文里造出悖论。Martin-Löf 撤回这一版。
- **1970 年代中期**：引入宇宙层级 `U_0 : U_1 : …`，堵住 `U : U`。
- **1980 年前后**：Padua 讲义整理修正版；**1984 年** Bibliopolis 正式出版《Intuitionistic Type Theory》——本词条的源头。
- **1989 年**：Coq 1.0 发布（Coquand & Huet 的 Calculus of Constructions，同属依赖类型传统的近亲扩展）。
- **2005 年起**：Agda（Norell）、Idris（Brady）、Lean（de Moura）相继落地，把 ITT 从"哲学家的玩具"推到"数学家和工程师的工具"。

## 学到什么

1. **命题就是类型，证明就是程序**——这是 20 世纪逻辑学最优美的洞见之一
2. **依赖类型让类型表达任意逻辑**：长度、有序、互不相同……都能进类型
3. **强表达 ↔ 难推导**：HM 自动推一切但表达受限；ITT 表达极广但要手写大量类型
4. **U:U 教训**：自指在数学里要分层处理，朴素无限自指 = 罗素悖论
5. **理论 → 工具 → 落地**：1972 → 1989 → 2020s 数学家用 Lean，每一步隔 15+ 年
6. **构造性 ≠ 弱**：放弃排中律换来"每个证明都自动是程序"，这个 trade-off 让 ITT 成为机器辅助证明的首选

## 延伸阅读

- 入门书：[Programming in Martin-Löf's Type Theory](https://www.cse.chalmers.se/research/group/logic/book/)（Nordström 等，免费 PDF，相对易懂）
- 视频：[Robert Harper — Type Theory Foundations](https://www.cs.uoregon.edu/research/summerschool/summer13/curriculum.html)（OPLSS 暑校讲座）
- 互动学习：[Software Foundations](https://softwarefoundations.cis.upenn.edu/)（Coq 写的教材，可在浏览器里跑）
- 现代发展：[HoTT Book](https://homotopytypetheory.org/book/)（同伦类型论，免费下载）
- [[calculus-of-constructions]] —— Coq 的核心理论，ITT 的扩展
- [[system-f-reynolds-1974]] —— ITT 之前最强的多态系统，没依赖类型

## 关联

- [[system-f-reynolds-1974]] —— System F 加多态但不依赖值；ITT 让类型也能依赖值
- [[calculus-of-constructions]] —— Coquand-Huet 把 ITT + System F 合并，Coq 的地基
- [[hindley-milner]] —— 自动推所有类型但表达力远弱于 ITT
- [[lambda-calculus]] —— ITT 的项语言基础
- [[godel-1931]] —— 不完备性定理；ITT 的"必须停机"绕过了 Gödel 编码自指
- [[linear-types]] —— 同样源自构造性逻辑（线性逻辑），与 ITT 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agda-norell]] —— Agda — 让你写代码的同时把数学也证明了
- [[awodey-warren-2009]] —— Awodey-Warren — 把『相等的证明』看成两点之间的路径
- [[cubical-type-theory-2018]] —— Cubical Type Theory — 让 Univalence 公理真的能算出结果
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hott-book-2013]] —— HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材
- [[idris-brady]] —— Idris — 让依赖类型从证明助理变成通用编程语言
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
