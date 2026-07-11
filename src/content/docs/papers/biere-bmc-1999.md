---
title: Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
来源: 'Biere, Cimatti, Clarke, Zhu, "Symbolic Model Checking without BDDs", TACAS 1999'
日期: 2026-05-30
分类: 形式化方法
难度: 中级
---

## 是什么

Bounded Model Checking（**BMC**）是一种**只看前 k 步**的硬件验证方法：把电路展开 k 个时钟周期、把要检查的属性反过来写，拼成一道布尔可满足性（SAT）题，丢给 SAT solver 判定。

日常类比：你不试图穷举一个 10 万人小镇所有可能犯罪剧情（BDD 路线，算到内存爆炸），而是只问"未来 20 天内有没有人能合法路径走到犯罪现场"。如果 SAT solver 给你一组"是的，第 17 天的赋值就是反例"，你就抓到了 bug；如果它说"unsat"，你知道未来 20 天太平。

```
电路 M  +  ¬属性 φ  +  界限 k  →  一条 CNF 公式  →  SAT solver
                                     ├ sat   → 找到反例（长度 ≤ k）
                                     └ unsat → k 步内没发现反例
```

这一招让 1999 年的硬件验证从"BDD 拼内存"切换到"SAT 拼搜索"，并直接催生了 CBMC、NuSMV、EBMC 这一票工业工具。

更直白一点：BDD 想一次性把"所有可能的状态"压成一棵决策图，状态多了图就爆；BMC 不压全图，只问"有没有一条 ≤k 步的反例路径"——把搜索空间砍成一片片，每片交给 SAT solver 单独啃。

## 为什么重要

不理解 BMC，下面这些事都没法解释：

- 为什么 SAT solver 会成为 EDA 行业的"主力发动机"——明明它解的是 NP-完全问题
- 为什么 CBMC 能直接对 C 代码跑形式化验证，而不需要先证明终止性
- 为什么硬件 bug 经常在"第 17 个周期"才暴露，而 BMC 正好擅长这种深度
- 为什么 1999 年之后形式验证论文标题里 "BDD" 越来越少、"SAT/SMT" 越来越多
- 为什么 fuzzing / 符号执行 / model checking 这些看似各做各的工具，今天都在底层共用同一个 SAT/SMT solver

## 核心要点

BMC 把模型检查问题压成 **三件零件 + 一条公式**：

1. **电路展开（unroll）**：状态向量 s₀, s₁, ..., s_k 各占一组布尔变量；transition relation T(sᵢ, sᵢ₊₁) 复制 k 份串起来。类比：把"今天→明天"这条规则贴 k 张，拼成一条 k 天日记的填空题。

2. **属性取反（negate）**：要验证"永远不会发生坏事"，就让 solver 找一条**真的发生坏事**的路径。SAT 找到一组赋值 = bug 反例；找不到 = k 步内安全。

3. **界限选择（bound）**：k 太小漏 bug，k 太大公式爆炸。完备性 threshold = 状态空间的"直径"——超过直径还 unsat 就真安全，但直径在大电路上自己也难算，工业上常用启发式逐步加大 k。

整套公式形如 `I(s₀) ∧ ⋀ T(sᵢ, sᵢ₊₁) ∧ ⋁ ¬φ(sᵢ)`——初始 + 转换 + 任一步坏属性。

## 实践案例

### 案例 1：硬件流水线转发 bug

一条 5 级流水线 CPU，怀疑 forward 单元在某种 hazard 下漏一个寄存器。展开 6 个周期，把寄存器一致性属性 `assert reg_arch == reg_committed` 取反编码：

```
unroll 6 cycles → 60 万子句 CNF
SAT solver 跑 4 秒 → 给出反例：
  cycle 0: ADD r1,r2,r3
  cycle 1: SUB r4,r1,r5  (依赖 r1)
  cycle 2: forward 单元选错来源
  cycle 3: r4 = 旧值
```

BDD 路线在这条 60 万子句上要构造的中间 BDD 节点数会爆 8GB；SAT solver 用学习子句剪枝，4 秒搞定。BMC 不仅找到 bug，还把那条具体路径还原出来，工程师顺着波形图往回看，立刻定位到 forward 单元的优先级写错了。

### 案例 2：CBMC 检查 C 代码 assert

