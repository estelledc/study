---
title: 代数效应（Algebraic Effects）
来源: 'Plotkin & Pretnar, "Handlers of Algebraic Effects", ESOP 2009'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

代数效应 + handler 是一套**把程序里的副作用（IO、异常、状态、异步、随机）做成可拦截事件**的机制。日常类比：写 try/catch 时只能"接住异常"，但代数效应让你能接住**任何**"非纯操作"——读文件、改全局变量、yield 一个值、抛随机数——然后由调用方决定怎么处理。

你写：

```ocaml
effect Get_state : int
let v = perform Get_state    (* "我要拿全局 state" *)
```

你**没有写 ref、没有写参数传递**。但调用方可以装一个 handler，把 `Get_state` 拦下来，决定把哪个数喂回去。换 handler 就换语义：内存读、文件读、mock 测试值——程序本身一行不动。

这种"程序声明效应、调用方决定如何响应"的能力，是 OCaml 5 / Koka / Unison / Roc 这些新语言的核心抽象。

## 为什么重要

不理解 effect handler，下面这些事都看不清：

- 为什么 **OCaml 5（2022）** 抛弃了 callback / Promise，改用 `effect ... try_with`——它就是 handler
- 为什么 **async/await、try-catch、generator yield** 在 effect 视角下是同一个东西的 4 种特例
- 为什么 **Koka / Unison / Roc** 这些 2020 后的新语言把 handler 当杀手特性
- 为什么 React 团队 2018 提过 "Algebraic Effects for React" RFC——Suspense / `use(promise)` 底层就是这个

函数式编程界从 1990s monad 派吵到 2020s，"如何抽象副作用"的圣杯就是 effect handler。

## 核心要点

代数效应的工作机制可以拆成 **三步**：

1. **声明效应**：`effect Foo : T` 告诉编译器"我会调用一个名叫 Foo 的可拦截操作"。类比：按下电梯按钮——你不知道电梯怎么来，只知道按了之后会回来一个楼层数。

2. **handler 拦截**：`try_with body { Foo -> ... }` 把 body 围起来，body 里每次 `perform Foo` 都被劫持到 handler 子句。类比：你按下按钮的瞬间，整栋楼的"电梯调度系统"接管了请求。

3. **continuation（剩下要做的事）一等公民**：handler 拿到一个 `k`——代表"body 在 perform 之后到 handler 边界为止的尾部"。handler 可以：
   - **不调 k** → 异常（abort）
   - **调 k 一次** → 状态 / IO / generator
   - **调 k 多次** → 不确定性 / 搜索

这三种组合就把 6 种独立的副作用（异常、状态、async、generator、随机、协程）压成了**同一个抽象**。

## 实践案例

### 案例 1：用 effect 写异常（OCaml 5）

```ocaml
effect Raise : string -> 'a

let safe_div a b =
  if b = 0 then perform (Raise "divide by zero")
  else a / b

(* handler：直接 abort，不调 k *)
let result =
  try_with (fun () -> safe_div 10 0) ()
    { effc = fun (type a) (e : a Effect.t) ->
        match e with
        | Raise msg -> Some (fun _k -> Printf.sprintf "caught: %s" msg)
        | _ -> None }
(* result = "caught: divide by zero" *)
```

**关键**：handler 拿到 `_k` 但**不调用**——这就是异常语义。`Raise` 的返回类型是 `'a`（任意类型），因为它从不真的"返回"。

### 案例 2：用 effect 写状态（取 / 设全局）

```ocaml
effect Get : int
effect Put : int -> unit

let counter () =
  let s = perform Get in
  perform (Put (s + 1));
  perform Get  (* 返回 s+1 *)

(* handler：用闭包变量装 state，每次都调 k 一次 *)
let run init body =
  let state = ref init in
  try_with body ()
    { effc = fun (type a) (e : a Effect.t) ->
        match e with
        | Get -> Some (fun k -> continue k !state)
        | Put v -> Some (fun k -> state := v; continue k ())
        | _ -> None }
(* run 10 counter = 11 *)
```

**关键**：`continue k value` 让 body 在 `perform` 处假装"返回了 value"继续跑。这就是"调用方决定语义"——同一段 `counter` 也可以被另一个 handler 解释成"读文件 / 写文件"。

### 案例 3：用 effect 写 generator

```ocaml
effect Yield : int -> unit

let count_to n =
  for i = 1 to n do perform (Yield i) done

(* handler：把每次 yield 的值收集到 list *)
let collect body =
  let acc = ref [] in
  try_with body ()
    { effc = fun (type a) (e : a Effect.t) ->
        match e with
        | Yield v -> Some (fun k -> acc := v :: !acc; continue k ())
        | _ -> None };
  List.rev !acc
(* collect (fun () -> count_to 3) = [1; 2; 3] *)
```

**关键**：`Yield` 看起来像 Python 的 `yield`，但**它本质上和 Get/Put/Raise 是同一种东西**——都是 effect。`for` 循环里你不会觉得"这是一个 generator"，但 handler 视角下它就是。

