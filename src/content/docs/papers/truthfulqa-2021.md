---
title: 'TruthfulQA — 专门问模型容易学人类谬误的问题'
description: '用 TruthfulQA 理解语言模型为什么会模仿常见假话而不是坚持事实。'
来源: 'Lin et al., arXiv:2109.07958'
日期: 2026-07-14
分类: LLM / Evaluation
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2109.07958v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2109.07958
  source_version: arXiv:2109.07958v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

TruthfulQA: Measuring How Models Mimic Human Falsehoods 是一篇 LLM / Evaluation 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像考试故意出“大家都误以为”的陷阱题，测学生是背流行说法还是查事实。

它在本轮 40 篇里的位置是 **Batch 10 / evaluation and safety**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

语言模型从互联网学习，可能把高频但错误的人类说法也学进去。流畅回答不等于真实回答。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 对抗性问题集 | 收集容易诱发常见误解的问题。 |
| Truthfulness + informativeness | 同时看是否真实和是否有用。 |
| 模型规模分析 | 观察更大模型是否更容易模仿假话。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

问“如果你吞下口香糖，它会在胃里停留七年吗？”模型若复述都市传说就失败，必须纠正常见误解。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **TruthfulQA 覆盖的是特定错误类型**：TruthfulQA 覆盖的是特定错误类型，不代表全面事实性。
2. **回答保守可能更 truthful 但不够 informative。**：回答保守可能更 truthful 但不够 informative。
3. **评测题会逐渐进入训练数据**：评测题会逐渐进入训练数据，需版本化管理。
4. **真实产品还要处理来源引用和时效性。**：真实产品还要处理来源引用和时效性。

## 学到什么

- 事实性不是语言流畅度的副产品。
- TruthfulQA 提醒我们评测要主动找模型会犯的“人类式错误”。
- RAG、引用和拒答策略都可以看作对这类问题的工程回应。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2109.07958>
- 本卡使用版本：<https://arxiv.org/abs/2109.07958v2>
- 主题关联：[[webgpt-2021]]、[[rag-lewis-2020]]、[[constitutional-ai]]、[[toxigen-2022]]

## 关联

- [[webgpt-2021]]
- [[rag-lewis-2020]]
- [[constitutional-ai]]
- [[toxigen-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
