---
title: VideoMLA — 低秩潜变量 KV Cache 与分钟级自回归视频扩散
来源: https://arxiv.org/abs/2605.30351
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：录像机的「记忆抽屉」

想象你在用一台**老式胶片摄影机**做一镜到底的长镜头（分钟级视频生成）：

- 每拍一格新画面，导演都要**回头看之前所有胶片**才能保持人物、光影、运动连贯——这就是 Transformer **自回归 attention**：新 token 必须 attend 到历史 token。
- 为了不用每次重算，剧组把每格画面的「查阅索引卡」塞进一排**记忆抽屉**——这就是 **KV cache**（Key/Value 缓存）。
- 近年主流做法像给抽屉设**固定大小的滑动窗口**：只保留最近 N 帧的索引卡，窗口满了就扔掉最旧的。CausVid、Self-Forcing、Rolling-Forcing 等工作都在优化「窗口里放哪些 token、位置怎么编码」。
- 但没人动过**每张索引卡本身有多厚**：传统做法为**每个 attention head 各存一份 K 和 V**。Wan-1.3B 上，每个 cached token 每层要存 `2 × 12 heads × 128 dim = 3072` 个标量；21 帧 latent 窗口、每层 1560 token、30 层，光 KV cache 就约 **6 GB**（bf16）——比「窗口多大」更狠的是「每张卡太胖」。

