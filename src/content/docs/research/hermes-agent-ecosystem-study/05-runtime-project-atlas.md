---
title: "05. 同类运行时项目图谱"
sidebar:
  hidden: true
---
# 05. 同类运行时项目图谱

## 1. OpenClaw

### 架构中心

OpenClaw 是 **Gateway/control-plane first**：

- 单个长期 Gateway 拥有 messaging surface；
- CLI、Web、macOS、node 和 automation 通过 WebSocket 接入；
- session lane 串行化同一会话；
- runtime 作为 Gateway 调度的执行组件。

`docs/concepts/architecture.md` 给出 Gateway 合约；
`docs/concepts/agent-loop.md` 描述完整 turn；
`packages/agent-core/src/agent-loop.ts:172` 是可复用 loop。

### Agent core

低层 `runAgentLoop()` 使用双层循环：

- 内层处理 tool call 与 steering；
- 外层处理 turn 结束后到达的 follow-up；
- tool 可声明 `executionMode=sequential`；
- 否则并行执行，并保持结果顺序；
- 所有步骤发 event，由上层 runtime/gateway 投影。

OpenClaw 已把早期依赖的 Pi Agent core 内化为
`packages/agent-core/`。外部 `pi-tui` 只剩终端组件用途。

### Memory

- `MEMORY.md`：压缩长期记忆；
- `memory/YYYY-MM-DD*.md`：daily working layer；
- 默认 SQLite 索引，混合关键词/向量搜索；
- 可切 QMD、Honcho、LanceDB 等 provider；
- compaction 前 memory flush；
- dreaming 默认关闭，按 recall frequency/diversity/score 做 promotion；
- memory-wiki 提供 claims/evidence/contradiction 层。

### 扩展与安全

- 大量 provider、channel、memory 和 tool extension；
- plugin hook 覆盖 prompt、tool、session、message、gateway；
- gateway device pairing、auth、idempotency key；
- per-session write lock；
- exec approval、sandbox、secret、audit ledger。

### 对 Hermes 的启示

OpenClaw 的优势是 control plane、渠道广度和插件生态；Hermes 的差异是
更强调 Skill/Memory 学习闭环。两者正在互相吸收：OpenClaw 已有
Skill workshop、dreaming、active memory，Hermes 也在强化 gateway 和 UI。

## 2. HKUDS/nanobot

### 核心结构

nanobot 用显式 turn state machine 代替一个巨大 while loop：

```text
RESTORE -> COMPACT -> COMMAND -> BUILD -> RUN -> SAVE -> RESPOND -> DONE
```

定义在 `nanobot/agent/loop.py:238`，每个 state 有单独 handler。

### 主要模块

- `agent/runner.py`：模型/工具回合；
- `agent/context.py`：identity、memory、Skill、bootstrap；
- `agent/context_governance.py`：修复 tool call/result 与预算；
- `agent/memory.py`：Markdown memory、archive、consolidation、dream；
- `agent/skills.py`：Skill metadata 与按需加载；
- `agent/subagent.py`：异步子任务；
- `bus/`：inbound/outbound/runtime event；
- `gateway/`、`channels/`：渠道；
- `session/`：turn、goal、visibility；
- `security/`：workspace 与 network policy。

### 特点

- session 级 runtime checkpoint；
- 中断后为 pending tool 补错误结果；
- sustained goal 进入 prompt 并允许自动 continuation；
- token-triggered consolidation；
- Skill creator 与 ClawHub；
- MCP 动态接入；
- WebUI 与 API 一体。

### 取舍

它早期以“小核心”著称，但当前功能已明显增长。相比 Hermes：

- 状态机更清楚；
- Python 文件更模块化；
- provider、gateway、WebUI 能力仍完整；
- 认知和自改进机制较克制；
- 强隔离不如 NanoClaw/IronClaw。

## 3. nanocoai/nanoclaw

### 核心押注

NanoClaw 不自研完整 LLM loop，而是：

```text
host process
  -> central SQLite routing
  -> one container per agent group
  -> agent-runner poll loop
  -> provider SDK
```

主线 provider 是 Claude Agent SDK；Codex/OpenCode 以 Skill 安装方式扩展，
不是 trunk 默认实现。

