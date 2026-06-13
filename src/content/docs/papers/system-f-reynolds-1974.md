---
title: System F — 让类型也能像参数一样被传递
来源: 'John C. Reynolds, "Towards a Theory of Type Structure", Programming Symposium 1974 (LNCS 19)'
日期: 2026-05-29
子分类: ml
分类: 编程语言
难度: 高级
provenance: pipeline-v3
---

## 是什么

System F（系统 F，又叫**多态 λ 演算**或**二阶 λ 演算**）是 Reynolds 1974 提出的一套形式系统，**让"类型"本身也能像数字一样作为函数的参数被传递**。

日常类比：你在淘宝填快递地址，先准备一个"模板"——【收件人 X，地址 Y】——下单时再代入"张三 / 北京"。System F 把这件事提到了**类型层**：函数的类型不再写死成 `int → int`，而是写成 `T → T`，**调用时再说"这次 T 是 int"**。

写一个对所有类型都通行的恒等函数 `id`：

```
Λα. λx:α. x  :  ∀α. α → α
```

这里 `Λα` 是"类型抽象"——大写 lambda；`∀α` 读作"对任意类型 α"。这是**参数化多态**最干净的数学形式，也是 Java `<T>` / Rust `<T>` / Haskell `forall a` 的共同祖先。

## 为什么重要

不理解 System F，下面这些事都没法解释：

- 为什么 Java `List<T>`、Rust `Vec<T>`、TypeScript `<T>` 都长得像——它们都是 System F 的衣冠后裔
- 为什么 Haskell 的 `id :: a -> a` 一个签名就能用在 int / string / List 上而不复制代码
- 为什么 [[hindley-milner]] 能"自动推类型"但放到 full System F 上就推不动了——Wells 1994 证明 System F 的类型推断**不可判定**
- 为什么 [[theorems-for-free]] 说"看签名就能写定理"——这是 Reynolds 参数性定理白送的礼物

## 核心要点

如果说 [[lambda-calculus]] 让"函数"成为一等公民，[[hindley-milner]] 让"占位符 α"能在编译期被推出来，那 System F 是**让 α 自己也成为函数能接收的参数**。

System F 在 [[lambda-calculus]] 上加了**两个新动作 + 一个新类型构造子**：

1. **类型抽象（Λ）**：写函数前先说"我这个函数对任意类型 α 都成立"。类比：写合同模板时空出"甲方 ___"，留给签约时填。

2. **类型应用**：调用时把具体类型代入。`id [int] 42` 表示"把 id 的 α 换成 int，再传 42"。日常工业语言隐藏了这步 `[int]`，由编译器替你填。

3. **全称类型（∀）**：函数的类型本身长成 `∀α. α → α`，读作"对任意 α，这是个 α → α 的函数"。`∀` 和值层的 `λ` 对偶，处于"类型层"。

4. **参数性（parametricity）**：Reynolds 的"抽象定理"——一个 `∀α. α → α` 类型的函数**只能是 id**，因为它对 α 一无所知，不能凭空造一个 α 类型的值。这条性质后来被 Wadler 推广成 [[theorems-for-free]]。

## 实践案例

### 案例 1：你写 Rust 时其实在用 System F

```rust
fn id<T>(x: T) -> T { x }
let n: i32 = id(42);
let s: &str = id("hello");
```

**逐部分解释**：

- `<T>` 就是 Reynolds 的 `Λα`——类型抽象
- 调用 `id(42)` 时，Rust 编译器自动推出 `T = i32`，相当于显式写 `id::<i32>(42)`——这就是"类型应用"
- 这是 System F 在工业语言里最直接的化身，只是语法用尖括号代替了 Λ

### 案例 2：参数性给的"白送定理"

考虑一个函数签名：

```haskell
f :: [a] -> [a]
```

Reynolds 的参数性告诉你：**不看实现也能保证**——`f` 不论怎么写，都满足 `map g (f xs) = f (map g xs)`。理由：`f` 对 `a` 一无所知，唯一能做的就是搬运 / 删除 / 复制元素，不能凭空造一个 a。这就是 Wadler "Theorems for free" 的来源。

### 案例 3：用 System F 编码自然数

```
Nat   = ∀α. (α → α) → α → α
zero  = Λα. λs:α→α. λz:α. z
succ  = λn:Nat. Λα. λs:α→α. λz:α. s (n [α] s z)
```

**逐部分解释**：

- 自然数被定义为：对任意 α，给我一个"后继操作 s"和"起始 z"，把 s 应用 n 次
- `zero` 不应用 s，直接返回 z
- `succ n` 在 n 次基础上再多应用一次 s
- 这种"用纯 λ 表达数据"的编码叫 **Church 编码**——System F 强到能**内置**编码所有归纳数据类型，不需要额外语法
- 同样的套路能编码布尔值、List、Tree 等等：`Bool = ∀α. α → α → α`、`List τ = ∀α. (τ → α → α) → α → α`

## 踩过的坑

1. **System F 类型推断不可判定**：Wells 1994 证明，没显式类型注解时编译器**无法**总能猜出类型。这就是为什么实际语言（Haskell 98 / OCaml）退到 [[hindley-milner]] 这个能推的子集，把"高阶多态"留给注解。

