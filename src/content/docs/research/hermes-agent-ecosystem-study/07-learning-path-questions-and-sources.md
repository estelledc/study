---
title: "07. 学习路线、思考点与来源"
sidebar:
  hidden: true
---
# 07. 学习路线、思考点与来源

## 1. 推荐学习路线

不要同时精读 22 个仓库。按“最小循环 -> 产品可靠性 -> Memory/Skill ->
安全 -> 自我改进”的顺序更容易建立稳定认知。

### 阶段 A：先看 Agent 的最小本质

1. `projects/GenericAgent/agent_loop.py`
   - 约百行模型/工具循环。
   - 重点：tool call 怎样变成下一轮输入。
2. `projects/openclaw/packages/agent-core/src/agent-loop.ts`
   - 低层事件化循环。
   - 重点：steering、follow-up、并行/串行工具。
3. `projects/nanobot/nanobot/agent/runner.py`
   - Python 工具执行和 provider loop。
4. `projects/nanobot/nanobot/agent/loop.py`
   - 看 RESTORE -> COMPACT -> ... 状态机。

完成标准：

- 能手画 `user -> model -> tool -> model -> persist`；
- 能解释 tool result 为什么必须和 tool call 配对；
- 能说明中断和并行为什么会破坏 transcript。

### 阶段 B：理解 Hermes 主链

1. `projects/hermes-agent/run_agent.py:395`：`AIAgent` 聚合对象。
2. `projects/hermes-agent/agent/conversation_loop.py:537`：真正主循环。
3. `projects/hermes-agent/agent/tool_executor.py`：工具分段并发。
4. `projects/hermes-agent/agent/chat_completion_helpers.py`：provider 请求。
5. `projects/hermes-agent/gateway/session.py:893`：会话键。
6. `projects/hermes-agent/gateway/session.py:1010`：SessionStore。
7. `projects/hermes-agent/cron/jobs.py:1039`：cron job 创建。

完成标准：

- 能描述 CLI 与 gateway 两条入口怎样汇合；
- 能解释 `state.db`、session key 和 conversation lineage；
- 能判断一个工具批次是否能安全并发；
- 能解释 crash 后为何要补 synthetic tool result。

### 阶段 C：理解 Memory 与 Skill

Memory：

1. `projects/hermes-agent/agent/memory_provider.py`
2. `projects/hermes-agent/agent/memory_manager.py`
3. `projects/hermes-agent/run_agent.py:3447`
4. `projects/mnemosyne/hermes_memory_provider/__init__.py:1321`
5. `projects/odigos/odigos/memory/recall.py`

Skill：

1. `projects/hermes-agent/agent/skill_utils.py`
2. `projects/hermes-agent/agent/skill_commands.py`
3. `projects/hermes-agent/agent/background_review.py`
4. `projects/hermes-agent/agent/curator.py`
5. `projects/MetaClaw/metaclaw/skill_evolver.py`

完成标准：

- 能区分 transcript、fact memory、episodic memory 和 Skill；
- 能解释 Skill metadata/full body/resource 的渐进披露；
- 能指出候选 Skill 在哪里进入正式库；
- 能设计 dedup、expiry、provenance 和 rollback。

### 阶段 D：理解长期任务

1. `projects/lethe/src/actor.rs`
2. `projects/lethe/src/agent/tool_loop.rs`
3. `projects/lethe/src/scheduler/brainstem.rs`
4. `projects/nanobot/nanobot/session/goal_state.py`
5. `projects/hermes-agent/gateway/session.py` 的 `resume_pending`

完成标准：

- 能设计一个进程重启后继续的任务；
- 能说明 session history 为什么不等于 task state；
- 能设计 bounded heartbeat 与主动通知。

### 阶段 E：理解安全

1. `projects/nanoclaw/docs/isolation-model.md`
2. `projects/nanoclaw/src/modules/mount-security/index.ts`
3. `projects/zeroclaw/docs/book/src/security/sandboxing.md`
4. `projects/ironclaw/src/tools/wasm/runtime.rs`
5. `projects/ironclaw/src/tools/wasm/credential_injector.rs`
6. `projects/hermes-agent-camel/agent/camel_guard.py`

完成标准：

- 能区分 policy 与 mechanism；
- 能解释 display redaction 为什么不等于 secret isolation；
- 能设计 trusted control / untrusted data；
- 能说明 container、OS sandbox、WASM 的强弱和成本。

### 阶段 F：理解 self-improvement

1. `projects/hermes-agent-self-evolution/evolution/skills/evolve_skill.py`
2. `projects/hermes-agent-self-evolution/evolution/core/fitness.py`
3. `projects/hermes-agent-metaharness/meta_harness/comparison.py`
4. `projects/odigos/odigos/core/evolution.py`
5. `projects/MetaClaw/metaclaw/skill_evolver.py`
6. `projects/MetaClaw/metaclaw/memory/manager.py`

完成标准：

- 能说清更新 target、signal、gate 和 rollback；
- 能识别代理指标与真实执行指标；
- 能为 Skill 更新设计 holdout regression；
- 能解释外部 Skill 和参数训练的可逆性差异。

