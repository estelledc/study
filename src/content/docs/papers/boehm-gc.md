---
title: Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
来源: 'Hans-Juergen Boehm & Mark Weiser, "Garbage Collection in an Uncooperative Environment", Software: Practice and Experience, Vol. 18(9), 807-820, 1988'
日期: 2026-05-30
分类: papers / 内存管理
难度: 中级
---

## 是什么

保守式垃圾回收（conservative GC）是一种**在编译器不配合、运行时没有类型信息的语言里也能跑的自动内存回收方法**。日常类比：搜山救援，你不知道哪个地方真有人，于是把所有可疑脚印都当人脚印追下去——宁可白跑十趟，也不能漏掉一个真人。

它解决的问题很具体：C 和 C++ 写出来的程序，堆里的一个机器字到底是指针还是普通整数？编译器不告诉你。Boehm 和 Weiser 1988 年提出：**那就把所有可能是指针的字都假设成指针**，从这些点出发标记所有能达到的对象，剩下没被标到的就回收。这个方法做出来的回收器后来叫 **bdwgc**（Boehm-Demers-Weiser GC），到今天还在维护。

之所以叫'保守'，是相对'精确（precise）'GC 而言：精确 GC 要求每个根位置都明确标注'是否为指针'（通常靠编译器生成 stack map），保守 GC 不需要这种配合，代价是偶尔把整数错当成指针。

## 为什么重要

不理解保守式 GC，下面这些事都没法解释：

- 为什么 C 程序加一个 `-lgc` 链接选项就能用上 GC，而不需要换语言、换编译器
- 为什么 Crystal、D 语言这些"看起来挺现代"的语言不自己写 GC，而是直接用 bdwgc
- 为什么 ZGC、G1 这些'低停顿'GC 都强调自己是'精确式'——'精确式'就是相对'保守式'而生的概念
- 为什么 64 位时代后保守式 GC 的'内存浪费'问题几乎消失了
- 为什么 1988 年的论文里那个简单算法到现在仍然被 GCC、Mozilla 早期版本、Crystal 等大型项目使用

## 核心要点

保守式 GC 的全部魔法可以拆成 **三步**：

1. **根集扫描**：把栈、寄存器、`.data`/`.bss` 静态区里每一个机器字大小的位置都当成候选指针。日常类比：把家里每个抽屉都翻一遍，记录所有看着像钥匙的东西。

2. **范围判定 + 起点定位**：对每个候选值，判断它是否落在堆地址区间内；落在区间内就用 `值 & ~(BLOCK_SIZE-1)` 找到所属 block，再算出对象起点。日常类比：有了疑似钥匙就配每把锁试一下，能开的才是真钥匙。

3. **Mark-sweep**：从所有命中的对象出发递归标记其内部字段；标记完后扫一遍堆，没被标到的对象槽位挂回 free list。同一对象不会被重复处理，因为有 mark bit 兜底。

为了让步骤 2 的'起点定位'快，论文还提出 **block-based heap** 设计：把堆划分为 1KB 的 block，每个 block 只装单一大小（size class）的对象，于是给定任意指针 `p` 都能 `O(1)` 时间内查到它指向的对象起始地址。Mark bit 也按 block 集中存放，标记一次只动一个 cache line。

三步加在一起的关键性质：**保守式 GC 的根集是精确 GC 根集的超集**，所以安全（不会漏掉真指针），代价是偶尔多保留一些不该留的对象。论文 Theorem 1 给出 false pointer 概率上界约等于 `堆大小 / 地址空间大小`，把这个'宁可错认'的代价数学化了。

## 实践案例

### 案例 1：给 C 程序无侵入加 GC

最小改造，把 `malloc` 换成 `GC_malloc`，`free` 全部删掉：

```c
#include <gc.h>

int main(void) {
    GC_INIT();                        // 启动 bdwgc
    for (int i = 0; i < 100000; i++) {
        char *buf = GC_malloc(1024);  // 不需要再 free
        sprintf(buf, "row %d", i);
    }
    return 0;                         // 进程退出前 bdwgc 自动回收
}
```

编译：`gcc demo.c -lgc -o demo`。这就是 1988 年那篇论文最让 C 程序员震撼的体验——不用换语言，不用学新工具，链接一个库就能让内存自己管理自己。论文 Table II 报告 Cedar/Mesa 编译器和 awk benchmark 在 Sun-3 上整体减速约 1.19~1.22 倍，这个开销在当时的 C 程序员眼里相当可接受。

代码里没有任何手动 free，进程退出前 bdwgc 会负责清掉所有未引用的 buf。

### 案例 2：Crystal 语言把 bdwgc 当默认 GC

Crystal 编译到 LLVM IR，但 LLVM 没有现成的'精确栈映射'方案给它用，自研 GC 成本太高，于是直接 FFI 到 bdwgc：

```crystal
# Crystal 标准库 src/gc/boehm.cr 简化片段
lib LibGC
  fun init = GC_init
  fun malloc = GC_malloc(size : LibC::SizeT) : Void*
  fun collect = GC_gc_no_intrinsic
end

# 程序里直接 new 对象，背后就是 GC_malloc
arr = Array(Int32).new(1_000_000) { |i| i * 2 }
```

这个工程取舍在系统语言界很常见：与其花两年自研一个精确 GC，不如先用 bdwgc 上线，性能够用就行。

### 案例 3：64 位让保守式焕发第二春

32 位地址空间 4GB，堆 16MB，一个非指针整数恰好落进堆范围的概率约 1/256；64 位下虚拟地址实际只用 48 位，堆 1GB 时概率降到约 1/26 万。配合 `align=8` 再降 8 倍。

```
P(false) ≈ heap_size / address_space / alignment
32 位: 16M / 4G / 8 ≈ 1/2048
64 位: 1G / 256T / 8 ≈ 1/2百万
```

结果：典型程序每次 GC 的 false pointer 期望 < 1，几乎不会浪费内存。这就是为什么 bdwgc 在 2020s 还活得好好的——硬件演进解决了它最大的弱点。

## 踩过的坑

1. **false retention 单点放大**：一个 false pointer 单独看只多保留一个对象，但若那个对象内部还有真指针，整棵子树都跟着保留，最坏情况几百 MB 内存看似泄漏。排查办法是开 `GC_DUMP_REGULARLY` 看保留链。
2. **不能移动对象**：一个机器字不知道是不是指针，就不敢搬动它指向的对象（搬完无法安全改写源处）。这丢掉了 compaction、bump-pointer 分配、复制式分代三大优化。
3. **setjmp 扫寄存器依赖 ABI**：1988 年 VAX/Sun-3 的 callee-saved 寄存器列表足够，今天 x86_64/ARM64 上某些 caller-saved 寄存器持有指针时可能被漏扫，需要专门加扫描入口。
4. **STW pause 随堆变大线性增长**：默认 stop-the-world，16MB 堆 pause 几十毫秒可接受，100GB 堆能到秒级，低延迟场景必须改用精确式 + 并发 GC。

## 适用 vs 不适用场景

适用：

- C/C++ 大型项目想加自动内存管理但不能换语言
- 新语言想快速上线、还没精力自研 GC（Crystal、D、Cyclone 都走这条路）
- 原型开发、脚本语言运行时（GCC libgcj、Mozilla 早期 SpiderMonkey）

不适用：

- 低延迟服务（游戏、交易系统）：pause 不可控，请用 ZGC（[[zgc]]）或 Shenandoah
- 大堆（≥ 100GB）：sweep 阶段太慢，改用并发回收
- 区域内存语义已能解决问题的程序：用编译期管理（[[tofte-talpin-regions]]）零运行时开销，更便宜
- 加密/压缩指针的程序：保守式扫不到 xor、tagged、压缩后的指针形态，需要走精确 GC 才安全

## 历史小故事（可跳过）

- **1986**：Hans Boehm 与 Mark Weiser 都在 Xerox PARC 工作，PARC 是 Smalltalk 与 Cedar 的发源地，对 GC 文化深厚。Weiser 同时在做'ubiquitous computing'（普适计算）的研究，是 GUI 与计算机历史上的传奇人物。
- **1988**：论文发表于 *Software: Practice and Experience* Vol. 18(9)。同年 ANSI C89 定稿，C 仍是系统软件事实标准。
- **1990s**：bdwgc 加分代支持（`GC_enable_incremental`）；GCC 的 Java 前端 libgcj 把它当默认 GC；Demers 加入合作，名字变为 Boehm-Demers-Weiser。
- **2000s**：bdwgc 加 pthread / win32 多线程支持；Mono 早期版本默认用它，后切到自研 SGen。
- **2010s**：64 位优化、并行标记（`PARALLEL_MARK`）让 mark phase 多核加速 3 倍以上；Crystal 1.0 选 bdwgc 当默认 GC。
- **2020s**：bdwgc 支持 CHERI capability 内存；Boehm 仍在 Google 维护原仓库，论文里的算法核心 35 年未变。

## 学到什么

- **保守是工程妥协，不是不严谨**：在不能改编译器的约束下，把'宁可错认'数学化分析（false pointer 概率上界）就能证明既安全又低浪费，这是把'经验工程'变'理论工程'的范例。
- **设计的根源是约束**：bdwgc 不能 move、用 free list、STW，三个特征全来自'不能改编译器'这一个根约束。一旦放松（允许 stack map），就变成 SGen 或 ZGC。读老论文最先看清的就是这种约束→设计的因果链。
- **64 位悄悄改变游戏规则**：地址空间从 4GB 跳到 256TB 让保守式的'误判率'降几个数量级，老论文里的痛点不药而愈。
- **'够用'胜过'最优'**：bdwgc 至今活跃，因为系统软件里'不需要改编译器'这条优势经常压倒'pause 更短'。'够用'是工程师最被低估的判断力。

## 延伸阅读

- 论文 PDF：Hans Boehm 个人主页 hboehm.info 提供原文与后续优化论文
- bdwgc 仓库：github.com/ivmai/bdwgc，可看 `mark.c` 与 `alloc.c` 对应论文 Section 3
- Hans Boehm 演讲：A garbage collector for C and C++（多次会议讲过相同主题）
- Crystal 接入示例：crystal-lang/crystal 仓库 `src/gc/boehm.cr` 100 行 FFI 即看懂'怎么租 bdwgc'
- 关联笔记：[[cheney-gc]] 精确移动式 GC 的祖宗、[[zgc]] 低延迟精确 GC 的现代代表

## 关联

- [[cheney-gc]] —— Cheney 1970 半空间复制是精确移动式 GC 起点，比 Boehm 早 18 年但要求精确根
- [[generational-gc]] —— 分代 GC 假设'年轻死得多'，bdwgc 后期可启用分代但需 mprotect write barrier
- [[zgc]] —— ZGC 用染色指针实现 < 10ms pause，是精确路线的现代终点，与 Boehm 形成两端对比
- [[tofte-talpin-regions]] —— 区域类型系统在编译期决定释放，与 GC 是另一条路线
- [[cousot-abstract-interpretation]] —— 给程序加'保守过近似'的同一思路，先安全再谈精度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[g1-collector]] —— G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[lieberman-realtime-gc]] —— Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
- [[linear-types]] —— 线性类型（Linear Types）
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
