---
title: big.LITTLE — 让一颗芯片同时装快核和省电核
来源: Peter Greenhalgh, "big.LITTLE Processing with ARM Cortex-A15 & Cortex-A7", ARM White Paper, September 2011
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 入门
provenance: pipeline-v3
---

## 是什么

**big.LITTLE** 是 ARM 在 2011 年提出的一套异构多核设计：把两种性能/功耗特征不同、但**指令集完全相同**的 CPU 核放进同一颗芯片，操作系统根据当前任务的轻重，把线程**搬**到合适的核上跑。

日常类比：一辆混动汽车有汽油机和电动机两套动力，市区慢慢挪用电动机省电，上高速踩油门用汽油机出力。big.LITTLE 干的就是这件事，只不过汽油机叫 **Cortex-A15**（big 核，追性能），电动机叫 **Cortex-A7**（LITTLE 核，追能效）。

关键的"诡计"在于：**两种核共享同一套 ARMv7-A 指令集**，所以同一个二进制无需重新编译，就能在任一种核上跑。线程从 big 搬到 LITTLE 时，软件甚至感觉不到——就像跑在同一颗 CPU 上，只是变快或变慢。

为什么要这么设计？背后的物理直觉是：**晶体管做大一倍，性能涨一点点，功耗涨很多**。要让一颗核既能在峰值飙性能，又能在空载省到极致，单一设计无法同时满足。那就**做两种核，各管一段**——这是用"空间换时间维度上的效率"。

## 为什么重要

不理解 big.LITTLE，下面这些事都没法解释：

- 为什么手机能**待机一整天又能打游戏不卡**——平时 LITTLE 核挂着省电，重活才唤醒 big 核
- 为什么苹果 M 系列、Intel 12 代 P/E 核、AMD Zen5c 都长得"类似"——都是 big.LITTLE 思想的徒孙
- 为什么 Linux 内核的 **EAS（Energy Aware Scheduler）** 是手机标配——它就是从 big.LITTLE 的 GTS 演进来的
- 为什么"性能 vs 功耗"过去 15 年从二选一变成"按需切换"——这是移动芯片最关键的架构转折

## 核心要点

big.LITTLE 由三件事组成：

1. **两种核，一套指令集**：A15 是 3 发射乱序、深流水线，跑得快但费电；A7 是双发射顺序、浅流水线，慢但极省电。**ISA 必须完全相同**，否则迁移线程就要翻译指令，代价无法接受。

2. **集群间缓存一致性**：两簇核之间用 **CCI-400**（Cache Coherent Interconnect）连起来，硬件保证 big 簇和 LITTLE 簇看到的内存视图一致。线程迁移时**不需要软件刷缓存**，硬件自己同步。

3. **三种调度模式**（按 OS 介入深度从浅到深）：
   - **Cluster Migration**：整簇切——要么全用 big，要么全用 LITTLE。最简单，但浪费。
   - **CPU Migration**：核对核切——每个 big 核配一个 LITTLE 核，软件二选一。
   - **Global Task Scheduling（GTS）**：OS 看到所有核，自由调度。最灵活，对调度器要求最高。

迁移本身的机制也值得拆开看：当 OS 决定把一个线程从 A15 搬到 A7，硬件会**保存当前核的寄存器状态**，通过 CCI-400 把缓存中"脏的部分"刷给目标核所在簇，然后在 A7 上恢复寄存器，从断点继续执行。整个过程对应用程序透明——它只感觉到"突然变慢了一点"，但不会出错。

## 实践案例

### 案例 1：ARM 给的能效对比

- 跑同一个轻负载（比如刷网页滚屏），**A7 大约比 A15 省 3-4 倍功耗**
- 跑同一个重负载（比如解压缩），**A15 比 A7 性能高 2-3 倍**
- 所以"轻活给 LITTLE、重活给 big"的搭配，能在不牺牲峰值性能的前提下，把日常待机功耗压下去

### 案例 2：三星 Exynos 5410（Galaxy S4，2013）

- 4 颗 A15 + 4 颗 A7，共 8 核
- 第一代用的是 **Cluster Migration**——同一时刻只有一簇在跑
- 这种设计简单但浪费，**4 颗 LITTLE 核闲着就是闲着**
- 后来 Exynos 5433 / 骁龙 810 升级到 GTS，**8 核可同时工作**

