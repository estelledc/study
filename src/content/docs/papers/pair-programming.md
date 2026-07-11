---
title: Pair Programming — 两个人共用一台机器写代码
来源: 'Hannay, Dybå, Arisholm, Sjøberg. "The Effectiveness of Pair Programming: A Meta-Analysis". Information and Software Technology 51(7), 2009'
日期: 2026-05-30
分类: 软件工程
难度: 初级
---

## 是什么

Pair Programming（**结对编程**，下文 PP）是一种开发实践：两名程序员**共用一台机器、一份键盘、一份代码**，由 driver 负责敲键盘、navigator 在旁实时审查并指出问题，每隔一段时间交换角色。日常类比：像副驾驶帮主驾导航——主驾盯路面操控，副驾盯地图和路标，两人随时换位。

你不会写：

```text
程序员 A: ssh 上服务器，自己写完，再 PR review 给 B
```

而是写：

```text
程序员 A 和 B：同一桌、同一屏、同一键盘
A 敲：def parse(x):  ← driver
B 看：等下，x 可能是 None，先判空 ← navigator
（25 分钟后换：B 敲，A 看）
```

整个开发不是"先写后审"，而是"边写边审 + 实时讨论"。它出生在 1990s 的 XP（Extreme Programming）流派，争议至今未停。

## 为什么重要

不理解 PP，下面这些事都没法解释：

- 为什么一个看起来"成本翻倍"的做法能在 Pivotal Labs / Industrial Logic 这种公司全员推 20 多年
- 为什么 Hannay 2009 的元分析说质量只有小效应（fixed g≈0.23；g 是把不同实验差距换成同一把尺子的效应量），但不少团队仍坚持要做
- 为什么"PP = 1.5x 质量换 2x 成本"这句口号被反复传播，而 Arisholm 2007 更接近"约 +7% 正确率换 1.84x 人时"
- 为什么 GitHub Copilot 2021 出来后会有人提"pAIr Programming"——把 navigator 换成 AI

## 核心要点

PP 想做对，要把握 **三件事**：

1. **角色分工 + 定期换手**：driver 管"现在敲什么"，navigator 管"接下来去哪 + 这一步会不会踩坑"。日常类比：拉力赛副驾报路书。每 25 分钟换一次，避免一个人独占思考。

2. **navigator 必须出声**：不出声就退化成监工。Williams 等早期实验要求 navigator think-aloud——把"下一步是什么"和"这里怪怪的"念出来。这是 PP 比 PR review 多的核心：实时拦截，而不是事后挑刺。

3. **任务匹配度**：不是所有任务都该 PP。简单 CRUD 一个人 30 分钟搞定，强行 PP 是浪费。复杂算法 / 不熟悉模块 / 高风险改动这种"一个人想不清楚"的任务，PP 收益最大。

把这三件事拼起来叫 driver-navigator 风格，是 PP 的默认形态。其他变体（ping-pong / mob / strong-style）都是它的后代。

## 实践案例

### 案例 1：一节标准的 25 分钟 PP

时钟开始，A 和 B 同坐一台机器：

```text
00:00  A 敲第一行 def parse_csv(path: str) -> list[dict]:
00:02  B（navigator）：等等，path 可能不存在，要不要先 raise？
00:03  A：好，加一行 if not os.path.exists(path): raise FileNotFoundError
00:08  A 写完主循环；B 提议把 split(',') 换成 csv.reader 防止逗号转义炸
00:25  闹钟响：A 和 B 换位，B 敲键盘，A 看
```

观察：B 在 00:02 拦下的 bug，是 PR review 里通常等到 1 小时后才会被发现的。**PP 把"发现-修复"的间隔从小时级压到秒级**——这是它最直接的价值。

### 案例 2：用 Arisholm 2007（Hannay 转述）算 ROI

假设估时 40 小时的模块，时薪 100 美元。Hannay 2009 本身不做"复杂度子组元分析"，复杂度数字来自它重点转述的 Arisholm et al. 2007（295 名专业 Java 顾问）：

```text
方案 Solo：墙上时钟 40 h，成本 40 × 100 = 4000 美元

方案 Pair（Arisholm 总体）：
  墙上时钟约 -8% → ≈ 37 h
  人时约 +84%（1.84x）→ ≈ 74 h，成本 ≈ 7400 美元
  正确率约 +7%

方案 Pair（复杂系统子条件）：
  正确解比例约 +48%；墙上时钟无显著变短
  → 你买的是正确率，不是更快交付
```

复杂任务上 PP 更像"多花钱换更对"；简单任务上同一实验是墙上时钟约 -20%、正确率几乎不动。所以多数团队做选择性 PP，而不是全员全天 PP。

### 案例 3：把人-人 PP 框架套到 Copilot / AI pAIr Programming

Copilot 上线后，Ma et al. 2023 把 PP 的 4 个收益结构拆给 AI：

```text
              人-人 PP        Copilot pAIr
─────────────────────────────────────────────
即时纠错       是              是（但要你看）
知识传播       是              单向（AI → 你）
情绪支持       是              否
长期记忆队员    是              否（每次 reset）
```

