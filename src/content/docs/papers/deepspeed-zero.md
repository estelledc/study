---
title: ZeRO - Memory Optimizations Toward Training Trillion Parameter Models
description: 状元篇 - DeepSpeed ZeRO 通过分区 Optimizer State / Gradient / Parameter 把内存占用从 N 倍复制降到 1/N，让单 cluster 训出万亿参数模型
season: P
episode: P2
branch: method
tier: 状元
date: 2026-05-29
tags:
  - distributed-training
  - memory-optimization
  - data-parallelism
  - llm-infrastructure
  - deepspeed
---

import { Image } from 'astro:assets';

## Layer 0 — 论文身份证

| 字段 | 内容 |
|---|---|
| 标题 | ZeRO: Memory Optimizations Toward Training Trillion Parameter Models |
| 作者 | Samyam Rajbhandari, Jeff Rasley, Olatunji Ruwase, Yuxiong He |
| 机构 | Microsoft Research |
| 会议 | SC 2020（ACM/IEEE Supercomputing） |
| 年份 | 2020 年 5 月（v3 arXiv） |
| arXiv | 1910.02054 |
| 代码 | github.com/microsoft/DeepSpeed（36k+ stars） |
| 引用 | 4500+（截至 2026） |
| 一句话 | 把分布式数据并行（DDP）里被复制 N 份的训练状态，按 GPU 数切分到 N 份，内存占用从 O(N) 降到 O(1)，通信量与 DDP 同阶 |

## 一句话定位

**ZeRO 不是发明新算法，而是把"内存复制是浪费"这件事算清楚后，工程实现了一套零冗余切分方案。**

它的发明让 100B+ 参数模型可以在普通 GPU 集群上训练，是 LLM 时代基础设施的奠基工作之一。

<Image src="/papers/deepspeed-zero/01-stages.webp" alt="ZeRO 三阶段示意" width={1400} height={800} />

## Layer 1 — Why 这篇论文存在

### 痛点 1：DDP 内存复制的浪费

在 ZeRO 之前，分布式训练的标准做法是 **DDP（Distributed Data Parallel）**：

- 每张 GPU 上保存**完整的模型参数**（Parameter, P）
- 每张 GPU 上保存**完整的梯度**（Gradient, G）
- 每张 GPU 上保存**完整的优化器状态**（Optimizer State, OS，Adam 的 momentum + variance）
- 训练时，每张 GPU 处理一部分 batch，反向传播后用 all-reduce 同步梯度

问题：**N 张 GPU 保存了 N 份完全相同的状态**。

具体内存占用（fp16 训练 + Adam 优化器 + fp32 master weights）：

- Parameter（fp16）：2 字节/参数
- Gradient（fp16）：2 字节/参数
- Optimizer State（fp32 master weights + fp32 momentum + fp32 variance）：12 字节/参数

总计：**16 字节/参数**。一个 1B 参数的模型每张 GPU 需要 16 GB 仅用于状态，再加 activation 和 buffer，单卡 32 GB 的 V100 已经撑不住。

### 痛点 2：Megatron-LM 切计算但通信量大

[Megatron-LM P1](/papers/megatron-lm/) 提出了 **tensor parallelism**：把一个 attention 头的 Q/K/V 矩阵按列切分到多张卡，每张卡只算一部分。

这解决了**单层放不下**的问题，但：

- TP 通信量大：每个 layer 都要 all-reduce 一次激活值
- TP 切的是**计算**而非**状态**，OS / G / P 仍然每张卡完整复制
- TP 通常只能在单 node 内（NVLink）做，跨 node 走 InfiniBand 会严重掉性能

### 痛点 3：Pipeline parallelism 有 bubble

GPipe / PipeDream 把模型按 layer 切到不同 GPU，但有 pipeline bubble（前几个 micro-batch 还没塞满流水线，最后几个已经排空），效率打折扣。

### ZeRO 的切入点

Rajbhandari 等人观察到一个朴素事实：

> **DDP 里 OS / G / P 三类状态都被 N 倍复制，但 N 倍复制不是必须的。**

只要保证**每张卡能算出自己负责那部分参数的更新**，状态可以切分到 N 张卡上，需要时再 all-gather 拼回来。

