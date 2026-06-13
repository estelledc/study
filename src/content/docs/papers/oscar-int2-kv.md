---
title: OSCAR — 面向 2-bit KV Cache 的离线谱协方差感知旋转
来源: 'Zhou et al., "OSCAR: Offline Spectral Covariance-Aware Rotation for 2-bit KV Cache Quantization", arXiv:2605.17757, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：把仓库里的货压缩成四档标签

想象你经营一个超长货架的仓库（**KV cache**），每个新到的包裹（token）都要贴一张明细卡，供后续拣货员（**attention**）对照订单（**query**）快速找货。

- **BF16 原样存储**：每张卡写满 16 位精度数字——准确，但 128K 上下文时仓库面积爆炸，搬运（内存带宽）成为瓶颈。
- **粗暴 2-bit 压缩**：每张卡只允许四个档位（00/01/10/11）。若按「整张卡的最大最小值」定刻度，少数极端大的数字（**outlier 通道**）会把刻度拉宽，大部分普通数字全挤进同一档——拣货员按卡找货时频繁认错。
- **Hadamard 旋转（QuaRot 思路）**：先把坐标轴随机搅一搅，让 outlier 分散到各维度——像把尖峰摊平。但搅法**不管拣货员实际怎么查货**，INT2 下仍可能崩。
- **OSCAR 的做法**：开工前用一小批真实订单（**calibration set**）统计「拣货员最常沿哪些方向查 K/V」，离线算出**固定旋转矩阵**和**裁剪阈值**；上线后长历史用 INT2 存，但**入口几个 sink token** 和**最近一小段窗口**仍用 BF16 原样保留——在约 **2.28 bit/元素** 的有效预算下，尽量让 attention 算出来的分数和输出别跑偏。

论文来自 Together AI / Sydney / UIUC 等团队（arXiv:2605.17757），已实现于 **SGLang** 的 paged KV + Triton INT2 decode 路径，在 Qwen3 与 GLM-4.7 等推理模型上验证：KV 显存约 **8×** 压缩，大批次吞吐最高约 **7×**，32K 生成长度下相对 BF16 平均精度差距可压到个位数百分点，而 naive INT2 / QuaRot-INT2 在推理任务上常接近归零。

---

## 是什么

**OSCAR**（**O**ffline **S**pectral **C**ovariance-**A**ware **R**otation）是一套 **INT2 KV cache 量化 + 在线 serving** 的完整方案，核心主张是：

> 优化目标不应是「KV 张量重建误差最小」，而应是「**attention 实际消费的协方差结构**」在量化后尽量保持。

方法分两阶段：

| 阶段 | 做什么 | 输入/输出 |
|------|--------|-----------|
| **Offline 校准** | 在小数据集上 dump Q/K/V；估计 attention-aware 协方差；特征分解得旋转 `R`；拟合 per-token clip 阈值 | 输出每层每头的 `{k,v}_rotation_*.pt` |
| **Online 推理** | 固定旋转 → clip → INT2 量化打包；sink + recent 保持 BF16；paged cache + 融合 kernel decode | SGLang / vLLM 兼容的 serving |

有效存储约 **2.28 BPE**（bits per KV element，128K 上下文下），相对 BF16 的 16 BPE 约 **7–8×** KV 压缩。

---

## 为什么 INT2 KV 特别难

Decoder 自回归时，每层为历史 token 缓存 Key/Value。长上下文（32K–128K reasoning trace）下，**KV 显存与带宽**往往超过权重本身。

INT2 只有 **4 个重建级别**。KV 激活在 head 维度上存在 **channel-wise outlier**：少数维度极大值主导 min-max scale，导致大量正常维度被量化到同一码本。常见缓解：

1. **旋转**（Hadamard / 随机正交）：摊平 outlier，但 **data-free**，与 attention 无关。
2. **混合精度窗口**（sink + recent BF16）：保护 attention sink 与局部依赖，但中间历史仍须可检索。
3. **更高比特**（INT4 / 3-bit TurboQuant）：精度好，但 BPE 更高。

OSCAR 的论点是：在 INT2 极端预算下，**旋转矩阵必须对准 attention 的误差结构**——Keys 通过 `QK^T` 进 logits，Values 通过 softmax 权重进加权和；因此分别用 **`Q^T Q`** 与 **score-weighted value covariance** 来定旋转，而不是 `K^T K` / `V^T V` 这类纯重建目标。

---

## 核心概念

### 1. Attention-aware 协方差目标

对每一 transformer 层、每个 KV head（GQA 下按 query 头分组），在校准 token 上估计：

**Key 侧（`qqt`）**——query 侧平均协方差，反映 K 在 attention 中与 Q 的匹配方向：

