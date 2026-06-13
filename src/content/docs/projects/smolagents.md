---
title: smolagents — HuggingFace 极简 Agent 框架
来源: https://github.com/huggingface/smolagents
日期: 2026-06-13
分类: 机器学习
子分类: ai-agent-infra
provenance: pipeline-v3
---

# smolagents — HuggingFace 极简 Agent 框架

## 什么是 Agent？

先想象一个场景：你让朋友去计划一次东京之旅，说"帮我规划 3 月 28 日到 4 月 7 日的东京行程，包含京都和大阪"。

你的朋友不会直接给你答案，而是会做这些事：

1. 先上网查东京的天气
2. 再搜索景点推荐
3. 然后查酒店价格
4. 最后把所有信息整理成一份行程

这个过程——**自己决定做什么、查什么、怎么组合信息来完成任务**——就是 AI Agent 的核心思想。

传统 AI 聊天机器人你问一句它答一句。Agent 则不同：它能**自主拆解任务、调用工具、循环执行**，最终给出完整答案。

## smolagents 是什么？

smolagents 是 HuggingFace 开源的一个 Python 库，名字里的 "smol" 就是 "small" 的可爱缩写。它的理念极其朴素：**用最少代码实现最强 Agent 能力**。

作者说了一句大实话：smolagents 的核心代码只有大约 1,000 行。他们刻意不发明新轮子，而是把已有的好东西（LLM 调用、工具系统、代码执行）用最简洁的方式组合起来。

> smolagents 的格言：如果我们自己看不懂这段代码，那用户就更看不懂了。

## 核心概念

### 1. CodeAgent — 用代码写行动的 Agent

这是 smolagents 最核心的创新。传统 Agent 跟 LLM 沟通时，会让它输出类似这样的 JSON：

```json
{
  "tool": "web_search",
  "query": "巴黎天气"
}
```

smolagents 反其道而行：**让 Agent 直接写 Python 代码**。

类比：传统方式就像你跟厨师说"请做一道菜"，厨师每次都要先填一张申请单。CodeAgent 方式则是直接把锅铲塞给厨师——它自己会炒菜。

代码里的工具调用就是普通函数调用。Agent 可以自然地使用循环、条件判断、变量赋值，因为它写的就是真正的 Python。

### 2. ToolCallingAgent — 传统方式

如果你更喜欢传统的 JSON/tool-calling 方式，smolagents 也提供了 ToolCallingAgent。它跟其他框架（如 LangChain）的体验类似。

### 3. 模型无关（Model-agnostic）

smolagents 不绑定任何特定 LLM。你可以用：

- HuggingFace 的免费推理 API（InferenceClientModel）
- OpenAI、Anthropic（通过 LiteLLM）
- 本地跑的 transformers 模型
- Ollama、Azure、Amazon Bedrock 等

### 4. 工具生态（Tool-agnostic）

可以从 MCP 服务器、LangChain、HuggingFace Space 获取工具，也可以自己写工具。

### 5. ReAct 循环

Agent 内部跑的是 ReAct 循环（Reasoning + Acting）：

```
思考 → 执行工具 → 看到结果 → 再次思考 → 再次执行 → ... → 给出最终答案
```

CodeAgent 的特别之处在于"执行工具"这一步是用写代码完成的。

## 代码示例

### 示例 1：最简单的 Agent（一句话运行）

安装：`pip install "smolagents[toolkit]"`

```python
from smolagents import CodeAgent, WebSearchTool, InferenceClientModel

# 用 HuggingFace 的免费推理 API 初始化模型（默认模型）
model = InferenceClientModel()

# 创建一个 CodeAgent，给它一个网络搜索工具
agent = CodeAgent(
    tools=[WebSearchTool()],
    model=model,
)

# 让 Agent 回答问题
result = agent.run(
    "一只猎豹以最高速度跑完 Pont des Arts 桥需要多少秒？"
)
print(result)
```

这段代码里 Agent 会自己完成以下动作：

1. 搜索猎豹的最高速度
2. 搜索 Pont des Arts 桥的长度
3. 用代码计算时间 = 距离 / 速度
4. 返回答案

