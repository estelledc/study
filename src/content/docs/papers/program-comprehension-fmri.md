---
title: Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
来源: 'Siegmund et al., "Understanding Understanding Source Code with Functional Magnetic Resonance Imaging", ICSE 2014'
日期: 2026-05-30
分类: 软件工程认知科学
难度: 中级
---

## 是什么

Siegmund 2014 是一篇 **fMRI 论文**——让 17 个学生躺进核磁共振仪、读 Java 代码，看他们脑子里**哪些区域亮了**。日常类比：像在剧院顶上装一台热成像仪，看观众听不同剧种时身上哪儿发热。

主要发现：读代码时亮的是**语言区**（Broca / 中颞回 / 顶下小叶），**不是**数学区（顶内沟 / 顶上小叶）。换句话说，编程在大脑里更像**读散文**，不像**解方程**。

这是首篇把 fMRI 引入软件工程实证研究的论文，给"编程是一种语言"这种民间口号第一次提供了**生理学证据**。在此之前，关于"程序员在想什么"的所有研究都是 self-report / think-aloud / 阅读时间——全都是行为代理，没有大脑实际活动的 ground truth。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 Code.org / Hour of Code 敢说"5-10 岁就能学编程"——背后引证根就是这篇
- 为什么 Copilot / Claude Code 用语言模型 backbone 写代码合理——脑科学背书
- 为什么"我数学不好所以学不会编程"是错的焦虑——这两个能力在大脑里走不同通路
- 为什么后续 2017 / 2018 / 2023 一连串 fMRI 论文都从这篇出发

## 核心要点

整篇论文的逻辑可以拆成 **三步**：

1. **配对控制任务**：每段代码做两次——一次"读懂它"，一次"在同代码里找 `for` 关键词"。两个任务的 BOLD 信号相减，剩下的就是**理解贡献的部分**。这一步去掉了视觉、注意、阅读姿势等共同因素。

2. **统计阈值**：用 SPM8 跑 GLM contrast，cluster-level **FWE p<0.05** 校正——多重比较里最严格那档，宁可漏报不要假阳。

3. **结果定位**：5 个显著区全在**左半球语言网络**——BA44/45（Broca 后部）、BA47（Broca 前部）、BA6（中额回）、BA40（顶下小叶）、BA21（中颞回）。**没**亮的是 IPS（数学）和顶上小叶（空间）。

三步加起来支持一个弱版本假说：**程序理解和自然语言理解激活相同脑区**。

## 实践案例

### 案例 1：实验装置长什么样

```
被试躺仪器里 ──> 屏幕显示 12 个 Java 函数（5-22 行）
              └─> sum / count / sort / search / palindrome
                  每段 30-50 秒"读懂" + 30 秒找 `for` + 20 秒休息
扫描器：Siemens 3T MAGNETOM Trio EPI，TR=2s，体素 3×3×3 mm³
```

每被试约 30 分钟，行为正确率 > 90%——证明被试真的在做任务，不是 zone out。

被试筛选条件：右利手（避免语言中枢偏侧化干扰）+ 无金属植入物（安全 + 伪影）+ 无阅读障碍史。这些细节看起来繁琐，但任一项不控制都会让差分对比失效。

### 案例 2：差分对比是怎么做的

```
理解任务 BOLD 信号  -  syntax search BOLD 信号  =  "理解贡献" 差分图
       ↑                       ↑
  视觉+注意+阅读           视觉+注意+阅读
  + 语义整合               + 关键词匹配
```

减完只剩**语义整合**那一份。这是 fMRI 实验的金标准，2014 之前 SE 领域几乎无人这样做。

### 案例 3：5 个亮起来的脑区

| 区域 | Brodmann | 在自然语言里管什么 |
|---|---|---|
| Broca 后部 | BA44/45 | 句法解析 |
| Broca 前部 | BA47 | 语义整合 |
| 中额回 | BA6 | 工作记忆 + 注意 |
| 顶下小叶 | BA40 | 语义检索 / 远距离依赖 |
| 中颞回 | BA21 | 词汇语义 |

**没亮**：IPS 顶内沟（数学/数量）、SPL 顶上小叶（空间）、DLPFC（高层抽象逻辑）。

值得注意的几个细节：

- 5 个区**全在左半球**——和右利手被试的语言偏侧化一致，本身是 sanity check
- **BA47 比 BA44 激活更强**——理解代码时语义 > 语法，符合"读 if-else 链时主要在拼意思"的直觉
- **BA40 是个意外**——它在自然语言里管远距离 dependency tracking，在代码里被用来追踪变量 scope / 函数调用链
- **DLPFC 部分激活但未达阈值**——后续 Peitek 2018 在更大样本上发现 DLPFC 也显著

## 踩过的坑

1. **把"激活同一区"当成"共享同一神经机制"**——fMRI 体素 3 mm 内含数百万神经元，论文数据只支持弱版本（区域复用），强版本要单细胞或 ECoG 才能证明。abstract 里的措辞容易让人读出强版本结论。

2. **把"未激活 = 数学区不参与"当结论**——FWE 严格阈值假阴性高，2023 年 Srikant 等用 MD system（Multiple Demand 系统）框架直接挑战这个结论，发现数学/认知控制区其实也参与。这是论文最容易被外推过头的点。

3. **把 12 个算法小函数结论外推到所有"程序理解"**——业务代码（form validation / 状态机 / 事件回调链）的理解更靠 schema 检索 + 状态追踪，可能激活前额叶 / 海马等论文未观察到的区域；架构思考甚至可能激活空间区域。

