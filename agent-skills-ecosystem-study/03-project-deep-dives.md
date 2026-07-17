# 03. 逐项目深度分析

## 阅读说明

每个档案都基于 `06-repository-inventory.md` 中的 pinned commit。这里优先写源码可见事实；项目 README 的规模或效果主张会标为“项目自述”。

## 1. ConardLi/garden-skills

### 定位

少量、深度、生产化的跨宿主 Skill collection。当前包含 5 个 Skill，不追求目录规模，重点是视觉/内容任务的方法论、用户 checkpoint 和发布工程。

### 架构主链

```text
root README / marketplace
  -> skills/<name>/SKILL.md
  -> 阶段路由到 references / themes / scripts / assets
  -> 生成工作区和中间文件
  -> reviewer / checkpoint / repair
  -> 交付物

maintainer change
  -> manifest.json
  -> validate + pack
  -> <skill>-v<semver> tag
  -> GitHub Action
  -> ZIP + SHA256 + Release
  -> localized README download link sync
```

### 核心功能

- `web-video-presentation`：文章/口播到点击驱动 16:9 演示，可接 TTS。
- `web-design-engineer`：页面、dashboard、prototype、slides 的设计工程流程。
- `gpt-image-2`：18 类结构化图像模板，支持生成和编辑。
- `kb-retriever`：本地分层知识库的渐进检索。
- `beautiful-article`：素材到单文件 HTML 文章的编辑型 Harness。

### 关键实现

- `SKILL.md` 既是触发契约，也是阶段路由器。
- `gpt-image-2` 首先运行 mode probe，再在：
  - A：本地 API 出图；
  - B：委托宿主图像 Tool；
  - C：只交付 Prompt；
  之间显式分流，失败不伪装成功。
- `beautiful-article` 把 Source、Plan、First Spread、Full Build、Final Review、Repair 分成文件化阶段，只在高价值节点启动 reviewer。
- `web-video-presentation` 用每章 `narrations.ts` 统一 step 和音频段，减少多份状态漂移。
- release tooling 从 tag 读取“已发布版本”，而不是直接使用开发中的 manifest，避免 README 提前指向不存在的 artifact。
- `pack-skill.mjs` 生成顶层目录稳定的 ZIP，并输出 SHA-256；`validate-skills.yml` 会 smoke pack 全部 Skill。

### 代码组织

```text
skills/<skill>/
  SKILL.md
  manifest.json
  README*.md
  references/
  scripts/
  assets|templates|themes/
scripts/release/
.claude-plugin/marketplace.json
demo/
website/
```

人类文档、Agent 指令、发布元数据三者独立，这是比“所有信息塞进 SKILL.md”更稳定的组织方式。

### 工程质量与缺口

优势：

- per-skill SemVer；
- immutable release artifact；
- checksum；
- localized README 漂移检查；
- 清晰 checkpoint；
- 模式降级和输出目录契约。

缺口：

- 仓内没有独立安全扫描门；
- 没有 with/without Skill 行为 eval；
- 没有多 Skill description collision/routing eval；
- 自定义 manifest 不是开放规范字段，需要本仓工具维护；
- 部分 Skill 依赖宿主 subagent 能力，跨宿主行为不会完全一致。

### 推荐精读

1. `scripts/release/lib/skills.mjs`
2. `scripts/release/cut-release.mjs`
3. `skills/beautiful-article/SKILL.md`
4. `skills/gpt-image-2/SKILL.md`
5. `skills/web-video-presentation/references/CHAPTER-CRAFT.md`

### 思考点

- checkpoint 的收益是否值得所有视觉任务都暂停多次？
- `manifest.json` 应留在项目私有约定，还是迁入规范 `metadata`？
- 如果补 eval，应先验证触发、交付物结构，还是视觉质量？

## 2. ConardLi/reacticle

### 定位

`beautiful-article` 实际生成代码所依赖的 React 语义组件协议。它把“Agent 自由写 HTML”收敛为“语义组件 + 主题 token + Raw 自由表达”。

### 架构主链

```text
Agent writes Article.tsx
  -> semantic React components
  -> ThemeProvider data-theme
  -> CSS custom properties --ra-*
  -> Vite library/site build
  -> optional single-file HTML / print
```

### 核心功能

