---
title: "9 个项目零基础上手卡"
sidebar:
  hidden: true
---
# 9 个项目零基础上手卡

## 使用方法

不要按仓库大小顺序扫代码。先选一个真实问题，再选一张卡：

1. 先用“类比”确认项目在整条视频链中的职责；
2. 按“主链”画出 3-8 个箭头；
3. 只打开列出的源码锚点；
4. 回答“取舍”；
5. 完成“第一项任务”后再继续展开。

证据等级：

- **E1**：固定提交源码和仓库文件；
- **E2**：本地命令真实运行；
- **未验证**：需要模型、GPU、账号、云服务或真实视频样本。

## 1. Director

- **类比**：电视台总导演不亲自存储和识别每段素材，而是把“搜索、剪辑、配音、
  生成”交给不同工位，再决定何时调用谁。
- **首个输入输出**：用户的视频任务与 session context → Agent 工具调用、进度事件和
  富媒体结果。
- **主链**：HTTP/WebSocket 请求 → handler → ReasoningEngine → Agent tool →
  VideoDB/外部服务 → session message → UI stream。
- **源码锚点**：
  `backend/director/handler.py`、
  `backend/director/core/reasoning.py`、
  `backend/director/core/session.py`、
  `backend/director/agents/base.py`、
  `backend/director/tools/videodb_tool.py`。
- **取舍**：编排层清楚、结果适合视频 UI；代价是核心数据面依赖 VideoDB，不能从
  仓库推出完整本地部署能力。
- **证据边界**：**E1**。未配置 VideoDB、模型和媒体服务。
- **第一项任务**：从 `handler.py` 追到一个 SearchAgent tool call，列出 session
  中保存了哪些状态、哪些实际在 VideoDB。

## 2. watch-skill

- **类比**：给 Agent 建一间本地录像证物室。每段语音、OCR、场景和帧都有编号与
  时间戳，后续问问题时先查目录，再回到证物。
- **首个输入输出**：本地/URL 视频 → scenes、segments、OCR、embedding、带时间戳
  回答上下文和验证产物。
- **主链**：acquire → probe/perceive/transcribe → SQLite index → FTS/vector
  retrieval → nearby frames → answer/loop。
- **源码锚点**：
  `src/watch_skill/watch.py`、
  `src/watch_skill/perceive/engine.py`、
  `src/watch_skill/index/db.py`、
  `src/watch_skill/index/retrieval.py`、
  `src/watch_skill/answer/engine.py`、
  `src/watch_skill/loop/runner.py`。
- **取舍**：本地优先、来源清楚、可重复提问；代价是本地模型、索引、FFmpeg 和
  多平台依赖管理较复杂。
- **证据边界**：**E1**；本轮 E2 复用了其“合成视频 + FFmpeg”的测试思想，但没有
  成功安装完整锁定依赖。离线缺 `scipy` / `rich`，测试未进入 collection。
- **第一项任务**：追踪 `ask_video()`，解释为什么 hybrid hit 之后仍要调用
  `frames_near()`。

## 3. VideoAgent

- **类比**：一个大型影视工具市场，先判断用户想“看懂、编辑还是生成”，再拼出一张
  工位流程图。
- **首个输入输出**：自然语言视频任务 → intent、Agent DAG、工具执行和媒体/文本产物。
- **主链**：intent filter → role/agent loading → tool discovery → DAG generation →
  validation → execution。
- **源码锚点**：
  `environment/agents/base.py`、
  `environment/agents/multi.py`、
  `environment/config/intents.yml`、
  `environment/roles/vid_qa/content_loader.py`、
  `tools/videorag/videoragcontent.py`。
- **取舍**：能力面广、工具动态注册有参考价值；代价是多个重型子项目并存，理解、
  编辑、生成的数据面并未完全统一。
- **证据边界**：**E1**。独立 VideoContentQA 主链主要依赖 Whisper 转录；视觉
  VideoRAG 不应被误写成所有 QA 的默认路径。
- **第一项任务**：比较 `vid_qa/content_loader.py` 与
  `videoragcontent.py`，列出文字 QA 和视觉素材检索分别消费什么输入。

## 4. DeepVideoDiscovery

