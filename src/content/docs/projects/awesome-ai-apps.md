---
title: Awesome AI Apps — 零基础学习笔记
来源: https://github.com/Arindam200/awesome-ai-apps
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# Awesome AI Apps — 零基础学习笔记

## 一、这个项目是什么

`awesome-ai-apps` 是一个 GitHub 上的开源项目，它像一本"大模型应用菜谱"。

日常类比：想象你想学做菜。你可以去翻一本百科全书，里面写满了"如何合成氨基酸"——但你想学的是"怎么做番茄炒蛋"。这个项目就是那本菜谱，里面有 80+ 个可以直接运行、直接修改的 AI 应用示例。

它由 Arindam Majumder 等人维护，已经获得了超过 12,000 个 Star。项目用 Python 为主（67.5%），也有部分 TypeScript（15.6%）。

## 二、项目结构总览

项目把 80+ 个示例分成了六大类，每类解决一个不同的问题：

```
awesome-ai-apps/
├── starter_ai_agents/        ← 入门级：每个框架一个"Hello World"
├── simple_ai_agents/         ← 简单应用：能实际干活的小工具
├── voice_agents/             ← 语音助手：能听会说
├── mcp_ai_agents/            ← 协议扩展：让 AI 连接外部工具
├── memory_agents/            ← 带记忆的 Agent：记住你的偏好
└── rag_apps/                 ← 文档问答：让 AI 读你的文件
```

### 关键概念速查

| 术语 | 日常类比 | 技术含义 |
|------|---------|---------|
| **Agent** | 一个帮你跑腿的助手 | 能调用工具、做决策的 AI 程序 |
| **RAG** | 给你一个参考书再去考试 | Retrieval-Augmented Generation，检索增强生成 |
| **MCP** | 给助手一本"工具说明书" | Model Context Protocol，AI 连接外部系统的协议 |
| **Framework** | 一套厨房用具 | 用来构建 Agent 的编程框架，如 LangChain、Agno |

## 三、核心概念详解

### 3.1 什么是 AI Agent

AI Agent 的基本结构可以类比成一个餐厅服务员：

1. **听** —— 接收你的问题（用户输入）
2. **想** —— 判断需不需要借助工具（大语言模型推理）
3. **做** —— 调用外部工具获取信息（工具调用）
4. **答** —— 综合信息给你回复

### 3.2 什么是 RAG

RAG 的全称是 Retrieval-Augmented Generation（检索增强生成）。

日常类比：普通 AI 就像一个只靠记忆答题的人，你问它"公司去年的财报数据是多少"，它只能猜。RAG 相当于给它发了一本"参考书"——你先把它需要的文件喂给它，它先"翻阅"相关文件，再基于文件内容回答。这样回答的准确率会高很多。

RAG 的三个步骤：
1. **切分** —— 把长文档切成小块
2. **存储** —— 把小块存入向量数据库（一种特殊的"会搜索的数据库"）
3. **检索 + 生成** —— 你问问题时，先搜相关文件块，再把文件块和问题一起交给 AI 回答

### 3.3 为什么需要 Framework

直接写 Agent 代码就像从零开始造发动机。LangChain、Agno、LlamaIndex 这些框架提供了"发动机外壳"——它们处理了 prompts 管理、工具注册、对话历史维护等重复工作，让你专注于业务逻辑。

## 四、代码示例

### 示例一：用 LangChain 构建一个带工具的 Agent

这是 `starter_ai_agents/langchain_starter` 中的示例。它展示了一个最基础的 Agent 结构：定义工具、绑定模型、启动循环。

```python
"""LangChain starter — a tool-calling agent powered by Nebius."""
import os
from datetime import datetime

from dotenv import load_dotenv
from pydantic import SecretStr
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent

load_dotenv()


@tool
def get_current_time() -> str:
    """Return the current local date and time as an ISO-8601 string."""
    return datetime.now().isoformat(timespec="seconds")


@tool
def word_count(text: str) -> int:
    """Count the number of whitespace-separated words in the given text."""
    return len(text.split())


def build_agent() -> AgentExecutor:
    llm = ChatOpenAI(
        model="Qwen/Qwen3-30B-A3B",
        base_url="https://api.tokenfactory.nebius.com/v1/",
        api_key=SecretStr(os.environ["NEBIUS_API_KEY"]),
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a helpful assistant. Use tools when they are relevant "
                "instead of guessing.",
            ),
            ("placeholder", "{chat_history}"),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ]
    )

    tools = [get_current_time, word_count]
    agent = create_tool_calling_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True)
```

代码拆解（按执行顺序）：