- 结构：Article、Hero、Lead、Section、Subsection、TOC、Conclusion。
- 观点：Summary、Aside、Quote。
- 数据：Table、Image、Video、Audio。
- 决策：RiskList、Decision、ActionList、Checkpoint、Tradeoff、Incident。
- 技术：CodeBlock、Formula、DiffReview。
- 交互：Detail、Tabs。
- 自由层：Raw。

### 关键实现

- `ThemeProvider` 只设置 `data-theme`，组件通过 CSS token 获取风格；内容代码不硬编码主题细节。
- `Article` 从真实 DOM 的 `data-ra-toc` 自动生成目录，而不是遍历静态 React children，因此 Section 包在其他组件内仍可被发现。
- `MissingField` 把缺失必填项渲染成可见告警，不静默吞掉不完整数据。
- `Image` 拒绝内联 SVG，把真实图片与定制图形的职责拆开；后者必须走 `Raw`。
- `Raw` 可包含任意 React/SVG/Canvas，但要求使用主题 token，形成“受约束的自由”。
- KaTeX、PrismJS 分别处理公式和高亮代码，Vite 同时构建库和文档站。

### 代码组织

按语义职责分包，而不是按页面：

```text
src/components/
  structure/
  insight/
  structured/
  decision/
  technical/
  interaction/
  free/
  internal/
src/theme/
src/export/
apps/site/
```

### 取舍

- 优点：Agent 输出更稳定、结构可检查、主题可切换、组件 vocabulary 可复用。
- 代价：协议外表达要进入 `Raw`；`dangerouslySetInnerHTML` 需要调用方保证内容可信；当前没有独立测试目录，更多依赖类型检查和展示站。

### 推荐精读

1. `src/index.ts`
2. `src/components/structure/Article.tsx`
3. `src/components/free/Raw.tsx`
4. `src/components/internal/MissingField.tsx`
5. `src/theme/ThemeProvider.tsx`

### 思考点

- “可见缺字段”是否应该升级为构建失败？
- Raw 如何在自由度、安全和主题一致性之间增加静态约束？

## 3. ConardLi/gpt-image-2-101

### 定位

`gpt-image-2` 的案例浏览器和证据网站。它不负责模型调用，而负责把模板、Prompt、图片和分类编译成前端可浏览的数据集。

### 架构主链

```text
case mapping + prompt files + Skill reference templates
  -> scripts/build-data.mjs
  -> templates/cases/docs JSON
  -> React gallery
  -> hash router
  -> case detail / playground / skills page
```

### 关键实现

- 构建脚本读取 `_mapping.json`，关联每个案例的 Prompt、原图和对应模板 Markdown。
- Sharp 以固定宽度和质量生成 WebP 缩略图，限制并发，原 PNG 只在详情页加载。
- 构建时把模板正文嵌入 `cases.json`，运行时避免再次读取 Skill 仓。
- 简单 hash router 用 `history.pushState` 防止关闭详情页时因 hash 清空导致滚动跳顶。
- App 用 ref 保存进入 overlay 前的滚动位置，清理 body overflow 后二次恢复。

### 代码组织

```text
scripts/build-data.mjs
src/data/         # 构建后静态 manifest
src/lib/          # data + router
src/components/
  gallery/
  hero/
  playground/
  skills/
  shared/
public/case/      # sparse checkout 中未物化的大型图片语料
```

### 取舍

- 优点：Skill 模板有可视证据；构建期聚合换取运行时简单；缩略图显著降低浏览成本。
- 代价：仓库主要体积来自图片；源码仓和 Skill 仓之间依赖路径较强；案例质量不是自动 benchmark。

### 推荐精读

1. `scripts/build-data.mjs`
2. `src/lib/router.ts`
3. `src/components/gallery/CaseDetail.tsx`

## 4. agentskills/agentskills

### 定位

Agent Skills 开放规范、文档和 Python reference library。它是格式事实源，不是 marketplace。

### 架构主链

```text
SKILL.md
  -> parser: YAML frontmatter + body
  -> SkillProperties
  -> validator
  -> errors / CLI output
  -> optional to_prompt serialization
```

### 核心契约

- `name` 和 `description` 必填；
- name 需匹配目录；
- compatibility、license、metadata、allowed-tools 可选；
- metadata 常驻约 100 token；
- 正文激活后加载，建议低于 500 行/5000 token；
- resources 按需读取；
- 引用应尽量从入口一层直达。

### 关键实现

