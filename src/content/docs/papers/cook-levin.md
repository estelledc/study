---
title: "Cook-Levin 定理"
description: "1971 年 Cook（与 Levin 1973 独立）证明 SAT 是 NP-complete，奠定计算复杂性理论。任何能在多项式时间验证答案的问题，都能多项式归约到 SAT。"
来源: "Cook, S. The Complexity of Theorem Proving Procedures. STOC 1971; Levin, L. Universal Sequential Search Problems. Problemy Peredachi Informatsii 1973"
arxiv: "https://dl.acm.org/doi/10.1145/800157.805047"
难度: "D（理论奠基 / 状元篇）"
分支: "theory"
round: 125
series: "AA3"
关键词:
  - NP-complete
  - SAT
  - 多项式归约
  - P vs NP
  - 计算复杂性
状态: "已精读"
---

## 一句话先讲什么

Cook-Levin 定理：**SAT 是第一个 NP-complete 问题**——任何 NP 问题（"答案容易验证"的问题）都可以在多项式时间内归约到布尔可满足性。

直观比喻：一个国家有几千种方言，每种方言都有"难懂的词"。Cook-Levin 说：所有方言的难词都可以翻译成普通话的难词；反过来，只要解决了普通话的难词，所有方言的难词就都解决了。SAT 就是这门"普通话"。

如果你能在多项式时间解 SAT，你就能在多项式时间解所有 NP 问题（即 P = NP）。如果 SAT 没有多项式算法，那 NP 中很大一类问题都没有多项式算法（即 P ≠ NP）。

## 论文与作者

| 维度 | 内容 |
|---|---|
| Cook 论文 | "The Complexity of Theorem Proving Procedures", STOC 1971，10 页 |
| Levin 论文 | "Universal Sequential Search Problems", Problemy Peredachi Informatsii 1973，2 页 |
| Stephen Cook | 1939 年生，加拿大计算机科学家，多伦多大学教授，1982 年图灵奖 |
| Leonid Levin | 1948 年生，俄裔美国，波士顿大学教授，2012 年 Knuth 奖 |
| 命名 | "Cook-Levin theorem" 是 1980 年代后逐渐确立的合称 |

冷战时期 Levin 在苏联用俄语发表，西方学界 1980 年后才知道。两人独立工作，结果数学等价。

## 时代背景：1970 年前后

- 1936：Turing/Church 解决可计算性（停机问题不可判定）
- 1965：Hartmanis-Stearns 时间层次定理；Edmonds 提出 "good algorithm = polynomial time"
- 1970 前后：研究焦点从"什么可计算"转向"什么可在合理时间计算"

未解的核心问题：

- 哪些"看起来难"的问题，实际只是没找到好算法？
- 哪些问题"本质难"，没有多项式算法存在？

Cook 1971 给出回答框架的第一砖：**定义 NP-complete + 证明 SAT 是 NP-complete**。紧接着 Karp 1972 给 21 个 NP-complete 问题，归约工具箱建立。

## 核心概念

### Definition 3.1（P 类，确定性多项式时间）

**P** = { L | 存在确定性图灵机 M 和多项式 p，使 M 在 O(p(\|x\|)) 时间内判定 x ∈ L }

直观：**能在多项式时间内求解**的判定问题。

例子：

- 排序：O(n log n)
- 矩阵乘法：O(n^2.37)（Strassen 系列）
- 最短路径（Dijkstra）：O((n + m) log n)
- 最大流（Edmonds-Karp）：O(n m^2)
- 素性判定（AKS 2002）：O(log^12 n)，2002 年才证明 PRIMES ∈ P

### Definition 3.2（NP 类，非确定性多项式时间）

**NP** = { L | 存在非确定性图灵机 M 和多项式 p，使 M 在 O(p(\|x\|)) 时间内判定 x ∈ L }

等价（更直观）的"证书"定义：

**NP** = { L | 存在多项式时间验证器 V 和多项式 p，使 x ∈ L ⟺ ∃y (\|y\| ≤ p(\|x\|) ∧ V(x, y) 接受) }

直观：**有"证书"y，给定证书可以在多项式时间验证**。

例子：

- SAT：证书 = 满足赋值，验证 = 代入算 φ
- Hamiltonian Cycle：证书 = 一条回路，验证 = 检查每点恰好一次
- Subset Sum：证书 = 一个子集，验证 = 求和
- 整数分解：证书 = 因子，验证 = 乘法
- Graph Isomorphism：证书 = 顶点映射，验证 = 检查保边

