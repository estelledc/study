---
title: "零基础项目上手卡：14 个项目从哪里读起"
sidebar:
  hidden: true
---
# 零基础项目上手卡：14 个项目从哪里读起

> 本页补齐生活类比、首个输入输出、源码锚点、证据等级和第一项练习。
>
> 完整机制与取舍见[逐项目深度分析](03-project-deep-dives.md)，版本见
> [来源与源码快照](06-sources-and-snapshots.md)。

## 使用方法

1. 先判断要学的是教学系统、Agent runtime、RAG、memory 还是表达生成。
2. 复述主链后，只打开本页列出的 2-5 个锚点。
3. 完成第一项任务，再决定是否安装依赖或做 E2。
4. 除 DeepTutor 定向测试外，本页都是 E1，不把静态源码写成运行验证。

## 完整教学系统

### 1. DeepTutor

- **类比与输入输出**：一个把教材、学习档案、练习和多种学习工具放在同一桌面的个人学习工作区；输入 turn，输出 stream、artifact、message、memory 和 mastery state。
- **主链**：入口 → TurnRuntime → UnifiedContext → Orchestrator → Capability/AgentLoop → StreamBus → 持久化。
- **源码锚点**：`deeptutor/services/session/turn_runtime.py`、`deeptutor/core/context.py`、`deeptutor/runtime/orchestrator.py`、`deeptutor/learning/mastery.py`、`deeptutor/learning/policy.py`。
- **关键取舍**：统一运行时让多个 surface 共享状态和权限，代价是状态交叉与回归面更大。
- **证据与第一项任务**：**E2-limited**，138 项定向测试通过；画出一次 turn 和一次 mastery update 的两条链，说明它们为何不能合并为一个“完成”状态。

### 2. Open TutorAI Community Edition

- **类比与输入输出**：面向学校的教学后台，把账户、课堂、课程、模型和 RAG 组织成业务域；输入 API/课堂操作，输出业务记录、会话和学习支持。
- **主链**：HTTP gateway → domain service → repository → database/vector/provider adapter。
- **源码锚点**：`gateway/http/app.py`、`ai/llm/service.py`、`learning/sessions/service.py`、`learning/supports/service.py`、`data/repositories/base.py`。
- **关键取舍**：Clean Architecture 便于替换 provider 和存储，代价是教学智能容易被平台 CRUD 面掩盖。
- **证据与第一项任务**：**E1**；从 `app.py` 追一个 learning route 到 repository，区分 Current Architecture 与 README 中的 Target Agentic Flow。

### 3. GenMentor

- **类比与输入输出**：课程顾问先问目标、查技能差距、建档，再排课和出题；输入 learning goal/profile，输出 gap、path、content、quiz 和 profile update。
- **主链**：goal refine → required skills → gap → learner profile → path → content → quiz/chat → profile update。
- **源码锚点**：`backend/main.py`、`backend/base/base_agent.py`、`backend/modules/skill_gap_identification/agents/skill_gap_identifier.py`、`backend/modules/adaptive_learner_modeling/agents/adaptive_learning_profiler.py`、`backend/modules/personalized_resource_delivery/agents/learning_path_scheduler.py`。
- **关键取舍**：领域对象和 Pydantic schema 清楚，代价是编排集中在 endpoint，画像来源链较弱。
- **证据与第一项任务**：**E1**；比较 skill gap 与 learner profile 的输入 schema，找出哪些字段是用户事实、哪些只是模型推断。

### 4. Tutor-GPT

- **类比与输入输出**：Tutor 回答前先请 Empath 判断“需要了解学生什么”，再查心理表示和 PDF；输入消息/历史，输出 thought context 与 Tutor response。
- **主链**：Empath prompt → Honcho/PDF query → 并行取 context → Bloom response prompt → stream → 保存。
- **源码锚点**：`app/api/chat/route.ts`、`utils/ai/index.ts`、`utils/ai/prompts.ts`、`utils/honcho.ts`、`utils/prompts/response.ts`。
- **关键取舍**：个性化信息查询与回答分开，代价是依赖外部 Honcho，长 prompt 和分隔符协议难测试。
- **证据与第一项任务**：**E1**；在 `utils/ai/index.ts` 标出 thought、Honcho、PDF 和 response 四类数据，列出每类隐私/可信度边界。

## Agent Runtime 与专业能力

### 5. nanobot

- **类比与输入输出**：一个小而明确的快递分拣中心，每个 turn 都经过固定工位；输入 channel message，输出 tool trace、reply 和 session state。
- **主链**：RESTORE → COMPACT → COMMAND → BUILD → RUN → SAVE → RESPOND → DONE。
- **源码锚点**：`nanobot/agent/loop.py`、`nanobot/agent/runner.py`、`nanobot/agent/context.py`、`nanobot/bus/queue.py`、`nanobot/session/manager.py`。
- **关键取舍**：显式状态机易测试和恢复，代价是教学 policy 仍需上层业务补充。
- **证据与第一项任务**：**E1**；画出哪个状态可以安全重试，哪个状态可能已经产生外部副作用。

### 6. AutoAgent

- **类比与输入输出**：一个会按需求招聘角色、制作工具并排工作流的自动化工厂；输入自然语言任务，输出 Agent/tool/workflow 定义和执行结果。
- **主链**：form generation → Agent/tool creation → MetaChain tool call → Agent handoff → event-flow scheduling。
- **源码锚点**：`autoagent/core.py`、`autoagent/agents/meta_agent/agent_former.py`、`autoagent/agents/meta_agent/agent_creator.py`、`autoagent/agents/meta_agent/workflow_former.py`、`autoagent/flow/core.py`。
- **关键取舍**：动态生成扩展快，代价是生成代码、工具权限和验证面显著扩大。
- **证据与第一项任务**：**E1**；追踪 tool result 返回另一个 Agent 时控制权如何转移，并写出教学场景必须增加的三个 gate。

### 7. AI-Researcher

- **类比与输入输出**：给研究员浏览器、Docker、代码库和论文写作台；输入论文/idea，输出计划、代码、实验、judge 结果和论文。
- **主链**：survey/idea → plan → code/experiment → judge → refinement → paper。
- **源码锚点**：`research_agent/run_infer_plan.py`、`research_agent/run_infer_idea.py`、`research_agent/inno/core.py`、`research_agent/inno/workflow/flowgraph.py`、`paper_agent/writing.py`。
- **关键取舍**：工具和研究阶段完整，代价是开放环境、成本和科学有效性都需要额外治理。
- **证据与第一项任务**：**E1**；比较 plan 与 idea 两个入口，标出首次执行真实代码和首次作科学判断的位置。

### 8. ManimCat

- **类比与输入输出**：动画制作车间先写分镜和代码，再真实渲染，失败就按 stderr 返工；输入数学说明，输出代码、视频、图片和运行历史。
- **主链**：scene design → code generation → static guard → Manim render → error patch/rerender；Studio 另有长期 run/task/work 链。
- **源码锚点**：`src/queues/processors/video.processor.ts`、`src/services/concept-designer/scene-design-stage.ts`、`src/services/static-guard/checker.ts`、`src/services/code-retry/manager.ts`、`src/studio-agent/runtime/execution/run-processor.ts`。
- **关键取舍**：真实执行反馈强于模型自评，代价是 sandbox、LaTeX/字体和视觉/数学正确性仍需专门 gate。
- **证据与第一项任务**：**E1**；把 static check、render failure、queue retry 和 Agent retry 分成四类，说明它们为何不能共用一个计数器。

## RAG 与 Memory

### 9. LlamaIndex

- **类比与输入输出**：通用图书馆流水线，把多种材料统一成卡片，再建索引、检索和撰写回答；输入 documents，输出 nodes、index、retrieval context 和 response。
- **主链**：Reader → Document/Node → IngestionPipeline → index/vector store → retriever → response synthesizer。
- **源码锚点**：`llama-index-core/llama_index/core/ingestion/pipeline.py`、`llama-index-core/llama_index/core/indices/vector_store/base.py`、`llama-index-core/llama_index/core/retrievers/`、`llama-index-core/llama_index/core/response_synthesizers/base.py`。
- **关键取舍**：核心与 integration 分包便于组合，代价是抽象和生态规模会隐藏真实检索行为。
- **证据与第一项任务**：**E1**；只追一份 Document 如何成为 Node 并进入 VectorStoreIndex，不浏览全部 integrations。

### 10. LightRAG

