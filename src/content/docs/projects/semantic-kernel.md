---
title: "Semantic Kernel — 微软企业级 Agent SDK"
source: "https://github.com/microsoft/semantic-kernel"
date: "2026-06-13"
category: "AI 框架"
subcategory: "Agent SDK"
provenance: "pipeline-v3"
分类: 其他
子分类: ai-infra
---

# Semantic Kernel — 微软企业级 Agent SDK

## 一句话概括

Semantic Kernel（简称 SK）是微软出品的 SDK，让你用熟悉的编程语言（Python / C# / Java）像搭积木一样构建 AI Agent 和企业级智能应用。

## 日常类比

想象你在经营一家餐厅：

- **厨房（LLM）** 负责做菜——它能写文案、回答问题、做翻译，但它不会自己端菜、不会查库存、不会算账。
- **服务员（Semantic Kernel）** 站在厨房和客人之间——它听懂客人的需求，告诉厨房做什么菜，把结果端给客人。如果客人问"今天的特价汤多少钱"，服务员会先让厨房查菜单，再查价格，最后把答案整理好端上来。
- **插件（Plugins）** 就是厨房里的各种工具——点菜系统、收银机、库存表。服务员可以调用它们来完成更复杂的任务。

Semantic Kernel 就是这个"服务员"+"管理系统"。它本身不是一个 AI 模型，而是一个**框架**，帮你把 AI 模型、你的业务逻辑、外部工具有机地组合在一起。

## 核心概念

### 1. Kernel（内核）

Kernel 是整个系统的"大脑容器"。它负责：

- 注册你使用的 AI 模型（OpenAI、Azure OpenAI、本地 Ollama 等）
- 管理所有插件（Plugins）
- 协调 Agent 之间的协作

```python
from semantic_kernel import Kernel

kernel = Kernel()
```

可以把 Kernel 理解为一个空餐厅——刚开业，还没请厨师，也没挂菜单。

### 2. Agent（智能体）

Agent 是一个有"身份"的 AI 实体。每个 Agent 有：

- **名字**：比如 "BillingAgent"（账单代理）
- **指令（Instructions）**：它的行为准则，类似员工手册
- **能力**：能访问哪些插件和工具

```python
from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion

agent = ChatCompletionAgent(
    service=AzureChatCompletion(),
    name="SK-Assistant",
    instructions="You are a helpful assistant.",
)
```

### 3. Plugin（插件）

Plugin 是你自己的业务代码，让 Agent 能做实际的事情。比如：

- 查询数据库
- 调用外部 API
- 执行数学计算

在 SK 中，你只需要给普通函数加一个装饰器，它就变成了 Agent 可调用的工具：

```python
from typing import Annotated
from semantic_kernel.functions import kernel_function

class MenuPlugin:
    @kernel_function(description="Provides a list of specials from the menu.")
    def get_specials(self) -> Annotated[str, "Returns the specials from the menu."]:
        return "Special Soup: Clam Chowder\nSpecial Salad: Cobb Salad"

    @kernel_function(description="Provides the price of the requested menu item.")
    def get_item_price(self, menu_item: Annotated[str, "The name of the menu item."]) -> str:
        return "$9.99"
```

### 4. Multi-Agent Collaboration（多 Agent 协作）

这是 SK 最强大的特性之一。你可以创建多个专业 Agent，让它们分工合作：

- **分诊 Agent（TriageAgent）**：听懂用户需求，判断该找谁
- **账单 Agent（BillingAgent）**：处理收费、退款问题
- **退款 Agent（RefundAgent）**：专门处理退款流程

这就像医院：病人进门先经过分诊台，分诊护士判断你是要看内科还是外科，然后转给对应的医生。

## 代码示例

### 示例一：基础对话 Agent

最简单的用法——创建一个能和你聊天的 Agent：

```python
import asyncio
from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion

async def main():
    agent = ChatCompletionAgent(
        service=AzureChatCompletion(),
        name="SK-Assistant",
        instructions="You are a helpful assistant.",
    )

    response = await agent.get_response(
        messages="Write a haiku about Semantic Kernel."
    )
    print(response.content)

asyncio.run(main())

# 输出:
# Language's essence,
# Semantic threads intertwine,
# Meaning's core revealed.
```

### 示例二：带插件的 Agent

让 Agent 拥有查菜单、查价格的实际能力：

