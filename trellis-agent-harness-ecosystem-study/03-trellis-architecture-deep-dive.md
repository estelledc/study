# 03. Trellis 架构深度分析

> 上游：`mindfold-ai/Trellis`
> 本轮基线：`c6f85dc796dc0306016444ecc8d5a71e6219a6a9`
> 包版本：`@mindfoldhq/trellis@0.6.7`、`@mindfoldhq/trellis-core@0.6.7`

## 1. 一句话定位

Trellis 是一个安装到现有仓库中的 **团队级 Coding Agent Harness**。它不替代 Coding Agent，而是把团队规范、任务状态、工作流、上下文装配、会话记忆和多 Agent 通道投影给多个 Coding Agent。

类比：

- Coding Agent 是会写代码的工程师。
- `.trellis/` 是团队的工程手册、任务系统和交接台。
- 各平台目录是针对不同工程师工具制作的“适配说明”。
- hooks 是在关键事件自动递资料的助理。

## 2. 核心架构

```text
                         npm CLI
              @mindfoldhq/trellis (TypeScript)
                         |
       +-----------------+-----------------+
       |                                   |
  初始化/更新/迁移                     运行时命令
  init/update/uninstall                mem/channel/workflow
       |                                   |
       v                                   v
 +---------------+                 +------------------+
 | 平台 Configurators |             | trellis-core SDK |
 | 模板与 hooks 投影   |             | channel/mem/task |
 +---------------+                 +------------------+
       |
       v
  用户项目中的生成层
  .trellis/ + .claude/ + .codex/ + ...
       |
       +-- workflow.md        阶段与 breadcrumb 源真相
       +-- config.yaml        项目级 Trellis 配置
       +-- spec/              长期工程规范
       +-- tasks/             每项工作的 PRD/设计/计划/上下文
       +-- workspace/         每位开发者的人工提炼 journal
       +-- scripts/           Python 任务与上下文运行时
       +-- .runtime/          session-scoped 临时状态
```

## 3. 为什么同时使用 TypeScript 和 Python

### TypeScript 层

主要负责：

- npm 安装和 CLI。
- 平台模板生成。
- 更新、迁移与 hash 跟踪。
- channel runtime。
- session memory 读取。
- 对外 Core SDK。

入口：

- `packages/cli/src/cli/index.ts`
- `packages/cli/src/commands/`
- `packages/cli/src/configurators/`
- `packages/core/src/`

### Python 层

Python scripts 会被复制到用户仓库的 `.trellis/scripts/`，主要负责：

- task CRUD 和归档。
- session-scoped active task。
- spec/task context 读取。
- journal 写入。
- 各平台 hooks 的上下文装配。

这样设计的直觉是：npm CLI 管“安装与升级”，项目内 Python 管“仓库随身运行时”。代价是 TypeScript 与 Python 必须共享 schema 和行为契约。

Trellis 已为 `task.json` 抽出 TypeScript 的 24 字段 canonical schema，但注释明确指出 Python `task_store.py` 仍是 runtime writer：

- [`packages/core/src/task/schema.ts:1-15`](../repos/trellis/packages/core/src/task/schema.ts)
- [`.trellis/scripts/common/task_store.py:311-338`](../repos/trellis/.trellis/scripts/common/task_store.py)

## 4. `.trellis/` 数据模型

### 4.1 Spec

`.trellis/spec/` 保存长期工程规则：

```text
.trellis/spec/<package>/<layer>/index.md
.trellis/spec/<package>/<layer>/<guideline>.md
.trellis/spec/guides/
```

它不是每次全部注入。索引用于发现，任务上下文清单决定实现/检查角色读取哪些具体文件。

### 4.2 Task

任务目录：

```text
.trellis/tasks/MM-DD-slug/
├── task.json
├── prd.md
├── design.md          # 复杂任务
├── implement.md       # 复杂任务
├── implement.jsonl
├── check.jsonl
└── research/
```

工件职责：

| 文件 | 作用 |
|---|---|
| `task.json` | 状态、负责人、分支、父子任务、PR 等机器状态 |
| `prd.md` | 需求、约束、接受标准 |
| `design.md` | 技术边界、数据流、兼容和取舍 |
| `implement.md` | 执行顺序、验证命令、回滚点 |
| `implement.jsonl` | 实现 Agent 需要的规范/研究路径 |
| `check.jsonl` | 检查 Agent 需要的规范/研究路径 |

创建任务时状态为 `planning`，同时创建 `prd.md`，在支持子 Agent 的平台上 seed 两个 JSONL：

- [`.trellis/scripts/common/task_store.py:204-357`](../repos/trellis/.trellis/scripts/common/task_store.py)

### 4.3 Workspace Journal

`.trellis/workspace/<developer>/journal-N.md` 保存主动写下的会话摘要，不等于原始聊天日志。