### Definition 3.3（多项式归约 ≤_p）

L1 ≤_p L2 ⟺ 存在多项式时间可计算函数 f，使 ∀x: x ∈ L1 ⟺ f(x) ∈ L2

直观：**把 L1 的实例翻译成 L2 的实例，翻译过程多项式时间，答案保持一致**。

性质：

- 自反：L ≤_p L
- 传递：L1 ≤_p L2 ∧ L2 ≤_p L3 ⟹ L1 ≤_p L3
- 不对称：L1 ≤_p L2 不必然 L2 ≤_p L1
- 保 P：L1 ≤_p L2 ∧ L2 ∈ P ⟹ L1 ∈ P

### Definition 3.4（NP-hard）

L 是 **NP-hard** ⟺ ∀L' ∈ NP, L' ≤_p L

直观：**至少和 NP 中最难的问题一样难**。

注意：

- NP-hard **不要求** L ∈ NP
- 停机问题是 NP-hard 但不可判定（连 EXPTIME 都不在）
- "至少一样难"≠"在 NP 内"

### Definition 3.5（NP-complete）

L 是 **NP-complete** ⟺ L 是 NP-hard **且** L ∈ NP

直观：**NP 类中最难的那一档**。

如果 L 是 NP-complete 且 L ∈ P，那 P = NP（因为所有 NP 问题归约到 L，L 又在 P 里，所以所有 NP 问题在 P）。

## Cook-Levin 主定理

### Theorem 4.1（Cook 1971，主定理）

**SAT 是 NP-complete。**

形式：SAT = { φ | φ 是合取范式 (CNF) 布尔公式且存在赋值满足 φ }

证明 = 证两件事：

1. SAT ∈ NP（证书 = 赋值，验证 = 代入算）
2. ∀L ∈ NP, L ≤_p SAT（核心难点）

### Theorem 4.2（Levin 1973，独立等价）

**Universal sequential search problem 是 NP-complete。**

Levin 用了不同的术语和证明思路（基于通用搜索，更接近停机问题的味道），但与 Cook 定理数学等价。Levin 论文给出 6 个"universal search problems"：tiling、tautology、graph isomorphism、subgraph isomorphism、sat、最短列表生成。

### Theorem 4.3（Karp 1972，跟进）

以下 21 个问题都是 NP-complete：

- 3-SAT
- Vertex Cover, Clique, Independent Set, Set Cover
- Hamiltonian Cycle, TSP（决策版本）
- Subset Sum, Knapsack（决策版本）
- Graph Coloring, 3-DM, Partition
- Max Cut, Steiner Tree, ...

意义：**归约工具箱建立**。证明 X 是 NP-complete 不再需要从 NP 一般定义出发，只需 reduce 一个已知 NP-complete 问题（通常是 3-SAT）到 X。

### Theorem 4.4（Time Hierarchy，Hartmanis-Stearns 1965）

如果 f, g 是时间可构造函数且 f(n) log f(n) = o(g(n))，那 DTIME(f(n)) ⊊ DTIME(g(n))。

推论：P ⊊ EXPTIME（已证）。

这告诉我们"时间多了一定能解决更多问题"——但 P vs NP 这种"内"层级关系不能用时间层次定理解决。

### Theorem 4.5（Ladner 1975）

如果 P ≠ NP，那存在 L ∈ NP 使 L ∉ P **且** L 不是 NP-complete（"NP-intermediate"）。

候选 NP-intermediate：

- Graph Isomorphism（2015 年 Babai 证明 quasi-polynomial）
- Integer Factorization（既不在 P 已知，也未证 NP-complete）

## 证明大纲：SAT 是 NP-complete

设 L ∈ NP，由非确定性图灵机 M 在 p(n) 步内识别。给定输入 x（|x| = n），构造 CNF φ\_{M,x} 使：

φ\_{M,x} 可满足 ⟺ M 接受 x ⟺ x ∈ L

### 构造步骤

1. **变量**：每个时刻 t（0 ≤ t ≤ p(n)），每个带子位置 i（1 ≤ i ≤ p(n)），每个带子符号 s ∈ Γ：

   - T[i, t, s]：时刻 t 位置 i 的符号是 s
   - H[i, t]：时刻 t 头在位置 i
   - Q[t, q]：时刻 t 状态是 q

   总变量数：O(p(n)^2 · |Γ| · |Q|) = O(p(n)^2)

