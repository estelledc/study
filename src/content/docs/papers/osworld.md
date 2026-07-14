---
title: 'OSWorld — 把 GUI agent 放进真正的电脑里考试'
description: '用 OSWorld 理解为什么电脑操作 agent 不能只在网页或脚本环境里评测。'
来源: 'Xie et al., arXiv:2404.07972'
日期: 2026-07-14
分类: AI Agent / Computer Use
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2404.07972v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2404.07972
  source_version: arXiv:2404.07972v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

OSWorld 是一个评测 **多模态电脑操作 agent** 的 benchmark。它不是让模型回答题目，也不是只在网页 DOM 里点按钮，而是把 agent 放进真实操作系统和真实应用里，让它完成开放式电脑任务。

类比：普通网页 benchmark 像在驾校封闭场地开车；OSWorld 像把车开到真实城市道路，红绿灯、行人、导航、停车、临时施工都会一起出现。

论文给出的核心规模是 369 个真实电脑任务，覆盖 web app、desktop app、文件系统 I/O，以及跨多个应用的 workflow。环境支持 Ubuntu、Windows 和 macOS，并为每个任务提供初始状态设置和执行式评测脚本。

## 问题是什么

很多 agent benchmark 的环境太干净：要么没有真正交互环境，要么只覆盖单一网站或单一应用。这样测出来的分数会高估 agent 的现实能力，因为真实电脑使用需要同时处理视觉定位、窗口状态、文件路径、菜单层级、应用切换和长步骤计划。

OSWorld 把评测对象从“会不会调用某个 API”推进到“会不会真的操作一台电脑”。这对 GUI agent 很关键，因为用户要的不是 click sequence，而是任务完成：下载文件、编辑表格、改设置、跨应用搬运信息。

## 为什么重要

OSWorld 的结果很刺眼：人类能完成 72.36% 以上任务，而论文评测中的最好模型只有 12.24% 成功率。这个差距说明，当时的多模态 agent 还没有接近“电脑助手”的产品线。

更重要的是，OSWorld 把失败原因具体化为 GUI grounding 和 operational knowledge。前者是“看见按钮但点不准”，后者是“不知道这个软件该怎么操作”。这两个问题在普通文本 benchmark 里很难暴露。

它和 [[mcp-bench-2025]]、[[mcpworld-2025]] 的关系是：MCP 线看工具协议和 tool invocation，OSWorld 看完整电脑环境。两者合在一起，才接近真实 AI 助手的工作面。

## 核心方法

OSWorld 的关键设计是三件事：

| 设计 | 作用 |
|---|---|
| 真实操作系统环境 | 任务发生在真正的桌面、应用和文件系统里 |
| 任务初始状态配置 | 每个 case 可以从可复现的起点开始 |
| 执行式评测脚本 | 不只看 agent 说了什么，而是检查系统终态是否正确 |

这套设计让 OSWorld 比“截图问答”更接近端到端电脑使用。agent 必须观察屏幕、决定动作、执行点击或输入，再从新屏幕继续判断。

## 手工 toy 复现

我用一个极小任务手推 OSWorld 的评测逻辑：

任务：打开文件管理器，把 `report.txt` 复制到 `Archive` 文件夹，并确认文件存在。

| 阶段 | agent 需要做什么 | OSWorld 式检查 |
|---|---|---|
| setup | 初始桌面和文件夹存在 | 环境脚本准备状态 |
| act | 打开文件管理器、定位文件、复制或拖拽 | GUI grounding + 操作知识 |
| evaluate | 检查 `Archive/report.txt` 是否存在 | 执行式终态评测 |

这个 toy 说明：OSWorld 不奖励“我会复制文件”的文字回答，只奖励真实环境里的正确状态变化。

## 踩过的坑

1. **把截图理解当电脑使用**：看懂截图只是第一步，真实任务还要跨应用、跨窗口和跨时间。
2. **把 click 成功当任务成功**：按钮点到了不代表终态正确，评测必须看文件、设置或应用状态。
3. **只优化网页 agent 会偏科**：浏览器任务不能覆盖桌面软件、文件系统和系统设置。
4. **延迟和效率不能忽略**：OSWorld 原文先突出成功率，但真实产品还要继续看耗时和动作数，这也是后续 OSWorld-Human 的动机。

## 学到什么

OSWorld 给 agent 评测立了一条底线：如果目标是电脑助手，就必须在电脑里验收，而不是只在文本、API 或单网页里验收。

对 study 的 agent 线来说，它补上了 [[agent-planning-benchmark-2026]] 的下游环境：APB 诊断规划，OSWorld 验证规划能否穿过真实 GUI 和应用状态。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2404.07972>
- 项目页：<https://os-world.github.io/>
- [[mcpworld-2025]]：MCP 工具世界的 benchmark。
- [[agent-planning-benchmark-2026]]：规划质量的上游诊断。

## 关联

- [[mcpworld-2025]]
- [[mcp-bench-2025]]
- [[agent-planning-benchmark-2026]]
- [[react-agent]]
- [[swe-agent]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
