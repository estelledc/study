---
title: Copilot RCT — AI 编程助手的第一个严格随机对照实验
来源: 'Peng, Kalliamvakou, Cihon, Demirer, "The Impact of AI on Developer Productivity: Evidence from GitHub Copilot", arXiv 2302.06590, 2023'
日期: 2026-05-29
分类: 软件工程实证
难度: 中级
---

## 是什么

Copilot RCT 是 **2023 年第一篇用"医学/社科那种严格做法"测 AI 编程工具的论文**——招 95 个职业开发者，扔硬币分两组，一组开 Copilot 一组关 Copilot，让大家做同样的题，量时间。日常类比：像药厂测一款新药，不能只问"你觉得有效吗"，而是把人随机分成"吃药组"和"安慰剂组"，盯着指标看。

结果惊人：开 Copilot 那组比关掉的组**快 55.8%**（71 分钟 vs 161 分钟，p<0.001）。论文一出，所有 AI 编程鼓吹的人都把这个数字当圣经引用。

但魔鬼在细节里：题目是"用 JavaScript 写一个 HTTP server"——一个在 LLM 训练数据里出现过几十万次的"教科书甜点"。换个真实任务，结论可能完全反过来。

## 为什么重要

不理解这篇论文，下面这些事都没法判断：

- 为什么"AI 让程序员快 55%"这种数字到处转发，但你身边同事用了感觉没那么快——**是任务代表性问题**
- 为什么 2025 年 METR 在真实开源项目上重测，反而测出 AI 让人**慢 19%**——同样方法，结论反向
- 为什么"我的内部团队用了 X 工具效率涨 50%"基本不能信——大概率是 self-report，没控制组
- 为什么任何 productivity claim 都该问三个问题：谁是对照？任务是否代表真实工作？测得准不准？

## 核心要点

这篇论文的实验设计可以拆成 **三步**：

1. **随机分组**：95 个开发者扔硬币分成 Treatment（45 人，开 Copilot）和 Control（50 人，不开）。类比：抽签决定哪桌喝可乐哪桌喝雪碧，不让人自己挑。这一步排除"爱用 AI 的人本来就快"的偏差。

2. **同任务 + 量时间**：所有人做同一题——用 JS 写 HTTP server（处理 GET/POST/JSON）。从开始到提交记 timestamp。类比：跑 100 米必须同一条跑道、同样起跑线。

3. **t 检验比均值**：Treatment 组均值 71 分钟，Control 组 161 分钟，差 89 分钟，p<0.001。类比：硬币正反差距大到不能用"运气"解释。

三步加起来叫 **RCT（randomized controlled trial）**——医学界 1948 年发明的金标准，软件工程领域几乎没人用过。

## 实践案例

### 案例 1：论文 Table 1 的主结果怎么读

```
Outcome              | Treatment (n=45) | Control (n=50) | Diff   | p
Completion time mean | 71.17 min        | 160.89 min     | -55.8% | <0.001
Completion rate      | 78%              | 70%            | +8 pts | n.s.
```

**逐部分解释**：

- `-55.8%` 是均值差异（mean），不是中位数。中位数是 65 vs 145，约 -55%——差不多但没那么"性感"
- `Completion rate +8 pts` 标了 `n.s.`（不显著）——Copilot 让人**更快**，但没让人**更可能完成**。媒体转发时只提速度
- `p < 0.001` 意思是"如果两组真没差距，看到这么大差异的概率小于千分之一"。但 p 值小不等于结论 generalize

### 案例 2：用 Cohen's d 估 effect size

```python
mean_diff = 160.89 - 71.17           # = 89.72
sigma_treat, sigma_ctrl = 25, 55     # 论文 footnote 估
pooled_sd = ((45*25**2 + 50*55**2) / 95) ** 0.5  # ≈ 43.85
cohens_d = mean_diff / pooled_sd     # ≈ 2.05
```

Cohen's d ≈ 2.0 在心理学/社科属于 "罕见大"——通常 d>1.5 都需要独立复现才被接受。这是个**警示信号**：要么任务真是 Copilot 完美甜点，要么测量方式放大了差异。

### 案例 3：把"-55.8%"翻译成你能用的话

```
论文实际说的：
  "在 HTTP server toy task 上，n=95 职业开发者，
   Copilot 组的平均完成时间比 Control 组低 55.8%"

媒体转发的（错）：
  "Copilot makes developers 55% faster"

你该怎么理解：
  - 这是单一任务、单一样本、单一时间点的数字
  - 任务越像"教科书示例"，效应越大
  - 任务越像"改 5000 行既有代码"，效应越小甚至反向
```

一个数字外推到所有场景，是 empirical paper 引用链上最常见的病。论文 Section 6 自己列了 4 条 limitations，但媒体引用从来不提。学会反向恢复这些限定词，是读 empirical 论文的核心能力。

## 踩过的坑

1. **任务代表性极窄**：HTTP server 是 LLM 训练数据高频内容，Stack Overflow 上有几万版本。真实工作 70% 是改既有 codebase——论文不测这种 setting。METR 2025 在真实 OSS 项目上测出 AI 让人**慢 19%**，方向反转。

2. **Self-report 时间不可靠**：受试者自己记开始时间 + 任务平台记上传时间。中间去吃饭、上厕所、卡住忘记停表都没法控。Gold standard 是 IDE telemetry 连续监控，论文没用。

3. **开放标签 + Hawthorne effect**：受试者知道自己在测 Copilot，可能更投入。理想做法是给 Control 组一个"看起来像 Copilot 但不工作"的 sham 工具——论文没做。

