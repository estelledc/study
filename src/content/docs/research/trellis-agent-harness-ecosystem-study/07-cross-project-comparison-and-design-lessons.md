---
title: "07. 跨项目对比与设计启示"
sidebar:
  hidden: true
---
# 07. 跨项目对比与设计启示

## 1. 一句话结论

没有单个项目在所有维度都最好：

- Trellis 最像“项目级综合 Harness”。
- OpenSpec 的 artifact 状态最灵活。
- Spec Kit 的 SDD 生态最成熟。
- BMAD 的角色和全生命周期最完整。
- GSD 对长任务和 context budget 最深入。
- Superpowers 的工程纪律最直接。
- Planning with Files 的恢复模型最小可用。
- Compound Engineering 的知识回流最系统。
- SpexCode/OpenLore 的确定性治理最前沿。

合理选择不是“安装最多”，而是先确定当前缺口。

## 2. 关键维度对比

评分只表示本轮源码观察到的相对覆盖，不是质量排名。

| 项目 | 规范 | 任务状态 | 上下文 | 跨会话 | 子 Agent | 确定性门禁 | 跨平台 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Trellis | 4 | 4 | 5 | 4 | 4 | 3 | 5 |
| Spec Kit | 5 | 3 | 3 | 2 | 3 | 3 | 5 |
| OpenSpec | 5 | 5 | 4 | 2 | 2 | 4 | 5 |
| BMAD | 5 | 3 | 4 | 2 | 5 | 2 | 4 |
| Superpowers | 3 | 2 | 4 | 2 | 5 | 2 | 4 |
| Planning with Files | 2 | 4 | 4 | 5 | 2 | 4 | 5 |
| GSD Core | 4 | 5 | 5 | 5 | 5 | 4 | 5 |
| Agent OS | 4 | 1 | 3 | 2 | 1 | 1 | 3 |
| Spec Workflow MCP | 4 | 4 | 3 | 3 | 1 | 4 | 4 |
| Compound Engineering | 4 | 3 | 5 | 4 | 5 | 3 | 5 |
| PRP | 4 | 3 | 5 | 3 | 5 | 3 | 3 |
| Context Intro | 3 | 1 | 4 | 1 | 1 | 1 | 1 |
| Acontext | 2 | 3 | 4 | 5 | 2 | 2 | 4 |
| memU | 1 | 2 | 4 | 5 | 1 | 3 | 5 |
| claude-mem | 1 | 4 | 5 | 5 | 2 | 3 | 4 |
| SpexCode | 5 | 5 | 4 | 5 | 5 | 5 | 2 |
| OpenLore | 4 | 3 | 5 | 5 | 2 | 5 | 4 |

## 3. 状态模型

### 弱状态：文件 + prompt

代表：

- Agent OS
- Context Engineering Intro
- Superpowers 的部分流程

下一步主要由 Agent 阅读指令后判断。优点是灵活，缺点是不可重复。

### 中状态：status + artifacts

代表：Trellis、PRP、Spec Workflow MCP。

```text
task.status + required files + user/reviewer state
```

它能防止明显跳步，但状态定义可能散在 JSON、Markdown 和 prompt 中。

### 强状态：graph / linter / Git ancestry

代表：

- OpenSpec artifact graph
- GSD phase/plan DAG
- SpexCode spec/code graph
- OpenLore static graph

程序决定：

- 什么已完成。
- 什么 blocked。
- 哪个关系失效。
- 哪个风险有证据。

## 4. 上下文装配

### 全量包

PRP 把相关文档、代码片段、gotcha、任务和验证装入单一执行包。

适合：

- 单次独立执行。
- 上下文可以完整容纳。

风险：

- 大包过时。
- 复制代码片段产生双源真相。
- 每个阶段都携带无关内容。

### 路径策展

Trellis 的 `implement.jsonl` / `check.jsonl` 保存路径和原因，再由 hook 或子 Agent 读取。

适合：

- 实现和检查角色不同。
- 项目规范较多。

风险：

- manifest 需要维护。
- 路径存在不代表内容正确。

