---
title: "研究范围与项目清单"
sidebar:
  hidden: true
---
# 研究范围与项目清单

## 研究问题

本轮不是做 GitHub 项目大全，而是回答五个可收口的问题：

1. DeepTutor 所处的 Agentic AI Tutor 技术栈有哪些层？
2. 哪些开源项目与它存在代码依赖、论文对照或明确设计关系？
3. 每个入选项目的核心运行链、状态边界和扩展点是什么？
4. DeepTutor 相比其他方案在哪些地方更完整，代价是什么？
5. 后续应该沿哪些源码路径继续学习？

## 纳入标准

项目满足至少一项强关系，并通过基本可研究性检查：

- DeepTutor 当前源码真实使用或支持的组件；
- DeepTutor README 明确致谢的能力来源；
- DeepTutor 论文直接讨论的开源教学系统或同类研究；
- 能补齐 learner model、memory、RAG、research、visualization 等关键技术层；
- 仓库公开、可 clone，并且存在可识别的核心代码而不只是宣传页。

同时优先选择：

- canonical 原仓库而非二次 fork；
- 有 README、代码入口和测试目录；
- 最近仍有维护，或虽不活跃但具有明确研究代表性；
- 能与其他项目形成有意义的架构对比。

## 14 个正式研究对象

### 2026-07-16 GitHub 活跃度快照

star 只用于判断社区关注度，不代表技术质量。`最近 push` 也只能证明仓库有更新，不能证明所有主链都在持续维护。

| 项目 | 约 star | 最近 push | 许可证 |
|---|---:|---|---|
| DeepTutor | 26.7k | 2026-07-09 | Apache-2.0 |
| Open TutorAI CE | 78 | 2026-06-26 | BSD-3-Clause |
| GenMentor | 76 | 2025-12-03 | CC0-1.0 |
| Tutor-GPT | 913 | 2026-02-20 | GPL-3.0 |
| nanobot | 45.7k | 2026-07-16 | MIT |
| AutoAgent | 9.5k | 2025-10-16 | MIT |
| AI-Researcher | 5.6k | 2025-10-16 | GitHub 未识别标准许可证 |
| ManimCat | 389 | 2026-07-12 | GitHub 标记为 Other |
| LlamaIndex | 50.9k | 2026-07-16 | MIT |
| LightRAG | 37.7k | 2026-07-15 | MIT |
| RAG-Anything | 22.2k | 2026-07-09 | MIT |
| GraphRAG | 34.5k | 2026-07-16 | MIT |
| PageIndex | 34.1k | 2026-07-16 | MIT |
| Mem0 | 61.0k | 2026-07-16 | Apache-2.0 |

### A. 完整或代表性教学系统

