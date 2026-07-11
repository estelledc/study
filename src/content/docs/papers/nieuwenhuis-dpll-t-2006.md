---
title: Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书
来源: 'Nieuwenhuis, Oliveras & Tinelli, "Solving SAT and SAT Modulo Theories: From an Abstract Davis-Putnam-Logemann-Loveland Procedure to DPLL(T)", JACM 2006'
日期: 2026-05-30
分类: 编译器 / 形式方法
难度: 中级
---

## 是什么

Nieuwenhuis、Oliveras 和 Tinelli 三人 2006 年在 JACM 发的这篇 53 页长文，给 SAT 和 SMT 求解器写了一套**数学意义上的规则书**。

日常类比：象棋有"规则书"——王车易位怎么走、马走日、车走直。1962 年的 DPLL、1996 年的 GRASP、2001 年的 Chaff，每个 SAT 求解器都像一种"风格"，但**没有一份共同的规则书**说"它们到底在做什么"。

这篇论文就是那份规则书。它定义了：

> **状态** = ⟨M ∥ F⟩（M 是当前赋值轨迹，F 是子句集）
>
> **转移规则** = 一组形如 "从这种状态可以走到那种状态" 的箭头

跑求解器 = 反复套规则直到走到"终止状态"。每一种实际的求解器（Chaff / MiniSat / Z3）都是这套抽象规则的一个**实现**。

更关键的是：这篇把 SAT 推广到 **SMT**（SAT Modulo Theories），并提出 **DPLL(T)** 架构——今天 Z3 / CVC5 / Yices / Bitwuzla 内核的统一描述方式都来自这篇。

## 为什么重要

不理解 DPLL(T)，下面这些事都说不清：

- 为什么 **Z3 / CVC5 论文都先画一个 ⟨M ∥ F⟩ 状态再讲算法**——这个表示法就是这篇定义的
- 为什么 **SMT 内核可以同时验线性算术 + 数组 + 位向量 + 未解释函数**——DPLL(T) 给"SAT 引擎主导，theory solver 在线插话"建模
- 为什么 **早期 SMT（1990s）跑得慢、现代 SMT 飞快**——区别就是从 *lazy*（SAT 给完整模型才让 theory 检查）转到 *online*（边走边让 theory 修剪）
- 为什么 **教科书讲 SMT 都是规则推导**——这篇把"实现细节"和"算法本质"剥离，让你能不读 Z3 源码就讨论它做对了什么

## 核心要点

整篇论文可以拆成 **3 层抽象**：

### 1. Abstract DPLL —— 把 SAT 写成转移系统

状态：⟨M ∥ F⟩。M 是文字序列（带决策标记 `dᵢ`），F 是 CNF 子句集。

5 条规则覆盖 1962 DPLL 的所有动作：

- **UnitPropagate**（只剩一种合法赋值就强制写下）：F 中存在子句 `C ∨ l`，C 全在 M 里被假，则把 l 加进 M
- **Decide**：选一个未赋值变量 v，把 `v` 或 `¬v` 加进 M（带决策标记）
- **Backtrack**：M 与某子句矛盾，回退到最近一个决策点
- **Fail**：M 与某子句矛盾、且 M 里没决策点 → UNSAT
- **PureLiteral**（可选）：只以一种极性出现的变量直接赋值

Chaff 的 CDCL 用一组**扩展规则**替换 Backtrack：

- **Conflict / Explain / Learn / Backjump**（学到冲突原因后，一次跳过多个错误决策）

这一节最大的洞见：**所有 SAT 求解器的差别都是规则触发顺序和启发式**，规则本身固定。

### 2. Abstract DPLL Modulo Theories —— 给规则加 theory

把"M 与子句 C 矛盾"扩展成"M 在 theory T 下与 C 矛盾"。新增 4 条规则：

- **T-Propagate**：theory T 蕴含某文字 l 必须为真（即使没单元子句强制），加进 M
- **T-Conflict**：theory T 在 M 上发现矛盾，进入冲突状态
- **T-Learn**：把 theory 矛盾原因（**theory lemma**）加进 F 永久记住
- **T-Backjump**：用 T-Learn 的子句指导回退

这是 [[marques-silva-grasp-1996]] CDCL 学习子句的"theory 版"——冲突原因不再只来自布尔单元传播，也来自 theory。

### 3. DPLL(T) —— 把抽象规则落地

DPLL(T) 是个具体架构图：

```
       SAT 引擎（CDCL，跑抽象 DPLL 的扩展规则）
                 ↕
         theory solver（提供 T-Propagate / T-Conflict）
```

