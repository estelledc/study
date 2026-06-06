---
title: NVLink 2.0 + NVSwitch — 把 16 块 GPU 拼成一台机器
来源: 'NVIDIA, "NVIDIA NVSwitch Technical Overview" + "NVLink Fabric for HPC", 2018'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**NVLink 2.0** 是 NVIDIA 2017 年随 [[volta-architecture-2017]] 推出的第二代 GPU 间高速互连，每条链路 50 GB/s 双向，每块 V100 配 6 条共 **300 GB/s**。**NVSwitch** 是 2018 年配套发布的 18 端口全互连 crossbar 芯片，作用相当于"NVLink 的交换机"。两者合体出的代表产品是 **DGX-2**——人类第一台 **16 块 GPU 任意两两 50 GB/s 直连**的整机服务器。

日常类比：之前 8 卡 [[pascal-architecture-2016]] DGX-1 像**8 个工位用环形铁路连**，从 1 号到 5 号要绕路；DGX-2 像**直接修了一座立交桥**，任何两个工位之间都是直达高速、跳数为 1。再加 [[volta-architecture-2017]] 的 Tensor Core，整机就是 **2 PFLOPS 的 AI 单元 + 512 GB HBM2 的统一内存池**。

落到芯片：**NVSwitch = TSMC 12nm FFN、2 亿晶体管、18 端口 × 50 GB/s 双向、单芯片 928 GB/s 交换带宽、约 300 ns 端到端延迟**。DGX-2 用 **12 颗 NVSwitch 两层 6+6 拓扑**把 16 张 V100 32GB 全连。整机售价 **39.9 万美元**（2018-03 上市），10 kW TDP。

## 为什么重要

不理解 NVLink 2.0 + NVSwitch，下面这些事都没法解释：

- 为什么 **Megatron-LM（2019）能在 DGX-2 上做 tensor parallelism** 训 8.3B 参数——切矩阵乘到 16 卡需要每层 attention/MLP 后做高频 all-reduce，没 NVSwitch 全互连就是带宽地狱
- 为什么 **DGX-1 → DGX-2 不只是卡数翻倍**——DGX-1 hybrid cube mesh 让远端两卡走 2-3 跳；DGX-2 任意两卡 1 跳满速，all-reduce 接近线性扩展
- 为什么 **后续 DGX A100 / H100 / B200 全保留 NVSwitch**——从 2018 起 NVIDIA 把 "GPU 集群机柜化" 当默认形态
- 为什么 **InfiniBand 厂商紧张了**——NVSwitch 在机内做到 IB 跨机的延迟（<300 ns）和 10 倍带宽，把 GPU 间通信从 "网络问题" 拉回 "总线问题"
- 为什么 **NVLink 5.0 / NVL72 能 72 GPU 全互连**——血缘上是把 DGX-2 的 NVSwitch 套路放大到机柜级，外置交换机替代板载

## 核心要点

NVLink 2.0 + NVSwitch 体系做了 **三件事**：

1. **NVLink 2.0 升带宽**：每链路从 NVLink 1.0 的 40 GB/s 升到 50 GB/s，每卡链路数从 4 扩到 6，**单卡 300 GB/s 双向**。对比：PCIe 3.0 x16 仅 32 GB/s，NVLink 2 单条就比 PCIe 全 x16 还快。新增 **缓存一致性**——配 IBM Power9 时 CPU 和 GPU 共享内存视图（Summit 超算用此特性）。

2. **NVSwitch = GPU 间的交换机**：crossbar 架构，18 端口，每端口 50 GB/s 双向。意义：从 P2P mesh（卡之间直接连）升级到 **switched fabric**（卡都接到 switch，由 switch 转发）。任意两端口之间 **1 跳满速**，扩展 16 卡不再受拓扑限制。

3. **DGX-2 全互连整机**：16× V100 32GB + 12× NVSwitch 两层。每张 GPU 6 条 NVLink 散到多颗 switch，任意配对都能找到 50 GB/s 直达路径。**512 GB HBM2 总显存 + 2 PFLOPS Tensor Core**——第一台单机能装下 GPT-2 (1.5B) 训练状态的整机。

### 这三件事怎么互为支柱

- 没 **NVLink 2 升带宽**，单卡 300 GB/s 撑不起 Tensor Core 的胃口
- 没 **NVSwitch**，16 卡 mesh 拓扑里远端两卡要绕 3 跳，带宽折半延迟翻倍
- 没 **DGX-2 整机**，软件栈（NCCL / cuBLASLt / Megatron-LM）没标准目标平台测试

## 实践案例

### 案例 1：DGX-1 hybrid cube mesh vs DGX-2 全互连

