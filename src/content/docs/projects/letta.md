---
title: Letta — 有状态记忆 Agent
来源: https://github.com/letta-ai/letta
日期: 2026-06-13
分类_原始: AI Agent
分类: 机器学习
子分类: ai-agent-infra
provenance: pipeline-v3
---

# Letta — 有状态记忆 Agent

## 从日常类比开始

想象你有一个助手，但他患有"金鱼记忆"——每次你跟他说话，他都完全不记得之前聊过什么。这就是普通 LLM（比如 ChatGPT）的状态：每轮对话都是一次全新开始，上下文窗口满了就忘掉的。

Letta 解决的就是这个问题。它给 AI Agent 装上了一套**分层记忆系统**，让 Agent 能像人一样：短期记住重要信息、长期归档知识、还能自己决定该记住什么。

类比人的大脑：
- **工作记忆**（前额叶）——现在正在想的东西，容量有限
- **长期记忆**（海马体）——可以主动回忆的过往经历
- **外部知识**（图书馆）——需要时查找的资料

Letta 把这三层映射为三个概念：Memory Blocks（核心记忆）、Archival Memory（存档记忆）、Files（文件）。

## 核心概念：分层记忆架构

### 一、Memory Blocks（核心记忆）

这是 Agent 的"工作记忆"，始终贴在对话上下文的顶部，Agent 每次思考都能看到。

每个 Memory Block 有四个字段：
- `label`——标签，告诉 Agent 这块记忆是干什么的
- `description`——描述，Agent 靠它决定怎么读写这块记忆
- `value`——具体内容
- `limit`——字符上限

最常见的两个预定义标签是 `persona`（Agent 自己的人设）和 `human`（关于用户的信息）。

**关键特性：**
- Agent 可以自主读写（通过 `memory_rethink`、`memory_replace` 等工具）
- 支持设为只读（`read_only: true`），防止 Agent 篡改
- 多个 Agent 可以共享同一个 Block（Shared Memory）
- 推荐每个 Block 小于 5 万字，每个 Agent 不超过 20 个 Block

### 二、Archival Memory（存档记忆）

这是 Agent 的"长期记忆库"，不贴在上下文中，需要 Agent 主动检索。

底层是一个向量数据库（Vector DB），支持语义搜索——搜"人工记忆"能找到"植入记忆"，因为语义相近。

**关键特性：**
- 近乎无限的存储容量
- Agent 通过 `archival_memory_insert` 和 `archival_memory_search` 两个工具读写
- Agent 很难直接删除（开发者可以通过 SDK 管理）
- 适合存：文档、历史对话、知识库等"不需要每次看到但偶尔要查"的信息

### 三、Context Hierarchy（上下文层次）

Letta 根据数据的重要性和规模，提供四种抽象：

| 抽象类型 | 是否入上下文 | 工具 | 大小限制 | 数量限制 |
|---|---|---|---|---|
| Memory Blocks | 是（始终可见） | memory_rethink / memory_replace | <50k 字符 | <20 个/Agent |
| Files | 部分（按需打开） | open / close / semantic_search | 5MB | <100 个/Agent |
| Archival Memory | 否（需检索） | archival_memory_insert / search | 300 tokens/条 | 无限 |
| External RAG | 否（需检索） | 自定义工具或 MCP | 无限 | 无限 |

## 代码示例

### 示例 1：创建一个带核心记忆的 Agent

这是最简单的入门——创建一个 Agent，给它设定人设（persona）和人类信息（human），然后问它关于自己的问题。

```python
from letta_client import Letta
import os

# 连接 Letta API
client = Letta(api_key=os.getenv("LETTA_API_KEY"))

# 创建一个带记忆的 Agent
agent = client.agents.create(
    model="openai/gpt-4o-mini",
    memory_blocks=[
        {
            "label": "human",
            "value": "Name: Jason. Learning AI agents from scratch.",
            "limit": 5000
        },
        {
            "label": "persona",
            "value": "I am a patient and clear AI tutor. I explain things using daily analogies first.",
            "limit": 5000
        }
    ]
)

print(f"Agent created with ID: {agent.id}")

# 发送消息——Agent 会读取它的记忆块来回答
response = client.agents.messages.create(
    agent_id=agent.id,
    input="What do you know about me?"
)

for message in response.messages:
    print(message)
```

