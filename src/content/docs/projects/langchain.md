---
title: LangChain — LLM 应用开发框架
来源: https://github.com/langchain-ai/langchain
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

LangChain 是一套**用统一 API 调多种 LLM、串多种工具、做 RAG（检索增强）**的 Python / JS 开发框架。日常类比：以前你想从 OpenAI、Anthropic、本地 Llama 几家模型里挑一个用，每家 SDK 长得不一样——切换得改一堆代码。LangChain 像一个**万能转接头**：一套写法，下面的 LLM 想换哪家换哪家。

你写：

```python
from langchain_openai import ChatOpenAI
chain = prompt | ChatOpenAI() | StrOutputParser()
chain.invoke({"question": "什么是 RAG？"})
```

底下换成 `ChatAnthropic()` / `ChatOllama()` 都不用改外层逻辑。这就是 LangChain 的本职工作。

由 Harrison Chase 在 2022-10 开源，恰好赶上 ChatGPT 那波热潮，迅速成为 LLM 应用开发领域引用最多的框架。

## 为什么重要

不理解 LangChain，下面这些事都说不清：

- 为什么 LLM 应用开发不只是"调个 API"——你还得 prompt 模板、工具调用、记忆、RAG 串起来
- 为什么 GitHub 上**90k+ stars**——它是最早把"LLM 编排"问题模式化的项目之一
- 为什么后续 LlamaIndex / Haystack / Semantic Kernel 都在跟 LangChain 比形态
- 为什么"LCEL（管道符）"会变成 LLM 工程师常用语法

LangChain 现在不是单一框架，而是一个生态：LangChain（编排） + LangSmith（debug + 可观测） + LangGraph（多 Agent / 状态机） + LangServe（部署成 REST API）。

## 核心要点

可以分成 **三层** 来看：

1. **LCEL（LangChain Expression Language）**：用 `|` 把 prompt、LLM、parser 像 Unix 管道一样串起来。`prompt | llm | parser` 的写法让 chain 像写函数一样直观。背后是把每个组件抽象成 `Runnable`，统一支持 `.invoke / .stream / .batch / .ainvoke`。

2. **Tools + Agents**：让 LLM 不只是回话，还能"调外部工具"——搜索引擎、计算器、数据库查询、调 API。Agent 是个循环：LLM 决定调哪个工具 → 看结果 → 再决定下一步，直到完成。常见范式有 ReAct（推理 + 行动交替）和 function calling（结构化工具调用）。

3. **RAG 流水线**：Loader（加载文档）→ Splitter（切块）→ Embedder（向量化）→ VectorStore（向量库）→ Retriever（检索）→ LLM（合成回答）。这条流水线把"让 LLM 读自己的私有知识"做成了标准件。底层向量库可以接 [[milvus]]、[[postgresql]]（pgvector）、[[redis]]、Chroma、Pinecone 等。

## 实践案例

### 案例 1：最简 chain（LCEL 入门）

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template("用一句话解释：{topic}")
llm = ChatOpenAI(model="gpt-4o-mini")
chain = prompt | llm | StrOutputParser()

print(chain.invoke({"topic": "向量数据库"}))
```

**逐部分解释**：

- `prompt` 是模板，`{topic}` 是占位符，调用时填入
- `|` 把三个 Runnable 串起来：填模板 → 调 LLM → 提纯字符串
- `chain.invoke({...})` 执行整条管道；`.stream()` 流式返回；`.batch([...])` 批量

### 案例 2：RAG（让 LLM 读你的私有文档）

```python
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. 加载并切块
docs = TextLoader("notes.md").load()
splits = RecursiveCharacterTextSplitter(chunk_size=500).split_documents(docs)

# 2. 向量化 + 入库
vectorstore = Chroma.from_documents(splits, OpenAIEmbeddings())
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# 3. RAG 专用 prompt（要把检索到的 context 塞进模板）
prompt = ChatPromptTemplate.from_template(
    "根据资料回答：{context}\n\n问题：{question}"
)

# 4. 把 retriever 接进 chain
rag_chain = (
    {"context": retriever, "question": lambda x: x}
    | prompt
    | llm
    | StrOutputParser()
)
rag_chain.invoke("我笔记里关于 Hindley-Milner 的核心要点是什么？")
```

**逐部分解释**：先切块入库，再定义带 `{context}`/`{question}` 的模板，最后用 `|` 把检索灌进 LLM。后端可换 [[milvus]] / 本地 BGE / Ollama，外层不变。

### 案例 3：Agent（让 LLM 调工具）

```python
from langchain.agents import create_react_agent, AgentExecutor
from langchain_community.tools import DuckDuckGoSearchRun

tools = [DuckDuckGoSearchRun()]
agent = create_react_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

