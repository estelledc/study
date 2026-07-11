---
title: GADT — 让构造子告诉编译器"我返回的是更精确的类型"
来源: 'Vytiniotis, Weirich, Peyton Jones, Washburn. "Simple Unification-based Type Inference for GADTs". ICFP 2006'
日期: 2026-05-29
分类: 编程语言
难度: 高级
---

## 是什么

GADT（Generalized Algebraic Data Type，广义代数数据类型）是**让每个构造子都能给出更精确返回类型**的 ADT 升级版。日常类比：旧 ADT 像快递盒子上只贴"快递"两字，所有盒子返回类型都一样；GADT 给每个盒子贴出**实际装的是什么**——"装书"、"装电池"、"装鞋"，收件人靠盒子标签就知道里面什么货，不用拆开试。

普通 Haskell 写求值器要带 tag：

```haskell
data Term = Lit Int | IsZ Term  -- 全部返回 Term
```

`eval (IsZ (Lit 0))` 得到的是 `Bool`，但类型系统只知道是 `Term`，运行时还要 case 各种 tag。GADT 让构造子把"我装的是 Int / 我装的是 Bool"写进类型：`Lit :: Int -> Term Int`、`IsZ :: Term Int -> Term Bool`，之后 `eval :: Term a -> a` 在每条分支里 `a` 被自动 refine 成具体类型，没有 tag、没有运行期错误。

## 为什么重要

不理解 GADT，下面这些事都没法解释：

- 为什么 Rust 的 `enum` 模式匹配每个分支能拆出不同类型的字段——它就是 GADT 的弱化版本
- 为什么 TypeScript 的 discriminated union（`type T = {kind:'lit', n:number} | {kind:'add', ...}`）写起来这么自然——同一思路
- 为什么 GHC 加了 `{-# LANGUAGE GADTs #-}` 还要程序员**手写** `eval :: Term a -> a` 这种类型——本论文核心结论
- 为什么 Hindley-Milner 不能直接吃下 GADT——HM 假设每个表达式有"最一般类型"，GADT 一加这个性质就丢了

## 核心要点

GADT + 类型推断这门难题，论文给出三个关键思想：

1. **rigid（顶住）vs wobbly（飘）**：环境里的每个变量都打两种标签——由用户类型签名完全确定的叫 rigid，没标注或推断中的叫 wobbly。类比：rigid 像钉死的木桩，wobbly 像还在飘的气球。算法靠这两类标签判断"该不该精化"。

2. **type refinement 只对 rigid 生效**：写 `case x of Lit i -> ...` 时，只有当 `x` 是 rigid 才会触发"现在 a 等于 Int"的精化；wobbly 的 `x` 不会，因为它的类型可能被左右上下文反向影响，先精化容易推错。这条规则把不确定性"封锁"在 wobbly 部分。

3. **算法贴近 HM**：refinement 限制在 rigid 之后，整个推断算法就是标准 [[hindley-milner]] 加几条小规则——既证明 sound + complete，又能在 GHC 这种巨型代码库里实现。论文还顺手证明了它对原有 HM 是保守扩展，不写 GADT 的老程序行为不变。

## 实践案例

### 案例 1：typed AST 求值器

```haskell
{-# LANGUAGE GADTs #-}
data Term a where
  Lit  :: Int -> Term Int
  IsZ  :: Term Int -> Term Bool
  If   :: Term Bool -> Term a -> Term a -> Term a

-- 顶层签名启用了 polymorphic recursion，递归调用允许带不同 a
eval :: Term a -> a
eval (Lit i)    = i              -- 此分支 a 被 refine 成 Int
eval (IsZ t)    = eval t == 0    -- 此分支 a 是 Bool，递归 t :: Term Int
eval (If b x y) = if eval b then eval x else eval y
```

**逐部分解释**：

