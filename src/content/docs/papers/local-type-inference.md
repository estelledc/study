---
title: Local Type Inference — 编译器只看相邻节点也能推出类型
来源: 'Pierce & Turner, "Local Type Inference", TOPLAS 2000'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Local Type Inference（**LTI**，局部类型推导）是 Pierce 和 Turner 提出的**只用一个语法节点和它紧挨着的邻居之间的信息来补全类型注解**的方法。日常类比：拼图时不去看整张图，只看手里这块和它上下左右贴着的那 4 块——能拼上就拼，拼不上就让你自己写一笔。

你写一段 Scala / TypeScript：

```ts
[1, 2, 3].map(n => n * 2)
```

`map` 的签名是 `<U>(fn: (x: number) => U) => U[]`。LTI 看到调用现场 `[1,2,3].map(...)`，从**相邻节点**（`map` 的签名 + 实参的形状）推出 `U = number`，于是 `n` 不用写 `: number` 注解。整个推理只看了一层 AST，没有跨函数、跨模块的长程约束。

这个"局部"限制是 Scala / TypeScript / Rust / Kotlin 现代类型系统的实际工作方式——它们做不到 [[hindley-milner]] 那样不用任何注解，但也比纯 [[system-f-reynolds-1974]] 的"全标"方便得多。

## 为什么重要

不理解 Local Type Inference，下面这些事都没法解释：

- 为什么 Scala / TypeScript / Rust 顶层函数参数**必须**写类型，但 lambda 里的参数可以省——这是 LTI 的设计取舍
- 为什么这些语言不像 OCaml / Haskell 那样"完全不用写类型"——加了子类型 + impredicative 多态后，完整推导**已被证明不可判定**（Wells 1994）
- 为什么 IDE 把光标停在某个变量上能立刻显示推出来的类型——LTI 是"局部"的，不需要扫全模块
- 为什么 TypeScript 报错有时把根因锁得很准（不像 HM 经常把锅甩到几十行外）——只看相邻节点，错误来源就不会跨节点漂移

## 核心要点

LTI 由 **两个相互独立但可以叠加** 的局部技术组成：

1. **局部类型实参合成（local synthesis of type arguments）**：调用 `f[T](e)` 时省略 `T`，编译器拿"`f` 的形参类型 vs `e` 的实际类型"列一组**子类型约束**，求出能让结果类型最"窄"（信息量最大）的 `T`。类比：你只听邻桌一句对话，就推出他在聊什么——只用了一句的信息。

2. **双向类型传播（bidirectional propagation）**：调用 `g(fun(x) -> body)` 时，从 `g` 的形参类型**往下推**给 lambda，于是 lambda 的参数 `x` 不用标类型。这就是 [[bidirectional-typing]] 的核心动作——一会儿 synthesize（往上推），一会儿 check（往下传）。

3. **"局部"是关键约束**：所有信息只在 AST 上**相邻一层**流动，没有 HM 那种横跨整个表达式树的 unification variable。代价是：写 top-level 函数时必须标注参数；好处是：错误信息精准、算法简单可解释。

整套方法被 Pierce-Turner 称作 "partial type inference"——不承诺补全所有注解，只补**常见且无聊**的那部分。

## 实践案例

### 案例 1：Scala 里 LTI 替你做的事

```scala
val xs = List(1, 2, 3)        // xs: List[Int]，Int 由实参推出
val ys = xs.map(_ * 2)         // ys: List[Int]，map 的 U 由 lambda 结果推出
def add[A](x: A, y: A) = x    // add 的 A 留空，只能在调用现场推
add(1, 2)                      // 推出 A = Int
```

**逐部分解释**：

- `List(1,2,3)` → 构造器拿到 `Int` 实参 → 推出 `List[Int]`（一层 AST）
- `xs.map(_ * 2)` → `map` 的签名 `[U](f: Int => U) => List[U]` 已知，结合 `_ * 2` 的结果类型 `Int`，反推 `U = Int`（一层 AST）
- 整个过程没有 HM 风格的跨表达式 unification

### 案例 2：bidirectional 怎么救匿名函数

```ocaml
(* 假想一个支持 LTI 的 ML 方言 *)
let twice : (int -> int) -> int -> int =
  fun f x -> f (f x)
```

LTI 看到 `twice` 已标 `(int -> int) -> int -> int`：

1. 进入 check 模式：期望整体是 `(int -> int) -> int -> int`
2. 看到 `fun f x -> ...` → 把期望往下传：`f: int -> int`、`x: int`
3. 进 body `f (f x)`：synthesize 模式，从 `f: int -> int` 推出整体 `int`
4. 用 check 验证 `int` 能被期望类型接收 ✓

**关键**：`f` 和 `x` 没标类型，全是从外面期望类型"灌"进去的。这就是 bidirectional 的"check 往下传"。

### 案例 3：TypeScript 里你天天用的 LTI

```ts
function pipe<A, B, C>(f: (a: A) => B, g: (b: B) => C): (a: A) => C {
  return a => g(f(a))
}
const inc = (n: number) => n + 1
const str = (n: number) => String(n)
const composed = pipe(inc, str)  // (a: number) => string
```

TypeScript 拿 `pipe` 的签名 + 两个实参的类型，**只看一层**就推出 `A = number`、`B = number`、`C = string`，进而推出 `composed: (a: number) => string`。这正是 Pierce-Turner 提出的"local synthesis of type arguments"，被 TS 编译器移植到 JavaScript 世界。

