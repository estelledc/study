---
title: "06. 记忆与确定性治理"
sidebar:
  hidden: true
---
# 06. 记忆与确定性治理

本章回答两个问题：

1. Agent 如何跨会话保留“有用而不是更多”的记忆？
2. 如何让规范、代码和风险检查不只依赖模型自觉？

分析对象：

- Acontext
- memU
- claude-mem
- SpexCode
- OpenLore

## 1. 先区分五种路线

| 项目 | 记忆单元 | 选择方式 | 主要门禁 |
|---|---|---|---|
| Acontext | Agent Skill 文件 | Agent 主动 list/get | Skill writer 规则 |
| memU | Markdown recall file/segment/resource | embedding rank | 数据 schema |
| claude-mem | observation/session summary | hooks + hybrid search | worker lifecycle |
| SpexCode | living spec + Git history + eval | spec/code graph | linter + merge gate |
| OpenLore | code/decision/spec graph | static graph query | deterministic verdict |

它们并非互相替代：

- Acontext/memU/claude-mem 重点是“过去发生了什么、以后如何找回来”。
- SpexCode/OpenLore 重点是“当前意图和代码关系是否仍成立”。

## 2. Acontext

> 基线：`memodb-io/Acontext@259d73bfdebe`
> 技术栈：Python/FastAPI core、Go API、TypeScript/Python SDK、PostgreSQL、S3、Redis、RabbitMQ

### 核心观点

```text
Skill is Memory, Memory is Skill
```

Acontext 不把记忆藏在向量库中，而是让学习结果最终成为人可读、可编辑、可导出的 Skill 文件。

### 写入链路

```text
session messages
-> task complete/failed
-> LLM distillation
-> Skill Agent
-> update existing skill or create new skill
```

代码中有两个异步 consumer：

1. Distillation consumer。
2. Skill Agent consumer。

状态说明：

- [`src/server/core/acontext_core/schema/session/learning_space.py:8`](../repos/acontext/src/server/core/acontext_core/schema/session/learning_space.py)

Distillation 先确认 session 是否属于 learning space，再读取 task/messages，根据成功或失败选择 prompt，判断是否值得存：

- [`src/server/core/acontext_core/service/skill_learner.py:37`](../repos/acontext/src/server/core/acontext_core/service/skill_learner.py)
- [`src/server/core/acontext_core/service/controller/skill_learner.py:28`](../repos/acontext/src/server/core/acontext_core/service/controller/skill_learner.py)

Skill Agent 对同一 learning space 使用锁，防止并发写：

- [`src/server/core/acontext_core/service/skill_learner.py:124`](../repos/acontext/src/server/core/acontext_core/service/skill_learner.py)

它可以：

- get skill
- get skill file
- create skill
- create/move/delete/replace skill file

创建 Skill 时同时建立 Disk、AgentSkill、`SKILL.md` artifact，并加入 learning space：

- [`src/server/core/acontext_core/llm/tool/skill_learner_lib/create_skill.py:10`](../repos/acontext/src/server/core/acontext_core/llm/tool/skill_learner_lib/create_skill.py)

### 召回链路

Agent 通过：

- `list_skills`
- `get_skill`
- `get_skill_file`

逐层读取内容。README 明确不采用 semantic top-k，而是让 Agent reasoning 决定需要哪个 Skill。

### 防止记忆碎片

Skill learner prompt 要求：

- 先检查已有 Skill。
- 同域优先更新，不创建重复 Skill。
- 不创建只对应一次 bug 的狭窄 Skill。
- 用户事实写第三人称，防止另一个 Agent 把 “I” 当成自己。

源码：

- [`src/server/core/acontext_core/llm/prompt/skill_learner.py:41`](../repos/acontext/src/server/core/acontext_core/llm/prompt/skill_learner.py)
- [`src/server/core/acontext_core/llm/prompt/skill_learner.py:52`](../repos/acontext/src/server/core/acontext_core/llm/prompt/skill_learner.py)
- [`src/server/core/acontext_core/llm/prompt/skill_learner.py:134`](../repos/acontext/src/server/core/acontext_core/llm/prompt/skill_learner.py)

