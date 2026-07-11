---
title: Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
来源: 'Ariola, Felleisen, Maraist, Odersky, Wadler, "The Call-by-Need Lambda Calculus", POPL 1995'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Call-by-need（**按需求值**）是 Haskell 这类"惰性"语言的核心策略：函数参数**先不算**，等真用到才算；算完一次**记住**，下次复用。这篇 1995 POPL 论文给这套行为写了一套**纯 lambda 演算的归约规则**——不靠图、不靠堆、只靠语法。

日常类比：买回家的速冻饺子不会立刻全煮（call-by-value 会），第一次要吃才下锅；下完一锅放保鲜盒，下次直接取（call-by-need）。如果每次想吃都重新和面、擀皮、包馅（call-by-name），就太傻了。

```haskell
let x = expensive_compute ()
in x + x   -- expensive_compute 只跑一次，结果共享给两个 x
```

论文用一个新引入的 **let-binding** 显式记录"这一份计算被谁共享"，并改写 beta 规则：`(λx.M) N` 不再直接代入，而变成 `let x = N in M`，等到 M 里 x 出现在求值位置才把 N 求值并代入。

在此之前，惰性语义只能靠"图归约"（graph reduction）讲清楚——把项画成 DAG，共享处变成同一个节点。论文把图编进语法，让证明、推理、改写全都回到纯文本世界。

## 为什么重要

不理解这套演算，下面的事都解释不清：

- 为什么 Haskell 写 `take 5 [1..]` 不会死循环——`[1..]` 看似无限，其实只展开 5 次
- 为什么 `let x = expensive in (x, x)` 在 Haskell 里 expensive 只跑 1 次，在传统 call-by-name 演算里却跑 2 次
- 为什么 Haskell 调试栈反着读才看得懂——惰性把因果链拉得很长
- 为什么严格性分析（[[mycroft-strictness]]）这么重要——它让编译器知道哪些参数"反正都要算"，可以提前算掉省 thunk

## 核心要点

论文做的三件事，可以拆成 **三层**：

1. **共享靠 let，不靠图**：以前讲惰性都画"DAG 共享一个节点"的图归约（Wadsworth 1971）。这论文把图编进语法：每个共享点是一条 `let x = M in N`，从此推理全在项级别完成。类比：从"画家手画共享线"换成"打字机在纸上写编号"——纸笔就够了。

2. **Beta 拆成两步**：经典 lambda：`(λx.M) N → M[N/x]`（直接代入）。本演算：`(λx.M) N → let x = N in M`（先记账），然后只在 x 出现在 evaluation context（求值上下文，"接下来要算的位置"）时才执行 `let x = V in C[x] → let x = V in C[V]`。这一步叫 **demand-driven substitution**——按需代入。

3. **合流 + 标准化两个定理**：(a) **合流**（Church-Rosser）：随便怎么归约，最后结果一致；(b) **标准化**：存在一个唯一的"机器友好"归约顺序，对应实际惰性求值器的执行步骤。两个定理一起说：演算正确、可执行、和 call-by-name 答案相同但更省力。

简而言之：**let 当账本、demand 当扳机、合流定理当保险**。

## 实践案例

### 案例 1：take 5 of infinite list 为什么能终止

```haskell
ones :: [Int]
ones = 1 : ones        -- 自指：ones = 1 cons 自己

main = print (take 5 ones)   -- 输出 [1,1,1,1,1]
```

**逐部分**：

- `ones = 1 : ones` 不立即展开——右边是个 thunk（懒求值的"承诺"）
- `take 5` 只问 `ones` 要 5 次"下一个"，每次拨开一层 thunk
- 第 6 次 `take` 不再问，剩下的 thunk 永远不会展开——这就是惰性的魔法

如果是 call-by-value，`ones` 会立刻陷入无限递归——程序起不来。

### 案例 2：let 共享 vs call-by-name 重算

考虑 `(λx. x + x) (slow ())`：

| 策略 | 归约过程 | slow 调用次数 |
|---|---|---|
| call-by-value | 先算 slow → v，再 v + v | 1 次 |
| call-by-name | (slow ()) + (slow ()) | **2 次** |
| call-by-need | let x = slow () in x + x → 第一次 x 触发 slow，结果存回 x | 1 次 |

论文的关键贡献是：在演算层就让"call-by-need 等价于 call-by-name 的最终值，但不重算"——这之前只能在图归约里说清楚。

### 案例 3：space leak 反例与修法

```haskell
sumBad :: [Int] -> Int
sumBad = foldl (+) 0       -- 100 万元素堆出 100 万 thunk → 撑爆栈

sumGood :: [Int] -> Int
sumGood = foldl' (+) 0     -- 严格版 foldl，每步立即算，不堆 thunk
```

`foldl (+) 0 [1..n]` 不会立刻算 `0+1+2+...`，而是堆出 `((0+1)+2)+3...` 这棵 thunk 树。直到最后 `print` 强制求值才一次性塌缩——栈深度 = n，溢出。换成 `foldl'` 加了 `seq` 强制每步立即算，立刻好。这是惰性 + 算子结合性踩出来的最常见坑。

## 踩过的坑

1. **lazy ≠ call-by-name**：很多教材把两者画等号。call-by-name 每次用都重算，会把 `fib 30` 算成指数次；call-by-need 加了共享才是真正生产级 lazy。论文的核心就是把这个区别用语法表达出来。

