---
title: Ring All-Reduce — 把 HPC 的环形规约搬进深度学习
来源: Andrew Gibiansky, "Bringing HPC Techniques to Deep Learning", Baidu SVAIL Blog 2017
日期: 2026-05-31
分类: GPU 架构
难度: 中级
---

## 是什么

**Ring All-Reduce** 是一种让 N 张 GPU 在不经过中心节点的情况下，把各自算出的梯度**累加成同一个结果再分发回每张卡**的通信算法。日常类比：8 个朋友各算了自己那份家庭账，要凑出"总账"再每人拿一份。中心化做法是大家都把账推给一个会计，会计累加完再复印 8 份发回去——会计累得吐血。Ring 的做法是 8 个人围成一圈，每人只负责管账本的某一页，转两圈下来每人手里都是完整的总账。

Gibiansky 2017 年这篇博客把 HPC（高性能计算）圈从 1990 年代就在用的环形规约算法，搬给了深度学习工程师，并配了能读的图文。**NCCL、Horovod、PyTorch DDP 的数据并行同步，默认/核心路径之一就是 ring all-reduce**（NCCL 还会按消息大小在 ring 与 tree 之间切换）——今天 LLM 预训练里每一步反向之后的"梯度同步"，底下经常转的就是它。

## 为什么重要

不理解 ring all-reduce，下面这些事都没法解释：

- 为什么 GPT-3 / LLaMA 这种模型可以扩到上千张 GPU 而不被通信卡死
- 为什么 PyTorch 的 `DistributedDataParallel` 比早期 `DataParallel` 快得多
- 为什么 NCCL 2.4 还要加 double binary tree——ring 不是已经"最优"了吗
- 为什么 2016 年之前大家用参数服务器（Parameter Server），2017 年之后突然集体切换

这是 2016-2017 年深度学习训练规模从"单机 8 卡"跳到"多机数百卡"的拐点上，**最核心的工程基础设施转变**。

## 核心要点

Ring all-reduce 把"全员同步梯度"拆成两个阶段，每阶段 **N-1 步**，每步只跟左右两个邻居说话。

### 阶段一：reduce-scatter（散播累加）

把每张卡上的梯度切成 N 块。第 i 张卡负责"累加第 i 块"。每一步，每张卡把自己手上正在传递的那一块发给右邻居，同时从左邻居收一块累加进自己负责的位置。N-1 步之后：第 i 张卡手里持有的"第 i 块"已经是全员之和。

### 阶段二：all-gather（环形分发）

第 i 张卡有完整的第 i 块。再转一圈 N-1 步，把它传给所有人。每张卡每步都把手里"刚收到的那块"再传给右邻居。N-1 步之后，每张卡都有完整的 N 块拼起来——也就是完整的总梯度。

### 关键算式

每张卡总通信量 = `2 * (N-1) / N * 模型大小` —— **当 N 很大时趋近 `2 * 模型大小`，与 N 无关**。这是带宽最优（Patarasuk & Yuan 2009 在 MPI 圈早就证了下界）。

对比参数服务器：server 端入流量 = `N * 模型大小` —— **N 线性增长**，server 永远是瓶颈。

### 为什么需要两个阶段

直觉上"每张卡传完整梯度给所有人然后求和"也行——这就是 all-gather + 本地求和。问题是这样每张卡要发 `(N-1) * 模型大小`，总通信量爆炸。Ring 的精妙在于：第一阶段把"求和"分摊到 N 张卡上各自负责一块，于是每步只传 `1/N` 大小的 chunk；第二阶段再把累加好的块传一圈。**两阶段让每张卡每步的通信量从"全量"降到"1/N"**——这是带宽下界能达到的关键。

## 实践案例

### 案例 1：4 张 GPU 跑 ring all-reduce

假设每张卡有梯度向量长度 4（切成 4 块 a/b/c/d）：

```
初始：
GPU0: [a0 b0 c0 d0]
GPU1: [a1 b1 c1 d1]
GPU2: [a2 b2 c2 d2]
GPU3: [a3 b3 c3 d3]

reduce-scatter 3 步后：
GPU0: 持有 d 块累加 = d0+d1+d2+d3
GPU1: 持有 a 块累加 = a0+a1+a2+a3
GPU2: 持有 b 块累加 = b0+b1+b2+b3
GPU3: 持有 c 块累加 = c0+c1+c2+c3

all-gather 3 步后：每张卡都有 [Σa Σb Σc Σd]
```

总共 6 步，每步只在相邻 GPU 之间传 1/4 的数据量。

### 案例 2：PyTorch DDP 背后

```python
import torch.distributed as dist
# 需 WORLD_SIZE≥2，各进程加入同一 process group
dist.init_process_group(backend="nccl")
model = DistributedDataParallel(model)   # 反向后自动 all-reduce
loss.backward()                          # 触发 NCCL 集合通信
```

你写的就这几行。底下：NCCL 探测拓扑（NVLink / PCIe / InfiniBand）→ 切 chunk → 常走 ring 做 reduce-scatter + all-gather → 梯度回到每张卡。单进程跑看不出 ring，至少两卡/两进程才有邻居可传。

### 案例 3：Horovod 把 MPI 思维带进 TF

Uber 2017 年开源 Horovod。`hvd.allreduce(grad)` 一行替换掉 TensorFlow 原本的参数服务器调用。公开基准里，Inception V3 / ResNet-101 在约 **128 GPU** 上扩展效率约 **88%**（相对理想线性），约为当时标准分布式 TensorFlow 的两倍吞吐。这是 ring 算法第一次让许多 DL 工程师感到"多卡不是负担"。

### 案例 4：千卡训练时的真实数字

LLaMA-2 70B 的梯度大约 140 GB（fp16）。1024 卡做一次 ring all-reduce：每步只传一块 chunk ≈ `140/1024 ≈ 0.14 GB`，整次共 `2×(1024-1)=2046` 步，每卡总传输 ≈ `2×(N-1)/N×140 ≈ 280 GB`。若链路按 NVLink 4 单向 450 GB/s 理想估算，整次同步量级约 0.6 s（实际还受延迟与拓扑影响）。**这就是为什么大模型训练要做 gradient bucketing + overlap**——把同步藏进反向计算后面。

## 踩过的坑

1. **延迟 O(N)**：环上一共 2(N-1) 步串行。N 大时延迟累计，**小消息（几 KB）打不满带宽**。NCCL 2.4 引入 double binary tree——小消息走树（O(log N) 步），大消息走 ring（带宽最优）。

2. **拓扑无感知**：朴素 ring 把所有 GPU 当一样的链路，但 NVLink（300 GB/s）、PCIe（32 GB/s）、InfiniBand（25 GB/s）速度差一个数量级。后续 hierarchical ring：节点内一个 ring 走 NVLink，节点间另一个 ring 走 IB。

3. **straggler 卡全员**：环上有一张慢卡，整个 ring 等它。**梯度压缩、异步 all-reduce、gradient bucketing**（PyTorch DDP 的优化）都是为了缓解这个问题。

4. **小集群 ring 不一定赢**：N=2 的时候 ring 和 PS 没差。N=4 也差不多。**N ≥ 8 才显著**。本地 2 卡训练别迷信 ring。

## 适用 vs 不适用场景

**适用**：

- 数据并行训练（每张卡一份完整模型，分别算梯度后同步）
- 同质硬件、稳定网络、N ≥ 8
- 大消息通信（梯度通常 MB ~ GB 级）

**不适用**：

- 模型并行（每张卡持有不同参数，需要的是 send/recv 而不是 all-reduce）
- 异构硬件 / 频繁掉卡 → 用容错的 elastic training
- 小消息高频通信 → 用 tree-based 算法
- 极端稀疏梯度 → 用 sparse all-reduce 或梯度压缩

## 历史小故事（可跳过）

- **1990 年代**：HPC 圈早就在用 ring all-reduce 做 MPI_Allreduce 的实现之一
- **2009 年**：Patarasuk & Yuan 证明 ring 是带宽最优——这是数学结论
- **2016 年**：DL 训练规模从单机几卡跳到多机几百卡，参数服务器开始顶不住
- **2017 年 2 月**：Gibiansky 在 Baidu SVAIL 写下这篇博客，把 HPC 的 ring 翻译给 DL 工程师
- **2017 年 10 月**：Uber 开源 Horovod，第一个 DL 友好的 MPI 风格框架
- **2019 年**：NVIDIA NCCL 2.4 加 double binary tree；同期 PyTorch DDP 走向主流

之后所有大模型预训练，数据并行那一维都站在这个算法上。

## 学到什么

1. **去中心化的力量**：把"会计"删掉，让每个人只跟邻居说话——总通信量反而和 N 无关
2. **跨领域翻译比原创更稀缺**：算法本身 1990 年代就有，2017 年的贡献是"翻译"——HPC 60 年的集合通信经验讲给 DL 工程师听
3. **bandwidth-optimal vs latency-optimal 是两个目标**：ring 赢带宽输延迟，tree 反过来；现实系统两个都要
4. **基础设施决定能力上限**：没有 ring all-reduce，就没有今天千卡 LLM 训练这条路
5. **算法选择跟着规模相变**：N=2 时 PS 也行，N=8 时 ring 显著赢，N=64 时 tree+ring 混合赢——没有"永远最优"的算法
6. **同步比异步更稳**：DL 早期试过异步 SGD（不同 worker 看到不一样的参数），收敛性变差。ring 把"严格同步"做到工程可承受，让 SGD 数学性质保留

## 延伸阅读

- 原文博客：[Bringing HPC Techniques to Deep Learning](https://andrew.gibiansky.com/blog/machine-learning/baidu-allreduce/)（图文 + 代码，最易读）
- 数学下界：[Patarasuk & Yuan 2009](https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf) "Bandwidth Optimal All-reduce Algorithms"
- NCCL 内部：[NVIDIA NCCL 文档](https://docs.nvidia.com/deeplearning/nccl/) — ring + tree 双算法
- Horovod 论文：[Sergeev & Del Balso 2018](https://arxiv.org/abs/1802.05799)
- [[ampere-architecture-2020]] —— A100 的 NVLink 3 是 ring 当下硬件载体
- [[alpa-2022]] —— 把数据/张量/流水并行统一搜索，ring 是其中数据并行的实现底座

## 关联

- [[ampere-architecture-2020]] —— NVLink 拓扑决定 ring 能跑多快
- [[cuda-streams-concurrency-2018]] —— ring 通信和反向计算 overlap 靠 stream
- [[alpa-2022]] —— ring 是数据并行维度的实现，alpa 在它之上做并行策略搜索
- [[pytorch]] —— DDP 默认走 NCCL ring

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[cuda-streams-concurrency-2018]] —— CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
- [[gpudirect-rdma-2014]] —— GPUDirect RDMA — 让网卡直接读写 GPU 显存
- [[pytorch]] —— PyTorch — 深度学习主流框架

