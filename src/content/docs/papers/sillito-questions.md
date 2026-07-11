---
title: Sillito 44 问题 — 程序员改代码时到底在问什么
来源: 'Sillito, Murphy, De Volder. "Asking and Answering Questions during a Programming Change Task". IEEE TSE 2008'
日期: 2026-05-30
分类: 软件工程
难度: 中级
---

## 是什么

Sillito 44 问题是**一份程序员改代码时会问的具体问题清单**，44 个，分 4 大类。日常类比：像菜谱书把"做菜"拆成"先备料 / 再切配 / 再翻炒 / 最后摆盘"四步，每步下面又列十几个具体动作。

之前学界只说"程序员有 5 类抽象问题（why / how / what / whether / discrepancy）"，没人能直接拿去设计工具。三位作者在工业场观察 16 名工程师做自己的改动任务，又在实验室让 9 个人（成对）做 Eclipse Java 修改任务，把每一句"嗯，这个 method 在哪儿被调？"都标下来，最后归出 44 个稳定类目。

清单按"关注范围"从小到大排：先找 1 个点 → 展开它的近邻 → 看一组点之间的关系 → 跨多组点的整体推理。今天 IDE 的 Find All References / Call Hierarchy 都是在为某个具体编号的问题服务。

这篇论文的本质贡献，是把模糊的"程序员要理解代码"翻译成 44 个可对照、可设计工具的小目标。

## 为什么重要

不理解这 44 个问题，下面这些事都没法解释：

- 为什么 IDE 一定要做 Find All References / Call Hierarchy——它们对应的就是 Q12 / Q29 这类导航题
- 为什么 LLM agent 在 SWE-bench 上跑到 60% 就上不去——卡住的题型集中在 Q34-Q44 的跨组影响推理
- 为什么只在实验室招学生做小任务的研究系统性低估了真实工程难度
- 为什么 commit / PR 要写清影响面——对应的是 Q42/Q43（改动的直接/总影响），不是"改了哪几行"

## 核心要点

把 44 个问题分到 4 类（论文计数 5+15+13+11），按"关注的代码范围"由小到大：

1. **Finding Focus Points（Q1-Q5，找 1 个点）**：刚开始进入陌生代码，要回答"这个 UI 文案在哪？""有没有叫类似名字的实体？"。类比：进图书馆先找书架编号。这一层 LLM 工具最擅长，grep + embedding search 几秒返回。

2. **Building on Those Points（Q6-Q20，展开 1 个点的近邻）**：知道入口后，要回答"这个类型有什么字段？""这个方法在哪被调？"（Q12）。类比：找到书架后翻一翻附近几本相关的书。LSP 的 Goto Definition / Find References 主要服务这层。

3. **Understanding a Subgraph（Q21-Q33，理解一组点的关系）**：要回答"控制流怎么从这里走到那里？"（Q29）"这段代码改了哪些数据？"。类比：弄清楚几本书互相引用的脉络。需要静态分析或 trace 执行，是 IDE Call Hierarchy 的主战场。

4. **Questions Over Groups（Q34-Q44，跨多组点的影响）**：要回答"这次改动的直接/总影响是什么？"（Q42/Q43）"怎么知道问题真解决了？"（Q44）。类比：评估一整本论文集对学科走向的影响。

第 4 类在工业场远比实验室常见，是论文最关键的发现，也是 LLM agent 当前最弱的一层。

## 实践案例

### 案例 1：用 4 类给自己写 PR self-check

下次提 PR 前按顺序问自己一遍：

```
[ ] Finding Focus : 我改的入口在哪？ (Q1-Q5)
[ ] Building on   : 这个函数还被哪里调？打开 Find References (Q12)
[ ] Subgraph      : 这次执行流怎么走？打开 Call Hierarchy (Q29)
[ ] Groups        : 改了之后直接/总影响是什么？ (Q42/Q43)
[ ] Groups        : 我怎么知道问题真解决了？跑相关测试 (Q44)
```

5 分钟开销，但 Q42/Q43 这一格能挡掉不少 regression。新人最容易跳过的就是 Groups——光看自己改的几行通过 = 没问到"跨组影响"。

### 案例 2：解释为什么 IDE 长那样

```
Q12 Where is this method called?           → Find Usages / Find All References
Q8  Where does this type fit in hierarchy? → Type Hierarchy
Q29 How is control getting from here to here? → Call Hierarchy
Q35 What are the differences between these files? → git diff / Compare
Q42 What will be the direct impact of this change? → CI + 相关测试
Q43 What will be the total impact of this change?  → 影响面审查 / 回归套件
```

每一个 IDE 按钮都在为某个 Q 服务。读完论文你能反过来看 IDE 设计图——看到一个新功能就问"它解决的是哪个 Q"，立刻知道这功能优先级。

### 案例 3：把 4 类作为 LLM agent 的 prompt 脚手架

给 Cursor / Claude Code 写明确指令：

```text
开始修这个 bug 前，依次回答（每类至少一句）：
1. Finding Focus：bug 入口在哪个文件？
2. Building on：相关的调用链覆盖哪些模块？
3. Subgraph：这条路径走过哪几个状态？
4. Groups：修了之后直接/总影响是什么？我怎么验证？
```

