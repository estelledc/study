---
title: Bi-Abduction — 让静态分析自动猜出函数缺什么前提
来源: Calcagno, Distefano, O’Hearn, Yang, "Compositional Shape Analysis by Means of Bi-Abduction", POPL 2009
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Bi-abduction（**双向溯因**）是一套**让静态分析器自己猜出每个函数"需要什么前提、留下什么副作用"**的算法。日常类比：像一个侦探不仅推凶手是谁（缺的前提），还顺手列出现场没动过的家具（不变的部分），两件事一次完成。

具体地说，传统形状分析要求你先告诉它"这个函数被怎么调用"，它才能往下推。Bi-abduction 反过来：你**只把函数代码丢给它**，它自己反推一份"为了让这段代码不崩，调用者至少要给我一个非空链表"，再附一份"我没动这块堆"。

这就是 **Facebook Infer** 的核心引擎——能在百万行 Java/Objective-C/C 代码上跑分钟级，每天给 Meta 程序员发"你这次提交可能 NPE"的核心理论。

## 为什么重要

不理解 bi-abduction，下面这些事说不通：

- 为什么 2010 年之前的形状分析只能跑几千行代码，2015 年 Infer 能跑 Facebook 全代码库
- 为什么 Infer 不需要你写注解（不像 Coq / Dafny）也能查出空指针
- 为什么 Facebook 2015 年花 1500 万美元收购 Monoidics（这篇论文作者的公司）
- 为什么"分离逻辑"这套学院派理论 7 年内就进了工业 CI

## 核心要点

Bi-abduction 在 **分离逻辑**（[[reynolds-separation-logic]]）的基础上，把"推一个公式"改成"同时推两个未知"。

**分离逻辑回顾**：`H1 * H2` 表示堆被切成两块互不重叠。`{P} c {Q}` 是 Hoare 三元组——执行前堆满足 P，执行后满足 Q。最关键的 **frame rule**：

```
{P} c {Q}
─────────────────  （F 是 c 不碰的那块堆）
{P * F} c {Q * F}
```

**普通溯因（abduction）**：已知 H1，目标 H2，找一个 M 使 `H1 * M ⊢ H2`——即"H1 还差什么才能推出 H2"。

**双向溯因（bi-abduction）**：同时找 **anti-frame M** 和 **frame F**：

```
H1 * M  ⊢  H2 * F
```

- M（anti-frame）= 调用者还必须额外提供的前提——类比：你还欠厨房的那几样材料
- F（frame）= 这段代码没碰、原样保留的那块——类比：厨房里没动过的家具清单

**用法**：分析函数 `f(x)` 时，一句句往下推，每碰到 `x->next` 就发现"我需要 x 是非空 cell"。bi-abduction 把这条要求加进 M。整段代码扫完，得到 `{pre} f(x) {post}` 一对摘要。**不需要谁告诉你 f 怎么被调用**。

## 实践案例

### 案例 1：分析一个最简单的函数

```c
void f(node *x) {
    x->next = 0;
}
```

bi-abduction 推理过程：

1. 起点假设堆是空 `emp`
2. 读到 `x->next` → 需要 x 指向某个 cell，否则崩。bi-abduction 加 M：`x ↦ _`
3. 写完 `x->next = 0` → 后置变成 `x ↦ 0`
4. 输出摘要：`{x ↦ _} f(x) {x ↦ 0}`

**注意**：没有人告诉它 x 应该非空。它自己**反推出来**。

### 案例 2：组合多个函数（compositional）

```c
void g(node *y) { f(y); f(y); }
```

g 调用 f 两次。bi-abduction 用 f 的摘要 `{x ↦ _} f(x) {x ↦ 0}` 拼起来：

- 第一次调用：需要 `y ↦ _`（y 必须指向一个 cell），调完变成 `y ↦ 0`（cell 还在，只是里面的值写成了 0）
- 第二次调用：仍需要 `y ↦ _`——堆上 y 依然指向那个 cell，所以前提继续成立；调完还是 `y ↦ 0`
- 最终摘要：`{y ↦ _} g(y) {y ↦ 0}`

注意：`y ↦ 0` **不是**“y 是空指针”。空指针是“根本没有 cell”；这里是“有 cell，内容为 0”。

**关键**：分析 g 时**没重新看 f 的代码**，只用摘要。这就是 compositional——每个函数独立分析一次，调用时复用结果。百万行代码因此可行。

