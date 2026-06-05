---
title: 'Megatron-LM — NVIDIA 张量并行库'
来源: 'https://github.com/NVIDIA/Megatron-LM'
日期: '2026-05-30'
子分类: 数据科学与 AI
分类: 机器学习
难度: '高级'
provenance: pipeline-v3
---

## 是什么

Megatron-LM 是 NVIDIA 2019 年开源的**大模型并行训练参考实现**。它解决的核心问题：**一张 GPU 装不下、一台机器算不动的 Transformer，怎么把矩阵乘法本身切到 N 张卡上同时算**。日常类比：像**做一道超大尺寸的鸡蛋卷**——一张平底锅煎不开，于是请来 8 个厨师，每人煎一条，最后**沿同一条边粘起来**就是完整的卷。Megatron 教会业界三件事：怎么切矩阵（TP）、怎么切层（PP）、怎么切序列（SP）。

最小用法：

```bash
torchrun --nproc_per_node=8 pretrain_gpt.py \
  --tensor-model-parallel-size 8 \
  --pipeline-model-parallel-size 1 \
  --num-layers 32 --hidden-size 4096
```

`--tensor-model-parallel-size 8` 这一行就是 Megatron 招牌——把每个 attention/MLP 内部的 GEMM 切到 8 张 NVLink GPU 同时算。

## 为什么重要

不理解 Megatron-LM，下面这些事都没法解释：

- 为什么 GPT-3 / BLOOM / LLaMA 这些百亿到千亿模型的预训练代码长得都很像 Megatron——它是事实参考实现
- 为什么 [[deepspeed]] 文档反复出现 "Megatron-DeepSpeed"——TP 这一维 DeepSpeed 没做，借的就是 Megatron
- 为什么 [[accelerate]] / [[torchtune]] 在 70B 以上量级开始失语——它们没有 TP，矩阵切不开
- 为什么 NVIDIA NeMo / TensorRT-LLM 内核引用 `megatron.core`——核心算子被抽成独立子库给上层复用

## 核心要点

记 **TP / PP / SP 三种切法 + Selective Recompute** 这四件事：

1. **Tensor Parallel（TP）切矩阵乘法本身**：一个 `Y = X·W` 的 GEMM，把 W **沿列切** 给 N 张卡，每张卡算 `Y_i = X·W_i`，最后 `concat`。Transformer block 里 attention 的 `QKV` 投影用列并行、`output` 投影用行并行——这两步组合下来，**整个 block 只需 2 次 all-reduce**。这是 Megatron 论文（Shoeybi et al. 2019）最关键的设计。

2. **Pipeline Parallel（PP）把层切成段**：模型 80 层切成 8 段，每段一张卡，micro-batch 像流水线传 activations。**1F1B 调度**：每个 stage forward 一个 micro-batch 立刻 backward 一个，把 GPU 闲置时间（bubble）压到最低；**interleaved 1F1B** 进一步把每段再切成 v 个 chunk 交错，bubble 再降一档。

3. **Sequence Parallel（SP）切非 TP 区域**：LayerNorm / Dropout 这些不在 TP 切法里的算子，沿**序列维度**切给 N 张卡——同样的 N 卡，多省一份 activations 显存。论文：Korthikanti et al. 2022 *Reducing Activation Recomputation in Large Transformer Models*。

4. **Selective Activation Recomputation**：传统重算（gradient checkpointing）整层都重算，慢；Megatron 只重算便宜的算子（softmax 之前），贵的 GEMM 输出留下来——拿少量算力换大量显存。

合起来一句话：**Megatron 让"一个矩阵乘法"也能切到 8 张卡上同时算，是 100B+ 模型预训练唯一不可替代的那一维**。

## 实践案例

### 案例 1：3D 并行配置（TP=8, PP=4, DP=2，共 64 卡）

```bash
torchrun --nproc_per_node=8 --nnodes=8 pretrain_gpt.py \
  --tensor-model-parallel-size 8 \
  --pipeline-model-parallel-size 4 \
  --sequence-parallel \
  --recompute-activations --recompute-granularity selective
```

