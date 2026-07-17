# 逐项目深度分析

## 1. DeepTutor

### 定位

DeepTutor 是本轮最接近“长期个人学习工作区”的项目。它把聊天、解题、出题、研究、可视化、动画、书籍、笔记、题库、伙伴和 mastery path 放到同一运行时上。

### 核心运行链

```text
deeptutor CLI / FastAPI / WebSocket
  -> TurnRequest
  -> TurnRuntimeManager.start_turn()
  -> 后台 _run_turn()
  -> 构建历史、附件、persona、skills、memory、source manifest
  -> UnifiedContext
  -> ChatOrchestrator.handle()
  -> capability.run()
  -> AgentLoop + tools
  -> StreamBus events
  -> 持久化 assistant message / artifacts / memory trace
```

`UnifiedContext` 是关键边界。它不是简单 messages 数组，而是一次 turn 所需的稳定输入契约，包含：

- session 和 conversation history；
- 用户消息与附件；
- active capability；
- knowledge bases；
- enabled/allowed tools；
- memory、persona、skills 和 source manifest；
- capability-specific metadata。

`ChatOrchestrator` 只做三件事：

1. 从 registry 找 capability；
2. 管理 StreamBus 生命周期；
3. 统一发送完成事件。

复杂教学逻辑留在 capability 和 pipeline 中，因此 Web、CLI 和 SDK 不需要各自实现一套 Agent。

### Chat pipeline

Chat capability 不是一次 completion，而是一个合并后的工具循环：

- 先根据 KB、memory、skill、exec、partner 等条件组装工具；
- 生成稳定 system prompt 和用户上下文；
- 在同一 messages 列表中追加 assistant/tool 轮次；
- 支持 deferred MCP tools、sandbox gate 和 pause/resume；
- 最终回答与工具 narration 分开持久化。

### 知识系统

每个 KB 绑定一个引擎，支持 LlamaIndex、PageIndex、GraphRAG、LightRAG、LightRAG Server 或 Obsidian。版本化目录避免重建失败破坏旧索引。

### 记忆系统

```text
L1: trace/<surface>/<date>.jsonl
  -> L2: 每个 surface 的 Markdown 摘要
  -> L3: recent/profile/scope/preferences 跨 surface 综合
```

重要设计不是“三层”这个数字，而是引用关系：

- L2 结论引用 L1；
- L3 结论引用 L2；
- audit、dedup、merge 和 guard 可以检查不充分或过度概括的结论。

### 代码组织

- `deeptutor/services/session/`：会话、turn、上下文构建；
- `deeptutor/runtime/`：orchestrator、registry；
- `deeptutor/agents/`：chat、question、research、visualize、math animator 等；
- `deeptutor/capabilities/`：可挂载到统一 loop 的能力；
- `deeptutor/knowledge/`：KB 生命周期；
- `deeptutor/services/memory/`：L1/L2/L3；
- `deeptutor/tools/`：工具实现；
- `deeptutor/api/`、`deeptutor_cli/`、`web/`：入口与前端；
- `tests/`：按 runtime、capability、API、knowledge、tool 分层。

### 值得学习

- 用稳定 context contract 隔离入口与执行；
- capability registry 让功能扩展不污染入口；
- StreamBus 将执行与呈现解耦；
- 文件记忆强调可读、可改、可追溯；
- 多知识引擎按 KB 选择，而不是全局锁死。

### 风险和代价

- surface 多、状态多，理解和回归成本高；
- 配置、授权、multi-user、partner 和 tool gate 交叉复杂；
- 多引擎带来依赖、迁移和行为一致性压力；
- “功能闭环”仍需与真实学习效果评估分开看。

## 2. Open TutorAI Community Edition

### 定位

Open TutorAI 更像一个面向学校/组织的开源 AI 教学平台底座：账户、角色、课程、课堂、会话、模型、RAG、媒体和治理都是显式业务域。

### 当前架构

