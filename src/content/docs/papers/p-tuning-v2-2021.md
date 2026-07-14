---
title: 'P-Tuning v2 — 把 prompt tuning 深插到每一层'
description: '用 P-Tuning v2 理解深层连续提示为什么能跨规模和任务接近 fine-tuning。'
来源: 'Liu et al., arXiv:2110.07602'
日期: 2026-07-14
分类: LLM / Efficient Finetuning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2110.07602v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2110.07602
  source_version: arXiv:2110.07602v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

P-Tuning v2: Prompt Tuning Can Be Comparable to Fine-tuning Universally Across Scales and Tasks 是一篇 LLM / Efficient Finetuning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像不只在书的第一页贴提示，而是在每一章开头都放一张任务提醒。

它在本轮 40 篇里的位置是 **Batch 7 / parameter-efficient tuning**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

早期 prompt tuning 在小模型和复杂序列标注任务上不稳定，离 full fine-tuning 还有差距。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Deep prompt | 在多层加入可训练提示，而不是只改输入层。 |
| 跨任务测试 | 覆盖 NLU、序列标注等更多任务。 |
| 冻结主干 | 仍保留参数高效和多任务存储优势。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

做命名实体识别时，只在输入前加 soft prompt 不够；深层 prompt 可以在模型内部多处影响表示。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **插入层数越多**：插入层数越多，工程实现越依赖模型结构。
2. **深层 prompt 更强**：深层 prompt 更强，但也更难解释。
3. **不同任务的 prompt 长度和位置需要调参。**：不同任务的 prompt 长度和位置需要调参。
4. **接近 fine-tuning 不代表所有分布外场景都稳。**：接近 fine-tuning 不代表所有分布外场景都稳。

## 学到什么

- PEFT 的设计空间不止“训练多少参数”，还有“参数插在哪里”。
- P-Tuning v2 把 prompt tuning 从生成任务推向更通用 NLU。
- 它提醒我们：轻量适配也需要体系化工程。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2110.07602>
- 本卡使用版本：<https://arxiv.org/abs/2110.07602v3>
- 主题关联：[[prompt-tuning-2021]]、[[prefix-tuning-2021]]、[[lora]]、[[qlora-2023]]

## 关联

- [[prompt-tuning-2021]]
- [[prefix-tuning-2021]]
- [[lora]]
- [[qlora-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
