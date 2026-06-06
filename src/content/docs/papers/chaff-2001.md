---
title: Chaff 2001 — 把 CDCL 工程化的两个杀手锏
来源: 'Moskewicz, Madigan, Zhao, Zhang & Malik, "Chaff: Engineering an Efficient SAT Solver", DAC 2001'
日期: 2026-05-30
子分类: 形式化验证
分类: 形式化方法
难度: 中级
provenance: pipeline-v3
---

## 是什么

Chaff 是 2001 年 Princeton 团队在 DAC 上发的 SAT 求解器（实现叫 zChaff）。它**没发明新算法**——主循环就是 GRASP 1996 那套 CDCL（DPLL + 冲突学习 + 非时序回溯）。它做的事是把 CDCL 工程化，靠两个新点子让性能跨了一两个数量级：

- **VSIDS**（Variable State Independent Decaying Sum）—— 决策启发式
- **Watched Literals** —— 单元传播的惰性数据结构

一句话说清楚改动：

> GRASP 已经把"从冲突学子句"打通了。Chaff 让"挑下一个变量"和"传播单元子句"这两步快到几乎不要钱——每秒能跑过千万次决策。

从 2001 到 2026，所有工业 SAT 求解器（MiniSat / Glucose / CaDiCaL / Z3 内核）的内部结构都还是 Chaff 这两件武器加几十年工程打磨。

## 为什么重要

不理解 Chaff 的两个数据结构，下面这些事都说不清：

- 为什么 **MiniSat 600 行**就能扛工业百万变量——靠的就是 watched literals 让回溯不用维护任何东西
- 为什么 **VSIDS 这个看似很笨的"计数器 + 衰减"**反而打败了所有花哨的启发式——便宜 + 跟得上当前冲突局部
- 为什么 **EDA 厂商 2002 年后把 SAT 当主流工具**——Chaff 把硬件验证从"几小时"降到"几分钟"
- 为什么 **算法相同、性能差 100 倍**是 SAT 圈日常——主循环不是瓶颈，数据结构和启发式才是

## 核心要点

Chaff 不改 GRASP 的主循环，只在两个动作上换实现：

### 1. VSIDS：每秒挑几百万次变量也不卡

每个文字（literal，比如 `x` 或 `¬x`）维护一个浮点计数器。规则极简：

- **学到新子句时**，把这条子句里出现的所有文字计数器 **+1**
- **每隔 N 次冲突**（比如 256），把**所有**计数器除以 2（衰减）
- **每次决策**：在所有未赋值变量里挑计数器最大的文字，按它的极性赋值

关键：计数器的更新**不依赖当前赋值状态**——这就是名字里 "State Independent" 的来源。VSIDS 偏向最近高频出现在冲突里的变量，因为衰减让旧热点自然冷却。

日常类比：像热搜榜——最近被讨论得多的话题排前面，旧话题不主动维护就会自己沉下去。

### 2. Watched Literals：让单元传播懒到极致

传统单元传播（GRASP 用的 counter-based）：每个变量赋值，扫描所有包含它的子句，更新计数器。回溯时还得反着扫一遍维护。

Chaff 的偷懒版：每条子句**只盯 2 个还没被赋 false 的文字**（叫 watched literals）。

- 一个变量被赋值时，只看那些把它当 watched literal 之一的子句
- 检查被盯文字是否变 false：是就在子句里**找一个新的非 false 文字**接替；找不到说明只剩一个非 false 文字 → 这是单元子句，传播
- **回溯时什么都不用做**——已被赋 false 的文字现在变成未赋值，2 个 watched 仍然有效

日常类比：合同要两个见证人才有效。只要有两个在场就行，没必要时刻点名所有人；只有一个见证人退场了才去找替补。

性能差距：Chaff 实测 watched literals 比 counter-based 单元传播快 5-10×，缓存命中率显著提升（每条子句平均只摸 2 个文字而不是全扫）。

## 实践案例

### 案例 1：watched literals 一次完整动作

```
子句: c = (x1 ∨ ¬x2 ∨ x3 ∨ x4 ∨ ¬x5)
当前盯: x1, ¬x2  （都还没被赋 false）
```

赋值 `x1 = false` 触发：

1. `x1` 变 false，c 的第一个 watched 失效
2. 在 c 里找另一个非 false 文字：x3 还未赋值 → 新 watched 改成 (x3, ¬x2)
3. 单元传播此子句无事发生

如果接下来 `x2 = true`：

1. `¬x2` 变 false
2. 找替补：x4 未赋值 → watched 改成 (x3, x4)

如果再接 `x3 = false, x4 = false`：

1. 找替补：剩下的文字 ¬x5 也算（x5 未赋值）→ watched 改成 (¬x5, ...) 但只剩一个非 false 文字了
2. 触发单元传播：`x5 = false`

回溯时假设撤回 `x4 = false`：watched 仍是 (x3, x4)，**根本不需要改**。这就是它最大的优势。

### 案例 2：VSIDS vs 旧启发式对比

| 启发式 | 思路 | 计算成本 | Chaff 之前的代表 | 缺点 |
|---|---|---|---|---|
| MOMS | 数当前最短子句里出现频次 | 每次决策扫所有未满足子句 | GRASP 默认 | O(子句数) — 子句越学越多越慢 |
| Jeroslow-Wang | 文字按子句长度加权 | 同样每次扫 | 早期 SATO | 同上 |
| **VSIDS** | 计数器 + 衰减 | O(log n) 取最大 | **Chaff** | 偏向局部，可能错过全局结构 |

VSIDS 最大优势：**成本与子句数无关**。学子句多到几十万条时，前两种启发式被拖死，VSIDS 一秒挑几百万次。

