---
title: Prolog 的诞生 — 让逻辑式子直接当程序跑
来源: Colmerauer & Roussel, "The Birth of Prolog", HOPL-II 1993
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Prolog（**PRO**grammation en **LOG**ique）是 1972 年法国 Marseille 团队搞出来的一种**写逻辑式子就能跑**的编程语言。日常类比：你不告诉电脑"怎么找答案"，只告诉它"答案要满足哪些条件"，它自己回头去搜。

你写：

```prolog
parent(tom, bob).
parent(bob, ann).
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
```

然后问：

```prolog
?- ancestor(tom, ann).
true.
```

你**没写循环、没写递归终止、没写搜索**。Prolog 自己拿着规则去试。

## 为什么重要

不理解 Prolog 这条线，下面这些事都没法解释：

- 为什么"逻辑编程"这个范式存在——它不是函数式、不是面向对象，是第三种
- 为什么数据库的 Datalog、配置语言的 Datomic / Souffle、定理证明器（Coq / Lean）背后都有 Prolog 的影子
- 为什么 1980 年代日本砸钱做"第五代计算机"，用的是 Prolog 不是 C
- 为什么自然语言处理早期框架长得像 `sentence --> noun, verb.`——那是 DCG，从 Prolog 里长出来的

## 核心要点

Prolog 把"自动定理证明"剪到一个**够用 + 能跑** 的子集，三件事缺一不可：

1. **限定到 Horn 子句**：每条规则最多一个"结论"，形如 `H :- B1, B2, ..., Bn.`（H 在 B1...Bn 都成立时为真）。完整一阶逻辑难求；**命题** Horn-SAT 可线性判定，**一阶**定子句靠下面的 SLD 搜索——半可判定，但"够用就能跑"。

2. **SLD 归结 + 深度优先回溯**：要证 H，就找一条规则把 H 拆成子目标 B1...Bn，从左到右挨个证；某个失败就往回退（backtrack）换另一条规则。默认无 memo，所以左递归会炸。

3. **合一（unification）**：参数怎么匹配？不是简单等号，是"找一组变量赋值让两边长得一样"。`f(X, b)` 和 `f(a, Y)` 合一得 `X=a, Y=b`。这是 Robinson 1965 的算法，Prolog 全靠它。

整套机制叫 **SLD-resolution**（Selective Linear Definite-clause）。

## 实践案例

### 案例 1：家谱推理（最经典入门）

```prolog
parent(tom, bob).
parent(bob, ann).
parent(bob, pat).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

?- ancestor(tom, X).   % 谁是 tom 的后代？
X = bob ;
X = ann ;
X = pat.
```

按 `;` 让它继续找下一个解。Prolog 自己回溯所有可能。**你只写了"什么是祖先"，没写"怎么搜"**。

### 案例 2：DCG 解析自然语言

Prolog 内建语法 `-->` 让你写文法直接当解析器：

```prolog
sentence --> noun_phrase, verb_phrase.
noun_phrase --> [the], noun.
verb_phrase --> verb, noun_phrase.
noun --> [cat] ; [dog].
verb --> [sees] ; [chases].

?- sentence([the, cat, sees, the, dog], []).
true.
```

`-->` 编译成普通子句，自动拼上"剩余 token 列表"参数。这个特性后来发展成 **DCG（Definite Clause Grammar）**，是早期 NLP 标配。

### 案例 3：八皇后用约束求解

Colmerauer 的 Prolog II/III 把**约束**加进逻辑编程（有理树、布尔等域），后来长出 **CLP** 分支；有限域 **CLP(FD)** 是其中常用的一种。现代 SWI-Prolog 入口是 `library(clpfd)`——你只声明约束，求解器自己搜：

```prolog
:- use_module(library(clpfd)).

queens(N, Qs) :-
    length(Qs, N),
    Qs ins 1..N,   % 每个皇后的列在 1..N
    safe(Qs),      % 两两不同列、不同对角线
    label(Qs).     % 让求解器给变量赋值
```

白话：**声明"要满足什么"，别手写搜索循环**。这种模式直接演化出今天 SAT/SMT 求解器的用法。

## 踩过的坑

1. **左递归无限递归**：`path(X,Y) :- path(X,Z), edge(Z,Y).` 这一条放在前面，Prolog 会无限展开第一个 `path` 子目标。教科书第一章的坑，因为 SLD 是深度优先 + 从左到右，没有 memoization。

2. **cut（`!`）破坏纯逻辑语义**：cut 让回溯停在某点。加上它程序能跑，但"子句顺序无关"的承诺就没了——调试时你要在脑子里跑一遍执行流，跟过程式语言没差别。

3. **negation as failure ≠ 经典否定**：`\+ G` 表示"G 证明失败"。对完全实例化的目标 OK，但对带未知变量的目标会给出不健全答案——经典逻辑的"非"和"找不到证明"不是一回事。

