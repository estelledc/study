---
title: RiM Latent Reasoning — 给 LLM 一块不用说出口的工作记忆
来源: 'Aichberger & Hochreiter, "Unlocking the Working Memory of Large Language Models for Latent Reasoning", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

Reasoning in Memory（**RiM**）是一种**让大语言模型把中间推理放进固定 memory tokens，而不是把思考步骤一个个写出来**的训练方法。日常类比：做数学草稿时，你不一定把每个念头念出声；你会在脑子里或草稿纸角落暂存几个数，再直接写答案。

传统 Chain-of-Thought（CoT）像"边想边说"：模型先生成一长串解释，再生成最终答案。RiM 改成"给模型几块固定的工作记忆格子"：这些格子本身是特殊 token，不是模型临时生成的文字，但它们的隐藏表示会随题目变化，承载中间计算。

它最想解决的问题是：推理需要更多计算，但不一定需要更多输出 token。固定 memory blocks 可以一次前向计算完，避免 CoT 和 Coconut 这类方法在推理时一步步自回归生成中间状态。

## 为什么重要

不理解 RiM，下面这些事都不好解释：

- 为什么"让模型思考更久"不一定等于"让模型吐出更长思维链"；计算可以藏在隐空间里。
- 为什么一些 latent reasoning 方法虽然不写自然语言，仍然慢；它们还在逐步生成连续状态。
- 为什么空白 token / pause token 直接塞进去常常没用；没有训练信号，模型会把它们当噪声。
- 为什么 RiM 的重点不是新增参数，而是**用两阶段监督教特殊 token 承担工作记忆角色**。

## 核心要点

1. **固定 memory blocks：把草稿纸先摆好**
   RiM 在问题后面追加若干块固定特殊 token，每块形如"开始符 + 几个 memory token + 结束符"。类比：考试前先给你 8 个草稿格，格子位置固定，但你写进去的内容随题目变化。

2. **两阶段课程：先学会存步骤，再学会答题**
   Stage 1 让每个 memory block 后的读出口预测下一步显式推理，逼模型把必要信息写进隐空间。Stage 2 取消逐步答案监督，改成每个 block 后都预测最终答案，让这些隐空间状态服务最终输出。

3. **自定义 attention mask：防止偷看答案**
   训练时所有读出口可以一次前向并行监督，但 mask 会阻止它们看见别的真实推理步骤。类比：老师可以同时批改每个草稿格，但学生不能先看标准解再装作会推。

把三点合起来看，RiM 的核心不是"更神秘的思考"，而是一个很工程化的安排：

- 输入端先留出固定隐空间。
- 训练端用密集监督逼它真的存信息。
- 推理端只读最终答案，不再输出整段草稿。

## 实践案例

### 案例 1：CoT 为什么慢

```python
question = "小明有 23 个苹果，用掉 20 个，又买 6 个，剩几个？"
trace = []
trace.append(model.generate(question))          # 先生成第一步
trace.append(model.generate(question, trace))   # 再生成第二步
answer = model.generate(question, trace)        # 最后生成答案
```

**逐部分解释**：

- `trace.append` 每次都依赖前一次输出，所以必须排队。
- 这些中间 token 既要表达计算，又要写成人能读懂的句子。
- 题越难，trace 越长，延迟和费用越高。

### 案例 2：RiM 把草稿换成固定输入

```python
question_tokens = tokenize(question)
memory_blocks = ["<b>", "<m>", "<m>", "</b>"] * 8
hidden = model.forward(question_tokens + memory_blocks)
answer = readout(hidden, after_block=8)
```

**逐部分解释**：

- `memory_blocks` 是固定 token，不是模型一步步生成出来的。
- `<m>` 的 token id 固定，但它经过 Transformer 后的 hidden state 会带上题目信息。
- `model.forward` 一次吃完整段输入，所以推理时更接近普通直接答题的延迟。

### 案例 3：两阶段训练在教什么

```python
for block_id, target_step in enumerate(reasoning_steps):
    loss += next_token_loss(readout(block_id), target_step)  # Stage 1

for block_id in range(num_blocks):
    loss += weight(block_id) * next_token_loss(readout(block_id), final_answer)  # Stage 2
```

**逐部分解释**：

- Stage 1 的 `target_step` 是显式推理步骤，用来给 memory block 贴上"要存中间信息"的职责。
- Stage 2 的 `final_answer` 让模型从"复述步骤"转向"逐块改进答案"。
- 后面的 block 权重更大，因为它能看到更多前面的 latent computation。