- **类比与输入输出**：一边建人物关系图、一边保留相似度索引的资料管理员；输入文档，输出 chunk、entity/relation graph、vectors 和 query context。
- **主链**：enqueue/status → chunk → entity/relation extraction → graph merge → vector upsert → local/global/hybrid query。
- **源码锚点**：`lightrag/lightrag.py`、`lightrag/pipeline.py`、`lightrag/operate.py`、`lightrag/kg/shared_storage.py`。
- **关键取舍**：关系问题更有结构，代价是 LLM 建图、图/向量一致性和并发状态更复杂。
- **证据与第一项任务**：**E1 refresh**；比较 processing owner 与 delete owner 死亡后的恢复策略，解释 `recovery_required` fence。

### 11. RAG-Anything

- **类比与输入输出**：把 PDF 中正文、图、表和公式分别交给专业读者，再放回同一知识图；输入复杂文档，输出多模态元素、caption/context 和 LightRAG 索引。
- **主链**：parse → modal processors → adjacent context → LightRAG insert → text/VLM query。
- **源码锚点**：`raganything/raganything.py`、`raganything/processor.py`、`raganything/modalprocessors.py`、`raganything/query.py`、`raganything/batch.py`。
- **关键取舍**：统一跨模态检索，代价是 parser、OCR、VLM 和 RAG 的误差与成本叠加。
- **证据与第一项任务**：**E1**；追踪一张表从 parser result 到 graph insert，列出原始单元格丢失后无法由 caption 恢复的信息。

### 12. Microsoft GraphRAG

- **类比与输入输出**：先对整座图书馆做人物/主题关系普查和社区报告，再回答局部或全局问题；输入语料，输出 graph tables、community reports、embeddings、state 和 query context。
- **主链**：documents → text units → graph/covariates → descriptions → communities/reports → embeddings → local/global/DRIFT。
- **源码锚点**：`packages/graphrag/graphrag/index/run/run_pipeline.py`、`packages/graphrag/graphrag/index/typing/state.py`、`packages/graphrag/graphrag/index/operations/extract_graph/extract_graph.py`、`packages/graphrag/graphrag/index/operations/summarize_communities/summarize_communities.py`、`packages/graphrag/graphrag/query/`。
- **关键取舍**：大语料全局结构强，代价是索引重、更新慢，community summary 增加二级生成误差。
- **证据与第一项任务**：**E1**；比较 local 与 global context builder 的输入，说明它们不是同一检索器换 prompt。

### 13. PageIndex

- **类比与输入输出**：像人先看目录，再翻到对应页，而不是把每一段都先做向量；输入 PDF/Markdown，输出语义树、页范围、summary 和 retrieval path。
- **主链**：TOC detect/extract → title/page mapping → recursive split → node summary → tree reasoning retrieval。
- **源码锚点**：`pageindex/page_index.py`、`pageindex/page_index_md.py`、`pageindex/retrieve.py`、`run_pageindex.py`。
- **关键取舍**：保留章节结构且可解释，代价是 TOC、页码和 summary 都可能受文档质量与 LLM 误差影响。
- **证据与第一项任务**：**E1 refresh**；阅读新增 physical-index admission，解释为何文档文本和 LLM 返回页码都必须视为不可信输入。

### 14. Mem0

- **类比与输入输出**：一个按 user/agent/run 分柜、会抽取事实并按相关性找回的记忆档案室；输入 messages，输出 scoped facts、entity links、history 和 ranked retrieval。
- **主链**：recent context → existing memory search → fact extraction → embedding/dedup → vector/history/entity write → scoped search/rerank。
- **源码锚点**：`mem0/memory/main.py`、`mem0/memory/storage.py`、`mem0/utils/entity_extraction.py`、`mem0/configs/vector_stores/`、`tests/memory/test_main.py`。
- **关键取舍**：低延迟、可插拔存储适合通用事实召回，代价是来源解释、冲突、时效和归因必须额外治理。
- **证据与第一项任务**：**E1 refresh**；对比“抽取为空”“LLMError”“已过期”“scope 不匹配”四种无结果，说明调用方应如何分诊。

## 项目级完成检查

读完一个项目后，至少能回答：

1. 它负责教学闭环的哪一层，明确不负责什么？
2. 输入、稳定状态、外部副作用和输出分别是什么？
3. 主控制流跨过哪些源码锚点？
4. 一个设计选择解决了什么问题，又引入什么成本？
5. 当前结论是 E0、E1 还是 E2，哪些教学效果仍未证明？
6. 第一次动手应该做静态 trace、确定性测试还是完整运行？

答不出第 4-5 题，说明还停留在功能列表，没有形成可复用理解。
