---
title: Adapton — 增量计算
来源: 'Hammer et al., "Adapton: Composable, Demand-Driven Incremental Computation", PLDI 2014'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Adapton 是一套**让程序自动只重算受影响那部分**的框架。日常类比：像 Excel 表格——你改一格 A1，它只刷新公式里用到 A1 的格子，不重算整张表。

普通程序：input 改一个字节，整个程序重新跑一遍。
增量程序：input 改一个字节，**只重跑用到这个字节的那部分**。

```
普通：     改 a → 重算 a+b → 重算 c-d → 重算 (a+b)*(c-d)
Adapton：  改 a → 重算 a+b → 跳过 c-d（没人改它）→ 重算最后乘法
```

那个"跳过"是 Adapton 的核心。

## 为什么重要

不理解"增量计算"，下面这些事都没法解释：

- 为什么 **rust-analyzer** 改一行代码不重新分析整个 crate（它内部用 [[salsa-adapton]]，是 Adapton 思想的 Rust 工程版）
- 为什么 **VSCode 的 TypeScript** 改一个 `.ts` 文件，5 秒内就给红线提示（增量 type check）
- 为什么 **Cargo / Bazel** 第二次编译比第一次快十倍（增量编译）
- 为什么 React 改一个 state 不重渲染整个页面（同思路，UI 层）

简单说：现代大型工具链（IDE / 编译器 / 构建系统 / UI 框架）能做到"秒级反馈"，背后都是某种增量计算。Adapton 是把这个思路**讲清楚 + 给出可工程化方案**的关键论文。

## 核心要点

Adapton 工作的方式可以拆成 **三步**：

1. **建依赖图**：程序跑的时候，Adapton 在背后画一张图——每个计算是一个节点，谁读了谁的结果就连一条边。类比：Excel 自动追踪"这个公式用了哪些格子"。

2. **按需计算（demand-driven）**：input 改了，**不立刻**重算。只标记"这条边脏了"。等到有人**真的去读**结果，才重新跑——而且只跑脏的部分。类比：你改了 A1 但没看 B1，B1 那条公式不算；什么时候点开 B1 才算。

3. **缓存 + 脏标记**：每个节点存三种状态——干净（直接用缓存）/ 脏（依赖变了，要重算）/ 没算过。改 input 时只标脏，不真算；读结果时再去验证。

这三步的核心 insight：**懒比急更省**——大部分中间结果根本没人读，急着算就是白干。

## 实践案例

### 案例 1：最简单的依赖图

```
a = 3        ↘
              (a + b) = 7
b = 4        ↗            ↘
                          ((a+b) * (c-d)) = -7
c = 1        ↘            ↗
              (c - d) = -1
d = 2        ↗
```

操作：把 `a` 从 3 改成 5。

**普通做法**：从头跑一遍，4 个加减乘全做。
**Adapton 做法**：
1. `a` 标脏 → `a+b` 标脏 → 最终结果标脏
2. `c-d` **不动**（没用到 a）
3. 你读结果时：重算 `a+b = 9`，`c-d` 直接复用缓存 `-1`，最终算 `9 * -1 = -9`

省下了 `c-d` 的计算。这个例子 trivial，但放到几百万节点的依赖图上就是几百倍速度差。

### 案例 2：rust-analyzer

你在 VSCode 里改一行 Rust 代码，比如 `fn foo(x: i32)` 改成 `fn foo(x: u32)`。

**rust-analyzer 内部**（用 Salsa，是 Adapton 的工程版）：
1. 标脏：源代码文件 → 解析树 → 类型检查结果
2. 你 hover 鼠标到某个变量 → 触发 force
3. 只有**用到 foo 的那条链**重新算——其他文件的解析树、其他不相干的 fn 都直接复用缓存

这就是为什么改一行代码不会等 30 秒——大部分工作在缓存里。

### 案例 3：和 React 的对比

React：UI 层的增量——state 改了只重渲染受影响的组件。
Adapton：**任意计算**的增量——任何"计算 A 用了计算 B 的结果"都能上。

React 是 Adapton 思想在 UI 这一个垂直场景的具象化。Adapton 是更通用的底层框架。

## 踩过的坑

1. **依赖追踪有开销**：每次"读"都要记一条边，每次"改"都要遍历依赖找谁脏了。**小程序不值得**——overhead 比省下来的还多。Adapton 适合"计算重 + input 改动稀疏"的场景。

2. **深依赖图 change 也不便宜**：标脏要遍历整个下游。如果你的图深 1000 层，改一个 input 就要遍历 1000 个节点标脏。rust-analyzer 实际遇到这个问题，加了"指纹"（fingerprint）优化才解决。

3. **lazy 不总是赢**：如果用户每次操作都要看所有结果（比如实时 dashboard 全屏展示），lazy 的"等读再算"反而比 eager 的"提前算好"慢——因为 force 时要回头验证一堆依赖。

4. **缓存内存无界**：如果不清理，每个中间结果都留着，内存会爆。论文版没仔细处理，工业版（Salsa）加了 LRU 等策略。