- `strictyaml` 解析 frontmatter；
- validator 分开校验 name、description、compatibility 和额外字段；
- 测试覆盖大小写、Unicode normalization、目录不匹配、未知字段和长度边界；
- `to_prompt` 把多个 Skill properties 序列化为宿主可注入的 Prompt。

### 取舍

- 极简规范促进跨宿主兼容；
- 不规定 version、registry、dependency 或执行语义，允许生态创新，也造成碎片化。
- `allowed-tools` 是实验字段，宿主不一定强制。

### 推荐精读

1. `docs/specification.mdx`
2. `skills-ref/src/skills_ref/parser.py`
3. `skills-ref/src/skills_ref/validator.py`
4. `skills-ref/tests/`

## 5. anthropics/skills

### 定位

Anthropic 官方公开的 Skill 样例和实际文档能力参考实现。18 个 Skill 覆盖创意、开发、企业沟通、API 和 Office/PDF。

### 架构主链

```text
marketplace plugin pack
  -> selected skill
  -> SKILL.md router
  -> references / scripts / schema / assets
  -> artifact generation or analysis
  -> format-specific QA
```

### 关键实现

- DOCX/PPTX/XLSX 携带大量 OpenXML schema 和 Python 脚本，说明复杂 Skill 本质是“说明书 + 工具包”。
- PPTX Skill 把 read、edit、from-scratch 路由到独立参考，并强制内容 QA、渲染图片、视觉 QA、修复再验证。
- Skill Creator 提供完整迭代：
  - 访谈意图；
  - 写 Skill；
  - 定义 eval prompt；
  - 同时跑 with-skill 和 baseline；
  - assertion grading；
  - benchmark；
  - 人工 viewer review；
  - 修改后再跑。
- Marketplace 把文档 Skill、示例 Skill、Claude API Skill 分成三个 pack。

### 代码组织

每个 Skill 自包含；官方没有强制所有 Skill 采用同样子目录。复杂文档 Skill 文件多，简单沟通 Skill 只有一个 `SKILL.md`，体现“复杂度按问题增长”。

### 取舍与边界

- 文档 Skill 中部分内容是 source-available/proprietary，不应把“公开可读”误写成“全部开源”。
- 官方样例展示能力上限，但不代表所有宿主都拥有相同工具和依赖。

### 推荐精读

1. `skills/skill-creator/SKILL.md`
2. `skills/pptx/SKILL.md`
3. `skills/docx/scripts/`
4. `.claude-plugin/marketplace.json`

## 6. anthropics/claude-plugins-official

### 定位

Claude Code 官方 Plugin Directory。它治理的是复合扩展分发，不只是 Skill。

### 架构主链

```text
marketplace.json entry
  -> local source / URL / git-subdir
  -> ref + SHA pin where applicable
  -> plugin.json
  -> skills / commands / agents / hooks / MCP
```

### 关键实现

- `plugins/` 是 Anthropic 维护项目，`external_plugins/` 是第三方。
- marketplace 中 plugin `name` 是不可变 slug；显示名变化用 `displayName`，不可避免的迁移用 `renames`。
- 外部源可使用 `git-subdir` + `ref` + `sha`，降低浮动上游供应链风险。
- 无 plugin manifest 的纯 Skill 仓可通过 `strict:false` + 显式 skills 数组打包。
- example plugin 同时展示：
  - `plugin.json`
  - `.mcp.json`
  - model-invoked Skill
  - user-invoked Skill
  - legacy command

### 取舍

- Plugin 能封装更完整能力，但平台特定性高于纯 Agent Skill。
- 官方目录明确提示“不控制第三方插件后续内容”，目录准入不等于持续安全保证。

### 推荐精读

1. `README.md`
2. `.claude-plugin/marketplace.json`
3. `plugins/example-plugin/`

## 7. vercel-labs/skills

### 定位

跨 70+ Agent 的开放 Skill CLI，提供 add/use/remove/list/find/update/init/sync 和 lock restore。

### 架构主链

```text
CLI args
  -> source-parser
  -> provider / git / blob fetch
  -> discoverSkills
  -> agent detection + user selection
  -> canonical install
  -> symlink or copy to agent paths
  -> skills-lock + local lock + telemetry
```

### 关键实现

