---
title: Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
来源: 'John C. Reynolds, "Definitional Interpreters for Higher-Order Programming Languages", ACM National Conf. 1972 / HOSC 1998'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Reynolds 1972 这篇论文给出一个**朴素却根本**的语言定义方法：要解释一门语言（叫 defined language），不写编译器、不画状态机，**直接用另一门语言（defining language）写一个解释器**就行。日常类比：教别人下围棋，你不发规则手册，而是亲自下一局给他看。

你写一个小型解释器：

```ocaml
let rec eval expr env = match expr with
  | Var x -> List.assoc x env
  | Lam (x, body) -> Closure (x, body, env)
  | App (f, a) -> apply (eval f env) (eval a env)
```

这就是 defined language 的"定义"——它的含义就是这段代码跑出来的样子。Reynolds 的真正贡献不在写第一个，而在**把"同一门语言的不同风格解释器"放在同一框架里互推**：高阶 vs 一阶、依赖宿主求值顺序 vs 不依赖。

论文的副产品同样重要：**defunctionalization** 与 **CPS 变换**，这两个名词后来成了编译器和语义学的通用工具。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 Scheme 1975 的解释器设计会引用这篇论文——Sussman / Steele 借了 Reynolds 的 continuation 思路
- 为什么"闭包"既能是函数也能是数据记录——defunctionalization 就是把前者机械变成后者
- 为什么编译器课里突然冒出 CPS 变换——它是 Reynolds 用来消除"求值顺序依赖"的工具
- 为什么 SECD 抽象机和元循环解释器看起来天差地别，其实是同一份起点的两个变换终点
- 为什么 algebraic effects、async/await、generator 都"长得像 continuation"——它们的祖宗就是这里

## 核心要点

Reynolds 的推演路径可以拆成 **三步**：

1. **元循环解释器**（meta-circular）：用 defining language 自己的 lambda 直接表示 defined language 的 lambda——像让镜子照镜子。简单，但解释器行为受宿主语言"按值/按名"影响，换个宿主就变意思。

2. **defunctionalization（去高阶化）**：把每处 lambda 替换成"标签 + 携带数据的记录"，再写一个一阶 `apply` 函数 pattern match 这些标签。类比：本来是黑盒函数，现在拆成"这是哪种函数 + 它需要的环境"两块明牌。

3. **CPS 变换 + 再 defunctionalize**：给每个"可能不终止"（serious）的函数加一个 `continuation` 参数——把"接下来要做什么"也变成显式的值。再把 continuation 也 defunctionalize，得到一个纯一阶的栈式机器，已经非常像 SECD。

四种解释器（高阶/一阶 × 求值顺序敏感/不敏感）由这条链机械式互推。论文里的 2×2 表格把当时主流定义都对上号：McCarthy LISP 落在"一阶 + 顺序敏感"格，Landin SECD 落在"一阶 + 顺序无关"格。

## 实践案例

### 案例 1：元循环解释器（最朴素版）

```ocaml
type expr = Var of string | Lam of string * expr | App of expr * expr
type value = VFun of (value -> value)

let rec eval e env = match e with
  | Var x -> List.assoc x env
  | Lam (x, body) -> VFun (fun v -> eval body ((x, v) :: env))
  | App (f, a) -> let VFun g = eval f env in g (eval a env)
```

**逐部分解释**：`VFun` 是教学简化——论文用 defining language 的 lambda 直接表示函数值，这里用 OCaml 闭包等价演示。`Lam` 直接用 `fun v -> ...` 表达。简洁，但"OCaml 是按值"会传染给 defined language——这就是"求值顺序依赖"。同一份代码搬到 Haskell（按需）语义会变，定义就不闭合。

### 案例 2：defunctionalize 后的一阶版

```ocaml
type value = Closure of { param: string; body: expr; env: (string * value) list }
let rec eval e env = match e with
  | Var x -> List.assoc x env
  | Lam (x, body) -> Closure { param = x; body; env }
  | App (f, a) -> apply (eval f env) (eval a env)
and apply (Closure c) v = eval c.body ((c.param, v) :: c.env)
```

**逐部分解释**：闭包不再是函数而是记录，`apply` 是显式一阶函数。这一步把"函数值"从黑盒变明牌——后来所有抽象机（SECD / CEK / CESK）都靠这套思路。要序列化一个闭包发到别的进程？案例 1 不可能，案例 2 直接 `Marshal` 就行。

### 案例 3：CPS 化（控制流变成值）

```ocaml
let rec eval e env k = match e with
  | Var x -> k (List.assoc x env)
  | Lam (x, body) -> k (Closure { param = x; body; env })
  | App (f, a) ->
      eval f env (fun vf ->
        eval a env (fun va ->
          apply vf va k))
and apply (Closure c) v k =
  eval c.body ((c.param, v) :: c.env) k

let run e = eval e [] (fun v -> v)
```

**逐部分解释**：每个 `eval` 多一个 `k`（continuation，"接下来怎么用结果"）。`App` 的口头顺序是三步：① 先求 `f` 得到 `vf`；② 再求 `a` 得到 `va`；③ 再 `apply vf va k`。主程序传 `fun v -> v` 作初始 continuation。求值顺序由 `k` 嵌套决定，不再借宿主语言。再把 `k` 也 defunctionalize，就得到一台栈式抽象机，几乎就是 SECD。

## 踩过的坑

