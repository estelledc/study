---
title: WAM — 让 Prolog 跑得像编译型语言的抽象机器
来源: D.H.D. Warren, "An Abstract Prolog Instruction Set", SRI Technical Note 309, 1983
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

WAM（**W**arren **A**bstract **M**achine）是一台**专门为 Prolog 量身造的虚拟机**。日常类比：Java 有 JVM、.NET 有 CLR、Python 有 CPython VM——Prolog 有 WAM。

你写一段 Prolog：

```prolog
ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).
```

WAM 编译器把它翻译成一串指令——大概长这样：

```
ancestor/2:
  try_me_else L2
  get_variable X3, A1
  get_variable X4, A2
  put_value X3, A1
  put_value X4, A2
  call parent/2
  proceed
L2:
  trust_me
  ...
```

运行时 WAM 像 CPU 跑机器码一样，挨条指令执行——**不再"解释"，是真编译**。

## 为什么重要

不理解 WAM，下面这些事都没法解释：

- 为什么 1980 年代日本"第五代计算机计划"敢押注 Prolog——因为 Warren 1983 证明它能跑得快
- 为什么 SWI-Prolog / SICStus / YAP / GNU Prolog 内核长得像——它们都是 WAM 实现
- 为什么 Prolog 教材讲 "choice point" / "trail" / "environment frame" 这些词——这些都是 WAM 的零件
- 为什么逻辑编程没死——靠 WAM 把性能拉到能用的水平，今天还在 datalog / answer-set programming 里用

## 核心要点

WAM 把 Prolog 执行拆成 **三件硬件级别的事**，对应三组数据结构：

1. **合一（unification）变成指令**：Prolog 的 `?- p(X, foo)` 跟事实 `p(a, Y)` 怎么对齐？WAM 把这一步拆成 `get_constant` / `get_variable` / `unify_value` 等小指令，**一次合一 = 几条指令**。原本要跑一遍递归算法的事，被压扁成线性指令流。

2. **选择点（choice point）管回溯**：Prolog 多条规则要逐个试，试失败要回退。WAM 用 `try_me_else / retry_me_else / trust_me` 三条指令在栈上推一个 "选择点"——里面记着"如果这条失败，去哪里、寄存器恢复成什么"。

3. **三段内存**：
   - **局部栈**（local stack）：放函数调用帧（environment）和选择点
   - **堆**（heap）：放结构、列表这种活得比一次调用久的东西
   - **trail**：日志，专门记"哪些变量被绑定过了"——回溯时拿 trail 反向把变量解绑

加上 8 个寄存器（A1..An 传参、X1..Xn 临时、Y1..Yn 永久局部、E 当前环境帧、B 当前选择点、HP 堆顶、TR trail 顶、P 程序计数器），整台机器就齐了。

## 实践案例

### 案例 1：一条事实编译成什么

```prolog
fact: parent(tom, bob).
```

WAM 编译后：

```
parent/2:
  get_constant tom, A1
  get_constant bob, A2
  proceed
```

调用 `?- parent(tom, bob)` 时，调用者把 `tom` 装进 `A1`、`bob` 装进 `A2`，跳到 `parent/2` 标签——`get_constant tom, A1` 检查 A1 是不是 tom，是就过；两个都过就 `proceed`（返回）。

**没有解释器循环、没有树遍历**——这就是编译。

### 案例 2：回溯怎么走

```prolog
color(red).
color(green).
color(blue).
?- color(X).
```

WAM 编译：

```
color/1:
  try_me_else L2
  get_constant red, A1
  proceed
L2:
  retry_me_else L3
  get_constant green, A1
  proceed
L3:
  trust_me
  get_constant blue, A1
  proceed
```

第一次问 `?- color(X)`：`try_me_else` 推一个选择点（"如果失败回到 L2"），然后绑 `X = red` 返回。用户按 `;` 要下一个 → 触发回溯：跳到 L2 → `retry_me_else` 改选择点目的地为 L3，把 X 解绑 → 绑 `X = green` 返回。再按 `;` → 跳到 L3 → `trust_me` 弹掉选择点（"我是最后一条了"）→ 绑 `X = blue`。

### 案例 3：现代影子

40 年后你还能在工业 Prolog 里看见 WAM 的零件：

- SICStus Prolog：编译到字节码（即 WAM 指令的二进制版本）+ JIT 到机器码
- SWI-Prolog：解释 WAM 字节码，文档里直接列指令名
- Mercury：高级 IR 叫 HLDS、低级 IR 叫 LLDS——LLDS 就是 WAM 加了类型信息的扩展版

## 踩过的坑

1. **直接读 Warren 1983 原报告会窒息**：30 页全是缩写指令、寄存器编号和不带例子的伪代码。先读 Aït-Kaci 的《Warren's Abstract Machine: A Tutorial Reconstruction》（1991，免费 PDF）——他重写了一遍，加了图、加了步进例子。

