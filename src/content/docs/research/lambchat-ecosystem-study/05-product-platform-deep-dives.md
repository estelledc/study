---
title: "产品平台项目深挖"
sidebar:
  hidden: true
---
# 产品平台项目深挖

本篇比较五种产品化路径。重点不是功能数量，而是每个项目把“产品状态、Agent 状态、
工具能力和治理”放在哪一层。

## 1. OpsinTech Platform

> 固定源码：`OpsinTech/opsintech-platform@5474b29d40bcf68962564f1d8f7b3f16e0f3660a`

### 1.1 定位

OpsinTech 是企业 Agent 平台，提供多租户、RBAC、模型/MCP/Skills/Tools 管理和
沙箱执行。它与 LambChat 最接近，但不是从零实现 Agent runtime，而是复用 DeerFlow
harness，并在外面加治理和产品控制面。

### 1.2 架构边界

仓库内架构文档和源码体现两层：

```text
Platform Gateway / Admin plane
  -> identity, tenant, RBAC, models, MCP, skills, tools

DeerFlow harness/runtime
  -> lead agent, middleware, sandbox, graph execution
```

关键入口：

```text
backend/docs/ARCHITECTURE.md
backend/app/gateway/auth.py
backend/app/agent/terminal_graph.py
backend/packages/harness/deerflow/agents/lead_agent/agent.py
```

### 1.3 核心运行链

1. Gateway 验证身份并形成平台上下文；
2. 读取 tenant/user 对应的 Agent、模型和能力配置；
3. 进入 terminal graph 或 DeerFlow lead agent；
4. harness 使用 middleware 组装工具、Skills、Memory、Sandbox 等；
5. 事件和状态回到平台 API/前端。

与 LambChat 的差异：

- LambChat 更明确地用 `TaskManager/TaskExecutor/Presenter` 表达 run 和事件；
- OpsinTech 更强调“平台治理层复用 DeerFlow 运行时”的边界；
- DeerFlow 的 lead agent/middleware 是核心资产，LambChat 的核心 harness 是 DeepAgents。

### 1.4 核心功能

- 用户、租户与角色；
- 模型、MCP server、Skills、Tools 管理；
- Agent 运行与终端式交互；
- 沙箱执行；
- Docker/PostgreSQL 等生产部署；
- 管理前端。

### 1.5 代码组织

```text
opsintech-platform/
├── backend/
│   ├── app/          # 平台 API、gateway、agent
│   ├── packages/     # DeerFlow harness 等内嵌包
│   ├── alembic/      # 数据迁移
│   ├── projects/     # 项目域
│   └── tests/
├── frontend/src/     # 管理与 Agent UI
├── skills/public/    # 公共 Skills
├── docker/           # nginx、postgres、provisioner
└── scripts/
```

### 1.6 参考价值与风险

参考价值：

- 观察“业务控制面”和“Agent harness”怎样解耦；
- 复用成熟 runtime 而不是复制其源码；
- tenant/RBAC 怎样进入工具与模型配置。

风险：

- 平台与 vendored/内嵌 DeerFlow 的版本同步；
- Gateway 与 runtime 两边都可能拥有状态和鉴权逻辑；
- 架构文档中的目标能力仍需逐项和当前代码核对。

## 2. DeepAgentForce

> 固定源码：`TW-NLP/DeepAgentForce@0acbbb25044141582f0375f0047940e4a81f8c74`

### 2.1 定位

DeepAgentForce 是较紧凑的多租户 Agent 平台参考，重点包括 Skills/MCP 的分级披露、
RAG、sandbox 和会话式 Agent。相比 LambChat、Dify，它更容易在一轮精读中理解全貌。

关键入口：

```text
src/services/conversational_agent.py
src/services/skill_disclosure.py
src/services/tool_disclosure.py
src/services/mcp_integration.py
src/services/sandbox/
```

### 2.2 主要设计

#### Skills 分级披露

系统先展示轻量 Skill 元数据，再按任务需要加载完整内容，减少 prompt 占用。

#### Tool/MCP 分级披露

不是把所有 MCP tool schema 一次性交给模型，而是先发现、筛选，再暴露当前相关工具。
这与 LambChat 的角色过滤和 DeepAgents Skills middleware 方向一致。

#### Conversational Agent

`conversational_agent.py` 汇总模型、会话、Skill、Tool、RAG 和 sandbox 能力，是理解
项目运行主链的首要入口。

#### Hi-RAG

项目将检索作为 Agent 的可组合能力，而不只是聊天前固定做一次向量检索。

### 2.3 代码组织

```text
DeepAgentForce/
├── src/
│   ├── api/          # HTTP API
│   ├── services/     # Agent、Skills、Tools、MCP、sandbox
│   ├── workflow/     # 工作流/编排
│   ├── database/     # 持久化
│   ├── models/       # 数据模型
│   └── utils/
├── static/           # Web 静态资源
├── config/
├── packaging/
└── scripts/
```

### 2.4 与 LambChat 对比

优势：

- 规模较小，Skills/MCP/RAG 主链集中；
- 渐进披露设计明确；
- 适合快速验证产品想法。

相对不足：

- LambChat 的任务生命周期、事件双写、断线重连和多端 UI 更完整；
- 分布式 queue/checkpoint/恢复能力需要进一步部署验证；
- 单体集中带来理解便利，也可能让能力边界随功能增长而耦合。

## 3. Dify

> 固定源码：`langgenius/dify@48e536ba391494052d24d238d92c79056fbec349`

### 3.1 定位

Dify 是成熟的 AI 应用开发平台。其核心心智模型不是“一个自主 Agent 带着工具工作”，
而是“用户在可视化画布上定义 workflow，Agent 是一种可插入节点”。

### 3.2 Workflow-first 架构

关键入口：

```text
api/core/workflow/workflow_entry.py
api/core/workflow/nodes/
api/core/workflow/nodes/agent/
api/core/agent/cot_agent_runner.py
api/core/agent/fc_agent_runner.py
api/core/mcp/
```

运行链：

1. 应用选择一个发布的 workflow 版本；
2. `WorkflowEntry` 建立执行上下文；
3. graph engine 按节点和边推进；
4. Agent 节点内部再选择 function-calling 或 chain-of-thought runner；
5. 节点事件、变量和输出进入 workflow run；
6. 前端展示节点级状态和最终结果。

### 3.3 Agent 是节点，不是整个平台

Agent 节点可以：

- 调用模型；
- 选择工具；
- 多轮推理；
- 产生节点输出。

但它仍受 workflow 输入输出和边界约束。这带来：

- 可视化、可预测、易调试；
- 确定性业务流程易落地；
- 自主长任务需要在节点内部或专用 runtime 中实现，灵活性低于 DeepAgents harness。

### 3.4 MCP 与工具

`api/core/mcp/` 负责 MCP 相关能力，但 Dify 的工具体系还包含 provider、插件和内置
工具。平台要解决的不是单个 MCP client，而是：

- 工具注册和版本；
- 租户配置；
- credential；
- workflow 节点选择；
- 运行时输入输出映射。

### 3.5 代码组织

```text
dify/
├── api/             # Python 后端、workflow、agent、MCP、models
├── web/             # 前端
├── dify-agent/      # Agent 相关组件
├── dify-agent-runtime/
├── packages/        # 共享包
├── docker/          # 完整部署
├── sdks/
├── e2e/
└── docs/
```

### 3.6 与 LambChat 对比

| 维度 | LambChat | Dify |
|---|---|---|
| 核心抽象 | Deep Agent session/run | 可视化 workflow/app |
| Agent | 产品主角 | 一种 workflow node |
| 控制流 | 模型驱动为主 | 图定义驱动为主 |
| 文件/沙箱 | DeepAgents workspace 核心 | 按节点/runtime 能力接入 |
| 适合 | 开放式长任务 | 可重复业务流程 |
| 主要治理 | 用户、角色、MCP、配额 | workspace/app/plugin/workflow 体系 |

## 4. LibreChat

> 固定源码：`danny-avila/LibreChat@20cd00c492a84cbc240a208eef4eaa8ba54a694a`

### 4.1 定位

LibreChat 从多模型聊天产品演化出 Agent、MCP、Skills、Artifacts 和 HITL。它的根
心智模型仍是 conversation，而不是工作流或独立 runtime substrate。

关键入口：

```text
api/server/controllers/agents/
packages/api/src/agents/
packages/api/src/mcp/
packages/api/src/skills/
packages/api/src/stream/
packages/data-provider/src/config.ts
```

### 4.2 运行与 stream

控制器接收会话请求，Agent 层组装模型、工具、MCP 和 Skills，stream 包负责把增量
事件传回客户端。可恢复 stream 和 HITL 使工具确认不必局限在一次同步 HTTP 调用内。

相比 LambChat：

- LibreChat 的 conversation、多 provider 和预设/共享 Agent 产品面更成熟；
- LambChat 的后台 TaskManager、Presenter 和 sandbox-first Deep Agent 路径更突出；
- 两者都需要将底层模型/tool 事件归约成稳定前端状态。

### 4.3 Agent、MCP 与 Skills

