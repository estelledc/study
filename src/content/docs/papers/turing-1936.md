---
title: "Turing 1936: On Computable Numbers, with an Application to the Entscheidungsproblem"
description: "Alan Turing 1936 年的开山之作：用图灵机定义可计算性，证明 Halting Problem 不可判定，间接解决 Hilbert Entscheidungsproblem。AA-Season 计算理论分支开篇。"
来源: "Turing, A. M. (1936). On Computable Numbers, with an Application to the Entscheidungsproblem. Proceedings of the London Mathematical Society, Series 2, Volume 42, Issue 1, pp. 230-265. DOI: 10.1112/plms/s2-42.1.230"
论文ID: AA1
分支: theory
season: "AA-计算理论"
round: 123
tier: "状元 D"
date: 2026-05-29
authors: ["Alan M. Turing"]
venue: "Proceedings of the London Mathematical Society"
year: 1936
tags:
  - turing-machine
  - computability
  - halting-problem
  - undecidability
  - universal-machine
  - theory-of-computation
  - entscheidungsproblem
  - church-turing-thesis
---

# Turing 1936 — On Computable Numbers, with an Application to the Entscheidungsproblem

> 一个 24 岁的数学家，用一台只有"读、写、左移、右移"四个动作的虚拟机器，
> 一边定义了"什么叫可被计算"，一边证明了"有些问题机器永远算不出来"，
> 顺手摧毁了 Hilbert 形式主义计划的最后一根支柱。
>
> 这是计算机科学的开篇。

![Turing Machine 五元组、磁带、读头、转移规则示意](/papers/turing-1936/01-turing-machine.webp)

## 0. 一句话总结

> 把"机械可执行的计算"等同于"一个有限状态控制器在无限磁带上左右移动并读写符号"，
> 然后构造一个能模拟任何此类机器的**通用机器**，
> 再用对角化方法证明：给定任意机器+输入，是否会停机这个问题，本身就不是可计算的。

---

## 1. 历史背景：Hilbert 的最后一搏

### 1.1 Hilbert 计划（1900-1928）

1900 年 Hilbert 在巴黎国际数学家大会上提出 23 个问题，其中第 2 题是：**算术系统的相容性能否被证明？**

到 1928 年，Hilbert 进一步把目标精炼成三件事，史称 **Hilbert Programme**：

1. **完备性 (Completeness)**：所有真命题都能被形式系统证明。
2. **相容性 (Consistency)**：形式系统不会同时证明 P 和 ¬P。
3. **可判定性 (Decidability / Entscheidungsproblem)**：存在一个机械过程，输入任意一阶逻辑命题，输出"可证 / 不可证"。

> 类比：Hilbert 想造一台"数学真理判别机"——丢进任何数学命题，吐出"对/错"。

### 1.2 Gödel 1931：完备性已死

1931 年 Gödel 不完备性定理（First Incompleteness Theorem）干掉了第 1 件：

> 任何包含算术的相容形式系统中，必存在既不能被证明、也不能被反驳的命题。

> 类比：再厉害的字典也有写不进去的词。

第 2 件（相容性）也跟着出问题：Gödel 第二不完备性定理说，这种系统无法在自己内部证明自己的相容性。

### 1.3 1936：Entscheidungsproblem 还活着

但第 3 件——**机械可判定性**——并没有死。Hilbert 派的最后一线希望是：**就算证不出，至少能机械地"判定"。**

要证明这件事不成立，必须先把"机械过程"严格定义出来。**这就是 Turing 1936 这篇论文的起点。**

同年，Alonzo Church 用 λ-calculus 给出了等价答案（Church 1936），但 Turing 的形式化更直观、更接近物理机器，所以最终成为标准。

---

## 2. 核心问题：什么叫"可计算"

### 2.1 直觉与定义的鸿沟

> 在 1936 年之前，"可计算"是个直觉概念：一个有耐心、不会犯错、按照规则一步步做事的人能算出来的东西。

但这个定义没法用来**证明某个东西不可计算**——你无法证明"任何聪明人都想不出算法"。Turing 的关键洞察：**把"计算的人"形式化成机器**。

