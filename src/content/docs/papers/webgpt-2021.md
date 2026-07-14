---
title: 'WebGPT — 让模型带着浏览器回答问题'
description: '用 WebGPT 理解检索、引用和人类偏好如何组合成可追溯问答。'
来源: 'Nakano et al., arXiv:2112.09332'
日期: 2026-07-14
分类: LLM / Browser Agent
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2112.09332v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2112.09332
  source_version: arXiv:2112.09332v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

WebGPT: Browser-assisted question-answering with human feedback 是一篇 LLM / Browser Agent 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像开卷考试：学生可以查网页，但必须把引用贴出来，还要让老师判断答案是否真正支持结论。

它在本轮 40 篇里的位置是 **Batch 5 / agents and tools**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

纯参数问答容易编造事实；检索系统能找资料，但不一定会组织成自然答案并标注依据。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 浏览器动作空间 | 模型可以搜索、打开页面、引用片段。 |
| 示范与偏好学习 | 先学人类浏览轨迹，再用偏好优化答案。 |
| 带引用回答 | 输出答案时附上可检查来源。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

问“某论文是哪年发表的”，WebGPT 式 agent 会搜索标题、打开可信页面、引用出版信息，而不是凭记忆猜年份。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **引用存在不代表支持结论**：引用存在不代表支持结论，仍要检查 claim-source 对齐。
2. **搜索结果会受排名和网页质量影响。**：搜索结果会受排名和网页质量影响。
3. **浏览轨迹成本高**：浏览轨迹成本高，实时产品要控制步数。
4. **人类偏好可能偏向流畅答案**：人类偏好可能偏向流畅答案，而不是最严谨答案。

## 学到什么

- WebGPT 是 RAG、browser agent 和 citation QA 的早期汇合点。
- 可追溯回答需要动作记录、来源和偏好训练一起工作。
- 今天的 AI 搜索产品仍在解决同一个 claim grounding 问题。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2112.09332>
- 本卡使用版本：<https://arxiv.org/abs/2112.09332v3>
- 主题关联：[[rag-lewis-2020]]、[[graphrag]]、[[truthfulqa-2021]]、[[react-agent]]

## 关联

- [[rag-lewis-2020]]
- [[graphrag]]
- [[truthfulqa-2021]]
- [[react-agent]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
