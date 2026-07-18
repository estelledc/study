---
title: "逐项目深度分析"
sidebar:
  hidden: true
---
# 逐项目深度分析

## 阅读说明

每个项目按相同口径展开：

1. 一句话定位；
2. 主数据流；
3. 核心模块和代码组织；
4. 技术实现；
5. 优点、限制和工程成熟度；
6. 对全智评的可借鉴点；
7. 后续思考问题。

源码路径均相对于仓库根目录，固定 commit 见 [来源与快照](06-sources-and-snapshots.md)。

---

## 1. Director

### 1.1 定位

Director 是建立在 VideoDB 云服务上的通用视频 Agent 框架。它的重点不是训练视频模型，而是把上传、索引、搜索、剪辑、字幕、配音和生成等操作包装成 LLM 可调用的工具。

### 1.2 主数据流

```text
Socket.IO chat 消息
  -> ChatHandler 创建/恢复 Session
  -> 注册 20+ BaseAgent
  -> ReasoningEngine 将 Agent 转成 function schema
  -> LLM 选择一个或多个 Agent
  -> Agent 调 VideoDB 或第三方生成 API
  -> OutputMessage 实时 push_update
  -> SQLite/PostgreSQL 保存会话和上下文
```

核心证据：

- `projects/Director/backend/director/handler.py:43-124`
- `projects/Director/backend/director/core/reasoning.py:83-342`
- `projects/Director/backend/director/core/session.py:174-243`

### 1.3 代码组织

| 路径 | 职责 |
|---|---|
| `backend/director/agents/` | 每个视频能力一个 Agent |
| `backend/director/core/reasoning.py` | LLM 工具循环和最终汇总 |
| `backend/director/core/session.py` | 消息、内容类型、会话和 WebSocket 输出 |
| `backend/director/tools/` | VideoDB、Slack、ElevenLabs、Replicate 等适配 |
| `backend/director/llm/` | OpenAI、Anthropic、Google 等模型适配 |
| `backend/director/db/` | SQLite/PostgreSQL 会话持久化 |
| `backend/director/entrypoint/api/` | Flask REST 与 Socket.IO |
| `frontend/` | Vue 3 + Vite 聊天界面 |

### 1.4 Agent 插件模型

`BaseAgent` 约束很小：

- `agent_name`；
- `description`；
- `run()`；
- `AgentResponse`。

函数参数可从 `run()` 签名和 docstring 自动生成 JSON Schema。新增 Agent 的成本低，但注册仍是中心化的：必须在 `ChatHandler.agents` 手工加入类。

对应代码：

- `projects/Director/backend/director/agents/base.py:26-80`
- `projects/Director/backend/director/handler.py:47-74`

### 1.5 推理循环

ReasoningEngine 的行为：

1. 将视频或集合元数据放入系统上下文；
2. 把所有 Agent schema 交给 LLM；
3. 执行返回的 tool calls；
4. 将 AgentResponse 作为 tool message 回填；
5. 最多循环 10 次；
6. 再调用一次 LLM 汇总本轮动作。

这是典型的“LLM 负责计划，确定性工具负责执行”。它没有显式 DAG、任务状态机或独立 verifier，流程正确性主要依赖模型和每个 Agent 的异常处理。

### 1.6 视频能力

Director 自己不实现底层视频索引。`VideoDBTool` 委托云服务：

- spoken-word 和 scene 索引；
- semantic/keyword search；
- 片段 compilation；
- stream、subtitle、dub、timeline；
- 图片、音乐、语音和视频生成。

`SearchAgent` 的产物比普通 RAG 更适合视频 UI：

- 按视频分组的命中；
- 每个 shot 的开始、结束和分数；
- 命中片段合成视频；
- 搜索结果摘要。

对应代码：

- `projects/Director/backend/director/agents/search.py:63-272`
- `projects/Director/backend/director/tools/videodb_tool.py:253-343`

### 1.7 技术栈

- 后端：Python、Flask、Flask-SocketIO、Pydantic；
- 前端：Vue 3、Vite、Tailwind；
- 视频基础设施：VideoDB；
- 模型：OpenAI 兼容接口及多个 provider；
- 数据库：SQLite 或 PostgreSQL；
- 部署：Docker Compose、Render、Railway。

### 1.8 优点

- Agent 接口很直观，适合快速添加媒体能力。
- tool call、实时进度、富内容输出和会话持久化贯通。
- 搜索结果不仅是文本，还能生成可播放 compilation。
- 将视频基础设施与 Agent 编排分离。

### 1.9 限制