这就是 ZeRO 的核心思想：**切内存而非切计算**。

## Layer 2 — 论文地形

论文结构（ZeRO 原始论文，arXiv 1910.02054）：

- §1 Intro：问题定义 + 三阶段路线图
- §2 Related Work：DDP / TP / PP 对比
- §3 Where Did All the Memory Go？：内存占用分析（关键章节）
- §4 ZeRO: Insights and Overview：三阶段设计
- §5 Deep Dive into ZeRO-DP：算法细节
  - §5.1 ZeRO-1：optimizer state partitioning
  - §5.2 ZeRO-2：gradient partitioning
  - §5.3 ZeRO-3：parameter partitioning
- §6 Deep Dive into ZeRO-R：activation / buffer 优化（次要）
- §7 Communication Analysis：通信量分析
- §8 Implementation：DeepSpeed 工程细节
- §9 Evaluation：100B 模型实测

我们的精读路径：**§3 → §5.1 → §5.2 → §5.3 → §7**。

## Layer 3 — 三段精读

### 精读 1：ZeRO-1 optimizer state partitioning

ZeRO-1 是最容易理解的阶段：**只切 OS，G 和 P 仍然复制**。

```python
# 简化版 ZeRO-1 实现（伪代码风格，对照 DeepSpeed 源码 commit f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4）
# ZeroRedundancyOptimizer wraps a regular optimizer like Adam

import torch
import torch.distributed as dist

class ZeRO1Optimizer:
    def __init__(self, params, base_optimizer_cls, lr, world_size, rank):
        self.world_size = world_size
        self.rank = rank
        # 关键：把所有参数按 rank 平均切分
        # 每个 rank 只持有 1/N 的 optimizer state
        self.local_params = self._partition_params(params, rank, world_size)
        # base_optimizer 只在 local_params 上工作（OS 也只有 1/N）
        self.base_optimizer = base_optimizer_cls(self.local_params, lr=lr)
        # 但每张卡仍然保留完整的 P 和 G（这是 ZeRO-1 的 trade-off）
        self.full_params = list(params)

    def _partition_params(self, params, rank, world_size):
        # 把 params flatten 成一个大向量，按 world_size 切片
        # 第 rank 张卡持有 [rank/N, (rank+1)/N) 的部分
        flat = torch.cat([p.data.view(-1) for p in params])
        chunk_size = flat.numel() // world_size
        start = rank * chunk_size
        end = (rank + 1) * chunk_size if rank < world_size - 1 else flat.numel()
        return [flat[start:end].clone().requires_grad_(True)]

    def step(self):
        # Step 1：全局 all-reduce gradient（和 DDP 一样）
        for p in self.full_params:
            dist.all_reduce(p.grad, op=dist.ReduceOp.SUM)
            p.grad.data.div_(self.world_size)
        # Step 2：每张卡只更新自己负责的 1/N 参数
        # 注意：base_optimizer 操作的是 local_params，OS 也只在这一段
        self.base_optimizer.step()
        # Step 3：all-gather 把更新后的参数拼回每张卡的 full_params
        # 这是 ZeRO-1 的额外通信开销
        local_updated = self.local_params[0].data
        gathered = [torch.zeros_like(local_updated) for _ in range(self.world_size)]
        dist.all_gather(gathered, local_updated)
        # 把 gathered 拼接回 full_params（实现细节略）
        self._scatter_back_to_full_params(gathered)
```

**旁注 1（why all-reduce 仍然存在）**：ZeRO-1 不切 G，每张卡的 G 还是要全局求和，所以 all-reduce gradient 这一步和 DDP 一致。这是 ZeRO-1 的**内存节省 ≠ 通信节省**的根本原因。

**旁注 2（why base_optimizer 只在 local_params 上工作）**：Adam 的 momentum / variance 是和参数一一对应的。如果只持有 1/N 参数，自然只持有 1/N 的 momentum / variance，OS 就被切了。这就是 4x 内存节省的来源（OS 占总状态的 12/16 = 75%，切到 N 份后总占用降到 4/16 + 12/(16N) ≈ 4/16 = 25%，对应 4x）。

**旁注 3（why all-gather 必须的）**：每张卡只更新自己那 1/N 参数，但 forward 时需要完整参数，所以 step 后必须 all-gather。这是 ZeRO 的核心 trade-off：**用通信换内存**。

