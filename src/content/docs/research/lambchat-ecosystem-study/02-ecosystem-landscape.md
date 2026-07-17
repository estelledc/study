---
title: "生产级 Agent 平台生态全景"
sidebar:
  hidden: true
---
# 生产级 Agent 平台生态全景

## 1. 先建立直觉

一个 Agent demo 像“让模型坐在一张桌子前，可以看问题、调用几个工具、给出答案”。
生产级 Agent 平台则像“给很多员工提供工位、门禁、工具柜、操作日志、预算和事故恢复”。

两者都可能使用同一个 ReAct loop，但后者还必须回答：

- 谁发起了这次运行？
- 它能看到哪些工具和数据？
- 工具凭证放在哪里，模型能否读到？
- 运行中断或服务重启后怎样继续？
- 前端断线后怎样重建真实状态？
- 高风险动作由谁批准？
- 这次运行花了多少钱，出了问题如何审计？

LambChat 和本轮样本共同说明：今天的主要工程难点已经从“模型会不会调用工具”
移动到“运行能否被可靠、隔离、可观测地交付”。

## 2. 八层技术栈

### 2.1 产品界面层

负责把运行时状态变成人能理解和操作的产品：

- 会话、消息、模型和 Agent 选择；
- Skills/MCP/Agent 配置；
- 工具调用、待办、审批和中断；
- 文件、代码、图片、网页和其他制品预览；
- 管理后台、用户角色、配额和审计。

代表：LambChat、LibreChat、Dify、OpsinTech。

关键取舍：

- **Conversation-first**：先有会话，再向会话挂 Agent 和工具，交互自然；
- **Workflow-first**：先定义图，再运行实例，行为可预测；
- **Gateway/channel-first**：先接消息渠道和设备，Agent 在后台持续存在。

### 2.2 API 与任务生命周期层

HTTP 请求的生命通常只有几十秒，Agent 任务可能运行数分钟甚至更久。平台需要把
“提交任务”和“消费事件”分开：

```text
POST request
  -> validate identity and config
  -> create run
  -> enqueue or spawn worker
  -> return session_id/run_id

worker
  -> execute agent
  -> persist events
  -> publish live events

client
  -> reconnect by run_id
  -> replay persisted history
  -> continue live stream
```

LambChat 使用 `TaskManager + TaskExecutor + Presenter`；Preloop 使用
NATS/JetStream 和带 lease 的 worker；Loomcycle 将 run 状态纳入 runtime substrate。

核心问题不是“有没有 SSE”，而是：

- SSE 断开是否影响真实任务；
- 事件是否持久化；
- worker 重启后由谁认领；
- 相同 run 是否会重复执行；
- 客户端如何区分旧 run 与新 run。

### 2.3 Agent harness 层

Harness 是模型与工具之外的“工作方法”：

- todo/planning；
- 虚拟文件系统；
- Skills 渐进披露；
- 子 Agent 委派；
- 上下文总结与压缩；
- memory 注入；
- 人在环路；
- tool call 修补和重试。

DeepAgents 的关键贡献是把这些能力实现为有顺序的 middleware，而不是把所有逻辑写进
一个超大 loop。LambChat 在内层直接创建 DeepAgents graph。

### 2.4 状态与持久执行层

这一层回答“运行是什么”和“中断后如何继续”：

- state schema 和 reducer；
- 节点/step 调度；
- checkpoint；
- stream mode；
- interrupt/resume；
- 子图与并发任务；
- time travel 或状态查询。

LangGraph 是本轮最典型的低层实现。它不提供完整产品，但定义了 DeepAgents 和
LambChat 依赖的执行语义。

必须区分三类状态：

| 状态 | 生命周期 | 例子 |
|---|---|---|
| graph state/checkpoint | 一次 thread/run 内 | messages、todo、节点进度 |
| session/product state | 多次请求或多个 run | 会话标题、所有权、历史 |
| long-term store | 跨 session | 用户记忆、Skills、知识库 |

把三者混成一个数据库或一个 state dict，恢复和权限边界都会变得模糊。

