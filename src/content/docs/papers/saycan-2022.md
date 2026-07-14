---
title: 'SayCan — 机器人不只问“想做什么”，还问“我能做什么”'
description: '用 SayCan 理解语言模型和机器人 affordance 如何合成可执行动作。'
来源: 'Ahn et al., arXiv:2204.01691'
日期: 2026-07-14
分类: LLM Agent / Robotics
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2204.01691v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2204.01691
  source_version: arXiv:2204.01691v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

Do As I Can, Not As I Say: Grounding Language in Robotic Affordances 是一篇 Embodied AI / Robotics 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像让人帮你做饭：他说“我应该切菜”是一回事，他手边有没有刀、会不会切、菜在不在台面上是另一回事。

它在本轮 40 篇里的位置是 **Batch 5 / agents and tools**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

LLM 能给出高层计划，但机器人必须选择当前环境里可执行、成功概率高的技能。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 语言可用性 | LLM 评估某个技能是否符合用户指令。 |
| Affordance value | 机器人策略估计当前状态下技能能否成功。 |
| 乘积排序 | 把“应该做”和“做得到”合成动作选择。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

用户说“把饮料递给我”。LLM 觉得“拿起可乐”合理，但 affordance 发现可乐不在视野里、矿泉水在桌上，于是先选择可执行的抓取动作。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **LLM 计划正确但感知错**：LLM 计划正确但感知错，机器人仍会失败。
2. **affordance 模型只覆盖已训练技能**：affordance 模型只覆盖已训练技能，超出技能库不能硬做。
3. **乘积分数简单有效**：乘积分数简单有效，但复杂长程任务需要更强规划。
4. **真实机器人安全约束不能只靠语言模型。**：真实机器人安全约束不能只靠语言模型。

## 学到什么

- 具身 agent 的关键是把语言意图接到可执行技能。
- SayCan 是“LLM planner + skill library”路线的代表。
- 软件 agent 也有类似问题：工具是否可用，比工具描述更重要。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2204.01691>
- 本卡使用版本：<https://arxiv.org/abs/2204.01691v2>
- 主题关联：[[voyager]]、[[inner-monologue-2022]]、[[react-agent]]、[[osworld]]

## 关联

- [[voyager]]
- [[inner-monologue-2022]]
- [[react-agent]]
- [[osworld]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
