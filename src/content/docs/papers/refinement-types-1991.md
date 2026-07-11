---
title: Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
来源: 'Tim Freeman, Frank Pfenning, "Refinement Types for ML", PLDI 1991'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Refinement types（**精化类型**）是一种**让程序员在已有类型上画一个更精细的子集**，编译器在编译期就能拒绝越界用法的扩展。日常类比：超市里"顾客"是大类，"会员"是它的一个子集；refinement 就是让你给类型也办一张"会员卡"。

ML 里你写：

```ml
datatype α list = nil | cons of α * α list
```

`list` 涵盖空列表和非空列表两种。但 `head` 只对非空列表有意义——HM 类型系统区分不出来。Freeman-Pfenning 让你**额外**写：

```ml
rectype α nelist = cons (α, α list)
```

编译器从此知道"`nelist` 是 `list` 的子集"，并能推出 `head : α nelist → α`。再写 `head nil` 直接编译报错。

关键约束：所有原本能编过 ML 类型检查的程序，加 refinement 仍然能编过。Refinement 只在已有类型骨架上**叠一层**子集精度，不替换，不重写，不强迫——你不写 rectype，整个系统就退化成普通 ML。

## 为什么重要

不理解 refinement types，下面这些事都没法解释：

- TypeScript 里 `if (x !== null) { x.toUpperCase() }` 为什么能编译过——和 1991 年"在分支里把 union 收成子集"是同一类思路的现代回响（TS 自己的实现路径并不直接抄这篇）
- 为什么 Liquid Haskell 能在编译时拒绝除以 0、数组越界——它把 refinement 推到了一阶逻辑断言
- 为什么 F\* / Dafny 这类"程序+证明"语言能让函数自带规格——它们吸收了 refinement 思想，同时也站在依赖类型、霍尔逻辑等更广谱系上
- 为什么 ML 的 `head` 没办法拒绝空列表，而 30 年后的 Liquid Haskell 可以

## 核心要点

refinement types 的工作原理可以拆成 **三件事**：

1. **rectype 声明子集**：在原本的 datatype 之外，你额外写 `rectype α singleton = cons(α, nil)`，告诉编译器"singleton 是 list 的一个子集，只装一个元素的 cons"。类比：水果店里"水果"是大类，你又圈出一个"未熟果实"子集，店员一眼就认得。

2. **交集类型 ∧**：同一个构造器 `cons` 同时具备多个类型——传入 `(α, ?nil)` 给出 `α singleton`，传入 `(α, list)` 给出 `α list`。多个类型用 `∧` 拼起来。类比：一个司机同时是"会开手动挡"也"会开自动挡"，谁要哪个能力就拿哪个。

3. **有限格上的抽象解释**：把所有 refinement 排成一张有限的"精细度梯子"（格：`⊥ < singleton < list, ⊥ < ?nil < list`）。**抽象解释**就是：不跑完整程序，只在这张梯子上推"值大概落在哪一格"。有限是关键——保证算法**可判定**，否则完整 intersection type 推导是不可判定的。

## 实践案例

下面三个例子从"经典 ML 顽疾"开始，逐步走到"现代日常"，一起看 refinement 思想是怎么在 30 年里渗透到主流语言里的。

### 案例 1：head 终于能拒绝空列表

```ml
datatype α list = nil | cons of α * α list
rectype α nelist = cons (α, α list)

fun head (cons (x, _) : α nelist) = x
(* HM 推:           head : α list -> α  *)
(* refinement 推:   head : α nelist -> α *)
```

调用 `head nil` 时，编译器知道 `nil` 不是 `nelist` 的成员，**编译期**就报错。HM 做不到。

### 案例 2：把"不能再化简的项"写进类型

日常对照：算术里 `3+4` 还能算，`7` 已经是答案——后者就是"头范式"（**hnf**，head normal form：不能再做 β-化简的 λ 项；β-规约 ≈ 把函数应用到参数上算一步）。

```ml
datatype term = Var of string
              | Lam of string * term
              | App of term * term

rectype hnf = Var of string
            | Lam of string * term
            | App of hnf * term  (* App 左侧必须递归是 hnf *)
```

要写"再化简一步"的函数，输入应是"还不是 hnf 的 term"，输出是 `term`。Refinement 把这层 invariant 写进类型，不再藏在注释里。（示意：论文主例子是 list/bitstr；hnf 用来展示同一套路。）

### 案例 3：TypeScript narrowing 是同类思路的现代回响

```ts
function fmt(x: string | null): string {
  if (x === null) return "(null)"
  return x.toUpperCase() // 这里 x 已 narrow 成 string
}
```

TS 的 control-flow narrowing：union `string | null` 在分支里被收成子集。不需要 `rectype`（union 已是一等公民），但"在控制流里收窄合法子集"和 1991 年抽象解释是同一类直觉。

## 踩过的坑