2. **子句强制**：

   - **初始格局正确**：T[i, 0, ...] 与 x 匹配，H[1, 0] = true，Q[0, q_0] = true
   - **唯一性**：每时刻每位置只能一个符号；每时刻只能一个状态；每时刻头只能一个位置
   - **非头位置不变**：H[i, t] = false ⟹ T[i, t, s] ⟺ T[i, t+1, s]
   - **转移合法**：根据 M 的转移表，写出 (Q[t, q] ∧ T[H[t], t, s]) ⟹ (Q[t+1, q'] ∧ T[H[t], t+1, s'] ∧ H[t+1, ...])
   - **接受**：∃t, Q[t, q\_accept] = true

3. **规模**：O(p(n)^2) 个变量，O(p(n)^2) 个子句，每子句 O(1) 长度

4. **构造时间**：O(p(n)^2)，多项式

5. **正确性**：

   - 若 M 接受 x：取一条接受路径，对应赋值满足所有子句 → φ 可满足
   - 若 φ 可满足：从赋值反推格局序列，是 M 在 x 上的合法接受路径 → M 接受 x

### 关键洞察

整个构造是"图灵机执行轨迹"的布尔编码。SAT 之所以"通用"，是因为它能表达**任意有限状态系统的局部转移**。

## SAT → 3-SAT：归约的最小例子

证明 3-SAT 仍然是 NP-complete（从 SAT 归约到 3-SAT）：

子句长度 > 3 时拆分：

```
(x1 ∨ x2 ∨ x3 ∨ x4)
⟺
(x1 ∨ x2 ∨ y) ∧ (¬y ∨ x3 ∨ x4)
```

引入辅助变量 y，每次拆 1 个，总共 O(k) 拆分（k 是子句长度），多项式时间完成。

子句长度 < 3 时填充重复变量，padding 到长度 3。

结论：SAT ≤_p 3-SAT，3-SAT ∈ NP，故 3-SAT 也是 NP-complete。

这是"reduce 一个已知 NP-complete 问题"工具箱的第一例。

## 复杂度类层次图

参见图 `/papers/cook-levin/01-sat-reduction.webp`。

层次（已知或假设）：

```
P ⊆ NP ⊆ co-NP ⊆ PH ⊆ PSPACE ⊆ EXPTIME ⊆ EXPSPACE ⊆ ...
                                    ⊆
                                    R    （可判定）
                                    ⊆
                                    RE   （递归可枚举，停机问题在此）
```

已证：

- P ⊊ EXPTIME（time hierarchy theorem）
- PSPACE ⊊ EXPSPACE（space hierarchy theorem）
- R ⊊ RE（停机问题不可判定）
- L ⊆ NL ⊆ P（空间到时间转换）

未证：

- P vs NP（千禧年问题）
- NP vs co-NP（NP 是否对补封闭）
- NP vs PSPACE
- PH 是否塌陷到某个有限层

## 影响：开启计算复杂性理论

1971 之前：复杂度模糊；"难"靠直觉。

1971 之后：

1. **NP-complete 成"难"的标尺**：算法学家证明问题难，第一反应是 reduce 一个 NP-complete 问题过来。
2. **大量条件命题**：算法论文充斥"如果 P ≠ NP，那么这个问题没有 polynomial algorithm"。
3. **密码学奠基**：现代密码（RSA、椭圆曲线、格密码）依赖 P ≠ NP（更具体是 factoring ∉ P 等单向函数假设）。
4. **近似算法兴起**：既然 NP-hard 求最优解难，那就求近似。PCP 定理（1992）刻画了哪些问题"连近似都难"。
5. **随机算法兴起**：BPP（多项式时间随机）vs P 的关系，去随机化研究方向。
6. **参数化复杂度**：W[1]、W[2] 层次，FPT vs NP-hard。
7. **量子复杂度**：BQP vs NP，Shor 算法的影响。

简言之：**整个 1970 年后的算法理论都站在 Cook-Levin 之上**。

## 实际 SAT solver

理论上 SAT 是 NP-complete（最坏情况指数）。实际：现代 SAT solver 在工业问题上每秒能处理百万级子句。

### 主要技术演进

| 技术 | 时代 | 核心 idea |
|---|---|---|
| Davis-Putnam | 1960 | 决议 + 变量消去（resolution） |
| DPLL | 1962/63 | 分支 + 单元传播 + 纯文字消去 |
| CDCL | 1996+ | 冲突驱动子句学习 + 非时序回溯 + VSIDS 启发式 |
| Local Search | 1990s | WalkSAT、随机翻转 |
| Look-ahead | 1990s | March、Lookahead solvers |
| Inprocessing | 2010s | 求解过程中持续简化 |

CDCL 是当前主流：CryptoMiniSat、CaDiCaL、Glucose、MiniSat 全是 CDCL 系。

### 著名 SAT solver

- **CryptoMiniSat**（msoos）：CDCL + Gaussian elimination + 多线程，适合密码分析场景
- **Z3**（Microsoft Research）：SMT solver，包含强 SAT 引擎；广泛用于程序验证、定理证明
- **CaDiCaL**（arminbiere）：极简 CDCL，约 2.5 万行 C++，多次 SAT competition 冠军；最适合学习 modern SAT solver

## 怀疑章节

### 怀疑 1：P vs NP 为什么 50 年悬而未决

Cook 1971 提出，2026 年仍未解决。Clay Mathematics Institute 100 万美元悬赏（千禧年问题之一）。

**已知三大障碍（barriers）：**

**Relativization barrier**（Baker-Gill-Solovay 1975）：

- 存在 oracle A 使 P^A = NP^A（如 EXPTIME-complete oracle）
- 存在 oracle B 使 P^B ≠ NP^B（如随机 oracle）
- 任何"相对化"证明无法分离 P 和 NP（因为相对化在两边都成立）
- 排除了大多数模拟、对角化技术

**Natural proofs barrier**（Razborov-Rudich 1997）：

- "自然"证明的定义：constructive + large（在 boolean function 集合上）
- 如果存在自然证明 P ≠ NP，那伪随机生成器就不存在
- 但人们普遍相信伪随机生成器存在（密码学的基础）
- 排除了大多数电路下界技术

**Algebrization barrier**（Aaronson-Wigderson 2009）：

- 相对化的代数推广（low-degree extensions）也无法解决
- 排除了 IP = PSPACE 那一类代数证明技术

剩下的"非相对化、非自然、非代数化"的证明技术几乎不存在。

我自己的怀疑：

- **也许 P vs NP 在 ZFC 中独立**：Cook 在采访中说过这种可能性
- 如果独立，问题本身没有"答案"，只能在更强公理系统中讨论
- 这种情况在数学里有先例（AC、CH 在 ZF 独立）但稀少
- 一旦确认独立，"P vs NP" 就变成了一个新的公理选择问题

### 怀疑 2：实际 SAT solver 效率为什么这么高

理论：worst case 指数。实际：CryptoMiniSat / CaDiCaL 经常秒级解决百万变量的工业实例。

这个 gap 巨大，让人怀疑 NP-complete 这个分类对"实际难度"的指导意义。

可能解释：

- **工业 SAT 实例有结构**：来自硬件验证、定理证明、规划，不是均匀随机
- **CDCL 利用结构**：冲突子句学习实际是对实例骨架的归纳
- **Phase transition**：随机 SAT 在 clause/variable ratio ≈ 4.27 处最难，工业实例往往不在这个比例
- **Tree-like vs DAG**：工业实例的解空间有 DAG 结构，传统下界（resolution width）不严

但这不能消除疑虑：如果**实际相关**的 SAT 实例都"容易"，那 NP-complete 的"难"指什么？

我倾向于：

- NP-complete 给出 **worst-case 上界**
- 实际 SAT 是 **average-case** 容易（在工业分布上）
- Average-case 复杂度（Levin 1986）是另一个分支，更贴近实际，但发展缓慢

哲学问题：**理论用 worst case 是不是过分悲观了？** 这个 gap 本身就是研究 distributional NP 的动力。

### 怀疑 3：量子算法对 SAT 没有指数加速

Shor 1994：分解 / 离散对数 → 量子多项式时间（因为有"周期性结构"）。
Grover 1996：无序搜索 → 平方加速（√N 而非 log N）。

SAT：目前最好的量子算法是 Grover 类型，给出 2^(n/2) 而不是经典 2^n。**没有指数加速**。

为什么？

- SAT 看起来"没有代数结构"，至少没找到
- Grover 是"oracle 模型"的下界（√N 已最优）
- 真要指数加速，需要找到 SAT 的隐藏对称 / 周期 / 群结构

