---
title: Lerner 组合数据流 — 让小优化互相喂招
来源: Lerner, Grove, Chambers, "Composing Dataflow Analyses and Transformations", POPL 2002
日期: 2026-05-30
分类: 编译器
难度: 中级
---

## 是什么

Lerner-Grove-Chambers 这篇论文提出一种**让一堆小编译器优化彼此交叉喂招**的框架。日常类比：一桌人传菜——A 切了菜，B 立刻看到能炒，B 炒完 C 立刻看到能装盘。每个人只做一件小事，但谁先动了刀别人马上能接。

传统编译器是"流水线"：

```
源码 → [常量传播] → [死代码删除] → [公共子表达式消除] → 目标码
```

每一步只看上一步的结果，看不到自己**之后**的步骤会开出什么新窗户。Lerner 的框架把它们改成：

```
源码 → [一群小 pass 同时盯着一张图] → 谁能动谁动 → 不动点 → 目标码
```

每个 pass 是 **(局部分析 + 局部变换) 的小组合**。一旦有一个 pass 改了图，其他 pass 立刻看到新图，可能开出新机会。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么写编译器最头疼的题目叫 **phase ordering**——先跑 A 还是先跑 B 直接决定优化效果
- 为什么 LLVM 的 pass manager 设计要操心"这个 pass 要不要再跑一次"
- 为什么近几年 e-graph / equality saturation（egg、Cranelift 部分）能火——它们就是想彻底回避 phase ordering
- 为什么"模块化 + 可证明正确"在编译器优化领域是一直被追的方向

## 核心要点

Lerner 框架把优化拆成 **三块**：

1. **局部分析**：每个 pass 用一张普通 dataflow 表收集事实。比如 const-prop 收集"哪些变量值已知是常量"。

2. **局部变换**：分析一旦发现匹配模式，立刻在控制流图上做替换。比如看到 `x = 5; y = x + 1`，把 `y = x + 1` 直接改成 `y = 6`。

3. **不动点调度**：所有 pass 同时挂在一张图上，调度器用 worklist 反复触发：谁的输入变了，谁就再跑一次，直到没人能再动为止。

这三块加起来叫 **组合数据流框架**（composing dataflow framework）。

## 实践案例

### 案例 1：phase-order 的尴尬

```c
if (x == 0) {
  y = 1;
} else {
  y = 2;
}
```

假设别处已经知道 `x = 0`。两个 pass：const-prop（替常量）+ dead-code（砍死分支）。

**phase-order 跑法**（dead-code 先跑）：

- dead-code 先看：两个分支都还活着（因为还没替换 `x == 0`），不动
- const-prop 跑：把 `x == 0` 化简成 `true`
- **结束**——没人再跑 dead-code，`else` 分支没被砍

要砍 `else`，得再跑一次 dead-code。换个顺序又错过另一组案例。

### 案例 2：Lerner 框架跑法

- const-prop 看到 `x == 0`，立刻替成 `if (true) ...`
- 这一改通知调度器：图变了
- dead-code 被叫醒：看到 `if (true)`，立刻砍 `else` 分支
- 砍完通知调度器：又变了
- const-prop 再扫……直到没人能再动

**关键差别**：每个 pass 不再"轮流上场"，而是"看到机会就上"。

### 案例 3：和现代编译器的关系

```
LLVM Opt: -O2 = passManager.add(consprop, dce, gvn, licm, ...)
```

LLVM 至今主用 phase-order，但 pass manager 里的 "function pass / module pass / loop pass" 分类、以及"这个 pass 改了 IR 后要重跑哪些 analysis"的依赖追踪，思路上和 Lerner 框架是同一族。

`PreservedAnalyses` 这个返回值就是 Lerner 思想的工业残影——pass 跑完声明"我没动 dominator tree，分析结果可以复用"，比直接全部失效省时间。

### 案例 4：和 e-graph 的关系

egg / equality saturation 把"互相喂招"推到极致：

- 不直接改 IR，而是把表达式塞进 e-graph（一张同义关系图）
- 所有重写规则同时往里加等价节点
- 最后用 cost function 选一份最优的输出

它和 Lerner 一样想避开 phase-order，但避开方式更激进——根本不让"改写"立刻发生，而是先把所有可能的改写都记下来再选。

## 踩过的坑

1. **不动点可能很慢**：每改一次都要重新分析；如果没有好 worklist 调度，复杂度会爆。Lerner 用了惰性传播 + 局部 invalidate 控制开销，按节点级别决定哪些事实需要重算。

2. **正确性证明很硬**：每个 pass 的 transfer function 要单独证"我对图的改写是语义保持的"，组合起来才安全。论文给了一个一般性框架但落地工程量大，每加一个新优化都要补一份证明义务。

3. **真正工业铺开有限**：GCC / LLVM 仍以 phase-order 为骨干。Lerner 框架在 Whirlwind 实验编译器里落地，但没在主流编译器全面替代——工程团队更看重可调试、可控的执行顺序。

4. **不动点不一定收敛**：如果两个 pass 的变换互相"翻来覆去"，调度器会震荡。需要良序保证（每次变换让某个度量严格下降），论文用变换的"信息单调性"来锁住这一点。

5. **调试困难**：传统 phase-order 出 bug 时容易打印中间 IR、二分定位是哪个 pass 出错。组合框架里"谁先动了谁"对开发者不透明，定位回归更费劲。

## 适用 vs 不适用场景

**适用**：

- 研究型编译器、想验证一组优化组合是否正确
- 优化数量多、彼此互相喂招收益大的场景（如高级中间表示）
- 需要"模块化加新优化"的实验平台

**不适用**：

- 工业大编译器骨干——phase-order 简单可控仍占优
- 优化彼此独立、组合收益低的场景——上不动点框架反而慢
- 编译时间敏感（嵌入式 / JIT）——多次扫图代价高

## 历史小故事（可跳过）

- **1970s**：Kildall 提出统一 dataflow 框架，但只解决"单个分析"的问题
- **1990s**：编译器界发现 phase-order 是头疼问题，Click-Cooper 等做了"超图优化"早期尝试
- **2002 年**：Sorin Lerner（Chambers 学生）+ David Grove + Craig Chambers 在 POPL 发了这篇论文，把"分析 + 变换 + 组合"做成一套有正确性证明的框架，落在 Whirlwind 编译器
- **2010s**：e-graph / equality saturation（Tate, Tatlock, Lerner 自己后来也参与）兴起——某种意义上是把 Lerner 的"互相喂招"思想推到极致

Lerner 后来在 UCSD 继续做 PEC（Program Equivalence Checker）、Rosette 这条线，都和"模块化可证明编译"有血缘。

## 学到什么

1. **优化不该串行跑**——让它们同时盯着图、互相触发，能挖到 phase-order 跑不到的机会
2. **(分析 + 变换) 是一个不可拆的单元**——分析挖事实是为了变换，变换改图反过来更新事实
3. **不动点 + worklist** 是这类组合框架的骨架，和 Kildall dataflow 同根
4. **理论清晰 ≠ 工业落地**——这套思想 24 年了，工业编译器仍是 phase-order，但实验研究和验证工作受其深远影响
5. **正确性义务是设计的一部分**——加一个新 pass 不只是写代码，还要补一份"我不破坏前人事实"的证明
6. **再好用的框架也要承担开发者学习成本**——可观察性差比性能差更让工程师抗拒

## 延伸阅读

- 论文 PDF：[Lerner-Grove-Chambers POPL 2002](https://homes.cs.washington.edu/~mernst/pubs/composing-dataflow-popl2002.pdf)（约 14 页，密度高）
- e-graph 后继：[egg — Fast and Extensible E-graphs](https://egraphs-good.github.io/)
- LLVM Pass Manager：[The New Pass Manager](https://llvm.org/docs/NewPassManager.html)
- [[kildall-dataflow]] —— Lerner 框架的数学底座
- [[ssa]] —— 现代编译器的 IR 形态，Lerner 框架在 SSA 上跑更顺

## 关联

- [[kildall-dataflow]] —— Kildall 给"单个分析"统一数学框架，Lerner 把它推广到"一组分析 + 变换"
- [[ssa]] —— SSA 让 use-def 显式，组合优化更高效
- [[llvm]] —— pass manager 设计与 Lerner 思路同族
- [[cousot-abstract-interpretation]] —— 抽象解释给 dataflow 分析的语义底座，Lerner 框架借此证组合正确性

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[e-path-egraph]] —— E-Path — 把 CFG 优化从单行通道改成候选池
