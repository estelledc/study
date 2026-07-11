---
title: CUDA Unified Memory — 让 CPU 和 GPU 共享一张内存地图
来源: 'NVIDIA, "Unified Memory in CUDA 6 / Beyond GPU Memory Limits with Unified Memory on Pascal", Developer Blog 2014–2016'
日期: 2026-05-31
分类: 系统
难度: 中级
---

## 是什么

**Unified Memory（UM，统一内存）** 是 CUDA 6（2014）引入、Pascal（2016）真正落地的**虚拟地址抽象**：你用 `cudaMallocManaged` 申请一块内存，**CPU 和 GPU 都能直接读它写它**，不再手动 `cudaMemcpy` 来回搬。

日常类比：UM 之前 CPU 和 GPU 像**两个分仓库**——你要让 GPU 加工一批货，先开车把货从 A 仓搬到 B 仓（`cudaMemcpyHostToDevice`），加工完再搬回来（`cudaMemcpyDeviceToHost`），漏一趟就出错。UM 之后，**两个仓库共享一份总账本**——你说"把这批货加工一下"，**仓库管理员（运行时 + GPU MMU）按需把缺的页搬过去**，搬完算完再按需搬回——你不再亲自开车。

落到实现：CUDA 6 的 UM 是**软件假象**（kernel 启动前后整块批量拷贝）；CUDA 8 + Pascal GP100 加上**页错误硬件 + 49-bit 虚拟地址 + 页迁移引擎**，才升级成"真·按需迁移 + 显存可超额分配"。

## 为什么重要

不理解 UM，下面这些事都没法解释：

- 为什么 **2014 年后不少 CUDA 入门教程开始用 `cudaMallocManaged`**——一行替代两次显式 `cudaMemcpy`
- 为什么 **[[pascal-architecture-2016]] GP100 把"页错误硬件"当卖点**——没它 UM 只能整块同步，超额分配跑不动
- 为什么 **2016 年起 GPU 能跑超过显存的 dataset**（16GB 卡跑 30GB）——靠 oversubscription + 自动换出
- 为什么 [[hopper-architecture-2022]] 的 **Grace Hopper** 用 NVLink-C2C 直连 CPU/GPU——把"共享地址空间"做到硬件极致

## 核心要点

UM 从手工拷贝演进到 Pascal 真按需迁移，可以拆成 **三步台阶**：

1. **手工拷贝时代（2007–2013）**：`cudaMalloc` 在显存、`malloc` 在主存，两边各一个指针，靠 `cudaMemcpy` 显式搬。类比：两个仓库各管各的货，你亲自开车。优点是零运行时开销；漏拷一次就崩。

2. **CUDA 6 软件 UM（2014, Kepler/Maxwell）**：`cudaMallocManaged` 看起来共享——**实际 kernel 前后驱动整块同步**。类比：管理员假装共享账本，其实还是整车往返。不能超额分配，CPU/GPU 同时访问会冲突。

3. **CUDA 8 + Pascal 硬件 UM（2016, GP100）**：GPU 的 **MMU**（内存管理单元，像仓库门禁）支持 49-bit 虚地址 + **page fault**（页错误：刷卡发现货不在本仓，就去对面仓取一页）。按需迁移、可超额分配、可并发访问。Volta 再加 access counters，主动迁热页。

## 实践案例

### 案例 1：手工 cudaMemcpy vs Unified Memory

```cuda
// 手工：host/device 各一份 + 两次拷贝
float *h_x, *d_x;
h_x = (float*)malloc(N * sizeof(float));
cudaMalloc(&d_x, N * sizeof(float));
cudaMemcpy(d_x, h_x, N*4, cudaMemcpyHostToDevice);
kernel<<<G,B>>>(d_x);
cudaMemcpy(h_x, d_x, N*4, cudaMemcpyDeviceToHost);

// UM：一个指针；CPU 读前必须 sync
float *x;
cudaMallocManaged(&x, N * sizeof(float));
kernel<<<G,B>>>(x);
cudaDeviceSynchronize();   // 等 GPU 写完再读
```

**逐部分解释**：

1. 手工版要两份指针、两次 `cudaMemcpy`，漏一步就崩
2. UM 版 `cudaMallocManaged` 让 CPU/GPU 共用 `x`
3. **`cudaDeviceSynchronize` 不能省**——看着像共享，实际 GPU 写完前 CPU 读到旧值

### 案例 2：Oversubscription — 16GB 显存跑 30GB

```cuda
size_t big = 30L * 1024 * 1024 * 1024;  // 30GB > 16GB P100
float *data;
cudaMallocManaged(&data, big);
process_in_chunks<<<G,B>>>(data, big);
cudaDeviceSynchronize();
```

