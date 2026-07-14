---
title: 'Plan-and-Solve — 零样本推理先写计划再执行'
description: '用 Plan-and-Solve 理解为什么 prompt 可以显式拆成 plan 和 solve 两段。'
来源: 'Wang et al., arXiv:2305.04091'
日期: 2026-07-14
分类: LLM / Reasoning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2305.04091v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2305.04091
  source_version: arXiv:2305.04091v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models 是一篇 LLM / Reasoning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像考试前先列提纲：第一步读题，第二步列公式，第三步检查单位，然后才开始写答案。

它在本轮 40 篇里的位置是 **Batch 6 / agent tool ecosystems**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

Zero-shot CoT 只要求“Let’s think step by step”，但没有约束模型先形成完整计划，容易漏步骤。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Plan phase | 让模型先写解决方案大纲。 |
| Solve phase | 按计划逐步执行并给答案。 |
| 增强版 prompt | 加入计算、遗漏检查等提示降低常见错误。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

处理报销题时，计划先列“汇总金额、扣除不可报销项、计算税费、输出结果”，再逐项求解，能减少漏扣项目。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **计划写得漂亮但不可执行时**：计划写得漂亮但不可执行时，solve 阶段仍会失败。
2. **简单题强行计划会增加冗余。**：简单题强行计划会增加冗余。
3. **prompt 结构收益依赖模型基础能力。**：prompt 结构收益依赖模型基础能力。
4. **没有外部验证时**：没有外部验证时，计划和答案可能一起错。

## 学到什么

- Plan-and-Solve 是轻量 planner，不需要训练就能改善部分推理。
- 它连接了 CoT prompt 和 agent planning。
- 产品中可以把“计划可见化”作为用户信任和调试入口。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2305.04091>
- 本卡使用版本：<https://arxiv.org/abs/2305.04091v3>
- 主题关联：[[least-to-most-prompting-2022]]、[[chain-of-thought]]、[[agent-planning-benchmark-2026]]、[[tree-of-thoughts-2023]]

## 关联

- [[least-to-most-prompting-2022]]
- [[chain-of-thought]]
- [[agent-planning-benchmark-2026]]
- [[tree-of-thoughts-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
