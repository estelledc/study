---
title: "关键思考点与后续学习问题"
sidebar:
  hidden: true
---
# 关键思考点与后续学习问题

使用方式：

1. 先不看对应章节，用自己的话回答；
2. 回到源码入口找证据；
3. 回答时必须区分“框架能力、LambChat 实现、研究推断”；
4. 能画出 identity、state、event、credential 四条流，才算真正理解。

## 1. 基础概念自测

### Q1：Agent loop、Agent harness、Agent runtime、Agent platform 有什么区别？

思考点：

- 哪一层只负责 model/tool 循环？
- DeepAgents 和 LangGraph 各属于哪一层？
- 为什么 LambChat 不能只靠 `create_deep_agent()` 就完成产品？

建议复查：

- [生态八层技术栈](02-ecosystem-landscape.md#2-八层技术栈)
- [基础运行时](04-foundation-deep-dives.md)

### Q2：为什么 SSE 连接不应该拥有 Agent 任务？

思考点：

- 浏览器刷新时任务应该发生什么？
- `session_id` 和 `run_id` 分别解决什么？
- 只有 Redis pub/sub、没有持久事件会怎样？

### Q3：checkpoint、event log、message history、long-term memory 有什么区别？

要求举例说明每类数据：

- 谁写；
- 保存多久；
- 用于恢复还是展示；
- 是否跨 session。

### Q4：MCP 已经标准化工具连接，为什么平台还要 MCP 管理层？

至少回答：

- identity；
- authorization；
- credential；
- quota；
- audit；
- supply chain。

### Q5：加密保存 API key 为什么不等于凭证隔离？

比较：

- LambChat 应用内解密；
- MCP Gateway Registry/Lobu 的出口注入；
- Loomcycle 的运行时延迟解析。

## 2. LambChat 控制流问题

### Q6：从 POST 到第一个模型 token，经过哪些组件？

请画出：

```text
chat route
-> TaskManager
-> TaskExecutor
-> AgentFactory
-> outer graph
-> inner DeepAgents graph
-> Presenter
-> event stream
```

然后指出每一步可能失败时，用户能看到什么。

### Q7：为什么 LambChat 使用外层 LangGraph 包内层 DeepAgents graph？

回答时同时给出：

- 两个明确收益；
- 两个调试或状态代价；
- 如果删除外层 graph，哪些产品责任要迁移。

### Q8：Presenter 的“双写”怎样保证正确？

设计三个故障实验：

1. event store 写成功，实时发布失败；
2. 实时发布成功，event store 失败；
3. 客户端在两次写之间断线。

你需要定义 event ID、sequence 和重试/幂等策略。

### Q9：历史回放与实时事件为什么必须用同一 reducer？

尝试构造两套 reducer 漂移后的 bug：

- tool call 重复；
- todo 状态不同；
- run 终态丢失。

### Q10：进程内任务和 arq 模式分别能承诺什么？

不要只回答“arq 更可靠”。请说明：

- 进程崩溃；
- payload 序列化；
- worker 重试；
- graph checkpoint；
- 外部副作用；
- 任务 ownership。

## 3. Skills、MCP 与 Memory

### Q11：为什么 Skills 使用文件接口而不是数据库 CRUD 工具？

思考：

- DeepAgents 已有的 FilesystemMiddleware；
- `SKILL.md` 和 references/scripts 的相对路径；
- CompositeBackend；
- 产品存储与 Agent 心智模型的解耦。

### Q12：渐进披露会不会让 Agent 找不到正确能力？

权衡：

- 初始 token；
- metadata 质量；
- 检索召回；
- 误选工具；
- tool schema 注入时机。

设计一个评测，比较“全部工具”“角色过滤”“检索后披露”三种模式。

### Q13：工具列表阶段授权够不够？

构造一个场景：

1. Agent 启动时有权限；
2. 运行中角色被撤销；
3. 旧 tool schema 仍在上下文；
4. Agent 发起调用。

平台应该在哪一步再次检查？

### Q14：自动 Memory 为什么必须与用户显式 Memory 分开？

至少讨论：

- provenance；
- confidence；
- deletion；
- compaction；
- sensitive data；
- user correction。

### Q15：Memory compaction 的分布式锁解决了什么，没解决什么？

锁能防并发压缩，但不能自动保证：

- 压缩结论正确；
- cache 全部失效；
- 读写版本无冲突；
- 用户删除已经传播。

请设计版本号或 compare-and-swap 方案。

## 4. Sandbox 与安全

### Q16：user sandbox + session 目录与 per-session Worker 的安全差异是什么？

分别从以下角度比较：

- 文件系统；
- 进程；
- network；
- credential；
- resource limit；
- cost/cold start。

### Q17：为什么 URL allowlist 还不够防 SSRF？

思考：

- DNS rebinding；
- redirect；
- private/loopback/link-local/metadata IP；
- IPv6；
- proxy；
- MCP server 再次发起请求。

### Q18：一个被攻陷的 Agent Worker 能拿到什么？

分别为 LambChat、Lobu、Loomcycle 画出 blast radius。不要只看 secret at rest，要看：

- 运行时 env；
- 文件；
- network；
- shared cache；
- current user/tenant；
- global provider credential。

### Q19：Skill 是提示词还是代码？

Skill 可能包含指令、脚本和引用。请定义：

- 安装审核；
- 版本固定；
- 签名/来源；
- 可用工具；
- 网络权限；
- 更新和撤销。

## 5. 多租户与治理

### Q20：多用户为什么不自动等于多租户？

用 L0-L5 隔离阶梯检查 LambChat：

- UI；
- API ownership；
- query predicate；
- store/cache key；
- Worker/network/credential；
- budget/audit/admin。

### Q21：tenant ID 应该出现在哪些地方？

至少检查：

- 数据库主键/唯一键；
- Redis key；
- checkpoint thread namespace；
- MCP client cache；
- dynamic registry；
- object storage prefix；
- trace；
- cost ledger；
- sandbox workspace。

### Q22：RBAC、ABAC 和 policy action 分别解决什么？

对比：

- LambChat 角色过滤；
- Preloop deny/allow/require-approval；
- Loomcycle authoritative run identity。

### Q23：为什么 registration gate 应 fail closed，notification webhook 应 fail open？

再找三个外部依赖，判断它们应该：

- fail open；
- fail closed；
- degrade with warning。

### Q24：控制面与数据面拆分后会新增哪些一致性问题？

例如：

- policy 更新传播；
- credential rotation；
- Gateway cache；
- asset 删除；
- 运行中权限撤销；
- audit 丢失。

## 6. 架构比较题

### Q25：什么时候选择 Dify，而不是 LambChat？

给出一个步骤固定、需要运营配置和审计的业务场景，再给一个开放式研究/编码任务。

### Q26：LibreChat 与 LambChat 的产品根抽象为什么不同？

从 conversation、agent、run、artifact、sandbox 五个对象分析。

### Q27：OpenClaw 为什么适合被 Lobu/Preloop 包装，而不是直接改造成 SaaS？

讨论：

- 已有 channel/device/runtime 资产；
- 单用户信任假设；
- Worker 包装；
- Gateway/插件；
- 上游版本同步。

### Q28：Preloop 为什么属于 governance overlay，而不是完整 Agent platform？

列出它接管的控制点和仍由外部 runtime 拥有的状态。

### Q29：Loomcycle 作为 sidecar 的收益和代价是什么？

收益可能包括多协议统一和 runtime 复用；代价包括额外网络跳、部署、版本和状态 ownership。

### Q30：project-agi 的 Pack 何时优于数据库租户配置？

分别考虑：

- 少量可审查方案；
- 数万动态租户；
- secret；
- hot reload；
- schema migration；
- GitOps。

## 7. 源码追踪练习

### 练习 A：追踪一条 LambChat run

从以下入口开始：

```text
src/api/routes/chat.py
src/infra/task/manager.py
src/infra/task/executor.py
src/agents/core/base.py
src/agents/search_agent/nodes.py
frontend/src/hooks/useAgent/sseConnection.ts
frontend/src/hooks/useAgent/eventProcessor.ts
```

产出一张表：

| 步骤 | 输入 | 输出 | 持久化 | 失败终态 |
|---|---|---|---|---|

### 练习 B：追踪一个 MCP tool

回答：

1. 用户配置从哪里读取？
2. 在哪里解密？
3. server/tool 角色在哪里过滤？
4. quota 在哪里执行？
5. client cache key 是否包含 user/tenant？
6. tool result 如何进入 event/history？

### 练习 C：追踪一个 Skill

从 marketplace/storage 到 Backend 虚拟路径，再到 DeepAgents SkillsMiddleware。证明
Skill 正文不是在初始 prompt 中全部注入。

### 练习 D：验证 checkpoint 退化

构造 PostgreSQL/MongoDB checkpointer 不可用的环境，确认：

- 是否退化到 `MemorySaver`；
- health/log 是否显式告警；
- 进程重启后 run 能否恢复；
- 前端历史与 graph state 是否出现不一致。

### 练习 E：做一次 tenant-key 审计

对数据库、Redis、MCP cache、checkpoint、artifact、sandbox、trace、cost 的 key 逐项
检查，标记：

- 包含 tenant；
- 只包含 user；
- 依赖上层过滤；
- 尚不确定。

## 8. 设计题

### 题 1：给 LambChat 增加 durable approval

要求：

- 浏览器可以离线；
- approval 先持久化；
- worker 重启可恢复；
- 同一个 approval 不能消费两次；
- 角色撤销后旧批准失效；
- UI 历史和实时状态一致。

请定义表结构、事件和状态机。

### 题 2：把 MCP 凭证移出 Agent 进程

要求：

- Agent 只获得 scoped runtime token；
- Gateway 在出口注入 upstream credential；
- 支持按 user/tenant/agent 选择；
- rotation 不重启 Agent；
- audit 不记录 secret。

参考 MCP Gateway Registry、Lobu 和 Loomcycle，但不要直接复制项目结构。

### 题 3：按风险选择 sandbox

为三类任务设计策略：

1. 只读搜索；
2. 用户自己的代码仓；
3. 运行未知第三方 Skill 和安装依赖。

决定它们使用：

- 无 sandbox；
- user sandbox/session dir；
- per-session Worker；
- microVM。

给出成本和威胁模型依据。

### 题 4：定义统一事件协议

要求支持：

- model token；
- tool start/result；
- subagent；
- todo；
- artifact；
- approval；
- pause/resume；
- error/completed；
- history replay；
- schema evolution。

解释 event ID、sequence、幂等、敏感数据和版本策略。

## 9. 判断是否真正掌握

满足以下条件才算可以回答大部分基础问题：

- 能在 5 分钟内画出 LambChat 请求主链；
- 能解释 DeepAgents 与 LangGraph 的边界；
- 能说清五类状态及其存储；
- 能说明 MCP 标准没有解决的治理问题；
- 能用 L0-L5 评估“多租户”而不是只看 README；
- 能比较三种凭证模式和两种 sandbox 粒度；
- 能指出至少三个故障一致性场景；
- 能为一个具体业务选择 LambChat、Dify、LibreChat 或独立 runtime，并说明代价。
