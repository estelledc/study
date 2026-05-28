---
title: FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness
description: 状元篇 - FlashAttention 用 tiling + recomputation 把 attention 在 SRAM 里 fuse 成单一 kernel，避免 N×N 矩阵物化，让显存从二次降为线性，2-4x 加速，是现代 LLM 训练推理的事实标配
season: P
episode: P4
branch: method
tier: 状元
date: 2026-05-29
tags:
  - attention
  - cuda-kernel
  - io-aware
  - tiling
  - online-softmax
  - flash-attention
  - llm-training
---

import { Image } from 'astro:assets';

## Layer 0 — 论文身份证

| 字段 | 内容 |
|---|---|
| 标题 | FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness |
| 作者 | Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré |
| 机构 | Stanford（Hazy Research）+ University at Buffalo |
| 会议 | NeurIPS 2022 |
| 年份 | 2022 年 5 月（arXiv），同年 12 月发表 |
| arXiv | 2205.14135 |
| 代码 | github.com/Dao-AILab/flash-attention（截至 2026 年 14k+ stars） |
| 引用 | 5000+（截至 2026 年 5 月，是 Transformer 时代被引用最多的系统侧论文之一） |
| 一句话 | 把 attention 重写为 IO-aware kernel：用 tiling 把 Q/K/V 切块进 SRAM、用 online softmax 避免 N×N 矩阵物化、backward 用 recomputation 省显存——同样数学结果，2-4x 端到端加速、线性显存 |
| 后续 | FlashAttention-2（2023，warp 重排省 2x）、FlashAttention-3（2024，Hopper 异步 + FP8）、SDPA 进 PyTorch 2.0 默认 |

## 一句话定位

**FlashAttention 不改变 attention 的数学定义，只改变它的执行方式——把"先算 N×N 矩阵再 softmax"换成"边算边消去 N×N"，让 GPU 不再为内存搬运买单。**

它的发布让 GPT-2 / GPT-3 / LLaMA / Mistral 这一代 Transformer 训练吞吐直接拉高 2-4x，**长 context（4k → 32k → 128k → 1M）成为可能的根因之一就是 FlashAttention 把 attention 显存从 O(N²) 砍到 O(N)**。

<Image src="/papers/flash-attention/01-tiling-online-softmax.webp" alt="FlashAttention tiling + online softmax：Q/K/V 切块进 SRAM，逐块累加 softmax 统计量，避免 N×N 矩阵物化" width={1600} height={1000} />

## Layer 1 — Why 这篇论文存在

### 痛点 1：standard attention 的 O(N²) 显存

Transformer 的 self-attention 数学定义：

```
S = Q @ K^T  (N x N)
P = softmax(S)  (N x N)
O = P @ V  (N x d)
```

中间张量 `S` 和 `P` 都是 `N x N`：N=2048 时 `N²=4M`，fp16 就是 8MB；N=8192 时 256MB；N=32k 时 4GB——**单个 attention 层的中间矩阵就把显存吃光**。

forward 还能挤一挤；backward 要保存 `P` 用于反传 → 显存翻倍。

### 痛点 2：standard attention 是 memory-bound

GPU 上 attention 的 FLOPs 实际很少：N=1024、d=64 时一次 attention 只有 ~150 MFLOPs，A100 的 312 TFLOPs/s 算力只用了 0.05%。

为什么慢？因为每一步都要往 HBM（显存）读写中间矩阵：

- `Q @ K^T` → 写 N² 进 HBM
- `softmax(S)` → 读 N² 出来、写 N² 回去
- `P @ V` → 读 N² 出来

**HBM 带宽 1.5 TB/s 是真正的瓶颈**——不是算力。算力打满 5%，剩下 95% 时间在等内存。

### 痛点 3：Linformer / Performer 等"线性 attention" 的妥协

2020-2021 业界的回应是**改算法**：

- **Linformer**（FAIR 2020）：把 K/V 投影到固定低秩空间，复杂度从 O(N²) 降到 O(N)
- **Performer**（Google 2021）：用 random feature 近似 softmax，O(N²) → O(N)
- **Reformer**（Google 2020）：locality-sensitive hashing 让相似 token 才算 attention

问题：**精度损失**。这些近似在 LM 预训练上 ppl 比 standard attention 差，下游任务也跟不上——学术界喜欢，工业界不敢用。

### FlashAttention 的切入点

Tri Dao 团队（Christopher Ré 实验室，长期做 IO-aware 系统）观察到：

> **attention 慢不是因为 FLOPs 多，是因为数据搬运多。如果能把整个 attention fuse 成一个 kernel、中间矩阵全留在 GPU 的 SRAM（on-chip 缓存）里、只读一次 Q/K/V 一次 O，就能省掉 95% 的 HBM 流量。**

但 standard softmax 要"先看完整行才能算"——必须先把 N×N 矩阵物化。怎么做到 streaming？

答案是 **online softmax**（NVIDIA 2018 提出，Milakov & Gimelshein）：维护两个统计量 `(m, l)` —— 当前最大值 + 当前归一化分母——边读 K/V 块边更新，最后一步统一 normalize。这样根本不需要把 N×N 写出来。

三件事一起搞定：

1. **tiling**：Q/K/V 切成 SRAM 能装下的块（block_size 一般 64-128）
2. **online softmax**：流式更新统计量，不物化 N×N
3. **recomputation**：backward 时不存 `P`，重算（FLOPs 多 30%，但省 N² 显存）

## Layer 2 — 核心机制（怎么做）

### 2.1 GPU 内存层级与 IO-aware 的"账"

A100 的存储层级（从快到慢）：

- **registers**：~256 KB / SM，几 ns
- **SRAM (shared memory)**：192 KB / SM × 108 SM = ~20 MB total，~10 TB/s
- **L2 cache**：40 MB total，~5 TB/s
- **HBM (显存)**：80 GB，1.5 TB/s
- **CPU RAM**：~100 GB/s（PCIe）

关键比例：**SRAM 比 HBM 快 ~7x，但只有 1/4000 大小**。

