---
title: Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI
来源: Nickolls & Dally, "The GPU Computing Era", IEEE Micro 30(2), 2010
日期: 2026-05-31
分类: 硬件/异构计算
难度: 中级
---

## 是什么

这篇是 **CUDA 主架构师 Nickolls** 和 **NVIDIA 首席科学家 Dally** 在 2010 年合写的一篇回顾文章——他们俩相当于"GPU 通用计算"这个赛道的两位老兵。文章解释一件事：**GPU 这块本来用来画三角形的芯片，凭什么变成了跑科学计算和深度学习的主力**。

日常类比：原本饭店后厨只有一个大厨（CPU），点什么做什么，反应快；GPU 像 200 个学徒（每人手脚慢一点），但同一时间能切 200 颗洋葱。要是只切一颗洋葱，大厨快；要切 10000 颗，学徒团赢。

文章给出三件核心事：

1. **吞吐优先 vs 延迟优先**——同样多的硅，CPU 砸缓存和乱序逻辑追求"单条指令尽快出结果"；GPU 砸 ALU 和寄存器追求"每秒能跑多少条"
2. **SIMT 执行模型**——硬件把 32 条线程打包跑同一条指令（一个 warp），但程序员**看到的还是独立线程**，可以写 if/else
3. **CUDA 三层抽象**——thread → block → grid，配套 shared memory + barrier，让你写并行代码不用直接操作硬件

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 PyTorch / TensorFlow 必须选 GPU 而不是 CPU——根本问题不是"GPU 快"，是吞吐型工作负载在 CPU 上**根本不划算**
- 为什么 NVIDIA 市值能超 Intel——这篇 2010 年就铺好了"通用 GPU 计算"的话语体系
- 为什么后来 TPU / MI300 / H100 都长得有点像——它们都在这篇定义的框架里做选择
- 为什么 CUDA 难被 OpenCL / SYCL 取代——SIMT 抽象 + 工具链是 NVIDIA 十年积累
- 为什么"异构计算"成了显学——文章直接说："未来不是 CPU 死、GPU 赢，而是两个共存"

## 核心要点

### 1. 吞吐 vs 延迟——硅面积怎么花

```
CPU 一块芯片：[巨大缓存] [乱序逻辑] [分支预测] [少量 ALU]
GPU 一块芯片：[海量 ALU] [海量寄存器] [小缓存] [简单调度]
```

CPU 思路："一条线程要尽快跑完"——所以堆缓存藏延迟、堆乱序逻辑找并行。
GPU 思路："上万条线程在排队，单条慢点没关系"——所以堆 ALU、用线程切换藏延迟。

类比：CPU 像高铁（少量座位、极快），GPU 像绿皮火车（座位巨多、单程不快但运得多）。

### 2. SIMT——介于 SIMD 和多线程之间的中间层

老 CPU 向量化（SIMD）让你**手写**：

```c
__m128 a = _mm_add_ps(b, c);  // 4 个 float 同时加
```

——你必须自己想"4 个一组"，碰到 if/else 就尴尬。

GPU 的 SIMT 让你写：

```cuda
__global__ void add(float *a, float *b, float *c) {
    int i = threadIdx.x + blockIdx.x * blockDim.x;
    if (a[i] > 0) c[i] = a[i] + b[i];   // 写起来像普通线程
    else          c[i] = a[i] - b[i];
}
```

硬件背后做的事：

- 把 32 条线程打包成一个 **warp**，每周期跑同一条指令
- 碰到 if/else，**走 if 的 lane** 先一起跑（其他 lane 被 mask 掉），**走 else 的 lane** 后跑——这叫 **warp divergence**
- 程序员**写代码时不用管 warp**，但优化时要知道"分歧多就慢"

### 3. CUDA 三层抽象

```
grid           ← 一次 kernel launch（比如 1024 个 block）
 └─ block      ← 一组线程（最多 1024），共享 shared memory + 能 __syncthreads()
     └─ thread ← 单条线程，有自己的 register 和 thread index
```

