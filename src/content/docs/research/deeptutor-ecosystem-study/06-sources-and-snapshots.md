# 来源、fork 与源码快照

## 研究日期

- GitHub 与源码快照核验：2026-07-16
- 时间相关的 star、维护状态和默认分支只代表该日快照。

## 个人 fork 与本地路径

| 原仓库 | 个人 fork | 本地目录 | 关系 |
|---|---|---|---|
| HKUDS/DeepTutor | [estelledc/DeepTutor](https://github.com/estelledc/DeepTutor) | `projects/DeepTutor` | 主项目 |
| Open-TutorAi/open-tutor-ai-CE | [estelledc/open-tutor-ai-CE](https://github.com/estelledc/open-tutor-ai-CE) | `projects/open-tutor-ai-CE` | 完整教学平台 |
| GeminiLight/gen-mentor | [estelledc/gen-mentor](https://github.com/estelledc/gen-mentor) | `projects/gen-mentor` | 教学闭环 |
| plastic-labs/tutor-gpt | [estelledc/tutor-gpt](https://github.com/estelledc/tutor-gpt) | `projects/tutor-gpt` | Theory-of-Mind |
| HKUDS/nanobot | [estelledc/nanobot](https://github.com/estelledc/nanobot) | `projects/nanobot` | Agent runtime |
| HKUDS/AutoAgent | [estelledc/AutoAgent](https://github.com/estelledc/AutoAgent) | `projects/AutoAgent` | Agent 生成 |
| HKUDS/AI-Researcher | [estelledc/AI-Researcher](https://github.com/estelledc/AI-Researcher) | `projects/AI-Researcher` | Research pipeline |
| Wing900/ManimCat | [estelledc/ManimCat](https://github.com/estelledc/ManimCat) | `projects/ManimCat` | 数学动画 |
| run-llama/llama_index | [estelledc/llama_index](https://github.com/estelledc/llama_index) | `projects/llama_index` | 通用 RAG |
| HKUDS/LightRAG | [estelledc/LightRAG](https://github.com/estelledc/LightRAG) | `projects/LightRAG` | 轻量 Graph RAG |
| HKUDS/RAG-Anything | [estelledc/RAG-Anything](https://github.com/estelledc/RAG-Anything) | `projects/RAG-Anything` | 多模态 RAG |
| microsoft/graphrag | [estelledc/graphrag](https://github.com/estelledc/graphrag) | `projects/graphrag` | 重型 Graph RAG |
| VectifyAI/PageIndex | [estelledc/PageIndex](https://github.com/estelledc/PageIndex) | `projects/PageIndex` | 树检索 |
| mem0ai/mem0 | [estelledc/mem0](https://github.com/estelledc/mem0) | `projects/mem0` | Agent memory |

## 本地 commit 快照

| 项目 | commit |
|---|---|
| DeepTutor | `3e3b9a6ecbfe` |
| open-tutor-ai-CE | `196c547291da` |
| gen-mentor | `9b3eadea2c43` |
| tutor-gpt | `5c2f92416c04` |
| nanobot | `6519737860a4` |
| AutoAgent | `16c12b052ef2` |
| LightRAG | `a0f09c7bc740` |
| RAG-Anything | `a8c27f7dbed6` |
| llama_index | `dbdaf89dc66a` |
| graphrag | `dac4f721ddc1` |
| PageIndex | `c58cd62b5086` |
| mem0 | `5b4478458bef` |
| AI-Researcher | `f9a6f8480860` |
| ManimCat | `f5b74008ddd0` |

## 主要论文与基准

- [DeepTutor: Towards Agentic Personalized Tutoring](https://arxiv.org/abs/2604.26962)
- [Open TutorAI: An Open-source Platform for Personalized Education](https://arxiv.org/abs/2602.07176)
- [LLM-powered Multi-agent Framework for Goal-oriented Learning in Intelligent Tutoring System](https://arxiv.org/abs/2501.15749)
- [MathTutorBench](https://arxiv.org/abs/2502.18940)
- [TutorBench](https://arxiv.org/abs/2510.02663)
- [Are Agents Ready to Teach?](https://arxiv.org/abs/2605.14322)

## 重点源码证据

### DeepTutor

- `deeptutor/services/session/turn_runtime.py`
- `deeptutor/core/context.py`
- `deeptutor/runtime/orchestrator.py`
- `deeptutor/agents/chat/agentic_pipeline.py`
- `deeptutor/services/memory/`
- `deeptutor/knowledge/`

### 完整教学系统

- Open TutorAI：`gateway/http/app.py`、`ai/`、`learning/`、`data/repositories/`
- GenMentor：`backend/main.py`、`backend/modules/`
- Tutor-GPT：`utils/ai/index.ts`、`utils/ai/prompts.ts`、`utils/honcho.ts`

### Agent 与能力

- nanobot：`nanobot/agent/loop.py`、`runner.py`、`context.py`
- AutoAgent：`autoagent/core.py`、`autoagent/flow/`、`autoagent/agents/meta_agent/`
- AI-Researcher：`research_agent/run_infer_plan.py`、`run_infer_idea.py`、`research_agent/inno/core.py`、`research_agent/inno/agents/`、`paper_agent/`
- ManimCat：`src/queues/processors/video.processor.ts`、`video-processor-flows-static.ts`、`src/services/concept-designer/`、`static-guard/`、`code-retry/`、`src/studio-agent/`

### RAG 与 Memory

- LlamaIndex：`llama-index-core/llama_index/core/ingestion/pipeline.py`
- LlamaIndex：`llama-index-core/llama_index/core/indices/vector_store/base.py`
- LightRAG：`lightrag/lightrag.py`、`lightrag/pipeline.py`、`lightrag/operate.py`
- RAG-Anything：`raganything/raganything.py`、`processor.py`、`query.py`
- GraphRAG：`packages/graphrag/graphrag/index/`、`query/`
- PageIndex：`pageindex/page_index.py`、`page_index_md.py`、`retrieve.py`
- Mem0：`mem0/memory/main.py`

## 可证明与暂不可证明

### 已由当前源码证明

- 项目目录和核心抽象真实存在；
- fork、clone、origin/upstream 和 commit 可核验；
- DeepTutor 的 TurnRuntime -> UnifiedContext -> Orchestrator 主链；
- 各 RAG 项目的摄取/检索代码组织；
- GenMentor learner profile 与 skill gap 的 schema/Agent；
- Tutor-GPT 的 Empath/Honcho/PDF/Tutor 两阶段链；
- nanobot 的显式 turn state machine；
- Mem0 的 scoped add/search 与 phased memory pipeline。
- AI-Researcher 的两条 `InnoFlow` 主链、Agent/Tool 阶段缓存和实现—评审—实验改进循环；
- ManimCat 的 Workflow/Agent 双模式、静态检查、真实渲染反馈和 Studio 状态模型。

### 不能仅靠本轮静态阅读证明

- 每个项目的 README 性能数字是否可在本机完整复现；
- 不同 RAG 引擎在同一教材上的真实质量和成本；
- 长期 learner profile 是否稳定提高学习效果；
- 论文 benchmark 是否能代表真实用户；
- 所有 optional provider、数据库、OCR 和多模态组合都能正常运行；
- DeepTutor 全部功能在当前机器上端到端部署无误。

这些应在后续专题中通过最小可复现实验验证，不能用架构分析代替。
