# 04. 主要同类框架深挖

## 1. Microsoft Agent Framework

### 定位

Microsoft 的 Python/.NET agent 与 multi-agent workflow 框架，覆盖模型客户端、agent、workflow、checkpoint、A2A/AG-UI 和 Azure 集成。

### 架构

Python 核心分为：

- `_agents.py`：基础 Agent 和运行接口。
- `_middleware.py`：chat/function middleware。
- `_sessions.py`：会话状态。
- `_workflows/`：executor、edge、runner、workflow、checkpoint。
- `agent_framework_orchestrations/`：sequential、concurrent、handoff、group chat、Magentic。
- `_harness/`：file access、memory、todo、background agent、approval。

Workflow 的核心不是共享 `TypedDict` channel，而是：

```text
WorkflowBuilder
  -> executors
  -> typed edges/messages
  -> WorkflowRunner
  -> executor state + events
  -> checkpoint storage
```

### 多 agent 模式

- `SequentialBuilder`：前一 participant 输出进入下一 participant。
- `ConcurrentBuilder`：并行执行后聚合。
- `HandoffBuilder`：agent 通过 handoff tool 决定下一 agent。
- `GroupChatBuilder`：manager/selection function 控制发言者。
- `MagenticBuilder`：维护 task ledger 和 manager loop。

### 持久化

Workflow checkpoint 会保存：

- workflow state
- executor state
- pending request info
- event/runner 进度

测试明确覆盖 build-time 与 runtime checkpoint storage、从中间步骤恢复和 participant rename 拒绝。

### 与 LangGraph 对比

优势：

- Python/.NET 对等和 Azure 企业集成。
- 多 agent builder 更丰富、更高层。
- typed message/executor 模型适合服务与 actor 思维。

代价：

- 仓库和产品面很大。
- 与 Microsoft/Azure 生态结合更深。
- 用户需要理解 executor/message/workflow，而不是 LangGraph 的 state/channel。

### 推荐入口

1. `python/packages/core/agent_framework/_workflows/_workflow_builder.py`
2. `_runner.py`
3. `_checkpoint.py`
4. `python/packages/orchestrations/agent_framework_orchestrations/`
5. 对应 checkpoint/resume tests

## 2. CrewAI

### 定位

以角色化 Agent、Task、Crew 为中心，并提供显式 Flow 的多 agent 自动化框架。

### 两条主线

#### Crews

```text
Agents + Tasks
  -> Crew(process=sequential/hierarchical)
  -> kickoff
  -> task execution / delegation / guardrail
  -> CrewOutput
```

Agent 通常由 role、goal、backstory、tools 组成；Task 定义 description、expected output 和 owner；Crew 负责进程、memory、planning、event 和 checkpoint。

#### Flows

```text
Flow state
  -> @start
  -> @listen / and_ / or_
  -> @router
  -> agent / crew / script actions
  -> persistence / human feedback
```

Flow 使用装饰器收集方法和触发关系。state 可以是 dict 或 Pydantic model，并自动带 ID。

### 2026 快照中的 checkpoint

CrewAI 当前已经不只是“保存最终结果”：

- Crew 与 Flow 都有 checkpoint config。
- 支持 `from_checkpoint` 与 `fork`。
- runtime state 记录 event graph、实体和已完成方法。
- Flow persistence 支持 SQLite 与 pending human feedback。
- checkpoint listener 通过事件总线捕获运行状态。

这与早期“CrewAI 没有 durable state”的印象不同，选型时必须基于当前版本。

### 优点

- 角色和任务描述接近业务语言。
- 常见研究/写作/审核流水线搭建快。
- Crew、Flow、memory、knowledge、MCP、A2A 一体化。
- 事件体系和 checkpoint 已显著增强。

### 代价

- Crew、Flow、runtime state、event bus、memory 多套抽象并存。
- 非标准动态控制流会深入 framework internals。
- prompt 与 delegation 行为比显式 graph 更隐式。
- 高层便利使真实模型输入和状态变化更难一眼看清。

