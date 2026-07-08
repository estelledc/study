---
title: MemFT-LoRA — 用 LoRA 量出大模型能背多少精确内容
来源: 'Ziwen Xu et al., "How LoRA Remembers? A Parametric Memory Law for LLM Finetuning", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

日常类比：你有一个很厚的活页本，不想重抄整本，只想在某几页夹几张便签，让它以后能一字不差地背出新电话号码。LoRA 就像这些便签，MemFT-LoRA 这篇论文问的是：**便签有多大，才能稳定记住多少字？**

这篇论文研究的不是"模型大概懂不懂新知识"，而是更苛刻的**精确参数记忆**：给模型一个 key，它必须逐字输出对应 answer。

作者把 LoRA 当成一个可控的记忆探针：冻结原模型，只训练低秩 LoRA 参数，然后扫 LoRA rank 和答案长度，观察 loss、token accuracy、exact match 怎么变。

核心结论是三句话：LoRA 的 loss reduction 服从一个幂律；逐 token 概率超过 `0.5` 才能在 greedy decoding 下锁住记忆；MemFT 把训练预算集中给还没跨过阈值的 token，比普通 SFT 更会背。

## 为什么重要

不理解这篇，下面这些事都很难解释：

- 为什么 LoRA 微调看起来 loss 很低，真实生成却会在某个位置突然崩掉。
- 为什么"模型记住了知识"不能只靠 QA 分数判断，QA 里混着理解、检索、指令跟随。
- 为什么增加 LoRA rank 通常有用，但答案越长，所需参数会非线性上升。
- 为什么 RAG 能原文照抄，但参数记忆必须把文字压进权重，难度完全不同。

对工程来说，它给了一个很实用的视角：如果你要让模型永久记住短事实、格式串、规则输出，先别问"finetune 有效吗"，要问"每个关键 token 的概率有没有跨过 0.5"。

## 核心要点

1. **参数记忆是一种写入，不是查资料**。类比：RAG 是考试时翻书，LoRA 参数记忆是考前把内容背进脑子。论文把 answer 从输入里拿掉，只允许 LoRA 增量 `Δθ` 保存信息，所以更干净地测"权重能背多少"。

2. **记忆容量像一条幂律曲线**。类比：便签越多能记越多，但不是线性翻倍；内容越长，难度也不是线性增加。论文拟合出 `ΔL = C * r^α * ℓ^-β + b`，其中 `r` 是 LoRA rank，`ℓ` 是答案长度。

3. **平均 loss 会骗人，单个 token 才会决定崩不崩**。类比：背一串密码时前 99 个字符都对，最后 1 个错了，整串还是不能用。论文发现 `p > 0.5` 是 greedy decoding 下让目标 token 成为最大概率候选的充分条件。

这三个点连起来就是：宏观看 rank 和长度，微观看 token 阈值，训练时把力气给最难的 token。

## 实践案例

### 案例 1：把"精确记忆"写成最小任务

```python
query = "id: alice"
target = "alice@example.com"
model = freeze(base_llm)
lora = train_lora(model, query, target)
print(greedy_decode(model + lora, query))
```

**逐部分解释**：

- `query` 是钥匙，只负责唤起记忆。
- `target` 是要一字不差背出的内容，评估只看它的 token。
- `freeze(base_llm)` 表示原模型不动，只有 LoRA 能存新信息。
- `greedy_decode` 固定为每一步选最大概率 token，这样才能讨论确定性记忆。

### 案例 2：为什么 loss 低也可能背错

```python
probs = [0.99, 0.98, 0.49, 0.97]
ok = [p > 0.5 for p in probs]
print(ok)  # [True, True, False, True]
```

**逐部分解释**：

- 平均概率看起来很高，但第 3 个 token 只有 `0.49`。
- greedy decoding 只要第 3 个 token 被别的候选超过，后面的上下文就变了。
- 这就是论文说的 autoregressive cascade failure：一个局部瓶颈会带崩后续整段。

### 案例 3：MemFT 只盯还没跨线的 token

```python
import math

losses = [0.02, 0.13, 0.71, 0.05]
crit = math.log(2)
weights = [1 if loss > crit else 0 for loss in losses]
print(weights)  # [0, 0, 1, 0]
```

**逐部分解释**：

