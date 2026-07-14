---
title: 'Terminal-Bench — 在真实命令行任务里测试 agent'
description: '用 Terminal-Bench 理解终端环境为什么能暴露 agent 的长程执行、环境理解和验证能力。'
来源: 'Merrill et al., arXiv:2601.11868'
日期: 2026-07-14
分类: AI Agent / Terminal Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2601.11868v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2601.11868
  source_version: arXiv:2601.11868v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces 是一个面向命令行 agent 的 benchmark。论文的 Terminal-Bench 2.0 包含 89 个困难任务，每个任务都有独立环境、人类写的参考解法和自动化测试。

类比：[[swe-bench]] 像让 agent 改 GitHub issue，Terminal-Bench 更像把 agent 放进一台陌生服务器，让它读 README、装依赖、改配置、跑命令、检查结果。真正的难点不是“会不会写一行代码”，而是“会不会在终端里把事情办完”。

本卡只基于 arXiv v1 和论文静态阅读整理，没有运行 Terminal-Bench harness，也没有执行任何任务容器。论文分数和错误分析均保持 `UNVERIFIED`。

## 问题是什么

很多 agent benchmark 离真实工作还有距离。问答 benchmark 没有环境，代码 benchmark 常常把任务压成一个 patch，Web benchmark 又容易受界面漂移影响。终端是工程师真实工作最常见的接口之一：文件、进程、依赖、权限、日志、测试都在里面。

Terminal-Bench 问的是：当任务需要多步命令、环境探索、错误恢复和最终测试时，agent 还能稳定完成吗？

这正好补上一轮 study 的一个不足：我们完成了很多 paper note，但对“agent 在真实操作界面里的执行闭环”强调不够。Terminal-Bench 把执行接口收窄到 CLI，让问题更容易复查。

## 为什么重要

- 终端任务天然长程：一个错误命令会影响后续状态。
- 终端任务可测试：每个任务可以用自动测试判断是否完成。
- 终端任务接近真实工程：日志、依赖、文件系统和脚本都在同一环境里。
- 它比纯代码补全更能测 agent 的观察和恢复能力。
- 它给 [[openhands]]、[[swe-agent]] 这类系统提供了比单一 patch 更广的执行靶场。

## 核心方法

| 设计 | 作用 | 工程直觉 |
|---|---|---|
| 89 个 hard tasks | 控制规模但提高任务质量 | 宁可少而难，也不要水题堆数量 |
| unique environment | 每题有独立环境 | 防止 agent 靠记忆或固定脚本过关 |
| human-written solution | 有人类参考路径 | 便于确认任务真实可解 |
| comprehensive tests | 用测试验证终态 | 防止 agent 只输出解释不改环境 |
| error analysis | 分析失败类型 | 找出模型、工具、任务设计的短板 |

我最看重的是“环境 + 测试”的组合。终端 benchmark 如果没有测试，就会变成日志作文；如果没有真实环境，又会退回问答题。Terminal-Bench 把两者绑在一起。

## 论文地形

1. 引言说明现有 benchmark 不够真实或不够难。
2. 数据集章节解释任务来源、环境构建和测试设计。
3. 评测章节比较 frontier models / agents 在 89 个任务上的表现。
4. Error analysis 把失败拆成环境理解、命令选择、恢复、验证等类型。
5. 讨论部分强调发布数据和 harness，方便后续研究复测。

读这篇时要把它当“任务设计论文”看，而不是只看排行榜。它真正贡献的是怎样把终端工作变成可验证 benchmark。

## 手工 toy 复现

我用一个极小终端任务手推它的评价方式：

任务：仓库里有一个 Python CLI，`tests/test_cli.py` 失败。要求 agent 修复并让测试通过。

| agent 行为 | 终端 benchmark 视角 |
|---|---|
| 先 `ls`、读 README、跑测试 | 正常观察环境 |
| 看到 `ModuleNotFoundError` 后安装依赖或修 import | 错误恢复 |
| 改完只解释“不再报错”，不跑测试 | 终态未验证 |
| 为了过测试删除 failing test | 任务违规 |
| 跑 `pytest` 通过且输出文件正确 | 可由 harness 判定成功 |

这个 toy 的重点是：终端 agent 的输出不是一段答案，而是一串会改变环境的动作。评价必须看最终状态，不只看中间文字。

## 评测读法

论文摘要里提到 frontier models and agents 在 benchmark 上低于 65%。我把它理解成：即使模型已经很强，终端里的真实任务仍然有大量失败面。

失败不一定说明模型“不会编程”。它可能卡在依赖安装、路径理解、隐藏测试、状态污染、命令输出太长、或者没有复查最终结果。这些正是 agent 产品里最常见的硬问题。

## 踩过的坑

1. **终端不是文本问答**：命令会改变状态，错误会累积。
2. **通过率不等于安全性**：能完成任务的 agent 也可能乱删文件或执行危险命令。
3. **测试设计很关键**：测试太弱会奖励投机，测试太强会把任务变成猜谜。
4. **环境漂移要管住**：依赖版本、网络、权限都会影响复现。
5. **日志不是证据全部**：最终文件、测试结果和 exit code 才是验收核心。

## 与当前工作的连接

今天就能用：做任何 agent 自动化任务时，都要把“最终状态检查”写成命令，而不是只看 agent 汇报。比如修 bug 至少要有测试、lint 或可复现脚本。

下个月可以用：如果要设计内部 agent 评测，可以从 Terminal-Bench 学“每题独立环境 + 人类参考解 + 自动测试”的三件套，避免把 eval 做成聊天问答。

不要照搬：公开 benchmark 的容器任务不能直接代表公司环境。真实环境还要考虑权限、审计、凭证和安全边界。

## 学到什么

- 终端是 agent 的真实工作台，不只是 shell 工具集合。
- 好 benchmark 要同时有任务、环境、参考解和测试。
- 长程执行失败常常来自状态管理，而不是单步推理。
- 这篇和 [[osworld]] 互补：OSWorld 测 GUI computer use，Terminal-Bench 测 CLI computer use。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2601.11868>
- 本卡使用版本：<https://arxiv.org/abs/2601.11868v1>
- 项目页：<https://www.tbench.ai/>
- [[osworld]]：桌面 GUI agent benchmark。
- [[swe-bench]]：软件工程 issue 修复 benchmark。
- [[agent-planning-benchmark-2026]]：把 agent 失败拆成规划诊断题。

## 关联

- [[osworld]]
- [[swe-bench]]
- [[openhands]]
- [[swe-agent]]
- [[agent-planning-benchmark-2026]]
- [[mle-bench]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
