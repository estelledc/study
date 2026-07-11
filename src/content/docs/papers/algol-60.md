---
title: ALGOL 60 — BNF 与块结构
来源: 'Naur et al., "Report on the Algorithmic Language ALGOL 60", 1960'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

ALGOL 60 是 1958-60 年欧美计算机科学家联合委员会设计的一门"算法描述语言"。日常类比：像菜谱界第一次有了统一标准——以前每家餐馆写菜谱各凭口味（"加适量盐、煮到差不多就行"），ALGOL 60 之后大家统一写"盐 5g、火候 95℃ 持续 3 分钟"，机器看得懂、人也能照做。

它本身没在工业界流行起来，但今天你写的 Pascal / C / C++ / Java / Python 的"块结构"、"局部变量"、"递归函数"、"语言文法"，全都是 ALGOL 60 报告里第一次定下来的样子。

## 为什么重要

不理解 ALGOL 60，下面这些事都说不清：

- 为什么所有现代语言的语法书都长得像 `<expr> ::= <term> | <expr> "+" <term>`——这种写法叫 [[BNF]]，是 ALGOL 60 报告里诞生的
- 为什么 C/Java 用 `{ ... }`、Pascal 用 `begin ... end`、Python 用缩进——它们表达的都是"块"，而"块"的概念来自 ALGOL 60
- 为什么函数参数有"按值传递"和"按名传递"两种说法——ALGOL 60 第一次形式化定义了这个区别
- 为什么 Pascal、C、Ada、Java 都自称"ALGOL 后裔"——它们的作用域规则、栈帧模型、递归实现都是从这里抄的

## 核心要点

ALGOL 60 真正立得住的核心贡献有 **三件**：

1. **BNF —— 把语法写成机器能读的对象**：以前 FORTRAN 的语法定义靠英文段落 + 例子；ALGOL 60 第一次把语法写成形式产生式 `<expr> ::= ...`。今天 ANTLR / Yacc / tree-sitter 都是这条路的延伸。

2. **块结构 + 嵌套作用域**：用 `begin ... end` 把代码分块，块内声明的变量出了块就消失。块可以嵌套，内层能看见外层的变量，重名时遮蔽外层。这就是今天所有"局部变量"和"作用域链"的雏形。

3. **call-by-value vs call-by-name**：函数调用时，参数是先求值再传进去（by-value），还是把表达式原封不动塞到函数体里、每次用都重算（by-name）？ALGOL 60 第一次正式区分了这两种。

## 实践案例

### 案例 1：用 ALGOL 60 写阶乘

```algol
integer procedure factorial(n);
  integer n;
begin
  if n <= 1 then
    factorial := 1
  else
    factorial := n * factorial(n - 1)
end
```

**逐部分解释**：

- `integer procedure factorial(n)` —— 声明一个返回 integer 的过程，名字叫 factorial，接收参数 n
- `begin ... end` —— ALGOL 60 的"代码块"，相当于 C/Java 的 `{ ... }`
- `factorial := ...` —— 在过程内部，给"过程名本身"赋值就是设置返回值（Pascal 沿用了这种写法）
- `factorial(n - 1)` —— 递归调用自己

ALGOL 60 是**最早一批官方支持递归的高级语言**（FORTRAN I/II/IV 都不支持）。支持递归靠的是栈帧——每次调用都开一个新内存空间存参数和局部变量。这件事现在所有语言的运行时都在做。

### 案例 2：用 BNF 描述 if-else 文法

```bnf
<stmt>     ::= <if-stmt> | <assign>
<if-stmt>  ::= "if" <expr> "then" <stmt>
             | "if" <expr> "then" <stmt> "else" <stmt>
<assign>   ::= <var> ":=" <expr>
```

**逐部分解释**：

- `<...>` 包起来的是"非终结符"——一种占位符，会被进一步展开
- `::=` 读作"定义为"
- `|` 读作"或者"——左边可以展开成右边任一种
- 字面字符串（如 `"if"`、`":="`）是"终结符"——直接出现在源代码里

读这套规则：一个 stmt 要么是 if 语句要么是赋值；if 语句要么是单分支要么是双分支；赋值是变量 := 表达式。短短四行就把语法说完了。

这种"用一种语言描述另一种语言"的元语言，就是 [[BNF]] 的本质——也是后来所有解析器生成器的基础。

### 案例 3：call-by-name 的奇怪现象

ALGOL 60 默认参数传递是 call-by-name——意思是把"表达式本身"塞进函数体，不是把"表达式的值"塞进去。

```algol
procedure incr(x); integer x;
begin x := x + 1 end;

begin
  integer a; a := 5;
  incr(a);
  print(a)         comment 输出 6
end
```

**逐部分解释**：

- 调用 `incr(a)` 时，编译器把过程体里的 `x` 全部替换成 `a` —— 等价于直接执行 `a := a + 1`
- 所以最后 a 变成了 6
- 如果改成 call-by-value，函数体里改的是 a 的副本，外层 a 不变，会输出 5

更夸张的是 Jensen's device——用 call-by-name 实现"通用求和"：

```algol
real procedure SUM(i, lo, hi, term);
  integer i, lo, hi; real term;
begin
  real s; s := 0;
  for i := lo step 1 until hi do
    s := s + term;
  SUM := s
end;

result := SUM(k, 1, 100, A[k] * B[k])
```

由于 term 是 call-by-name，循环每一轮 `term` 都被重新替换成 `A[k] * B[k]`，而 `k` 又被 `i` 通过 by-name 改变——这就实现了"对所有 k 从 1 到 100 求和 A[k]*B[k]"。1960 年版本的"高阶函数"。

不过 call-by-name 后来基本被淘汰了（见下文）。

## 踩过的坑

1. **call-by-name 的"性能不可预测"**：`f(expensive_expr)` 中 expensive_expr 求值多少次取决于 f 体内 x 出现几次。程序员看代码无法判断是 1 次还是 1000 次，编译器优化也无从下手。今天主流语言全部默认 call-by-value。

2. **dangling else 的二义性**：BNF 写出 `if A then if B then S1 else S2`，else 配哪个 if？BNF 本身不告诉你。ALGOL 60 报告对这点定义不清，导致不同实现行为不一致。后来语言（Pascal / C / Java）才约定"else 配最近的 if"。

3. **没规定 I/O 是工业失败的关键**：ALGOL 60 报告完全没写 read/write 怎么用——委员会觉得"I/O 是机器细节"。结果是：剑桥写的代码不能跑在 IBM 机器上，工业界没法用，被 FORTRAN 压死。教训：**形式美学不等于工业可用**。

4. **call-by-name + 副作用 = 灾难**：`incr(a[i])` 在 call-by-name 下相当于把 `a[i] := a[i] + 1` 替换进去，但 `i` 可能在替换发生时已变。延迟求值 + 副作用组合等于推理地狱。Haskell 后来用 call-by-need（求值一次后记住结果）把它救回来——这是 [[lambda-calculus]] 路线的现代延伸。

## 适用 vs 不适用

**适用**（指 ALGOL 60 的思想，不是它本身）：

- 学语言设计基础——块结构 + 作用域 + 参数传递是必修课
- 读编译原理——BNF 是第一周的内容
- 理解为什么 Pascal / C / Java 长这样——因为它们的祖先就是 ALGOL 60

**不适用**：

- 工业代码——ALGOL 60 实现已绝迹，写代码用它的后裔（C/Pascal/Java）
- 学动态语言（Python/JS/Ruby）——它们的对象模型、函数式特性来自 LISP / Smalltalk，不是 ALGOL
- 学函数式语言（Haskell/OCaml）—— [[hindley-milner]] / lambda 演算路线和 ALGOL 是两条平行线

## 历史小故事（可跳过）

