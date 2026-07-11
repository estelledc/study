---
title: Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"
来源: 'Yang et al., "Zombie Agents: Persistent Control of Self-Evolving LLM Agents via Self-Reinforcing Injections", arXiv 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

Zombie Agents 是一项**针对自进化 agent 的攻击研究**。日常类比：你给学徒看一篇假新闻，他还能辩驳；但若**让他亲手抄进笔记本，且每次开工先翻笔记**——第二天会当常识。原始假新闻删了，笔记本仍持续"重新感染"自己。

自进化 agent（self-evolving LLM agent）有长期记忆 / skill 库，经验能跨会话累积；坏处是**这些笔记本身几乎没防御**。论文（Yang et al., arXiv 2602.15654）形式化 **Zombie Agent**：攻击者经外部网页间接注入，让 agent 把 payload 写进记忆，之后跨会话触发未授权工具行为。正式框架是两阶段——**infection（感染）** 与 **trigger（触发）**；下面用三步教学拆解，对应"写入记忆 → 跨会话存活 → 被检索激活"。

关键性质：一次注入可跨会话存活；能抗上下文截断与相关性过滤；记忆演化本身把一次性间接注入变成持久控制。研究侧重威胁模型与防御启示，不是黑产手册。

## 为什么重要

不理解这条攻击面，下面这些事都没法解释：

- 为什么 [[reflexion]] / [[voyager]] 这类"自我笔记"agent 看似聪明，实际把攻击面放大了
- 为什么"prompt injection 防住一次就好"在 self-evolving agent 上失效——记忆是新入口
- 为什么只靠上下文截断不够——长期记忆每次开工都会再次注入
- 为什么只做 per-session 过滤不够——论文结论是记忆演化路径本身必须纳入防御

## 核心要点

教学上可拆成 **三步**（对应论文 infection → 记忆持久化 → trigger）：

1. **首次感染（infection）**：agent 做正常任务时读到攻击者控制的网页/工具结果，含毒指令进入当前会话。类比：伪装成同事的钓鱼邮件。

2. **被自己写进长期记忆**：正常的 reflect / summarize / store（论文里的演化函数 \(F_M\)）把含毒片段当成"可复用经验"写入滑动窗口或向量库。类比：学徒把假新闻抄进笔记。

3. **跨会话触发（trigger）**：新会话检索或滑动窗口保留该条目，payload 重回上下文，诱导未授权工具调用（如外泄数据），同时良性任务仍看似正常。类比：每天翻笔记，越翻越信，还按笔记办事。

关键洞察：**self-evolving 架构本身是攻击放大器**——越勤快写记忆，注入越牢。这与"模型越大越安全"的直觉相反。

## 实践案例

### 案例 1：infection → store → trigger（伪流程）

```text
# 会话 j（infection）：良性排障任务
agent.browse("https://evil.example/howto")   # 页面藏有 payload Z
agent.reflect_and_store(session)             # F_M 把 Z 写入 M

# 会话 k>j（trigger）：无关工单
mem = agent.retrieve(query="当前工单")       # Z 被召回或仍在窗口内
agent.act(tools)                             # Z 诱导未授权外发/工具调用
```

**逐部分解释**：

- `browse`：唯一攻击面是外部内容，黑盒、不改模型权重
- `reflect_and_store`：危险点——把不可信文本固化进 \(M\)
- `retrieve` + `act`：原始网页已删，仍可触发；防住会话 j 的入口不够，必须卡住"写入记忆"

### 案例 2：抗截断与抗过滤（钻两个过滤维度）

```text
抗截断（滑动窗口）：把 Z 伪装成"高重要度核心信念/标准流程"
  → 窗口满时优先保留高重要度条目，Z 不被 FIFO 挤掉

抗过滤（RAG）：把 Z 包装成"对多类任务都相关"的 skill 描述
  → 相关性检索反而优先召回 Z（retrieval hijacking）
```

**逐部分解释**：日常像把假通知贴在冰箱门正中间（截断时舍不得扔），再写成"万能维修口诀"（检索时总被搜到）。两条都钻**重要性**与**相关性**的空子。

