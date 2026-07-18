---
title: "08. 零基础项目上手卡：27 个项目从哪里读起"
sidebar:
  hidden: true
---
# 08. 零基础项目上手卡：27 个项目从哪里读起

> 用途：补齐每个项目的生活类比、输入输出、源码锚点、证据边界和第一项练习。
>
> 配套材料：[项目深潜](02-project-deep-dives.md)解释完整机制与取舍，
> [仓库清单](05-repository-inventory.md)提供 canonical upstream 和 pinned commit。

## 1. 使用方法

不要按顺序读完 27 个仓库。先在[生态全景](01-ecosystem-landscape.md)选一层，
再从本页选一个项目：

1. 先看“类比”，确认它解决的不是另一个问题。
2. 能复述“主链”，再打开 2-5 个源码锚点。
3. 完成“第一项任务”，只画输入、状态、输出和失败边界，不安装依赖。
4. 需要验证运行主张时，再单独设计 E2；不要把本页的 E1 静态证据写成实测。

证据等级：

- **E1**：本轮在 pinned commit 下检查了源码、配置或测试，只证明静态实现。
- **E2-limited**：只对明确列出的本地链路做过运行验证，不外推到整个项目。
- **E0/E1**：仓库角色和组织可由源码确认，但它收录的第三方声明仍需回到原项目核验。

## 2. 核心参照与全生命周期

### 1. ResearchStudio

- **类比**：一套给研究助理使用的“选题工作台 + 论文传播工作台”，不是自动完成实验的实验室。
- **首个输入输出**：研究查询或 PDF → idea card，或共享 paper assets → poster、video、blog、reel。
- **主链**：检索证据 → 提炼瓶颈 → 生成/筛选想法 → 碰撞与批评 → 渲染；传播侧先解析一次 PDF，再让多个产物复用资产。
- **栈与锚点**：Markdown Skills、Python、Node；`ResearchStudio-Idea/skills/idea_spark/SKILL.md`、`ResearchStudio-Idea/skills/idea_spark/scripts/run.py`、`ResearchStudio-Reel/skills/paper2assets/SKILL.md`、`ResearchStudio-Reel/skills/paper2reel/SKILL.md`。
- **取舍**：Skill-first 容易嵌入 coding agent，也保留可编辑文件；代价是跨阶段状态和恢复主要靠目录与 manifest。
- **证据边界**：**E2-limited**。Idea run 的 navigator 可运行，但同一 run 的 validator 暴露 1 个 artifact routing failure；没有证明科学新颖性或完整实验链。
- **第一项任务**：比较 `run.py next` 与 `run.py validate` 分别读取什么，解释为何 `DONE` 不能替代 blocking gate。

### 2. AI-Scientist

- **类比**：拿一份固定实验模板，让自动化研究员反复改代码、跑表格、写论文。
- **首个输入输出**：研究模板与 idea → 实验代码、结果图、LaTeX 论文和自动审稿。
- **主链**：生成 idea → 新颖性检索 → 复制模板 → 修改并运行实验 → 写作 → 审稿/修订。
- **栈与锚点**：Python、Aider、LaTeX；`launch_scientist.py`、`ai_scientist/generate_ideas.py`、`ai_scientist/perform_experiments.py`、`ai_scientist/perform_writeup.py`、`ai_scientist/perform_review.py`。
- **取舍**：模板让闭环直观且可运行；代价是研究空间受模板约束，早期错误会沿线传播。
- **证据边界**：**E1**。源码主链已检查，本轮未安装模型和实验依赖，也未复现论文结果。
- **第一项任务**：从 `launch_scientist.py` 画出五个阶段，标出哪一步首次产生真实实验数据。

### 3. AI-Scientist-v2

- **类比**：把单条实验路线改成一棵候选树，多名研究员分别探索分支后再汇总。
- **首个输入输出**：idea 与实验模板 → 带评分的实验树、journal、结果和论文。
- **主链**：初始化节点 → 并行扩展实验分支 → 评估/选择 → 阶段转换 → journal 汇总 → 写作与评审。
- **栈与锚点**：Python、树搜索、并行 GPU worker；`launch_scientist_bfts.py`、`ai_scientist/treesearch/agent_manager.py`、`ai_scientist/treesearch/parallel_agent.py`、`ai_scientist/treesearch/journal.py`。
- **取舍**：树搜索避免一次选择决定全局；代价是算力、调用成本和代理评分误差同步增加。
- **证据边界**：**E1**。树与 journal 结构已检查，没有运行 GPU 搜索或复现 benchmark。
- **第一项任务**：追踪一个实验节点从创建到写入 journal，列出节点评分不等于科学有效性的两个原因。

