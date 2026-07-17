# LambChat 架构深挖

> 固定源码：`Yanyutin753/LambChat@f520f4b55b092b796d8c4e4a64555ba233af2f8a`

## 1. 项目定位

LambChat 将自己描述为由 Skills 和 MCP 驱动、面向治理的企业 Agent 基础设施。
从源码看，更准确的定位是：

> 一个以 DeepAgents 为内层 harness、以 LangGraph 为状态运行时，补齐用户、任务、
> 事件、能力配置、沙箱和多端界面的 Agent 产品平台。

它不是：

- 新的 LLM provider；
- 新的基础 Agent loop；
- 纯 MCP gateway；
- 只负责展示消息的 ChatGPT clone；
- 组织/Workspace 模型已经完备的 SaaS 控制面。

## 2. 总体分层

```text
Web / Desktop / Mobile
        |
        | REST + SSE
        v
FastAPI routes + auth + ownership checks
        |
        v
TaskManager ---------------------- Redis/arq
        |
        v
TaskExecutor + Presenter --------- event store + live stream
        |
        v
outer LangGraph agent
        |
        v
inner DeepAgents graph
  | tools | skills | memory | subagents | MCP |
        |
        v
Composite backend / sandbox
  | MongoDB virtual files | Daytona/E2B/CubeSandbox |
```

### 每层的责任

| 层 | 主要责任 | 关键目录 |
|---|---|---|
| 前端 | 提交 run、重连 SSE、统一归约历史与实时事件 | `frontend/src/hooks/useAgent/` |
| API | 鉴权、session 所有权、模型/persona 解析、排队 | `src/api/routes/` |
| 任务 | run 状态、并发、心跳、恢复、进程内/arq 分发 | `src/infra/task/` |
| 事件 | 将 Agent 事件持久化并发布给在线客户端 | `src/infra/presenter/` 及任务执行器 |
| Agent | 外层运行上下文与内层 DeepAgents 组装 | `src/agents/` |
| 能力 | Skills、MCP、Memory、工具、配额 | `src/infra/{skill,mcp,memory,tool}/` |
| 执行 | 虚拟文件系统、远端沙箱、session 工作目录 | `src/infra/{backend,sandbox}/` |
| 状态 | graph checkpoint、store、业务持久化 | `src/infra/storage/`、数据库模块 |

## 3. 一次聊天请求的完整控制流

### 3.1 阶段 A：提交，不在 HTTP 请求中长跑

入口：

```text
src/api/routes/chat.py
  POST /api/chat/stream
```

路由首先做：

1. `require_permissions("chat:write")` 鉴权；
2. 校验 session 是否属于当前用户；
3. 解析 persona 和用户可访问的模型；
4. 生成 `run_id` 和 `trace_id`；
5. 检查用户并发限制，必要时进入队列；
6. 根据配置选择进程内任务或 arq；
7. 返回 `session_id + run_id`。

关键点：名为 `/stream` 的 POST 并不把整个 Agent event stream 绑在这个请求上。
它提交一个可单独寻址的 run。这样浏览器断开不会天然取消后台任务。

### 3.2 阶段 B：TaskManager 选择执行后端

入口：

```text
src/infra/task/manager.py
```

两条路径：

- `BackgroundTaskManager.submit(...)` 使用 `asyncio.create_task`；
- `submit_arq(...)` 将可序列化 payload 保存并提交到 arq/Redis。

这反映了开发与生产的不同需求：

- 进程内模式启动简单，但进程退出会丢失未完成任务；
- arq 模式需要额外序列化和队列基础设施，但可跨进程调度、恢复和控制并发。

Redis 还用于并发队列和任务恢复协调。这里的 Redis 不是 graph checkpoint 的替代品：
它负责调度状态，Agent 的执行状态由 LangGraph/checkpointer 管理。

### 3.3 阶段 C：TaskExecutor 建立 run 生命周期

入口：

```text
src/infra/task/executor.py
  TaskExecutor.run_task(...)
```

主要步骤：

1. run 状态从 `STARTING` 进入 `RUNNING`；
2. 启动任务心跳；
3. 创建 `Presenter`；
4. 注入 `TraceContext`；
5. 持久化用户消息；
6. 调用 `_execute_agent_stream(...)`；
7. 消费每个 Agent event，并交给 `presenter.save_event(event)`；
8. 成功时写 `COMPLETED`，异常时写 `FAILED`；
9. 结束 trace、通知和在线流的 TTL 生命周期。