Agent 可以成为可保存、复用和共享的产品对象。MCP 与 Skills 不只是开发者配置，还需
进入：

- Agent 能力定义；
- 用户可见范围；
- 会话运行；
- 权限和确认；
- 前端配置体验。

### 4.4 代码组织

```text
LibreChat/
├── api/
│   ├── server/controllers/agents/
│   ├── models/
│   └── strategies/
├── packages/
│   ├── api/src/{agents,mcp,skills,stream}/
│   └── data-provider/
├── client/src/      # React 前端
├── config/          # 配置和翻译
├── skill/           # Skill 资产
├── e2e/
├── helm/
└── otel/
```

### 4.5 参考价值

- conversation-first 产品如何逐步吸收 Agent 能力；
- 多模型 provider 兼容；
- 可共享 Agent 和用户配置；
- resumable stream、HITL 与消息 UI；
- OTel/Helm 等生产交付。

## 5. OpenClaw

> 固定源码：`openclaw/openclaw@44314c94514d618366d3627e0c4a70ac4bfea241`

### 5.1 定位

OpenClaw 是本地优先的个人 AI assistant/runtime，核心是一个 Gateway 连接多种消息
渠道、设备节点和本地能力。它明确不是以企业多租户 SaaS 为第一目标。

关键入口：

```text
packages/agent-core/src/agent-loop.ts
src/agents/embedded-agent-runner/
src/gateway/
src/skills/
src/memory/
apps/
extensions/
```

### 5.2 Gateway-first

Gateway 负责：

- 接入不同 channel；
- 路由消息到 Agent/session；
- 管理设备或节点能力；
- 暴露本地服务和控制入口；
- 协调 embedded agent runner。

这与 LambChat 的 Web API-first 不同：

- LambChat 从多用户 Web 产品出发；
- OpenClaw 从“一个用户的长期在线本地 assistant”出发。

### 5.3 Agent loop 与 embedded runner

`packages/agent-core/src/agent-loop.ts` 表达基础模型/工具循环；
`src/agents/embedded-agent-runner/` 将其嵌入 Gateway 生命周期。上层还叠加：

- Skills；
- Memory；
- channel context；
- device/node tools；
- extension/plugin。

### 5.4 Skills 与 Memory

Skills 以文件化、按需加载的方式扩展工作能力。Memory 为长期个人 assistant 提供跨
渠道连续性。与企业平台相比，其默认信任模型更接近“用户信任自己的 Gateway 和本地
环境”。

### 5.5 代码组织

```text
openclaw/
├── packages/agent-core/  # 基础 Agent loop
├── src/
│   ├── agents/           # embedded runner 等
│   ├── gateway/          # 长驻 Gateway
│   ├── skills/
│   └── memory/
├── apps/                 # Android/iOS/macOS/Linux 等
├── extensions/           # 渠道和能力扩展
├── skills/               # Skill 资产
├── ui/
├── deploy/
├── docs/
└── test/
```

### 5.6 对多租户项目的启发

OpenClaw 本身不应被直接称为企业多租户平台，但它成为 Lobu/Preloop 的重要对象：

- Lobu 将 OpenClaw Worker 包进 per-session 隔离和统一 Gateway；
- Preloop 通过 runtime plugin 接管其 MCP、模型流量、审批与 Agent Control。

这说明成熟生态中不一定重写 Agent。另一条路线是把单用户 runtime 作为 Worker，
在外面增加 identity、credential、policy 和 isolation。

## 6. 五个平台的根抽象

| 项目 | 根抽象 | 运行状态主要归属 | 最强参考点 |
|---|---|---|---|
| OpsinTech | tenant-governed agent | 平台 + DeerFlow runtime | 控制面复用 harness |
| DeepAgentForce | conversational deep agent | 单体服务 | 渐进披露与紧凑实现 |
| Dify | app/workflow run | workflow engine | 可视化确定性流程 |
| LibreChat | conversation/agent | 会话 + stream | 多模型会话产品 |
| OpenClaw | gateway/session/channel | 本地 Gateway | 渠道、设备、个人 runtime |

## 7. 选择建议

- 业务步骤可枚举、需要审计和运营配置：优先学习 Dify；
- 产品首先是多模型聊天和共享 Agent：优先学习 LibreChat；
- 需要 Deep Agent 自主工作且要多用户治理：对照 LambChat 与 OpsinTech；
- 想快速理解 Skills/MCP 分级披露：读 DeepAgentForce；
- 需要本地长期 assistant、渠道和设备：读 OpenClaw；
- 想把 OpenClaw 交付给多个不互信用户：继续读 Lobu 和 Preloop。
