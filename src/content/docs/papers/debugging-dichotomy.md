---
title: Debugging Dichotomy — 程序员真实 debug 行为分两轨
来源: 'Beller, Spruit, Spinellis, Zaidman, "On the Dichotomy of Debugging Behavior Among Programmers", ICSE 2018'
日期: 2026-05-29
分类: 软件工程实证
难度: 中级
---

## 是什么

Debugging Dichotomy（**调试二分法**）是一篇 2018 年 ICSE 论文，**第一次用 IDE 插件偷偷记录 458 个真实程序员 18 个月的调试行为**，然后发现：大家平时 debug 的样子，跟教科书讲的完全不一样。日常类比：像在饭店天花板装了 18 个月摄像头，然后告诉你顾客其实不爱吃招牌菜。

最反直觉的两个数字：

- **65% 的调试会话不到 1 分钟**——绝大多数 bug 是"看一眼就改完"
- **只有 38% 的人用过断点（breakpoint）**，但 81% 的人用 print，92% 的人靠读源码

IDE 厂商把大部分研发预算砸在断点 / step / watch 这些"重型武器"上，但用户其实在用最朴素的 print 和肉眼读代码。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么前辈对你说"用 print 是新手，用 debugger 才专业"——这句话**没有数据支撑**
- 为什么你身边老程序员日常也在 `console.log` / `print(x)`，并不显得"不专业"
- 为什么 2020s 之后 observability / 结构化日志 / LLM debug agent 火起来——它们都是"读代码 + print" 流派的工程化升级
- 为什么你 IDE 里那些花哨的 conditional breakpoint / time-travel debug 功能你从没点开过——只有 8% / 3% 的人用

## 核心要点

Beller 的发现可以拆成 **三条**：

1. **调试时长是双峰长尾**：不是正态分布，是"绝大多数 < 1 分钟 + 少数 > 30 分钟"两个山峰。类比：餐厅顾客停留时间——大多数 5 分钟（外带），少数 2 小时（约会），中间空着。用单一均值描述这种分布会得出错误结论。

2. **断点是少数派工具**：在调试操作里，断点只排第 5。前 4 名是读源码（92%）/ print（81%）/ 单步（64%）/ watch 变量（58%）。类比：以为大家做菜都用电烤箱，结果大多数人只用菜刀和锅。

3. **两轨调试模式**：Track 1 短确认型（< 1 分钟，print + 读源）+ Track 2 深度调查型（> 30 分钟，断点 + step + watch）。类比：医院里 80% 是挂号开药 5 分钟搞定，5% 是住院手术几小时。

加起来就是论文标题的 **dichotomy（二分法）**——调试不是单一活动，是两类活动共用一个名字。

## 实践案例

### 案例 1：WatchDog 插件怎么悄悄记录你

研究者写了一个 Visual Studio 插件叫 WatchDog，被试同意后装上：

```
你按 F5（开始调试）  →  插件记录 timestamp
  你设了一个断点    →  记录 breakpoint set
  断点命中          →  记录 breakpoint hit
  你按 F10（单步）   →  记录 step over
你按 Stop          →  会话结束，时长 = stop - F5
```

**逐部分解释**：

- **会话边界**用 IDE 内置事件（F5 / Stop）切，不靠人事后回忆
- **per-event 时间戳**精确到毫秒，比"你大概花了多久"自评准得多
- 数据每次启动 IDE 时匿名上传一次，被试可以随时关掉

这种 IDE-native 遥测，是论文敢说"真实工作流"的底气。

### 案例 2：65% 拐点怎么读

把 7,200 个调试会话按时长分桶，柱状图大概长这样：

```
< 1 分钟  ████████████████████████████  65%
1-2 分钟  ████  12%
2-4 分钟  ███  8%
4-8 分钟  ██  5%
8-15 分钟 ██  4%
15-30 分钟 █  3%
> 30 分钟  █  3%
```

读法：你印象中"调试要花好久"那种是右边那 3% 长尾，但**频率最高的是左边那个又粗又高的柱子**——大多数 bug 你看一眼就改完了。研究者把研究 attention 全放在右边长尾上，跟真实工作流频率严重错配。

### 案例 3：176 份问卷里的工具使用率

```
读源码         ████████████████████████  92%
Output / 控制台 ████████████████████      81%
单步 step      ██████████████             64%
inspect 变量    ████████████              58%
设置断点       ████████                   38%
专门日志框架    ██████                     31%
条件断点       ██                          8%
调试可视化     █                            6%
反向 / 时间旅行 █                            3%
```

读法：**最朴素的"读代码 + print"在最上面**，越往下越花哨。conditional breakpoint 的 UI 工程师写了好多年，但只有 8% 的人用过。这是"工程师为自己造工具"的反例。

## 踩过的坑

1. **F5 不等于"我在 debug"**：有人按 F5 只是为了让程序在 IDE 里跑（看 console 方便），并不真的在解决 bug。65% 短会话里混了这部分 noise，论文 Section 7 承认了。

2. **"使用过"不等于"经常用"**：38% 的人"曾设过断点"——可能一辈子设过 1 次。问卷拿不到"过去一周用了 N 次"的频率数据，所以不能直接说"断点很常用 / 不常用"。

