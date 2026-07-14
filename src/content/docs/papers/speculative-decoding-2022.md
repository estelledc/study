---
title: 'Speculative Decoding — 小模型先猜，大模型只验收'
description: '用 Speculative Decoding 理解如何不改变分布地加速自回归生成。'
来源: 'Leviathan et al., arXiv:2211.17192'
日期: 2026-07-14
分类: LLM / Inference
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2211.17192v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2211.17192
  source_version: arXiv:2211.17192v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

Fast Inference from Transformers via Speculative Decoding 是一篇 LLM / Inference 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像助理先帮主编拟好接下来几句话，主编快速圈掉不合适的，保留合格部分。

它在本轮 40 篇里的位置是 **Batch 8 / long context and inference**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

LLM 自回归生成一次只确认一个 token，大模型推理延迟高，但很多位置小模型也能猜中。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Draft model | 小模型一次提出多个候选 token。 |
| Target verification | 大模型并行验证这些候选是否可接受。 |
| 分布保持 | 通过接受/拒绝规则保证输出分布不被近似破坏。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

大模型要生成“今天的天气很好”。小模型先猜“的 天气 很”，大模型一次检查多个 token，猜对就跳过逐字生成。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **小模型太弱会猜不中**：小模型太弱会猜不中，反而增加开销。
2. **任务越随机**：任务越随机，接受率越低。
3. **实现需要高效批量验证和缓存管理。**：实现需要高效批量验证和缓存管理。
4. **它加速 decoding**：它加速 decoding，不减少训练成本。

## 学到什么

- 推理优化可以利用“便宜模型预测，昂贵模型裁决”的结构。
- Speculative Decoding 是服务端 LLM 延迟优化的基础技巧。
- 后续 Medusa、EAGLE 等多 token 预测方法都在扩展这条路。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2211.17192>
- 本卡使用版本：<https://arxiv.org/abs/2211.17192v2>
- 主题关联：[[medusa-2024]]、[[eagle]]、[[paged-attention]]、[[mistral-7b-2023]]

## 关联

- [[medusa-2024]]
- [[eagle]]
- [[paged-attention]]
- [[mistral-7b-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
