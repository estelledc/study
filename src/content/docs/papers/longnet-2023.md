---
title: 'LongNet — 用 dilated attention 把上下文推到十亿 token 想象空间'
description: '用 LongNet 理解扩张式 attention 如何在多尺度上连接超长序列。'
来源: 'Ding et al., arXiv:2307.02486'
日期: 2026-07-14
分类: NLP / Long Context
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2307.02486v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2307.02486
  source_version: arXiv:2307.02486v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

LongNet: Scaling Transformers to 1,000,000,000 Tokens 是一篇 Transformer / Long Context 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像城市交通：近处走小路，远处走高速，不需要每两个地点都修直达路。

它在本轮 40 篇里的位置是 **Batch 8 / long context and inference**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

百万级甚至更长上下文不能靠标准 attention 硬算，需要多尺度连接结构。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Dilated attention | 按距离扩大 attention 间隔，覆盖更远范围。 |
| 分段设计 | 在局部细看、远处粗看之间折中。 |
| 超长上下文实验 | 验证在长序列建模中的扩展潜力。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

读 1000 页书时，当前页逐句看，上一章按段看，整本书按章节摘要看，这就是多尺度注意力直觉。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **超长上下文可训练不等于模型会有效使用全部信息。**：超长上下文可训练不等于模型会有效使用全部信息。
2. **远距离粗看可能漏细节。**：远距离粗看可能漏细节。
3. **benchmark 长度和真实任务长度不是一回事。**：benchmark 长度和真实任务长度不是一回事。
4. **工程上还要解决数据加载、位置编码和推理内存。**：工程上还要解决数据加载、位置编码和推理内存。

## 学到什么

- LongNet 把长上下文问题从窗口扩展推进到多尺度结构。
- 长上下文能力需要“能放进去”和“能找出来”两套评测。
- 它适合和 RAG、记忆系统一起比较，而不是互相替代。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2307.02486>
- 本卡使用版本：<https://arxiv.org/abs/2307.02486v2>
- 主题关联：[[bigbird-2020]]、[[longformer-2020]]、[[gemini-1.5-2024]]、[[memgym]]

## 关联

- [[bigbird-2020]]
- [[longformer-2020]]
- [[gemini-1.5-2024]]
- [[memgym]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
