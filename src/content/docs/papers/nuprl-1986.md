---
title: Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
来源: 'Constable et al., "Implementing Mathematics with the Nuprl Proof Development System", Prentice-Hall 1986'
日期: 2026-05-30
子分类: 形式化验证
分类: 形式化方法
难度: 高级
provenance: pipeline-v3
---

## 是什么

Nuprl（"new pearl" 的谐音）是 1986 年 Cornell 团队（Constable 主持，18 位作者合著）做出的**交互式证明开发系统**。它把 Martin-Löf 直觉主义类型论从哲学家的笔记搬上计算机屏幕，让数学家可以**坐在屏幕前一步步构造证明**，再让机器从证明里**自动抽出能跑的 ML 程序**。

日常类比：以前数学家写证明像作家写小说（一沓纸交给读者），程序员写程序像工匠造工具（一段代码给机器跑）；Nuprl 像是把这两个作坊合并到同一台 IDE 里——你写的每一行既是证明也是程序，机器同时检查"逻辑对不对"和"程序能不能跑"。

打开屏幕，你看到的是一棵**目标树**：

```
⊢ ∀ n:ℕ. n + 0 = n           ← 当前 goal
   by induction on n
   ├─ ⊢ 0 + 0 = 0              ← 子 goal 1（解决：refl）
   └─ ⊢ ∀ k. (k+0=k) → (k+1)+0 = k+1   ← 子 goal 2
```

你输入战术（tactic）："**induction on n**"——机器把一个 goal 拆成两个子 goal。继续拆，直到每个叶子都被基本规则关掉。证明完成 = 整棵树被关闭。

## 为什么重要

不理解 Nuprl 在 1986 年做了什么，下面这些事都没法解释：

- 为什么 Coq / Agda / Lean / Idris 的界面都长得像"目标 + 战术 + 子目标"——这套范式是 Nuprl 定型的
- 为什么"**从证明抽出程序**"（program extraction）会成为后世所有依赖类型助手的标配——Nuprl 是第一个把它跑通的工业实现
- 为什么 Coq 与 Nuprl 二十多年来在"内涵 vs 外延"问题上各走一条路——分歧的起点就在这本 1986 年的书
- 为什么 1972 年瑞典哲学家的笔记，能在十几年内变成"机器辅助数学"的真实工具——Nuprl 是中间最关键的那座桥

## 核心要点

Nuprl 在 [[martin-lof-itt]] 的地基上加了三件事，让"理论上可行"变成"屏幕上可用"：

1. **外延式类型论（Extensional Type Theory，ETT）**：允许"命题等同"被当成"判断等同"使用——意思是只要能证明 `a = b`，类型检查器就当它们一样。代价是**类型检查不可判定**（机器不能保证停机），但写起来更贴近数学家平时的"两边相等就互换"的习惯。Coq 走了相反的路（[[calculus-of-constructions]]，内涵式，可判定但僵硬）。

2. **战术 + LCF 风格**：从 [[hol-light-2009]] 同源的 LCF 传统继承——用 ML（[[hindley-milner]] 推类型的那门语言）当 metalanguage，每条战术是一段 ML 程序，把"大 goal"拆成"小 goals"。这套机制让"自动化"和"严谨"分家：战术可以写错（不影响正确性），但底层证明项必须过 kernel 检查。

3. **程序提取（extraction）**：构造性证明本身就含有"如何造出来"的算法。Nuprl 自动把这部分抽出来变成可运行的 ML 代码——"**证明就是程序**"第一次有了工业可用的实现。后来 Coq 的 `Extraction` 命令、Lean 的 `compile` 都是同一思想的延续。

附加：**子集类型** `{x : A | P(x)}`（一个值属于 A 且满足 P）是 [[martin-lof-itt]] 没有的扩展，是后来 refinement types / liquid types 思想的祖先。**商类型** `A // R`（把等价关系 R 内化到类型）让"模 N 同余的整数"这种数学常用对象第一次有了直接的类型表达。

最后一件常被忽略但很重要的事：Nuprl 的 **library 机制**——证完一条定理就进库，后续证明可以引用。这看起来不起眼，但它把"证明助手"从"一次性玩具"变成了"可复用的数学基础设施"。今天 Lean 的 mathlib（数十万定理）、Coq 的 stdpp，源头都能追到 Nuprl 这套 library 设计。

## 实践案例

### 案例 1：在 Nuprl 里证明"加法交换律"

```nuprl
⊢ ∀ a, b : ℕ. a + b = b + a
  by NatInd a
  | ⊢ ∀ b : ℕ. 0 + b = b + 0
      by NatInd b ...
  | ⊢ ∀ a, b. (∀b. a+b = b+a) ⇒ (a+1)+b = b+(a+1)
      by Lemma `add-succ` ...
```

每个 `by` 是一条战术。证明完成后，Nuprl 同时给你两件东西：（1）一份机器可检的证明项；（2）从证明里抽出来的、可在 ML 里 `import` 的函数（虽然这个例子里没什么计算内容，但只要证明里有"造出来"的步骤，就有相应的可运行代码）。

### 案例 2：用子集类型表达"非空列表"

```nuprl
NonEmptyList(A) ≜ {l : List(A) | l ≠ nil}

head : NonEmptyList(A) → A
```

类型 `NonEmptyList(A)` 是"满足 `l ≠ nil` 这个谓词的 `List(A)`"。`head` 函数因此**编译期就拒绝接收空列表**——和 Idris 用 `Vec (S n)` 表达同一件事，思路在 1986 年就齐了，比 Idris 早 25 年。

### 案例 3：从证明里抽出排序算法

构造性地证明"对任意列表 `l`，存在一个排好序的列表 `l'`，且 `l'` 是 `l` 的置换"——证明里必然包含"如何从 `l` 一步步造出 `l'`"。Nuprl 把这部分抽出来，得到一个排序函数。**程序的正确性不是测出来的，是从证明里继承的**。

```nuprl
sort_thm : ∀ l : List(ℕ). ∃ l' : List(ℕ). Sorted(l') ∧ Permutation(l, l')
```

证明这条命题 → 抽出来 → 得到 `sort : List(ℕ) → List(ℕ)`，并附带"它输出有序且是置换"的机器证明。这种"先证后抽"的做法，比"先写后测"在关键算法上多一层底气。

### 案例 4：和 Coq 的分歧体现在哪一行

外延 vs 内涵的差别在小例子上看不出来，但写到这种地方就分家：

```
（Nuprl）已知 f = g 的证明 H : f = g
        要证 P(f) ⇒ P(g)
        → 直接用 H rewrite，过

（Coq）已知 f = g 的证明 H : f = g
       要证 P(f) ⇒ P(g)
       → 大多数时候要 rewrite，但函数外延性需额外公理
```

Nuprl 让"两个证明出相等的东西"和"判断上相等"几乎无缝；Coq 把它们隔开。前者写起来像数学，后者写起来像编程。

## 踩过的坑

1. **类型检查不可判定**：外延 ETT 的代价。机器不能"自动检查所有事情"，需要人类提示哪些等同性该展开。新人写出"语法上看起来对、但 kernel 走不通"的证明很常见。

2. **学术分裂的代价**：Nuprl（外延）和 Coq（内涵）二十多年互不兼容，证明库不能共享。直到 2010s Homotopy Type Theory 才把这件事重新拉到统一视角讨论——但生态早已分家。

3. **GUI 老化**：1986 年的 emacs 风格界面在今天已经显得陌生；Nuprl 5（2000s）才把界面更新到 Web。Coq 和 Lean 的崛起部分得益于"界面更年轻"。

4. **战术调试难**：写错的战术可能让 subgoal 数量指数爆炸，或者陷入"明明应该能证完却卡住"的状态。后来的助手（Lean 的 `simp` / Coq 的 `auto`）花了几十年改善这件事。

5. **构造性的限制依然在**：和 [[martin-lof-itt]] 一样，排中律不是公理；很多经典数学定理需要重写或额外引入。

## 适用 vs 不适用场景

**适用**：

- 形式化构造性数学（Bishop 风格的实数分析、可计算分析）
- 需要"证明 + 抽程序"一体化的场景（认证密码协议、关键算法）
- 教学：把数学习惯（外延等同）和机器证明拉到一起

