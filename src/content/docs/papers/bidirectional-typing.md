---
title: 双向类型检查 — 推断和检查两个方向交替前进
来源: 'Pierce & Turner, "Local Type Inference", TOPLAS 2000 / Dunfield & Krishnaswami survey 2021'
日期: 2026-05-29
子分类: 编程语言
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

双向类型检查（**Bidirectional Typing**）是**类型检查器在两个方向之间来回游走**的一套方法：

- 有时**向上推**：从表达式自己推出类型（synthesize / 综合）
- 有时**向下传**：拿一个期望类型去验证表达式对不对（check / 检查）

日常类比：侦探破案有两种动作。"我看到了血迹和脚印——推出嫌疑人是高个子男性"是 synthesize；"假设凶手是 X，那现场应该有 Y 痕迹，让我去找"是 check。两种动作交替推进，案子才能破。

你写：

```ts
function f(x: number): number {
  return x + 1
}
```

类型检查器：

- 看到 `function f(x: number): number { ... }` → 进入 check 模式（已知期望类型 `number → number`）
- 进 body 看到 `x + 1` → 进入 synthesize 模式（从 `x: number` + `+ 1` 推出 `number`）
- 用 check 验证 synthesize 出来的结果是不是 number ✓

每个有静态类型的现代语言（TypeScript / Rust / Swift / Lean / Idris / Coq）都用某种形式的双向类型检查。

## 为什么重要

不理解双向类型检查，下面几件事都没法解释：

- 为什么 [[hindley-milner]] 全自动推断，而 TypeScript / Rust 要写一些类型注解——这两条路的差别就是双向 vs 单向
- 为什么 GHC / Rust 报错信息能告诉你"expected X, got Y"——expected 是 check 模式带过来的信息，got 是 synth 推出来的
- 为什么 [[hindley-milner]] 全推断脆弱（局部歧义传染全局），而 bidi 鲁棒（错在哪一段就停在哪一段）
- 为什么 Lean / Idris / Coq 的 dependent type 必须用双向——HM 那套全推断在 dependent type 下根本不可判定

## 核心要点

双向类型检查有 **3 件事**：

1. **synthesize（⇒）模式**：从表达式自己推出类型。例：看到 `5`，推出 `Int`；看到 `f(5)`，先 synth `f` 是函数类型 `A → B`，再用函数类型推出返回类型 `B`。

2. **check（⇐）模式**：拿一个期望类型，验证表达式能否符合。例：期望类型是 `number → boolean`，看到 lambda `x => x > 0`，把 x 标 number，再 check body 是不是 boolean。

3. **两种模式怎么切换**——这是双向的核心：
   - **函数应用** `f(arg)`：先 synthesize `f` 推出函数类型 `A → B`，再用 A 去 check arg
   - **lambda** `x => body`：在 check 模式下用（已知期望函数类型才能推 x 是什么）
   - **类型注解** `(e : A)`：用户主动写的注解是从 check 翻回 synthesize 的桥

## 实践案例

### 案例 1：(λx. x + 1) 5 的双向走法

```ml
((fun x -> x + 1) : int -> int) 5
```

类型检查器内部走的步骤：

1. 看到 App `(...) 5` → synthesize 模式
2. 先 synth lambda：纯 lambda 不能 synth（不知道 x 是什么），但有注解 `int -> int`，所以推出 `int → int`
3. 用 `int` check `5`：synth 5 得 int，int = int ✓
4. 整体类型 = `int`（函数返回类型）

如果**不写注解**，`(fun x -> x + 1)` 这样裸出现就 synth 不出来——必须要么有外部 check 上下文，要么自己加注解。

### 案例 2：TypeScript 里的 contextual typing

```ts
const f = (x: number) => x         // x 有标注，OK
function f2(x): number { return x } // x 没标注 → error: parameter implicitly has 'any' type
const g: (n: number) => number = x => x  // x 没标注但有上下文 → OK
```

第 3 行能跑过的原因：`(n: number) => number` 是 g 的期望类型 → check 模式 → x 在已知函数类型下被自动赋予 `number`。

这就是 TypeScript 的 **contextual typing**，本质上就是双向类型检查的 check 模式。Rust 的 `let v: Vec<i32> = (0..10).collect()`、Swift 的 closure inference 走的是同一套机制。

### 案例 3：Lean 4 的 dependent type

```lean
def cast {α β : Type} (h : α = β) (a : α) : β :=
  h ▸ a
```

`h ▸ a` 是用等式 h 把 a 从类型 α "传递"到类型 β——这种依赖类型操作**必须知道目标类型才能 elaborate**：函数返回类型 β 已知 → 进入 check 模式 → 才推得动 `▸` 怎么用。

HM 那套全自动推断在这里直接卡死，因为 `α = β` 这种类型层等式不是可单一化的。所以现代依赖类型语言（Lean / Idris / Coq）的 elaborator 全是双向的。

## 踩过的坑

