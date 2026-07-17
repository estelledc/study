# 02. 领域生态与发展现状

## 1. 领域定位

本轮项目属于“长期个人 Agent harness”而不是传统 chatbot，也不是
单纯的 multi-agent framework。最小定义是：

> 一个长期运行的控制系统，把可替换的 LLM 包在上下文、工具、状态、
> 权限、渠道和调度层中，使它能跨会话接收消息、执行动作并积累可复用
> 经验。

日常类比：

- LLM 是临时来值班的决策者；
- harness 是办公室制度、档案柜、工具间和门禁；
- gateway 是前台与总机；
- memory 是档案；
- Skill 是标准作业程序；
- cron/heartbeat 是闹钟和巡检；
- sandbox/approval 是门禁与审批；
- eval/rollback 是试运行和回退机制。

类比的边界是：LLM 并没有稳定人格或真实长期状态。连续性来自外部
系统在每次调用前重新组装信息。

## 2. 技术栈的九层模型

### 2.1 交互层

CLI、TUI、Web、Telegram、Discord、Slack、WhatsApp、飞书等负责
接收输入和展示流式输出。关键问题不是“支持多少渠道”，而是：

- 渠道身份是否映射到正确用户；
- 群聊是否按成员或线程隔离；
- 同一用户跨渠道是否共享记忆；
- 回复、媒体和工具进度是否有可靠投递语义。

代表：

- Hermes、OpenClaw：多渠道 gateway；
- NanoClaw：channel 与 agent group 分离；
- Lethe：Telegram/API 共用一个 Brainstem；
- Agent Zero：Web 工作台和 Docker 桌面优先。

### 2.2 Gateway / control plane

长期 daemon 管理连接、会话路由、并发 lane、pairing、健康检查、
重启和定时任务。

- OpenClaw 把 Gateway 放在系统中心；
- Hermes 把 `AIAgent` loop 放在核心，gateway 是外层入口；
- nanobot 用 message bus + 显式 turn state machine；
- NanoClaw 的宿主只管 DB、channel、container 和 delivery。

### 2.3 Agent loop

最小循环是：

```text
assemble context
  -> call model
  -> model returns text or tool calls
  -> authorize and execute tools
  -> append tool results
  -> call model again
  -> persist outcome
```

不同项目主要在四处变化：

- 工具是串行、并行还是按副作用分段；
- 用户中途消息是 steer、interrupt、queue 还是开新 turn；
- 超限时是截断、压缩、checkpoint 还是强制文本结束；
- loop 由自研代码、通用 core、Actor 还是 Claude/Codex SDK 承担。

### 2.4 Tool / capability

2026 年的主流不再是把所有 JSON Schema 永久塞进 prompt，而是：

- tool registry；
- toolset / capability profile；
- JIT schema injection；
- MCP 动态接入；
- 执行前审批；
- 结果预算与大输出落盘；
- side-effect-aware 并发。

工具定义回答“能做什么”，但不回答“什么时候、按什么流程做”。
后者逐渐交给 Skill。

### 2.5 Skill / procedural memory

