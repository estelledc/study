---
title: Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
来源: 'Simon Peyton Jones, "Implementing Lazy Functional Languages on Stock Hardware: The Spineless Tagless G-machine", JFP 1992'
日期: 2026-05-30
分类: 编译器
难度: 高级
---

## 是什么

STG（**Spineless Tagless G-machine**）是一种**把 Haskell 这种"用到才算"的语言翻译成普通电脑能跑的代码**的中间层。日常类比：像把一份"按需做菜"的家庭菜谱（点了才下锅）翻译成餐厅厨房的标准流水线动作清单。

Haskell 的招牌特性是 lazy——`take 5 [1..]` 不会真的算无穷列表，只算前 5 个。问题是：这种"先记账、用到才算"的风格，普通 CPU 不擅长，硬件喜欢"算完就有结果"。

STG 干两件事：(1) 给 Haskell 设计一种小而正交的中间语言（也叫 STG language），把 lazy 的所有动作都摊开；(2) 给这种语言一套统一的执行规则——每个值都是一坨"代码指针 + 自由变量"的闭包，要用就跳到代码指针执行。这套设计成了 GHC（Glasgow Haskell Compiler）后端的核心抽象，沿用至今。

## 为什么重要

不理解 STG，下面这些事都没法解释：

- 为什么 Haskell 写得像数学但跑起来不输 OCaml——STG 是中间这层"翻译官"
- 为什么 GHC 编译流程是 Haskell → Core → STG → Cmm → 机器码 这一长串
- 为什么"thunk"、"WHNF"、"strictness"这些 Haskell 圈黑话都绕着 STG 转
- 为什么后续的 pointer tagging / eval-apply / worker-wrapper 都是 STG 的补丁而不是替代

## 核心要点

STG 的精髓是**三件小事**：

1. **let 是分配，case 是求值**：源语言里到处都是表达式嵌套，STG 把它拍平——所有"要在堆上放一坨东西"的动作都用 `let` 表达，所有"现在必须把它算到 WHNF（弱头范式）"的动作都用 `case` 表达。其他子表达式只能是 atom（不能再嵌套的「最小零件」：变量名或数字字面量）。类比：菜谱被改写成"先准备 → 再触发烹饪"两类动作，没第三种。

2. **统一闭包布局 + 进入即跳转（tagless）**：堆上每个对象长得都一样：`[info pointer | free vars]`——info pointer 是"入口代码地址"，free vars 是闭包关在里面的外部变量。要用它就跳到入口代码，不再读 tag 判断"这是 thunk 还是 constructor 还是函数"。代码自己知道自己是什么。类比：每个抽屉外面贴着一张"打开我会发生什么"的小纸条，不用先扫描标签再决定。

3. **更新机制实现共享（无 spine）**：thunk 第一次被求值后，要把自己改写成结果，下次再来直接拿——这就是 lazy 的"算一次缓存"。STG 用 update frame 在栈上记录"算完我要回填谁"。不再像 G-machine 那样维护显式的应用 spine。

## 实践案例

### 案例 1：一段 Haskell 在 STG 里长什么样

源码：

```haskell
sumTo n = sum [1..n]
```

GHC `-ddump-stg` 大致输出（教学简化；本机真实 dump 还会带类型/arity 等标注，骨架相同）：

```
sumTo = \r [n] case enumFromTo 1 n of xs { __DEFAULT -> sum xs }
```

逐部分读：

- `\r [n]` —— 这是个函数（reentrant），参数 `n`
- `case ... of xs` —— 强制求值生成的列表到 WHNF，绑到 `xs`
- `__DEFAULT -> sum xs` —— 默认分支再调 `sum`

注意到没有：嵌套子表达式、隐式求值。所有"何时算"都被显式 case 标出来了。

### 案例 2：updatable 与 non-updatable 的区别

```haskell
x = expensive 42      -- thunk: updatable
f = \y -> y + 1       -- function: non-updatable
```

STG 大致：

```
x = \u []       expensive 42      -- u = updatable
f = \r [y]      case +# y 1 of r { __DEFAULT -> r }   -- r = reentrant
```

`\u` vs `\r` 决定**算完要不要把自己改写**。`x` 第一次被强制后，原地变成结果，下次直接读；`f` 是函数，永远不能"自我更新"，否则就丢了下次再调用的能力。这是 STG 区分 thunk / 函数的关键开关。

### 案例 3：case 是唯一求值点

```haskell
g xs = let n = length xs in n + 1
```

如果直接写 `length xs + 1`，STG 会强制你 let 出来：

```
g = \r [xs] let n = \u [] length xs in case +# n 1 of r { __DEFAULT -> r }
```

读法：先在堆上分配一个 `n` 的 thunk（updatable），再 case 强制它求值，最后做加法。这种"分配和求值显式分开"的写法让后端能精确知道每一步成本。

更狠的是：如果你在源码里写嵌套 `f (g x)`，STG 也会把 `g x` 提成 let。**整个程序里所有非 atom 的子表达式都被命名了**——这给后续优化（共享识别、严格性分析、内联）提供了均质的接口。

## 踩过的坑

1. **把 STG 当源语言写**：不行。STG 是 GHC 内部 IR，所有非 atom 的子表达式都得 let 出来，给人写会窒息。看就好。

2. **忘记 update flag**：thunk 默认 `\u`（updatable），函数 / 已经 WHNF 的 constructor 必须 `\r`。乱用 `\u` 会让函数被一次调用后"凝固"成结果，后面再调就废了。

3. **以为 tagless 就完全无 tag**：现代 GHC 在指针低位回填 1-3 bit 的 pointer tag 给 constructor 做快速判别，是 STG 之上的优化补丁，不是推翻 tagless。

4. **case 顺序疏忽**：case 强迫求值会改变求值时机，把本该 lazy 的部分提前 case，可能让程序从能跑变成发散（infinite loop / 内存爆炸）。

5. **以为 STG 自带 GC**：STG 只规定堆上闭包长什么样、怎么 update，不规定怎么回收。GHC 配的是分代 GC，STG 论文专门把这部分留给运行时另写。

## 适用 vs 不适用场景

**适用**：

- 编译 lazy / non-strict 函数式语言到普通硬件（Haskell / Clean / Miranda 后续实现）
- 需要把 thunk、共享、WHNF 显式表达的 IR 设计场景
- 给 lazy 求值做静态分析（strictness analysis、demand analysis）的底座

**不适用**：

- strict 语言不需要 STG，直接 CPS / SSA 更合适
- 教学 lambda 演算 → 用 SECD 或 [[lambda-calculus]] 直接讲
- 强 GC / region 内存管理的研究 → STG 假定一个 generational GC 配合，自己不管内存策略

## 历史小故事（可跳过）

- **1987 年**：Peyton Jones 出版 *The Implementation of Functional Programming Languages*，系统讲 G-machine，是当时 lazy 编译的教科书。
- **1989 年**：Glasgow 的小组试着把 G-machine 直接编到 C，发现 spine 操作和 tag dispatch 在普通 CPU 上太慢。
- **1992 年**：这篇 JFP 论文成稿，提出 spineless（不维护应用 spine）+ tagless（不读 tag）+ uniform closure 三招，让 lazy 在普通硬件上接近 strict 语言性能。GHC 由此开胎。
- **1995 年**：Ariola/Felleisen 等人补出 [[call-by-need-1995]] 的操作语义，把 STG 的 sharing 形式化。
- **2007 年起**：GHC 又叠加 pointer tagging、eval/apply 调用约定、worker/wrapper 等优化，但 STG 这层 IR 没换骨架。
- **2010 年代后**：STG 还被借去做 lazy 编译以外的事，例如 unboxed sums、levity polymorphism 都在 STG 上加 metadata，证明这套 IR 容得下扩展。

## 学到什么

1. **让 IR 把语义摊开**——把"何时分配、何时求值"做成显式构造，后端才有精确成本模型
2. **统一表示是性能利器**——所有闭包同一布局，省掉 tag dispatch 和分支预测失败
3. **抽象机选哪一台决定语言能跑多快**——SECD、G-machine、TIM、STG，每一台都对应不同硬件假设
4. **标杆论文的生命力 = 后续优化能不能在它上面累加**——STG 32 年了还在 GHC 里活着

## 延伸阅读

- 论文 PDF：[Implementing Lazy Functional Languages on Stock Hardware](https://www.microsoft.com/en-us/research/wp-content/uploads/1992/04/spineless-tagless-gmachine.pdf)（JFP 1992，约 pp.127–202，~76 页，密度高但例子多）
- GHC 文档：[GHC Commentary — STG syntax](https://gitlab.haskell.org/ghc/ghc/-/wikis/commentary/compiler/stg-syntax)（带最新语法和语义注释）
- 视频：[Simon Peyton Jones — Adventures in the Functional Frontier](https://www.youtube.com/results?search_query=peyton+jones+stg)（讲 STG 设计动机）
- [[call-by-need-1995]] —— 给 STG 的 sharing 语义补理论
- [[mycroft-strictness]] —— 在 STG 上做严格性分析
- [[hughes-fp-matters]] —— 讲 lazy 为什么值得费这劲实现

## 关联

- [[lambda-calculus]] —— STG 是带共享的 λ-演算的工业实现
- [[landin-secd]] —— 第一台抽象机；STG 是它的"为 lazy + 寄存器机器"特化版
- [[hindley-milner]] —— GHC 前端用 HM 做类型推导，类型擦掉后才进 STG
- [[call-by-need-1995]] —— 把 STG 的 lazy 共享语义形式化
- [[mycroft-strictness]] —— STG 的 update flag 决策需要严格性分析支持
- [[hughes-fp-matters]] —— 写在 STG 之前，主张 lazy 值得这么折腾
- [[generational-gc]] —— STG 假定的 GC 模型，二者搭配才完整

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器