executor.invoke({"input": "搜一下 LangGraph 0.2 有什么新特性，用 100 字总结"})
```

LLM 自己决定"先搜索 → 看结果 → 总结"，整个循环 LangChain 帮你跑完。

## 踩过的坑

1. **API 变得太频繁**：v0.0 → v0.1（2024-01）→ v0.2（2024-05）→ v0.3（2024-09）几乎每半年一次大重构。教程满天飞但很多版本对不上。学习时**优先看官方当前文档**，别信 2023 年的博客。

2. **抽象太厚 debug 难**：一个 chain 可能套 5 层 Runnable，报错追栈追到底。LangSmith（同公司的 trace 工具）几乎是必装——没它你不知道每一步 prompt 实际长啥样。

3. **LCEL 学习曲线**：`|` 看起来简洁，但当你要加分支、并行、动态路由，`RunnableLambda / RunnableParallel / RunnableBranch` 一堆——刚学时不如普通 Python 直观。

4. **和 LlamaIndex 边界模糊**：纯 RAG 场景两者都行，社区争论"RAG 选哪个"很久。一般共识：**LangChain 偏编排（chain + agent），LlamaIndex 偏检索本身（更精细的 index 结构）**。混用也常见。

5. **生产化坑**：直接把 chain 暴露成 HTTP 端点要小心——超时、并发、流式、token 计费、错误兜底都要自己加。LangServe 帮一部分，但真上量还得自己加缓存 / 限流 / 熔断。

## 适用 vs 不适用场景

**适用**：

- 需要快速 PoC：一周内拼出"私有文档问答"或"工具调用 Agent"
- 多 LLM 切换需求：今天 OpenAI，明天本地模型，外层不想改
- RAG 系统骨架：标准件齐全，能拼能改
- 教学 / 学习：生态文档丰富，社区例子多

**不适用**：

- 极致延迟敏感：抽象层有开销，纯调 LLM 比裸 SDK 慢一截
- 长期生产稳定：API 漂移大，每次升级要回归测试
- 复杂状态机 / 多 Agent 协作：建议直接用 LangGraph（同家族但定位不同）
- 业务逻辑极简：只要"调一次 LLM 拿结果"，直接用 SDK 比引入 LangChain 轻得多

## 历史

- **2022-10**：Harrison Chase 在 Robust Intelligence 当 ML 工程师时，业余开源 LangChain（Python 版）
- **2023-01**：ChatGPT 爆火，LangChain stars 一周从 1k 涨到 10k
- **2023-04**：LangChain Inc. 成立，Sequoia 领投种子轮
- **2023-05**：LangSmith（trace + eval 平台）私测
- **2023-12**：LCEL 正式定为推荐 chain 写法，老的 `LLMChain` / `SequentialChain` 进入弃用
- **2024-01**：v0.1 GA，包结构拆成 `langchain-core` / `langchain-community` / `langchain` 三层
- **2024-01**：LangGraph 发布，专攻多 Agent / 状态机 / 长流程
- **2024-09**：v0.3 LTS，承诺 API 稳定一年（被社区盯着看是否兑现）

短短 2 年从一个人副业涨到 90k stars + 估值过亿美金的公司，是 LLM 时代最快的开源-商业转化案例之一。

## 学到什么

1. **抽象层的价值在于"换底不改面"**——LangChain 真正的护城河不是 chain 写法，是把 100+ 集成统一到同一个接口
2. **生态 > 单点工具**——LangChain + LangSmith + LangGraph + LangServe 互相绑死，单看每个都有竞品，绑一起就难替换
3. **快速迭代是双刃剑**——API 漂移让早期教程过时，但也让框架追得上 LLM 领域的演化速度
4. **观察现象 → 抽象成模式 → 沉淀到框架**——Harrison 写 LangChain 之前，"prompt + LLM + parser"这种串法已经是事实标准，他只是把它命名 + 标准化

## 延伸阅读

- 官方文档：[python.langchain.com](https://python.langchain.com)（最权威，但版本对应要看清）
- LangSmith trace 调试：[docs.smith.langchain.com](https://docs.smith.langchain.com)
- LangGraph 多 Agent：[langchain-ai.github.io/langgraph](https://langchain-ai.github.io/langgraph/)
- [[milvus]] —— 大规模向量检索引擎，可作 LangChain 的 VectorStore
- [[postgresql]] —— pgvector 让通用关系库也能做向量检索

## 关联

- [[milvus]] —— 向量数据库，LangChain RAG 流水线的可选后端
- [[postgresql]] —— pgvector 扩展让 PG 同时承担关系存储 + 向量检索
- [[redis]] —— RediSearch 也能做向量库，更适合短期缓存场景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
