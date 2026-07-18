---
title: "横向对比与参考架构"
sidebar:
  hidden: true
---
# 横向对比与参考架构

## 1. 比较方法

不能用“功能打勾数”直接给 Agent 平台排名。不同项目的根抽象不同：

- LangGraph 是执行原语；
- DeepAgents 是 harness；
- LambChat/Dify/LibreChat 是产品；
- MCP Gateway Registry/Preloop 是治理控制面；
- Lobu/Loomcycle 是交付或运行时底座。

本篇使用统一问题比较：

1. 谁拥有 run 状态？
2. 是否支持断线/重启后的恢复？
3. tenant identity 是否进入底层数据坐标？
4. 工具和 Skills 如何发现、过滤和授权？
5. 凭证在哪个进程解密和注入？
6. 代码执行怎样隔离？
7. 人工审批、审计和成本是否是一等对象？

## 2. 14 项目能力矩阵

符号：

- `强`：当前架构的核心能力，源码入口明确；
- `有`：存在实现，但不是项目最强主线；
- `基础`：有基本能力，仍需上层补齐；
- `不适用`：该项目层次不负责此能力。

| 项目 | 根抽象 | Durable state | Skills/MCP | 多租户治理 | Sandbox/隔离 | 审批/成本 |
|---|---|---|---|---|---|---|
| LambChat | session/run | 强 | 强 | 有，偏 user/RBAC | 有，user sandbox | 基础 |
| DeepAgents | harness | 依赖 LangGraph | 强 | 不适用 | backend 协议 | HITL 基础 |
| LangGraph | state graph | 强 | 不适用 | 不适用 | 不适用 | interrupt 基础 |
| deepagents-backends | virtual files | 不适用 | Skill 文件支撑 | 需调用方保证 | 不是 sandbox | 不适用 |
| OpsinTech | governed agent | 有 | 强 | 强调 tenant/RBAC | 有 | 有 |
| DeepAgentForce | conversational agent | 基础 | 强 | 有 | 有 | 基础 |
| Dify | workflow/app run | 强 | 有 | 强，workspace/app | 节点/runtime | 有 |
| LibreChat | conversation/agent | 有 | 强 | secure multi-user | code interpreter 等 | HITL/观测 |
| OpenClaw | local gateway | 有 | 强 | 非企业主线 | 本地/设备边界 | 基础 |
| project-agi | pack/runtime | 基础 | MCP/tools | Pack 级 | adapter 级 | AI Trail |
| MCP Gateway Registry | AI asset | registry 持久化 | 强 | 当前单租户 | 不执行代码 | 审计强 |
| Preloop | policy/runtime subject | 强化 session/worker | 强 | account/subject | 治理外部 runtime | 强 |
| Lobu | session Worker | Worker/PVC | 复用 OpenClaw | 强执行隔离 | 强 | 基础 |
| Loomcycle | runtime/run | 强 | 强 | 强，tenant-aware | runtime/tool policy | 成本/观测有 |

矩阵不能表达所有细节，但能看出：LambChat 是少数同时覆盖产品、harness、能力平面和
后台任务的样本；其相对缺口集中在独立治理控制面、组织级 tenant、凭证出口代理和
强 session 隔离。

## 3. 关键维度对比

### 3.1 Run 与连接

| 模式 | 代表 | 特征 |
|---|---|---|
| HTTP 内直接流式 | 小型 demo | 连接断开与任务生命周期耦合 |
| 提交 run，再订阅事件 | LambChat | `session_id + run_id`，后台任务独立 |
| workflow execution | Dify、Preloop | 图/flow 是可认领的持久实例 |
| runtime substrate | Loomcycle | 所有协议共享同一 run manager |

最佳实践：

- run 必须有稳定 ID 和终态；
- event stream 只是 run 的视图；
- 断线不能天然等于 cancel；
- cancel/pause/resume 必须进入 runtime 状态；
- worker claim 和外部副作用需要幂等。

### 3.2 状态分层

推荐将状态分为：

```text
graph checkpoint   节点执行和短期消息
run event log      可回放的产品事件
session model      所有权、标题、多次 run
long-term store    memory、skills、knowledge
artifact store     文件和结果制品
```

LambChat 已显式覆盖这些层，但跨层终态一致性仍是测试重点。LangGraph 只保证第一层，
DeepAgents backend 主要服务第四/第五层。

### 3.3 多租户强度阶梯