- 核心视频能力依赖 VideoDB 云服务，无法从仓库独立部署完整数据面。
- 推理循环缺少显式计划验证、预算和可恢复状态。
- 当前仓库没有独立测试文件。
- 视频摘要 Agent 主要读取 transcript；视觉理解依赖 scene index/search。
- 代码里仍可见边界问题，例如 `SummarizeVideoAgent` 的错误分支引用不存在的 `MsgStatus.failed`。

### 1.10 对全智评的借鉴

适合借鉴：

- 将“抽帧、索引、评价、导出、人工复核”封装成稳定工具接口；
- 使用统一富内容 schema 表示文字、帧、视频片段和进度；
- 让调试或复核页直接播放证据 compilation。

不适合照搬：

- 把评分主链交给开放式 LLM 工具循环；
- 将核心证据和索引完全绑定单一云服务。

### 1.11 思考点

1. 全智评的 evaluator 是领域确定性主链，哪些辅助操作适合 Agent 化？
2. 如果 Agent 可触发重新评价，怎样防止重复扣 Token 或产生并发评分？
3. 搜索命中片段 compilation 是否比散帧更适合教师复核？

---

## 2. watch-skill

### 2.1 定位

watch-skill 是给 Agent 使用的本地优先视频证据层。它把视频变成持久、可检索、可引用的时间戳证据，并提供“捕获—批评—修复—再验证”的视觉闭环。

### 2.2 主数据流

```text
source
  -> acquire
  -> scene-aware perceive + phash dedup + OCR
  -> captions / local Whisper / opt-in cloud STT
  -> SQLite FTS5 + embeddings
  -> retrieve + confidence
  -> local escalation
  -> optional vision verification
  -> answer with timestamps or honest floor
```

关键入口：

- `projects/watch-skill/src/watch_skill/watch.py`
- `projects/watch-skill/src/watch_skill/index/store.py`
- `projects/watch-skill/src/watch_skill/answer/engine.py`

### 2.3 代码组织

| 路径 | 职责 |
|---|---|
| `acquire/` | URL、本地文件、流和下载缓存 |
| `perceive/` | 场景、帧预算、感知哈希去重、OCR |
| `transcribe/` | 字幕、本地 Whisper、云 STT 阶梯 |
| `index/` | SQLite schema、FTS5、向量和检索 |
| `answer/` | 置信度、升级、视觉验证、答案缓存 |
| `library/` | 跨视频笔记和综合 |
| `lessons/` | 错误校正、适应策略、eval |
| `loop/` | 捕获、批评、迭代、差异和证明产物 |
| `surfaces/` | MCP、CLI、REST 薄接口 |
| `integrations/` | LangChain、CrewAI、LlamaIndex 等适配 |
| `tests/` | 与核心模块近似镜像的测试树 |

### 2.4 感知策略

`perceive()` 不是简单固定 fps：

1. 检测场景；
2. 取场景起点和中点；
3. 数量不足时均匀补帧；
4. 合并用户指定 cue timestamps；
5. 用感知哈希删除近重复帧；
6. 对保留帧执行 OCR。

聚焦时间窗会使用更密预算，且 cue 帧不会被去重掉。

对应代码：

- `projects/watch-skill/src/watch_skill/perceive/engine.py:22-200`

### 2.5 转录降级链

顺序固定为：

```text
原语言字幕
  -> 本地 faster-whisper
  -> 用户显式允许的云 STT
  -> 空 transcript，继续帧分析
```

这是一种“局部失败不沉没整个任务”的设计。对全智评而言，这种降级需要结合模板：语音优先步骤在无 ASR 时不能正常给高置信结果。

### 2.6 持久证据索引

SQLite schema 保存：

- `videos`；
- `segments`；
- `scenes`；
- `ocr_blocks`；
- `embeddings`；
- FTS5；
- semantic answer cache；
- cross-video notes。

写入时同时建立全文索引和向量。向量模型名固定在 index meta 中，避免旧向量和新模型混用。

检索采用：

```text
0.45 * FTS5 BM25 + 0.55 * cosine
```

并将命中映射回时间戳和附近帧。

对应代码：

- `projects/watch-skill/src/watch_skill/index/db.py:125-253`
- `projects/watch-skill/src/watch_skill/index/store.py:35-193`
- `projects/watch-skill/src/watch_skill/index/retrieval.py:143-266`

### 2.7 自愈回答

`answer_question()` 的核心价值不是“再调用一次 VLM”，而是分层升级：

1. 混合检索；
2. 用 top hit、margin、证据一致性和 lexical anchor 估计置信度；
3. 低置信时先用本地 CPU 密集重采样；
4. 再放大 OCR 区域；
5. 仍不确定才把准确证据帧交给视觉模型；
6. 模型否定时覆盖检索高分；
7. 低于 floor 时明确拒绝猜测。

