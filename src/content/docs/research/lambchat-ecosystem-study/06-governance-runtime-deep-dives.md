---
title: "治理控制面与执行底座项目深挖"
sidebar:
  hidden: true
---
# 治理控制面与执行底座项目深挖

这一组项目不都提供完整聊天产品。它们更关注：配置如何成为产品资产、MCP 怎样被
治理、凭证放在哪里、不同用户的执行如何隔离、run 如何跨协议恢复。

## 1. project-agi

> 固定源码：`margadeshaka/project-agi@d08c4d32845858f324ea925e5ab626f0825274e8`

### 1.1 定位

project-agi 是 vendor-neutral、配置驱动的 Agent 框架，强调“可嵌入 SDK + 可选参考
Runtime/UI”。它规模小，适合学习库与服务器如何解耦。

### 1.2 三层架构

仓库 `ARCHITECTURE.md` 定义：

```text
packs/<slug>/          YAML/JSON tenant configuration
       |
       v
agi-runtime            FastAPI + MCP + optional UI hosting
       |
       v
agi-core / agi-sdk     embeddable Python framework
```

#### agi-core/SDK

负责：

- AgentRuntime；
- LLM/provider registry；
- tool registry；
- KB/retrieval；
- pack loader；
- storage/auth adapter；
- append-only AI Trail。

#### agi-runtime

作为薄 FastAPI 外壳，目标接口包括：

- chat；
- tools；
- KB；
- trail；
- MCP；
- health/admin。

#### packs

Pack 将 identity、theme、tool allowlist、LLM、prompts、KB、scenarios 和 assets 放在
同一目录。请求通过 `X-Pack` 选择 Pack。

### 1.3 Pack 的意义

Pack 把“租户/方案配置”变成可 code review 的文件：

- 变更进入 Git diff；
- prompts、tools、KB 和 theme 一起迁移；
- 不需要数据库导出才能复制方案；
- e2e scenario 可以和配置同版本。

代价：

- 热更新和大规模动态租户管理更困难；
- secret 不能直接放入 Pack；
- Pack 与运行时数据库状态的一致性需要定义；
- `X-Pack` 只是选择机制，不自动构成强 tenant authorization。

### 1.4 代码组织

```text
project-agi/
├── packages/
│   ├── agi-core/
│   ├── agi-sdk/
│   ├── agi-packs/
│   └── agi-mcpfyer/
├── distribution/
│   ├── agi-runtime/
│   ├── agi-auth/
│   ├── agi-ui/
│   └── agi-chart/
├── packs/
│   ├── care-demo/
│   └── fleet-demo/
├── deploy/
└── docs/
```

### 1.5 证据边界

本项目的架构文档表达了清楚的目标形态，但当前仓库规模和社区采用度较小。阅读时应
逐项核对：

- 文档描述的是 current code 还是 target；
- provider/adapter 是否已有完整实现；
- AI Trail 是否覆盖失败和流式事件；
- Pack isolation 是否经过跨租户测试。

它适合作为“架构骨架参考”，不应仅凭文档宣称已达到大型平台成熟度。

## 2. MCP Gateway Registry

> 固定源码：`agentic-community/mcp-gateway-registry@597ef3c7520469392f662d835bb01fb50614e29e`

### 2.1 定位

项目从 MCP server gateway 演化成 AI 资产控制面，统一注册：

- MCP servers；
- agents；
- skills；
- virtual servers；
- 自定义 entity types。

它最有价值的不是 tool proxy 本身，而是清楚地区分 control plane、auth chokepoint 和
data plane。

### 2.2 三边界

```text
registry/      decides what exists and what is allowed
auth_server/   proves identity and derives scopes
docker/nginx   moves bytes and injects/strips credentials
```

#### Registry

负责注册、搜索、访问控制、审计、health、federation 和配置。多种 AI asset 使用同一
registration/search/access/audit spine。

#### Auth server

支持若干显式 IdP provider，通过统一 `/validate` chokepoint 形成用户上下文和 scopes。
它不是“任意 OIDC issuer 零代码接入”：新增 provider 仍需实现 provider class。

#### Gateway

nginx + Lua 负责：

- 反向代理；
- TLS/认证入口；
- 虚拟 MCP 路由；
- upstream credential 注入；
- 必要的 card/metadata 重写。

Registry 决策，Gateway 搬运数据。两者当前可共同部署，但设计方向允许独立扩缩容。

### 2.3 关键不变量

项目的 theory 文档给出可验证边界：

1. 所有 AI asset 共享控制面主干；
2. gateway 尽量保持通用 HTTP reverse proxy；
3. registry 默认不进入 A2A peer-to-peer 数据路径；
4. `DEPLOYMENT_MODE` 与 `REGISTRY_MODE` 是两个正交轴；
5. Docker/ECS/EKS 配置需要保持一致；
6. registration gate fail closed，notification webhook fail open；
7. 支持的 IdP 集合是显式工厂；
8. MCP OAuth discovery 是兼容性契约。

