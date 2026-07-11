---
title: Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
来源: 'Bjarne Steensgaard, "Points-to Analysis in Almost Linear Time", POPL 1996'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Steensgaard 指针分析是一套**让编译器极快猜出"每个指针变量可能指向谁"**的算法。日常类比：像在大公司搞同名归并——只要两个员工有任何一次被指认成"可能是同一个人"，就立刻把他们俩的所有信息合并到一张档案里，从此再不分开。

具体到代码场景，编译器看到这样一行：

```c
p = q;
```

它不会去精算 `p` 和 `q` 当下各自指向哪些对象，而是直接说："**这两个指针从今往后是一伙的**"，然后用一个叫 union-find（并查集）的数据结构把它们合并。等所有赋值都扫一遍，每个指针就能查到自己所属的那个等价类；类里所有对象合起来，就是它的 **may-points-to**（"可能指向"集合，宁可多猜、不能漏猜）。

代价是**粗**——合并永远不可逆；好处是**快**——全程序一遍接近线性，百万行级代码常能秒级出结果。Soot 等分析框架把 unification（等价合并）模式当粗筛默认；LLVM 今天的 `-basic-aa` **不是**本文算法（见案例 2）。

## 为什么重要

不理解 Steensgaard，下面这些事都说不清：

- 为什么大项目编译开 `-O2` 不会卡半小时——指针分析必须先跑且必须可扩展
- 为什么编译器的"别名分析"经常一边粗一边快、另一边精一边慢——这是同一道光谱的两端
- 为什么 1996 年的等价合并思路到今天仍是工业粗筛的标尺——精度可换性能的工程权衡是永恒话题
- 为什么类型推导（Hindley-Milner）和指针分析底层是一个数据结构——union-find 把它俩串起来

## 核心要点

Steensgaard 的做法可以拆成 **三步**：

1. **把指针当类型**：每个变量贴一张"类型卡片"，记录"我这个指针指向什么类型的东西"。类比：每个员工先发一张空白工牌，上面写"我属于哪个组"。

2. **赋值就是等价约束**：读到 `p = q`，就要求 `type(p) = type(q)`。如果两边卡片不一样，**立刻合并**。这一步用 union-find（Tarjan 的并查集），合并一次几乎是常数时间。

3. **取地址 / 解引用同样翻译成约束**：`p = &x` 要求 `*type(p) = type(x)`；`*p = q` 要求 `type(*p) = type(q)`。每条赋值产生 O(1) 个约束，整体扫一遍 O(N·alpha(N))，alpha 是反阿克曼函数（实际上 ≤ 4），所以叫**几乎线性**。

合一结束后，每个等价类里的所有对象就是这一类指针的 may-points-to 集合。

## 实践案例

### 案例 1：最小赋值链怎么合并

源代码：

```c
int x, y, z;
int *p, *q, *r;
p = &x;
q = &y;
p = q;       // 合并发生
r = p;
```

**逐部分解释**：

- 前两行：`p` 等价类 = {x}，`q` 等价类 = {y}
- 第三行 `p = q`：合并 → `p` 和 `q` 共享一个等价类 = {x, y}
- 第四行 `r = p`：再合并 → `r`、`p`、`q` 一起 = {x, y}

最终编译器认为 `r` 可能指向 x 或 y，**虽然实际只可能指 y**。这就是精度损失。

### 案例 2：手工走一遍 union-find（别把 LLVM BasicAA 当成它）

LLVM 文档里的 `-basic-aa` 是**局部、无状态**的启发式（区分不同全局/栈对象等），**不是** Steensgaard。历史上 LLVM 另有 `-steens-aa`，后已移出主线。下面用伪代码跟做本文算法：

```text
约束: p=&x, q=&y, p=q
1. union(points_to(p), x)   →  p 的目标类含 x
2. union(points_to(q), y)   →  q 的目标类含 y
3. union(p, q)              →  指针类合并，目标类也并成 {x,y}
查表: find(p) 的 may-points-to = {x,y}
```

工程上常见的是：**先跑 unification 粗筛，再对"可能同名"的边升级到 Andersen / CFL**——先广筛、再精挑。

### 案例 3：分析一个简单 swap 函数会发生什么

```c
void swap(int **a, int **b) {
  int *t = *a;
  *a = *b;
  *b = t;
}
```

**逐部分解释**：

1. `t = *a`：把 `t` 与 `*a` 的目标类合并
2. `*a = *b`：再把 `*a` 与 `*b` 合并 → `t`、`*a`、`*b` 进同一类
3. `*b = t`：已在同类，无新分裂

结果：**断不出**调用方两个独立变量不同名。这是 **flow-insensitive**（不看语句先后，像把整份代码摊成一堆便签）+ **context-insensitive**（不问是谁调用的，所有调用点一锅炖）的代价。

## 踩过的坑