模型生成的时间戳还会与合法证据列表比对，无法凭空新增引用。

对应代码：

- `projects/watch-skill/src/watch_skill/answer/engine.py:201-397`

### 2.8 THE LOOP

Loop 不自动改代码，而是：

```text
capture
  -> perceive
  -> structured critic
  -> 调用 Agent 根据 issue 修复
  -> loop_iterate
  -> phash diff
  -> pass / max_iterations / no_progress
```

关键状态持久化在 `state.json`，每轮保留录像、帧、critique 和 diff。通过后生成 before/after MP4 和 GIF。

对应代码：

- `projects/watch-skill/src/watch_skill/loop/runner.py:31-293`
- `projects/watch-skill/src/watch_skill/loop/critic.py:21-331`

### 2.9 技术栈

- Python 3.11+、Pydantic、Typer；
- ffmpeg、yt-dlp、PySceneDetect、RapidOCR、faster-whisper；
- SQLite FTS5、FastEmbed、NumPy；
- FastMCP、FastAPI；
- Playwright；
- 多个视觉 provider 与 Ollama。

### 2.10 优点

- 核心与 MCP/CLI/REST 界面分离清晰。
- 本地优先、隐私和成本策略明确。
- 对低置信、无证据和模型拒绝有显式语义。
- 错误校正可进入 lessons 和 replayable eval。
- 测试结构完整，工程决策有记录。

### 2.11 限制

- 置信度是检索问答校准，不等同于步骤评分准确率。
- 通用 OCR/ASR/场景描述不包含全智评领域 rubric。
- SQLite/本地文件适合个人 Agent，不直接适合多租户 SaaS。
- Loop 的 pass criteria 主要由视觉 critic 解释，领域安全评价仍需更强规则。
- 仓库创建时间很近，长期维护稳定性尚未观察。

### 2.12 对全智评的借鉴

优先级较高：

1. 场景帧 + 均匀帧的混合预算；
2. 可回到原时间轴的持久证据索引；
3. 低置信时先确定性补证，再调用模型；
4. 非法时间戳清洗；
5. 教师纠错 -> lesson -> replay eval；
6. `no_progress` 等有界停止条件。

### 2.13 思考点

1. 全智评应按“作业”还是按“模板步骤”建立证据索引？
2. 教师校正应该改变检索、提示、后处理规则，还是只形成 eval？
3. 如何用步骤级 TP/FP/FN 校准置信度，而不是复用问答置信度？

---

## 3. VideoAgent

### 3.1 定位

VideoAgent 试图把视频理解、剪辑和生成统一到一个多模态 Agent 工具箱。核心思路是自动发现工具、先做意图过滤，再生成和验证 Agent DAG。

### 3.2 主编排链

```text
用户需求
  -> LLM 选择 intents
  -> intents.yml 缩小工具集合
  -> LLM 生成 Agent Graph / Agent Chain / User Input Graph
  -> 第二轮 LLM judge + reflection
  -> 按 chain 顺序执行 BaseTool
  -> 输出通过 context 传给下游工具
```

对应代码：

- `projects/VideoAgent/environment/agents/multi.py:19-463`
- `projects/VideoAgent/environment/config/intents.yml`

### 3.3 工具注册

`FunctionRegistry.auto_register()` 递归导入 `environment/roles`，发现所有 `BaseTool` 子类，并从 Pydantic InputSchema/OutputSchema 生成元数据。

优点是新增工具无需改中心列表；风险是启动时导入整个工具树，重型或缺失依赖可能导致发现失败。

对应代码：

- `projects/VideoAgent/environment/agents/base.py:23-130`

### 3.4 视频理解真实边界

当前 `VideoContentQA`：

- 遍历目录中视频；
- 用本地 Whisper large-v3-turbo 转录；
- 拼接 transcript；
- 截断到 50,000 字符；
- 让 GPT 严格基于 transcript 回答。

因此，这条独立 QA 主链是“视频转录问答”，不是画面+语音联合问答。

视觉 VideoRAG 位于编辑素材链：

1. 每 10 秒切片；
2. 每段 Whisper；
3. 抽数帧交给 Gemini 描述；
4. ImageBind 编码片段；
5. NanoVectorDB 检索素材。

对应代码：

- `projects/VideoAgent/environment/roles/vid_qa/content_loader.py`
- `projects/VideoAgent/tools/videorag/videoragcontent.py:91-206`

### 3.5 技术栈

- Python、Pydantic、OpenAI-compatible API；
- Whisper、ImageBind、NanoVectorDB；
- CosyVoice、Fish Speech、Seed-VC、DiffSinger；
- MoviePy、ffmpeg、FunASR；
- 大量 GPU 依赖和内嵌第三方工具代码。