### 案例 3：你电脑里 Chaff 的曾孙在哪儿

- **`cargo build`**：依赖求解后端 PubGrub 是 CDCL 的高级变体
- **Z3 SMT 求解器**：布尔骨架层 = MiniSat 系 CDCL = Chaff 思路
- **CBMC / SymCC 验 C 代码内存安全**：编译到 CNF → CaDiCaL（Chaff 第三代）求解
- **数独 App 几毫秒解 16×16**：729 → 几千个布尔变量 → CDCL 一闪而过
- **Intel / AMD 芯片设计**：BMC 把电路展平成 SAT，Chaff 后裔守门

## 踩过的坑

1. **watched literals 实现最常见错法是回溯时去维护 watch 指针**：根本不用。watched literal 失效只在前向赋值时检测；回溯让赋值变成未赋值，watched 自动恢复有效。多写一行回溯逻辑反而错。

2. **VSIDS decay 频率是玄学**：除 2 太频繁丢失历史，太慢追不上当前冲突局部。Chaff 论文取每 256 次冲突 decay 一次；后来 MiniSat 改成每次冲突按 0.95 因子衰减（连续而非阶跃），更稳。

3. **VSIDS 不是没缺点**：在结构化电路上偶尔被 "VMTF（Variable Move To Front）" 等变体超过；现代求解器（Glucose / CaDiCaL）默认仍是 VSIDS 系，但带可切换分支。

4. **Chaff 论文看上去简单，工程细节巨多**：clause database 内存布局、文字编码用 32 位 int 还是位域、watched 列表用链表还是数组——每个选择都能让性能差 30%。MiniSat 之所以重要，就是把 Chaff 的工程经验压到 600 行可读代码里。

5. **不是万能的**：随机 3-SAT 相变区附近 VSIDS 优势消失——那里更适合 WalkSAT 系本地搜索；CDCL 主导的是结构化工业实例。

## 适用 vs 不适用场景

**适用**：

- 工业 SAT（依赖求解 / BMC / 验证条件 / 调度）
- SMT 布尔骨架
- 需要每秒百万次决策的场景

**不适用**：

- 随机 3-SAT 相变难例 → WalkSAT
- #SAT（计数解）→ 模型计数算法
- QBF（量化 SAT）→ 需扩展量化层

## 历史小故事（可跳过）

- **1962**：DPLL 主循环成形，回溯式搜索。
- **1996**：GRASP 加 CDCL（学习子句 + 非时序回溯），算法骨架定型。
- **2001**：Princeton Chaff 团队发现"主循环不是瓶颈"，把决策启发式换成 VSIDS，单元传播换成 watched literals——同样算法，速度跨数量级。zChaff 拿了 SAT 比赛冠军，EDA 圈炸了。
- **2003**：Eén & Sörensson 写 MiniSat，把 Chaff 600 行化，成为后来所有教材参考实现。
- **2009**：Glucose 加 LBD 评分管理学习子句库。
- **2017+**：CaDiCaL 成新 SOTA，仍是 Chaff 主干 + 二十年工程打磨——核心两件武器没换。

## 学到什么

1. **算法到位之后，工程是下一个数量级**：GRASP 把 CDCL 主循环搞定后，Chaff 没改算法，只换两个数据结构就跨了 100×。"算法决定上限，工程决定下限"在这个 case 反过来——上限早就到了，工程把下限也顶到上限。
2. **State independent 是个值得记住的设计原则**：VSIDS 计数器不依赖当前赋值，就避免了回溯维护成本。Watched literals 同样——回溯零开销因为状态本来就不需要修。
3. **简单数据结构往往打败复杂的**：MOMS / Jeroslow-Wang 这些"看上去更聪明"的启发式被 VSIDS 简单粗暴的"+1 + 衰减"打败——因为成本太重时再聪明也跑不快。
4. **工程论文也是论文**：Chaff 没有定理也没有大新算法，仍然是被引最多的 SAT 论文之一。SAT 圈把它认作"现代 SAT 求解器工程范式起点"。

## 延伸阅读

- 论文 PDF：[Chaff DAC 2001](https://www.princeton.edu/~chaff/publication/DAC2001v56.pdf)（6 页，可读）
- MiniSat 600 行源码：[minisat.se](http://minisat.se/) —— 把 Chaff 的工程经验压到教学级
- 教材：Biere et al. *Handbook of Satisfiability*（2009 / 2021，CDCL 与 watched literals 详细推导）
- 视频：Knuth *SAT Solvers* Stanford 2015 公开课
- [[marques-silva-grasp-1996]] —— Chaff 的算法母体，CDCL 主循环
- [[dpll-1962]] —— 再上一代，回溯式 SAT
- [[davis-putnam-1960]] —— 最初的归结式 SAT
- [[biere-bmc-1999]] —— Chaff 在硬件验证上的最大应用场景

## 关联

- [[marques-silva-grasp-1996]] —— Chaff 直接继承 GRASP 的 CDCL 算法骨架
- [[dpll-1962]] —— GRASP 与 Chaff 共同的算法祖先
- [[davis-putnam-1960]] —— SAT 求解的奠基论文
- [[biere-bmc-1999]] —— BMC 把硬件展成 SAT，Chaff 后裔在底下跑
- [[clarke-cegar-2003]] —— CEGAR 抽象细化每轮调一次 CDCL
- [[cook-levin]] —— SAT 是 NP-完全，Chaff 工程化让"难"在工业实例上失效

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[minisat-2003]] —— MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
- [[nelson-oppen-1979]] —— Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"
- [[nieuwenhuis-dpll-t-2006]] —— Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认

