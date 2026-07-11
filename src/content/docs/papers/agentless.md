---
title: Agentless — 反 Agent 派的 SWE-bench 解法
来源: 'Xia et al., "Agentless: Demystifying LLM-based Software Engineering Agents", 2024'
日期: 2026-05-29
分类: AI / 软件工程
难度: 中级
---

## 是什么

Agentless 是 UIUC 2024 年提出的一个反命题：**修代码这件事，不一定要让 LLM 自己开车（agent loop），用一条固定的 3 阶段流水线（pipeline）反而更好**。

日常类比：

- [[react]] / [[voyager]] 这些 agent 路线，像把 LLM 当成司机：自己看路、自己决定下一步、自己回头修正。
- Agentless 像把 LLM 当成流水线工人：先做 A 工序，结果交给 B 工序，B 做完交给 C，**不允许中途回头**。

听起来 agent 应该更聪明，但在 SWE-bench（修真实 GitHub bug 的标准测试集）上，Agentless 反而以 27.3% 的解决率追平甚至超过了当时绝大多数复杂 agent 系统。

## 为什么重要

不理解 Agentless，你会觉得"agent 越复杂越好"——但事实不是这样：

- **打平复杂 agent**：SWE-bench Lite 上 27.3% 解决率，和 SWE-Agent 等当时主流方案打平甚至略胜
- **成本只有 1/3**：没有反复调用的 agent loop，平均每道题约 $0.34，SWE-Agent 同期约 $2.5
- **打开了"反对派"窗口**：从此论文圈第一次系统讨论"agent 不一定是答案"
- **影响产品设计**：Claude Code / Cursor / Aider 等工具后来都倾向于"减少不必要的 agent 步骤"，背后是 Agentless 提供的实证依据

## 核心要点

Agentless 的全部哲学就是 **3 个固定阶段，全程无循环**：

1. **Localization（定位）—— 找到 bug 在哪**
   - 分三层：先选哪个文件 → 再选哪个 class / function → 最后选哪几行
   - 每一层都是一次 LLM 调用，输入是上一层的结果，**不让 LLM 自己在文件树里乱爬**
   - 类比：找一本书里的错别字，先翻到章节，再翻到段落，再定位到句子

2. **Repair（修复）—— 让 LLM 出多个候选 patch**
   - 不强求一次出"最好的 patch"，而是 sample 40 个候选（temperature 提高，鼓励多样性）
   - 拿语法检查 / diff 解析当过滤器，把写错的扔掉
   - 类比：考试不会的题，与其死磕一个答案，不如写 40 张草稿再挑一个

3. **Validation（验证）—— 用现有测试投票**
   - 把幸存的 patch 拿到原仓库的真实测试里跑
   - 通过测试的留下，不通过的扔掉，最后多个候选投票选 1 个
   - 类比：写完代码不靠"我觉得对"，而是真的跑一遍 CI

**关键不同点**：[[swe-agent]] 这种 agent 派，LLM 在每一步都能决定"下一步去哪"——这个灵活性需要 30 个 round trip 才能 converge。Agentless 直接把流程写死成 3 步，**牺牲灵活性、换可预测性和便宜成本**。

## 实践案例

### 案例 1：修一个 json5 解析 bug

假设 SWE-bench 给出这样一道题：

> json5 库在解析带尾随逗号的对象时报错，issue 里有最小复现代码。

Agentless 的处理流程：

1. **Localize 阶段**
   - 第 1 层：LLM 看完整个 repo 目录树，输出"最可能是 `src/parse.ts`"
   - 第 2 层：LLM 看 `parse.ts` 的 class / function 骨架，输出"应该是 `parseObject` 函数"
   - 第 3 层：LLM 看 `parseObject` 的具体内容，输出"应该改 247 行附近"

2. **Repair 阶段**
   - sample 40 个候选 patch（有的加了 `if (token === ',')` 判断，有的改了 while 循环条件……）
   - 语法过滤后剩 28 个

3. **Validation 阶段**
   - 跑 json5 仓库里所有现存的测试，留下没破坏老测试的 patch
   - 投票选出最一致的那个，提交

整个流程**3 次 LLM 调用 + 1 次 sample 调用**就结束，不需要 LLM 自己决定"我要不要再看一眼别的文件"。

### 案例 2：与 SWE-Agent 的对照

| 维度 | SWE-Agent（agent 派） | Agentless（pipeline 派） |
|---|---|---|
| LLM 调用次数 | 平均 30 次 round trip | 固定 4-5 次 |
| 控制流谁决定 | LLM 自己（看完文件决定下一步） | 写死的 pipeline |
| 工具 | shell / grep / scroll / cd 全开 | 只有 deterministic 的 AST 抽取 |
| 单题成本 | ~$2.5 | ~$0.34 |
| Lite 解决率 | ~25% | 27.3% |

