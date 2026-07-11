---
title: CUDA — 把显卡变成通用并行计算平台
来源: 'NVIDIA, "NVIDIA CUDA Compute Unified Device Architecture Programming Guide 1.0", 2007'
日期: 2026-07-09
分类: 系统
难度: 初级
---

## 是什么

日常类比：CPU 像一个很聪明的大厨，能处理各种临时要求；GPU 像一整排学徒，单个人没那么灵活，但能同时切成千上万片洋葱。**CUDA** 做的事，就是给这排学徒发一本统一菜谱，让普通 C 程序员也能把重复劳动交给 GPU。

技术上，CUDA 是 NVIDIA 在 2007 年推出的**通用 GPU 并行计算平台和编程模型**。它把显卡从"只能画图的硬件"变成"能跑数组计算、矩阵乘、仿真、机器学习的协处理器"。

在 CUDA 之前，研究者要把数据伪装成纹理、把计算伪装成 shader。CUDA 之后，你可以直接写一个 `__global__` 函数，告诉 GPU："每个线程处理一个数组元素。"

最小心智模型是：CPU 负责发任务和搬数据，GPU 负责同时跑海量小任务。

## 为什么重要

不理解 CUDA，下面这些事都没法解释：

- 为什么 [[brook-2004]] 里的 stream/kernel 抽象最后没有成为主流，而 CUDA 成了事实标准
- 为什么 [[owens-2007-gpgpu-survey]] 会把 2007 年称作 GPU 通用计算的分水岭
- 为什么 PyTorch / TensorFlow 训练模型时只要 `.cuda()` 就能从 CPU 切到 GPU
- 为什么 NVIDIA 后续 [[kepler-architecture-2012]]、[[ampere-architecture-2020]]、[[hopper-architecture-2022]] 都围绕 CUDA 兼容性演进
- 为什么 OpenCL / SYCL 很难完全替代 CUDA——它不是单个 API，而是硬件、编译器、库和工具链打包

## 核心要点

CUDA 的第一版可以拆成 **三件事**：

1. **kernel：把一个函数复制成很多份同时跑**。类比：不是一个人算完 100 万个格子，而是 100 万个小工人各算一个格子。程序员写一段 `__global__` 函数，GPU 自动启动许多线程执行同一段代码。

2. **grid / block / thread：给海量小工人编号**。类比：学校里先分年级、再分班、再点名。`grid` 是整次任务，`block` 是一组能互相协作的线程，`thread` 是最小执行单位；`blockIdx` 和 `threadIdx` 让每个线程知道自己负责哪份数据。

3. **memory hierarchy：显存不是一块均匀仓库**。类比：每个班有自己的小白板（shared memory），全校有大仓库（global memory），每个学生有口袋（register）。CUDA 性能的核心，就是把常用数据放近一点，把远处显存访问变少。

这三件事合起来，解决了 GPGPU 时代最大的痛点：不用再懂图形管线，也能写真正的并行程序。

## 实践案例

### 案例 1：最小 CUDA 向量加法

```cuda
__global__ void add(float *a, float *b, float *c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}
```

逐部分解释：

- `__global__` 表示这个函数在 GPU 上跑，但由 CPU 发起
- `blockIdx.x * blockDim.x + threadIdx.x` 是线程编号，决定当前线程处理第几个元素
- `if (i < n)` 防止最后一个 block 里多出来的线程越界

### 案例 2：CPU 怎么启动 GPU

```cuda
int threads = 256;
int blocks = (n + threads - 1) / threads;
add<<<blocks, threads>>>(d_a, d_b, d_c, n);
```

逐部分解释：

- `threads = 256` 表示每个 block 放 256 个线程
- `blocks` 用向上取整保证 `n` 个元素都被覆盖
- `<<<blocks, threads>>>` 是 CUDA 的启动语法：启动多少个 block、每个 block 多少线程

### 案例 3：shared memory 为什么能加速

```cuda
__shared__ float tile[256];
int i = blockIdx.x * blockDim.x + threadIdx.x;
tile[threadIdx.x] = input[i];
__syncthreads();
output[i] = tile[threadIdx.x] * 2.0f;
```

逐部分解释：

- `__shared__` 分配 block 内共享的小缓存，第一代硬件每个 SM 只有 16KB
- 每个线程把 global memory 的一个数搬到 shared memory
- `__syncthreads()` 等全班都搬完再继续，避免有人读到还没写完的数据

## 踩过的坑

1. **以为线程越多越快**：线程多到寄存器和 shared memory 放不下时，occupancy 会下降，反而慢。

2. **忘记 CPU/GPU 是两套内存**：`cudaMalloc` 得到的是 device pointer，CPU 不能直接当普通指针解引用。

3. **把 shared memory 当自动缓存**：shared memory 不会自己装数据，必须每个线程手动搬、手动同步。

4. **忽略访存合并**：相邻线程如果乱读乱写，global memory 访问不能 coalesce，算力再高也会被显存拖死。

## 适用 vs 不适用场景

**适用**：

- 大量元素可以独立处理的任务，如向量加法、图像滤波、矩阵乘
- 计算密度高的任务，即每搬一次数据能做很多运算
- 能接受 CPU 发任务、GPU 跑任务这种异构结构的程序
- 需要调用成熟 GPU 库的场景，如 cuBLAS、cuDNN、NCCL、TensorRT

**不适用**：

- 强串行依赖的任务，如普通链表遍历、复杂状态机、传统事务逻辑
- 数据量很小的任务，kernel launch 和 PCIe 拷贝成本会盖过收益
- 分支极多且每个线程走不同路径的代码，warp divergence 会让并行度浪费
- 需要跨厂商统一接口的场景，应优先看 OpenCL、SYCL 或标准 C++ 并行

## 历史小故事（可跳过）

- **2004 年**：[[brook-2004]] 证明了 stream/kernel 这套抽象可行，Ian Buck 后来加入 NVIDIA。
- **2006 年 11 月**：NVIDIA 发布 G80 / GeForce 8800，统一 shader 架构让通用计算有了硬件底座。
- **2007 年中**：CUDA 1.0 公开，Programming Guide 1.0 把 thread block、grid、shared memory、compute capability 写成稳定接口。
- **2008 年**：Tesla 架构论文把 SM、warp、SIMT 这套词汇正式化，CUDA 从 SDK 变成学术和 HPC 的默认入口。
- **2012 年以后**：深度学习框架围绕 CUDA 生态生长，GPU 从科学计算加速器变成 AI 基础设施。

## 学到什么

1. **CUDA 的革命不是"GPU 更快"，而是"GPU 终于能被普通程序员调用"**。
2. **grid / block / thread 是硬件友好的约束**：block 内能同步，block 间不能同步，这让调度器能自由把 block 塞进任意 SM。
3. **性能来自数据放在哪里**：CUDA 新手先学语法，进阶一定要学 global / shared / register / cache 的距离差。
4. **生态锁定来自连续兼容**：从 2007 年 `threadIdx` 到 2024 年 Blackwell，顶层模型没断，库和工具才敢越堆越厚。

## 延伸阅读

- NVIDIA 原始资料：[CUDA Programming Guide 1.0](https://developer.download.nvidia.com/compute/cuda/1_0/NVIDIA_CUDA_Programming_Guide_1.0.pdf)（2007，CUDA 第一版编程模型）
- 官方现行文档：[CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)（看现代 thread hierarchy / memory hierarchy）
- 时代背景：[[owens-2007-gpgpu-survey]] —— CUDA 出现前大家怎样用 shader 硬撬 GPU
- 后续回顾：[[nickolls-dally-2010-cuda-era]] —— CUDA 之后 GPU computing 怎么成为时代主线
- 教科书：《Programming Massively Parallel Processors》—— CUDA 入门与性能优化经典教材
- 工程路线：[[cuda-streams-concurrency-2018]] —— 学会 basic kernel 后再理解 stream 并发的真实边界

## 关联

- [[brook-2004]] —— CUDA 的直接精神前身，把 stream/kernel 抽象先跑通
- [[owens-2007-gpgpu-survey]] —— 记录 CUDA 之前的 shader 黑魔法时代
- [[nickolls-dally-2010-cuda-era]] —— 从架构角度解释 CUDA 为什么能开启 GPU computing era
- [[kepler-architecture-2012]] —— CUDA 3.x 时代加入 shuffle、Hyper-Q、Dynamic Parallelism
- [[ampere-architecture-2020]] —— CUDA 11 起让 TF32 / BF16 / MIG 进入主流训练栈
- [[hopper-architecture-2022]] —— CUDA 12 扩展到 thread block cluster、TMA、FP8
- [[blackwell-architecture-2024]] —— CUDA 模型继续承载双 die、FP4、NVLink 5.0 时代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ampere-architecture-2020]] —— NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设
- [[blackwell-architecture-2024]] —— NVIDIA Blackwell — 双 die NV-HBI + 第二代 Transformer Engine + FP4 让万亿参数训练日常化
- [[brook-2004]] —— Brook for GPUs — 让显卡第一次能用人话编程
- [[hopper-architecture-2022]] —— NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制
- [[kepler-architecture-2012]] —— NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型
- [[maxwell-architecture-2014]] —— NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍
- [[nvlink-nvswitch-2018]] —— NVLink 2.0 + NVSwitch — 把 16 块 GPU 拼成一台机器
- [[pascal-architecture-2016]] —— NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡
- [[sycl-cpp-2020]] —— SYCL 2020 — 用一份标准 C++ 让 GPU/CPU/加速器一起跑
- [[turing-architecture-2018]] —— NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8
- [[volta-architecture-2017]] —— NVIDIA Volta V100 — 第一代 Tensor Core 把 AI 训练算力一夜抬 6 倍
- [[nvidia-mig]] —— NVIDIA MIG — 把一张 GPU 物理切成 7 张小卡
- [[open3d]] —— Open3D — 现代点云 / 几何库
