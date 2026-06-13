---
title: CXL 3.0 Coherence — Pool-Wide Memory Sharing 零基础学习笔记
来源: https://arxiv.org/abs/2605.30587
日期: 2026-06-13
分类: 基础设施
子分类: 系统综合
provenance: pipeline-v3
---

## 是什么

**Compute Express Link (CXL)** 是由 Intel 牵头、AMD / ARM / Google / AWS 等共同参与的**开放互连标准**。它基于 PCIe 物理层，但加了一套「语义层」，让 CPU 能把远端设备上的内存当作**自己本地内存一样直接访问**——不用 DMA、不用显式拷贝。

**CXL 3.0 Coherence: Pool-Wide Memory Sharing** 说的是：当多台服务器通过 CXL 互连、把内存汇聚成一个「池子」以后，池子里所有内存对**所有接入的 CPU** 都是**缓存一致性**（cache coherent）的。这意味着——任何 CPU 修改了池中的一行数据，其他 CPU 下次读这行时**自动看到最新版本**，就像数据本来就在本地 DRAM 里一样。

> 日常类比：
>
> 想象一个大型图书馆：
>
> - **没有 CXL 的旧做法**：A 教授想读 B 教授桌上的书，必须亲自走过去、复印几页、走回来。B 教授改了复印件上的笔记，A 毫不知情。
> - **有了 CXL 2.0（Memory Expansion）**：图书馆搞了个传送带——A 教授可以「请求」传送带把 B 教授桌上的整本书运过来，但运来的副本和本地书**互不相通**，改了一本就忘了另一本。
> - **有了 CXL 3.0 Coherence（Pool-Wide）**：图书馆所有书都在一个「智能书架系统」下。A 教授改了书上的笔记，B 教授翻开同一本书时**自动看到修改后的笔记**——不需要任何「同步」动作。书架系统就是 CXL.cache 协议。

一句话：**CXL 3.0 的 pool-wide coherence 让多台服务器的内存变成「一个大脑共享的多具身体」——每具身体有自己的思考（本地缓存），但「想法」全局一致。**

## 为什么重要

不理解 CXL 池化一致性，下面这些事都讲不清：

- 为什么 AWS 的 Inferentia / Graviton 服务器能把 GPU 和 CPU 的内存「合用」——不用 PCIe DMA，带宽高 10 倍、延迟低 5 倍
- 为什么「内存池化」从概念变成现实：以前 10 台服务器每台内存利用率 15%， pooled 后可升到 70%+
- 为什么传统 NUMA 方案做不到——NUMA 每台宿主机的内存只对本机 CPU 一致，跨机 NUMA 需要操作系统做复杂迁移
- 为什么 CXL 2.0 只能做「内存扩展」（expansion），不能做「内存共享」（sharing）——2.0 的一致性是 **host-to-device** 单向的，3.0 才变成 device-to-device 双向
- 为什么数据库、KV 缓存、AI 推理框架需要重新设计——它们过去假设「本地内存 = 快且一致，远程内存 = 慢且需要拷贝」

### 2.0 vs 3.0 的关键分水岭

| | CXL 2.0 | CXL 3.0 |
|---|---|---|
| 一致性方向 | 单向：Host ↔ Device | 双向：Device ↔ Device |
| 拓扑 | 星型，以 Host CPU 为中心 | 可跨多个 Host，形成 Mesh 或 Tree |
| 内存角色 | 本地 CPU 的「扩展 RAM」 | 多台 Host 共享的「统一内存池」 |
| 路由 | 每个 CXL 设备只有一个 Port ID | 支持 Switch + Port ID 多级寻址 |

## 核心概念

### 1. CXL 的三个子协议

CXL 不是一个单一协议，而是三个叠在一起：

| 协议 | 类比 | 职责 |
|------|------|------|
| **CXL.io** | 「登记注册」 | 发现设备、分配资源、枚举——类似 PCIe 的 config space |
| **CXL.mem** | 「直接读写」 | 让 CPU 像访问本地内存一样读写远端 CXL 设备的 DRAM |
| **CXL.cache** | 「同步通知」 | **缓存一致性协议**——当一方改了数据，通知其他方失效或更新自己的缓存行 |

只有 **CXL.mem + CXL.cache** 配合时，才能实现 pool-wide memory sharing。

### 2. 缓存一致性（Cache Coherence）到底是什么

先看一个直观问题：

```
CPU A 缓存行 L1 里有地址 0xA000 的数据 → 值是 42
CPU B 缓存行 L1 里也有地址 0xA000 的数据 → 值也是 42  （副本）
```

现在 CPU A 把 0xA000 改成 99：

| 没有 coherence | 有 coherence |
|---------------|-------------|
| CPU B 的 L1 里 0xA000 还是 42 | CXL.cache 协议让 CPU B 的 L1 里 0xA000 **自动变成 Invalid** |
| CPU B 下次读 0xA000 时，从 CXL 远端内存读出 99 | CPU B 下次读 0xA000 时，Miss → 自动从远端 fetch 最新值 |

核心问题：当 A 写、B 读时，**谁先动**？怎么让 B 的旧副本被清除？

CXL 的解答（高度简化）：

1. CPU A 发一个 **Snoop Request**（「我要写 0xA000，谁有副本？」）到 CXL fabric
2. 如果有设备持有该行的 **Shared / Modified** 状态（如 CPU B 的 L1），它回复 **Snoop Response**（「我有，我把它失效掉」）
3. CPU A 拿到所有回复后，把数据发到远端内存（或直送 B），然后自己把行状态变为 **Exclusive**（独占）

### 3. MESI 状态机 —— CXL.cache 的"语言"

CXL.cache 沿用了经典 MESI 协议，只是状态含义稍有扩展：

| 状态 | 含义 | 类比 |
|------|------|------|
| **M (Modified)** | 这行数据在我缓存里，且比内存新 | 「我手上有最终版」 |
| **E (Exclusive)** | 这行只在我缓存里，且和内存一样 | 「我手上有唯一副本，没改过」 |
| **S (Shared)** | 其他人也可能有这份副本 | 「我有一份，可能有人也有」 |
| **I (Invalid)** | 这行数据在我缓存里是废的 | 「我手里的版本过期了」 |

**关键规则**：任何时候，同一地址的行最多只能有一个 **M** 或 **E**（独占），其余必须是 **S** 或 **I**。

### 4. Pool-Wide vs 传统 NUMA

```
传统 NUMA（单台服务器）：

  CPU0 ──┐
  CPU1 ──┼── NUMA 交叉开关 ── 本地内存 + 远端内存（同机房）
  CPU2 ──┘
  CPU3 ──┘

CXL Pool-Wide（跨多台服务器）：

  Server A        Server B        Server C
  CPU0 ──┐        CPU0 ──┐        CPU0 ──┐
  CPU1 ──┤        CPU1 ──┤        CPU1 ──┤
  MEM0 ──┘        MEM0 ──┘        MEM0 ──┘

       ╔═══════════════════════════════╗
       ║  CXL Switch / Fabric          ║  ← 一致性拓扑层
       ╚═══════════════════════════════╝

  所有 MEM0 对 A/B/C 的 CPU0/1 都是 cache coherent
```

传统 NUMA：内存池只在**一台机器内**，跨机需要 OS 做 NUMA 节点迁移，延迟 10μs+。
CXL Pool：内存通过 CXL Switch 互联，一致性由**硬件协议**保证，跨机延迟 ~400ns（比本地 DRAM 的 ~100ns 慢 4 倍，但比网络高 100 倍）。

## 代码示例

### 示例 1：在 CXL Pool 里读写内存——CPU 视角

对程序员来说，CXL 池化内存最大的特点是：**代码里完全看不出内存在哪台机器上**。

```c
// 假设 OS 已经把 CXL Pool 注册为 /dev/cxl_pool 或通过 libcxld 暴露 mmap 接口

#include <sys/mman.h>
#include <stdio.h>

int main() {
    // 从 CXL 池申请 1GB 连续虚拟地址
    // 底层可能是本地 DDR，也可能是远端 CXL 设备上的 DRAM
    void* ptr = mmap(NULL, 1024 * 1024 * 1024,
                     PROT_READ | PROT_WRITE,
                     MAP_SHARED | MAP_ANONYMOUS,
                     -1, 0);

    // 直接写——就像操作本地数组一样
    volatile int* arr = (int*)ptr;
    arr[0] = 42;        // CPU A 写
    arr[1024] = 99;     // CPU B（另一台服务器）可以同时写 arr[1024]

    // 直接读——如果 CPU B 改了 arr[1024]，这里自动看到最新值
    // 不需要 sync、不需要 flush、不需要 invalidate
    printf("arr[0] = %d\n", arr[0]);   // 看到 42
    printf("arr[1024] = %d\n", arr[1024]); // 看到 99，即使那是另一台机器上的内存

    munmap(ptr, 1024 * 1024 * 1024);
    return 0;
}
```

对比传统的 **DMA 拷贝** 做法（CXL 2.0 模式）：

```c
// 传统 DMA 模式：需要显式把数据从远端拉到本地
void read_remote(int* local_buf, size_t len, uint64_t remote_addr) {
    // 1. 通知网卡/加速器从远端内存拉数据到本地 buffer
    dma_copy(local_buf, remote_addr, len);
    // 2. 等 DMA 完成
    dma_wait();
    // 3. 手动 sync 缓存一致性（CPU 和 DMA 设备之间）
    dma_sync_for_cpu(local_buf, len);
    // 4. 最后才能安全读
    printf("data = %d\n", local_buf[0]);
}
```

可以看到：CXL 3.0 把第 1-4 步**全藏到了硬件层**，应用层代码**不需要任何显式拷贝**。

### 示例 2：多线程共享 CXL Pool——一致性保证与伪共享

```python
import mmap
import os
import multiprocessing

# 模拟 CXL pool 上的共享内存（实际中由 cxl-shm 库管理）
SHM_PATH = "/dev/cxl_pool_shared"
size = 4096  # 一页 = 4KB = 1 cache line 的对齐单位

# 多进程 = 模拟多台服务器上的 CPU
def writer(pid):
    fd = os.open(SHM_PATH, os.O_RDWR)
    data = mmap.mmap(fd, size)
    # 写一个 cache line（64 字节）
    for i in range(1000000):
        # struct 对齐到 64B: counter, padding, counter2
        # 如果 counter 和 counter2 在同一个 cache line 里，
        # 就会触发「伪共享（false sharing）一致性风暴」
        struct.pack_into("q16xq", data, 0, i, i * 2)
        # 每次 pack 会触发 CXL.cache Snoop 协议：
        # 其他核的 L1 里这行变为 Invalid → 下次读要 re-fetch
    os.close(fd)

def reader(pid):
    fd = os.open(SHM_PATH, os.O_RDWR)
    data = mmap.mmap(fd, size)
    total = 0
    for _ in range(1000000):
        counter, _, counter2 = struct.unpack_from("q16xq", data, 0)
        total += counter
    print(f"reader-{pid}: read {total}")
    os.close(fd)
```

> **伪共享陷阱**：如果两个变量被编译器放在同一个 64B cache line 里，哪怕逻辑上互不相干——一个进程写 `counter`，另一个进程读 `counter2`，CXL.cache 也会把整行 invalidate。**结果：性能比预期慢 5-10 倍**。
>
> 解决：用 `alignas(64)` 或手动 padding 保证写变量和读变量不在同一 cache line。

## 关键数字

| 指标 | 本地 DDR | CXL 2.0 远端 | CXL 3.0 池化 |
|------|---------|-------------|-------------|
| 读延迟 | ~100ns | ~300-400ns | ~400-600ns |
| 写延迟 | ~120ns | ~500-700ns（需 coherence） | ~600-800ns |
| 带宽（单机） | ~100GB/s | ~50-80GB/s | ~50-80GB/s（跨 switch 减半） |
| 一致性粒度 | 缓存行（64B） | 缓存行（64B） | 缓存行（64B） |
| 一致性范围 | 本机 CPU | Host ↔ Device | **Pool-Wide（多 Host）** |

## 还没完全解决的问题

CXL 3.0 pool-wide coherence 在 2024-2026 年间仍存在挑战：

1. **延迟鸿沟**：CXL 远端内存延迟是本地 DDR 的 4-6 倍。如果程序访问模式随机（链表、树），性能可能比预期差很多。
2. **NUMA 感知**：当前 Linux kernel 对 CXL Pool 的 NUMA 拓扑抽象仍不完善——`numactl` 无法精确控制内存分配到哪个远端设备。
3. **一致性风暴**：当多个 CPU 写同一个 cache line（伪共享），CXL fabric 上会产生大量 Snoop 请求，成为瓶颈。
4. **持久性问题**：CXL 内存默认是 volatile（断电丢失），CXL 2.0/3.0 对 Persistent Memory (PMEM) 的支持仍在演进中。

## 延伸阅读

- [CXL 2.0/3.0 规范原文](https://cxl.io/resource-material/) — CXL Consortium 官方规范
- [CXL.cache 形式化验证论文](https://arxiv.org/abs/2410.15908) — 用 Isabelle 证明了 CXL 一致性协议的性质
- [CXL-DMSim 模拟器](https://arxiv.org/abs/2411.02282) — gem5 级别的 CXL 仿真平台
- [The Hitchhiker's Guide to CXL, NVLink-C2C, Infinity Fabric](https://arxiv.org/abs/2410.02814) — 三种主流一致互连横向对比
- [Cohet: CXL-driven coherent heterogeneous computing](https://arxiv.org/abs/2511.23011) — 基于 CXL 的异构计算框架
