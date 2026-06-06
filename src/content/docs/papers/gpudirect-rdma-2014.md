---
title: GPUDirect RDMA — 让网卡直接读写 GPU 显存
来源: 'Wang, Potluri, Bureddy, Rosales, Panda, "GPU-Aware MPI on RDMA-Enabled Clusters", IEEE TPDS 2014 + NVIDIA/Mellanox 2014 工业落地'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**GPUDirect RDMA** 是 NVIDIA 与 Mellanox 2013-2014 年合作落地的一条数据通路：让 **InfiniBand 网卡（HCA）直接读写 GPU 显存**，不经过 CPU、不经过主存。

日常类比：之前两台机器的 GPU 想交换梯度，要走"GPU→主存→网卡→网线→对面网卡→对面主存→对面 GPU"——像把楼上邻居的快递先搬到客厅再扔出窗户。GPUDirect RDMA 把"楼上→楼下"的搬运打通：网卡直接从 GPU 显存里抓字节发上网线，对面网卡直接落进对面 GPU 显存。**两次拷贝省掉，一次中断省掉**。

技术上靠三件事拼成：Kepler+ GPU 暴露 BAR1（PCIe base address register）映射的显存窗口，Mellanox ConnectX-3 / Connect-IB 网卡支持 PCIe peer-to-peer DMA，再加 NVIDIA 提供的 `nv_peer_mem` 内核模块当翻译层。

## 为什么重要

不理解 GPUDirect RDMA，下面这些事都没法解释：

- 为什么 **多机 GPU 训练**能在 2014 年之后突然跑得动——之前小消息 MPI 延迟 17-19 微秒，加 RDMA 直降到 5-6 微秒
- 为什么 **NCCL 的 inter-node 路径** 默认走 IB Verbs + GPUDirect RDMA——库的"跨机 all-reduce"性能基础就是这条通路
- 为什么 **Megatron-LM 多机 tensor parallelism** 才有可能——切矩阵乘横跨节点，每层后要做高频 all-reduce，没 GPUDirect RDMA 就被 CPU staging 拖死
- 为什么 **机房里 GPU 和 IB 网卡的 PCIe 拓扑布局变成大事**——它俩必须挂同一 root complex，否则路径退化到 1 GB/s

简一句话：**[[ring-allreduce-2017]] 是算法层、[[nvlink-nvswitch-2018]] 是机内总线、GPUDirect RDMA 是跨机网络层**——三者拼起来才有今天的 LLM 集群训练。

## 核心要点

GPUDirect RDMA 做了 **三件事**：

1. **GPU 显存挂上 PCIe 总线**：Kepler+ GPU 通过 BAR1 把一段显存窗口暴露成"标准 PCIe MMIO 区域"，对其他 PCIe 设备来说就像"内存里的一段地址"。BAR1 大小受限（256 MB-1 GB），是当年的硬约束。

2. **网卡直接 P2P DMA**：Mellanox HCA 收到 RDMA Verbs 请求后，发起 PCIe TLP（事务层包），目标地址是 GPU BAR1 里的那段窗口，**不经过 CPU 也不经过主存**。本质就是"两块 PCIe 设备互发 DMA"，PCIe 标准本来就支持，只是要打通驱动层。

3. **`nv_peer_mem` 当翻译层**：Linux 上 RDMA 子系统（OFED）原本只认识"ib_umem"管理的主存页。NVIDIA 写了 `nv_peer_mem` 这个内核模块，把"GPU 显存指针"翻译成 OFED 能认的 peer memory client 接口——上层 MPI / NCCL 才能像注册主存一样注册 GPU 显存。

### 关键数字（2014 Kepler + ConnectX-3 FDR 56 Gb/s）

- **小消息延迟**：17-19 微秒（host staging）→ 5-6 微秒（P2P direct）
- **大消息带宽**：PCIe 3.0 x16 理论 15.75 GB/s；实测同 PCIe switch 下 6-10 GB/s 接近线速
- **拓扑陷阱**：Sandy Bridge / Ivy Bridge 的 IOH 处理跨 socket P2P read 性能退化到约 1 GB/s——必须 GPU 和 HCA 同 root complex

