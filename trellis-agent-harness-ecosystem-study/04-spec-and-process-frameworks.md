# 04. 规范与流程框架深度分析

本章分析六个与 Trellis 最接近的“规范/流程控制层”项目：

- GitHub Spec Kit
- OpenSpec
- BMAD-METHOD
- GSD Core
- Agent OS
- Spec Workflow MCP

## 1. GitHub Spec Kit

> 基线：`github/spec-kit@aaf6bc22e300`
> 技术栈：Python 3.11+、Typer、Rich、YAML、pytest

### 定位

Spec Kit 把规范从“写完代码就丢弃的脚手架”提升为开发输入。标准主线：

```text
constitution -> specify -> clarify -> plan -> tasks -> analyze -> implement
```

`constitution` 保存项目原则，feature 目录保存 `spec.md`、`plan.md`、`tasks.md` 和 checklist。

### 架构

```text
specify CLI
├── init/scaffold
├── integrations/          30+ Agent 平台
├── templates/commands     核心 prompt
├── workflows/             YAML workflow engine
├── presets/               覆盖已有模板
├── extensions/            新增能力
└── bundles/               组合角色化安装包
```

平台适配使用基类抽象 Markdown、TOML、Skills 等输出形态：

- [`src/specify_cli/integrations/base.py:1-12`](../repos/spec-kit/src/specify_cli/integrations/base.py)
- [`src/specify_cli/integrations/base.py:99-140`](../repos/spec-kit/src/specify_cli/integrations/base.py)

### Workflow Engine

当前 Spec Kit 不只是静态 prompt。它包含 YAML workflow engine，支持：

- sequential steps
- shell
- prompt
- gate
- if/switch
- while/do-while
- fan-out/fan-in
- 状态持久化和 resume

源码：

- [`src/specify_cli/workflows/engine.py:1-9`](../repos/spec-kit/src/specify_cli/workflows/engine.py)
- [`src/specify_cli/workflows/engine.py:37-95`](../repos/spec-kit/src/specify_cli/workflows/engine.py)
- [`src/specify_cli/workflows/engine.py:112-124`](../repos/spec-kit/src/specify_cli/workflows/engine.py)

值得注意：`requires` 只是 advisory precondition，不是安全边界；`shell` 仍以用户权限运行。代码明确拒绝伪装成权限门禁的 `requires.permissions`：

- [`src/specify_cli/workflows/engine.py:225-253`](../repos/spec-kit/src/specify_cli/workflows/engine.py)

### Spec 生成约束

`specify` command 要求：

- 需求写 what/why，不写实现技术。
- 最多 3 个关键 clarification。
- 用户场景、可测试需求、技术无关成功标准。
- 生成后执行 checklist，最多三轮自修复。

源码：

- [`templates/commands/specify.md:56-142`](../repos/spec-kit/templates/commands/specify.md)
- [`templates/commands/specify.md:144-197`](../repos/spec-kit/templates/commands/specify.md)

### 优势

- 领域影响力和社区最大。
- constitution、feature spec、计划、任务边界清晰。
- extension/preset/bundle 模型成熟。
- workflow engine 正在把提示词阶段变成可执行流程。
- integrations 有统一抽象，而非完全复制。

### 代价

- 工件和概念多，对小任务较重。
- 核心 command 仍是长 prompt，质量依赖 Agent。
- “spec 可执行”更多指能驱动实现，不等于形式化规格。
- Python CLI、模板、integration 与 workflow engine 同时演进，表面积大。

### 与 Trellis 的关系

Spec Kit 更专注“从意图到实现计划”；Trellis 更专注“项目长期工作方式、上下文和收尾”。Trellis 的 task 是工作单元，Spec Kit 的 feature spec 是产品变化单元。

## 2. OpenSpec

> 基线：`Fission-AI/OpenSpec@0a99f4104572`
> 技术栈：TypeScript、Commander、Zod、YAML、Vitest

### 定位

OpenSpec 主张：

```text
fluid not rigid
iterative not waterfall
brownfield first
```

默认用户流程：

```text
explore -> propose -> apply -> archive
```

Change 目录持有 proposal、delta specs、design 和 tasks；archive 时把变更同步回长期 specs。

### Artifact Graph

OpenSpec 将工件定义在 YAML schema 中，每个 artifact 有：

- `id`
- `requires`
- `template`
- `generates`
- `instruction`

`ArtifactGraph` 用 Kahn 算法计算稳定拓扑序，并根据已完成集合返回 ready/blocked：

- [`src/core/artifact-graph/graph.ts:4-15`](../repos/openspec/src/core/artifact-graph/graph.ts)
- [`src/core/artifact-graph/graph.ts:68-113`](../repos/openspec/src/core/artifact-graph/graph.ts)
- [`src/core/artifact-graph/graph.ts:115-165`](../repos/openspec/src/core/artifact-graph/graph.ts)

