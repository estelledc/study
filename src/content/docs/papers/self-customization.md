---
title: SELF Customization — 给每种"调用者类型"现场打一份方法
来源: 'Chambers & Ungar, "Customization: Optimizing Compiler Technology for SELF, a Dynamically-Typed Object-Oriented Programming Language", PLDI 1989'
日期: 2026-05-30
分类: 编译器
难度: 中级
---

## 是什么

**Customization**（特化）是 1989 年 Sun 实验室 SELF 团队发明的一种"让动态语言编译出来的代码尽量像静态语言"的编译技巧——**编译器为每一种调用者类型，复制出一份方法的专属副本**，这样在副本里 `self` 是哪个类型就成了已知常量，所有原本要"运行时查表"的动作都能消掉。

日常类比：餐厅有一份通用菜谱"做一份饭"，里面写着"先看顾客是不是儿童 / 老人 / 普通成年人，再分支"。每次有人点单都要重读一遍 if-else，太累。SELF 编译器的做法是——**直接抄三本菜谱**：儿童版只写儿童那条流程，老人版只写老人那条，成年版只写成年那条。每位顾客拿到的是已经为他量身定制的菜谱，没有 if-else，没有查表。

```self
"通用方法 distance：算两点距离"
distance = ( ((x - other x) squared + (y - other y) squared) sqrt )
```

朴素实现：每次调 `distance` 都要查 `self` 是 IntegerPoint 还是 FloatPoint。Customization 后：编译器为 IntegerPoint 复制一份方法，里面 `x` 直接是整数字段访问；为 FloatPoint 再复制一份，里面 `x` 直接是浮点字段访问。两份代码完全分裂，各跑各的。

## 为什么重要

不理解 customization，下面这些事都没法解释：

- 为什么 V8 引擎能让 JavaScript 跑到接近 C 的速度——hidden class + customization 是地基
- 为什么 HotSpot JVM 的虚函数调用几乎免费——SELF 团队的 Lars Bak 把这套搬进了 HotSpot
- 为什么"动态语言注定慢"在 1989 年之后被证伪——customization 给出了第一个反例
- 为什么现代 JIT 编译器都说"先 profile 再特化"——customization 是这条路线的源头

简单说：**没有 customization，今天的 JS / Python / Ruby JIT 都得重新发明一遍。**

## 核心要点

Customization 在 SELF 里靠三件套协同工作：

1. **按 receiver 特化方法**：每个方法在每种调用者类型下都重新编译一份。类比抄菜谱——一菜一人份，副本之间互不打扰。这一步消除了 `self` 上的所有动态分发。

2. **类型预测（type prediction）**：对 `+` `-` `<` `ifTrue:` 这种高频消息，编译器**猜**接收者是 SmallInt 或 Boolean，提前内联那条分支，再加一道 guard——猜对直接跑，猜错回退。类比熟客点单——服务员看脸就上常点的菜，错了再改。

3. **Maps（隐藏类）**：原型对象不天然有"类"，但编译器内部偷偷给"长得一样"（slot 名字+顺序一致）的对象贴一张共享的 layout 描述符叫 map。所有 IntegerPoint 共享一张 map，访问 `x` 就翻译成"按 map 第 0 偏移取字段"。这就是 V8 hidden class 的祖宗。

三件加起来：**self 调度消失 + 高频消息内联 + 字段访问按偏移走**，SELF 一下子从"100× 慢于 C"变成"4× 慢于 C"。

## 实践案例

### 案例 1：customization 怎么消除一次 self 分发

```self
"原始：通用 length 方法"
length = ( (x squared + y squared) sqrt )
```

朴素实现编译出来的伪指令：

```
load self            ; 取调用者
dispatch x           ; 查表找 x 字段位置
dispatch squared     ; 查表找 squared 方法
... 同样的 dispatch 再来 3 遍
```

customization 后，编译器知道这次调用者是 IntegerPoint，复制一份专属版本：

```
load_field self.0    ; x 是第 0 槽，直接偏移读
imul                 ; 整数平方，一条机器指令
load_field self.1    ; y 是第 1 槽
imul
iadd
fp_sqrt
```

四次查表全部消失，剩下纯计算指令。这就是 customization 的本钱。

### 案例 2：type prediction 配合 customization 把 `1 + 2` 内联成一条加法

SELF 里 `1 + 2` 是给 `1` 发 `+` 消息，参数是 `2`。朴素实现要一次方法查找。编译器看到 `+` 这个消息名时直接预测："99% 情况下接收者是 SmallInt"，于是产出：

```
guard self is SmallInt   ; 一条类型检查
guard arg  is SmallInt
iadd                     ; 直接整数加
; ----- 兜底分支 -----
fallback: 走通用消息发送
```

热路径就一条 `iadd`。这是 type prediction + customization 的合力——customization 把 self 类型钉死，type prediction 把高频消息提前展开。

### 案例 3：maps 怎么让两个原型对象共享 layout

你写：

```self
p1 = (| x = 1. y = 2 |)    "原型，slot x y"
p2 = (| x = 3. y = 4 |)    "另一个，slot 完全一样"
```

p1 和 p2 没有"类"，但编译器内部给它们贴同一张 map：`{x→offset 0, y→offset 1}`。访问 `p1 x` 和 `p2 x` 都翻译成"取自身偏移 0"。一旦你给 p2 加一个新 slot z：

```self
p2 z: 5    "动态加 slot"
```

p2 的 map 立刻分裂成新的 `{x→0, y→1, z→2}`，原先按旧 map 编译过的代码作废、需重编。这正是 V8 里 hidden class transition 的雏形。

## 踩过的坑

1. **代码膨胀**——customization 给每个 receiver 类型一份特化副本，热路径方法可能膨胀 10-100×。SELF 团队后来加了 limit + LRU 才控住。
2. **type prediction 猜错代价高**——对真正多态的代码（一个调用点见过 5+ 类型），guard 失败的回退路径反而更慢，需要 PIC（[[self-pic]]）补救。
3. **map 迁移失效问题**——程序运行时给对象动态加 slot 会触发 map transition，已经按旧 map 编出的机器码全部失效，要么丢弃要么 deoptimize。
4. **离线全量编译撑不到 eval 这种动态场景**——customization 假设方法集闭合；后来 Hölzle 1994 的自适应再编译才解开这个限制。

## 适用 vs 不适用场景

**适用**：

- 动态分发为主的 OO 语言（Smalltalk / Ruby / Python / JavaScript）
- 调用点的 receiver 类型相对集中（mono / 低多态）的代码
- 能离线或后台编译的场景（HotSpot / V8 / PyPy 都靠后台线程跑这类优化）

**不适用**：

- 真正高度多态的代码——一个点见过 10+ 类型，customization 副本爆炸还不如查表
- 极度动态的语言场景（频繁 eval / 改方法 / 加 slot），缓存命中率低
- 嵌入式 / 内存受限设备——10× 代码膨胀直接打爆 ROM
- 静态语言（C / Rust）——本来 self 类型就是已知，customization 没增量

## 历史小故事（可跳过）

- **1986 年**：Ungar 和 Smith 想做"比 [[smalltalk-80]] 更纯粹"的 OO 语言，于是有了 SELF——只剩对象 + 消息 + 原型，没有类。
- **1989 年**：Chambers-Ungar 在 PLDI 发表 customization 论文——约 2× 当时最快 Smalltalk，距优化 C 约 4–5×。
- **1991 年**：Hölzle 加 [[self-pic]]（polymorphic inline cache）补上多态点。
- **1994 年**：Hölzle 博士论文加自适应再编译——按运行时 profile 选择性 customize，不再全量。
- **1999/2008 年**：Lars Bak 把这套思想分别带进 HotSpot JVM 和 V8 引擎。SELF 实验室落幕，思想登顶工业界。

## 学到什么

1. **特化是最朴素的 JIT 武器**——原理就是"复制 + 把变量当常量内联"，[[partial-evaluation-jones]] 给了它的理论形式。
2. **动态语言不一定慢**——慢的不是动态本身，是朴素实现。把"运行时多态"挪到"编译期特化"，差距会被抹平大半。
3. **hidden class 不是 V8 发明的**——是 1989 年 SELF maps 的现代马甲。读懂 SELF 论文等于免费读懂半本 V8 内核。
4. **代码膨胀 vs 性能** 永远是工程权衡——customization 押的是"内存便宜，CPU 周期贵"，今天依旧成立。

## 延伸阅读

- 视频：[Craig Chambers — The Design and Implementation of SELF](https://www.youtube.com/results?search_query=craig+chambers+self)（作者本人讲编译器架构）
- 论文 PDF：原论文 ACM DL 链接 [10.1145/74818.74831](https://dl.acm.org/doi/10.1145/74818.74831)
- 后续工作：Hölzle 1994 博士论文 *Adaptive Optimization for Self*（自适应再编译的源头）
- 工业落地：V8 设计文档 *V8 Hidden Classes & Inline Caches*（直接对应 SELF maps + PIC）
- [[self-pic]] —— customization 的近邻；同一团队下一篇论文，补多态分发那块

## 关联

- [[self-pic]] —— PIC 接 customization 的多态点；两篇合起来才是完整的 SELF 编译器故事
- [[smalltalk-80]] —— SELF 的"上一代"，customization 想超越的 baseline
- [[simula-67]] —— 类的起点；SELF 是反过来的"无类原型"流派
- [[partial-evaluation-jones]] —— customization 是部分求值在 OO 语言上的具体形态
- [[turchin-supercompilation]] —— 比 customization 更激进的程序特化，思想血缘相近
- [[kildall-dataflow]] —— customization 内部的类型分析靠数据流框架推导
- [[ssa]] —— 现代编译器把 customization 后的副本进一步降到 SSA 优化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[smalltalk-80]] —— Smalltalk-80
- [[ssa]] —— SSA — 静态单赋值形式
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去