### 4. AI-Researcher

- **类比**：给研究员配浏览器、终端、Docker 和写作台，让它在一个大工作间里完成多种任务。
- **首个输入输出**：研究问题与可操作环境 → survey、idea、计划、代码、实验结果和论文。
- **主链**：survey → idea → plan → code/experiment → result analysis → judge → paper composition。
- **栈与锚点**：Python、Docker、浏览器/终端工具、RAG memory；`main_ai_researcher.py`、`global_state.py`、`research_agent/inno/core.py`、`research_agent/inno/workflow/flowgraph.py`、`paper_agent/writing.py`。
- **取舍**：工具面广，能接近真实研究环境；代价是权限、安全、部署和状态面都明显变大。
- **证据边界**：**E1**。静态追到 research/paper agent 分界，本轮未启动 Docker、浏览器或模型。
- **第一项任务**：从 `main_ai_researcher.py` 追到 `flowgraph.py`，标出全局状态在哪些边界被读写。

### 5. Agent Laboratory

- **类比**：一个小型课题组，教授、博士后、博士生和工程师各自负责一段工作。
- **首个输入输出**：研究主题与实验配置 → 文献综述、实验、解释、报告和 reviewer 反馈。
- **主链**：综述 → 计划 → 数据/实验 → 结果解释 → 报告 → reviewer；不通过时回到前序阶段。
- **栈与锚点**：Python、多角色对话、命令工具；`ai_lab_repo.py`、`agents.py`、`mlesolver.py`、`papersolver.py`、`tools.py`。
- **取舍**：角色分工容易表达协作责任；代价是多轮对话不天然增加事实独立性，pickle 状态也不利于跨版本审计。
- **证据边界**：**E1**。角色和 solver 主线已检查，没有运行真实实验或模型对话。
- **第一项任务**：从 `ai_lab_repo.py` 找到 phase 切换，区分“角色名称变化”和“状态真的变化”。

### 6. AutoResearchClaw

- **类比**：一张有 23 个工位的研究流水线，人可以在检查点暂停、批准或返工。
- **首个输入输出**：研究配置与主题 → 分阶段 artifacts、实验、论文和发布材料。
- **主链**：问题定义 → 文献 → 方案 → 实现 → 实验 → 分析 → 写作 → 评审/发布。
- **栈与锚点**：Python、YAML、CLI/MCP/HITL adapters；`researchclaw/pipeline/runner.py`、`researchclaw/pipeline/stages.py`、`researchclaw/pipeline/executor.py`、`researchclaw/pipeline/contracts.py`、`researchclaw/hitl/session.py`。
- **取舍**：细阶段和人工介入适合治理长任务；代价是状态、配置和运维面随阶段数增长。
- **证据边界**：**E1**。pipeline、contract 和 HITL 代码已检查，没有跑完 23 stage 或 ARC benchmark。
- **第一项任务**：在 `stages.py` 与 `contracts.py` 中选相邻两阶段，写出 handoff artifact 的最小字段。

### 7. FAROS

- **类比**：把研究工作流做成一个有前台、后台、仓库和插件登记处的“研究操作系统”。
- **首个输入输出**：研究请求与 capability package → run state、idea、experiment、artifact、review 和 paper。
- **主链**：API 接收请求 → orchestrator 建图 → executor 调 capability → state/artifact store 落盘 → API 展示结果。
- **栈与锚点**：Python、FastAPI、前端、registry；`backend/app/faros/runtime/orchestrator.py`、`backend/app/faros/runtime/agent_executor.py`、`backend/app/faros/runtime/state_store.py`、`backend/app/faros/runtime/artifact_store.py`、`backend/app/faros/registry/capability_registry.py`。
- **取舍**：运行时、能力和 artifact 分层清楚；代价是产品平台复杂度可能快于科研能力成熟度。
- **证据边界**：**E1**。服务分层和存储接口已检查，没有启动后端、数据库或前端。
- **第一项任务**：追踪 orchestrator 写入 state 与 artifact 的不同路径，解释两者为何不能合并成一个表。