2. **多态 ≠ 重载**：System F 的多态是"一份代码、对所有类型一视同仁"；C++ / Rust trait 的"为每个类型生成一份专门版本"叫**特设多态**（ad-hoc polymorphism）。前者参数性成立，后者不成立——这是为什么 trait 的方法可以做 if/else 而泛型 id 不行。

3. **`seq` 破坏参数性**：Haskell 加了 `seq` 强求值后，看起来有 `∀α. α → α` 类型的函数可能在某些 α 下死循环、其它 α 下正常返回——参数性洞被 `seq` 戳了。"白送定理"在生产 Haskell 里需要谨慎。

4. **存在类型 ≠ 全称类型**：`∀α. α → α` 是"对任意 α 我都行"；`∃α. α × (α → int)` 是"存在某个 α 我藏着不告诉你"。前者是泛型；后者是抽象数据类型（ADT 的接口）。Reynolds 1974 同时讨论了两者，这是 OOP 抽象类的理论根。

## 适用 vs 不适用场景

**适用**：
- 函数式语言泛型设计（Haskell / OCaml / SML）的理论参照
- Rust / Java / TypeScript 泛型语义的形式化解释
- 形式化证明工具（Coq / Agda）的核心 calculus 内核
- 推导"白送定理"——只看签名就能推出实现必须满足的代数律

**不适用**：
- 想让编译器全自动推所有类型 → 退到 [[hindley-milner]]
- 需要类型类 / 接口（trait）→ System F 没有，需扩展（Haskell type class / Rust trait）
- 需要依赖类型（类型依赖于值）→ 用 Calculus of Constructions / Agda
- 工业级带状态副作用的语言 → System F 是"教学/证明用的纯系统"，工程上要再加 monad / [[effect-handlers]] / 区域

## 历史小故事（可跳过）

- **1972 年**：Jean-Yves Girard 在博士论文里发明 System F——但他的动机是**证明论**：用它证明二阶算术的一致性。一行代码都没跑过。
- **1974 年**：John Reynolds 在巴黎 Programming Symposium 独立提出同一套系统，标题《Towards a Theory of Type Structure》——他的动机是**程序设计语言**：怎么形式化"用户定义类型 + 数据抽象"。
- **1983 年**：Reynolds 在《Types, Abstraction and Parametric Polymorphism》里把"参数性"写成抽象定理，奠定了"看签名推性质"的理论基础。
- **1990 年**：Reynolds 与 Plotkin 把"两人独立发现的同一套系统"形式化为 **Girard-Reynolds isomorphism**——证明从证明论和程序设计两个方向看的是同一个东西。
- **1994 年**：Wells 证明 full System F 类型推断不可判定——给"为什么 Haskell 没用 full System F"画了句号。
- **2000s 后**：System F 各种扩展（Fω 加类型层函数 / F<: 加子类型 / 依赖类型）成了所有现代类型理论教材的起点。

## 学到什么

1. **类型可以是参数**——这是过去 50 年类型系统最重要的一个抽象台阶；OOP 的"泛型"和 FP 的"多态"在这里同源
2. **抽象 / 多态 / 信息隐藏**这些 OOP 课堂讲的概念，在 System F 里都有干净的数学定义（∀ 是泛型；∃ 是抽象类）
3. **表达力 vs 可判定性**永远在拉锯：System F 表达力强但推不动；HM 推得动但表达力受限；中间挤出了 [[bidirectional-typing]] 这条折中路
4. **参数性是免费的礼物**——签名 `∀α. α → α` 不光是类型，还是个定理：函数必然是 id

## 延伸阅读

- 论文 PDF（CMU 镜像，扫描版 18 页）：[Reynolds 1974 Towards a Theory of Type Structure](https://www.cs.cmu.edu/afs/cs/user/crary/www/819-f09/Reynolds74.pdf)
- 同源姊妹篇：[Wikipedia — System F](https://en.wikipedia.org/wiki/System_F)（含 Girard 1972 与 Reynolds 1974 双线对照）
- Wadler 视频：[Propositions as Types](https://www.youtube.com/watch?v=IOiZatlZtGU)（讲 Curry-Howard 同构，背景就是 System F）
- 教材：Pierce《Types and Programming Languages》第 23 章——把 System F 拆成可上手的练习
- [[theorems-for-free]] —— Wadler 把 Reynolds 参数性变成"看签名写定理"的工业用法
- [[hindley-milner]] —— System F 的"能推子集"，工程上更常用

## 关联

- [[lambda-calculus]] —— System F 是它加上"类型层 Λ / ∀"的二阶扩展
- [[hindley-milner]] —— HM 是 System F 的可推子集，工业语言常用此版
- [[theorems-for-free]] —— Reynolds 参数性的直接应用，把签名变定理
- [[bidirectional-typing]] —— 给 full System F 凑出可推的折中方案
- [[standard-ml]] —— SML 的 functor 系统是 System F 多态的早期工业落地
- [[linear-types]] —— 沿"加约束扩展 System F"这条路走出的另一支
- [[godel-1931]] —— Girard 那条线的祖师爷：System F 能用来证明二阶算术一致性

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[coeffect-petricek]] —— Coeffects — 让类型系统追踪「需要多少上下文」
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[linear-types]] —— 线性类型（Linear Types）
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[row-polymorphism-remy]] —— Row Polymorphism — 让记录类型可扩展又不丢类型安全
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[scott-strachey-denotational]] —— Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理

