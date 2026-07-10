---
title: FlexSC — 把系统调用从同步陷入改成异步队列
来源: 'Livio Soares & Michael Stumm, "FlexSC: Flexible System Call Scheduling with Exception-Less System Calls", OSDI 2010'
日期: 2026-06-01
分类: 操作系统
难度: 高级
---

## 是什么

FlexSC 提出一个朴素却颠覆的想法：**别让程序"陷入内核"了，改成"留张纸条让内核回头处理"**。

日常类比：你以前每次问助理一件事，都要起身走到他办公室、敲门、说一句、等回答、再走回来。FlexSC 让你直接在两人之间桌上放一摞**便利贴**——你写一张推过去就走，助理空了一次性看一摞、办完一摞贴回来。

技术上这叫 **exception-less system call**（不走异常陷入的系统调用）：

- 传统 syscall = 用户态写一条 `syscall` 指令 → CPU 触发软异常 → 进内核 → 内核办完 → 回用户态。**每次都要切两次**。
- FlexSC syscall = 用户态把请求写进一块共享内存里的 **syscall page**（系统调用页）→ 内核里有专门的 syscall 线程在另一个 CPU 核上**轮询**这页 → 看到新请求就办 → 办完写回结果。用户态线程**完全不切换模式**。

论文实测：Apache 吞吐最高约 **+116%**，MySQL 约 **+40%**，BIND 约 **+105%**。这是 2010 年 OSDI 的论文，也是后来 Linux **io_uring**（2019）SQ/CQ 双 ring 设计的重要先驱。

## 为什么重要

不理解 FlexSC，下面这些事都没法解释：

- 为什么 io_uring 要用"两个 ring 队列 + 共享内存"而不是直接 syscall——FlexSC 早 9 年就想清楚了
- 为什么"系统调用很贵"这句话过去是对的、现在更对——Meltdown/Spectre 之后的 KPTI 把单次 syscall 成本又抬了 2-3 倍
- 为什么"批量"（batch）和"异步"是过去 15 年内核接口设计的两条主轴——FlexSC 是第一个把这两件事一起做的工作
- 为什么很多高性能数据库/网络框架（ScyllaDB / Seastar / DPDK）都在"绕过 syscall"——它们在用同一套思路

## 核心要点

FlexSC 的设计能拆成 **三个洞察**：

1. **mode switch 本身贵，但更贵的是它清空了你的 cache**：CPU 从用户态切进内核态，TLB / L1 / L2 / 分支预测器都被内核代码污染。论文测出，**间接成本（cache 污染）比直接成本（保存寄存器）高 2 到 3 倍**。这意味着——把 1000 次 syscall 攒成 1 批办，**单次的间接成本被分摊掉了**。

2. **共享内存比陷入便宜得多**：用户态和一个内核线程通过一块共享页通信。用户态写 entry 时 CPU 完全不进内核，内核线程在**另一个核**上跑，俩人各做各的，靠 cache coherence（缓存一致性）把消息传过去。

3. **绑定专核 + M:N 用户态调度**：内核里给一组 syscall 线程**钉死在专门的 CPU 核**上。用户态线程发起 syscall 后，**自己挂起、调度器切到下一个就绪线程**——一个真实 OS 线程上面跑 N 个用户态协程。当某个协程的 syscall 完成（结果写回 syscall page），调度器再唤醒它继续。

三件事合起来：**syscall 不阻塞调用线程，调用线程也不切模式，内核线程批量办事**。

## 实践案例

### 案例 1：Apache 实测的吞吐曲线

论文用 **FlexSC-Threads**（与 NPTL 二进制兼容的 M:N 用户态线程库）跑未改源码的 Apache 2.2 + ApacheBench：

- 单核（主要靠 batching）：吞吐最高约 **+86%**
- 2/4 核（再加跨核调度）：吞吐最高约 **+116%**
- 同期 MySQL/sysbench 约 **+37%–40%**，BIND 约 **+105%**

关键数字：一次 `pwrite` 之后，用户态 IPC 要再跑大约 **14000 cycles** 才回到 syscall 前的水平（Figure 1）。FlexSC 不切模式，就把这笔间接污染摊掉了。

### 案例 2：syscall page 长什么样

每个用户线程对应一块共享内存页，里面是固定大小的 entry 数组：

```
[ status | syscall_no | arg0 | arg1 | ... | result ]
[ status | syscall_no | arg0 | arg1 | ... | result ]
...
```

`status` 取四个值：`free / submitted / busy / done`。

- 用户态：找一个 `free` 的 entry，填好参数，标记 `submitted`
- 内核线程：扫到 `submitted`，标记 `busy`，调真正的 syscall 处理函数，写 `result`，最后标记 `done`
- 用户态：看到 `done` 就把结果取走，重新置 `free`

整套交互**没有一次 mode switch**。这正是后来 io_uring 的 SQE / CQE ring 的雏形。

### 案例 3：和 io_uring 的血缘

io_uring（Linux 5.1，2019）的核心数据结构：

- **SQ**（Submission Queue，提交队列）= FlexSC 的 syscall page 入口
- **CQ**（Completion Queue，完成队列）= FlexSC 的结果回写
- **SQ_POLL** 模式 = FlexSC 的内核轮询线程

差别只在 io_uring 用了**两个独立环形队列**而不是单一 entry 数组（更利于批处理和无锁），并把这套机制**官方化**进了 Linux 主线。FlexSC 的研究原型 → 9 年后变成 Linux 标准 IO 接口。

