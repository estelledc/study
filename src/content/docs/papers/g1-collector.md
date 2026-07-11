---
title: G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
来源: 'Detlefs, Flood, Heller, Printezis. "Garbage-First Garbage Collection". ISMM 2004'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

G1（**Garbage-First**）是一种**让你告诉它"我能容忍多长暂停"，它就尽量贴着这个预算去回收**的垃圾回收器。日常类比：像一个外卖调度员，你说"15 分钟内必须送到"，他就只挑能在 15 分钟内跑完的那几单。

它把整个堆切成大小相等的小格子（叫 **region**，一般 1-32MB），并发地估算每个格子里"垃圾占比"。真正暂停应用线程时（**STW**，stop the world），它只挑垃圾最多的那几个格子搬出存活对象——所以叫 garbage-first。

```
堆 = [格1][格2][格3]...[格2048]
       40%   90%   10%        ← 各格垃圾比例
              ↑
          先回收这个
```

Java 9 起，HotSpot JDK 默认就是 G1。你跑 `java -XX:+PrintFlagsFinal | grep UseG1GC` 看到 `true`，就是它在干活。

## 为什么重要

不理解 G1，下面这些事都没法解释：

- 为什么 Java 后端能在几十 GB 堆上还把暂停压到 200ms 以内——而 CMS / ParallelGC 做不到
- 为什么 `-XX:MaxGCPauseMillis` 是"目标"不是"保证"——G1 是预算调度器
- 为什么有时 G1 突然来一次几秒的 full-GC，叫 evacuation failure，是 to-space 装不下的退化
- 为什么后来的 Shenandoah / [[zgc]] 仍说自己继承 G1，又要把暂停压到 10ms 以下

## 核心要点

G1 的工作模型可以拆成 **三件事**：

1. **region 化堆**：把连续大堆切成小格子，每个格子可以独立当 young / old / humongous 用。类比：把一大片菜地切成田字格，可以单格翻土，不必整片翻。

2. **remembered set（RSet）跨格记账**：每个格子记"哪些别的格子里的对象引用了我"。回收时不用扫整堆，只扫这个 region 的 RSet。代价是写屏障——每次给对象赋指针都要更新 RSet，吞吐量打个折。

3. **并发标记 + STW evacuation 两步走**：后台线程并发跑 SATB（snapshot-at-the-beginning）算法标记存活对象；暂停应用时只做"拷贝存活对象到新 region"这一件事，且只挑预算允许的几个 region。

三件加起来叫 **garbage-first 策略**：每次回收都把"性价比最高的几格"搬空。

## 实践案例

### 案例 1：典型 Java 后端调参

```bash
java \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -Xms8g -Xmx8g \
  -XX:G1HeapRegionSize=8m \
  -jar app.jar
```

**逐部分解释**：

- `MaxGCPauseMillis=200`：告诉 G1 "我希望每次 STW ≤ 200ms"，它会反推"那这次能搬几个 region"
- `Xms = Xmx`：堆固定，避免动态扩缩带来的额外暂停
- `G1HeapRegionSize=8m`：手动设 region 大小（默认按堆大小自适应）

跑起来后看 `gc.log` 里 `Pause Young (Mixed) (G1 Evacuation Pause)` 行的耗时，看是否贴着 200ms。

### 案例 2：region 模型怎么省扫描

CMS 一次 minor GC 要扫**整个老年代**找指向 young 的引用。G1 不用：

```
young region 1 的 RSet：[old-region-7, old-region-42]
                                ↑
              回收 young region 1 时只扫这两个
```

这就是 region + RSet 让 incremental 成立的关键——把"扫整堆"变成"扫指向我的几格"。

### 案例 3：humongous 对象的特殊路径

```java
byte[] big = new byte[20_000_000]; // 20MB，远大于 region/2
```

如果 region size = 8MB，这个对象占 3 整 region，叫 **humongous**。G1 把它直接放到 old generation，不在 eden / survivor 里挪。频繁分配 humongous 会让 old gen 碎得很快——这是 G1 一个常被踩的坑。

## 踩过的坑

1. **region 大小没调好**：region 太小（如 1MB）让 RSet 膨胀拖慢写屏障；太大（如 32MB）让单次 evacuation 拷贝量陡增。默认自适应一般够用，手动调要先压测。

2. **humongous 对象频繁触发并发周期**：分配大数组会直接吃 old region，触发"InitialMark"。代码里能避免就拆小或用堆外。

