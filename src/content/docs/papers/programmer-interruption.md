---
title: Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
来源: 'Parnin & Rugaber, "Resumption Strategies for Interrupted Programming Tasks", ICPC 2009'
日期: 2026-05-30
分类: 软件工程
难度: 中级
---

## 是什么

Parnin & Rugaber 2009 是第一篇用 **IDE 行为数据**告诉你"程序员被打断之后，过多久才会重新开始敲代码"的论文。日常类比：像在地铁站门口装计时器——不问你"你回家了吗"，只看你"几点钟刷的卡"。

研究者把一个叫 Mylyn Monitor 的 Eclipse 插件部署到 73 个 Java 工程师 + 12 个 C# 工程师的电脑上，连续 6-12 个月，被动收下来 4.5M 个鼠标键盘事件。然后他们提出一个新指标 **edit-lag**——一段编程会话里，从第一个事件出现到第一个真正修改代码的事件之间隔了多少分钟。

最被引用的两个数字：**只有 10% 的会话能在 1 分钟内开始改代码；30% 的会话超过 30 分钟还没敲下第一个字符。**

## 为什么重要

不知道这篇文章，下面这些事都解释不清：

- 为什么十余年后 JetBrains Focus Mode、VS Code Zen Mode、Slack Snooze、GitHub PR Draft 会陆续做成产品——它们在修的是这篇 2009 年就量化过的恢复成本
- 为什么"程序员平均 23 分钟才能恢复 flow"被到处引用，但这数字其实**不在这篇论文里**
- 为什么"你只是看了眼微信"的代价远比你想象的大
- 为什么写日报、留 TODO 注释、在 Cursor 对话窗里啰嗦解释思路——这些笨办法实际上在修补一个 2009 年就被量化的工程问题

## 核心要点

读懂这篇论文记三件事就够：

1. **edit-lag = 会话开始到第一次改代码的分钟数**。类比：你坐回桌前到真正敲下第一个字之间发了几分钟呆。这个数字在 IDE 里能自动测，不需要问你"你恢复了吗"——之前的 HCI 研究都靠日记法 / 自评法，被试容易把"我以为我恢复了"和"我真的在写代码"混为一谈。

2. **分布是长尾**。10% 会话 < 1 分钟（一坐下就接着改），30% 会话 > 30 分钟（半小时找不回上下文）。中间多数落在 1-15 分钟。**长尾才是恢复成本的主要来源**——大多数人记得短时间的恢复但忽略掉那条尾巴，所以才会觉得"我感觉每次切回来都很快"。

3. **6 类恢复策略，Navigate-to-New 占 83%**。多数会话不能直接从上次的位置接着敲，必须先跳到别的文件 / 方法 / 错误信息列表里**重新拼一次上下文**。"记得自己上次停在哪"的会话只有 17%——但这 17% 里 35% 能在 1 分钟内开始编辑，是恢复速度的最大杠杆。

## 实践案例

### 案例 1：把抽象数字变成你自己的体感

跑一个最小自我观察：

```bash
# 装 ActivityWatch（开源，本地跑，不上传）
# macOS: brew install --cask activitywatch
# Linux/Windows: 官网 https://activitywatch.net 下载
# 再装 VS Code 插件 aw-watcher-vscode
```

打开 ActivityWatch 自带的 web UI，看自己一周的"应用切换 → IDE 第一次按键"间隔。你会发现：

- 5 分钟以内的短打断（喝水、看微信）→ edit-lag 通常 < 30 秒
- 1 小时以上的长打断（午饭、开会）→ edit-lag 经常 5-15 分钟

数字变体感后再读论文的 Figure 3 长尾分布就一目了然——那个右尾不是"奇葩程序员"，是被开会切片的普通工作日。

### 案例 2：会话切分阈值的概率论根据

为什么论文用 **15 分钟事件间隔** 切会话？

```
事件间隔分布（论文 Section 3.4）：
   <1 秒:   占 60% 以上
   1 秒-1 分钟: 占 38%
   总计 < 1 分钟: 98%
   > 15 分钟:   < 0.5%
```

任何 ≥ 1 分钟的阈值都能切出"密集事件簇"，但 15 分钟比 1 分钟更稳——能容忍冲咖啡 / 接电话这种"短暂离开但同一会话"。这种用数据反推阈值的写法，是后来所有"开发活动会话化"分析（Meyer 2017 / VS IntelliCode）的祖宗。

### 案例 3：6 种策略对应你今天用的工具

```text
策略                       使用率     现代等价工具
1. Continue Last Edit       7.5%     IDE 自动恢复光标位置
2. Nav-then-Continue Last    17%     最近文件列表（Cmd+E）
3. Navigate-to-New Location  83%     全局搜索（Cmd+P）/ Cursor
4. View Revision History      4%     git log / GitHub PR diff
5. View Problem List (errors) 9%     IDE 红波浪线 / TS errors
6. View Task / Bug List       9%     Linear / Jira / TODO 注释
```

百分比加起来 > 100%——单个会话经常组合多个策略。比如先看 task list（策略 6），再 navigate 到代码（策略 3），最后看上次改了什么（策略 4）。

策略 5 / 6（Problem List / Task List）反直觉：用了它们的会话**反而更慢**——75% 的 edit-lag > 30 分钟。论文 Section 4.3 的解释是"这些场景对应复杂调试或长期挂起的 task"，不是工具本身慢。

## 踩过的坑

