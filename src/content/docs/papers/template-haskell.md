---
title: Template Haskell — 让 Haskell 在编译期把代码当数据玩
来源: Sheard & Peyton Jones, "Template Meta-programming for Haskell", Haskell Workshop 2002
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级偏上
provenance: pipeline-v3
---

## 是什么

Template Haskell（**TH**）是给 Haskell 加的一套**编译期元编程**工具——你能在编译时拿着"代码本身"当数据来读、改、生成，再把结果塞回源文件继续编译。

日常类比：写一封模板邮件。

- 普通编程：你直接写好整封信。
- TH：你写一份"信生成器"，它在你按发送之前，根据收件人姓名 / 订单号自动拼出 100 封不同的信，编辑器还要替你挑错别字。

TH 给你三件东西，让"代码生成"变成正经的语法：

- `[| e |]`（quotation / brackets）：把 e **包成代码值**，类型是 `Q Exp`，不立刻执行
- `$(e)`（splice）：在编译期**跑** e，把它产出的 `Exp` AST **拼回**源文件
- `Q` monad：在编译期生成新名字、查类型、抛报错的副作用容器

跟 Lisp 宏的区别：TH 的代码值**有类型**，编译期就能查错。

## 为什么重要

不理解 TH，下面这些事都讲不清：

- 为什么 Haskell 的 Lens、persistent ORM、aeson、esqueleto 能"加一行 `$(makeLenses ''Foo)` 自动生成几十行 boilerplate"——背后就是 TH
- 为什么 GHC 文档把 TH 和 [[metaml-multi-stage]] 放一起讲——它就是 MetaML 思想到工业语言的落地
- 为什么 Lean / Idris / Scala 3 后来都搞了 macro / elaboration 系统——它们公开承认抄了 TH 的设计
- 为什么"编译慢"成了 Haskell 项目的常见吐槽——大量 TH 让 GHC 必须先跑生成代码再编译

## 核心要点

TH 的全部魔法压成 **三个算符 + 一个 monad + 一条规矩**：

1. **quotation `[| e |]`**：把 e 包起来不算，**类型 `Q Exp`**——一段会算出某 Haskell 表达式的代码值。类比：把菜谱字条折起来塞兜里。
2. **splice `$(e)`**：编译期跑 e 这个 `Q` 计算，把得到的 `Exp` **接回**源文件继续编译。类比：把折好的字条贴回菜谱当前行。
3. **`Q` monad**：在 `Q` 里你能 `newName` 生成不冲突的变量名、`reify` 查任何已声明类型的内部结构、`qReport` 抛编译错。类比：厨房助理，专门帮你查食材表、起新名字。
4. **stage restriction**：splice 用到的代码必须在**前一阶段**编译完。同一文件先 `f x = ...` 再 `$(f 3)` 不行——`f` 还没编译。这一条是和 Lisp 宏最大的区别。

附带一个细节叫 **cross-stage persistence**：外层普通变量能被 quotation 里引用，但有 lift 规则约束，不会让任意 IO 漏进编译期。

## 实践案例

### 案例 1：编译期生成一段加法

最小例子。普通写法：

```haskell
add1 x = x + 1
```

TH 写法（先 quote 再 splice）：

```haskell
addExpr :: Q Exp
addExpr = [| \x -> x + 1 |]

add1 = $(addExpr)
```

编译时 `$(addExpr)` 跑 `addExpr` 拿到 `Exp`，把它接回去——最终 `add1` 还是 `\x -> x + 1`，但**经过一次代码生成**。光看这例子像绕远路，但下一个就值了。

### 案例 2：自动 derive `Show`（TH 的真正杀手锏）

普通 Haskell：你想让 `data User = User { name :: String, age :: Int }` 能 `show`，要么 `deriving Show`，要么手写一遍。如果 `deriving` 不够用、想自定义格式，只能复制粘贴。

TH 一行解决：

```haskell
deriveShow ''User
-- 编译期 reify User 的字段，生成：
-- instance Show User where
--   show (User n a) = "User { name=" ++ show n ++ ", age=" ++ show a ++ " }"
```

`deriveShow` 内部用 `reify ''User` 拿到字段表，循环拼出 `Exp`，再 splice 回去。**100 个 record 只写一行**。这是 Lens / aeson / persistent 全部建立的基础。

### 案例 3：编译期常量幂函数（对照 [[metaml-multi-stage]]）

```haskell
power :: Int -> Q Exp
power 0 = [| 1 |]
power n = [| $(varE 'x) * $(power (n-1)) |]

cube = $( [| \x -> $(power 3) |] )
-- 编译期展开成 \x -> x * x * x * 1
```

把 MetaML 的 `<>` 换成 `[||]`、`~` 换成 `$()`，思路完全一样——但因为是 Haskell，`Q Exp` 走的就是 GHC 类型检查。

## 踩过的坑

