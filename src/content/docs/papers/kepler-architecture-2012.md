---
title: NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型
来源: 'NVIDIA, "Kepler GK110/GK210 Architecture Whitepaper", 2012'
日期: 2026-05-30
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Kepler 是 NVIDIA 2012 年发布的第三代通用 GPU 架构（前代见 [[fermi-architecture-2010]]），代表芯片是 **GK110**。它干了三件听起来很工程但深远的事：**SMX 把每个流式多处理器从 32 核扩到 192 核**、**Hyper-Q 让 32 个进程同时往一块 GPU 喂活**、**Dynamic Parallelism 让 kernel 自己再启子 kernel 不再回 CPU**。

日常类比：Fermi 是一座 16 个工坊、每坊 32 工人的工厂，订单全从大门一个收件台进。Kepler 把每坊扩成 192 人、收件台开到 32 个、工人之间还能自己派活——产能 6 倍、调度并行 32 倍、内部循环不用再跑出门请示老板。

落到硅片：**15 个 SMX × 每 SMX 192 CUDA cores = 2880 核心**（Fermi 是 512）；**L2 升到 1.5 MB**（Fermi 768KB）；**FP64 在 K20/K40 是 FP32 的 1/3**；**28nm 工艺、71 亿晶体管、551 mm² 巨芯**。代表卡：**K20 / K20X / K40 / K80**——其中 **K80 是 2014-2017 年深度学习训练的默认机型**。

## 为什么重要

不理解 Kepler，下面这些事都没法解释：

- 为什么 2012 年 **Titan**（橡树岭）用 18688 块 K20X 拿下 Top500 第一——继天河一号后 GPU 第二次登顶
- 为什么 **AlexNet 之后** 2013-2017 年绝大多数 DL 论文跑在 K20/K40/K80 上——它是 [[pytorch]] 0.x、TensorFlow 1.x 时代的"默认机型"
- 为什么 **AWS p2 实例、GCE 早期 GPU 实例**第一代都是 K80——大多数 ML 研究员第一次摸到的云 GPU
- 为什么现代 [[cuda]] 的 `__shfl` warp shuffle、CUDA Graphs 雏形、MPS 多进程共享 GPU 都源自 Kepler

## 核心要点

Kepler 在 Fermi 之上的关键升级可以拆成 **四件事**：

1. **SMX 胖核**：Fermi SM = 32 CUDA cores + 1 调度器；Kepler SMX = **192 cores + 4 调度器 + 8 dispatch units**。意义：单 SM 算力 6 倍，但**不靠提频**——靠并行更多 warp、靠工艺降耗（28nm）。这是"宽而慢"取代"窄而快"的开端。

2. **Hyper-Q**：Fermi 只有 **1 个硬件工作队列**，多个 stream 在硬件层仍串行；Kepler 给到 **32 个**。意义：MPI 集群 / 多租户云上多个进程同时投活——之前必须独占 GPU 才能跑满，之后**32 个 CPU 进程能共享一块 K20**。云厂商的多租 GPU 调度第一次有底层支持。

3. **Dynamic Parallelism**：Fermi kernel 想再启 kernel 必须**回 CPU 派活**（毫秒级延迟）；Kepler kernel 可以**自己直接 launch 子 kernel**。意义：自适应网格细化、递归算法、不规则图算法——之前必须 CPU 控流的代码现在 GPU 自闭环。这是**今天 CUDA Graphs 的史前形态**。

4. **Warp Shuffle (`__shfl`)**：warp 内 32 个线程之间**寄存器互换不走 shared memory**。意义：归约（sum / max）从"shared memory 多步" 变成 "1 条指令"——cuBLAS/cuDNN 的归约内核全靠这条，[[pytorch]] 的 `tensor.sum()` 底层就是它。

### 这四件事怎么互为支柱

- 没 **SMX**，单 SM 算力跟不上 28nm 给的晶体管预算——硅片浪费
- 没 **Hyper-Q**，云厂商不敢多租——一块 GPU 只能卖给一家，规模化推不动
- 没 **Dynamic Parallelism**，递归/自适应代码仍卡在 CPU-GPU 来回——HPC 老代码移植到尽头
- 没 **Shuffle**，归约/扫描成性能瓶颈——深度学习里随处可见的 `softmax/layernorm` 慢一截

## 实践案例

### 案例 1：K80 + AlexNet 复现

