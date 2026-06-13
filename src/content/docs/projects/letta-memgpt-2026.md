---
title: Letta - 让 AI 代理学会记忆的框架
来源: https://github.com/letta-ai/letta
日期: 2026-06-13
分类: Agent
子分类: 智能体与 LLM
provenance: pipeline-v3
---

# Letta - 让 AI 代理学会记忆的框架

## 一、从一个问题开始

你有没有用过 AI 聊天，然后发现它每次对话都像一个"刚认识你"的新人？

你告诉它你的项目背景、代码风格、偏好设置，关了对话框再回来，它全忘了。
这就是传统 LLM 的核心短板：**没有记忆**。每次对话从零开始，上下文窗口（context window）之外的一切等于不存在。

Letta 做的事情，就是给 AI 加上一套完整的记忆系统。

想象一下：
- 传统 LLM 像金鱼——只记得眼前这一句话
- Letta 代理像一个长期助手——能记住你的习惯、积累知识、随着使用越来越懂你

Letta 的 GitHub 仓库目前有 23,300+ star，它从 MemGPT 项目演变而来，是一个用 Python 编写的开源框架（99.5% 代码）。

## 二、核心概念：让代理"活着"

Letta 中最核心的概念是 **有状态代理（Stateful Agent）**。

### 2.1 什么是有状态代理

一个有状态代理包含：
- **系统提示词（System Prompt）**：定义代理的性格和行为规则
- **记忆块（Memory Blocks）**：代理可以自我编辑的结构化记忆
- **工具（Tools）**：搜索、执行代码、抓取网页等能力
- **消息历史（Messages）**：所有对话记录，持久存储在数据库中

与传统聊天不同，Letta 代理的每一次状态变化（学到的新知识、完成的工具调用、自我修正的记忆）都会保存到数据库里。**即使对话结束、上下文被清理，代理也不会丢失这些状态。**

### 2.2 记忆的三层结构

Letta 把记忆分成了两个主要层次，类比人类大脑：

**核心记忆（Core Memory / Memory Blocks）**：
就像你此刻正在注意的内容。始终可见、始终在上下文中，代理可以随时读写。比如：
- `persona` 块：代理对自己身份的认知
- `human` 块：代理对用户的信息

**归档记忆（Archival Memory）**：
就像你脑海深处需要时才会检索的知识。不能直接放入上下文，必须通过搜索工具来查找。容量近乎无限。比如：
- 之前对话中提到的事实
- 阅读过的文档摘要
- 积累的专业知识

两者区别用一句话概括：
- 核心记忆 = 随时可见，像笔记本摊开在桌上
- 归档记忆 = 按需检索，像图书馆里的书

## 三、代码示例

### 3.1 创建一个带记忆的代理

下面是一个用 Python SDK 创建有状态代理的完整示例：

```python
from letta_client import Letta
import os

client = Letta(api_key=os.getenv("LETTA_API_KEY"))

# 创建一个带有记忆块的代理
agent_state = client.agents.create(
    model="openai/gpt-5.2",
    memory_blocks=[
        {
            "label": "human",
            "value": "Name: Jason. Experience level: beginner in AI. Prefers explanations in Chinese with analogies.",
            "limit": 5000,
        },
        {
            "label": "persona",
            "value": "I am a helpful assistant. I explain things using everyday analogies and always check if the user understands.",
            "limit": 5000,
        },
    ],
    tools=["web_search", "fetch_webpage"],
)

print(f"Agent created with ID: {agent_state.id}")
```

这里创建了一个代理，给它两本"笔记本"：一本记录用户的个人信息，一本定义代理自己的性格。代理在每次对话中都会看到这两块内容，所以它不会忘记你是谁。

### 3.2 与代理对话并管理记忆

```python
from letta_client import Letta
import os

client = Letta(api_key=os.getenv("LETTA_API_KEY"))
agent_id = "your-agent-id"

# 发送消息——代理会基于记忆作答
response = client.agents.messages.create(
    agent_id=agent_id,
    input="我上次提到的中文偏好你还记得吗？请用中文解释什么是 RAG。"
)

for message in response.messages:
    print(message)

# 手动让代理记住重要信息
response2 = client.agents.messages.create(
    agent_id=agent_id,
    input="/remember 他喜欢简洁的回答，不喜欢长篇大论"
)
```

注意 `/remember` 命令——这是 Letta 的一个特殊指令，告诉代理把这条信息写入记忆。代理会在后台自动更新记忆块，所以下次对话时它不会再忘记。

### 3.3 使用归档记忆存储大量知识

```python
from letta_client import Letta
import os

client = Letta(api_key=os.getenv("LETTA_API_KEY"))
agent_id = "your-agent-id"

# 向代理的归档记忆中存入知识片段
client.agents.passages.insert(
    agent_id=agent_id,
    content="RAG（Retrieval-Augmented Generation）是一种先检索外部知识库，再将检索结果与问题一起发送给 LLM 的技术。",
    tags=["AI", "RAG", "基础知识"]
)

# 代理可以自己搜索归档记忆
search_results = client.agents.passages.search(
    agent_id=agent_id,
    query="什么是检索增强生成",
    tags=["AI"],
    page=0
)
for result in search_results:
    print(result.content)
```

归档记忆的关键特点是：语义搜索。你搜索"检索增强生成"，即使记忆中没有完全匹配的词（比如存的是"先查资料再回答"），代理也能通过语义理解找到相关内容。

## 四、记忆块（Memory Blocks）详解

记忆块是 Letta 最重要的抽象。它本质上是一段带标签的文本，附加在代理的系统提示词中。代理看到的内容大概是这样的：

```xml
<memory_blocks>
  <persona>
    <description>存储关于代理自身人格的信息</description>
    <value>I am a helpful assistant. I explain things using everyday analogies.</value>
  </persona>
  <human>
    <description>存储关于用户的信息</description>
    <value>Name: Jason. Prefers concise answers in Chinese.</value>
  </human>
</memory_blocks>
```

**记忆块有三个关键属性**：
1. `label`（标签）：比如 `persona`、`human`、`policies`——代理根据标签决定这块内容的用途
2. `description`（描述）：告诉代理这个块是用来做什么的，非常重要。描述不好，代理就不知道该往里面写什么
3. `value`（值）：实际存储的文本内容

**只读块**：你可以将记忆块设为 `read_only: true`，这样代理就无法修改它。适合存放公司政策、不可变的规则等。

**共享块**：同一个记忆块可以附加给多个代理。改一处，所有使用该块的代理都能立即看到新内容。

## 五、MemFS：基于 Git 的记忆文件系统

Letta 的进阶记忆方案叫 **MemFS**（Memory Filesystem），它将代理的记忆存储为一个基于 Git 的文件系统：

- 记忆以 Markdown 文件的形式保存在目录中
- `system/` 目录下的文件始终加载到上下文中
- 其他文件通过"记忆树"可见（能看到文件名和摘要，但内容不自动加载）
- 代理用 bash 工具直接编辑这些文件，然后用 git commit 保存
- 所有变更都有版本历史，可以回溯

这就像给代理配了一个带版本控制的记事本——你可以随时查看代理在什么时候修改了哪些记忆。

## 六、让代理"做梦"：自动反思

Letta 有一个有趣的功能叫 **Dreaming（反思）**。

代理在运行过程中会定期启动一个后台子代理，让它回顾最近的对话，自动整理和更新记忆。这就像人类睡觉前"复盘"一天的经历。

触发方式有三种：
- 关闭
- 每 N 条用户消息触发一次
- 上下文窗口被压缩时触发（推荐，MemFS 模式下）

你可以通过 `/sleeptime` 命令来配置反思频率。

## 七、三种使用方式

Letta 提供三种不同的使用路径：

| 方式 | 适用场景 | 类似产品 |
|------|---------|---------|
| **Letta Code**（桌面端 / CLI） | 个人使用，像用 Claude Code 一样 | Claude Code, Codex |
| **Letta Code SDK**（TypeScript） | 构建 TypeScript 应用 | Claude Agent SDK |
| **Letta API**（Python / TypeScript / REST） | 构建自定义代理应用 | OpenAI Responses API |

对初学者来说，Letta Code（桌面端或 CLI）是最容易上手的——安装后在终端运行 `letta` 就能开始使用。

## 八、为什么 Letta 值得学习

传统聊天机器人的问题是"健忘"。你每开一个新对话，就等于和一个新的人聊天。

Letta 解决这个问题的思路不是简单地把更多对话塞进上下文窗口，而是**让代理自己管理记忆**：
- 决定什么值得记住
- 决定什么应该归档
- 决定什么可以遗忘
- 在对话之间保持状态

这种"代理自管理记忆"的设计，是目前 AI 代理领域最有前途的方向之一。理解 Letta 的记忆模型，有助于你理解未来 AI 应用的架构走向。

## 九、学习路线建议

1. 先花 30 分钟理解核心概念：有状态代理、记忆块、归档记忆
2. 用 Letta Code CLI 体验 15 分钟：安装后跟代理聊几句，观察它如何记忆
3. 用 Python SDK 写一个自己的代理，给它设置 persona 和 human 块
4. 学习 MemFS 文件系统，理解 git-backed 记忆的含义
5. 探索多代理模式（supervisor-worker、round-robin 等）

## 十、关键术语速查

| 术语 | 含义 |
|------|------|
| Stateful Agent | 有状态代理，能在对话间保持记忆 |
| Memory Block | 核心记忆块，代理可自编辑的结构化记忆 |
| Archival Memory | 归档记忆，语义搜索的无限容量知识库 |
| Compaction | 上下文压缩，将长对话摘要化以腾出空间 |
| MemFS | 基于 Git 的记忆文件系统 |
| Dreaming / Reflection | 代理自动反思和整理记忆 |
| Tool | 代理可调用的能力（搜索、代码执行等） |
