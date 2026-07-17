# 研究别人的

这里放 canonical source 属于别人的研究对象：第三方源码、论文、外部工具或工作流，以及围绕它们写的观察笔记。

## 当前内容

| 内容 | 类型 | 边界 |
|---|---|---|
| [第三方源码深度研究重做计划](research-refresh-program/README.md) | 14 类 / 201 个唯一上游的研究合同 | 14/14 已验收；零基础从学习地图进入，机器审计冻结成员与证据口径 |
| [14 类零基础学习地图](research-refresh-program/beginner-learning-map.md) | 按问题选择路线、实验和掌握标准 | 不顺序扫 147 篇专题；每次只完成一个 30 分钟入口和迁移题 |
| [repos](repos/README.md) | 第三方源码 clone | 上游本体不进父仓，只保留项目卡和恢复信息 |
| [multimodal-papers 归档](../../archive/multimodal-papers-2026-06/ARCHIVE-NOTE.md) | 历史论文原文与中文材料包 | 已归档；日常从 `sources/articles/multimodal-papers/` 来源卡进入 |
| [Agent Mail CLI](agent-mail-cli.md) | 外部工具观察 | 只保留脱敏后的使用结论 |
| [ChatGPT GitHub devspace / MCP 选择](chatgpt-github-devspace-mcp-selection.md) | 外部产品研究 | 结论可能随产品变化，使用前重新核对 |
| [中国独立开发者列表源码研究](chinese-independent-developer-study/README.md) | 社区内容仓库与自动化治理 | 固定快照概览；后续按提交处理链路精读 |
| [Coding Agent Runtime 源码研究材料包](coding-agent-runtime-study/README.md) | 五项目源码对比 | 固定快照研究；排除 CSSwitch，后续按章节精读 |
| [Lark iOS monorepo 历史报告](lark-ios-monorepo-report.md) | 外部代码库背景 | 仅本机保存，不替代当前源码证据 |
| [ResearchStudio 架构观察](researchstudio-architecture-overview.md) | 外部源码观察 | 可复用方法再回流 `learnings/` |
| [ResearchStudio 本地部署记录](researchstudio-local-deploy-notes.md) | 外部工具运行记录 | 不把一次运行结果当成长期事实 |
| [ResearchStudio 生态系统研究](researchstudio-ecosystem-study/README.md) | 27 个项目的广度与深度对比 | 固定 fork / commit 快照；按问题继续精读 |
| [DeepTutor 与 Agentic AI Tutor 生态研究](deeptutor-ecosystem-study/README.md) | 14 个 Tutor、RAG、Memory 与可视化项目 | 区分论文旧版、当前 Turn runtime 与规划中能力；静态研究不替代产品运行验收 |
| [Garden Skills 与 Agent Skills 工程生态研究](agent-skills-ecosystem-study/README.md) | 20 个规范、集合、市场、Harness、安全、评测与优化项目 | 全部 fork；固定 commit；第三方源码只读；自动评测与安全结论均保留证据边界 |
| [MinerU 与文档解析生态系统研究](mineru-ecosystem-study/README.md) | 19 个解析器、专家模型、VLM、ETL 与评测项目 | 全部 fork；浅层稀疏 clone；固定 commit；静态源码证据不等同于模型运行验收 |
| [LambChat 与生产级 Agent 平台生态研究](lambchat-ecosystem-study/README.md) | 14 个 harness、产品平台、治理控制面与执行底座项目 | 全部 fork / clone；固定 commit；区分源码已验证、项目自述、规划中能力与研究判断 |
| [Hermes Agent 生态系统研究](hermes-agent-ecosystem-study/README.md) | 22 个长期个人 Agent / harness 项目的广度与深度对比 | 全部 fork 到个人 GitHub；本地为固定 commit 的独立浅层稀疏 clone |
| [Trellis 与 Coding Agent Harness 生态研究](trellis-agent-harness-ecosystem-study/README.md) | 17 个 SDD、上下文、记忆与治理项目 | 全部 fork；浅层稀疏 clone；固定 commit；第三方源码不进入父仓 |
| [LangGraph 生态系统研究](langgraph-ecosystem-study/README.md) | 21 个 runtime、harness、应用、部署和同类框架对比 | 固定 upstream commit；区分 graph 原语与生产外围能力 |
| [FastVLM 与端侧高效 VLM 生态系统研究](fastvlm-ecosystem-study/README.md) | 21 个视觉骨干、端侧模型、运行时、应用与 token 效率项目 | 全部 fork；浅层稀疏 clone；区分静态源码证据、作者指标与未执行真机验证 |
| [多模态视频 AI 开源生态研究](multimodal-video-ai-open-source-study/README.md) | 9 个视频 Agent、RAG、长视频推理与垂直评价项目 | 全部 fork / clone；固定 commit；对照全智评，区分源码事实与未运行的模型、云服务 E2E |
| [系统提示词泄露生态研究](system-prompt-leak-ecosystem-study/README.md) | 17 个档案、平台与抽取研究项目 | 固定 fork / commit 快照；prompt 内容按不可信数据处理 |
| [Provider 切换与本地控制面最终综合](switch-tools-study/00-final-synthesis.md)（[完整学习包](switch-tools-study/README.md)） | CSSwitch / CC Switch 联合源码研究 | 已收尾为 reference；固定提交、静态证据，不等同于真机或真实 provider 验收 |

## 回流规则

1. 没有当前任务或明确缺口时，只保留 reference 入口。
2. 只有形成自己的机制解释、误区和验证证据后，才提炼到 `learnings/`。
3. 具体故障与根因进入 `problems/`；当天研究事实进入 `daily/`。
4. 自己搭建的阅读站、实验或交付物放 [`own/`](../own/README.md)，即使它研究外部资料。

[返回探索总览](../README.md)
