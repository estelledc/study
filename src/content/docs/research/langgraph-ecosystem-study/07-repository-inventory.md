---
title: "07. 仓库清单、版本与本地约束"
sidebar:
  hidden: true
---
# 07. 仓库清单、版本与本地约束

## 1. 总体结果

- 深度语料集：21 个仓库。
- fork 所有者：`estelledc`。
- 本地位置：`research-worktrees/<slug>`。
- clone 形式：独立 Git 仓库、`--depth=1 --filter=blob:none --sparse`。
- 本地分支：`research-snapshot`，跟踪原项目 `upstream/main` 或 `upstream/master`。
- 远端约定：`origin` 指个人 fork，`upstream` 指原项目。
- 父仓约定：只跟踪研究材料和 `_meta` 卡，不跟踪第三方源码。

个人账号原有 `langgraph`、`langchain`、`crewAI` 三个 fork；本轮新建其余 18 个 fork。所有 21 个 fork 的 parent 已通过 GitHub API 核对。

## 2. 逐仓清单

GitHub 数字是 2026-07-16 快照，只用于观察生态规模。

| 类别 | 项目 | 上游 | pinned commit | stars | 许可证 |
|---|---|---|---|---:|---|
| 核心 | LangGraph | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | `49ae27c2ae98` | 37,427 | MIT |
| 核心 | LangGraph.js | [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | `afb42cd7fe7a` | 3,119 | MIT |
| 标准 agent | LangChain | [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | `cf2115a6cfae` | 141,913 | MIT |
| Harness | Deep Agents | [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | `d46a2cb033b8` | 26,318 | MIT |
| 模式 | Supervisor | [langchain-ai/langgraph-supervisor-py](https://github.com/langchain-ai/langgraph-supervisor-py) | `88859b34017a` | 1,625 | MIT |
| 模式 | Swarm | [langchain-ai/langgraph-swarm-py](https://github.com/langchain-ai/langgraph-swarm-py) | `749d4450f248` | 1,538 | MIT |
| 模式 | Bigtool | [langchain-ai/langgraph-bigtool](https://github.com/langchain-ai/langgraph-bigtool) | `0bb7f9227d34` | 548 | MIT |
| 模板 | ReAct Agent | [langchain-ai/react-agent](https://github.com/langchain-ai/react-agent) | `7d1f9832f56d` | 797 | MIT |
| 教学 | LangGraph 101 | [langchain-ai/langgraph-101](https://github.com/langchain-ai/langgraph-101) | `d69ff6cbdf85` | 520 | MIT |
| UI | Agent Chat UI | [langchain-ai/agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui) | `d02580a1058d` | 2,993 | MIT |
| 完整应用 | Gemini Fullstack | [google-gemini/gemini-fullstack-langgraph-quickstart](https://github.com/google-gemini/gemini-fullstack-langgraph-quickstart) | `e34e569de465` | 18,259 | Apache-2.0 |
| 服务模板 | Agent Service Toolkit | [JoshuaC215/agent-service-toolkit](https://github.com/JoshuaC215/agent-service-toolkit) | `bfc148339163` | 4,377 | MIT |
| 部署 | Aegra | [aegra/aegra](https://github.com/aegra/aegra) | `d142457a95aa` | 1,059 | Apache-2.0 |
| 产品 Harness | DeerFlow | [bytedance/deer-flow](https://github.com/bytedance/deer-flow) | `693507870cae` | 77,198 | MIT |
| Java port | LangGraph4j | [langgraph4j/langgraph4j](https://github.com/langgraph4j/langgraph4j) | `7023d0dda0a6` | 1,821 | MIT |
| 索引 | Awesome LangGraph | [vonzosten/awesome-LangGraph](https://github.com/vonzosten/awesome-LangGraph) | `68509d7485a2` | 1,908 | CC0-1.0 |
| 对照 | Microsoft Agent Framework | [microsoft/agent-framework](https://github.com/microsoft/agent-framework) | `85c00fc55b6f` | 12,163 | MIT |
| 对照 | CrewAI | [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) | `985cf520283e` | 55,626 | MIT |
| 对照 | Pydantic AI | [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | `2776927ef70d` | 18,575 | MIT |
| 对照 | OpenAI Agents SDK | [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | `697a46c4baa2` | 27,945 | MIT |
| 对照 | Mastra | [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | `ff1ae2a4bf31` | 26,222 | 逐包复核 |

许可证列只是 GitHub API 与仓库快照的机器可见结果，不构成法律意见。Mastra 根仓 API 返回 `NOASSERTION`，其 README 说明不同目录可能使用不同许可证；复制代码前必须检查目标 package。

## 3. 候选发现与排除

### 搜索来源

- GitHub org/repository search。
- `topic:langgraph` 与 README/description 查询。
- Awesome LangGraph 索引。
- Exa 技术搜索。
- Twitter/X、Reddit、B 站方向性检索。

### 主要排除组

| 候选 | 未进入深度语料集的原因 |
|---|---|
| `deepagentsjs` | Deep Agents Python 已覆盖 harness 机制；TS 版本与 LangGraph.js 可按问题补读 |
| `langgraph-cua-py` | 垂直 computer-use 模板，未增加新的 runtime 原语 |
| `langchain-mcp-adapters` | 重要 integration，但重点是 MCP adapter，不是 graph 架构 |
| Redis/Postgres saver 单仓 | 核心 checkpoint 接口已纳入；具体 backend 在存储问题出现时精读 |
| SurfSense 等完整产品 | 产品价值高，但核心差异偏 RAG/业务，不扩展本轮 runtime 比较维度 |
| 大量 FastAPI production template | 与 agent-service-toolkit/Aegra 重叠；质量差异需运行验证，不能全收 |
| 普通课程/notebook | `langgraph-101` 已覆盖官方递进路线 |
| 已归档官方 demo | API 已迁移或被主仓/新模板吸收 |
| AutoGen / Semantic Kernel | Microsoft Agent Framework 是其后续统一方向，本轮优先当前项目 |
| Google ADK / Agno / smolagents | 都是有效对照，但为保持每个项目都能深入，冻结在五条互异路线 |
| LlamaIndex / Haystack / Dify | 更偏 RAG、pipeline 或平台，不是本轮 stateful graph 主轴 |

排除不代表项目不优秀，只代表它没有进入本轮“每仓都要做架构静态分析”的有限语料集。

## 4. 本地 clone 约束

### 为什么放 `research-worktrees/`

这些都是研究别人的第三方仓库：

- 每个目录保留自己的 `.git`。
- 父仓通过 `.gitignore` 忽略仓库本体。
- 父仓只保存恢复卡、pinned commit 和消化后的结论。
- 不把第三方源码通过嵌套目录误提交进 `intern-journal`。

### 为什么浅层 + partial clone + sparse checkout

21 个仓库的 GitHub API 标称 size 合计很大，Mastra、LangChain、CrewAI 等 monorepo 包含大量文档、测试、示例和多 package。当前策略保留：

- 当前研究 commit。
- origin/upstream 关系。
- 根目录文档。
- 核心实现、入口和关键测试目录。
- 后续按需取其他 blob 的能力。

需要历史时：

```bash
git -C research-worktrees/<slug> fetch --unshallow upstream
```

需要额外目录时：

```bash
git -C research-worktrees/<slug> sparse-checkout add <path>
```

### 当前主要 sparse 范围

| 项目组 | 已展开范围 |
|---|---|
| LangGraph | graph、pregel、channels、checkpoint、prebuilt、SDK、docs/examples |
| LangGraph.js | langgraph-core、langgraph、checkpoint、supervisor、swarm、SDK、examples |
| LangChain | v1 agent、middleware、core messages/runnables/tools/models |
| Deep Agents | deepagents、code、CLI、examples |
| 小型官方模式/模板 | 完整 checkout |
| DeerFlow | gateway、harness packages、tests、contracts、docs、frontend、skills |
| LangGraph4j | core、saver、LangChain4j、Spring AI、samples、studio |
| Microsoft AF | Python core/orchestrations、关键 samples、.NET core/workflows |
| CrewAI | CrewAI 与 crewai-core 的 src/tests |
| Pydantic AI | agent、pydantic_graph、examples、tests |
| OpenAI Agents | src、examples、tests |
| Mastra | core agent/workflow/memory/eval、workflow adapters、基础 examples |

## 5. 远端与分支约定

```text
origin   git@github.com:estelledc/<fork>.git
upstream https://github.com/<original-owner>/<repo>.git
branch   research-snapshot -> upstream/<default-branch>
```

研究更新流程：

```bash
git -C research-worktrees/<slug> fetch upstream
git -C research-worktrees/<slug> log --oneline HEAD..upstream/main
```

先看 diff，再决定是否快进和刷新材料。不要自动把个人 fork、local 和 upstream 三者强制同步。

## 6. fork 与 snapshot 的边界

- fork 只保存个人远端副本，不代表拥有上游版权之外的额外权利。
- 本地 `research-snapshot` 绑定上游 commit，不直接在该分支改第三方源码。
- 需要贡献时另建 feature branch，先阅读上游 CONTRIBUTING。
- 本轮没有向 fork 推送本地代码修改。
- 三个旧 fork 在研究期间可能与 upstream 有时间差；本材料以 pinned upstream commit 为事实源。

## 7. 恢复

每个仓库都有 `explorations/_meta/*.md` 项目卡。父仓结构审计：

```bash
python3 scripts/explorations/restore-projects.py --audit
```

单仓恢复卡中的 clone 命令只恢复个人 fork。恢复后还需：

```bash
git -C research-worktrees/<slug> remote add upstream <upstream-url>
git -C research-worktrees/<slug> fetch --depth 1 upstream <branch>
git -C research-worktrees/<slug> switch -c research-snapshot --track upstream/<branch>
```

恢复脚本默认 dry-run，`reference` 项目不参与默认批量恢复。

## 8. 单仓验证

```bash
git -C research-worktrees/<slug> status --short --branch
git -C research-worktrees/<slug> remote -v
git -C research-worktrees/<slug> rev-parse HEAD
git -C research-worktrees/<slug> sparse-checkout list
```

验收标准：

- worktree 干净。
- `origin` 是 `estelledc` fork。
- `upstream` 是表中原仓。
- HEAD 等于本表 pinned commit。
- 父仓 `git status` 不显示第三方源码。

## 9. 研究验证边界

本轮运行了父仓治理检查，但没有逐仓执行：

- dependency install
- unit test
- model call
- database migration
- Docker/Kubernetes deployment
- browser E2E

因此“架构存在”有源码证据，“运行主张在当前机器成立”仍需按具体问题单独验证。