读法：每台机器 8 卡 NVLink 内做 TP（切矩阵），机器间分 4 段做 PP（切层），剩余维度自动变成 DP=2（切 batch）。`tp × pp × dp = 8 × 4 × 2 = 64 = world_size`，三个数字必须连乘等于总卡数，少一个都死锁。

### 案例 2：Megatron-DeepSpeed 合体训 530B

NVIDIA + Microsoft 合作训 Megatron-Turing NLG 530B：

- **TP=8** 用 Megatron 的（同机 NVLink 切矩阵）
- **PP=35** 用 DeepSpeed 的（跨机分 35 段）
- **DP/ZeRO=多副本** 用 [[deepspeed]] ZeRO-1（只切 optimizer states）

[[deepspeed]] 不擅长 TP（跨机通信瓶颈），Megatron 不擅长 ZeRO 切优化器状态——两家把各自最强的拼到一起，就是 Megatron-DeepSpeed 子项目。2240 张 A100 跑 3 个月，是 2022 年最大的稠密语言模型。

### 案例 3：Megatron-Core 被上层框架内嵌

NVIDIA 2023 年把核心算子抽成独立库 `megatron.core`：

```python
from megatron.core.transformer import TransformerLayer
from megatron.core.parallel_state import initialize_model_parallel

initialize_model_parallel(
    tensor_model_parallel_size=8,
    pipeline_model_parallel_size=4,
)
```

NeMo / TensorRT-LLM / 部分 HuggingFace 训练脚本直接 import 这层——它们要的不是整个 Megatron 训练框架，而是其中**那几个工程上调过最优的并行算子**（fused softmax / RMSNorm / RoPE TP 实现）。

### 案例 4：列并行 + 行并行的配对

Transformer block 里 attention 的两步投影是这样配的：

```python
# 列并行：W 沿 hidden 维切 N 份，每张卡算一片 QKV
qkv = ColumnParallelLinear(hidden, 3 * hidden)
# 行并行：W 沿输入维切 N 份，输出端 all-reduce 拼回
out = RowParallelLinear(hidden, hidden)
```

这一对的妙处：**中间不用通信**——列并行的输出本身就是行并行需要的"已切片"输入。整个 attention block 只需要一次 all-reduce（在 RowParallel 输出端），MLP 同理。这是 Megatron 论文最值得反复看的 1.5 页。

## 踩过的坑

1. **TP 不能跨机**：TP 每个 block 两次 all-reduce 通信量极大，必须在 NVLink 域内（同台机内）。把 `tp_size` 设成大于单机卡数会让训练慢 5-10 倍——这是和 [[deepspeed]] ZeRO 的关键区别（ZeRO 跨机通信更友好）。

2. **PP bubble 随 stage 数增长**：朴素 PP 的 bubble 比例是 `(p-1)/(m+p-1)`（p 是 stage 数，m 是 micro-batch 数）。stage 越多必须配越多 micro-batch，否则 GPU 闲置；这也是为什么 Megatron 引入 interleaved 1F1B 的原因。

3. **三个并行 size 配错就死锁**：`tp_size × pp_size × dp_size` 必须等于 `world_size`，且 `tp_size` 必须整除单机卡数。配错时 NCCL group 初始化卡死，没有清晰报错。

4. **代码强绑 NVIDIA GPU**：fused CUDA kernel 编进 wheel，AMD ROCm / Intel Habana 不直接可用。要换硬件得换框架（[[pytorch]] 原生 DTensor 或 JAX）。

5. **Activation memory 是 attention 的 O(s²)**：序列长度 8K 以上不开 selective recompute / SP 必爆显存——这是为什么所有长上下文训练脚本第一行就开这两个 flag。

## 适用 vs 不适用场景

**适用**：

