---
title: NestedKV — 嵌套内存路由实现长上下文 KV Cache 压缩
来源: 'Chen et al., "NestedKV: Nested Memory Routing for Long-Context KV Cache Compression", arXiv:2605.26678, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：三层笔记本决定删哪几页

想象你在整理一本**超厚的工作日志**（长上下文 prompt），但规定：**只能保留 B 页**，其余必须撕掉。之后你要靠剩下的页回答各种问题（自回归解码）。

如果只按一种标准删页，很容易删错：

- **只看「整本书的平均风格」**：会留下和全书基调不同的页，但可能漏掉**只在某一章突然出现的关键数字**（全局异常 vs 局部情节）。
- **只看「当前这一章」**：重复段落会被当成废话删掉，但**跨章引用**可能还在前面某章（局部冗余 vs 全局检索）。
- **只看「最近几页」**：StreamingLLM 式做法，适合接着写，但**文档开头的 needle** 可能永远找不回来（近期相关 vs 远程证据）。

NestedKV 的做法像同时维护**三本嵌套笔记本**：

1. **稳定本（Stable）**：整本书的「平均语气」——全局锚点 \(\mu_s\)。
2. **情节本（Episodic）**：按块（block）划分的「这一节在讲什么」——段落/回合锚点 \(\mu_e(i)\)。
3. **当前本（Current）**：最近 64 个 token 的滑动窗口——即时流锚点 \(\mu_c(i)\)。

对每一页（token），问三个问题：「和这三本笔记相比，我算不算**异常/outlier**？」异常就保留，可预测就删掉。若三个本子意见不一致，再用一个**无需训练的「外层调度员」**决定听谁的——这就是论文说的 **Nested Memory Routing（嵌套内存路由）**。

论文来自 HKUST(GZ) 与 Jimei University 等（arXiv:2605.26678），**无需微调、不改模型结构**，在 prefill 结束后、decode 开始前对 KV cache 做压缩。在 Qwen3-4B 上，压缩比 \(r=0.75\)（只留 25% KV）时，RULER 相对 KeyDiff 最高 **+19.10** 分，LongBench 平均从 30.77 提到 **50.06**；在更极端的 \(r=0.95\) 下 LongBench 仍保留 **37.32**（KeyDiff 仅 17.55）。

---

## 是什么

**NestedKV** 是一种 **training-free、key-only** 的 KV cache 压缩方法，受 Nested Learning 中 **Continuum Memory System（连续记忆系统）** 启发：

> 把 token 驱逐问题重新表述为：**在有限测试时记忆预算下，维护嵌套的多时间尺度记忆状态**。

它只做一件事：给定每层、每头的 KV cache 和预算 \(B\)，选出应保留的 token 位置集合 \(\mathcal{S}\)，\(|\mathcal{S}|=B\)。模型权重、attention 算子、保留下来的 **Value 向量本身都不改**——变的是**哪些位置还在 cache 里**。

与常见 baseline 的对照：

| 方法 | 用什么信号决定保留谁 | 典型盲点 |
|------|----------------------|----------|
| H2O / 注意力持久性 | 历史 attention 质量 | 答案 token 常在低 attention 区（论文 Figure 1） |
| StreamingLLM | 最近窗口 + sink | 窗口外远程证据丢失 |
| SnapKV | prompt 末尾观察窗 | 全局检索、多跳推理 |
| KeyDiff | Key 相对全局均值的 distinctive | **单一时间尺度** |
| Ada-KV | 自适应 per-head 预算 | 仍常配合单一打分信号 |
| **NestedKV** | 三尺度 Key 余弦异常 + 路由 | 计算稍复杂，prefill 一次性开销 |

---

## 为什么重要

长上下文 LLM 的瓶颈越来越清晰：**KV cache 随序列长度线性增长**，在固定 GPU 上，128K prompt + 高 batch 时，transient memory 往往比权重更贵。

