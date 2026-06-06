---
title: GPU 缓存一致性 — 用时戳代替失效消息
来源: Singh, Shriraman, Fung, OʼConnor, Aamodt, "Cache Coherence for GPU Architectures", HPCA 2013
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

CPU 多核之间共享数据，是靠一种叫 **MESI** 的协议——每条 cache line 标四种状态（独占 / 修改 / 共享 / 失效），核之间互发"我写了，你失效"的消息，通常还要一张目录追踪谁有副本。

GPU 想做同样的事却不行：一颗芯片几十到上百个 SM（流多处理器），每个 SM 自己一份 L1，跨 SM 共享数据时——

- **目录爆**：要记几百个共享者的位向量，存储成本指数级
- **消息爆**：一次写要广播给所有持副本者，互连堵死

Singh 等 2013 年这篇 HPCA 论文给出全新思路：**不用消息，用时间戳**。每条 cache line 带一个全局寿命戳，到期自己失效；写者只需等寿命到期再写。整个协议**没有失效消息、没有目录**。

日常类比：超市的酸奶。不用每瓶都配一个保安看着，每瓶贴一个保质期，到期自己下架；要换新货只等所有旧瓶过期就行。

## 为什么重要

不理解 TC（Temporal Coherence），下面这些事都没法解释：

- 为什么 CUDA 早期跨 SM 共享数据要么禁用 L1、要么显式 flush——MESI 太贵了，没协议
- 为什么 NVLink / NVSwitch / Hopper distributed shared memory 把"片内 SM 共享"问题**重新搬到片间多卡**之后，TC 这套思路又被反复引用
- 为什么 Volta 之后 NVIDIA 的同步原语（grid sync / cluster）越来越强——它们底层一致性语义的祖师爷就在这里
- 为什么"GPU 一致性"和"CPU 一致性"在教科书里被分开讲——不是 GPU 落后，是 GPU 选了**完全不同的协议家族**

## 核心要点

TC 的设计可以拆成 **三步**：

1. **全局同步计数器**：芯片上跑一个全局递增的计数器，每个 SM 都能读到它的当前值。这就是"现在是几点"。

2. **每条 cache line 带寿命戳**：line 进 L1 时被打上"我能活到 T 点"。读者每次访问看一眼当前时间，过 T 就当作失效，重新去 L2 拿。**没有人来通知你失效，是你自己看表**。

3. **写者等寿命到期**：写之前必须等到所有可能持有旧副本的 line 都过期——也就是等到全局时间过了它们的最长寿命。这一步叫 **TC-Strong**（顺序一致性版本）。

更实用的是 **TC-Weak**：平时不等，只在程序显式 fence / atomic 时才检查时戳——把同步成本推给宽松一致性允许的边界。

整个协议**没有失效消息、没有共享者目录**，跟 GPU 大规模并行天然合拍。

## 实践案例

### 案例 1：MESI 在 GPU 上为什么贵

假设 64 个 SM 每个 16KB L1，要让它们之间一致，传统目录协议需要：

- 每条 cache line 配 64 位位向量记谁持有副本
- 每次写要给所有副本持有者发失效消息
- 每个 SM 收到要回 ACK

GPU 一次 kernel 启动可能有几万个 thread 同时访存，**消息数量直接把片上互连压爆**。这是为什么 GPU 早期干脆不做跨 SM 一致——程序员手动 flush。

### 案例 2：TC-Weak 怎么省

```
时刻 t=100：SM-A 读 X，line 寿命 = 200
时刻 t=150：SM-B 读 X，line 寿命 = 250
时刻 t=180：SM-C 想写 X
  → SM-C 等到 t=250（最长寿命），直接写 L2，不发任何消息
时刻 t=251：SM-A / SM-B 再访问 X
  → 自检发现寿命过期，重新拉新值
```

整个过程**零消息**——只有大家共看的那个全局时钟。

### 案例 3：lifetime predictor 是关键工程

寿命设短了：line 频繁过期，读者反复回 L2 拉，等于没缓存。
寿命设长了：写者要等很久才能写，stall 严重。

论文用一个简单的预测器，根据访问模式动态调整寿命，最后比"禁用 L1"的基线**性能高 85%**，互连流量比 MESI 降低 **56%**。

### 案例 4：与 CPU MESI 协议的并排对比

| 维度 | CPU MESI | GPU TC-Weak |
|------|----------|-------------|
| 状态追踪 | 每条 line 4 状态 | 每条 line 1 个寿命戳 |
| 共享者发现 | 目录或广播 | 不需要——大家自看时钟 |
| 写者代价 | 给所有副本发失效 | 等寿命到期 |
| 读者代价 | 接收并 ACK 失效 | 自检时戳 |
| 适合规模 | 几核到几十核 | 几十到几百 SM |
| 一致性强度 | 顺序一致性常见 | 默认宽松，靠 fence 收紧 |

这张表说的不是"谁更好"，是"两个完全不同的世界"。CPU 假设少量核 + 共享数据频繁 + 程序员不愿写 fence；GPU 假设大量核 + 共享数据稀疏 + 程序员习惯显式同步。

## 踩过的坑

1. **时戳不是真实时钟**：全局计数器靠周期性 broadcast 更新，粒度比 wall clock 粗得多。设计时必须容忍这种粗粒度，不能依赖纳秒级精度。

2. **TC 不解决多卡一致**：只在一颗芯片内多 SM 间有效。多 GPU / 多节点共享内存还得另开协议（NVLink C2C / 软件管理）。

3. **宽松一致性把责任推给程序员**：TC-Weak 平时不查时戳，得靠程序员在该同步的地方写 fence / atomic。漏写就会读到旧值——而且没有运行时报警。

4. **predictor 错代价不对称**：寿命猜短只是性能损失，猜长会让写者长 stall——后者更难调。论文的 predictor 是保守偏短的。

5. **全局计数器本身要分布式同步**：芯片大了之后，连这个全局时钟自己都需要分级广播；论文里讨论了实现方式，但落到工业实现仍是一道坎。

## 适用 vs 不适用场景

**适用**：

- 单芯片多 SM 之间共享数据（图算法 / 不规则并行 / 跨 block 通信）
- 应用本身能接受宽松一致性（大多数 GPGPU 任务）
- 共享读多写少的工作集（写 stall 概率低）

**不适用**：

- 顺序一致性强需求——还是该用显式 fence + atomic
- 纯流式 SIMD 内核（block 内 shared memory 就够，根本不跨 SM）
- 多 GPU / 多节点（这是另一套问题，用 NVLink 协议或软件层管理）

## 历史小故事（可跳过）

- **1986 年**：Sweazey-Smith 在 ISCA 提出 MOESI/MESI 协议族，给 CPU 多核定调，往后三十年这就是缓存一致性的代名词
- **2008-2012 年**：GPGPU 兴起，跨 SM 共享数据需求冒出来——大家一边骂"GPU 没一致性"，一边只能禁 L1 或手动 flush
- **2013 年**：Singh 等这篇 HPCA 论文换了一个家族——不用消息、不用目录，用时戳。9 页 PDF，里面 MESI 这个名字几乎只出现在"我们不这么做"的地方
- **2017-2022 年**：Volta / Ampere / Hopper 一路把跨 SM 同步原语做强；NVSwitch 把"片内多 SM"问题升级到"片间多卡"，TC 思想在新尺度被反复重读

## 学到什么

1. **协议家族可以换**——MESI 不是缓存一致性的唯一答案。看体系结构换协议，看协议换实现
2. **消息 vs 时间** 是两条独立的协调路径。CPU 选了消息，GPU 选了时间
3. **宽松一致性是 GPU 友好的根本原因**——硬件简单 + 程序员显式同步 = 大规模并行的甜蜜点
4. **协议设计的工程难点常常是 predictor**——TC 的成败一半在 lifetime 预测器
5. **同一个问题在新尺度会复活**：片内 SM → 片间多卡 → 多节点，每升一层 TC 思路都还有用

6. **简单的硬件 + 显式的软件** 在大规模并行下常常打败"复杂硬件 + 隐式语义"——这是 GPU 全栈思维方式与 CPU 的最大分歧

7. **缓存一致性其实是一个"信息传递"问题**：MESI 主动推、TC 让消费者拉。换协议家族本质上是换信息论上的 push 和 pull

## 延伸阅读

- 论文 PDF：[Singh et al. 2013](https://www.ece.ubc.ca/~aamodt/papers/Singh.HPCA2013.pdf)（9 页，HPCA 主版）
- Tor Aamodt 组主页有 GPGPU-Sim 实现：[UBC computer architecture lab](https://www.ece.ubc.ca/~aamodt/)
- 相关综述：[Sorin, Hill, Wood — A Primer on Memory Consistency and Cache Coherence](https://www.morganclaypool.com/doi/abs/10.2200/S00346ED1V01Y201104CAC016)（2 版有 GPU 章）
- [[gpu-microbenchmarking-2010]] —— 想知道 GPU 缓存到底多大、line 多长，得靠微基准戳出来
- [[moesi-cache-coherence-1986]] —— TC 想换掉的那个 CPU 一致性家族
- [[ampere-architecture-2020]] —— TC 思想在新一代 GPU 上的延续与扩展

## 关联

- [[gpu-microbenchmarking-2010]] —— 微基准方法学反推 GPU 缓存参数；TC 协议设计的实证依据
- [[moesi-cache-coherence-1986]] —— CPU 多核一致性奠基；TC 的对比基线与"反面教材"
- [[ampere-architecture-2020]] —— 现代 GPU 架构演进；跨 SM 同步原语的工业延续
- [[dash-numa-1992]] —— CC-NUMA 多 socket 一致性；多卡一致性的另一支思想源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora-exascale-2024]] —— Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算
- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[cuda-streams-concurrency-2018]] —— CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
- [[dash-numa-1992]] —— Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器
- [[gpu-microbenchmarking-2010]] —— GPU 微基准 — 用秒表把闭源芯片"戳"出真相
- [[kocher-spectre-2019]] —— Spectre 攻击 — 推测执行偷看别人的内存
- [[memcached-fb-2013]] —— Scaling Memcache at Facebook — 万台缓存怎么不被踩塌
- [[moesi-cache-coherence-1986]] —— Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
- [[nickolls-dally-2010-cuda-era]] —— Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI

