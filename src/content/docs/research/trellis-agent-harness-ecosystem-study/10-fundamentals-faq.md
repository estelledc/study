---
title: "10. 基础问题 FAQ"
sidebar:
  hidden: true
---
# 10. 基础问题 FAQ

## 1. Trellis 到底是什么？

一个安装在代码仓库中的 Coding Agent 工程框架。它保存项目规范、任务、工作流和记忆，并把这些内容适配到 Claude Code、Codex、Cursor 等平台。

## 2. Trellis 会自己写代码吗？

不会。真正读写代码的是宿主 Coding Agent。Trellis 提供上下文、流程、角色和状态。

## 3. Trellis 与 Claude Code/Codex 是竞争关系吗？

不是。Trellis 是上层项目 Harness，Claude Code/Codex 是执行宿主。Trellis 需要宿主才能运行。

## 4. Trellis 与 LangChain/CrewAI 有什么不同？

LangChain/CrewAI 主要帮助开发业务 Agent 应用；Trellis 管理 AI 辅助软件开发过程。

## 5. 为什么不只写一个 `AGENTS.md`？

单文件适合少量固定规则。随着项目增长，会遇到：

- 文件过长。
- 规则作用域不清。
- 任务状态和长期规范混在一起。
- 不能区分实现与检查上下文。
- 缺少归档和记忆。

Trellis 把这些内容拆成 spec、task、workflow 和 workspace。

## 6. `.trellis/spec/` 是什么？

项目长期工程规范，例如目录结构、错误处理、日志、跨层设计原则。它面向未来多个任务，不是当前任务的需求。

## 7. `.trellis/tasks/` 是什么？

每个任务的工作包，包含机器状态、PRD、设计、实施计划、研究和实现/检查上下文清单。

## 8. `.trellis/workspace/` 是什么？

按开发者保存的人工提炼 journal，用于跨会话交接。它不是完整聊天备份。

## 9. `trellis mem` 又是什么？

读取本机已有的 Claude Code、Codex、Pi 等原始会话日志，支持搜索、取上下文和按阶段提取。

## 10. 为什么要同时有 journal 和 mem？

- journal 是主动写下的高信号摘要。
- mem 是需要时回查的原始历史。

前者适合快速恢复，后者适合审计和找漏掉的细节。

## 11. `task.json.status` 有哪些主要状态？

当前主线是：

```text
planning -> in_progress -> completed
```

完成后任务目录会移动到 archive。

## 12. 为什么还要看文件是否存在？

同一个 `planning` 状态中，可能只写了 PRD，也可能已经完成 design、implement 和 context manifest。状态粒度不够，所以 workflow 还会检查 artifacts。

## 13. `implement.jsonl` 是代码吗？

不是。它是实现 Agent 应读取的规范/研究文件清单。每条通常包含路径和选入原因。

## 14. 为什么 `check.jsonl` 不直接复用 `implement.jsonl`？

实现与检查关注点不同：

- 实现需要如何构建。
- 检查需要接受标准、风险、规范和回归面。

分开能减少角色上下文污染。

## 15. 什么是 hook？

宿主在 SessionStart、UserPromptSubmit、PreToolUse 等事件上自动执行的脚本。Trellis 用 hook 注入当前工作流和任务上下文。

## 16. 如果平台不支持 hook 呢？

Trellis 可以：

- 生成手动 start command/skill。
- 在子 Agent 定义中加入 pull-based prelude。
- 让主 Agent inline 执行。

## 17. 为什么 Codex 默认 inline？

这是 Trellis 的默认工作流政策，不是 Codex 子 Agent 无法接收上下文。`fork_turns` 可选 fresh、bounded 或 full history；即使不继承 transcript，子 Agent 仍会收到显式任务和 session config。Trellis 选择 inline，是为了不让实现正确性依赖隐式 transcript 继承，并降低递归 dispatch 风险；用户仍可显式切到 sub-agent。

## 18. 什么是 session-scoped active task？

每个 AI 会话有自己的 current task pointer。两个窗口可以处理不同任务，不会互相覆盖。

## 19. Trellis 能阻止 Agent 跳过测试吗？

部分能。它会通过 workflow、check Agent 和验证命令要求测试，但许多约束仍是 prompt-level。没有真正执行或读取命令结果时，不能把“要求测试”当成“测试已通过”。

## 20. 什么是 Spec-Driven Development？

先把可验证意图写成版本化规范，再从规范生成计划、任务和实现，并持续检查实现是否仍符合规范。

## 21. Spec Kit 与 OpenSpec 怎么选？

