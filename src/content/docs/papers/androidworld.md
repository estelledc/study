---
title: 'AndroidWorld — 动态 Android 环境里的移动端 agent 评测'
description: '用 AndroidWorld 理解移动 GUI agent 为什么需要真实 App、动态任务、初始化和成功检查，而不只是截图问答。'
来源: 'Rawles et al., arXiv:2405.14573'
日期: 2026-07-15
分类: AI Agent / Mobile GUI Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2405.14573v5
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2405.14573
  source_version: arXiv:2405.14573v5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v5
---

## 是什么

AndroidWorld: A Dynamic Benchmarking Environment for Autonomous Agents 是一个面向 Android 移动端 agent 的动态 benchmark 环境。它提供一个功能性 Android 环境，覆盖 20 个真实 Android apps、116 个程序化任务，并为每个任务提供初始化、成功检查和清理逻辑。

类比：[[osworld]] 像让 agent 操作桌面电脑；AndroidWorld 像给 agent 一台 Android 手机，让它打开 App、点按钮、填表、改设置，然后用系统状态检查任务是否真的完成。

本卡只基于 arXiv v5 和论文静态阅读整理，没有运行 Android emulator，也没有执行 AndroidWorld task。所有结果保持 `UNVERIFIED`。

## 问题是什么

移动端 GUI agent 不能只靠截图问答评估。真实手机任务有 App 状态、权限弹窗、软键盘、滚动列表、系统设置、通知和跨 App 信息。静态截图很难覆盖这些交互。

AndroidWorld 的问题是：能不能构造一个真实、可复现、动态生成任务的 Android 环境，让 agent 的移动端操作能力可以被程序化评估？

这补上了前几轮的空白：我们已经有 [[webarena]] 的网页环境、[[visualwebarena]] 的视觉网页、[[terminal-bench]] 的命令行和 [[osworld]] 的桌面；AndroidWorld 把同一套思路带到移动端。

## 为什么重要

- 移动端是最常见的人机界面之一，不能只测浏览器和桌面。
- 它使用真实 Android apps，而不是纯玩具 UI。
- 动态任务参数化能减少背题和固定脚本。
- 每个任务有初始化、成功检查和清理，利于复现。
- 它为移动端 GUI agent 提供了标准化环境。

## 核心方法

| 组件 | 作用 | 工程直觉 |
|---|---|---|
| fully functional Android environment | 提供真实交互环境 | agent 真的操作手机 |
| 20 real-world apps | 覆盖多种 App 形态 | 不只测一个 toy app |
| 116 programmatic tasks | 用程序定义任务和奖励 | 自动验收 |
| dynamic construction | 参数化生成自然语言任务 | 降低记忆固定测试集 |
| init / success / teardown | 控制前后状态 | 保证可复现 |

我最看重 init / success / teardown。移动端状态很容易污染：登录状态、列表内容、输入框残留、权限弹窗都会影响下一次测试。没有状态管理，benchmark 很快就不可复现。

## 论文地形

1. 引言说明 realistic and reproducible benchmark 对 computer-use agent 的重要性。
2. Environment 章节介绍 AndroidWorld 的 App、任务和交互方式。
3. Task logic 说明初始化、成功检查和清理逻辑。
4. Baseline 章节评估若干 agent，并展示初始结果。
5. 讨论部分分析动态任务、复现性和移动端困难。

读这篇时，要把它当作移动端 eval 工程论文：任务怎么生成、状态怎么复原、成功怎么判，比单个 agent 分数更重要。

## 手工 toy 复现

我用一个极小 AndroidWorld-like 任务手推：

任务：在联系人 App 里给 Alice 添加生日备注，并在日历 App 里创建提醒。

| 阶段 | 环境要做什么 | agent 要做什么 |
|---|---|---|
| init | 创建 Alice 联系人，清空相关日历事件 | 确保起点一致 |
| instruction | “给 Alice 加生日并创建提醒” | 理解跨 App 任务 |
| action | 打开联系人、编辑备注、打开日历、建事件 | GUI 操作 |
| success check | 查询联系人备注和日历数据库 | 程序化验收 |
| teardown | 清理联系人和事件 | 避免污染下一题 |

这说明移动 agent benchmark 不是“看一张图点哪里”就够了。真正难的是状态管理和终态检查。

## 评测读法

AndroidWorld 的结果要按三类失败读：

1. **感知失败**：看不懂按钮、列表、输入框或弹窗。
2. **动作失败**：点错、输入错、没处理软键盘。
3. **状态失败**：看似完成，但系统状态没有改变到目标。

这三类分别对应模型视觉能力、action grounding、环境反馈和验证机制。只看总成功率会丢掉这些调试信息。

## 踩过的坑

1. **不要把移动端当小屏网页**：App 有系统控件、权限、通知和键盘。
2. **不要忽略状态污染**：一次失败可能影响后续任务。
3. **不要只看截图**：最终状态需要程序化检查。
4. **不要低估动态任务**：参数变化能暴露 hard-coded agent。
5. **不要把 emulator 成功等同真机成功**：真实设备还有性能、输入和网络差异。

## 与当前工作的连接

今天就能用：做移动端自动化时，要把任务拆成 init / action / success / teardown。没有 teardown，很难稳定回归。

下个月可以用：如果要设计 iOS / Android agent eval，可以借鉴 AndroidWorld 的任务结构，但用本地安全假数据和可控 App。

不要照搬：真实手机任务涉及隐私、账号和系统权限。公开 benchmark 的可控环境不能直接等同真实用户设备。

## 学到什么

- 移动 GUI agent 的核心难点是动态状态和真实 App。
- 好的移动 benchmark 要有初始化和清理逻辑。
- AndroidWorld 与 [[osworld]] 共同构成 computer-use agent 的桌面 / 移动双线。
- 它把前几轮 web / terminal / app eval 扩展到移动端。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2405.14573>
- 本卡使用版本：<https://arxiv.org/abs/2405.14573v5>
- [[osworld]]：桌面 GUI computer-use benchmark。
- [[visualwebarena]]：视觉网页任务。
- [[terminal-bench]]：终端 agent 环境。
- [[browsergym]]：浏览器 agent 统一环境。

## 关联

- [[osworld]]
- [[visualwebarena]]
- [[terminal-bench]]
- [[browsergym]]
- [[webarena]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
