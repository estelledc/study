---
title: "09. 零基础实验：跑通并行 StateGraph、Reducer 与 Checkpoint"
sidebar:
  hidden: true
---
# 09. 零基础实验：跑通并行 StateGraph、Reducer 与 Checkpoint

> 目标：不用 LLM、API Key 或网络请求，亲手观察 LangGraph 的状态图执行语义。
>
> 代码：[`labs/stategraph_lab.py`](labs/stategraph_lab.py)

## 1. 先建立生活类比

想象两名研究员并行查同一个主题：

```text
任务开始
  -> 研究员 A 写一条发现
  -> 研究员 B 写一条发现
  -> 汇总员合并两条发现
  -> 形成摘要
```

State 是共享工作表，Node 是岗位，Edge 是流程箭头。

两个研究员同时写 `findings` 时，系统必须知道：

- 覆盖旧值？
- 追加？
- 去重？
- 冲突时报错？

Reducer（归并函数）就是这份合并合同。它不是为了让代码好看，而是定义并行写入的语义。

## 2. 图结构

实验图：

```text
                +-> source_a --+
START ----------+              +-> summarize -> END
                +-> source_b --+
```

State：

```python
class ResearchState(TypedDict):
    topic: str
    findings: Annotated[list[str], operator.add]
    summary: str
```

`Annotated[..., operator.add]` 表示同一 superstep 的多个 `findings` 更新要连接起来。

## 3. 运行 pinned LangGraph

从 Study 仓库根目录：

```bash
uv run --no-project \
  --with-editable research-worktrees/langgraph/libs/langgraph \
  python src/content/docs/research/langgraph-ecosystem-study/labs/stategraph_lab.py
```

2026-07-17 实测：

```text
A:reducers | B:reducers
checkpoints=4
```

源码来自本地 pinned LangGraph `49ae27c2ae98`；依赖安装在 uv 隔离缓存，不在第三方仓创建 `.venv`。

## 4. 运行四个测试

```bash
uv run --no-project \
  --with-editable research-worktrees/langgraph/libs/langgraph \
  python -m unittest -v \
  src/content/docs/research/langgraph-ecosystem-study/labs/test_stategraph_lab.py
```

结果：

```text
Ran 4 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| Reducer 合并 | A/B 的 findings 都进入最终 state |
| Checkpoint history | thread 的执行阶段被 InMemorySaver 记录 |
| 无 reducer 冲突 | 并行写同一普通 key 会抛 `InvalidUpdateError` |
| Graph topology | 编译结果含预期节点和边界节点 |

## 5. 为什么第一次运行失败

最初使用：

```text
uv run --project repos/langgraph/libs/langgraph
```

uv 会解析该 monorepo 的完整 workspace source，随后发现 sparse checkout 没有物化 `libs/cli`：

```text
Distribution not found: libs/cli
```

这不是 StateGraph 测试失败，而是**研究 clone 边界**与**workspace 安装合同**冲突。

解决方式不是扩展整个 sparse checkout，而是：

```text
--no-project
--with-editable <pinned libs/langgraph>
```

这样只把核心包作为 editable source 安装，其他依赖从隔离环境解析。

## 6. Superstep 发生了什么

简化流程：

1. START 让 `source_a` 和 `source_b` 同时变为可执行。
2. 两个节点读取同一轮开始时的 state。
3. A 返回 `["A:reducers"]`。
4. B 返回 `["B:reducers"]`。
5. runtime 收集两份 write。
6. reducer 合并成一个 `findings`。
7. 下一 superstep 才运行 `summarize`。

关键点：

> 同一 superstep 中，A 不会先看到 B 刚写的值；更新在 step 边界统一合并。

## 7. Checkpoint 能做什么

InMemorySaver 保存：

- thread 的 state 版本。
- 当前 graph position。
- 后续恢复和 history 查询需要的元数据。

本实验看到 4 个 checkpoint，但它不能提供跨进程持久化；进程结束后内存数据消失。

真实持久化通常换成 SQLite/Postgres saver，并指定：

```python
config = {"configurable": {"thread_id": "stable-id"}}
```

thread ID 区分会话，checkpoint ID 区分同一 thread 的历史版本。

## 8. 为什么 checkpoint 不等于 exactly-once

假设 node 做的是发邮件：

```text
邮件服务已发送
  -> 进程在 checkpoint 前崩溃
  -> 恢复后 node 重跑
  -> 邮件可能再次发送
