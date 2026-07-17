# 09. 关键思考题

这些问题用于后续提问和主动回忆。建议先回答，再回看对应章节。

## A. 基础定位

### Q1

为什么 Trellis 不是一个通用 Agent Framework？

我的回答：

>

提示：区分业务 Agent 编排、Coding Agent 和项目级 Harness。

### Q2

`Model + Harness` 中，Harness 至少包含哪些部件？

我的回答：

>

### Q3

SDD 与普通“先写一份需求文档”有什么本质区别？

我的回答：

>

### Q4

为什么更大的 context window 不能自动解决长期任务漂移？

我的回答：

>

## B. Trellis

### Q5

Trellis 为什么同时需要 `task.json` 和 `prd.md`？

我的回答：

>

### Q6

`design.md` 与 `implement.md` 的边界是什么？

我的回答：

>

### Q7

为什么实现和检查分别使用 `implement.jsonl` 与 `check.jsonl`？

我的回答：

>

### Q8

session-scoped active task 比全局 `.current-task` 好在哪里？

我的回答：

>

### Q9

当 session identity 不可用时，Trellis 的 degraded mode 牺牲了什么？

我的回答：

>

### Q10

hook push、pull prelude、inline 三种上下文模式分别适合什么宿主？

我的回答：

>

### Q11

为什么 `workflow.md` 的 breadcrumb block 应成为单一源真相？

我的回答：

>

### Q12

Trellis 的 template hash 能证明什么，不能证明什么？

我的回答：

>

### Q13

`trellis channel` 的 JSONL + file lock 为什么适合单机，但不是分布式队列？

我的回答：

>

### Q14

`trellis mem` 与 journal 的数据来源、可信度和用途有什么差异？

我的回答：

>

## C. 规范与状态

### Q15

Spec Kit 的阶段式 workflow 与 OpenSpec artifact graph 的核心区别是什么？

我的回答：

>

### Q16

为什么 OpenSpec 的“artifact 文件存在”仍不足以证明 change 正确？

我的回答：

>

### Q17

BMAD 的角色 persona 怎样才能带来真正独立的分析，而不是换一种语气？

我的回答：

>

### Q18

GSD 为什么强调 thin orchestrator 和 fresh-context agents？

我的回答：

>

### Q19

GSD 用 byte budget 而不是 line budget 有什么合理性？

我的回答：

>

### Q20

Agent OS 为什么只提取 unusual/opinionated/tribal standards，而不是记录所有代码规范？

我的回答：

>

### Q21

Spec Workflow MCP 的持久 approval 比聊天中的“批准”强在哪里？

我的回答：

>

## D. 上下文工程

### Q22

大 PRP 和渐进式文件读取分别会在哪些场景失败？

我的回答：

>

### Q23

为什么 PRP 要“代码库模式优先，外部最佳实践第二”？

我的回答：

>

### Q24

Superpowers 为什么要求每个任务使用 fresh implementer？

我的回答：

>

### Q25

把完整 diff 放进协调会话与把 diff 写入文件交给 reviewer，有什么上下文成本差异？

我的回答：

>

### Q26

Planning with Files 的三文件各自承担什么状态？

我的回答：

>

### Q27

plan attestation 解决的是正确性、完整性还是完整性校验（integrity）？

我的回答：

>

### Q28

为什么 completion gate 必须 opt-in，并且要有 block cap 和 progress detection？

我的回答：

>

### Q29

Compound Engineering 为什么不把执行进度写回 plan body？

我的回答：

>

### Q30

知识回流时，为什么先查重比“每次生成新笔记”更重要？

我的回答：

>

## E. Memory

### Q31

Acontext 把 memory 写成 Skill 的优势和风险是什么？

我的回答：

>

### Q32

Acontext 不使用 embedding top-k，依靠 Agent 主动读取，会漏掉什么？

我的回答：

>

### Q33

memU 为什么把检索拆成 segment、file、resource 三层？

我的回答：

>

### Q34

embedding-only 检索为什么更可预测，但仍不能保证正确召回？

我的回答：

>

### Q35

claude-mem 的 pending queue 和 worker 为什么必须 fail-open？

我的回答：

>

### Q36

原始 session、observation、summary、Skill 中，哪一层最接近事实？

我的回答：

>

### Q37

自动记忆系统应该如何处理敏感信息和错误结论？

我的回答：

>

## F. 确定性治理

### Q38

SpexCode 为什么说“Git is the database”？

我的回答：

>

### Q39

spec 和 code 同 commit 能防止什么，不能防止什么？

我的回答：

>

### Q40

SpexCode 为什么把 lifecycle 与 liveness 分成两个轴？

我的回答：

>

### Q41

eval 的 code SHA 和 scenario hash 分别解决什么 freshness 问题？

我的回答：

>

### Q42

OpenLore 的 `confirmed/refuted/unverifiable` 为什么比只返回 true/false 更诚实？

我的回答：

>

### Q43

静态调用图在哪些语言特性下容易失真？

我的回答：

>

### Q44

为什么 OpenLore 默认 advisory，而不是默认阻断所有 findings？

我的回答：

>

### Q45

Epistemic Lease 与普通 TTL 有什么区别？

我的回答：

>

## G. 多 Agent 与团队

### Q46

多个相同模型 reviewer 是否真的构成独立验证？

我的回答：

>

### Q47

多 Agent 并行前，为什么只检查文件重叠还不够？

我的回答：

>

### Q48

worktree 隔离解决了写覆盖，为什么仍没有解决语义冲突？

我的回答：

>

### Q49

主协调 Agent 应保存哪些信息，哪些信息应该只留在 worker artifact？

我的回答：

>

### Q50

人最值得保留的审批点是哪几个？

我的回答：

>

## H. 设计题

### Q51

如果给 intern-journal 增加一个确定性 spec freshness gate，你会选择：

- Git commit distance
- content hash
- code symbol binding
- static graph impact

为什么？

我的回答：

>

### Q52

设计一个最小 Harness，只允许五个工件。你会保留哪五个？

我的回答：

>

### Q53

设计一个“完成证据”JSON schema，怎样区分：

- AI 自述
- 本地命令结果
- 人工验收
- PR/部署状态

我的回答：

>

### Q54

如果 Trellis 只保留一个 Memory 路线，你会选择 raw session search、journal、Skill memory 还是 code graph？为什么？

我的回答：

>

### Q55

如何做一场公平实验，证明 Harness 真的提升了交付，而不是只增加文档？

我的回答：

>

建议指标：

- 真实任务通过率。
- 外部 reviewer 一次接受率。
- 回归缺陷。
- 人工介入时间。
- token/工具调用成本。
- 跨会话恢复时间。
- 规范与代码漂移数量。
