---
title: Lean Tactics — 让证明助手把"写证明"当成写程序
来源: de Moura et al., "The Lean Theorem Prover (System Description)", CADE-25 2015
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Lean 是一台**证明助手**——你给它一个数学命题，它检查你给的证明对不对。日常类比：像一个**极度较真的老师**，每一步推理都要你写出来，少一步它就打回。

但**手写每一步**太慢，所以 Lean 给你 **tactic（证明策略）**：你说"这一步随便消掉，里面无非是加加减减"，Lean 就替你展开成几百步显式推理。

```lean
theorem add_comm (a b : Nat) : a + b = b + a := by
  induction b with
  | zero => simp
  | succ n ih => simp [ih, Nat.succ_add]
```

`by` 之后的 `induction` / `simp` 不是数学，而是**给老师的指令**——告诉它"用归纳法、用化简器自动消"。这些指令叫 tactic。

## 为什么重要

不理解 Lean tactic，下面这些事都没法解释：

- 为什么 mathlib（Lean 数学库）能积累几十万定理而不被人海堆死——tactic 自动化吃掉了 90% 琐碎步
- 为什么形式化数学这十年突然能跑起来（Liquid Tensor Experiment；费马大定理等形式化也在推进）
- 为什么 Lean 4 能"自己写自己"（自举）——它把元编程做成一等公民
- 为什么有人说 "tactic 是给定理证明器写的 DSL"，又有人说 "tactic 不是 DSL 是普通函数"

## 核心要点

Lean 的 tactic 系统建立在 **三层** 上：

1. **内核**：一种叫 **CIC（归纳构造演算）** 的类型论，跟 Coq 同源。在这一层，"证明"就是一个**程序表达式（项）**，它的类型恰好是那个命题——像试卷答案的类型必须对上题目。所有最终被信任的东西都得能翻译成 CIC 项。

2. **Tactic monad**：tactic 是函数，签名近似 `Goal → List Goal × Term`——读当前**待证目标**（还没做完的题），写出**新目标列表**和**已构造的部分证明**。可以串联、分支、重复，像脚本编排。

3. **Elaborator**：把省略主语的口语补成完整句子。你写的是省略细节的 surface 语法（`x + y` 没标类型），elaborator 精化成完整 CIC 项；中间缺的洞就变成子目标丢给 tactic。

三层加起来叫 **tactic 框架**。Lean 1（2015 论文这版）就把它跑通了；Lean 4（2021）把第二、三层整个用 Lean 自己重写——**写 tactic 的语言 = 写定理的语言**。

## 实践案例

### 案例 1：tactic 替你做的事

不用 tactic（裸 CIC）证 `0 + n = n`，要写出归纳的 motive、succ 情况下的 cast、所有显式参数。用 tactic：

```lean
theorem zero_add (n : Nat) : 0 + n = n := by
  induction n with
  | zero => rfl
  | succ k ih => rw [Nat.add_succ, ih]
```

`induction` / `rfl`（reflexivity）/ `rw`（rewrite）每个都展开成几十行内核项，但你只看到 4 行。

### 案例 2：tactic 是普通函数（Lean 4 元编程）

```lean
elab "my_trivial" : tactic => do
  let goal ← getMainGoal
  goal.assumption  -- 在假设里找一个能直接用的
```

这是 Lean 4 在**编译期**用 Lean 自己定义了一个新 tactic `my_trivial`。它读当前 goal、扫假设、找匹配。**一切都在同一种语言里**——这就是"元编程一等公民"。

### 案例 3：自动化的 simp（化简器）

```lean
example (a b c : Nat) : (a + b) + c = c + (b + a) := by
  simp [Nat.add_comm, Nat.add_assoc]
```

`simp` 拿你给的等式当**重写规则**，反复套到目标上直到不动。一行替代几十行机械推导。mathlib 里大量琐碎引理常靠 simp 收尾。

### 案例 4：tactic 组合子（combinators）

```lean
theorem easy (n : Nat) : n + 0 = n := by
  first | rfl | (simp; ring) | omega
```

`first | A | B | C` 是 tactic 组合子：依次试 A、B、C，第一个成功就停。还有 `<;>`（前一步留下的所有 goal 都跑后一步）、`repeat`（一直跑到不动）、`try`（失败也不报）。这套组合子让你能像搭乐高一样拼自动化策略。

## 踩过的坑

1. **tactic 失败信息指向中间态**：`rw` 失败说"找不到模式"，但根因可能是上一步 `induction` 选错变量。要学会 `#check` 当前 goal 状态。

