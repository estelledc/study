---
title: "04. Hermes 直接生态项目"
sidebar:
  hidden: true
---
# 04. Hermes 直接生态项目

## 1. NousResearch/hermes-agent-self-evolution

### 定位

这是 Hermes 官方的外层优化仓，不是 Agent runtime。目标是用 DSPy +
GEPA 对 Skill、prompt、tool description 和代码做候选搜索。

### 当前架构

```text
current SKILL.md
  -> synthetic / golden / session-derived dataset
  -> DSPy GEPA or MIPROv2
  -> candidate Skill
  -> structural constraints
  -> holdout comparison
  -> output directory for human review
```

关键文件：

- `evolution/skills/evolve_skill.py`：完整入口；
- `evolution/core/dataset_builder.py`：数据集；
- `evolution/core/fitness.py`：评分；
- `evolution/core/constraints.py`：约束；
- `evolution/skills/skill_module.py`：Skill 表示；
- `tests/`：配置、constraint、importer 和 Skill module 测试。

### 已实现

- 只实现 Phase 1：Skill 文件优化；
- synthetic、golden、sessiondb 三类 eval source；
- train / validation / holdout；
- size、growth、frontmatter、non-empty 约束；
- baseline 与 evolved holdout 分数；
- 不通过约束的候选保存为 failed artifact，不部署。

### 重要限制

- README 写的 tool description、system prompt、代码 evolution 均是 planned。
- `--run-tests` 参数存在，但 `evolve()` 主流程没有调用
  `ConstraintValidator.run_test_suite()`；“全套 pytest 是必经门”在当前代码
  中并未兑现。
- `skill_fitness_metric()` 的优化热路径主要是 expected/output 词重合，
  不是完整任务执行。
- 改进结果只写 output，不自动开 PR。

### 研究价值

它示范了正确的外层形状：dataset、holdout、constraint、baseline、artifact。
但也说明“自演化”很容易先有架构图，再缺少执行级验证。

## 2. 0xNyk/awesome-hermes-agent

### 定位

独立生态目录，不是官方仓。它把 Hermes 周围的项目分成：

- 官方资源；
- Skill / plugin；
- Agent Skills 生态；
- memory provider；
- 工具与 UI；
- deployment；
- integrations；
- multi-agent；
- domain app；
- fork / derivative；
- guide / playbook。

### 设计特点

- 每项标 production / beta / experimental；
- 明确提醒“被收录不等于安全背书”；
- 强调先检查谁能触发、工具权限、执行位置、凭证和停止方式；
- 给出按成熟度和用途选择的入口。

### 研究价值

它证明 Hermes 已形成真实周边生态，但目录中的成熟度是编辑判断，
不是统一测试结果。研究时用它发现候选，不能用它代替源码审查。

## 3. Lumio-Research/hermes-agent-rs

### 定位

Hermes 的 Rust 重写，目标是单二进制、强类型并发、跨平台 gateway 和
Python 功能 parity。

### 代码组织

```text
crates/
  hermes-core          shared traits/types
  hermes-agent         agent loop, providers, memory
  hermes-tools         schemas, handlers, approvals
  hermes-gateway       channel adapters
  hermes-cron          scheduling
  hermes-skills        skill storage/hub
  hermes-mcp / acp     protocols
  hermes-intelligence  routing and self-evolution
  hermes-eval          benchmark/verifier
  hermes-server        HTTP/WebSocket/dashboard
  hermes-bus           in-process message bus
```

核心抽象在 `crates/hermes-core/src/traits.rs`：

- `LlmProvider`
- `ToolHandler`
- `PlatformAdapter`
- `TerminalBackend`
- `MemoryProvider`
- `SkillProvider`
- `AgentService`

### Agent loop

`crates/hermes-agent/src/agent_loop.rs`：

- model -> tool -> model；
- Tokio `JoinSet` 并行工具；
- provider failover；
- interrupt / steer；
- context / budget；
- plugin hook；
- memory manager；
- Skill review prompt；
- smart model routing。

### Memory 与 Skill

- `MemoryProviderPlugin` 对齐 Python MemoryProvider 生命周期；
- 同样限制一个外部 memory provider；
- SkillOrchestrator 扫描 `~/.hermes/skills/**/SKILL.md`；
- Skill frontmatter parser 是简化手写实现，不是完整 YAML；
- Skill 和 Python 版仍有 parity fixture。

### 安全

`hermes-tools/src/approval.rs` 用 denied / confirmation regex 处理 shell。
它比没有审批强，但和 ZeroClaw/IronClaw 的 sandbox/capability 不是同一层。

### 取舍

优点：

- crate 和 trait 边界清楚；
- 并发、错误和资源生命周期更易约束；
- 单二进制部署方向明确。

代价：

- 必须追逐 Python 主线功能；
- parity 会积累大量兼容代码；
- “零依赖”指运行时单二进制，不表示源码无第三方 crate；
- 社区和实战规模远小于 Python 主线。

## 4. 519lab/thoth-agent

### 定位

Thoth 以 Hermes 为基础，把 SQLite 状态层替换成 PostgreSQL 17 的
cognitive substrate。它不是普通插件，而是大规模 fork。

### 核心模型

最小原子是 **slice**：

- exteroceptive：用户/外界输入；
- self_action：Agent 的回复、工具、delegation；
- self_state：session、cron、后台决策。

层级：

| 层 | 内容 |
|---|---|
| L0 | raw perception slice |
| L1 | entity / relationship，引用 L0 |
| L2 | weighted association graph |
| L3 | pattern / abstraction |
| L4 | self-model / calibration / coherence |

后台 Agent：

- Sentinel：pending -> passed/quarantined；
- Curator：decay、release、embedding；
- Parser：L0 -> L1；
- Associator、Pattern-finder、Reflector；
- Critic：coherence；
- Dreamer；
- Conductor：按 backlog、coherence、预算调强度；
- SkillScout：从高 salience need 生成 Skill proposal。

### 记忆生命周期

```text
event -> slice
  -> sentinel
  -> parser + citation
  -> association / pattern / self-model
  -> recall projection
  -> salience reinforcement
  -> decay
  -> release / tombstone
```

召回混合：

- pgvector cosine；
- keyword Jaccard；
- salience；
- recency；
- token-budgeted composer；
- audit log；
- 可训练权重。

### 正确边界

- substrate 默认 additive、non-fatal；
- recall 默认关闭，需要显式开启；
- SkillScout 默认关闭；
- Skill 只能 propose，不能自动 install；
- Sentinel content defense 默认关闭；
- full cognitive crew 开启后会形成真实辅助模型成本；
- Conductor 是确定性负载治理，不是学习型执行器。

### 研究价值

这是正式样本里最完整的“事件溯源 -> 结构抽象 -> 遗忘 -> 自我模型”实现。
代价是 PostgreSQL、后台 worker、迁移和大量 cognitive metaphor 带来的复杂度。

## 5. mnemosyne-oss/mnemosyne

### 定位

一个 Hermes-first、也能通过 MCP/SDK 给其他 Agent 使用的本地记忆层。
不要与下一节 `atxgreene/Mnemosyne` 混淆。

### 核心架构

BEAM（Bilevel Episodic-Associative Memory）：

- working memory：热上下文、TTL；
- episodic memory：长期事件；
- scratchpad：短期推理记事；
- temporal TripleStore；
- SQLite + WAL + FTS5；
- 可选 sqlite-vec；
- binary embedding compression。

`mnemosyne/core/memory.py:129` 的 `Mnemosyne` 是 SDK facade；
`mnemosyne/core/beam.py` 是主存储和召回；
`hermes_memory_provider/__init__.py:1321` 是 Hermes 插件。

### Hermes 接入

实现 MemoryProvider：

- system prompt；
- prefetch；
- post-turn sync；
- session-end sleep；
- on_memory_write；
- memory/graph/persona/sync/scratchpad 工具；
- profile bank 隔离；
- write approval staging；
- PII-safe doctor；
- optional encrypted sync。

### 工程优点

- core-level write filter，所有入口共享；
- prefetch 过滤低质量片段、assistant transcript 和低 relevance 项；
- memory write approval 可先进入 pending；
- session-end 和 auto-sleep 有调用预算；
- provider-active refcount 防止 memory context 双注入；
- audit、diagnostics、export/import 较完整。

### 风险

- provider 文件非常大，工具和兼容面过宽；
- benchmark 数字是项目方口径，本轮未复现；
- “zero dependency”与可选 vector/MCP/embedding 功能需要区分；
- cognitive 名称容易让使用者高估语义可靠性。

## 6. atxgreene/Mnemosyne

### 定位

一个独立实验型认知 harness，不是上节 memory library 的旧版。两者
owner、数据库 schema、层级定义和产品边界都不同。

### 主要组成

- `mnemosyne_brain.py`：自研 agent loop；
- `mnemosyne_memory.py`：单 SQLite + FTS5 六层 memory；
- `mnemosyne_skills.py`：Skill registry；
- `harness_telemetry.py`：JSONL trace；
- `scenario_runner.py`、`harness_sweep.py`：评测与 grid search；
- `mnemosyne_triage.py`：错误聚类；
- `mnemosyne_proposer.py`：规则型 proposal；
- `mnemosyne_apply.py`：应用已接受 proposal；
- `mnemosyne_dreams.py`、`mnemosyne_compactor.py`、
  `mnemosyne_instinct.py`：离线抽象；
- `mnemosyne_train.py`：Hermes trajectory 格式导出。

### 六层记忆

| 层 | 代码含义 |
|---|---|
| L0 instinct | 从近期 user-pattern 聚类出的 fast path |
| L1 hot | 热工作记忆 |
| L2 warm | 默认写入层 |
| L3 cold | 长期事实 |
| L4 pattern | 聚类模式 |
| L5 identity | 人工批准的身份规则 |

它用 ACT-R 风格近似、kind decay multiplier、Jaccard/TF-IDF 聚类和
promotion/demotion 形成认知类比。