关键工程要求：

- theory solver 必须 **incremental**（一次一个文字加进来，不重算全部）
- theory solver 必须 **backtrackable**（支持 push/pop 状态）
- theory solver 必须能给出 **explanation**（"为什么矛盾"——一组当前 M 中的文字）

满足这三点，theory solver 就能像 SAT 引擎的"协处理器"无缝插入。

## 实践案例

### 案例 1：手算一题，DPLL(T) 在协作什么

公式（线性整数算术 LIA）：`x ≥ 0 ∧ y ≥ 0 ∧ (x + y < 2 ∨ x ≥ 5) ∧ y > 3`

SAT 引擎看到的布尔骨架：`a ∧ b ∧ (c ∨ d) ∧ e`，其中 `a=(x≥0)`, `b=(y≥0)`, `c=(x+y<2)`, `d=(x≥5)`, `e=(y>3)`。

DPLL(T) 走：

1. UnitPropagate：a, b, e 入 M（三个单文字子句直接写下）
2. T-Propagate：LIA solver 看到 `b ∧ e`（`y≥0 ∧ y>3`），在**算术侧**把 y 的下界收紧到 `y ≥ 4`（还没新的布尔文字，但 theory 状态已更新）
3. Decide：试 c（即 `x+y<2`）
4. T-Conflict：LIA 拿到 `x≥0 ∧ y≥4 ∧ x+y<2`，矛盾！解释 = `{a, e, c}`
5. T-Learn：加入子句 `¬a ∨ ¬e ∨ ¬c`
6. Backjump：撤销 c，UnitPropagate 强制 d（`x≥5`）
7. T-check：`x≥0 ∧ x≥5 ∧ y≥4` 满足，得到模型

整个过程 SAT 与 theory **来回交错**，没等 SAT 给出完整模型才验证。

### 案例 2：DPLL(T) vs lazy theory combination

早期 SMT（1990s CVC Lite）的 *lazy* 路线：SAT 解出完整布尔模型 → theory 验证 → 矛盾就把否定加进 F → 重跑 SAT。慢在两点：theory 等到尽头才上场；lemma 不能更早剪枝。

DPLL(T) 的 *online* 路线：每加一条文字 theory 就可喊"矛盾"或"再加一条"。Z3 对工业实例常快 10–1000 倍。

### 案例 3：你电脑里 DPLL(T) 在哪儿

- **Z3 / CVC5 / Bitwuzla**：主循环实现抽象 DPLL，theory plugin 提供 T-Propagate / T-Conflict
- **Dafny / F\* / Boogie**：底层调 Z3，每一步都跑 DPLL(T)
- **对照**：Rust Polonius 等是 datalog 式约束推导，气质相近，但不是标准 DPLL(T) 实现

## 踩过的坑

1. **DPLL(T) 不等于 Nelson-Oppen**：[[nelson-oppen-1979]] 是**多 theory 之间**的协作；DPLL(T) 是 **SAT 与 theory** 的协作。正交的两个层次——Z3 同时跑两者，先 NO 把多个 theory 拼成一个"总 theory"，再让它接进 DPLL(T)。

2. **抽象规则不指定顺序**：论文里 5+4 条规则都没说"先做哪条"。具体求解器要自己选启发式（VSIDS / phase saving / restart 策略）——抽象只保证**任何顺序**都正确不漏解。

3. **theory solver 必须能给"小"的 explanation**：T-Conflict 要求返回一组当前 M 里的文字解释矛盾。如果直接返回整个 M，就无法 backjump 远——SMT 要求**最小冲突核**，工程上是个独立优化课题。

4. **non-convex theory 让 T-Propagate 不够用**：DPLL(T) 假设 theory 能在状态稳定时给出**确定**的传播。位向量、非线性算术做不到 → 现代 Z3 用 **model-based theory combination**（MBTC），让 theory 给出模型而不只是等式，绕过 stably-infinite 限制。

5. **proof production 是后加的**：原论文不要求 theory solver 输出证明对象。但 LFSC / proof carrying 验证（Lean / Coq 调 Z3）要求每步都能复演——CVC5 / Z3 的 proof 模式是抽象规则的**带证据版**。

## 适用 vs 不适用场景

**适用**：

- 任何混合布尔结构 + theory 约束的判定问题
- 程序验证（Dafny / F\* / SPARK / Boogie）
- 符号执行（KLEE / SymCC / angr）
- 调度 / 规划 / 配置（Z3 当 ILP 替代）
- 协议验证（Tamarin / ProVerif 部分阶段）

