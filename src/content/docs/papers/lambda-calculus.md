---
title: λ-演算 — 用三条规则表达所有可计算函数
来源: Alonzo Church, "An Unsolvable Problem of Elementary Number Theory", American Journal of Mathematics, 1936
日期: 2026-05-29
子分类: 编程语言 / 计算理论
分类: 编程语言
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

λ-演算（lambda calculus）是**用三条规则把"函数"当一等公民**的最小语言。日常类比：函数就是一张写着规则的纸条——纸条上写「拿一个 x，给我 x+1」，把它"应用"到 2，就是把所有 x 涂改成 2，算出 `2+1=3`。

写成 λ 记号：

```lambda
(λx. x + 1) 2  →  2 + 1  →  3
```

整个 λ-演算只有**变量、抽象（写函数）、应用（调函数）** 三种构造。其他所有东西——数字、Boolean、列表、递归——都用这三种自己堆出来。1936 年 Church 的 18 页论文，是后来所有函数式语言（Lisp / ML / Haskell / Scala）的根。

## 为什么重要

不理解 λ-演算，下面这些事都没法解释：

- 为什么 Lisp / Haskell / OCaml 把"函数"和"数据"混着用而不别扭——它们就是 λ-演算的工业化版本
- 为什么 1936 年的 18 页论文还在影响 React Hooks 写法（`useMemo` / `useCallback` 是显式 closure，本质就是 λ）
- 为什么编译器敢做激进优化（inline / 死代码消除）而不改语义——背后是 λ-演算的 **Church-Rosser 合流性**做担保
- 为什么 Church-Turing 论题说"所有可计算的函数集是绝对的"——λ-演算和图灵机能算的东西**完全相同**

## 核心要点

λ-演算的全部内容可以拆成 **三块**：

1. **三种构造**：变量 `x` / 抽象 `λx. M`（写函数） / 应用 `M N`（调函数）。类比：纸条玩法只有三种——「写一个名字」「写一张新纸条」「拿纸条套上输入」。仅此而已。

2. **β-归约**（β-reduction）：把 `(λx. M) N` 变成 `M[N/x]`——也就是把 M 里所有 x 替换成 N。类比：把纸条上的占位符全涂改成实际食材。这是 λ-演算**唯一**的计算规则。

3. **Church encoding**：用 λ 自己造数字、Boolean、Pair。比如 `2 = λf. λx. f (f x)`——「2」就是「把 f 重复用 2 次」。**所有数据结构都是函数**，没有原生的数字或布尔值。

附加点：**α-换名**（`λx. M` 等价于 `λy. M[y/x]`，只要 y 不冲突）解决变量捕获问题。这是后来"作用域"概念的最早形式化。

## 实践案例

### 案例 1：一步 β-reduction

```lambda
(λx. x + 1) 2
```

**逐步解释**：

1. 看到 `(λx. ...) (something)` 这种形式，叫一个 **redex**（可归约项）
2. β-归约：把右边的 `2` 涂改进左边所有 `x` 的位置 → `2 + 1`
3. 算术规则求值 → `3`

注意第 3 步严格说不是 λ-演算本身——纯 λ 里 `+` 也得用 Church encoding 编出来（见案例 2）。

### 案例 2：Church Numerals — 用函数当数字

```lambda
0 = λf. λx. x          —— f 应用 0 次
1 = λf. λx. f x        —— f 应用 1 次
2 = λf. λx. f (f x)    —— f 应用 2 次
```

**逐部分解释**：

- 每个数字都是**双参数函数**：先收 f，再收 x
- 数字 n 的"含义"是「把 f 套在 x 上 n 次」
- 加法定义为 `ADD = λm. λn. λf. λx. m f (n f x)`——读作「把 f 应用 m+n 次」

这是 1936 年最震撼的洞见之一：**数据本身可以是行为**，而不是被动的存储。后来 [[hindley-milner]] 类型系统、Haskell 的 GADT 编译、tagless final 风格，都借鉴了这个思路。

### 案例 3：Y Combinator — 在没有名字的语言里造递归

λ-演算里没有 `let`，没有变量名，怎么写递归？答案是 **不动点组合子 Y**：

```lambda
Y = λf. (λx. f (x x)) (λx. f (x x))
```

性质：`Y g = g (Y g)`，让任意函数 `g` 通过 Y 实现自我引用。

直觉：把"自我引用"外包给 Y，让 Y 帮你不断展开自己。Paul Graham 的创业孵化器 YC 就是致敬这个名字。详细推导这里不展开，留给延伸阅读里的 Hofstadter 章节。

## 踩过的坑

1. **变量捕获**：`(λx. λy. x) y` 不能直接代入——外层 `y` 会被内层 `λy` 错误绑定。必须先 α-换名成 `(λx. λz. x) y`，再 β-归约得 `λz. y`。所有写过编译器的人都被这个坑过——GHC、SBCL、Rustc 在做 inline / 宏展开时都要"fresh variable"。

2. **Ω 死循环**：`(λx. x x) (λx. x x)` 是合法 λ-term，但 β-归约后还是它自己，永远不停。**有些程序永不停机**——这是 [[turing-1936]] 停机问题的 λ-版本。

3. **求值顺序影响停机性**：`(λx. y) ((λw. w w) (λw. w w))` 这个表达式，先归约外层得 `y`（1 步），先归约内层永不停。Haskell 选 normal order（lazy），ML 选 applicative order（eager），代价不同——前者难推理空间复杂度（thunk 堆积），后者写不了优雅的无限列表。

