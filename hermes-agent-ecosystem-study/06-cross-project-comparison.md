# 06. 横向比较与判断

## 1. 不应使用单一排行榜

这些项目的模型、任务、硬件、工具权限、上下文和评测方法不同，不能把
README benchmark 或 star 合并成“谁最好”。更合理的是按约束选择。

本章用以下维度：

- 执行中心；
- 状态源真相；
- Memory；
- Skill；
- self-improvement；
- safety；
- deployment；
- code readability；
- ecosystem maturity。

## 2. 架构中心对比

| 项目 | 执行中心 | 长期控制平面 | 主要状态源 |
|---|---|---|---|
| Hermes | Python `AIAgent` | gateway | SQLite + Markdown + provider |
| OpenClaw | embedded agent core | long-lived Gateway | transcript DB + workspace files |
| nanobot | turn state machine | message bus/gateway | session store + Markdown |
| NanoClaw | provider SDK in container | host router/sweep | central + per-container SQLite |
| PicoClaw | Go AgentLoop/Pipeline | gateway | JSONL + config |
| ZeroClaw | Rust microkernel Agent | service/gateway | trait memory + config |
| IronClaw | shared agentic loop | job/chat/container delegates | event/memory DB |
| Agent Zero | Python monologue | Web/Docker process | project files + vector memory |
| Letta Code | backend Agent object | API/local backend | memory blocks + MemFS Git |
| Lethe | cortex + Actor runtime | Brainstem/API | SQLite-vec + Markdown + actor snapshots |
| GenericAgent | 100-line loop | frontend/scheduler | layered text/SOP/session files |
| 7/24 Office | Python tool loop | HTTP/router/scheduler | JSON + LanceDB |
| MetaClaw | LLM proxy | proxy + training scheduler | Skill/Memory store + checkpoints |
| Odigos | ReAct Executor | API + heartbeat | SQLite + Markdown brain |

### 判断

- Gateway-first 更适合多渠道和多设备；
- loop-first 更适合调试执行语义；
- SDK-wrapper 把模型行为质量外包给供应商；
- Actor 更适合长期、可恢复的并发任务；
- microkernel/trait 更适合可替换组件；
- 单进程最易部署，但容易形成共享资源争用。

## 3. Agent loop 对比

| 路线 | 项目 | 优点 | 风险 |
|---|---|---|---|
| 大型自研 loop | Hermes | provider/stream/tool 兼容最细 | 大文件和状态组合复杂 |
| 可复用 core + harness | OpenClaw | 低层循环与产品壳分离 | runtime/gateway glue 很多 |
| 显式状态机 | nanobot | 转移可测试、恢复清楚 | 状态数量随功能增长 |
| SDK delegate | NanoClaw | 核心小、Agent 质量高 | vendor/provider 依赖 |
| Pipeline / interface | PicoClaw | Go 接口明确 | 层数增加 |
| trait microkernel | ZeroClaw | 组件替换和类型安全 | 配置、crate 和 parity 成本 |
| delegate unified loop | IronClaw | chat/job/container 共用实现 | delegate contract 很重 |
| prompt protocol | Agent Zero | 可编辑、可扩展 | 强依赖模型遵循格式 |
| Actor | Lethe | durable并发与恢复 | actor state 和消息语义复杂 |
| 极简 generator loop | GenericAgent | 易读、易改 | 可靠性推给模型与 SOP |

## 4. Memory 对比

### 4.1 Memory 表示

| 项目 | 表示 | 检索 | 生命周期 |
|---|---|---|---|
| Hermes | SessionDB + Markdown + plugin | FTS/provider-specific | provider hooks + review |
| OpenClaw | MEMORY/daily Markdown + SQLite index | hybrid | flush + optional dreaming |
| nanobot | MEMORY/USER + history | prompt + consolidation | token/idle compact |
| PicoClaw | JSONL + summary | history/summary | truncate/compact |
| Thoth | PostgreSQL L0-L4 slice graph | vector+keyword+salience+recency | sentinel/curator/release |
| Mnemosyne OSS | SQLite BEAM + triples | vector+FTS+importance | TTL/sleep/invalidate |
| Letta Code | memory blocks + MemFS Git | backend/tool search | rewrite/dream/git |
| Lethe | Markdown + SQLite-vec | lexical+vector+recency | curator/heartbeat |
| 7/24 Office | JSON + LanceDB | embedding | LLM compress/dedup |
| MetaClaw | typed unit store | keyword/embedding/hybrid | consolidate/policy |
| Odigos | typed SQLite + graph + Markdown brain | RRF+links+recency | evolve/supersede/compile |

### 4.2 记忆质量门

从弱到强：

1. 直接 append 对话或事实。
2. prompt 要求 Agent 自觉筛选。
3. 写入 filter / dedup / secret detection。
4. typed memory、confidence、source、expiry、supersede。
5. 候选 pending + human/validator approve。
6. 多次使用、冲突与效用证据后 promotion。

样本中较好的做法：

- GenericAgent：No Execution, No Memory；
- Mnemosyne：core-level write filter + pending approval；
- Odigos：typed memory + conflict/link/evolution；
- Thoth：citation 到原始 slice；
- Letta：Git history；
- OpenClaw：action-sensitive memory 明确权限/过期/authority。

### 4.3 主要风险

- **Memory pollution**：一次错误进入所有未来 prompt。
- **Authority loss**：忘记某条信息来自用户、网页还是模型。
- **Temporal drift**：旧事实仍被高分召回。
- **Context duplication**：同一 memory 经多个 provider 注入。
- **Feedback loop**：Agent 生成的总结又被当成原始事实。
- **Privacy**：跨用户、跨 profile、跨 channel recall。

## 5. Skill 对比

| 项目 | 发现 | 创建 | 维护 | Admission / rollback |
|---|---|---|---|---|
| Hermes | metadata + explicit/auto | background review / tool | curator merge/archive | 部分；snapshot/restore |
| OpenClaw | resource manifest + Skill | workshop | plugin/workshop | install policy，生命周期仍在演进 |
| nanobot | metadata summary | skill-creator | 人工/Agent 更新 | validator + package |
| PicoClaw | registry | install/SkillForge | service/audit | source provenance/archive |
| ZeroClaw | 四来源 union | scaffold/SkillForge | shadow/audit/remove | audit drop + archive/purge |
| Agent Zero | description/tag | active Skill | 人工/plugin | review Skill，依赖 prompt |
| Letta Code | global/project/agent | creator/install | MemFS Git | Git rollback |
| GenericAgent | L1 index | task crystallization | SOP patch | 主要靠“已执行”原则 |
| MetaClaw | keyword/embedding | failed sample LLM | append/reload | 格式门强，效用门较弱 |
| Odigos | registry/JIT | code/Skill | maturity/verifier | surrogate verifier |

### 核心判断

一个完整 Skill 生命周期应为：

```text
evidence
 -> proposal
 -> verification
 -> admission
 -> organization
 -> retrieval/composition
 -> maintenance
 -> provenance/rollback
```

Hermes 覆盖最多阶段，但 verification/admission 仍是薄弱点。MetaClaw
有反馈驱动生成，却容易 Skill inflation。GenericAgent 写入纪律强，但独立
验证弱。Letta 的 Git provenance 强，但不自动证明 utility。

## 6. Self-improvement 对比

| 项目 | Memory 更新 | Skill 更新 | Harness 更新 | 参数更新 |
|---|---:|---:|---:|---:|
| Hermes | 是 | 是 | 外部仓部分 | 轨迹支持，非主 runtime 自动 |
| OpenClaw | 是 | workshop/dreaming 周边 | plugin/hook | 否 |
| Thoth | 是 | proposal only | recall weight tune | 否 |
| Mnemosyne OSS | 是 | 否 | memory policy | 否 |
| Mnemosyne harness | 是 | 是 | rule proposal/apply | training export |
| Letta Code | 是 | 是 | mods | 否 |
| GenericAgent | 是 | SOP/脚本 | 运行环境自举 | 否 |
| 7/24 Office | 是 | runtime tool | code audit/repair | 否 |
| MetaClaw | 是 | 是 | proxy/policy | LoRA/RL |
| Odigos | 是 | 是 | trial/promote/revert | 否 |

