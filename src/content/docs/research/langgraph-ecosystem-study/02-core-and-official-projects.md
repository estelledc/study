---
title: "02. 核心与官方项目深挖"
sidebar:
  hidden: true
---
# 02. 核心与官方项目深挖

## 1. LangGraph Python

### 定位

低层、有持久状态的 graph runtime。它既能运行确定性 workflow，也能承载 LLM agent，不绑定具体模型供应商。

### 架构

```text
StateGraph builder
  -> nodes / edges / branches / state schemas
  -> compile()
CompiledStateGraph
  -> Pregel runtime
  -> PregelLoop + PregelRunner
  -> channel reads/writes + reducer
  -> checkpointer / store / stream
```

核心分层：

- `libs/langgraph/langgraph/graph/`：用户面对的 graph builder。
- `libs/langgraph/langgraph/pregel/`：执行循环、task 调度、读写、重试、checkpoint。
- `libs/langgraph/langgraph/channels/`：状态字段的存储与合并语义。
- `libs/checkpoint/`：checkpoint schema、serializer 和 saver 接口。
- `libs/prebuilt/`：历史 ReAct/ToolNode 等预构建能力。
- `libs/sdk-py/`：与部署服务交互的 Python SDK。

### 核心机制

`StateGraph` 节点契约是 `State -> Partial<State>`。每个 state key 可以声明 reducer：

- 没 reducer：通常是 last-value/overwrite 语义。
- 有 reducer：把同一 superstep 的多个更新显式合并。

`compile()` 会：

1. 验证节点、边、interrupt 目标和 schema。
2. 把 state 字段映射为 channels。
3. 把节点包装成 Pregel actors。
4. 把边和条件路由变成 channel trigger/write。
5. 绑定 checkpointer、store、cache、stream 和 interrupt 配置。

Pregel 运行每个 superstep 分三阶段：

1. **Plan**：根据上一步更新的 channels 选择 runnable actors。
2. **Execute**：并行执行 actors；本步写入对同一步其他 actor 不可见。
3. **Update**：集中应用 channel updates，再进入下一步。

这就是 reducer 能避免并发隐式覆盖的原因：并发节点不是直接争写一个 Python dict，而是提交 updates，由 channel 统一合并。

### 持久化模型

Checkpoint 不只是 state JSON，还包括：

- `channel_values`
- `channel_versions`
- 每个 node 已看过的 versions
- parent checkpoint
- pending writes
- metadata / step / source

`thread_id` 是会话级主键。checkpointer 解决 thread 内短期状态和执行恢复；跨 thread 的长期数据应放 `Store` 或业务数据库。

### 控制原语

- `Command(update=..., goto=..., resume=...)`：一次返回同时修改状态和控制路由。
- `Send(node, arg)`：动态 fan-out，常用于 map-reduce 或多 researcher。
- `interrupt(value)`：保存状态后暂停，外部用 `Command(resume=...)` 恢复。
- subgraph：把编译图当作普通节点组合。
- stream modes：messages、updates、values、custom、debug 等。

### 优点与代价

优点：

- 控制流和状态语义显式。
- 并行、循环、HITL 和恢复是同一 runtime 的原语。
- graph 与模型供应商解耦。

代价：

- state/reducer 设计错误会直接变成并发和恢复 bug。
- checkpoint 越大，每步序列化成本越高。
- exactly-once、副作用幂等和分布式锁仍由应用负责。
- 低层 API 的学习与测试成本明显高于普通 agent loop。

### 推荐精读

1. `libs/langgraph/langgraph/graph/state.py`：builder 如何编译。
2. `libs/langgraph/langgraph/pregel/main.py`：用户 API 与 Pregel 模型。
3. `libs/langgraph/langgraph/pregel/_loop.py`：一次 run 的状态机。
4. `libs/langgraph/langgraph/pregel/_algo.py`：task 和 channel update。
5. `libs/checkpoint/langgraph/checkpoint/base/__init__.py`：持久化契约。
6. `libs/langgraph/langgraph/types.py`：Command、Send、Interrupt。

## 2. LangGraph.js

### 定位

LangGraph 的 TypeScript/JavaScript 实现，不是 Python SDK 的简单包装。

### 代码组织

- `libs/langgraph-core/src/graph/`：StateGraph 与编译。
- `libs/langgraph-core/src/pregel/`：loop、runner、algo、IO。
- `libs/checkpoint/`：checkpoint、store、serializer。
- `libs/langgraph/`：公开包与高级封装。
- `libs/sdk/`：threads、runs、assistants、stream 客户端。
- `libs/langgraph-supervisor` / `langgraph-swarm`：JS 多 agent 模式。

### 与 Python 的同构

JS 版本也有：

- `StateGraph`
- `CompiledStateGraph`
- `Pregel`
- `PregelLoop`
- `Command`
- `Send`
- `interrupt`
- checkpointer/store

因此两种语言共享心智模型和部署协议。Agent Chat UI 能连接 Python 或 TS graph，关键就是协议层而不是运行时语言一致。

### 差异

- TS 类型系统让 state annotation、Zod schema 和前端共享类型更自然。
- JS 生态更重视 React hooks 与 SDK streaming。
- Python 的生态样例与模型集成仍更丰富。
- 两个实现发布节奏并非每个内部细节严格同步，不能假设 private API 一致。

### 推荐精读

1. `libs/langgraph-core/src/graph/state.ts`
2. `libs/langgraph-core/src/pregel/index.ts`
3. `libs/langgraph-core/src/pregel/loop.ts`
4. `libs/checkpoint/src/base.ts`
5. `libs/langgraph-core/src/interrupt.ts`
6. `libs/sdk/src/`

## 3. LangChain 1.x

### 定位

LangChain 1.x 是标准 agent loop 与模型/工具抽象层。它的 `create_agent` 运行在 LangGraph 之上。

### 核心架构

`libs/langchain_v1/langchain/agents/factory.py` 的 `create_agent`：

1. 规范化 model、tools、response format。
2. 合并用户 state schema 与 middleware 贡献的 schema。
3. 建立 model node 和可选 tool node。
4. 组合 middleware 的 before/after/wrap hooks。
5. 处理 provider-native 或 tool-based structured output。
6. 构造 StateGraph 并编译为 `CompiledStateGraph`。

标准循环：

```text
input
  -> before_agent middleware
  -> before_model middleware
  -> model
  -> after_model middleware
  -> tools or structured output or end
  -> after_agent middleware
```

### Middleware 为什么重要

middleware 把横切能力从 graph 拓扑中抽离：

- `SummarizationMiddleware`
- `HumanInTheLoopMiddleware`
- `ModelRetryMiddleware`
- `ModelFallbackMiddleware`
- `ToolRetryMiddleware`
- `ToolCallLimitMiddleware`
- `ModelCallLimitMiddleware`
- `PIIMiddleware`
- `ContextEditingMiddleware`
- `LLMToolSelectorMiddleware`

它像 Web 框架 middleware，但边界更复杂：既可以改 prompt/tool/model request，也可以贡献 state、返回 `Command` 或包裹工具执行。

### 与 LangGraph 的边界

- 标准 model-tool loop：优先 `create_agent`。
- 自定义多阶段业务状态机：直接 StateGraph。
- 二者可组合：compiled agent 作为 graph node。

### 推荐精读

1. `libs/langchain_v1/langchain/agents/factory.py`
2. `libs/langchain_v1/langchain/agents/middleware/types.py`
3. `libs/langchain_v1/langchain/agents/middleware/human_in_the_loop.py`
4. `libs/langchain_v1/langchain/agents/middleware/summarization.py`
5. middleware typing 与 composition 测试。

## 4. Deep Agents

### 定位

建立在 `create_agent` 上的 batteries-included agent harness。它不是新的 graph runtime，核心价值是经过约束的 middleware stack、backend 和 subagent 体系。

### 代码组织

- `libs/deepagents/deepagents/graph.py`：总装配入口。
- `middleware/filesystem.py`：文件工具和权限。
- `middleware/subagents.py` / `async_subagents.py`：本地与远程委派。
- `middleware/summarization.py`：长上下文压缩和 offload。
- `middleware/skills.py`：渐进式加载 skills。
- `middleware/memory.py`：长期 memory 注入。
- `backends/`：state、filesystem、store、sandbox、composite。
- `profiles/`：按模型/供应商调整 prompt、工具和 middleware。
- `libs/code/`：CLI/coding agent 上层能力。

### 装配顺序

基础 stack 大致为：

1. Todo
2. Skills（可选）
3. Filesystem
4. SubAgent
5. Summarization
6. PatchToolCalls
7. AsyncSubAgent（可选）
8. 用户 middleware
9. provider/profile middleware
10. tool exclusion / prompt cache
11. Memory（可选）
12. HITL（可选）

顺序就是行为。summarization、tool patch、permission 和 HITL 的相对位置改变，可能导致工具参数丢失、审批绕过或恢复不一致。

### Backend 边界

- `StateBackend`：文件存在 graph state 中，随 checkpoint/thread 生命周期。
- `FilesystemBackend`：文件直接落盘，跨 thread 共享风险需要自行处理。
- `StoreBackend`：跨 thread 持久化。
- `SandboxBackend`：提供隔离执行。
- `CompositeBackend`：按路径/能力组合多个后端。

### 关键设计

- Filesystem 与 SubAgent 是受保护 middleware，profile 不能静默移除。
- subagent 可以是声明式 agent、已编译 runnable 或远程 async graph。
- permissions 在 filesystem middleware 执行，不只依赖 prompt。
- profile 让不同模型获得不同 tool description、prompt suffix 和兼容 shim。

### 推荐精读

