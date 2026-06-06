---
title: Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
来源: 'Valentin Turchin, "The Concept of a Supercompiler", ACM TOPLAS 1986'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 高级
provenance: pipeline-v3
---

## 是什么

Supercompilation（**监督式编译**）是一种**编译器自己模拟程序执行一遍、把模拟轨迹整理成一棵树、再把树压回更高效程序**的程序变换技术。日常类比：像速记员先看完整场会议、把重复的发言折叠掉、再写出一份更短但意思一样的会议纪要。

你写一段程序：

```hs
-- 求 [1..n] 每个 +1 再求和
sum (map (+1) [1..n])
```

朴素执行会先建一个中间列表 `[2, 3, ..., n+1]`，再扫一遍求和。supercompiler 在编译期把 `map` 和 `sum` 的步骤同时展开、互相融合，最后输出一段**完全没有中间列表、只在循环里累加**的等价代码。这种"模拟一遍再回写"的能力比 partial evaluation 更强——partial-eval 只在已知输入处展开，supercompilation 即使输入完全未知也会主动找推广机会。

## 为什么重要

不理解 supercompilation，下面这些事都没法解释：

- 为什么 GHC 的 `SpecConstr` / `inline` / deforestation 能把 Haskell 的高阶抽象编译到几乎和手写 C 一样快
- 为什么"自动定理证明 = 程序变换"这条 30 年前的旧路径在现代 SMT 求解器里还在复现
- 为什么 Futamura 第一/第二投影"用 specializer 当编译器"听起来玄学但真的能跑
- 为什么现代 superoptimizer（LLVM Souper / Truffle/Graal）骨架仍然是 1986 年这套机制

## 核心要点

supercompilation 的核心动作可以拆成 **三步**，整体叫 **driving + generalization + folding**：

1. **driving（驱动）**：从程序入口出发，**用符号值**模拟每一步执行，生成一棵 process tree（过程树）。每个节点是一个 configuration——"当前环境绑定 + 当前要算的表达式"。类比：把代码当剧本，演员（变量）拿占位符上台，导演记下每一步动作。

2. **generalization（推广）**：树会无限长（递归函数自然如此），需要在"危险节点"把 configuration 抽象成更一般的形式（比如把具体的 `cons 1 xs` 变成 `cons a as`）。判断危险用 **whistle**——通常是 Higman 嵌入或同胚嵌入。类比：速记员发现"刚才那段话好像在重复"，赶紧标记一下。

3. **folding（折叠）**：当新 configuration 是树上某个祖先 configuration 的实例时，**回边接环**而不是继续展开。这样无限的树压成了有限的图。从这张图反生成的代码就是 **residual program（残差程序）**——和原程序语义等价，但已经把解释器开销、中间数据结构都压扁了。

## 实践案例

### 案例 1：deforestation（消除中间数据结构）

```hs
sumPlusOne n = sum (map (+1) [1..n])
```

**朴素执行**：先生成 `[1..n]`、再 map 出 `[2..n+1]`、再 sum。三遍扫描，两个中间列表。

**supercompilation 做的事**：

1. driving 把 `sum (map (+1) [1..n])` 当 configuration 起点，符号化展开 `[1..n]` 的 cons 结构
2. 一边 cons 一边推进 map 的 case 分析，再一路推进 sum 的累加
3. 第二轮 cons 时发现 configuration 形式与第一轮可同构折叠

最终 residual 程序变成：

```hs
go acc i n = if i > n then acc else go (acc + i + 1) (i+1) n
sumPlusOne n = go 0 1 n
```

零中间列表、单循环、tail-recursive。这就是 deforestation 的本质，也是 GHC 后端 fusion 的祖宗思想。

### 案例 2：解释器特化（Futamura 第一投影）

写一个 mini-lang 解释器 `eval :: Source -> Input -> Output`。给定一段固定源码 `src0`，supercompile `eval src0`：

- driving 把 `eval` 的解释循环按 `src0` 的 AST 结构展开
- 每个 case 分支变成针对 `src0` 具体节点的代码
- fold 出一段**只针对 `src0` 的专用 Haskell 代码**

相当于免费拿到了一个该语言的编译器。这就是 Futamura 1971 的"specializer-as-compiler"，supercompilation 是它能真做出来的机制之一。

### 案例 3：程序等价证明

`fact_recursive n` 和 `fact_iterative n` 算阶乘语义相同但写法不同：

```hs
factR 0 = 1
factR n = n * factR (n-1)

factI n = go 1 1 where
  go acc i = if i > n then acc else go (acc * i) (i+1)
```

各自做 supercompilation，得到两张残差图。如果两张图**同构**（变量 rename 后节点和边一一对应），就证明了两个程序等价。Turchin 团队的早期 Refal 系统就是这样做定理证明的——把"证明 A=B"归约为"supercompile A 和 B，看图同构"。

## 踩过的坑