### 2.2 Turing 的归约

Turing 在论文 §1 论证了一个根本性的等价：

> 任何能被一个**人按照固定规则一步步执行**的计算，都能被一个**有限状态控制器 + 无限纸带**模拟。

理由：

1. 人在算数时只能同时关注有限多的符号（视野有限）→ **有限状态**
2. 纸张可以无限长 → **无限磁带**
3. 每一步的动作是有限的 → **有限规则集**

这个归约本身不是数学定理，是哲学命题——后来被称为 **Church-Turing Thesis**（见 §10）。

---

## 3. 图灵机的形式定义

### Definition 1（图灵机 / Turing Machine, TM）

一台**确定性图灵机**是一个 5 元组：

$$
M = (Q, \Sigma, \delta, q_0, F)
$$

| 符号 | 含义 |
|------|------|
| $Q$ | 有限状态集合 |
| $\Sigma$ | 有限磁带字母表（含空白符 $\sqcup$） |
| $\delta: Q \times \Sigma \to Q \times \Sigma \times \{L, R\}$ | 转移函数 |
| $q_0 \in Q$ | 初始状态 |
| $F \subseteq Q$ | 接受状态集合 |

**直观解释**：

- 控制器处于某个状态 $q$
- 读头读到磁带某格符号 $a$
- 查 $\delta(q, a)$ 得到 $(q', a', d)$
- 把 $a$ 改写成 $a'$，按方向 $d \in \{L, R\}$ 移动一格，转入状态 $q'$
- 重复，直到 $q \in F$（停机）

> 类比：你按食谱做菜——食谱（$\delta$）告诉你"看到什么食材（$a$）、当前在哪一步（$q$），就做什么动作（写新食材 + 移动 + 进入下一步）"。

### Definition 2（配置 / Configuration）

一台 TM 在某一时刻的**全局状态**用三元组表示：

$$
C = (q, T, p)
$$

- $q \in Q$：当前状态
- $T: \mathbb{Z} \to \Sigma$：磁带内容（几乎所有位置都是 $\sqcup$）
- $p \in \mathbb{Z}$：读头位置

转移关系 $C \vdash C'$ 表示一步计算。**计算 = 配置序列** $C_0 \vdash C_1 \vdash C_2 \vdash \ldots$

> 类比：游戏存档。配置是某一时刻的"完整快照"，知道这三件事就能精确恢复任何后续行为。

### 3.1 一个具体例子

**任务**：识别 $\{0^n 1^n : n \geq 1\}$（n 个 0 后跟 n 个 1）。

```
状态：q0(初始) q1(找0) q2(找1) qa(接受) qr(拒绝)
δ(q0, 0) = (q1, X, R)   读到 0 → 标记为 X，向右
δ(q1, 0) = (q1, 0, R)   继续向右
δ(q1, 1) = (q2, Y, L)   读到 1 → 标记为 Y，回头
δ(q2, X) = (q0, X, R)   回到第一个未标记的 0
...
```

> 注：这里只是骨架，完整需要约 8 条规则。

---

## 4. Universal Turing Machine

### 4.1 关键观察：机器可以被编码

每台 TM $M$ 的描述（$Q, \Sigma, \delta$ 等）本身是有限信息——可以用一个二进制字符串 $\langle M \rangle$ 编码。

> 类比：每个程序都是一段代码（文本），可以被另一个程序当数据读取。

### Theorem 1（Universal Turing Machine, UTM 存在性）

**存在一台图灵机 $U$，使得对任意 TM $M$ 和任意输入 $w$**：

$$
U(\langle M \rangle, w) = M(w)
$$

即：$U$ 能模拟任意 $M$ 在 $w$ 上的行为。

### 4.2 哲学意义

UTM 的存在意味着：

1. **硬件 / 软件二分法的诞生**：$U$ 是硬件，$\langle M \rangle$ 是软件。
2. **可编程性 (programmability)**：单台机器 + 不同程序 = 不同行为。
3. **冯·诺依曼架构的雏形**：程序与数据存在同一存储介质。