```python
import asyncio
from typing import Annotated
from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.functions import kernel_function

class MenuPlugin:
    @kernel_function(description="Provides a list of specials from the menu.")
    def get_specials(self) -> Annotated[str, "Returns the specials from the menu."]:
        return """
        Special Soup: Clam Chowder
        Special Salad: Cobb Salad
        Special Drink: Chai Tea
        """

    @kernel_function(description="Provides the price of the requested menu item.")
    def get_item_price(self, menu_item: Annotated[str, "The name of the menu item."]) -> str:
        return "$9.99"

async def main():
    agent = ChatCompletionAgent(
        service=AzureChatCompletion(),
        name="SK-Assistant",
        instructions="You are a helpful restaurant assistant.",
        plugins=[MenuPlugin()],
    )

    response = await agent.get_response(
        messages="What is the price of the soup special?"
    )
    print(response.content)
    # 输出: The price of the Clam Chowder, which is the soup special, is $9.99.

asyncio.run(main())
```

注意：Agent 自己并不知道菜单和价格——它通过 Plugin 去"问"这些工具，然后把结果组织成自然语言回答你。

### 示例三：多 Agent 协作系统

三个 Agent 分工合作，模拟客服场景：

```python
import asyncio
from semantic_kernel.agents import ChatCompletionAgent, ChatHistoryAgentThread
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion, OpenAIChatCompletion

# 账单专家
billing_agent = ChatCompletionAgent(
    service=AzureChatCompletion(),
    name="BillingAgent",
    instructions="You handle billing issues like charges, payment methods, fees.",
)

# 退款专家
refund_agent = ChatCompletionAgent(
    service=AzureChatCompletion(),
    name="RefundAgent",
    instructions="Assist users with refund inquiries, policies, and processing.",
)

# 分诊台——总指挥
triage_agent = ChatCompletionAgent(
    service=OpenAIChatCompletion(),
    name="TriageAgent",
    instructions="""Evaluate user requests and forward them to BillingAgent
    or RefundAgent. Provide the full answer to the user.""",
    plugins=[billing_agent, refund_agent],
)

async def main():
    thread = ChatHistoryAgentThread()
    user_input = "I was charged twice for my subscription last month."

    response = await triage_agent.get_response(
        messages=user_input,
        thread=thread,
    )
    print(response.content)

asyncio.run(main())
```

运行流程：用户提问 → TriageAgent 判断这是账单问题 → 调用 BillingAgent → 整理答案回复用户。

## 技术要点

| 概念 | 说明 | 类比 |
|------|------|------|
| Kernel | 容器，管理模型和插件 | 餐厅本身 |
| Agent | 有身份的 AI 实体 | 服务员 |
| Plugin | 自定义业务工具 | 点菜系统、收银机 |
| Thread | 对话线程，保存上下文 | 一张餐桌 |
| Connector | 连接不同 AI 模型 | 食材供应商 |

## 支持的 AI 模型

SK 是**模型无关**的——你可以随时切换后端模型而不改业务代码：

- OpenAI（GPT-4 等）
- Azure OpenAI（企业部署）
- Hugging Face
- NVIDIA NIM
- Ollama / LMStudio（本地运行）
- ONNX

## 为什么企业喜欢用它

1. **多语言支持**：Python、C#、Java 任选
2. **插件生态丰富**：支持 OpenAPI 规范自动生成插件，意味着任何 REST API 都能一键变成 Agent 的工具
3. **向量数据库集成**：内置对接 Azure AI Search、Elasticsearch、Chroma 等，轻松实现 RAG
4. **可观测性**：内置日志和追踪，方便生产环境监控
5. **微软背书**：MIT 开源协议，长期维护承诺

## 重要更新

Semantic Kernel 已经演进为 **Microsoft Agent Framework (MAF)** 1.0 版本。MAF 是 SK 的企业级后继者，增加了多 Agent 编排、A2A/MCP 跨运行时互操作等新能力。新项目建议直接参考 [MAF 迁移指南](https://learn.microsoft.com/en-us/agent-framework/migration-guide/from-semantic-kernel)。

## 学习资源

- 官方文档：https://learn.microsoft.com/en-us/semantic-kernel/
- 入门指南：https://learn.microsoft.com/en-us/semantic-kernel/get-started/quick-start-guide
- 100+ 示例代码：https://learn.microsoft.com/en-us/semantic-kernel/get-started/detailed-samples
- Discord 社区：https://aka.ms/SKDiscord