### 8. AutoR

- **类比**：一本每一步都要签字、可回退到旧页的电子实验记录本。
- **首个输入输出**：研究 intake 与 operator → 九阶段 manifest、decision、evidence、experiment 和 dissemination artifacts。
- **主链**：intake → literature → hypothesis → design → implementation → experiment → analysis → writing → dissemination。
- **栈与锚点**：Python、文件协议、HTTP Studio；`src/manager.py`、`src/manifest.py`、`src/operator_protocol.py`、`src/experiment_manifest.py`、`tests/test_stage_rollback.py`。
- **取舍**：显式 manifest、审批和 rollback 强化过程纪律；代价是框架只能保证过程可审计，不能保证研究结论正确。
- **证据边界**：**E1**。状态与恢复测试源码已检查，本轮没有执行 AutoR 自身测试或外部 operator。
- **第一项任务**：读 `test_stage_rollback.py`，列出 rollback 必须恢复的状态和不应自动撤销的外部副作用。

### 9. InternAgent

- **类比**：一个分层指挥部，总规划员拆目标，协调员派工，任务规划员再拆步骤，最后由综合员汇总。
- **首个输入输出**：长程科学问题 → 分层任务、执行轨迹、记忆和综合答案。
- **主链**：global planner → coordinator → task planner → task execution → synthesizer。
- **栈与锚点**：Python、CAMEL 风格多智能体；`internagent/mas/agents/dr_agents/workflow/main.py`、`internagent/mas/agents/dr_agents/agents/global_planner_agent.py`、`internagent/mas/agents/dr_agents/agents/coordinator_agent.py`、`internagent/mas/agents/dr_agents/agents/task/planner_agent.py`、`internagent/mas/agents/dr_agents/agents/synthesizer_agent.py`。
- **取舍**：分层计划适合超长任务；代价是代码和上下文都很重，层级增加不等于证据独立。
- **证据边界**：**E1**。主角色和 workflow 已检查，没有运行模型、科学任务或 benchmark。
- **第一项任务**：沿 `workflow/main.py` 标出每层接收和返回的数据，找出一次信息可能被压缩丢失的位置。

### 10. nano-scientist

- **类比**：一个背着预算表和按需工具箱的小型研究员，只在需要时拿出相应 Skill。
- **首个输入输出**：研究主题、可用 API 和预算 → 文献、实验、写作、编译产物与轨迹。
- **主链**：literature → experiment → writing → compile，在预算或完成条件前循环。
- **栈与锚点**：Python、Skill 懒加载；`main.py`、`src/flow.py`、`skills/research-lit/SKILL.md`、`skills/run-experiment/SKILL.md`、`skills/paper-writing/SKILL.md`。
- **取舍**：小核心和预算状态便于理解；代价是 Skill 数量增长后需要更强的选择、版本和安全治理。
- **证据边界**：**E1**。flow 与代表性 Skills 已检查，没有调用 provider 或执行实验。
- **第一项任务**：从 `src/flow.py` 找到 Skill 过滤和终止条件，说明“缺 API Key”和“预算耗尽”应产生何种不同状态。

## 3. 选题、证据与科学讨论

### 11. Idea2Paper

- **类比**：先在论文知识地图上找邻居和常见解题套路，再组合成一份研究提案。
- **首个输入输出**：研究主题、Paper-KG、patterns → story、review、novelty 结果和 proposal bundle。
- **主链**：知识图谱召回 → pattern 选择/融合 → story 生成 → reflection → anchored review → novelty check。
- **栈与锚点**：Python、知识图谱与索引；`Paper-KG-Pipeline/src/idea2paper/application/pipeline/manager.py`、`Paper-KG-Pipeline/src/idea2paper/application/pipeline/pattern_selector.py`、`Paper-KG-Pipeline/src/idea2paper/application/pipeline/story_generator.py`、`Paper-KG-Pipeline/src/idea2paper/application/review/critic.py`、`Paper-KG-Pipeline/src/idea2paper/application/novelty/novelty_checker.py`。
- **取舍**：显式论文和 pattern grounding 降低凭空发散；代价是构图、索引和数据更新成本高。
- **证据边界**：**E1**。新 application pipeline 已检查，没有构建完整 Paper-KG 或验证新颖性结论。
- **第一项任务**：画出 recall result 到 story 的字段变换，指出 novelty index 过期会造成什么误判。