```c
int abs(int x) {
    if (x < 0) return -x;
    return x;
}
// __CPROVER_assert(abs(x) >= 0, "abs always non-negative");
```

CBMC 把循环 unwind 到指定深度，把每条 C 语句翻译成 bit-vector 约束，再调用 MiniSAT。结果：找到反例 `x = INT_MIN`，因为 `-INT_MIN` 在补码下溢回 `INT_MIN`，仍 < 0。BMC 用同一套机制查软件 bug——把硬件用的"unroll + SAT"原班搬到 C 程序，循环展开次数代替时钟周期数。

### 案例 3：协议状态机活性查反例

TCP 三次握手建模：状态 = {CLOSED, SYN_SENT, SYN_RCVD, ESTABLISHED}。验证"丢包不会卡死"——unroll 10 步，问"有没有一条路径从 SYN_SENT 走 10 步还没出 SYN_SENT"。SAT 给反例：连续 10 次 RST → 真的卡住。

这是工程师拿来反向构造攻击场景的常用姿势：你不证全宇宙安全，你问"有没有一条让我难堪的路径"，SAT 帮你找。

## 踩过的坑

1. **k 选小了给假安全感**：bug 在第 k+1 步出现，BMC 报 unsat 你以为电路对了，量产后才炸。完备性需要 k ≥ recurrence diameter，但这个值在大电路上自己也难算。

2. **公式爆炸但 solver 没准备好**：transition relation 如果用 Tseitin 转 CNF 没共享子表达式，k=20 的 unroll 能产生几千万子句，老 SAT solver 直接 OOM。后来 incremental SAT（每加 k 一步增量加约束）才解决。

3. **liveness 属性不擅长**：BMC 天生擅长 safety（坏事不发生），但 liveness（好事终究发生）需要 lasso 形式编码——找一条到环的路径，难度跳一档，工业上更多走 IC3 / k-induction。

4. **SAT 编码细节决定生死**：bit-vector 加法用 ripple-carry 还是 Sklansky、记忆化是否共享、变量序怎么排——同一道问题不同编码能差 1000 倍跑时。这成了一门工程手艺，boolector / Yices / Z3 这些 SMT solver 都在卷各自的 bit-blasting 策略。

5. **隐含界限要写对**：BMC 公式里"k 步内坏属性出现一次即可"的 ⋁ 范围常被新手写成 ⋀（"每一步都坏"），SAT 立刻 unsat 给假阳性。一字之差。

## 适用 vs 不适用场景

**适用**：
- 硬件验证 / 找 bug：尤其是 BDD 跑爆但 bug 深度不超过 50-100 步的电路
- 软件 BMC：循环可 unwind、无递归、深度可控的 C 程序（CBMC 的主战场）
- 反例驱动调试：你怀疑某场景有 bug，让 SAT 帮你构造具体输入
- 测试用例自动生成：把 coverage 目标取反成"找一条覆盖此分支的输入"

**不适用**：
- 完备性证明 + 状态空间巨大：直径未知的复杂协议，BMC 给不出"全宇宙安全"的保证 → 用 IC3 / interpolation
- 活性属性为主：BMC 编 lasso 笨重 → SPIN / Büchi 自动机更顺手
- 连续动力系统 / 实数域：BMC 是布尔的，混合系统要走 SMT（Z3、dReal）
- 程序循环不可静态界定：unroll 不下来时只能换抽象解释
- 状态空间小且 BDD 表现良好：状态变量少、变量序友好的电路，BDD 一次给完备答案反而更省事

## 历史小故事（可跳过）

- **1981 年**：Clarke 和 Emerson 提出显式状态模型检查；同期 Queille-Sifakis 独立发表。状态空间几千就跑爆。
- **1986 年**：Bryant 发明 ROBDD，让符号化布尔函数有了紧凑表示；McMillan 1993 在 CMU 用它造 SMV，工业起飞。
- **1990s 末**：芯片规模冲到几十万门，BDD 内存曲线开始扛不住；同时 GRASP（1996）、SATO（1997）让 SAT solver 能处理上万变量。
- **1999 年**：Biere、Cimatti、Clarke、Zhu 在 TACAS 把 BMC 提出来——一条 14 页论文，把"SAT 替代 BDD"这条路点亮。
- **2001-2003 年**：Chaff（VSIDS 启发式）、MiniSAT 把 SAT 性能再推一档；CBMC 开始用同一套思想验证 C 程序。
- **今天**：EDA 工业里 SAT/SMT 已经全面盖过纯 BDD；学界新方向 IC3、k-induction、interpolation 都建在 SAT solver 之上，但思路源头都能追到这篇 14 页 TACAS 论文。

