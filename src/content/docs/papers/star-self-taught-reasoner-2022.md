---
title: 'STaR — 模型先试着讲理由，再用对的理由训练自己'
description: '用 STaR 理解 rationale bootstrapping 怎样减少人工推理标注。'
来源: 'Zelikman et al., arXiv:2203.14465'
日期: 2026-07-14
分类: LLM / Reasoning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2203.14465v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2203.14465
  source_version: arXiv:2203.14465v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

STaR: Bootstrapping Reasoning With Reasoning 是一篇 LLM / Reasoning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像学生先自己写解题过程，老师只挑答案对且过程说得通的作业放进优秀范例本。

它在本轮 40 篇里的位置是 **Batch 4 / reasoning prompts**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

高质量 rationale 标注很贵，但没有中间理由，模型又难学会复杂推理。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 生成 rationales | 让模型为训练题自己写推理过程。 |
| 答案过滤 | 只保留能得到正确答案的推理。 |
| 迭代微调 | 用筛过的 rationale 继续训练，再生成更好理由。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

给模型 100 道选择题，它先写理由和答案。只把答对的 40 道理由留下微调，下一轮可能答对更多。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **答对不代表理由真实**：答对不代表理由真实，可能是碰巧或事后合理化。
2. **过滤会偏向模型已经会的题**：过滤会偏向模型已经会的题，困难题可能长期学不到。
3. **迭代可能放大错误风格**：迭代可能放大错误风格，需要人工抽检。
4. **rationale 数据可能泄漏答案线索**：rationale 数据可能泄漏答案线索，评测要谨慎。

## 学到什么

- 推理数据可以用“生成-过滤-再训练”自举出来。
- STaR 是 Self-Instruct 在 reasoning 维度的近亲。
- 任何自举流程都要警惕“看起来会解释”的幻觉。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2203.14465>
- 本卡使用版本：<https://arxiv.org/abs/2203.14465v2>
- 主题关联：[[chain-of-thought]]、[[self-instruct-2022]]、[[gsm8k-2021]]、[[orca-explanation-tuning-2023]]

## 关联

- [[chain-of-thought]]
- [[self-instruct-2022]]
- [[gsm8k-2021]]
- [[orca-explanation-tuning-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
