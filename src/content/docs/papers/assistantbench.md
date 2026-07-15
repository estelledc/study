---
title: 'AssistantBench — 真实耗时 Web 任务里的助手评测'
description: '用 AssistantBench 理解为什么 web agent 不能只测短路径点击，还要测耗时、开放、可自动验收的现实任务。'
来源: 'Yoran et al., arXiv:2407.15711'
日期: 2026-07-15
分类: AI Agent / Assistant Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2407.15711v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2407.15711
  source_version: arXiv:2407.15711v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

AssistantBench: Can Web Agents Solve Realistic and Time-Consuming Tasks? 是一个面向 web agents / language agents 的真实任务 benchmark。它包含 214 个可自动评估的现实任务，例如监控房地产市场、寻找附近符合条件的地点等。

类比：[[webarena]] 像在可控网站里完成任务；AssistantBench 更像用户真的把一个耗时查找任务交给助手：“帮我持续查、比较、过滤，最后给我可核验答案”。它更强调开放网页、耗时和事实核验。

本卡只基于 arXiv v2 和论文静态阅读整理，没有运行 SeePlanAct，也没有执行 AssistantBench 任务。论文中“无模型超过 26 分”等结果保持 `UNVERIFIED`。

## 问题是什么

很多 web agent benchmark 任务很短：点几步、填表、提交。真实助手任务常常更烦：要搜多个网页、比较候选、处理过期信息、排除不满足条件的选项，并给出可验证结果。

AssistantBench 的问题是：当前 language agents 能不能解决真实、耗时、开放网页上的任务？

这补上了上一轮不足：上一轮有 [[webarena]] 和 [[mind2web]]，但它们更偏环境和轨迹；AssistantBench 更偏“用户真的会把这类任务交给助手”的现实需求。

## 为什么重要

- 它把 web agent 评测从短交互推进到耗时真实任务。
- 它覆盖 214 个可自动评估的任务，避免完全人工评分。
- 它揭示闭卷模型、RAG、web agent 各自的弱点。
- 它强调 precision：不要为了回答而幻觉事实。
- 它提出 SeePlanAct，尝试让 agent 先看、再规划、再行动。

## 核心方法

| 组件 | 作用 | 我怎么理解 |
|---|---|---|
| realistic tasks | 来源接近日常真实需求 | 不只是模拟网页点击 |
| time-consuming | 需要多步搜索和比较 | 测耐心和过程管理 |
| automatic evaluation | 可程序化判断答案 | 减少主观打分 |
| SeePlanAct | see / plan / act 结构 | 给 web agent 一个更明确的执行节奏 |

AssistantBench 的价值在于“任务形态”。它告诉我们：很多助手任务难不是因为某一步深奥，而是因为搜索空间大、信息会变、条件很多、验收要精确。

## 论文地形

1. 引言说明真实 web 助手任务和现有 benchmark 的差距。
2. Benchmark 章节介绍 214 个任务、领域和自动评估方式。
3. Baseline 章节比较闭卷 LM、RAG 和 web agents。
4. SeePlanAct 章节提出更结构化的 agent 方法。
5. 分析章节讨论幻觉、低 precision、网页执行失败等问题。

读这篇时，要特别看它怎么平衡“真实任务”和“自动评估”。完全真实的任务往往难自动验收；完全可验收的任务又容易变成玩具。

## 手工 toy 复现

我用一个 AssistantBench-like 任务模拟：

任务：找出某城市未来两周内三个“周末开放、评分 4.5 以上、适合带小孩”的室内活动，并给出官网链接。

| 子步骤 | 难点 |
|---|---|
| 搜索活动网站 | 网页来源分散 |
| 判断日期 | 需要解析时间和周末 |
| 过滤评分 | 信息可能在第三方网站 |
| 判断适合小孩 | 需要综合描述 |
| 去重和排序 | 同一活动可能多个页面 |
| 给出官网链接 | 不能只给聚合页 |

这题每一步都不难，但完整做下来很耗时。AI 容易为了快速回答而编活动、忽略日期、或者给错链接。

## 评测读法

论文摘要里提到闭卷 LMs accuracy 不错但 precision 低，state-of-the-art web agents 接近零分。我读这类结果时会重点看 precision：助手不能为了覆盖率乱答。

在真实产品里，“没找到”通常比“编一个看似合理的答案”更安全。AssistantBench 的价值就是让这种差别进入评测。

## 踩过的坑

1. **不要只看 accuracy**：web 助手乱答会伤害用户信任。
2. **不要低估时间成本**：真实任务的难点常是持续查找和筛选。
3. **不要把 RAG 当 web agent**：RAG 能答知识，不一定能完成开放网页任务。
4. **不要忽略可验收性**：没有自动检查，很难规模化比较 agent。
5. **不要把 open web 当稳定数据库**：网页会变、信息会过期。

## 与当前工作的连接

今天就能用：设计助手任务时，把“答案必须可核验”和“允许回答不知道”写进评分标准。

下个月可以用：如果要做研究助手或网页助手 eval，可以用 AssistantBench 思路选题：用户真实会外包、耗时、可自动或半自动验证。

不要照搬：开放网页任务会遇到地区、语言、时间和访问限制。内部使用时要固定访问时间和来源策略。

## 学到什么

- 真正的 web 助手任务往往耗时而不是高深。
- Precision 比“看起来回答了”更重要。
- AssistantBench 和 [[gaia]] 都强调现实助手能力，但 AssistantBench 更聚焦 open web。
- 它补齐了 [[webarena]] 的短交互环境之外的长任务视角。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2407.15711>
- 本卡使用版本：<https://arxiv.org/abs/2407.15711v2>
- [[gaia]]：通用助手能力 benchmark。
- [[webarena]]：可复现网页环境。
- [[mind2web]]：跨网站泛化数据集。
- [[browsergym]]：统一浏览器 agent 评测生态。

## 关联

- [[gaia]]
- [[webarena]]
- [[mind2web]]
- [[browsergym]]
- [[react-agent]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
