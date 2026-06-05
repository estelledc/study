---
title: Great SWE — 资深工程师"伟大"的标准是 humble + always learning
来源: 'Li, Ko, Zhu. "What Makes a Great Software Engineer?". ICSE 2015'
日期: 2026-05-30
子分类: 软件工程
分类: 其他
难度: 初级
provenance: pipeline-v3
---

## 是什么

Great SWE 是 Li / Ko / Zhu 在 **ICSE 2015** 的一篇质性研究：访谈 **59 位资深工程师与 manager**（来自一家大型软件公司），归纳成一份 **53 条属性 / 8 大类别** 的清单，回答"什么样的人算 great"。

日常类比：像问 59 位老厨师"什么样的厨子算高手"——你以为答案是刀工、火候、配方，结果第一名是"愿意承认菜糊了，下次主动改"。

8 大类别按访谈被提及频次排序：

```text
1. Personal characteristics  ← 最高频（含 humble / always learning / passionate）
2. Decision making
3. Teamwork / SE process
4. Political-economic awareness（懂业务、懂利益）
5. Communication / Knowledge breadth
6. Productivity              ← 反而垫底
```

最反直觉的一条：**Personal characteristics 排第一**，其中"谦逊"和"持续学习"出现得最频繁；"产出快"反而排到最后。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么大厂面试加了"行为面"环节，而题目长得很像论文里的 53 条
- 为什么 Google SPACE framework / Project Aristotle 把"心理安全 + 学习意愿"放产出前面
- 为什么"刷 LeetCode 100 道"和"被资深同事评为 great"是两回事
- 为什么有些技术很强的人升不上去——他们恰好弱在 Personal characteristics

## 核心要点

把这篇论文的结论拆成 **三步**：

1. **方法是质性研究，不是问卷打分**：59 位工程师，30-60 分钟半结构化访谈，两位研究者**独立 open coding**，再 **axial coding** 归类。类比：把 59 段录音剪成便利贴，贴满白板再分堆——堆名是访谈者自己说出来的词，不是研究者拍脑袋。

2. **53 条属性 / 8 大类别按频次排序**：频次 = 多少访谈者主动提到。Personal characteristics 第一，Productivity 最后。注意"频次低"不等于"不重要"，下面踩坑段会展开。

3. **humble 不是不争**：原文里 humble 是 *willingness to admit ignorance + actively seek feedback*——主动承认不会、主动找反馈。是**行为**，不是性格软弱。always learning 同理：是真的去试新技术，而不是嘴上说"要持续学习"。

三块加起来回答了一个老问题——"good engineer"到底长什么样——给出**可教、可评、可观测**的清单。

## 实践案例

### 案例 1：把 53 条做成自我评估 checklist

零基础学习者最该做的不是刷题，是**对照清单找最弱项**。一个最小可执行版：

```text
本月自评（1-5 分，每条配 1 个具体证据）：
- humble: 4    上周主动让 mentor review，承认 SQL 不会
- always learning: 3   报了课但只看了 2 节
- communication: 2     站会还是说不清自己卡在哪
- political-economic awareness: 1   不知道我做的功能给谁用
→ 下个月聚焦 communication：每个 PR 写 3 行 "为什么这么改"
```

**逐部分解释**：1-5 分不是量化打分，只是给自己排序；每条必须配"上周做了什么"的具体证据，防自我感觉良好；一次只挑 1-2 条改进，多了散。

### 案例 2：行为面试题库（招聘视角）

每条属性可以对应一道 STAR 题（Situation / Task / Action / Result）：

```text
属性: humble (willingness to admit ignorance)
题目: "讲一次同事在你 PR 里指出了明显错误，你当时怎么想、怎么处理？"

属性: always learning
题目: "上个月主动学了什么完全没接触过的东西？为什么学？学到哪一步？"

属性: political-economic awareness
题目: "你做过一个最后没上线的功能，当时知道为什么吗？"
```

STAR 比开放题（"你觉得自己 humble 吗"）更难表演——必须给具体场景。答不出场景的候选人，多半这条属性确实没发展过。

### 案例 3：团队季度 retro 用 8 大类别打分

很多团队 retro 只看 OKR 完成率，看不见集体短板。用法：

```text
8 大类别匿名团队打分（1-5）：
- Personal: 4.2
- Decision making: 3.8
- Teamwork: 4.1
- SE process: 3.5
- Political-economic awareness: 2.4   ← 最低
- Communication: 3.7
- Knowledge breadth: 3.2
- Productivity: 4.5
→ 下季度团建主题：让 PM 来讲 1 小时 "我们的产品在公司里赚谁的钱"
```

