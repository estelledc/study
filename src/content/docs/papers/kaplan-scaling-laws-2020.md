---
title: 'Scaling Laws — 大模型训练不是玄学，是幂律预算题'
description: '用 Kaplan scaling laws 理解参数、数据和计算量怎样一起决定语言模型损失。'
来源: 'Kaplan et al., arXiv:2001.08361'
日期: 2026-07-14
分类: LLM / Scaling Laws
难度: 高级
difficulty: advanced
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2001.08361v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2001.08361
  source_version: arXiv:2001.08361v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Scaling Laws for Neural Language Models 是一篇 LLM / Scaling Laws 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像给一家工厂做产能规划：机器太多但原料不够会空转，原料太多但机器太少也堆仓库，训练 LLM 也要在参数、数据和算力之间找平衡。

它在本轮 40 篇里的位置是 **Batch 1 / foundation scaling**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

论文出现前，大家知道“大模型通常更好”，但不知道多大、多长数据、多少计算量之间该怎么配。没有这张预算图，训练计划很容易靠经验拍脑袋。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 幂律拟合 | 把 loss 和模型规模、数据量、计算量之间的关系写成稳定曲线。 |
| 计算最优边界 | 在固定 compute 下找参数量和 token 数的配比。 |
| 跨尺度外推 | 用小模型实验估算大模型训练会落在哪个区间。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

如果预算只能训练 10 天，一个 10B 模型只看 1B token 可能欠训练；一个 100M 模型看 1T token 又容量不够。scaling law 的 toy 复现就是画出两条 loss 曲线，找“再加参数”和“再加数据”边际收益相近的位置。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **幂律不是物理定律**：幂律不是物理定律，换数据分布、架构或优化器后要重新校准。
2. **论文早期结论偏向“参数多、数据相对少”**：论文早期结论偏向“参数多、数据相对少”，后来 Chinchilla 修正了 compute-optimal 配比。
3. **只看 loss 会漏掉工具调用、事实性、安全和交互能力。**：只看 loss 会漏掉工具调用、事实性、安全和交互能力。
4. **外推不能替代中途 checkpoint 监控**：外推不能替代中途 checkpoint 监控，训练崩掉时曲线也会骗你。

## 学到什么

- 大模型路线先是预算工程，再是模型魔法。
- 一条可外推曲线能把“信仰扩参”变成“可审计决策”。
- 后续 Chinchilla、PaLM、LLaMA 都在回应这类 compute allocation 问题。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2001.08361>
- 本卡使用版本：<https://arxiv.org/abs/2001.08361v1>
- 主题关联：[[gpt-3]]、[[chinchilla]]、[[llama]]、[[palm-2022]]

## 关联

- [[gpt-3]]
- [[chinchilla]]
- [[llama]]
- [[palm-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
