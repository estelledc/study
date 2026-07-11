---
title: Coeffects — 让类型系统追踪「需要多少上下文」
来源: 'Petricek, Orchard, Mycroft, "Coeffects: Unified Static Analysis of Context-Dependence", ICALP 2013（ICFP 2014 扩展）'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

**Coeffect**（co-effect，"反副作用"）是一套**让编译器静态算出"这段代码需要从外面拿多少东西"**的类型系统。

日常类比：你去厨房做菜，菜谱有两面写法。

- **A 面（effect）**：做完会产生什么——"会冒油烟、会脏一个锅"。这是传统副作用类型系统在做的事。
- **B 面（coeffect）**：做之前需要什么——"需要 2 个鸡蛋、3 勺面粉、烤箱预热到 180 度"。这就是 coeffect。

过去 30 年类型系统都在 A 面（effect / IO / state），Petricek 这篇 ICALP 2013 第一次把 B 面正式化，并发现"线性类型 / 隐式参数 / 信息流标签 / reactive 历史窗口"这些**看似无关**的分析其实都是同一件事：**输入方向的需求追踪**。

## 为什么重要

不理解 coeffect，下面这些事都串不起来：

- 为什么 Rust 的 ownership、Haskell 的 LinearTypes、Idris 2 的 QTT 都在算"用了几次"——它们是同一个数学骨架的不同实例
- 为什么 Granule 语言能写 `f : Int [3] -> Int` 表示"会用 3 次"——`[3]` 就是 coeffect 标注
- 为什么信息流分析（high/low 安全标签）和线性类型用同一套规则证明定理——半环换一下而已
- 为什么 Idris 2 把"线性、依赖、相关性"全压进一个 `0 1 ω` 的 multiplicity——这是 coeffect 思想的工业落地

## 核心要点

coeffect 只改一件事：把类型判断从 `Γ ⊢ e : τ`（环境 Γ 推出表达式 e 是类型 τ）升级成 `Γ @ r ⊢ e : τ`，多了个 **r**——上下文需求标注。

三个关键词：

1. **半环（semiring）**：r 取值的代数结构，有"加法"（选择 / 并行用）和"乘法"（顺序 / 串接用）。线性类型用 `{0,1}`，仿射类型用 `{0,1,ω}`，reactive 用自然数（"过去 N 帧"）。

2. **structural vs flat**：
   - structural（结构性）：每个变量自己带 r，写成 `x:τ@1, y:τ@ω`——典型如线性类型
   - flat（扁平）：整个上下文共享一个 r——典型如 "我整体需要过去 3 个时间步"

3. **lambda / 应用规则**：抽象时把变量从 Γ 搬到箭头上，`τ ─[r]→ σ`；应用时用半环乘法把调用方的 r 和函数本身的 r 组合起来。规则形式跟 effect 系统**几乎对称**，但流向相反。

一句话总结：**effect 是写出去的账单，coeffect 是收进来的发货单**。

## 实践案例

### 案例 1：线性类型就是 coeffect 的最简实例

```text
f : Int @1 -> Int       // 必须用 1 次
g : Int @0 -> Int       // 不能用（unused）
h : Int @ω -> Int       // 用任意次（普通函数）
```

半环 `{0, 1, ω}`：

- `0 + 0 = 0`，`1 + 1 = ω`（用两次 = 不再线性）
- `0 · r = 0`（没调用 = 没需求），`1 · r = r`，`ω · r = ω`

写 Rust 时你感受到的"借用一次就消耗"，本质就是这个半环。

### 案例 2：reactive 系统的"我要过去 N 帧"

Petricek 自己的研究背景是数据流（Lucid 风格），里面有个内置算子 `prev`（取上一个时刻的值）：

```text
filter (x : Stream) = (x + prev x + prev (prev x)) / 3
```

这个 `filter` 需要"当前 + 过去 1 + 过去 2 帧"，coeffect 标注就是 `Stream @2 -> Stream`。半环换成 `(ℕ, max, +)`：

- 并行（max）：两个分支各要过去 2 帧 / 3 帧 → 整体要过去 3 帧
- 串接（+）：filter1 要 2 帧、filter2 要 1 帧、串起来要 3 帧

类型系统在编译期就告诉你"需要 buffer 多大"。

### 案例 3：implicit parameters 也是 coeffect

Haskell 的 `?x :: Int` 隐式参数，本质是函数声明"我需要环境里有这个名字"。把 r 取成"需要的隐式参数集合"，半环用集合并集，规则跟前面一样跑得通。

```text
double : Int @{?factor} -> Int
double x = x * ?factor
```

调用 `double 3` 时，类型系统检查环境里有没有 `?factor`，没有就报错。

## 踩过的坑

1. **coeffect 不是 effect 的"反过来"那么简单**：你不能把 effect 系统直接倒过来当 coeffect。流向反了，但代数结构、分配律、subtyping 都要重新设计。

2. **半环必须满足分配律**（`r · (s + t) = r·s + r·t`），否则 lambda 和 let 的规则会冲突。早期论文有些半环漏了这条，证明走不下去。

3. **structural 和 flat 不能混用**：ICALP 2013 给了两套 calculus，2014 ICFP 论文才开始尝试统一。直到 2018 年 graded modal types 出来才真正合一。

4. **半环上的偏序很容易忘**：subtyping `r ≤ r'` 决定"我只用 1 次的函数能不能传给要求最多 ω 次的位置"。Granule 早期版本这里出过 bug。

5. **不要把 coeffect 当万能锤**：纯副作用（IO、异常）是 effect 的事，硬塞进 coeffect 反而把模型搞复杂。

## 适用 vs 不适用场景

**适用**：

- 线性/仿射类型语言（Granule / Idris 2 QTT / Linear Haskell）
- 隐式参数、capability 类型
- Reactive / streaming 系统的静态 buffer 推导
- 信息流安全（high/low 标签传播）
- Partial evaluation 的 binding-time 分析

**不适用**：

- 纯输出方向的副作用（IO / 异常 / 全局状态）→ 用 effect 系统或 algebraic effects
- 动态类型语言的运行时检查 → coeffect 是静态系统
- 不需要 per-variable 精度的整体分析 → 杀鸡用牛刀

## 历史小故事（可跳过）

- **1988 年**：Lucassen-Gifford 提出 effect system，开启了"输出方向"30 年的研究。
- **1992 年**：Wadler 把 Girard 的线性逻辑搬进类型系统——其实是 coeffect 的早期特例，但当时没人这么命名。
- **2013 年**：Petricek（剑桥博士生）+ Orchard + Mycroft 在 ICALP 发表 "Coeffects"，第一次把 structural（per-variable）和 flat（context-wide）两种用法统一在一个名字下。
- **2014 年**：同作者在 ICFP 给出完整 calculus 和 categorical semantics（"A Calculus of Context-Dependent Computation"），是这一篇通常被引用的版本。
- **2019 年**：Orchard 等人发布 **Granule** 语言，把 coeffect 作为核心特性，写 `Int [3]` 这种 graded type。
- **2020+**：Atkey / McBride 推到依赖类型 → **Quantitative Type Theory（QTT）**，落地为 **Idris 2** 的 multiplicity（`0 1 ω`）。

理论 → 落地走了 6 年，比 HM 的 13 年快多了——靠的是 effect 系统已经铺好的一半路。

## 学到什么

1. **类型系统有方向性**：输出（effect）和输入（coeffect）是对偶维度，过去只看一面，等于丢了一半。
2. **半环是资源计量的最小代数**：加法 = 选择，乘法 = 顺序，能套进半环的几乎都能做静态分析。
3. **看似无关的系统其实是同一个骨架的实例**：线性、仿射、隐式参数、信息流、binding-time——换个半环就是换个系统。
4. **graded modal types**（写作 `[r]A`）是 coeffect 的现代呈现，已成为 Granule / Idris 2 / Agda 共用的工业语言。
5. **理论的价值在于"把不同的东西看成一样的"**——这才是统一的力量。

## 延伸阅读

- 论文 PDF：[Petricek, Orchard, Mycroft 2014 — Coeffects (ICFP)](https://www.cl.cam.ac.uk/~dao29/publ/coeffects-icfp14.pdf)（30 页，正文密度高，先看 §2 直觉再看 §4 calculus）
- Granule 语言：[granule-project.github.io](https://granule-project.github.io/)（直接玩 coeffect 的 playground）
- Atkey 2018：[Syntax and Semantics of Quantitative Type Theory](https://bentnib.org/quantitative-type-theory.html)（QTT 数学基础）
- Idris 2 multiplicities：[Idris 2 docs — Multiplicities](https://idris2.readthedocs.io/en/latest/tutorial/multiplicities.html)（工业落地版）
- Orchard 视频：[YouTube — Granule and Coeffect Calculi](https://www.youtube.com/watch?v=fBCT7ZmMr1k)（作者亲讲，1 小时）

## 关联

- [[effect-handlers]] —— 输出方向的 effect 系统，coeffect 的对偶兄弟
- [[linear-types]] —— coeffect 最简单也是最早的实例
- [[tofte-talpin-regions]] —— 区域推导也是一种 coeffect（"需要哪个 region"）
- [[ci-effects]] —— effect 类型系统综述，对照阅读
- [[system-f-reynolds-1974]] —— 多态类型的源头，coeffect 是它的资源量化扩展
- [[hindley-milner]] —— 类型推导的鼻祖，coeffect 在它之上加"用了几次"维度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[row-polymorphism-remy]] —— Row Polymorphism — 让函数不必知道 record 的全部字段