## 踩过的坑

1. **multi-shot continuation 几乎被生产语言全砍**：论文里 `k` 可以调 0 / 1 / 多次。但 OCaml 5 默认 one-shot，`continue k` 二次调用直接抛 `Continuation_already_resumed`。Koka 也限制。原因：multi-shot + 可变状态语义冲突——两个分支共享同一个 ref，结果完全错。

2. **forwarding 是 O(depth) 的**：handler 不认识的 effect 会"透传"到外层 handler。理论优雅，但每层透传都要 stack walk，嵌套 5 层时单次 perform 比 native call 慢 50×。Koka 用 evidence translation（Leijen 2017）才编译期消除这个开销。

3. **effect type system 几乎没工业语言原样采用**：论文 sec 6 给了 `T_Σ A` 雏形，但 Koka 重做（row polymorphism）、Unison 用 ability set、OCaml 5 干脆不在类型上追踪 effect。论文的"种子作用"很大，但具体类型设计都被后续工作重写。

4. **不是每个副作用都值得做成 effect**：会把代码切得太碎。只有"跨多个抽象层都需要灵活替换"的副作用才值得抽——比如 db / cache / log 在测试时换 mock，这种场景效益最高。

## 适用 vs 不适用场景

**适用**：
- 写新语言想给用户"可定义的副作用抽象"——选 Koka / Unison 路径
- 给现有大语言加 effect 而不破坏兼容（OCaml 4 → 5 路径）
- 测试时需要把 IO / log / random 替换成 mock 的代码
- async + 异常 + 状态混用的场景——handler 顺序就是组合语义

**不适用**：
- Python / JS 里手撸 generator-based "假 effect"——开销大、没有类型保护、try/except + context manager 已经够用
- multi-shot 真用得上的场景——99% 是 one-shot，multi-shot 的 elegance 工程上几乎用不到
- 完全没有 type system 的语言里宣称"我们用了 algebraic effects"——这是 marketing，不是事实
- 简单脚本——effect handler 学习曲线高，简单 try/catch 性价比更高

## 历史小故事（可跳过）

- **2003 年**：Plotkin & Power 在 LICS 发表 *Algebraic Operations and Generic Effects*，给副作用一个数学模型——但只有 effect 没有 handler。
- **2009 年**：Plotkin 和博士生 Pretnar 在 ESOP 发表本文，加上 handler 语法——15 页论文，把 effect 与 handler **分离**为可组合的两个原语。
- **2014 年**：Pretnar 团队做出 Eff 语言（最贴近论文的实现）；同年 Daan Leijen 在微软发布 Koka，用 row polymorphism 解决 effect typing。
- **2018 年**：Multicore OCaml 团队用 effect handler 实现并发原语。
- **2022 年**：OCaml 5 正式发布，effect handler 进入工业语言主线。
- **2024-2026 年**：Roc / Unison 把 effect handler 商业化简化版落地。

从 2003 数学模型到 2022 工业落地，一共 19 年。

## 学到什么

1. **副作用可以抽象**——不必硬编码到关键字（try/catch/yield/async）里，可以做成用户定义的接口
2. **continuation 是一等公民**这个想法早在 1980s 就有（Felleisen），但 PP09 把它"驯服"到 handler 边界内才让它可类型化、可工业化
3. **理论的 elegance 与工业的现实有距离**——multi-shot、effect typing、forwarding 在工业落地时全部被打折，留下的是"分离 effect 与 handler"的核心思想
4. **17 年 = 一篇论文从思想到生产语言主线的距离**——和 HM 从 1969 到 1990s 的节奏接近

## 延伸阅读

- 论文 PDF（15 页，密度极高）：[Plotkin-Pretnar 2009](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf)
- Daan Leijen 演讲：["Algebraic Effects for the Working Programmer"](https://www.microsoft.com/en-us/research/publication/algebraic-effects-for-the-working-programmer/)（Koka 视角的入门）
- OCaml 5 effect handler 教程：[Effect Handlers in OCaml 5](https://v2.ocaml.org/manual/effects.html)（带可跑代码）

## 关联

- [[hindley-milner]] —— HM 给值贴类型；effect handler 给"控制流"贴语义。两者都是把"隐式知识"变成"显式可推理"
- [[lambda-calculus]] —— effect handler 的 `op(v; y. M)` 语法本质是 λ-演算扩展，加了 effect 调用和 handler
- [[mccarthy-lisp]] —— Lisp 的 `call/cc` 是 effect handler 的远祖（unbounded continuation）；handler 把它"驯服"到 delimited 边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[coeffect-petricek]] —— Coeffects — 让类型系统追踪「需要多少上下文」
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[linear-types]] —— 线性类型（Linear Types）
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[push-pull-frp]] —— Push-Pull FRP — Functional Reactive Programming 实用化
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[row-polymorphism-remy]] —— Row Polymorphism — 让函数不必知道 record 的全部字段
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来