原始日志由 `trellis mem` 直接读取宿主本地文件：

- Claude Code sessions
- Codex sessions
- Pi sessions
- 部分 OpenCode/ZCode 数据

这形成两层记忆：

```text
deliberate journal   = 人工/Agent 主动沉淀
raw session history = 需要时检索的历史证据
```

## 5. 工作流状态模型

### 5.1 外部四步与内部三阶段

README 用四步解释用户体验：

```text
Plan -> Implement -> Verify -> Finish
```

`.trellis/workflow.md` 的正式阶段是：

```text
Phase 1 Plan
Phase 2 Execute
Phase 3 Finish
```

两者不是完全冲突：

- Implement 和 Verify 都属于内部 Phase 2。
- README 按用户可见角色分步。
- workflow 按任务状态和 hook 路由分阶段。

但维护时必须避免文档和状态名继续分叉。

### 5.2 Task status

当前核心状态很少：

```text
planning -> in_progress -> completed
```

`task.py start` 做两件事：

1. 尝试写 session-scoped active task pointer。
2. 把 `task.json.status` 从 `planning` 改为 `in_progress`。

如果没有 session identity，仍允许进入 degraded mode 并修改状态：

- [`.trellis/scripts/task.py:70-137`](../repos/trellis/.trellis/scripts/task.py)

`archive` 在移动目录前写 `completed`，然后清理仍指向该任务的 session：

- [`.trellis/scripts/common/task_store.py:463-556`](../repos/trellis/.trellis/scripts/common/task_store.py)

### 5.3 Artifact presence 也是状态

Trellis 不只看 `task.json.status`，还看：

- `prd.md` 是否存在。
- 复杂任务是否有 `design.md` / `implement.md`。
- JSONL 是否已从 seed 变成真实 context manifest。

因此它是：

```text
显式 status + 工件存在/内容门槛
```

而不是完整的强类型状态机。

## 6. Session-scoped Active Task

旧式全局 `.current-task` 会让多个窗口互相覆盖。当前实现将 pointer 放在：

```text
.trellis/.runtime/sessions/<context-key>.json
```

解析规则：

1. 从平台 payload / 环境变量取得 context key。
2. 读取该 session 的 current task。
3. 如果子 Agent 没继承 session id，且本地恰好只有一个 session 文件，允许 single-session fallback。
4. 如果有 0 或多个 session，拒绝猜测。

源码：

- [`.trellis/scripts/common/active_task.py:484-535`](../repos/trellis/.trellis/scripts/common/active_task.py)
- [`.trellis/scripts/common/active_task.py:564-590`](../repos/trellis/.trellis/scripts/common/active_task.py)

这个设计解决并行窗口冲突，但仍有边界：

- 平台必须提供稳定 session identity。
- 子 Agent 不继承 id 时只能在“唯一 session”条件下安全 fallback。
- degraded mode 依赖会话本身记住当前任务。

## 7. 上下文注入

### 7.1 主会话 breadcrumb

每次用户提交 prompt 时，hook：

1. 向上寻找 `.trellis/` 根。
2. 解析 active task。
3. 读取 `task.json.status`。
4. 从 `workflow.md` 找对应 `[workflow-state:STATUS]` 块。
5. 注入短 `<workflow-state>`。

关键设计：breadcrumb 文本只来自 `workflow.md`，hook 不保留第二份 fallback 字典：

- [`inject-workflow-state.py:1-29`](../repos/trellis/packages/cli/src/templates/shared-hooks/inject-workflow-state.py)
- [`inject-workflow-state.py:175-209`](../repos/trellis/packages/cli/src/templates/shared-hooks/inject-workflow-state.py)

这是“单一源真相”设计：改流程时不必同步 Python 文案。

### 7.2 子 Agent 上下文

实现 Agent 的装配顺序：

```text
implement.jsonl entries
-> prd.md
-> design.md (if present)
-> implement.md (if present)
```

检查 Agent 使用 `check.jsonl`，随后读取相同任务工件：

- [`inject-subagent-context.py:267-339`](../repos/trellis/packages/cli/src/templates/shared-hooks/inject-subagent-context.py)

### 7.3 Push 与 Pull 两类平台

Trellis 没有假设所有宿主 hook 能力相同：

| 模式 | 做法 |
|---|---|
| Hook push | hook 直接修改/追加子 Agent prompt |
| Pull prelude | 子 Agent 启动后自己读取 task artifacts 和 JSONL |
| Inline | 主 Agent 不派实现 Agent，直接读工件工作 |

Codex 默认 `inline` 是 Trellis 的策略选择：避免把正确性建立在继承父会话 transcript 上。它不是 Codex 的能力限制；`fork_turns` 可由调用方选择，fresh-history 子 Agent 仍会收到显式委派任务和继承的 session config。每轮 hook 还会显式注入 `<codex-mode>`：

- [`inject-workflow-state.py:231-259`](../repos/trellis/packages/cli/src/templates/shared-hooks/inject-workflow-state.py)

这一区分来自 upstream 2026-07-17 的 #440 修正。本文源码链接仍绑定固定提交 `c6f85dc7`，当前措辞则按远端 `51a5674c` 校正。

## 8. 多平台投影

### 8.1 Registry

`AI_TOOLS` 记录：

- `configDir`
- `templateDirs`
- `cliFlag`
- 是否有 hooks
- 是否支持子 Agent
- 命令引用格式
- 用户入口叫 command、skill、workflow 还是 prompt

源码：

- [`packages/cli/src/types/ai-tools.ts:145-250`](../repos/trellis/packages/cli/src/types/ai-tools.ts)

### 8.2 Configurator

`PLATFORM_FUNCTIONS` 将统一内容解析成各平台文件：

- Claude：commands + skills + agents + hooks + settings
- Cursor：commands + skills + agents + hooks
- Codex：`.agents/skills` + `.codex/skills` + TOML agents + hooks
- 其他平台使用各自 adapter

源码：

- [`packages/cli/src/configurators/index.ts:150-245`](../repos/trellis/packages/cli/src/configurators/index.ts)

Trellis 当前 registry 类型中有 19 个 platform id。README 宣称“17 个平台”与代码数量可能因别名、过渡平台和发布文案口径不同，需要以具体版本的 `AI_TOOLS` 为准。

### 8.3 真实成本

跨平台不是简单复制 Markdown。差异包括：

- hook 事件名和输出 JSON schema。
- Agent 文件格式（Markdown、TOML、JSON）。
- 命令前缀。
- 子 Agent 上下文能否被 hook 修改。
- Windows shell 与编码。
- skill loader 是否递归。

仓库大量 regression tests 和 migration manifest 都在处理这些差异，说明平台适配是 Trellis 的核心资产，也是主要维护成本。

## 9. 初始化、更新与迁移

### 9.1 初始化安全

`trellis init`：

- 拒绝直接在 `$HOME` 运行，防止 uninstall 误删平台运行数据。
- `--yes` 默认 skip 已有文件，不默认覆盖。
- 识别首次创建、已有项目 re-init、fresh clone joiner。

源码：

- [`packages/cli/src/commands/init.ts:1100-1208`](../repos/trellis/packages/cli/src/commands/init.ts)

### 9.2 Template hash

Trellis 对生成文件保存 SHA-256：

- 统一 CRLF/LF。
- path key 统一为 POSIX。
- 缺少历史 hash 时保守地视作用户修改。
- 更新/删除时判断文件是否仍是工具生成版本。

源码：

- [`packages/cli/src/utils/template-hash.ts:1-118`](../repos/trellis/packages/cli/src/utils/template-hash.ts)
- [`packages/cli/src/utils/template-hash.ts:179-213`](../repos/trellis/packages/cli/src/utils/template-hash.ts)

### 9.3 Migration manifests

`packages/cli/src/migrations/manifests/` 保存逐版本迁移。它不仅更新模板，还处理：

- rename
- safe-file-delete
- breaking migration gate
- 旧平台和旧 skill 清理
- 用户修改保护

这使 Trellis 更像一个“项目内框架发行版”，而不是一次性脚手架。

## 10. Channel Runtime

`trellis channel` 是 v0.6 新增的多 Agent 通信层。

事件存储：

```text
~/.trellis/channels/<project>/<channel>/events.jsonl
```

核心属性：

- append-only JSONL。
- 单调 `seq`。
- 文件锁。
- stale PID lock recovery。
- `idempotencyKey` 防重复事件。
- worker lifecycle 与 forum/thread。

写事件时先持锁、检查幂等、对齐 seq sidecar，再 append：

- [`packages/core/src/channel/internal/store/events.ts:399-451`](../repos/trellis/packages/core/src/channel/internal/store/events.ts)

锁使用 `open(..., "wx")` 的跨进程原子创建，并检查 PID：

- [`packages/core/src/channel/internal/store/lock.ts:1-106`](../repos/trellis/packages/core/src/channel/internal/store/lock.ts)

设计优点：

- 无需中心服务器。
- 事件可审计。
- CLI 与 SDK 共用 domain primitives。

限制：

- 文件锁与 PID liveness 适合单机，不是分布式一致性。
- JSONL 全量幂等扫描会随 channel 变大而增加成本。
- worker OOM/idle guard 是运行时治理，但不能代替任务级冲突分析。

## 11. `trellis mem`

`trellis mem` 不建立自己的向量数据库，而是读取宿主已有的本地会话存储。

功能：

- list sessions
- keyword search
- context around hit
- extract dialogue
- projects
- 按 brainstorm/implement phase 切片

