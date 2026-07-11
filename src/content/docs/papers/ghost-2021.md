---
title: ghOSt — 把 Linux 调度策略搬到用户态去写
来源: 'Humphries et al., "ghOSt: Fast & Flexible User-Space Delegation of Linux Scheduling", SOSP 2021'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

ghOSt 是 Google 做的一套系统，**把"决定哪个线程跑在哪个 CPU"这个决策从内核挪到用户态进程里去做**。日常类比：

- 传统内核调度像政府窗口，规则印在墙上，改一条要全楼休业改墙再开门
- ghOSt 像是政府只留窗口执行人员，所有规则交给楼外一个 AI 顾问实时决策——顾问可以随时换人、换策略，窗口照常运行

具体做法：内核里留一段最小的执行通道（叫 ghost class），用户态跑一个 **agent 进程**，每次出现"该选下一个线程跑了"的事件，agent 算出决策、提交回内核执行。

一句话总结的卖点：**让调度策略迭代周期从"几周"变成"几分钟"**。

## 为什么重要

不理解 ghOSt 这套思路，下面这些事都没法解释：

- 为什么 2023 年后 Linux mainline 出现的 `sched_ext` / BPF scheduler 看起来"理所当然"——ghOSt 是它的研究先驱
- 为什么数据中心愿意做这件事：调度策略每周改一次，传统模式要全集群 rebuild + reboot Linux 内核，迭代周期数周；用户态改一行 C++ 重启 agent 就生效
- 为什么"用机器学习做调度器"突然变得可行——以前每次实验都要改内核，没人敢；ghOSt 之后，RL 跑出来的策略就是一个普通进程
- 为什么 agent 崩溃不会让机器死掉：内核保留一个 fallback 通道，agent 不在的时候自动退回 CFS
- 为什么"策略与机制分离"这个老 OS 课经典原则在 2021 年还能产生新论文——因为分离的"位置"可以一直往用户态推

## 核心要点

ghOSt 的设计可以拆成 **五件事**：

1. **agent 拿到完整状态**：内核把 runqueue（等待跑的线程队列）、context switch、阻塞唤醒等事件通过共享内存消息队列推给 agent，agent 看到的不是抽象接口，是接近内核数据结构的原始视图。共享内存避免了每次决策一次 syscall 的开销。

2. **transaction commit**：agent 决策（"线程 T 上 CPU 4"）以事务形式提交。内核 commit 前检查这次决策**基于的状态版本**还有没有过期；如果中间发生了别的事件，拒绝并要求 agent 重看。类比 git push 的 fast-forward 检查。这是 OCC（乐观并发控制：先假设没冲突，提交时再检查）在系统层的复用。

3. **agent 自己也要被调度**：agent 是用户态进程，它自己也得跑在某个 CPU 上。如果 agent 自己饿死了，整个机器就死了。ghOSt 给 agent 一个最小固定优先级，保证它能跑。

4. **BPF 兜底快路径**：有些场景（NIC 中断刚到、要在 ns 级别响应）等不及 agent 决策，用一段预编译的 BPF 程序在内核里直接处理。BPF 是慢策略的快通道，不是替代。

5. **fallback 安全网**：agent 进程崩了、卡了、被 kill 了，内核检测到一段时间没收到决策，就退回 CFS（Linux 默认的完全公平调度器）。这让"在生产环境跑实验性策略"成为可能——最坏情况只是退回到默认调度。

## 实践案例

### 案例 1：一次调度决策的完整流程

```
内核：CPU 4 上运行的线程阻塞了 → 发事件到 agent
agent：读 runqueue → 算出该让线程 T 上 → 提交 transaction
内核：检查 transaction 的版本号还有效 → 执行切换
       （如果中间又发生别的事件 → 拒绝 → agent 重算）
```

整个过程跨态切换 2 次，比纯内核调度多 ~1μs，CPU 密集型工作负载会有 2-5% 开销。Google 觉得值。

**为什么是事务而不是直接 syscall**：传统 syscall 是"立即生效"，但 agent 算决策的时候用的是 t0 时刻的快照，等 syscall 真到内核可能已经是 t0 + 数百 ns，runqueue 都变了。事务的版本号让内核能识别"决策过期"并拒绝。这是异步并发系统的通用治理手段。

### 案例 2：Google Snap 与 Search 实测

论文里两组生产负载对照要分开记：

1. **Snap**（用户态包处理框架）：对比对象是 Google 自研的软实时调度器 **MicroQuanta**，不是 CFS。ghOSt 策略在部分场景把尾延迟再压低约 **5–30%**，吞吐相当；策略代码约几百行 C++。
2. **Google Search leaf**：这里才是对默认 **CFS** 的对比——按机器拓扑定制策略后，部分查询类型尾延迟约降 **40–50%**，吞吐持平或更好。

合起来的证据是：**用户态特化策略可以打赢"通用内核策略"**。CFS / MicroQuanta 的目标是"一类负载都还行"；ghOSt 可以写成"只对这一种负载最好"。

### 案例 3：用 RL 学会调度

论文还展示用强化学习训 agent：输入 runqueue 状态，输出调度决策。

1. 用真实集群轨迹回放当训练数据（不是纯模拟器）
2. RL agent 收敛到接近手工策略的水平
3. 证明"调度策略可学习"——传统内核里几乎没法做这种实验

ghOSt 把"调度策略实验"从内核工程问题变成 ML 工程问题：以前多停在仿真；之后门槛降到"写一个用户态进程"。

## 踩过的坑

1. **agent 自己饿死的活锁**：所有 CPU 都在等 agent 决策，agent 又被自己排到最低优先级。ghOSt 用一个独立的最小 fixed-priority 通道解决——agent 永远有 CPU 跑。这一点初学者很容易忽略：你以为问题是"如何写出好策略"，其实先要解决"agent 自己怎么不死"。

2. **transaction 拒绝率太高**：早期实现 agent 看到的状态版本变化太快，commit 被频繁拒绝、重算、再拒绝。论文加了批量提交和事件聚合才把成功率提上去。

3. **per-CPU vs 中心化两种模型**：每个核一个 agent（per-CPU）扩展性好但难做全局优化；一个 agent 看全机（centralized）能做全局调度但是单点。ghOSt 两种都支持，让用户选。一般规则：核数小于 16 用中心化，更大用 per-CPU。

4. **混淆同名词**：ghOSt 不是 Plan 9 的 ghost 文件系统、不是 Linux 旧的 ghost task 概念，也不是 BPF sched_ext。它是 SOSP 2021 这篇论文提出的研究系统。

5. **生产化的隐性成本**：开源仓库给的内核是 patch 形式（不是 module），意味着每个 Linux 版本升级都要 rebase 这堆 patch。Google 内部能扛，外部公司一般扛不动——这也是为什么 sched_ext 后来用 BPF 路线避开 patch 维护的关键动机。

## 适用 vs 不适用场景

**适用**：

- 数据中心服务器：工作负载特化重要，迭代频率高
- 调度策略研究：内核改不动，用户态改飞快
- 机器学习驱动调度：策略以模型形式存在，更新就是换权重
- 多租户混部：把 batch 和 latency-sensitive 的工作负载放一起，需要细粒度策略区分

**不适用**：

- 硬实时（汽车、工业控制）：μs 级延迟不够，要 ns 级
- 嵌入式 / 桌面：开销不值，CFS 够用
- 不能维护 kernel patch 的环境：ghOSt 要改内核，不是装个内核模块就行
- 想直接进 mainline 的项目：ghOSt 没进 mainline，进 mainline 的是它的精神后继 sched_ext

## 历史小故事（可跳过）