## 踩过的坑

1. **把 RiM 理解成 prompt trick**：错在 RiM 需要训练 memory token，并用 LoRA（Low-Rank Adaptation，低秩适配器）微调模型；光在 prompt 里写几个 `<m>` 不会自动产生工作记忆。
2. **以为 latent reasoning 一定快**：错在 Coconut 也在隐空间推理，但 continuous thought 仍要自回归生成，速度瓶颈还在。
3. **把 any-block accuracy 当部署指标**：错在 any-block 是事后挑最好的 block，真实部署通常只能用 final-block 或额外选择器。
4. **忽略 Stage 1 的 grounding**：错在 Stage 2 单独训练也能涨一点，但论文消融显示它会早早平台化，memory block 还没学会承担计算角色。

## 适用 vs 不适用场景

**适用**：

- GSM8K / 符号推理这类有明确短答案的任务；论文设定常见约 8 个 memory block（每块若干 `<m>`）。
- 要低延迟又想加内部计算：TTFT（Time To First Token，首 token 延迟）接近直接答题，而 CoT 可慢约一个数量级、Coconut 约数倍。
- 研究"模型内部状态是否承载推理信息"的可探针实验（线性 probe 可读 memory representation）。

**不适用**：

- 必须向用户展示完整推理过程的教学或审计场景。
- 开放式写作、长篇创作这类没有稳定最终答案的任务。
- 不允许微调（含 LoRA）、只能改 prompt 的使用场景。

## 历史小故事（可跳过）

- **1992 年**：Baddeley 的 working memory 理论把"临时存储 + 操作信息"变成认知心理学里的核心概念。
- **2022 年**：CoT 证明"写出中间步骤"能显著提升 LLM 推理，但也把计算和语言输出绑在一起。
- **2024 年**：Coconut 把部分思维链换成连续表示，开始认真探索 latent reasoning。
- **2024-2025 年**：pause token、implicit CoT、DART 等工作反复说明：空白 token 有潜力，但训练信号很关键。
- **2026 年**：Aichberger 和 Hochreiter 提出 RiM，用固定 memory block + 两阶段课程把 latent workspace 做成可并行推理机制。

## 学到什么

- **推理预算可以横向摆在输入里**：固定 memory blocks 给模型额外隐空间，却不要求生成额外中间 token。
- **监督信号决定 token 的角色**：同样是几个特殊 token，有没有 Stage 1 grounding，结果完全不同。
- **速度来自摆脱自回归中间步骤**：RiM 的 TTFT（首 token 延迟）接近直接答题，而 CoT / Coconut 仍要等待中间状态逐步生成。
- **可解释性会换成可探针性**：人看不到自然语言思维链，但线性 probe 可以从 memory representation 中预测哪个 block 更可能答对。

## 延伸阅读

- 论文 PDF：[arXiv:2605.30343](https://arxiv.org/abs/2605.30343)（本文，重点看 Figure 1、Figure 2 和 Table 1）
- Coconut：[arXiv:2412.06769](https://arxiv.org/abs/2412.06769)（RiM 最直接对比的 continuous thought 路线）
- Implicit CoT：[arXiv:2405.14838](https://arxiv.org/abs/2405.14838)（DART 前身，逐步把显式 CoT 内化）
- [[cot]] —— 显式"先想再答"的起点，RiM 正是在减少这条链的输出成本。
- [[cognitive-load-theory]] —— 从人类工作记忆角度理解为什么推理需要临时空间。
- [[self-consistency-2022]] —— 另一条 test-time compute 路线：多采样再投票。

## 关联

- [[cot]] —— RiM 要替代的显式中间推理输出，二者都在增加推理时计算。
- [[self-consistency-2022]] —— 同样花推理预算换准确率，但 SC 用多条外显链投票，RiM 用隐空间 block。
- [[tree-of-thoughts-2023]] —— ToT 把推理展开成搜索树，RiM 把推理压进固定 latent workspace。
- [[deepseek-r1]] —— R1 通过 RL 学会长 CoT，RiM 试图减少长 CoT 的输出成本。
- [[attention]] —— RiM 的 custom attention mask 是防止训练泄漏的关键工程点。
- [[cognitive-load-theory]] —— working memory 的认知类比帮助理解 memory block 的设计动机。
- [[llama]] —— 实验覆盖 Llama-3.2-1B/3B，说明方法不只适用于 GPT-2 小模型。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
