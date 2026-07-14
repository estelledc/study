---
title: 'Self-Instruct — 让模型自己造指令数据再学习'
description: '用 Self-Instruct 理解指令微调数据如何从少量种子任务扩展出来。'
来源: 'Wang et al., arXiv:2212.10560'
日期: 2026-07-14
分类: LLM / Instruction Tuning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2212.10560v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2212.10560
  source_version: arXiv:2212.10560v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

Self-Instruct: Aligning Language Models with Self-Generated Instructions 是一篇 LLM / Instruction Tuning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像老师先给 100 道样题，再让学生自己仿写 1 万道练习，老师负责筛掉重复和坏题。

它在本轮 40 篇里的位置是 **Batch 3 / instruction tuning**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

指令微调需要大量任务和答案，但人工写数据昂贵；只靠少量手工任务又覆盖不够广。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Seed instructions | 从少量人工任务开始。 |
| 模型生成新任务 | 让 LLM 扩写 instruction、input 和 output。 |
| 过滤与微调 | 去重、筛质量，再训练模型跟随指令。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

给模型三个种子任务：翻译、摘要、分类。它生成“把会议纪要改写成待办清单”等新任务，再过滤相似样本，最后形成更大的 instruction 数据集。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **模型自举会放大原模型偏差**：模型自举会放大原模型偏差，生成数据不是天然干净。
2. **过滤规则太弱会留下重复、空泛或错误答案。**：过滤规则太弱会留下重复、空泛或错误答案。
3. **自生成数据提升 instruction following**：自生成数据提升 instruction following，但不保证事实性。
4. **评测时要避开训练任务泄漏**：评测时要避开训练任务泄漏，否则会高估泛化。

## 学到什么

- 指令数据可以从“手工标注”扩展到“生成 + 过滤”的数据工程。
- Self-Instruct 是 Alpaca、WizardLM 等数据路线的重要前身。
- 数据生成流水线本身需要审计，而不只是看最终模型分数。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2212.10560>
- 本卡使用版本：<https://arxiv.org/abs/2212.10560v2>
- 主题关联：[[wizardlm-2023]]、[[natural-instructions-v2-2022]]、[[instructgpt]]、[[flan-2021]]

## 关联

- [[wizardlm-2023]]
- [[natural-instructions-v2-2022]]
- [[instructgpt]]
- [[flan-2021]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
