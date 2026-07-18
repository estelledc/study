---
title: LangChain — LLM 应用开发框架
来源: https://github.com/langchain-ai/langchain
日期: 2026-05-29
分类: AI / Agent
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/langchain-ai/langchain
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: cf2115a6cfaee73a747846be9316f0f8f93f5ba6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 1.3.14
---

## 是什么

LangChain Python 1.x 是一套**构建标准 agent 和 LLM 应用的组件层**。它统一模型、工具、结构化输出和 middleware，并把标准 model-tool loop 编译到 LangGraph 上。日常类比：LangChain 像一套带中间件插槽的通用工作台；LangGraph 是下面负责状态推进和恢复的机器。

你写：

```python
from langchain_openai import ChatOpenAI
chain = prompt | ChatOpenAI() | StrOutputParser()
chain.invoke({"question": "什么是 RAG？"})
```

底下换成 `ChatAnthropic()` / `ChatOllama()` 都不用改外层逻辑。这就是 LangChain 的本职工作。

由 Harrison Chase 在 2022-10 开源，恰好赶上 ChatGPT 那波热潮，迅速成为 LLM 应用开发领域引用最多的框架。

## 为什么重要

不理解当前 LangChain，下面这些事都说不清：

- 为什么标准 agent 不只是 `while model requests tool`，还需要 middleware、state、checkpointer 和 structured output
- 为什么模型、工具和 vector store 可以更换，但 provider 专属语义仍需要回归
- 为什么普通 chain 适合线性组合，而复杂持久状态机应下沉到 LangGraph
- 为什么 2023-2024 教程里的 `AgentExecutor` 不能直接当成 1.x 主入口

当前生态边界可以简化为：LangChain 提供标准 agent 和组件，LangGraph 提供低层状态编排，Deep Agents 提供更高层 batteries-included harness，LangSmith 提供评测和可观测产品。

## 核心要点

可以分成 **三层** 来看：

1. **LCEL（LangChain Expression Language）**：用 `|` 把 prompt、LLM、parser 像 Unix 管道一样串起来。`prompt | llm | parser` 的写法让 chain 像写函数一样直观。背后是把每个组件抽象成 `Runnable`，统一支持 `.invoke / .stream / .batch / .ainvoke`。

2. **`create_agent` 标准循环**：1.x 主入口会规范化 model、tools 和 response format，组合 middleware，建立 model/tool 节点，再编译成 `CompiledStateGraph`。模型没有 tool call 时结束，有 tool call 时进入工具节点再回到模型。

3. **RAG 流水线**：Loader（加载文档）→ Splitter（切块）→ Embedder（向量化）→ VectorStore（向量库）→ Retriever（检索）→ LLM（合成回答）。这条流水线把"让 LLM 读自己的私有知识"做成了标准件。底层向量库可以接 [[milvus]]、[[postgresql]]（pgvector）、[[redis]]、Chroma、Pinecone 等。

4. **Middleware 是横切能力边界**：summarization、human-in-the-loop、model/tool retry、调用上限和 PII 处理等能力可以包裹 model/tool 执行，而不必把所有逻辑手写进 graph 拓扑。

## 实践示例

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

### 案例 3：1.x Agent（让 LLM 调工具）

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """Return a deterministic demo value."""
    return f"{city}: sunny"

agent = create_agent(
    model="openai:gpt-5.5",
    tools=[get_weather],
    system_prompt="Answer briefly.",
)
```
result = agent.invoke({
    "messages": [{"role": "user", "content": "北京天气如何？"}]
})

LLM 自己决定"先搜索 → 看结果 → 总结"，整个循环 LangChain 帮你跑完。
`create_agent` 返回编译后的 StateGraph。模型决定是否调用工具，工具结果回到 message state，再由模型继续；真实运行仍需要对应 provider 依赖和凭证。

## 踩过的坑

1. **教程版本对不上**：旧资料常用 `create_react_agent + AgentExecutor`，固定 1.3.14 源码的标准入口已经是 `create_agent`。先核对安装版本和 import path，再复制示例。

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

## 版本演进边界

- 固定快照的 `langchain` 包版本是 `1.3.14`，Python 支持范围为 `>=3.10,<4.0`。
- README 已把项目定位为 agent engineering platform，并把 Deep Agents 作为更高层入口。
- `create_agent` 位于 `libs/langchain_v1/langchain/agents/factory.py`，返回编译后的 LangGraph。
- 旧 chain/agent 教程仍有学习价值，但 API 和能力边界必须按当前版本复核。
- 本文没有连接真实模型或 vector store，示例只经过固定源码静态核对。

## 学到什么

1. **抽象层的价值在于"换底不改面"**——LangChain 真正的护城河不是 chain 写法，是把 100+ 集成统一到同一个接口
2. **生态分层比“大一统框架”更准确**——LangChain、LangGraph、Deep Agents 和 LangSmith 各自负责不同层，不能把产品能力都算到一个 Python 包上。
3. **快速迭代是双刃剑**——API 漂移让早期教程过时，但也让框架追得上 LLM 领域的演化速度
4. **观察现象 → 抽象成模式 → 沉淀到框架**——Harrison 写 LangChain 之前，"prompt + LLM + parser"这种串法已经是事实标准，他只是把它命名 + 标准化

## 应用型自测

1. 一个教程使用 `AgentExecutor`，而当前项目安装的是 LangChain 1.3.14。第一步应该直接改 import，还是先确认控制流差异？
2. `create_agent` 返回 `CompiledStateGraph`，是否意味着所有业务都应该直接写 StateGraph？
3. Middleware 已开启 tool retry。一个支付工具超时后能否无条件自动重试？

检查点：

1. 先确认版本和语义；新入口不仅改名，还组合 middleware、state 和 structured output。
2. 不能。标准 model-tool loop 用 `create_agent` 更省事；只有自定义多阶段状态机才需要直接下沉。
3. 不能。retry 只解决调用策略，带副作用工具还需要幂等键、receipt 和不确定状态。

## 延伸阅读

- 官方文档：[python.langchain.com](https://python.langchain.com)（最权威，但版本对应要看清）
- 固定源码：[langchain-ai/langchain](https://github.com/langchain-ai/langchain) —— 本文绑定提交 `cf2115a6cfaee73a747846be9316f0f8f93f5ba6`
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

- [[papers/dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[react-agent]] —— ReAct Agent — 推理和行动交替的工具使用范式
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[botpress]] —— Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[dify]] —— Dify — LLM 应用开发平台
- [[projects/dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[haystack]] —— Haystack — 企业 NLP / RAG 流水线
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[langfuse]] —— Langfuse — LLM 应用可观测性
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[litellm-proxy]] —— LiteLLM Proxy — 自托管的 LLM 统一网关
- [[llama-index]] —— LlamaIndex — 给大模型接上私有资料库
- [[llamaindex]] —— LlamaIndex — LLM 数据框架
- [[mcp-ts-sdk]] —— MCP TS SDK — Model Context Protocol TypeScript 实现
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[ollama]] —— Ollama — 本地跑 LLM 的工具
- [[openai-agents-sdk]] —— OpenAI Agents SDK — 让多个 agent 协作的轻量框架
- [[rasa]] —— Rasa — 自己造一个能记住上下文的对话机器人
- [[unstructured]] —— Unstructured — 把任意文档解析成 LLM 能吃的元素列表
- [[vercel-ai]] —— Vercel AI SDK — 多 LLM Provider 统一 SDK
