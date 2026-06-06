---
title: GPipe — micro-batch 流水线让 GPU 排成生产线
来源: 'Huang et al., "GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism", NeurIPS 2019'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

GPipe 是 Google Brain 2019 年发布的一套**把一个超大神经网络切成几段、放到不同 GPU 上像生产线一样接力训练**的库。核心招式叫 **micro-batch pipeline parallelism**（微批流水线并行）。

日常类比：传统单卡训练像一个工人一辆车从头装到尾——车太大塞不进车间根本动不了。GPipe 的做法是**把车间分成 K 个工位，每个工位负责一段工序**：

- 把 96 层 Transformer 切成 4 段，每段 24 层放一张卡
- 一个 mini-batch 拆成 M 份小块（micro-batch），像零件箱一样在工位间流转
- 当卡 0 把第 1 块发给卡 1 后，卡 0 立刻开始处理第 2 块——所有工位**同时在干活**

L 层模型从"单卡装不下"瞬间变成"K 张卡每张装 L/K 层"，激活值再用重算（re-materialization）压一遍，6B 参数的 Transformer 就能在 8 张 TPU 上训起来。

## 为什么重要

不理解 GPipe，下面这些大模型故事都讲不通：

- **流水线并行（PP）的工业起点**——2019 年之后所有 PP 方案都是 GPipe 的变体或回应
- **同步 SGD 语义的标杆**：GPipe 保证训练数学上和单卡 SGD 完全一样，给后来 PipeDream 的"异步 vs 同步"之争立了基准线
- 它和 [[megatron-lm]] **互补**：Megatron 在层内切矩阵（TP），GPipe 在层间切（PP），叠 DP 就是工业标配的 **3D 并行**
- GPT-3、Megatron-Turing 530B、PaLM、LLaMA 训练时 PP 那一维的祖师爷就是它

简单说——**没有 GPipe 的 micro-batch 思路，今天 100B+ 的模型根本训不起来**。

## 核心要点

GPipe 的招数可以拆成 **三件武器**：

1. **切层（Partition）**：把 L 层网络按计算量切成 K 段，每段塞一张卡。切口尽量让每段 forward 时间相近——不平衡的话最慢那段会拖死整条流水线。

2. **拆 micro-batch（Pipelining）**：一个 mini-batch（比如 1024 样本）切成 M 份小块（每份 1024/M 个样本）。卡 0 处理完第 1 块就发给卡 1，自己马上接第 2 块。M 越大，流水越满，卡空闲时间越少。

3. **重算激活（Re-materialization）**：forward 时**只保存每段边界**的激活值（几张卡之间传的那个 tensor），段内中间激活全丢掉。backward 要用时**重新跑一遍 forward** 现算。代价是约 30% 额外算力，省下的内存让模型规模直接翻几倍。

三件加起来叫 **GPipe scheduling**——后续 PipeDream-1F1B、Megatron interleaved 都是在这个基础上做调度优化。

## 实践案例

### 案例 1：bubble 公式——为什么 M 必须远大于 K

流水线启动时只有卡 0 在干活，其他卡空着；收尾时只有最后一张卡在干活——这段空闲叫 **bubble（气泡）**。

论文给的公式：

```
bubble fraction = (K - 1) / (M + K - 1)
```

代入数字：K=4 卡、M=4 micro-batch：bubble = 3/7 ≈ 43%（接近一半时间在空转！）。
K=4 卡、M=32 micro-batch：bubble = 3/35 ≈ 8.5%（基本满载）。

经验法则：**M ≥ 4K**，bubble 就降到可接受范围。

### 案例 2：557M AmoebaNet 在 ImageNet 上 84.4%

GPipe 论文最响的一击：把 AmoebaNet 从 84M 参数推到 557M，跑 ImageNet 直接拿到 **84.4% top-1**。当时 SOTA 大概在 83% 左右，GPipe 用的是"模型变大就行"的暴力路线，证明 PP 让大模型训练**真的可行**而不只是理论。

具体做法：

- 切到 8 块 TPU v3 上，K=8 段
- mini-batch 8192，micro-batch M=32（M/K=4 刚好踩在 bubble 阈值）
- 训练 wall-clock 比单卡推断慢约 25%，但**模型大了 6.6 倍**——拿算力换准确率的典型一击

### 案例 3：6B Transformer 在 103 种语言上做翻译

第二个验证场景：用 GPipe 训了一个 6B 参数的多语 Transformer，覆盖 103 种语言到英语的翻译。在大多数语言上击败专门为该语言训的小模型——**这是"大模型即通才"思想最早的工业证据之一**，比 GPT-3 早了 1 年。

### 案例 4：micro-batch 越多越好吗

不是。M 越大：

- bubble 越小（好）
- 每段需要保存的边界激活更多（M 份），内存上涨（坏）
- 每个 micro-batch 变小，GPU 上的矩阵乘没法吃满 SM（坏）

工程上要在三者间调参——典型 sweet spot 是 **M = 4K ~ 8K**。

### 案例 5：和 Megatron 张量并行怎么叠

工业上 PP 单独用很少，常和 TP、DP 叠成 3D 并行。以 GPT-3 175B 为例：

- **TP=8**：节点内 8 卡 NVLink，切每层的矩阵
- **PP=16**：跨节点切 96 层 Transformer，每段 6 层（GPipe 这一维）
- **DP=数十路**：剩下的卡走数据并行复制整套切片

为什么 PP 走跨节点？因为 PP 只在段边界传激活（小 tensor），InfiniBand 200GB/s 够用；TP 的 all-reduce 流量大，必须留在 NVLink 节点内。**GPipe 是跨节点扩展的关键拼图**。

## 适用 vs 不适用场景

**适用**：

- 单卡装不下、且层与层之间相对独立的深层网络（Transformer 是教科书例子）
- 跨节点通信带宽有限的集群——PP 只在段边界传激活，比 TP 的 all-reduce 省得多
- 想保留**精确同步 SGD 语义**的训练（GPipe 数学上等价单卡，复现实验稳）

**不适用**：

- 层数很少的网络（K 段切不开，bubble 占比极高）
- 需要小 mini-batch 的场景（M 太小 bubble 严重）
- BatchNorm 关键的网络——GPipe 的 BN 统计在 micro-batch 上算，和单卡略有偏差。LayerNorm/GroupNorm 没问题，所以 Transformer 友好
- 单节点 8 卡且 NVLink 充足时——直接用 [[megatron-lm]] TP 更省心，PP 是跨节点才必要

## 踩过的坑

1. **M 太小 bubble 直接 50%**：新手常照搬 PyTorch 单卡的 batch=256，切 4 卡 PP 后 M 也只有 4，于是 43% 时间在空转。**先把 M 调到 ≥ 4K** 再说性能
2. **partition 不平衡是隐形杀手**：embedding 层显存大但算得快、attention 算得慢——不能按层数等分，要按 **profile 的 forward 时间**等分
3. **重算 + bubble 双重消耗**：理论上 30% 重算代价 + 10% bubble = 实际 wall-clock 比单卡满载慢 40%。换来的是"能训"——这笔账要算清
4. **BatchNorm 别随便用**：micro-batch 切完后每个 BN 看到的统计样本只有 1/M。Megatron 和 GPT 系列全用 LayerNorm 部分原因就在这
5. **F-then-B 调度峰值激活高**：GPipe 是先把所有 micro-batch 的 forward 排完再做 backward，导致段内同时挂 M 份激活。后来的 1F1B 调度（PipeDream）做一份 forward 紧跟一份 backward，峰值降到 K 份
6. **checkpoint 不能换 K**：用 K=4 切出来训的权重不能直接给 K=8 加载（partition 边界变了），换并行度要专门写转换脚本——这条几乎所有 PP 框架都中招过

## 历史小故事（可跳过）

- **2018 年 11 月**：Huang 等人在 arxiv 挂出 GPipe 第一版（1811.06965），同期 Google AI Blog 配文宣传"开源大模型训练库"
- **2019 年 3 月**：Lingvo 仓库正式开源 GPipe 实现（基于 TensorFlow）
- **2019 年 12 月**：被 NeurIPS 2019 收录，正式成为 PP 领域的奠基论文
- **2020 年**：Kakao Brain 出了 PyTorch 移植版 **torchgpipe**，后来被收入 `torch.distributed.pipeline.sync`
- **2021–2024**：PipeDream-1F1B、Megatron interleaved、Chimera、ZeroBubble 一系列论文都在挑战或扩展 GPipe 的调度

技术演进很清晰——**GPipe 立 baseline → 后人不断削 bubble 削峰值激活**。

## 学到什么

1. **流水线 + micro-batch 是把"等"变成"叠"**：传统并行让卡互相等，micro-batch 让等待时间被下一块的计算填上——这是 CPU 流水线、装配线 100 年前就懂的道理，搬到神经网络也成立
2. **同步 vs 异步的取舍**：GPipe 选了同步（数学纯净，bubble 是代价）；PipeDream 选了异步（throughput 高但有 staleness 风险）。今天工业界主流回到同步派——**正确性比 5% 速度更值钱**
3. **重算（recomputation）是免费午餐附近最近的位置**：用 30% 算力换 10x 内存，在显存就是瓶颈的年代是必胜交易。这条思路一直延续到 FlashAttention 和 selective recompute
4. **论文 + 代码双引擎**：GPipe 把代码、Lingvo 接入、blog post 一起发——后续 5 年所有 PP 实现都从这里 fork

## 延伸阅读

- 论文：[arxiv.org/abs/1811.06965](https://arxiv.org/abs/1811.06965)（13 页，正文很短，附录有完整调度图）
- Google AI Blog：[Introducing GPipe](https://ai.googleblog.com/2019/03/introducing-gpipe-open-source-library.html)（2019-03，给非研究者看的版本）
- 代码：[github.com/tensorflow/lingvo](https://github.com/tensorflow/lingvo)（Google 官方实现）/ [torchgpipe](https://github.com/kakaobrain/torchgpipe)（PyTorch 移植）
- 后续论文：PipeDream（2019）讲 1F1B 异步调度；Megatron-LM（2020）讲 PP × TP 组合
- [[megatron-lm]] —— 切矩阵的张量并行，和 GPipe 互补成 3D 并行
- [[deepspeed-zero]] —— 切优化器状态的第三种维度

## 关联

- [[megatron-lm]] —— Megatron 的 PP 部分本质就是 GPipe 思路 + 1F1B 调度优化
- [[attention]] —— GPipe 验证 6B Transformer 时切的就是 Transformer block
- [[deepspeed-zero]] —— 另一种切法（DP 维度切优化器状态），常和 GPipe 叠加

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[attention]] —— Attention Is All You Need
- [[blink-2020]] —— Blink — 按拓扑动态拼生成树替代 NCCL ring
- [[cell-be-2005]] —— Cell BE — 一颗 CPU 里塞 8 个加速核
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[deepspeed-zero]] —— DeepSpeed ZeRO — 微软优化大模型训练显存
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[pipedream-2019]] —— PipeDream — 1F1B 调度让流水线工位别空等
- [[zero-2020]] —— ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能

