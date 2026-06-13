---
title: ZeRO++ — 巨型模型训练中的极致高效集合通信
来源: https://arxiv.org/abs/2306.10209
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 从日常类比开始：分布式拼乐高 vs 快递费

想象你和 512 个同学要一起拼一座**巨型乐高城堡**（训练 100B+ 参数的大模型）：

- 每人只保管城堡的一小块零件（**ZeRO-3 参数分片**），需要某层积木时，全班**临时凑齐**那一层再开工（**all-gather 权重**）。
- 每层拼完，大家还要把「哪里拼错了」汇总成一份修正清单（**reduce-scatter 梯度**）。

在**同教室**（单节点 NVLink）里，喊一嗓子就能传积木——很快。  
一旦同学分散在**不同城市**（跨节点 InfiniBand / 以太网），每次凑积木都要发**整层 FP16 权重**的快递——带宽一窄，或每人 batch 很小（算得慢、等快递久），训练吞吐立刻被通信拖死。

Microsoft DeepSpeed 团队在 ICLR 2024 发表的 **ZeRO++**（[arXiv:2306.10209](https://arxiv.org/abs/2306.10209)）做的事，相当于给这套协作流程加了三条「省钱快递规则」：

1. **qwZ**：寄积木前压成 INT8 包裹（体积减半），到岸再解压。
2. **hpZ**：每个城市留一份「次级副本」，反向传播时**只在同城凑积木**，不再跨城。
3. **qgZ**：梯度汇总改用 INT4 + all-to-all，**先同城合并再跨城**，且**还原精度后再做加法**，避免低精度累加误差。

三者叠加，跨节点通信量从 **3M 降到 0.75M**（M = 模型参数量），384 GPU 上最高约 **2.16×** 吞吐；10B–138B 模型上相对 vanilla ZeRO 最高约 **2.4×**。

一句话：**ZeRO++ 不是换优化器，而是给 ZeRO-3 的三次集体通信（前向 gather、反向 gather、梯度 scatter）分别「减肥」。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 全称 | ZeRO++: Extremely Efficient Collective Communication for Giant Model Training |
| 机构 | Microsoft（DeepSpeed） |
| 会议 | ICLR 2024 |
| 代码 | [DeepSpeed](https://github.com/deepspeedai/DeepSpeed) — `zero_quantized_weights` / `zero_hpz_partition_size` / `zero_quantized_gradients` |
| 前置 | 必须基于 **ZeRO Stage 3**（参数分片 + 按需 all-gather） |
| 论文 PDF | [2306.10209](https://arxiv.org/pdf/2306.10209.pdf) |

ZeRO++ 是 **通信优化层**，与 [[flash-attention]]、[[liger-kernel-llm-training]] 等算子优化正交——后者减单卡计算/显存，ZeRO++ 减**多卡之间的 bytes**。

---

## 为什么重要

### 1. ZeRO-3 的隐藏税：每步 3M 通信

在 ZeRO-3 下，每个训练 step 典型有三笔「全网级」集体通信（参数量 M）：

| 阶段 | 集体操作 | 通信量 |
|------|----------|--------|
| 前向 | 权重 all-gather | M（FP16） |
| 反向 | 权重 all-gather | M（FP16） |
| 反向末 | 梯度 reduce-scatter | M（FP16） |
| **合计** | | **3M** |

当 **跨节点带宽低**（云厂商常见 100–400 Gbps IB）或 **每 GPU batch 小**（大模型 + 长上下文 + 多并行维）时，GPU 大量时间在等网络，有效 TFLOPS/GPU 断崖式下跌——论文 Figure 1 在 384 GPU、512 token/GPU 时，带宽从 800Gbps 降到 100Gbps，吞吐可从 ~61 掉到 ~16 TFLOPS/GPU。

### 2. 低带宽集群 ≈ 高带宽集群的「平价替代」

论文实验表明：在 4× 更高带宽集群上跑 baseline ZeRO 的吞吐，ZeRO++ 在**低带宽**设置下也能接近——对预算有限、跨 AZ 训练的团队，这是直接的 TCO 杠杆。

### 3. 零（或极少）改用户训练代码

DeepSpeed 官方教程强调：**用户模型代码不用改**，只需 JSON 配置打开三个开关；与 Megatron-DeepSpeed、Hugging Face + DeepSpeed 集成路径兼容。

---

## 先懂 ZeRO-3：ZeRO++ 改的是哪三次快递

```text
ZeRO-3 单 step 通信骨架（简化）

Forward:
  对每一层 → all-gather 该层权重分片 → 本地算 forward → 释放非本地权重

Backward:
  对每一层 → all-gather 该层权重 → 本地算 backward → 本地梯度
  最后     → reduce-scatter 聚合梯度到各 rank 的分片

ZeRO++ 分别动刀：
  qwZ  → 前向 all-gather 传 INT8
  hpZ  → 反向 all-gather 限制在节点内
  qgZ  → 梯度 reduce-scatter 换成 INT4 all-to-all + 高精度归约
```

ZeRO 把 optimizer states、梯度、参数都分片，消除数据并行里的冗余副本；ZeRO-3 进一步**连参数也分片**，于是每层计算前必须 gather 完整权重——这是通信量的根源。

---

## 核心概念

### 1. qwZ — Quantized Weight Communication

**问题**：前向 all-gather 要传完整 FP16 权重，占 M 中的 1M。

**做法**：

- 发送前：按 **block** 做对称 INT8 量化（每块独立 scale，类似分块量化 [Dettmers LLM.int8()]）。
- 接收后：dequant 回 FP16，再算 matmul。
- 通信量：**M → 0.5M**（50% 减少）。

**为什么不能全局一把量化？** 权重动态范围大，整块量化误差高；分块后 BERT 案例量化误差约降 **3×**。论文还自研了高性能 quant/dequant CUDA kernel，并与 all-gather **流水线重叠**，避免「省带宽但算量化太慢」。

分块对称 INT8 量化的核心公式（每块独立 scale `s`）：

```python
import torch

def block_quantize_fp16_to_int8(w: torch.Tensor, block_size: int = 128):
    """教学用伪代码：理解 qwZ 为何按块量化而非整 tensor 一把梭。"""
    assert w.dtype == torch.float16
    n = w.numel()
    pad = (-n) % block_size
    if pad:
        w = torch.nn.functional.pad(w.flatten(), (0, pad))
    blocks = w.view(-1, block_size)
    # 对称量化：scale = max(|block|) / 127
    scale = blocks.abs().amax(dim=1, keepdim=True).clamp(min=1e-8) / 127.0
    q = torch.round(blocks / scale).clamp(-127, 127).to(torch.int8)
    return q, scale  # 接收端: w_hat = q.float() * scale
```

发送端传 `(q, scale)` 的紧凑表示，接收端 dequant 回 FP16 再参与 matmul——**通信传 INT8，计算仍用 FP16**。

### 2. hpZ — Hierarchical Partitioning ZeRO

**问题**：反向 pass  again all-gather 权重，又跨节点传 M。

**做法 — 双副本分区**：

- **Primary partition**：与 ZeRO-3 相同，权重分片到**全部** GPU（world size P）。
- **Secondary partition**：在每个**节点内**再分片一份 FP16 权重副本（secondary group size = 每节点 GPU 数，如 8）。

**时间线**：

1. **Forward**：仍按 primary 做**跨节点** all-gather。
2. Forward 用完该层权重后，按 **secondary** 重新分片存放。
3. **Backward**：只需在**节点内** all-gather secondary 副本 → **跨节点通信 = 0**。
4. **Optimizer step**：仍按 primary 分片更新主副本。

**代价**：显存上升。100B 模型、1024 GPU、secondary=16 GPU/组时，hpZ 比 ZeRO-3 多用约 **8.9×** 参数相关内存，但仍比标准 DP 全复制少 **114×**（论文 Figure 4）。

配置项 `zero_hpz_partition_size`：secondary 组大小；设为**每节点 GPU 数**为典型值；=1 表示关闭 hpZ。

### 3. qgZ — Quantized Gradient Communication

**问题**：直接对 reduce-scatter 做 INT4/INT8 **低精度归约**会累积误差，损害收敛。

**做法 — all-to-all 范式**：

1. 各 rank 对本地梯度做 **block INT4 量化**。
2. **all-to-all** 交换量化块（可 hierarchical：先节点内再节点间）。
3. 接收方 **dequant 回 FP16**，再做 **高精度 sum**。
4. 必要时 **tensor slice reorder** 修正 all-to-all 带来的梯度错位（论文 Figure 9）。

**效果**：跨节点梯度通信 **M → 0.25M**（INT4 相对 FP16 约 4× 压缩）。相对 ring reduce-scatter，1-hop all-to-all 延迟更低；并与 intra/inter-node 通信 **pipeline + kernel fusion**。

### 4. 三者合计：4× 跨节点通信

| 通信点 | Baseline ZeRO-3 | ZeRO++ |
|--------|-------------------|--------|
| 前向权重 gather | M | **0.5M**（qwZ） |
| 反向权重 gather | M | **0**（hpZ，节点内） |
| 梯度 scatter | M | **0.25M**（qgZ，跨节点部分） |
| **跨节点合计** | **3M** | **0.75M** |

注意：三项收益**不完全线性相加**（论文消融说明存在 overlap 与 pipeline 交互），但方向一致。

---

## 代码示例 1：DeepSpeed JSON 开启 ZeRO++

ZeRO++ 扩展 ZeRO-3，三个布尔/整数开关可独立或组合启用：

```json
{
  "train_batch_size": 512,
  "train_micro_batch_size_per_gpu": 1,
  "gradient_accumulation_steps": 32,
  "fp16": {
    "enabled": true
  },
  "zero_optimization": {
    "stage": 3,
    "reduce_bucket_size": 10000000,
    "reduce_scatter": true,
    "contiguous_gradients": true,
    "overlap_comm": true,

    "zero_quantized_weights": true,
    "zero_hpz_partition_size": 8,
    "zero_quantized_gradients": true
  }
}
```

| 字段 | 含义 | 推荐 |
|------|------|------|
| `zero_quantized_weights` | 启用 qwZ（INT8 权重 all-gather） | 跨节点带宽紧张时 `true` |
| `zero_hpz_partition_size` | hpZ secondary 组大小；1=关闭 | 设为**每节点 GPU 数**（如 DGX 8 卡 → 8） |
| `zero_quantized_gradients` | 启用 qgZ（INT4 梯度 all-to-all） | 大模型 + 多节点时 `true` |

Megatron-DeepSpeed 启动示例（摘自官方 zeropp 教程）：

```bash
deepspeed pretrain_gpt.py \
  --tensor-model-parallel-size 1 \
  --pipeline-model-parallel-size 1 \
  --num-layers 40 \
  --hidden-size 6144 \
  --seq-length 512 \
  --num-attention-heads 32 \
  --micro-batch-size 1 \
  --zero-stage 3 \
  --deepspeed_config ds_zeropp_config.json \
  --deepspeed-activation-checkpointing \
  --fp16
```

---

## 代码示例 2：Hugging Face Trainer + DeepSpeed 集成

若用 Transformers，通常把 ZeRO++ 写进 DeepSpeed config，由 `TrainingArguments(deepspeed=...)` 加载：

```python
# ds_zero_pp.json 内容同示例 1
from transformers import AutoModelForCausalLM, TrainingArguments, Trainer

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")

training_args = TrainingArguments(
    output_dir="./out",
    per_device_train_batch_size=1,
    gradient_accumulation_steps=16,
    bf16=True,
    deepspeed="ds_zero_pp.json",
    logging_steps=10,
)

trainer = Trainer(model=model, args=training_args, train_dataset=dataset)
trainer.train()
```

**实践提示**：

- ZeRO++ **仅 Stage 3**；Stage 1/2 无参数分片 all-gather，开关无效。
- hpZ 增显存：7B 模型通常可接受；100B+ 需结合 **activation checkpointing**、**offload** 或减小 secondary 组评估 OOM。
- 与 **TP/PP** 混用时，以 DeepSpeed 文档为准确认 data parallel group 与 hpZ 组对齐。

---

## 代码示例 3：用伪代码理解 hpZ 的「双分区」

下面不是 DeepSpeed 源码，而是帮助理解 **forward 用 primary、backward 用 secondary** 的逻辑：

```python
def forward_layer(layer_id, x, primary_group, secondary_group):
    # 跨所有 rank gather（可能跨节点）
    W_full = all_gather_shard(local_W_shard, group=primary_group)
    y = matmul(x, W_full)
    # 用完后按节点内 secondary 组分片存回去
    W_secondary_shard = repartition(W_full, group=secondary_group)
    free(W_full)
    return y, W_secondary_shard


def backward_layer(x, grad_y, W_secondary_shard, secondary_group):
    # 只在节点内 gather，无跨节点权重流量
    W_full = all_gather_shard(W_secondary_shard, group=secondary_group)
    grad_W = backward_matmul(x, grad_y, W_full)
    return grad_W
```

这正是 hpZ「**用内存买跨节点带宽**」的精髓：多存一份节点内 FP16 分片，换掉反向 pass 里最贵的那次跨机 all-gather。

---

## 实验结论（论文摘要）

| 场景 | 结果 |
|------|------|
| 规模 | 最高 **384 GPU**，GPT 类模型 |
| 吞吐 | 小 batch 下仍可达峰值算力 **45%+**；相对 ZeRO 最高 **~2.4×**（10B–138B） |
| 384 GPU 全开启 | **2.165×**（hpZ + qwZ + qgZ） |
| RLHF 训练 | 相对 vanilla ZeRO 最高约 **3.3×**（通信更敏感的对齐阶段） |
| 收敛 | 预训练 13B（8/6-bit gather）、微调 30B（4/2-bit gather）与标准 ZeRO **精度持平** |
| 推理副产品 | 训练结束权重已是低比特分块量化形态，可**跳过 PTQ/QAT** 直接用于推理 |
| 对比 MiCS | hpZ 与 MiCS 等 hierarchical ZeRO 思路相近，ZeRO++ 在 DeepSpeed 栈内一体化 |

论文还消融了仅开 qwZ、仅开 hpZ、仅开 qgZ 的组合，便于按集群拓扑「按需点菜」。

---

## 何时用 / 何时慎用

**适合**：

- 多节点训练，**跨节点带宽**明显低于 NVLink。
- 大模型导致 **micro-batch 很小**，计算/通信比差。
- 已用 ZeRO-3，profiler 显示 **all-gather / reduce-scatter** 占比高。

**慎用 / 需测**：

- **单节点**多卡：hpZ 跨节点收益为 0，qwZ/qgZ 仍有但增益变小。
- **显存极度紧张**：hpZ secondary 副本可能触发 OOM——先 profiling 内存。
- 与某些 **自定义通信 hook** 或旧版 DeepSpeed 混用：需查 release note。

---

## 与相关工作的关系

| 方向 | 代表 | 与 ZeRO++ 关系 |
|------|------|----------------|
| 参数分片 | ZeRO / ZeRO-3 | ZeRO++ 直接扩展 |
| 分层通信 | MiCS | hpZ 同类 hierarchical partition 思想 |
| 梯度压缩 | PowerSGD、1-bit Adam | qgZ 强调 **dequant 后再归约**，避免低精度 sum |
| 算子融合 | [[liger-kernel-llm-training]]、[[flashattention-2]] | 互补：减单卡 work，ZeRO++ 减多卡 bytes |
| 3D 并行 | Megatron TP/PP/DP | 可叠加；通信瓶颈仍在 DP/ZeRO 侧 |

---

## 自测题

1. ZeRO-3 一步训练里，哪三次集体通信贡献了 **3M** 通信量？ZeRO++ 分别怎么压？
2. 为什么 qgZ 不能简单做 **INT4 reduce-scatter**，而要用 all-to-all + 高精度归约？
3. `zero_hpz_partition_size=8` 在一台 8 卡机器上意味着什么？若设为 1 呢？
4. hpZ 的 secondary 副本存在哪个粒度（节点内 / 全局）？Optimizer 更新跟哪套分片走？

<details>
<summary>参考答案</summary>

1. 前向权重 all-gather（M）、反向权重 all-gather（M）、梯度 reduce-scatter（M）。qwZ 把前向压到 0.5M；hpZ 把反向跨节点压到 0；qgZ 把梯度跨节点压到约 0.25M。
2. 低精度直接累加会放大量化误差，损害收敛；qgZ 先传 INT4，接收后 dequant 到 FP16 再 sum。
3. =8 表示 secondary 组含 8 GPU，通常即整节点，反向权重 gather 不跨节点；=1 关闭 hpZ，行为退回 ZeRO-3。
4. Secondary 在**节点内**（或可配置子组）分片；optimizer step 更新 **primary** 全局分片。

</details>

---

## 延伸阅读

- DeepSpeed ZeRO 教程：[ZeRO](https://www.deepspeed.ai/tutorials/zero/)
- DeepSpeed ZeRO++ 教程：[zeropp.md](https://github.com/deepspeedai/DeepSpeed/blob/master/docs/_tutorials/zeropp.md)
- 微软研究院博文：[DeepSpeed ZeRO++ — 4× less communication](https://www.microsoft.com/en-us/research/blog/deepspeed-zero-a-leap-in-speed-for-llm-and-chat-model-training-with-4x-less-communication/)
- 原始论文：[arXiv:2306.10209](https://arxiv.org/abs/2306.10209)
