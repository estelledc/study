---
title: PipeDream — 1F1B 调度让流水线工位别空等
来源: 'Narayanan et al., "PipeDream: Generalized Pipeline Parallelism for DNN Training", SOSP 2019'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

PipeDream 是 Microsoft Research + CMU 在 2019 年发表的流水线并行训练系统。它解决的是 [[gpipe-2019]] 留下的一个痛点——**流水线启动和收尾时大量 GPU 在空转**（叫 bubble）。

日常类比：装配线上 4 个工位流水做手机。GPipe 的做法是"先让所有 100 部手机依次走完工位 1，再依次去工位 2"——后面工位早早就闲着等。PipeDream 改成**每部手机走完工位 1 立刻去工位 2，工位 1 立刻接下一部**——稳态时 4 个工位都在干活。

技术名字叫 **1F1B 调度**（One-Forward-One-Backward）：每个 GPU stage 完成一个 micro-batch 的 forward，立刻接它对应的 backward，不再等所有 forward 排完。

代价是：backward 需要 forward 时的权重，但此时权重可能已被前一个 batch 的梯度更新过——PipeDream 用 **weight stashing**（权重暂存）解决这个问题。

## 为什么重要

不理解 PipeDream，下面这些事都讲不清：

- **PyTorch 官方流水线后端**（`torch.distributed.pipeline.schedule_1f1b`）用的就是 PipeDream 的调度
- **Megatron-LM 的 interleaved 1F1B** 直接源自 PipeDream 的后续版本 PipeDream-Flush
- **GPT-3 / PaLM / LLaMA** 训练时 PP 那一维跑的是 PipeDream 系列，不是 GPipe 原版
- 它把 GPipe 那个"O(M) 份激活内存峰值"压到 **O(K)**（M 是 micro-batch 数、K 是 stage 数），让 PP 更省显存

简单说——**GPipe 立了 baseline，PipeDream 把它推到能上线生产**。

## 核心要点

PipeDream 的三个组件：

1. **1F1B 调度**：稳态时每个 stage 交替做"forward 一份、backward 一份"。第一个 stage 最先排满，最后一个 stage 永远 F/B 紧接。bubble 区只剩流水启动和最后冲刷的两小段。

2. **weight stashing**：stage i 在 forward micro-batch m 时记下当时权重 W_i^(t)，存进队列；m 的 backward 抵达时取出 W_i^(t) 算梯度。每个 stage 存约 K-i 份权重副本——总额外内存 O(K) 倍权重，远小于激活的 O(M) 倍。

3. **自动 partitioner**：profile 每层的 forward / backward 时间和激活大小，用动态规划求最优切分。不是按层数等分，而是按真实算力分。

三件加起来就是 PipeDream。后来又演化出 **PipeDream-Flush**（每个 batch 边界 flush，丢掉 stashing 改回完全同步）——这就是今天工业主流用的那一版。

## 实践案例

### 案例 1：bubble 公式对比

GPipe 的 bubble fraction 是 `(K-1) / (M+K-1)`。
PipeDream 1F1B 在稳态阶段几乎没有 bubble——只有启动和收尾两段。

代入 K=4 卡、M=4 micro-batch：

- GPipe：bubble = 3/7 ≈ 43%
- PipeDream：bubble ≈ 6/(4+6) = 60%（启动+收尾各 K-1 拍）

看起来 M=4 时 PipeDream 还更糟？没错——**1F1B 真正赢在激活内存压力小**，所以可以把 M 调大。当 M=32：

- GPipe：bubble ≈ 8.5%，但激活内存 = 32 份
- PipeDream：bubble ≈ 16%，激活内存 = 4 份（=K）

PipeDream 用稍大一点的 bubble 换 8 倍激活内存节约——**显存才是大模型训练的真瓶颈**。

### 案例 2：weight stashing 在内存里长什么样

K=4 卡、M=4 micro-batch 时，stage 0（最早 forward 的卡）需要保存 4 份不同 step 的权重副本。stage 3（最后一个）只需要 1 份——因为它 forward 完立刻 backward。

总额外权重内存 = 1+2+3+4 = 10 份单 stage 权重 ≈ 10/(4 stages) = 2.5x 单卡权重。
对照激活 32 份 vs 4 份：8x 节约 vs 2.5x 多花——**赚**。

### 案例 3：和 PyTorch schedule_1f1b 对应起来

```python
# PyTorch torch.distributed.pipeline.schedule_1f1b 简化伪代码
for step in steady_state:
    forward(micro_batch[i])      # 推进 forward
    backward(micro_batch[i-K+1]) # 同时做之前的 backward
    # 中间错开 K-1 拍是 1F1B 的核心
```

PyTorch 实际用的是 PipeDream-Flush 版本——每个 batch 结束时 flush 所有 in-flight micro-batch，丢掉 weight stashing，恢复完全同步语义。**工程上太复杂的优化（异步+stashing）反而不如简单同步好维护**。

### 案例 4：Megatron-LM interleaved 1F1B 怎么继续推进

Megatron 在 PipeDream-Flush 基础上加了 **virtual pipeline**：让一张 GPU 负责多段（比如 K=4 物理卡，每张卡跑 2 个 virtual stage，逻辑上变成 8 段）。这样启动 bubble 从 (K-1)/M 变成 (K-1)/(VM)，V 是 virtual stage 数。

代价是更多通信。**Megatron 默认 V=2 或 V=4**——是 PipeDream 思路的延续，不是替代。

### 案例 5：原版 PipeDream 的"异步"为什么没人用

PipeDream 论文里其实是**异步 SGD** + weight stashing：相邻 micro-batch 用了不同的权重版本。这个数学上不等价单卡 SGD，可能影响最终精度（论文实验显示几乎无差但不绝对）。

工业界的选择：**PipeDream-Flush（同步 1F1B）**——保留 1F1B 的 bubble 优势，但每个 batch 边界 flush，恢复同步语义。今天大家说"用 PipeDream"几乎都指这一版。

## 适用 vs 不适用场景

**适用**：

- 跨节点流水线并行（PP），尤其 K 大于 4 的场景
- 显存吃紧的大模型训练——1F1B 把激活峰值从 O(M) 压到 O(K)
- 已经在用 GPipe / 自己写过 F-then-B 调度的团队，迁移到 1F1B 通常 1.5x-3x throughput 提升

**不适用**：

- K 太小（K=2 时 1F1B 和 F-then-B 几乎没差别）
- 想要数学严格等价单卡 SGD 又怕 flush 复杂——这种场景直接用 GPipe
- 模型层间不能切（比如有全局 BatchNorm），PipeDream 和 GPipe 都不适用

## 踩过的坑

1. **原版 PipeDream 的 weight stashing 工程上太重**：每个 stage 存多份权重，optimizer state 也跟着多份。SOTA 实现都改成 PipeDream-Flush 或 PipeDream-2BW（double-buffered weight，只存 2 份）。读论文别照搬第一版

2. **1F1B 不是免费午餐——bubble 仍在**：稳态阶段 bubble 接近零，但启动 + 收尾的 K-1 拍跑不掉。M 必须 ≥ 几倍 K 才划算

3. **partition 还是要 profile**：自动 partitioner 是 PipeDream 的核心贡献之一。新人常以为按层数等分就行——embedding 大但算得快、attention 慢但激活小，等分会让某段拖死整条线

4. **flush vs no-flush 决定语义**：选 flush 就是同步 SGD（精度稳，多花 K-1 拍 bubble per batch）；选 no-flush 就是异步（吞吐高但有 staleness）。**先确认你的训练精度容差**

5. **weight stashing 的内存常被低估**：stage 0 要存 K 份权重；如果模型本身就 70% 显存吃在权重上（小激活模型），weight stashing 可能比省下的激活还贵——这种场景 GPipe 反而更好