比直接喊一句"修这个 bug"高质量得多——agent 不会跳过 Q42/Q43 直接 commit。第 4 类是 SWE-bench 上 LLM 失败率最高的题型，强制让 agent 先回答这一类，验证步骤通过率会显著上升。

## 踩过的坑

1. **44 这个数字不是真理**：论文讨论里自己说清单不是封闭集。换语言 / 换领域（ML 工程的"为什么这一切片表现差？"）会出现新类目，硬背 44 会错过新问题。

2. **4 类不是互斥**：Q42 "改动的直接影响" 既可归 Groups 也可沾到 Subgraph。论文用层级是叙事简化，实际单个问题常跨类。

3. **只用实验室数据系统性失真**：实验室会话约 45 分钟、没有团队协作、没有 production 后果，所以 Q34-Q44 几乎不出现。读后续工作时碰到只在 lab 跑的论文要打个折。

4. **评分者一致 ≠ 客观**：Cohen's kappa（两人打标签有多合拍的分数）> 0.7 只说明两人看法接近，不保证没一起漏掉同类问题。论文没做独立小组的复制 coding 验证。

## 适用 vs 不适用场景

**适用**：

- 设计 IDE 导航类功能的优先级（Find Usages / Call Hierarchy / Outline）
- 评估 LLM coding agent 能力——把 44 个问题做成 rubric
- 写学术论文引用"程序员要回答的问题"——这篇仍是首选
- 给团队新人写 onboarding 检查清单（按 4 类自检）

**不适用**：

- 把它当成 ML / 数据 / 嵌入式工程师的完整 question 列表——论文样本以 Java 等为主，不是全领域封闭集
- 用 4 类去硬性切分 LLM 自然语言对话——LLM 一个 prompt 隐含十几个 Q，硬切降低效率
- 套到 pair / mob programming——协作模式下 question 模式不同
- 给非修改任务（review / 学新库 / 写文档）做完整指导——论文聚焦 change task
- 当成"问题永远只有这些"的封闭集——作者自己留口子说还有未覆盖的

## 历史小故事（可跳过）

- **1986**：Letovsky 提出 mental model 框架，5 个抽象 question 类型，但太抽象做不出工具。
- **2006**：FSE 上 Sillito 等用 lab N=9 的观察，给出约 36 个初步 question 的 pilot。
- **2008**：合并 industrial N=16 + lab N=9，question 增到 44 并加 4 层结构，发在 IEEE TSE。
- **2010**：LaToza & Myers 在 PLATEAU 报告 179 人问卷，聚成 21 类难回答问题，与 Q34-Q44 高度重合。
- **2012**：Roehm 等人在 ICSE 用更大样本跨语言观察专业开发者如何理解软件，4 类框架基本稳定但需补领域知识。
- **2024**：SWE-bench 把真实 GitHub issue/PR 做成基准，等于把 44 个问题隐式编码进了 LLM agent 的考卷。

## 学到什么

1. 学界从"抽象框架"到"可操作清单"经常隔 20 年——Letovsky → Sillito 就是这种接力。
2. 双数据源（field + lab）相互校验比单数据源更能暴露 lab 的盲点；只跑 lab 容易把真实难题筛掉。
3. Inductive coding（从观察归纳出分类）是把混乱现场变成 taxonomy 的笨办法，但要诚实报告"还在冒出新类吗"（saturation）和评分者是否合拍。
4. 一篇实证论文能影响 IDE 工具圈十几年，因为它把"做工具该解决什么问题"明确化了。
5. 当一个领域被两派争夺（理论派 vs 工具派），第三条路常常是"做实证 taxonomy"——把两边痛点都补上。

## 延伸阅读

- 论文 PDF：[DOI 10.1109/TSE.2008.26](https://doi.org/10.1109/TSE.2008.26)（IEEE 付费墙；作者主页常有镜像）
- 前作 FSE 2006：[Questions Programmers Ask During Software Evolution Tasks](https://dl.acm.org/doi/10.1145/1181775.1181782)
- 相关问卷 PLATEAU 2010：[LaToza & Myers — Hard-to-Answer Questions about Code](https://doi.org/10.1145/1937117.1937125)
- 跨语言观察 ICSE 2012：[Roehm et al. — How Do Professional Developers Comprehend Software?](https://doi.org/10.1109/ICSE.2012.6227127)
- LLM agent 时代检验：[Jimenez et al. — SWE-bench](https://arxiv.org/abs/2310.06770)

## 关联

- [[program-comprehension-fmri]] —— 大脑读代码亮的是语言区，配 Sillito 的"问什么"问题清单
- [[programmer-interruption]] —— 中断恢复时不只是文件位置，还要恢复上次问到哪个 Q
- [[swe-bench]] —— 真实 PR 基准，相当于 Sillito 44 的隐性 evaluation rubric
- [[pair-programming]] —— 协作场景下 question 模式与 Sillito 单人观察不同
- [[compiler-errors]] —— 报错信息要回答的也是 Q44 "为什么这没发生 / 这为什么发生"
- [[cognitive-load-theory]] —— 4 类层级与工作记忆容量配合解释 IDE 切 panel 的代价
- [[claude-code]] —— 把 44 类做成 agent prompt 脚手架的最近实践
- [[hindley-milner]] —— 同样是"模糊概念变可操作清单"的 60 年接力，对照阅读能看出 taxonomy 的力量

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
