---
title: Reasoning in Memory — 解锁 LLM 的工作记忆做隐式推理
来源: https://arxiv.org/abs/2605.30343
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：心算 vs 边写边算

你心算 `17 × 23` 时，脑子里会「过一遍」中间结果，但**不必把每一步都念出声**。小孩学算术时常常**出声思考**（Vygotsky 所说的 private speech），熟练后则把计算收进**工作记忆（working memory）**——内部暂存、改写、再读出答案。

今天的大语言模型（LLM）更像「永远出声思考的学生」：

- **Chain-of-Thought（CoT）**：模型必须**逐 token 生成**「先算 17×20=340…」这类中间文字，推理与**对外输出**绑在一起。
- 语言是为**交流**优化的，不是为**计算**优化的——大量算力花在语法、衔接词上，而不是纯内部运算。
- 即便 Coconut 等**隐式推理**方法用连续向量代替文字，仍要**自回归地**一步步「吐出来」，只是吐的是 hidden state 而非可读句子。

**Reasoning in Memory（RiM）**（Aichberger & Hochreiter, arXiv:2605.30343）提出：给模型一串**固定的特殊 token 槽位**（memory blocks），当作内部草稿纸；训练后，真正的中间推理发生在这些槽位的**上下文表示**里，推理时**一次前向**即可，不必自回归生成思考链。

类比总结：

| 人类 | 传统 CoT LLM | RiM |
|------|-------------|-----|
| 工作记忆里改数字 | 把每一步写成句子 | 在固定 memory block 里改表示 |
| 只说出最终答案 | 答案和思考混在同一 token 流 | 答案单独读出；思考留在 block 内 |
| 心算快 | 生成长 CoT 慢 | 固定少量 block，TTFT 接近直接答题 |

---

## 这篇论文在解决什么问题

### 1. 推理与生成被错误地耦合

测试时扩展算力（test-time compute）的主流做法是：**多生成中间 token**。这把两件事混为一谈：

- **内部计算**：模型要在 hidden state 里做变换；
- **外部通信**：要把思考翻译成自然语言给别人（或给下一 token）看。

CoT 有效，但中间步骤必须**可读、符合语法**——这是额外约束，不是推理本身需要的。

### 2. 现有隐式推理仍「一步步外化」

Coconut 用 continuous thoughts（CT）替代离散推理 token，但 CT 仍要**自回归生成**，每步算完才能喂给下一步。瓶颈从「写字慢」变成「吐向量慢」，**并行性**没有根本改善。

### 3. Filler token 难训

早期工作发现：随便在输入里加 `<pause>`、`<filler>` 往往**不涨分甚至降分**（Lanham et al., 2023）。要让「无语义占位符」承担计算，需要**精心设计的监督信号**——RiM 的核心贡献之一。

---

## 核心概念

### 1. Memory Block（记忆块）

- 由 **M 个特殊 token** 组成的一个块，例如 `<mem_start> <mem_0> <mem_1> <mem_end>`（论文用 dedicated special tokens，默认 **M=2**）。
- **位置与 token 身份固定**，在输入里**预置**在问题之后、答案之前；**不是**模型生成出来的。
- 每个 block 经过 Transformer 后得到**上下文相关的表示**，可编码与该题相关的中间状态——类似工作记忆里的一个「演算步骤槽」。
- 训练时**冻结原有词表 embedding**，只更新 special token 的 embedding，避免破坏预训练语义。

序列结构示意：

```
[问题 x] [memory block 1] [memory block 2] ... [memory block K] → 读出答案
```

推理时整段 **(x, m₁…m_K)** 在**单次 forward** 里算完，TTFT 与「直接答题」几乎相同。

### 2. 两阶段课程（Two-Stage Curriculum）

Memory block 起初**没有预定功能**——模型可能完全忽略它们。RiM 用两阶段把「草稿纸」训成可用工作记忆：

#### Stage 1：推理步骤监督（Reasoning Step Supervision）