### 案例 3：链表遍历的递归归纳

```c
void clear(list *l) {
    if (l) { clear(l->next); free(l); }
}
```

bi-abduction 配合**抽象**（把具体堆图归纳成 `list(l)` 谓词）推出：

```
{list(l)} clear(l) {emp}
```

整条链表清干净，堆变空。这是 [[sagiv-shape-analysis]] 的目标，但 Sagiv 法要全程序信息；bi-abduction 只看 clear 一个函数就能给出。

## 踩过的坑

1. **abduction 解不唯一**：`H1 * M ⊢ H2` 可能有无数个 M（M 可以加任何无关谓词）。算法要选**最弱的 M**——只加必要的。否则函数摘要会越滚越大。

2. **frame 也不唯一**：同理，F 要选**最强的**（包含所有无关部分）。bi-abduction 用一套启发式同时优化两边。

3. **不一定能找到摘要**：有些函数（比如带循环的复杂操作）算法找不出来——这时 Infer 会**放弃这个函数**，不报错也不保证正确。这是工程取舍：宁可漏报也不假报。

4. **抽象域要选对**：bi-abduction 本身是框架，配什么谓词（list / tree / DAG）决定能查什么 bug。Infer 用了一套定制谓词来抓 NPE 和资源泄漏。

## 适用 vs 不适用场景

**适用**：

- 大规模代码库的轻量级形状分析（NPE、use-after-free、资源泄漏）
- 每次只能看到 diff 的增量分析（CI 集成）
- 没有完整调用图的库代码分析

**不适用**：

- 需要完全精确证明（用 [[reynolds-separation-logic]] 手动 + Coq）
- 复杂数据结构不变量（红黑树、并查集）—— 抽象域跟不上
- 数值性质（区间、溢出）—— 要换成 [[cousot-abstract-interpretation]] 路线

## 历史小故事（可跳过）

- **2001**：Reynolds-O'Hearn 发表分离逻辑，证明能优雅处理堆，但工具化困难
- **2006**：Distefano-O'Hearn-Yang 写出第一个能跑的形状分析 Smallfoot，但要手标 pre/post
- **2009**：本文——把 abduction 从 Hoare 推向"双向"，第一次让分析器自动推出摘要
- **2009**：作者们成立 Monoidics 公司，把算法做成商业工具 Infer
- **2013**：Facebook 引入 Infer，每天扫所有 Android/iOS 提交
- **2015**：Facebook 收购 Monoidics，开源 Infer
- **至今**：AWS、Mozilla、Spotify、Uber 都在用变体

## 学到什么

1. **"反过来推"是个独立的能力**——演绎是已知前提推结论，溯因（abduction）是已知结论反推前提，bi-abduction 同时干两件
2. **分离逻辑的 frame rule 是工业级分析能 scale 的根因**——它把"我没碰的部分"形式化，从而支持组合
3. **学术 → 工程**这条路在 PL 里走得最快：2009 论文，2013 工业部署，2015 开源
4. **Compositional 是大规模静态分析的必经之路**——任何要求"全程序信息"的方法都进不了 CI

## 延伸阅读

- 论文 PDF：[Calcagno et al. 2009](https://www.cs.ucl.ac.uk/staff/p.ohearn/papers/biabduction-popl09.pdf)（13 页，前 5 页能读懂）
- O'Hearn 综述：[Continuous Reasoning](https://dl.acm.org/doi/10.1145/3209108.3209109) LICS 2018（讲 Infer 怎么落到 CI）
- Infer 开源仓库：[github.com/facebook/infer](https://github.com/facebook/infer)
- [[reynolds-separation-logic]] —— 必读前置：分离逻辑基础
- [[hoare-logic]] —— 更前置：Hoare 三元组

## 关联

- [[reynolds-separation-logic]] —— bi-abduction 的逻辑底座
- [[hoare-logic]] —— 给"前/后置条件"打地基的 1969 论文
- [[sagiv-shape-analysis]] —— 同代竞品，三值逻辑路线，要全程序信息
- [[cousot-abstract-interpretation]] —— 静态分析的统一框架，bi-abduction 是其在分离逻辑上的实例
- [[andersen-pointer-analysis]] —— 经典指针分析，不带 frame 概念
- [[steensgaard-pointer]] —— 更快但更粗的指针分析

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apron-2009]] —— Apron — 把区间/八边形/多面体塞进同一个插槽
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
