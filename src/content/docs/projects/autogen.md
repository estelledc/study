---
title: AutoGen — 微软多 Agent 对话框架
来源: https://github.com/microsoft/autogen
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

AutoGen 是微软 2023 年开源的**多 Agent 对话编排框架**。一句话：把多个 LLM 角色拉进一个聊天室，让它们互相讨论、互相纠正，直到把任务做完。

日常类比：

- **单 agent** = 你一个人对着 ChatGPT 提问，所有事自己拍板
- **AutoGen 多 agent** = 拉三个角色进会议室——一个写代码的、一个审代码的、一个跑代码的——他们彼此对话直到给出最终答案

仓库地址 `github.com/microsoft/autogen`，**MIT 协议**，约 35k stars。论文为 arXiv:2308.08155（Wu et al., 2023）。

## 为什么重要

把 AutoGen 单拎出来值得学，原因有四：

1. **首批把"多 agent 对话"做成框架的项目**：之前各家都是单 agent + tool calling，AutoGen 第一个把"agent 之间互相说话"抽象成一等公民。

2. **`ConversableAgent` 这个抽象漂亮**：所有 agent 都继承同一个基类，**收消息 / 发消息 / 注册回复函数**三件事统一，组合起来就能拼出任意拓扑（一对一 / 群聊 / 嵌套对话）。

3. **学术研究底座**：很多 multi-agent 论文（debate、reflection、role-play）都用 AutoGen 做 baseline 实验，因为能 30 行代码搭起对照组。

4. **微软内部产品在用**：Magentic-One（通用 agent 系统）、AutoGen Studio（可视化编排 GUI）都基于它，不是纯学术玩具。

不读 AutoGen 的代价：你想做"两个 agent 互相 review"这种场景，要么自己拼 prompt 拼到崩，要么用 LangChain 强行套链式 API——都不如 AutoGen 直观。

## 核心要点

四个核心抽象：

| 抽象 | 角色 | 类比 |
|------|------|------|
| `ConversableAgent` | 所有 agent 的**基类**，定义收发消息接口 | 会议室里的一个人 |
| `AssistantAgent` | LLM 驱动，默认会写代码 / 做规划 | 拿着电脑的工程师 |
| `UserProxyAgent` | 代理人类，可执行代码、调工具、human-in-loop | 会议主持人，敲键盘的人 |
| `GroupChat` + `GroupChatManager` | 多 agent 轮流发言协议 | 圆桌会议主持，决定谁下一个说话 |

最小可跑代码（v0.2 风格）：

```python
from autogen import AssistantAgent, UserProxyAgent

assistant = AssistantAgent("coder", llm_config={"model": "gpt-4"})
user = UserProxyAgent("user", code_execution_config={"work_dir": "tmp"})

user.initiate_chat(assistant, message="写个 Python 求斐波那契数列")
```

执行流程：

1. `user` 把 message 发给 `assistant`
2. `assistant` 调 LLM 返回代码
3. `user` 自动执行代码（沙箱里）、把结果回传
4. 循环直到 `assistant` 说 `TERMINATE`

## v0.2 vs v0.4 的大重构

2025 年 AutoGen 出了 v0.4，把整个架构推倒重写：

- **v0.2**：同步单线程，一个对话一条消息阻塞往前
- **v0.4**：actor 模型 + 完全异步，三层架构：
  - `autogen-core` —— 消息总线（actor 系统）
  - `autogen-agentchat` —— 高层对话 API（兼容 v0.2 风格）
  - `autogen-ext` —— OpenAI / Anthropic / 工具适配器

实际影响：v0.2 的老代码直接跑会报错，新项目应该用 v0.4 的 `agentchat` 入口。

## 实践案例

### 案例 1：两个 agent 互相 review 代码

```python
coder = AssistantAgent("coder", system_message="你是 Python 工程师")
reviewer = AssistantAgent("reviewer", system_message="你审代码，挑 bug 和性能问题")

coder.initiate_chat(reviewer, message="实现快速排序，等 reviewer 反馈再改")
```

`coder` 写一版，`reviewer` 挑刺，`coder` 改进——**两个 LLM 实例自己来回**，你只看最终结果。

### 案例 2：GroupChat 多角色讨论

```python
from autogen import GroupChat, GroupChatManager

planner = AssistantAgent("planner", system_message="你做任务拆解")
coder = AssistantAgent("coder", system_message="你写代码")
critic = AssistantAgent("critic", system_message="你挑技术债")

group = GroupChat(agents=[planner, coder, critic], messages=[], max_round=10)
manager = GroupChatManager(groupchat=group, llm_config={"model": "gpt-4"})

user.initiate_chat(manager, message="给我做一个 todo 应用")
```

`GroupChatManager` 看上一轮内容自动选下一个发言人——这是 AutoGen 的特色。

### 案例 3：human-in-the-loop

`UserProxyAgent` 设 `human_input_mode="ALWAYS"`，每轮 LLM 输出后**暂停等你按回车**或输入修正——适合调试 prompt 阶段。

## 踩过的坑

1. **代码执行有安全风险**：`UserProxyAgent` 默认会执行 LLM 生成的任意代码。生产环境必须用 `code_execution_config={"executor": DockerCommandLineCodeExecutor()}`，**别在裸机跑**。

2. **GroupChat 死循环**：speaker selection 默认用 LLM 选下一个说话人，万一 LLM 一直选同一个 agent，会原地打转。**永远设 `max_round`**（10-20 起步），并写好 termination 信号（消息含 `TERMINATE` 自动停）。

3. **Token 烧得快**：多 agent 每轮 prompt 都会带**整个对话历史**。10 轮对话 + 4 个 agent，token 量是单 agent 的几十倍。学习时用便宜模型（gpt-4o-mini / claude-haiku），跑通再换大模型。

4. **v0.2 / v0.4 文档混杂**：搜到的教程很多还是 v0.2 风格，对着 v0.4 SDK 跑会 ImportError。建议**直接看 GitHub `python/packages/autogen-agentchat/` 下的 README**，最新最准。

5. **LLM 后端不止 OpenAI**：早期默认用 OpenAI，后来 `autogen-ext` 加了 Anthropic / Azure / Ollama / 本地模型。配置 `llm_config` 时按文档替换 client class，别死磕 OpenAI。

## 适用 vs 不适用场景

**适用**：

- 学多 agent 对话编排（学术研究 / 实验对照组）
- 需要 agent 之间互相 review / debate / 角色扮演的场景
- 可视化编排原型（用 AutoGen Studio）
- 微软生态项目（与 Magentic-One / Semantic Kernel 联动）

**不适用**：

- **简单的链式工作流**——用 LangChain / LlamaIndex 更直接，AutoGen 杀鸡用牛刀
- **生产级稳态 agent**——AutoGen 还在快速演进，API 不稳定，企业级要看 [[langchain-tutorial]] 或自研
- **极致低延迟场景**——多 agent 串行对话延迟天然高
- **学 LLM 原理 / prompt 写法**——AutoGen 是上层框架，不讲底层

## 与同类框架对比

| 框架 | 主打 | 不同点 |
|------|------|--------|
| **AutoGen** | 多 agent 对话 | `ConversableAgent` 抽象，群聊一等公民 |
| **LangChain** | 链式工作流 + 工具调用 | agent 是 chain 的一种，对话不是核心 |
| **CrewAI** | 角色 + 任务分配 | 强调 process / hierarchy，编排重于对话 |
| **MetaGPT** | 模拟一个软件公司 | 固定 SDLC 角色（PM / 架构师 / 工程师），范式更窄 |

学习路径：先 AutoGen 看抽象，再 LangChain 看生态广度，最后看 CrewAI / MetaGPT 看应用范式。

## 历史

- **2023-08**：微软 + Penn State 等合作发表 arXiv:2308.08155，仓库开源
- **2023-10**：v0.1，确立 `ConversableAgent` / `GroupChat` 双核心
- **2024**：AutoGen Studio 发布，加入可视化 GUI；Magentic-One 基于 AutoGen 推出通用 agent
- **2025**：v0.4 重写为 actor 模型，三层架构（core / agentchat / ext）
- **持续迭代**：跟 LLM 新特性（thinking / tool use / vision）保持同步更新

## 学到什么

1. **多 agent 对话是可以抽象的**——`ConversableAgent` 把"收发消息 + 注册回复"做成一等公民，组合性极强
2. **群聊需要 speaker selection 协议**——不是所有 agent 同时说话，是有顺序、有规则的
3. **代码执行必须沙箱化**——LLM 生成代码不可信，docker / VM 隔离是底线
4. **框架重构的代价**——v0.2 → v0.4 把 API 全换了，社区教程跟不上速度

## 延伸阅读

- 仓库：[microsoft/autogen](https://github.com/microsoft/autogen)
- 论文：[AutoGen arXiv 2308.08155](https://arxiv.org/abs/2308.08155)
- 官方教程：[microsoft.github.io/autogen](https://microsoft.github.io/autogen/)
- [[anthropic-cookbook]] —— Claude API 实战，AutoGen 可接 Anthropic 后端做对照
- [[transformer]] —— 多 agent 背后的 LLM 架构基础

## 关联

- [[anthropic-cookbook]] —— 单 agent 工程化示例集，与 AutoGen 多 agent 互补
- [[transformer]] —— LLM 模型架构层，AutoGen 是其上的对话编排层