Schema 先经过 Zod，再检查：

- 重复 ID
- 无效依赖
- 循环依赖

源码：

- [`src/core/artifact-graph/schema.ts:20-44`](../repos/openspec/src/core/artifact-graph/schema.ts)
- [`src/core/artifact-graph/schema.ts:60-123`](../repos/openspec/src/core/artifact-graph/schema.ts)

### 上下文装配

生成某个 artifact 的 instruction 时，代码装配：

```text
project context
artifact-specific rules
template
dependency status/path
unlocked artifacts
referenced stores
```

源码：

- [`src/core/artifact-graph/instruction-loader.ts:252-341`](../repos/openspec/src/core/artifact-graph/instruction-loader.ts)

这比“让 Agent 自己看目录”更确定，但 artifact 内容质量仍由模型和人保证。

### Store

OpenSpec 新增 Stores beta，可把规划放在独立仓库，并让多个代码仓引用同一份 specs/change。这使它从单仓 SDD 走向跨仓需求协调。

### 优势

- 状态由 artifact graph 推导，模型不能随意宣称依赖已完成。
- schema 可定制，避免所有团队被迫使用同一阶段。
- delta/archive 适合长期演化。
- 对 brownfield 和跨仓需求更友好。
- Zod、循环检测和确定性排序使控制层可测试。

### 代价

- “artifact 完成”通常由输出文件存在判定，存在不代表内容正确。
- Store/workset/schema 增加了新的领域概念。
- 验证实现仍需额外 check/review 系统。

### 与 Trellis 的关系

OpenSpec 的 artifact graph 比 Trellis 的 `status + file presence` 更通用、更确定；Trellis 的 hooks、subagent context、journals 和平台工作流更完整。两者可以组合：OpenSpec 管需求演化，Trellis 管执行 Harness。

## 3. BMAD-METHOD

> 基线：`bmad-code-org/BMAD-METHOD@717479bc3f50`
> 版本：`6.10.0`
> 技术栈：Node installer + Markdown Skills + Python helpers

### 定位

BMAD 是角色化、全生命周期、规模自适应的方法系统。它把开发拆成：

1. Analysis
2. Planning
3. Solutioning
4. Implementation

核心角色包括：

- Analyst
- Technical Writer
- Product Manager
- UX Designer
- Architect
- Developer

角色 roster 由 module YAML 声明：

- [`src/bmm-skills/module.yaml:1-54`](../repos/bmad-method/src/bmm-skills/module.yaml)
- [`src/bmm-skills/module.yaml:55-95`](../repos/bmad-method/src/bmm-skills/module.yaml)

### 模块化

BMAD 不只是一套固定 prompts。Installer 支持：

- Core
- BMM
- Builder
- Test Architecture
- Game Development
- Creative Intelligence
- 外部模块

安装器负责：

- 检测已有安装。
- 安装/移除模块和 IDE。
- 保护用户修改。
- 生成 manifest/config/help catalog。

源码：

- [`tools/installer/core/installer.js:30-126`](../repos/bmad-method/tools/installer/core/installer.js)
- [`tools/installer/core/installer.js:219-351`](../repos/bmad-method/tools/installer/core/installer.js)

### Dev Auto

`bmad-dev-auto` 是无人执行流程，强调：

- 明确 HALT 结果。
- 子 Agent 必须同步等待。
- Ready for Development 包含 actionable/logical/testable/complete。
- base/team/user 三层 TOML customization。
- 每次只加载下一个 step 文件。

源码：

- [`src/bmm-skills/4-implementation/bmad-dev-auto/SKILL.md:6-68`](../repos/bmad-method/src/bmm-skills/4-implementation/bmad-dev-auto/SKILL.md)
- [`src/bmm-skills/4-implementation/bmad-dev-auto/SKILL.md:77-123`](../repos/bmad-method/src/bmm-skills/4-implementation/bmad-dev-auto/SKILL.md)

### 优势

- 角色、工件和流程覆盖最广。
- 对初学者和大型项目都有路线。
- module/customization 适合组织级方法扩展。
- 把“业务分析和架构设计”放在编码之前。
- 多语言文档和教学材料完整。

### 代价

- 认知和文档成本最高。
- 角色 persona 可能制造表演性协作，未必增加独立证据。
- 大量工作流以 Markdown 协议执行，确定性仍弱于程序状态机。
- 安装器和模块生态本身成为复杂软件产品。

### 与 Trellis 的关系

BMAD 更像“虚拟产品研发组织”；Trellis 更像“团队工程运行制度”。BMAD 的角色和工件更丰富，Trellis 的任务状态、hook 注入和项目记忆更贴近日常仓库运行。

## 4. GSD Core