搜索当前采用：

- 多 token AND 匹配。
- 清洗后的 dialogue。
- weighted-density relevance。
- 可把子会话合并到父会话。

源码：

- [`packages/core/src/mem/sessions.ts:303-371`](../repos/trellis/packages/core/src/mem/sessions.ts)
- [`packages/core/src/mem/sessions.ts:374-405`](../repos/trellis/packages/core/src/mem/sessions.ts)

优点：

- 本地、无上传。
- 不新增 embedding 成本。
- 直接利用已有真实对话。

限制：

- 关键词搜索不理解深层语义。
- 不同平台存储格式变化会破坏 adapter。
- 原始历史可能包含噪声和过时结论。

## 12. 端到端数据流

```text
用户描述任务
   |
   v
trellis-brainstorm
   |
   +--> task.py create -> task.json(status=planning) + prd.md
   |
   +--> research/design/implement artifacts
   |
   +--> curate implement.jsonl / check.jsonl
   |
   v
task.py start -> status=in_progress + session pointer
   |
   v
workflow-state hook 注入下一步
   |
   +--> trellis-implement
   |      JSONL + PRD + design + implement
   |
   +--> trellis-check
   |      check JSONL + task artifacts + diff + tests
   |
   +--> trellis-update-spec
   |      把可复用经验写回 spec
   |
   +--> commit
   |
   v
finish-work -> archive task + write journal
```

## 13. 代码组织与测试

当前稀疏研究副本中：

- 约 242 个 TypeScript 文件。
- 约 28 个核心项目 Python scripts；加模板镜像后更多。
- 约 79 个 TypeScript test 文件。
- CLI 和 Core 使用 Vitest。
- Python 使用 basedpyright 做静态检查。

主要测试面：

- init/update/uninstall。
- platform configurators 和模板。
- migration。
- task schema。
- channel 并发、幂等和 worker state。
- mem adapters。
- Windows/path/encoding 回归。

这类测试说明 Trellis 的复杂度主要不在某个算法，而在“文件系统迁移 + 多平台行为一致性”。

## 14. 优势

1. **覆盖完整闭环**：不是只写 spec，也处理实现、检查、知识回流和收尾。
2. **仓库级共享**：规范和任务可以评审、版本化。
3. **上下文分角色**：实现和检查使用不同 manifest。
4. **平台能力建模**：显式区分 hooks、subagent 和入口格式。
5. **更新保护**：hash、managed blocks、原子写和 migration。
6. **并行会话隔离**：active task 不再是一个全局指针。
7. **可渐进采用**：单 Agent 工作流仍可用，channel/mem 是附加面。

## 15. 局限与风险

### 15.1 强制性不完全

很多门禁仍由 prompt 表达。`task.py start` 可以在 degraded mode 继续，说明可用性优先于严格阻断。

### 15.2 多源真相

需要同步：

- TypeScript canonical templates
- 用户项目内 Python runtime
- 各平台生成文件
- workflow.md
- migration manifests
- docs site

项目已经用 single source、hash 和 regression tests 降低风险，但复杂度仍高。

### 15.3 平台等价只是近似

同一工作流在不同平台可能是：

- hook push
- pull prelude
- inline main agent
- 手动 start command

因此“结构相同”不代表“运行行为完全相同”。

### 15.4 任务完成与外部结果

Trellis 能证明：

- 工件存在。
- 任务已归档。
- 测试命令被要求执行。

但它不能自动证明：

- 用户真实问题已解决。
- 产品已上线。
- reviewer 已接受。

需要继续维护外部结果证据。

### 15.5 AGPL

Trellis 是 AGPL-3.0。研究和使用没问题，但复制/修改并通过网络提供服务前需要重新审查许可证义务。

## 16. 适用场景

更适合：

- 多人共享 Coding Agent 规范。
- 同时使用多个 Agent 平台。
- 长任务和多会话任务。
- 对 review、测试和知识回流有明确要求。
- 愿意把 Harness 文件提交到仓库。

不一定适合：

- 一次性脚本。
- 极小仓库和单人临时原型。
- 不愿维护 spec/task 工件的团队。
- 需要强分布式调度、企业 RBAC 或集中式审计的平台。

## 关键思考点

1. Trellis 的真正源真相是 `.trellis/workflow.md`、task status，还是生成后的平台文件？
2. degraded mode 是合理容错，还是削弱门禁？
3. `implement.jsonl` / `check.jsonl` 是最小充分上下文，还是额外维护负担？
4. channel runtime 应属于 Trellis，还是应交给宿主 Agent 的原生 team 功能？
5. `trellis mem` 的无 embedding 路线在什么规模后会失效？
6. 如果平台只能做到 pull-based context，如何验证子 Agent 真的读了文件？
