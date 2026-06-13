---
title: FlashAttention-3 — Hopper 上的异步 Attention 与 FP8 低精度
来源: https://arxiv.org/abs/2407.08608
日期: 2026-06-13
子分类: ML 系统
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：厨房升级了，但厨师还在按旧菜谱干活

FlashAttention-2 已经把 attention 这条「产线」排班优化到 A100 上能跑满 **50–73%** 峰值算力——相当于一家工厂把仓库运费（HBM 读写）省下来，又让 108 条流水线尽量都有人干活。

但 2024 年 NVIDIA 推出的 **Hopper（H100）** 不是「更快的 A100」，而是换了一整套厨房设备：

- **新灶台（WGMMA）**：矩阵乘吞吐比 Ampere 的 `mma.sync` 高一大截，但必须用新指令才能吃满。
- **自动传菜机器人（TMA）**：专门负责把食材从冷库（HBM）搬到操作台（shared memory），厨师不用自己算地址、搬货。
- **半份调料盒（FP8）**：同样的灶台，用 8 位浮点能再快一倍，但精度更脆，大数一多就糊。

FlashAttention-2 移植到 H100 上，论文测得 **只有约 35% 理论峰值 FLOPs**——就像换了智能厨房，厨师仍按旧流程：**算矩阵时等 softmax，搬数据时等矩阵**，新设备大量时间在空转。

**FlashAttention-3**（Tri Dao 等，2024 年 7 月，NeurIPS 2024）针对 Hopper 做了三件事：

1. **Warp specialization**：一部分 warp 专门 TMA 搬数据（producer），另一部分专门 WGMMA 算矩阵（consumer），**计算与搬运重叠**。
2. **GEMM 与 softmax 交错（ping-pong / pipeline）**：Tensor Core 算 `QK^T` 和 `PV` 时，多功能单元同时算 `exp`——softmax 不再挡在矩阵乘后面排队。
3. **块量化 + incoherent processing**：FP8 矩阵乘走硬件快路径，用 **分块 scale** 和 **Hadamard 正交变换** 把 outlier「摊平」，数值误差比朴素 FP8 attention **低 2.6×**。

结果：H100 SXM5 上 FP16/BF16 前向 **740 TFLOPs/s（约 75% 利用率）**，比 FA2 快 **1.5–2.0×**；FP8 接近 **1.2 PFLOPs/s**，且仍是 **exact attention**（在选定精度语义下与参考实现一致，不是稀疏/线性近似）。

---

## 是什么

**FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-Precision**（[arXiv:2407.08608](https://arxiv.org/abs/2407.08608)）是 FlashAttention 系列第三代：**数学仍是标准 scaled dot-product attention**，变化在 **Hopper 专用 CUDA kernel** 与 **FP8 数值路径**。

| 项目 | 内容 |
|------|------|
| 作者 | Tri Dao, Jay Shah, Beidi Chen, Varun B. Thakkar（Stanford / Meta / Together AI 等） |
| 目标硬件 | **NVIDIA Hopper（H100/H800）**，依赖 WGMMA、TMA、FP8 Tensor Core |
| 相对 FA2 | FP16 前向 **1.5–2.0×**；反向 **1.5–1.75×**；H100 峰值利用率 **35% → 75%** |
| FP8 | 近 **1.2 PFLOPs/s**；配合 block quant + incoherent processing，误差优于 per-tensor FP8 baseline **2.6×** |
| 实现 | CUTLASS / CuTe；开源 [Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)（Hopper 分支） |

与 [[flashattention-2]] 的关系：FA2 解决 **Ampere 上并行与 matmul 占比**；FA3 解决 **Hopper 上异步硬件 + 低精度**——不是换 attention 公式，是换「怎么喂饱 H100」。

---

## 为什么重要

- **长上下文 LLM 的算力天花板**：attention 仍是 Transformer 训练/推理的主瓶颈；H100 集群若仍跑 FA2，相当于 **浪费一半 Tensor Core**。
- **FP8 训练/推理的可信路径**：业界想用 FP8 换吞吐，但 outlier 导致量化崩；FA3 证明 **系统层数值处理**（块量化 + Hadamard）可以和 **kernel 融合** 一起交付。
- **硬件协同设计的范本**：WGMMA/TMA 异步指令不是「编译器自动就能用好」——需要 **warp 分工、双缓冲、ping-pong 调度** 才榨出 75% 利用率。
- **与推理栈互补**：[[paged-attention-vllm]] 管 KV 怎么存；FA3 管 attention 怎么在 Hopper 上算——vLLM、PyTorch SDPA 等栈可叠加使用。

---

## 核心概念

### 1. 标准 attention 在 H100 上的新瓶颈（复习）

```
Attention(Q, K, V) = softmax(QK^T / √d) · V
```

FlashAttention-1/2 已消除 **O(N²) HBM 中间矩阵**。到了 H100，瓶颈变成：

| 环节 | 问题 |
|------|------|
| 指令代际 | 仍用 `mma.sync` 只能吃到 Hopper Tensor Core 约 **2/3** 峰值 |
| 异构单元 | H100 FP16 matmul ~**989 TFLOPs/s**，special function（`exp`）仅 ~**3.9 TFLOPs/s**——差 **256×** |
| head_dim=128 时 | matmul FLOPs 约为 exp 的 512×，但 exp 仍可能占 **~50% 墙钟时间** |
| FP8 | matmul 再快一倍，exp 速度不变 → **softmax 更「拖后腿」** |

结论：**必须 overlap**——矩阵乘和 softmax 要并行，而不是串行。

### 2. Hopper 三件套：WGMMA、TMA、FP8

**WGMMA（Warpgroup Matrix Multiply-Accumulate）**

- 以 **warpgroup**（通常 4 个 warp = 128 线程）为单位发起大块 GEMM。
- 异步：发起后可继续做别的事，结果稍后通过 barrier / 异步拷贝取回。

**TMA（Tensor Memory Accelerator）**

- 硬件单元负责 **global memory ↔ shared memory** 的 tile 搬运（含边界处理）。
- 释放寄存器，让 tile 更大、流水线更深；常与 **producer warp** 绑定。

**FP8 Tensor Core**

- E4M3 / E5M2 等格式，H100 上 FP8 matmul 峰值约为 FP16 **2×**。
- WGMMA 对 **operand layout** 有严格要求；FA3 在 kernel 内做 **layout 转换 / transpose** 以对接 FP8 GEMM。

### 3. 异步策略一：Warp specialization（生产者–消费者）

类比 **寿司店**：

- **师傅 A（producer warp）**：只用 TMA 从冷库取鱼生（Q/K/V tile）放到案板（shared memory）。
- **师傅 B（consumer warp）**：只用 WGMMA 在案板上卷寿司（GEMM），不负责跑腿。

两者通过 **环形缓冲区（circular buffer）** 和 **mbarrier** 同步：案板上有空位就搬下一盘，有料就卷下一批。**搬运与计算重叠**，避免「师傅卷完干等进货」。

FA2 里 warp 既搬又算，寄存器压力大；FA3 分工后 **TMA 与 WGMMA 流水线化**，仅换用 Hopper 指令就能从 ~350 TFLOPs/s（FA2 on H100）提到 ~**540–570 TFLOPs/s**。

### 4. 异步策略二：GEMM 与 softmax 交错

Attention 每个 K/V block 大致做：

```
S = Q K^T          # GEMM0
P = softmax(S)     # exp + reduce（慢）
O += P V           # GEMM1
```

**Inter-warpgroup ping-pong**：两个 warpgroup 交替——WG1 做 GEMM 时，WG2 做上一块的 softmax，反之亦然。论文中 head_dim=128、seq=8K：~570 → ~**620 TFLOPs/s**。

**Intra-warpgroup pipeline**：同一 warpgroup 内，GEMM 累加器还在算时，先对 **已就绪的 score 子块** 启动 exp。~620 → ~**640–660 TFLOPs/s**，代价是 **更高寄存器压力**（同时握 GEMM accumulator 与 softmax 临时量）。

### 5. 低精度：块量化 + incoherent processing

**问题**：LLM 激活常有 **outlier**（极少数元素模长远大于其余），整 tensor 一个 scale 的 FP8 量化误差很大。

**块量化（block quantization）**

- 对每个 tile / block 单独算 scale（如 per-block max），再 cast 到 FP8。
- GEMM 在 FP8 Tensor Core 上算，**累加器仍用 FP32**（与 FA 系列 online softmax 一致）。

**Incoherent processing**（来自 QuIP / QuIP# 等量化文献）

- 对 Q、K 左乘 **随机正交矩阵** H（实现上用 **带随机符号的 Hadamard 变换**，O(d log d)）。
- 效果：outlier 能量被 **扩散** 到更多维度，块量化误差下降。
- 注意力分数满足 `(QH)(KH)^T = QK^T` 当 H 正交——**不改变 exact attention 结果**（在浮点语义下）。
- Hadamard 是 memory-bound，可与 **RoPE 等同样 memory-bound 的操作融合**，额外开销很小。

论文在 0.1% 元素人为放大模拟 outlier 时，FA3 FP8 比 **per-tensor FP8 baseline 误差低 2.6×**。

### 6. 性能数字怎么读

| 指标 | FA2 @ H100（约） | FA3 @ H100（约） |
|------|------------------|------------------|
| FP16 前向峰值 | ~350 TFLOPs/s（~35%） | **~740 TFLOPs/s（~75%）** |
| FP16 相对加速 | 1× | **1.5–2.0×** |
| FP8 前向 | — | **~1.2 PFLOPs/s** |
| vs cuDNN 9 | — | 长序列 FP16 **更快**；FP8 多数场景 **持平或更快**（因果 mask + 大 head_dim 有 trade-off） |
| 数值 | FA2 同级 | FP16 与 FA2 同级；FP8 显著优于 naive FP8 attention |

NeurIPS 正式版摘要写 BF16 最高 **840 TFLOPs/s（85%）**、FP8 **1.3 PFLOPs/s**——与 blog 数字同属不同 benchmark 配置，趋势一致：**Hopper 利用率从三分之一拉到四分之三**。

---

## 代码示例

### 示例 1：检测 GPU 代数并选用 FlashAttention-3（Hopper）

FA3 kernel **仅 Hopper（sm_90）** 有完整路径；Ampere 仍用 FA2。下面演示如何在 PyTorch 里 **按架构选 backend**：

```python
import torch
import torch.nn.functional as F
from torch.nn.attention import SDPBackend, sdpa_kernel

def hopper_flash_sdpa(q, k, v, *, causal=True):
    """q,k,v: [B, H, N, D] on CUDA."""
    major, _ = torch.cuda.get_device_capability()
    if major < 9:
        backend = SDPBackend.FLASH_ATTENTION  # FA2 on Ampere/Ada
    else:
        # PyTorch 2.4+ / nightly：Hopper 上 SDPA 可 dispatch FA3
        backend = SDPBackend.FLASH_ATTENTION

    scale = q.shape[-1] ** -0.5
    with sdpa_kernel(backend):
        return F.scaled_dot_product_attention(
            q, k, v, is_causal=causal, scale=scale
        )

B, H, N, D = 1, 32, 16384, 128
q = torch.randn(B, H, N, D, device="cuda", dtype=torch.bfloat16)
k = torch.randn(B, H, N, D, device="cuda", dtype=torch.bfloat16)
v = torch.randn(B, H, N, D, device="cuda", dtype=torch.bfloat16)

out = hopper_flash_sdpa(q, k, v)
assert out.shape == (B, H, N, D)
```

长序列（N=16K）+ causal 时，H100 上 FA3 相对 FA2 的增益最明显；**短序列或 batch 极小** 时 kernel launch 开销可能吃掉优势。

### 示例 2：flash-attn 包显式调用 Hopper / FP8 路径

训练栈常直接用 `flash_attn` 仓库的 Hopper 实现（需从源码编译，CUDA ≥ 12.3）：

```python
# pip install flash-attn --no-build-isolation
# 需 Hopper GPU + 支持 FP8 的 flash-attn 构建
import torch
from flash_attn import flash_attn_func

# layout: [batch, seqlen, nheads, headdim]
B, N, H, D = 2, 8192, 32, 128
q = torch.randn(B, N, H, D, device="cuda", dtype=torch.bfloat16)
k = torch.randn(B, N, H, D, device="cuda", dtype=torch.bfloat16)
v = torch.randn(B, N, H, D, device="cuda", dtype=torch.bfloat16)

# causal LM；Hopper 上内部走 WGMMA + TMA + 异步 softmax
out_bf16 = flash_attn_func(q, k, v, causal=True)

# FP8 路径（若构建启用）：Q/K/V 可在 kernel 内 block-quant + incoherent transform
# 具体 API 以 flash-attn 版本 README 为准，例如：
# out_fp8 = flash_attn_func(..., softcap=0.0, deterministic=False, fp8=True)

loss = out_bf16.sum()
loss.backward()  # 反向同样针对 Hopper 优化，不物化 N×N 矩阵
```

与 [[flashattention-2]] 示例相同：**`[B, N, H, D]` layout** 与 SDPA 的 `[B, H, N, D]` 不同，集成时注意 transpose。

### 示例 3（伪代码）：Hadamard incoherent processing 为何不改注意力语义

理解 FP8 数值路径，核心是 **正交变换在 logits 上抵消**：

```python
import math

def hadamard(x):
    """简化示意：实际用 FWHT + 随机 sign，O(d log d)。"""
    n = len(x)
    h = 1
    buf = list(x)
    while h < n:
        for i in range(0, n, h * 2):
            for j in range(i, i + h):
                a, b = buf[j], buf[j + h]
                buf[j], buf[j + h] = a + b, a - b
        h *= 2
    return [v / math.sqrt(n) for v in buf]

def block_fp8_quant(x, block_size=64):
    """每块独立 scale → FP8；反量化后做 GEMM 示意。"""
    scales = []
    q_blocks = []
    for i in range(0, len(x), block_size):
        block = x[i : i + block_size]
        s = max(abs(v) for v in block) / 127.0 or 1.0
        scales.append(s)
        q_blocks.append([round(v / s) for v in block])  # 示意，非真实 E4M3
    return q_blocks, scales

# incoherent：Q' = H Q, K' = H K  →  (Q')(K')^T = Q K^T
Q = [0.1, 0.2, 3.0, 0.15]  # 含 outlier 3.0
K = [0.12, 0.18, 0.05, 0.11]
Hq, Hk = hadamard(Q), hadamard(K)

# 直接 quant Q 误差大；先 Hadamard 再 block quant 误差更小
_, _ = block_fp8_quant(Q)
_, _ = block_fp8_quant(Hq)

dot_orig = sum(Q[i] * K[i] for i in range(len(Q)))
dot_rot  = sum(Hq[i] * Hk[i] for i in range(len(Hq)))
assert abs(dot_orig - dot_rot) < 1e-6  # 正交不变性
```

FA3 在 kernel 内把 **FWHT + block FP8 quant + WGMMA + FP32 softmax 累加** 融成一条流水线，避免把 FP8 Q/K 写回 HBM。

---

## FlashAttention-2 vs FlashAttention-3 对照

| 维度 | FlashAttention-2 | FlashAttention-3 |
|------|------------------|------------------|
| 目标 GPU | Ampere / Ada（A100, RTX 40） | **Hopper（H100）** |
| 核心指令 | `mma.sync` | **WGMMA + TMA** |
| 并行哲学 | split-Q、序列维 thread block | **warp specialization + 异步流水** |
| Softmax | 减少 rescale 次数 | **与 GEMM ping-pong / pipeline overlap** |
| 精度 | FP16 / BF16 为主 | **+ FP8 Tensor Core 路径** |
| 数值技巧 | FP32 累加 softmax | **+ block quant + Hadamard incoherent** |
| H100 利用率 | ~35% | **~75%（FP16）** |
| 相对 FA2 加速 | 1× | **1.5–2.0×** |

数学上仍是 **exact attention**（在声明的 dtype 下），不是 FlashAttention 以外的近似算法。

---

## 踩过的坑

1. **硬件门槛**：FA3 依赖 sm_90；A100 上请继续用 FA2，**不要假设 pip install 就有 FA3**。
2. **CUDA / 驱动版本**：Hopper + FP8 常要求较新 CUDA（12.x+）与对应 `flash-attn` 编译选项。
3. **FP8 不是「免费 2×」**：因果 mask、head_dim=256 等场景 FP8 可能 **略慢于或持平 FP16**；需 profile 你的 (B, H, N, D)。
4. **outlier 依赖**：incoherent processing 对 **严重 outlier 激活** 帮助最大；分布很均匀时 FP8 增益主要是吞吐而非误差。
5. **与 FA2 相同的 head_dim 限制**：非 8 倍数、过大 head_dim 可能无法 dispatch。
6. **生态集成滞后**：论文 2024 年中发布；PyTorch 内置 dispatch 随版本迭代——生产环境 **查 `torch.backends.cuda` 与 flash-attn release note**。

---

## 适用 vs 不适用

**适用**：

- H100 / H800 集群上 **长上下文** LLM 训练或推理
- 需要 **exact attention** 且希望吃满 Hopper
- 探索 **FP8 训练** 且关心 attention 层数值稳定性
- 与 PyTorch SDPA、`flash_attn`、cuDNN 9 等栈对比选型

**不适用**：

- Ampere / AMD / Apple Silicon（无 WGMMA/TMA）
- 极短序列（N 很小）——异步流水 overhead 不划算
- 必须自定义 attention 变体且无法进官方 kernel（考虑 Triton，见 [[triton-llm]]）
- 可接受近似 attention（Performer 等）换复杂度——那是算法路线，不是 FA3 目标

---

## 与相关工作的位置

```text
Attention 瓶颈
    ├── 改算法: Performer, [[mamba]] …
    └── 精确 attention + 系统优化:
            FlashAttention-1   → IO-aware, O(N) 显存
            FlashAttention-2   → Ampere 并行, ~2×  ← [[flashattention-2]]
            FlashAttention-3   → Hopper 异步 + FP8  ← 本篇
            PagedAttention     → KV 分页 [[paged-attention-vllm]]
            cuDNN 9 / ThunderKittens → 同代 Hopper 竞争实现
```

---

## 历史小故事（可跳过）

- **2022–2023**：FA1/FA2 把 LLM context 从 4K 推到 128K+ 的训练/推理成为可能。
- **2024 年 7 月**：Tri Dao 发布 FA3 预印本与 blog，同日强调 **开源代码**。
- **NeurIPS 2024**：正式收录；BF16/FP8 峰值数字在 camera-ready 中进一步更新。
- **PyTorch 官方 blog** 预告 FA3 将集成进未来 PyTorch release——与 [[flashattention-2]] 进 SDPA 的路径类似。

Tri Dao 连续三代 attention kernel 说明：**同一数学问题，随硬件代际可反复做 MLSys 深度优化**——Hopper 的「异步」比 Ampere 的「并行划分」又深一层。

---

## 学到什么

1. **新硬件 ≠ 旧程序变快**：H100 上 FA2 仅 35% 利用率；必须用 **WGMMA/TMA 重写数据流**。
2. **Attention 的隐形瓶颈是 exp**：matmul 越快，softmax 占比越高——**overlap 是第三代的核心**。
3. **低精度是系统问题**：FP8 要快，既要 **Tensor Core layout**，也要 **块量化 + 正交预处理** 控误差。
4. **正交变换是可融合的自由午餐**：Hadamard + RoPE 同属 memory-bound，incohere processing 几乎不单独付带宽税。
5. **读 roofline 要分单元**：Tensor Core TFLOPs 和 special function TFLOPs 是 **两张不同的 roofline**。

---

## 延伸阅读

- 论文：[arXiv:2407.08608](https://arxiv.org/abs/2407.08608)
- 作者博客：[FlashAttention-3 | Tri Dao](https://tridao.me/blog/2024/flash3/)
- PyTorch 解读：[FlashAttention-3 – PyTorch Blog](https://pytorch.org/blog/flashattention-3/)
- 代码：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)
- 前置：[[flash-attention]]（v1）、[[flashattention-2]]（v2）
- 推理互补：[[paged-attention-vllm]]
- 基础：[[attention]]

## 关联

- [[flashattention-2]] —— 上一代：Ampere 并行与工作划分
- [[flash-attention]] —— 第一代：IO-aware tiling 与 online softmax
- [[attention]] —— FA3 优化的核心算子
- [[paged-attention-vllm]] —— KV cache 分页，与 FA3 正交
- [[flashattention-2]] —— H100 上 FA2 仅 ~35% 利用率的对照基线
- [[triton-llm]] —— 自定义 attention 变体的常见框架
- [[gpt-3]] —— 长上下文需求推动 FlashAttention 系列演进
