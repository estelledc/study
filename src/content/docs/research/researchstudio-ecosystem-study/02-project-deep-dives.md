# 02. 项目深潜：27 个项目的架构、功能与代码组织

## 阅读说明

每张卡回答六个问题：项目定位、核心流程、状态与编排、代码组织、强项与局限、对 ResearchStudio 的启发。提交版本见 [05-repository-inventory.md](05-repository-inventory.md)。

## A. 核心参照与全生命周期项目

### 1. ResearchStudio

- 定位：面向 coding agent 的研究 idea 与论文多模态产物工具箱。
- 核心流程：
  - Idea：文献 grounding → 瓶颈/模式提取 → 候选 idea → 碰撞检查 → 批评与修订 → idea card。
  - Reel：PDF → `paper2assets` 共享资产 → poster / video / blog → reel 对齐查看器。
- 编排：以 skill 文档规定流程，Python/Node 脚本执行解析、渲染、测量和验证；运行状态主要落在目录、manifest 和中间文件。
- 代码组织：`ResearchStudio-Idea/`、`ResearchStudio-Reel/` 两个产品域，各自继续拆成 skills、references、scripts 和模板。
- 强项：边界小、可嵌入现有 agent、产物可编辑、确定性门禁明确。
- 局限：不负责通用实验执行；跨阶段状态与恢复能力弱于 AutoR / Co-Scientist。
- 关键入口：各子目录 `SKILL.md`，Reel 的 `paper2assets` 与各产物 skill。

### 2. AI-Scientist

- 定位：以实验模板为中心的线性端到端 AI 科学家。
- 核心流程：生成 idea → 新颖性检索 → 复制实验模板 → Aider 修改 `experiment.py` / `plot.py` → 多次实验 → LaTeX 写作 → 自动审稿与改进。
- 编排：`launch_scientist.py` 串联阶段；可按 GPU 多进程并行不同 idea，但单个 idea 内仍是主链。
- 状态：主要依赖复制后的模板目录、实验日志和 notes；恢复粒度较粗。
- 代码组织：`ai_scientist/` 放 idea、实验、写作、评审模块，`templates/` 放不同研究任务骨架。
- 强项：链路直观，是理解“自动研究最小闭环”的最佳起点。
- 局限：强依赖预定义模板；早期错误容易贯穿后续流程；缺少正式工作流状态机。
- 关键入口：`launch_scientist.py`、`ai_scientist/generate_ideas.py`、`perform_experiments.py`、`perform_writeup.py`、`perform_review.py`。

### 3. AI-Scientist-v2

- 定位：用 agentic tree search 扩展 AI-Scientist 的实验搜索空间。
- 核心流程：生成 idea → 创建初始实验节点 → 多 agent 扩展和评估分支 → 阶段转换 → 汇总日志与图表 → 写作 → LLM/VLM 评审。
- 编排：BFTS 风格的树搜索，AgentManager 管理节点、并行 agent 和 GPU；journal 记录研究分支。
- 状态：树节点、journal、阶段摘要和实验目录共同组成可追踪状态。
- 代码组织：`ai_scientist/treesearch/` 是核心新增层，其他写作和评审能力延续 v1。
- 强项：不再把一次实验选择当成唯一真相，适合研究分支探索。
- 局限：算力和模型调用成本更高；树评分仍依赖代理指标和模型判断。
- 关键入口：`launch_scientist_bfts.py`、`treesearch/agent_manager.py`、`parallel_agent.py`、`journal.py`。

### 4. AI-Researcher

- 定位：拥有浏览器、终端、Docker、搜索与论文写作能力的综合研究 agent。
- 核心流程：survey → idea → plan → code / experiment → result analysis → judge → paper composition。
- 编排：`research_agent` 与 `paper_agent` 分离；workflow / flowgraph 管理阶段，工具层连接浏览器、GitHub、Docker 和终端。
- 状态：全局状态、flow cache、代码树、论文和 RAG memory。
- 代码组织：`research_agent/inno/` 聚合不同研究角色，`paper_agent/` 负责章节和 TeX，`benchmark/` 组织任务。
- 强项：工具覆盖广，接近可操作真实研究环境的通用 agent。
- 局限：系统面大，部署和安全边界复杂；静态阅读时需要区分框架、任务和 benchmark。
- 关键入口：`main_ai_researcher.py`、`research_agent/inno/`、`paper_agent/`、`global_state.py`。

### 5. Agent Laboratory

