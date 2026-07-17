# 02. 生态全景与发展现状

## 1. Agent Skill 到底是什么

日常类比：如果模型是一个通用员工，Tool 是它能拿起的工具，MCP 是外部工具和数据的统一插座，那么 Skill 是一份按需打开的岗位手册，告诉它在某类任务中应遵守什么流程、调用哪些工具、如何验证和交付。

技术定义：Agent Skill 是一个以 `SKILL.md` 为入口的目录。入口包含 YAML frontmatter 和 Markdown 指令，目录还可带：

- `scripts/`：确定性代码；
- `references/`：按需加载的长文档；
- `assets/`：模板、字体、样例和静态资源；
- 其他宿主或项目约定的文件。

开放规范的最小要求只有 `SKILL.md`、`name` 和 `description`。这使 Skill 很容易跨宿主迁移，也意味着版本、安全、分发和评测不会自动存在。

## 2. 与相邻概念的边界

| 概念 | 主要解决 | 何时加载 | 是否可执行 | 典型状态 |
|---|---|---|---|---|
| System Prompt / `AGENTS.md` | 全局身份、项目规则、永久约束 | 每轮或会话开始 | 间接 | 项目级、总是存在 |
| Skill | 特定任务的程序性知识 | 相关时按需 | 可携带脚本 | 可移植、可组合 |
| Command | 用户显式调用的入口 | 用户调用时 | 可 | 带参数的一次工作流 |
| Agent/Subagent | 隔离上下文中的专职执行者 | 被调度时 | 可 | 有独立上下文和任务 |
| Hook | 生命周期事件上的确定性自动化 | 事件发生时 | 是 | UserPromptSubmit、PreToolUse、Stop 等 |
| MCP | 外部数据和能力协议 | 工具发现/调用时 | 是 | Server、Tool、Resource |
| Plugin | 一组扩展的安装与分发单元 | 安装后 | 取决于内容 | Skill + Command + Agent + Hook + MCP |
| Harness | 端到端任务运行制度 | 整个任务周期 | 是 | 状态、预算、检查点、验证、恢复 |

常见误区：

- Skill 不是“更长的 Prompt”。它还包含路由、资源、脚本和交付契约。
- Skill 不等于 Tool。Skill 可以教 Agent 怎样用 Tool，但 Tool 提供实际能力。
- Plugin 不等于 Skill。Plugin 是包装和分发层，可以没有 Skill，也可以包含多个 Skill。
- Harness 不等于多 Agent。单 Agent 也可有严格 Harness；多 Agent 只是执行策略。

## 3. 生态九层模型

### 3.1 规范层

代表：`agentskills/agentskills`

解决：

- 目录和 frontmatter 最小格式；
- 名称、描述和兼容性约束；
- 渐进加载；
- reference validator。

不解决：

- registry、版本和安装；
- 宿主工具名；
- Skill 的真实行为质量；
- 安全认证；
- Skill 之间如何编排。

关键意义：把程序性知识从宿主私有配置中抽出来，成为普通文件和 Git 可以管理的资产。

### 3.2 官方模式层

代表：`anthropics/skills`

官方样例展示了三种复杂度：

1. 纯指令 Skill，如设计、沟通。
2. 指令 + reference，如 API 文档。
3. 指令 + 脚本 + schema + 资产，如 DOCX/PPTX/XLSX/PDF。

`skill-creator` 进一步展示 Skill 自身也可成为开发工具：访谈、生成、with/without 对照、assertion、benchmark、人工 review、再迭代。

### 3.3 内容与领域工程层

代表：

- `garden-skills`
- Addy Agent Skills
- Matt Pocock Skills
- Scientific Agent Skills

它们把不同知识编码进 Skill：

- `garden-skills`：视觉、图像、文章、演示、知识检索；
- Addy：软件工程完整生命周期；
- Matt：小而可组合的工程实践和用户对齐；
- Scientific：科学包、数据库、研究方法和实验工作流。

这一层的核心不是目录格式，而是“如何把专家判断写成模型能稳定执行的工作流”。

### 3.4 发现与索引层

代表：

- Awesome Claude Skills
- Awesome Agent Skills
- skills.sh 生态
- `skill-factory` 的多注册表级联

解决：

