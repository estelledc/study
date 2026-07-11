---
title: OpenAI Agents SDK — 让多个 agent 协作的轻量框架
来源: OpenAI Agents Python SDK 官方文档 https://openai.github.io/openai-agents-python/
日期: 2026-05-31
分类: AI 工程
难度: 初级
---

## 是什么

OpenAI Agents SDK 是一个 **Python 库**，专门用来写"多个 AI agent 配合干活"的程序。日常类比：像一家小公司，你定义几个员工（agent），每个员工有自己的职责说明（指令）和工具（能调用的函数），SDK 负责让他们排队、互相转介、出错时停下。

最小例子（5 行能跑）：

```python
from agents import Agent, Runner
agent = Agent(name='Assistant', instructions='You are a helpful assistant')
result = Runner.run_sync(agent, 'Your prompt here')
print(result.final_output)
```

这个 SDK 是 OpenAI 早期实验项目 **Swarm** 的生产化升级；本文按 2026-05 文档快照（当时 PyPI 常见为 v0.17.x），MIT 协议，需要 Python 3.10+。

## 为什么重要

不理解这个 SDK，遇到下面的事会一头雾水：

- 为什么"多 agent 系统"在 2024 年后突然成了 AI 工程的主线——单一 prompt 已经不够用
- 别的框架（LangGraph / CrewAI / AutoGen）和它有什么区别——它故意做得更薄
- 它的三个核心原语 **handoff / guardrail / tracing** 各管什么——这是这篇笔记的主线

它的设计哲学只有两条：

1. 原语少到一下能学会，但功能足以做产品
2. 默认能跑，每一处都能定制

不发明 DSL，编排逻辑用 Python 自己的 if/for/await 写。

## 核心要点

SDK 暴露的原语只有 **7 个**，但理解 3 个就够了：

| 原语 | 一句话 | 类比 |
|------|--------|------|
| Agent | LLM + 指令 + 工具 | 员工 |
| Runner | 跑 agent 循环 | 让员工开始干活 |
| Tools | 把 Python 函数变成 LLM 可调用的工具 | 员工手里的工具箱 |
| **Handoff** | agent 把对话交给另一个 agent | 转介给同事 |
| **Guardrail** | 跑前/跑后校验，命中就中断 | 安检门 |
| **Tracing** | 自动记一棵调用树 | 监控录像 |
| Sessions | 跨轮持久化的工作记忆 | 工位上的便利贴 |

本笔记重点对照后三个：它们分别管"谁来跑 / 能不能跑 / 跑了什么"，是多 agent 产品里最常要做的三个设计选择。

## 实践案例

### 案例 1：Handoff——改变"谁来跑"

```python
from agents import Agent, handoff
billing = Agent(name='Billing agent')
refund = Agent(name='Refund agent')
triage = Agent(name='Triage', handoffs=[billing, handoff(refund)])
```

运行时发生了什么：

1. SDK 把 billing / refund 这两个 agent 在 LLM 视角包装成两个"工具"，名字自动叫 `transfer_to_billing_agent` / `transfer_to_refund_agent`
2. LLM 看了用户输入，决定调哪个工具——这一步本质上和它选普通 function tool 一样
3. 一旦选中，runner 把控制权切给目标 agent，**对话历史默认全量带过去**（可以用 `input_filter` 过滤）
4. 整个过程留在 **同一次 run 内**，不会断开上下文

`handoff()` 函数的额外能力：自定义工具名 / 描述、注册 `on_handoff` 回调、限定 `input_type`、用 `input_filter` 改写传给下游的历史。

### 案例 2：Guardrail——改变"能不能跑"

```python
@input_guardrail
async def math_guardrail(ctx, agent, input):
    result = await Runner.run(guardrail_agent, input)
    return GuardrailFunctionOutput(
        output_info=result.final_output,
        tripwire_triggered=result.final_output.is_math_homework,
    )

agent = Agent(name='Support', input_guardrails=[math_guardrail])
```

运行时发生了什么：

1. 用户问了一个问题，主 agent 开始跑
2. 同时 `math_guardrail` 也开始跑（**默认并行**）——它内部又跑了一个小 agent 判断"这是不是数学作业"
3. 如果 guardrail 返回 `tripwire_triggered=True`，SDK **立即抛异常** `InputGuardrailTripwireTriggered`，主 agent 哪怕跑到一半也被打断
4. output_guardrail 同理，但只能在主 agent 跑完后再校验（不能并行）

并行模式省延迟，但主 agent 可能已经烧了 token；要彻底省 token，用阻塞模式。

### 案例 3：Tracing——记录"跑了什么"

