---
title: 'Gorilla — 让 LLM 学会查 API 文档再调用'
description: '用 Gorilla 理解 API grounding 如何降低工具调用幻觉。'
来源: 'Patil et al., arXiv:2305.15334'
日期: 2026-07-14
分类: LLM / Tool Use
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2305.15334v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2305.15334
  source_version: arXiv:2305.15334v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Gorilla: Large Language Model Connected with Massive APIs 是一篇 LLM / Tool Use 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像程序员写代码前先查官方文档，而不是凭记忆猜函数名和参数。

它在本轮 40 篇里的位置是 **Batch 6 / agent tool ecosystems**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

LLM 调 API 时常编造不存在的函数、参数或版本。工具越多，幻觉空间越大。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| APIBench | 整理大量机器学习 API 调用任务。 |
| 检索增强 | 先找相关 API 文档，再生成调用。 |
| 调用格式评测 | 检查函数名、参数和版本是否真实可用。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

用户要加载 Hugging Face 模型。Gorilla 式流程先检索 `transformers.pipeline` 文档，再输出参数，而不是凭模型记忆写一个不存在的 `load_hf_model()`。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **检索到旧版本文档会导致过时调用。**：检索到旧版本文档会导致过时调用。
2. **API 调用正确不等于业务流程正确。**：API 调用正确不等于业务流程正确。
3. **长尾库文档质量差时**：长尾库文档质量差时，模型仍可能猜。
4. **真实生产还要处理鉴权、速率限制和错误返回。**：真实生产还要处理鉴权、速率限制和错误返回。

## 学到什么

- 工具调用可靠性首先是文档 grounding 问题。
- Gorilla 把“会用工具”从自然语言能力转成 API 版本契约。
- MCP、function calling 和 tool benchmark 都需要类似检查。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2305.15334>
- 本卡使用版本：<https://arxiv.org/abs/2305.15334v1>
- 主题关联：[[toolllm-2023]]、[[toolformer]]、[[mcpworld-2025]]、[[mrkl-systems-2022]]

## 关联

- [[toolllm-2023]]
- [[toolformer]]
- [[mcpworld-2025]]
- [[mrkl-systems-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
