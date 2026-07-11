---
title: Standard ML — 让编译器替你把类型补完
来源: Milner, Tofte, Harper, "The Definition of Standard ML", MIT Press 1990
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Standard ML（**SML**）是从 1973 年爱丁堡 ML 演化、1990 年正式定稿的一门小语言。日常类比：像一个**会把你的草稿改完整再交给你的助手**——你写"小明吃了苹果"，助手默默把"小明是人、苹果是水果、动作是吃"这些隐含信息全部补完，再交回给你。

你写：

```sml
fun add x y = x + y
```

你**没标任何类型**。SML 编译器读完，自动得出 `add : int -> int -> int`，一切由它替你想。

它是历史上**较早把"类型自动推导 + 完整数学定义"两件事同时做对的工业语言**。OCaml / Haskell / F# / Rust / Swift 的核心特性都从这里借走。

## 为什么重要

不理解 SML，下面这些事都没法解释：

- 为什么 OCaml / Haskell 写得像 Python，但运行时**不会突然 `undefined is not a function`**——1990 年《Definition》第一次给整门工业语言写完整形式语义（用数学规则写清"程序怎么跑、类型怎么查"）
- 为什么 Rust 的 `enum` + `match` 看着像新东西——1973 年的 ML 就有了，叫 `datatype` + pattern matching
- 为什么 TypeScript 还在追"类型推导友好度"——Milner 1978 / [[hindley-milner]] 就解决了大部分问题
- 为什么 Swift / Rust 的 `Option<T>` / `Result<T, E>` 长得像孪生兄弟——它们都是 ML 代数数据类型的翻版

## 核心要点

SML 的三大支柱：

1. **类型推导**：你不写类型，编译器自己推。背后是 [[hindley-milner]] 算法。类比：助手看你写"3 + 1"，自动知道 `3` 是数字，不用你标"我这里写的是数字"。

2. **代数数据类型 + pattern matching**：用 `datatype` 一行声明一种数据可能的所有形态，用 `|` 多分支匹配。类比：超市分类——"蔬菜"下面只有"叶菜 / 根菜 / 瓜类"三种，结账时收银员**必须**对三种都报价，漏一种系统不让走。

3. **模块系统（functor）**：模块本身是一种"函数"——给我一个能比较的类型，我给你一个该类型的集合实现。类比：橱柜厂的流水线——你扔木材进去，机器吐成品出来，木材规格不同，吐出的橱柜规格也不同。

三者合在一起，就让"短代码 + 强保证"成为可能。

## 实践案例

### 案例 1：列表长度（SML/NJ 或 Poly/ML REPL 可直接粘贴）

```sml
fun length [] = 0
  | length (_ :: xs) = 1 + length xs
```

**逐部分解释**：

- `fun` 是定义函数的关键字（function 缩写）
- `[]` 是空列表 pattern——匹配"空"这种情况
- `_ :: xs` 是 cons pattern——`::` 读作 "cons"（把"头元素"和"尾列表"拼起来，像火车头挂车厢）；`_` 表示"我不关心这个值"
- 两条 `|` 分支：空返回 0，非空则 `1 + 尾列表长度`；**没有 if-else**
- **没有标类型**——推出 `length : 'a list -> int`（`'a` 是"任意类型"占位，这叫多态：一份代码服务所有元素类型）

### 案例 2：二叉树（同上，REPL 可跑）

```sml
datatype 'a tree = Leaf
                 | Node of 'a * 'a tree * 'a tree

fun depth Leaf = 0
  | depth (Node (_, l, r)) = 1 + Int.max (depth l, depth r)
```

**逐部分解释**：

- `'a` 是类型变量——这棵树可以装任意类型的值
- `Leaf` / `Node of ...` 是两种构造子；`depth` 对两种形态分别处理，漏 case 编译器警告
- 这种 ADT + match，后来被 OCaml / Haskell 普及；主流系统语言（如 Rust `enum`）较晚才广泛采用

### 案例 3：最小 functor——模块当函数用

```sml
signature ORDERED = sig
  type t
  val compare : t * t -> order
end

functor MakeSet (E : ORDERED) = struct
  type elem = E.t
  type set = elem list
  val empty : set = []
  fun insert (x, []) = [x]
    | insert (x, y::ys) =
        case E.compare (x, y) of
            LESS => x::y::ys
          | EQUAL => y::ys
          | GREATER => y::insert (x, ys)
end
```

