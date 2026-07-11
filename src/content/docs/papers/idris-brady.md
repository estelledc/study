---
title: Idris — 让依赖类型从证明助理变成通用编程语言
来源: 'Edwin Brady, "Idris, a General-Purpose Dependently Typed Programming Language: Design and Implementation", JFP 2013'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Idris 是一门**让类型可以"携带具体值"的通用编程语言**。日常类比：普通类型系统说"这是一个数组"，依赖类型系统说"这是一个长度恰好为 5 的数组"。长度不再写在注释里、不再靠运行时 assert，而是直接写进类型，编译器替你把关。

```idris
-- 普通函数
double : Int -> Int
double x = x + x

-- 依赖类型函数：返回的 Vect 长度由参数 n 决定
replicate : (n : Nat) -> a -> Vect n a
```

`Vect n a` 这个类型里 `n` 是一个**值**（自然数）。编译器在类型检查时会真的去看 `n` 是几，从而拒绝"长度对不上"的拼接。

Brady 这篇 2013 JFP 论文不是发明依赖类型——那是 Martin-Löf 1971 干的——而是回答：**怎么把依赖类型做成一门能写编译器、能写 HTTP 服务器、能 FFI 调 C 库的实用语言**。

## 为什么重要

- **打破"依赖类型 = 只能写证明"的偏见**：在 Idris 出现前，Agda / Coq 都被当成定理证明器，写不了"普通程序"。Idris 证明了它能
- **把 Type-Driven Development 这个工程实践搬上台面**：先写类型再让编译器引导你填实现，影响了 Haskell typed-holes、TypeScript narrowing
- **给 verified system 一条务实路径**：CakeML、smart contract、cryptographic protocol 都在用类似思路
- 不读这篇就理解不了"为什么 Rust 的类型系统总被说'没那么强但够用'"——参照系就是 Idris 这种"能更强但实用代价更大"的设计

## 核心要点

Brady 的设计可以拆成 **四层**：

1. **小核心 TT (Type Theory)**：表面 Idris 语法（records、do-notation、type class 等）经过 elaboration 翻译成一个极小的类型论核心。类比：所有花哨语法糖最后烘成同一种"原料"。这让可信编译变得可能——只有 TT 这小块需要被仔细审。

2. **Elaboration（精化）**：把高层语法翻译成 TT 的过程。这一步还顺便填洞——你写 `?hole` 占位，编译器结合上下文类型尝试搜索能填的项。

3. **Totality 检查（可选）**：开了它，函数必须**对所有输入终止**。类型才能被当成数学命题（"我的程序就是证明"）。关掉它就回到普通编程。

4. **实用工程**：strict-by-default（不是 Haskell 那种 lazy）、IO monad、FFI、erasure（编译期的类型证据运行时擦掉，避免拖速度）、自由后端（C / JS / JVM）。

## 实践案例

### 案例 1：长度安全的列表拼接

```idris
append : Vect n a -> Vect m a -> Vect (n + m) a
append []        ys = ys
append (x :: xs) ys = x :: append xs ys
```

返回类型 `Vect (n + m) a` **强制**结果长度等于两个输入之和。如果你不小心漏写了 `x ::`，编译器立刻拒绝——它能算出长度对不上。这种 bug 在 Java/Python 里只有运行时才暴露。

### 案例 2：Type-Driven Development（先写类型再填洞）

```idris
-- 第 1 步：只写类型签名 + 留洞
zip : Vect n a -> Vect n b -> Vect n (a, b)
zip xs ys = ?todo
```

编辑器（Emacs/VSCode 插件）会显示：

```
todo : Vect n (a, b)
xs : Vect n a
ys : Vect n b
```

你看着可用变量和目标类型，逐步填。模式匹配 `xs` 时编译器会**自动展开两个分支**——`[]` 和 `x :: xs'`——你只需填每个分支的右边。整个写代码体验像跟编译器对话。

### 案例 3：DSL 在编译期保证合法

写一个 SQL DSL，能把"SELECT 不存在的列"变成编译错误。思路：

- 每个表的 schema 用类型表示（包含列名 + 列类型的列表）
- 查询表达式的类型依赖于这个 schema
- `select c from t` 时，类型检查器会去 schema 里查 `c`，找不到就拒绝编译

```idris
-- 概念示意（简化版）
data Schema = Cols (List (String, Type))

select : (col : String) -> Query (Cols cs) -> {auto p : Has col cs} -> ...
```

