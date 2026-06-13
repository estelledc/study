---
title: Flowise 零基础学习笔记
来源: https://github.com/FlowiseAI/Flowise
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# Flowise 零基础学习笔记

## 什么是 Flowise？

想象你要搭一个乐高模型。不用一颗一颗地拼积木，而是已经有了一整套「智能积木」：每块积木负责一件事——有的会查资料，有的会写代码，有的会回答问题。你只需要把这些积木用线连起来，一个智能程序就建成了。

Flowise 就是这样一套「智能积木」平台。它是一个开源项目，让你用拖拽的方式构建 AI 智能体（AI Agent）和工作流（Workflow），不需要写代码。

核心定位：Build AI Agents, Visually（可视化构建 AI 智能体）。

GitHub Star 数超过 53k，是目前最流行的开源 AI 工作流平台之一。

## 为什么需要 Flowise？

在 Flowise 出现之前，如果你想在应用里接一个 AI 聊天机器人，需要：

1. 写代码调用 OpenAI API
2. 自己管理对话历史
3. 自己实现 RAG（检索增强生成，让 AI 能回答你公司文档里的问题）
4. 自己处理错误、日志、部署

Flowise 把上面所有这些事都变成了「拖拽积木」的操作。

## 核心概念

### 1. 三种构建器

Flowise 提供了三种不同层级的可视化构建器，从简单到复杂：

- **Assistant（助手）** — 最简单的入门方式。创建智能对话助手，它能遵循指令、使用工具、读取上传的文件来回答问题。适合零基础用户。
- **Chatflow（对话流）** — 更灵活的方式。可以构建单智能体系统、聊天机器人和简单 LLM 流程。支持高级技术如 Graph RAG、Reranker 等。
- **Agentflow（智能体流）** — 最强大的方式。是前两者的超集，可以创建多智能体系统和复杂的工作流编排。

### 2. Nodes（节点）

节点是 Flowise 的基本组件。每个节点做一件事：

- **LLM 节点** — 调用大语言模型（OpenAI、Anthropic、Ollama 等）
- **Chain 节点** — 把多个步骤串起来执行
- **Memory 节点** — 保存对话历史
- **Tool 节点** — 给 AI 提供工具（搜索、计算器、文件读写等）
- **Vector Store 节点** — 存储和检索向量数据（用于 RAG）
- **Document Loader 节点** — 从各种来源加载文档（PDF、网页、数据库等）

### 3. Connections（连线）

用线把节点连起来，数据就从上游流到下游。就像水管一样，水（数据）从水源（输入）经过过滤器（处理）从水龙头（输出）流出来。

### 4. RAG（检索增强生成）

RAG 是 AI 领域的重要概念。简单说：当用户提问时，系统先在自己的「知识库」里查找相关信息，然后把这些信息连同问题一起交给 AI，AI 基于查找到的信息来回答。这样 AI 就能回答它「训练时不知道」的最新知识。

### 5. MCP（Model Context Protocol）

MCP 是 AI 智能体与外部世界交互的协议。Flowise 内置了 MCP 客户端和服务端节点，让 AI 可以调用外部工具和服务。

## 安装与启动

### 方式一：npm 全局安装（最快）

```bash
npm install -g flowise
npx flowise start
```

然后在浏览器打开 http://localhost:3000 即可使用。

### 方式二：Docker 部署

```bash
# 构建镜像
docker build --no-cache -t flowise .

# 运行容器
docker run -d --name flowise -p 3000:3000 flowise

# 停止
docker stop flowise
```

### 方式三：从源码开发

```bash
git clone https://github.com/FlowiseAI/Flowise.git
cd Flowise
npm i -g pnpm
pnpm install
pnpm build
pnpm start
```

## 实际使用示例

### 示例一：搭建一个「公司文档问答机器人」

这个场景很常见：公司有大量产品文档，你想让 AI 能根据这些文档回答客户问题。这就是典型的 RAG 应用。

在 Flowise 中，你只需要把以下节点用线连起来：

```
[PDF 文件] → [文档分割器] → [文本嵌入模型] → [向量数据库]
                                                        ↓
[用户提问] → [向量数据库检索] → [提示词模板] → [大语言模型] → [回答]
```

一步步解释：

1. **PDF 文件节点** — 上传你的产品手册
2. **文档分割器节点** — 把大文件切成小段（因为 AI 一次不能读太长）
3. **文本嵌入模型节点** — 把每段文字变成数学向量（可以理解为一组数字，意义相近的文字数字也接近）
4. **向量数据库节点** — 存这些向量（支持 PostgreSQL、Pinecone、Chroma 等多种数据库）
5. **向量数据库检索节点** — 当用户提问时，找到与问题最相似的文档片段
6. **提示词模板节点** — 把「用户问题 + 检索到的文档片段」组合成一句话
7. **大语言模型节点** — 调用 GPT-4 或 Claude 来生成最终答案

整个过程不需要写一行代码，纯靠拖拽和连线。

### 示例二：通过 API 调用你的 AI 流程

Flowise 构建的每个流程都有对应的 REST API。启动后你可以直接用 curl 调用：

```bash
# 预测接口 — 发送消息并获取回答
curl -X POST http://localhost:3000/api/v1/prediction/chatflow/<YOUR_FLOW_ID> \
  -H "Content-Type: application/json" \
  -d '{
    "question": "你们的产品支持哪些部署方式？",
    "history": [
      ["human", "你好"],
      ["ai", "你好！有什么可以帮你的？"]
    ]
  }'

# 回复示例
# {
#   "text": "Flowise 支持多种部署方式，包括：自托管（AWS、Azure、GCP、Digital Ocean）、Docker、Railway、Render、Hugging Face Spaces 等...",
#   "isStreaming": false,
#   "sourceDocuments": [...]
# }
```

关键：`<YOUR_FLOW_ID>` 是在 Flowise 界面中创建流程后自动生成的 ID。

API 接口一览：

| 接口 | 功能 |
|------|------|
| `/api/v1/assistants/` | 管理 AI 助手 |
| `/api/v1/chatflows/` | 管理对话流程 |
| `/api/v1/prediction/` | 发送消息获取回答 |
| `/api/v1/vector/upsert/` | 上传向量数据 |
| `/api/v1/variables/` | 管理变量 |

## 生态与集成

Flowise 内置了大量第三方集成，覆盖了 AI 开发生态的各个角落：

- **大模型**：OpenAI、Anthropic Claude、Google Gemini、Ollama（本地）、AWS Bedrock、Mistral 等
- **向量数据库**：Pinecone、Weaviate、Chroma、PostgreSQL、MongoDB、Redis 等
- **框架**：LangChain、LlamaIndex
- **工具**：Google 搜索、计算器、文件读写、网页浏览、Gmail、Slack 等
- **部署**：AWS、Azure、GCP、Railway、Docker 等
- **监控**：Langfuse、Arize、Opik 等

## 进阶能力

当你对基础用法熟悉后，Flowise 还有更多高级功能：

- **多智能体系统** — 让多个 AI 分工协作，比如一个负责搜索、一个负责写作、一个负责审核
- **人机协同（Human in the Loop）** — 在关键步骤插入人工审批环节
- **流式输出（Streaming）** — 让 AI 的回答像打字一样逐字显示，用户体验更好
- **变量系统** — 在流程中存储和使用动态变量
- **工作区（Workspaces）** — 团队协作，多人管理不同的流程

## 总结

Flowise 的核心价值可以用一句话概括：把 AI 应用的开发门槛从「需要写代码」降低到「会拖拽连线」即可。

对于零基础学习者，建议学习路径：

1. 安装 Flowise 本地版（`npm install -g flowise` 即可）
2. 从 Assistant 模板开始，体验最简单的 AI 对话构建
3. 尝试 Chatflow，自己连线搭建一个 RAG 问答系统
4. 学习通过 API 调用你的流程
5. 进阶学习多智能体和工作流编排

---

*本笔记来源：Flowise 官方 GitHub (https://github.com/FlowiseAI/Flowise) 及官方文档 (https://docs.flowiseai.com)*