### 2.4 凭证边界

上游第三方 token 不下发到用户机器。客户端 authorization 只用于 ingress，Gateway
在 egress 注入 vault/credential provider 中的真实凭证。

相比 LambChat 在应用内解密 MCP env/header，这种模式把凭证明文暴露范围压到
Gateway 数据面。

### 2.5 单租户限制

仓库设计文档明确当前是单租户部署，不是多租户 SaaS。其 cookie/session 安全模型也
基于该假设。因此它可以作为 LambChat 的 MCP 治理参考，但不能直接证明组织隔离。

### 2.6 代码组织

```text
mcp-gateway-registry/
├── registry/              # FastAPI 控制面
│   ├── api/
│   ├── services/
│   ├── repositories/
│   ├── auth/
│   ├── egress_auth/
│   ├── search/
│   ├── middleware/
│   └── audit/
├── auth_server/           # IdP、session、scope
├── docker/                # nginx + Lua 数据面
├── credentials-provider/  # 出口凭证
├── frontend/
├── cli/
├── charts/
├── terraform/
└── docs/design/
```

### 2.7 对 LambChat 的启发

- MCP server 和 tool 应作为受治理资产，而非用户 JSON 配置；
- credential injection 可从 Agent 进程移到 Gateway；
- registration/admission 与 notification 要有不同失败策略；
- 控制面和数据面应按不同流量独立扩缩；
- “MCP 已接入”不等于“多租户、凭证、审计已解决”。

## 3. Preloop

> 固定源码：`preloop/preloop@ec98f75500630ef71bd3e0f07d64874cc9df9e4a`

### 3.1 定位

Preloop 是 Agent governance overlay。它不要求替换外部 Agent loop，而是接管或观察：

- MCP 工具访问；
- human approval；
- 模型流量；
- budget/cost；
- runtime session；
- Agent Control；
- issue/code tracker 事件流。

### 3.2 总体架构

```text
Agent / MCP client / Console
          |
          v
FastAPI REST + MCP + Model Gateway + Agent Control
          |
          +---- Policy / Approval / Budget / Audit
          |
          +---- PostgreSQL + PGVector
          |
          +---- NATS JetStream workers
```

关键目录：

```text
backend/preloop/services/policy/
backend/preloop/api/
backend/preloop/models/
backend/preloop/sync/
runtime-plugins/
frontend/src/
```

### 3.3 MCP 防火墙

工具规则可以表达：

- deny；
- require approval；
- allow；
- 条件表达式；
- workflow；
- subject-scoped override。

策略作用于具体 runtime principal，而不只是 account。解析链可按 API key、managed
agent、account 逐层回退。

### 3.4 Model Gateway

提供 OpenAI-compatible 和 Anthropic-compatible 入口，将外部 Agent 的模型请求统一
路由到 provider。治理点包括：

- short-lived runtime bearer token；
- model allowlist；
- token/费用记录；
- budget preflight；
- streaming usage；
- provider credential custody；
- request context optimization；
- redaction-aware telemetry。

这使“工具治理”和“模型治理”进入同一 account/session/agent 归因体系。

### 3.5 任务与恢复

Preloop Sync 使用 NATS/JetStream。Flow worker 模式中：

1. API 创建 `PENDING` execution；
2. dispatch 到 worker pool；
3. worker 通过数据库 lease/heartbeat 认领；
4. 执行更新发布到 `flow-updates.{id}`；
5. 启动恢复逻辑重新发布 stale/unclaimed execution。

与 LambChat 的 arq/Redis 对比，Preloop 更明确地把 worker lease、ack 和 recovery
写进分布式执行协议。

### 3.6 Agent Control

外部 OpenClaw/Hermes runtime 可通过 WebSocket 长连：

- runtime principal 建立在线 presence；
- operator command 先持久化，再投递；
- command 有 `pending -> delivered -> acked` 状态；
- 断线重连后补发未完成命令；
- runtime plugin 将 operator 文本作为普通用户指令，而非隐藏 system override；
- 后续工具和模型调用仍走 policy/gateway。

这是一种“治理层控制已有 Agent”的模式，不需要将 Agent loop 搬进 Preloop。

### 3.7 实现与规划边界

仓库架构文档同时描述已实现、scaffolded 和 target direction。材料中应保持区分：

- MCP、model gateway、基础 cost ledger、runtime plugins 和 Agent Control 主链有当前实现；
- 部分企业 billing、价值评估、forecasting、原生 voice 体验由插件或后续方向承接；
- “应该”“target”“planned”不能当作当前 OSS 已完成能力。

### 3.8 代码组织

```text
preloop/
├── backend/
│   ├── preloop/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   └── sync/
│   └── tests/
├── runtime-plugins/
│   ├── openclaw-preloop/
│   └── hermes-preloop/
├── frontend/src/
├── cli/
├── helm/
└── scripts/
```

### 3.9 对 LambChat 的启发

- 将 model usage 与 tool usage 归入同一 run/session；
- approval 应是 policy action，不只是 UI 回调；
- operator command 必须先持久化再投递；
- 外部 runtime 可以通过 plugin 接入治理，不必全部迁移；
- 费用未知时宁可标记 `unpriced`，不要默认为 0。

## 4. Lobu

> 固定源码：`fuxingloh/lobu@b067a9440a8a8ce45fc6380a081cd5b6c0554684`

### 4.1 定位

Lobu 将 OpenClaw 一类单用户 Worker 包装成多租户交付系统。它的核心不在重新实现
Agent loop，而在 Gateway、Worker 和基础设施隔离。

### 4.2 信任模型

仓库安全文档明确假设：

- LLM 生成代码不可信；
- 第三方 Skills/MCP 不可信；
- 不同 channel/DM 用户不得互读工作区和 secret；
- 目标是把 compromise 限制在单个 Worker/session。

### 4.3 隔离拓扑

#### Kubernetes

- per-session worker Pod；
- resource constraints；
- NetworkPolicy；
- 最小 RBAC；
- gVisor/Kata/Firecracker 条件支持；
- per-session PVC。

#### Docker Compose

- Worker 位于 internal network；
- 无 host network 暴露；
- per-worker volume；
- Gateway 是唯一出口。

### 4.4 网络与凭证

Worker 不直接访问互联网，所有 outbound 经过 Gateway HTTP proxy。Gateway 实施
allowlist/blocklist。

凭证策略：

- provider credential 和 client secret 保留在 Gateway；
- MCP credential 按用户解析并在调用时注入；
- 第三方 OAuth 由专门服务处理；
- Worker 只得到最小、范围受限 token；
- 被攻陷的 Worker 不应读取平台全局 secret。

这是比“加密后存数据库，再在 Agent 进程解密”更强的运行时隔离。

### 4.5 代码组织

```text
lobu/
├── packages/
│   ├── gateway/       # 入口、路由、egress、Worker 管理
│   └── worker/        # Agent Worker
├── db/migrations/     # 持久化 schema
├── docker/
│   ├── app/
│   ├── worker/
│   ├── openclaw/
│   └── postgres/
├── charts/lobu/       # Kubernetes/Helm
├── config/
├── skills/
├── codex-skills/
├── examples/
└── docs/
```

### 4.6 与 LambChat 对比

| 维度 | LambChat | Lobu |
|---|---|---|
| Agent 实现 | 内嵌 DeepAgents/LangGraph | 包装 OpenClaw Worker |
| 默认隔离 | user sandbox + session 目录 | per-session Worker/volume |
| 网络 | 由 sandbox provider 配置 | Gateway 唯一 egress |
| 凭证 | 应用内加密/运行时使用 | Gateway 持有并注入 |
| 产品 UI | 完整聊天/文件/配置 | 更偏交付和基础设施 |

### 4.7 代价

- per-session Pod/PVC 成本和调度延迟更高；
- Gateway 成为关键数据面，需要高可用和容量规划；
- OpenClaw 版本、Worker image 与平台适配要持续维护；
- 网络 allowlist 对动态依赖安装可能过于严格。

## 5. Loomcycle

> 固定源码：`denn-gubsky/loomcycle@410919ec436100dcfe7355b9fa35632cbe91d7ad`

### 5.1 定位

Loomcycle 是 Go 实现的 Agent runtime substrate/sidecar。它试图统一：

- Agent loop；
- tools/MCP；
- run/session/state；
- pause/resume；
- HTTP/SSE、gRPC、MCP、SDK、A2A 等入口；
- tenant identity 和 credential；
- persistence、HA、cost/observability。

与 LambChat 不同，它不以聊天 UI 为中心，而以“所有上层客户端共享同一个 runtime”
为中心。

### 5.2 单 runtime 不变量

CLI doctor 和启动逻辑强调同一 state 不应被两个独立 runtime 同时拥有。若要增加 MCP
入口，应连接现有 runtime，而不是另起一个进程读写相同状态。

这个不变量避免：

- 两套 scheduler 同时认领；
- 两份内存 registry 漂移；
- pause/cancel 只命中其中一个进程；
- 同一 run 被重复执行。

### 5.3 多协议入口

同一 runtime 可提供：

- HTTP + SSE；
- gRPC；
- MCP stdio；
- MCP HTTP；
- SDK adapter；
- A2A 相关绑定。

这些入口复用同一个 Store、cancel registry、identity resolver 和 tool substrate。协议
只是适配层，run 语义不能因入口变化而分叉。

### 5.4 tenant-aware MCP

动态 MCP registry/pool 使用 `(tenant, name)` 作为关键坐标：

- 先解析 tenant 自己的定义；
- 再回退 shared/static；
- 运行开始只枚举当前 tenant 可见工具；
- tenant A 不应看到 tenant B 的 server/tool；
- credential 在请求上下文中按 tenant/user/agent 解析。

这比“连接后再按 UI 角色隐藏”更接近底层强隔离。

### 5.5 Credential engine

凭证具有 scope precedence：

```text
agent > user > tenant > operator fallback
```

典型用途：

- provider API key；
- MCP HTTP header 中的 `$cred:<name>`；
- sandbox/child process env；
- GitHub 等工具 token。

运行时还区分“是否可解析某 provider”的 metadata probe 与真实 decrypt，避免为了构造
可用模型集合就提前解密 secret。

### 5.6 Pause、resume 与持久状态

Runtime 提供 run 的 pause/resume/state 接口，并让 HTTP/gRPC 等入口共享 manager。
这比只在前端停止读取 SSE 更强：暂停是 runtime 状态，而不是连接状态。

持久化实现覆盖 SQLite/PostgreSQL 等 store；tenant ID 进入 session、目录项和动态定义
等表的坐标。HA 需要所有副本共享持久化与认领协议，而不只是共同读数据库。

### 5.7 工具与网络

内置工具包括 filesystem、bash、HTTP、web fetch 等。HTTP 工具支持：

- host allowlist；
- private/loopback/link-local/metadata IP 防护；
- caller-authoritative policy；
- private host 例外；
- MCP private IP 单独控制。

这表明“能访问 URL”被视为安全边界，而不是普通工具实现细节。

### 5.8 代码组织

```text
loomcycle/
├── cmd/loomcycle/main.go  # composition root
├── internal/
│   ├── loop/              # Agent loop
│   ├── connector/         # 对外连接/协议抽象
│   ├── tools/             # 内置工具和定义工具
│   ├── mcp/               # MCP pool/registry/transport
│   ├── store/             # 存储协议与实现
│   ├── auth/              # identity/token
│   ├── channels/          # 事件/中断通道
│   └── cli/
├── adapters/{python,ts}/  # SDK 适配
├── proto/                 # gRPC
├── bundles/               # 可运行组合
├── examples/              # 中断、多 Agent、scheduler 等实验
├── deploy/
└── web/
```

`cmd/loomcycle/main.go` 是大型 composition root，集中组装 store、credential、MCP、
tools、server 和 scheduler。优点是依赖关系显式；代价是文件很大，后续需要持续防止
组装逻辑与业务逻辑混合。

### 5.9 对 LambChat 的启发

- tenant 应进入底层 registry/store key，不只存在 JWT；
- 所有协议入口应共享一套 run semantics；
- credential resolution 应按请求 identity 延迟发生；
- pause/resume 应属于 runtime，不属于浏览器连接；
- HTTP/WebFetch/MCP egress 要有 DNS/private-network 防护；
- runtime substrate 可以独立于产品 UI。

## 6. 五种治理与运行时策略对比

| 项目 | 核心控制对象 | 数据面 | tenant 强度 | 凭证策略 | 自带 Agent loop |
|---|---|---|---|---|---|
| project-agi | Pack | FastAPI runtime | 配置级 | adapter/env | 是 |
| MCP Gateway Registry | AI assets/scopes | nginx/Lua gateway | 当前单租户 | Gateway 注入 | 否 |
| Preloop | subject/policy/session | MCP + model gateway | account/subject | Gateway/secret service | 主要治理外部 runtime |
| Lobu | session Worker | Gateway + Worker | 强执行隔离 | Gateway 注入 | 复用 OpenClaw |
| Loomcycle | tenant/run/definition | runtime 多协议入口 | tenant-aware store/runtime | 延迟 scope 解析 | 是 |

## 7. 组合启示

一个更完整的未来 LambChat 可以按层吸收，而不是直接合并项目：

1. 保留 LambChat 的产品 UI、Task/Presenter 和 DeepAgents 体验；
2. 借鉴 MCP Gateway Registry 的 control/data plane 和 egress credential；
3. 借鉴 Preloop 的 policy action、budget 和 durable operator command；
4. 高风险任务采用 Lobu 式 per-session Worker；
5. 长期将 run/tenant/credential 下沉到 Loomcycle 式独立 runtime substrate。

代价是服务数量和一致性协议显著增加。只有在真实租户隔离、合规或规模需求出现时，
这种拆分才值得。