### 3.6 优点

- 动态工具发现和 schema 生成清楚。
- 意图先过滤工具，减少把全部能力塞给模型。
- 对 Agent Graph 做 judge/reflection，而非直接执行第一次计划。
- 理解、编辑、TTS、SVC 和生成覆盖面广。

### 3.7 限制

- 主仓 851 个文件，大量代码来自内嵌生成/语音项目，安装面很重。
- 固定模型路径、工作目录和 GPU 假设较多。
- 独立项目测试文件为 0；第三方子树中的 `test_*` 多是训练框架方法，不是仓库回归测试。
- 编排图的验证仍是同类 LLM 自评，没有确定性类型检查和运行前资源检查。
- 视频理解和视频编辑的感知链没有完全统一。

### 3.8 对全智评的借鉴

适合：

- 评价前按模板/媒体类型缩小工具集合；
- 用 schema 校验 Agent 计划的输入输出；
- 将“可行性检查”放在执行之前。

不适合：

- 把整个评分管线改成运行时生成 DAG；
- 复制内嵌模型和工具仓；
- 用第二个 LLM judge 代替确定性约束。

### 3.9 思考点

1. 全智评的策略路由能否升级为类型化 plan，而不是自然语言 Agent Graph？
2. 哪些工具应该按模板动态启用：OCR、ASR、刻度识别、对象检测？
3. 如何让计划验证检查数据形态、成本和权限，而不仅是语义合理性？

---

## 4. DeepVideoDiscovery

### 4.1 定位

DeepVideoDiscovery（DVD）是面向超长视频的 deep-research 式问答 Agent。代码规模很小，核心是一个 ReAct 循环和三个多粒度工具。

### 4.2 预处理链

完整版：

```text
下载/读取视频
  -> 2 fps 解码
  -> 每 10 秒组成 clip
  -> VLM 基于帧 + transcript 生成 clip_description
  -> 合并 subject registry
  -> text-embedding-3-large
  -> NanoVectorDB
```

Lite mode：

```text
下载 SRT
  -> 每个字幕时间段变成 caption
  -> 建向量库
```

对应代码：

- `projects/DeepVideoDiscovery/dvd/video_utils.py`
- `projects/DeepVideoDiscovery/dvd/frame_caption.py`
- `projects/DeepVideoDiscovery/dvd/build_database.py`

### 4.3 三个观察工具

| 工具 | 粒度 | 作用 |
|---|---|---|
| `global_browse_tool` | 大范围片段描述 | 建立人物、事件和全局理解 |
| `clip_search_tool` | Top-K 片段 | 按事件描述定位时间 |
| `frame_inspect_tool` | 指定时间窗原始帧 | 回看细节并确认 |

系统提示要求：找到候选答案后，仍调用 `frame_inspect_tool` 做 CONFIRM。这个设计直接承认片段描述可能丢细节。

对应代码：

- `projects/DeepVideoDiscovery/dvd/dvd_core.py:27-160`
- `projects/DeepVideoDiscovery/dvd/build_database.py:15-216`

### 4.4 Agent 循环

每轮：

1. LLM 输出一个 function call；
2. 工具结果作为 observation 回填；
3. 最后一轮强制调用 `finish`；
4. 最多 `MAX_ITERATIONS`。

还支持多问题线程池并行和 Gradio 流式展示。

### 4.5 技术栈

- Python、OpenAI/Azure OpenAI；
- OpenCV、yt-dlp；
- NanoVectorDB；
- Gradio、FastMCP；
- GPT-4.1 mini 作为描述/工具 VLM，o3 作为 orchestrator（默认配置）。

### 4.6 优点

- 24 个跟踪文件，主链非常容易理解。
- 把“摘要检索”和“原帧验证”明确分开。
- 提供 lite mode，允许只分析字幕型播客。
- 工具粒度和使用时机写入系统提示。
- benchmark 入口支持并行问题。

### 4.7 限制

- 没有测试文件。
- 依赖云 embedding 和模型端点。
- 默认 `LITE_MODE=True` 时完全没有视觉确认工具。
- 固定 10 秒切片和 2 fps 未按内容自适应。
- 主循环没有持久状态、预算细分、取消和恢复。
- 源码仍有少量明显粗糙点，例如本地 `load_video()` 分支缺少显式 return。

### 4.8 对全智评的借鉴

最值得借鉴的是“摘要只用于找路，原始帧才用于确认”：

```text
Phase 1 粗扫
  -> 语义检索候选步骤时间
  -> Phase 2 对候选时间窗读取原分辨率帧
  -> 必要时扩大窗口
```

这可避免把 Phase 1 低清摘要直接当最终评分证据。

### 4.9 思考点

