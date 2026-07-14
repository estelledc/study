---
title: 'Program of Thoughts — 让模型写程序，把计算交给解释器'
description: '用 Program of Thoughts 理解自然语言推理和精确计算为什么要分工。'
来源: 'Chen et al., arXiv:2211.12588'
日期: 2026-07-14
分类: LLM / Tool Reasoning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2211.12588v4
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2211.12588
  source_version: arXiv:2211.12588v4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v4
---

## 是什么

Program of Thoughts Prompting: Disentangling Computation from Reasoning for Numerical Reasoning Tasks 是一篇 LLM / Tool Reasoning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像人做应用题：读题和列式靠脑子，真正大数计算交给计算器。

它在本轮 40 篇里的位置是 **Batch 4 / reasoning prompts**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

LLM 很会解释，但在多位数运算、循环和表格计算上容易算错。自然语言步骤不适合承担精确执行。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 生成程序 | 让模型把题目转成可执行代码。 |
| 解释器执行 | 把算术和循环交给 Python 等工具。 |
| 推理/计算解耦 | 模型负责建模，工具负责确定性结果。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

题目要求算 37 个商品每个 19.8 元再打 85 折。模型写 `37 * 19.8 * 0.85`，解释器给出数值，避免口算漂移。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **程序写错比算错更隐蔽**：程序写错比算错更隐蔽，需要测试输入或断言。
2. **代码执行有安全边界**：代码执行有安全边界，不能随便跑不可信代码。
3. **有些题的难点是建模**：有些题的难点是建模，不是计算；解释器救不了错误公式。
4. **工具调用延迟和沙箱成本要纳入产品设计。**：工具调用延迟和沙箱成本要纳入产品设计。

## 学到什么

- LLM 工具使用的第一原则是让确定性系统做确定性工作。
- Program of Thoughts 是 PAL、Toolformer、agent tool use 的重要前身。
- 代码不是装饰，而是把推理结果变成可执行证据。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2211.12588>
- 本卡使用版本：<https://arxiv.org/abs/2211.12588v4>
- 主题关联：[[pal-code-reasoning-2022]]、[[toolformer]]、[[gsm8k-2021]]、[[react-agent]]

## 关联

- [[pal-code-reasoning-2022]]
- [[toolformer]]
- [[gsm8k-2021]]
- [[react-agent]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