**VideoMLA**（Virginia Tech + fal，arXiv:[2605.30351](https://arxiv.org/abs/2605.30351)）换了一种记法：不再为 12 个头各复印一摞厚索引卡，而是：

1. 把「画面内容」压进**一张共享的薄卡片**（低秩 content latent `c^KV`）；
2. 把「时间/空间位置」单独记在**一张共享的 RoPE 位置卡**（decoupled 3D-RoPE key `k^R`）；
3. 需要算 attention 时，再用小矩阵「展开」成各 head 要的 K/V——推理时还可把展开矩阵**吸收进预计算**，不必真的重建稠密 KV。

结果：每层每 token 从 **3072 → 224** 标量，**省 92.7% KV 显存**；在 VBench 长 horizon 上整体分最好，单卡 B200 吞吐提升 **1.23×**。

一句话：**别人在争「记忆抽屉能塞几格」；VideoMLA 把「每格索引卡从精装百科改成便签 + 坐标条」。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 全称 | VideoMLA: Low-Rank Latent KV Cache for Minute-Scale Autoregressive Video Diffusion |
| 机构 | Virginia Tech、fal |
| 代码 / Demo | [GitHub](https://github.com/yesiltepe-hidir/VideoMLA)、[项目页](https://videomla.github.io/) |
| 基底模型 | Wan-2.1 T2V-1.3B（只替换 self-attention，其余不变） |
| 技术血统 | **Multi-Head Latent Attention (MLA)**，源自 DeepSeek-V2/V3 的大模型推理压缩 |
| 训练管线 | Causal Forcing 三阶段：Teacher Forcing → Consistency Distillation（4 步）→ DMD |
| 核心数字 | KV **−92.7%**；默认 `d_c=192` 时 cache **13.7×** 小于稠密 MHA；`d_c=192` 下单 B200 batch 上限 **8.0×** |

VideoMLA 是**首个把 MLA 式潜变量 KV cache 用于视频扩散**的工作，目标场景是**因果、流式、分钟级**自回归视频生成（chunk-wise AR diffusion）。

---

## 为什么重要

### 1. 长视频生成的瓶颈正在从「算力」转向「记忆带宽」

因果视频扩散已能在单卡上交互式生成分钟级视频，但 rollout 越长，**每层每 token 的 KV 条目**线性堆积。固定滑动窗口只限制 token **个数**，不限制每个 token 的 **KV 维度**。VideoMLA 直接砍后者——与「换窗口策略」「少 cache 几层」「线性 attention」正交。

### 2. 刷新了「为什么 MLA 有效」的解释

大模型里常说：预训练 `W_K, W_V` 近似低秩，所以 MLA 压缩合理。论文用 Wan-1.3B 做 SVD 发现：**视频扩散的预训练 attention 并不低秩**——99% 能量有效秩每层都 **>1300**，远高于实用 `d_c=192`。若直接对稠密权重做秩-192 近似，会丢掉大半谱能量。

VideoMLA 却依然好用。作者结论：**有效秩由架构瓶颈 `d_c` 决定，不由预训练谱决定**。设计问题从「内在秩是多少？」变成「**多大 latent budget 还能保住画质？**」

### 3. 长 horizon 质量 + Serving 头room 同时改善

- **60s VBench Overall 0.859**（评测方法里最高），Dynamic Degree 在 30s/60s 都领先
- 相对 Self-Forcing：**23.96 vs 18.06 FPS**，延迟 **3.38s vs 4.19s**（B200, bs=1）
- 固定显存下 dense MHA 在 batch=28 OOM，MLA `d_c=192` 可撑到 **8×** batch 空间

---

## 核心概念

### 1. 因果视频扩散 + 滑动 KV 窗口

**因果视频扩散**把双向教师（如 Wan T2V）蒸馏成**按 chunk/帧自回归**的学生：生成新 latent 帧时，对过去帧的 token 做 causal attention，并把历史 **K/V 写入 rolling cache**。

近年路线（CausVid → Self-Forcing → Causal Forcing → Reward Forcing …）主要在：

- 训练时用自己生成的 rollout 对齐推理（缩小 train-test gap）
- Attention sink、token 选择、压缩记忆、Infinity-RoPE 等**窗口内**技巧

VideoMLA **保留** chunk-causal、sink、FlexAttention 等外壳，只替换 attention 模块内部的 **KV 表示**。

### 2. 稠密 per-head KV vs VideoMLA 潜变量 KV

设 hidden `d = n_h × d_h`（Wan：1536 = 12 × 128）。

**稠密 MHA cache**（每层每 token）：

```text
存储: 对每个 head h，存 k_h ∈ R^{d_h} 和 v_h ∈ R^{d_h}
体量: 2 · n_h · d_h = 3072 标量
```

**VideoMLA cache**（每层每 token）：

```text
存储: (c^{KV}, k^R)
  c^{KV} ∈ R^{d_c}     — 共享内容潜变量（默认 d_c=192）
  k^R   ∈ R^{d_h^rope} — 共享、未旋转的 3D 位置 key（默认 32）
体量: d_c + d_h^rope = 224 标量  →  相对减少 92.7%
```

各 head 的 `k^{nope}_h`、`v_h` **不写入 cache**，用时由 `c^{KV}` 上投影重建。

### 3. MLA 三分解：内容 latent + NoPE 子空间 + 解耦 3D-RoPE

每个 head 维度拆成 `d_h = d_h^{nope} + d_h^{rope}`（默认 96 + 32）：

| 分支 | 作用 | 是否进 cache |
|------|------|--------------|
| **Content / NoPE** | 画面语义、纹理、身份 | `c^{KV}` 进 cache；query 侧有 `c^Q` 但每步重算 |
| **RoPE / 位置** | 时间 t、高 h、宽 w 的 3D 相位 | 存未旋转的 `k^R`；用时 `RoPE_3D(·)` |
| **Value** | attention 加权后的输出通道 | 由 `c^{KV}` 重建，不单独 cache |

**解耦 RoPE** 的关键：cache 里存的是**未旋转**的 `k^R`，旋转只在组装当前 attention 窗口时做。这样滑动窗口重索引时，内容 latent 与绝对 rollout 时间解耦，避免「位置写死在 cache 里」带来的漂移问题。

3D-RoPE 通道按 Wan 习惯分给 (t, h, w) 轴，默认 **(6, 5, 5)** 个复数对，用高频 band。

### 4. 注意力打分（训练时与稠密形式对齐）

对 query 位置 `i`、cache 位置 `j`、head `h`：

\[
\text{score}^{(h)}_{i,j} = \frac{q_{i,h}^{\mathrm{nope}} \cdot k_{j,h}^{\mathrm{nope}} + q_{i,h}^{\mathrm{rope}} \cdot k_{j}^{\mathrm{rope}}}{\sqrt{d_h^{\mathrm{nope}} + d_h^{\mathrm{rope}}}}
\]

softmax 后对重建的 `v_{j,h}` 加权求和，再过 `W^O`。外层 chunk mask、sink token 与稠密 baseline **完全一致**——对训练管线是**即插即用**的 attention 替换。

### 5. Rank budget vs 预训练谱（论文最反直觉的发现）

定义组合算子：

\[
M = \begin{bmatrix} W^K_{\uparrow} W^{KV}_{\downarrow} \\ W^V_{\uparrow} W^{KV}_{\downarrow} \end{bmatrix}
\]

秩 **≤ d_c**（瓶颈约束）。实验显示：

- 预训练 `[W_K; W_V]`：**不是**低秩（median 层在 `d_c=192` 只保留 45.8% 谱能量）
- 训练后的 `M`：99% 能量秩 ≈ **0.98 · d_c**，从初始化就几乎吃满预算
- **SVD 初始化 vs 随机初始化**：都饱和 rank budget；训练过程**不**进一步塌缩秩

含义：VideoMLA 不是「恢复隐藏低秩结构」，而是「**强制模型在 d_c 维子空间里学会视频 attention 该记住什么**」。

### 6. 与相关路线的对比

| 方法 | 压缩什么 | 与 VideoMLA 关系 |
|------|----------|------------------|
| CausVid / Self-Forcing / Infinity-RoPE | 窗口内容、位置编码、蒸馏 | 保留稠密 per-head KV layout |
| SCD | 只 cache 25 层 encoder，decoder 不 cache | 少 cache **层数**；同窗口下总 cache 仍比 VideoMLA 大 **11.4×** |
| LongSANA | 线性 attention，常数大小累积状态 | 换掉 softmax attention 范式 |
| VideoSSM | 滑动 KV + SSM 全局记忆 | 在窗口外再加记忆，不压 per-token KV 维度 |

VideoMLA：**30 层全 cache**，但每层每 token **更瘦**。

---

## 代码示例 1：从 token 特征写入潜变量 KV cache

下面用 PyTorch 风格伪代码展示 **Eq.(1)(2)(5)** 的核心数据流：一个 latent token `x_t` 如何变成 cache 条目，以及如何按需重建 per-head K/V。

```python
import torch
import torch.nn as nn

class VideoMLAAttention(nn.Module):
    """简化版 VideoMLA 自注意力：展示 cache 写什么、attention 读什么。"""

    def __init__(
        self,
        d: int = 1536,          # 模型维度
        n_heads: int = 12,
        d_c: int = 192,         # 共享 KV 内容潜变量维度
        d_q: int = 768,         # query 潜变量（不进 cache）
        d_rope: int = 32,       # 共享 3D-RoPE key 维度
        d_nope: int = 96,       # 每 head NoPE 子空间
    ):
        super().__init__()
        self.n_heads = n_heads
        self.d_nope = d_nope
        self.d_rope = d_rope

        # 内容路径：joint KV 压缩 + per-head 展开
        self.W_kv_down = nn.Linear(d, d_c, bias=False)          # W^{KV}_↓
        self.W_k_up = nn.Linear(d_c, n_heads * d_nope, bias=False)
        self.W_v_up = nn.Linear(d_c, n_heads * d_nope, bias=False)

        # Query 路径（每步重算，不写 cache）
        self.W_q_down = nn.Linear(d, d_q, bias=False)
        self.W_q_up = nn.Linear(d_q, n_heads * d_nope, bias=False)
        self.W_q_rope = nn.Linear(d_q, n_heads * d_rope, bias=False)

        # 共享 decoupled 位置 key（进 cache 的是未旋转 k_R）
        self.W_k_rope = nn.Linear(d, d_rope, bias=False)

    def write_cache(self, x_t: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """生成一个 token 的 cache 条目：(c_kv, k_R_unrotated)。"""
        c_kv = self.W_kv_down(x_t)           # [d_c]
        k_R = self.W_k_rope(x_t)             # [d_rope]，存盘前不 RoPE
        return c_kv, k_R

    def reconstruct_kv_heads(
        self, c_kv: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """从共享 latent 重建各 head 的 NoPE key 与 value。"""
        k_nope = self.W_k_up(c_kv).view(self.n_heads, self.d_nope)
        v = self.W_v_up(c_kv).view(self.n_heads, self.d_nope)
        return k_nope, v

    def forward_step(
        self,
        x_t: torch.Tensor,
        cache_c: torch.Tensor,    # [T, d_c]
        cache_kR: torch.Tensor,   # [T, d_rope]
        rope_3d,                  # RoPE_3D(pos) 函数
    ) -> torch.Tensor:
        T = cache_c.size(0)
        c_q = self.W_q_down(x_t)
        q_nope = self.W_q_up(c_q).view(self.n_heads, self.d_nope)
        q_rope = rope_3d(self.W_q_rope(c_q).view(self.n_heads, self.d_rope))

        scores = []
        for j in range(T):
            k_nope_j, v_j = self.reconstruct_kv_heads(cache_c[j])
            k_rope_j = rope_3d(cache_kR[j])  # 用时再旋转
            s = (
                (q_nope * k_nope_j).sum(-1)
                + (q_rope * k_rope_j).sum(-1)
            ) / (self.d_nope + self.d_rope) ** 0.5
            scores.append(s)
        attn = torch.softmax(torch.stack(scores, dim=-1), dim=-1)
        # ... 对 v_j 加权聚合，省略 output projection
        return attn
```

**读代码时抓住三点**：

1. `write_cache` 只返回 **224 维**（192+32），不是 3072 维；
2. `k_R` **存的时候不旋转**，与 `c^{KV}` 一样与绝对帧号解耦；
3. 各 head 的 K/V 是 **读 cache 时现算** 的，训练框架仍看到标准 multi-head 形状。

---

## 代码示例 2：估算 KV 显存与 batch 上限

部署时常问：换 VideoMLA 后，**同样 21 latent 帧窗口、30 层**，能省多少显存？batch 能开多大？

```python
def kv_cache_gib(
    *,
    n_layers: int,
    window_tokens: int,      # 滑动窗口内 token 数 W
    n_heads: int = 12,
    d_head: int = 128,
    d_c: int = 192,
    d_rope: int = 32,
    bytes_per_scalar: int = 2,  # bf16/fp16
    batch: int = 1,
    mla: bool = True,
) -> float:
  """返回 KV cache 占用（GiB）。"""
  if mla:
    scalars_per_token_layer = d_c + d_rope          # 224
  else:
    scalars_per_token_layer = 2 * n_heads * d_head  # 3072

  total_scalars = (
      batch
      * n_layers
      * window_tokens
      * scalars_per_token_layer
  )
  return total_scalars * bytes_per_scalar / (1024**3)


# Wan-1.3B 论文默认几何：21 latent 帧 × 1560 token/帧
W = 21 * 1560
L = 30

dense_gib = kv_cache_gib(window_tokens=W, mla=False, batch=1)
mla_gib = kv_cache_gib(window_tokens=W, mla=True, d_c=192, batch=1)

print(f"Dense MHA KV: {dense_gib:.2f} GiB / request")
print(f"VideoMLA KV:  {mla_gib:.2f} GiB / request")
print(f"Reduction:    {(1 - mla_gib/dense_gib)*100:.1f}%")
# 约 6.0 GiB → 0.44 GiB，与论文「6.0GB dense、92.7% 每 token 每层」一致

# 论文 Fig.7：固定 B200 显存，dense 在 B≈28 OOM；d_c=192 约 8× headroom
def max_batch_before_oom(budget_gib: float, per_batch_gib: float) -> int:
    return int(budget_gib // per_batch_gib)

BUDGET = 80.0  # 示意：单卡可用于 KV 的 GiB 上限（非精确 B200 数字）
per_b_dense = kv_cache_gib(window_tokens=W, mla=False, batch=1)
per_b_mla = kv_cache_gib(window_tokens=W, mla=True, batch=1)
print("Max batch (illustrative):",
      max_batch_before_oom(BUDGET, per_b_dense),
      "→",
      max_batch_before_oom(BUDGET, per_b_mla))
```

这段算术解释了两个工程结论：

- **每请求 KV 斜率**：dense 约 **6.26 GB/batch** → MLA `d_c=192` 约 **0.78 GB/batch**（论文报告 0.57–1.43 GB/batch 区间，随 `d_c` 变化）；
- **同样显存预算下更大 batch** → 更高吞吐、更低单视频延迟——Table 3 中 VideoMLA **23.96 FPS** 部分来自这里，不只是算子更快。

`d_c` 是显式旋钮：Fig.7 显示 `d_c=64` 可把 OOM 推到 **B=320**，但过小会损细节；默认 **192** 是质量–效率折中。

---

## 训练与实现要点

| 项目 | 设置 |
|------|------|
| 基底 | Wan-2.1 T2V-1.3B，**仅替换 self-attention** |
| 默认维度 | `d_c=192`, `d_q=768`, `d_h^{nope}=96`, `d_h^{rope}=32` |
| 训练阶段 | Teacher Forcing → Consistency Distillation（4 步）→ DMD（Causal Forcing 管线） |
| 学习率 | TF: 5e-6；CD/DMD: 2e-6 |
| 硬件 | 8× B200，bf16 |
| 数据 | Consistency 阶段 47,680 视频（OpenVid-1M + 合成） |
| 初始化 | SVD 或随机均可；论文强调二者都**吃满 rank budget** |

推理时可做 **reparameterization**：把 content 相关投影吸收进预计算矩阵，使 `q^{nope} · k^{nope}` 形如 `c_q^T A_h c_kv`，避免显式物化稠密 per-head K/V——这是 MLA 在大模型 serving 里的标准技巧，VideoMLA 沿用到视频扩散。

---

## 实验结果速览

### 长 horizon（VBench，30s / 60s）

VideoMLA 亮点：

- **Dynamic Degree**：30s **0.981**、60s **0.958**（压缩 KV 没有「把视频生成静了」）
- **Imaging Quality / Motion Smoothness**：领先或并列最佳
- **60s Overall 0.859**：高于 Reward Forcing、Infinity-RoPE、LongLive、LongSANA 等
- **用户研究 Overall 3.17**（PA/TC/DC 均优）

LongSANA 虽吞吐接近，但 DD 极低（运动几乎静止），CLIP-F 高 partly 因为「帧间太像」。

### 短片段 T2V（Table 3）

| 模型 | 吞吐 FPS↑ | 延迟 s↓ | CLIP-T↑ | HPSv3↑ |
|------|-----------|---------|---------|--------|
| Self-Forcing 1.3B | 18.06 | 4.19 | 0.3036 | 9.86 |
| LongSANA 2B | 19.35 | 4.48 | 0.2978 | 7.54 |
| **VideoMLA 1.3B** | **23.96** | **3.38** | **0.3278** | **9.74** |

---

## 局限与开放问题

1. **`d_c` 不能无限小**：`d_c=64` 省显存但丢细节；需在 latent budget 上扫 Pareto 前沿。
2. **实验规模**：主要验证 Wan-1.3B、832×480、分钟级；更大模型、更高分辨率、prompt 切换、更长 rollout 待扩展。
3. **与窗口策略正交**：Infinity-RoPE、sink、MemRoPE 等可与 VideoMLA **叠乘**——论文定位是补上「per-token layout」这一长期被忽视的杠杆。
4. **谱直觉失效**：不能把「视频 attention 低秩」当先验；调参应围绕 **rank budget 是否够表达运动与身份**。

---

## 与知识图谱的衔接

读 VideoMLA 时，建议搭配本仓库这些笔记：

- [PagedAttention 与 vLLM](./paged-attention-vllm.md) — KV cache 作为 serving 显存瓶颈的 OS 式分页视角
- [FlashAttention](./flash-attention.md) — attention 算子 IO 优化；VideoMLA 改的是 **cache 里存什么**
- [Speculative Decoding (Leviathan)](./speculative-decoding-leviathan-2023.md) — 另一条推理加速轴，可与更小 KV 叠加
- DeepSeek MLA 原论文（DeepSeek-V2, arXiv:2405.04434）— 语言模型侧的 latent attention 鼻祖

概念链：

```text
因果视频扩散（CausVid / Self-Forcing / Causal Forcing）
    → 滑动窗口 KV（token 数有界，但 per-head 仍胖）
        → VideoMLA：MLA 式 (c^{KV}, k^R) 替换稠密 K/V
            → rank budget 解释 + 3D 解耦 RoPE
                → 分钟级 rollout、更高 batch、1.23× 吞吐
```

---

## 自测题

1. Wan-1.3B 稠密 KV 每个 token 每层多少标量？VideoMLA 默认多少？压缩比例？
2. 为什么 cache 存**未旋转**的 `k^R`？旋转何时发生？
3. 预训练 `[W_K; W_V]` 低秩吗？VideoMLA 为何仍有效？
4. VideoMLA 与 SCD、LongSANA 的压缩维度有何不同？
5. `d_c` 变大/变小分别影响什么？

<details>
<summary>参考答案</summary>

1. 稠密：`2×12×128=3072`；VideoMLA：`192+32=224`；约 **92.7%** 减少（也可说 cache 为原来的 **1/13.7**）。
2. 未旋转状态与滑动窗口重索引兼容，避免绝对时间 baked into cache；组装 attention 窗口时对 `k^R` 做 `RoPE_3D`。
3. **不低秩**（99% 能量秩 >1300）；有效秩由瓶颈 `d_c` 约束，训练在预算内适应，而非恢复预训练低秩结构。
4. SCD：**少 cache 层**；LongSANA：**换线性 attention**、常数记忆；VideoMLA：**每层都 cache**，但 **per-token 更瘦**。
5. `d_c`↑：质量↑、显存↑、batch↓；`d_c`↓：相反，过小损细节（如 `d_c=64`）。

</details>

---

## 引用

```bibtex
@article{yesiltepe2026videomla,
  title={VideoMLA: Low-Rank Latent KV Cache for Minute-Scale Autoregressive Video Diffusion},
  author={Yesiltepe, Hidir and Hu, Jiazhen and Meral, Tuna Han Salih and Akan, Adil Kaan and Oktay, Kaan and Eldardiry, Hoda and Yanardag, Pinar},
  journal={arXiv preprint arXiv:2605.30351},
  year={2026}
}
```

---

## 一句话带走

**VideoMLA 把分钟级因果视频扩散的 KV cache 从「12 个头各一本厚档案」改成「一张共享内容便签 + 一条共享 3D 坐标」，在预训练 attention 并不低秩的前提下，用架构 rank budget 学会该记住什么——显存降一个数量级，长视频质量反而更稳。**
