---
title: Haystack — 企业 NLP / RAG 流水线
来源: https://github.com/deepset-ai/haystack
日期: 2026-05-31
分类: AI / Agent
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/deepset-ai/haystack
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 859a6eb3ac4d0bd33f069bab57fb041e3434a353
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.0
---

## 是什么

Haystack 是一套**用组件图把 NLP / RAG / Agent 流程连成流水线**的 Python 框架（PyPI 包名 `haystack-ai`），由 deepset 开源。日常类比：把它想成“工厂里的传送带 + 分拣机”——文档从一头进来，每经过一个工位（清洗、切块、向量化、检索、调 LLM），端口类型都被校验，对不上就在装配期报错，不让残次品流到下一站。

你写：

```python
from haystack import Pipeline
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever
from haystack.components.builders import ChatPromptBuilder
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage

template = [ChatMessage.from_user("用以下文档回答：{{documents}}\n问题：{{query}}")]

pipe = Pipeline()
pipe.add_component("retriever", InMemoryBM25Retriever(document_store=store))
pipe.add_component("prompt", ChatPromptBuilder(template=template))
pipe.add_component("llm", OpenAIChatGenerator())
pipe.connect("retriever.documents", "prompt.documents")
pipe.connect("prompt.prompt", "llm.messages")
pipe.run({"retriever": {"query": "Haystack 是什么"}, "prompt": {"query": "Haystack 是什么"}})
```

`connect("A.x", "B.y")` 这一行是 Haystack 的灵魂：装配期检查 `A.x` 输出与 `B.y` 输入的 socket 名称与类型，不匹配当场抛错。

## 为什么重要

不理解 Haystack 的设计，下面这些事就说不清：

- 为什么 LLM 应用框架除了 LangChain 还有人造一套——**组件图比线性链表达力强**（分支、汇合、路由，固定 3.1.0 还支持环）
- 为什么“生产级 RAG”和“原型级 RAG”是两件事——前者要类型校验、可序列化、能 dump 成 YAML 交给运维
- 为什么 Pipeline 抽象在数据工程（[[airflow]]）、ML（[[pytorch-lightning]]）、NLP 反复出现
- 为什么一个 2020 年起家的 NLP 框架，到 3.x 会长出核心 Agent、工具层与 skills 存储

## 核心要点

固定 3.1.0 可以分三层理解：

1. **Component（组件）**：最小执行单元。Python 类加 `@component` 装饰器，实现 `run()`；输出 socket 用 `@component.output_types(...)`（或构造期 `set_output_types`）显式声明。Haystack 据此给每个端口贴名称和类型标签。

2. **Pipeline（流水线）**：`connect("source.socket", "target.socket")` 把组件连成图。与 LangChain 线性链的差异：一个输出可以分叉给多个下游、多个上游可以汇合，**而且图允许环**——执行调度会给同一环内的组件分配同等优先级，只有环内连接属于不受支持的形态时才报错。所以 agent 式“LLM ↔ 工具”循环可以直接建在图里。同一个 `Pipeline` 类提供 `run`（同步）、`run_async`、`run_async_generator`（流式）三个入口。

3. **Agent 与工具层（3.x 核心能力）**：`haystack.components.agents.Agent` 就在核心包（不再是 experimental）；`haystack/tools/` 提供 `Tool` / `ComponentTool` / `PipelineTool` / `Toolset`——任何组件或整条 pipeline 都能包成工具给 Agent 调；`skill_stores/` 提供 agent skills 的文件系统存储。

存储侧：核心包只内置 in-memory document store 和 types 协议，Elasticsearch / Weaviate / pgvector 等经独立 integration 包接入——换库不改业务代码。Pipeline 本身可 `dumps()`/`loads()` 序列化（默认 YAML）。

## 实践示例

### 案例 1：最简 RAG 流水线（查询侧）