- 定位：以教授、博士后、博士生、工程师角色协作的研究助理系统。
- 核心流程：文献综述 → 计划 → 数据准备与实验 → 结果解释 → 报告 → reviewer 反馈；评审不通过可回到计划或实验。
- 编排：`LaboratoryWorkflow` 维护 phase，角色 agent 通过对话和任务工具完成阶段。
- 状态：workflow 可序列化为 pickle；实验和论文 solver 分别运行命令、编辑文件和解释结果。
- 代码组织：workflow、agents、tools、solvers、experiment configs 分层。
- 强项：人机协作和角色分工清晰，循环不是纯线性。
- 局限：pickle 可恢复但不利于跨版本审计；多角色对话可能增加成本而不一定提升事实质量。
- 关键入口：`agent_laboratory.py`、`agents.py`、`tools.py`、MLESolver / PaperSolver。

### 6. AutoResearchClaw

- 定位：23 stage、8 phase 的自动研究流水线，支持全自动和 Co-Pilot。
- 核心流程：从问题定义、文献、方案、实现、实验、分析、论文到发布，并提供 ARC benchmark 比较其他研究 agent。
- 编排：配置驱动的 pipeline；HITL 模式可暂停、批准、拒绝和注入指导；可通过 OpenClaw、ACP 或 CLI 连接 agent。
- 状态：pipeline status、stage artifacts、配置和 sentinel 协同维持长程运行。
- 代码组织：`researchclaw/` 运行时，`tests/`、`docs/`、`scripts/`，另有 benchmark adapters。
- 强项：生命周期覆盖最广之一，明确处理人工介入和 agent host 适配。
- 局限：阶段多导致运维面大；“全自动”需要严格限制外部副作用和预算。
- 关键入口：`researchclaw/`、`config.researchclaw.example.yaml`、`prompts.default.yaml`。

### 7. FAROS

- 定位：带后端、前端和 API 的 artifact-first AI 研究操作系统。
- 核心流程：idea / review / experiment / artifact / paper 由 runtime orchestrator 和 capability adapter 组合。
- 编排：orchestrator 调用 agent executor；registry 管理 agent 和 artifact 类型；FastAPI 暴露工作流和产物。
- 状态：state store、artifact store 和数据库模型比纯目录型项目更产品化。
- 代码组织：`backend/app/faros/runtime/`、`registry/`、`capabilities/`、API modules，`frontend/` 提供用户界面。
- 强项：运行时分层明确，适合研究“如何把 agent workflow 做成服务”。
- 局限：当前 release scope 仍有限；产品层复杂度可能快于科研能力成熟度。
- 关键入口：`runtime/orchestrator.py`、`agent_executor.py`、`state_store.py`、`artifact_store.py`。

### 8. AutoR

- 定位：文件化、可恢复、人工治理优先的九阶段研究工作台。
- 核心流程：intake → literature → hypothesis → design → implementation → experiment → analysis → writing → dissemination。
- 编排：ResearchManager 逐阶段执行；每阶段有 attempt loop、验证栏和人工或自动批准语义。
- 状态：run manifest、decision、evidence、stage report、workspace 和产物目录都是正式协议；支持 resume、rollback、jump。
- 代码组织：manager、stage prompts、operator protocol、studio UI、tests 分离。
- 强项：状态、审批、失败恢复和产物命名都很清楚，是治理设计的优秀参考。
- 局限：研究质量仍取决于外部 agent；框架保证的是过程纪律，不是结论正确。
- 关键入口：ResearchManager、`prompts/00...08`、run manifest、Studio。

### 9. InternAgent

- 定位：面向长程自主科学发现的统一多智能体框架。
- 核心流程：global planner → coordinator → task planner → task execution → synthesizer，并提供 memory 与 deep research。
- 编排：多层 planner / executor 体系，内部包含较大规模 CAMEL 风格 agent 基础设施。
- 状态：任务、记忆和框架级会话对象共同维护长程上下文。
- 代码组织：`internagent/mas/agents/dr_agents/` 是研究 agent 核心，`camel/` 包含大量通用 agent 和工具实现；`sci_tasks` 是独立依赖边界。
- 强项：框架完整，适合研究多层计划和长程任务分解。
- 局限：代码量和内嵌框架较重，主线概念容易被通用基础设施淹没。
- 关键入口：agent factory、global planner、coordinator、task planner、synthesizer。

### 10. nano-scientist

