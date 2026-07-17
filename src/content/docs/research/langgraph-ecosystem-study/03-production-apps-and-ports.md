---
title: "03. 生产应用、部署层与跨语言实现"
sidebar:
  hidden: true
---
# 03. 生产应用、部署层与跨语言实现

## 1. Agent Chat UI

### 定位

一个连接任意 LangGraph Python/TypeScript agent 的通用 Next.js 客户端。它验证了“UI 依赖协议，不依赖 graph 实现语言”。

### 架构

```text
Next.js page
  -> ThreadProvider: threads list / selected thread
  -> StreamProvider: SDK useStream
  -> Thread UI: messages / tools / artifacts / history
  -> HITL views: generic interrupt or Agent Inbox schema
  -> LangGraph deployment API
```

关键文件：

- `src/providers/Stream.tsx`
- `src/providers/Thread.tsx`
- `src/components/thread/`
- `src/app/api/[..._path]/route.ts`

### 核心机制

`useStream` 维护：

- `threadId`
- current state
- messages
- history
- interrupt
- loading/error
- custom UI events

`onCustomEvent` 用 `uiMessageReducer` 合并生成式 UI 消息。HITL 层能识别 Agent Inbox 格式中的 `action_requests` 与 `review_configs`，也为未知 interrupt 提供 JSON fallback。

### 值得借鉴

- stream state 与页面组件通过 Context 隔离。
- thread ID 放 URL query，便于恢复和分享。
- graph health、auth header、API key 和 assistant ID 都在 provider 层处理。
- tool call、tool result、artifact、interrupt 使用不同展示组件。

### 风险

- 把 API key 存 localStorage 只适合特定部署模型，企业环境应走服务端 session。
- 通用 UI 无法理解所有业务 state，需要 custom event 或业务组件扩展。
- UI 展示 interrupt 不等于服务端已经正确实现权限与审批。

## 2. Gemini Fullstack LangGraph Quickstart

### 定位

Google 提供的完整 research agent 样例：Python graph + Gemini search + React/Vite UI。

### 后端图

```text
START
  -> generate_query
  -> Send(web_research x N)
  -> reflection
  -> sufficient or max loops?
       yes -> finalize_answer -> END
       no  -> Send(web_research x follow-up queries)
```

核心文件：

- `backend/src/agent/graph.py`
- `backend/src/agent/state.py`
- `backend/src/agent/configuration.py`
- `frontend/src/App.tsx`

### 关键实现

- query generation 使用结构化输出。
- `Send` 为每条 query 动态 fan-out。
- web research 直接用 Google GenAI client 取得 grounding metadata。
- state reducer 合并并行分支的结果和来源。
- reflection 决定继续搜索还是完成。
- finalize 阶段把短 URL 恢复成原 URL 并过滤实际使用的来源。

前端 `useStream` 在 `onUpdateEvent` 中把 node update 映射成时间线事件。它展示的是 graph 的结构化进度，不只是 token stream。

### 值得借鉴

- “搜索 -> 反思 -> 补缺口 -> 综合”是可复用 research graph。
- 把 effort 映射为 query 数和循环上限，形成用户可理解的预算控制。
- citation metadata 在工具层取得，最终文本只负责引用标记和综合。

### 限制

- import 时要求 API key，降低测试和模块复用性。
- graph 未绑定持久 checkpointer，样例重点不是 durable recovery。
- research quality 主要依赖 provider-native search，迁移供应商时需重做证据层。
- 前端 cancel 使用 stop 后刷新页面，是 quickstart 而非完整 run management。

## 3. Agent Service Toolkit

### 定位

把多个 LangGraph agent 暴露成可自托管服务的参考工具箱。

### 分层

```text
agents registry
  -> CompiledStateGraph / Pregel / lazy agent
service
  -> FastAPI lifespan
  -> checkpointer + Store injection
  -> invoke / stream / AG-UI endpoints
client
  -> sync/async invoke and SSE parser
UI
  -> Streamlit / optional voice
```

代码组织：

- `src/agents/`：ReAct、RAG、research、interrupt、background、supervisor、MCP。
- `src/service/service.py`：FastAPI 和 SSE 主入口。
- `src/service/agui.py`：AG-UI 协议适配。
- `src/client/client.py`：客户端。
- `src/memory/`：SQLite、Postgres、MongoDB。
- `src/schema/`：请求、消息和 stream schema。

