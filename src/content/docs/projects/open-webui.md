---
title: Open WebUI — 在本地搭一个类似 ChatGPT 的网站
来源: https://github.com/open-webui/open-webui
日期: 2026-06-13
分类_原始: AI 工具链
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

## 是什么

Open WebUI 是一个**自己搭的 ChatGPT 界面**。日常类比：你每天用 ChatGPT 网站聊天，但那个网站是 OpenAI 的，你的对话数据存在他们那儿。Open WebUI 让你在自己的服务器上部署一个**长得几乎一样的聊天界面**，后端可以接 Ollama（本地模型）、接 OpenAI API、接任何兼容 OpenAI 格式的 API——数据完全留在自己手里。

它最特别的地方是**开箱即用的 RAG（检索增强生成）**：你丢一份 PDF 进去，它自动切碎、向量化、存进向量数据库，然后你问相关问题时，它会先去那份 PDF 里找答案再回答。不需要写一行代码。

## 为什么重要

- ChatGPT 的对话存在 OpenAI 服务器，公司用不上（合规问题）；Open WebUI 让你**完全自托管**
- 它不是简单的"前端壳"，而是自带模型管理、RAG、多模型对话、函数调用、插件系统的**完整平台**
- 背后支持 Ollama + OpenAI API 双通吃，从"纯本地"到"接商业 API"无缝切换
- GitHub 141k stars，是目前**最火的开源 LLM 前端项目**

## 核心概念

### 1. 模型后端（Model Backend）

Open WebUI 本身**不跑模型**。它像一个"浏览器"，帮你跟后端的 LLM 服务对话。后端可以是：

- **Ollama**：本地跑的模型，数据不出本机
- **OpenAI API**：接 gpt-4 等模型
- **任何 OpenAI-compatible API**：LMStudio、GroqCloud、Mistral、OpenRouter 等

配置方式就是设环境变量。接 Ollama：

```bash
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

接远程 Ollama 服务器：

```bash
docker run -d -p 3000:8080 \
  -e OLLAMA_BASE_URL=https://my-server.example.com:11434 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

### 2. RAG（检索增强生成）

RAG 的本质是：**你问的问题，不在模型的训练数据里，那我先去你的文档里找答案，再回答**。

Open WebUI 内置了这个能力。流程是：

1. 上传 PDF/文档到聊天或文档库
2. 系统自动切分文本、做 embedding、存入向量数据库
3. 你提问时，系统先用向量搜索找到相关的文档片段
4. 把这些片段作为上下文喂给 LLM，让它基于这些材料回答

选 9 种向量数据库之一（ChromaDB、PGVector、Qdrant、Milvus、Elasticsearch 等）。配置示例：

```yaml
# docker-compose.yml 示例：Open WebUI + Qdrant 做 RAG
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      - WEBUI_SECRET_KEY=your-secret-key
      - RAG_VECTOR_DB=qdrant
      - QDRANT_URL=http://qdrant:6333
    volumes:
      - open-webui:/app/backend/data
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  open-webui:
  qdrant_data:
```

### 3. Pipelines（插件系统）

Pipelines 是 Open WebUI 的**插件框架**，用 Python 写。你可以注入自定义逻辑到对话流程中，比如：

- 用户限流（每人每天最多 100 次对话）
- 内容过滤（有毒消息自动拦截）
- 实时翻译（用 LibreTranslate 做中英互译）
- 用量监控（对接 Langfuse）

基本结构：

```python
# example_pipeline.py
from pipelines.interfaces import PipelineInterface

class MyPipeline(PipelineInterface):
    def __init__(self, client):
        self.client = client

    def ingest(self, messages):
        # 对话发送前拦截，可以做任何处理
        for message in messages:
            if "敏感词" in message.get("content", ""):
                message["content"] = "[已过滤]"
        return messages

    def stream(self, response):
        # 模型返回时拦截，可以做二次处理
        for chunk in response:
            yield chunk
```

配置好 Pipelines 后，把 OpenAI 的 BASE_URL 指向 Pipelines 的地址，所有对话都会先过你的插件。

### 4. Many Models（多模型对话）

一个聊天窗口同时发给多个模型，对比它们的回答。比如同时发给 Llama 3、Mistral 和 GPT-4o，看同一个问题三个模型分别怎么答。适合做**模型质量对比**或**取最优回答**。

## 安装方式一览

| 方式 | 命令/步骤 | 适合场景 |
|------|----------|---------|
| Docker（最简单） | `docker run ... ghcr.io/open-webui/open-webui:main` | 个人试用 |
| Docker + Ollama 一体化 | `ghcr.io/open-webui/open-webui:ollama` | 一台机器搞定，含模型 |
| Docker + CUDA | 加 `--gpus all` + `:cuda` 镜像 | 有 NVIDIA 显卡 |
| pip | `pip install open-webui` → `open-webui serve` | Python 开发环境 |
| K8s | Helm / Kustomize | 生产部署 |

访问地址：默认 `http://localhost:3000`

## 关键特性速查

- **RAG**：9 种向量数据库 + 多种文档解析引擎（Tika、Docling、PaddleOCR 等）
- **Web 搜索**：15+ 搜索提供商，搜索结果直接注入对话
- **网页抓取**：`# https://example.com` 把网页内容喂给模型
- **语音/视频通话**：内置免费语音对话，支持本地 Whisper、OpenAI Whisper 等
- **图片生成**：DALL-E、Gemini、ComfyUI（本地）、AUTOMATIC1111（本地）
- **PWA 移动端**：手机上像原生 App 一样用
- **RBAC**：管理员/普通用户的权限分级
- **SCIM 2.0 + SSO**：对接 Okta、Azure AD、Google Workspace 等企业身份系统
- **OpenTelemetry**：生产级监控，traces/metrics/logs 全支持
- **多数据库后端**：SQLite（默认）、PostgreSQL、S3/GCS/Azure Blob 存储

## 一句话总结

Open WebUI 让你用**一行 Docker 命令**，搭出一个拥有 RAG、多模型、插件系统、企业级权限管理的**私有 ChatGPT 平台**，后端模型随意换，数据完全自己掌控。