### Progressive Disclosure

Superpowers、Compound Engineering、Acontext、GSD 主张按步骤或角色读取文件。

适合：

- 长流程。
- 需要保持主会话轻量。

风险：

- 模型可能漏触发。
- 过度拆分会增加 I/O 和选择负担。

### Deterministic Compilation

OpenSpec、SpexCode、OpenLore 通过 graph/schema/ownership 计算相关内容。

适合：

- 需要重复性和 CI。
- 依赖关系能建模。

风险：

- 未建模的动态关系会被漏掉。
- 初期需要维护 metadata/graph。

## 5. 验证模型

### 自我检查

最低层：

```text
实现 Agent 运行 tests，然后说通过。
```

不足：

- 可能选错命令。
- 可能只跑局部。
- 可能误读输出。

### 独立角色检查

Trellis、Superpowers、Compound Engineering、BMAD 使用独立 reviewer/checker。

改进：

- 减少 self-review bias。
- 可以使用不同 context 和 rubric。

仍然存在：

- reviewer 也是模型。
- 如果输入同一份错误 spec，会一致地判断错误。

### 外部审批

Spec Workflow MCP 将 approval 作为持久外部状态，pending 时不接受口头绕过。

适合：

- 文档审批。
- 合规/团队流程。

### 确定性证据

SpexCode/OpenLore 使用：

- Git ancestry
- hash
- static graph
- schema
- non-zero exit
- evidence receipt

这是高自主 Agent 最需要的方向：**模型负责提出，程序负责能证明的部分。**

## 6. 记忆模型

### 原始历史

Trellis `mem`：

- 最接近证据。
- 噪声高。
- 召回成本高。

### 观察与摘要

claude-mem：

- 自动化高。
- 召回体验好。
- 摘要可能失真。

### 文件化知识

Acontext：

- 人可审计。
- 可作为 Skill 复用。
- 写入和分类依赖 LLM。

### 结构化 recall

memU：

- Markdown 仍可读。
- embedding 检索高效。
- 相似度不保证适用性。

### 代码结构记忆

OpenLore：

- 可确定性刷新。
- 对“系统怎么连”强。
- 对“为什么做决定”仍需 ADR/人工输入。

## 7. 多 Agent 模型

| 模式 | 项目 | 主要风险 |
|---|---|---|
| 同工作区并行 | 部分 Skill 流程 | 最后写入覆盖 |
| worktree 隔离 | GSD、Compound、PRP、SpexCode | merge 冲突 |
| fresh subagent per task | Superpowers、GSD | 成本与上下文构造 |
| event channel | Trellis | 单机事件一致性 |
| role panel | BMAD、Compound review | persona 同质化 |

最可靠的通用规则：

1. 先做依赖和冲突预测。
2. 并行只用于真正独立的 work unit。
3. 每个 worker 有独立 workspace。
4. 协调者持有最终集成责任。
5. Agent 的完成声明必须由 Git、tests、PR checks 或外部状态验证。

## 8. 选择指南

### 只想改善一个人的 Coding Agent 纪律

优先：

- Superpowers
- Planning with Files

不要一开始引入完整平台。

### 想把需求先写清楚

优先：

- OpenSpec：轻量、brownfield。
- Spec Kit：完整、正式。
- Agent OS：只提取标准并 shape spec。

### 想管理复杂长任务

优先：

- GSD Core
- Trellis
- Planning with Files gated mode

### 团队使用不同 Coding Agent

优先：

- Trellis
- Spec Kit
- OpenSpec
- Compound Engineering

关键检查不是“支持列表有多长”，而是目标平台的 hook/agent 行为是否真实验证。

### 想保留跨会话记忆

优先按需求选：

| 需求 | 方案 |
|---|---|
| 查原始历史 | Trellis mem |
| 自动捕获与搜索 | claude-mem |
| 多 Agent 共用轻量 store | memU |
| 把经验变 Skill | Acontext |
| 记住代码结构 | OpenLore |

### 想防止 spec/code 漂移

优先：

