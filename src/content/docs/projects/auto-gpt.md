---
title: AutoGPT — 自主 Agent 先驱
来源: https://github.com/Significant-Gravitas/AutoGPT
日期: 2026-06-13
子分类: ai-agent-infra
分类: 机器学习
难度: 入门
provenance: pipeline-v3
---

## 是什么

**AutoGPT** 是最早让大语言模型"自己决定下一步做什么"的开源项目之一。它的核心想法很简单：把 LLM 的输出喂回去，让它看着自己的行为结果继续决定下一步。这样反复循环，就能一步步朝目标前进。

日常类比：

- 传统程序像**工厂流水线**——每一步都写死了，A 做完交给 B，B 做完交给 C。改流程就得重新设计整条线。
- AutoGPT 像一个**实习生**——你告诉他"帮我做一份市场调研报告"，他不问细节，自己上网搜、整理数据、写草稿、发现问题再回头查。每次做完一步，他看一眼结果，决定下一步干什么。
- 区别在于：实习生的"大脑"是 GPT-4（或类似模型），他能读网页、写文件、调 API，但偶尔会跑题、会忘事、会陷入死循环。

2022 年底发布，至今 70k+ star。当前分为两条线：

- **AutoGPT Classic**（`classic/` 目录）：最早的单体 Agent，MIT 协议。已停止安全更新，但仍是学习 Agent 架构的最佳教材
- **AutoGPT Platform**（`autogpt_platform/` 目录）：新版平台，支持低代码拖拽搭建 Agent、部署为持续运行的服务，Polyform Shield 协议

## 为什么重要

AutoGPT 在 AI 历史上扮演了"第一个让人看到 Agent 可能性的角色"：

- **证明了"循环决策"可行**：2022 年之前，大家知道 GPT-4 聪明，但没人系统性地展示过一个程序能让 LLM 自主规划、执行、反思、再规划。AutoGPT 的 README 原文："let an LLM decide what to do over and over, while feeding the results of its actions back into the prompt"——一句话概括了后来几乎所有 Agent 框架的核心思想
- **催生了整个 Agent 工具生态**：Forge（Agent 脚手架）、agbenchmark（Agent 评测基准）、Agent Protocol（跨 Agent 通信标准）都是从 AutoGPT 孵化出来的
- **推动了 Agent Protocol 标准化**：AutoGPT 采用 AI Engineer Foundation 的 Agent Protocol，让不同 Agent 能共用前端和评测工具，类似"USB 接口"的作用

## 核心概念

### 1. 思维链循环（Thought-Action-Observation Loop）

这是 AutoGPT Classic 最核心的架构。Agent 每一轮做三件事：

1. **Thought（思考）**：问 LLM"我现在的情况是什么？下一步该干嘛？"
2. **Action（行动）**：执行一个具体操作，比如搜索网页、读写文件、调用 API
3. **Observation（观察）**：把行动的结果拿回来，拼进下一轮的 prompt，让 LLM 看到效果

这个过程不断循环，直到 LLM 判断目标已完成。

```
┌──────────┐    prompt    ┌──────────────┐   行动结果   ┌──────────┐
│ Thought   │ ──────────► │  Action      │ ───────────► │ Observation│
│ (LLM 决定)│ ◄────────── │ (执行操作)    │              │ (结果反馈) │
└──────────┘   下一轮     └──────────────┘              └──────────┘
```

### 2. 记忆系统（Memory）

Agent 会忘事——这是 LLM 的固有特性。AutoGPT 用两种记忆弥补：

- **短期记忆（Short-term）**：当前 prompt 里装着最近几轮的 thought-action-observation 历史，上下文窗口有限，旧信息会被挤出
- **长期记忆（Long-term）**：用向量数据库（如 ChromaDB）把关键信息存成 embedding，需要时检索召回

### 3. 组件化架构（Forge）

AutoGPT Classic 的 Forge 把 Agent 拆成**组件（Components）**，每个组件负责一块能力：

- `Command`：Agent 能做的具体动作（搜索、读文件、发消息）
- `Plugin`：外部能力的插件（接入某个 API）
- `Critic`：反思组件，检查上一步做得对不对

自定义 Agent 时，你不需要从零写，而是像搭乐高一样组合组件。

## 代码示例

### 示例 1：Classic AutoGPT 的决策循环（简化版）

这是 AutoGPT Classic 中 `agent.py` 里 `_carry_out_task` 方法的简化示意：

```python
class Agent:
    def _carry_out_task(self, goal: str):
        """持续循环：思考 -> 行动 -> 观察，直到目标完成"""
        while True:
            # 1. 思考：把当前目标和历史消息喂给 LLM，让它决定下一步
            response = self.llm.ask(
                messages=self.message_history,
                prompt=f"Goal: {goal}. What should I do next?"
            )

            # 2. LLM 返回一个动作，比如 {"action": "google", "args": "AI agent survey 2024"}
            action = self._parse_response(response)

            # 3. 如果 LLM 说"任务完成"，退出循环
            if action["action"] == "finish":
                break

            # 4. 执行动作，拿到结果
            result = self._execute(action)

            # 5. 把结果记入历史，下一轮继续
            self.message_history.append({"role": "observation", "content": result})
```

关键点：**while True 里没有硬编码逻辑**。每一步做什么，完全由 LLM 决定。你给的是"目标"，不是"步骤"。

### 示例 2：用 Forge 搭建一个自定义 Agent

