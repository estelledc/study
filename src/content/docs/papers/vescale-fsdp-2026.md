---
title: veScale-FSDP — 灵活且高性能的大规模 FSDP
来源: https://arxiv.org/abs/2602.22437
日期: 2026-06-13
子分类: ML 系统
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：拼图 vs 按页装订的教材

想象你要和 **8 位同学**（8 张 GPU）一起保管并修改一本 **超厚教材**（大模型参数 + 梯度 + Adam 状态）。训练时，算到某一章就要临时把那一章**凑齐完整页**做矩阵运算，算完再拆回每人手里的一摞。

**传统 FSDP（ZeRO / FSDP1）** 像把教材**按页码顺序撕成 8 份**，但**不管章节边界**——一页纸可能半张在你桌上、半张在同学 B 桌上。做「按整页批改」（element-wise 更新）还行；一旦要做「按整章做矩阵变换」（Muon、Shampoo）或「每 128×128 小块单独量化」（block-wise FP8），边界对不齐，就得额外借页、补空白、再复印一遍。

**PyTorch FSDP2** 改进了装订方式：每本书**按行均匀切分**（Row-wise Even Shard），每人的行数一样。章节对齐好一点，但**量化块大小**（比如 128×128）未必能整除行数，块仍然可能被切成两半。更麻烦的是：通信时参数在缓冲区里**交错存放**（interleaved），AllGather 之后还要 **Copy-Out** 到连续内存才能算——像把散页粘成册子，GPT-OSS-120B 在 64×H800 上 Copy-Out 约占 AllGather 时间的 **12%**，Copy-In 约占 ReduceScatter 的 **13%**。

**Megatron-FSDP** 走零拷贝路线，但用**大量 padding** 把拼接张量伪装成按行切分，padding 一多，显存和通信量都涨。

**veScale-FSDP** 的思路像**按「不可再拆的最小装订单元」分书**：

- 你可以定义单元是**一行**、**一个 128×128 块**，甚至**整张权重矩阵**（给 Muon 用）。
- 不同 GPU 上可以持有**不同数量的单元**（ragged / 参差分布），不必每人行数相等。
- 通信前用**结构感知规划器**重新排列单元顺序，把 padding 插在**书与书之间**而不是**书页中间**，保证每本书在内存里仍然连续。
- 所有单元映射到一块全局 **Distributed Buffer（DBuffer）**，AllGather / ReduceScatter **直接在这块缓冲上零拷贝完成**。

一句话：**veScale-FSDP 让 FSDP 既保留 `fully_shard` 的易用 API，又能在万卡规模上同时满足「块结构不被切碎」和「通信路径足够快」。**

---

## 是什么

**veScale-FSDP: Flexible and High-Performance FSDP at Scale**（Wang 等，ByteDance Seed，arXiv:[2602.22437](https://arxiv.org/abs/2602.22437)，2026）是对 PyTorch FSDP2 后端的**重新设计**，核心贡献三件事：

| 组件 | 作用 |
|------|------|
| **RaggedShard** | 新的 DTensor placement：支持**任意块粒度** + **任意 per-device 块数量** |
| **Structure-aware planning** | 把 bucket 内多个 RaggedShard 张量排布进通信缓冲，最小化 padding、保持块完整与张量连续 |
| **DBuffer（Distributed Buffer）** | 全局通信缓冲原语，RaggedShard 张量是其切片，实现**零拷贝** collective |

| 项目 | 内容 |
|------|------|
| 机构 | ByteDance Seed |
| 开源 | [github.com/volcengine/veScale](https://github.com/volcengine/veScale)（RaggedShard 相关代码） |
| API | 保留 PyTorch 原生 **`fully_shard`**，用户侧写法与 FSDP2 一致 |
| 生产 | 已用于 ByteDance Seed **大部分训练任务**，宣称可扩展到 **万卡 + 万亿参数** |
| 效果（论文） | 相对现有 FSDP：**吞吐 +5%～66%**，**显存 −16%～30%** |

---

## 为什么重要

### 1. 前沿训练已经「结构化」，FSDP 却还按元素切

DeepSeek-V3 的 **block-wise FP8**、Gemini / Kimi K2 路线上的 **Muon / Shampoo** 等优化器，都假设张量上的**固定形状块**在单卡上完整存在。旧 FSDP 的 element-wise 或 even row-wise 切分与这一假设**结构性冲突**——要么改模型/优化器代码去迁就切分边界，要么在系统层打补丁。

### 2. FSDP2 的 Copy 开销在超大模型上不可忽视

论文 Table 1（GPT-OSS-120B，64×H800）：

| 路径 | AllGather | Copy-Out | ReduceScatter | Copy-In |
|------|-----------|----------|---------------|---------|
| Shard(0) | 43.71 ms | **5.22 ms** | 94.24 ms | **12.37 ms** |
| Shard(1) | 44.35 ms | **13.72 ms** | 95.36 ms | **23.14 ms** |

Copy 不是小头；万卡训练里每步多十几毫秒会累积成大量 GPU·小时。

### 3. 通信缓冲对齐与负载均衡是系统问题

NCCL 等 collective 对 buffer **16 字节对齐**、各 rank **等长 buffer** 有要求。朴素拼接会把 padding 插进张量内部 → 破坏连续性 → 又要 copy。veScale 把布局规划形式化为 **NP-hard** 优化问题，用多项式启发式在**秒级**给出方案，避免 ILP 求解器在百组参数 × 十万 device 规模下跑**数十分钟**。

---

## 核心概念

### 1. FSDP 复习：为什么需要 sharding format

FSDP（Fully Sharded Data Parallel，即 ZeRO-3）把**参数、梯度、优化器状态**切到 N 张卡，每张约 1/N。前向某层前 **AllGather** 拼完整权重，反向后再 **ReduceScatter** 梯度并写回分片。

「怎么切」就是 **sharding format**。它决定了：

- 优化器更新能否在分片上**就地**完成
- 量化块边界是否**对齐**
- 通信 buffer 能否**零拷贝**复用

### 2. 三种 sharding format 对比

```text
Element-wise（ZeRO / FSDP1）
  └─ 任意元素边界切分 → 丢 shape/stride → 矩阵优化器、块量化都痛苦

Row-wise Even（FSDP2 默认 Shard(0)）
  └─ 按 dim 均匀切行 → 支持部分非 element-wise 算子
  └─ 块边界仍可能对不齐；通信后参数交错 → Copy-Out/In

Block-wise RaggedShard（veScale-FSDP）
  └─ 粒度 g = 自定义块（行 / 128×128 块 / 整矩阵）
  └─ 每 device 块数可以不同（ragged）
  └─ 通过 block size 选择可退化为以上两种
```

### 3. RaggedShard：DTensor 的新 placement

灵感来自单机 **JaggedTensor / NestedTensor**（每行长度可不同）。RaggedShard 在**分布式** DTensor 上增加两个自由度：

1. **Sharding granularity** \(g_t\)：不可再切的最小块（元素、行、2D block…）
2. **Sharding distribution**：每个 device 持有多少块（可以不等）

与 **TP / EP** 组合时，veScale 处理 DTensor placement 顺序与概念顺序相反的问题：

- 对 `Shard(0)` 引入 **StridedRaggedShard**（带 stride 元数据，物化全张量时重排）
- 对 `Shard(dim>0)` 把粒度设为 **LCM(用户粒度, 该维 stride)**，避免切进 TP/EP 维

Checkpoint 可直接复用 **PyTorch Distributed Checkpoint（DCP）** 的 DTensor 栈。

### 4. Structure-aware planning：通信布局优化

把一组 RaggedShard 张量放进全局通信缓冲，目标是最小化**每张卡的统一 buffer 大小** \(S\)，约束：

| 约束 | 含义 |
|------|------|
| **Non-Sharded Block** | 块边界不能落在 device 分界线上 |
| **Contiguous Tensor Memory** | 每个张量在缓冲里占连续区间 |
| **Balanced Load** | m 个 device 的 local buffer 等长 |

朴素拼接（Figure 6a）会违反以上三条；规划器（Figure 6b）**先置换张量顺序，再在张量之间插 padding**，避免 padding 落在张量内部。

问题 NP-hard（可归约到 Partition 问题），工程上用 **Algorithm 1** 启发式 + 二分搜索最小可行 \(S\)。

### 5. DBuffer：零拷贝通信原语

RaggedShard 张量的 local shard 是 **DBuffer 上的一段切片**。AllGather / ReduceScatter 直接在 DBuffer 视图间进行，避免 FSDP2 那种「通信缓冲 ↔ 连续计算缓冲」来回 copy。同时 **batched allocation** 减轻显存碎片——大规模训练中碎片本身就会触发昂贵的 device-side free。

### 6. Structure-aware training 的两类代表

**矩阵优化器（Muon / Shampoo）**  
更新作用于**完整 2D 权重矩阵**（如 SVD、正交化），不是逐元素 Adam。需要把整矩阵 gather 到某 device 做更新再 scatter——RaggedShard 可以把粒度设为**整矩阵**或对齐矩阵行的块。

**Block-wise 量化（8-bit Adam、DeepSeek FP8）**  
每个块带独立 scale；若块被切到两张卡，就要跨卡同步 scale metadata，量化收益被通信吃掉。Block-wise RaggedShard 让**量化块 = 分片块**。

---

## 与现有 FSDP 实现对照

| 实现 | 切分方式 | 零拷贝 | 块量化 / 矩阵优化器 | 主要痛点 |
|------|----------|--------|---------------------|----------|
| DeepSpeed ZeRO | Element-wise 拼接 | 否 | 难 | 碎片化 AllGather、内存管理 |
| PyTorch FSDP1 | Element-wise FlatParam | 否 | 难 | ReduceScatter 慢、record_stream 开销 |
| PyTorch FSDP2 | Row-wise DTensor | 否（Copy-Out/In） | 仍难 | 交错内存、未对齐 collective |
| Megatron-FSDP | Row-wise + padding | 是 | 仍难 | padding 膨胀 |
| **veScale-FSDP** | **RaggedShard** | **是（DBuffer）** | **原生支持** | 规划器复杂度（已启发式化） |

---

## 代码示例

### 示例 1：FSDP2 风格 `fully_shard` — API 不变

veScale-FSDP **刻意保留** PyTorch 2.4+ 的 composable API。熟悉 FSDP2 的训练脚本几乎不用改入口：

```python
import torch
import torch.nn as nn
from torch.distributed.fsdp import (
    fully_shard,
    MixedPrecisionPolicy,
    CPUOffloadPolicy,
)

class TransformerBlock(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.attn = nn.Linear(dim, dim)
        self.mlp = nn.Sequential(
            nn.Linear(dim, 4 * dim),
            nn.GELU(),
            nn.Linear(4 * dim, dim),
        )

    def forward(self, x):
        return self.mlp(self.attn(x))

def build_fsdp_model(dim: int, n_layers: int, mesh):
    """veScale-FSDP 与 FSDP2 一样：自底向上 wrap 每一层。"""
    model = nn.Sequential(*[TransformerBlock(dim) for _ in range(n_layers)])

    mp = MixedPrecisionPolicy(
        param_dtype=torch.bfloat16,
        reduce_dtype=torch.float32,   # 梯度归约保 fp32 是稳定训练关键
        cast_forward_inputs=True,
    )

    # 先 wrap 子模块，再 wrap 根模块（FSDP2 官方推荐顺序）
    for layer in model:
        fully_shard(layer, mesh=mesh, mp_policy=mp, reshard_after_forward=True)

    fully_shard(
        model,
        mesh=mesh,
        mp_policy=mp,
        reshard_after_forward=True,  # 根模块 forward 后通常不 reshard
    )
    return model
```

差异在**后端**：veScale 把参数表示为 **RaggedShard DTensor** 并挂到 **DBuffer**，而不是 FSDP2 默认的 `Shard(0)` + interleaved copy 路径。用户调用 `fully_shard` 时可通过 veScale 扩展（如 `shard_placement_fn`、块粒度配置）指定 RaggedShard 块大小，而无需重写模型 forward。

### 示例 2：为 block-wise 量化指定块粒度（概念示意）

下面展示**意图**：把 Linear 权重按 **128×128 元素块** 作为不可切分单元，使 FP8 / 8-bit Adam 的 scale 与 FSDP 分片边界一致。

```python
import torch
from torch.distributed.tensor import DTensor, DeviceMesh, Shard, Replicate

# 概念 API：具体函数名以 veScale 开源仓库为准
# from vescale import RaggedShard, ragged_shard_tensor

def block_granularity_for_quant(weight: torch.Tensor, block: int = 128):
    """返回 RaggedShard 粒度：2D block 边长。"""
    assert weight.ndim == 2
    assert weight.shape[0] % block == 0 and weight.shape[1] % block == 0
    return (block, block)  # 每个 block 是 block×block 的连续子矩阵

def make_block_ragged_weight(local_weight, mesh: DeviceMesh, block: int = 128):
    """
    将本地权重包装为 Block-wise RaggedShard DTensor。
    每个 128×128 块要么完整在本 rank，要么完整在另一 rank。
    """
    g = block_granularity_for_quant(local_weight, block)
    # 伪代码：veScale 在 fully_shard 内部做类似事
    # placements = [RaggedShard(granularity=g), ... 与其他 TP/EP placement 组合]
    # return DTensor.from_local(local_weight, mesh, placements)
    raise NotImplementedError("见 volcengine/veScale RaggedShard API")

# 训练循环里：优化器对 DTensor 做 block-wise 量化时无需 cross-rank scale sync
# for p in model.parameters():
#     if isinstance(p, DTensor) and p.placements 含 RaggedShard:
#         optimizer.step()  # 8-bit Adam / FP8 kernel 看到完整 block
```

对比 FSDP2 默认 `Shard(0)`：若 `out_features=4096`、`world_size=8`，每 rank 512 行；若 `block=128` 且 512 不能整除块在**列方向**上的布局，仍可能在通信边界上切断块——veScale 的规划器 + RaggedShard 在**分片前**就按块对齐。

### 示例 3：Muon 等矩阵优化器为何需要更大粒度

```python
# Muon：对 2D 权重做矩阵级正交化更新（示意）
def muon_update(weight_2d: torch.Tensor, grad_2d: torch.Tensor, lr: float):
    """要求 weight_2d, grad_2d 是完整矩阵，而非 element-wise 分片。"""
    # 实际实现会做 Newton-Schulz 迭代等矩阵运算
    update = matrix_orthogonalize(grad_2d)
    weight_2d.sub_(lr * update)

# RaggedShard 粒度 = 整个 weight 矩阵 → FSDP 分片边界与矩阵边界一致
# veScale 在 optimizer step 前按需 all-gather 矩阵，step 后 reduce-scatter
# 用户不必在模型代码里手写 dist.all_gather
```

---

## 实验结果（论文摘要）

- **吞吐**：相对 DeepSpeed ZeRO、FSDP1、FSDP2、Megatron-FSDP，dense / sparse LLM 上 **+5%～66%**（模型规模与 baseline 不同，增益幅度不同）。
- **显存**：**−16%～30%**（更少 padding、更少 copy 缓冲、更紧的 DBuffer 布局）。
- **规模**：高效扩展到 **数万 GPU**；生产环境 **10K+ GPU** 部署。
- **Case study**：
  - **Muon** 优化器：无需侵入式改模型即可与 FSDP 共存。
  - **8-bit Adam** block-wise 量化：分片块与量化块对齐，避免额外 metadata 通信。

---

## 何时值得用 / 何时可以等等

**值得关注 veScale-FSDP 的场景：**

- 训练脚本已用 **FSDP2 `fully_shard`**，但在 **70B+** 或 **千卡** 规模遇到吞吐/显存瓶颈
- 计划上 **FP8 / block-wise 量化训练** 或 **Muon / Shampoo**
- **MoE + EP + FSDP** 混合并行，需要 DTensor placement 灵活组合
- 集群 GPU 内存紧张，OOM 导致 **over-provisioning** 浪费算力

**可以继续用 stock FSDP2 的场景：**

- 7B 以下、单机多卡、标准 AdamW + BF16，Copy 开销占比小
- 不需要 block 对齐的自定义优化器
- 尚未升级到 PyTorch 2.4+ composable FSDP

---

## 与相关工作的关系

```text
ZeRO-3 / FSDP1 ──►  element-wise 切分，FlatParameter 优化通信
        │
        ▼
FSDP2 (fully_shard) ──► per-parameter Shard(0) DTensor，LoRA 友好，但有 Copy-Out/In
        │
        ├── Megatron-FSDP ──► 零拷贝 + 大量 padding
        │
        └── veScale-FSDP ──► RaggedShard + planning + DBuffer
                    │
                    ├── 可组合 TP / EP（DTensor placement）
                    └── 同一 veScale 生态：veScale SPMD 张量编程（arXiv:2509.07003）
```

若已读本站 [PyTorch FSDP 笔记](./fsdp-2023.md)，可把 veScale-FSDP 理解为：**在 FSDP2 的 DTensor 路线上，把「怎么切」从固定 even-shard 推广为可配置 block，并把「怎么通信」从 copy-heavy 改为 planned zero-copy。**

---

## 踩坑与实践提示

1. **Wrap 顺序仍是 bottom-up**：与 FSDP2 相同，先 `fully_shard` 子模块再根模块；RaggedShard 不改变这一约定。

2. **块粒度要整除或显式规划**：Block-wise 量化选的 block size 应与张量 shape、并行度一起设计；否则规划器会插入更多 padding。

3. **不要忽视 reduce_dtype**：即使参数 BF16，梯度 ReduceScatter 用 FP32 仍是主流稳定做法（与 FSDP2 相同）。

4. **矩阵优化器的 gather 成本**：把粒度设为「整矩阵」最灵活，但大矩阵 optimizer step 前仍需 gather；veScale 优化的是**与 FSDP 生命周期集成**，不是消除矩阵优化的 inherent 通信。

5. **开源范围**：截至论文发表，[veScale 仓库](https://github.com/volcengine/veScale) 主要开源 **RaggedShard** 相关部分；完整生产后端可能仍在 ByteDance 内部迭代，部署前核对 release 说明。

6. **与 Megatron 栈的分工**：Megatron-Core 侧 MoE / TP / PP 更重；veScale-FSDP 专注 **FSDP 数据并行维** 的灵活与性能。大规模 job 常见 **EP/TP + veScale-FSDP** 组合，而非二选一。

---

## 一句话总结

**veScale-FSDP** 用 **RaggedShard**（按 customizable block 切分、允许参差分布）+ **结构感知通信规划** + **DBuffer 零拷贝**，在保留 **`fully_shard` API** 的前提下，同时解决「**现代结构化训练**（块量化、矩阵优化器）与 **旧 FSDP 切分格式** 不兼容」和「**FSDP2 copy + padding** 在万卡规模上过贵」两个问题。若你在 FSDP 上推 FP8 或 Muon，这篇论文值得作为**系统层**选型参考。

---

## 延伸阅读

- 论文 HTML：[arXiv:2602.22437](https://arxiv.org/html/2602.22437)
- 开源代码：[volcengine/veScale](https://github.com/volcengine/veScale)
- PyTorch FSDP2 API：[torch.distributed.fsdp.fully_shard](https://pytorch.org/docs/stable/distributed.fsdp.fully_shard.html)
- 本站笔记：[PyTorch FSDP（FSDP1 工程经验）](./fsdp-2023.md)、[Megatron Core MoE 大规模训练](./megatron-core-moe-2026.md)
- 关联：DeepSeek-V3 FP8 训练、Muon optimizer（Jordan et al. 2024）、8-bit Adam（Dettmers et al.）