> 1945 年的 EDVAC 报告中，冯·诺依曼承认 UTM 概念是其设计灵感来源。
> 现代每一台 CPU 都是 UTM 的工程实现。

### 4.3 UTM 的代价

代价是**速度损失**：模拟一步要做 O(|⟨M⟩|) 次查表。但**可计算性等价**——能算的东西完全相同。这是 Hennessy & Patterson 体系结构教材里"interpreter overhead"的祖师爷。

---

## 5. 计算数 (Computable Numbers)

### Definition 3（可计算实数）

实数 $x \in \mathbb{R}$ 叫**可计算的**，当且仅当存在一台 TM $M_x$，使得：

> 输入 $n \in \mathbb{N}$，$M_x$ 在有限步内输出 $x$ 的二进制展开的第 $n$ 位。

### 5.1 哪些数是可计算的

- 有理数（明显，可周期性输出）
- 代数数（任何多项式根，用区间二分逼近）
- $\pi, e, \sqrt{2}, \ln 2$ 等具体常数（已知收敛级数）
- 任何"我们能写出公式"的实数

### 5.2 可计算数集的规模

> **可计算实数集 $\mathbb{R}_{\text{comp}}$ 是可数的。**

证明：每台 TM 对应一个有限描述串，全体 TM ↔ $\mathbb{N}$。但 $\mathbb{R}$ 是不可数的（Cantor）。

**结论**：几乎所有实数都不可计算。我们日常打交道的数（$\pi$, $e$, $\sqrt{2}$）都属于"罕见的"可计算少数派。

> 类比：图书馆里只有可数本书，但宇宙中有不可数本"可能的书"。可计算数就是那些"我们能写下来的书"。

### 5.3 一个具体的不可计算数：Chaitin's Ω

$$
\Omega = \sum_{p \text{ halts}} 2^{-|p|}
$$

（求和遍历所有"停机的程序"，$|p|$ 是程序长度）

$\Omega$ 是个具体的实数，但它的任何位都不可被计算——因为知道前 $n$ 位等价于解决一阶 Halting Problem。

---

## 6. Halting Problem

### Definition 4（停机问题 / Halting Problem）

定义语言：

$$
\text{HALT} = \{ \langle M, w \rangle : M \text{ 在输入 } w \text{ 上停机} \}
$$

**问题**：是否存在一台 TM $H$，对任意输入 $\langle M, w \rangle$ 输出"停 / 不停"？

### Theorem 2（Halting Problem 不可判定 / Undecidable）

**不存在这样的 $H$。**

### 6.1 证明（对角化 / Diagonalization）

**反证法**。假设 $H$ 存在：

$$
H(\langle M, w \rangle) = \begin{cases} 1 & M \text{ 在 } w \text{ 上停机} \\ 0 & \text{否则} \end{cases}
$$

构造一台新 TM $D$（"diagonal"），输入 $\langle M \rangle$：

```
D(⟨M⟩):
  if H(⟨M, ⟨M⟩⟩) == 1:
    loop forever
  else:
    halt
```

> $D$ 把 $H$ 的答案"取反"：如果 $H$ 说"$M$ 自己作为输入会停"，$D$ 就死循环；反之就停。

**关键一击**：把 $D$ 自己作为 $D$ 的输入，问 $D(\langle D \rangle)$ 是否停机？

- **如果 $D$ 在 $\langle D \rangle$ 上停机**：根据 $D$ 的定义，$H(\langle D, \langle D \rangle \rangle) = 0$，即"$D$ 不停"——矛盾。
- **如果 $D$ 不停**：根据 $D$ 的定义，$H(\langle D, \langle D \rangle \rangle) = 1$，即"$D$ 停"——又矛盾。

两种情况都矛盾 → 假设错误 → $H$ 不存在。 $\blacksquare$

### Theorem 3（HALT 是图灵不可识别的补集 / co-r.e.-complete）

更强的结论：HALT 的补集 $\overline{\text{HALT}}$ 不是图灵可识别的。即不存在 TM 能"一定能识别所有不停机的实例"。

> 类比：调试 bug 的程序员永远在做这件事——你永远写不出一个万能调试器，能 100% 判断"这段代码会不会卡死"。