1. **必须程序员显式写 rectype**：编译器不会"凭空发现"非空列表是子集——你不写 rectype 就用不了。这是为了保留可判定性故意做的限制，不是 bug。
2. **rectype 等价于正则树文法**：能抓的子集严格等于正则树语言。"无重复元素的列表"或"λ-闭项"超出表达力，要更强的依赖类型才行。
3. **高阶函数 refinement 数量爆炸**：如果 `stdpos` 有 5 个 refinement，那 `stdpos → stdpos` 就有 5^5 = 3125 个 refinement，朴素表示根本存不下；论文把"紧凑表示（如 BDD）"留作未来工作。
4. **只交集"同一个 ML 类型的 refinement"**：不能把 `int` 的 refinement 和 `bool` 的 refinement 用 ∧ 拼起来——完整 intersection type 推导是不可判定的（Pierce 1989），这条限制是可判定性的护城河。

## 适用 vs 不适用场景

**适用**：

- 想在编译期拒绝"非空列表"、"标准化数字"、"head normal form" 这类 invariant 越界
- 在 ML / Haskell 项目里把注释/文档中的"不变量"搬进类型系统，让编译器替你巡检
- 库作者：给导出函数附更精确的类型签名，调用者自动获得保护

**不适用**：

- 完全动态语言（Python / JS）—— 没有静态类型作底，refinement 无处安放
- 需要表达"无重复元素"、"闭项"这类非正则约束 → 转用 Liquid 类型 / 依赖类型（Idris / Coq / Lean）
- 高阶函数极密集且 refinement 维度高的代码——朴素实现会指数爆炸
- 只想吃 60% 类型红利的人 → 写 TypeScript 享受 narrowing 就够了，不必上 Liquid

## 历史小故事（可跳过）

- **1978 年前后**：意大利学派 Coppo / Dezani 提出 intersection types ∧（约 1978 论文），纯逻辑工具，没有可跑的编程语言算法。
- **1988 年**：Reynolds 设计 Forsythe，首次把 intersection 用在实际语言，但要程序员大量手写注解。
- **1989–1990 年**：Pierce 等研究 intersection + polymorphism 的更一般情形（论文引 [Pie89]）；Freeman 是 Pfenning 的博士生。
- **1991 年**：Freeman-Pfenning 在 PLDI 提出 **refinement types**——把 intersection 限制到"同一个 ML 类型的精化"，从而保留可判定推导。
- **2008 年**：Rondon-Kawaguchi-Jhala 发表 Liquid Types，把 refinement 推到一阶逻辑断言（`{v:int | v>0}`），交给 SMT solver 解。
- **2011 年起**：F\* / Dafny / Liquid Haskell 等把 refinement 与程序验证深度结合（同时继承依赖类型、霍尔逻辑等更广传统）。

## 学到什么

- **类型可以表达不变量**：HM 推出"是 list"，refinement 推出"是非空 list"。同一个程序结构，多了一层精度。
- **可判定 vs 表达力的拉锯**：完整 intersection type 推导不可判定 → 限制到"同 ML 类型 refinement"换可判定。这条权衡贯穿整个类型系统设计史。
- **正则树是 1991 版的天花板**：能抓的子集 = 正则树语言。要表达"无重复"必须跳到依赖类型。
- **声明式约束 + 抽象解释**：程序员写 rectype 给约束，编译器在有限格上算不动点——是程序分析里"声明 + 求解"经典套路的一个早期范例。

## 延伸阅读

- 论文 10 页 PDF：[Freeman-Pfenning, Refinement Types for ML, PLDI 1991](https://www.cs.cmu.edu/~fp/papers/pldi91.pdf)
- 90 页综述：[Refinement Types: A Tutorial — Jhala & Vazou 2020](https://arxiv.org/abs/2010.07763)
- 在线书 + 可跑代码：[Programming with Refinement Types — Liquid Haskell tutorial](https://ucsd-progsys.github.io/liquidhaskell-tutorial/)
- 工业级实现：[F\* language](https://www.fstar-lang.org/) —— 把 refinement 拉到验证级
- 现代日常落地：[TypeScript Handbook — Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [[bidirectional-typing]] —— refinement 推导常配合双向类型检查（Pfenning 后续主线）

## 关联

- [[hindley-milner]] —— refinement types 严格扩展 HM 给的基础 ML 类型，不取代而是叠加
- [[standard-ml]] —— refinement 是 ML 的扩展，不改语法只加 rectype，老代码全兼容
- [[bidirectional-typing]] —— 同作者 Pfenning 后续主线，refinement 推导常借双向策略减少标注
- [[lambda-calculus]] —— 论文里 hnf 案例：refinement 在 λ-项上抓 head normal form
- [[system-f-reynolds-1974]] —— 多态的另一条扩展路线，对照看 refinement 是"窄化"而非"参数化"
- [[local-type-inference]] —— 同样面对"完整推导太难"，都是局部约束 + 妥协换可判定
- [[theorems-for-free]] —— 类型携带定理；refinement 让定理更精细

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[stainless-2017]] —— Stainless — 让编译器替你证明 Scala 函数真的满足规约
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理

