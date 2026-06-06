---
title: 'CrewAI — 把多 Agent 编排做成"组团队"'
来源: 'João Moura, "CrewAI: Framework for orchestrating role-playing, autonomous AI agents", 2023 起开源（GitHub: crewAIInc/crewAI）'
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 入门
provenance: pipeline-v3
---

## 是什么

CrewAI 是一个 Python 框架，用三段式 DSL 把多个 LLM 智能体组成一个会分工的"团队"。日常类比：你不再是写代码调 API，而是**像招聘和派活**一样组建一个虚拟团队——给每个人岗位（Role）、目标（Goal）、人设（Backstory），再列出任务清单（Tasks），最后说一句"开干"（Crew kickoff）。

最小例子（伪代码示意）：

```python
researcher = Agent(role="资深分析师", goal="找出 X 的关键信息", backstory="你做了 10 年研究，擅长从噪音里提炼信号")
writer = Agent(role="撰稿人", goal="把分析师的发现写成易读文章")
task1 = Task(description="调研 X", agent=researcher)
task2 = Task(description="基于 task1 写一篇 800 字文章", agent=writer, context=[task1])
crew = Crew(agents=[researcher, writer], tasks=[task1, task2])
crew.kickoff()
```

你**没写一行调度逻辑**，CrewAI 就按列表顺序跑、把前一个的产出塞进下一个的 context。

## 为什么重要

不理解 CrewAI 的设计选择，下面这些事都没法解释：

- 为什么 2024 年起一堆"AI 投研助理 / AI 营销团队"产品都长得很像——它们底层很多就是 CrewAI
- 为什么"多 Agent 协作"突然从论文走进产品——把"图论调度"换成"招聘比喻"后，产品经理也能编排
- 为什么同一个 LLM 套上不同 Backstory 行为差很多——人设是稳定 system prompt 的工程化包装
- 为什么有人吐槽 CrewAI"5 个 Agent 一跑就 3 美元"——每个 Task 都是独立 LLM 调用

## 核心要点

CrewAI 的 DSL 就 **三个对象**，组合即编排：

1. **Agent（员工）**：四件套 `role` / `goal` / `backstory` / `tools`。前三个是自然语言，会被拼进喂给底层模型的"开场白"（system prompt——告诉模型"你是谁、要做什么"的预设指令）；`tools` 是这个 Agent 能调用的外部能力（搜索、Python REPL、自定义函数）。还有 `allow_delegation=True` 让它能把活转给同 Crew 其他人。

2. **Task（活）**：`description`（要做什么）+ `expected_output`（产出长啥样）+ `agent`（派给谁）+ `context`（依赖哪些前置 Task）。一个 Task = 一次 LLM 调用周期（模型可能多轮 tool 调用，但最终产出一个结果）。

3. **Crew（团队 + 流程）**：`agents` 列表 + `tasks` 列表 + `process` 模式。模式两种：`sequential`（按列表顺序跑）和 `hierarchical`（指定一个更强模型当 manager，让它自己拆活派活）。

三个对象里没有"图"也没有"消息总线"——这是 CrewAI 跟同类框架最大的区别。

## 三模式对照表

CrewAI 的 `process` 参数决定 Crew 怎么跑，三种模式对应三种心智模型：

| 模式 | 心智模型 | 何时用 | 何时别用 |
|------|---------|--------|---------|
| sequential | 流水线 | 步骤明确、依赖单向 | 需要回头改前面 |
| hierarchical | 项目经理派活 | 目标抽象、要拆解 | 预算紧张，manager 烧钱 |
| Flow | 状态机 | 多分支、有条件循环 | 简单顺序场景，过度设计 |

新手默认 sequential，跑通后再考虑升级。

## 实践案例

### 案例 1：投研三人组（顺序模式）

```python
analyst = Agent(role="股票分析师", goal="评估 NVDA 当前估值", tools=[search_tool])
writer = Agent(role="财经记者", goal="把分析翻译给散户读懂")
reviewer = Agent(role="风控合规", goal="检查文章里有没有违规承诺")
crew = Crew(agents=[analyst, writer, reviewer], tasks=[t1, t2, t3], process="sequential")
```

`sequential` 模式下，t1 → t2 → t3 串行，每步把上一步的产出当输入。这是最常见也最稳的模式。

### 案例 2：层级模式（hierarchical）

```python
crew = Crew(agents=[researcher, writer, reviewer], tasks=[goal_task],
            process="hierarchical", manager_llm=gpt4)
```

只给一个高层目标，让 manager Agent（通常用更强的模型）自己决定**派给谁、按什么顺序、要不要再派一轮**。优点：灵活；代价：贵、容易跑偏、调试难。

