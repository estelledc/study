---
title: "06. 学习路线与关键思考题"
sidebar:
  hidden: true
---
# 06. 学习路线与关键思考题

## 1. 学习目标

完成这条路线后，应该能：

1. 用自己的话解释 LangGraph 与 LangChain、Deep Agents、LangSmith/Aegra 的层级关系。
2. 从 `StateGraph.compile()` 追到 Pregel superstep 和 checkpoint。
3. 正确设计 reducer、thread、interrupt、Send 和 subgraph。
4. 判断 supervisor、swarm、subagent tool 是否真的需要。
5. 画出 graph、API、worker、database、stream、UI 的生产边界。
6. 解释 checkpoint 为什么不等于 exactly-once。
7. 根据约束选择 LangGraph、CrewAI、Pydantic AI、OpenAI Agents、Microsoft AF 或 Mastra。

## 2. 推荐路线

### Step 1：最小 ReAct 图

读：

- `react-agent/src/react_agent/graph.py`
- `state.py`
- `context.py`

要回答：

- 为什么 model 和 tools 是两个节点？
- `is_last_step` 在防什么？
- 什么时候普通 `while` 循环更合适？

动手证据：

- 画出 4 条边。
- 写一个无 LLM 的 fake model 测试路由。

### Step 2：State 与 reducer

读：

- `langgraph/.../graph/state.py`
- `channels/last_value.py`
- `channels/binop.py`
- `graph/message.py`

要回答：

- state schema 如何变成 channels？
- 两个节点同一步写同一 key，为什么有时成功、有时报错？
- accumulator 和 overwrite 字段如何选择？

动手证据：

- 写两个并行节点同时更新 `findings`。
- 分别测试无 reducer、`operator.add`、去重 reducer。

### Step 3：Compile 到 Pregel

读：

- `StateGraph.compile`
- `CompiledStateGraph`
- `pregel/main.py`
- `pregel/_loop.py`
- `pregel/_runner.py`

要回答：

- builder 为什么不能直接运行？
- edge 在编译后如何变成 trigger？
- 同一 superstep 的写入为什么延后可见？

动手证据：

- 在最小图中记录 node 执行顺序与 state 可见值。

### Step 4：Checkpoint 与 interrupt

读：

- `checkpoint/base/__init__.py`
- `types.py` 的 `interrupt` / `Command`
- `langgraph-101` email 或 music-store HITL 例子

要回答：

- thread ID、checkpoint ID、namespace 的关系是什么？
- interrupt 恢复时为什么节点可能从头重跑？
- 什么数据应该放 Store 而不是 checkpoint？

动手证据：

- 用 SQLite 或 Postgres saver 跑“暂停 -> 重启进程 -> 恢复”。
- 在 interrupt 前后放计数器，观察重跑边界。

### Step 5：Send 与 subgraph

读：

- Gemini `continue_to_web_research`
- Bigtool `should_continue`
- LangGraph `Send` 实现
- LangGraph 101 researcher graph

要回答：

- 静态 parallel edge 与动态 Send 有什么差别？
- fan-out 子任务的输入为什么可以不是完整 parent state？
- fan-in 时哪些字段必须 reducer？

动手证据：

- 用 3 个 fake researcher 并行返回结果。
- 加一个失败分支，定义失败收敛策略。

### Step 6：标准 agent 与 middleware

读：

- LangChain `create_agent`
- `AgentMiddleware`
- `HumanInTheLoopMiddleware`
- `SummarizationMiddleware`
- Deep Agents `create_deep_agent`

要回答：

- middleware 如何贡献 state 和 tools？
- 为什么 middleware 顺序是行为的一部分？
- Deep Agents 为什么保护 Filesystem/SubAgent middleware？

动手证据：

- 写一个 tool allowlist middleware。
- 验证它在动态工具注入后仍生效。

### Step 7：应用与部署

读：

- agent-service-toolkit `service.py`
- Agent Chat UI `Stream.tsx`
- Aegra `run_executor.py`
- DeerFlow `gateway/deps.py`

要回答：

- graph stream 如何变成 SSE？
- thread、run、assistant 是哪三种身份？
- worker、broker、checkpoint 各保存什么？
- 重连时如何避免事件重复？

动手证据：

- 定义自己的最小 event contract。
- 用 fake graph 测试断线后按 event ID replay。

### Step 8：框架对照

读：

- Microsoft AF workflow builder/checkpoint
- CrewAI Flow runtime
- Pydantic Graph BaseNode/GraphRun
- OpenAI Agents run loop/handoff
- Mastra workflow execution engine

要回答：

- 哪个差异来自语法，哪个差异来自真正的运行语义？
- 各框架保存的“状态”是否同一种状态？
- 换框架时最难迁移的是 prompt、graph、checkpoint 还是部署？

动手证据：

- 用两个框架实现同一个“审批后发送”流程。
- 对比代码量、恢复、测试和副作用幂等。

## 3. 基础问题

1. LangGraph 是框架、runtime 还是平台？
2. Node 和 Edge 分别是什么？
3. State 为什么通常用 TypedDict？
4. reducer 的输入和输出是什么？
5. `START` 和 `END` 是真实 node 吗？
6. compile 做了哪些事？
7. `invoke`、`stream`、`ainvoke`、`astream` 有什么区别？
8. thread ID 用来做什么？
9. Checkpoint 和 Store 有什么区别？
10. `Command` 和 conditional edge 都能路由，怎么选？
11. `Send` 为什么适合 map-reduce？
12. interrupt 为什么需要 checkpointer？
13. subgraph 和普通函数 node 有什么差别？
14. LangChain `create_agent` 为什么返回 CompiledStateGraph？
15. Deep Agents 为什么不是 LangGraph 的替代品？