1. 全智评 Phase 2 能否显式要求“确认或推翻”Phase 1，而不是重新独立回答？
2. 每个步骤应允许几次主动回看，停止条件是什么？
3. 如果候选时间完全错误，怎样回退到全局重新搜索？

---

## 5. OmAgent

### 5.1 定位

OmAgent 是较完整的多模态 Agent 框架。视频理解只是一个示例，但展示了“场景记忆 + 分治推理 + 工具回看”的组合。

### 5.2 视频预处理

`VideoPreprocessor`：

1. 对输入视频计算 MD5；
2. 场景检测；
3. 每个场景提取音频和帧；
4. ASR；
5. VLM 生成结构化场景摘要；
6. 文本向量化；
7. 写入 VideoMilvusLTM；
8. 把完整 VideoScenes 放入短期内存；
9. 可用 pickle cache 断点恢复未完成场景。

对应代码：

- `projects/OmAgent/examples/video_understanding/agent/video_preprocessor/video_preprocess.py`

### 5.3 问题定位

`VideoQA` 先让 LLM 从问题中推测开始/结束时间，再：

- 生成问题向量；
- 按 `video_md5` 和时间范围过滤 Milvus；
- 取 Top-5 场景摘要；
- 将视频时长、帧率和摘要写入共享短期状态。

对应代码：

- `projects/OmAgent/examples/video_understanding/agent/video_qa/qa.py:23-81`

### 5.4 DnC 工作流

```text
ConstructDncPayload
  -> DnCLoop[
       StructureUpdate
       -> Conqueror
       -> success / complex / failed
       -> Divider or Rescue
     ]
  -> ExitMonitor
  -> Conclude
```

TaskTree 显式保存：

- 节点 ID 和 parent；
- task；
- criticism/milestones；
- waiting/running/success/failed；
- result；
- cursor。

最大任务深度默认为 5，防止无限拆分。

对应代码：

- `projects/OmAgent/omagent-core/src/omagent_core/advanced_components/workflow/dnc/`

### 5.5 Rewinder

当场景摘要不够时，Rewinder 接收：

- `start_time`；
- `end_time`；
- `number`，最大 10 帧。

它从短期内存中的原视频提取指定帧，再让 VLM 描述。这个工具修补了“预处理摘要丢细节”的问题。

### 5.6 技术栈

- Python 3.11、Pydantic、Poetry；
- 自研 ConductorWorkflow；
- Milvus、Redis/Redislite；
- PySceneDetect、OpenCV、ASR；
- OpenAI-compatible VLM；
- Gradio、CLI、设备客户端；
- ReAct、CoT、ToT、RAP、Reflexion 等多个 Agent operator。

### 5.7 优点

- workflow、worker、tool、STM、LTM、client 分层完整。
- 视频预处理和推理内存边界清晰。
- 分治不是自然语言列表，而是有状态 TaskTree。
- Rewinder 为摘要损失提供回看通道。
- 支持本地 lite executor 和分布式 Conductor 两条路线。

### 5.8 限制

- 框架面很大，949 个跟踪文件，学习和部署成本高。
- 视频示例依赖 Milvus、OpenAI embedding 和多个配置文件。
- 项目主仓最近 commit 为 2025-02，视频链更新较慢。
- 测试文件很少，搜索到的多个 `test_*` 是 SDK 方法名，不是测试用例。
- 部分内存实现存在新旧序列化代码并存等维护痕迹。

### 5.9 对全智评的借鉴

- 用“作业证据记忆”和“本轮临时观察”区分 LTM/STM；
- 将 Phase 2 主动回看做成有限参数工具；
- 用状态树记录复杂步骤复核，而不是只保留最终文本；
- 给分治深度、回看帧数和循环次数硬上限。

### 5.10 思考点

1. 全智评一个“步骤”是否需要子任务树，还是两级证据计划已足够？
2. 哪些中间状态应该持久化，哪些只应存在于一次评价运行？
3. 回看工具是否要允许模型选择帧数，还是后端按预算决定？

---

## 6. VidMentor

### 6.1 定位

VidMentor 是教育视频离线加工与交互系统。它把多个课程视频变成转录、知识层级、摘要、向量和题目，再用 Streamlit 提供搜索、脑图、问答和出题。

### 6.2 离线构建链

```text
videos/*.mp4
  -> Whisper ASR，每约 15 秒聚合
  -> 每 5 秒帧 OCR
  -> Llama 生成 Markdown 知识层级
  -> Markdown 解析为树
  -> BGE 将转录片段映射到叶节点
  -> 生成 summary / segment_info / embeddings
  -> 汇总全部视频摘要索引
```

对应代码：

