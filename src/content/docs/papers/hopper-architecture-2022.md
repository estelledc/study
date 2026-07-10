---
title: NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制
来源: 'NVIDIA, "NVIDIA H100 Tensor Core GPU Architecture", Whitepaper v1.0, 2022'
日期: 2026-05-30
分类: 系统
难度: 中级
---

## 是什么

Hopper 是 NVIDIA 2022 年发布的第九代 GPU 架构，旗舰是 **GH100（H100）**——一颗**为大语言模型训练 / 推理量身定制**的硅片，名字致敬计算机先驱 Grace Hopper。它在一代之内做了**五件改写假设**的事：**① 第四代 Tensor Core + FP8；② Transformer Engine；③ TMA（Tensor Memory Accelerator）；④ Thread Block Cluster；⑤ DPX + NVLink 4.0 / Switch**——最直接的后果是 **2023+ 的 GPT-4 级训练与主流 LLM 推理集群，事实主力变成 H100**（ChatGPT 初代训练仍以 A100 为主，见后文时间线）。

日常类比：[[ampere-architecture-2020]] 给 Tensor Core 加四种乐高规格（TF32/BF16/FP64/稀疏），让"训练 / 推理 / 多租户切片"在 A100 上同时成立。**Hopper 是把这台机器再升级——不仅加 FP8 第五种规格，还专门派了一个"自动选规格的小助理"（Transformer Engine）+ 一台"专搬乐高的传送带"（TMA）+ 让多台机器组队的"工头"（Thread Block Cluster）**。Ampere 让 LLM 时代成立，Hopper 让 LLM 时代**在算力与显存带宽上再翻一代**。

落到硅片：**GH100 = 800 亿晶体管、TSMC 4N（定制 4nm）、814 mm²、132 SM × 128 FP32 = 16896 FP32 核 + 528 第四代 Tensor Core、80 GB HBM3、显存带宽 3.35 TB/s（PCIe 版 HBM2e 2 TB/s）、NVLink 4.0 900 GB/s、PCIe Gen5、SXM5 700 W / PCIe 350 W**。代表卡：**H100 SXM5 80GB（DGX H100 标配）、H100 PCIe、H200（141 GB HBM3e 升级版）、Grace Hopper GH200（CPU+GPU 一颗封装）**，**Compute Capability sm_90 / sm_90a**。

## 为什么重要

不理解 Hopper，下面这些事都没法解释：

- 为什么 **2023+ 大模型训练默认用 H100**——FP8 + Transformer Engine + 900 GB/s NVLink 让 GPT-4 级模型可训
- 为什么 **PyTorch / Megatron / DeepSpeed 在 H100 上自动开 FP8**——Transformer Engine 替你做 per-tensor scaling
- 为什么 **FlashAttention-3 比 FA-2 再快 2×**——TMA + Thread Block Cluster 让跨 SM 协作不再走 L2
- 为什么 **256 卡 NVLink Switch System 出现**——万亿参数训练通信带宽必须再翻一倍
- 为什么 **生信 / 路径规划库（cuOpt / Parabricks）在 H100 ×7**——DPX 指令第一次给动态规划专用硬件

## 核心要点

Hopper 在 [[ampere-architecture-2020]] 之上做了 **五件事**：

1. **第四代 Tensor Core + FP8**：在 V100 第一代 FP16、Turing 第二代 INT8/INT4、Ampere 第三代 TF32/BF16/FP64 之上，**新增 FP8 两种格式**——**E4M3（4-bit 指数 + 3-bit 尾数，精度优先）+ E5M2（5-bit 指数 + 2-bit 尾数，范围优先）**。算力：**FP8 sparse 3958 TFLOPS = A100 BF16（624 sparse） × 6.3**；FP16 / BF16 sparse 1979 TFLOPS = A100 ×3.2；TF32 sparse 989；FP64 Tensor Core 67 TFLOPS = A100 ×3。

2. **Transformer Engine（软硬件协同）**：硬件 FP8 单元 + 软件库自动判断每层 / 每张张量该用 E4M3 还是 E5M2，**动态维护 per-tensor scale 与历史最大值**，做即时 loss scaling。意义：**FP8 训练首次"用户代码不变"也能不掉精度**——把 FP16 时代手动调 loss scale 的活全自动化，是 H100 最像"专为 LLM 设计"的特征。