1. **一次合并永久合并**：合并是单向的，做完就回不去。后续代码即使证明了 `p` 和 `q` 没关系，等价类也不再分裂——精度会随程序变长持续掉。

2. **flow-insensitive 忽略顺序**：先 `a = b` 再 `a = c` 跟反过来在 Steensgaard 看是一样的，时序信息丢失，循环里的指针几乎全混在一起。

3. **context-insensitive 函数糊一团**：函数被多处调用时，所有调用点的实参形参一锅炖。递归或回调密集的代码（C 里的回调、Java 里的 listener）精度差到几乎无用。

4. **字段不区分**：经典版本里结构体的不同字段共享一张卡片，链表 `node->next` 和 `node->prev` 会被当成同一个——分析有指针字段的数据结构时容易过度合并。

## 适用 vs 不适用场景

**适用**：
- 大规模代码（约 10^5–10^6 行 C / Java 字节码）的第一遍粗筛，目标是 O(N·α(N)) 量级出 may-alias
- 分析框架里的 unification 基线（如 Soot Spark 的等价合并模式）
- 只需要保守 may-alias 的优化（如简单 dead store elimination）
- 工业级静态分析工具的快速预扫，再把"可能同名"边交给更精算法

**不适用**：
- 需要 must-alias 信息（确定两个指针就是同一个）
- 安全关键的精确点分析（污点跟踪、漏洞挖掘要更精）
- 高度依赖回调 / 多态的 OO 程序——精度低到无用
- 函数指针密集或必须字段敏感的代码——会一口气合到失真；应换 Andersen / CFL / 字段敏感变体

## 历史小故事（可跳过）

- **1994 年**：Lars Andersen 在博士论文里提出 inclusion-based 做法，精度高但 O(N^3) 量级，分析大程序会卡死
- **1996 年**：Bjarne Steensgaard 在 POPL 发表本文，把分析变成类型推导，用 union-find 压到 almost-linear。两条路线从此并立
- **1996 年也是**：Hindley-Milner 那套 union-find 求解 unification 约束的方法已成熟 14 年，Steensgaard 把它的"骨架"原样搬到了指针分析
- **2000 年代**：Soot 等把 unification-based 分析做成可扩展默认粗筛；LLVM 曾提供独立的 `-steens-aa`，后移出主线——勿与今日 `-basic-aa` 混淆
- **2010 年代以后**：研究界继续在两条路线之间找折中（field-sensitive Steensgaard、staged inclusion），工业上仍常见"先等价合并、再细化"

## 学到什么

1. **粗一点的算法换两个数量级速度，是工程上极合算的交易**——不是所有问题都需要最精
2. **同一个数据结构（union-find）能解类型推导也能解指针分析**——背后都是"等价闭包"问题
3. **flow-/context-insensitive 是一个滑块**：精度和成本永远在跷跷板的两端
4. **POPL 里的"理论"经常 5-10 年后就成产品默认开关**——离工业并不远

## 延伸阅读

- 视频教程：[CMU 15-411 Compilers — Pointer Analysis](https://www.cs.cmu.edu/~rjsimmon/15411-f15/) （讲 Andersen vs Steensgaard 对比）
- 论文 PDF：[Steensgaard 1996 POPL](https://www.cs.cornell.edu/courses/cs711/2005fa/papers/steensgaard-popl96.pdf)（12 页，定义 + 算法 + 实验）
- 工程视角：[LLVM Alias Analysis 文档](https://llvm.org/docs/AliasAnalysis.html)（对照 `-basic-aa` 与历史上的 `-steens-aa`）
- [[andersen-pointer-analysis]] —— 同年代的 inclusion-based 对照组
- [[hindley-milner]] —— 同样用 union-find 求 unification 的近亲

## 关联

- [[andersen-pointer-analysis]] —— inclusion-based 指针分析，精度高一档但 O(N^3)，与本文是一对孪生
- [[hindley-milner]] —— 同样用 union-find 求 unification 约束，思路骨架被本文借走
- [[cousot-abstract-interpretation]] —— 给静态分析的统一数学框架，Steensgaard 可视为其中一个最粗的抽象域
- [[tofte-talpin-regions]] —— 区域类型推断也是 union-find 求等价类，和指针分析血脉相通
- [[llvm]] —— 别名分析栈的宿主；历史上有过 `-steens-aa`，今日默认 `-basic-aa` 是另一套局部分析
- [[ssa]] —— SSA 形式让指针分析的赋值语句更规整，两者常一起用
- [[compiler-errors]] —— 指针分析报错与类型报错一样，错位常常远离根因

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[cousot-halbwachs-polyhedra-1978]] —— Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[infer-biabduction]] —— Bi-Abduction — 让静态分析自动猜出函数缺什么前提
- [[llvm]] —— LLVM — 模块化编译器框架
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[souffle-datalog]] —— Soufflé — 把 Datalog 编译成 C++ 让程序分析跑得动
- [[ssa]] —— SSA — 静态单赋值形式
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