## 适用 vs 不适用场景

**适用**：
- IDE 的 type check / find references / 跳转
- 编译器的 incremental compilation
- 构建系统（Bazel / Cargo / Buck）
- 长 pipeline 的数据 transform（上游变只重算下游受影响节点）
- 笔记/wiki 系统（md 改了只重渲染对应 html）

**不适用**：
- 简单脚本 / 一次性计算（overhead 大于收益）
- 全量展示型应用（lazy 优势消失）
- 计算非常轻的场景（缓存查询比直接算还慢）
- 内存极度敏感的场景（缓存要钱）

## 历史小故事（可跳过）

- **2002 年**：Acar / Blelloch / Harper 在 CMU 提出 **Self-Adjusting Computation (SAC)**——增量计算的理论根。但要求用户用专门的类型系统标注哪里"可变"，工程上难推广。
- **2014 年**：Hammer 在 Maryland 大学带队发 Adapton——SAC 的工程化简化版。把"急着 propagate"改成"懒到 force 才算"，把"特殊类型系统"改成"运行时动态追踪"。这就是 PLDI 2014 论文。
- **2018 年**：Niko Matsakis（Rust 核心团队）把 Adapton 思想做成 Rust 库，叫 [[salsa-adapton]]。
- **2020 年**：rust-analyzer 选 Salsa 做内部 query 引擎。从此每个 Rust 程序员每天都在用 Adapton 的思想。
- **2024 年**：增量计算成为现代工具链事实标准——Cargo / Buck / Bazel / Rome / Turbopack 都有自己的增量层。

从论文到每个开发者每天用，10 年。

## 学到什么

1. **懒是工程美德**——99% 的中间结果没人读，急着算就是浪费
2. **依赖图 + 脏标记 + 按需重算** 是增量计算的三板斧
3. **理论简化是通往工程的桥**——SAC 的"特殊类型系统"在学术上优雅，但 Adapton 把它扔掉换成"运行时追踪"才让工业界能用
4. **理论 → 工程版 → 大规模部署**，每一步隔几年。SAC 2002 → Adapton 2014 → Salsa 2018 → rust-analyzer 2020
5. **OS 思想跨界复用**：依赖追踪 + 脏标记 + 引用计数 + 按需重算，和 OS 的虚拟内存 / TLB / page fault 是同一类抽象——把"内存换时间" 转成"缓存换重算"。
6. **指纹（fingerprint）破解深依赖**：如果改 input 之后下游结果其实没变（比如改了一个空格），按"标脏 + 重算" 仍要遍历整条链；rust-analyzer 用 fingerprint 提前剪枝，把"语义相同的小改" 当作没变。这条优化在所有增量系统里都会被反复重新发明。
7. **lazy 不总是赢**：实时 dashboard 类全量展示反而是 eager 更便宜——增量系统的优势出现在"读概率稀疏 + 计算重 + 共享多" 三个条件同时满足时，缺一个就退化。
8. **缓存内存是隐性成本**：每个中间结果都留 → 内存爆。原版 Adapton 没认真处理，工业版 Salsa 加 LRU——增量系统的"永生缓存" 假设在生产里站不住，必须配清理策略。
9. **运行时追踪 vs 编译期分析**：SAC 用类型系统在编译期标"哪里可变"，工程上难推；Adapton 改成运行时动态记录依赖图，复杂度从"程序员 + 类型系统" 转移到"运行时 + 哈希表"——更工业但 overhead 高一点。
10. **rust-analyzer 让每个 Rust 程序员每天都在用 Adapton**：从 2002 SAC 到 2020 rust-analyzer，18 年理论到日常工具——这是计算机科学里"理论慢但稳" 的最好示范之一。
11. **增量 = 把"重算"换成"标脏 + 验证"**：本质是把 O(N) 全量计算摊到每次 input 改动的局部代价；只要"读概率 ≪ 写概率" 就稳赚，工程上等价于把 cost 从 batch 摊成 amortized 流式。

## 延伸阅读

- 论文 PDF：[Adapton 1503.07792](https://arxiv.org/abs/1503.07792)（arXiv 扩展版，30+ 页）
- 工业版：[Salsa book](https://salsa-rs.github.io/salsa/)（rust-analyzer 用的库，从这里学最快）
- 入门博客：[Niko Matsakis — Salsa: Incremental recompilation](https://smallcultfollowing.com/babysteps/blog/2019/01/14/demand-driven-compilation/)（讲清楚为什么编译器需要增量）
- [[salsa-adapton]] —— Adapton 的 Rust 工业版
- [[react-fiber]] —— UI 层的同思想：state 改了只重渲染受影响组件

## 关联

- [[salsa-adapton]] —— Adapton 的 Rust 工业版，rust-analyzer 内部引擎
- [[react-fiber]] —— UI 层的增量更新，思路相通
- [[rust-borrow-checker]] —— rust-analyzer 跑 borrow check 也是一个 Salsa query

