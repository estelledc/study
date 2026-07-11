---
title: Theorems for Free — 类型签名直接给定理
来源: Wadler, "Theorems for free!", FPCA 1989
日期: 2026-05-29
分类: 编程语言 / 类型理论
难度: 中级
---

## 是什么

Theorems for Free 这条思想说的是：在带"多态"的类型系统里，**一个函数的类型签名本身就蕴含一条数学定理**——你不用读它一行实现代码，就知道它必须满足某些性质。

日常类比：身份证号最后一位是**校验码**——你不用查户籍系统，光看号码就能验真假。多态类型签名是函数的"校验码"——光看签名就知道它能不能干某些事、必须满足哪些等式。

举个最有名的例子。Haskell 里你看到一个函数：

```haskell
r :: forall a. [a] -> [a]
```

读作"对任意类型 a，r 接收一个 a 的列表，返回一个 a 的列表"。光看这条签名，**你就能直接写出**下面这条等式：

```
对任意函数 f 和列表 xs：map f (r xs) = r (map f xs)
```

不管 r 是 reverse、take 3、drop 1、id、tail——**只要它的类型是 `forall a. [a] -> [a]`（没有 `Ord` 之类约束），这条等式必然成立**。这就是"免费定理"的意思——签名一写，定理免费送。

## 为什么重要

不理解这条思想，下面几件事都没法解释：

- 为什么 Haskell / Rust 程序员能直接从一行类型签名推出"输出元素必然来自输入"——他们不是在猜，是在用 free theorem
- 为什么 Haskell 的编译器（GHC）敢做 `map f (map g xs) = map (f . g) xs` 这种重写优化——根基就是类型签名对应的免费定理
- 为什么写自动测试的工具（QuickCheck）能用很少的测试覆盖泛型函数——parametricity 保证了泛化
- 为什么"类型驱动开发"不是口号，是有理论基础的——写好类型确实等于写好部分规范

## 核心要点

整套思想可以拆成三层：

1. **Parametricity（参数性）**：**多态函数对所有类型表现一致**——它不能"看穿"具体类型做不同的事。日常类比：搬家公司不管你箱子里装的是书还是衣服，搬运流程一样——这就是对内容物的 parametricity。

2. **Logical relation（逻辑关系）**：把"对所有类型一致"形式化——像给两套积木各画一张对照表，再检查函数在两边是否按同一规则搬运。给任意一对类型和它们之间的某个映射 f，多态函数在两边的行为可以**互相代入**而结果一致。这是 Reynolds 1983 的数学语言。

3. **Free theorem from type**：把上面两条规则机械地应用到一个具体类型签名上，就能**自动推出**该类型函数必满足的等式。Wadler 1989 把这步从"只有逻辑学家能做"变成"普通程序员能照菜谱做"。

## 实践案例

### 案例 1：reverse 的免费定理

类型签名：

```haskell
r :: forall a. [a] -> [a]
```

免费定理：`map f (r xs) = r (map f xs)`

**直觉解释**：因为 r 不知道 a 是什么类型，它**只能重排或丢弃元素，不能创造或修改元素值**。所以"先对每个元素加工再 r"和"先 r 再对每个元素加工"得到同样结果。

**手算验证**（用 r = reverse）：

```
xs = [1, 2, 3]
f  = (*10)

reverse xs           = [3, 2, 1]
map f (reverse xs)   = [30, 20, 10]

map f xs             = [10, 20, 30]
reverse (map f xs)   = [30, 20, 10]
```

两边相等。换 take 2、drop 1、tail 都能验证一致（注意：`sort` 需要 `Ord`，不算这个类型）。

### 案例 2：identity 函数的唯一性

类型签名：

```haskell
id :: forall a. a -> a
```

**逐步想**：

1. 函数收到一个 `a`，要对 `a` 一无所知——不能加、不能比、不能拆
2. 它能返回的 `a` 值**只可能是输入那个**（排除 ⊥/不终止，即"算不完"的情况）
3. 所以任何这种类型的实现，必然就是恒等函数

手算：`id 42 = 42`，`id "hi" = "hi"`——换类型结果仍是原值。**类型签名几乎决定了实现**。

### 案例 3：Haskell 编译器的重写优化

GHC 有规则：`map f (map g xs) = map (f . g) xs`——两次遍历合成一次。

手算跟做（`xs=[1,2]`，`g=(*2)`，`f=(+1)`）：

```
map g xs          = [2, 4]
map f (map g xs)  = [3, 5]
map (f . g) xs    = [3, 5]
```

两边相等。`map :: forall a b. (a -> b) -> [a] -> [b]` 的免费定理保证这条等式——GHC 的 fold/build deforestation 就靠这类定理做列表库优化。

## 踩过的坑

1. **遇到 ⊥（读作 bottom，意思是"算不完/崩溃"）和 `seq`（强制求值）时定理变弱**：`seq` 会戳破"懒得算"的外壳，让某些 corner case 等式失效。Johann-Voigtländer 2004 给出修补条件——工业用时要带"\*"号小心。