### 12. Co-Scientist

- **类比**：一个持续开假设辩论赛的实验室，用任务队列安排选手，用积分榜筛选候选。
- **首个输入输出**：研究目标和文献工具 → hypotheses、reviews、tournament、metareview 和 event log。
- **主链**：generation → reflection → ranking → evolution → proximity → metareview，直到预算或稳定条件触发。
- **栈与锚点**：Python、SQLite、async workers；`co_scientist/agents/supervisor.py`、`co_scientist/agents/ranking.py`、`co_scientist/storage/schema.sql`、`co_scientist/storage/repos/tasks.py`、`co_scientist/orchestrator/termination.py`。
- **取舍**：持久任务、lease 和终止器支持长程并发；代价是 Elo/模型互评只是代理指标，可能放大共享偏差。
- **证据边界**：**E1**。schema、任务和终止逻辑已检查，没有运行多模型 session 或验证假设质量。
- **第一项任务**：从 `tasks.py` 找出 claim/lease 语义，再解释重复 worker 为什么可能重复产生外部副作用。

### 13. PaperQA2

- **类比**：一个会先去图书馆找材料、摘证据，再带着页码回答问题的研究助理。
- **首个输入输出**：科学问题与文档索引 → evidence contexts、带引用答案、成本和工具轨迹。
- **主链**：PaperSearch → GatherEvidence → GenerateAnswer → Complete。
- **栈与锚点**：Python、agentic RAG、多 reader/client；`src/paperqa/agents/main.py`、`src/paperqa/agents/search.py`、`src/paperqa/agents/tools.py`、`src/paperqa/docs.py`、`src/paperqa/clients/retractions.py`。
- **取舍**：检索、元数据和撤稿治理较成熟；代价是它能支持证据问答，却不负责提出和执行实验。
- **证据边界**：**E1**。agent、reader 和 client 分层已检查，本轮没有运行联网检索或 LitQA。
- **第一项任务**：追踪一个 paper 从搜索结果进入 evidence context，列出标题匹配正确但证据仍不可用的三种情况。

### 14. STORM

- **类比**：写长报告前先请不同背景的专家轮流提问，再把访谈笔记整理成大纲和文章。
- **首个输入输出**：主题与 retriever → persona、问答、information table、outline 和 polished article。
- **主链**：persona → question asking/retrieval → knowledge curation → outline → article → polish。
- **栈与锚点**：Python、DSPy 风格模块；`knowledge_storm/storm_wiki/engine.py`、`knowledge_storm/storm_wiki/modules/persona_generator.py`、`knowledge_storm/storm_wiki/modules/knowledge_curation.py`、`knowledge_storm/storm_wiki/modules/outline_generation.py`、`knowledge_storm/storm_wiki/modules/article_generation.py`。
- **取舍**：多视角提问提升覆盖面；代价是视角多样性不等于来源独立，最终仍是调研写作而非实验研究。
- **证据边界**：**E1**。STORM 与 Co-STORM 模块已检查，没有调用搜索或模型生成文章。
- **第一项任务**：比较 persona generator 与 retriever 的责任，说明为什么不能用更多 persona 修复低质量来源。

### 15. paper-search-mcp

- **类比**：一个学术搜索总机，把多个数据库接到同一张表格和同一套按钮上。
- **首个输入输出**：统一搜索参数 → 标准 Paper 列表或开放获取下载结果。
- **主链**：接收 MCP/CLI 请求 → 调 source adapters → 标准化字段 → DOI/标题作者去重 → 下载 fallback。
- **栈与锚点**：Python、FastMCP、async adapters；`paper_search_mcp/server.py`、`paper_search_mcp/paper.py`、`paper_search_mcp/academic_platforms/base.py`、`paper_search_mcp/academic_platforms/base_search.py`、`tests/test_fallback.py`。
- **取舍**：统一接口降低上层集成成本；代价是平台限流、字段质量、许可和全文合规仍由调用方治理。
- **证据边界**：**E1**。adapter 和测试结构已检查，没有联网查询，也未验证所有数据源当前可用。
- **第一项任务**：选两个 adapter 对照字段映射，设计一个“同 DOI、标题略有差异”的去重测试。