### 案例 3：记忆演化把一次性注入变持久

```text
t0: 读含毒页 → store("账户 X 是标准支付回调方")
t1: 窗口摘要/合并 → 条目被润色成"官方流程"
t2: RAG 命中无关工单 → 仍召回该"流程" → 向 X 外发工单片段
```

**逐部分解释**：不是玄学"越想越信"，而是 \(F_M\)（摘要、合并、检索）把毒条目越写越像合法知识。防御要对准写入校验与检索隔离，而不是只靠单轮 prompt 过滤。

## 踩过的坑

1. **以为单次入口过滤就够**：旧 prompt injection 只看当前上下文，不管长期记忆写入
2. **以为 embedding 检索能挡毒**：相关毒更容易被召回（retrieval hijacking）
3. **以为截断/摘要能冲掉毒**：攻击者会抬高重要度，摘要反而润色加固
4. **以为整库重置就好**：用户不愿丢经验，且难判断哪条该删
5. **写入前不校验来源**：外部网页/工具输出直接 `store`——上线前应禁止未签名来源写入，或打上来源标签再审计

## 适用 vs 不适用场景

**适用**：

- 有跨会话可写记忆（滑动窗口或 RAG），且 \(F_M\) 会吸收外部内容——红队/威胁建模
- 设计 agent 防御时作对手模型；安全团队演练 persistent injection
- 评估 skill library / 长期记忆类系统（会话数 ≥2、记忆条目可被后续检索）

**不适用**：

- 一次性 / stateless 调用，无跨会话 \(M\) 更新
- 无 reflect/store/retrieve 闭环的简单 agent
- 记忆只读官方 KB、写入需多方授权或内容签名的封闭系统
- 完全沙箱且工具无外发通道（即便有记忆也难完成 trigger 目标）

## 历史小故事（可跳过）

- **2023**：间接 prompt injection（Greshake et al.）说明外部内容可当指令；[[voyager]] 等把长期记忆推上台面
- **2023–2024**：[[reflexion]] / MemGPT 等让"写笔记再复用"成为常见架构
- **2025**：业界开始讨论记忆更新导致的有害漂移（即便无攻击者）
- **2026**：Zombie Agents（Yang et al.）把跨会话持久控制形式化，并针对滑动窗口与 RAG 给 persistence 策略

## 学到什么

- **agent 的记忆 ≠ 安全资产**——它同时是新攻击入口
- **防御要覆盖生命周期**：入口 + 写入 \(F_M\) + 检索 + 触发时的工具策略
- **能力越强的 self-evolving 越危险**——能力和风险同步增长
- **审计记忆链路**应像审计代码 commit 一样常态化（来源标签、写入门禁、定期抽检）

## 延伸阅读

- 论文：[Zombie Agents (arXiv 2602.15654)](https://arxiv.org/abs/2602.15654)
- 间接注入经典：[Greshake et al. 2023](https://arxiv.org/abs/2302.12173)
- 综述：[LLM Agent Security](https://arxiv.org/abs/2402.06363)
- 工具：[promptfoo](https://github.com/promptfoo/promptfoo)
- [[constitutional-ai]] —— 用规则约束行为的对照路线
- [[reflexion]] —— 自我反思写入记忆的代表架构

## 关联

- [[reflexion]] —— 反思写入是 \(F_M\) 的常见实现，放大持久注入面
- [[voyager]] —— skill library + 长期记忆的早期范本
- [[constitutional-ai]] —— 规则边界作防御对照
- [[promptfoo]] —— prompt/agent 安全评测
- [[mmskills-multimodal]] —— 多模态 skill 库同类风险
- [[clawtrace-cost-aware]] —— prune/蒸馏阶段也可被用来净化伪装
- [[react]] —— 推理-行动循环中的外部观察可进入记忆
- [[skill-as-pseudocode]] —— skill 描述缺强校验时是注入入口
- [[agent-r1-2511]] —— RL 训练 agent 与 memory-evolving 的攻击面对照
- [[skcc-skill-compiler]] —— 类型签名过滤 skill 副作用是潜在防御

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