## 学到什么

1. **换底层 solver 比改算法更猛**：BMC 没改 model checking 的语义，只把 BDD 换成 SAT，就让验证规模翻一两个数量级——找到正确的"杠杆原料"比卷算法更值钱。
2. **不完备 ≠ 没用**：BMC 不能证明无穷安全，但能在有限深度内可靠找 bug，这在工程上常常更值钱——能"找 bug 的工具"远比"能证明无 bug 但跑不出来的工具"实用。
3. **NP-完全问题在工业上是可解的**：SAT 是 NP-完全的代表，但靠 CDCL + VSIDS + restart，实际工业实例上跑得飞快——理论难度和实战可行性是两件事。
4. **形式化方法的工业落地依赖工具链**：BMC 论文 1999 出来，工业普及要等 MiniSAT (2003) + CBMC (2005) + NuSMV2 (2002) 一整套生态成熟。
5. **"有界版本"是研究上的常用招数**：把无限/无界问题截到有限版本求解，再讨论何时能扩展回完备——这套思路在程序分析、机器学习、规划领域都反复出现。

## 延伸阅读

- 论文 PDF：[Biere et al. 1999 — Symbolic Model Checking without BDDs](https://www.cs.cmu.edu/~emc/papers/Conference%20Papers/Symbolic%20Model%20Checking%20without%20BDDs.pdf)（14 页 TACAS 原文）
- 教程综述：[Biere — Bounded Model Checking](https://www.in.tum.de/fileadmin/w00bws/i21/teaching/ws-2018/handbook/handbook-of-satisfiability/06_BMC.pdf)（Handbook of Satisfiability 第 6 章，体系化讲解）
- 工具上手：[CBMC 官网](https://www.cprover.org/cbmc/)（C/C++ BMC，开箱即用）
- SAT solver 后续：[MiniSAT 论文](http://minisat.se/downloads/MiniSat.pdf)（让 BMC 真正起飞的 solver，代码不到 600 行）
- 视频导论：[Edmund Clarke 模型检查 50 年](https://www.youtube.com/results?search_query=Edmund+Clarke+model+checking+turing+lecture)（图灵奖讲座，BMC 在体系中的位置）
- [[mcmillan-smv-1993]] —— 它取代的对象，BDD-based 符号检查的工业代表
- [[clarke-emerson-1981]] —— 模型检查的起点
- [[cook-levin]] —— SAT 是 NP-完全的，但工业上靠 CDCL 跑得飞快

## 关联

- [[mcmillan-smv-1993]] —— BDD-based 符号检查；BMC 是它的 SAT 替代路线
- [[clarke-emerson-1981]] —— 模型检查的诞生论文，BMC 在它的 CTL 框架内做有界化
- [[pnueli-temporal-1977]] —— 时序逻辑 LTL 的源头，BMC 编码的是它的属性
- [[cook-levin]] —— SAT NP-完全的理论基础
- [[hoare-logic]] —— 程序正确性的另一条路（演绎证明 vs BMC 的搜索反例）
- [[cousot-abstract-interpretation]] —— 通过抽象证完备性，与 BMC 的"有界搜索"互补
- [[liquid-types]] —— 用类型系统而非 SAT 求解的另一条形式化路线
- [[fstar]] —— 把依赖类型 + SMT 自动化整合的语言，BMC 是它求解器层的兄弟

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astree]] —— ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告
- [[chaff-2001]] —— Chaff 2001 — 把 CDCL 工程化的两个杀手锏
- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[graf-saidi-1997]] —— Graf-Saïdi — 用谓词把无限状态压成有限抽象
- [[holzmann-spin-1997]] —— SPIN — 让计算机帮你穷举并发程序的所有可能执行
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[minisat-2003]] —— MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
- [[slam-microsoft]] —— SLAM — 让 Windows 驱动 bug 自己撞到工具上
- [[tla-yu-tlc-1999]] —— TLC — 让 TLA+ 规范可以一键机检的模型检查器
