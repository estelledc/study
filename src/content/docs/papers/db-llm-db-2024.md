---
title: Database Meets LLM: A Survey
来源: https://arxiv.org/abs/2309.07140
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Database Meets LLM: A Survey — 零基础学习笔记

## 一、什么是"数据库遇见 LLM"？

### 1.1 一个日常类比

想象你开了一家图书馆：

- **传统数据库** = 图书馆有一个编目系统，书都有编号，管理员按编号精准找书
- **LLM（大语言模型）** = 一个博学的朋友，你问他什么他都能回答，但不一定每次都准

"Database Meets LLM" 就是把这两者结合起来。比如：

- 你让 LLM 帮你查数据库（"去年销量最高的商品是什么？"），LLM 替你写成 SQL 去查
- 你把数据库里的数据喂给 LLM，让它给出更有价值的回答

这就像 **给一个博学但偶尔出错的朋友配了一本精确的目录索引**。

---

## 二、核心概念

### 2.1 Text-to-SQL

这是最经典的方向。你用自然语言提问，系统自动把它变成 SQL 查询。

**传统方式**：你得自己写 SQL
```sql
SELECT product_name, SUM(quantity)
FROM orders
WHERE order_date >= '2024-01-01'
GROUP BY product_name
ORDER BY SUM(quantity) DESC
LIMIT 10;
```

**Text-to-SQL 方式**：你只说一句话，系统帮你生成上面的 SQL：

> "帮我找出 2024 年以来销量最高的前 10 种商品"

```
用户说: "2024年以来销量最高的前10种商品"
       ↓
   Text-to-SQL 引擎
       ↓
生成 SQL: SELECT product_name, SUM(quantity) ...
       ↓
   数据库执行
       ↓
返回:  [{product: "iPhone", qty: 5000}, ...]
```

### 2.2 关键挑战

| 挑战 | 类比 | 说明 |
|------|------|------|
| 模式理解 | 图书馆的编目规则复杂 | 数据库表结构千差万别，LLM 需要先"看懂" |
| 语义对齐 | 你说"热销"，数据库理解的是字段 | 自然语言和数据库语言的映射不是 1:1 |
| 幻觉 | 朋友可能编造答案 | LLM 可能生成语法正确但逻辑错误的 SQL |
| 复杂查询 | "比上次回答的再复杂 10 倍" | JOIN、子查询、窗口函数让难度陡增 |

### 2.3 RAG（检索增强生成）

RAG 是目前最流行的"数据库 + LLM"应用模式：

```
用户问题: "公司去年 Q3 的利润是多少？"
       ↓
┌─────────────────────────────┐
│  Step 1: 把问题变成向量      │  "把句子变成数字，让相似问题数字接近"
│  Step 2: 在向量数据库中搜索   │  找到最相关的文档片段
│  Step 3: 把搜索结果 + 问题一起 │
│        发给 LLM              │
│  Step 4: LLM 基于检索到的内容 │  生成准确答案
└─────────────────────────────┘
```

---

## 三、技术架构详解

### 3.1 Text-to-SQL 系统的工作流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  自然语言 │────>│  Schema   │────>│  LLM     │────>│   SQL    │
│  问题     │     │  理解     │     │  生成    │     │  执行    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                            │
                                     ┌──────────┐
                                     │  结果返回 │
                                     └──────────┘
```

#### 第一步：Schema 理解

数据库的表结构（叫 Schema）要告诉 LLM。比如：

```
表: users
  列: id (INT), name (TEXT), age (INT), city (TEXT)

表: orders
  列: id (INT), user_id (INT), amount (DECIMAL), order_date (DATE)
```

LLM 需要先理解这些表怎么关联，才能写出正确的查询。

#### 第二步：SQL 生成（代码示例）

一个典型的 Text-to-SQL prompt 长这样：

```
You are a SQL expert. Given the following database schema:

Schema:
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    city TEXT
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount DECIMAL(10, 2),
    order_date DATE
);

Translate the following natural language question into SQL:
"北京年龄段最大的用户叫什么名字？"

SQL:
```

LLM 会生成：

```sql
SELECT name, age
FROM users
WHERE city = '北京'
ORDER BY age DESC
LIMIT 1;
```

#### 第三步：纠错与执行

因为 LLM 可能生成错误 SQL，实际系统会加入反馈循环：

```python
# 伪代码：Text-to-SQL 的执行+纠错循环
def query_database(question):
    sql = llm_generate_sql(question, schema)   # 生成 SQL
    
    try:
        result = db.execute(sql)                # 尝试执行
        return result                           # 成功，返回结果
    except Error as e:
        # SQL 语法错误，把错误信息告诉 LLM 让它修正
        sql = llm_fix_sql(sql, str(e), schema)
        result = db.execute(sql)
        return result