### 隔离模型

三种共享级别：

1. 多 channel 共用一个 conversation；
2. 同 agent、不同 session，共享 workspace/memory；
3. 不同 agent group，容器和数据完全分开。

Host 只负责：

- central DB；
- channel adapter；
- route；
- delivery poll；
- container sweep；
- CLI socket。

容器内：

- inbound DB 只读；
- outbound DB 自己写；
- agent workspace；
- global memory 只读；
- provider continuation；
- NanoClaw MCP tools；
- memory hook。

### 安全

- 容器内 provider 可用 bypass permission，因为容器是主边界；
- additional mount 必须经过宿主外部 allowlist；
- `.ssh`、`.aws`、`.env`、credential 等路径默认 block；
- symlink 与 container path 需要 realpath/path traversal 检查；
- unknown sender、channel 和 approval 是独立模块。

### 取舍

优势：安全模型直观、每组隔离、核心宿主较小。

代价：

- 依赖 container runtime；
- Agent 质量和工具语义依赖 provider SDK；
- 多 provider parity 不是主线内建；
- 容器资源和启动延迟高于单进程。

## 4. sipeed/picoclaw

### 架构

PicoClaw 是 Go 单体，但内部按接口和 pipeline 拆分：

- `pkg/agent`：AgentLoop、Pipeline、turn state；
- `pkg/providers`：LLM provider；
- `pkg/tools`：tool registry；
- `pkg/channels`：渠道；
- `pkg/bus`：消息；
- `pkg/memory`：JSONL Store interface；
- `pkg/skills`：多 registry 安装和加载；
- `pkg/isolation`：子进程隔离；
- `pkg/evolution`：runtime event bridge。

### Prompt 与状态

PromptRegistry 将来源显式分成：

- identity；
- context files；
- tool discovery；
- Skill catalog；
- active Skill；
- memory；
- channel/runtime metadata。

每个 part 带 layer、slot、placement 和 cache policy。这个设计比字符串
拼接更适合做稳定前缀和审计。

### Memory

- JSONL transcript；
- per-session lock；
- meta/alias；
- summary；
- crash recovery，损坏行跳过；
- append 时 fsync；
- compact/rewrite；
- 不依赖外部数据库。

### Isolation

- 默认关闭；
- Linux：bwrap，缺失时 fail，不静默降级；
- Windows：restricted token、low integrity、job object；
- 只隔离子进程，不隔离 PicoClaw 主进程。

### 取舍

适合边缘设备和可移植部署；代码比 OpenClaw/Hermes 更容易沿接口理解。
但“轻量”已经不等于“小功能”，provider/channel/hardware 组合仍很大。

## 5. zeroclaw-labs/zeroclaw

### 架构

ZeroClaw 走 Rust microkernel：

- root crate 保留 CLI 和兼容层；
- `zeroclaw-runtime` 管 Agent、cron、skills、heartbeat、approval；
- memory、provider、channel、tools、gateway 各有 crate；
- risk profile 将 Agent 与 sandbox/autonomy policy 绑定。

### Agent 与工具

`zeroclaw-runtime/src/agent/agent.rs:326` 的 `Agent` 聚合：

- `ModelProvider`；
- `Vec<Box<dyn Tool>>`；
- `Arc<dyn Memory>`；
- observer；
- prompt builder；
- tool dispatcher；
- skills；
- security summary；
- SOP engine；
- approval route。

工具执行有：

- static + activated tool；
- per-turn exclusion；
- cancellation；
- pending/terminal tool event；
- HMAC receipt；
- structured output；
- approval channel；
- observer trace。

### Skill

`SkillsService` 是 CLI、gateway、dashboard 共用源真相：

- workspace / open-skills / plugin / bundle 四来源；
- source provenance；
- shadowed Skill；
- audit drop；
- 只有 bundle Skill 可写；
- remove 支持 archive/purge；
- SkillForge 做 scout/evaluate/integrate。

### Sandbox

按平台自动选：

- Linux：Landlock -> bwrap -> Firejail -> Docker；
- macOS：Seatbelt -> Docker；
- Windows：AppContainer experimental -> Docker。

autonomy policy 决定“是否能运行”，sandbox 决定“运行后能访问什么”。

### 取舍

这是最系统的可替换 runtime 之一，但 crate 和配置数量很大。
Rust 安全不自动等于 Agent 安全，仍需要网络、凭证、approval 和 prompt
injection 层共同工作。

## 6. nearai/ironclaw

### 架构中心

IronClaw 是安全优先 Agent OS。统一 loop 在
`src/agent/agentic_loop.rs:215`，Chat、Job、Container 通过
`LoopDelegate` 自定义：

- signals；
- LLM call；
- tool execution；
- approval；
- cost guard；
- compaction；
- final response。

统一 loop 内置：

- tool-intent nudge；
- truncated call recovery；
- repeated failing call fingerprint；
- warning 后强制 text-only；
- max iteration。

### WASM capability sandbox

第三方工具编译成 Wasmtime component：

- registration 时 compile；
- execution 时 fresh instance；
- fuel、memory、timeout；
- epoch interruption；
- threads disabled；
- host API 只暴露声明能力；
- network allowlist。

### 凭证边界

WASM 工具请求 HTTP 时不拿真实密钥：

```text
WASM request
  -> host matches host/path credential mapping
  -> decrypt secret
  -> inject header/query
  -> execute request
```

因此工具和模型都不必看到 credential value。

### Memory 与安全

- conversation/action memory；
- raw 与 sanitized output 分存；
- secret pattern leak detector；
- network allowlist；
- command injection；
- process/container sandbox；
- per-tool capability；
- approval CAS record。

### 取舍

这是正式样本中安全边界最强、最值得借鉴的设计之一。代价是：

- 工具开发需要 WIT/WASM；
- 部署和调试复杂；
- extension 生态小于 OpenClaw/Hermes；
-安全规则和 host proxy 成为关键可信计算基。

## 7. agent0ai/agent-zero

### 架构

Agent Zero 是 Docker Linux 工作台，而不是消息 gateway 优先产品：

- `agent.py`：核心 monologue loop；
- `prompts/`：行为协议；
- `tools/`：动态 Python 工具；
- `plugins/`：Browser、Desktop、Office、Memory、Skills、Time Travel；
- `helpers/`：持久化、模型、Docker、MCP、A2A；
- `webui/`：主要交互面。

### Loop

`Agent.monologue()`：

- 组装 prompt；
- 调模型；
- 解析 structured function call 或脏 JSON；
- 找 MCP 或本地 tool class；
- before/after extension；
- 工具结果回历史；
- `response` 工具结束。

支持上级/下级 Agent，上级通过 `call_subordinate` 获取返回。

### 主要价值

- 完整 Linux desktop 和 browser；
- 文档协作；
- project 级 workspace/memory/secret；
- 100+ plugin hub；
- prompt、tool、plugin 可查看和修改；
- Time Travel 为 Agent 工作区提供快照。

### 局限

- core 使用动态 import 和 prompt protocol，类型/边界弱于 Rust 项目；
- Docker 容器是主隔离，但 host connector 会重新扩大权限；
- memory 文档明确承认长期记忆未解决，需要人工清理；
- 项目文档把深层架构外包给 DeepWiki，本地架构说明较弱。

## 8. letta-ai/letta-code

### 架构中心

Letta Code 是 stateful Agent harness：

- Agent 身份与 memory block 是一等对象；
- API backend 与 experimental local backend 共享 `Backend` 接口；
- MemFS 把 context 变成可用 Git 管理的文件系统；
- Mods 可扩展 provider、tool、event、UI 和 permission。

### Memory

- persona/human/project 等 memory files；
- agent-scoped Skill 存在 MemFS；
- memory repo 可同步到 GitHub；
- filesystem 与 server blocks 双向 sync；
- 冲突需要显式处理；
- dreaming / sleeptime 做离线整理；
- message search 支持跨 Agent/会话。

### 扩展

- global、project、agent 三层 Skill；
- built-in Skill creator；
- general/fork/recall/history/reflection subagent；
- mods package registry；
- mod learning harness；
- local/cloud backend；
- cron 与多 channel。

### 取舍

