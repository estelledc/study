---
title: McCarthy LISP 1960
来源: 'John McCarthy, "Recursive Functions of Symbolic Expressions and Their Computation by Machine, Part I", Communications of the ACM, 1960'
日期: 2026-05-29
子分类: 编程语言
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

McCarthy 1960 年在 MIT 发明的 **LISP**，是一门**只用 7 块积木就能拼出整门语言**的设计。日常类比：像七巧板——只有 7 块，但能拼出任意图形。

LISP（List Processor）写起来长这样：

```lisp
(+ 1 (* 2 3))
```

读法："调用 `+`，参数是 `1` 和 `(* 2 3)`"。所有代码都是嵌套括号的列表——这种结构**既是程序也是数据**。

McCarthy 证明：用 7 个原语（`atom` / `eq` / `car` / `cdr` / `cons` / `cond` / `lambda`）加上递归，就能表达任何能算的函数。

## 为什么重要

不理解 LISP 1960，下面这些事都没法解释：

- 为什么 Clojure / Racket / Emacs Lisp 60 年后还在用 1960 年的设计核心
- 为什么垃圾回收（GC）这件事我们认为理所当然——它就是 1958 年 LISP 1.5 第一次实现的
- 为什么"程序即数据"是元编程的根：从 lisp 宏到 JavaScript 的 `eval` 全是一个思想
- 为什么高阶函数 / 闭包 / REPL 这些词在 1960 年代就有，但 Java 直到 2014 才补上 lambda

## 核心要点

LISP 的全部魔力可以拆成 **三块**：

1. **S-表达式**：用括号嵌套的列表表示一切。`(+ 1 2)` 既是一段代码（执行得 3），也是一个三元素列表（数据）。这种"代码也是数据"的特性叫**同形性**（homoiconicity）。

2. **7 个原语**：`atom`（是不是原子）/ `eq`（是不是相等）/ `car`（取列表第一个）/ `cdr`（取列表剩下的）/ `cons`（拼一个新列表）/ `cond`（条件分支）/ `lambda`（定义函数）。McCarthy 证明这 7 个加递归就足以表达任何可计算函数。

3. **eval**：用 LISP 自己实现 LISP 解释器。McCarthy 在论文里写了 30 行 LISP 代码，定义了 LISP 是什么。这种"语言用自己定义自己"叫**元循环解释器**（meta-circular interpreter），是"内卷"的鼻祖。

## 实践案例

### 案例 1：一个最小 LISP 表达式

```lisp
(+ 1 (* 2 3))
```

LISP 怎么读这一行：

1. 看到外层 `(+ ...)` → 这是函数调用，函数是 `+`
2. 参数有两个：`1` 和 `(* 2 3)`
3. 先把 `(* 2 3)` 求值 → 6
4. 再调用 `+ 1 6` → 7

整个过程**没有运算符优先级**——括号显式声明了一切。这是 LISP 看起来"括号多"的代价，也是它**没有歧义**的来源。

### 案例 2：McCarthy 论文里的 30 行 eval

```lisp
(defun eval (e a)
  (cond
    ((atom e)             (lookup e a))
    ((eq (car e) 'quote)  (cadr e))
    ((eq (car e) 'cond)   (evcond (cdr e) a))
    (t                    (apply (car e) (evlis (cdr e) a) a))))
```

读法：

- 如果 `e` 是原子（变量名），从环境 `a` 里查它的值
- 如果 `e` 是 `(quote x)`，直接返回 `x`（字面量）
- 如果 `e` 是 `(cond ...)`，按条件分支求值
- 否则就是函数调用，先把参数都求值，再调用函数

**关键点**：这段代码本身是 LISP 写的，描述了 LISP 怎么求值。读懂它就读懂了语言。

### 案例 3：lisp 宏——编译期改代码

C 语言里你想加一个新关键字 `unless`（"除非"）必须改编译器。LISP 里你写一个普通函数：

```lisp
(defmacro unless (cond body)
  `(if (not ,cond) ,body))

;; 用法
(unless (= x 0) (print "not zero"))
```

宏在编译期把 `(unless A B)` 重写成 `(if (not A) B)`。**因为代码就是数据，宏就是处理数据的普通函数**——这是 LISP 元编程的根本优势。

## 踩过的坑

1. **括号噩梦**：6 层嵌套是日常，没有缩进辅助根本读不懂。新手第一反应是"括号怎么数"。解决方案：用 paredit / parinfer 这类结构化编辑器替你管括号。

2. **`car` / `cdr` 命名是历史包袱**：来自 IBM 704 硬件指令缩写（"Contents of Address Register" / "Contents of Decrement Register"）。1960 年时已成习惯，结果一路传到 21 世纪。Clojure 2007 才终于改成 `first` / `rest`。

3. **`NIL` 过载**：原始 LISP 里 `NIL` 同时表示空列表 `()`、布尔假、和一个原子。这种重载在后世 Scheme 里被分开（用 `#f` 表示假，`'()` 表示空列表）。

4. **dialect 碎片化**：60 年发展出 Common Lisp / Scheme / Racket / Clojure / Emacs Lisp 等多个互不兼容的 dialect，生态分裂。Common Lisp 程序员看不懂 Clojure 代码，反之亦然。

## 适用 vs 不适用场景

**适用**：
- 元编程 / DSL / 编译器实验——同形性让"代码生成代码"极度简洁
- 编辑器扩展（Emacs Lisp）——动态求值天然契合"边改边用"
- 教学语言（Racket / Scheme）——SICP 用 Scheme 教 CS 经典
- 探索性研究——REPL 驱动开发

**不适用**：
- 静态类型重的工程项目——LISP 默认动态类型，错误延后到运行时（参考 [[hindley-milner]] 的类型推导）
- 大型团队主营业务——招不到 LISP 程序员，工业生态弱
- 性能极致场景——动态分发开销，竞争不过 C/Rust
- 第一次接触编程的人——括号优先语法对新手不友好

## 历史小故事（可跳过）

- **1956 年**：McCarthy 在达特茅斯会议上发明了"AI"这个词
- **1958 年**：他在 MIT 设计 LISP 1.0，借鉴了 [[lambda-calculus]] 的 `lambda` 关键字（Church 1936）和递归函数论（Kleene 1936）
- **1958–1962 年**：实现 LISP 1.5 时为了 cons 单元自动回收，**发明了垃圾回收**——这是历史上第一次
- **1960 年 4 月**：CACM 论文发表。Part II 至今未出版——论文史上最著名的"未完成"之一

McCarthy 原本想让程序员写更接近数学的 M-表达式（`f[x; y]`），S-表达式（带括号的）只是内部表示。但 1958 年实现时 parser 没写好，程序员直接写 S-表达式，结果一统天下。**M-表达式至今未实现。**

## 学到什么

1. **代码也是数据**——这句话 1960 年说出来，60 年后所有元编程都还在它的延长线上
2. **少即是多**——7 个原语 + 递归就能拼出整门语言，比"加 100 个关键字"更深刻
3. **语言用自己定义自己**——eval-apply 是"自举"思想的源头，是编译器/运行时设计的范式
4. **思想 vs 生态是两件事**——LISP 的思想完胜（每代主流语言都在补它的特性），但工业落地长期失败，直到 Clojure 2007 靠 JVM 生态复活

## 延伸阅读

- 经典教材：[SICP](https://web.mit.edu/6.001/6.037/sicp.pdf)（Abelson & Sussman 1985，第 4 章手工实现 eval-apply，看完会"开悟"）
- 论文原文 12 页：[Recursive Functions of Symbolic Expressions](https://www-formal.stanford.edu/jmc/recursive.pdf)（McCarthy 1960，密度高但短）
- Paul Graham 写宏的艺术：*On Lisp*（1993，免费 PDF 网上能找到）
- Rich Hickey 演讲：["Are We There Yet?"](https://www.infoq.com/presentations/Are-We-There-Yet-Rich-Hickey/)（讲 Clojure 设计哲学，回 LISP 老问题）
- [[lambda-calculus]] —— LISP 的 `lambda` 直接来自这里
- [[hindley-milner]] —— LISP 的反面：把"函数式 + 静态类型"绑到一起

## 关联

- [[lambda-calculus]] —— 提供 `lambda` 关键字和"函数即数据"的形式基础
- [[hindley-milner]] —— LISP 没类型系统，HM 是把"函数式 + 类型"绑到一起的桥
- [[smalltalk-80]] —— 同样是"语言极简、运行时强大"的设计哲学，把 OOP 推到极致
- [[standard-ml]] —— ML 把 LISP 的函数式核心 + 严格类型系统结合起来
- [[llvm]] —— 现代编译器后端；LISP "代码即数据"是它"IR 即数据结构"思想的源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[acl2-2000]] —— ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确
- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[belady-1966]] —— Belady 1966 — 缓存替换的理论最优与 FIFO 异常
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[dijkstra-shortest-path]] —— Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[knuth-taocp]] —— Knuth TAOCP — 计算机程序设计艺术
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[lieberman-realtime-gc]] —— Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
- [[llvm]] —— LLVM — 模块化编译器框架
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[plan9-1995]] —— Plan 9 — 把"一切皆文件"真的做到极致的下一代 UNIX
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[shannon-1948]] —— Shannon 1948 — 信息论的诞生
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[smalltalk-80]] —— Smalltalk-80
- [[sprite-1988]] —— Sprite 1988 — 把一屋子工作站伪装成一台大主机
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[turing-1936]] —— Turing 1936 可计算性
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器