3. **458 用户全是 Visual Studio + .NET**：结论叙述成"程序员普遍如此"，但 Python / JS / Rust 用户从没被采集。Visual Studio 在 Java / web 前端 / 系统编程里占比有限，跨语言外推风险大。

4. **频率不等于价值**：1 个 30 分钟的内存泄漏调试，可能比 100 个 1 分钟改 typo 重要 100 倍。论文用频率分布建议"IDE 应该把投入往 Track 1 倾斜"，但没考虑 Track 2 那 5% 时间可能解决了 80% 真正的难 bug。

## 适用 vs 不适用

**适用**：

- 设计 IDE 调试工具 / LLM debug agent 时——别假设用户都在用断点
- 评估你团队的调试效率——可以做迷你 self-observation，记 1 周看分布
- 反驳"用 print 是新手"叙事——拿这篇论文数据回怼
- 教学场景介绍调试——告诉学生 print + 读源是主流，断点是补充工具

**不适用**：

- **作为"断点没用"的证据**——某些 bug（heisenbug / race condition）断点不可替代
- **作为跨语言通用结论**——论文只测 .NET，2026 跨语言重做结论可能不一样
- **作为"调试只占 5% 时间"的依据**——长尾会话占用大量精力，频率不代表精力分配
- **作为 self-report 的替代**——论文本身用了双数据源，单靠问卷自评偏差大

## 历史小故事（可跳过）

- **1985 年**：Knuth 在 Software: Practice and Experience 上发表 "The Errors of TeX"，亲手记录自己写 TeX 时的 867 个 bug——程序错误数据驱动研究的开山之作，但 N=1
- **1985 年**：Vessey 在 IJMMS 用 think-aloud 测 26 个 COBOL 程序员调试——expert 用 breadth-first hypothesis search，但实验场景非真实工作
- **1997 年**：Eisenstadt 收集 78 段"我遇过最难的 bug"战争故事——选择性偏差大，大家只记得长尾不记得 trivial
- **2014-2016 年**：Beller 团队部署 WatchDog 18 个月，458 个程序员遥测加 176 份问卷——把 Knuth 单点 / Vessey 实验室 / Eisenstadt 故事 scale 到工业规模 longitudinal 数据
- **2018 年**：ICSE 发表，12 页论文，被引超过 300 次，催生后续 observability 工具浪潮和 2024+ 的 LLM debug agent 设计

## 学到什么

- **真实工作流分布常常违反教科书叙事**——只有大样本 longitudinal 数据能戳破，小样本实验做不到
- **频率 vs 价值是两件事**：用频率证据建议产品决策时要小心，可能在错配真正的工作影响
- **被试自评有系统偏差**：人会美化自己用高级工具的频率，所以遥测 + 问卷 triangulation 是 empirical 软件工程的好做法
- **"X 是专业 / Y 是新手"**这类二分叙事常常没数据支撑，下次听到第一反应应该是"哪篇论文证的？样本多大？"

## 延伸阅读

- 论文 PDF：[Beller et al. 2018 — On the Dichotomy of Debugging Behavior](https://andy-zaidman.github.io/publications/icse-2018-beller.pdf)（12 页 + 2 页 references，密度合适）
- 视频讲解：[Greg Wilson — What We Actually Know About Software Engineering](https://www.youtube.com/watch?v=xCBrkLE0hAM)（实证软工 60 分钟综述）
- WatchDog 工具源码：[TestRoots/watchdog](https://github.com/TestRoots/watchdog)（Apache 2.0，可二次部署做你团队的 mini 调研）
- Greg Wilson 博客：[In Defense of Print Debugging](https://gvwilson.github.io/2025-01-print-debugging.html)（结合 Beller 数据为 print 调试正名）
- [[program-comprehension-fmri]] —— 读源码时大脑活动模式，对应 Beller "92% 调试靠读源码"
- [[programmer-interruption]] —— 调试被打断的认知成本，与 Track 2 长会话强相关

## 关联

- [[beck-tdd]] —— TDD "如果你要 debugger 你的设计就有问题"，Beller 数据部分支持（断点低使用率）部分冲突（仍 38% 在用）
- [[compiler-errors]] —— 编译器错误信息的可读性，是 Track 1 短会话能否成立的前置条件
- [[program-comprehension-fmri]] —— 读源码占调试 92%，这篇 fMRI 研究告诉你大脑怎么读
- [[programmer-interruption]] —— 调试中被打断的代价，特别影响 Track 2 长会话
- [[pair-programming]] —— 结对编程是另一种"少用断点"的调试模式，与 Beller dichotomy 互补
- [[sillito-questions]] —— 程序员调试时问的真实问题清单，是 Beller 数据的认知层补充
- [[copilot-rct]] —— 同样是软工实证 RCT/longitudinal 双范式，Beller 是观察派代表
- [[cognitive-load-theory]] —— Track 2 长会话的认知负担来源，断点 + step 多线程信息正好打满工作记忆

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[great-swe]] —— Great SWE — 资深工程师"伟大"的标准是 humble + always learning
- [[pair-programming]] —— Pair Programming — 两个人共用一台机器写代码
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
