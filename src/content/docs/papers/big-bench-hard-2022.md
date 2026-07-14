---
title: 'BIG-Bench Hard — 从大题库里挑出模型最头疼的 23 类题'
description: '用 BBH 理解为什么 benchmark 需要难题子集和 CoT 对照。'
来源: 'Suzgun et al., arXiv:2210.09261'
日期: 2026-07-14
分类: LLM / Evaluation
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2210.09261v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2210.09261
  source_version: arXiv:2210.09261v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Challenging BIG-Bench Tasks and Whether Chain-of-Thought Can Solve Them 是一篇 LLM / Evaluation 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像从整本习题集里挑出全班错误率最高的题，专门看模型是不是真会推理。

它在本轮 40 篇里的位置是 **Batch 10 / evaluation and safety**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

BIG-bench 很大，但平均分会掩盖模型最薄弱的任务。研究者需要一个更聚焦的难题集合。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Hard subset | 挑出模型表现低于人类的 23 个任务。 |
| CoT 对照 | 比较普通 prompting 和 chain-of-thought。 |
| 多任务诊断 | 覆盖逻辑、符号、常识和多步推理。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

如果总题库 200 道平均 80 分，但 23 道逻辑题只有 30 分，BBH 就把这 23 道拿出来单独追踪。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **难题子集会被反复优化**：难题子集会被反复优化，长期需要更新。
2. **CoT 提升不代表推理机制完全可靠。**：CoT 提升不代表推理机制完全可靠。
3. **任务格式仍是文本题**：任务格式仍是文本题，不能代表工具和交互 agent。
4. **难度选择依赖当时模型水平**：难度选择依赖当时模型水平，强模型时代要重估。

## 学到什么

- 评测要看弱点集合，而不是只看大平均分。
- BBH 是 CoT 时代最常见的推理诊断集合之一。
- 产品验收也应该保留“最容易失败的固定小集”。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2210.09261>
- 本卡使用版本：<https://arxiv.org/abs/2210.09261v1>
- 主题关联：[[bigbench-2022]]、[[chain-of-thought]]、[[least-to-most-prompting-2022]]、[[agent-planning-benchmark-2026]]

## 关联

- [[bigbench-2022]]
- [[chain-of-thought]]
- [[least-to-most-prompting-2022]]
- [[agent-planning-benchmark-2026]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
