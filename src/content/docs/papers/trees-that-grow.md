---
title: Trees that Grow — 可扩展的语法树设计
来源: 'Najd & Peyton Jones, "Trees that Grow", J. of Universal Computer Science 2017'
日期: 2026-05-29
分类: 编程语言
难度: 中级
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

- 为什么 GHC（Haskell 编译器）从 8.4 起把内部 AST 整族改写——跨多个版本的大规模重构，而不是再复制一套树
- 为什么 haskell-src-exts 一类第三方工具想"加一个新阶段"时，不必再 fork 整棵 AST
- 为什么 2017 之后，多阶段编译器里"为每个阶段复制一整棵 AST"的默认做法开始被质疑
- 为什么 TypeScript / Babel / SWC 虽没用 type family，却也常见"同一骨架 + 阶段标注"的多阶段 AST 思路（相近，非直接抄 TTG）

它和 [[hindley-milner]] 配合得特别好——HM 推完类型后要把类型写回 AST，TTG 的 Typechecked 阶段把字段填成 `Type`，正好是这一步的工程落地。

## 核心要点

TTG 拆开看是 **三件事**：

1. **AST 类型带阶段参数**：`data Expr p = ...`，p 是"阶段标签"——像衣服上的季节吊牌，吊牌本身不占重量，只告诉你现在是哪一季。

2. **每个 constructor 加一个扩展字段**：`Var (XVar p) Name`——每个节点多一个"口袋"；口袋里装什么，由阶段决定。

3. **type family 把槽的类型和阶段绑定**：先声明 `type family XVar p`，再写 `type instance XVar Parsed = ()` / `Typechecked = Type`——同一口袋，不同季节装不同东西。

合起来：一棵 AST 骨架 + 阶段决定字段 = 同一份 traversal（自由变量、漂亮打印）跨多阶段复用。

## 实践案例

### 案例 1：Parsed 阶段空、Typechecked 阶段填类型

```haskell
type family XVar p
type family XApp p
data Expr p = Var (XVar p) Name | App (XApp p) (Expr p) (Expr p)

data Parsed
data Typechecked
data Type = IntT | ArrT Type Type

type instance XVar Parsed       = ()     -- Parsed：口袋空着
type instance XVar Typechecked  = Type   -- Typechecked：口袋装类型
type instance XApp Parsed       = ()
type instance XApp Typechecked  = Type
```

**逐部分解释**：

1. `data Parsed` / `data Typechecked` 是阶段吊牌——没有字段，只当类型层标记
2. `type family` + `type instance` 规定：Parsed 口袋是 `()`，Typechecked 口袋是 `Type`
3. `Var () "x"` 合法于 Parsed；`Var IntT "x"` 合法于 Typechecked。运行时 `()` 几乎零成本

### 案例 2：GHC 把三套变量名统一到一棵树

类比：同一个人，解析后叫**外号**（`RdrName`），改名消歧后换**身份证号**（`Name`），类型检查后再换成**带简历的工牌**（`Id`）。以前 GHC 为三种身份各造一棵树，加一个语法节点要改多处。

TTG 之后只剩一套树，身份用 type family 切换：

```haskell
data HsExpr p = HsVar (XVar p) (LIdP p) | HsApp (XApp p) (HsExpr p) (HsExpr p) | ...

type instance LIdP GhcPs = RdrName   -- 外号
type instance LIdP GhcRn = Name      -- 身份证
type instance LIdP GhcTc = Id        -- 带简历的工牌
```

**逐部分解释**：`HsExpr GhcPs` 装外号，`HsExpr GhcTc` 装工牌——一棵树，三种身份。GHC 8.4 起把 `compiler/GHC/Hs/*.hs` 一族按此套路迁完。

### 案例 3：一份 freeVars 代码服务四阶段

```haskell
freeVars :: Expr p -> Set Name
freeVars (Var _ n)   = Set.singleton n
freeVars (App _ a b) = freeVars a <> freeVars b
```

**逐部分解释**：模式里写 `_`，故意不看扩展口袋，所以函数对任意阶段 p 都成立。忽略扩展槽 → 对所有阶段多态；Parsed / Renamed / Typechecked / Optimized 共用一份，这是 TTG 最大的工程收益。

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

## 历史小故事（可跳过）

- **2017 年**：Najd（Edinburgh）+ Peyton Jones 把 GHC AST 重构经验写成 JUCS 论文（约 16–21 页，视排版而定）。
- **2018 年**：GHC 8.4 起正式用 TTG，阶段标签 `GhcPs` / `GhcRn` / `GhcTc`，后续版本迁完 `HsSyn`。
- **2020 年后**："Compositional ASTs"、"Multistage AST" 等把思路推到更通用 ADT。

链条：Phantom Types (2003) → GADT (2006) → Data Types à la Carte (2008) → Compositional Data Types (2011) → **TTG (2017)** → GHC refactor (2018+)。

## 学到什么

1. **AST 不必复制 N 份**——一棵骨架 + 阶段化字段，是编译器设计的关键工程教训
2. **类型层"阶段标签"是 zero-cost 抽象**——运行时不存在，只在编译期做静态保证
3. **理论纯度 vs 工程友好**：Data Types à la Carte 更优雅但落地难；TTG 选"够用 + 易落地"
4. **理论 → 工业落地常跨 5 年+**：2017 论文 → 2018 GHC 8.4 起步 → 后续版本仍在 follow-up

## 延伸阅读

- 论文 PDF：[Trees that Grow](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/trees-that-grow.pdf)
- GHC 落地：`compiler/GHC/Hs/Expr.hs`、`compiler/GHC/Hs/Extension.hs`
- 反方：Lennart Augustsson, "Type Families Are Harmful"（2019）
- 源头：Wadler, "The Expression Problem"（1998）
- [[hindley-milner]] —— 类型写回 AST 的上游算法
- [[gadt-pjones]] —— GADT 是 TTG 之前的类型层扩展工具

## 关联

- [[hindley-milner]] —— HM 推完类型要写回 AST，TTG 的 Typechecked 阶段就是落地
- [[lambda-calculus]] —— TTG 的 AST 表达的是 λ-项的扩展形式
- [[standard-ml]] —— ML 系语言是阶段化 AST 思想的天然宿主
- [[gadt-pjones]] —— GADT 解决"构造子返回更精确类型"，TTG 解决"同构造子跨阶段长字段"
- [[template-haskell]] —— TH 也要操作 Haskell 语法树，和 HsSyn 扩展问题同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