- `Term a` 的 `a` 是这棵 AST 真正会被求值出的值类型，而不是表达式本身的形状
- `Lit :: Int -> Term Int` 强制 `Lit` 节点对应的 `a = Int`；同理 `IsZ :: Term Int -> Term Bool`
- 模式匹配到 `Lit i` 时编译器把 `a` 临时等价于 `Int`，右边返回 `i :: Int` 合法
- 不需要程序员手写 tag dispatch——这就是 GADT 比 sum type 强在哪儿

### 案例 2：类型相等见证（EqW）

```haskell
-- 注意命名为 EqW 避免与 Prelude 自带 class Eq 冲突
data EqW a b where
  Refl :: EqW a a                 -- 唯一构造子，构造时强制 a 与 b 同名

cast :: EqW a b -> a -> b
cast Refl x = x                   -- 模式匹配 Refl 让编译器把 a 和 b 等同
```

**类比 + 解释**：`EqW a b` 读作"我手里有一张证明：类型 a 和类型 b 其实是同一个"。把 `Refl` 想成"身份证比对"——唯一构造子，造出来时签名就要求两边同名（`a = a`）；模式匹配到 `Refl` 时 GADT 触发 refinement，编译器在右边把 `a` 和 `b` 等同，于是可以把 `a` 当 `b` 返回。这是 Haskell 写 typesafe cast（安全类型转换）的标准姿势。

### 案例 3：长度索引向量（safe head）

```haskell
{-# LANGUAGE GADTs, DataKinds, KindSignatures #-}
data Nat = Z | S Nat                 -- DataKinds 让 Z / S Nat 能当类型用
data Vec (n :: Nat) a where
  Nil  :: Vec 'Z a
  Cons :: a -> Vec n a -> Vec ('S n) a

safeHead :: Vec ('S n) a -> a        -- 类型层就拒绝空列表
safeHead (Cons x _) = x
```

**逐部分解释**：平时 `Nat` 是值（运行时的数字）；`DataKinds` 像给数字盖个"类型章"，把 `Z` / `S n` 提升到类型层当标签用（kind 可以粗想成"类型的类型"）。`Nil :: Vec 'Z a` 把空列表长度钉成 `'Z`；`safeHead` 要求长度形如 `'S n`（至少 1），传 `Nil` 直接编译期报错——这种"不变量进类型"对应 Rust typestate 和 TypeScript discriminated union。

## 踩过的坑

1. **不写顶层类型签名就别指望编译器猜对**：例如 `f x y = case x of Lit i -> i + y; other -> 0`，`Term a -> Int -> Int` 和 `Term a -> a -> Int` 都讲得通，互不更一般，GHC 只会保守拒绝；论文核心结论就是"用户标注是不可省的"。

2. **GADT 程序往往要 polymorphic recursion**（直白讲：同一张菜谱允许每次换不同食材规格——函数自己调自己时，每次调用可带不同具体类型）：`eval` 在 `If` 分支递归时 `a` 已被 refine 成具体类型，没有顶层 `:: Term a -> a` 签名，HM 的 let 泛化走不通——所以 GADT 函数必须先写签名。

3. **lambda 里 type refinement 不生效**：最小反例 `f = \x -> case x of Lit i -> i`，GHC 报 "Cannot match expected type 'a' with actual type 'Int'"；原因是 `x` 是 wobbly（没标注），refinement 规则不触发。解法是把它写成 `(\x -> case x of ...) :: Term a -> Int`，让 `x` 变 rigid。

4. **早期 GHC 实现规则比论文复杂**：论文第一版允许类型同时含 rigid 和 wobbly 部分，规则极绕；作者后来收紧成"要么全 rigid 要么全 wobbly"，新版 GHC 的行为更可预测，但升级老代码时偶尔遇到"以前过、现在挂"的差异。

## 适用 vs 不适用场景

**适用**：
- 嵌入式 DSL 求值器、表达式树（typed AST 是 GADT 经典杀手锏）
- 把不变量编进类型——长度索引向量、红黑树平衡见证、状态机过期排除
- 类型相等证明 / 安全类型转换（`Eq a b` 风格）
- 通用数据结构的"按形状分支"场景，对应 [[bidirectional-typing]] 在某些位置的需求