- `projects/VidMentor/build_database.py`
- `projects/VidMentor/backend/backend_audio.py`
- `projects/VidMentor/backend/backend_visual.py`
- `projects/VidMentor/backend/backend_llm.py`

### 6.3 两级检索

- 视频级：查询和每个视频 summary embedding 比较，选相关视频。
- 视频内：查询和 ASR 片段 embedding 比较，返回开始/结束时间和内容。

这种“先选视频，再选片段”的层级结构适合视频库。

### 6.4 教学能力

- 把 Markdown 层级渲染成 Graphviz 脑图；
- 从知识节点跳转到对应时间段；
- 对当前帧 OCR 文本抽关键词；
- 基于片段转录生成选择题、判断题或简答题；
- 保存示例数据库和问答材料。

### 6.5 技术栈

- Python 3.9；
- Whisper、PaddleOCR、KeyBERT、BGE；
- 本地 llama.cpp / Llama 3 GGUF；
- NumPy 文件向量；
- Streamlit、Graphviz；
- Pandas、OpenCV。

### 6.6 优点

- 教育场景非常明确，功能链直观。
- 本地模型为主，可离线运行。
- 知识树与时间片映射便于课程导航。
- 仓库内含示例视频和派生数据库，容易理解数据形态。

### 6.7 限制

- GitHub 未声明许可证，不能默认商用复用。
- 没有测试文件，最近 push 为 2024-09。
- 代码有固定 GPU 环境变量和本地 checkpoint 假设。
- Q&A 页面当前直接调用无 reference 的百科回答路径，没有稳定接上片段检索。
- `eval()` 读取 `segment_info.json`，存在不必要的安全风险。
- 视觉信息主要是 OCR，不理解动作。

### 6.8 对全智评的借鉴

- 在教师复核页提供“评分模板知识树 -> 步骤 -> 时间片”导航；
- 先按项目/模板检索，再按步骤检索作业证据；
- 从真实评价结果生成针对性练习或复训题。

不应借鉴：

- 文件型松散数据库作为多用户生产存储；
- 无证据的百科回答与视频回答混合。

### 6.9 思考点

1. 全智评能否把模板维度和步骤渲染成可点击证据树？
2. 评分结果能否自动生成“下一次练习重点”，而不是只给文字建议？
3. 如何防止生成题目泄露不在视频或模板中的知识？

---

## 7. proteomics_lab_agent

### 7.1 定位

proteomics_lab_agent 是本轮与全智评业务语义最相似的项目：它把实验室视频、书面协议和领域知识结合，生成协议或实验记录，并识别漏做、错做、乱序和新增步骤。

### 7.2 Agent 架构

Google ADK root agent 编排多个专业 Agent：

| Agent | 职责 |
|---|---|
| video_analyzer | 视频起始状态、动作序列、设备和结束状态 |
| protocol_generator | 从视频或笔记生成 Nature-style protocol |
| lab_note_generator | 协议与视频逐步对照，生成 lab note |
| lab_knowledge | 通过 Confluence MCP 检索/创建协议 |
| instrument | 通过 AlphaKraken MCP 获取仪器 QC |
| qc_memory | 本地 SQLite MCP 保存历史判断 |

入口：

- `projects/proteomics_lab_agent/proteomics_lab_agent/agent.py`

### 7.3 视频处理方式

项目不是先在本地抽帧，而是：

1. 解析用户消息中的本地路径；
2. 上传视频到 Google Cloud Storage；
3. 将视频作为 Gemini 原生 media part；
4. 加入背景 PDF、领域 persona、示例视频和示例协议；
5. 调 Gemini 生成协议、分析或 lab note。

对应代码：

- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/video_analyzer_agent/agent.py`
- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/protocol_generator_agent/agent.py`
- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/lab_note_generator_agent/agent.py`

### 7.4 协议对照评价

Lab Note prompt 要求：

1. 完整读取 ground-truth protocol；
2. 按时间记录视频中的全部动作；
3. 对协议每步查找支持证据；
4. 分类为正确、Omitted、Error、Added 或 Altered order；
5. 对疑似偏差回看前后 10 秒，主动尝试推翻；
6. 生成过去时、带实际时间的 resulting lab notes。

这与全智评 CCAE 的相似点：

- 都有领域标准；
- 都逐步骤核对；
- 都要求时间戳证据；
- 都识别漏做和错误；
- 都有反面证据或复核阶段。

差异：

- proteomics 主要由一次原生视频模型调用和 prompt 约束完成；
- 全智评分离了粗扫、聚焦、仲裁和确定性打分；
- 全智评还有多用户业务状态和教师覆写。

### 7.5 评测体系

项目的评测比多数样本完整：

- 协议生成：完整性、技术准确性、逻辑、安全、格式五维 1-5 分；
- Lab note：逐步 TP、TN、FP、FN 和错误类别；
- 协议查找：提取标题后用 ROUGE；
- 测试目录约 4,172 行，覆盖子 Agent、环境和 SQLite。

对应代码：

- `projects/proteomics_lab_agent/eval/eval_protocol_generation/`
- `projects/proteomics_lab_agent/eval/eval_lab_note_generation/`
- `projects/proteomics_lab_agent/eval/eval_protocol_finding/`

### 7.6 技术栈

- Python 3.12+；
- Google ADK、Gemini 2.5、Google Cloud Storage；
- MCP：Confluence、AlphaKraken、本地 SQLite；
- Pydantic、Pandas、ROUGE；
- Docker Compose；
- pytest 与 Ruff。

### 7.7 优点

- 领域目标、Agent 职责和输入输出非常具体。
- 协议不是普通上下文，而是评价事实源。
- Prompt 显式包含反证复看。
- 评测关注步骤级 FP/FN，而非只看总分。
- 知识库、仪器状态和历史判断通过 MCP 解耦。

### 7.8 限制

- 视频上传云端，隐私和费用需单独治理。
- 大量领域行为写在超长 root prompt，编排逻辑与策略不完全分离。
- 模型一次原生读视频的观察过程不易审计和复用。
- 评价中的时间戳仍由模型生成，缺少独立索引约束。
- 协议、视频和 examples 的大上下文成本较高。

### 7.9 对全智评的借鉴

最高价值：

1. 把疑似错误当作待反证假设；
2. 记录错误类别和能力类别；
3. 使用 TP/TN/FP/FN 而非只看分数差；
4. 将模板、教师标准和样例形成可版本化 benchmark；
5. 专业知识、设备数据和协议库走独立工具接口。

### 7.10 思考点

1. 全智评的 `camera_issue` 是否应成为独立错误技能类别？
2. 教师覆写能否自动生成步骤级 benchmark row？
3. “漏做”与“镜头没拍到”怎样在评测中分开统计？
4. 何时应该用原生视频模型，何时坚持抽帧可审计链？

---

## 8. multimodal-rag-agent

### 8.1 定位

这是一个完整的三服务视频 RAG 应用样板：

```text
Next.js UI
  -> FastAPI API + LangGraph
  -> FastMCP video tools
  -> Pixeltable multimodal data
```

### 8.2 服务分层

| 服务 | 职责 |
|---|---|
| `multimodal-agent-ui` | 上传、视频选择、聊天和媒体播放 |
| `multimodal-api` | HTTP、后台任务、Agent 状态和最终响应 |
| `multimodal-mcp` | 视频摄取、搜索、问答和裁剪工具 |

三个容器通过共享 media volume 和 MCP HTTP 连接。

### 8.3 Pixeltable 数据层

`VideoProcessor` 定义：

- 全局视频表；
- 帧 view；
- 音频 chunk view；
- computed audio extraction；
- computed frame caption；
- computed ASR；
- 文本和图像 embedding index。

视频插入表后，派生列由 Pixeltable 统一计算。它避免手工维护“视频文件、帧、音频、caption、向量”之间的外键和任务脚本。

对应代码：

- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/ingestion/video_processor.py`

### 8.4 三类检索

- speech：转录文本向量；
- caption：帧描述文本向量；
- image：CLIP 图像向量。

文本找片段时分别查 speech 和 caption，再选择最高相似度结果；图片查询直接定位相似帧并裁剪前后时间窗。

对应代码：

- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/search_video.py`
- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/clip_extractor.py`

### 8.5 LangGraph Agent

```text
START
  -> summarize history if token threshold exceeded
  -> router
     -> direct general response
     -> tool selector -> tool executor -> general response
  -> END
```

Agent 可按用户选择的 `video_ids` 限定搜索范围。MCP server 同时提供 tools、prompts 和 registry resources。

### 8.6 技术栈

- Next.js、React、TypeScript、Zustand；
- FastAPI、LangGraph、LangChain；
- FastMCP；
- Pixeltable、PyAV、MoviePy；
- Groq Whisper/Llama Vision；
- Hugging Face MiniLM/CLIP；
- Docker Compose。

### 8.7 优点

- 分层清晰，是最接近普通产品开发的参考工程。
- Pixeltable 展示了多模态 computed data 的统一抽象。
- MCP 将数据面能力和对话 Agent 解耦。
- 支持目标视频选择，避免全库误检。
- 视频检索结果可直接裁剪成用户可播放片段。

### 8.8 限制

