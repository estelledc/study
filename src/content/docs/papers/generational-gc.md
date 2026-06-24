---
title: Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
来源: 'Lieberman & Hewitt, "A Real-Time Garbage Collector Based on the Lifetimes of Objects", CACM 1983'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Generational GC（**分代垃圾回收**）是一种把**堆内存**切成"年轻区 + 年老区"的回收策略。日常类比：像便利店清理临期食品——前台冰柜（小、周转快）每两小时盘一次，后仓储（大、慢）每月才盘一次。盘小冰柜只需几秒，盘后仓得停业半天。

它要解决的老问题是**全堆扫描太慢**。早期 Lisp 用 [[cheney-gc]]，每次回收都把整个堆从头到尾扫一遍：堆从 10 MB 涨到 1 GB，单次 GC 卡顿就从毫秒级变成秒级，REPL 一卡数秒，体验崩盘。

Lieberman 与 Hewitt 在 MIT Lisp Machine 上观察到一个关键统计偏斜：**90% 对象在分配后很快死亡**。他们把堆切成小新生代（young）和大老年代（old），频繁扫 young（小、回收率高、几乎全死），偶尔才整堆扫一次。这个 1983 年的想法是今天 JVM、V8、.NET CLR GC 的共同祖先。

## 为什么重要

不理解分代 GC，下面这些事都没法解释：

- 为什么 JVM 调优到处提 `-Xmn` / `NewRatio` / `SurvivorRatio` 这些参数
- 为什么 Java Web 服务能扛百万 QPS——大多数对象在响应返回时就被 minor GC 清掉了
- 为什么 ZGC、Shenandoah 这些"低延迟 GC"反而一开始**放弃了分代**，到 2023 又加回来
- 为什么程序"明明没用多少内存却频繁 full GC"——可能是大对象绕过分代直进 old 区

## 核心要点

分代 GC 站在三根互相支撑的柱子上：

1. **弱分代假设**：新分配的对象大多很快死。类比：刚拆封的快递盒子，绝大多数当天就进垃圾桶；放了一周还没扔的，往往会一直留着。这条假设让"频繁扫小新生代"在统计上划算。

2. **跨代引用追踪**：minor GC 只扫 young，但 old 区可能有指针指向 young 对象，漏扫就会把活的当成死的。解法是 **write barrier**——每次写指针时，编译器自动塞两三条机器指令进去，把"老年代某个位置写过新生代指针"记到 **card table**（一张 64 字节一格的脏页表）。下次 minor GC 把脏卡当根集补扫。

3. **age 阈值与晋升（promotion）**：对象在新生代熬过 N 次 minor GC 后被搬到老年代，避免反复复制。HotSpot 默认 N=15（4 bit 计数），并按 survivor 占用率自适应调整。

三件事合起来：扫得快（柱 1） + 不漏标（柱 2） + 不重复搬（柱 3）。

## 实践案例

### 案例 1：Web 服务请求处理（短命对象密集）

```java
// 每次 HTTP 请求产生一堆临时对象
public Response handle(Request req) {
    JsonNode body = parser.parse(req.body());     // 临时
    UserDto user = mapper.toDto(body);            // 临时
    return Response.ok(service.save(user));       // user 也是临时
}
```

**逐部分解释**：

- 进入 handle 时分配的 `body` / `user` / `mapper` 中间状态全在 Eden 区，bump pointer 分配 O(1)
- 响应返回后这些对象立刻不可达，下次 Eden 满触发 minor GC，活对象通常 < 5%
- 只搬运极少数活对象到 Survivor，停顿正比于 young 活对象数（与堆总大小无关）——这就是为什么 Java 服务能堆到 32 GB 还保持亚秒级停顿

### 案例 2：write barrier 的实际开销

```c
// HotSpot post-write barrier 大致 3 条 x86 指令
obj->field = new_val;                  // 1. 真实写入
size_t card = (size_t)obj >> 9;        // 2. 算 card 索引（>> 9 = 除以 512）
card_table[card] = 0;                  // 3. 标脏（约定 0 表脏）
```

**逐部分解释**：

- 每次给"对象的指针字段"赋值，编译器自动多塞 2 条指令——这是分代 GC 的隐性税
- 写多读少的程序（图算法、ORM、in-place 数组更新）能感受到 3-15% 持续 CPU 开销
- JIT 编译器（C2 / Graal）会消除冗余 barrier：能证明 obj 是新分配未逃逸的，barrier 直接省掉，因此热路径上的临时对象通常零成本

### 案例 3：JVM 调优实战看分代健康度

```bash
# jstat 每秒输出一次分代统计
jstat -gcutil <pid> 1000
# S0    S1    E     O     M    YGC  YGCT  FGC  FGCT
# 0.00 75.30 60.20 45.10 95.0  120  0.450  3   0.180
```

**逐部分解释**：

- `E` 是 Eden 占用百分比，逼近 100% 触发 minor GC（YGC 计数 +1）
- `S0` / `S1` 是两个 Survivor 占用百分比；长期接近 100% 说明 survivor 太小，对象会被强制晋升
- `O` 是 Old 区占用——若它每次 minor GC 后都涨，说明 promotion 量过大，要增大 `-Xmn` 而不是整堆
- `YGCT` / `FGCT` 是累计停顿秒数，用 `YGCT/YGC` 算单次平均，超过 50 ms 就该警觉
- `FGC` 是 full GC 次数，明显增长就该排查（常见：大对象直进 old 或对象池晋升风暴）

