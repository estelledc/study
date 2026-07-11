---
title: GRASP 1996 — 让 SAT 求解器从冲突里学到东西
来源: 'Marques-Silva & Sakallah, "GRASP: A Search Algorithm for Propositional Satisfiability", ICCAD 1996'
日期: 2026-05-30
分类: 编译器 / 形式方法
难度: 中级
---

## 是什么

GRASP 是 1996 年 Marques-Silva 和 Sakallah 在 ICCAD 上发的 SAT 求解器，**第一次系统性地把"冲突学习"塞进 DPLL**。它的全名是 Generic seaRch Algorithm for the Satisfiability Problem。

日常类比：像考试**错题本**——以前每做错一题只改这一次答案（DPLL 回溯）；GRASP 会把"这组条件不能同时成立"写成一条永久规则贴进题库，下次任何卷子再出现同一组合，直接跳过整片死路。登山发现死路时也不是退一步，而是直接退到分岔口。

一句话说清楚改动：

> DPLL（1962）回溯时只是"撤销上一个决策"——同样的矛盾会在搜索树不同位置反复触发。
> GRASP 在每次冲突时**画一张 implication graph**（赋值谁推出谁的因果图），反向追出"哪几个决策共同导致了这次矛盾"，把这个组合**写成一条新子句永久加进 CNF**（合取范式：一堆"或"子句再用"且"连起来）——下次任何路径走到同一组合，单元传播立刻就剪掉了。

后来学界把这套"冲突驱动学子句"统称为 **CDCL（Conflict-Driven Clause Learning）**。从 1996 到 2026，所有工业 SAT 求解器（zChaff / MiniSat / Glucose / CaDiCaL / Z3 内核）的主循环都是 DPLL + GRASP 这个学习动作的组合，三十年没变过。

## 为什么重要

不理解 CDCL 的"学子句"动作，下面这些事都说不清：

- 为什么 **MiniSat 600 行**就能把 1000 万变量级别的工业实例跑出来——靠的就是学子句剪枝
- 为什么 **Cargo / npm 依赖冲突**有时几毫秒、有时跑半天——CDCL 学得到位就快，学不到就退化成 DPLL
- 为什么 **Intel 芯片每条指令都被 BMC 验证**——BMC 把电路展成 SAT，CDCL 在底下跑
- 为什么 **Z3 秒证某些智能合约**——SMT 的布尔骨架层就是 CDCL
- 为什么 SAT 是 NP-完全问题，工业上却像被解决了——CDCL 让"难例"和"容易例"差别巨大，工程问题幸运地大多是后者

## 核心要点

GRASP 在 DPLL 6 行主循环上加了**一个动作**：冲突发生时，不直接回退，先**分析**。

```
GRASP-DPLL(F):
  while True:
    if 单元传播触发冲突:
      C, lvl = analyze_conflict()      # ← GRASP 新增
      learn(C); F = F ∪ {C}            # ← GRASP 新增
      if lvl < 0: return UNSAT
      backtrack_to(lvl)                # ← 非时序回溯，不一定到上一层
    elif 全部赋值: return SAT
    else: decide_a_variable()
```

关键三件事：

1. **Implication Graph（蕴含图）**：每个赋值是一个节点；如果它是单元传播得来的，从导致它的子句里其他文字连边过来。冲突 = 同一变量被赋成 T 和 F 两条路径汇到一起。

2. **Cut（切割）→ 学习子句**：在蕴含图里画一条把"决策"和"冲突"分开的切线，切线上文字的**反面**合起来就是新学的子句。最常用的切法叫 **1-UIP**（First Unique Implication Point，最靠近冲突的支配点）。

3. **Non-chronological backtracking（非时序回溯）**：传统 DPLL 回退一层；GRASP 直接跳到学习子句里第二高的决策层。可能一次跳过好几层——就像登山发现死路，不是退一步，而是直接退到分岔口。

学到的子句永久留在 CNF 里。后续任何路径只要走到"这组决策的部分前缀"，单元传播立刻把禁区点出来。**冲突变成情报，不再是浪费的搜索**。

## 实践案例

