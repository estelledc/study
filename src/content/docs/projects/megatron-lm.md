---
title: 'Megatron-LM — NVIDIA 张量并行库'
来源: 'https://github.com/NVIDIA/Megatron-LM'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '高级'
---

## 是什么

Megatron-LM 是 NVIDIA 2019 年开源的**大模型并行训练参考实现**。它解决的核心问题：**一张 GPU 装不下、一台机器算不动的 Transformer，怎么把矩阵乘法本身切到 N 张卡上同时算**。日常类比：像做一道超大尺寸的鸡蛋卷——一张平底锅煎不开，请来 8 个厨师每人煎一条，最后沿同一条边粘起来就是完整的卷。

Megatron 教会业界三件事：怎么切矩阵（TP）、怎么切层（PP）、怎么切序列（SP）。最小用法：

```bash
torchrun --nproc_per_node=8 pretrain_gpt.py \
  --tensor-model-parallel-size 8 \
  --pipeline-model-parallel-size 1 \
  --num-layers 32 --hidden-size 4096
```

`--tensor-model-parallel-size 8` 就是招牌：把每个 attention/MLP 内部的大矩阵乘法切到 8 张 NVLink GPU 同时算。

## 为什么重要

不理解 Megatron-LM，下面这些事都没法解释：

- 为什么 GPT-3 / BLOOM / LLaMA 这类百亿到千亿模型的预训练代码长得很像 Megatron——它是事实参考实现
- 为什么 [[deepspeed]] 文档反复出现 “Megatron-DeepSpeed”——TP 这一维 DeepSpeed 没做，借的就是 Megatron
- 为什么 [[accelerate]] / [[torchtune]] 在 70B 以上量级开始吃力——它们没有 TP，矩阵切不开
- 为什么 NVIDIA NeMo / TensorRT-LLM 内核引用 `megatron.core`——核心算子被抽成独立子库复用

## 核心要点

记 **TP / PP / SP + Selective Recompute** 四件事：

1. **Tensor Parallel（TP）切矩阵乘法本身**。一个 `Y = X·W` 的 GEMM（通用矩阵乘，深度学习里最重的算子），把 W 沿列切给 N 张卡，每张算一片再拼回。attention 的 QKV 用列并行、output 用行并行，组合后整个 Transformer block 通常只需 2 次 all-reduce（所有卡把各自结果加总同步）。类比：8 个厨师各煎一条，最后沿边粘成整卷。

2. **Pipeline Parallel（PP）把层切成段**。80 层切成 8 段，micro-batch 像流水线传激活。**1F1B**（先 forward 一个小批次，立刻 backward 一个）压低 GPU 闲置（bubble）；interleaved 1F1B 再把每段切成更小 chunk 交错，闲置再降一档。

3. **Sequence Parallel（SP）切非 TP 区域**。LayerNorm / Dropout 这些不在 TP 切法里的算子，沿序列维切开，同样 N 卡再省一份激活显存。贵的 GEMM 输出可留下、便宜算子可重算（Selective Recompute），用少量算力换大量显存。

## 实践案例

### 案例 1：3D 并行配置（TP=8, PP=4, DP=2，共 64 卡）

```bash
torchrun --nproc_per_node=8 --nnodes=8 pretrain_gpt.py \
  --tensor-model-parallel-size 8 \
  --pipeline-model-parallel-size 4 \
  --sequence-parallel \
  --recompute-activations --recompute-granularity selective
```

**逐部分解释**：

- 每机 8 卡 NVLink 内做 TP（切矩阵），机器间 4 段做 PP（切层），剩余自动成 DP=2（切 batch）。
- `tp × pp × dp = 8 × 4 × 2 = 64 = world_size`，三个数连乘必须等于总卡数，少一个都会死锁。
- 工业上常和 [[deepspeed]] 拼：TP 用 Megatron，ZeRO 切优化器状态用 DeepSpeed（如 MT-NLG 530B）。

### 案例 2：Megatron-Core 被上层框架内嵌

```python
from megatron.core.transformer import TransformerLayer
from megatron.core.parallel_state import initialize_model_parallel

initialize_model_parallel(
    tensor_model_parallel_size=8,
    pipeline_model_parallel_size=4,
)
```

**逐部分解释**：

- 2023 年起核心算子抽成 `megatron.core`，NeMo / TensorRT-LLM 可只借算子不借整套训练框架。
- 它们要的是调过的并行实现（fused softmax / RMSNorm / RoPE TP），不是完整 `pretrain_gpt.py` 外壳。
- 这是“核心库 vs 训练框架”分层成熟的标志。

### 案例 3：列并行 + 行并行的配对

```python
# 列并行：W 沿 hidden 维切 N 份，每张卡算一片 QKV
qkv = ColumnParallelLinear(hidden, 3 * hidden)
# 行并行：W 沿输入维切 N 份，输出端 all-reduce 拼回
out = RowParallelLinear(hidden, hidden)
```

**逐部分解释**：

- 列并行的输出形状，正好是行并行需要的“已切片”输入，中间不用通信。
- 整个 attention 块通常只需一次 all-reduce（在 RowParallel 输出端）；MLP 同理，所以一个 block 约两次。
- 这是 Shoeybi et al. 2019 最值得反复看的设计页。

## 踩过的坑

1. **TP 不能跨机**：每个 block 两次 all-reduce 通信量极大，必须在 NVLink 域内；`tp_size` 大于单机卡数会慢一个数量级。
2. **PP bubble 随 stage 数增长**：朴素 PP 闲置比例约 `(p-1)/(m+p-1)`；stage 越多就要越多 micro-batch，否则 GPU 空转。
3. **三个并行 size 配错就死锁**：`tp × pp × dp` 必须等于 `world_size`，且 `tp` 必须整除单机卡数；配错时 NCCL 初始化常无清晰报错。
4. **长序列显存是 O(s²)**：序列 8K 以上不开 selective recompute / SP 易爆显存；且代码强绑 NVIDIA fused kernel，换加速器要换框架。

## 适用 vs 不适用场景

**适用**：

- 百亿到万亿稠密 Transformer 预训练
- 有同机 8 卡 NVLink + 跨机 InfiniBand 的高端集群
- 必须切矩阵本身（只靠 DP/PP 不够）
- 想读工业级并行训练的标准实现源码

**不适用**：

- 7B 以下微调 → [[torchtune]] / [[accelerate]] + [[deepspeed]] ZeRO 更省事
- LoRA / QLoRA 等 PEFT → 单卡或 ZeRO-2 即可，TP 过重
- 推理 → 转 vLLM / TensorRT-LLM
- 非 NVIDIA 加速器 → [[pytorch]] `DTensor` 或 JAX `pjit`

## 历史小故事（可跳过）

- **2019 年**：Shoeybi 等发表 Megatron-LM（arXiv:1909.08053），8×V100 训出 8.3B GPT-2。
- **2021 年**：Narayanan 等加入 1F1B / interleaved PP，做 1T 模型概念验证。
- **2022 年**：Korthikanti 等加入 SP 与 selective recompute；Megatron-DeepSpeed 训出 530B MT-NLG。
- **2023 年**：抽出 `megatron.core`；社区 fork 进入 BLOOM / LLaMA 训练流水线。
- **2024+**：FP8、Expert Parallel、context parallel 持续合入。

## 学到什么

1. **并行维度是几何，不是替代**：TP / PP / SP / DP 是正交轴，叠几个看场景；Megatron 把 TP 做成工业级。
2. **通信模式决定可扩展边界**：TP 在 NVLink 内极快、跨机就崩；PP 跨机友好但有 bubble；DP/ZeRO 跨机最稳。
3. **kernel 工程是护城河**：fused softmax / RoPE / 通信-计算 overlap 比论文思路更难复制。
4. **核心库 vs 训练框架分层**：下游可以只借算子不借调度。

## 延伸阅读

- 原始论文：[Shoeybi et al. 2019](https://arxiv.org/abs/1909.08053)
- PP 论文：[Narayanan et al. 2021](https://arxiv.org/abs/2104.04473)
- SP 论文：[Korthikanti et al. 2022](https://arxiv.org/abs/2205.05198)
- 官方仓库：[NVIDIA/Megatron-LM](https://github.com/NVIDIA/Megatron-LM)
- [[deepspeed]] —— 互补搭档：TP 借 Megatron / ZeRO 借 DeepSpeed
- [[pytorch]] —— Megatron 的算子底座

## 关联

- [[pytorch]] —— Megatron 跑在 PyTorch 之上；fused CUDA kernel 是特化
- [[deepspeed]] —— Megatron-DeepSpeed 合体，三维并行各取所长
- [[accelerate]] —— HuggingFace 薄壳，DP+ZeRO 能调；TP 不覆盖
- [[torchtune]] —— 7B-70B 微调它扛，100B+ 预训练交给 Megatron
- [[pytorch-lightning]] —— 训练循环抽象，并行维度不及 Megatron
- [[jax]] —— 用 `pjit` 表达并行，思路殊途同归

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[colossal-ai]] —— Colossal-AI — 大模型训练系统