1. **把 supercompilation 等同于 partial evaluation**：partial-eval 只在已知输入处展开，遇到未知就退化成调用；supercompilation 即使输入完全未知也会驱动整棵 process tree 找推广机会。强度差一档，能解决的问题集合也差一档（deforestation 是 supercompilation 才能做的）。

2. **把 driving 当成普通符号执行**：driving 不只展开，还会在 case 分支处把分支信息（"如果走这条边，那 x = cons head tail"）回传到下游 configuration，使后续节点带上下文约束。**正是这种信息回传**让中间数据结构能被消掉——普通符号执行做不到。

3. **忽略 whistle 和 generalization**：天真 driving 几乎一定生成无限树（递归函数永远展不完）。whistle（Higman 嵌入 / homeomorphic embedding）是工程上判定"该停了"的触发器；触发后 generalization 把 configuration 抽象到 lub（最小上界）。两者缺一不可，否则编译期不终止。

4. **期望 residual 一定更短/更快**：generalization 会损失精度，过度推广反而生成更慢的代码（多了运行时分支）。现代实现（multi-result supercompilation, distillation）核心工作就是在 size vs speed 上做权衡，而不是无脑融合。

## 适用 vs 不适用场景

**适用**：
- 函数式语言的深度优化（GHC、Refal、Sorensen-Gluck 的 first-order FL）
- 解释器特化 / DSL 编译（Futamura 投影的工程实现）
- 程序等价证明 / 简单定理证明（图同构归约）
- 现代 partial-eval JIT（Truffle/Graal 的 Tree-shaking 思想接近）

**不适用**：
- 命令式 / 副作用密集的语言：driving 必须追踪 store，复杂度爆炸
- 对编译时间敏感的场景：supercompilation 编译期开销极大（指数级 process tree 搜索）
- 需要可预测的 binary size：generalization 策略不当时残差会膨胀
- 嵌入式 / 受限内存：编译期内存占用难控

## 历史小故事（可跳过）

- **1960s-70s**：Valentin Turchin 在苏联科学院设计 Refal——一种以 pattern-match 字符串重写为核心的函数式语言，作为 metacomputation 研究载体
- **1980 年前后**：Turchin 在内部技术报告里第一次系统讨论"用 supervisor 跟踪计算"的想法，但只在 Refal 圈内流传
- **1986 年**：Turchin 在 ACM TOPLAS 发表本论文，把 supercompilation 概念第一次完整学术定型——driving / generalization / folding 三件套加 process tree 模型
- **1996 年**：Sorensen 和 Gluck 把 supercompilation 迁移到 first-order 函数式语言，做出 positive supercompilation——这是后续学术圈的主线
- **2007 年**：Hamilton 提出 distillation，比 supercompilation 更激进的变换框架，能消除更多中间结构
- **2010s 后**：思想扩散到 GHC SpecConstr、Truffle/Graal partial-eval、LLVM Souper superoptimizer

## 学到什么

1. **元解释 + 推广折叠**是程序变换的通用骨架——driving 找信息、generalization 控终止、folding 收回路
2. **partial evaluation ⊆ supercompilation**：前者是后者在 generalization 策略最保守、不主动推广时的退化情形
3. **理论 → 工程**隔了 10 年：1986 论文 → 1996 Sorensen-Gluck 落地 → 2010s 工业级 partial-eval JIT
4. **越强的程序变换 = 越难的终止性证明**：whistle 不是细节，它决定了机制能不能在编译期停下来
5. **同一份程序的多种写法可以收敛成同一张图**——这是把"等价证明"变成"图同构"的钥匙

## 延伸阅读

- 入门讲解：[Neil Mitchell — Supercompilation for Haskell](https://www.youtube.com/watch?v=zmfjGo36Geo)（用 GHC 视角讲一遍 driving / fold）
- Sorensen-Gluck 综述：[A Roadmap to Metacomputation by Supercompilation](https://link.springer.com/chapter/10.1007/3-540-61580-6_6)（学术圈主流入口）
- 论文原文 PDF（图书馆获取）：Turchin V., "The Concept of a Supercompiler", TOPLAS 1986（密度高，先看综述再回看原文不容易劝退）
- 距离 partial-eval 的位置：[[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 经典教材
- 现代落地参考：[[peyton-jones-stg]] —— GHC 的 STG 中间表示

## 关联

- [[partial-evaluation-jones]] —— Partial Evaluation 是 supercompilation 在不主动推广时的退化情形
- [[peyton-jones-stg]] —— GHC 的 STG + SpecConstr 把 supercompilation 思想做进工业编译器
- [[hindley-milner]] —— HM 推类型，supercompilation 推程序；都是"编译器自己推一遍"的范式
- [[landin-secd]] —— SECD 是抽象机求值的祖宗，process tree 可看作 SECD 的符号化版本
- [[cousot-abstract-interpretation]] —— 抽象解释也用"近似 + 不动点"，generalization 与之精神相通
- [[gadt-pjones]] —— GADT 让类型携带更多信息，driving 让 configuration 携带更多信息

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[pypy-tracing-jit]] —— PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法

