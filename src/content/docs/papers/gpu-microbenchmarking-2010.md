---
title: GPU 微基准 — 用秒表把闭源芯片"戳"出真相
来源: Wong, Papadopoulou, Sadooghi-Alvandi, Moshovos, "Demystifying GPU Microarchitecture through Microbenchmarking", ISPASS 2010
日期: 2026-05-31
分类: 计算机体系结构
难度: 中级
---

## 是什么

GPU 厂商（NVIDIA / AMD）不会把内部电路图给你看。但你想优化 CUDA 内核，又必须知道 cache 多大、warp 怎么调度、跳分支多贵。怎么办？

**写一堆极小的 CUDA 程序，每个只为暴露一个细节，跑很多次记时间，再从时间差反推真实参数**。这就是"微基准（microbenchmarking）"。

Wong 等 2010 年这篇 ISPASS 论文，把这套方法**第一次系统化**用在 GPU 上，逆向出了 NVIDIA GT200（GeForce GTX 280）几乎所有微架构常数：texture / constant / instruction 各级 cache 大小与 line 长度、TLB 层数、warp 调度策略、SFU 流水线深度。注意：GT200 的 **global memory 本身不经 L1/L2 cache**（论文实测 uncached），常被引用的「约 5KB L1」指的是 **texture L1**。

日常类比：盲品红酒——不让你看标签，只用舌头一口口尝，然后推产地和年份。这里舌头换成了 GPU 计时器。

## 为什么重要

不理解这套方法论，下面这些事都没法解释：

- 为什么 FlashAttention / vLLM / cuBLAS 的内核敢假设 "L2 是 40MB、SM 内 shared memory 是 228KB"——这些**官方文档只给一部分**，剩下都是逆向来的
- 为什么每代新 GPU（Volta 2017 / Turing 2018 / Ampere 2020 / Hopper 2022）一发布就有人发 paper 重测——上一代结论作废了
- 为什么 Spectre/Meltdown 这类 CPU 侧信道攻击和 GPU 微基准**思路一模一样**——都是"硬件不告诉我，我自己拿秒表挨个戳"
- 为什么"性能调优"在 GPU 上经常感觉是玄学——你拿到的常数，根源都是某篇论文的实验

## 核心要点

微基准的方法论可以拆成 **三步**：

1. **设计探针**：写一个目的极简的 kernel，让你想测的那一个微观特征（cache miss / TLB miss / branch divergence）成为时间差里的**唯一变量**。其他干扰（指令流水、内存带宽）必须被压住或预测准。

2. **大量重复 + 统计**：跑几千上万次取平均，去掉冷启动、去掉 OS 噪声，画出时间-参数曲线。

3. **找突变点**：曲线上某个点突然从平到陡，那个突变就对应一个硬件边界（cache 容量耗尽 / page 切换 / warp 切换开销）。

整套思路不是"算"出来的——是"问"出来的。GPU 自己用响应时间回答你。

## 实践案例

### 案例 1：测 texture L1 cache 大小

GT200 上要复现论文的 5KB 数字，探针必须走 **texture 路径**（`tex1Dfetch` / texture 绑定），不能只读普通 global 指针——后者论文测得是 **uncached ~400+ cycle**，看不到 L1 台阶。

示意（省略 CUDA texture 绑定样板）：

```cuda
texture<int, 1, cudaReadModeElementType> tex;
__global__ void probe(int N, int stride, int *out) {
  int tid = threadIdx.x;
  int sum = 0;
  for (int i = 0; i < ITER; i++)
    sum += tex1Dfetch(tex, (i * stride) % N);
  out[tid] = sum;  // 写回，防止编译器删掉整段 load
}
```

固定小 stride（论文用 8–32 字节量级），把足迹 N 从 1KB 慢慢调大。**画一张图**：横轴 N、纵轴单次访问耗时。

观察现象：

- N < texture L1 时，命中 L1，延迟相对低
- N 超过 L1，miss 到 texture L2，耗时**上台阶**
- N 再超过 L2（论文测约 **256KB**），落到 DRAM，再上台阶

第一个突变点的横坐标就是 texture L1 大小。Wong 等测出 GT200 的 texture L1 约 **5KB / SM**（20-way、32B line）——这数字 NVIDIA 文档里**根本没写**。

### 案例 2：测 TLB（虚拟地址翻译缓存）

cache 测完还不够，因为 GPU 也有 page table。改一下：让 stride **特别大**（比如 1MB），保证每次访问都跳到不同 page，但**总数据量很小**——这样数据全在 cache 命中，但 page 必须每次重新查 TLB。

时间曲线再次出现突变点，对应 TLB 容量耗尽切到下一级。Wong 测出 L1 TLB 是 16 项，page 大小约 512KB（CUDA 自己管，**与 OS 4KB page 不同**）。

### 案例 3：测 warp 调度

让一个 warp 发 global memory load（必然 stall 几百 cycle），同时再起一个 warp 做纯算术。如果耗时 ≈ max(load, compute)，说明调度器**真的把空档填上了**；如果耗时 ≈ load + compute，说明它没切。

实测是前者——这就是 GPU 隐藏延迟的核心机制：**stall 一个就切下一个，永远有 warp 在跑**。

### 案例 4：测 branch divergence 的代价

GPU 的 32 个 thread 走在同一个 warp 里，正常情况一起执行。如果代码出现 if-else 让一半 thread 走 A、另一半走 B 呢？

```cuda
if (tid % 2 == 0) work_A();
else                work_B();
```

