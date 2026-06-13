---
title: Local Deep Research — 本地运行的大模型研究 Agent
来源: https://github.com/LearningCircuit/local-deep-research
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Local Deep Research — 本地运行的大模型研究 Agent

## 一句话理解

把它想象成请了一位私人研究员：你丢给它一个问题，它自动上网搜索、翻阅学术论文、阅读你的私人文档，最后给你写一份带出处的研究报告。而且整件事运行在你自己的电脑上，数据不外泄。

这个工具叫 Local Deep Research（简称 LDR），是 LearningCircuit 开源的 AI 研究助手。

## 它解决了什么问题

传统使用 AI 研究的流程是：
1. 你手动在搜索引擎搜几个关键词
2. 打开几篇论文或网页
3. 自己读、自己整理、自己写结论

LDR 把这个流程自动化了。它用 LangGraph 构建了一个"自主研究 Agent"——大模型自己决定搜什么、用什么搜索引擎、什么时候停下来开始写报告。

## 核心概念拆解

### 1. 自主研究 Agent（LangGraph Agent Strategy）

这是 LDR 最核心的设计。传统的"搜索+总结"是线性流水线：你给一个问题，系统按固定步骤搜索、阅读、总结。而 LDR 的 Agent 模式像一个人做研究：

```
你问："什么是量子纠错？"
  → Agent 先搜 Wikipedia 获取基础概念
  → 发现不够，又去 arXiv 查最新论文
  → 读到一半发现需要医学应用方面的信息
  → 自动切换到 PubMed 搜索
  → 综合所有信息，写出带引用的报告
```

它根据每一步的发现，动态决定下一步该搜什么、用什么引擎。

### 2. 多引擎搜索

LDR 支持 10+ 种搜索引擎，分为三类：

- **免费学术引擎**：arXiv（论文）、PubMed（生物医学）、Semantic Scholar
- **免费通用引擎**：Wikipedia、SearXNG（自托管的隐私搜索引擎）
- **付费引擎**：Tavily、Google（通过 SerpAPI）

Agent 可以自动切换引擎，比如搜技术问题用 GitHub，搜论文用 arXiv。

### 3. 本地知识库

LDR 有一个"知识图书馆"概念：每次研究找到的好资料可以下载存储到你的私人图书馆。系统自动提取文字、建立索引、做成向量嵌入（embedding）。下次你研究时，它既能搜全网，也能搜你自己的文档库。

```
研究 → 下载资料 → 存入图书馆 → 索引 & 嵌入 → 搜索你的文档 → 结合搜索结果一起回答
```

### 4. 隐私与加密

所有数据存在加密的 SQLCipher 数据库里，使用 AES-256 加密。没有遥测、没有分析、没有数据外传。唯一的网络调用是你主动发起的：搜索查询、LLM API 调用。

## 安装与运行

最简单的方式是 Docker Compose（CPU 模式，所有平台都适用）：

```bash
# 拉取 docker-compose 配置
curl -O https://raw.githubusercontent.com/LearningCircuit/local-deep-research/main/docker-compose.yml

# 一键启动
docker compose up -d
```

启动后打开 http://localhost:5000 就能用。系统会自动拉三个容器：LDR 主程序、Ollama（本地 LLM）、SearXNG（搜索）。

如果用 GPU，再加一个 GPU 配置文件就行。

也可以用 pip 安装：

```bash
pip install local-deep-research
python -m local_deep_research.web.app
```

## 使用示例

### 示例 1：一行代码启动研究

LDR 提供了 Python API，最简单的用法是一行代码搞定：

```python
from local_deep_research.api import LDRClient, quick_query

# 一行代码做研究
summary = quick_query("username", "password", "什么是量子计算？")
print(summary)
```

这里 `quick_query` 会自动完成搜索、阅读、总结的全过程，返回带引用的摘要。

### 示例 2：用 LangChain 接入自己的知识库

如果你想让 LDR 搜索你的公司内部文档，可以接入 LangChain 的向量检索器：

```python
from local_deep_research.api import quick_summary

# 用你自己的 LangChain 检索器搜索公司知识库
result = quick_summary(
    query="我们的部署流程是什么？",
    retrievers={"company_kb": 你的向量检索器对象},
    search_tool="company_kb"
)
print(result["summary"])
```

这让它能同时搜索全网和你自己的 FAISS / Chroma / Pinecone 等向量数据库。

## 关键能力一览

- **三种研究模式**：快速摘要（30秒~3分钟）、详细研究、报告生成（带目录和章节）
- **20+ 研究策略**：针对快速查事实、深度分析、学术研究各有优化
- **多种 LLM 支持**：本地用 Ollama / LM Studio / llama.cpp，云端用 OpenAI / Claude / Gemini / OpenRouter（100+ 模型）
- **MCP Server**：可以直接给 Claude Desktop / Claude Code 使用，让 Claude 帮你做深度研究
- **HTTP API**：带认证和 CSRF 保护的 REST API
- **导出格式**：PDF 和 Markdown
- **订阅功能**：可以订阅某个话题，定期收到 AI 生成的研究报告

## 性能表现

LDR 在公开基准测试上表现突出。使用 `langgraph-agent` 策略 + 本地 Qwen3.6-27B 模型跑在单张 RTX 3090 上：

| 模型 | SimpleQA | xbench-DeepSearch |
|------|----------|-------------------|
| Qwen3.6-27B | 95.7% | 77.0% |
| Qwen3.5-9B  | 91.2% | 59.0% |
| gpt-oss-20B | 85.4% | – |

这是目前公开可复现的、在消费级硬件上最好的本地深度研究结果之一。

## 技术架构要点

- **框架**：LangGraph 构建研究 Agent 的循环决策逻辑
- **搜索**：集成 10+ 搜索引擎，Agent 自动选择
- **LLM**：支持所有 OpenAI 兼容的 API（本地或云端）
- **数据库**：SQLCipher 加密的 SQLite，每用户独立隔离
- **前端**：Vite + React 的 Web UI
- **后端**：Python（FastAPI 风格），使用 PDM 做包管理
- **部署**：Docker / Docker Compose / pip，支持 Linux / macOS / Windows

## 总结

LDR 的核心价值是"把深度研究的能力本地化"。它不是一个简单的搜索工具，而是一个能自主规划、动态调整搜索策略、最终产出结构化研究报告的研究 Agent。对于需要频繁做研究、写报告、或者重视数据隐私的人来说，它提供了一种不需要依赖外部云服务的全新方式。

## 延伸阅读

- GitHub 仓库：https://github.com/LearningCircuit/local-deep-research
- Docker Compose 指南：docs/docker-compose-guide.md
- 安装参考：docs/installation.md
- 配置参考：docs/CONFIGURATION.md
- 社区基准测试：https://huggingface.co/datasets/local-deep-research/ldr-benchmarks
