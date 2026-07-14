---
title: 'Prefix-Tuning — 不改模型，只给每层塞一段可训练前缀'
description: '用 Prefix-Tuning 理解连续 prompt 如何成为参数高效微调方法。'
来源: 'Li and Liang, arXiv:2101.00190'
日期: 2026-07-14
分类: LLM / Efficient Finetuning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2101.00190v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2101.00190
  source_version: arXiv:2101.00190v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Prefix-Tuning: Optimizing Continuous Prompts for Generation 是一篇 LLM / Efficient Finetuning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像不重写整本说明书，只在每章前面贴一张任务提示卡，让读者按新任务理解后文。

它在本轮 40 篇里的位置是 **Batch 7 / parameter-efficient tuning**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

全量 fine-tuning 每个任务都复制一套模型参数，存储和维护成本高。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 冻结 LM | 底座模型参数不更新。 |
| 可训练 prefix | 在每层 attention 前加入连续向量。 |
| 任务专属小参数 | 每个任务只保存很小的 prefix。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

同一个摘要模型要适配“新闻摘要”和“法律摘要”。Prefix-Tuning 不复制整个模型，只保存两套小 prefix。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **prefix 是连续向量**：prefix 是连续向量，人类不可读，调试不如自然语言 prompt 直观。
2. **任务差异很大时**：任务差异很大时，小 prefix 可能容量不够。
3. **不同架构的 prefix 插入点不同**：不同架构的 prefix 插入点不同，迁移要重做。
4. **服务多个 prefix 时要管理加载和缓存。**：服务多个 prefix 时要管理加载和缓存。

## 学到什么

- 参数高效微调的核心是冻结通用知识，只学习任务控制面。
- Prefix-Tuning 是 LoRA、Prompt Tuning 等 PEFT 方法的重要前奏。
- 产品上它对应“同一底座，多套轻量行为配置”。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2101.00190>
- 本卡使用版本：<https://arxiv.org/abs/2101.00190v1>
- 主题关联：[[prompt-tuning-2021]]、[[p-tuning-v2-2021]]、[[lora]]、[[qlora-2023]]

## 关联

- [[prompt-tuning-2021]]
- [[p-tuning-v2-2021]]
- [[lora]]
- [[qlora-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