- **1958 年 Zürich 会议**：ACM 和 GAMM（欧洲应用数学协会）联合做"国际代数语言"，初版叫 ALGOL 58
- **1960 年 Paris 会议**：13 位作者签署 ALGOL 60 报告。Peter Naur 主笔，把 Backus 的元语言改良并命名为今天的 BNF
- **作者里 4 位图灵奖**：John Backus（FORTRAN 之父）、John McCarthy（LISP 之父）、Peter Naur、Niklaus Wirth（Pascal 之父）——同一份报告同时承载着竞争语言之父们
- **1968 年 ALGOL 68**：委员会做后续版本，特性堆得过于复杂，社区分裂；Wirth 出走做了 Pascal——简洁、能跑、广受欢迎
- **1972 年 C 语言**：Ritchie 从 BCPL 派生 C，BCPL 的祖先是 CPL，CPL 是英国对 ALGOL 60 的回应
- **1995 年 Java**：把 ALGOL 60 的块结构 + Simula 67 的 OOP 包成主流语言

ALGOL 60 报告本身只有 17 页，但定义的语法描述方法（BNF）今天仍是每本编译原理课的开篇。

## 学到什么

1. **形式定义和工业落地是两件事**——一个论文里完美的语言（ALGOL 60）可能被论文里很烂的语言（FORTRAN）压死。生态、文档、I/O 标准、第一批教科书选谁，比"语言本身美不美"更决定命运。
2. **抽象的代价是认知开销**——call-by-name 在数学上很优雅（统一了值传递和宏展开），但程序员的 mental model 跟不上。这条铁律到今天写 React Hooks / Rust lifetime 仍然成立。
3. **可被机器消费的形式**比"严格"更重要——BNF 的真正贡献不是把语法定得严密，而是让"语法"从人类对话变成机器可读的对象。这是从工艺到工程的关键一跃。**17 页的密度可以击穿 60 年**——ALGOL 60 报告每一句都在做形式定义，密度比页数重要。

## 延伸阅读

- 论文 17 页 PDF：[ALGOL 60 Report (CACM 1960)](https://www.softwarepreservation.org/projects/ALGOL/report/Algol60_report.pdf) —— 原始报告，BNF 定义在最前面
- 修订版：[Revised Report on ALGOL 60 (CACM 1963)](https://www.masswerk.at/algol60/report.htm) —— 修了原版几处歧义，更适合实际研读
- Knuth 的批评：[The Remaining Trouble Spots in ALGOL 60 (CACM 1967)](https://dl.acm.org/doi/10.1145/363791.363818) —— 高德纳挑出报告里所有不严谨的地方，是理解 BNF 局限的最好入口
- Wirth Pascal 论文：[The Programming Language Pascal (1971)](https://www.research-collection.ethz.ch/handle/20.500.11850/68927) —— ALGOL 60 的简化继承者，比原版更适合现代读者

## 关联

- [[BNF]] —— ALGOL 60 报告里诞生的元语言，今天所有语言规范的写法都源于此
- [[hindley-milner]] —— 函数式语言的类型推导，和 ALGOL 60 的命令式路线是两条平行线
- [[lambda-calculus]] —— ALGOL 60 的 call-by-name 思想后来在 lambda 演算 + 惰性求值里复活
- [[mccarthy-lisp]] —— McCarthy 同时是 LISP 作者和 ALGOL 60 报告作者；递归从 LISP 带到 ALGOL
- [[smalltalk-80]] —— OOP 路线，和 ALGOL 60 的"过程 + 块"路线交汇于 Simula → C++/Java
- [[turing-1936]] —— ALGOL 60 的"递归过程"是 Turing 可计算性思想的工程化产物
- [[standard-ml]] —— ML 走 ALGOL 风格的语法 + 函数式语义，是后来 OCaml/Haskell 的起点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[backus-fp-1978]] —— Backus FP 1978 — 把程序从赋值循环里解放出来
- [[dijkstra-goto]] —— Dijkstra 1968 — Go To Statement Considered Harmful
- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[knuth-literate-1984]] —— Literate Programming — 把程序写成给人读的文章
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[scott-strachey-denotational]] —— Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[tomita-glr]] —— Tomita GLR — 让 LR 解析器扛得住歧义文法
- [[unix-1974]] —— UNIX 1974 — 用极小内核做出能用的分时系统