**关键设计**：block 内能 sync、block 间不能。这一刀让 GPU 调度器有自由——它可以把 block 任意排到任意 SM 上、任意顺序，不用担心同步。代价：跨 block 通信只能走 global memory + atomic。

### 4. Fermi（2010）——这篇文章发表时的代表作

- **512 个 CUDA core**（16 SM × 32 core）
- **ECC 内存**——科学计算要求"算 100 小时不能因为宇宙射线翻一个 bit"，没 ECC 进不了 HPC 中心
- **双精度比上代 GT200 快 8 倍**——这是 GPU 第一次在科学计算里跟 CPU 打平
- **统一 L1/L2 缓存** + **并发 kernel 执行**——GPU 终于"像个独立处理器"

## 实践案例

### 案例 1：为什么矩阵乘法在 GPU 上能快 50 倍

CPU：8 核 × AVX-256（一次 8 个 float）= 同时算 64 个乘加
GPU（A100）：6912 个 CUDA core，每周期一次乘加 = 同时算 6912 个

结构上 GPU 多 100 倍 ALU。但单核频率低 3 倍，所以理论吞吐差 ~30 倍。再加上 GPU 内存带宽是 CPU 的 5-10 倍，实际跑 GEMM 经常 50 倍以上。

矩阵乘满足 GPU 的两个条件：**计算密度高**（每读一个元素能算 N 次）、**线程互不依赖**（每个输出元素独立）。

### 案例 2：为什么深度学习选 GPU 不是巧合

2012 年 Krizhevsky 用 2 块 GTX 580 训了 AlexNet，把 ImageNet top-5 错误率从 26% 砍到 16%。事后看，这是个**架构对齐**：

- 卷积/矩阵乘 = 大量独立的 fused-multiply-add → 命中 GPU 的吞吐型设计
- mini-batch SGD = 天然有 batch 这层并行 → 命中 grid/block 抽象
- 模型不大（百兆级）→ 能塞进 GPU 显存

这篇 2010 年的论文里 Dally 已经提到"throughput computing"会成为下一波——AlexNet 是第一个标志性应用。

### 案例 3：异构编程的新麻烦

```cuda
cudaMalloc(&d_a, N * sizeof(float));         // GPU 上分配
cudaMemcpy(d_a, h_a, N*4, cudaMemcpyHostToDevice);  // CPU → GPU 拷
kernel<<<grid, block>>>(d_a);                // 在 GPU 跑
cudaMemcpy(h_b, d_b, N*4, cudaMemcpyDeviceToHost);  // GPU → CPU 拷
```

Host（CPU）和 Device（GPU）两套内存，每次跑一段都要拷。**PCIe 带宽 ~16 GB/s**，比 GPU 显存（500+ GB/s）慢 30 倍——很多算法在 GPU 上理论快 50 倍，加上拷贝成本只剩 5 倍。这是这篇文章已经预警的"未来问题"，后来 NVLink / unified memory / pinned memory 都是为了解决它。

## 踩过的坑

1. **以为 SIMT = SIMD**：SIMT 程序员视角是独立线程，有自己的 PC（程序计数器，硬件层 Volta 之后才真正独立）。SIMD 是程序员手动打包向量。混淆这俩在面试和写优化时都会翻车。

2. **以为 GPU 始终比 CPU 快**：分支多、串行依赖强（链表遍历）、数据小（< 一个 warp）这三种场景 GPU 都打不过 CPU。论文反复强调"异构"——挑对工作负载才有意义。

3. **忽略 PCIe 拷贝成本**：新手喜欢"GPU 加速 50 倍"，没算上 H2D/D2H 拷贝。一个 small kernel 单独跑 GPU 经常比 CPU 慢，因为拷贝比计算还耗时。

4. **以为 warp size 永远是 32**：NVIDIA 一直是 32，AMD GCN 是 64，AMD CDNA/RDNA 也变化。写"硬编码 32"的代码移植会爆。

## 适用 vs 不适用场景

**适用**：

- 大规模并行 + 计算密度高（矩阵乘、卷积、N-body、流体）
- 数据可批处理（深度学习 mini-batch、光线追踪每条光线独立）
- 数据量大到能摊薄 PCIe 拷贝成本