[Agent Skills 规范](https://agentskills.io/specification) 把 Skill 定义为
至少包含一个 `SKILL.md` 的目录：

- YAML frontmatter 的 `name`、`description`；
- Markdown 程序性说明；
- 可选 `scripts/`、`references/`、`assets/`；
- 通过 metadata -> full body -> resource 三阶段渐进披露。

它和 MCP 的分工是：

- MCP：Agent 能访问什么；
- Skill：Agent 应该怎样工作；
- A2A：不同 Agent 怎样协作。

Hermes 的价值不只在“支持 SKILL.md”，而在尝试建立 Skill 生命周期：

```text
experience
  -> background review
  -> create / patch skill
  -> later retrieval
  -> curator merge / archive
```

但一个完整动态 Skill 系统还需要：

- 候选与已接纳状态分离；
- write-time 验证；
- 使用率和真实效用分离；
- 去重、合并、废弃和回滚；
- 来源、作者、测试和权限可追踪。

### 2.6 Memory / context

Memory 至少有四种不同对象：

1. **对话历史**：本次会话的完整消息与工具结果。
2. **语义事实**：偏好、人物、项目、决策等长期知识。
3. **情景记忆**：某次任务做过什么、结果如何。
4. **程序性经验**：怎样完成一类任务，通常更适合 Skill。

当前项目形成三条路线：

- **文件优先**：OpenClaw 的 `MEMORY.md` + daily notes；
- **数据库检索**：Hermes SessionDB、Mnemosyne、Odigos、Lethe；
- **认知分层**：Thoth L0-L4、Mnemosyne 多层、Letta memory blocks。

外部研究把 memory 演进概括为：

```text
Storage -> Reflection -> Experience
```

即先保存轨迹，再提炼轨迹，最后跨轨迹抽象出可迁移经验。

### 2.7 Scheduler / proactivity

长期 Agent 从“被动回答”走向：

- cron：在准确时间启动明确任务；
- heartbeat：周期性检查状态；
- proactive loop：从记忆、目标和未完成工作中主动找机会；
- sleep/dream：离线压缩、整理或反思；
- background worker：异步 subagent、索引、评测、记忆维护。

风险是把“定期运行”误称为“自主性”。真正的主动性还要求：

- 明确的目标与退出条件；
- 预算；
- 低噪声机会选择；
- 限频；
- 可取消和可追踪；
- 不用新任务掩盖旧任务未完成。

### 2.8 Security / isolation

长期 Agent 的威胁面远大于普通聊天：

- 模型可调用 shell、文件、浏览器和消息工具；
- 外部网页或文档可能携带间接 prompt injection；
- Skill 和插件本身是可执行供应链；
- 多用户渠道可能发生跨会话泄露；
- 记忆污染会把一次攻击变成长期行为；
- 自动调度会把错误重复放大。

安全强度可分五层：

1. 提示词警告和危险命令正则。
2. 工具 allowlist、路径限制、审批和凭证脱敏。
3. 独立进程或容器。
4. OS sandbox / WASM capability sandbox。
5. 数据与控制分离、宿主边界凭证注入、可验证意图。

代表：

- NanoClaw：每 agent group 独立容器；
- ZeroClaw：risk profile + 多种 OS sandbox；
- IronClaw：WASM + host credential injection；
- Hermes CaMeL：不让不可信工具结果授权敏感动作。

### 2.9 Evaluation / evolution

评测不能只看最终回答。长期 Agent 至少要测：

- 任务成功率；
- 工具调用正确性与回合数；
- 成本、延迟和缓存命中；
- 记忆召回、冲突、过期和遗忘；
- Skill 提议、接纳、使用、修复和退役；
- prompt injection、越权和凭证泄露；
- 多会话连续性；
- 更新前后 regression；
- rollback 是否真实可用。

2026 年 agent evaluation 的明显趋势是从静态单轮指标转向真实、动态、
长周期和可执行 benchmark；但 memory 与 self-improvement 仍缺少统一、
可比较的长期评测。

## 3. “自我改进”的五层分类

### L1：状态记忆

把事实、偏好、任务和对话写到外部存储。未来能 recall，但执行策略没变。

代表：OpenClaw memory、Hermes MemoryProvider、Lethe、Odigos。

### L2：经验抽象

把多轮对话压缩成总结、模式或较高层知识。

代表：Hermes background review、Thoth Parser/Pattern-finder、
Mnemosyne sleep/dream、OpenClaw dreaming。

### L3：程序性 Skill

把成功或失败经验写成可复用流程，并在未来按需加载。

代表：Hermes、GenericAgent、MetaClaw、nanobot skill creator。

### L4：Harness / scaffold 优化

基于 trace、分数或 correction 修改 prompt、路由、工具描述、Skill、
控制参数或代码；需要评测和回滚。

代表：

- Hermes self-evolution 的 Skill GEPA；
- Hermes Meta-Harness 的 candidate search；
- Odigos 的 trial/promote/revert；
- Mnemosyne harness 的 triage/proposer/apply。

### L5：模型参数更新

通过 SFT、偏好优化、RL 或 LoRA 把经验内化到模型权重。

代表：MetaClaw 的 GRPO/LoRA 路线、Hermes 轨迹导出与训练工具。

这五层成本、风险与可逆性不同。L1-L3 通常更新快、可审计、可回滚；
L4 会改变控制系统；L5 更新慢且归因最难。严谨材料必须说清“改了哪一层”。

## 4. 2025-2026 的主要演进

### 4.1 从框架库转向可部署 Agent 产品

早期 LangChain/CrewAI/AutoGen 更像开发库；新一代项目直接交付：

- CLI/TUI/Web；
- 多渠道 gateway；
- 会话、memory 和 scheduler；
- provider 切换；
- 插件与 Skill；
- 安全和部署。

### 4.2 从固定 prompt 转向持久 scaffold

系统不再只优化一段 system prompt，而是把：

- context assembly；
- tool surface；
- memory policy；
- skill library；
- routing；
- approvals；
- compaction

视为可演进的整体。

### 4.3 从“记得更多”转向“记得更对”

主要问题从存储容量转为：

- 是否值得写；
- 是否来自可信证据；
- 是否与旧事实冲突；
- 何时过期；
- 如何检索；
- 是否应该上升为 Skill；
- 能否故意忘记。

### 4.4 从插件扩展转向开放协议分层

- Agent Skills 标准化程序性知识；
- MCP 标准化工具与数据连接；
- A2A 尝试标准化跨 Agent 协作；
- ACP 把 Agent 接入编辑器和客户端。

规范正在形成，但安装目录、权限语义、Skill 安全与组合行为仍未完全统一。

### 4.5 从“模型能力”转向“运行时可靠性”

项目中的高密度工程工作集中在：

- provider 方言适配；
- tool call 修复；
- transcript 合法性；
- 流式中断；
- timeout 和 retry；
- session lock；
- crash recovery；
- context budgeting；
- delivery 去重；
- stale state 修复。

这说明真实 Agent 的瓶颈常常不是“模型不会思考”，而是系统状态不一致。

## 5. 生态矩阵

| 主路线 | 代表项目 | 核心押注 | 主要代价 |
|---|---|---|---|
| 功能广度 | OpenClaw、Hermes | 一个系统覆盖渠道、工具、调度、记忆 | 代码体量和状态组合爆炸 |
| 可读小核心 | nanobot、GenericAgent | 少量核心概念即可理解和改造 | 部分可靠性靠模型或约定 |
| 容器隔离 | NanoClaw、Agent Zero | 执行环境边界清晰 | 启动、资源与运维成本 |
| 微内核/trait | PicoClaw、ZeroClaw、Hermes RS | provider/tool/channel 可替换 | 抽象数量和 parity 成本 |
| 安全机制 | IronClaw、Hermes CaMeL | 权限与凭证成为架构对象 | 使用复杂度、性能和生态规模 |
| 记忆优先 | Letta Code、Lethe、Thoth、Mnemosyne | Agent 连续性来自外部认知状态 | 写入污染、召回成本和认知类比风险 |
| 参数适应 | MetaClaw | Skill 快更新 + RL 慢更新 | 评测、训练、归因和回滚复杂 |
| 实验型自改进 | Odigos、Mnemosyne harness | 明确 trial/proposal/apply | 成熟度与真实部署证据不足 |

## 6. 当前共识与未解决问题

### 较强共识

- 模型必须可替换，状态不能只活在模型上下文里。
- Memory、Skill、Tool 是不同对象，应分层治理。
- 大工具集需要渐进披露和 JIT 选择。
- 长任务需要 checkpoint、durable task state 和 crash recovery。
- 自动写入必须有预算、验证、去重和可追踪来源。
- 安全要靠运行时机制，不只靠 system prompt。

### 仍未解决

- 怎样证明 Skill 库增长带来净收益，而不是检索污染？
- 怎样在不丢失重要信息的前提下实现真正遗忘？
- 怎样防止不可信内容通过 memory/Skill 形成长期 prompt injection？
- 怎样统一衡量任务收益、成本、安全和长期连续性？
- 多 Agent 共享记忆时，谁有写权限和事实裁决权？
- 自动 self-modification 的 admission gate 应由规则、模型还是人控制？
- 参数训练与外部 Skill 哪种适应真正迁移到新任务？

## 7. 对 Hermes 的领域定位

Hermes 位于生态中间偏“完整产品 + 程序性学习”一侧：

- 比 GenericAgent、nanobot 更完整，也更复杂；
- 比 OpenClaw 更强调经验转 Skill 和 MemoryProvider；
- 比 Letta/Thoth 更少采用强认知模型；
- 比 NanoClaw/IronClaw 更少把隔离设为第一架构原则；
- 比 MetaClaw 更偏外部 scaffold 更新，而不是参数训练；
- 比 Odigos 更有社区、渠道和实际产品成熟度。

它最值得学习的不是某个工具，而是如何把 agent loop、gateway、
MemoryProvider、SKILL.md、cron 和 background review 接成一个长期系统。
它最需要质疑的则是：Skill 写入的质量门和长期效用证据是否足够。
