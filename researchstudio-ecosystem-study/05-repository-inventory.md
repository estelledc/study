# 05. 仓库清单、版本与本地约束

## 1. 总体结果

- 语料集：27 个仓库。
- fork 所有者：`estelledc`。
- 本地位置：`explorations/research/repos/<slug>`。
- clone 形式：独立 Git 仓库、`--depth=1 --single-branch --filter=blob:none --sparse`；已有 ResearchStudio 保留原 clone 和本地产物。
- 远端约定：`origin` 指向个人 fork，`upstream` 指向原项目。
- 父仓约定：只跟踪研究材料和 `_meta` 卡，不跟踪第三方源码。
- 大目录：默认不完整 materialize；出现具体研究问题时用 `git sparse-checkout add <path>` 按需展开。

## 2. 逐仓清单

| 类别 | 项目 | 上游 | pinned commit | 许可证快照 |
|---|---|---|---|---|
| 核心 | ResearchStudio | [microsoft/ResearchStudio](https://github.com/microsoft/ResearchStudio) | `61277686638a` | MIT |
| 索引 | awesome-ai-auto-research | [worldbench/awesome-ai-auto-research](https://github.com/worldbench/awesome-ai-auto-research) | `6b4386c0440c` | MIT |
| 全生命周期 | AI-Scientist | [SakanaAI/AI-Scientist](https://github.com/SakanaAI/AI-Scientist) | `1de1dbc1f4ee` | 自定义 / 需复核 |
| 全生命周期 | AI-Scientist-v2 | [SakanaAI/AI-Scientist-v2](https://github.com/SakanaAI/AI-Scientist-v2) | `96bd51617cfd` | 自定义 / 需复核 |
| 全生命周期 | AI-Researcher | [HKUDS/AI-Researcher](https://github.com/HKUDS/AI-Researcher) | `f9a6f8480860` | 未检测到清晰 SPDX |
| 全生命周期 | AgentLaboratory | [SamuelSchmidgall/AgentLaboratory](https://github.com/SamuelSchmidgall/AgentLaboratory) | `d9017d90e329` | MIT |
| 选题 | Idea2Paper | [AgentAlphaAGI/Idea2Paper](https://github.com/AgentAlphaAGI/Idea2Paper) | `64170d4d9ca9` | MIT |
| 全生命周期 | AutoResearchClaw | [aiming-lab/AutoResearchClaw](https://github.com/aiming-lab/AutoResearchClaw) | `e2e23c93b494` | MIT |
| 运行时 | FAROS | [OpenNSWM-Lab/FAROS](https://github.com/OpenNSWM-Lab/FAROS) | `1a554f0e4539` | 未检测到清晰 SPDX |
| 治理 | AutoR | [AutoX-AI-Labs/AutoR](https://github.com/AutoX-AI-Labs/AutoR) | `9e2820f35cd8` | 未检测到清晰 SPDX |
| 全生命周期 | InternAgent | [InternScience/InternAgent](https://github.com/InternScience/InternAgent) | `b8a9e81642e0` | 自定义 / 需复核 |
| 假设系统 | Co-Scientist | [Kaimen-Inc/Co-Scientist](https://github.com/Kaimen-Inc/Co-Scientist) | `b28717b7f94a` | Apache-2.0 |
| 全生命周期 | nano-scientist | [AI4Scientist/nano-scientist](https://github.com/AI4Scientist/nano-scientist) | `7132192f6e03` | 未检测到清晰 SPDX |
| 证据 | PaperQA2 | [Future-House/paper-qa](https://github.com/Future-House/paper-qa) | `d7675d7b7edd` | Apache-2.0 |
| 证据 | STORM | [stanford-oval/storm](https://github.com/stanford-oval/storm) | `fb951af7744d` | MIT |
| 检索 | paper-search-mcp | [openags/paper-search-mcp](https://github.com/openags/paper-search-mcp) | `c8b642183bb7` | MIT |
| Skills | AI-Research-SKILLs | [Orchestra-Research/AI-Research-SKILLs](https://github.com/Orchestra-Research/AI-Research-SKILLs) | `773a52944ba4` | MIT |
| Skills | scientific-agent-skills | [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills) | `3f825caafe14` | MIT |
| Artifact | Agent-Native-Research-Artifact | [ARA-Labs/Agent-Native-Research-Artifact](https://github.com/ARA-Labs/Agent-Native-Research-Artifact) | `85face753889` | MIT |
| Poster | Paper2Poster | [Paper2Poster/Paper2Poster](https://github.com/Paper2Poster/Paper2Poster) | `623d042f283a` | MIT |
| Poster | PosterGen | [Y-Research-SBU/PosterGen](https://github.com/Y-Research-SBU/PosterGen) | `8a54325f871e` | MIT |
| Video | Paper2Video | [showlab/Paper2Video](https://github.com/showlab/Paper2Video) | `47beb503e242` | MIT |
| Slides | Paper2Slides | [HKUDS/Paper2Slides](https://github.com/HKUDS/Paper2Slides) | `0785051d1f52` | MIT |
| Slides | ppt-master | [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) | `3df9aef3a76a` | MIT |
| Figure | PaperBanana | [dwzhu-pku/PaperBanana](https://github.com/dwzhu-pku/PaperBanana) | `836455537e86` | Apache-2.0 |
| Poster skill | posterly | [Chenruishuo/posterly](https://github.com/Chenruishuo/posterly) | `0546445bd5c2` | AGPL-3.0 |
| 多渠道 | paper2anything | [QuZhan51496/paper2anything](https://github.com/QuZhan51496/paper2anything) | `72bf82dfe7bc` | Apache-2.0 |

许可证列只是仓库快照的机器可见结果，不构成法律意见。标为“未检测到”或“自定义”的项目，在复制代码前必须重新阅读 LICENSE 和上游说明。

## 3. 本地 clone 约束

### 为什么不把源码提交进 intern-journal

每个第三方项目有自己的 Git 历史、许可证和依赖。父仓只保存：

- 项目卡。
- pinned commit。
- fork / upstream 关系。
- 消化后的研究结论。

这样不会出现嵌套仓库被误暂存、上游源码污染日志或本机运行产物进入 portable repo。

### 为什么使用浅层、部分、稀疏 clone

27 个上游 GitHub API 标称体积合计约 3.27 GiB，部分项目还含数据、模型、评测依赖或 vendored 代码。当前策略先保留：

- 当前主分支提交。
- 完整 Git 对象按需下载能力。
- 根目录文档和已选择的核心源码目录。

需要历史时：

```bash
git -C explorations/research/repos/<slug> fetch --unshallow upstream
```

需要额外目录时：

```bash
git -C explorations/research/repos/<slug> sparse-checkout add <path>
```

### ResearchStudio 的特殊边界

ResearchStudio 是此前已有 clone，保留：

- `.venv311/`
- `papers/`
- `runs/`
- 本地 bridge 与辅助脚本

这些内容通过该仓库自己的 `.git/info/exclude` 隔离，不进入个人 fork，也不保证新机器自动恢复。

### 中断的额外 materialize

AI-Researcher 和 ppt-master 的大目录按需展开触发长时间延迟取包，本轮停止了该非必要操作。两者：

- 仓库、HEAD、origin、upstream 和浅层历史均有效。
- 根目录资料可读。
- 需要精读某一子目录时再单独 `sparse-checkout add`，避免一次拉取全部大对象。

## 4. 远端约定

```text
origin   git@github.com:estelledc/<fork>.git
upstream https://github.com/<original-owner>/<repo>.git
```

日常更新应先：

```bash
git -C explorations/research/repos/<slug> fetch upstream
```

本轮没有向个人 fork 推送本地代码改动；fork 仅用于保存个人远端副本和后续独立研究分支。

## 5. 恢复与验证

每个仓库都有 `explorations/_meta/*.md` 项目卡。父仓的结构审计：

```bash
python3 scripts/explorations/restore-projects.py --audit
```

单仓验证：

```bash
git -C explorations/research/repos/<slug> status --short --branch
git -C explorations/research/repos/<slug> remote -v
git -C explorations/research/repos/<slug> rev-parse HEAD
```

研究结论必须绑定 pinned commit；更新 upstream 后，先检查 diff，再决定材料是否需要刷新。