4. **子组样本不够**：论文说"junior 比 senior 受益更大"（-65% vs -35%），但每个经验子组 n<30，按 Cohen 计算检测 d=0.3 的统计 power 只有约 0.3，远低于 0.8 标准。这个"AI 是 productivity equalizer"的 narrative 缺统计支撑。

## 适用 vs 不适用场景

**适用**：
- 给"AI 编码工具有没有可量化收益"提供第一个严格证据，方法学价值大于具体数字
- 做内部小型 RCT 设计的参考模板（随机 / 同任务 / 多 measure / 显著性检验）
- 学习如何批判性读 empirical paper（看 limitations 段、看 effect size、看任务代表性）
- 教学：本科 / 研究生 empirical methods 课程的入门案例，麻雀虽小五脏俱全

**不适用**：
- 直接套用 -55.8% 数字说服管理层买 Copilot——任务窄、样本特殊、未独立复现
- 推断 long-term 效应——单次 1 小时实验，不能说明持续使用 6 个月后的影响
- 推断真实工作场景——HTTP server 和"修 8 年老代码库"完全不同，参考 [[swe-bench]] 看真实任务
- 推断对 junior / senior 的差异化政策——子组 n<30，统计 power 不够
- 推断代码质量——论文只测 pass/fail，不测 maintainability / readability / 后续维护成本

## 历史小故事（可跳过）

软件工程 RCT 史很薄：

- **2000 年**：Cockburn & Williams 做 Pair Programming RCT，样本 N<40，是软件工程领域最早的 RCT 之一。
- **2005 年**：Erdogmus 等人做 TDD RCT，N=24 学生，effect 中等。看 [[beck-tdd]]。
- **2009 年**：Hannay 综合 18 个 Pair Programming RCT 做 meta-analysis，effect 比想象中小很多。
- **2021 年 6 月**：GitHub Copilot 公开发布，但所有"它有效吗"的讨论都是 anecdote。
- **2022 年**：Kalliamvakou 等人在 GitHub 内部做 self-report 满意度调查（N>2000），结论是"用户喜欢"，但没量化生产力。
- **2023 年 2 月**：Peng 等人发布这篇 RCT，arXiv 2302.06590。第一篇 AI 编码工具的严格随机对照实验。
- **2024 年**：GitClear 报告分析 1.5 亿行 GitHub 代码，发现 AI 时代 code churn（代码改动率）上升、reuse 下降——出现"AI tech debt"概念。
- **2025 年**：METR 在真实 OSS 项目上做 within-subject 实验（N=16 senior contributors），测出 AI 让人**慢 19%**——直接挑战 Peng 的外推性。

之后所有 AI 编码生产力研究都把 Peng 2023 当 baseline 或反驳对象。

## 学到什么

1. **RCT 是 empirical claim 的金标准**——但金标准也会被任务选择带偏。Peng 2023 + METR 2025 一起读才看到全貌
2. **Effect size 大不等于 generalizable**——d≈2.0 看起来很强，但任务窄到极致时这个数字就只是"在这道题上"
3. **媒体转发会去掉所有限定词**——论文说"this task, this sample"，转发变成"developers 55% faster"。学会反向恢复限定词
4. **任何 productivity claim 都该问四个问题**：随机分配了吗？任务是否代表真实工作？测得准吗？effect 在不同子组稳定吗？
5. **作者诚实、传播者去诚实、读者承担误读后果**——这是 empirical paper 引用链条的常见病，不是这一篇的问题

## 延伸阅读

- 论文原文：[arXiv 2302.06590 PDF](https://arxiv.org/pdf/2302.06590)（16 页，主表在 Section 4，limitations 在 Section 6）
- METR 反例：[Measuring AI's Effect on Real-World Software Engineering Productivity](https://metr.org/)（2025，N=16 senior，AI 让人慢 19%）
- 软件工程 RCT 综述：Hannay et al. 2009 Pair Programming Meta-Analysis（综合 18 个 RCT，effect 比 Peng 小一个数量级）
- 视频：[Andy Jones — How to read empirical papers critically](https://www.youtube.com/) 关于 effect size 与 generalizability 的入门
- 书：Shadish, Cook, Campbell《Experimental and Quasi-Experimental Designs》——所有 RCT 设计的经典参考，看完就知道 Peng 论文每个选择的代价
- [[swe-bench]] —— 真实 GitHub issue 的 benchmark，与 Peng toy task 形成对照
- [[cognitive-load-theory]] —— 解释为什么"AI 看起来快但实际不一定快"的认知机制

## 关联

- [[swe-bench]] —— 用真实 GitHub issue 做 benchmark，与 Peng 的 toy HTTP server 任务形成代表性对比
- [[swe-agent]] —— 把 LLM 包成自动 agent 做编程任务，是 Copilot 之后的下一代评测对象
- [[agentless]] —— 不用 agent 框架直接让 LLM 解 issue，showed simpler pipelines often beat complex agents
- [[programmer-interruption]] —— 程序员被打断的代价，与"AI 建议 review/reject"的中断成本同源
- [[cognitive-load-theory]] —— 解释 AI 建议为何让人主观觉得快但客观未必快
- [[beck-tdd]] —— 同样是软件工程实证议题，TDD 早期 RCT 是 Peng 论文的方法学前辈
- [[claude-code]] —— Copilot 之后的 agent 化 IDE，至今仍无 Peng 级别的 RCT 数字

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[codex-2021]] —— Codex — 让 GPT 学会写 Python，并造一把尺子量它
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[great-swe]] —— Great SWE — 资深工程师"伟大"的标准是 humble + always learning
- [[pair-programming]] —— Pair Programming — 两个人共用一台机器写代码
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
