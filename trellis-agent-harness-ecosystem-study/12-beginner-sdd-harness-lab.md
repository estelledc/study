# 12. 零基础实验：用文件搭一个最小 Coding Agent Harness

> 目标：不用模型 API、不安装 Trellis CLI，在 60-90 分钟内看见状态、工件、验证和多会话隔离怎样共同工作。
>
> 教学代码：[`labs/minimal_harness.py`](labs/minimal_harness.py)

## 1. 先建立生活类比

把软件任务想成装修：

- `task.json` 是施工单，记录“规划中、施工中、验收中、完成”。
- `prd.md` 是业主需求。
- `implement.md` 是施工方案。
- `implement.jsonl` 是施工队必须看的材料清单。
- `check.jsonl` 是验收员必须看的标准清单。
- `verification.json` 是水电、消防等检查结果。
- session pointer 是每个现场负责人桌上的“当前施工单”。

只有施工单写“完成”不够；缺验收报告时，完成状态不可信。

类比的边界：真实 Harness 还要处理 Git、subagent、hook、权限、并发和外部 CI。本实验只演示最小状态合同。

## 2. 运行 happy path

从 `intern-journal` 根目录运行：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 \
  explorations/research/trellis-agent-harness-ecosystem-study/labs/minimal_harness.py
```

预期：

```text
active=demo
status=completed
evidence=lint,tests
```

内部顺序：

```text
create task
  -> status=planning
  -> 写 PRD/实现/检查工件
  -> status=in_progress
  -> status=review
  -> 写 verification
  -> status=completed
```

## 3. 运行五个失败/恢复测试

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s explorations/research/trellis-agent-harness-ecosystem-study/labs \
  -p 'test_*.py' \
  -v
```

2026-07-17 实测：

```text
Ran 5 tests
OK
```

| 测试 | 保护的合同 |
|---|---|
| 缺工件 | 缺 PRD/实现/检查上下文时不能开始 |
| 验证失败 | 任一检查为 false 时不能完成 |
| Happy path | 工件和验证齐备后才能完成 |
| 非法跳转 | 不能从 planning 直接跳 completed |
| Session 隔离 | session A/B 的 active task 不互相覆盖 |

## 4. 为什么“状态 + 文件”必须一起看

只看状态：

```json
{"status": "in_progress"}
```

你仍不知道：

- 用户到底要什么。
- 实现 Agent 应读哪些规范。
- reviewer 用什么标准检查。
- 任务是否已经验证。

只看文件也不够：

```text
prd.md 存在
implement.md 存在
```

它们可能还是草稿，任务也可能尚未获准开始。

所以最小可靠判断是：

```text
机器状态
  + 必需工件
  + 审批/验证证据
  + 当前 Git/外部状态
```

## 5. 为什么实现与检查清单要分开

`implement.jsonl` 回答：

```text
怎样构建？
要读哪些实现规范？
哪些已有代码可复用？
```

`check.jsonl` 回答：

```text
怎样判定正确？
有哪些风险和回归面？
哪些验收标准不能被实现思路覆盖？
```

如果 reviewer 只读 implementer 的解释，很容易复用同一个错误假设。分开清单不能保证独立，但至少让角色拥有不同证据入口。

## 6. 为什么 active task 要按 session 隔离

全局指针：

```text
.current-task = task-a
```

第二个窗口切到 task-b 后，第一个窗口也会误以为自己在 task-b。

Session-scoped pointer：

```text
sessions/session-a.json -> task-a
sessions/session-b.json -> task-b
```

两个窗口可以并行读取不同任务。它只解决“指针覆盖”，不解决两个任务修改同一文件的语义冲突；后者还需要 worktree、锁或 merge 协调。

## 7. 把实验映射回 17 个项目

| 路线 | 项目 | 实验中的对应概念 |
|---|---|---|
| 项目级 Harness | Trellis | task、session pointer、implement/check context、finish |
| 阶段式 SDD | Spec Kit、BMAD、Spec Workflow MCP | 明确阶段、工件、审批 |
| Artifact Graph | OpenSpec | 文件依赖图比单一 status 更细 |
| 长任务编排 | GSD Core | phase、attempt、动态路由、fresh agent |
| 方法型 Harness | Superpowers、Compound Engineering | 纪律、角色分离、task view、知识回流 |
| 文件化工作记忆 | Planning with Files、PRPs、Context Engineering Intro | plan/findings/progress、策展上下文 |
| 团队规范 | Agent OS | 只保存 unusual/opinionated 规则 |
| 记忆 | Acontext、memU、claude-mem | 主动沉淀、检索、自动捕获 |
| 确定性治理 | SpexCode、OpenLore | schema、lint、Git ancestry、静态图 |

## 8. 真实 Trellis 的 E2

本机没有在第三方仓安装依赖，而是用 `pnpm dlx` 的隔离环境执行两个 pinned test 文件：

```bash
cd explorations/research/repos/trellis
pnpm dlx vitest@4.0.18 run \
  packages/core/test/task/schema.test.ts \
  packages/core/test/task/phase.test.ts
```

结果：

```text
2 test files passed
14 tests passed
```

覆盖：

- task 默认 `planning`、P2 和 canonical 字段顺序。
- 集合字段不共享可变引用。
- 错误类型、缺字段和非 JSON 值被拒绝。
- 未知字段不进入 structured load surface。
- planning/in_progress/review/completed 映射到 phase。

没有覆盖：

- CLI init/update。
- hooks 是否被真实宿主调用。
- Codex inline/sub-agent 运行。
- channel、mem、迁移或发布。

## 9. 三张失败卡

### 卡 1：状态完成，但测试失败

```text
task.status = completed
verification.tests = false
```

结论：状态声明与证据冲突，不能接受完成。应回到 review 或 in_progress，由任务合同决定。

### 卡 2：task list 全绿，但 phase exit condition 未满足

Compound Engineering 的新 task spine 是用户视图，不是工作流源真相。task UI 全绿仍要检查：

- requirements plan 是否真的写入。
- scope 是否得到用户确认。
- 验证是否运行。

### 卡 3：两个 session 指针隔离，但修改同一文件

Session pointer 没冲突，不代表代码修改没冲突。需要额外的 worktree/文件所有权/merge 策略。

## 10. 初学者常见误区

1. **工件越多，Harness 越成熟。**  
   正确理解：工件必须减少恢复时间或提升验收质量，否则只是维护成本。

2. **task list 就是状态机。**  
   正确理解：task list 是视图；真实状态还包括工件、验证和外部结果。

3. **fresh subagent 没有 transcript，所以没有上下文。**  
   正确理解：它仍可收到显式任务、session config 和策展文件。

4. **多 Agent 自然产生独立审查。**  
   正确理解：相同 spec、模型和证据会产生相关错误。

## 11. 应用题与检查点

### 题 1

`task.json` 是 `in_progress`，但 `check.jsonl` 不存在。能否开始实现？

检查点：机器状态允许，不代表上下文合同完整；按本实验 gate 应阻断并补齐检查入口。

### 题 2

为什么 Spec Kit 的 `tasks.md` 存在不能证明 feature 正确？

检查点：任务可能漏需求、顺序错误、尚未实施或验证；需要 analyze/converge 和真实测试。

### 题 3

GSD attempt 1 只提高 reasoning effort、不换 model，有什么问题？

检查点：重试策略只改了一半，实际能力 tier 没升级；model 与 effort 应来自同一 attempt 决策。

### 题 4

为什么 Trellis 默认 inline 不能写成“Codex 不支持子 Agent 上下文”？

检查点：默认政策与平台能力是不同事实；fresh agent 仍收到显式任务和 session config。

### 题 5

什么时候不值得采用完整 Harness？

检查点：一次性、单文件、低风险任务的工件维护成本可能高于返工风险。

## 12. 完成标准

- [ ] 能解释状态、工件、验证和外部结果的区别。
- [ ] 教学 Harness 5 个测试通过。
- [ ] Trellis task schema/phase 14 个测试通过。
- [ ] 能解释 implement/check 清单为什么分开。
- [ ] 能说明 session pointer 与 worktree 分别解决什么。
- [ ] 不把教学模型或定向测试写成完整 Trellis E2E。
