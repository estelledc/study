---
title: "Coding Agent Runtime 最终接班页"
sidebar:
  hidden: true
---
# Coding Agent Runtime 最终接班页

**状态：** 三轮静态源码研究已完成；2026-07-17 已补快照增量审计与 E2 教学实验

**范围：** Codex、Gemini CLI、Grok Build、OpenCode、Pi

**排除：** CSSwitch

## 10 分钟先读这里

五个项目的共同结论可以压成一句话：

> Agent loop 只是“模型与工具反复交互”的发动机；可长期使用的 coding agent 还必须管理输入时机、请求快照、工具终态、权限、持久化、恢复、扩展和子 Agent 能力。

只记下面七条：

1. **Turn、Agent run、Session 是三种生命周期。**
   - Turn：一次模型请求及直接响应。
   - Agent run：一个用户输入引发的多轮模型与工具循环。
   - Session / Thread：跨多个用户输入持续存在的状态容器。

2. **运行中新输入必须区分 steer 与 queue。**
   - steer：当前任务下一次模型调用前纠偏。
   - queue / follow-up：当前任务结束后追加工作。
   - 取消当前 turn 不应自动删除后续 queue。

3. **一次请求必须使用一致的能力快照。**
   - 模型看到的 cwd、规则、工具 schema、权限与执行 handler 必须属于同一版本。
   - Codex 的 `StepContext`、OpenCode 的 tool identity 都在解决这类竞态。

4. **工具调用必须 exactly once 进入终态。**
   - `success / error / cancelled / uncertain` 只能有一个权威结果。
   - cancel 是停止信号，不会自动撤销已经发生的副作用。

5. **error、cancel、deny、recoverable transition 不能混用。**
   - error：执行失败。
   - cancel：用户或上层中止。
   - deny：政策或人工拒绝。
   - recoverable：压缩、刷新认证或暂态重试后可继续。

6. **能力来源必须经过“发现 → 信任 → 归一化 → 裁剪 → 物化”。**
   - Skill、Tool、MCP、Plugin、Provider、Subagent 不是同一种扩展。
   - 子 Agent 的有效能力应做多层交集，不应复制父能力后再追加。

7. **完整历史与活动上下文必须分开。**
   - transcript / event log 用于审计和恢复。
   - compaction summary 只服务下一上下文窗口。
   - memory 只保存跨任务稳定事实。

## 五个项目各学什么

| 项目 | 最适合学习 | 不要先学 |
|---|---|---|
| Pi | 最透明的双层 Agent loop、JSONL 会话树、扩展式产品层 | 不要把“无内置权限/MCP/子 Agent”误解成完整安全方案 |
| Gemini CLI | `Turn` 与 `Scheduler` 分层、policy/confirmation 状态机、子 Agent 工具化 | 不要把迁移期任一 non-interactive 路径当唯一实现 |
| Codex | Thread/Session 内核、请求快照、工具唯一终态、rollout 恢复 | 不要只读 `CodexThread` 门面就推断完整循环 |
| OpenCode | durable input、事件投影、tool settlement、渐进式 V2 迁移 | 不要把 V2 TODO 写成已完成能力 |
| Grok Build | Session actor、细粒度工具并发、MCP/memory/subagent 纵向集成 | 不要一开始复制它的全部复杂度 |

## 三轮研究地图

| 轮次 | 解决的问题 | 主入口 |
|---|---|---|
| Round 1：正常路径 | 用户输入如何经过模型、工具并返回结果 | [核心循环](02-core-loop-deep-dive.md) |
| Round 2：失败路径 | 取消、拒绝、超时、溢出和崩溃后怎样收敛 | [可靠性状态机](09-round2-reliability-failure-state-machine.md) |
| Round 3：能力边界 | 扩展与子 Agent 如何进入、继承、裁剪和退出 | [能力地图](11-round3-extension-subagent-capability-map.md) |
| 最终提炼 | 如何把五种实现转成自己的架构与评审清单 | [参考架构](12-round3-reference-architecture-and-thinking.md) |

## 三档阅读路线

### 必读：约 45 分钟

1. 本页。
2. [零基础 Agent loop 实验](13-beginner-runtime-lab.md)。
3. [领域地图](01-field-map.md)。
4. [核心循环](02-core-loop-deep-dive.md)。
5. [可靠性状态机](09-round2-reliability-failure-state-machine.md)。
6. [能力地图](11-round3-extension-subagent-capability-map.md)。

目标：能解释正常路径、失败路径和能力边界，不要求记文件名。

