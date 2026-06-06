---
title: NVIDIA Fermi — 把 GPU 从游戏卡推上超算
来源: 'Wittenbrink, Kilgariff, Prabhu, "Fermi: The First Complete GPU Computing Architecture", IEEE Micro 2011'
日期: 2026-05-30
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Fermi 是 NVIDIA 2009 年公布、2010 年出货的第二代通用 GPU 架构（前代见 [[tesla-architecture-2008]]）。它做了一件听起来枯燥但行业大事：**给 GPU 加上传统超算才有的三样东西——ECC 内存纠错、真正的 L1/L2 cache、半速双精度浮点**。

日常类比：Tesla 像一台"改装赛车"——快、刺激、但没安全气囊、没刹车助力、没空调。游戏玩家爱开，银行不敢上路。Fermi 把赛车工业化：装气囊（ECC）、加大缓存系统（L1/L2）、把双精度油门从 1/8 提到 1/2。从此**金融、医学影像、气候模拟、核物理**这些"算错一个 bit 就出人命"的领域，第一次愿意把 GPU 抬进机房。

落到硅片：**16 个 SM × 每 SM 32 CUDA cores = 512 个核心**（Tesla G80 是 128）；新增 **768KB L2 共享**；每 SM **64KB 可配缓存**（16KB L1 + 48KB shared，或反过来）；ECC 保护**寄存器 / L1 / L2 / DRAM** 全链路。

## 为什么重要

不理解 Fermi，下面这些事都没法解释：

- 为什么 2010 年中国天河一号 A 用 **7168 块 Fermi M2050** 拿下 Top500 第一——这是 GPU 第一次进超算
- 为什么 2012 年 AlexNet 选 **GTX 580**（Fermi 升级版 GF110）训练 ImageNet——它的 cache 和并发 kernel 让训练循环可行
- 为什么今天 [[pytorch]] 切 FP32/FP64 不用换硬件——Fermi 之后 FP64 半速成默认
- 为什么 Kepler / Maxwell / Pascal / Volta / Ampere / Hopper 的内存层次都长一个样——它们都是 Fermi 模板的微调

## 核心要点

Fermi 在 Tesla 基础上的关键升级可以拆成 **四件事**：

1. **真正的 cache 层次**：Tesla 只有"程序员管的 16KB shared memory"，没有自动 cache。Fermi 加了 **每 SM 64KB 可配**（L1 + shared 自由切分）+ **768KB L2 全 SM 共享**。意义：**程序员不用再把每个 byte 都手工搬进 shared memory**——访存模式不完美的代码也能拿到加速。

2. **ECC 全链路保护**：寄存器、L1、L2、显存任何一比特翻转都能检测纠错。意义：HPC 用户的硬门槛——金融定价、药物模拟、气候模型不能容忍**软错误**（cosmic ray 翻转一个 bit 导致结果错但程序不崩）。Tesla 没 ECC，被这些行业一票否决。

3. **FP64 半速**：双精度性能从 Tesla 的**单精度 1/8** 提到 **1/2**。意义：CFD（流体）、有限元、量子化学这类**必须双精度**的科学计算第一次跑得动。Tesla 上跑 FP64 的算力不如一块好 CPU，Fermi 上是 CPU 的 5-10 倍。

4. **并发 kernel + unified address space**：最多 **16 个 kernel 同时跑**（Tesla 只能 1 个）；global / shared / local 三种内存共用 **64-bit 统一地址**——C++ 的指针、虚函数、new/delete 第一次在 GPU 上能用。意义：GPU 编程从"受限 C"升级到"接近完整 C++"，能搬现成大型代码库上来。

### 这四件事为什么必须一起出现

任意拿掉一个，"GPU 进 HPC" 就讲不通：

- 没**真 cache**，要求每个 kernel 都做完美 shared memory 调度——HPC 老代码改不动
- 没 **ECC**，金融/医疗合规这关过不去——硬件再快也进不了机房
- 没 **FP64 半速**，科学计算只能当玩具——精度不够算什么 CFD
- 没 **C++/统一地址**，几十万行的传统 HPC 代码（用类、模板、RAII）没法移植

四件事互为支柱，这就是为什么 Fermi 被叫做 **"第一个完整的 GPU 计算架构"**——前代 Tesla 是开山之作，但**不完整**。

## 实践案例

### 案例 1：L1 cache 让"非完美访存"也能跑

```cuda
__global__ void stencil(float *a, float *out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i > 0 && i < n-1)
        out[i] = (a[i-1] + a[i] + a[i+1]) / 3.0f;
}
```

Tesla 上：每线程读 `a[i-1], a[i], a[i+1]`，相邻线程有重叠但**没自动复用**——必须手写 shared memory tile。Fermi 上：**L1 自动捕获重叠访存**，相邻 warp 命中 cache，性能直接接近手工优化版的 70-80%。**程序员从地狱级降到中级**。

### 案例 2：ECC 是怎么"花钱买信任"的

```bash
nvidia-smi -e 1   # 开启 ECC
nvidia-smi -q -d ECC   # 查纠错计数
```

打开后，**显存可用容量 -12%、带宽 -15%**（用来存 ECC syndrome bits）。但任何 cosmic ray / 电压抖动导致的单 bit 翻转会被纠正、双 bit 翻转会被报告。**金融银行 / 医学影像 / 国家实验室的合规审计需要这个开关**——Tesla 没这开关就直接卡在采购环节。

### 案例 3：[[flash-attention]] 与 Fermi 的间接关系

FlashAttention 显式管理 shared memory（Tesla 引入的层）。但**它在 Fermi 之后才出现**有原因：Fermi 后才有 **L2 共享**——多个 SM 之间数据复用不再走 DRAM。FlashAttention-2/3 的 inter-block 通信优化依赖的就是 Fermi 这套层次。

### 案例 4：[[pytorch]] FP32/FP64 切换

```python
x = torch.randn(1024, 1024, dtype=torch.float64).cuda()
y = x @ x.T   # 双精度矩阵乘
```

Tesla 上这一行**慢 8 倍**于 FP32，几乎没人用。Fermi 之后只**慢 2 倍**，FP64 训练（如某些科研模型）第一次有意义。今天 PyTorch 里 `dtype=torch.float64` 在 H100 上跑得动，根因是 Fermi 立的"半速 FP64" 默认。

## 踩过的坑

1. **L1 不是银弹**：随机访存仍然慢；**warp 合并访存**依然是性能命门。L1 只对"邻近线程访问邻近地址" 有救——这条 Tesla 的规矩 Fermi 没废。

2. **ECC 开关游戏卡阉了**：GeForce 系列（GTX 580 等）默认**无 ECC**，只有 Tesla M 系/Quadro 才有。买错卡型号合规过不去——这是 NVIDIA 切市场的刀。

3. **FP64 半速也只在计算卡**：M2050/M2070/M2090 是 1/2，**GTX 580 阉到 1/8**——和 Tesla 同款。游戏卡跑科研别想着用 FP64。

4. **并发 kernel 要不同 stream**：默认 stream 串行；必须显式 `cudaStreamCreate` 才能 16 路并发。**老代码不改一行就升级 Fermi 看不到这个收益**。

5. **L1/shared 比例全局选**：`cudaFuncSetCacheConfig` 是 per-kernel，但**切换有几微秒成本**。混跑两种偏好的 kernel 时要权衡。

6. **ECC 默认开还是关**：Tesla 计算卡出厂默认开，**实测显存带宽下降 12-15%**。游戏卡型号永远关。如果做合规审计要明确写在代码里 `nvidia-smi -e 1`，否则下次重启可能被运维改回。

7. **FMA 改变数值结果**：Fermi 引入 IEEE 754-2008 FMA（fused multiply-add），`a*b+c` 一步算完只舍入一次。**和老 GPU 比对结果时会出现末位差异**——不是 bug，是更精确，但跨硬件回归测试会假报失败。

## 适用 vs 不适用场景

**适用**：

- 科学计算 / HPC（CFD、量子化学、气候、有限元）—— FP64 + ECC 双开
- 金融定价 / 风险模拟 —— ECC 是硬合规
- 早期深度学习训练（2012-2014）—— L1 cache + 并发 kernel + C++ 支持
- 移植大型 C++ 代码库到 GPU —— 统一地址空间 + new/delete

**不适用**：