- **2010s 中期**：Google 发现自家集群 90% 时间在跑专用策略 patch，但每次 patch 都要等 Linux release 节奏，迭代慢得不能忍
- **2018-2020**：内部孵化"调度即用户态服务"的思路，原型代号 ghOSt（捉鬼大队的双关：抓内核里"看不见的调度问题"）
- **2021 SOSP**：论文发表，开源 ghost-kernel + ghost-userspace 两个仓库
- **2022**：Meta（Facebook）也公布类似内部系统的需求，业界开始讨论标准化
- **2023+**：mainline Linux 接受 sched_ext（基于 BPF），思路明显受 ghOSt 影响，但走的是 BPF 路线避开了 patch 维护成本
- **2024+**：sched_ext 在 6.12 mainline 落地，研究 / 工业的两条路线汇合

## 学到什么

1. **"内核必须做什么"和"可以让用户态做什么"的边界是可以重画的**——ghOSt 把调度这个"必须内核"的事拆成"机制留内核 + 策略给用户态"
2. **transaction + 版本检查** 是异步系统避免决策过期的通用模式，不只在数据库里有用
3. **保留 fallback** 让激进的实验性方案敢上生产：agent 崩了机器还活着，policy bug 只伤一台机器一秒钟
4. **策略和机制分离** 这个老话被 ghOSt 用一种很激进的方式重提——机制只剩消息通道，策略可以是任意用户态代码包括 ML 模型
5. **观察"传统模式的迭代周期"**：当迭代成本（rebuild + reboot 集群）远大于决策本身的复杂度时，就值得把决策搬到一个迭代廉价的层去做。这是系统设计的一个反复出现的判断准则
6. **研究系统和工程系统的关系**：ghOSt 不进 mainline 不代表它失败，反而它探明的设计空间让 sched_ext 知道哪些选择走得通。研究系统的"成功"经常是"被精神后继采纳"而不是"自己上线"

## 延伸阅读

- 论文 PDF：[ghOSt SOSP 2021](https://dl.acm.org/doi/10.1145/3477132.3483542)
- 内核侧开源：[google/ghost-kernel](https://github.com/google/ghost-kernel)
- 用户态 agent 框架：[google/ghost-userspace](https://github.com/google/ghost-userspace)
- SOSP 2021 talk 视频：[YouTube — ghOSt presentation](https://www.youtube.com/watch?v=j4ASRCdmK1U)
- mainline Linux sched_ext 入口（精神后继）：[kernel.org sched_ext docs](https://docs.kernel.org/scheduler/sched-ext.html)
- 同期相关研究：Shinjuku、Caladan、Shenango——数据中心调度的不同路线
- [[bpf-sched-ext]] —— mainline Linux 的同思路实现，比 ghOSt 轻量
- [[shenango]] —— 数据中心调度的另一条路：固定策略 + 极致延迟

## 关联

- [[bpf-sched-ext]] —— ghOSt 是研究先驱，sched_ext 是 mainline 落地
- [[shenango]] —— 同样是数据中心调度优化，但策略写死在系统里
- [[caladan]] —— Shenango 的后继，调度延迟优化的另一极
- [[ebpf]] —— ghOSt 的 BPF fastpath 用的就是这个机制
- [[reinforcement-learning]] —— 论文最后用它训练调度 agent
- [[exokernel-1995]] —— "把策略推到用户态"的祖师爷思路，ghOSt 是它在调度子系统的现代实例
- [[microkernel]] —— 类似把内核功能下放到用户态服务的传统

## 学这篇论文的建议路径

1. 先读 abstract 和 intro，理解为什么 Google 觉得"传统调度迭代周期"是问题
2. 跳过详细架构图，直接看实验段：Snap 和搜索 leaf 的数字
3. 回头看 transaction commit 的状态版本号机制（这是技术核心）
4. 最后看 RL 实验作为想象空间的扩展，不必深究模型细节
5. 看完后比对 sched_ext 的设计文档，理解工业落地为什么走 BPF 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
