---
title: LlamaIndex — RAG 四件套数据框架
来源: https://github.com/run-llama/llama_index
日期: 2026-05-31
分类: AI / RAG
难度: 中级
---

## 是什么

LlamaIndex 是一个**专门把企业数据接到 LLM 上做检索增强（RAG）**的 Python / TypeScript 框架。日常类比：你家有一柜子的纸质资料（PDF / 数据库 / 内部 wiki），LlamaIndex 像一个**图书管理员加上四件套工具**——扫描器、卡片柜、检索灯、复读员，让 GPT 这种"什么都知道但不知道你家事"的助手能回答你具体的问题。

四件套构成了它的整条数据流：

1. **Loader（加载器）**——从 PDF / Notion / Slack / SQL 把原始内容捡进来
2. **Index（索引）**——把内容切成小卡片，每张算一个向量坐标
3. **Retriever（检索器）**——拿到问题，去卡片柜里挑最相关的几张
4. **QueryEngine（查询引擎）**——把挑出来的卡片 + 原问题塞给 LLM 生成答复

写一段最简检索：

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("data").load_data()      # Loader
index = VectorStoreIndex.from_documents(docs)         # Index
query_engine = index.as_query_engine()                # Retriever + QueryEngine
response = query_engine.query("报销政策对出租车有什么限制？")
```

四行做完一次完整 RAG。每一行恰好对应四件套里的一个角色。

## 为什么重要

不理解 LlamaIndex 的"四件套抽象"，下面这些事都没法解释：

- 为什么 2024 之后 RAG 项目里 LlamaIndex 与 [[langchain]] 形成"两强"——LangChain 万能，LlamaIndex 专精，四件套这一层抽象拆得最干净
- 为什么社区会沉淀出 200+ 现成的 data loader（LlamaHub）——Loader 接口稳定，写一个新 loader 不到 100 行
- 为什么生产 RAG 必须"检索 + 重排"——QueryEngine 把这俩串成默认链路
- 为什么换 embedding 模型必须重建索引——Index 这一层固化了向量空间
- 为什么 2024-12 LlamaIndex 也加了 **Workflow API**（事件驱动 agent）——四件套是直链，复杂任务需要图

## 核心要点

四件套**层层包裹**，外层只暴露内层的部分能力：

1. **Loader → Document**：每个 loader 把任意来源转成统一的 `Document` 对象（含 text + metadata）。换数据源只换这一层。

2. **Index = Document → Node + 向量**：把 Document 切成更小的 Node（默认 chunk = 1024 token，overlap = 20），每块算 embedding，存进向量库。类比：把一本书拆成读书卡片，背面贴坐标。

3. **Retriever**：根据问题，从一堆 Node 里挑最相关的几张。三种风格：vector（语义近似）、keyword（[[bm25]] 精确命中）、hybrid（两者加权融合）。

4. **QueryEngine**：把"挑出来的卡片 + 原问题"塞给 LLM 生成答复。这一层把 Retriever 和 LLM 黏成一个对外只 `.query()` 的对象。

2024 起又多了一层：

5. **Workflow**：事件驱动多步 agent 编排——靠 `@step` 装饰器把"调工具 / 检索 / 反思 / 重试"串成有向图。和 [[langgraph]] 同代产物，用来写四件套覆盖不到的复杂任务。

## 实践案例

### 案例 1：换 LLM 只改一行

默认用 OpenAI 的 embedding + chat。换成 Claude：

```python
from llama_index.llms.anthropic import Anthropic
from llama_index.core import Settings

Settings.llm = Anthropic(model="claude-sonnet-4-5")
```

QueryEngine 内部包装了 LLM，外层调用代码完全不变。这是分层抽象的典型好处。

### 案例 2：Sub-question（复杂问题自动拆）

用户问："对比 2023 和 2024 财年研发投入"。

`SubQuestionQueryEngine` 自动拆成两个子问题：

- "2023 财年研发投入是多少？" → 查 2023 财报
- "2024 财年研发投入是多少？" → 查 2024 财报

各自查完，让 LLM 合并答复。这一层"拆 + 合"对裸 RAG 是巨大升级——单次向量检索没法跨多文档对比。

### 案例 3：Hybrid retrieval（向量 + 关键词加权）

```python
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.retrievers import QueryFusionRetriever

vector_retriever = index.as_retriever(similarity_top_k=10)
bm25_retriever = BM25Retriever.from_defaults(nodes=nodes, similarity_top_k=10)

