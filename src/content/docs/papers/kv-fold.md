---
title: KV-Fold — 一步 KV 缓存递推实现长上下文推理
来源: 'Nadali et al., "KV-Fold: One-Step KV-Cache Recurrence for Long-Context Inference", arXiv:2605.12471, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：接力读一本厚书

想象你要读完一本 500 页的技术手册，但规定是：**每次只能翻开连续 10 页**，读完后必须把「到目前为止的理解」写在一张便签上，下次读新的 10 页时，先读便签，再读新页，然后把新理解追加到便签末尾。

Transformer 做长上下文推理时，面临类似约束：

- **理想情况**：一次性把 128K token 全部喂进模型，每个新 token 都能 attend 到全部历史——显存和算力往往撑不住（全注意力分数矩阵可以大到 TB 级）。
- **StreamingLLM 式做法**：便签只保留最近 1024 个 token + 几个「注意力 sink」——内存 bounded，但写在第 1 页的关键数字，读到第 500 页时可能已经不在便签上了。
- **KV-Fold 的做法**：便签就是 **KV cache**——不压缩、不丢弃，每读完一个 chunk 就把新产生的 K/V **原样拼接**进累积 cache，传给下一步。像函数式编程里的 `foldl`：同一个「一步更新」反复套用，accumulator 越滚越大，但**早期 token 的 K/V 始终还在**，后面还能通过 attention 精确找回来。

论文的核心发现是：这种递推 surprisingly **稳定**——相对「一次性全上下文 forward」的预测分布，误差（drift）在前几步略升，然后进入**平台期**，深度到 511 步也不继续恶化；在 needle-in-a-haystack 上，Llama-3.1-8B 在 16K–128K、深度 511 的设定下 **152/152 次精确检索成功**，单卡 40GB A100 可跑完。

---

## 是什么

**KV-Fold** 是一种 **training-free**（无需微调、不改架构）的长上下文**推理协议**，把预训练 Transformer 的 KV cache 当作跨 chunk 的**递推状态（recurrent state）**：

1. 把长序列切成长度为 `C` 的 chunk：`x₀, x₁, …, x_{N-1}`，总长度 `T = N × C`。
2. 处理 chunk `t` 时，把 chunk `0…t-1` 累积的 KV cache 当作 **prefix**，当前 chunk 的 query 可以 attend 到全部历史 K/V。
3. forward 结束后，把 chunk `t` 新产生的 K/V **append** 到 cache，**不做 copy 变换、不压缩**，传给 chunk `t+1`。
4. 新 token 的 **position id 从绝对位置 `t×C` 连续编号**，RoPE 与「一次性读完整序列」对齐。

用函数式写法，就是 left fold：

```text
(K, V) = foldl(F_θ, (∅, ∅), [x₀, x₁, …, x_{N-1}])
```

其中 `F_θ` 是标准 Transformer forward，accumulator 是不断变长的 `(K, V)` cache。

论文建立在 **LatentMAS** 等工作提出的「KV cache 拼接 / 跨 pass 当 prefix」原语之上，但用途从多智能体 latent 通信改成了**单模型内的长上下文分块推理**。

---

## 为什么重要

长上下文是 2024–2026 LLM 的主战场，但常见路线各有代价：

| 路线 | 典型代表 | 优点 | 代价 |
|------|----------|------|------|
| 原生长窗口 | Llama 3.1 128K | 行为与训练一致 | 单次 forward 显存/算力爆炸 |
| 流式 / 滑动窗口 | StreamingLLM | 内存 bounded、快 | 窗口外 token **不可检索** |
| KV 压缩 / 驱逐 | H2O、SnapKV 等 | 省显存 | **有损**，精确召回任务易掉点 |
| 改架构 / 再训练 | RingAttention、YaRN 微调 | 可扩展 | 工程或训练成本高 |

KV-Fold 占了一个独特位置：**不训练、不压缩、保留完整 KV 历史**，用多次「可承受的 forward」换「单次不可承受的 forward」。论文用 drift 曲线证明递推不是误差雪崩，用 NIAH 证明**任务级精确信息**可跨数百个 chunk 边界保留——说明 frozen pretrained Transformer **已经具备**这种 KV 递推能力，只是以前没人系统把它当长上下文协议来用。

---

## 核心概念

### 1. KV cache 不只是加速技巧

Decoder-only 模型自回归生成时，每层会为已见 token 缓存 Key/Value，避免重复计算。KV-Fold 把 cache 重新定义为：**模型过去计算的 structured record**，是可跨 chunk 携带的**状态**，而不只是 serving 优化。