4. **occurs check 默认关闭**：`X = f(X)` 在标准 Prolog 里**直接成功**，建出一个无限循环结构。打印它会死循环。要安全得手动用 `unify_with_occurs_check/2`。

## 适用 vs 不适用场景

**适用**：
- 知识表示 + 规则推理（家谱、医学诊断、配置规则）
- 符号计算 + 模式匹配（编译器后端的代码生成、类型检查器）
- 解析与转换（DCG 写文法 + 抽象树构造一气呵成）
- 约束求解（CLP-FD 调度、排课、谜题）

**不适用**：
- 数值密集计算（Prolog 不擅长浮点循环）
- 需要可预测性能的系统编程（回溯成本不可见）
- 大规模数据处理（声明式但执行模型隐藏太多，难调优）
- 命令式状态机为主的业务代码（用 cut 救场就失去优势了）

## 历史小故事（可跳过）

- **1965 年**：Robinson 提出归结原理（resolution）+ 合一算法，给一阶逻辑找到一个"半判定"过程。
- **1969 年**：Colmerauer 在蒙特利尔做 Q-systems，一种把字符串改写规则也写成项的语言。
- **1971 年**：他回到 Marseille，想把英法翻译做成"用一阶逻辑写规则"的形式，遇到 Kowalski（爱丁堡），两人讨论"Horn 子句的过程式解释"。
- **1972 年夏**：Roussel 用 Algol-W 写第一版 Prolog 解释器；Battani 和 Meloni 同年用 Fortran 重写。"Prolog" 这个名字是 Roussel 的妻子建议的（PROgrammation en LOGique）。
- **1977 年**：David Warren 在爱丁堡做 DEC-10 Prolog 编译器，性能追上 Lisp，奠定现代语法（Edinburgh syntax）。1983 年发表 **WAM**（Warren Abstract Machine），所有现代 Prolog 实现的标准底座。
- **1981-1992**：日本"第五代计算机"项目（ICOT）把 Prolog 当核心语言，砸了 5 亿美元。项目本身没成功，但 Prolog 因此成为 1980s AI 代名词。
- **1987 年**：Colmerauer 把约束扩展到有理数 / 布尔域，Prolog III 诞生；后来发展为 **CLP（Constraint Logic Programming）** 整个分支。

## 学到什么

1. **逻辑也能当程序跑**——这是 Prolog 给世界最大的礼物。前提是限定到 Horn 子句 + 接受 SLD 的搜索顺序。
2. **声明 vs 执行的张力**：理想是"只写声明"，现实是 cut / 子句顺序 / 左递归这些"执行细节"还是会泄露。完全声明式很难做到。
3. **合一是个被低估的算法**：现代类型推导（HM）、模板元编程、IDE 重构都用合一的变体。
4. **领域驱动出语言**：Prolog 是为做 NLP 才发明的，不是先有"逻辑编程"再找用途。这跟 Lisp（为做 AI）、SQL（为做查询）一样——好语言都是被某个具体问题逼出来的。

## 延伸阅读

- 原文 PDF：[The Birth of Prolog (1992)](https://softwarepreservation.computerhistory.org/prolog/marseille/doc/Roussel-Colmerauer-1992.pdf)（HOPL-II 历史回顾，30 页，故事性很强）
- 入门教材：[Learn Prolog Now!](https://www.learnprolognow.org/)（免费在线，前 6 章看完能写小程序）
- 现代实现：[SWI-Prolog](https://www.swi-prolog.org/)（开源，跨平台，CLP-FD 内置）
- WAM 内幕：Hassan Aït-Kaci, "Warren's Abstract Machine: A Tutorial Reconstruction"（1991，免费 PDF）

## 关联

- [[mccarthy-lisp]] —— 同时代的另一种"AI 语言"，Prolog 是它的逻辑学版对手
- [[lambda-calculus]] —— Lisp 的数学基础是 λ-演算；Prolog 的对应物是一阶逻辑 + 归结
- [[landin-secd]] —— 为函数式做了什么，WAM 为 Prolog 做了什么
- [[kahn-natural-semantics]] —— 用推理树写求值规则，跟 Prolog 子句结构同源
- [[hoare-logic]] —— 把"程序对不对"变成证明；Prolog 把"证明"变成程序
- [[godel-1931]] —— 一阶逻辑的能力边界，Prolog 走到的就是这个边界内的实用片段
- [[turing-1936]] —— Prolog 是 Turing-complete 的；SLD + cut 足以模拟图灵机
- [[lean-prover]] —— 现代定理证明器，自动化战术里仍能看到 Prolog 风格的回溯
- [[martin-lof-itt]] —— 类型论里的"项搜索"和 Prolog 的"目标搜索"是表亲

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[avgustinov-codeql-2016]] —— QL / CodeQL — 用面向对象外壳写可扩展代码查询
- [[proverif-2001]] —— ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器