4. **Untyped λ 不安全**：纯 λ-演算是 Turing-complete 的，但没有类型保护。STLC（简单类型 λ-演算）加了类型，强保证所有 term 都有正规形（不死循环），代价是不再 Turing-complete——你写不了通用解释器，写不了 Y。表达力 vs 安全性的张力贯穿整个现代类型论。

## 适用 vs 不适用场景

**适用**：
- 理解函数式语言（Lisp / ML / Haskell / Scala）的设计——它们就是 λ 的工业化版本
- 推导编译器优化的正确性——β-η 等价是 GHC 做激进优化的理论基础
- 理解 [[hindley-milner]] / System F / Calculus of Constructions 这些类型系统
- 解释 React Hooks / closures / currying 这些"现代"特性的本质

**不适用**：
- 直接做性能编程——Church encoding 比 native int 慢几个数量级
- 建模硬件 / 并发原语——用 [[turing-1936]] 心智模型更自然
- 命令式风格的代码组织——λ 强迫你想"函数 + 不可变"，业务代码常常需要副作用
- 教零基础学生第一门编程语言——抽象层太高，先学命令式入门更友好

## 历史小故事（可跳过）

1936 年春天，普林斯顿的 Alonzo Church（32 岁）和剑桥的 Alan Turing（24 岁）几乎同时解决了 Hilbert 的 Entscheidungsproblem——Church 用 λ-演算，比 Turing 早几个月发表。Turing 当时正打算去普林斯顿读博，看到 Church 的论文后直接改投 Church 做导师。1937 年师徒俩证明 λ-演算和图灵机等价（同样的可计算函数集），就是后来的 **Church-Turing 论题**。Church 的学生谱系包括 Turing、Kleene、Dana Scott、Michael Rabin——直接创建了「可计算性 + 类型论 + 模型论」三大领域。

## 学到什么

1. **少量基本规则可以表达全部**——三种构造 + 一条归约规则，就够表达所有可计算函数。极简 = 强大
2. **数据 = 函数**：Church encoding 把数字、Boolean、列表全用函数堆出来。后来的 GADT / final encoding / tagless final 都是这个思想的延续
3. **理论先行 22 年**：1936 论文，1958 才有 Lisp 落地。好抽象需要等编译技术（graph reduction / closure conversion）追上来
4. **现代特性都能追到 1936**：闭包、高阶函数、currying、引用透明、effect handler——都在这 18 页里有原型

## 延伸阅读

- 视频：[Computerphile — Lambda Calculus](https://www.youtube.com/watch?v=eis11j_iGMs)（10 分钟讲清直觉，零基础友好）
- 入门教程：[Raul Rojas — A Tutorial Introduction to the Lambda Calculus](https://www.inf.fu-berlin.de/lehre/WS03/alpi/lambda.pdf)（11 页 PDF）
- 进阶教科书：Pierce, *Types and Programming Languages* (2002) 第 5-9 章，圣经级
- Y combinator 直觉：Hofstadter, *Gödel, Escher, Bach* (1979) 第 18 章
- 原始论文：[Church 1936](https://www.jstor.org/stable/2371045)（18 页，密度极高）
- [[turing-1936]] —— 同年发表的等价计算模型
- [[hindley-milner]] —— 给 λ-term 自动推类型的算法
- [[mccarthy-lisp]] —— 第一个 λ-启发的工业编程语言

## 关联

- [[turing-1936]] —— 同年的等价计算模型；Turing 后来成为 Church 的博士生
- [[hindley-milner]] —— 给 λ-term 贴类型的算法，1969-1982 数学到工程的桥
- [[mccarthy-lisp]] —— 1958 年第一个 λ-演算启发的编程语言
- [[standard-ml]] —— 把 λ + HM 类型系统打包成的工业语言
- [[church-rosser]] —— λ-演算的合流性定理，引用透明性的数学基础
- [[y-combinator]] —— 不动点组合子，在没名字的语言里造递归
- [[simply-typed-lambda]] —— 加了类型的 λ，强保证不死循环但不再 Turing-complete

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agda-norell]] —— Agda — 让你写代码的同时把数学也证明了
- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[fielding-rest-2000]] —— Fielding 2000 — 用约束推导法把 Web 的成功讲成了一门方法
- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[huffman-1952]] —— Huffman 编码
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[jax]] —— JAX — Google 函数式数值计算
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[knuth-taocp]] —— Knuth TAOCP — 计算机程序设计艺术
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[linear-types]] —— 线性类型（Linear Types）
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[llvm]] —— LLVM — 模块化编译器框架
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[netkat-2014]] —— NetKAT 2014 — 把网络转发写成可以做数学等式变换的代数式
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[plan9-1995]] —— Plan 9 — 把"一切皆文件"真的做到极致的下一代 UNIX
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[push-pull-frp]] —— Push-Pull FRP — Functional Reactive Programming 实用化
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[salsa-adapton]] —— Salsa / Adapton — 让程序只重算"真的变了"的那一小块
- [[scott-strachey-denotational]] —— Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[smalltalk-80]] —— Smalltalk-80
- [[ssa]] —— SSA — 静态单赋值形式
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[tensorflow]] —— TensorFlow — Google 端到端 DL 平台
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
- [[turing-1936]] —— Turing 1936 可计算性
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器

