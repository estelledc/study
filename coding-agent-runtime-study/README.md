# Coding Agent Runtime 源码研究材料包

**日期：** 2026-07-16

**范围：** Codex、Gemini CLI、Grok Build、OpenCode、Pi

**明确排除：** CSSwitch

**研究方式：** 固定本地源码快照，连续三轮研究正常链路、失败恢复、扩展与能力边界

## 先看结论

这五个项目都能接收自然语言、调用模型、执行工具，但它们代表了五种不同的工程重心：

| 项目 | 一句话定位 | 最值得学习的部分 |
|---|---|---|
| Codex | 把 CLI、桌面端、IDE 和扩展统一到同一个线程/会话内核 | 请求级上下文快照、权限与沙箱、工具路由、持久化线程 |
| Gemini CLI | 把模型流和工具执行调度器分开，并显式建模政策、确认和子 Agent | `GeminiClient`、`Turn`、`Scheduler`、`PolicyEngine` |
| Grok Build | 把会话做成长期运行的 actor，纵向集成记忆、MCP、hooks、后台任务和多种入口 | `SessionActor` 的事件循环与完整 Agent turn |
| OpenCode | 同时维护成熟产品运行时和事件溯源式 V2 内核 | durable input、事件投影、权限请求、工具结算与迁移边界 |
| Pi | 故意保留一个小而透明的 Agent loop，把复杂工作流交给扩展 | 双层循环、事件流、provider 适配、JSONL 会话树 |

最重要的横向结论不是“谁最好”，而是：

> Agent loop 只是发动机。一个可长期使用的 coding agent 还需要输入队列、上下文装配、工具政策、并发与取消、持久化、压缩、扩展和可观察性。

## 阅读入口

先读 [最终接班页](00-final-reader-map.md)。它是三轮研究完成后的唯一当前入口，提供：

- **必读**：正常路径、失败路径和能力边界，约 45 分钟。
- **补读**：遇到具体设计、故障或项目问题时再查。
- **暂不读**：没有明确问题时，不逐行展开五个大型主循环，也不继续增加项目。

## 完整材料目录

1. [最终接班页](00-final-reader-map.md)：10 分钟总览、三档路线、问题路由与停止条件。
2. [领域地图](01-field-map.md)：建立共同词汇和整体架构。
3. [核心循环对比](02-core-loop-deep-dive.md)：用同一条“用户输入到工具结果”的链路看五种实现。
4. [Codex](03-codex.md)：理解大型线程/会话内核。
5. [Gemini CLI](04-gemini-cli.md)：理解模型流和工具调度分层。
6. [Grok Build](05-grok-build.md)：理解 actor 化的纵向集成 runtime。
7. [OpenCode](06-opencode.md)：理解事件溯源和双运行时迁移。
8. [Pi](07-pi.md)：回到最容易读懂的最小 Agent harness。
9. [横向比较与思考题](08-comparison-and-thinking.md)：检查是否能解释设计取舍。
10. [Round 2：失败、取消与恢复状态机](09-round2-reliability-failure-state-machine.md)：理解异常路径如何收敛。
11. [Round 2：可靠性源码追踪卡](10-round2-source-trace-cards.md)：按单一故障变量复查五个项目。
12. [Round 3：扩展、子 Agent 与能力边界](11-round3-extension-subagent-capability-map.md)：理解能力如何进入并被裁剪。
13. [Round 3：参考架构与进阶思考](12-round3-reference-architecture-and-thinking.md)：把三轮结论转成设计与评审方法。

旧章节末尾的精读列表是阶段性源码定位记录，不再作为默认阅读顺序。当前路线统一以最终接班页为准。

## 本轮学习目标

读完后，应能不用背文件名地回答：

1. 为什么不能把 coding agent 简化成 `while (model wants tool) execute tool`？
2. steering、follow-up 和普通下一轮输入有什么不同？
3. 工具“出现在模型 schema 中”“通过权限检查”“真实执行成功”为什么是三个阶段？
4. transcript、session state、compaction summary 和 memory 为什么不能混为一谈？
5. 什么情况下适合最小内核加扩展，什么情况下需要中心化 runtime？
6. error、cancel、deny 和 recoverable transition 为什么必须分开？
7. 如何让每个 model/tool/subagent 实体 exactly once 进入终态？
8. Skill、Tool、MCP、Plugin、Provider 和 Subagent 的信任边界分别是什么？
9. 子 Agent 的有效能力为什么应由多层限制求交集？
10. 怎样从五个项目提炼一套有界、可恢复的参考架构？

## 证据规则

材料使用三种标记：

- **源码事实**：固定提交中的代码或仓库文档直接支持。
- **工程解释**：根据控制流解释“为什么这样设计”，不冒充维护者原话。
- **未覆盖边界**：当前只读研究没有运行真实模型、构建全仓或验证线上服务行为。

源码路径均相对于本地固定快照 `explorations/research/repos/<repo>/`。行号只对下列提交有效：

| 项目 | 固定提交 | 追踪文件数 | 工作树 |
|---|---|---:|---|
| Codex | `800715d` | 5,530 | clean |
| Gemini CLI | `3ff5ba2` | 2,919 | clean |
| Grok Build | `b189869` | 2,715 | clean |
| OpenCode | `4a760b5` | 6,280 | clean |
| Pi | `c6d83715` | 1,042 | clean |

## 研究边界

- 没有修改五个上游源码副本。
- 没有登录 provider、发送真实模型请求或执行产品级 E2E。
- 没有用文件数、代码量或功能数量做产品质量排名。
- OpenCode 与 Gemini CLI 都存在新旧运行路径并存的迁移状态，正文会分别说明。
- Grok Build 是从内部 monorepo 定期同步的公开快照；公开仓库不等于完整线上系统。
- Round 2/3 仍是静态源码研究；没有用真实取消竞态、崩溃注入或远程子 Agent E2E 验证线上行为。

## 后续学习方式

本材料已经完成“Agent 先研究、再整理、最后留思考点”的前置工作。阅读时不需要先补搜索任务：

1. 先按[最终接班页](00-final-reader-map.md)定位问题，再读对应章节。
2. 遇到不懂的概念，指出段落或问题即可继续追问。
3. 需要真正精读源码时，再从章节末尾的推荐入口选择一个文件，每次约 30-50 行。
4. 思考题不是额外知识点，正文已经提供回答所需证据。
