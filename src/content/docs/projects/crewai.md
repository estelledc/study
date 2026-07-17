---
title: 'CrewAI — 把多 Agent 编排做成"组团队"'
来源: https://github.com/crewAIInc/crewAI
日期: 2026-05-31
分类: AI 框架
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/crewAIInc/crewAI
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 985cf520283e8eaa26b81713e814773ddfdc34ff
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
---

## 是什么

CrewAI 是一个 Python 多 Agent 自动化框架。它有两条互补主线：用 Agent、Task、Crew 表达"谁做什么"，用 Flow 表达事件、分支、状态和持久化。日常类比：Crew 像组团队派活，Flow 像把团队放进一张有路由和检查点的业务流程图。

最小例子（伪代码示意）：

```python
researcher = Agent(role="资深分析师", goal="找出 X 的关键信息", backstory="你做了 10 年研究，擅长从噪音里提炼信号")
writer = Agent(role="撰稿人", goal="把分析师的发现写成易读文章")
task1 = Task(description="调研 X", agent=researcher)
task2 = Task(description="基于 task1 写一篇 800 字文章", agent=writer, context=[task1])
crew = Crew(agents=[researcher, writer], tasks=[task1, task2])
crew.kickoff()
```

这个例子省略了模型、工具、guardrail 和 checkpoint 配置，只用于认识对象关系；它不代表 CrewAI 的运行时只是三次字符串拼接。

## 为什么重要

不理解 CrewAI 的设计选择，下面这些事都没法解释：

- 为什么 Crew 和 Flow 不能混成一个概念：前者偏角色化协作，后者偏事件驱动控制流
- 为什么高层 DSL 仍需要 runtime state、event bus、memory 和 checkpoint
- 为什么角色/任务描述容易上手，却也更难一眼看出真实 prompt、工具调用和状态变化
- 为什么恢复执行不能只保存最终文本，还要记录已完成方法、实体和事件边界

## 核心要点

CrewAI 的 Crew 层以三个对象为入口：

1. **Agent（员工）**：四件套 `role` / `goal` / `backstory` / `tools`。前三个是自然语言，会被拼进喂给底层模型的"开场白"（system prompt——告诉模型"你是谁、要做什么"的预设指令）；`tools` 是这个 Agent 能调用的外部能力（搜索、Python REPL、自定义函数）。还有 `allow_delegation=True` 让它能把活转给同 Crew 其他人。

2. **Task（活）**：`description`（要做什么）+ `expected_output`（产出长啥样）+ `agent`（派给谁）+ `context`（依赖哪些前置 Task）。Task 是工作单元，不应简单等同于"恰好一次模型 API 调用"，因为内部可能包含工具、委派、guardrail 和重试。

3. **Crew（团队 + 执行）**：`agents` 列表 + `tasks` 列表 + `process` 模式。固定源码实现 sequential 与 hierarchical 两种 process，并同时管理 planning、memory、event、usage 和 checkpoint。

复杂控制流进入 **Flow**：`@start`、`@listen`、`@router` 等装饰器收集触发关系，state 可以持久化。固定源码还提供 `Crew.from_checkpoint()`、`Crew.fork()` 和 Flow SQLite persistence，因此"没有消息总线或 durable state"已经是过时判断。

## 三模式对照表

CrewAI 有两层选择：Crew 的 `process` 参数决定顺序跑还是经理派活；`Flow` 是另一套状态机模块，用来处理更复杂的分支流程。三种心智模型可以这样对照：

| 模式 | 入口 | 心智模型 | 何时用 | 何时别用 |
|------|------|---------|--------|---------|
| sequential | `process` 参数 | 流水线 | 步骤明确、依赖单向 | 需要回头改前面 |
| hierarchical | `process` 参数 | 项目经理派活 | 目标抽象、要拆解 | 预算紧张，manager 烧钱 |
| Flow | 独立 Flow 模块 | 状态机 | 多分支、有条件循环 | 简单顺序场景，过度设计 |

新手默认 sequential，跑通后再考虑升级。

## 实践示例

### 案例 1：投研三人组（顺序模式）

```python
analyst = Agent(role="股票分析师", goal="评估 NVDA 当前估值", tools=[search_tool])
writer = Agent(role="财经记者", goal="把分析翻译给散户读懂")
reviewer = Agent(role="风控合规", goal="检查文章里有没有违规承诺")
from crewai import Crew, Process

crew = Crew(
    agents=[analyst, writer, reviewer],
    tasks=[t1, t2, t3],
    process=Process.sequential,
)
```

`sequential` 模式下，t1 → t2 → t3 串行，每步把上一步的产出当输入。这是最常见也最稳的模式。

### 案例 2：层级模式（hierarchical）

```python
crew = Crew(agents=[researcher, writer, reviewer], tasks=[goal_task],
            process="hierarchical", manager_llm=gpt4)
```