```

Graph 状态恢复了，不代表外部邮件服务回滚。

危险副作用还需要：

- operation/idempotency ID。
- 外部服务 receipt。
- pending/succeeded/failed/uncertain 状态机。
- 必要时补偿和人工审计。

## 9. 21 个项目放在哪一层

| 层 | 项目 |
|---|---|
| Graph 内核 | LangGraph Python、LangGraph.js、LangGraph4j |
| 标准 Agent | LangChain |
| 高层 Harness | Deep Agents、DeerFlow |
| 拓扑模式 | Supervisor、Swarm、Bigtool、ReAct Agent |
| 教学/索引 | LangGraph 101、Awesome LangGraph |
| UI/应用/API | Agent Chat UI、Gemini Fullstack、Agent Service Toolkit |
| 部署控制面 | Aegra |
| 替代框架 | Microsoft AF、CrewAI、Pydantic AI、OpenAI Agents SDK、Mastra |

选择框架前先问“我缺哪一层”，而不是只比较 star 或 API 写法。

## 10. 三张失败卡

### 卡 1：两个节点写同一 key

没有 reducer：

```text
A -> findings=["a"]
B -> findings=["b"]
```

结果不是随机保留一个，而是明确报冲突。解决方案要根据业务选 append、去重、聚合或禁止并行。

### 卡 2：checkpoint 成功，邮件重复

原因是外部副作用发生在 checkpoint 之前。需要 side-effect receipt，不是再换一个 checkpointer。

### 卡 3：前端断线后消息重复

Graph stream、部署 SSE、SDK parser、React state 是四层。重连要依赖 event ID 和 replay policy，不能只检查 graph state。

## 11. 初学者常见误区

1. **Edge 决定代码执行顺序，所以并行节点能看到彼此写入。**
   正确理解：同一 superstep 读取旧 state，更新在边界合并。

2. **加 checkpointer 就获得 exactly-once。**
   正确理解：它保存 graph state，不接管外部副作用事务。

3. **Deep Agents 是 LangGraph 的竞争框架。**
   正确理解：它是建立在 LangChain/LangGraph 原语上的更高层 Harness。

4. **UI 收不到事件说明 graph 坏了。**
   正确理解：还可能是部署、SSE、SDK 或前端适配问题。

## 12. 应用题与检查点

### 题 1

三个 researcher 并行返回 URL，应该用 `operator.add` 还是去重 reducer？

检查点：如果不同 researcher 可能返回同一 URL，简单 add 会重复；应按业务 identity 去重。

### 题 2

interrupt 前已经调用支付 API，恢复后能否直接重跑 node？

检查点：先查 operation receipt；状态不明时标 uncertain，不能盲目重试。

### 题 3

什么时候普通 `while` loop 比 StateGraph 更合适？

检查点：单一线性流程、无持久恢复/并行/人工暂停需求时，图的维护成本可能不值得。

### 题 4

Pydantic AI 新增 deferred tool event 后，是否就与 LangGraph 完全等价？

检查点：局部能力趋同不代表 state model、checkpoint、topology 和部署语义相同。

### 题 5

一个 Feishu `@bot` 命令解析失败，应该先查 StateGraph 吗？

检查点：先查 channel adapter；消息尚未进入 graph 时，核心图不是第一故障域。

## 13. 完成标准

- [ ] 能画出实验图和两个 superstep。
- [ ] 4 个 pinned LangGraph 实验测试通过。
- [ ] 能解释 reducer 为什么是业务合同。
- [ ] 能区分 checkpoint 与 side-effect receipt。
- [ ] 能把 21 个项目放回正确技术层。
- [ ] 不把 InMemorySaver 结果写成跨进程或生产验收。