## 2. 源码追踪题

### Hermes 主链

1. 一条 Telegram 消息如何变成 `AIAgent.run_conversation()` 的输入？
2. `build_session_key()` 在群聊、thread 和 DM 下如何避免信息串线？
3. 同一模型回复两个 read 和一个 write 工具时，executor 如何分段？
4. tool 执行中 gateway 重启，哪些消息已进入 SessionDB？
5. provider 返回 orphan tool result 时，哪一层修复？
6. background review 为什么必须 `skip_memory=True`？
7. Skill curator 删除一个 Skill 后，cron 引用如何更新？
8. context compression 为什么需要先通知 MemoryProvider？

### Memory

1. MemoryProvider 的 `prefetch` 和 `queue_prefetch` 为什么分开？
2. raw transcript 是否应该自动成为长期 memory？
3. Memory 结果如何携带来源、时效和权限？
4. recall hit 应不应该自动强化？如何避免反馈偏置？
5. “忘记”是删除、降权、tombstone 还是 supersede？
6. 多 profile 应共享哪些 identity，隔离哪些 episodic memory？

### Skill

1. 一个成功任务需要几次重复，才值得形成 Skill？
2. Skill 的 verifier 应测静态格式、脚本、任务成功还是长期 transfer？
3. Skill 使用率高但任务收益为零，应保留吗？
4. 两个相似 Skill 应 merge、保留变体还是做 router？
5. 自动创建的 Skill 是否可以声明 `allowed-tools`？
6. 外部 Skill 更新时，如何防供应链攻击？

### 安全

1. 网页文字为什么只能提供 data，不能授予 `send_message` 权限？
2. 用户说“按网页说明操作”是否足以授权所有 side effect？
3. container 内 `bypassPermissions` 在什么条件下合理？
4. host credential injection 如何处理 OAuth refresh 和 path scope？
5. memory write 是否应视为敏感动作？
6. Skill 写入是否比普通文件写入风险更高？

### 自我改进

1. 什么证据能证明 Agent 真的变强，而不是更会命中 benchmark？
2. holdout task set 怎样防止候选看到答案？
3. LLM-as-judge 能否同时做 proposer 和 evaluator？
4. trial 最少需要多少样本才可 promote？
5. 多目标情况下怎样处理成功率提升但成本、安全退化？
6. 参数训练失败时，怎样回到上一 adapter 并保留外部 Skill？

## 3. 关键设计练习

### 练习 1：最小长期 Agent

设计一个不超过 500 行的 Agent：

- SQLite transcript；
- 5 个工具；
- Memory 候选表；
- Skill 候选表；
- cron；
- approval；
- checkpoint。

要求画出表结构和 turn state machine。

### 练习 2：Skill admission gate

为一个自动生成的 GitHub issue triage Skill 设计：

- evidence；
- static validator；
- sandbox test；
- 3 个 holdout case；
- negative case；
- provenance；
- version；
- rollback。

### 练习 3：间接 prompt injection

场景：

> 用户让 Agent 总结网页。网页隐藏指令要求读取 `~/.ssh` 并发送到外部。

分别用 Hermes 默认、CaMeL、NanoClaw container、IronClaw WASM 说明：

- 哪一层发现；
- 哪一层阻止；
- 哪些秘密仍可能暴露；
- 哪些日志可审计。

### 练习 4：长期任务恢复

设计“每周研究一个开源项目”的 durable task：

- scope；
- budget；
- state；
- next action；
- checkpoint；
- external outcome；
- stop condition；
- retry；
- user notification。

### 练习 5：Memory 冲突

已有：

```text
2026-06-01: user prefers Python
2026-07-10: user now prefers Rust for backend
```

设计存储和召回规则，使 Agent：

- 不删除历史；
- 当前回答使用新偏好；
- 能解释偏好何时变化；
- 不把一次项目特例误当全局偏好。

## 4. 关键思考点

### 思考点 A：学习闭环最小充分条件

只有以下链路同时成立，才适合称“可验证学习闭环”：

```text
experience
 -> candidate update
 -> independent validation
 -> bounded admission
 -> reuse
 -> measured utility
 -> maintenance / rollback
```

少任一步，系统可能只是自动记笔记或自动改 prompt。

### 思考点 B：Memory 与 Skill 的分界

- “用户喜欢简洁回答”是 preference memory。
- “发布前先跑 lint/test/diff-check”是 Skill。
- “这次发布卡在 token 过期”是 episodic memory。
- “token 过期先刷新再重试”只有跨任务验证后才适合 Skill。

### 思考点 C：可逆性优先

长期 Agent 早期应优先外部、可见、可撤销的更新：

```text
Markdown / SQLite
 -> versioned Skill
 -> prompt/config trial
 -> code change
 -> model parameter update
```

越往后越难归因和回滚。

### 思考点 D：自动化不是自主性

cron 每天跑一次只证明调度存在。自主性还需要：

- 自己识别机会；
- 评估价值；
- 受目标和预算约束；
- 选择不行动；
- 对结果负责；
- 知道何时停止。

### 思考点 E：安全必须覆盖长期写入

阻止一次 shell 不够。攻击也可能写入：

- MEMORY.md；
- USER.md；
- Skill；
- cron；
- plugin config；
- todo/goal；
- model training trajectory。

这些会把一次攻击升级为跨会话行为。

## 5. 一手来源

### 主项目与协议

- [Hermes Agent 仓库](https://github.com/NousResearch/hermes-agent)
- [Hermes 官方文档](https://hermes-agent.nousresearch.com/docs/)
- [Agent Skills 规范](https://agentskills.io/specification)
- [Agent Skills 仓库](https://github.com/agentskills/agentskills)
- [Google A2A 公告](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

### 正式源码样本

- [Hermes Agent Self-Evolution](https://github.com/NousResearch/hermes-agent-self-evolution)
- [Awesome Hermes Agent](https://github.com/0xNyk/awesome-hermes-agent)
- [Hermes Agent RS](https://github.com/Lumio-Research/hermes-agent-rs)
- [Thoth Agent](https://github.com/519lab/thoth-agent)
- [Mnemosyne OSS](https://github.com/mnemosyne-oss/mnemosyne)
- [Mnemosyne Harness](https://github.com/atxgreene/Mnemosyne)
- [Hermes CaMeL](https://github.com/nativ3ai/hermes-agent-camel)
- [Hermes Meta-Harness](https://github.com/howdymary/hermes-agent-metaharness)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [nanobot](https://github.com/HKUDS/nanobot)
- [NanoClaw](https://github.com/nanocoai/nanoclaw)
- [PicoClaw](https://github.com/sipeed/picoclaw)
- [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw)
- [IronClaw](https://github.com/nearai/ironclaw)
- [Agent Zero](https://github.com/agent0ai/agent-zero)
- [Letta Code](https://github.com/letta-ai/letta-code)
- [Lethe](https://github.com/alien-id/lethe)
- [GenericAgent](https://github.com/lsdefine/GenericAgent)
- [7/24 Office](https://github.com/wangziqi06/724-office)
- [MetaClaw](https://github.com/aiming-lab/MetaClaw)
- [Odigos](https://github.com/tamler/odigos)

### 研究论文与综述

- [A Comprehensive Survey of Self-Evolving AI Agents](https://arxiv.org/abs/2508.07407)
- [Self-Improvements in Modern Agentic Systems](https://arxiv.org/abs/2607.13104)
- [A Survey on Evaluation of LLM-based Agents](https://aclanthology.org/2026.findings-acl.1330.pdf)
- [From Storage to Experience](https://arxiv.org/html/2605.06716)
- [They Are Not Static: A Survey of Dynamic Agent Skills](https://openreview.net/pdf/76662eb725cd6f62476c21cf1e13233dfaab8c41.pdf)
- [A Lifecycle-Perspective Survey of Agent Skills](https://openreview.net/pdf?id=7p1BRbvvJN)
- [MUSE-Autoskill](https://arxiv.org/html/2605.27366)
- [Experience-driven Lifelong Learning](https://arxiv.org/pdf/2508.19005)

## 6. 二手来源与使用方式

二手文章用于发现项目和理解社区定位，不作为实现事实：

- [Composio: Hermes alternatives](https://composio.dev/content/hermes-agent-alternatives)
- [Turing Post: Hermes vs OpenClaw](https://www.turingpost.com/p/hermes)
- [The Claw ecosystem](https://michaellivs.com/blog/personal-ai-agents-compared/)

其中可能存在：

- star/版本过时；
- 厂商偏向；
- 把 README 声明当实现；
- 把 memory、Skill 和 self-training 混称为“learning”；
- 安全判断缺少源码证据。

所以本材料只采纳它们的候选线索，再回到源码核验。

## 7. 本轮验证命令

```bash
# GitHub 登录
gh auth status

# fork 元数据
gh repo view estelledc/<name> --json parent,isFork

# 本地 fork/upstream/commit
git -C projects/<name> remote -v
git -C projects/<name> rev-parse HEAD
git -C projects/<name> status --short --branch

# 父仓忽略边界
git check-ignore -v projects/<name>

# 文档校验
make lint
git diff --check
```

2026-07-16 初稿没有执行第三方项目测试。2026-07-17 重验时，已按 Hermes 自身要求
使用 `scripts/run_tests.sh` 定向运行 5 个文件、200 项测试，结果全部通过；命令与
首次 sparse checkout 失败记录见[全量快照复核](08-2026-07-17-refresh.md)。

其余 21 个项目仍未执行第三方测试，原因是：

- 22 个项目语言和依赖差异很大；
- 多数需要 API key、Node/Rust/Go toolchain、Docker、PostgreSQL 或模型；
- 本轮目标是源码与架构研究，不是统一运行 benchmark；
- 运行不可信第三方安装/构建脚本超出必要范围。

后续如果要验证某个具体结论，应选一个仓库和一条最小主链单独执行。
