---
title: LlamaIndex — LLM 数据框架与 RAG 四件套
description: Loader / Index / Retriever / QueryEngine；300+ 集成包与 llama-index-core 插件化架构
来源: 'https://github.com/run-llama/llama_index'
日期: 2026-06-05
分类: 机器学习
子分类: RAG
难度: 中级
provenance: manual-read
---

## 是什么

**LlamaIndex**（原 llama_index）是 LlamaIndex Inc. 维护的**开源 LLM 数据框架**：把 PDF、数据库、API 等私有数据通过 connector  ingest，建成 index（向量/图/关键词等），再经 retriever + query engine 喂给任意 LLM 做 RAG 或 agent 工具链。Python 包分 **`llama-index-core`** 与 **300+ 集成插件**（LlamaHub）。

日常类比：如果裸调 OpenAI API 是「直接问百科全书」，LlamaIndex 是**先帮你建私人书架、再按问题抽 relevant 章节**的图书管理员——5 行代码能跑通 POC，低层 API 也能换 embedding / vector store / reranker。

四件套心智模型：

| 组件 | 职责 |
|------|------|
| Loader | 读 PDF/SQL/API → Document |
| Index | 结构化存储（VectorStoreIndex 最常见） |
| Retriever | 按 query 召回 chunks |
| QueryEngine | 召回 + LLM 生成答案 |

## 为什么重要

不懂 LlamaIndex，2024–2026 年 RAG 工程对话会缺默认参照：

- **与 LangChain 并列的 Python RAG 入口**：`SimpleDirectoryReader` + `VectorStoreIndex.from_documents` 是教程级标准写法
- **集成生态极大**：OpenAI/Ollama/HuggingFace embedding、[[qdrant]]/Chroma/Pinecone 向量库即插即用
- **LlamaParse 云产品同品牌**：文档 OCR/解析可独立用，也可回灌 framework
- **import 命名空间约定**：`llama_index.core.*` vs `llama_index.llms.openai.*` 分清 core 与 integration

## 核心要点

1. **Settings 全局默认**：`Settings.llm` / `Settings.embed_model` 一次设定，全局 index 复用——多租户要记得 isolate Settings 或显式传参。

2. **持久化 storage_context**：内存 index 重启丢；`index.storage_context.persist("./storage")` + `load_index_from_storage` 是生产最低要求。

3. **Workflow / Agent 新方向**：除经典 RAG，仓库现也强调 agentic app 与 LlamaAgents——但 core 四件套仍是入门主轴。

## 实践案例

### 案例 1：五行走通目录 RAG

```python
import os
os.environ["OPENAI_API_KEY"] = "sk-..."

from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

documents = SimpleDirectoryReader("./docs").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()
print(query_engine.query("项目部署步骤是什么？"))
```

适合 PoC；生产要加 chunk 策略、metadata filter、eval。

### 案例 2：换 Ollama 本地 LLM

```python
from llama_index.core import Settings, VectorStoreIndex, SimpleDirectoryReader
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

Settings.llm = Ollama(model="llama-3.1:latest", request_timeout=360.0)
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

documents = SimpleDirectoryReader("./docs").load_data()
index = VectorStoreIndex.from_documents(documents)
print(index.as_query_engine().query("总结第一章"))
```

本地推理省 API 费；注意 embed 与 llm 维度/上下文分别配置。

### 案例 3：持久化与 reload

```python
# 保存
index.storage_context.persist(persist_dir="./storage")

# 重启后加载
from llama_index.core import StorageContext, load_index_from_storage
storage_context = StorageContext.from_defaults(persist_dir="./storage")
index = load_index_from_storage(storage_context)
```

CI 里把 `./storage` 当 artifact 或挂对象存储，避免每次重建 embedding。

## 踩过的坑

1. **chunk 默认太大/太小**：`SimpleDirectoryReader` 不自动语义切分——用 `SentenceSplitter` 或 SemanticSplitter 显式设 chunk_size。

2. **embed 与 vector store 维度不一致**：换 embed model 必须重建 index，旧 storage 不能直接 load。

3. **LlamaHub 包版本漂移**：`pip install llama-index-llms-xxx` 要与 core 主版本兼容，否则 import 报错。

4. **把 framework 当 orchestration 全家桶**：复杂 multi-agent 可能更适合专用 agent 框架——LlamaIndex 强项是 data layer。

## 适用 vs 不适用场景

**适用：**

- 企业文档 / 知识库 RAG
- 快速试验不同 vector store / LLM 组合
- 需要 LlamaParse 做复杂 PDF 解析后再 index

**不适用：**

- 纯对话无 retrieval（直接用 LLM SDK）
- 超低延迟在线 serving（要额外建 cache + 专用向量服务）
- 强事务型 SQL 问答且 schema 极复杂（可能要 Text-to-SQL 专栈）

## 历史小故事（可跳过）

- **2022.11**：Jerry Liu 发布 LlamaIndex（原 GPT Index）
- **2023**：集成包爆发，LlamaHub 生态形成
- **2024–2025**：品牌统一 LlamaIndex Inc.，LlamaParse / Cloud 商业化
- **今**：与 LangChain、Haystack 构成 RAG 三巨头参照

## 学到什么

- RAG 质量 = retrieval 质量 + chunk 策略，framework 只解决 plumbing
- core/integration 分包是 Python LLM 生态常见模式，锁版本比追 latest 重要
- persist + eval set 是 PoC 进生产的最低门槛

## 延伸阅读

- 官方文档：https://developers.llamaindex.ai/python/framework/
- LlamaHub 集成列表：https://llamahub.ai
- `docs/examples/` 目录按 index 类型分示例
- [[haystack]] —— 同类 RAG 框架对照
- [[qdrant]] —— 常用向量后端

## 关联

- [[haystack]] —— 另一 RAG 框架
- [[qdrant]] —— 向量存储集成
- [[langchain]] —— 若已写则编排层对照
- [[openai-agents-sdk]] —— agent 路线对照
- [[unstructured]] —— 文档解析上游
- [[chromadb]] —— 轻量向量库选项
- [[docker]] —— 部署 query 服务
- [[promptfoo]] —— RAG eval 工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
