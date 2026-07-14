---
title: 'Least-to-Most — 先拆小题，再解大题'
description: '用 Least-to-Most Prompting 理解复杂推理为什么要先分解再逐步求解。'
来源: 'Zhou et al., arXiv:2205.10625'
日期: 2026-07-14
分类: LLM / Reasoning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2205.10625v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2205.10625
  source_version: arXiv:2205.10625v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

Least-to-Most Prompting Enables Complex Reasoning in Large Language Models 是一篇 LLM / Reasoning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像解奥数题先问“这题能拆成哪几个小问”，而不是一口气从题干跳到答案。

它在本轮 40 篇里的位置是 **Batch 4 / reasoning prompts**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

Chain-of-Thought 能让模型写步骤，但面对组合性强的问题，模型仍可能在第一步就选错路线。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 问题分解 | 先生成一串更小、更容易的问题。 |
| 逐步求解 | 每个小问题用前面答案作为上下文。 |
| 组合泛化 | 测试模型能否把学过的小技能组合到更长任务。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

问“如果 Alice 比 Bob 多 3 个苹果，Bob 又比 Carol 多 2 个，Carol 有 5 个，Alice 有几个？”先拆 Carol->Bob，再 Bob->Alice，错误比直接心算少。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **第一步分解错**：第一步分解错，后面会稳定地错下去。
2. **并非所有任务都适合线性拆解**：并非所有任务都适合线性拆解，有些需要回溯。
3. **prompt 更长会增加成本和上下文噪声。**：prompt 更长会增加成本和上下文噪声。
4. **分解质量需要单独评估**：分解质量需要单独评估，不能只看最终答案。

## 学到什么

- 复杂推理常常先是任务编排问题，再是单步能力问题。
- Least-to-Most 是 agent planner 的早期 prompt 形态。
- 后续 Plan-and-Solve、Tree of Thoughts 都在扩展这条线。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2205.10625>
- 本卡使用版本：<https://arxiv.org/abs/2205.10625v3>
- 主题关联：[[chain-of-thought]]、[[tree-of-thoughts-2023]]、[[plan-and-solve-prompting-2023]]、[[self-consistency-2022]]

## 关联

- [[chain-of-thought]]
- [[tree-of-thoughts-2023]]
- [[plan-and-solve-prompting-2023]]
- [[self-consistency-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