**不适用**：

- 纯 SAT（用 MiniSat / Kissat 直接，不用上 SMT 包装）
- 量词频繁的一阶逻辑 → 半判定，DPLL(T) 只完备解 quantifier-free 片段
- 概率推理 / 模糊逻辑 → 非真假二值，框架不适用
- 实时约束求解（毫秒级硬截止）→ DPLL(T) 不动点搜索时间不可控

## 历史小故事（可跳过）

- **1979**：Nelson-Oppen 给多 theory 组合定下协议（[[nelson-oppen-1979]]），但 SAT 与 theory 还各跑各的。
- **1990s**：CVC Lite / SVC 在 Stanford 做出第一代工业 SMT，走 lazy 路线，跑得慢。
- **2002**：Tinelli 发表 *DPLL-based Calculus for Ground SMT*，第一次写 SAT 与 theory 在线协作的形式化雏形。
- **2003**：Ganzinger、Hagen、Nieuwenhuis、Oliveras、Tinelli 在 CAV 发短版 *DPLL(T): Fast Decision Procedures*，把架构给出来。
- **2006**：JACM 53 页长版（本笔记主题）发表，把抽象 DPLL、抽象 DPLL Modulo Theories、DPLL(T) 三层全证一遍。
- **2008**：Z3（Microsoft Research）发布，把 DPLL(T) + Nelson-Oppen + 启发式工程化到极致，2008 SMT 比赛横扫。
- **2026**：CVC5 / Z3 / Bitwuzla 内核论文都仍以本篇为引用基础；研究生第一次读 SMT 实现都从这套抽象规则入门。

## 学到什么

1. **"抽象掉实现"是写论文的杠杆**：把 Chaff 和 GRASP 的差异抹掉，剩下规则本身——这让 SMT 圈不再为"哪种 SAT 求解器更好"吵，而是讨论"该加哪条规则"。
2. **接口比算法更重要**（再次验证 [[nelson-oppen-1979]] 的同款洞见）：DPLL(T) 不规定 theory solver 怎么实现，只要满足 incremental + backtrackable + explainable。这让 LIA / EUF / 数组 / BV 各有专人做，互不干扰。
3. **从 lazy 到 online 是哲学转变**：lazy 把 theory 当事后审查，online 把 theory 当协作搜索。后者每步代价高一点，但搜索树指数级缩。"代价 vs 修剪" 平衡是这篇论文的核心论证。
4. **形式化让工程经验可复用**：Z3 把抽象规则一对一映射到代码模块，新加 theory 时知道"实现这四个接口就接进来"——这是 1962 DPLL 时代不存在的复用层。

## 延伸阅读

- 论文 53 页 PDF：[Solving SAT and SAT Modulo Theories, JACM 2006](https://www.cs.upc.edu/~roberto/papers/jacm06.pdf)
- 短版 CAV 2003：*DPLL(T): Fast Decision Procedures*（先看短版再读 JACM）
- 教科书：Bradley & Manna *The Calculus of Computation*（2007，Ch.11）；Kroening & Strichman *Decision Procedures*（2016）
- [[dpll-1962]] —— 抽象 DPLL 抽象的就是它
- [[chaff-2001]] / [[minisat-2003]] —— 工业 / 教学 CDCL，本框架的 SAT 引擎层
- [[marques-silva-grasp-1996]] —— CDCL 学习子句；T-Learn 是它的 theory 推广
- [[nelson-oppen-1979]] —— 多 theory 组合协议；与 DPLL(T) 正交配合

## 关联

- [[dpll-1962]] —— 抽象 DPLL 形式化的就是这套 1962 年的回溯算法
- [[chaff-2001]] —— 工业 CDCL 是抽象规则的具体高效实现
- [[minisat-2003]] —— 600 行教学 CDCL，许多 SMT 把它当 SAT 引擎层
- [[marques-silva-grasp-1996]] —— CDCL 子句学习；T-Learn 把它扩到 theory
- [[nelson-oppen-1979]] —— 多 theory 协作；DPLL(T) 把 NO 放进 SAT 引擎主循环
- [[hoare-logic]] —— 程序验证目标，VC 翻译给 SMT 由 DPLL(T) 自动求解
- [[clarke-cegar-2003]] —— CEGAR 每轮调一次 SMT，底层就是 DPLL(T)

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[acl2-2000]] —— ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确
- [[chaff-2001]] —— Chaff 2001 — 把 CDCL 工程化的两个杀手锏
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[minisat-2003]] —— MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
- [[nelson-oppen-1979]] —— Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认

