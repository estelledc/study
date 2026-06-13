---
title: AG2 — AutoGen 社区演进
来源: https://github.com/ag2ai/ag2
日期: 2026-06-13
分类: 机器学习
子分类: ai-infra
难度: 中级
provenance: pipeline-v3
---

## 是什么

AG2（前身为 AutoGen）是一个**开源的多 Agent 编排框架**，2024 年 11 月从 Microsoft AutoGen 分叉出来，由全球志愿者社区维护。一句话：它让多个 AI Agent 像团队一样互相对话、互相纠正，协作完成任务。

日常类比：

- **单 agent** = 你一个人对着 ChatGPT 提问，所有事自己拍板
- **AG2 多 agent** = 拉三个角色进会议室——一个写代码的、一个审代码的、一个跑代码的——他们彼此对话直到给出最终答案

仓库地址 `github.com/ag2ai/ag2`，**Apache-2.0 协议**，约 30k+ stars。项目维护者是 Chi Wang 和 Qingyun Wu（AutoGen 的原始作者），通过 [support@ag2.ai](mailto:support@ag2.ai) 联系。

## 为什么从 AutoGen 分出来

2024 年 11 月，AutoGen 团队做了一件大事：成立新组织 [AG2AI](https://github.com/ag2ai)，把项目从微软仓库迁移过去，采用**开放治理**模式。

类比：就像一个大公司内部的项目觉得需要独立一样——不再依赖单一公司决策，全球志愿者一起投票维护。

| 对比项 | Microsoft AutoGen | AG2 (ag2ai) |
|--------|-------------------|-------------|
| 组织 | 微软主导 | 全球志愿者社区 |
| 协议 | MIT（原代码）+ Apache-2.0（修改部分） | 纯 Apache-2.0 |
| 治理 | 公司决定路线图 | 社区贡献者投票 |
| 定位 | 产品驱动 | 纯开源基础设施 |

## 核心概念

### ConversableAgent — 所有 Agent 的基类

`ConversableAgent` 是 AG2 里最小的"人"。它做三件事：**发消息、收消息、用 LLM 生成回复**。所有其他 Agent（AssistantAgent、UserProxyAgent）都继承它。

类比：会议室里的一个人，能听、能说、能思考。

### Orchestrator — 调度员

多 Agent 协作需要有人决定**谁在什么时候说话**。AG2 提供多种编排模式：

- **Swarm**：一群 Agent 平级协作，类似头脑风暴
- **Group Chat**：圆桌会议，由 GroupChatManager 决定下一个发言者
- **Nested Chat**：对话嵌套——一个 Agent 里又启动另一组对话
- **Sequential Chat**：接力赛，A 做完传给 B，B 做完传给 C

类比：不同的开会方式。Swarm 是自由讨论，Group Chat 是有主持人，Nested Chat 是"小会里套小会"，Sequential 是接力传球。

### Tools — 工具

Agent 本身只会聊天，加上工具才能做实事。AG2 里注册工具很简单——用 Python 函数装饰器或 `register_function` 把函数挂到 Agent 上，LLM 在聊天过程中自动调用。

类比：给一个只会说话的人配上计算器、浏览器、代码执行器——工具扩展了他的能力。

### Human-in-the-Loop — 人在回路

`UserProxyAgent` 代表人类介入对话。设 `human_input_mode` 可以控制人类何时介入：**每轮都问 / 只在必要时问 / 不介入**。

类比：会议上有一个领导，有权叫停或修正方向。

## 代码示例

### 示例 1：最简单的 Agent 对话

创建一个"程序员 Agent"和一个"用户 Agent"，用户给程序员布置任务，程序员写代码，用户执行并反馈结果：

```python
from autogen import AssistantAgent, UserProxyAgent, LLMConfig

# 加载 API 配置（类似 .env 的 JSON 文件）
llm_config = LLMConfig.from_json(path="OAI_CONFIG_LIST")

# 两个 Agent
assistant = AssistantAgent(
    "assistant",
    llm_config=llm_config,
    system_message="你是一个 Python 工程师，只写代码不废话。"
)

user = UserProxyAgent(
    "user",
    code_execution_config={"work_dir": "coding", "use_docker": False},
    human_input_mode="NEVER"  # 自动执行，不等你输入
)

# 发起对话：用户给任务，assistant 回答，user 执行代码并回传
chat_result = user.initiate_chat(
    assistant,
    message="用 Python 写一个函数，计算两个数的最大公约数"
)

# 查看对话摘要
print(chat_result.summary)
```

执行流程（四步循环）：
1. `user` 把消息发给 `assistant`
2. `assistant` 调 LLM 返回 Python 代码
3. `user` 自动在本地执行这段代码，把结果回传
4. 直到 `assistant` 在回复里输出 `TERMINATE` 为止

### 示例 2：Group Chat 多人讨论

三个 Agent 协作设计课程大纲：**老师**出主题、**策划**写方案、**评审**提意见——循环直到达成共识：

```python
from autogen import ConversableAgent, LLMConfig
from autogen.agentchat import run_group_chat
from autogen.agentchat.group.patterns import AutoPattern

llm_config = LLMConfig.from_json(path="OAI_CONFIG_LIST")

# 策划 Agent
planner = ConversableAgent(
    name="planner",
    system_message="你是课程策划。给定主题，写出四年级课程大纲。",
    description="撰写或修改课程大纲",
    llm_config=llm_config,
)

# 评审 Agent
reviewer = ConversableAgent(
    name="reviewer",
    system_message="你是课程评审。对照教学大纲，提出最多3条改进建议。",
    description="对课程大纲提供一轮反馈",
    llm_config=llm_config,
)

# 老师 Agent（决策者，看到 DONE! 就结束）
teacher = ConversableAgent(
    name="teacher",
    system_message="你是资深教师。你决定主题，与策划和评审协作，满意时输出 DONE!",
    is_termination_msg=lambda x: "DONE!" in (x.get("content", "") or "").upper(),
    llm_config=llm_config,
)

# 编排：自动选择下一个发言者
auto_selection = AutoPattern(
    agents=[teacher, planner, reviewer],
    initial_agent=planner,
    group_manager_args={"name": "manager", "llm_config": llm_config},
)

result = run_group_chat(
    pattern=auto_selection,
    messages="给孩子们讲太阳系",
    max_rounds=20,
)

result.process()
print(result.summary)
```

这里 `AutoPattern` 自动决定每轮谁该说话——`teacher` 先让 `planner` 写大纲，然后 `reviewer` 提意见，`planner` 修改后再让 `teacher` 拍板，循环最多 20 轮。

### 示例 3：给 Agent 注册工具

让 Agent 能查日期对应的星期几——这是"工具调用"最简演示：

```python
from datetime import datetime
from typing import Annotated
from autogen import ConversableAgent, register_function, LLMConfig

llm_config = LLMConfig.from_json(path="OAI_CONFIG_LIST")

# 工具函数（就是一个普通 Python 函数）
def get_weekday(date_string: Annotated[str, "格式: YYYY-MM-DD"]) -> str:
    """返回给定日期是星期几"""
    date = datetime.strptime(date_string, "%Y-%m-%d")
    return date.strftime("%A")

# 两个 Agent：一个是工具调用者，一个是执行者（不跟人交互）
date_agent = ConversableAgent(
    name="date_agent",
    system_message="你帮用户查日期对应的星期。",
    llm_config=llm_config,
)

executor = ConversableAgent(
    name="executor",
    human_input_mode="NEVER",
    llm_config=llm_config,
)

# 把工具注册进去：caller 发起调用，executor 负责执行
register_function(
    get_weekday,
    caller=date_agent,
    executor=executor,
    description="获取某日期对应的星期几",
)

# Agent 开始对话
chat_result = executor.initiate_chat(
    recipient=date_agent,
    message="我出生在 1995-03-25，那天是星期几？",
    max_turns=2,
)

print(chat_result.chat_history[-1]["content"])
```

## AG2 路线图

AG2 目前正处于 **v1.0 的过渡期**。官方明确指出：

> 当前的框架正在逐步精简（deprecations），`autogen.beta` 模块将成为 v1.0 的正式版本。

这意味着：
- **老 API 会逐渐被标记为废弃**，新项目建议用 `autogen.beta` 下的接口
- v1.0 之前 API 仍可能变化，生产项目要注意锁定版本
- 完整路线图见 [docs.ag2.ai](https://docs.ag2.ai/latest/docs/user-guide/release-roadmap/)

## 踩过的坑

1. **代码执行有安全风险**：`UserProxyAgent` 默认会执行 LLM 生成的任意代码。生产环境必须用 Docker 隔离，**别在裸机跑**。

2. **Group Chat 死循环**：Speaker selection 默认用 LLM 选下一个发言人，LLM 可能一直选同一个 Agent 导致原地打转。**永远设 `max_round`**，并写好 termination 信号。

3. **Token 烧得快**：多 Agent 每轮 prompt 都带整个对话历史。10 轮对话 + 4 个 Agent，token 量是单 Agent 的几十倍。学习时用便宜模型（gpt-4o-mini / claude-haiku），跑通再换大模型。

4. **API 仍在变**：AG2 从 AutoGen 分叉后正在经历 v1.0 重构，`beta` 模块和正式模块的 API 可能不一致。跟着 [官方文档](https://docs.ag2.ai) 走，别盲信过时的教程。

5. **API 密钥管理**：AG2 推荐用 `OAI_CONFIG_LIST` JSON 文件存密钥，**一定加到 .gitignore**。也可以用环境变量替代。

## 适用 vs 不适用场景

**适用**：

- 学多 Agent 对话编排（学术研究 / 实验对照组）
- 需要 Agent 之间互相 review / debate / 角色扮演的场景
- 快速搭建多人协作的 AI 应用原型
- 追求开放治理、不绑定单一公司的项目

**不适用**：

- **简单的链式工作流**——用 LangChain 更直接，AG2 杀鸡用牛刀
- **生产级稳态 Agent**——API 还没到 v1.0，企业级要看稳了再上
- **极致低延迟场景**——多 Agent 串行对话延迟天然高
- **学 LLM 原理**——AG2 是上层框架，不讲底层模型

## 与同类框架对比

| 框架 | 主打 | 不同点 |
|------|------|--------|
| **AG2** | 多 Agent 对话 | `ConversableAgent` 抽象，群聊一等公民，社区治理 |
| **LangChain** | 链式工作流 + 工具调用 | Agent 是 chain 的一种，对话不是核心 |
| **CrewAI** | 角色 + 任务分配 | 强调 process / hierarchy，编排重于对话 |
| **MetaGPT** | 模拟软件公司 | 固定 SDLC 角色（PM/架构师/工程师），范式更窄 |

## 历史

- **2023-08**：微软 + Penn State 发表 arXiv:2308.08155，AutoGen 开源
- **2023-10**：AutoGen v0.1，确立 `ConversableAgent` / `GroupChat` 双核心
- **2024-05**：DeepLearning.ai 推出 AutoGen 短期课程；Forbes 发表"多 Agent AI 的希望"
- **2024-11-11**：AutoGen 分叉为 **AG2**，新组织 [AG2AI](https://github.com/ag2ai) 成立，开放治理
- **2025**：AG2 进入 v1.0 过渡期，`autogen.beta` 成为正式版本候选
- **持续迭代**：跟随 LLM 新特性（thinking / tool use / vision）保持更新

## 学到什么

1. **多 Agent 对话是可以抽象的**——`ConversableAgent` 把"收发消息 + 注册回复"做成一等公民，组合性极强
2. **群聊需要调度协议**——不是所有 Agent 同时说话，是有顺序、有规则的（Speaker Selection）
3. **开放治理 > 公司主导**——AG2 分叉说明：开源项目社区化了才更持久
4. **框架重构是双刃剑**——v1.0 过渡期意味着 API 不稳定，学的时候可以追，生产要等稳定

## 延伸阅读

- 仓库：[ag2ai/ag2](https://github.com/ag2ai/ag2)
- 文档：[docs.ag2.ai](https://docs.ag2.ai)
- 示例集：[ag2ai/build-with-ag2](https://github.com/ag2ai/build-with-ag2)
- 论文：[AutoGen arXiv 2308.08155](https://arxiv.org/abs/2308.08155)
- Discord：[ag2ai Discord 社区](https://discord.gg/pAbnFJrkgZ)
- [[autogen]] —— AutoGen 原仓库笔记，了解分叉前发生了什么

## 关联

- [[autogen]] —— AutoGen 是 AG2 的前身，本笔记建立在它的基础上
- [[langchain-tutorial]] —— 单 Agent 链式工作流的对比参考