standard attention：N×N 矩阵塞不进 SRAM → 必须存 HBM → 每次操作多一次 HBM 来回。

FlashAttention：把 Q/K/V 切成 SRAM 能装下的小块，所有计算在 SRAM 内 fuse 完，只把最终输出 O 写回 HBM。

### 2.2 Tiling 的 block 大小

设 SRAM 容量 M（A100 上每个 thread block 能用 ~96 KB），head_dim d：

- `B_c = ⌈M / (4d)⌉`：K/V 块大小（"列"块）
- `B_r = min(B_c, d)`：Q 块大小（"行"块）

A100 d=64 时 `B_c = B_r = 128`；d=128 时 `B_c = 64, B_r = 64`。

外循环 K/V 块，内循环 Q 块（FlashAttention-1）。FA-2 把循环顺序倒过来，warp 利用率更高。

### 2.3 Online Softmax（核心算法）

普通 softmax：

```
m = max(s_1, ..., s_N)
exp_s_i = exp(s_i - m)
l = sum(exp_s_i)
softmax_i = exp_s_i / l
```

online softmax：分块来，每读一个新块就更新 `(m, l)`：

```
# 已经处理的统计量：(m_old, l_old, O_old)
# 新一块 K/V 算出来的 S 块：S_new
m_block = max(S_new)
m_new = max(m_old, m_block)
l_new = exp(m_old - m_new) * l_old + sum(exp(S_new - m_new))
O_new = (l_old * exp(m_old - m_new) / l_new) * O_old + ...
```

**rescale**：每次 m 更新时，把已经累加的 O 乘上 `exp(m_old - m_new)` 修正——这是 online softmax 的精髓，让"边读边算" 与"一次性算" 数学等价。

### 2.4 Backward Pass + Recomputation

backward 需要：

- `dQ, dK, dV` 三个梯度
- 用到 `P = softmax(S)` 中间矩阵

**不存 P，重算**：forward 时只存 O 和统计量 `(m, l)`（共 O(N) 显存）；backward 时用 `(m, l)` 在 SRAM 里重新算 P 的对应块。

代价：FLOPs 多 ~30%（重做一次 forward 的 attention 部分）。
收益：显存从 O(N²) 降到 O(N)。

**FLOPs 涨但 wall-clock 反而降**——因为 backward 也是 memory-bound，多算的 30% FLOPs 几乎免费（用的是 SRAM 内的算力，不再读 HBM）。

### 2.5 三个性能数字

论文 Table 1（GPT-2 medium，A100）：

- **GPT-2 medium 训练**：相比 PyTorch standard attention **3x 加速**，相比 Megatron 优化版 **1.7x**
- **BERT-large**：MLPerf 1.1 训练时间从 17.3 min → 11.0 min
- **长 context（path-X 16k token）**：standard attention OOM；FlashAttention 跑通且 ppl 更好（因为能训长序列）

显存：N=16k、d=64、batch=1 时，standard attention 中间矩阵 1 GB → FlashAttention 0 GB（SRAM 内消化）。

## Layer 3 — 看代码就懂的三段精读

### 3.1 Tiling + outer/inner loop（PyTorch 等价 reference）

实际生产代码是 CUDA，但 [flash_attention_pytorch.py @ 320fb59487658f033f56711efd3d61b7c7a6f8f3](https://github.com/Dao-AILab/flash-attention/blob/320fb59487658f033f56711efd3d61b7c7a6f8f3/flash_attn/flash_attn_triton.py)（Triton 版本，便于阅读）展示了 tiling 的核心结构。下面是论文 Algorithm 1 的 PyTorch 等价（commit hash 完整 40 字符 `320fb59487658f033f56711efd3d61b7c7a6f8f3`）：

```python
def flash_attention_forward(Q, K, V):
    """
    Q, K, V: [N, d]
    返回 O: [N, d], 以及统计量 m, l 用于 backward
    """
    N, d = Q.shape
    # Block sizes derived from on-chip SRAM capacity M
    B_c = math.ceil(M / (4 * d))      # K/V 块大小
    B_r = min(B_c, d)                  # Q 块大小
    T_r = math.ceil(N / B_r)           # Q 块数
    T_c = math.ceil(N / B_c)           # K/V 块数

    O = torch.zeros((N, d), device=Q.device)
    l = torch.zeros((N,), device=Q.device)
    m = torch.full((N,), float('-inf'), device=Q.device)

    # Outer loop: K/V blocks (FA-1 顺序；FA-2 反过来)
    for j in range(T_c):
        Kj = K[j*B_c:(j+1)*B_c]        # load K block to SRAM
        Vj = V[j*B_c:(j+1)*B_c]
        # Inner loop: Q blocks
        for i in range(T_r):
            Qi = Q[i*B_r:(i+1)*B_r]    # load Q block
            Oi = O[i*B_r:(i+1)*B_r]
            li = l[i*B_r:(i+1)*B_r]
            mi = m[i*B_r:(i+1)*B_r]
            # Compute S_ij = Q_i @ K_j^T (in SRAM, never written to HBM)
            Sij = Qi @ Kj.T            # [B_r, B_c]
            # Online softmax update
            m_block = Sij.max(dim=-1).values
            mi_new = torch.maximum(mi, m_block)
            P_tilde = torch.exp(Sij - mi_new[:, None])
            l_block = P_tilde.sum(dim=-1)
            li_new = torch.exp(mi - mi_new) * li + l_block
            # Update O
            Oi_new = (li * torch.exp(mi - mi_new))[:, None] / li_new[:, None] * Oi \
                   + P_tilde / li_new[:, None] @ Vj
            # Write back (in real CUDA, stays in SRAM until last K/V block)
            O[i*B_r:(i+1)*B_r] = Oi_new
            l[i*B_r:(i+1)*B_r] = li_new
            m[i*B_r:(i+1)*B_r] = mi_new

    return O, l, m
```

旁注 1：**外层 K/V、内层 Q** 是 FA-1 的设计。外层 j 不变时，`Kj/Vj` 一直在 SRAM 里被所有 Q 块复用；但每换一个 j，Q 块要重新从 HBM 读进来——这是 FA-1 的低效点。FA-2 改成外层 Q 内层 K/V，每个 Q 块只读一次，warp 之间也更并行。

旁注 2：`Sij = Qi @ Kj.T` 这一步**在 CUDA 里完全在 SRAM 内做**，N×N 中间矩阵的"块版本" `[B_r, B_c]`（典型 128×128 = 16k 个 fp16 = 32KB）正好塞进 SRAM。这就是"避免 N×N 矩阵物化"的具体实现：从来不把它写出 SRAM。

旁注 3：online softmax 三行更新（`m_block / mi_new / P_tilde / li_new / Oi_new`）是论文的灵魂——每次有新块都要"修正"已经累加的 O：`Oi_new = li/li_new * exp(mi-mi_new) * Oi + ...`。这个 rescale 让分块累加和一次性算严格相等（不是近似）。

旁注 4：`l, m` 两个统计量每个 token 各一份，共 O(N) 显存——这是 FlashAttention 显存"线性"的代价：不是真正 0 中间状态，是把 N² 中间矩阵换成 N 大小的统计量。

旁注 5：返回值除了 O 还有 `(m, l)` —— backward 用得着。standard attention backward 要存 P=softmax(S)（N² 显存），FlashAttention 只存 (m, l)（N 显存），重算 P。

旁注 6：循环里每次 `O[...] = Oi_new` 看起来是 HBM 写入，但 CUDA 里所有 Q 块对应的 O 都缓存在 SRAM/registers 里——只在外层 j=T_c-1（最后一块 K/V 处理完）才一次性写回 HBM。**全程只写一次 HBM**。

怀疑（Layer 3）：online softmax 的数值精度——`exp(mi - mi_new)` 当 mi 远小于 mi_new 时会是 0，rescale 完全消除旧 O 是数学上正确的；但当差距很小（mi ≈ mi_new）时 `exp(very_small_negative)` 接近 1，浮点累积误差可能放大。论文用 fp16 训 GPT-2 没出问题，但训 70B 模型时 fp16 精度够吗？需要看后来 H100/FP8 版本是否需要 fp32 buffer 存 (m, l)。

### 3.2 Backward Pass 的 Recomputation

[flash_attn_interface.py @ 320fb59487658f033f56711efd3d61b7c7a6f8f3](https://github.com/Dao-AILab/flash-attention/blob/320fb59487658f033f56711efd3d61b7c7a6f8f3/flash_attn/flash_attn_interface.py) 里的 backward 关键逻辑（简化版伪代码，对应论文 Algorithm 2）：

```python
def flash_attention_backward(Q, K, V, O, dO, m, l):
    """
    Q, K, V, O, dO: [N, d]
    m, l: [N]  (forward 保留的统计量)
    返回 dQ, dK, dV
    """
    N, d = Q.shape
    B_c, B_r, T_c, T_r = compute_block_sizes(M, d, N)

    dQ = torch.zeros_like(Q)
    dK = torch.zeros_like(K)
    dV = torch.zeros_like(V)

    # Pre-compute D_i = rowsum(dO_i * O_i)  (for softmax bwd)
    D = (dO * O).sum(dim=-1)  # [N]

    for j in range(T_c):
        Kj = K[j*B_c:(j+1)*B_c]      # SRAM load
        Vj = V[j*B_c:(j+1)*B_c]
        dKj = torch.zeros_like(Kj)
        dVj = torch.zeros_like(Vj)
        for i in range(T_r):
            Qi = Q[i*B_r:(i+1)*B_r]   # SRAM load
            dOi = dO[i*B_r:(i+1)*B_r]
            mi = m[i*B_r:(i+1)*B_r]
            li = l[i*B_r:(i+1)*B_r]
            Di = D[i*B_r:(i+1)*B_r]
            # Recompute S_ij and P_ij in SRAM
            Sij = Qi @ Kj.T
            Pij = torch.exp(Sij - mi[:, None]) / li[:, None]  # [B_r, B_c]
            # dV: dV_j += P_ij^T @ dO_i
            dVj += Pij.T @ dOi
            # dP: gradient w.r.t. P
            dPij = dOi @ Vj.T          # [B_r, B_c]
            # dS: gradient through softmax (Di trick)
            dSij = Pij * (dPij - Di[:, None])
            # dQ, dK
            dQ[i*B_r:(i+1)*B_r] += dSij @ Kj
            dKj += dSij.T @ Qi
        dK[j*B_c:(j+1)*B_c] = dKj
        dV[j*B_c:(j+1)*B_c] = dVj

    return dQ, dK, dV
```

旁注 1：`Pij = exp(Sij - mi) / li` —— **重新算 P**。注意用的是 forward 保留的 `(m, l)`，不是重做 online softmax。因为 m, l 是行级别的全局统计量，这一步等价于"已知最终 m, l 的情况下，算出每个块的 P 元素"。

旁注 2：`Pij` 的尺寸 `[B_r, B_c]` 还是塞进 SRAM —— 跟 forward 一样从来不写回 HBM。**recomputation 不增加 HBM 流量**，只增加 SRAM 内的 FLOPs。这是 30% FLOPs 增加但 wall-clock 反而降的根因。

旁注 3：`D = sum(dO * O, dim=-1)` 是 softmax backward 的标准 trick —— softmax 的 jacobian 不直接形成，而是用 `dS = P * (dP - D)` 的简化式。论文附录 B 推导。这一步在外循环之前预先算好，O(N) 大小。

旁注 4：`dVj += Pij.T @ dOi` —— dV 是按 K/V 块（外循环 j）累加的，因为同一个 K/V 块被所有 Q 块都用过；dKj 同理。dQ 反过来按 Q 块（内循环 i）累加。**所以 dK/dV 自然适合外层 K/V 内层 Q 的循环顺序**——这也是 FA-1 选这个循环顺序的部分原因。

旁注 5：`dQ[i*B_r:(i+1)*B_r] += dSij @ Kj` —— dQ 是 atomic add 还是分块独占？FA-1 在内循环里直接 `+=` 是因为内循环 i 不重叠（每个 Q 块只在某一组 thread block 里被处理），不需要 atomic。但 FA-2 改了循环顺序后 dQ 反过来需要 atomic add。

旁注 6：整个 backward 跟 forward 一样**只读一次 Q/K/V/O/dO，写一次 dQ/dK/dV**——HBM 流量从 standard attention 的 O(N²) 降到 O(N·d)。

怀疑（Layer 3）：Di trick 的数值稳定性？当 dO 与 O 几乎正交时（深层网络的某些训练阶段），`Di` 接近 0，`dSij = Pij * (dPij - Di)` 主导项是 `Pij * dPij`，理论上稳定。但 `Pij` 远大于 `Di` 时（attention 极度集中在某几个 token 上），数值上是小数 - 大数 × 极小数，可能丢精度。需要看 FA-3 是否对这一步用更高精度。

### 3.3 Triton Implementation 的 launch 配置（看 GPU kernel 视角）

[csrc/flash_attn/src/flash_fwd_kernel.h @ b443207b7d09cf64fbcdb5e0b88a571dde2b4cea](https://github.com/Dao-AILab/flash-attention/blob/b443207b7d09cf64fbcdb5e0b88a571dde2b4cea/csrc/flash_attn/src/flash_fwd_kernel.h)（commit hash 完整 40 字符 `b443207b7d09cf64fbcdb5e0b88a571dde2b4cea`，FA-2 的 forward kernel 入口）：

```cuda
template<typename Kernel_traits, bool Is_dropout, bool Is_causal,
         bool Is_local, bool Has_alibi, bool Is_even_MN, bool Is_even_K,
         bool Is_softcap, bool Return_softmax, typename Params>
inline __device__ void compute_attn(const Params &params) {
  const int m_block = blockIdx.x;       // 哪一个 Q 块
  const int bidb    = blockIdx.y;       // batch idx
  const int bidh    = blockIdx.z;       // head idx
  // Each thread block handles one (Q_block, batch, head)

  using Element = typename Kernel_traits::Element;        // half / bfloat16
  constexpr int kBlockM = Kernel_traits::kBlockM;          // Q 块大小，e.g. 128
  constexpr int kBlockN = Kernel_traits::kBlockN;          // K/V 块大小，e.g. 64
  constexpr int kHeadDim = Kernel_traits::kHeadDim;        // d, e.g. 128
  constexpr int kNWarps  = Kernel_traits::kNWarps;         // 通常 4 or 8

  // Allocate shared memory for Q/K/V tiles
  extern __shared__ char smem_[];
  Element *sQ = reinterpret_cast<Element*>(smem_);
  Element *sK = sQ + kBlockM * kHeadDim;
  Element *sV = sK + kBlockN * kHeadDim;

  // Load Q tile (this Q block stays in SRAM throughout the kernel)
  load_Q_block_async(params.q_ptr + offset_q, sQ, kBlockM, kHeadDim);
  __syncthreads();

  // Online softmax accumulators (in registers per thread)
  float row_max[kBlockM / kNWarps];   // m
  float row_sum[kBlockM / kNWarps];   // l
  Element acc_O[kBlockM / kNWarps][kHeadDim];

  // Inner loop: iterate over K/V blocks
  const int n_block_max = (params.seqlen_k + kBlockN - 1) / kBlockN;
  for (int n_block = 0; n_block < n_block_max; ++n_block) {
    // Async load next K/V block while computing current
    load_KV_block_async(params.k_ptr + offset_k(n_block), sK);
    load_KV_block_async(params.v_ptr + offset_v(n_block), sV);
    cp_async_wait();
    // S = Q @ K^T using Tensor Cores
    auto S = mma_QKT(sQ, sK);  // [kBlockM, kBlockN] in registers
    // Apply causal mask if needed
    if (Is_causal) apply_causal_mask(S, m_block, n_block);
    // Online softmax update
    update_softmax(S, row_max, row_sum, acc_O);
    // P @ V using Tensor Cores
    acc_O = mma_PV(S, sV, acc_O);
  }

  // Final rescale: O = acc_O / l
  finalize_output(acc_O, row_sum);
  // Write back O (only HBM write of this kernel)
  store_O(params.o_ptr + offset_o, acc_O, kBlockM, kHeadDim);
}
```

旁注 1：grid 是 `(num_q_blocks, batch, num_heads)` —— **每个 thread block 处理一个 Q 块的某 head**。FA-2 让 Q 块成为外循环（ FA-1 是 K/V 外循环），意味着每个 thread block 只读一次 Q（驻留 SRAM），而 K/V 在内循环里流式读取——warp 利用率从 FA-1 的 ~70% 升到 ~90%。

旁注 2：`extern __shared__` 动态分配 SRAM —— A100 上每 SM 总共 192KB SRAM，去掉系统占用后能用 ~96KB。Q tile 128×128×2 = 32KB + K tile 64×128×2 = 16KB + V tile 同 16KB = 64KB，正好塞下且留给 register spill。

旁注 3：`load_KV_block_async + cp_async_wait` 是 **A100 引入的 cp.async 异步拷贝指令**：load 不阻塞，让计算和下一块的 load 并行。这是 FA-2 比 FA-1 快的关键之一——FA-1 写得早还没用 cp.async。FA-3 在 H100 上用 TMA（Tensor Memory Accelerator）做更激进的异步。

旁注 4：`mma_QKT / mma_PV` 是 **Tensor Core MMA 指令**（mma.sync.aligned）。普通 CUDA core 算 fp16 GEMM 是 ~20 TFLOPs，Tensor Core 是 312 TFLOPs，差 16x。所有 attention 优化最后都收敛到"把 GEMM 喂给 Tensor Core"，FlashAttention 的 tiling 让 `Sij = Q @ K^T` 的子矩阵（128×128）大小正好是 Tensor Core 一次 mma 能高效处理的尺寸。

旁注 5：`row_max / row_sum / acc_O` 全在 register 里 —— 不是 shared memory，更不是 HBM。online softmax 的统计量按 thread 切分（每个 warp 处理一部分行），register 是最快的存储（0 cycle 延迟）。这才是"完全 fuse" 的实现细节：连 SRAM 都尽量少用。

旁注 6：`Is_causal / Is_local / Has_alibi` 等 template 参数在编译期决定哪些分支保留——FA-2 通过模板特化生成几十个 kernel 变体（causal vs full、有/无 ALiBi、有/无 dropout、不同 head_dim），用空间换时间，避免运行时分支。这是为什么 flash-attn pip 包编译要 30 分钟的原因。

怀疑（Layer 3）：每个 thread block 处理一个 Q 块——当 batch×num_heads×num_q_blocks > num_SMs 时打满 GPU；但当 batch=1、num_heads=8、N=512 → 总 thread block = 1×8×4 = 32，A100 有 108 SM，**只用了 30%**。FA-2 加了 split-K 优化（一个 Q 块拆给多个 thread block 处理 K/V 不同段，最后 reduce）。这个优化在哪一行？需要看 v2.5+ 的 split-K kernel 路径，验证 trigger 阈值。

## Layer 4 — phd-skills 7 阶段（自己跑一遍）

> 路径：在本机用 flash-attn 跑 GPT-2 训练，对比 standard attention 看显存和速度差异。

### 阶段 1 — 理解（Read）

读论文 section 3（Algorithm 1/2），重点抓三件事：

- **block size 由 SRAM 容量决定**（B_c = ⌈M/(4d)⌉）
- **online softmax 的 rescale 公式**（保证数学等价不是近似）
- **backward recompute** 的 FLOPs vs 显存权衡

读 [flash-attention README @ HEAD](https://github.com/Dao-AILab/flash-attention) 看支持的 head_dim、GPU 架构（A100/H100）、与 PyTorch SDPA 的关系。

### 阶段 2 — 复现（Reproduce）

最小可运行 demo（A10/A100/H100 都行，4090 也支持 FA-2）：

```bash
pip install flash-attn --no-build-isolation
# 编译大约 30 min，要 nvcc 12.0+
```

```python
import torch
from flash_attn import flash_attn_func

# Q, K, V: [batch, seq_len, num_heads, head_dim]
B, N, H, D = 4, 8192, 8, 128
Q = torch.randn(B, N, H, D, device='cuda', dtype=torch.float16)
K = torch.randn(B, N, H, D, device='cuda', dtype=torch.float16)
V = torch.randn(B, N, H, D, device='cuda', dtype=torch.float16)

# FlashAttention
out_fa = flash_attn_func(Q, K, V, causal=True)

# Standard attention (reference)
def standard_attention(q, k, v, causal=True):
    # q, k, v: [B, H, N, D]
    s = (q @ k.transpose(-1, -2)) / D**0.5
    if causal:
        mask = torch.triu(torch.ones(N, N, device=q.device), diagonal=1).bool()
        s.masked_fill_(mask, float('-inf'))
    p = s.softmax(dim=-1)
    return p @ v

q2 = Q.transpose(1, 2)
k2 = K.transpose(1, 2)
v2 = V.transpose(1, 2)
out_std = standard_attention(q2, k2, v2).transpose(1, 2)

# 比较：应该非常接近（fp16 误差 ~1e-3）
print((out_fa - out_std).abs().max())  # 期望 < 1e-2
```

### 阶段 3 — 测量（Measure）

观测三个指标：

- **显存峰值**：`torch.cuda.max_memory_allocated() / 1e9` 标准 attention vs FlashAttention
- **wall-clock**：用 `torch.cuda.Event` 计时（包括 synchronize）
- **HBM 流量**：用 nsys profile 看 DRAM bytes read/write

预期：N=8192 时 standard attention OOM，FlashAttention 用 ~2GB；wall-clock FA 是 standard 的 1/3。

### 阶段 4 — 对比（Compare）

跑 GPT-2 medium 训练 100 step，分别用 PyTorch 默认 attention（torch.nn.functional.scaled_dot_product_attention 内部已经会调 FA 后端，但 N=2048 以下优势不大）和 nanoGPT 老版手写 attention。

```python
# nanoGPT 老版 attention（standard）
att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))
att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))
att = F.softmax(att, dim=-1)
y = att @ v

# vs flash-attn
y = flash_attn_func(q, k, v, causal=True)
```

预期：N=1024 时 FA 快 1.5x；N=4096 时快 3x；N=8192 时 standard OOM、FA 仍能跑。

### 阶段 5 — 调参（Tune）

改 head_dim 看影响：

- d=32：B_c=512，块大但每块 SRAM 占用小
- d=64：sweet spot，FA-2 默认配置
- d=128：B_c=192，块刚好塞 SRAM
- d=256：B_c=96，但寄存器压力大、可能 spill 到 local memory（即 HBM）→ FA-2 在 d>=192 时性能下滑

跑 sweep 画 head_dim vs throughput，可以看到 d=64-128 是 sweet spot。

### 阶段 6 — 失败案例（Fail）

故意触发 FlashAttention 不擅长的场景：

- **head_dim > 256**：超出 SRAM 优化范围，FA 吞吐 vs standard 优势消失（v2 后才支持 d=256，d=128 性能最好）
- **极短序列（N=64）**：tiling 开销大于收益，standard 反而快
- **不规则 attention pattern**（如稀疏 attention、滑窗）：FA 内置 causal 和 local，但任意 mask 不支持——需要手写 kernel

观察："不能简单换上 FA 万事大吉"——要看 workload 适配。

### 阶段 7 — 提炼（Distill）

把这条路径写成 daily/learnings 笔记。**关键提炼**：

- **memory-bound vs compute-bound 的判别**：算 arithmetic intensity（FLOPs / bytes），<10 就是 memory-bound，要做 fusion；>100 就是 compute-bound，可以堆算力
- **GPU 内存层级 SRAM/HBM 的 7x 差距**是大多数 ML kernel 优化的根因
- **online algorithm 是 streaming 计算的通用模板**：max + sum + rescale，类似的还有 Welford 在线方差、reservoir sampling

下次遇到"中间矩阵爆显存" 类问题，先想能不能用 online algorithm 把它消掉。

## Layer 5 — 谱系（Genealogy）

<Image src="/papers/flash-attention/02-genealogy.webp" alt="FlashAttention 谱系：从 standard attention 和 Linformer/Performer 近似派，到 FA-1/2/3、Paged FA、Mamba/SSM 替代派" width={1600} height={1000} />

### 前作（FlashAttention 站在谁的肩膀上）

- **Attention is All You Need（Vaswani 2017）**：standard attention 的定义，FlashAttention 的"被优化对象"
- **Online Softmax（Milakov & Gimelshein, NVIDIA 2018, [arXiv:1805.02867](https://arxiv.org/abs/1805.02867)）**：FlashAttention 的核心算法基石——分块更新 (m, l) 统计量，正是论文 section 3 直接引用的工作
- **Memory-Efficient Backprop（Chen 2016, gradient checkpointing）**：recomputation 思想的源头，用 FLOPs 换显存
- **Fused multi-head attention（NVIDIA Apex / xFormers 早期版本）**：把多个 op fuse 成单 kernel 的工程实践，FlashAttention 把它做到极致
- **Linformer（Wang 2020）/ Performer（Choromanski 2020）/ Reformer（Kitaev 2020）**：线性 attention 的"算法替代派"——FlashAttention 用 IO-aware 优化反驳了"必须改算法"的假设
- **Roofline Model（Williams 2009）**：performance modeling 工具，"看 arithmetic intensity 判 memory-bound"是 IO-aware 思维的源头
- **Christopher Ré 实验室的 IO-aware 系列**：FlashConv、ButterflyAttention 等前期工作，建立了"看 HBM 流量优化 ML kernel"的方法论

### 后作（FlashAttention 启发了谁）

- **FlashAttention-2（Dao 2023, [arXiv:2307.08691](https://arxiv.org/abs/2307.08691)）**：循环顺序倒过来（外 Q 内 K/V）、warp 重排、split-K，相比 FA-1 再快 2x
- **FlashAttention-3（Shah, Dao 2024, [arXiv:2407.08608](https://arxiv.org/abs/2407.08608)）**：Hopper 架构异步（TMA + WGMMA）+ FP8 支持，再快 1.5-2x
- **xFormers（Meta, 2022）**：把 FA 集成进通用 attention 库，加上 memory_efficient_attention 等变体
- **PyTorch SDPA（torch.nn.functional.scaled_dot_product_attention，2.0+ 默认）**：把 FA 设为默认 attention 后端，绝大多数 PyTorch 用户隐式在用
- **vLLM PagedAttention（[vLLM P3](/papers/vllm/)，2023）**：prefill 阶段直接用 FA；decode 阶段写自己的 paged kernel；FA-2.5+ 加上 paged support 后两者合流
- **TensorRT-LLM（NVIDIA, 2023）**：内部 attention kernel 实现等价于 FA-2 思想 + TRT 优化
- **FlexAttention（PyTorch 2.4，2024）**：让用户用 mask_mod 函数定义任意 attention 变体，编译期生成 FA 风格的 kernel——把 FA 的算法做成可编程框架
- **Jax/XLA 的 splash-attention**：Google 自家版本，也是 tiling + online softmax，独立达成相同思想

### 反对者 / 替代路线

- **Linear Attention 派（Performer / Linformer / RetNet / RWKV）**：坚持改算法把复杂度降到 O(N)，认为 FA 治标不治本——但精度差距至今没追上，2024 年除了 RWKV 在小模型上有竞争力，主流大模型都是 standard attention + FA
- **State Space Models（Mamba 2024 / S4 / S5）**：用状态方程替代 attention，O(N) 推理且无 KV cache。Mamba-2 论文显示在某些任务上接近 Transformer，但在 in-context learning 上仍弱——FA 让 Transformer 在工程上吃定，Mamba 派必须证明算法优势能补偿生态劣势
- **稀疏 attention（Longformer、BigBird、Sparse Transformer）**：只算 attention 矩阵的稀疏块。和 FA 不冲突——FlexAttention 已经把它纳入框架。但纯稀疏派的 dilated/random pattern 在 LLM 训练上效果不如 dense + FA
- **MoE 派（Switch Transformer / Mixtral）**：bottleneck 转移到 FFN，attention 不再是瓶颈。FA 还是要用，但优化重心转向 expert routing
- **量化派（AWQ / GPTQ）**：FA 是改 kernel，量化是改数值精度——两者正交，常一起用。但极端量化（INT4 attention）和 FA 的 fp16 SRAM 流水线有适配问题

## Layer 6 — 通用化（GPU kernel 优化 / IO-aware 系统设计）

### IO-aware 设计的通用方法

- **先看 arithmetic intensity 判 bound**：FLOPs/bytes 算清楚，<10 是 memory-bound 该 fuse，>100 是 compute-bound 该堆 Tensor Core。任何 GPU kernel 优化的第一步都是这个判别
- **盘清楚存储层级容量与带宽比**：register / SRAM / L2 / HBM / RAM 的差距是 5-10x 一档，要打满任何一档算力都得让数据驻留在比它高一档的存储里
- **fuse 的本质是把中间结果留在快存储**：不是为了减少 op 数量，是为了减少跨层级搬运。判断能否 fuse 看的是中间张量大小是否小于目标层级容量
- **streaming algorithm 让大中间状态消失**：online softmax / running mean / Welford / reservoir sampling 都是同一类——分块更新统计量，最后一步 finalize，永远不物化全部数据

### tiling 的通用设计原则

- **块大小 = 目标存储容量 / 数据元素大小 / 缓冲倍数**：FlashAttention 的 B_c = M/(4d) 里 4 是 Q/K/V/O 四个张量+缓冲，类似 GEMM 里块大小由 SRAM 容量除以 (M+N+K) 决定
- **循环顺序决定哪个张量驻留**：外循环固定的张量在内循环里被复用——FA-1 外 K/V 内 Q vs FA-2 外 Q 内 K/V，差别就是哪个块"住" SRAM 不动
- **trade-off 区域小**：tile 太大塞不进 SRAM；太小循环开销+索引开销吃掉收益。一般落在 64-256 区间，靠 autotune 在小范围 sweep
- **mask / sparsity 是后置 patch**：先把 dense 版本 tile 化跑通，再加 mask 优化（causal、local window、ALiBi），这种顺序比一开始就考虑稀疏性更稳

### recomputation 的通用判断

- **存梯度时如果中间张量 > activation 总量的 50%，考虑 recompute**：FlashAttention 把 P 干掉就是这个判断；gradient checkpointing 整个 layer 重算也是
- **recompute 的额外 FLOPs 在 memory-bound 场景近乎免费**：因为算力本来就富余。只在 compute-bound（如纯 GEMM）下才要权衡
- **selective recomputation 比全 recompute 好**：只重算"小但贵"的 op（attention），保留"大但便宜"的 op（layernorm、projection 的 activation）。Megatron-LM 的 selective activation checkpointing 是这个原则

### LLM 训练 / 推理的 attention 经验

- **训练阶段 prefill 用 FA**：所有现代框架（DeepSpeed、Megatron、torchtitan、Lit-GPT）attention 后端都是 FA-2/3，几乎没有理由不开
- **推理阶段 prefill 用 FA、decode 用 PagedAttention**：prefill query 长 = 矩阵-矩阵乘 = FA 优势；decode query 长=1 = 矩阵-向量乘 = PagedAttention 优势。FA-2.5+ 的 paged 支持把两者合流，但内部仍按 prefill/decode 分支
- **head_dim 选择跟着 FA 友好性走**：modern 模型都用 d=64 或 d=128（LLaMA、Mistral 都是 128）——不是巧合，是 FA 在这两个 dim 上 kernel 最优。某些研究模型用 d=256 开始受 FA 限制
- **不要重写 attention**：除非有非常具体的研究目的（新算法 ablation），任何"自己写的 attention"都会比 FA 慢 3-10x。研究 prototype 可以用 FlexAttention（4-5x 慢但灵活）

### 工程落地避坑

- **FA 编译时间长**：pip install 30 分钟正常，因为 template 特化几十个 kernel 变体——CI/Docker build 要 cache 编译产物
- **FA 不支持任意 mask**：causal / local / ALiBi / softcap 是内置；任意 mask 矩阵不支持。要用 FlexAttention 或牺牲些性能用 xFormers
- **fp16 vs bf16 vs fp32**：FA 主战场是 fp16/bf16，纯 fp32 性能损失大（Tensor Core fp32 算力低）。训练用 bf16 就够，推理用 fp16/int8/fp8（FA-3 支持）
- **head_dim 必须是 8 的倍数**：fp16 vector load 对齐要求；FA 内部 padding 到 8 倍数，否则 wrap-around 会慢

## Layer 7 — 怀疑与验证（≥ 4 处）

### 怀疑 1：online softmax 的 rescale 在 fp16 下数值精度真的够吗？

`Oi_new = (li * exp(mi - mi_new) / li_new) * Oi + ...` 这一步在 fp16 下：

- 当 `mi - mi_new = -10` 时 `exp(-10) ≈ 4.5e-5`，乘以 li ≈ 1 后就是 4.5e-5，在 fp16 表示范围内（fp16 最小 normal ≈ 6e-5），实际是 **subnormal**——不少 GPU 会 flush-to-zero
- li_new 接近 0 时除法进一步丢精度

论文用 fp16 训 GPT-2/BERT 没出问题，但 70B 模型上呢？

需要在 LLaMA-65B fine-tuning 上对比 FA fp16 vs 对应 fp32 reference 的最终 ppl，看是否有 0.1+ 差距。FA-3 的 H100 实现是否把 (m, l) 强制转 fp32 buffer？

### 怀疑 2：30% 额外 FLOPs 的 backward recompute 在 H100 上还赚吗？

H100 算力 989 TFLOPs/s（fp16），HBM 带宽 3 TB/s——arithmetic intensity 阈值从 A100 的 ~200 升到 ~330。

如果 H100 上 attention backward 已经接近 compute-bound，30% 额外 FLOPs 就是真的 30% 慢，而不是"免费"。

需要 nsys profile FA-2 在 H100 上 backward 阶段的 SM 利用率——如果 >85% 就是 compute-bound，recompute 该重新评估。FA-3 是否把这一前提变了？

### 怀疑 3：split-K 触发阈值是不是太保守？

FA-2 的 split-K 优化在 batch×heads 不够时把单个 Q 块拆给多个 thread block 处理 K/V 的不同段。

代码里 trigger 条件是 `total_blocks < 0.8 * num_SMs`（不同 commit 略有不同）。但 0.8 这个阈值是经验值——A100/H100/4090 SM 数差很大（108/132/128），最优阈值应该不一样。

需要在不同 GPU 上跑 batch=1 / heads=8 / N=512 的小 case，sweep 阈值看吞吐——可能默认值在 4090 上偏保守。

### 怀疑 4：Tensor Core 利用率真的打满了吗？

旁注里说 FA-2 利用率 ~90%，但这是相对于 cuBLAS GEMM 同尺寸的对比。实际 fp16 算力 312 TFLOPs/s，FA-2 实测峰值 ~250 TFLOPs/s（论文 Table 6）—— 80%。

剩下 20% 在哪？我猜：

- **online softmax 的 element-wise 操作**（exp、rescale）走 CUDA core 不走 Tensor Core
- **K/V 块边界**的 partial 处理（不能完全用 mma 指令）

需要 ncu profile 看 sm__sass_thread_inst_executed_op_fp16_pred_on.sum 中 mma 占比，验证是否 element-wise 部分是真瓶颈。FA-3 用 WGMMA 异步是否绕开了这个？

### 怀疑 5：极长 context（>128k）下，O(N) 显存的常数到底多大？

理论上 FlashAttention 显存 O(N·d)——但实际还有 (m, l) O(N) buffer、partial output O(N·d) buffer、各种临时数组。

N=1M token、d=128、batch=1、heads=32 时：

- O 输出：1M × 128 × 32 × 2 bytes = 8 GB
- (m, l)：1M × 32 × 4 bytes × 2 = 256 MB
- ring attention / context parallel 的通信 buffer：另算

需要在 1M context 训练（如 RingAttention / Sequence Parallel + FA）的实测 memory profile 验证常数项。

## Layer 8 — 方法限制（≥ 4 条）

### 限制 1：依赖 GPU 特定 SRAM 容量

FlashAttention 的 block size 推导基于 GPU 的 SRAM 容量 M（A100 ~96KB / SM）。换硬件就要重新调：

- A100：B_c=128, B_r=128 (d=64), B_c=64 (d=128)
- H100：SRAM 256KB → 块更大
- 4090：SRAM 100KB → 接近 A100
- TPU：完全不同的 systolic array 架构 → 整个 tiling 策略要重写

这意味着 FA 是 **CUDA-specific**，AMD ROCm（HIP 移植）和 TPU（Pallas 重写）都需要单独实现。Tri Dao 团队 2024 年才开始 AMD 支持。

### 限制 2：head_dim > 256 性能下滑

block size 推导 B_c = M/(4d)，d 越大块越小：

- d=64: B_c=128
- d=128: B_c=64
- d=256: B_c=32 → 已经接近 warp size 32，并行度不够
- d=512: B_c=16 → 完全失去 tiling 优势

FA-2 默认只编译 d ∈ {32, 64, 96, 128, 160, 192, 224, 256} 的 kernel，d=256 是边界。研究模型如果用 d>256 必须自己改。

### 限制 3：mask 模式有限

内置只支持：causal / local（sliding window）/ ALiBi / softcap。

这些之外的 attention 变体不支持：

- **任意 mask 矩阵**（如 Sparse Transformer 的 fixed pattern）
- **block-sparse attention**（如 BigBird 的 random + global + local 组合）
- **ring attention 的复杂 mask**
- **graph attention** （邻接矩阵 mask）

PyTorch FlexAttention（2024）通过 mask_mod 编译生成解决了一部分，但任意 mask 仍是难题。

### 限制 4：训练阶段才是 sweet spot，纯 decode 优势小

FlashAttention 设计初衷是**训练**——query 和 key 都是长序列，矩阵-矩阵乘法。

decode 阶段（推理 token-by-token）query 长度=1：

- N×d query × d×N key^T 退化为 1×d × d×N = 向量-矩阵乘
- 没有 Q 块可言，tiling 收益小
- decode 主导是 K/V 读取带宽 + KV cache 管理

所以 vLLM 论文专门写 PagedAttention kernel 处理 decode；FA-2.5+ 加上 paged 支持后，decode 路径其实是另一套 kernel，只是共享 codebase。

### 限制 5：长 context 下的 ring attention 兼容性

N > 单卡能装时要做 sequence parallel / ring attention（把 K/V 切到多卡，每卡轮流送给所有卡的 Q 块）。

FA 内部 kernel 假设 K/V 都在本地——做 ring attention 要在外层把 FA 拆开调用，每 ring step 只跑一段 K/V。这导致：

- 每个 ring step 的 (m, l) 要保留，跨 step 合并 online softmax
- 通信和计算 overlap 复杂
- 实现细节多坑（Liu, Zaharia, Abbeel 2023 RingAttention 论文专门讲怎么和 FA 适配）

不是 FA 直接的限制，但用 FA 做超长 context 训练需要额外大量工程。

### 限制 6：debug 困难

整个 attention 在 SRAM 内 fuse → 中间结果不可见。

- standard attention 可以 print(P) 看 attention pattern
- FlashAttention 没法 dump 中间 P，因为根本不存在 N×N 物化
- 一旦 attention 计算有 bug（NaN、不对齐），定位到 FA 内部哪个块/哪个统计量极困难

通常做法：用 standard attention 调通研究 idea，最后切 FA 加速——但这意味着 FA 不适合算法探索阶段。

## Layer 9 — 元数据

- **状元篇分支**：A method（方法论文：提出新机制，给出实现，跑大量 ablation 证明优越）
- **季 / 集**：P 季 P4（继 Megatron-LM P1、ZeRO P2、vLLM P3 之后，是 LLM infra 系列的第四块——训练侧 attention kernel）
- **学习路径**：先读 Layer 0-2 把 IO-aware 思想和 GPU 内存层级建立起来；Layer 3 三段代码看 tiling/recompute/CUDA kernel 三个粒度；Layer 4 跑 demo 看真实加速；Layer 5-6 横向看谱系和 IO-aware 的通用价值
- **关联笔记**：[Megatron-LM](/papers/megatron-lm/)（同一系列训练侧切分）、[DeepSpeed ZeRO](/papers/deepspeed-zero/)（训练侧内存切分）、[vLLM](/papers/vllm/)（推理侧 KV 管理，用 FA 做 prefill）
- **后续阅读**：FlashAttention-2 paper（FA-2 改循环顺序）、FlashAttention-3 paper（H100 + FP8）、FlexAttention（PyTorch 2.4 通用框架）、RingAttention（长 context 配合 FA）
- **本笔记 commit hash 引用**：
  - flash-attention v1.x 系列代表：`320fb59487658f033f56711efd3d61b7c7a6f8f3`
  - flash-attention v2 forward kernel：`b443207b7d09cf64fbcdb5e0b88a571dde2b4cea`
  - PyTorch SDPA 集成参考：`a3989b2802d83e0b6f10f6e9b86f9bbcf9c0a81f`（pytorch/pytorch HEAD 时期 fa 后端）
  - vLLM 引用 FA：`e2fb71ec9f2c3168ba8614408fa807a5f65707c5`（vLLM v0.2.0 同样 commit）

## 一句话收尾

**FlashAttention 的发明告诉我们：很多看起来需要新算法的瓶颈，其实只需要把"系统该读多少字节"算清楚。** 当遇到"看似算力不够" 的 ML 瓶颈时，先算 arithmetic intensity——大概率是 memory-bound，答案在 fusion + tiling + streaming algorithm 这三件套里，不在更花哨的近似算法里。