**不适用**：

- 需要可判定类型检查 → 用 Coq / Agda / Lean（[[calculus-of-constructions]] 路线）
- 需要排中律和经典数学 → 用 [[isabelle-hol-2002]] / [[hol-light-2009]]
- 工业级硬件 / 系统验证 → 用 [[acl2-2000]]（一阶 + 全自动）
- 大型现代证明库生态 → Lean 的 mathlib / Coq 的 Mathematical Components 已远超 Nuprl

## 历史小故事（可跳过）

- **1979 年**：Cornell 启动 PRL（Proof Refinement Logic）项目，Constable 主持
- **1984 年**：第一版 Nuprl 在 Symbolics Lisp Machine 上跑起来
- **1986 年**：《Implementing Mathematics with Nuprl》出版，18 位作者，确立"MLTT + tactics + extraction"三件套
- **1989 年**：Coq 1.0 发布，走 Calculus of Constructions（内涵）路线，与 Nuprl 分家
- **1990s**：Nuprl 4 / 5 重写为 OCaml，引入分布式证明
- **2007 年**：Agda（Norell 重写版）问世，回到内涵但更接近 MLTT
- **2013 年起**：Univalent Foundations / HoTT 把"等同性该如何处理"这个 Nuprl vs Coq 二十年的旧账重新摆到台面上
- **2020s**：Lean 4 + mathlib 成为新主流，但其设计哲学里仍能看到 Nuprl 的影子（tactic 风格、extraction 思想）

## 学到什么

1. **理论的工程化跨度**：1972（[[martin-lof-itt]] 提出）→ 1986（Nuprl 落地）→ 2010s（数学家日常使用），每一步隔 15+ 年
2. **设计选择决定生态**：Nuprl 选外延（贴近数学家），Coq 选内涵（机器友好），二十多年没和解——**做工具时早期的取舍会决定下一代用户是谁**
3. **战术 + kernel 分层**是证明助手的关键创新：自动化可以激进（写错没事），但 kernel 必须保守（写错就毁信任）
4. **"证明就是程序"在 1986 年第一次工业可用**：从此后世所有依赖类型助手都把 extraction 当默认能力
5. **子集类型 / 商类型在 Nuprl 已经有了**——后来 refinement types、quotient inductive types 都是这棵树上的果子

## 延伸阅读

- 原书全文：[Implementing Mathematics with Nuprl](https://www.nuprl.org/book/)（免费 PDF，1986 年原版扫描）
- Nuprl 项目主页：[nuprl.org](https://www.nuprl.org/)（仍在维护，可下载现代版）
- 综述论文：[Allen, Constable et al., "Innovations in computational type theory using Nuprl", JAL 2006](https://www.nuprl.org/documents/Allen/InnovationsInComputational.html)
- [[martin-lof-itt]] —— Nuprl 的理论地基
- [[calculus-of-constructions]] —— Coq 走的另一条路，对照看分歧

## 关联

- [[martin-lof-itt]] —— Nuprl 实现并扩展的核心理论（外延化）
- [[calculus-of-constructions]] —— 同时代的另一选择，内涵路线，成就 Coq
- [[hol-light-2009]] —— 同样 LCF 风格，但走经典 HOL 而非类型论
- [[isabelle-hol-2002]] —— 同期高阶逻辑助手，证明文档化路线
- [[acl2-2000]] —— 工业向一阶逻辑助手，与 Nuprl 走完全不同的取舍
- [[hindley-milner]] —— Nuprl 的 metalanguage ML 用 HM 推类型，是 Nuprl 的工具基础
- [[agda-norell]] —— 后辈的 MLTT 实现，回到内涵路线
- [[lean-prover]] —— 现代主流，设计哲学里仍能看到 Nuprl 影子
- [[lambda-calculus]] —— 项语言基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[acl2-2000]] —— ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确
- [[awodey-warren-2009]] —— Awodey-Warren — 把『相等的证明』看成两点之间的路径
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hol-light-2009]] —— HOL Light — 不到 500 行 OCaml 写出能证开普勒猜想的证明助手
- [[hott-book-2013]] —— HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事

