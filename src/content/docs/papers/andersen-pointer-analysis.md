---
title: Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
来源: 'Lars Ole Andersen, "Program Analysis and Specialization for the C Programming Language", DIKU PhD Thesis 1994'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Andersen 指针分析是一种**让编译器在不运行程序的情况下，估算每个指针变量可能指向哪些内存对象**的方法。日常类比：像快递公司提前看一遍所有收发件单据，就能画出"哪个快递柜可能进过哪些包裹"的地图——不用真去开柜子。

你写：

```c
int x, y;
int *p = &x;
int *q = p;
```

编译器读完，不用运行就能算出："`p` 一定指向 `x`，`q` 也一定指向 `x`"。

它的写法叫 **inclusion-based**（基于子集关系）：每条赋值翻译成"指向集合 A 必须包含集合 B"的约束，然后反复求解直到再也变不动。LLVM、SVF、Clang Static Analyzer 这些今天还在用的工具，里面那一层"may-alias 分析"就是 Andersen 思路的后代。

## 为什么重要

不理解 Andersen，下面这些事都没法解释：

- 为什么 LLVM 知道 `*p` 和 `*q` 可能是同一块内存（这叫别名分析），从而决定能不能优化掉一次读
- 为什么 Clang Static Analyzer 能告诉你"用户输入流到了 `system()`"——背后要先知道指针指向哪
- 为什么 C 比 Java 难做指针分析——C 有 `&x`、有指针运算、有任意类型转换
- 为什么有人愿意用更慢但更准的算法，而不是用 Steensgaard 的近线性方案

## 核心要点

Andersen 把指针分析拆成 **三件事**：

1. **把赋值翻译成约束**：每条 C 语句变成一个集合关系。`a = &b` 翻成"b ∈ pts(a)"（b 这个对象在 a 的指向集里）；`a = b` 翻成"pts(b) ⊆ pts(a)"（b 能指到的，a 也能）。类比：把"小明从小王那拿过包裹"翻成"小王收过的包裹小明都可能拿到"。

2. **解约束 = 反复传播到不动点**：维护一张图，每个节点是一个变量的 pts 集合。新事实进来就推给所有"应该包含我"的邻居。直到没人再变化，叫 worklist 算法。类比：一群人轮流核对账本，每次发现差就抄给该抄的人，最后所有账本都一致。

3. **load / store 让图边动态长出来**：`a = *b` 和 `*a = b` 这两类约束，需要先知道 b 指向谁才能知道边怎么连——所以求解过程中**约束图本身会变大**。这是 Andersen 比纯静态图算法难的地方。

## 实践案例

### 案例 1：四类约束怎么写

```c
int x;            // 内存对象 x
int *p, *q, **r;  // 三个指针
p = &x;           // 1. 取地址：x ∈ pts(p)
q = p;            // 2. 拷贝：pts(p) ⊆ pts(q)
*r = p;           // 3. store：把 pts(p) 加到 r 指向的所有对象的 pts 里
q = *r;           // 4. load：把 r 指向的所有对象的 pts 加到 pts(q) 里
```

逐部分解释：

- 前两类是**静态边**——编译时就能直接连
- 后两类是**动态边**——必须先解出 `pts(r)` 才知道边连去哪。所以解的过程图会膨胀

### 案例 2：worklist 一步步解

考虑前面那段 `p = &x; q = p;`，约束求解过程：

```text
初始：pts(p) = {}, pts(q) = {}

第 1 轮：处理 p = &x
  → pts(p) 加入 x，得 pts(p) = {x}
  → 把 p 推进 worklist（提示：p 变了）

第 2 轮：从 worklist 取出 p
  → 查依赖：q = p 意味着 pts(p) ⊆ pts(q)
  → 把 {x} 推给 q，得 pts(q) = {x}
  → 把 q 推进 worklist

第 3 轮：从 worklist 取出 q
  → q 没有下游依赖，跳过

worklist 空 → 完成
```

整个过程没运行程序，纯靠"加并集 + 推送邻居"算出 `q` 也能指到 `x`。

### 案例 3：和 Steensgaard 的差别

```c
p = &x;
q = &y;
r = p;    // pts(p) ⊆ pts(r)
r = q;    // pts(q) ⊆ pts(r)
```

Andersen 算出：

```text
pts(p) = {x}
pts(q) = {y}
pts(r) = {x, y}
```

精度好——p 不会被污染。

Steensgaard 用 union-find 直接把 p、q、r 合成一个等价类：

```text
pts(p) = pts(q) = pts(r) = {x, y}
```

精度低但近线性时间。这就是 inclusion vs unification 的核心差——Andersen 多花时间换精度。

## 踩过的坑

1. **默认 flow-insensitive，循环里指针被反复重赋值时 pts 集合会越积越大**——分析不区分先后顺序，把所有写并集起来。需要 flow-sensitive 扩展才能更准
2. **默认 context-insensitive，`id(x)` 在两处调用会把两侧参数 pts 合并**——污染传染。Whaley 的 BDDBDDB、k-CFA 之类是补救手段
3. **默认 field-insensitive，`p->a = x; p->b = y` 之后查 `p->a` 会把 y 也算进去**——把 struct 当成一格。补救是 field-sensitive 变体（每字段单独建节点）
4. **函数指针 + 间接调用让 callgraph 在求解中长出来**，简单 worklist 实现会漏掉新连入的边，需要在每次新增 pts 时回查 callsite 重新挂约束

## 适用 vs 不适用场景

**适用**：

- 编译器优化里的 may-alias 分析（决定能不能消除一次读、能不能向量化）
- 静态安全工具的污点跟踪基础层（用户输入有没有到危险 sink）
- 中等规模 C / C++ 项目（数十万行内）做一次全程序分析
- 学术原型（思路简单，约束图清晰）

**不适用**：

- 千万行级超大代码库且要交互响应——O(n^3) 撑不住，改用 Heintze-Tardieu 或 Hardekopf-Lin 的快速解法
- 需要极高精度做安全证明——Andersen 的几个 insensitive 默认会丢精度，要叠多种 sensitivity
- 完全动态语言（Python、JS）——他们的"指针"含义不一样，要用不同的抽象（如 type inference 风格）
- 短小脚本 / 单文件作业——杀鸡用牛刀，简单 grep 就够了

## 历史小故事（可跳过）

- **1994 年**：Lars Ole Andersen 在哥本哈根大学（DIKU）写博士论文，本来主线是 C 程序的部分求值（partial evaluation），但发现没指针分析就走不下去，于是把"用 inclusion 约束做 points-to"做成独立一章
- **1996 年**：Bjarne Steensgaard 在 POPL 给出 union-find 版本，几乎线性时间但精度低；从此学界把两者并称两大流派
- **2000 年代**：Heintze-Tardieu 用更聪明的图编码、Hardekopf-Lin 用 BDD 把 Andersen 推到百万行级仍可跑
- **2010 年后**：LLVM、SVF、Clang Static Analyzer 把 Andersen 风格做成开箱即用的库，直到今天

## 学到什么

1. **不运行程序也能算出指针行为**——只要把赋值翻译成集合关系，再求闭包
2. **精度 vs 速度永远在拉锯**——Andersen 选 subset（精度），Steensgaard 选 equality（速度），后人补各种 sensitivity 在两端之间找点
3. **约束求解的图会自己长大**——load / store 让 Andersen 比纯数据流算法多一层挑战
4. **几乎所有现代静态分析工具的底层都能追到这套思路**——一篇博士论文影响了 30 年的工程实践

## 延伸阅读

- 视频教程：[CS 6120 — Pointer Analysis](https://www.cs.cornell.edu/courses/cs6120/2020fa/lesson/12/)（康奈尔编译课，把 Andersen 和 Steensgaard 一起讲）
- 论文 PDF：[Andersen 1994 PhD 全文](https://www.cs.cornell.edu/courses/cs711/2005fa/papers/andersen-thesis94.pdf)（300 多页，重点看第 4-5 章）
- 工业实现：[SVF — Static Value Flow](https://svf-tools.github.io/SVF/)（基于 LLVM 的 Andersen / 衍生算法集合）
- 综述：[Smaragdakis & Balatsouras "Pointer Analysis"](https://yanniss.github.io/points-to-tutorial15.pdf)（2015 年综述把流派理清）
- [[cousot-abstract-interpretation]] —— 静态分析的统一数学框架，Andersen 是其中一种具体实例

## 关联

- [[cousot-abstract-interpretation]] —— 抽象解释为指针分析提供数学基础（pts 集合就是一种抽象域）
- [[kildall-dataflow]] —— 早期数据流框架；Andersen 把它扩展到带指针的语言
- [[ssa]] —— 静态单赋值形式给 Andersen 的实现提供更干净的输入
- [[llvm]] —— LLVM 内置多种 Andersen 风格 pass（cflaa、ds-aa 等），是当代主要落地场
- [[self-pic]] —— Self / 内联缓存解决的是动态分派问题，与静态指针分析互补：一个运行时观察、一个编译时推断
- [[compiler-errors]] —— 错误信息要指清根因，前提是分析能精确追踪指针来源
- [[lambda-calculus]] —— 函数式语言没有可变指针，Andersen 这套问题在 λ 演算里是另一回事

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[avgustinov-codeql-2016]] —— QL / CodeQL — 用面向对象外壳写可扩展代码查询
- [[differential-datalog]] —— DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
- [[infer-biabduction]] —— Bi-Abduction — 让静态分析自动猜出函数缺什么前提
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[slam-microsoft]] —— SLAM — 让 Windows 驱动 bug 自己撞到工具上
- [[souffle-datalog]] —— Soufflé — 把 Datalog 编译成 C++ 让程序分析跑得动
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