- **类比**：研究员面对一部很长的监控录像，先看目录摘要，再搜索疑似片段，最后放大
  原始帧确认答案。
- **首个输入输出**：视频数据库、caption 和问题 → 多轮工具观察与最终答案。
- **主链**：global browse → clip search → frame inspect → observation →
  repeat/finish。
- **源码锚点**：
  `dvd/dvd_core.py`、
  `dvd/build_database.py`、
  `dvd/frame_caption.py`、
  `dvd/video_utils.py`。
- **取舍**：代码小、主动取证链直观；代价是需要 Azure/OpenAI endpoint，且主 loop
  的正确性高度依赖工具结果和 prompt 遵循。
- **证据边界**：**E1**。没有建立 caption database 或调用模型；静态代码还存在
  `single_run_wrapper` 参数不匹配等粗糙点。
- **第一项任务**：在 `_construct_messages()` 中找出“搜索后必须原帧确认”的约束，
  再说明 prompt 约束和 runtime 强制的差别。

## 5. OmAgent

- **类比**：先让助理把长视频切成场景卡片放进档案柜；复杂问题拆成任务树，缺细节时
  再把录像倒回指定时间段。
- **首个输入输出**：视频和问题 → scene memory、TaskTree、Rewinder observations
  与答案。
- **主链**：video preprocess → scene summaries → Milvus → DnC decomposition →
  retrieval → Rewinder → answer。
- **源码锚点**：
  `examples/video_understanding/run_cli.py`、
  `examples/video_understanding/agent/video_preprocessor/video_preprocess.py`、
  `examples/video_understanding/agent/video_qa/qa.py`、
  `examples/video_understanding/agent/tools/video_rewinder/rewinder.py`、
  `omagent-core/src/omagent_core/advanced_components/workflow/dnc/`。
- **取舍**：分治、记忆和回看组合完整；代价是 Milvus、模型端点、配置和整个框架都
  较重，单一评价流程未必需要全部引入。
- **证据边界**：**E1**。未启动 Milvus/Conductor 或视频 example。
- **第一项任务**：追踪 `Rewinder._run()`，解释 `number <= 10` 是什么预算门，以及
  `start_time == end_time` 为什么要特殊处理。

## 6. VidMentor

- **类比**：把一组课程录像整理成“课程目录 → 每节摘要 → 逐句字幕 → 练习题”的学习
  资料室。
- **首个输入输出**：课程视频目录 → ASR/OCR、知识层级、摘要、向量、搜索和题目。
- **主链**：video files → audio/visual extraction → LLM knowledge tree →
  embeddings → video-level retrieval → segment-level retrieval → UI。
- **源码锚点**：
  `build_database.py`、
  `backend/backend_audio.py`、
  `backend/backend_visual.py`、
  `backend/backend_llm.py`、
  `backend/backend_search.py`、
  `st_demo.py`。
- **取舍**：两级检索适合课程库；代价是固定模型路径和旧式脚本耦合明显，且无标准
  LICENSE，不能默认复制代码。
- **证据边界**：**E1**。未下载 checkpoint、未运行 GPU pipeline。
- **第一项任务**：从 `backend_search.py` 找出“先选视频、再选片段”的两个相似度
  阶段，说明它比把所有 transcript 一次检索多了什么假设。

## 7. proteomics_lab_agent

- **类比**：实验室督导拿着标准 protocol 对照操作录像，记录每一步是否漏做、做错、
  乱序，并生成实验记录。
- **首个输入输出**：protocol、背景资料、示例和实验视频 → lab note、错误分类和
  benchmark dataset。
- **主链**：query/path parse → GCS upload → protocol/examples/background parts →
  Gemini native video → lab note → structured benchmark conversion。
- **源码锚点**：
  `proteomics_lab_agent/agent.py`、
  `proteomics_lab_agent/sub_agents/video_analyzer_agent/`、
  `proteomics_lab_agent/sub_agents/protocol_generator_agent/`、
  `proteomics_lab_agent/sub_agents/lab_note_generator_agent/agent.py`、
  `eval/`。