它不需要你告诉它每一步怎么做——它自己会拆解。

### 示例 2：自定义工具 + 指定模型

```python
import os
from smolagents import CodeAgent, InferenceClientModel
from smolagents.tools import tool

# 第一步：写一个自定义工具
@tool
def calculate_discount(price: float, discount_percent: float) -> float:
    """计算打折后的价格。输入原价和折扣百分比（0-100），返回折后价。"""
    return price * (1 - discount_percent / 100)

# 第二步：指定使用哪个 LLM（这里用 DeepSeek-R1）
model = InferenceClientModel(
    model_id="deepseek-ai/DeepSeek-R1",
    provider="together",
)

# 第三步：创建 Agent，把自定义工具放进去
agent = CodeAgent(
    tools=[calculate_discount],
    model=model,
)

# 第四步：运行任务
result = agent.run(
    "一件原价 299 元的衣服打 7 折后多少钱？如果再打 9 折呢？"
)
print(result)
```

Agent 拿到这个任务后，会自己决定：

1. 调用 `calculate_discount(299, 30)` 计算第一次折扣
2. 用第一步的结果再次调用 `calculate_discount(结果, 10)` 计算第二次折扣
3. 把两步结果整理成自然语言回答

## 代码 Agent 为什么更好？

HuggingFace 做了基准测试，发现 CodeAgent 比传统 JSON tool-calling 方式：

- **少调用 LLM 约 30%**（因为代码天然支持循环和条件判断，不需要反复"思考-调用-思考"）
- **在复杂任务上准确率更高**

类比：传统方式像每次转弯都要问路人"现在该左转还是右转？"，CodeAgent 方式像是你心里已经画好了整条路线，直接开就行。

## 安全注意

因为 Agent 执行的是真实代码，有安全隐患。smolagents 提供几种安全的代码执行环境：

- **E2B、Modal、Blaxel** — 云端沙箱，最简单，适合生产环境
- **Docker** — 本地容器隔离
- **LocalPythonExecutor** — 内置执行器，只有基础限制，**不作为安全边界**，不能用来执行不可信代码

## 还能做什么？

smolagents 的能力远不止文字对话：

- **视觉**：能处理图片、视频输入
- **浏览器操作**：自带 `webagent` 命令，能自动浏览网页、点击按钮、抓取数据
- **多 Agent 协作**：可以创建主 Agent 管理多个子 Agent
- **分享 Agent**：一键把 Agent 推到 HuggingFace Hub，变成可分享的空间

CLI 命令行工具也很有意思：

```bash
# 一键启动一个带网络搜索的 Agent
smolagent "规划东京、京都、大阪的旅行行程" --model-type "InferenceClientModel"

# 自动浏览器 Agent：搜商品、比价、抓取详情
webagent "去 xyz.com/men 找到第一个打折商品，抓取价格和详情" --model-type "LiteLLMModel"
```

## 和其他框架对比

| | smolagents | LangChain | AutoGen |
|---|---|---|---|
| 核心代码量 | ~1,000 行 | 数万字 | 数万行 |
| 学习方式 | 易上手 | 学习曲线陡 | 中等 |
| 代码优先 | 是 | 工具调用 JSON | 多 Agent 协作 |
| 模型支持 | 极广（100+） | 广 | 中等 |
| 适合场景 | 快速原型、个人项目 | 企业级复杂流程 | 多 Agent 研究 |

smolagents 的哲学是：如果一件事能用 3 行代码搞定，就不该用 30 行。

## 总结

smolagents 用最少的抽象做了最多的事。它的核心洞察很简单：**让 AI 写代码比让 AI 输出 JSON 字典更有效**。

对于初学者，smolagents 是理解 Agent 概念的最佳入口——代码量少到你可以逐行读懂整个框架，同时又强大到能完成真实任务。

---

参考：
- GitHub: https://github.com/huggingface/smolagents
- 文档: https://huggingface.co/docs/smolagents
- 官方博客: https://huggingface.co/blog/smolagents
