---
title: Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
来源: 'Siegmund et al., "Understanding Understanding Source Code with Functional Magnetic Resonance Imaging", ICSE 2014'
日期: 2026-05-30
分类: 软件工程认知科学
难度: 中级
---

## 是什么

Siegmund 2014 是一篇 **fMRI 论文**——让 17 个学生躺进核磁共振仪、读 Java 代码，看他们脑子里**哪些区域亮了**。日常类比：像在剧院顶上装一台热成像仪，看观众听不同剧种时身上哪儿发热。

主要发现：读代码时亮的是**语言区**（Broca / 中颞回 / 顶下小叶），**不是**典型的数学/数量区（顶内沟 / 顶上小叶）。换句话说，在这篇实验设定下，编程在大脑里更像**读散文**，不像**解方程**。

这是首篇把 fMRI 引入软件工程实证研究的论文，给"编程像一种语言"这种民间口号提供了早期**生理学证据**。在此之前，关于"程序员在想什么"的研究多是 self-report / think-aloud / 阅读时间——行为代理，没有大脑活动的直接测量。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么后续编程教育叙事常把"编程像学语言"挂上生理学引证——这篇是早期源头之一（不是 Hour of Code 的唯一根）
- 为什么 Copilot / Claude Code 用语言模型 backbone 写代码显得合理——脑科学侧有一条旁证链
- 为什么"我数学不好所以学不会编程"是错的焦虑——这两个能力在大脑里不必走同一通路
- 为什么后续 2017 / 2018 / 2023 一连串 fMRI 论文都从这篇出发或与之对话

## 核心要点

整篇论文的逻辑可以拆成 **三步**：

1. **配对控制任务**：每段代码做两次——一次"读懂并说出输出"，一次"在同代码里找语法错误"（缺分号、括号不配等）。两个任务的 BOLD 信号（血氧变化，近似"这片脑区在干活"）相减，剩下的就是**理解贡献的部分**。这一步去掉了视觉、注意、阅读姿势等共同因素。

2. **统计阈值**：用 BrainVoyager 跑 GLM 差分对比（把时间序列拟合到"理解 vs 语法"条件）。先对休息基线做 FDR 校正筛出真正激活的体素，再在 comprehension vs syntax 上用 **FDR p<0.01** + 最小簇大小——宁可漏报不要假阳。

3. **结果定位**：5 个显著区全在**左半球语言/工作记忆网络**——BA44（Broca 句法）、BA47（语义整合）、BA6（中额回）、BA40（顶下小叶）、BA21（中颞回）。**没**显著亮的是 IPS（数学/数量）和顶上小叶（空间）。BA 是大脑分区编号，像城市行政区划。

三步加起来支持一个弱版本假说：**程序理解和自然语言理解激活相同脑区**。

## 实践案例

### 案例 1：实验装置长什么样

```
被试躺仪器里 ──> 屏幕显示 12 个 Java 函数（最长约 18 行）
              └─> sort / search / string reverse / 简单算术等
                  每段：60 秒"读懂输出" + 30 秒找语法错误 + 各 30 秒休息
扫描器：Siemens 3T MAGNETOM Trio EPI，TR=2s，体素约 3 mm
```

每被试功能扫描约 33 分钟。被试需能完成任务（正确输出、正确描述、或问卷确认在认真理解）。

被试来自 Magdeburg：CS/数学本科生，Java 经验同质；含 1 名左利手（侧化测试与右利手一致）。任一项不控制都会让差分对比失效。

### 案例 2：差分对比是怎么做的

```
理解任务 BOLD 信号  -  语法错误定位 BOLD 信号  =  "理解贡献" 差分图
       ↑                         ↑
  视觉+注意+阅读             视觉+注意+阅读
  + 语义整合                 + 模式匹配找错
```

减完只剩**语义整合 / 程序理解**那一份。控制任务故意做成"不用懂程序也能做"的找错，这是 fMRI 对比设计的金标准。

### 案例 3：5 个亮起来的脑区

| 区域 | Brodmann | 在自然语言里管什么 |
|---|---|---|
| Broca（IFG） | BA44 | 句法结构搭建 |
| Broca 前部 | BA47 | 语义检索与整合 |
| 中额回 | BA6 | 工作记忆 + 注意 |
| 顶下小叶 | BA40 | 语义检索 / 远距离依赖 |
| 中颞回 | BA21 | 词汇语义 |

**没显著亮**：IPS 顶内沟（数学/数量）、SPL 顶上小叶（空间）。

值得注意的几个细节：

- 5 个区**全在左半球**——与语言偏侧化一致，本身是 sanity check
- **BA47 与 BA44 分工**：理解时既要搭句法，也要拼语义；找语法错误两者都不需要
- **BA40** 在自然语言里管远距离 dependency，在代码里可对应变量 scope / 调用链追踪
- 后续 Peitek 2018 等用更大样本/多模态补了前额叶等细节

## 踩过的坑

1. **把"激活同一区"当成"共享同一神经机制"**——fMRI 体素数毫米内含数百万神经元，论文数据只支持弱版本（区域复用），强版本要单细胞或 ECoG 才能证明。abstract 措辞容易让人读出强版本。