**逐部分解释**（Pascal+ 才行）：

1. **分配**：申请 30GB managed，驱动先记在账本上，不立刻塞满显存
2. **fault**：GPU 碰到不在显存的页 → page fault → 从 host 拉一页过来
3. **冷页换出**：显存满了就把久未访问的页换回 host（LRU），继续跑

代价：PCIe Gen3 ~16GB/s，远低于显存 ~700GB/s；延迟敏感负载仍要手分块。

### 案例 3：Prefetch + Advise 消掉 fault 风暴

```cuda
cudaMallocManaged(&x, N * sizeof(float));
init_on_cpu(x, N);
cudaMemAdvise(x, N*4, cudaMemAdviseSetPreferredLocation, gpuId);
cudaMemPrefetchAsync(x, N*4, gpuId);     // 提前搬到 GPU
kernel<<<G,B>>>(x);                      // 热路径零 fault
cudaDeviceSynchronize();
cudaMemPrefetchAsync(x, N*4, cudaCpuDeviceId);
```

**逐部分解释**：

1. CPU 先初始化；不 prefetch 则首访全是 fault，吞吐≈PCIe
2. `cudaMemAdvise` 告诉运行时"优先放 GPU"；`PrefetchAsync` 提前搬
3. kernel 期间数据已在显存；sync 后再 prefetch 回 CPU 读结果

## 踩过的坑

1. **CUDA 6 的 UM 不是真 UM**：Kepler/Maxwell 上整块迁移、不能超分、不能并发；oversubscription 只在 Pascal+ 才行。
2. **第一次访问全是 page fault**：不 prefetch 则吞吐≈PCIe Gen3 **~16GB/s**，不是显存 **~700GB/s**，差约 40 倍。
3. **Windows WDDM 受限**：桌面 GPU 上 UM 常无 oversubscription / 并发访问；完整 UM 看 Linux + 数据中心卡。
4. **漏 `cudaDeviceSynchronize`**：CPU 在 GPU 写完前读 managed 指针会读到旧值——和真共享内存的本质区别。

## 适用 vs 不适用场景

**适用**：

- CUDA 教学 / 原型 —— 一行 managed 替代两次拷贝
- Out-of-core —— 数据 > 显存，靠自动换页（可接受 PCIe ~16GB/s 换页开销）
- 不规则访存 —— 图 / 稀疏计算，按需 fault 比手分块容易

**不适用**：

- 极致吞吐 HPC —— 手工 `cudaMemcpy` + 双缓冲仍更快（显存 ~700GB/s 路径）
- 低延迟推理 —— fault 风暴拖累首 token 延迟
- Windows 桌面 GPU / 大型 DL 框架内部 —— WDDM 不完整；PyTorch 等自管 allocator

## 历史小故事（可跳过）

- **2007 CUDA 1.0**：`cudaMalloc` + `cudaMemcpy`，手工搬 7 年
- **2011 CUDA 4.0**：UVA——指针唯一虚地址，但不自动迁移
- **2014-03 CUDA 6**：`cudaMallocManaged`，软件 UM
- **2016-04 [[pascal-architecture-2016]] GP100**：页错误 + 49-bit VA——真·UM
- **2017–2022**：[[volta-architecture-2017]] access counters → [[hopper-architecture-2022]] NVLink-C2C 物理共享

## 学到什么

1. **软件先骗，硬件后真**：CUDA 6 批量拷贝伪装共享；Pascal 页错误才落地
2. **共享地址空间是老问题**：1980s DSM 思想换到 GPU 战场
3. **自动化 ≠ 可预测**：生产常混用 prefetch/advise，否则不如手工拷贝
4. **硬件能力 = 抽象上限**：没 49-bit VA / 页错误，API 只是空架子

## 延伸阅读

- [Unified Memory in CUDA 6 (2014)](https://developer.nvidia.com/blog/unified-memory-in-cuda-6/)
- [Beyond GPU Memory Limits on Pascal (2016)](https://developer.nvidia.com/blog/beyond-gpu-memory-limits-unified-memory-pascal/)
- [Maximizing Unified Memory Performance (2017)](https://developer.nvidia.com/blog/maximizing-unified-memory-performance-cuda/)
- [[pascal-architecture-2016]] —— 硬件 UM 起点
- [[hopper-architecture-2022]] —— NVLink-C2C 极致共享

## 关联

- [[pascal-architecture-2016]] —— GP100 页错误让 UM 从假象变真实
- [[volta-architecture-2017]] —— access counters 优化迁移
- [[ampere-architecture-2020]] —— UM 扩展到 NVLink 多卡
- [[hopper-architecture-2022]] —— Grace Hopper 物理共享
- [[mlx]] —— Apple Silicon 另一条统一内存路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