- **取舍**：领域 protocol 和错误分类最接近实操评价；代价是视频上传 GCS，单次模型
  观察不易复用和审计，背景资料和示例会扩大上下文。
- **证据边界**：**E1**。未连接 GCS、Gemini、Confluence 或 MCP。
- **第一项任务**：读 `generate_lab_notes()`，把本地输入、云端上传、prompt parts、
  模型输出和 benchmark schema 分成五层，指出哪一层真正决定分数仍未被验证。

## 8. multimodal-rag-agent

- **类比**：一座三层视频图书馆：前台负责上传和播放，馆员负责对话和任务状态，地下
  资料室负责拆帧、检索和剪出命中片段。
- **首个输入输出**：上传视频和问题 → Pixeltable 派生数据、MCP tool result、
  LangGraph 回答和可播放 clip。
- **主链**：Next.js UI → FastAPI job → LangGraph → MCP tool → Pixeltable
  video/frame/audio/caption views → result/clip。
- **源码锚点**：
  `docker-compose.yml`、
  `multimodal-api/src/multimodal_api/agent/graph.py`、
  `multimodal-mcp/src/multimodal_mcp/video/ingestion/video_processor.py`、
  `multimodal-mcp/src/multimodal_mcp/video/search_video.py`、
  `multimodal-mcp/src/multimodal_mcp/video/clip_extractor.py`。
- **取舍**：应用分层和多模态表很完整；代价是运行依赖多，进程内任务状态不适合可靠
  长任务，多租户权限需要另做硬隔离。
- **证据边界**：**E1**。未启动 Compose、Pixeltable、Groq/OpenAI。
- **第一项任务**：追踪一次 search tool result 到 LangGraph final response，说明
  “检索到 frame caption”和“最终生成回答”不是同一层。

## 9. ReAgent-V

- **类比**：先按问题挑重点镜头，再让 OCR、ASR、物体检测等专家补充；初答后由三种
  性格的复核员挑战，最后由总评员选择答案。
- **首个输入输出**：视频、问题和模型 → key frames、modal info、initial answer、
  critical questions、eval report 和 reflective answer。
- **主链**：load frames → ECRS select → retrieve OCR/ASR/detection →
  multimodal prompt → initial answer → critical questions/eval →
  conservative/neutral/aggressive → meta answer。
- **源码锚点**：
  `ReAgent-V/ReAgentV.py`、
  `ReAgent-V/ReAgentV_utils/frame_selection_ecrs/ECRS_frame_selection.py`、
  `ReAgent-V/ReAgentV_utils/tools/tool_selection.py`、
  `ReAgent-V/ReAgentV_utils/tools/extract_modal_info.py`、
  `ReAgent-V/ReAgentV_utils/critical_question_generator/generate_critical_question.py`。
- **取舍**：把选帧、工具补证和反思放进同一研究框架；代价是 CUDA/路径假设重，
  多次自评仍共享模型偏差，自报 confidence 未经校准。
- **证据边界**：**E1**。未下载模型或运行 benchmark；当前仓无标准 LICENSE。
- **第一项任务**：在 `get_reflective_final_answer()` 画出三路答案到 meta agent 的
  数据流，再回答：三路都使用同一模型时，独立性来自哪里、又缺什么。

## 横向选择

| 你现在的问题 | 先读 |
|---|---|
| 想把视频能力包装成工具 | Director |
| 想做本地可追溯证据 | watch-skill |
| 想理解动态工具 DAG | VideoAgent |
| 想学长视频逐步取证 | DeepVideoDiscovery |
| 想学任务分治和回看 | OmAgent |
| 想做课程视频知识库 | VidMentor |
| 想做 protocol/rubric 评价 | proteomics_lab_agent |
| 想看完整 Web/API/MCP 分层 | multimodal-rag-agent |
| 想研究选帧、工具和反思 | ReAgent-V |

## 共通自测

1. 哪些项目把原始媒体留在本地，哪些依赖云端数据面？
2. 哪些项目明确在检索后回看原帧？
3. 哪些 confidence 是路由信号，哪些经过真实校准？
4. 如果输入视频被替换，哪个项目或本轮实验能检测证据身份变化？
5. 为什么“输出 JSON”不等于“评价可靠”？
