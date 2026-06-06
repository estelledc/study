---
title: Amdahl 定律 — 串行比例决定并行加速比的上界
来源: Gene M. Amdahl, "Validity of the Single Processor Approach to Achieving Large Scale Computing Capabilities", AFIPS Conference Proceedings, vol. 30, pp. 483-485, 1967
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Amdahl 定律说一句话：**只要程序里还有一段必须串行跑的代码，加再多 CPU/GPU 也撞墙**。

日常类比：装修一套房子，刷墙的活可以叫 10 个工人一起上，但**等水泥干**这一步只能等。哪怕你叫 100 个工人，等水泥的那一天还是省不掉。

写成公式：

```
Speedup(N) = 1 / ( s + (1 - s) / N )
```

- `N` = 处理器数
- `s` = 程序里**串行不可并行**部分的时间占比（0 到 1 之间）
- `Speedup` = 用 N 个处理器后比单处理器快多少倍

极限情况：当 `N → ∞`，`Speedup → 1/s`。

**串行 5% 的程序，给你无穷个处理器，最多也只能加速到 20×**。这就是免疫 "我们加速到 1000×" 营销话术的疫苗。

## 为什么重要

不懂 Amdahl，下面这些事都没法解释：

- 为什么训练 LLM 从 8 卡加到 1024 卡，加速比远小于 128×
- 为什么 Python GIL 让 CPU 密集型多线程几乎没用
- 为什么数据库加从库能扛读、扛不住写
- 为什么 GPU 厂商发布会的"最高加速 N×"必须配脚注

它给你一个**第一性原理工具**：拿到任何并行系统，先估串行比 `s`，立刻知道天花板在哪。

## 核心要点

公式推导只用初中算术，理解三件事就够：

1. **总时间 = 串行部分时间 + 并行部分时间**。原本两段加起来是 1（归一化）。
2. **并行 N 倍后**，并行部分缩成 `(1-s)/N`，但串行部分 `s` **完全没动**。
3. **加速比 = 原总时间 / 新总时间 = 1 / (s + (1-s)/N)**。

关键直觉：分母里 `s` 是常数，`(1-s)/N` 再小也只能让分母逼近 `s`，**永远到不了 0**。串行段就是天花板。

原文是 1967 年 4 月 AFIPS 春季联合计算机会议的辩论稿，**只有 3 页，正文里甚至没有公式**——Amdahl 就用一段散文说"做家务（housekeeping）、I/O、串行步骤不会随处理器数变小"，就把对手 ILLIAC IV 阵列机路线打了下来。公式是后人补的。

## 实践案例

### 案例 1：直觉数字感

| 串行比 s | 8 核加速 | 16 核加速 | 100 核加速 | ∞ 核加速 |
|---|---|---|---|---|
| 0% | 8.0× | 16.0× | 100× | ∞ |
| 1% | 7.5× | 13.9× | 50.2× | 100× |
| 5% | 5.9× | 9.1× | 16.8× | 20× |
| 10% | 4.7× | 6.4× | 9.2× | 10× |
| 20% | 3.3× | 4.1× | 4.8× | 5× |

记住一组：**5% 串行 → 100 核加速 16.8×，∞ 核 20×**。这是吓人的数字。

### 案例 2：LLM 训练

数据并行训练 step 内有一步 `AllReduce`（所有卡同步梯度），假设它占总时间 5%（串行）：

- 16 卡：理论加速 9.1×（实际更低，还有通信开销）
- 1024 卡：理论上限 19.6×

这就是为什么 PyTorch / DeepSpeed 那么拼命做**异步、重叠通信与计算、ZeRO 分片**——本质是把 `s` 往下压。压不动就是 Amdahl 在说话。

### 案例 3：Python GIL

CPython 解释器同一时刻只能跑一个线程的字节码。CPU 密集任务里 GIL 持有时间近似 100% 串行：

- `s ≈ 1` → `Speedup → 1`，多少线程都没用

所以 Python 高性能场景必须 multiprocessing（多进程）或写 C 扩展释放 GIL，绕开 Amdahl 的天花板。

### 案例 4：Web 服务为什么能"线性扩容"

很多人会问：Nginx 加机器看起来加多少快多少，是不是违反 Amdahl？

答案：不违反，因为**每个 HTTP 请求是独立任务，没有共享串行段**。这种情况叫 embarrassingly parallel——`s ≈ 0`，所以 Speedup ≈ N。一旦请求要写**同一行数据库记录**，那行的锁就成了串行段，`s` 立刻冒头。

### 案例 5：自己估算 s 的方法

最简单：跑一遍 profile，看哪些函数总在等。

- `pidstat -t` 看线程在 `D state`（不可中断 sleep，往往是 I/O 或锁）的比例
- `perf record` 看 spinlock / futex 占多少周期
- 训练时看 GPU `nvidia-smi` 利用率掉到 0 的窗口——那段就是同步在串行

把这些时间加起来除以总时间，就是 `s` 的下界。再代入公式，立刻知道加卡还有多少空间。

## 踩过的坑

1. **把 `s` 当固定常数**：实际 `s` 随问题规模、批大小、调度器、网络拓扑都会变。8 卡时 `s=2%`，64 卡时锁竞争上来 `s=8%`，是常态。