### 案例 1：手算一次冲突分析

```
子句: c1=(¬x1∨x2)  c2=(¬x1∨x3∨x9)  c3=(¬x2∨¬x3∨x4)
      c4=(¬x4∨x5∨x10)  c5=(¬x4∨x6∨x11)  c6=(¬x5∨¬x6)
决策栈: x9=F@1, x10=F@2, x11=F@3, x1=T@4
```

第 4 层决策 `x1=T` 触发链式单元传播：`x2=T → x3=T → x4=T → x5=T → x6=T → c6 冲突`。

蕴含图反向追到 1-UIP：发现 `x4=T` 是**最近一个所有冲突路径都经过的点**。切割得到学习子句 `(¬x4 ∨ x10 ∨ x11)`——读作"如果 x10、x11 都已是 F，那 x4 不能是 T"。

跳回到 `x10=F@2` 那层（学习子句中第二高的决策层），单元传播立刻得到 `x4=F`，整片搜索区域被剪掉。**纯 DPLL 在这里只会回到第 4 层改试 `x1=F`，一无所学**。

### 案例 2：DPLL vs GRASP 在同一难例上的差距

| 项 | DPLL 1962 | GRASP 1996 |
|---|---|---|
| 冲突时动作 | 改试另一边 | 分析+学子句+远跳 |
| 同型冲突再遇 | 重新搜一遍 | 单元传播一步剪掉 |
| 内存 | 决策栈 O(n) | + 学习子句库 |
| 1996 工业上限 | 数百变量 | 数万变量 |
| 难例上典型加速 | 1× | 100×–10000× |

### 案例 3：1-UIP 为什么是默认切法

蕴含图里可以切的位置有很多——最靠近决策的（DecisionUIP）、中间的、最靠近冲突的（FirstUIP / 1-UIP）。Zhang 等人 2001 年实测发现：

- **1-UIP 学到的子句更短**——剪枝更有力
- **更靠近冲突 = 更通用**——这条子句在搜索树其他位置触发的概率更高
- **实现简单**——从冲突节点 BFS 反向，找到第一个支配点就停

所有现代 CDCL 求解器（MiniSat / CaDiCaL / Glucose）默认都是 1-UIP。教材里的"FirstUIP / LastUIP / All-UIP"在工业里基本不用。

### 案例 4：你电脑里 GRASP 的曾孙在哪儿

- **`cargo build` 解析依赖**：PubGrub 算法是 CDCL 思想的优化变体
- **Z3 SMT 求解器**：布尔骨架层 = CDCL；理论层（线性算术、位向量）按 lazy 方式接进来
- **CBMC 验证 C 代码**：内存安全、断言违反 → CNF → MiniSat 系 CDCL 求解
- **Sudoku 数独应用**：729 个 0/1 变量 → CDCL 几毫秒解完
- **AI 规划 / 调度**：经典 NP-难问题大量编译成 SAT 让 CDCL 跑

## 踩过的坑

1. **学习子句必须管理生命周期**：留太多内存爆炸，删太狠学到的剪枝又丢失。Glucose 2009 引入 **LBD（Literal Block Distance）** 评分——子句涉及的决策层数越少越"高质量"，定期淘汰高 LBD 的。

2. **重启策略与 CDCL 强耦合**：不周期重启的 CDCL 容易卡在错误启发式上跑很久。MiniSat 用 Luby 序列 (1,1,2,1,1,2,4,...) 触发重启——重启后保留学习子句，但决策栈清空。

3. **Implication graph 要每节点存 antecedent**：实现时一旦忘了记"是哪条子句把我推出来的"，反向追溯就断了。这是手写 CDCL 最常见的翻车点。

4. **1-UIP 不等于完美**：在某些结构化实例（密码学、组合电路）上 DecisionUIP 反而更快。SOTA 求解器会做配置自适应。

5. **CDCL 不是万能的**：对随机 3-SAT 的相变区附近难例，CDCL 优势不明显——那里更适合本地搜索（WalkSAT 系）。

## 适用 vs 不适用场景

**适用**：