源码采用接近 Clean Architecture 的分层：

```text
gateway/http
  -> domain service
  -> repository
  -> SQLite/PostgreSQL/Chroma
  -> provider/transport adapter
```

`gateway/http/app.py` 是 application factory：

- 初始化数据库；
- 注册 `/api/v1` routers；
- 挂载 Socket.IO；
- 最后挂载 SvelteKit SPA；
- 将 provider、chat、retrieval、memory、supports 等路由统一组装。

`ai/llm/service.py` 很薄，只依赖抽象 `LLMTransport`。这说明项目尝试让业务服务不直接绑定某一家模型 API。

### 代码组织

- `accounts/`：认证、权限、角色、用户；
- `learning/`：learner、teacher、classroom、course、session、support；
- `ai/`：LLM、provider、retrieval、memory、media、tool；
- `governance/`：self-regulation/evaluation；
- `data/`：模型与 repository；
- `gateway/`：HTTP 和 realtime；
- `ui/`：SvelteKit 前端。

### 设计与状态要分开

README 的 Current Architecture 有源码支撑；Target Agentic Flow 描述未来的多步 tool loop，但不能据此断言当前已经完整实现 Agent service。

### 值得学习

- 业务域比 DeepTutor 更显式；
- provider adapter 和 transport boundary 清晰；
- auth、role、classroom、teacher 等教育组织能力更完整；
- 适合作为“AI Tutor 平台后端”而非个人 Agent 工作区的对照。

### 风险

- 当前 AI service 仍偏薄，教学策略和 learner adaptation 的运行证据有限；
- 产品域很多，核心教学智能可能被 CRUD 和平台功能稀释；
- target architecture 与 current implementation 之间仍有距离。

## 3. GenMentor

### 定位

GenMentor 是一个目标导向 Intelligent Tutoring System。它的价值在于把教学闭环拆得非常清楚，适合学习“教学业务如何映射为 Agent 模块”。

### 核心链路

```text
refine goal
 -> map goal to required skills
 -> identify skill gaps
 -> initialize learner profile
 -> schedule learning path
 -> explore knowledge points
 -> draft/integrate learning content
 -> generate quizzes / tutor chat
 -> update profile / reschedule
```

每个 Agent 继承 `BaseAgent`，提供：

- system prompt；
- task prompt；
- Pydantic 输入；
- Pydantic 输出；
- LLM factory。

`AdaptiveLearnerProfiler` 将初始化和更新分成两个入口，并把模型输出再次通过 `LearnerProfile` 校验。`SkillGapIdentifier` 则要求目标、学习者信息和技能要求全部到位。

### 代码组织

- `backend/modules/skill_gap_identification/`；
- `backend/modules/adaptive_learner_modeling/`；
- `backend/modules/personalized_resource_delivery/`；
- `backend/modules/ai_chatbot_tutor/`；
- `backend/modules/learner_simulation/`；
- `backend/base/`：LLM、embedder、search 和 BaseAgent；
- `frontend/`：Streamlit。

### 值得学习

- 教学对象命名清晰，容易建立领域模型；
- 输入输出 schema 降低 prompt 结果漂移；
- learner simulation 为评估和演示提供可控学生；
- goal、gap、profile、path 和 content 之间关系明确。

### 风险

- `backend/main.py` 直接承载大量 endpoint 编排，应用层偏集中；
- 存在硬编码上传路径、宽松 CORS 和全局 manager；
- 画像更新仍由 LLM 推断，缺少像 DeepTutor 那样的证据引用链；
- 持久化、权限、取消、恢复和工具治理不如完整产品运行时。

## 4. Tutor-GPT

### 定位

Tutor-GPT 的独特之处不是课程规划，而是 Theory of Mind：先推断 Tutor 需要知道哪些用户信息，再用外部 Honcho 服务查询用户心理表示。

### 核心链路