结论很反直觉：**给 LLM 更多自由度，反而让它更容易迷路**。

### 案例 3：Agentless 的失败模式

并非所有题它都能解。最典型的失败是：

- 第 1 层 file localize 选错了文件 → 后面 repair sample 40 次也救不回来
- Django / sympy 这种巨型 repo，目录树就长到第 1 层 LLM 看不完整
- 多文件协同修复（必须同时改 A.py 和 B.py），Agentless 当时只擅长单文件

这就是 pipeline 派的代价：**第 1 步错了，后面全错；不像 agent 能自己回头修正**。

## 踩过的坑

1. **N=40 不是普世值**：sample 40 次是论文在 GPT-4o + SWE-bench Lite 上调出来的甜点。换模型 / 换任务都得重调，不能盲抄。

2. **"reproduction test" 边际收益小**：论文标题强调 validation，但实际 ablation 显示，去掉"LLM 合成新测试"这一步只掉 2%——真正起作用的是复用原仓库现有测试。

3. **依赖 docker 化测试基础设施**：Validation 阶段假设每道题有完整可跑的测试 suite。在公司内网 Java + 私有 build 系统的场景，这一步根本搬不过去。

4. **第 1 层 file recall 是天花板**：论文 Table 6 的数字是 73.5%——意味着 26.5% 的题在第一步就丢了正确文件，这是 Agentless 解决率的结构性上限。

## 适用 vs 不适用场景

**适用**：

- 步骤明确、边界清晰的任务（"修一个有现成测试的 bug"）
- 成本敏感场景（每道题的 round trip 数必须可控）
- 需要可复现 / 可审计的 LLM 流程（写死 pipeline 比 agent 更容易 debug）

**不适用**：

- 长 horizon 开放任务（"帮我从零搭一个 SaaS 后端"）
- 没有现成测试 oracle 的任务（Validation 阶段无法工作）
- 必须跨文件协同的复杂重构

## 历史小故事（可跳过）

- **2024-01**：[[swe-agent]] 论文发表，定义了"agent + ACI（agent-computer interface）"路线，把 SWE-bench 作为试金石。社区默认 agent 越复杂越好。
- **2024-08**：Agentless 论文发表，公开喊"agent loop 是过度设计"，用 3 阶段 pipeline 在 SWE-bench Lite 反超。
- **2024-09**：Anthropic 发布 Claude Sonnet 3.5 + Computer Use，agent 派士气重振，但社区开始普遍 publish cost 数字。
- **2025**：SWE-bench Verified（500 题人工筛选过的更难子集）上线，agent vs pipeline 的对比仍在激辩。主流共识开始倾向"核心步骤写死 pipeline + 长尾决策点放给 agent"的混合派。

## 学到什么

1. **复杂度不一定换来准确率**——有时候写死流程比让模型自己决策更鲁棒
2. **多采样 + 客观过滤** 比 "一次性出最好答案" 更稳——这是 LLM 时代的 ensemble 思路
3. **每个边界都该有 schema**——跨 LLM 调用传结构化输出，解析失败就重试当前阶段，不污染下一阶段
4. **公开成本数字** 这件事比方法本身更重要——Agentless 之后，agent 论文不能只 claim 准确率而不报 $/题

## 延伸阅读

- 论文 PDF：[Xia et al., Agentless 2024](https://arxiv.org/abs/2407.01489)（不到 20 页，三阶段设计那一节最值得读）
- 代码：[OpenAutoCoder/Agentless](https://github.com/OpenAutoCoder/Agentless)（~2k stars，3 阶段代码很清楚）
- 反方观点：Anthropic 2024-12 blog "Building Effective Agents"——官方对 agent vs workflow 的判断与 Agentless 高度吻合
- [[swe-agent]] —— Agentless 主要的对照对象
- [[swe-bench]] —— 评测协议，没有它就没法做 agent vs pipeline 对照

## 关联

- [[react]] —— agent 路线的最小三元组（think + act + observe），Agentless 整篇都在 reject 这个 loop
- [[voyager]] —— 长 horizon agent 的代表作，与 Agentless 的"短链路 pipeline"形成对照
- [[swe-agent]] —— 直接对照对象，定义了 agent 派的 ACI 范式
- [[swe-bench]] —— 评测基准，让 agent vs pipeline 的对照变得可量化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[nlp-agent-2024]] —— Cognitive Architectures for Language Agents (CoALA)
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[react-agent]] —— ReAct Agent — 推理和行动交替的工具使用范式
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法
- [[swe-bench]] —— SWE-bench — 真实 GitHub Issue 评测
- [[crewai]] —— CrewAI — 把多 Agent 编排做成"组团队"
