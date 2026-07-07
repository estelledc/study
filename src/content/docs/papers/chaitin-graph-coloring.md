---
title: Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题
来源: Chaitin, "Register Allocation & Spilling via Graph Coloring", SIGPLAN 1982
日期: 2026-05-30
分类: 编译器
难度: 中级
---

## 是什么

CPU 只有十几到几十个寄存器（x86-64 通用 16 个，ARM64 通用 31 个），但你写的函数里可能同时活着上百个变量。**编译器必须决定：哪些变量住寄存器、哪些被赶到内存**。这件事叫**寄存器分配**（register allocation）。

Chaitin 1982 的 idea：**把寄存器分配翻译成"地图染色"**——

- 每个变量 → 图上一个节点
- 两变量"在某段代码里同时活着"（一个还要用，另一个也还要用）→ 它们之间连一条边
- 物理寄存器 → 颜色
- 目标：相邻节点不同色，总颜色数 ≤ 寄存器数

**日常类比**：高中排课表。每门课是节点，"两门课有同一个学生选"就连边，教室是颜色——同时上课的两门必须分到不同教室。寄存器分配是同一个数学问题。

## 为什么重要

不理解这条线，下面这些事都没法解释：

- 为什么 GCC `-O2` 比 `-O0` 快 3-5 倍——一大半来自寄存器分配把变量留住，不再每次去内存
- 为什么 LLVM 的 Greedy Register Allocator 源码里到处是 "interference"、"coalesce"、"spill"——这些词全是 Chaitin 1982 定义的
- 为什么编译大函数时编译器特别慢——构造干涉图是 O(V²) 内存
- 为什么手写汇编偶尔比编译器快——人能看出"这个变量只活 3 行，根本不用占寄存器"，而 Chaitin 系算法看不出来

44 年后，**所有产品级编译器后端的寄存器分配器都是这条线的徒孙**。

## 核心要点

Chaitin 的算法分 **5 步**（俗称 build-coalesce-simplify-spill-select）：

1. **build（建图）**：先做活跃性分析（live variable analysis），找出每个程序点活着的变量集合。两变量同时出现在某个集合里 → 加一条边。这一步靠的是 [[kildall-dataflow]] 的数据流框架。

2. **coalesce（合并）**：看到 `mov a, b`（把 b 复制到 a），如果 a 和 b 不互相干涉，干脆合并成一个节点——它们用同一个寄存器，那条 mov 就可以删掉。

3. **simplify（化简）**：找一个度数 < K 的节点（K = 寄存器数）。它的邻居最多 K-1 种颜色，所以**总能挑到一个剩下的颜色**。把它从图里拿走压栈，递归处理剩下的图。

4. **spill（溢出）**：若所有节点度数都 ≥ K，挑一个"代价最低"的变量赶到内存——读用 load、写用 store。代价启发式：`use_count / degree`（用得越多越不该溢出，邻居越多越该让位）。

5. **select（着色）**：栈顶逐个弹出，看邻居已用什么色，挑一个剩下的色（= 一个物理寄存器）。

整个过程**没人手动指定寄存器**。

## 实践案例

### 案例 1：一个最小例子

```c
int f(int x, int y) {
  int a = x + 1;
  int b = y * 2;
  return a + b;
}
```

活跃性：

- 进入函数：x、y 活
- `a = x+1` 后：y、a 活（x 死了）
- `b = y*2` 后：a、b 活（y 死了）
- `return a+b`：a、b 活到最后

干涉图：x-y、y-a、a-b（x 和 a 不冲突，因为 x 死时 a 才生）。

3 个节点的最大团是 2，**只要 2 个寄存器就够**——GCC 真会这么分。

### 案例 2：spill 启发式选谁

```
变量    use_count   degree   cost = use/degree
i       100         3        33.3   ← 循环计数器，绝对不能丢
tmp     2           8        0.25   ← 优先溢出
buf     5           5        1.0
```

`tmp` 邻居多（很多变量都不能跟它同色）、用得少（赶它出去代价小）→ 溢出。这个启发式就是 Chaitin 的核心贡献之一。

### 案例 3：你能在 LLVM 看到的影子

LLVM 的 `RegAllocGreedy` 源码（`llvm/lib/CodeGen/RegAllocGreedy.cpp`）保留了 Chaitin 的术语：`InterferenceCache`、`SpillPlacer`、`splitAroundRegion`。它不再纯粹建图，但骨架——**度数低的先分配、度数高的考虑分裂或溢出**——一脉相承。

### 案例 4：为什么循环里多一个变量会让性能掉

```c
for (int i = 0; i < N; i++) {
  sum += a[i] * b[i];
}
```

热循环里活变量：`i, N, a, b, sum, a[i], b[i]` —— 至少 7 个。如果 K=8 还能塞下，K=6（旧 ARM 处理器）就必须有一个 spill 到内存，每次循环多一对 load/store。Chaitin 的启发式会把 `N`（用得少）扔掉，保留 `i, sum, a, b`。手写汇编的人也是这么想的。

## 踩过的坑

1. **图染色是 NP-完全**：决定能不能 K-染色一般是 NPC（K ≥ 3）。Chaitin 不解最优，靠启发式逼近。所以"差不多就行"，不是"最佳"。

2. **悲观 vs 乐观 spill**：Chaitin 1982 一旦看到无 < K 度节点就立刻 spill。Briggs 1989 改成"先压栈，select 时若真分不出色再 spill"——少很多冤枉溢出。这个改进几乎所有现代分配器都采纳。

3. **coalesce 太激进会染不出色**：合并节点会增加邻居总和、可能让原本能染色的图变不能染色。George & Appel 1996 的 Iterated Register Coalescing（IRC）给了一个保守判据，是现在的工业标准。

4. **不适合大函数**：构图 O(V²) 内存。10000 个变量 → 1 亿条边可能。LLVM 在大函数上经常退化到 linear scan 或 splitting。

5. **现代 ISA 寄存器有"类"**：x86 有 GPR、XMM、YMM；ARM 有 D/S 浮点；调用约定还固定某些寄存器。原始 Chaitin 算法假设"所有颜色等价"，工业上要扩展成 chunked graph 或 priority-based 着色。

6. **错误信息几乎没有**：寄存器分配失败不会报错给你，只会让生成的代码慢几倍。要 debug 必须看 `-fdump-rtl-ira`（GCC）或 `-print-after-all`（LLVM）找 spill 决策。新人很难意识到性能退化的根因在这里。

7. **call site 把所有 caller-saved 寄存器都"杀死"**：函数调用前后 caller-saved 寄存器全部 live-out，干涉图突然爆边。所以频繁调用小函数的代码寄存器压力巨大——这也是 inline 优化对寄存器分配的间接好处。

## 适用 vs 不适用场景

**适用**：

- 任何静态编译型语言后端（C/C++/Rust/Go/Swift/Fortran）
- 中等规模函数（< 数千变量）
- 寄存器数 K 固定且统一的简化 ISA

**不适用**：

- JIT 编译需要快速分配 → 用 linear scan（Poletto 1999）或贪心算法
- 巨型函数 → 必须先做 region splitting 或 SSA-based 分配
- 寄存器有强分类 → 需扩展或换 PBQP（Partitioned Boolean Quadratic Problem）

## 历史小故事（可跳过）

- **1971**：Chaitin 在 IBM Yorktown，做 PL/I 优化器
- **1981**：他注意到"哪些变量能共用寄存器"和"地图染色"是同一个图问题——`Register Allocation via Coloring` 在 SIGPLAN '81 先发了 4 页摘要
- **1982**：完整版 SIGPLAN Symposium on Compiler Construction，加了 spill 启发式和 coalesce
- **1989**：Preston Briggs（Rice 大学）博士论文修了"悲观 spill"问题
- **1996**：George & Appel 把 coalesce 改成 conservative，IRC 算法成行业标准
- **2000s**：LLVM 早期用 linear scan，2010 年后转向 Greedy（Chaitin-Briggs 家族的回归）

## 学到什么

1. **复杂工程问题先翻译成数学问题**——一旦寄存器分配 = 图染色，半个世纪的图论工具都能用
2. **NPC 不可怕**：靠启发式 + 对工业输入的实测，能拿到接近最优的解
3. **简单规则的组合就是工业**：5 步算法每步逻辑都不复杂，组合起来就是 GCC/LLVM 后端的核心
4. **理论 → 算法 → 优化 → 工业**：1982 → 1989 Briggs → 1996 IRC → 2010s LLVM Greedy，每步隔 10 年

## 延伸阅读

- 经典教材：Appel, *Modern Compiler Implementation*（第 11 章把 Chaitin + IRC 完整讲一遍，附伪代码）
- 论文：[Briggs 1989 PhD thesis](https://www.cs.rice.edu/~keith/EMBED/dom.pdf) — 乐观 spill 改进
- 论文：[George & Appel 1996, "Iterated Register Coalescing"](https://www.cs.princeton.edu/~appel/papers/coalesce.pdf) — 工业实标
- 源码：LLVM `llvm/lib/CodeGen/RegAllocGreedy.cpp` — 现代 Chaitin-Briggs 家族实现
- [[ssa]] —— 现代分配器先转 SSA 再降，简化干涉图
- [[llvm]] —— LLVM 后端的寄存器分配器是直系后裔

## 关联

- [[kildall-dataflow]] —— 活跃性分析提供输入（哪些变量同时活着）
- [[ssa]] —— SSA 形式让 live range 更短、干涉图更稀疏，是现代寄存器分配的前置变换
- [[llvm]] —— LLVM `RegAllocGreedy` 是 Chaitin-Briggs 家族的工业延续
- [[bernstein-1981-cc]] —— 同期编译器构造领域，互为兄弟

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[linear-scan-reg-alloc]] —— Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用
- [[llvm]] —— LLVM — 模块化编译器框架
- [[personalized-pagerank-2003]] —— Personalized PageRank — 给每个人一份属于自己的网页排名
- [[ssa]] —— SSA — 静态单赋值形式