```text
L0: UI hides resources
L1: API ownership checks
L2: every query carries tenant/user predicate
L3: storage keys and registries include tenant
L4: credentials, network, process and volume are isolated
L5: tenant budgets, audit retention, admin delegation and export
```

- LambChat 主要处在 L1-L3 的用户级组合，沙箱在用户级提供部分 L4；
- Loomcycle 强调 tenant-aware store/registry/credential；
- Lobu 强调 Worker、volume、network 和 credential 的 L4；
- Preloop 补 policy、budget、account/session attribution；
- MCP Gateway Registry 当前明确是单租户部署，不能因 RBAC 丰富就提升到多租户 SaaS。

### 3.4 凭证模式

#### 模式 A：应用内加密

代表：LambChat。

```text
database(ciphertext) -> app decrypts -> MCP client uses
```

优点是实现直接、用户配置简单；风险是 Agent 应用进程同时拥有用户输入、工具数据和
解密能力。

#### 模式 B：Gateway 出口注入

代表：MCP Gateway Registry、Lobu、Preloop。

```text
worker sends scoped request
  -> gateway validates identity/policy
  -> gateway injects upstream secret
  -> secret never enters worker
```

优点是被攻陷的 Worker 难以读取全局 secret；代价是 Gateway 成为关键数据面和
高价值目标。

#### 模式 C：运行时延迟解析

代表：Loomcycle。

```text
run identity(tenant,user,agent)
  -> resolve scope precedence
  -> inject only for this call/child
```

优点是同一 runtime 可服务多租户并支持 BYOK；代价是每个 transport/tool 都必须携带
authoritative identity。

### 3.5 Skills 与工具披露

演进路径：

```text
all schemas in prompt
  -> role/agent allowlist
  -> metadata only
  -> search/on-demand disclosure
  -> policy check at call time
  -> credential injection at egress
```

DeepAgents/LambChat 在 Skills 按需读取上成熟；DeepAgentForce 强调 Skills/Tools 分级披露；
Preloop/MCP Gateway Registry 更强调调用时治理。

### 3.6 Sandbox

| 隔离单位 | 代表 | 适用场景 |
|---|---|---|
| 当前进程/本地目录 | 小型 Agent | 可信开发环境 |
| user sandbox + session dir | LambChat | 成本与隔离平衡 |
| per-session Worker/volume | Lobu | 不互信用户、高风险代码 |
| 独立 runtime substrate | Loomcycle | 多产品共享执行底座 |

隔离单位越细，成本、冷启动和运维越高。不能脱离威胁模型盲目选择最重方案。

## 4. LambChat 的强项

### 4.1 端到端链路完整

从 API 提交、后台执行、graph、Skills/MCP/Memory/Sandbox 到 SSE/UI 都有明确源码。
很多项目只覆盖其中一层。

### 4.2 Event sourcing 思路接近产品需求

Presenter 同时服务持久历史与实时流，前端统一归约历史和实时事件。这比把模型 token
直接转发给浏览器更可靠。

### 4.3 复用边界合理

- DeepAgents 提供 harness；
- LangGraph 提供状态运行时；
- LambChat 聚焦产品和基础设施；
- Backend 将产品存储与 Agent 文件语义解耦。

### 4.4 能力平面丰富

Skills marketplace、MCP 管理、Memory、sandbox、subagent 和文件制品形成完整工作面，
不是只增加几个 tool。

## 5. LambChat 的主要缺口与风险

### 5.1 组织级 tenant 模型不够显式

用户所有权和 RBAC 已存在，但组织/workspace 根模型、tenant 级预算、管理员委派、
数据导出和审计保留需要进一步验证。

### 5.2 凭证仍靠应用进程

Fernet 解决 at-rest 加密，不等于 Worker/Agent 无法接触解密后的 secret。高风险部署可
考虑独立 egress credential gateway。

### 5.3 user sandbox 的隔离粒度

一个用户共享 sandbox、session 用子目录，成本较低，但无法达到 per-session Pod/PVC
的强隔离。需要根据用户是否互信、代码风险和数据敏感度选择。

### 5.4 多套状态的一致性

run 状态、graph checkpoint、消息、event log、Redis queue 和 sandbox 文件可能在故障
时处于不同进度。必须通过 fault injection 验证，而不是只做 happy-path 单元测试。

### 5.5 双层 graph 的可观测性

需要在 trace 中同时表达：

- 外层 Agent run；
- 内层 DeepAgents graph；
- 子 Agent；
- model call；
- tool/MCP call。

否则排障时很难知道失败发生在哪一层。