```python
# AWS p2.xlarge = 1 块 K80 的一半（K80 实际是双 GPU）
import torch
device = torch.device('cuda:0')
model = AlexNet().to(device)   # 60M 参数，FP32
# 单 K80 半芯训练 ImageNet 1 epoch ≈ 30-40 分钟
```

2014-2017 年标准配置。AlexNet 原版用两块 GTX 580（Fermi），K80 出来后变 **2-3 倍速**，且**单卡显存 12GB** 装得下当时所有主流模型——这是 PyTorch / TF 时代研究员的入门门票。

### 案例 2：Hyper-Q 让多进程共享 GPU

```bash
# 启用 MPS（Multi-Process Service）
nvidia-cuda-mps-control -d
# 同时跑 4 个推理进程，共享一块 K40
CUDA_VISIBLE_DEVICES=0 python infer1.py &
CUDA_VISIBLE_DEVICES=0 python infer2.py &
```

Fermi 上这样会**串行**（GPU 只有 1 个工作队列），4 进程总耗时几乎等于 4×单进程。Kepler + MPS 上**4 进程并行**，吞吐接近 4×。这是云 GPU 多租调度的硬件前提。

### 案例 3：Warp Shuffle 写归约

```cuda
__inline__ __device__ float warpSum(float v) {
    for (int o = 16; o > 0; o /= 2)
        v += __shfl_xor_sync(0xffffffff, v, o);
    return v;   // warp 内 32 线程都拿到 sum
}
```

Fermi 上同样的归约要走 shared memory + `__syncthreads()`，**5-6 步、20+ 周期**；Kepler 上 5 条 shfl 指令、**约 5 周期**。`softmax / layernorm / batch reduction` 全部受益。

### 案例 4：Dynamic Parallelism 写递归

```cuda
__global__ void quad(int depth, ...) {
    if (depth >= MAX) return;
    if (need_refine()) quad<<<4,1>>>(depth+1, ...);  // 自己启子 grid
}
```

CPU 代码不参与递归——之前每层细化都要 cudaMemcpy 回主机判断条件，Kepler 上**整棵递归树都在 GPU 内自闭环**。自适应网格、八叉树、光线追踪 BVH 构建第一次能纯 GPU 跑。

## 踩过的坑

1. **GK104 不是 GK110**：GTX 680/770 是 GK104（游戏卡，FP64 砍到 **1/24**），跑科学计算别用。SXM/Tesla K20/K40 才是 GK110（FP64 = 1/3）。买错型号能慢 8 倍。

2. **K80 是双 GPU**：一张 K80 在系统里是 **2 个 device**，不是一块大 GPU。`torch.cuda.device_count()` 返回 2；想要 24GB 连续显存必须**两半之间显式 P2P 拷贝**——不少新人误以为 K80 = 24GB 单 GPU。

3. **Dynamic Parallelism 启动开销大**：子 kernel launch ~**几微秒**，子-子嵌套累积到毫秒级。**只对不规则/自适应负载有收益**，规则计算反而变慢。规则负载老老实实用 CUDA Graph（后来才有）。

4. **Hyper-Q 只对 CUDA streams 有效**：单 stream 代码即使开 MPS 也无收益。老代码必须显式 `cudaStreamCreate` 派任务到不同 stream，Hyper-Q 才能并行。

5. **FP64 从 1/2 退到 1/3**：Fermi M2090 的 FP64 是 1/2 FP32，K20 是 1/3——某些 HPC 用户从 Fermi 升 Kepler 反而慢了。NVIDIA 把 FP64 算力留给后续 GP100/Volta，**Kepler 是 FP64 的小退步**。

6. **Read-only cache 要写对修饰符**：`const float* __restrict__ ptr` 或显式 `__ldg(ptr)` 才走 48KB 只读 cache。少写一个 `__restrict__` 就掉回普通 L1，性能损失 30%+ 静默。

7. **K80 在新驱动里被淘汰**：CUDA 11+ 起 NVIDIA 正式 deprecate Kepler，CUDA 12 已不支持。**云上 K80 实例陆续下线**——老 ML 容器跑不动新框架。

## 适用 vs 不适用场景

**适用**：

- 早中期深度学习训练（2013-2017）—— 12GB 显存装下当时所有主流模型
- 多租户云 GPU —— Hyper-Q + MPS 让多进程共享一块卡
- 自适应/递归数值算法 —— Dynamic Parallelism 减少 CPU 来回
- 大规模 HPC 集群 —— Titan / Blue Waters 都是 Kepler 时代代表

**不适用**：

- 现代 LLM 训练（70B+）—— 显存太小、bf16 / TF32 都没有
- FP64 重负载 —— 1/3 速度不如同期 GP100/Volta
- 新框架推理 —— CUDA 12 已不支持，PyTorch 2.x 装不上
- 大模型微调 —— 缺 Tensor Core（Volta 才引入）、缺 NVLink（K80 之后）

## 历史小故事（可跳过）

- **2012-03**：GK104（GTX 680）发布，是 Kepler 首芯——但 FP64 砍残，HPC 不感兴趣
- **2012-11**：**GK110 K20/K20X** 出货；同月 **Titan @ ORNL** 用 18688 块 K20X 登顶 Top500
- **2013-11**：K40（满血 15 SMX，2880 核，12GB）发布，成深度学习实验室主力
- **2014-11**：**K80**（GK210 双 GPU，24GB）发布——成 AWS p2 / GCE 第一代云 GPU 实例
- **2014-2017**：**K80 黄金期**——绝大多数 DL 论文（VGG / ResNet / GAN / Seq2Seq / Attention）跑在 K80 上
- **2014**：Maxwell 架构发布（能效改进版，骨架沿用 SMX）
- **2016**：Pascal P100 发布——Kepler 在科研前沿被替换
- **2020**：CUDA 11 起 deprecate Kepler；2022 CUDA 12 正式删除支持

## 学到什么

1. **"宽 SM" 是后续 10 年的默认方向**：Kepler SMX 192 核取代 Fermi 32 核——之后 Maxwell SMM、Pascal SM、Volta SM、Ampere SM、Hopper SM 都沿用"单 SM 几百核 + 多调度器"的胖核思路
2. **硬件多队列是云时代的前提**：Hyper-Q 听起来枯燥，但**没它就没多租 GPU 云**——AWS 之所以敢卖 GPU 时长，是因为 Kepler 后多个客户的进程能在硬件层并行
3. **"GPU 自闭环" 思想从这开始**：Dynamic Parallelism → CUDA Graphs → 今天 LLM 训练的 graph capture——一路都是"减少 CPU 同步"的努力，根都在 Kepler
4. **K80 是 AI 革命的隐形基础设施**：AlexNet 用 GTX 580 一战成名，但**真正铺开深度学习的是 K80**——它便宜、显存够、云上能租。**没有 K80，2014-2017 那波 DL 复现潮就没硬件**
5. **架构强势期 vs 退役期**：Kepler 2012 起算 8 年硬上岗、再 4 年云上长尾——一代 GPU 架构的实际寿命是 **10 年级**，远超摩尔定律节拍。买卡时要看的是"被 deprecate 的窗口"

## 延伸阅读

- 白皮书：[NVIDIA Kepler GK110/GK210 Architecture Whitepaper](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-product-literature/NVIDIA-Kepler-GK110-GK210-Architecture-Whitepaper.pdf)（24 页，2012/2014）
- CUDA 编程手册 Kepler 章：[CUDA C++ Programming Guide § Compute Capability 3.x](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)
- Dynamic Parallelism 教程：[CUDA Dynamic Parallelism API and Principles](https://developer.nvidia.com/blog/cuda-dynamic-parallelism-api-principles/)
- [[fermi-architecture-2010]] —— 直接前代，cache + ECC + FP64 半速在那里立住
- [[tesla-architecture-2008]] —— 鼻祖，SIMT/warp 模型在那里被发明
- [[pytorch]] —— K80 是 PyTorch 0.x-1.x 时代的默认训练 GPU
- [[cuda]] —— Compute Capability 3.5/3.7 即 Kepler；shuffle/DP 都源自这一代

## 关联

- [[tesla-architecture-2008]] —— SIMT 鼻祖，Kepler 仍沿用 warp = 32 线程
- [[fermi-architecture-2010]] —— 直接前代，Kepler 在其上做"宽 SM + 多队列 + 子 kernel"
- [[pytorch]] —— 2014-2017 年 PyTorch 最常见后端就是 K80；shuffle 是其归约底层
- [[cuda]] —— 多个现代 CUDA 特性（DP、shuffle、Hyper-Q）首发于 Kepler
- [[attention]] —— Transformer 时代之前的 RNN/CNN 论文绝大多数训在 K80 上