- 工业 SAT（依赖求解、硬件验证、软件验证条件）
- SMT 求解器的布尔骨架层
- 离散组合搜索能编成 CNF 的（数独、调度、图着色）

**不适用**：

- 随机 3-SAT 相变难例 → WalkSAT / 本地搜索更稳
- #SAT（计数解的个数）→ 需要专门的模型计数算法
- 量化 SAT（QBF）→ CDCL 基础上还要扩展量化推理
- 实数 / 非线性约束 → 走 SMT 的理论层，CDCL 只管布尔骨架

## 历史小故事（可跳过）

- **1960**：Davis-Putnam JACM，归结消变量，理论第一篇。
- **1962**：DPLL 改成栈式回溯——空间从指数变线性。
- **1977**：Stallman & Sussman 在 ARS（Antecedent Reasoning System）里提出 dependency-directed backtracking，思想雏形——但停留在 AI / 真值维护系统，没传到 SAT 圈。
- **1996**：Marques-Silva 和 Sakallah 在 ICCAD 发 GRASP，**第一次把 CDCL 落到工业 SAT 求解器**。
- **2001**：Moskewicz 等人写 zChaff/Chaff，VSIDS 启发式 + watched literals，跑 100 万变量级。
- **2003**：Eén & Sörensson 写 MiniSat，600 行——成为后来所有教材参考。
- **2009**：Audemard & Simon 写 Glucose，引入 LBD 评分。
- **2017+**：Biere 的 CaDiCaL 成新 SOTA，仍是 GRASP 主干 + 三十年工程打磨。

## 学到什么

1. **算法升级常常不是改主循环，而是加一个动作**：DPLL → GRASP 没改回溯结构，加了"分析+学习+远跳"这一个步骤，性能跨数量级。
2. **冲突是情报不是浪费**：传统搜索把失败当成"试错代价"；CDCL 让每次失败永久缩小搜索空间。这个思路在依赖求解、约束规划、AI 规划领域都被反复借用。
3. **数据结构决定算法上限**：implication graph 这个表示让"分析冲突原因"变得可计算——没有这张图，CDCL 根本没法实现。
4. **理论可判定 ≠ 工程能解**：SAT 是 NP-完全；但有了 CDCL + VSIDS + watched literals + 重启 + LBD，工业 1000 万变量级跑得动。

## 延伸阅读

- 论文 PDF：[Marques-Silva & Sakallah, GRASP, ICCAD 1996](https://www.cs.cmu.edu/~emc/15-820A/reading/grasp_iccad96.pdf)（10 页，可读）
- 教材：Biere et al. *Handbook of Satisfiability*（2009 / 第二版 2021，CDCL 一章是入门首选）
- 自己读源码：[MiniSat 600 行](http://minisat.se/)——CDCL 最小教学实现，2-3 天能读透
- 视频：Donald Knuth *SAT Solvers* 公开课（Stanford 2015，含 CDCL 推导）
- [[davis-putnam-1960]] —— SAT 求解器的祖先，归结消变量
- [[dpll-1962]] —— GRASP 的直接前身，回溯主循环
- [[biere-bmc-1999]] —— BMC 把硬件展成 SAT，CDCL 在底下跑
- [[clarke-cegar-2003]] —— 抽象细化在每轮里调一次 CDCL

## 关联

- [[davis-putnam-1960]] —— SAT 求解的奠基论文，DP 算法
- [[dpll-1962]] —— GRASP 在 DPLL 主循环上加学习动作
- [[biere-bmc-1999]] —— BMC 是 CDCL 在硬件验证的最大应用
- [[clarke-cegar-2003]] —— CEGAR 每轮抽象细化都调 CDCL 求解器
- [[cook-levin]] —— SAT 是 NP-完全，CDCL 最坏指数的理论上限
- [[hoare-logic]] —— 程序验证条件常被翻成 SAT 由 CDCL 后裔自动处理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[chaff-2001]] —— Chaff 2001 — 把 CDCL 工程化的两个杀手锏
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[minisat-2003]] —— MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
- [[nelson-oppen-1979]] —— Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"
- [[nieuwenhuis-dpll-t-2006]] —— Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书