2. **慢**：tactic 每步都跑 elaborator + 类型检查。复杂证明编译几十秒甚至几分钟正常。mathlib 全量编译要小时级。

3. **可读 vs 自动**：`by simp; ring; omega` 三行能证一个引理，但人看不出为什么对。改库后这些行突然失败，调试很痛。社区规矩：复杂关键定理写**结构化证明**，琐碎引理才放手 tactic。

4. **Lean 4 不向后兼容**：语法、库、tactic API 全改了。老 mathlib（Lean 3）整个由社区花两年迁移到 mathlib4。学的时候**只看 Lean 4 资料**，混看会乱。

5. **可信内核 vs tactic 不可信**：tactic 写错也没事——它最后产出的项还是要过内核检查。这是设计哲学：**只有内核（几千行 C++）需要被信任**，外面所有 tactic / 库都可以是 Lean 写的、可以有 bug，因为 bug 顶多让证明失败而不是错证。

## 适用 vs 不适用场景

**适用**：

- 形式化数学（mathlib / Liquid Tensor；费马大定理等形式化进行中）
- 软件验证（编译器、密码协议、OS 内核正确性）
- 元编程实验（Lean 4 = 把"语言写自己"做到极致）
- 教学逻辑 / 类型论（"自然演绎写出来能跑"）

**不适用**：

- 替代日常工程语言（编译慢、生态小，不是 Rust / TS 的竞品）
- 需要决策过程的实数 / 概率（Lean 有但不如 Mathematica / SMT 顺手）
- 不接受"看不懂的自动化证明"的场合（金融审计宁愿要人读得懂）

## 历史小故事（可跳过）

- **1989 年**：Coq 在法国 INRIA 起步，CIC 类型论 + Ltac（外挂 tactic 语言）。Ltac 写起来像 shell 脚本，类型弱、调试难。
- **2013 年**：Leonardo de Moura 在微软研究院启动 Lean 项目，目标"让 tactic 是一等公民"。
- **2015 年**：CADE-25 这篇 6 页系统描述论文（本笔记来源）公布 Lean 1 设计：tactic monad、可编程 elaborator。
- **2021 年**：Lean 4 自举完成——编译器自己用 Lean 写。元编程从此和写定理用同一种语言。
- **2023 年**：mathlib4 迁移完成；2024 年陶哲轩等人公开用 Lean 形式化新数学。证明助手第一次进入"主流数学家也用"的阶段。

## 学到什么

1. **证明 = 程序**：Curry-Howard 同构在 Lean 里是工程现实，不是哲学口号
2. **tactic 是元程序**：它操作"待证目标"这个数据结构，最终产物是内核能验证的项
3. **Elaborator 是桥**：把人类的简略语法翻成机器的显式项，中间漏的洞当作 goal 传给 tactic
4. **元编程一等公民**：Lean 4 用同一种语言写定理 / 写 tactic / 写编译器，比 Coq Ltac / Isabelle ML 更彻底
5. **小可信核 + 大不可信外圈**：把"必须正确"的部分压到几千行内核，剩下几百万行库都可以由社区自由迭代而不动摇基础

## 延伸阅读

- 教程：[Theorem Proving in Lean 4](https://leanprover.github.io/theorem_proving_in_lean4/)（官方入门，含 tactic 大量例子）
- mathlib 在线：[leanprover-community.github.io/mathlib4_docs](https://leanprover-community.github.io/mathlib4_docs/)（看真实大型证明长什么样）
- 论文 6 页：[Lean System Description 2015](https://leanprover.github.io/papers/system.pdf)
- 视频：[Kevin Buzzard — Lean for the Curious Mathematician](https://www.youtube.com/results?search_query=kevin+buzzard+lean)
- [[calculus-of-constructions]] —— Lean 内核就是 CIC 的实现
- [[template-haskell]] —— 元编程一等公民的另一支血脉

## 关联

- [[calculus-of-constructions]] —— 提供"证明 = 项"的类型论基础，Lean 内核直接实现
- [[template-haskell]] —— 同样把"在编译期生成代码"做成一等公民，但目标语言不是定理而是 Haskell
- [[scala-macros]] —— 编译期改写表达式的另一思路；Lean 4 的 macro / elab 比它更深入
- [[hoare-logic]] —— 把"程序对不对"变成证明义务；Lean 是把这些义务真消掉的工具
- [[godel-1931]] —— Lean 检查的是相对一致性证明，绕不开的元数学边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agda-norell]] —— Agda — 让你写代码的同时把数学也证明了
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩

