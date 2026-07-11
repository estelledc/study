---
title: Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
来源: 'P. J. Landin, "The Mechanical Evaluation of Expressions", The Computer Journal 1964'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

SECD 是 Landin 1964 年设计的**一台想象出来的机器**——它能一步一步把 lambda 表达式 "跑" 起来。日常类比：像一个**带 4 个抽屉的厨房工作台**，做菜时把食材、调料、菜谱、暂存盘各放一格，按顺序操作就能做出任何一道菜。

机器名字来自 4 个抽屉的首字母：

- **S** — Stack：当前算到一半的中间值（菜板上切着的食材）
- **E** — Environment：变量到值的绑定表（写好"盐 = 海盐"的便签）
- **C** — Control：剩下要执行的指令序列（菜谱接下来的步骤）
- **D** — Dump：函数调用时把当前 (S, E, C) 整套打包暂存（半成品先放冷藏，等回来继续）

任何一段 lambda 演算的表达式都能编译成 C 上的指令，然后看着这 4 格状态怎么变就知道求值过程。

## 为什么重要

不理解 SECD，下面这些事都没法解释：

- 为什么不少函数式语言的 **bytecode VM**（尤其 OCaml 的 ZINC）能直追 SECD 的设计骨架——它们是 SECD 的工程化变体；Haskell 的 STG 则是为懒求值另起炉灶，不宜直接叫 SECD 变体
- 为什么 closure（闭包）必须 "**带着环境**" 走，而不只是函数指针
- 为什么形式语义课会先讲 SECD、再讲 CEK / CESK——后者用 continuation 等替换 Dump，是同一谱系的简化/变体
- 为什么 Scheme / Lisp 解释器教材常从 SECD 起步——四寄存器把"算到哪、绑了啥、下一步、怎么回来"拆开，调试直观

## 核心要点

SECD 的工作方式可以拆成 **三个动作**：

1. **压栈求值**：遇到常量或变量直接压到 S；遇到 `+ a b` 就先求 a 再求 b 再弹出两个相加。类比：菜板上叠食材，要用时从上面拿。

2. **打包闭包**：遇到 `λx. body` 不立即执行，而是把 (body 的指令, 当前的 E) 打包成一个 closure 压到 S。类比：把"菜谱+当前调料便签"装进密封袋，谁要做菜时连袋子一起拿走。

3. **保存现场再调用**：遇到函数调用，把当前的 (S, E, C) 三元组压到 D，进入函数体执行；函数返回时从 D 恢复。类比：被叫去帮邻居切菜前，自己台面照原样冷藏，回来继续。

这三个动作合起来就够了——任何 lambda 表达式都能这样跑。

## 实践案例

### 案例 1：跑 (λx. x+1) 5

最小例子：把 5 喂给 "加一" 函数。机器状态变化：

```
初态:  S=[]  E=[]  C=[(λx. x+1) 5]  D=[]

1. 拆开应用：先算函数，再算实参
   S=[]  E=[]  C=[λx.x+1, 5, AP]  D=[]

2. λ 编译为 closure 压栈
   S=[<closure: x+1, E=[]>]  E=[]  C=[5, AP]  D=[]

3. 5 压栈
   S=[5, <closure>]  E=[]  C=[AP]  D=[]

4. AP 应用：弹 closure 和 5，绑 x=5 进新 E，
   旧 (S,E,C) 进 D，进入函数体
   S=[]  E=[x=5]  C=[x, 1, +]  D=[(旧S, 旧E, 旧C)]

5. 求 x=5、1，加得 6
   S=[6]  ...  最后从 D 恢复，结果是 6
```

**逐部分解释**：每一步只动 4 格之一。整个过程没有 "魔法"——纯机械替换。

### 案例 2：闭包必须带环境

```
let make_adder = λx. λy. x + y in
let add3 = make_adder 3 in
add3 10
```

`add3` 是 `make_adder 3` 求值后的结果。它**不是一段裸代码**，而是一个 closure：里面记着 `λy. x+y` 的指令 + `E={x=3}` 的环境快照。10 喂进去时，新的 E 是 `{y=10, x=3}`，所以加得 13。

**关键**：如果 closure 不带 E，调用 `add3 10` 时找不到 x，会报 "x not bound"。这就是**词法作用域**（lexical scoping）的实现底座。

### 案例 3：Python 写 30 行最小 SECD

closure 必须携带**参数名**（不是只有函数体），AP 时才能正确绑定：

```python
def secd_step(s, e, c, d):
    if not c: return s, e, c, d
    op, *rest = c
    if op[0] == "LD":                       # 取变量
        return ([e[op[1]]] + s, e, rest, d)
    if op[0] == "LDC":                      # 压常量
        return ([op[1]] + s, e, rest, d)
    if op[0] == "LDF":                      # 闭包：("LDF", 参数名, 函数体)
        return ([("CL", op[1], op[2], e)] + s, e, rest, d)
    if op[0] == "AP":                       # 应用：先弹值，再弹 closure
        v, cl, *s2 = s
        _, param, body, e_saved = cl        # 取出参数名
        return ([], {**e_saved, param: v}, body, [(s2, e, rest)] + d)
    if op[0] == "RTN":                      # 返回：恢复 caller 状态
        v = s[0]; (s2, e2, c2), *d2 = d
        return ([v] + s2, e2, c2, d2)
```

