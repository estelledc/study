# 研究范围与项目语料

## 1. 研究问题

“LambChat 的相关项目”没有天然终点。它依赖通用数据库、沙箱服务、模型 API、
Agent 框架和前端库；任意一层继续展开都能得到数百个仓库。本轮将原始要求转化为
六个可验收问题：

1. LambChat 的直接技术基础是什么？
2. 与它最接近的开源 Agent 平台有哪些？
3. 产品层、治理层和隔离运行时分别有哪些代表设计？
4. 每个正式样本的核心运行链、状态边界和代码组织是什么？
5. LambChat 相比这些项目的独特价值和不足是什么？
6. 后续学习应沿哪些问题和源码入口继续？

## 2. 纳入标准

正式样本至少满足一项强关系：

- LambChat 当前源码直接依赖；
- 与 LambChat 存在明确设计关系或相同 harness；
- 是最接近的端到端开源产品平台；
- 在 MCP 治理、多租户隔离或 Agent runtime 上提供独特横向对照；
- 仓库公开可 clone，存在可识别的核心代码，不只是宣传页。

同时执行以下筛选：

- 优先 canonical 上游，不选二次 fork；
- 优先能追踪一条真实请求链的项目；
- 同一能力层只保留少量有差异的代表；
- 将单层基础设施依赖放入背景分析，不把研究无限展开；
- README 的 target architecture、roadmap 和未合并分支不得当作当前能力。

## 3. 14 个正式研究对象

### 3.1 2026-07-16 GitHub 快照

star 和 fork 数是社区关注度快照，不是质量排名。许可证列采用 GitHub API 当日返回；
`未识别` 只表示 API 没给出标准 SPDX，不能推断仓库没有许可证文件。

| 项目 | star | fork | 最近 push | GitHub 许可证 |
|---|---:|---:|---|---|
| LambChat | 203 | 40 | 2026-07-14 | 未识别 |
| DeepAgents | 26,317 | 3,689 | 2026-07-16 | 未识别 |
| LangGraph | 37,427 | 6,274 | 2026-07-16 | 未识别 |
| deepagents-backends | 112 | 17 | 2026-07-15 | 未识别 |
| OpsinTech Platform | 91 | 17 | 2026-07-15 | 未识别 |
| DeepAgentForce | 89 | 11 | 2026-06-23 | 未识别 |
| Dify | 149,048 | 23,477 | 2026-07-16 | 未识别 |
| LibreChat | 40,813 | 8,377 | 2026-07-16 | 未识别 |
| OpenClaw | 383,121 | 80,463 | 2026-07-16 | 未识别 |
| project-agi | 1 | 1 | 2026-06-01 | 未识别 |
| MCP Gateway Registry | 801 | 205 | 2026-07-16 | 未识别 |
| Preloop | 35 | 9 | 2026-07-14 | 未识别 |
| Lobu | 0 | 1 | 2026-04-28 | 未识别 |
| Loomcycle | 10 | 1 | 2026-07-16 | 未识别 |

### 3.2 按研究作用分组

#### A. 主项目与直接基础

| 项目 | 入选原因 | 主要观察角度 |
|---|---|---|
| [LambChat](https://github.com/Yanyutin753/LambChat) | 主研究对象 | 后台任务、事件流、Skills、MCP、Memory、Sandbox、RBAC、多端 UI |
| [DeepAgents](https://github.com/langchain-ai/deepagents) | LambChat 内层 Agent harness | middleware、backend、subagent、skills、memory、summarization |
| [LangGraph](https://github.com/langchain-ai/langgraph) | DeepAgents/LambChat 的状态运行时 | StateGraph、Pregel、checkpoint、interrupt、stream |
| [deepagents-backends](https://github.com/DiTo97/deepagents-backends) | DeepAgents BackendProtocol 的远程实现 | S3、PostgreSQL、Azure、GCS、MongoDB、Redis 虚拟文件系统 |

#### B. 端到端或近邻产品平台

| 项目 | 入选原因 | 与 LambChat 的主要差异 |
|---|---|---|
| [OpsinTech Platform](https://github.com/OpsinTech/opsintech-platform) | 同样以 LangGraph/Skills/MCP/沙箱构建企业平台 | 更强调 DeerFlow 运行时复用和独立治理 Gateway |
| [DeepAgentForce](https://github.com/TW-NLP/DeepAgentForce) | 紧凑的多租户 Skills/MCP 平台 | 单体参考更易读，产品和任务持久性弱于 LambChat |
| [Dify](https://github.com/langgenius/dify) | 成熟的开源 AI 应用平台 | Workflow-first，Agent 是图中的一种节点 |
| [LibreChat](https://github.com/danny-avila/LibreChat) | 成熟的多模型聊天与 Agent 产品 | Conversation-first，可共享 Agent、MCP、Skills、HITL |
| [OpenClaw](https://github.com/openclaw/openclaw) | 渠道、设备与本地 Agent 代表 | 个人/本地 Gateway-first，不以企业多租户为核心 |

#### C. 治理控制面与执行底座

| 项目 | 入选原因 | 独特观察角度 |
|---|---|---|
| [project-agi](https://github.com/margadeshaka/project-agi) | SDK/Runtime/UI 分层的小型参考 | Pack 作为配置和租户单元 |
| [MCP Gateway Registry](https://github.com/agentic-community/mcp-gateway-registry) | MCP/Agent/Skill 资产控制面 | registry/auth/gateway 三边界、凭证代理、审计 |
| [Preloop](https://github.com/preloop/preloop) | Agent 治理覆盖层 | MCP 防火墙、审批、模型网关、预算、Agent Control |
| [Lobu](https://github.com/fuxingloh/lobu) | 多租户隔离交付层 | per-session Worker、单一出口、凭证不进入 Worker |
| [Loomcycle](https://github.com/denn-gubsky/loomcycle) | 独立 Go Agent runtime substrate | 多协议入口、tenant-aware 存储、凭证、暂停恢复、成本 |

## 4. 候选池与未纳入原因

下表中的项目不是“不好”，而是没有进入本轮逐仓深挖。候选信息来自 GitHub 搜索、
正式样本的依赖/文档和已有本地研究。

| 候选 | 处理 | 原因 |
|---|---|---|
| `langchain-ai/deep-agents-ui` | 只登记 | DeepAgents 的 UI 参考，但仓库已归档；LambChat 自己已有更完整前端 |
| `langchain-ai/deep-agents-from-scratch` | 后续教学候选 | 适合理解 harness 原理，不增加生产平台维度 |
| `NVIDIA/NemoClaw`、`langchain-ai/openshell-deepagent` | 只登记 | 聚焦 NVIDIA OpenShell 发行和安全沙箱，是特定组合而非通用平台对照 |
| `bytedance/deer-flow` | 复用已有研究 | OpsinTech 的重要运行时来源；本仓已有 DeerFlow/LangGraph 专项笔记，本轮在 OpsinTech 章节引用，不重复逐仓 |
| `Daytona`、`E2B`、`CubeSandbox` | 依赖分析 | LambChat 的沙箱 provider；属于独立基础设施赛道 |
| `kubernetes-sigs/agent-sandbox`、`trycua/cua` | 候选 | 隔离/Computer Use 基础设施，未覆盖 LambChat 产品主链 |
| `AmoyLab/Unla`、`docker/mcp-gateway`、`microsoft/mcp-gateway` | 候选 | MCP gateway 代表，但正式样本已用 Registry 和 Preloop 覆盖“注册治理”与“策略执行”两个不同角度 |
| `TheLunarCompany/lunar`、`aipotheosis-labs/gate22` | 候选 | MCP 安全治理有价值；与 Preloop/MCP Gateway Registry 样本重叠 |
| `kdcube/kdcube`、`polos-dev/polos` | 后续候选 | 搜索描述接近多租户 runtime，但社区和源码验证证据暂不如正式样本充分 |
| `langgenius/dify-sandbox` 等 Dify 子仓 | 依赖分析 | 作为 Dify 的执行组件理解，不额外扩大为产品级专题 |
| MongoDB、Redis、PostgreSQL、S3 | 基础设施 | 只解释它们在状态、队列、checkpoint、对象存储中的职责 |
| LangSmith、Langfuse、OpenTelemetry | 可观测性背景 | 不是 LambChat 当前端到端产品架构的必要对照仓 |

### 为什么不能把搜索结果全部 fork

GitHub 对 `deep agent`、`mcp gateway`、`agent sandbox` 和 `multi tenant agent`
的宽查询会返回大量教程、垂直应用、概念验证和重复网关。将它们全部 fork 会造成三个
问题：

1. “相关”的定义随搜索词变化，无法证明完成；
2. 低证据项目挤占逐仓源码验证时间；
3. 本地磁盘、恢复卡片和后续同步成本持续增长，却不增加关键架构维度。

因此这里的“所有找到的相关可参考项目”被操作化为：**所有通过公开纳入标准的正式
项目均 fork、clone、固定和建卡；未通过者保留候选与排除理由。**

## 5. 本地 clone 与 fork 约束

14 个正式项目均遵循当前仓库的第三方源码契约：

- 本地目录统一位于 `explorations/research/repos/<slug>/`；
- 每个目录保留自己的 `.git`，不是父仓子模块；
- `origin` 指向 `estelledc/*` 个人 fork；
- `upstream` 指向 canonical 上游；
- 父仓通过 `explorations/research/repos/*/` 统一忽略源码；
- 父仓只跟踪 `_meta` 卡片、固定 commit 和消化后的研究结论；
- clone 使用浅历史、blob 过滤并跳过 Git LFS 大文件；
- 不在第三方 clone 中写研究笔记或修代码；
- `langgraph` 和 `dify` 因 token 没有 `workflow` scope，使用本地
  `research-snapshot` 跟踪最新 upstream commit，没有扩大 GitHub token 权限。

本轮 14 个 clone 合计约 1.3 GB。它们不是父仓备份内容；新机器按项目卡从个人 fork
恢复，再添加 upstream。

## 6. 证据等级与局限

证据优先级：

1. 固定 commit 的源码、配置、测试和本地 Git 状态；
2. 仓库内架构文档和 README；
3. GitHub API 元数据；
4. 搜索结果描述。

局限：

- 本轮做的是架构静态研究，没有为 14 个系统逐一部署完整生产环境；
- star、fork、push 数会继续变化；
- 大型项目的所有插件和企业版能力不可能在一轮研究中逐条运行验证；
- 设计文档可能领先或落后于实现，因此正文会明确标注“项目自述”和“规划中”。
