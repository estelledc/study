---
title: SSA — 静态单赋值形式
来源: 'Cytron et al., "Efficiently Computing Static Single Assignment Form and the Control Dependence Graph", TOPLAS 1991'
日期: 2026-05-29
分类: 编译器
难度: 中级
---

## 是什么

SSA（**Static Single Assignment**，静态单赋值）是一种**编译器内部用的代码"格式"**——它要求**每个变量只能赋值一次**。日常类比：像写日记时规定"每个名字只准用一次"——第一次提到张三是"张三"，下次再要给张三说点什么，必须叫他"张三_2"。

你写的代码：

```c
int x = 1;
x = x + 1;
x = x * 2;
```

SSA 改写成：

```
x_1 = 1
x_2 = x_1 + 1
x_3 = x_2 * 2
```

每个 `x_n` 是独立名字，只被赋值一次。读到 `x_3` 的人立刻能定位"它来自哪一行"——不用往回追溯。

[[llvm]]、GHC、V8、HotSpot、GCC 4.0+ 这些现代编译器**内部**全用 SSA。肉眼写的代码看不到，但编译器的优化全靠它。

## 为什么重要

不理解 SSA，下面这些事都没法解释：

- 为什么 Rust / Swift / Go 编译器能精确报"第 17 行的某变量未初始化"——SSA 把"哪条赋值能传到这里"变成查表问题
- 为什么 LLVM 同样的代码 `-O2` 比 `-O0` 快 10 倍——绝大部分优化只在 SSA 上才高效
- 为什么死代码消除、常量折叠、寄存器分配在 1990 年代之前算法都很笨——非 SSA 形式下这些分析复杂度都是 O(N³)
- 为什么一份 1991 年的论文 35 年后仍是行业默认——好抽象 + 好算法的复利效应

## 核心要点

SSA 由**三件事**组成：

1. **重命名（versioning）**：每次赋值给变量一个新版本号。`x = 1; x = 2` 变成 `x_1 = 1; x_2 = 2`。类比：日记里同名字加编号。

2. **φ 函数（phi function）**：当**控制流分支汇合**时（if-else 之后、while 入口），编译器需要"选哪个版本"。φ 不是真指令，是个"占位符"，意思是"如果从分支 A 来用 x_1，从分支 B 来用 x_2"。类比：两条路汇合的红绿灯路口，告诉你"看你从哪条路来用谁的版本"。

3. **支配边界（dominance frontier）**：决定"φ 该插在哪些块"的图论工具。简单说，"X 失去控制权的临界点"就是 X 的支配边界——这些位置最多需要 φ。这一步是 Cytron 1991 论文的**核心贡献**。

合起来：先算每个块的支配边界 → 决定哪些块要插 φ → 给所有变量重新编版本号。

## 实践案例

### 案例 1：if-else 后的 φ

最经典的 SSA 例子：

```c
if (cond) {
    x = 1;
} else {
    x = 2;
}
print(x);
```

SSA 形式：

```
B1:    if cond goto B2 else B3
B2:    x_1 = 1
       goto B4
B3:    x_2 = 2
       goto B4
B4:    x_3 = φ(x_1 from B2, x_2 from B3)
       print(x_3)
```

- B2 给 x 赋了版本 1（x_1）
- B3 给 x 赋了版本 2（x_2）
- B4 是分支汇合点——φ 函数说"从 B2 进 B4 用 x_1，从 B3 进用 x_2，结果叫 x_3"
- 后面 `print(x_3)` 永远只看到 x_3，没有歧义

### 案例 2：死代码消除变得极简单

非 SSA 时代要消除死代码很麻烦：要做 reaching definitions 分析，确认这条赋值是否被后面用过。

SSA 时代：**每个 SSA 名字带一个 use list**——零个 use 就是死代码。直接删。

```
x_1 = compute()      // x_1 的 use list 是空 → 删
x_2 = expensive()    // 没人读 x_2 → 删
return 42
```

LLVM 的 dead-code-elimination pass 在 SSA 上就是几十行代码。

### 案例 3：LLVM IR 长这样

LLVM 把整个中间语言都做成 SSA：

```llvm
define i32 @add_one(i32 %a) {
entry:
  %1 = add i32 %a, 1
  %2 = mul i32 %1, 2
  ret i32 %2
}
```

- `%a` 是输入参数（一个版本）
- `%1` 是 `add` 指令的结果（只被定义一次）
- `%2` 是 `mul` 指令的结果（只被定义一次）
- 每个 `%n` 都是不可变的"SSA 名字"

写过 C 但没读过 LLVM IR 的人第一次看会很奇怪："为什么变量都是数字？"——这就是 SSA：编译器懒得起名，直接用版本号。

## 踩过的坑

1. **数组和指针破坏 SSA**：`a[i] = x` 和 `a[j] = y` 是否相互覆盖？要看 i 和 j 是否别名——SSA 本身处理不了。LLVM 用 alias analysis 间接处理；MemorySSA（2015）才把内存也搞成 SSA 形式，但代价高。

2. **φ 在硬件上没对应物**：CPU 没有"φ 指令"。编译器最后必须把 φ **lower 成 copy 指令**（每条入边一个 copy）。朴素 lower 在循环里会插一堆 copy，性能反而比原始命令式还差——出 SSA（out-of-SSA）至今仍是开放研究问题。

3. **构造一次贵，但收益分摊**：朴素 SSA 构造是 O(N³)，工业代码跑不动。Cytron 1991 用支配边界降到接近线性 O(E·α(N))。即使如此，构造仍是一次性昂贵——这就是为什么 GCC 直到 2005 年（GCC 4.0）才默认用 SSA：迁移成本 + 重写所有 pass 的代价。

4. **跨函数 SSA 会爆炸**：函数内 SSA 高效；whole-program SSA 在大程序上构造代价巨大。LLVM 的 LTO 实际不构造全程序 SSA，而是 ThinLTO 用 summary 做局部跨函数推断。

## 适用 vs 不适用场景

**适用**：
- 标量变量的优化（常量折叠、死代码消除、公共子表达式消除）
- 寄存器分配（SSA 形式让 chordal coloring 可行，复杂度更低）
- 静态分析（数据流分析直接沿 def-use chain 走，不需要全 CFG 不动点迭代）

**不适用**：
- 数组元素 / 指针访问的优化 → 需要 MemorySSA + alias analysis
- 动态语言的运行时类型（Python / JavaScript） → 需要 SSA + type speculation 组合
- 跨大量函数的全局分析 → 改用 summary-based 替代

## 历史小故事（可跳过）

- **1979 年**：Lengauer & Tarjan 给出"近似线性时间求支配树"算法。这是 SSA 算法的**前置依赖**——没有它 SSA 也跑不动。
- **1988 年**：IBM Watson 的 Rosen / Wegman / Zadeck 在 POPL 提出 SSA 形式的概念。但论文里没给高效构造法，三年内几乎无人用。
- **1991 年**：Cytron 加入 IBM 团队，给出基于支配边界的高效构造算法。论文 40 页，写得极清楚。这是 SSA 真正的"工业入场券"。
- **2003 年**：LLVM 1.0.0 公开发布，从设计第一天起就是 SSA。
- **2005 年**：GCC 4.0 默认开启 Tree-SSA——距离 Cytron 论文 14 年。GCC 团队不是懒，而是要重写所有已有 pass。
- **2008–2017 年**：V8 Crankshaft (2008) → V8 TurboFan (2014) → JSC B3 (2015) → Go SSA backend (1.7, 2017) 相继落地。**SSA 从理论到全行业默认 IR，用了将近 30 年**。

## 学到什么