4. **把 N=17 当 universal**——现代 fMRI 推荐 N≥30，且样本是 Magdeburg 高年级 CS 学生 + Java 单语言；工业 senior + 多语言生态（Python / Rust / TypeScript）结论无法直接外推；IRB 限制让 raw BOLD 数据永远拿不到独立复算。

## 适用 vs 不适用场景

**适用**：

- 给"编程像语言学习"的教育叙事找生理学引证
- 评估 LLM-code 设计哲学（用语言模型 backbone 处理代码合理）
- 设计 IDE 错误信息 / 文档时偏向"读散文"的认知模式
- 反驳"必须先精通数学才能学编程"的传统直觉
- 给变量命名 / 注释风格 / 文档可读性研究找参照（自然语言可读性方法可借鉴）

**不适用**：

- 评估具体开发者个体（fMRI 太贵 + N 太小，论文是群组级 finding）
- 推断架构思考 / 系统设计 / 形式化验证的脑活动（论文 stimuli 是小函数）
- 给"编程绝对不是数学"做强结论（2023 Srikant 已部分推翻）
- 工业真实 IDE 场景（被试不能 scroll、不能切文件、不能边写边改）
- 跨语言外推（论文只测 Java，函数式 / 系统语言可能不同）

## 历史小故事（可跳过）

- **1975 年**：Brooks 提出口号 "programs are written for people, computers just happen to execute them"。哲学断言，没数据。
- **1995 年**：von Mayrhauser & Vans 综述 5 种程序理解 cognitive model（top-down / bottom-up / opportunistic / integrated / systematic），用 verbal protocol，被实验员主观编码污染。
- **1988-2006 年**：Crosby / Uwano 用 eye-tracking 量化阅读路径——知 where + when，不知 what。
- **2014 年**：Siegmund 团队（Passau / Magdeburg / CMU）借神经科学合作者 Brechmann 的 fMRI 实验室，第一次在 ICSE 发神经成像论文，被试和扫描仪都来自 Magdeburg 大学。
- **2017 年**：Floyd 等做 expert vs novice 对比，发现专家 BA6 工作记忆区激活更强、IPL 语义检索更弱。
- **2018 年**：Peitek 等用 EEG + eye-tracking 同步测量补 fMRI 时间分辨率不足。
- **2023 年**：Srikant 等用 MD system 框架直接挑战"语言中枢主导"结论——领域仍在演化。

## 学到什么

1. **行为代理 vs 生理 ground truth**——self-report / eye-tracking 能告诉你 where + when，但 fMRI 第一次告诉你 what。研究方法论的代际跃迁。
2. **配对控制任务设计是 contrast 实验的灵魂**——syntax search 控制任务设计是最被低估、被后续 EEG / attention 研究反复借鉴的方法论模板。
3. **强结论的诱惑 vs 弱版本的诚实**——论文数据只支持弱版本，但 abstract 和 implication 倾向暗示强版本，这是读 empirical 论文必练的判断力。
4. **N=17 的 finding 也能引爆领域**——好的方法论 + 好的 contrast 设计 + 顶会平台，比 N 大更重要；但同样要警惕在 2026 标准下用大样本重验。

## 延伸阅读

- 视频：[Janet Siegmund — ICSE 2014 talk](https://www.youtube.com/results?search_query=siegmund+icse+2014+fmri)（作者亲讲，30 分钟）
- 后续 1：[Floyd et al. 2017 PLoS ONE — Decoding the Representation of Code in the Brain](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0173613)（expert vs novice + MVPA 解码）
- 后续 2：[Peitek et al. 2018 ICSE — Simultaneous fMRI and Eye Tracking](https://dl.acm.org/doi/10.1145/3180155.3180188)（多模态补 fMRI 时间分辨率）
- 反方论文：[Srikant et al. 2023 — Program Comprehension Does Not Primarily Rely On the Language Centers](https://arxiv.org/abs/2304.12373)（用 MD system 反过来挑战 Siegmund 结论）
- [[anthropic-circuits]] —— LLM 内部"代码理解电路"是否对应人脑语言网络
- [[cognitive-load-theory]] —— 学不会不是不努力，是工作记忆装不下

## 关联

- [[cognitive-load-theory]] —— 工作记忆理论；BA6 中额回的激活在论文里和 snippet 长度正相关，符合工作记忆负荷预测
- [[anthropic-circuits]] —— Anthropic 用 mechanistic interpretability 探查 LLM 内部，对照人脑语言网络给"语言模型写代码"找到双向证据
- [[copilot-rct]] —— Copilot 工业 RCT 证明 LLM-code 提速，与"代码 = 语言"叙事在用户认知层面互证
- [[hindley-milner]] —— 类型推导也是一种"读代码懂含义"的过程，可类比到论文的语义整合 BA47
- [[hughes-fp-matters]] —— FP 提倡的可读性追求，与"代码写给人读"哲学根脉相通
- [[attention]] —— Transformer attention 处理 token 序列的方式与人脑处理代码的语义整合存在结构对应
- [[cot]] —— Chain-of-Thought 让 LLM 像人类一样"分步思考"，呼应人脑语言网络处理代码的序列化特性
- [[lambda-calculus]] —— λ 演算是程序的最小语法骨架；论文 BA44/45 的句法激活恰好对应这种"语法解析"层
- [[standard-ml]] —— ML 是 Siegmund 后来研究 type system 认知负荷时常用的对照语言

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[fsrs-spaced-repetition]] —— FSRS — 让 Anki 知道每张卡什么时候快被你忘掉

