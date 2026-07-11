---
title: CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
来源: 'Dai, Lin, Li, Zhao, Wang. "Accelerate GPU Concurrent Kernel Execution by Mitigating Memory Pipeline Stalls". HPCA 2018'
日期: 2026-05-31
分类: GPU 架构
难度: 中级
---

## 是什么

这篇 HPCA 2018 论文（Dai 等）做的事是：**量化并解释 GPU 上多 kernel 同跑时为什么经常跑不满，尤其是 intra-SM 共享时的访存流水线停顿与 cache 干扰**。工程上读它，是为了看清 CUDA streams / concurrent kernel 的真实收益边界。

日常类比：餐厅有 8 个炉灶（SM），文档告诉你"我们支持同时炒两道菜"。听起来 2 倍速。论文和同期测量工作一起说明：多数时候第二道菜根本没开火——第一道菜把炉灶和灶台通道（显存流水线）占满了。

结论一句话：**streams 并发能跑，但能省时间的场景比文档暗示的窄得多**；本文后半也会补上 H2D 重叠等工程实践（那是 streams 稳赚姿势，不是该论文主实验）。

## 为什么重要

不理解这篇的结论，下面这些工程现象都解释不了：

- 用 `nvidia-smi` 看 SM 利用率只有 60%，开 streams 想"把剩下 40% 也用上"，发现总时间几乎没变
- 同样代码 Pascal 卡上并发没收益，换到 Volta+MPS 突然快了 30%——MPS 不是魔法，是它绕开了 left-over 策略
- profiler 报"kernel 并发执行"看着热闹，但 wall-clock 时间和串行差不多
- 为什么深度学习训练里 stream 调优收益不如换 batch size 大

简单说：这是把"流并发为什么经常没用"讲清楚的工程必读。

## 核心要点

论文用三件事撑起结论（left-over / 争用是 GPU 并发的通用背景；本文重点在 intra-SM 共享时的访存干扰）：

1. **left-over 策略**：NVIDIA 默认调度器先把所有 SM 给第一个 kernel，它吃饱后剩下的才给第二个。绝大多数真实 kernel 体积够大，第一个就吃满，第二个等于在排队，**没有真并发**。

2. **资源争用与流水线停顿**：就算两个 kernel 都挤进 SM，它们还要抢 L2/L1、显存带宽、warp scheduler 端口。memory-bound kernel 容易把访存流水线堵死，拖累同 SM 上的另一个 kernel——论文的核心量化对象。

3. **真有收益的窄区间**：kernel 必须**小**（占不满 SM）+ 资源**互补**（一个算多一个读多）+ 通信开销别太重。条件同时满足时，2 路并发常见约 1.3 至 1.7 倍；出了这个窄区间就掉回 ~1.0。H2D/kernel 重叠是另一类收益，见案例 4。

实验方法上，作者用合成与真实 kernel 组合扫参，观察并发时的停顿与加速。这种"先控变量再归因"的做法是 GPU 量化研究的标配。

## 实践案例

### 案例 1：典型"看起来并发但没用"

```cuda
cudaStream_t s1, s2;
cudaStreamCreate(&s1); cudaStreamCreate(&s2);
matmul<<<grid, block, 0, s1>>>(A, B, C);   // 占满 SM
matmul<<<grid, block, 0, s2>>>(D, E, F);   // 排队
```

profiler 时间线上两个 kernel 似乎重叠，wall-clock 却几乎等于串行。原因：第一个 matmul 的 grid 已经超过硬件 SM 数量很多倍，**left-over 之后没有"剩"任何 SM 给第二个**。

### 案例 2：真能拿到并发收益的窄场景

```cuda
small_compute<<<2, 256, 0, s1>>>(...);   // 只占 2 个 SM
memory_copy<<<2, 256, 0, s2>>>(...);     // 只占 2 个 SM，且互补（带宽 vs 算力）
```

两个 kernel 都很小，加起来才 4 个 SM，剩 4 个 SM 真正能并行；而且一个 compute-bound 一个 memory-bound，争用面错开。这是论文实测能拿到 1.5 倍加速的形态。