## 踩过的坑

1. **弱分代假设在持久缓存 / 对象池场景失效**——若对象都活很久，每次 minor GC 把活对象从 Eden 搬到 Survivor 再到 Old，反复搬运成本叠加，分代反成负优化。

2. **write barrier 是写入时的隐性税**——写多读少程序持续 3-15% CPU 开销；编译器消除不到的位置永远存在；NUMA 大堆上多核同时写卡表还会触发 cache line false sharing。

3. **premature promotion**——survivor 太小或 age 阈值过低，本该死的对象被强制晋升到 old，污染 old 区，触发不必要的 full GC，常见于流量突发期。

4. **大对象绕过分代直进 old**——HotSpot 默认 > Eden TLAB 阈值（约 8 KB）的对象直接分配在 old，避免在 young 间复制。但若程序频繁产生大数组、大字符串，等于绕开分代机制，full GC 频率飙高，需要单独的大对象堆（LOH）来管。

## 适用 vs 不适用场景

**适用**：

- Web 服务 / RPC 系统——请求级短命对象密集，弱分代假设强成立
- 解释器 / 编译器中间态（Lisp、Smalltalk、Ruby、JS）——表达式求值产生大量临时
- 业务系统的"短期幂等查询缓存"——一两秒就失效，永远不晋升到 old

**不适用**：

- in-memory 数据库 / 大缓存系统——对象都活很久，分代退化为额外搬运
- 极低延迟需求（< 1 ms 停顿）——即便 minor GC 也会引入毛刺，需用 [[zgc]] / Shenandoah 这类并发疏散 GC
- 内存极小的嵌入式（< 64 MB）——三段式分配反而浪费空间，单代 mark-sweep 更紧凑
- 写密集图算法 / 科学计算——write barrier 成本压过分代收益，可能反不如手动管理（[[tofte-talpin-regions]]）

## 历史小故事（可跳过）

- **1960 年**：McCarthy 给 Lisp 设计 mark-sweep GC（见 [[mccarthy-lisp]]），最早的 tracing GC，但要扫整堆
- **1970 年**：Cheney 发表半空间复制 GC（见 [[cheney-gc]]），把回收变成线性时间但仍要扫整堆
- **1978 年**：Baker 提出 real-time 增量 GC，启发"局部扫描"的思想
- **1983 年**：Lieberman 与 Hewitt 在 CACM 发表本论文，首次把对象寿命统计偏斜兑换成"局部扫描即可"
- **1984 年**：Ungar 在 [[smalltalk-80]] 上做出工程更完整的 Generation Scavenging，被业界采纳为标准做法
- **2004 起**：HotSpot G1 GC、V8 Orinoco、.NET CLR GC 都以本论文为蓝本

## 学到什么

1. **统计偏斜可以兑换工程性能**——90% 对象短命的经验观察，撬动了 GC 性能 10×
2. **正确性边界用 write barrier 守住**——任何"局部优化"都要配一套机制处理跨边界引用，否则就是漏标内存崩溃
3. **理论假设有失效域**——弱分代假设不是定理，缓存系统、对象池等场景下系统性失效，盲目套用反而慢
4. **分代是"够用"不是"最优"**——并发 GC（ZGC / Shenandoah）证明对低延迟目标，连续微扫描比分代更直接

## 延伸阅读

- 论文 PDF：[Lieberman & Hewitt 1983 (CACM)](https://dl.acm.org/doi/10.1145/358141.358147)（13 页，原汁原味）
- 教材：Jones & Lins《Garbage Collection》（GC 算法的圣经，第 7 章专讲分代）
- 教材进阶：Jones / Hosking / Moss《The Garbage Collection Handbook》（2023 第二版，覆盖到 ZGC、Shenandoah）
- 调优手册：[OpenJDK GC Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- 实战博文：Aleksey Shipilev 的 JVM Anatomy Quark 系列（讲 TLAB / safepoint / barrier 这些底层细节）
- [[cheney-gc]] —— 分代 GC 的前作，提供半空间复制基础
- [[zgc]] —— 现代低延迟 GC，最初放弃分代，2023 后加回

## 关联

- [[cheney-gc]] —— 分代 GC 直接基于 Cheney 半空间复制扩展到分代
- [[mccarthy-lisp]] —— GC 概念的源头，没有 Lisp 就没有 tracing GC
- [[boehm-gc]] —— 保守式 GC，适合 C/C++ 等不能精确扫栈的语言，与分代 GC 思路互补
- [[smalltalk-80]] —— Ungar 1984 在 Smalltalk 上做出工程化的 Generation Scavenging
- [[zgc]] —— 现代并发 GC，证明"分代"不是低延迟的必要条件
- [[tofte-talpin-regions]] —— Region-based 内存管理，编译期决定释放点，无运行时 GC

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[g1-collector]] —— G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[lieberman-realtime-gc]] —— Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[smalltalk-80]] —— Smalltalk-80
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器