2. **副作用 + 惰性 = 难推理**：`let x = print "hi" in (x, x)`，cbn 打印两次、cbneed 打印一次。任何外部可观察行为都易踩坑——所以 Haskell 用 IO monad 把副作用关进笼子，让纯函数和惰性安心共存。

3. **空间泄漏（space leak）**：lazy thunk 没被强制求值就一直挂在堆上。`foldl (+) 0 [1..1e6]` 会堆出 100 万个 thunk → 撑爆栈。要用 `seq` / `BangPatterns` 强制求值，或换 `foldl'`。

4. **调试栈反过来**：错误发生时实际触发位置和你写代码的位置可能差很远，traceback 看上去不知所云——惰性把因果链拉长了。新人会怀疑人生。

## 适用 vs 不适用场景

**适用**：

- 形式语义研究——给 Haskell / Clean / Lean 的求值规则写论文证明，本演算是 SOT
- 编译器优化正确性证明——GHC 做 inline / let-floating / strictness 重写时，得证明语义不变
- 教学：从 call-by-value / call-by-name / call-by-need 三选一时，用本演算最容易讲清楚区别

**不适用**：

- 工业级实现细节——真正的 STG-machine（Spineless Tagless G-machine）和 Launchbury 自然语义更接地气
- 严格语言（OCaml / Standard ML / Scala）——它们是 call-by-value，本演算的 let-floating 用不上
- 需要推理副作用 / 并发 / IO——纯演算，加这些得套 monad 或 effect 系统（[[effect-handlers]]）

## 历史小故事（可跳过）

- **1971 年**：Christopher Wadsworth 在博士论文里用图归约（graph reduction）首次给 lazy 求值正式语义，但脱离 lambda 演算，不能纯语法推理。
- **1975 年**：Plotkin 写《Call-by-name, call-by-value and the lambda calculus》，把 cbv 和 cbn 标准化，但没碰共享。
- **1990 年**：Haskell 1.0 发布，把 lazy + 纯 + 类型类工业化，但形式语义还是图归约风格。
- **1995 年**：本论文出现——Ariola（Oregon）、Felleisen（Rice）、Maraist + Odersky（Karlsruhe）、Wadler（Glasgow）联手，把图归约的思路搬回纯 lambda 演算。Odersky 后来去做 [[standard-ml]] 风格的 Scala。
- **1998 年**：Maraist-Odersky-Wadler 在 JFP 期刊出扩展版，成为后续 GHC 内核语义的引用基准。
- **2010s 之后**：Sergey-Vytiniotis 等人把这套演算扩展到处理副作用、严格性标注、并发，演变成今天 GHC 内部用的 Core IR 语义。
- **副线轶事**：5 位作者后来都成了语言研究的中坚——Felleisen 拿 SIGPLAN 杰出贡献奖；Wadler 在 [[hindley-milner]] 系列里继续深耕；Odersky 设计的 Scala 现在是 JVM 主流之一。

## 学到什么

1. **演算 = 数学手柄**——要证明优化正确、给语言写规约，必须有一套纯语法的归约规则；图、堆、机器都太具体
2. **共享是 lazy 的灵魂**——没有共享只是 cbn，性能崩。论文最大的贡献是把"共享"这个抽象操作用 let 编进语法
3. **demand-driven 思路不止于 lazy**——后来 incremental computing、build system（Bazel / shake）都用过类似的"按需求值 + 缓存"设计
4. **理论先行 30 年**——1971 图归约、1995 演算、2010s GHC 优化全靠它，证明语义研究不是脱离工程的玄学

## 延伸阅读

- 论文 PDF（JFP 1998 扩展版）：[Maraist-Odersky-Wadler — The Call-by-Need Lambda Calculus](https://homepages.inf.ed.ac.uk/wadler/topics/call-by-need.html)
- 视频讲解：[Stephen Diehl — Lazy Evaluation in Haskell](https://www.stephendiehl.com/posts/lazy_lazy.html)（含 thunk 可视化）
- Launchbury 1993 自然语义版（更接近实际实现）：[A Natural Semantics for Lazy Evaluation](https://homepages.inf.ed.ac.uk/wadler/papers/launchbury/launchbury.ps)
- [[lambda-calculus]] —— 本演算的母体
- [[mycroft-strictness]] —— 严格性分析，惰性的"反向修正"

## 关联

- [[lambda-calculus]] —— 母体演算，本论文加 let + 受限 beta 得到 cbneed 子演算
- [[hindley-milner]] —— 类型推导，lazy 语言里推 thunk 类型时关键
- [[hughes-fp-matters]] —— Hughes 用 lazy 列表论证 FP 模块化优势，本演算给那篇文章背书
- [[plotkin-sos]] —— 结构操作语义，本演算的兄弟方法（reduction relation）
- [[mycroft-strictness]] —— 严格性分析，编译器靠它把"反正要算"的 thunk 提前求值
- [[generational-gc]] —— lazy 程序产 thunk 多，对 GC 压力大，催生了分代回收的工程权衡
- [[reynolds-definitional-interpreters]] —— Reynolds 用解释器讲语义，是 cbv 一支的祖师；本论文是 cbneed 的对应里程碑

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