匿名是关键，否则平均分会被拽高；找最低的 1-2 项做下季度主题，**不挂绩效**——挂了立刻变成 humble 表演现场。

## 踩过的坑

1. **把 53 条当 checklist 一股脑套用**：原研究是一家大型软件公司（推断 Microsoft）。初创、外包、科研环境优先级会变——初创可能 Productivity 排第一，科研可能 Knowledge breadth 排第一。
2. **误读"Productivity 频次低"为"产出不重要"**：访谈者潜意识把高产出当**默认底线**，所以才不需要单独提。就像问"什么是好餐厅"，没人会说"上菜不用脏盘子"。
3. **用 53 条做 KPI 量化打分**：原研究是质性归纳，没给可量化权重。硬量化会激励 *performative humility*——下属在 PR 里把"我觉得这样不对"换成"也许我理解错了，但是不是..."。
4. **把 humble 等同于"不争 / 老好人"**：原文里 humble 是行动——主动承认不会、主动找反馈。回避冲突、不发言不是 humble，是另一回事。

## 适用 vs 不适用场景

**适用**：

- 工程师自我评估、找薄弱面（个人成长用）
- 招聘行为面题库设计（HR / 面试官用）
- 团队季度 retro / 工程文化讨论的提纲（team lead 用）
- SE 教育课程设计：把 53 条当教学目标，不只教 coding

**不适用**：

- 当绩效 KPI 量化打分（原文没给权重，硬量化会扭曲行为）
- 跨行业照搬：大型成熟软件公司样本，初创 / 外包 / 科研先看 SPACE 或行业自己访谈
- 替代技术面：53 条不含算法 / 系统设计，只是补充
- 用作"为什么我升不上去"的唯一解释：晋升受组织机会、运气影响很大

## 历史小故事（可跳过）

- **1975 年**：Brooks 在《人月神话》写"伟大的程序员比平庸的强 10 倍"——anecdote 流，没数据
- **1985 年**：DeMarco / Lister《Peopleware》开始量化，但用 LOC、commit 数衡量产出
- **1989 年**：Humphrey 提 CMM，停在组织级 capability，不评个人
- **2015 年**：Li / Ko / Zhu 第一次用社会科学**质性方法**做个人级深度访谈，把抽象的 "good engineer" 拆成 53 条可观测行为
- **2017 年起**：Google 内部 Project Aristotle、SPACE framework 把"心理安全 / 学习意愿"前置，引这篇做基线

之后 10 年，行为面、SE 教育、内部能力模型都在这条线上展开。

## 学到什么

1. **个人特质 > 技术技能**——这是过去 10 年 SE 研究最反直觉的发现，被多家公司内部研究复现
2. **humble 和 always learning 是行为，不是性格**——可以训练、可以观察、可以面试时验证
3. **质性研究的价值**：53 条具体行为比"good communication"这种抽象词有用 100 倍——可教、可评、可观测
4. **频次低 ≠ 不重要**：访谈数据要看上下文，Productivity 排末尾是因为它是默认底线，不是次要项

## 延伸阅读

- 论文 PDF（10 页）：[CMU 镜像](https://www.cs.cmu.edu/~Compose/paper-li-ko-zhu.pdf)
- Google SPACE framework：[Forsgren et al. ACM Queue 2021](https://queue.acm.org/detail.cfm?id=3454124)
- [[copilot-rct]] —— 用 SPACE framework 衡量 AI 编程工具产出影响，前置文献就是这一篇
- [[beck-tdd]] —— TDD 是 always learning + humble 的具体纪律
- [[cognitive-load-theory]] —— 学不会不是不努力，是工作记忆装不下

## 关联

- [[copilot-rct]] —— SPACE 框架衡量 AI 工具影响，前置文献正是这一篇
- [[beck-tdd]] —— TDD 把 humble（让测试帮我发现错）和 always learning（红→绿→重构）变成纪律
- [[cognitive-load-theory]] —— 解释为什么 Knowledge breadth 难——工作记忆只有 4±1 槽
- [[debugging-dichotomy]] —— debug 是最考验 humble 的现场（承认我假设错了）
- [[hamming-1950]] —— Hamming《You and Your Research》——Knowledge breadth + always learning 早期版
- [[knuth-taocp]] —— Knuth 把 always learning 做了 50 年极致版本
- [[lampson-hints]] —— Lampson 的 hints 是另一种"资深工程师怎么想"的清单（更技术）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[beck-tdd]] —— Beck TDD — 用红绿重构循环让设计自己长出来
- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[hamming-1950]] —— Hamming 纠错码
- [[knuth-taocp]] —— Knuth TAOCP — 计算机程序设计艺术
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则

