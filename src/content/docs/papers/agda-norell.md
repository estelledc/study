---
title: Agda — 让你写代码的同时把数学也证明了
来源: Ulf Norell, "Towards a Practical Programming Language Based on Dependent Type Theory", PhD thesis, Chalmers 2007
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Agda 是一门**带依赖类型**（dependent type）的函数式语言。Norell 这本博士论文是 Agda 2（现在大家用的版本）的设计与实现说明书。

什么叫"依赖类型"？日常类比：

- 普通类型像"一个箱子"——你只知道里面装"苹果"还是"橘子"。
- 依赖类型像"一个**装了 5 个**苹果的箱子"——类型本身能写"装几个"这种和**具体数字**有关的信息。

举例：

```
Vec A n  -- 类型：A 类型的元素，长度恰好为 n 的向量
```

这里 `n` 是一个真实的数字。类型在"依赖"于一个值。

Agda 的另一面更刺激：**写一段 Agda 程序 = 写一个数学证明**。这个对应关系叫 Curry-Howard 同构（类型 ↔ 命题，程序 ↔ 证明）。Agda 既是编程语言，也是定理证明助手。

## 为什么重要

不理解 Agda（和它代表的依赖类型方向），下面这些事看不清：

- 为什么 Idris、Lean 这类语言走向依赖类型，而 Rust trait、TypeScript 泛型也会借用一些"把约束写进类型"的思路。
- 为什么"数组下标越界"在 Agda 里**不可能编译过**——长度信息写在类型里。
- 为什么 Lean 4 能拿来证四色定理、形式化数学——它和 Agda 同属"把证明写进类型"这条路线。
- 为什么"程序 = 证明"听起来像哲学，但今天有人真的用它写银行系统的关键模块。

## 核心要点

Norell 这本论文真正的工程贡献，是把 Martin-Löf 1972 年那套**纸上的类型论**变成能跑的语言。要解决四个难题：

1. **依赖模式匹配**：普通 match 看形状分支；依赖 match 还要让类型在分支里**自动精化**。例如 match 出 `n = succ k`，那这一支里 `Vec A n` 自动变成 `Vec A (succ k)`。Coquand 1992 提出方法，Norell 把它做进编译器。

2. **隐式参数**：你写 `append xs ys`，编译器自己推出"元素类型 A、长度 m 和 n"。怎么推？用**高阶模式统一**（Miller 1991 的可判定子集）——比 HM 用的一阶统一更强，但还是可判定的。

3. **覆盖检查**：每个 match 必须列出所有情况。漏一个，证明系统就能被骗证出 False。

4. **终止检查**：每个递归必须停下来。Agda 用 size-change termination——看每次递归是不是在某个参数上严格变小。

四条都满足，才能放心说"通过类型检查 = 程序正确"。

## 实践案例

### 案例 1：长度安全的向量拼接

```agda
data Vec (A : Set) : Nat -> Set where
  []   : Vec A zero
  _::_ : {n : Nat} -> A -> Vec A n -> Vec A (succ n)

append : {A : Set} {m n : Nat} -> Vec A m -> Vec A n -> Vec A (m + n)
append []        ys = ys
append (x :: xs) ys = x :: append xs ys
```

**逐部分解释**：

- `Vec A n` 的类型是 `Nat -> Set`——给一个数字就给一个类型。
- `append` 的签名说："传入长度 m 和长度 n 的向量，返回长度 m+n 的向量"。
- 如果你写错——比如 `append (x :: xs) ys = ys`——编译器会说"你这个分支应该返回 `Vec A (succ m + n)`，你给的是 `Vec A n`，长度对不上"。**bug 在编译期被拦下。**

### 案例 2：写代码的同时证明定理

写下这段：

```agda
trans : {A : Set} {x y z : A} -> x == y -> y == z -> x == z
trans refl refl = refl
```

你**没在证明定理**——你在写一个普通函数。但因为 Agda 把"`x == y` 这件事"做成一个类型，你函数的类型签名读出来就是数学定理"等于关系是传递的"。一份代码同时跑也同时被验证。

### 案例 3：Agda 在 IDE 里"陪你写代码"

Agda 最神奇的体验：在 IDE 里敲一个洞 `?`，编译器告诉你"这个洞需要填一个什么类型的东西"，并列出当前作用域里能用的变量。你按照类型一步步缩，洞越填越小，直到补完。这就是后来 Idris 团队大力推广的 **type-driven development**——类型不是注解，是**导航地图**。