### 优势

- 最终记忆可读、可修改、可 Git 化。
- Skill 本身既是知识也是使用协议。
- 不需要为所有内容建立 embedding。
- 适合把“经验”转成可复用操作方法。

### 代价

- 写入需要 LLM distillation + Skill Agent，成本和误判都存在。
- 召回依赖 Agent 知道该 list/get 什么，可能漏召回。
- 自托管架构较重。
- Roadmap 仍标 `v0.0/v0.1`，稳定性和隐私能力在演进。

### 与 Trellis 的关系

Trellis 的 `update-spec` 是人工触发的知识回流；Acontext 是事件驱动的 Skill 记忆写入。Trellis 可以借鉴其“先查已有知识、避免一次事件生成一个新文件”的治理。

## 3. memU

> 基线：`NevaMind-AI/memU@9b2a70ca214c`
> 版本：`1.5.1` Beta
> 技术栈：Python 3.13、Pydantic、SQLModel、SQLite/Postgres、embedding providers

### 核心观点

memU 将核心缩到两个文件：

- `agentic.py`
- `service.py`

MemoryService 本身不调用生成式 LLM，只调用 embedding：

- [`src/memu/app/service.py:24-32`](../repos/memu/src/memu/app/service.py)

### 数据模型

```text
RecallFile
  name + track + description + content

RecallFileSegment
  文件内可搜索片段

Resource
  原始来源路径 + caption
```

track：

- `memory`
- `skill`
- resource 使用 `workspace`

### 三层检索

`progressive_retrieve(query)`：

1. query 只 embed 一次。
2. 以 cosine similarity 排 segment。
3. 把命中的 segment roll up 到 file。
4. 独立排 resource。

源码：

- [`src/memu/app/agentic.py:53-99`](../repos/memu/src/memu/app/agentic.py)
- [`src/memu/app/agentic.py:101-160`](../repos/memu/src/memu/app/agentic.py)
- [`src/memu/app/agentic.py:183-216`](../repos/memu/src/memu/app/agentic.py)

这里没有：

- intention routing
- sufficiency loop
- LLM summarization

因此检索行为更简单、成本更可预测。

### 增量索引

提交 RecallFile 后：

- 新文件 embed `name: description`。
- memory track 按非空、非 heading 行切 segment。
- skill track 用一个 `name + description` segment。
- 保留未变化 segment 的向量。

- [`src/memu/app/agentic.py:295-359`](../repos/memu/src/memu/app/agentic.py)

### Record/Inject 两条接缝

Host adapter：

- Record：定时读取宿主 session logs，生成 job files，由 Agent 自己提炼 Markdown，再 commit。
- Inject：修改宿主 instruction file，要求回答前 retrieve。

Bridging pipeline 明确把中间提炼留给 Agent：

- [`src/memu/hosts/bridging/pipeline.py:1-9`](../repos/memu/src/memu/hosts/bridging/pipeline.py)
- [`src/memu/hosts/bridging/pipeline.py:28-77`](../repos/memu/src/memu/hosts/bridging/pipeline.py)
- [`src/memu/hosts/bridging/pipeline.py:80-90`](../repos/memu/src/memu/hosts/bridging/pipeline.py)

### 优势

- 核心算法小，可审计。
- 一个共享 store 服务多个 Agent。
- embedding-only，避免每次检索生成式调用。
- segment/file/resource 三层输出便于渐进展开。
- SQLite 本地模式和 Postgres 多用户模式可选。

### 代价

- “哪些内容值得保存”仍由宿主 Agent 提炼。
- embedding 相似度不等于当前任务真正需要。
- instruction patch 只能提示 Agent retrieve，不能保证它执行。
- Python 3.13 门槛较高。

### 与 Trellis 的关系

Trellis `mem` 更轻、无索引、直接查原始历史；memU 更适合长期跨 Agent 召回。二者可以分工：

```text
Trellis mem = 取回原始会话证据
memU        = 取回已提炼的跨 Agent 记忆
```

## 4. claude-mem

> 基线：`thedotmack/claude-mem@f5633c1f8418`
> 版本：`13.11.0`
> 技术栈：TypeScript、Bun、Express、SQLite、Chroma、MCP、React

### 核心观点

claude-mem 追求全自动：

```text
hook 捕获 -> worker 处理 -> observation/summary -> future context/search
```

### 分层架构

```text
Claude/Coding Agent hooks
-> CLI hook handlers
-> local worker daemon
-> SQLite structured data
-> Chroma vector index
-> MCP search + UI
```

官方架构：

- [`docs/architecture-overview.md:1-29`](../repos/claude-mem/docs/architecture-overview.md)

### Hook lifecycle

主要事件：

- SessionStart
- UserPromptSubmit
- PostToolUse
- Summary/Stop
- SessionEnd

数据流：

- prompt 注册 session 和 semantic context。
- tool use 进入 pending queue。
- SDK Agent 生成 observations。
- 写 SQLite、同步 Chroma、推 SSE。
- Stop 生成 summary。

- [`docs/architecture-overview.md:31-63`](../repos/claude-mem/docs/architecture-overview.md)

### Worker 与容错

关键策略：

- worker 连接失败不阻塞 Coding Agent。
- client bug/4xx 可返回 blocking。
- generator crash 最多指数退避重启。
- pending queue 在 valid parse 后清除。
- observation 用 content hash + 30 秒窗口去重。

- [`docs/architecture-overview.md:65-112`](../repos/claude-mem/docs/architecture-overview.md)

### 搜索

SearchOrchestrator：

- 无 query 的 filter-only 使用 SQLite。
- 有 query 且配置 Chroma 时使用 semantic。
- platform-scoped Chroma 空结果时 fallback SQLite。
- file lookup 使用 hybrid。

- [`src/services/worker/search/SearchOrchestrator.ts:25-81`](../repos/claude-mem/src/services/worker/search/SearchOrchestrator.ts)
- [`src/services/worker/search/SearchOrchestrator.ts:89-149`](../repos/claude-mem/src/services/worker/search/SearchOrchestrator.ts)

MCP 对用户推荐三层使用：

```text
search compact index
-> timeline around hits
-> get_observations full details
```

### 优势

- 自动化程度最高。
- observation、summary、search、timeline、UI 完整。
- 适合大量会话和真实使用历史。
- 多语言和多 Agent 适配快速扩展。
- 测试面很大。

### 代价

- 运行组件最多：Bun、worker、SQLite、Chroma、MCP、provider。
- 自动捕获可能保存噪声或敏感信息。
- 生成 observation 需要模型，成本和事实误差需管理。
- “Claude-Mem” 名称与多 Agent 目标之间存在品牌/边界漂移。
- README 的架构描述仍以 Claude Code 为中心，源码已扩展到更宽平台。

### 与 Trellis 的关系

Trellis `mem` 是 read-only recall 工具，claude-mem 是主动采集和压缩系统。Trellis 若集成类似能力，应保持“raw evidence”和“AI summary”两层来源标记，避免摘要被当成事实。

## 5. SpexCode

> 基线：`shuxueshuxue/Spexcode@fc28137d77ba`
> 版本：`0.4.1`
> 技术栈：Node 22、TypeScript、Hono、tmux、Git worktree、React

### 核心观点

```text
Git is the database.
Spec and code land together.
```

### Spec tree

每个 `.spec/<node>/spec.md`：

- title/status
- `code:` 主治理对象
- `related:` 相关文件
- raw source（人批准）
- expanded spec（Agent 维护）

节点目录形成语义树，不必镜像源码目录。

### Git 版本模型

- spec version = 改动该 spec 文件的 commit 数。
- 历史 = `git log`。
- Agent session 通过 commit trailer 归因。
- spec body 只描述当前意图，禁止 changelog heading。

### Linter

关键规则：

- integrity
- one-govern
- id-format
- mention
- living
- altitude
- coverage
- anchor drift
- code drift

代码显式使用 `git ls-files` 而不是原始目录遍历，避免把 node_modules、build 和嵌套 worktree 当源码：

- [`spec-cli/src/lint.ts:83-99`](../repos/spexcode/spec-cli/src/lint.ts)

spec/code 所有权和 coverage：

- [`spec-cli/src/lint.ts:135-174`](../repos/spexcode/spec-cli/src/lint.ts)

living/altitude：

- [`spec-cli/src/lint.ts:241-258`](../repos/spexcode/spec-cli/src/lint.ts)

drift 以 Git DAG ancestry 判断，不用时间戳：

- [`spec-cli/src/lint.ts:368-395`](../repos/spexcode/spec-cli/src/lint.ts)

### Session Manager

worktree 是持久单元，tmux 是可丢弃 runtime handle。Session record 放在全局 store，不污染 worktree：

- [`spec-cli/src/sessions.ts:16-45`](../repos/spexcode/spec-cli/src/sessions.ts)

状态拆成两个正交轴：

- lifecycle：active/idle/awaiting/parked/error/asking/queued
- liveness：online/starting/offline/unknown

人负责 merge/close，Agent 只提出 proposal。

并发上限来自项目配置，超出后创建 durable queued worktree：

- [`spec-cli/src/sessions.ts:51-73`](../repos/spexcode/spec-cli/src/sessions.ts)

### Eval

`eval.md` 定义用户视角场景，reading 保存：

- actual/expected
- pass/fail
- code SHA
- scenario hash
- evidence

Freshness 同时检查：

- code 是否变。
- scenario contract 是否变。
- remark 是否解决后重新测。
- anchor commit 是否仍可证明。

- [`spec-eval/src/freshness.ts:84-113`](../repos/spexcode/spec-eval/src/freshness.ts)
- [`spec-eval/src/freshness.ts:116-170`](../repos/spexcode/spec-eval/src/freshness.ts)

### 优势

- spec/code 同 commit 的约束非常清楚。
- Git 原生版本、归因和 drift。
- worktree/session/liveness 建模细致。
- eval 把“规范”与“真实用户表面证据”连起来。
- 多数关键规则由 linter 执行，不只靠 prompt。

### 代价

- 项目很新、采用量小、快速变化。
- 需要 tmux，Windows 依赖 WSL2。
- 要维护 `.spec` tree 和 code ownership。
- 部分 linter 规则（altitude、breadth）是启发式。
- 每次改代码都同步 spec 可能产生文档负担。

### 与 Trellis 的关系

Trellis 的 spec 是工程规则，SpexCode 的 spec 是业务/模块当前意图。两者解决不同问题。SpexCode 对 Trellis 最大启示是：

- spec 和实现需要明确绑定。
- 完成证据要有 freshness。
- lifecycle 与 liveness 不应混为一个 status。

## 6. OpenLore

> 基线：`clay-good/OpenLore@1294c359898a`
> 版本：`2.1.5`
> 技术栈：TypeScript、Tree-sitter、SQLite、MCP、React/Vite

### 核心观点

```text
Deterministic, local-first, no LLM in the hot path.
```

它把代码、IaC、spec 和架构决策投影到同一图中。

### 三层

1. Static Analysis：调用图、复杂度、资源、依赖。
2. Spec & Governance：living specs、ADR、drift、certificate。
3. Agent Runtime：MCP 查询和 verdict。

### 静态分析

代码通过 Tree-sitter 和语言 extractor 构建：

- function nodes
- call edges
- imports
- routes
- tests
- IaC resources
- decisions

产物：

- SQLite graph store。
- 约 600 token 的 `CODEBASE.md` digest。

### Orient 与图查询

`orient(task)` 尝试一次返回：

- 相关函数。
- callers。
- specs。
- tests。
- insertion points。
- risk。

其他工具包括：

- analyze impact
- trace execution
- select tests
- dead code
- structural diff
- change coupling
- env/error impact

### 确定性治理

OpenLore 的关键区别是输出 verdict，而不是让 LLM自由判断：

- `check_architecture`：import 是否违反声明规则。
- `verify_claim`：confirmed/refuted/unverifiable + receipt。
- `change_impact_certificate`：diff 是否新打开到敏感边界的路径。
- `certify_public_surface`：breaking/non-breaking/potentially-breaking。
- `enforce`：按 policy 映射 blocking/advisory/off。

`enforce` 默认 advisory，只有用户把 finding code 映射为 blocking 才阻止 commit：

- [`src/cli/commands/enforce.ts:2-17`](../repos/openlore/src/cli/commands/enforce.ts)
- [`src/cli/commands/enforce.ts:291-326`](../repos/openlore/src/cli/commands/enforce.ts)

### Epistemic Lease

OpenLore 不只问“索引多久没更新”，还跟踪：

- orient 后经过的时间。
- Agent 跨模块移动轨迹。
- 累积认知负载。
- repo 是否变化。

当 lease 下降，MCP 响应附带“事实可能过期”的提示。它是 advisory，不直接命令模型。

### 文档漂移

需要注意：`docs/ARCHITECTURE.md` 仍以早期“reverse-engineer OpenSpec specs”的五阶段 pipeline 为中心：

- [`docs/ARCHITECTURE.md:5-16`](../repos/openlore/docs/ARCHITECTURE.md)

当前 README 和源码已经扩展为 72 个 MCP tools、静态治理、IaC、decision graph。研究时应以当前 source/README 为主，把该架构文档视为历史核心而非完整现状。

### 优势

- 确定性和可复核性最强。
- 无需 API key 即可获得大部分核心价值。
- 明确披露 shallow task 可能负收益。
- 代码、IaC、decision 和 spec 使用同一图。
- verdict 与 evidence receipt 适合高自主 Agent。

### 代价

- 项目新、功能面极大，维护风险高。
- 静态调用图天然有动态语言、反射和运行时分派盲区。
- 72 tools 会增加 MCP schema token 和选择难度，因此需要 preset。
- 很多 benchmark 是项目自测，仍需独立复现。
- 早期架构文档已落后于产品面，说明文档同步压力。

### 与 Trellis 的关系

OpenLore 不管理完整 Plan/Execute/Finish，而是给 Harness 提供“结构事实与确定性 guardrail”。它最适合作为 Trellis 的底层能力：

```text
Trellis 决定当前阶段和角色
OpenLore 提供相关代码、影响范围、测试和规则 verdict
```

## 7. 三种 Memory 的真实差异

| 问题 | Acontext | memU | claude-mem |
|---|---|---|---|
| 保存什么 | 提炼后的 Skill | recall files/resources | observations/summaries |
| 谁提炼 | 后端 LLM + Skill Agent | 宿主 Agent | worker SDK Agent |
| 怎么找 | Agent 主动逐层读取 | embedding rank | SQLite/Chroma hybrid |
| 是否可读 | 高 | 高 | 中 |
| 基础设施 | 重 | 轻中 | 重 |
| 自动化 | 高 | 中 | 最高 |
| 主要风险 | Skill 写错/漏召回 | 相似度误召回 | 噪声、隐私、复杂度 |

## 8. 确定性治理成熟度

```text
Prompt reminder
  "请记得更新 spec"
        |
        v
File presence gate
  "没有 spec.md 不能继续"
        |
        v
Schema / graph gate
  "依赖未完成，artifact blocked"
        |
        v
Git ancestry / hash gate
  "代码领先 spec 3 commits"
        |
        v
Static verdict / evidence receipt
  "此 diff 新打开到敏感边界的路径"
```

Trellis 当前主要处于 file presence + task status + prompt verification；SpexCode/OpenLore 展示了下一步可补的确定性层。

## 关键思考点

1. 记忆应该自动写，还是只有明确确认的内容才能进入长期层？
2. embedding 检索到“相似”信息时，如何证明它仍然适用？
3. spec/code 同提交是否会逼迫 Agent 写低质量文档来过门禁？
4. 静态图的 `unverifiable` 应该阻断，还是只警告？
5. Harness 的状态、Memory 的事实和代码图的事实发生冲突时，谁优先？
6. Epistemic Lease 能否用于 Trellis 的 journal/spec，而不仅是代码图？