```text
Σ_K = (1 / H_kv) · Σ_h  (Q_h^T Q_h) / n_tokens
```

**Value 侧（`sst`）**——用 attention score 权重加权的 V 协方差：

```text
w_h[t] = K_h[t] · (Q^T Q) · K_h[t]^T    // 每 token 的 score 权重
Σ_V = (1 / H_kv) · Σ_h  V_h^T diag(w_h) V_h / n_tokens
```

对 `Σ_K`、`Σ_V` 做 **`torch.linalg.eigh`**，取正交特征向量作为谱旋转的基础 **`U`**。

### 2. 复合旋转 R = U · H_Had · P_br

OSCAR 不只用特征向量，而是三因子连乘：

```text
R = U · H_d · P_br
```

| 因子 | 作用 |
|------|------|
| **U** | 谱方向：对齐 attention 重要维度 |
| **H_d** | head-dim **Hadamard**：进一步摊平对角 outlier、均衡各维重要性 |
| **P_br** | **bit-reversal 置换**：按特征值大小排序后交错，避免高方差方向挤在同一 128 维 quant group |

Value 旋转在 serving 中还可 **吸收进投影权重**（`ABSORB_V_ROTATION`），减少在线乘旋转的开销。

### 3. 混合精度 KV 布局

逻辑 cache 三段拼接：

```text
[ BF16 sink (PREFIX) ] ‖ [ INT2 history ] ‖ [ BF16 recent (sliding window) ]
```

典型默认：**64** sink + **256** recent BF16，其余历史 **INT2**，group size **128**（沿 head 维分组，非对称仿射 INT2，4 个 2-bit 值打包进 1 byte）。

新 token 写入 recent；最老的 recent  demote 到 INT2 history。Attention decode 时对 BF16 段与 INT2 段分别跑 kernel，再 **online softmax merge**，等价于全精度一次 attention 的结构。

### 4. Frozen-error 理论

论文给出：在 frozen-error surrogate 下，上述 attention-aware 旋转在特定意义下 **最优**——量化误差应限制在 attention **真正敏感**的方向上，而非 Frobenius 意义的 KV 重建。

### 5. 与基线的关键差异

| 方法 | 旋转目标 | BPE | Qwen3-8B 五任务均值 |
|------|----------|-----|---------------------|
| BF16 | — | 16.00 | 70.84 |
| QuaRot-INT2 | Hadamard，无 attention 统计 | 2.25 | 10.14 |
| Naive INT2 | 无旋转 | 2.25 | ~0 |
| Saw-INT4 | INT4 参考 | 4.25 | 69.97 |
| **OSCAR** | `Q^T Q` / `V^T S^T S V` | 2.28 | **69.42**（−1.42 vs BF16） |

消融：把 U 换成 `K^T K` / `V^T V`（tensor-reconstruction target）时，Qwen3-8B 均值从 **70.01** 跌到 **31.12**——说明 **旋转优化目标** 比「多搅几下 Hadamard」更关键。

---

## 代码示例 1：离线估计旋转（简化版）

下面是与官方 `compute_kv_rotation.py` 思路一致的 **教学用** NumPy/PyTorch 伪实现，展示 `qqt` 与 `sst` 如何产生正交旋转：

```python
import torch

def fit_key_rotation(Q: torch.Tensor, K: torch.Tensor) -> torch.Tensor:
    """
    Q, K: [n_tokens, head_dim]  单层单 KV head 的校准激活
    返回正交旋转矩阵 R_k [head_dim, head_dim]
    """
    # Attention-aware key target: average query covariance
    sigma_k = (Q.T @ Q) / Q.shape[0]          # [d, d]
    evals, U = torch.linalg.eigh(sigma_k)     # 升序特征值
    U = U.flip(1)                             # 按特征值从大到小排列列

    d = Q.shape[1]
    H = torch.tensor([[1, 1], [1, -1]], dtype=Q.dtype) / (2 ** 0.5)
    while H.shape[0] < d:
        H = torch.kron(H, torch.tensor([[1, 1], [1, -1]], dtype=Q.dtype) / (2 ** 0.5))
    H = H[:d, :d]

    # bit-reversal permutation（示意：按 evals 交错 important 方向到 quant groups）
    order = torch.argsort(evals.flip(0), descending=True)
    P_br = torch.eye(d)[order]

    R_k = U @ H @ P_br
    # 数值上应再正交化: R_k, _ = torch.linalg.qr(R_k)
    return R_k


def fit_value_rotation(Q: torch.Tensor, K: torch.Tensor, V: torch.Tensor) -> torch.Tensor:
    """Score-weighted value covariance."""
    qqt = (Q.T @ Q) / Q.shape[0]
    # w[t] = k_t^T (Q^T Q) k_t  — 标量权重 per token
    w = torch.einsum("td,de,te->t", K, qqt, K)
    w = w.clamp_min(1e-6)
    # Σ_V = V^T diag(w) V / n
    sigma_v = (V.T * w) @ V / V.shape[0]
    evals, U = torch.linalg.eigh(sigma_v)
    U = U.flip(1)
    # ... 同样 compose H, P_br
    return U  # 完整版见 R = U @ H @ P_br
```

真实流水线还会：多层多头循环、GQA 分组、保存 `k_rotation_qqt_r_h_pbr.pt` 与 `v_rotation_sst_r_h_pbr.pt`、以及 grid search **clip ratio**（论文默认 K≈0.96、V≈0.92）。

---

## 代码示例 2：在线 rotate → clip → INT2 量化

OSCAR 使用 **token-wise 非对称 INT2**（4 级），在旋转后的空间做 clip 再量化。教学示意：

```python
import torch

LEVELS = torch.tensor([-1.5, -0.5, 0.5, 1.5])  # 2-bit 重建级别示意

def oscar_quantize_kv(
    x: torch.Tensor,      # [n_tokens, head_dim]  原始 K 或 V
    R: torch.Tensor,      # [head_dim, head_dim]  离线固定旋转
    clip_ratio: float = 0.96,
    group_size: int = 128,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    返回: codes [n_tokens, head_dim//4 packed], scales, zero_points
    """
    x_rot = x @ R                              # 右乘旋转（实现细节以 kernel 为准）
    n, d = x_rot.shape
    x_rot = x_rot.view(n, d // group_size, group_size)

    # per-group min-max → clip → 映射到 4 档
    xmin = x_rot.min(dim=-1, keepdim=True).values
    xmax = x_rot.max(dim=-1, keepdim=True).values
    span = (xmax - xmin).clamp_min(1e-5)
    center = (xmax + xmin) / 2
    half = span / 2 * clip_ratio
    x_clip = x_rot.clamp(center - half, center + half)

    scale = (half * 2) / (LEVELS.max() - LEVELS.min())
    zp = center
    q = torch.bucketize(x_clip, LEVELS.to(x.device))  # 0..3
    return q.to(torch.uint8), scale.squeeze(-1), zp.squeeze(-1)


def mixed_kv_layout(token_idx: int, seq_len: int, prefix: int = 64, recent: int = 256) -> str:
    """判断某 token 在 cache 中应处于哪一段。"""
    if token_idx < prefix:
        return "bf16_sink"
    if token_idx >= seq_len - recent:
        return "bf16_recent"
    return "int2_history"
```

生产路径中，上述步骤融合在 **Triton rotate–clip–quantize–pack** kernel 里，并与 **SGLang paged attention**、prefix cache 共用同一套物理布局。

---

## 系统与 Serving 集成

官方仓库 [FutureMLS-Lab/OSCAR](https://github.com/FutureMLS-Lab/OSCAR) 提供三阶段脚本：

1. **`save_qkv_*.sh`** — 在校准集（默认 GPQA）上 dump Q/K/V，约 30K tokens。
2. **`compute_rotation.sh`** — 特征分解 + 保存 `.pt` 旋转。
3. **`eval_oscar_*.sh`** — 启动 SGLang，`--kv-cache-dtype int2`，加载旋转路径。

典型环境变量：

```bash
SGLANG_ENABLE_MIXED_KV_WINDOWS=1
SGLANG_OSCAR_K_ROTATION_PATH=.../k_rotation_qqt_r_h_pbr.pt
SGLANG_OSCAR_V_ROTATION_PATH=.../v_rotation_sst_r_h_pbr.pt
SGLANG_OSCAR_K_CLIP_RATIO=0.96
SGLANG_OSCAR_V_CLIP_RATIO=0.92
SGLANG_MIXED_KV_PREFIX_TOKENS=64
SGLANG_MIXED_KV_RECENT_TOKENS=256
SGLANG_MIXED_KV_HP_DTYPE=bfloat16
# prefill: FlashAttention-3; decode: Triton INT2
```

Prefill 阶段 sink/recent/history 策略与 decode demotion 需与 **radix prefix cache** 一致；论文报告 prefix hit 越高，端到端吞吐增益越明显。

---

## 实验结果摘要

**设置**：5 个推理/代码 benchmark（GPQA、HumanEval、LiveCodeBench v6、AIME 2025、MATH-500），**32K max generation**，多 seed 平均。

| 模型 | OSCAR vs BF16 均值差距 | 备注 |
|------|------------------------|------|
| Qwen3-4B-Thinking | −3.78 pp | 小模型差距略大 |
| Qwen3-8B | −1.42 pp | |
| Qwen3-32B | −0.02 pp | 近乎持平 |
| GLM-4.7-FP8 (358B) | +0.27 pp | 略超 BF16（方差内） |

**长上下文**：RULER-NIAH 至 **128K**，OSCAR 在 Qwen3 上仍稳健，QuaRot-INT2 崩溃。

**AIME25 @ 32K**（与其他 INT2 方法对比）：OSCAR 在 Qwen3-8B 上 **66.67%**，接近 BF16 **66.00%**；KIVI-KV2 约 52–58%，Kitty 约 60–69%。

**系统**：同内存预算下大批次吞吐最高 **~7×**；batch=1 decode 因带宽降低最高 **~3×** vs BF16。

---

## 方法流程图（概念）

```text
Calibration (offline)                Serving (online)
─────────────────────                ─────────────────
[Q,K,V dumps]                        New tokens → BF16 recent
     │                                      │
     ▼                                      ▼
Σ_K = Q^T Q / n                      Older recent → rotate·clip·INT2
Σ_V = V^T diag(w) V / n                     │
     │                                      ▼
eigh → U                             Paged KV: [sink|INT2 hist|recent]
     │                                      │
R = U · H · P_br  (per layer/head)          ▼
     │                               FA3 prefill + Triton INT2 decode
clip thresholds τ_K, τ_V                      │
     │                               Merge attention segments
     └────────── .pt 固定加载 ──────────────┘
```

---

## 优势与局限

**优势**

- **目标函数对齐 attention**：INT2 极端预算下仍可用，推理链任务不像 QuaRot 那样崩。
- **可部署**：非仅算法论文——SGLang INT2 paged KV、rotation zoo 下载、与 prefix cache 共存。
- **性价比**：~2.28 BPE 接近 INT2 理论下限，却常逼近 INT4 / BF16 精度。

**局限**

- **离线校准成本**：新模型/新分布需 dump + 算旋转；域偏移大时要重校准。
- **固定旋转**：不随在线输入自适应；与 TurboQuant 等 online VQ 路线不同。
- **硬件/框架绑定**：最佳路径依赖 CUDA 12.8+、Triton decode kernel；vLLM 集成在论文中强调 SGLang 为主。
- **混合窗口超参**：sink/recent 长度与 clip ratio 影响 BPE–精度权衡，需 per-model 调。

---

## 与相关工作的关系

| 方向 | 代表 | OSCAR 差异 |
|------|------|------------|
| KV 压缩/驱逐 | H2O、SnapKV | OSCAR **不丢 token**，全历史可检索 |
| 旋转量化 | QuaRot | QuaRot **data-free Hadamard**；OSCAR **attention-aware 谱旋转** |
| 低比特 KV | KIVI、Kitty | OSCAR 强调 **2-bit + serving kernel** 一体，AIME 32K 更强 |
| Online VQ | TurboQuant | TurboQuant ~3.25 BPE、通用 VQ；OSCAR **2.28 BPE** 固定 layout |

可与 **KV-Fold**（递推式全精度 KV 拼接）对照：KV-Fold 用时间换显存、不量化；OSCAR 用 **极低比特** 换显存、需校准。长上下文 serving 里二者解决的是同一瓶颈的不同切面。

---

## 零基础自检清单

读完后，你应能回答：

1. **为什么 INT2 直接 min-max 量化 KV 会崩？** — outlier 主导 scale，且与 attention 误差无对齐。
2. **OSCAR 的 K/V 旋转目标分别是什么？** — `Q^T Q` 与 score-weighted `V^T diag(w) V`。
3. **`R = U · H · P_br` 各因子干什么？** — 谱方向、Hadamard 摊平、bit-reversal 均衡 quant group。
4. **为何保留 BF16 sink + recent？** — 保护 attention sink 与局部强依赖，中间历史才 INT2。
5. **2.28 BPE 是什么意思？** — 含混合窗口后的 **有效每 KV 元素比特数**，非纯 INT2 理论 2.0。

---

## 延伸阅读

- 论文：[arXiv:2605.17757](https://arxiv.org/abs/2605.17757)
- 项目页：[oscar-quantize.github.io](https://oscar-quantize.github.io/)
- 代码：[github.com/FutureMLS-Lab/OSCAR](https://github.com/FutureMLS-Lab/OSCAR)
- 基线 QuaRot：data-free Hadamard rotation for KV quant
- Serving 框架：[SGLang](https://github.com/sgl-project/sglang) mixed KV / INT2 模式

---

## 一句话总结

**OSCAR 把「怎么旋转 KV 再压到 2 bit」从张量重建问题，改写成「离线估计 attention 会消费的协方差结构，再据此固定旋转 + clip + 混合 BF16 窗口」的 serving 问题——让 INT2 KV cache 在长推理链上既省显存又跟得上 BF16 精度。**