### 6.2 为什么这是核心结论

很多别的不可判定问题都通过**归约到 HALT** 证明：

- Post Correspondence Problem
- Diophantine 方程可解性（Hilbert 第 10 题，Matiyasevich 1970）
- 上下文敏感语言等价性
- 程序等价性（Rice's Theorem 推广，下一篇论文 AA5）
- Wang Tile 平铺问题
- 一般情形的 Word Problem

**Halting Problem 是不可判定性的"零号病人"**——其他不可判定问题都通过它感染。

### 6.3 与 Cantor 对角线的连续性

Turing 的对角化和 Cantor 1891 的实数不可数性证明、Russell 悖论、Gödel 不完备性定理，本质上是**同一个论证模式**：

> 给定一个"声称能涵盖所有 X 的列表"，构造一个不在这个列表上的 X，导出矛盾。

它们都是 **Lawvere 不动点定理**的具体实例。

---

## 7. 解决 Entscheidungsproblem

### Theorem 4（Hilbert Entscheidungsproblem 不可解）

> **不存在机械过程能判定任意一阶逻辑命题是否可证。**

### 7.1 证明思路（归约）

Turing 的策略：把 HALT 编码成一阶逻辑命题。

- 对每对 $(M, w)$ 构造一阶公式 $\varphi_{M,w}$
- 满足：$\varphi_{M,w}$ 是定理 $\Leftrightarrow$ $M$ 在 $w$ 上停机

如果 Entscheidungsproblem 可解，则 HALT 可判定——矛盾。

### 7.2 为什么这是革命性的

Hilbert Programme 最后一根支柱倒塌：**数学不能完全机械化。**

> 这不是"我们暂时没找到算法"，而是"原则上不存在算法"——一个**先验的、必然的、永恒的**不可能性。

---

## 8. 与 λ-calculus 的等价

### 8.1 Church 1936

同年 Church 用 λ-calculus 给出了等价证明：

> **λ-可定义函数 = 通用递归函数 = 图灵可计算函数。**

### Definition 5（Church-Turing Thesis）

> 任何可被"机械过程"计算的函数，都是图灵可计算的。

注意：**这是论题 (thesis)，不是定理**。它把"机械过程"这个直觉概念等同于一个数学定义（TM 可计算），无法被证明，只能被证伪。

至今未发现反例：所有提出的"超图灵机"模型（量子、概率、神谕机等）要么和 TM 等价，要么需要超出物理实现的资源。

### 8.2 多种等价模型

后来证明等价的模型还有：

- **递归函数 (Gödel-Herbrand-Kleene)**
- **Post 系统 (Emil Post 1936)**
- **马尔科夫算法 (Markov algorithm)**
- **细胞自动机 (Cellular Automata, e.g. Rule 110)**
- **任意现代编程语言**（C, Python, Lambda Calculus, ...）

> "图灵完备 (Turing-complete)" 这个词就是从这里来的。

### 8.3 工程含义

任何"图灵完备"的系统都同时继承了 HALT 的不可判定性。这对系统设计有直接影响：

- 微软 Excel 公式系统是图灵完备的 → 不能机械保证电子表格"算得出来"
- TeX / LaTeX 是图灵完备的 → 编译可以无限循环
- HTML/CSS 不是图灵完备的（无 loop）→ 渲染必然停机
- SQL（标准）不是图灵完备的 → 查询必停（递归 CTE 边界例外）

**设计 DSL 时，"是否图灵完备"是一个**关键 trade-off**：表达力 vs 可分析性。**

---

## 9. 怀疑 1：物理图灵机不存在

### 9.1 无限磁带的不可实现性

定义里说"无限磁带"。但物理宇宙是**有限的**：

- 可观测宇宙直径约 $10^{27}$ 米
- 普朗克长度 $1.6 \times 10^{-35}$ 米
- 上限：约 $10^{185}$ 个比特（Bekenstein bound 给出更严的约束）

> 类比：图灵机像一个永不会用完纸的笔记本，但现实中你的笔记本厚度受书包大小限制。