这是 Forge 的推荐写法——继承 `Agent` 基类，加入自己的组件：

```python
from forge.agent import Agent
from forge.components import CodeExecutor, WebSearch
from pydantic import BaseModel

# 定义你的组件输入输出
class QuoteResult(BaseModel):
    quote: str
    source: str

# 自定义组件：从视频里提取金句
class VideoQuoteExtractor:
    def extract(self, video_url: str) -> QuoteResult:
        # 这里可以调 YouTube API 获取字幕，再用 LLM 提取金句
        ...

# 组装你的 Agent
class VideoAgent(Agent):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 加入默认组件（搜索、代码执行）
        self.web_search = WebSearch()
        self.code_executor = CodeExecutor()
        # 加入自定义组件
        self.quote_extractor = VideoQuoteExtractor()

    def propose_action(self):
        # 覆写决策逻辑：加入视频金句提取的选项
        return super().propose_action()
```

Forge 的精髓：**你只需要写 `VideoQuoteExtractor` 那一小块**，其余的连接、循环、prompt 管理全部由 `Agent` 基类搞定。

### 示例 3：新版平台的 Block 开发（Python）

AutoGPT Platform 用"积木"（Block）来构建 Agent 工作流。添加一个新 Block 只需：

```python
from backend.sdk.block import Block
from pydantic import BaseModel

class RedditTopicInput(BaseModel):
    subreddit: str
    keyword: str

class VideoOutput(BaseModel):
    video_url: str
    transcript: str

class TrendingVideoBlock(Block):
    input_schema = RedditTopicInput
    output_schema = VideoOutput

    def run(self, input_data: RedditTopicInput) -> VideoOutput:
        # 1. 去 Reddit 抓热门帖子
        posts = self.fetch_reddit_posts(input_data.subreddit, input_data.keyword)
        # 2. 挑出热度最高的
        top_post = max(posts, key=lambda p: p.upvotes)
        # 3. 根据内容生成短视频（调外部视频 API）
        video_url = self.generate_video(top_post.title, top_post.selftext)
        # 4. 返回结果
        return VideoOutput(video_url=video_url, transcript=top_post.selftext)
```

在平台上，你把这个 Block 和其他 Block（Reddit 读取、视频生成、社交发布）连起来，就是一个完整的"从 Reddit 热点自动生成病毒视频"的 Agent。

## 踩过的坑

1. **无限循环**：LLM 有时会陷入"做了一步 -> 不满意 -> 做另一步 -> 还是不满意"的死循环。Classic 版本靠设置最大步数兜底，新版平台加了"反思组件"来提前检测
2. **上下文爆炸**：每一轮都把结果拼回 prompt，跑久了 prompt 超长、token 费用飙升。解决方案是定期摘要（summarize）历史，只保留关键信息
3. **API 密钥泄露**：早期版本把 OpenAI key 直接写在配置文件里，社区出了好几起泄露事件。新版平台改用加密存储 + 环境变量
4. **Classic 已停止维护**：官方明确说明 Classic 不再更新依赖、不修安全问题。学习架构可以看，生产环境请用 Platform 或其他框架

## 适用 vs 不适用场景

**适用**：

- 学习 Agent 架构和"循环决策"范式
- 快速原型验证：用 Forge 搭一个 Demo 看可行性
- 自动化重复性信息处理任务（调研、整理、摘要）

**不适用**：

- 生产环境的高可靠自动化（LLM 不可控，偶尔会犯错）
- 需要精确步骤控制的任务（Agent 适合"给目标"，不适合"给流程"）
- 对安全性要求极高的场景（Classic 已停更，Platform 仍在迭代）

## 学到什么

1. **Agent 的本质是"给目标 + 循环决策"**——不需要写 if-else，让模型自己决定怎么做。这改变了编程的思维模式：从"告诉计算机怎么做"变成"告诉计算机做什么"
2. **记忆是 Agent 的第一等公民**——没有记忆的 Agent 每轮都是全新的，什么都做不了。短期记忆（prompt 窗口）和长期记忆（向量库）缺一不可
3. **组件化是规模化前提**——Forge 的组件设计说明：Agent 不是写出来的，是搭出来的。每个组件单独测试、单独替换，整体才能可靠
4. **从 Classic 到 Platform 的演进路线**：单体 Agent -> 组件化 -> 低代码平台 -> 持续运行的服务。这是一条清晰的工业化路径

## 延伸阅读

- AutoGPT Classic 源码：[Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)（`classic/` 目录）
- AutoGPT Platform 文档：[docs.agpt.co](https://docs.agpt.co)
- [AutoGPT Forge 入门教程](https://aiedge.medium.com/autogpt-forge-e3de53cc58ec)（4 篇系列文章）
- [Agent Protocol 标准](https://agentprotocol.ai/)（跨 Agent 通信协议）
- [[langchain]] —— 另一个流行的 Agent 框架，侧重"链式"而非"循环"范式
- [[crewai]] —— 多 Agent 协作框架，受 AutoGPT 启发但定位不同

## 关联

- [[langchain]] —— LangChain 侧重 Chain（线性流程），AutoGPT 侧重 Loop（循环决策），两者思路互补
- [[langgraph]] —— LangChain 的图编排层，加入了循环能力，可以看作"LangChain 吸收了 AutoGPT 的思想"
- [[openai-agents]] —— OpenAI 官方 Agent 框架，继承了"工具调用 + 循环"的思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

