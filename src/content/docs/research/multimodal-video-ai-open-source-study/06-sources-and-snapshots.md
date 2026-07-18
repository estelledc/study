---
title: "来源、fork 与源码快照"
sidebar:
  hidden: true
---
# 来源、fork 与源码快照

## 1. 快照时间

- GitHub 搜索与 fork：2026-07-16
- 本地 clone 与 commit 固定：2026-07-16
- star、fork、最近 push 和许可证只代表该日快照，会继续变化。

## 2. 原仓、个人 fork 与本地路径

| 原仓库 | 个人 fork | 本地目录 |
|---|---|---|
| [video-db/Director](https://github.com/video-db/Director) | [estelledc/Director](https://github.com/estelledc/Director) | `projects/Director` |
| [oxbshw/watch-skill](https://github.com/oxbshw/watch-skill) | [estelledc/watch-skill](https://github.com/estelledc/watch-skill) | `projects/watch-skill` |
| [HKUDS/VideoAgent](https://github.com/HKUDS/VideoAgent) | [estelledc/VideoAgent](https://github.com/estelledc/VideoAgent) | `projects/VideoAgent` |
| [microsoft/DeepVideoDiscovery](https://github.com/microsoft/DeepVideoDiscovery) | [estelledc/DeepVideoDiscovery](https://github.com/estelledc/DeepVideoDiscovery) | `projects/DeepVideoDiscovery` |
| [om-ai-lab/OmAgent](https://github.com/om-ai-lab/OmAgent) | [estelledc/OmAgent](https://github.com/estelledc/OmAgent) | `projects/OmAgent` |
| [Kailuo-Lai/VidMentor](https://github.com/Kailuo-Lai/VidMentor) | [estelledc/VidMentor](https://github.com/estelledc/VidMentor) | `projects/VidMentor` |
| [MannLabs/proteomics_lab_agent](https://github.com/MannLabs/proteomics_lab_agent) | [estelledc/proteomics_lab_agent](https://github.com/estelledc/proteomics_lab_agent) | `projects/proteomics_lab_agent` |
| [kamran945/multimodal-rag-agent](https://github.com/kamran945/multimodal-rag-agent) | [estelledc/multimodal-rag-agent](https://github.com/estelledc/multimodal-rag-agent) | `projects/multimodal-rag-agent` |
| [aiming-lab/ReAgent-V](https://github.com/aiming-lab/ReAgent-V) | [estelledc/ReAgent-V](https://github.com/estelledc/ReAgent-V) | `projects/ReAgent-V` |

## 3. 固定 commit 与本地规模

| 项目 | commit | 跟踪文件 | 本地大小 |
|---|---|---:|---:|
| Director | `70e0b3dfdf59` | 138 | 3.0 MB |
| watch-skill | `bf177b09a4c8` | 318 | 11 MB |
| VideoAgent | `44611659e436` | 851 | 289 MB |
| DeepVideoDiscovery | `64414b2f35d2` | 24 | 1.6 MB |
| OmAgent | `c131f82b16be` | 949 | 63 MB |
| VidMentor | `f4d8267aca93` | 192 | 8.9 MB |
| proteomics_lab_agent | `413fbcdab916` | 113 | 59 MB |
| multimodal-rag-agent | `a1239265dca3` | 132 | 115 MB |
| ReAgent-V | `1b97db6208ac` | 968 | 417 MB |

说明：

- clone 时设置 `GIT_LFS_SKIP_SMUDGE=1`，避免自动下载模型或大媒体 LFS 内容。
- Git 源码、配置、普通媒体和提交历史仍已保存。
- “本地大小”包含 `.git` 和仓库内普通资产，不等同于源代码体积。

## 4. GitHub 活跃度快照

star 只表示社区关注度，不表示准确率、工程质量或适合全智评。

| 项目 | star | fork | 最近 push | GitHub 识别许可证 |
|---|---:|---:|---|---|
| Director | 1,441 | 234 | 2026-01-23 | MIT |
| watch-skill | 204 | 27 | 2026-07-12 | MIT |
| VideoAgent | 1,451 | 204 | 2026-07-03 | MIT |
| DeepVideoDiscovery | 403 | 20 | 2025-11-03 | MIT |
| OmAgent | 2,662 | 292 | 2025-03-19 | Apache-2.0 |
| VidMentor | 4 | 3 | 2024-09-15 | 未识别 |
| proteomics_lab_agent | 22 | 6 | 2025-12-02 | Apache-2.0 |
| multimodal-rag-agent | 6 | 2 | 2025-11-10 | Apache-2.0 |
| ReAgent-V | 51 | 4 | 2025-09-21 | 未识别 |

许可证边界：

- fork 和本地阅读不代表获得额外授权。
- VidMentor、ReAgent-V 未声明标准许可证，本材料只将其作为研究参考。
- 将代码复制到全智评前必须重新检查原仓许可证、依赖许可证和具体文件来源。
- VideoAgent 虽标 MIT，但仓库内包含多个第三方子项目，复用时仍需逐项核对。

## 5. Git 关系验证

每个本地仓库均满足：

```text
origin   -> git@github.com:estelledc/<repo>.git
upstream -> 原仓库
```

截至快照：

- 9 个个人仓库的 GitHub API 均返回 `fork=true`；
- 每个 fork 的 `parent.full_name` 与目标原仓一致；
- 9 个本地仓库 `upstream/main...origin/main` 均为 `0 0`；
- 9 个本地仓库在分析前后均未修改第三方源码。

## 6. 搜索查询

主要 GitHub 查询：

```text
multimodal video agent language:Python stars:>50
video RAG multimodal stars:>50
video understanding agent stars:>100
```

主要语义搜索方向：

```text
GitHub open source multimodal AI video understanding agent
RAG application structured analysis education assessment
long video active perception verification
laboratory procedure video agent
```

候选池与未纳入原因见 [研究范围第 6 节](01-scope-and-corpus.md)。

## 7. 重点源码证据

### 7.1 全智评基线

- `explorations/own/quanzhiping-ci-local/docs/architecture/技术方案总览.md`
- `explorations/own/quanzhiping-ci-local/docs/guides/CCAE-评估算法改进说明.md`
- `explorations/own/quanzhiping-ci-local/backend/app/tasks/evaluation_tasks.py`
- `explorations/own/quanzhiping-ci-local/backend/app/services/frame_extractor.py`
- `explorations/own/quanzhiping-ci-local/backend/app/services/avi/evaluator.py`
- `explorations/own/quanzhiping-ci-local/backend/app/services/avi/prompts.py`

### 7.2 Director

- `projects/Director/backend/director/handler.py`
- `projects/Director/backend/director/core/reasoning.py`
- `projects/Director/backend/director/core/session.py`
- `projects/Director/backend/director/agents/base.py`
- `projects/Director/backend/director/agents/search.py`
- `projects/Director/backend/director/tools/videodb_tool.py`

### 7.3 watch-skill

- `projects/watch-skill/docs/architecture.md`
- `projects/watch-skill/src/watch_skill/watch.py`
- `projects/watch-skill/src/watch_skill/perceive/engine.py`
- `projects/watch-skill/src/watch_skill/index/db.py`
- `projects/watch-skill/src/watch_skill/index/retrieval.py`
- `projects/watch-skill/src/watch_skill/answer/engine.py`
- `projects/watch-skill/src/watch_skill/loop/runner.py`
- `projects/watch-skill/src/watch_skill/loop/critic.py`

### 7.4 VideoAgent

- `projects/VideoAgent/environment/agents/base.py`
- `projects/VideoAgent/environment/agents/multi.py`
- `projects/VideoAgent/environment/config/intents.yml`
- `projects/VideoAgent/environment/roles/vid_qa/content_loader.py`
- `projects/VideoAgent/tools/videorag/videoragcontent.py`

### 7.5 DeepVideoDiscovery

- `projects/DeepVideoDiscovery/dvd/dvd_core.py`
- `projects/DeepVideoDiscovery/dvd/build_database.py`
- `projects/DeepVideoDiscovery/dvd/frame_caption.py`
- `projects/DeepVideoDiscovery/dvd/video_utils.py`

### 7.6 OmAgent

- `projects/OmAgent/examples/video_understanding/run_cli.py`
- `projects/OmAgent/examples/video_understanding/agent/video_preprocessor/video_preprocess.py`
- `projects/OmAgent/examples/video_understanding/agent/video_qa/qa.py`
- `projects/OmAgent/examples/video_understanding/agent/tools/video_rewinder/rewinder.py`
- `projects/OmAgent/omagent-core/src/omagent_core/advanced_components/workflow/dnc/`

### 7.7 VidMentor

- `projects/VidMentor/build_database.py`
- `projects/VidMentor/backend/backend_audio.py`
- `projects/VidMentor/backend/backend_visual.py`
- `projects/VidMentor/backend/backend_llm.py`
- `projects/VidMentor/backend/backend_search.py`
- `projects/VidMentor/st_demo.py`

### 7.8 proteomics_lab_agent

- `projects/proteomics_lab_agent/proteomics_lab_agent/agent.py`
- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/video_analyzer_agent/`
- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/protocol_generator_agent/`
- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/lab_note_generator_agent/`
- `projects/proteomics_lab_agent/eval/`

### 7.9 multimodal-rag-agent

- `projects/multimodal-rag-agent/docker-compose.yml`
- `projects/multimodal-rag-agent/multimodal-api/src/multimodal_api/agent/graph.py`
- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/ingestion/video_processor.py`
- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/search_video.py`
- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/clip_extractor.py`

### 7.10 ReAgent-V

- `projects/ReAgent-V/ReAgent-V/ReAgentV.py`
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/frame_selection_ecrs/ECRS_frame_selection.py`
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/tools/tool_selection.py`
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/tools/extract_modal_info.py`
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/critical_question_generator/generate_critical_question.py`

## 8. 静态研究能证明什么

可以证明：

- 目录、依赖、入口和核心抽象真实存在；
- fork、clone、commit 和远端关系；
- 每个项目的主控制流；
- 选帧、检索、回看、反思和领域 prompt 的代码组织；
- 是否存在测试目录和标准许可证；
- 全智评与各项目的架构边界。

不能仅凭本轮静态研究证明：

- README 的准确率、速度和成本数字可在本机复现；
- 所有模型、云服务和外部 MCP 当前可用；
- 论文 benchmark 能迁移到实操教学；
- 某种选帧策略必然优于全智评当前实现；
- 多 Agent 或反思一定降低评分错误；
- 项目可以直接安全部署到生产。

## 9. 运行验证边界

没有为 9 个项目逐一安装依赖或执行端到端流程，原因是：

- 多个项目要求 CUDA 和数 GB 模型；
- Director、proteomics、MM-RAG 等依赖外部付费或私有服务；
- 直接运行会改变外部状态或产生费用；
- 本轮目标是建立可回答基础问题的源码研究材料，而不是复现全部产品。

本轮验证聚焦：

- GitHub fork 关系；
- Git 远端、commit 和分叉；
- 本地 clone 完整性；
- 第三方工作树只读；
- 研究 Markdown 链接与父仓质量门禁。

## 10. 验证命令与结果

### Fork 与 clone

```text
gh api repos/estelledc/<repo>
```

- 9/9 返回 `fork=true`；
- 9/9 `parent.full_name` 与目标原仓一致。

```text
git -C projects/<repo> rev-list --left-right --count upstream/main...origin/main
```

- 9/9 为 `0 0`，个人 fork 与上游默认分支没有分叉。

```text
git -C projects/<repo> fsck --connectivity-only --no-progress
git -C projects/<repo> status --porcelain
```

- 9/9 connectivity 检查通过；
- 9/9 第三方源码工作树干净。

```text
python3 scripts/explorations/restore-projects.py --audit
```

- 9/9 已有独立恢复卡，路径、clone URL 和 Git 边界通过审计；
- 审计仅报告其他既有项目的 dirty/stale 警告，本专题没有新增警告。

### 代表性 Python 入口

使用 `PYTHONPYCACHEPREFIX=/tmp/multimodal-video-study-pyc` 对 22 个关键入口执行 `python3 -m py_compile`：

- 9 个项目均覆盖至少一个核心入口；
- 22/22 语法编译通过；
- pyc 产物写入 `/tmp`，没有修改第三方源码树。

这只证明语法可解析，不证明依赖可安装或运行链可执行。

### 研究材料

```text
make lint
```

- 558 个 Markdown 文件通过 front-matter、内部链接和知识库检查。
- 新研究包 7 个 Markdown 文件单独检查，无相对死链和尾随空白。

```text
make check
```

- harness check：0 error，0 warning；
- harness offline eval：10/10；
- learnings、sources 和目录索引均为最新；
- pytest：479 passed；
- render-test：全部通过；
- shellcheck 门禁通过。

```text
git diff --check
```

- 通过，无空白错误。

### 未覆盖风险

- 未执行各项目真实模型调用、视频处理或云端 E2E；
- 未验证论文准确率与性能数字；
- 未下载 Git LFS 模型/媒体实体；
- 未对未知许可证项目做代码复用判断；
- 未用同一全智评样本做跨项目质量对比。
