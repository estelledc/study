---
title: "CUDA: A New Era of GPU Computing"
来源: "https://developer.nvidia.com/cuda-zone"
日期: "2026-06-13"
分类: 其他
子分类: arch-hardware
provenance: pipeline-v3
---

# CUDA: A New Era of GPU Computing — 零基础学习笔记

## 一、GPU 到底是什么？（用日常类比理解）

在学习 CUDA 之前，先理解 GPU 和 CPU 的区别。

### CPU vs GPU：厨师比喻

| | CPU | GPU |
|---|---|---|
| 角色 | 一位米其林三星主厨 | 一千个只负责切菜的小伙计 |
| 强项 | 复杂逻辑、单任务快 | 简单任务、大量并行 |
| 适合 | 你要做一道复杂的佛跳墙（程序流程复杂） | 你要切一万颗土豆（大量相同简单计算） |

GPU 的全称是 **Graphics Processing Unit**（图形处理器）。它最初是为了加速图形渲染设计的。图形渲染有一个特点：**每个像素的处理方式几乎相同**——都是计算颜色、亮度、位置。这种"大量相同简单任务"正是 GPU 的专长。

后来人们发现，不只是图像处理，很多科学计算（天气模拟、金融建模、AI 训练）都具有同样的"大量并行"特性。于是一个问题出现了：**如何告诉 GPU 去做这些通用计算？**

答案就是 CUDA。

## 二、什么是 CUDA？

### CUDA 的核心思想

CUDA（Compute Unified Device Architecture）是 NVIDIA 在 2007 年推出的**并行计算平台和编程模型**。它的核心思想很简单：

> **让程序员像写普通 C 语言一样写 GPU 程序。**

在 CUDA 出现之前，想利用 GPU 做通用计算（GPGPU），你必须用 OpenGL 或 Direct3D 这些图形 API，把计算"伪装"成图形渲染任务。这就像让切菜的小伙计去做佛跳墙——虽然理论上可行，但非常绕、非常痛苦。

CUDA 做的是：**让 GPU 直接理解"我要做计算"这个意图。**

### CUDA 架构概览

```
        CPU (Host)                  GPU (Device)
    ┌──────────────┐          ┌──────────────────┐
    │  主内存 (RAM) │◄──────►│  显存 (Global Mem) │
    │  少量核心     │          │  数千个小核心     │
    │  适合复杂控制  │          │  适合大量并行     │
    └──────────────┘          └──────────────────┘
```

关键概念：
- **Host（主机）**：CPU 及其内存
- **Device（设备）**：GPU 及其显存
- 数据需要在 Host 和 Device 之间来回搬运
- 代码有两部分：在 CPU 上跑的普通 C 代码 + 在 GPU 上跑的 CUDA 代码

## 三、核心概念详解

### 1. Kernel（内核函数）

Kernel 是在 GPU 上并行执行的函数。它的写法和我们平时写的 C 函数很像，但有两个关键字：

- `__global__`：告诉编译器这是一个在 GPU 上运行的函数，可以从 CPU 端调用
- `__device__`：告诉编译器这是一个只在 GPU 上运行的函数

### 2. Thread Block（线程块）和 Grid（网格）

这是 CUDA 编程模型中最核心的概念。

```
Grid（网格）
┌─────────────────────────────────────┐
│  Block 0  │  Block 1  │  Block 2   │  ← 线程块（Block）
│  ┌───┬───┐ │ ┌───┬───┐ │ ┌───┬───┐ │
│  │T0 │T1 │ │ │T2 │T3 │ │ │T4 │T5 │ │  ← 线程（Thread）
│  └───┴───┘ │ └───┴───┘ │ └───┴───┘ │
└─────────────────────────────────────┘
```

- 一个 **Thread** 是 GPU 执行的基本单位
- 多个 Thread 组成一个 **Block（线程块）**
- 多个 Block 组成一个 **Grid（网格）**

每个线程有自己的 ID（`threadIdx.x`），通过判断自己的 ID 来决定处理哪一部分数据。这就像厨房里有 1000 个切菜工，每个人都分配一个编号，编号 0 的切第 1 颗土豆，编号 1 的切第 2 颗……

### 3. 内存层次

GPU 有几层不同的内存，速度差异很大：

| 内存类型 | 速度 | 共享范围 | 类比 |
|---------|------|---------|------|
| 寄存器 | 最快 | 单个线程 | 你手上的刀和砧板 |
| Shared Memory | 快 | 一个 Block 内 | 一个切菜组的共享砧板 |
| Global Memory | 慢 | 所有线程 | 仓库里的菜 |

## 四、代码示例

### 示例 1：最简单的 CUDA 程序——向量加法

这是最经典的入门例子：把两个数组对应位置的元素相加。

```cpp
// 向量加法 CUDA 程序

#include <stdio.h>

// __global__ 修饰的函数在 GPU 上执行
// 每个线程处理数组中的一个元素
__global__ void vectorAdd(float* A, float* B, float* C, int N) {
    // 计算当前线程的全局索引号
    int i = blockIdx.x * blockDim.x + threadIdx.x;

    // 检查是否越界（防止多出来的线程处理不存在的元素）
    if (i < N) {
        C[i] = A[i] + B[i];   // 每个线程独立执行这一行
    }
}

int main() {
    int N = 1000000;              // 数组大小：100万个元素
    int size = N * sizeof(float);  // 字节数

    // 1. 在 CPU 端分配内存（Host）
    float* h_A = new float[N];
    float* h_B = new float[N];
    float* h_C = new float[N];

    // 初始化数据
    for (int i = 0; i < N; i++) {
        h_A[i] = (float)i;
        h_B[i] = (float)(N - i);
    }

    // 2. 在 GPU 端分配内存（Device）
    float *d_A, *d_B, *d_C;
    cudaMalloc(&d_A, size);
    cudaMalloc(&d_B, size);
    cudaMalloc(&d_C, size);

    // 3. 把数据从 CPU 复制到 GPU
    cudaMemcpy(d_A, h_A, size, cudaMemcpyHostToDevice);
    cudaMemcpy(d_B, h_B, size, cudaMemcpyHostToDevice);

    // 4. 配置并启动 Kernel
    int threadsPerBlock = 256;           // 每个 Block 放 256 个线程
    int blocksPerGrid = (N + threadsPerBlock - 1) / threadsPerBlock;
    vectorAdd<<<blocksPerGrid, threadsPerBlock>>>(d_A, d_B, d_C, N);

    // 5. 把结果从 GPU 复制回 CPU
    cudaMemcpy(h_C, d_C, size, cudaMemcpyDeviceToHost);

    // 6. 验证结果
    printf("前5个结果: ");
    for (int i = 0; i < 5; i++) {
        printf("%.0f ", h_C[i]);   // 输出: 1000000 1000000 1000000 ...
    }
    printf("\n");

    // 7. 释放内存
    cudaFree(d_A);
    cudaFree(d_B);
    cudaFree(d_C);
    delete[] h_A;
    delete[] h_B;
    delete[] h_C;

    return 0;
}
```

**这个程序的执行流程：**

1. CPU 准备两组数据
2. 把数据"搬"到 GPU 显存
3. 告诉 GPU："启动 4000 个线程块，每个块 256 个线程，总共约 100 万个线程同时工作"
4. 每个线程拿到自己的编号 `i`，只计算 `C[i] = A[i] + B[i]` 这一行
5. 结果搬回 CPU

**关键点：** 不是启动了一个函数，而是同时启动了大约 100 万个"函数副本"，每个副本处理一个不同的数组位置。

### 示例 2：矩阵乘法——展示 Shared Memory 优化

矩阵乘法是并行计算的经典问题。朴素实现每个线程读一行一列，会反复访问显存。引入 Shared Memory（线程块内共享内存）后可以大幅提速。