### 最严谨的实现形态

Odigos 的 trial 是本轮样本中最清楚的 scaffold 实验模型：

```text
checkpoint
 -> bounded trial
 -> collect enough evals
 -> compare baseline
 -> promote or revert
 -> record lesson
```

Hermes 官方 self-evolution 有 train/val/holdout 和 constraint，但当前
优化 metric 仍偏文本代理指标，完整测试也未接入主流程。

MetaClaw 的参数更新最激进，但也是最难验证与归因的路线。

## 7. 安全比较

### 7.1 五级模型

| 级别 | 含义 | 代表 |
|---|---|---|
| S1 | prompt + regex | GenericAgent 部分路径、早期手写 loop |
| S2 | approval + path + tool allowlist | Hermes、nanobot、PicoClaw |
| S3 | container / OS sandbox | NanoClaw、Agent Zero、ZeroClaw |
| S4 | capability sandbox + secret boundary | IronClaw |
| S5 | trust lineage + verifiable intent | Hermes CaMeL、ZeroClaw verifiable intent（仍在演进） |

安全不是单一等级，项目可能在一个维度 S4、另一个维度 S2。

### 7.2 凭证可见性

- 普通 env 注入：模型/工具进程可能看到值；
- display redaction：只防日志泄漏，不防工具读取；
- container secret：限制宿主，但容器内仍可能看到；
- host-boundary injection：工具只提交未签名请求，宿主注入 credential；
- delegated short-lived token：范围更小，但实现复杂。

IronClaw 的 host injection 是最值得复用的模式。

### 7.3 Prompt injection

防间接 injection 的关键不是关键词检测，而是：

1. 标出输入 provenance；
2. 外部数据不能提升自身权限；
3. 敏感动作只依据 trusted control；
4. tool capability 明确；
5. monitor trace；
6. enforcement fail closed；
7. memory/Skill 写入另有 admission gate。

Hermes CaMeL 已实现 1-6；第 7 项仍需与主线 Memory/Skill 生命周期整合。

## 8. 长任务与恢复

| 项目 | 中断 | checkpoint | 重启恢复 | 未完成任务是一等状态 |
|---|---|---|---|---|
| Hermes | steer/interrupt | session/tool progress | resume_pending | 部分 |
| OpenClaw | queue modes/abort | transcript/lane | restart recovery | task/commitment 在增强 |
| nanobot | stop/injection | runtime checkpoint | pending tool repair | sustained goal |
| NanoClaw | provider continuation | DB + heartbeat | container sweep | task series |
| PicoClaw | steering/hard stop | JSONL/meta | crash line repair | 一般 |
| ZeroClaw | cancellation | SOP/cron/state | service state | 较强 |
| IronClaw | signal | run state | event projections | job/thread |
| Lethe | actor message | actor snapshot | 自动恢复 Actor | 强 |
| Odigos | async task | task table/artifact | heartbeat worker | 强 |

Lethe 的 `GOAL/DONE/REMAINING/NEXT` 和 actor snapshot 是最直接的长期
工作模式；Hermes/nanobot 的 session 合法性与 tool-result 修复更偏
对话恢复。

## 9. 代码组织比较

### 最适合入门

1. GenericAgent `agent_loop.py`
2. OpenClaw `packages/agent-core/src/agent-loop.ts`
3. nanobot `AgentRunner` / state machine
4. PicoClaw `Pipeline`

先理解最小循环，再读完整产品，否则会把 gateway、provider 和 UI 复杂度
误认为 Agent 的本质。

### 最适合学生产可靠性

- Hermes：provider 方言、SessionDB、tool executor、cron；
- OpenClaw：gateway、lane、write lock、stream；
- nanobot：状态机、checkpoint、context governance；
- Lethe：durable actor/open work。

### 最适合学安全

1. IronClaw WASM + credential injection
2. ZeroClaw risk profile + sandbox
3. NanoClaw container + mount policy
4. Hermes CaMeL trusted/untrusted lineage
5. OpenClaw gateway pairing + exec approval

### 最适合学 memory

1. OpenClaw：文件可读的基础路线
2. Mnemosyne OSS：SQLite BEAM
3. Odigos：typed/RRF/link/evolution
4. Letta Code：MemFS Git
5. Thoth：完整认知 substrate

## 10. 成熟度判断

### 产品型

- OpenClaw
- Hermes
- nanobot
- Agent Zero
- NanoClaw
- PicoClaw
- ZeroClaw
- IronClaw

有持续更新、较大社区、完整入口和实际部署路径。

### 研究产品混合型

- Letta Code
- MetaClaw
- Mnemosyne OSS
- Lethe

有可运行产品，但核心价值仍紧贴 memory/learning/security 研究方向。

### 实验型或小规模

- Thoth
- Hermes RS
- Hermes CaMeL
- Hermes Meta-Harness
- Mnemosyne harness
- Odigos
- 7/24 Office

其中“实验型”不等于代码差，只表示社区、集成稳定性、长期维护或统一验证
证据不足。

## 11. 选择建议

### 想直接使用

- 需要最大生态和渠道：OpenClaw。
- 更在意 Memory/Skill 学习闭环：Hermes。
- 想要可读 Python：nanobot。
- 强容器边界并接受 Claude SDK：NanoClaw。
- 想要 Docker AI 工作台：Agent Zero。
- 边缘设备/Go：PicoClaw。
- Rust 与多 sandbox：ZeroClaw。
- 凭证安全和 WASM：IronClaw。

### 想研究或二次开发

- 研究长期 identity/memory：Letta Code。
- 研究 durable autonomous work：Lethe。
- 研究记忆生命周期：Thoth、Mnemosyne、Odigos。
- 研究 Skill 适应：Hermes、GenericAgent、MetaClaw。
- 研究 prompt injection：Hermes CaMeL。
- 研究 harness optimization：Hermes self-evolution、Meta-Harness。

## 12. 对自研系统的建议

最保守、可落地的组合是：

1. 用 100-300 行 loop 建立最小执行内核。
2. Tool schema、handler、approval 分离。
3. Session transcript 与长期 memory 分离。
4. 先用 Markdown/SQLite，不先上复杂认知图。
5. Skill 候选先进入 pending，验证后再 admission。
6. 长任务使用 durable goal/checkpoint。
7. 所有外部数据带 provenance。
8. 敏感工具使用 capability 和 host credential boundary。
9. 每次 scaffold 更新是有界 trial，必须有 baseline 和 rollback。
10. 在证明检索、写入和维护有效前，不宣称“self-evolving”。

## 13. 最终判断

Hermes Agent 的综合价值很高，但不是所有维度的最佳：

- Gateway/生态广度：OpenClaw 更强；
- 默认隔离：NanoClaw/ZeroClaw/IronClaw 更强；
- Git 化 identity/memory：Letta 更强；
- durable actor work：Lethe 更强；
- memory substrate 深度：Thoth/Mnemosyne/Odigos 更激进；
- 参数适应：MetaClaw 更直接；
- 最小可理解性：GenericAgent 更好。

Hermes 的独特组合是：

```text
完整可部署 runtime
+ 多渠道 gateway
+ provider 自由
+ MemoryProvider
+ SKILL.md
+ background review
+ curator
+ cron / subagent / trajectory
```

它是研究“个人 Agent 如何从一次性工具变成长周期系统”的最佳综合样本之一。
学习时应吸收其生命周期设计，同时用 IronClaw/ZeroClaw 的安全、Lethe 的
durable work、Odigos 的 trial/rollback 来补足它。
