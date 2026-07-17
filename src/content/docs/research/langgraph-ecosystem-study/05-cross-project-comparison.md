# 05. 跨项目比较与选型

## 1. 分层矩阵

| 层级 | 项目 | 它主要解决什么 | 它不负责什么 |
|---|---|---|---|
| Runtime | LangGraph / LangGraph.js | stateful graph、并发、checkpoint、interrupt | Web、auth、业务数据库、exactly-once |
| Standard agent | LangChain | model-tool loop、middleware、structured output | 任意复杂业务图 |
| Agent harness | Deep Agents | filesystem、skills、subagents、memory、sandbox backend | 完整产品控制面 |
| Product harness | DeerFlow | gateway、run、sandbox、memory、channels、UI | 通用低代码 workflow builder |
| Pattern | supervisor/swarm/bigtool | 多 agent 路由、工具检索 | production infra |
| UI | Agent Chat UI | thread、stream、history、interrupt 展示 | graph 执行 |
| App template | Gemini / agent-service-toolkit | 完整应用与服务边界 | 通用 deployment control plane |
| Deployment | Aegra | assistants/threads/runs/store/crons | graph 定义本身 |
| Port | LangGraph4j | Java graph/checkpoint | Python runtime 二进制兼容 |
| Alternative | AF/CrewAI/Pydantic/OpenAI/Mastra | 不同 agent/workflow 抽象 | 与 LangGraph 完全等价 |

## 2. 执行模型

| 项目 | 调度单位 | 下一步怎么决定 | 并发模型 |
|---|---|---|---|
| LangGraph | Pregel actor/node | edge、conditional edge、Command | 同 superstep actors + Send |
| LangChain agent | model/tool node | tool call 或终止 | ToolNode 并发 + LangGraph runtime |
| Deep Agents | middleware 包装的 agent node | model tool call、subagent task | 继承 LangGraph + async subagent |
| Microsoft AF | Executor | typed edge/message | concurrent orchestration / executor |
| CrewAI Crew | Task/Agent | process 与 delegation | async task / Crew process |
| CrewAI Flow | decorated method | listen/router trigger | listener scheduling |
| Pydantic Graph | typed node | node 返回 next node / End | step/join/parallel |
| OpenAI Agents | agent turn | final/tool/handoff | tool concurrency |
| Mastra | workflow step | then/branch/loop/foreach | execution engine |

## 3. 状态模型

| 项目 | 状态在哪里 | 合并语义 | 最容易踩的坑 |
|---|---|---|---|
| LangGraph | state channels | reducer 或 overwrite | 并发字段没 reducer；重复 merge |
| LangChain | AgentState + middleware state | 继承 LangGraph | middleware schema/order 冲突 |
| Deep Agents | messages/files/todos + backend | middleware + DeltaChannel | backend 生命周期与 thread 错配 |
| Microsoft AF | workflow/executor state | executor 自定义保存恢复 | executor rename/schema 迁移 |
| CrewAI | Crew/Flow/runtime event state | framework/runtime 更新 | 多套 state/persistence 边界混淆 |
| Pydantic Graph | typed mutable state + deps | node 直接修改/返回 | 类型正确不代表恢复语义正确 |
| OpenAI Agents | run context/items/session | runner 追加与 handoff filter | session history 与 run state 混用 |
| Mastra | workflow snapshot | step result + mutable state | suspend path 和快照覆盖竞态 |

## 4. 持久化语义

### LangGraph

保存 channel value/version、pending writes 和执行位置，恢复粒度最贴近 graph superstep。

### Microsoft Agent Framework

保存 workflow 与 executor 状态。多 agent orchestration 的 manager/task ledger 也必须实现 checkpoint hook。

### CrewAI

新版本同时支持 Crew/Flow checkpoint、event record 和 fork。它更偏运行对象与事件图的恢复。

### Pydantic AI

类型与序列化体验强，但使用前需确认具体 graph/agent API 是否覆盖目标的 durable 场景。