```

### 3.2 向量数据库与 Embedding

RAG 的核心是把文本变成向量。类比：

> 把每篇文章变成一张地图上的坐标点。意思相近的文章，坐标点就靠得近。

```python
# 示例：用 embedding 把文档分块存入向量数据库
import chromadb  # 向量数据库

# 1. 把长文档切成小块
documents = chunk_text("""
这是一份很长的技术文档...
包含很多段落和细节...
""", chunk_size=500)

# 2. 把每个块变成向量（embedding）
vectors = [embedding_model(doc) for doc in documents]

# 3. 存入向量数据库
client = chromadb.Client()
collection = client.create_collection("tech_docs")
collection.add(
    documents=documents,
    embeddings=vectors,
    ids=[f"doc_{i}" for i in range(len(documents))]
)

# 4. 用户提问时搜索
question_vector = embedding_model("什么是数据库索引？")
results = collection.query(
    query_embeddings=[question_vector],
    n_results=3
)
# 返回最相关的 3 个文档片段
```

### 3.3 Neural Database（神经数据库）

这是更前沿的方向——**用神经网络替代传统数据库的某些组件**：

```
传统数据库引擎：
    查询 → B-Tree 索引 → 磁盘读取 → 结果

神经数据库：
    查询 → 神经网络模型 → 直接输出预测结果
```

一个例子：**Learned Index**（用 ML 替代 B-Tree 索引）

```
传统 B-Tree 索引找数据：
    二分查找，时间复杂度 O(log n)

Learned Index：
    训练一个函数 f(key) → 预测数据在存储中的位置
    查询时直接调用 f(key)，可能 O(1)
```

---

## 四、Survey 的分类框架

"Database Meets LLM" 的研究大致分三大方向：

### 方向一：LLM uses Database（LLM 使用数据库）

- **Text-to-SQL**：自然语言 → SQL 查询
- **RAG**：从数据库检索知识增强生成
- **Knowledge Graph + LLM**：图数据库 + LLM 做推理

### 方向二：Database uses LLM（数据库使用 LLM）

- **Learned Index**：用 ML 模型优化查询执行
- **Query Optimization**：用 ML 预测最优查询计划
- **Data Cleaning**：用 LLM 自动清洗数据

### 方向三：LLM + Database 融合架构

- **Neural Join**：用神经网络近似连接查询
- **Differentiable Database**：让数据库操作可微，支持端到端训练
- **Database for LLM Training**：用数据库管理 LLM 训练数据

---

## 五、代码实战：搭建一个简单的 RAG 系统

### 5.1 完整示例

```python
from langchain.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.llms import OpenAI
from langchain.chains import RetrievalQA

# Step 1: 加载文档并分块
loader = TextLoader("company_docs.pdf")
documents = loader.load()

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50    # 每块重叠 50 字，避免信息被截断
)
chunks = text_splitter.split_documents(documents)

# Step 2: 创建向量数据库
embeddings = OpenAIEmbeddings()
vectorstore = Chroma.from_documents(chunks, embeddings)

# Step 3: 创建问答链
llm = OpenAI(temperature=0)
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="retrieve",  # 检索增强模式
    retriever=vectorstore.as_retriever()
)

# Step 4: 提问
response = qa_chain.run("公司的请假政策是什么？")
print(response)
```

### 5.2 执行流程可视化

```
你问: "公司请假政策是什么？"
       │
       ▼
┌─────────────────────┐
│  向量数据库检索      │  找到 3 个相关片段
│  (最相似的内容)      │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  LLM 接收:          │
│  - 你的问题          │
│  - 检索到的 3 个片段  │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  LLM 生成最终答案    │  "公司每年提供 12 天带薪年假..."
└─────────────────────┘
```

---

## 六、为什么这个方向重要？

1. **降低数据使用门槛**：不会写 SQL 的普通员工也能查数据
2. **提高信息检索准确率**：RAG 让 LLM 的回答基于真实数据，减少幻觉
3. **优化数据库性能**：ML 模型可能比传统算法更快更准
4. **开启新的研究范式**：数据库和 AI 的边界正在模糊

---

## 七、学习路线建议

| 阶段 | 学习内容 | 目标 |
|------|---------|------|
| 入门 | SQL 基础 + Python 基础 | 能写简单查询 |
| 进阶 | LLM API 调用 + Embedding | 能做简单 RAG |
| 深入 | Text-to-SQL 模型 + 向量数据库 | 能搭建完整系统 |
| 研究 | 阅读 Survey 论文 | 理解前沿研究方向 |

---

## 八、一句话总结

> **数据库提供"准确的事实"，LLM 提供"自然的理解"。两者结合，让每个人都能用最自然的方式获取数据中最有价值的信息。**
