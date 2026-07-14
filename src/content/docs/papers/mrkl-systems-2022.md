---
title: 'MRKL — 给大模型配一组专家工具和路由器'
description: '用 MRKL Systems 理解 neuro-symbolic agent 为什么要把 LLM、检索和计算模块拆开。'
来源: 'Karpas et al., arXiv:2205.00445'
日期: 2026-07-14
分类: LLM / Tool Architecture
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2205.00445v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2205.00445
  source_version: arXiv:2205.00445v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

MRKL Systems: A modular, neuro-symbolic architecture that combines large language models, external knowledge sources and discrete reasoning 是一篇 LLM / Tool Architecture 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像医院分诊台：LLM 不必自己做所有检查，而是判断该去影像科、化验科还是专家门诊。

它在本轮 40 篇里的位置是 **Batch 5 / agents and tools**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

单个语言模型既要懂语言、查事实、算数、调用业务系统，可靠性和可维护性都会变差。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 模块化专家 | 把计算器、搜索、数据库、规则系统等做成独立 expert。 |
| 路由/编排 | 由模型或控制器决定什么时候调用哪个模块。 |
| 神经 + 符号结合 | 让 LLM 做语言理解，让确定性系统做可验证操作。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

用户问“把 17 美元按今天汇率换成人民币再加 6% 税是多少”，MRKL 会路由到汇率工具和计算器，而不是让 LLM 心算。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **路由错了**：路由错了，比不用工具更糟。
2. **专家模块接口要稳定**：专家模块接口要稳定，否则 prompt 里写得再好也会失败。
3. **工具结果需要回填上下文**：工具结果需要回填上下文，避免模型忽略真实返回。
4. **模块越多**：模块越多，权限和审计越重要。

## 学到什么

- MRKL 把 agent 可靠性问题转成系统架构问题。
- 今天的 function calling、MCP 和 tool router 都能看到它的影子。
- LLM 产品不该追求一个模型包打天下。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2205.00445>
- 本卡使用版本：<https://arxiv.org/abs/2205.00445v1>
- 主题关联：[[toolformer]]、[[mcp-bench-2025]]、[[program-of-thoughts-2022]]、[[gorilla-2023]]

## 关联

- [[toolformer]]
- [[mcp-bench-2025]]
- [[program-of-thoughts-2022]]
- [[gorilla-2023]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
