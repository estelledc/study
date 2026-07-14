---
title: 'Minerva — 把语言模型拉进数学草稿纸'
description: '用 Minerva 理解为什么数学推理需要专门的数据、逐步解题和采样验证。'
来源: 'Lewkowycz et al., arXiv:2206.14858'
日期: 2026-07-14
分类: LLM / Math Reasoning
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2206.14858v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2206.14858
  source_version: arXiv:2206.14858v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

Solving Quantitative Reasoning Problems with Language Models 是一篇 LLM / Math Reasoning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像让一个语文很强的学生转去参加数学竞赛：会读题还不够，还要见过足够多推导格式，并愿意把草稿一步步写出来。

它在本轮 40 篇里的位置是 **Batch 1 / foundation scaling**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

通用 LLM 在自然语言上强，但数学和科学题需要符号、公式、长链推理和计算一致性，普通网页语料不足以稳定支持。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 数学/科学语料继续训练 | 让模型多见 LaTeX、公式和定量推导。 |
| 逐步解题格式 | 鼓励模型输出中间步骤，而不是只给最终答案。 |
| 采样与投票 | 多次生成候选解，用一致性提高最终准确率。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

同一道应用题让模型只报答案，很容易算错；让它列方程、化简、再代入，并采样 5 次取多数，错误率会下降。这就是 Minerva 的产品直觉。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **采样投票提高的是答案选择**：采样投票提高的是答案选择，不保证每条推导都严谨。
2. **数学语料会带来格式优势**：数学语料会带来格式优势，但不能替代形式化证明器。
3. **模型可能写出看似漂亮但中间偷换概念的推导。**：模型可能写出看似漂亮但中间偷换概念的推导。
4. **只看竞赛题会高估真实工程计算和数据分析能力。**：只看竞赛题会高估真实工程计算和数据分析能力。

## 学到什么

- 数学能力是“数据分布 + 推理格式 + 验证策略”的组合。
- Minerva 是后续 GSM8K、PAL、Program of Thoughts 的重要背景。
- 对产品来说，长推理必须配合检查器或工具，而不是只相信自然语言草稿。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2206.14858>
- 本卡使用版本：<https://arxiv.org/abs/2206.14858v2>
- 主题关联：[[gsm8k-2021]]、[[program-of-thoughts-2022]]、[[pal-code-reasoning-2022]]、[[self-consistency-2022]]

## 关联

- [[gsm8k-2021]]
- [[program-of-thoughts-2022]]
- [[pal-code-reasoning-2022]]
- [[self-consistency-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
