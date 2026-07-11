---
title: Separation Logic — 把 Hoare 逻辑扩到带指针的程序
来源: 'John C. Reynolds, "Separation Logic: A Logic for Shared Mutable Data Structures", LICS 2002'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Separation Logic 是一套**让你证明带指针的程序时不用考虑别名**的逻辑系统。日常类比：像合租房间——你只管自己那间，室友的房间和你互不干扰，写公共账本时也只动自己那栏。

经典 Hoare 逻辑能证明 `x := x + 1` 之后 x 变大，但碰到 `[x] := 3`（往 x 指向的内存写 3）就崩了——因为没人知道 y 是不是也指向同一块内存，每条断言都得罗列"y 没和 x 重叠"这种条件。

Reynolds 引入一个新算子 **分离合取 P\*Q**，意思是"堆能切成不重叠的两块，左块满足 P，右块满足 Q"。配合 frame rule，证明一段代码时只看它真正碰的内存，其它部分自动保留——这叫**局部推理**。

## 为什么重要

不理解 Separation Logic，下面这些事都没法解释：

- 为什么 Rust 的 `&mut` 和 `&` 互斥不能并存——本质就是"两份引用必须分离"
- 为什么 Facebook Infer 能扫几百万行代码自动找空指针/资源泄漏（用了 bi-abduction 自动推前置条件）
- 为什么 Iris/RustBelt 能在 Coq 里证明 Rust unsafe 代码安全——靠的是高阶 separation logic
- 为什么经典 Hoare 在指针密集的 C 代码里基本没人用，但加了 \* 之后突然能 scale

## 核心要点

Separation Logic 在 Hoare 逻辑上加了 **三个核心算子 + 一条规则**：

1. **emp**：空堆。类比"空房间"——啥东西都没有。最严格的状态，常被新人当成 `true` 用，错。

2. **x ↦ v**：地址 x 处存了值 v，**且整个堆里只有这一格**。类比"独居一间房，里面摆着 v"。这是构建复杂结构的原子。

3. **P \* Q（分离合取）**：堆能切两块，左块满足 P，右块满足 Q。类比"P 和 Q 各占一间房，互不串门"。它和普通合取 P∧Q（同一份堆都满足）完全不同。

4. **Frame Rule**：`{P} c {Q}` 成立 → `{P*R} c {Q*R}` 成立，前提是 c 不动 R。类比"我装修我那间房，你那间自动保留原状"。这是模块化推理的钥匙。

## 实践案例

### 案例 1：链表反转

```c
list reverse(list x) {
  list y = NULL;
  while (x != NULL) {
    list t = x->next;
    x->next = y;
    y = x;
    x = t;
  }
  return y;
}
```

不变式：`list(α, x) * list(rev(β), y)`，其中 α + β = 原始序列。每轮 while 拆四步：

1. **切**：从 x 链表头"切"下一格（节点），`t` 记住原 next
2. **改**：把该节点的 next 指向 y（接到已反转段）
3. **拼**：把该节点并入 y 那块堆（\* 右侧变长）
4. **推进**：x 移到 `t`；frame rule 保证循环外内存不动

经典 Hoare 要写半页才能说清"节点不互相别名"；分离逻辑用 \* 直接蕴含。

### 案例 2：Frame rule 让模块化证明可能

证明 `hashtable_insert` 调用了 `list_append`：

```
{list(l) * htbl(h)} list_append(l, x) {list(l') * htbl(h)}
```

`list_append` 的 footprint 只有 `list(l)`；`htbl(h)` 在 \* 另一侧、命令不碰它，所以**调用前后不用重证哈希表性质**——frame rule 自动保留。经典 Hoare 每次都要重证未变，n 个模块≈ n² 个证明。

### 案例 3：Rust 借用检查器 = 静态分离逻辑

```rust
let mut v = vec![1, 2, 3];
let r1 = &v;        // 共享借用
let r2 = &mut v;    // ❌ 编译失败
```

为什么？因为 `&v` 和 `&mut v` 同时存在，相当于声称"两份引用看同一块堆但又互不重叠"——分离逻辑里这就是矛盾。Rust 把它编进类型系统，让你**不会写谓词演算也享受到局部推理的好处**。

## 踩过的坑

1. **把 P\*Q 当成 P∧Q**：合取是"同一份堆都满足"，分离合取是"堆切两块"——前者允许同地址，后者强制不同地址，混了就证不出别名安全。

2. **emp 不是 true**：emp 严格说"堆里啥都没有"。新人常把它当作"无所谓"——结果证 `{emp} alloc(x) {x↦_}` 时一切正常，但把 emp 写在循环不变式里就会丢失整个堆。

3. **frame rule 滥用**：要求命令的 footprint（真正读写的内存）封闭。调用未知函数 `f(x)` 时不能盲目 frame，得知道 f 只动 x 指向的那块——否则 R 里被偷偷读写就证错。

4. **magic wand 反方向**：`P -* Q`（magic wand）是 \* 的**反向工具**——读作"再拼上一块满足 P 的堆，整体就满足 Q"。绝大多数人第一次把方向写反，编码 list segment 时尤其常踩。

## 适用 vs 不适用场景

**适用**：

- 指针密集的命令式程序——链表/树/图算法证明
- 需要模块化证明的大型代码库——库函数前后置条件可独立证再组合
- 工业静态分析工具——Infer/Pulse 用 bi-abduction 自动推前置条件
- 形式化 Rust/C 内存安全——Iris/RustBelt 的根

**不适用**：

- 纯函数式无指针程序——Hoare 逻辑或类型系统就够，分离合取是杀鸡用牛刀
- 高阶/闭包密集代码——需要 higher-order separation logic（Iris 才能扛）
- 并发——原版 Reynolds 2002 只管顺序程序；并发要 Brookes/O'Hearn 的 CSL
- 想完全自动证明——分离逻辑核心仍要人工提示，全自动只在受限片段（如 SMT-friendly fragment）

## 历史小故事（可跳过）

- **1969 年**：Hoare 提三元组 `{P}c{Q}`，但堆+指针是公开的痛点
- **1972 年**：Burstall 第一次尝试用"distinct list assertion"描述链表分离，但没系统化
- **1999 年**：O'Hearn 和 Pym 在伦敦发明 Bunched Implications (BI) 逻辑，给"资源分块"提供代数基础
- **2001 年**：Ishtiaq & O'Hearn 把 BI 接到指针程序，给出 frame rule 与可释放内存的经典堆模型（\* 本身由 Reynolds 更早引入）
- **2002 年**：Reynolds 在 LICS invited talk 把线索拼成完整系统并定名 Separation Logic
- **2007 年起**：Brookes 扩到并发；2015 年 Iris 在 Coq 落地；Infer 让它在工业界跑起来

## 学到什么

1. **局部推理是可组合性的本质**——只看自己那块、其它自动保留，软件工程从此能 scale
2. **数学上的"资源切块"和工程上的"模块化"是同一回事**——BI 逻辑给了它代数表达
3. **分离逻辑思想可以下沉到类型系统**——Rust 的所有权就是它的简化静态版，普通工程师不写 \* 也享得到
4. **理论 → 工业落地间隔 10 年是常态**——2002 论文，2015 Iris/Infer，规律和 HM 一样
5. **新算子比新规则贵**——加一个 \* 看起来微小，但需要重写所有原有规则的"局部版本"才能用起来

## 延伸阅读

- 视频教程：[Peter O'Hearn — A Primer on Separation Logic](https://www.youtube.com/watch?v=oG5NLG6hQwE)（一小时把 \* 和 frame rule 讲透）
- 论文 PDF：[Reynolds 2002 LICS](https://www.cs.cmu.edu/~jcr/seplogic.pdf)（27 页，最权威）
- 入门书：[Software Foundations Vol 6 (Hoare)](https://softwarefoundations.cis.upenn.edu/slf-current/)（用 Coq 一步步建分离逻辑）
- Coq 教程：[Iris Tutorial](https://iris-project.org/tutorial-material.html)（用现代框架重写一遍证明）
- [[hoare-logic]] —— Separation Logic 的母体
- [[linear-types]] —— 同源思想：把"资源"当一等公民
- [[rustbelt-2018]] —— 用分离逻辑证 Rust 标准库

## 关联

- [[hoare-logic]] —— Hoare 三元组是 Separation Logic 的母体，分离合取是给它的指针扩展
- [[linear-types]] —— 把"资源不可复制"编进类型，和 \* 思想同源
- [[tofte-talpin-regions]] —— 用类型管内存生命周期，是分离逻辑的近亲
- [[sagiv-shape-analysis]] —— 静态分析路线：用三值逻辑近似分离逻辑能证的不变式
- [[andersen-pointer-analysis]] —— 经典指针分析；Separation Logic 是它的"证明级"对应物
- [[steensgaard-pointer]] —— 等价合并版指针分析；和 \* 都是"切堆"思路的不同精度
- [[cousot-abstract-interpretation]] —— 抽象解释框架，分离逻辑可视为其一种 instantiation
- [[reynolds-definitional-interpreters]] —— 同一作者；Reynolds 习惯把"定义清楚再优化"作为方法论
- [[system-f-reynolds-1974]] —— 同一作者；从类型抽象到资源抽象的脉络一致

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[apron-2009]] —— Apron — 把区间/八边形/多面体塞进同一个插槽
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[infer-biabduction]] —— Bi-Abduction — 让静态分析自动猜出函数缺什么前提
- [[linear-types]] —— 线性类型（Linear Types）
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对
- [[vst-2014]] —— VST — 把 C 程序的数学证明一路带到机器码