```python
from haystack.components.builders import ChatPromptBuilder
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage

template = [ChatMessage.from_user("用以下文档回答：{{documents}}\n问题：{{query}}")]

pipe = Pipeline()
pipe.add_component("retriever", InMemoryBM25Retriever(document_store=store))
pipe.add_component("prompt", ChatPromptBuilder(template=template))
pipe.add_component("llm", OpenAIChatGenerator())

pipe.connect("retriever.documents", "prompt.documents")
pipe.connect("prompt.prompt", "llm.messages")

result = pipe.run({"retriever": {"query": "Haystack 是什么"},
                   "prompt":    {"query": "Haystack 是什么"}})
print(result["llm"]["replies"])
```

DAG 形态是 `retriever -> prompt -> llm`，但 `query` 同时喂给 `retriever` 和 `prompt` 两个入口——这就是图而不是线性链。

### 案例 2：索引侧流水线（写入文档存储）

```python
from haystack.components.converters import TextFileToDocument
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
from haystack.components.embedders import OpenAIDocumentEmbedder
from haystack.components.writers import DocumentWriter

indexing = Pipeline()
indexing.add_component("converter", TextFileToDocument())
indexing.add_component("cleaner",   DocumentCleaner())
indexing.add_component("splitter",  DocumentSplitter(split_by="word", split_length=200))
indexing.add_component("embedder",  OpenAIDocumentEmbedder())
indexing.add_component("writer",    DocumentWriter(document_store=store))

indexing.connect("converter.documents", "cleaner.documents")
indexing.connect("cleaner.documents",   "splitter.documents")
indexing.connect("splitter.documents",  "embedder.documents")
indexing.connect("embedder.documents",  "writer.documents")
```

每一步的 socket 类型都对得上；接错（比如把 embeddings 接到 documents 口）在 `connect()` 这一刻就报错——不用等运行时崩。固定 3.1.0 核心 `haystack.components.embedders` 导出的是 `OpenAIDocumentEmbedder` / `AzureOpenAIDocumentEmbedder` / `MockDocumentEmbedder`（及对应 text 变体）；`SentenceTransformersDocumentEmbedder` 不在该 pin 的核心包，本文不把它写成当前 API。

### 案例 3：自定义 Component

```python
from haystack import component

@component
class WordCounter:
    @component.output_types(count=int)
    def run(self, text: str):
        return {"count": len(text.split())}
```

`@component.output_types(count=int)` 显式声明这个组件产出名为 `count` 的 int socket；下游谁要接，类型必须匹配。组件协议就这么小——类 + 装饰器 + run。

## 踩过的坑

1. **大版本断层，教程先看版本**：v1（`from haystack.pipelines import ...`）与 v2/v3（`from haystack import Pipeline`）API 完全不同；3.x 又把 Agent 收进核心、扩展了工具层。抄任何教程前先核对它绑定的版本。

2. **socket 名字能省则省是错觉**：`connect("retriever", "prompt")` 只在两端各有唯一 socket 时可行；多 socket 必须写全 `connect("retriever.documents", "prompt.documents")`，不写就报错。

3. **“Pipeline 不能有环”是旧知识**：固定 3.1.0 的图允许环，agent 循环可以进图；但环内连接形态有约束，不受支持的环会在运行入口抛错。别再按“DAG-only”设计，也别假设任意环都合法。

4. **核心包不带外部向量库**：`haystack-ai` 只内置 in-memory 存储；接 Elasticsearch / Qdrant 等要装对应 integration 包，版本兼容按各自包的发布节奏走。

5. **类型校验的严格度是双刃剑**：装配期报错前移了问题，但也意味着升级框架或换组件时，类型不匹配会立即拦住你——预留调整 socket 适配的时间。

6. **旧 completion generator 教程会直接 import 失败**：`haystack.components.generators` 在该 pin 只导出 `OpenAIImageGenerator`；文本 LLM 要用 `haystack.components.generators.chat.OpenAIChatGenerator`，输入 socket 是 `messages`，不是已删除的 `OpenAIGenerator.prompt`。`PromptBuilder` 仍在核心 builders 里，但和 chat generator 配对的是产出 `list[ChatMessage]` 的 `ChatPromptBuilder`，连接写成 `prompt.prompt → llm.messages`。

## 适用 vs 不适用场景

**适用**：