### 2. 一步更新（one-step recurrence）

每个 chunk 边界只做**一次**标准 forward + append，chunk 内部不再迭代。这与 REFORM、LESS 等「chunk 内多轮 / 压缩后再递推」不同——KV-Fold 刻意保持极简。

Attention 在 layer ℓ 上形如：

```text
Q_t^(ℓ)  来自当前 chunk 的新 token
K_{0:t}^(ℓ) = [K_0^(ℓ); K_1^(ℓ); …; K_{t-1}^(ℓ); K_t^(ℓ)]   // 沿序列维拼接
V_{0:t}^(ℓ) 同理
```

chunk `t-1` 的 K/V **原样**作为 prefix 进入 chunk `t`，边界处 **continuous position IDs** 至关重要。

### 3. Drift 与平台期（plateau）

论文定义三种对照：

- **full**：单次全上下文 forward 的 NLL（上界）
- **isolated**：每个 chunk 单独 forward、无 prefix（下界）
- **kv-fold**：带累积 KV prefix 的 NLL

**Drift** = `NLL_kv-fold − NLL_full`：相对「理想全注意力」偏了多少。  
**Recurrence advantage** = `NLL_isolated − NLL_kv-fold`：递推比孤立 chunk 好多少。

实验（Qwen2.5-7B，T=16K，C=256）：drift 在前 ~7 个 chunk 边界上升，之后 **~0.04 nats 平台期** 维持到 depth 63；advantage 全程为正。把精度从 bf16 提到 fp32（约 10000×），平台 drift 只降 **2.8%**——说明主要是**结构性** attention  regime 偏移，不是舍入误差累积。

### 4. 与 StreamingLLM 的权衡

| 指标 | KV-Fold @ 128K | StreamingLLM @ 128K |
|------|----------------|------------------------|
| Peak GPU 内存 | ~35.6 GB（线性增长） | ~16.6 GB（固定 ~1024 cache） |
| NIAH 检索 | 100%（needle 可在任意深度） | 0%（needle 滑出窗口后） |
|  wall-clock | ~171 s（Llama-3.1-8B） | 更快，但丢远程事实 |

**多出来的内存买的是完整检索能力**，不是 perplexity  alone。

### 5. Needle-in-a-haystack 协议（任务级验证）

1. 从 PG-19 采样 16K+ token 长文作 haystack。  
2. 插入句子：`The magic number for [key] is [value].`（key 为罕见词，value 为 5 位数字）。  
3. 控制 needle 与最终问题之间的 **chain depth** `d`（chunk 边界数）。  
4. 问：`Earlier in the document, what was the magic number associated with [key]?`  
5. 贪婪解码 30 token，抽取第一个 5 位数与 gold 比对。

KV-Fold 在 Qwen2.5-7B 上 d∈{1,15,31,62} 各 20 次 trial **80/80**；Llama-3.1-8B 扩到 T=128K、depth 511 仍 **152/152**。

---

## 代码示例 1：最小 KV-Fold 推理循环（伪代码）

下面用接近 PyTorch / HuggingFace 的伪代码展示协议本身——**核心就是 prefix cache + 连续 position + concat**：

```python
def kv_fold_prefill(model, token_ids: list[int], chunk_size: int = 256):
    """
    将长 prompt 按 KV-Fold 协议预填充，返回最终 past_key_values 供 decode 使用。
    token_ids: 完整长上下文
    chunk_size: 每个 chunk 的 token 数 C
    """
    past_kv = None          # accumulator: 各层 (K, V)，初始为空
    abs_pos = 0             # 全局绝对位置，供 RoPE / position_ids

    for start in range(0, len(token_ids), chunk_size):
        chunk = token_ids[start : start + chunk_size]
        position_ids = list(range(abs_pos, abs_pos + len(chunk)))

        # 关键：past_key_values 作为 prefix；新 chunk 的 Q 可 attend 全部历史 K/V
        outputs = model.forward(
            input_ids=chunk,
            position_ids=position_ids,
            past_key_values=past_kv,
            use_cache=True,
        )

        # 一步更新：append 本 chunk 产生的 K/V（框架通常已在 past 里 concat 好）
        past_kv = outputs.past_key_values
        abs_pos += len(chunk)

    return past_kv


def generate_after_kv_fold(model, past_kv, question_ids: list[int]):
    """Haystack 读完后的短问题可以照常 autoregressive 生成。"""
    return model.generate(
        input_ids=question_ids,
        past_key_values=past_kv,
        max_new_tokens=30,
        do_sample=False,  # 论文 NIAH 用 greedy
    )
```

实现时务必确认三点：

1. **position_ids 跨 chunk 连续**，不能每个 chunk 从 0 重计。  
2. **prefix K/V 不做额外投影或压缩**（与 LatentMAS Eq.4 一致）。  
3. 框架的 `past_key_values` 语义是「当前 forward 之前已存在的 KV」；不同版本 API 字段名可能不同（`cache_position` 等），但逻辑不变。

---

## 代码示例 2：用 `foldl` 理解递推 + 简单 drift 监控

第二个例子从函数式视角写递推，并演示如何像论文一样监控 **per-depth drift**（需要偶尔跑 full baseline 作对照）：

```python
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Optional

Chunk = list[int]
KVCache = Any  # 每层 (key, value) 的 tuple 列表


@dataclass
class FoldState:
    kv: Optional[KVCache]
    depth: int = 0


def foldl_chunks(
    chunks: Iterable[Chunk],
    step_fn: Callable[[FoldState, Chunk], FoldState],
    init: FoldState,
) -> FoldState:
    """与论文 Eq.(2) 同构的 left fold。"""
    acc = init
    for x_t in chunks:
        acc = step_fn(acc, x_t)
        acc.depth += 1
    return acc


def make_step(model, nll_fn) -> Callable[[FoldState, Chunk], FoldState]:
    def step(acc: FoldState, chunk: Chunk) -> FoldState:
        pos = acc.depth * len(chunk)  # 简化：等长 chunk；不等长时用 running offset
        out = model.forward(chunk, past_key_values=acc.kv, position_offset=pos)
        return FoldState(kv=out.past_key_values, depth=acc.depth)
    return step


def per_depth_drift(model, full_ids: list[int], chunk_size: int) -> list[float]:
    """
    drift(d) = NLL_kv_fold(d) - NLL_full(d)
    论文在 PG-19 上对每个 chunk 边界算 marginal NLL；这里示意结构。
    """
    chunks = [
        full_ids[i : i + chunk_size]
        for i in range(0, len(full_ids), chunk_size)
    ]
    drifts = []

    for d, _ in enumerate(chunks):
        # full baseline：同一窗口内单次 forward（仅当 T 能放进显存时可行）
        nll_full = model.nll_at_chunk_boundary(full_ids, chunk_index=d, mode="full")

        # kv-fold：只 fold 到第 d 个 chunk
        state = foldl_chunks(
            chunks[: d + 1],
            make_step(model, None),
            FoldState(kv=None, depth=0),
        )
        nll_fold = model.nll_at_chunk_boundary(full_ids, chunk_index=d, past_kv=state.kv)

        drifts.append(nll_fold - nll_full)

    return drifts


# 预期形状（与论文 Fig.3 一致）：
# drifts[:7]  可能缓慢上升
# drifts[7:]  进入平台，总变化 ~ O(1e-4) nats 量级
```

这段代码不能直接跑通所有 HF 模型（`nll_at_chunk_boundary` 需按实现补齐），但抓住了论文的**评估骨架**：不是只看最终 loss，而是看 **chain depth 上的 drift 曲线是否饱和**。

---

## 算法流程（一图胜千言）

```text
初始: K,V = 空

对于 t = 0 .. N-1:
    ┌─────────────────────────────────────────────┐
    │  Forward chunk x_t                          │
    │  · position_ids = [tC, tC+1, …, (t+1)C-1]   │
    │  · prefix = (K_{0:t-1}, V_{0:t-1})          │
    │  · 计算 Q_t,  attend 到 K_{0:t}, V_{0:t}    │
    └─────────────────────────────────────────────┘
                        │
                        ▼
              Append K_t, V_t → 累积 cache
                        │
                        ▼
              传给 chunk t+1（无压缩）

全部 chunk 处理完后:
    用最终 past_key_values + 短问题 prompt → generate
```

---

## 实验结果速览

**稳定性（Qwen2.5-7B-Instruct，T=16K，C=256）**

- Drift 在 depth≈7 饱和，depth 15→60 总变化 −0.0003 nats。  
- Recurrence advantage 从 +0.33 到 +0.45 nats，全程为正。  
- 跨 OLMoE / Qwen2.5 / Llama-3.1 三族，**定性模式相同**。

**检索（Llama-3.1-8B-Instruct）**

- T ∈ {32K, 64K, 96K, 128K}，chain depth 最高 **511**。  
- **152/152** exact-match；peak memory @128K ≈ 35.6 GB / 40 GB A100。  
- 对比 StreamingLLM：needle 一旦离开 1024 token 窗口，检索 **0%**。

**精度消融**

