# 基础运行时项目深挖

本篇覆盖 LambChat 的三块直接基础：DeepAgents、LangGraph 和
deepagents-backends。三者分别回答：

- Agent 应该获得哪些“工作方法”；
- 这些工作如何被状态化、调度和恢复；
- Agent 看到的虚拟文件如何落到远程存储。

## 1. DeepAgents

> 固定源码：`langchain-ai/deepagents@d46a2cb033b8195f440f68de744e75874b6f8e6f`

### 1.1 定位

DeepAgents 是 batteries-included Agent harness。它不替代模型、LangGraph 或产品
后端，而是把长任务 Agent 常用能力组合成一致的 middleware 栈。

最重要的入口：

```text
libs/deepagents/deepagents/graph.py
  create_deep_agent(...)
```

### 1.2 组装方式

`create_deep_agent(...)` 最终调用 LangChain `create_agent`，并按顺序装配：

1. `TodoListMiddleware`
2. `SkillsMiddleware`
3. `FilesystemMiddleware`
4. `SubAgentMiddleware`
5. `SummarizationMiddleware`
6. `PatchToolCallsMiddleware`
7. `AsyncSubAgentMiddleware`
8. 用户自定义 middleware
9. prompt caching
10. `MemoryMiddleware`
11. `HumanInTheLoopMiddleware`

中间件顺序是语义，不只是代码风格。例如 Skills 需要文件系统读取正文，subagent
需要继承或限制可用工具，summarization 要在上下文溢出前工作。

### 1.3 BackendProtocol

入口：

```text
libs/deepagents/deepagents/backends/protocol.py
libs/deepagents/deepagents/backends/composite.py
```

`BackendProtocol` 抽象：

- `ls_info`
- `read`
- `write`
- `edit`
- `glob_info`
- `grep_raw`
- `upload_files`
- `download_files`

`SandboxBackendProtocol` 在此基础上增加命令执行。Agent 工具只面向协议，不需要知道
文件来自本地磁盘、state、对象存储还是远端沙箱。

`CompositeBackend` 按虚拟路径前缀分发：

```text
/skills/...    -> Skill store
/memories/...  -> long-term store
/workspace/... -> sandbox
```

这正是 LambChat 能将 MongoDB Skills 和远端 session 工作区放进同一 Agent 文件视图
的基础。

### 1.4 FilesystemMiddleware

入口：

```text
libs/deepagents/deepagents/middleware/filesystem.py
```

它向模型暴露文件操作工具，并把所有实现委托给 Backend。文件不是附属功能，而是
Deep Agent 的外部工作记忆：

- 长输出可以写文件，避免全部塞进 messages；
- 子 Agent 通过文件交换结果；
- Skill 和 memory 可以按路径发现；
- 最终制品有稳定位置。

### 1.5 SkillsMiddleware

入口：

```text
libs/deepagents/deepagents/middleware/skills.py
```

核心模式：

1. 扫描 Skill 元数据；
2. 向 system prompt 注入名称、描述和路径；
3. 模型需要时通过文件工具读取 `SKILL.md`；
4. Skill 的 references/scripts 仍使用相同 Backend 访问。

这比把所有 Skill 正文拼进 prompt 更适合大规模能力库。

### 1.6 SubAgentMiddleware

入口：

```text
libs/deepagents/deepagents/middleware/subagents.py
```

SubAgent 的价值不是“多个模型看起来更智能”，而是：

- 把长子任务放进独立上下文；
- 给不同角色配置不同 system prompt 和工具；
- 主 Agent 只保留委派请求和压缩后的结果；
- 子任务可以异步并行。

风险：

- 子 Agent 继承哪些身份和凭证；
- 文件和 memory 是否共享；
- 失败如何回传；
- 并行结果如何确定性合并；
- token/成本是否能归因到父 run。

### 1.7 Memory 与 Summarization

入口：

```text
libs/deepagents/deepagents/middleware/memory.py
libs/deepagents/deepagents/middleware/summarization.py
```

两者解决不同问题：

- Summarization 压缩当前 thread 的旧消息，是上下文窗口管理；
- Memory 从 long-term store 注入跨会话信息，是持久知识管理。

“把旧对话总结一下”不能替代长期记忆；“检索长期记忆”也不能防止本次 run 的工具输出
把上下文撑爆。

### 1.8 DeltaChannel

`DeepAgentState.messages` 使用 `DeltaChannel`。普通 checkpoint 如果每步都保存完整
message list，长期运行可能出现近似 O(N²) 的累计写入。DeltaChannel 保存增量，降低
checkpoint 体积和序列化成本。

### 1.9 代码组织

```text
deepagents/
├── libs/
│   ├── deepagents/
│   │   └── deepagents/
│   │       ├── graph.py
│   │       ├── backends/
│   │       └── middleware/
│   ├── cli/
│   └── code/
└── examples/
    ├── deep_research/
    ├── deploy-coding-agent/
    ├── deploy-mcp-docs-agent/
    ├── llm-wiki/
    └── ...
```

### 1.10 适用边界

适合：

- 需要文件、规划、子 Agent 和长任务的通用 harness；
- 希望替换 backend/model/tool，但保留统一工作方式；
- 已接受 LangGraph/LangChain 生态。

不直接提供：

- 用户和组织模型；
- 任务队列与 Web SSE 产品协议；
- MCP 资产管理后台；
- sandbox provider 生命周期；
- 成本、审批和企业审计。

LambChat 的工作正是补这些外层能力。

## 2. LangGraph

> 固定源码：`langchain-ai/langgraph@49ae27c2ae983cfb92091b0dea9f7bc37a716479`

### 2.1 定位

LangGraph 是低层、状态化的 Agent/workflow runtime。它不决定产品 UI 或 Agent
应该有哪些技能，而是提供：

- 状态 schema 和 reducer；
- 图编译；
- Pregel 风格分步执行；
- checkpoint；
- interrupt/resume；
- stream；
- store；
- 子图和并发任务。

### 2.2 StateGraph

入口：

```text
libs/langgraph/langgraph/graph/state.py
```

`StateGraph` 允许开发者声明：

- 节点；
- 普通边；
- 条件边；
- state schema；
- 每个字段的 reducer；
- checkpointer/store；
- 入口和终点。

关键直觉：state 不是随便传递的 dict。字段的合并规则决定并发分支是否合法。没有
reducer 的字段被多个分支同时写入时，LangGraph 会拒绝隐式覆盖。

### 2.3 Pregel 执行模型

入口：

```text
libs/langgraph/langgraph/pregel/main.py
libs/langgraph/langgraph/pregel/_loop.py
libs/langgraph/langgraph/pregel/_runner.py
```

可以把运行理解为离散 step：

1. 读取当前 channel/state；
2. 找到本 step 可运行的 task；
3. 执行 task；
4. 收集写入；
5. reducer 合并；
6. 保存 checkpoint；
7. 调度下一 step。

这个模型使并发、重放、checkpoint 和 stream 有共同语义，而不是四套互不相干的功能。

### 2.4 Command、Send 与 interrupt

入口：

```text
libs/langgraph/langgraph/types.py
```

#### `Command`

把状态更新与控制流放在同一个返回值中，可用于：

- `update` state；
- `goto` 某节点；
- `resume` interrupt。

#### `Send`

动态 fan-out，把不同参数发送给同一节点，适合 map/reduce 和多 Agent 并行。并发结果
如何合并仍由 state reducer 决定。

#### `interrupt`

在保存可恢复状态后暂停，外部通过 `Command(resume=...)` 继续。它适合人工审批和等待
外部输入，但恢复语义需要注意：节点可能从头重跑，interrupt 之前的外部副作用必须
幂等或被拆到独立节点。

### 2.5 Checkpoint

入口：

```text
libs/checkpoint/langgraph/checkpoint/base/__init__.py
```

`BaseCheckpointSaver` 定义 checkpoint 的读写和版本语义。Checkpoint 通常按
`thread_id` 组织，保存：

- channel values；
- channel versions；
- pending writes/tasks；
- parent checkpoint 和 metadata。

Checkpoint 解决的是 graph state 的恢复，不自动解决：

- 外部 API 已产生的副作用；
- 产品消息是否已发送；
- worker 是否重复认领；
- 浏览器 UI 是否收到事件。

这些必须由上层 run/event/idempotency 设计补齐。

### 2.6 Store

入口：

```text
libs/checkpoint/langgraph/store/base/__init__.py
```

Store 与 checkpoint 不同：

- checkpoint 是一个 thread 的执行历史；
- store 是跨 thread 的命名空间数据。

DeepAgents Memory 和产品长期记忆应使用 store/业务存储，而不是把所有信息塞进
checkpoint。

### 2.7 Stream

入口：

```text
libs/langgraph/langgraph/stream/
```