### 三件事怎么互为支柱

- 没 **BAR1 暴露**，PCIe 设备压根看不见 GPU 显存
- 没 **HCA 支持 P2P DMA**，BAR1 暴露了也没人来读
- 没 **`nv_peer_mem` 翻译层**，应用层调 `ibv_reg_mr` 注册 GPU 指针时 OFED 直接报错——三件缺一不可

## 实践案例

### 案例 1：MVAPICH2-GDR 是"参考实现"

俄亥俄州立 D.K. Panda 团队在 ICPP 2013 / TPDS 2014 把 GPUDirect RDMA 集成进 MVAPICH2，做出 MVAPICH2-GDR 分支。**这是工业界第一个把"GPU-aware MPI"和"RDMA P2P"完整闭环的实现**——后续所有 GPU 集群 MPI 库（OpenMPI 的 UCX、IBM Spectrum MPI）都是参考它。

### 案例 2：PyTorch DDP 跨机背后的栈

```
loss.backward()
  └─ NCCL all-reduce
       └─ inter-node 走 IB Verbs
            └─ ibv_post_send 用 GPU 显存指针注册的 MR
                 └─ HCA P2P DMA 直读 GPU BAR1 → 上 IB 线
```

每一步反向传播之后那个梯度同步，跨机部分底下转的就是 GPUDirect RDMA。开发者写 `loss.backward()`，看不见这条链路。

### 案例 3：拓扑布局影响 10 倍性能

```
配置 A：GPU0 + HCA0 都挂 PCIe Switch X（同 PLX）
  → GPUDirect RDMA 实测 9-10 GB/s

配置 B：GPU0 挂 CPU0 root complex，HCA0 挂 CPU1 root complex
  → P2P 经过 QPI / IOH，退化到约 1 GB/s
  → 比 host staging 还慢（!）
```

2014-2016 年 HPC 工程师调机器的一项核心工作：**lspci 看 PCIe 拓扑，确保每张 GPU 和最近的 HCA 挂同一 switch**。NVIDIA 后来的 DGX-1 / DGX-2 整机就是把这件事固化进硬件设计。

### 案例 4：和 host staging 的对比图景

```
传统 host staging（pre-2014）：
GPU 显存 ─[cudaMemcpy]→ 主存 pinned buffer ─[ibv_post_send]→ HCA → 网线
        ~6 GB/s 拷贝               ~10 GB/s DMA
        2 次拷贝 + 1 次中断 + CPU 介入 → 17-19 µs 小消息延迟

GPUDirect RDMA（2014+）：
GPU 显存 ──[HCA P2P DMA]──→ HCA → 网线
        BAR1 直读，无 CPU 参与 → 5-6 µs 小消息延迟
```

延迟差 3 倍以上。对 N 卡梯度同步这种"高频小消息+大块数据"混合负载，差距在端到端训练步时间里能放大到 1.5-2 倍。

## 踩过的坑

1. **BAR1 太小不够注册**：Kepler K20 的 BAR1 只有 256 MB，要注册的 GPU buffer 超过它就失败。后来 Pascal 提到 16 GB，但早期用户经常踩。

2. **跨 NUMA 节点 P2P 直接崩盘**：Sandy / Ivy Bridge IOH 处理跨 socket peer-to-peer read 性能崩到 1 GB/s 以下——必须用 numactl 绑亲和性，否则比不开 RDMA 还慢。Haswell 之后好转。

3. **`nv_peer_mem` 模块版本要和 OFED + CUDA 严格对应**：升级一个组件就要重编另一个。当年 HPC 集群运维有专门的 "GDR 版本矩阵"。

4. **小消息 RDMA 反而不如 host staging**：< 4 KB 的消息，PCIe doorbell 写入开销超过省下的拷贝——MVAPICH2-GDR 设计了"小消息走 host staging、大消息走 RDMA"的混合阈值切换。

## 适用 vs 不适用场景