跑 `(λx. x) 7` 的指令序列写成元组：`[("LDF", "x", [("LD", "x"), ("RTN",)]), ("LDC", 7), ("AP",)]`，反复调 `secd_step` 直到 C 空，最终 S=[7]。这是 Landin 1964 核心机制的最小化演示（真实 SECD 还有 RAP、DUM 处理 letrec）。

## 踩过的坑

1. **closure 不只是函数指针**：必须把当前 E 一起打包，否则调用时自由变量找错绑定。dynamic scoping 是早期 LISP 的做法（调用时才查变量），lexical scoping（在定义点查）是 SECD 闭包默认的语义，也是现代主流。

2. **Dump 不能省**：D 保存的是 caller 的 (S, E, C)，函数返回时靠它复原。省掉 D 必须换别的方式表达控制流，CEK 机器就是用 continuation K 替代 D 的简化产物。

3. **AP 弹栈顺序是关键细节**：迁移规则里规定 closure 先入栈、值后入栈，所以 AP 时**先弹值再弹 closure**——新手常写反这两步，导致用值当函数调或栈错位。

4. **SECD 默认 call-by-value**：先把实参完全求值再代入。要做 call-by-name / call-by-need（懒求值）必须改迁移规则，不是改一两条指令——Haskell 的 STG 机器就是为此另起炉灶。

## 适用 vs 不适用场景

**适用**：

- 教学：第一次学形式语义、抽象机器的最佳起点
- 实现 ML / Scheme / mini-Haskell 这类函数式语言的 bytecode VM
- 设计任何带 closure + first-class function 的解释器

**不适用**：

- 想做懒求值 → 用 Krivine machine 或 STG（Spineless Tagless G-machine）
- 想表达 control operator（call/cc、algebraic effects）→ 用 [[effect-handlers]] 或 CEK 加 K 寄存器
- 想直接生成机器码 → SECD 是抽象机不是真机器，要再降一层到 [[ssa]] / [[llvm]]
- 工业级性能 → 现代 OCaml 的 ZINC、Haskell 的 STG 都对 SECD 做了大量优化，原始 SECD 跑不快

## 历史小故事（可跳过）

- **1960 年**：McCarthy 给 LISP 写过 `eval`，但那是 LISP 自己解释自己（meta-circular）。形式上不严格。
- **1964 年**：Landin 在 The Computer Journal 发表本论文，用 4 寄存器抽象机给出 lambda 表达式的机械求值过程，与具体语言解耦。
- **1965 年**：Landin 写续作 "A Correspondence between ALGOL 60 and Church's Lambda-Notation"，把 [[algol-60]] 翻译成 lambda，让两个看似不同的语言在 SECD 上同语义。
- **1981 年**：Plotkin 提出 [[plotkin-sos]]（Structural Operational Semantics），更现代但根在 SECD。
- **1986 年**：Felleisen 把 SECD 简化成 CEK——去掉 D，用 continuation 替代。后来再扩为 CESK（加 store）。
- **1990 年代**：OCaml 的 ZINC 机器、Caml Light 的 bytecode VM 都是 SECD 的高效变体。

## 学到什么

1. **抽象机是连接理论和实现的桥**：lambda 演算是数学，CPU 是电路，SECD 让中间这一步可写、可读、可调试
2. **状态四元组是关键设计**：把"中间值 / 变量绑定 / 接下来做什么 / 怎么回来" 拆成 4 格各管一事，调试一目了然
3. **简化是后世的方向**：CEK 去掉 D、Krivine 改求值序，每个变体都在回答 "如果不要某个抽屉怎么办"
4. **理论先行 60 年**：1964 年的论文今天还能直接读，每天写的 OCaml / Haskell 都在跑它的徒孙

## 延伸阅读

- 论文 PDF：[Landin 1964 — The Mechanical Evaluation of Expressions](https://academic.oup.com/comjnl/article/6/4/308/375725)（13 页，Computer Journal）
- 教程：Matt Might [Writing an Interpreter, CEK-Style](https://matt.might.net/articles/cek-machines/)（用现代视角对比 SECD / CEK / CESK）
- 视频：[Programming Languages — Abstract Machines](https://www.youtube.com/results?search_query=secd+abstract+machine)（多门 PL 课都讲 SECD 起步）
- 实现教程：[Sketching Scheme — Implementing SECD](https://wiki.c2.com/?SecdMachine)（C2 wiki 老派但完整）
- [[lambda-calculus]] —— SECD 求值的对象就是 λ-演算项
- [[plotkin-sos]] —— SECD 的现代继承者：结构化操作语义

## 关联

- [[lambda-calculus]] —— SECD 是为它设计的求值机器
- [[mccarthy-lisp]] —— LISP 的 meta-circular eval 是 SECD 的前身
- [[algol-60]] —— Landin 1965 续作把 ALGOL 60 翻译进 SECD
- [[plotkin-sos]] —— 1981 年的现代化重做：迁移规则更结构化
- [[hindley-milner]] —— 给 SECD 跑的 lambda 项静态推类型
- [[standard-ml]] —— 函数式实现课里常与 SECD 求值机一起讲（类型 + 抽象机）
- [[effect-handlers]] —— SECD 用 D 表达调用栈，effect handlers 把它推广到任意控制流

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[backus-fp-1978]] —— Backus FP 1978 — 把程序从赋值循环里解放出来
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器
