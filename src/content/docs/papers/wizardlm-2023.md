---
title: 'WizardLM — 用 Evol-Instruct 自动变难训练题'
description: '用 WizardLM 理解 instruction 数据不只要多，还要逐步变复杂。'
来源: 'Xu et al., arXiv:2304.12244'
日期: 2026-07-14
分类: LLM / Instruction Tuning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2304.12244v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2304.12244
  source_version: arXiv:2304.12244v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

WizardLM: Empowering large pre-trained language models to follow complex instructions 是一篇 LLM / Instruction Tuning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像刷题系统会把“写一句话总结”升级成“按三种受众写三版摘要并比较差异”，难度被系统性拉高。

它在本轮 40 篇里的位置是 **Batch 3 / instruction tuning**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

很多 instruction 数据停留在简单任务，模型会变得听话但不擅长复杂约束。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Evol-Instruct | 用 LLM 自动改写指令，让深度、广度和约束增加。 |
| 复杂任务微调 | 把演化后的任务用于 instruction tuning。 |
| 人工/模型评估 | 比较复杂指令上的遵循能力。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

原任务是“解释二分查找”；演化后变成“给零基础同学解释二分查找，列两个误区，再给一道练习题”。模型由此学会处理多约束输出。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **自动变难可能制造不自然任务**：自动变难可能制造不自然任务，和真实用户需求脱节。
2. **复杂指令越长**：复杂指令越长，答案质量越难自动判定。
3. **演化数据依赖基础模型能力**：演化数据依赖基础模型能力，弱模型会产生坏任务。
4. **只优化复杂性可能牺牲简洁回答能力。**：只优化复杂性可能牺牲简洁回答能力。

## 学到什么

- 指令数据的“难度曲线”本身是训练设计对象。
- WizardLM 是从 Self-Instruct 到复杂 agent 任务数据的桥。
- 产品评测也应分层：简单 obey、复杂约束、跨步执行要分开看。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2304.12244>
- 本卡使用版本：<https://arxiv.org/abs/2304.12244v3>
- 主题关联：[[self-instruct-2022]]、[[natural-instructions-v2-2022]]、[[orca-explanation-tuning-2023]]、[[toolllm-2023]]

## 关联

- [[self-instruct-2022]]
- [[natural-instructions-v2-2022]]
- [[orca-explanation-tuning-2023]]
- [[toolllm-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
