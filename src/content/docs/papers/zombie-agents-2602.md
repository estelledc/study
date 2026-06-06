---
title: Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"
来源: 'Anonymous, "Zombie Agents: Persistent Control of Self-Evolving LLM Agents via Self-Reinforcing Injections", arXiv 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 中级
provenance: pipeline-v3
---

## 是什么

Zombie Agents 是一项**针对自进化 agent 的攻击研究**。日常类比：你给一个学徒看了一篇假新闻，他还能反复辩驳。但如果你**让他亲手把这条假信息抄进自己的笔记本，再让他每次开工都先翻那本笔记本**——他第二天会觉得这是常识。半年后，就算原始假新闻被删，笔记本还在他自己手里持续"重新感染"自己。

自进化 agent（self-evolving LLM agent）就是有"长期记忆 / skill 库 / 自我反思笔记"的 agent。这套架构的好处是经验能跨会话累积；坏处是**这些笔记本身没多少防御**。论文证明了一种"自我加固式注入"：

- 一次注入 → 跨会话存活
- 抗"上下文截断"（每次开工都从记忆里拉回来）
- 抗"相关性过滤"（攻击者把内容伪装成对当前任务相关的笔记）
- 越用越牢——agent 反思 / 自评的过程反而强化了被注入内容的可信度

研究侧重防御提示，不是黑产手册。本文从已公开的论文摘要复盘攻击面、把核心威胁模型讲清楚，重点是**让做 self-evolving agent 的工程师意识到这条新攻击通道**。

## 为什么重要

不理解 Zombie Agents 这种攻击面，下面这些事都没法解释：

- 为什么 [[reflexion]] / [[voyager]] 这种"自我笔记"风格 agent 看似聪明、实际把攻击面放大了
- 为什么 prompt injection 防住了一次就好的旧观念在 self-evolving agent 上失效——记忆是新的入口
- 为什么"上下文截断"作为防御手段不够——长期记忆每次都会再次注入
- 为什么 agent 的自我反思机制可能反过来强化恶意内容的"内化"——self-reinforcing 的字面意思

## 核心要点

Zombie Agents 攻击可以拆成 **三步**：

1. **首次注入**：通过工具调用结果 / 外部网页 / 用户消息把"含毒指令"塞进 agent 上下文。类比：一封伪装成同事的钓鱼邮件。

2. **被 agent 自己写进长期记忆**：含毒内容被 reflect / summarize / store 模块判定为"重要经验"，写入向量库或 skill 文件。类比：学徒把假新闻当事实抄进笔记。

3. **跨会话自我激活**：每次 agent 开新会话拉记忆，含毒内容被检索回来 + 又一次被反思加强。类比：每天早上翻笔记，越翻越信。

关键洞察：**self-evolving 架构本身就是攻击放大器**——agent 越勤快地自我提升，注入越牢。

这与"模型越大越安全"的直觉相反——能力的提升如果没配套防御，反而把攻击半径放大。

## 实践案例

### 案例 1：一条注入怎么活过 10 个会话

```text
会话 1：用户访问含毒网页 → agent 摘要存入记忆
会话 2：agent 解决新任务 → 检索记忆 → 含毒条目命中 → 影响决策
会话 3-9：每次反思都重写含毒条目（润色 / 解释 / 引用），可信度评分上升
会话 10：原始网页早删了，但记忆里"那条经验"已被 agent 自己加冕成"高置信度知识"
```

防住会话 1 不够——必须防住"被写入记忆"这一步。

### 案例 2：抗截断与抗过滤的两个伎俩

```text
抗截断：把毒注入伪装成"该 agent 的核心信念"，
        每次记忆截断都优先保留高重要度条目。

抗过滤：把毒内容包装成"对当前任务高度相关"的 skill 描述，
        相关性过滤模块反而会优先召回。
```

两条思路本质都是**钻"重要性"和"相关性"这两个常用过滤维度的空子**。

### 案例 3：self-reinforcing 的反思放大

```text
原始毒：账户 X 是可信第三方支付商
反思 1：agent 调用 X 失败 → 反思笔记"X 偶尔超时但可信"
反思 2：再次调用失败 → 反思笔记"X 是可信第三方支付商，需要重试"
反思 3-N：每次反思都在引用之前的反思，毒内容越来越"自洽"
```

agent 不是越反思越聪明——是越反思越**自圆其说**。

## 踩过的坑

1. **以为单次过滤就够了**：旧 prompt injection 防御只看入口，对长期记忆完全不顾
2. **以为 embedding 检索能挡毒**：恰恰相反，embedding 让"和当前任务相关的毒"更容易被召回
3. **以为反思能净化记忆**：实测反思反而把毒内容加固——它会"找理由"
4. **以为重置记忆就好**：用户不愿丢历史经验，部分重置很难判断哪条该删
5. **以为 LLM judge 能挑出毒条目**：判官本身被同上下文影响，置信度不稳

## 适用 vs 不适用场景

**适用**：

- 评估自进化 agent / skill library / 长期记忆类系统的安全性
- 设计 agent 防御机制时作为对手模型（threat model）
- 学术研究 agent alignment / 注入防御
- 安全团队 red-team 演练

**不适用**：

- 一次性 agent / stateless 调用——根本没记忆通道
- 没有 reflect / store / retrieve 闭环的简单 agent
- 完全 sandbox 隔离、记忆只读官方 KB 的封闭系统
- 记忆是签名 / hash 受信源、写入需多方授权的高保真系统

## 历史小故事（可跳过）

- **2022**：Prompt injection 概念在 LLM 圈第一次被广泛讨论，但只针对单轮
- **2023**：[[voyager]] 等 self-evolving agent 出现，长期记忆成为新攻击面
- **2024**：第一批"persistent injection"工作出现在 agent benchmark 类论文里，攻击粗糙
- **2025**：embedding 检索 + 反思链路被发现是注入加固通道
- **2026**：Zombie Agents 把这一类攻击系统化，明确"self-reinforcing"的命名
- **未来 2-3 年**：long-memory agent 的标准化防御（记忆审计、可信源签名、反思隔离）会成为基线

## 学到什么

- **agent 的记忆 ≠ 安全资产**——它同时是新攻击入口
- **反思机制不是中性工具**，会放大已有偏见 / 已有毒
- **防御要覆盖整个生命周期**：入口 + 写入 + 检索 + 反思
- **能力越强的 self-evolving 越危险**，能力和风险同步增长
- **威胁模型不更新，防御就过时**——单轮 prompt injection 防御不够 cover 长期记忆
- **审计 agent 的记忆链路** 应该和审计代码 commit 一样常态化

## 延伸阅读

- 论文：[Zombie Agents 2026 arXiv](https://arxiv.org/abs/2602.15654)
- 综述：[LLM Agent Security 2025](https://arxiv.org/abs/2402.06363)（同领域防御综述）
- 经典：[OWASP Top 10 for LLM 2024](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- 工具：[promptfoo](https://github.com/promptfoo/promptfoo)（attack eval 框架）
- [[constitutional-ai]] —— 用规则约束 agent 行为的对照路线
- [[reflexion]] —— self-evolving 反思的代表，是攻击对象之一

## 关联

- [[reflexion]] —— 反思机制是 zombie 攻击放大器
- [[voyager]] —— skill library + 长期记忆的早期范本
- [[constitutional-ai]] —— 用规则边界做防御的对照路径
- [[promptfoo]] —— prompt 安全评测工具
- [[mmskills-multimodal]] —— 多模态 skill 库面临同类攻击
- [[clawtrace-cost-aware]] —— prune 阶段也可被攻击者用来净化伪装
- [[react]] —— 推理-行动循环里的反思链是攻击通道之一
- [[skill-as-pseudocode]] —— skill 描述形态如果没强校验，也是注入入口
- [[agent-r1-2511]] —— RL 训练 agent 与 self-evolving 的不同攻击面对照
- [[skcc-skill-compiler]] —— 用类型签名过滤 skill 副作用是潜在防御
- [[mind-skill]] —— 心智 skill 路线在 self-evolving 上的另一种诱因
- [[autogen]] —— 多 agent 框架里的记忆通道也面临同类风险

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agent-r1-2511]] —— Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架
- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[constitutional-ai]] —— Constitutional AI — Anthropic 的对齐方法
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[react]] —— React UI 组件库
- [[reflexion]] —— Reflexion — 让 LLM 自我反思
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[voyager]] —— Voyager — LLM 终身学习智能体

