---
title: MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
来源: 'Eén & Sörensson, "An Extensible SAT-solver", SAT 2003 (LNCS 2919)'
日期: 2026-05-30
子分类: 形式化验证
分类: 形式化方法
难度: 中级
provenance: pipeline-v3
---

## 是什么

MiniSat 是 2003 年瑞典 Chalmers 两位研究生 Niklas Eén 和 Niklas Sörensson 写的 SAT 求解器。它**没有发明新算法**——主循环是 GRASP 1996 的 CDCL，决策启发式是 Chaff 2001 的 VSIDS，单元传播是 Chaff 2001 的 watched literals。

它做的是另一件事：

> 把过去七年所有 SAT 圈的工程经验**压到 600 行可读的 C++**，并把内部接口暴露出来让别人能在上面扩展。

一句话定位：

- 不读 MiniSat 源码，谈 CDCL 就只剩纸上推导
- 现代主流求解器（Glucose / Cryptominisat / MapleSAT / 早期 CaDiCaL）几乎都是从 MiniSat fork 出来的
- SAT 教材（Biere *Handbook of Satisfiability*）把 MiniSat 当默认参考实现

## 为什么重要

不理解 MiniSat 的几个工程决策，下面这些事都解释不了：

- 为什么**学 CDCL 不去读 Chaff 而读 MiniSat**——Chaff 的 zChaff 源码近一万行，分散在多个模块；MiniSat 把同样能力压到 600 行，每个数据结构都能 5 分钟读完
- 为什么**SAT 比赛 2003-2010 那批冠军都是 MiniSat 衍生**——它的接口足够开放，加一个 phase saving 或一个新启发式只改几十行
- 为什么 **Z3 / CVC5 这些 SMT 求解器底层都长得像 MiniSat**——SMT 的布尔骨架就是一个 incremental CDCL，MiniSat 的 `solve(assumptions)` API 几乎是 SMT 与 SAT 的标准接口
- 为什么**论文长度才 4 页却被引近万**——它不是拿新算法换名字，是把工程压到极致让所有人能站上来

## 核心要点

MiniSat = GRASP 算法 + Chaff 数据结构 + 4 个独立工程贡献：

### 1. 把 Chaff 改成连续衰减的 VSIDS

Chaff 是每 256 次冲突把所有计数器除 2（阶跃衰减）。MiniSat 改成**每次冲突，把全局衰减因子 ×1/0.95**，新增 bump 时按当前因子加。等价于"老 bump 越来越不值钱"，但**完全不用扫所有变量**——一个全局浮点数就够了。日常类比：你不用每天给所有员工降薪 50%，只要每年通胀让旧工资自然贬值。

### 2. Conflict Clause Minimization

CDCL 学到一条冲突子句后，里面的某些文字其实可以由其他文字推出，是冗余。MiniSat 提出递归最小化：对学到子句的每个文字，看它的 reason 子句里的所有其他文字**是否都已在当前学习子句里**——是则可删。学子句平均缩短 30%，传播更少冲突。

### 3. Incremental SAT API（assumptions）

`solve(assumptions=[l1, l2, ...])` 表示"这次求解强制这些文字为真"。求解结束后**学习子句保留**，下次 `solve` 用不同 assumptions 重新跑——不用从零开始。SMT、规划、模型计数都靠这个。

### 4. 学子句也有 activity，会被回收

CDCL 不限学子句数会爆内存。MiniSat 给每条学子句也维护一个 activity（被卷入冲突就 +1，整体衰减），周期性把 activity 最低的一半学子句删掉。"最近不吵的合同就丢掉"——Glucose 2009 后用 LBD 替代 activity，但思路同源。

### 5. Extensible 接口

代码层抽出 `Solver` 类暴露 `newVar / addClause / solve / value` 四个方法。决策策略、重启策略、子句删除策略都是可替换的策略对象。**这让 MiniSat 不只是一个求解器，是一个 CDCL 框架**。

## 实践案例

### 案例 1：四个文件读完整个 CDCL

MiniSat 1.14 的核心：

```
Solver.h / Solver.C  —— 主循环 + 数据结构（搜索、传播、分析、回溯）
SolverTypes.h        —— Lit / Clause / Var 编码
Heap.h               —— activity 决策队列
Vec.h                —— 自定义动态数组
```

`Solver::search()` 大约 60 行就把"决策 → BCP → 冲突分析 → backjump → restart"串完。第一次读 SAT 教材时跟代码对一遍，CDCL 就懂了。

### 案例 2：watched literals 的 MiniSat 实现

```cpp
// Solver::propagate 里的核心循环（伪代码化）
while (qhead < trail.size()) {
    Lit p = trail[qhead++];      // 刚被赋 true 的文字
    vec<Watcher>& ws = watches[~p];  // 盯着 ¬p 的子句
    for (Watcher& w : ws) {
        // 已有另一个 watched 是 true → 提前退出
        if (value(w.blocker) == True) continue;
        Clause& c = ca[w.cref];
        // 把 ¬p 调到 c[1] 位置
        if (c[0] == ~p) std::swap(c[0], c[1]);
        // 找新 watch
        for (int k = 2; k < c.size(); k++)
            if (value(c[k]) != False) {
                std::swap(c[1], c[k]);
                watches[~c[1]].push(w);
                goto NextClause;
            }
        // 找不到 → 这是单元子句
        if (value(c[0]) == False) return conflict;
        else uncheckedEnqueue(c[0], w.cref);
        NextClause:;
    }
}
```

`blocker` 是 MiniSat 的小优化：每个 watch 多存一个"如果它已 true，子句肯定满足，可以跳过 cache miss"的提示文字。

### 案例 3：你电脑里的 MiniSat 后裔

- **Z3 / CVC5 SMT 求解器**：布尔层基本是 MiniSat 风格 CDCL
- **依赖求解器**（Cargo PubGrub / OPIUM）：CDCL 思路源于 MiniSat 教材化的版本
- **CBMC 验 C 程序**：底层 SAT 后端 MiniSat 或其后裔
- **数独 / N 皇后 / 调度问题**入门博客 90% 用 MiniSat 演示
- **Coq / Lean 的 SMT-tactic**：调用 Z3，间接用了 MiniSat 思路

## 踩过的坑

1. **以为 600 行=简单**：MiniSat 短是因为**预设了七年前的 SAT 工程经验**。第一次读会卡在"为什么 watch 列表存 blocker"、"为什么 trail 同时是栈和队列"——这些都需要 GRASP / Chaff 背景。先读 chaff-2001 笔记再读 MiniSat 源码顺得多。

2. **conflict minimization 不是免费午餐**：递归版（MiniSat 2 默认）效果好但复杂；早期"local minimization"只看一层，性能略差但好实现。课程作业实现 CDCL 时建议先跳过 minimization，跑通再加。

3. **activity bump 顺序很重要**：bump 学习子句涉及的变量要在分析完冲突子句**后**做，不是 conflict 出现时立即做。提前 bump 会让计数器统计错误。

4. **incremental 重新求解的隐藏假设**：assumptions 必须是文字，不能是公式。要"在 F 基础上再加一条 (a∨b)" 时，得先加为子句而不是塞进 assumption。SMT 集成时这个边界经常踩。

5. **clause deletion 删错会丢解**：原始子句（problem clause）和学习子句要分两个池子，删除只动学习池。MiniSat 用 `Clause::learnt()` 标记区分，自己实现时漏判这个就会得到错误的 UNSAT。

## 适用 vs 不适用场景

**适用**：

- **学 CDCL 的最佳起点**：教材 + 600 行源码 + 4 页论文，三件套
- 中等规模 SAT（百万变量内）的工业基线
- SMT / 模型计数 / 规划 等需要 incremental SAT 的上层工具
- 二次开发出新启发式 / 新预处理 时的脚手架

**不适用**：

