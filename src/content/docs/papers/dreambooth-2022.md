---
title: 'DreamBooth — 用几张图把一个新主体塞进生成模型'
description: '用 DreamBooth 理解 subject-driven generation 怎样让扩散模型记住特定对象。'
来源: 'Ruiz et al., arXiv:2208.12242'
日期: 2026-07-14
分类: Diffusion / Personalization
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2208.12242v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2208.12242
  source_version: arXiv:2208.12242v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

DreamBooth: Fine Tuning Text-to-Image Diffusion Models for Subject-Driven Generation 是一篇 Diffusion / Personalization 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像让画师看几张你家杯子的照片，然后能把同一个杯子画到海边、办公室和油画风场景里。

它在本轮 40 篇里的位置是 **Batch 9 / controllable generation**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

文本到图像模型知道“狗”或“背包”，但不知道用户指定的那一只狗或那一个背包。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 稀有 token 绑定主体 | 用特殊词指代新主体。 |
| 少样本微调 | 用几张主体图片调整模型。 |
| Prior preservation | 防止模型把整个类别都过拟合成这个主体。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

输入 5 张同一只玩具熊照片，学习 token `sks bear`，之后 prompt“sks bear wearing sunglasses”生成同主体新场景。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **过拟合会让主体只能复刻训练照片姿势。**：过拟合会让主体只能复刻训练照片姿势。
2. **prior preservation 不足会污染通用类别。**：prior preservation 不足会污染通用类别。
3. **个人主体生成涉及肖像权和授权边界。**：个人主体生成涉及肖像权和授权边界。
4. **微调成本比 Textual Inversion 更高。**：微调成本比 Textual Inversion 更高。

## 学到什么

- 个性化生成需要在“记住主体”和“保留模型常识”之间平衡。
- DreamBooth 是生成式产品商业化的重要技术节点。
- 少样本定制越强，滥用和版权治理越重要。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2208.12242>
- 本卡使用版本：<https://arxiv.org/abs/2208.12242v2>
- 主题关联：[[textual-inversion-2022]]、[[controlnet-2023]]、[[ddpm]]、[[edm-2022]]

## 关联

- [[textual-inversion-2022]]
- [[controlnet-2023]]
- [[ddpm]]
- [[edm-2022]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