- 想要完整、正式、阶段清晰：Spec Kit。
- 想要轻量、可迭代、brownfield：OpenSpec。
- 想要项目执行和团队上下文：再考虑 Trellis。

## 22. BMAD 与 GSD 的区别？

- BMAD 像完整虚拟研发组织，角色和业务分析多。
- GSD 更聚焦长任务的 context engineering、phase loop 和 fresh subagents。

## 23. Superpowers 与 Trellis 的区别？

- Superpowers 是一组强纪律 Skills。
- Trellis 有项目任务、spec、journal、hooks、migration 和多平台生成系统。

Superpowers 更易局部采用，Trellis 更像完整项目层。

## 24. Planning with Files 为什么只有三文件也有效？

因为它解决了最常见的恢复问题：

- 目标放 plan。
- 发现放 findings。
- 行动和证据放 progress。

上下文丢失后只需重读，不必回放整个对话。

## 25. 什么是 attestation？

对批准后的 plan 计算 SHA-256 并保存。之后内容发生变化但没有重新批准时，hook 可以识别 plan 已被修改。

它证明内容没变，不证明计划正确。

## 26. Acontext、memU、claude-mem 怎么选？

- 想把经验变成人可编辑 Skill：Acontext。
- 想要轻量跨 Agent 文件记忆和 embedding 检索：memU。
- 想要自动捕获、摘要、搜索和 UI：claude-mem。

## 27. 什么是 progressive disclosure？

先返回索引/摘要，需要时再展开全文。目的不是隐藏信息，而是把有限 attention 留给当前最相关内容。

## 28. 为什么向量检索不一定正确？

它计算语义相似，不知道：

- 内容是否过期。
- 当前规则是否覆盖它。
- 两段相似经验的前提是否不同。
- 来源是否可信。

## 29. SpexCode 的 spec 与 Trellis spec 一样吗？

不一样：

- Trellis spec 主要是工程规范。
- SpexCode spec 主要描述一个代码单元当前应做什么，并绑定文件/符号。

## 30. 什么是 spec/code drift？

代码变化了，但描述它的 spec 没更新，或 spec 引用的代码已经删除/改名。

## 31. OpenLore 为什么叫 deterministic？

它尽量用静态分析、Git、hash、schema 和图算法回答：

- 谁调用谁。
- 改动影响哪里。
- 是否违反架构规则。
- 某个 claim 能否被证据确认。

这些不需要 LLM 在 hot path 中猜。

## 32. 静态分析是绝对正确的吗？

不是。反射、动态分派、运行时配置、生成代码和跨服务调用都可能无法完整解析。成熟系统应返回 confidence 或 `unverifiable`，而不是假装确定。

## 33. 什么是 Epistemic Lease？

对“当前上下文仍可相信多久”的运行时估计。它不仅看时间，还看代码变化、跨模块移动和认知负载。

## 34. 多 Agent 为什么不一定更可靠？

如果多个 Agent 使用同一模型、同一错误 spec 和同一上下文，它们的错误会高度相关。独立验证需要不同角色、不同证据，最好还有确定性工具。

## 35. worktree 解决什么？

隔离多个 Agent 的文件写入，避免同一工作区互相覆盖。

它不自动解决：

- 两个分支修改同一语义。
- migration 顺序。
- API contract 冲突。
- merge 决策。

## 36. 什么时候不该使用完整 Harness？

- 一次性脚本。
- 单文件低风险修改。
- 临时原型。
- 没有长期维护需求。
- 团队不愿维护工件。

Harness 的成本必须小于重复解释、返工和回归成本。

## 37. 如何判断一个 Harness 是否真的有效？

看外部结果，不看文件数量：

- 真实任务通过率。
- reviewer 一次接受率。
- 回归数量。
- 恢复耗时。
- 人工介入时间。
- token/工具成本。
- spec/code drift。
- merge/上线结果。

## 38. 17 个 fork 会自动保持最新吗？

不会。当前是固定研究基线。需要先 fetch upstream、检查差异，再决定是否更新结论。

## 39. 为什么 clone 使用 shallow/sparse？

研究架构不需要先下载所有历史、媒体和网站构建产物。这样降低磁盘和网络成本，同时仍可按需补目录或补历史。

## 40. 后续最值得精读哪些文件？

建议顺序：

1. Trellis `workflow.md`
2. Trellis `task.py` / `active_task.py`
3. Trellis `inject-workflow-state.py`
4. Trellis `AI_TOOLS` / configurators
5. OpenSpec `artifact-graph`
6. Superpowers `subagent-driven-development`
7. Planning with Files `gate-stop.sh` / `attest-plan.sh`
8. SpexCode `lint.ts`
9. OpenLore `mcp-handlers`