### 5.6 自动 Memory 的治理

自动捕获和压缩有工程完整性，但仍需来源、纠错、删除、敏感信息和过期策略。

## 6. 可组合参考架构

下面不是建议立即重写，而是从 14 个项目抽出的目标边界。

```text
┌──────────────── Product Plane ────────────────┐
│ Web/Desktop/Mobile, chat, artifacts, admin    │
│ LambChat / LibreChat patterns                 │
└──────────────────────┬────────────────────────┘
                       │ submit run / replay events
┌──────────────── Run Control Plane ────────────┐
│ identity, session, queue, lease, event log,    │
│ cancel/pause/resume, budget preflight          │
│ LambChat + Preloop + Loomcycle patterns        │
└──────────────────────┬────────────────────────┘
                       │ authoritative run context
┌──────────────── Agent Harness ────────────────┐
│ model, todo, skills, filesystem, subagents,    │
│ summarization, memory, HITL                    │
│ DeepAgents + LangGraph                         │
└──────────────────────┬────────────────────────┘
                       │ tool intent
┌──────────────── Governance Gateway ───────────┐
│ asset registry, policy, approval, quota, audit,│
│ credential injection, model/tool cost          │
│ MCP Gateway Registry + Preloop                 │
└──────────────────────┬────────────────────────┘
                       │ scoped action
┌──────────────── Execution Plane ──────────────┐
│ sandbox workers, filesystem, network policy,   │
│ per-session isolation where required           │
│ LambChat providers + Lobu/Loomcycle patterns   │
└────────────────────────────────────────────────┘
```

### 6.1 RunContext

所有层共享、不可由客户端随意覆盖的最小上下文：

```text
tenant_id
user_id
agent_id
session_id
run_id
trace_id
credential_subject
policy_version
budget_scope
```

每个 transport 都必须从可信 token/route 恢复它，而不是接受普通 header 直接声明。

### 6.2 核心不变量

1. 客户端断线不改变 run 状态；
2. 一个 run 同一时间只有一个有效 owner/lease；
3. event 先持久化或具备可证明的补偿，再向外投影；
4. tool execution 前再次检查 policy，不能只在工具列表阶段过滤；
5. provider/MCP 全局 secret 不进入模型上下文；
6. tenant ID 进入存储键、缓存键和动态 registry key；
7. external side effect 有 idempotency key；
8. pause/resume/cancel 对所有协议入口语义一致；
9. unknown cost 显式标记，不能静默记零；
10. 自动 Memory 与用户显式 Memory 使用不同来源和删除策略。

### 6.3 事件协议建议

稳定产品事件不要直接等于框架内部 event。最小字段：

```json
{
  "event_id": "stable-id",
  "tenant_id": "tenant",
  "session_id": "session",
  "run_id": "run",
  "sequence": 42,
  "type": "tool.started",
  "timestamp": "RFC3339",
  "producer": "agent-runtime",
  "payload": {},
  "schema_version": 1
}
```

前端 reducer 按 `run_id + sequence/event_id` 幂等处理；历史和实时流使用同一协议。

## 7. 演进优先级

如果基于 LambChat 继续建设，建议按真实风险而不是功能吸引力排序：

### P0：先证明正确

- run/event/checkpoint 故障注入；
- SSE 重连去重和顺序；
- 生产 checkpointer 健康检查；
- sandbox path/network/cleanup 测试；
- MCP secret 日志泄漏检查。

### P1：强化治理

- 组织/workspace 根模型；
- tenant-aware cache/store key 审计；
- tool call-time policy；
- cost attribution；
- durable approval/command 状态机。

### P2：按威胁模型强化隔离

- 高风险任务切 per-session Worker；
- Gateway egress 和 credential injection；
- network allowlist/private-IP 防护；
- scoped/short-lived runtime token。

### P3：再做平台扩展

- 多协议 runtime；
- 外部 Agent plugin；
- Agent/Skill registry federation；
- 更复杂的自动 Memory 和优化。

## 8. 最终判断

LambChat 已经越过“Agent demo”阶段，真正困难的产品化模块大多存在。它当前最有学习
价值的部分是 run/event/capability 的整合，而不是底层 loop。

若目标是个人或可信团队自托管，当前用户级边界可能足够；若目标是多个不互信组织、
高风险代码执行或受监管环境，下一阶段不应继续堆 UI 功能，而应优先补 tenant 根模型、
Gateway 凭证隔离、session 级执行隔离、成本与故障恢复证据。
