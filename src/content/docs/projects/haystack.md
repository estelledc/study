---
title: Haystack — 企业 NLP / RAG 流水线
来源: https://github.com/deepset-ai/haystack
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Haystack 是一套**用 DAG（有向无环图）把 NLP / RAG 组件连成流水线**的 Python 框架，由德国柏林公司 deepset.ai 开源。日常类比：把它想成"工厂里的传送带 + 分拣机"——文档从一头进来，每经过一个工位（清洗、切块、向量化、检索、调 LLM），输出格式都被严格校验，对不上就当场报错，不让残次品流到下一站。

你写：

```python
from haystack import Pipeline
from haystack.components.retrievers import InMemoryBM25Retriever
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator

pipe = Pipeline()
pipe.add_component("retriever", InMemoryBM25Retriever(document_store=store))
pipe.add_component("prompt", PromptBuilder(template=template))
pipe.add_component("llm", OpenAIGenerator())
pipe.connect("retriever.documents", "prompt.documents")
pipe.connect("prompt.prompt", "llm.prompt")
pipe.run({"retriever": {"query": "Haystack 是什么"}})
```

`connect("A.x", "B.y")` 这一行是 Haystack 的灵魂：它检查 `A.x` 的输出类型和 `B.y` 的输入类型是否匹配，不匹配直接抛错——拼装期就把错暴露出来。

## 为什么重要

不理解 Haystack，下面这些事就说不清：

- 为什么 LLM 应用框架除了 LangChain 还有人造一套——**DAG 比线性链表达力强**（分支、汇合、条件路由）
- 为什么"生产级 RAG"和"原型级 RAG"是两件事——前者要类型校验、要可序列化、要能 dump 成 YAML 部署
- 为什么 Pipeline 这个抽象在数据工程（[[airflow]]）、ML（[[pytorch-lightning]]）、NLP 都反复出现
- 为什么从 2020 的 NLP 框架转型成 2024 的 LLM 框架，整个项目要重写一遍

Haystack 现在大约 17k stars，是企业落地 RAG 的主流选择之一，和 [[langchain]]、LlamaIndex 三足鼎立。

## 核心要点

可以分成 **三层** 来理解：

1. **Component（组件）**：最小执行单元。每个 Component 是一个 Python 类，带 `@component` 装饰器，必须实现 `run()` 方法。**关键点**：输入输出都用类型注解显式声明，比如 `run(query: str) -> dict[str, list[Document]]`。Haystack 用这些注解构建"socket"——给每个端口贴标签和类型。

2. **Pipeline（流水线）**：把多个 Component 用 `connect("source.out_socket", "target.in_socket")` 连成 DAG。**和 LangChain 最大的区别**：LangChain LCEL 的 `prompt | llm | parser` 是线性链；Haystack 允许一个组件的输出分叉给多个下游、多个上游汇合到一个组件——是真正的图。

3. **DocumentStore（文档存储）**：向量库抽象层，把 Elasticsearch / Weaviate / Pinecone / pgvector / Qdrant 等统一成同一组接口。Pipeline 不关心底下接哪家——换库不改业务代码。

三层加起来叫 **Haystack v2 架构**（2024-03 重写后的版本，和 v1 完全不兼容）。

## 实践案例

### 案例 1：最简 RAG 流水线（查询侧）

```python
template = "用以下文档回答：{{documents}}\n问题：{{query}}"

pipe = Pipeline()
pipe.add_component("retriever", InMemoryBM25Retriever(document_store=store))
pipe.add_component("prompt", PromptBuilder(template=template))
pipe.add_component("llm", OpenAIGenerator(model="gpt-4o-mini"))

pipe.connect("retriever.documents", "prompt.documents")
pipe.connect("prompt.prompt", "llm.prompt")

result = pipe.run({"retriever": {"query": "Haystack 是什么"},
                   "prompt":    {"query": "Haystack 是什么"}})
print(result["llm"]["replies"])
```

这条 pipeline 的 DAG 是：`retriever -> prompt -> llm`，但 `query` 同时喂给 `retriever` 和 `prompt`——这就是 DAG 而不是线性链。

### 案例 2：索引侧流水线（写入向量库）

```python
indexing = Pipeline()
indexing.add_component("converter", TextFileToDocument())
indexing.add_component("cleaner",   DocumentCleaner())
indexing.add_component("splitter",  DocumentSplitter(split_by="word", split_length=200))
indexing.add_component("embedder",  SentenceTransformersDocumentEmbedder())
indexing.add_component("writer",    DocumentWriter(document_store=store))

indexing.connect("converter.documents", "cleaner.documents")
indexing.connect("cleaner.documents",   "splitter.documents")
indexing.connect("splitter.documents",  "embedder.documents")
indexing.connect("embedder.documents",  "writer.documents")
```

每一步类型都对得上，连接时一旦写错（比如把 `embedder.embeddings` 接到 `writer.documents`），Pipeline 在 `connect()` 这一刻就报错——不用等运行时崩。

### 案例 3：自定义 Component

```python
from haystack import component

@component
class WordCounter:
    @component.output_types(count=int)
    def run(self, text: str):
        return {"count": len(text.split())}
```

`@component.output_types(count=int)` 显式告诉 Haystack：这个组件产出一个名为 `count` 的 int 类型 socket。下游谁要用，必须接受 `int`。

## 踩过的坑

1. **v1 和 v2 完全不兼容**：网上 2023 年前的教程几乎全是 v1（`Pipeline` API 完全不同）。看教程先确认日期 + 是否 import `from haystack import Pipeline`（v2）还是 `from haystack.pipelines import Pipeline`（v1）。

2. **socket 名字必须显式**：`pipe.connect("retriever", "prompt")` 这种省略 socket 名的写法只在两端各有唯一 socket 时才行；多 socket 时必须写全 `connect("retriever.documents", "prompt.documents")`，不写就报错。

3. **类型不严格匹配会让你怀疑人生**：比如 `List[Document]` 和 `list[Document]`（Python 3.9+ 写法）在某些版本里被当成不同类型——升级 Haystack 时这种坑很多。

4. **Pipeline 不能有环**：DAG 顾名思义是无环图。要做循环（比如 ReAct agent 那种 LLM-工具反复调用），得用 `haystack-experimental` 里的 `Agent` 组件，或自己在 Pipeline 外写循环。

## 适用 vs 不适用场景

**适用**：

- 企业内部知识库 QA（文档量大、组件多、需要可维护）
- 客服 / 法律 / 金融领域 RAG（数据敏感，要本地部署 + 严格类型）
- 复杂分支检索（先 BM25 再 vector，结果合并；按文档类型路由不同 LLM）
- 团队协作开发（类型严格让多人改 Pipeline 不容易出锅）

**不适用**：

- 快速原型 / Demo（LangChain LCEL 三行写完，Haystack 要装配半天）
- 强 Agent 循环逻辑（DAG 表达不了原生循环，要绕；用 LangGraph 更顺手）
- 中文社区为主的项目（资料少，问题难搜）
- 极轻量场景（一个 prompt 一个 LLM，引入 Haystack 是杀鸡用牛刀）

## 学到什么

1. **DAG 是流水线类抽象的天然形态**——[[airflow]] 调度、[[pytorch-lightning]] 训练、Haystack RAG 都殊途同归
2. **类型严格 vs 灵活**是框架设计的两条路：LangChain 选灵活（duck typing）、Haystack 选严格（socket 类型校验），各有受众
3. **v1 → v2 重写**是开源项目转型的代价——2020 年的 NLP 框架跟不上 LLM 时代，只能推倒重写
4. **Pipeline 可序列化**是生产级特性：Haystack v2 的 Pipeline 能 dump 成 YAML，让运维不碰 Python 也能部署/改图

## 延伸阅读

- 官方文档：[Haystack Docs](https://docs.haystack.deepset.ai/)（v2 教程在 "Get Started"）
- v1 vs v2 迁移指南：[Migration Guide](https://docs.haystack.deepset.ai/docs/migration)
- GitHub：[deepset-ai/haystack](https://github.com/deepset-ai/haystack)
- [[langchain]] —— 最直接的对手，对比着看最快理解 Haystack 的设计选择
- [[airflow]] —— 另一个把 DAG 当核心抽象的框架，思想同源

## 关联

- [[langchain]] —— 同样做 LLM 编排，但选择线性链 + duck typing 的设计
- [[airflow]] —— DAG 调度的鼻祖，思想可类比
- [[pytorch-lightning]] —— 用 Pipeline 抽象封装训练循环，和 Haystack 同样追求"可维护工程化"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[haystack-2010]] —— Haystack — Facebook 十亿张照片怎么存
- [[llama-index]] —— LlamaIndex — LLM 数据框架与 RAG 四件套
- [[milvus-2021]] —— Milvus — 为向量检索而生的数据库
- [[pytorch-lightning]] —— PyTorch Lightning — PyTorch 训练循环抽象
- [[unstructured]] —— Unstructured — 把任意文档解析成 LLM 能吃的元素列表