```text
用户消息 + 历史
 -> Empath thought prompt
 -> 生成 Honcho query 和可选 PDF query
 -> 并行查询用户表示与文档
 -> 将 context 注入 Bloom response prompt
 -> 流式回答
 -> 保存 conversation/thought/context/summary
```

`utils/ai/index.ts` 是主编排：

- 拉取 message、thought、Honcho、PDF 和 summary 历史；
- 第一轮模型输出用分隔符拆成 thought/Honcho query/PDF query；
- 调用 Honcho session chat 和 PDF collection；
- 构造最终 Tutor prompt；
- 生成回答并异步保存。

### 代码组织

- `app/api/chat/`：Next.js route；
- `utils/ai/`：prompt assembly、stream、summary、conversation；
- `utils/prompts/`：Tutor、Empath、PDF、summary；
- `utils/honcho.ts`：用户表示服务；
- `supabase/`：认证、会话和迁移；
- `components/`：聊天产品 UI。

### 值得学习

- 把“查什么个性化信息”与“怎样回答”拆成两次推理；
- 心理表示与文档上下文是两种不同来源；
- prompt 对苏格拉底式对话和结束问题有明确策略；
- 产品层具备认证、订阅、限流和文件聊天。

### 风险

- 核心个性化依赖外部 Honcho；
- 大量关键行为写在长 prompt 中，难以单元测试；
- 第一轮生成内部 thought 再解析分隔符，协议脆弱；
- 用户心理推断的隐私、纠错和解释责任很重；
- 与 DeepTutor 的显式 capability/runtime 相比，编排更集中在单个应用函数。

## 5. nanobot

### 定位

nanobot 是一个轻量但工程化程度高的通用 Agent runtime，也是理解 DeepTutor 早期 TutorBot 演化的重要参照。

### 核心状态机

```text
RESTORE
 -> COMPACT
 -> COMMAND
 -> BUILD
 -> RUN
 -> SAVE
 -> RESPOND
 -> DONE
```

`AgentLoop` 把一次 turn 的状态放入 `TurnContext`，包括：

- session/history/initial messages；
- immutable LLM runtime snapshot；
- tools、hooks、request context；
- stream/progress/retry callbacks；
- final content、stop reason 和 trace；
- queue、summary 和 latency。

这种写法的优势是：失败发生在哪一阶段非常清楚，也适合恢复、监控和测试。

### 代码组织

- `nanobot/agent/loop.py`：turn 状态机；
- `nanobot/agent/runner.py`：LLM/tool 轮次；
- `nanobot/agent/context.py`：history、memory、skills；
- `nanobot/agent/tools/`：工具和 registry；
- `nanobot/session/`：持久化与 continuation；
- `nanobot/bus/`：输入输出事件；
- `nanobot/channels/`：IM/channel；
- `nanobot/gateway/`、`nanobot/webui/`：服务入口；
- `tests/`：按 runtime component 分组。

### 值得学习

- 显式状态机；
- message bus 解耦 channel 和 Agent；
- 每 turn 捕获 LLM runtime，避免中途配置漂移；
- contextvars 绑定 request、workspace 和 file state；
- 自动 compaction、memory consolidation、subagent 和 hook 都围绕小核心扩展。

### 与 DeepTutor 的关系

nanobot 更像可靠的通用 Agent 核心；DeepTutor 在类似运行基础上叠加了教育 surface、capability、KB、题库、书籍和分层记忆。

## 6. AutoAgent

### 定位

AutoAgent 解决“如何让模型自己创建 Agent、工具和 workflow”。它不是教学系统，但代表 DeepTutor 生态中的 Agent 生成与零代码编排方向。

### 核心机制

`MetaChain` 维护：

- `Agent`：model、instructions、functions、tool choice；
- history；
- context variables；
- LLM function calling；
- tool result；
- Agent handoff。

工具可以返回另一个 `Agent`，使控制权转移。对不支持原生 function calling 的模型，项目会把工具描述写进 prompt，再把文本转换为 tool call。

另一条主线是 meta-agent：

