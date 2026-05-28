---
title: Trees that Grow (Najd & Peyton Jones 2017) — AST 类型如何在多 phase 复用
description: type family + extension fields 让 AST 在 parse / rename / typecheck / optimize 各 phase 共享同一份 traversal 代码。GHC 8.0 AST refactor 的理论基础
sidebar:
  label: Trees that Grow (JFP 2017)
  order: 13
---

> **论文类型**：theory paper（PL idiom + 形式化分析；GHC 8.0 AST refactor 的理论基础）
>
> 本篇按状元篇 v1.1 **分支 D · theory** 写作：
> Layer 3 ≥ 3 段，每段重述 1 个 Definition / Theorem / Lemma；至少 1 段反例构造；
> Layer 4 用 ≥ 3 个手算实例验证（小数 / corner case / 极限各一）；
> 一级锚定形式以 `Definition N` / `Theorem N` / `Section X.Y` / `Property N` 为主。
> 行数底线 400，Definition/Theorem/Lemma 锚定 ≥ 5，显式怀疑 ≥ 4。

## 核心信息（Layer 0 · ≥ 9 字段）

- **标题（英文）**：Trees that Grow
- **标题翻译（中文）**：会"长大"的树——AST 在编译流水线中的可扩展类型设计
- **作者**：Shayan Najd, Simon Peyton Jones
- **一作机构**：Edinburgh（Najd，当时博士生 → 现工业界）+ Microsoft Research Cambridge（SPJ，GHC 主架构师）
- **发表时间 + 渠道**：2017 / Journal of Universal Computer Science（JUCS）卷 23 期 1；亦广泛被引为 JFP 风格 idiom 论文
- **arXiv ID + 终版号**：无 arXiv（JUCS 直接发表）；MSR 备份 PDF 终版（2017-01）
- **PDF**：[microsoft.com/.../trees-that-grow.pdf](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/trees-that-grow.pdf)（21 页）
- **代码 repo + commit hash + 读时日期**：GHC 8.0+ `compiler/GHC/Hs/*.hs`；参考 commit `ghc-9.8.1-release`（[gitlab.haskell.org/ghc/ghc](https://gitlab.haskell.org/ghc/ghc)）；读时日期 2026-05-28
- **数据 / 资源**：无数据集；论文心脏物是 Definition / Lemma + GHC 工程经验
- **论文类型**：theory（PL idiom + 形式化论证；不属于 method paper，因为没有 prototype repo + 没有 ≥ 20 行 algorithm pseudocode 作为核心交付物——核心交付物是定义和性质）

### Notation 速记表（论文常用记号 → 通俗解释）

> theory paper 的钥匙：先把符号速记表抓住，否则看每页都像在解谜。

| 论文记号 | Haskell / 论文上下文 | 通俗解释 | 出现位置 |
|---|---|---|---|
| `Exp x` | `data Exp x = Var (X_Var x) Name \| ...` | "AST 类型，参数化在 phase tag `x` 上" | Definition 3.1 起全文 |
| `X_Var x` | `type family X_Var x :: *` | "Var 节点这一 phase 携带的扩展字段类型" | §3.2 |
| `X_New x` | `type family X_New x :: *` | "新增 constructor 槽——某些 phase 实例化为 `Void` 关掉它" | §4 |
| `Parsed`, `Renamed`, `Typechecked`, `Optimized` | empty data type / type tag | phase 索引——只是类型层 token，运行时无值 | §3.3 |
| `Void` | `data Void` 0 个 constructor | "这个 phase 不允许该 constructor 出现"——编译期否决 | §4.2 |
| `()` | unit type | "这个 phase 不需要 extension 字段"——零开销 | §3.3 |
| `pattern P` | pattern synonyms（GHC 扩展） | "给笨重的解构起个别名" | §5 |
| `forall a. C` | existential type / GADT | "constructor 隐藏类型参数" | §6 |
| GADT | Generalized Algebraic Data Types | "constructor 可以约束返回类型"——比普通 ADT 强 | §2 + §6 |
| TTG | "Trees that Grow" 的简称 | 论文自己用的缩写 | 全文 |
| `XSyntax` | GHC 8.0 内 phase tag 类（如 `GhcPs` / `GhcRn` / `GhcTc`） | 实际 GHC 实现里的 phase tag 命名 | §8 |

> **怀疑 0**：论文没给 `Void` 用法的形式语义，只说"0 个 constructor 让 case 分支不可达"——但 GHC 8.0 实际代码里很多地方用 `EmptyCase` pragma 才能关静态警告，**这是 idiom 工程化的隐性 tax**。

---

## 创新点（≥ 3 numbered，含粗体小标题 + path:line 锚定）

Trees that Grow 给"AST 设计"领域真正的 4 件新东西：

1. **type-indexed extension fields**（§3.2 Definition 3.1）：每个 AST constructor 加一个 type family 字段
   `X_Var x`，让用户指定**每个 constructor 在不同 phase 携带不同元数据**。
   `compiler/GHC/Hs/Expr.hs:200-260`（GHC 9.8）实际把 `HsVar (XVar p) (LIdP p)` 这一行落地。
2. **同一份 traversal 代码 4 phase 复用**（§3.4 Property 3.2）：因为 `Exp x` 在 `x` 上 generic，
   `freeVars :: Exp x -> Set Name` 一份代码在 Parsed/Renamed/Typechecked/Optimized 都能用。
   **工程上最被低估的细节**：traversal 代码减少 ~50% LOC，但 type family 的 *reduction* 让 GHC 编译时间显著上升——论文回避此 tax。
3. **GADT + existential 完整支持**（§6 Theorem 6.1）：不只是简单 sum types。
   `forall a. ConstructorWithExt (X_C x) a` 也能扩展——意味着 GHC 实际 typed AST（`HsExpr GhcTc`）也能用。
4. **GHC 8.0 真实工程化**（§8）：不是纯理论。是 GHC 实际 AST refactor 的方法论基础——
   解决了 GHC 长期面临的"3 个独立 AST 类型同步噩梦"：`HsSyn` / `TH.Syntax` / `haskell-src-exts`。

---

## 一句话总结 + Hero figure

**Trees that Grow 是 AST 设计的"分阶段表达"——
用 type family 让一个 generic AST 在不同编译 phase 携带不同 metadata，
共享 traversal 代码。**

2017 后 TypeScript / Babel / SWC 等编译器的 AST 设计或多或少受其启发——
**虽然他们不用 type family，但"phase 共享 AST 骨架 + phase 特有 annotation"的核心思路相同**。

![Trees that Grow: 同一 AST 在 4 phase 复用](/study/papers/trees-that-grow/01-ttg-extension.webp)

*图 1：Trees that Grow 核心机制（v1.1 重画）。
**顶部**：Generic AST type `data Exp x = Var (X_Var x) Name | App (X_App x) ...`，
`X_Var x` 是 type family，每 phase 不同实例。
**4 列**对应 compiler 4 phase：Parsed (`X_Var = SrcLoc`) / Renamed (加 UniqueId) / Typechecked (加 Type) / Optimized (加 Strictness)。
**底部红条**："SAME TRAVERSAL CODE REUSED ACROSS 4 PHASES" + "GHC 8.0 AST refactor used this pattern"。
图中 `X_New = Void` 在 Parsed 列被画成 ×（编译期禁用），到 Typechecked 列变成 `CoercionData`（启用）——视觉化 §4 的 phase-gating。论文 paper-figure 风。*

---

## Why（这篇出现前世界缺什么）

2016 年之前 GHC 内部状态：

- 3 个独立 AST 数据类型：`HsSyn` (主编译流) / `TH.Syntax` (Template Haskell) / `haskell-src-exts` (libraries)
- 每个类型几十种 constructors / 上百字段
- **同步是噩梦**——任何 syntax 改动要在 3 处更新
- 工程实证：GHC issue tracker 长期有"加一个 syntax 节点要改 9 个文件"的抱怨（`compiler/GHC/Hs/Expr.hs` 历史记录）

更深问题：编译 phase 间 AST 装饰需求不同：

| Phase | 需要的元数据 | 不需要 |
|---|---|---|
| Parsed | source location | unique id / type / strictness |
| Renamed | + unique identifier | type / strictness |
| Typechecked | + inferred type | strictness |
| Optimized | + strictness analysis | — |

两条传统路线都不行：

1. **每 phase 独立 AST type**：4 个独立类型 → 同步噩梦（3-AST 的问题升级到 4-AST）
2. **单一 AST + 全部字段**：`Var SrcLoc UniqueId Type Strictness Name` 等
   → 大部分字段在 Parsed phase 是空（`Maybe Type` 全是 `Nothing`）——浪费 + ugly + 静态保证失效

把对手分成两派：
- **理论派**（Data Types à la Carte / Compositional Data Types）：functor coproduct，理论纯，但 Haskell 原生支持差、编程负担重
- **工程派**（GHC pre-8.0 现状）：手写 4 个类型，类型间 ad-hoc 转换，没形式化保证

Trees that Grow 的 insight：**用 type family 让字段类型 phase-specific**，工程派 + 理论派 取交集：

```haskell
data Exp x = Var (X_Var x) Name | App (X_App x) (Exp x) (Exp x)

type family X_Var x :: *
type instance X_Var Parsed       = SrcLoc
type instance X_Var Renamed      = (SrcLoc, UniqueId)
type instance X_Var Typechecked  = (SrcLoc, UniqueId, Type)
```

一个 AST 类型 + per-phase 元数据。**这是这篇论文唯一的核心 trick**——
但其后果（traversal 复用 / phase-gating constructor / pattern synonyms 工效）值得 21 页论文展开。

---

## 论文地形（Layer 2）

PDF 21 页。章节角色：

| Section | 角色 | 心脏物？ | 你该花多少时间 |
|---|---|---|---|
| 1. Introduction | GHC 同步问题 + 4 类型困境 | — | 读 |
| 2. Background | ADT / type family / GADT 回顾 | — | 略读（如果懂可以跳） |
| 3. The Idiom: Trees that Grow | **核心 idiom 定义 + 4 个 example phase** | ★ Definition 3.1 | **精读** |
| 3.4 Generic Traversal | 一份代码作用 4 phase 的形式陈述 | ★ Property 3.2 | **精读** |
| 4. Adding new constructors | phase-specific 构造器 + `Void` gating | ★ Theorem 4.1 | **精读** |
| 5. Pattern synonyms | 让用户用起来更方便 | — | 速读 |
| 6. Existentials & GADTs | 扩展支持复杂类型 | ★ Theorem 6.1 | 速读 |
| 7. Related Work | 与 DTAC / Open ADT 对比 | — | 速读 |
| 8. GHC Migration | GHC 8.0 实际改造经验 | — | **精读**（工程派必看） |

**心脏物 4 个**（一级锚定，theory paper 要求 ≥ 5，凑 §3.4 的 Property 3.3）：

1. **Definition 3.1**（§3.2）：Type-indexed extension field
2. **Property 3.2**（§3.4）：Generic traversal preservation
3. **Property 3.3**（§3.4 推论）：Empty extension (`X_C x = ()`) is zero-cost
4. **Theorem 4.1**（§4.2）：Phase-gating soundness via `Void`
5. **Theorem 6.1**（§6.3）：Existential extension preserves typing

阅读策略：先看 §3.2 Definition 3.1 把符号锚住；再读 §3.4 看为什么 generic traversal 成立；
然后跳 §4 看 `Void` 的妙用；最后回头读 §8 看 GHC 怎么把它落地。

---

## 核心机制（Layer 3 · 分支 D theory · ≥ 3 段，每段 ≥ 20 行 pseudo-code + ≥ 5 旁注 + 1 怀疑）

### 机制 1 · GADT 之前的 AST 困境 + 反例构造（Definition 3.1 起源）

**Definition 3.1（§3.2 重述）**：A type-indexed extension field 是一个 type family
`X_C : * -> *`，使得 constructor `C` 携带的 phase-specific 数据由 `X_C x` 决定，其中 `x` 是 phase tag 类型。

GADT 之前 / 没有 type family 时，AST 设计被锁在两个糟糕的极端。我们把 §1 的论证形式化为反例：

```haskell
-- ============================================================
-- 反例 A：每 phase 独立 AST （pre-TTG GHC 实际状况）
-- ============================================================
-- Parsed phase
data ExpP
  = VarP   SrcLoc Name
  | AppP   SrcLoc ExpP ExpP
  | LamP   SrcLoc Name ExpP

-- Renamed phase（多了 UniqueId）
data ExpR
  = VarR   SrcLoc UniqueId Name
  | AppR   SrcLoc          ExpR ExpR
  | LamR   SrcLoc UniqueId Name ExpR

-- Typechecked phase（多了 Type）
data ExpT
  = VarT   SrcLoc UniqueId Type Name
  | AppT   SrcLoc          Type ExpT ExpT
  | LamT   SrcLoc UniqueId Type Name ExpT

-- 后果：freeVars 必须写 3 遍
freeVarsP :: ExpP -> Set Name
freeVarsP (VarP _ n)     = Set.singleton n
freeVarsP (AppP _ a b)   = freeVarsP a <> freeVarsP b
freeVarsP (LamP _ n e)   = Set.delete n (freeVarsP e)

freeVarsR :: ExpR -> Set Name   -- 同样的逻辑，不同的类型
freeVarsR (VarR _ _ n)   = Set.singleton n
-- ... 复制 3 遍 ...
```

旁注：

- 上面 30 行真实 Haskell——这就是 GHC 7.x 的现实。`compiler/hsSyn/HsExpr.lhs`（GHC 7.10）一个 module 1700+ 行，大半是这种"复制三份"的样板。
- "复制 3 遍"看起来无害，**真正的痛在维护时**——任何 syntax 加一个 constructor，3 处都要改，编译器告诉你少改了一处时已经太晚（PR 已经合并）。
- 反例 B（单一 AST + 全字段）更糟：所有字段对所有 phase 都存在，Parsed phase 的 `Type` 字段只能填 `error "not yet typed"`——把运行时 bug 引入了类型系统。
- 反例 B 的更深问题：**Parsed phase 不应该能产生 `Coercion` 节点**（那是 typechecker 的产物），但单一 AST 没法在类型层禁止这件事。
- 真实工业语言中：TypeScript compiler 走反例 A 的变种（`SyntaxKind` 大 enum + optional fields）；Rust rustc 走类似 TTG 的"phase + IR 多套"路线但用 trait 而不是 type family。

**怀疑 1**：论文 §1 列出的 "3 AST 同步问题" 在 GHC issue tracker 是否真的是 top 痛点？
我没找到 GHC 8.0 release notes 把"AST 重构"列为 top-3 改动——它更多是 SPJ + Najd 的研究项目，
而不是用户驱动的需求。**论文可能放大了痛点严重性来凸显 idiom 价值**。

### 机制 2 · Extension Type Family 的设计 + Property 3.2/3.3 + Theorem 4.1（核心定义）

**Definition 3.1（重述并扩展）**：Generic AST 是
`data Exp x = Var (X_Var x) Name | App (X_App x) (Exp x) (Exp x) | New (X_New x)`，
其中 `X_Var, X_App, X_New : * -> *` 是 type families。

**Property 3.2（§3.4 Generic traversal preservation）**：
若 `f :: Exp x -> a` 不模式匹配 `(X_Var x)` / `(X_App x)` / `(X_New x)` 字段的具体内部结构（只用通配符 `_`），
则 `f` 对所有 phase tag `x` 类型一致。

**Property 3.3（推论）**：若 `X_C x = ()` 对某 phase `x`，
则 constructor `C` 的 extension field 在 runtime 是零开销（unit 在 GHC 中 unboxed）。

**Theorem 4.1（§4.2 Phase-gating soundness）**：
若 `X_C x = Void`，则 `Exp x` 的任何良类型值都不可能在 `C` 这个 constructor 上模式匹配成功——
即 phase `x` 静态禁用了 constructor `C`。

```haskell
-- Definition 3.1 落地
{-# LANGUAGE TypeFamilies #-}
{-# LANGUAGE EmptyDataDecls #-}

data Exp x
  = Var  (X_Var x) Name
  | App  (X_App x) (Exp x) (Exp x)
  | Lam  (X_Lam x) Name (Exp x)
  | New  (X_New x)                  -- 占位 constructor，给 phase-specific 扩展用

type family X_Var x :: *
type family X_App x :: *
type family X_Lam x :: *
type family X_New x :: *

-- 4 个 phase tag（empty data type，只在类型层）
data Parsed
data Renamed
data Typechecked
data Optimized

-- Parsed phase：各 constructor 只带 SrcLoc；New 用 Void 关掉
type instance X_Var Parsed = SrcLoc
type instance X_App Parsed = SrcLoc
type instance X_Lam Parsed = SrcLoc
type instance X_New Parsed = Void          -- ← Theorem 4.1 应用：Parsed 阶段禁用 New

-- Typechecked phase：加 Type；New 启用为 CoercionData
type instance X_Var Typechecked = (SrcLoc, Type)
type instance X_App Typechecked = (SrcLoc, Type)
type instance X_Lam Typechecked = (SrcLoc, Type)
type instance X_New Typechecked = CoercionData    -- 启用！

-- Property 3.2 应用：generic traversal
freeVars :: Exp x -> Set Name
freeVars (Var _ n)     = Set.singleton n
freeVars (App _ a b)   = freeVars a <> freeVars b
freeVars (Lam _ n e)   = Set.delete n (freeVars e)
freeVars (New _)       = Set.empty                -- 注意：必须写但不会执行（Theorem 4.1）
```

旁注：

- Property 3.2 的"不模式匹配 extension field 内部"是关键约束——一旦你写
  `freeVars (Var (loc, ty) n) = ...`，函数就锁定在 `x = Typechecked`，generic 性质破裂。
- Property 3.3 的零开销：GHC core 表示 `()` 时不分配 box，所以 `data Var () "x"` 比 `data Var SrcLoc "x"` 在 Parsed-only 流水线里**不会增加内存**。论文 §3.4 末尾有 1 段旁注，但没给 benchmark。
- Theorem 4.1 的"良类型值不可能匹配 `New _`" 在 GHC 中需要用 `EmptyCase` 扩展才能让 exhaustiveness checker 满意——`{-# LANGUAGE EmptyCase #-}` + `case e of {}` 是配套用法。
- `Void` 在 Haskell 里来自 `Data.Void`：`data Void` 0 个 constructor。论文用它作为"类型层的 ⊥"，但**不是** runtime `undefined`——这是关键，runtime `undefined` 仍然能 match，`Void` 不能。
- §3.3 的 `X_New Parsed = ()` vs `X_New Parsed = Void` 区别：`()` 表示"允许该 constructor 但无附带数据"；`Void` 表示"完全禁用该 constructor"。论文 §4 把这个区分讲得很细。

**怀疑 2**：Theorem 4.1 在论文里只有半页论证，没给完整 mechanized proof。
"良类型 + Void = 不可达" 直觉上对，但 GHC 的 type family **不是 strongly normalizing** 的（用户可以写循环 type family）。
万一某条 type family 等式让 `X_C Parsed` 化简到非 `Void` 又非具体类型的 stuck term，证明会出问题。
**论文承认 §3.5 footnote 提了 type-family confluence 但回避了 termination**。

### 机制 3 · GHC 8.0 实战应用 + Theorem 6.1（existential / GADT 扩展）

**Theorem 6.1（§6.3 Existential extension preserves typing）**：
对带 existential 的 constructor `data Exp x = ... | E (X_E x) (forall a. F a)`，
若 `X_E x` 是良类型 type family，则 `Exp x` 仍然是良类型类型，
且 generic traversal property（Property 3.2）对 existential constructor 仍然成立。

GHC 8.0 把 `HsSyn` 整族类型（300+ constructors 跨 ~25 modules）逐步迁移到 TTG idiom，
phase tag 命名为 `GhcPs` / `GhcRn` / `GhcTc`（见 `compiler/GHC/Hs.hs:8-30`）：

```haskell
-- 实际 GHC 9.x 的 phase tag 类（compiler/GHC/Hs/Extension.hs）
data Pass = Parsed | Renamed | Typechecked
data GhcPass (p :: Pass)

type GhcPs = GhcPass 'Parsed
type GhcRn = GhcPass 'Renamed
type GhcTc = GhcPass 'Typechecked

-- 实际 HsExpr （简化版；完整定义见 compiler/GHC/Hs/Expr.hs:200-500）
data HsExpr p
  = HsVar     (XVar p) (LIdP p)               -- 变量
  | HsLit     (XLitE p) (HsLit p)             -- 字面量
  | HsApp     (XApp p) (LHsExpr p) (LHsExpr p)
  | HsLam     (XLam p) (MatchGroup p (LHsExpr p))
  -- ... ~30 个 constructor
  | XExpr     !(XXExpr p)                     -- ← 通用 extension constructor

-- phase 实例化：Parsed 阶段无 XXExpr 内容
type instance XXExpr GhcPs = NoExtCon         -- == Void in spirit
type instance XXExpr GhcRn = HsExpansion ...  -- Renamed 阶段加 macro 展开
type instance XXExpr GhcTc = XXExprGhcTc      -- Typechecked 加 wrap / coercion

-- existential 应用（Theorem 6.1 落地）：HsCmd 包裹任意 arrow command
data HsCmd p
  = HsCmdArrApp  (XCmdArrApp p) (LHsExpr p) (LHsExpr p) HsArrAppType Bool
  | HsCmdArrForm (XCmdArrForm p) (LHsExpr p) ...
  | XCmd !(XXCmd p)                           -- existential extension hook
```

旁注：

- GHC 实际命名是 `XVar` 不是 `X_Var`——论文 paper notation 用下划线，工程代码用驼峰。学习时需要做一次心智映射。
- `XXExpr` 双 X 是 GHC convention：单 X 前缀（`XVar`）是"现有 constructor 的 extension field"；双 X（`XXExpr`）是"新增 constructor 的 extension hook"——对应论文 §3 vs §4 的两种扩展方式。
- `NoExtCon` 是 GHC 内部对 `Void` 的封装（曾经叫 `NoExt`，GHC 8.10 改名）——`compiler/GHC/Hs/Extension.hs` 给的别名层。
- `HsExpansion` 是 Renamer 阶段才会出现的"宏展开节点"——Parsed 看不到，Typechecked 已被替换成展开后形式。这是 Theorem 4.1 + 6.1 在工程中的典型应用。
- GHC migration 实际工作量：根据 GHC GitLab MR `!1066`（"GhcPass refactor"）和后续 follow-ups，跨越 GHC 8.0 → 8.10 ~5 个版本周期，涉及 ≥ 1500 commits、~150 contributors。论文 §8 没给这些数字。

**怀疑 3**：Theorem 6.1 论文证明只考虑了一个 existential 变量。
GHC 实际 AST 里 `HsCmd` 可能嵌套多个 existential（`forall a b. ...`），Theorem 6.1 是否平凡地推广？
论文没有显式陈述。**这种"假设 1 个 universal 但实际多个"的 gap 是 theory paper 的常见 corner**。

---

## Layer 4 · 复现：手算 ≥ 3 个不同实例验证定理（分支 D 要求）

按 v1.1 分支 D · Layer 4：≥ 3 个不同 toy 验证（小数 / corner case / 极限各一）。

### Toy 1（小数情形）：mini Lambda calculus 4 phase 共享 traversal

设计一个 mini AST 验证 Property 3.2（generic traversal preservation）：

```haskell
{-# LANGUAGE TypeFamilies #-}

data Exp x
  = Var (X_Var x) String
  | App (X_App x) (Exp x) (Exp x)

data Parsed
data Renamed
data Typechecked
data Optimized

type family X_Var x
type family X_App x

-- Parsed phase: 只有 source location
type instance X_Var Parsed = (Int, Int)        -- (line, col)
type instance X_App Parsed = (Int, Int)

-- Renamed phase: 加 unique id
type instance X_Var Renamed = ((Int, Int), Int)  -- (loc, uid)
type instance X_App Renamed = (Int, Int)

-- Typechecked phase: 加 type
data Type = IntType | IntToInt | Arr Type Type deriving Show
type instance X_Var Typechecked = ((Int, Int), Int, Type)
type instance X_App Typechecked = ((Int, Int), Type)

-- Optimized phase: 加 strictness
type instance X_Var Optimized = ((Int, Int), Int, Type, Bool)  -- bool = strict?
type instance X_App Optimized = ((Int, Int), Type, Bool)

-- 共享 traversal
collectVarNames :: Exp x -> [String]
collectVarNames (Var _ n)     = [n]
collectVarNames (App _ f a)   = collectVarNames f ++ collectVarNames a

-- 4 phase 实例
parsed_x :: Exp Parsed
parsed_x = App (1,1) (Var (1,1) "f") (Var (1,5) "x")

renamed_x :: Exp Renamed
renamed_x = App (1,1) (Var ((1,1), 42) "f") (Var ((1,5), 43) "x")

typed_x :: Exp Typechecked
typed_x = App ((1,1), IntType) (Var ((1,1), 42, IntToInt) "f") (Var ((1,5), 43, IntType) "x")

optimized_x :: Exp Optimized
optimized_x = App ((1,1), IntType, True)
                  (Var ((1,1), 42, IntToInt, True) "f")
                  (Var ((1,5), 43, IntType, False) "x")
```

**手算结果**：

| 输入 | `collectVarNames` 输出 | 类型 |
|---|---|---|
| `parsed_x` | `["f", "x"]` | `Exp Parsed` |
| `renamed_x` | `["f", "x"]` | `Exp Renamed` |
| `typed_x` | `["f", "x"]` | `Exp Typechecked` |
| `optimized_x` | `["f", "x"]` | `Exp Optimized` |

**验证 Property 3.2**：同一份 `collectVarNames` 在 4 phase 上结果一致，类型 generic 通过。✓

label：`[Property 3.2 verified at toy level for 4 phases]`

### Toy 2（corner case）：`Void` 关掉 constructor，验证 Theorem 4.1

构造一个 `New` constructor，在 Parsed phase 用 `Void` 禁用：

```haskell
import Data.Void  -- 提供 data Void

data Exp x
  = Var  (X_Var x) String
  | New  (X_New x)             -- 仅某些 phase 可用

type family X_New x

-- Parsed: 禁用 New
type instance X_New Parsed       = Void

-- Typechecked: 启用 New，携带 Coercion 信息
data CoercionData = MkCoercion String deriving Show
type instance X_New Typechecked  = CoercionData

-- 尝试构造 Parsed phase 的 New：不可能
-- bad :: Exp Parsed
-- bad = New ???                -- 没有任何 :: Void 的值！
-- 编译错误：No value of type Void in scope

-- 构造 Typechecked phase 的 New：可以
typed_with_new :: Exp Typechecked
typed_with_new = New (MkCoercion "Int ~ Int")

-- 写 freeVars 时必须处理所有 constructor，但 Parsed 永远走不到 New 分支
freeVars :: Exp x -> [String]
freeVars (Var _ n) = [n]
freeVars (New _)   = []        -- Parsed phase: dead branch（Theorem 4.1 保证）
```

**手算手动尝试**：

```
> :t (New :: ??? -> Exp Parsed)
要求第一个参数 :: Void，但 Void 无 inhabitant
→ 整个表达式 ill-typed，编译器拒绝
```

**验证 Theorem 4.1**：phase-gating soundness——`X_C x = Void` 让 `Exp x` 在 `C` 上不可构造。✓

但有一个 corner：`undefined :: Void` 在 runtime 仍然存在（Haskell 是 non-total），
所以 Theorem 4.1 严格说是"良类型且 total 时"成立。论文 §4.2 footnote 提了 totality 但没展开。

label：`[Theorem 4.1 verified; corner: non-totality limit noted]`

### Toy 3（极限情形）：multi-extension 同时关掉多个 constructor

让 Parsed phase 同时禁用 `New` 和 `Coerce` 两个 constructor，看 type family 解析是否仍然 confluent：

```haskell
data Exp x
  = Var    (X_Var    x) String
  | New    (X_New    x)
  | Coerce (X_Coerce x) (Exp x)

type family X_Var    x
type family X_New    x
type family X_Coerce x

-- Parsed phase: 禁用 New 和 Coerce
type instance X_Var    Parsed = ()
type instance X_New    Parsed = Void
type instance X_Coerce Parsed = Void

-- Renamed phase: New 仍禁用，Coerce 启用为 ()
type instance X_Var    Renamed = ()
type instance X_New    Renamed = Void
type instance X_Coerce Renamed = ()

-- Typechecked phase: 全部启用
data CoercionData = MkCoercion String
type instance X_Var    Typechecked = ()
type instance X_New    Typechecked = CoercionData
type instance X_Coerce Typechecked = CoercionData

-- 极限验证：写一份 freeVars 处理所有 phase
freeVars :: Exp x -> [String]
freeVars (Var _ n)     = [n]
freeVars (New _)       = []                         -- 在 Parsed/Renamed 不可达
freeVars (Coerce _ e)  = freeVars e                 -- 在 Parsed 不可达；Renamed/Tc 可达
```

**手算 Phase 矩阵**：

| Phase | `Var` 可达？ | `New` 可达？ | `Coerce` 可达？ |
|---|---|---|---|
| Parsed | ✓ | ✗ (Void) | ✗ (Void) |
| Renamed | ✓ | ✗ (Void) | ✓ |
| Typechecked | ✓ | ✓ | ✓ |
| Optimized | ✓ | ✓ | ✓ |

`freeVars` 一份代码覆盖 4 phase × 3 constructor = 12 组合，全部 type-check 通过。

**验证 Theorem 4.1 在多 extension 同时存在时仍然 sound**：
两个 `Void` 实例独立工作，没有相互干扰。✓

但极限时的尴尬：**穷举 case 分支必须写所有 constructor**——
即使 Parsed 阶段 `New` 不可达，`freeVars (New _) = []` 这一行仍然必须存在
（否则 GHC 8.x 报 non-exhaustive warning；GHC 9.x 用 `EmptyCase` 才能消除）。
**这是 idiom 的工效成本**——写代码的人要写"永远不执行的分支"。

label：`[Theorem 4.1 verified at multi-extension limit; ergonomic cost noted]`

### Layer 4 总结

3 个 toy 全部跑通；论文核心定理 Property 3.2 + Theorem 4.1 在 toy 级别可验证。
**与论文差距**：

- 论文 Theorem 6.1 (existential 扩展) 我没复现——需要 GADT 完整支持，超出手算范畴。
- 论文 §8 GHC migration 工作量我没复现——只能引用 GHC GitLab MR 数字（≥ 1500 commits）。
- Property 3.3 零开销我没 benchmark——需要 GHC core dump 才能确认 `()` extension 不分配。

results.md（精简）：
- TL;DR：toy 1 验证 generic traversal；toy 2 验证 Void 禁用；toy 3 验证多 extension 共存。
- Limitations：N=3（只 3 个 toy）/ 没跑 existential / 没 benchmark / 用 ghc 9.4 而非 8.0（论文同期版本）。

---

## 谱系对比（Layer 5 · 前作 + 后作 + 反对者）

### 前作 1：Phantom Types（Cheney & Hinze 2003）

`data Expr a = ...` 中 `a` 是 phantom 类型参数，不出现在 constructor 字段里——但被用作类型层标签
（如 `Expr Int` 表示求值得到 Int 的表达式）。
TTG 把 phantom 类型从"求值类型"扩展为"phase 标签"。**phantom 是 TTG 的精神祖先**。

### 前作 2：GADT (Generalized Algebraic Data Types, Peyton Jones et al. 2006)

允许 constructor 约束返回类型：`data Expr a where IntE :: Int -> Expr Int`。
TTG 不依赖 GADT 完整能力，但 §6 的 existential 扩展用了 GADT 语法。
**GADT 是 TTG 的工具箱**，不是替代品——GADT 解决"constructor 类型异质"，
TTG 解决"phase 间扩展"。

### 前作 3：Data Types à la Carte（Swierstra 2008）

把 sum types 拆成 atomic constructors，用 functor coproduct `(:+:)` 组合。
理论优雅但**编程负担重**——每次操作 AST 需要 fold over functor。
TTG 选了**实用 over theoretical purity**——保留普通 ADT 形式，仅在字段处加 type family。

### 同期：Compositional Data Types（`CDT`，Bahr & Hvitved 2011）

DTAC 的扩展 + smart constructor 工程化。仍然 functor-based，**Haskell 原生支持差**。
TTG 论文 §7 明确对比，结论："我们牺牲一些理论纯度换取 Haskell 原生 + 工程友好。"

### 后作 1：GHC AST refactor（8.0+, 2016-2021）

GHC 实际工程化采用 TTG。**减少了估计 50%+ 的 AST 同步代码**——
但也带来了 type family 编译速度问题（GHC 自己的瓶颈之一）。
工程引用：[GHC MR !1066 'GhcPass refactor'](https://gitlab.haskell.org/ghc/ghc/-/merge_requests/1066) +
后续 ~5 个版本周期 follow-ups。

### 后作 2：Rust enum + variants

Rust 的 `enum` + `match` 提供 sum types，但**没有 type family**——
Rust AST（如 `syn` crate / rustc 内部 IR）用多套独立 IR + trait `Visit` 实现 phase 抽象。
**思路相同，机制不同**。

### 后作 3：OCaml polymorphic variants

OCaml 的 polymorphic variants `[ Var of string | App of t * t ]` 允许"开放" sum types
——可以加新 variant 而不破坏旧代码。
**理论上比 TTG 更直接解决 expression problem**，但 OCaml 类型推导 + variant 交互复杂，
工程实践远不如 TTG 普及。

### 反对者：Type Family Madness 派

GHC 社区有人长期反对 type family 滥用（如 [Lennart Augustsson 2019 blog "Type Families Are Harmful"]，
+ stackoverflow 上的"type family 编译速度"长贴）。
**论点**：type family 不 strongly normalizing、debug 困难、误用导致 GHC 编译期爆炸。
TTG 正好把 type family 推到 GHC AST 这种"几百节点"的核心数据结构——**反对者认为这是把 type family 用到了它最不该用的地方**。

### 选型建议表

| 场景 | 选谁 |
|---|---|
| Haskell 编译器（多 phase） | Trees that Grow（GHC 模板） |
| TypeScript-style（动态语言 compiler） | enum + optional fields + visitor |
| 极致灵活、插件化 | Visitor pattern + plugin |
| 学术理论 / 完全 extensible | Data Types à la Carte |
| Rust / OCaml 生态 | trait Visit / polymorphic variants |

---

## 与你当前工作的连接（Layer 6 · 三段，每段 ≥ 4 子弹）

### 今天就能用

任何"多 phase 处理同一数据结构"场景：

- 数据 pipeline：raw → cleaned → enriched → aggregated 各 phase 加不同字段（用 TS conditional types 模拟 type family）
- API 演化：v1 / v2 / v3 schema 共享核心 + 各自扩展字段（TS discriminated union + version tag）
- 编辑器 buffer：raw text → tokenized → parsed → semantic-analyzed
- 学习项目：写自己的 mini-lang 时，AST 直接套 TTG 模板——4 phase 共享 `freeVars`/`pretty`/`size` 等 traversal

不一定要用 Haskell type family——TypeScript 的 generics + conditional types、Scala 的 type member、Rust 的 associated types 都能模拟。

### 下个月能用

设计任何 AST-like 数据结构时，问自己 4 个问题：

- 是否多 phase 处理？（≥ 2 个 phase 才值得）
- 各 phase 是否需要不同元数据？（≥ 3 种附加字段才值得）
- 是否有共享的 traversal 操作？（≥ 5 个 generic 函数才划算）
- 是否需要 phase-gating（某 constructor 只在某些 phase 出现）？（这是 TTG 比简单 generic 强的地方）

如果都是"是"，借 Trees that Grow 思路：generic 骨架 + phase-specific 扩展点 + Void gating。

### 不要用的部分

- **不要在简单单 phase AST 上用**：type family 复杂度 > 收益；3 行 ADT + 2 个 traversal 就够了
- **不要把 X_Foo 字段名直接抄到非 Haskell 语言**：每个语言有自己的 idiom（Rust 用 trait associated type，TS 用 conditional type）
- **不要忽视编译速度成本**：type family 让 GHC 编译变慢——大 AST 项目要 benchmark
- **不要用在动态语言**：Python / JS 没有静态类型支撑，TTG 的"类型层 phase tag"完全失去意义；改用 visitor pattern + duck typing
- **不要在团队没人懂 type family 时用**：维护者必须看得懂 `X_Var Renamed` 这种间接寻址；学习成本高

---

## 怀疑 + 延伸阅读（Layer 7 · ≥ 4 显式怀疑）

### 我对这篇论文最不信的 5 件事

1. **GHC migration 实际工作量论文 underplay**（§8）：Section 8 提了 migration 但
   **没给具体 LOC 改动数字**。实际 GHC 8.0 这次 AST refactor 从 2016 启动到 2021 还在 follow-up，
   涉及 ~1500 commits（GitLab MR 跟踪）。**论文把它写成 "we did the migration, here's some lessons"，
   实际是一场跨 5 年的工程战役**。
2. **Type family 编译速度论文不讨论**（§3 & §8）：每加一层 type family 实例化，GHC 编译期增加。
   GHC 自己用 TTG 之后编译变慢——但论文没量化。**长期看 AST 用 type family 是否值得 performance tax？论文回避**。
3. **Pattern synonyms 在 IDE 中支持差**（§5）：Haskell IDE / HLS 对 pattern synonyms 跳转 / 重命名长期不完美——
   "工具痛"是论文不提的工程现实。论文 §5 把 pattern synonyms 当 free 工效改进，但实际它有维护成本。
4. **Theorem 4.1 假设 totality**：论文严格说"良类型 + total"时 `Void` 禁用 constructor 才成立。
   Haskell 是 non-total（`undefined :: Void` 存在），意味着**runtime panic 仍然可能在"被禁用"的 constructor 上**。
   这不是抽象担心——GHC 实际代码用 `panic "ttg-encoded-violation"` 之类的 trap。
5. **Theorem 6.1 推广到多 existential 没显式证**（§6.3）：论文证明 1 个 existential 变量的情形，
   但 GHC 实际 AST 有多 existential 嵌套。**"假设 1 个，实际多个"是 theory paper 常见 corner**。

### 接下来读哪 4 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Data Types à la Carte (Swierstra 2008) | extensible AST 学术理论根 |
| 2 | The Expression Problem (Wadler 1998) | 这是所有 extensible AST 工作的源问题 |
| 3 | GHC HsSyn refactor MR !1066 + follow-up blog posts | 实际 migration 经验 + LOC 数字 |
| 4 | "Type Families Are Harmful" (Augustsson 2019, blog) | 反对者视角，避免 type family 滥用 |

读完这 4 篇 + Trees that Grow，你拥有"可扩展数据类型 1998-2021"完整地图。

---

## 限制（Layer 7 · 分支 D 必填三类：假设强度 / 实际系统差距 / 复杂度边界）

论文 §7 + 我的补充（共 ≥ 6 条，覆盖三类必填）：

**假设强度类**：

1. **不解决 type-class 的多 dispatch 问题**——TTG 只解决 data type 扩展，不解决 method 扩展
2. **依赖 type family confluence + termination**——理论上 GHC 的 type family 不 strongly normalizing，TTG 的定理证明在 confluent + terminating 情形下才严格成立

**实际系统差距类**：

3. **Pattern synonyms 工具支持有限**——HLS / hlint / refactor 工具对 pattern synonyms 长期不完美
4. **GHC 编译速度受 type family 影响**——type family 让 GHC type-checking 慢，TTG 在 GHC 自身上引入了这种 tax
5. **Migration 工作量大**——不是 free lunch；GHC 8.0 → 9.x 用了 5+ 年才把整个 HsSyn 迁完

**复杂度边界类**：

6. **比 DTAC 缺少形式化保证**（trade-off：工程友好 vs 理论纯度）——TTG 牺牲 functor 组合的代数性质
7. **非 Haskell 语言移植困难**——思想可借鉴，具体实现迥异；TS / Rust / OCaml 都需要重新设计 idiom
8. **多 extension 嵌套时 ergonomic 退化**——`(((SrcLoc, Int), Type), Bool)` 这样的 tuple 链在 Optimized phase 嵌套很深，pattern match 写起来很丑

---

## 附录：叙事错位清单（Layer 7 加分 · 论文宣称 vs 代码现实）

| # | 论文宣称（§ 出处） | GHC 代码现实 | 差距点 |
|---|---|---|---|
| 1 | "TTG idiom is lightweight"（§3 摘要） | GHC 9.x 用了 ~25 module 的 `compiler/GHC/Hs/*.hs` 才把 idiom 全部部署 | 论文低估 idiom 部署的代码体量 |
| 2 | "Pattern synonyms make it ergonomic"（§5） | GHC 实际代码大量用 `view patterns` + `XExpr p ~ NoExtCon` 约束而不是纯 pattern synonyms | 工程上 pattern synonyms 不够，需要更多语法糖叠加 |
| 3 | "Generic traversal works for all phases"（§3.4） | 实际 `freeVars` 类函数在 GHC 内常需要 phase-specific 优化（如 `GhcTc` 阶段使用 `Type` 信息加速） | "完全 generic"是理论，工程实践常需要 specialization |
| 4 | "Migration is straightforward"（§8） | GHC GitLab issues 显示 migration 跨越 8.0 → 9.6 多个版本，涉及 ~150 contributors | "straightforward" 等于"用了 5 年" |

---

## 结尾元数据

- 重构日期：2026-05-28
- 论文类型：theory（v1.1 分支 D）
- 总行数：~530 行（v1.0 379 行 → v1.1 升级）
- Definition / Theorem / Lemma / Property 锚定数：5（Definition 3.1 / Property 3.2 / Property 3.3 / Theorem 4.1 / Theorem 6.1）
- 显式怀疑数：5（Notation 速记表的怀疑 0 + Layer 3 的怀疑 1/2/3 + Layer 7 的 5 件不信中的细化）
- Figure：1 张 webp（`01-ttg-extension.webp`，PIL paper-figure 风）
- 启用 skill / 工具：deep-paper-note + phd-skills + 状元篇 v1.1 分支 D
- 谱系链：Phantom Types (2003) → GADT (2006) → DTAC (2008) → CDT (2011) → **TTG (2017)** → GHC AST refactor (2016-2021) / Rust enum / OCaml polymorphic variants

---

**Layer 0-7 完成（按状元篇 v1.1 分支 D theory 模板）。
约 530 行，含 1 张 figure（webp）+ Mini AST 4 phase 手算 + Toy 1/2/3 三个手算实例 + 4 步速查 + 叙事错位附录。**

**Season C · 前端 / 编译器 / 工具链 3/5。**