1. `@tool` 装饰器：把普通 Python 函数变成 AI 可调用的"工具"。AI 在需要时会自动调用这些函数。
2. `ChatOpenAI`：指定使用哪个 AI 模型。这里用的是 Qwen3-30B-A3B，通过 Nebius 的 API 访问。
3. `ChatPromptTemplate`：定义对话的"剧本"。system 消息是告诉 AI 它的角色，{input} 是用户的问题，{chat_history} 是之前的对话记录。
4. `create_tool_calling_agent`：LangChain 提供的"一键组装"功能，把模型、工具、提示词绑在一起。
5. `AgentExecutor`：执行器，负责运行 Agent 的主循环。

### 示例二：用 Agno 构建一个金融数据 Agent

这是 `simple_ai_agents/finance_agent` 中的示例，展示了一个更实用的 Agent——能查股票价格和财经新闻。

```python
from agno.agent import Agent
from agno.models.nebius import Nebius
from agno.tools.yfinance import YFinanceTools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.playground import Playground, serve_playground_app
import os
from dotenv import load_dotenv

load_dotenv()

agent = Agent(
    name="xAI Finance Agent",
    model=Nebius(
            id="meta-llama/Llama-3.3-70B-Instruct",
            api_key=os.getenv("NEBIUS_API_KEY")
    ),
    tools=[DuckDuckGoTools(), YFinanceTools(stock_price=True, analyst_recommendations=True, stock_fundamentals=True)],
    instructions = ["Always use tables to display financial/numerical data."],
    show_tool_calls = True,
    markdown = True,
)

app = Playground(agents=[agent]).get_app()

if __name__ == "__main__":
    serve_playground_app("xai_finance_agent:app", reload=True)
```

代码拆解：

1. `Agent`：Agno 框架的核心类，一行代码就创建了一个 Agent。
2. `model=Nebius(...)`：指定 AI 模型，这里用了 Llama-3.3-70B-Instruct（一个 700 亿参数的模型）。
3. `tools=[...]`：给 Agent 装上两个"本领"——
   - `DuckDuckGoTools`：能上网搜索最新财经新闻
   - `YFinanceTools`：能查实时股票价格、分析师推荐、公司基本面数据
4. `instructions`：告诉 AI 如何格式化输出——数字用表格，文字用要点。
5. `Playground`：Agno 自带的 Web 界面，运行后在浏览器里就能跟 Agent 对话。

对比两个示例：

| 特性 | LangChain 示例 | Agno 示例 |
|------|---------------|-----------|
| 代码行数 | ~35 行 | ~15 行 |
| 抽象程度 | 需要手动组装 prompt、工具、执行器 | 一行 Agent() 搞定 |
| 适合场景 | 想理解底层机制 | 想快速搭建应用 |
| 框架哲学 | "积木式"，每一块你都能替换 | "一站式"，尽可能少写代码 |

## 五、如何上手这个项目

项目的 Getting Started 部分给出了清晰的步骤：

```bash
# 1. 克隆项目
git clone https://github.com/Arindam200/awesome-ai-apps.git
cd awesome-ai-apps

# 2. 选一个子项目（推荐从 starter 开始）
cd starter_ai_agents/langchain_starter

# 3. 安装依赖（推荐用 uv，比 pip 快很多）
uv sync

# 4. 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 5. 运行
python main.py
```

推荐的学习路径（由简到难）：

1. **第一站**：`starter_ai_agents/langchain_starter` — 理解 Agent 的基本结构
2. **第二站**：`simple_ai_agents/finance_agent` — 看到 Agent 能解决什么问题
3. **第三站**：`rag_apps/simple_rag` — 学习让 AI 读你自己的文档
4. **第四站**：`memory_agents/agno_memory_agent` — 让 Agent 记住你的偏好
5. **第五站**：`advance_ai_agents` 下的任意项目 — 看多 Agent 协作如何工作

## 六、项目中的关键技术栈

项目中用到的主要框架和技术：

- **LangChain / LangGraph** — 最主流的 AI Agent 框架，生态最成熟
- **Agno** — 新兴框架，以简洁著称，代码量通常是 LangChain 的 1/3
- **LlamaIndex** — 擅长 RAG 场景，文档处理能力强
- **CrewAI** — 多 Agent 协作框架，可以组建"AI 团队"
- **PydanticAI** — 基于 Pydantic 的类型安全 Agent 框架
- **MCP** — 让 AI 连接数据库、GitHub、Slack 等外部系统的协议
- **Nebius Token Factory** — 项目中常用的 API 服务，提供多种 LLM 模型

## 七、学习要点总结

1. Agent 的本质 = LLM + 工具 + 循环。不管用哪个框架，核心结构都一样。
2. RAG 是解决"AI 不知道你的私有数据"这一问题的标准方案。
3. MCP 是新的连接标准，就像给 AI 装上了 USB 接口。
4. 框架没有"最好"，只有"最适合"。LangChain 灵活但啰嗦，Agno 简洁但生态较新。
5. 所有示例都要求 Python 3.10+，建议用 `uv` 而不是 `pip` 管理依赖。
