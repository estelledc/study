---
title: "来源、Fork 与源码快照"
sidebar:
  hidden: true
---
# 来源、Fork 与源码快照

## 1. 快照原则

本轮结论以本地固定 commit 为源真相。GitHub 仓库会继续更新，因此复查结论时先确认
当前 checkout 是否仍是下表 commit。

所有源码：

- 位于 `research-worktrees/<slug>/`；
- 是独立 Git 仓库；
- `origin` 指向个人 fork；
- `upstream` 指向 canonical 仓库；
- 被父仓 `.gitignore` 忽略；
- 当前工作树在收集完成时为 clean。

## 2. 14 个正式快照

| slug | 上游 | 个人 fork | 本地分支 | 固定 commit | 大小约 |
|---|---|---|---|---|---:|
| `lambchat` | [Yanyutin753/LambChat](https://github.com/Yanyutin753/LambChat) | [estelledc/LambChat](https://github.com/estelledc/LambChat) | `main` | `f520f4b55b09` | 36 MB |
| `deepagents` | [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | [estelledc/deepagents](https://github.com/estelledc/deepagents) | `main` | `d46a2cb033b8` | 44 MB |
| `langgraph` | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | [estelledc/langgraph](https://github.com/estelledc/langgraph) | `research-snapshot` | `49ae27c2ae98` | 16 MB |
| `deepagents-backends` | [DiTo97/deepagents-backends](https://github.com/DiTo97/deepagents-backends) | [estelledc/deepagents-backends](https://github.com/estelledc/deepagents-backends) | `main` | `be319b5774ac` | 3.1 MB |
| `opsintech-platform` | [OpsinTech/opsintech-platform](https://github.com/OpsinTech/opsintech-platform) | [estelledc/opsintech-platform](https://github.com/estelledc/opsintech-platform) | `main` | `5474b29d40bc` | 160 MB |
| `deepagentforce` | [TW-NLP/DeepAgentForce](https://github.com/TW-NLP/DeepAgentForce) | [estelledc/DeepAgentForce](https://github.com/estelledc/DeepAgentForce) | `master` | `0acbbb250441` | 33 MB |
| `dify` | [langgenius/dify](https://github.com/langgenius/dify) | [estelledc/dify](https://github.com/estelledc/dify) | `research-snapshot` | `48e536ba3914` | 203 MB |
| `librechat` | [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) | [estelledc/LibreChat](https://github.com/estelledc/LibreChat) | `main` | `20cd00c492a8` | 52 MB |
| `openclaw` | [openclaw/openclaw](https://github.com/openclaw/openclaw) | [estelledc/openclaw](https://github.com/estelledc/openclaw) | `main` | `44314c94514d` | 445 MB |
| `project-agi` | [margadeshaka/project-agi](https://github.com/margadeshaka/project-agi) | [estelledc/project-agi](https://github.com/estelledc/project-agi) | `main` | `d08c4d328458` | 4.5 MB |
| `mcp-gateway-registry` | [agentic-community/mcp-gateway-registry](https://github.com/agentic-community/mcp-gateway-registry) | [estelledc/mcp-gateway-registry](https://github.com/estelledc/mcp-gateway-registry) | `main` | `597ef3c75204` | 91 MB |
| `preloop` | [preloop/preloop](https://github.com/preloop/preloop) | [estelledc/preloop](https://github.com/estelledc/preloop) | `main` | `ec98f7550063` | 55 MB |
| `lobu` | [fuxingloh/lobu](https://github.com/fuxingloh/lobu) | [estelledc/lobu](https://github.com/estelledc/lobu) | `main` | `b067a9440a8a` | 50 MB |
| `loomcycle` | [denn-gubsky/loomcycle](https://github.com/denn-gubsky/loomcycle) | [estelledc/loomcycle](https://github.com/estelledc/loomcycle) | `main` | `410919ec4361` | 31 MB |

合计约 1.3 GB。

### LangGraph 与 Dify 的特殊说明

GitHub token 没有 `workflow` scope，而两个上游包含 workflow 变更，GitHub 的 fork
服务端同步无法快进。本轮没有扩大 token 权限，而是：

1. clone 个人 fork；
2. 添加 canonical `upstream`；
3. fetch 上游固定 commit；
4. 创建本地 `research-snapshot` 分支。

因此它们的 `HEAD` 比个人 fork 的 `origin/main` 新：

| 项目 | 研究 HEAD | `origin/main` |
|---|---|---|
| LangGraph | `49ae27c2ae98` | `9100f2c68203` |
| Dify | `48e536ba3914` | `0df30dd2691c` |

项目卡的 `pinned_commit` 记录研究 HEAD，`last_remote_main` 如实记录个人 fork 主分支，
不能把两者混为一谈。

## 3. 核心源码入口

### LambChat

```text
src/api/routes/chat.py
src/infra/task/manager.py
src/infra/task/executor.py
src/agents/core/base.py
src/agents/fast_agent/nodes.py
src/agents/search_agent/nodes.py
src/infra/tool/mcp_client.py
src/infra/tool/mcp_global.py
src/infra/mcp/{storage,quota,encryption}.py
src/infra/backend/skills_store.py
src/infra/skill/{middleware,storage,marketplace}.py
src/infra/memory/
src/infra/sandbox/
src/infra/storage/checkpoint.py
frontend/src/hooks/useAgent/{sseConnection,eventHandlers,eventProcessor,historyLoader}.ts
```

### DeepAgents

```text
libs/deepagents/deepagents/graph.py
libs/deepagents/deepagents/backends/protocol.py
libs/deepagents/deepagents/backends/composite.py
libs/deepagents/deepagents/middleware/filesystem.py
libs/deepagents/deepagents/middleware/subagents.py
libs/deepagents/deepagents/middleware/skills.py
libs/deepagents/deepagents/middleware/memory.py
libs/deepagents/deepagents/middleware/summarization.py
```

### LangGraph

```text
libs/langgraph/langgraph/graph/state.py
libs/langgraph/langgraph/pregel/main.py
libs/langgraph/langgraph/pregel/_loop.py
libs/langgraph/langgraph/pregel/_runner.py
libs/langgraph/langgraph/types.py
libs/langgraph/langgraph/stream/
libs/checkpoint/langgraph/checkpoint/base/__init__.py
libs/checkpoint/langgraph/store/base/__init__.py
```

### deepagents-backends

```text
src/deepagents_backends/
tests/unit/
tests/integration/
benchmark/
```

### OpsinTech Platform

```text
backend/docs/ARCHITECTURE.md
backend/app/gateway/auth.py
backend/app/agent/terminal_graph.py
backend/packages/harness/deerflow/agents/lead_agent/agent.py
```

### DeepAgentForce

```text
src/services/conversational_agent.py
src/services/skill_disclosure.py
src/services/tool_disclosure.py
src/services/mcp_integration.py
src/services/sandbox/
```

### Dify

```text
api/core/workflow/workflow_entry.py
api/core/workflow/nodes/
api/core/workflow/nodes/agent/
api/core/agent/cot_agent_runner.py
api/core/agent/fc_agent_runner.py
api/core/mcp/
```

### LibreChat

```text
api/server/controllers/agents/
packages/api/src/agents/
packages/api/src/mcp/
packages/api/src/skills/
packages/api/src/stream/
packages/data-provider/src/config.ts
```

### OpenClaw

```text
packages/agent-core/src/agent-loop.ts
src/agents/embedded-agent-runner/
src/gateway/
src/skills/
src/memory/
```

### project-agi

```text
ARCHITECTURE.md
packages/agi-core/
packages/agi-sdk/
packages/agi-packs/
distribution/agi-runtime/
distribution/agi-auth/
distribution/agi-ui/
packs/
```

### MCP Gateway Registry

```text
docs/design/theory-of-the-system.md
registry/
auth_server/
credentials-provider/
docker/
frontend/
```

### Preloop

```text
ARCHITECTURE.md
backend/preloop/services/policy/
backend/preloop/api/
backend/preloop/models/
backend/preloop/sync/
runtime-plugins/
frontend/src/
```

### Lobu

```text
docs/SECURITY.md
packages/gateway/
packages/worker/
db/migrations/
docker/
charts/lobu/
```

### Loomcycle

```text
cmd/loomcycle/main.go
internal/loop/
internal/connector/
internal/tools/
internal/store/
internal/auth/
internal/mcp/
internal/channels/
adapters/
proto/
```

## 4. 广度搜索记录

2026-07-16 使用 GitHub CLI 搜索：

```text
deep agent
multi tenant agent
mcp gateway
agent sandbox
agent platform skills mcp
```

搜索用于发现候选，不直接作为架构结论。GitHub 复合查询会按关键词交集过滤，过窄时
可能返回空集，因此本轮同时使用较宽的分层查询，并将候选按
[纳入标准](01-scope-and-corpus.md#2-纳入标准) 二次筛选。

## 5. Fork 与恢复

本轮 14 个正式样本均已存在于 `estelledc` 个人账号，其中 11 个为本轮补建，3 个为
已有 fork 后复核关系。恢复单个仓库的通用方式：

```bash
git clone --depth=1 --filter=blob:none \
  git@github.com:estelledc/<fork-name>.git \
  research-worktrees/<slug>

git -C research-worktrees/<slug> remote add upstream \
  https://github.com/<upstream-owner>/<upstream-repo>.git
```

大文件策略：

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone ...
```

具体仓库名、路径和 commit 以 `explorations/_meta/<slug>.md` 为准。

## 6. 复核命令

### 检查本地 HEAD、分支和 remote

```bash
git -C research-worktrees/<slug> rev-parse HEAD
git -C research-worktrees/<slug> branch --show-current
git -C research-worktrees/<slug> remote -v
git -C research-worktrees/<slug> status --short
```

### 检查父仓忽略

```bash
git check-ignore research-worktrees/<slug>/README.md
```

### 检查全部项目卡与本地仓

```bash
python3 scripts/explorations/restore-projects.py --check
python3 scripts/explorations/restore-projects.py --audit
```

### 检查研究材料

```bash
make lint
make check
git diff --check
```

## 7. 证据使用注意

- GitHub 元数据会变化，源码结论以固定 commit 为准；
- README 和 `ARCHITECTURE.md` 可能含目标形态；
- 未运行完整部署的功能只描述静态实现，不声称生产验证通过；
- 研究材料不保存 token、内部路径或第三方源码副本；
- clone 可删除重建，父仓工件才是长期可交接材料。