## 踩过的坑

1. **顶层函数参数必须标类型**：Pierce-Turner 在 ML 代码统计里发现 top-level 定义占比约 1/66 行——要求标注代价低，省了它不值得，所以 LTI 选择"top-level 强制标"，新人常误以为这是 bug。

2. **局部最优 ≠ 全局最优**：LTI 在 `f[T](e1, e2)` 里**只**看 `T` 这一处的约束，遇到"需要回溯到外层才能选对 `T`"的情况会 fail。早年 Cardelli 的 greedy 算法因此栽过跟头，Pierce-Turner 用"算 join / meet"代替"瞎猜"，但仍然存在没法补的场景。

3. **没有 monotonicity 保证**：加更多类型注解**不一定**能让 LTI 推得更远——存在 `e ⊑ e'` 但 `e` 通过、`e'` 反而 fail 的反例。Pierce-Turner 在论文里坦白这是 open question。这点 [[hindley-milner]] 也有，但 LTI 更频繁碰到。

4. **bidirectional 的 check 模式向下传时遇到 union 类型会迷茫**：TypeScript 实际工程里 `(x => ...) as (string | number) => boolean` 经常推不出 `x` 的类型——LTI 期望"明确的单一期望类型"，遇到 union 就只能放弃往下传。

## 适用 vs 不适用场景

**适用**：

- 带子类型 + 多态的语言（Scala / Kotlin / TypeScript / Rust）——[[hindley-milner]] 推不动这种组合
- 需要错误信息精准的工程语言——LTI 错误从不跨节点漂移
- IDE 实时类型展示——只看相邻节点，光标位置就能算
- 模块边界清晰的代码——top-level 必标在这里反而成了"文档"优势

**不适用**：

- 想完全不写类型注解的场景（OCaml / Haskell 里 HM 更省心）
- rank-N 多态需求（`forall a. (forall b. b -> b) -> ...`）——LTI 和 HM 都搞不定
- 类型完全动态的语言（Python / JS）——LTI 是静态系统的方法
- 需要全局约束求解的高级泛型——比如 GHC 的 GADT 推导，要跨节点统一

## 历史小故事（可跳过）

- **1985 年**：Cardelli 和 Wegner 提出 System F<:，把子类型和 impredicative 多态拼到一起。漂亮但没人会推类型。
- **1993 年**：Cardelli 自己写了个 greedy 算法——遇到未知类型变量就立刻猜一个，错了再 fail。能跑但报错玄学。
- **1997 夏**：Turner 访问 Indiana University，和 Pierce 合作。统计了 16 万行 ML 代码，发现"哪些注解写起来烦"是有规律的。
- **1998 年**：POPL 会议版发表，提出"局部"这个核心约束。
- **2000 年**：TOPLAS 期刊版（44 页详细版），即本文。Scala 设计组（Odersky）直接吸收，TypeScript 后来也是。

之后 25 年，所有"带子类型的静态语言"基本都用 LTI 思路。

## 学到什么

1. **完整 vs 局部 vs 全标**是个三角取舍：HM 完整但限制多，LTI 局部但需要 top-level 注解，System F 全标但累。工程语言都选了 LTI 这个中间点。
2. **错误定位准确性是被"局部"换来的**——LTI 故意放弃跨节点推理，换报错时不会跨节点漂移。
3. **bidirectional 的 check / synthesize 双模式** 是现代类型检查器的通用骨架，TypeScript / Rust / Scala 编译器内部都按这两个模式分发。
4. **统计驱动的语言设计**：Pierce-Turner 用 16 万行 ML 实测决定"哪些注解可以省"，不是空想。这种实证方法对语言设计很罕见也很有效。

## 延伸阅读

- 论文 PDF（44 页）：[Local Type Inference, TOPLAS 2000](https://www.cis.upenn.edu/~bcpierce/papers/lti-toplas.pdf)（密度高，可跳到 §3 和 §7 related work）
- 综述：[Dunfield & Krishnaswami, Bidirectional Typing, ACM CSUR 2021](https://arxiv.org/abs/1908.05839)（把 LTI 放在 bidirectional 谱系里讲）
- Pierce 的教材：[*Types and Programming Languages*](https://www.cis.upenn.edu/~bcpierce/tapl/)（第 22-23 章讲多态推导，铺垫 LTI）
- [[bidirectional-typing]] —— LTI 里"双向传播"那一半的现代理论形式
- [[hindley-milner]] —— LTI 想绕开但又不得不参考的"完整推导"基线
- [[system-f-reynolds-1974]] —— LTI 的目标语言（impredicative 多态本体）

## 关联

- [[bidirectional-typing]] —— LTI 的两个核心技术之一，后被独立系统化
- [[hindley-milner]] —— LTI 是 HM 在"加子类型"场景下的工程替代品
- [[system-f-reynolds-1974]] —— LTI 推的就是 System F<: 里的项
- [[lambda-calculus]] —— 推导对象的语法基底，所有类型方法的共同前提
- [[effect-handlers]] —— 同样靠"局部信息"做类型分析的现代研究分支
- [[calculus-of-constructions]] —— LTI 思路被借鉴到依赖类型证明助手（NuPrl / Lego）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[helium-type-errors]] —— Helium — 让类型错误说人话的教学版 Haskell
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[row-polymorphism-remy]] —— Row Polymorphism — 让函数不必知道 record 的全部字段
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递