### 案例 3：Linux EAS 是 GTS 的延续

- Android 内核里的 EAS（Energy Aware Scheduler）就是 GTS 思路的直接产物
- 调度器读取每个核的"能效曲线"（性能 vs 功耗），决定线程放哪
- 今天**几乎所有 Android 旗舰机的 Linux 内核都跑 EAS**——big.LITTLE 的影响远超 ARM 自己的产品线

### 案例 4：苹果 M1 的 4 + 4 配置

- M1 是 4 颗 Firestorm（big）+ 4 颗 Icestorm（LITTLE），共 8 核
- 苹果没有用"big.LITTLE"这个名字（用了"performance/efficiency core"），但思想一致
- macOS 的 GCD（Grand Central Dispatch）会给每个任务打 **QoS 标签**——background 类任务自动派给 Icestorm，user-interactive 派给 Firestorm
- 这是"调度策略由应用主动声明"的思路，比纯靠 OS 推断更精准

### 案例 5：Intel 12 代 P/E 核与 Thread Director

- Intel Alder Lake（2021）首次在桌面 x86 引入 P 核（Performance）+ E 核（Efficiency）
- 比 ARM 难的地方在于：x86 历史包袱重，**确保两种核的指令集完全一致**花了多年——E 核最终砍掉了 AVX-512 才能与 P 核对齐
- Intel 加了一个新硬件特性 **Thread Director**：CPU 实时上报每个线程当前的"性能特征"给 OS，让调度器决定迁移
- 这是 big.LITTLE 思路在 x86 的本土化——核心矛盾完全相同：**ISA 一致性 + 调度感知**

## 踩过的坑

1. **迁移本身有成本**：线程从 big 切到 LITTLE，**缓存是冷的、TLB 要重填**——切得太频繁，反而拖慢。早期调度器没考虑这点，频繁抖动。

2. **OS 调度器要懂硬件**：Android 早期 GTS 实现差，**旗舰机跑分输给非 big.LITTLE 设计**。直到 EAS 成熟，big.LITTLE 才算真正"赢"。

3. **性能监控指标不统一**：A15 上 1 个 cycle 的工作量和 A7 上不同，**profile 工具要做核类型适配**，否则数据失真。

4. **ISA 必须完全一致**：这是死规则。如果 big 核多了一条指令，LITTLE 核没有，线程一旦迁移过去就崩——所以 ARM 必须**严格冻结两种核的 ISA 边界**。

5. **跑分软件失真**：传统跑分工具假设所有核同构，看到 8 核就用 8 个最重负载满载。在 big.LITTLE 上反而把 LITTLE 核也跑出 100%，**测出来的"性能"不真实**——后来 Geekbench 等工具才加上多核异构感知。

6. **应用线程池假设错位**：很多 Java/JVM 应用读 `Runtime.availableProcessors()` 拿到 8，开 8 个工作线程。但实际上 4 个 LITTLE 核跑这种任务**会被拖累**。优秀的运行时（如 Android ART）后来引入 QoS 提示，让用户层标记任务类型。

## 适用 vs 不适用场景

**适用**：

- 电池供电的设备（手机 / 笔记本 / IoT 终端）——续航是硬约束
- 负载方差大的任务（前台交互 vs 后台同步）——可以充分利用两种核
- 需要峰值性能但又需长时间待机——典型的智能手机场景

**不适用**：

- 服务器持续高负载——big 核全开就行，LITTLE 核闲置反而占面积浪费
- 实时系统——迁移延迟不可预测，做不到硬实时
- 单线程极致延迟敏感的场景——线程不该被搬动
- 嵌入式 MCU 级别的简单设备——这种地方用一颗 LITTLE 核就够，不需要异构

## 历史小故事（可跳过）

- **2005-2010**：ARM 内部察觉一个矛盾——单一核越做越大、越费电，但手机大部分时间在干轻活，浪费。
- **2011-09**：Greenhalgh 发表白皮书，**首次系统提出 big.LITTLE 概念**。这不是学术论文，是工程白皮书——但比很多顶会论文影响大。
- **2013**：三星 Exynos 5410（Galaxy S4）首发，Cluster Migration 模式。
- **2014-2015**：GTS 在 Exynos 5433 / 骁龙 810 落地，big.LITTLE 进入"全核可用"时代。
- **2017**：ARM 推出 **DynamIQ**，把 big 和 LITTLE 放进**同一个 cluster**——共享 L3 缓存，迁移成本进一步降低。
- **2020**：苹果 M1 发布，**Firestorm + Icestorm** 把这套思路搬上桌面级芯片。
- **2021**：Intel Alder Lake（12 代酷睿）推出 **P 核 + E 核**，x86 阵营也走上这条路。
- **2024**：AMD Zen5 + Zen5c（密度优化版）也走上类似路线——**异构已经是 CPU 的默认形态**，而不再是手机专属。

## 学到什么

1. **同构与异构的边界由 ISA 决定**：核可以不同，但指令集必须一致——这是异构多核能"对软件透明"的根本前提。
2. **架构转折点不一定来自学术界**：big.LITTLE 是工程白皮书，但定义了之后 15 年的 CPU 形态。论文不一定要写满理论才有价值。
3. **OS 必须懂硬件**：硬件给了能力，软件没接住就白搭。GTS → EAS 的演进史就是反复打磨调度器的过程。
4. **峰值与平均同样重要**：big.LITTLE 的精髓不是"让芯片更快"，而是"让平均功耗降下来"——这是移动时代的核心 KPI 转换。
5. **"软件透明"是个分层概念**：对应用代码透明（不用改 ISA），对内核调度器**不透明**（必须懂能效曲线）——分层透明是异构系统设计的常见手法。
6. **抽象层级可以推下来**：DynamIQ 把"两簇核"压到"同簇异核"，再到苹果 M1 的"P/E 核共享 L2"——抽象边界不断下移，让迁移成本逼近 0。这是工程上"先解耦，后融合"的典型路径。

## 延伸阅读

- 白皮书原文：[ARM big.LITTLE Processing](https://web.archive.org/web/20120130124543/http://www.arm.com/files/downloads/big_LITTLE_Final_Final.pdf)（10 页，工程语言友好）
- Linux EAS 文档：[kernel.org Energy Aware Scheduling](https://www.kernel.org/doc/html/latest/scheduler/sched-energy.html)
- DynamIQ 介绍：ARM 官方博客（2017），把 big 和 LITTLE 装进同一 cluster
- Anandtech《Hot Chips 2017: ARM DynamIQ》——技术媒体对 DynamIQ 的深度解读
- 苹果 M1 实测：Anandtech 的 Firestorm 微架构剖析，能看到大核宽度有多夸张
- Intel Thread Director 白皮书——x86 怎么解决 ARM 早就解决的问题
- [[ampere-architecture-2020]] —— 同样是体系结构白皮书风格
- [[amdahl-law-1967]] —— 异构核也是 Amdahl 定律的工程回应（顺序部分用快核加速）

## 关联

- [[ampere-architecture-2020]] —— 体系结构白皮书的另一个范本，从消费 CPU 到数据中心 GPU 的对照
- [[amdahl-law-1967]] —— big 核加速的就是程序里"必须串行"的那一段
- [[alpa-2022]] —— 同样是"异构资源调度"的思想，只不过对象从 CPU 核换成了张量并行
- [[ssa]] —— 编译器内部表示也讲"软件透明 + 编译器懂硬件"，套路异曲同工
- [[kildall-dataflow]] —— OS 调度器选核的过程，本质是在能耗-性能格上做数据流分析

## 给零基础学习者的一句话

如果你现在用的手机或笔记本是 ARM / Apple Silicon / Intel 12 代之后，你**正在用 big.LITTLE**。打开活动监视器看看哪些核在 100%、哪些核接近 0%——那就是这篇 2011 年白皮书的现实倒影。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[amdahl-law-1967]] —— Amdahl 定律 — 串行比例决定并行加速比的上界
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[rt-thread]] —— RT-Thread — 中文社区主导的物联网 RTOS
- [[ssa]] —— SSA — 静态单赋值形式

