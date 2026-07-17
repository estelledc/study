---
title: "13. 零基础实验：亲手跑一个最小 Agent loop"
sidebar:
  hidden: true
---
# 13. 零基础实验：亲手跑一个最小 Agent loop

> 目标：不用模型 API、不安装五个项目依赖，先看见“模型请求工具 → runtime 执行 → 工具结果回给模型 → 最终回答”的完整循环。
>
> 实验代码：[`labs/minimal_agent_loop.py`](labs/minimal_agent_loop.py)

## 1. 先建立直觉

把 Agent runtime 想成餐厅前台：

- 用户说“2 + 3 等于多少”。
- 模型像服务员，只能提出“请计算器算一下”的请求。
- tool registry 像前台能联系的岗位名册。
- runtime 检查工具名、执行计算并登记结果。
- 模型看到结果 5 后，才生成最终回答。

服务员不能自己假装计算器已经执行。模型产生 tool call，只是意图；runtime 执行并记录 tool result，才是事实。

## 2. 运行最小循环

从 `intern-journal` 根目录运行：

```bash
python3 \
  src/content/docs/research/coding-agent-runtime-study/labs/minimal_agent_loop.py
```

预期输出：

```text
The answer is 5.
input_admitted
model_turn:1
tool_settled:call-1
model_turn:2
run_completed
```

逐步解释：

1. `input_admitted`：用户输入进入本次 run。
2. `model_turn:1`：模型没有直接回答，而是请求 `add`。
3. `tool_settled:call-1`：runtime 找到工具、执行并登记唯一终态。
4. `model_turn:2`：工具结果进入 transcript，模型继续。
5. `run_completed`：模型返回文本且不再请求工具。

这已经包含两层循环：

```text
外层：模型 turn -> 工具结果 -> 下一个模型 turn
内层：同一 turn 中处理一个或多个 tool call
```

## 3. 运行四个可靠性测试

```bash
python3 -m unittest discover \
  -s src/content/docs/research/coding-agent-runtime-study/labs \
  -p 'test_*.py' \
  -v
```

2026-07-17 实测：

```text
Ran 4 tests
OK
```

| 测试 | 保护的不变量 |
|---|---|
| 正常 continuation | 工具结果必须回到 transcript，模型才能完成 |
| 重复 call ID | 同一个副作用只执行一次，后续复用已结算结果 |
| 未知工具 | registry 没有该工具时 fail closed |
| turn 预算 | 模型永不结束时，runtime 有明确退出条件 |

### 为什么 call ID 重要

如果网络重试或事件重复让同一个 `call-1` 到达两次：

```text
错误做法：转账工具执行两次
正确做法：第二次读取 call-1 已有终态
```

教学代码只在进程内保存 `settled` 字典。生产系统还要考虑崩溃恢复、持久化和“结果不确定”状态。

## 4. 把实验映射回五个项目

| 项目 | 对应实验中的哪一层 | 第一个源码任务 |
|---|---|---|
| Pi | 最接近教学代码的双层循环 | 在 `packages/agent/src/agent-loop.ts` 找外层 turn 和内层 tool call |
| Gemini CLI | 把模型流和工具执行拆给不同对象 | 对比 `core/turn.ts` 与 `Scheduler` 谁拥有哪个状态 |
| Codex | 把循环放进 Thread/Session 和请求快照 | 从 `tasks/regular.rs` 进入 `session/turn.rs`，找 step context |
| OpenCode | 先把输入和事件持久化，再投影当前状态 | 从 `session/input.ts` 追到 `execution/local.ts` 和 `runner/llm.ts` |
| Grok Build | SessionActor 用 mailbox 接收多种异步事件 | 区分 `run_loop.rs` 的 mailbox 和 `turn.rs` 的模型工具循环 |

不要一开始逐行读五个实现。先拿同一个问题去找：