2. **忽略通信开销**：Amdahl 假设并行部分**理想**加速 N×。现实里 N 越大，节点间通信、缓存一致性、同步屏障越贵——`(1-s)/N` 实际会反弹。

3. **和 Gustafson 律混淆**：Amdahl 假设**问题规模固定**（strong scaling），N 越大每核分到的活越少。1988 年 Gustafson 反驳：现实里 N 变大是为了跑**更大问题**（weak scaling），那时串行占比会下降。两者不冲突，看你问的是哪个。

4. **多线程 ≠ 并行**：加锁的 critical section 是串行；原子操作是串行；阻塞 I/O 等待是串行。这些都计入 `s`。

## 适用 vs 不适用场景

**适用**（strong scaling，固定问题加更多核）：
- 单次推理延迟优化（batch=1 跑得多快）
- 编译/构建提速（make -jN）
- 单查询 SQL 并行扫描

**不适用**（weak scaling，问题规模随核数增长）：
- 训练数据集规模翻倍 + 卡数翻倍 → 用 Gustafson
- 网站 QPS 扩容（每个请求独立，无串行段）→ 几乎线性扩展
- 完全 embarrassingly parallel 任务（蒙特卡洛、独立批处理）

## 历史小故事（可跳过）

- 1967.4：Amdahl 在 AFIPS 春季会议上的辩论稿。当时他是 IBM System/360 总设计师，**反对** Daniel Slotnick 的 ILLIAC IV 路线（64 处理器阵列机，由 NASA 资助）。Amdahl 主张：单处理器做强比堆处理器划算。
- 论文极短，3 页，没公式，只有口语化论证。今天的"Amdahl 公式"是后人从他文字里提炼的。
- 1988：John Gustafson 在 Sandia 国家实验室用 1024 处理器的 nCUBE 跑出 1000× 加速，写 "Reevaluating Amdahl's Law" 反驳——他指出问题规模也在变。
- 2008：Hill & Marty 把 Amdahl 套到多核芯片设计："Amdahl's Law in the Multicore Era"，论证**异构多核**（一个大核 + 多个小核）比同构多核更优。
- 2010s 至今：每篇分布式训练论文的 Background 都要引一遍 Amdahl，才能解释为什么"线性扩展"不可能。

## 学到什么

1. **加速比有上界，且上界由串行比决定**——不是工程问题，是数学问题
2. **优化的杠杆永远在 `s`**：与其加卡，不如先把锁、I/O、AllReduce 这些串行段压下去
3. **strong scaling vs weak scaling 是两个问题**——别用 Amdahl 反驳一个本来就在做 weak scaling 的系统
4. **3 页的论文也能定义一个时代**：Amdahl 用一段散文挡住了一条技术路线，60 年后还在被引用

## 延伸阅读

- 论文 PDF：[Amdahl 1967](http://www-inst.eecs.berkeley.edu/~n252/paper/Amdahl.pdf)（3 页，建议读原文体会"没有公式的论证"）
- Gustafson 反驳：[Reevaluating Amdahl's Law (1988)](https://dl.acm.org/doi/10.1145/42411.42415)
- Hill & Marty：[Amdahl's Law in the Multicore Era (2008)](https://research.cs.wisc.edu/multifacet/papers/ieeecomputer08_amdahl_multicore.pdf)
- 可视化计算器：[Amdahl Law Calculator](https://www.gigacalculator.com/calculators/amdahl-calculator.php)（拖滑块看曲线）
- [[alpa-2022]] —— Alpa 用编译器搜并行策略，本质就是在压每一段的串行比

## 关联

- [[alpa-2022]] —— 自动并行化系统，与 Amdahl 同样关注"串行段在哪"
- [[tensorflow-osdi-2016]] —— 分布式训练框架，AllReduce 是它最大的串行瓶颈
- [[cuda-streams-concurrency-2018]] —— GPU 内部多流并行，目的也是降 `s`
- [[anh-moffat-2005]] —— 信息检索的并行索引，串行合并是天花板

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[anh-moffat-2005]] —— Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码
- [[barrelfish-2009]] —— Barrelfish / Multikernel — 把多核机器当成一个小型网络来设计 OS
- [[big-little-2011]] —— big.LITTLE — 让一颗芯片同时装快核和省电核
- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[bvt-1999]] —— BVT 1999 — 让一份调度器同时照顾"急性子"和"老黄牛"
- [[case-for-risc-1980]] —— Case for RISC 1980 — 一篇没有芯片的论文，掀起 CPU 半世纪革命
- [[cuda-streams-concurrency-2018]] —— CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
- [[dash-numa-1992]] —— Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器
- [[hydra-1974]] —— HYDRA — 用 capability 把整个内核重做成对象 + 票据
- [[mcfarling-bp-1993]] —— McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台
- [[mcs-locks-1991]] —— MCS 锁 — 让每个线程自旋在自己的缓存行上
- [[moesi-cache-coherence-1986]] —— Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
- [[multics-1965]] —— MULTICS 1965 — 把计算机做成像电力一样的公共服务
- [[nickolls-dally-2010-cuda-era]] —— Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI
- [[risc-i-1981]] —— RISC I — 砍掉 90% 指令反而让 CPU 跑得更快
- [[tensorflow-osdi-2016]] —— TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
- [[unix-1974]] —— UNIX 1974 — 用极小内核做出能用的分时系统

