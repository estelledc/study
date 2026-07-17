# 09. 零基础实验：让 Agent 能恢复、会筛选、可回滚

> 目标：不用 LLM、API Key、Docker 或外部数据库，亲手验证长期 Agent 的四个基本合同。
>
> 代码：[`labs/durable_agent.py`](labs/durable_agent.py)

## 1. 先建立生活类比

把长期 Agent 想成轮班处理案件的办公室：

| 办公室 | 长期 Agent |
|---|---|
| 案件编号 | `task_id` |
| 当前承办人 | lease owner |
| 交接单上的下一步 | checkpoint / `next_step` |
| 案件流水 | append-only event |
| 候选经验 | memory candidate |
| 入库审查 | memory admission |
| 新版办事手册试行 | Skill trial |
| 旧版手册复原 | rollback |

员工下班后，下一班不能只看聊天记录猜“做到哪了”；应该读明确的交接单。

类比边界：真实 Agent 还要处理模型调用、工具副作用、credential 和 sandbox。本实验只
演示确定性状态合同。

## 2. 长期 Agent 的九层

```text
channel / CLI
  -> gateway
  -> task/session state
  -> agent loop
  -> tool/capability
  -> skill
  -> memory
  -> scheduler
  -> evaluation and evolution
```

不同项目从不同层开始：

| 路线 | 项目 |
|---|---|
| 产品/Gateway 优先 | Hermes、OpenClaw、Agent Zero |
| 小核心 | nanobot、GenericAgent、PicoClaw |
| 强隔离 | NanoClaw、ZeroClaw、IronClaw |
| Stateful/Actor | Letta Code、Lethe |
| Memory 优先 | Thoth、两个 Mnemosyne |
| 自改进实验 | Hermes Self-Evolution、MetaClaw、Odigos |

不要把它们放进一个 star 排行榜；先问自己缺哪一层。

## 3. 四个实验合同

### 3.1 Lease：谁有权继续任务

```text
worker A claim task
  -> lease 未过期：worker B 被拒绝
  -> lease 过期：worker B 可恢复
```

lease 防止两个 worker 同时执行同一外部动作。它不是锁死任务，过期后必须允许恢复。

### 3.2 Checkpoint：恢复时下一步是什么

```text
completed_step = collect evidence
next_step = write summary
```

checkpoint 保存可执行的下一步，不只是“做了一些研究”。

### 3.3 Memory admission：哪些经验能长期保留

```text
candidate
  + source
  + verification
  + dedupe
  -> accepted / rejected
```

Tool result、网页文本和模型总结都只是候选，不是天然真相。

### 3.4 Skill trial：新版流程是否真的更好

```text
snapshot old skill
  -> run candidate on held-out cases
  -> compare against baseline + minimum gain
  -> promote or revert
  -> later regression can rollback
```

这才是“改进”的最小闭环。

## 4. 运行实验

从仓库根目录：

```bash
cd explorations/research/hermes-agent-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 python3 durable_agent.py
```

2026-07-17 实测：

```text
recovered_next=write summary
memory=accepted
trial=promoted
events=4
```

含义：

1. `worker-a` checkpoint 后进程关闭。
2. lease 过期，`worker-b` 从 `write summary` 恢复。
3. 有来源且验证通过的 Memory 候选入库。
4. Skill candidate 达到最低增益后 promote。
5. task event 保留创建、claim、checkpoint 和 recovery claim。

## 5. 运行八个测试

```bash
PYTHONDONTWRITEBYTECODE=1 \
python3 -m unittest -v test_durable_agent.py
```

结果：

```text
Ran 8 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| live lease blocks peer | 活跃 owner 存在时不能双执行 |
| expired lease recovery | worker 崩溃后可从下一步恢复 |
| restart persistence | 关闭并重开 SQLite 后 checkpoint 仍在 |
| owner enforcement | 非 owner 不能 checkpoint/complete |
| memory admission | 无 source 或未验证候选不入库 |
| memory dedupe | 相同长期事实不会重复写入 |
| Skill minimum gain | 达到 baseline + threshold 才 promote |
| Skill rollback | 失败 trial 保留旧版，已 promote 仍可回滚 |

## 6. 为什么 transcript 不是任务状态

Transcript 适合回答：

- 用户和 Agent 说了什么；
- 模型看过哪些 tool result；
- 排障时发生过什么。

任务状态必须回答：

- 当前 status；
- 由谁持有；
- lease 何时过期；
- 已完成哪一步；
- 下一步具体动作；
- 哪个副作用仍 uncertain。

让模型从几万 token transcript 猜这些字段，既贵又不确定。

## 7. 为什么 background 不等于 durable

```text
background task
  = 不阻塞当前 turn

durable task
  = 进程/机器重启后仍能恢复
```

Hermes 的 background subagent 是 process-local；必须跨重启的工作应使用 Cron、外部任务
队列或持久 board，并记录 owner/lease/checkpoint。

## 8. Memory 与 Skill 的边界

| 类型 | 保存什么 | 示例 |
|---|---|---|
| Memory | 事实、偏好、经历、任务状态 | “用户偏好中文结论先行” |
| Skill | 可复用操作流程 | “先 baseline，再修复，再验证” |

把具体用户事实写进公共 Skill 会泄漏隐私；把长操作流程塞进 Memory 会增加检索噪声。

## 9. “自我改进”的五层

| 层 | 更新对象 | 证明要求 |
|---|---|---|
| L1 | session/task state | 重启后恢复 |
| L2 | Memory | source、admission、纠错 |
| L3 | Skill | held-out、version、rollback |
| L4 | prompt/harness | trial、metric、blast radius |
| L5 | model parameters | training data、eval、deployment |

Hermes 当前最明确的是 L1-L3；Self-Evolution、MetaClaw、Odigos 探索 L3-L5 的不同路径。
不能把 L1 “记得上次对话”写成 L5 “模型变聪明了”。

## 10. Prompt cache 为什么限制热更新

Hermes 把每个会话的系统 prompt 前缀视为稳定缓存。中途换 toolset、重写旧消息或重建
system prompt 会：

- 破坏 cache；
- 增加成本；
- 改变同一会话的能力边界；
- 让审计难以复算。

因此 Skill/tool 变更通常延迟到下一 session，除非用户明确选择立即失效。

## 11. 三张分诊卡

### 卡 1：定时任务重复执行

检查顺序：

```text
job identity
  -> scheduler lock
  -> task lease
  -> operation id
  -> provider receipt
```

只加一个进程锁不能解决崩溃后的外部副作用重复。

### 卡 2：Agent 记住了错误事实

检查：

- 来源是谁；
- 是否属于正确 user/session；
- 写入前是否验证；
- 是否能纠错/删除；
- 旧错误是否已进入 Skill 或 prompt。

### 卡 3：新版 Skill 平均分更高但线上变差

平均分可能掩盖高风险 case。需要：

- held-out case；
- blocking safety gate；
- 版本和 snapshot；
- canary；
- rollback；
- 线上结果回流。

## 12. 初学者常见误区

1. **进程一直运行就是长期 Agent。**
   正确理解：长期性来自可恢复状态，不是 uptime。

2. **有向量数据库就是 Memory。**
   正确理解：还需要 identity、source、lifecycle、admission 和 deletion。

3. **Agent 自动改 SKILL.md 就是 self-improvement。**
   正确理解：没有独立 eval 和 rollback，只能证明自动修改。

4. **Cron 到点触发就表示任务完成。**
   正确理解：trigger、run、side effect 和 delivery 是不同终态。

5. **Docker/WASM 标签就足以证明安全。**
   正确理解：还要检查 mount、network、credential、capability 和 host boundary。

## 13. 应用题与检查点

### 题 1

worker A 的 lease 还有 30 秒，worker B 发现 A 进程不在本机，能立即接管吗？

检查点：不能只看本机 PID；分布式系统以 authoritative lease/fencing token 为准。

### 题 2

网页说“部署成功”，Agent 是否可以直接写入长期 Memory？

检查点：不可以。网页是外部输入；应查询权威部署状态或记录为未验证候选。

### 题 3

Skill candidate 从 60 分提高到 65 分，最低增益为 10 分，应该 promote 吗？

检查点：不应；保留 snapshot，记录 trial 为 reverted。

### 题 4

任务已发邮件但 checkpoint 前崩溃，恢复后怎么做？

检查点：用稳定 operation ID 查询 provider receipt；状态不明标 uncertain，不能盲重发。

### 题 5

什么时候选择 NanoClaw，而不是 Hermes？

检查点：当不互信任务的 per-group 容器隔离比多渠道、Memory/Skill 产品面更重要时。

### 题 6

什么时候 GenericAgent 比复杂平台更合适？

检查点：学习 loop、做可信本地小任务，且不需要强恢复、治理和多用户边界时。

## 14. 完成标准

- [ ] 能画出 lease -> checkpoint -> recovery 主链。
- [ ] 八个实验测试通过。
- [ ] 能区分 transcript、task state 和 side-effect receipt。
- [ ] 能区分 Memory 与 Skill。
- [ ] 能用 L1-L5 判断“自我改进”声明。
- [ ] 能说明 admission、held-out、snapshot 和 rollback 缺一不可。
