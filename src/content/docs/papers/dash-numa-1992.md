---
title: Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器
来源: 'Lenoski, Laudon, Gharachorloo, Weber, Gupta, Hennessy, Horowitz, Lam, "The Stanford Dash Multiprocessor", IEEE Computer Vol. 25 No. 3, March 1992'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

DASH（**Directory Architecture for SHared memory**）是 Stanford 在 1989-1992 造的一台 64 处理器原型机，是**第一台真跑起来的目录式缓存一致 NUMA 多处理器**。1992 年的 IEEE Computer 这篇 17 页综述是它的总结报告。

日常类比：以前的 SMP 像**一张大圆桌，所有人挤一桌大声说话**（总线 snoop），桌子超过 8-16 人就吵不清楚。DASH 改成**16 张小桌、每桌 4 人**，桌子之间用电话点对点说话；每条数据有一张**前台登记表**（directory），记着此刻谁在用、状态是什么。桌子内部还是吵架式 snoop，桌子之间靠登记表 + 点对点消息保持一致。

落到硬件：**16 个 cluster × 每 cluster 4 个 MIPS R3000 = 最多 64 处理器**，cluster 内是改造的 SGI 4D/340 总线 SMP，cluster 之间是 **2D mesh + wormhole 路由**（请求网 + 响应网两张独立 mesh）。每条 16 字节 memory line 在它的 home cluster 有一条 directory 记录：**3 状态（uncached / shared / dirty）+ 64 位 sharer bitmap**。

## 为什么重要

不理解 DASH，下面这些事都没源头：

- 你今天 `lscpu` 看到的 **NUMA node 0/1/2/3 + latency matrix**，概念从这台机器来
- AMD **Epyc / Intel Xeon** 的多 socket + chiplet + UPI/Infinity Fabric = DASH 拓扑塞进单芯片再多铺几层
- ARM / RISC-V 的**弱内存模型**（acquire / release）= DASH 同期提的 Release Consistency 的语义后裔
- **GPT-3 训练用的 A100 集群、Grace-Hopper 共享 HBM、NVLink mesh** —— 跨设备 cache coherence 沿用 DASH 的 directory 思想

直接的工程后果：1996 年 **SGI Origin 2000** = DASH 商品化（Hennessy 当时是 SGI CTO），2003 年 **AMD Opteron + HyperTransport** = DASH 思想跨进 x86 服务器。今天数据中心里几乎每台 2 路以上的服务器，**拓扑骨架都是 DASH**。

## 核心要点

把 DASH 拆成**六件事**：

1. **层级一致性**：cluster 内 4 个核还是吵架式 snoop（沿用 SMP）；cluster 之间换成 directory + 点对点消息。**总线 snoop 上不了 64 路**（带宽 + 电气都崩），所以分层。

2. **Directory 存什么**：每条 16 字节 memory line 在 home cluster 有 1 条记录 = **状态 2 bit + sharer bitmap 64 bit**。状态只有三种：没人缓存 / 多家共享只读 / 一家独占可写。

3. **请求路径**：cluster A 缺数据 → 本地 cache miss → 发消息到 home cluster → 查 directory → 直接返回（shared 状态）或先去 dirty 持有者那里抓回（dirty 状态）→ 数据沿响应网回 cluster A，directory bitmap 更新。

4. **两张独立 mesh**：请求一张、响应一张。如果共用一张，**请求挤满了响应回不来 → 全局死锁**。这是 NUMA 网络设计的标准答案，从 DASH 起。

5. **Release Consistency**（同年 Gharachorloo 提）：写**不立刻全局可见**，到 release（解锁）那一刻才统一暴露。让硬件能乱序合并写，论文量化加速 **10-40%**。这是后来所有弱内存模型的祖先。

6. **Home node 的角色**：每条物理地址静态映射到一个 cluster 当 home。不是缓存，是**元数据守门人** —— 读写都先问它，它再决定怎么转发。这种"集中元数据"思想后来又被 GFS / Bigtable 各演一遍。

## 实践案例

### 案例 1：你的服务器就是层级化 DASH

```
$ lscpu | grep NUMA
NUMA node(s):  2
NUMA node0 CPU(s): 0-31
NUMA node1 CPU(s): 32-63
```

两个 socket 的 Epyc / Xeon 服务器，**socket = DASH cluster，UPI/Infinity Fabric = DASH mesh**。每个 socket 有 home agent 维护 cache directory（或叫 snoop filter）。

`numactl --hardware` 看到的 latency matrix 就是 DASH 论文里量化的"本地 / cluster 内 / 远端 / 远端 dirty"四个数字的现代版。

### 案例 2：first-touch 策略 = NUMA 感知编程

```c
// 错：主线程分配，工作线程跨 socket 访问 → 慢
int *arr = malloc(N * sizeof(int));
#pragma omp parallel for
for (i = 0; i < N; i++) arr[i] = compute(i);

// 对：让每个线程自己 first-touch 自己的页 → 数据落本地 socket
#pragma omp parallel for
for (i = 0; i < N; i++) arr[i] = 0;  // 触发分配
#pragma omp parallel for
for (i = 0; i < N; i++) arr[i] = compute(i);
```

DASH 论文已经发现 first-touch / page migration 是程序员必须管的，不是硬件透明问题。30 多年后，这个坑还在。

### 案例 3：DASH 量化的 NUMA 比例

| 访问类型 | 周期数（论文实测） |
|---|---|
| 本地 L1 cache | 1 |
| cluster 内 L2 | ~30 |
| 远端 home cluster（shared） | ~100 |
| 远端 dirty（要再转一跳） | ~130-170 |

**远端比本地慢 100 倍**这件事，是 DASH 第一次量化清楚的。后来所有 NUMA 教材都用同样的金字塔图。

今天在 Epyc 上跑 `numactl --hardware` 看到的 distance 矩阵（10 / 20 / 32 这种）就是这张表的现代等比缩放版 —— 数字单位换了，比例还在。

## 踩过的坑

1. **directory bitmap 不可扩展**：64 位 bitmap 装 64 处理器刚好，到 1024 处理器就崩。后来的 SGI Origin / Alpha 21364 用 chained list / coarse bitmap / sparse 各种压缩方案绕开。

2. **Home node 是热点**：所有访问某 line 的请求都得先到 home cluster，跨 cluster 流量天然不均。DASH 没解，只把它量化清楚 —— 这是后来 NUCA / cache directory replication 研究的起点。

3. **RC 调试难**：弱内存模型下，写不按程序顺序可见，并发 bug **不可重现**。今天教科书里讲的 *memory barrier / happens-before / Java MM*，源头都是 DASH 实战踩出来的。

4. **cluster 内 SMP 假象**：cluster 内 4 个核仍是 SMP，软件以为 SMP，但跨 cluster 比例藏不住。**操作系统必须暴露 NUMA 拓扑给应用**（numactl / cpuset），不能假装透明。

## 适用 vs 不适用场景

**适用**：
- 多 socket 服务器的硬件一致性（Epyc / Xeon / Power） —— DASH 是它们的拓扑祖先
- GPU 多卡共享显存（NVLink / NVSwitch / Grace-Hopper UMA） —— 思想直接搬运
- 中型 NUMA HPC 节点（4-16 socket，OpenMP / MPI 混合） —— 软件层照着 DASH 抽象写

**不适用**：
- 单 socket 单 chiplet 的简单 SMP —— snoop 就够，加 directory 是负担
- share-nothing 集群（MPI / Spark / 数据中心 RPC） —— 用显式消息，不需要硬件一致性
- 嵌入式单核 / MCU —— 这个问题不存在

## 历史小故事（可跳过）

- **1983**：Goodman 提出 cache snoop（吵架式总线一致性），SMP 时代开启
- **1985**：Censier-Feautrier 论文里写下 directory 想法（前台登记本），纸面工作
- **1989**：Stanford DASH 项目启动，Hennessy / Horowitz / Gupta 联合带 —— 硬件 + 编译器 + 应用三组合作
- **1990**：组里 Gharachorloo 提出 Release Consistency，DASH 是第一台实现 RC 的机器
- **1992**：IEEE Computer 这篇 17 页综述发表，CC-NUMA 的奠基文献
- **1996**：SGI Origin 2000 出货，DASH 商品化（Hennessy 是 SGI CTO）
- **2003**：AMD Opteron + HyperTransport，把 DASH 思想塞进 x86 单芯片多 socket
- **2017+**：AMD Epyc / Intel Xeon 加 chiplet / tile 层级，NUMA 树又深了一层

DASH 是**硬件原型 → 商品化 → 普及到每台服务器**这条路径的范例，间隔 4 年 → 7 年 → 14 年。

## 学到什么

1. **总线扩展性有硬上限**：电气 + 仲裁带宽决定 SMP 顶到 8-16 路就要换路线。directory 的本质是把"广播一致性"换成"按需点对点 + 集中元数据"。

2. **集中元数据 + 分布数据**是反复出现的系统设计套路：DASH directory / Lustre MDS / GFS master / Bigtable tablet master —— 同一个思想在不同抽象层各演一遍。

3. **NUMA 不透明**：硬件能给你 cache coherence，但 latency 阶梯藏不住。`first-touch` / `numactl` / NUMA-aware allocator 是程序员必须知道的抽象。

4. **弱内存模型不是折磨**：64+ 核要又快又一致是物理不可能。RC / acquire-release 是工程上**唯一可扩展**的妥协 —— ARM / RISC-V 今天都走这条路。

## 延伸阅读

- 论文 17 页 PDF：[Lenoski et al. 1992 IEEE Computer](https://web.stanford.edu/class/cs315a/papers/dash-computer92.pdf)（密度高但好读）
- Lenoski-Hennessy 整本书：*Scalable Shared-Memory Multiprocessing*（Morgan Kaufmann, 1995）—— DASH 团队写的全景
- Gharachorloo 博士论文：*Memory Consistency Models for Shared-Memory Multiprocessors*（Stanford 1995）—— RC 的完整数学
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》第 5 章 —— DASH 是教材级范例
- [[ampere-architecture-2020]] —— 现代 GPU 跨设备共享显存，directory 思想跨平台延伸

## 关联

- [[amdahl-law-1967]] —— 1967 年画出多核扩展的理论天花板，DASH 是 1992 年逼近天花板的工程实证
- [[ampere-architecture-2020]] —— GPU NVLink / NVSwitch 跨卡 coherence 沿用 DASH 思路
- [[aurora-exascale-2024]] —— 现代 HPC 节点内仍是 NUMA，节点间换成 share-nothing 消息传递

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amdahl-law-1967]] —— Amdahl 定律 — 串行比例决定并行加速比的上界
- [[aurora-exascale-2024]] —— Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算
- [[gpu-cache-coherence-2013]] —— GPU 缓存一致性 — 用时戳代替失效消息
- [[hydra-1974]] —— HYDRA — 用 capability 把整个内核重做成对象 + 票据

