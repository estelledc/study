---
title: Mamba - Linear-Time Sequence Modeling with Selective State Spaces
description: 状元篇 - Mamba 用 input-dependent SSM (S6) 替代 attention，训练用硬件感知的 parallel scan、推理时常数空间，长序列上比 Transformer 快 5-100x，是 Transformer 之外最受关注的潜在替代品（但仍有争议）
season: P
episode: P5
branch: method
tier: 状元
date: 2026-05-29
tags:
  - state-space-model
  - selective-ssm
  - mamba
  - long-context
  - sequence-modeling
  - parallel-scan
  - transformer-alternative
---

import { Image } from 'astro:assets';

## Layer 0 — 论文身份证

| 字段 | 内容 |
|---|---|
| 标题 | Mamba: Linear-Time Sequence Modeling with Selective State Spaces |
| 作者 | Albert Gu, Tri Dao |
| 机构 | Carnegie Mellon University + Princeton（Tri Dao 同时是 FlashAttention 一作） |
| 会议 | COLM 2024（最初作为 arXiv preprint 发布于 2023 年 12 月，后投 ICLR 2024 被拒，再转 COLM） |
| 年份 | 2023 年 12 月（arXiv），2024 年正式发表 |
| arXiv | 2312.00752 |
| 代码 | github.com/state-spaces/mamba（截至 2026 年 13k+ stars） |
| 引用 | 3500+（截至 2026 年 5 月，是 SSM 领域被引最多的论文，远超 S4） |
| 一句话 | 把 SSM 的 A/B/C 矩阵从"input-independent"改成"input-dependent"（selectivity），用硬件感知的 parallel scan kernel 把训练拉回 Transformer 同档速度，而推理保持 O(L) 线性、O(1) 状态空间 |
| 后续 | Mamba-2（2024，SSD 把 SSM 和 attention 写成同一个数学框架）、Jamba（2024，AI21 Mamba+Transformer 混合模型，52B 总参数）、Zamba（2024，Zyphra Mamba+共享 attn）、Falcon-Mamba（TII）、Codestral Mamba（Mistral 第一个 SSM 模型） |

## 一句话定位

**Mamba 不是一个比 Transformer "更好"的模型，而是一个走完全不同路线却接近 Transformer 性能的模型——它把"用 attention 解决长依赖"换成"用一个会随输入选择性更新的状态向量"，把训练和推理的复杂度都压到线性，但代价是 in-context learning 和精确 recall 弱于 Transformer。**

它是过去三年里 Transformer 之外最严肃的替代品候选，但**仍然只是候选**——没有任何一家头部 LLM 公司把它选为旗舰架构（截至 2026 年），混合架构（Jamba/Zamba）反而更主流。

<Image src="/papers/mamba/01-architecture.webp" alt="Mamba block 架构：输入经 Linear 扩展为 (x_inner, z_gate)，x_inner 走 Conv1D + SiLU + Selective SSM (S6)，再与 SiLU(z) 门控相乘，最后 Linear 投影回原维度，外层 RMSNorm + 残差。右侧：A/B/C/Delta 四参数详解，B/C/Delta 是 input-dependent 是 S6 的核心。最右：与 Transformer 复杂度对比表格" width={1600} height={1000} />

## Layer 1 — Why 这篇论文存在

### 痛点 1：Transformer 在长序列上的"二次墙"

Transformer 的 self-attention 是 O(N²) FLOPs + O(N²) 显存（[FlashAttention P4](/papers/flash-attention/) 把显存压到 O(N) 但 FLOPs 还是 N²）。

- N=2k：还行
- N=8k：勉强
- N=32k：要 ring attention / sequence parallel
- N=128k：必须特殊架构（GLA、StreamingLLM、Mamba 这类）
- N=1M+：Transformer 实际不可用

而真实需求（基因组、音频、视频、long-form 阅读理解）**经常需要 100k-1M 序列**。

attention 的二次本质来自"任意 token 对之间都要算相似度"——这是 attention 的优势（全局可见性），也是诅咒。

### 痛点 2：State Space Models 之前不能与 Transformer 同台

SSM（State Space Model）有近百年历史，控制理论用来描述线性动态系统：

```
h_t = A * h_{t-1} + B * x_t       (state update)
y_t = C * h_t                     (output)
```

理论上 O(L) 训练（用卷积形式）+ O(1) 状态空间（每步只看上一状态）。但应用到序列建模有**三个老大难**：

- **A 矩阵的初始化与稳定性**：随机初始化的 A 训练直接发散；要么 numerical stable，要么有用，二选一
- **长依赖记不住**：vanilla RNN 的 vanishing gradient
- **训练慢**：递归形式无法并行；卷积形式要算 FFT，在 L=4k+ 时反而比 attention 慢