### 案例 3：跟 LangChain 工具互通

```python
from langchain.tools import DuckDuckGoSearchRun
search = DuckDuckGoSearchRun()
agent = Agent(role="...", tools=[search])
```

CrewAI 的 `tools` 接口兼容 LangChain Tool，可以直接复用上千个现成工具。这是它早期能爆发的关键——**没造工具的轮子**。

## 踩过的坑

1. **5 个 Agent 是分水岭**：sequential 模式下，上游错一步整个 Crew 一起报废。Agent 数 > 5 之前必须加中间审核 Task。

2. **Backstory 写太长**：人设 200 字以内最好。我见过有人写 800 字"你的童年、你的方法论、你的口头禅"——结果模型把目标都忘了。

3. **hierarchical 死循环**：manager 反复派活给同一个 Agent。需要在 manager 提示里显式加"每个子任务最多一次重试"。

4. **账单失控**：5 Agent × 10 Task × 4k tokens × $0.01/1k ≈ 单跑 2 美元，反复调试一天烧 $50 不夸张。先用便宜模型（Haiku、Mini）跑通流程再换 GPT-4。

5. **"团队"是比喻不是事实**：Agent 之间没真共享内存，所谓"协作"本质是把上一个 Task 的字符串塞进下一个的 context。Backstory 让它们看上去像在配合，实则是顺序 prompt 链。

## 适用 vs 不适用场景

**适用**：

- 任务能拆成 3-7 个清晰子步骤，每步产出可以用文字描述
- 有现成 LLM 提供商账号和预算，不在乎单跑几美元
- 业务方/PM 想自己改流程，又不会写调度代码——"招聘 + 派活"比"画 DAG"门槛低
- 需要快速搭原型展示"AI 能完成端到端业务"

**不适用**：

- 高频实时任务（每条消息都跑一次 Crew，账单和延迟双爆炸）
- 需要 Agent 之间真正的并发或共享状态——CrewAI 没有真共享内存
- 严格确定性流程（金融交易、医疗）——LLM 不可控，再多 Agent 也救不了
- 单 Agent 单任务就够的场景——别为了用 Crew 而 Crew

## 历史小故事（可跳过）

- **2023 年底**：João Moura 在 GitHub 开源 CrewAI，最初是 LangChain 上层的薄封装，主打"用招聘比喻编排"
- **2024 年初**：GitHub stars 从几百飙到上万，原因之一是 LangChain 当时被吐槽"零件多到不知怎么拼"，CrewAI 给了开箱模板
- **2024 年中**：逐步从 LangChain 解耦，自己实现核心调度，加入 `Flow` 模块（更显式的状态机）
- **2024 年底**：推出 CrewAI Enterprise（商业版）和 Studio（图形化），公司化运营

它不是技术上的新发明——多 Agent 协作论文一抓一大把——而是**产品化的胜利**：把抽象问题翻译成所有人都懂的"组团队"。

## 学到什么

1. **比喻就是产品**——把"调度多个模型调用"翻译成"组团队 + 派活"，门槛立刻从工程师降到 PM
2. **Role + Goal + Backstory 是稳态 system prompt 的工程化**——比手写大段 prompt 更可维护
3. **顺序优先于复杂调度**——大多数业务场景 sequential 够用，先别上 hierarchical
4. **工具复用 > 重造**——CrewAI 兼容 LangChain Tool 是它早期能跑赢的关键技术决策

## 延伸阅读

- 官方文档：[docs.crewai.com](https://docs.crewai.com/)（最新 API 和概念图）
- 上手教程：[CrewAI YouTube 频道](https://www.youtube.com/@crewAIInc)（作者亲自讲案例）
- 源码：[github.com/crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)（核心调度才几千行 Python，能读完）
- [[autogen]] —— Microsoft 多 Agent 框架，对话式（互发消息）vs CrewAI 任务式（派活）
- [[swe-agent]] —— 单 Agent 做软件工程，CrewAI 像它的多 Agent 扩展
- [[agentless]] —— 反向参照，证明"没 Agent"也能解决很多问题

## 关联

- [[autogen]] —— 同期同类框架，对话式协作 vs CrewAI 的任务清单式
- [[swe-agent]] —— 单 Agent 工程化的代表，CrewAI 是多 Agent 工程化
- [[agentless]] —— 反 Agent 思路，提醒别一上来就 Crew
- [[vllm]] —— 跑 Crew 时的推理后端，决定单跑成本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[openai-agents-sdk]] —— OpenAI Agents SDK — 让多个 agent 协作的轻量框架
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎

