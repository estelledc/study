---
title: Chroma — 嵌入式向量数据库
来源: https://github.com/chroma-core/chroma
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

# Chroma — 嵌入式向量数据库

## 什么是向量？先从图书馆说起

想象你去图书馆找书。传统数据库就像图书管理员，你告诉 TA"我要 ISBN 为 978-7-111 的书"，TA 精确找到那一本。这叫"精确匹配"。

但很多时候你要的不是精确匹配，而是"相似的东西"。比如你想找一本"跟《三体》风格类似的小说"，你没法给出一个精确编号。

向量（vector）就是为了解决这个问题。把一段文字变成一串数字（比如 384 个浮点数），这串数字就是这段文字的"指纹"。内容相似的文字，指纹也很接近。

Chroma 就是一个让你能轻松存这些指纹、并根据相似度快速找到相近指纹的数据库。它是开源的，Apache 2.0 协议，用 Python 写的，也支持 TypeScript 和 Rust 客户端。

## 核心概念

**Collection（集合）**：Chroma 的基本存储单位，类似传统数据库里的"表"。每个集合里存着一批文档及其对应的向量（embedding）。

**Embedding（嵌入）**：把文字转成数字向量的过程。Chroma 内置了默认的 embedding 函数（基于 sentence-transformers），也可以用 OpenAI、Cohere、HuggingFace 等外部模型。

**Dense Vector Search（稠密向量搜索）**：通过向量相似度来查找最相关的文档。两个向量距离越近，内容越相似。

**Metadata（元数据）**：除了文档本身，还可以为每条记录附加结构化信息（如作者、日期、分类），查询时可以按元数据过滤。

**Query（查询）**：输入一段文字，Chroma 自动将其转为向量，然后返回最相似的 N 条记录。

## 安装与快速上手

```bash
pip install chromadb
```

### 示例一：创建集合、添加文档、语义搜索

这是最基础的用法。Chroma 会自动帮你把文本转为向量并建立索引。

```python
import chromadb

# 1. 创建客户端（内存模式，程序退出后数据消失）
client = chromadb.Client()

# 2. 创建一个集合（如果不存在则创建）
collection = client.get_or_create_collection(name="my_docs")

# 3. 添加文档（每个文档需要一个唯一的 ID）
collection.add(
    ids=["doc1", "doc2", "doc3"],
    documents=[
        "Chroma 是一个面向 AI 应用的嵌入式向量数据库",
        "Python 是一种流行的编程语言，适合初学者入门",
        "机器学习模型可以通过训练从数据中学习规律"
    ]
)

# 4. 语义搜索：问一个跟"编程语言"相关的问题
results = collection.query(
    query_texts=["我想学习一门编程语言"],
    n_results=2  # 返回最相似的 2 条
)

print(results)
# 输出：
# {
#   'ids': [['doc2']],
#   'documents': [['Python 是一种流行的编程语言，适合初学者入门']],
#   'distances': [[0.52]]
# }
```

关键点：你不需要手动调用任何 embedding 函数。Chroma 默认使用 sentence-transformers 模型，在 `add` 和 `query` 时自动完成文本到向量的转换。

### 示例二：带元数据的集合 + 条件过滤

实际场景中，你通常需要给每条记录附加额外信息，比如来源、分类、时间等。

```python
import chromadb
from datetime import datetime

client = chromadb.Client()

# 创建集合时附带元数据描述
collection = client.get_or_create_collection(
    name="articles",
    metadata={
        "description": "技术文章集合",
        "created": str(datetime.now())
    }
)

# 添加带元数据的文档
collection.add(
    ids=["a1", "a2", "a3", "a4"],
    documents=[
        "如何使用 React 构建用户界面",
        "Docker 容器化部署的最佳实践",
        "TypeScript 类型系统的进阶技巧",
        "Kubernetes 集群管理入门指南"
    ],
    metadatas=[
        {"category": "前端", "author": "张三", "date": "2026-01-15"},
        {"category": "运维", "author": "李四", "date": "2026-02-20"},
        {"category": "前端", "author": "王五", "date": "2026-03-10"},
        {"category": "运维", "author": "赵六", "date": "2026-04-05"}
    ]
)

# 搜索"前端框架"相关内容，只返回"前端"分类的结果
results = collection.query(
    query_texts=["前端开发框架对比"],
    n_results=2,
    where={"category": "前端"}  # 按元数据过滤
)

for id, doc, meta in zip(results["ids"][0], results["documents"][0], results["metadatas"][0]):
    print(f"ID: {id}")
    print(f"  内容: {doc}")
    print(f"  作者: {meta['author']}")
    print(f"  日期: {meta['date']}")
    print()
# 输出：
# ID: a1
#   内容: 如何使用 React 构建用户界面
#   作者: 张三
#   日期: 2026-01-15
#
# ID: a3
#   内容: TypeScript 类型系统的进阶技巧
#   作者: 王五
#   日期: 2026-03-10
```

这里 `where={"category": "前端"}` 实现了元数据过滤。Chroma 支持多种过滤操作符：`$eq`、`$ne`、`$gt`、`$gte`、`$lt`、`$lte`、`$in`、`$nin`。

### 示例三：持久化存储

内存模式的数据在程序退出后会丢失。如果要持久保存，用 PersistentClient：

```python
import chromadb

# 数据会保存到磁盘上的 ./chroma_db 目录
client = chromadb.PersistentClient(path="./chroma_db")

collection = client.get_or_create_collection(name="persistent_docs")

collection.add(
    ids=["p1"],
    documents=["这是一条会被持久保存的记录"]
)

# 即使重启程序，数据依然存在
same_collection = client.get_collection(name="persistent_docs")
result = same_collection.get(ids=["p1"])
print(result["documents"])  # ['这是一条会被持久保存的记录']
```

## Chroma 能做什么

- **语义搜索**：不依赖关键词匹配，理解内容的含义
- **RAG（检索增强生成）**：为 LLM 提供上下文数据，减少幻觉
- **去重检测**：找出内容高度相似的文档
- **推荐系统**：基于向量相似度做内容推荐
- **多模态检索**：支持文本、图像等多种类型的嵌入

## 运行模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 内存模式 | `chromadb.Client()`，数据存在内存中 | 测试、快速原型 |
| 持久化模式 | `chromadb.PersistentClient(path="...")` | 本地应用 |
| 客户端-服务器模式 | 启动 Chroma Server，通过 HTTP 访问 | 生产环境、多进程共享 |
| Chroma Cloud | 托管服务，零运维 | 云端生产环境 |

## 小结

Chroma 的核心价值在于：它把"把文字变成数字向量并做相似度搜索"这件事做到了极简。对于刚接触 AI 基础设施的学习者来说，它是理解 embedding、向量搜索、语义检索这些概念的绝佳入口。

下一步可以探索的方向：自定义 embedding 模型、结合 LangChain 做 RAG、使用 Chroma Cloud 部署到线上。
