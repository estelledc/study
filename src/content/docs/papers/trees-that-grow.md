---
title: Trees that Grow — 可扩展的语法树设计
来源: 'Najd & Peyton Jones, "Trees that Grow", J. of Universal Computer Science 2017'
日期: 2026-05-29
子分类: 编程语言
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

Trees that Grow（**TTG**）是一种**让编译器内部的语法树长出不同枝叶**的设计套路。日常类比：以前编译器每个阶段（解析 → 类型推导 → 优化）都要造一棵几乎一样但又不太一样的 AST，复制一遍再加几个字段——四个阶段就是四棵雷同的树，改一处要同步四处。TTG 说："不要复制四棵，造一棵，但**让每个节点带可换字段**。"

具体怎么做：一棵 AST，每个节点都留一个"扩展槽"。槽里装什么，由当前是哪个阶段决定。

```haskell
data Expr p = Var (XVar p) Name | App (XApp p) (Expr p) (Expr p)
```

`XVar p` 不是固定类型，而是**根据阶段 p 算出来的类型**。Parsed 阶段算出来是空，Typechecked 阶段算出来是 `Type`——同一棵树，不同阶段长出不同样子。

## 为什么重要

不理解 TTG，下面这些事都没法解释：

- 为什么 GHC（Haskell 编译器）2018 之后内部 AST 全部改写——这次 refactor 跨越 5 个 GHC 版本、约 1500 个 commits
- 为什么 hsx / haskell-src-exts / Idris 这些第三方 Haskell 工具能"加一个新阶段而不需要 fork 整棵 AST"
- 为什么写编译器后端插件时 fork 整棵 AST 这种做法 2017 之后被淘汰
- 为什么 TypeScript / Babel / SWC 虽然没用 type family，但 AST 设计都借鉴了"骨架共享 + 阶段标注"的核心思路

它和 [[hindley-milner]] 配合得特别好——HM 推完类型后要把类型写回 AST，TTG 提供的"Typechecked 阶段把字段填成 Type"恰好是这一步的工程落地。

## 核心要点

TTG 拆开看是 **三件事**：

1. **AST 类型带阶段参数**：`data Expr p = ...`，p 是"阶段标签"——一个空类型，运行时不存在，只在类型层做标记。

2. **每个 constructor 加一个扩展字段**：`Var (XVar p) Name`、`App (XApp p) ...`——每个节点都多带一个槽，类型由 type family 决定。

3. **type family 把槽的类型和阶段绑定**：`type instance XVar Parsed = ()`、`type instance XVar Typechecked = Type`——同一字段在不同阶段可以是不同类型。

合起来：一棵 AST 骨架 + 阶段决定字段 = 同一份 traversal 代码（如算自由变量、漂亮打印、计算节点数）跨四个阶段复用。

## 实践案例

### 案例 1：Parsed 阶段空、Typechecked 阶段填类型

```haskell
data Expr p = Var (XVar p) Name | App (XApp p) (Expr p) (Expr p)

data Parsed
data Typechecked
data Type = IntT | ArrT Type Type

type instance XVar Parsed       = ()        -- Parsed 阶段不需要类型
type instance XVar Typechecked  = Type      -- Typechecked 阶段填类型
type instance XApp Parsed       = ()
type instance XApp Typechecked  = Type
```

`Var () "x"` 是 Parsed 阶段的合法值；`Var IntT "x"` 是 Typechecked 阶段的值。**同一棵 AST，两种"长法"**。运行时 `()` 是 zero-cost，不增加内存。

### 案例 2：GHC 把三套变量名统一到一棵树

GHC 之前有三个独立的 AST 数据类型，分别用三种"变量名"：`RdrName`（解析后的原始名字）/ `Name`（去歧义后的唯一名字）/ `Id`（带类型信息的标识符）。三套 AST 同步是噩梦——加一个 syntax 节点要改 9 个文件。

TTG 之后 GHC 内部只剩一套，三种身份用 type family 切换：

```haskell
data HsExpr p = HsVar (XVar p) (LIdP p) | HsApp (XApp p) (HsExpr p) (HsExpr p) | ...

type instance LIdP GhcPs = RdrName        -- Parsed 阶段
type instance LIdP GhcRn = Name           -- Renamed 阶段
type instance LIdP GhcTc = Id             -- Typechecked 阶段
```

`HsExpr GhcPs` 装 `RdrName`，`HsExpr GhcTc` 装 `Id`——一棵树，三种身份。GHC 8.0 → 9.x 把约 25 个 `compiler/GHC/Hs/*.hs` 模块按这个套路重写。

### 案例 3：一份 freeVars 代码服务四阶段

```haskell
freeVars :: Expr p -> Set Name
freeVars (Var _ n)   = Set.singleton n
freeVars (App _ a b) = freeVars a <> freeVars b
```