- Agent Former 生成结构化 XML form；
- editor/creator 根据 form 创建 Agent；
- tool editor 创建工具；
- workflow former/creator 生成多 Agent workflow。

`autoagent/flow/` 提供事件图：event 可以监听一组父事件，在依赖满足时调度；支持 goto 和 abort。

### 值得学习

- Agent、tool、handoff 的最小抽象；
- meta-agent 如何把自然语言需求转成结构化定义；
- workflow 中依赖组与并发调度；
- 模型 function calling 差异的兼容层。

### 风险

- 动态生成并执行 Agent/工具代码，安全边界非常重要；
- core 文件较大，错误处理和兼容逻辑混杂；
- 自动生成质量依赖 prompt，生成后仍需验证；
- 若用于教学，需要额外增加教学 policy、权限和学习状态。

## 7. AI-Researcher

### 定位

AI-Researcher 把科学研究拆成多 Agent 流程，是 DeepTutor Research 能力的参考项目。其范围从文献、想法和实验一直延伸到论文写作。

### 核心模块

- survey agent：查找并组织相关工作；
- idea/plan agent：提出并筛选研究想法、规划实验；
- ML/prepare agent：准备代码和环境；
- experiment analyser/judge：分析结果、判断是否继续；
- paper agent：按领域模板生成论文各章节；
- browser/docker environment：给 Agent 提供搜索和执行环境；
- code/paper/tool/rag memory：保存不同类型的研究上下文。

### 核心链路

项目有两条显式入口：

```text
run_infer_plan.py
 -> 已给定 idea
 -> 搜 GitHub、选择并 clone 参考实现
 -> 下载论文源码
 -> Survey Agent 提炼公式与实现
 -> Coding Plan Agent
 -> ML Agent 实现并跑真实数据
 -> Judge Agent 审查
 -> 不通过则回到 ML Agent 修复
 -> Experiment Analysis Agent 提出补充实验
 -> ML Agent 继续实验和完善
```

```text
run_infer_idea.py
 -> 只有参考论文
 -> Idea Agent 多次生成候选 idea
 -> 再调用 Idea Agent 选择和补全一个 idea
 -> Code Survey Agent 对齐论文概念与参考代码
 -> 后续进入 plan / implementation / judge / experiment refinement
```

`InnoFlow` 是显式 Python 编排器。`FlowModule`、`AgentModule` 和
`ToolModule` 为阶段提供缓存；真正的 Agent 工具循环由 `MetaChain`
执行，并允许工具结果切换当前 Agent。当前实现不是“任意生成一个研究
DAG 后自动运行”，而是入口脚本预先定义阶段顺序，在若干阶段用循环完成
实现、评审和实验改进。

### 代码组织

- `research_agent/run_infer_plan.py`：给定 idea 的主流程；
- `research_agent/run_infer_idea.py`：从参考论文生成 idea 的主流程；
- `research_agent/inno/agents/`：研究阶段 Agent；
- `research_agent/inno/core.py`：`MetaChain` 工具调用和 Agent handoff；
- `research_agent/inno/workflow/`：flow graph、阶段封装和缓存；
- `research_agent/inno/environment/`：浏览器、Docker、文件读取；
- `research_agent/inno/memory/`：代码、论文、RAG、工具记忆；
- `paper_agent/`：写作、模板和领域子目录；
- `benchmark/`：不同研究领域的候选和结果。

### 值得学习

- 把开放式 research 拆成有检查点的阶段；
- 将环境执行、代码搜索和文献搜索作为工具；
- 研究记忆按信息类型拆分；
- judge/analysis Agent 不与 idea Agent 共用同一职责。

### 风险

- 仓库包含大量 benchmark、模板和资产，核心链不够集中；
- 自动研究结论高度依赖外部环境和模型；
- 生成论文不等于研究有效，需要真实实验和人工审查；
- 原仓库未被 GitHub 识别出标准许可证，本轮仅作研究参考。