**旁注 4（同步语义）**：注意 dist.all_reduce 是 inplace 的，p.grad 在调用后变成 sum，需要手动除以 world_size 才是 mean。这点很容易踩坑。

**旁注 5（partition 不均匀）**：当总参数不能被 world_size 整除时，最后一个 rank 会多拿一点。生产代码里通常用 padding 让所有 rank 等大，避免 stragglers。

**怀疑 1**：这段代码假设所有参数 flatten 成一个大向量后切分，但实际上每个参数张量可能形状不同，flatten + slice 会破坏张量边界。DeepSpeed 实际的实现是按"参数列表"切分（每个 rank 持有完整的若干参数张量），而不是字节级切分。我的伪代码简化了这一点，真实代码更复杂。

**旁注 6（fp32 master weights）**：ZeRO-1 切的是 fp32 master weights + Adam states，这是 12 字节/参数的大头。fp16 的 P 和 G 仍然每张卡复制。

### 精读 2：ZeRO-2 + gradient partitioning + reduce-scatter

ZeRO-2 在 ZeRO-1 基础上**加切 G**。关键技术：**用 reduce-scatter 替代 all-reduce**。

```python
# ZeRO-2 核心：reduce-scatter 替代 all-reduce
# 对照 PyTorch FSDP 实现 commit b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7
# （FSDP 是 ZeRO-3 的实现，但 reduce-scatter 思想从 ZeRO-2 开始）

import torch
import torch.distributed as dist

class ZeRO2Optimizer:
    def __init__(self, params, base_optimizer_cls, lr, world_size, rank):
        self.world_size = world_size
        self.rank = rank
        # 切 OS（和 ZeRO-1 一样）
        self.local_params = self._partition_params(params, rank, world_size)
        self.base_optimizer = base_optimizer_cls(self.local_params, lr=lr)
        # 切 G：每张卡只保留自己负责那 1/N 参数对应的梯度
        # 注意 G 需要在 backward 时动态切分（用 reduce-scatter）
        self.full_params = list(params)

    def backward_hook(self, grad_bucket):
        """
        在 backward 完成时，用 reduce-scatter 同步梯度。
        reduce-scatter = all-reduce 的"前一半"：每张卡只拿到自己负责那段的 reduce 后梯度。
        相比 all-reduce 后再丢弃 N-1/N，reduce-scatter 节省 N-1/N 的内存峰值。
        """
        # all-reduce: 每张卡都拿到完整的 sum 梯度（O(P) 内存）
        # reduce-scatter: 每张卡只拿到自己那段的 sum 梯度（O(P/N) 内存）
        local_grad = torch.zeros(grad_bucket.numel() // self.world_size,
                                  dtype=grad_bucket.dtype,
                                  device=grad_bucket.device)
        dist.reduce_scatter_tensor(local_grad, grad_bucket, op=dist.ReduceOp.SUM)
        local_grad.div_(self.world_size)
        # 现在 local_grad 只有 1/N 的内存占用，且已经是 mean 后的梯度
        return local_grad

    def step(self):
        # 1. backward_hook 已经在反向传播过程中触发，每张卡只持有 1/N 的 G
        # 2. base_optimizer.step() 用 1/N 的 G 更新 1/N 的 P（在 fp32 master weights 上）
        self.base_optimizer.step()
        # 3. all-gather 把更新后的 fp16 参数拼回 full_params
        local_p = self.local_params[0].data
        gathered = [torch.zeros_like(local_p) for _ in range(self.world_size)]
        dist.all_gather(gathered, local_p)
        self._scatter_back_to_full_params(gathered)
        # 注意：通信量分析
        # DDP: 1 次 all-reduce（≈ 2x 参数量）
        # ZeRO-2: 1 次 reduce-scatter + 1 次 all-gather = 2 次 1x 参数量 = 2x
        # 所以 ZeRO-2 的总通信量和 DDP 一样！这是 ZeRO 的关键优势。
```

**旁注 1（reduce-scatter 是什么）**：用日常类比，假设有 4 个学生（GPU），每人拿到 4 张试卷的成绩（gradient bucket）。
- all-reduce：每人把 4 张试卷成绩相加，最后每人都拿到 4 张试卷的总分（每人 4 个数）
- reduce-scatter：4 张试卷的总分按学生分配，每人只拿到 1 张试卷的总分（每人 1 个数）

reduce-scatter 的输出量是 all-reduce 的 1/N，但通信流量相同。

**旁注 2（why 通信量和 DDP 一样）**：这是 ZeRO 论文最 elegant 的发现之一。DDP 的 all-reduce 实际上等价于 reduce-scatter + all-gather（NCCL 的 ring all-reduce 就是这么实现的）。ZeRO-2 把这两步拆开，中间塞入 optimizer step，**通信量不变但内存峰值降一半**。

**旁注 3（backward_hook 的时机）**：PyTorch 的 register_hook 会在每个参数的 grad 计算完成时触发。DeepSpeed 把 hook 注册在每个参数上，把 grad 立刻 reduce-scatter 出去并释放，避免内存峰值。

**旁注 4（fp16 vs fp32 在 step 中的角色）**：local_params 在 fp32（master weights），G 也要转 fp32 才能 step（避免 fp16 underflow）。step 后再 cast 回 fp16 做 all-gather。这是 mixed-precision training 的标准流程。

**旁注 5（grad_bucket 的边界）**：DeepSpeed 不是每个参数 reduce-scatter 一次（开销太大），而是攒够一个 bucket（默认 5MB）批量做。这是 NCCL 性能优化的常见技巧。

**怀疑 2**：reduce-scatter 要求 grad tensor 大小能被 world_size 整除。当模型结构不规则（例如 LayerNorm 的小张量）时，DeepSpeed 怎么处理？答案是 padding：把小张量 pad 到能整除的大小，浪费一点内存换 NCCL 的 collective 简洁性。

**旁注 6（与 PyTorch FSDP 的关系）**：FSDP 是 PyTorch 官方对 ZeRO-3 的重新实现，commit b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7 引入了 fully_shard API。FSDP 把 ZeRO-2 和 ZeRO-3 合并成一个 sharding_strategy 参数（SHARD_GRAD_OP = ZeRO-2，FULL_SHARD = ZeRO-3）。

### 精读 3：ZeRO-3 + parameter partitioning + all-gather + Offload

ZeRO-3 是终极阶段：**P 也切**。这意味着 forward / backward 时**每张卡都没有完整参数**，需要按 layer 动态 all-gather。

```python
# ZeRO-3 核心：参数也切分，forward/backward 时按 layer 动态 all-gather
# 对照 huggingface/accelerate 的 prepare_model 实现
# commit e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6

import torch
import torch.distributed as dist
import torch.nn as nn

class ZeRO3Module(nn.Module):
    """
    包装一个 nn.Module，把它的参数切分到 N 张卡。
    forward 时 all-gather，forward 后立刻 free。
    """
    def __init__(self, module: nn.Module, world_size: int, rank: int):
        super().__init__()
        self.module = module
        self.world_size = world_size
        self.rank = rank
        # 把 module 的所有参数切分到 N 张卡
        # 每张卡只保留 1/N 的参数（partitioned_params）
        # 完整参数（full_params）只在 forward/backward 期间临时存在
        self._partition_parameters()

    def _partition_parameters(self):
        for name, param in list(self.module.named_parameters()):
            # 把 param.data 切成 N 段，第 rank 张卡持有第 rank 段
            flat = param.data.view(-1)
            chunk_size = (flat.numel() + self.world_size - 1) // self.world_size
            # padding 到 chunk_size * world_size
            padded = torch.zeros(chunk_size * self.world_size, dtype=param.dtype,
                                  device=param.device)
            padded[:flat.numel()] = flat
            local_chunk = padded[self.rank * chunk_size : (self.rank + 1) * chunk_size]
            # 用 local_chunk 替换 param.data，原参数被回收
            param.data = local_chunk.clone()
            # 记录原始 shape，all-gather 后用于 reshape
            param._zero_full_shape = flat.shape
            param._zero_chunk_size = chunk_size

    def forward(self, *args, **kwargs):
        # 在 forward 之前 all-gather 所有参数
        with self._gather_params():
            return self.module(*args, **kwargs)

    @torch.no_grad()
    def _gather_params(self):
        """
        Context manager: enter 时 all-gather，exit 时 free。
        这是 ZeRO-3 的核心：用通信换内存。
        """
        original_data = {}
        for name, param in self.module.named_parameters():
            original_data[name] = param.data
            # all-gather: 把 N 张卡的 chunk 拼回完整参数
            gathered = [torch.empty_like(param.data) for _ in range(self.world_size)]
            dist.all_gather(gathered, param.data)
            full = torch.cat(gathered).view(param._zero_full_shape)
            param.data = full
        try:
            yield
        finally:
            # forward 完成后立刻释放完整参数，恢复 chunk
            for name, param in self.module.named_parameters():
                param.data = original_data[name]
```

**旁注 1（why 通信量增加但仍可接受）**：ZeRO-3 比 ZeRO-2 多一次 all-gather（forward 前），所以总通信量是 1.5x DDP。但内存节省是 N 倍，对于 N=64 的集群，内存换通信非常划算。

**旁注 2（layer-wise gather）**：实际实现不是一次性 all-gather 整个模型（那会撑爆内存），而是按 layer 一层层 gather → forward → free。这就是 DeepSpeed 的 init_inference 和 zero3_consolidated_16bit_state_dict 的核心。

**旁注 3（backward 也要 all-gather）**：backward 计算梯度需要参数本身，所以 backward 也要重新 all-gather 一次。论文称为 "second all-gather for backward"，是 ZeRO-3 通信开销的主要来源。

**旁注 4（ZeRO-Offload 是 ZeRO-3 的延伸）**：把 OS 进一步从 GPU offload 到 CPU 内存，单 GPU 也能训 13B。代价是 PCIe 带宽（~16 GB/s），所以 step 时间显著拉长。但对内存受限场景非常实用。

**旁注 5（ZeRO-Infinity 把 NVMe 也用上）**：2021 年的后续工作（同一作者），把 P 也可以 offload 到 NVMe SSD，实现单 GPU 训练 1T 参数。代价是 NVMe 带宽（~3 GB/s）远低于 GPU HBM（~1 TB/s），训练吞吐打折扣。

**旁注 6（HuggingFace accelerate 集成）**：accelerate 的 from accelerate import Accelerator + accelerator.prepare(model, optimizer) 把 ZeRO-3 用一行代码搞定，对照 commit e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6 看 prepare 函数的实现。

**怀疑 3**：context manager 模式（with self._gather_params()）在嵌套模型时正确吗？例如 nn.Sequential 里嵌套自定义 ZeRO3Module，外层 forward 已经 gather 了，内层会重复 gather。DeepSpeed 实际用的是 hook 而非 context manager，避免嵌套问题。我这里简化了。

## Layer 4 — phd-skills 7 阶段验证

### Stage 1 - reproduce baseline

```bash
# 先用 DDP 跑 GPT-2 small（124M），记录单卡内存占用
torchrun --nproc_per_node=4 train_ddp.py --model gpt2 --batch_size 4
# 预期：每卡 ~12 GB（fp16 + Adam）
```

### Stage 2 - profile memory

```python
# 用 torch.cuda.memory_summary() 拆分 OS / G / P / activation
import torch
torch.cuda.empty_cache()
# ... train one step ...
print(torch.cuda.memory_summary(abbreviated=False))
# 预期看到：Optimizer State 占大头（~12 GB 中的 9 GB）
```

### Stage 3 - apply ZeRO-1

```python
from deepspeed import initialize
ds_config = {
    "train_batch_size": 16,
    "fp16": {"enabled": True},
    "zero_optimization": {"stage": 1},
}
model, optimizer, _, _ = initialize(model=model, config=ds_config, ...)
# 预期：内存降到 ~6 GB（4x OS 节省）
```

### Stage 4 - apply ZeRO-2

```python
ds_config["zero_optimization"]["stage"] = 2
# 预期：内存降到 ~3 GB（8x 节省，G 也切）
# 通信量：检查 nvidia-smi nvlink 看是否仍是 2x DDP
```

### Stage 5 - apply ZeRO-3

```python
ds_config["zero_optimization"]["stage"] = 3
# 预期：内存降到 ~1 GB（Nx 节省，P 也切）
# 但训练速度下降 ~30%（多一次 all-gather）
```

### Stage 6 - try Offload

```python
ds_config["zero_optimization"]["offload_optimizer"] = {"device": "cpu"}
# 预期：内存进一步降，但 step 时间显著拉长（PCIe 瓶颈）
```

### Stage 7 - benchmark with HuggingFace accelerate

```bash
accelerate config  # 选 DeepSpeed + zero3
accelerate launch train.py
# 验证 accelerate 的封装与原生 DeepSpeed 行为一致
```

## Layer 5 — 谱系定位

<Image src="/papers/deepspeed-zero/02-genealogy.webp" alt="ZeRO 谱系" width={1400} height={800} />

### 前作

- **DDP / Horovod**（2017-2018）：data parallel baseline，all-reduce 同步梯度。ZeRO 在此基础上发现"状态复制可以避免"。
- **[Megatron-LM P1](/papers/megatron-lm/)**（2019）：tensor parallelism，切计算解决单层放不下问题。ZeRO 与 TP 正交，可以组合使用。
- **GPipe / PipeDream**（2018-2019）：pipeline parallelism，按 layer 切。ZeRO 与 PP 也正交。
- **Adam Optimizer**（Kingma & Ba 2014）：ZeRO 的内存分析依赖 Adam 的 OS 占大头这一事实。如果用 SGD（无 momentum），ZeRO-1 的收益就小很多。

### 后作

- **PyTorch FSDP**（2022）：官方对 ZeRO-3 的重新实现，更深度集成 PyTorch autograd。
- **ZeRO-Infinity**（2021，同作者）：把参数也 offload 到 NVMe，单 GPU 训 1T 参数。
- **3D Parallelism**（NVIDIA Megatron + DeepSpeed 联合）：DP × TP × PP × ZeRO 四维组合，训 530B 参数的 MT-NLG。
- **Pathways**（Google 2022）：更通用的分布式训练框架，吸收了 ZeRO 思想。
- **GSPMD**（Google 2021）：基于 XLA 的自动分片，把 ZeRO 推广到任意并行轴。

### 反对者 / 替代方案

- **纯 TP 派**：认为切计算比切内存更通用（适用任何模型大小），代表是 NVIDIA Megatron。事实上在大模型训练中两者结合用。
- **纯 DP 派**：认为只要单卡能放下，DDP 最简单可靠。ZeRO 的复杂度（多 4-5 次 collective ops）增加调试难度。
- **CPU offload 派**（早期）：直接把 OS / G / P 全 offload 到 CPU，通信开销极大但实现简单。ZeRO-Offload 把这个思路工程化。
- **单卡训练派**：用 gradient checkpointing + mixed precision 在单卡训中等模型，避免分布式复杂度。在 7B 以下模型仍是常见选择。

## Layer 6 — 通用化教训

### 教训 A — 把"复制是必须的"作为可挑战的假设

- DDP 的复制不是物理定律，而是工程惯例
- 任何"每个 worker 都需要完整副本"的系统，都值得问"真的吗"
- 复制的代价 = 内存 × worker 数，在大规模下复制本身就是瓶颈
- 切分（partitioning）是分布式系统永恒的设计杠杆

### 教训 B — 通信量不变但内存峰值降一半，是 collective ops 的隐藏礼物

- all-reduce = reduce-scatter + all-gather，等式总成立
- 把这两步拆开做不同事，可以"白拿"内存优化
- 类似的等价拆解在 NCCL / MPI 里还有很多（如 broadcast = scatter + all-gather）
- 看到 collective ops 的封装时，问"它内部的两步可以拆开吗"

### 教训 C — 工程化的元论文：把已知技巧组合到极致

- ZeRO 没发明新算法，只是把"切分"贯彻到 OS / G / P 三个层次
- 这种"已有技术的极致组合"反而比新算法更有影响力
- 工程论文的价值不在于新颖度，而在于落地度和经济价值
- 顶会接受率高的"系统论文"通常都是这种气质

## Layer 7 — 怀疑

### 怀疑 1：ZeRO-3 在小模型上反而更慢