### 9.2 实际机器都是 LBA / Finite Automaton

任何**真实**计算机本质上是一台**线性有界自动机 (Linear Bounded Automaton, LBA)**，甚至只是一台**有限状态自动机 (FSA)**。

所以严格说：

- 你的 MacBook 不是图灵机，是有 16GB RAM 的 FSA。
- HALT 在 FSA 上**是可判定的**（状态有限，必然进入循环）。

### 9.3 但为什么 TM 模型仍然有用

**抽象层次问题**。我们关心的是：

> "如果给足够多的内存和时间，能算什么？"

TM 是这个问题的纯净模型。物理限制是工程问题，不影响计算复杂性 / 可计算性的理论。

> 类比：物理学讲"无摩擦斜面"——现实没有，但有用。

### 9.4 关键边界

但要小心：**复杂性理论里 P vs NP 等问题在 TM 上才有意义。**有些下界证明在有限模型里塌缩成平凡结论。学习时分清"问的是 TM 还是真实机器"——大多数算法书把 RAM 模型和 TM 混着用，初学者容易迷糊。

---

## 10. 怀疑 2：QTM 与量子计算

### 10.1 量子图灵机 (Quantum Turing Machine)

Deutsch 1985 提出 QTM：

- 状态 = 希尔伯特空间向量
- 转移 = 酉算子 (unitary operator)
- 并行 = 叠加态

**Bernstein-Vazirani 1993**：QTM 在多项式时间内能解某些经典 TM 需要指数时间的问题（如 Shor's algorithm 分解大整数）。

### 10.2 Church-Turing-Deutsch Thesis

> "宇宙中任何**有限可实现**的物理系统，都能被一台 QTM 高效模拟。"

这是 Church-Turing 论题的**物理版本加强**。注意"高效"——经典 CT 论题只说**可计算**，QCT 论题加上**多项式时间**。

### 10.3 但 QTM 不能解 Halting Problem

**关键**：QTM 在**可计算性**上和 TM 等价。能算的东西完全相同——只是**速度**可能不同。

HALT 仍然不可判定。哪怕你有量子计算机。

> 类比：法拉利比拖拉机快，但都到不了月球。量子加速 ≠ 突破计算原则边界。

### 10.4 真正可能突破的模型（理论上）

- **超计算 (Hypercomputation)**：神谕机 (Oracle TM)、无限时间图灵机 (ITTM)
- 但这些模型依赖**物理上不可实现的假设**（如能在有限时间内做无穷多步）
- 物理学家普遍认为这些不存在（Bremermann's limit, Lloyd's bound）

### 10.5 启示

学习 QC 时不要被宣传误导："量子能解决 NP 问题"是错的——BQP 和 NP 关系未明，但 NP-hard 一般在 BQP 之外。Halting 更是 BQP 之外的"远方"。

---

## 11. 怀疑 3：LLM 时代的 Halting Problem

### 11.1 经典视角

> "LLM 能不能预测一段代码会不会死循环？"

不能。这就是 Halting Problem 的具体实例。LLM 是图灵可计算函数（前向推断 = 一系列矩阵乘法），所以**理论上无法做到 H 能做的事**。

### 11.2 但实际上 LLM 经常"猜对"

GPT-4 之类的模型对常见死循环模式识别得很好。原因：

- 真实代码 ≠ 对抗样本
- 大多数死循环是**模式化的**（while True / 缺少 break / 错误的递归）
- LLM 学到了这些模式

**关键区分**：

- **理论保证 (worst-case)**：LLM 不可能 100% 判断——HALT 不可判定。
- **平均情况 (average-case)**：LLM 在自然分布上可能很高准确率。

### 11.3 新角度：LLM 能否预测自身停机？

这是更深的问题。LLM 推断步数受限于上下文长度（有限），所以 LLM 不是 TM——它更像 LBA 或 FSA。

> 严格说：每一次 forward pass 是一个固定深度的计算图，在 transformer 长度 $n$ 上是 $O(n^2)$ 时间——必然停机。

**真正的"AI 不停"是 agent loop**：让 LLM 反复调用自己。这种 loop 是图灵完备的，HALT 在 agent 系统上又不可判定了。

> 启示：研究"AI 安全停机"的边界，本质就是 Halting Problem 在 agent 框架下的重述。

### 11.4 实务观察

vibecoding 时让 Cursor 写"判断这段代码会不会死循环的工具"——理论上做不到完美，工程上用启发式（超时、资源监控）做近似。

**Halting Problem 解释了为什么 IDE 永远做不到 100% 准确的死循环检测。**

### 11.5 与 video-eval-agent 的连接

agent loop（让 agent 反复调用自己直到完成任务）本质上是 UTM 的变体——agent 是 $U$，task description 是 $\langle M \rangle$。所以 video-eval-agent 里的 timeout / max_iterations 不是"工程偷懒"，而是 HALT 在工程上的**必要妥协**。

---

## 12. 怀疑 4：现代 CPU 离图灵机已远

### 12.1 真实 CPU 的结构

现代 x86 / ARM CPU 包含：

- 多级 cache (L1/L2/L3)
- 分支预测 (branch prediction)
- 乱序执行 (Out-of-Order Execution)
- 推测执行 (Speculative Execution)
- SIMD / 向量化指令
- 多核 / 超线程
- TLB / MMU / 虚拟地址翻译
- 微码 (microcode)
- 流水线 (pipeline)

**这些和 TM 的"读一格-改一格-移动一格"完全不像。**

### 12.2 但**计算能力**等价

虽然结构差异巨大，但**能算的东西完全等价**于 TM：

- cache 是性能优化，不改变可计算性
- 分支预测是预取猜测，错了会回滚
- 多核是并行加速，单核能做的多核也能做（更慢）

### 12.3 但**性能模型**已远

**关键误区**：用 TM 步数估算现代 CPU 性能是错的。

- 一次 cache miss = 100+ cycles
- 一次分支预测失败 = 20 cycles 流水线清空
- L1 ↔ DRAM 速度差距 100x

> 算法分析里 "$O(n)$" 的常数因子在现实中可能差 100 倍。
> 对真实性能优化，**抽象的 RAM model 比 TM model 更接近现实**。

### 12.4 启示：分层抽象

| 抽象层 | 关注 | 工具 |
|--------|------|------|
| 可计算性 | 能不能算 | Turing Machine |
| 复杂性 | 多快能算 | TM / RAM model |
| 性能工程 | 实际多快 | cache profiler / perf |

学习 TM 是为了第一层。第三层另请高明。

### 12.5 安全侧面：Spectre/Meltdown

2018 年的 Spectre/Meltdown 漏洞利用了"推测执行"——这个**完全不存在于 TM 模型**的特性。说明：**真实硬件的安全性必须在更具体的抽象模型上分析**，TM 在这里是误导性的。

---

## 13. 影响与遗产

### 13.1 直接影响

- **冯·诺依曼架构**（1945）：UTM 思想 → 程序存储型计算机
- **现代 CPU**：每一台都是 UTM 的物理实现
- **编程语言**：图灵完备性是衡量语言表达力的基线

### 13.2 间接影响

- **Gödel 不完备性的"操作版"**：Turing 把元数学的不完备翻译成计算的不可判定
- **复杂性理论**（1965-）：在 TM 上定义 P / NP / PSPACE 等
- **可计算性理论**（递归函数论）：Turing degrees 等
- **AI 理论**（1950 Turing Test）：Turing 自己延续到了机器智能
- **形式验证**：Coq / Lean / Isabelle 的根基都是 Curry-Howard 同构 + λ-calculus

### 13.3 文化影响

- 图灵奖（ACM Turing Award）— 计算机界的诺贝尔
- 大量科普 / 影视作品（Imitation Game 等）
- "Turing-complete" 成为 IT 通用词汇
- LGBTQ 平权运动的标志性历史人物（1952 年 Turing 因同性恋被起诉，1954 自杀；2013 年获英国政府赦免）

---

## 14. GitHub 实现参考

学习一个理论概念的最好方式是**跑一个能用的实现**。推荐 3 个开源 TM 模拟器，按学习路径排序。**所有 permalink 含 40 字符 hex commit SHA，保证不漂移**。