写两个 kernel：一个 if 让所有 thread 都走 A（无 divergence），一个让 thread 一半一半。测耗时差。结果：divergence 版本的耗时几乎等于 work_A + work_B——说明硬件**串行**走完两条路径，再 reconverge。

这个常数告诉你：**写内核要避免 warp 内分支不一致**，否则等于性能直接砍半。

## 踩过的坑

1. **编译器会替你"优化"掉探针**：你想测访存延迟，nvcc 看到结果没用就把 load 删掉了。解法：把结果写回 global 数组，让编译器不敢删；更彻底的做法是直接写 PTX 内联汇编。

2. **冷启动不是测量值**：第一次跑 cache 是空的，时间高得离谱。必须**先 warm-up** 几百次再开始记数。同一个测量重复几千次取中位数，不取平均（极端值会污染）。

3. **驱动 / 时钟门控干扰**：GPU 不忙时降频，你以为测出的是访存延迟，其实包含频率切换的 ramp-up。需要先跑负载把 GPU 顶到稳态，或在 nvidia-smi 里锁频。

4. **结论会随硬件过期**：本文针对 GT200。Volta（V100）的 L1 改成可配置 shared，TLB 又是另一套——**不能直接套常数**，方法论可复用，结果不可复用。

5. **CUDA page ≠ OS page**：本文测出 GPU page ~512KB，与 Linux 默认 4KB 完全不同。新人若把 CPU TLB 经验直接搬过来会 debug 半天。

## 适用 vs 不适用场景

**适用**：

- 闭源硬件（GPU / TPU / NPU）的内部参数逆向
- 优化前的 ground truth 探测——不靠官方文档，自己测一遍
- 教学：让学生理解"延迟从哪来""带宽什么时候撞墙"
- 安全研究：侧信道攻击的前置侦察（Spectre/Meltdown 同源方法）

**不适用**：

- 应用级性能调优——微基准只测元参数，不告诉你具体内核怎么写最快
- 完全开源硬件（RISC-V 大部分实现）——文档已经够，没必要逆向
- 时间分辨率低于硬件事件的场景（比如 Python 端测 cache miss——抖动远大于信号）

## 历史小故事（可跳过）

- **2010 年**：Wong 等四位多伦多大学研究者发表本文，逆向 GT200。当时 CUDA 才 3 年，NVIDIA 文档基本只写"shared memory 16KB"这种粗粒度常数。
- **2018 年**：Jia 等发表 *Dissecting the NVIDIA Volta GPU Architecture via Microbenchmarking*——同一套方法、新硬件、162 页技术报告。
- **2019 年**：Jia 等再发 Turing 版。**之后每代必有**。
- 这套方法已经成为 GPU 体系结构论文的"标准开场"——你不先逆向一遍微架构，没人信你后续优化数字。

## 学到什么

1. **闭源硬件不是黑盒**——只要你能控制输入、能精确测时间，足够多的实验可以反推任意细节
2. **方法论 vs 结果**——本文的结果（GT200 texture L1 ≈5KB）已过期，但方法论是永恒的
3. **测量科学的一般套路**：单变量探针 + 大量重复 + 找突变点。这套思路在心理学（反应时）/ 生物学（剂量反应）/ 安全研究（侧信道）都通用
4. **不要相信官方文档的全部**——也不要不信任何东西。自己测一遍，**心里有数**
5. **科学论文的"标准开场"**：现代 GPU 优化论文几乎都先用半节做微基准复现，确立硬件常数，再讨论自己的优化。没这一节读者不信你

## 延伸阅读

- 论文 PDF：[Wong et al ISPASS 2010](https://www.eecg.utoronto.ca/~moshovos/research/microbenchmark.pdf)
- Volta 续作：[Jia et al 2018](https://arxiv.org/abs/1804.06826)（162 页，把方法做到极致）
- 教程：[Mark Harris — How to Measure GPU Performance](https://developer.nvidia.com/blog/how-implement-performance-metrics-cuda-cc/)
- [[ptx-isa]] —— 写微基准最好下沉到 PTX 层，避免 nvcc 优化
- [[gpu-cache-locality]] —— 测出来的常数怎么用回内核优化

## 关联

- [[ptx-isa]] —— 微基准必须写在 PTX 层，C 层易被编译器骗
- [[gpu-cache-locality]] —— 本文给出常数，那篇用常数指导内核
- [[mlperf-rules]] —— 公开 benchmark 与微基准是两端：前者比应用、后者拆机理
- [[flash-attention]] —— 内核设计大量依赖逆向出的 SM/register 常数

## 一句话总结

**给我一块闭源 GPU 和一个秒表，我能把它的内部画出来。**

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora-exascale-2024]] —— Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算
- [[cell-be-2005]] —— Cell BE — 一颗 CPU 里塞 8 个加速核
- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[cuda-streams-concurrency-2018]] —— CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
- [[deering-1988-triangle-processor]] —— Deering 1988 Triangle Processor — 现代 GPU 的祖先架构
- [[gpu-cache-coherence-2013]] —— GPU 缓存一致性 — 用时戳代替失效消息
- [[lindholm-2008-tesla]] —— Lindholm 2008 Tesla — SM、warp、SIMT 这套词汇的官方出生证明
- [[nickolls-dally-2010-cuda-era]] —— Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI
- [[owens-2007-gpgpu-survey]] —— Owens 2007 GPGPU 综述 — CUDA 之前 GPU 通用计算的黑魔法时代