```cpp
// 矩阵乘法 — 使用 Shared Memory 优化

#include <stdio.h>

#define TILE_SIZE 16   // 每个线程块处理的子矩阵大小（16x16）

// 在 GPU 上执行的矩阵乘法 Kernel
// 使用 Shared Memory 来减少全局内存访问
__global__ void matrixMulSharedMemory(float* A, float* B, float* C, int width) {

    // Shared Memory：一个线程块内的所有线程共享这片小内存
    // 速度比全局内存快很多倍
    __shared__ float sA[TILE_SIZE][TILE_SIZE];
    __shared__ float sB[TILE_SIZE][TILE_SIZE];

    // 当前线程要计算的 C 矩阵元素的位置
    int bx = blockIdx.x;
    int by = blockIdx.y;
    int tx = threadIdx.x;
    int ty = threadIdx.y;

    int row = by * TILE_SIZE + ty;   // 当前线程负责的行
    int col = bx * TILE_SIZE + tx;   // 当前线程负责的列

    float sum = 0.0f;   // 累加结果

    // 分块计算：把大矩阵切成 TILE_SIZE x TILE_SIZE 的小块
    // 每个小块先加载到 Shared Memory，计算完再换下一块
    for (int m = 0; m < (width + TILE_SIZE - 1) / TILE_SIZE; m++) {

        // 1. 从全局内存加载 A 和 B 的子块到 Shared Memory
        if (row < width && (m * TILE_SIZE + tx) < width)
            sA[ty][tx] = A[row * width + (m * TILE_SIZE + tx)];
        else
            sA[ty][tx] = 0.0f;

        if (col < width && (m * TILE_SIZE + ty) < width)
            sB[ty][tx] = B[(m * TILE_SIZE + ty) * width + col];
        else
            sB[ty][tx] = 0.0f;

        // 2. 同步！等所有线程都把数据加载完才能继续
        __syncthreads();

        // 3. 用 Shared Memory 中的数据做乘积累加
        for (int k = 0; k < TILE_SIZE; k++) {
            sum += sA[ty][k] * sB[k][tx];
        }

        // 4. 同步！等所有线程算完再加载下一块
        __syncthreads();
    }

    // 5. 把结果写回全局内存
    if (row < width && col < width) {
        C[row * width + col] = sum;
    }
}
```

**Shared Memory 的工作原理（用厨房类比）：**

想象一个 16x16 = 256 人的切菜小组：
1. 先从仓库（Global Memory）把一筐菜（TILE_SIZE x TILE_SIZE 的子矩阵）搬到小组的共享砧板（Shared Memory）上
2. 每个人从砧板上拿自己需要的部分来切菜
3. 切完一轮，把空筐搬回仓库，再搬一筐新菜
4. 因为砧板离每个人很近（Shared Memory），比去仓库（Global Memory）快得多

**`__syncthreads()` 是什么？**

它就像食堂阿姨打饭时的"等所有人到齐再开饭"。如果一个线程块里的某个线程还没把数据放好，其他线程必须等。没有这个同步，就会出现"数据还没搬完就开始算"的 bug。

## 五、CUDA 为什么改变了世界？

在 CUDA 之前，GPU 只是"显卡"，用来画游戏画面。CUDA 出现后，GPU 变成了**通用并行计算加速器**。

### 核心突破

1. **编程模型统一**：不再是图形 API 的 hack，而是原生的并行计算语言
2. **层次化抽象**：Thread → Block → Grid，把硬件并行映射为程序员能理解的模型
3. **分层内存**：寄存器、Shared Memory、Global Memory 让程序员有权衡性能的空间
4. **C 语言扩展**：不发明新语言，在 C 上加两个关键字，学习成本极低

### 影响

- **2009 年**：CUDA 首次被用于破解密码，比 CPU 快 60 倍，震惊安全界
- **2012 年**：深度学习革命——AlexNet 用 CUDA 加速的 GPU 在 ImageNet 夺冠
- **2023 年**：大语言模型时代——GPT-4 的训练用了数万个 CUDA GPU
- **今天**：AI、科学计算、金融建模、视频编码……无处不在

## 六、总结

CUDA 的本质就一句话：

> **给 GPU 写程序，就像给 CPU 写 C 程序一样简单。**

它引入了几个核心概念：
- **Kernel**：在 GPU 上并行执行的函数（`__global__`）
- **Thread / Block / Grid**：三层并行组织模型
- **Shared Memory**：线程块内的高速共享缓存
- **Host-Device 内存转移**：数据在 CPU 和 GPU 之间搬运

最关键的思维转变是：
- CPU 代码：一个线程按顺序执行
- CUDA 代码：**想象有上百万个线程同时运行，你只需要写"每个线程应该做什么"**

## 七、进一步学习

- [CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/) — NVIDIA 官方文档
- [CUDA by Example](https://developer.nvidia.com/cuda-example) — 入门教程
- [Accelerated Computing Hub](https://github.com/NVIDIA/accelerated-computing-hub) — NVIDIA 官方示例仓库
- [An Even Easier Introduction to CUDA](https://developer.nvidia.com/blog/even-easier-introduction-cuda/) — Mark Harris 的经典教程