**逐部分解释**：

- `signature ORDERED`：接口——"能比较的类型"要有 `t` 和 `compare`
- `functor MakeSet (E : ORDERED)`：模块函数——输入满足 ORDERED 的结构 `E`
- `struct ... end`：函数体，用 `E.compare` 实现有序列表集合
- 读作：**给我能比较的 E，我吐出 E 的集合**；OCaml functor 同源

## 踩过的坑

1. **`fun` 不等于 `val`**：`fun f x = x + 1` 与 `val f = fn x => x + 1` 都能定义函数，但多分支 pattern matching 只能用 `fun`。
2. **`=` 一词两义**：`fun f x = ...` 里是"定义"，`if x = 1 then ...` 里是"判等"。
3. **value restriction**：`val r = ref []` 拒绝多态（防"先存 int 再当 string 取"），详见 [[hindley-milner]]。
4. **错误信息难读**：HM 可能在第 17 行报 int/string 冲突，根因却在第 5 行写错变量名。

## 适用 vs 不适用场景

**适用**：
- 定理证明器 / 编译器工具链：Isabelle 用 SML；Coq 实现是 OCaml（ML 系）；CompCert 用 Coq 写，再经 OCaml 工具链抽出
- AST 重度处理——pattern matching + ADT 比 visitor 短很多
- 教学"类型推导 / 代数数据类型"——SML 例子最干净
- 想看"完整形式定义的工业语言"长什么样

**不适用**：
- 大生态——用户极少，无 crates.io 级统一包管理；标准库分裂在 SML/NJ vs MLton vs Moscow ML
- 系统级编程——无 lifetime / ownership（去用 [[rust]]）
- Web / 移动端——无主流编译目标
- 需要类型类 / trait——SML 不支持（去用 Haskell / Rust）

## 历史小故事（可跳过）

- **1973**：Robin Milner 在爱丁堡做 LCF，设计 ML（Meta Language）写证明策略——要类型安全、高阶函数、多态
- **1978**：Milner 证明 [[hindley-milner]] 类型推导可判定（约 28 页论文）
- **1983–1990**：标准化推进；Milner + Tofte + Harper 出版《The Definition of Standard ML》——用推理规则写清静态/动态语义与模块；少有工业语言把整门语言写成这种可执行形式定义
- **之后**：Haskell（1990）/ OCaml（1996）/ F#（2005）借走核心能力并赢市场——SML 技术正确、产品失败的经典案例

## 学到什么

1. **"短代码 + 强保证"可兼得**——HM + ADT + pattern matching 是近 50 年最重要的语言组合之一
2. **形式语义不是奢侈品**——完整定义让 type safety 能被证明，而不只靠测试碰运气
3. **技术正确 ≠ 产品成功**——缺统一仓库、缺 BDFL、缺商业赞助，结果被后来者借走赢市场
4. **借鉴常比原创更容易胜出**——后来者只挑有用部分、扔掉学术包袱

## 延伸阅读

- 入门：[Programming in Standard ML by Robert Harper](https://www.cs.cmu.edu/~rwh/isml/book.pdf)（CMU 免费 PDF）
- 在线 REPL：[SML Family](https://smlfamily.github.io/)
- 现代 ML：[Real World OCaml](https://dev.realworldocaml.org/)
- [[hindley-milner]] —— 类型推导引擎
- [[lambda-calculus]] —— SML core 的数学根
- [[mccarthy-lisp]] —— first-class function / cons 的来源

## 关联

- [[hindley-milner]] —— SML 第一个工业实现 HM 推导
- [[lambda-calculus]] —— SML core 是 typed lambda calculus 的工业版
- [[mccarthy-lisp]] —— first-class function 思想的来源
- [[algol-60]] —— 静态作用域 + 块结构的来源
- [[smalltalk]] —— 同期对照：Smalltalk 走 OO，SML 走代数数据类型
- [[rust]] —— ADT + pattern matching 的现代继承者
- [[llvm]] —— 同样致力于"少手写、多自动推"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[doligez-leroy-concurrent-gc]] —— Doligez-Leroy Concurrent GC — ML 线程运行时里的准实时垃圾回收
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[papers/nix]] —— Nix — 把每个软件包当成纯函数的输出
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[row-polymorphism-remy]] —— Row Polymorphism — 让函数不必知道 record 的全部字段
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器
