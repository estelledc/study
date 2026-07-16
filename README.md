# 研究别人的

这里放 canonical source 属于别人的研究对象：第三方源码、论文、外部工具或工作流，以及围绕它们写的观察笔记。

## 当前内容

| 内容 | 类型 | 边界 |
|---|---|---|
| [repos](repos/README.md) | 第三方源码 clone | 上游本体不进父仓，只保留项目卡和恢复信息 |
| [multimodal-papers](multimodal-papers/) | 论文原文与中文材料包 | 被真实任务使用并消化后才回流长期知识 |
| [Agent Mail CLI](agent-mail-cli.md) | 外部工具观察 | 只保留脱敏后的使用结论 |
| [ChatGPT GitHub devspace / MCP 选择](chatgpt-github-devspace-mcp-selection.md) | 外部产品研究 | 结论可能随产品变化，使用前重新核对 |
| [中国独立开发者列表源码研究](chinese-independent-developer-study/README.md) | 社区内容仓库与自动化治理 | 固定快照概览；后续按提交处理链路精读 |
| [Coding Agent Runtime 源码研究材料包](coding-agent-runtime-study/README.md) | 五项目源码对比 | 固定快照研究；排除 CSSwitch，后续按章节精读 |
| [Lark iOS monorepo 历史报告](lark-ios-monorepo-report.md) | 外部代码库背景 | 仅本机保存，不替代当前源码证据 |
| [ResearchStudio 架构观察](researchstudio-architecture-overview.md) | 外部源码观察 | 可复用方法再回流 `learnings/` |
| [ResearchStudio 本地部署记录](researchstudio-local-deploy-notes.md) | 外部工具运行记录 | 不把一次运行结果当成长期事实 |
| [Provider 切换与本地控制面最终综合](switch-tools-study/00-final-synthesis.md)（[完整学习包](switch-tools-study/README.md)） | CSSwitch / CC Switch 联合源码研究 | 已收尾为 reference；固定提交、静态证据，不等同于真机或真实 provider 验收 |

## 回流规则

1. 没有当前任务或明确缺口时，只保留 reference 入口。
2. 只有形成自己的机制解释、误区和验证证据后，才提炼到 `learnings/`。
3. 具体故障与根因进入 `problems/`；当天研究事实进入 `daily/`。
4. 自己搭建的阅读站、实验或交付物放 [`own/`](../own/README.md)，即使它研究外部资料。

[返回探索总览](../README.md)