### 案例 4：成本拆解的一张表

把"为什么 syscall 贵"翻译成数字（论文 Table 2 摘要 + 后续 Meltdown 时代复测）：

| 成本来源 | 单次 syscall（2010 年） | KPTI 后（2018+） |
| --- | --- | --- |
| 模式切换往返 | ~150 cycles（论文 null syscall） | 量级仍在 |
| TLB / 页表隔离 | 隐含在污染里 | **KPTI 再抬一轮**（常见再贵数倍） |
| L1/L2 cache 被内核污染 | 用户态 IPC 约 **14000 cycles** 才回升 | 同上量级 |
| 分支预测器被污染 | 难量化但可观 | 同上 |

FlexSC 把这一整列成本压到接近 0——因为**根本不切模式**。

## 踩过的坑

1. **不是所有 syscall 都能异步化**：`fork / execve / brk` 这种**改变进程自身状态**的调用，必须当场办，不能丢队列。FlexSC 论文承认这点，让这些 syscall 走传统路径。

2. **CPU 核分配是个艺术**：syscall 内核线程占的核数不对，要么内核闲着应用饿、要么反过来。论文用动态启发式，但调参很微妙。io_uring 后来用更灵活的 SQ_POLL + 应用自调来回避。

3. **协程切换不是免费的**：发起 syscall 后挂起当前协程，得有 M:N 调度器。**没有用户态调度器的程序享受不到 FlexSC**——这就是为什么 Go runtime / Seastar 框架配 FlexSC 思路最受益。

4. **cache 一致性流量取决于 entry 数量和频率**：太多 entry 频繁翻 status，跨核 cache line 抢得厉害。论文里调到了 16-64 entries / page 这个甜区。

5. **结果什么时候取？**：用户态要"轮询" syscall page 的 done 标志。轮询太勤浪费 CPU，太懒延迟变高。FlexSC 用的策略是——**当前协程没事可做时**才轮询；有事就先跑别的。这把延迟和 CPU 利用率耦合在了"调度器有多聪明"上。

## 适用 vs 不适用场景

**适用**：

- IO 密集型 server：web server / 数据库 / 消息队列 / 代理（Apache / nginx / Redis-like）
- 有用户态调度器的运行时（Go / Seastar / Tokio + io_uring）
- 多核机器上做异步 IO（FlexSC 的收益**随核数线性增长**）

**不适用**：

- CPU 密集型计算（科学计算、AI 训练）——syscall 本来就少，省不了多少
- 单核或 syscall 必须同步语义的场景（大量 ioctl / 控制路径）
- 嵌入式 / 实时系统（轮询线程占核成本太高）

## 历史小故事（可跳过）

- **2008-2009 年**：Soares 和 Stumm 在多伦多大学注意到，多核机器上传统 syscall 让用户线程和内核共抢一个核的 cache，**根本浪费了多核**。
- **2010 年 OSDI**：FlexSC 论文发表，给 Linux 加了一套实验补丁，吞吐数据漂亮但代码没合进主线。
- **2012-2014 年**：DPDK / netmap 等"绕过内核"思潮兴起，思路类似但更激进——干脆不走内核。
- **2019 年 5 月**：Jens Axboe 的 io_uring 进入 Linux 5.1。Axboe 在白皮书里**点名感谢 FlexSC** 提供了核心思路。
- **2020 年代**：io_uring 成为 Linux 高性能 IO 事实标准，FlexSC 的设计在每秒数十亿次 IO 中跑着。

## 学到什么

1. **接口是性能的源头**：FlexSC 没改任何一个 syscall 的语义，只换了"怎么发请求"，吞吐就翻倍。这告诉你**接口设计 = 性能上限**。
2. **cache 才是真正的成本中心**：现代 CPU 上，分支预测器 / TLB / L1 cache 的污染，远比"几条保存寄存器的指令"贵。这是过去 20 年硬件趋势的副产品。
3. **批处理 + 异步 + 共享内存** 是绕开 mode switch 三件套，io_uring 全用上了
4. **研究原型 → 工业标准** 走了 9 年。OSDI 论文不一定立刻改世界，但好想法会在合适的硬件趋势下被翻出来

## 延伸阅读

- 论文 14 页 PDF：[FlexSC OSDI 2010](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Soares.pdf)
- io_uring 白皮书：[Jens Axboe — Efficient IO with io_uring](https://kernel.dk/io_uring.pdf)（看完 FlexSC 再读会有"原来如此"的感觉）
- ELI 论文（Exitless Interrupts，2012）：把 FlexSC 思路推广到中断处理
- [[io-uring]] —— Linux 把 FlexSC 思想做成标准
- [[exokernel-1995]] —— 另一条思路：让用户态自己办，内核只管隔离

## 关联

- [[io-uring]] —— FlexSC 的工业版后裔，SQ/CQ ring 设计直系
- [[exokernel-1995]] —— 同样在挑战"内核什么都管"的传统设计
- [[barrelfish-2009]] —— 多核 OS 重新思考 syscall 与跨核通信
- [[ampere-architecture-2020]] —— ARM 多核服务器是 FlexSC 思路最大受益者

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[barrelfish-2009]] —— Barrelfish / Multikernel — 把多核机器当成一个小型网络来设计 OS
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall

