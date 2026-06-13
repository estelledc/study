---
title: How LoRA Remembers? — 参数记忆定律与 MemFT 零基础学习笔记
来源: https://arxiv.org/abs/2605.30260
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：LoRA 像可插拔的「小抽屉」

想象你有一本**已经写满的大百科全书**（预训练 LLM 的固定权重）。现实里不断有新事实、新号码、新文档要记进去，但你不能每来一条就把全书重印一遍（全量微调太贵）。

**LoRA（Low-Rank Adaptation）** 的做法像给书页边贴一排**可替换的小抽屉**：

- 大书本体不动，只在少数层旁边挂低秩矩阵 \(A,B\)，更新量 \(\Delta W = BA\)。
- 每条要「写入」的知识，占用的不是整本书的页数，而是**抽屉容量**——由 rank \(r\) 和有效参数量决定。
- 问一句 key（问题），模型应从抽屉里**一字不差**吐出 value（答案）——这叫 **exact parametric memory（精确参数记忆）**。

过去大家只看「微调后 QA 好不好」，像只测「能不能答对大意」。这篇论文（Xu 等，浙江大学 + 阿里巴巴，arXiv:[2605.30260](https://arxiv.org/abs/2605.30260)）问的是更底层的问题：

> **给定 rank 和要背的文本长度，LoRA 到底能可靠记住多少？平均 loss 低了，是否就等于背下来了？**

答案分两层：**宏观**上有幂律（Parametric Memory Law）；**微观**上每个 token 还要过 \(p>0.5\) 的相变门槛，否则一个错词就会**级联崩盘**。

---

## 是什么

| 项目 | 内容 |
|------|------|
| 标题 | How LoRA Remembers? A Parametric Memory Law for LLM Finetuning |
| 机构 | 浙江大学、阿里巴巴 |
| 任务 | 精确参数记忆：\(f_\theta(q^{(i)}) = a^{(i)}\)，贪婪解码下 verbatim 复现 |
| 探针 | 用 LoRA 作为**可控容量探针**，扫描 rank \(r\) 与答案长度 \(\ell\) |
| 核心公式 | Parametric Memory Law：\(\Delta\mathcal{L}(r,\ell) = C \cdot r^{\alpha} \cdot \ell^{-\beta} + b\) |
| 相变阈值 | \(P_{\text{target}} > 0.5 \Leftrightarrow \mathcal{L}_{\text{crit}} = \ln 2 \approx 0.693\) |
| 方法 | **MemFT**：把训练预算重分配给「还没过门槛」的 stubborn tokens |
| 代码 | [github.com/zjunlp/ParametricMemoryLaw](https://github.com/zjunlp/ParametricMemoryLaw) |

论文把 LoRA 从「省显存的微调技巧」重新框定为：**latent space 里可插拔的记忆单元**，并给出可预测的容量–参数–长度关系。

---

## 为什么重要

不理解这篇论文，下面几件事很难讲清楚：

- 为什么 LoRA rank 加到某个值后，**loss 还在降、准确率却卡住**——不是 bug，是 **Loss–Accuracy Misalignment（损失–准确率错位）**
- 为什么「平均 cross-entropy 很低」仍可能**整段背不出来**——少数 \(p<0.5\) 的 stubborn token 会在自回归生成里**一处错、后面全错**
- 为什么 continual learning / 知识更新要同时看 **参数量预算** 和 **序列长度**——二者通过幂律耦合，不是独立旋钮
- 为什么 MemFT 能在**相同 rank** 下超过标准 SFT——它不再平均用力，而是专攻「还没过 \(\mathcal{L}_{\text{crit}}\)」的位置
- 为什么 RAG / ICL 保证 verbatim，而 parametric memory 天然更难——信息写进权重，没有「原文 fetch」这条捷径

一句话：**LoRA 能记多少、怎样才算「真的记住了」，这篇论文给了可度量的物理定律，而不只是经验调 rank。**

---

## 核心概念

### 1. Exact Parametric Memory（精确参数记忆）

数据集 \(\mathcal{D} = \{(q^{(i)}, a^{(i)})\}\)：`q` 是唯一 key，`a` 是要背的内容。推理时**看不到** \(a\)，只能靠 \(\Delta\theta\)（LoRA 增量）存信息。

- 所有 token 级指标**只统计答案 token**，问题 token 仅作 conditioning。
- 评估用 **greedy decoding**：\(\hat{a}_t = \arg\max_v p_\theta(v \mid q, a_{<t})\)。
- 成功标准：**逐 token 与 ground truth 完全一致**（verbatim recall）。

这对应认知科学里的 **verbatim trace（逐字记忆）**，区别于只考「懂不懂大意」的 gist 评测。

### 2. Parametric Memory Law（参数记忆定律）

扫描不同 LoRA rank \(r\) 和答案长度 \(\ell\)，测量相对基座模型的 **loss 下降量** \(\Delta\mathcal{L}\)。论文发现稳定幂律：

\[
\Delta\mathcal{L}(r,\ell) = C \cdot r^{\alpha} \cdot \ell^{-\beta} + b
\]

直觉：

- **rank 越大** → 有效参数越多 → \(\Delta\mathcal{L}\) 越大（\(\alpha > 0\)）
- **要背的越长** → 单位参数能分到的「记忆带宽」越少 → \(\Delta\mathcal{L}\) 越小（\(\beta > 0\)）

在 Llama-3.1-8B-Instruct、Qwen3-8B-Instruct 上，Long-context 混合任务 \(R^2 \approx 0.98+\)，PhoneBook 短 KV 任务同样拟合良好——说明定律对**语义文本、随机 token、长短上下文**都稳健。

**宏观定律告诉你「容量趋势」，但不保证每个 token 都背下来了。**

### 3. Loss–Accuracy Misalignment（损失–准确率错位）

关键反直觉现象：**平均 loss 接近 0，token 准确率仍可能接近 0**。

原因：cross-entropy 对所有 token **平均**。简单 token 已经 \(p \approx 1\)，把平均值拉得很低，掩盖少数位置长期 \(p < 0.5\) 的 **stubborn tokens（顽固 token）**。

在自回归生成里，只要**最早失败位置** \(i^\*\) 前一个 token 没背稳，后面上下文被污染，整段 collapse——论文报告 Spearman \(\rho \approx 0.908\)：最早 stubborn 位置 tightly bounds \(i^\*\)。

### 4. Deterministic Phase Transition（确定性相变）

对每个目标 token，设 \(P_{\text{target}}\) 为正确 token 的预测概率。

| 相 | 条件 | 含义 |
|----|------|------|
| **Disordered（无序相）** | \(P_{\text{target}} < 0.5\)，即 \(\mathcal{L}_t > \ln 2\) | 正确 token 不是最大概率候选，贪婪解码可能选错 |
| **Ordered（有序相）** | \(P_{\text{target}} > 0.5\)，即 \(\mathcal{L}_t < \ln 2\) | 正确 token **保证**是 argmax，贪婪解码必对 |

临界 loss：

\[
\mathcal{L}_{\text{crit}} = -\log(0.5) = \ln 2 \approx 0.693
\]

**\(p > 0.5\) 是 verbatim recall 的充分条件**（在 greedy 下）。低于阈值不是「稍微不确定」，而是**记忆尚未锁定**，级联失败风险陡增。

Parametric Memory Law 描述「整体 loss 能降多少」；相变解释「降下来的 loss 何时真正变成准确率」。

### 5. MemFT（Memorization-oriented Fine-Tuning）

标准 SFT 对所有 token 等权优化，浪费梯度在**已经 ordered** 的 easy tokens 上。

MemFT 使用加权目标：

\[
\mathcal{L}_{\text{MemFT}}(\theta) = \frac{\sum_{t \in \mathcal{M}} w_t \, \mathcal{L}_t(\theta)}{\sum_{t \in \mathcal{M}} w_t + \varepsilon}
\]

两种主要变体：

| 方法 | 权重 \(w_t\) | 思想 |
|------|-------------|------|
| **MemFT-OT** | \(\mathbf{1}[\mathcal{L}_t > \mathcal{L}_{\text{crit}}]\) | 只训练 sub-threshold token，零额外超参 |
| **MemFT-SW** | 在 OT 基础上加 soft threshold + 围绕首个错误位置的 spatial sliding | 聚焦瓶颈邻域，缓解局部卡死 |

实验（Long-Context Memorization Stress Test）：同 rank 下 MemFT-OT 在 Llama-3.1-8B 最高档 rank 达到 **100% token accuracy**，显著高于 SFT 的 94.7%；PhoneBook 上 EM 准确率同样大幅提升。

---

## 代码示例 1：判断 token 是否进入「有序相」

下面用 NumPy 演示相变阈值——把每个位置的 cross-entropy 映射到 \(P_{\text{target}}\)，再标记是否已「记忆锁定」：

```python
import numpy as np

L_crit = np.log(2)  # ≈ 0.693

def memory_phase(per_token_loss: np.ndarray) -> dict:
    """per_token_loss: 每个答案 token 的 cross-entropy（自然对数）"""
    p_target = np.exp(-per_token_loss)
    ordered = per_token_loss < L_crit          # P_target > 0.5
    stubborn = ~ordered
    return {
        "p_target": p_target,
        "ordered_mask": ordered,
        "stubborn_indices": np.where(stubborn)[0].tolist(),
        "mean_loss": float(per_token_loss.mean()),
        "token_accuracy_if_greedy": float(ordered.all()),  # 全 ordered 才保证整段 verbatim
    }

# 模拟：多数 token 已学会，但 index 7 长期卡在无序相
losses = np.array([0.05, 0.08, 0.12, 0.15, 0.20, 0.18, 0.22, 0.95, 0.10, 0.09])
report = memory_phase(losses)

print(f"平均 loss: {report['mean_loss']:.3f}")           # 看起来不错
print(f"stubborn 位置: {report['stubborn_indices']}")     # [7]
print(f"整段 greedy 能否 verbatim: {report['token_accuracy_if_greedy']}")  # False
```

输出说明：**平均 loss 仅 0.215，但一个 stubborn token 就足以让整段记忆在生成时失败**——这就是 Loss–Accuracy Misalignment 的微观来源。

---

## 代码示例 2：MemFT-OT 加权 loss（PyTorch 风格）

MemFT-OT 把梯度集中在 \(\mathcal{L}_t > \mathcal{L}_{\text{crit}}\) 的 token 上：

```python
import torch
import torch.nn.functional as F

L_CRIT = 0.6931471805599453  # ln(2)

def memft_ot_loss(logits: torch.Tensor, labels: torch.Tensor, ignore_index: int = -100) -> torch.Tensor:
    """
    logits: [batch, seq, vocab]
    labels: [batch, seq]，问题 token 位置标 ignore_index
    """
    b, s, v = logits.shape
    flat_logits = logits.view(-1, v)
    flat_labels = labels.view(-1)

    per_token = F.cross_entropy(flat_logits, flat_labels, reduction="none", ignore_index=ignore_index)
    mask = flat_labels != ignore_index

    # 仅对未过相变阈值的 token 计权
    w = (per_token > L_CRIT).float() * mask.float()
    weighted = w * per_token

    denom = w.sum().clamp_min(1e-8)
    return weighted.sum() / denom

# 对比：标准 SFT 对所有答案 token 等权
def sft_loss(logits: torch.Tensor, labels: torch.Tensor, ignore_index: int = -100) -> torch.Tensor:
    return F.cross_entropy(
        logits.view(-1, logits.size(-1)),
        labels.view(-1),
        ignore_index=ignore_index,
    )
```

训练循环里，可在每步 forward 后统计 `stubborn ratio = (L_t > L_crit).mean()`，观察 MemFT 是否把 stubborn token 比例快速压到 0——这与论文中「redirect parameter budget」的叙事一致。

---

## 代码示例 3：Parametric Memory Law 的 log–log 拟合（概念验证）

用 scipy 在 \((r, \ell)\) 网格上拟合 \(\Delta\mathcal{L}\)，验证幂律形状（实验需自行跑 LoRA 扫描收集数据）：

```python
import numpy as np
from scipy.optimize import curve_fit

def memory_law(r, ell, C, alpha, beta, b):
    return C * (r ** alpha) * (ell ** (-beta)) + b

# ranks, lengths, delta_L 来自多次 LoRA 微调实验
ranks = np.array([1, 2, 4, 8, 16, 32], dtype=float)
lengths = np.array([128, 256, 512, 1024], dtype=float)

# 构造网格：每个 (r, ell) 测一次相对基座的 loss 下降
R, L = np.meshgrid(ranks, lengths, indexing="ij")
# delta_L[i,j] = loss_base - loss_lora  （示例占位，需替换为真实测量）
delta_L = np.random.uniform(0.1, 2.0, size=R.shape)

def flat_model(x, C, alpha, beta, b):
    r, ell = x
    return memory_law(r, ell, C, alpha, beta, b)

popt, _ = curve_fit(
    flat_model,
    (R.ravel(), L.ravel()),
    delta_L.ravel(),
    p0=[1.0, 0.5, 0.5, 0.0],
    bounds=([0, 0, 0, -np.inf], [np.inf, 5, 5, np.inf]),
)
C, alpha, beta, b = popt
print(f"ΔL ≈ {C:.4f} * r^{alpha:.3f} * ℓ^(-{beta:.3f}) + {b:.4f}")
```

论文报告 \(\alpha, \beta\) 在不同模型与数据混合下稳定——这意味着你可以**在正式微调前估算**：给定目标文本长度和可用 rank，loss 还能降多少、是否值得加 rank 或拆短序列。

---

## 实验设置速览

| 维度 | 设置 |
|------|------|
| 基座模型 | Llama-3.1-8B-Instruct、Qwen3-8B-Instruct |
| 长上下文任务 | Long-context Memorization Stress Test（LongBench 与随机 token 混合，r0–r100） |
| 短 KV 任务 | PhoneBook（name → number，大量短条目） |
| LoRA | 作为 latent space 记忆探针，扫描多档 rank |
| 对比方法 | SFT vs MemFT-OT vs MemFT-SW |

PhoneBook 考察「很多短记忆」；Long-context 考察「单条很长 verbatim」——两者互补，定律在两端都成立。

---

## 与相关路线的关系

```text
非参数记忆                    参数记忆（本文）
─────────────────────────────────────────────────
ICL / RAG / 外部向量库    vs    LoRA / 权重写入
推理时读上下文              vs    推理时无原文，靠 Δθ
verbatim 容易（直接取回）     vs    verbatim 难，需过 p>0.5 相变
上下文窗口、注意力稀释        vs    容量受 rank×长度幂律约束
```

与 Chinchilla 的「算力–参数–数据最优比」不同，本文回答的是 **finetune 阶段 LoRA 作为记忆模块的容量律**——二者可组合：先知道预训练规模律，再在部署时用 Parametric Memory Law 规划知识更新预算。

---

## 实践启示

1. **别只用平均 loss 判断「背会了没有」**——检查 sub-threshold token 比例和首个失败位置。
2. **加 rank 有递减收益**——幂律告诉你何时进入饱和区；MemFT 则在**固定 rank** 下挖潜。
3. **长文本记忆更吃参数**——\(\ell^{-\beta}\) 意味着同样 rank 下，背 4 倍长文本比线性想象更难。
4. **训练策略**：对 stubborn token 加权（MemFT-OT 最简单）比盲目延长 epoch 更有效。
5. **评估协议**：exact memory 任务应报告 **token-level accuracy + greedy decoding**，而不只是 perplexity。

---

## 局限与开放问题

- 定律在文中所列模型与任务上验证，**更大模型、MoE、多模态 LoRA** 是否同指数仍需扩展。
- MemFT-SW 引入 sliding window 等超参，OT 变体零超参但 SW 在部分设置更优——工程上需按任务选择。
- 论文聚焦 **verbatim parametric memory**；与 RAG 混合、instruction following 的交互未完全展开。
- 代码仓库标注将发布——复现时以官方实现为准。

---

## 一句话总结

**LoRA 记住东西的方式，可以用幂律刻画容量（Parametric Memory Law），用 \(p>0.5\) 刻画每个 token 是否真正锁定（确定性相变）；MemFT 则把训练火力从「已经会了的 token」转向 stubborn token，在相同参数预算下提高 verbatim 记忆成功率。**

---

## 延伸阅读

- 论文 HTML：[arxiv.org/html/2605.30260v1](https://arxiv.org/html/2605.30260v1)
- 代码：[github.com/zjunlp/ParametricMemoryLaw](https://github.com/zjunlp/ParametricMemoryLaw)
- 相关：[[demystifying-data-org]]（数据组织与训练效率）、[[llmsurgeon-data-mixture]]（数据混合与微调）
