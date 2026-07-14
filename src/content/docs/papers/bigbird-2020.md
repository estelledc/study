---
title: 'BigBird — 用稀疏 attention 拉长 Transformer 视野'
description: '用 BigBird 理解局部、全局和随机 attention 怎样组成长序列模式。'
来源: 'Zaheer et al., arXiv:2007.14062'
日期: 2026-07-14
分类: NLP / Efficient Attention
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2007.14062v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2007.14062
  source_version: arXiv:2007.14062v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

Big Bird: Transformers for Longer Sequences 是一篇 Transformer / Efficient Attention 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像开会时不需要每个人和每个人都私聊：相邻同事聊局部，主持人做全局，随机跨组交流补信息。

它在本轮 40 篇里的位置是 **Batch 8 / long context and inference**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

长文档、基因序列等任务需要上千到上万 token，标准 attention 太贵。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 局部窗口 | 每个 token 看附近 token。 |
| 全局 token | 少数特殊 token 连接全局信息。 |
| 随机连接 | 补充远距离信息路径，保持表达能力。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

读一本长报告时，每段先看前后段，目录页提供全局索引，再随机抽查远处引用，成本远低于所有段落互相比较。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **稀疏模式是先验**：稀疏模式是先验，选错模式会漏掉关键依赖。
2. **理论表达能力不等于具体任务效果。**：理论表达能力不等于具体任务效果。
3. **全局 token 设计会影响信息汇聚。**：全局 token 设计会影响信息汇聚。
4. **实现效率依赖 kernel 和硬件支持。**：实现效率依赖 kernel 和硬件支持。

## 学到什么

- BigBird 展示了“稀疏但连通”的 attention 设计哲学。
- 长上下文不是只把窗口拉大，还要设计信息路由。
- 后续 LongNet、Gemini 1.5 等都在不同层面延续这个问题。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2007.14062>
- 本卡使用版本：<https://arxiv.org/abs/2007.14062v2>
- 主题关联：[[longformer-2020]]、[[linformer-2020]]、[[longnet-2023]]、[[gemini-1.5-2024]]

## 关联

- [[longformer-2020]]
- [[linformer-2020]]
- [[longnet-2023]]
- [[gemini-1.5-2024]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