### 推荐入口

1. `lib/crewai/src/crewai/crew.py`
2. `agent/core.py`
3. `task.py`
4. `flow/runtime/__init__.py`
5. `flow/dsl/`
6. `state/`

## 3. Pydantic AI

### 定位

“Pydantic 风格”的 Python agent framework，核心强调类型安全、依赖注入、结构化输出和可测试性。

### Agent 模型

Agent 泛型携带：

- dependency type
- output type

`RunContext[DepsT]` 把数据库、配置和服务传给 instructions/tools。Pydantic 验证工具参数和最终输出，类型检查器能在开发期发现依赖或输出类型错配。

### Pydantic Graph

图层采用 typed node object：

```python
@dataclass
class Ask(BaseNode[State, Deps, str]):
    async def run(self, ctx: GraphRunContext[State, Deps]) -> NextNode | End[str]:
        ...
```

节点直接返回下一个 node 或 `End`，控制流体现在返回类型中。`GraphBuilder` 也支持更显式的 step、join、decision 和 parallel paths。

### 与 LangGraph 的差异

| 维度 | Pydantic Graph | LangGraph |
|---|---|---|
| 路由 | node 返回 next node | edge / conditional edge / Command |
| 状态 | mutable typed state + deps | partial update + reducer channels |
| 类型 | Python 类型是主设计中心 | schema + runtime channel 语义 |
| 持久化 | 可序列化 graph run/自定义 | checkpointer 是核心接口 |
| 并发 | builder step/join | Pregel superstep + Send |

### 优点

- Python 类型体验清晰。
- dependency injection 非常适合业务服务。
- structured output 与 tool validation 一体化。
- 简单 agent 的代码量小。

### 代价

- 生态和部署控制面小于 LangChain/LangGraph。
- 大规模 durable workflow 需要仔细评估 persistence/runtime 能力。
- node class 风格对偏函数式团队可能较重。

### 推荐入口

1. `pydantic_ai_slim/pydantic_ai/agent/abstract.py`
2. `pydantic_ai_slim/pydantic_ai/agent/__init__.py`
3. `pydantic_graph/pydantic_graph/basenode.py`
4. `pydantic_graph/pydantic_graph/graph_builder.py`
5. `pydantic_graph/pydantic_graph/step.py`

## 4. OpenAI Agents SDK

### 定位

轻量 agent runner，围绕 Agent、Runner、Tool、Handoff、Guardrail、Session 和 Tracing 组织。

### 执行模型

```text
Runner.run(agent, input)
  -> prepare turn
  -> model call
  -> resolve output:
       final output
       tool calls
       handoff
       approval interruption
  -> execute tools / switch agent
  -> next turn
  -> result + trace + session persistence
```

它不是 graph-first。控制流主要来自 model tool call、handoff 和 run loop。

### 核心组件

- `agent.py`：instructions、tools、handoffs、guardrails、output type。
- `run.py` / `run_internal/`：turn loop、tool execution、streaming。
- `handoffs/`：handoff tool schema、history filter。
- `guardrail.py` / `tool_guardrails.py`：输入、输出和工具边界。
- `memory/session.py`：conversation session。
- `run_state.py`：可恢复运行状态。
- `tracing/`：trace/span。
- `sandbox/`：文件、shell、skills、snapshot 和多 provider sandbox session。

### Handoff

Handoff 被模型看成工具。调用后：

- 可运行 `on_handoff`。
- 可验证结构化输入。
- 可过滤或重写历史。
- target Agent 接管下一轮。

它更接近 swarm，而不是 LangGraph supervisor。

### Guardrail

- input guardrail 可在 agent 前或与 agent 并行运行。
- output guardrail 检查最终输出。
- tool guardrail 在工具调用前后执行。
- tripwire 通过明确异常终止。

### 优点