1. 输入在哪里被接受？
2. 工具 schema 在哪里冻结？
3. 工具调用在哪里执行和结算？
4. 什么条件让模型继续？
5. 什么条件让 run 结束？

## 5. 2026-07-17 快照复核

现有正文仍绑定 2026-07-16 的固定提交。本次只读比较得到：

| 项目 | 远端变化 | 对既有结论的影响 |
|---|---|---|
| Gemini CLI | 0 个提交 | 固定提交仍是 upstream main |
| Codex | +26 个提交、172 个文件 | Agent role、spawn model/reasoning、恢复语义有变化；核心 `run_turn` 结构仍在，但 Round 3 细节必须按旧提交阅读 |
| OpenCode | +16 个提交、123 个文件 | 变化主要在产品 UI、统计和 provider；本轮只发现核心 provider 文件 6 行变化，session/tool 主链未命中 |
| Pi | +27 个提交、87 个文件 | `agent-loop.ts` 未变；provider/OAuth 变化较多，`AgentSessionRuntime` 增加未保存 session 禁止 clone/fork 的 5 行 guard |
| Grok Build | 新 main 与初始快照无共同祖先 | 公开 monorepo 同步重建历史；树级比较只有 6 个旧路径和 27 个新路径，核心 `turn.rs`、`sampler_turn.rs`、`run_loop.rs`、Agent builder blob 相同 |

### Codex 的重要增量

当前 main 允许 full-history fork 继承 agent type，同时仍可应用显式或默认的 child model/reasoning；恢复测试新增 role config 保持检查。

因此旧材料中的稳定结论仍是：

- 子 Agent 能力需要明确继承和裁剪。
- 恢复不能只恢复 thread ID，还要恢复有效配置。

但“full-history fork 必然继承 model/reasoning、不能覆盖”的具体说法已经过期，只能作为旧快照事实。

### Grok Build 为什么不能写“前进一个提交”

初始公开提交是 root commit；当前 main 位于另一条同步历史，GitHub compare 返回“无共同祖先”。正确记录是：

```text
旧研究快照 b189869
当前公开快照 8adf901
通过 tree/blob 比较建立对应关系
```

不能伪造普通线性升级关系。

## 6. 初学者常见误区

1. **模型调用了工具，所以工具已经成功。**
   工具调用只是请求，runtime 还要校验、审批、执行和结算。

2. **cancel 可以撤销任何副作用。**
   cancel 只能阻止后续工作；已经发送的邮件或写入的文件需要补偿或人工处理。

3. **把 transcript 压缩后，原始历史就可以删除。**
   compaction 是有损上下文，不是审计记录。

4. **上游 main 更新后，旧研究自动失效或自动仍有效。**
   必须看变化是否命中研究的控制流和不变量。

## 7. 应用题

1. 如果 `call-1` 第一次执行成功，但进程在保存结果前崩溃，恢复后应该标成 success、error 还是 uncertain？
2. 如果用户在工具批次中途发送“先别改文件”，它应该是 steer、queue 还是 cancel？
3. 为什么工具 schema 和执行 handler 必须来自同一个 request snapshot？
4. Grok Build 没有共同祖先时，为什么文件路径相同仍不足以证明实现相同？
5. Codex role 恢复测试为什么同时检查 model、provider、reasoning 和 permission profile？

答案线索分别在[可靠性状态机](09-round2-reliability-failure-state-machine.md)、[能力地图](11-round3-extension-subagent-capability-map.md)和[参考架构](12-round3-reference-architecture-and-thinking.md)。

## 8. 完成标准

- [ ] 能复述五个事件的顺序。
- [ ] 4 个教学测试通过。
- [ ] 能解释 duplicate call ID 为什么不能重复执行。
- [ ] 能用五个统一问题阅读任一真实项目。
- [ ] 能区分固定提交事实和 2026-07-17 增量。
- [ ] 不把教学模型写成任一项目的完整实现。
