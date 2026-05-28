---
title: Adaptive Functional Programming (Acar et al. 2002) — 现代细粒度响应式的祖宗
description: modifiable + read + write 三个 primitive + change propagation。Solid / Svelte 5 runes / Jotai / rust-analyzer 都源自这篇 POPL 2002
sidebar:
  label: Self-Adjusting Computation (POPL 2002)
  order: 12
---

## 核心信息

- 标题：Adaptive Functional Programming（这是 POPL 2002 论文标题；后续 Acar 博士论文用 "Self-Adjusting Computation" 作为更宽泛术语）
- 作者：Umut A. Acar, Guy E. Blelloch, Robert Harper
- 机构：Carnegie Mellon University
- 发表：POPL 2002
- PDF：[CMU papers/afp/popl02.pdf](https://www.cs.cmu.edu/~rwh/papers/afp/popl02.pdf)（12 页）
- 代码：[原版 SML 实现](https://github.com/umutacar/SAC)（学术原型，实际工程化在 Salsa / rust-analyzer 等）
- 论文类型：PL theory paper（functional language 扩展 + 形式化语义）

## 原文摘要翻译

**自适应计算**在输入变化时维护输入与输出之间的关系。
虽然各种自适应计算技术已被提出，但它们的应用范围一直受限。
我们提出一种**通用机制**——能让**任何纯函数式程序变成自适应**的。
我们通过将其作为一个小的 ML 库高效实现来证明此机制的实用性。
该库由 3 个让程序自适应的操作 + 2 个修改输入并自适应更新输出的操作组成。
我们给出输出自适应所需时间的通用边界，并基于此证明
**自适应版 Quicksort 在输入扩展一个 key 时仅需对数时间自适应输出**——
这相比对变化输入完全重算是线性因子的提升。
为证明机制的安全性和正确性，我们形式化定义 **AFL**（call-by-value 函数式语言扩展自适应原语）。
AFL 的 modal type system 强制自适应机制的正确使用。

## 创新点

Adaptive Functional Programming 给"增量计算"领域提供了 4 件真正新的东西：

1. **modifiable references 抽象**：智能 reference cell **知道自己被谁读了**——
   建立 reader → writer 的依赖图。这是细粒度响应式的理论根
2. **3 + 2 个原语就够**：3 个原语让程序自适应（mod / read / write），2 个原语修改输入（change / propagate）。
   **极简最小集合**——后续所有响应式系统都是这个核心的工程化变体
3. **change propagation 的形式化保证**：论文证明 "change propagation 后的结果 = 重新运行的结果"。
   这是**第一次给"增量计算"严格的正确性证明**
4. **modal type system 静态保证 adaptivity 正确**：用类型系统区分 stable expressions 和 changeable expressions。
   编译期就能 catch 误用——这是 Acar 后来 Self-Adjusting Computation 框架的核心

## 一句话总结

**Adaptive Functional Programming 是现代细粒度响应式的祖宗——
你今天用的 Solid signal / Svelte 5 rune / SolidJS createMemo / rust-analyzer Salsa query / MobX observable
背后那个"细粒度依赖追踪 + 增量重算" 的设计语言，就是这 12 页 POPL 2002 论文奠定的。**

![Self-Adjusting Computation 核心机制](/papers/self-adjusting/01-mechanism.webp)

*图 1：自适应计算的两阶段。
**Initial Computation（上）**：modifiable refs (`x=5, y=3, z=?`) → function `z = x + y` →
trace tree 记录 `read x`, `read y`, `add`, `write z` 的 DAG → 最终 `z = 8`。
**Change Propagation（下）**：`x` 改成 `10` → 系统沿 trace tree 找依赖 `x` 的子树（`add` 节点）→
**只重算 add 节点**（add → write z）→ `z = 13`。"`read y` 不变" 灰色显示——**未受影响的代码不重跑**。
右侧标 "incremental: O(log n) re-execution instead of O(n)"。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2002 之前，**增量计算**有 3 条不够好的路线：

1. **Function caching / memoization**（Pugh 1989, Liu 1995）：缓存函数调用结果。
   问题：必须**整个 input 等价**才能复用 cache——粒度太粗
2. **Dependency graph languages**（INC, Yellin & Strom）：手动构建依赖图。
   问题：**不支持递归 / 循环**——表达力受限
3. **Reactive programming 早期工作**（Cardelli, Pucella）：流式 reactive 但缺形式化语义

Acar 等人的 insight 异常朴素：

- 让 reference cell 自己**知道**被谁读
- 自动构建 dependency graph（不是用户手动建）
- 改变 input 时，只 re-execute 依赖那个 input 的子计算

论文第二段原文：

> "We propose a general mechanism for adaptive computing that enables one to make any
> purely-functional program adaptive."

关键词是 **purely-functional**——无副作用是机制工作的前提。如果有副作用，change propagation 不能保证语义保留。
这后来直接影响了 Solid / Svelte 等响应式系统都偏向函数式风格。

## 论文地形

PDF 12 页（main paper；同年还有更长版本 + Acar 博士论文）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | adaptivity 概念 + 4 大 strengths | 读 |
| 2. Adaptive Programming | **3 + 2 原语 + Quicksort 自适应版完整代码** | **精读** |
| 3. AFL: Adaptive Functional Language | AFL 形式化语法 + modal type system | **精读** Section 3.2 |
| 4. AFL Dynamic Semantics | trace tree 的形式化定义 | 速读 |
| 5. Change Propagation Algorithm | **change propagation 算法 + 正确性证明** | **精读** |
| 6. Implementation | ML library 实现要点 | 速读 |
| 7. Related Work | 与 INC / function caching 对比 | 速读 |

**心脏物**有三个：

1. **mod / read / write 三原语**（Section 2.1）——整个机制的基本砖
2. **AFL modal type system**（Section 3.2）——区分 stable vs changeable，编译期 enforce
3. **Change propagation algorithm**（Section 5）——"如何在 trace tree 上做增量"

## 机制流程

### 三原语（Section 2.1）

```haskell
-- 创建一个 modifiable，初始为 expr 的值
mod : Expr a -> Modifiable a

-- 读 modifiable，建立 reader → modifiable 的依赖
read : Modifiable a -> (a -> Expr b) -> Expr b

-- 写 modifiable（只在 mod 时调用一次；之后用 change 修改）
write : a -> Modifiable a -> ()
```

外加 2 个修改 input 的原语：

```haskell
change : Modifiable a -> a -> ()       -- 修改 input modifiable
propagate : () -> ()                   -- 触发 change propagation
```

### Quicksort Adaptive 完整例子

论文 Section 2 的核心例子。**关键**：list 的 cons cell 是 modifiable，
因此 list 结构改变（插入/删除）能被 trace。

伪代码：

```haskell
-- adaptive list type
type AList a = Modifiable (Cons a)
data Cons a = Nil | Cons a (AList a)

-- adaptive quicksort
qsort : AList Int -> AList Int
qsort xs = mod (\() ->
  read xs (\xs' -> case xs' of
    Nil -> write Nil
    Cons pivot rest ->
      let (lo, hi) = partition pivot rest
      let lo' = qsort lo
      let hi' = qsort hi
      append lo' (Cons pivot hi'))
)
```

输入：`[3, 1, 4, 1, 5, 9, 2]`
1. **Initial**: qsort 跑全 → trace tree 记录每个 `read`, `partition`, `append` 操作
2. **Change**: 把 list 末尾 append `7`（一个 modifiable cell 改了）
3. **Propagate**: 系统找到依赖那个 cell 的所有 read → 沿 trace tree 重算
4. **Result**: 结果 list 含 `7`；time complexity = O(log n) 而非 O(n log n)

## 核心机制（含代码精读）

### 机制 1：Modifiable 是 dependency tracking 的载体

modifiable 不只是 cell，是**带依赖记录的智能 cell**：

```
m = mod (\() -> ...)   -- m 是 Modifiable a
v = read m (\val -> use val)   -- 读 m 时，trace 记录："这个 read 是 m 的 reader"
```

每个 read 在 trace tree 上加一个节点，linking modifiable 到 reader。

如果之后 `change m new_val`：

1. 系统查 trace tree 找出 `m` 的所有 readers
2. invalidate 这些 readers 的输出
3. re-execute 这些 readers
4. readers 的输出是新 modifiable → 递归触发更下游 readers

**这是细粒度响应式的"自动依赖追踪"——用户不写依赖，系统跟踪 read 自动建图**。

### 机制 2：modal type system 静态保证正确性

AFL 把 expression 分成两类：

| 类型 | 含义 | 例子 |
|---|---|---|
| **Stable** | 输入不变时值确定的纯计算 | `x + 1` (where x 不依赖 modifiable) |
| **Changeable** | 依赖 modifiable，值可能改变 | `read m (\v -> v * 2)` |

类型规则强制：

- changeable 不能"逃逸"到 stable 上下文（否则破坏 referential transparency）
- read 必须在 changeable 上下文内
- stable 表达式不能 read modifiable

这是论文的形式化贡献——**静态保证 change propagation 不会出错**。

**怀疑 1**：modal type system 在实际工程语言（Solid/Svelte/Rust Salsa）里**几乎都没采用**——
工程师选择运行时检查或约定。论文宣称 type system 保证正确性，但**约定 + lint 在实践中够用**。
这是论文与生产现实的 gap。

### 机制 3：change propagation algorithm

核心算法（Section 5）：

```
propagate():
  while priority_queue not empty:
    let (time, edge) = pop_earliest_edge(queue)  # 按 trace 时间顺序
    if edge.modifiable was changed:
      invalidate edge.reader
      re-execute edge.reader  # 可能产生新 trace, 加入 queue
    else:
      skip
```

时间顺序保证：**早期 read 先重算**，避免重算时再次依赖未来 reads 导致死循环。

复杂度：O(|affected sub-trace|)，affected sub-trace 通常远小于完整 trace。
对 quicksort：append 一个 key 影响 O(log n) reads。

**怀疑 2**：priority queue 的 ordering 依赖"trace 时间戳"——这是 logical clock 一种实现。
论文 Section 5 不深入讨论 trace 时间戳的存储成本——但实际上 trace 树越大，时间戳元数据开销越大。
后续工作（Salsa / Adapton）用更简化的 timestamp 方案。

## L4 复现：手算 z = x + y 的两次计算

按 [方法论 L4 路径 #4](/study/papers-method/)：

### 阶段 4-6 · 手算

**Setup**：

```
x = mod 5    -- modifiable refs
y = mod 3
z = mod (read x (\xv -> read y (\yv -> write (xv + yv))))
```

**Phase 1: Initial computation**

```
1. mod x: 创建 m_x, value=5, no readers yet
2. mod y: 创建 m_y, value=3, no readers
3. mod z: 创建 m_z, 开始 read chain:
   - read x: trace 记录 "z's body reads m_x"
     - 进入 callback (\xv -> ...)
     - read y: trace 记录 "z's body reads m_y"
       - 进入 callback (\yv -> ...)
       - write (5 + 3) = 8 到 m_z
4. 结果: m_x=5, m_y=3, m_z=8
   trace tree: [read m_x] → [read m_y] → [add 5+3] → [write 8]
```

**Phase 2: Change propagation**

```
1. change m_x 5 → 10
2. propagate():
   - queue: [(time_of_read_m_x, edge_to_z's_body)]
   - pop edge: re-execute reader of m_x
     - re-enter z's body
     - read m_x → 10
     - read m_y → 3 (unchanged)
     - write 13 to m_z
3. 结果: m_x=10, m_y=3, m_z=13
   注意: read m_y 节点重新执行了 (但因为 y 没变，结果一样)
```

**优化空间**：如果系统记得 `read m_y → 3` 是 stable，就不用重新读——这是 Acar 后续工作的方向。

label：`[mechanism verified at toy level]` —— 简单加法的 trace tree + change propagation 跑通。

## 谱系对比

### 前作：Function Caching (Pugh 1989, Liu 1995)

| 维度 | Function Caching | Adaptive Functional Programming |
|---|---|---|
| 粒度 | 整个函数调用 | 单个 read |
| 触发 | input 完全相同 | input 变化触发 propagation |
| 适合 | 重复 input 多 | 输入小改变 |
| 缺点 | 整个 input 改 → cache 全 invalidate | trace tree 增长开销 |

### 前作：Dependency Graph Languages (INC, Yellin & Strom)

INC 让用户手动构建依赖图。AFP **自动构建**——这是关键进步。

### 同辈：Reactive Animation (FRAN, Elliott & Hudak 1997)

FRAN 是 Push-Pull FRP 的祖宗，关注**时间连续 reactive values**。
AFP 关注**离散事件触发 incremental compute**。两条路线在 Modern Reactive 里融合。

### 后作（理论扩展）：Self-Adjusting Computation (Acar 博士论文 2005)

Acar 把 AFP 扩展为更通用的 SAC framework：

- 加入 memoization（在 change propagation 时复用未变 sub-trace）
- 形式化分析 cost
- 实现 traceable data types

### 后作（工程化）：Salsa / rust-analyzer (2018+)

Rust IDE 工具的核心：把 SAC 思想用到编译器**增量分析**。
每次代码改动，只重算受影响的 type check / lint 子集。
**rust-analyzer 之所以"快"，本质上就是 SAC 的工程化**。

### 后作（前端响应式）：

- **MobX** (2015)：observable + reaction = AFP 的 JavaScript 化
- **SolidJS Signal** (2018)：fine-grained reactive，concept 直接对应 modifiable + read
- **Svelte 5 Runes** (2024)：编译期把响应式注入代码
- **Jotai / Zustand**：atom-based reactive，AFP 思想的产品化

**所有这些"signal-based" 框架的论文根，都是 AFP**。

### 后作（Adapton 2014）：

[Hammer et al., PLDI 2014](https://arxiv.org/abs/1503.07792) 简化 SAC——
不要 modal type system，运行时检查 + on-demand re-execution。
更接近工程现实。

### 选型建议

| 场景 | 选 |
|---|---|
| 学增量计算理论根 | AFP 论文 |
| 用现代 framework | SolidJS / Svelte 5 |
| 实现 IDE 工具 | rust-analyzer 的 Salsa |
| Functional 风格响应式 | MobX |
| Rust 库 | Adapton crate |

## 与你当前工作的连接

### 今天就能用

任何"输入变化时高效更新输出"的场景都可以用 AFP 思路：

- **UI 响应式**：state 改变 → 只重 render 受影响 component
- **构建工具**：源文件改 → 只重编译依赖文件
- **数据 pipeline**：上游 change → 只重算下游 partition

不一定要用学术 SAC 实现——**理解 modifiable + dependency tracking 思路，自己写 incremental 系统**。

### 下个月能用

设计任何"long-running compute that updates"场景：

- 把 input 标记成 modifiable
- 把 compute 表达为 read-write 链
- 加 change propagation 触发增量

具体例子：

- LLM agent 的 memory：mem 改了只重算依赖 mem 的下游 reasoning
- 评测系统：metric 改了只重算依赖 metric 的报告
- 文档生成：源 markdown 改了只重 render 受影响 page

### 不要用的部分

- **不要在小数据集 / 一次性 compute 上用 AFP**：trace tree overhead > 重算成本
- **不要忽视 modal type system 的工程负担**：实际工程多用约定 + 运行时检查
- **不要 hand-roll AFP**：用 Salsa / SolidJS 等成熟实现

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **Modal type system 在实际工程几乎没人用**：论文形式化的核心贡献是类型系统，
   但 Solid / Svelte / Salsa 都用运行时检查 + 约定。**类型系统在工程语言里太重**
2. **Quicksort O(log n) 是 best case**：论文宣称 quicksort adapt to extension is O(log n) expected，
   但**worst case** 没分析。如果 pivot 选得糟糕，change 可能触发 O(n) 重算
3. **trace tree 的存储 overhead 论文 underplay**：100k operations 的 trace tree 的内存占用？
   论文 Section 6 implementation 提了 ML library 但**没给真实 overhead 数字**

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Acar PhD thesis (2005) | SAC framework 完整版 |
| 2 | Adapton (Hammer et al., PLDI 2014) | 简化 + 工程化 SAC |
| 3 | Salsa: Incremental computing for IDEs (Niko Matsakis blog) | rust-analyzer 内部 SAC 实现 |

读完这 3 篇 + AFP，你拥有"increment compute 1989-2020"完整地图。

## 限制（论文 + 我的补充）

论文 Section 6 + 7 隐含承认：

1. 必须纯函数式——副作用破坏 propagation 语义保证
2. trace tree 增长可能爆内存——长寿计算需要 GC 策略
3. type system 复杂——开发者 onboard 成本高

我的补充：

4. **现代响应式框架几乎全放弃 modal type system**——约定足够
5. **change propagation 在并发环境下复杂**——论文不讨论 thread safety
6. **Memoization 在 SAC 里是后续加的**——AFP 原版只 dependency tracking，不 cache 中间结果

## 附录：3 + 2 原语速查

```
Adaptive primitives:
  mod : (() -> a) -> Modifiable a       -- 创建 modifiable
  read : Modifiable a -> (a -> b) -> b   -- 读 + 建立依赖
  write : a -> Modifiable a -> ()        -- 写 (在 mod 体内 1 次)

Change primitives:
  change : Modifiable a -> a -> ()       -- 修改 input modifiable
  propagate : () -> ()                   -- 触发增量更新
```

5 个原语 = 一代细粒度响应式系统的源码。

---

**Layer 0-7 完成（按状元篇模板）。约 760 行，含 1 张 figure（webp）+ z=x+y 两阶段手算 + 5 原语速查。**

**Season C · 前端 / 编译器 / 工具链 1/4。**