只给一个高层目标，让 manager Agent（通常用更强的模型）自己决定**派给谁、按什么顺序、要不要再派一轮**。优点：灵活；代价：贵、容易跑偏、调试难。

### 案例 3：从 checkpoint 分支验证

```python
from crewai import Crew
from crewai.state.checkpoint_config import CheckpointConfig

restored = Crew.from_checkpoint(
    CheckpointConfig(restore_from="checkpoints/run.json")
)
branch = Crew.fork(
    CheckpointConfig(restore_from="checkpoints/run.json"),
    branch="alternative-review",
)
```

这段只展示固定源码中的恢复/分支 API，不保证路径格式或业务对象适合你的版本。恢复后仍要调用 `kickoff()`，而且外部工具副作用不会因为 checkpoint 存在就自动变得可重复。

## 踩过的坑

1. **把角色数量当可靠性指标**：Agent 越多，模型调用、上下文传递和失败面通常越大。是否增加审核要看风险和可观测证据，不存在通用的"5 个 Agent 分水岭"。

2. **把 Backstory 当权限系统**：自然语言人设影响行为倾向，但不能代替工具 allowlist、凭证隔离和人工批准。

3. **只在 prompt 里限制循环**：hierarchical 模式还需要程序化预算、重试上限和终止状态，不能只靠 manager 自觉停下。

4. **把 checkpoint 当副作用 receipt**：checkpoint 证明框架状态保存到了哪里，不证明邮件、付款或数据库写入是否真实成功。

5. **忽略多套状态边界**：Crew、Flow、runtime event state、memory 和外部系统状态并存，恢复设计必须明确哪个层是源真相。

## 适用 vs 不适用场景

**适用**：

- 任务能拆成 3-7 个清晰子步骤，每步产出可以用文字描述
- 有现成 LLM 提供商账号，并愿意为每条 Crew/Flow 路径设置预算和观测
- 业务方/PM 想自己改流程，又不会写调度代码——"招聘 + 派活"比"画 DAG"门槛低
- 需要快速搭原型展示"AI 能完成端到端业务"

**不适用**：

- 高频实时任务（每条消息都跑一次 Crew，账单和延迟双爆炸）
- 需要用一个简单、显式的状态图完整表达所有控制流，不愿承担 Crew/Flow/runtime 多套抽象
- 严格确定性流程（金融交易、医疗）——LLM 不可控，再多 Agent 也救不了
- 单 Agent 单任务就够的场景——别为了用 Crew 而 Crew

## 固定版本边界

- 本文绑定 `crewAIInc/crewAI@985cf520...`，该提交日期为 2026-07-16。
- 固定仓库要求 Python `>=3.10,<3.14`，版本号由 SCM 动态提供，本文不猜测发布版本。
- 当前源码的 Crew 已含 checkpoint、streaming、memory、knowledge、skills、event 和 usage 等职责。
- Flow 已有独立 DSL、runtime 与 persistence；不能再用早期"只有 Agent/Task/Crew 三个对象"概括整个框架。
- 本文没有调用真实模型、执行 Crew 或恢复 checkpoint，所有运行结论保持 `UNVERIFIED`。

## 学到什么

1. **比喻就是产品**——把"调度多个模型调用"翻译成"组团队 + 派活"，门槛立刻从工程师降到 PM
2. **Role + Goal + Backstory 是 prompt 配置，不是权限边界**——可维护性和安全性是两件事。
3. **顺序流程先用 Crew，显式事件/路由再用 Flow**——不要为了统一外观把两套抽象硬压成一套。
4. **恢复要区分 framework state 与外部事实**——checkpoint 之外仍需 operation ID 和 side-effect receipt。

## 应用型自测

1. Crew 从 checkpoint 恢复后显示付款 Task 已完成，能否直接告诉用户付款成功？
2. 一个流程需要条件分支、等待人工输入和恢复执行，继续堆 sequential Task 还是改用 Flow？
3. `allow_delegation=True` 且 Backstory 写着"只读分析"，能否替代工具权限配置？

检查点：

1. 不能。checkpoint 只证明框架状态，必须读取支付系统的 operation receipt。
2. 优先 Flow，让路由、state 和 persistence 显式；Crew 可以作为其中一个动作。
3. 不能。自然语言不是强制权限边界，工具和凭证仍需程序化收窄。

## 延伸阅读

- 官方文档：[docs.crewai.com](https://docs.crewai.com/)（最新 API 和概念图）
- 上手教程：[CrewAI YouTube 频道](https://www.youtube.com/@crewAIInc)（作者亲自讲案例）
- 源码：[github.com/crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)（核心调度才几千行 Python，能读完）
- 固定源码：[crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) —— 本文绑定提交 `985cf520283e8eaa26b81713e814773ddfdc34ff`
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

- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[openai-agents-sdk]] —— OpenAI Agents SDK — 让多个 agent 协作的轻量框架
