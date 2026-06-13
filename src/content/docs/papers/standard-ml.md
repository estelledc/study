---
title: Standard ML — 让编译器替你把类型补完
来源: Milner, Tofte, Harper, "The Definition of Standard ML", MIT Press 1990
日期: 2026-05-29
子分类: 编程语言
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

Standard ML（**SML**）是 1973-1990 年间在爱丁堡大学造出来的一门小语言。日常类比：像一个**会把你的草稿改完整再交给你的助手**——你写"小明吃了苹果"，助手默默把"小明是人、苹果是水果、动作是吃"这些隐含信息全部补完，再交回给你。

你写：

```sml
fun add x y = x + y
```

你**没标任何类型**。SML 编译器读完，自动得出 `add : int -> int -> int`，一切由它替你想。

它是历史上**第一门把"类型自动推导 + 完整数学定义"两件事同时做对的工业语言**。OCaml / Haskell / F# / Rust / Swift 的核心特性都从这里抄走。

## 为什么重要

不理解 SML，下面这些事都没法解释：

- 为什么 OCaml / Haskell 写得像 Python，但运行时**不会突然 `undefined is not a function`**——SML 1990 年第一次给整门工业语言写完整形式语义
- 为什么 Rust 的 `enum` + `match` 看着像新东西——SML 1973 年就有了，叫 `datatype` + pattern matching
- 为什么 TypeScript 5.0 加了 `satisfies` 操作符还在追"类型推导友好度"——SML 1978 就解决了大部分问题
- 为什么 Swift / Rust 的 `Option<T>` / `Result<T, E>` 长得像孪生兄弟——它们都是 SML 代数数据类型的翻版

## 核心要点

SML 的三大支柱：

1. **类型推导**：你不写类型，编译器自己推。背后是 [[hindley-milner]] 算法。类比：助手看你写"3 + 1"，自动知道 `3` 是数字，不用你标"我这里写的是数字"。

2. **代数数据类型 + pattern matching**：用 `datatype` 一行声明一种数据可能的所有形态，用 `|` 多分支匹配。类比：超市分类——"蔬菜"下面只有"叶菜 / 根菜 / 瓜类"三种，结账时收银员**必须**对三种都报价，漏一种系统不让走。

3. **模块系统（functor）**：模块本身是一种"函数"——给我一个能比较的类型，我给你一个该类型的集合实现。类比：橱柜厂的流水线——你扔木材进去，机器吐成品出来，木材规格不同，吐出的橱柜规格也不同。

三者合在一起，就让"短代码 + 强保证"成为可能。

## 实践案例

### 案例 1：列表长度——3 行学会 SML 的两个关键字

```sml
fun length [] = 0
  | length (_ :: xs) = 1 + length xs
```

**逐部分解释**：

- `fun` 是定义函数的关键字（function 缩写）
- `[]` 是空列表 pattern——匹配"空"这种情况
- `_ :: xs` 是 cons pattern——`::` 读作 "cons"，把"头元素"和"尾列表"拼起来；`_` 表示"我不关心这个值"，`xs` 是给尾列表起的名字
- 两条 `|` 分支：要么是空（返回 0），要么是非空（1 + 尾列表长度）
- **没有 if-else**——pattern matching 直接按形状分流
- **没有标类型**——SML 推出 `length : 'a list -> int`（任意类型的 list 都能算长度）

### 案例 2：二叉树——一行声明数据形态

```sml
datatype 'a tree = Leaf
                 | Node of 'a * 'a tree * 'a tree

fun depth Leaf = 0
  | depth (Node (_, l, r)) = 1 + Int.max (depth l, depth r)
```

**逐部分解释**：

- `'a` 是类型变量——这棵树可以装任意类型的值（int tree、string tree 都行）
- `Leaf` 是空树构造子；`Node of 'a * 'a tree * 'a tree` 是非空节点（一个值 + 左子树 + 右子树）
- `depth` 函数对两种形态分别处理；编译器**强制**你写完所有 case，漏一个就给警告

这种"用一行声明数据有几种可能形态"的能力，到 2015 年才被 Rust `enum` 抄过去，2020 年才被 Python 3.10 `match` 抄过去。SML 1973 年就有了。

### 案例 3：functor 一句话

```sml
functor MakeSet (E : ORDERED) : SET = struct ... end
```

读作：**"给我一个能比较大小的类型 E，我吐出一个 E 的集合实现给你"**。这是"模块作为函数"的语法——OCaml 直接搬走，至今仍是 OCaml 最强大的特性之一。详细教程见[OCaml functor 章节](https://dev.realworldocaml.org/functors.html)（SML 和 OCaml 的 functor 写法基本一致）。

## 踩过的坑

1. **`fun` 不等于 `val`**：`fun f x = x + 1` 是定义函数，`val f = fn x => x + 1` 也是，但语法不一样。pattern matching 多分支只能用 `fun`，不能用 `val`。新人常混淆。

2. **`=` 在 `fun` 里和 `=` 在 `if` 里含义不同**：`fun f x = ...` 里 `=` 是"定义"，`if x = 1 then ...` 里 `=` 是"判等"。两个含义共用一个符号，刚学时绕。

3. **value restriction 让你以为编译器在为难你**：`val r = ref []` 编译器拒绝给它多态类型（防止"先存 int 再当 string 取出"的洞）。新人不懂为什么明明合理却报错，详见 [[hindley-milner]] 踩坑章节。

4. **错误信息读不懂**：HM 推到中途碰矛盾，会报"int 和 string 不匹配在第 17 行"，但矛盾**根因**可能在第 5 行某个变量名写错。SML/NJ 的错误信息历来是著名痛点。

## 适用 vs 不适用场景

**适用**：
- 编译器 / 解释器 / 定理证明器实现（CompCert、Coq、Isabelle 都是 ML 系语言写的）
- AST 重度处理的场景——pattern matching + ADT 比 visitor pattern 短 5 倍
- 教学场景——讲清楚"什么是类型推导、什么是代数数据类型"，SML 是最干净的例子
- 想体验"完整形式定义的工业语言"长什么样

**不适用**：
- 想要大生态——SML 用户已极少，npm/crates 这种规模的包仓库不存在，标准库分裂在 SML/NJ vs MLton vs Moscow ML
- 系统级编程——没有 lifetime、ownership 概念（去用 [[rust]]）
- Web 前端 / 移动端——没有主流编译目标
- 想用类型类 / trait——SML 不支持（去用 Haskell / Rust）

## 历史小故事（可跳过）

Robin Milner 1973 年到爱丁堡，启动 LCF 项目（一个辅助证明程序正确性的定理证明器）。他需要一种语言写证明策略——要类型安全（错误策略不能绕过逻辑）、要高阶函数（策略组合策略）、要多态（一个 `compose` 对任意类型工作）。

他设计的这门语言就叫 ML（**M**eta **L**anguage）。1978 年他证明了 [[hindley-milner]] 类型推导可判定，论文 28 页。1983 年提议标准化，1990 年三人组（Milner + Tofte + Harper）出版《The Definition of Standard ML》——**用形式推理规则把整门语言写下来**，包括动态语义、静态语义、模块系统。整个工业界没有第二门语言达到这个水平（Java、C# 标准只是自然语言描述）。

但 SML 工业上输了——Haskell（1990）抢走了纯函数式社区，OCaml（1996，从 ML 分叉）抢走了"工业可用 ML"社区，F#（2005，微软）抢走了 .NET 生态。**SML 的核心贡献全员被借走，自己却没有用户**——这是技术上正确、产品上失败的经典案例。

## 学到什么

1. **"短代码 + 强保证"是可以兼得的**——HM 推导 + ADT + pattern matching 三件套，是过去 50 年程序设计语言最重要的组合
2. **形式语义不是奢侈品**——给一门语言写完整形式定义虽然贵，但它让 type safety 这种基本性质能被**证明**而不是"靠测试碰运气"
3. **技术正确 ≠ 产品成功**——SML 设计正确、定义严谨，但缺统一仓库、缺 BDFL、缺商业赞助，结果 OCaml / Haskell / Rust 各自借走一部分赢了市场
4. **借鉴比原创更容易胜出**——后来者只挑最有用的部分搬走、扔掉学术包袱，反而跑得更快

## 延伸阅读

- 入门教程：[Programming in Standard ML by Robert Harper](https://www.cs.cmu.edu/~rwh/isml/book.pdf)（CMU 课本免费 PDF，180 页讲完核心）
- 在线 REPL：[SML/NJ Web REPL](https://smlfamily.github.io/)（不用装环境直接试）
- 现代 ML 入门：OCaml 教材 [Real World OCaml](https://dev.realworldocaml.org/)（SML 思想的现代工业版）
- [[hindley-milner]] —— SML 的类型推导引擎
- [[lambda-calculus]] —— SML core 的数学根
- [[mccarthy-lisp]] —— SML 借走了 first-class function、recursion、cons cell

## 关联

- [[hindley-milner]] —— SML 第一个工业实现 HM 推导
- [[lambda-calculus]] —— SML core 是 typed lambda calculus 的工业版
- [[mccarthy-lisp]] —— first-class function 思想的来源
- [[algol-60]] —— 静态作用域 + 块结构的来源
- [[smalltalk]] —— 同期对照：Smalltalk 走 OO，SML 走代数数据类型
- [[rust]] —— SML 的 ADT + pattern matching 现代继承者
- [[llvm]] —— 现代编译器后端，与 SML 同样致力于"少手写、多自动推"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[doligez-leroy-concurrent-gc]] —— Doligez-Leroy GC — OCaml 多线程并发垃圾回收
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[language-server-protocol-spec]] —— Language Server Protocol — 让编辑器共享同一套「语言大脑」的 USB 协议
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[row-polymorphism-remy]] —— Row Polymorphism — 让记录类型可扩展又不丢类型安全
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器