- 定位：强调小型、预算感知和 skill 懒加载的四循环研究 agent。
- 核心流程：literature → experiment → writing → compile，循环直到预算或完成条件。
- 编排：flow 创建 scientist graph，按可用 API key 过滤 skills，统一 budget state 和 trajectory logging。
- 状态：共享预算、轨迹、输出目录和 skill index。
- 代码组织：主流程很薄，大量能力封装成独立 SKILL；核心位于 `src/flow.py` 和 skills 目录。
- 强项：比大而全系统更容易理解，明确把预算放进核心。
- 局限：skill 数量增多后需要更强的选择、版本和安全治理。
- 关键入口：`main.py`、`src/flow.py`、skill index。

## B. 选题、证据与科学讨论

### 11. Idea2Paper

- 定位：从论文知识图谱和研究 pattern 生成 proposal / paper story。
- 核心流程：离线构建 ICLR Paper-KG → 多路径召回 → pattern 选择与融合 → story 生成与反思 → anchored multi-agent review → novelty check → bundle。
- 编排：application pipeline 组织检索、生成、评审和预检；同时保留 legacy scripts。
- 状态：KG、检索结果、review anchors、novelty index 和输出 bundle。
- 代码组织：`Paper-KG-Pipeline/src/idea2paper/application/pipeline/` 是新主线，`scripts/pipeline/` 有历史重复。
- 强项：idea 不是只从模型参数中“想出来”，而是显式绑定论文结构和 pattern。
- 局限：KG 构建和数据集成本高；代码存在新旧入口并存。
- 对 ResearchStudio：可借鉴结构化近邻召回、review anchor 和 novelty index。

### 12. Co-Scientist

- 定位：通过多智能体生成、反思、排序和演化假设的协作科学家。
- 核心流程：generation → reflection → ranking → evolution → proximity → metareview，持续改进假设。
- 编排：supervisor 解析计划，SQLite task queue 使用 lease 与幂等键，async workers 有界并发。
- 状态：sessions、hypotheses、reviews、tournament matches、Elo journal、tasks、transcripts、feedback、embeddings、spans、events。
- 终止：预算、时间、Elo 稳定、外部停止和 idle 都可结束运行。
- 强项：数据库模式、并发控制、可观测性和停止条件完整。
- 局限：Elo 和模型互评不等于真实科学价值；多智能体容易形成共享偏差。
- 对 ResearchStudio：Idea 可借鉴持久化 hypothesis lineage、反例任务和显式终止器。

### 13. PaperQA2

- 定位：面向科学文档的 agentic RAG 与证据问答引擎。
- 核心流程：PaperSearch → GatherEvidence → GenerateAnswer → Complete；可自动添加文档或查询已有 index。
- 编排：agent query 连接 Aviary / LDP agent；`PQASession` 记录状态、成本和工具历史。
- 状态：`Docs`、index、session 和 evidence context；支持外部数据库和缓存。
- 代码组织：搜索、reader、clients、agents、settings 和大量测试/cassette 分层。
- 强项：检索和证据层成熟，元数据源、撤稿、开放获取和多模态支持丰富。
- 局限：它回答问题，不负责提出并执行研究实验。
- 对 ResearchStudio：可作为 Idea 的文献证据后端，比简单搜索结果更适合 claim grounding。

### 14. STORM

- 定位：通过多视角访谈构建高质量长篇调研文章；Co-STORM 支持人机讨论。
- 核心流程：persona / question asking → information table → outline → article → polish。
- 编排：STORMWikiRunner 为不同阶段配置不同 LM；Co-STORM 增加专家、moderator、discourse manager 和动态 knowledge base。
- 状态：information table、article、对话历史、mind map。
- 代码组织：抽象接口与 STORM / Co-STORM 实现分开，retriever 可替换。
- 强项：把“先问出不同视角，再组织文章”作为显式步骤。
- 局限：产物仍以调研文章为主，实验与新颖性验证不在范围内。
- 对 ResearchStudio：Idea 的候选生成可借鉴 persona diversity，Reel blog 可借鉴 information table。

### 15. paper-search-mcp

- 定位：统一多学术平台搜索、下载和 MCP/CLI/skill 接口。
- 核心流程：标准 Paper 数据模型 → 各 source adapter 并发搜索 → DOI 或标题作者去重 → 开放获取下载 fallback。
- 编排：FastMCP server 暴露工具；同步平台用 `asyncio.to_thread` 包装。
- 状态：以请求和标准化结果为主，不承担长程研究状态。
- 代码组织：server、source adapters、models、download 和 tests。
- 强项：平台覆盖广、接口统一，可作为上层研究 agent 的检索基础设施。
- 局限：上游平台限流和数据质量不可控；涉及非正规全文来源的适配必须遵守法律和组织政策。
- 对 ResearchStudio：可替代单一搜索 API，但需要来源白名单、速率限制和合规门。

