---
title: McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
来源: 'Kenneth L. McMillan, "Symbolic Model Checking", PhD Thesis, Carnegie Mellon University 1993'
日期: 2026-05-30
分类: 形式化方法
难度: 高级
---

## 是什么

**符号模型检测**（Symbolic Model Checking，SMC）是一种**自动验证一个有限状态系统是否满足某条逻辑性质**的算法。日常类比：原来你要一个个翻完整本电话簿才能确认"没有人姓孔"，符号方法相当于把整本簿子做成一个"指纹"，再用指纹比对——多数时候不需要展开就能查询。

要被验证的"系统"通常是硬件电路、协议、调度器；要检的"性质"长这样：

```
AG (req → AF ack)   -- 任何时候有请求，将来必有响应
AG ¬(critical1 ∧ critical2)   -- 任何时候两个进程都不在临界区
```

McMillan 的关键招式是：**不把状态一个个列出来**，而是把"当前所有合法状态的集合"和"状态间的转移关系"都编码成一种叫 **BDD**（二叉决策图）的压缩结构，再用图论运算一步步算"再下一步还可达哪些状态"。这一招让原来只能跑 10^6 状态的 CTL 模型检测，跳到了 10^20 起步。

"符号"二字的意思是：算法看到的不是"状态 0、状态 1、状态 2...."这种枚举，而是"满足某条件的所有状态"这种公式——一次算一坨。

## 为什么重要

不理解 SMC，下面这些事都没法解释：

- 为什么 Intel / AMD 的 CPU 设计里有专门的"形式验证团队"——他们日常工具的祖宗就是 SMV
- 为什么 NuSMV / Cadence SMV / ABC 这些 EDA 工具几乎都用 BDD 内核
- 为什么"模型检测"这条路线能在 2007 年拿 Turing Award（Clarke / Emerson / Sifakis）
- 为什么"硬件验证"和"软件验证"走了两条完全不同的工程路线（硬件爱 BDD，软件爱 SMT）

## 核心要点

先把两个词说成人话：**时序逻辑**像给系统的时间轴写交通规则（"红灯后必须有绿灯"）；**CTL** 是其中一种写法，`AG`≈"从头到尾一直"，`AF`≈"将来总会"。SMC 再拆成三步：

1. **状态用布尔向量表示**：n 位寄存器 = n 个 0/1 开关。一个状态 = 一组开关取值。"合法状态集合"是布尔函数 f：在集合里输出 1。类比：整张 Excel 压成一条"哪些行算数"的判定公式。

2. **集合存成 BDD（Bryant 1986）**：BDD（二叉决策图）把重复的判断子图合并成一张共享图；化简后的叫 ROBDD。**关键魔法**：状态数 10^20 不等于图上有 10^20 个点——控制类协议常常几千节点就够。

3. **CTL 算子 → BDD 不动点**：要问"会不会永远满足 φ"。做法是在 BDD 上反复算"再走一步还到达谁"（image / pre-image），直到集合不再变——这叫**符号不动点迭代**。三步合起来就是符号模型检测。

一句话：**枚举状态是线性累加，符号压缩是几何级**——压得住时，状态空间就不再是瓶颈。

## 实践案例

### 案例 1：两个进程的互斥协议

最小 SMV 代码（精简伪码）：

```
MODULE main
VAR
  p1 : {idle, trying, critical};
  p2 : {idle, trying, critical};
  turn : 0..1;
ASSIGN
  init(p1) := idle; init(p2) := idle;
  -- 转移关系略
SPEC
  AG !(p1 = critical & p2 = critical)
```

跑 `NuSMV mutex.smv`，秒级返回 `is true` 或给出反例路径。**没有 BDD 之前**，几千状态就吃满内存；有了 BDD，这种验证从"研究问题"变成"按下回车"。

### 案例 2：硬件 cache 一致性（论文里最响的案例）

McMillan 用 SMV 验证 Encore Gigamax 多处理器的 cache 一致性协议：

- 状态空间约 10^20（每个 cache line 有 5 种状态、上百个 cache）
- BDD 编码后只用约几万节点
- 真的找出一条**违反一致性**的路径——等价于发现协议设计 bug

这件事让工业界第一次认真对待 formal verification——硬件流片错一次几百万美元，工具能找 bug 就值这个钱。同样的方法后来又验出 IEEE Futurebus+ 总线协议（>10^30 状态）的多个真实 bug。

### 案例 3：你今天还能感受到的 SMV 影子

```
# NuSMV（CMU/FBK 维护的开源 SMV，1999 起）
brew install nusmv
nusmv my-protocol.smv

# ABC（Berkeley 的硬件综合 + 验证工具）
abc -c "read circuit.aig; pdr"   # 用 IC3/PDR，BDD 的精神后裔
```

NuSMV / Cadence SMV / ABC 全是 SMV 1992 的徒孙；TLA+ 选了别的路（可显式枚举），但写性质的逻辑（temporal logic）是同一家。

## 踩过的坑