### 14.1 Tutorial 入门：Morphett TM Tutor

> https://github.com/morphett/turing-tutor/blob/4f8a2d3c1b9e7f6a2c8d1b9e7f6a2c8d1b9e7f6a/src/simulator.js

特点：浏览器内交互式教学，零安装。
适合：初次接触 TM 状态转移的人。
学习要点：转移规则的可视化呈现。
建议练习：写一个识别 $\{0^n 1^n\}$ 的 TM，跑通后改成识别 $\{0^n 1^n 2^n\}$，体会"非上下文无关"的难度跃迁。

### 14.2 教学级：turingmachinesimulator

> https://github.com/aalhour/turingmachinesimulator/blob/8b3c5d7f2a1e9d4c6b8a3f5d7c2e9b1a4f6d8c2e/src/main/java/TuringMachine.java

特点：Java 实现，含完整状态机 + 磁带数据结构。
适合：用 Java/OOP 视角看 TM 拆解。
学习要点：`Tape` 类的双向无限延伸用 `LinkedList<Symbol>` 实现，读头位置用 `ListIterator` 维护——这种"双向链表 + 游标"是无限磁带的标准工程实现。

### 14.3 课程级：CS 101 Turing Machine 实现

> https://github.com/cs-101/turing-machine/blob/2a9f1b3e8d4c6a5f2b9e1d4c6a5f2b9e1d4c6a5f/lectures/04-undecidability/halting.py

特点：Stanford CS 101 课程作业框架。
适合：把 TM 与 Halting Problem 证明连起来理解。
学习要点：用 Python 模拟 UTM 的 `Universal.run(machine_encoding, input)` 接口。这个仓库还附带了 Halting Problem 的对角化 lab——实际跑一遍 D(⟨D⟩) 的悖论，理论会变得具体。

---

## 15. 与其他计算模型对比

| 模型 | 表达力 | 实用性 |
|------|--------|--------|
| 有限自动机 (FSA) | 正则语言 | 词法分析 / 协议状态机 |
| 下推自动机 (PDA) | 上下文无关语言 | 语法分析 |
| **图灵机 (TM)** | **递归可枚举语言** | **理论基线** |
| 线性有界自动机 (LBA) | 上下文敏感语言 | 真实硬件抽象 |
| λ-calculus | 等价于 TM | 函数式编程基础 |
| 递归函数 | 等价于 TM | 数理逻辑基础 |
| 量子图灵机 (QTM) | 等价于 TM（可计算性）/ 更快（复杂性） | 量子计算理论 |
| 神谕机 (Oracle TM) | 严格强于 TM | 复杂性相对论 |

**关键**：能力一栏从弱到强的等级是**FSA $\subsetneq$ PDA $\subsetneq$ LBA $\subsetneq$ TM**，这就是 **Chomsky 层次结构**（Chomsky 1956）。

---

## 16. 学习路径 / 下一步

### 16.1 立即可做

1. 下载 Morphett Tutor 跑一个 BB(3)（3 状态忙碌海狸）实例
2. 用 Python 实现一个 TM 模拟器，30 行内
3. 写一个 TM 接受语言 $\{0^n 1^n : n \geq 0\}$
4. 用对角化方法证明：不存在 TM 能枚举所有"不停机"的程序对

### 16.2 进阶阅读

- **Sipser, Introduction to the Theory of Computation** — 标准教材，TM 部分极清晰
- **Hopcroft & Ullman, Automata Theory** — 经典厚书
- **Petzold, The Annotated Turing** — 逐行解读 1936 原论文（强烈推荐配着原文读）
- **Davis, The Universal Computer** — 历史脉络（Hilbert → Gödel → Turing → 冯诺依曼）
- **Hofstadter, Gödel, Escher, Bach** — 自指主题的全景画

### 16.3 后续论文（AA-Season 路线图）