## 4. Skill、能力与 Research Artifact

### 16. AI-Research-SKILLs

- **类比**：一套科研工种手册，中央总管根据研究阶段调用不同专业手册并登记进度。
- **首个输入输出**：研究目标与选定 Skill → `research-state.yaml`、文献、实验、findings 和论文。
- **主链**：初始化状态 → 选择阶段 Skill → 执行/记录 → 快速实验循环 → 综合反思 → 下一阶段。
- **栈与锚点**：Markdown Skills、YAML、JavaScript installer；`0-autoresearch-skill/SKILL.md`、`0-autoresearch-skill/templates/research-state.yaml`、`packages/ai-research-skills/src/installer.js`、`22-agent-native-research-artifact/compiler/SKILL.md`。
- **取舍**：能力模块化且便于跨宿主安装；代价是自治提示、第三方命令和版本漂移需要额外授权与安全门。
- **证据边界**：**E1**。总编排、状态模板和 installer 已检查，没有运行 Skills 或验证跨宿主行为。
- **第一项任务**：读 `research-state.yaml`，找出能恢复“做到哪一步”但不能恢复“外部副作用是否发生”的字段。

### 17. scientific-agent-skills

- **类比**：一座按学科和软件分类的科研工具图书馆，每本手册教 agent 使用一种工具。
- **首个输入输出**：具体科研任务与选定 Skill → 工具调用步骤、脚本或领域分析产物。
- **主链**：识别任务 → 选择 Skill → 读取约束/引用 → 执行脚本或工具 → 校验结果。
- **栈与锚点**：Markdown Skills、Python helpers/tests；`skills/research-lookup/SKILL.md`、`skills/literature-review/SKILL.md`、`skills/experimental-design/SKILL.md`、`skills/peer-review/SKILL.md`、`tests/test_research_lookup.py`。
- **取舍**：领域覆盖广，适合按需组合；代价是“工具可用”不保证 orchestrator 选对工具或正确解释结果。
- **证据边界**：**E1**。canonical 仓名和代表性 Skill 已检查，没有安全审计或运行全部 Skills。
- **第一项任务**：任选一个 Skill，把其中的输入前置条件、外部写操作和验证命令分别列出。

### 18. Agent-Native Research Artifact

- **类比**：不是只交论文，而是连同证物袋、实验记录、失败岔路和验收封条一起交接。
- **首个输入输出**：研究过程中的 claim、code、data、result 和 trace → 可审计、可续作的 ARA bundle。
- **主链**：research manager 记录过程 → compiler 组装 schema → rigor reviewer 检查 → seal/submit。
- **栈与锚点**：Markdown Skills、YAML/Markdown schema、JavaScript installer；`skills/research-manager/SKILL.md`、`skills/compiler/SKILL.md`、`skills/compiler/references/ara-schema.md`、`skills/rigor-reviewer/SKILL.md`、`examples/minimal-artifact/`。
- **取舍**：claim、物理产物和探索过程显式绑定；代价是 schema 和记录纪律会增加研究者负担。
- **证据边界**：**E1**。schema、reviewer 和最小示例已检查，没有验证 artifact 内容真实性或复现实验。
- **第一项任务**：从 `examples/minimal-artifact` 选一个 claim，沿 schema 找到它的 evidence 和 exploration trace。

## 5. 论文传播与视觉产物

### 19. Paper2Poster

- **类比**：先让编辑提炼论文，再让版式工程师切分画布，最后让审稿员看渲染图返工。
- **首个输入输出**：论文 PDF → outline、layout、PPTX 代码、渲染海报和评价结果。
- **主链**：解析论文 → 筛图 → 生成 outline → tree-split layout → 填内容/样式 → PPTX → visual feedback。
- **栈与锚点**：Python、PPTX、VLM；`PosterAgent/poster_gen_pipeline.py`、`PosterAgent/tree_split_layout.py`、`PosterAgent/gen_outline_layout.py`、`PosterAgent/gen_pptx_code.py`、`Paper2Poster-eval/eval_poster_pipeline.py`。
- **取舍**：几何布局和 visual-in-the-loop 有专门方法；代价是主流程较长、依赖重且职责存在混合。
- **证据边界**：**E1**。pipeline、布局和 eval 入口已检查，没有生成 poster 或复现论文评价。
- **第一项任务**：从 `tree_split_layout.py` 选一个布局约束，说明它能检测什么、不能检测什么内容错误。