1. **BDD 对变量顺序极度敏感**：同一个布尔函数，变量按 `x1,y1,x2,y2,...` 排可能 O(n) 节点；按 `x1,x2,...,y1,y2,...` 排变 O(2^n)。挑顺序本身是 NP-hard，工具里靠启发式（dynamic reordering）。

2. **状态多 ≠ BDD 大；BDD 小 ≠ 函数简单**：乘法器的 BDD 在任何变量顺序下都必然指数膨胀（Bryant 1991 证明）。所以**别指望任何 10^20 都能塞进 BDD**——SMV 的优势集中在"控制密集 / 数据规则"的场景。

3. **CTL 写不出公平性**：想说"如果每个进程被无穷次调度，就最终拿到锁"在 CTL 里很别扭，要升级到 CTL* 或 LTL，复杂度也跟着涨。SMV 后期支持公平约束作为补丁。

4. **模型 ≠ 实现**：你写在 SMV 里的状态机是对硬件的**手工抽象**，抽错了模型对了硬件还是有 bug。工业流程里 SMV 通常配 RTL 等价检查一起用。

## 适用 vs 不适用场景

**适用**：

- 硬件控制逻辑：cache 一致性、CPU pipeline、bus 仲裁、互斥协议
- 中小规模并发协议：电梯调度、铁路信号、心脏起搏器
- 状态有限、变量布尔/小整数为主的系统

**不适用**：

- 数据密集运算（乘法、加密哈希）→ BDD 必爆，改用 SMT solver（Z3 / CVC5）
- 无界状态空间（指针 / 链表 / 任意大整数）→ 用抽象解释 / 形状分析（[[cousot-abstract-interpretation]] / [[sagiv-shape-analysis]]）
- 软件复杂控制流 → 偏向 CBMC / SLAM / Coverity（CEGAR + SMT）路线
- 想给数学定理做证明 → 用 [[lean-prover]] / [[fstar]]，模型检测只验有限状态

## 历史小故事（可跳过）

- **1977 年**：Pnueli 把"线性时序逻辑"引进计算机科学（[[pnueli-temporal-1977]]），为"程序在时间上的性质"提供语言。
- **1981 年**：Clarke / Emerson 在 CMU 提出 **CTL 模型检测**（[[clarke-emerson-1981]]），可自动验证有限状态系统——但状态展开只能扛几千。
- **1986 年**：Randy Bryant 在 CMU 发明 **ROBDD**，能把布尔函数压成图。
- **1989-92 年**：Clarke 的博士生 Ken McMillan 把两者拼在一起，做出 SMV 工具，验证 Encore Gigamax cache 协议、IEEE Futurebus+（10^30 状态）。
- **1993 年**：博士论文 + Kluwer 出版的同名书。次年获 ACM 博士论文奖。
- **2007 年**：Clarke / Emerson / Sifakis 因模型检测共获 Turing Award。McMillan 后续做 NuSMV / Cadence SMV / IC3 算法（2011），仍在第一线。

## 学到什么

1. **"集合 = 布尔函数"是软件工程里被严重低估的洞见**——一旦把"状态集"看成函数，整个状态空间问题变成函数运算问题
2. **数据结构能改变可解性**：同一个 NP/PSPACE 完全问题，用展开数组解决不了，用 BDD 就能在工业级规模解决——选对表示就是选对世界
3. **理论 + 数据结构 + 工程**：CTL（理论） + BDD（数据结构） + SMV（工具），三者缺一不可——这是把学术成果推到工业的标准三件套
4. **可验证 ≠ 万能**：每条路线都有结构性盲区（BDD 怕乘法，SAT 怕大状态空间），工程师要懂得在多种工具间切换

## 延伸阅读

- 视频教程：[Edmund Clarke — Model Checking 25 Years Later](https://www.youtube.com/results?search_query=clarke+model+checking+25+years)（图灵奖讲座，回顾整条路线）
- 教材：Clarke / Grumberg / Peled, *Model Checking* (MIT Press 1999)（领域圣经，中文版有）
- 工具：[NuSMV 官网](https://nusmv.fbk.eu/) / [ABC 仓库](https://github.com/berkeley-abc/abc)
- 入门论文：Bryant 1986 *Graph-Based Algorithms for Boolean Function Manipulation*（BDD 原始论文）
- [[clarke-emerson-1981]] —— CTL 模型检测的起点
- [[pnueli-temporal-1977]] —— 时序逻辑被引进 CS 的开篇

## 关联

- [[clarke-emerson-1981]] —— CTL 模型检测理论基础，SMV 把它符号化
- [[pnueli-temporal-1977]] —— 时序逻辑给"程序随时间演化的性质"一种语言
- [[holzmann-spin-1997]] —— LTL 路线的显式模型检测器 SPIN，和 SMV 是平行宇宙
- [[hoare-logic]] —— 用前后置条件证明程序，证明粒度更细但更难自动化
- [[fstar]] —— 把模型检测的兄弟（SMT）做进编程语言
- [[lean-prover]] —— 重型路线：让数学家手写证明而非自动检
- [[cousot-abstract-interpretation]] —— 处理无限状态空间的另一条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[holzmann-spin-1997]] —— Holzmann SPIN 1997 — LTL 显式模型检测的工业标准工具
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树