2. **类型类约束削弱 parametricity**：`r :: Ord a => [a] -> [a]` 的 `Ord` 告诉函数 a 上有比较，r 现在能 inspect 元素——免费定理变弱。实际 Haskell 代码大量用类型类，严格 parametricity 覆盖面比理论小。

3. **类型不是多态时定理立刻消失**：`[Int] -> [Int]` 没有 `forall a`，函数可以根据元素值做条件分支，没有免费定理。**parametricity 是类型的属性，不是函数的属性**。

4. **手算菜谱在深类型上爆炸**：类型嵌套 5 层以上，Wadler 菜谱展开会很复杂。工业实践靠工具自动化（在线工具 free-theorems.nomeata.de）。

## 适用 vs 不适用场景

**适用**（同时满足：真正多态 + 无类型类/trait 约束 + 纯函数）：
- Haskell / OCaml / Idris2 / Lean 的无约束多态函数
- Rust：`fn r<T>(xs: Vec<T>) -> Vec<T>` 且无 trait bound、无反射
- 编译器重写（stream fusion / deforestation）、QuickCheck 式泛化测试、Coq/Lean/Cogent 引理

**不适用**：
- 有 `Ord` / trait bound / 反射 / `as any`——能 inspect 类型就没免费定理
- Java / Go 泛型（擦除 + 反射）、Python / JS / Ruby 动态类型
- 含 IO / 可变状态的副作用函数——定理只在纯函数下精确

## 历史小故事（可跳过）

- **1972 年**：Girard 在博士论文里造 System F，第一个有 `forall` 量词的类型系统。当时只有数理逻辑学家关注。
- **1974 年**：Reynolds 独立重新发现 System F。
- **1983 年**：Reynolds 写 "Types, Abstraction and Parametric Polymorphism"，把"多态函数对类型一无所知"形式化为关系语义。这条定义需要懂 logical relations，**普通程序员看不懂**。
- **1989 年**：Wadler 写 "Theorems for Free!"——把 Reynolds 的关系语义翻译成"工程师能照菜谱做的推理流程"。**这条翻译让 parametricity 从纯理论变成普通 Haskell 程序员能用的工具**。
- **1993 年**：GHC 团队（Gill, Launchbury, Peyton Jones）做 fold/build deforestation 优化，根基就是 free theorem。
- **2000 年**：Claessen 和 Hughes 写 QuickCheck，generator 设计大量利用免费定理。
- **2004 年**：Johann-Voigtländer 修补 seq / ⊥ 引起的裂缝。
- **2012 年**：Bernardy-Lasson 给 Coq / Lean 风格语言做 parametricity translation 自动化。
- **2016 年**：Cogent 项目用免费定理做 seL4 操作系统的形式验证引理。
- **2025 年**：Idris2 / Lean 4 / GHC 的核心战术和优化仍依赖这条 1989 年思想。

## 学到什么

1. **类型签名不是注释，是约束**——`forall a. [a] -> [a]` 不只是文档，是物理上禁止函数 inspect 元素值的硬规则
2. **抽象与定理是同一硬币两面**——代码越多态能做的事越少，但能保证的等式越多。**抽象不是为了少写代码，是为了买定理**
3. **理论到工业的传导是分形的**——Haskell 5 年吸收，主流工业 30 年至今部分采纳。理论慢不代表错，等场景就行
4. **动态语言放弃的不是安全，是免费定理**——Python 的"任何函数能做任何事"本质是把 parametricity 的所有保证全部丢掉

## 延伸阅读

- 在线工具：[free-theorems.nomeata.de](http://free-theorems.nomeata.de/)（输入 Haskell 类型签名直接出免费定理，5 分钟比读 30 页论文直观）
- 原论文 PDF：Wadler, "Theorems for Free!", FPCA 1989（密度高但不长，约 13 页）
- 一手语义：Reynolds, "Types, Abstraction and Parametric Polymorphism", IFIP 1983
- 教材：Pierce, "Types and Programming Languages", MIT Press 2002（第 23 章 System F + parametricity）
- Wadler 反思：Wadler, "Propositions as Types", CACM 2015（"类型即命题，程序即证明"的工程化口号）

## 关联

- [[hindley-milner]] —— HM 关心"如何推出类型"，本篇关心"已知类型如何推出定理"，两条线在 GHC 里合流
- [[lambda-calculus]] —— Wadler 推导的对象就是带类型的 λ 项
- [[bidirectional-typing]] —— 双向类型检查 / D&K 2021，与本篇互补：本篇是"类型→定理"，那篇是"语法→类型"
- [[llvm]] —— 现代编译器后端；GHC 用 free theorem 做静态重写，与 LLVM 的优化哲学对照
- [[standard-ml]] —— 第一个工业函数式语言，HM + 部分 parametricity 的工业先驱

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[llvm]] —— LLVM — 模块化编译器框架
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩

