---
title: PipeDream — 1F1B 调度让流水线工位别空等
来源: 'Narayanan et al., "PipeDream: Generalized Pipeline Parallelism for DNN Training", SOSP 2019'
日期: 2026-05-31
分类: 分布式训练
难度: 中级
---

## 是什么

PipeDream 是 Microsoft Research + CMU 在 2019 年发表的流水线并行训练系统。它解决的是 [[gpipe-2019]] 留下的一个痛点——**流水线启动和收尾时大量 GPU 在空转**（叫 bubble）。

日常类比：装配线上 4 个工位流水做手机。GPipe 的做法是"先让所有 100 部手机依次走完工位 1，再依次去工位 2"——后面工位早早就闲着等。PipeDream 改成**每部手机走完工位 1 立刻去工位 2，工位 1 立刻接下一部**——稳态时 4 个工位都在干活。

技术名字叫 **1F1B 调度**（One-Forward-One-Backward）：每个 GPU stage 完成一个 micro-batch 的 forward，立刻接它对应的 backward，不再等所有 forward 排完。

代价是：backward 需要 forward 时的权重，但此时权重可能已被前一个 batch 的梯度更新过——PipeDream 用 **weight stashing**（权重暂存）解决这个问题。

## 为什么重要

不理解 PipeDream，下面这些事都讲不清：

- **PyTorch 官方流水线调度**（`torch.distributed.pipelining.schedules.Schedule1F1B`）用的就是 PipeDream 一脉的 1F1B
- **Megatron-LM 的 interleaved 1F1B** 直接源自 PipeDream 的后续版本 PipeDream-Flush
- **GPT-3 / Megatron 系大模型**训练时 PP 那一维跑的是 1F1B 系列，不是 GPipe 原版（PaLM 等另有调度，勿一概而论）
- 相对 GPipe 的"O(M) 份激活峰值"，1F1B 稳态在途 micro-batch 约 **O(K)**（M 是 micro-batch 数、K 是 stage 数），PP 更省显存

简单说——**GPipe 立了 baseline，PipeDream 把它推到能上线生产**。

## 核心要点

PipeDream 的三个组件：

1. **1F1B 调度**：稳态时每个 stage 交替做"forward 一份、backward 一份"。第一个 stage 最先排满，最后一个 stage 永远 F/B 紧接。bubble 区只剩流水启动和最后冲刷的两小段。

2. **weight stashing**：stage i 在 forward micro-batch m 时记下当时权重 W_i^(t)，存进队列；m 的 backward 抵达时取出 W_i^(t) 算梯度。每个 stage 存约 K-i 份权重副本——总额外内存 O(K) 倍权重，远小于激活的 O(M) 倍。

3. **自动 partitioner**：profile 每层的 forward / backward 时间和激活大小，用动态规划求最优切分。不是按层数等分，而是按真实算力分。

三件加起来就是 PipeDream。后来又演化出 **PipeDream-Flush**（每个 batch 边界 flush，丢掉 stashing 改回完全同步）——这就是今天工业主流用的那一版。

## 实践案例

### 案例 1：bubble 与激活内存怎么比

GPipe（F-then-B + 每 batch flush）的 bubble fraction 是 `(K-1)/(M+K-1)`。
原版 PipeDream 的异步 1F1B **不在每个 batch 边界 flush**，稳态时各 stage 交替 F/B，bubble 接近零。

工业主流的 **PipeDream-Flush / 同步 1F1B** 为了恢复同步语义，每个 batch 仍要 fill+drain，bubble 公式与 GPipe **相同**：`(K-1)/(M+K-1)`。它赢的不是更小的 bubble 公式，而是**在途激活约 O(K)**，而 GPipe 要囤满 O(M) 份激活再统一 backward。

代入 K=4、M=32（同步 1F1B 与 GPipe 同公式）：

- bubble ≈ 3/35 ≈ 8.6%（两者接近）
- 激活峰值：GPipe ≈ 32 份；1F1B ≈ 4 份（≈K）

**显存才是大模型训练的真瓶颈**——同样的 bubble 预算下，1F1B 更能把 M 做大或把模型做深。

### 案例 2：weight stashing 在内存里长什么样

K=4 时，stage 0（最早 forward 的卡）要为在途 micro-batch 暂存多份权重；stage 3（最后一个）forward 完立刻 backward，几乎只需 1 份。

粗算总额外权重 ≈ 1+2+3+4 = 10 份单 stage 权重 ≈ 2.5× 单卡权重。对照激活「32 份 vs 4 份」：省激活远大于多花的权重副本——**这是原版异步 PipeDream 的账**。工程上若改用 Flush，就丢掉 stashing，改回同步语义（见案例 3）。

### 案例 3：和 PyTorch Schedule1F1B 对应起来

```python
# torch.distributed.pipelining.schedules.Schedule1F1B 简化伪代码
for step in steady_state:
    forward(micro_batch[i])      # 推进 forward
    backward(micro_batch[i-K+1]) # 同时做之前的 backward
    # 中间错开约 K-1 拍是 1F1B 的核心
```

PyTorch / Megatron 实际默认更接近 **PipeDream-Flush**：batch 边界 flush，丢掉 weight stashing，恢复同步 SGD。Megatron 再加 **virtual pipeline**（一张卡跑多段）继续削 bubble——是 PipeDream 思路的延续。原版异步+stashing 论文漂亮，但维护成本高，生产里几乎都选同步 1F1B。

## 踩过的坑

1. **原版 PipeDream 的 weight stashing 工程上太重**：每个 stage 存多份权重，optimizer state 也跟着多份。SOTA 实现都改成 PipeDream-Flush 或 PipeDream-2BW（double-buffered weight，只存 2 份）。读论文别照搬第一版

2. **1F1B 不是免费午餐——bubble 仍在**：原版稳态接近零 bubble，但 Flush 版每个 batch 仍有 fill+drain 的 K-1 拍。M 必须 ≥ 几倍 K 才划算

3. **partition 还是要 profile**：自动 partitioner 是 PipeDream 的核心贡献之一。新人常以为按层数等分就行——embedding 大但算得快、attention 慢但激活小，等分会让某段拖死整条线

4. **flush vs no-flush 决定语义**：选 flush 就是同步 SGD（精度稳，多花 K-1 拍 bubble per batch）；选 no-flush 就是异步（吞吐高但有 staleness）。**先确认你的训练精度容差**

5. **weight stashing 的内存常被低估**：stage 0 要存 K 份权重；如果模型本身就 70% 显存吃在权重上（小激活模型），weight stashing 可能比省下的激活还贵——这种场景 GPipe 反而更好

6. **和 ZeRO 叠加要小心**：ZeRO-3 把权重分片到 DP 组，PipeDream stashing 又要存多份权重——两者结合实现非常复杂。DeepSpeed 给了官方方案，自己手搓基本会翻车

## 适用 vs 不适用场景

**适用**：

- 跨节点流水线并行（PP），尤其 K 大于 4 的场景
- 显存吃紧的大模型训练——1F1B 把激活峰值从 O(M) 压到 O(K)
- 已经在用 GPipe / 自己写过 F-then-B 调度的团队，迁移到 1F1B 通常 1.5x-3x throughput 提升

**不适用**：

- K 太小（K=2 时 1F1B 和 F-then-B 几乎没差别）
- 想要数学严格等价单卡 SGD 又怕 flush 复杂——这种场景直接用 GPipe
- 模型层间不能切（比如有全局 BatchNorm），PipeDream 和 GPipe 都不适用

## 历史小故事（可跳过）

- **2018 年 6 月**：Narayanan 等人挂出 arxiv 1806.03377 第一版，名字就叫 PipeDream
- **2019 年 10 月**：在 SOSP 2019 正式发表（该届 Best Paper 另有归属；PipeDream 是正式录用的影响力论文）
- **2020 年**：PipeDream-2BW 论文挂出，把 stashing 内存从 O(K) 降到 2 份
- **2021 年**：Megatron-LM 论文（Narayanan 是共同作者）把 interleaved 1F1B 推上 530B 模型训练
- **2022–2024**：PyTorch / DeepSpeed / Megatron 默认同步 1F1B；GPipe 原版几乎没人用了
- **2024**：ZeroBubble 等继续把 backward 拆分塞进 bubble——PipeDream 的精神遗产仍在演化

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
- PyTorch：`torch.distributed.pipelining.schedules.Schedule1F1B`（同步 1F1B 工业实现）
- [[gpipe-2019]] —— PipeDream 的 baseline 和对手
- [[megatron-lm]] —— interleaved 1F1B 直接源自 PipeDream-Flush

## 关联

- [[gpipe-2019]] —— GPipe F-then-B 是对照组；PipeDream 原版走异步，工业主流回到同步 1F1B
- [[megatron-lm]] —— Megatron PP 默认 interleaved 1F1B，思想源于 PipeDream-Flush
- [[deepspeed-zero]] —— DeepSpeed PipelineEngine 也用 1F1B，可和 ZeRO 叠加
- [[attention]] —— Transformer 是 PP 最大客户；PipeDream 实验也含 GNMT 等序列模型
- [[pytorch]] —— `Schedule1F1B` 对应 PipeDream 一脉的同步调度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[zero-2020]] —— ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能