- `agents.ts` 维护宿主路径、全局路径和安装探测。
- 统一宿主优先使用 `.agents/skills` canonical 目录，避免重复；其他宿主建立相对 symlink。
- symlink 创建前解析 parent symlink，防止 `.claude/skills` 已指向 canonical 时形成自环或误删。
- Windows 使用 junction；失败可降级 copy。
- `sanitizeName` 和 `isPathSafe` 防路径穿越。
- 支持 SSH private repo，并在 lock 中保留 SSH URL，避免恢复时被错误转成 HTTPS。
- 安装前可展示第三方安全审计数据；OpenClaw 有额外风险确认。
- 100 个源码文件中约 45 个测试，重点覆盖来源解析、安装、lock、remove、update 和 agent detection。

### 取舍

- 优点：统一安装面、较强路径安全、可恢复 lock、宿主覆盖广。
- 代价：宿主兼容表持续膨胀；symlink 行为在不同平台复杂；安全审计数据依赖外部服务，不能替代本地源码 review。

### 推荐精读

1. `src/add.ts`
2. `src/installer.ts`
3. `src/agents.ts`
4. `src/source-parser.ts`
5. `src/skill-lock.ts`

## 8. travisvn/awesome-claude-skills

### 定位

早期 Claude Skills 精选列表和教育入口。代码几乎全在 README，不是安装器。

### 核心功能

- 解释 progressive disclosure；
- 分类官方/社区 Skill、工具和教程；
- 对比 Skill、MCP、Prompt、Subagent；
- 提供安全审查提醒；
- 收录 Skill Seekers、Superpowers 等生态项目。

### 价值与局限

- 价值：保留 2025 年生态早期结构和用户教育视角。
- 局限：更新时间和链接会漂移；收录不是审计；Claude-only 表述已落后于跨宿主生态。

### 推荐精读

`README.md` 的 Skills vs Other Approaches、安全和时间线部分。

## 9. VoltAgent/awesome-agent-skills

### 定位

跨 Claude、Codex、Gemini、Cursor 等宿主的大型精选目录，重点收录官方团队和已有社区采用的 Skill。

### 关键组织

- 按发布团队分类官方 Skill；
- 单独列社区 Skill；
- 提供各宿主 project/global 路径；
- 明确质量标准：description、渐进加载、无绝对路径、工具最小权限；
- 明确“curated, not audited”。

### 价值与局限

- 价值：广度和组织信号强，可作为领域地图和候选入口。
- 局限：近 1500 条链接由上游维护，内容可在收录后变化；README 规模巨大；无法证明每个 Skill 的行为或安全。

### 推荐精读

`README.md` 的目录、Skill Quality Standards 和 Security Notice。

## 10. rooftop-Owl/skill-factory

### 定位

一个刻意不写运行时的 Skill 生命周期管理 Plugin：用 3 个 Skill、9 个 Command 和 1 个 evaluator Agent 驱动现有 coding agent 工具。

### 架构主链

```text
command
  -> procedural Skill
  -> native shell/git/npx/curl
  -> .claude/skills
  -> manifest provenance
  -> list/health/audit/remove
```

### 关键实现

- 搜索按 T0-T5 级联：本地、结构化 API、CLI、GitHub、Awesome List、官方 Plugin。
- 首层有足够命中就停止，控制延迟和噪音。
- import 后写 `.claude/skill-factory/manifest.json`，remove 只处理自己跟踪的内容，并保留 removed_at。
- acquisition 分为可信自动安装、社区人工 review、从官方文档合成。
- 明确 same-session newly installed Skill 不会自动发现，需要直接读取注入。

### 取舍

- 优点：可移植、没有语言依赖、流程容易审计。
- 代价：关键行为由模型解释 shell 片段完成，确定性和错误处理弱于真正 CLI；README 中 registry 规模和 API 可随时变化；项目采用信号很低，应视为架构样例而非成熟基础设施。

### 推荐精读

1. `skills/skill-management/SKILL.md`
2. `skills/external-skill-acquisition/SKILL.md`
3. `handbook/search-tiers.md`

## 11. obra/superpowers

### 定位

以 Skill 为载体的软件开发方法论 Harness，核心不是某个领域知识，而是强制设计、计划、TDD、review 和完成验证。

### 架构主链

```text
SessionStart Hook
  -> inject using-superpowers
  -> skill check before action
  -> brainstorming
  -> worktree
  -> writing plan
  -> subagent-driven development / executing plan
  -> TDD + task review
  -> final review
  -> finish branch
```

### 关键实现

- SessionStart 脚本读取完整 `using-superpowers`，针对 Claude/Cursor/Copilot 输出不同 JSON 字段。
- `using-superpowers` 把“先查 Skill”写成强约束，并列出常见逃避理由。
- `subagent-driven-development` 为每个 task 启动 fresh implementer，再做 spec + quality review。
- 用 task brief、report、review package 文件交接，避免把大段 diff 和历史塞回主上下文。
- 用 `.superpowers/sdd/progress.md` 作为 compaction 后恢复账本。
- 支持多种 plugin manifest 和多宿主安装。

### 工程质量

- 14 个顶层 Skill；
- 大量 shell/plugin 测试和行为 eval；
- 清楚区分 cheap/standard/ceiling 模型；
- 强调 review finding 必须修复后再继续。

### 取舍

- 优点：流程一致、反跳步、证据优先、长任务恢复强。
- 代价：简单任务也可能承担较高流程开销；极强措辞可能压制宿主的合理自主判断；多宿主 Hook 差异增加维护成本。

### 推荐精读

1. `hooks/session-start`
2. `skills/using-superpowers/SKILL.md`
3. `skills/subagent-driven-development/SKILL.md`
4. `skills/systematic-debugging/SKILL.md`

## 12. addyosmani/agent-skills

### 定位

覆盖 spec、plan、build、test、review、ship 的工程生命周期 Skill pack，强调标准化 anatomy 和可测路由。

### 架构主链

```text
8 lifecycle commands
  -> 24 focused skills
  -> optional reviewer agents / hooks
  -> structural validation
  -> trigger/routing eval
  -> behavioral eval
```

### 关键实现

- Skill anatomy 规定 Overview、When to Use、Core Process、Rationalizations、Red Flags、Verification。
- description 必须写 what + when，但不应把完整流程摘要塞进 description，防止模型只执行摘要。
- Tier 2 用 stemmed TF-IDF 近似路由：
  - 正样本检查 top-k；
  - 负样本检查 owner outrank；
  - description 相似度检查 collision；
  - CI 设置 rank-1 floor。
- Tier 3 用 headless Claude 在临时 Git 仓执行真实 fixture，再基于完整 trace grading。
- execution/dialogue 分开，避免把“对话本身是产物”当作逃避真实执行的通用借口。

### 取舍

- 优点：多 Skill 集合中少见的路由和行为双层 eval；结构统一；压力测试能检查反跳步能力。
- 代价：TF-IDF 只看词汇，不理解真正语义；behavioral eval 依赖特定 CLI 和 token；统一 anatomy 可能使不同领域 Skill 过于同形。

### 推荐精读

1. `docs/skill-anatomy.md`
2. `evals/README.md`
3. `scripts/run-evals.js`
4. `skills/context-engineering/SKILL.md`

## 13. mattpocock/skills

### 定位

从个人真实工程流程提炼的小型可组合 Skill 集合，反对由大框架完全接管流程。

### 架构主链

```text
setup
  -> 用户显式 orchestration skills
  -> model-invoked discipline skills
  -> CONTEXT.md shared language + ADR
  -> ticket/spec/TDD/review
```

### 关键实现

- 明确区分 user-invoked 与 model-invoked：
  - 前者负责编排和交互；
  - 后者提供可自动调用的纪律。
- `grill-with-docs` 同时做需求访谈、领域词汇和 ADR。
- TDD Skill 要求先和用户确认测试 seam，再逐个 vertical slice red-green；反对水平批量写测试。
- Changesets 管理仓库版本；Claude Plugin 提供订阅式安装；`npx skills` 提供可修改副本。
- 开发脚本把所有非 deprecated Skill symlink 到 Claude 和 `.agents` 目录，并检查目标目录是否反向指入本仓。

### 取舍

- 优点：控制权留给开发者、Skill 边界小、强调领域语言和 public interface tests。
- 代价：对用户参与度要求高；流程依赖项目先运行 setup；仓库没有和 Addy 同等级的统一 eval 体系。

### 推荐精读

1. `README.md` 的 failure modes
2. `skills/engineering/tdd/SKILL.md`
3. `skills/engineering/wayfinder/SKILL.md`
4. `.agents/adr/`

## 14. K-Dense-AI/scientific-agent-skills

### 定位

大型科学研究垂直 Skill 集合，当前本地快照有 149 个 `SKILL.md`。它展示规模化领域知识、脚本、数据库和凭证治理。

### 架构主链

```text
domain request
  -> specific scientific Skill
  -> references / scripts / package APIs / databases
  -> scientific workflow
  -> validation / report / artifact

contribution
  -> spec validation
  -> version bump
  -> security scan
  -> cross-skill overlap
  -> SECURITY.md / PR gate
```

### 关键实现

- `metadata` 要求单行 JSON flow style，以兼容 OpenClaw 的 line parser。
- 凭证同时用：
  - `required_environment_variables` 给 Hermes；
  - `metadata.openclaw.envVars` 给 OpenClaw；
  - 其他规范宿主忽略未知字段。
- `scan_skills.py` 组合 Behavioral、Trigger、LLM analyzer，并调整 prompt size policy。
- 扫描全部 Skill 后检查 description overlap 和跨 Skill 风险。
- `scan_pr_skills.py` 只扫描变更 Skill，生成 PR comment，并按 severity fail。
- `autoskill` 从本地 screenpipe：
  - fetch；
  - redact；
  - cluster；
  - embedding match；
  - LLM 判断 reuse/compose/novel；
  - staging proposal；
  - 用户 promote。

### 代码组织

每个 Skill 按领域自包含；顶层只保留集合文档和扫描脚本。不同 Skill 的文件规模差异很大，符合按领域复杂度增长。

### 取舍

- 优点：跨宿主元数据实践具体；安全治理强；领域覆盖深；自动发现强调 local-first 和 staging。
- 代价：149 个 Skill 的长期新鲜度成本高；大量第三方包/API 不能靠静态扫描证明可运行；扩展 metadata 已超出标准最小面。

### 推荐精读

1. `CONTRIBUTING.md`
2. `scan_skills.py`
3. `scan_pr_skills.py`
4. `skills/autoskill/`
5. 任一带真实脚本的领域 Skill

## 15. EveryInc/compound-engineering-plugin

### 定位

完整的跨宿主工程 Harness。核心理念是每次工作都产出让下一次更容易的 durable artifact。

### 架构主链

```text
strategy / ideate
  -> brainstorm requirements
  -> implementation-ready plan
  -> work
  -> simplify
  -> multi-agent review
  -> compound learning
  -> future brainstorm/plan retrieves learning
```

### 关键实现

- 30 个公开 Skill，专职 reviewer 大多作为 Skill-local prompt assets，而非全局 Agent，减少表面组件数量。
- `ce-code-review`：
  - 自动识别 diff scope；
  - 计算 deterministic signals；
  - 按风险选择 reviewer roster；
  - 支持 quick review 短路；
  - 并行 reviewer 输出 JSON；
  - 合并、去重、验证和分级；
  - agent mode 报告而不修改。
- `ce-compound`：
  - context/solution/related 三路研究；
  - 大输出写 `/tmp` artifact，主 Agent 只接路径；
  - overlap high 时更新旧 doc，不创建重复；
  - 可选 session history cheap probe；
  - claims 回到源码核验；
  - solution 写入 `docs/solutions/`。
- Converter/Writer 适配非原生宿主；install manifest 只声明自己真正写入的路径，保护用户 override。
- native plugin surface 优先于自建转换。

### 取舍

- 优点：artifact、scope、review、恢复和知识回流非常完整；对多宿主差异有显式领域模型。
- 代价：Skill 体量和协议复杂；学习成本高；并行 reviewer 和跨模型 pass 成本显著；对小项目可能过重。

### 推荐精读

1. `CONCEPTS.md`
2. `skills/ce-code-review/SKILL.md`
3. `skills/ce-compound/SKILL.md`
4. `src/` 的 converter/writer
5. `tests/`

## 16. yusufkaraaslan/Skill_Seekers

### 定位

把文档网站、GitHub、PDF、视频、DOCX、EPUB、OpenAPI、PPTX、聊天、本地代码等输入转为 Skill 的大型生成系统。

### 架构主链

```text
create <source>
  -> source detection
  -> route to source-specific converter
  -> extract / scrape
  -> clean + categorize
  -> unified skill builder
  -> optional AI enhancement
  -> quality/conflict checks
  -> package / plugin / upload
  -> optional sync monitor
```

### 关键实现

- `CreateCommand` 统一解析输入，再路由到对应 scraper；显式配置可覆盖自动检测。
- common arguments、source-specific arguments 分离，减少旧 standalone CLI 与 unified CLI 参数漂移。
- GitHub Three-Stream Fetcher 把内容分为 code、docs、insights，避免所有文件同样处理。
- Document converters 复用 `DocumentSkillBuilder`，只覆盖格式抽取差异。
- Unified config 支持多个 source 合并。
- enhancement 集中在转换后运行，而不是每个 scraper 各自实现。
- Marketplace Publisher 读取 frontmatter、复制 Skill、生成 plugin manifest、更新 marketplace。
- Sync detector 用 hash/header/diff 检测文档变化；当前 monitor 中自动重建仍有 TODO，不能当作完整实现。
- 约 2990 个本地文件、292 个测试相关文件，功能面和兼容面都很大。

### 取舍

- 优点：输入覆盖广、统一路由、可恢复 scrape、配置和发布面完整。
- 代价：模块很多、旧入口与新入口并存；依赖重量大；从文档自动生成容易产生“知识很多但流程不清”的 Skill；部分同步能力仍是设计方向。

### 推荐精读

1. `src/skill_seekers/cli/create_command.py`
2. `src/skill_seekers/cli/source_detector.py`
3. `src/skill_seekers/cli/document_skill_builder.py`
4. `src/skill_seekers/cli/github_fetcher.py`
5. `src/skill_seekers/services/marketplace_publisher.py`
6. `tests/`

## 17. diet103/claude-code-infrastructure-showcase

### 定位

用 Hook 解决“Skill 不可靠自动触发”的 Claude Code 基础设施参考库。

### 架构主链

```text
UserPromptSubmit
  -> load skill-rules.json
  -> regex or AI classify
  -> mandatory/recommended
  -> session state + context injection

PreToolUse(Edit)
  -> check pending mandatory / path / content rule
  -> block or allow

PostToolUse(Skill)
  -> clear pending
  -> append metric

Stop
  -> optional build / error / session-doc checks
```

### 关键实现

- 默认 regex-only，AI mode 可选 Gemini/OpenAI/Anthropic/Ollama。
- conservative level 分 strict/balanced/aggressive。
- AI classifier 最多给 1-2 mandatory、2-3 recommended。
- 只有 enforcement=`block` 可成为 mandatory；AI mandatory 默认降级 recommended，除非显式 `ai_can_arm_blocks`，因为 held-out 自测发现误报偏高。
- session state 保存 pending、used、AI suggested；PostToolUse 真实观察 Skill tool 后清 pending。
- JSONL metrics 记录 suggested/activated/blocked，后续统计 suggestion-to-activation conversion。
- Setup wizard 自检 Node、Hook 注册、依赖、权限、配置和真实测试 prompt。

### 取舍

- 优点：把概率性触发外置成可观测、可调和可阻塞的控制面。
- 代价：Claude Code Hook 特定；维护 `skill-rules.json` 形成第二套路由事实；regex 易漏，LLM 易误报；Hook 复杂度和每轮延迟需要监控。

### 推荐精读

1. `.claude/hooks/skill-activation-prompt.ts`
2. `.claude/hooks/skill-verification-guard.ts`
3. `.claude/hooks/skill-activation-tracker.ts`
4. `.claude/hooks/lib/session-state.ts`
5. `.claude/skills/skill-rules.json`

## 18. cisco-ai-defense/skill-scanner

### 定位

Agent Skill 的多引擎安全扫描器和 CI 工具。

### 架构主链

```text
SkillLoader
  -> archive extraction + analyzability
  -> phase 1 non-LLM analyzers
  -> enrichment context
  -> phase 2 LLM analyzers
  -> meta filtering / policy override
  -> ScanResult / Report
  -> summary/json/markdown/table/SARIF/HTML
```

### 核心分析器

- Static：YAML/YARA/模式、文件和引用。
- Bytecode：`.pyc` 完整性。
- Pipeline：shell command taint。
- Behavioral：Python AST dataflow。
- Trigger：description 过宽/过窄。
- Cross Skill：描述重叠和集合级风险。
- LLM：语义分析，并接收静态结果 enrichment。
- Meta：过滤 false positive、整理优先级。
- VirusTotal/AI Defense：可选外部引擎。

### 关键实现

- Scanner 先跑非 LLM，再把文件 inventory、magic mismatch、严重静态 findings 传给 LLM。
- archive extraction 会先检测 traversal/zip bomb。
- recursive discovery 有目录上限，防恶意 symlink fan-out 扫遍文件系统。
- policy 有 strict/balanced/permissive、自定义禁用规则和 severity override。
- SARIF 可进入 GitHub Code Scanning；pre-commit 和 reusable workflow 支持供应链门禁。

### 取舍