- 训练数据有完整 CoT：问题 **x**、推理链 **r**（分成 T 步）、最终答案 **y**。
- 为每一步推理配 **1 个 memory block**（共 T 块）。
- 在第 t 块之后，监督模型**预测下一步推理 r_{t+1}**（最后一块之后预测 **y**）。
- **关键**：自定义 **attention mask**——读出头只能看 **问题 + 目前已出现的 memory blocks**，**不能**看之前的明文推理步骤。这样模型**无法抄捷径**，必须把信息写进 block 表示里。

目标函数（概念上）：

\[
\mathcal{L}_{S1} = -\sum_{t=1}^{T} \lambda_t(s) \log p(r_{t+1} \mid x, m_{\leq t})
\]

\(\lambda_t(s)\) 随训练步数衰减，形成「软课程」：早期所有 readout 都强监督，后期逐步去掉早期块的步骤监督。

#### Stage 2：最终答案精炼（Final Answer Refinement）

- **去掉**中间推理步骤的监督；训练时不再输入明文 **r**。
- 使用**固定数量 K** 个 memory block（与推理步数 T 解耦）。
- 每经过一个 block，监督模型**直接预测最终答案 y**；后面的 block 权重更大（\(\alpha_k\) 线性递增），鼓励「越往后答案越好」。
- 类比 **HRM/TRM** 的迭代精炼，但是沿**序列方向**水平展开，而非循环模块。

Stage 2 目标：

\[
\mathcal{L}_{S2} = -\sum_{k=1}^{K} \alpha_k \log p(y \mid x, m_{\leq k})
\]

阶段切换时**重置优化器与学习率**，Stage 2 用更低 lr、更高 dropout，防止在密集答案监督下过拟合。

### 3. 自定义 Attention Mask

RiM 能在**一次 forward** 里训练所有 readout，靠的是结构化 mask（论文 Figure 2）：

| 位置类型 | 能 attend 到 |
|----------|-------------|
| Memory block | 问题 + 之前的 memory blocks |
| 推理步骤 target（Stage 1） | 问题（可选）+ memory blocks，**不能**看其他推理步骤 |
| 答案 readout（Stage 2） | 问题 + 截至当前的 memory blocks |

这防止 **信息泄漏（information leakage）**，强迫 latent workspace 承担中间计算。

### 4. 与相关方法的对比

| 方法 | 中间状态 | 生成方式 | 推理延迟 |
|------|----------|----------|----------|
| SFT w/ CoT | 明文 token | 自回归生成长链 | 高（~27× RiM on Llama-1B） |
| Coconut | Continuous thoughts | 自回归生成 CT | 中（~7× RiM） |
| RiM | Memory block 表示 | **固定输入，单次 forward** | 低（≈ 直接答题） |

### 5. 实验要点（GSM8K 系列）

- **训练**：GSM8K-Aug（386K 数学题，最多 13 步推理表达式）。
- **评测**：GSM8K（ID）、GSM-Hard（OOD）。
- **模型**：GPT-2、Llama-3.2-1B/3B。
- **主要结果（Llama-3.2-1B, greedy）**：
  - RiM final block：**42.1%** GSM8K vs Coconut **36.9%** vs SFT 无 CoT **23.9%**
  - TTFT：**16.1 ms**（与 SFT 无 CoT 相同），Coconut **108.3 ms**
- **表示分析**：memory block 的 penultimate-layer 表示随训练**按 block 分化、按样本变化**；线性 probe 可较高精度预测答案对错——说明 block 里确实编码了任务相关信息。
- **推理时 memory 预算**：Stage 2 后在较宽的 K、M 范围内准确率**较稳定**，便于部署时 trade-off 算力与精度。

---

## 代码示例 1：构造 RiM 输入与 Attention Mask（PyTorch 伪代码）

下面示例展示如何把「问题 + K 个 memory block + 多个 readout 头」拼成一条训练序列，并实现 Stage 1 的 mask 逻辑（简化版，便于理解论文 Figure 2）。

```python
import torch

SPECIAL = {"MEM_START": 32000, "MEM_0": 32001, "MEM_1": 32002, "MEM_END": 32003}

def build_memory_block(num_slots: int = 2) -> list[int]:
    """一个 memory block = START + M 个 mem slot + END"""
    return [SPECIAL["MEM_START"], *[SPECIAL["MEM_0"]] * num_slots, SPECIAL["MEM_END"]]

def build_rim_stage1_sequence(question_ids, reasoning_steps, K_blocks=None):
    """
    question_ids: List[int]
    reasoning_steps: List[List[int]]  # T 个推理步骤，每步是一段子 token 序列
    """
    T = len(reasoning_steps)
    K = K_blocks or T  # Stage1: 一块对应一步推理
    seq, seg_type = [], []  # seg_type: 'q' | 'mem' | 'target'

    seq.extend(question_ids); seg_type.extend(["q"] * len(question_ids))
    mem_positions = []
    for k in range(K):
        block = build_memory_block(num_slots=2)
        mem_positions.append(len(seq) + 1)  # 记录 block 起始（示意）
        seq.extend(block); seg_type.extend(["mem"] * len(block))
        if k < T:
            seq.extend(reasoning_steps[k]); seg_type.extend(["target"] * len(reasoning_steps[k]))

    return seq, seg_type

def rim_stage1_attention_mask(seg_type: list[str]) -> torch.Tensor:
    """
    返回 (L, L) bool mask: True = 允许 attend.
    target 不能看其他 target；target 只能看 q + 已出现的 mem.
    """
    L = len(seg_type)
    allow = torch.zeros(L, L, dtype=torch.bool)
    mem_seen = []

    for i in range(L):
        # 因果：只能看当前及之前
        for j in range(i + 1):
            ti, tj = seg_type[i], seg_type[j]
            if ti == "target" and tj == "target":
                continue  # 推理步骤之间互相不可见
            if ti == "target" and tj == "mem":
                allow[i, j] = True
            if ti == "target" and tj == "q":
                allow[i, j] = True
            if ti in ("q", "mem") and tj in ("q", "mem"):
                allow[i, j] = True
    return allow

# 用法示意
q = [101, 205, 302]
steps = [[11, 12], [21, 22, 23], [31]]  # 3 步推理
seq, tags = build_rim_stage1_sequence(q, steps)
mask = rim_stage1_attention_mask(tags)
assert mask.shape == (len(seq), len(seq))
```

这段代码对应论文的核心工程技巧：**用 mask 把监督压进 memory block**，而不是让模型从之前的 CoT 文本里「偷看答案」。

---

## 代码示例 2：Stage 1 / Stage 2 损失与推理（Hugging Face 风格伪代码）

```python
import torch
import torch.nn.functional as F

class RiMLoss:
    def stage1(self, logits_list, targets_list, lambdas):
        """
        logits_list[t]: 第 t 个 readout 对 r_{t+1} 的 logits
        targets_list[t]: r_{t+1} 的 token ids
        lambdas[t]: 当前训练步的 λ_t(s)
        """
        loss = 0.0
        for t, (logits, target, lam) in enumerate(zip(logits_list, targets_list, lambdas)):
            if lam <= 0:
                continue
            # 标准 next-token CE，只在 target 区间算
            ce = F.cross_entropy(logits.view(-1, logits.size(-1)), target.view(-1))
            loss = loss + lam * ce
        return loss

    def stage2(self, answer_logits_list, answer_ids, alphas):
        """
        每个 memory block 后都有一个「猜最终答案」的 readout
        alphas[k]: 后面 block 权重更大
        """
        loss = 0.0
        for k, (logits, alpha) in enumerate(zip(answer_logits_list, alphas)):
            ce = F.cross_entropy(logits.view(-1, logits.size(-1)), answer_ids.view(-1))
            loss = loss + alpha * ce
        return loss

def rim_inference(model, tokenizer, question: str, num_blocks: int = 8, mem_slots: int = 2):
    """推理：固定 block，单次 forward，取最后一个 block 后的答案 readout"""
    q_ids = tokenizer.encode(question, add_special_tokens=False)
    mem_ids = []
    for _ in range(num_blocks):
        mem_ids += [32000] + [32001] * mem_slots + [32003]  # START + slots + END

    input_ids = torch.tensor([q_ids + mem_ids])
    with torch.no_grad():
        out = model(input_ids=input_ids, rim_readout="final")  # 假设模型支持 RiM 头

    # 只需生成答案后缀，无需自回归 CoT
    answer_prefix = "The final answer is \\boxed{"
    gen = model.generate(
        inputs=out.readout_hidden,
        max_new_tokens=32,
        prefix_text=answer_prefix,
    )
    return tokenizer.decode(gen)
```

Stage 2 训练完成后，部署时通常只启用 **final-block readout**（固定 K 块后的答案头），因此 **TTFT** 与「问题 + 少量 special token + 直接答」同量级——论文 Table 1 中 RiM 与 SFT w/o CoT 的 TTFT 相同（Llama-3.2-1B 约 16 ms），而 SFT w/ CoT 约 420 ms。

---

## 训练与实现细节（读论文时可对照）

1. **Special token embedding**：仅新 token 可训练；其余词表 embedding 冻结。
2. **Stage 1 块数**：与样本推理步数 T 一一对应（最多 13）；**Stage 2** 统一为 **K=8** 块（主实验）。
3. **λ 调度**：相对样本步数 T 的线性衰减；绝对最大步数衰减对短样本去监督过早。
4. **α 调度**：Stage 2 线性递增，强调后段 block 的最终答案质量。
5. **与 Coconut staging 的区别**：Coconut 逐步用 CT **替换** CoT token，早期 target 仍能 attend 先前 CoT → 监督绕过 latent；RiM **一次性**用 block 替换整条推理链并 mask 掉明文 CoT。
6. **Checkpoint 选择**：16-fold CV，在 264 条 GSM8K Held-out 上选 greedy 最高 checkpoint，减轻「在测试集上挑模型」的过拟合。

---

## 局限与开放问题

- **任务域**：主实验是**小学数学**（GSM8K 系）；代码、多跳工具调用、开放域推理是否同样有效，论文留作 future work。
- **Memory 预算**：K 与 M 在 Stage 2 后较鲁棒，但极端少 block 仍会掉点；复杂题可能需要更多 latent 步或 **RiM + 显式 CoT 混合**。
- **Stage 2 仅用答案监督**：作者提到可用 **RL + 最终答案奖励** 进一步打磨 latent workspace。
- **可解释性**：block 内部是黑盒；probe 能预测对错，但人类仍难以「读出」中间推导，与 CoT 的可审计性 trade-off。
- **与 vertical latent（HRM/TRM）**：RiM 是**水平** block 序列；何种拓扑更适合哪类任务尚无统一答案。

---

## 谁应该读这篇论文

| 读者 | 收获 |
|------|------|
| 做 **推理加速 / 测试时算力** 的工程师 | 固定 slot + 单次 forward，在精度接近 CoT/Coconut 时把 TTFT 压到 direct-answer 级别 |
| 做 **latent reasoning / Coconut 系** 的研究者 | 新的监督范式：dense step grounding + answer refinement，避免 autoregressive CT |
| 训练 **特殊 token / filler** 的人 | 证明「占位 token」能变成工作记忆，但**必须**配 attention mask + 两阶段课程 |
| 零基础入门 LLM 推理 | 理解「出声思考 CoT」与「工作记忆 RiM」的认知类比，以及 mask 如何塑造 latent 空间 |

---

## 一句话总结

**RiM 把 LLM 的推理从「自回归写出思考链」改成「在固定 memory block 槽位里做内部演算，再一次性读出答案」**；用 Stage 1 把 block  grounded 到推理步骤、Stage 2 精炼最终答案，配合 custom attention mask 在单次 forward 中完成 dense 监督，在 GSM8K 上**精度优于 Coconut、延迟接近直接答题**——为「测试时算力不必等于生成更多 token」提供了一条可训练、可部署的路径。

---

## 延伸阅读

- **Chain-of-Thought**：Wei et al., 2022 — 外化推理的开山作。
- **Coconut**：Hao et al., 2025 — 用 continuous thoughts 替代 CoT token，但仍自回归。
- **DART / filler token 系**：Lanham, Pfau, Goyal, Deng et al. — RiM 在 related work 中对标的「占位 token 推理」脉络。
- **HRM / TRM**：垂直迭代 latent refinement，与 RiM Stage 2 的「水平精炼」形成对照。
- **Baddeley working memory / Vygotsky private speech** — 论文 Introduction 的 cognitive motivation 来源。