输出中，Agent 会引用 `human` 记忆块里的信息来回答，因为它始终在上下文中可见。

### 示例 2：使用共享记忆块让多个 Agent 协作

这是 Letta 最有趣的能力之一——多个 Agent 可以共享同一个 Memory Block。更新一次，所有关联的 Agent 都能看到变化。

```python
from letta_client import Letta
import os

client = Letta(api_key=os.getenv("LETTA_API_KEY"))

# 创建一个"组织信息"共享记忆块
shared_block = client.blocks.create(
    label="organization",
    description="A block to store information about the organization. Shared across all agents.",
    value="Organization: Letta. Mission: Build infrastructure for self-improving AI.",
    limit=4000
)

# Agent A：负责研究
agent_a = client.agents.create(
    name="research_agent",
    memory_blocks=[
        {"label": "persona", "value": "I am a research specialist. I gather and analyze information."}
    ],
    block_ids=[shared_block.id],  # 共享块
    model="openai/gpt-4o-mini"
)

# Agent B：负责写作
agent_b = client.agents.create(
    name="writer_agent",
    memory_blocks=[
        {"label": "persona", "value": "I am a content writer. I take research and turn it into articles."}
    ],
    block_ids=[shared_block.id],  # 同一个共享块
    model="openai/gpt-4o-mini"
)

# 更新共享块——两个 Agent 立刻都能看到新信息
client.blocks.update(shared_block.id, {
    value="Organization: Letta. Mission: Build infrastructure for self-improving AI.\nNew: Launching v0.17 in June 2026."
})
```

两个 Agent 在各自的对话中都能看到最新的组织信息，实现了跨 Agent 的记忆同步。

### 示例 3：Agent 自主使用存档记忆

Agent 可以主动把重要信息存入 Archival Memory，之后通过语义搜索找回。

```python
# Agent 在对话中自动调用 archival_memory_insert：
client.agents.passages.insert(
    agent_id=agent.id,
    content="Jason prefers Python over TypeScript for new projects.",
    tags=["user_preference", "language"]
)

# 之后通过语义搜索召回（不是关键词匹配，而是语义理解）
results = client.agents.passages.search(
    agent_id=agent.id,
    query="programming language choice",  # 搜的是意思，不是原文
    tags=["user_preference"],
    page=0
)

for passage in results:
    print(passage.content)
# 输出: "Jason prefers Python over TypeScript for new projects."
```

注意搜索时用的是"programming language choice"而不是原文"Python"或"TypeScript"——向量搜索理解语义，能找到相关但用词不同的记忆。

## 为什么 Letta 与众不同

传统 LLM 应用里，记忆是"一次性"的——对话结束就没了。Letta 的创新在于：

1. **记忆由 Agent 自主管理**——不是开发者手动管理上下文，而是 Agent 自己决定什么该记住、什么该归档
2. **三层记忆分层**——核心记忆永远可见、存档记忆无限容量、文件按需加载，各司其职
3. **记忆可共享**——多个 Agent 通过共享 Memory Block 实现协作
4. **所有状态持久化**——消息、记忆、工具调用全部存入数据库，不会丢失

## 关键术语速查

- **Agent**——一个有状态的 AI 实体，包含系统提示、记忆块、消息和工具
- **Memory Block**——Agent 的核心记忆片段，始终在上下文中可见
- **Archival Memory**——Agent 的长期记忆库，通过语义搜索检索
- **Compaction**——当上下文窗口快满了，Letta 自动把旧消息压缩成存档记忆
- **Passage**——Archival Memory 中的一条记录
- **Conversation**——同一 Agent 下的独立消息线程，支持多用户并行

## 参考

- 项目主页：https://github.com/letta-ai/letta
- 官方文档：https://docs.letta.com
- API 快速开始：https://docs.letta.com/quickstart
- 安装 Letta Code CLI：`npm install -g @letta-ai/letta-code`
- SDK 安装：`pip install letta-client`（Python）或 `npm install @letta-ai/letta-client`（TypeScript）