1. **stage restriction 卡新手**：在同一文件 `f x = x*2` 然后 `$(f 3)`——GHC 拒绝。要么 `f` 拆到另一个 module，要么把它写进 quotation。新人第一天写 TH 几乎都撞这。
2. **untyped `Q Exp` 类型太松**：原版 TH 的 `Exp` 不带"生成出来是什么类型"，写错要等 splice 后才报错。Pickering 等人 2016 提出 **Typed TH**（`Q (TExp t)`），splice 时同时检查嵌入类型，但要写更多注解。
3. **cross-stage persistence 出 IO 易踩雷**：quotation 里引用一个 `IORef` 不会自动序列化，要么定义 `Lift` 实例，要么编译期就报错。
4. **TH 拖慢编译**：每个 splice 都要先把 `Q` 计算编完跑出来，再继续主编译。大型工程（如 Yesod）TH 占 30%+ 编译时间是常态。

## 适用 vs 不适用场景

**适用**：

- 自动生成 `Show` / `Eq` / `ToJSON` 这类 boilerplate instance（aeson、persistent）
- Lens / Prism 自动生成（`makeLenses`）
- 编译期 SQL / 正则校验（quasi-quote 把 `[sql| SELECT * FROM ... |]` 在编译期解析）
- 给 DSL 写**类型化**前端，避免 Lisp 宏式的运行时崩

**不适用**：

- 想写"在自身文件里被立即调用"的 helper → stage restriction 拒绝
- 调试性强的代码 → TH 生成的 AST 出错栈很难看，新人定位慢
- 编译时间敏感的 CI → 大量 TH 会让编译慢到不能忍
- 想跨编译器移植 → TH 是 GHC 特有，其他 Haskell 实现（如 Hugs）没有

## 历史小故事（可跳过）

- **1990s 末**：Tim Sheard 在 Oregon Graduate Institute 做 [[metaml-multi-stage]]——一门把"代码当类型化值"的研究语言。
- **2002 年**：Sheard 联手 GHC 主架构师 Simon Peyton Jones，把 MetaML 思想搬进 Haskell，发表在 Haskell Workshop。**当年**就进了 GHC 6.0 主线。
- **2007 年**：Mainland 加了 quasi-quote，让 `[sql|...|]` 这类自定义语法成为可能，TH 杀手锏从此成型。
- **2016 年**：Pickering 等补完 Typed TH 形式语义（`Q (TExp t)` 类型保证），让"splice 出错"在 splice 前就能报。
- **今天**：Lean 4、Idris 2、Scala 3 macros 都公开承认借鉴 TH 设计。

## 学到什么

1. **代码就是数据**——不只 Lisp，类型化语言也能玩，关键是 AST 类型（`Exp`）+ monad 控制副作用。
2. **stage restriction 是 TH 的核心妥协**：换来"先编译生成器、再用生成器"，避免 Lisp 宏的"运行时类型崩"。
3. **类型化 staging 工程化** 比 Lisp 宏多一层成本（要查类型 / 起新名），但换来工业语言敢拿来 derive 几万行 boilerplate 的安全感。
4. **从 1990s 研究语言到 GHC 主线只花了 5 年**，是函数式社区"理论 → 落地"最快的一次。

## 延伸阅读

- 入门视频：[Aelve Guide — Template Haskell](https://www.youtube.com/results?search_query=template+haskell+tutorial)（Haskell 社区入门讲义）
- GHC 官方 doc：[GHC User's Guide — Template Haskell](https://downloads.haskell.org/~ghc/latest/docs/users_guide/exts/template_haskell.html)
- Typed TH 形式化：[Pickering et al, "Working with Source Plugins", Haskell 2019]
- 论文 PDF：[Sheard & Peyton Jones 2002](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/meta-haskell.pdf)
- [[metaml-multi-stage]] —— TH 的直系祖先，思想完全一致，只是宿主从研究语言换成 GHC

## 关联

- [[metaml-multi-stage]] —— MetaML 提供"类型化代码值"的核心思想；TH 是它在 Haskell 上的落地
- [[partial-evaluation-jones]] —— 偏特化是"自动找 stage"，TH 是"程序员显式写 stage"，互为镜像
- [[hindley-milner]] —— Q Exp 走 GHC 类型检查，HM 推导仍是底座
- [[gadt-pjones]] —— Typed TH 的 `Q (TExp t)` 用 GADT 编码"代码生成出来是 t 类型"
- [[trees-that-grow]] —— 给 GHC 内部 AST 类型族升级，让 TH/插件读取 AST 更稳
- [[peyton-jones-stg]] —— 同作者另一篇基础设施工作，TH 生成的代码最终走 STG 跑
- [[theorems-for-free]] —— 多态类型直接给定理；TH 让"按类型自动生成实例"成为常用工艺
- [[system-f-reynolds-1974]] —— Typed TH 的多态变量本质是 System F 的 ∀

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lean-tactics]] —— Lean Tactics — 让证明助手把"写证明"当成写程序
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计

