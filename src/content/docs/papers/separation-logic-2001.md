---
title: Separation Logic: 指针和堆的推理逻辑
来源: 'https://www.separationlogic.org/'
日期: 2026-06-13
分类: 形式化方法
子分类: formal-verification
provenance: pipeline-v3
---

## 是什么

Separation Logic 是 **2001 年 O'Hearn、Reynolds 和 Bornat 提出的一种逻辑系统**，专门用来推理"指针操作和堆内存"——也就是程序里最让人头疼的那部分：`malloc`、`free`、链表操作、野指针。

日常类比：想象你要管一间超大的仓库，里面全是带编号的储物柜。普通逻辑会说"柜子里有什么我知道"，但不说"这是谁的柜子"。Separation Logic 的核心想法是：**给每个柜子贴上"归属标签"**，然后用一个特别的运算符 `*`（叫 separating conjunction）说"这两片柜子互不重叠、各管各的"。这样，两个函数各自改自己的柜子，就不会互相踩坑。

这门逻辑直接建立在 Hoare 逻辑（[[hoare-logic]]）之上，给它加了两样东西：`points-to` 谓词和 separating conjunction `*`。加完以后，你就能写"这个函数只改了 A 块堆，不影响 B 块"——这叫 **frame rule**，是它最大的贡献。

## 为什么重要

不理解 Separation Logic，下面这些事都没法解释：

- 为什么 Rust 的借用检查器能静态证明"没有数据竞争"——Rust 的所有权模型本质上是 Separation Logic 的工程简化版
- 为什么 [[boogie-2005]] 和 Dafny 的框架条件（frame condition）能自动推理"改了啥没改啥"——背后就是 Separation Logic 的 frame rule
- 为什么自动验证器能证明一段链表操作代码"不会崩"——分离逻辑提供了形式化工具
- 为什么现代并发语言（Rust、Go）能避免传统 C 程序里最常见的 bug——它们的设计哲学来自 Separation Logic

2001 年之前，Hoare 逻辑验证指针程序需要程序员手动写"修改了哪片内存"，非常繁琐。Separation Logic 让这件事变成了**局部推理**：你只写函数操作的那片堆，推理器自动帮你管剩下的。

## 核心概念

### 1. Points-to 谓词：`E -> V`

说"地址 E 处的堆单元格存放值 V"。

类比：储物柜 #42 里放着文件 X。在 C 语言里：

```c
int *p = malloc(sizeof(int));
*p = 42;
```

对应分离逻辑断言：

```
p -> 42
```

如果 p 指向一片长度为 3 的数组：

```
p -> [42, 17, 99]
```

### 2. Separating Conjunction：`P * Q`

说"P 描述的堆区域和 Q 描述的堆区域不重叠，合起来构成当前堆"。

这是整个逻辑的核心创新。类比：你有两块地，一块种小麦（P），一块种玉米（Q），两块地不重叠，合起来就是你的全部土地。

```
x -> 5 * y -> 10
```

意思是：`x` 指向的内存单元格存 5，`y` 指向的**另一个不重叠的**单元格存 10。注意——`*` 不只是"且"，它强制**不重叠**，这正是普通逻辑缺的。

### 3. Separating Implication：`P --* Q`

也叫"frame predicate"，说"如果我把 P 加到我已有的堆上，我就能得到 Q"。

类比：我有 100 块砖（现有堆），如果再加一座红砖墙（P），就能组成一座完整的围墙（Q）。问：P 是什么？

### 4. Frame Rule：最大的贡献

经典 Hoare 逻辑没有 frame rule。它长这样：

```
{P} C {Q}
────────────────────  (Frame Rule)
{P * R} C {Q * R}
```

意思是：如果程序 C 在前提 P 下执行能达成 Q，那**即使堆上多出一块无关的区域 R**，C 仍然不会动 R，最终结果就是 Q 加上没被碰过的 R。

类比：你知道"按红色按钮会打开 A 门"。Frame rule 说"即使旁边还有一扇 B 门（你没碰它），按红色按钮依然只开 A 门，B 门保持原样"。

## 代码示例

### 示例 1：两个独立变量的分配

C 代码：

```c
*x = 5;
*y = 10;
```

用分离逻辑推理：

初始断言：`x -> _ * y -> _`（x 和 y 各指一个不重叠的单元格，值无所谓）

第一条语句 `*x = 5` 后，用 points-to 的更新规则：

```
x -> 5 * y -> _
```

关键——`y -> _` 被自动保留！因为你只改了 x 指向的单元格，y 指向的那片不受影响。这就是 frame rule 在默默干活。

如果不用分离逻辑，普通 Hoare 逻辑需要你**显式写出**"y 没被改"，代码量翻倍。

### 示例 2：链表节点创建

C 代码：

```c
struct Node *new_node(int val, struct Node *next) {
    struct Node *n = malloc(sizeof(struct Node));
    n->value = val;
    n->next = next;
    return n;
}
```

对应分离逻辑的函数规范：

```
new_node(val, next)(result) ≡
  pre:  true
  post: result -> [val, next]
```

