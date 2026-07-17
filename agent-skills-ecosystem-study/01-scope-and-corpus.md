# 01. 研究范围与语料

## 1. 研究问题

本轮围绕 `garden-skills` 回答七个有限问题：

1. Agent Skills 领域由哪些技术层组成？
2. `garden-skills` 在其中处于什么位置？
3. 一个 Skill 从编写到分发、运行、评测和更新，需要哪些工程能力？
4. 不同生产级 Skill 集合如何组织内容和代码？
5. Plugin、Harness、Hook、Skill、MCP 分别解决什么？
6. 当前安全、触发、效果和演进如何验证？
7. 哪些模式可以迁移到本仓的 Skill 工程？

这不是 GitHub 全量项目大全。生态规模已经达到数百个集合、数千到数十万个索引条目；绝对意义上的“所有相关项目”不可封闭，也会快速过时。本材料中的“所有收集项目”指：截至快照日，经目标仓直接关系、GitHub 搜索和跨平台检索确认，进入固定深度语料集的 20 个互补项目。

## 2. 检索方法

### 2.1 第一层：目标仓直接关系

从 `garden-skills` 当前 README、CONTRIBUTING、源码链接和安装方式提取：

- Agent Skills 规范；
- Anthropic 官方示例；
- `npx skills` 安装器；
- Claude Plugin Marketplace；
- `reacticle` 运行时协议；
- GPT Image 案例网站；
- Superpowers 与 Awesome Claude Skills。

这组关系优先级最高，因为它们由目标项目自己声明。

### 2.2 第二层：GitHub 结构化搜索

使用以下查询族并按 star、维护状态、源码规模和独特性筛选：

- `"Agent Skills" in:name,description,readme`
- `topic:agent-skills`
- `"SKILL.md" "Claude Code" in:readme`
- `"skills.sh" in:readme`
- 安全、eval、optimizer、generator、marketplace 等生命周期关键词

搜索结果会混入：

- 只提过 Agent Skills 的大型通用项目；
- 同一集合的镜像和二次聚合；
- 只有 README 的宣传仓；
- 单一叶子 Skill；
- 纯宿主运行时；
- 与 Skill 格式同名但语义不同的项目。

因此 GitHub 命中只进入候选池，不自动进入深度语料。

### 2.3 第三层：生态与社区信号

通过 Exa、X、Reddit、B站补充：

- 社区实际关注的问题；
- 新出现的安全、eval、自动激活和优化工具；
- 中文使用场景和常见困惑；
- 官方索引未覆盖的项目。

社区信号只用于发现和识别问题，不直接作为实现事实。

## 3. 纳入标准

项目需要满足至少一个强条件：

- `garden-skills` 直接引用、依赖或配套使用；
- 定义 Agent Skills 规范或官方参考实现；
- 提供跨宿主发现、安装、分发或 marketplace；
- 代表一种成熟的 Skill collection 架构；
- 实现安全扫描、触发评测、行为评测或自动优化；
- 实现文档到 Skill 的生成、Skill 生命周期管理或 Hook 自动激活；
- 能补齐生态生命周期中的独立环节，且有实质源码或可审计配置。

同时要求：

- 优先 canonical 原仓而非镜像；
- 仓库公开、可 fork、可 clone；
- 有清晰 README 和可识别入口；
- 与已选项目形成互补，而不是只增加数量；
- 许可证状态和研究边界可记录。

## 4. 20 个正式研究对象

### A. 主项目与直接伴生项目

| 项目 | 纳入原因 | 主要观察角度 |
|---|---|---|
| `ConardLi/garden-skills` | 主研究对象 | 深度 Skill 内容、渐进加载、独立版本和发布工程 |
| `ConardLi/reacticle` | `beautiful-article` 的底层运行时协议 | 语义组件、主题 token、Raw 自由层、显式完整性 |
| `ConardLi/gpt-image-2-101` | `gpt-image-2` 的公开案例与展示站 | Skill 模板如何编译成可浏览数据和案例证据 |

### B. 规范、官方样例与官方市场

| 项目 | 纳入原因 | 主要观察角度 |
|---|---|---|
| `agentskills/agentskills` | 开放规范与 reference validator | 最小格式、frontmatter、渐进加载、验证边界 |
| `anthropics/skills` | 官方复杂 Skill 示例 | 文档类生产 Skill、脚本/资源、Skill Creator eval loop |
| `anthropics/claude-plugins-official` | 官方 Plugin Directory | marketplace schema、immutable slug、commit pin、Skill bundle |

### C. 发现、安装与生命周期管理

| 项目 | 纳入原因 | 主要观察角度 |
|---|---|---|
| `vercel-labs/skills` | `npx skills` 安装器 | 来源解析、宿主探测、canonical 目录、symlink/copy、lock、安全提示 |
| `travisvn/awesome-claude-skills` | 早期精选目录 | 生态分类、基础教育、安全提示、早期演进状态 |
| `VoltAgent/awesome-agent-skills` | 大型跨团队精选目录 | 官方/社区来源、质量标准、跨宿主路径、发现层风险 |
| `rooftop-Owl/skill-factory` | 无运行时的 Skill 生命周期管理样例 | 多注册表级联、provenance manifest、清理、同会话加载 |

### D. 生产级 Skill 集合与方法论

| 项目 | 纳入原因 | 主要观察角度 |
|---|---|---|
| `obra/superpowers` | 强流程方法论代表 | bootstrap Hook、强制 Skill 使用、TDD、计划、subagent review |
| `addyosmani/agent-skills` | 工程生命周期技能包 | 标准化 Skill anatomy、routing eval、行为 eval、跨宿主命令 |
| `mattpocock/skills` | 小而可组合的工程技能包 | 用户调用/模型调用分层、领域语言、TDD seam、可修改分发 |
| `K-Dense-AI/scientific-agent-skills` | 大型垂直领域集合 | 149 Skill、跨宿主 metadata、安全扫描、领域脚本与依赖治理 |
| `EveryInc/compound-engineering-plugin` | 完整 Plugin/Harness 代表 | durable artifact、并行 reviewer、知识回流、跨平台转换 |

### E. 生成、触发、安全、评测与优化

| 项目 | 纳入原因 | 主要观察角度 |
|---|---|---|
| `yusufkaraaslan/Skill_Seekers` | 文档/仓库/PDF 到 Skill 的生成器 | 18 类输入、统一路由、抽取/增强/打包、同步和冲突检测 |
| `diet103/claude-code-infrastructure-showcase` | Hook 自动激活代表 | regex/AI 分类、UserPromptSubmit、PreToolUse、session state、metrics |
| `cisco-ai-defense/skill-scanner` | 安全治理代表 | 静态、YARA、行为 dataflow、LLM、meta、供应链和 SARIF |
| `darkrishabh/agent-skills-eval` | 通用 Skill A/B eval 工具 | with/without Skill、judge、tool assertions、并发、artifact/report |
| `microsoft/SkillOpt` | Skill 自动优化代表 | rollout、reflection、patch、held-out gate、best skill、nightly sleep |

## 5. 为什么不是更多

### 5.1 同质大型聚合仓

以下项目提供了重要规模信号，但和已选 Awesome List 或 Skill collection 高度重叠：

- `sickn33/agentic-awesome-skills`
- `alirezarezvani/claude-skills`
- `luokai0/ai-agent-skills-by-luo-kai`
- `ComposioHQ/awesome-claude-skills`

它们进入生态规模与候选来源说明，但不逐仓深挖。否则研究会被“收录了多少 Skill”主导，无法回答架构问题。

### 5.2 通用 Agent 宿主

Codex、Claude Code、Gemini CLI、OpenCode、Pi、Cursor、Hermes 等宿主决定 Skill 如何发现和注入，但它们的完整运行时远超本专题。当前仓库已有独立 Coding Agent Runtime 研究，因此本轮只通过规范、安装器和项目文档记录兼容面，不重复研究整套宿主。

### 5.3 单一叶子 Skill

`ui-ux-pro-max-skill`、`taste-skill`、`humanizer`、`last30days-skill`、`obsidian-skills` 等能说明应用方向，但单个 Skill 不足以代表新的工程层。`garden-skills`、官方 skills 和三个生产集合已经提供足够的内容设计样本。

### 5.4 普通运行时依赖

`MiniMax-AI/cli`、`edge-tts`、React、Vite、Sharp、KaTeX 等是具体 Skill 或网站的依赖，不属于 Agent Skills 生命周期基础设施。它们只在对应项目实现里说明。

### 5.5 草案或低信号替代规范

检索发现多个扩展版 `SKILL.md` 草案，涉及网站 action、API、A2A、支付等。它们有研究价值，但和当前 `agentskills.io` 文件 Skill 标准不是同一个稳定边界。本轮以 canonical Agent Skills 规范为准，避免把相似名字的协议混成一个标准。

## 6. 证据等级

| 等级 | 来源 | 可以支持什么 |
|---|---|---|
| E1 | 本地源码、配置、测试、Git 状态 | 当前快照真实存在的实现、目录和控制流 |
| E2 | 项目 README、CONTRIBUTING、官方文档 | 项目意图、公开契约、使用方式 |
| E3 | GitHub API 元数据 | star、fork、默认分支、时间和机器识别许可证 |
| E4 | Exa/X/Reddit/B站 | 社区关注点、候选发现、常见问题 |

材料中的实现结论优先要求 E1；项目宣称的 benchmark、规模和用户量只有 E2/E3 时，会显式标注“项目自述”。

## 7. 本地 clone 约束

所有新项目遵守本仓第三方研究规则：

- 路径：`explorations/research/repos/<slug>/`；
- 每个目录保留独立 `.git`；
- `origin` 指向 `estelledc` 个人 fork；
- `upstream` 指向 canonical 原仓；
- 父仓忽略第三方源码，只跟踪研究材料；
- 第三方仓库保持 clean，不写研究笔记；
- 使用 `--filter=blob:none` 降低历史对象下载；
- `gpt-image-2-101` 使用 sparse checkout，只物化源码和配置，不物化案例图片；
- 研究结论绑定 commit，不用浮动 `main` 代替快照。

## 8. 研究停止条件

以下条件已经满足，因此本轮停止扩张：

- 规范、官方样例、市场、安装器均有样本；
- 小型、中型、大型、垂直 Skill collection 均有样本；
- Plugin/Harness 与 Hook 自动激活均有样本；
- 生成、安全、触发评测、行为评测、自动优化均有样本；
- 20 个项目均已 fork、clone、远端核验、固定 commit。

后续新增项目需要证明它补充了新的生命周期能力，而不是“又一个 Skill 合集”。