- 核心概念少，普通 agent 快速。
- handoff/guardrail/tracing 是第一等 API。
- OpenAI 模型与 Responses API 集成最自然。
- 当前代码也已包含 sandbox、approval、session state 等高阶能力。

### 代价

- 任意确定性图和复杂业务状态机不如 LangGraph 自然。
- provider-neutral 程度弱于 LangChain/Pydantic AI。
- durable workflow 语义不是最初的核心抽象，复杂恢复需精读 `RunState` 和 session。

### 推荐入口

1. `src/agents/run.py`
2. `src/agents/run_internal/run_loop.py`
3. `src/agents/agent.py`
4. `src/agents/handoffs/__init__.py`
5. `src/agents/guardrail.py`
6. `src/agents/run_state.py`

## 5. Mastra

### 定位

TypeScript/Node.js 的一体化 agent 应用框架，包含 agent、workflow、memory、RAG、eval、storage、observability、server 和 deployer。

### Workflow 模型

```text
createWorkflow
  -> createStep
  -> then / parallel / branch / loop / foreach
  -> ExecutionEngine
  -> step handlers
  -> WorkflowRunState snapshot
  -> storage
  -> suspend / resume / time travel
```

核心目录：

- `packages/core/src/workflows/`
- `packages/core/src/agent/`
- `packages/core/src/loop/`
- `packages/core/src/storage/`
- `packages/core/src/memory/`

### 持久化与恢复

Workflow snapshot 包含：

- workflow status
- step results
- serialized state
- suspended paths
- resume labels
- tracing context

control-flow handler 分别处理 parallel、conditional、loop 和 foreach 的恢复路径。代码显式防止 resume 时把已持久化的 `suspended/paused` snapshot 被中间 `running` 状态覆盖。

### Agent 与 Workflow 关系

Mastra 的 agent loop 本身也建立在 workflow primitives 上。Durable agent 再加入：

- active run registry
- resumable streams
- tool approval
- background tasks
- snapshot serialization
- durable workflow adapter

### 优点

- TypeScript 全栈一致。
- workflow、agent、memory、storage、server 同一生态。
- suspend/resume、time travel 和 durable agent 不是外围 demo。
- 前端/Node 团队上手自然。

### 代价

- monorepo 很大，功能面和发布矩阵复杂。
- 部分企业功能有不同许可证边界，复制前需逐包核对。
- 一体化带来更多内部约定和框架锁定。
- 与 Python AI/数据生态相比，某些模型和检索集成选择不同。

### 推荐入口

1. `packages/core/src/workflows/workflow.ts`
2. `packages/core/src/workflows/create.ts`
3. `packages/core/src/workflows/execution-engine.ts`
4. `packages/core/src/workflows/handlers/entry.ts`
5. `packages/core/src/workflows/handlers/control-flow.ts`
6. `packages/core/src/agent/durable/`

## 6. 对照结论

### 控制力从高到低不是单一排序

- LangGraph：state/channel/control-flow 控制最显式。
- Microsoft Agent Framework：executor/message/workflow 控制强，多 agent builder 高层。
- Mastra：TS workflow 控制强，同时集成更多产品层。
- Pydantic AI：类型和依赖控制强，复杂 runtime 控制相对少。
- OpenAI Agents SDK：agent loop 边界清楚，但任意图不是主抽象。
- CrewAI：业务角色表达最高层，底层细节相对隐式。

### 持久化也不是同一含义

- LangGraph：每个 superstep 的 channel/checkpoint。
- Microsoft Agent Framework：workflow + executor state。
- CrewAI：event/runtime entity 与 Flow method state。
- Pydantic Graph：graph run/state serialization。
- OpenAI Agents SDK：session history + RunState。
- Mastra：workflow snapshot + suspended paths。

选型前必须先问：“我要恢复的是对话、业务状态、节点进度、工具审批，还是外部副作用结果？”不同框架的“resume”并不自动等价。
