---
title: LlamaIndex — 给大模型接上私有资料库
来源: 'https://github.com/run-llama/llama_index'
日期: 2026-07-09
分类: data-science-ai
难度: 中级
---

## 是什么

LlamaIndex 是一个把外部数据接到大模型上的开源框架。日常类比：LLM 像一个读过很多公开书的聪明人，但它不知道你公司文件柜里的内容；LlamaIndex 像图书管理员，负责把 PDF、网页、数据库、Wiki 切成卡片，按问题找出相关卡片，再交给 LLM 回答。

最小用法长这样：

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(docs)
query_engine = index.as_query_engine()
print(query_engine.query("这批文档里怎么定义报销？"))
```

这就是典型 RAG：先检索相关资料，再让模型基于资料生成答案。

## 为什么重要

- 不理解 LlamaIndex，就很难解释为什么“接公司知识库”不是简单把文件一股脑塞进 prompt。
- 不理解 LlamaIndex，就会把 RAG 误解成“向量数据库 + LLM”，忽略切片、检索、重排和合成。
- 不理解 LlamaIndex，就看不懂 Loader、Index、Retriever、QueryEngine 这四个词在 RAG 项目里各管什么。
- 不理解 LlamaIndex，就很难判断它和 LangChain、LangGraph、向量数据库之间的边界。

## 核心要点

1. **Loader 把资料搬进来**。类比搬家工：PDF、Markdown、网页、数据库都先变成统一的 Document。格式统一后，后面的切片和索引才有地方下手。

2. **Index 把资料做成可查的卡片柜**。类比图书馆目录：每段文本会被切成 Node，再计算 embedding，放进向量索引或其他索引结构里。

3. **Retriever 和 QueryEngine 负责问答闭环**。Retriever 找资料，QueryEngine 把资料和问题交给 LLM 组织答案。前者像找书，后者像帮你写读书报告。

## 实践案例

### 案例 1：本地文件夹问答

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("./handbook").load_data()
index = VectorStoreIndex.from_documents(docs)
engine = index.as_query_engine()
answer = engine.query("试用期请假规则是什么？")
```

逐部分解释：

- `SimpleDirectoryReader` 读取文件夹里的文档。
- `VectorStoreIndex.from_documents` 切片并建立向量索引。
- `as_query_engine()` 把检索和生成包装成一个 `.query()` 接口。

### 案例 2：换向量数据库

```python
from llama_index.core import StorageContext, VectorStoreIndex

storage_context = StorageContext.from_defaults(vector_store=my_vector_store)
index = VectorStoreIndex.from_documents(
    docs,
    storage_context=storage_context,
)
```

逐部分解释：

- LlamaIndex 不要求所有数据都放在内存里。
- `vector_store` 可以换成 Chroma、Qdrant、Pinecone、Weaviate 等后端。
- 应用代码继续面对 `index` 和 `query_engine`，底层存储可以替换。

### 案例 3：先检索再重排

```python
retriever = index.as_retriever(similarity_top_k=20)
nodes = retriever.retrieve("合同违约金怎么计算？")
top_nodes = reranker.postprocess_nodes(nodes, query_str="合同违约金怎么计算？")
```

逐部分解释：

- 第一步先粗召回，宁可多拿一些相关候选。
- 第二步用 reranker 精排，把真正贴近问题的片段排到前面。
- 这比只取 top-3 向量结果更稳，尤其适合法律、财务、制度文档。

## 踩过的坑

1. **以为默认切片一定合适**：chunk 太大召回不准，chunk 太小上下文断裂，实际项目要按文档结构调。

2. **换 embedding 后不重建索引**：不同 embedding 模型的向量空间不一样，只改配置会让新 query 和旧索引对不上。

3. **把 LlamaIndex 和 LangChain 混用太深**：两边都有 Document、Tool、LLM wrapper，混在一起会出现重复抽象和调试困难。

4. **忽略延迟链路**：一次 RAG 可能包含 embedding、向量检索、rerank、LLM 生成，P99 延迟不是只看模型响应时间。

## 适用 vs 不适用

适用：

- 企业内部知识库问答，需要接 PDF、Wiki、数据库和网页。
- 多文档总结、对比、制度问答这类“答案在资料里”的任务。
- 需要快速搭 RAG 原型，同时保留替换 vector store、embedding、LLM 的空间。
- 对检索质量要求较高，需要 hybrid retrieval 或 reranker 的场景。

不适用：

- 完全不需要外部资料，只是普通聊天或简单工具调用。
- 文档很少且能直接塞进长上下文窗口，RAG 反而增加复杂度。
- 极致低延迟场景，RAG 的多段调用链可能太重。
- 团队已经深度绑定另一个框架，迁移收益不够覆盖抽象成本。

## 历史小故事（可跳过）

- **2022 年**：项目最初叫 GPT Index，目标是让 GPT 能检索用户自己的数据。
- **2023 年**：项目改名 LlamaIndex，并围绕 RAG 建立 Loader、Index、Retriever、QueryEngine 心智模型。
- **2024 年**：生态拆成 core 和大量集成包，升级成本上升，但插件边界更清晰。
- **2024 年后**：LlamaCloud、Workflow 等能力出现，项目从单纯 RAG 框架扩展到托管服务和 agent 编排。

## 学到什么

- RAG 的难点不是“把文本变向量”这一行，而是资料加载、切片、召回、重排、合成的整条链路。
- LlamaIndex 的价值在于把这条链路拆成可替换组件，方便先跑通再逐步调优。
- 框架越省事，越容易隐藏默认值；真正上线前仍要检查 chunk、embedding、top_k、reranker 和提示词。
- 和 LangChain 相比，LlamaIndex 更像 RAG 专用工具箱，优势集中在数据接入和检索层。

## 延伸阅读

- GitHub 仓库：[run-llama/llama_index](https://github.com/run-llama/llama_index)
- 官方文档：[LlamaIndex Documentation](https://docs.llamaindex.ai/)
- [[langchain]] —— 更通用的 LLM 应用编排框架。
- [[chroma]] —— 常见开源向量数据库，可作为 LlamaIndex 后端。
- [[bm25]] —— hybrid retrieval 里常用的关键词检索基线。
- [[dspy]] —— 从另一个方向把 LLM pipeline 参数化和优化。

## 关联

- [[langchain]] —— 同属 LLM 应用框架，但覆盖面更宽。
- [[chroma]] —— LlamaIndex 常接的向量数据库之一。
- [[weaviate]] —— 面向向量检索和混合检索的数据库后端。
- [[bm25]] —— 关键词召回能补足纯向量检索的精确匹配弱点。
- [[dspy]] —— 更关注声明式 prompt/program 优化。
- [[openai-assistants-api]] —— 托管式文件检索和工具调用的相邻方案。
- [[rag]] —— LlamaIndex 主要服务的应用范式。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