如果 SAT ∈ BQP（量子多项式），那 NP ⊆ BQP，整个理论格局会被颠覆——但目前 30 年没人做到。

我猜：SAT "结构无关性"是它真正难的原因——分解问题难是表面，因为有周期性可以利用；SAT 难是骨子里的，因为它就是"通用搜索"的化身。

### 怀疑 4：机器学习时代是 P vs NP 的新角度吗

LLM / 神经网络近似某些 NP-hard 问题（TSP、SAT、bin packing、graph coloring）效果不错。

例子：

- **NeuroSAT**（Selsam 2018）：用图神经网络解 SAT，小实例上 90%+ 准确率
- **Pointer Networks** / Ptr-Net：解 TSP、convex hull 等组合问题
- **LLM 解 24-game、数独、sudoku**：通过 chain-of-thought 给出近似解

但：

- 神经网络是 **heuristic**，不是 worst-case 多项式算法
- 它给出"在分布 D 上 average-case 多项式 + 高准确率"
- 这正是 average-case 复杂度的范畴，不改变 P vs NP 本身

ML 角度的潜在贡献：

- 工程上证明"实际相关的 SAT 实例"远比 worst-case 容易
- 提供新的 average-case 分析工具（learnable distributions）
- 可能引出新的 complexity class（如 learnable-NP、smoothed complexity）

我猜未来 10 年：

- worst-case P vs NP 仍顽固未解
- average-case + ML 出重要结果
- 也许新的 complexity class 把"实际可解 vs 实际不可解"刻画得更精

但这不会替代 P vs NP。它只是一个补充视角。

## 实际 SAT solver 源码（学习入口，permalinks）

下面三个 permalink 是从仓库 HEAD 抓取的真实 commit SHA（40-char hex），直接点开就是当时锁定的版本。

### CryptoMiniSat 主求解循环

`https://github.com/msoos/cryptominisat/blob/a0466954fd8dc14c5ac68053ce00ecdcfa399a68/src/solver.cpp`

CDCL 主循环 + Gaussian elimination 集成 + 多线程子句共享。

读这个适合：理解 CDCL 完整 pipeline、了解高级技术（Gauss、对称破坏）。

### Z3 SAT 内核

`https://github.com/Z3Prover/z3/blob/b74e35f4fba5bca70d0b6443a40250314f36fe25/src/sat/sat_solver.cpp`

微软研究院 SMT solver 的 SAT 内核，是工业级 SMT 系统的底层引擎。

读这个适合：理解工业级 SAT 的工程化（增量求解、内存管理、统计）。

### CaDiCaL 内部循环

`https://github.com/arminbiere/cadical/blob/7b99c07f0bcab5824a5a3ce62c7066554017f641/src/internal.cpp`

极简 CDCL 实现，约 2.5 万行 C++，多次 SAT competition 冠军。

读这个最适合学 modern SAT solver 架构。从 propagate() / analyze() / decide() / restart() 入手即可看清主循环。

## 学习路径建议

### 零基础

1. Sipser《Introduction to the Theory of Computation》第 7 章
2. MIT 6.045 公开课
3. Cook 1971 原论文（10 页）
4. Karp 1972 论文（21 问题归约）
5. 装 Z3 / CaDiCaL，跑几个 benchmark
6. 读 CaDiCaL 源码 internal.cpp（约 2000 行 main loop）

### 数学背景路线

1. Arora-Barak《Computational Complexity: A Modern Approach》
2. Goldreich《Computational Complexity》
3. Pudlák《Logical Foundations of Mathematics and Computational Complexity》

### 实战路线

1. 装 PySAT / Z3py
2. 把数独编码成 SAT，用 solver 解
3. 把图着色编码成 SAT
4. 自己写一个 toy DPLL solver（200 行 Python）
5. 改 toy DPLL 加上 conflict learning（变成 toy CDCL）
6. 用 toy CDCL 解 SAT competition 的小实例

## 与其他论文的关系