- 去哪里找；
- 如何分类；
- 如何看热度、来源、许可证和新鲜度；
- 如何避免只依赖一个市场。

当前状态：数量增长远快于统一质量评分。Awesome List 的“精选”仍主要是人工准入，不是持续安全审计。

### 3.5 安装与分发层

代表：

- `vercel-labs/skills`
- Claude Plugin Marketplace
- GitHub Release ZIP
- Git submodule

`npx skills` 解决跨宿主目录差异：

```text
source URL / owner/repo
  -> clone/blob/well-known provider
  -> discover SKILL.md
  -> 用户选择 Skill 与 Agent
  -> 写入 canonical .agents/skills
  -> 给非统一宿主建立 symlink 或 copy
  -> 写 lock / provenance
```

Plugin Marketplace 解决复合扩展：

```text
marketplace entry
  -> pinned source / local source
  -> plugin manifest
  -> skills + commands + agents + hooks + MCP
```

当前分发形态并未完全统一：

- Git + `npx skills` 更通用、可修改；
- Plugin 更适合订阅式更新和复合能力；
- release ZIP 更适合 CI、离线和固定字节；
- submodule 更适合 vendoring 和精确 commit。

### 3.6 触发与编排层

代表：

- 宿主原生 description routing
- Superpowers
- Compound Engineering
- Claude Code Infrastructure Showcase

原生触发依赖 `description`。问题是模型可能漏触发、误触发或只读 description 不读正文。

补强方式：

- Superpowers：会话开始 Hook 注入 `using-superpowers`，要求任何动作前检查 Skill。
- Addy：用 lexical routing eval 校准 description。
- Infrastructure Showcase：UserPromptSubmit 用 regex/AI 预测；PreToolUse 可阻塞编辑；PostToolUse 记录真实 Skill 激活。
- Compound Engineering：用户通过明确 Skill 入口进入流水线，内部再调度 reviewer 和子流程。

### 3.7 安全与治理层

代表：Cisco Skill Scanner

主要风险：

- Prompt injection；
- 隐藏的数据外传；
- 读取环境变量后发往网络；
- 恶意 shell/Python；
- archive path traversal / zip bomb；
- bytecode 与源码不一致；
- tool 权限过宽；
- vague trigger 导致意外激活；
- 多 Skill 描述冲突；
- 上游更新后的供应链漂移。

Scanner 采用多引擎：

```text
loader / archive extraction
  -> static + YARA + bytecode + pipeline
  -> behavioral AST dataflow
  -> LLM semantic analysis with static enrichment
  -> optional meta-analyzer filter
  -> policy severity override / disabled rules
  -> JSON / Markdown / SARIF / HTML
```

安全边界：没有 findings 不等于安全；自动扫描必须和来源审查、权限约束、人工 review 组合。

### 3.8 评测层

代表：

- Addy 的 routing eval；
- Anthropic Skill Creator；
- `agent-skills-eval`；
- Superpowers 自身 skill behavior drill。

评测至少有三类：

| 评测 | 输入 | 输出 | 主要发现 |
|---|---|---|---|
| 结构验证 | Skill 文件 | pass/fail | 能否被解析 |
| 触发/路由 | 正负 prompt + descriptions | rank、冲突 | 漏触发、误触发 |
| 行为 A/B | 同 prompt 的 with/without Skill | assertion、时间、token、人工评分 | Skill 是否改变行为并产生价值 |

`agent-skills-eval` 的核心是：

```text
load Skill + evals
  -> with_skill system message
  -> without_skill baseline
  -> target model
  -> deterministic tool assertions + LLM rubric judge
  -> timing/token/outputs/grading artifacts
  -> benchmark + HTML report
```

局限：

- 单次模型输出有方差；
- judge 会偏；
- baseline 可能不公平；
- 模拟 Tool 不等于真实环境；
- assertion 写得差会奖励错误行为；
- “平均变好”不代表所有场景都安全。

### 3.9 优化与回流层

代表：

- SkillOpt；
- Scientific `autoskill`；
- Compound `ce-compound`；
- Skill Factory 的 session eval。

SkillOpt 把 Skill 文本视为可训练状态：