1. **lambda 不能 synth**：`let f = x => x.foo` 在很多语言里报错"无法推断 x 的类型"——bidi 视角看，lambda 在 synth 模式下信息不够，必须给注解或外部 check 上下文。

2. **注解越多 ≠ 越好**：bidi 的设计目标是"用最少的注解换最大的推断能力"——加一个关键位置的注解解决问题就行，不用每个变量都标。Pierce-Turner 2000 论文专门讨论"哪些位置标注必要、哪些位置可以省略"。

3. **错误信息要读懂方向**：报错"expected X, got Y"——expected 是 check 模式从外部期望带过来的，got 是 synth 从表达式自己推出的；定位错误时先想这两个信息分别从哪里来，再判断是注解错还是表达式错。

4. **注解位置写错没用**：`((x => x) : (any))` 这种用过宽类型当注解，等于 check 模式信息空洞——bidi 不会因为有注解就放过你，注解必须有意义（具体类型或多态 forall）才能进入 check。

## 适用 vs 不适用场景

**适用**：

- 现代静态类型语言（TypeScript / Rust / Swift / Kotlin）的类型检查器
- 高级类型系统（GADT / refinement type / dependent type）—— [[hindley-milner]] 推不动这些
- 想"少写注解换覆盖率"的 DSL / 小语言（200 行就能实现，比 HM 简单一倍）

**不适用**：

- 经典 ML 风格（OCaml / 早期 Haskell）—— [[hindley-milner]] 全自动推断够用，bidi 改造收益小
- 完全动态语言（Python / JavaScript）—— bidi 是静态类型推断方法，没静态类型不需要它
- 全标类型的语言（Java / Go / 早期 C++）—— 用户已经标全了，没什么"推不出"的位置需要 bidi 救场

## 历史小故事（可跳过）

- **1997 年**：Benjamin Pierce 和 David Turner 在 ICFP 提出 Local Type Inference 雏形——把全局推断切成局部推断，避开复杂多态推断的不可判定性
- **2000 年**：Pierce-Turner 在 TOPLAS 发表 "Local Type Inference"——bidi 思想第一次被系统提出，给出 synth + check 双判断
- **2010 年代**：Jana Dunfield 和 Neel Krishnaswami 发表 "Complete and Easy Bidirectional Typechecking for Higher-Rank Polymorphism"（ICFP 2013）——把 bidi 推到工业可用
- **2021 年**：D&K 在 ACM Computing Surveys 发综述 "Bidirectional Typing"——把 20 年散落在各 PL 社区的 bidi 工作整理成可教学体系

之后，每个新语言（Roc / Lean 4 / Swift / TypeScript）的类型检查器都按 bidi 写，纯 [[hindley-milner]] 退守经典 ML 领域。

## 学到什么

1. **类型检查可以是双向流**——这个洞见解开了"全推断 vs 全标注"二选一的死结
2. **不同位置不同模式**：函数 head ⇒，参数 ⇐，lambda ⇐，注解切换——每条规则都有自然的方向
3. **注解是 feature 不是 bug**——bidi 不试图消灭注解，而是让注解出现在最有信息量的位置
4. **PL 实现简单一倍**：HM 的 algorithm W 要 union-find + 合一 + 泛化，bidi 只要 synth/check 两个互递归函数

## 延伸阅读

- 论文原版：[Pierce-Turner 2000 — Local Type Inference](https://www.cis.upenn.edu/~bcpierce/papers/lti-toplas.pdf)（25 页，bidi 开山）
- 综述：[Dunfield-Krishnaswami 2021 — Bidirectional Typing](https://arxiv.org/abs/1908.05839)（46 页，把 bidi 各派别梳理一遍）
- 自己写实现：[tomprimozic/type-systems](https://github.com/tomprimozic/type-systems) 的 `first_class_polymorphism/propagate.ml`（OCaml ~200 行 bidi 实现）
- [[hindley-milner]] —— bidi 的"前作"，是只用 synth 模式的特例
- [[lambda-calculus]] —— bidi 推导的对象就是 λ-演算项

## 关联

- [[hindley-milner]] —— bidi 是 HM 的超集；HM 是"只用 synth 模式 + 全自动 unification"的特例
- [[lambda-calculus]] —— bidi 给 λ 项贴类型；synth/check 都是在 λ 项结构上递归
- [[standard-ml]] —— ML 是 HM 的工业宿主；现代语言用 bidi 替代了 HM 那套全推断
- [[linear-types]] —— 线性类型实现的标准方法是 bidi（每条规则的资源使用都跟 mode 走）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agda-norell]] —— Agda — 让你写代码的同时把数学也证明了
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[helium-type-errors]] —— Helium — 让类型错误说人话的教学版 Haskell
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[linear-types]] —— 线性类型（Linear Types）
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[row-polymorphism-remy]] —— Row Polymorphism — 让记录类型可扩展又不丢类型安全
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理

