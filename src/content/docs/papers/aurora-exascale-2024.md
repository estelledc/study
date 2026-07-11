---
title: Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算
来源: Argonne Leadership Computing Facility, "The Aurora Exascale System", ALCF/Intel/HPE technical briefings, 2024
日期: 2026-05-31
分类: GPU 架构
难度: 中级
---

## 是什么

Aurora 是 Argonne 国家实验室 2024 年正式投产的一台超级计算机。日常类比：如果说 Frontier（橡树岭）是用 AMD 零件拼的赛车，那 Aurora 就是用 Intel 零件拼的同级别赛车——两台都跑进了「每秒一百京次浮点」（1 EFLOPS）这条线，只是引擎和燃料系统完全不同。

它的硬指标：

- **理论峰值** > 2 EFLOPS FP64，HPL 实测 **1.012 EFLOPS**（TOP500 2024 年 6 月第二）
- **10,624 个节点**，每节点 2 颗 Intel Xeon Max + 6 颗 Intel Data Center GPU Max（代号 **Ponte Vecchio**）
- 全机 **21,248 CPU + 63,744 GPU**，超过 110 万 CPU 核
- 整机功耗约 38.7 MW（够一个小镇用电）

它最值得记住的一件事：这是**第一台用 Intel GPU 上 exascale 的系统**——之前的 exascale 全是 AMD（Frontier、El Capitan）或 NVIDIA 路线。

## 为什么重要

不理解 Aurora，下面这些事都说不清：

- 为什么美国能源部（DOE）愿意花十亿美元押注 Intel——而不是把蛋全放 NVIDIA 篮子里
- 为什么 SYCL / oneAPI 这套「开放替代 CUDA」的方案有人认真投钱
- 为什么 Aurora 从 2015 立项到 2024 才完工，中间换了三次设计——硬件路线选错代价多大
- 为什么 Intel 后来反而放弃了独立 GPU 路线（Falcon Shores 取消），但 Aurora 已经在跑

简短答案：**Exascale 不是 NVIDIA 一家的故事**。但走另一条路要付出 9 年时间、多次重设计、和远没那么成熟的软件栈。

## 核心要点

Aurora 的设计可以拆成 **四个反主流的决定**：

1. **GPU 选 Intel Ponte Vecchio**：当时主流超算选 NVIDIA H100 或 AMD MI250。Intel 这块芯片用 **47 个有源 tile** 拼起来——CPU 计算 tile、I/O tile、HBM 控制 tile——通过 **Foveros 3D 封装 + EMIB 桥接**连成一块。混合工艺（Intel 7 + TSMC N5/N7），约 **1000 亿晶体管**。每块 GPU 有 128 个 Xe core、**408 MB L2 cache（Rambo cache）**、128 GB HBM2e 显存。

2. **编程模型选 SYCL，不是 CUDA**：SYCL 是 Khronos 的开放标准（参考 [[sycl-cpp-2020]]），用标准 C++ 写异构代码。Intel 的实现叫 **DPC++**，整个 oneAPI 工具链围绕它转。代价：CUDA 生态成熟 15 年，SYCL 才几年，库少、bug 多、调试工具弱。

3. **CPU 也带 HBM**：Xeon Max（代号 Sapphire Rapids HBM）把 64 GB HBM2e **焊在 CPU 封装上**，让 CPU 也享受 1 TB/s 级别带宽。这是反主流的——传统超算 CPU 配 DDR、GPU 配 HBM。Aurora 让某些算法可以**完全跑在 CPU 上**而不丢带宽。

4. **存储用 DAOS 不是 Lustre**：DAOS（Distributed Asynchronous Object Storage）是 Intel 主导的对象存储系统，**220 PB 容量、31 TB/s 吞吐**。基于 NVMe + 持久内存，面向 AI/分析工作负载——传统 HPC 习惯的 Lustre/GPFS 是文件系统，DAOS 是 KV 对象存储。

## 实践案例

### 案例 1：一行 SYCL 代码 vs 一行 CUDA 代码

CUDA 写一个向量加法：

```cpp
__global__ void add(float* a, float* b, float* c, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) c[i] = a[i] + b[i];
}
```

SYCL（在 Aurora 上跑）：

```cpp
queue.parallel_for(range<1>(n), [=](id<1> i) {
  c[i] = a[i] + b[i];
});
```

**两者都能在 Ponte Vecchio 上跑**。但 SYCL 这份代码理论上**还能在 NVIDIA / AMD GPU 上跑**——这就是开放标准的承诺。代价：需要的 lambda 捕获、设备选择、queue 管理这些 ceremony 比 CUDA 多。

### 案例 2：节点内的拓扑

每个 Aurora 节点有 8 块芯片紧密耦合：

```
[CPU0]---[CPU1]      ← 两颗 Xeon Max（HBM on package）
   |        |
[G0 G1 G2][G3 G4 G5] ← 六颗 Ponte Vecchio
```

GPU 之间通过 **Xe Link**（类似 NVIDIA 的 NVLink）互联，CPU-GPU 走 PCIe Gen5。**6 块 GPU 走的是 all-to-all 拓扑**，让算法可以把数据切成 6 份并行。

### 案例 3：AuroraGPT — 大模型也跑在非 NVIDIA 上

ALCF 在 Aurora 上训练科学领域基础模型（**AuroraGPT**），证明了「不用 NVIDIA 也能训千亿参数模型」。代价：PyTorch 在 SYCL 后端的成熟度比 CUDA 后端落后大约 1-2 年，需要专门的工程团队改 framework。

## 踩过的坑

1. **Ponte Vecchio 量产难产**：2015 立项到 2024 投产，中间 **Aurora 至少重设计三次**——最早基于 Knights Hill（Xeon Phi），2017 取消；改基于 Ponte Vecchio，2021 后多次延迟；混合工艺良率问题让 Intel 很吃力。

2. **SYCL 软件栈不成熟**：很多科学软件包（NWChemEx、QMCPACK 等）需要专门移植，因为它们历史上只在 CUDA 上跑过。ALCF 的 Early Science Program 实际上是「帮你把代码改到 SYCL 能跑」的工程项目。

3. **47 个 tile 的封装良率**：单块 GPU 用 47 个 chiplet 拼起来，**任何一个 tile 坏整块就废**。这是 Aurora 投产慢的物理瓶颈之一。

4. **Intel 战略反复**：Aurora 投产后没多久，Intel 宣布 **Falcon Shores（Aurora 的下一代）取消独立 GPU 路线**——意味着 Aurora 可能是 Intel 在 exascale GPU 路线上的孤本。

## 适用 vs 不适用场景

**适用**：

- 大规模科学计算 / HPC 模拟（流体、气候、分子动力学）
- AI for Science（在科学数据上训基础模型）
- 多供应商风险对冲（DOE 不想全部押 NVIDIA）
- 需要 CPU+GPU 紧耦合（HBM on CPU 让 CPU 路径也快）

**不适用**：

- 想用 CUDA 生态成熟工具链（cuDNN、TensorRT、Triton）→ 直接选 NVIDIA 系统
- 想要 mature ML stack（HuggingFace 全套即开即用）→ SYCL 后端还在追赶
- 商业 AI 推理服务 → 没人用 Aurora 跑生产推理

## 历史小故事（可跳过）

- **2015**：Argonne 选定 Aurora，原计划 2018 上线 180 PFLOPS，基于 Intel Knights Hill（Xeon Phi 第三代）
- **2017**：Knights Hill 取消，Aurora 整个重设计——目标提到 exascale
- **2019**：与 Intel/Cray（后来 HPE 收购）签约，1 EFLOPS+
- **2021-2023**：Ponte Vecchio 多次延迟，Aurora 的 first light 一推再推
- **2023.6**：部分节点上线
- **2024**：正式 dedication，全机投产；TOP500 第二
- **2025（已知）**：Intel 取消 Falcon Shores 独立 GPU，Aurora 成为该路线的「孤峰」

之后超算路线如何走，没人能确定——但 Aurora 至少证明了「非 NVIDIA 路线」**物理上可行**。

## 学到什么

1. **Exascale 不是单一架构的胜利**：Frontier（AMD）+ Aurora（Intel）+ El Capitan（AMD）三种路线并存，证明了 EFLOPS 不需要 NVIDIA
2. **开放标准（SYCL）的代价**：能跨厂商可移植，但生态成熟度永远落后于「绑定单厂商」的 CUDA
3. **chiplet 封装是双刃剑**：1000 亿晶体管不可能单 die 做出来，必须 chiplet；但 47 个 tile 的良率风险也指数级放大
4. **CPU + GPU 紧耦合的实验**：HBM on CPU 让某些 workload 不必上 GPU——这是 Aurora 给业界留下的、真正可能影响下一代 CPU 设计的遗产

## 延伸阅读

- ALCF 官方页：[https://www.alcf.anl.gov/aurora](https://www.alcf.anl.gov/aurora)
- Intel Ponte Vecchio 架构白皮书（Hot Chips 2022）
- TOP500 2024 年 6 月榜单：[https://top500.org](https://top500.org)
- [[sycl-cpp-2020]] —— Aurora 主推的 GPU 编程模型
- [[ampere-architecture-2020]] —— NVIDIA 同期路线对照
- [[gpu-microbenchmarking-2010]] —— GPU 性能怎么真正测出来
- [[cuda-streams-concurrency-2018]] —— CUDA 异步执行模型，理解 SYCL queue 的对照

## 关联

- [[sycl-cpp-2020]] —— Aurora 软件栈的核心，开放标准 GPU 编程
- [[ampere-architecture-2020]] —— NVIDIA Ampere 是 Aurora 的同期对手路线
- [[cuda-streams-concurrency-2018]] —— CUDA 异步流模型，SYCL 抄了它的设计
- [[alpa-2022]] —— 大模型并行化，Aurora 上跑 AuroraGPT 的关键技术
- [[gpu-microbenchmarking-2010]] —— 怎么测一块新 GPU 的真实性能
- [[gpudirect-rdma-2014]] —— 跨节点 GPU 通信，Aurora 用 Slingshot 实现类似能力
- [[gpu-cache-coherence-2013]] —— GPU 多核间的 cache 一致性，Ponte Vecchio 408 MB L2 的设计起点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dash-numa-1992]] —— Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器
