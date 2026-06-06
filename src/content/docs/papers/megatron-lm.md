---
title: Megatron-LM — NVIDIA 大规模训练框架
来源: 'Shoeybi et al., "Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism", 2019'
日期: 2026-05-29
子分类: 模型与训练
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Megatron-LM 是 NVIDIA 2019 年发布的一套**把超大语言模型切到很多张 GPU 上协同训练**的框架。核心招式叫 **Tensor Parallelism**（TP，张量并行）。

日常类比：单张 GPU 就像一个工人，要他独自造一辆车——零件太多塞不下车间，根本动不了手。Megatron 的做法是**把每个零件切给不同工人，每人只负责一片，最后拼起来还是一辆完整的车**。

具体怎么"切"？Transformer 层里有大矩阵 `Y = X × W`：

- 把 W **按列切**给 N 张卡，每张算自己那几列
- 下一层把权重 **按行切**，每张算一个部分和
- 用一次 all-reduce 把部分和加起来 → 拿到完整结果

8B 参数的模型在单张 V100（32GB）上塞不下；切到 8 张 V100 上每张只占 1/8，瞬间能跑。

## 为什么重要

不知道 Megatron-LM，下面这些大模型故事都讲不通：

- **GPT-3 175B、Megatron-Turing NLG 530B、LLaMA、Mistral 都用了它**——它是分布式训练的工业标杆
- 2021 年 NVIDIA 自己在 **4480 张 A100** 上训出 530B 参数的 Megatron-Turing NLG，用的就是这套
- 它和 [[deepspeed-zero]] **互补**：Megatron 切模型权重，ZeRO 切优化器状态和梯度。两个叠起来才扛得住 trillion-scale
- 2023 年 NVIDIA 把核心算法抽成 **Megatron-Core**，现在是开源训练框架（NeMo / TRT-LLM）的地基

简单说——**2019 年之后所有"超大模型怎么训"的论文，都建立在这一篇上**。

## 核心要点

Megatron 提供三种"切"的方式，组合起来用：

1. **Tensor Parallelism（张量并行）**：把单个 Linear 层的权重矩阵切到多卡。Attention 的 Q/K/V 按列切，输出投影按行切，串接成一对，一次 all-reduce 就能闭环。这是 2019 年论文的核心贡献。

2. **Pipeline Parallelism（流水线并行）**：不同 Transformer 层放不同 GPU——前 6 层在卡 0、中 6 层在卡 1、后 6 层在卡 2。层之间只在边界传数据。这招不是 Megatron 原创（GPipe 2018 已经有），但它把 PP 和 TP 组成了 "3D 并行"。

3. **Sequence Parallelism（序列并行）**：2021 v2 加的——把 LayerNorm 和 Dropout 的**序列维度**也切了，省下激活值内存。是对 TP 的补丁，因为 TP 切不动这些归一化模块。

最常见的组合是 **TP × PP × DP**（数据并行）三层叠，工业上叫 "3D 并行"。

## 实践案例

### 案例 1：GPT-3 175B 怎么训

社区披露的 GPT-3 训练配置：

- **TP=8**（节点内 8 卡 NVLink）：把每层的矩阵乘切 8 路
- **PP=16**：把 96 层 Transformer 切成 16 段，每段一组卡
- **DP=数十路**：剩下的卡走数据并行

总并行度 = 8 × 16 × DP。这种组合让 175B 模型能在 1024 张 A100 上训起来，每张卡只扛 1/128 的等价负载。

### 案例 2：Megatron-Turing NLG 530B

NVIDIA + 微软 2021 合作训出的 530B 参数模型，用了 **4480 张 A100**。配置：TP=8 × PP=35 × DP=16，全部跑 Megatron-LM 的分布式栈。这是 GPT-3 之后第一个公开的 500B+ 密集模型。

### 案例 3：开源生态

LLaMA 2、Mistral、DeepSeek 等开源模型的训练 pipeline 几乎都是 fork Megatron-LM 改的。HuggingFace `accelerate`、PyTorch FSDP 都吸收了它的 TP 实现思路。**论文五年后，代码还活在每一个新模型的 commit log 里**。

### 案例 4：列并行 + 行并行串接的精妙处

为什么列切完一定要接行切？因为列并行的输出**天然是切开的**——每张卡只产出自己那几列。这种格式正好是行并行的输入形式：

- 列并行 forward 不通信，只在 backward 算输入梯度时 all-reduce 一次
- 行并行 forward 在算完局部部分和后 all-reduce 一次，输出在所有卡上一致

一个 Transformer block 的整个 FFN 部分，从输入到输出，**只通信两次**（forward 一次 + backward 一次）。这是 Megatron 在 8 卡上还能跑出 76% scaling efficiency 的根本原因。

## 适用 vs 不适用场景

**适用**：

- 训练 8B 参数以上的 Transformer 模型——单卡装不下时必须切
- 单节点 8 卡（NVLink 带宽够，TP 的 all-reduce 不会被吃死）
- 架构对称、维度规整的模型（hidden size 是 8 的倍数）

**不适用**：

- 1B 以下小模型——直接 DP + 梯度检查点更简单
- 跨节点 TP（IB 带宽撑不住 all-reduce，论文实验也只在单节点）
- 非 Transformer 架构（RNN 时间步耦合，没"列切口"）
- 维度怪异的模型（hidden 不能被 world_size 整除就直接报错）

## 踩过的坑

1. **bias 别加两次**：行并行的 bias 只在 rank 0 加，否则每张卡都加一份，loss 异常但训练不崩溃，定位极难
2. **dropout 的随机数得同步**：每张卡处理不同 attention 头时 rng 不同步会让梯度算错。Megatron 自己写了一个 `tensor model parallel rng tracker` 专门管这个
3. **跨节点别上 TP**：NVLink 单节点 600GB/s 时 TP=8 还行，跨到 InfiniBand（约 200GB/s）就被通信吃掉。论文没写明这条，是后续 530B 训练才补的工程经验
4. **checkpoint 不能换 TP size**：TP=8 训出来的权重不能直接被 TP=4 加载，要专门写转换工具
5. **scaling efficiency 的水分**：论文报的 76% 是 weak scaling（卡数翻倍同时模型也翻倍）。如果固定模型只加卡，数字会跌到 50% 以下——读论文时要看清楚是哪一种 scaling

6. **TP × PP 的微批数（micro-batch）选错引发气泡**：流水线层间有空闲气泡，micro-batch 太少气泡占比就大；太多又吃显存。1F1B / interleaved schedule 这些 trick 都是为了压气泡，背后是吞吐率与显存的权衡

7. **混合精度切错维度梯度爆炸**：bf16 + Megatron 在 hidden 维度做 reduce 时数值范围足；但若选错 reduce 维度（比如混到 batch 维），会出现统计偏差。早期 v1 在 fp16 + 大 hidden 上就遇到过

8. **反向传播的通信常被忽略**：列并行 forward 不通信，但 backward 计算输入梯度时要 all-reduce；这些"看不见的通信"是估算扩展性时最容易漏算的部分

## 适用 vs 不适用场景（细分）

- **小集群（<8 卡）**：用 DP / FSDP 更省心，TP 收益不明显
- **跨节点训练**：优先 PP+DP，TP 跨节点几乎稳定亏损
- **finetune 而非预训练**：Megatron 是预训练设计，finetune 用 HuggingFace + accelerate 更灵活
- **MoE 模型**：Megatron 后续加了 Expert Parallel，但 Sparse 路由的负载不均衡问题仍是研究前沿

## 历史小故事

- **2019 年（v1）**：Shoeybi 团队发表论文，提出 TP 列+行串接方案，跑 8.3B GPT-2 验证 76% scaling efficiency
- **2021 年（v2）**：加 Sequence Parallelism，把 LayerNorm 的盲区补了
- **2023 年**：把核心算法抽出来叫 **Megatron-Core**，做成可复用库
- **2024 年**：NVIDIA NeMo（训练）和 TensorRT-LLM（推理）都集成 Megatron 内核

技术演进轨迹很清晰——从"能训大模型"到"能高效训"再到"能让别人复用"。

每一代版本都对应当时算力规模的跃升：v1 对应 V100 时代的 8 卡节点，v2 对应 A100 时代的跨节点 3D 并行，Megatron-Core 对应 H100 时代的可组合训练栈。

## 学到什么

1. **大矩阵乘法天然可分块**——这是 Megatron 整个体系的支点。线性代数早就告诉我们了，但谁先把它工程化谁就赢
2. **算法约束架构选型**：TP 要求维度被 world_size 整除，**逼着 2020 年之后所有大模型的 hidden 都选 2048 / 4096 / 8192 / 12288 这种"漂亮数"**
3. **承认局限是论文寿命的一部分**：Megatron 主动说自己只适合单节点 TP，反而给后来的 ZeRO / FSDP / Pipeline 方案留了发展空间
4. **代码 = 论文的另一半**：NVIDIA 把仓库维护得比论文还详细，5000+ 引用里很大一部分来自"我能直接跑通"
5. **通信模式决定 scaling 上限**：TP forward+backward 各一次 all-reduce，让带宽占比可控；流水线让计算和通信能 overlap——通信账本算清楚才有可能 scale
6. **2D-mesh / 3D-mesh 通用化**：Megatron 的 TP × PP × DP 三维网格，是后来 GSPMD、Pathways 等通用并行框架的前身——大家都在解同一个 mesh 切分问题

## 延伸阅读

- 论文：[arxiv.org/abs/1909.08053](https://arxiv.org/abs/1909.08053)（25 页，核心章节是 Tensor Parallel 那部分，其他可跳）
- 代码：[github.com/NVIDIA/Megatron-LM](https://github.com/NVIDIA/Megatron-LM)（`megatron/model/transformer.py` 是论文核心算法的可执行版本）
- 后续论文：Megatron-Turing NLG 530B（2021），讲 3D 并行如何扩到 4480 卡
- 后续工程：[Megatron-Core 文档](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/features/parallelisms.html)（NeMo 用户视角解释三维并行怎么配）
- 视频：Stanford CS324 Lecture "Distributed Training" 把 TP/PP/DP/ZeRO 四种维度一口气讲完，是入门最快的概念图
- [[deepspeed-zero]] —— 切优化器状态和梯度的另一条路，和 Megatron 互补

## 关联

- [[transformer]] —— Megatron 切的对象就是 Transformer block
- [[deepspeed-zero]] —— 切的方向不同（DP 维度），可与 Megatron 叠加成 3D 并行
- [[gpt-3]] —— 第一个公开使用 Megatron 训练栈的 175B 模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[deepspeed-zero]] —— DeepSpeed ZeRO — 微软优化大模型训练显存
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners

