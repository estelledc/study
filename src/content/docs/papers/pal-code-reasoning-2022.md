---
title: 'PAL — 让 Python 成为语言模型的草稿纸'
description: '用 PAL 理解 Program-aided Language Models 如何把推理转成可运行代码。'
来源: 'Gao et al., arXiv:2211.10435'
日期: 2026-07-14
分类: LLM / Tool Reasoning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2211.10435v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2211.10435
  source_version: arXiv:2211.10435v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

PAL: Program-aided Language Models 是一篇 LLM / Tool Reasoning 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像数学老师要求你别只写“显然”，而是写一段能跑的 Python 来证明答案。

它在本轮 40 篇里的位置是 **Batch 4 / reasoning prompts**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

自然语言 chain-of-thought 在算术、日期、组合题上容易出现局部算错，但模型又能写出接近正确的程序结构。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 代码形式推理 | 把中间步骤表达为 Python 程序。 |
| 外部解释器 | 用真实执行结果作为答案。 |
| 少样本提示 | 通过示例教模型生成合适代码。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

问“第 100 个偶数是多少”，模型生成 `2 * 100` 比写一段自然语言解释更不容易漂移。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **生成代码可能通过测试但语义不对**：生成代码可能通过测试但语义不对，需要边界样例。
2. **解释器让答案确定**：解释器让答案确定，但不保证题意理解正确。
3. **代码工具对非程序员用户不可见**：代码工具对非程序员用户不可见，产品要把结果解释回自然语言。
4. **沙箱权限、超时和依赖管理是工程必备项。**：沙箱权限、超时和依赖管理是工程必备项。

## 学到什么

- PAL 把“会推理”转成“能执行”，这是 agent 产品的关键转变。
- 工具调用不是 LLM 的外挂，而是可靠性结构。
- 它和 Program of Thoughts 共同奠定了代码执行式推理路线。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2211.10435>
- 本卡使用版本：<https://arxiv.org/abs/2211.10435v2>
- 主题关联：[[program-of-thoughts-2022]]、[[codex-2021]]、[[toolformer]]、[[swe-bench]]

## 关联

- [[program-of-thoughts-2022]]
- [[codex-2021]]
- [[toolformer]]
- [[swe-bench]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