> 基线：`open-gsd/gsd-core@1bb724048a1c`
> 分支：`next`
> 版本：`1.7.0-rc.6`
> 技术栈：Node 22、TypeScript/CJS runtime、Markdown workflows

### 定位

GSD Core 直接针对 context rot，主循环：

```text
Discuss -> Plan -> Execute -> Verify -> Ship
```

每个 milestone 再拆 phase，每个重任务交给新鲜上下文的专门 Agent。

### 架构

```text
command layer
   -> workflow layer
      -> fresh-context agents
         -> gsd-tools deterministic CLI
            -> .planning/ file state
```

官方架构说明：

- [`docs/ARCHITECTURE.md:22-66`](../repos/gsd-core/docs/ARCHITECTURE.md)

核心原则：

- Fresh context per agent
- Thin orchestrators
- File-based state
- Absent = enabled
- Defense in depth

源码/文档：

- [`docs/ARCHITECTURE.md:70-105`](../repos/gsd-core/docs/ARCHITECTURE.md)

### 状态与并发

`.planning/` 保存：

- `PROJECT.md`
- `REQUIREMENTS.md`
- `ROADMAP.md`
- `STATE.md`
- `CONTEXT.md`
- phases/plans/summaries

`state.cts` 不只是文本替换，它包含：

- Markdown section/table parser。
- progress normalization。
- read-modify-write。
- PID lock 和 stale lock 处理。
- 并发与 TOCTOU 测试 seam。

源码：

- [`src/state.cts:1-51`](../repos/gsd-core/src/state.cts)
- [`src/state.cts:146-192`](../repos/gsd-core/src/state.cts)
- [`src/state.cts:194-253`](../repos/gsd-core/src/state.cts)

### Phase DAG

单 phase 内的 plan 可用 `depends_on` 形成 DAG，并通过拓扑层级计算 parallel waves：

- [`src/phase.cts:497-555`](../repos/gsd-core/src/phase.cts)

### Context Budget

GSD 明确给 workflow 文件设置 byte budget，并要求大流程拆为按需读取的 mode/reference，避免“搬到另一个文件但仍 eager import”的假优化：

- [`docs/ARCHITECTURE.md:145-203`](../repos/gsd-core/docs/ARCHITECTURE.md)

### 能力系统

当前 GSD 不只是固定 commands，还引入 capabilities：

- manifest
- registry
- command family
- overlay
- ledger/consent
- path containment

这使它逐渐成为可扩展 Harness runtime，而不是单一 GSD prompt 集。

### 优势

- 对长任务、context rot 和恢复的建模最深入。
- `.planning/` 状态和 CLI 工具大量确定性化。
- phase/plan DAG 支持并行波次。
- 对 token budget、平台 skill loader、MCP schema 成本有明确工程约束。
- 测试面广，重视并发、迁移和 fail-loud。

### 代价

- 代码与文档规模很大，概念密度高。
- `next` + RC 表明当前变化快。
- TypeScript source、编译 CJS、Markdown workflows、capability registry 多层并存。
- 适合大任务，不适合轻量日常改动。

### 与 Trellis 的关系

GSD 对执行 phase、context budget 和计划 DAG 更强；Trellis 对团队规范、跨平台投影、session task 与通用任务生命周期更集中。两者都在从 prompt framework 向 runtime 发展。

## 5. Agent OS

> 基线：`buildermethods/agent-os@cae8e664fb59`

### 定位

Agent OS 是轻量“标准提取与注入”系统，核心命令：

- discover standards
- index standards
- inject standards
- shape spec
- plan product

### 数据模型

```text
agent-os/
├── standards/
│   ├── index.yml
│   └── <area>/<rule>.md
├── specs/<timestamp-feature>/
└── product/
```

`discover-standards` 要求从 5-10 个代表文件找出 unusual/opinionated/tribal/consistent 的模式，并逐项询问 why：

- [`commands/agent-os/discover-standards.md:39-86`](../repos/agent-os/commands/agent-os/discover-standards.md)

它明确要求标准短小，因为每个词都会进入上下文：

- [`commands/agent-os/discover-standards.md:166-195`](../repos/agent-os/commands/agent-os/discover-standards.md)

### 注入

`inject-standards` 从 `index.yml` 匹配 2-5 个规则，并按 conversation/skill/plan 三种场景选择：

- 全文注入。
- 引用文件。
- 复制内容。

源码：

- [`commands/agent-os/inject-standards.md:27-90`](../repos/agent-os/commands/agent-os/inject-standards.md)
- [`commands/agent-os/inject-standards.md:92-227`](../repos/agent-os/commands/agent-os/inject-standards.md)

### Profile

Shell installer 支持 profile inheritance，父 profile 先复制，子 profile 覆盖：