### 请求链

1. FastAPI lifespan 初始化 saver/store。
2. agent registry 返回 graph。
3. service 根据 thread state 判断是否正在 interrupt。
4. 普通请求走 `ainvoke`。
5. streaming 走 `astream`，组合 updates/messages/custom 和 subgraph path。
6. 服务把内部事件转成 SSE。
7. `AgentClient` 再解析为消息或 token。

### 值得借鉴

- 用 registry 把 graph 定义与服务路由解耦。
- 在 lifespan 中初始化数据库 saver，不在每请求 setup。
- thread memory 与 long-term Store 分开注入。
- 同时提供 native API 和 AG-UI。
- `skip_stream` tag 过滤不该向用户重复展示的中间消息。

### 风险

- 自定义 stream 转换逻辑需要紧跟 LangGraph event shape。
- 单个服务承载多个 agent 后，权限、配置和资源隔离需要额外设计。
- 样例支持多种数据库不等于每个 backend 都经过同等规模压测。

## 4. Aegra

### 定位

开源、自托管的 LangGraph deployment backend，目标是兼容 LangGraph SDK，而不是替换 graph runtime。

### 架构

```text
LangGraph SDK / Agent Chat UI
  -> FastAPI routes
     assistants / threads / runs / store / crons
  -> service layer
     graph factory / run preparation / executor / streaming
  -> local executor or Redis worker
  -> LangGraph graph
  -> Postgres checkpoints + Aegra metadata
  -> in-memory or Redis event broker
```

关键目录：

- `libs/aegra-api/src/aegra_api/api/`
- `services/run_executor.py`
- `services/streaming_service.py`
- `services/graph_factory.py`
- `services/thread_state_service.py`
- `core/database.py`
- `core/redis_manager.py`
- `libs/aegra-cli/`

### 核心模型

- Assistant：graph ID + config + metadata + version。
- Thread：状态与历史的稳定标识。
- Run：一次执行及其状态、输入、输出和错误。
- Store：跨 thread KV/搜索。
- Cron：定时触发 run。

### 执行链

1. API 创建 run record。
2. executor 把 `RunJob` 派给本地 task 或 Redis worker。
3. graph factory 加载 `langgraph.json` 中的 graph。
4. run executor 组装 thread/checkpoint/config。
5. graph stream 产生 native 或 legacy events。
6. broker 负责 live stream、replay、cancel/end。
7. run/thread 状态写回数据库。

### 生产设计

- worker lease 与 lease reaper。
- Redis broker 支持多实例 SSE。
- event ID 和 replay 支持断线重连。
- auth handler 与 user filter。
- assistant versioning。
- Alembic migrations。
- run cleanup、cron scheduler、metrics 和 OTel。

### 重要边界

Aegra 扩大了自托管能力，但仍需自行验证：

- SDK 版本兼容。
- 多 worker 竞态。
- auth filter 是否覆盖所有资源。
- run cancel 与工具副作用的真实终止语义。
- checkpoint schema 与 Aegra metadata 的迁移策略。

## 5. DeerFlow 2.x

### 定位

基于 LangChain `create_agent` / LangGraph runtime 的长任务 SuperAgent harness。它不是 DeerFlow 1.x 的 DAG deep-research 代码延续，而是产品和架构重写。

### 总体架构

```text
Web / IM / GitHub / scheduled trigger
  -> FastAPI Gateway
  -> auth / CSRF / trace / user context
  -> run manager + stream bridge
  -> lead agent
     middleware chain
     tools / skills / subagents
  -> sandbox + filesystem + memory
  -> checkpointer + store + run event store
  -> frontend / channel response / artifacts
```

### 代码组织

- `backend/app/gateway/`：API、auth、thread/run、artifact、agent、memory。
- `backend/app/channels/`：飞书、Slack、Telegram、Discord、微信等入口。
- `backend/packages/harness/deerflow/agents/`：lead agent、middleware、memory。
- `backend/packages/harness/deerflow/sandbox/`：sandbox provider 与工具。
- `backend/packages/harness/deerflow/runtime/`：checkpointer、runs、stream。
- `skills/`：内置能力。
- `frontend/src/`：产品前端。

