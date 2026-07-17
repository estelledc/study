---
title: "研究范围与样本"
sidebar:
  hidden: true
---
# 研究范围与样本

## 1. 研究问题

本轮研究回答六个有限问题：

1. 全智评位于多模态视频 AI 技术栈的哪一层？
2. 这个领域有哪些主要架构路线，各自解决什么问题？
3. 哪些开源项目与“实操视频理解、评价和反馈”有直接参考价值？
4. 每个项目的真实代码链、状态边界和扩展方式是什么？
5. 哪些机制适合引入全智评，哪些只适合论文实验或通用媒体产品？
6. 后续学习应精读哪些源码、做哪些最小实验？

“所有相关项目”无法构成绝对封闭集合。本材料中的“全部”指：

- 用户指定的两个项目；
- 截至 2026-07-16 按下述标准搜索、筛选并进入正式样本的 7 个项目；
- 共 9 个项目，全部完成个人 fork 和本地 clone。

## 2. 全智评对标基线

### 2.1 产品定位

全智评是面向实验教学和技能训练的多角色 SaaS，不是单一视频模型或问答 Demo。

产品链包含：

- 教师、学生、管理员角色；
- 项目、作业、评分模板和提交管理；
- 视频或图片上传、对象存储和转码；
- ASR、帧提取和多模态评价；
- 分维度、分步骤的结构化结果；
- 教师覆写、审计事件、Token 台账和 SSE 进度通知。

主要依据：

- `explorations/own/quanzhiping-ci-local/docs/architecture/技术方案总览.md`
- `explorations/own/quanzhiping-ci-local/docs/PROJECT_MAP.md`
- `explorations/own/quanzhiping-ci-local/backend/app/tasks/evaluation_tasks.py`

### 2.2 当前评价主链

```text
assignment 入库
  -> chain(group(asr_task, frame_extraction_task), run_qwen_evaluation.si)
  -> ASR 写 PostgreSQL
  -> 帧写 Redis frames_store
  -> evaluator 按模板路由到 holistic / AVI / legacy
  -> 结构化评分写 evaluation_results
  -> Token 扣减、SSE 更新、人工复核
```

关键工程事实：

- ASR 和抽帧并行，不是先后串行。
- 当前视频抽帧以 ffmpeg 顺序解码和自适应均匀采样为主。
- 帧是带时间戳的 JPEG base64，评价时与 ASR 分段合流。
- 大帧列表不放 Celery 返回体，而是经 Redis 按 `assignment_id` 传递。
- AVI/CCAE 以领域模板为标准，输出步骤状态、证据、置信度和时间位置。

### 2.3 CCAE 的三阶段评价

步骤型评价主线是：

1. **Phase 1 全局扫描**：粗筛帧 + 完整 ASR，覆盖全部步骤并定位时间。
2. **Phase 2 聚焦复核**：对低置信、缺失、质量问题或弱观察步骤重取聚焦帧。
3. **Phase 3 仲裁**：两轮状态冲突且置信度接近时独立裁决。

后端再按状态确定分数，模型不直接决定最终数值。这个设计使全智评比通用视频问答多出三层约束：

- 领域评分模板；
- 确定性评分后处理；
- 人工复核和审计。

### 2.4 本轮对标维度

候选项目按以下维度评估：

| 维度 | 要问的问题 |
|---|---|
| 视频原生性 | 是否真正处理视频时间轴，而非只处理单图或纯文本 |
| 跨模态融合 | 是否同时利用画面、语音、OCR、对象或外部知识 |
| 取证策略 | 固定抽帧、场景抽帧、语义检索、主动回看还是混合 |
| 结构化输出 | 是否有时间戳、证据、状态、置信度或可验证 schema |
| 领域约束 | 是否能把协议、rubric、模板或知识库纳入判断 |
| 反馈闭环 | 是否支持反思、仲裁、人工校正、评测或持续改进 |
| 应用完整性 | 是否包含 API、UI、持久化、异步任务和部署 |
| 可迁移性 | 机制是否能独立迁移，而不必复制整个项目 |
| 工程成熟度 | 测试、错误处理、许可证、文档和维护状态如何 |

## 3. 搜索与筛选方法

### 3.1 搜索渠道

本轮使用：

- GitHub 仓库搜索：`multimodal video agent`、`video RAG`、`video understanding agent` 等查询；
- Exa 技术搜索：寻找视频理解、教育评价、结构化分析和 Agent 应用；
- 用户指定仓库的 README、主题标签、依赖和相邻项目；
- 本地全智评源码和已有多模态论文材料作为筛选基线。

### 3.2 纳入标准

正式样本至少满足一项强关系：

- 能处理视频、音频、帧或时间片；
- 提供可读的 Agent/RAG/评价代码，而非只有模型权重；
- 能回答全智评当前架构中的一个明确问题；
- 是教育、实验室操作或流程验证等垂直案例；
- 提供端到端应用分层，可作为产品工程参考。

同时优先：

- canonical 原仓库；
- 有清晰入口、配置和核心实现；
- 有标准许可证，或虽无许可证但研究价值明确；
- 最近仍有维护，或是具有代表性的历史实现。

### 3.3 排除原则

以下类型不进入本轮逐仓深潜：

- 只有论文、权重或数据集，没有足够应用代码；
- 只做视频生成，和理解/评价链没有明显关系；
- 通用多模态框架，但没有视频时序能力；
- 上游重复 fork 或镜像；
- 与正式样本能力高度重复，且没有新的架构变量。

## 4. 九个正式研究对象

### 4.1 用户指定项目

| 项目 | 入选原因 | 主要观察角度 |
|---|---|---|
| [video-db/Director](https://github.com/video-db/Director) | 用户指定；通用视频 Agent 框架 | LLM 工具路由、视频云基础设施、插件式 Agent、实时 UI |
| [oxbshw/watch-skill](https://github.com/oxbshw/watch-skill) | 用户指定；本地视频证据与验证层 | 场景感知、OCR/ASR、持久索引、置信度升级、THE LOOP |

### 4.2 额外筛选项目

| 项目 | 入选原因 | 主要观察角度 |
|---|---|---|
| [HKUDS/VideoAgent](https://github.com/HKUDS/VideoAgent) | 理解、编辑、生成一体化，且与 Director 直接对照 | 动态工具注册、意图过滤、Agent DAG、VideoRAG、重型模型集成 |
| [microsoft/DeepVideoDiscovery](https://github.com/microsoft/DeepVideoDiscovery) | 长视频 Agentic Search 的简洁官方实现 | 全局浏览、片段检索、帧回看确认、轻量字幕模式 |
| [om-ai-lab/OmAgent](https://github.com/om-ai-lab/OmAgent) | 多模态 Agent 框架与长视频分治代表 | 场景摘要、Milvus 记忆、DnC 任务树、Rewinder |
| [Kailuo-Lai/VidMentor](https://github.com/Kailuo-Lai/VidMentor) | 明确面向教育视频 | ASR、OCR、知识树、跨视频检索、视频内问答与出题 |
| [MannLabs/proteomics_lab_agent](https://github.com/MannLabs/proteomics_lab_agent) | 与实操评价最接近的垂直项目 | 实验协议、视频对照、偏差分类、反证复看、评测数据 |
| [kamran945/multimodal-rag-agent](https://github.com/kamran945/multimodal-rag-agent) | 完整视频 RAG 应用 | Next.js、FastAPI、LangGraph、MCP、Pixeltable、跨模态检索 |
| [aiming-lab/ReAgent-V](https://github.com/aiming-lab/ReAgent-V) | 奖励驱动、多工具、多视角反思 | 熵+语义选帧、OCR/ASR/Scene Graph、批评问题、反思答案 |

## 5. 样本覆盖矩阵

| 项目 | 应用框架 | 长视频 | OCR/ASR | 检索/记忆 | 领域标准 | 反思/复核 | UI/API |
|---|---:|---:|---:|---:|---:|---:|---:|
| Director | 强 | 中 | 依赖 VideoDB | 强 | 弱 | 弱 | 强 |
| watch-skill | 强 | 强 | 强 | 强 | 中 | 强 | 强 |
| VideoAgent | 强 | 中 | 强 | 中 | 弱 | 规划阶段有 | CLI 为主 |
| DeepVideoDiscovery | 中 | 强 | 字幕 + VLM | 强 | 弱 | 强制帧确认 | Gradio/MCP |
| OmAgent | 强 | 强 | 强 | 强 | 弱 | 分治 + 回看 | CLI/Gradio |
| VidMentor | 中 | 中 | 强 | 中 | 教育内容 | 弱 | Streamlit |
| proteomics_lab_agent | 强 | 中 | 原生 Gemini 视频 | 知识库/MCP | 强 | 反证复看 | ADK |
| multimodal-rag-agent | 强 | 中 | 强 | 强 | 弱 | 弱 | 强 |
| ReAgent-V | 研究框架 | 强 | 强 | 动态 RAG | 可提示配置 | 强 | 脚本 |

这里的“强/中/弱”只表示当前样本中该能力的实现比重，不代表产品质量排名。

## 6. 候选池与未纳入原因

| 候选 | 未纳入主样本的原因 |
|---|---|
| YueFan1014/VideoAgent | ECCV 2024 记忆增强视频 Agent 很有价值，但与 OmAgent/DVD 的长视频研究变量重叠，本轮先保留为论文型对照 |
| starsuzi/VideoRAG | 视频语料 RAG 方向相关，但应用完整度和垂直评价关系弱于正式样本 |
| TheoremExplainAgent | 视频生成多模态定理解释，偏教学内容生成而非操作评价 |
| HM-RAG | 分层多 Agent 长视频 RAG 有研究价值，但与 DVD/OmAgent 的问题分解路线重复 |
| VideoHV-Agent | 假设—验证范式值得后续跟进，但当前样本已由 ReAgent-V 和 proteomics 的反证复核覆盖相近变量 |
| OmniAgent | 原生 omni 模型主动感知代表，但核心重点是训练和强化学习，不是可直接迁移的应用管线 |
| SmartGrader | rubric 评价思路相似，但输入主要是手写作业图片，不是视频时序操作 |
| 通用 VLM 仓库 | 负责模型能力，不负责应用层取证、评价和业务闭环 |

未纳入不表示项目质量差，只表示本轮需要控制为可逐仓验证的固定样本。

## 7. 证据等级

### L1：直接源码证据

- 入口、类、函数、schema、数据库表和控制流；
- 依赖文件、Docker Compose、测试目录；
- 本地 Git commit、远端和工作树状态。

### L2：仓库官方说明

- README、架构文档、论文链接；
- 功能边界和设计动机。

对 README 的能力主张会回到源码抽查，不直接当成已验证运行结果。

### L3：外部元数据

- GitHub star、fork、最近 push、许可证；
- 搜索结果和候选说明。

这些只用于生态定位，不用于证明准确率或工程质量。

## 8. 本地源码约束

- 9 个项目放在 `projects/<name>/`。
- 每个目录保留自己的 `.git`。
- `origin` 指向 `estelledc` 个人 fork。
- `upstream` 指向原仓库。
- 父仓 `.gitignore` 精确忽略每个路径。
- 第三方源码只读，研究材料写入当前目录。
- clone 时设置 `GIT_LFS_SKIP_SMUDGE=1`，避免自动下载模型和大媒体 LFS 内容。

## 9. 研究边界

本轮没有：

- 下载各项目要求的模型权重；
- 配置 VideoDB、OpenAI、Azure、Gemini、Groq、Confluence、Milvus 等真实服务；
- 为 9 个项目逐一安装依赖；
- 复现论文 benchmark；
- 用相同数据集比较准确率、延迟和成本；
- 修改任何第三方源码。

因此，本材料能回答“架构怎样组织、代码如何流动、哪些模式值得借鉴”，不能替代“在全智评真实样本上的效果实验”。