业界常见路线：

1. **扩窗口 / 改 RoPE**（YaRN 等）——仍要存完整 KV 或近似。
2. **流式丢弃**——内存 bounded，但**有损**。
3. **KV 压缩 / 量化**（H2O、SnapKV、KeyDiff、OSCAR 等）——在 prefill 后删 token 或降精度。

NestedKV 占的位置是：**不训练、不量化、只删位置**，但删除策略不再依赖「单一重要性指标」，而是模拟**人脑式分层记忆**：全局背景、局部情节、当前焦点同时存在，再用 surprise 决定何时相信「混合意见」、何时相信「最强单项意见」。

论文强调：压缩越狠（\(r\) 越大）、上下文越长，单锚点方法越 brittle，NestedKV 优势越明显——正好对应 serving 场景里最缺 memory 的 regime。

---

## 核心概念

### 1. KV cache = 测试时的有界记忆

对冻结 LLM，prefill 后的 KV cache 就是模型带入 decode 的**内部记忆状态** \(M=(K,V)\)。压缩算子 \(\mathcal{C}_\phi\) 产出 \(M^B\)，预算 \(B\) 由保留比例 \(r\) 决定：保留约 \((1-r)\) 的 token 位置。

NestedKV 的 \(\phi\) **没有可学习参数**，完全由 key 流上的统计量与固定超参定义。

### 2. 连续记忆状态：三个时间尺度锚点

对每个 token 位置 \(i\)，在**归一化 key** \(\hat{k}_i = k_i / \|k_i\|_2\) 上维护：

| 尺度 | 符号 | 含义 | 公式直觉 |
|------|------|------|----------|
| Stable | \(\mu_s\) | 整段 prompt 的全局均值方向 | 所有 \(\hat{k}_j\) 的平均 |
| Episodic | \(\mu_e(i)\) | token \(i\) 所在 block 的局部均值 | block 大小 \(b=\mathrm{clip}(\lfloor N/32\rfloor, 128, 256)\) |
| Current | \(\mu_c(i)\) | 以 \(i\) 结尾、长度 \(W=64\) 的滑动窗口均值 | 类似「最近在读什么」 |

三个锚点**不先合并**，各自产生一套排序——这是 **inner learners（内层学习者）**。

### 3. 余弦异常分数（Cosine Anomaly）

若 token 的 key 方向与某锚点高度一致，说明该尺度下「可预测、冗余」；反之则「异常、应保留」：

\[
a_s(i) = -\cos(\hat{k}_i, \mu_s),\quad
a_e(i) = -\cos(\hat{k}_i, \mu_e(i)),\quad
a_c(i) = -\cos(\hat{k}_i, \mu_c(i))
\]

**分数越高越应保留**。每个尺度在 head 内 min-max 归一化得到 \(\tilde{a}_s, \tilde{a}_e, \tilde{a}_c\)。

另外，前 \(n_{\mathrm{sink}}=4\) 个位置（attention sink）被 **pin** 住，赋大分数，避免 StreamingLLM 类问题。

### 4. 外层学习者：Head 自适应混合

不同 attention head 可能专精不同时间角色（有的盯局部，有的扫全局）。对每个 head：

1. 算各尺度 top 10% 与 bottom 10% 分数差 \(\Delta_k\)——区分度。
2. 用 softmax + 固定先验 \((w_s^0, w_e^0, w_c^0)=(0.4, 0.4, 0.2)\) 得到混合权重 \(w_k\)。
3. 混合分：\(a_{\mathrm{blend}}(i) = \sum_k w_k \tilde{a}_k(i)\)。

### 5. Surprise 门控路由

当三个尺度对同一 token 的「异常程度」**不一致**时，简单平均会掩盖关键信号。定义 **compression-induced surprise**：

\[
s(i) = \mathrm{std}(\tilde{a}_s(i), \tilde{a}_e(i), \tilde{a}_c(i))
\]