`Has col cs` 是一个证据类型——必须证明 `col` 在 `cs` 里才能调用。这是 dependent type 的杀手应用，传统类型系统做不到。

## 踩过的坑

1. **类型推不动**：HM 那套"全自动推"在 dependent type 下不可判定。复杂处必须**手写类型注解或显式参数**。新人看 Idris 代码会觉得"为什么到处都有 `{n=5}` 这种东西"。

2. **Totality 是双刃剑**：开了它，写 web server 的事件循环就难了（无限循环本质上不 totality）。Idris 让你**按函数选**——critical 部分开，IO 部分关。

3. **编译速度感人**：elaboration 跑得慢、type checking 要展开很多项。Idris 1 改一行可能等几秒。Idris 2 重写解决了大部分。

4. **生态薄**：标准库、第三方包、IDE、错误信息都不如 Haskell。学的是范式，不是日常生产工具。

5. **错误信息读不懂**：依赖类型 unification 失败时，错误信息可能是"`Vect (S (S Z)) a` 不能与 `Vect (plus 1 (S Z)) a` 统一"——你得自己心算 `1 + 1 = 2`。

## 适用 vs 不适用场景

**适用**：

- 教学：让学生第一次看到"类型携带值的信息"
- 安全攸关的小核心：加密协议、智能合约的 state machine
- DSL 嵌入：让 DSL 的合法性在编译期被保证
- 实验性 verified system：CakeML 风格的从源到机器码全程可证

**不适用**：

- 大型工业系统（编译速度、生态、库覆盖都不够）
- 快速试错的 prototype（每改一行可能等几秒）
- 团队混合背景（不是所有同事都懂 dependent type，招人贵）
- 性能敏感的热点路径（虽然 erasure 做了优化，但整体还是不如手写 Rust）

## 历史小故事（可跳过）

- **1971 年**：Per Martin-Löf 在斯德哥尔摩提出**直觉主义类型论**（ITT），让"证明"和"程序"用同一种语言写。但这是给数学家的工具
- **1989 年**：Coq 在法国 INRIA 启动，定位"机器辅助定理证明"
- **2007 年**：Ulf Norell 博士论文造了 Agda 2，把 ITT 工程化为"也能写程序"，但生态仍偏证明
- **2010 年**：Edwin Brady 在 St Andrews 启动 Idris 项目，目标明确写在名字里："general-purpose"
- **2013 年**：本篇 JFP 论文出版，定型 Idris 1 的设计与实现
- **2020 年**：Idris 2 用 quantitative type theory 重写，解决性能问题

## 学到什么

1. **类型可以携带值**——这是过去 50 年程序设计语言最深的一次升级，让"长度对不上"从运行时 bug 变成编译期错误
2. **小核心 + elaboration**是把复杂语言做成可信编译器的标准套路：表层随便长，烘到一小块原料上验证
3. **Type-Driven Development**是依赖类型送给所有人的礼物——即使你不写 Idris，"先写类型签名、再让编译器引导填洞"在 TypeScript / Haskell 里也成立
4. **理论 → 工具 → 工程**这一段路不是免费的：从 Martin-Löf 1971 到 Idris 2013 隔了 42 年

## 延伸阅读

- 教科书：[Type-Driven Development with Idris](https://www.manning.com/books/type-driven-development-with-idris)（Brady 本人写的，从零开始）
- 论文 PDF：[Brady 2013 JFP draft](https://eb.host.cs.st-andrews.ac.uk/drafts/impldtp.pdf)
- 视频：[Edwin Brady — Type-Driven Development](https://www.youtube.com/results?search_query=edwin+brady+type-driven)
- [[martin-lof-itt]] —— Idris 的数学源头
- [[agda-norell]] —— Idris 最近的亲戚，定位偏证明

## 关联

- [[martin-lof-itt]] —— 提供"类型 = 命题"的数学基础
- [[agda-norell]] —— 同源不同定位：Agda 偏证明、Idris 偏通用编程
- [[calculus-of-constructions]] —— Coq 的核心，另一条 dependent type 工程化路线
- [[hindley-milner]] —— Idris 在 dependent type 推不动时退回的"基础推导能力"
- [[gadt-pjones]] —— 弱化版的"类型携带值"：GADT 在 Haskell 里逼近 Idris 的少数能力
- [[cakeml]] —— verified compiler 的姊妹项目，思路相似

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