注意模式里写 `_`（不解构扩展字段），整个函数对 p 是泛型的。Parsed / Renamed / Typechecked / Optimized 四个阶段都能用同一份代码。这是 TTG 最大的工程收益——**traversal 代码减少约一半**。

## 踩过的坑

1. **type family 让 GHC 编译变慢**：每加一层 type family 实例化，type checker 要多跑一轮 reduction。GHC 自己迁到 TTG 之后编译时间显著上升——论文回避了这个 tax，但 GHC 社区 issue 长期吐槽。

2. **"永不执行的分支"也得写出来**：如果某阶段用 `Void` 关掉了某个 constructor，理论上 case 里不需要写它的分支——但 GHC 8.x 的 exhaustiveness checker 仍然报 warning，需要 `EmptyCase` 扩展才能压住。**写代码的人要写永远不执行的样板**。

3. **嵌套 tuple 字段会变丑**：Optimized 阶段的字段可能是 `((SrcLoc, UniqueId), Type, Strictness)` 这种四层 tuple，pattern match 写起来很难看。GHC 实际代码用 record 或 newtype 包一层缓解。

4. **Pattern synonyms 工具链不完美**：论文推荐用 pattern synonyms 让用户少打字，但 HLS / hlint / 重命名工具长期对 pattern synonyms 支持不到位——理论很美，工程上有维护成本。

## 适用 vs 不适用场景

**适用**：
- 多阶段处理同一数据结构（≥ 2 个阶段且每个阶段元数据不同）
- 写自己的 mini 编译器 / DSL，AST 直接套这个模板省心
- Haskell / OCaml / Idris 这些有 type family 或 associated type 的语言
- 需要"加阶段而不 fork 整棵 AST"的可扩展场景

**不适用**：
- 单阶段、简单 AST——3 行 ADT + 2 个 traversal 就够，TTG 反而 overkill
- 动态语言（Python / JavaScript）——没有静态类型层，TTG 的"类型层阶段标签"失去意义；改用 visitor pattern
- 团队没人懂 type family——`XVar GhcRn` 这种间接寻址学习成本不低，没人维护就是 bus factor 1
- Rust 生态——Rust 没 type family，rustc 内部走"多套独立 IR + trait Visit"路线；思路相似但机制不同

## 历史小故事

- **2017 年**：Najd（Edinburgh 博士生）+ Peyton Jones（Microsoft Research，GHC 主架构师）把多年 GHC AST 重构经验形式化，发表在 J. of Universal Computer Science（21 页）。
- **2018 年**：GHC 8.4 开始正式应用 TTG idiom，阶段标签命名为 `GhcPs` / `GhcRn` / `GhcTc`。后续几个版本陆续把整族 `HsSyn` 类型迁完。
- **2020 年后**：陆续出现 "Compositional ASTs"、"Multistage AST" 等扩展工作，把 TTG 思路推到更通用的代数数据类型层面。

20 年来"扩展 AST"的研究链条：Phantom Types (2003) → GADT (2006) → Data Types à la Carte (2008) → Compositional Data Types (2011) → **TTG (2017)** → GHC AST refactor (2018+)。

## 学到什么

1. **AST 不必复制 N 份**——一棵骨架 + 阶段化字段，是过去 30 年编译器设计最重要的工程教训之一
2. **类型层的"阶段标签"是 zero-cost 抽象**——运行时不存在，只在编译期做静态保证
3. **理论纯度 vs 工程友好的取舍**：Data Types à la Carte 更优雅但 Haskell 原生支持差；TTG 选了"够用 + 容易落地"的中间点
4. **理论 → 工业落地常常跨越 5 年以上**：2017 论文 → 2018 GHC 8.4 起步 → 2021 还在 follow-up。耐心是真功夫

## 延伸阅读

- 论文 PDF：[Trees that Grow（21 页）](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/trees-that-grow.pdf)
- GHC 实际代码：`compiler/GHC/Hs/Expr.hs` 与 `compiler/GHC/Hs/Extension.hs`（TTG 落地源头）
- 反方观点：Lennart Augustsson, "Type Families Are Harmful"（2019 blog，反对 type family 滥用）
- 背景题：Wadler 的 "The Expression Problem"（1998 邮件帖，所有可扩展数据类型工作的源头）

## 关联

- [[hindley-milner]] —— HM 推完类型要写回 AST，TTG 的 Typechecked 阶段就是这一步的工程落地
- [[lambda-calculus]] —— TTG 的 AST 表达的就是 λ-演算项的扩展形式
- [[standard-ml]] —— ML 系语言是 TTG 思想的天然宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[row-polymorphism-remy]] —— Row Polymorphism — 让记录类型可扩展又不丢类型安全
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩

