---
title: TriAxialKV — Agent 推理场景下的极低精度 KV Cache 混合量化
来源: 'Shen et al., "TriAxialKV: Toward Extreme Low-Precision KV-Cache Quantization for Agentic Inference Tasks", arXiv:2605.17170, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：给 Agent 的「工作日志」分档存档

想象你是一个电脑操作 Agent 的秘书，要把一整天的交互记录塞进一个固定大小的文件柜（**GPU 显存**）。日志里什么都有：

- 早上读过的 **系统说明书**（tool schema、安全规则）——错一个字，下午调 API 就会传错参数名；
- 用户三小时前说的话（**旧轮次**）——多数时候只是背景，偶尔才需要翻；
- 刚截的 **屏幕截图**（图像 token）——和纯文字在统计特性上完全不同；
- 模型自己的 **推理草稿**、**工具调用 JSON**、**环境返回的 observation**——各有各的「容错率」。

若你对所有页面一律用同一套压缩（比如全部压成 2-bit），就像把说明书和草稿都缩印到看不清——**最该保真的部分最先坏**。若只按「时间远近」或「是不是图片」单维度分档，又会出现：「旧轮次的系统提示」和「旧轮次的闲聊」被同等对待，浪费宝贵的高精度档位。

**TriAxialKV** 的做法是：给每个 token 贴一个 **三维标签**（时间远近 × 模态 × 语义角色），离线测出「哪类标签对 attention 输出最敏感」，再在固定平均比特预算下，给敏感段 **INT4**、不敏感段 **INT2**。论文在 Qwen3-VL-32B 跑 OSWorld 电脑操作任务时，在 **精度与 BF16 持平** 的前提下，KV cache 可扩到约 **4.5×**，端到端吞吐提升约 **30%**（H100 上最高约 **1.52×**）。

---

## 是什么

**TriAxialKV** 是剑桥大学与帝国理工团队提出的 **面向 Agent 工作负载的混合精度 KV cache 量化框架**，已集成进 **SGLang** 推理栈，包含：

| 模块 | 作用 |
|------|------|
| **Triaxial Tagger** | 仅凭 chat template 结构，单次扫描为每个 prefill token 打上三维标签 |
| **离线校准** | 在真实 prefill 轨迹上测量「只量化某一类 tag」时的 attention 输出 MSE |
| **比特分配器** | 在目标平均位宽 \(B \in [2,4]\) 约束下，为每个 tag 选 INT2 或 INT4 |
| **双精度内存池** | 分页管理的 INT2 / INT4 池，共享虚拟地址空间 |
| **融合 Triton decode kernel** | Flash-decoding 路径上 **边解压边算 attention**，避免全量反量化 |

与「全 cache 统一 2-bit」（KIVI）或「全 cache FP4」不同，TriAxialKV 的核心论点是：**Agent prefill 的异质性是三维的，必须联合建模**，否则会把比特花在错误的地方。

---

## 为什么 Agent 场景特别难

普通聊天：上下文相对同质，KV 量化误差较均匀。

**Agent 工作负载**（函数调用、电脑操作、多轮工具循环）则具备：

1. **超长 prefill**：OSWorld 轨迹平均 prefill 约 **11,000 token**，decode 约 **300 token**；LLaMA-3-70B 在 OSWorld 上 KV 可达 **~100K token**，FP16 单 batch 就占 **~30 GB**。
2. **结构化多段**：system / user / assistant / reasoning / tool_call / observation 交替出现。
3. **多模态**：截图等 image token 与 text token 分布差异大。
4. **时间结构**：当前轮 vs 前两轮 vs 更早历史，attention 权重衰减模式不同。

论文 profiling 发现：不同 token 对 KV 量化的敏感度可差 **一个数量级以上**，且主要由上述三维结构解释。单轴方法（PM-KVQ 看时间、VL-Cache 看模态、ThinKV 看语义）各自有效，但 **联合分配** 才能在极低平均位宽下保住任务精度。

---

## 核心概念

### 1. 三维标签空间 \(\mathcal{S}\)

