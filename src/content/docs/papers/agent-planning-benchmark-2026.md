---
title: 'Agent Planning Benchmark — 把 agent 失败拆成规划诊断题'
description: '用 APB 拆解 LLM agent 的规划、反馈修正、工具噪声和无解任务校准。'
来源: 'Sun et al., arXiv:2606.04874'
日期: 2026-07-14
分类: AI Agent / Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2606.04874v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2606.04874
  source_version: arXiv:2606.04874v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Agent Planning Benchmark（APB）是一套专门测 **LLM agent 规划能力** 的诊断 benchmark。它不只看任务最后有没有成功，而是把任务拆成：能不能整体规划、能不能根据反馈逐步改计划、能不能在多余工具、坏工具和无解任务里保持清醒。

类比：很多 agent benchmark 像只看外卖有没有送到；APB 更像检查骑手有没有先选路线、遇到封路会不会改道、餐厅关门时会不会承认送不了。

论文给出的规模是 4,209 个多模态 case，覆盖 22 个 domain 和 5 类 setting；还用 ToolSandbox 与 tau2-bench 的任务做外部验证，观察 APB 引导的 refinement 是否能迁移到执行指标。

## 问题是什么

传统 agent benchmark 的问题是“结果太厚”：一个失败样本里可能同时有坏计划、坏工具、坏反馈处理和坏拒绝校准，但总分只告诉你失败了。

APB 试图把这团失败拆开。它问的是：在还没执行之前，计划本身是不是已经偏了；在执行反馈回来之后，agent 有没有真正更新计划；面对坏工具和无解任务，agent 是否能停下来而不是继续编。

这让 APB 更像诊断仪，而不是排行榜。它不替代执行 benchmark，但能告诉你应该修 planner、tool selector，还是 refusal policy。

## 为什么重要

Agent 的失败常常混在一起：模型可能不会计划，也可能工具执行坏了，也可能环境反馈误导它。只看 end-to-end success，会把这些原因压成一个分数。

APB 的价值在于把失败前移到 execution 之前：先问“计划本身是否合理”。这对调试 agent 很关键，因为一个坏计划即使交给最稳定的工具，也只会稳定地失败。

它和 [[react]]、[[toolformer]]、[[swe-bench]] 的关系是：ReAct 给了 think-act-observe 循环，Toolformer 讨论工具学习，SWE-bench 测真实修 bug；APB 更像这些系统前面的规划体检表。

## 核心方法

APB 把规划拆成五个诊断面：

| 面向 | 问的问题 |
|---|---|
| holistic planning | 一开始能不能给出完整可执行路线 |
| step-wise planning | 得到反馈后能不能调整下一步 |
| extraneous tools | 多给一堆无关工具时会不会被诱导 |
| broken tools | 工具坏掉时会不会找替代路径 |
| unsolvable tasks | 任务无解时会不会校准拒绝 |

这个拆法很像软件测试里的“单元测试 + 集成测试”。End-to-end benchmark 是集成测试，APB 是给 planning 模块补单元测试。

## 手工 toy 复现

我用一个极小任务手推 APB 的评分思路：

任务：用户要“把 CSV 里的金额求和并发邮件”，可用工具有 `read_csv`、`sum_column`、`send_email`、`draw_chart`。坏工具版本里 `sum_column` 返回错误。

| agent 输出 | APB 视角 |
|---|---|
| 先 `read_csv`，再 `sum_column(amount)`，最后 `send_email` | holistic planning 通过 |
| 被 `draw_chart` 吸引，先画图再求和 | extraneous tool robustness 失败 |
| `sum_column` 报错后，改为读取行并手动累加 | broken tool setting 通过 |
| CSV 根本不存在还继续编结果 | unsolvable task / refusal 失败 |

这个 toy 不能替代论文实验，只说明 APB 的核心：评分对象不是最终邮件，而是“计划有没有在约束下保持正确”。

## 踩过的坑

1. **规划正确不等于执行成功**：APB 是上游诊断，不能把 APB 高分直接解释成真实环境高成功率。
2. **无解任务很容易被忽略**：agent 产品里最危险的不是不会做，而是不会说“做不了”。
3. **多余工具是现实噪声**：真实 MCP / IDE / 浏览器环境里工具列表经常很长，规划 benchmark 不测工具噪声就太乐观。

## 学到什么

APB 给我的最大提醒是：agent eval 不应该只有一个总分。规划、工具选择、反馈修正、拒绝校准都应该分开看。

对 study 的 agent 线来说，这篇可以接在 [[react]] 后面读：ReAct 解释循环形状，APB 问这个循环里的“plan”到底有没有质量。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2606.04874>
- [[react]]：think-act-observe 的基本循环。
- [[swe-bench]]：真实软件工程任务的下游执行 benchmark。
- [[toolformer]]：工具使用能力的另一条训练路线。

## 关联

- [[react]]
- [[toolformer]]
- [[swe-bench]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