2. **环境帧 vs 选择点共用一个栈**：两种东西都堆在 local stack 上，但生命周期不一样——环境帧跟函数调用走，选择点跟回溯走。栈裁剪逻辑（cut、deallocate）一旦把规则搞混就内存错乱。

3. **last call optimization（LCO）必须做**：尾递归 Prolog 程序如果不优化，每次递归推一个新环境帧，链表跑 1000 个就爆栈。WAM 必须在最后一个调用前 `deallocate` 当前帧。

4. **trail 是反向日志，不是审计日志**：trail 只记"已经被绑定的未绑定变量的地址"——回溯时拿这个地址把变量恢复成未绑定。如果误以为它记的是新旧值对，写出来的实现会在回溯后留下脏数据。

## 适用 vs 不适用场景

**适用**：

- 实现 Prolog 或 Prolog 方言（SWI / SICStus / YAP / GNU Prolog 都是）
- 实现 Datalog 引擎（Souffle 用类似思路但简化了选择点）
- 学逻辑编程的执行模型——WAM 是"逻辑 → 机器"的最干净桥梁

**不适用**：

- 现代约束逻辑编程（CLP）——需要更复杂的约束传播，WAM 只是底座，要套一层
- 并行/并发 Prolog（Concurrent Prolog、Parlog）——选择点在并行下语义全变，要重新设计
- 函数式语言——HM 类型推导和 WAM 完全两条线，套不上去
- 直接当 JVM 用——WAM 没有对象、没有 GC（只有堆截断），不通用

## 历史小故事（可跳过）

- **1972 年**：Colmerauer 在 Marseille 写出第一版 Prolog，解释器，慢
- **1977 年**：Warren 在爱丁堡写 **DEC-10 Prolog 编译器**——第一个真正快的 Prolog，但只能跑在 DEC-10 这一台机器上
- **1983 年**：Warren 在 SRI 把这套机器经验抽象出来——指令集、寄存器、内存布局都跟具体硬件解耦，就是 WAM
- **1991 年**：Hassan Aït-Kaci 写《Warren's Abstract Machine: A Tutorial Reconstruction》，让后人能看懂 1983 这份报告

WAM 是"先有工业实践，再回头总结成理论"的典型——和 LLVM IR 的故事像极了：先把好的设计做出来，后人才能学。

## 学到什么

1. **虚拟机不必等到 Java**——1983 年 Warren 已经把"指令集 + 寄存器 + 内存模型"这一整套搬给 Prolog
2. **回溯不是黑魔法**——拆成 try / retry / trust 三条指令 + trail 这本日志就完事了
3. **抽象机器是连接"理论"和"工程"的桥**——Prolog 的逻辑语义在上面，CPU 在下面，WAM 是中间夹层
4. **40 年后还在用**——好抽象不会过时；今天写 SWI-Prolog 内核还能看到 1983 年的指令名

## 延伸阅读

- 教程书：[Aït-Kaci 1991 — Warren's Abstract Machine: A Tutorial Reconstruction](http://wambook.sourceforge.net/wambook.pdf)（免费 PDF，把原报告重写了一遍，带图带例子）
- 原始报告：[Warren 1983 — An Abstract Prolog Instruction Set](https://www.ai.sri.com/pubs/files/641.pdf)（30 页，密度极高，建议先读 Aït-Kaci 再回来）
- 实现参考：[SWI-Prolog 内部指令文档](https://www.swi-prolog.org/pldoc/man?section=vmi)（看现代 WAM 长什么样）
- [[prolog-colmerauer]] —— Prolog 的诞生，WAM 服务的语言
- [[landin-secd]] —— 第一个抽象机器，WAM 的精神祖先

## 关联

- [[prolog-colmerauer]] —— Prolog 1972；WAM 是它 11 年后的执行引擎
- [[landin-secd]] —— SECD 机器（1964）是抽象机器范式的开山之作，WAM 学了它的"指令 + 栈"思路
- [[mccarthy-lisp]] —— LISP 1960 是 WAM 之前最早的"高级语言 + 编译器"案例，Warren 的 DEC-10 编译器借鉴过
- [[lambda-calculus]] —— 函数式语言的执行模型基础；WAM 是逻辑式语言的对应
- [[hindley-milner]] —— 函数式那条线的"自动推类型"，跟 WAM 同期、同样把"理论 → 工程"打通
- [[llvm]] —— 现代抽象机器的代表，跟 WAM 的设计哲学一脉相承（先做好用，理论后补）
- [[ssa]] —— 现代编译器中间表示；WAM 没用 SSA 但解决了类似问题（指令级中间形式）
- [[graalvm-truffle]] —— 现代多语言 VM；WAM 是单语言 VM 的代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[souffle-datalog]] —— Soufflé — 把 Datalog 编译成 C++ 让程序分析跑得动