### 20. PosterGen

- **类比**：一条海报编辑部流水线，内容编辑、配色、版式、字体和渲染分别交给不同工位。
- **首个输入输出**：论文与 poster config → 统一 `PosterState`、布局、样式和渲染结果。
- **主链**：parser → curator → color → title → layout/balancer → font → renderer。
- **栈与锚点**：Python、LangGraph、Web UI；`src/workflow/pipeline.py`、`src/state/poster_state.py`、`src/agents/parser.py`、`src/agents/layout_with_balancer.py`、`src/agents/renderer.py`。
- **取舍**：显式 state 和节点边界便于观测；代价是多个 agent 是否优于更小流水线需要 ablation。
- **证据边界**：**E1**。StateGraph 与 agent 节点已检查，没有运行模型或 Web UI。
- **第一项任务**：读 `poster_state.py`，把字段分成内容事实、视觉决策和运行指标三组。

### 21. Paper2Video

- **类比**：一个视频制作团队，把论文依次交给幻灯片、配音、字幕、光标和合成工位。
- **首个输入输出**：论文与媒体配置 → slides、narration、audio、subtitles、cursor/talking-head video。
- **主链**：论文理解 → slide 生成 → narration/TTS → 字幕 → 光标/数字人 → 视频合成。
- **栈与锚点**：Python、媒体处理、TTS/VLM；`src/pipeline.py`、`src/speech_gen.py`、`src/subtitle_render.py`、`src/cursor_render.py`、`src/talking_gen.py`。
- **取舍**：传播链完整并有专门评价；代价是 GPU、语音、视频和外部模型耦合高。
- **证据边界**：**E1**。媒体模块和主 pipeline 已检查，没有下载模型、生成视频或运行 benchmark。
- **第一项任务**：从 `pipeline.py` 标出音频时长第一次影响字幕或视频时间轴的位置。

### 22. Paper2Slides

- **类比**：一名演示文稿编辑，把论文先建索引，再做摘要、提纲和逐页内容，并随时保存进度。
- **首个输入输出**：PDF 与生成配置 → RAG 索引、summary、plan、slides 和 checkpoint。
- **主链**：RAG → summary → plan → generate；可按 checkpoint 恢复。
- **栈与锚点**：Python、FastAPI、RAG；`paper2slides/core/pipeline.py`、`paper2slides/core/state.py`、`paper2slides/core/stages/rag_stage.py`、`paper2slides/core/stages/plan_stage.py`、`paper2slides/core/stages/generate_stage.py`。
- **取舍**：四阶段和状态边界清楚；代价是内容与视觉质量仍强依赖模型和外部图像服务。
- **证据边界**：**E1**。pipeline/state/stages 已检查，没有启动 API 或生成 PPTX。
- **第一项任务**：比较 `state.py` 和四个 stage 的输入输出，找出 checkpoint 版本漂移的风险。

### 23. ppt-master

- **类比**：一本极详细的 PowerPoint 制作规范，要求 agent 同时像编辑、设计师和编译器操作员。
- **首个输入输出**：文档、设计方向与原生素材 → 可编辑 PPTX、渲染预览和质量报告。
- **主链**：分析内容 → 选设计方向 → 构建原生 shape/图像 → 编译 → 渲染 → 质量检查。
- **栈与锚点**：Markdown Skill、PPTX/SVG、Python helpers；`skills/ppt-master/SKILL.md`、`skills/ppt-master/scripts/svg_quality_checker.py`、`skills/ppt-master/workflows/stages/verify-charts.md`、`skills/ppt-master/templates/`、`skills/ppt-master/references/`。
- **取舍**：原生可编辑与设计规范很强；代价是协议面大，对模型遵循度和视觉复核要求高。
- **证据边界**：**E1**。本轮复核了 4 个增量提交和 authoring/native payload 合同，没有生成或打开真实 PPTX。
- **第一项任务**：解释 model-readable summary 与 compiler-only manifest 为何要分层，并各列一个不能丢的字段。

### 24. PaperBanana

- **类比**：先找参考图，再由策划、风格师、绘图员和批评者协作完成一张学术示意图。
- **首个输入输出**：论文内容、参考图和配置 → scientific figure、critique 和 polished result。
- **主链**：retriever → planner → stylist → visualizer → critic → polish。
- **栈与锚点**：Python、多 agent 图像生成；`main.py`、`agents/retriever_agent.py`、`agents/planner_agent.py`、`agents/visualizer_agent.py`、`agents/critic_agent.py`。
- **取舍**：聚焦论文中的“图”且显式迭代；代价是视觉正确不代表数据、公式或方法事实正确。
- **证据边界**：**E1**。agent 分工和工具已检查，没有调用图像模型或运行评价。
- **第一项任务**：从 planner 输出到 critic 输入列出必须保留的事实字段，避免风格重写改变科学含义。

### 25. posterly

- **类比**：先用网页搭海报，再拿尺子、预检器和印刷检查表逐项验收。
- **首个输入输出**：内容、尺寸和设计方向 → HTML/CSS、测量 JSON、预览、PDF 和 gate 结果。
- **主链**：确认规格 → 锁设计方向 → HTML 构建 → render/measure → polish → final verification。
- **栈与锚点**：Markdown Skill、HTML/CSS、Python/Playwright；`SKILL.md`、`tools/_posterly/measure.py`、`tools/_posterly/render.py`、`tools/_posterly/verify_final.py`、`tools/run_gates.py`。
- **取舍**：LLM 设计判断与确定性几何门分离；代价是长协议仍依赖 coding agent 正确执行，且 AGPL 限制代码复用。
- **证据边界**：**E1**。测量、渲染和 final gate 源码已检查，本轮没有生成或打印海报。
- **第一项任务**：读 `verify_final.py`，把检查项分成几何可自动判定与内容需人工判断两组。

### 26. paper2anything

- **类比**：一个多渠道编辑部，同一篇论文分别改编成 slides、poster、网页和社交内容。
- **首个输入输出**：论文与目标渠道 → 对应渠道的可发布 artifact。
- **主链**：选择渠道 Skill → 解析论文/素材 → 应用渠道内容规则 → render → 渠道专属检查。
- **栈与锚点**：Markdown Skills、Python/Node helpers；`paper2slides/SKILL.md`、`paper2poster/SKILL.md`、`paper2html/SKILL.md`、`paper2wechat/SKILL.md`、`paper2xhs/SKILL.md`。
- **取舍**：渠道覆盖广，适合复用内容策略；代价是共享事实源和统一 provenance 容易被各渠道副本冲散。
- **证据边界**：**E1**。五类渠道 Skill 和渲染入口已检查，没有生成或发布任何内容。
- **第一项任务**：比较两个渠道 Skill，列出哪些事实必须共用，哪些表达规则必须分开。

## 6. 生态索引

### 27. awesome-ai-auto-research

- **类比**：一张自动研究领域的书目和展品目录，帮助找到入口，但不替每件展品做质量鉴定。
- **首个输入输出**：项目、论文和 artifact 链接 → 按研究阶段组织的生态索引。
- **主链**：发现候选 → 按 idea/literature/coding/figures/writing/evaluation 分类 → 展示链接与示例。
- **栈与锚点**：Markdown、静态 HTML；`README.md`、`index.html`、`docs/assets/`。
- **取舍**：广度查漏成本低；代价是收录标准、项目声明和 benchmark 不能自动横向可比。
- **证据边界**：**E0/E1**。索引结构可由仓库确认，收录项目的功能和质量必须回到各自 upstream。
- **第一项任务**：任选三条索引项，分别标 E0/E1/E2 所需证据，不能把“被收录”写成“已验证”。

## 7. 项目级完成检查

完成一个项目的入门学习，至少能回答：

1. 它所在的生态层是什么，明确不负责什么？
2. 首个输入、关键状态和最终输出分别是什么？
3. 主控制流在哪 2-5 个源码锚点之间移动？
4. 一个设计选择解决了什么问题，又增加了什么成本？
5. 当前结论是 E0、E1 还是 E2，哪些运行或科学主张仍未验证？
6. 如果换一个新场景，应该先复用机制、修改 adapter，还是换项目？

答不出第 3-5 题，说明只是记住了项目宣传语，还没有达到可接班状态。