1. `libs/deepagents/deepagents/graph.py`
2. `middleware/filesystem.py`
3. `middleware/subagents.py`
4. `middleware/summarization.py`
5. `backends/protocol.py`
6. `libs/code/deepagents_code/agent.py`

## 5. Supervisor

### 定位

中心 supervisor 通过 handoff tools 调度多个 worker agent。

### 结构

`create_supervisor` 接收多个已编译 Pregel agent：

- 为每个 worker 创建 `transfer_to_<agent>` 工具。
- supervisor 自身是一个 ReAct agent。
- worker 作为外层 graph 节点。
- worker 完成后可追加 handoff-back 消息。
- `output_mode` 决定回传完整历史还是最后消息。

### 关键实现

handoff tool 返回 `Command(graph=Command.PARENT, goto=...)`。并行 handoff 时用 `Send`，并清理与当前 worker 无关的 tool calls，保证消息历史符合模型工具协议。

### 适用与风险

适用：

- 有明确中心路由器。
- 需要中心统一决定 specialist。
- 需要层级 supervisor。

风险：

- supervisor 重述 worker 结果会丢信息或增加 token。
- 并行 handoff 使消息合法化更复杂。
- 中心 agent 是质量、延迟和故障瓶颈。

### 推荐入口

- `langgraph_supervisor/supervisor.py`
- `langgraph_supervisor/handoff.py`
- `tests/`

## 6. Swarm

### 定位

去中心 handoff。当前 active agent 决定把控制权转给另一个 agent。

### 核心状态

`SwarmState` 在 messages 外增加 `active_agent`。入口路由读取这个字段，默认进入指定 agent。handoff tool 返回：

```text
Command(
  goto=target,
  graph=PARENT,
  update={messages: ..., active_agent: target}
)
```

checkpointer 保存 `active_agent` 后，下一轮用户消息会继续进入上次活跃 agent。

### 与 Supervisor 的本质差异

- Supervisor：中心判断下一跳。
- Swarm：当前 specialist 自己判断下一跳。

Swarm 更灵活，但更难保证全局策略、终止条件和一致的用户体验。

### 推荐入口

- `langgraph_swarm/swarm.py`
- `langgraph_swarm/handoff.py`

## 7. Bigtool

### 定位

解决“工具太多，不能每轮全部塞进模型上下文”的问题。

### 数据流

```text
model initially sees retrieve_tools only
  -> model requests tool search
  -> Store semantic search returns tool IDs
  -> selected_tool_ids reducer accumulates IDs
  -> next model call binds retrieved tools
  -> requested real tools execute
  -> loop
```

动态 fan-out 由 `Send("select_tools", ...)` 与 `Send("tools", ...)` 完成。

### 关键判断

Bigtool 优化的是 tool discovery 和 prompt size，不是权限。检索到工具后仍需：

- allowlist
- permission
- input validation
- risk gate
- audit

### 推荐入口

- `langgraph_bigtool/graph.py`
- `langgraph_bigtool/tools.py`

## 8. ReAct Agent Template

### 定位

最小、可部署的手写 ReAct graph，适合建立第一条源码链路。

### 图

```text
START -> call_model
call_model --has tool calls--> tools
call_model --no tool calls--> END
tools -> call_model
```

它展示：

- state、input schema、context schema 分离。
- model 与 tools 动态绑定。
- `is_last_step` 防止耗尽 recursion budget 时继续发工具调用。
- `ToolNode` 执行工具。

### 推荐入口

- `src/react_agent/graph.py`
- `state.py`
- `context.py`
- `tools.py`

## 9. LangGraph 101

### 定位

官方课程与可运行 agent 集合，覆盖原语到生产模式。

### 组织

- `notebooks/101/`：LangChain/LangGraph 基础和 middleware。
- `notebooks/201/`：multi-agent、email、research、Deep Agents。
- `agents/`：可由本地 LangGraph server 加载的完整 agent。
- `langgraph.json`：部署/开发 graph 入口。

### 教学价值

相比散落教程，它把以下内容串成递进路线：

1. agent loop
2. state/checkpointer
3. interrupt/resume
4. Store 与 memory
5. subgraph
6. supervisor/swarm
7. research fan-out
8. Deep Agents backend

### 限制

Notebook 适合教学，不等同 production reference：

- 多数例子用 MemorySaver。
- API、auth、queue、tenant isolation 不在课程主线。
- notebook 输出可能落后于当前源码版本。

## 10. Awesome LangGraph

### 定位

生态索引，不是执行项目。

### 内容

按以下方向组织链接：

- LangChain / LangGraph / Deep Agents / LangSmith
- 官方 specialized libraries
- apps & agents
- development tools
- community projects
- chat UI、RAG、coding、finance、health 等垂直分类

### 正确用法

1. 用它发现候选。
2. 回 GitHub 核对活跃度、许可证和归档状态。
3. clone 后读源码。
4. 不把索引描述直接写成项目事实。

它适合作为研究语料集的“雷达”，不适合作为架构结论的最终来源。