意思是：函数返回的 `result` 指向一个新节点，里面存 val 和 next。关键在于——`malloc` 分配的区域和已有的 `next` 指向的链表**不重叠**，这个分离逻辑用 `*` 就能保证。调用方可以放心地把自己的链表 `L` 和新节点接起来：

```
L * result -> [val, L]
```

如果 `malloc` 返回的地址碰巧落在 `L` 的范围内（理论上不应该），`*` 不成立，推理立刻失败——bug 被静态捕获。

## 踩过的坑

1. **`*` 不是普通的"且"**。很多人把 `P * Q` 当成 `P ∧ Q`，但 `*` 强制堆区域不重叠。`x -> 5 * x -> 3` 是假的（同一个单元格不能同时存 5 和 3），但 `x -> 5 ∧ x -> 3` 也是假的（同一个地址有两个值）。
2. **框架条件的自动性是把双刃剑**。它太好了，以至于程序员容易忘记"我写的函数真的没碰其他区域吗？"——如果函数内部偷偷改了不该改的，`*` 的边界被打破，但运行时才暴露。
3. **递归数据结构的归纳断言不好写**。验证链表遍历时，你需要用**递归谓词**描述"整条链表"，写法是 `list(x, nil) ∨ ∃h,t. x -> [h,t] * list(t, nil)`。这种写法对没接触过形式化方法的人极不直观。
4. **工具链门槛高**。理论优美，但落地需要 Z3、SeaDuck、Viper 等工具，安装和配置对初学者不友好。
5. **循环不变量的构造依然困难**。和 Dafny 一样，分离逻辑需要你写出正确的循环不变量，这一步没有自动化解。

## 适用 vs 不适用场景

**适用**：
- 指针数据结构验证（链表、树、图操作）
- 内存安全证明（不会 free 后使用、不会内存泄漏）
- 模块化推理：只验证单函数，不影响全局
- Rust 等现代语言的理论基础理解

**不适用**：
- 纯函数式代码（不需要操作堆，Hoare 逻辑就够了）
- 性能分析（它只证"对不对"，不证"快不快"）
- 交互式证明的超复杂场景（用 Coq/Lean 更合适）

## 历史小故事（可跳过）

- **1980 年代**：John Reynolds 最早想到把"分离"塞进逻辑的想法，但当时太超前，论文被拒了多年，一直到 2002 年才正式发表（他的直觉比时代早了 20 年）。
- **2001 年**：O'Hearn 在读博期间，受 Reynolds 启发，和导师 Tom Henderson 等人一起把想法整理成 PLDI 论文，正式提出 Separation Logic 的系统框架。Bornat 的贡献在于证明了 frame rule 的"最小性"——它不可再精简。
- **2005 年**：Boogie 语言开始用 Separation Logic 做 frame 推理，微软的验证工具链正式拥抱它。
- **2010 年代**：Netflix 的 Infer 静态分析工具用分离逻辑检测 C/Java 的 null 指针和 use-after-free bug，每天在生产代码里拦住几千个实际错误。
- **2013 年**：Facebook 的 F* 语言把分离逻辑和依赖类型结合，可以验证更复杂的程序属性。
- **今天**：Rust 的所有权系统、Microsoft's Creusot、AWS's prusti 等工具都在不同程度上受它影响。Reynolds 2013 年获得了 Turing Award（他的贡献涵盖 lambda 演算、类型系统、分离逻辑等多个方向）。

## 学到什么

1. **"分解问题"是最强大的工程思想之一**：把堆分成互不重叠的区域，各自独立推理，这个想法不仅改变了形式化方法，也影响了并发编程和内存管理的设计。
2. **直觉先行，形式化滞后**：Reynolds 1980 年就有想法，2001 年才成型。好想法需要时间成熟，也需要工具链跟上。
3. **frame rule 是"关注点分离"的数学形式化**：软件工程的"只关注你该关注的"原则，被精确表达成了 `{P} C {Q} ⇒ {P * R} C {Q * R}`。
4. **类型系统和逻辑系统的融合趋势**：Rust 把分离逻辑的精神塞进类型系统，F* 把它塞进依赖类型——殊途同归，都是"让编译器替你做推理"。

## 延伸阅读

- 原始论文：O'Hearn, Reynolds, Bornat, "Separation Logic: A Logic for Reasoning about Pointers and Heap", PLDI 2001
- 在线教程：[separationlogic.org](https://www.separationlogic.org/)（论文作者维护的页面，有教程和工具链接）
- [A Lean proof of the soundness of the core of separation logic](https://github.com/aaronsky/sep-logic)（Lean 形式化证明）
- [[hoare-logic]] —— Separation Logic 建立在 Hoare 逻辑之上
- [[boogie-2005]] —— Boogie 使用分离逻辑做 frame 推理
- [[dafny-2010]] —— Dafny 的 modifies 子句是 frame rule 的工程应用

## 关联

- [[hoare-logic]] —— Separation Logic 的前身框架
- [[boogie-2005]] —— 使用分离逻辑的中间语言
- [[dafny-2010]] —— frame condition 的工程实现
- [[trees-that-grow]] —— 链表和树数据结构的程序验证
- [[steensgaard-pointer]] —— 指针分析的早期工作，互补