### OpenAI Agents SDK

Session 解决对话历史，RunState 解决暂停/审批等运行状态。二者不能简单等同 LangGraph 的每 superstep checkpoint。

### Mastra

WorkflowRunState 保存 step result、suspended path 和 resume label，显式处理嵌套 control flow 的恢复。

## 5. 多 agent 模式

| 模式 | 代表项目 | 适用场景 | 主要风险 |
|---|---|---|---|
| Supervisor | langgraph-supervisor | 中心调度 specialist | 中心瓶颈、重述丢信息 |
| Swarm/handoff | langgraph-swarm、OpenAI Agents | agent 自主转交 | 全局策略弱、循环 |
| Sequential | Microsoft AF、CrewAI | 稳定流水线 | 前错后错、无动态路由 |
| Concurrent | Microsoft AF、LangGraph Send | 独立子任务 fan-out | 合并、预算、雪崩重试 |
| Group chat | Microsoft AF、CrewAI | 多角色讨论 | token 放大、终止难 |
| Subagent tool | Deep Agents、DeerFlow | 主 agent 按需委派 | 子任务边界、上下文泄漏 |
| Dynamic tools | Bigtool | 工具数量大 | 检索不是权限 |

## 6. 中间件与 hook

| 项目 | 扩展点 | 更适合放什么 |
|---|---|---|
| LangChain | AgentMiddleware | prompt、model/tool 包装、HITL、retry |
| Deep Agents | ordered middleware stack | filesystem、skills、subagent、memory |
| LangGraph | node/edge、retry/error policy | 业务步骤、路由和恢复 |
| LangGraph4j | NodeHook / EdgeHook | Java 执行横切逻辑 |
| Microsoft AF | chat/function middleware | client、function invocation、approval |
| CrewAI | hooks + event bus | LLM/tool hook、runtime observation |
| OpenAI Agents | lifecycle + guardrail | 输入/输出/工具安全边界 |
| Mastra | processor/workflow step | input/output processor、policy、workflow |

经验规则：

- 业务状态转换放 node/step。
- 跨多个节点的统一策略放 middleware/hook。
- 涉及外部副作用的安全检查必须在工具执行边界，而不只放 system prompt。

## 7. 生产能力矩阵

| 能力 | LangGraph core | agent-service-toolkit | Aegra | DeerFlow | Mastra |
|---|---|---|---|---|---|
| Graph/agent runtime | 强 | 复用 | 复用 | 复用 | 自有 |
| HTTP API | 无 | FastAPI | FastAPI | FastAPI | Server packages |
| Thread/run model | thread config | 简化 | 完整 | 完整 | thread/workflow run |
| Persistent checkpoint | 接口 | 多 backend | Postgres | SQLite/Postgres/memory | storage domains |
| Background worker | 无 | 示例有限 | Redis worker | run manager/worker | deployer/runtime |
| SSE/replay | runtime stream | SSE | live + replay | stream bridge | stream |
| Auth/multi-tenant | 无 | 应用自建 | auth hooks | auth/user isolation | 按 server/deployer |
| Sandbox | 无 | agent 可扩展 | 无核心 sandbox | 内建 | agent/deployer 能力 |
| Skills/subagents | 原语级 | 示例 | graph 自定义 | 内建 | 内建方向 |
| UI | 无 | Streamlit | 可接 Agent Chat UI | 自有前端 | Playground/UI packages |

## 8. 选型决策树

```text
是否只有一次模型调用或简单工具循环？
├── 是
│   ├── 要强类型 Python -> Pydantic AI
│   ├── OpenAI 生态、轻量 handoff -> OpenAI Agents SDK
│   └── provider-neutral + middleware -> LangChain create_agent
└── 否
    是否需要显式复杂状态、循环、并发 fan-out 或 HITL？
    ├── 是
    │   ├── Python/TS 最大控制 -> LangGraph
    │   ├── Java/Spring -> LangGraph4j
    │   ├── Python/.NET/Azure -> Microsoft Agent Framework
    │   └── TypeScript 一体化 -> Mastra
    └── 否
        是否天然是稳定角色+任务团队？
        ├── 是 -> CrewAI
        └── 否 -> 普通代码或标准 agent，先别上复杂框架
```