## 8. ManimCat

### 定位

ManimCat 把自然语言数学说明转为 Manim 动画，是“教学表达生成”而非“知识检索”组件。

### 核心链路

ManimCat 现在有两套并存的运行模式。经典 Workflow Mode 的生成路径是：

```text
用户描述/参考图
 -> Express API 创建 Bull job
 -> Concept Designer 生成 scene design
 -> Code Generator 生成 Manim Python
 -> static guard：py_compile + mypy + AI patch
 -> Manim 真实渲染
 -> 若失败，把 stderr、失败代码和 scene design 交给 Code Retry
 -> 最多若干轮 patch + rerender
 -> 保存视频/图片/代码/timing/history
```

预生成代码、AI 编辑和全新生成是三个显式 flow；取消、队列重试和
“代码修复重试”也是不同层次，不能混为同一个 retry。

Agent Mode 则是另一条长生命周期链：

```text
Studio session
 -> run
 -> Builder / Designer / Reviewer
 -> workspace 与 render 等工具
 -> task / work / work-result
 -> SSE 推送状态与权限请求
 -> 继续修改、渲染和审查
```

它同时支持 Manim Studio 和 Plot Studio。两者复用 session/run/task/work
模型，但执行策略和 render tool 不同：前者运行 Manim 动画或图片，后者
运行 matplotlib 静态图。

### 代码组织

- `src/routes/`：生成、修改、状态、取消、Studio 等 HTTP API；
- `src/queues/processors/`：经典 Workflow Mode 的 job 编排；
- `src/services/concept-designer/`：scene design 与 code generation 两阶段生成；
- `src/services/static-guard/`：渲染前静态检查和 patch；
- `src/services/code-retry/`：基于真实渲染错误的代码修复；
- `src/utils/manim-executor*`：Manim 进程执行；
- `src/studio-agent/`：Agent Mode 的 runtime、状态、工具、权限和持久化；
- `frontend/`：Classic UI、Studio workspace 和管理界面。

### 值得学习

- 将生成模型输出限制为可执行中间表示；
- 用真实执行结果做反馈，而非只让模型自我评价；
- LaTeX、Manim 和视频渲染组成确定性产物链；
- 将一次性生成队列与长生命周期 Agent workspace 分开建模；
- 把静态检查、真实渲染、模型修复和队列重试分成不同可靠性层；
- 适合与 Tutor 的概念解释、题目和书籍 block 结合。

### 风险

- 执行生成代码必须隔离；
- 动画“能渲染”不等于“数学正确”；
- 渲染耗时、字体/LaTeX 环境和依赖较重；
- 视觉质量需要额外 review，而不只是修语法错误。

## 9. LightRAG

### 定位

LightRAG 是图与向量结合的 RAG 框架，目标是在相对轻量的结构中同时支持局部实体问题和全局关系问题。

### 核心对象

`LightRAG` dataclass 集中声明：

- KV、vector、graph、doc status storage；
- chunk、embedding、LLM、rerank；
- entity/relation token budget；
- workspace 和并发配置。

### 摄取链

```text
document
 -> enqueue + status
 -> chunk
 -> LLM 抽取 entity/relation
 -> graph merge/summary
 -> entity/relation/chunk vector upsert
 -> finalize storage
```

SDK 的 `ainsert()` 默认走 fixed-token；Server pipeline 可以按文档选择不同 chunker。这个差异很重要，不能把 SDK 默认行为当成服务端全部能力。

### 查询链

- `aquery_data()`：只返回结构化 retrieval data；
- `aquery_llm()`：检索后生成；
- `aquery()`：兼容层，只返回文本或 stream。

支持 local、global、hybrid、mix、naive、bypass 等查询模式，并可替换多种图、向量和 KV 存储。

### 值得学习

- 存储接口化；
- graph data 与 vector data 一致写入；
- retrieval data 与 generation 分开；
- workspace 隔离、doc status 和迁移工具；
- SDK 与 API Server 共用核心。