- [`scripts/project-install.sh:112-157`](../repos/agent-os/scripts/project-install.sh)
- [`scripts/project-install.sh:204-250`](../repos/agent-os/scripts/project-install.sh)

### 优势

- 模型简单，容易理解和采用。
- 聚焦真正“团队部落知识”，不试图管理所有开发环节。
- standards index 让规则可发现。
- profile 适合在多个仓库复用技术栈标准。

### 代价

- 基本是 prompts + shell copying，没有任务状态机。
- 相关标准由 Agent 语义判断，选择不可重复。
- 默认 installer 会覆盖 standards，需要用户确认。
- 不能证明规则被真正执行。

### 与 Trellis 的关系

Agent OS 的 standards 对应 Trellis `.trellis/spec/` 的轻量版本；Trellis 多了任务、hooks、子 Agent、journal 和更新系统。

## 6. Spec Workflow MCP

> 基线：`Pimzino/spec-workflow-mcp@d38e82eaa8a6`
> 版本：`2.2.7`
> 技术栈：TypeScript、MCP SDK、Fastify、React、WebSocket、Vitest/Playwright

### 定位

项目用 MCP 工具驱动：

```text
requirements -> design -> tasks -> implementation
```

并提供：

- Web dashboard
- VS Code extension
- human approval
- implementation logs
- multi-project registry

### MCP Surface

核心工具只有五个：

- spec-workflow-guide
- steering-guide
- spec-status
- approvals
- log-implementation

源码：

- [`src/tools/index.ts:1-56`](../repos/spec-workflow-mcp/src/tools/index.ts)

MCP server 使用 stdio transport，将项目注册到全局 dashboard registry：

- [`src/server.ts:21-113`](../repos/spec-workflow-mcp/src/server.ts)
- [`src/server.ts:135-168`](../repos/spec-workflow-mcp/src/server.ts)

### Human Approval Gate

与很多“请用户确认”的 prompt 不同，approval 有持久化状态：

```text
pending -> approved
        -> rejected
        -> needs-revision
```

请求只传 `filePath`，dashboard 直接读文件，避免把整个文档复制进 tool call：

- [`src/tools/approvals.ts:31-87`](../repos/spec-workflow-mcp/src/tools/approvals.ts)

`tasks.md` 在发起审批前先做格式验证。pending 时返回明确 blocking 结果，并拒绝把聊天中的口头确认当成审批：

- [`src/tools/approvals.ts:290-364`](../repos/spec-workflow-mcp/src/tools/approvals.ts)
- [`src/tools/approvals.ts:414-467`](../repos/spec-workflow-mcp/src/tools/approvals.ts)

### 优势

- 把审批从 prompt 提升为外部状态。
- MCP 对多种 Agent 客户端天然通用。
- dashboard 对人类监督更直观。
- implementation log 保存任务对应的实现事实。
- 有单元、集成和 Playwright E2E。

### 代价

- 需要常驻 dashboard/registry，部署比纯文件方案重。
- README 明确作者暂时休整，维护节奏有风险。
- GPL-3.0，复用代码需审查。
- MCP tool surface 小，很多工作流仍由生成 prompt 控制。
- README 的“enterprise-grade security”不能替代认证；项目也明确说明外网暴露需反向代理。

### 与 Trellis 的关系

Spec Workflow MCP 的最大启示是 **审批应该有不可混淆的外部状态**。Trellis 的用户确认多在会话协议中，若需要强治理，可以借鉴这种 dashboard/approval record。

## 7. 横向对比

| 维度 | Spec Kit | OpenSpec | BMAD | GSD | Agent OS | Spec Workflow MCP |
|---|---|---|---|---|---|---|
| 核心抽象 | feature phases | artifact graph | role/workflow | phase/plan | standard | MCP workflow |
| 状态强度 | 中 | 高 | 中 | 高 | 低 | 中高 |
| 小任务成本 | 高 | 低中 | 高 | 高 | 低 | 中 |
| 跨平台 | 强 | 强 | 强 | 强 | 中 | MCP 通用 |
| 人工审批 | prompt | 可配置 | prompt | gate/checkpoint | prompt | 持久化 approval |
| 确定性机制 | CLI/workflow | graph/schema | installer/config | CLI/state/DAG | shell/profile | approval/tool state |
| 最适场景 | 完整 SDD | brownfield 变更 | 全生命周期方法 | 长任务 | 团队规则 | 可视化审批 |

## 关键思考点

1. Spec Kit 的 YAML workflow 与 OpenSpec artifact graph，哪个更适合作为通用执行引擎？
2. BMAD 的角色分工如何避免只是 persona 更换？
3. GSD 的 byte budget 是否应该成为所有 Harness 的质量门禁？
4. Agent OS 为什么刻意不做任务状态机？
5. Spec Workflow MCP 的审批状态能否与 GitHub PR review 复用，而不新增 dashboard？
