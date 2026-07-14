---
title: 'ControlNet — 给扩散模型加一条可控条件支路'
description: '用 ControlNet 理解边缘、姿态和深度图如何稳定控制图像生成。'
来源: 'Zhang et al., arXiv:2302.05543'
日期: 2026-07-14
分类: Diffusion / Control
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2302.05543v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2302.05543
  source_version: arXiv:2302.05543v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

Adding Conditional Control to Text-to-Image Diffusion Models 是一篇 Diffusion / Control 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像画师已经会画风格，现在给他一张铅笔草图，要求构图必须跟草图走。

它在本轮 40 篇里的位置是 **Batch 9 / controllable generation**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

纯文本控制扩散模型太松，用户想固定姿态、边缘、深度或布局时，prompt 很难精确约束。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 锁定原模型 | 保留预训练 diffusion backbone 的生成能力。 |
| 可训练条件分支 | 为边缘、深度、pose 等条件学习控制信号。 |
| Zero convolution | 让新分支从不破坏原模型开始逐渐学习。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

给一张 Canny 边缘图和 prompt“水彩风房子”，ControlNet 会沿着边缘图生成，而不是自由发挥构图。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **条件图质量决定结果上限**：条件图质量决定结果上限，坏边缘会带来坏生成。
2. **控制强度过高会牺牲多样性。**：控制强度过高会牺牲多样性。
3. **不同条件类型需要不同训练数据。**：不同条件类型需要不同训练数据。
4. **版权和肖像问题不会因可控生成自动消失。**：版权和肖像问题不会因可控生成自动消失。

## 学到什么

- 可控生成的关键是把用户意图从文本扩展到结构化条件。
- ControlNet 让扩散模型从玩具出图更接近设计工具。
- 它说明“冻结强底座 + 训练控制支路”是高性价比路线。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2302.05543>
- 本卡使用版本：<https://arxiv.org/abs/2302.05543v3>
- 主题关联：[[ddpm]]、[[edm-2022]]、[[dreambooth-2022]]、[[prompt-to-prompt-2022]]

## 关联

- [[ddpm]]
- [[edm-2022]]
- [[dreambooth-2022]]
- [[prompt-to-prompt-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
