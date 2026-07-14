---
title: 'Prompt Tuning — 规模变大后，软提示也能接近微调'
description: '用 Prompt Tuning 理解为什么 soft prompt 在大模型上突然变得有效。'
来源: 'Lester et al., arXiv:2104.08691'
日期: 2026-07-14
分类: LLM / Efficient Finetuning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2104.08691v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2104.08691
  source_version: arXiv:2104.08691v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

The Power of Scale for Parameter-Efficient Prompt Tuning 是一篇 LLM / Efficient Finetuning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像给越聪明的学生越短的提示也够用：基础能力强了，小小提示就能调动已有知识。

它在本轮 40 篇里的位置是 **Batch 7 / parameter-efficient tuning**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

离散 prompt 需要人工写，full fine-tuning 又贵。问题是能不能只训练一小串连续 prompt token。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Soft prompt | 在输入前加可训练 embedding。 |
| 冻结 T5 底座 | 只更新 prompt 参数。 |
| 规模效应分析 | 观察模型越大，prompt tuning 越接近 full tuning。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

把同一个 T5 用于情感分类，只训练 20 个虚拟 token，让它把任务映射到已有语言能力。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **小模型上 soft prompt 可能明显弱于 full fine-tuning。**：小模型上 soft prompt 可能明显弱于 full fine-tuning。
2. **soft prompt 不可读**：soft prompt 不可读，不适合需要人工审查的控制策略。
3. **prompt 长度、初始化和任务格式都影响结果。**：prompt 长度、初始化和任务格式都影响结果。
4. **它主要调任务行为**：它主要调任务行为，不会凭空补充缺失知识。

## 学到什么

- 模型规模会改变适配方法的性价比。
- Prompt Tuning 说明“控制模型”可以比“改模型”更轻。
- PEFT 方法要结合底座规模一起评估。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2104.08691>
- 本卡使用版本：<https://arxiv.org/abs/2104.08691v2>
- 主题关联：[[prefix-tuning-2021]]、[[p-tuning-v2-2021]]、[[t5]]、[[ul2-2022]]

## 关联

- [[prefix-tuning-2021]]
- [[p-tuning-v2-2021]]
- [[t5]]
- [[ul2-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