- bf16 平台 drift 0.0647 vs fp32 0.0629 nats。  
- Chunk size C ∈ {128,256,512,1024}，平台 drift 变化 <9%，无单调依赖。

---

## 适用 vs 不适用

**适合 KV-Fold 的场景**

- 需要在 **不改权重** 的前提下，把现有 8B 级模型推到 **64K–128K** 级 document QA、日志审计、代码库扫描。  
- 任务要求 **精确召回** 早期事实（合同条款号、magic number、CVE id），不能接受 StreamingLLM 式窗口外丢失。  
- 硬件有 **线性增长的 KV 显存预算**（例如 40GB 单卡可换 128K×8B 量级）。  
- 可以接受 **多次 forward 的 wall-clock**（128K 约 171s 量级），而非单次 ultra-fast prefill。

**不太适合的场景**

- **显存硬上限** 且无法线性扩容：cache 随 T 线性增长，没有 bounded-memory 保证。  
- 需要与 **full-attention 逐 token 完全一致** 的生成分布：存在 ~0.04–0.12 nats 级 plateau drift（检索仍 100%，但 open-ended 生成可能有细微差异）。  
- 超长上下文 **远超训练 RoPE 范围** 且未做位置外推：论文刻意在 Llama 3.1 **原生 128K 内**测试，避免 OOD 因素。  
- 极低延迟在线服务：Streaming / 压缩 KV 通常更快。

---

## 与相关工作的关系

- **LatentMAS（KV 拼接原语）**：多 agent 之间传 KV；KV-Fold 是**单模型、单任务**的长上下文 fold。  
- **StreamingLLM**：bounded memory，牺牲远程检索；KV-Fold 反方向 trade-off。  
- **REFORM / LESS / 级联 KV**：也做 chunk + cache，但常含 **压缩、重算、跨层 embedding**；KV-Fold **拒绝压缩**。  
- **RingAttention / 序列并行**：解决单次 forward 的算力分布；KV-Fold 是 **推理协议**，可 orthogonal 组合。

---

## 局限与开放问题

论文自述：对 plateau 的解释是 **descriptive**，未证明 fold 动力学收敛或刻画 fixed point。  
未给出生产级开源实现（截至笔记写作时以 arXiv 2605.12471 为准）。  
Drift 存在但 NIAH 仍 100%——对 **开放式长文摘要、多跳推理** 的影响需更多 benchmark。  
Cache 线性增长 → 更长上下文（1M+）仍需与 **KV 量化、offload、稀疏 attention** 等组合。

---

## 自测题

1. KV-Fold 的 accumulator 是什么？与 RNN hidden state 有何异同？  
2. 为什么 position id 必须跨 chunk 连续？若每个 chunk 从 0 重计会怎样？  
3. 解释 drift plateau：为何不是「误差随 depth 线性累积」？  
4. 在 40GB 卡上，KV-Fold vs StreamingLLM，你如何选择？  
5. `foldl(F_θ, (∅,∅), chunks)` 中，若把 append 改成 top-k 驱逐，协议还叫 KV-Fold 吗？

<details>
<summary>参考答案（先自己想再点开）</summary>

1. Accumulator 是各层拼接的 KV cache；RNN hidden 固定维且通常有损压缩，KV-Fold state 随序列线性增长、保留 token 级 addressable 表示。  
2. RoPE 依赖绝对位置；重计会破坏与训练时「长序列一次编码」的位置对齐，attention 模式错位。  
3. 前几步切换到 slightly shifted attention regime 后，同一 `F_θ` 再应用不再显著改变预测；fp32 消融支持「结构性」而非纯数值累积。  
4. 要 exact retrieval / 合规审计 → KV-Fold；要 bounded memory、只关心局部上下文 → Streaming；显存介于两者之间可考虑压缩 KV 方法。  
5. 不算；KV-Fold 定义包含 **无压缩、原样 concat** 的 one-step update。

</details>

---

## 延伸阅读

- 论文：[arXiv:2605.12471](https://arxiv.org/abs/2605.12471)（HTML 版便于读 Fig.1–3）  
- 前置原语：LatentMAS — KV cache 作为跨 pass prefix  
- 对照基线：StreamingLLM（bounded cache + attention sinks）  
- 评估数据：PG-19 长文、needle-in-a-haystack / RULER 类长上下文探针  

---

## 一句话总结

**KV-Fold 把 KV cache 当成 `foldl` 的 accumulator：chunk 间原样拼接、位置连续、不训练不压缩——用线性显存和多次 forward，换 frozen Transformer 在 128K 级上下文上的稳定递推与精确远程检索。**
