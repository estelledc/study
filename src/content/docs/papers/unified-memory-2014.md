---
title: CUDA Unified Memory — 让 CPU 和 GPU 共享一张内存地图
来源: 'NVIDIA, "Unified Memory in CUDA 6 / Beyond GPU Memory Limits with Unified Memory on Pascal", Developer Blog 2014–2016'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Unified Memory（UM，统一内存）** 是 CUDA 6（2014）引入、Pascal（2016）真正落地的**虚拟地址抽象**：你用 `cudaMallocManaged` 申请一块内存，**CPU 和 GPU 都能直接读它写它**，不再手动 `cudaMemcpy` 来回搬。

日常类比：UM 之前 CPU 和 GPU 像**两个分仓库**——你要让 GPU 加工一批货，先开车把货从 A 仓搬到 B 仓（`cudaMemcpyHostToDevice`），加工完再搬回来（`cudaMemcpyDeviceToHost`），漏一趟就出错。UM 之后，**两个仓库共享一份总账本**——你说"把这批货加工一下"，**仓库管理员（运行时 + GPU MMU）按需把缺的页搬过去**，搬完算完再按需搬回——你不再亲自开车。

落到实现：CUDA 6 的 UM 是**软件假象**（kernel 启动前后整块批量拷贝）；CUDA 8 + Pascal GP100 加上**页错误硬件 + 49-bit 虚拟地址 + 页迁移引擎**，才升级成"真·按需迁移 + 显存可超额分配"。

## 为什么重要

不理解 UM，下面这些事都没法解释：

- 为什么 **2014 年起 CUDA 入门教程突然不写 `cudaMemcpy` 了**——`cudaMallocManaged` 一行替代了两次显式拷贝
- 为什么 **[[pascal-architecture-2016]] GP100 把"页错误硬件"当卖点**——没它 UM 永远是假象，超额分配跑不动
- 为什么 **2016 年起 GPU 能跑超过显存的 dataset**（16GB 卡跑 30GB 数据集）——靠 oversubscription + 自动换出
- 为什么 [[hopper-architecture-2022]] 的 **Grace Hopper Superchip** 把 CPU/GPU 直接 NVLink-C2C 互联——UM 把"共享地址空间"做到极致的硬件答案
- 为什么 **PyTorch / TensorFlow 用户大多没听说 UM**——框架自己管显存，UM 主要给写裸 CUDA 的人省事

## 核心要点

UM 从手工 `cudaMemcpy` 演进到 Pascal 真按需迁移，可以拆成 **三步台阶**：

1. **手工拷贝时代（2007 CUDA 1.0 ~ 2013）**：`cudaMalloc` 在显存，`malloc` 在主存，两边各一个指针，`cudaMemcpy` 显式搬。优点是零运行时开销；缺点是代码冗长、漏拷一次直接段错误。

2. **CUDA 6 软件 UM（2014, Kepler / Maxwell）**：`cudaMallocManaged` 给一块"看起来共享"的内存——**实际 kernel 启动前驱动把整块同步到 GPU，结束后整块同步回 host**。本质还是批量 `cudaMemcpy`，但程序员代码看着像"共享"。**整块迁移、不能超额分配、CPU/GPU 同时访问会冲突**。

3. **CUDA 8 + Pascal 硬件 UM（2016, GP100）**：GPU MMU 支持 49-bit 虚拟地址 + 页错误。GPU 跑到一条访存指令、对应页**不在显存**——硬件触发 page fault → 驱动从 host 或对端 GPU 把那一页（4KB / 64KB / 2MB）拉过来 → 重启指令。意义：**按需迁移、可超额分配（显存换出冷页）、CPU/GPU 可并发访问、对端 GPU 直接拉页（P2P）**。

### 为什么 Pascal 是分水岭

- 没**页错误硬件**：UM 只能 kernel 边界整批同步，超额分配直接 OOM
- 没**49-bit 虚拟地址**：CPU 64-bit 指针塞不进 GPU 40-bit MMU，"同一指针两边能用"做不到
- 没**页迁移引擎**：fault 后搬页要走慢路径，吞吐崩盘
- Volta（2017）再加 **access counters**——硬件统计哪些页 GPU 频繁访问，主动迁移而不只被动响应 fault

## 实践案例

### 案例 1：手工 cudaMemcpy vs Unified Memory 代码对比

```cuda
// 手工拷贝：4 步走，漏一步就崩
float *h_x, *d_x;
h_x = (float*)malloc(N * sizeof(float));      // host 分配
cudaMalloc(&d_x, N * sizeof(float));          // device 分配
cudaMemcpy(d_x, h_x, N*4, cudaMemcpyHostToDevice);  // 上传
kernel<<<G,B>>>(d_x);
cudaMemcpy(h_x, d_x, N*4, cudaMemcpyDeviceToHost);  // 下载

// Unified Memory：一个指针通吃
float *x;
cudaMallocManaged(&x, N * sizeof(float));     // CPU/GPU 共用
// CPU 直接写 x[...]
kernel<<<G,B>>>(x);
cudaDeviceSynchronize();                       // 等 GPU 完
// CPU 直接读 x[...]
```

意义：**代码量减半 + 不会漏拷**。但**性能默认更差**（第一次访问全是 fault），需要 `cudaMemPrefetchAsync` 提示运行时提前搬。

### 案例 2：Oversubscription — 16GB 显存跑 30GB 数据

```cuda
// Pascal 之后才能这么写：分配 30GB 给 16GB 的 P100
size_t big = 30L * 1024 * 1024 * 1024;
float *data;
cudaMallocManaged(&data, big);
// 跑遍数据，GPU 按需把"当前热页"拉到显存，冷页换回 host
process_in_chunks<<<G,B>>>(data, big);
```

意义：**out-of-core 计算第一次"自动化"**——以前要程序员手动分块上传下载，现在驱动按 LRU 自动换。代价是 PCIe 来回吞吐有限，对延迟敏感的负载仍要手分块。

### 案例 3：Prefetch 提示让 fault 风暴消失

```cuda
cudaMallocManaged(&x, N * sizeof(float));
init_on_cpu(x, N);                                  // CPU 写
cudaMemPrefetchAsync(x, N*4, gpuId);                // 提前搬到 GPU
kernel<<<G,B>>>(x);                                 // 全在显存，零 fault
cudaMemPrefetchAsync(x, N*4, cudaCpuDeviceId);      // 搬回 CPU
```

意义：**默认 UM 性能拉胯，prefetch 之后接近手工 cudaMemcpy**。这也是 UM 的真实使用模式——不是"全自动魔法"，而是"省 90% 拷贝代码 + 关键路径手工 hint"。

### 案例 4：cudaMemAdvise 给运行时提示

```cuda
cudaMemAdvise(x, size, cudaMemAdviseSetReadMostly, gpuId);     // 多个读者复制
cudaMemAdvise(x, size, cudaMemAdviseSetPreferredLocation, gpuId); // 优先 GPU
cudaMemAdvise(x, size, cudaMemAdviseSetAccessedBy, cpuId);       // CPU 也常访问 → 建立映射
```

意义：**程序员还是要懂数据流**——UM 不是消灭手工，而是**把"何时迁移"从硬编码移到运行时 + 提示**，更灵活但仍需领域知识。

## 踩过的坑

1. **CUDA 6 的 UM 不是真 UM**：`cudaMallocManaged` 在 Kepler/Maxwell 上**整块迁移、不能超分、CPU/GPU 不能并发**。读 2014 年的教程以为能跑 oversubscription——只在 Pascal+ 才行。

2. **第一次访问全是 page fault**：不 prefetch 直接 launch kernel，**首批访问吞吐 = PCIe 带宽（16GB/s）而不是显存带宽（720GB/s）**。性能差 40 倍。新人总在这里被坑。

3. **Windows WDDM 模式至今受限**：游戏 / 桌面 GPU 走 WDDM 驱动，**Windows 上 UM 没有 oversubscription、没有并发访问**。Linux + Tesla 才是完整 UM。这条不写在显眼处，新人移植代码时频繁中招。

4. **`cudaDeviceSynchronize` 不能省**：UM 让你"看着像共享内存"，但**CPU 读 GPU 写完的数据前必须同步**——少一行 sync 就读到旧值。这是和真共享内存的本质区别。

5. **过度依赖自动迁移 → 性能不可预测**：HPC 团队上 UM 做原型，benchmark 时跑得慢——根因是 fault 风暴。**生产代码里 UM 通常配合大量 `cudaMemAdvise` + `cudaMemPrefetchAsync`**，否则不如手工 cudaMemcpy。

6. **跨 GPU UM 在 Pascal 也只能走 PCIe**：[[pascal-architecture-2016]] 的 NVLink 在 SXM2 卡上才有；PCIe 卡之间 P2P 走 PCIe Gen3，UM 跨卡迁移延迟高。Volta + NVSwitch 后才彻底改观。

## 适用 vs 不适用场景

**适用**：

- CUDA 教学 / 原型 —— 一行 `cudaMallocManaged` 替代两次拷贝，新人友好
- Out-of-core 计算 —— 数据集 > 显存，靠 oversubscription 自动换出冷页
- 不规则访存模式 —— 图算法 / 稀疏计算，提前不知道要哪些页，按需 fault 比手工分块容易
- 多 GPU 共享数据 —— UM 让对端 GPU 直接拉页，不用程序员管 P2P

**不适用**：

- 极致性能 HPC —— 手工 `cudaMemcpy` + 双缓冲 + 流水线仍是吞吐冠军
- 实时 / 低延迟推理 —— page fault 不可预测，**首 token 延迟受 fault 风暴拖累**
- Windows 桌面 GPU —— WDDM 驱动不支持完整 UM
- 大型 DL 框架内部 —— PyTorch / TensorFlow 自己实现 caching allocator，绕开 UM

## 历史小故事（可跳过）

- **2007 CUDA 1.0**：`cudaMalloc` + `cudaMemcpy` 出生，程序员手工搬 7 年
- **2011 CUDA 4.0**：UVA（Unified Virtual Addressing）—— **指针有唯一虚地址，但不自动迁移**，是 UM 前奏
- **2014-03 CUDA 6**：`cudaMallocManaged` 上线，软件 UM——开始把"共享"卖成程序员体验
- **2016-04 [[pascal-architecture-2016]] GP100**：硬件页错误 + 49-bit VA + 页迁移引擎——真·UM
- **2017-05 [[volta-architecture-2017]] V100**：access counters，迁移决策更聪明
- **2020-05 [[ampere-architecture-2020]] A100**：UM 跨 NVLink 网状 fabric，多卡共享地址空间
- **2022-09 [[hopper-architecture-2022]] H100 + Grace**：NVLink-C2C 把 CPU 和 GPU 物理直连，UM 在硬件层达成"真共享内存"

## 学到什么

1. **抽象的演进总是"软件先骗，硬件后真"**：CUDA 6 软件 UM 是骗——批量拷贝伪装共享；Pascal 硬件 UM 是真——页错误 + 迁移引擎让骗变成实
2. **共享地址空间是分布式系统古老问题在 GPU 的回响**：DSM（Distributed Shared Memory，1980s）研究的就是"多台机器共享虚拟地址 + 按需迁移"，UM 是同一思想换战场
3. **自动化 vs 性能可预测**：UM 让代码短 + 自动，但 fault 触发时机不可控——**生产代码常常退回手工 + UM 混用**
4. **硬件能力 = 抽象上限**：没 49-bit VA、没页错误硬件，再好的 API 也是空架子。Pascal 之前的"UM"本质是营销词
5. **从 CUDA 到 Grace Hopper 的弧线**：2014 的 `cudaMallocManaged` → 2022 的 NVLink-C2C 共享地址空间——**8 年时间，软件抽象一步步逼着硬件追上**

## 延伸阅读

- 入门博客：[Unified Memory in CUDA 6 (2014)](https://developer.nvidia.com/blog/unified-memory-in-cuda-6/)
- Pascal 进化：[Beyond GPU Memory Limits with Unified Memory on Pascal (2016)](https://developer.nvidia.com/blog/beyond-gpu-memory-limits-unified-memory-pascal/)
- 调优指南：[Maximizing Unified Memory Performance in CUDA (2017)](https://developer.nvidia.com/blog/maximizing-unified-memory-performance-cuda/)
- [[pascal-architecture-2016]] —— 硬件 UM 的真正起点
- [[volta-architecture-2017]] —— access counters 让迁移更聪明
- [[hopper-architecture-2022]] —— NVLink-C2C 把 UM 推到极致

## 关联

- [[pascal-architecture-2016]] —— GP100 页错误硬件让 UM 从假象变真实
- [[volta-architecture-2017]] —— V100 access counters + ATS 进一步优化迁移
- [[ampere-architecture-2020]] —— A100 把 UM 扩展到 NVLink 多卡 fabric
- [[hopper-architecture-2022]] —— Grace Hopper NVLink-C2C 让 CPU/GPU 物理共享
- [[mlx]] —— Apple Silicon 统一内存的另一条路径，硬件层就一份内存
