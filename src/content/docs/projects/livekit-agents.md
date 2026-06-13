---
title: LiveKit Agents 零基础笔记
来源: https://github.com/livekit/agents
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# LiveKit Agents 零基础笔记

## 一、它是什么？用日常类比理解

想象你要开一家 24 小时语音客服中心。每个客户打进电话后，你需要一个"虚拟接待员"来：

1. **听到**客户说的话（语音转文字 = STT）
2. **理解**客户的意图并思考怎么回答（大语言模型 = LLM）
3. **用语音**把回答说出来（文字转语音 = TTS）

LiveKit Agents 就是一个帮你快速搭建这种"语音虚拟接待员"的 Python 框架。它帮你处理了所有复杂的实时通信、音频流传输、语音检测等底层工作，你只需要告诉它"你是一个什么样的助手"，它就能自动接入客户的语音流，完成听-想-说的完整循环。

**类比：就像你搭积木。** 每个"积木块"负责一件事：
- STT 积木 = 耳朵
- LLM 积木 = 大脑
- TTS 积木 = 嘴巴
- VAD 积木 = 开关（判断对方什么时候说完话）

LiveKit Agents 把这些积木组装起来，你只负责选积木和定义角色。

## 二、核心概念

### 1. Agent（智能体）

Agent 就是你定义的"虚拟角色"。你给它一段 instructions（角色说明），它就按照这个设定和用户对话。

```
Agent = 角色设定 (instructions) + 可调用工具 (tools)
```

### 2. AgentSession（会话）

Session 是 Agent 和真实用户之间的"对话桥梁"。它管理整个对话流程：

```
用户说话 → STT 转文字 → LLM 生成回复 → TTS 转语音 → 用户听到
```

Session 就是这条流水线的主控。

### 3. Worker（工人）

Worker 是一个长期运行的进程，负责监听新的对话请求，然后把每个请求分配给一个 Agent 实例处理。一个 Worker 可以管理多个 Agent。

### 4. Room（房间）

Room 是 LiveKit 里的"虚拟会议室"。用户加入 Room 后，Agent 也加入同一个 Room，双方就能实时语音交流。

### 5. Pipeline（流水线）

这是最关键的比喻。一个完整的语音 Agent 对话，经过以下流水线：

```
麦克风录音 → [VAD 检测说话] → [STT 转文字] → [LLM 思考] → [TTS 朗读] → 扬声器播放
```

每一步都是一个可替换的组件。你可以用 Deepgram 做 STT，OpenAI 做 LLM，Cartesia 做 TTS，彼此独立、自由组合。

### 6. Plugin（插件）

LiveKit 通过插件系统对接各类第三方服务。常用的插件包括：

- **silero**：语音活动检测（VAD），判断用户是否还在说话
- **deepgram** / **aws** / **baseten**：语音转文字（STT）
- **openai** / **anthropic** / **aws**：大语言模型（LLM）
- **cartesia** / **aws** / **baseten**：文字转语音（TTS）

## 三、代码示例

### 示例 1：最简单的语音助手

这是一个最小可用的语音 Agent，使用了 LiveKit 的统一推理 API（Inference），一行代码就能接入不同的模型服务商。

```python
from dotenv import load_dotenv

from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import openai

load_dotenv()

# 定义一个入口函数：当用户加入房间时被调用
async def entrypoint(ctx: agents.JobContext):
    # 先连接到 LiveKit 房间
    await ctx.connect()

    # 创建会话：用 OpenAI 的实时语音 API
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice="coral"  # 选择语音音色
        )
    )

    # 启动会话，绑定角色设定
    await session.start(
        room=ctx.room,
        agent=Agent(
            instructions="You are a helpful voice AI assistant."
        )
    )

    # 让 Agent 主动打招呼
    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )


# 启动整个应用
if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(entrypoint_fnc=entrypoint)
    )
```

**这段代码做了什么：**
- `entrypoint` 是程序入口，当有人加入房间时触发
- `AgentSession` 创建了对话流水线，这里只用了 LLM（OpenAI 的实时 API 自带 STT+TTS）
- `Agent` 定义了角色："你是一个有帮助的语音助手"
- `generate_reply` 让 Agent 主动开口打招呼

### 示例 2：完整流水线 — 含天气查询工具

这个示例展示了更真实的生产级 Agent：STT、LLM、TTS 分别接入不同服务商，并定义了一个自定义工具（查询天气）。

