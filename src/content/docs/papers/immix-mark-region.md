---
title: 'Immix — 把"扫"和"搬"两种垃圾回收揉成一个'
来源: 'Blackburn & McKinley, "Immix: A Mark-Region Garbage Collector with Space Efficiency, Fast Collection, and Mutator Performance", PLDI 2008'
日期: 2026-05-30
分类: 垃圾回收
难度: 中级
---

## 是什么

Immix 是一种**垃圾回收器**（GC，Garbage Collector），把过去两种主流方案的优点揉到一起。

日常类比：想象一个**自助餐厅**。

- 老办法 A（mark-sweep, 标记-清扫）：服务员**逐张桌子**问"还在用吗"，标记没人用的桌子。问题是几十张桌子查一遍很慢，而且空桌散在各处，新客人不好找连续位置。
- 老办法 B（copying, 复制）：把房间分成左右两半，永远只用一半。打扫时把还在用的客人**整体搬到**另一半。问题是永远有 50% 房间空着没人用。
- **Immix（mark-region, 标记-区域）**：把房间分成"大区"（block）和"小排"（line）两级。先看哪些**大区整片空了**，再看大区里哪些**小排空了**。新客人沿着小排连续坐过去（bump pointer，推指针）。如果某个大区被坐得太零碎，**只搬这一个大区**的客人到新大区——不全搬。

一句话：**两层网格 + 选择性复制**，让 GC 既省空间又跑得快。

## 为什么重要

不理解 Immix，下面这些事都没法解释：

- 为什么 2014 之后新做的语言（Inko / Crystal / Scala Native）GC 看起来都差不多
- 为什么 Java 的 G1GC、ZGC、Shenandoah 都讲"region（区域）"——这个词就是 Immix 带火的
- 为什么 Rust 生态里 mmtk（Memory Management ToolKit）能把 GC 做成可插拔库——它的核心就是 Immix
- 为什么"分代 GC"和"region GC"现在能拼在一起——Immix 提供了把它们粘起来的通用基座

在 Immix 之前 30 年（1960-2008），GC 设计基本是 "mark-sweep vs copying" 的二选一。Immix 出来后，**第三条路**成了主流。

## 核心要点

Immix 用 **两层网格** 管堆内存：

1. **block（块，32KB）**：粗粒度的"回收单位"。一个 block 全空就还给系统。
2. **line（行，128B）**：细粒度的"复用单位"。约等于几条 CPU cache line，扫描友好。

然后有 **三个动作**：

1. **mark（标记）**：从根集合（栈、寄存器、全局变量）出发遍历对象图，每个活对象打勾。同时，对象所在的 **line 也跟着被标记**——不用单独维护 line 的位图，line 状态从对象 mark 自动算出来（implicit marking，隐式标记）。

2. **allocate（分配）**：分配器在 block 里**连续推指针**（bump pointer），遇到被标记的 line **跳过**它，落到下一段空 line。这叫 **hole-filling bump pointer**（填洞式推指针）——比 mark-sweep 的"找空闲链表"快得多。

3. **evacuate（搬迁，可选）**：如果某个 block 碎片太多（空 line 散落），就把它的活对象**搬到新 block**，留下一个完全空的 block。这叫 **opportunistic evacuation**（机会主义搬迁）——只搬碎的，不像 copying 全搬。

合起来：标记是低成本的（mark-sweep 同款），分配是 bump-pointer（copying 同款），整理碎片只在需要时局部做（两边都没的新招）。

## 实践案例

### 案例 1：从 mark-sweep 升级到 Immix 看到了什么

JikesRVM（一个研究用的 JVM）在 2008 年实测：

- mutator（业务代码）时间：mark-sweep 比 Immix 慢 7–11%
- GC 时间：Immix 接近 copying 的速度
- 空间：Immix 比 copying 省 20%（不需要永远空一半）

为什么 mutator 也变快？因为分配走 bump pointer，每次分配只是一条 `add` 指令。mark-sweep 的空闲链表查找要走指针、判断大小、可能不连续。

### 案例 2：什么是"碎片化"，Immix 怎么对付

设想一个 32KB block 里有 256 条 line，第 1、3、5、7…条还活着，2、4、6、8…条空了。

- mark-sweep 看：能用啊，每个空 line 都登记到 free list。但你想要分配一个 200B 的对象，得连查好几个 free list 节点。
- copying 看：整个 block 不能直接用，得搬。
- **Immix 看**：这个 block 碎得厉害，标记为"待 evacuate"。下次 GC 时把活对象搬到新 block，腾出整片空间给 bump pointer 用。

关键是 Immix **不是每次都搬**——只在碎片度超过阈值时才搬。代价（写屏障、转发指针）只在需要时付。

### 案例 3：现实里谁在用

- **JikesRVM**（Java 研究 VM）：Immix 是默认 GC。
- **Inko**（一门新语言）：直接用 Immix 做单代 GC。
- **Scala Native** / **Crystal**：受 Immix 启发的 region GC。
- **mmtk-core**（Rust 写的 GC 框架）：Immix 是它支持的核心 plan 之一，被 OpenJDK、V8 实验性集成。
- **Java G1GC / Shenandoah / ZGC**：region 思想的工业延伸（虽然实现比 Immix 复杂得多）。

### 案例 4：一个 block 的内部样子

抽象画一下 32KB block 内部布局：

```
[line 0 ][line 1 ][line 2 ][line 3 ]...[line 255]
   活      空      活      空           活
   |               |               (256 个 line × 128B = 32KB)
   v               v
   bump pointer 在 line 1 起步推 → 推到 line 1 末尾 → 跳过 line 2（标记中）→ line 3 起步 → ...
```

线性扫描 + 跳过标记 line。比 mark-sweep 走 free list 链表快一个数量级——因为 cache 友好，一次预取能读完一段连续 line。

## 踩过的坑

1. **block 和 line 大小不能拍脑袋**：原论文 32KB / 128B 是在 2008 年硬件上调出来的。block 太大空间浪费，太小元数据爆炸；line 小于 cache line 没意义，大于 1KB 又跟 block 没区别。换硬件就要重新调。

2. **opportunistic evacuation 不是免费午餐**：要搬就要写屏障（write barrier，每次写指针时插一段代码）和转发指针（forwarding pointer）。这部分代码比 mark-sweep 多一截，调试也更难。

3. **对短命对象不如分代 GC**：Immix 是单代设计——所有对象一视同仁。但实际上 90% 对象活不过几毫秒。所以真实系统通常把 Immix 当**老年代**用，前面再加一个分代 nursery（新生代）。

4. **implicit marking 听起来巧，实测要小心**：从对象 mark 推 line mark，要求对象不能跨 line 边界。大对象（>1 line）要单独管（large object space）。

5. **conservative line marking 要多标一行**：扫描时如果对象跨过了 line 末尾几字节，保险起见相邻下一行也标"占用"。这是为了不破坏 implicit marking 的不变量。代价是少量空间换实现简单。

## 适用 vs 不适用场景

**适用**：

- 通用语言运行时的老年代 / 单代 GC（Java、Scala、新做的语言）
- 想要 bump-pointer 快速分配但又不能容忍 50% 空间浪费的场景
- 需要可调"压缩力度"的 GC——Immix 的 evacuation 比例可调

**不适用**：

- 实时 / 低延迟系统：Immix 暂停时间还是 stop-the-world，要做并发要加复杂改造（参考 Shenandoah）
- 极端小内存（嵌入式 < 1MB）：block 32KB 太大，元数据占比高
- 对象寿命极短的纯短命场景：纯分代 GC 更合适
- 完全不能容忍写屏障开销的场景（极少见）

## 历史小故事（可跳过）

- **1960**：McCarthy 在 LISP 里第一次提 mark-sweep。一直用了 50 年。
- **1969**：Cheney 发明半空间 copying GC，速度快了，但浪费一半空间。
- **1984**：Ungar 提分代 GC，把"短命 vs 长寿"分开管。
- **2008**：Blackburn & McKinley 提 Immix，把两条思路合并。两人都是 GC 圈老兵——Blackburn 是 JikesRVM 主程，McKinley 后来去了 Microsoft Research。
- **2014 后**：region 思想被工业 Java（G1）、新语言（Inko / Crystal）、跨语言框架（mmtk）反复抄。
- **2020 后**：mmtk-core 把 Immix 抽成可插拔的 plan，第三方 VM 接进来就能换 GC 算法。OpenJDK、V8、CRuby 都有实验集成。

## 学到什么

1. **两个老方案打架时，往往有一条"网格化"的中间路**——mark-region 不是凭空发明，是把 mark-sweep 的"逐对象标记"和 copying 的"区域整体管"嫁接。
2. **粒度分层**是系统设计常见招式：粗粒度找候选（block 是否全空），细粒度填空（line 是否能放）。Linux 的 buddy allocator + slab、CPU 的 page + cache line 都是这个思路。
3. **优化是可选项不是必选项**：Immix 的 evacuation 只在需要时跑——这种"只在最坏情况付代价"的设计哲学，在系统软件里反复出现。
4. **学术论文的命运很看时机**：Immix 2008 出来，2010 之后新语言爆发期刚好赶上，于是被反复抄。同时代很多更巧的 GC 算法没赶上这波就消失了。
5. **bump pointer + 偶尔搬迁** 这种组合，让分配路径快到一条加法指令，同时不必永远空一半堆。这是 Immix 最值钱的设计取舍。
6. **GC 评测要看三件事**：mutator 时间（业务代码慢多少）、GC 时间（暂停多久）、空间（多大堆）。任何 GC 论文只报其中一项都不可信——Immix 当年三项都拿出来比，才说服了同行。

## 延伸阅读

- 论文 PDF（14 页，可读性高）：[Blackburn-McKinley 2008](http://users.cecs.anu.edu.au/~steveb/pubs/papers/immix-pldi-2008.pdf)
- mmtk 项目：[mmtk-core on GitHub](https://github.com/mmtk/mmtk-core)（Rust 写的可复用 GC 框架，Immix 是核心 plan）
- 综述书：[Jones, Hosking, Moss — The Garbage Collection Handbook](https://gchandbook.org/)（GC 圣经第 2 版有 Immix 章节）
- Inko 语言的 GC 文档：[Inko Memory Management](https://inko-lang.org/manual/latest/getting-started/memory-management/)（实际工程里怎么用 Immix）
- 综述讲座：Stephen Blackburn 在 ISMM（GC 顶会）多次回顾 mark-region 的演化路径，可以在 ACM 数字图书馆找到录像。
- 入门视频：YouTube 搜 "Immix GC Blackburn"，有 30 分钟讲解版，对零基础友好
- [[hindley-milner]] —— HM 推类型时也要管"中间值的内存"——和 GC 的对象生命周期有交集

## 关联

- [[hindley-milner]] —— HM 给静态类型语言不标注就能跑，Immix 给这些语言提供高效内存回收
- [[ssa]] —— SSA 是优化器中间表示，GC 要扫栈帧时依赖编译器生成的根集合元数据
- [[llvm]] —— LLVM 不自带 GC，但提供 `gc.statepoint` intrinsic 让上层 GC（如 Immix）插钩子
- [[partial-evaluation-jones]] —— 编译期优化和 GC 共同决定运行时性能下限
- [[cheney-gc]] —— Cheney 的 1969 年 copying GC，是 Immix 直接对比的两个前辈之一
- [[boehm-gc]] —— Boehm 保守 GC，工业里 C/C++ 用 Immix 之外的另一种思路
- [[generational-gc]] —— 分代 GC，常作为 Immix 的新生代搭档

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[doligez-leroy-concurrent-gc]] —— Doligez-Leroy Concurrent GC — ML 线程运行时里的准实时垃圾回收
- [[g1-collector]] —— G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[jemalloc-2006]] —— jemalloc — 多 arena 让多线程 malloc 不再互相等
- [[llvm]] —— LLVM — 模块化编译器框架
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[shenango-2019]] —— Shenango — 每 5 微秒重新分一次核的中央调度器
- [[slab-1994]] —— Slab Allocator 1994 — 内核按对象类型开缓存，不是按字节切
- [[ssa]] —— SSA — 静态单赋值形式