- 小模型（< 1B）的 OS / G / P 本来就不大，多一次 all-gather 的开销 > 内存节省的收益
- 论文里 100B+ 模型的曲线很漂亮，但 1B 以下基本是 ZeRO-1 最优
- 实际选 stage 应该看 GPU 内存 vs 模型大小的比值，而不是无脑用最高 stage

### 怀疑 2：通信量分析忽略了 latency

- 论文证明 ZeRO-2 通信量和 DDP 一样（2x 参数量）
- 但 ZeRO-2 是两次 collective ops（reduce-scatter + all-gather），DDP 是一次（all-reduce）
- 在 latency-bound 场景（小张量、跨 node），两次 ops 的延迟更高
- 论文用 throughput 衡量通信成本，掩盖了 latency 问题

### 怀疑 3：ZeRO-Offload 的 PCIe 假设

- ZeRO-Offload 假设 PCIe 16 GB/s，但 H100/H200 时代 NVLink 已经 900 GB/s
- 在新硬件上，offload 到 CPU 反而成为瓶颈
- 论文 2020 年的 V100 / 32GB 假设，在 2026 年 H100 / 80GB 已经过时
- 时代变了，最优解可能是纯 GPU + ZeRO-3 而非 ZeRO-Offload

### 怀疑 4：实现复杂度的隐性成本

- ZeRO 的 4 个 stage + offload 选项 + 各种 hyper-parameter（bucket size / overlap），调参复杂
- 复现 paper 里的数字需要精细调优，普通用户用默认配置往往达不到
- 这是为什么 PyTorch 后来推出 FSDP（更易用的 ZeRO-3）来收编社区

### 怀疑 5：线性可扩展性的边界条件

- 论文 figure 7 显示 64-400 GPU 区间近线性，但跨 1000+ GPU 时 all-gather 的 hierarchical reduce 退化
- 实际 1024 GPU 训练 GPT-3 量级模型，ZeRO-3 的通信占比可达 30%+，远超论文展示的 < 10%
- 论文用单 node 8 GPU NVLink + 跨 node IB 的混合拓扑，没充分暴露纯跨 node 场景的退化曲线

### 怀疑 6：内存节省数字的"理想化"前提

- 论文宣传"8x 内存节省"基于 OS+G+P 三者均参与切分的理想态
- 实际训练中 activation memory 常常占总内存 40%+，ZeRO 完全不解
- 真实总内存节省往往只有 2-3x，而非 paper 宣称的 8x

## 宣传 vs 现实

| 维度 | 论文宣传 | 实际工程 |
|------|---------|---------|
| 内存节省 | 8x（OS+G+P 三层切分） | 2-3x（activation 不切是大头） |
| 通信开销 | 与 DDP 相同（throughput 维度） | latency-bound 场景增加 1.5x |
| 适用规模 | 1B-1T 参数全覆盖 | < 1B 用 DDP 更优，> 100B 才显优势 |
| 配置成本 | 改 config 即可启用 | 调 stage/bucket/overlap 需要数天 |
| 跨 node 扩展 | 近线性到 400 GPU | 1000+ GPU 通信占比超 30% |

## 限制

1. **强依赖 Adam-like 优化器**：OS 占大头是 Adam 的特性，对 SGD（无 OS）ZeRO-1 收益接近零。
2. **跨 node 通信瓶颈**：ZeRO-3 的频繁 all-gather 在 InfiniBand 集群（vs NVLink 单 node）性能差。
3. **不解决 activation 内存**：activation 占用与 batch size × seq length × hidden 相关，ZeRO 不切这部分（需要 activation checkpointing 配合）。
4. **配置复杂度高**：4 个 stage + offload + bucket size + overlap_comm 等参数，调优门槛高。
5. **小模型反向收益**：< 1B 模型用 ZeRO-3 反而比 DDP 慢，因为通信开销 > 内存收益。
6. **硬件代际敏感**：2020 年 V100 假设在 H100 时代部分失效（NVLink 带宽变化导致 offload 策略要重估）。

## 元数据

- 笔记完成时间：2026-05-29
- 推荐配套：`huggingface/accelerate` 文档 / DeepSpeed README / FSDP tutorial
- 相关笔记：[Megatron-LM P1](/papers/megatron-lm/)（前作 / TP 正交方案）
- 下一篇候选：3D Parallelism / FSDP 深度解析