- 优点：覆盖 prompt、代码、二进制、数据流和集合冲突。
- 代价：LLM 分析有成本和随机性；YARA 会误报；行为分析主要覆盖 Python；无 findings 不能认证安全。

### 推荐精读

1. `skill_scanner/core/scanner.py`
2. `skill_scanner/core/loader.py`
3. `skill_scanner/core/analyzers/`
4. `skill_scanner/core/scan_policy.py`
5. `tests/behavioral/`

## 19. darkrishabh/agent-skills-eval

### 定位

对 agentskills.io 风格 Skill 运行 with/without baseline 的 TypeScript SDK/CLI。

### 架构主链

```text
discover skill + eval config
  -> load SKILL.md/references/scripts
  -> run with_skill and optional without_skill
  -> provider completion
  -> deterministic tool assertions
  -> LLM rubric judge
  -> timing + output + grading artifacts
  -> benchmark + HTML report
```

### 关键实现

- with-skill 把 description、instructions、references、scripts 包在 XML system message。
- provider 支持 system role 和 attachments；不支持时把文件内联到 user message。
- eval-level params 覆盖 Skill defaults，Skill defaults 覆盖 caller defaults。
- tool assertion 可确定性检查：
  - tool called/not called；
  - arg equals/contains/regex；
  - call count。
- rubric judge 要求逐 assertion 给证据，JSON 解析失败时 fail closed。
- bounded worker pool 并发执行 case；默认最多 4 个 case。
- flat/iteration artifact layout 兼容不同使用方式。

### 取舍

- 优点：通用 provider contract、baseline、工具行为检查、完整 artifact。
- 代价：当前 target 调用更接近单次 chat，不等同于完整 coding-agent 沙箱；Skill 的所有 reference 被注入会高估实际按需加载；judge 仍需校准。

### 推荐精读

1. `src/run-eval.ts`
2. `src/evaluate-skills.ts`
3. `src/grade.ts`
4. `src/provider.ts`
5. `test/`

## 20. microsoft/SkillOpt

### 定位

把自然语言 Skill 当作冻结模型之外的可训练参数，通过轨迹、反思和 held-out validation 自动优化。

### 架构主链

```text
seed skill
  -> train rollout
  -> reflect on successes/failures
  -> aggregate patches
  -> rank/select
  -> candidate skill
  -> selection rollout
  -> validation gate
  -> accept/reject/current/best
  -> best_skill.md
  -> final test
```

### 关键实现

- `EnvAdapter` 抽象 benchmark 的 dataloader、train/eval env、rollout、reflect 和 task types。
- update mode 支持 patch、suggestion rewrite、full rewrite 等。
- textual learning-rate 控制一次编辑预算。
- rejected-edit buffer 让后续优化看到哪些修改曾失败。
- gate 支持 hard、soft、mixed score；默认候选需要比 current/best 更优。
- selection cache 按 Skill hash 避免重复评估。
- slow update 在 epoch 级总结长期 guidance，可选择再走同一 selection gate。
- 最终 Skill 如果含未验证 slow update，会补一次真实 validation，确保 `best_skill.md` 是验证集 argmax。
- SkillOpt-Sleep：
  - harvest Claude/Codex session；
  - mine tasks；
  - replay；
  - contrastive reflection；
  - held-out gate；
  - 写 staging；
  - 人工 `adopt` 才覆盖 live。

### 工程质量

- 6 个内置 benchmark adapter；
- 多 backend，包括 chat 和 Codex/Claude Code harness；
- 35 个测试相关文件；
- checkpoint、history、candidate、trajectory digest、best Skill 均落盘。

### 取舍

- 优点：把“改 Prompt”变成有训练/验证分离和回滚的优化问题；部署时零额外模型调用。
- 代价：优化可能过拟合 benchmark；成本很高；Skill 文本可能变得难读；held-out set 泄漏会破坏门禁；项目性能数字尚未在本机复现。

### 推荐精读

1. `skillopt/engine/trainer.py`
2. `skillopt/evaluation/gate.py`
3. `skillopt/envs/base.py`
4. `skillopt/gradient/reflect.py`
5. `skillopt_sleep/rollout.py`
6. `skillopt_sleep/staging.py`

### 思考点

- Skill 优化的目标应该是正确率、token、延迟、安全，还是多目标？
- 如果训练数据来自真实 session，如何防止把用户偶然偏好写成全局规则？
- 自动生成的 Skill 是否仍应保持人类可读和可维护？