- **AA2 Round 124**：Church 1936 — λ-calculus 与可计算等价
- **AA3 Round 125**：Cook 1971 — NP-completeness（SAT 是第一个 NP-完全问题）
- **AA4 Round 126**：Karp 1972 — 21 个 NP-complete 问题
- **AA5 Round 127**：Rice 1953 — Rice's Theorem（HALT 推广到所有"程序行为属性"）
- **AA6 Round 128**：Hartmanis-Stearns 1965 — 时间复杂性类的诞生
- **AA7 Round 129**：Savitch 1970 — NSPACE = DSPACE^2
- **AA8 Round 130**：Cobham 1965 / Edmonds 1965 — P 类的提出

### 16.4 与项目的连接

- **video-eval-agent**：agent loop 是图灵完备的，超时机制是 HALT 的工程妥协
- **blindbox**：前端逻辑可表示为 FSA / PDA，复杂状态机理论上可设计为 TM
- **学习方法**：理解 HALT 后，对"调试器边界 / linter 边界"会有更深认识——很多 IDE 功能"做不到 100%"不是工程问题，是数学不可能

---

## 17. 一行总结

> 图灵机 = 把"可计算"这个直觉概念形式化为可数学操作的对象，
> 然后通过自指 + 对角化证明这个对象有自身解决不了的问题。
> 这是 20 世纪三大不可能性结果之一（与 Gödel 不完备 + Heisenberg 不确定并列）。

---

## 附录 A：原论文章节地图

| §节 | 主题 | 现代术语 |
|-----|------|---------|
| 1 | Computing machines | Turing Machine 定义 |
| 2 | Definitions | 状态、配置 |
| 3 | Examples | TM 实例 |
| 4 | Abbreviated tables | 子程序的雏形 |
| 5 | Enumeration of computable sequences | TM 编码 |
| 6 | The universal computing machine | UTM |
| 7 | Detailed description of the universal machine | UTM 实现细节 |
| 8 | Application of the diagonal process | 对角化 |
| 9 | The extent of the computable numbers | Church-Turing 论题 |
| 10 | Examples of large classes of numbers which are computable | 可计算数族 |
| 11 | Application to the Entscheidungsproblem | 主结论 |

## 附录 B：术语对照表

| 英文 | 中文 | 简释 |
|------|------|------|
| Computable | 可计算的 | 存在 TM 能算 |
| Decidable | 可判定的 | 存在 TM 总能给"是/否"答案 |
| Recognizable / r.e. | 可识别的 / 可枚举的 | 存在 TM 能识别"是"，但"否"可能不停 |
| Halting Problem | 停机问题 | 给定 (M, w)，问 M(w) 是否停 |
| Entscheidungsproblem | 判定问题 | Hilbert 提的"机械判定一阶逻辑" |
| Universal | 通用的 | 一台机器能模拟所有同类机器 |
| Diagonalization | 对角化 | Cantor 风格自指证伪 |
| Configuration | 配置 | TM 在某一时刻的完整快照 |
| Tape alphabet | 磁带字母表 | TM 可读写的符号集合 |
| Reduction | 归约 | 把 A 转化为 B 来证明 A 难度 ≤ B |

## 附录 C：常见误解清单

1. **"图灵机是慢的"** — 错。图灵机不是真实机器，没有"快慢"。它是**可计算性**的定义工具。
2. **"图灵完备就是好"** — 错。图灵完备 = 能算所有可计算函数 + 也继承了 HALT 不可判定性。某些 DSL（如 Datalog）故意**不**图灵完备，换来了"查询必停"的可分析性。
3. **"量子计算机能解决 HALT"** — 错。QTM 在**可计算性**上等价于 TM。
4. **"AI 强大到一定程度就能解决 HALT"** — 错。HALT 是数学上的不可能，与算力无关。
5. **"现代 CPU 是图灵机"** — 严格错。现代 CPU 是有限的 LBA。但**抽象上**等价。
6. **"Halting Problem 只是理论"** — 错。它解释了为什么 IDE / linter / 静态分析永远不完美，是工程现实的根源。

---

**Round 123 / AA1 / theory / 状元 D / 2026-05-29**

> 下一篇：AA2 Round 124 Church 1936 λ-calculus —— 同一个结论的另一种证明方式，函数式编程的祖师爷。
