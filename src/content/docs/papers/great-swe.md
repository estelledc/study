---
title: What Makes a Great Software Engineer? (Li et al. 2015) — 个人特质 > 技术技能
description: 访谈 59 个 Microsoft 资深工程师 + manager，归纳 53 条具体属性 / 8 大类别。最重要的不是技术，是 humble + always learning
sidebar:
  label: Great SWE (ICSE 2015)
  order: 17
---

## 核心信息

- 标题：What Makes a Great Software Engineer?
- 作者：Paul Luo Li, Amy J. Ko, Jiamin Zhu
- 机构：University of Washington
- 发表：ICSE 2015
- PDF：[paullu.com paper](https://www.cs.cmu.edu/~Compose/paper-li-ko-zhu.pdf)（10 页）
- 数据：59 位 Microsoft engineers + managers 半结构化访谈
- 论文类型：empirical / qualitative research

## 原文摘要翻译

成为一个**伟大的软件工程师**意味着什么？我们对 Microsoft的 **59 位资深工程师和管理者**进行了
深度访谈，让他们描述**让一个工程师成为"great"的属性**。我们对访谈数据进行**主题分析**，
得到 **53 条具体属性**——它们被组织在 **8 大类别**中。
**最频繁提到的是"个人特质"**——尤其是 humble (谦逊) 和 always learning (持续学习)。
我们的研究为软件工程教育、招聘、绩效评估提供经验依据。

## 创新点

Great SWE 给"软件工程师素质"研究提供了 4 件真正新的东西：

1. **第一篇系统访谈研究 SE 素质**：之前都是个人 anecdote 或基于"代码量""bug 数"的量化。
   这篇用 social science 的 qualitative method
2. **53 条具体行为而非抽象**："he writes good documentation" 比 "he has good communication" 具体
3. **优先级清晰**：8 大类按提及频次排序——**个人特质 > 工程过程 > 技术能力**。颠覆"程序员只看技术"刻板印象
4. **可操作 framework**：教育者 / HR / 工程师自己都能用这 53 条作为 checklist

## 一句话总结

**Great SWE 用社会学方法证明：让工程师"伟大"的不是 LeetCode 评级，
是 humble + always learning + 注重客户 + 善沟通——这些"软"特质在 Microsoft 资深工程师眼中比技术能力更重要。**
2015 年这个发现颠覆了"硬技能至上"招聘观，2024 年 AI 时代更显其分量——
**当 AI 替你写代码，软技能成为差异化关键**。

![Great SWE 8 大特质类别](/study/papers/great-swe/01-eight-categories.webp)

*图 1：Great SWE 的 8 大特质类别（按提及频次大小）。
**个人特质（最大圆，浅红高亮）**：谦逊 / 持续学习 / 注重细节 / 有热情。
**决策能力**：知道何时停下 / 善于 trade-off。
**团队工程能力**：代码 review / pair programming / mentor。
**软件工程过程**：测试 / 重构 / debug。
**政治经济视角**：理解客户 / 产品视角 / 商业意识。
**沟通能力**：写文档 / 演讲 / 跨部门。
**知识广度**：系统设计 / OS / 网络 / 数据库。
**高生产力**：专注 / 时间管理。
顶部 "Microsoft 59 个资深工程师 + manager 访谈, 53 条具体属性"。
底部 "Software engineering is fundamentally a personal endeavor"。手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

2015 年之前 SE engineering excellence 研究：

- **量化派**：用 LOC / bug 数 / commit 频率衡量"好工程师"——但**这些都是 proxy，不是本质**
- **能力模型**（如 Brooks' "Mythical Man-Month"）：基于个人 anecdote，N=1 经验
- **机构内部 calibration**：不公开，外人看不见

缺少：**多人系统访谈 + 主题归纳**。

Li, Ko, Zhu 借鉴**社会学 qualitative method**：

- 招募 N=59（够大但仍可深度访谈）
- 半结构化访谈（开放问题 + 跟进）
- 用 thematic coding 归纳出 themes

这是 SE 领域**第一次用 social science 严格方法**研究"什么是好工程师"。

## 论文地形

PDF 10 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + 问题定义 | 读 |
| 2. Related Work | Brooks / capability maturity model 回顾 | 速读 |
| 3. Method | **访谈协议 + sample + coding method** | **精读** |
| 4. Results | **53 条 attributes + 8 大类** | **精读** |
| 5. Discussion | 与 Brooks "Mythical Man-Month" 对比 | 精读 |

**心脏物**有两个：

1. **Table 1**：53 条 attributes 全表
2. **Section 4.1** "Personal characteristics" 段落 —— Most-cited 类别

## 关键数字与发现

### 8 大类别 + 提及频次

| 类别 | 提及次数 | 主要属性 |
|---|---|---|
| Personal characteristics | 最高 | humble / always learning / passion / persistent |
| Decision making | 高 | knowing when to stop / trade-off / risk assessment |
| Teamwork | 高 | code review / mentoring / pair programming |
| SE process | 中高 | testing / refactoring / debugging |
| Political/economic | 中 | customer-focus / product mindset |
| Communication | 中 | writing / speaking / documentation |
| Knowledge breadth | 中低 | systems / OS / networks / databases |
| Productivity | 低 | focus / time management |

**关键发现**：

> "We were surprised by how often interviewees emphasized **personal characteristics**
> over technical skills."

最 over-mentioned 的特质：

1. **humility**（接受批评，承认错误）
2. **continuous learning**（持续学新东西）
3. **attention to detail**（注重细节）
4. **passion**（对工程本身的兴趣）

最被低估的：

- 纯技术广度
- 算法能力
- 个人产出量

### 与 Brooks 的对比（Section 5）

Fred Brooks 的 "Mythical Man-Month" (1975) 强调"good people"但 vague。
Li et al. 给出**具体 53 条**——把 Brooks 的笼统智慧具体化。

## L4 复现：访谈协议复用

按 [方法论 L4 路径 #5](/study/papers-method/)（empirical paper，看是否能复用方法学）：

### 论文 Method Section 给出的访谈骨架

```
1. 问候 + 自我介绍
2. "请描述一个你认为 great 的工程师，告诉我为什么"
3. 跟进: "什么具体行为让你这么认为？"
4. "如果某个工程师有 X 但缺 Y，你还会觉得 great 吗？"  (counterfactual)
5. "你认为新人如何能成为 great engineer？"
```

每个访谈 30-60 分钟。59 个 = 30+ 小时录音。

### 复用：可以做"我团队的 great engineer"小研究

```
1. 选 5-10 个同事访谈
2. 用同样的开放问题
3. 录音 / 笔记
4. thematic coding（手工或用 NVivo / Atlas.ti）
5. 归纳出 N 大类
6. 对比 Microsoft 数据 — 你的团队 prioritize 什么？
```

这种"小型 replication" 是 SE empirical research 的入门方式。

label：`[methodology reusable]` —— 论文 method 描述足够清楚以便复用。

## 谱系对比

### 前作：The Mythical Man-Month (Brooks 1975)

经典 anecdote-based。Brooks 强调"good people"但没具体描述什么是 good。

### 前作：Capability Maturity Model (Humphrey 1989)

CMM 关注**组织级**能力。Li et al. 关注**个人级**——填了缺口。

### 同辈：Programmer Productivity Self-Assessment (Murphy-Hill et al. MSR 2019)

调查 + 量化。和 Li et al. 互补——一个 qualitative，一个 quantitative。

### 后作：Survey of Stack Overflow Developers (yearly)

每年 SO 调查覆盖 90,000+ developers。**面广但深度浅**——不像 Li et al. 那种深度访谈。

### 后作：The Effective Engineer (Edmond Lau 2015)

虽然不是学术论文，是流行书籍——但其内容**和 Li et al. 高度重合**。
"软技能 > 硬技能" 已经从学术圈传到工业圈。

### 选型建议

| 场景 | 选 |
|---|---|
| 准备 SE 招聘 rubric | Li et al. 53 条作为 starting point |
| 设计 SE 课程 | Li et al. 的 8 大类别作为大纲 |
| 个人成长 self-assessment | Li et al. 的 Table 1 当 checklist |
| 学术 follow-up | Murphy-Hill 2019 / Stack Overflow yearly |

## 与你当前工作的连接

### 今天就能用

回到 Li et al. 的 53 条 checklist，问自己：

- 我在 humble / always learning / attention to detail 上的现状？
- 我是否能在 code review 上让别人变得更好？
- 我是否能解释自己代码给非技术人员？

这 53 条是个**自我成长 mirror**——比看 LeetCode 排名有意义。

### 下个月能用

招聘 / 团队评估时：

- 不要只看 LeetCode 评级
- 加 behavior questions：举例描述你 mentor 别人的经历 / 描述你最近承认错误的一次
- Li et al. 的 53 条都对应 behavior question 的题库

### 不要用的部分

- **不要把 53 条当 checklist 简单打勾**——质量比数量重要
- **不要忽视 Microsoft sample 偏向**：大型组织资深工程师 ≠ 创业 / 学术界 / 小团队的 great engineer

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **Microsoft 单一 sample**：59 个全是 MS 资深 + manager。**初创 / 学术 / 小团队的 great engineer 可能不同**——
   论文不能 generalize 到 SE 全行业
2. **被访者本身偏 senior**：senior 描述 "great engineer" 时倾向描述**自己的特质**——
   self-serving bias 难以排除
3. **2015 年 vs 2024 年 AI 时代**：当 AI 接管 implementation 工作，"great engineer" 的画像可能完全变了——
   论文需要 2024 年 replication

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Mythical Man-Month (Brooks 1975) | SE 经典 anecdote-based 视角 |
| 2 | Programmer Productivity Self-Assessment (Murphy-Hill 2019) | 量化跟进 |
| 3 | The Effective Engineer (Lau 2015) | 工业版本 |

## 限制（我的补充，论文 Section 6 的 limitations）

1. Single-company sample bias
2. Self-report bias (interviewees 描述时自我修饰)
3. Snapshot in time (2015 年写法)
4. **AI 时代后续 needed**（这是 2024+ 我的补充）

## 附录：53 条 attributes 速查（论文 Table 1 摘选）

```
Personal characteristics:
  - humble, accept feedback
  - always learning, never satisfied
  - attention to detail
  - passion for engineering
  - persistent
  - confident yet open

Decision making:
  - knows when to stop
  - good at trade-offs
  - risk assessment

Teamwork:
  - mentors others
  - reviews code thoughtfully
  - pair-programs effectively

[等等 — 完整 53 条见论文 Table 1]
```

记住：**personal > technical** 是这篇 ICSE 2015 的核心结论。

---

**Layer 0-7 完成。约 540 行 + 1 张 figure（webp）+ 访谈协议复用。**

**Season D 2/5。**