| 项目 | 入选原因 | 主要观察角度 |
|---|---|---|
| [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) | 主研究对象；agent-native personalized tutoring | 统一运行时、capability、知识库、可审计记忆、学习闭环 |
| [Open-TutorAi/open-tutor-ai-CE](https://github.com/Open-TutorAi/open-tutor-ai-CE) | 开源教学平台；DeepTutor 论文相关工作 | Clean Architecture、多模型/RAG、教学产品域建模 |
| [GeminiLight/gen-mentor](https://github.com/GeminiLight/gen-mentor) | WWW 2025 goal-oriented ITS 代码 | 技能差距、学习者模型、学习路径、内容与测验链 |
| [plastic-labs/tutor-gpt](https://github.com/plastic-labs/tutor-gpt) | Theory-of-Mind 个性化教学代表 | Empath/Honcho/PDF/Tutor 协作、心理表示、苏格拉底提示 |

### B. Agent 运行时与专业能力

| 项目 | 入选原因 | 主要观察角度 |
|---|---|---|
| [HKUDS/nanobot](https://github.com/HKUDS/nanobot) | DeepTutor 原 TutorBot 的轻量 Agent 引擎来源 | 状态机 Agent loop、消息总线、工具、技能、记忆、channel |
| [HKUDS/AutoAgent](https://github.com/HKUDS/AutoAgent) | DeepTutor README 明确致谢 | 自动创建 Agent/工具/workflow、动态编排 |
| [HKUDS/AI-Researcher](https://github.com/HKUDS/AI-Researcher) | DeepTutor research capability 的直接参考 | survey、idea、experiment、judge、paper writing 多 Agent 流程 |
| [Wing900/ManimCat](https://github.com/Wing900/ManimCat) | DeepTutor Math Animator 明确致谢 | 自然语言到 Manim 代码、执行、错误修复和视频产物 |

### C. 知识摄取、检索与记忆基础设施

| 项目 | 入选原因 | 主要观察角度 |
|---|---|---|
| [run-llama/llama_index](https://github.com/run-llama/llama_index) | DeepTutor 默认 RAG/索引骨架 | ingestion、index、retriever、query engine、海量 integration |
| [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) | DeepTutor 可选知识库引擎 | 轻量知识图谱、存储抽象、混合检索 |
| [HKUDS/RAG-Anything](https://github.com/HKUDS/RAG-Anything) | DeepTutor LightRAG 多模态解析依赖 | PDF/Office 解析、图表公式理解、跨模态图索引 |
| [microsoft/graphrag](https://github.com/microsoft/graphrag) | DeepTutor 可选知识库引擎 | 离线索引工作流、社区摘要、local/global/DRIFT 查询 |
| [VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex) | DeepTutor 可选知识库引擎 | 长文档语义树、无向量 reasoning retrieval |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 通用长期 Agent memory 对照 | 事实抽取、实体关联、向量/BM25/实体融合检索 |

## 候选池与未纳入原因

以下项目或论文在广度搜索中出现，但不进入本轮逐仓精读：

| 候选 | 状态 | 原因 |
|---|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | 只登记 | DeepTutor 的 channel/skill 生态灵感，范围远大于教学核心 |
| [OpenAI Codex](https://github.com/openai/codex) | 复用既有研究 | 影响 CLI/agent-native 工作流，但不是教学系统；本仓已有独立源码研究 |
| Claude Code | 只登记 | DeepTutor README 提到 Agent loop 灵感，但公开仓库不是完整实现源码 |
| [MentorAI](https://github.com/CodeExplorerRay/MentorAI) | 候选 | 有五 Agent 教学流程，但研究代表性和工程成熟度低于正式样本 |
| [adaptive-genai-learning-tutor](https://github.com/dglabsxyz/adaptive-genai-learning-tutor) | 候选 | 很好的 deterministic grading/HITL demo，但属于 bootcamp 型垂直样例 |
| [Adaptive Knowledge Graph in Education](https://github.com/MysterionRise/adaptive-knowledge-graph) | 候选 | KG、BKT、IRT 方向有价值，但当前更接近特定数据集 PoC |
| AgentTutor、VTutor、SocratiQ、PAPPL | 论文候选 | 可用于后续论文研究；本轮没有把所有论文原型都扩为源码仓库 |
| EduChat | 历史候选 | 教育大模型方向重要，但与本轮“Agentic personalized tutoring runtime”主链较远 |

这不是断言它们“不好”，而是将本轮控制为一个能逐仓验证的固定样本。后续如果要研究知识追踪、虚拟人、语音教学或教育大模型训练，可单独开启新专题。

## 本地 clone 约束

所有第三方项目都遵守本仓约定：

- 放在 `projects/<name>/`，每个目录保留自己的 `.git`；
- `origin` 指向个人 fork，`upstream` 指向原仓库；
- 父仓 `.gitignore` 对每个路径精确忽略；
- 第三方源码只读，不把研究笔记写进 clone；
- 本轮新增大仓库使用 `--depth=1 --filter=blob:none`，控制本地磁盘；
- GitHub fork 保留服务端历史，本地以固定 commit 作为研究快照；
- 研究结论写入当前目录，由父仓跟踪。

## 证据等级

材料中的判断按以下证据优先级形成：

1. 实际源码、配置、测试和本地 Git 状态；
2. 项目 README、官方文档和论文；
3. GitHub 仓库元数据；
4. 搜索结果中的候选描述。

README 中的 roadmap 或 target architecture 不会当成“已经实现”。例如 Open TutorAI README 同时给出 Current Architecture 和 Target Agentic Flow，本材料只把后者视为设计方向。