```text
rollout
  -> reflect success/failure
  -> aggregate patches
  -> rank/select edits
  -> apply candidate
  -> held-out validation gate
  -> accept/reject
  -> best_skill.md
```

`SkillOpt-Sleep` 再把日常会话离线转成候选任务，回放后生成 staged update，由 held-out gate 和人工 adopt 控制。

`autoskill` 从 screen history 发现重复工作，先做本地聚类和敏感信息清理，再判断 reuse / compose / novel。

`ce-compound` 不直接优化一份 Skill，而是把已解决问题写成可检索 solution doc，让后续 brainstorm/plan 复用。

## 4. `garden-skills` 在生态中的定位

### 4.1 它不是规范

`manifest.json`、独立 SemVer、localized README、release ZIP 都是该仓的工程约定，不是 Agent Skills 开放规范的强制字段。

### 4.2 它不是通用安装器

安装依赖 `npx skills`、Claude Plugin Marketplace、Git、ZIP 等外部机制。它自身只维护发布脚本。

### 4.3 它是“少量深技能 + 产品化发布”

当前 5 个 Skill：

- `web-video-presentation`
- `web-design-engineer`
- `gpt-image-2`
- `kb-retriever`
- `beautiful-article`

共同模式：

- 精确 scope；
- 按阶段读取 reference；
- checkpoint 控制用户决策；
- 复杂任务持久化中间文件；
- 模型判断与确定性脚本分工；
- 不支持时显式降级，不伪造结果；
- 用视觉/交付协议避免 generic output。

### 4.4 它已经从旧快照明显演进

2026-06-18 的旧材料只覆盖早期版本。当前代码显示：

- 增加 `web-video-presentation`；
- `gpt-image-2` 明确 A/B/C 三种运行模式；
- `beautiful-article` 使用 `reacticle` 组件协议和多阶段 reviewer；
- 每个 Skill 有独立 manifest 版本；
- tag 触发 GitHub Release；
- ZIP 带 SHA-256；
- root README 下载链接由最新发布 tag 自动同步；
- Claude Plugin Marketplace 已纳入 5 个 plugin pack；
- 根仓包含 demo 和独立 website。

## 5. 发展时间线

> 日期来自项目创建/公开信息，只用于理解演进，不作为完整行业史。

### 2025 下半年：格式和官方样例形成

- Anthropic 公开 Skills 示例。
- 社区出现 Superpowers、Awesome Claude Skills 等早期方法论与目录。
- Skill 的核心叙事是“按需加载的程序性知识”。

### 2025 年末到 2026 年初：开放标准和跨宿主扩散

- `agentskills.io` 规范与 validator 明确最小契约。
- Codex、Gemini CLI、Cursor、OpenCode 等逐步支持相似目录。
- `npx skills` 开始处理跨宿主安装。

### 2026 上半年：供应链、市场和垂直集合

- 大型领域集合增长；
- Plugin Marketplace 承载 Skill + Hook + Agent + MCP；
- 文档到 Skill 自动生成工具出现；
- Skill Scanner 等安全工具开始覆盖提示和代码。

### 2026 年中：评测和自动优化成为新主线

- with/without Skill 对照评测工具出现；
- 多技能 description routing eval 进入 CI；
- SkillOpt 把自然语言 Skill 当作可训练状态；
- session history、usage metrics、auto-skill discovery 开始反哺 Skill。

## 6. 当前发展现状

### 已相对成熟

- 最小文件格式；
- Git 版本管理；
- 多宿主安装；
- Plugin 复合分发；
- reference/script/assets 的渐进加载；
- 领域 Skill collection；
- 静态格式检查。

### 正在快速发展

- 跨注册表搜索与 provenance；
- 触发准确率；
- 安全扫描和供应链 pin；
- with/without 行为 eval；
- 多宿主字段兼容；
- Skill 自动生成和增量同步；
- 轨迹驱动优化。

### 尚未形成统一答案

- 通用 registry 与信任体系；
- Skill 签名、来源证明和不可变版本；
- 跨模型/跨宿主一致行为标准；
- 企业级集中审批和撤销；
- 安全权限能否由 `allowed-tools` 真正强制；
- 评测数据和 judge 标准；
- Skill 组合冲突；
- 自动演进的回滚、审计和责任边界；
- Skill 对真实业务结果的长期提升。