- 纯图形渲染 —— ECC 浪费带宽，游戏卡关掉就行
- 极端访存密集且模式可预测 —— 手工 shared memory 仍然胜过 L1
- 推理（batch 小）—— 并发 kernel 收益小，Pascal 之后的 INT8 才是正解

## 历史小故事（可跳过）

- **2006 年**：Tesla G80 + CUDA 1.0 发布，GPU 通用计算开端，但 HPC 社区观望——没 ECC 不敢用
- **2008 年**：GT200（Tesla 升级）加入 FP64 但 1/8 速度——表态而已，不可用
- **2009 年 9 月**：Fermi 架构白皮书公开，HPC 社区第一次激动
- **2010 年 4 月**：Tesla M2050 出货，单卡 FP64 = 515 GFLOPS（同期 Xeon X5550 是 50 GFLOPS）
- **2010 年 11 月**：**天河一号 A** 用 7168 块 M2050 + 14336 颗 Xeon CPU 拿下 Top500 第一——GPU 第一次进超算榜首
- **2011 年**：GTX 580（Fermi GF110）成深度学习实验室主力，Hinton 组、LeCun 组都用
- **2012 年 9 月**：AlexNet 用两块 **GTX 580** 拿下 ImageNet —— Fermi 直接催生深度学习革命
- **2014 年**：Maxwell 架构发布，是 Fermi 的能效改进版；架构骨架不变

## 学到什么

1. **"完整"比"首创"更值**：Tesla 是首创，但 Fermi 才让 GPU 真正进入 HPC——首创打开门，**完整**让用户敢搬家具进去
2. **ECC 是市场分割工具**：同硅片，开 ECC = HPC 卡（贵 5 倍），关 ECC = 游戏卡。NVIDIA 用一个开关切两个市场——这是教科书级商业案例
3. **cache 让"程序员门槛"和"性能上限"解耦**：Tesla 把每层存储摊给程序员管——上限高但门槛高。Fermi 加自动 L1/L2——上限基本不变，但门槛大降，**用户基数才能扩大**
4. **架构定型一旦完成，14 年只调不改**：Fermi 的 SM + L1/L2 + ECC + FP64 + 统一地址 五件套，到 2024 年 Hopper / Blackwell 都还是同一套骨架——这是为什么 NVIDIA 的护城河越来越深
5. **科学计算先于 AI 成为 GPU 第一个 killer app**：2010 是 HPC 进 GPU 的拐点，2012 才轮到深度学习。**正是 Fermi 让 HPC 社区先跑起来，深度学习才有现成硬件可借**——AlexNet 不是凭空出现，它站在 HPC 用户磨出来的工具链上

## 延伸阅读

- 论文/白皮书：[NVIDIA Fermi Compute Architecture Whitepaper](https://www.nvidia.com/content/PDF/fermi_white_papers/NVIDIA_Fermi_Compute_Architecture_Whitepaper.pdf)（22 页，2009）
- IEEE Micro 文章：[Fermi: The First Complete GPU Computing Architecture](https://ieeexplore.ieee.org/document/5751937)（2011）
- CUDA 编程手册 Fermi 章节：[CUDA C++ Programming Guide § Compute Capability 2.x](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)
- [[tesla-architecture-2008]] —— 直接前代，SIMT/warp/shared memory 在那里被发明
- [[pytorch]] —— 现代 ML 默认 CUDA 后端，FP32/FP64 切换依赖 Fermi 之后硬件
- [[flash-attention]] —— IO-aware；Fermi 的 L2 共享让 inter-block 数据复用成为可能

## 关联

- [[tesla-architecture-2008]] —— 前代架构，SIMT/warp/三层存储；Fermi 在其上加 cache + ECC + FP64
- [[pytorch]] —— 默认 CUDA 后端；FP64 半速、ECC 都是 Fermi 立的默认
- [[flash-attention]] —— 显式管理 shared memory，间接利用 Fermi 引入的 L2
- [[mapreduce]] —— 同时代的"切大计算成小块"另一条路（集群方向），Fermi 走单卡 HPC 方向
- [[attention]] —— Transformer 的核心算子，矩阵乘吃满 Fermi 引入的 L2 共享
- [[bigtable]] —— 同时代 Google 的大数据系统；和 Fermi 代表"集群 vs 单卡"两条放大计算的路线