### 2.5 能力平面

#### Tools

模型可直接调用的结构化动作。schema 常驻上下文会消耗 token，因此大型平台需要
按角色、Agent、任务或检索结果过滤。

#### Skills

Skills 更接近可读的工作说明和配套资源。常见优化是只注入名称、描述和路径，需要时
再读取 `SKILL.md`。DeepAgents、LambChat、OpenClaw、LibreChat 都体现了这种渐进披露。

#### MCP

MCP 标准化工具、资源和 prompt 的发现与调用，但平台仍要补：

- 用户/租户身份映射；
- server 和 tool 级授权；
- upstream credential 注入；
- quota、超时和重试；
- 审计、审批和风险策略；
- server/skill 的供应链信任。

#### Memory/RAG

RAG 回答“当前任务需要哪些外部事实”；Memory 回答“这个用户或 Agent 过去有哪些
值得保留的信息”。两者都需要 ingestion、索引、检索和删除，但来源、权限和生命周期
不同。

### 2.6 执行隔离层

工具调用和模型生成的代码默认不可信。隔离可以分为：

1. 进程/容器级；
2. 独立 Worker 或 per-session Pod；
3. gVisor/Kata/Firecracker 等更强 runtime；
4. 文件系统、网络和凭证的额外隔离。

仅“在 Docker 里运行”不等于完整安全：

- Worker 能否直连互联网；
- 是否能读宿主或其他 session 的 volume；
- provider/MCP 凭证是否作为环境变量长期存在；
- tenant 是否进入存储主键；
- Gateway 是否是唯一 egress；
- 资源限制和清理策略是否存在。

LambChat 的默认边界是用户绑定沙箱、session 使用独立工作目录；Lobu 则把隔离提升为
per-session Worker/PVC 和 Gateway 唯一出口。

### 2.7 治理控制面

控制面决定“谁能用什么，以什么条件使用”：

- identity/JWT/OIDC；
- RBAC/ABAC；
- MCP/Agent/Skill 资产注册；
- allow/deny/require-approval policy；
- 配额、预算和模型 allowlist；
- 凭证托管与注入；
- 审计和成本归因。

MCP Gateway Registry 展示 registry/auth/gateway 的平面拆分；Preloop 展示如何将
MCP 工具、模型流量、审批、预算和外部 Agent Control 统一到治理层。

### 2.8 持久化与可观测层

不同数据需要不同存储语义：

| 数据 | 常见存储 | 原因 |
|---|---|---|
| 用户、Agent、Skills、配置 | PostgreSQL/MongoDB | 查询、权限、事务或灵活文档 |
| 队列、锁、在线流 | Redis/NATS | 低延迟、TTL、pub/sub |
| checkpoint | PostgreSQL/MongoDB/SQLite | 有序版本、恢复 |
| 文件和制品 | S3/Blob/GCS | 大对象、生命周期 |
| trace/metric/log | OTel backend | 跨服务关联 |

“保存聊天消息”不等于可观测。生产系统还需关联 `user_id`、`tenant_id`、`session_id`、
`run_id`、`trace_id`、tool call、model usage 和最终 outcome。

## 3. 六条主要产品路线

| 路线 | 代表 | 优势 | 主要代价 |
|---|---|---|---|
| Deep Agent 产品化 | LambChat、OpsinTech、DeepAgentForce | 自主性强，Skills/子 Agent/沙箱自然 | 行为更动态，治理和恢复复杂 |
| Workflow-first | Dify | 可视化、确定性、易审计 | 长任务自主探索不如 harness 灵活 |
| Conversation-first | LibreChat | 用户心智简单，多模型切换成熟 | 工作流和组织级治理不是唯一中心 |
| Local gateway/channel-first | OpenClaw | 本地优先、渠道与设备接入强 | 原生定位不是企业多租户 |
| Governance overlay | MCP Gateway Registry、Preloop | 可横向治理不同 Agent | 自己不一定拥有完整 Agent loop |
| Runtime substrate | Lobu、Loomcycle | 隔离、协议、恢复、tenant 边界明确 | 需要上层产品提供用户体验 |

这些路线不是互斥的。一个成熟系统可能采用：

- LibreChat/LambChat 式产品界面；
- DeepAgents 式 harness；
- LangGraph 式持久执行；
- Preloop 式治理覆盖层；
- Lobu/Loomcycle 式隔离底座。

## 4. 2026 年生态发展现状

以下是从 14 个固定快照和候选搜索中归纳的研究判断。

### 4.1 从 loop 竞争转向 runtime 竞争

基础 ReAct loop 已经商品化。差异越来越集中在：

- durable execution；
- session/run 生命周期；
- sandbox；
- credential isolation；
- multi-tenant state；
- observability 和 cost。

### 4.2 Skills 与 MCP 走向渐进披露

把数百个工具 schema 和完整技能正文一次性放入上下文会带来成本与选择噪声。越来越多
项目采用：

- 元数据常驻；
- 按需搜索；
- 只向当前 Agent 暴露允许的子集；
- 调用时再解析凭证和具体实现。

### 4.3 控制面与数据面分离

Registry 负责发现、授权和配置，Gateway/Worker 负责真实数据流。分离带来独立扩缩容
和更清楚的信任边界，但需要解决配置下发、缓存一致性和 fail-open/fail-closed 策略。

### 4.4 凭证成为一等架构对象

“给 Agent 一个 API key”正在被以下模式替代：

- secrets 只保存在 Gateway；
- Worker 使用短期或范围受限 token；
- 按 tenant/user/agent 运行时解析；
- upstream header 在出口注入；
- 模型上下文和工具输出永远不接触全局凭证。

### 4.5 Human approval 从 UI 功能变成 policy action

简单 HITL 是“弹窗问用户”。治理型系统则把它建模为：

- deny；
- allow；
- require approval；
- 条件表达式；
- 审批 workflow；
- 可恢复的命令和状态机。

### 4.6 成本归因进入运行时

模型成本不再只看 provider 总账。平台开始按 account、tenant、user、agent、flow、
session、model、tool 和 API key 归因，并在调用前做预算检查。

### 4.7 多协议 runtime substrate 出现

Loomcycle 代表一种新方向：Agent runtime 不必绑定某个聊天产品，可以作为 sidecar 或
独立服务，同时提供 HTTP/SSE、gRPC、MCP、SDK 和 A2A 接口。上层产品只负责体验，
底层统一 run、state、identity、tool 和 cost。

## 5. 当前仍未解决好的问题

1. **tenant 的统一语义。** 用户、组织、workspace、account、pack 和 channel 常被不同
   项目当作隔离单位，迁移和组合困难。
2. **跨层恢复。** graph checkpoint 恢复不等于外部副作用、worker lease、SSE 投影和
   UI 状态都恢复。
3. **MCP supply chain。** server、Skill、tool schema 和更新来源的签名、审查、撤销仍
   缺少统一方案。
4. **长期记忆治理。** 自动记忆的准确性、来源、过期、用户控制和删除权仍是产品难题。
5. **审批与自主性的平衡。** 审批过多会让 Agent 失去价值，过少又无法承担企业风险。
6. **评测与运行时闭环。** 日志很多，但“是否完成真实任务、花费是否值得”仍难统一衡量。

## 6. 对 LambChat 的定位

在这张地图中，LambChat 位于“Deep Agent 产品化”路线：

- 下层依赖 DeepAgents + LangGraph；
- 横向整合 Skills、MCP、Memory 和 Sandbox；
- 上层提供用户、角色、任务、文件和多端交互；
- 治理深度高于普通 demo，但低于把组织、策略、成本和凭证代理作为独立控制面的项目；
- 隔离强于本地单进程 Agent，弱于 per-session Worker + 强网络边界的 runtime substrate。

因此它最适合学习的问题不是“如何写一个 Agent loop”，而是“如何把已有 Agent
harness 做成可供多人持续使用的产品”。
