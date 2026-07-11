---
title: Why FP Matters — 函数式真正赢在能拆能粘
来源: 'John Hughes, "Why Functional Programming Matters", The Computer Journal 1989'
日期: 2026-05-30
分类: functional-programming
难度: 初级
---

## 是什么

Hughes 这篇 1989 年的文章想纠正一个误会：函数式编程（FP）的好处**不是它砍掉了什么**（赋值、循环、副作用），**而是它启用了什么**——更强的"拆 + 粘"能力。

日常类比：搭乐高。命令式语言像一整块从模具里压出来的塑料玩具——好看，但要改尾巴就得整个重做。FP 像零散的乐高块——每块自己看没意义，但因为有"凸起 + 凹槽"的标准接口，可以任意拼起来。Hughes 主张 FP 多出来两种"凸起 + 凹槽"——**高阶函数**和**惰性求值**——让你拼出命令式拼不出的形状。

整篇论文不证明 FP "更安全" 或 "更快"，只证明一件事：**能更模块化**。这是 30 年里说服工程师"为什么要 lazy / 为什么要纯"的标准答案。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 Haskell / Clojure 程序员动不动就提"无限列表"，而 Java 程序员从不这么说话
- 为什么 React / Redux 的核心 API 是 `reduce`（hooks 里的 useReducer 直接抄了）
- 为什么 MapReduce / Spark 把 1989 年这套思路放大到 PB 级数据还成立
- 为什么 30 年后教 FP 的开场依然是这篇，没人写出更好的 FP manifesto

## 核心要点

Hughes 的论证拆三层：

1. **模块化是好程序的核心**：能拆成小块再粘起来，才好维护、好复用、好测试。这一层人人同意，但下两层 FP 才独有。

2. **高阶函数 = 把通用模式从具体细节剥出来**。`sum / product / 长度 / 是否有真值` 这些列表操作，骨架都是"一个起点 + 一个二元合并 + 扫一遍列表"。FP 把骨架抽成 `reduce`，每次只填二元运算就行。类比：把"煮饭"抽象成"水 + 米 + 时间"，下次煮粥只换比例不重写流程。

3. **惰性求值 = 让生成数据和决定何时停下变成两个互不知道的模块**。命令式必须把"算下一近似"和"判断够准了吗"写在同一个 while 里。Hughes 说：把无限近似序列写出来，让另一个函数从这个序列里挑第一个收敛的——两个函数互不认识，组合自由。

惰性的真正价值不在性能，在**让无限结构合法**。

## 实践案例

### 案例 1：reduce 抽出一票列表函数的共同骨架

Haskell 风格代码（`foldr` 就是 `reduce`）：

```haskell
sum     = foldr (+) 0
product = foldr (*) 1
anytrue = foldr (||) False
length  = foldr (\_ n -> n + 1) 0
```

**逐部分**：

- `foldr op init` 是骨架："从右往左，一个一个用 op 合并到 init 上"
- `(+) 0`、`(*) 1`、`(||) False` 是各自填的"二元运算 + 单位元"
- 所有这些函数共享一份扫列表的代码，bug 修一处都修

这就是后来 MapReduce / Spark / RxJS reduce 的祖宗。

### 案例 2：Newton-Raphson 平方根——生成与停止互不认识

数学课的 Newton-Raphson 求 √n：从猜测 a 开始，下一步 `a' = (a + n/a) / 2`，反复直到差距小于 eps。

命令式写法（`while abs(a - a_new) > eps`）把"算下一步"和"判断停止"绞在一起。Hughes 写法：

```haskell
sqrt n eps a0 = within eps (repeat (next n) a0)

next n a   = (a + n/a) / 2
repeat f x = x : repeat f (f x)         -- 无限列表
within eps (a:b:rest)
  | abs (a-b) < eps = b
  | otherwise       = within eps (b:rest)
```

`repeat (next n) a0` 是**无限**近似列表 `[a0, a1, a2, ...]`。`within eps` 从中找第一对足够接近的就停。**两个函数互不知道对方存在**，但靠惰性能拼起来——只算到需要的那一项。换收敛判定（如改成相对误差 `relative eps`）只换一个函数，生成器一行不动。

### 案例 3：alpha-beta 博弈树

下棋 AI 的极小化算法（minimax + alpha-beta 剪枝）。Hughes 拆成 4 步：

```haskell
gametree node = Node node [gametree c | c <- moves node]   -- 可能无限的博弈树
prune 0 (Node n _) = Node n []
prune k (Node n cs) = Node n [prune (k-1) c | c <- cs]
maximise (Node n []) = static n
maximise (Node n cs) = maximum (map minimise cs)
```

四个函数四个职责：建树、剪深度、估值、求最优。`evaluate = maximise . prune 5 . gametree . start`。命令式 alpha-beta 必须把建树和评价绞在一起（不然爆内存），所以根本拆不开——FP + 惰性才让这种"先无限再剪"的写法可行。

## 踩过的坑

1. **把 FP 优势误读成"纯函数 = 没 bug"**：Hughes 全篇只字未提"纯"本身的安全性。他证的是模块化，"纯"只是惰性能成立的前提（有副作用就不能随便延迟求值）。

2. **把惰性当性能优化**：惰性的价值是**让无限列表合法**，让"终止判定"能独立成一个模块。不是省 CPU——很多场景惰性反而引入"thunk 堆积"性能反优化。

3. **把高阶函数等同 `map/filter/reduce`**：这只是 1 米深。Hughes 主张的是 5 米深——博弈树那种 4 段 pipeline 的拆法。只用 `map.filter.reduce` 没 get 到论文精髓。

4. **在严格语言里硬模仿这种拆法**：Python `itertools` / Java `Stream` 的"惰性"是浅惰性，能凑出 case 1，但凑不出 case 3——它们的延迟语义不彻底，无限博弈树过早物化就爆栈。

## 适用 vs 不适用场景

**适用**：

- 数值算法有"迭代收敛 + 自定义停止条件"模式（求根、积分、微分、PDE 求解器）
- 搜索类算法（博弈树、A\*、回溯）能拆成"生成 + 剪枝 + 估值"
- 流式数据处理（日志、事件、传感器）—— RxJS / Reactive Streams 是直系子孙
- 教学场景——这是讲清"模块化"的最好材料

**不适用**：

- 紧密耦合的 IO 密集任务（数据库事务、外设驱动）—— 副作用是核心，硬抽象反而绕
- 严格性能场景里的"性能拆解"—— 惰性 thunk 开销你不可控，需要 strictness annotation 或换 [[standard-ml]] 风格
- 团队完全不懂 FP——这套思路对零基础工程师是反直觉的，先用 [[mccarthy-lisp]] 或 SICP 打底再看

## 历史小故事（可跳过）

- **1977 年**：Backus 在图灵奖演讲《Can Programming be Liberated from the von Neumann Style》点燃 FP 学界，但他给的 FP 系统语法过于代数化，工业界看不懂
- **1984 年**：Hughes 在 Glasgow 大学做博后写下这篇初稿，最初只是给同事看的内部备忘，用刚发明的 Miranda 语言（Haskell 前身）演示
- **1989 年**：正式发表在 The Computer Journal，从一份内部 manifesto 变成 FP 圈引用最多的文章之一
- **1990 年**：Haskell 委员会成立，把 Hughes 的论证当作设计哲学的 north star
- **2003 年起**：MapReduce / Spark / React 把这套"reduce 抽骨架 + lazy 拆生成消费"的思路放大到工业级，反过来印证 1989 年的论断

## 学到什么

1. **模块化的关键是有趁手的"胶水"**——FP 多了高阶函数和惰性两种胶水，所以能拼出别人拼不出的形状
2. **拆掉"生成"和"消费"的耦合**是惰性的真正价值——不是性能，是表达力
3. **"砍掉了什么"是错的提问方式**，正确问法是"启用了什么"——这个思维框架推广到任何技术评估都有效
4. **30 年定律**：1989 年的 4 个例子（reduce / sqrt / 积分 / 博弈树）今天仍是 FP 教学的标配，说明真正的好设计跨越语言代际

## 延伸阅读

- 论文 PDF：[Why Functional Programming Matters (Hughes 1989)](https://www.cs.kent.ac.uk/people/staff/dat/miranda/whyfp90.pdf)（24 页，例子比理论多，零基础能啃）
- 视频：[Hughes 本人 30 周年回顾演讲](https://www.youtube.com/watch?v=1qBHf8DrWR8)（2019，讲哪些预言成真哪些没成）
- 书：Bird & Wadler《Introduction to Functional Programming》（同年代教材，有更系统的练习）
- [[mccarthy-lisp]] —— FP 的元祖，Hughes 文里那些胶水的源头
- [[push-pull-frp]] —— 把 Hughes 的"流"思想推向 GUI / 实时系统
- [[theorems-for-free]] —— Wadler 把 Hughes 的"高阶 = 模块化"再升一档：类型签名直接给定理

## 关联

- [[mccarthy-lisp]] —— LISP 1960 是高阶函数的祖宗，Hughes 拿它做基线对比
- [[lambda-calculus]] —— FP 的数学骨架，map/reduce/惰性的形式定义
- [[standard-ml]] —— 同期 FP 语言但严格求值，看不到 Hughes 的"无限列表"路线
- [[hindley-milner]] —— Hughes 用的 Miranda 类型系统就是 HM，让高阶函数能编译
- [[push-pull-frp]] —— 论文思想的现代延伸：把流当无限列表
- [[effect]] —— 现代 TS 把"副作用 + 模块化"重新组合，Hughes 思路在 TypeScript 里复活
- [[theorems-for-free]] —— Wadler 把"高阶 = 抽象"推到极致

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[backus-fp-1978]] —— Backus FP 1978 — 把程序从赋值循环里解放出来
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[tide]] —— Tide — async-std 阵营里 koa 风格的极简 Rust web 框架