## 4. 中级问题

1. 同一 superstep 中，A 节点能看到 B 节点刚写的值吗？
2. `messages` 为什么要用 `add_messages` 而不是 `operator.add`？
3. reducer 如何处理删除、覆盖和去重？
4. 并行 tool calls 与并行 agent 有什么不同？
5. interrupt 节点重跑时，如何避免重复 LLM 调用？
6. 长上下文应该总结、外置，还是使用 DeltaChannel？
7. checkpoint 的 schema 升级怎么处理？
8. 同一 thread 的并发请求如何加锁？
9. supervisor 为什么可能比单 agent 更差？
10. swarm 如何避免 agent 互相无限 handoff？
11. Bigtool 如何同时满足工具检索和权限？
12. UI 如何区分 token、node update、tool result 和 interrupt？
13. Aegra 为什么需要 run record，不能只读 checkpoint？
14. DeerFlow 的 memory、thread state 和 sandbox file 生命周期有何不同？
15. Java port 为什么不能直接复用 Python checkpoint？

## 5. 高级问题

1. Pregel 的 BSP 模型给 agent runtime 带来什么一致性保证？
2. pending writes 在恢复和 retry 中扮演什么角色？
3. durability=`sync`、`async`、`exit` 的成本和保证如何权衡？
4. DeltaChannel 如何避免 O(N²) checkpoint 增长？重放成本是什么？
5. nested subgraph 的 checkpoint namespace 如何防冲突？
6. error handler 自身失败或 interrupt 时如何恢复？
7. 节点 timeout 与外部 HTTP timeout 应该如何配合？
8. graceful drain 为什么不能取消正在运行的副作用工具？
9. 如何定义 side-effect receipt 的状态机？
10. thread-level lock 与 operation-level idempotency 为什么都需要？
11. 多 agent trace 如何跨 subgraph、remote agent 和 A2A 保持同一 trace ID？
12. 如何在不泄漏敏感 prompt/state 的前提下保留可审计性？
13. 如何测试“结果错误但没有异常”的 agent failure？
14. 如何对 graph topology 和 middleware order 做兼容性测试？
15. 什么时候应该把 LangGraph 放在 Temporal/Restate/Dapr 之上，而不是单独使用？

## 6. 源码追踪题

### 题 1：编译链

从 `StateGraph.add_node()` 开始，追到 node 成为 `PregelNode`。记录：

- node spec
- input mapper
- writer/channel
- trigger
- compiled graph

### 题 2：一次 superstep

从 `Pregel.stream()` 进入，找到：

- loop 初始化
- task selection
- parallel execution
- writes 收集
- channel update
- checkpoint put

### 题 3：一次 interrupt

从节点调用 `interrupt(payload)` 开始，追到：

- scratchpad
- interrupt record
- checkpoint
- stream output
- `Command(resume=...)`
- resumed node

### 题 4：一次 supervisor handoff

从模型调用 `transfer_to_researcher` 开始，追到：

- ToolNode
- handoff ToolMessage
- parent Command
- Send 或 goto
- worker output
- handoff back

### 题 5：一次前端流

从 graph 发出 node update 开始，追到：

- deployment SSE
- SDK parser
- `useStream`
- React Context
- timeline/message component

## 7. 架构练习

### 练习 A：审批后发送邮件

要求：

- draft 节点只生成草稿。
- approval interrupt 发生在 send 前。
- send 使用 operation ID。
- 崩溃重试不能重复发送。
- UI 能展示 pending approval。

### 练习 B：并行研究

要求：

- planner 生成 3-5 个子问题。
- Send 并行。
- reducer 收敛来源。
- 单个子任务失败不丢失其他结果。
- 有总预算和最大循环数。

### 练习 C：动态工具

要求：

- 100 个工具只检索 top 3。
- 用户权限过滤发生在绑定前和执行前。
- 危险工具需要 HITL。
- tool result 大于阈值时外置。

### 练习 D：同题跨框架

分别用 LangGraph、CrewAI、OpenAI Agents SDK 实现同一个客服流程，对比：

- 状态定义
- 路由可见性
- 恢复
- 测试
- 观测
- 自定义成本

## 8. 提问模板

后续不理解时，优先按以下格式提问：

```text
项目 / commit：
文件 / 行号：
我观察到：
我原本以为：
不理解的具体点：
我希望得到：直觉 / 控制流 / 状态变化 / 最小示例 / 对比
```

示例：

```text
项目：langgraph @ 49ae27c
文件：libs/langgraph/langgraph/pregel/_loop.py
我观察到：checkpoint write 和 task write 分开保存。
我原本以为：每个 node 完成后只存一次完整 state。
不理解：pending writes 为什么不能直接并入 checkpoint？
我希望得到：失败重试场景下的时间线解释。
```

这种问法能直接进入证据链，避免重新泛讲整个框架。

## 9. 学习停止条件

满足以下条件后，不再继续横向扩仓：

- 能独立画出 LangGraph 核心执行链。
- 能用持久 saver 完成一次进程级暂停恢复。
- 能解释并验证 reducer 与 Send。
- 能实现一个有幂等保护的 HITL side effect。
- 能用约束而不是 star 完成一次框架选型。

之后只围绕真实项目中的具体问题精读，不再用“多看几个仓库”替代动手验证。
