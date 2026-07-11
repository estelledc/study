---
title: Template Haskell — 让 Haskell 在编译期把代码当数据玩
来源: 'Sheard & Peyton Jones, "Template Meta-programming for Haskell", Haskell Workshop 2002'
日期: 2026-05-30
分类: 编程语言
难度: 中级偏上
---

## 是什么

Template Haskell（**TH**）是给 Haskell 加的一套**编译期元编程**工具——你能在编译时拿着"代码本身"当数据来读、改、生成，再把结果塞回源文件继续编译。

日常类比：写一封模板邮件。

- 普通编程：你直接写好整封信。
- TH：你写一份"信生成器"，它在你按发送之前，根据收件人姓名 / 订单号自动拼出 100 封不同的信，编辑器还要替你挑错别字。

TH 给你三件东西，让"代码生成"变成正经的语法：

- `[| e |]`（quotation）：把 e **包成代码值**，类型是 `Q Exp`（`Q` 是编译期计算盒子，`Exp` 是表达式的语法树 AST——像菜谱字条，先折起来不执行）
- `$(e)`（splice / 拼接）：在编译期**跑** e，把它产出的 `Exp` **拼回**源文件，像把字条贴回菜谱当前行
- `Q` monad：在编译期生成新名字、查类型、抛报错的副作用容器

跟 Lisp 宏的区别：TH 的代码值**有类型**，编译期就能查错。

## 为什么重要

不理解 TH，下面这些事都讲不清：

- 为什么 Haskell 的 Lens、persistent ORM、aeson、esqueleto 能"加一行 `$(makeLenses ''Foo)` 自动生成几十行 boilerplate"——背后就是 TH
- 为什么 GHC 文档把 TH 和 [[metaml-multi-stage]] 放一起讲——它就是 MetaML 思想到工业语言的落地
- 为什么 Lean / Idris / Scala 3 后来都搞了 macro / elaboration——设计上借鉴了 TH / MetaML 式 staging
- 为什么"编译慢"成了 Haskell 项目的常见吐槽——大量 TH 让 GHC 必须先跑生成代码再编译

## 核心要点

TH 的全部魔法压成 **三个算符 + 一个 monad + 一条规矩**：

1. **quotation `[| e |]`**：把 e 包起来不算，类型 `Q Exp`——一段会算出某 Haskell 表达式的代码值。类比：把菜谱字条折起来塞兜里。
2. **splice `$(e)`**：编译期跑 e 这个 `Q` 计算，把得到的 `Exp` **接回**源文件继续编译。类比：把折好的字条贴回菜谱当前行。
3. **`Q` monad**：在 `Q` 里你能 `newName` 起不冲突的变量名、`reify`（"反查"：问编译器某个类型长什么样）拿字段表、`qReport` 抛编译错。类比：厨房助理，专门帮你查食材表、起新名字。
4. **stage restriction**：splice 用到的代码必须在**前一阶段**编译完。同一文件先 `f x = ...` 再 `$(f 3)` 不行——`f` 还没编译。这一条是和 Lisp 宏最大的区别。

**cross-stage persistence**（跨阶段保留）：外层普通变量能被 quotation 里引用，但要能 `Lift` 成编译期常量，不会让任意 IO 漏进编译期。

## 实践案例

### 案例 1：编译期生成一段加法

```haskell
{-# LANGUAGE TemplateHaskell #-}
addExpr :: Q Exp
addExpr = [| \x -> x + 1 |]
add1 = $(addExpr)
```

**逐部分解释**：`[| ... |]` 把 lambda 折成代码值；`$(addExpr)` 在编译期展开。最终 `add1` 和手写 `\x -> x + 1` **运行时一样**，只是多走了一次代码生成。

### 案例 2：自动 derive `Show`（示意）

想给 `data User = User { name :: String, age :: Int }` 自定义 `show`，手写要复制粘贴。TH 思路（`deriveShow` 是示意名，真实库用 `deriveJSON` / `makeLenses` 同类 API）：

```haskell
$(deriveShow ''User)
-- 期望生成：
-- instance Show User where
--   show (User n a) = "User { name=" ++ show n ++ ", age=" ++ show a ++ " }"
```

**逐步拆解**：

1. `reify ''User`：问编译器 User 有哪些字段
2. 按字段表拼出 `instance Show ...` 的 `Exp`
3. 外层 `$()` splice 把 AST 贴回源文件继续类型检查

**100 个 record 只写一行**——Lens / aeson / persistent 全建立在这套流程上。

### 案例 3：编译期常量幂（对照 [[metaml-multi-stage]]）

```haskell
{-# LANGUAGE TemplateHaskell #-}
power :: Int -> Q Exp
power 0 = [| 1 |]
power n = [| $(varE (mkName "x")) * $(power (n-1)) |]

cube = $( [| \x -> $(power 3) |] )
-- 编译期展开成 \x -> x * x * x * 1
```

**逐步拆解**：`mkName "x"` 生成将由外层 `\x ->` 绑定的名字；`power 3` 递归拼出 `x*x*x*1`；最外 `$()` 一次 splice。思路对齐 MetaML，`Q Exp` 走 GHC 类型检查。

## 踩过的坑

1. **stage restriction 卡新手**：同一文件 `f x = x*2` 再 `$(f 3)`——GHC 拒绝。把 `f` 拆到另一 module，或写进 quotation。
2. **untyped `Q Exp` 太松**：原版 `Exp` 不带"生成结果是什么类型"，写错要等 splice 后才报。后来 GHC 加了 **Typed TH**（`Q (TExp t)`），splice 前就能查嵌入类型。
3. **cross-stage persistence 出 IO**：quotation 里引用 `IORef` 不会自动序列化，要么写 `Lift` 实例，要么编译期报错。
4. **TH 拖慢编译**：每个 splice 先跑 `Q` 再主编译。大型工程（如 Yesod）TH 占 30%+ 编译时间是常态。

## 适用 vs 不适用场景

**适用**：

- 自动生成 `Show` / `Eq` / `ToJSON` 这类 boilerplate（aeson、persistent）
- Lens / Prism 自动生成（`makeLenses`）；小库偶尔用可接受
- 编译期 SQL / 正则校验（quasi-quote `[sql| ... |]`）
- 给 DSL 写**类型化**前端，避免 Lisp 宏式运行时崩

**不适用**：

- 想在自身文件里立刻调用 helper → stage restriction 拒绝
- 调试性强的代码 → 生成 AST 的出错栈很难看
- 编译时间敏感的 CI / 热路径模块 → 大面积 splice 会拖垮编译
- 想跨编译器移植 → TH 是 GHC 特有

## 历史小故事（可跳过）

- **1990s 末**：Tim Sheard 做 [[metaml-multi-stage]]——把"代码当类型化值"的研究语言。
- **2002 年**：Sheard 联手 Simon Peyton Jones 把 MetaML 思想搬进 Haskell（Haskell Workshop），随后进入 GHC 6.0 主线。
- **2007 年**：Mainland 加 quasi-quote，`[sql|...|]` 这类自定义语法成为可能。
- **之后**：GHC 加入 Typed TH（`Q (TExp t)`），让 splice 前就能检查嵌入类型。
- **今天**：Lean 4、Idris 2、Scala 3 macros 在设计上借鉴了 TH / MetaML 式 staging。

## 学到什么

1. **代码就是数据**——类型化语言也能玩，关键是 AST 类型（`Exp`）+ monad 控制副作用。
2. **stage restriction 是核心妥协**：换来"先编译生成器、再用生成器"，避免 Lisp 宏的运行时类型崩。
3. **类型化 staging 工程化**多一层成本（查类型 / 起新名），但换来敢 derive 几万行 boilerplate 的安全感。
4. **从研究语言到 GHC 主线大约五年**，是函数式社区"理论 → 落地"很快的一次。

## 延伸阅读

- 入门视频：[Template Haskell tutorial](https://www.youtube.com/results?search_query=template+haskell+tutorial)
- GHC 官方 doc：[Template Haskell](https://downloads.haskell.org/~ghc/latest/docs/users_guide/exts/template_haskell.html) / [Typed TH](https://downloads.haskell.org/~ghc/latest/docs/users_guide/exts/typed_th.html)
- Quasi-quote：[Mainland, "Why It's Nice to be Quoted", Haskell 2007](https://www.cs.tufts.edu/comp/150FP/archive/geoff-mainland/quasiquoting.pdf)
- 论文 PDF：[Sheard & Peyton Jones 2002](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/meta-haskell.pdf)
- [[metaml-multi-stage]] —— TH 的直系祖先

## 关联

- [[metaml-multi-stage]] —— MetaML 提供"类型化代码值"；TH 是它在 Haskell 上的落地
- [[partial-evaluation-jones]] —— 偏特化是"自动找 stage"，TH 是"程序员显式写 stage"
- [[hindley-milner]] —— `Q Exp` 走 GHC 类型检查，HM 推导仍是底座
- [[gadt-pjones]] —— Typed TH 的 `Q (TExp t)` 用 GADT 编码生成结果类型
- [[trees-that-grow]] —— GHC 内部 AST 类型族升级，让 TH/插件读 AST 更稳
- [[peyton-jones-stg]] —— TH 生成的代码最终走 STG 跑
- [[scala-macros]] —— 另一条工业语言编译期宏路线，可对照 TH

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lean-tactics]] —— Lean Tactics — 让证明助手把"写证明"当成写程序
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
