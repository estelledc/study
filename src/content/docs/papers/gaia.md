---
title: 'GAIA — 通用 AI 助手的现实任务基准'
description: '用 GAIA 理解为什么真正的助手能力不等于专业考试高分，而是能组合推理、多模态、浏览和工具。'
来源: 'Mialon et al., arXiv:2311.12983'
日期: 2026-07-15
分类: AI Agent / General Assistant Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2311.12983v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2311.12983
  source_version: arXiv:2311.12983v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

GAIA: a benchmark for General AI Assistants 是一个评估通用 AI 助手的 benchmark。它的任务不是考模型会不会解专业题，而是问：面对现实世界里概念上不难、但需要组合推理、多模态、网页浏览和工具使用的问题，AI 助手能不能稳稳做完。

类比：很多考试 benchmark 像奥数竞赛；GAIA 更像生活里的“帮我查清楚这件事并给出可验证答案”。人类觉得不难，但需要会找资料、会看图、会算、会核对、会使用工具。

本卡只基于 arXiv v1 和论文静态阅读整理，没有下载 GAIA 数据集，也没有运行任何 agent。论文中的人类 92% vs GPT-4 with plugins 15% 等结果保持 `UNVERIFIED`。

## 问题是什么

LLM 在法律、化学、数学等专业考试上已经能超过很多人类，但这不代表它是好助手。真实助手任务往往不是“知道某个专业知识点”，而是把多个简单能力串起来：查网页、读表格、看图片、做简单计算、判断答案是否唯一。

GAIA 的问题是：如果把任务设计成“人类容易、AI 难”，我们能不能更准确地衡量通用助手离真实可用还有多远？

这正好总结上一轮的不足：上一轮补了 [[webarena]]、[[mind2web]]、[[appworld]]、[[toolsandbox]]，但它们分别测网页、数据集、多 App、工具调用。GAIA 更像把这些能力放到一个助手任务里综合考。

## 为什么重要

- 它反对只追“人类也很难”的专业考试 benchmark。
- 它强调现实任务的组合性：浏览、多模态、推理、工具一起出现。
- 它把“简单但烦”的任务作为 AGI / assistant 的重要门槛。
- 它能解释为什么模型专业题很强，做真实助理仍然不稳。
- 它给后续 [[assistantbench]] 这类耗时任务 benchmark 提供了思想背景。

## 核心方法

| 设计 | 作用 | 我怎么理解 |
|---|---|---|
| real-world questions | 贴近日常或知识工作问题 | 避免纯学术题 |
| simple for humans | 人类不需要博士训练 | 测 robust assistant，而非专家记忆 |
| multi-ability requirement | 推理、多模态、网页、工具组合 | 测能力编排 |
| exact answer | 答案可核验 | 避免开放式主观评分 |

GAIA 的关键哲学是“不要把 benchmark 做得只剩模型擅长的考试”。真正有用的助手要能把普通人会做但耗时间的任务稳定做完。

## 论文地形

1. 引言解释为什么专业考试高分不能代表通用助手能力。
2. Benchmark 设计说明任务的能力组合和答案验证方式。
3. Human / model comparison 展示人类和 GPT-4 with plugins 的差距。
4. 分析部分讨论不同能力维度对任务成功的影响。
5. 结论把 GAIA 作为通用助手研究的里程碑式评估。

读这篇时，我会特别看它的任务选择哲学：不是追更难的专业题，而是追“真实、可验证、组合能力”的任务。

## 手工 toy 复现

我用一个极小 GAIA-like 任务手推：

任务：找出某张会议照片里左侧海报对应论文的第一作者，并给出该作者所在机构。

| 子能力 | 人类怎么做 | AI 助手要做什么 |
|---|---|---|
| 看图 | 读海报标题 | 多模态 OCR / 图像理解 |
| 搜索 | 搜论文标题 | web browsing |
| 核对 | 匹配会议和年份 | 避免搜错同名论文 |
| 抽取 | 找第一作者 | 文档理解 |
| 再搜索 | 查作者机构 | 多跳检索 |
| 输出 | 给出简洁答案和来源 | 可验证回答 |

这题对人类不难，但 AI 容易在任一环节错：看错字、搜错论文、把现在机构当发表机构、或不提供可核验来源。

## 评测读法

GAIA 论文摘要里的人类 92% vs GPT-4 with plugins 15% 很有冲击力。我不会把它理解成“GPT-4 很弱”，而是理解成：真实助手任务要求的是稳定编排，而不是单点能力。

一个模型可以会推理、会看图、会搜索，但只要不能把这些能力可靠串起来，GAIA 就会给低分。这对 agent 产品很重要，因为用户关心的是最后答案对不对，而不是中间某一步看起来聪明。

## 踩过的坑

1. **不要把专业考试高分等同助手能力**：助手任务更看组合和核验。
2. **不要只看最终答案**：没有来源或中间证据的答案很难信。
3. **不要低估简单任务的长链错误**：每一步 90% 准确，串 6 步就会明显掉。
4. **不要忽略多模态输入**：真实任务常把文字、图像、网页混在一起。
5. **不要把 GAIA 当唯一 AGI 标尺**：它是重要切片，不是完整人类能力。

## 与当前工作的连接

今天就能用：评估一个 AI 助手时，设计 5 个“人类 5 分钟能查到但需要多步核验”的任务，比只问知识题更有价值。

下个月可以用：给 study 或内部 agent 建 eval 时，可以按 GAIA 思路拆能力：浏览、文件、多模态、计算、引用核验，每题至少跨两项。

不要照搬：GAIA 题目可能依赖公开网页状态。企业场景还要处理私有知识库、权限和引用可见性。

## 学到什么

- 通用助手能力的核心是能力编排。
- “人类容易、AI 难”是很好的 benchmark 设计方向。
- GAIA 把 [[webarena]]、[[toolsandbox]]、[[visualwebarena]] 等单项能力放到更高层视角里。
- 对 study 图谱来说，它是 assistant eval 的总入口之一。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2311.12983>
- 本卡使用版本：<https://arxiv.org/abs/2311.12983v1>
- [[assistantbench]]：更强调耗时、真实 web task。
- [[webarena]]：可复现网页环境。
- [[toolsandbox]]：状态化工具调用评测。
- [[visualwebarena]]：视觉网页任务评测。

## 关联

- [[assistantbench]]
- [[webarena]]
- [[toolsandbox]]
- [[visualwebarena]]
- [[react-agent]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
