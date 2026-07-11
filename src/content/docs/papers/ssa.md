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

每个 `x_n` 是独立名字，只被赋值一次。读到 `x_3` 立刻能定位"它来自哪一行"——不用往回追溯。

[[llvm]]、GHC、V8、HotSpot、GCC 4.0+ 这些现代编译器**内部**全用 SSA。肉眼写的代码看不到，但编译器的优化全靠它。

## 为什么重要

不理解 SSA，下面这些事都没法解释：

- 为什么 Rust / Swift / Go 编译器能精确报"第 17 行的某变量未初始化"——SSA 把"哪条赋值能传到这里"变成查表问题
- 为什么 LLVM 同样的代码 `-O2` 比 `-O0` 快很多——绝大部分优化只在 SSA 上才高效
- 为什么死代码消除、常量折叠在非 SSA 时代更笨——往往要在整张控制流图上做不动点迭代，代价高得多
- 为什么一份 1991 年的论文 35 年后仍是行业默认——好抽象 + 好算法的复利效应

## 核心要点

SSA 由**三件事**组成：

1. **重命名（versioning）**：每次赋值给变量一个新版本号。`x = 1; x = 2` 变成 `x_1 = 1; x_2 = 2`。类比：日记里同名字加编号。

2. **φ 函数（phi function）**：当**控制流分支汇合**时（if-else 之后、while 入口），编译器需要"选哪个版本"。φ 不是真指令，是个"占位符"：从分支 A 来用 x_1，从分支 B 来用 x_2。类比：两条路汇合的红绿灯路口，看你从哪条路来用谁的版本。

3. **支配边界（dominance frontier）**：决定"φ 该插在哪些块"。日常类比：像小区物业——A 栋物业能管到的楼叫"支配"；刚出管区、别的物业也插手的路口，就是支配边界——这些位置最多需要 φ。Cytron 1991 的核心贡献，是用支配边界把"该插哪些 φ"算得够快，工业上才用得起。

合起来：先算每个块的支配边界 → 决定哪些块要插 φ → 给所有变量重新编版本号。

## 实践案例

### 案例 1：if-else 后的 φ

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

- B2 给 x 赋了版本 1（x_1）；B3 赋了版本 2（x_2）
- B4 是汇合点——φ 说"从 B2 进用 x_1，从 B3 进用 x_2，结果叫 x_3"
- 后面 `print(x_3)` 永远只看到 x_3，没有歧义

### 案例 2：死代码消除变得极简单

非 SSA 时代要做 reaching definitions，确认赋值是否被后面用过。SSA 时代分三步：

1. 每个 SSA 名字自带 **use list**（谁读过它）
2. use list 为空 → 这条赋值是死代码
3. 直接删掉该赋值（及只为它服务的计算）

```
x_1 = compute()      // use list 空 → 删
x_2 = expensive()    // 没人读 → 删
return 42
```

LLVM 的 dead-code-elimination pass 在 SSA 上就是几十行代码。

### 案例 3：LLVM IR 长这样

```llvm
define i32 @add_one(i32 %a) {
entry:
  %1 = add i32 %a, 1
  %2 = mul i32 %1, 2
  ret i32 %2
}
```

- `%a` 是输入参数（一个版本）
- `%1`、`%2` 各是一条指令的结果，只被定义一次
- 每个 `%n` 都是不可变的"SSA 名字"；编译器懒得起名，直接用版本号

## 踩过的坑

1. **数组和指针破坏 SSA**：`a[i] = x` 与 `a[j] = y` 是否互相覆盖，要看别名——SSA 本身处理不了。LLVM 用 alias analysis；MemorySSA（约 2015）才把内存也做成 SSA，但代价高。
2. **φ 在硬件上没对应物**：CPU 没有 φ 指令，最后必须 lower 成入边上的 copy。朴素 lower 在循环里会插一堆 copy，出 SSA 至今仍是工程难点。
3. **构造一次贵，收益靠分摊**：朴素构造太慢；Cytron 1991 用支配边界把工业规模构造变得可行。即便如此，GCC 直到 2005（4.0）才默认 Tree-SSA——要重写几乎所有 pass。
4. **跨函数 SSA 会爆炸**：函数内高效；全程序 SSA 在大代码库上构造代价巨大。LLVM LTO 多用 ThinLTO summary，而不是造一份全程序 SSA。

## 适用 vs 不适用场景

**适用**：
- 函数内标量优化（常量折叠、死代码消除、公共子表达式消除）——几乎所有现代编译器的默认路径
- 寄存器分配：SSA 让"谁和谁抢寄存器"的关系更干净，着色/扫描都更简单
- 静态分析：数据流可沿 def-use chain 走，不必每次全 CFG 不动点

**不适用**：
- 数组元素 / 指针访问 → 需要 MemorySSA + alias analysis
- 动态语言运行时类型（Python / JS）→ 还要叠加 type speculation
- 跨大量函数的全局分析 → 改用 summary-based（如 ThinLTO），不要硬造 whole-program SSA

## 历史小故事（可跳过）

- **1979 年**：Lengauer & Tarjan 给出近线性时间求支配树的算法——SSA 构造的前置依赖（这里的近线性才常写成带 α(N) 的形式）。
- **1988 年**：Rosen / Wegman / Zadeck 在 POPL 提出 SSA 形式；当时缺高效构造法，三年内几乎无人用。
- **1991 年**：Cytron 等给出基于支配边界的高效构造，论文约 40 页——SSA 的工业入场券。
- **2003–2005 年**：LLVM 1.0 从第一天就是 SSA；GCC 4.0 默认 Tree-SSA（距论文 14 年）。
- **2008–2017 年**：V8 Crankshaft → TurboFan、JSC B3、Go 1.7 SSA backend 相继落地。从理论到全行业默认，将近 30 年。

## 学到什么

1. **抽象 + 算法是一对**：1988 有形式、1991 有算法才普及——好抽象必须配得起的算法。
2. **sparse 是性能的同义词**：分析从"扫所有块"退化成"沿 def-use chain 走"；倒排索引、稀疏矩阵同属这条哲学。
3. **算法生命周期可以很长**：1991 年的构造思路 35 年后仍是工业默认。
4. **理论 → 工程的接力**：Cytron 做算法、Lattner 做 LLVM 工程化、各厂大规模部署——清楚自己在哪一棒。

## 延伸阅读

- 论文 PDF：[Cytron et al. TOPLAS 1991](https://www.cs.utexas.edu/~pingali/CS380C/2010/papers/ssaCytron.pdf)
- 视频：[Cliff Click — A Brief History of SSA](https://www.youtube.com/watch?v=Vu1L_kSBmsQ)
- 龙书第二版 §9.3：Aho et al., Compilers 2nd ed, 2006
- LLVM 入口：`llvm/lib/Transforms/Utils/PromoteMemoryToRegister.cpp`（mem2reg）
- [[llvm]] —— SSA 的最大工业宿主
- [[hindley-milner]] —— 同属编译器静态分析近亲

## 关联

- [[llvm]] —— LLVM IR 本身就是 SSA；mem2reg 实现 Cytron 思路
- [[hindley-milner]] —— 类型推断，与 SSA 同属编译器静态分析
- [[lambda-calculus]] —— SSA 与 CPS 有教学上的对应关系（非严格形式等价定理）
- [[kildall-dataflow]] —— 经典稠密数据流框架，SSA 让许多分析变稀疏
- [[chaitin-graph-coloring]] —— 寄存器分配的图染色经典；SSA 简化了干涉关系
- [[mlir]] —— 多层 IR，许多方言仍以 SSA 值为核心

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
