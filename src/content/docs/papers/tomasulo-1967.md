---
title: Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序
来源: 'Tomasulo, R. M., An Efficient Algorithm for Exploiting Multiple Arithmetic Units, IBM Journal of Research and Development, Vol. 11 No. 1, Jan 1967'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tomasulo 算法是 IBM 工程师 Robert Tomasulo 在 1967 年为 System/360 Model 91 设计的一套**让 CPU 在运行时动态决定指令执行顺序**的方法。日常类比：像一个高效的厨房——配菜员（CPU 前端）按菜单顺序写单，但灶台（执行单元）谁的食材先备齐谁先开火，不必死等菜单顺序。

你写一段普通代码：

```c
a = b + c;
d = e + f;
g = a + d;
```

按"先写先做"的死板规则，第三行得等前两行都算完。Tomasulo 让 CPU 看出"前两行互不依赖"，**同时**送进两个加法器一起算，第三行等结果广播回来再算。三步可能压成两步。

这套机制的三大件——**保留站**（reservation station）、**寄存器重命名**（register renaming）、**公共数据总线**（CDB）——构成了现代所有超标量乱序 CPU 的核心骨架。Apple M 芯片大核、x86 Zen、ARM Cortex-A 内部都是 Tomasulo 的徒孙。

## 为什么重要

不理解 Tomasulo，下面这些事都没法解释：

- 为什么现代 CPU 主频卡在 5 GHz 二十年，性能却年年涨——靠**同时跑多条指令**而不是更快跑一条
- 为什么 CPU benchmark 经常出现"实际 IPC 大于 1"——一个时钟周期跑完不止一条指令，靠的就是乱序发射
- 为什么编译器优化和 CPU 调度看起来在做重叠的事——编译器是静态调度，CPU 是动态调度，互补不替代
- 为什么 Spectre / Meltdown 这类侧信道漏洞会出现在 2018——它们的根因正是 Tomasulo 的"投机执行"（speculative execution）后代

## 核心要点

Tomasulo 解决的核心问题是**数据冲突**，分三类：

1. **RAW**（读后写，read-after-write）：真依赖。下一条要读上一条写的值，必须等。
2. **WAR**（写后读）和 **WAW**（写后写）：**假冲突**。只是因为两条指令偶然用了同一个寄存器名。

算法三大件如何配合：

1. **保留站**：每个执行单元（加法器、乘法器）前面挂一个等待区，存放"已经发射但操作数没全到位"的指令。类比：餐厅每个灶台旁的备餐台，菜单已经下了，但还在等某个食材。

2. **寄存器重命名**：当一条指令要写寄存器 R5，CPU 不真写 R5，而是把这条指令所在的**保留站编号**当作 R5 的"临时身份证"（tag）。后面所有读 R5 的指令记住这个 tag。WAR / WAW 假冲突自动消失——因为每次写都换新身份。

3. **公共数据总线 CDB**：执行单元算完后，把 `(tag, 结果值)` 广播到所有保留站。谁的等待格里写着这个 tag，谁就把它替换成具体值，操作数齐了立刻发射。

整个过程没有"等前一条指令算完"这种线性逻辑，只有"我等的 tag 到了没"。

## 实践案例

### 案例 1：假冲突如何消失

```
i1: R1 = R2 + R3
i2: R1 = R4 + R5
```

按朴素流水线，i2 要等 i1 写完 R1 才能写——这是 WAW 假冲突。Tomasulo 的做法：

- i1 发射时分到保留站 RS1，R1 临时身份变成 `tag=RS1`
- i2 发射时分到保留站 RS2，R1 临时身份立即被覆盖成 `tag=RS2`
- 两条指令在不同物理位置并行算，互不影响

后续读 R1 的指令拿到的永远是**最新的 tag**，正确性保住了。

### 案例 2：CDB 怎么唤醒等待者

```
i1: R3 = R1 * R2     (慢，乘法 4 周期)
i2: R5 = R3 + R4     (依赖 i1 的结果)
```

时间线：

1. 周期 1：i1 进乘法器保留站，i2 进加法器保留站，i2 的第一个操作数标记为 `等 tag=RS_mul`
2. 周期 2-4：乘法器在算，i2 在保留站睡觉
3. 周期 5：乘法器算完，把 `(tag=RS_mul, 值=42)` 广播到 CDB
4. 周期 5 同周期：i2 的保留站监听 CDB，看到自己等的 tag 来了，把 `42` 填进操作数槽，下周期发射

i2 没有反复轮询，是 CDB 主动喊它。

### 案例 3：现代 CPU 的影子

打开 Intel 第 13 代 Core 或 Apple M3 的微架构图，你会看到：

- **Reorder Buffer**（ROB）—— 1988 年加的，让 Tomasulo 支持精确异常（异常发生时能回到指令完成前的精确状态）
- **Physical Register File**（PRF）—— 把"重命名后的临时身份"做成一大堆物理寄存器，比 360 Model 91 时代精致很多
- **Scheduler / Issue Queue** —— 就是保留站换了个名字
- **Result Bus / Forwarding Network** —— CDB 的多通道升级版

骨架没变，规模大了 50 倍。

## 踩过的坑

1. **ROB 不是 Tomasulo 原始设计**：原版没有重排序缓冲区，遇到异常无法精确恢复。Smith & Pleszkun 1988 年才加 ROB。读老论文别把后人的优化算成原作者的功劳。

2. **CDB 是单总线瓶颈**：每周期最多广播一个结果。多个执行单元同时算完会排队。现代 CPU 用多条 CDB 或更复杂的 forwarding network 解决。

3. **WAR / WAW 假冲突容易误以为真**：教学时经常被当成"必须等"。其实它们只是寄存器名复用，重命名后完全消失，真依赖只有 RAW。

4. **静态 vs 动态调度不是替代关系**：编译器可以重排指令（静态调度），CPU 又可以乱序发射（动态调度）。两者是叠加优化，不是二选一。VLIW 架构（如 Itanium）赌"全靠编译器"，结果失败——因为编译时不知道 cache miss 等运行时信息。

5. **投机执行 + Tomasulo = Spectre 漏洞土壤**：现代 CPU 在分支预测错的情况下也会乱序往前算，错了再回滚。但回滚不擦 cache，泄漏数据——这是 Tomasulo 思想往前推了 50 年后冒出的副作用。

## 适用 vs 不适用场景

**适用**：

- 通用 CPU 大核（Apple M、x86 P-core、ARM Cortex-X）—— 主流方案
- 高性能 GPU 的部分调度逻辑 —— Volta 之后 NVIDIA 的 warp scheduler 也借鉴
- FPGA 软核 CPU（Rocket、BOOM）—— BOOM 直接以 Tomasulo 为蓝本

**不适用**：

- 嵌入式/低功耗核 —— Cortex-M 系列用顺序流水线，乱序硬件代价（ROB / 重命名表 / 唤醒电路）功耗换不回性能
- VLIW / DSP —— 把调度责任丢给编译器，硬件极简
- 早期 GPU 的 SIMT —— 用大量线程隐藏延迟，不需要单线程乱序

## 历史小故事（可跳过）

- **1964 年**：IBM System/360 Model 91 项目启动，要做"科学计算最快的机器"，浮点单元慢于整数单元，需要并行流水。
- **1967 年**：Tomasulo 在 IBM Poughkeepsie 发表 8 页论文，全文没有"register renaming"这个词，但思想已经完整。
- **1968-1990**：算法被搁置 20 年——Model 91 太贵，只造了 20 台；后来 RISC 兴起，业界相信"简单流水线 + 编译器优化"够用。
- **1995 年**：Intel Pentium Pro 把 Tomasulo 思想搬到 x86，开启乱序时代。从此每代 Intel/AMD/ARM 大核都是 Tomasulo 派。
- **2020 年代**：Apple M1 Firestorm 核 ROB 深度 630+，保留站规模空前，本质仍是 1967 年那张图。

一篇 8 页论文，等了 28 年才被工业界完全接受。

## 学到什么

1. **假冲突可以重命名消除**——这是过去 60 年体系结构最重要的一个洞见之一
2. **保留站 + 重命名 + 广播总线** 是动态调度的三板斧，组合起来威力惊人
3. **静态信息 vs 动态信息**：编译器看不到 cache miss，CPU 看不到全局优化，两者必须互补
4. **超前发明的代价**：1967 年的算法，工业界 1995 年才真正吃透；好想法常需要等硬件密度跟上

## 延伸阅读

- 教材必读：[Hennessy & Patterson — Computer Architecture: A Quantitative Approach](https://www.elsevier.com/books/computer-architecture/hennessy/978-0-12-811905-1) 第 3 章把 Tomasulo 讲得最清楚，含完整数据通路图
- 视频讲解：[Onur Mutlu CMU 18-447 Lecture 14](https://www.youtube.com/watch?v=BSpQTJh0PiE) 一小时把保留站工作过程画出来
- 论文 PDF：[Tomasulo 1967 原文](https://www.cs.virginia.edu/~evans/cs654/readings/tomasulo.pdf) 8 页，文字密度高但概念集中
- [[ssa]] —— 编译器侧的"重命名"思想，与 CPU 重命名同源不同时代
- [[hotspot-server-compiler]] —— JIT 在软件层模拟乱序调度
- [[ampere-architecture-2020]] —— GPU 端的并行调度，与 CPU Tomasulo 形成对照

## 关联

- [[ssa]] —— 静态单赋值，编译器 IR 用一次写一个新名字消除假依赖，与寄存器重命名同构
- [[hotspot-server-compiler]] —— JVM 的 C2 编译器在 IR 层做静态调度，与 CPU Tomasulo 互补
- [[self-pic]] —— 内联缓存，CPU 投机思想在动态语言运行时的对应物
- [[tracemonkey]] —— 只编译"真的走过的那条路"，与乱序投机执行精神相通
