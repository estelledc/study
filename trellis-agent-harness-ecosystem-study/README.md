# Trellis 与 Coding Agent Harness 生态研究

> 研究日期：2026-07-16
> 核心对象：[mindfold-ai/Trellis](https://github.com/mindfold-ai/Trellis)
> 源码基线：17 个个人 fork + 17 个本地受控 clone；精确版本见 [08-repository-inventory-and-local-constraints.md](08-repository-inventory-and-local-constraints.md)

## 结论先行

Trellis 不是 LangChain、CrewAI 那类“让模型调用业务工具”的通用 Agent 框架，也不是 Claude Code、Codex、Cursor 那类实际写代码的 Coding Agent。它位于 Coding Agent 外侧，是一个 **Agent Harness（代理运行支架）**：

1. 用仓库内文件保存规范、需求、任务状态和工作记忆。
2. 在正确时机把正确上下文注入主会话或子 Agent。
3. 把规划、实现、检查和收尾拆成可恢复的阶段。
4. 把同一套工作方式投影到不同 Coding Agent 平台。
5. 通过独立检查角色、测试门禁和知识回流降低长期漂移。

这个领域在 2025-2026 年快速收敛到一个共同判断：**模型能力只是上限，工程可靠性主要取决于模型外部的上下文、状态、工具、验证和恢复系统。**

Trellis 的差异化不在“也能写一份 spec”，而在于它尝试把以下五件事合成一个项目级控制层：

- **SDD（Spec-Driven Development，规范驱动开发）**
- **Context Engineering（上下文工程）**
- **Task State Machine（任务状态机）**
- **Cross-session Memory（跨会话记忆）**
- **Cross-platform Projection（跨平台配置投影）**

## 推荐阅读顺序

| 顺序 | 材料 | 先回答什么 |
|---|---|---|
| 1 | [研究范围、方法与来源审计](01-scope-method-and-source-audit.md) | “相关项目”如何定义，哪些材料可信 |
| 2 | [生态全景与发展现状](02-ecosystem-landscape.md) | 这个领域有哪些路线，发展到哪一步 |
| 3 | [Trellis 架构深度分析](03-trellis-architecture-deep-dive.md) | Trellis 到底如何运行 |
| 4 | [规范与流程框架](04-spec-and-process-frameworks.md) | Spec Kit、OpenSpec、BMAD、GSD 等怎么做 |
| 5 | [上下文、工作流与知识复利](05-context-workflow-and-compounding.md) | Superpowers、Planning with Files、PRP 等怎么做 |
| 6 | [记忆与确定性治理](06-memory-and-deterministic-governance.md) | Acontext、memU、claude-mem、SpexCode、OpenLore 怎么做 |
| 7 | [跨项目对比与设计启示](07-cross-project-comparison-and-design-lessons.md) | 方案如何选，Trellis 强弱在哪里 |
| 8 | [仓库、版本与本地约束](08-repository-inventory-and-local-constraints.md) | fork/clone 在哪里，如何恢复 |
| 9 | [关键思考题](09-learning-questions.md) | 后续可以从哪些问题继续学 |
| 10 | [基础问题 FAQ](10-fundamentals-faq.md) | 快速回答大部分基础疑问 |

## 研究语料

### 核心对象

- `mindfold-ai/Trellis`

### 规范与流程

- `github/spec-kit`
- `Fission-AI/OpenSpec`
- `bmad-code-org/BMAD-METHOD`
- `open-gsd/gsd-core`
- `buildermethods/agent-os`
- `Pimzino/spec-workflow-mcp`

### 上下文与执行方法

- `obra/superpowers`
- `OthmanAdi/planning-with-files`
- `EveryInc/compound-engineering-plugin`
- `Wirasm/PRPs-agentic-eng`
- `coleam00/context-engineering-intro`

### 记忆与确定性治理

- `memodb-io/Acontext`
- `NevaMind-AI/memU`
- `thedotmack/claude-mem`
- `shuxueshuxue/Spexcode`
- `clay-good/OpenLore`

## 一张定位图

```text
---------------------- 人的目标、审批与最终责任 ----------------------+
                               |
                     Agent Harness / SDD 层
  Trellis | Spec Kit | OpenSpec | BMAD | GSD | Superpowers | ...
  - 任务、规范、状态、上下文、记忆、门禁、角色、恢复、平台适配
                               |
                       Coding Agent / IDE 层
   Claude Code | Codex | Cursor | OpenCode | Cline | Copilot | ...
  - 读写代码、调用工具、运行命令、对话、生成 diff
                               |
                         模型与工具层
       Claude | GPT | Gemini | 本地模型 | MCP | Shell | Git | ...
```

边界要点：

- Trellis 管“AI 应该按什么工程流程工作”，不负责训练模型。
- Coding Agent 管“如何读文件、改代码、跑命令”，不天然知道团队规范。
- Spec/Memory 文件提供长期事实，但只有注入、检索和门禁机制才能让它们在正确时机生效。

## 证据边界

- 结论优先来自当前 clone 的源码、测试、官方文档和 GitHub API。
- README 中的产品宣称与源码实现分开记录。
- 社区讨论只用于发现痛点和使用反馈，不用于证明架构事实。
- 未安装第三方依赖，也未执行外部仓库代码；本轮是 pinned commit 上的静态源码研究，不是运行时性能验收。
- Stars、版本和活跃度是 2026-07-16 快照，未来会变化。

## 后续提问方式

可以直接按以下格式继续：

```text
解释 03 中 Trellis 的 session-scoped active task。
对比 Trellis 和 OpenSpec 的状态模型。
精读 trellis/packages/core/src/channel/internal/store/events.ts。
为什么 Planning with Files 需要 attestation？
如果给 intern-journal 设计 Harness，应组合哪些项目的机制？
```
