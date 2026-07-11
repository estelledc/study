---
title: LlamaIndex — LLM 数据框架
来源: https://github.com/run-llama/llama_index
日期: 2026-05-29
分类: AI / RAG
难度: 中级
---

## 是什么

LlamaIndex 是一个**专门把企业数据接到 LLM 上**的 Python / TypeScript 框架。日常类比：你家有一柜子的纸质资料（PDF / 数据库 / 内部 wiki），LlamaIndex 是那个**帮你扫描、切片、贴标签、按需翻找**的图书管理员，目的是让 GPT 这种"什么都知道但不知道你家事"的助手回答你公司的具体问题。

它和 [[langchain]] 的关系常被这样比喻：

- [[langchain]] 是**万能瑞士军刀**——什么都能做（agent / chain / RAG / tool），但每件事都不深
- LlamaIndex 是**专做 RAG 的电锯**——只锯一种木头，但锯得又快又干净

它的整条数据流可以记成 **RAG 四件套**：扫描器（loaders）→ 卡片柜（index store）→ 检索灯（retrievers）→ 复读员（synthesizers）。四步对应下面四行代码里的每一行。

写一段最简检索：

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(docs)
query_engine = index.as_query_engine()
response = query_engine.query("公司报销政策对出租车有什么限制？")
print(response)
```

四行做完一次完整 RAG（Retrieval-Augmented Generation，检索增强生成）。

## 为什么重要

不理解 LlamaIndex，下面这些事都没法解释：

- 为什么 2024 之后 RAG 项目里 LlamaIndex 与 [[langchain]] 形成"两强"，而不是后者一统天下
- 为什么"接 PDF / Notion / Slack / Google Drive"这种琐碎活，社区会沉淀出 200+ 现成的 data loader（LlamaHub）
- 为什么生产级 RAG 常在向量召回后再加一步重排（re-rank）——LlamaIndex 把 cross-encoder re-ranker 做成**可选插件**，接上就能用
- 为什么 2024 底 LlamaIndex 也加了"Workflow API"（事件驱动 agent），和 LangGraph 形成对位
- 为什么 LlamaCloud（managed RAG 服务）是 2024 年这家公司商业化的主线

## 核心要点

LlamaIndex 的数据流可以拆成 **三层**：

1. **Document → Node**：把原始文件加载进来，切成小块（chunk），每块算嵌入向量。类比：把一本书拆成一张张读书卡片，每张卡片背面贴一个数字坐标。

2. **Retriever**：根据用户问题，从一堆 Node 里挑最相关的几张卡片。可以用 vector（语义近似）/ keyword（[[bm25]] 关键词）/ hybrid（两者加权融合）三种方式。

3. **Query Engine**：把"挑出来的卡片 + 原问题"一起塞给 LLM，让它**基于卡片内容**回答。这一层把 retriever 和 LLM 黏成一个对外只暴露 `.query()` 的对象。

2024 起又多了一层：

4. **Workflow**：事件驱动的多步 agent 编排——和 LangGraph 同一时代产物，靠 `@step` 装饰器把"调工具 / 检索 / 反思 / 重试"串成有向图。

## 实践案例

### 案例 1：最简 RAG（逐步拆开）

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.llms.openai import OpenAI  # 可换成 Claude / Ollama

# 第 1 步：换模型（可选；默认也是 OpenAI）
Settings.llm = OpenAI(model="gpt-4o-mini")

# 第 2 步：扫描 data/ 下 PDF/Markdown → Document 列表
docs = SimpleDirectoryReader("data").load_data()

# 第 3 步：切块 + 算 embedding → 建向量索引
index = VectorStoreIndex.from_documents(docs)

# 第 4 步：对外只暴露 .query()；内部 = 检索 + 把片段塞给 LLM
response = index.as_query_engine().query("公司报销政策对出租车有什么限制？")
print(response)
```

**逐部分解释**：第 2 步是"图书管理员扫描"；第 3 步是"贴坐标进卡片柜"；第 4 步是"翻出相关卡片再复述"。默认**不做** cross-encoder 重排——要加 re-ranker 需另接节点。

### 案例 2：Sub-question（复杂问题自动拆）

用户问："对比公司 2023 和 2024 财年研发投入"。裸向量检索一次只能捞一堆片段，很难做跨年对比。

1. `SubQuestionQueryEngine` 让 LLM 先拆成子问题："2023 研发投入？" / "2024 研发投入？"
2. 每个子问题各自走一遍 retriever → 得到数字或段落
3. 再把两份证据交给 LLM 合并成对比答复

这一层"拆 + 合"是对单次 RAG 的升级：对比类问题不再指望一次 top-k 碰巧两边都齐。

### 案例 3：Hybrid retrieval（向量 + 关键词加权）

```python
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.retrievers import QueryFusionRetriever

vector_retriever = index.as_retriever(similarity_top_k=10)
bm25_retriever = BM25Retriever.from_defaults(nodes=nodes, similarity_top_k=10)

retriever = QueryFusionRetriever(
    [vector_retriever, bm25_retriever],
    similarity_top_k=10,
    num_queries=1,
)
```

为什么要混：

- 纯向量检索擅长"语义相近"——问"报销出租车"能找到"打车费用"
- 纯关键词擅长"精确命中"——问"项目代号 Apollo-7"，向量经常漂走，BM25 直击
- 混着用，两类问题都能罩住

