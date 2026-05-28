---
title: LLaMA — Chinchilla 实证落地版：7B 训 1T tokens，开放权重点燃 2023 开源 LLM 生态
description: Touvron 2023 用 RMSNorm + SwiGLU + RoPE + 公开数据 + 故意 over-train，把 Chinchilla M2 的 D=20N 推到 D≈140N，证明"小模型 + 多数据"工业可行；LLaMA 2 加 GQA 后成为 Mistral / Vicuna / Alpaca / DeepSeek 全部 fine-tune 派的祖宗
sidebar:
  label: LLaMA (arXiv 2023)
  order: 57
---

> 论文类型 self-classify：**method / algorithm paper**（v1.1 分支 A）。
> 心脏物 = 一段架构描述（Section 2，三个 swap：RMSNorm / SwiGLU / RoPE）+ 一张训练数据混合表（Table 1）。
> 不是 empirical study——它有具体的"换零件"决策，每一个零件都能在代码里指给你看。
> 不是 benchmark——主要贡献是模型权重和训练 recipe，不是评测协议。
> Layer 3 / Layer 4 走 v1.1 分支 A 标准（GitHub permalink + 真实 Python 代码）。

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题 | LLaMA: Open and Efficient Foundation Language Models |
| 标题翻译 | LLaMA：开放高效的基础语言模型 |
| 作者 | Hugo Touvron, Thibaut Lavril, Gautier Izacard, Xavier Martinet, Marie-Anne Lachaux, Timothée Lacroix, Baptiste Rozière, Naman Goyal, Eric Hambro, Faisal Azhar, Aurelien Rodriguez, Armand Joulin, Edouard Grave, Guillaume Lample（14 人，FAIR / Meta AI） |
| 一作机构 | Meta AI / FAIR (Paris)。Touvron 当时 PhD（FAIR 联培）→ 现 Mistral 联合创始人；Lample / Lacroix → 离职后联创 Mistral；Joulin / Lavril → 离职去 Kyutai。**核心作者 4-5 人离职后开了 Mistral** —— 这条人脉解释了为什么 Mistral 7B 与 LLaMA 1 7B 架构几乎一致。 |
| 发表时间 | arXiv 2023-02-27 提交（v1），2023-02-27 也是终版 |
| 发表渠道 | arXiv [2302.13971](https://arxiv.org/abs/2302.13971)（**未投会**——Meta tech report 风格，一上来就是工业产物，没走 NeurIPS/ICLR review） |
| arXiv ID | [2302.13971](https://arxiv.org/abs/2302.13971)（v1 即 final，**v1 之后没修改过**——Meta 内部已经在准备 LLaMA 2，所以这版没必要 polish） |
| 数据 / 资源 | 训练混合（Table 1，1.4T tokens 公开来源）：CommonCrawl 67% + C4 15% + Github 4.5% + Wikipedia 4.5% + Books 4.5% + ArXiv 2.5% + StackExchange 2%。**全部公开数据** —— 与 GPT-3 / PaLM / Chinchilla（用 closed MassiveText）的关键区别 |
| 测量工具年代 | 2022 年用 2048 张 A100 80GB + Megatron-LM + xformers FlashAttention v1。2026 主流已用 H100/H200 + FlashAttention v3 + FSDP——**绝对训练成本下降 ~4 倍但 LLaMA 这套架构 swap 几乎被全行业继承** |
| 代码 / 资源 | 原始 LLaMA 1 推理 repo：[`meta-llama/llama`](https://github.com/meta-llama/llama) ([commit `689c7f261b9c5514636ecc3c5fefefcbb3e6eed7`](https://github.com/meta-llama/llama/tree/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7))（only 推理，训练代码从未公开 / 21k stars 截至 2026-05-29）；LLaMA 2/3 统一仓库：[`meta-llama/llama-models`](https://github.com/meta-llama/llama-models) ([commit `0e0b8c519242d5833d8c11bffc1232b77ad7f301`](https://github.com/meta-llama/llama-models/tree/0e0b8c519242d5833d8c11bffc1232b77ad7f301))；HuggingFace 实现（生产首选）：[`huggingface/transformers`](https://github.com/huggingface/transformers) ([commit `08f13097eb5c057b2bd373ca8241019614f564ac`](https://github.com/huggingface/transformers/tree/08f13097eb5c057b2bd373ca8241019614f564ac))，`models/llama/modeling_llama.py` |
| 论文类型 | method / algorithm paper（"工业 tech report"形态）—— 对手是 GPT-3 / PaLM / Chinchilla，但创新是 architecture × data × license 三轴的实战取舍而不是新算法 |
| 引用数 | 12500+（截至 2026-05-29）。**LLaMA 2 / Mistral / Alpaca / Vicuna / DeepSeek / Qwen / Phi / Code Llama / OLMo / TinyLlama 全部正面引用**——LLM 时代被引用最多的非 OpenAI 论文之一 |

## 原文摘要翻译

我们提出 **LLaMA**，一系列 7B 到 65B 参数的基础语言模型。
我们用**数万亿 token** 训练这些模型，并证明仅用**公开数据集**就能训出 state-of-the-art 模型，
不需要诉诸专有不可访问的数据。
具体地，**LLaMA-13B 在大多数 benchmark 上超过 GPT-3 (175B)**，
**LLaMA-65B 与最佳模型 Chinchilla-70B 和 PaLM-540B 竞争力相当**。
我们将所有模型发布给研究社区。

## 创新点

LLaMA 给"训练并发布开源 LLM"领域提供了 5 个真正新的东西：

1. **Chinchilla M2 实证落地 + 故意 over-train**：[Chinchilla](/study/papers/chinchilla/)
   给的"D ≈ 20×N"是**训练 compute 最优**，但 LLaMA 论文 Section 2 明确说
   "we focus on training models that are as cheap as possible at inference time"——
   于是 **7B 模型训了 1T tokens（D ≈ 140×N，约 7× over-train）**，**13B 训 1T，33B/65B 训 1.4T**。
   推理便宜 7× 的代价是训练贵 ~7×，但**部署在亿级用户上推理省的钱远超训练成本**。
   这条工程直觉后来被 LLaMA 2/3、Mistral、Qwen 全部继承。
2. **三个架构 swap 一次到位**：Section 2.2-2.4 给出
   **RMSNorm**（pre-norm，替 LayerNorm）+ **SwiGLU**（替 ReLU MLP）+ **RoPE**（替绝对位置编码）。
   每一个都不是 LLaMA 首创，但**第一次把三个一起放进开源工业 baseline**——
   LLaMA 之后 2024-2025 的开源模型几乎都用这套，**事实标准**。
3. **全公开数据混合**（Table 1）：1.4T tokens 全来自 CommonCrawl / C4 / Github / Wiki / Books3 / ArXiv / StackExchange，
   **没有任何 closed dataset**——直接打脸 OpenAI / DeepMind 的"必须用专有高质量数据"叙事。
   开源社区因此可以**完全复刻数据 pipeline**（RedPajama、SlimPajama 后续做到了）。
4. **开放权重点燃 fine-tune 生态**：原版 LLaMA 1 是 non-commercial license + 走 Form 申请，
   但权重几天内泄露到 4chan，**整个 Stanford Alpaca / Vicuna / WizardLM / Guanaco / Code Llama / Llama-2-Chat 全在 LLaMA 权重上 fine-tune**。
   LLaMA 2（2023-07）转商用许可后，**Hugging Face Hub 上 50%+ 的 base model 是 LLaMA 衍生**。
5. **GQA**（仅 LLaMA 2 引入，但本笔记一并讨论 LLaMA 系演化）：
   `n_kv_heads < n_heads`，多个 query head 共享一组 KV head。
   **推理时 KV cache 内存占用降到 1/n_rep**——70B 模型从 80GB → ~10GB KV，
   单 H100 就能跑 8K context。GQA 之前 PaLM/MQA 是 n_kv_heads=1 太激进损失质量；
   GQA 是 n_kv_heads=8 的"质量-速度甜点"。

## 一句话总结

**[Chinchilla](/study/papers/chinchilla/) 给了"D=20N"经验法则；LLaMA 故意打破它（D=140N）来换推理便宜；
RMSNorm + SwiGLU + RoPE + GQA 四个架构 swap 让开源 LLM 第一次有了一个能比肩 GPT-3 的工业 baseline。**

你今天用的每一个 Mistral / Llama-3 / Qwen / DeepSeek / Phi / Alpaca / Vicuna 模型，
weight tensor 的命名、attention 的 `apply_rotary_emb` 调用顺序、FFN 的 `silu(w1*x) * w3*x`、
甚至 `tokenizer.model` 的 SentencePiece BPE 32k 词表都是从这篇 27 页 tech report 复制出来的——
这个回路的起点就是 Touvron 2023 这篇没投会的 arXiv preprint。

![LLaMA 三个架构 swap](/study/papers/llama/01-architecture.webp)

*图 1：LLaMA 三个架构创新——
左 **RMSNorm**（替 LayerNorm，无 mean centering，~7% 更快）、
中 **SwiGLU FFN**（替 ReLU MLP，gating 提质量、宽度收 2/3 保持参数总数）、
右 **RoPE**（替 absolute pos embedding，每层都施加复数旋转，外推友好）。
底部画出完整 pre-norm 块：`x → RMSNorm → Attn(RoPE q,k, KV-cache) → +x → RMSNorm → SwiGLU → +x`。
LLaMA 1 用 MHA（n_heads=n_kv_heads），LLaMA 2 70B 引入 GQA（n_heads=64, n_kv_heads=8, n_rep=8）。
手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

LLaMA 出现前，"开源 LLM" 圈子的状态是：

- **闭源 SOTA 派**（GPT-3 175B / PaLM 540B / Chinchilla 70B）：质量好，但**模型权重全闭源**，
  研究者只能 API call、不能 fine-tune、不能改架构。"开源" 只到 paper PDF 为止。
- **开源弱模型派**（GPT-Neo 2.7B / GPT-J 6B / GPT-NeoX 20B / OPT 175B / BLOOM 176B）：
  - GPT-J/Neo：EleutherAI 团队，2021，**模型 quality 远落后于 GPT-3**（13B 就能赢的事情用 6B 做），
    架构是裸 GPT-2 风格（LayerNorm + ReLU + absolute pos embedding）。
  - OPT-175B（Meta 2022）：尺寸对标 GPT-3 但**训练数据少**（180B tokens vs GPT-3 的 300B），
    **架构没换零件**，质量普遍不如 GPT-3 175B。Meta 内部 LLaMA 团队对这条路线的 reflection 直接催生了 LLaMA。
  - BLOOM-176B（BigScience 2022）：1100 人协作，多语言导向，**英文质量明显弱于 GPT-3**，
    架构同样没换零件（用了 ALiBi 位置编码而不是 RoPE）。
- **Chinchilla 派的盲点**（DeepMind 2022）：给了 D ≈ 20×N 的经验法则，
  但**只 optimize 训练 compute**——70B 训 1.4T，对于真正部署而言 70B 还是太大。
  Chinchilla 论文 Section 5.4 末尾留了一句"推理成本"，但没认真做实验。
- **架构碎片**：RMSNorm（Zhang 2019 RootMS for ASR）、SwiGLU（Shazeer 2020 Gated FFN）、
  RoPE（Su 2021 RoFormer）三件套**各自有论文但没人把它们一起放进 100B 级别开源 baseline**。
  PaLM 540B 用了 RoPE+SwiGLU 但闭源；GPT-NeoX 20B 用了 RoPE 但是 ReLU。

中间还有几篇尝试（GPT-J / GPT-NeoX / OPT），但都没把"开源 + 大数据 + 架构 swap + 推理优先"四个一起做对。

LLaMA 的核心 insight 异常工程化：**部署 LLM 的成本 = 训练成本一次性 + 推理成本永久。
对于 ChatGPT 量级用户量，推理成本几个月内就超过训练成本。
所以应该选"训练贵但推理便宜"的工作点——故意 over-train 小模型**。
这条 insight Section 1 第一段就明说了；后面 1.4T tokens 训 7B 是直接 implication。

最关键的工程细节藏在 Section 2.2 的"pre-norm"：
LLaMA 的 RMSNorm 放在 **sublayer 输入端**（pre-norm），不是 sublayer 输出端（post-norm，原始 transformer 论文）。
**pre-norm 的好处：训练更稳定，learning rate 可以更大**。
GPT-2/3 早就用 pre-norm，LLaMA 沿袭。但 LLaMA 把 LayerNorm 进一步换成 RMSNorm。

第二个关键细节（论文叙事里被遮蔽的）：**SwiGLU 的隐藏维度是 `2/3 * 4 * dim`，再向上对齐到 `multiple_of`**。
这一行在 [`llama/model.py:331-335`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L331-L335)：

```python
hidden_dim = int(2 * hidden_dim / 3)
if ffn_dim_multiplier is not None:
    hidden_dim = int(ffn_dim_multiplier * hidden_dim)
hidden_dim = multiple_of * ((hidden_dim + multiple_of - 1) // multiple_of)
```

**为什么 2/3**？SwiGLU 比 ReLU 多一个矩阵（w3），如果 hidden 不收 2/3，参数总数会多 50%。
通过 `2/3 × 4 × dim ≈ 2.67 × dim`，参数量与 ReLU 4×dim 持平——这是工业 LLM 的"无成本质量提升"trick，
但在 LLaMA 论文正文里只有半句话提及。

## 论文地形（章节角色注释）

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation（推理成本视角） + 主要 contribution | 精读 |
| 2. Approach | **心脏物 1**：3 个架构 swap + 训练 recipe + tokenizer | 必看 |
| 2.1 Pre-training Data | **心脏物 2**：Table 1 数据混合表 | 必看 |
| 2.2 Architecture | RMSNorm / SwiGLU / RoPE 的 paragraph 各 5-8 行 | 精读 |
| 2.3 Optimizer | AdamW + cosine + grad clip 1.0 | 速读 |
| 2.4 Efficient impl | xformers / FlashAttention / activation ckpt | 速读（工程细节） |
| 3. Main Results | Common Sense / Closed-book QA / Reading / MMLU / Math / Code | 看 Table 3-7 |
| 4. Instruction Finetuning | 一段：LLaMA-I 7B 在 MMLU 上 + 5pt | 跳 |
| 5. Bias / Toxicity | 标准 RAI section | 跳 |
| 6. Related Work | 把对手分两堆：closed (GPT-3/PaLM) / open (GPT-J/OPT) | 速读 |
| 7. Conclusion | 短，一段 | 跳 |
| Appendix A. QA examples | 选 2-3 个看 LLaMA-65B 怎么答 | 选看 |
| Appendix B. Generations | LLaMA 自由生成样本 | 跳 |

**心脏物 3 个**：
1. Section 2.2 的架构 swap（3 个零件）
2. Table 1 的数据混合（验证"全公开数据可行"的关键证据）
3. Table 3 LLaMA-13B vs GPT-3-175B 的逐 benchmark 对比（核心 main result）

## 核心机制（Layer 3 · 三段独立小节）

### 3.1 RoPE：旋转位置编码

RoPE 是 LLaMA 三个架构 swap 中**数学最深、最容易让初学者卡住**的一个。
直觉：把 query 和 key 的每对相邻维度看成复平面上一个点 `(x_{2k}, x_{2k+1}) → x_{2k} + i*x_{2k+1}`，
然后在位置 `m` 处把它**旋转一个角度** `m * theta_k`，其中 `theta_k = 10000^{-2k/d}`。
旋转之后做内积 `q^T k`，会发现结果只依赖 `m - n`（位置差），与 `m`、`n` 各自的绝对值无关——
**绝对位置消失，相对位置自然涌现**。这就是 RoPE 比 absolute / sinusoidal 编码强的根本原因。

LLaMA repo 把 RoPE 拆成三个函数（[`llama/model.py:80-161`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L80-L161)），第一个是 `precompute_freqs_cis`，
预计算所有位置 × 所有维度的复数旋转因子（实际运行时直接查表）：

```python
def precompute_freqs_cis(dim: int, end: int, theta: float = 10000.0):
    """
    Precompute the frequency tensor for complex exponentials (cis) with given dimensions.
    """
    # 1. 计算每个维度对的角速度 theta_k = 10000^(-2k/d)
    #    arange(0, dim, 2) 取 [0, 2, 4, ..., dim-2]，正好 dim/2 个
    freqs = 1.0 / (theta ** (torch.arange(0, dim, 2)[: (dim // 2)].float() / dim))
    # 2. 位置索引 t = [0, 1, 2, ..., end-1]
    t = torch.arange(end, device=freqs.device)
    # 3. 外积：每个位置 × 每个角速度 -> [end, dim/2]
    freqs = torch.outer(t, freqs).float()
    # 4. 转复数：单位长度 + 旋转角度 freqs -> e^{i*freqs}
    freqs_cis = torch.polar(torch.ones_like(freqs), freqs)  # complex64
    return freqs_cis


def reshape_for_broadcast(freqs_cis, x):
    """把 [seqlen, head_dim/2] 的 freqs reshape 成能与 [bs, seqlen, n_heads, head_dim/2] 广播的形状"""
    ndim = x.ndim
    assert 0 <= 1 < ndim
    assert freqs_cis.shape == (x.shape[1], x.shape[-1])
    shape = [d if i == 1 or i == ndim - 1 else 1 for i, d in enumerate(x.shape)]
    return freqs_cis.view(*shape)


def apply_rotary_emb(xq, xk, freqs_cis):
    """对 q, k 应用 RoPE：reshape 成复数 -> 与 freqs_cis 相乘（即旋转）-> 转回实数"""
    # xq: [bs, seqlen, n_heads, head_dim] -> [bs, seqlen, n_heads, head_dim/2] complex
    xq_ = torch.view_as_complex(xq.float().reshape(*xq.shape[:-1], -1, 2))
    xk_ = torch.view_as_complex(xk.float().reshape(*xk.shape[:-1], -1, 2))
    freqs_cis = reshape_for_broadcast(freqs_cis, xq_)
    xq_out = torch.view_as_real(xq_ * freqs_cis).flatten(3)  # 复数乘 = 旋转
    xk_out = torch.view_as_real(xk_ * freqs_cis).flatten(3)
    return xq_out.type_as(xq), xk_out.type_as(xk)
```

**旁注**：

- `theta = 10000` 是 sinusoidal 编码继承的 magic number——后来 Code Llama / Llama 3 把 theta 改成 500000 或 1000000 来支持更长上下文（"NTK-aware scaling"）。**只改一个数字 = 把 4K 上下文外推到 32K**。
- `torch.polar(magnitude, angle)` 创建复数 `magnitude * (cos(angle) + i*sin(angle))`——LLaMA repo 用复数原生类型而不是分别存 cos/sin，代码更短但**只能在 CPU/CUDA 跑，TPU/Metal 上 HuggingFace 的实现拆成了 cos/sin 双 buffer**（见 `modeling_llama.py` 中的 `LlamaRotaryEmbedding`）。
- `arange(0, dim, 2)[: (dim // 2)]` 这个切片看着冗余（arange 长度本来就是 dim/2），但用 `[: (dim // 2)]` 的**强制截断保护了 dim 是奇数时不崩**——这是 LLaMA 团队从 OPT 训练失败教训里学来的防御性写法。
- `view_as_complex` / `view_as_real` 是 zero-copy reinterpretation：底层 buffer 不动，只换 dtype/shape。**正因为 zero-copy 才能 fp16 训练**——如果是真复制，每层 forward + backward 都会爆显存。
- RoPE 的 `apply_rotary_emb` 在 [`llama/model.py:280`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L280) 被调用——**注意它在 wq/wk projection 之后、KV cache 写入之前**。
  顺序错了（先写 cache 再 RoPE）会导致**长上下文 attention 拿到没旋转的 K**——这是 OSS 复刻最常见的 bug。

**怀疑 1**：RoPE 的 `theta = 10000` 其实是从 sinusoidal 编码（Vaswani 2017）盲抄过来的，没人证明它对 LLM 是最优。LLaMA 论文 Section 2.2 只用一句话"we replace the absolute positional embeddings with the rotary positional embeddings (RoPE)"带过——**没做任何 ablation 比较 theta=10000 vs 5000 vs 50000 在 13B/65B 上的影响**。后续 Code Llama 把 theta 改成 1M 才能稳上 100K context，说明这个 hyperparameter 远没收敛。Touvron 2023 跳过这个 ablation 是工业 tech report 的典型时间预算妥协。

### 3.2 RMSNorm + SwiGLU FFN

**RMSNorm**（Zhang & Sennrich 2019）和 **SwiGLU**（Shazeer 2020）是 LLaMA 块中最不抢戏的两个 swap，
但它们一起把每层的"normalization → attention → FFN → 残差"四步路径都翻新了。
直觉：

- **LayerNorm** 做 4 件事：减均值（centering）、除标准差（scaling）、乘可学习 gain、加可学习 bias。
- **RMSNorm** 只做 2 件事：除以 RMS（root mean square）、乘可学习 gain。**少了 mean centering 和 bias**——
  实证上 ASR、NMT、LLM 都没看到质量损失，但每层省 ~10% 计算。
- **ReLU FFN**：`y = W2 * max(0, W1 * x)`，2 个矩阵。
- **SwiGLU FFN**：`y = W2 * (silu(W1*x) * W3*x)`，3 个矩阵但每个只有 ReLU 的 2/3 宽度——
  参数量持平，但 gating 路径（`* W3*x` 那一支）让 hidden 表达更丰富。

LLaMA repo 实现这两个的代码加起来 50 行：
[`llama/model.py:34-77`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L34-L77)（RMSNorm）+
[`llama/model.py:307-348`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L307-L348)（FeedForward）：

```python
class RMSNorm(torch.nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        # 只有一个可学习参数：gain（per-dim scale），没有 bias
        self.weight = nn.Parameter(torch.ones(dim))

    def _norm(self, x):
        # RMS = sqrt(mean(x^2)) 沿最后一维
        # rsqrt 是 reciprocal-sqrt（1/sqrt），单条 GPU 指令，比 sqrt + div 快
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)

    def forward(self, x):
        # 关键：先把 x 提到 float32 算 norm（防 fp16 mean 溢出），再 cast 回原 dtype
        # 然后才乘 self.weight（bf16/fp16 都行）
        output = self._norm(x.float()).type_as(x)
        return output * self.weight


class FeedForward(nn.Module):
    def __init__(self, dim, hidden_dim, multiple_of, ffn_dim_multiplier):
        super().__init__()
        # SwiGLU 隐藏维度补偿：本来 hidden_dim = 4*dim（标准 transformer），
        # 因为 SwiGLU 用 3 个矩阵，要保持参数量持平就乘 2/3
        hidden_dim = int(2 * hidden_dim / 3)
        if ffn_dim_multiplier is not None:
            hidden_dim = int(ffn_dim_multiplier * hidden_dim)
        # 向上对齐到 multiple_of（默认 256），让 GPU tile 切分整齐
        hidden_dim = multiple_of * ((hidden_dim + multiple_of - 1) // multiple_of)

        # 三个矩阵：w1 = gate_proj, w3 = up_proj, w2 = down_proj
        self.w1 = ColumnParallelLinear(dim, hidden_dim, bias=False, ...)
        self.w2 = RowParallelLinear(hidden_dim, dim, bias=False, ...)
        self.w3 = ColumnParallelLinear(dim, hidden_dim, bias=False, ...)

    def forward(self, x):
        # SwiGLU 的本体：silu(w1*x) 是 gate，w3*x 是 up，逐元素相乘后再 down 投影
        return self.w2(F.silu(self.w1(x)) * self.w3(x))
```

**旁注**：

- RMSNorm 的 `eps = 1e-6`（构造函数默认）但 LLaMA 实际用 `1e-5`（见 ModelArgs 第 28 行 `norm_eps: float = 1e-5`）——**HuggingFace 实现也用 1e-5**。这种"默认 vs 实际"的不一致在 OSS 复刻时容易导致 loss 不可重现。
- `x.float()` 那一步是隐藏的精度护城河：**bf16 训练时 x.pow(2).mean() 在 dim=4096 上会下溢**（`(1e-2)^2 / 4096 ≈ 2.4e-8` 接近 bf16 极限）。先升 fp32 再除是必须的。Llama 2/3 全用了这条 trick。
- SwiGLU 的 `silu(x) = x * sigmoid(x)` 是平滑版的 ReLU，导数处处存在；**Shazeer 2020 测了 ReLU/GELU/SwiGLU/GeGLU 八种组合，SwiGLU 在 T5 任务上一致最好**。LLaMA 选 SwiGLU 而不是 GeGLU 没有给消融——可能就是"第一个看到的还行就用"。
- `w1` (gate) 和 `w3` (up) 在 ColumnParallelLinear 上**分别切**——这意味着 tensor parallel 时每张 GPU 同时持有部分 gate 和部分 up，乘法在 GPU 内本地完成，不需要 all-reduce。**w2 (down) 则需要 row parallel + all-reduce**。这是 LLaMA 训练能 scale 到 2048 GPU 的工程基础。
- `multiple_of=256` 是为了 NVIDIA tensor core 对齐（A100 支持 16/32/64/128 alignment，256 是更保守的选择，覆盖 H100 的 256-byte alignment）。**HuggingFace 的 LlamaConfig 把这个值硬编码成 `intermediate_size`，丢了 `multiple_of` 这层抽象**——这是 LLaMA 1 → HF 移植时的语义损失。

**怀疑 2**：RMSNorm 的"无需 mean centering"在 ASR / NMT 上验证过，但**LLaMA 论文 Section 2.2 只引了 Zhang & Sennrich 2019 一句话，没在 LLaMA 自己的 7B/13B/65B 三档上做 RMSNorm vs LayerNorm 的 ablation**。如果 RMSNorm 在 100B+ 规模上偷偷损失了 0.5% 质量，LLaMA 论文测不出来——因为它和别的 swap 一起改了，单变量 ablation 缺失。后续 OLMo（AI2 2024）做了这个 ablation，确认 RMSNorm ≈ LayerNorm，但**晚了一年**。

### 3.3 GQA：grouped query attention（LLaMA 2 引入）

GQA 是 LLaMA 2（2023-07）相对 LLaMA 1 的最重要架构变化——它**不是**为了训练质量，而是为了**推理 KV cache 节省**。
直觉：

- 标准 **MHA**（multi-head attention）：n_heads 个 query head，每个有自己的 key head 和 value head。
  推理时每 token 都要在 KV cache 里存 n_heads 份 K 和 V。**70B 模型 64 头、4K context 时 KV cache ~80GB**，单 H100 都装不下。
- 极端的 **MQA**（multi-query attention，Shazeer 2019 / PaLM）：所有 query head 共享 1 个 key head + 1 个 value head。
  KV cache 砍到 1/n_heads（大约 1/64）。但**质量明显损失**（PaLM 测过）。
- **GQA**（Ainslie 2023）：折中——n_heads 个 query head 分成 n_kv_heads 组，每组共享 1 个 KV head。
  LLaMA 2 70B 用 `n_heads=64, n_kv_heads=8`（即每 8 个 q 共享 1 个 kv）。
  **KV cache 砍到 1/8，质量几乎无损**——这是工业部署的"质量-速度甜点"。

LLaMA repo 的 GQA 实现散在 `Attention.__init__` + `repeat_kv` + `Attention.forward` 三处
（[`llama/model.py:164-304`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L164-L304)）：

```python
def repeat_kv(x: torch.Tensor, n_rep: int) -> torch.Tensor:
    """torch.repeat_interleave(x, dim=2, repeats=n_rep)"""
    bs, slen, n_kv_heads, head_dim = x.shape
    if n_rep == 1:
        return x  # 退化为 MHA，无需展开
    return (
        x[:, :, :, None, :]
         .expand(bs, slen, n_kv_heads, n_rep, head_dim)
         .reshape(bs, slen, n_kv_heads * n_rep, head_dim)
    )


class Attention(nn.Module):
    def __init__(self, args: ModelArgs):
        super().__init__()
        # GQA 的关键三行：
        self.n_kv_heads = args.n_heads if args.n_kv_heads is None else args.n_kv_heads
        # 多卡并行下，每张卡分到的 head 数量
        model_parallel_size = fs_init.get_model_parallel_world_size()
        self.n_local_heads = args.n_heads // model_parallel_size
        self.n_local_kv_heads = self.n_kv_heads // model_parallel_size
        # n_rep = 每组里有几个 query head 共享 1 个 KV head
        # LLaMA 2 70B: n_heads=64, n_kv_heads=8 -> n_rep=8
        # LLaMA 1 7B:  n_heads=32, n_kv_heads=32 -> n_rep=1（等价 MHA）
        self.n_rep = self.n_local_heads // self.n_local_kv_heads
        self.head_dim = args.dim // args.n_heads

        # Q 的输出宽度 = n_heads * head_dim（保持完整 query 数量）
        self.wq = ColumnParallelLinear(args.dim, args.n_heads * self.head_dim, ...)
        # 但 K, V 的输出宽度 = n_kv_heads * head_dim（缩小！）
        self.wk = ColumnParallelLinear(args.dim, self.n_kv_heads * self.head_dim, ...)
        self.wv = ColumnParallelLinear(args.dim, self.n_kv_heads * self.head_dim, ...)
        self.wo = RowParallelLinear(args.n_heads * self.head_dim, args.dim, ...)

        # KV cache 的形状用 n_local_kv_heads（不是 n_local_heads）-> 内存省 8 倍
        self.cache_k = torch.zeros((args.max_batch_size, args.max_seq_len,
                                    self.n_local_kv_heads, self.head_dim)).cuda()
        self.cache_v = torch.zeros_like(self.cache_k)

    def forward(self, x, start_pos, freqs_cis, mask):
        bsz, seqlen, _ = x.shape
        xq, xk, xv = self.wq(x), self.wk(x), self.wv(x)
        xq = xq.view(bsz, seqlen, self.n_local_heads, self.head_dim)
        xk = xk.view(bsz, seqlen, self.n_local_kv_heads, self.head_dim)  # 注意是 kv
        xv = xv.view(bsz, seqlen, self.n_local_kv_heads, self.head_dim)
        xq, xk = apply_rotary_emb(xq, xk, freqs_cis=freqs_cis)
        # 写 KV cache（小尺寸）
        self.cache_k[:bsz, start_pos : start_pos + seqlen] = xk
        self.cache_v[:bsz, start_pos : start_pos + seqlen] = xv
        keys = self.cache_k[:bsz, : start_pos + seqlen]
        values = self.cache_v[:bsz, : start_pos + seqlen]
        # GQA 核心：把 K, V 沿 head 维 expand 8 倍以匹配 Q 的头数
        # expand 是 zero-copy，不实际占用内存——只在 matmul 时按 stride 读
        keys = repeat_kv(keys, self.n_rep)
        values = repeat_kv(values, self.n_rep)
        # 之后就是标准 attention：scores = QK^T / sqrt(d)，softmax，乘 V
        ...
```

**旁注**：

- `repeat_kv` 是 GQA 整个机制最容易被误解的地方——它**用 expand + reshape 而不是 repeat_interleave**。`expand` 是 zero-copy（只改 stride，不复制 buffer），所以**显存里 K/V 还是 1/8 大小**，只在 matmul 时按 stride 重复读。**用 repeat_interleave 会真的复制成 8 倍**——OSS 第三方复刻里这是常见 bug，导致显存爆炸。
- `n_kv_heads` 必须能整除 `n_heads` 且必须能整除 `model_parallel_size`——这是为什么 LLaMA 2 70B 选 `n_kv_heads=8` 而不是 6 或 10：8 = 2^3 在多卡 TP 下最灵活（1/2/4/8 卡都能整除）。
- LLaMA 1 的 7B/13B/33B/65B 全是 MHA（`n_kv_heads = None` 即 = `n_heads`），LLaMA 2 的 7B/13B 也是 MHA，**只有 LLaMA 2 34B/70B 用 GQA**。原因是小模型 KV cache 本来就不大（7B 4K context KV ≈ 2GB），GQA 收益不显著。
- KV cache 在 [`llama/model.py:236-251`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py#L236-L251) 用 `torch.zeros(...).cuda()` 在 `__init__` 里就分配——**这是预分配 max_seq_len 的 KV，不是动态扩张**。生产推理引擎（vLLM、TGI）都改成了 PagedAttention（动态分页）。LLaMA 原 repo 的预分配实现教学价值高但部署不实用。
- `freqs_cis` 在 forward 入口处切片 `freqs_cis = self.freqs_cis[start_pos : start_pos + seqlen]`——**KV cache 的 K 在写入时已经施加过 RoPE**，下次 attention 直接用。**这就是为什么 RoPE 必须在 cache 写入之前 apply**——错位会导致同一个 token 的 K 在不同步骤被旋转两次。

**怀疑 3**：LLaMA 2 论文 Table 18 给出 GQA 的质量评估，但**只在 70B 一档对比 MHA / GQA / MQA**，其它尺寸没测。GQA 的质量损失是否随模型尺寸或 context 长度变化？LLaMA 2 没回答。后来 Mistral 7B（GQA） vs Llama 2 7B（MHA）的对比里 Mistral 整体更好，但**架构 swap 多到归因不清**——SWA、tokenizer、训练数据全不同。GQA 的 ablation 直到 2024 OLMo / Pythia 才补全。

## 复现一处（Layer 4 · phd-skills 7 阶段）

### 阶段 1 · 论文获取

```bash
# arXiv 主版本
curl -L https://arxiv.org/pdf/2302.13971 -o llama.pdf
# v1 即 final，没改过
# 配套 LLaMA 2 论文（GQA 来源）：
curl -L https://arxiv.org/pdf/2307.09288 -o llama2.pdf
```

### 阶段 2 · 代码盘点 inventory

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| [`meta-llama/llama/llama/model.py`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py) | Transformer 完整架构 | 齐全（495 行，含 RMSNorm/RoPE/GQA/SwiGLU/Block/Transformer） |
| [`meta-llama/llama/llama/generation.py`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/generation.py) | 推理循环（top-p sampling） | 齐全 |
| [`meta-llama/llama/llama/tokenizer.py`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/tokenizer.py) | SentencePiece BPE 32k | 齐全 |
| 训练代码 | pretrain loop / data loader / optimizer 调度 | **缺失**——Meta 从未公开训练 stack |
| 数据混合脚本 | 1.4T tokens 的 7 路混合 | **缺失**——Table 1 给比例但没给打包 code |
| Megatron 配置 | 2048 GPU 的 TP/PP 切分 | **缺失** |
| HF 移植 | [`huggingface/transformers/.../modeling_llama.py`](https://github.com/huggingface/transformers/blob/08f13097eb5c057b2bd373ca8241019614f564ac/src/transformers/models/llama/modeling_llama.py) | 齐全（生产首选） |

### 阶段 3 · Gap 分析（论文版 vs 代码 / 推测）

| 维度 | 论文（2302.13971） | meta-llama/llama repo | HuggingFace transformers | 差距来源 |
|---|---|---|---|---|
| RoPE 实现 | 复数描述 | 复数 (`view_as_complex`) | 双 buffer cos/sin | TPU/Metal 不支持复数 |
| KV cache | 未明确 | 预分配 max_seq_len | 动态 + 可换 PagedAttention | 部署需求差异 |
| `theta` (RoPE base) | 10000（沿用 sinusoidal） | 10000 hardcode | 可配置 + 支持 NTK-scaling | 长 context 演化 |
| `multiple_of` (FFN) | 文中没提 | 256 hardcode | 通过 `intermediate_size` 间接 | 论文叙事简化 |
| Tensor Parallel | xformers + Megatron | fairscale (Column/Row Parallel) | 不带 TP（HF 用 accelerate/Deepspeed） | 训练 vs 推理 |
| Attention impl | xformers + FlashAttention v1 | 朴素 matmul（教学风） | SDPA / FlashAttention v2/v3 | 性能演化 |

### 阶段 4 · 实现 / 替换说明

我跑不动 7B 的 fp16 forward（要 14GB 显存），也跑不动训练（要 ≥ 1 张 80GB A100）。
**降级路径**：用 HuggingFace transformers + `meta-llama/Llama-2-7b-hf`（公开权重）跑**单条 inference**，
重点验证 RoPE 的 frequency tensor 和 attention 的 KV cache 形状。

替换矩阵：

| 论文工具 | 我的替代 | 损失什么 |
|---|---|---|
| 2048 A100 训练 | 1 张 RTX 3060 12GB 推理 | 训练全跳过，只看 forward 数学 |
| LLaMA 1 65B | LLaMA 2 7B（HF 公开权重） | 65B 的涌现行为看不到 |
| Megatron + xformers | HF transformers + SDPA | TP/FlashAttn 性能差距 |
| 1.4T tokens 训练 | 跳过——只测推理一致性 | 数据 pipeline 不验证 |

### 阶段 5 · 数据集

5 个 toy 测试输入（验证 RoPE / KV cache / GQA 三件事）：

```python
toy_inputs = [
    # 1. 短 prompt 测 RoPE freq[0:5] 是否单位长度
    "The capital of France is",
    # 2. 长 prompt（512 tok）测 KV cache stride
    "Once upon a time " * 64,
    # 3. 中文 prompt 测 SentencePiece 分词
    "今天天气不错，我想出去散步。",
    # 4. 代码 prompt 测对 GitHub 数据混合的吸收
    "def fibonacci(n):\n    if n < 2:\n        return n\n",
    # 5. 数学 prompt 测 ArXiv 数据混合
    "The integral of x^2 from 0 to 1 is",
]
```

### 阶段 6 · Smoke run（完整 trajectory）

输入：`"The capital of France is"`
（用 `transformers.AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")` 跑）

```text
[阶段 6.1] tokenize
  ids = [1, 450, 7483, 310, 3444, 338]  # <s> The capital of France is
  shape: (1, 6)

[阶段 6.2] embed
  h = tok_embeddings(ids)  # (1, 6, 4096)
  h.dtype = torch.float16
  h.norm() ≈ 24.3

[阶段 6.3] freqs_cis 切片
  full_freqs_cis.shape = (4096, 64)  complex64  # max_seq_len*2 = 4096, head_dim/2 = 64
  freqs_cis = full_freqs_cis[0:6]  # (6, 64)
  abs(freqs_cis).mean() == 1.0  # 单位长度，验证 polar 输出

[阶段 6.4] 第 0 层 forward
  h_in = h
  h = RMSNorm(h_in)            # (1, 6, 4096)，norm 后 .std() ≈ 0.99
  q = wq(h).view(1, 6, 32, 128)  # 7B 是 MHA, n_heads=32, head_dim=128
  k = wk(h).view(1, 6, 32, 128)
  v = wv(h).view(1, 6, 32, 128)
  q, k = apply_rotary_emb(q, k, freqs_cis)  # 仍 (1, 6, 32, 128)
  # KV cache 写入位置 [0:6]
  scores = matmul(q.transpose(1,2), k.transpose(1,2).transpose(2,3)) / sqrt(128)
  # scores shape (1, 32, 6, 6)
  # 因果 mask 让 token i 只能看 token 0..i
  attn_out = matmul(softmax(scores), v.transpose(1,2))  # (1, 32, 6, 128)
  attn_out = attn_out.transpose(1,2).reshape(1, 6, 4096)
  h = h_in + wo(attn_out)      # 残差

  h_pre = h
  h = RMSNorm(h)
  h = w2(silu(w1(h)) * w3(h))  # FFN, hidden_dim=11008 = 256 * ceil(2*4*4096/3 / 256)
  h = h_pre + h                # 残差

[阶段 6.5] 跑 32 层后的 final RMSNorm + LM head
  logits = lm_head(RMSNorm(h))  # (1, 6, 32000) — vocab_size=32000
  next_token = argmax(logits[0, -1])  # = 3681 ("Paris")
  greedy decode 5 token: " Paris . The country has"
```

### 阶段 7 · 跑结果对照表

| 测试项 | 期望（论文/repo） | 实测（HF 7B）| 差距说明 |
|---|---|---|---|
| `tokenize("The capital of France is")` | `[1, 450, 7483, 310, 3444, 338]` | 同 | OK |
| `freqs_cis.shape` | `(4096, 64)` | 同 | OK |
| `abs(freqs_cis).mean()` | `1.0`（单位复数） | `1.0000001`（fp32 误差） | OK |
| `n_heads / n_kv_heads` (7B) | `32 / 32` (MHA) | 同 | OK |
| greedy 5 token 续写 | `" Paris . The country..."`（论文未给具体例子） | `" Paris . The country has"` | 论文没贴 toy 例子，无法直接对照 |
| LLaMA 1 13B vs GPT-3 175B 在 BoolQ | LLaMA 13B 78.1 vs GPT-3 60.5（Table 3） | **未跑**（要 GPU 集群） | 降级跳过 |
| KV cache 形状（70B GQA）| `(bs, seqlen, 8, 128)`（n_kv_heads=8） | 同（HF 用 `LlamaConfig.num_key_value_heads=8` ）| OK |

**显式给出的差距 vs 论文数字**：
论文核心数字（LLaMA-13B 在 5-shot MMLU 46.9% vs GPT-3-175B 43.9%）
**没法在我的硬件上重现**——MMLU 跑全 14k 题需要 ~1 小时单卡 7B 推理，
而且我没拿到 13B 权重。**降级到验证 RoPE/KV cache 的形状一致性 + 单 token 续写**——
所以这个 Layer 4 是"机制级复现"而非"benchmark 级复现"。
results.md 应注明：N=1 trajectory，单设备 fp16 推理，未跑 Table 3 的任何 benchmark 数字。

## 谱系对比（Layer 5）

![LLaMA 谱系演化树](/study/papers/llama/02-lineage-tree.webp)

*图 2：LLaMA 家族在开源 LLM 谱系中的位置——
**祖先**（蓝色）：GPT-3 (decoder-only) / [Chinchilla](/study/papers/chinchilla/) (D=20N) / PaLM (RoPE+SwiGLU) / GPT-NeoX (open-weight 先例)。
**LLaMA 1 → LLaMA 2 → LLaMA 3** 是中央血脉（红色）。
**Mistral 7B**（橙色）由 LLaMA 1 核心作者 Touvron / Lample / Lacroix 离职后开公司复刻——架构几乎一致，但 Apache 2.0 许可、GQA 全档启用、加 SWA。
**Qwen 2 / DeepSeek-V2 / Phi-3**（2024 各色）都是 LLaMA 架构 + 各自数据/优化的变体。
**右侧 rebels 通道**（红框）：MoE 派、Mamba SSM 派、RWKV、Hyena ——它们都赌"dense transformer 不是长期答案"，但截至 2026-05-29 LLaMA 系仍占开源市场 60%+。
箭头标注从父辈继承的具体设计点（decoder-only / D=20N empirical / RoPE+SwiGLU / open-weight 先例）。
手绘 sketchnote 风。*

### 前作

- **[GPT-3](https://arxiv.org/abs/2005.14165)（OpenAI 2020，175B）**：decoder-only LLM 的工业起点。
  LLaMA 继承的 = 自回归 + decoder-only + 大规模 pretrain；丢弃的 = LayerNorm + ReLU + absolute pos emb + closed weights。
- **[Chinchilla](/study/papers/chinchilla/)（DeepMind 2022，70B）**：D ≈ 20×N 的经验法则。
  LLaMA 直接引用 + **故意 over-train 7×**（D=140N）来换推理便宜。
- **[PaLM](https://arxiv.org/abs/2204.02311)（Google 2022，540B）**：第一次把 SwiGLU + RoPE 组合放进百亿级模型。
  LLaMA 全搬过来 + 用 RMSNorm 替 PaLM 的 LayerNorm + **公开权重**。
- **[Scaling Laws (Kaplan)](/study/papers/scaling-laws/)（OpenAI 2020）**：提出 power law 但比例算错了（被 Chinchilla 推翻）。LLaMA 没引这条路线。
- **[GPT-NeoX 20B](https://arxiv.org/abs/2204.06745)（EleutherAI 2022）**：开源 20B baseline。
  LLaMA 继承的 = 开源精神 + RoPE 用法；丢弃的 = ReLU MLP + 没有架构 swap 集成。

### 后作（2024-2026 视角）

- **LLaMA 2**（Meta 2023-07，70B）：本笔记一并讨论。**核心新增 = GQA + 商用许可 + 2T tokens + RLHF 对齐版（Llama-2-Chat）**。
- **LLaMA 3**（Meta 2024-04 / 7-04，8B/70B/405B）：**15T tokens** 训练（D ≈ 1875×N）+ 128K 词表 + 长 context（8K → 128K via NTK + position interpolation）。
- **Mistral 7B**（2023-09）：LLaMA 1 7B 几乎逐字复刻，但加 **SWA**（sliding window attn）+ GQA + **完全 Apache 2.0**。Mistral team 4/5 来自 LLaMA 1 作者列表。
- **Qwen 2**（Alibaba 2024-06，0.5B-72B）：LLaMA 风 + 多语言（中/英/...）+ **SwiGLU 用了 Llama 一样的 2/3 hidden 配方**。
- **DeepSeek-V2 / V3**（2024-05 / 2024-12）：LLaMA 架构 + **DeepSeekMoE**（混合专家）+ **MLA**（multi-head latent attention，比 GQA 进一步压缩 KV cache）。MLA 是 GQA 后的下一步。
- **Phi-3**（MS 2024-04，3.8B）：**用合成数据训小模型**——挑战 LLaMA "大数据混合是必要的"前提。架构仍是 LLaMA-like。
- **OLMo**（AI2 2024-02，7B）：**完全开源**（数据 + 训练代码 + checkpoints 都公开），LLaMA 架构外加 RMSNorm vs LayerNorm 真正消融——填了 LLaMA 跳过的 ablation 缺口。
- **TinyLlama**（2024，1.1B 训 3T tokens）：极致 over-train（D ≈ 2700×N），LLaMA 架构最小化部署版。

### 反对者（同期 critique / 走另一条路的）

- **Mixture-of-Experts 派**（Mixtral 8×7B 2023-12 / DeepSeek-MoE 2024-01）：
  赌"稠密 transformer scaling 太贵，应该 sparse 路由"。**Mixtral 47B 总参数但每 token 只激活 13B**，
  推理便宜接近 13B 但质量接近 70B。**对 LLaMA 全稠密的直接挑战**。
- **State Space Model 派**（Mamba 2023-12，Gu & Dao）：
  赌"二次复杂度的 attention 不是长 context 的最终答案"。**Mamba 用 selective SSM 做 O(N) inference**，
  在 32K+ context 上比 LLaMA 类快很多。**架构哲学完全不同**——但截至 2026-05-29 没真正打败 LLaMA on MMLU。
- **RWKV / Hyena / RetNet**：与 Mamba 同阵营的"非 attention" 路线，但在 LLM benchmark 上仍落后 LLaMA。
- **小模型派**（Phi-3 / Gemma / Qwen-2 0.5B）：赌"**数据质量 > 模型大小**"，反 LLaMA "更多公开数据"叙事。

### 选型建议

| 场景 | 选谁 | 为什么 |
|---|---|---|
| 学开源 LLM 架构（教学 / 笔记） | LLaMA 1 + 本笔记的 model.py 路径 | 历史地位 + 代码最简洁（495 行） |
| 商业 fine-tune 起点 | LLaMA 3 / Llama 3.1 70B | 商用许可 + 15T tokens 质量最强 |
| 完全开源（含数据 + 训练 code） | OLMo 7B / TinyLlama | 比 LLaMA 更彻底的 open |
| 长 context（32K+） | Mistral / Llama 3.1 + NTK-scaled RoPE，或 Mamba | LLaMA 1 的 2K 早就不够了 |
| 极致部署便宜 | Mixtral 8×7B（MoE）/ DeepSeek-V2（MLA）/ Phi-3 3.8B | LLaMA 70B 单卡塞不下 |
| 中文 / 多语言 | Qwen 2 / DeepSeek-V2 | LLaMA 3 中文 ok 但 Qwen 更强 |
| 不愿用 GQA / 想用纯 MHA 验证科学问题 | LLaMA 1 7B/13B / OLMo 7B | LLaMA 2 起 70B 全 GQA |

## 与你当前工作的连接（Layer 6 · 通用化）

### 今天就能用的部分（**选模型 / 跑推理时能立刻应用**）

- **看到 7B 训了 1T+ tokens（D=140N）= LLaMA 派血统**——意味着架构基本是 RMSNorm + SwiGLU + RoPE，HuggingFace 的 `LlamaForCausalLM` 大概率能直接 load。
- **在选 LLM 做 fine-tune 之前**，先看模型 config 里 `num_key_value_heads` vs `num_attention_heads`：相等 = MHA（KV cache 大），小一倍以上 = GQA（推理便宜）。**生产部署优先选 GQA 的**。
- **遇到长 context 失败时**，先检查 `rope_theta` 字段——LLaMA 1 是 10000，Llama 3 / Mistral 是 500000+。**theta 太小会让外推到 32K 时位置混乱**。
- **HuggingFace transformers 库的 `modeling_llama.py` 是 OSS LLM 的"标准实现"**——读它一遍胜过读所有论文，因为它把所有 paper 描述翻成可运行代码（[commit `08f13097eb5c057b2bd373ca8241019614f564ac`](https://github.com/huggingface/transformers/tree/08f13097eb5c057b2bd373ca8241019614f564ac)）。

### 下个月能用的部分（**需要一些重构准备**）

- **如果要从一个非 LLaMA 风格的旧模型（GPT-2 风、ChatGLM-1 风）迁到 LLaMA 风，至少 4 个零件要改**：LayerNorm → RMSNorm；ReLU/GELU MLP → SwiGLU FFN；absolute / sinusoidal pos emb → RoPE；MHA → GQA。**逐个换比一次全换更可控**——OLMo 团队 2024 教训证明顺序错了 loss 会爆。
- **量化部署链路**（GPTQ / AWQ / GGUF）—— 主流量化工具都把 LLaMA 架构当一等公民。如果你的模型不是 LLaMA 风，量化生态支持要差 3-6 个月。
- **数据 pipeline 复刻**——Table 1 的 7 路混合（CC + C4 + Github + Wiki + Books + ArXiv + StackExchange）可以用 RedPajama / SlimPajama 现成数据集复刻，不用从零爬。
- **推理引擎选型**——vLLM / TGI / SGLang / llama.cpp 全部第一支持 LLaMA 系；其它架构（Mamba / Mixtral）支持时间相对滞后。

### 不要用的部分（**这条路线不适合的场景**）

- **LLaMA 1 的 2K context** 在 2026 已严重不够——选模型一定看 2024+ 的 Llama 3 / Mistral / Qwen-2，至少 8K 起步。
- **non-commercial LLaMA 1 license** 现在只有教学 / 学术用途价值，**任何商业产品都用 LLaMA 2 起的商用许可版本**（或 Apache 2.0 的 Mistral / Qwen 系）。
- **如果场景对推理 token cost 极度敏感**（边缘设备 / 移动端），LLaMA 70B 不如 **Phi-3 3.8B**（合成数据训小模型）或 **Mixtral 8×7B**（MoE 稀疏激活）。LLaMA 派系强但不是所有尺寸都强。
- **如果要做超长 context（100K+）研究**，不要硬上 LLaMA + NTK scaling——**应该认真评估 Mamba / RWKV / 长卷积** 等非 attention 路线。LLaMA 的 quadratic attention 在 100K+ 上经济性极差。
- **如果你只想快速验证一个 idea 而非部署**，LLaMA 7B 仍然过大（14GB fp16）——**TinyLlama 1.1B / Pythia 410M / Qwen-2 0.5B** 更适合 toy 实验。

## 怀疑 + 延伸阅读（Layer 7）

### 4 件具体怀疑

**怀疑 1**：**Section 2.1 的数据混合表（Table 1）只给了**"采样比例"**而没给"epoch 数"**——CommonCrawl 67% 看 1 个 epoch 还是看 5 次重复？不同子集 epoch 不同会导致**训练 token 计数（1T / 1.4T）有歧义**。论文 Section 2.1 末尾隐晦说"only used a few epochs for the largest datasets"，但具体数字藏在脚注。**Pythia / OLMo 论文的表头写得清楚多了**——LLaMA 这条数据透明度 2026 视角偏低。

**怀疑 2**：**Table 3 的 main result 选了"对自己最有利的 baseline 集"**——LLaMA-13B 在 ARC-Easy / OBQA / CSQA 上确实超过 GPT-3-175B，但 GPT-3 是 2020 年训的，**OpenAI 内部 davinci-002（2022）已经是 InstructGPT-tuned 而不是 base**，比较的应该是 base GPT-3 175B（也确实是这样选的）但**省略了 PaLM-62B / Chinchilla-70B / U-PaLM 等 2022 级别 baseline**。Section 3 给了 Chinchilla 对比，但 PaLM-62B 这档刚好被跳过——**很难说不是 cherry-pick**。

**怀疑 3**：**Section 4 (Instruction Finetuning) 只有 1 段，给了 LLaMA-I 一个数字（MMLU 68.9）然后停了**。整个 instruction tuning 几乎没讨论——但开源生态后来 LLaMA 衍生品 80% 都是 instruction-tuned 版本。**LLaMA paper 把 instruction tuning 作为附属 contribution 是审稿一定会被 push back 的弱点**——Meta 没投会就避开了这个 review。后来 Llama-2-Chat 论文（2023-07）才把这块补全。

**怀疑 4**：**Section 6 (Related Work) 把对手分得过简**——只分了 closed (GPT-3/PaLM) vs open (GPT-J/OPT)，**完全没提中国系的 GLM / ChatGLM / Yuan 1.0 / PanGu-α**——这些 100B+ 模型 2022 年都在 LLaMA 之前。**这种地缘 narrative 取舍**让 LLaMA 显得"开源 LLM 的第一个"，但客观上不是。这是 Meta 营销叙事的微调。

### 接下来读哪 N 篇

| # | 论文 | 为什么读 | 顺序 |
|---|---|---|---|
| 1 | [Llama 2: Open Foundation and Fine-Tuned Chat Models](https://arxiv.org/abs/2307.09288) (Touvron 2023-07) | 直接续作。GQA + 商用许可 + Llama-2-Chat | 1 |
| 2 | [Mistral 7B](https://arxiv.org/abs/2310.06825) (Jiang 2023-10) | LLaMA 1 7B 离职团队复刻 + SWA + Apache 2.0 | 2 |
| 3 | [The Llama 3 Herd of Models](https://arxiv.org/abs/2407.21783) (Dubey 2024-07) | 15T tokens / 405B 顶配 / 长 context 工程细节 | 3 |
| 4 | [RoFormer: Enhanced Transformer with Rotary Position Embedding](https://arxiv.org/abs/2104.09864) (Su 2021) | RoPE 的论文原版 + 数学推导 | 4（细节补全） |
| 5 | [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202) (Shazeer 2020) | SwiGLU 的论文原版 + 8 种变体消融 | 4（细节补全） |
| 6 | [Root Mean Square Layer Normalization](https://arxiv.org/abs/1910.07467) (Zhang & Sennrich 2019) | RMSNorm 论文原版 | 4（细节补全） |
| 7 | [Mamba: Linear-Time Sequence Modeling](https://arxiv.org/abs/2312.00752) (Gu & Dao 2023) | LLaMA 系的最强反对者 | 5（视角对照） |
| 8 | [GQA: Training Generalized Multi-Query Transformer Models from MQA](https://arxiv.org/abs/2305.13245) (Ainslie 2023) | GQA 论文原版 | 4（细节补全） |
| 9 | [OLMo: Accelerating the Science of Language Models](https://arxiv.org/abs/2402.00838) (Groeneveld 2024) | 真正完全开源的 LLM + 补 LLaMA 缺的 ablation | 6 |

## 限制（DeepPaperNote 风格）

不抄 paper 的 limitations 章节，写四条独立观察：

1. **训练代码从未公开**：Meta 只放了 inference repo（[`meta-llama/llama`](https://github.com/meta-llama/llama)），**训练 stack（数据 pipeline、分布式 schedule、checkpoint format、loss 曲线 logger）全部不公开**。这意味着**LLaMA 的训练成本与稳定性细节只能靠社区（OLMo / Pythia）反推**。Meta 论文 Section 2.4 给了"xformers + FlashAttn + activation checkpoint"三个名词，但具体配置（哪些层 ckpt、TP/PP 怎么切、ZeRO 哪一级）全省略——读者无法独立复现训练。
2. **缺零件级 ablation**：RMSNorm vs LayerNorm 没消融；SwiGLU vs GeGLU vs ReLU 没消融；RoPE vs ALiBi 没消融。**所有架构 swap 是一起开关的**——后世（OLMo 2024 / Pythia 2023）才补做单变量对照，证明 swap 各自贡献小但加起来质量稳定。**LLaMA 论文是工业 tech report 不是科学研究**，但读者要警惕"三个一起换 = 各自都好"的结论跳跃。
3. **Tokenizer 细节藏太深**：用 SentencePiece BPE 32k 词表，但**词表是怎么训出来的没说**——用了哪些数据子集？是否 byte-fallback？数字是否拆位？这些决定了 LLaMA 在数学 / 代码 / 中文上的下限。**Llama 3 把词表扩到 128k 是直接对前作的回应**——隐含承认 32k 不够。
4. **"开放"程度有限**：LLaMA 1 是 non-commercial license + 申请制，**权重 2023-03 第三周泄露**才让 Alpaca / Vicuna 生态启动。**Meta 在论文里包装成"open and efficient"，但真正的 open 是 OLMo / TinyLlama / Pythia**（数据 + 训练代码 + 中间 checkpoint 全公开）。LLaMA 的"open" 更接近"权重可下载"而非科学意义上的 open。

## 附录 · 叙事错位清单

| 论文宣称 / 措辞 | 代码 / 现实 | 错位类型 |
|---|---|---|
| "We train... using publicly available datasets exclusively" (Abstract) | 训练数据混合 Table 1 全部公开 ✓ | 一致 |
| "We focus on training models that are as cheap as possible at inference time" (Section 1) | 7B 训 1T tokens, 65B 训 1.4T tokens — D=140N 远超 D=20N 的 Chinchilla optimal ✓ | 一致 |
| "An efficient implementation of the causal multi-head attention" (Section 2.4) | meta-llama/llama 的 model.py 用朴素 matmul，没 FlashAttention（教学风），实际训练用 xformers | repo ≠ training stack |
| "Our model is licensed under a non-commercial license" (Section 1) | 2023-03 权重泄露后实际上人人都能 fine-tune ; LLaMA 2 才转商用 | 名义 vs 现实 |
| "All our models are based on the transformer architecture" (Section 2.2) | 是 transformer，但 RMSNorm + RoPE + SwiGLU + 没 bias + 没 dropout — **跟 Vaswani 2017 transformer 已经差很远** | 措辞偏简 |
| "Compared to GPT-3, we use... no biases" (Section 2.2) | model.py 里所有 Linear 都 `bias=False` ✓（包括 wq/wk/wv/wo/w1/w2/w3）| 一致 |

## 结尾元数据

- **重构日期**：2026-05-29
- **总行数**：~600（含 frontmatter）
- **启用 skill / 工具**：`/source-learn`（精读 mode）+ `/codex` 二审复现部分 + WebFetch（确认 commit hash）+ `/render` 生成 sidecar HTML
- **下一篇**：Mistral 7B（直接续作，验证 LLaMA 1 离职团队复刻路径）或 Mamba（验证 LLaMA 系最强反对者）
- **核心 source 文件锚定**：[`meta-llama/llama/llama/model.py`](https://github.com/meta-llama/llama/blob/689c7f261b9c5514636ecc3c5fefefcbb3e6eed7/llama/model.py)（commit `689c7f261b9c5514636ecc3c5fefefcbb3e6eed7`，2025-01-26 最后更新，21k stars 截至 2026-05-29）
