---
title: 'Linformer — 把 attention 矩阵投影成线性复杂度'
description: '用 Linformer 理解低秩假设如何压缩 self-attention。'
来源: 'Wang et al., arXiv:2006.04768'
日期: 2026-07-14
分类: NLP / Efficient Attention
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2006.04768v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2006.04768
  source_version: arXiv:2006.04768v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

Linformer: Self-Attention with Linear Complexity 是一篇 Transformer / Efficient Attention 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像把一张超大照片先压缩成少数关键列，再做分析；不是每个像素都两两比较。

它在本轮 40 篇里的位置是 **Batch 8 / long context and inference**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

标准 self-attention 对序列长度是 O(n²)，长文本会迅速耗尽显存和计算。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 低秩假设 | 认为 attention 矩阵可以用较低维度近似。 |
| K/V 投影 | 把 key 和 value 沿序列维压到固定 k。 |
| 线性复杂度 | 把长序列成本从平方级降到近似线性。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

10000 个 token 两两 attention 要 1 亿级关系；Linformer 先投影到 256 个摘要位置，再计算关系。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **低秩近似不是所有任务都成立**：低秩近似不是所有任务都成立，细粒度长程依赖可能受损。
2. **固定投影维度需要按任务和长度调。**：固定投影维度需要按任务和长度调。
3. **它解决的是 attention 成本**：它解决的是 attention 成本，不解决所有长上下文记忆问题。
4. **后续 Performer、Longformer、BigBird 走了不同取舍。**：后续 Performer、Longformer、BigBird 走了不同取舍。

## 学到什么

- 高效 attention 的本质是承认不是每个 token 对都同等重要。
- Linformer 是长上下文效率路线的重要早期方案。
- 产品选型要看任务依赖模式，而不是只看复杂度公式。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2006.04768>
- 本卡使用版本：<https://arxiv.org/abs/2006.04768v3>
- 主题关联：[[performer-2020]]、[[longformer-2020]]、[[bigbird-2020]]、[[reformer-2020]]

## 关联

- [[performer-2020]]
- [[longformer-2020]]
- [[bigbird-2020]]
- [[reformer-2020]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