## 踩过的坑

1. **和 [[langchain]] 功能重复且不兼容**：两边都做 RAG / loader / agent，但抽象层完全不同——在一个项目里同时引入 = 两套 Document、两套 LLM 包装、两套 vector store wrapper，社区有人玩过，最后都拆掉只留一边。

2. **0.x → 1.x 包名巨变**：早期 `from llama_index import ...`，后来拆成 `llama-index-core` + `llama-index-llms-openai` + `llama-index-embeddings-openai` ... 一次升级要改 import 二三十处。老博客的代码 80% 跑不起来。

3. **Re-ranker 增加延迟**：在 retriever 后加 cross-encoder re-ranker（如 `bge-reranker`）能显著提精度，但每次查询多花 200-500 ms。生产线上要权衡 P99 延迟。

4. **大文档切片策略需调**：默认 chunk size = 1024 token，overlap = 20，对短文档够用；对一本书这种长文档，往往要调成 chunk = 512 + overlap = 50，并加 `SentenceSplitter` 按句子边界切——硬切到一半句子，召回质量会崩。

5. **embedding 维度不匹配**：换 embedding 模型（如从 OpenAI text-embedding-3-small 换到 BGE-large）必须**重建索引**，不能只换配置——向量空间不一样，新查询和旧 Node 完全对不上。

## 适用 vs 不适用场景

**适用**：

- 企业内部知识库问答（接 Confluence / Notion / Google Drive）
- 多文档对比 / 摘要（Sub-question / Tree summarize）
- 需要 hybrid retrieval（金融 / 法律 / 医疗——既要语义又要精确命中）
- 用 [[llamacloud]] 这类 managed 方案，省自己搭 vector DB 的工程量

**不适用**：

- 纯 agent 编排、不太需要"接外部文档"——[[langchain]] 或 LangGraph 更顺手
- 极简单的"一份 PDF 问答"——直接长 context 塞进 GPT-4 / Claude 200k 窗口，省掉整套 RAG
- 极致延迟要求（< 200 ms）——RAG 调用链 embedding + retriever + re-ranker + LLM，很难压下来
- 数据极敏感不能出网——需要全本地化部署，要费力换掉所有默认的 OpenAI 调用

## 历史小故事（可跳过）

- **2022-10**：Jerry Liu 在 Robust Intelligence 做工程师时，发现 GPT-3 处理长文档有上限，开了个小项目叫 **GPT Index**，先在 GitHub 收 700 star。
- **2023-02**：OpenAI 法务发函——名字带 "GPT" 不让用，改名 **LlamaIndex**，蹭了 Meta LLaMA 的流量，星标暴涨。
- **2023-08**：拿了红杉领投的 8.5M 种子轮，公司 Run-LLama 成立。
- **2024-04**：发布 v0.10，把单包拆成几十个子包，是社区"升级痛"的高峰期。
- **2024-Q3**：发布 **LlamaCloud**——managed RAG 服务，对标 OpenAI Assistants API + AWS Bedrock Knowledge Base。
- **2024-12**：发布 **Workflow API**（事件驱动 agent 编排），与 [[langgraph]] 形成对位。

## 学到什么

1. **专才有时打得过通才**——LlamaIndex 比 [[langchain]] 起步晚一年，但靠"只做 RAG 做深"硬抢出半壁江山
2. **生态护城河**——200+ data loader（LlamaHub）和重排器集成，是新框架最难复制的部分
3. **从开源到商业化的常见路径**——开源框架免费 + 云上 managed 服务收费（LlamaCloud），和 Vercel / Supabase / Datadog 同一套打法
4. **API 稳定性很贵**——0.x → 1.x 拆包带来的迁移痛，是社区给出的"成长税"
5. **RAG 框架的真正壁垒不是算法，是 connector**：200+ data loader 让 LlamaIndex 能直连 Confluence / Notion / 公司 Wiki，新框架想抄都得重造一遍生态——平台型工具的护城河 90% 在集成数量
6. **改名能救命**：原名 GPT Index 被 OpenAI 法务函逼改成 LlamaIndex，结果蹭上 Meta LLaMA 的流量反而更火——一个不利的法务事件被反向利用成营销机会
7. **chunking 不是 framework 的事**：LlamaIndex 提供 SentenceSplitter / SemanticSplitter / Markdown-aware 多种切片，但最终质量取决于业务文档结构——框架能给工具，调参仍要人懂自己的语料
8. **embedding 重建是 RAG 的迁移税**：换 embedding 模型 = 全量重建索引；这条规则让"换更好模型" 在大规模知识库上变得很贵，是 RAG 系统的隐藏成本项

## 关联

- [[langchain]] —— 通用 LLM 框架双雄之一，覆盖范围更广但 RAG 深度不及
- [[langgraph]] —— Workflow API 的对位产品，事件驱动 agent 编排
- [[bm25]] —— Hybrid retrieval 里的关键词检索算法
- [[chroma]] —— 默认推荐的开源向量数据库之一
- [[ollama]] —— 想本地化跑 LLM + embedding 时常配的运行时

<!-- 合并自 [[llama-index]] dedup 2026-05-31 -->