### 补读：遇到设计任务时

- 设计新 Agent runtime：读[最终参考架构](12-round3-reference-architecture-and-thinking.md)。
- 设计失败测试：读[可靠性源码追踪卡](10-round2-source-trace-cards.md)。
- 比较五项目取舍：读[横向比较](08-comparison-and-thinking.md)。
- 评估某个具体项目：读对应项目章 `03` 至 `07`。

### 暂不读：没有具体问题时

- 不逐行读五个大型主循环。
- 不继续横向增加新项目。
- 不把文件数、功能数或 prompt 长度做排行榜。
- 不在没有真实复现目标时启动 provider、MCP 或子 Agent E2E。

## 问题路由

| 你的问题 | 直接跳转 |
|---|---|
| 为什么模型会连续调用多次工具？ | [核心循环](02-core-loop-deep-dive.md) |
| 用户中途发消息应该插到哪里？ | [领域地图](01-field-map.md)的 Steering / Follow-up |
| cancel 和 error 有什么区别？ | [可靠性状态机](09-round2-reliability-failure-state-machine.md) |
| 工具成功与取消同时到达怎么办？ | [Round 2 Codex 卡片](10-round2-source-trace-cards.md) |
| 进程崩溃后 running tool 怎么处理？ | [Round 2 OpenCode 卡片](10-round2-source-trace-cards.md) |
| Plugin、MCP、Skill 有什么本质区别？ | [Round 3 六种扩展](11-round3-extension-subagent-capability-map.md) |
| 子 Agent 为什么不能继承全部权限？ | [能力继承](11-round3-extension-subagent-capability-map.md) |
| 我要自己设计 runtime，最少实现什么？ | [最小实现路线](12-round3-reference-architecture-and-thinking.md) |
| 我要做架构评审，应该问什么？ | [架构评审问题](12-round3-reference-architecture-and-thinking.md) |

## 最终参考模型

```text
Input admission
  → Session ownership
  → Capability compiler
  → Context compiler
  → Provider runtime
  → Event normalizer
  → Tool settlement
  → Continuation router
  → Persistence / projections
```

其中最值得优先工程化的三个点：

1. **Request snapshot**：模型看到的能力与执行时一致。
2. **Tool settlement**：每个副作用有唯一、可恢复的终态。
3. **Durable input**：长任务或多客户端场景下输入不丢、不重复。

## 证据边界

本材料能证明：

- 固定提交中的源码结构和控制流；
- 五个项目在正常、失败、扩展路径上的实现差异；
- 可从源码归纳出的工程模式与风险。
- 2026-07-17 的远端增量是否命中核心研究路径；
- 无模型教学 loop 的正常 continuation、重复 call ID、未知工具和 turn budget 四个 E2 测试通过。

本材料不能证明：

- 当前线上产品与固定提交完全一致；
- 真实 provider、MCP、远程子 Agent 和桌面端 E2E 一定符合静态推断；
- 某项目整体质量优于另一个项目。

特别边界：

- Gemini CLI 与 OpenCode 都有新旧运行路径并存。
- Grok Build 是内部 monorepo 的公开同步快照。
- Codex 当前 main 的 full-history fork 与 child model/reasoning 规则已不同于固定提交，Round 3 细节必须绑定版本。
- 本轮没有运行真实取消竞态、崩溃注入和远程子 Agent 验收。

## 停止条件

本研究在以下状态收尾：

- 五个源码仓固定提交已登记并保持 clean。
- 正常链路、失败链路、能力边界均有跨项目材料。
- 关键结论有源码路径或明确的推断标记。
- 思考题都能从正文找到依据。
- 资料包通过 Markdown、链接和全仓门禁。

后续只有三种合法重启方式：

1. 用户对某个概念明确提问。
2. 出现真实 coding-agent 设计或故障，需要回查对应机制。
3. 固定上游新版本后，围绕一个已定义差异做版本研究。

“再广泛看看更多项目”本身不构成下一轮目标。

## 收尾自测

1. 为什么 Agent loop 不能等同于完整 Agent runtime？
2. 为什么取消不能覆盖已经完成的工具结果？
3. 为什么 compaction summary 不能保存或扩大 approval？
4. 为什么 project trust、tool allowlist 和 sandbox 是三层不同边界？
5. 为什么子 Agent 能力应该求交集？
6. 如果只能先做一个可靠性机制，你会选择 request snapshot、tool settlement 还是 durable input？依据是什么？

答不出来时按“问题路由”回到对应章节，不重新做全量研究。