优点：长期 identity、memory 和 git provenance 很强。

代价：

- client、server、cloud、local、MemFS 多种模式增加心智负担；
- 本地 backend 仍标 experimental；
- 一些 remote/multi-env 功能依赖 Constellation；
- “自我修改 harness”通过 trusted local mods 完成，安全依赖来源治理。

## 9. alien-id/lethe

### 架构

Lethe 用认知器官类比组织 Rust runtime：

- cortex：用户 turn；
- hippocampus：混合召回；
- actor system：Kameo subagent；
- brainstem：heartbeat/proactivity；
- DMN：后台反思；
- tool registry；
- Telegram/API transport。

### 长任务状态

最有价值的设计是把未完成工作设为一等状态：

- todo 自动进入 prompt；
- Actor 每次变化都 snapshot；
- 重启恢复 goal、state、budget 和 checkpoint；
- max turn 时强制 `GOAL/DONE/REMAINING/NEXT`；
- successor Actor 可续接。

### Memory

- Markdown identity/human/project；
- notes；
- SQLite-vec message/archival；
- lexical + vector + recency；
- internal/tool search 结果过滤；
- recall payload 有字符和行预算。

### Proactivity

Brainstem 是唯一 heartbeat 源，transport 只是 subscriber，避免多渠道
重复触发。主动通知经过：

- open-work check；
- heuristic；
- aux review；
- daily cap；
- cooldown；
- outbox。

### 取舍

Actor + durable unfinished work 对长期任务很强；认知命名可读，但要避免把
工程组件当成真实心智。项目较新，测试和社区规模小。

## 10. lsdefine/GenericAgent

### 架构

核心 `agent_loop.py:42` 只有约百行：

- 调 LLM；
- 遍历 tool call；
- `BaseHandler.dispatch()` 映射 `do_<tool>`；
- tool result 回传；
- checkpoint / long-term update；
- 无工具或无 next prompt 时结束。

模型 session 自己保留历史，loop 每轮只构造新 user + tool result。

### 最小工具与记忆

原子工具：

- code；
- file read/write/patch；
- real browser scan/JS；
- ask user；
- working checkpoint；
- long-term update。

Memory：

- L0 meta rules；
- L1 <=30 行索引；
- L2 环境事实；
- L3 SOP/script；
- L4 raw session。

Memory SOP 提出很强的 “No Execution, No Memory”：

- 只有成功工具结果能写长期事实；
- 不存猜测和易变状态；
- verified data 可压缩、迁移，不能无证据删除。

### 自演化

“自演化”主要是：

- Agent 安装依赖和写脚本；
- 将已验证流程固化为 SOP；
- L1 索引；
- 下次直接复用。

### 风险

- `code_run` 与真实浏览器权限很强；
- 没有默认强 sandbox；
- 核心无单测；
- 自动 crystallize 的质量主要靠 prompt/SOP，而非独立 verifier；
- 极简 loop 把大量复杂性推给模型、session provider 和 memory 文件。

适合学习最小 Agent 原理，不宜未经加固直接承担高风险自动化。

## 11. wangziqi06/724-office

### 架构

纯 Python 生产型个人 Agent：

- HTTP callback；
- multi-tenant Docker router；
- hand-written tool loop；
- 36 tool；
- cron；
- MCP；
- LanceDB memory；
- runtime tool creation；
- nudge；
- audit。

### Memory

三阶段：

1. session JSON；
2. LLM 压缩成结构化 fact；
3. embedding + LanceDB retrieval。

还有 `MEMORY.md` section compaction、stale fact invalidation 和 per-user table。

### Nudge

`nudge.py` 把常见“说了但没做”编码为结构规则：

- 搜地点但没发 location card；
- 说“记住了”但没 write file；
- 说“已安排”但没 schedule；
- 有结构化数据但没 render page。

每条规则有限次触发，避免无限循环。

### 价值与限制

价值是工程实战密度：multi-tenant、回调、媒体、scheduler、memory、诊断
都在少量文件中。

限制：

- secret/config 在进程内；
- 动态 Python tool 与 exec 风险高；
- LanceDB + embedding API 不是真正零依赖；
- README 中生产声明和 benchmark 本轮未复现；
- v1 Python 与 v2 Node 并存，架构正在迁移。

## 12. aiming-lab/MetaClaw

### 架构中心

MetaClaw 不是完整 Agent UI，而是透明 LLM proxy：

```text
personal Agent
  -> MetaClaw OpenAI/Anthropic-compatible proxy
  -> retrieve + inject Skills/Memory
  -> upstream LLM
  -> collect trajectories/reward
  -> skill evolve and optional RL
```

它可自动改 OpenClaw、CoPaw、IronClaw、PicoClaw、ZeroClaw、NanoClaw、
NemoClaw 和 Hermes 的 provider 配置。

### 双速适应

- 快速：每个 session 提取/生成 Skill；
- 中速：memory 提取、consolidation、policy optimization；
- 慢速：在 sleep/idle/calendar window 做 GRPO/LoRA。

### Skill

SkillManager：

- template keyword 或 embedding retrieval；
- general / task-specific / common mistake；
- generation counter；
- top-k。

SkillEvolver：

- 分析 reward <= 0 的样本；
- LLM 生成 1-3 个 Skill；
- 避免重复名字；
- JSON parse + required field；
- 写 history。

### Memory

- typed unit；
- incremental flush；
- summary；
- keyword/embedding/hybrid；
- dedup/conflict；
- consolidation；
- telemetry；
- memory policy store；
- promotion/decay/reinforcement。

### 风险

- Skill admission 主要是格式和 LLM 生成质量；
- 训练 reward、support/query 分离和长期 regression 非常复杂；
- 透明 proxy 能观测大量敏感对话；
- auto-config 会修改多个 Agent 的本机配置；
- RL 模式依赖外部训练后端和成本。

它是正式样本中最明确连接 Skill 外部化和模型参数内化的项目。

## 13. tamler/odigos

### 架构

单进程、单 SQLite，但功能分层明确：

- `core/agent.py`：入口和 session lock；
- `core/executor.py`：ReAct loop；
- `core/evolution.py`：trial；
- `core/subagent.py`：异步 specialist；
- `memory/`：typed memory、graph、recall、evolution；
- `heartbeat/`：proactive/background；
- `tools/`：JIT registry；
- `skills/`：validator 和 maturity。

### Memory

- fact/preference/task/idea/entity/summary/general；
- sqlite-vec + FTS5；
- Reciprocal Rank Fusion；
- type-aware routing；
- recency decay；
- link expansion；
- entity graph；
- brain compiler 把知识输出为 Markdown wiki。

### Subagent

- persona 文件；
- 独立 prompt、tool whitelist、model；
- async pending task；
- heartbeat worker 执行；
- concurrency key；
- success/failure chain；
- 禁止递归 subagent；
- workspace root。

### Evolution

`EvolutionEngine`：

```text
checkpoint
  -> create time-boxed trial
  -> override prompt/routing/skill/param
  -> collect evaluator scores
  -> delta vs baseline
  -> promote or revert
  -> record success/failure pattern
```

这是比“直接 patch Skill”更严谨的 scaffold 更新模型。

### 限制

- 项目非常新、star 极少；
- 功能面大于维护者/社区规模；
- README 的 140+ tests 与已展开源码测试丰富，但本轮未安装执行；
- single-process 简洁，但 heavy background、Web、memory、subagent 都争用同一
  runtime；
- multi-tenant 和生产成本口径是项目方声明。

## 14. 运行时选择的本质

这些项目不是在做同一道单选题，而是在不同约束下选择：

| 如果最看重 | 优先研究 |
|---|---|
| 渠道和完整产品 | OpenClaw、Hermes |
| Python 可读状态机 | nanobot |
| 强容器隔离 | NanoClaw、Agent Zero |
| Go 单二进制和边缘 | PicoClaw |
| Rust 可替换 sandbox | ZeroClaw |
| 凭证不可见与 WASM | IronClaw |
| identity / git memory | Letta Code |
| 持久未完成任务 | Lethe |
| 最小自演化原理 | GenericAgent |
| 生产型手写 loop | 7/24 Office |
| Skill + RL 双速学习 | MetaClaw |
| trial/promote/revert | Odigos |