```python
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RunContext,
    cli,
    function_tool,
    inference,
)
from livekit.plugins import silero


# 定义一个自定义工具：查询天气
@function_tool
async def lookup_weather(
    context: RunContext,
    location: str,
):
    """查询指定城市的天气信息"""
    # 这里可以接真实 API，示例返回模拟数据
    return {"weather": "晴朗", "temperature": 23}


async def entrypoint(ctx: JobContext):
    # 创建完整流水线：STT + LLM + TTS 分别指定服务商
    session = AgentSession(
        # VAD：检测用户何时说完话，打断 Agent
        vad=silero.VAD.load(),

        # STT：Deepgram 语音转文字（支持多语言）
        stt=inference.STT("deepgram/nova-3", language="multi"),

        # LLM：OpenAI 大语言模型
        llm=inference.LLM("openai/gpt-4.1-mini"),

        # TTS：Cartesia 文字转语音
        tts=inference.TTS(
            "cartesia/sonic-3",
            voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
        ),
    )

    # 创建 Agent，附带角色设定和工具列表
    agent = Agent(
        instructions="You are a friendly voice assistant.",
        tools=[lookup_weather],  # 注入天气查询工具
    )

    # 启动对话
    await session.start(agent=agent, room=ctx.room)

    # 让 Agent 主动问候
    await session.generate_reply(
        instructions="greet the user and ask about their day"
    )


if __name__ == "__main__":
    cli.run_app(
        agents.WorkerOptions(entrypoint_fnc=entrypoint)
    )
```

**这个示例的关键点：**

- `@function_tool` 装饰器把一个普通函数变成了 LLM 可以调用的"工具"。当用户问"北京天气怎么样"时，LLM 会自动识别意图并调用 `lookup_weather(location="北京")`，然后把结果组织成自然语言回答
- `silero.VAD.load()` 加载语音活动检测模型，它会实时监听音频流，判断用户是否说完一句话。说完之后 LLM 才会开始思考，避免对话重叠
- 每个组件（STT/LLM/TTS）都通过 `inference` 统一 API 接入，换服务商只需要改一行配置

## 四、典型对话流程（一步步拆解）

假设用户说："北京今天天气怎么样？"

| 步骤 | 组件 | 发生的事 |
|------|------|---------|
| 1 | 麦克风 | 用户说话，音频实时传进来 |
| 2 | VAD | 检测到用户在说话 → 开始记录 |
| 3 | VAD | 检测到用户停止说话 → 触发 STT |
| 4 | STT | 把音频转成文字："北京今天天气怎么样？" |
| 5 | LLM | 理解问题，发现需要查天气 → 调用 `lookup_weather` 工具 |
| 6 | 工具 | 返回 `{"weather": "晴朗", "temperature": 23}` |
| 7 | LLM | 把工具结果组织成自然语言："北京今天晴朗，气温23度。有什么其他问题吗？" |
| 8 | TTS | 把文字转成语音音频，播放给用户听 |
| 9 | 扬声器 | 用户听到语音回答 |

整个过程通常在 1-2 秒内完成，用户感觉像是在和一个真人实时通话。

## 五、关键要点总结

1. **LiveKit Agents 不是 AI 模型本身**，它是一个编排框架。它帮你把 STT、LLM、TTS 等组件串成一条流水线
2. **每个组件都可以替换**。STT 可以用 Deepgram、AWS、Baseten 中的任意一个；LLM 可以用 OpenAI、Anthropic、AWS 等
3. **`Agent` 定义角色**，`AgentSession` 管理对话，`Worker` 管理调度 — 三层抽象清晰分离
4. **工具（function_tool）是扩展能力的关键**。通过装饰器把任何 Python 函数变成 LLM 可调用的工具，就能让 AI 访问外部数据
5. **VAD 是语音对话的"开关"**。没有它，对话会重叠混乱；有了它，系统知道什么时候该听、什么时候该说
6. **部署方式**：可以本地运行（`python myagent.py`），也可以 Docker 容器化部署到任意云平台

## 六、安装命令（参考）

```bash
pip install livekit-agents
pip install livekit-plugins-openai
pip install livekit-plugins-silero
pip install livekit-plugins-cartesia
pip install livekit-plugins-deepgram
```

运行前需要设置环境变量（API Key）：

```bash
export LIVEKIT_API_KEY=your_key
export LIVEKIT_API_URL=wss://your-server
export OPENAI_API_KEY=sk-xxx
```