- `crit = ln(2) ≈ 0.693` 来自 `-log(0.5)`。
- loss 小于阈值的 token 已经进入 ordered phase，继续优化收益低。
- loss 大于阈值的 token 仍在不稳定区，MemFT 把梯度预算集中给它。

## 踩过的坑

1. **把 LoRA 当成万能知识库**：LoRA 能写入参数，但容量受 rank 和序列长度限制，长答案会明显更难。

2. **只看平均 loss**：平均 loss 会被容易 token 稀释，原因是一个 stubborn token 也足够让整段 greedy 生成失败。

3. **把 `p > 0.5` 理解成必要条件**：论文说它是 greedy decoding 的充分条件，因为超过一半概率时其他单个候选不可能更大；低于 0.5 不代表必错，只是风险大。

4. **忽略解码方式**：这个相变阈值针对 greedy decoding，原因是采样、top-p、temperature 会改变"最大概率 token 一定被选中"这个前提。

## 适用 vs 不适用场景

**适用**：

- 想测 LoRA / adapter 到底能存多少精确文本，而不是只看下游 QA。
- 需要模型固定输出短格式串、规则答案、代码片段、编号映射。
- 想比较 rank、答案长度、训练策略对记忆成功率的影响。
- 想诊断 fine-tune 失败是不是卡在少数 stubborn tokens。

**不适用**：

- 只需要语义相近回答的任务，例如开放式写作、摘要、聊天。
- 需要随时更新大量外部知识的系统，RAG 或外部记忆通常更便宜。
- 依赖随机采样风格的生成任务，因为本文阈值主要服务 greedy decoding。
- 想证明更大模型一定同样服从该 law，论文实验主要在 8B 级模型上。

## 历史小故事（可跳过）

- **2020 年**：RAG 把"查资料再回答"工程化，知识可以放在外部索引里。
- **2021 年**：LoRA 提出低秩增量微调，让大模型不用全量改权重也能适配任务。
- **2024 年**：随机记忆访问和长上下文研究开始追问：模型到底是在理解，还是在背。
- **2026 年 3 月**：Understanding LoRA as Knowledge Memory 把 LoRA 明确看成模块化知识记忆。
- **2026 年 5 月**：这篇进一步把问题量化成 law、阈值和训练策略：不只说 LoRA 会记，还问"记忆容量怎么随参数变"。

## 学到什么

- **记忆有宏观 law**：LoRA rank 越大，loss reduction 越大；答案越长，同样参数的收益越小。
- **记忆有微观门槛**：逐 token 概率跨过 `0.5`，才开始接近 deterministic recall。
- **训练预算要重新分配**：普通 SFT 平均照顾所有 token，MemFT 盯住还没过线的 token。
- **外部记忆和参数记忆是两条路线**：RAG 像查书，LoRA 像背书；二者的成本、风险和评估方式都不同。

## 延伸阅读

- 论文 PDF：[Xu et al. 2026 — How LoRA Remembers?](https://arxiv.org/abs/2605.30260)（本篇，重点看 Section 3-5）
- [[lora-2021]] —— LoRA 原始论文，解释为什么低秩增量可以高效微调大模型。
- [[understanding-lora-knowledge-memory]] —— 直接前作，把 LoRA 当作知识记忆模块评估。
- [[rag-lewis-2020]] —— 外部检索式记忆的代表，和本文的参数记忆形成对照。
- [[beyond-memorization-random-access]] —— 讨论语言模型能否随机访问已记住内容。
- [[memory3-2024]] —— 把显式 memory 放在参数和 RAG 之间的另一条路线。

## 关联

- [[attention]] —— 自回归生成每一步都依赖前文，单 token 错误才会级联扩散。
- [[rag-lewis-2020]] —— RAG 是开卷查资料，本文研究闭卷写入参数。
- [[self-rag-2023]] —— Self-RAG 让模型决定何时检索，本文让模型不用检索也能背。
- [[chinchilla]] —— 都用 scaling law 思维看参数、数据和性能之间的关系。
- [[llm-int8-2022]] —— 都说明平均指标背后可能藏着少数关键位置或通道。
- [[evo-memory-2511]] —— 都关心 LLM memory，只是一个偏 agent 评测，一个偏参数机制。
- [[transformer-xl-2019]] —— 长程依赖和记忆问题的早期重要路径。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