## C. Skill、能力和研究 artifact

### 16. AI-Research-SKILLs

- 定位：面向 AI/ML 研究工程的技能库，含 autoresearch 总编排。
- 核心设计：23 类近百个 skills；中央 autoresearch 使用内层快速实验、外层综合反思的双循环。
- 状态：`research-state.yaml`、日志、findings、literature、experiments 和 paper。
- 强项：将模型架构、训练、评估、RAG、MLOps 和论文写作拆成可安装技能。
- 局限：其中“持续运行、不要等待许可”的自治提示不适合直接复制到有外部状态和 WIP 门的环境。
- 对 ResearchStudio：说明 skill-first 是可扩展路线，但必须增加预算、授权和停止契约。

### 17. scientific-agent-skills

- 定位：覆盖科学软件、数据库和分析方法的大规模能力目录。
- 核心设计：每个 skill 封装一个工具或领域工作流，支持不同 agent host 安装。
- 代码组织：按领域和软件分组，包含大量 Markdown 指令、Python 辅助脚本、安装器和测试。
- 强项：能力广度远超单一研究项目，可作为上层 orchestrator 的“科研工具箱”。
- 局限：能力可用不等于工作流会正确选择；第三方 skill 需要安全审查和版本锁定。
- 对 ResearchStudio：Reel / Idea 可保持小核心，按需接入领域 skill，不应把所有能力内置。

### 18. Agent-Native Research Artifact

- 定位：为 agent 研究过程生成可审计、可继续的 ARA artifact。
- 核心设计：
  - 认知层：claim、concept、heuristic。
  - 物理层：code、config、data、results。
  - 过程层：探索树、失败分支、证据和跨层绑定。
- 质量门：基础 capture 后再由 rigor reviewer 按证据相关性、可证伪性、范围、连贯性、探索完整性、方法严谨性评分并 seal。
- 强项：把“为什么相信这个结论”做成正式数据结构。
- 局限：artifact 质量仍依赖执行者诚实记录；schema 过重会增加维护成本。
- 对 ResearchStudio：Idea card 可升级为 claim-evidence graph；Reel 可携带来源绑定而不只携带展示素材。

## D. 论文传播与视觉产物

### 19. Paper2Poster

- 定位：多模态论文到学术海报系统。
- 核心流程：解析论文 → 过滤图表 → 生成 outline → tree-split layout → 内容生成 → PPTX 代码 → 渲染和视觉反馈调整。
- 编排：Python 主 pipeline 串联文本模型、视觉模型和几何布局；提供 ablation 与 eval。
- 状态：tmp 文件、布局数组、样式配置、token 和时间日志。
- 代码组织：`PosterAgent/` 是主流程，`utils/` 辅助，`Paper2Poster-eval/` 做评价；包含部分复制的外部组件。
- 强项：树布局和 visual-in-the-loop 有论文级方法与评测。
- 局限：主脚本较长，职责混合；依赖较重，代码有历史重复。
- 对 ResearchStudio：适合参考布局搜索与评价方法，不宜照搬整体组织。

### 20. PosterGen

- 定位：审美感知的多 agent 海报流水线。
- 核心流程：parser → curator → color → section-title → layout balancer → font → renderer。
- 编排：LangGraph `StateGraph`，每个 agent 节点读写统一 `PosterState`。
- 状态：内容、样式、布局、模型和 timing / cost metrics。
- 代码组织：`src/agents/`、`src/state/`、`src/workflow/`、renderer 和 web UI 分开。
- 强项：状态和节点边界比 Paper2Poster 清楚，适合理解视觉 agent 分工。
- 局限：流水线顺序固定；多个视觉 agent 是否必要需用 ablation 验证。
- 对 ResearchStudio：可借鉴显式 PosterState 和统一成本日志。

### 21. Paper2Video

- 定位：把论文转成带幻灯片、语音、字幕、光标和数字人讲解的视频。
- 核心流程：论文理解 → slide generation → narration / TTS → subtitles → cursor / talking head → video composition。
- 编排：`src/pipeline.py` 协调多个媒体模块，评测目录提供 Paper2Video benchmark。
- 状态：阶段产物以文件为主，模块之间通过媒体路径和配置衔接。
- 代码组织：`src/` 主线清楚，但 evaluation 内包含较重的文档解析依赖。
- 强项：视频生成链路完整，并试图建立专门评价。
- 局限：GPU、语音、视频和外部模型耦合高，部署成本显著。
- 对 ResearchStudio：Reel video 可借鉴专门评价，但应保留共享资产和可选重组件。

### 22. Paper2Slides

- 定位：从论文一键生成可恢复的演示文稿。
- 核心流程：RAG → summary → plan → slide generation，可选 fast / parallel。
- 编排：四个清晰 stage，显式 pipeline state 和 checkpoint；另有 FastAPI / Web UI。
- 状态：输出目录、处理状态和 checkpoint 支持 smart recovery。
- 代码组织：`core/pipeline.py`、state、stages、API 与前端边界明确。
- 强项：阶段少而清晰，恢复设计优于一次性脚本。
- 局限：内容规划与视觉生成质量仍依赖模型和外部图像服务。
- 对 ResearchStudio：可借鉴跨产物通用 checkpoint 和 stage contract。

### 23. ppt-master

- 定位：让 coding agent 从任意文档生成原生 PowerPoint 的大型 skill。
- 核心设计：skill 指令规定内容分析、设计方向、原生 shape、图像获取、渲染和验证；大量 reference、style 和 mode 资料支撑执行。
- 状态：以工作目录、PPTX、渲染图和检查报告为主。
- 代码组织：skill-first，核心知识主要在 Markdown 和辅助脚本，不是传统 Python 应用。
- 强项：设计规范和 agent 操作手册极详细，输出保持原生可编辑。
- 局限：指令面很大，需要强模型和严格遵循；部分质量依赖人工视觉判断。
- 对 ResearchStudio：其原生 PPT 与视觉规范已是 Reel 的重要邻接能力。

### 24. PaperBanana

- 定位：面向学术图表和方法示意图的多 agent 生成系统。
- 核心流程：retriever 找参考 → planner 规划信息结构 → stylist 设定视觉语言 → visualizer 生成 → critic / polish 迭代。
- 状态：配置、prompt、reference、生成图和评价结果。
- 代码组织：`agents/`、`prompts/`、`configs/`、`utils/`、skill wrapper 和 tests。
- 强项：专注“图”而不是整张 poster，可补齐论文传播中的关键视觉资产。
- 局限：生成图必须检查数据和方法事实，不能只看审美。
- 对 ResearchStudio：可作为 `paper2assets` 的 figure enhancement 插件，但必须保留原始证据和人工确认。

### 25. posterly

- 定位：coding agent 驱动的 HTML/CSS 学术海报 skill。
- 核心流程：确认规格与内容 → 设计方向缩略图 → HTML 构建 → render / measure → polish → final verification。
- 编排：长篇 SKILL 规定决策顺序，Python / Playwright / Poppler 工具执行尺寸、溢出、图像质量和 PDF 检查。
- 状态：HTML、tokens、图片、测量 JSON、预览和 PDF。
- 代码组织：`SKILL.md` + `templates/` + `tools/` + `tests/`，非常接近 ResearchStudio 的设计哲学。
- 强项：明确区分 LLM 设计判断与确定性几何门；强调 claim-to-evidence 内容审计。
- 局限：依赖 coding agent 正确遵循长协议；AGPL 对代码复用有约束。
- 对 ResearchStudio：最值得参考的是 measure / verify 门和“先锁设计方向再精修”的流程。

### 26. paper2anything

- 定位：把论文转为 slides、poster、HTML、微信公众号和小红书内容的 skill 集合。
- 核心流程：各渠道有独立 skill，共享解析、素材收集、几何、截图和渲染工具。
- 编排：agent 选择目标渠道并执行对应协议；产物落入固定输出目录。
- 代码组织：`paper2slides/`、`paper2poster/`、`paper2html/`、`paper2wechat/`、`paper2xhs/` 加公共 tools。
- 强项：覆盖中文内容分发渠道，强调多渠道适配而非单一演示格式。
- 局限：共享资产和统一 provenance 仍可加强；渠道规则会快速变化。
- 对 ResearchStudio：可参考“同一论文，多渠道内容策略”，但应由 `paper2assets` 保持单一事实源。

## E. 生态索引

### 27. awesome-ai-auto-research

- 定位：AI auto-research 领域的综述、项目清单和生成 artifact 展示。
- 代码组织：以结构化 Markdown 分类为主，按 idea、literature、coding、figures、writing、evaluation 等维度组织。
- 强项：适合广度查漏和观察能力完整性问题。
- 局限：它是索引，不是可对比的统一 benchmark；收录不代表质量背书。
- 本研究用途：作为语料集发现与交叉核对入口，不把它计为完整运行时实现。
