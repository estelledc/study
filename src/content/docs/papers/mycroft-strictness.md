---
title: Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
来源: 'Alan Mycroft, "The Theory and Practice of Transforming Call-by-need into Call-by-value", 4th International Symposium on Programming, LNCS 83, Springer 1980'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

**Strictness analysis（严格性分析）** 是让编译器静态判定：一个 lazy 函数式程序里，哪些函数参数 **反正一定会用到**，所以可以从"用到时才算"提前到"传进来就算"。日常类比：饭店点单，懒模式是"先记下你点的菜，等你真说要吃了才下锅"，但如果服务员发现你那道菜每桌都吃完，他就敢提前下锅省时间。

写 Haskell：

```haskell
double x = x + x
```

Lazy 求值会先建一个 thunk（"未来要算 x 的盒子"），用到 `x + x` 时才拆。但 `x` 显然要用两次，**100% 会被算**。Mycroft 的分析告诉编译器："`double` 在 `x` 上 strict，直接当 call-by-value 编译。"

这是 Haskell `-O2` 跑得不那么慢的核心理论起点；现代 GHC 的 demand analyzer / worker-wrapper 全是这条线的徒孙。

## 为什么重要

不理解这个分析，下面这些事都没法解释：

- 为什么 Haskell 名义上"全 lazy"但实测内存能爆（thunk 堆积），而 GHC `-O2` 不爆——因为编译器替你把不必要的 thunk 砍了
- 为什么 Haskell 写循环加 `seq` / `!` 能突然快 10 倍——你在手工补编译器没分析出的 strict
- 为什么 1980 年的一篇会议论文今天还在 GHC 源码里被引用
- 为什么"abstract interpretation"（抽象解释）这套框架几乎所有静态分析工具都在用——它在这里第一次落到函数式语言

## 核心要点

整套方法可以拆成 **三步**：

1. **抽象到两点格**：每个值只看"能不能算出来"。算得出来标 `⊤`（top），算不出来（死循环 / 错误）标 `⊥`（bottom）。类比：天气预报只报"晴 / 雨"，不管几度。

2. **重定义每个原语在格上的语义**：`+` 在抽象世界里变成 "两边都 ⊤ 才返回 ⊤，任一边 ⊥ 就返回 ⊥"。`if c then a else b` 变成 "c 是 ⊥ 就 ⊥，否则 a 和 b 取 join"。

3. **解最小不动点**：递归函数的抽象版从全 ⊥ 起步，反复代入直到稳定。最后看 `f#(⊥, ⊤, ...)` 的结果——若第 1 个参数填 ⊥ 就让整体 ⊥，那 `f` 在第 1 个参数 strict。

这套就是 **abstract interpretation**（Cousot 1977）在函数式上的第一次工业落地。

## 实践案例

### 案例 1：阶乘函数被判定 strict

```haskell
fact n = if n == 0 then 1 else n * fact (n - 1)
```

抽象解释跑一遍：

- 假设 `n = ⊥`（不知道值）
- `n == 0` 也是 `⊥`（因为参与运算的一边是 ⊥）
- `if ⊥ then ... else ...` → `⊥`（条件本身没算出来，整个 if 也算不出来）
- 所以 `fact#(⊥) = ⊥` —— `fact` 在 `n` 上 strict

**结论**：编译器把 `n` 直接当整数传，不用包 thunk。GHC 实际产物里这种参数会进 unboxed `Int#`（裸机器整数），少一次堆分配。

### 案例 2：if 的"惰性参数"——非 strict 的反面

```haskell
myIf c t e = if c then t else e
```

抽象解释：

- `c = ⊥` → 整体 `⊥`（c 决定走哪边都决定不了）
- `t = ⊥`，但 `c = ⊤` 走 `else` 分支，结果是 `e` 的值，可能不 `⊥`
- 所以 `myIf` 在 `t` 上 **不** strict（同理 `e`）

**结论**：`t` 和 `e` 必须保持 lazy（不能提前算）。这跟我们直觉一致：`if False then undefined else 0` 应该返回 0，不能因为先算 `undefined` 就崩。

### 案例 3：GHC 的 worker/wrapper 变换

GHC 拿到 strictness 分析结果后做的真实优化：

```haskell
-- 源代码（用户写的）
sum :: [Int] -> Int
sum []     = 0
sum (x:xs) = x + sum xs

-- 优化后 GHC 内部拆成两层
sum_wrapper :: [Int] -> Int        -- 外壳：接 boxed Int
sum_wrapper xs = case sum_worker xs of r# -> I# r#

sum_worker  :: [Int] -> Int#       -- 内核：直接返回 unboxed Int#
sum_worker [] = 0#
sum_worker (x:xs) = case x of I# x# ->
                    case sum_worker xs of r# -> x# +# r#
```

`sum` 在结果 strict（必须返回数）→ wrap/worker 拆开 → 内核全程用裸整数。这是 Haskell 数值代码能接近 C 性能的关键招数，全靠 strictness 信息。