6. **和 ZeRO 叠加要小心**：ZeRO-3 把权重分片到 DP 组，PipeDream stashing 又要存多份权重——两者结合实现非常复杂。DeepSpeed 给了官方方案，自己手搓基本会翻车

## 历史小故事（可跳过）

- **2018 年 6 月**：Narayanan 等人挂出 arxiv 1806.03377 第一版，名字就叫 PipeDream
- **2019 年 10 月**：在 SOSP 2019 正式发表，斩获该届 best paper 提名
- **2020 年**：PipeDream-2BW 论文挂出，把 stashing 内存从 O(K) 降到 2 份
- **2021 年**：Megatron-LM 论文（Narayanan 是共同作者）把 interleaved 1F1B 推上 530B 模型训练
- **2022–2024**：PyTorch / DeepSpeed / Megatron 全部默认 1F1B 调度；GPipe 原版几乎没人用了
- **2024**：ZeroBubble 论文进一步把 backward 拆两半，把 weight-grad 塞进 bubble——PipeDream 的精神遗产仍在演化

技术演进很清晰——**GPipe 立 baseline → PipeDream 削 bubble → PipeDream-Flush 简化语义 → interleaved / virtual / ZeroBubble 接力优化**。

## 学到什么

1. **同步派 vs 异步派的取舍**：GPipe 选纯同步（数学纯净，bubble 大），PipeDream 选异步+stashing（吞吐高，复杂）。最后工业界回到 PipeDream-Flush（同步 1F1B）——**正确性 + 简单 比 5% 性能更值钱**

2. **激活内存比 bubble 更重要**：1F1B 真正的胜利不在 bubble 公式，而在把 O(M) 激活降到 O(K)。大模型训练永远是显存先于算力告急

3. **优雅的论文方案不一定是工程胜者**：weight stashing 数学上漂亮，但 PipeDream-Flush 这种"简单 flush 一下"的工程妥协才是上线版本。学论文要看后续 5 年实际跑的是哪个变体

4. **调度是流水线并行的核心战场**：partition 算法、weight 管理、激活管理都是辅助；真正决定性能的是 schedule 的状态机怎么设计——PipeDream 把这件事变成显学

## 延伸阅读

- 论文：[arxiv.org/abs/1806.03377](https://arxiv.org/abs/1806.03377)（SOSP 2019，正文 14 页）
- 后续：[PipeDream-2BW](https://arxiv.org/abs/2006.09503)（2020，把 stashing 降到 2 份）
- 实践：[Megatron-LM PP 文档](https://github.com/NVIDIA/Megatron-LM)（interleaved 1F1B 的工业实现）
- PyTorch 源码：`torch/distributed/pipelining/schedules.py` 里的 `Schedule1F1B` 类（直接对应论文调度）
- [[gpipe-2019]] —— PipeDream 的 baseline 和对手
- [[megatron-lm]] —— interleaved 1F1B 直接源自 PipeDream-Flush

## 关联

- [[gpipe-2019]] —— GPipe F-then-B 调度是 PipeDream 1F1B 的对照组，两者代表同步派 vs 异步派的两条路
- [[megatron-lm]] —— Megatron PP 模式默认用 interleaved 1F1B，思想直接源于 PipeDream-Flush
- [[deepspeed-zero]] —— DeepSpeed PipelineEngine 也用 1F1B 调度，可以和 ZeRO 叠加
- [[attention]] —— Transformer 是 PP 最大客户，PipeDream 实验里也包含 GNMT 这种 attention 模型
- [[pytorch]] —— `torch.distributed.pipelining.Schedule1F1B` 直接对应 PipeDream 调度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[attention]] —— Attention Is All You Need
- [[deepspeed-zero]] —— DeepSpeed ZeRO — 微软优化大模型训练显存
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[gpipe-2019]] —— GPipe — micro-batch 流水线让 GPU 排成生产线
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[zero-2020]] —— ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能