1. **以为元循环解释器就是"语言定义"**——它继承宿主语言的求值策略，换 defining language（如把 OCaml 换 Haskell）解释器行为就会变；想严格定义必须 CPS 化或写小步语义
2. **defunctionalize 时漏掉某个 lambda 没建对应记录类型**——一阶 dispatch 函数缺分支，运行时 pattern match 失败崩溃；论文里每条变换都列出"全部 lambda 表达式位置"对照避免漏
3. **CPS 把 trivial 函数（一定终止的）也加 continuation**——结果对但代码爆炸；只对 serious 函数（可能不终止）加才是 Reynolds 推荐做法，论文专门定义 serious / trivial 分类
4. **简单 CPS 解释器加副作用 / 赋值就破功**——必须把 store 也作为参数显式传递（即 store-passing style），论文末节讨论 jump 和 assignment 时专门处理这点；漏掉 store 的话状态变量会"穿越"continuation 边界，调试极难

## 适用 vs 不适用场景

**适用**：

- 给一门小语言写参考实现 / 教学解释器（DSL 设计、课堂演示）
- 把高阶解释器机械式变换成抽象机（编译器课的标准路线图）
- 解释"控制流是什么"——CPS 把它显式化最直观，比抽象状态图易讲
- 抽象解释、类型系统、效应系统的底座（Abstracting Definitional Interpreters 2017 直接复用本论文链路）

**不适用**：

- 追求高性能的工业解释器——Reynolds 自己就说定义性解释器"clarity by sacrificing efficiency"，要快得用 JIT / partial evaluation
- 需要并发 / 实时 / IO 模型的语言——这框架默认顺序求值，要显式扩展（加 schedule / future / Promise 等）
- 想用纯逻辑公理化定义语言——那是 Hoare / Floyd 路线，参 [[algol-60]] 时代的 axiomatic semantics，与 Reynolds 这条解释式路线方向相反

## 历史小故事（可跳过）

- **1960-1970**：McCarthy LISP、Landin SECD、Vienna PL/I 各写各的解释器，风格五花八门，互相比较困难
- **1972 年**：Reynolds 在 Syracuse 大学，把这些都放进"高阶/一阶 × 求值顺序敏感/不敏感"的 2×2 表格，并展示由变换互推；论文发表在 ACM National Conference
- **1975 年**：Sussman 和 Steele 在 MIT 写出 Scheme（AI Memo 349），正文引用 Reynolds，并用 continuation / `CATCH` 处理控制流——CPS 思想直接借用
- **1978 年**：Steele 硕士论文 Rabbit 编译器用 CPS 中间表示编译，奠定后来 Appel 1991 *Compiling with Continuations* 整本书
- **1991 年**：Appel 出版 *Compiling with Continuations*，把 CPS 中间表示作为编译器主流路线，算 Reynolds 思路的工业落地版
- **1998 年**：HOSC 期刊邀请重印这篇 1972 旧文，因为它的影响力一直在扩散，至此正式成"经典必读"
- **2000 年代**：Danvy 等人系统化 "functional correspondence"——抽象机和解释器互推，Reynolds 这条链被推广到任意小语言
- **2010 年代起**：algebraic effects、Koka、Eff 等语言把 continuation 进一步玩成"用户可定向捕获"的资源，本论文是其语义起源
- **2017 年**：Darais & Van Horn *Abstracting Definitional Interpreters* 把这框架扩到抽象解释，论文标题直接致敬 Reynolds

## 学到什么

1. **"用语言定义语言"是个工程方法，不是哲学循环**——只要 defining language 比 defined language 简单或更受信任，就够了；不必一路追溯到机器码
2. **defunctionalization 是一座桥**——它把"高阶函数"变成"带标签的数据 + dispatch 函数"，让函数式和数据式两种世界观能互译，序列化、调试、可视化全靠它
3. **continuation 是把控制流当数据**——它不是炫技，是消除"我借了宿主语言的求值顺序"这个隐藏依赖；后来 algebraic effects、generators、async/await 都从这里衍生
4. **同一门语言的多种解释器风格互通**——元循环、SECD、CPS-based 看着不同，本质是 Reynolds 这条变换链上的不同站点，互推靠机械式规则不靠灵感

## 延伸阅读

- 论文 PDF：[Reynolds 1972 / 1998 重印](https://homepages.inf.ed.ac.uk/wadler/papers/papers-we-love/reynolds-definitional-interpreters-1998.pdf)（35 页，例子比理论多）
- 视频讲解：[Papers We Love — Reynolds Definitional Interpreters](https://www.youtube.com/results?search_query=papers+we+love+reynolds+definitional+interpreters)（社区讲读，很零基础友好）
- 后续工作：Danvy & Nielsen 2001 *Defunctionalization at Work*（专门把 defunctionalization 讲透，配 OCaml/SML 例子）
- 工业落地：Appel 1991 *Compiling with Continuations*（把 CPS 当编译中间表示的 SML/NJ 路线）
- 现代复用：Darais et al. 2017 *Abstracting Definitional Interpreters*（把抽象解释直接建在这篇论文上，POPL 2017）
- [[mccarthy-lisp]] —— 第一个元循环解释器的来源
- [[lambda-calculus]] —— Reynolds 用作 defining / defined 语言的共同核

## 关联

- [[lambda-calculus]] —— defined / defining language 都基于它
- [[mccarthy-lisp]] —— 论文里的"二号解释器"风格直接对应 LISP eval/apply
- [[system-f-reynolds-1974]] —— 同一作者两年后的另一里程碑，把多态作参数
- [[hindley-milner]] —— 给 defined language 加类型推导的标准方案
- [[standard-ml]] —— ML 的早期定义工作受 SECD/CPS 路线影响
- [[effect-handlers]] —— continuation 显式化的现代后裔，algebraic effects 让 continuation 可定向捕获
- [[algol-60]] —— Reynolds 框架对比的 first-order 定义路线就是 ALGOL 时代的 axiomatic semantics
- [[wadler-prettier]] —— 同样把"过程式打印逻辑"defunctionalize 成数据，是这套思路的工程小样

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