**不适用**：
- 不能或不愿写顶层类型签名的快速脚本——GADT 对标注重度依赖
- 对 inference 完整性敏感的项目（要 principal type 保证）→ 退回普通 ADT 或 [[liquid-types]]
- 类型层逻辑过深以至于错误信息无人能读懂时——升级到完整依赖类型（Agda/Idris）反而更清晰
- 仅需简单 sum type 的 TypeScript / Rust 工程——discriminated union / `enum` 已够，没必要套完整 GADT

## 历史小故事（可跳过）

- **2003 年**：Hongwei Xi 等人提出 guarded recursive data types，Cheney 与 Hinze 同年给出 first-class phantom types——同一思想两个名字。
- **2006 年**：Vytiniotis、Weirich、Peyton Jones、Washburn 在 ICFP 发表本论文，提出 wobbly types 把推断成本压到接近 HM；这是 GADT 进 GHC 主线的工程基础。
- **2010s**：Rust 的 enum、TypeScript 的 discriminated union、Swift enum with associated values 普及，让"GADT 直觉"通过工业语言走进每个程序员的日常。
- **2016 年**：本论文获 ACM SIGPLAN Most Influential ICFP Paper Award——10 年回望，影响力盖章。
- **现在**：GHC 真正落地的 GADT 推断已演化成 OutsideIn(X) 框架（Vytiniotis 等 2011），是本论文思想的工业延伸。

## 学到什么

1. **类型系统设计常常是"放弃一点完备性换可推理"**：GADT 完整推断不可判定，论文用"必须写注解"换来算法简洁，是非常实用主义的取舍
2. **rigid/wobbly 这种"标记驱动"思想到处都用**——TypeScript 的 contextual typing、bidirectional typing、Rust 的 `let _: T =` 引导推断都是同一招
3. **同一个理论会以不同名字反复出现**——guarded recursive、first-class phantom、equality-qualified，最后定名 GADT；遇到陌生术语先查它换名字没有
4. **理论 → 算法 → 工程 10 年节奏**：2003 提出 → 2006 工业可推断 → 2010s 主流语言借鉴

## 延伸阅读

- 视频：[Simon Peyton Jones — Adventure with types in Haskell](https://www.youtube.com/watch?v=6COvD8oynmI)（讲 GADT 来龙去脉，幽默易懂）
- 入门博客：[24 Days of GHC Extensions: GADTs](https://ocharles.org.uk/blog/posts/2014-12-03-gadts.html)（Haskell GADT 速成）
- 论文 PDF：本论文 ICFP 2006 版可在微软研究院发表页找到
- [[hindley-milner]] —— GADT 推断算法基本就是 HM 加几条小补丁
- [[bidirectional-typing]] —— "rigid 引导推断" 的同源思想，更通用的版本

## 关联

- [[hindley-milner]] —— GADT 推断本质是 HM 加 rigid/wobbly 标记，懂 HM 才懂 wobbly
- [[system-f-reynolds-1974]] —— GADT 在更基础层面是 System F 的 existential 编码
- [[bidirectional-typing]] —— 两者都靠"用户标注引导推断"，理念相通
- [[local-type-inference]] —— 同样应对完整推断不可行的工程妥协路线
- [[liquid-types]] —— 把不变量进类型的另一条路，比 GADT 更自动但更受限
- [[linear-types]] —— 同样把使用约束塞进类型，思路平行

理解 GADT 之前，建议先牢牢掌握 [[hindley-milner]]——本论文的所有"不确定性管理"招式，都是在 HM 这条已铺好的轨道上加装控制阀。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[idris-brady]] —— Idris — 让依赖类型从证明助理变成通用编程语言
- [[row-polymorphism-remy]] —— Row Polymorphism — 让函数不必知道 record 的全部字段
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