3. **TMA（Tensor Memory Accelerator）**：一个**专门搬张量的硬件单元**，给它一个 5D 张量描述符（基址 + 维度 + 步长），它就能**异步把全局显存 → shared memory 整块拷过来**，不占线程、不走寄存器。意义：在 [[ampere-architecture-2020]] `cp.async`（指令级）基础上**升级到描述符级**——大 matmul / attention 内核首次能把"地址生成"从线程里彻底卸载，FlashAttention-3 在 H100 提速主要靠它。

4. **Thread Block Cluster + Distributed Shared Memory**：CUDA 编程模型新增一层——**几个 thread block 可以组成一个 cluster（最多 16 个，必须在同 GPC 内）**，cluster 内 block 之间**直接读写彼此的 shared memory**（不走 L2 / 不走全局显存）。意义：**SM 间协作首次成为一等公民**——以前 block 间只能通过全局显存，现在像 warp 间一样直接共享，FlashAttention-3 / 大 GEMM 切块可跨 SM 流水。

5. **DPX 指令 + NVLink 4.0 + NVLink Switch**（第五件打包互联与专用加速）：DPX = Dynamic Programming X 的专用 SIMD（min/max + add 融合），生信 Smith-Waterman、路径规划 Floyd-Warshall 直接 ×7；NVLink 4.0 **18 链 × 50 GB/s = 900 GB/s**（A100 是 600 GB/s）；**NVLink Switch System 把 256 张 H100 全互联**——单机柜级 LLM 训练通信瓶颈再后推一代。

### 这五件事怎么互为支柱

- 没 **① FP8**，GPT-4 级稠密模型训练显存与算力都撑不住
- 没 **② Transformer Engine**，FP8 = 工程坑，没人敢直接上
- 没 **③ TMA**，FP8 算力翻倍但喂数据跟不上，仍卡寄存器
- 没 **④ Thread Block Cluster**，FlashAttention-3 跨 SM 切块只能走 L2
- 没 **⑤ NVLink 4.0 + Switch（及 DPX）**，万亿参数 256 卡互联通信再次成瓶颈；生信/路径规划也吃不到专用指令

## 实践案例

### 案例 1：Transformer Engine 让 PyTorch FP8 训练免改代码

```python
import transformer_engine.pytorch as te
import torch
# 用 te.Linear 替换 nn.Linear, 自动 FP8 GEMM + 动态 scale
model = torch.nn.Sequential(
    te.Linear(4096, 4096),  # FP8 权重 + FP8 GEMM, BF16 累加
    te.LayerNorm(4096),
    te.Linear(4096, 4096),
)
with te.fp8_autocast():       # 自动 E4M3 forward / E5M2 backward
    y = model(x)              # H100 上 ~3.2 TFLOPS / 卡, 比 BF16 ×2
# A100 上无此 API; Hopper sm_90+ 才有 FP8 Tensor Core
```

意义：**老代码 + 新硬件 = 自动加速** —— 这是 [[ampere-architecture-2020]] TF32 模板的延续，但 FP8 难度大得多，靠 Transformer Engine 替开发者扛住数值稳定性。

### 案例 2：TMA 让大 matmul 内核绕开寄存器

```cpp
// CUDA 12, sm_90+, 5D tensor map descriptor
CUtensorMap map;
cuTensorMapEncodeTiled(&map, ..., /*global ptr*/g, /*shape*/{M, K},
                       /*stride*/..., /*box*/{128, 64}, ...);
// 异步从全局 -> shared, 不占线程, 不走寄存器
__shared__ alignas(128) half smem[128][64];
cuda::barrier<...> bar;
cuda::memcpy_async(smem, &map, {bx*128, by*64}, bar);  // TMA 触发
bar.arrive_and_wait();
// 同时 Tensor Core 跑上一块, 实现 compute / load 完全重叠
```

意义：FlashAttention-3 的核心提速点——把 Q/K/V 切块加载完全交给 TMA，warp 全力做 matmul + softmax，**显存墙再被推开一层**。

### 案例 3：Thread Block Cluster 跨 SM 直接共享 shared memory

```cpp
__global__ void __cluster_dims__(2, 2, 1) kernel(...) {
    auto cluster = cooperative_groups::this_cluster();
    __shared__ float smem[1024];
    // 读邻居 block 的 shared memory, 不走 L2 / 不走 HBM
    float *neighbor_smem = cluster.map_shared_rank(smem, /*rank=*/3);
    float v = neighbor_smem[threadIdx.x];   // distributed shared memory
    cluster.sync();
}
```

意义：**block 间通信第一次像 warp 间一样轻量**——大 GEMM 切块 / FA-3 / SpMM 全可跨 SM 流水，不必再凑大 block 占满 SM。

### 案例 4：H100 vs A100 同代对比

```
A100 SXM4 80GB:   80GB HBM2e  2039 GB/s, 312 BF16 Tensor TFLOPS, 0   FP8, NVLink 600 GB/s
H100 SXM5 80GB:   80GB HBM3   3350 GB/s, 989 BF16 dense / 1979 sparse, 3958 FP8 sparse, NVLink 900 GB/s, +TMA +Cluster
GPT-3 175B 训练:    A100 1024 卡 ~34 天;   H100 ~512 卡 ~14 天 (FP8 + TE)
GPT-4 / Claude:     训练事实集群规模数千 H100, 通信走 NVLink Switch System
```

意义：**A100 → H100 的代差不在 FP32（A100 19.5 vs H100 67 标量 TFLOPS）**，而在 Tensor Core 加 FP8 + Transformer Engine + TMA + Cluster + NVLink ×1.5——**LLM 训练再次提速一代**。

## 踩过的坑

1. **FP8 不是简单 cast**：直接 `tensor.to(torch.float8_e4m3fn)` 训练几乎必发散；必须经 Transformer Engine `te.Linear` + `fp8_autocast`，由库维护 amax 历史 + per-tensor scale。

2. **TMA 仅 sm_90+**：CUDA 12 起 `cuTensorMapEncodeTiled` + `cuda::memcpy_async` 才合法；旧 CUDA 11 / sm_80 编译会跳过 TMA fallback 到 `cp.async`，性能 ×0.5。

3. **Thread Block Cluster 受 GPC 限制**：cluster 最多 16 个 block，且**必须落在同 GPC 内**；编译器无法跨 GPC 调度，否则启动失败。需 `__cluster_dims__` 显式标注。

4. **DPX 指令面窄**：主要给生信 / 路径规划 / 编辑距离，普通 ML 用不上。`__viaddmin_s16x2_relu` 这类内建函数只对 int8/int16 SIMD 有效，写 LLM 用不到。

5. **PCIe / NVL 的 NVLink 砍半且只连成对**：H100 PCIe 需外接 NVLink bridge（H100 NVL）才有 **600 GB/s**，且通常只连 **一对 GPU**；SXM5 才是 **900 GB/s** 经 NVSwitch 全互联。多卡训练买普通 PCIe 版会撞通信墙——DGX H100 / HGX H100 都是 SXM5。

6. **NVLink Switch System ≠ DGX H100**：单 DGX H100 仍是 **8 卡 SXM5 内部 NVSwitch**；**256 卡 NVLink Switch System** 是机柜级（NVL32 + 外部 NVLink Switch），售价数千万美元，和 DGX 不要搞混。

## 适用 vs 不适用场景

**适用**：

- 大语言模型训练 —— GPT-4 / Claude / LLaMA-2 70B / 405B / Mixtral 都在 H100
- 大语言模型推理 —— FP8 + TMA 让 70B 模型单卡 H100 80GB 跑得动
- HPC FP64 —— FP64 Tensor 67 TFLOPS = A100 ×3，分子动力学 / 量子化学
- 生信 / 路径规划 —— DPX 指令让 Smith-Waterman / Floyd-Warshall ×7
- FlashAttention-3 —— TMA + Thread Block Cluster 是其前提

**不适用**：

- FP4 / 微缩浮点 —— Blackwell B100/B200 起才有，H100 仅到 FP8
- 万亿参数稠密推理单卡 —— 80 GB 不够，需 H200（141 GB）或 GH200
- 消费图形 / 光追 —— H100 无 RT Core 强化，消费 RTX 4090（Ada）才合适
- 经济型推理 —— L4 / L40S（Ada）能效比 H100 推理更高、单价低
- MIG 极致切片 —— H100 沿用 MIG 切 7 份，但单切片 FP8 算力浪费

## 历史小故事（可跳过）

- **2022-03 GTC**：黄仁勋发布 Hopper H100 + Grace CPU，公布 Transformer Engine 概念
- **2022-09 H100 量产出货**：DGX H100、HGX H100 上市
- **2022-11 ChatGPT 发布**：背后训练集群仍以 A100 为主，但推理迅速迁移到 H100
- **2023-03 GPT-4 发布**：公开披露有限，但业界普遍认为训练/扩容阶段已大量采用 H100（相对 ChatGPT 初代的 A100 集群）
- **2023-05 GH200 Grace Hopper 量产**：CPU+GPU 共封装，HBM3e 141 GB
- **2023-08 NVIDIA H200 公布**：HBM3e 141 GB / 4.8 TB/s，pin 兼容 H100
- **2024-03 Blackwell B100/B200 发布**：第五代 Tensor Core + FP4 + 第二代 Transformer Engine，Hopper 让位但产能延续到 2025+

## 学到什么

1. **专用化深化到"软硬件协同"**：[[volta-architecture-2017]] 加 Tensor Core、[[turing-architecture-2018]] 加 RT Core、[[ampere-architecture-2020]] 加四种规格 + 稀疏；**Hopper 第一次把"自动选规格"做成软件库（Transformer Engine）**——硬件单元 + 库 = 一起卖
2. **数据搬运与计算解耦**：从 [[fermi-architecture-2010]] L1/L2 cache 起 → [[pascal-architecture-2016]] HBM2 → [[ampere-architecture-2020]] `cp.async` → Hopper TMA 描述符化，**显存→shared 这条路一代比一代脱离线程**
3. **CUDA 编程模型加新层**：thread → warp → block → **cluster** → grid，硬件层次第一次让 SM 间协作显式，[[tesla-architecture-2008]] SIMT 模型 14 年来首次扩展
4. **架构永远超前 18-24 个月**：H100 设计于 2018-2020，FP8 + Transformer Engine 押注的是"还没出现的 GPT-4 / Claude"——结果赌中
5. **算力再翻倍 ≠ 自动用上**：FP8 3958 TFLOPS 听上去诱人，但**只有走 Transformer Engine 的 LLM 真正吃到**，老 CV / RL 代码完全用不上——专用化的副作用

## 延伸阅读

- 白皮书：[NVIDIA H100 Tensor Core GPU Architecture](https://resources.nvidia.com/en-us-tensor-core/gtc22-whitepaper-hopper)（71 页，2022）
- Transformer Engine 详解：[H100 Transformer Engine](https://developer.nvidia.com/blog/h100-transformer-engine/)（NVIDIA Blog 2022-03）
- TMA / Cluster 编程指南：[CUDA 12 Programming Guide — Hopper](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#thread-block-clusters)
- FlashAttention-3 论文（H100 专版）：[FlashAttention-3](https://arxiv.org/abs/2407.08608)
- [[ampere-architecture-2020]] —— 直接前代，A100 = LLM 时代起点，H100 = LLM 时代加速器
- [[turing-architecture-2018]] —— 第二代 Tensor Core + RT Core 起点
- [[volta-architecture-2017]] —— Tensor Core 第一代发源地
- [[pascal-architecture-2016]] —— HBM2 + NVLink 第一代鼻祖
- [[maxwell-architecture-2014]] —— SMM 4 分区骨架延续
- [[kepler-architecture-2012]] —— SMX 大分区组织
- [[fermi-architecture-2010]] —— ECC + L1/L2 cache 起点
- [[tesla-architecture-2008]] —— SIMT + warp = 32 鼻祖

## 关联

- [[tesla-architecture-2008]] —— SIMT 鼻祖，Hopper 沿用 warp = 32
- [[fermi-architecture-2010]] —— L1/L2 cache 在 Hopper 全面继承并加大
- [[kepler-architecture-2012]] —— SMX 4 分区延续到 Hopper SM
- [[maxwell-architecture-2014]] —— SMM 4 分区骨架仍是 Hopper SM 蓝本
- [[pascal-architecture-2016]] —— HBM2 + NVLink 1.0 起点，Hopper 升 HBM3 + NVLink 4.0
- [[volta-architecture-2017]] —— Tensor Core 第一代，Hopper 第四代加 FP8 + Transformer Engine
- [[turing-architecture-2018]] —— 第二代 Tensor Core 加 INT8/INT4
- [[ampere-architecture-2020]] —— 第三代加 TF32/BF16/FP64 + 稀疏，Hopper 第四代再加 FP8 + TMA + Cluster
- [[attention]] —— Transformer 架构是 Hopper 全套设计的应用对象
- [[chinchilla]] —— 大模型 scaling law 的硬件底座 A100 → H100
- [[cuda]] —— Compute Capability 9.0 = Hopper，CUDA 12 起支持 FP8 / TMA / Cluster