1. **抽象 + 算法是一对**：SSA 形式 1988 年提出，但没高效算法时几乎无人用；Cytron 1991 给出算法后才真正普及。**好抽象不够，必须配高效算法**才能突破工业采纳门槛。

2. **sparse 是性能的同义词**：SSA 让数据流分析从"扫所有块"（dense）退化为"沿 def-use chain 走"（sparse）。这条思路超越编译器——倒排索引、稀疏矩阵、MoE 神经网络都是 sparse 哲学的体现。

3. **算法生命周期可以很长**：1991 年的算法 35 年后仍是工业默认。好算法的工业生命周期比硬件代际长——选对核心算法，外围工程腐烂的速度可以接受。

4. **理论 → 工程的接力**：Cytron 做出算法、Lattner 做出 LLVM 把算法工程化、Apple/Google 大规模部署。**每一棒都重要，关键是清楚自己在哪一棒**。

## 延伸阅读

- 论文 PDF：[Cytron et al. TOPLAS 1991](https://www.cs.utexas.edu/~pingali/CS380C/2010/papers/ssaCytron.pdf)（40 页，密度高但比任何教科书讲得清楚）
- 视频教程：[Cliff Click — A Brief History of SSA](https://www.youtube.com/watch?v=Vu1L_kSBmsQ)（HotSpot C2 主架构师亲述工业落地）
- 龙书第二版 §9.3：Aho/Lam/Sethi/Ullman, "Compilers: Principles, Techniques, and Tools" 2nd ed, 2006（综述版本，简化但够入门）
- LLVM 实现入口：`llvm/lib/Transforms/Utils/PromoteMemoryToRegister.cpp`（mem2reg pass，把 alloca 升 SSA）
- [[llvm]] —— SSA 的最大工业宿主，IR 自身就是 SSA
- [[hindley-milner]] —— 同样是"编译器自动推导"思路的近亲

## 关联

- [[llvm]] —— LLVM IR 是 SSA 形式；mem2reg pass 实现了 Cytron 1991
- [[hindley-milner]] —— 类型推断算法，与 SSA 同属"编译器静态分析"流派
- [[lambda-calculus]] —— SSA 与 CPS（continuation-passing style）等价，CPS 是函数式语言的 SSA 替代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[a3c-2016]] —— A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU
- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[badger]] —— Badger — Go 写的键值分离 LSM
- [[big-little-2011]] —— big.LITTLE — 让一颗芯片同时装快核和省电核
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[case-for-risc-1980]] —— Case for RISC 1980 — 一篇没有芯片的论文，掀起 CPU 半世纪革命
- [[chaitin-graph-coloring]] —— Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题
- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[dijkstra-shortest-path]] —— Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[fpga-hls-2011]] —— FPGA HLS 2011 — 把 C 代码自动翻译成芯片电路的范式
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[jax]] —— JAX — Google 函数式数值计算
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[l4-1995]] —— L4 — Liedtke 用 12KB 内核反驳"微内核必然慢"
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[lerner-seminal]] —— Lerner 组合数据流 — 让小优化互相喂招
- [[linear-scan-reg-alloc]] —— Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mcfarling-bp-1993]] —— McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台
- [[mcs-locks-1991]] —— MCS 锁 — 让每个线程自旋在自己的缓存行上
- [[mips-1981]] —— MIPS 1981 — 让编译器自己安排流水线，CPU 就不用管
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[nvme-protocol-2017]] —— NVMe — 为 SSD 重写的存储协议
- [[phong-1975]] —— Phong 1975 — 把光照拆成环境+漫反射+高光三项
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[risc-i-1981]] —— RISC I — 砍掉 90% 指令反而让 CPU 跑得更快
- [[salsa-adapton]] —— Salsa / Adapton — 让程序只重算"真的变了"的那一小块
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[tensorflow-osdi-2016]] —— TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
- [[tomasulo-1967]] —— Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[vamp-verisoft-2006]] —— VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器