- **百亿到万亿稠密 Transformer 预训练**——这是 Megatron 的本命场景
- 有同机 8 卡 NVLink + 跨机 InfiniBand 的高端集群
- 需要 TP 这一维（DP/PP 不够，必须切矩阵本身）
- 想看"工业级并行训练"标准实现的源码（论文落地最干净的一份）

**不适用**：

- 7B 以下微调 → 用 [[torchtune]] / [[accelerate]] 配 [[deepspeed]] ZeRO 即可，Megatron 配置成本高
- LoRA / QLoRA 等 PEFT 场景 → 单卡或 ZeRO-2 就够，TP 是杀鸡用牛刀
- 推理 → Megatron 不做推理，转 vLLM / TensorRT-LLM
- 非 NVIDIA 加速器 → 直接用 [[pytorch]] 原生 `DTensor` 或 JAX `pjit`

## 历史小故事（可跳过）

- **2019 年**：NVIDIA Mohammad Shoeybi 等人发表 *Megatron-LM* 论文（arXiv:1909.08053），第一次系统讲清楚 Transformer 内部矩阵怎么切——8 张 V100 训出 8.3B GPT-2，当时单模型最大。
- **2021 年**：Megatron-2 论文（Narayanan et al.）加入 PP 的 1F1B 调度和 interleaved 变体，3072 张 GPU 训 1T 模型概念验证。
- **2022 年**：Megatron-3 论文加入 SP 与 selective activation recompute；同年 Megatron-DeepSpeed 合体训出 530B Megatron-Turing NLG。
- **2023 年**：抽出 `megatron.core` 子库供 NeMo / TRT-LLM 复用；社区代码 fork 进 BLOOM-176B / LLaMA 训练 pipeline。
- **2024+**：FP8 训练 / Mixture-of-Experts 并行（ExpertParallel）/ context parallel 持续合入。

## 学到什么

1. **并行维度是几何，不是替代**：TP / PP / SP / DP 是四个**正交**轴，叠几个看场景；Megatron 的贡献是把 TP 这一维做成工业级
2. **通信模式决定可扩展边界**：TP 在 NVLink 内极快、跨机就崩；PP 跨机友好但有 bubble；DP/ZeRO 跨机最稳——硬件拓扑直接决定切法
3. **kernel 工程是真护城河**：论文讲了思路，但 fused softmax / RoPE / 通信-计算 overlap 这些细节才是 Megatron 真正难复制的部分
4. **核心库 vs 训练框架分层**：Megatron-Core 抽出来后，下游可以只借算子不借调度——这是基础设施成熟的标志

## 延伸阅读

- 原始论文：[Shoeybi et al. 2019 "Megatron-LM"](https://arxiv.org/abs/1909.08053)
- PP 论文：[Narayanan et al. 2021 "Efficient Large-Scale Language Model Training on GPU Clusters"](https://arxiv.org/abs/2104.04473)
- SP 论文：[Korthikanti et al. 2022 "Reducing Activation Recomputation in Large Transformer Models"](https://arxiv.org/abs/2205.05198)
- 官方仓库 README：[NVIDIA/Megatron-LM](https://github.com/NVIDIA/Megatron-LM)
- [[deepspeed]] —— 互补搭档，TP 借 Megatron / ZeRO 借 DeepSpeed
- [[pytorch]] —— Megatron 的算子底座

## 关联

- [[pytorch]] —— Megatron 跑在 PyTorch 之上；fused CUDA kernel 是对 PyTorch op 的特化
- [[deepspeed]] —— Megatron-DeepSpeed 合体方案，三维并行各取一家所长
- [[accelerate]] —— HuggingFace 薄壳，DP+ZeRO 这层能调；TP 这层目前不覆盖
- [[torchtune]] —— PyTorch 官方 LLM 微调库；7B-70B 微调它扛，100B+ 预训练交给 Megatron
- [[pytorch-lightning]] —— 训练循环抽象，并行维度上不及 Megatron 全
- [[jax]] —— Google 阵营对照组，用 `pjit` 表达并行，思路与 Megatron 殊途同归
