---
title: AutoGen — 多智能体对话框架
来源: 'Wu et al., "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation", 2023'
日期: 2026-05-29
子分类: 智能体与 LLM
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

AutoGen 是 Microsoft 2023 年发布的一套**让多个 LLM agent 互相对话来完成复杂任务**的框架。日常类比：单 agent 像一个独立工人；AutoGen 像项目组——产品经理 agent 提需求、工程师 agent 写代码、QA agent 审查。

你写：

```python
assistant = AssistantAgent(name="coder")
user_proxy = UserProxyAgent(name="user")
user_proxy.initiate_chat(assistant, message="画个正弦波保存为 png")
```

两个 agent 自动开始对话——assistant 写 Python 代码，user_proxy 跑代码、把 stdout 喂回去，循环直到任务完成。

这种"多个 LLM 互相讲话"的范式，是 2023-2024 年 multi-agent 框架的奠基之作。

## 为什么重要

不理解 AutoGen，下面这些事都没法解释：

- 为什么 2024 年的 multi-agent 框架（CrewAI / Swarm / MetaGPT）都长得像它——它们都继承了"agent 之间用消息通讯"的抽象
- 为什么 LLM agent 能"真的执行代码"而不只是嘴炮——AutoGen 把 Code Executor 做成可插拔模块
- 为什么 GroupChat 模式能让 3 个 agent 像开会一样轮流发言——它引入了 speaker selection 调度器
- 为什么复杂任务（写论文 / 跑实验 / 自动化测试）能拆给多 agent 协作完成

## 核心要点

AutoGen 的设计可以拆成 **三个核心组件**：

1. **Conversable Agent**：每个 agent 有 system prompt（定角色）+ 工具列表（能干什么）+ 对话能力（receive / send 消息）。类比：每个工人有一份岗位说明书 + 一套工具箱 + 能跟同事讲话的嘴。

2. **GroupChat**：多个 agent 在同一个对话池里，由 GroupChatManager 按 speaker selection 策略（round-robin / 随机 / LLM 决定）选下一个发言人。类比：项目组开会，主持人决定谁讲。

3. **Code Executor**：agent 输出的 Python 代码块会被自动抠出来、跑掉、把 stdout/stderr 当回复喂回 LLM。可选 Local subprocess（快但不安全）或 Docker（隔离）。类比：工程师写完代码，QA 自动跑测试，结果直接回到讨论里。

三个组件加起来叫 **多 agent 对话框架**——它的发动机是"消息 + reply 钩子链"。

## 实践案例

### 案例 1：AssistantAgent + UserProxyAgent（最小双 agent）

```python
import autogen

assistant = autogen.AssistantAgent(name="assistant", llm_config={...})
user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    code_execution_config={"work_dir": "coding", "use_docker": True},
)
user_proxy.initiate_chat(assistant, message="把当前目录下所有 .py 行数统计出来")
```

**对话过程**：

- assistant 收到任务 → 输出一段 Python 代码
- user_proxy 抠出代码 → 在 Docker 里跑 → 把结果喂回 assistant
- assistant 看到结果 → 输出 `TERMINATE` 终止对话

这就是最简单的"嘴 + 手"协作——assistant 是嘴（出主意），user_proxy 是手（真做事）。

### 案例 2：GroupChat 三 agent 讨论

```python
pm  = AssistantAgent(name="pm",  system_message="你是产品经理，提需求...")
eng = AssistantAgent(name="eng", system_message="你是工程师，写代码...")
qa  = AssistantAgent(name="qa",  system_message="你是 QA，审查代码...")

groupchat = autogen.GroupChat(agents=[pm, eng, qa], speaker_selection_method="auto")
manager = autogen.GroupChatManager(groupchat=groupchat, llm_config={...})
pm.initiate_chat(manager, message="做一个登录功能")
```

`speaker_selection_method="auto"` 让 manager 内部 LLM 看历史 + 角色描述，决定下一轮谁发言。三个 agent 像开会一样轮流讲话，最后产出一份"需求 + 代码 + 审查"的完整方案。

### 案例 3：AutoGen Studio（拖拽搭 agent）

官方提供的可视化工具——浏览器里拖拽 agent 节点、连线定义对话流、不写代码就能搭出 multi-agent 系统。适合不想写 Python 的产品经理 / 设计师快速验证想法。

```bash
pip install autogenstudio
autogenstudio ui --port 8080
```

打开 localhost:8080 就能看到拖拽界面，本质是上面那套 Python 代码的 GUI 包装。

## 踩过的坑

1. **本地 Code Executor 等于把 LLM 当 shell**：默认 `use_docker=False` 时，LLM 输出 `rm -rf ~` 会真的执行。生产场景必须切 Docker，并加 read-only mount + 资源限制。

2. **`speaker_selection_method="auto"` 调度成本高**：每轮都要多发一次 prompt 让 manager 的 LLM 选下一个 speaker，token 至少翻倍。3 agent 场景下调度成本能吃掉 25-35% 总开销。token 敏感时改用 `round_robin`。

3. **GroupChat 容易陷入死循环**：如果没设 `max_round`，agent 们可能你来我往讲个不停。默认 10 轮已经偏激进，生产建议 max_round=3-5 + 明确的 termination message。

4. **0.2 和 0.4 API 几乎不兼容**：2024-Q4 重写后 `pyautogen` 包名变了、ConversableAgent 的内部机制全换了。生产用要选定一个版本，不要混用。

## 适用 vs 不适用场景

**适用**：

- 任务能自然拆成"多角色讨论"——产品 / 工程 / QA / 评审 这种
- 需要 agent 真的执行代码（数据分析 / 跑实验 / 自动化脚本）
- 需要"人工 in the loop"——某些步骤等人确认再继续

**不适用**：

- 任务结构高度固定（A → B → C 流水线）→ 用 LangGraph 显式状态机更稳
- 极简场景（一个 agent + 一个 tool 就够）→ 直接调 LLM API，不用框架
- 严格生产环境（高并发 / 低延迟）→ 0.2 的责任链调度太重，0.4 重写但还在迭代
- 需要严格安全隔离 → AutoGen 的 Docker 隔离不够强，需自己加固

## 历史小故事（可跳过）

- **2023-08**：Microsoft Research 团队发布 AutoGen v1（arXiv 2308.08155）。当时 ReAct / Reflexion / Voyager 都还是单 agent 范式，AutoGen 第一次把"多 agent 对话"做成开源框架。
- **2023-10**：v0.2 正式加入 GroupChat + GroupChatManager，让"多人会议"模式成为标配。GitHub stars 从几千冲到 1 万+。
- **2024-01**：[[metagpt]] / CrewAI 跟进——MetaGPT 把多 agent 写成固定 SOP（PM / Architect / Engineer / QA），CrewAI 把 AutoGen 重新包装成更易上手的 DSL。
- **2024-09**：AutoGen 0.4 重构——把 reply_func 责任链换成 actor model（AgentRuntime + 显式 message subscription），承认 0.2 的设计在大规模场景调试困难。
- **2024-11**：OpenAI Swarm 发布——故意做得极简，只有 Agent + handoff 两个概念，可以理解为"AutoGen 减负版"。

## 学到什么

1. **多 agent 协作的关键不是"agent 多聪明"，而是"agent 之间怎么讲话"**——AutoGen 的 conversation 抽象是这个领域的奠基决定
2. **消息 + reply 钩子链** 是优雅但调试痛的设计——0.2 用，0.4 自己换掉了
3. **Code Executor 让 agent 从嘴炮变真做事**——这是 AutoGen 区别于纯对话 agent 的核心优势
4. **范式 → 框架 → 应用**：2023-08 论文 → 2023-10 框架成熟 → 2024 一堆下游框架（CrewAI / Swarm / MetaGPT）都站在它肩膀上

## 延伸阅读

- 官方教程：[Microsoft AutoGen Docs](https://microsoft.github.io/autogen/)（quickstart + 6 个 case study，跑一遍 2 小时）
- 论文 PDF：[arXiv 2308.08155](https://arxiv.org/abs/2308.08155)（22 页，框架部分必读）
- 对照阅读：[CrewAI 仓库](https://github.com/crewAIInc/crewAI) 看下游框架怎么把同一套思想重新包装

## 关联

- [[metagpt]] —— 把多 agent 写成固定 SOP（PM / Architect / Engineer / QA），是 AutoGen 思想在"应用层"的具象化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
- [[mcp-spec]] —— MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
- [[metagpt]] —— MetaGPT — 多智能体软件公司
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[reflexion]] —— Reflexion — 让 LLM 自我反思