第二次决策：

```text
是否已经需要文件系统、skills、subagents、sandbox、memory？
├── 是
│   ├── 嵌入式 Python package -> Deep Agents
│   └── 完整产品参考 -> DeerFlow
└── 否 -> 保持低层 runtime + 自己的应用边界
```

第三次决策：

```text
是否要兼容 LangGraph SDK 的自托管 assistants/threads/runs？
├── 是 -> 评估 Aegra 或自建兼容层
└── 否 -> FastAPI + saver + queue 的最小组合可能更简单
```

## 9. 可复用架构模式

### 9.1 State 与外部资源分离

State 只保存 ID、状态和值对象。数据库连接、HTTP client、sandbox handle 放 runtime context/dependency injection。

收益：

- checkpoint 可序列化。
- state 更小。
- 资源生命周期由应用管理。

### 9.2 Checkpointer 与 Store 分离

- Checkpointer：单 thread 执行历史。
- Store：跨 thread memory/knowledge。
- 业务数据库：用户、订单、审计和真实业务事实。

不要把三者混成“反正都能存数据”。

### 9.3 Tool Retrieval 与 Tool Permission 分离

Bigtool 的检索解决“模型看到哪些工具”；permission 解决“当前用户是否能执行”。两个 gate 都需要。

### 9.4 Interrupt Before Side Effect

对支付、删除、发送、发布：

1. 先生成 action proposal。
2. interrupt / approval。
3. 恢复后再执行。
4. 工具层用 operation ID 幂等。

`interrupt_after` 只能审查已经发生的结果，不适合作为授权。

### 9.5 Stream Adapter

内部事件不要直接泄漏给 UI。建立稳定 event contract：

- token
- message
- tool start/end
- node status
- interrupt
- artifact
- error/end

agent-service-toolkit、Aegra、DeerFlow 都有这层转换。

### 9.6 Durable Side Effect Receipt

```text
operation_id = hash(thread_id + logical_step + canonical_args)
atomic claim -> PENDING
execute side effect
commit receipt -> SUCCEEDED + result
resume/retry -> read receipt, never blindly repeat
```

这是 graph checkpoint 外的业务可靠性层。

## 10. 常见误区

1. **“用了图就更 agentic”**
   图只是控制结构。确定性步骤、普通函数和单 agent 都可以放图里。

2. **“多个 agent 一定比一个 agent 好”**
   多 agent 增加上下文传递、token、终止和 observability 成本。只有职责、工具或权限需要隔离时才值得。

3. **“MemorySaver 能验证生产恢复”**
   它只能验证 API 语义，不能验证进程崩溃后的 durable recovery。

4. **“Store 是业务数据库”**
   Store 适合 agent memory/检索，不自动提供业务事务、约束和审计。

5. **“框架自带 streaming，前端就简单”**
   真正的 UI 还要处理重连、历史、重复事件、interrupt、artifact 和错误终态。

6. **“生产就用 stars 最高的”**
   应按状态寿命、恢复语义、副作用、语言栈、部署边界和团队认知选型。

## 11. 最小验收问题

在采用任何框架前，必须能回答：

1. 哪些 state 字段累积，哪些覆盖？
2. 并发分支同时写同一字段怎么合并？
3. 进程在工具副作用后、checkpoint 前崩溃会怎样？
4. thread/run/session 的 ID 谁生成，生命周期多长？
5. 两个请求同时操作同一 thread 怎么串行化？
6. checkpoint 多久清理，数据如何迁移？
7. interrupt 恢复后节点会不会重跑？
8. UI 如何去重和恢复 stream？
9. auth/tenant 信息放 context 还是 state，如何防伪造？
10. 哪些结论有本地测试或 E2E，而不只是 README？