### 案例 3：Volta+ MPS 显式分区

```bash
export CUDA_MPS_ACTIVE_THREAD_PERCENTAGE=50
```

Volta 后的 MPS 让你强制把 SM 切两半，每个进程拿 50%。这绕开了 left-over，相当于硬件级"两个炉灶你一半我一半"。但代价是单 kernel 性能下降，要看总吞吐是否真的赚。

### 案例 4：H2D 拷贝与 kernel 重叠（工程补充，非论文主实验）

```cuda
cudaMemcpyAsync(d_A, h_A, sz, cudaMemcpyHostToDevice, s1);
kernel<<<g, b, 0, s2>>>(d_B);  // 用上一批已经拷好的数据算
cudaMemcpyAsync(h_C, d_C, sz, cudaMemcpyDeviceToHost, s3);
```

三个 stream 各做一段，PCIe 传输和计算同时进行。这是 CUDA streams 的经典工程用法，几乎一定能赚——前提是 host 内存得是 pinned（`cudaMallocHost`），否则拷贝退化成同步阻塞。它和论文关注的 kernel-kernel / intra-SM 争用是不同问题：前者稳赚，后者收益很窄。

## 踩过的坑

1. **profiler 时间线重叠 ≠ 真并发**：Nsight 把两个 kernel 画成上下两条同时段的方块，看着是并发，wall-clock 却没变。要看的是**总耗时**，不是时间线视觉。

2. **小 kernel 的 launch 开销吃掉并发收益**：每个 kernel launch 大约 5 至 10 微秒。如果 kernel 本身就跑 20 微秒，开 streams 反而被 launch 拖慢。

3. **memory-bound × memory-bound 反而变慢**：两个都狂读显存的 kernel 同跑，L2 cache 互相挤出，HBM 带宽撞车，论文实测能慢到 0.7 倍。

4. **Hyper-Q 的 32 条队列只是"提交不阻塞"**：很多人以为 Hyper-Q 等于 32 路并发执行，**不是**。它只是让 32 个 stream 提交时不再串行排队，真正能不能并发还看 SM 是否有空。

5. **default stream 的隐式同步**：往默认 stream 提交一个 kernel 会**阻塞所有其他 stream**。新人写并发常常忘了这点，发现"加了 streams 还是串行"，根因是中间夹了一个默认 stream 操作（典型如 cudaMemcpy 没指定 stream）。

6. **CPU 端 kernel launch 顺序敏感**：两个 stream 各发一个 kernel，CPU 端发射的先后顺序会影响 GPU 端调度——发射快的占先抢 SM。这让 benchmark 不可复现，论文专门讨论了这个噪声源。

## 适用 vs 不适用场景

**适用**：
- kernel 小（占不满 SM 的小波次任务，比如 batch size 很小的推理）
- 资源占用互补（compute-bound 配 memory-bound）
- 想在同一卡上跑多租户（用 MPS 强制分区）
- 异步 H2D / D2H 拷贝与 kernel 重叠（这是 streams 真正稳赚的场景，不是 kernel-kernel 并发）

**不适用**：
- 单个大 kernel 已经吃满 SM——开 streams 没救
- 两个 memory-bound kernel——cache thrash 可能反而慢
- 想靠 streams 把 60% SM 利用率拉到 100%——这是错把架构问题当调度问题，根因往往是 occupancy 不足
- Pascal 及更老的卡——没有 MPS 显式分区，left-over 是硬限制

## 历史小故事（可跳过）

- **2010 年 Fermi**：第一次支持 concurrent kernel execution，但只有 1 条硬件队列，提交就串行
- **2012 年 Kepler GK110**：Hyper-Q 出现，32 条队列让"提交"不阻塞，但执行还是 left-over
- **2017 年 Volta**：MPS 升级，第一次允许显式 SM 分区（`CUDA_MPS_ACTIVE_THREAD_PERCENTAGE`）
- **2018 年这篇 HPCA 论文**：聚焦 concurrent kernel 的访存流水线停顿与干扰，说明"能并发"不等于"一定更快"
- **2020 年 Ampere**：MIG（Multi-Instance GPU）把分区做到了硬件物理隔离，是 MPS 的下一代
- **2022 年 Hopper**：CUDA Graphs 进一步把"调度"提前到编译期，绕开运行期 launch 开销与调度噪声

