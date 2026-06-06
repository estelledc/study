---
title: Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
来源: 'Lieberman & Hewitt, "A Real-Time Garbage Collector Based on the Lifetimes of Objects", CACM 1983'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

Lieberman-Hewitt 1983 是 **第一篇把"对象寿命统计偏斜"兑现为"GC 停顿与堆大小解耦"的论文**。日常类比：图书馆按"借阅频率"分两个书架——高频书放门口小柜（频繁清点、几分钟搞完），低频书堆库房（半年盘一次）。整馆永远不会同时停摆。

它要解决的问题来自 [[cheney-gc]] 与 Baker 1978：每次 GC 都要扫整堆，堆从 1 MB 涨到 100 MB，停顿就从 10 ms 拉到 1 s——MIT Lisp Machine 上做交互式编程时，这种"刀片式卡顿"无法接受。Lieberman 与 Hewitt 实测发现：**长跑 Lisp 程序里，绝大多数对象在分配后几秒内就死了，少数对象会一直活到程序退出**。论文提出按"年龄段（generation）"切堆成多个 region，年轻 region 频繁、老 region 偶尔，每次只 condemn（凋谢）一个小 region，停顿正比于该 region 大小，与堆总大小无关。

这就是 generational GC 的 **正式起点**——比 Ungar 1984 的 Generation Scavenging 早一年。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么 1983 年的一个 Lisp Machine 想法，40 年后还是 JVM、V8、.NET CLR 的核心结构
- 为什么"real-time GC"与"generational GC"在论文里是 **同一个机制**（local scope 凋谢即天然 real-time）
- 为什么 JVM 调优永远绕不开 `-Xmn` / `SurvivorRatio`——它们是论文里 region 切分的工程化参数
- 为什么 V8 的 Scavenger / OrcaGC 至今仍叫"代际"——这套词汇就是 1983 年定下来的
- 为什么"write barrier"不是后来人加的补丁——entry table 就是它的雏形

## 核心要点

论文的机制可以拆成 **三层**：

1. **多 region 而非两 space**：Baker 1978 是 from-space / to-space 两片大平地，每次 GC 整片翻一次；Lieberman 把堆切成 N 个小 region，按 **generation 计数器** 标记年龄。新对象总在"当前年轻 region"分配，bump pointer 走起。

2. **Region condemnation（凋谢）**：选一个小 region 宣布"凋谢"，把里面活对象 evacuate（撤离）到更新的 region，原 region 整片释放。停顿 = 活对象数 × 复制成本，与全堆无关。这是 real-time 性质的根。

3. **Entry table（入口表）转接跨代指针**：老 region 里如果有指针指向年轻 region，凋谢年轻 region 时若不知情就漏扫。论文不让老指针直指年轻对象，而是 **强制走一张 per-region entry table**——老指针指向 entry table 槽位，槽位再指向真对象。凋谢时只看 entry table 当根集，老堆不动。这是后世 **write barrier + remembered set / card table** 的祖先。

三层合起来：**局部凋谢（柱 1+2） + 跨边界正确性（柱 3）**——既快又不漏标。

## 实践案例

### 案例 1：Lisp Machine 上的交互式 REPL

```lisp
(defun query-customer (id)
  (let* ((row (db-fetch :customer id))   ; 临时
         (addr (assoc :address row))     ; 临时
         (city (cdr addr)))              ; 临时
    (format-city city)))
```

**逐部分解释**：

- `row` / `addr` / `city` 全在当前年轻 region 里 bump pointer 分配
- 函数返回后这些 cons cell 立即不可达
- 下次 minor GC 凋谢年轻 region，活对象 < 5%，几毫秒搞完
- REPL 用户感觉不到卡顿——这就是 "real-time" 的体感目标

### 案例 2：Entry table 怎么挡住跨代漏标

```
老 region O:           年轻 region Y:
  [obj-A]                [obj-B]
   field ─┐               ↑
          │               │
          └→ entry-table-Y[5] ──┘
```

**逐部分解释**：

- A 想指向 B，不能直接存 B 的地址
- 真实指针存在 entry-table-Y 第 5 槽，A.field 存"槽 5"的引用
- 凋谢 Y 时：扫 entry-table-Y 当根集 → 复制 B → 更新槽 5 指向新地址
- O 内部完全没动——这就是 "扫一个 region 与 O 大小无关" 的实现保证

### 案例 3：现代 JVM 的直系映射

```
1983 论文          →  现代 JVM（HotSpot）
─────────────────     ─────────────────────────────
N 个 region        →  Eden / Survivor S0 S1 / Old
generation 计数器   →  对象头里的 age bit（4 bit）
region condemn     →  Minor GC（只扫 young）
entry table        →  Card Table（512 字节一格的脏页表）
evacuate 到新 region → tenuring 到 Survivor / Old
```

**逐部分解释**：

- HotSpot 把 1983 的 entry table 换成 card table——按地址 >> 9 做哈希，更紧凑
- "age bit" 直接对应论文的 generation 计数器
- 论文里"凋谢一个 region"工程化成"扫 Eden + 一片 Survivor"
- V8 / .NET / Go（部分）GC 都能在论文里找到原型

## 踩过的坑

1. **Entry table 的写入开销不是免费的**——每次写"老→新"指针都要走表，工业代码下 1-3% CPU 开销持续存在。后来的 card table 用粗粒度脏页换掉精确转接，开销压到 < 1%。

2. **Region 大小调不好就两头不讨好**——region 太小，凋谢频繁，元数据开销爆炸；region 太大，单次凋谢回到"近全堆"停顿，real-time 性质破功。论文给出经验值但没自动调整。

3. **Tenuring（晋升）阈值难定**——对象过早 promote 到老 region 会污染老堆触发不必要的大回收；过晚 promote 又让活对象在年轻 region 间反复复制。论文给了固定阈值，HotSpot 后来发展出按 survivor 占用率自适应。

4. **多核环境下 entry table 是竞争点**——论文是单处理器 Lisp Machine 的产物，多核同时写 entry table 会序列化。后世改成 per-thread local card table 才解决。

## 适用 vs 不适用场景

**适用**：

- 交互式语言运行时（Lisp、Smalltalk、Ruby、JS、Python）——表达式求值产生大量短命对象
- 请求-响应型服务（Web / RPC）——请求级临时对象在响应返回时全死
- 函数式语言（[[mccarthy-lisp]] 系）——cons / closure / 中间结果都短命

**不适用**：

- 嵌入式 / 极小内存（< 64 MB）——region 元数据开销吃掉一大块内存
- 长寿对象主导（in-memory DB、大缓存）——分代退化成"反复复制活对象"，纯负优化
- 软实时但要 < 1 ms（金融下单、音视频帧）——即便 minor GC 凋谢也会有毛刺，需 [[zgc]] / Shenandoah 这类并发疏散
- 完全栈式 / 编译期管理（[[tofte-talpin-regions]] 风格）——根本无运行时 GC，自然不需要

## 历史小故事（可跳过）

- **1960 年**：McCarthy 给 Lisp 发明 mark-sweep GC（见 [[mccarthy-lisp]]），最早的 tracing GC
- **1970 年**：Cheney 把递归扫描换成迭代复制（见 [[cheney-gc]]），但仍要扫整堆
- **1978 年**：Baker 给出 incremental copying GC，把停顿摊到 mutator 每次访问，启发"局部扫描"思路
- **1981 年**：Lieberman 写成 MIT AI Memo 569，在 Lisp Machine 内部流传
- **1983 年**：本篇 CACM 论文与 Hewitt 共同正式发表（13 页），把 generational hypothesis 兑现成代码
- **1984 年**：Ungar 在 Berkeley Smalltalk 独立做出 [[smalltalk-80]] 的 Generation Scavenging，工程更完整，业界把两人并列为 generational GC 之父
- **1990s 起**：HotSpot、V8、.NET CLR 全部以本论文为蓝本设计 GC

## 学到什么

1. **统计观察可以撬动算法设计**——"90% 对象短命"不是定理，是经验，但敢把经验固化成机制就能换 10× 性能
2. **正确性靠"边界处加一层间接"**——entry table 的本质是"跨边界引用必须显式登记"，这条原则在分布式系统、内存模型、模块边界都成立
3. **Real-time 不靠并发，靠局部**——论文没用并发线程，只用"每次只动一小块"就拿到了停顿有界，比并发简单一个数量级
4. **理论 → 论文 → 工程，每一步隔一代**：1978 Baker 想法 → 1983 Lieberman-Hewitt 论文 → 1990s HotSpot 工程化 → 2020s ZGC 走出分代再回归——一篇 13 页的 CACM 撑起了 40 年内存管理的脊梁

## 延伸阅读

- 论文原文：[Lieberman & Hewitt 1983 (CACM)](https://dl.acm.org/doi/10.1145/358141.358147)（13 页，原汁原味）
- 早期 memo：[MIT AI Memo 569 (1981)](https://dspace.mit.edu/handle/1721.1/6335)（论文前身，更长更细）
- 教材：Jones & Lins《Garbage Collection》第 7 章（generational GC 章节，把本论文展开成 30 页）
- 教材进阶：Jones / Hosking / Moss《The Garbage Collection Handbook》（2023 第二版）
- 实战：[OpenJDK HotSpot GC Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)（看 1983 思想 40 年后的工业参数）
- [[generational-gc]] —— 同一思想的概念总览页
- [[cheney-gc]] —— 直接前作，提供 copying 基础
- [[zgc]] —— 现代低延迟 GC，最初放弃分代，2023 后加回

## 关联

- [[cheney-gc]] —— 1983 论文直接在 Cheney 半空间复制上扩展，加 region + generation 维度
- [[mccarthy-lisp]] —— GC 起源；本论文跑在 Lisp Machine，研究的就是 Lisp 程序的对象寿命
- [[generational-gc]] —— 概念页，本笔记是其原始论文的精读
- [[boehm-gc]] —— 保守式 GC，思路互补：不改编译器但失精度；本论文要求精确扫描
- [[smalltalk-80]] —— Ungar 1984 在 Smalltalk 上做工程化版，与本论文并列为分代 GC 之父
- [[zgc]] —— 现代并发 GC，证明"分代"不是低延迟唯一解，但 2023 后又加回分代
- [[tofte-talpin-regions]] —— 编译期 region 推断，与本论文运行时 region 思路互为映照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[g1-collector]] —— G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[smalltalk-80]] —— Smalltalk-80
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器