- 仓库没有测试文件。
- `process-video` 状态保存在 FastAPI 进程内存，重启后丢失。
- 帧数固定为 30，非场景感知和时长自适应。
- 问答工具只返回 Top-K captions，最终答案由上层 LLM 合成。
- 相似度结果缺少明确阈值和“无证据拒答”校准。
- MCP 默认绑定 `0.0.0.0`，代码片段未显示认证边界。
- `pyproject.toml` 仍有包名/描述占位等打磨不足。

### 8.9 对全智评的借鉴

- 把媒体摄取/检索做成独立服务，不和评价 prompt 耦合；
- 为帧、ASR 和视觉描述建立统一多模态表；
- 让教师从命中直接播放证据片段；
- 按项目、模板或作业 ID 限定搜索空间。

### 8.10 思考点

1. Pixeltable 是否值得替代全智评当前 PostgreSQL + Redis 派生数据，还是只适合实验索引？
2. 证据索引应是生产事实源，还是可重建派生层？
3. 多租户下如何做视频、帧和向量的权限隔离？

---

## 9. ReAgent-V

### 9.1 定位

ReAgent-V 是奖励驱动的视频推理研究框架。它把查询相关选帧、动态工具、批评问题、评价报告和多视角反思串成一条推理时自我改进链。

### 9.2 主链

```text
视频 + 问题
  -> ECRS 关键帧选择
  -> LLM 选择 OCR / ASR / Scene Graph
  -> 检索对应模态证据
  -> 构建 multimodal prompt
  -> LLaVA-Video 初答
  -> 生成 critical questions
  -> 对每个问题重新选工具、重新取证
  -> evaluation report
  -> conservative / neutral / aggressive 三种修订
  -> meta agent 选择最终答案
```

### 9.3 ECRS 选帧

每帧分数：

```text
归一化 CLIP(query, frame) * 归一化 image entropy
```

系统逐轮提高阈值，直到集合稳定或最多 10 轮；若少于 32 帧，再按总分补足。

含义：

- CLIP 负责“与问题相关”；
- entropy 负责“信息量较高”；
- min_frames 防止过度裁剪。

对应代码：

- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/frame_selection_ecrs/ECRS_frame_selection.py`

### 9.4 动态工具

模型先根据问题输出：

- OCR；
- ASR；
- Scene Graph。

之后工具层可进一步：

- OCR 文本 RAG；
- ASR 文本 RAG；
- 对象检测；
- 位置、数量和关系计算。

对应代码：

- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/tools/tool_selection.py`
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/tools/extract_modal_info.py`

### 9.5 反思层

初答后：

1. critic 生成关键追问；
2. 追问触发新一轮模态检索；
3. evaluation report 记录优势、缺口和缺失证据；
4. conservative、neutral、aggressive 三个角色分别修订；
5. meta prompt 综合答案和自报置信度。

项目还把结构化评价视为 SFT、DPO、GRPO 数据来源。

### 9.6 技术栈

- Python、PyTorch、CUDA；
- LLaVA-Video/Qwen2、CLIP、Whisper；
- OCR、对象检测、场景图；
- 自定义 RAG；
- 大型模型本地路径；
- 研究脚本和 VLA alignment 子项目。

### 9.7 优点

- 不是静态拼接全部模态，而是按问题选工具。
- 关键帧同时考虑语义和视觉信息量。
- critical questions 会驱动重新取证。
- 评价报告可用于推理修订和训练数据。
- 明确建模多种修订策略。

### 9.8 限制

- GitHub 未声明许可证。
- 主视频理解链没有独立测试。
- `run_pipline.py` 和配置含固定 `/root/autodl-tmp/...` 路径。
- 强依赖 CUDA 和多个大模型。
- 工具选择通过字符串包含 `"OCR"` 等结果解析，协议较脆弱。
- 三种反思仍由同一模型族完成，自报 confidence 未独立校准。
- 时间戳证据和结构化业务输出较弱。

### 9.9 对全智评的借鉴

适合做受控实验：

- 按模板步骤动态启用 OCR/ASR/对象关系工具；
- 用查询相关性 + 画面信息量辅助 Phase 2 选帧；
- 根据初答缺口生成“要验证什么”的 critical question；
- 将评价报告转为训练/回归样本。

不应直接搬：

- 同模型多角色投票作为最终裁判；
- 字符串解析工具选择；
- 固定 GPU 路径和无界大模型上下文。

### 9.10 思考点

1. 全智评 Phase 2 的“问题”能否由步骤 rubric 和 Phase 1 缺口确定性生成？
2. 图像 entropy 对实验操作关键帧真的有帮助，还是会偏好复杂背景？
3. 多视角反思与 Phase 3 仲裁相比，哪个更可校准？
4. 哪些 critic 输出可以成为教师可读证据，哪些只适合内部训练？
