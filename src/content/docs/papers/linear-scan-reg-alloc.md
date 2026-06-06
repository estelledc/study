---
title: Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用
来源: Poletto & Sarkar, 'Linear Scan Register Allocation', ACM TOPLAS 21(5), 1999
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

**寄存器分配**（哪些变量住寄存器、哪些挤回内存）有两条主流路线：

- **图染色**（[[chaitin-graph-coloring]]，1982）：把"两变量是否同时活着"建成图，染色——质量高，但建图 O(V²) 内存、染色多趟迭代，**慢**
- **线性扫**（Poletto-Sarkar，1999）：每个变量算出**一段** `[第一次出现, 最后一次用]` 区间，按起点排序，**单趟扫一遍**就分配完——快，但质量略差

日常类比：一群人要进会议室。

- 图染色 = 先画一张"谁和谁日程冲突"的关系网，再排座位（精确但绘图费时）
- 线性扫 = 让每人写一张"我从 9:00 待到 11:30"的卡片，按到达时间排队，一张一张发钥匙；前一张卡片到 end 了就把钥匙收回再发给下一个

线性扫为了图省事，把"中间走开 20 分钟"也当成一直占着，所以略浪费——但**省掉了画图那一大步**。

## 为什么重要

不理解这条线，下面这些事都没法解释：

- 为什么 HotSpot client compiler（C1）启动比 server compiler（C2）快 5-10 倍——一大半来自寄存器分配换成了线性扫
- 为什么 LuaJIT、V8 baseline、.NET RyuJIT 不用 LLVM——LLVM 后端是 Greedy（图染色变种），太慢，不适合"边跑边编"
- 为什么 GCC `-O0` 和 `-O2` 编译时间差几十倍——`-O0` 走的是简化版 LSRA 思路，`-O2` 走图染色
- 为什么 JIT 编译器愿意接受"代码慢 10%"换"编译快 10x"——JIT 的预算是毫秒级，等不起

26 年后，**所有产品级 JIT 后端的寄存器分配都是这条线的徒孙**。AOT 编译器（GCC、LLVM）继续走 Chaitin；JIT 编译器统统走 Poletto-Sarkar。两条线 30 年并行。

## 核心要点

Linear Scan 的算法分 **5 步**：

1. **算 live interval**：先做活跃性分析，为每个变量 v 找 `[start_v, end_v]` —— 第一次定义到最后一次使用。注意：哪怕中间死了再活，也并成**一整段**（这是 over-approx，质量损失的来源）。

2. **按 start 升序排序** 所有 interval。这一步是 O(V log V)，是整个算法**唯一**的排序。

3. **扫描** 每个 interval i：

   - 先看 `active` 集合（当前正占着寄存器的 interval），把 `end < i.start` 的全部踢出 → 它们的寄存器回到 free 池
   - 如果 free 池非空 → 给 i 分一个寄存器，加入 active

4. **spill 决策**：如果 free 池空了，就比较 i 和 active 里 end **最晚**的那个：

   - i.end 更晚 → spill i（它要占太久）
   - 否则 → 把 active 里 end 最晚的踢出 spill，把它的寄存器给 i

5. **输出**：每个变量要么对应一个寄存器编号，要么对应一个栈槽位。

整个过程**没建图**。复杂度 O(V·R)，R = 寄存器数（小常数）。Chaitin 是 O(V²)。

## 实践案例

### 案例 1：编译时间到底差多少

Poletto-Sarkar 论文实测：在 Pentium 上跑 SPEC95 子集 + Java，**线性扫比图染色编译快 5-10 倍**，运行慢 12%（Pentium）/10%（SPEC95）。这个 trade-off 让 JIT 厂商眼睛一亮——AOT 慢一秒没人在乎，JIT 慢 10ms 用户能感觉到。

### 案例 2：HotSpot client compiler 怎么用

```
Java 字节码 → C1 IR → 活跃性分析 → live interval → 线性扫 → 机器码
```

HotSpot C1 用的是 Wimmer & Mössenböck 2005 的 **SSA 扩展版**——原版 LSRA 不直接吃 SSA，Wimmer 加了 "lifetime hole"（允许 interval 中间打孔，修复 over-approx）+ 数据流融合。这就是今天 [[hotspot-server-compiler]] 启动慢但 client 快的关键。

实际数字：C1 编译一个中等方法 ~5ms，C2 ~50ms。这个 10x 差距里面寄存器分配占了大头。Java 程序启动阶段几千个方法都走 C1，hot 方法触发 OSR 才升 C2——分层编译（tiered compilation）的设计前提就是 LSRA。

### 案例 3：spill 启发式的现实改进

原版 LSRA 的 spill 选 "end 最晚的"，简单但粗。LuaJIT、Graal 都加了：

- **use count 加权**：用得多的少 spill
- **loop depth 加权**：循环里的变量 spill 代价更高（每次迭代都要 load/store）
- **fixed register 约束**：x86 的 `idiv` 必须用 RDX:RAX → 那两个寄存器有"预定区间"

### 案例 4：极简伪代码（30 行讲完）

```python
def linear_scan(intervals, R):
    intervals.sort(key=lambda i: i.start)
    active = []  # 按 end 升序
    free = list(range(R))
    location = {}
    for i in intervals:
        # 1. expire
        for j in list(active):
            if j.end < i.start:
                active.remove(j); free.append(location[j])
        # 2. allocate or spill
        if free:
            location[i] = free.pop()
            active.append(i); active.sort(key=lambda x: x.end)
        else:
            spill = active[-1]
            if spill.end > i.end:
                location[i] = location[spill]
                location[spill] = STACK
                active[-1] = i; active.sort(key=lambda x: x.end)
            else:
                location[i] = STACK
    return location
```