每个 token 的标签是三个轴的笛卡尔积：

```text
S = A_temporal × A_modal × A_semantic
```

**时间轴** \(A_{\mathrm{temporal}}\)：

| 值 | 含义 |
|----|------|
| `current` | 最近一轮（从当前 user 消息到序列末尾） |
| `turn_m1` | 上一轮 |
| `turn_m2` | 上上一轮 |
| `older` | 更早的一切 |

**模态轴** \(A_{\mathrm{modal}}\)：`text` | `image`

**语义轴** \(A_{\mathrm{semantic}}\)：

| Tag | 典型内容 |
|-----|----------|
| `inst` | 系统提示、tool schema |
| `user` | 用户自然语言 |
| `assistant` | 普通助手回复（非推理/工具括号内） |
| `reasoning` | `` 等括号内思维链 |
| `tool_call` | 工具调用 JSON |
| `obs` | 工具输出、截图描述等环境反馈 |
| `delim` | chat template 分隔符、角色标记 |

实践中合法组合约 **≤22 种**（如 `image|reasoning` 不会出现），tag 空间足够小，可枚举 \(2^{|\mathcal{S}|}\) 种分配方案。

### 2. 优化目标：attention 输出 MSE，而非 KV 重建误差

设全精度 attention 输出为 \(o_i\)，按分配 \(\mathbf{b}\) 量化后的输出为 \(\tilde{o}_i(\mathbf{b})\)。目标：

\[
\mathcal{L}(\mathbf{b}) = \mathbb{E}_i \| o_i - \tilde{o}_i(\mathbf{b}) \|_2^2
\]

一阶近似后可分解为 **按 tag 的可加失真**：

\[
\hat{\mathcal{L}}(\mathbf{b}) = \sum_{k \in \mathcal{S}} D_k(b_k)
\]

其中 \(D_k(b)\) 表示：**只把 tag \(k\) 的 token 量化到 \(b\) bit，其余保持全精度** 时的输出 MSE。这比直接最小化 KV 量化误差更合理——softmax 会放大少数高权重 token 的误差，而冷门 token 量化再烂也可能几乎不影响输出。

### 3. 约束下的 INT2/INT4 分配

每个 tag \(k\) 有 token 数 \(N_k\)，位宽 \(b_k \in \{2,4\}\)。在目标平均位宽 \(B\) 下：

\[
\min_{\mathbf{b}} \sum_k D_k(b_k) \quad \text{s.t.} \quad \sum_k N_k b_k \leq B \sum_k N_k
\]

从 INT2 升到 INT4 的 **每比特收益**：

\[
\rho_k = \frac{D_k(2) - D_k(4)}{2 N_k}
\]

\(|\mathcal{S}|\) 小时枚举所有可行 \(\mathbf{b}\)；更大时用贪心：按 \(\rho_k\) 降序，在预算内尽量升级。

### 4. 量化与内存布局细节

- **分组大小** \(G=32\) 的 asymmetric groupwise 量化。
- **INT4**：K、V 均 **per-token** 量化。
- **INT2**：K **per-channel**（避免 outlier 通道拉垮整组 scale），V **per-token**。
- INT2 key 尾段不足一组的 residual token **走 INT4 路径**（而非 KIVI 式 FP16 residual），简化三精度 kernel。
- **双池共享地址空间**：启动时按校准得到的 INT2/INT4 比例设 offset，单比较即可判精度。
- **Decode**：page table 把 INT2 指针排在 INT4 之前，使 flash-decoding 每个 split **位宽同质**；新生成 token 固定写入 INT4 池。

### 5. 校准流程（一次性、按 workload + model）

1. 取数据集 **5%** 作 calibration set；
2. **KV capture**：在若干均匀分布的层上 hook QKV，prefill 时抓 Q 与新 token 的 KV；
3. **Sensitivity**：对每个活跃 tag、每个 bitwidth，单独量化并重放 attention，记录 \(D_k(b)\)；跨 head 取 **max**，跨 request 取 **mean**，跨 layer 取 **sum**；
4. **Budget sweep**：在 \(B \in [2,4]\) 上扫，选 **精度仍与 BF16 持平的最小 \(B\)**（Qwen3-14B BFCL 上约 **2.7 bit** 平均）。

---

## 代码示例 1：Chat-template 三维打标器（教学简化版）

真实实现挂在 SGLang 请求调度器上，**不跑模型、不做 NLP**，只解析 special token 与轮次边界：

```python
from dataclasses import dataclass
from enum import Enum
from typing import Iterator

class Temporal(Enum):
    CURRENT = "current"
    TURN_M1 = "turn_m1"
    TURN_M2 = "turn_m2"
    OLDER = "older"

class Modal(Enum):
    TEXT = "text"
    IMAGE = "image"

class Semantic(Enum):
    INST = "inst"
    USER = "user"
    ASSISTANT = "assistant"
    REASONING = "reasoning"
    TOOL_CALL = "tool_call"
    OBS = "obs"
    DELIM = "delim"

@dataclass(frozen=True)
class TriaxialTag:
    temporal: Temporal
    modal: Modal
    semantic: Semantic

def tag_agent_prefill(
    token_ids: list[int],
    *,
    user_marker: int,
    assistant_marker: int,
    image_start: int,
    image_end: int,
    think_start: int,
    think_end: int,
    tool_call_start: int,
    tool_call_end: int,
) -> list[TriaxialTag]:
    """单次线性扫描；轮次用 user_marker 切分。"""
    turn_starts = [i for i, t in enumerate(token_ids) if t == user_marker]
    def temporal_at(i: int) -> Temporal:
        if not turn_starts:
            return Temporal.CURRENT
        t_idx = sum(1 for s in turn_starts if s <= i) - 1
        dist = len(turn_starts) - 1 - t_idx
        return {
            0: Temporal.CURRENT,
            1: Temporal.TURN_M1,
            2: Temporal.TURN_M2,
        }.get(dist, Temporal.OLDER)

    tags: list[TriaxialTag] = []
    in_image = in_think = in_tool = False
    role = Semantic.DELIM

    for i, tid in enumerate(token_ids):
        if tid == user_marker:
            role, in_think, in_tool = Semantic.USER, False, False
        elif tid == assistant_marker:
            role, in_think, in_tool = Semantic.ASSISTANT, False, False
        elif tid == image_start:
            in_image = True
        elif tid == image_end:
            in_image = False
        elif tid == think_start:
            in_think, role = True, Semantic.REASONING
        elif tid == think_end:
            in_think = False
        elif tid == tool_call_start:
            in_tool, role = True, Semantic.TOOL_CALL
        elif tid == tool_call_end:
            in_tool = False

        modal = Modal.IMAGE if in_image else Modal.TEXT
        if i == 0 or token_ids[i - 1] in (user_marker, assistant_marker):
            if role == Semantic.ASSISTANT and not (in_think or in_tool):
                role = Semantic.ASSISTANT
        # 系统段通常在第一个 user 之前
        if turn_starts and i < turn_starts[0]:
            role = Semantic.INST

        tags.append(TriaxialTag(temporal_at(i), modal, role))
    return tags
```

要点：**标签完全由模板语法驱动**，换模型只需换 special token ID 表，无需理解截图内容或工具语义。

---

## 代码示例 2：按 tag 的贪心比特分配

对应论文 Appendix A 的语义感知分配；枚举版在 \(|\mathcal{S}| \le 22\) 时可直接暴力搜最优：