- 企业内部知识库 QA（文档量大、组件多、需要可维护）
- 需要严格类型 + 可序列化 pipeline 的团队协作项目（YAML dump 给运维）
- 复杂分支检索（BM25 与向量并行再合并、按文档类型路由不同 LLM）
- 要在同一框架内搭 agent 循环 + 工具调用（3.x 核心 Agent + tools）

**不适用**：

- 快速原型 / Demo——装配式写法比一行式链要多敲不少代码
- 极轻量场景（一个 prompt 一个 LLM）——引入组件图是杀鸡用牛刀
- 主要生态在 JS/TS 的团队——它是 Python 框架
- 需要框架内置托管向量库——存储永远是外接的

## 固定版本边界

- 本文绑定 `deepset-ai/haystack@859a6eb3...`，即 release tag `v3.1.0`；`VERSION.txt` 与 `pyproject.toml`（包名 `haystack-ai`）一致；`requires-python >=3.10`。
- 该版本 `Pipeline` 提供 `run` / `run_async` / `run_async_generator`；图允许环（不受支持的环形连接在运行入口抛错）；Agent 位于核心 `haystack.components.agents`，工具层含 `Tool`/`ComponentTool`/`PipelineTool`/`Toolset`，`skill_stores/` 提供 skills 文件系统存储。
- 核心 `haystack.components.generators` 只导出 `OpenAIImageGenerator`；文本生成入口是 `OpenAIChatGenerator`（`messages` → `replies`）。核心 embedders 为 OpenAI / Azure OpenAI / Mock 的 document 与 text 变体；`SentenceTransformersDocumentEmbedder` 在该 pin 的核心树中不存在。
- 核心只内置 in-memory document store；外部存储经独立 integration 包接入，其版本兼容不在本文绑定范围。
- 本文未安装依赖、未运行任何 pipeline 或上游测试、未测检索/生成质量，状态保持 `UNVERIFIED`。

## 学到什么

1. **组件图是流水线类抽象的收敛形态**——分支、汇合、环都要表达时，图比链稳定得多
2. **装配期校验前移故障**——socket 类型合同把“运行时才炸”的错误变成“connect 当场报错”
3. **框架的 agent 化路径**：从 DAG 编排到核心 Agent + 工具层 + skills 存储，Haystack 3.x 是“编排框架长出 agent 能力”的样本
4. **核心小、生态外挂**——in-memory 之外全部走 integration 包，核心演进与向量库生态解耦

## 应用型自测

1. 固定 3.1.0 里，想做“LLM ↔ 工具”循环，必须把循环写在 Pipeline 外面吗？
2. `pipe.connect("embedder", "writer")` 什么时候可行，什么时候必须写全 socket 名？
3. `haystack-ai` 装完就能连 Elasticsearch 吗？

检查点：

1. 不必须。该版本图允许环，Agent 也在核心包；只有环内连接形态不受支持时才报错。
2. 两端各只有一个 socket 时可省；任一端有多个 socket 就必须写 `component.socket` 全名，否则报错。
3. 不能。核心只带 in-memory 存储，Elasticsearch 要装对应 integration 包。

## 延伸阅读

- 官方文档：[Haystack Docs](https://docs.haystack.deepset.ai/)
- 固定源码：[deepset-ai/haystack](https://github.com/deepset-ai/haystack) —— 本文绑定提交 `859a6eb3ac4d0bd33f069bab57fb041e3434a353`
- [[langchain]] —— 最直接的对手，对比着看最快理解 Haystack 的设计选择
- [[airflow]] —— 另一个把图当核心抽象的框架，思想同源

## 关联

- [[langchain]] —— 同样做 LLM 编排，但走线性链 + duck typing 的设计
- [[langfuse]] —— 管线跑起来之后的下一件事：LLM 调用的追踪与评测
- [[airflow]] —— DAG 调度的鼻祖，思想可类比
- [[pytorch-lightning]] —— 用 Pipeline 抽象封装训练循环，同样追求可维护工程化
- [[unstructured]] —— 上游文档解析层，产出可进 Haystack 索引管线的元素

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[unstructured]] —— Unstructured — 把任意文档解析成 LLM 能吃的元素列表
