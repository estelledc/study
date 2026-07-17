# LangGraph 生态系统研究

> 快照日期：2026-07-16；重新验收：2026-07-17
> 研究对象：21 个 GitHub 仓库，均已 fork 到 `estelledc`，并以独立浅层稀疏仓库 clone 到 `explorations/research/repos/`。
> 核心问题：LangGraph 在 agent 技术栈中负责什么，它的执行内核如何工作，上层项目如何补齐 agent、应用和部署能力，同类框架又采取了哪些不同路线？

## 先看结论

LangGraph 不是“帮你自动造一个万能 agent”的完整产品。它是一个低层、有持久状态的图执行内核：

- `StateGraph` 负责描述节点、边、状态 schema 和 reducer。
- 编译后的图落到 Pregel/BSP 风格执行器，按“计划、并行执行、合并更新”推进 superstep。
- checkpointer 把 thread 的中间状态版本化，支撑恢复、interrupt、历史查看和 time travel。
- `Command`、`Send`、subgraph 和 stream 是控制流、并发、组合与可观测性的关键原语。

围绕这个内核，生态已经形成清晰分层：

1. **执行内核**：LangGraph Python、LangGraph.js、LangGraph4j。
2. **标准 agent 层**：LangChain `create_agent`，用 middleware 包装模型-工具循环。
3. **自主 agent harness**：Deep Agents、DeerFlow，在标准 agent 上加入文件系统、skills、subagents、memory、sandbox 和长任务治理。
4. **模式库**：supervisor、swarm、bigtool、ReAct template，把常见拓扑压成薄封装。
5. **应用与协议层**：Agent Chat UI、Gemini fullstack、agent-service-toolkit。
6. **部署控制面**：LangSmith Deployment 是商业路径；Aegra 是兼容 assistants/threads/runs/store/crons 的开源自托管路径。
7. **同类框架**：Microsoft Agent Framework、CrewAI、Pydantic AI、OpenAI Agents SDK、Mastra 分别强调企业 workflow、角色协作、类型安全、轻量 handoff 和 TypeScript 全栈。

最重要的边界是：**checkpointed 不等于 exactly-once**。LangGraph 能保存和重放状态，但危险工具仍需要外部幂等键、事务、锁、审计和补偿。Web 服务、认证、限流、队列、多租户、部署、成本治理与跨 agent tracing 也不属于 `StateGraph` 自动提供的能力。

## 2026-07-17 重新验收

- 21/21 本地工作树 clean。
- 12 个 upstream 与 pinned commit 一致，9 个漂移仓已做文件级审计。
- LangGraph Python/JS 核心均无漂移。
- pinned LangGraph 的并行 StateGraph、reducer、InMemorySaver 实验实际运行。
- 4 个实验测试通过；无 reducer 的并行同 key 写入按预期抛 `InvalidUpdateError`。
- 增量主要位于 Deep Agents Code、Pydantic deferred tools、OpenAI streaming retry 和各产品外围，没有反证核心分层。

先读[全量快照复核](08-2026-07-17-refresh.md)，再完成[零基础 StateGraph 实验](09-beginner-stategraph-lab.md)。

## 阅读路线

| 想回答的问题 | 阅读材料 |
|---|---|
| 整个领域有哪些层，2026 年发展到哪一步？ | [01-ecosystem-landscape.md](01-ecosystem-landscape.md) |
| LangGraph、LangChain、Deep Agents 与官方模式库怎么实现？ | [02-core-and-official-projects.md](02-core-and-official-projects.md) |
| 完整应用、部署层和跨语言实现怎么组织？ | [03-production-apps-and-ports.md](03-production-apps-and-ports.md) |
| CrewAI、Pydantic AI 等同类项目和 LangGraph 有什么本质差异？ | [04-alternative-frameworks.md](04-alternative-frameworks.md) |
| 选型时该比较哪些维度？ | [05-cross-project-comparison.md](05-cross-project-comparison.md) |
| 后续按什么顺序学习，应该追问什么？ | [06-learning-route-and-questions.md](06-learning-route-and-questions.md) |
| fork、commit、许可证和本地恢复信息是什么？ | [07-repository-inventory.md](07-repository-inventory.md) |
| 哪些项目漂移，旧结论是否仍有效？ | [08-2026-07-17-refresh.md](08-2026-07-17-refresh.md) |
| 怎样亲手看见并行、reducer 和 checkpoint？ | [09-beginner-stategraph-lab.md](09-beginner-stategraph-lab.md) |

## 研究口径

### 纳入标准

项目至少满足一项：

- 是 LangGraph 的核心实现、官方高层框架、官方模式库或官方学习入口。
- 展示 LangGraph 从 graph 到 API、UI、部署或真实 agent harness 的完整边界。
- 提供 Java 等跨语言实现，能暴露原语迁移时的取舍。
- 是主要同类框架，且在执行模型、状态、持久化或多 agent 协作上有独特路线。
- 是高质量生态索引，可用于持续发现但不替代源码验证。

### 排除标准

- 只有教程 notebook，且没有比 `langgraph-101` 更独特的机制。
- 只是某个垂直业务应用，核心 graph 没有新的可复用设计。
- 已归档、迁移或被主仓吸收的旧实现。
- 仅在依赖文件中出现 LangGraph，没有架构层关联。
- 与已纳入项目高度同质，增加仓库数却不增加新的比较维度。

“所有相关项目”无法形成绝对封闭集合。本材料中的“所有”指截至快照日，按上述标准检索、去重并冻结进入深度语料集的 21 个项目。候选与排除理由见仓库清单。

## 证据分级

- **A级：源码证据**。来自本地 pinned commit 的实现、测试、依赖和目录结构。
- **B级：一手项目证据**。来自官方 README、官方发布说明和官方架构文档。
- **C级：社区信号**。来自 GitHub 搜索、Reddit、Twitter/X、B 站和第三方文章，只用于识别采用趋势与常见痛点。

材料不把 C 级观点写成已验证事实。涉及性能、采用规模、企业客户和故障比例时，应回到原始 benchmark、issue 或官方 case study 再确认。

## 验证边界

- 已完成：21 仓 fork/clone、远端与 commit 固定、目录和依赖扫描、核心执行路径静态分析、跨项目比较、恢复卡、父仓治理检查，以及 pinned LangGraph 的最小 E2 实验。
- 未完成：没有为 21 个项目逐一安装依赖，也没有运行全部单元测试、数据库、云部署或真实模型 E2E。
- 因此可以回答架构、职责、代码组织、主要原语和选型问题；涉及运行性能、兼容性或某个边缘行为时，仍需针对具体仓库做最小实验。

## 收尾状态

- 当前状态：`reference`。
- 不继续无边界扩充项目清单。
- 重新激活条件：出现具体实现疑问、需要验证某个生产主张，或准备把某种模式落到自己的 agent 项目。
- 重新激活后的第一步：核对目标仓库的 upstream diff，再沿本材料给出的推荐入口追一条最小调用链。