2. **把"未激活 = 数学区不参与"当结论**——严格阈值假阴性高，2023 年 Srikant 等用 MD system（Multiple Demand 系统）框架直接挑战，发现数学/认知控制区其实也参与。

3. **把 12 个算法小函数结论外推到所有"程序理解"**——业务代码（form validation / 状态机 / 事件回调）更靠 schema 检索 + 状态追踪，可能激活前额叶 / 海马等未观察到的区域。

4. **把 N=17 当 universal**——现代 fMRI 常推荐更大样本；样本是 Magdeburg 学生 + Java 单语言；工业 senior + 多语言生态无法直接外推。

## 适用 vs 不适用场景

**适用**：

- 给"编程像语言学习"的教育叙事找早期生理学引证
- 评估 LLM-code 设计哲学（用语言模型 backbone 处理代码的旁证）
- 设计 IDE 错误信息 / 文档时偏向"读散文"的认知模式
- 反驳"必须先精通数学才能学编程"的传统直觉
- 给变量命名 / 注释风格 / 文档可读性研究找参照

**不适用**：

- 评估具体开发者个体（fMRI 太贵 + N 太小，论文是群组级 finding）
- 推断架构思考 / 系统设计 / 形式化验证的脑活动（stimuli 是小函数）
- 给"编程绝对不是数学"做强结论（2023 Srikant 已部分挑战）
- 工业真实 IDE 场景（被试不能 scroll、不能切文件、不能边写边改）
- 跨语言外推（论文只测 Java，函数式 / 系统语言可能不同）

## 历史小故事（可跳过）

- **1975 年**：Brooks 提出口号 "programs are written for people, computers just happen to execute them"。哲学断言，没数据。
- **1995 年**：von Mayrhauser & Vans 综述 5 种程序理解 cognitive model，用 verbal protocol，易被主观编码污染。
- **1988-2006 年**：Crosby / Uwano 用 eye-tracking 量化阅读路径——知 where + when，不知 what。
- **2014 年**：Siegmund 团队（Passau / Magdeburg / CMU）借神经科学合作者 Brechmann 的 fMRI 实验室，第一次在 ICSE 发神经成像论文。
- **2017 年**：Floyd 等做 expert vs novice 对比；**2018 年** Peitek 等用 EEG + eye-tracking 同步测量。
- **2023 年**：Srikant 等用 MD system 框架挑战"语言中枢主导"结论——领域仍在演化。

## 学到什么

1. **行为代理 vs 生理测量**——self-report / eye-tracking 能告诉你 where + when，fMRI 第一次在 SE 顶会直接测 what。
2. **配对控制任务设计是 contrast 实验的灵魂**——语法错误定位控制任务是最被低估、被后续研究反复借鉴的方法论模板。
3. **强结论的诱惑 vs 弱版本的诚实**——论文数据只支持弱版本，但 abstract 和 implication 倾向暗示强版本。
4. **N=17 的 finding 也能引爆领域**——好的方法论 + 好的 contrast + 顶会平台很重要；同样要警惕用大样本重验。

## 延伸阅读

- 视频：[Janet Siegmund — ICSE 2014 talk](https://www.youtube.com/results?search_query=siegmund+icse+2014+fmri)（作者亲讲）
- 后续 1：[Floyd et al. 2017 PLoS ONE — Decoding the Representation of Code in the Brain](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0173613)
- 后续 2：[Peitek et al. 2018 ICSE — Simultaneous fMRI and Eye Tracking](https://dl.acm.org/doi/10.1145/3180155.3180188)
- 反方论文：[Srikant et al. 2023 — Program Comprehension Does Not Primarily Rely On the Language Centers](https://arxiv.org/abs/2304.12373)
- [[anthropic-circuits]] —— LLM 内部"代码理解电路"是否对应人脑语言网络
- [[cognitive-load-theory]] —— 学不会不是不努力，是工作记忆装不下

## 关联

- [[cognitive-load-theory]] —— 工作记忆理论；BA6 中额回激活与 snippet 负荷相关
- [[anthropic-circuits]] —— LLM 内部电路对照人脑语言网络
- [[copilot-rct]] —— Copilot 工业 RCT 与"代码 = 语言"叙事互证
- [[hindley-milner]] —— 类型推导也是"读代码懂含义"，可类比语义整合 BA47
- [[hughes-fp-matters]] —— FP 可读性追求与"代码写给人读"哲学相通
- [[attention]] —— Transformer attention 与语义整合的结构对应
- [[cot]] —— Chain-of-Thought 的序列化思考呼应语言网络处理
- [[lambda-calculus]] —— λ 演算是最小语法骨架；BA44 句法激活对应语法解析层
- [[standard-ml]] —— Siegmund 后来研究 type system 认知负荷时的对照语言

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[attention]] —— Attention Is All You Need
- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[cot]] —— Chain-of-Thought Prompting
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[fsrs-spaced-repetition]] —— FSRS — 让 Anki 知道每张卡什么时候快被你忘掉
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