**不适用**：

- 强串行依赖（数据库事务、传统 OS 内核）
- 大量分支 + 难以聚合的 if/else（编译器前端、解析）
- 数据极小（不够喂满一个 SM）
- 内存不规则随机访问（CPU 大缓存反而占优）

## 历史小故事（可跳过）

- **2003**：GPGPU 早期，研究者把矩阵 hack 成贴图丢给 OpenGL pixel shader 算——能跑但难写
- **2006**：G80（GeForce 8800）发布，第一代统一着色器架构，CUDA 1.0 同期推出。Nickolls 是 CUDA 团队核心
- **2008**：CUDA 进 HPC——但科学家抱怨没 ECC、双精度太弱
- **2010**：Fermi（GF100）回应抱怨——ECC + 8 倍双精度 + 并发 kernel。同年这篇 IEEE Micro 论文发表，相当于"我们做完了，可以聊聊未来"
- **2011**：Nickolls 因病去世（年仅 49）
- **2012**：AlexNet 用 GTX 580 训 ImageNet，深度学习时代开启
- **2017**：Volta（V100）加 Tensor Core，专为深度学习的矩阵乘
- **2022**：Hopper（H100）+ Transformer Engine，专为 LLM

## 学到什么

1. **架构选择是"硅面积怎么花"的取舍**——CPU 花在缓存/乱序，GPU 花在 ALU/寄存器。没有绝对优劣，只有"对什么工作负载"
2. **SIMT 是抽象层的胜利**——既不是纯 SIMD（程序员手写向量）也不是纯多线程（每条线程独立 PC），中间这层让普通程序员能用上 GPU
3. **异构是终局**——这篇 2010 年的预测后来全部应验。CPU+GPU+NPU 共存，每个跑自己擅长的段
4. **生态比硬件更难**——CUDA 难被替代不是因为硅多牛，是因为 cuDNN / cuBLAS / NCCL / 编译器 / debugger / profiler 一整套堆了 15 年

## 延伸阅读

- 论文 PDF：[Nickolls-Dally 2010 IEEE Micro](https://ieeexplore.ieee.org/document/5446251)（DOI 10.1109/MM.2010.41，14 页）
- Dally 课程：[Stanford CS149 Parallel Computing](https://gfxcourses.stanford.edu/cs149)（throughput computing 的现代讲法）
- 入门书：《Programming Massively Parallel Processors》Hwu/Kirk/El Hajj（CUDA 教科书，把这篇的思想展开成 600 页）
- [[ampere-architecture-2020]] —— A100 时代的架构演进
- [[cuda-streams-concurrency-2018]] —— CUDA stream 与并发
- [[gpu-cache-coherence-2013]] —— GPU 内的 cache 一致性

## 关联

- [[ampere-architecture-2020]] —— A100：这篇预测的"throughput + ECC + 多 kernel"路线的延续
- [[cuda-streams-concurrency-2018]] —— Fermi 引入并发 kernel 的实战用法
- [[gpu-cache-coherence-2013]] —— GPU 缓存一致性的后续研究
- [[gpu-microbenchmarking-2010]] —— 怎么测 GPU 的真实性能
- [[gpudirect-rdma-2014]] —— GPU 直连网络：解决"PCIe 拷贝瓶颈"的一种思路
- [[sycl-cpp-2020]] —— 想用一份 C++ 跑 GPU/CPU/加速器的标准化尝试
- [[amdahl-law-1967]] —— 串行段决定并行加速上限：异构计算的理论起点
- [[attention]] —— Transformer 的矩阵乘是 GPU 时代的杀手级负载

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cell-be-2005]] —— Cell BE — 一颗 CPU 里塞 8 个加速核
- [[cuda]] —— CUDA — 把显卡变成通用并行计算平台
- [[fpga-hls-2011]] —— FPGA HLS 2011 — 把 C 代码自动翻译成芯片电路的范式
- [[owens-2007-gpgpu-survey]] —— Owens 2007 GPGPU 综述 — CUDA 之前 GPU 通用计算的黑魔法时代
