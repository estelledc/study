---
title: 'Inner Monologue — 让机器人把观察结果说回计划里'
description: '用 Inner Monologue 理解闭环反馈如何让语言计划接上真实环境变化。'
来源: 'Huang et al., arXiv:2207.05608'
日期: 2026-07-14
分类: LLM Agent / Robotics
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2207.05608v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2207.05608
  source_version: arXiv:2207.05608v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Inner Monologue: Embodied Reasoning through Planning with Language Models 是一篇 Embodied AI / Robotics 论文。本卡只基于 arXiv 官方元数据和论文静态阅读做研究整理；没有运行作者代码，也没有复现论文分数。

类比：像搬家时一边做一边自言自语：“箱子太重，先找推车；门关着，先开门。”这些反馈会改变下一步。

它在本轮 40 篇里的位置是 **Batch 5 / agents and tools**：不是孤立收藏，而是补上 study 论文图谱里还缺的一块。

## 问题是什么

只生成一次性计划的机器人容易在环境变化、动作失败或目标不清时卡住。

如果把它放进产品工程语境，核心问题是：团队到底应该把不确定性留给模型本身，还是拆给数据、工具、训练目标、评测和系统约束分别处理。

## 为什么重要

- 它给后续研究提供了一个可引用的名字和问题边界。
- 它把一个模糊能力拆成了可以讨论的机制或流程。
- 它提醒我们不要只看最终 benchmark，而要看数据、约束和验收方式。
- 它能和本库已有笔记形成交叉链接，方便以后按主题复习。

## 核心方法

| 设计 | 作用 |
|---|---|
| 语言化反馈 | 把视觉、成功/失败和环境状态转成文本。 |
| 循环计划 | LLM 根据新反馈继续生成下一步。 |
| 多来源上下文 | 把人类指令、机器人状态和观察合并进 prompt。 |

这三点合在一起，给这篇论文建立了一个最小可理解模型：先看它把问题切在哪里，再看它把哪部分交给模型、哪部分交给外部结构。

## 手工 toy 复现

机器人计划“拿杯子”，执行后反馈“抓取失败，杯子太远”。下一轮计划变成“移动到桌边再抓取”，而不是重复失败动作。

这个 toy 复现只验证机制直觉，不声明论文原始指标已复现。真正升级为 VERIFIED 需要独立执行证据和 review receipt 绑定。

## 踩过的坑

1. **反馈文本如果不准**：反馈文本如果不准，会把模型带偏。
2. **循环越长**：循环越长，prompt 越容易积累噪声。
3. **语言化观察会丢失细节**：语言化观察会丢失细节，不能替代底层控制和感知。
4. **失败恢复需要策略边界**：失败恢复需要策略边界，不能无限重试。

## 学到什么

- agent 的“内心独白”本质是状态回流机制。
- 闭环比一次性计划更接近真实机器人和电脑操作。
- 软件工作流里的日志、测试、截图也可以看作 inner monologue。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2207.05608>
- 本卡使用版本：<https://arxiv.org/abs/2207.05608v1>
- 主题关联：[[saycan-2022]]、[[react-agent]]、[[osworld]]、[[agent-planning-benchmark-2026]]

## 关联

- [[saycan-2022]]
- [[react-agent]]
- [[osworld]]
- [[agent-planning-benchmark-2026]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