| 论文 | 关系 |
|---|---|
| Turing 1936 | 给出可计算性框架；Cook-Levin 在此基础上给"可计算的难度"框架 |
| Hartmanis-Stearns 1965 | Time hierarchy theorem；P ⊊ EXPTIME；为复杂度类提供基础工具 |
| Edmonds 1965 | 提出 polynomial = good algorithm 的论断 |
| Karp 1972 | 紧接 Cook，给 21 个 NP-complete 问题，归约工具箱建立 |
| Ladner 1975 | NP-intermediate 存在性 |
| Cobham 1965 | 定义 P 类的另一独立尝试 |
| Razborov-Rudich 1997 | Natural proofs barrier，解释为什么 P vs NP 难证 |
| Aaronson-Wigderson 2009 | Algebrization barrier |
| AKS 2002 | PRIMES ∈ P 的具体例子，说明"看起来 NP-intermediate"的问题最终掉进了 P |
| Babai 2015 | Graph Isomorphism quasi-polynomial 算法 |

## 一句话总结

Cook-Levin 把"难"变成可数学化的对象——通过 SAT 这个"通用难题"，把所有 NP 问题统一到一个标尺下。50 年后 P vs NP 仍是数学界最深奥的问题之一，但它定义的工具箱已支撑了密码学、算法理论、复杂度分析的整个生态。

如果让我用一句话告诉本科生：**"Cook-Levin 给了你一把万能尺，量出了一类问题的本质难度"**。

## 附录：Cook 原论文片段

Cook 1971 的核心定理是：

> Theorem 1. If a set S of strings is accepted by some non-deterministic Turing machine within polynomial time, then S is P-reducible to {DNF tautologies}.

注意：

- Cook 用的是 **DNF tautologies**（永真问题），而不是 CNF satisfiability
- 两者等价（取否定即可），后人为方便统一用 SAT
- "P-reducibility" 是 Cook 当时的术语，对应今天的 polynomial-time many-one reduction

## 附录：Levin 原论文翻译片段

Levin 1973 用俄语发表，1986 由 Trakhtenbrot 翻译成英文。核心结果：

> Theorem. There exists a problem that is universal for the class of search problems solvable in polynomial time on a non-deterministic Turing machine.

Levin 给出 6 个问题作为"universal search problems"：

1. Tiling
2. Tautology
3. Graph Isomorphism（注意！）
4. Subgraph Isomorphism
5. Sat
6. 最短列表生成

注意：Levin 把 Graph Isomorphism 列为 universal，但今天我们知道 GI 不太可能是 NP-complete（Babai 2015 给出 quasi-polynomial 算法）。这是 Levin 论文的一个小瑕疵，反映了 1973 年时该问题的复杂度尚未明朗。

## 附录：常见误解澄清

| 误解 | 实际 |
|---|---|
| "NP 是 non-polynomial 的缩写" | 错。NP = Nondeterministic Polynomial |
| "NP-hard 一定在 NP 内" | 错。停机问题 NP-hard 但不可判定 |
| "P = NP 已被证伪" | 错。仍是开放问题 |
| "量子计算机能解所有 NP 问题" | 错。Grover 只给平方加速，BQP vs NP 关系未知 |
| "实际 SAT 实例都难" | 错。工业 SAT 实例往往秒级可解 |
| "如果 P = NP，密码学就完蛋" | 部分对。但还要看具体的多项式次数和常数 |

## 附录：和深度学习的潜在交叉

近年研究方向：

1. **NeuroSAT 系列**：用 GNN 解 SAT，能学到 unit propagation 等基本规则
2. **Learning to Branch**：用 RL 学习 SAT solver 的分支启发式（替代 VSIDS）
3. **DiffSat**：可微化 SAT，作为神经网络的 differentiable layer
4. **LLM as solver**：直接 prompt LLM 解组合问题，作为 zero-shot baseline

这些方法都没有打破 P vs NP，但提供了"average-case 上更高效"的实际工具。它们的理论意义有待 distributional complexity 框架进一步刻画。

## 附录：自测题（5 分钟）

1. P 类的两种定义是？
2. NP 的"证书"定义和"非确定性图灵机"定义为什么等价？
3. NP-hard 和 NP-complete 区别在哪？
4. 多项式归约 ≤_p 满足哪些性质？
5. 为什么 SAT ≤_p 3-SAT 的归约必须保证 size 多项式？
6. Time hierarchy theorem 给出什么？为什么不能用它解决 P vs NP？
7. Relativization barrier 排除了什么类型的证明？
8. 为什么实际 SAT solver 在 NP-complete 问题上效率高？
9. Grover 算法对 SAT 给出什么加速？为什么不是指数？
10. NP-intermediate 的两个候选是什么？

如果上面 10 题能答出 7 题以上，说明 Cook-Levin 这一篇基本掌握。