打个比方：写普通代码像在白纸上写字，错了不报警；写 Agda 像玩拼图，每一步都有形状约束，拼错根本卡不进去。慢，但走完一定是对的。

### 案例 4：隐式参数让代码不再"参数地狱"

如果所有类型参数都要显式写：

```agda
append {Nat} {3} {2} (1 :: 2 :: 3 :: []) (4 :: 5 :: [])
```

读不下去。Agda 编译器靠**高阶模式统一**自己推：从 `1 :: 2 :: 3 :: []` 看出 `A = Nat, m = 3`，从 `4 :: 5 :: []` 看出 `n = 2`。你只写：

```agda
append (1 :: 2 :: 3 :: []) (4 :: 5 :: [])
```

可读性回到 Haskell 水平。Norell 论文里有专门一章讲怎么让这个推断在大多数场景"刚好够用"且**可判定**。

## 踩过的坑

1. **代码重**：长度索引、相等证明、强制转换写多了，可读性大幅下降。Agda 老手常说"先写普通版本，再加索引"。

2. **终止检查不完备**：明明你知道会停的程序，Agda 偶尔说"不行，看不出来"。需要重写让它看得出来。

3. **编译期可能巨慢**：类型检查需要把项**规范化**（normalize，化简到底）。复杂证明可以让一段代码的类型检查跑几分钟甚至几小时。

4. **学习曲线陡**：Curry-Howard、归纳类型、依赖模式、统一——任何一个看不懂都会卡住。比 Haskell 上一层。

## 适用 vs 不适用场景

**适用**：

- 形式化数学证明（Lean 后来在这块更强）
- 关键模块的形式化验证（编译器、协议、加密）
- 教学：想搞懂依赖类型怎么工作，Agda 比 Coq 直观
- 探索"程序 = 证明"这个对应关系的乐趣

**不适用**：

- 写 web 后端 / CRUD / 一般业务代码——杀鸡用牛刀，团队也撑不住学习成本
- 高性能计算——Agda 不是为运行时性能设计的
- 大型工程协作——工具链、库生态、招人都不成熟

## 历史小故事（可跳过）

- **1972**：Per Martin-Löf 提出直觉主义类型论，纸上数学。
- **1990 前后**：Catarina Coquand 在 Chalmers 推动早期 Agda，把类型论交互式地搬到屏幕上。
- **2007**：博士生 Ulf Norell 重写为 Agda 2，写下这本论文，把 ITT 工程化的所有难点系统讲一遍。
- **之后**：Idris（2008+）、Lean（2013+）都参考 Agda 的设计。"程序 = 证明"从象牙塔走向工业。

## 学到什么

1. **类型可以"装值"**——这是依赖类型的核心，比 HM 那种"只装类型"强得多。
2. **统一算法是类型推断的发动机**——HM 用一阶统一，Agda 用高阶模式统一。统一越强，能推的越多。
3. **可判定 vs 表达力是永恒的取舍**——Agda 在"够用 + 还能推"的边界上走钢丝。
4. **工程把理论拉下凡间**：Norell 这本论文就是"把 30 年的类型论塞进一个能用的编译器"的工艺手册。

## 延伸阅读

- 论文 PDF：[Norell 2007 thesis](https://www.cse.chalmers.se/~ulfn/papers/thesis.pdf)（200 多页，前几章读懂就值回票价）
- 入门教程：[Programming Language Foundations in Agda](https://plfa.github.io/)（用 Agda 重写 Pierce 的 SF，最友好的中文化前置教材）
- 视频：[Conor McBride — Hutton's Razor with Dependent Types](https://www.youtube.com/results?search_query=conor+mcbride+agda)（Agda/Idris 圈最有趣的讲者）
- [[martin-lof-itt]] —— Agda 的类型论根
- [[calculus-of-constructions]] —— Coq 的基础，和 Agda 是表亲

## 关联

- [[martin-lof-itt]] —— Agda 直接基于 Martin-Löf 的 ITT
- [[calculus-of-constructions]] —— Coq 的基础；和 Agda 走不同分支但同源
- [[lean-tactics]] —— Lean 是 Agda 之后的下一代尝试
- [[hindley-milner]] —— HM 是 Agda 类型推断的简化版（一阶 vs 高阶）
- [[lambda-calculus]] —— 函数式与类型论的共同根
- [[bidirectional-typing]] —— Agda 的类型检查器核心策略