### “闭环”边界

已实现：

- telemetry -> triage；
- 规则 proposal；
- human-accepted proposal -> apply；
- scenario/sweep/metric；
- dream/compactor/instinct；
- benchmark artifacts。

不应夸大：

- proposer 明确是 hand-written rules，不是 agentic code optimizer；
- `harness_sweep.py` 明确不是 Stanford Meta-Harness proposer；
- 某些文档仍写“未来 proposer 缺失”，另一些写“完整闭环”，口径冲突；
- per-turn verification、完整 MCP/browser/channel 和成熟生产运行时不足；
- cognition / consciousness 主要是工程比喻和实验模块。

### 研究价值

适合学习小型可审计实验 harness：

- 所有事件留 JSONL；
- proposal 是 Markdown；
- apply 有人工门；
- benchmark 与产品功能并存；
- 会主动写“哪些尚未实现”。

不适合直接作为 Hermes 主线的成熟替代。

## 7. nativ3ai/hermes-agent-camel

### 定位

在 Hermes v0.12 左右分支上加入 CaMeL 风格信任边界，目标是阻止
网页、文档和工具结果中的隐藏指令授权敏感副作用。

### 信任模型

- trusted control：system、批准 Skill、用户 turn；
- untrusted data：工具输出和 retrieved context；
- sensitive capability：shell、文件写、消息、memory、cron、browser、
  delegation 等；
- authorization：只根据 trusted user history 构造能力计划。

### 运行策略

- 默认 disabled；
- monitor：记录违规但不阻止；
- enforce：未授权则阻止；
- classifier 只在“有不可信上下文 + 将执行敏感工具”时懒调用；
- classifier 失败时 fallback read-only；
- 不修改原始 tool result，靠 call/result lineage 推导来源；
- trace 保存 trusted request、source、flag、decision 和 response hijack。

核心：`agent/camel_guard.py`。

### 价值与限制

价值：

- 把“数据”和“控制”分开；
- 不让 retrieved text 自行授予写权限；
- monitor -> enforce 渐进上线；
- 有 deterministic 与 live-model attack fixture。

限制：

- 是较旧 Hermes fork，长期追主线成本高；
- capability plan 仍由 LLM classifier 生成；
- 不是完整 CaMeL/AgentDojo 复现；
- 对 Skill 本身、provider 和 host credential 的安全仍需其他层。

## 8. howdymary/hermes-agent-metaharness

### 定位

把 Hermes 当 benchmark backend，自己负责 candidate、archive、baseline、
comparison、frontier 和 search。

### 结构

```text
candidate
  -> Hermes benchmark runner
  -> archive manifest / summary / tasks
  -> baseline comparability check
  -> per-task delta
  -> frontier
  -> deterministic wrapper mutation
```

关键模块：

- `benchmark_runner.py`
- `archive_reader.py`
- `comparison.py`
- `comparability.py`
- `frontier.py`
- `mutation.py`
- `search.py`

### 正确做法

- 比较 baseline 与 candidate 的 exact task set；
- 保存 task selection hash；
- 报 improved、regressed、baseline-only、candidate-only；
- 记录 error summary 与 trace path；
- frontier 有跨平台 lock；
- search 中断也保存 partial summary。

### 当前阻塞

README 已明确：

- 它依赖 Hermes 旧的 Meta-Harness benchmark surface；
- Hermes v0.14 后主线已移除这些路径；
- 对当前主线运行前需要 Hermes-side port 或 restoration；
- 当前 mutation 只是 deterministic wrapper，不是自由重写 runtime。

### 研究价值

它比只看平均分更严谨，尤其值得复用 comparability 和 regression 报告；
但当前属于“架构和工具有效、对最新 Hermes 集成断开”的研究仓。

## 9. 直接生态的共同结论

| 项目 | 更新对象 | 验证门 | 回滚 | 当前成熟度 |
|---|---|---|---|---|
| self-evolution | Skill 文本 | structure + holdout；完整测试未接主流 | 输出 artifact | 早期官方实验 |
| hermes-agent-rs | 整体 runtime | Rust test + parity fixture | Git | 活跃重写 |
| Thoth | memory/state substrate | migration + agent tests + audit | DB/feature gates | 重型实验 fork |
| Mnemosyne OSS | memory provider | tests + doctor + project benchmark | DB/export | 活跃 memory 产品 |
| Mnemosyne harness | memory/Skill/config | scenario + rule proposal + human accept | proposal/apply history | 实验型 harness |
| CaMeL | tool authorization | deterministic/live attack cases | mode off/monitor | 安全实验 fork |
| Meta-Harness | benchmark harness candidate | paired task comparison | frontier/baseline | 集成已断开的研究工具 |

最重要的判断：

> Hermes 生态已经在探索从 Memory、Skill、安全、语言重写到 benchmark
> 外循环的多个方向，但没有一个单独项目同时解决“持续学习、严格验证、
> 强隔离、低成本和主线同步”。这些仍然是互补模块，不是已经收敛的终局。