```python
from agents import Agent, Runner, trace
with trace('Customer support flow'):
    result = await Runner.run(triage, 'I want a refund')
```

运行时发生了什么：

1. `with trace(...)` 开了一个 **trace 容器**（有 trace_id / workflow_name / 可选 group_id）
2. 容器内部的每次 LLM 调用、每次工具调用、每次 handoff、每次 guardrail，都自动变成一个 **span**——有起止时间和父子关系
3. SDK 默认把这棵树上报到 OpenAI 后台，可以在 dashboard 里展开看
4. 不想上报：环境变量 `OPENAI_AGENTS_DISABLE_TRACING=1` / 代码 `set_tracing_disabled(True)` / per-run 配 `RunConfig.tracing_disabled=True`
5. 想换地方上报：`add_trace_processor(...)` 加一个、`set_trace_processors(...)` 全替换

**注意**：用 OpenAI API 且签了 ZDR（Zero Data Retention，零数据保留：提供商不落盘你的请求内容）合同的组织，tracing 直接不可用。

## 踩过的坑

1. **三个原语容易混淆**：handoff 改"谁跑"、guardrail 改"能不能跑"、tracing 只是"记下来跑了什么"。三个角色互不替代，新人常把 guardrail 和 tracing 都当成"安全机制"，其实 tracing 不阻断任何东西。

2. **handoff 不是 function call**：在 LLM 视角它确实长得像工具，但 runner 拦截后会切换主 agent。如果你把它当普通 function tool 实现一遍，会丢失"切上下文"的语义。

3. **input_guardrail 默认并行 ≠ 没成本**：tripwire 触发时主 agent 可能已经吃了一段 token。要彻底防火，用阻塞模式 `run_input_guardrails_first=True`。

4. **trace 里看不到东西**：检查 `OPENAI_AGENTS_DISABLE_TRACING` 没被环境继承、ZDR 政策没启用、长时任务后调了 `flush_traces()`。

## 适用 vs 不适用场景

**适用**：

- 多 agent 协作（客服分流、代码生成 + 校对、检索 + 总结分工）
- 需要在请求边界做安全校验（guardrail）的产品
- 需要用 dashboard 看 agent 调用链调试问题
- 想用 OpenAI API 但也支持 100+ 其他 LLM 的混合栈

**不适用**：

- 单一 agent、无工具、对话轮次 < 3 就能搞定——直接调 Chat Completions 更简单
- 需要复杂图状工作流（条件分支、循环、回退节点）→ LangGraph 这类显式图引擎更合适
- 完全本地推理且禁止任何遥测出网 → 可关 tracing，但生态仍按 OpenAI 后端调优

## 历史小故事（可跳过）

- **2024 年**：OpenAI 开源实验项目 Swarm，用极少原语演示多 agent handoff
- **2025 年**：Agents SDK 接棒 Swarm，补上 guardrail、tracing、sessions，走向可维护的生产 API
- **设计选择**：不发明工作流 DSL，编排留给普通 Python `async`/`if`/`for`
- **生态**：官方文档同步维护 handoffs / guardrails / tracing 专章，和本笔记三条主线一一对应

## 学到什么

1. **多 agent 框架的最小原语集不大**：Agent + Runner + Tool + Handoff + Guardrail + Tracing + Session，七件套。设计上做减法比做加法难
2. **handoff / guardrail / tracing 是三个正交维度**：一个改路由、一个加门禁、一个加可观测性
3. **Python 优先 = 不发明 DSL**：编排用普通 await / if / for，意味着学习曲线只是"学这个库"而不是"再学一门小语言"
4. **生产化的关键是可观测性**：自动 tracing 把 agent 系统从"玄学"拉回"可调试软件"

## 延伸阅读

- 官方文档：[openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/)
- Handoffs 章节：[handoffs](https://openai.github.io/openai-agents-python/handoffs/)
- Guardrails 章节：[guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- Tracing 章节：[tracing](https://openai.github.io/openai-agents-python/tracing/)
- 仓库：[github.com/openai/openai-agents-python](https://github.com/openai/openai-agents-python)（MIT）

## 关联

- [[anthropic-cookbook]] —— 另一家厂的 agent 实现范式合集，可对照看哲学差异
- [[langgraph]] —— 用显式图引擎做 agent 编排，和 SDK"少原语 + Python 控制流"路线相反
- [[crewai]] —— 把多 agent 抽象成"角色 + 任务 + 流程"的另一种 DSL 取向
- [[autogen]] —— 微软多 agent 对话框架，适合对比"聊天室"与"handoff 转介"两种协作模型
- [[langchain]] —— 更重的链式/代理生态；Agents SDK 刻意更薄

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aider]] —— Aider — 终端 AI 结对编程 CLI