主要 stream 视图包括：

- `values`：完整 state；
- `updates`：节点更新；
- `messages`：模型消息/token；
- `tasks`：任务开始和结束；
- `debug`：调试事件；
- `checkpoints`：checkpoint 事件。

产品层应先定义稳定的业务事件协议，再将 LangGraph stream 转换进去。直接把底层
debug event 暴露给前端，会把 UI 与框架版本耦合。

### 2.8 代码组织

```text
langgraph/
├── libs/
│   ├── langgraph/            # graph、Pregel、stream
│   ├── checkpoint/           # checkpoint 基础协议
│   ├── checkpoint-postgres/  # PostgreSQL 实现
│   ├── checkpoint-sqlite/    # SQLite 实现
│   ├── prebuilt/             # 常用预构建组件
│   └── sdk-py/               # SDK
├── examples/
└── docs/
```

### 2.9 对 LambChat 的实际意义

LambChat 借助 LangGraph 获得：

- Agent 内部 state；
- stream；
- checkpoint；
- subgraph；
- interrupt 等执行原语。

但 LambChat 仍必须自己实现：

- HTTP run 提交；
- queue/worker；
- session 所有权；
- event persistence；
- SSE 重连；
- Skills/MCP 管理；
- sandbox 生命周期。

LangGraph 是 durable execution 的基础，不是完整 SaaS runtime。

## 3. deepagents-backends

> 固定源码：`DiTo97/deepagents-backends@be319b5774acbb4f264403ca4c41411bbb5f026d`

### 3.1 定位

该项目为 DeepAgents `BackendProtocol` 提供远程存储适配。它不是 Agent runtime，
不负责模型循环、任务队列或 UI。

### 3.2 支持后端

当前源码集中在：

```text
src/deepagents_backends/
```

包含：

- S3/MinIO；
- PostgreSQL；
- Azure Blob；
- Google Cloud Storage；
- MongoDB；
- Redis/Valkey。

这些实现把远程对象或记录映射为 DeepAgents 可使用的文件语义。

### 3.3 核心设计

每个 backend 需要将不同存储原语适配为：

- 路径规范化；
- 文件/目录列举；
- read/write/edit；
- glob/grep；
- 上传下载；
- 错误映射。

难点不在 CRUD 本身，而在一致的文件系统语义：

- object store 没有真实目录；
- Redis key 不是文件；
- 数据库事务与对象存储覆盖语义不同；
- grep 可能需要拉取大量内容；
- rename/edit 未必是原子操作。

### 3.4 代码组织

```text
deepagents-backends/
├── src/deepagents_backends/  # 适配实现与导出
├── tests/
│   ├── unit/
│   ├── integration/
│   └── common/
├── benchmark/                # 后端性能结果和展示
├── examples/
├── docs/
└── wiki/
```

### 3.5 适用边界

适合：

- 让 Skills、记忆或工作文件跨进程持久化；
- 将 DeepAgents 部署到无本地持久磁盘的环境；
- 通过 `CompositeBackend` 把不同路径路由到不同存储。

不应误用为：

- graph checkpointer；
- 事务数据库抽象；
- 安全 sandbox；
- tenant authorization 层。

Backend 可以按 tenant 构造或使用 tenant 前缀，但协议本身不会自动保证租户隔离。

## 4. 三者如何组合

```text
DeepAgents
  asks: What capabilities and work habits does the agent have?
        |
        | uses
        v
LangGraph
  asks: How is state scheduled, streamed, checkpointed, and resumed?
        |
        | plus
        v
deepagents-backends
  asks: Where do virtual files live?
```

组合后的空白仍包括：

- 用户/组织和授权；
- 长任务 queue；
- event log/SSE；
- credential brokerage；
- sandbox lifecycle；
- 成本、审批和审计。

这解释了为什么 LambChat 即使大量复用三者，仍然拥有可观的 `api/infra/frontend`
代码：平台化问题位于基础运行时之外。

## 5. 基础层关键思考点

1. DeepAgents middleware 的顺序应被当作公共 API 还是内部实现？
2. CompositeBackend 的路径路由能否同时承担权限路由，还是必须在更上层授权？
3. graph checkpoint 与产品 event log 如何建立稳定的一一或多对一关系？
4. interrupt 节点重跑时，MCP/外部 API 副作用怎样实现幂等？
5. 远程 backend 的 grep/edit 语义是否会在大规模 Skill 库上成为性能瓶颈？
