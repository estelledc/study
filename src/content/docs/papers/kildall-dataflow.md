---
title: Kildall 数据流框架 — 用一套格论统一所有全局编译优化
来源: 'Gary Kildall, "A Unified Approach to Global Program Optimization", POPL 1973'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Kildall 数据流框架是**一套统一骨架**，用同一份数学结构，一次性描述编译器里"reaching definitions / available expressions / live variables / constant propagation"等一族全局优化分析所需的信息流动。

日常类比：像一栋楼里的水管图。每个房间（基本块）有出水口（gen）和漏水口（kill），水沿着控制流图（control flow graph）流向后续房间，每个分叉口要"汇总"上游来的水（meet 操作）。Kildall 说：你不必为厨房、卫生间、阳台各画一张水管图——它们都是"流体在格子里按管道单调地走，最终到一个稳态"，画一张通用图就够了。

写代码的人看到的是：

```c
x = 1;       // 这里定义了 x
if (cond) {
  x = 2;     // 这里又定义
}
use(x);      // x 此处可能是 1 或 2
```

编译器要回答 `use(x)` 这一行能"看到"哪些 x 的定义——这就是 reaching definitions。Kildall 框架告诉你：把"定义集合"放进一个格子，定义传递函数 + meet，跑一次不动点迭代就出答案。

## 为什么重要

不理解这套框架，下面这些事说不清楚：

- 为什么 GCC / LLVM 里几十种"看似不同"的 pass 共用同一套 worklist 引擎
- 为什么 Cousot 1977 抽象解释能"推广"出来——它的根就是 Kildall 的格 + 单调函数
- 为什么 SSA 形式诞生后大家说"稀疏数据流"——其实是在 Kildall 骨架上换了存储方式
- 为什么"数据流分析必收敛"是个定理而不是经验——格高度有限 + 单调性，必然停。

## 核心要点

Kildall 框架就 **三件套**：

1. **信息域是一个有有限高度的半格 (L, ∧)**。每个程序点要算的东西（定义集合、可用表达式集合、常量值）都装在这个格子里。"有限高度"保证迭代不会无限往下走。类比：一个有底的楼梯，每一步只能下不能上。

2. **每个基本块有一个单调传递函数 f**。"单调"意思是：输入信息变多/变紧，输出也只会更多/更紧，绝不会反弹。常用形式 `f_B(x) = gen_B ∪ (x − kill_B)`。

3. **在控制流图上跑工作表（worklist）迭代**。从入口节点开始，每次取一个待更新节点 n，把所有前驱的输出 meet 成新输入，套传递函数得到新输出；如果输出变了，把后继丢进工作表；直到表空。这个不动点叫 **MFP**（maximum fixed point）。

理论上还存在一个更精确的解 **MOP**（meet-over-all-paths）——把所有路径分别算完再 meet。Kildall 证明：传递函数对 meet 满足分配律时 MFP = MOP；不分配则 MFP ⊑ MOP（更保守，但仍正确）。

工程上几乎没人真去枚举所有路径——因为带循环的 CFG 路径数是无限的，MOP 只是个理论上界。Kildall 框架的关键贡献正是：**用 MFP 做工程实现**，证明它对一大类常见分析与 MOP 等价，并对剩下那些"非分配"的分析给出"仍然正确，但更保守"的可控降级。

## 实践案例

### 案例 1：reaching definitions

问题：每条指令处，"哪些之前的赋值语句可能还没被覆盖"？

```text
1: x = 1
2: if cond goto 4
3: x = 2
4: use(x)   // reach = {1, 3}
```

套 Kildall 框架：

- 格：所有定义的幂集 2^Defs，∧ = ∪（向上越多越保守）
- 传递函数：`f_B(in) = gen_B ∪ (in − kill_B)`
- 工作表迭代：1 步搞定 4 节点

死代码消除、寄存器分配、SSA 构造的 phi 节点放置都靠它。

### 案例 2：available expressions