- surprise **低**：三尺度意见一致 → 用 \(a_{\mathrm{blend}}\)。
- surprise **高**：取最强单项 \(a_{\mathrm{win}}(i)=\max(\tilde{a}_s,\tilde{a}_e,\tilde{a}_c)\)。

用 sigmoid 门控平滑切换：

\[
\alpha(i)=\sigma(\kappa(s(i)-\tau)),\quad
a^\star(i)=(1-\alpha(i))a_{\mathrm{blend}}(i)+\alpha(i)a_{\mathrm{win}}(i)
\]

直觉：**只要有一个时间尺度认为你重要，就别被平均掉**。

### 6. Head-wise 记忆竞争（自适应预算）

同一层内，各 head 的 token 对 \((h,i)\) 按 \(a_{h,i}\) **全局竞争** layer 总预算 \(B_\ell\)，而非每 head 均分。每个 head 仍有最小保留量 safeguard。这解耦了两个问题：

- **head 内**哪些 token 信息量大；
- **head 间**谁该多分 KV 槽位。

消融显示：去掉 continuum 三尺度 → RULER 4k \(r=0.75\) **-7.99**；去掉 adaptive 分配 → **-8.41**；两者都去掉 → **-19.10**（超过单独之和，因 top-k 离散决策耦合）。

---

## 代码示例 1：三尺度锚点与异常分数（NumPy 教学版）

下面用随机 key 矩阵演示 NestedKV 的核心打分逻辑（省略 sink pin 与 head 竞争，便于零基础理解）：

```python
import numpy as np

def normalize_keys(K: np.ndarray) -> np.ndarray:
    """K: [N, d] -> 单位方向 key"""
    return K / (np.linalg.norm(K, axis=1, keepdims=True) + 1e-8)

def block_id(i: int, N: int, b: int) -> slice:
    start = (i // b) * b
    end = min(start + b, N)
    return slice(start, end)

def continuum_anchors(k_hat: np.ndarray, W: int = 64) -> tuple[np.ndarray, list[np.ndarray], list[np.ndarray]]:
    N = k_hat.shape[0]
    b = int(np.clip(N // 32, 128, 256))

    mu_s = k_hat.mean(axis=0)  # stable: 全局均值方向

    mu_e = []
    mu_c = []
    for i in range(N):
        blk = k_hat[block_id(i, N, b)]
        mu_e.append(blk.mean(axis=0))

        lo = max(0, i - W + 1)
        mu_c.append(k_hat[lo : i + 1].mean(axis=0))

    return mu_s, mu_e, mu_c

def cosine_anomaly(k_hat: np.ndarray, anchors) -> np.ndarray:
    """返回每个 token 的三尺度异常分（越大越应保留）"""
    mu_s, mu_e, mu_c = anchors
    N = k_hat.shape[0]
    scores = np.zeros((N, 3))

    for i in range(N):
        ki = k_hat[i]
        scores[i, 0] = -np.dot(ki, mu_s)          # stable
        scores[i, 1] = -np.dot(ki, mu_e[i])       # episodic
        scores[i, 2] = -np.dot(ki, mu_c[i])       # current

    # per-scale min-max 归一化（单个 head 内）
    for j in range(3):
        col = scores[:, j]
        scores[:, j] = (col - col.min()) / (col.max() - col.min() + 1e-8)
    return scores  # [N, 3]

# --- demo ---
np.random.seed(0)
N, d = 512, 64
K = np.random.randn(N, d).astype(np.float32)
k_hat = normalize_keys(K)

anchors = continuum_anchors(k_hat)
tilde_a = cosine_anomaly(k_hat, anchors)

# 外层：surprise 路由
surprise = tilde_a.std(axis=1)
a_blend = tilde_a @ np.array([0.4, 0.4, 0.2])  # 简化：固定权重代替 head-adaptive
a_win = tilde_a.max(axis=1)
kappa, tau = 8.0, 0.15
alpha = 1 / (1 + np.exp(-kappa * (surprise - tau)))
a_star = (1 - alpha) * a_blend + alpha * a_win

budget = 128
keep_idx = np.argsort(-a_star)[:budget]
print("保留 token 数:", len(keep_idx), "示例 index:", keep_idx[:8])
```

这段代码对应论文 Section 2.2–2.4 的骨架：**归一化 key → 三锚点 → 三异常分 → surprise 路由 → TopB**。

---

## 代码示例 2：Prefill 后接入压缩（PyTorch 伪代码）

NestedKV 在 **prefill 结束、decode 开始前** 对每层 KV 调用一次。下面展示与 HuggingFace 风格 cache 的集成点（伪代码，非官方实现）：

```python
import torch
import torch.nn.functional as F

@torch.no_grad()
def nestedkv_compress_layer(
    keys: torch.Tensor,      # [num_heads, seq_len, head_dim]
    values: torch.Tensor,    # [num_heads, seq_len, head_dim]
    retain_ratio: float = 0.25,  # 保留 25% => r=0.75 压缩
    sink_tokens: int = 4,
    window: int = 64,
) -> tuple[torch.Tensor, torch.Tensor]:
    """单层、已分 head 的 KV -> 压缩后 KV"""
    H, N, D = keys.shape
    budget = max(sink_tokens, int(N * retain_ratio))

    k_hat = F.normalize(keys, dim=-1)
    scores = torch.zeros(H, N, device=keys.device)

    # --- stable anchor (per head) ---
    mu_s = k_hat.mean(dim=1, keepdim=True)  # [H, 1, D]
    a_s = -(k_hat * mu_s).sum(dim=-1)       # [H, N]

    # --- episodic + current（逐 head 向量化可进一步优化）---
    b = int(max(128, min(256, N // 32)))
    a_e = torch.zeros_like(a_s)
    a_c = torch.zeros_like(a_s)
    for i in range(N):
        bs, be = (i // b) * b, min((i // b + 1) * b, N)
        mu_e = k_hat[:, bs:be, :].mean(dim=1)
        a_e[:, i] = -(k_hat[:, i, :] * mu_e).sum(dim=-1)

        lo = max(0, i - window + 1)
        mu_c = k_hat[:, lo : i + 1, :].mean(dim=1)
        a_c[:, i] = -(k_hat[:, i, :] * mu_c).sum(dim=-1)

    stack = torch.stack([a_s, a_e, a_c], dim=-1)  # [H, N, 3]
    # min-max per (head, scale)
    mn = stack.amin(dim=1, keepdim=True)
    mx = stack.amax(dim=1, keepdim=True)
    tilde = (stack - mn) / (mx - mn + 1e-8)

    # head-adaptive blend（此处用固定先验；完整版用 Δ_k softmax）
    w = torch.tensor([0.4, 0.4, 0.2], device=keys.device)
    a_blend = (tilde * w).sum(dim=-1)

    surprise = tilde.std(dim=-1)
    a_win = tilde.max(dim=-1).values
    alpha = torch.sigmoid(8.0 * (surprise - 0.15))
    a_star = (1 - alpha) * a_blend + alpha * a_win

    # pin sink
    a_star[:, :sink_tokens] = 1e6

    # TopB（单层内 head 竞争版需改为全局 (h,i) topk，这里为单 head TopB 简化）
    topk = a_star.topk(budget, dim=-1).indices.sort(dim=-1).values
    idx = topk.unsqueeze(-1).expand(-1, -1, D)
    return keys.gather(1, idx), values.gather(1, idx)

# 用法：prefill 完成后
# for layer in model.layers:
#     k, v = layer_kv_cache[layer_idx]  # 从 prefill 得到
#     k_small, v_small = nestedkv_compress_layer(k, v, retain_ratio=0.25)
#     layer_kv_cache[layer_idx] = (k_small, v_small)
# 然后进入 decode，attention 只看见保留下来的位置
```

