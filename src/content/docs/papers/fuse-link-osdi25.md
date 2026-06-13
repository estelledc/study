---
title: "Enabling Efficient GPU Communication over Multiple NICs with FuseLink"
来源: https://www.usenix.org/conference/osdi25/presentation/ren
日期: 2026-06-13
分类: 基础设施
子分类: GPU系统
provenance: pipeline-v3
---

# Enabling Efficient GPU Communication over Multiple NICs with FuseLink

## 一、从一个日常类比开始

想象一个仓库有 8 个工人（GPU）和 8 个发货口（NIC）。每个工人原本固定绑定一个发货口 —— 工人 1 只用发货口 1，工人 2 只用发货口 2，以此类推。

现在问题来了：某些天，工人 1 要发的货特别多，发货口 1 排起了长队；而工人 5 当天几乎没货，发货口 5 闲着没事干。在旧的方案里，工人 1 不能借用发货口 5，因为"绑定关系"是写死的。结果就是：发货口 5 白白浪费，整个仓库的发货速度被发货口 1 这个"瓶颈"拖慢了。

**FuseLink 的核心想法很简单：打破这种死绑定。让有货的工人可以临时使用空闲的发货口，通过仓库内部的传送带（NVLink）把货"转运"过去。**

这就是 FuseLink 要做的事 —— 在 GPU 集群中，打破 GPU 和 NIC 之间静态的一对一绑定，让 GPU 可以灵活地使用多个 NIC 来发送和接收数据。

## 二、问题背景：为什么现有的方案不够好

在大规模分布式 ML（机器学习）任务中，GPU 之间的通信带宽往往是瓶颈。典型的大规模服务器配置是：

- 每台服务器 8 个 GPU
- 每个 GPU 通过 PCIe 连接到一个 RDMA NIC（400Gbps）
- GPU 之间通过 NVLink 连接（带宽高达 Tbps 级别）

传统的做法是"静态绑定"：GPU 0 用 NIC 0，GPU 1 用 NIC 1，一一对应。这样在理想情况下（所有 GPU 通信量相等）能跑满带宽。但实际情况要糟糕得多。

### 现实中的三种"通信量不均衡"场景

**场景 1：LLM 分布式推理**

把大语言模型的"预处理"（prefill）和"逐字生成"（decode）拆到不同服务器。请求到达是随机的，有的请求大、有的小，导致不同 GPU 之间的通信量差异巨大。实测 NIC 利用率只有 13%-53%。

**场景 2：Mixture-of-Experts（MoE）模型训练**

MoE 模型中，不同"专家"处理的数据量不同，all-to-all 通信天然不均衡。实测 NIC 利用率只有 29%-65%。

**场景 3：推荐模型训练（DLRM）**

推荐模型需要频繁地获取 embedding 向量，不同 GPU 需要的 embedding 量差异很大。实测 NIC 利用率 59%-82%，但通信仍占整体成本的 55%。

这些场景有一个共同点：**通信量是动态的、不可预测的**。静态绑定在这种场景下必然导致"有的 NIC 忙死，有的 NIC 闲死"。

## 三、FuseLink 的核心思想

FuseLink 的关键洞察是：**把服务器内部的高速连接（NVLink）变成外部网络（NIC）的延伸。**

### 3.1 架构总览

```
服务器 A                          服务器 B
┌─────────────────────────┐      ┌─────────────────────────┐
│ GPU0 ◄─── NVLink ───► GPU1 │      │ GPU0 ◄─── NVLink ───► GPU1 │
│  │              │        │      │  │              │        │
│  ▼              ▼        │      │  ▼              ▼        │
│ NIC0            NIC1     │      │  NIC0            NIC1     │
└─────────────────────────┘      └─────────────────────────┘
         ═══════ RDMA 网络 ═══════
```

假设 GPU0 需要发送大量数据给服务器 B 的某个 GPU：