### 风险

- LLM 建图成本和错误会进入索引；
- 多存储 backend 增加兼容测试；
- 并发与 event loop 所有权有严格要求；
- 图检索不一定对短、小、无关系文档有收益。

## 10. RAG-Anything

### 定位

RAG-Anything 不是另起炉灶的 RAG，而是在 LightRAG 之上增加复杂文档和多模态管线。

### 核心结构

`RAGAnything` 由三个 mixin 组成：

- `ProcessorMixin`：文档处理；
- `QueryMixin`：文本与多模态查询；
- `BatchMixin`：批量并发。

内部持有 `LightRAG`，并初始化：

- image processor；
- table processor；
- equation processor；
- generic processor；
- context extractor；
- parse/status cache。

### 数据链

```text
PDF/Office/image
 -> MinerU/Docling 等 parser
 -> text + image + table + equation
 -> modality-specific caption/analysis
 -> 保留文档层级和相邻上下文
 -> 写入 LightRAG 图与向量存储
 -> text/VLM enhanced query
```

### 值得学习

- parsing 与 retrieval 分层；
- modal processor 插件化；
- 多模态元素不是单独附件，而是进入统一知识图；
- VLM query 可以把检索到的图片路径重新编码给视觉模型。

### 风险

- parser、OCR、VLM、LightRAG 的失败会叠加；
- 资产 URL、路径和缓存需要严格治理；
- 表格/公式 caption 可能损失原始精度；
- 多模态处理成本显著高于纯文本。

## 11. LlamaIndex

### 定位

LlamaIndex 是最广泛的通用数据/文档 Agent 框架之一。DeepTutor 使用它不是因为它自带教学逻辑，而是因为其摄取、索引、检索和 integration 生态成熟。

### 核心链

```text
Reader -> Document/Node
 -> IngestionPipeline transformations
 -> cache + dedup/docstore strategy
 -> index/vector store
 -> retriever
 -> query engine/response synthesizer
```

`IngestionPipeline` 支持：

- reader；
- transformations；
- cache；
- docstore；
- UPSERT、duplicate-only、upsert-and-delete；
- 同步、异步和多进程。

`VectorStoreIndex` 负责批量 embedding 和 vector store 写入，并根据 vector store 是否保存文本决定是否额外写 docstore。

### 代码组织

- `llama-index-core/`：稳定抽象；
- `llama-index-integrations/`：LLM、embedding、reader、vector store、retriever、agent 等大量适配包；
- `llama-dev/`：开发工具；
- `docs/`：示例与文档。

### 值得学习

- 核心与 integration 分包；
- Document/Node/Transform/Index/Retriever 的通用数据模型；
- cache 和 docstore 去重策略；
- storage context 与 provider 可替换性。

### 风险

- 生态巨大，初学者容易从 integration 迷路；
- 过度抽象可能隐藏成本和真实检索行为；
- 需要产品自己定义 citation、version、permission 和 learning semantics；
- 深读应聚焦 core 的一条最小链，而不是遍历全部 integration。

## 12. Microsoft GraphRAG

### 定位

GraphRAG 面向大语料的结构化理解。它先离线抽取实体关系、聚类社区并生成社区报告，再提供 local/global/DRIFT 等查询。

### 索引工作流

```text
load documents
 -> create text units
 -> extract graph / covariates
 -> summarize descriptions
 -> cluster graph
 -> create community reports
 -> generate embeddings
 -> write tables + state + stats
```

`run_pipeline()`：

- 创建 input/output storage、table provider 和 cache；
- 恢复 `context.json`；
- 标准或增量模式构建 run context；
- 依序执行 workflow；
- 每一步产出 result，并持久化 stats/state；
- 支持 update delta 与 previous output 合并。

### 查询方式

- local search：围绕实体、关系、文本单元构建局部上下文；
- global search：基于社区报告回答全局主题；
- DRIFT search：动态扩展社区和局部证据；
- basic search：更简化的上下文路径。

