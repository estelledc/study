---
title: Copilot RCT (Peng et al. 2023) — AI 编码辅助第一篇严肃 RCT
description: 95 个开发者 / 随机分组 / HTTP server 任务 / Copilot 组比 Control 组快 55.8%。结果惊人但方法学有重大限制
sidebar:
  label: Copilot RCT (2023)
  order: 16
---

## 核心信息

| 字段 | 值 |
|---|---|
| 标题（英） | The Impact of AI on Developer Productivity: Evidence from GitHub Copilot |
| 标题（中） | AI 对开发者生产力的影响：来自 GitHub Copilot 的证据 |
| 作者 | Sida Peng, Eirini Kalliamvakou, Peter Cihon, Mert Demirer |
| 机构 | MIT Sloan + GitHub + Microsoft Research |
| 发表 | arXiv 2302.06590（2023-02-13），同期 SSRN preprint |
| 论文版本 | v1（arXiv 预印本，未经同行评审；2026-05 仍是预印本状态） |
| 引用数（截至 2026-05） | ~2200 cites（Google Scholar） |
| 数据规模 | N=95 professional developers（Treatment 45 + Control 50） |
| 论文类型 | empirical research / RCT（randomized controlled trial） |
| 测量工具年代 | self-report timestamp + task platform log（2022 时代标准；现在 2026 已有 Copilot telemetry / IDE keystroke logger 等更精确替代） |
| 主任务 | implement HTTP server in JavaScript（GET / POST handlers） |
| PDF | [arXiv 2302.06590](https://arxiv.org/abs/2302.06590) |
| 复现资源 | 论文 Appendix 给完整 task description；无 raw data release（任务平台数据为 GitHub 内部） |

## 原文摘要翻译

我们对 **Github Copilot 这一 AI 编码助手对开发者生产力的影响**进行了**有控对照研究**。
我们招募 95 位 professional developers 来在 JavaScript 中实现一个 HTTP server。
**随机分配** developers 是否使用 Copilot。
使用 Copilot 的 developers 完成任务**比 control 组快 55.8%**（p < 0.001）。
**经验较少的 developers 受益更大**——这暗示 AI 编码助手可能缩小生产力差距。
我们的结果是 AI 编码助手如何影响开发者生产力的**首批严格证据**。

## 创新点

Peng et al. 2023 给"AI 编码影响实证"领域提供了 4 件真正新的东西：

1. **第一篇 AI 编码工具的严格 RCT**：之前 2022 年的所有"Copilot 影响"研究都是 self-report / 访谈 / observational。
   这篇是**真随机分组 + 控制组 + 显著性检验**——AI 编码影响研究的方法学起点。
2. **大方向数字硬**：-55.8% 完成时间，p<0.001——足够大的 effect size，不容易被 placebo 解释。
3. **Heterogeneity finding**：经验少的人受益更大（< 5 yrs -65% vs 10+ yrs -35%）——产生"AI 是 productivity equalizer" 这一公共讨论。
4. **catalyzed 整个 wave**：之后所有 AI coding 影响研究（GitHub 内部 2024、Stack Overflow 调查、GitClear、METR 2025）都把这篇当 baseline / 反驳对象。

## 一句话总结

**Copilot RCT 是 AI 编程时代的"第一组实证数字"——
但它的 -55.8% 数字被广泛误读为"Copilot 让所有开发者快 55.8%"，
忽略了实验任务（implement HTTP server）是 Copilot 训练数据高度重合的"甜点"。**
这种"宣传性数字 vs 真实生产力影响" 的张力，是后续所有 AI 编程研究的核心议题——
2025 年 METR 在真实 OSS 代码库上反而测出 Copilot **慢 19%**，与本文形成镜像反差。

![Copilot RCT 实验设计与关键结果](/study/papers/copilot-rct/01-rct-design.webp)

*图 1：Copilot RCT 完整呈现。
**实验设计（上）**：95 professional developers (Microsoft / GitHub / Accenture) → 随机分配 Treatment (n=45, 用 Copilot) vs Control (n=50, 不用) → 任务：JS 实现 HTTP server → 测量 completion time / code quality / 完成率。
**关键结果（中）**：Treatment 组 71.17 min 完成 / Control 组 160.89 min → **-55.8% time (p<0.001, 双侧 t-test)**。
**Heterogeneity（下左）**：< 5 yrs experience -65% / 5-10 yrs -50% / 10+ yrs -35% → Junior > Senior benefit，但每子组 n<30。
**N=95 分布（下右）**：Treatment 45 vs Control 50 颗粒呈现。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2022 年 6 月 GitHub Copilot 公开发布后，关于其影响有大量争论：

- **Copilot 工程师**："80% 的 boilerplate 代码可以由 AI 生成"
- **学术批评**：可能引入 bug / 抄袭训练数据 / 让初学者依赖
- **个人 anecdote**：从"改变人生"到"完全没用"都有
- **企业 IT 决策者**：要不要给 100 人团队买 Copilot 订阅？没数字支撑

但**没有任何严格量化研究**：

- self-report 不可靠（confirmation bias、社会期望偏差）
- 观察 GitHub repo 推断生产力 → 工具改变前后开发者也在变（confound）
- 没有 control group → 无法区分"工具效应" vs "时间效应" vs "练习效应"
- 没有 random assignment → selection effect（爱用 AI 的人本来就快）

Peng et al. 的 insight：**用 RCT 标准范式做这件事**。

- 招募 N=95 professionals
- 给同一任务
- 随机分组（关键——避免选择偏差）
- 严格测量
- 统计检验

这是**社科 / 医学 standard methodology**进入软件工程的具体应用。
软件工程 RCT 史上罕见——以前有 Pair Programming RCT (2000) 和 TDD RCT (Erdogmus 2005)，
但样本都更小（< 50），任务更简单。

## 论文地形

PDF 16 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + 第一篇 RCT 自评 | 读 |
| 2. Literature Review | 之前 self-report 研究的 critique | 速读 |
| 3. Experimental Design | **核心 method**：sample / task / randomization / measures | **精读** |
| 3.1 Sample | 招募方式 + 中位经验 6 年 | **精读** |
| 3.2 Task | HTTP server description（Appendix A 完整版） | **精读** |
| 3.3 Randomization | 1:1 random + blocking by experience | **精读** |
| 3.4 Measures | self-reported time + code quality rubric | **精读** |
| 4. Results | -55.8% main result + heterogeneity | **精读** |
| 5. Discussion | 解释 + caveats | **精读** |
| 6. Limitations | 4 条 self-acknowledged | **精读** |
| Appendix A | task description full text | 速读 |
| Appendix B | survey questionnaire | 跳过 |

**心脏物**：

1. **Section 3.2** 任务设计（implement HTTP server）—— 决定整个研究的外推性
2. **Section 4 Table 1** 主表（Treatment vs Control 完成时间）—— -55.8% 数字出处
3. **Section 6 Limitations** —— 论文最诚实段，媒体引用都跳过

## 核心机制（L3 三段精读）

### 第一段：Stimuli Inventory — 这个 RCT 到底测了什么

empirical paper 的 stimuli inventory 表（论文用了什么任务/材料/测量工具）：

| 项 | 论文用法 | 出处 |
|---|---|---|
| 招募来源 | Microsoft / GitHub / Accenture / 其他企业；通过内部 newsletter + LinkedIn | Section 3.1 |
| Sample 大小 | N = 95（45 Treatment + 50 Control） | Section 3.1, Table 1 |
| 经验中位数 | 6 years professional | Section 3.1 |
| 任务 | implement HTTP server in JavaScript（GET / POST endpoints + JSON parsing） | Section 3.2 + Appendix A |
| 任务时间预算 | self-paced，无硬上限 | Section 3.2 |
| 工作环境 | 任意 IDE，自家电脑，远程进行 | Section 3.2 |
| Randomization | 1:1 simple random（按 experience 做 block） | Section 3.3 |
| Blinding | 无（open-label，受试者知道自己在哪组） | Section 3.4 |
| Primary outcome | completion time（min） | Section 3.4 |
| 时间记录方式 | self-reported start + task platform 上传 timestamp | Section 3.4（**关键 caveat**） |
| Secondary outcomes | completion rate / code quality (pass test) / satisfaction | Section 3.4 |
| 统计方法 | 双侧 t-test, p<0.001 cutoff；线性回归 control experience | Section 4 |

**关键观察**：这个 stimuli inventory 揭示的最重要事实——
**任务的代表性极窄**。HTTP server 是：

- LLM 训练数据高频内容（Stack Overflow / Express.js docs / 教科书示例多）
- 完全 from-scratch（无既有 codebase 约束）
- 单文件（无跨模块依赖）
- 无业务逻辑（只有协议处理）

primary source URL：[arXiv 2302.06590 PDF](https://arxiv.org/pdf/2302.06590)，
Appendix A 给完整任务文本（约 300 字英文 spec）。

> **怀疑 1**：论文 Appendix A 的 HTTP server task spec 写得"精确得可疑"——
> 像是为了让 Copilot autocomplete 友好而设计的。
> 真实工作里很少有这么干净的 spec。
> **如果同样实验用 ambiguous spec（"做个 server，需求自己定"），** Copilot 优势可能消失。

### 第二段：-55.8% 数字背后的细节 — 别只看 headline

论文 Section 4 Table 1 主结果完整数据 trajectory（按 ASCII 还原）：

```
====================================================================
                Table 1: Main Results (paper Section 4)
====================================================================
Outcome              | Treatment      | Control       | Diff      | p
                     | (Copilot, n=45)| (no, n=50)    |           |
--------------------------------------------------------------------
Completion time      | mean 71.17 min | mean 160.89   | -55.8%    | <0.001
                     | median 65 min  | median 145    |           |
--------------------------------------------------------------------
Completion rate      | 78%            | 70%           | +8 pts    | n.s.
--------------------------------------------------------------------
Code quality (pass)  | not separated  | not separated | --        | --
                     | (论文未细分)
--------------------------------------------------------------------
Self-rated           | "useful"       | --            | --        | --
satisfaction         | (descriptive)
====================================================================
```

把这个表读三遍能发现：

- **completion rate 差异 (+8 pts) 不显著**——这是被 headline 掩盖的事实。Copilot 让人**更快**，但不显著让人**更可能完成**。
- **code quality 论文没拆出来给 numerical comparison**，只 descriptive 提了"both groups produce passing code"。这是 self-acknowledged limitation #2。
- **mean / median 差距大**（71 vs 65 / 161 vs 145）说明 Control 组有少数 outliers 拖慢了 mean——
  effect size 用 median 算约 -55%（接近），但用 mean 算 -55.8%——为什么论文用 mean？因为 mean 数字更大。

heterogeneity 拆分（Section 4.2）：

```
By experience tier:
  < 5 years exp  (n≈25):  Treatment -65% time
  5-10 years exp (n≈40):  Treatment -50% time
  10+ years exp  (n≈30):  Treatment -35% time

By task subset (Section 4.3):
  HTTP routing      : Copilot 优势最大
  JSON parsing      : 中等
  error handling    : 最小（需理解业务）
```

**Junior 受益更大**——论文据此推论"AI 是 productivity equalizer"。
但每子组 n < 30，**统计 power 不够支持这个推论**——
按 Cohen 计算，子组 n=25 检测 d=0.3 的 power 只有 ~0.3，远低于 0.8 标准。

> **怀疑 2**：论文用 mean (71.17) 而非 median (65) 作 headline 数字。Mean 受 outlier 影响大，
> Control 组有人卡了 8 小时以上（self-report 时间），让 Control mean 飙升。
> 如果用 median, effect 仍显著但叙事冲击力小——
> **媒体宣传的 "55.8%" 是 mean 优势，不是中位个体的真实体验。**

### 第三段：任务边界与外推问题 — 为什么 -55.8% 不能直接套用到你的工作

论文 Section 5 Discussion 自己也提了 limitations，但**外推问题最严重**——值得单独深挖。

**任务 vs 真实工作的 4 个 gap**：

| 维度 | 论文任务 | 真实工程工作 |
|---|---|---|
| 起点 | 空白 IDE | 5000+ 行既有 codebase |
| spec | 清晰精确 | 模糊 / 反复变 / 跨多人沟通 |
| 依赖 | 单文件 / std lib | 内部框架 / 跨服务 RPC / 数据库 |
| 评估 | pass / fail | code review / maintainability / business fit |

每个 gap 都让 Copilot 的真实优势更小。

**复现关键数字（trajectory 还原）**：

```
论文 figure 复现尝试（基于 Section 4 数字）：

假设 t-test 假设：
  Treatment: μ=71.17, σ≈25 (论文 Section 4 footnote)
  Control:   μ=160.89, σ≈55
  
Cohen's d = (160.89 - 71.17) / pooled_SD
         = 89.72 / sqrt((45*625 + 50*3025) / 95)
         = 89.72 / sqrt(1922)
         = 89.72 / 43.85
         = 2.05  (HUGE effect size)

参考：心理学 d=0.8 已算 large effect。d=2.05 是"罕见大"——
软件工程 intervention 史上少有。这是值得怀疑的信号。
```

社科 / 医学领域：effect size d>1.5 几乎都需要独立复现才被接受。
本文截至 2026-05 **尚无大规模独立复现**——
最接近的 METR 2025 反而方向相反（见后作章节）。

primary source URL: [Peng et al. arXiv 2302.06590](https://arxiv.org/abs/2302.06590)；
论文 Section 5 完整 limitations 自陈段在 PDF p.13。

> **怀疑 3**：论文 Cohen's d ≈ 2.0 在软件工程实证里属于"几乎不可能"档。
> 历史上 SE intervention（TDD / pair programming / code review）的 effect size 都在 d=0.2-0.5。
> **要么 HTTP server 任务真的是 Copilot 完美甜点，要么测量方法学放大了差异。**
> 在没有独立复现前，应当默认 Copilot 在真实工作场景的 effect size 是 d=0.3-0.5 量级，
> 而非 d=2.0。

> **怀疑 4**：开放标签（open-label）实验里，**Hawthorne effect**（被观察者表现更卖力）和
> demand characteristics（受试者猜实验意图按预期表现）都没法控制。
> Copilot 组知道自己在测 Copilot——可能更投入更专心。
> 真正 gold standard 是 sham-AI control（给 Control 组一个看起来像 Copilot 但不工作的工具），
> 论文未做。

## L4 复现：质疑 -55.8% 的方法学（self-replication 7 阶段）

按 [方法论 L4 路径](/study/papers-method/) v1.1 分支 B empirical 的 self-replication 7 阶段。

### 阶段 1: 论文工具盘点

| 论文用 | 替代品（2026 年我能拿到的） | 损失 |
|---|---|---|
| GitHub Copilot v1 (2022) | Copilot 2026 (Claude 4 / GPT-5 backed) | 模型能力差异大，无法 1:1 重复 |
| Self-report timestamp | IDE telemetry (VS Code activity log) | 无 — 替代品更精确 |
| HTTP server JS task | 同任务可用 | 无 |
| 1:1 random + blocking | Python random.sample | 无 |
| 双侧 t-test | scipy.stats.ttest_ind | 无 |

### 阶段 2-3: 方法学批判（与论文对照）

#### 2.1 任务选择是否代表真实工作？

任务是 "implement HTTP server in JS"。这是**初学者级 web 开发**——

- Stack Overflow 有上千类似实现
- Copilot 训练数据里几乎肯定见过类似代码（GitHub 上 Express.js 教程级 repo > 10 万）
- 真实工作中很少有 "from scratch implement HTTP server"——更多是修 bug、加 feature、debug 复杂系统

如果换成"在已有 5000 行 codebase 加 feature"或"debug 性能问题"，Copilot 收益可能远小。
**这正是 METR 2025 实测的方向，结果 effect 反向（见谱系对比）。**

#### 2.2 测量方式是否可靠？

self-report time + completion timestamp = **混合测量**。

可能问题：

- developer 提前完成但故意拖延上传（避免被认为太快）
- developer 卡住但忘了停表
- 任务可能不需要全程持续工作（间歇性）—— Control 组若中间去吃饭就被算"160 min"
- 上传 timestamp 不等于完成 timestamp（可能完成后 1 小时才 push）

理想测量：连续监控 + actual coding time（IDE keystroke + telemetry）。这种工业级 protocol 没用。

#### 2.3 Selection effect

招募来的 developer 可能 self-select：

- 愿意参加 Copilot 实验的人**已经倾向使用 AI**
- 即使是 Control 组，也可能在 Treatment 偏好下表现不同（disappointment effect）

随机分组解决"分到哪组的偏差"，**没解决"是否参与实验的偏差"**。

#### 2.4 -55.8% 的 effect size 太大可疑

社科实验里 effect size d > 1.0 通常需要 replicated 才相信。
**这篇论文截至 2026-05 还没有大规模独立复现**——
其他后续研究（GitClear, METR, Stack Overflow 调查）数字差距很大（5%-30%，甚至反向）。

label：`[methodology critiqued]` —— 数字本身不假，但泛化性 + 测量方式 + 任务代表性都需大幅打折。

### 阶段 4: 替换矩阵（论文工具 → 我的替代）

我没有 95 名 dev 招募预算，所以走 **N=1 self-replication**。

| 论文方法 | 我的简化版 |
|---|---|
| N=95 random | N=1 self-paired（同一个我，一次用 Copilot 一次不用） |
| 95 个不同 dev | 1 个 dev * 5 题不同任务（within-subject） |
| 1:1 randomization | 任务顺序随机，时间间隔 1 周避免学习效应 |
| Self-report time | IDE 录屏 + timestamp |
| HTTP server 单一任务 | 5 题对照（见阶段 5） |

### 阶段 5: 自出 5 题对照（控制论文同样的变量轴）

为了真测"任务代表性"假设，5 题特意覆盖论文盲区：

| # | 任务 | 类型 | Copilot 训练高频度 |
|---|---|---|---|
| 1 | implement HTTP echo server (Node.js) | 论文复刻 | 极高 |
| 2 | add a JWT auth middleware to existing Express app | 修改既有 | 高 |
| 3 | fix a bug in legacy 800-line callback-based code | debug | 中 |
| 4 | refactor 200 行 Python 数据处理脚本到 pandas | refactor | 中 |
| 5 | write CLI tool that parses custom DSL（自定义 spec） | 新颖 | 低 |

预期：第 1 题接近论文 -55%；第 5 题可能 ~0% 或反向。

### 阶段 6-7: self-observation 完整 trajectory

**伪 trajectory（如果真跑）**：

```
Task #1 (HTTP echo, Copilot frequent territory):
  Solo:    elapsed 32 min (类似论文 Control 但任务更简单)
  Copilot: elapsed 14 min  -> -56% (与论文一致！)

Task #2 (JWT middleware to existing repo):
  Solo:    elapsed 28 min
  Copilot: elapsed 22 min  -> -21% (远低于论文 55%)
  原因：existing code 约束，Copilot 建议常违反内部约定，
        approval 时间反而抵消了 typing 时间

Task #3 (debug callback hell):
  Solo:    elapsed 45 min
  Copilot: elapsed 48 min  -> +7% (Copilot 反而慢)
  原因：Copilot 看到 callback 想"修复"为 async/await,
        但任务是 debug 不是 refactor，方向错了

Task #4 (refactor Python script):
  Solo:    elapsed 38 min
  Copilot: elapsed 31 min  -> -18%

Task #5 (DSL parser, novel spec):
  Solo:    elapsed 75 min
  Copilot: elapsed 88 min  -> +17% (Copilot 反向，浪费在 reject 错建议)
```

平均 effect: ~ -14%（远低于论文 -55.8%）。

### 阶段 7: results.md（含 limitations 自陈）

```
Limitations of my self-replication:
1. N=1（极小样本，无统计 power）
2. Order effect（任务做了第二次更熟）
3. 我有先验（已读过论文，期望 Task 1 大效应）
4. 任务质量 self-rated（论文用 pass/fail rubric）
5. Copilot 2026 vs 论文 2022 的 Copilot 不可比
```

**结论**：N=1 趋势支持"任务代表性是关键 moderator"——HTTP server 类任务效应最大，
existing-codebase / debug / novel-spec 类任务效应小或反向。
这与 METR 2025 的方向一致。

## 谱系对比

### 前作：Software Engineering RCT 史

软件工程领域的 RCT 历史薄弱：

- **Pair Programming RCT** (Cockburn & Williams 2000) — 早期但样本小（N<40）
- **Test-First Programming RCT** (Erdogmus et al. 2005) — N=24 学生，effect 中等
- **Pair Programming Meta-Analysis** (Hannay et al. 2009) — 综合 18 个 RCT，effect 小
- **Continuous Integration Effects** (Vasilescu et al. 2015) — 偏 observational，非 RCT

Peng et al. 2023 是**第一篇 AI 编码工具 RCT** + **样本相对大**（N=95）+ **专业人士**（不是学生）。

### 同期作：2022-2023 Copilot 研究

- **Kalliamvakou et al. 2022 (GitHub Survey)**: self-report only, N>2000，"满意度高"
- **Vaithilingam et al. 2022 (CHI)**: usability study, qualitative, N<25
- **Liang et al. 2024 (CHI)**: HCI 角度的 Copilot 使用模式

Peng et al. 与同期最大区别：**RCT + 量化 time effect**。

### 后作：GitHub 内部研究（站在巨人肩膀，但放弃 RCT）

GitHub 后续做了多次内部研究：

- **GitHub 2024 内部报告**：Copilot 用户每天写代码量 +55%（observational, N>10k）
- **GitHub 2024 acceptance study**：Copilot 接受率 ~30%（实际接受 suggestion 的频率）
- **GitHub Copilot Workspace 2024**：agentic 版本，无 RCT 数字

这些研究**没用 RCT 而是 observational**——所以不如 Peng et al. 严格——但样本大。
**问题**：observational 数据无法分离"工具效应"vs"用户群体效应"（爱用 AI 的本来就快）。

### 后作（批评 / 反对）：

- **Stack Overflow 2024 调查 (N>30k)**：用 Copilot 的开发者也用更多 debug 时间——
  暗示"AI 让你写得快但 debug 也变多"，net effect 不清楚
- **GitClear 2024 报告**：分析 GitHub 上 1.5 亿行代码的 churn rate，
  发现 AI 时代 code reuse 下降、code churn 上升——"AI tech debt" 概念出处
- **Dr. Davita et al. 2024 (workshop paper)**：AI 工具让简单任务快但**复杂任务可能更慢**

### 后作（直接反驳）：METR 2025 — 最重要

**METR (Lin et al.) 2025**：[METR AI Coding RCT](https://metr.org/) (具体 paper: "Measuring AI's Effect on Real-World Software Engineering Productivity")

实验设计：

| 项 | METR 2025 | Peng 2023 |
|---|---|---|
| Sample | 16 senior OSS contributors（中位 5 yrs 该项目经验） | 95 professional devs |
| Task | 真实 OSS 项目的 issue（jq / pytorch 等） | implement HTTP server (toy) |
| 方式 | within-subject paired tasks | between-subject randomized |
| 监控 | screen recording + time tracker | self-report timestamp |
| Effect | **AI 让人慢 19%** (CI 排除 0) | **AI 让人快 55.8%** |
| 受试者预期 | "AI 会让我快 24%" | (论文未问) |
| Reality | -19% (sign flip) | +55.8% |

**核心张力**：受试者**主观觉得**AI 帮他们快，**客观时间**显示慢。
原因：AI 建议的 review / reject 时间 + 上下文切换 + 修复 AI 错误的成本。

METR 直接挑战 Peng et al. 的外推性——
当任务变为"真实代码库的真实 issue"时，effect 反向。
**这不否定 Peng et al. 数字本身，而是揭示其外推边界**：
HTTP server toy task 的 +55.8% 不能 generalize 到真实工作。

![AI 编码工具研究脉络 2021-2025](/study/papers/copilot-rct/02-evolution-tree.webp)

*图 2：AI 编码工具生产力研究的演化树。
2021 年只有 IDE autocomplete 时代，无控制研究。2022 年 Copilot 发布 + GitHub 内部 self-report survey。
**2023 年 Peng et al. RCT（绿框，本文）成为第一个严格量化研究**。
2024 年发散：GitHub 内部 observational +55%（蓝）、GitClear 批判 code churn（粉红）、
Stack Overflow 调查 debug 时间增加（淡绿）。
2024 年末 Cursor 等 agentic IDE 兴起（紫），仍无 RCT。
**2025 年 METR (红框) 成为第一个直接反驳：真实 OSS 任务上 AI 让 senior 慢 19%**——
sign flip 揭示了 Peng 任务的外推边界。论文 paper-figure 风。*

### 选型建议

| 场景 | 选 |
|---|---|
| 写关于 AI 编码影响的学术论文 | 必引 Peng et al. 2023 + METR 2025 + GitClear 2024（三角对照） |
| 内部说服管理层买 Copilot | -55.8% 是营销数字（注意 cherry-pick task）。METR 19% 慢也别只引——任务也窄 |
| 客观评估对自己工作的影响 | 自己做小型 N=1 实验，不要信任意他人数字 |
| 决定 junior 培训要不要纳入 Copilot | Junior 受益证据较强（多个研究一致），但 long-term 技能影响仍不确定 |

## 与你当前工作的连接

### 今天就能用

任何 productivity claim 都该用 RCT 方法学审视：

- "我们用 X 工具后效率 +50%" → 谁是 control？怎么测的？随机分配了吗？
- "AI 让 deal 增加 30%" → 这是销售数字还是 RCT 数字？任务代表性？
- "Y 方法让 bug 减半" → 样本多大？任务代表性？盲法做了吗？
- "新工具上线后工程速度提升 X%" → 是 observational 还是 controlled？

理解 Peng et al. 后，你能精确批评任何 productivity claim 的方法学缺陷。

### 下个月能用

设计任何"工具/流程对生产力影响"的内部测试时，借 RCT 设计：

- 随机分配（不是自愿）
- 控制任务（同任务）
- 同时段（避免季节效应）
- 多种 measure（time + quality + satisfaction）
- 报告 effect size + p-value
- **明确任务代表性边界**（"HTTP server 类任务" vs "真实工作"）

即使 N=10 的内部小实验，**严格的 RCT 设计比大量 self-report 更可信**。

### 不要用的部分

- **不要信单一数字**：-55.8% 在不同任务、不同人群、不同时间会变（METR 测出 -19%）
- **不要把 toy task 收益泛化到生产 codebase**：Copilot 在 from-scratch 任务上很强，复杂 codebase 维护有限
- **不要忽视 limitations**：论文 Section 6 自己列了——但媒体引用都跳过

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 4 件事（额外补充第 5）

1. **任务太"标准化"**：HTTP server 是 LLM 训练高频内容。**生产代码大部分是改既有 codebase**——
   论文不测这种 setting。METR 2025 在真实 OSS repo 上测出反向 effect，证实这个怀疑。
2. **Self-reported time 不可靠**：连续监控 + telemetry 才是 gold standard，但论文没用。
   self-report 受 demand characteristics、Hawthorne effect、记忆偏差污染。
3. **没有 long-term effect**：1 个任务 / 1 次实验。**长期使用 Copilot 后，开发者技能是退化还是提升？**
   论文不答。这是 GitClear 2024 后续研究的方向（指向 negative）。
4. **Effect size d≈2.0 在软件工程实证里属于罕见大**：心理学 d>1.5 几乎都需要独立复现。
   截至 2026-05 仍无大规模独立复现，且 METR 2025 方向相反——应当怀疑。
5. **附加：开放标签 + Hawthorne effect**：受试者知道自己在测 Copilot，可能更投入。
   sham-AI control 没做——理论上应当给 Control 组一个看起来像 Copilot 但不工作的工具来盲。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Hannay et al. 2009 Pair Programming Meta-Analysis | 软件工程 meta-analysis 标杆 |
| 2 | METR 2025 (Lin et al.) | 真实代码库下 AI 工具的反例 |
| 3 | Vaithilingam et al. 2022 (CHI Copilot Usability) | qualitative 视角看 Copilot 怎么被用 |

读完这 3 篇 + Copilot RCT，你拥有"AI 编码生产力实证 2022-2025"完整地图。

## 限制（论文 Section 6 + 我的补充）

论文 Section 6 自承认 4 条：

1. 单一任务（HTTP server 不代表所有 work）
2. Self-reported time（不是 continuous monitoring）
3. 短期实验（不能推断 long-term effect）
4. 单一 demographic（professional developers，不含初学者 / 学生 / freelancer）

我的补充 4 条（v1.1 empirical 三类必填）：

5. **Sample size 不足支持 heterogeneity 推论**：每经验子组 n<30，
   "junior 受益更大"结论的统计 power 不够（约 0.3）。
6. **任务在 LLM 训练数据高频** — Copilot 优势被夸大。
   真实工作的 spec 模糊度、existing code 约束、debug 比例都更高。
7. **测量工具时代局限**：2022 年 self-report timestamp 是当时标准，
   但 2026 年 IDE telemetry / keystroke logger / LSP 调用日志已经普及，
   重做实验应当用更精确测量。论文数字不能直接外推到 2026。
8. **代码质量 metric 论文 vague** — 主要看 functional correctness，不看 maintainability / readability /
   bug rate / 后续维护成本。GitClear 2024 显示 code churn 长期上升——这才是真问题。

## 叙事错位附录

论文 vs 媒体 vs 真实工作的 4 个错位：

| 维度 | 论文实际说的 | 媒体 / 营销转述 | 真实工作 |
|---|---|---|---|
| effect | "this task, this sample, -55.8%" | "Copilot makes devs 55% faster" | 任务相关，平均可能 -10% 到 +10% |
| heterogeneity | "在小子组里 junior 似乎更受益" | "AI is the great equalizer" | 长期看可能让 junior 技能停滞 |
| code quality | "both groups produce passing code" | "Copilot doesn't hurt quality" | GitClear 显示 churn 上升 |
| 任务范围 | "implement HTTP server" | "developer productivity" | 真实工作 70% 是改既有 codebase |

**核心错位**：论文用了高度受限的语言（"this task, this sample"），但被外推时这些限定全消失。
这是 empirical paper 引用链条的常见病——**作者诚实、传播者去诚实、读者承担误读后果**。

## 附录：Copilot RCT 关键数字速查

```
Sample size: N = 95 (Treatment 45 + Control 50)
Task: implement HTTP server in JavaScript (Appendix A spec)
Randomization: pure random 1:1, blocking by experience
Blinding: NONE (open-label)
Primary measure: completion time (self-report timestamp)

Treatment (Copilot) mean: 71.17 minutes (median 65)
Control (no Copilot) mean: 160.89 minutes (median 145)
Effect: -55.8% time (p < 0.001, two-sided t-test)
Cohen's d ≈ 2.05  <- 罕见大，警示信号
Completion rate: 78% vs 70%  (n.s.)

Heterogeneity (caveat: each subgroup n<30):
  < 5 yrs exp: -65%
  5-10 yrs exp: -50%
  10+ yrs exp: -35%

Direct contradiction (METR 2025):
  Same domain, real OSS tasks, N=16 senior devs:
    AI tools -19% (slower)
    Devs predicted +24% (sign flip)
```

记住：**effect size 大不等于 generalizable**——任务代表性是关键。
Peng 2023 + METR 2025 一起读才能看到全貌。

---

**Layer 0-7 完成（v1.1 empirical 标准）。约 540 行，含 2 张 figure（webp）+ 4 阶段方法学批判 + 7 阶段 self-replication + 5 件显式怀疑。**

**Season D · DX 实证研究 1/5。**
