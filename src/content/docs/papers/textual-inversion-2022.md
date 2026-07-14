---
title: 'Textual Inversion — 给新概念学一个专属 token'
description: '用 Textual Inversion 理解冻结扩散模型时如何只学习概念 embedding。'
来源: 'Gal et al., arXiv:2208.01618'
日期: 2026-07-14
分类: Diffusion / Personalization
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2208.01618v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2208.01618
  source_version: arXiv:2208.01618v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

An Image is Worth One Word: Personalizing Text-to-Image Generation using Textual Inversion 是一篇 Diffusion / Personalization 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像给家里的猫起一个只有模型懂的外号，以后 prompt 里写这个外号就能召回它的视觉特征。

它在本轮 40 篇里的位置是 **Batch 9 / controllable generation**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

用户想把一个新物体、新风格或新人物概念加入模型，但不想全量微调扩散模型。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 冻结生成模型 | 不更新 diffusion backbone。 |
| 学习新 token embedding | 用少量图片优化一个伪词向量。 |
| 组合式 prompt | 把新 token 和已有文本描述组合使用。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

给 3 张手工陶杯照片，学习 `<my-cup>`，之后写“a watercolor painting of <my-cup> on a desk”。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **一个 embedding 容量有限**：一个 embedding 容量有限，复杂主体可能学不完整。
2. **训练图太少会过拟合**：训练图太少会过拟合，太杂会概念漂移。
3. **组合能力取决于底座模型原有知识。**：组合能力取决于底座模型原有知识。
4. **token 文件传播也可能携带未经授权的主体特征。**：token 文件传播也可能携带未经授权的主体特征。

## 学到什么

- Textual Inversion 是“只调控制向量，不改模型”的图像版 PEFT。
- 它比 DreamBooth 更轻，但表达能力也更有限。
- 个性化生成的最小交付物可以只是一个 embedding。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2208.01618>
- 本卡使用版本：<https://arxiv.org/abs/2208.01618v1>
- 主题关联：[[dreambooth-2022]]、[[prompt-tuning-2021]]、[[controlnet-2023]]、[[edm-2022]]

## 关联

- [[dreambooth-2022]]
- [[prompt-tuning-2021]]
- [[controlnet-2023]]
- [[edm-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