工程上完整实现还需：**跨 head 的 \(\mathrm{TopB}_{B_\ell}\) 竞争**、与 FlashAttention 的 index 映射、以及每层独立调用。论文报告 32k context 下 prefill 开销相对 KeyDiff **< 0.5%**，decode 延迟与 peak memory 与同预算 baseline 接近。

---

## 实验结果速览

**主模型**：Qwen3-4B（frozen），并报告 Llama-3.2-Instruct。

**基准**：

- **RULER**（4k–32k，合成检索/聚合）—— NestedKV 在多数 context×ratio 格点 best 或 near-best。
- **LongBench / LongBench-E / LooGLE / InfiniteBench**—— 真实长文档 QA、多跳等。
- **MMLU-Pro**—— 短上下文知识，\(r=0.25\) 时与 Full KV 差距 **< 0.2** 分，说明 aggressive 压缩未牺牲短 prompt 能力。

**关键数字（Qwen3-4B）**：

| 设定 | NestedKV vs KeyDiff |
|------|---------------------|
| RULER 4k, \(r=0.75\) | **+19.10** |
| LongBench 平均, \(r=0.75\) | 30.77 → **50.06** |
| LongBench, \(r=0.95\) | **37.32** vs 17.55 |

**效率**：同 \(r\) 下 decode 延迟、peak GPU memory 与 KeyDiff/SnapKV 同级，显著低于 Full KV。

---

## 与相邻工作的关系

- **vs KV-Fold**（同仓库笔记 `kv-fold.md`）：KV-Fold **不删 token**，用 chunk 递推拼接完整 KV；NestedKV **主动驱逐**，换更小 memory footprint。一个保真、一个省内存。
- **vs KeyDiff**：KeyDiff 本质是**单锚点** key 几何 distinctive；NestedKV 把 KeyDiff 式信号放进三尺度 continuum，并加 surprise 路由 + head 竞争。
- **vs Ada-KV**：Ada-KV 重点在 **budget 怎么分给 head**；NestedKV 两者都做，且打分信号更丰富。
- **vs Nested Learning (Behrouz et al., 2026)**：NestedKV 借用「嵌套记忆 + 自修改更新规则」的**概念框架**，在测试时用固定规则实例化，不训练 outer learner。

---

## 局限与开放问题

1. **仍是有损压缩**：极端 \(r\) 下必然丢信息；只是比单信号 baseline 丢得更「聪明」。
2. **Prefill 阶段一次性计算**：三尺度统计 + 路由有额外 CPU/GPU 工作，虽论文称很小，超长 batch serving 仍需 profiling。
3. **超参固定**：\(W=64\)、先验 \((0.4,0.4,0.2)\)、\(\kappa,\tau\) 等跨 benchmark 共享——换模型族是否要调参，论文外仍待验证。
4. **仅 key 打分**：Value 随 Key 位置一并保留/丢弃，未单独建模 V 的重要性（与多数 KV eviction 方法相同）。

---

## 一句话总结

NestedKV 把长上下文 KV 压缩看成**多时间尺度的记忆维护问题**：用 stable / episodic / current 三个 key 锚点测量余弦异常，再用 head 自适应混合与 surprise 门控路由合并意见，配合 head 间预算竞争，在**不训练、不改模型**的前提下，尤其在高压缩比与长上下文 regime 显著优于单锚点 eviction 方法。

---

## 延伸阅读

- 论文：[arXiv:2605.26678](https://arxiv.org/abs/2605.26678)
- 概念来源：Nested Learning / Continuum Memory System（Behrouz et al., 2026）
- 相关 baseline：H2O、SnapKV、KeyDiff、Ada-KV、StreamingLLM
- 同主题笔记：本仓库 `kv-fold.md`（递推保完整 KV）、`oscar-int2-kv.md`（INT2 量化 KV）
