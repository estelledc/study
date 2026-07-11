---
title: Halide — 把"算什么"和"怎么算"分开写
来源: 'Ragan-Kelley et al., "Halide: A Language and Compiler for Optimizing Parallelism, Locality, and Recomputation in Image Processing Pipelines", PLDI 2013'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Halide 是一门**专门为图像处理写的小语言**。它的关键发明：让你**分两步写代码**——一步写"每个像素怎么算出来"（算法），另一步写"按什么顺序、用几条线程、是否切块、要不要缓存"（调度）。日常类比：菜谱（番茄炒蛋）和厨师做菜的执行计划（先打鸡蛋还是先切番茄、用一个锅还是两个锅、要不要先腌一下）。同一份菜谱，不同执行计划会有完全不同的速度。

你写一个 3×3 模糊：

```cpp
Func blur_x, blur_y;
blur_x(x, y) = (in(x-1,y) + in(x,y) + in(x+1,y)) / 3;
blur_y(x, y) = (blur_x(x,y-1) + blur_x(x,y) + blur_x(x,y+1)) / 3;
```

这是**算法**。然后你**单独**写调度：要不要把行做并行、是否 SIMD 化、blur_x 的中间结果要不要先存下来再被 blur_y 读。改调度不会动算法，但能让性能差 10 倍。

## 为什么重要

不理解 Halide，下面这些事都没法解释：

- 为什么 Adobe / Google 的相机管线（HDR+ / Lightroom）能在手机上跑实时——背后就是 Halide 编译出来的代码
- 为什么 TVM / MLIR 这些深度学习编译器都强调"算法 vs schedule 解耦"——它们直接借了 Halide 的抽象
- 为什么手工写图像循环要比写算法本身花 10 倍时间——优化和算法缠在一起，改一处要重写一片
- 为什么有的优化叫"recompute vs store"——同一个中间值是每次重算，还是先全部算好缓存起来，是有 trade-off 的

## 核心要点

Halide 把图像处理的两个关注点拆成 **三层**：

1. **算法层（Func）**：一个像素是它周围像素的纯函数。**没有循环、没有数组下标 i++、没有 malloc**。类比：写公式 `f(x,y) = ...`，没说怎么算。

2. **调度层（schedule）**：用 `split / reorder / parallel / vectorize / tile / compute_at / store_at` 这些原语描述"循环长什么样"。类比：告诉厨师"先把番茄切成 64 片一组（tile），4 个炉子同时炒（parallel），每片炒的时候 8 个一起翻（vectorize）"。

3. **编译器**：把上面两层合成 LLVM IR，再下到 x86 / ARM / CUDA。同一份算法配不同 schedule，得到完全不同的可执行代码。

这三层加起来叫**算法-调度解耦**（algorithm-schedule decoupling）。

## 实践案例

### 案例 1：最简单的 3×3 blur，默认 schedule

```cpp
Func blur(Func in) {
  Func bx, by;
  bx(x,y) = (in(x-1,y) + in(x,y) + in(x+1,y)) / 3;
  by(x,y) = (bx(x,y-1) + bx(x,y) + bx(x,y+1)) / 3;
  return by;
}
// 默认 schedule：bx 被 inline 进 by，每个像素的 bx 都重算 3 次
```

不写 schedule 时，Halide 默认把 `bx` **内联**到 `by` 里——`by` 的每个像素要算 3 次 `bx`，每次 `bx` 又要读 3 个 `in`。一共 9 次读 `in`。慢，但代码最短。

### 案例 2：换个 schedule，性能起飞

```cpp
by.tile(x, y, xi, yi, 256, 32)
  .parallel(y)        // 每个 256×32 的块在不同线程
  .vectorize(xi, 8);  // 内层 x 用 8-lane SIMD
bx.compute_at(by, x)  // bx 在 by 的 x 块内算一次
  .vectorize(x, 8);
```

**逐部分解释**：

- `tile` 把图像切成 256×32 的小块——一块刚好能装进 L1/L2 cache
- `parallel(y)` 让多个块同时跑在不同 CPU 核
- `vectorize(xi, 8)` 让最内层循环每次处理 8 个像素（AVX2 一条指令）
- `compute_at(by, x)` 让 `bx` 在 `by` 的 tile 内被计算一次然后被 `by` 的 3 行复用——既不全存（省内存）也不全重算（省时间）

算法**一字没改**，性能可能翻 10-50 倍。

### 案例 3：compute_at vs compute_root vs inline 三选一

```cpp
bx.compute_root();   // 全图先算完 bx 存下来，by 再读——内存大，但 bx 只算 1 次
bx.compute_at(by,x); // 在 by 的某层循环内现算现用——内存小，bx 算 ~3 次
// 不写 → inline → bx 在 by 内联展开——内存零，bx 算 9 次
```

这三种是**重算 vs 缓存**的三档刻度。Halide 把这个权衡拉到语言层面，让程序员显式选。手写 C++ 里这种选择是隐含在循环嵌套里、改一次要重写一片的。

## 踩过的坑