`try/finally` 风格的生命周期管理很重要：任务失败不应只在日志里留一个 exception，
还必须形成客户端和恢复逻辑能读取的终态。

### 3.4 阶段 D：AgentFactory 找到外层 Agent

入口：

```text
src/agents/core/base.py
  BaseGraphAgent
  GraphBuilder
  AgentFactory
  @register_agent
```

`AgentFactory.get(agent_id)` 根据注册表取得 Agent，随后：

```python
async for event in agent.stream(
    message,
    session_id,
    user_id=user_id,
    presenter=presenter,
    ...
):
    yield event
```

外层 `BaseGraphAgent` 是 LangGraph `CompiledGraph` 的产品适配层，负责：

- 将 `user_id/session_id/run_id` 等运行上下文放入 graph；
- 注入 `Presenter`；
- 获取 checkpoint/store；
- 将底层 stream 事件转换为平台事件；
- 统一不同 Agent 类型的调用接口。

### 3.5 阶段 E：节点内创建 DeepAgents graph

核心入口：

```text
src/agents/fast_agent/nodes.py
src/agents/search_agent/nodes.py
```

内层大致装配为：

```python
inner_graph = create_deep_agent(
    model=llm,
    system_prompt=system_prompt,
    backend=backend,
    tools=filtered_tools,
    checkpointer=inner_checkpointer,
    store=store,
    skills=None,
    subagents=custom_subagents,
    middleware=user_middleware,
)
```

这里出现了“双层 graph”：

- **外层 LambChat graph**：平台运行上下文、事件适配和 Agent 类型边界；
- **内层 DeepAgents graph**：模型循环、工具、文件系统、Skills、子 Agent 和总结。

优点：

- LambChat 不必 fork DeepAgents 的核心 loop；
- 产品生命周期与 Agent harness 可以独立演进；
- 同一平台可注册不同 Agent 类型。

代价：

- checkpoint/thread 配置必须区分内外层；
- stream event 需要转换；
- 异常和 interrupt 可能跨两层传播；
- 调试时要先判断问题属于产品 wrapper 还是 harness。

### 3.6 Fast Agent 与 Search Agent

两者共用 DeepAgents 基础装配，但 Search Agent 额外接入：

- 远端 sandbox backend；
- Sandbox MCP；
- 环境变量提示；
- `MCPQuotaMiddleware`；
- session 工作目录。

这体现了权限按能力分级的设计：并非所有对话都默认获得可执行沙箱和完整 MCP。

## 4. 事件双写与前端重建

### 4.1 Presenter 的角色

`Presenter` 不是简单日志器。它把同一个语义事件投影到两个目的地：

1. **持久化事件**：供历史加载、重连和审计；
2. **实时流**：供当前在线客户端低延迟消费。

这是一种 event log + live projection 模式。真正的 run 不属于某条 SSE 连接，SSE 只是
事件的一个订阅视图。

### 4.2 前端连接

关键入口：

```text
frontend/src/hooks/useAgent/sseConnection.ts
frontend/src/hooks/useAgent/eventHandlers.ts
frontend/src/hooks/useAgent/eventProcessor.ts
frontend/src/hooks/useAgent/historyLoader.ts
```

前端使用：

```typescript
fetchEventSource(
  `/api/chat/sessions/${sessionId}/stream?run_id=${runId}`,
  ...
)
```

`session_id + run_id` 很关键：

- `session_id` 找到产品会话；
- `run_id` 防止把旧任务事件混入当前任务；
- 客户端刷新后可以重新连接同一 run；
- 同一 session 的多个 run 可以分开处理。

### 4.3 统一事件归约器

历史加载和实时 SSE 最终都进入 `processMessageEvent`。这避免两套状态重建逻辑：

```text
persisted events ----\
                      -> processMessageEvent -> UI state
live SSE events -----/
```

如果历史回放和实时消费各写一套 reducer，常见后果是刷新前后 UI 不一致、tool call
重复、待办状态丢失。LambChat 的统一归约器是一个值得复用的产品模式。

### 4.4 仍需关注的失败场景

源码架构能降低风险，但生产验证仍需覆盖：

- 持久化成功而实时发布失败；
- 实时发布成功而持久化失败；
- 重连边界的事件重复；
- 多实例下事件顺序；
- run 已终态但客户端漏掉终态事件；
- arq 重试导致相同业务副作用重复。

正确性不能只靠前端去重；事件最好具有稳定 ID、run 内序号和幂等写入约束。

## 5. Skills：元数据常驻，正文按需加载

关键入口：

```text
src/infra/backend/skills_store.py
src/infra/skill/middleware.py
src/infra/skill/storage.py
src/infra/skill/marketplace.py
```

### 5.1 存储模型

Skills 通过统一 Backend 路径暴露，例如：

```text
/skills/<skill-name>/SKILL.md
/skills/<skill-name>/references/...
/skills/<skill-name>/scripts/...
```

底层可以是 MongoDB 中的 Skill 记录，但对 Agent 表现为文件系统。这让 DeepAgents 的
Filesystem/Skills middleware 不必知道产品数据库结构。

### 5.2 渐进披露

初始 prompt 只提供：

- Skill 名称；
- 简短描述；
- 虚拟路径。

模型决定需要时再读取 `SKILL.md` 和引用资源。收益：

- 减少初始上下文；
- Skills 数量可以增长；
- 可以先做用户/角色过滤；
- Skill 仍保留文件化、可组合的使用方式。

### 5.3 市场与用户边界

LambChat 还提供 Skill marketplace 和存储管理。这说明 Skill 在这里不只是仓库里的
静态提示词，而是产品资产。相应风险包括版本、来源、恶意指令、脚本权限和撤销。

## 6. MCP：连接之外的治理

关键入口：

```text
src/infra/tool/mcp_client.py
src/infra/tool/mcp_global.py
src/infra/mcp/storage.py
src/infra/mcp/quota.py
src/infra/mcp/encryption.py
```

### 6.1 用户配置与客户端缓存

平台按用户加载有效 MCP server 配置，并通过 `MultiServerMCPClient` 聚合工具。
客户端初始化使用：

- 本地锁；
- Redis 分布式锁；
- TTL/LRU 缓存。

这是为了避免同一 server 在并发请求下反复初始化，同时支持多实例失效协调。

### 6.2 授权与过滤

工具暴露前执行：

- server 级角色过滤；
- tool 级角色过滤；
- 当前 Agent 的工具子集；
- 用户调用配额检查。

因此“能连上 MCP server”和“模型能看到某个 tool”是两件事。

### 6.3 调用保护

平台为 MCP 调用增加：

- quota；
- timeout；
- retry；
- cache；
- 分布式协调。

这些是 MCP 协议之外的产品责任。

### 6.4 凭证

MCP env/header 通过 Fernet 加密后持久化。它解决数据库静态泄漏风险，但仍需区分：

- 存储时是否加密；
- 运行时在哪个进程解密；
- 解密后的凭证是否进入模型可读环境；
- 日志和异常是否会泄漏。

相比 Lobu/Preloop 的 Gateway 注入模式，LambChat 更偏应用内凭证管理，而不是将
credential brokerage 独立成出口控制面。

## 7. Memory：显式、自动与压缩

关键入口：

```text
src/infra/memory/tools.py
src/infra/memory/client/native/
src/infra/memory/compaction_agent.py
src/infra/memory/distributed.py
```

### 7.1 三种能力

1. **显式工具**
   - `memory_retain`
   - `memory_recall`
   - `memory_delete`
2. **自动捕获**
   - 从会话中识别可能长期有用的信息；
3. **索引与压缩**
   - 生成 `<memory_index>`；
   - 提示过期；
   - 合并或压缩自动记忆。

### 7.2 分布式协调

实现包含：

- Redis 失效广播；
- 分布式压缩锁；
- 防止多个进程同时压缩同一用户记忆；
- 保护人工记忆不被自动压缩流程删除。

最后一条很重要：用户显式保存的信息和模型自动推断的信息不能共享相同删除权。

### 7.3 产品风险

仍需通过运行验证和产品规则回答：

- 自动记忆是否展示来源；
- 错误记忆怎样纠正；
- 不同 persona 是否共享；
- 删除是否覆盖所有索引和缓存；
- 敏感信息是否默认禁止自动留存。

## 8. Sandbox 与虚拟文件系统

关键入口：

```text
src/infra/sandbox/session_manager.py
src/infra/sandbox/base.py
src/infra/backend/daytona.py
src/infra/backend/e2b.py
src/infra/backend/cubesandbox.py
```

### 8.1 当前隔离模型

- 一个用户绑定一个远端 sandbox；
- 不同 session 使用 `sessions/<session_id>` 工作目录；
- DeepAgents 通过 BackendProtocol 读写文件和执行命令；
- provider 可以切换 Daytona、E2B、CubeSandbox。

用户级 sandbox 降低实例成本，session 子目录提供逻辑隔离。它不等价于 per-session
容器隔离：同一用户不同 session 仍共享 sandbox 进程和更大的文件系统边界。

### 8.2 Backend 抽象的价值

Agent 只看到：

- list/read/write/edit/search 文件；
- 上传下载；
- 在 sandbox backend 上执行命令。

底层可以将 `/skills/` 路由到 MongoDB，将 session workspace 路由到远端沙箱。
这种 CompositeBackend 使“产品资产”和“执行工作区”共享文件语义，但拥有不同存储。

### 8.3 需要进一步验证的安全问题

- session 路径是否完整防止 traversal；
- 同用户不同 session 是否允许互访；
- sandbox 网络 egress 默认策略；
- provider credential 是否进入沙箱；
- 空闲回收、超时和孤儿实例清理；
- shell 输出和文件制品的大小限制。

## 9. Checkpoint 与三类持久性

入口：

```text
src/infra/storage/checkpoint.py
```

Checkpoint 优先使用 PostgreSQL/MongoDB，无法使用时退化到带限制缓存的
`MemorySaver`。

必须理解这个退化的含义：

- `MemorySaver` 能让当前进程内 graph 工作；
- 它不能提供跨进程、跨重启的 durable execution；
- arq 能重新投递任务，不代表 graph 能从最后 checkpoint 继续；
- 产品消息和事件仍可能保存，但 Agent 内部节点状态可能重算。

所以部署健康检查不能只看 API 可用，还应确认生产 checkpointer 已连接。

## 10. 身份、租户与权限边界

源码已验证的主要边界：

- JWT token payload；
- `require_permissions(...)`；
- session 所有权；
- 用户可访问模型；
- MCP server/tool 角色；
- 用户级 quota；
- 用户绑定的 Skills、Memory 和 sandbox。

研究判断：LambChat 的“multi-tenant”主要是**多用户资源隔离和角色治理**。与典型
组织级 SaaS 相比，仍要单独验证：

- organization/workspace 是否是所有资源的根主键；
- 管理员是否能在组织内委派；
- 数据库查询是否始终带 tenant predicate；
- tenant 级密钥、预算、审计保留和导出；
- 跨组织共享 Agent/Skill 的显式模型。

这不是否定其多用户能力，而是避免把“user isolation”与“完整组织租户模型”混为一谈。

## 11. 代码组织

```text
LambChat/
├── src/
│   ├── agents/       # Agent 注册、外层 graph、Fast/Search Agent
│   ├── api/          # FastAPI routes、dependencies、schemas
│   ├── infra/        # task、tool、MCP、skill、memory、sandbox、storage
│   └── kernel/       # 共享运行时内核与基础约定
├── frontend/
│   ├── src/          # Web 产品与事件状态
│   ├── src-tauri/    # 桌面封装
│   ├── ios/
│   └── android/
├── tests/            # agents/api/events/infra/kernel 等测试
├── deploy/           # 部署资源
├── k8s/              # Kubernetes 配置
├── nginx/            # 反向代理
└── docs/             # 中英文与前端文档
```

组织上的优点：

- 业务 API 与 infra 能力分开；
- Agent 装配集中在 `src/agents`；
- 前端事件处理有独立 hooks；
- 测试目录按主要层次组织。

需要警惕：

- `infra` 承担很多责任，长期可能成为高耦合中心；
- 双层 graph 和多种持久化后端增加配置矩阵；
- 任务、checkpoint、事件、消息四套状态的终态一致性需要专项测试；
- Fast/Search Agent 组装若持续分叉，可能出现 middleware 能力漂移。

## 12. 架构强项与代价

### 强项

1. 请求提交与长任务执行解耦；
2. 事件持久化和实时发布统一；
3. 历史与实时前端事件使用同一归约器；
4. 复用 DeepAgents/LangGraph，而不是重写基础 loop；
5. Skills/MCP/Memory/Sandbox 都有产品入口；
6. 支持进程内到队列后端的渐进部署；
7. 多端和文件制品使它不止是 API demo。

### 代价

1. 双层 graph 增加调试和 checkpoint 复杂度；
2. 用户级 sandbox 不是最强 session 隔离；
3. 多种数据库和缓存提高运维成本；
4. 应用内 MCP 凭证治理弱于独立 credential gateway；
5. 多租户语义偏用户级，组织级控制面仍需验证；
6. 自动 Memory 带来准确性、隐私和删除一致性问题。

## 13. 一句话心智模型

```text
LambChat =
DeepAgents harness
+ LangGraph durable state
+ task/run lifecycle
+ persisted/live event projection
+ user-scoped capability plane
+ product UI and governance
```
