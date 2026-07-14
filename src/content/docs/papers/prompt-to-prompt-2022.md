---
title: 'Prompt-to-Prompt — 改词不改构图的 cross-attention 编辑'
description: '用 Prompt-to-Prompt 理解扩散模型里文本 token 和图像布局如何对齐。'
来源: 'Hertz et al., arXiv:2208.01626'
日期: 2026-07-14
分类: Diffusion / Editing
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2208.01626v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2208.01626
  source_version: arXiv:2208.01626v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Prompt-to-Prompt Image Editing with Cross Attention Control 是一篇 Diffusion / Editing 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像在设计稿里把“红色汽车”改成“蓝色汽车”，但不希望车的位置、角度和背景全变。

它在本轮 40 篇里的位置是 **Batch 9 / controllable generation**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

扩散模型对 prompt 很敏感，小改一句话常导致整张图构图重排，编辑不可控。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| Cross-attention map | 利用文本 token 到图像区域的注意力关系。 |
| Attention 替换/冻结 | 编辑某些词时保留原布局注意力。 |
| 局部语义修改 | 让对象属性变，整体结构尽量不变。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

原 prompt“a cat sitting on a bench”，改成“a dog sitting on a bench”。保留 bench 和姿态 attention，只替换 cat/dog 相关区域。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **attention map 不是完美解释**：attention map 不是完美解释，复杂场景会错绑区域。
2. **大幅语义改动无法保证构图不变。**：大幅语义改动无法保证构图不变。
3. **方法依赖特定扩散采样和 cross-attention 结构。**：方法依赖特定扩散采样和 cross-attention 结构。
4. **局部编辑仍可能产生边界伪影。**：局部编辑仍可能产生边界伪影。

## 学到什么

- Prompt-to-Prompt 把 prompt 编辑从随机试词推进到可控 attention 操作。
- 生成模型的可编辑性来自中间表示，而不只是最终图片。
- 设计工具需要“保留什么”和“改变什么”的显式控制面。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2208.01626>
- 本卡使用版本：<https://arxiv.org/abs/2208.01626v1>
- 主题关联：[[controlnet-2023]]、[[textual-inversion-2022]]、[[ddim-2020]]、[[ddpm]]

## 关联

- [[controlnet-2023]]
- [[textual-inversion-2022]]
- [[ddim-2020]]
- [[ddpm]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