- SpexCode：Git-native living spec。
- OpenLore：图、drift 和 governance verdict。
- OpenSpec：delta specs 与 archive。

## 9. Trellis 的优势与缺口

### 优势

1. 跨平台 adapter 与项目级文件模型结合。
2. 任务、规范、上下文、journal、mem、channel 一体化。
3. 实现/检查角色有不同 context manifest。
4. 初始化、更新、迁移和用户文件保护较成熟。
5. session-scoped pointer 适合多窗口。

### 缺口

1. status 模型比 OpenSpec/GSD 简单。
2. spec 与代码缺少 SpexCode 式明确 binding。
3. context manifest 不是自动依赖图。
4. 许多阶段门禁仍是 prompt-level。
5. journal/spec 的 freshness 没有 OpenLore 式 lease/verdict。
6. channel 是单机文件事件系统，不是完整分布式 scheduler。
7. 外部交付结果需要另建证据轴。

## 10. 可复用设计原则

### 原则 1：事实、决策、状态、日志分开

不要把所有内容写进一个 Markdown：

```text
spec       = 长期规则/意图
decision   = 为什么选这个方案
task state = 当前做到哪
run log    = 实际发生了什么
evidence   = 如何证明结果
```

### 原则 2：Prompt 只负责开放判断

适合模型：

- 需求澄清。
- 方案权衡。
- 找潜在风险。
- 总结经验。

适合代码：

- schema validation。
- status transition。
- path containment。
- lock/idempotency。
- diff、hash、ancestry。
- test exit code。

### 原则 3：注入前先做 relevance 和 freshness

上下文至少需要两个判断：

```text
relevant?  当前任务是否需要
fresh?     内容是否仍与代码/规范一致
```

大多数项目只解决了前者。

### 原则 4：外部审批不能只靠聊天文本

高风险动作应绑定：

- approval record
- PR review
- issue status
- explicit token
- audit trail

而不是模型从“看起来像同意”推断。

### 原则 5：多 Agent 的核心是隔离和集成，不是数量

增加 Agent 数不会自动增加独立性。相同模型、相同 context、相同 rubric 可能产生相关错误。

### 原则 6：更新器是 Harness 的核心模块

Harness 会在用户仓库写文件，必须支持：

- ownership manifest
- user modification detection
- atomic writes
- safe migration
- backup
- symlink/path traversal protection
- uninstall 精确清理

### 原则 7：完成必须是证据对象

推荐形态：

```json
{
  "claim": "bug fixed",
  "baseline": "failing reproduction",
  "change": "commit/diff",
  "verification": ["command + exit code"],
  "external_status": "reviewed/merged/deployed",
  "limitations": ["not covered"]
}
```

## 11. 如果为 intern-journal 设计组合方案

当前仓库已有 Trellis 类思想，不应机械引入另一个完整框架。更合理的是选择性吸收：

| 缺口 | 借鉴 |
|---|---|
| active task 与工件 | Trellis |
| 轻量恢复 | Planning with Files |
| 每任务独立实现/检查 | Superpowers |
| artifact 依赖 | OpenSpec |
| context byte budget | GSD |
| 知识查重与回流 | Compound Engineering |
| spec/code freshness | SpexCode/OpenLore |
| 外部审批 | Spec Workflow MCP / GitHub PR |

组合原则：

1. 保持 Markdown 为源真相。
2. 只增加能阻止真实失败的机制。
3. 不为“看起来先进”增加第二套 task/spec 系统。
4. 新状态必须有单一 writer 和明确 transition。
5. 所有自动记忆先有来源与过期边界。

## 关键思考点

1. 你的问题是需求不清、上下文丢失、执行漂移，还是验证不足？不要用同一个工具解决四类问题。
2. 哪些项目的复杂度是业务必要，哪些是框架自身制造？
3. 如果只能选择一个确定性门禁，应该先做 test evidence、spec drift 还是 architecture rule？
4. 团队是否真的需要跨平台行为一致，还是只需要共享工件一致？
5. 一套 Harness 如何证明自己比没有 Harness 更好，而不是只增加文件和 token？