读这段就能看清：核心是 **一遍 for 循环 + 一个有序 active 集合**，没有递归、没有迭代不动点、没有图。

## 踩过的坑

1. **live interval 是 over-approx**：变量在 `[5, 10]` 和 `[50, 60]` 活，被并成 `[5, 60]`。中间 40 行不用却占着寄存器。Wimmer 2005 的 lifetime hole 修了这个洞。

2. **不直接吃 SSA**：原版假设 IR 已经退出 SSA（带 phi 的不行）。SSA 里同一变量被拆成多个版本，naive 跑 LSRA 会爆寄存器。要么先 destruct SSA，要么用 Wimmer 扩展版。

3. **spill 之后 interval 要重算**：spill 把变量赶到内存后，每次 use 都要 reload、每次 def 都要 store——这些 reload/store 自己是新短 interval，要插回扫描序列。实现里这个递归处理是 bug 高发区。

4. **fixed register 没处理好就崩**：x86 调用约定要求 arg 0 在 RDI，div 必须用 RDX:RAX。这些约束等价于"某些寄存器在某些区间被预占"——LSRA 必须把它们当成幽灵 interval 一起排队。

5. **active 集合用什么数据结构**：原文说"按 end 升序"，naive 实现每次插入 O(n)。LuaJIT、Graal 都用堆或有序链表把单步降到 O(log n)，整个算法稳定 O(V log V)。

## 适用 vs 不适用场景

**适用**：

- JIT 编译器（HotSpot C1、LuaJIT、V8 baseline、.NET RyuJIT、Graal）—— 编译时间是硬约束
- AOT 但要求 `-O0` / `-O1` 的快速编译模式
- 教学/原型——算法 30 行能写完

**不适用**：

- AOT 高优化（`-O2` / `-O3`）—— 用 LLVM Greedy（图染色变种）或 GCC IRA，质量优先
- 寄存器极少的架构（8086 只有 4 个通用寄存器）—— 线性扫的 spill 太频繁
- 需要全局移动代码的优化（rematerialization、live range splitting 的复杂版）—— LSRA 表达力有限

## 历史小故事（可跳过）

- **1965 年**：Best 在 IBM 360 编译器里用 LRU 风格做 reg alloc，是远祖，但没形式化
- **1982 年**：Chaitin 在 IBM PL.8 实验编译器发表[[chaitin-graph-coloring]]，开启图染色范式
- **1989 年**：Hennessy-Chow Priority-Based Coloring，介于图染色和线性之间
- **1999 年**：Poletto（MIT 博士生）& Sarkar（IBM 研究员）在 LCTES 1999 发表 Linear Scan，扩展到 TOPLAS。**11 页**
- **2005 年**：Wimmer-Mössenböck 把 LSRA 接到 SSA，HotSpot C1 落地
- **2010s**：所有主流 JIT 标配

## 学到什么

1. **质量 vs 编译时间是真 trade-off**：不是所有编译器都该追求最优代码——JIT 的目标是"够好且快编"
2. **算法选型由部署场景决定**：同一个问题（reg alloc），AOT 和 JIT 用完全不同的算法，各占一片
3. **Over-approx 是务实的工程妥协**：放弃 lifetime hole 让算法从二维（图）降到一维（区间），换 10x 速度
4. **简单算法 26 年生命力**：LSRA 论文 11 页、核心 30 行，今天每个 JVM 里都在跑
5. **理论 → 算法 → 工程**：1982 Chaitin 数学/AOT → 1999 Poletto 工程/JIT → 2005 Wimmer 接 SSA → 2010s 全产业落地，每一步隔 6-10 年

## 延伸阅读

- 论文 11 页 PDF：[Poletto-Sarkar 1999](https://web.cs.ucla.edu/~palsberg/course/cs232/papers/PolettoSarkar-toplas99.pdf)
- 后续：[Wimmer-Mössenböck 2005](https://www.usenix.org/legacy/events/vee05/full_papers/p132-wimmer.pdf)（SSA-LSRA，HotSpot C1 实际用的版本）
- LuaJIT 实现讲解：[Mike Pall 的 reddit 帖子](https://www.reddit.com/r/programming/comments/badl2/luajit_2_beta_3_is_out_support_both_x32_x64/)
- [[chaitin-graph-coloring]] —— 对照组：AOT 编译器的范式
- [[ssa]] —— SSA 形式，Wimmer 扩展把 LSRA 接到 SSA

## 关联

- [[chaitin-graph-coloring]] —— 同问题不同路线：图染色 vs 线性扫
- [[hotspot-server-compiler]] —— C2 走图染色；C1 走线性扫，启动快 5-10x
- [[ssa]] —— 现代 IR 通用形式，Wimmer 2005 让 LSRA 兼容
- [[kildall-dataflow]] —— 算 live interval 前提是活跃性分析，靠的是 Kildall 数据流框架
- [[llvm]] —— LLVM 后端走 Greedy（图染色变种），所以不适合极致 JIT

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chaitin-graph-coloring]] —— Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[llvm]] —— LLVM — 模块化编译器框架
- [[ssa]] —— SSA — 静态单赋值形式