```
DGX-1 (8× P100 / V100): 每卡 4 条 NVLink，hybrid cube mesh 拓扑
- GPU0 ↔ GPU1: 1 跳，40-50 GB/s
- GPU0 ↔ GPU5: 2 跳，绕路，有效带宽减半
- 8 卡 all-reduce: ring 走两圈，远端瓶颈

DGX-2 (16× V100): NVSwitch 全互连
- 任意两卡: 1 跳，50 GB/s 满速
- 16 卡 all-reduce: 接近线性，远端=近端
```

意义：**16 卡 all-reduce 在 DGX-2 上比 DGX-1 单纯翻倍快得多**——2 倍卡 + 拓扑改进 ≈ 3-4× 端到端训练加速。

### 案例 2：Megatron-LM tensor parallelism 依赖 NVSwitch

```python
# Megatron-LM (2019) 把每层 attention 矩阵 W 切到 N 卡
# 每个 forward / backward 都要做 all-reduce 同步
# DGX-2 上 N=16 时延迟稳定，因为任意两卡满速直连
# 自建 8 卡 V100 server 走 hybrid cube mesh 时
# tensor parallelism 在 N=8 之后就失速
```

意义：**模型并行（切层内权重到多卡）对带宽极敏感**——NVSwitch 是 tensor parallelism 在 16 卡级别能跑的硬件前提。

### 案例 3：NVSwitch 内部端口分配

```
DGX-2 fabric: 12 NVSwitch 排成两层 6+6
每张 V100 6 条 NVLink → 散到 6 颗第一层 switch
每颗第一层 switch ↔ 每颗第二层 switch 各一条
任意 GPU pair 路径: GPU_A → L1 switch → L2 switch → L1 switch → GPU_B (1 跳逻辑等效)
```

意义：**用 12 颗 switch 实现 16 端点 full bisection bandwidth**——不是简单 16×16 crossbar（成本爆炸），而是 fat-tree 思路的 GPU 版本。

### 案例 4：Summit 超算 NVLink 2 + Power9 缓存一致

```
Summit (ORNL, 2018-06): 27648× V100 + 9216× Power9
单节点: 6× V100 + 2× Power9 全 NVLink 2 互连
特性: CPU-GPU 缓存一致，GPU 可直接访问 CPU DDR4 而不用 explicit cudaMemcpy
应用: 气候模拟、基因组装、量子化学，CPU/GPU 数据来回搬动消失
```

意义：**第一次把 'GPU 是协处理器' 改成 'CPU/GPU 平等访问统一内存'**——这是 [[unified-memory]] 的硬件支柱（仅 Power9 平台）。

## 踩过的坑

1. **PCIe V100 没 6 条 NVLink**：买 PCIe 形态以为也有 NVSwitch 福利 → PCIe 仅 2 条 NVLink，且需主板支持 SXM3 插槽才能上 DGX-2 fabric。**只有 SXM3 形态 + DGX-2 整机 = NVSwitch**。

2. **NVSwitch 是 OEM 整机专属**：自己买 16 张 V100 + 12 张 NVSwitch 卡装服务器是不可能的——NVSwitch 没零售，只随 DGX-2 / HGX-2 出货。想要 NVSwitch 必须买整机。

3. **NCCL 旧版不识别 NVSwitch**：早于 2.4 的 NCCL 把 DGX-2 当 16 卡普通 mesh 跑，all-reduce 仍走 ring。**升级到 NCCL 2.4+ 才能用 tree all-reduce + NVSwitch 拓扑**——升级前后训练速度差 30-50%。

4. **Cache coherence 仅 Power9 完整支持**：Intel Xeon + V100 时只有 GPU↔GPU 一致，CPU↔GPU 仍要 cudaMemcpy。Summit 之外的大部分 DGX-2 用 Xeon，享受不到完整一致性。

5. **每 GPU 6 链路散到多颗 switch**：规划带宽时不能算 "聚合 928 GB/s × 12 = 11 TB/s"，要看 **per-pair 50 GB/s**——一对 GPU 在通信时仍只用一条链路宽度。

6. **跨节点没救**：NVLink 在 V100 时代仅机内有效，跨 DGX-2 节点仍走 InfiniBand 100/200 Gb/s（约 25 GB/s），和机内 50 GB/s 差 2×——大模型超过单机要做 hierarchical all-reduce。

## 适用 vs 不适用场景

**适用**：

- 16 卡级别大模型训练 —— GPT-2 / Megatron-LM 8.3B / T5 11B 主力台
- tensor parallelism / model parallelism —— 切层内权重到多卡，需高频 all-reduce
- HPC 紧耦合科学计算 —— Summit 上 CFD / 分子动力学 / 基因组
- 整柜级 AI 工厂思路的起点 —— 后续 DGX A100 / H100 / B200 / NVL72 都是这个套路

**不适用**：

- 1-4 卡小规模训练 —— NVSwitch 过剩浪费成本
- 推理负载 —— 带宽用不上，单卡或 PCIe 形态足够
- 跨节点扩展 —— V100 时代 NVLink 不出机柜，跨机仍 InfiniBand
- 自建集群预算敏感 —— DGX-2 整机 39.9 万美元，自组 8 卡 V100 + IB 总价 1/3
- Intel Xeon + 完整 CPU-GPU 一致内存 —— 仅 Power9 平台支持

## 历史小故事（可跳过）

- **2014**：NVLink 1.0 概念发布，IBM Power8 + 早期工程样片验证
- **2016-04**：Pascal P100 + NVLink 1.0 量产，DGX-1 8 卡 hybrid cube mesh 整机
- **2017-05**：Volta V100 + NVLink 2.0，每卡 6 链路 300 GB/s
- **2018-03 GTC**：黄仁勋发布 DGX-2 + NVSwitch，"world is largest GPU"，16 卡 2 PFLOPS
- **2018-06**：Summit 超算上线（ORNL），27648× V100 用 NVLink 2 + Power9 缓存一致
- **2018-10**：BERT 论文，DGX-2 成 NLP 训练标配整机之一
- **2019**：Megatron-LM 论文，tensor parallelism 真正吃满 NVSwitch 带宽
- **2020-05**：A100 + NVLink 3.0（600 GB/s）+ 第二代 NVSwitch，DGX A100 8 卡保留 fabric
- **2022-03**：H100 + NVLink 4.0（900 GB/s）+ 第三代 NVSwitch + 外置 NVLink Switch System，256 GPU 跨机柜全互连
- **2024-03**：Blackwell B200 + NVLink 5.0 + NVL72 机柜 72 GPU 全互连，DGX-2 套路放大 4.5×

## 学到什么

1. **拓扑比带宽更重要**：DGX-1 → DGX-2 单链路带宽只升 25%，但拓扑从 mesh 改 switched fabric 让 16 卡训练吞吐 3-4 倍——**互连工程的隐形支柱是拓扑而非纯带宽**
2. **GPU 集群机柜化的起点**：NVSwitch 把 "8 卡 mesh" 推到 "16 卡 fabric"，奠定后续整柜 / 整机房 GPU 全互连的工程范式
3. **机内带宽 vs 跨机带宽的鸿沟**：NVLink 2 机内 50 GB/s vs IB 跨机 25 GB/s = 2×，到 NVLink 5 + NVL72 时代差距拉到 10×——**让 "尽量塞进一台机器" 的模型设计成为常态**
4. **专用硬件的复用收益**：NVSwitch 这颗 2018 设计的芯片骨架，到 2022 H100 / 2024 B200 仍在迭代，证明 "为单一互连场景造专用硅" 的回报周期长
5. **整机售价的另一面**：39.9 万美元贵，但单位算力 / 单位带宽 / 单位训练时间反而便宜——**整机思维让 TCO 计算逻辑变了**

## 延伸阅读

- 白皮书：[NVIDIA NVSwitch Technical Overview](https://images.nvidia.com/content/pdf/nvswitch-technical-overview.pdf)（2018，10 页）
- DGX-2 详解：[NVIDIA DGX-2 — The World is Most Powerful AI System](https://www.nvidia.com/en-us/data-center/dgx-2/)
- 学术分析：[Li et al., "Evaluating Modern GPU Interconnect: PCIe, NVLink, NV-SLI, NVSwitch and GPUDirect", IEEE TPDS 2019]
- [[volta-architecture-2017]] —— V100 = NVLink 2 来源 GPU
- [[pascal-architecture-2016]] —— NVLink 1.0 + DGX-1 前身
- [[ampere-architecture-2020]] —— A100 + 第二代 NVSwitch
- [[hopper-architecture-2022]] —— H100 + 外置 NVSwitch / NVL72 雏形

## 关联

- [[volta-architecture-2017]] —— V100 = NVLink 2 + Tensor Core 同代发布
- [[pascal-architecture-2016]] —— NVLink 1.0 / DGX-1 8 卡 hybrid cube mesh 前身
- [[ampere-architecture-2020]] —— A100 + NVLink 3 + 第二代 NVSwitch
- [[hopper-architecture-2022]] —— H100 + NVLink 4 + 外置 Switch System，把 NVSwitch 套路放大到 256 卡
- [[cuda]] —— CUDA Runtime peer access / cudaMemcpyPeer 在 NVSwitch 上 1 跳满速
- [[alpa-2022]] —— tensor + pipeline parallelism 自动搜索，依赖 NVSwitch 全互连拓扑