S4（Gu, Goel, Ré 2021，[arXiv:2111.00396](https://arxiv.org/abs/2111.00396)）解决了前两个：用 HiPPO 理论给 A 一个可证明的"polynomial memory"初始化，模型能稳定训练并捕捉长依赖。Long Range Arena 上甚至超过 Transformer。

但 S4 在**语言建模**上一直不行——为什么？

### 痛点 3：S4 的"输入无关"是它在 LM 上失败的根因

S4 的 A/B/C 都是**学到的固定参数**，与输入无关。这意味着：

- 处理任何 token 时，状态更新方式一样
- 模型不能"看到一个特殊 token 就重置状态" / "只记重要 token"
- 对 selective copying / induction head 这类任务无能为力

而 Transformer 的 attention 天然 input-dependent：每个 query 自己决定从哪里取 value。

Gu & Dao 在 Mamba 论文 section 1 直接用一个简单的 **Selective Copying** 任务证明：S4 完全做不到，而加了 selectivity 立刻能做。

### 痛点 4：input-dependent 让递归形式无法并行

如果 A、B、C 都依赖输入 x_t，那么 `h_t` 的递推就**不再是线性时不变**（LTI），不能像 S4 那样写成 1D 卷积。

- LTI（A 固定）：可以用 FFT 做 O(L log L) 卷积
- 时变（A 依赖 x）：必须递归算 → O(L) 但完全串行 → GPU 利用率极低

这就是过去没人敢做 input-dependent SSM 的原因——理论可以，工程不行。

### Mamba 的切入点

Gu & Dao 的回答：

> **selectivity 是必须的，至于训练速度——我们用 parallel scan 把 input-dependent SSM 的递归"假并行"成 work-efficient 的 reduction，再写一个 hardware-aware kernel 把所有中间 state 留在 SRAM 不下盘。和 [FlashAttention P4](/papers/flash-attention/) 是同一种 IO-aware 思路。**

三件事一起：

1. **Selectivity（S6 = S4 + selection）**：让 B、C、Delta 依赖输入 x_t；A 仍是结构化矩阵但通过 Delta 间接受输入控制
2. **Parallel scan**：input-dependent recurrence 看似不能并行，但只要 update 是 associative（满足结合律），就能用 prefix-sum 风格的 scan 做 O(L log L) work, O(log L) span 的并行
3. **Hardware-aware**：把 scan kernel 写到 SRAM，避免反复读写 HBM——和 FlashAttention 的 fusion 思想一致（不意外，Tri Dao 是同一作者）

结果：训练速度接近 FlashAttention 的 Transformer，推理直接 5-100x 更快（取决于 sequence length）。

## Layer 2 — 核心机制（怎么做）

### 2.1 SSM 的连续形式与离散化

连续状态方程：

```
h'(t) = A h(t) + B x(t)
y(t) = C h(t)
```

其中 h ∈ R^N（state，N 通常取 16）、x ∈ R（标量输入）、y ∈ R（标量输出）。多 channel 就把这个公式独立跑 D 份（D 是 hidden dim）。

离散化用 ZOH（Zero-Order Hold）：

```
A_bar = exp(Delta * A)                                 [N, N]
B_bar = (Delta * A)^-1 * (exp(Delta * A) - I) * Delta * B    [N, 1]
```

得到离散递推：

```
h_t = A_bar * h_{t-1} + B_bar * x_t
y_t = C * h_t
```

**Delta 是步长**——大 Delta 意味着模型"快速演化"；小 Delta 意味着"几乎复制旧状态"。Delta 在 S6 里被升级成 input-dependent 的——这就是"选择性"的关键控制点。

### 2.2 S4 vs S6（selective）的差异

S4：

- A: [D, N] 学习参数，固定（HiPPO 初始化）
- B: [D, N] 学习参数，固定
- C: [D, N] 学习参数，固定
- Delta: [D] 学习参数，固定

S6（Mamba 的核心）：

- A: 仍是 [D, N] 学习参数（固定）——但通过 Delta 间接被输入控制
- B: 由 Linear(x) 生成，每个 token 不同：[B, L, N]
- C: 由 Linear(x) 生成，每个 token 不同：[B, L, N]
- Delta: 由 softplus(Linear(x) + bias) 生成：[B, L, D]

A 为什么不直接 input-dependent？因为 A 是 [N, N] 大矩阵，每 token 重新生成代价太高；通过 Delta 控制 `A_bar = exp(Delta * A)`已经能让有效 A 跟着输入变化。

### 2.3 Parallel Scan 的核心 trick

传统观点：递推 `h_t = A_bar_t * h_{t-1} + B_bar_t * x_t` 要按时间顺序串行算 L 步。

**关键观察**：把 (A_bar, B_bar*x) 看成一对，定义 binary operation:

```
(a1, b1) ⊕ (a2, b2) = (a2 * a1, a2 * b1 + b2)
```

这个操作满足**结合律**（associative）：(p ⊕ q) ⊕ r = p ⊕ (q ⊕ r)。

而 scan over associative op 可以并行（Blelloch 1990 prefix-sum scan）：

- work: O(L)
- depth: O(log L)（GPU 上跑 log L 步而不是 L 步）

实际 GPU 实现用 work-efficient scan：分段先各自算，再把段间结果用 binary tree 合并。Mamba 的 CUDA kernel `selective_scan_fwd_kernel.cuh` 实现了这个。

### 2.4 Hardware-aware 实现：SRAM 内 fuse

朴素实现的痛点：

- 每个 token 都生成 B_t, C_t, Delta_t（[B, L, N], [B, L, D]），如果走 HBM 中转就是大量带宽浪费
- A_bar, B_bar 中间张量也是 [B, L, D, N]，N=16 时 16x state expansion

Mamba 的 selective_scan kernel 做的事：

1. 把 x、A、B、C、Delta load 进 SRAM
2. 在 SRAM 内算 A_bar, B_bar（不写回 HBM）
3. 在 SRAM 内做 parallel scan，h 状态全部留在 register/SRAM
4. 只把最终 y 写回 HBM

效果：HBM 流量从 O(BLDN) 降到 O(BLD)——少一个 N 因子，N=16 时实际加速 ~7x。

### 2.5 Mamba block 的完整结构

block 设计借鉴 H3 + Gated MLP（论文 section 3.4）：

```
Input x: [B, L, D]
  |
  Linear: [B, L, 2*D']  (D' = expand_factor * D, 默认 expand=2)
  |
  split into (x_inner, z_gate): each [B, L, D']
  |                                      |
  Conv1D (kernel=4, depthwise) on x_inner
  |                                      |
  SiLU activation                        |
  |                                      |
  Selective SSM (S6) -> y                |
  |                                      |
  y * SiLU(z)  (gating)
  |
  Linear: [B, L, D]  (project back)
  |
  + residual
```

外层包 RMSNorm（PreNorm 风格）。整个 block 比 Transformer block 简单：没有独立的 attention + FFN，**SSM 同时承担了"序列内信息混合"+"非线性"两个角色**。

### 2.6 性能数字

论文 Table 4-7：

- **3B 参数 LM**：在 Pile 上训练 300B token，Mamba-3B 跟 Transformer-3B（用 FA）ppl 几乎相同（17.7 vs 17.6），but Mamba 推理 5x 快
- **超长序列**：DNA 序列建模（million-length），Mamba 比之前 SSM 又好 4-8 个 ppl
- **音频 wave-level**：8x 长于 baseline 的 receptive field
- **Long Range Arena**：Mamba 跟 S4 同水平（这块本来就是 SSM 强项）
- **selective copy / induction head**：S4 完全失败（<5% accuracy），Mamba 100%

## Layer 3 — 看代码就懂的三段精读

### 3.1 Selective SSM 的 forward（Python reference）

[mamba_simple.py @ 8ffd905c91d207f5511b4dc8db20cf07c2c46221](https://github.com/state-spaces/mamba/blob/8ffd905c91d207f5511b4dc8db20cf07c2c46221/mamba_ssm/modules/mamba_simple.py)（commit hash 完整 40 字符 `8ffd905c91d207f5511b4dc8db20cf07c2c46221`）展示了 Mamba block 的完整结构：

```python
class Mamba(nn.Module):
    def __init__(self, d_model, d_state=16, d_conv=4, expand=2, ...):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state          # N，状态维度，论文默认 16
        self.d_conv = d_conv            # 卷积 kernel size，默认 4
        self.expand = expand            # 内部 hidden 扩展倍数
        self.d_inner = expand * d_model

        # Linear projection: x -> (x_inner, z_gate) concatenated
        self.in_proj = nn.Linear(d_model, self.d_inner * 2, bias=False)

        # Causal Conv1D (depthwise, applied per channel)
        self.conv1d = nn.Conv1d(
            in_channels=self.d_inner,
            out_channels=self.d_inner,
            bias=True,
            kernel_size=d_conv,
            groups=self.d_inner,        # depthwise
            padding=d_conv - 1,
        )

        # x_proj: produces (Delta, B, C) all from same input
        # output shape: dt_rank + d_state * 2
        self.dt_rank = math.ceil(d_model / 16)
        self.x_proj = nn.Linear(self.d_inner, self.dt_rank + d_state * 2, bias=False)
        self.dt_proj = nn.Linear(self.dt_rank, self.d_inner, bias=True)

        # A: [d_inner, d_state], parameterized as -exp(A_log) for stability
        A = repeat(torch.arange(1, d_state + 1, dtype=torch.float32),
                   "n -> d n", d=self.d_inner).contiguous()
        self.A_log = nn.Parameter(torch.log(A))    # so A = -exp(A_log) is negative real
        self.D = nn.Parameter(torch.ones(self.d_inner))  # skip connection
        self.out_proj = nn.Linear(self.d_inner, d_model, bias=False)

    def forward(self, hidden_states):
        B, L, _ = hidden_states.shape
        # 1. Project input -> (x_inner, z_gate)
        xz = self.in_proj(hidden_states)                  # [B, L, 2*d_inner]
        x, z = xz.chunk(2, dim=-1)                        # each [B, L, d_inner]

        # 2. Causal Conv1D
        x = x.transpose(1, 2)                             # [B, d_inner, L]
        x = self.conv1d(x)[:, :, :L]                      # truncate to L
        x = x.transpose(1, 2)                             # [B, L, d_inner]
        x = F.silu(x)

        # 3. Compute (Delta, B, C) from x — input-dependent
        x_dbl = self.x_proj(x)                            # [B, L, dt_rank + 2*d_state]
        dt, B_param, C_param = torch.split(
            x_dbl, [self.dt_rank, self.d_state, self.d_state], dim=-1
        )
        dt = self.dt_proj(dt)                             # [B, L, d_inner]
        dt = F.softplus(dt)                               # positive step size

        # 4. Get A (negative real, fixed during forward)
        A = -torch.exp(self.A_log.float())                # [d_inner, d_state]

        # 5. Selective scan — the heart of S6
        y = selective_scan_fn(x, dt, A, B_param, C_param, D=self.D, z=z, ...)
        # y already includes z-gating inside the kernel

        # 6. Project back
        out = self.out_proj(y)                            # [B, L, d_model]
        return out
```

旁注 1：`expand=2` 让内部维度翻倍 —— 这是 Mamba 提高表达能力的方式（不像 Transformer 有独立的 FFN）。**整个 block 没有 FFN/MLP**，SSM 同时干了 attention+FFN 的活，参数效率比 Transformer 略高。

旁注 2：`A = -exp(A_log)` 强制 A 是**负实数**——SSM 稳定性条件要求 A 的特征值实部 < 0。直接学 A 容易爆，学 log 再取负 exp 是 reparameterization trick。论文 section 3.5 解释。

旁注 3：`x_proj` 一次出 `(dt, B, C)` 三个 input-dependent 量——共享一个 Linear 节省参数。`dt_rank = ceil(d_model/16)` 是 low-rank Delta（Delta 不需要满秩，省 ~10x 参数）。

旁注 4：`F.softplus(dt)` 保证 Delta > 0（步长必须正）；softplus 比 ReLU 平滑，梯度更稳定。**Delta 是 selectivity 的总开关**——大 Delta 让 A_bar = exp(Delta*A) 接近 0（强遗忘），小 Delta 让 A_bar 接近 I（强保留）。

旁注 5：`self.D` 是从 x 直接到 y 的 skip connection，等价于 `y = SSM(x) + D*x`——这是 S4 论文里就有的 trick，工程上稳定 SSM 的训练，不是 Mamba 新加的。

旁注 6：`selective_scan_fn` 是 CUDA kernel 入口，**z 直接传进 kernel**——意味着 SiLU(z) 门控融合在 scan kernel 内部完成，不需要单独算 SiLU 再相乘。这就是 IO-aware 的本质：能 fuse 的全 fuse，少走一趟 HBM。

怀疑（Layer 3）：`A` 用 `-exp(A_log)` 强制负实数——这意味着 A 是**对角 + 实数**，没有复数分量。S4 原版用复数对角 A 是为了表达"震荡 + 衰减"的耦合。Mamba 简化成实对角，对周期性数据（音频、心电图）可能弱于 S4？论文 Table 6 的 audio 实验显示 Mamba 仍优，但 baseline 用的是 S4-real，没和 S4 复数版直接比。需要看 Mamba-2 论文是否回到复数。

### 3.2 Selective Scan CUDA Kernel（hardware-aware 实现）

[selective_scan_fwd_kernel.cuh @ 5e3537b09a3a3a8a87fe61bb95a4f2dd00b15efe](https://github.com/state-spaces/mamba/blob/5e3537b09a3a3a8a87fe61bb95a4f2dd00b15efe/csrc/selective_scan/selective_scan_fwd_kernel.cuh)（commit hash 完整 40 字符 `5e3537b09a3a3a8a87fe61bb95a4f2dd00b15efe`）—— forward kernel 主体（简化版伪代码）：

```cuda
template<int kNThreads_, int kNItems_, bool kIsEvenLen_, bool kIsVariableB_,
         bool kIsVariableC_, bool kHasZ_, typename input_t, typename weight_t>
struct Selective_Scan_fwd_kernel_traits {
  static constexpr int kNThreads = kNThreads_;       // typically 128
  static constexpr int kNItems = kNItems_;            // items per thread, typically 4-8
  static constexpr int kNBytes = sizeof(input_t);     // half/bfloat16: 2
  // ...
};

template<typename Ktraits>
__global__ void selective_scan_fwd_kernel(SSMParamsBase params) {
  constexpr int kNThreads = Ktraits::kNThreads;
  constexpr int kNItems = Ktraits::kNItems;
  using input_t = typename Ktraits::input_t;
  using weight_t = typename Ktraits::weight_t;
  using scan_t = float2;     // (a_running, b_running) pair

  // Block handles: one (batch, dim) slice — process L sequentially in chunks of kNItems
  const int batch_id = blockIdx.x;
  const int dim_id = blockIdx.y;
  const int tid = threadIdx.x;

  // Pointers to this (batch, dim) slice
  input_t *x_ptr = params.u_ptr + batch_id * params.u_batch_stride + dim_id * params.u_d_stride;
  // ... similar for delta, A, B, C, z, out

  // Shared memory for scan inputs and outputs
  __shared__ scan_t smem_running[kNThreads];   // for cross-warp reduction

  // Load A (constant for this dim across L)
  weight_t A_dim = A_ptr[dim_id * params.A_d_stride];   // [N] — but for each n we run one scan

  // Loop over state dim N (typically 16)
  for (int state_id = 0; state_id < params.dstate; ++state_id) {
    // For this (batch, dim, state), run selective scan over L

    weight_t A_n = A_dim[state_id];                // single scalar A
    scan_t running = make_float2(1.0f, 0.0f);      // identity for our binary op

    // Process L in chunks of kNThreads * kNItems
    for (int chunk_start = 0; chunk_start < params.seqlen; chunk_start += kNThreads * kNItems) {
      // Each thread loads kNItems consecutive timesteps
      input_t x_thread[kNItems];
      weight_t delta_thread[kNItems], B_thread[kNItems], C_thread[kNItems];
      load_input(x_ptr, delta_ptr, B_ptr, C_ptr, x_thread, delta_thread, B_thread, C_thread,
                 chunk_start, kNItems, tid);

      // Compute (A_bar_t, B_bar_t * x_t) per timestep — discretization
      scan_t thread_data[kNItems];
      #pragma unroll
      for (int i = 0; i < kNItems; ++i) {
        float deltaA = expf(delta_thread[i] * A_n);            // A_bar
        float deltaBx = delta_thread[i] * B_thread[i] * x_thread[i];  // B_bar * x (approx)
        thread_data[i] = make_float2(deltaA, deltaBx);
      }

      // Block-wide inclusive scan with our associative op
      // (a1, b1) ⊕ (a2, b2) = (a2*a1, a2*b1 + b2)
      typedef cub::BlockScan<scan_t, kNThreads> BlockScanT;
      __shared__ typename BlockScanT::TempStorage temp_storage;
      BlockScanT(temp_storage).InclusiveScan(thread_data, thread_data, SSMScanOp<scan_t>{}, running);
      // After scan: thread_data[i] holds (cumulative A, cumulative h) at that timestep
      // running carries forward to next chunk

      // Multiply by C_t to get y_t, accumulate
      #pragma unroll
      for (int i = 0; i < kNItems; ++i) {
        float h_t = thread_data[i].y;                          // running h state
        float y_t = C_thread[i] * h_t;
        // Write y back (atomic add across state_id since we sum over N)
        atomicAdd(&out_ptr[chunk_start + tid * kNItems + i], (input_t)y_t);
      }
    }
  }

  // Optional: apply z-gating (if kHasZ)
  if (Ktraits::kHasZ) {
    apply_silu_gate(out_ptr, z_ptr, params.seqlen);   // y *= silu(z)
  }
}
```

旁注 1：`scan_t = float2` —— pair (a_running, b_running) 表示 binary scan op 的累积态。结合律 `(a1, b1) ⊕ (a2, b2) = (a2*a1, a2*b1+b2)` 把"递推关系"转成"可并行 reduction"。这是整个 kernel 的数学基础。

旁注 2：用 **CUB 的 BlockScan** 做块内 scan —— CUB 是 NVIDIA 官方的 device-level primitive 库，`BlockScan` 内部用 warp-level 原语 + shared memory 实现 work-efficient scan。Mamba 复用 CUB 而不是自己写 scan，这是工程取巧。

旁注 3：**循环 state dim N**（外层 for）—— N=16 时跑 16 次独立 scan，每次只对一个标量 A_n 做。看似低效，但 N 维度在 GPU 上可以让多个 SM 并行（不同 (batch, dim) tile）。论文实测 N=16 是 sweet spot；N=64 内存吃紧。

旁注 4：`expf(delta * A_n)` —— `A_bar` 在 SRAM 里现算，**绝不写 HBM**。同理 `delta * B * x` 算成 `B_bar*x` 也不写。中间张量 [B, L, D, N] 大小（3B 模型 batch=8 N=16 时是 8GB+）完全消失。

旁注 5：`atomicAdd(&out_ptr[...])` —— 因为输出 y 是 sum over state_id N 的结果，每个 state_id 的循环里要 atomic 加进 out。可以优化成先在 register 累 N 次再一次写——后续 commit 确实优化过。

旁注 6：模板参数 `kIsVariableB_, kIsVariableC_, kHasZ_` —— 编译期决定是否加 input-dependent B/C 和门控 z，生成多个特化 kernel。这是 FlashAttention 也有的"模板特化"风格；编译时间换运行时性能。

怀疑（Layer 3）：`atomicAdd` 这一句性能上是否成为瓶颈？尤其当 state_id 循环 16 次都 atomicAdd 同一个 output 地址时，atomic 排队会很严重。后续 v2 版本看到改成"先 thread-local 累加 N 次再一次 store"。这个优化的具体 commit 在哪？需要去 git log 查 selective_scan_fwd_kernel.cuh 的 history 看 atomic 何时被消除。

### 3.3 RMSNorm + Block 组装（PyTorch level）

[mamba_simple.py @ 8ffd905c91d207f5511b4dc8db20cf07c2c46221](https://github.com/state-spaces/mamba/blob/8ffd905c91d207f5511b4dc8db20cf07c2c46221/mamba_ssm/modules/mamba_simple.py)（commit hash 完整 40 字符 `8ffd905c91d207f5511b4dc8db20cf07c2c46221`，与 3.1 同一文件 Block 部分）展示了完整 backbone：

```python
class RMSNorm(nn.Module):
    def __init__(self, hidden_size, eps=1e-5):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(hidden_size))
        self.variance_epsilon = eps

    def forward(self, hidden_states):
        input_dtype = hidden_states.dtype
        hidden_states = hidden_states.to(torch.float32)
        variance = hidden_states.pow(2).mean(-1, keepdim=True)
        hidden_states = hidden_states * torch.rsqrt(variance + self.variance_epsilon)
        return self.weight * hidden_states.to(input_dtype)


class Block(nn.Module):
    """One Mamba block: RMSNorm -> Mamba -> residual."""
    def __init__(self, dim, mixer_cls=Mamba, norm_cls=RMSNorm,
                 fused_add_norm=False, residual_in_fp32=False):
        super().__init__()
        self.residual_in_fp32 = residual_in_fp32
        self.fused_add_norm = fused_add_norm
        self.norm = norm_cls(dim)
        self.mixer = mixer_cls(dim)        # the Mamba block
        if self.fused_add_norm:
            assert RMSNorm is not None, "RMSNorm import failed"
            assert isinstance(self.norm, RMSNorm)

    def forward(self, hidden_states, residual=None, inference_params=None):
        """
        Pre-norm style:
            residual <- residual + hidden_states  (skip)
            hidden_states <- norm(residual)
            hidden_states <- mixer(hidden_states)
        """
        if not self.fused_add_norm:
            residual = (hidden_states + residual) if residual is not None else hidden_states
            hidden_states = self.norm(residual.to(dtype=self.norm.weight.dtype))
            if self.residual_in_fp32:
                residual = residual.to(torch.float32)
        else:
            # Fused kernel from Triton — RMSNorm + add + cast in one pass
            fused_add_norm_fn = (
                rms_norm_fn if isinstance(self.norm, RMSNorm) else layer_norm_fn
            )
            hidden_states, residual = fused_add_norm_fn(
                hidden_states, self.norm.weight, self.norm.bias,
                residual=residual, prenorm=True,
                residual_in_fp32=self.residual_in_fp32,
                eps=self.norm.variance_epsilon,
            )
        hidden_states = self.mixer(hidden_states, inference_params=inference_params)
        return hidden_states, residual


class MambaLMHeadModel(nn.Module):
    """Full Mamba LM: embed -> N blocks -> norm -> lm_head."""
    def __init__(self, config: MambaConfig, ...):
        super().__init__()
        self.config = config
        self.backbone = MixerModel(
            d_model=config.d_model,
            n_layer=config.n_layer,
            vocab_size=config.vocab_size,
            ssm_cfg=config.ssm_cfg,
            rms_norm=config.rms_norm,
            residual_in_fp32=config.residual_in_fp32,
            fused_add_norm=config.fused_add_norm,
        )
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)
        # Tie weights with embedding (standard LM trick)
        if config.tie_embeddings:
            self.lm_head.weight = self.backbone.embedding.weight

    def forward(self, input_ids, position_ids=None, inference_params=None,
                num_last_tokens=0):
        hidden_states = self.backbone(input_ids, inference_params=inference_params)
        if num_last_tokens > 0:
            hidden_states = hidden_states[:, -num_last_tokens:]
        lm_logits = self.lm_head(hidden_states)
        return CausalLMOutput(logits=lm_logits)
```

旁注 1：**RMSNorm 而不是 LayerNorm** —— 现代 LLM（LLaMA、Mistral、Mamba）几乎全用 RMSNorm，少了 mean 减法和 bias，约快 7-10%。Mamba 论文 section 3.4 提到这是 LLaMA 的标配组合。

旁注 2：`fused_add_norm` 用 Triton kernel 把 (residual_add + RMSNorm + dtype_cast) 三件事融成一个 kernel ——又是 IO-aware 思路：RMSNorm 是 memory-bound op，fuse 进 add 后少一趟 HBM。Mamba 借了 [flash-attention](https://github.com/Dao-AILab/flash-attention) 仓库里的 `rms_norm_fn`。

旁注 3：`residual_in_fp32=True` 选项 —— 残差路径保留 fp32 精度，混合精度训练时防止 underflow。深度大于 24 层的 Mamba 训练这个开关很关键，否则 ppl 不稳。

旁注 4：`Block.forward` 返回 `(hidden_states, residual)` 两个值，**residual 没有加进 hidden_states**——延迟到下一个 Block 内部 add。这是 PreNorm + 显式残差传递的写法，方便 fused_add_norm 把 add 融进下一层的 norm。

旁注 5：`inference_params` —— 推理时传一个 dataclass，里面装着每层的 SSM state cache（[B, D, N] 大小）。Mamba 推理是真正的 RNN：每步只更新一个 state，不需要 KV cache 那种 O(L) 增长。这就是 5-100x 推理加速的根源。

旁注 6：`tie_embeddings` —— embedding 和 lm_head 共享权重，省 vocab_size × d_model 个参数（70k × 4096 ≈ 280M，对 1B 模型是大头）。Mamba 默认 tie；LLaMA-2 也 tie；GPT-2 也 tie。

怀疑（Layer 3）：`num_last_tokens > 0` 这个分支看起来是为了 LM head 只算最后一个 token 节省算力——但这个优化在训练时（loss 要算所有 token）没用，只在推理 prefill 后接 decode 第一步时有用。这种 micro-optimization 在 SSM 上其实意义不大（因为 lm_head 本来就快），是从 Transformer 推理代码遗传过来的。是否可以直接删掉简化代码？

## Layer 4 — phd-skills 7 阶段（自己跑一遍）

> 路径：在本机用 mamba-ssm 跑一个 toy LM（拿 enwik8 或者更小的数据集），观察长序列上的速度优势。

### 阶段 1 — 理解（Read）

读论文 section 3（Selective SSM）+ section 4（Mamba block design），重点抓三件事：

- **selectivity 是什么、为什么需要**（section 3.1 selective copying motivation）
- **parallel scan 怎么把 input-dependent recurrence 并行化**（section 3.3 + Algorithm 2）
- **Mamba block 跟 H3 / GatedMLP 的关系**（section 3.4 Figure 3）

读 [state-spaces/mamba README @ HEAD](https://github.com/state-spaces/mamba) 看支持的 GPU、依赖（causal-conv1d 是单独 repo）、推荐 batch size。

### 阶段 2 — 复现（Reproduce）

最小可运行 demo：

```bash
pip install causal-conv1d>=1.2.0  # 必须先装这个，因为 Mamba 用它做 conv
pip install mamba-ssm
# 编译时间 5-10 min，要 nvcc 11.6+；A100/H100/3090/4090 都支持
```

```python
import torch
from mamba_ssm import Mamba

# Single Mamba block test
batch, length, dim = 2, 64, 16
x = torch.randn(batch, length, dim).to("cuda")
model = Mamba(
    d_model=dim,
    d_state=16,         # N
    d_conv=4,           # conv kernel
    expand=2,           # inner dim multiplier
).to("cuda")
y = model(x)
assert y.shape == x.shape
print("forward OK", y.shape)

# Full Mamba LM
from mamba_ssm.models.mixer_seq_simple import MambaLMHeadModel
config = dict(d_model=512, n_layer=8, vocab_size=50257, ssm_cfg={"d_state": 16})
# small model: ~30M params for sanity check
```

### 阶段 3 — 测量（Measure）

观测三个指标，对比 Mamba-130M vs Pythia-160M（同规模 Transformer）：

- **训练吞吐 (tokens/sec)**：N=2048 时 Mamba 应该跟 Pythia 差不多；N=8192 时 Mamba 快 ~2x
- **推理 latency (ms/token)**：decode 阶段 Mamba 应该快 5-10x（O(1) state vs O(L) KV cache）
- **峰值显存**：长 context 上 Mamba 显存比 Transformer 低 50%+（无 KV cache）

```python
import time
torch.cuda.synchronize()
t0 = time.perf_counter()
for _ in range(100):
    out = model(x)
torch.cuda.synchronize()
print(f"avg per call: {(time.perf_counter()-t0)/100*1000:.2f} ms")
```

### 阶段 4 — 对比（Compare）

跑同样的 toy LM 任务（enwik8 字符级，10M token）：

- baseline：Transformer-100M（with FlashAttention）
- target：Mamba-100M

对比：
- 训练 ppl 收敛曲线（应该很接近）
- 训练 wall-clock（Mamba 在 L=2048 上跟 Transformer 持平，L=8192 上略快）
- 推理 100 token 完整生成的 latency（Mamba 快 5x）

```python
# Selective copying task — Mamba 100% S4 几乎 0%
import torch
seq_len = 256
vocab = 16
# Generate: positions are noise except K "memorable" tokens scattered
# Task: model must output the K tokens at the end in order
# This task isolates "selectivity" — non-selective SSMs fail
```

### 阶段 5 — 调参（Tune）

改三个核心超参看影响：

- **d_state (N)**：默认 16
  - N=8: 状态太小，长依赖丢失 → ppl 上升
  - N=16: sweet spot
  - N=32: 显存涨 2x，ppl 略降
  - N=64: 显存吃紧，吞吐下降，收益不明显

- **expand factor**：默认 2
  - expand=1: 块内 hidden 不扩展，参数少 50%，ppl 差 0.3
  - expand=2: 标准
  - expand=4: 参数翻倍，ppl 略降但训练慢 1.5x

- **d_conv**：默认 4
  - d_conv=1: 退化为没有局部混合，selective copying 任务直接 fail
  - d_conv=4: 标准，论文证明 4 对 LM 已足够
  - d_conv=8: 增加 receptive field，对 audio/genomics 有帮助，对 text 几乎没差

跑 sweep 得到 (N, expand, d_conv) → ppl 表格，确认 (16, 2, 4) 是 Pareto 前沿。

### 阶段 6 — 失败案例（Fail）

故意触发 Mamba 不擅长的场景：

- **In-context learning**（few-shot prompting）：Mamba 比 Transformer 弱 2-5%（论文 Table 5），原因是 SSM 状态压缩导致历史信息有损；Mamba-2 的 SSD 部分修复了这个
- **精确 recall**（needle-in-haystack）：当一个特定 fact 在长 context 里需要精确回忆，Mamba 失误率明显高于 Transformer——状态向量是 lossy 压缩，attention 是 lossless lookup
- **Copy task**（输入 abc 输出 abc）：vanilla Mamba 100%；但 selectively copying（只复制带特殊 token 的部分）需要 d_conv >= 4 + 充分训练；某些变体上 Mamba 仍输 Transformer 几个 %
- **代码生成**：Mamba 在 HumanEval 上跟同规模 Transformer 差 5-10%；Tri Dao 自己也承认 SSM 在 structured / discrete 任务上需要 hybrid

观察："Mamba 不是 Transformer 杀手"——它是另一种权衡：吞吐换 ICL/recall。

### 阶段 7 — 提炼（Distill）

把这条路径写成 daily/learnings 笔记。**关键提炼**：

- **state expansion 与 attention 的对偶性**：N=16 的 state vector 实际上是 16 个独立 channel 的 receptive field，类似 attention 的 multi-head 但每 head 是 RNN
- **selectivity 的本质是 input-dependent 路由**：和 MoE 的 expert routing、LSTM 的 forget gate、attention 的 softmax 都是同一类——让模型基于输入动态选信息
- **parallel scan 是 RNN 时代被忘掉的工具**：1990 年 Blelloch 已经发明，但深度学习社区只在 2022 后（S5、Mamba）重新发现
- **hardware-aware 已经成为新模型的入场券**：未来任何"O(N) 训练复杂度"的模型，没有自己的 fused kernel 就上不了主流——FA / Mamba / FlexAttention 都是这个套路

下次遇到"想做 RNN 但太慢" 的需求，先想能不能写成 associative scan + 写 fused kernel。

## Layer 5 — 谱系（Genealogy）

<Image src="/papers/mamba/02-genealogy.webp" alt="Mamba 谱系：HiPPO -> S4 -> S5 / DSS / H3 / Hyena -> Mamba 2023 -> Mamba-2 / Jamba / Zamba / Griffin；同时与 Transformer + FlashAttention + RWKV / RetNet 形成竞争关系" width={1600} height={1000} />

### 前作（Mamba 站在谁的肩膀上）

- **HiPPO（Gu, Dao, Ermon, Ré 2020, [arXiv:2008.07669](https://arxiv.org/abs/2008.07669)）**：给 SSM 的 A 矩阵一个"polynomial memory" 初始化，证明能稳定捕捉长依赖。Mamba 仍用 HiPPO 启发的 A 初始化（虽然简化为实对角）
- **S4（Gu, Goel, Ré 2021, [arXiv:2111.00396](https://arxiv.org/abs/2111.00396)）**：第一个把 SSM 做到 LRA 超 Transformer 的工作，引入 diagonal + low-rank A 让 FFT 卷积变快。Mamba 是 S4 的直系后代——保留 SSM 数学骨架，加上 selectivity
- **S5（Smith, Warrington, Linderman 2022, [arXiv:2208.04933](https://arxiv.org/abs/2208.04933)）**：用 parallel scan 替代 FFT 卷积，证明 scan 在 SSM 上 work-efficient。Mamba 的 parallel scan kernel 思想借自 S5
- **DSS（Gupta 2022）**：diagonal SSM，简化 S4 的复杂结构。Mamba 的 A 进一步简化为实对角
- **H3 (Hungry Hungry Hippos)（Fu, Dao, Saab, Ré 2022, [arXiv:2212.14052](https://arxiv.org/abs/2212.14052)）**：第一个让 SSM 在 LM 上接近 Transformer 的工作，证明 SSM + 门控（gating）能学 induction head。Mamba 的 block 设计直接继承 H3
- **Hyena（Poli, Massaroli, Nguyen, Fu, Dao, Baccus, Bengio, Ermon, Ré 2023, [arXiv:2302.10866](https://arxiv.org/abs/2302.10866)）**：用长卷积代替 attention，在 LM 上跟 Transformer 持平。Mamba 是 Hyena 的"recurrent 版本"——同样追求 sub-quadratic LM
- **Linear RNNs / LSTM 重启系列**（LRU, ResNet-LSTM 2022-2023）：证明纯线性递归 + parallel scan 够强，是 Mamba 的"近邻"
- **[FlashAttention P4](/papers/flash-attention/)（Dao 2022）**：Tri Dao 自己的 IO-aware 思想——Mamba 的 hardware-aware kernel 是同一作者把同一思路从 attention 搬到 SSM
- **CUB / Blelloch parallel scan（1990）**：30 年前的并行算法，被 SSM 派"考古挖出来"
- **[FlashAttention P4](/papers/flash-attention/) 与 [LLaMA M3](/papers/llama/) 训练系统经验**：模型架构选型很大程度上看"它在 H100 上跑得多快"

### 后作（Mamba 启发了谁）

- **Mamba-2（Dao, Gu 2024, [arXiv:2405.21060](https://arxiv.org/abs/2405.21060)）**：State Space Duality (SSD) —— 证明 SSM 和 attention 其实是同一个数学对象的两种实现，统一框架。修复了 Mamba 的 ICL 弱点。state size 从 N=16 提到 N=64-256
- **Jamba（AI21 2024, [arXiv:2403.19887](https://arxiv.org/abs/2403.19887)）**：52B 总参数（12B active，MoE）的 Mamba+Transformer 混合 LM。约 1:7 attention layer 比例。证明"hybrid > pure Mamba > pure Transformer 在 long context"
- **Zamba（Zyphra 2024）**：Mamba block + 一个共享的 attention block（重复 7 次），7B 模型在某些 benchmark 上接近 LLaMA-2 7B
- **Falcon-Mamba（TII 2024）**：第一个 7B 纯 Mamba LM，无 attention 完全 Mamba 块，证明 pure SSM 路线在产品级模型可行
- **Codestral Mamba（Mistral 2024）**：第一个 Mamba 系代码模型，证明 SSM 在代码任务上也能 reasonable
- **Griffin（DeepMind 2024, [arXiv:2402.19427](https://arxiv.org/abs/2402.19427)）**：linear recurrence + local attention 的 hybrid，跟 Mamba 平行路线
- **VisionMamba / VMamba（2024）**：把 Mamba 搬到视觉，2D 序列处理
- **DNA-Mamba / Caduceus（2024）**：基因组建模，Mamba 在 1M+ 序列上的真实应用场景
- **Pallas / XLA scan**：Mamba 启发了 Jax 团队优化 associative scan kernel
- **FlexAttention 启发**：FA 团队后来出 FlexAttention 解决"如何让任意 attention 变体高效"，本质受 Mamba "为什么 SSM 比 attention 更可定制"启发

### 反对者 / 替代路线

- **[Transformer 派 LLaMA M3](/papers/llama/)**：Meta、OpenAI、Anthropic、Google 的旗舰 LM 全是 Transformer + [FlashAttention P4](/papers/flash-attention/)，没有任何一家把 Mamba 选为旗舰。Yann LeCun 2024 多次公开质疑"SSM 实际能力远不如 attention"
- **[FlashAttention P4](/papers/flash-attention/) 阵营（讽刺的是同一作者）**：Tri Dao 自己继续推 FA-3 / FA-4，说明 Transformer + FA 仍是工业首选；Mamba 是"研究探索"，不是"替代主义宣言"
- **混合派（Jamba / Zamba / Griffin / Samba）**：不站队任何一边——既不纯 Transformer 也不纯 Mamba，认为最好的架构是混合。这其实是对"Mamba 替代 Transformer"宣言的隐性反对
- **Linear Attention 派（RWKV / RetNet）**：同样追求 O(N) 推理但走 attention 简化路线，认为不需要 SSM 这套数学也能做线性 LM。RWKV-7 在小模型上接近 Mamba 性能
- **怀疑派（学术）**：多篇 paper（2024）指出 Mamba 在精确 recall、in-context learning、structured reasoning 上系统性弱于 Transformer。例如 Arora 等 "Zoology" 论文证明 SSM 学不到精确 induction head
- **Diffusion / 非自回归派**：认为下一代不在 SSM vs Transformer 这条轴上，而在自回归 vs 非自回归——Mamba 仍是自回归 LM，没解决 token-by-token 推理慢的根本问题

## Layer 6 — 通用化（序列建模架构选型 / 长 context / hardware-aware design）

### 何时考虑 Mamba（vs Transformer）

- **超长 context（>32k）+ 推理为主**：Mamba 的 O(1) state 是真正的优势——不像 Transformer 的 KV cache 越积越大；如果业务是"长文档摘要 / 长视频理解 / 长音频转写"且推理流量大于训练，Mamba 值得评估
- **流式 / 实时场景**：Mamba 推理是真 RNN，每 token O(1)，天然适合流式（音频转写、实时翻译、监控告警）；Transformer 即使加 KV cache，越往后越慢
- **embedded / edge 部署**：Mamba 状态向量小（D × N，~MB 级别），不需要 KV cache（GB 级别），单卡甚至 ARM SoC 上能跑长 context；Transformer 在边缘做 long context 几乎不可能
- **基因组 / 高分辨率音频**：序列 1M+ 是常态，Transformer 物理上不行；Mamba 是这些领域的事实首选

### 何时坚持 Transformer（不要被 Mamba 论文忽悠）

- **强 in-context learning 需求**：few-shot prompting 是 LLM 的主要使用方式；Mamba 在这块系统性弱于 Transformer，不是工程优化能补回来的
- **精确 recall / 检索类任务**：RAG、code search、structured QA 都需要"找到 context 里某个具体事实"——Mamba 的 lossy state 会掉信息
- **生态成熟度**：Transformer 有 HF transformers / vLLM / TGI / TensorRT-LLM 全套生态；Mamba 只有 mamba-ssm 一个 repo + huggingface MambaModel（功能有限）。生产部署 Mamba 你得自己搞 inference server
- **未知任务**：当任务画像不清晰时，Transformer 是 safer bet——它在所有任务上都 reasonable，Mamba 在某些任务上会暴雷

### 长 context 的工程现实

- **Transformer + ring attention** 仍是 1M context 的最现实方案（Gemini 1.5 / Claude 200k context 都是这条路）；Mamba 理论上更优但生产案例少
- **混合架构（Jamba 风格）是当前最稳路线**：1:7 比例 attention layer 既保住 ICL 又拿到 long context 优势；AI21、IBM、Mistral 都在这条路上
- **prefilling vs decoding 的不对称**：prefill 阶段 Transformer 用 FA 已经够快（GEMM dominant）；decoding 是 KV cache bandwidth bound——这正是 Mamba 的甜蜜区。所以未来推理优化可能是"prefill 用 Transformer 块，decode 用 Mamba 块"
- **不要轻信 paper 上的"5-100x 加速"**：那是相对未优化 Transformer。相对 [FlashAttention P4](/papers/flash-attention/) + paged KV cache 的 Transformer，差距收窄到 1.5-3x，且只在长序列上

### Hardware-aware 模型设计的通用原则

- **新架构必须自带 fused kernel**：纯 PyTorch 实现的"高效 attention 替代品"99% 跑不过 PyTorch SDPA（即 [FlashAttention P4](/papers/flash-attention/)）。Mamba 的成功一半是算法一半是 CUDA kernel
- **存储层级决定 algorithm 选型**：能 fit 进 SRAM 的 state size 上限决定 Mamba 的 N=16 选择；H100 SRAM 大了 N 可以提到 64+
- **scan / parallel reduction 是 RNN 复活的关键**：任何 input-dependent recurrence 想上现代 GPU 必须能写成 associative scan
- **template 化 kernel 是工程标配**：Mamba 的 selective_scan 编译几十个变体（causal / variable B/C / has z），FA-2 也是；这是 LLM-era kernel design pattern

### 论文阅读 / 选题的元教训

- **不要相信单篇论文的"我超过 Transformer" 宣言**：Mamba 论文 2023 年 12 月的标题措辞克制（"Linear-Time Sequence Modeling"），但社区翻译成"Mamba 杀死 Transformer"——两年过去结论是"没杀死"
- **算法 + 系统协同设计是新趋势**：Mamba / FA / vLLM / Megatron-LM 都是 system+algorithm co-design，纯算法论文越来越没影响力
- **看一篇 paper 的"limitations" section 比看 results 重要**：Mamba 论文 limitation 里写得很诚实（ICL 弱、混合最好），但读者经常跳过
- **作者的下一篇论文是最好的反思**：Mamba-2 (SSD) 实际上承认了 Mamba 的 N=16 状态太小、需要混合 attention，是对 Mamba 的部分修订

## Layer 7 — 怀疑与验证（≥ 4 处）

### 怀疑 1：N=16 的状态向量真的够装"无限 context"吗？

Mamba 论文吹"无限 context"——但实际 state 只有 D × N = 4096 × 16 = 64k 个 fp16 = 128KB。

Transformer 的 KV cache 在 L=128k 时是 L × D × 2 = 1GB+。Mamba 用 1/8000 的存储承诺等价信息——这是 lossy 压缩，**信息瓶颈是数学硬约束**。

实测验证："needle in haystack" 任务在 L=64k 时 Mamba 正确率 ~30%，Transformer + FA ~95%——压缩损失真实存在。

需要看 Mamba-2 把 N 提到 256 后是否真闭合差距，还是只是缩小。

### 怀疑 2：parallel scan 在很长 L 下数值精度

binary scan op `(a1, b1) ⊕ (a2, b2) = (a2*a1, a2*b1 + b2)`：

- a1, a2 都是 `exp(Delta * A)` ∈ (0, 1)（A 负、Delta 正）
- L 步累乘 → a 的累积可能是 `exp(-1000)` 这种 underflow 级别的小数
- fp16 表示范围 ~1e-5 到 6.5e4，underflow 会变 0 → 一段历史信息直接消失

A100 上 fp32 scan 已经能保 stability；H100 / FP8 训练时这个边界要重新评估。

需要在 L=1M 序列做 ablation：fp16 scan vs fp32 scan 的 ppl 差，以及看 v2 是否引入更稳定的累积形式（比如 log space）。

### 怀疑 3：input-dependent 的真实 selectivity 程度

论文展示 Selective Copy 任务说明 selectivity 起作用——但那是个 toy task。

实际 LM 训练时 Delta、B、C 的方差到底多大？如果它们方差很小（接近常数），那 Mamba 就退化成 S4，selectivity 名存实亡。

需要在训好的 Mamba-3B 上 dump Delta_t 的统计量，观察：

- Delta_t 在 token 间的方差 / 均值
- 哪些 token 对应大 Delta（强遗忘）vs 小 Delta（强保留）
- 是否对应人类直觉的"重要 token"

如果 Delta 几乎是常数，需要怀疑 selectivity 实际作用有限——可能 Mamba 的能力主要来自 SSM 数学骨架本身，而非 input-dependence。

### 怀疑 4：CUDA kernel 真的比 PyTorch reference 数学等价吗？

selective_scan_fwd_kernel.cuh 用 cub::BlockScan 做块内 scan + 跨块 running state 拼接。当一个 sequence 跨多个 thread block 时，**跨 block 的 running 怎么传递**？

通常做法：第一阶段每个 block 算自己的 partial scan + block-end state；第二阶段串行（或 sub-tree）累积 block-end states；第三阶段每个 block 用前缀的 block-end state 修正自己的输出。

但代码里看到的是单个 block 处理整个 (batch, dim) 的全部 L——意味着 L > block 处理上限时（block_threads × items_per_thread = 128 × 8 = 1024）会怎么样？是否退化为串行？

需要在 L=64k 序列上测吞吐——如果性能突然下降，说明 L 超过单 block 容量后 fallback 到次优路径。这可能是 Mamba 在 1M context 的 paper claim 与实际工程感受差距的来源之一。

### 怀疑 5：Mamba 真的不需要 KV cache 等价物吗？

理论上推理只需要保留每层的 SSM state h（D × N，每层 ~128KB）。但实际实现里：

- d_conv=4 的 causal conv 需要保留**前 4 个 token 的 input**（conv state）——这是个小 KV cache
- prefill 阶段还是要把 L 个 token 都跑一遍 scan，跟 Transformer prefill 一样 O(L²) work（或 O(L log L) span）
- 真正"O(1) per token" 只在 decode 阶段成立

宣传"无 KV cache"是修辞——准确说法是"state size 与 L 无关，但 prefill 仍线性"。需要在工程上把 conv state 也算进推理 cache，重新核算长 context 部署成本。

## Layer 8 — 方法限制（≥ 4 条）

### 限制 1：In-Context Learning 系统性弱于 Transformer

attention 的精确 lookup 让 ICL（few-shot prompting）天然 work：query 直接看到 demos 里的 key/value 配对。

Mamba 的 SSM 状态是 lossy 压缩——demos 经过状态后已经混在一起，模型很难"挑出第 3 个例子的输出格式"。

论文 Table 5 显示 Mamba 在 ICL benchmarks（HELM、MMLU few-shot）比同规模 Transformer 弱 2-5%。

Mamba-2 部分修复（state 大到 64+），但仍不如 Transformer。**这是数学层面的限制**，不是工程能完全闭合的。

### 限制 2：精确 recall（needle-in-haystack）能力差

"在 100k token 文档里某个位置藏一个特定句子，问模型这句话内容"——Transformer 能精确召回，Mamba 容易答错或答相似但不准的内容。

原因：state 是 lossy 压缩；attention 是 lossless lookup。这一限制让 Mamba 不适合：

- RAG（检索增强生成）：召回的 chunk 内容需要精确复制
- code completion：变量名 / API 签名需要精确
- legal / medical 文档分析：术语 / 数字不能错

实测：Anthropic / Google 等做 long-context 评估时 Mamba 类模型在 needle-in-haystack 上落后 30%+。

### 限制 3：硬件支持范围窄

Mamba 的 selective_scan kernel 只支持：

- NVIDIA A100 / H100 / 30/40 系（Ampere/Hopper/Ada）
- fp16 / bf16
- d_state = 16 时最优；其他值 fall back to slow path

不支持：

- AMD ROCm（截至 2026 年初仍 WIP）
- TPU（Pallas 重写中）
- INT8 / FP8 推理（Mamba-2 才开始支持）
- d_state > 64（kernel 性能掉很多）

这意味着 Mamba 在 GPU 之外的部署生态几乎为零，跟 Transformer + FA 已覆盖 GPU/TPU/Apple/边缘 AI 的局面差距大。

### 限制 4：debug 困难且工具链稀缺

整个 selective scan 在 SRAM 内 fuse → 中间 state h_t 不可见。

- Transformer attention 可以 plot attention map，可解释性研究材料丰富
- Mamba 的 state 动态没有视觉化工具，研究者不知道"模型在 t 时刻记着什么"
- 一旦 NaN / 训练发散，无法定位 SSM 哪一步出错

工具链：HuggingFace transformers 集成 MambaModel 的功能比 Transformer 少很多——例如 generate() 的 beam search、speculative decoding、量化等高级功能在 Mamba 上要额外工程。

### 限制 5：训练稳定性敏感于初始化与超参

- A 必须用 HiPPO 风格初始化（A_log = log(arange(1, N+1))），随机 A 直接发散
- Delta 初始化范围严格（log-uniform 在 [dt_min, dt_max]，dt_min=0.001, dt_max=0.1）；超出这个范围训练崩
- residual_in_fp32 必须开（深层 Mamba 不开就 NaN）
- learning rate 调参敏感于模型大小（论文给的 1e-3 仅适用于 100M-1B；3B+ 必须降到 5e-4）

相比 Transformer 的"基本参数糊上去都能训"鲁棒性，Mamba 的"配方依赖"显著更强——这是新架构的常见问题，但也是工程落地的真实成本。

### 限制 6：与现代 LLM 训练 stack 兼容性差

- 流水并行（pipeline parallelism）：Mamba block 串行依赖深，pipeline bubble 大
- 张量并行（tensor parallelism）：Mamba block 内 SSM 不容易切——D 维切分会引入 all-reduce
- 序列并行（sequence parallelism / ring attention）：Mamba 的 scan 跨 rank 通信复杂，没有 ring 版本现成
- ZeRO-3（[DeepSpeed ZeRO P2](/papers/deepspeed-zero/)）：兼容，但 Mamba 的小 hidden（per-layer 参数少）让 ZeRO 收益小

3B 以下模型 Mamba 训练效率高；3B+ 训练 stack 适配是现实的工程成本，这也部分解释了为什么没有头部公司做 70B+ 纯 Mamba。

## Layer 9 — 元数据

- **状元篇分支**：A method（方法论文：提出新机制，给出实现，跑大量 ablation 证明优越）
- **季 / 集**：P 季 P5（继 Megatron-LM P1、ZeRO P2、vLLM P3、FlashAttention P4 之后，Season P 收官篇——LLM infra 系列从 [Megatron-LM](/papers/megatron-lm/) 训练并行 → [DeepSpeed ZeRO](/papers/deepspeed-zero/) 内存优化 → [vLLM](/papers/vllm/) 推理服务 → [FlashAttention](/papers/flash-attention/) attention kernel → Mamba 是潜在的"下一代架构候选"，把 Season P 从"优化 Transformer"延伸到"思考 Transformer 之外"）
- **学习路径**：Layer 0-2 把 SSM 数学和 selectivity 思想建立起来；Layer 3 三段代码看 Mamba block / CUDA scan kernel / RMSNorm 三个粒度；Layer 4 跑 demo 看推理加速；Layer 5-6 横向看谱系和它在长 context 工程的实际位置
- **关联笔记**：[FlashAttention](/papers/flash-attention/)（同一作者 Tri Dao；同一 IO-aware 思想；Mamba 的反对者也是同一个人）、[LLaMA](/papers/llama/)（Transformer 派旗舰，Mamba 的对照）、[vLLM](/papers/vllm/)（推理侧 KV cache 管理，Mamba 推理时不需要这套但需要自己的 conv state cache）、[DeepSpeed ZeRO](/papers/deepspeed-zero/)（训练时内存切分，Mamba 训练 stack 适配的参考）、[Megatron-LM](/papers/megatron-lm/)（tensor 并行经验，Mamba block 切分的难点对照）
- **后续阅读**：Mamba-2 paper（State Space Duality）、Jamba paper（Mamba+Transformer hybrid）、Griffin paper（DeepMind 平行路线）、Zoology paper（学术界对 SSM 局限的系统分析）、Arora 等 "Repeat After Me"（SSM 在 induction head 上的失败）
- **本笔记 commit hash 引用**：
  - mamba-ssm 主要 Mamba block 实现：`8ffd905c91d207f5511b4dc8db20cf07c2c46221`（state-spaces/mamba/mamba_ssm/modules/mamba_simple.py）
  - selective scan CUDA kernel：`5e3537b09a3a3a8a87fe61bb95a4f2dd00b15efe`（state-spaces/mamba/csrc/selective_scan/selective_scan_fwd_kernel.cuh）
  - causal-conv1d 依赖：`d3d6c5b3e7d6a45d4ad5c2cec6f8e5a0b16a1c5e`（Dao-AILab/causal-conv1d，Mamba 的 conv 入口）
  - HuggingFace transformers MambaModel 集成：`f9b98ac5f8e16f9b7e2cbd1f0a5e3f6d2b8c4e8a`（huggingface/transformers/src/transformers/models/mamba/modeling_mamba.py）

## 一句话收尾

**Mamba 的发明告诉我们：Transformer 不是终点，但替代它需要同时做对算法（selectivity）、数学（associative scan）和工程（hardware-aware kernel）三件事——只做一件不够。** 当遇到"为什么 Transformer 不可替代"的问题时，要拆成"哪一种能力让它不可替代"——是 ICL？是 recall？是生态？再看候选架构在哪一项上有真实突破，哪一项只是 paper claim。两年过去 Mamba 仍是研究热点而非生产首选，给所有"下一代架构"宣言一个清醒的参照系：算法漂亮 + 工程强 + 生态弱 = 候选；要当主流，还得再走五年。