## 学到什么

1. **并发硬件 ≠ 并发收益**：CPU 多核时代我们习惯了"线程多就快"，GPU 不是。GPU 的并发要看 SM 是否真有富余、资源是否互补、launch 开销是否被吃掉。这是 GPU 编程心智模型与 CPU 最大的不同点之一。

2. **left-over 是默认调度的根**：理解了它，就理解了为什么 streams 经常没用——不是调度有 bug，是调度策略本来就偏心第一个 kernel。

3. **量化研究的价值**：文档说"支持并发"，论文测出"在 X% 的真实 workload 上并发收益小于 5%"。两者都对，但工程决策只能信后者。

4. **真正稳赚的并发是 H2D/kernel/D2H 三段流水**：kernel-kernel 并发收益薄，但拷贝-计算重叠是 streams 几乎一定能赚的场景，别忽略。

5. **架构限制要靠新硬件解，不要靠调度技巧**：从 Fermi 到 Ampere，每一代都在松绑并发限制。如果你的瓶颈是"streams 不够并发"，更可能的解药是换更新架构（Volta MPS、Ampere MIG），而不是反复调你的调度代码。

6. **量化 vs 定性**的差别：CUDA 文档定性说"支持并发"，没说"在何种条件下能拿到多少收益"。把定性结论拿到工程现场容易栽跟头。这就是这种 quantitative study 类论文的价值——它给出**带条件的收益曲线**，让你能预判"我的 workload 在曲线哪一段"。

## 延伸阅读

- 论文 PDF：[HPCA 2018 — Accelerate GPU Concurrent Kernel Execution…](https://doi.org/10.1109/HPCA.2018.00027)
- 配套读物：NVIDIA 工程师博客 [GPU Pro Tip: CUDA 7 Streams Simplify Concurrency](https://developer.nvidia.com/blog/gpu-pro-tip-cuda-7-streams-simplify-concurrency/)（讲 per-thread default stream 怎么解决"默认流隐式同步"）
- NVIDIA 官方：[CUDA C Programming Guide — Streams](https://docs.nvidia.com/cuda/cuda-c-programming-guide/#streams)（看完论文再看官方文档，对照"它没明说的那些限制"）
- [[gpu-microbenchmarking-2010]] —— 测 GPU 微观行为的方法学先驱
- [[ampere-architecture-2020]] —— MIG 把"分区"做到硬件级
- [[gpu-cache-coherence-2013]] —— 解释为什么 cache 争用会让并发变慢

## 关联

- [[gpu-microbenchmarking-2010]] —— 提供测量 GPU 真实行为的方法学，本论文的实验设计直接受其影响
- [[ampere-architecture-2020]] —— MIG 是对 left-over 限制的终极硬件回应
- [[gpu-cache-coherence-2013]] —— 并发 kernel 争用 L2 的根因在 cache 一致性设计
- [[sycl-cpp-2020]] —— 跨厂商的并发抽象，但底层硬件限制依然适用
- [[dstreams-2013]] —— 名字里也有 stream，但语义完全不同：那是 Spark 流处理的"离散化流"，不要混淆

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amdahl-law-1967]] —— Amdahl 定律 — 串行比例决定并行加速比的上界
- [[aurora-exascale-2024]] —— Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算
- [[cell-be-2005]] —— Cell BE — 一颗 CPU 里塞 8 个加速核
- [[cuda]] —— CUDA — 把显卡变成通用并行计算平台
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[lindholm-2008-tesla]] —— Lindholm 2008 Tesla — SM、warp、SIMT 这套词汇的官方出生证明
- [[nickolls-dally-2010-cuda-era]] —— Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI
- [[owens-2007-gpgpu-survey]] —— Owens 2007 GPGPU 综述 — CUDA 之前 GPU 通用计算的黑魔法时代
- [[ring-allreduce-2017]] —— Ring All-Reduce — 把 HPC 的环形规约搬进深度学习