3. **MaxGCPauseMillis 设得太低**：给 50ms G1 会过度小批回收，单次搬不动多少，反而**频繁暂停 + 总吞吐降**。一般 200-500ms 是稳妥起点。

4. **evacuation failure 长尾**：to-space 没空 region 接收存活对象时，退化成 serial full-GC，可能停几秒。日志里 `to-space exhausted` 是危险信号，常见原因是堆占用 80%+ 持续没回落。

## 适用 vs 不适用场景

**适用**：
- 大堆（几 GB 到几十 GB）的服务器端 Java 应用
- 对暂停敏感但能接受 100-500ms 的业务（电商、支付、API 网关）
- 需要可预测暂停 + 高吞吐二者兼顾的场景
- JDK 9+ 默认环境，不想折腾参数

**不适用**：
- 极低延迟（<10ms 暂停）→ 用 [[zgc]] 或 Shenandoah
- 极小堆（<2GB）→ ParallelGC 吞吐更高，G1 的 region/RSet 开销不划算
- 批处理 / 离线计算（吞吐至上）→ ParallelGC
- 实时系统硬约束 → 任何 stop-the-world GC 都不合适，参考 [[lieberman-realtime-gc]]

## 历史小故事（可跳过）

- **1980s**：Lieberman & Hewitt 提出 incremental GC 思路——不必一次扫完整堆。
- **1990s**：Hudson、Henderson 等人做 **train algorithm**，把老年代切成"车厢"分批回收，思想上是 region 的前身。
- **2001-2003**：Sun JVM 团队在做 CMS（concurrent mark sweep），但 CMS 不压缩堆，长期跑会碎片化最后 full-GC。
- **2004**：Detlefs 等人在 ISMM 论文里把 region + concurrent + 暂停目标三件事整合，提出 G1。
- **2009-2012**：JDK 6u14 实验，JDK 7u4 正式发布。
- **2017**：JDK 9 起 G1 成为默认 GC。后续每个版本都在优化（JDK 11/15/17 改进 mixed GC 与并发标记）。

之后 Shenandoah / ZGC 在 G1 基础上把暂停继续压到 10ms 以下，但 G1 仍是吞吐 / 延迟平衡的工业基线。

## 学到什么

1. **GC 也可以"按预算调度"**：传统 GC 等你回收时才决定停多久；G1 反过来，你给预算它适配
2. **把堆切成格子是杀手锏**：region 让"暂停时间和回收量解耦"成为可能，是 incremental 路线的工程化关键
3. **写屏障是有代价的**：RSet 不是免费午餐，每次写指针都打折，G1 的吞吐比 ParallelGC 低 5-10%，换回的是可预测暂停
4. **soft real-time 不是 hard real-time**：G1 不能保证暂停一定 ≤ 目标值，evacuation failure 时仍会长尾
5. **理论 → 工程 → 默认**：从论文到生产默认花了 13 年（2004 → 2017），工业级 GC 调优周期就是这么长

## 延伸阅读

- 视频教程：[Monica Beckwith — Understanding G1 GC](https://www.youtube.com/watch?v=QQAuMVFmTWE)（G1 原作团队成员讲，1 小时把整套机制讲完）
- 官方文档：[Oracle — Java HotSpot Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/garbage-first-g1-garbage-collector1.html)（参数列表 + 调优顺序）
- 论文 PDF：[Detlefs et al. 2004 — Garbage-First Garbage Collection](https://www.cs.purdue.edu/homes/hosking/690M/p37-detlefs.pdf)（12 页正文）
- [[generational-gc]] —— G1 也分代，新生代 / 老年代由 region 标签决定
- [[zgc]] —— G1 的接班人，把暂停压到 10ms 以下
- [[immix-mark-region]] —— 同样 region 思路但走 mark-region 路线，G1 走 evacuation

## 关联

- [[generational-gc]] —— G1 沿用代际假设，新对象死得快，先扫 young region
- [[cheney-gc]] —— Cheney 1970 拷贝算法是 G1 evacuation 的祖先，区别是 G1 拷贝粒度是 region 不是整堆
- [[boehm-gc]] —— Boehm 保守 GC 是另一条路（不动对象只扫指针），G1 是精确 + 可移动
- [[immix-mark-region]] —— Immix 同样把堆切成 region，但用 mark-region 而非 evacuation
- [[zgc]] —— ZGC 借了 G1 的 region 思想再加 colored pointers，把暂停继续压低
- [[lieberman-realtime-gc]] —— Lieberman 提出 incremental GC 概念，G1 是工程实现的代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
