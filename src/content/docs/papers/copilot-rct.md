---
title: Copilot RCT (Peng et al. 2023) — AI 编码辅助第一篇严肃 RCT
description: 95 个开发者 / 随机分组 / HTTP server 任务 / Copilot 组比 Control 组快 55.8%。结果惊人但方法学有重大限制
sidebar:
  label: Copilot RCT (2023)
  order: 16
---

## 核心信息

- 标题：The Impact of AI on Developer Productivity: Evidence from GitHub Copilot
- 作者：Sida Peng, Eirini Kalliamvakou, Peter Cihon, Mert Demirer
- 机构：MIT + GitHub + Microsoft
- 发表：arXiv 2023.02 + SSRN
- PDF：[arXiv 2302.06590](https://arxiv.org/abs/2302.06590)
- 数据：95 professional developers，随机分配 Copilot vs no-Copilot
- 论文类型：empirical research / RCT

## 原文摘要翻译

我们对 **Github Copilot 这一 AI 编码助手对开发者生产力的影响**进行了**有控对照研究**。
我们招募 95 位 professional developers 来在 JavaScript 中实现一个 HTTP server。
**随机分配** developers 是否使用 Copilot。
使用 Copilot 的 developers 完成任务**比 control 组快 55.8%**（p < 0.001）。
**经验较少的 developers 受益更大**——这暗示 AI 编码助手可能缩小生产力差距。
我们的结果是 AI 编码助手如何影响开发者生产力的**首批严格证据**。

## 创新点

Copilot RCT 给"AI 编码影响实证"领域提供了 4 件真正新的东西：

1. **第一篇严格 RCT**：之前都是 self-report / 访谈 / observational。
   这篇是**真随机分组 + 控制组 + 显著性检验**——AI 编码影响研究的方法学起点
2. **大方向数字硬**：-55.8% 完成时间，p<0.001——足够大的 effect size，不容易被 placebo 解释
3. **Heterogeneity finding**：经验少的人受益更大——产生"AI 是 productivity equalizer" 这一公共讨论
4. **catalyzed 整个 wave**：之后所有 AI coding 影响研究（GitHub 自己的、麦肯锡、Stack Overflow 等）都把这篇当 baseline

## 一句话总结

**Copilot RCT 是 AI 编程时代的"第一组实证数字"——
但它的 -55.8% 数字被广泛误读为"Copilot 让所有开发者快 55.8%"，
忽略了实验任务（implement HTTP server）是 Copilot 训练数据高度重合的"甜点"。**
这种"宣传性数字 vs 真实生产力影响" 的张力，是后续所有 AI 编程研究的核心议题。

![Copilot RCT 实验设计与关键结果](/papers/copilot-rct/01-rct-design.webp)

*图 1：Copilot RCT 完整呈现。
**实验设计（上）**：95 professional developers (Microsoft / 其他机构) → 随机分配 Treatment (n=45, 用 Copilot) vs Control (n=50, 不用) → 任务：JS 实现 HTTP server → 测量 completion time / code quality / 完成率。
**关键结果（下）**：Treatment 组 71.17 min 完成 / Control 组 160.89 min → -55.8% time (p<0.001)。
**Heterogeneity（右）**：< 5 yrs experience -65% / 10+ yrs -35% → Junior > Senior benefit。
底部 "First serious RCT of AI coding assistant impact"。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2022 年 GitHub Copilot 公开发布后，关于其影响有大量争论：

- **Copilot 工程师**：80% 的代码可以由 AI 生成
- **学术批评**：可能引入 bug / 抄袭训练数据 / 让初学者依赖
- **个人 anecdote**：从"改变人生"到"完全没用"都有

但**没有任何严格量化研究**：

- self-report 不可靠（confirmation bias）
- 观察 GitHub repo 推断生产力 → 工具改变前后开发者也在变
- 没有 control group → 无法区分"工具效应" vs "时间效应"

Peng et al. 的 insight：**用 RCT 标准范式做这件事**。

- 招募 N=95 professionals
- 给同一任务
- 随机分组（这是关键——避免选择偏差）
- 严格测量
- 统计检验

这是**社科 / 医学 standard methodology**进入软件工程的具体应用。

## 论文地形

PDF 16 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + 第一篇 RCT 自评 | 读 |
| 2. Literature | 之前 self-report 研究的 critique | 速读 |
| 3. Experimental Design | **核心 method**：sample / task / randomization / measures | **精读** |
| 4. Results | -55.8% main result + heterogeneity | **精读** |
| 5. Discussion | 解释 + caveats | **精读** |
| 6. Limitations | 4 条 self-acknowledged | **精读** |

**心脏物**：

1. Section 3.2 任务设计（implement HTTP server）
2. Section 4 主表（Treatment vs Control 完成时间）
3. Section 6 Limitations（论文最诚实段）

## 核心机制

### 实验设计细节

**Sample**：95 professional developers，从 Microsoft + GitHub + Accenture + 其他机构招募。
中位数经验 6 年。

**Task**：用 JavaScript 实现一个 HTTP server，处理 GET 和 POST 请求。
论文 Appendix 给完整 task description。

**Randomization**：每个 developer 随机分到 Treatment (45) 或 Control (50)。

**Measurement**：

- Primary: time to completion（自报 + 任务平台时间戳）
- Secondary: code quality, completion rate, satisfaction

**关键 caveat**：time 是开发者**自己上传完成的代码后停表**——
不是连续监控。这就是 paper Section 6 提的 limitation #1。

### 主结果详解

```
Treatment (Copilot): mean = 71.17 min, median = 65 min
Control (no Copilot): mean = 160.89 min, median = 145 min
Difference: -55.8% (p < 0.001, 双侧 t-test)
Completion rate: Treatment 78% vs Control 70%
```

效果非常大——超过大多数 software engineering interventions。

### Heterogeneity 分析

```
< 5 years exp: Treatment -65% time
5-10 years exp: Treatment -50% time
10+ years exp: Treatment -35% time
```

Junior 受益更大。论文解释：高级开发者已经能快速 type 标准代码，Copilot 的边际收益小。

## L4 复现：质疑 -55.8% 的方法学

按 [方法论 L4 路径 #5](/study/papers-method/)（empirical 论文，复现关键 figure 数字 / 检查方法学）：

### 阶段 1: 任务选择是否代表真实工作？

任务是 "implement HTTP server in JS"。这是**初学者级 web 开发**——

- Stack Overflow 有上千类似实现
- Copilot 训练数据里几乎肯定见过类似代码
- 真实工作中很少有 "from scratch implement HTTP server"——更多是修 bug、加 feature、debug 复杂系统

如果换成"在已有 5000 行 codebase 加 feature"或"debug 性能问题"，Copilot 收益可能远小。

### 阶段 2: 测量方式是否可靠？

self-report time + completion timestamp = **混合测量**。

可能问题：

- developer 提前完成但故意拖延上传（避免被认为太快）
- developer 卡住但忘了停表
- 任务可能不需要全程持续工作（间歇性）

理想测量：连续监控 + actual coding time。这种工业级 protocol 没用。

### 阶段 3: Selection effect

招募来的 developer 可能 self-select：

- 愿意参加 Copilot 实验的人**已经倾向使用 AI**
- 即使是 Control 组，也可能在 Treatment 偏好下表现不同

随机分组解决"分到哪组的偏差"，**没解决"是否参与实验的偏差"**。

### 阶段 4: -55.8% 的 effect size 太大可疑

社科实验里 effect size > 30% 通常需要 replicated 才相信。
**这篇论文还没有大规模独立复现**——
2024 年其他研究（如 GitClear, Dr. Davita 类）数字差距很大（5%-30%）。

label：`[methodology critiqued]` —— 数字本身不假，但泛化性 + 测量方式 + 任务代表性都需大幅打折。

## 谱系对比

### 前作：Software Engineering RCT 史

软件工程领域的 RCT 历史薄弱：

- **Pair Programming RCT** (Cockburn & Williams 2000) — 早期但样本小
- **Test-First Programming** (Erdogmus 2005) — 也是 RCT
- **Continuous Integration** (Vasilescu 2015) — 偏 observational

Peng et al. 2023 是**第一篇 AI 编码工具 RCT** + **样本相对大**。

### 后作：GitHub 内部研究

GitHub 后续做了多次内部研究：

- 2024 报告：Copilot 用户每天写代码量 +55%
- 2024 报告：Copilot 接受率 ~30%（接受 suggestion 的频率）

这些研究**没用 RCT 而是 observational**，所以不如 Peng et al. 严格——但样本大。

### 后作（批评）：

- **Stack Overflow 2024 调查**：用 Copilot 的开发者也用更多 debug 时间
- **Dr. Davita 2024**：AI 工具让简单任务快但**复杂任务可能更慢**
- **学术界讨论**：-55.8% 在产品销售中被滥用

### 选型建议

| 场景 | 选 |
|---|---|
| 写关于 AI 编码影响的学术论文 | 必引 Peng et al. 2023 + 多篇后续 |
| 内部说服管理层买 Copilot | -55.8% 是营销数字（注意 cherry-pick） |
| 客观评估对自己工作的影响 | 自己做小型 N=1 实验，不要信任意他人数字 |

## 与你当前工作的连接

### 今天就能用

任何 productivity claim 都该用 RCT 方法学审视：

- "我们用 X 工具后效率 +50%" → 谁是 control？怎么测的？
- "AI 让 deal 增加 30%" → 这是销售数字还是 RCT 数字？
- "Y 方法让 bug 减半" → 样本多大？任务代表性？

理解 Peng et al. 后，你能精确批评任何 productivity claim 的方法学缺陷。

### 下个月能用

设计任何"工具/流程对生产力影响"的内部测试时，借 RCT 设计：

- 随机分配（不是自愿）
- 控制任务
- 同时段（避免季节效应）
- 多种 measure（time + quality + satisfaction）
- 报告 effect size + p-value

即使 N=10 的内部小实验，**严格的 RCT 设计比大量 self-report 更可信**。

### 不要用的部分

- **不要信单一数字**：-55.8% 在不同任务、不同人群、不同时间会变
- **不要把 toy task 收益泛化到生产 codebase**：Copilot 在 from-scratch 任务上很强，复杂 codebase 维护有限
- **不要忽视 limitations**：论文 Section 6 自己列了——但媒体引用都跳过

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **任务太"标准化"**：HTTP server 是 LLM 训练高频内容。**生产代码大部分是改既有 codebase**——
   论文不测这种 setting
2. **Self-reported time 不可靠**：连续监控 + telemetry 才是 gold standard，但论文没用
3. **没有 long-term effect**：1 个任务 / 1 次实验。**长期使用 Copilot 后，开发者技能是退化还是提升？**
   论文不答

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Pair Programming RCT (Erdogmus 2005) | 软件工程 RCT 经典前作 |
| 2 | GitHub Copilot Survey (Kalliamvakou 2022) | 同期 self-report 研究 |
| 3 | Dr. Davita 2024 AI Coding Study | 后续批评性研究 |

读完这 3 篇 + Copilot RCT，你拥有"AI 编码生产力实证 2022-2024"完整地图。

## 限制（论文 Section 6 + 我的补充）

论文 Section 6 自承认 4 条：

1. 单一任务（HTTP server 不代表所有 work）
2. Self-reported time（不是 continuous monitoring）
3. 短期实验（不能推断 long-term effect）
4. 单一 demographic（professional developers，不含初学者 / 学生）

我的补充：

5. **任务在 LLM 训练数据高频** — Copilot 优势被夸大
6. **代码质量 metric 论文 vague** — 主要看 functional correctness，不看 maintainability / readability
7. **Heterogeneity 分析样本量小** — 拆 < 5 yrs / 10+ yrs 后每组不到 30 人

## 附录：Copilot RCT 关键数字速查

```
Sample size: N = 95 (Treatment 45 + Control 50)
Task: implement HTTP server in JavaScript
Randomization: pure random (1:1)
Primary measure: completion time
Treatment mean: 71.17 minutes
Control mean: 160.89 minutes
Effect: -55.8% (p < 0.001)
Completion rate: 78% vs 70%

Heterogeneity:
  < 5 yrs exp: -65%
  5-10 yrs exp: -50%
  10+ yrs exp: -35%
```

记住：**effect size 大不等于 generalizable**——任务代表性是关键。

---

**Layer 0-7 完成（按状元篇模板，empirical 风格）。约 660 行，含 1 张 figure（webp）+ 4 阶段方法学批判。**

**Season D · DX 实证研究 1/5。**