1. **把"23 分钟"当论文原话**——这是后人合并 Solingen 1998 的"15 分钟工业观察" + Mark 2008 CHI 的"23 分 15 秒"+ Parnin 长尾分布的简化。Parnin 论文从未给出"平均 23 分钟"这个数。
2. **把 6 策略当互斥分类**——Table 9 的频率加起来 > 100%，每个策略列代表"是否使用过"而不是"主策略是哪个"。把它们画成饼图就错了。
3. **把 edit-lag 等同于认知负荷**——edit-lag 包含 IDE 启动 + 文件加载 + 用户去厕所等环境固定开销。论文 Section 5.4 自己承认无法分离"恢复任务"与"开始新任务"。
4. **把 2008 数据外推到 2026**——LSP / hot reload / Copilot / Claude Code 完全改变了开发节奏，LLM agent 对话窗口本身就是论文没列的"第 7 类策略"。
5. **以为 filter 后的 5175 会话代表全体**——9899 → 7492 → 5175 的两步过滤丢了近一半短会话，10% < 1 分钟的数字其实是"中长会话"里的统计，对短会话本身偏向悲观。

## 适用 vs 不适用场景

**适用**：

- 设计 IDE focus / context restore 工具——优先优化 Continue Last Edit 这条 7.5% 的小路
- 评估自己的工作节奏——拿 ActivityWatch 跑 5 天 self-observation 就能复现机制
- 写学术论文 cite "程序员被打断很贵"——这是公认 first quantitative evidence
- 做 dev productivity tooling 的产品决策——6 策略给你优先级地图

**不适用**：

- 评估 pair / mob programming 团队——Williams 2003 强调协作里"打断"性质完全不同
- 估算 LLM 时代的 edit-lag 绝对值——工具栈代际差异太大，结论需要重做实验
- 测"是否进入 flow"——edit-lag 是"开始打字"，flow 比这更深一层
- 推断个人差异——论文混合统计 73 个用户，没分新手 / 资深

## 历史小故事（可跳过）

- **1990s**：Csikszentmihalyi 写 *Flow*，主观心理学，没有量化指标
- **1998**：Solingen 在 IEEE Software 用工业问卷得到"开发者 15 分钟恢复"
- **2004-05**：Czerwinski / Mark 在 CHI 用 diary study 测办公室任务，但是被试自评数据
- **2008**：Mylyn Monitor 工具成熟，Parnin 在博士期间开始攒 IDE telemetry
- **2009**：本文 ICPC，第一次把"恢复时间"从 self-report 升级到事件 ground truth
- **2011**：Parnin & Rugaber 在 Software Quality Journal 出长版，扩展到 6 策略的频率细节
- **2017+**：Meyer 等人在 TSE 把样本扩到 N > 5000，验证 Parnin 的分布形状

之后催生了 JetBrains Focus Mode（2018）/ VS Code Zen Mode / Slack Snooze / GitHub PR Draft / Linear 子任务树等一连串工程化产物。

## 学到什么

1. **被打断的代价不是"23 分钟均值"，是右尾长尾**——多数会话恢复很快，但 30% 的会话超过 30 分钟，这才是吃掉全天产出的部分
2. **行为数据远比自评可靠**——"我以为我恢复了"和"我真的开始改代码了"差距很大，能在 IDE 里测就别问问卷
3. **预留 cue 比恢复时努力专注更有效**——离开前 30 秒留 TODO 注释 / 写日报最后一行，比回来后强迫自己集中注意力性价比高得多
4. **多数恢复需要重读代码**：83% 的会话要 navigate 到别处，**程序员不是发呆，是在重读**——所以"代码自解释"和"留 cue"才这么重要
5. **方法论的迁移性大于结论本身**：用事件流定义"开始做事"的时间戳、用 ≥15 分钟切会话、用频率分布报告策略——这套框架后来被搬到 debug、review、文档写作等几乎所有"知识工人"研究里

## 延伸阅读

- 视频：[Chris Parnin — Programmer, Interrupted (talk)](https://www.youtube.com/watch?v=NF4QQjMcgkA)（一作自己 30 分钟讲一遍核心数字）
- 论文 PDF：[Parnin & Rugaber 2009](https://chrisparnin.me/pdf/parnin-icpc09.pdf)（10 页，方法学密度极高）
- 长版本：Parnin & Rugaber 2011 SQJ — 同样的数据扩展到期刊，多了 5 个策略相关的图表
- 后续大样本：Meyer, Fritz, Murphy-Hill 2017 TSE *Work Life of Developers*（N > 5000，把 Parnin 的 N=85 扩到全公司）
- 反对者视角：Williams & Kessler 2003 *Pair Programming Illuminated*（同期工作，主张协作里打断不是打断）
- [[program-comprehension-fmri]] —— 程序员读代码时大脑亮的是语言区，解释为什么"重读"代价这么高

## 关联

- [[program-comprehension-fmri]] —— 同 HCI 实证派，给"读代码"的脑科学证据
- [[cognitive-load-theory]] —— 解释为什么打断后 working memory 信息丢失
- [[pair-programming]] —— 反向流派，认为协作里打断不是打断
- [[debugging-dichotomy]] —— 同样靠 IDE 数据看程序员行为的实证工作
- [[compiler-errors]] —— 错误信息也是一种"恢复 cue"，论文 Section 4.3 提到 9% 用户用 Problem List 当线索
- [[copilot-rct]] —— 现代 AI 助手把对话历史当外置上下文，论文没法预见的"第 7 类策略"
- [[beck-tdd]] —— TDD 留下的红绿测试本身就是 Parnin Section 5.3 强调的 prospective cue

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[pair-programming]] —— Pair Programming — 两个人共用一台机器写代码
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么
