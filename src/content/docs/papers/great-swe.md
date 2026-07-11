---
title: Great SWE — 资深工程师"伟大"的标准是 humble + always learning
来源: 'Li, Ko, Zhu. "What Makes a Great Software Engineer?". ICSE 2015'
日期: 2026-05-30
分类: 软件工程
难度: 初级
---

## 是什么

Great SWE 是 Li / Ko / Zhu 在 **ICSE 2015** 的一篇质性研究：访谈 **Microsoft 13 个部门的 59 位资深工程师**，归纳出 **53 条**可观测属性，回答"什么样的人算 great"。

日常类比：像问 59 位老厨师"什么样的厨子算高手"——你以为答案是刀工、火候、配方，结果高频答案是"愿意承认菜糊了，下次主动改"。

论文把 53 条收进一张模型图（Fig.1），大致两层：

```text
Internal（工程师自身）
  · Personal characteristics  ← passionate / continuously improving（常被读成 humble + always learning）
  · Decision making           ← 情境识别、权衡、心智模型
External（对外影响）
  · Teammates                 ← 信任、共享上下文、心理安全
  · Software product          ← 优雅、预见需求、多抽象层权衡
```

最反直觉的一点：**个人特质与决策能力被放在与写代码同等重要的位置**；技术产出被当成默认底线，访谈里很少单独当"伟大"的标签来吹。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么大厂面试加了"行为面"环节，而题目长得很像论文里的可观察行为
- 为什么工程文化讨论常把"心理安全 + 学习意愿"放在纯产出前面
- 为什么"刷 LeetCode 100 道"和"被资深同事评为 great"是两回事
- 为什么有些技术很强的人升不上去——他们恰好弱在 Personal / Teammates 侧

## 核心要点

把这篇论文的结论拆成 **三步**：

1. **方法是质性研究，不是问卷打分**：59 位工程师，半结构化访谈；研究者做 **open coding**（先贴标签）再归类。类比：把 59 段录音剪成便利贴，贴满白板再分堆——堆名来自受访者原话，不是研究者拍脑袋。

2. **53 条落在 internal / external 两层**：不是"按频次排的 8 大类 KPI"。Personal + Decision making 描述人怎么想；Teammates + Software product 描述人怎么影响别人和产品。注意：某条被提得少 ≠ 不重要——产出类能力常被当成默认底线。

3. **humble / always learning 是行为，不是性格标签**：对应原文里 continuous improvement、承认无知、主动求反馈。是**可观察的动作**，不是"不争 / 老好人"。

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

### 案例 3：团队季度 retro 用论文四块打分

很多团队 retro 只看 OKR 完成率，看不见集体短板。用法：

```text
四块匿名团队打分（1-5）：
- Personal characteristics: 4.2
- Decision making: 3.8
- Teammates: 4.1
- Software product: 2.6   ← 最低（预见需求 / 跨层权衡弱）
→ 下季度主题：让 PM 讲 1 小时「我们的产品在公司里服务谁、牺牲了什么」
```

匿名是关键，否则平均分会被拽高；找最低的 1 块做主题，**不挂绩效**——挂了立刻变成 humble 表演现场。

## 踩过的坑

1. **把 53 条当 checklist 一股脑套用**：样本全是 Microsoft 资深工程师。初创、外包、科研优先级会变——别把一家大厂的画像当成宇宙真理。
2. **误读"很少单独吹产出"为"产出不重要"**：访谈者常把高产出当**默认底线**，所以不把它当"伟大"标签。就像问"什么是好餐厅"，没人会说"上菜不用脏盘子"。
3. **用 53 条做 KPI 量化打分**：原研究是质性归纳，没给可量化权重。硬量化会激励 *performative humility*——PR 里把反对意见包装成自我贬低。
4. **把 humble 等同于"不争 / 老好人"**：对应的是承认不会、主动求反馈。回避冲突、不发言不是 humble，是另一回事。

## 适用 vs 不适用场景

**适用**：

- 工程师自我评估、找薄弱面（个人成长用）
- 招聘行为面题库设计（HR / 面试官用）
- 团队季度 retro / 工程文化讨论的提纲（team lead 用）
- SE 教育课程设计：把 53 条当教学目标，不只教 coding

**不适用**：

- 当绩效 KPI 量化打分（原文没给权重，硬量化会扭曲行为）
- 跨行业照搬：Microsoft 资深样本，初创 / 外包 / 科研先看自己语境或另做访谈
- 替代技术面：53 条不含算法 / 系统设计，只是补充
- 用作"为什么我升不上去"的唯一解释：晋升受组织机会、运气影响很大

## 历史小故事（可跳过）

- **1975 年**：Brooks 在《人月神话》写"伟大的程序员比平庸的强 10 倍"——anecdote 流，没数据
- **1985 年**：DeMarco / Lister《Peopleware》开始量化，但用 LOC、commit 数衡量产出
- **1989 年**：Humphrey 提 CMM，停在组织级 capability，不评个人
- **2015 年**：Li / Ko / Zhu 用社会科学**质性方法**做个人级深度访谈，把抽象的 "good engineer" 拆成 53 条可观测行为
- **之后**：行为面、工程文化讨论、能力模型常借用同类语言（心理安全、持续学习）；Google Project Aristotle / SPACE 是平行线索，不必说成"直接引用这篇做基线"

之后 10 年，招聘、SE 教育、内部能力模型都在"技术之外还有可观察行为"这条线上展开。

## 学到什么

1. **个人特质与决策能力被放进"伟大"的核心**——不只是会写代码
2. **humble / always learning 是行为，不是性格**——可以训练、可以观察、可以面试时验证
3. **质性研究的价值**：53 条具体行为比"good communication"这种抽象词有用得多——可教、可评、可观测
4. **提得少 ≠ 不重要**：访谈数据要看上下文，产出常是默认底线，不是次要项

## 延伸阅读

- 论文 PDF（10 页）：[CMU 镜像](https://www.cs.cmu.edu/~Compose/paper-li-ko-zhu.pdf)
- Google SPACE framework：[Forsgren et al. ACM Queue 2021](https://queue.acm.org/detail.cfm?id=3454124)
- [[copilot-rct]] —— 用 SPACE framework 衡量 AI 编程工具产出影响，可对照这篇的行为清单
- [[beck-tdd]] —— TDD 是 always learning + humble 的具体纪律
- [[cognitive-load-theory]] —— 学不会不是不努力，是工作记忆装不下

## 关联

- [[copilot-rct]] —— SPACE 框架衡量 AI 工具影响，可与这篇的行为画像对照
- [[beck-tdd]] —— TDD 把 humble（让测试帮我发现错）和 always learning（红→绿→重构）变成纪律
- [[cognitive-load-theory]] —— 解释为什么 Knowledge breadth 难——工作记忆只有 4±1 槽
- [[debugging-dichotomy]] —— debug 是最考验 humble 的现场（承认我假设错了）
- [[hamming-1950]] —— Hamming《You and Your Research》——Knowledge breadth + always learning 早期版
- [[knuth-taocp]] —— Knuth 把 always learning 做了 50 年极致版本
- [[lampson-hints]] —— Lampson 的 hints 是另一种"资深工程师怎么想"的清单（更技术）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