```python
from typing import Dict, Tuple

Tag = Tuple[str, str, str]  # (temporal, modal, semantic)
DistortionTable = Dict[Tuple[Tag, int], float]  # (tag, bits) -> D_k(b)

def per_bit_gain(
    tag: Tag,
    n_tokens: int,
    D: DistortionTable,
) -> float:
    return (D[(tag, 2)] - D[(tag, 4)]) / (2 * n_tokens)

def greedy_allocate(
    counts: Dict[Tag, int],
    D: DistortionTable,
    target_avg_bits: float,
) -> Dict[Tag, int]:
    total = sum(counts.values())
    budget_extra = int((target_avg_bits - 2.0) * total)  # 相对全 INT2 的「升级额度」
    allocation = {tag: 2 for tag in counts}

    ranked = sorted(
        counts.keys(),
        key=lambda t: per_bit_gain(t, counts[t], D),
        reverse=True,
    )
    remaining = budget_extra
    for tag in ranked:
        cost = 2 * counts[tag]
        if cost <= remaining:
            allocation[tag] = 4
            remaining -= cost
    return allocation

def allocation_mse(
    allocation: Dict[Tag, int],
    D: DistortionTable,
) -> float:
    return sum(D[(tag, allocation[tag])] for tag in allocation)

# 校准后典型结论（BFCL Memory）：inst 语义段最敏感 → 几乎总是 INT4
# BFCL 上约 65–75% token 走 INT2，其余 INT4，平均 ~2.7 bit
```

**直觉**：\(\rho_k\) 高说明「给这类 token 多加 2 bit」最划算——系统提示 / tool schema（`inst`）往往排在最前，也是 BFCL 上 uniform 2-bit（KIVI）掉点的主因：参数名、类型信息在 KV 里被抹糊，工具调用 JSON 直接错。

---

## 代码示例 3：INT2/INT4 反量化（理解 decode kernel 在做什么）

融合 kernel 在 attention 内联类似逻辑，避免把整段 KV 先展开成 BF16：

```python
import torch

def dequant_asymmetric(
    q: torch.Tensor,  # uint8 packed, shape [n_groups, group_size] or per-token
    scale: torch.Tensor,
    zero_point: torch.Tensor,
    bits: int,
) -> torch.Tensor:
    levels = 2**bits
    # 教学版：假定 q 已是 [0, levels-1] 的整数码
    return scale * (q.float() - zero_point)

def mixed_precision_attention_step(
    query: torch.Tensor,
    kv_pages: list[tuple[torch.Tensor, torch.Tensor, int]],  # (k_pack, v_pack, bits)
    scales: list[tuple[torch.Tensor, torch.Tensor]],
) -> torch.Tensor:
    """概念性 decode：逐页解压再算 attention（真实实现用 Triton tile + online softmax）。"""
    keys, values = [], []
    for (k_pack, v_pack, bits), (ks, vs) in zip(kv_pages, scales):
        keys.append(dequant_asymmetric(k_pack, ks[0], ks[1], bits))
        values.append(dequant_asymmetric(v_pack, vs[0], vs[1], bits))
    K = torch.cat(keys, dim=-2)
    V = torch.cat(values, dim=-2)
    scores = torch.softmax(query @ K.transpose(-2, -1) / (query.size(-1) ** 0.5), dim=-1)
    return scores @ V
```

论文强调：**吞吐增益** 来自 (1) 更小 KV → 更大 batch / 并发（H100 上 Qwen3-VL-32B 并发约 **11.78 vs 3.46**）；(2) 带宽受限时 decode 更快（H100 **1.52×** > B200 **1.32×**）。

---

## 实验结果速览

### 任务精度

| 基准 | 设置 | TriAxialKV Mixed vs BF16 |
|------|------|--------------------------|
| **BFCL Memory** | Qwen3-14B/32B/235B、Falcon3-10B | 差距 **≤1.1 pt** |
| **OSWorld** | Qwen3-VL-8B/32B、InternVL3.5-38B | 与 BF16 **持平或略好** |

对比基线：

- **SGLang FP4**：部分模型 **-4～-7 pt**（均匀低比特浮点与模型分布强耦合，不稳定）；
- **KIVI（uniform 2-bit）**：BFCL 上 **-4～-5 pt**——无法保护 `inst` 段。

### 消融（BFCL，Qwen3）

| 配置 | Qwen3-14B | Qwen3-32B |
|------|-----------|-----------|
| 去掉时间轴 | 22.00 | 24.00 |
| 去掉语义轴 | 18.00 | 20.89 |
| **完整三维** | **24.22** | **25.11** |

语义轴贡献最大（去掉掉 **~6 pt**）：allocator 能否单独给 system/tool schema 高精度，直接决定函数调用对不对。

### 平均位宽敏感性（Qwen3-14B）

| 平均 \(B\) | 2.5 | 2.6 | **2.7（校准点）** |
|------------|-----|-----|-------------------|
| 精度 % | 16.22 | 19.56 | **24.22** |

每降 **0.1 bit** 约丢 **5%** 精度——说明校准 sweep 不是可有可无的超参，而是 **工作点选择**。

---

## 与相关工作的关系

```text
         时间轴 alone          模态轴 alone          语义轴 alone
              │                    │                    │
         PM-KVQ                 VL-Cache              ThinKV
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                            TriAxialKV（三维联合 + 端到端 serving）
```

- **KIVI / KVQuant / SAW-INT4**：偏 uniform 或单维启发式，未利用 Agent trace 结构；
- **H2O / SnapKV**：驱逐 token，与量化正交；
- **OSCAR**：INT2 旋转校准，目标仍是相对均质的压缩，而非 per-tag 混合；
- **TriAxialKV**：**结构先验（模板）+ 输出导向校准 + 系统协同设计** 三件套。

---

## 局限与工程注意

1. **校准绑定 workload + model**：换 OSWorld → BFCL 或换 Qwen → InternVL 需重新 capture（成本低，但不是 zero-shot）。
2. **依赖标准 chat template**：无角色标记、无 thinking/tool 括号的模型要改 tagger。
3. **仅 INT2/INT4 两档**：更细粒度（如 3-bit）可能进一步改善 Pareto，但 kernel 与内存池复杂度上升。
4. **`inst` 与 prefix caching**：系统段在多请求间共享，\(N_k\) 取 calibration 中位数估计，与 radix cache 协同设计。

---

## 读者可以带走的三句话

1. **Agent 的 KV 不是一张均匀的大表**，而是带时间层、模态层、语义层结构的日志；压缩必须「按段定价」。
2. **该保护谁，看 attention 输出失真，不看 KV L2 误差**——这与 OSCAR、KIVI 等工作的视角一致，但 TriAxialKV 把粒度推进到 **tag 级**。
3. **论文的价值一半在算法，一半在 SGLang 落地**（双池分页 + Triton fused decode）；没有 serving 协同，4.5× KV 扩容量换不来 30% 吞吐。

---

## 延伸阅读

- 论文：[arXiv:2605.17170](https://arxiv.org/abs/2605.17170)
- 集成基座：[SGLang](https://github.com/sgl-project/sglang)
- 评测：**BFCL Memory**（文本函数调用）、**OSWorld**（多模态电脑操作）
- 单轴对照：PM-KVQ（时间）、VL-Cache（模态）、ThinKV（推理/非推理语义）

---

## 自测题

1. 为什么 `inst` 标签的 token 通常应分配 INT4？若 uniform 2-bit 会怎样？
2. 三维标签里，去掉语义轴为什么比去掉时间轴伤害更大？
3. Decode 阶段为何把 INT2 页表项排在 INT4 前面？新生成 token 为什么固定进 INT4 池？
4. \(D_k(b)\) 的「只量化该类 tag」测量法，相比直接最小化 KV MSE 好在哪里？

<details>
<summary>参考答案（先自己想）</summary>

1. `inst` 含 tool schema 与系统规则，KV 误差会映射到错误的函数名/参数类型；BFCL 上 KIVI uniform 2-bit 掉 4–5 pt 即源于此。
2. 语义轴区分 system/user/tool/obs 等 **功能迥异** 的段；去掉后 allocator 无法给 schema 单独加 bit。时间轴主要让旧轮次更激进压缩，边际收益较小。
3. Flash-decoding 按连续 split 并行，同 split 同质位宽可单路径解压；自回归新 token 只占一小段且常与当前 query 强相关，用 INT4 保守处理。
4. Softmax 非线性使「KV 小误差 × 大 attention 权重」与「KV 大误差 × 小权重」对输出影响不对称；输出 MSE 与任务指标更对齐。

</details>