**适用**：

- 多机 GPU 训练梯度同步（NCCL inter-node、Horovod）
- HPC 模拟跨节点 GPU 数据交换（CFD、分子动力学）
- 推理集群多机张量并行（vLLM 多节点、TensorRT-LLM）

**不适用**：

- 单机内 GPU 间通信 → 用 NVLink / NVSwitch（带宽高 10 倍）
- 跨数据中心 → 走以太网 + RoCE 也行但要重新调拓扑
- 没 RDMA 网卡的 TCP/IP 集群 → 用 GPUDirect Async / GDS 的别条路径

## 历史小故事（可跳过）

- **2010**：NVIDIA 推 GPUDirect 1.0，只是"GPU 和网卡共享 pinned host memory"，省一次拷贝但还要过 CPU
- **2011**：GPUDirect 2.0 加 P2P，让同机 GPU 之间互发 DMA（这是 NCCL 单机基础）
- **2013**：CUDA 5.0 + Kepler K20 + Mellanox ConnectX-3 联手，**GPUDirect RDMA** 第一次跑通，Potluri ICPP 论文发表
- **2014**：Wang 等 IEEE TPDS 文章发表，MVAPICH2-GDR 1.8a 公开发布，工业界开始大规模部署
- **后续**：Pascal BAR1 扩到 16 GB、Volta 加 NVLink 2、Hopper 时代变成 GPUDirect Storage / GDS 也直读 NVMe

整条线 10 年间从"省一次 host 拷贝"演进到"GPU 显存当成网络一等公民"——是 LLM 时代基础设施的一根隐形脊梁。

## 学到什么

1. **PCIe peer-to-peer 早就支持，缺的是软件层**——GPU 和网卡互发 DMA 是 PCIe 标准能力，靠 `nv_peer_mem` 内核模块把 OFED 和 CUDA 驱动桥接起来才落地
2. **拓扑就是性能**——同 root complex 9 GB/s、跨 socket 1 GB/s，10 倍差距完全由布局决定。**软件最优解的前提是硬件挂在对的位置**
3. **混合策略胜过纯方案**——小消息 host staging + 大消息 RDMA，比"全 RDMA"更快。基础设施工程的常见模式
4. **跨机和机内是两套世界**：机内有 NVLink / NVSwitch，机外有 GPUDirect RDMA；NCCL 同时在两套世界上铺路由

## 延伸阅读

- 论文：[Wang et al. 2014 IEEE TPDS — GPU-Aware MPI](https://ieeexplore.ieee.org/document/6809154)（MVAPICH2-GDR 设计）
- 论文：[Potluri et al. ICPP 2013](https://nowlab.cse.ohio-state.edu/static/media/publications/abstract/potluri-icpp13.pdf)（GPUDirect RDMA 的 MPI 集成原始论文）
- 博客：[Rossetti 2014 — Benchmarking GPUDirect RDMA on Modern Server Platforms](https://developer.nvidia.com/blog/benchmarking-gpudirect-rdma-on-modern-server-platforms/)
- 文档：[NVIDIA GPUDirect RDMA 官方手册](https://docs.nvidia.com/cuda/gpudirect-rdma/)
- [[ring-allreduce-2017]] —— 算法层，依赖 GPUDirect RDMA 在跨机时高效
- [[nvlink-nvswitch-2018]] —— 机内总线层，与 GPUDirect RDMA 互补不重叠

## 关联

- [[ring-allreduce-2017]] —— Ring all-reduce 跨机部分必走 GPUDirect RDMA
- [[nvlink-nvswitch-2018]] —— 机内 GPU 互连，与跨机 RDMA 是两套世界
- [[kepler-architecture-2012]] —— 第一代支持 GPUDirect RDMA 的 GPU 架构（K20/K40）
- [[volta-architecture-2017]] —— BAR1 扩容、NVLink 2 之后 GPUDirect RDMA 进入主流
- [[megatron-lm]] —— 多机 tensor parallelism 直接依赖 GPUDirect RDMA 的低延迟
