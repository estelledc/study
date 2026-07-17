# 05. 上下文、工作流与知识复利

本章分析五个“比完整 SDD 更方法化或更轻量”的项目：

- Superpowers
- Planning with Files
- Compound Engineering
- PRPs Agentic Engineering
- Context Engineering Intro

## 1. Superpowers

> 基线：`obra/superpowers@d884ae04edeb`
> 版本：`6.1.1`

### 定位

Superpowers 是一套强纪律的软件开发 Skills 方法论。它没有独立任务数据库，核心控制来自：

- skills 强制路由。
- brainstorming。
- worktree。
- 详细计划。
- 每任务新鲜子 Agent。
- spec + code quality 双重 review。
- TDD。
- 完成前验证。

### Skill 路由

`using-superpowers` 的规则非常强：

```text
只要有 1% 可能适用，就必须先调用 Skill。
```

源码：

- [`skills/using-superpowers/SKILL.md:10-24`](../repos/superpowers/skills/using-superpowers/SKILL.md)
- [`skills/using-superpowers/SKILL.md:33-50`](../repos/superpowers/skills/using-superpowers/SKILL.md)

这是一种 prompt-level policy。它的效果取决于宿主能否稳定加载 Skill，以及模型是否遵守先路由后行动。

### Subagent-Driven Development

每个任务：

```text
fresh implementer
-> implement/test/commit/self-review
-> task reviewer
   -> spec compliance
   -> code quality
-> fix/re-review
```

全部任务完成后，再做 whole-branch review：

- [`skills/subagent-driven-development/SKILL.md:6-17`](../repos/superpowers/skills/subagent-driven-development/SKILL.md)
- [`skills/subagent-driven-development/SKILL.md:45-82`](../repos/superpowers/skills/subagent-driven-development/SKILL.md)

它强调：

- 子 Agent 不继承父会话历史。
- prompt 只给当前任务和必要接口。
- diff/brief/report 用文件传递，不把大内容塞回协调会话。
- progress ledger 防止 compaction 后重复执行。

文件 handoff 和 ledger：

- [`skills/subagent-driven-development/SKILL.md:219-262`](../repos/superpowers/skills/subagent-driven-development/SKILL.md)

### TDD 和完成证据

TDD 的 Iron Law：

```text
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

- [`skills/test-driven-development/SKILL.md:31-45`](../repos/superpowers/skills/test-driven-development/SKILL.md)
- [`skills/test-driven-development/SKILL.md:113-183`](../repos/superpowers/skills/test-driven-development/SKILL.md)

完成前验证要求在当前消息中运行新鲜命令：

- [`skills/verification-before-completion/SKILL.md:16-37`](../repos/superpowers/skills/verification-before-completion/SKILL.md)

### 优势

- 方法清晰，Skill 可单独复用。
- 生成者/评审者分离。
- TDD 和 evidence-first 约束很强。
- 文件 handoff 与 fresh subagent 对 context 成本有明确控制。
- 不强迫团队采用新的 task schema。

### 代价

- 强制主要依赖提示词，程序不会阻止模型绕过。
- 默认每任务多 Agent review，成本可能很高。
- TDD 的绝对规则不适合所有配置、生成代码和探索任务。
- progress ledger 是 gitignored scratch，清理后需从 Git 恢复。

### 对 Trellis 的启示

Trellis 已有 implement/check 分离，但 Superpowers 对“每任务 brief/report/diff 文件交接”和“独立 task review + final branch review”的描述更精细。

## 2. Planning with Files

> 基线：`OthmanAdi/planning-with-files@f90780c92f05`
> 版本：`3.5.1`

### 定位

最小核心只有三份文件：

```text
task_plan.md  = 目标、阶段、决策、错误
findings.md   = 研究和发现
progress.md   = 操作、测试和会话进度
```

Skill 把窗口比作 RAM、文件比作 Disk：

- [`skills/planning-with-files/SKILL.md:84-100`](../repos/planning-with-files/skills/planning-with-files/SKILL.md)

### 生命周期 hooks

Skill frontmatter 注册：

- UserPromptSubmit：重新注入 plan。
- PreToolUse：行动前重新注入。
- PostToolUse：提醒更新 progress。
- Stop：运行 completion gate。
- PreCompact：压缩前刷新。

源码：

- [`skills/planning-with-files/SKILL.md:1-31`](../repos/planning-with-files/skills/planning-with-files/SKILL.md)

### 恢复

恢复顺序：

1. 读三文件。
2. 从 Claude/Codex/OpenCode session store 找上次文件更新时间之后的对话。
3. 用 `git diff --stat` 对照真实改动。
4. 更新文件后继续。

- [`skills/planning-with-files/SKILL.md:38-60`](../repos/planning-with-files/skills/planning-with-files/SKILL.md)

### 并行计划隔离

多计划使用：

```text
.planning/YYYY-MM-DD-slug/
.planning/.active_plan
PLAN_ID
```

解析优先级是 env -> active pointer -> newest -> legacy root。

### Attestation

计划批准后保存 SHA-256。hook 注入前验证 hash，发现变化则拒绝把被篡改计划作为可信上下文。

脚本还处理：

- `sha256sum` / `shasum`。
- 临时文件 + atomic rename。
- 可选 `flock`。
- 写后 read-back verification。

源码：

- [`scripts/attest-plan.sh:1-17`](../repos/planning-with-files/scripts/attest-plan.sh)
- [`scripts/attest-plan.sh:107-202`](../repos/planning-with-files/scripts/attest-plan.sh)

### Completion Gate

v3 的 gate 只有在明确 `.mode` 为 gated 且满足进展条件时才阻止 Stop；没有 mode 时保持旧版 advisory 行为：

- [`scripts/gate-stop.sh:1-32`](../repos/planning-with-files/scripts/gate-stop.sh)

### Run Ledger

`ledger-<agent>.jsonl` 是机器层进度，事件包括：

- progress
- phase_complete
- error
- gate_block
- attest
- note

写入在 flock 内计算全局 tick 并 append：

- [`scripts/ledger-append.sh:1-32`](../repos/planning-with-files/scripts/ledger-append.sh)
- [`scripts/ledger-append.sh:207-233`](../repos/planning-with-files/scripts/ledger-append.sh)

### 优势

- 概念小，通用性强。
- 对 context loss、并发计划和 tamper 有真实脚本支持。
- 无数据库。
- 兼容大量 Agent Skills 平台。
- gated mode 是可选，避免默认把用户困在循环里。

### 代价

- Shell/Python/PowerShell 多份实现带来平台 parity 成本。
- 计划、发现和进度由 Agent 手动维护，可能失真。
- attestation 只能证明 plan 内容没变，不能证明 plan 正确。
- 没有项目规范库、角色模型或长期知识治理。

### 对 Trellis 的启示

Trellis 可借鉴：

- 对已批准 PRD/design/implement 做 hash attestation。
- 用机器 ledger 与人读 journal 分层。
- Stop gate 必须有明确 opt-in、进展检测和 block cap。

## 3. Compound Engineering

> 基线：`EveryInc/compound-engineering-plugin@e745e9663b4b`
> 版本：`3.19.0`

### 定位

核心目标：

```text
每一轮工程工作都让下一轮更容易。
```

主循环：

```text
brainstorm -> plan -> work -> simplify -> review -> compound
       ^                                             |
       +---------------------------------------------+
```

### 统一工件

`ce-brainstorm` 生成 requirements-only unified plan，`ce-plan` 原地补成 implementation-ready，`ce-work` 执行但不把进度写回 plan，进度从 Git 和任务工具推导。

这种设计区分：

- Product Contract：WHAT。
- Implementation Plan：HOW。
- Git/task state：执行进度。

`ce-plan` 明确要求：

- repo-relative paths。
- requirements traceability。
- test files 和场景。
- decisions/rationale。
- patterns。
- dependencies。

- [`skills/ce-plan/SKILL.md:39-64`](../repos/compound-engineering/skills/ce-plan/SKILL.md)

### 执行

`ce-work` 对统一计划先检查：

```text
artifact_readiness=requirements-only -> 拒绝执行，先 ce-plan
artifact_readiness=implementation-ready + execution=code -> 执行
```

- [`skills/ce-work/SKILL.md:21-37`](../repos/compound-engineering/skills/ce-work/SKILL.md)

对于长计划，只构建 heading map，再按 U-ID 读取当前 unit，避免整份计划进入上下文：

- [`skills/ce-work/SKILL.md:57-73`](../repos/compound-engineering/skills/ce-work/SKILL.md)

并行安全不只看文件重叠，还看：

- shared types/API
- migration
- generated artifacts
- lockfiles
- shared environment

- [`skills/ce-work/SKILL.md:142-189`](../repos/compound-engineering/skills/ce-work/SKILL.md)

### Review

`ce-code-review` 选择多种 reviewer persona，输出统一 finding schema，并将 severity 与 autofix/owner 分开：

- [`skills/ce-code-review/SKILL.md:7-17`](../repos/compound-engineering/skills/ce-code-review/SKILL.md)
- [`skills/ce-code-review/SKILL.md:82-108`](../repos/compound-engineering/skills/ce-code-review/SKILL.md)
- [`skills/ce-code-review/SKILL.md:110-132`](../repos/compound-engineering/skills/ce-code-review/SKILL.md)

它特别区分：

- remote PR diff。
- local aligned tree。
- branch remote。

避免拿当前 checkout 的旧文件误审另一个 PR。

### Compound

`ce-compound` 把单个已解决问题写成 `docs/solutions/`：

- 先查重。
- 提取 root cause/solution/prevention。
- 用 source line 验证代码行为。
- 捕获项目词汇到 `CONCEPTS.md`。
- 需要时更新 instruction discovery。

- [`skills/ce-compound/SKILL.md:7-26`](../repos/compound-engineering/skills/ce-compound/SKILL.md)
- [`skills/ce-compound/SKILL.md:82-151`](../repos/compound-engineering/skills/ce-compound/SKILL.md)

### 跨平台安装安全

转换器通过 per-plugin install manifest 记录自己拥有的路径。清理时：

- 过滤路径穿越。
- 不删除 unmanaged 目录。
- 不覆盖用户 symlink。
- 检查 ancestor symlink containment。

- [`src/targets/managed-artifacts.ts:98-141`](../repos/compound-engineering/src/targets/managed-artifacts.ts)
- [`src/targets/managed-artifacts.ts:151-212`](../repos/compound-engineering/src/targets/managed-artifacts.ts)

### 优势

- 真正把知识回流放在循环末端。
- WHAT/HOW/PROGRESS 分离清楚。
- 计划、review、compound 的协议极其细致。
- 并行与远程 PR scope 考虑成熟。
- 安装安全和用户文件保护强。

### 代价

- 30 个 Skills，单个 SKILL 很长，学习与 token 成本高。
- 大量规则仍依赖模型解释。
- 多 reviewer 默认成本高。
- 外部状态、缓存和 `/tmp` artifact 使调试面扩大。

### 对 Trellis 的启示

Trellis 的 `trellis-update-spec` 与 `ce-compound` 同向，但 Compound Engineering 在查重、source grounding、CONCEPTS 和 discoverability 上更完整。

## 4. PRPs Agentic Engineering

> 基线：`Wirasm/PRPs-agentic-eng@a643e84600c4`
> 分支：`development`

### 定位

PRP 定义：

```text
PRP = PRD + curated codebase intelligence + agent runbook
```

目标不是维护完整规范系统，而是给执行 Agent 一份“足够一次成功”的上下文包。

### Plan

`prp-plan` 要求：

1. 先探索代码库。
2. 并行运行 codebase explorer 和 analyst。
3. 再做外部研究。
4. 提取真实 file:line 和代码片段。
5. 写 task-level validation command。

- [`.claude/skills/prp-plan/SKILL.md:7-20`](../repos/prps-agentic-eng/.claude/skills/prp-plan/SKILL.md)
- [`.claude/skills/prp-plan/SKILL.md:132-183`](../repos/prps-agentic-eng/.claude/skills/prp-plan/SKILL.md)
- [`.claude/skills/prp-plan/SKILL.md:239-311`](../repos/prps-agentic-eng/.claude/skills/prp-plan/SKILL.md)

### Implement

实现过程每次文件改动后验证，最后执行：

- static analysis
- tests
- build
- integration
- edge cases

- [`.claude/skills/prp-implement/SKILL.md:141-198`](../repos/prps-agentic-eng/.claude/skills/prp-implement/SKILL.md)
- [`.claude/skills/prp-implement/SKILL.md:201-287`](../repos/prps-agentic-eng/.claude/skills/prp-implement/SKILL.md)

### Orchestration

`prp-orchestrate` 定义一个 live run：

- one workstream = one agent = one branch = one PR。
- default max parallel 3。
- run file 保存 standing decisions、事件和 merge。
- Agent 完成声明必须用 PR/check/Git 验证。

- [`.claude/skills/prp-orchestrate/SKILL.md:7-20`](../repos/prps-agentic-eng/.claude/skills/prp-orchestrate/SKILL.md)
- [`.claude/skills/prp-orchestrate/SKILL.md:21-50`](../repos/prps-agentic-eng/.claude/skills/prp-orchestrate/SKILL.md)
- [`.claude/skills/prp-orchestrate/SKILL.md:67-89`](../repos/prps-agentic-eng/.claude/skills/prp-orchestrate/SKILL.md)

### 优势

- “代码库模式优先、外部最佳实践第二”很务实。
- PRP 是清晰的 bounded execution packet。
- validation command 是一等工件。
- 支持 PRD phase、单 feature、issue、debug 和 orchestrate。

### 代价

- 计划里包含大量代码片段，容易过时和膨胀。
- “一次成功”是目标，不是可保证属性。
- 状态分散在 PRD、plan markers、reports、loop state 和 run file。
- 仓内多份 skill 镜像需要同步脚本。

### 对 Trellis 的启示

Trellis 的 JSONL context manifest 可借鉴 PRP 的要求：每个路径都说明 WHY、MIRROR、GOTCHA 和 VALIDATE，而不只是文件名。

## 5. Context Engineering Intro

> 基线：`coleam00/context-engineering-intro@a2d84b021cee`

### 定位

这是 PRP 方法的教学模板，核心流程：

```text
INITIAL.md
-> /generate-prp
-> PRPs/<feature>.md
-> /execute-prp
-> validation loops
```

### 关键组成

`INITIAL.md` 提供：

- FEATURE
- EXAMPLES
- DOCUMENTATION
- OTHER CONSIDERATIONS

`generate-prp` 要求：

- 代码库分析。
- 外部研究。
- 真实代码示例。
- 可执行验证。
- 1-10 confidence score。

- [`.claude/commands/generate-prp.md:1-67`](../repos/context-engineering-intro/.claude/commands/generate-prp.md)

PRP 模板包含：

- Goal/Why/What。
- 所有必需上下文。
- 当前/目标树。
- gotchas。
- task blueprint。
- 多级验证。

- [`PRPs/templates/prp_base.md:16-68`](../repos/context-engineering-intro/PRPs/templates/prp_base.md)
- [`PRPs/templates/prp_base.md:82-143`](../repos/context-engineering-intro/PRPs/templates/prp_base.md)
- [`PRPs/templates/prp_base.md:143-212`](../repos/context-engineering-intro/PRPs/templates/prp_base.md)

### 优势

- 最适合建立 Context Engineering 直觉。
- 文件少，能快速复制到项目。
- examples 作为上下文的价值解释清楚。
- 验证循环比单纯 prompt engineering 更完整。

### 代价

- 主要面向 Claude Code。
- 没有任务状态机、迁移、跨平台 adapter。
- 模板中的示例偏 Python，需要按项目重写。
- “做更多 web search”可能扩大上下文而非压缩上下文。

## 6. 横向对比

| 维度 | Superpowers | Planning with Files | Compound Eng | PRP | Context Intro |
|---|---|---|---|---|---|
| 最小抽象 | Skill | 三文件 | 循环 + 知识库 | 上下文包 | 教学模板 |
| 状态持久化 | ledger/Git | plan/progress/ledger | Git/task tool | plan/report/state | PRP 文件 |
| 子 Agent | 强 | 可选 | 强 | 强 | 初版弱 |
| Review | 双层 | 无内置专职 | 多 persona | PR review | validation |
| 知识回流 | writing-skills | findings | docs/solutions | report | 无长期治理 |
| 确定性门禁 | 较少 | attestation/gate | install safety | Python loop/commands | 较少 |
| 适用 | 强纪律开发 | 任意长任务 | 团队复利 | 一次执行 | 入门/模板 |

## 关键思考点

1. “把上下文写进一个大 PRP”和“按角色渐进披露”哪种更稳定？
2. 完成后应该更新原计划、单独写 report，还是只相信 Git？
3. Skill 的规则越来越长时，是否需要像 GSD 一样设置 byte budget？
4. 知识回流应该自动发生，还是每次由人确认？
5. 子 Agent 隔离带来的质量收益，何时会被成本和 merge 复杂度抵消？