### 与 Deep Agents 的关系

两者方向相近，但职责不同：

- Deep Agents 是可嵌入 Python 应用的通用 harness package。
- DeerFlow 是完整产品，自己维护 gateway、run model、sandbox、memory、channels、UI 和配置。

DeerFlow 当前架构不是手工画一个大型 StateGraph，而是以 lead agent + middleware 为主，再用 subagents 和 tools 扩展。

### 关键设计

1. **Embedded runtime**：Gateway 启动时初始化 checkpointer、store、stream bridge 和 run manager。
2. **用户隔离**：thread、agent、memory、uploads 和 sandbox 路径带 effective user。
3. **Sandbox**：文件与命令执行不直接落在 Gateway 进程。
4. **Channel adapters**：外部消息统一转为 thread/run。
5. **Memory**：支持 middleware 或 tool 模式，且有独立管理 API。
6. **Custom agents**：config + SOUL + tool groups + skills。
7. **Run lifecycle**：支持中止、历史、feedback、usage 和 scheduled tasks。

### 值得借鉴

- 把 graph runtime 当基础设施组件，而不是整个应用。
- Gateway lifespan 明确控制 run drain 与 checkpointer teardown 顺序。
- sandbox、user data 和 thread metadata 分层。
- 多渠道输入共享一套 run/thread 语义。
- token 统计区分 lead/subagent/middleware。

### 风险

- 系统面很大，配置组合和迁移成本高。
- memory、filesystem、sandbox、checkpointer 各有生命周期，边界错配会产生数据泄漏或恢复缺口。
- 多渠道和 GitHub webhook 扩大攻击面。
- 复杂 middleware stack 需要大量集成测试才能证明顺序正确。

### 推荐精读

1. `backend/packages/harness/deerflow/agents/`
2. `backend/app/gateway/deps.py`
3. `backend/app/gateway/services.py`
4. `backend/packages/harness/deerflow/runtime/`
5. `backend/packages/harness/deerflow/sandbox/`
6. `backend/app/channels/manager.py`

## 6. LangGraph4j

### 定位

Java 生态的 LangGraph 风格实现，集成 LangChain4j 与 Spring AI。

### 核心结构

- `langgraph4j-core/`：StateGraph、CompiledGraph、node/edge、checkpoint、serializer。
- `langchain4j/`：LangChain4j agent/tool 集成。
- `spring-ai/`：Spring AI 集成。
- saver modules：Postgres、Redis、MySQL、DynamoDB、Oracle、Hazelcast 等。
- `studio/`：可视化运行。
- `samples/` / `how-tos/`：使用案例。

### Java 映射

| LangGraph 概念 | LangGraph4j |
|---|---|
| StateGraph | `StateGraph<State extends AgentState>` |
| node callable | `NodeAction` / `AsyncNodeAction` |
| conditional edge | `EdgeAction` / `AsyncCommandAction` |
| compiled runtime | `CompiledGraph` |
| checkpointer | `BaseCheckpointSaver` |
| reducer | `Channel` / `Reducer` |
| async | `CompletableFuture` |

### 实现特点

- graph build 时验证重复节点、非法边和 mapping。
- parallel node 显式组合多个 action。
- node/edge hook 类似 middleware，但挂在图执行点。
- serializer 是第一等抽象，因为 Java state 类型恢复更依赖类型映射。
- checkpoint 保存 node、next node 和 state，模型比 Python channel-version checkpoint 更直接。

### 与 Python 版的边界

LangGraph4j 借鉴 API 和概念，但不是逐行移植 Pregel runtime。不能假设：

- checkpoint 格式兼容。
- Python 的所有 stream mode/Command/Send 语义都一一存在。
- LangGraph SDK/Platform 能直接加载 Java graph。

它最适合 Java/Spring 团队借用 graph + checkpoint 心智模型，不适合当 Python LangGraph 的二进制替代品。

### 推荐精读

1. `langgraph4j-core/.../StateGraph.java`
2. `CompiledGraph.java`
3. `state/`
4. `checkpoint/`
5. `internal/node/ParallelNode.java`
6. `agent/AgentEx.java`