- 追求 SOTA 性能 → 用 CaDiCaL 或 Kissat（CaDiCaL 作者也是 Biere；MiniSat 老化点：内存布局、并行化）
- 随机 3-SAT 相变区难例 → WalkSAT 系本地搜索
- QBF / #SAT → 需要换求解范式，MiniSat 只解 SAT

## 历史小故事（可跳过）

- **2002**：Eén 和 Sörensson 是 Chalmers 的研究生，导师 Mary Sheeran 让他们做硬件验证项目，需要一个能改的 SAT 求解器——zChaff 太大改不动，索性自己写。
- **2003 SAT 比赛**：MiniSat 第一次亮相拿了多个赛道第一。论文同年发表在 SAT 2003 会议上，**4 页**。
- **2005**：MiniSat 2 发布，加上 SatELite 预处理（变量消去 + 子句包含）+ phase saving，再次拿冠军。
- **2009**：Audemard & Simon 在 MiniSat 上加 LBD 评分发布 Glucose，又一次跨越。Glucose 也是 fork。
- **2010+**：MiniSat 不再积极更新，作者转去其他项目。但所有现代求解器（Cryptominisat / MapleSAT / Lingeling / CaDiCaL）都直接或间接借鉴了它。
- **2026**：本科 SAT 课程仍把 MiniSat 当默认阅读源码。

## 学到什么

1. **可读性是杠杆**：Chaff 改变了算法 + 数据结构组合，但 zChaff 源码没人读。MiniSat 把同样能力压到 600 行，于是十几年里所有研究生都在它上面做实验——杠杆比单点性能更重要。
2. **暴露接口比闭着写效率高**：MiniSat 的 `solve(assumptions)` 让 SMT 圈直接抓上来。如果它当初只是做了一个独立程序而不是库，今天很多事都会重新发明。
3. **微改动 × 量级**：连续衰减替换阶跃衰减，conflict minimization 替换原版子句——每个改动看起来都不大，但每个都贡献几个百分点，叠起来就是新一代。
4. **工程论文也能成经典**：MiniSat 论文没新定理，没新启发式，被引近万。SAT 圈和系统圈一样：**让别人站上来**比一次性最快重要。

## 延伸阅读

- 论文 4 页 PDF：[An Extensible SAT-solver, SAT 2003](http://minisat.se/downloads/MiniSat.pdf)
- 源码（MiniSat 2.2）：[github.com/niklasso/minisat](https://github.com/niklasso/minisat) —— 600 行核心
- 教学讲解：Knuth *SAT Solvers* Stanford 2015 公开课，逐行讲 MiniSat
- 教材：Biere et al. *Handbook of Satisfiability* 2nd ed (2021)，第 4 章详细推导 CDCL
- [[chaff-2001]] —— MiniSat 直接借鉴的两个数据结构来源
- [[marques-silva-grasp-1996]] —— CDCL 主循环
- [[dpll-1962]] —— 回溯式 SAT
- [[davis-putnam-1960]] —— SAT 奠基

## 关联

- [[chaff-2001]] —— VSIDS 与 watched literals 直接来自 Chaff，MiniSat 把它们工程化
- [[marques-silva-grasp-1996]] —— CDCL 算法骨架，MiniSat 主循环就是它
- [[dpll-1962]] —— 回溯式搜索基础，MiniSat 仍是 DPLL 的扩展
- [[davis-putnam-1960]] —— SAT 求解的奠基论文
- [[biere-bmc-1999]] —— BMC 把硬件展成 SAT，MiniSat 是底下默认引擎
- [[clarke-cegar-2003]] —— CEGAR 每轮调一次 incremental SAT，MiniSat 的 assumptions 接口正合适
- [[cook-levin]] —— SAT 是 NP-完全，MiniSat 让"难"在工业实例上失效

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[chaff-2001]] —— Chaff 2001 — 把 CDCL 工程化的两个杀手锏
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[hyperkernel-2017]] —— Hyperkernel — 让 SMT 求解器一键验证操作系统内核
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[nelson-oppen-1979]] —— Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"
- [[nieuwenhuis-dpll-t-2006]] —— Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认