1. **常规做法**：GPU0 只能用自己的 NIC0 发送
2. **FuseLink 做法**：GPU0 发现 NIC0 很忙，于是通过 NVLink 把数据发给 GPU1，再由 GPU1 通过 NIC1 发送出去

数据走的路径是：`GPU0 → NVLink → GPU1 → NIC1 → (RDMA网络) → GPU0' → NVLink → GPU1'`

NVLink 的带宽（Tbps 级别）远远超过 PCIe，所以这个"转运"几乎不会成为瓶颈。

### 3.2 三个关键技术挑战

FuseLink 要优雅地解决这个问题，必须跨过三道技术障碍：

**挑战 1：高效的数据转发（Relaying）**

当 GPU0 的数据要通过 GPU1 的 NIC1 发送时，数据怎么从 GPU0 "流到" GPU1？

- 如果让 CPU 介入做内存拷贝，速度受限于 PCIe，慢
- 如果让 GPU 线程直接写，涉及跨 GPU 的设备同步，也慢

**FuseLink 的解法：内存重映射（Memory Remapping）**

Linux GPU 系统使用统一虚拟内存地址空间。FuseLink 利用了这个特性：

1. 在 GPU0 上分配网络发送缓冲区
2. 把这个缓冲区的虚拟地址重新映射到 GPU1 的物理内存上
3. 当 GPU0 的线程"写入"这个缓冲区时，数据实际上写到了 GPU1 的内存里
4. 然后 GPU1 的 NIC 直接从这个缓冲区发起 RDMA 发送

整个过程没有额外的内存拷贝，没有 CPU 介入，没有跨设备同步。写操作通过 NVLink 自动"流到"了对端 GPU。

```python
# 概念性代码：内存重映射实现高效转发
# 步骤 1: 发送方 GPU0 分配网络发送缓冲区
send_buffer_gpu0 = cuda_alloc(size=1GB)

# 步骤 2: FuseLink 将虚拟地址重映射到中继 GPU1 的物理内存上
# 原本 send_buffer_gpu0 指向 GPU0 的物理页，现在改为指向 GPU1 的物理页
fuselink_remap(send_buffer_gpu0, target_gpu=GPU1)

# 步骤 3: GPU0 的线程继续"写入"缓冲区
# 由于重映射，数据实际上通过 NVLink 写入了 GPU1 的内存
gpu_threads[0].write(send_buffer, data)  # 数据通过 NVLink 到达 GPU1

# 步骤 4: GPU1 的 NIC 从该缓冲区发起 RDMA 发送
nic1.rdma_post_send(send_buffer_gpu0)  # 同一个虚拟地址，物理上在 GPU1 上
```

**挑战 2：不干扰对端的并发通信**

如果 GPU0 抢用了 GPU1 的 NIC1，会不会影响 GPU1 自己发送数据？会不会把 GPU1 的内存用光导致 OOM？

**FuseLink 的解法：只在空闲时借用**

- FuseLink 实时监控每个 NIC 的负载状态
- 只有当接收端的某个 NIC 完全空闲时，才会把流量调度过去
- 如果接收端 GPU 正在进行内部的 Tensor Parallel 通信，对应的 NIC 会被标记为"忙"
- 中继 GPU 上的内存预留是预分配的，不会影响对端 GPU 的运行

**挑战 3：高效的调度决策**

什么时候该用直接 NIC？什么时候该借用别的 NIC？

**FuseLink 的解法：Credit 机制**

RDMA 发送前需要 receiver 先发"信用"（credit），credit 里包含了 receiver 端哪些 NIC 是空闲的信息。sender 拿到 credit 后，结合自身 NIC 的负载情况，做出最优调度决策。

```python
# 概念性代码：Credit 驱动的调度
class FuseLinkScheduler:
    def __init__(self, local_gpus, local_nics):
        self.nic_load = {i: 0.0 for i in range(len(local_nics))}  # NIC 负载监控
        self.nic_busy = {i: False for i in range(len(local_nics))}  # NIC 忙闲标记

    def on_credit_arrival(self, credit):
        """收到接收端的 credit，决定用哪个 NIC 发送"""
        available_nics = credit.idle_nics  # 接收端空闲的 NIC 列表

        # 从可用 NIC 中选择负载最轻的
        best_nic = min(available_nics, key=lambda i: self.nic_load[i])

        # 检查该 NIC 是否"间接连接"到发送方 GPU
        if nic_is_indirect(best_nic, self.sender_gpu):
            # 需要中继转发
            relay_gpu = self.get_relay_gpu(best_nic)
            self.schedule_relay(self.sender_gpu, relay_gpu, best_nic)
        else:
            # 直接发送
            self.post_direct(self.sender_gpu, best_nic)

        # 更新本地 NIC 负载
        self.nic_load[best_nic] += credit.data_size

    def post_direct(self, gpu, nic):
        """通过直连 NIC 发送"""
        gpu.rdma_send(nic, buffer)

    def schedule_relay(self, src_gpu, relay_gpu, dst_nic):
        """通过中继 GPU 转发到间接 NIC"""
        # 触发内存重映射，数据通过 NVLink 流到 relay_gpu
        fuselink_remap(src_gpu.send_buffer, target_gpu=relay_gpu)
        # relay_gpu 的 NIC 直接 RDMA 发送
        relay_gpu.nic.rdma_post_send(src_gpu.send_buffer)
```

## 四、与现有方案的对比

| 方面 | 传统 NCCL（静态绑定） | FuseLink |
|------|---------------------|----------|
| GPU-NIC 关系 | 一对一，写死 | 动态调度，灵活借用 |
| 内存拷贝 | 无（直接 RDMA） | 零额外拷贝（重映射） |
| CPU 介入 | 仅 RDMA 调度 | 不参与数据转发 |
| 设备同步 | 无需 | 无需 |
| 应用改造 | 零 | 零（集成到 NCCL） |

**关键优势**：FuseLink 集成到 NCCL 中，现有的 ML 框架（PyTorch DDP、Megatron-LM 等）不需要改一行代码就能受益。

## 五、性能成果

FuseLink 在 8×Hopper GPU + 8×400Gbps NIC 的服务器上测试：

| 指标 | 结果 |
|------|------|
| 两节点间 GPU 最大带宽 | 212 GB/s（基线 NCCL 的 4.31 倍） |
| LLM 首 token 延迟降低 | 1.04-2.73× |
| MoE 训练吞吐提升 | 最高 1.3× |
| DLRM 训练加速 | 最高 1.2× |

表格里还展示了一个有趣的细节：每增加一个设计优化，性能逐步提升 —— 说明每个模块都是不可或缺的：

1. 基线（静态绑定）：49.27 GB/s
2. 加入高效转发：78.39 GB/s（1.59×）
3. 消除中断：76.37 GB/s（保证公平性，略有下降但更稳定）
4. 减少 NIC 竞争：178.59 GB/s（3.62×）
5. 高效调度：212.35 GB/s（4.31×）

## 六、总结

FuseLink 做的事情可以浓缩为一句话：**打破 GPU 和 NIC 之间的"铁饭碗"绑定，用 NVLink 做内部转运，让数据能流向最空闲的出口。**

它解决的不是一个"边角问题"，而是大模型训练中一个非常普遍的现象 —— **通信量天然不均衡**。无论是 LLM 推理、MoE 训练还是推荐模型，动态流量是常态，静态绑定注定低效。

从学习方法论的角度看，这篇论文的设计思路很有启发：

1. **从第一性原理思考**：不要接受"GPU 必须一对一绑定 NIC"这个隐含假设，先问"能不能解耦"
2. **利用已有资源**：不引入新硬件，而是把 GPU 间已有的高速 NVLink 网络"重新定义为"网络的延伸
3. **零改造集成**：所有改进都封装在 NCCL 层，上层 ML 框架无感知

这对我们理解分布式系统设计的启示是：很多时候，性能瓶颈不在"资源不够"，而在"资源没被充分利用"。把已有的资源"盘活"，往往比追加资源更有效。