retriever = QueryFusionRetriever(
    [vector_retriever, bm25_retriever],
    similarity_top_k=10,
)
```

为什么要混：

- 纯向量擅长"语义相近"——问"报销出租车"能找到"打车费用"
- 纯关键词擅长"精确命中"——问"项目代号 Apollo-7"，向量经常漂走，BM25 直击
- 混着用，两类问题都罩住

## 踩过的坑

1. **0.x → 1.x 包名巨变**：早期 `from llama_index import ...`，后来拆成 `llama-index-core` + `llama-index-llms-openai` + `llama-index-embeddings-openai` ……一次升级要改 import 二三十处。老博客的代码 80% 跑不起来。

2. **embedding 维度不匹配**：换 embedding 模型（如从 OpenAI text-embedding-3-small 换到 BGE-large）必须**重建索引**，不能只换配置——向量空间不一样，新查询和旧 Node 完全对不上。

3. **大文档切片策略需调**：默认 chunk = 1024 + overlap = 20 对短文档够用；对一本书这种长文档，要调成 chunk = 512 + overlap = 50，并加 `SentenceSplitter` 按句子边界切——硬切到一半句子，召回质量会崩。

4. **Re-ranker 增加延迟**：在 Retriever 后加 cross-encoder re-ranker（如 `bge-reranker`）能显著提精度，但每次查询多花 200-500 ms。生产线 P99 要权衡。

5. **和 [[langchain]] 抽象不兼容**：两边都有 Document / LLM wrapper / vector store wrapper，但具体类型不同。一个项目同时引入两边 = 两套对象互相转换，社区有人玩过最后都拆掉只留一边。

## 适用 vs 不适用场景

**适用**：

- 企业内部知识库问答（接 Confluence / Notion / Google Drive）
- 多文档对比 / 摘要（Sub-question / Tree summarize）
- 需要 hybrid retrieval（金融 / 法律 / 医疗——既要语义又要精确命中）
- 用 LlamaCloud 这类 managed 方案，省自己搭向量库的工程量

**不适用**：

- 纯 agent 编排、不太需要"接外部文档"——[[langchain]] 或 [[langgraph]] 更顺手
- 极简单的"一份 PDF 问答"——直接长 context 塞进 GPT-4 / Claude 200k 窗口，省掉整套 RAG
- 极致延迟要求（< 200 ms）——RAG 调用链 embedding + Retriever + re-ranker + LLM，很难压下来
- 数据极敏感不能出网——需要全本地化，要费力换掉所有默认的 OpenAI 调用

## 历史小故事（可跳过）

- **2022-10**：Jerry Liu 在 Robust Intelligence 做工程师时，发现 GPT-3 处理长文档有上限，开了个小项目叫 **GPT Index**，先在 GitHub 收 700 star。
- **2023-02**：OpenAI 法务发函——名字带 "GPT" 不让用，改名 **LlamaIndex**，蹭了 Meta LLaMA 的流量，星标暴涨。
- **2023-08**：拿了红杉领投的 8.5M 种子轮，公司 Run-LLama 成立。
- **2024-04**：发布 v0.10，把单包拆成几十个子包，是社区"升级痛"的高峰期。
- **2024-Q3**：发布 **LlamaCloud**——managed RAG 服务，对标 OpenAI Assistants API。
- **2024-12**：发布 **Workflow API**（事件驱动 agent 编排），与 [[langgraph]] 形成对位。

## 学到什么

1. **四件套是 RAG 最干净的抽象**——Loader / Index / Retriever / QueryEngine 各管一段，换任一件不影响别人，这是 LlamaIndex 比裸写 RAG 快十倍的原因
2. **专才有时打得过通才**——LlamaIndex 比 [[langchain]] 起步晚一年，但靠"只做 RAG 做深"硬抢出半壁江山
3. **生态护城河**——200+ data loader 和重排器集成，是新框架最难复制的部分
4. **从开源到商业化的常见路径**——开源框架免费 + 云上 managed 服务收费，和 Vercel / Supabase 同一套打法
5. **API 稳定性很贵**——0.x → 1.x 拆包带来的迁移痛，是社区给出的"成长税"

## 关联

- [[langchain]] —— 通用 LLM 框架双雄之一，覆盖范围更广但 RAG 深度不及
- [[langgraph]] —— Workflow API 的对位产品，事件驱动 agent 编排
- [[bm25]] —— Hybrid retrieval 里的关键词检索算法
- [[chroma]] —— 默认推荐的开源向量数据库之一
- [[ollama]] —— 想本地化跑 LLM + embedding 时常配的运行时