### 代码组织

项目拆成 `graphrag`、cache、chunking、common、input、llm、storage、vectors 等多个 package。核心 `graphrag` 内再次分 config、data model、index、query、prompt tune。

### 值得学习

- workflow 结果、state 和 stats 都是显式工件；
- 增量索引有独立 delta/previous 语义；
- local/global 是不同 context builder，不只是 prompt 参数；
- 大型 RAG 项目如何模块化 storage、LLM 和 table provider。

### 风险

- 索引流程重、LLM 调用多；
- community summary 会形成二级生成误差；
- 数据更新和图一致性比普通向量库复杂；
- 对小型教材可能收益不抵成本。

## 13. PageIndex

### 定位

PageIndex 的核心思想是：长文档本来就有章节结构，检索时可以让 Agent 在语义树上 reasoning，而不一定先把所有内容变成向量。

### PDF 建树

开源实现会：

- 检测目录；
- 提取并清洗目录；
- 将逻辑章节映射到 physical page；
- 检查标题是否真正出现；
- 对过大节点递归拆分；
- 生成 node summary、start/end index 和 node id。

Markdown 模式更直接：按 heading level 建树，并可合并太小节点。

### 查询思路

```text
问题
 -> 查看文档描述和树节点 summary
 -> 选择可能相关的节点
 -> 读取对应页/段
 -> 继续缩小或回答
```

这更像人查目录和翻页，而不是一次 top-k 相似度搜索。

### 值得学习

- 把文档层级作为一等索引；
- node summary 与原始 page range 同时保留；
- 适合法规、财报、教材和手册；
- 可与 Agent tool loop 自然结合。

### 风险

- 原文没有良好结构时，建树困难；
- TOC/title/page mapping 使用 LLM，可能产生错位；
- 开源包明确说明复杂 PDF 的高质量 OCR 在云服务中更强；
- 无向量不代表无成本，reasoning 轮次可能增加延迟。

## 14. Mem0

### 定位

Mem0 是通用 Agent memory，不包含教学策略，但能作为 DeepTutor 个性化记忆的工程对照。

### 初始化

`Memory` 通过 factory 组装：

- embedder；
- vector store；
- LLM；
- SQLite history；
- 可选 reranker；
- lazy entity store。

### Add pipeline

当前代码采用 phased batch pipeline：

1. 读取最近消息；
2. 语义检索已有 memories；
3. 将已有 memory 映射为短编号，减少模型伪造 UUID；
4. 一次 LLM 调用做 additive fact extraction；
5. 批量 embedding；
6. hash 去重；
7. 写 vector store、history 和 entity links。

README 将 2026 年新算法描述为 ADD-only：事实累积，不让 LLM 直接 UPDATE/DELETE 旧事实。

### Search pipeline

- 必须以 `user_id`、`agent_id` 或 `run_id` 限定 scope；
- semantic search 为基础；
- backend 支持时加入 BM25；
- entity match 提供额外信号；
- 可选 reranker；
- 支持高级 metadata filter。

### 值得学习

- 记忆 scope 是 API 硬约束；
- 事实抽取和检索分离；
- anti-hallucination ID mapping；
- entity link 与 vector memory 并存；
- vector store、embedder、LLM 和 reranker 工厂化。

### 与 DeepTutor 的差异

| DeepTutor | Mem0 |
|---|---|
| 文件可读、分层、引用链 | 数据库/向量 API 型 |
| 以学习 surface 和 profile 为中心 | 通用 user/agent/run memory |
| consolidation 生成 L2/L3 | additive facts + multi-signal retrieval |
| 人可直接编辑 Markdown | 通过 CRUD/API 管理 |
| 强调结论来源 | 强调可检索事实和规模 |

二者并非简单替代：DeepTutor 更适合“需要解释记忆为何成立”的学习者画像，Mem0 更适合通用 Agent 的低延迟事实召回。