1. **schedule 写错不会编译报错**——只会慢或在运行时越界。要靠 `print_loop_nest()` 把生成的循环结构打出来肉眼检查。

2. **compute_at vs store_at 容易混**：`compute_at` 决定"在哪一层循环重新计算"，`store_at` 决定"缓冲区在哪一层分配"。两者错配会重复计算或缓冲区爆掉。

3. **inline / compute_root 二选一是新人陷阱**：前者全重算，后者占满内存。中间策略 `compute_at` 才是大多数情况要的，新人常忘。

4. **autotuning 不便宜**：算法写好了，但 schedule 的搜索空间巨大。原版 Halide 用随机搜索跑几小时才找到一个好 schedule；后来才有 Adams 2019 的 Halide auto-scheduler 用学习方法降到几分钟。

## 适用 vs 不适用场景

**适用**：

- 图像 / 视频处理管线（blur、滤波、HDR、demosaic）
- stencil 计算（每个点是邻域点的函数）
- 深度学习卷积层（TVM 把 Halide 抽象搬过去）
- 任何"循环嵌套结构 + 调度选择空间大"的数值密集任务

**不适用**：

- 控制流复杂的算法（图遍历、动态规划带条件分支）——Halide 假设管线是 DAG
- 需要可变状态 / 内部累加器的算法——Halide 算法层是纯函数
- 一次性脚本——学完 schedule 原语就要花几天，不值
- 通用 CPU 程序——Halide 的优势在 stencil 类工作负载

## 历史小故事（可跳过）

- **2010-2012**：MIT CSAIL 的 Jonathan Ragan-Kelley（博士生）和 Stanford 的 Andrew Adams 一起做图像管线项目，发现"算法和优化缠在一起"是真痛点
- **2012 SIGGRAPH**：第一篇 Halide 论文出来，提出算法-调度解耦
- **2013 PLDI**：本篇——把语言、编译流程、benchmark 完整化，论文成为 DSL + schedule 抽象的经典
- **2015 起**：Google 把 Halide 用进 Pixel 手机的 HDR+ 管线、Adobe 用进 Lightroom
- **2018 OSDI**：陈天奇等人的 TVM 显式承认 schedule 抽象借自 Halide
- **2020 后**：MLIR 的 affine dialect、IREE、TensorComprehensions 都吸收了类似思想

## 学到什么

1. **DSL 的力量来自"挑对要解耦的两个关注点"**——Halide 选了"算什么 vs 怎么算"，TVM 沿用，MLIR 沿用
2. **性能不是越自动越好**——Halide 不藏 schedule 决策，反而暴露给程序员，因为机器猜不准
3. **recompute vs store** 是优化里的核心权衡——CPU cache、内存带宽、并行度同时要平衡
4. **学术 DSL 落地工业**：Halide 是少数从 PLDI 跳进 Adobe / Google 量产管线的反例，常被引用为"研究怎么影响真实世界"

## 延伸阅读

- 视频：[Jonathan Ragan-Kelley — Halide 介绍演讲](https://www.youtube.com/watch?v=3uiEyEKji0M)（作者本人 30 分钟把动机+demo 过一遍）
- 论文 PDF：[Halide PLDI 2013](https://people.csail.mit.edu/jrk/halide-pldi13.pdf)（17 页，类比和 schedule 例子很多）
- 官网教程：[halide-lang.org/tutorials](https://halide-lang.org/tutorials/tutorial_introduction.html)（17 节交互式教程）
- 论文：[TVM OSDI 2018](https://arxiv.org/abs/1802.04799)（看 Halide schedule 抽象怎么搬到深度学习编译）
- [[feautrier-polyhedral]] —— polyhedral model 是 Halide 之外的另一条路线
- [[llvm]] —— Halide 后端最终降到 LLVM IR

## 关联

- [[feautrier-polyhedral]] —— 多面体模型也做循环优化，但更数学；Halide 选了更工程的 schedule 原语
- [[llvm]] —— Halide 编译流程的下游 backend
- [[ssa]] —— LLVM IR 是 SSA，Halide 最终也走这条路
- [[kildall-dataflow]] —— 经典数据流框架；Halide schedule 决策可以看作"显式控制 dataflow 优化"
- [[cascades-1995]] —— 数据库查询优化器同样是"逻辑算子 vs 物理执行计划"解耦，思路同源
- [[volcano-1994]] —— Volcano 优化器框架是 cascades 的前身，schedule 解耦的另一脉
- [[partial-evaluation-jones]] —— Halide 编译器把 schedule 当 staging 信息做特化，思想接近部分求值

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bevy]] —— Bevy — 用 Rust 写游戏的现代 ECS 引擎
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[cutlass-2020]] —— CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[ffmpeg]] —— FFmpeg — 几乎所有视频工具背后都藏着它
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[numpy]] —— NumPy — Python 科学计算基石
- [[panda3d]] —— Panda3D — 用 Python 写 3D 游戏的老牌引擎
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[ssa]] —— SSA — 静态单赋值形式
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器