AI 接住了"即时纠错"那一半，但"知识传播 / 团队记忆"那一半还在人-人 PP 里。这解释了为什么 Copilot 没有完全取代 PP——它替的是 navigator 的"挑错"，不是 PP 的全部功能。

## 踩过的坑

1. **简单任务上做 PP**：Arisholm 简单系统上正确率几乎不动，却仍要付接近双倍人时；把另一个工程师拉来共写一个 CRUD 表单，是反向 ROI。

2. **把口号当数据**："PP = 1.5x 质量换 2x 成本"出自早期倡导者；Hannay 质量总体只有小效应（fixed g≈0.23，95% CI 约 [.09,.37]），Arisholm 则是约 +7% 正确率换 1.84x 人时。

3. **学生样本数字直接套 senior 团队**：Hannay 纳入 18 项研究，约 13 项以学生为主；专业子组质量效应不显著（fixed g≈0.26, p≈0.10），且发表偏倚校正后总体质量可被压到接近零。

4. **不出声的静默 pair**：navigator 只看不说，PP 退化成"一个人写代码 + 一个人围观"，所有实时拦截价值蒸发；这是 PP 失败案例里最常见的一种。

## 适用 vs 不适用场景

**适用**：

- 复杂算法 / 陌生模块 / 高风险改动（线上支付 / 数据迁移）——正确率优先时
- 新人 onboarding——senior + junior 配对，做知识传播
- 设计阶段——需要"想清楚再写"而不是"试错快迭代"
- 关键 review——比事后 PR 更早拦下问题

**不适用**：

- 简单 CRUD / 模板化代码且不赶工——一个人 30 分钟搞定，不要 PP
- 探索 / spike——一个人快速试 5 个方向比两人统一节奏更快
- 文档 / 写作 / 想问题——单人深度思考效率更高
- 团队一方明显不愿意——强制 PP 比不做更糟

## 历史小故事（可跳过）

- **1995 年前后**：Smalltalk 圈子 Ward Cunningham 和 Kent Beck 在 Chrysler C3 项目上重新发现 PP 这种做法（更早的 1953 年 Fred Brooks 团队就有"两人编程"记录）。
- **1998–2000 年**：Laurie Williams 博士论文与 Williams et al. 2000 给出早期对照数据（常被概括为错误更少、墙上时钟约多 15%）。
- **1999 年**：Kent Beck 在 Extreme Programming Explained 第一版把 PP 列为 12 个 XP 实践之一。
- **2000 年**：Cockburn & Williams 在 "The Costs and Benefits of Pair Programming" 把数据推到主流。
- **2009 年**：Hannay 等用 18 项研究做元分析，把热度从 hype 拉回数据驱动决策。
- **2021 年**：GitHub Copilot 上线，2023 年 Ma et al. 提"pAIr Programming"，把 navigator 换成 AI。

## 学到什么

1. **协作有节奏**：driver-navigator + 定时换手 + navigator think-aloud，三件事缺一就退化。
2. **效应量比口号靠谱**：质量 g≈0.23 是小效应，不是革命；要做工业决策，要拿 effect size 不是 anecdote。
3. **任务匹配度决定 ROI**：复杂任务换正确率、简单任务最多换一点速度；选择性 PP 比全员 PP 性价比高。
4. **PP 不是免费**：约 1.84x 人时换小幅质量提升 + 知识传播 + 减少 bus factor，这是个工程权衡，不是道德立场。

## 延伸阅读

- 论文 PDF：[Hannay et al. 2009 元分析](https://www.simula.no/sites/default/files/publications/Simula.SE.232.pdf)（14 页，整个 PP 领域的"最冷静一篇"）
- 早期数据：[Cockburn & Williams 2000 ICSE](https://collaboration.csc.ncsu.edu/laurie/Papers/XPSardinia.PDF)（PP 倡导起点）
- AI 对比：[Ma, Wu, Koedinger 2023](https://arxiv.org/abs/2306.05153)（pAIr Programming 把人-人 PP 框架套到 Copilot）
- [[copilot-rct]] —— 2023 Copilot 大型 RCT，是 PP 论证模式在 AI 上的延续
- [[beck-tdd]] —— TDD 是 XP 的另一支柱，常和 PP 一起做（ping-pong PP 就是两者结合）

## 关联

- [[copilot-rct]] —— 把 navigator 换成 AI 后，PP 收益结构怎么拆
- [[beck-tdd]] —— XP 12 实践之一，常与 PP 配套做 ping-pong
- [[cognitive-load-theory]] —— 解释为什么 navigator 能在 driver 注意力被代码语法占满时拦下高层错误
- [[programmer-interruption]] —— PP 的"双人共注意力"也会带来打断成本，与单人 deep work 形成张力
- [[debugging-dichotomy]] —— 调试中"两个视角同时看一份代码"是 PP 价值最直接的体现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[beck-tdd]] —— Beck TDD — 用红绿重构循环让设计自己长出来
- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么