## 7. 关键技术趋势

### 7.1 从 Prompt 到自然语言软件包

Skill 开始具备：

- 入口和路由；
- 依赖和兼容性；
- 版本；
- 单元式验证；
- 发布 artifact；
- 安全报告；
- 使用遥测；
- 优化历史。

这使 Skill 更接近软件包，但它仍有模型概率性，不能照搬传统库的确定性假设。

### 7.2 从“知识”转向“流程 + 证据”

高质量 Skill 不只是告诉模型“应该怎么做”，还会规定：

- 先读取什么；
- 何时停下问用户；
- 哪些中间状态落盘；
- 验证需要什么证据；
- 失败如何降级；
- 什么不能声称完成。

### 7.3 从单 Skill 转向组合 Harness

Superpowers 和 Compound Engineering 表明，多个 Skill 的价值依赖顺序和状态：

```text
需求澄清 -> 计划 -> 实现 -> 简化 -> 评审 -> 验证 -> 知识回流
```

如果只是把十几个 Skill 同时暴露给模型，而没有路由和阶段契约，集合规模反而会增加冲突。

### 7.4 从“信任仓库”转向供应链审查

Skill 可执行脚本并访问环境，因此风险不低于普通依赖。趋势包括：

- commit SHA pin；
- release checksum；
- provenance manifest；
- pre-commit/CI scanner；
- SARIF；
- permission declaration；
- staged adoption；
- 许可证和新鲜度检查。

### 7.5 从手工调 Prompt 到数据驱动优化

优化信号逐渐来自：

- 正负触发样本；
- with/without 对照；
- tool call；
- timing/token；
- 用户反馈；
- session conversion；
- held-out task；
- rejected update buffer。

但自动优化的前提是验证门可靠，否则只会更快放大偏差。

## 8. 当前最值得关注的矛盾

### 8.1 便携性 vs 宿主增强

只用规范字段最便携，但无法表达：

- Claude command 参数；
- Hook；
- MCP；
- OpenClaw gating；
- Hermes credentials；
- 模型选择；
- 专有工具权限。

生产仓通常通过 `metadata` 或 Plugin manifest 扩展，代价是兼容矩阵和验证复杂度上升。

### 8.2 渐进加载 vs 深层引用

把内容拆小能省上下文，但过深链路可能导致 Agent 不读取关键文件。规范建议从入口一层直达；`garden-skills` 用阶段读取表和重复提醒解决“长会话遗忘”。

### 8.3 强制流程 vs 任务效率

强制 brainstorm、TDD、review 能提高复杂任务稳定性，也可能让简单任务承担过多开销。成熟项目开始：

- 按风险和 diff 大小选择 reviewer；
- 为 quick review 建短路；
- 区分 mandatory、recommended；
- 用模型 tier 控制成本；
- 只在高价值节点写 review artifact。

### 8.4 规模 vs 可维护性

149 个科学 Skill 或 1,000+ 索引能覆盖更多领域，但带来：

- 重复；
- description collision；
- 版本漂移；
- 依赖和凭证差异；
- 安全报告噪音；
- 文档更新成本。

大型集合必须有 schema、版本、scanner、贡献规范和自动检查，否则只是文件堆。

### 8.5 自动化 vs 人类控制

`garden-skills` 强 checkpoint；SkillOpt 强 held-out gate；autoskill 强 staged proposal；Compound 强 artifact 和 consent。这些项目共同拒绝“模型自行生成后立即覆盖生产 Skill”。

## 9. 对本仓的直接启示

1. 保持 `.claude/skills/` 为唯一源码，兼容目录只做 symlink。
2. 每个 Skill description 同时写清 what、when、not-for。
3. 复杂 Skill 用阶段路由表，不让 Agent 一次读完所有 reference。
4. 确定性逻辑写脚本，模型负责判断和解释。
5. 添加或修改 Skill 时，同时检查：
   - 格式；
   - 触发；
   - 行为；
   - 安全；
   - 多运行时 manifest。
6. Skill 数量不是目标；重叠、过期和没人调用的 Skill 应合并或退役。
7. 任何自动学习先写 staging，再通过独立验证和人工 adopt。
8. 对可发布 Skill 增加 immutable artifact、checksum 和来源记录。