## 踩过的坑

1. **保守近似**：分析说"不 strict"不代表真的不 strict——可能只是两点格太粗看不出。少一些优化机会，但绝不会改坏程序（never lie）。

2. **高阶函数搞不定**：原版只处理一阶函数。`map f xs` 里的 `f` 本身是函数，需要 Burn-Hankin-Abramsky 1986 扩到高阶 strictness 才能分析；GHC 实际用更新版本。

3. **数据结构粒度太粗**：list / tuple 在两点格里只能整体抽象，分不清"head strict 但 tail lazy"。要 4-point lattice（Wadler 1987 projections）才看得清。

4. **改 lazy 为 eager 会更早发散**：原本"用不到坏值"的程序，改 strict 后可能直接崩。所以分析必须保证"strict 的参数后面真的会被用到"，否则违反程序员预期——这就是为什么算法是单向保守的。

## 适用 vs 不适用场景

**适用**：

- Lazy 函数式语言的编译优化（Haskell GHC / 早期 Miranda / 现代 PureScript 部分场景）
- 静态分析框架的教学示例（abstract interpretation 入门首选）
- 任何"能不能省一步惰性"的判定问题（Adapton 类增量计算也借鉴）

**不适用**：

- Strict 默认的语言（OCaml / Standard ML）——所有参数本来就 eager，没有省的空间
- 动态语言（Python / JS）——没有静态类型骨架供分析
- 需要精确"哪一部分 strict"的复杂数据结构 → 升级 [[wadler-prettier]] 同作者的 projection-based 分析或更新的 demand analysis

## 历史小故事（可跳过）

- **1977 年**：Cousot 夫妇提出 abstract interpretation 框架。当时只是给命令式程序做静态分析的理论。
- **1978 年**：Robin Milner 在爱丁堡发明 ML 语言；他的博士生开始研究 lazy 函数式的优化。
- **1980 年 4 月**：Alan Mycroft 在巴黎第 4 届 Programming Symposium 发表本文，把 Cousot 框架第一次落到 lazy 函数式上。
- **1981 年**：Mycroft 把这套写进爱丁堡博士论文 "Abstract Interpretation and Optimising Transformations for Applicative Programs"，导师 Robin Milner。
- **1986-1990 年**：Burn-Hankin-Abramsky 扩到高阶；Wadler 用 projections 细化数据结构；GHC 把整条线落地为 demand analyzer。Mycroft 后来回剑桥任教，至今还在 PL 领域。

## 学到什么

1. **lazy 不是免费的**——thunk 有真实成本，编译器要替程序员把"反正会算"的部分提早，才能让懒模式跑得动
2. **抽象解释 = 在更小的世界里跑同一段代码**：把 ⊥/⊤ 当值跑函数，看结果，是几乎所有静态分析的通用招式
3. **保守近似才安全**：永远只往"少优化"那侧错，绝不改坏语义；这条原则现在成了所有编译优化的默认底线
4. **理论 → 算法 → 编译器**隔了 10 年。1977 → 1980 → 1990s GHC，跟 [[hindley-milner]] 节奏一致

## 延伸阅读

- 视频教程：[Simon Peyton Jones — Adventures with Types in Haskell（2 集）](https://www.youtube.com/watch?v=re96UgMk6GQ)（GHC 内部如何用 strictness 信息）
- 论文 PDF（Mycroft 1980）：[Theory and Practice of Transforming Call-by-need into Call-by-value](https://www.cl.cam.ac.uk/~am21/papers/strictness1980.pdf)（密度高，先读案例 1）
- 后续扩展：[Wadler 1987 — Strictness analysis aids time analysis](https://homepages.inf.ed.ac.uk/wadler/papers/strictness-aids-time/strictness-aids-time.pdf)
- GHC Wiki：[Demand Analyser](https://gitlab.haskell.org/ghc/ghc/-/wikis/commentary/compiler/demand)（工业版，比原论文复杂得多）
- [[hindley-milner]] —— 同样是"编译器静态推某种属性"的经典招式
- [[scott-strachey-denotational]] —— abstract interpretation 的语义基础

## 关联

- [[hindley-milner]] —— HM 推类型，Mycroft 推严格性，都靠静态分析省手写注解
- [[scott-strachey-denotational]] —— 给程序定义"⊥ 是发散"这套语义就来自指称语义
- [[lambda-calculus]] —— 分析对象都是 λ 项，只是被解释到不同域
- [[hughes-fp-matters]] —— Hughes 论证 lazy 让函数式好用，本文则负责让它跑得动
- [[adapton]] —— 增量计算同样借助"哪些值要算"的分析
- [[standard-ml]] —— 反面对照：strict 默认语言不需要这种分析
- [[plotkin-sos]] —— SOS 给求值定规则，本文在更高一层判"能不能跳过这一步"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器