问题："这条 a+b 的值前面已经算过且没被废掉吗？" 算过就直接复用（公共子表达式消除）。

跟案例 1 对称，只是 ∧ 改成 **交集**（要求"所有路径都算过"），格的偏序方向反过来：

```text
in(B) = ∩_{p ∈ pred(B)} out(p)
out(B) = (in(B) − kill_B) ∪ gen_B
```

代码骨架几乎一样，**只换两个算子**——这就是统一框架的力量。

### 案例 3：常量传播（看分配律何时失效）

格：每个变量的值在 ⊤（未知）/ 具体常量 c / ⊥（非常量）三层格上。

```text
   if (cond) x = 5; else x = 5;
   y = x * 0;     // y 一定是 0
```

按 MOP 解：每条路径都让 x = 5，y = 5*0 = 0。
按 MFP 解：先 meet 两个分支得 x = 5，再传递函数算 y = 0——正确。

但若改成 `else x = 4`，MFP 在合并点会把 x 降到 ⊥（非常量），传递函数再算 `y = ⊥ * 0` 只能给 ⊥；可 MOP 解里 y 仍是 0。这就是**非分配框架**的代价：MFP 比 MOP 保守，但仍正确（safe）。

## 踩过的坑

1. **把无限高度的格当成有限高度用**——比如常量传播若不限制成 3 层，迭代可能无限上升。Kildall 框架的收敛性证明前提就是格高度有限，新手忘了这条会发现"分析跑不停"。

2. **误以为 MFP = MOP 永远成立**——只有分配律满足时才相等。常量传播、形如 `x*0=0` 的运算都是非分配的；论文里专门强调这一点，工程实现时不要拿 MFP 结果当"精确解"用。

3. **工作表迭代顺序乱选导致跑得慢**——前向分析必须按 reverse postorder，后向分析按 postorder。乱序遍历会让一次更新触发的传播链很长，迭代轮数从 O(d+3) 涨到 O(n)。

4. **把 meet 方向写反**——前向分析（reaching definitions）合并多个前驱用 ∪，后向分析（live variables）合并多个后继也用 ∪，但格的偏序方向相反，⊤/⊥ 概念也反过来。新手很容易在"安全方向"上写反，导致结果整体偏紧或偏松，用在优化上要么少优化要么改坏程序。

## 适用 vs 不适用场景

适用：

- 经典编译器全局优化：dead code elimination / common subexpression elimination / constant folding / register allocation
- 静态分析工具：未初始化变量检测、空指针分析、taint 分析
- 抽象解释的具体实例（cousot 把它升级成连续抽象域）

不适用 / 替代方案：

- 路径敏感分析：Kildall 框架在 join 点会丢失路径区分，需要 path-sensitive 或 SSA + sparse 分析补
- 过程间分析：需要扩展为 IFDS / IDE 框架（Reps-Horwitz-Sagiv 1995）
- 高阶函数 / 闭包分析：基本块抽象不再够，需要 control-flow analysis（k-CFA 等）

## 历史小故事（可跳过）

- **1973**：Kildall 在 Naval Postgraduate School 教书期间完成博士论文，把全局优化写成统一格论框架，发表在 POPL。
- **1974**：他创立 Digital Research，写了 CP/M——8 位时代最流行的操作系统。
- **1976**：Kam & Ullman 把"分配律"条件放宽，得到更一般的 monotone framework。
- **1977**：Cousot 夫妇把格论思想推广成 abstract interpretation，成为整个静态分析领域的基础。
- **1980 年代初**：IBM 找 Kildall 谈 PC 操作系统，没谈成；IBM 转头买了 MS-DOS——计算机商业史拐了个弯，但 Kildall 的格论框架仍是编译器教科书第一章。
- **1991**：Cytron 等人发表 SSA 形式与高效 dataflow 算法，把"稀疏数据流"做成主流，但底层不动点求解仍然是 Kildall 的格论思想。

## 学到什么

- 当你看到"一族算法各写一套实现"，往往说明缺一个**抽象骨架**——找出共同结构（这里是格 + 单调函数 + 不动点），就能把它们压成"换算子"的实例。
- "收敛性"不是经验，是定理——格有限高度 + 单调性，必收敛；这是工程上敢放心跑迭代的前提。
- 精确解（MOP）和工程解（MFP）有时不等价，理解何时相等（分配律）能帮你判断分析结果可不可信。
- "格 + 单调函数"的设计模式不只属于编译器——它在程序验证、抽象解释、甚至类型推断里都能复用。

## 延伸阅读

- 原论文 PDF（POPL 1973）：'A Unified Approach to Global Program Optimization'
- Aho-Lam-Sethi-Ullman 龙书第 9 章 'Machine-Independent Optimizations' 是这篇论文的教科书化版本
- Kam & Ullman, 'Monotone Data Flow Analysis Frameworks', Acta Informatica 1977 —— 把分配律条件放宽
- Cooper & Torczon, 'Engineering a Compiler', 第 9 章——工业实现视角，讨论 worklist 顺序与稀疏分析
- [[cousot-abstract-interpretation]] —— 把这套思路推广到任意抽象域
- [[ssa]] —— 现代编译器用稀疏 IR 替代部分 dataflow 迭代

## 关联

- [[cousot-abstract-interpretation]] —— Kildall 框架的"语义升级版"，把格升级到任意抽象域
- [[ssa]] —— SSA 形式让数据流稀疏化，但底子还是格上的不动点
- [[llvm]] —— 实战里几十种 pass 共享一个 dataflow 引擎，正是 Kildall 骨架
- [[mycroft-strictness]] —— 严格性分析也是 Kildall 框架的实例（格 = {⊥, ⊤}）
- [[peyton-jones-stg]] —— STG 优化前的分析多数走 dataflow 框架
- [[hindley-milner]] —— 类型推断 vs 数据流：都用不动点 + 单调函数，但格的结构不同
- [[compiler-errors]] —— 编译器报错链路里很多"未定义变量"检查正是基于 reaching definitions
- [[algol-60]] —— Kildall 论文用的小语言基本是 Algol 风格，理解 Algol 的块结构有助于读懂控制流图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aflgo-2017]] —— AFLGo — 让灰盒 fuzzing 朝目标代码前进
- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[astree]] —— ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告
- [[avgustinov-codeql-2016]] —— QL / CodeQL — 用面向对象外壳写可扩展代码查询
- [[big-little-2011]] —— big.LITTLE — 让一颗芯片同时装快核和省电核
- [[chaitin-graph-coloring]] —— Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[cousot-halbwachs-polyhedra-1978]] —— Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系
- [[dataflow-model-2015]] —— Dataflow Model — 流处理的四问框架
- [[differential-datalog]] —— DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
- [[dijkstra-shortest-path]] —— Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法
- [[e-path-egraph]] —— E-Path — 把 CFG 优化从单行通道改成候选池
- [[egglog-incremental-2026]] —— Egglog — 把 Datalog 和等式饱和合成一台推理引擎
- [[fairfuzz-2018]] —— FairFuzz 2018 — 保护关键字节，让 fuzzing 往深处走
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[flink-2015]] —— Apache Flink — 流批一体的单引擎
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[lerner-seminal]] —— Lerner 组合数据流 — 让小优化互相喂招
- [[linear-scan-reg-alloc]] —— Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用
- [[mine-octagon-2006]] —— Miné 八边形抽象域 — 在区间和多面体之间的甜点
- [[naiad-2013]] —— Naiad — 一套引擎同时跑批处理、流处理和迭代计算
- [[newsome-taintcheck-2005]] —— TaintCheck — 给不可信输入贴追踪标签
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[ssa]] —— SSA — 静态单赋值形式
- [[tensorflow-osdi-2016]] —— TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[vellvm]] —— Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
